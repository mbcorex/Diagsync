"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/index";
import { ResultInsightBox } from "@/components/results/result-insight-box";
import { buildResultInsights } from "@/lib/result-insights";
import { PatientInsights } from "@/components/patients/patient-insights";
import { analyzePatientInsights, type PatientHistoryRow } from "@/lib/patient-insights";
import { toCustomFieldKey } from "@/lib/custom-fields-core";
import { SIGNOFF_IMAGE_KEY, SIGNOFF_NAME_KEY, isDataImageUrl } from "@/lib/report-signoff";
import { formatPatientAge } from "@/lib/patient-age";
import { formatReferenceDisplay } from "@/lib/reference-ranges";

type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";
type TaskDepartment = "LABORATORY" | "RADIOLOGY";
type ResultTemplateFieldMeta = {
  id: string;
  label: string;
  fieldKey: string;
  fieldType: "NUMBER" | "TEXT" | "TEXTAREA" | "DROPDOWN" | "CHECKBOX";
  unit?: string | null;
  normalMin?: number | null;
  normalMax?: number | null;
  normalText?: string | null;
  referenceNote?: string | null;
  sortOrder: number;
};

type Item = {
  id: string;
  department: TaskDepartment;
  priority: "ROUTINE" | "URGENT" | "EMERGENCY";
  updatedAt: string;
  visit: {
    visitNumber: string;
    patient: { fullName: string; patientId: string; age: number; dateOfBirth?: string | null; sex: string };
  };
  staff: { fullName: string } | null;
  startedByName?: string;
  submittedByName?: string;
  review: { status: ReviewStatus; comments?: string | null; rejectionReason?: string | null; editedData?: unknown } | null;
  results: Array<{
    testOrderId: string;
    testOrder: { test: { name: string; resultFields: ResultTemplateFieldMeta[] } };
    currentVersion: number;
    resultData: Record<string, unknown>;
    notes?: string | null;
    versionHistory: Array<{ id: string; version: number; isActive: boolean; parentId?: string | null; resultData: Record<string, unknown>; notes?: string | null; editReason: string; editedBy: { id: string; fullName: string }; createdAt: string }>;
  }>;
  radiologyReport: { currentVersion: number; findings: string; impression: string; notes?: string | null; extraFields?: Record<string, string> | null; versionHistory: Array<{ id: string; version: number; isActive: boolean; parentId?: string | null; findings: string; impression: string; notes?: string | null; extraFields?: Record<string, string> | null; editReason: string; editedBy: { id: string; fullName: string }; createdAt: string }> } | null;
  imagingFiles: Array<{ id: string; fileName: string; fileUrl: string }>;
  patientHistory: PatientHistoryRow[];
  patientVisitCount: number;
};

const priorityStyle: Record<string, string> = {
  EMERGENCY: "bg-red-50 text-red-600",
  URGENT: "bg-amber-50 text-amber-700",
  ROUTINE: "bg-slate-100 text-slate-600",
};

const reviewStyle: Record<string, string> = {
  PENDING: "bg-blue-50 text-blue-700",
  APPROVED: "bg-green-50 text-green-700",
  REJECTED: "bg-red-50 text-red-600",
};

function minutesAgoLabel(dateText: string) {
  const deltaMs = Math.max(0, Date.now() - new Date(dateText).getTime());
  const mins = Math.max(1, Math.floor(deltaMs / 60000));
  if (mins < 60) return `${mins}min ago`;

  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) {
    if (remMins === 0) return `${hours}hr${hours > 1 ? "s" : ""} ago`;
    return `${hours}hr${hours > 1 ? "s" : ""} ${remMins}min ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days > 1 ? "s" : ""} ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`;

  const years = Math.floor(days / 365);
  return `${years} yr${years > 1 ? "s" : ""} ago`;
}

function normalizeResultData(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value ?? {}).map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)])
  );
}

type MdSensitivityRow = { antibiotic: string; zone: string; interpretation: string };

