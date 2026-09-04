import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit";
import type { AuditMeta } from "@/lib/audit-core";
import { requireOrganizationCoreAccess } from "@/lib/billing-service";
import { notifyMdResultSubmitted } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import {
  Department,
  OrderStatus,
  Prisma,
  Role,
  RoutingTaskStatus,
  SampleStatus,
} from "@prisma/client";
import {
  canModifyAssignedTask,
  canStartTask,
  canSubmitTask,
  hasResultsForAllTests,
  applySharedSensitivity,
  sampleStatusToOrderStage,
  sortByPriorityAndTime,
} from "./lab-workflow-core";
import { computeAbnormalFlags } from "./reference-ranges";
import { applyTestUsageForTaskInTx } from "./inventory";

export type LabActor = {
  id: string;
  role: string;
  organizationId: string;
  auditMeta?: AuditMeta;
};

export type SaveResultInput = {
  testOrderId: string;
  resultData: Prisma.InputJsonValue;
  notes?: string;
};

function assertLabScientist(actor: LabActor) {
  if (actor.role !== "LAB_SCIENTIST") {
    throw new Error("FORBIDDEN_ROLE");
  }
}

async function assertLabCoreAccess(actor: LabActor) {
  await requireOrganizationCoreAccess(actor.organizationId);
}

async function assertTaskOwnership(taskId: string, actor: LabActor) {
  let task = await prisma.routingTask.findFirst({
    where: {
      id: taskId,
      organizationId: actor.organizationId,
      department: Department.LABORATORY,
    },
    include: {
      visit: { include: { patient: true } },
      staff: { select: { id: true, fullName: true } },
    },
  });

  if (!task) throw new Error("TASK_NOT_FOUND");

  if (
    !task.staffId &&
    (task.status === RoutingTaskStatus.PENDING || task.status === RoutingTaskStatus.IN_PROGRESS)
  ) {
    await prisma.routingTask.updateMany({
      where: {
        id: task.id,
        organizationId: actor.organizationId,
        department: Department.LABORATORY,
        staffId: null,
        status: { in: [RoutingTaskStatus.PENDING, RoutingTaskStatus.IN_PROGRESS] },
      },
      data: { staffId: actor.id },
    });
    task = await prisma.routingTask.findFirst({
      where: {
        id: taskId,
        organizationId: actor.organizationId,
        department: Department.LABORATORY,
      },
      include: {
        visit: { include: { patient: true } },
        staff: { select: { id: true, fullName: true } },
      },
    });
    if (!task) throw new Error("TASK_NOT_FOUND");
  }
  if (
    task.staffId !== actor.id &&
    (task.status === RoutingTaskStatus.PENDING || task.status === RoutingTaskStatus.IN_PROGRESS)
  ) {
    await prisma.routingTask.updateMany({
      where: {
        id: task.id,
        organizationId: actor.organizationId,
        department: Department.LABORATORY,
        status: { in: [RoutingTaskStatus.PENDING, RoutingTaskStatus.IN_PROGRESS] },
      },
      data: { staffId: actor.id },
    });
    task = await prisma.routingTask.findFirst({
      where: {
        id: taskId,
        organizationId: actor.organizationId,
        department: Department.LABORATORY,
      },
      include: {
        visit: { include: { patient: true } },
        staff: { select: { id: true, fullName: true } },
      },
    });
    if (!task) throw new Error("TASK_NOT_FOUND");
  }

  if (
    !canModifyAssignedTask({
      userRole: actor.role,
      userId: actor.id,
      assignedStaffId: task.staffId,
    })
  ) {
    throw new Error("FORBIDDEN_TASK");
  }

  return task;
}

