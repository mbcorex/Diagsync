// src/lib/radiology-workflow.ts
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit";
import type { AuditMeta } from "@/lib/audit-core";
import { requireOrganizationCoreAccess, requireOrganizationFeature } from "@/lib/billing-service";
import { notifyMdResultSubmitted } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import {
  Department,
  OrderStatus,
  Role,
  RoutingTaskStatus,
  type Prisma,
} from "@prisma/client";
import {
  canModifyRadiologyTask,
  canStartRadiologyTask,
  canSubmitRadiologyTask,
  hasRequiredReportFields,
  isValidImagingFile,
} from "./radiology-workflow-core";
import { mergeRadiologyPerTestSections, type RadiologyPerTestSection } from "./radiology-report-sections";

export type RadiologyActor = {
  id: string;
  role: string;
  organizationId: string;
  auditMeta?: AuditMeta;
};

export type ImagingUploadInput = {
  fileUrl: string;
  fileType: string;
  fileName: string;
  fileSizeBytes: number;
  metadata?: Prisma.InputJsonValue;
};

function assertRadiographer(actor: RadiologyActor) {
  if (actor.role !== "RADIOGRAPHER") throw new Error("FORBIDDEN_ROLE");
}

async function assertRadiologyAccess(actor: RadiologyActor) {
  await requireOrganizationCoreAccess(actor.organizationId);
  await requireOrganizationFeature(actor.organizationId, "radiology");
}

async function assertOwnership(taskId: string, actor: RadiologyActor) {
  const task = await prisma.routingTask.findFirst({
    where: {
      id: taskId,
      organizationId: actor.organizationId,
      department: Department.RADIOLOGY,
    },
    include: {
      visit: { include: { patient: { select: { fullName: true } } } },
      radiologyReport: {
        select: {
          id: true,
          findings: true,
          impression: true,
          notes: true,
          extraFields: true,
          isSubmitted: true,
          submittedAt: true,
        },
      },
      imagingFiles: { select: { id: true, fileUrl: true, fileName: true, fileType: true } },
    },
  });

  if (!task) throw new Error("TASK_NOT_FOUND");
  if (
    !canModifyRadiologyTask({
      userRole: actor.role,
      userId: actor.id,
      assignedStaffId: task.staffId,
    })
  ) {
    throw new Error("FORBIDDEN_TASK");
  }
  return task;
}

/**
 * Get radiology task with full details including imaging files
 * Used for the radiographer dashboard to display and manage images
 */
export async function getRadiologyTaskWithImages(taskId: string, actor: RadiologyActor) {
  await assertRadiologyAccess(actor);
  
  const task = await prisma.routingTask.findFirst({
    where: {
      id: taskId,
      organizationId: actor.organizationId,
      department: Department.RADIOLOGY,
    },
    include: {
      visit: { 
        include: { 
          patient: {
            select: {
              id: true,
              fullName: true,
              patientId: true,
              age: true,
              dateOfBirth: true,
              sex: true,
            }
          } 
        } 
      },
      staff: { select: { id: true, fullName: true } },
      imagingFiles: {
        orderBy: { createdAt: "desc" },
      },
      radiologyReport: {
        select: {
          id: true,
          findings: true,
          impression: true,
          notes: true,
          extraFields: true,
          isSubmitted: true,
          submittedAt: true,
        },
      },
    },
  });

  if (!task) throw new Error("TASK_NOT_FOUND");
  
  // Check if user can access this task (own task or super admin)
  if (task.staffId && task.staffId !== actor.id && actor.role !== "SUPER_ADMIN" && actor.role !== "RADIOGRAPHER") {
    throw new Error("FORBIDDEN_TASK");
  }

  // Get test orders with their test details
  const testOrders = await prisma.testOrder.findMany({
    where: { 
      id: { in: task.testOrderIds },
      organizationId: actor.organizationId,
    },
    include: { 
      test: { 
        select: { 
          id: true,
          name: true, 
          code: true,
          description: true,
          resultFields: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              label: true,
              fieldKey: true,
              fieldType: true,
              options: true,
              isRequired: true,
            },
          },
        } 
      } 
    },
  });

  // Determine if user can edit this task
  const canEdit = canModifyRadiologyTask({
    userRole: actor.role,
    userId: actor.id,
    assignedStaffId: task.staffId,
  });

  return { 
    ...task, 
    testOrders,
    canEdit,
  };
}

