import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { Role, Sex, Priority, PaymentStatus, PaymentEntryType } from "@prisma/client";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit";
import { assignTasksForVisit } from "@/lib/routing-engine";
import { canUseCardiology, canUseRadiology } from "@/lib/billing-access";
import { requireOrganizationCoreAccess } from "@/lib/billing-service";
import { PAYMENT_METHOD_KEYS, summarizeVisitPaymentMethod } from "@/lib/payment-methods";
import { resolveBackdatedVisitDate } from "@/lib/visit-dating";

export const dynamic = "force-dynamic";

function isCardiologyToken(value: string) {
  return /(cardio|ecg|ekg|echo|echocardi|troponin|ck-mb)/i.test(value);
}

const registerPatientSchema = z.object({
  // Patient details
  patientId: z.string().trim().min(1, "Patient number is required"),
  fullName: z.string().min(2, "Full name required"),
  age: z.number().int().min(0).max(150).optional(),
  sex: z.nativeEnum(Sex),
  phone: z.preprocess((value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }, z.string().min(7, "Phone number required").optional()),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  dateOfBirth: z.string().optional(),
  referringDoctor: z.string().optional(),
  clinicalNote: z.string().optional(),

  // Visit details
  priority: z.nativeEnum(Priority).default(Priority.ROUTINE),
  paymentStatus: z.nativeEnum(PaymentStatus).default(PaymentStatus.PENDING),
  amountPaid: z.number().min(0).default(0),
  discount: z.number().min(0).default(0),
  paymentMethod: z.string().optional(),
  notes: z.string().optional(),
  // Set when the patient was actually seen on an earlier day and is only being entered now.
  // Revenue and the day the patient is listed under follow this date; the tests still route
  // to the lab immediately.
  visitDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Visit date must be in YYYY-MM-DD format")
    .optional(),
  // Registration can already be split across methods (e.g. part cash, part transfer).
  payments: z
    .array(
      z.object({
        amount: z.number().positive("Payment amount must be greater than zero"),
        method: z.enum(PAYMENT_METHOD_KEYS),
        notes: z.string().optional(),
      })
    )
    .max(20)
    .optional(),

  // Test orders
  testIds: z.array(z.string()).min(1, "At least one test is required"),
  testPrices: z
    .array(
      z.object({
        testId: z.string().min(1),
        price: z.number().min(0, "Price cannot be negative"),
      })
    )
    .min(1, "Provide prices for selected tests"),
});