export async function getLabTasks(actor: LabActor, opts?: {
  status?: RoutingTaskStatus | "ALL" | "ACTIVE";
  sort?: "newest" | "oldest";
  search?: string;
  date?: string;
}) {
  assertLabScientist(actor);
  await assertLabCoreAccess(actor);
  const search = opts?.search?.trim() ?? "";
  const hasDateFilter = Boolean(opts?.date && /^\d{4}-\d{2}-\d{2}$/.test(opts.date));
  const dateRange = hasDateFilter
    ? (() => {
        const [y, m, d] = String(opts?.date).split("-").map((value) => Number(value));
        return {
          gte: new Date(y, m - 1, d, 0, 0, 0, 0),
          lte: new Date(y, m - 1, d, 23, 59, 59, 999),
        };
      })()
    : null;

  const rows = await prisma.routingTask.findMany({
    where: {
      organizationId: actor.organizationId,
      department: Department.LABORATORY,
      ...(search
        ? {
            visit: {
              patient: {
                OR: [
                  { fullName: { contains: search, mode: "insensitive" } },
                  { patientId: { contains: search, mode: "insensitive" } },
                ],
              },
            },
          }
        : {}),
      ...(dateRange ? { createdAt: dateRange } : {}),
      ...(opts?.status === "ACTIVE"
        ? { status: { in: [RoutingTaskStatus.PENDING, RoutingTaskStatus.IN_PROGRESS] } }
        : opts?.status && opts.status !== "ALL"
        ? { status: opts.status }
        : {}),
    },
    include: {
      visit: {
        select: {
          id: true,
          visitNumber: true,
          patient: {
            select: {
              fullName: true,
              patientId: true,
              age: true,
              dateOfBirth: true,
              sex: true,
            },
          },
        },
      },
      sample: true,
      review: {
        select: {
          rejectionReason: true,
          editedData: true,
        },
      },
      staff: { select: { id: true, fullName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 80,
  });

  const allOrderIds = Array.from(new Set(rows.flatMap((task) => task.testOrderIds)));
  const testOrders = allOrderIds.length
    ? await prisma.testOrder.findMany({
        where: { id: { in: allOrderIds }, organizationId: actor.organizationId },
        select: {
          id: true,
          createdAt: true,
          status: true,
          test: {
            select: {
              id: true,
              name: true,
              code: true,
              sampleType: true,
              resultFields: {
                orderBy: { sortOrder: "asc" },
                select: {
                  id: true,
                  fieldKey: true,
                  label: true,
                  fieldType: true,
                  options: true,
                  unit: true,
                  normalMin: true,
                  normalMax: true,
                  normalText: true,
                  referenceNote: true,
                  isRequired: true,
                },
              },
            },
          },
          labResults: {
            select: {
              id: true,
              resultData: true,
              notes: true,
              isSubmitted: true,
            },
          },
        },
      })
    : [];

  const orderMap = new Map(testOrders.map((o) => [o.id, o]));
  const merged = rows.map((task) => ({
    ...task,
    testOrders: task.testOrderIds
      .map((id) => orderMap.get(id))
      .filter((order): order is (typeof testOrders)[number] => Boolean(order))
      .map((order) => ({
        ...order,
        labResults: order.labResults.map((result) => ({
          ...result,
          abnormalFlags: computeAbnormalFlags(
            order.test.resultFields.map((field) => ({
              fieldKey: field.fieldKey,
              fieldType: field.fieldType,
              normalMin: field.normalMin,
              normalMax: field.normalMax,
              normalText: (field as any).normalText ?? null,
              referenceNote: (field as any).referenceNote ?? null,
            })),
            (result.resultData ?? {}) as Record<string, unknown>,
            { sex: task.visit.patient.sex, age: task.visit.patient.age }
          ),
        })),
      })),
  }));

  return sortByPriorityAndTime(merged as any, opts?.sort === "oldest" ? "asc" : "desc");
}

export async function startLabTask(taskId: string, actor: LabActor) {
  assertLabScientist(actor);
  await assertLabCoreAccess(actor);
  const task = await prisma.routingTask.findFirst({
    where: {
      id: taskId,
      organizationId: actor.organizationId,
      department: Department.LABORATORY,
    },
    include: {
      visit: { include: { patient: true } },
    },
  });

  if (!task) throw new Error("TASK_NOT_FOUND");
  if (!canStartTask(task.status)) throw new Error("INVALID_TASK_STATE");
  if (task.status === RoutingTaskStatus.IN_PROGRESS) {
    if (task.staffId === actor.id) return;
    if (!task.staffId) {
      const claimed = await prisma.routingTask.updateMany({
        where: {
          id: task.id,
          organizationId: actor.organizationId,
          department: Department.LABORATORY,
          status: RoutingTaskStatus.IN_PROGRESS,
          staffId: null,
        },
        data: { staffId: actor.id },
      });
      if (claimed.count > 0) return;
    }
    throw new Error("TASK_ALREADY_CLAIMED");
  }

  const now = new Date();
  let startedNow = false;
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.routingTask.updateMany({
      where: {
        id: task.id,
        organizationId: actor.organizationId,
        department: Department.LABORATORY,
        status: RoutingTaskStatus.PENDING,
      },
      data: { status: RoutingTaskStatus.IN_PROGRESS, staffId: actor.id },
    });
    if (claimed.count === 0) {
      const latest = await tx.routingTask.findFirst({
        where: {
          id: task.id,
          organizationId: actor.organizationId,
          department: Department.LABORATORY,
        },
        select: { status: true, staffId: true },
      });
      if (latest?.status === RoutingTaskStatus.IN_PROGRESS && latest.staffId === actor.id) {
        return;
      }
      throw new Error("TASK_ALREADY_CLAIMED");
    }
    startedNow = true;

    await tx.testOrder.updateMany({
      where: {
        id: { in: task.testOrderIds },
        organizationId: actor.organizationId,
        status: { in: [OrderStatus.ASSIGNED, OrderStatus.REGISTERED] },
      },
      data: { status: OrderStatus.OPENED, assignedToId: actor.id },
    });
    await tx.testOrder.updateMany({
      where: {
        id: { in: task.testOrderIds },
        organizationId: actor.organizationId,
        openedAt: null,
      },
      data: { openedAt: now },
    });
  });

  if (!startedNow) return;

  await createAuditLog({
    actorId: actor.id,
    actorRole: Role.LAB_SCIENTIST,
    action: AUDIT_ACTIONS.TEST_STARTED,
    entityType: "RoutingTask",
    entityId: task.id,
    notes: "Lab task started",
    ...actor.auditMeta,
  });
}

export async function updateSampleForLabTask(
  taskId: string,
  actor: LabActor,
  sampleStatus: SampleStatus,
  notes?: string
) {
  assertLabScientist(actor);
  await assertLabCoreAccess(actor);
  const task = await assertTaskOwnership(taskId, actor);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.labSample.upsert({
      where: { taskId: task.id },
      create: {
        taskId: task.id,
        organizationId: actor.organizationId,
        visitId: task.visitId,
        staffId: actor.id,
        status: sampleStatus,
        notes,
        collectedAt: sampleStatus === SampleStatus.COLLECTED ? now : undefined,
        receivedAt: sampleStatus === SampleStatus.RECEIVED ? now : undefined,
        processingAt: sampleStatus === SampleStatus.PROCESSING ? now : undefined,
        completedAt: sampleStatus === SampleStatus.DONE ? now : undefined,
      },
      update: {
        status: sampleStatus,
        notes,
        collectedAt: sampleStatus === SampleStatus.COLLECTED ? now : undefined,
        receivedAt: sampleStatus === SampleStatus.RECEIVED ? now : undefined,
        processingAt: sampleStatus === SampleStatus.PROCESSING ? now : undefined,
        completedAt: sampleStatus === SampleStatus.DONE ? now : undefined,
      },
    });

    const orderStatus = sampleStatusToOrderStage(sampleStatus);
    if (orderStatus) {
      await tx.testOrder.updateMany({
        where: {
          id: { in: task.testOrderIds },
          organizationId: actor.organizationId,
        },
        data: { status: orderStatus as OrderStatus },
      });
      if (sampleStatus === SampleStatus.COLLECTED) {
        await tx.testOrder.updateMany({
          where: {
            id: { in: task.testOrderIds },
            organizationId: actor.organizationId,
            sampleCollectedAt: null,
          },
          data: { sampleCollectedAt: now },
        });
      } else if (sampleStatus === SampleStatus.PROCESSING) {
        await tx.testOrder.updateMany({
          where: {
            id: { in: task.testOrderIds },
            organizationId: actor.organizationId,
            startedAt: null,
          },
          data: { startedAt: now },
        });
      } else if (sampleStatus === SampleStatus.DONE) {
        await tx.testOrder.updateMany({
          where: {
            id: { in: task.testOrderIds },
            organizationId: actor.organizationId,
            completedAt: null,
          },
          data: { completedAt: now },
        });
      }
    }
  });

  await createAuditLog({
    actorId: actor.id,
    actorRole: Role.LAB_SCIENTIST,
    action: AUDIT_ACTIONS.SAMPLE_COLLECTED,
    entityType: "LabSample",
    entityId: task.id,
    notes: `Sample status updated to ${sampleStatus}${notes ? `: ${notes}` : ""}`,
    ...actor.auditMeta,
  });
}