function parseMdSensitivity(raw: unknown): MdSensitivityRow[] {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return [];
  return text
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.includes("||")) {
        const [antibiotic = "", zone = "", interpretation = ""] = line.split("||");
        return {
          antibiotic: antibiotic.trim(),
          zone: zone.trim(),
          interpretation: interpretation.trim().toUpperCase(),
        };
      }
      const interpretationMatch = line.match(/\b(S|R|I)\b/i);
      const zoneMatch = line.match(/\b(\d+\+|\+\+\+|\+\+|\+|\d+(?:\.\d+)?\s*mm|\d+)\b/i);
      const colonIdx = line.indexOf(":");
      let antibiotic = line;
      if (colonIdx > 0) antibiotic = line.slice(0, colonIdx).trim();
      else if (interpretationMatch?.index !== undefined) antibiotic = line.slice(0, interpretationMatch.index).trim();
      else if (zoneMatch?.index !== undefined) antibiotic = line.slice(0, zoneMatch.index).trim();
      return {
        antibiotic: antibiotic.replace(/[-–:,]+$/g, "").trim(),
        zone: zoneMatch?.[1]?.trim() ?? "",
        interpretation: interpretationMatch?.[1]?.toUpperCase() ?? "",
      };
    })
    .filter((row) => row.antibiotic.length > 0);
}

function getHighlightFields(review: Item["review"]) {
  if (!review?.editedData || typeof review.editedData !== "object") return [];
  const data = review.editedData as { highlightFields?: unknown };
  if (!Array.isArray(data.highlightFields)) return [];
  return data.highlightFields.filter((row): row is string => typeof row === "string");
}

function getRadiologySignature(extraFields?: Record<string, string> | null) {
  const signatureName = extraFields?.[SIGNOFF_NAME_KEY]?.trim() ?? "";
  const signatureImage = extraFields?.[SIGNOFF_IMAGE_KEY]?.trim() ?? "";
  if (!signatureName || !signatureImage) return null;
  if (!isDataImageUrl(signatureImage)) return null;
  return { signatureName, signatureImage };
}

function getVisibleRadiologyExtraFields(extraFields?: Record<string, string> | null) {
  return Object.entries(extraFields ?? {}).filter(
    ([key, value]) =>
      key !== SIGNOFF_IMAGE_KEY &&
      key !== SIGNOFF_NAME_KEY &&
      !key.startsWith("__") &&
      !key.startsWith("test_") &&
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ""
  );
}

