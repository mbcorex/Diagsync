import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit";
import type { AuditMeta } from "@/lib/audit-core";
import { requireOrganizationCoreAccess } from "@/lib/billing-service";
import { notifyResultEdited, notifyTaskReviewOutcome } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import {
  Department,
  OrderStatus,
  Prisma,
  ReviewStatus,
  Role,
  RoutingTaskStatus,
} from "@prisma/client";
import {
  canApprove,
  canReject,
  canUnapprove,
  canUseMdWorkflow,
  isTaskReviewable,
  requireRejectReason,
} from "./md-workflow-core";
import {
  canUseControlledEdit,
  nextVersionNumber,
  requireEditReason,
  shouldResetApproval,
} from "./edit-system-core";
import { pickActiveVersion } from "./edit-versioning-core";
import { ensureDraftReportForTask } from "./report-workflow";

export type MdActor = {
  id: string;
  role: string;
  organizationId: string;
  auditMeta?: AuditMeta;
};

type MdFilter = "all" | "pending" | "approved" | "rejected";

function assertMd(actor: MdActor) {
  if (!canUseMdWorkflow(actor.role)) {
    throw new Error("FORBIDDEN_ROLE");
  }
}

async function assertMdCoreAccess(actor: MdActor) {
  await requireOrganizationCoreAccess(actor.organizationId);
}