export async function saveLabResults(taskId: string, actor: LabActor, inputs: SaveResultInput[]) {
  assertLabScientist(actor);
  await assertLabCoreAccess(actor);
  const task = await assertTaskOwnership(taskId, actor);
  if (task.status === RoutingTaskStatus.COMPLETED || task.status === RoutingTaskStatus.CANCELLED) {
    throw new Error("TASK_ALREADY_COMPLETED");
  }

  const testOrderIds = new Set(task.testOrderIds);
  for (const input of inputs) {
    if (!testOrderIds.has(input.testOrderId)) {
      throw new Error("INVALID_TEST_ORDER");
    }
  }

  const testOrders = await prisma.testOrder.findMany({
    where: {
      id: { in: Array.from(testOrderIds) },
      organizationId: actor.organizationId,
    },
    include: {
      test: {
        include: {
          resultFields: true,
        },
      },
    },
  });
  const orderFieldMap = new Map(
    testOrders.map((order) => [
      order.id,
      order.test.resultFields.map((field) => ({
        fieldKey: field.fieldKey,
        fieldType: field.fieldType,
        normalMin: field.normalMin,
        normalMax: field.normalMax,
        normalText: (field as any).normalText ?? null,
        referenceNote: (field as any).referenceNote ?? null,
      })),
    ])
  );
  const sensitivityEnabledOrderIds = new Set(
    testOrders
      .filter((order) =>
        order.test.resultFields.some((field) => field.fieldKey.trim().toLowerCase() === "sensitivity")
      )
      .map((order) => order.id)
  );
  const normalizedInputs: Array<SaveResultInput & { resultData: Prisma.InputJsonObject }> = inputs.map((input) => {
    const raw = input.resultData;
    const resultData =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? ({ ...(raw as Record<string, Prisma.InputJsonValue>) } as Prisma.InputJsonObject)
        : ({} as Prisma.InputJsonObject);
    return { ...input, resultData };
  });
  const finalInputs = applySharedSensitivity(normalizedInputs, sensitivityEnabledOrderIds).map((input) => ({
    ...input,
    resultData: input.resultData as Prisma.InputJsonObject,
  }));
  const abnormalSummaries: string[] = [];
  const customFieldSummaries: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const input of finalInputs) {
      const defaultFieldKeys = new Set(
        (orderFieldMap.get(input.testOrderId) ?? []).map((field) => field.fieldKey.toLowerCase())
      );
      const customKeys = Object.keys((input.resultData ?? {}) as Record<string, unknown>).filter(
        (key) => !defaultFieldKeys.has(key.toLowerCase())
      );
      if (customKeys.length > 0) {
        customFieldSummaries.push(`${input.testOrderId}[${customKeys.join(", ")}]`);
      }
      const flags = computeAbnormalFlags(
        orderFieldMap.get(input.testOrderId) ?? [],
        (input.resultData ?? {}) as Record<string, unknown>,
        { sex: task.visit.patient.sex, age: task.visit.patient.age }
      );
      const flagged = Object.entries(flags)
        .filter(([, status]) => status === "LOW" || status === "HIGH" || status === "ABNORMAL")
        .map(([key, status]) => `${key}:${status}`);
      if (flagged.length > 0) {
        abnormalSummaries.push(`${input.testOrderId}[${flagged.join(", ")}]`);
      }

      await tx.labResult.upsert({
        where: {
          taskId_testOrderId: {
            taskId: task.id,
            testOrderId: input.testOrderId,
          },
        },
        create: {
          organizationId: actor.organizationId,
          taskId: task.id,
          testOrderId: input.testOrderId,
          staffId: actor.id,
          resultData: input.resultData,
          notes: input.notes,
        },
        update: {
          resultData: input.resultData,
          notes: input.notes,
        },
      });

    }

    await tx.testOrder.updateMany({
      where: {
        id: { in: finalInputs.map((item) => item.testOrderId) },
        organizationId: actor.organizationId,
        status: {
          notIn: [
            OrderStatus.SUBMITTED_FOR_REVIEW,
            OrderStatus.APPROVED,
            OrderStatus.RELEASED,
            OrderStatus.CANCELLED,
          ],
        },
      },
      data: { status: OrderStatus.RESULT_DRAFTED },
    });

    await tx.routingTask.updateMany({
      where: {
        id: task.id,
        status: { in: [RoutingTaskStatus.PENDING, RoutingTaskStatus.IN_PROGRESS] },
      },
      data: { status: RoutingTaskStatus.IN_PROGRESS },
    });
  });

  await createAuditLog({
    actorId: actor.id,
    actorRole: Role.LAB_SCIENTIST,
    action: AUDIT_ACTIONS.RESULT_DRAFTED,
    entityType: "RoutingTask",
    entityId: task.id,
    notes:
      [
        `Draft results saved for ${finalInputs.length} test(s)`,
        abnormalSummaries.length > 0 ? `System flags: ${abnormalSummaries.join(" | ")}` : null,
        customFieldSummaries.length > 0 ? `Custom fields: ${customFieldSummaries.join(" | ")}` : null,
      ]
        .filter(Boolean)
        .join(". "),
    ...actor.auditMeta,
  });
}

