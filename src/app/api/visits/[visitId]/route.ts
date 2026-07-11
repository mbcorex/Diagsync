import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { OrderStatus, PaymentEntryType, PaymentStatus, Priority, Role, Sex } from "@prisma/client";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit";
import { assignTasksForVisit } from "@/lib/routing-engine";
import { canUseCardiology, canUseRadiology } from "@/lib/billing-access";
import { requireOrganizationCoreAccess } from "@/lib/billing-service";

export const dynamic = "force-dynamic";

const updateVisitSchema = z.object({
  patient: z.object({
    patientId: z.string().trim().min(1, "Patient number is required"),
    fullName: z.string().min(2, "Patient full name is required"),
    age: z.number().int().min(0).max(150).optional(),
    sex: z.nativeEnum(Sex),
    phone: z.string().min(7, "Phone number is required").optional(),
    email: z.string().email().optional().or(z.literal("")),
    address: z.string().optional(),
    dateOfBirth: z.string().optional(),
    referringDoctor: z.string().optional(),
    clinicalNote: z.string().optional(),
  }),
  visit: z.object({
    priority: z.nativeEnum(Priority),
    amountPaid: z.number().min(0),
    discount: z.number().min(0),
    paymentMethod: z.string().optional(),
    notes: z.string().optional(),
  }),
  tests: z
    .array(
      z.object({
        testId: z.string().min(1),
        price: z.number().min(0, "Test price cannot be negative"),
      })
    )
    .min(1, "At least one test is required"),
});

const NON_REMOVABLE_ORDER_STATUSES = new Set<OrderStatus>([
  OrderStatus.SUBMITTED_FOR_REVIEW,
  OrderStatus.EDIT_REQUESTED,
  OrderStatus.RESUBMITTED,
  OrderStatus.APPROVED,
  OrderStatus.RELEASED,
]);

function computePaymentStatus(totalAmount: number, amountPaid: number): PaymentStatus {
  if (totalAmount <= 0) return PaymentStatus.PAID;
  if (amountPaid >= totalAmount) return PaymentStatus.PAID;
  if (amountPaid > 0) return PaymentStatus.PARTIAL;
  return PaymentStatus.PENDING;
}

function isCardiologyToken(value: string) {
  return /(cardio|ecg|ekg|echo|echocardi|troponin|ck-mb)/i.test(value);
}