export async function getRadiologyTasks(
  actor: RadiologyActor,
  opts?: {
    status?: RoutingTaskStatus | "ALL";
    sort?: "newest" | "oldest";
    search?: string;
    date?: string;
  }
) {
  assertRadiographer(actor);
  await assertRadiologyAccess(actor);
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
      department: Department.RADIOLOGY,
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
      ...(opts?.status && opts.status !== "ALL" ? { status: opts.status } : {}),
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
      _count: {
        select: { imagingFiles: true },
      },
      radiologyReport: {
        select: {
          findings: true,
          impression: true,
          notes: true,
          extraFields: true,
          isSubmitted: true,
        },
      },
    },
    orderBy: { createdAt: opts?.sort === "oldest" ? "asc" : "desc" },
    take: 80,
  });

  const allOrderIds = Array.from(new Set(rows.flatMap((task) => task.testOrderIds)));
  const orders = allOrderIds.length
    ? await prisma.testOrder.findMany({
        where: { organizationId: actor.organizationId, id: { in: allOrderIds } },
        select: {
          id: true,
          createdAt: true,
          test: {
            select: {
              name: true,
              code: true,
              resultFields: {
                orderBy: { sortOrder: "asc" },
                select: {
                  label: true,
                  fieldKey: true,
                  fieldType: true,
                  options: true,
                  isRequired: true,
                },
              },
            },
          },
        },
      })
    : [];
  const orderMap = new Map(orders.map((order) => [order.id, order]));

  // Also include image count for queue display
  const tasksWithImageCount = rows.map((task) => ({
    ...task,
    canEdit: canModifyRadiologyTask({
      userRole: actor.role,
      userId: actor.id,
      assignedStaffId: task.staffId,
    }),
    testOrders: task.testOrderIds
      .map((id) => orderMap.get(id))
      .filter((order): order is (typeof orders)[number] => Boolean(order)),
    imageCount: task._count.imagingFiles,
  }));

  return tasksWithImageCount;
}

export async function startRadiologyTask(taskId: string, actor: RadiologyActor) {
  assertRadiographer(actor);
  await assertRadiologyAccess(actor);
  const task = await prisma.routingTask.findFirst({
    where: {
      id: taskId,
      organizationId: actor.organizationId,
      department: Department.RADIOLOGY,
    },
    select: {
      id: true,
      status: true,
      staffId: true,
      testOrderIds: true,
    },
  });
  if (!task) throw new Error("TASK_NOT_FOUND");
  if (!canStartRadiologyTask(task.status)) throw new Error("INVALID_TASK_STATE");
  if (task.status === RoutingTaskStatus.IN_PROGRESS) {
    if (task.staffId === actor.id) return;
    throw new Error("TASK_ALREADY_CLAIMED");
  }

  const now = new Date();
  let startedNow = false;
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.routingTask.updateMany({
      where: {
        id: task.id,
        organizationId: actor.organizationId,
        department: Department.RADIOLOGY,
        status: RoutingTaskStatus.PENDING,
      },
      data: { status: RoutingTaskStatus.IN_PROGRESS, staffId: actor.id },
    });
    if (claimed.count === 0) {
      const latest = await tx.routingTask.findFirst({
        where: {
          id: task.id,
          organizationId: actor.organizationId,
          department: Department.RADIOLOGY,
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
      data: { status: OrderStatus.IN_PROGRESS, assignedToId: actor.id },
    });
    await tx.testOrder.updateMany({
      where: {
        id: { in: task.testOrderIds },
        organizationId: actor.organizationId,
        openedAt: null,
      },
      data: { openedAt: now },
    });
    await tx.testOrder.updateMany({
      where: {
        id: { in: task.testOrderIds },
        organizationId: actor.organizationId,
        startedAt: null,
      },
      data: { startedAt: now },
    });
  });

  if (!startedNow) return;

  await createAuditLog({
    actorId: actor.id,
    actorRole: Role.RADIOGRAPHER,
    action: AUDIT_ACTIONS.TEST_STARTED,
    entityType: "RoutingTask",
    entityId: task.id,
    notes: "Radiology task started",
    ...actor.auditMeta,
  });
}