function normalizeJsonForInput(value: Prisma.JsonValue | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

async function getTaskForReview(taskId: string, actor: MdActor) {
  const task = await prisma.routingTask.findFirst({
    where: {
      id: taskId,
      organizationId: actor.organizationId,
      department: { in: [Department.LABORATORY, Department.RADIOLOGY] },
    },
    include: {
      visit: { include: { patient: true } },
      review: true,
      results: {
        include: {
          versions: {
            include: { editedBy: { select: { id: true, fullName: true } } },
            orderBy: { version: "desc" },
          },
        },
      },
      radiologyReport: {
        include: {
          staff: { select: { id: true, fullName: true } },
          versions: {
            include: { editedBy: { select: { id: true, fullName: true } } },
            orderBy: { version: "desc" },
          },
        },
      },
      imagingFiles: true,
      staff: { select: { id: true, fullName: true } },
    },
  });
  if (!task) throw new Error("TASK_NOT_FOUND");
  if (!isTaskReviewable(task.status)) throw new Error("TASK_NOT_REVIEWABLE");
  return task;
}

export async function getMdReviewItems(actor: MdActor, filter: MdFilter = "pending") {
  assertMd(actor);
  await assertMdCoreAccess(actor);

  const baseWhere: Prisma.RoutingTaskWhereInput = {
    organizationId: actor.organizationId,
    department: { in: [Department.LABORATORY, Department.RADIOLOGY] },
  };
  const submittedForMdQueueWhere: Prisma.RoutingTaskWhereInput = {
    status: RoutingTaskStatus.COMPLETED,
    OR: [
      {
        department: Department.LABORATORY,
        results: { some: { isSubmitted: true } },
      },
      {
        department: Department.RADIOLOGY,
        radiologyReport: { is: { isSubmitted: true } },
      },
    ],
  };

  const reviewFilter: Prisma.RoutingTaskWhereInput | null =
    filter === "approved"
      ? { review: { is: { status: ReviewStatus.APPROVED } } }
      : filter === "rejected"
      ? { review: { is: { status: ReviewStatus.REJECTED } } }
      : null;

  const where: Prisma.RoutingTaskWhereInput =
    filter === "pending"
      ? {
          ...baseWhere,
          ...submittedForMdQueueWhere,
          testOrderIds: { isEmpty: false },
          OR: [{ review: { is: null } }, { review: { is: { status: ReviewStatus.PENDING } } }],
        }
      : reviewFilter
      ? { ...baseWhere, ...reviewFilter }
      : baseWhere;

  const tasks = await prisma.routingTask.findMany({
    where,
    include: {
      visit: {
        select: {
          id: true,
          visitNumber: true,
          patient: {
            select: {
              id: true,
              fullName: true,
              patientId: true,
              age: true,
              dateOfBirth: true,
              sex: true,
            },
          },
        },
      },
      review: true,
      staff: { select: { id: true, fullName: true } },
      imagingFiles: {
        select: {
          id: true,
          fileName: true,
          fileUrl: true,
        },
      },
      radiologyReport: {
        include: {
          staff: { select: { id: true, fullName: true } },
          versions: {
            where: { isActive: true },
            include: { editedBy: { select: { id: true, fullName: true } } },
            orderBy: { version: "desc" },
            take: 1,
          },
        },
      },
      results: {
        include: {
          staff: { select: { id: true, fullName: true } },
          testOrder: {
            include: {
              assignedTo: {
                select: {
                  id: true,
                  fullName: true,
                },
              },
              test: {
                include: {
                  resultFields: {
                    orderBy: { sortOrder: "asc" },
                    select: {
                      id: true,
                      label: true,
                      fieldKey: true,
                      fieldType: true,
                      unit: true,
                      normalMin: true,
                      normalMax: true,
                      normalText: true,
                      referenceNote: true,
                      sortOrder: true,
                    },
                  },
                },
              },
            },
          },
          versions: {
            where: { isActive: true },
            include: { editedBy: { select: { id: true, fullName: true } } },
            orderBy: { version: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 80,
  });

  const [pendingCount, approvedCount, rejectedCount] = await Promise.all([
    prisma.routingTask.count({
      where: {
        ...baseWhere,
        ...submittedForMdQueueWhere,
        testOrderIds: { isEmpty: false },
        OR: [{ review: { is: null } }, { review: { is: { status: ReviewStatus.PENDING } } }],
      },
    }),
    prisma.routingTask.count({
      where: {
        ...baseWhere,
        review: { is: { status: ReviewStatus.APPROVED } },
      },
    }),
    prisma.routingTask.count({
      where: {
        ...baseWhere,
        review: { is: { status: ReviewStatus.REJECTED } },
      },
    }),
  ]);

  const counts = { pending: pendingCount, approved: approvedCount, rejected: rejectedCount };

  const patientIds = Array.from(new Set(tasks.map((task) => task.visit.patient.id)));
  const visitCounts = patientIds.length
    ? await prisma.visit.groupBy({
        by: ["patientId"],
        where: { organizationId: actor.organizationId, patientId: { in: patientIds } },
        _count: { patientId: true },
      })
    : [];
  const visitCountMap = new Map(visitCounts.map((row) => [row.patientId, row._count.patientId]));

  const historyOrders = patientIds.length
    ? await prisma.testOrder.findMany({
        where: {
          organizationId: actor.organizationId,
          visit: { patientId: { in: patientIds } },
        },
        include: {
          visit: { select: { patientId: true, registeredAt: true } },
          test: { select: { name: true } },
          labResults: {
            select: {
              resultData: true,
              submittedAt: true,
              createdAt: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 120,
      })
    : [];

  const historyMap = new Map<
    string,
    Array<{ testName: string; recordedAt: string; resultData: Record<string, unknown> | null }>
  >();
  for (const order of historyOrders) {
    const patientId = order.visit.patientId;
    const existing = historyMap.get(patientId) ?? [];
    if (order.labResults.length === 0) {
      existing.push({
        testName: order.test.name,
        recordedAt: order.visit.registeredAt.toISOString(),
        resultData: null,
      });
    } else {
      for (const result of order.labResults) {
        existing.push({
          testName: order.test.name,
          recordedAt: (result.submittedAt ?? result.createdAt).toISOString(),
          resultData:
            result.resultData && typeof result.resultData === "object"
              ? (result.resultData as Record<string, unknown>)
              : null,
        });
      }
    }
    historyMap.set(patientId, existing);
  }
  for (const [patientId, rows] of Array.from(historyMap.entries())) {
    historyMap.set(
      patientId,
      rows
        .sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime())
        .slice(-30)
    );
  }

  const items = tasks.map((task) => {
    const startedByNames = Array.from(
      new Set(
        [
          task.department === Department.RADIOLOGY ? task.staff?.fullName?.trim() ?? "" : "",
          ...task.results
            .map((result) => result.testOrder.assignedTo?.fullName?.trim() ?? ""),
        ].filter((name) => name.length > 0)
      )
    );
    const submittedByNames = Array.from(
      new Set(
        [
          task.staff?.fullName?.trim() ?? "",
          task.radiologyReport?.staff?.fullName?.trim() ?? "",
          ...task.results
            .map((result) => result.staff?.fullName?.trim() ?? "")
            .filter((name) => name.length > 0),
        ].filter((name) => name.length > 0)
      )
    );
    const results = task.results.map((result) => {
      const activeVersion = pickActiveVersion(result.versions) ?? result.versions[0] ?? null;
      return {
        ...result,
        currentVersion: activeVersion?.version ?? 1,
        resultData: activeVersion?.resultData ?? result.resultData,
        notes: activeVersion?.notes ?? result.notes,
        versionHistory: [],
      };
    });

    const activeReportVersion = task.radiologyReport
      ? pickActiveVersion(task.radiologyReport.versions) ?? task.radiologyReport.versions[0] ?? null
      : null;
    const radiologyReport = task.radiologyReport
      ? {
          ...task.radiologyReport,
          currentVersion: activeReportVersion?.version ?? 1,
          findings: activeReportVersion?.findings ?? task.radiologyReport.findings,
          impression: activeReportVersion?.impression ?? task.radiologyReport.impression,
          notes: activeReportVersion?.notes ?? task.radiologyReport.notes,
          extraFields: activeReportVersion?.extraFields ?? task.radiologyReport.extraFields,
          versionHistory: [],
        }
      : null;

    return {
      ...task,
      results,
      radiologyReport,
      patientHistory: historyMap.get(task.visit.patient.id) ?? [],
      patientVisitCount: visitCountMap.get(task.visit.patient.id) ?? 1,
      startedByName: startedByNames.join(", "),
      submittedByName: submittedByNames.join(", "),
    };
  });

  return { items, counts };
}

export async function approveMdReview(taskId: string, actor: MdActor, comments?: string) {
  assertMd(actor);
  await assertMdCoreAccess(actor);
  const task = await getTaskForReview(taskId, actor);

  if (task.department === Department.LABORATORY) {
    const hasAllSubmitted =
      task.results.length > 0 &&
      task.testOrderIds.every((id) =>
        task.results.some((r) => r.testOrderId === id && r.isSubmitted)
      );
    if (!hasAllSubmitted) throw new Error("NO_REVIEW_DATA");
  }

  if (task.department === Department.RADIOLOGY) {
    if (!task.radiologyReport || !task.radiologyReport.isSubmitted) {
      throw new Error("NO_REVIEW_DATA");
    }
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const existingReview = await tx.review.findUnique({
      where: { taskId: task.id },
      select: { status: true },
    });

    if (existingReview) {
      if (!canApprove(existingReview.status)) {
        throw new Error("ALREADY_APPROVED");
      }
      const updated = await tx.review.updateMany({
        where: {
          taskId: task.id,
          status: { not: ReviewStatus.APPROVED },
        },
        data: {
          reviewedById: actor.id,
          status: ReviewStatus.APPROVED,
          comments,
          rejectionReason: null,
        },
      });
      if (updated.count === 0) {
        throw new Error("ALREADY_APPROVED");
      }
    } else {
      try {
        await tx.review.create({
          data: {
            organizationId: actor.organizationId,
            taskId: task.id,
            visitId: task.visitId,
            reviewedById: actor.id,
            status: ReviewStatus.APPROVED,
            comments,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          throw new Error("ALREADY_APPROVED");
        }
        throw error;
      }
    }

    const orders = await tx.testOrder.findMany({
      where: { id: { in: task.testOrderIds }, organizationId: actor.organizationId },
    });
    for (const order of orders) {
      await tx.testOrder.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.APPROVED,
          reviewedAt: now,
          approvedAt: now,
        },
      });
    }
  });

  try {
    await createAuditLog({
      actorId: actor.id,
      actorRole: actor.role as Role,
      action: AUDIT_ACTIONS.RESULT_APPROVED,
      entityType: "Review",
      entityId: task.id,
      newValue: { status: "APPROVED", comments },
      ...actor.auditMeta,
    });
  } catch (error) {
    console.error("[MD_APPROVE_AUDIT_FAILED]", { taskId: task.id, organizationId: actor.organizationId, error });
  }

  try {
    await notifyTaskReviewOutcome({
      organizationId: actor.organizationId,
      taskId: task.id,
      performerId: task.staffId,
      patientName: task.visit.patient.fullName,
      approved: true,
    });
  } catch (error) {
    console.error("[MD_APPROVE_NOTIFY_FAILED]", { taskId: task.id, organizationId: actor.organizationId, error });
  }

  try {
    await ensureDraftReportForTask(task.id, actor);
  } catch (error) {
    console.error("[MD_APPROVE_REPORT_DRAFT_FAILED]", { taskId: task.id, organizationId: actor.organizationId, error });
  }
}

export async function rejectMdReview(taskId: string, actor: MdActor, reason: string, highlightFields: string[] = []) {
  assertMd(actor);
  await assertMdCoreAccess(actor);
  const task = await getTaskForReview(taskId, actor);

  const currentStatus = task.review?.status ?? null;
  if (!canReject(currentStatus)) throw new Error("ALREADY_APPROVED");
  if (!requireRejectReason(reason)) throw new Error("REASON_REQUIRED");

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.review.upsert({
      where: { taskId: task.id },
      create: {
        organizationId: actor.organizationId,
        taskId: task.id,
        visitId: task.visitId,
        reviewedById: actor.id,
        status: ReviewStatus.REJECTED,
        comments: reason,
        rejectionReason: reason,
        editedData: { highlightFields },
      },
      update: {
        reviewedById: actor.id,
        status: ReviewStatus.REJECTED,
        comments: reason,
        rejectionReason: reason,
        editedData: { highlightFields },
      },
    });

    await tx.routingTask.update({
      where: { id: task.id },
      data: { status: RoutingTaskStatus.IN_PROGRESS },
    });

    await tx.labResult.updateMany({
      where: { taskId: task.id, organizationId: actor.organizationId },
      data: { isSubmitted: false, submittedAt: null },
    });

    const orders = await tx.testOrder.findMany({
      where: { id: { in: task.testOrderIds }, organizationId: actor.organizationId },
    });
    for (const order of orders) {
      await tx.testOrder.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.EDIT_REQUESTED,
          reviewedAt: now,
        },
      });
    }
  });

  await createAuditLog({
    actorId: actor.id,
    actorRole: actor.role as Role,
    action: AUDIT_ACTIONS.RESULT_REJECTED,
    entityType: "Review",
    entityId: task.id,
    newValue: { status: "REJECTED", reason },
    ...actor.auditMeta,
  });

  await notifyTaskReviewOutcome({
    organizationId: actor.organizationId,
    taskId: task.id,
    performerId: task.staffId,
    patientName: task.visit.patient.fullName,
    approved: false,
    reason,
  });
}

export async function unapproveMdReview(taskId: string, actor: MdActor, reason?: string) {
  assertMd(actor);
  await assertMdCoreAccess(actor);
  const task = await getTaskForReview(taskId, actor);
  const currentStatus = task.review?.status ?? null;
  if (!canUnapprove(currentStatus)) throw new Error("NOT_APPROVED");

  const now = new Date();
  const note = reason?.trim() || "Approval reverted for fresh MD review.";
  await prisma.$transaction(async (tx) => {
    const updated = await tx.review.updateMany({
      where: {
        taskId: task.id,
        status: ReviewStatus.APPROVED,
      },
      data: {
        reviewedById: actor.id,
        status: ReviewStatus.PENDING,
        comments: note,
        rejectionReason: null,
      },
    });
    if (updated.count === 0) throw new Error("NOT_APPROVED");

    await tx.testOrder.updateMany({
      where: { id: { in: task.testOrderIds }, organizationId: actor.organizationId },
      data: {
        status: OrderStatus.SUBMITTED_FOR_REVIEW,
        submittedAt: now,
        reviewedAt: null,
        approvedAt: null,
      },
    });

    await tx.routingTask.update({
      where: { id: task.id },
      data: { status: RoutingTaskStatus.COMPLETED },
    });
  });

  await createAuditLog({
    actorId: actor.id,
    actorRole: actor.role as Role,
    action: AUDIT_ACTIONS.REVIEW_EDITED,
    entityType: "Review",
    entityId: task.id,
    changes: {
      reason: note,
      beforeStatus: "APPROVED",
      afterStatus: "PENDING",
    },
    notes: note,
    ...actor.auditMeta,
  });
}

export async function editMdReview(
  taskId: string,
  actor: MdActor,
  payload: {
    editedData: Prisma.InputJsonValue;
    reason: string;
    comments?: string;
  }
) {
  if (!canUseControlledEdit(actor.role)) throw new Error("FORBIDDEN_ROLE");
  await assertMdCoreAccess(actor);
  if (!requireEditReason(payload.reason)) throw new Error("REASON_REQUIRED");

  const task = await getTaskForReview(taskId, actor);
  const currentStatus = task.review?.status ?? null;
  const resetApproval = shouldResetApproval(currentStatus);
  const now = new Date();
  const versionTrace: string[] = [];

  await prisma.$transaction(async (tx) => {
    if (task.department === Department.LABORATORY) {
      const data = payload.editedData as any;
      const items = Array.isArray(data?.testResults) ? data.testResults : [];
      if (items.length === 0) throw new Error("INVALID_EDIT_DATA");

      for (const item of items) {
        if (!item?.testOrderId) continue;
        if (!task.testOrderIds.includes(item.testOrderId)) continue;

        const labResult = await tx.labResult.findUnique({
          where: {
            taskId_testOrderId: {
              taskId: task.id,
              testOrderId: item.testOrderId,
            },
          },
          include: {
            versions: {
              orderBy: { version: "desc" },
              take: 1,
            },
          },
        });
        if (!labResult) throw new Error("RESULT_NOT_FOUND");

        if (labResult.versions.length === 0) {
          const baseline = await tx.labResultVersion.create({
            data: {
              labResultId: labResult.id,
              version: 1,
              resultData: (labResult.resultData ?? {}) as Prisma.InputJsonValue,
              notes: labResult.notes,
              isActive: true,
              parentId: null,
              editedById: labResult.staffId,
              editReason: "Initial submitted version",
            },
          });
          labResult.versions = [baseline];
        }

        const latestVersion = await tx.labResultVersion.findFirst({
          where: { labResultId: labResult.id },
          orderBy: { version: "desc" },
        });
        const activeVersion = await tx.labResultVersion.findFirst({
          where: { labResultId: labResult.id, isActive: true },
          orderBy: { version: "desc" },
        });
        if (!activeVersion) throw new Error("INVALID_VERSION_CHAIN");

        const nextVersion = nextVersionNumber(
          latestVersion ? [latestVersion.version] : [1]
        );

        await tx.labResultVersion.updateMany({
          where: { labResultId: labResult.id, isActive: true },
          data: { isActive: false },
        });

        await tx.labResultVersion.create({
          data: {
            labResultId: labResult.id,
            version: nextVersion,
            resultData: (
              item.resultData ?? activeVersion.resultData ?? latestVersion?.resultData ?? labResult.resultData ?? {}
            ) as Prisma.InputJsonValue,
            notes: item.notes ?? activeVersion.notes ?? latestVersion?.notes ?? labResult.notes,
            isActive: true,
            parentId: activeVersion.id,
            editedById: actor.id,
            editReason: payload.reason,
          },
        });
        versionTrace.push(`${labResult.id}:v${nextVersion}`);
      }
    }

    if (task.department === Department.RADIOLOGY) {
      const data = payload.editedData as any;
      if (data?.report) {
        const report = await tx.radiologyReport.findUnique({
          where: { taskId: task.id },
          include: {
            versions: {
              orderBy: { version: "desc" },
              take: 1,
            },
          },
        });
        if (!report) throw new Error("RESULT_NOT_FOUND");

        if (report.versions.length === 0) {
          const baseline = await tx.radiologyReportVersion.create({
            data: {
              reportId: report.id,
              version: 1,
              findings: report.findings,
              impression: report.impression,
              notes: report.notes,
              extraFields: normalizeJsonForInput(report.extraFields),
              isActive: true,
              parentId: null,
              editedById: report.staffId,
              editReason: "Initial submitted version",
            },
          });
          report.versions = [baseline];
        }

        const latestVersion = await tx.radiologyReportVersion.findFirst({
          where: { reportId: report.id },
          orderBy: { version: "desc" },
        });
        const activeVersion = await tx.radiologyReportVersion.findFirst({
          where: { reportId: report.id, isActive: true },
          orderBy: { version: "desc" },
        });
        if (!activeVersion) throw new Error("INVALID_VERSION_CHAIN");

        const nextVersion = nextVersionNumber(latestVersion ? [latestVersion.version] : [1]);
        const versionExtraFields =
          data.report.extraFields ??
          activeVersion.extraFields ??
          latestVersion?.extraFields ??
          report.extraFields;

        await tx.radiologyReportVersion.updateMany({
          where: { reportId: report.id, isActive: true },
          data: { isActive: false },
        });

        await tx.radiologyReportVersion.create({
          data: {
            reportId: report.id,
            version: nextVersion,
            findings: data.report.findings ?? activeVersion.findings ?? latestVersion?.findings ?? report.findings,
            impression: data.report.impression ?? activeVersion.impression ?? latestVersion?.impression ?? report.impression,
            notes: data.report.notes ?? activeVersion.notes ?? latestVersion?.notes ?? report.notes,
            extraFields: normalizeJsonForInput(versionExtraFields as Prisma.JsonValue | null | undefined),
            isActive: true,
            parentId: activeVersion.id,
            editedById: actor.id,
            editReason: payload.reason,
          },
        });
        versionTrace.push(`${report.id}:v${nextVersion}`);
      } else {
        throw new Error("INVALID_EDIT_DATA");
      }
    }

    await tx.review.upsert({
      where: { taskId: task.id },
      create: {
        organizationId: actor.organizationId,
        taskId: task.id,
        visitId: task.visitId,
        reviewedById: actor.id,
        status: ReviewStatus.PENDING,
        comments: payload.comments,
        editedData: payload.editedData,
        rejectionReason: resetApproval ? "Approved result edited and reset for re-approval" : null,
      },
      update: {
        reviewedById: actor.id,
        status: ReviewStatus.PENDING,
        comments: payload.comments,
        editedData: payload.editedData,
        rejectionReason: resetApproval ? "Approved result edited and reset for re-approval" : null,
      },
    });

    await tx.testOrder.updateMany({
      where: { id: { in: task.testOrderIds }, organizationId: actor.organizationId },
      data: {
        // Returned to lab scientist for revision after MD-controlled edit request.
        status: OrderStatus.EDIT_REQUESTED,
        submittedAt: now,
        reviewedAt: null,
        approvedAt: null,
      },
    });

    await tx.routingTask.update({
      where: { id: task.id },
      // Keep task active in lab queue so performer can see and act on MD edit request.
      data: { status: RoutingTaskStatus.IN_PROGRESS },
    });
  });

  await createAuditLog({
    actorId: actor.id,
    actorRole: actor.role as Role,
    action: AUDIT_ACTIONS.REVIEW_EDITED,
    entityType: "Review",
    entityId: task.id,
    changes: {
      reason: payload.reason,
      resetApproval,
      beforeStatus: currentStatus ?? "PENDING",
      afterStatus: "PENDING",
      editedData: payload.editedData,
      comments: payload.comments ?? null,
    },
    notes: payload.reason,
    ...actor.auditMeta,
  });

  const mdUsers = await prisma.staff.findMany({
    where: {
      organizationId: actor.organizationId,
      role: Role.MD,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  const performerIds = new Set<string>();
  if (task.staffId) performerIds.add(task.staffId);
  for (const result of task.results) {
    if (result.staffId) performerIds.add(result.staffId);
  }

  await notifyResultEdited({
    organizationId: actor.organizationId,
    taskId: task.id,
    patientName: task.visit.patient.fullName,
    editorId: actor.id,
    mdIds: mdUsers.map((user) => user.id),
    performerIds: Array.from(performerIds),
    dedupeSeed: versionTrace.sort().join("|") || `${task.id}:edit`,
  });
}