// GET /api/visits/[visitId]
export async function GET(
  req: NextRequest,
  { params }: { params: { visitId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const user = session.user as any;

    const visit = await prisma.visit.findFirst({
      where: { id: params.visitId, organizationId: user.organizationId },
      include: {
        patient: true,
        testOrders: {
          include: {
            test: {
              include: {
                category: { select: { name: true } },
                resultFields: { orderBy: { sortOrder: "asc" } },
              },
            },
          },
          orderBy: { registeredAt: "asc" },
        },
      },
    });

    if (!visit) {
      return NextResponse.json({ success: false, error: "Visit not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: visit });
  } catch (error) {
    if (error instanceof Error && error.message === "BILLING_LOCKED") {
      return NextResponse.json(
        { success: false, error: "Billing access required. Please choose or renew a plan." },
        { status: 403 }
      );
    }
    console.error("[VISIT_GET]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// PATCH /api/visits/[visitId]
export async function PATCH(
  req: NextRequest,
  { params }: { params: { visitId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const user = session.user as any;
    await requireOrganizationCoreAccess(user.organizationId);
    const { organization } = await requireOrganizationCoreAccess(user.organizationId);
    if (!["RECEPTIONIST", "SUPER_ADMIN", "HRM"].includes(user.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const parsed = updateVisitSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.errors[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    const data = parsed.data;

    const uniqueTestIds = new Set(data.tests.map((row) => row.testId));
    if (uniqueTestIds.size !== data.tests.length) {
      return NextResponse.json({ success: false, error: "Duplicate tests are not allowed" }, { status: 400 });
    }

    const [visit, tests] = await Promise.all([
      prisma.visit.findFirst({
        where: { id: params.visitId, organizationId: user.organizationId },
        include: {
          patient: true,
          testOrders: {
            include: {
              test: { select: { id: true, name: true, price: true } },
            },
          },
        },
      }),
      prisma.diagnosticTest.findMany({
        where: {
          id: { in: Array.from(uniqueTestIds) },
          organizationId: user.organizationId,
          isActive: true,
        },
        select: { id: true, name: true, code: true, description: true, department: true, price: true },
      }),
    ]);

    if (!visit) {
      return NextResponse.json({ success: false, error: "Visit not found" }, { status: 404 });
    }

    const nextPatientNumber = data.patient.patientId.trim();
    const duplicatePatient = await prisma.patient.findFirst({
      where: {
        organizationId: user.organizationId,
        patientId: { equals: nextPatientNumber, mode: "insensitive" },
        id: { not: visit.patientId },
      },
      select: { id: true },
    });
    if (duplicatePatient) {
      return NextResponse.json(
        { success: false, error: "Patient number already exists in this organization" },
        { status: 409 }
      );
    }

    if (tests.length !== uniqueTestIds.size) {
      return NextResponse.json({ success: false, error: "One or more selected tests were not found" }, { status: 400 });
    }
    if (!canUseRadiology(organization) && tests.some((test) => test.department === "RADIOLOGY")) {
      return NextResponse.json(
        { success: false, error: "Radiology tests are available on Trial or Advanced plan." },
        { status: 403 }
      );
    }
    if (
      !canUseCardiology(organization) &&
      tests.some((test) => isCardiologyToken(`${test.name} ${test.code} ${test.description ?? ""}`))
    ) {
      return NextResponse.json(
        { success: false, error: "Cardiology tests are available on Trial or Advanced plan." },
        { status: 403 }
      );
    }

    const testMap = new Map(tests.map((row) => [row.id, row]));
    const priceMap = new Map(data.tests.map((row) => [row.testId, row.price]));
    const subtotal = data.tests.reduce((sum, row) => sum + row.price, 0);
    const totalAmount = Math.max(0, subtotal - data.visit.discount);
    const paymentStatus = computePaymentStatus(totalAmount, data.visit.amountPaid);

    const existingByTestId = new Map(visit.testOrders.map((row) => [row.testId, row]));
    const requestedTestIds = new Set(data.tests.map((row) => row.testId));
    const removedOrders = visit.testOrders.filter((row) => !requestedTestIds.has(row.testId));
    const blockedOrders = removedOrders.filter((row) => NON_REMOVABLE_ORDER_STATUSES.has(row.status));
    if (blockedOrders.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Some tests cannot be removed because results were already submitted to MD review.",
          data: {
            blockedTests: blockedOrders.map((row) => ({ testName: row.test.name, status: row.status })),
          },
        },
        { status: 409 }
      );
    }

    const keptOrders = visit.testOrders.filter((row) => requestedTestIds.has(row.testId));
    const addedTestIds = Array.from(requestedTestIds).filter((testId) => !existingByTestId.has(testId));
    const removedOrderIds = removedOrders.map((row) => row.id);
    const oldAmountPaid = Number(visit.amountPaid);
    const paymentDelta = data.visit.amountPaid - oldAmountPaid;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.patient.update({
        where: { id: visit.patientId },
        data: {
          patientId: nextPatientNumber,
          fullName: data.patient.fullName.trim(),
          age: data.patient.age ?? 0,
          sex: data.patient.sex,
          phone: data.patient.phone?.trim() || "",
          email: data.patient.email?.trim() || null,
          address: data.patient.address?.trim() || null,
          dateOfBirth: data.patient.dateOfBirth ? new Date(data.patient.dateOfBirth) : null,
          referringDoctor: data.patient.referringDoctor?.trim() || null,
          clinicalNote: data.patient.clinicalNote?.trim() || null,
        },
      });

      for (const order of keptOrders) {
        const requestedPrice = priceMap.get(order.testId) ?? 0;
        const defaultPrice = Number(order.test.price ?? 0);
        await tx.testOrder.update({
          where: { id: order.id },
          data: {
            price: requestedPrice,
            defaultPrice,
            ...(Math.abs(requestedPrice - defaultPrice) > 0.0001
              ? {
                  priceOverriddenById: user.id,
                  priceOverrideReason: "Reception pricing override during visit edit",
                }
              : {
                  priceOverriddenById: null,
                  priceOverrideReason: null,
                }),
          },
        });
      }

      if (addedTestIds.length > 0) {
        await tx.testOrder.createMany({
          data: addedTestIds.map((testId) => {
            const basePrice = Number(testMap.get(testId)?.price ?? 0);
            const enteredPrice = priceMap.get(testId) ?? 0;
            return {
              visitId: visit.id,
              testId,
              organizationId: user.organizationId,
              status: OrderStatus.REGISTERED,
              defaultPrice: basePrice,
              price: enteredPrice,
              ...(Math.abs(enteredPrice - basePrice) > 0.0001
                ? {
                    priceOverriddenById: user.id,
                    priceOverrideReason: "Reception pricing override while adding tests to existing visit",
                  }
                : {}),
            };
          }),
        });
      }

      if (removedOrderIds.length > 0) {
        const affectedTasks = await tx.routingTask.findMany({
          where: {
            organizationId: user.organizationId,
            visitId: visit.id,
            testOrderIds: { hasSome: removedOrderIds },
          },
          select: { id: true, testOrderIds: true },
        });

        for (const task of affectedTasks) {
          const remaining = task.testOrderIds.filter((id) => !removedOrderIds.includes(id));
          if (remaining.length === 0) {
            await tx.routingTask.delete({ where: { id: task.id } });
          } else {
            await tx.routingTask.update({
              where: { id: task.id },
              data: { testOrderIds: remaining },
            });
          }
        }

        await tx.testOrder.deleteMany({
          where: {
            id: { in: removedOrderIds },
            organizationId: user.organizationId,
            visitId: visit.id,
          },
        });
      }

      await tx.visit.update({
        where: { id: visit.id },
        data: {
          priority: data.visit.priority,
          discount: data.visit.discount,
          totalAmount,
          amountPaid: data.visit.amountPaid,
          paymentMethod: data.visit.paymentMethod?.trim() || null,
          notes: data.visit.notes?.trim() || null,
          paymentStatus,
        },
      });

      if (Math.abs(paymentDelta) > 0.0001) {
        await tx.visitPayment.create({
          data: {
            organizationId: user.organizationId,
            visitId: visit.id,
            recordedById: user.id,
            amount: Math.abs(paymentDelta),
            paymentType: paymentDelta > 0 ? PaymentEntryType.PAYMENT : PaymentEntryType.ADJUSTMENT,
            paymentMethod: data.visit.paymentMethod?.trim() || null,
            notes:
              paymentDelta > 0
                ? "Additional payment recorded from receptionist edit page"
                : "Payment adjustment recorded from receptionist edit page",
          },
        });
      }

      return {
        addedTestIds,
        removedOrderIds,
      };
    });

    let routing: Awaited<ReturnType<typeof assignTasksForVisit>> = [];
    let routingWarning: string | null = null;
    try {
      routing = await assignTasksForVisit(visit.id, {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.role as Role,
      });
    } catch (routingError) {
      console.error("[VISIT_PATCH_ROUTE]", routingError);
      routingWarning = "Visit updated, but auto-routing for new tests failed. You can reroute this visit manually.";
    }

    await createAuditLog({
      actorId: user.id,
      actorRole: user.role as Role,
      action: AUDIT_ACTIONS.PATIENT_UPDATED,
      entityType: "Visit",
      entityId: visit.id,
      oldValue: {
        amountPaid: oldAmountPaid,
        paymentStatus: visit.paymentStatus,
        tests: visit.testOrders.map((row) => ({ id: row.testId, name: row.test.name, status: row.status })),
      },
      newValue: {
        amountPaid: data.visit.amountPaid,
        paymentStatus,
        addedTests: updated.addedTestIds
          .map((id) => testMap.get(id)?.name ?? null)
          .filter((name): name is string => Boolean(name)),
        removedTests: removedOrders.map((row) => row.test.name),
      },
      notes: "Receptionist edited patient visit details and test orders",
    });

    return NextResponse.json({
      success: true,
      message: "Patient and visit updated successfully",
      data: {
        visitId: visit.id,
        addedTests: updated.addedTestIds.length,
        removedTests: updated.removedOrderIds.length,
        paymentStatus,
        totalAmount,
        routing,
        routingWarning,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "BILLING_LOCKED") {
      return NextResponse.json(
        { success: false, error: "Billing access required. Please choose or renew a plan." },
        { status: 403 }
      );
    }
    console.error("[VISIT_PATCH]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/visits/[visitId] - delete only one visit and all its linked workflow records
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { visitId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const user = session.user as any;
    await requireOrganizationCoreAccess(user.organizationId);
    if (!["RECEPTIONIST", "SUPER_ADMIN", "HRM"].includes(user.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const visit = await prisma.visit.findFirst({
      where: {
        id: params.visitId,
        organizationId: user.organizationId,
      },
      include: {
        patient: { select: { id: true, patientId: true, fullName: true } },
        routingTasks: { select: { id: true } },
        testOrders: { select: { id: true } },
      },
    });

    if (!visit) {
      return NextResponse.json({ success: false, error: "Visit not found" }, { status: 404 });
    }

    const taskIds = visit.routingTasks.map((task) => task.id);
    const testOrderIds = visit.testOrders.map((order) => order.id);

    let deletedPatient = false;
    await prisma.$transaction(async (tx) => {
      const notificationClauses: Array<Record<string, unknown>> = [
        { entityType: "Visit", entityId: visit.id },
      ];
      if (taskIds.length > 0) {
        notificationClauses.push({ entityType: "RoutingTask", entityId: { in: taskIds } });
      }
      if (testOrderIds.length > 0) {
        notificationClauses.push({ entityType: "TestOrder", entityId: { in: testOrderIds } });
      }

      await tx.notification.deleteMany({
        where: {
          organizationId: user.organizationId,
          OR: notificationClauses,
        },
      });

      const auditClauses: Array<Record<string, unknown>> = [
        { entityType: "Visit", entityId: visit.id },
      ];
      if (taskIds.length > 0) {
        auditClauses.push({ entityType: "RoutingTask", entityId: { in: taskIds } });
      }
      if (testOrderIds.length > 0) {
        auditClauses.push({ entityType: "TestOrder", entityId: { in: testOrderIds } });
      }

      await tx.auditLog.deleteMany({
        where: {
          OR: auditClauses,
        },
      });

      await tx.visit.delete({
        where: { id: visit.id },
      });

      const remainingVisitCount = await tx.visit.count({
        where: {
          organizationId: user.organizationId,
          patientId: visit.patient.id,
        },
      });

      if (remainingVisitCount === 0) {
        await tx.notification.deleteMany({
          where: {
            organizationId: user.organizationId,
            entityType: "Patient",
            entityId: visit.patient.id,
          },
        });
        await tx.auditLog.deleteMany({
          where: {
            entityType: "Patient",
            entityId: visit.patient.id,
          },
        });
        await tx.patient.delete({
          where: { id: visit.patient.id },
        });
        deletedPatient = true;
      }
    });

    await createAuditLog({
      actorId: user.id,
      actorRole: user.role as Role,
      action: "VISIT_DELETED",
      entityType: "Visit",
      entityId: visit.id,
      oldValue: {
        visitId: visit.id,
        patientId: visit.patient.patientId,
        patientName: visit.patient.fullName,
        taskCount: taskIds.length,
        testOrderCount: testOrderIds.length,
      },
      notes: "Visit and all linked workflow records deleted permanently",
    });

    if (deletedPatient) {
      await createAuditLog({
        actorId: user.id,
        actorRole: user.role as Role,
        action: "PATIENT_DELETED",
        entityType: "Patient",
        entityId: visit.patient.id,
        oldValue: {
          patientId: visit.patient.patientId,
          fullName: visit.patient.fullName,
        },
        notes: "Patient removed automatically after deleting last remaining visit",
      });
    }

    return NextResponse.json({
      success: true,
      message: deletedPatient
        ? "Visit deleted permanently. Patient profile was also removed because no visits remain."
        : "Visit deleted permanently",
      data: {
        visitId: visit.id,
        patientId: visit.patient.id,
        patientDeleted: deletedPatient,
        taskCount: taskIds.length,
        testOrderCount: testOrderIds.length,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "BILLING_LOCKED") {
      return NextResponse.json(
        { success: false, error: "Billing access required. Please choose or renew a plan." },
        { status: 403 }
      );
    }
    console.error("[VISIT_DELETE]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