export async function addImagingFile(taskId: string, actor: RadiologyActor, input: ImagingUploadInput) {
  assertRadiographer(actor);
  await assertRadiologyAccess(actor);
  await requireOrganizationFeature(actor.organizationId, "imaging");
  const task = await assertOwnership(taskId, actor);

  if (!isValidImagingFile({ mimeType: input.fileType, sizeBytes: input.fileSizeBytes })) {
    throw new Error("INVALID_FILE");
  }

  const file = await prisma.imagingFile.create({
    data: {
      organizationId: actor.organizationId,
      taskId: task.id,
      uploadedById: actor.id,
      fileUrl: input.fileUrl,
      fileType: input.fileType,
      fileName: input.fileName,
      fileSizeBytes: input.fileSizeBytes,
      metadata: input.metadata,
    },
  });

  await createAuditLog({
    actorId: actor.id,
    actorRole: Role.RADIOGRAPHER,
    action: AUDIT_ACTIONS.RESULT_DRAFTED,
    entityType: "ImagingFile",
    entityId: file.id,
    notes: `Imaging file uploaded: ${input.fileName}`,
    ...actor.auditMeta,
  });

  return file;
}

export async function getImagingFilesForTask(taskId: string, actor: RadiologyActor) {
  await assertRadiologyAccess(actor);
  
  const task = await prisma.routingTask.findFirst({
    where: {
      id: taskId,
      organizationId: actor.organizationId,
      department: Department.RADIOLOGY,
    },
    select: { id: true, staffId: true },
  });
  
  if (!task) throw new Error("TASK_NOT_FOUND");
  
  // Allow task owner or super admin to view images
  if (task.staffId && task.staffId !== actor.id && actor.role !== "SUPER_ADMIN") {
    throw new Error("FORBIDDEN_TASK");
  }
  
  const images = await prisma.imagingFile.findMany({
    where: { 
      taskId,
      organizationId: actor.organizationId,
    },
    orderBy: { createdAt: "desc" },
  });
  
  return images;
}

export async function deleteImagingFile(fileId: string, actor: RadiologyActor) {
  assertRadiographer(actor);
  await assertRadiologyAccess(actor);
  
  const file = await prisma.imagingFile.findFirst({
    where: { 
      id: fileId,
      organizationId: actor.organizationId,
    },
    include: {
      task: {
        select: {
          id: true,
          staffId: true,
        },
      },
    },
  });
  
  if (!file) throw new Error("FILE_NOT_FOUND");
  
  // Only task owner or super admin can delete
  if (file.task.staffId && file.task.staffId !== actor.id && actor.role !== "SUPER_ADMIN") {
    throw new Error("FORBIDDEN_DELETE");
  }
  
  await prisma.imagingFile.delete({
    where: { id: fileId },
  });
  
  await createAuditLog({
    actorId: actor.id,
    actorRole: Role.RADIOGRAPHER,
    action: "IMAGING_FILE_DELETED",
    entityType: "ImagingFile",
    entityId: fileId,
    notes: `Imaging file deleted: ${file.fileName}`,
    ...actor.auditMeta,
  });
  
  return { success: true };
}