export async function submitLabTask(taskId: string, actor: LabActor) {
  assertLabScientist(actor);
  await assertLabCoreAccess(actor);
  const task = await assertTaskOwnership(taskId, actor);

  if (task.status === RoutingTaskStatus.COMPLETED) {
    return { inventoryWarnings: [] as Array<{ message: string }> };
  }
  if (!canSubmitTask(task.status)) {
    throw new Error("TASK_ALREADY_COMPLETED");
  }

  const existingResults = await prisma.labResult.findMany({
    where: { taskId: task.id, organizationId: actor.organizationId },
    select: { testOrderId: true, isSubmitted: true },
  });

  if (!hasResultsForAllTests(task.testOrderIds, existingResults.map((r) => r.testOrderId))) {
    const existingOrderIds = new Set(existingResults.map((row) => row.testOrderId));
    const missingOrderIds = task.testOrderIds.filter((id) => !existingOrderIds.has(id));
    const missingOrders = missingOrderIds.length
      ? await prisma.testOrder.findMany({
          where: { organizationId: actor.organizationId, id: { in: missingOrderIds } },
          select: { test: { select: { name: true } } },
        })
      : [];
    const missingNames = missingOrders.map((row) => row.test.name).filter(Boolean);
    throw new Error(
      missingNames.length > 0 ? `MISSING_RESULTS:${missingNames.join(", ")}` : "MISSING_RESULTS"
    );
  }

  const now = new Date();
  let inventoryWarnings: Array<{ message: string }> = [];
  await prisma.$transaction(async (tx) => {
    await tx.labResult.updateMany({
      where: { taskId: task.id, organizationId: actor.organizationId },
      data: { staffId: actor.id, isSubmitted: true, submittedAt: now },
    });

    await tx.routingTask.update({
      where: { id: task.id },
      data: { status: RoutingTaskStatus.COMPLETED },
    });

    await tx.testOrder.updateMany({
      where: { id: { in: task.testOrderIds }, organizationId: actor.organizationId },
      data: {
        status: OrderStatus.SUBMITTED_FOR_REVIEW,
        submittedAt: now,
      },
    });
    await tx.testOrder.updateMany({
      where: {
        id: { in: task.testOrderIds },
        organizationId: actor.organizationId,
        completedAt: null,
      },
      data: { completedAt: now },
    });

    inventoryWarnings = await applyTestUsageForTaskInTx({
      tx,
      organizationId: actor.organizationId,
      taskId: task.id,
      performedById: actor.id,
    });
  });

  await createAuditLog({
    actorId: actor.id,
    actorRole: Role.LAB_SCIENTIST,
    action: AUDIT_ACTIONS.RESULT_SUBMITTED,
    entityType: "RoutingTask",
    entityId: task.id,
    notes: "Task submitted for MD review",
    ...actor.auditMeta,
  });

  try {
    await notifyMdResultSubmitted({
      organizationId: actor.organizationId,
      taskId: task.id,
      patientName: task.visit.patient.fullName,
      department: task.department,
      submittedByName: task.staff?.fullName ?? null,
    });
  } catch (error) {
    // Result submission is already committed; notification failures should not roll back user-facing workflow.
    console.error("[LAB_SUBMIT_NOTIFY_FAILED]", {
      taskId: task.id,
      organizationId: actor.organizationId,
      error,
    });
  }

  return {
    inventoryWarnings,
  };
}