function formatExtraFieldLabel(key: string): string {
  // Extract the part after "__" if it exists, otherwise use the whole key
  const parts = key.split("__");
  const fieldName = parts.length > 1 ? parts[parts.length - 1] : key;
  
  // Convert underscores to spaces and capitalize first letter of each word
  return fieldName
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function MdReviewBoard({
  initialStatus = "pending",
  viewerRole,
}: {
  initialStatus?: "pending" | "approved" | "rejected" | "all";
  viewerRole?: "MD" | "HRM" | "SUPER_ADMIN" | string;
}) {
  const router = useRouter();
  const REVIEW_CACHE_TTL_MS = 20_000;
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "all">(initialStatus);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [rejectFieldHints, setRejectFieldHints] = useState<Record<string, string>>({});
  const [editReasons, setEditReasons] = useState<Record<string, string>>({});
  const [approveComments, setApproveComments] = useState<Record<string, string>>({});
  const [unapproveReasons, setUnapproveReasons] = useState<Record<string, string>>({});
  const [labEdits, setLabEdits] = useState<Record<string, Record<string, Record<string, string>>>>({});
  const [labEditNotes, setLabEditNotes] = useState<Record<string, Record<string, string>>>({});
  const [radiologyEdits, setRadiologyEdits] = useState<Record<string, { findings: string; impression: string; notes: string; extraFields: Record<string, string> }>>({});
  const [newRadFieldLabel, setNewRadFieldLabel] = useState<Record<string, string>>({});
  const [newRadFieldValue, setNewRadFieldValue] = useState<Record<string, string>>({});
  const loadDataSeqRef = useRef(0);
  const reviewCacheRef = useRef<Map<string, { at: number; items: Item[]; counts: { pending: number; approved: number; rejected: number } }>>(new Map());

  function applyLoadedData(data: { items: Item[]; counts: { pending: number; approved: number; rejected: number } }) {
    setItems(data.items);
    setCounts(data.counts);
    const nextLabEdits: Record<string, Record<string, Record<string, string>>> = {};
    const nextLabNotes: Record<string, Record<string, string>> = {};
    const nextRadEdits: Record<string, { findings: string; impression: string; notes: string; extraFields: Record<string, string> }> = {};
    for (const item of data.items) {
      if (item.department === "LABORATORY") {
        nextLabEdits[item.id] = {};
        nextLabNotes[item.id] = {};
        for (const result of item.results) {
          nextLabEdits[item.id][result.testOrderId] = normalizeResultData(result.resultData);
          nextLabNotes[item.id][result.testOrderId] = result.notes ?? "";
        }
      } else {
        nextRadEdits[item.id] = {
          findings: item.radiologyReport?.findings ?? "",
          impression: item.radiologyReport?.impression ?? "",
          notes: item.radiologyReport?.notes ?? "",
          extraFields: item.radiologyReport?.extraFields ?? {},
        };
      }
    }
    setLabEdits(nextLabEdits);
    setLabEditNotes(nextLabNotes);
    setRadiologyEdits(nextRadEdits);
  }

  async function loadData(opts?: { signal?: AbortSignal; force?: boolean }) {
    const cacheKey = status;
    if (!opts?.force) {
      const cached = reviewCacheRef.current.get(cacheKey);
      if (cached && Date.now() - cached.at < REVIEW_CACHE_TTL_MS) {
        setError("");
        setLoading(false);
        applyLoadedData({ items: cached.items, counts: cached.counts });
        return;
      }
    }

    const requestId = ++loadDataSeqRef.current;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/md/reviews?status=${status}`, { signal: opts?.signal });
      const json = await res.json() as { success: boolean; error?: string; data: { items: Item[]; counts: { pending: number; approved: number; rejected: number } } };
      if (requestId !== loadDataSeqRef.current || opts?.signal?.aborted) return;
      if (!json.success) { setError(json.error ?? "Failed to load review queue"); return; }
      reviewCacheRef.current.set(cacheKey, { at: Date.now(), items: json.data.items, counts: json.data.counts });
      applyLoadedData(json.data);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setError("Network error while loading reviews");
    } finally {
      if (requestId !== loadDataSeqRef.current || opts?.signal?.aborted) return;
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadData({ signal: controller.signal });
    return () => controller.abort();
  }, [status]);

  function applyOptimisticReview(taskId: string, nextStatus: ReviewStatus, reason?: string) {
    const current = items.find((item) => item.id === taskId)?.review?.status ?? "PENDING";
    setItems((prev) => prev.map((item) => item.id === taskId ? { ...item, review: { status: nextStatus, comments: item.review?.comments ?? null, rejectionReason: reason ?? item.review?.rejectionReason ?? null, editedData: item.review?.editedData } } : item));
    if (current !== nextStatus) {
      setCounts((prev) => ({
        pending: prev.pending + (current === "PENDING" ? -1 : 0) + (nextStatus === "PENDING" ? 1 : 0),
        approved: prev.approved + (current === "APPROVED" ? -1 : 0) + (nextStatus === "APPROVED" ? 1 : 0),
        rejected: prev.rejected + (current === "REJECTED" ? -1 : 0) + (nextStatus === "REJECTED" ? 1 : 0),
      }));
    }
  }
  function invalidateReviewCache() {
    reviewCacheRef.current.clear();
  }

  async function approve(taskId: string) {
    setBusyTaskId(taskId); setError("");
    invalidateReviewCache();
    applyOptimisticReview(taskId, "APPROVED");
    try {
      const res = await fetch(`/api/md/reviews/${taskId}/approve`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comments: approveComments[taskId] ?? "" }) });
      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) { setError(json.error ?? "Approval failed"); await loadData(); }
      else {
        setExpandedId(null);
        if (viewerRole === "HRM" || viewerRole === "SUPER_ADMIN") {
          router.push("/dashboard/hrm/release");
          return;
        }
      }
    } finally { setBusyTaskId(null); }
  }

  async function reject(taskId: string) {
    const reason = rejectReasons[taskId]?.trim();
    if (!reason) { setError("Rejection reason is required."); return; }
    setBusyTaskId(taskId); setError("");
    invalidateReviewCache();
    applyOptimisticReview(taskId, "REJECTED", reason);
    try {
      const highlightFields = (rejectFieldHints[taskId] ?? "").split(",").map((v) => v.trim()).filter(Boolean);
      const res = await fetch(`/api/md/reviews/${taskId}/reject`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, highlightFields }) });
      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) { setError(json.error ?? "Rejection failed"); await loadData(); }
      else setExpandedId(null);
    } finally { setBusyTaskId(null); }
  }

  async function unapprove(taskId: string) {
    setBusyTaskId(taskId); setError("");
    invalidateReviewCache();
    applyOptimisticReview(taskId, "PENDING");
    try {
      const res = await fetch(`/api/md/reviews/${taskId}/unapprove`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: unapproveReasons[taskId] ?? "" }),
      });
      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) { setError(json.error ?? "Unapprove failed"); await loadData(); }
      else setExpandedId(null);
    } finally { setBusyTaskId(null); }
  }

  async function edit(taskId: string) {
    const reason = editReasons[taskId]?.trim();
    if (!reason) { setError("Edit reason is required."); return; }
    const item = items.find((row) => row.id === taskId);
    if (!item) { setError("Task not found."); return; }
    let payload: any;
    if (item.department === "LABORATORY") {
      payload = { testResults: item.results.map((result) => ({ testOrderId: result.testOrderId, resultData: labEdits[taskId]?.[result.testOrderId] ?? normalizeResultData(result.resultData), notes: labEditNotes[taskId]?.[result.testOrderId] ?? result.notes ?? "" })) };
    } else {
      const current = radiologyEdits[taskId] ?? {
        findings: item.radiologyReport?.findings ?? "",
        impression: item.radiologyReport?.impression ?? "",
        notes: item.radiologyReport?.notes ?? "",
        extraFields: item.radiologyReport?.extraFields ?? {},
      };
      if (!current.findings.trim() || !current.impression.trim()) { setError("Findings and impression are required."); return; }
      payload = { report: current };
    }
    setBusyTaskId(taskId); setError("");
    invalidateReviewCache();
    applyOptimisticReview(taskId, "PENDING");
    try {
      const res = await fetch(`/api/md/reviews/${taskId}/edit`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, comments: "Controlled edit created and sent for re-approval", editedData: payload }) });
      const json = await res.json() as { success: boolean; error?: string };
      if (!json.success) { setError(json.error ?? "Edit failed"); await loadData(); }
      else setExpandedId(null);
    } finally { setBusyTaskId(null); }
  }

  function setRadExtraField(taskId: string, fieldKey: string, value: string) {
    setRadiologyEdits((prev) => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] ?? { findings: "", impression: "", notes: "", extraFields: {} }),
        extraFields: {
          ...((prev[taskId] ?? { findings: "", impression: "", notes: "", extraFields: {} }).extraFields ?? {}),
          [fieldKey]: value,
        },
      },
    }));
  }

  function removeRadExtraField(taskId: string, fieldKey: string) {
    setRadiologyEdits((prev) => {
      const current = prev[taskId] ?? { findings: "", impression: "", notes: "", extraFields: {} };
      if (!Object.prototype.hasOwnProperty.call(current.extraFields, fieldKey)) return prev;
      const nextExtra = { ...current.extraFields };
      delete nextExtra[fieldKey];
      return { ...prev, [taskId]: { ...current, extraFields: nextExtra } };
    });
  }

  function addRadExtraField(taskId: string, label: string, value: string) {
    const key = toCustomFieldKey(label);
    if (!key) {
      setError("Field name is invalid.");
      return;
    }
    const current = radiologyEdits[taskId] ?? { findings: "", impression: "", notes: "", extraFields: {} };
    if (Object.prototype.hasOwnProperty.call(current.extraFields, key)) {
      setError(`Field '${key}' already exists.`);
      return;
    }
    setError("");
    setRadExtraField(taskId, key, value);
  }

  function resetRadExtraFields(taskId: string) {
    setRadiologyEdits((prev) => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] ?? { findings: "", impression: "", notes: "", extraFields: {} }),
        extraFields: {},
      },
    }));
  }

  if (loading) return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-xs text-slate-400">Loading...</div>
  );

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-px rounded-lg border border-slate-200 bg-slate-200 overflow-hidden">
        {[{ label: "Pending", value: counts.pending }, { label: "Approved", value: counts.approved }, { label: "Rejected", value: counts.rejected }].map((s) => (
          <div key={s.label} className="bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">{s.label}</p>
            <p className="text-xl font-bold text-slate-800 mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <button onClick={() => void loadData({ force: true })} className="rounded border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 transition-colors">Refresh</button>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}

      {/* Table */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-slate-400">No cases for selected status.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">Patient</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">Dept</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">Tests / Report</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">Priority</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">Status</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">Audit Trail</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">Updated</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => {
                const reviewStatus = item.review?.status ?? "PENDING";
                const highlightFields = getHighlightFields(item.review);
                const isExpanded = expandedId === item.id;
                const submittedRadSignature = getRadiologySignature(item.radiologyReport?.extraFields);
                const submittedRadExtraFields = getVisibleRadiologyExtraFields(item.radiologyReport?.extraFields);
                const editRadSignature = getRadiologySignature(radiologyEdits[item.id]?.extraFields);
                const editRadExtraFields = getVisibleRadiologyExtraFields(radiologyEdits[item.id]?.extraFields);
                const insights = isExpanded
                  ? analyzePatientInsights({
                      visitCount: item.patientVisitCount,
                      currentTestNames:
                        item.department === "LABORATORY"
                          ? item.results.map((r) => r.testOrder.test.name)
                          : ["Radiology follow-up"],
                      history: item.patientHistory,
                    })
                  : null;

                return (
                  <>
                    <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${isExpanded ? "bg-blue-50/20" : ""}`}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-800">{item.visit.patient.fullName}</p>
                        <p className="font-mono text-slate-400">
                          {item.visit.patient.patientId} Â· {formatPatientAge({ age: item.visit.patient.age, dateOfBirth: item.visit.patient.dateOfBirth })} Â· {item.visit.patient.sex}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{item.department}</td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {item.department === "LABORATORY"
                          ? item.results.map((r) => r.testOrder.test.name).join(", ")
                          : `Findings: ${(item.radiologyReport?.findings ?? "").slice(0, 40)}...`}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded px-1.5 py-0.5 font-medium ${priorityStyle[item.priority]}`}>{item.priority}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded px-1.5 py-0.5 font-medium ${reviewStyle[reviewStatus]}`}>{reviewStatus}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">
                        <p>Started: {item.startedByName?.trim() ? item.startedByName : "—"}</p>
                        <p>Submitted: {item.submittedByName?.trim() ? item.submittedByName : item.staff?.fullName ?? "—"}</p>
                      </td>
                      <td className="px-4 py-2.5 text-slate-400">{minutesAgoLabel(item.updatedAt)}</td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : item.id)}
                          className="rounded border border-slate-200 px-2.5 py-1 text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          {isExpanded ? "Close" : "Review"}
                        </button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr key={`${item.id}-expand`}>
                        <td colSpan={8} className="px-4 py-4 bg-slate-50 border-b border-slate-200">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                            {/* Left: submitted output */}
                            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Submitted Output</p>
                              <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
                                <p>Started by: <span className="font-medium text-slate-700">{item.startedByName?.trim() ? item.startedByName : "—"}</span></p>
                                <p>Submitted by: <span className="font-medium text-slate-700">{item.submittedByName?.trim() ? item.submittedByName : item.staff?.fullName ?? "—"}</span></p>
                              </div>
                              {insights ? <PatientInsights insights={insights} /> : null}
                              {item.department === "LABORATORY" ? (
                                <div className="space-y-2">
                                  {item.results.map((result) => (
                                    <div key={result.testOrderId} className="rounded border border-slate-100 p-2">
                                      {(() => {
                                        const resultData = result.resultData as Record<string, unknown>;
                                        const sensitivityRows = parseMdSensitivity(resultData?.sensitivity);
                                        const resultRows = Object.entries(resultData)
                                          .filter(
                                            ([key, value]) =>
                                              key !== "sensitivity" &&
                                              value !== null &&
                                              value !== undefined &&
                                              `${value}`.trim()
                                          )
                                          .map(([fieldKey, rawValue]) => {
                                            const fieldMeta = result.testOrder.test.resultFields.find(
                                              (field) => field.fieldKey === fieldKey
                                            );
                                            const valueText = String(rawValue);
                                            const referenceText = fieldMeta ? formatReferenceDisplay(fieldMeta) : "";
                                            return {
                                              fieldKey,
                                              label: fieldMeta?.label ?? fieldKey,
                                              valueText,
                                              unitText: fieldMeta?.unit?.trim() ?? "",
                                              referenceText,
                                            };
                                          });
                                        return (
                                          <>
                                      <p className="font-medium text-slate-800">{result.testOrder.test.name} <span className="font-mono text-slate-400 text-[11px]">v{result.currentVersion}</span></p>
                                      {resultRows.length > 0 ? (
                                        <div className="mt-2 overflow-x-auto rounded border border-slate-200">
                                          <table className="w-full min-w-[620px] border-collapse text-[11px]">
                                            <thead>
                                              <tr className="bg-slate-50">
                                                <th className="border border-slate-200 px-1.5 py-1 text-left text-slate-500">Parameter</th>
                                                <th className="border border-slate-200 px-1.5 py-1 text-left text-slate-500">Result</th>
                                                <th className="border border-slate-200 px-1.5 py-1 text-left text-slate-500">Unit (SI)</th>
                                                <th className="border border-slate-200 px-1.5 py-1 text-left text-slate-500">Reference Range</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {resultRows.map((row) => (
                                                <tr key={`${result.testOrderId}-${row.fieldKey}`}>
                                                  <td className="border border-slate-200 px-1.5 py-1 text-slate-700">{row.label}</td>
                                                  <td className="border border-slate-200 px-1.5 py-1 text-slate-700">{row.valueText}</td>
                                                  <td className="border border-slate-200 px-1.5 py-1 text-slate-700">{row.unitText || "-"}</td>
                                                  <td className="border border-slate-200 px-1.5 py-1 text-slate-700">{row.referenceText || "-"}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      ) : (
                                        <p className="text-slate-500 mt-1">-</p>
                                      )}
                                      {sensitivityRows.length > 0 ? (
                                        <div className="mt-2 overflow-x-auto rounded border border-slate-200">
                                          <table className="w-full min-w-[520px] border-collapse text-[11px]">
                                            <thead>
                                              <tr className="bg-slate-50">
                                                <th className="border border-slate-200 px-1.5 py-1 text-left text-slate-500">Sensitivity</th>
                                                <th className="border border-slate-200 px-1.5 py-1 text-left text-slate-500">Value</th>
                                                <th className="border border-slate-200 px-1.5 py-1 text-left text-slate-500">S/R/I</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {sensitivityRows.map((row, idx) => (
                                                <tr key={`${result.testOrderId}-sens-${idx}`}>
                                                  <td className="border border-slate-200 px-1.5 py-1 text-slate-700">{row.antibiotic}</td>
                                                  <td className="border border-slate-200 px-1.5 py-1 text-slate-700">{row.zone || "-"}</td>
                                                  <td className="border border-slate-200 px-1.5 py-1 text-slate-700">{row.interpretation || "-"}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      ) : null}
                                      {result.notes && <p className="text-slate-400 text-[11px] mt-0.5">Note: {result.notes}</p>}
                                      <ResultInsightBox messages={buildResultInsights(result.resultData)} />
                                          </>
                                        );
                                      })()}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="space-y-1.5">
                                  <p className="text-slate-700"><span className="font-medium">Findings:</span> {item.radiologyReport?.findings ?? "â€”"}</p>
                                  <p className="text-slate-700"><span className="font-medium">Impression:</span> {item.radiologyReport?.impression ?? "â€”"}</p>
                                  {submittedRadExtraFields.map(([key, value]) => (
                                    <p key={key} className="text-slate-700">
                                      <span className="font-medium">{formatExtraFieldLabel(key)}:</span> {value}
                                    </p>
                                  ))}
                                  {item.imagingFiles && item.imagingFiles.length > 0 ? (
                                    <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2">
                                      <p className="text-[11px] font-medium text-slate-600 mb-2">Imaging Files ({item.imagingFiles.length})</p>
                                      <div className="grid grid-cols-2 gap-2">
                                        {item.imagingFiles.map((file) => (
                                          <div key={file.id} className="rounded border border-slate-200 bg-white p-1.5">
                                            <a
                                              href={file.fileUrl}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="inline-block rounded overflow-hidden bg-slate-100"
                                            >
                                              <img
                                                src={file.fileUrl}
                                                alt={file.fileName}
                                                className="h-24 w-24 object-cover"
                                                onError={(e) => {
                                                  (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'%3E%3Crect fill='%23e2e8f0' width='96' height='96'/%3E%3Ctext x='48' y='48' font-size='12' text-anchor='middle' dominant-baseline='middle' fill='%2394a3b8'%3ENo preview%3C/text%3E%3C/svg%3E";
                                                }}
                                              />
                                            </a>
                                            <p className="text-[10px] text-slate-600 mt-1 truncate" title={file.fileName}>{file.fileName}</p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : null}
                                  {submittedRadSignature ? (
                                    <div className="rounded border border-slate-200 bg-slate-50 p-2">
                                      <p className="text-[11px] font-medium text-slate-600 mb-1">Signature</p>
                                      <img
                                        src={submittedRadSignature.signatureImage}
                                        alt={submittedRadSignature.signatureName}
                                        className="h-14 w-auto max-w-[220px] object-contain border border-slate-200 rounded bg-white p-1"
                                      />
                                      <p className="text-[11px] text-slate-700 mt-1">{submittedRadSignature.signatureName}</p>
                                    </div>
                                  ) : null}
                                  <p className="font-mono text-slate-400 text-[11px]">v{item.radiologyReport?.currentVersion ?? 1}</p>
                                </div>
                              )}
                            </div>

                            {/* Right: actions */}
                            <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Actions</p>

                              {item.review?.rejectionReason && (
                                <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
                                  Edit requested: {item.review.rejectionReason}
                                </div>
                              )}

                              {/* Approve */}
                              <div>
                                <label className="block text-[11px] font-medium text-slate-500 mb-1">Approval comment (optional)</label>
                                <input
                                  value={approveComments[item.id] ?? ""}
                                  onChange={(e) => setApproveComments((p) => ({ ...p, [item.id]: e.target.value }))}
                                  className="h-7 w-full rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  placeholder="Optional comment..."
                                />
                                <button disabled={busyTaskId === item.id || reviewStatus === "APPROVED"} onClick={() => approve(item.id)}
                                  className="mt-1.5 rounded bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors">
                                  {reviewStatus === "APPROVED" ? "Approved" : "Approve"}
                                </button>
                              </div>

                              {/* Unapprove */}
                              {reviewStatus === "APPROVED" ? (
                                <div className="border-t border-slate-100 pt-3">
                                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Unapprove reason (optional)</label>
                                  <input
                                    value={unapproveReasons[item.id] ?? ""}
                                    onChange={(e) => setUnapproveReasons((p) => ({ ...p, [item.id]: e.target.value }))}
                                    className="h-7 w-full rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    placeholder="Why move this back to pending?"
                                  />
                                  <button
                                    disabled={busyTaskId === item.id}
                                    onClick={() => unapprove(item.id)}
                                    className="mt-1.5 rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition-colors"
                                  >
                                    Unapprove To Pending
                                  </button>
                                </div>
                              ) : null}

                              {/* Reject */}
                              <div className="border-t border-slate-100 pt-3">
                                <label className="block text-[11px] font-medium text-slate-500 mb-1">Rejection reason *</label>
                                <textarea rows={2} value={rejectReasons[item.id] ?? ""} onChange={(e) => setRejectReasons((p) => ({ ...p, [item.id]: e.target.value }))}
                                  className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                <label className="block text-[11px] font-medium text-slate-500 mt-1.5 mb-1">Fields needing change (comma-separated)</label>
                                <input value={rejectFieldHints[item.id] ?? ""} onChange={(e) => setRejectFieldHints((p) => ({ ...p, [item.id]: e.target.value }))}
                                  placeholder="e.g. hemoglobin, wbc"
                                  className="h-7 w-full rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                <button disabled={busyTaskId === item.id} onClick={() => reject(item.id)}
                                  className="mt-1.5 rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors">
                                  Reject
                                </button>
                              </div>

                              {/* Edit data */}
                              <div className="border-t border-slate-100 pt-3">
                                <p className="text-[11px] font-semibold text-slate-400 mb-2">Edit Data</p>
                                {item.department === "LABORATORY" ? (
                                  <div className="space-y-2">
                                    {item.results.map((result) => (
                                      <div key={result.testOrderId} className="rounded border border-slate-100 p-2 space-y-1.5">
                                        <p className="font-medium text-slate-700">{result.testOrder.test.name}</p>
                                        <div className="grid grid-cols-2 gap-1.5">
                                          {Object.keys(normalizeResultData(result.resultData)).map((fieldKey) => (
                                            <label key={fieldKey}>
                                              <span className="block text-[11px] text-slate-400">{fieldKey}</span>
                                              <input
                                                value={labEdits[item.id]?.[result.testOrderId]?.[fieldKey] ?? ""}
                                                onChange={(e) => setLabEdits((prev) => ({ ...prev, [item.id]: { ...(prev[item.id] ?? {}), [result.testOrderId]: { ...((prev[item.id] ?? {})[result.testOrderId] ?? {}), [fieldKey]: e.target.value } } }))}
                                                className={`h-7 w-full rounded border px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 ${highlightFields.includes(fieldKey) ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}
                                              />
                                            </label>
                                          ))}
                                        </div>
                                        <label>
                                          <span className="block text-[11px] text-slate-400">Notes</span>
                                          <input value={labEditNotes[item.id]?.[result.testOrderId] ?? ""} onChange={(e) => setLabEditNotes((prev) => ({ ...prev, [item.id]: { ...(prev[item.id] ?? {}), [result.testOrderId]: e.target.value } }))}
                                            className="h-7 w-full rounded border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                        </label>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="space-y-1.5">
                                    {(["findings", "impression", "notes"] as const).map((field) => (
                                      <label key={field}>
                                        <span className="block text-[11px] text-slate-400 capitalize">{field}</span>
                                        <textarea rows={field === "notes" ? 1 : 2} value={radiologyEdits[item.id]?.[field] ?? ""}
                                          onChange={(e) => setRadiologyEdits((prev) => ({ ...prev, [item.id]: { ...(prev[item.id] ?? { findings: "", impression: "", notes: "", extraFields: {} }), [field]: e.target.value } }))}
                                          className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                      </label>
                                    ))}
                                    <div className="rounded border border-slate-200 p-2">
                                      <div className="mb-2 flex items-center justify-between">
                                        <span className="text-[11px] text-slate-500">Extra Fields</span>
                                        <button
                                          type="button"
                                          onClick={() => resetRadExtraFields(item.id)}
                                          className="rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
                                        >
                                          Reset Default
                                        </button>
                                      </div>
                                      <div className="space-y-1.5">
                                        {editRadExtraFields.map(([key, value]) => (
                                          <div key={key} className="grid grid-cols-12 gap-1.5 items-center">
                                            <input value={formatExtraFieldLabel(key)} readOnly className="col-span-4 h-7 rounded border border-slate-200 bg-slate-50 px-2 text-xs text-slate-500" />
                                            <input
                                              value={value}
                                              onChange={(e) => setRadExtraField(item.id, key, e.target.value)}
                                              className="col-span-6 h-7 rounded border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => {
                                                if (!window.confirm(`Remove extra field '${formatExtraFieldLabel(key)}'?`)) return;
                                                removeRadExtraField(item.id, key);
                                              }}
                                              className="col-span-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100"
                                            >
                                              Remove
                                            </button>
                                          </div>
                                        ))}
                                        {editRadSignature ? (
                                          <div className="rounded border border-slate-200 bg-slate-50 p-2">
                                            <p className="text-[11px] font-medium text-slate-600 mb-1">Signature Preview</p>
                                            <img
                                              src={editRadSignature.signatureImage}
                                              alt={editRadSignature.signatureName}
                                              className="h-14 w-auto max-w-[220px] object-contain border border-slate-200 rounded bg-white p-1"
                                            />
                                            <p className="text-[11px] text-slate-700 mt-1">{editRadSignature.signatureName}</p>
                                          </div>
                                        ) : null}
                                      </div>
                                      <div className="mt-2 grid grid-cols-12 gap-1.5">
                                        <input
                                          value={newRadFieldLabel[item.id] ?? ""}
                                          onChange={(e) => setNewRadFieldLabel((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                          placeholder="Field name"
                                          className="col-span-4 h-7 rounded border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        />
                                        <input
                                          value={newRadFieldValue[item.id] ?? ""}
                                          onChange={(e) => setNewRadFieldValue((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                          placeholder="Value"
                                          className="col-span-6 h-7 rounded border border-slate-200 bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const label = newRadFieldLabel[item.id] ?? "";
                                            const value = newRadFieldValue[item.id] ?? "";
                                            if (!label.trim()) return;
                                            addRadExtraField(item.id, label, value);
                                            setNewRadFieldLabel((prev) => ({ ...prev, [item.id]: "" }));
                                            setNewRadFieldValue((prev) => ({ ...prev, [item.id]: "" }));
                                          }}
                                          className="col-span-2 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100"
                                        >
                                          Add
                                        </button>
                                      </div>
                                    </div>
                                    {item.imagingFiles && item.imagingFiles.length > 0 ? (
                                      <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2">
                                        <p className="text-[11px] font-medium text-slate-600 mb-2">Imaging Files ({item.imagingFiles.length})</p>
                                        <div className="grid grid-cols-2 gap-2">
                                          {item.imagingFiles.map((file) => (
                                            <div key={file.id} className="rounded border border-slate-200 bg-white p-1.5">
                                              <a
                                                href={file.fileUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-block rounded overflow-hidden bg-slate-100"
                                              >
                                                <img
                                                  src={file.fileUrl}
                                                  alt={file.fileName}
                                                  className="h-24 w-24 object-cover"
                                                  onError={(e) => {
                                                    (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'%3E%3Crect fill='%23e2e8f0' width='96' height='96'/%3E%3Ctext x='48' y='48' font-size='12' text-anchor='middle' dominant-baseline='middle' fill='%2394a3b8'%3ENo preview%3C/text%3E%3C/svg%3E";
                                                  }}
                                                />
                                              </a>
                                              <p className="text-[10px] text-slate-600 mt-1 truncate" title={file.fileName}>{file.fileName}</p>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                )}
                                <label className="mt-2 block">
                                  <span className="block text-[11px] font-medium text-slate-500 mb-1">Edit reason *</span>
                                  <textarea rows={1} value={editReasons[item.id] ?? ""} onChange={(e) => setEditReasons((p) => ({ ...p, [item.id]: e.target.value }))}
                                    className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                </label>
                                <button disabled={busyTaskId === item.id} onClick={() => edit(item.id)}
                                  className="mt-1.5 rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                                  Save Edit
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