// GET /api/patients — list patients for org
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const user = session.user as any;
    await requireOrganizationCoreAccess(user.organizationId);

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") ?? "";
    const page = parseInt(searchParams.get("page") ?? "1");
    const pageSize = parseInt(searchParams.get("pageSize") ?? "20");
    const today = searchParams.get("today") === "true";

    const where: any = {
      organizationId: user.organizationId,
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: "insensitive" } },
          { patientId: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
        ],
      }),
      ...(today && {
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
          lte: new Date(new Date().setHours(23, 59, 59, 999)),
        },
      }),
    };

    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        include: {
          visits: {
            orderBy: { registeredAt: "desc" },
            take: 1,
            include: {
              testOrders: {
                include: { test: { select: { name: true, type: true, department: true } } },
              },
            },
          },
          registeredBy: { select: { fullName: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.patient.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        items: patients,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "BILLING_LOCKED") {
      return NextResponse.json(
        { success: false, error: "Billing access required. Please choose or renew a plan." },
        { status: 403 }
      );
    }
    console.error("[PATIENTS_GET]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/patients — register new patient + visit + test orders
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const user = session.user as any;
    const { organization } = await requireOrganizationCoreAccess(user.organizationId);

    if (!["RECEPTIONIST", "SUPER_ADMIN", "HRM"].includes(user.role)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = registerPatientSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const patientNumber = data.patientId.trim();

    const existingPatient = await prisma.patient.findFirst({
      where: {
        organizationId: user.organizationId,
        patientId: { equals: patientNumber, mode: "insensitive" },
      },
      select: {
        id: true,
        _count: { select: { visits: true } },
      },
    });
    if (existingPatient) {
      // Historical cleanup: reclaim patient numbers left behind by older "delete visit" flows.
      if (existingPatient._count.visits === 0) {
        await prisma.$transaction(async (tx) => {
          await tx.notification.deleteMany({
            where: {
              organizationId: user.organizationId,
              entityType: "Patient",
              entityId: existingPatient.id,
            },
          });
          await tx.auditLog.deleteMany({
            where: {
              entityType: "Patient",
              entityId: existingPatient.id,
            },
          });
          await tx.patient.delete({ where: { id: existingPatient.id } });
        });
      } else {
        return NextResponse.json(
          { success: false, error: "Patient number already exists in this organization" },
          { status: 409 }
        );
      }
    }

    const duplicateAfterCleanup = await prisma.patient.findFirst({
      where: {
        organizationId: user.organizationId,
        patientId: { equals: patientNumber, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (duplicateAfterCleanup) {
      return NextResponse.json(
        { success: false, error: "Patient number already exists in this organization" },
        { status: 409 }
      );
    }

    // Fetch tests to get prices
    const tests = await prisma.diagnosticTest.findMany({
      where: {
        id: { in: data.testIds },
        organizationId: user.organizationId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        department: true,
        price: true,
      },
    });

    if (tests.length !== data.testIds.length) {
      return NextResponse.json(
        { success: false, error: "One or more tests not found or inactive" },
        { status: 400 }
      );
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

    const submittedPrices = new Map(data.testPrices.map((item) => [item.testId, item.price]));
    const uniquePriceKeys = new Set(data.testPrices.map((item) => item.testId));
    if (uniquePriceKeys.size !== data.testPrices.length) {
      return NextResponse.json(
        { success: false, error: "Duplicate test prices submitted" },
        { status: 400 }
      );
    }
    if (submittedPrices.size !== data.testIds.length || data.testIds.some((testId) => !submittedPrices.has(testId))) {
      return NextResponse.json(
        { success: false, error: "Please provide a price for each selected test" },
        { status: 400 }
      );
    }

    // Calculate totals from receptionist-entered prices
    const subtotal = data.testIds.reduce((sum, testId) => sum + (submittedPrices.get(testId) ?? 0), 0);
    const totalAmount = Math.max(0, subtotal - data.discount);

    let backdatedAt: Date | null = null;
    if (data.visitDate) {
      const resolved = resolveBackdatedVisitDate(data.visitDate);
      if (!resolved.ok) {
        return NextResponse.json({ success: false, error: resolved.error }, { status: 400 });
      }
      backdatedAt = resolved.date;
    }

    const payments = data.payments ?? [];
    const itemisedPaid = payments.reduce((sum, entry) => sum + entry.amount, 0);
    const amountPaid = payments.length > 0 ? itemisedPaid : data.amountPaid;
    const visitPaymentMethod =
      payments.length > 0
        ? summarizeVisitPaymentMethod(payments.map((entry) => entry.method))
        : data.paymentMethod || null;

    const result = await prisma.$transaction(async (tx) => {
      const orgAbbr = user.organizationId.slice(0, 3).toUpperCase();

      // Create patient
      const patient = await tx.patient.create({
        data: {
          organizationId: user.organizationId,
          patientId: patientNumber,
          fullName: data.fullName,
          age: data.age ?? 0,
          sex: data.sex,
          phone: data.phone ?? "",
          email: data.email || null,
          address: data.address || null,
          dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
          referringDoctor: data.referringDoctor || null,
          clinicalNote: data.clinicalNote || null,
          registeredById: user.id,
          ...(backdatedAt ? { createdAt: backdatedAt } : {}),
        },
      });

      // Create visit
      const visitCount = await tx.visit.count({
        where: { organizationId: user.organizationId },
      });
      const visitNumber = `V-${orgAbbr}-${String(visitCount + 1).padStart(5, "0")}`;

      const visit = await tx.visit.create({
        data: {
          patientId: patient.id,
          organizationId: user.organizationId,
          visitNumber,
          priority: data.priority,
          paymentStatus: data.paymentStatus,
          totalAmount,
          amountPaid,
          discount: data.discount,
          paymentMethod: visitPaymentMethod,
          notes: data.notes || null,
          ...(backdatedAt ? { registeredAt: backdatedAt } : {}),
        },
      });

      // Create test orders
      const testOrders = await Promise.all(
        tests.map((test) =>
          tx.testOrder.create({
            data: {
              visitId: visit.id,
              testId: test.id,
              organizationId: user.organizationId,
              status: "REGISTERED",
              defaultPrice: Number(test.price ?? 0),
              price: submittedPrices.get(test.id) ?? 0,
              // Revenue is attributed to the day the patient was seen; the workflow
              // timestamps (assignedAt, completedAt, ...) stay on real time.
              ...(backdatedAt ? { registeredAt: backdatedAt } : {}),
              ...(Math.abs((submittedPrices.get(test.id) ?? 0) - Number(test.price ?? 0)) > 0.0001
                ? {
                    priceOverriddenById: user.id,
                    priceOverrideReason: "Reception pricing override during registration",
                  }
                : {}),
            },
          })
        )
      );

      if (payments.length > 0) {
        for (const entry of payments) {
          await tx.visitPayment.create({
            data: {
              organizationId: user.organizationId,
              visitId: visit.id,
              recordedById: user.id,
              amount: entry.amount,
              paymentType: PaymentEntryType.PAYMENT,
              paymentMethod: entry.method,
              notes: entry.notes?.trim() || "Payment at registration",
              ...(backdatedAt ? { createdAt: backdatedAt } : {}),
            },
          });
        }
      } else if (amountPaid > 0) {
        await tx.visitPayment.create({
          data: {
            organizationId: user.organizationId,
            visitId: visit.id,
            recordedById: user.id,
            amount: amountPaid,
            paymentType: PaymentEntryType.PAYMENT,
            paymentMethod: visitPaymentMethod,
            notes: "Initial payment at registration",
            ...(backdatedAt ? { createdAt: backdatedAt } : {}),
          },
        });
      }

      return { patient, visit, testOrders };
    });

    let routing: Awaited<ReturnType<typeof assignTasksForVisit>> = [];
    let routingWarning: string | null = null;
    try {
      routing = await assignTasksForVisit(result.visit.id, {
        organizationId: user.organizationId,
        actorId: user.id,
        actorRole: user.role as Role,
      });
    } catch (routingError) {
      console.error("[PATIENTS_POST_ROUTE]", routingError);
      routingWarning = "Patient was registered, but auto-routing failed. You can route this visit manually.";
    }

    // Audit log
    await createAuditLog({
      actorId: user.id,
      actorRole: user.role as Role,
      action: AUDIT_ACTIONS.PATIENT_REGISTERED ?? "PATIENT_REGISTERED",
      entityType: "Patient",
      entityId: result.patient.id,
      newValue: {
        patientId: result.patient.patientId,
        fullName: result.patient.fullName,
        visitNumber: result.visit.visitNumber,
        tests: tests.map((t) => t.name),
        totalAmount,
        amountPaid,
        paymentMethod: visitPaymentMethod,
        ...(backdatedAt ? { backdatedTo: backdatedAt.toISOString() } : {}),
      },
      ...(backdatedAt
        ? { notes: `Registered as a backdated visit for ${data.visitDate}` }
        : {}),
    });

    return NextResponse.json(
      {
        success: true,
        message: "Patient registered successfully",
        data: {
          patientId: result.patient.patientId,
          patientDbId: result.patient.id,
          visitId: result.visit.id,
          visitNumber: result.visit.visitNumber,
          testOrderIds: result.testOrders.map((o) => o.id),
          totalAmount,
          amountPaid,
          visitDate: (backdatedAt ?? result.visit.registeredAt).toISOString(),
          backdated: Boolean(backdatedAt),
          routing,
          routingWarning,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "BILLING_LOCKED") {
      return NextResponse.json(
        { success: false, error: "Billing access required. Please choose or renew a plan." },
        { status: 403 }
      );
    }
    console.error("[PATIENTS_POST]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}