export async function saveRadiologyReport(
  taskId: string,
  actor: RadiologyActor,
  input: {
    findings: string;
    impression: string;
    notes?: string;
    extraFields?: Prisma.InputJsonObject;
    testReports?: RadiologyPerTestSection[];
  }
) {
  assertRadiographer(actor);
  await assertRadiologyAccess(actor);
  const task = await assertOwnership(taskId, actor);

  const safeTestReports = (input.testReports ?? []).filter((row) =>
    task.testOrderIds.includes(row.testOrderId)
  );
  const mergedExtraFields = mergeRadiologyPerTestSections(
    (input.extraFields ?? {}) as Record<string, string>,
    safeTestReports
  );

  const report = await prisma.radiologyReport.upsert({
    where: { taskId: task.id },
    create: {
      organizationId: actor.organizationId,
      taskId: task.id,
      staffId: actor.id,
      findings: input.findings,
      impression: input.impression,
      notes: input.notes,
      extraFields: mergedExtraFields,
    },
    update: {
      findings: input.findings,
      impression: input.impression,
      notes: input.notes,
      extraFields: mergedExtraFields,
    },
  });

  await prisma.routingTask.update({
    where: { id: task.id },
    data: { status: RoutingTaskStatus.IN_PROGRESS },
  });

  await createAuditLog({
    actorId: actor.id,
    actorRole: Role.RADIOGRAPHER,
    action: AUDIT_ACTIONS.RESULT_DRAFTED,
    entityType: "RadiologyReport",
    entityId: report.id,
    notes: `Radiology report draft saved${input.extraFields ? ` with ${Object.keys(input.extraFields).length} custom field(s)` : ""}`,
    ...actor.auditMeta,
  });

  return report;
}

export async function submitRadiologyTask(
  taskId: string,
  actor: RadiologyActor
) {
  assertRadiographer(actor);
  await assertRadiologyAccess(actor);
  const task = await assertOwnership(taskId, actor);

  if (task.status === RoutingTaskStatus.COMPLETED && task.radiologyReport?.isSubmitted) return;
  if (!canSubmitRadiologyTask(task.status)) throw new Error("TASK_ALREADY_COMPLETED");
  if (!task.radiologyReport) throw new Error("MISSING_REPORT");
  const reportExtraFields =
    task.radiologyReport.extraFields &&
    typeof task.radiologyReport.extraFields === "object" &&
    !Array.isArray(task.radiologyReport.extraFields)
      ? (task.radiologyReport.extraFields as Record<string, string>)
      : {};
  if (!hasRequiredReportFields({ ...task.radiologyReport, extraFields: reportExtraFields }, task.testOrderIds)) {
    const missingFields: string[] = [];
    if (!task.radiologyReport.findings?.trim()) missingFields.push("findings");
    if (!task.radiologyReport.impression?.trim()) missingFields.push("impression");
    try {
      const parsed = JSON.parse(reportExtraFields["__perTestReports"] ?? "[]") as Array<{
        testOrderId?: string;
        findings?: string;
        impression?: string;
      }>;
      const map = new Map(
        (Array.isArray(parsed) ? parsed : [])
          .filter((row) => row && typeof row === "object" && typeof row.testOrderId === "string")
          .map((row) => [row.testOrderId as string, row])
      );
      for (const id of task.testOrderIds) {
        const row = map.get(id);
        if (!row?.findings?.trim() || !row?.impression?.trim()) {
          missingFields.push(`test:${id}`);
        }
      }
    } catch {
      // keep default fallback details above
    }
    throw new Error(
      missingFields.length > 0 ? `INCOMPLETE_REPORT:${missingFields.join(", ")}` : "INCOMPLETE_REPORT"
    );
  }
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.radiologyReport.update({
      where: { taskId: task.id },
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
  });

  await createAuditLog({
    actorId: actor.id,
    actorRole: Role.RADIOGRAPHER,
    action: AUDIT_ACTIONS.RESULT_SUBMITTED,
    entityType: "RoutingTask",
    entityId: task.id,
    notes: "Radiology report submitted for MD review",
    ...actor.auditMeta,
  });

  try {
    await notifyMdResultSubmitted({
      organizationId: actor.organizationId,
      taskId: task.id,
      patientName: task.visit.patient.fullName,
      department: task.department,
    });
  } catch (error) {
    // Notification delivery must never fail report submission.
    console.error("[RAD_TASK_SUBMIT_NOTIFY]", error);
  }
}
