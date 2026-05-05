import { randomUUID } from "node:crypto";
import { createAuditLog, AUDIT_ACTIONS } from "@/lib/audit";
import type { AuditMeta } from "@/lib/audit-core";
import {
  assertReportTypeMatchesDepartment,
  canDispatchReleasedReport,
  canHrmReleaseReport,
  canMdEditReport,
  canPreviewReport,
  canRelease,
  getReportLabel,
  hasValidReportContent,
  isReportDepartment,
  reportTypeForDepartment,
} from "@/lib/report-workflow-core";
import { notifyResultEdited, sendNotificationToRoles, sendNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { renderReportHtml } from "@/lib/report-rendering";
import { requireOrganizationCoreAccess } from "@/lib/billing-service";
import { Department, NotificationType, OrderStatus, ReportStatus, Role, ReviewStatus, ReportType, VisitStatus } from "@prisma/client";
import { formatReferenceDisplay } from "./reference-ranges";
import { extractSignOffFromMap, stripSignOffKeys } from "./report-signoff";
import { canUseCustomLetterhead, shouldShowWatermark } from "./billing-access";
import { parseRadiologyPerTestSections } from "./radiology-report-sections";

export type ReportActor = {
  id: string;
  role: string;
  organizationId: string;
  auditMeta?: AuditMeta;
};

function assertDepartment(department: Department) {
  if (!isReportDepartment(department)) {
    throw new Error("INVALID_REPORT_DEPARTMENT");
  }
}

function ensurePreviewAccess(actor: ReportActor) {
  if (!canPreviewReport(actor.role)) throw new Error("FORBIDDEN_ROLE");
}

async function assertReportCoreAccess(actor: ReportActor) {
  await requireOrganizationCoreAccess(actor.organizationId);
}

function pickExtraFields(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function assertContentMatchesDepartment(content: unknown, department: Department) {
  if (!content || typeof content !== "object") {
    throw new Error("INVALID_REPORT_CONTENT");
  }
  const tests = Array.isArray((content as any).tests) ? (content as any).tests : [];
  if (department === Department.LABORATORY) {
    const hasRadiologyFields = tests.some((t: any) => "findings" in (t ?? {}) || "impression" in (t ?? {}));
    if (hasRadiologyFields) throw new Error("CROSS_DEPARTMENT_CONTENT");
  }
  if (department === Department.RADIOLOGY) {
    const hasLabRows = tests.some((t: any) => Array.isArray(t?.rows));
    if (hasLabRows) throw new Error("CROSS_DEPARTMENT_CONTENT");
  }
}

async function buildReportContentFromTask(taskId: string, organizationId: string) {
  const task = await prisma.routingTask.findFirst({
    where: { id: taskId, organizationId },
    include: {
      visit: { include: { patient: true } },
      results: {
        include: {
          testOrder: {
            include: {
              test: {
                include: { resultFields: true },
              },
            },
          },
          versions: { where: { isActive: true }, orderBy: { version: "desc" }, take: 1 },
        },
      },
      radiologyReport: {
        include: {
          versions: { where: { isActive: true }, orderBy: { version: "desc" }, take: 1 },
        },
      },
      imagingFiles: {
        select: {
          fileUrl: true,
          fileName: true,
          fileType: true,
        },
      },
    },
  });

  if (!task) throw new Error("TASK_NOT_FOUND");
  assertDepartment(task.department);

  const reportType = reportTypeForDepartment(task.department);
  const common = {
    patient: {
      fullName: task.visit.patient.fullName,
      patientId: task.visit.patient.patientId,
      age: task.visit.patient.age,
      dateOfBirth: task.visit.patient.dateOfBirth?.toISOString() ?? null,
      sex: task.visit.patient.sex,
    },
    meta: {
      visitNumber: task.visit.visitNumber,
      visitDate: task.visit.registeredAt.toISOString(),
      reportDate: new Date().toISOString(),
      referringDoctor: task.visit.patient.referringDoctor ?? null,
    },
  };

  if (task.department === Department.LABORATORY) {
    let signOff: { signatureImage: string; signatureName: string } | null = null;
    const tests = task.results
      .filter((result) => result.testOrder.test.department === Department.LABORATORY)
      .map((result) => {
        const currentData = (result.versions[0]?.resultData ?? result.resultData ?? {}) as Record<string, any>;
        if (!signOff) {
          const activeVersionData = (result.versions[0]?.resultData ?? {}) as Record<string, unknown>;
          const baseResultData = (result.resultData ?? {}) as Record<string, unknown>;
          signOff = extractSignOffFromMap(activeVersionData) ?? extractSignOffFromMap(baseResultData);
        }
        const rows = result.testOrder.test.resultFields.map((field) => ({
          name: field.label,
          value: currentData[field.fieldKey] ?? "",
          unit: field.unit ?? "",
          reference: formatReferenceDisplay({
            fieldKey: field.fieldKey,
            fieldType: field.fieldType,
            unit: field.unit,
            normalMin: field.normalMin as any,
            normalMax: field.normalMax as any,
            normalText: (field as any).normalText ?? null,
            referenceNote: (field as any).referenceNote ?? null,
          }),
        }));
        return {
          name: result.testOrder.test.name,
          rows,
        };
      });
    return { department: task.department, reportType, content: { ...common, tests, ...(signOff ? { signOff } : {}) } };
  }

  const radiologyTests = await prisma.testOrder.findMany({
    where: {
      id: { in: task.testOrderIds },
      organizationId,
      test: { department: Department.RADIOLOGY },
    },
    include: { test: true },
  });
  const activeReportVersion = task.radiologyReport?.versions?.[0] ?? null;
  const report = task.radiologyReport;
  const activeVersionExtraFields = activeReportVersion
    ? (activeReportVersion as Record<string, unknown>)["extraFields"]
    : null;
  const reportExtraFields = report ? (report as Record<string, unknown>)["extraFields"] : null;
  const rawExtraFields = pickExtraFields(activeVersionExtraFields ?? reportExtraFields);
  const parsedPerTest = parseRadiologyPerTestSections((rawExtraFields ?? {}) as Record<string, string>);
  const perTestMap = new Map(parsedPerTest.map((row) => [row.testOrderId, row]));
  const signOff = extractSignOffFromMap(rawExtraFields);
  const extraFields = rawExtraFields
    ? Object.fromEntries(
        Object.entries(stripSignOffKeys(rawExtraFields))
          .filter(([key]) => key !== "__perTestReports")
          .map(([key, value]) => [key, value === null || value === undefined ? "" : String(value)])
          .filter(([key]) => key.trim().length > 0)
      )
    : {};
  const tests = radiologyTests.map((order) => ({
    name: order.test.name,
    findings: perTestMap.get(order.id)?.findings ?? activeReportVersion?.findings ?? report?.findings ?? "",
    impression: perTestMap.get(order.id)?.impression ?? activeReportVersion?.impression ?? report?.impression ?? "",
    notes: perTestMap.get(order.id)?.notes ?? activeReportVersion?.notes ?? report?.notes ?? "",
    extraFields,
  }));
  const imagingFiles = task.imagingFiles.map((file) => ({
    url: file.fileUrl,
    name: file.fileName,
    fileType: file.fileType,
  }));
  return { department: task.department, reportType, content: { ...common, tests, imagingFiles, ...(signOff ? { signOff } : {}) } };
}

export async function ensureDraftReportForTask(taskId: string, actor: ReportActor) {
  const built = await buildReportContentFromTask(taskId, actor.organizationId);
  assertContentMatchesDepartment(built.content, built.department);
  const task = await prisma.routingTask.findFirst({
    where: { id: taskId, organizationId: actor.organizationId },
    include: { visit: true },
  });
  if (!task) throw new Error("TASK_NOT_FOUND");

  const report = await prisma.diagnosticReport.upsert({
    where: {
      visitId_department: {
        visitId: task.visitId,
        department: built.department,
      },
    },
    create: {
      organizationId: actor.organizationId,
      visitId: task.visitId,
      department: built.department,
      reportType: built.reportType,
      sourceTaskId: task.id,
      status: ReportStatus.DRAFT,
      reportContent: built.content as any,
      generatedById: actor.id,
      lastEditedById: actor.id,
      lastEditedAt: new Date(),
      publicShareToken: randomUUID(),
      lastActionAt: new Date(),
    },
    update: {
      sourceTaskId: task.id,
      department: built.department,
      reportType: built.reportType,
      reportContent: built.content as any,
      lastEditedById: actor.id,
      lastEditedAt: new Date(),
      lastActionAt: new Date(),
    },
    include: { visit: { include: { patient: true } } },
  });

  const existingVersions = await prisma.diagnosticReportVersion.findMany({
    where: { reportId: report.id },
    orderBy: { version: "desc" },
    take: 1,
  });

  if (existingVersions.length === 0) {
    await prisma.diagnosticReportVersion.create({
      data: {
        reportId: report.id,
        version: 1,
        content: report.reportContent as any,
        comments: report.comments,
        prescription: report.prescription,
        isActive: true,
        parentId: null,
        editedById: actor.id,
        editReason: "Initial report draft from approved case",
      },
    });
  }

  await sendNotificationToRoles({
    organizationId: actor.organizationId,
    roles: [Role.HRM, Role.SUPER_ADMIN],
    type: NotificationType.REPORT_READY_FOR_REVIEW,
    title: "Report ready for HRM review",
    message: `${getReportLabel(report.department)} for ${report.visit.patient.fullName} is ready.`,
    entityId: report.id,
    entityType: "DiagnosticReport",
    dedupeKeyPrefix: `report-ready:${report.id}`,
  });

  return report;
}

export async function listReports(
  actor: ReportActor,
  opts?: {
    department?: Department | "ALL";
    status?: ReportStatus | "ALL";
    reportType?: ReportType | "ALL";
    search?: string;
    date?: string;
  }
) {
  ensurePreviewAccess(actor);
  await assertReportCoreAccess(actor);
  const search = String(opts?.search ?? "").trim();
  const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(String(opts?.date ?? ""));
  const dateRange = hasDate
    ? (() => {
        const [y, m, d] = String(opts?.date).split("-").map((v) => Number(v));
        return {
          gte: new Date(y, m - 1, d, 0, 0, 0, 0),
          lte: new Date(y, m - 1, d, 23, 59, 59, 999),
        };
      })()
    : null;

  const reports = await prisma.diagnosticReport.findMany({
    where: {
      organizationId: actor.organizationId,
      ...(actor.role === "RECEPTIONIST" ? { isReleased: true } : {}),
      ...(opts?.department && opts.department !== "ALL" ? { department: opts.department } : {}),
      ...(opts?.status && opts.status !== "ALL" ? { status: opts.status } : {}),
      ...(opts?.reportType && opts.reportType !== "ALL" ? { reportType: opts.reportType } : {}),
      ...(search
        ? {
            OR: [
              { visit: { patient: { fullName: { contains: search, mode: "insensitive" } } } },
              { visit: { patient: { patientId: { contains: search, mode: "insensitive" } } } },
              { visit: { visitNumber: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
      ...(dateRange ? { updatedAt: dateRange } : {}),
    },
    include: { visit: { include: { patient: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return reports;
}

export async function getReportDetails(actor: ReportActor, reportId: string) {
  ensurePreviewAccess(actor);
  await assertReportCoreAccess(actor);
  const report = await prisma.diagnosticReport.findFirst({
    where: { id: reportId, organizationId: actor.organizationId },
    include: {
      organization: true,
      visit: { include: { patient: true } },
      versions: {
        include: { editedBy: { select: { id: true, fullName: true } } },
        orderBy: { version: "desc" },
      },
    },
  });
  if (!report) throw new Error("REPORT_NOT_FOUND");
  if (!isReportDepartment(report.department)) throw new Error("INVALID_REPORT_DEPARTMENT");
  if (actor.role === "RECEPTIONIST" && !report.isReleased) {
    throw new Error("FORBIDDEN_UNRELEASED_REPORT");
  }
  const expectedType = reportTypeForDepartment(report.department);
  if (report.reportType !== expectedType) {
    await prisma.diagnosticReport.update({
      where: { id: report.id },
      data: { reportType: expectedType },
    });
    report.reportType = expectedType;
  }
  assertReportTypeMatchesDepartment(report.reportType, report.department);
  return report;
}

export async function updateReportDraft(
  actor: ReportActor,
  input: {
    reportId: string;
    reportContent?: unknown;
    comments?: string | null;
    prescription?: string | null;
    reason: string;
  }
) {
  if (!input.reason?.trim()) throw new Error("REASON_REQUIRED");
  await assertReportCoreAccess(actor);
  const canMdEdit = canMdEditReport(actor.role);
  const canDispatchEdit = canDispatchReleasedReport(actor.role);
  if (!canMdEdit && !canDispatchEdit) throw new Error("FORBIDDEN_ROLE");

  const report = await getReportDetails(actor, input.reportId);
  const dispatchEditMode =
    report.status === ReportStatus.RELEASED && report.isReleased && canDispatchEdit;
  if (!canMdEdit && !dispatchEditMode) throw new Error("FORBIDDEN_ROLE");
  if (report.status === ReportStatus.RELEASED && !dispatchEditMode) throw new Error("REPORT_ALREADY_RELEASED");
  if (!hasValidReportContent(input.reportContent ?? report.reportContent)) throw new Error("INVALID_REPORT_CONTENT");

  const activeVersion = report.versions.find((version) => version.isActive) ?? report.versions[0] ?? null;
  if (!activeVersion) throw new Error("INVALID_VERSION_CHAIN");
  const nextVersion = (report.versions[0]?.version ?? 0) + 1;

  const content = (input.reportContent ?? activeVersion.content ?? report.reportContent) as any;
  assertContentMatchesDepartment(content, report.department);

  await prisma.$transaction(async (tx) => {
    await tx.diagnosticReportVersion.updateMany({
      where: { reportId: report.id, isActive: true },
      data: { isActive: false },
    });
    await tx.diagnosticReportVersion.create({
      data: {
        reportId: report.id,
        version: nextVersion,
        content,
        comments: input.comments ?? report.comments,
        prescription: input.prescription ?? report.prescription,
        isActive: true,
        parentId: activeVersion.id,
        editedById: actor.id,
        editReason: input.reason,
      },
    });
    await tx.diagnosticReport.update({
      where: { id: report.id },
      data: {
        reportContent: content,
        comments: input.comments ?? report.comments,
        prescription: input.prescription ?? report.prescription,
        lastEditedById: actor.id,
        lastEditedAt: new Date(),
        updatedAt: new Date(),
        status: dispatchEditMode ? report.status : ReportStatus.DRAFT,
      },
    });

    if (!dispatchEditMode) {
      await tx.review.updateMany({
        where: { visitId: report.visitId, organizationId: actor.organizationId, status: ReviewStatus.APPROVED },
        data: {
          status: ReviewStatus.PENDING,
          comments: "Report draft updated by MD and reset for HRM release review.",
        },
      });
      await tx.testOrder.updateMany({
        where: {
          visitId: report.visitId,
          organizationId: actor.organizationId,
          status: OrderStatus.APPROVED,
          test: { department: report.department },
        },
        data: {
          status: OrderStatus.RESUBMITTED,
          approvedAt: null,
        },
      });
    }
  });

  await createAuditLog({
    actorId: actor.id,
    actorRole: actor.role as Role,
    action: dispatchEditMode ? "REPORT_DISPATCH_EDITED" : "REPORT_DRAFT_UPDATED",
    entityType: "DiagnosticReport",
    entityId: report.id,
    changes: {
      reason: input.reason,
      version: nextVersion,
      department: report.department,
      before: {
        comments: report.comments,
        prescription: report.prescription,
      },
      after: {
        comments: input.comments ?? report.comments,
        prescription: input.prescription ?? report.prescription,
      },
    },
    notes: input.reason,
    ...actor.auditMeta,
  });

  if (!dispatchEditMode) {
    const mdUsers = await prisma.staff.findMany({
      where: { organizationId: actor.organizationId, role: Role.MD, status: "ACTIVE" },
      select: { id: true },
    });
    const performerIds = report.sourceTaskId
      ? (
          await prisma.routingTask.findUnique({
            where: { id: report.sourceTaskId },
            select: { staffId: true },
          })
        )?.staffId
      : null;

    await notifyResultEdited({
      organizationId: actor.organizationId,
      taskId: report.sourceTaskId ?? report.id,
      patientName: report.visit.patient.fullName,
      editorId: actor.id,
      mdIds: mdUsers.map((md) => md.id),
      performerIds: performerIds ? [performerIds] : [],
      dedupeSeed: `report-v${nextVersion}`,
    });

    await sendNotificationToRoles({
      organizationId: actor.organizationId,
      roles: [Role.HRM, Role.SUPER_ADMIN],
      type: NotificationType.REPORT_DRAFT_UPDATED,
      title: "Report draft updated",
      message: `${getReportLabel(report.department)} for ${report.visit.patient.fullName} was updated by MD.`,
      entityId: report.id,
      entityType: "DiagnosticReport",
      dedupeKeyPrefix: `report-draft-updated:${report.id}:v${nextVersion}`,
    });
  }
}

export async function releaseReport(
  actor: ReportActor,
  input: {
    reportId: string;
    instructions?: string;
    method: "PRINT" | "DOWNLOAD" | "WHATSAPP";
  }
) {
  if (!canHrmReleaseReport(actor.role)) throw new Error("FORBIDDEN_ROLE");
  await assertReportCoreAccess(actor);

  const report = await getReportDetails(actor, input.reportId);
  if (!canRelease(report.status, report.isReleased)) throw new Error("REPORT_ALREADY_RELEASED");

  const activeVersion = report.versions.find((version) => version.isActive) ?? report.versions[0] ?? null;
  if (!activeVersion) throw new Error("INVALID_VERSION_CHAIN");

  await prisma.$transaction(async (tx) => {
    await tx.diagnosticReport.update({
      where: { id: report.id },
      data: {
        status: ReportStatus.RELEASED,
        isReleased: true,
        releasedAt: new Date(),
        releasedById: actor.id,
        releaseInstructions: input.instructions,
        lastActionAt: new Date(),
      },
    });
    await tx.testOrder.updateMany({
      where: {
        visitId: report.visitId,
        organizationId: actor.organizationId,
        test: { department: report.department },
        status: { in: [OrderStatus.APPROVED, OrderStatus.RESUBMITTED] },
      },
      data: { status: OrderStatus.RELEASED, releasedAt: new Date() },
    });

    const pendingOrderCount = await tx.testOrder.count({
      where: {
        visitId: report.visitId,
        organizationId: actor.organizationId,
        status: { notIn: [OrderStatus.RELEASED, OrderStatus.CANCELLED] },
      },
    });
    if (pendingOrderCount === 0) {
      await tx.visit.update({
        where: { id: report.visitId },
        data: { status: VisitStatus.COMPLETED },
      });
    }
  });

  await createAuditLog({
    actorId: actor.id,
    actorRole: actor.role as Role,
    action: AUDIT_ACTIONS.RESULT_RELEASED,
    entityType: "DiagnosticReport",
    entityId: report.id,
    changes: {
      method: input.method,
      instructions: input.instructions ?? null,
      activeVersion: activeVersion.version,
      effectiveRole: "HRM",
    },
    notes: `Report released via ${input.method}`,
    ...actor.auditMeta,
  });

  await sendNotificationToRoles({
    organizationId: actor.organizationId,
    roles: [Role.MD, Role.SUPER_ADMIN],
    type: NotificationType.REPORT_RELEASED,
    title: "Report released",
    message: `${getReportLabel(report.department)} for ${report.visit.patient.fullName} has been released.`,
    entityId: report.id,
    entityType: "DiagnosticReport",
    dedupeKeyPrefix: `report-released:${report.id}`,
  });

  if (input.instructions?.trim()) {
    const receptionists = await prisma.staff.findMany({
      where: { organizationId: actor.organizationId, role: Role.RECEPTIONIST, status: "ACTIVE" },
      select: { id: true },
    });
    for (const r of receptionists) {
      await sendNotification({
        organizationId: actor.organizationId,
        userId: r.id,
        type: NotificationType.SYSTEM,
        title: "Reception instruction",
        message: input.instructions,
        entityId: report.id,
        entityType: "DiagnosticReport",
        dedupeKey: `reception-instruction:${report.id}:${r.id}`,
      });
    }
  }

  const receptionists = await prisma.staff.findMany({
    where: { organizationId: actor.organizationId, role: Role.RECEPTIONIST, status: "ACTIVE" },
    select: { id: true },
  });
  for (const r of receptionists) {
    await sendNotification({
      organizationId: actor.organizationId,
      userId: r.id,
      type: NotificationType.SYSTEM,
      title: "Result ready for dispatch",
      message: input.instructions?.trim()
        ? `A released report is ready. Instruction: ${input.instructions}`
        : "A released report is ready for dispatch actions (print, download, WhatsApp).",
      entityId: report.id,
      entityType: "DiagnosticReport",
      dedupeKey: `reception-dispatch-ready:${report.id}:${r.id}`,
    });
  }
}

export async function trackReportAction(
  actor: ReportActor,
  input: {
    reportId: string;
    action: "PRINT" | "DOWNLOAD" | "SEND_WHATSAPP" | "SEND_WHATSAPP_FAILED";
    notes?: string;
  }
) {
  if (!canDispatchReleasedReport(actor.role)) throw new Error("FORBIDDEN_ROLE");
  await assertReportCoreAccess(actor);
  const report = await getReportDetails(actor, input.reportId);
  if (!report.isReleased && input.action !== "PRINT") {
    throw new Error("REPORT_NOT_RELEASED");
  }

  const auditAction =
    input.action === "PRINT"
      ? "REPORT_PRINTED"
      : input.action === "DOWNLOAD"
      ? "REPORT_DOWNLOADED"
      : input.action === "SEND_WHATSAPP"
      ? "REPORT_SENT"
      : "REPORT_SEND_FAILED";

  await createAuditLog({
    actorId: actor.id,
    actorRole: actor.role as Role,
    action: auditAction,
    entityType: "DiagnosticReport",
    entityId: report.id,
    changes: {
      action: input.action,
      effectiveRole: "HRM",
    },
    notes: input.notes ?? undefined,
    ...actor.auditMeta,
  });

  const notifType =
    input.action === "PRINT"
      ? NotificationType.REPORT_PRINTED
      : input.action === "DOWNLOAD"
      ? NotificationType.REPORT_DOWNLOADED
      : input.action === "SEND_WHATSAPP"
      ? NotificationType.REPORT_SENT
      : NotificationType.REPORT_SEND_FAILED;

  await sendNotificationToRoles({
    organizationId: actor.organizationId,
    roles: [Role.MD, Role.SUPER_ADMIN],
    type: notifType,
    title:
      input.action === "PRINT"
        ? "Report printed"
        : input.action === "DOWNLOAD"
        ? "Report downloaded"
        : input.action === "SEND_WHATSAPP"
        ? "Report sent to patient"
        : "Report send failed",
    message: `${getReportLabel(report.department)} for ${report.visit.patient.fullName}: ${input.action}`,
    entityId: report.id,
    entityType: "DiagnosticReport",
    dedupeKeyPrefix: `report-action:${report.id}:${input.action}`,
  });
}

export async function renderReportForPreview(
  actor: ReportActor,
  reportId: string,
  options?: {
    includeLetterhead?: boolean;
    showPrintButton?: boolean;
    autoPrint?: boolean;
    baseUrl?: string;
  }
) {
  await assertReportCoreAccess(actor);
  const report = await getReportDetails(actor, reportId);
  const activeVersion = report.versions.find((version) => version.isActive) ?? report.versions[0] ?? null;
  const effectiveContent = activeVersion?.content ?? report.reportContent ?? {};
  assertContentMatchesDepartment(effectiveContent, report.department);
  const versionContent = (effectiveContent ?? {}) as Record<string, unknown>;
  const existingPatient =
    versionContent.patient && typeof versionContent.patient === "object"
      ? (versionContent.patient as Record<string, unknown>)
      : {};
  const renderContent = {
    ...versionContent,
    patient: {
      ...existingPatient,
      fullName: report.visit.patient.fullName,
      patientId: report.visit.patient.patientId,
      age: report.visit.patient.age,
      dateOfBirth: report.visit.patient.dateOfBirth?.toISOString() ?? null,
      sex: report.visit.patient.sex,
    },
  };

  const allowLetterhead = canUseCustomLetterhead(report.organization);
  const showWatermark = shouldShowWatermark(report.organization);

  const html = renderReportHtml({
    organization: {
      name: report.organization.name,
      address: report.organization.address,
      phone: report.organization.phone,
      email: report.organization.email,
      logo: report.organization.logo,
      letterheadUrl: report.organization.letterheadUrl,
    },
    department: report.department,
    content: renderContent as any,
    comments: activeVersion?.comments ?? report.comments,
    prescription: activeVersion?.prescription ?? report.prescription,
    mdName: null,
    watermarkUrl: showWatermark ? "/diagsync-watermark.png" : undefined,
    includeLetterhead: (options?.includeLetterhead ?? true) && allowLetterhead,
    showPrintButton: options?.showPrintButton === true,
    autoPrint: options?.autoPrint === true,
    baseUrl: options?.baseUrl,
  });

  return {
    report,
    activeVersion,
    html,
  };
}
