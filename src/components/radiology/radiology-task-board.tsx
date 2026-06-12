// src/components/radiology/radiology-task-board.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/index";
import { formatDateTime } from "@/lib/utils";
import { toCustomFieldKey } from "@/lib/custom-fields-core";
import { SIGNOFF_IMAGE_KEY, SIGNOFF_NAME_KEY } from "@/lib/report-signoff";
import { formatPatientAge } from "@/lib/patient-age";
import {
  listOfflineRadiologyDraftItems,
  removeOfflineRadiologyDraft,
  upsertOfflineRadiologyDraft,
} from "@/lib/offline-sync";
import {
  SignaturePreset,
  loadSignaturePresets,
  removeSignaturePreset,
  saveSignaturePresets,
  upsertSignaturePreset,
} from "@/lib/signature-presets";
import {
  parseRadiologyPerTestSections,
  RADIOLOGY_PER_TEST_KEY,
  type RadiologyPerTestSection,
} from "@/lib/radiology-report-sections";
import { BulletListEditor } from "@/components/radiology/bullet-list-editor";
import { ImagePlus, X, Download } from "lucide-react";
import React from "react";

type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
type Priority = "ROUTINE" | "URGENT" | "EMERGENCY";
type Report = {
  findings: string;
  impression: string;
  notes?: string | null;
  extraFields?: Record<string, string> | null;
  isSubmitted: boolean;
};
type Task = {
  id: string;
  status: TaskStatus;
  priority: Priority;
  staffId?: string | null;
  canEdit?: boolean;
  createdAt: string;
  updatedAt: string;
  visit: {
    visitNumber: string;
    patient: { fullName: string; patientId: string; age: number; dateOfBirth?: string | null; sex: string };
  };
  radiologyReport: Report | null;
  testOrders: Array<{
    id: string;
    createdAt: string;
    test: {
      name: string;
      code: string;
      resultFields: Array<{
        label: string;
        fieldKey: string;
        fieldType: "NUMBER" | "TEXT" | "TEXTAREA" | "DROPDOWN" | "CHECKBOX";
        options?: string | null;
        isRequired: boolean;
      }>;
    };
  }>;
};

interface ImagingFile {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  createdAt: string;
}

type Draft = {
  findings: string;
  impression: string;
  notes: string;
  testReports: Record<string, { findings: string; impression: string; notes: string }>;
  extraFields: Record<string, string>;
  signatureName: string;
  signatureImage: string;
};

const EMPTY_DRAFT: Draft = {
  findings: "",
  impression: "",
  notes: "",
  testReports: {},
  extraFields: {},
  signatureName: "",
  signatureImage: "",
};

function sanitizeDraftExtraFields(
  extraFields: Record<string, string> | null | undefined
): Record<string, string> {
  const source = extraFields ?? {};
  return Object.fromEntries(
    Object.entries(source).filter(
      ([key]) =>
        key !== SIGNOFF_IMAGE_KEY &&
        key !== SIGNOFF_NAME_KEY &&
        key !== RADIOLOGY_PER_TEST_KEY
    )
  );
}

function perTestFieldStorageKey(testOrderId: string, fieldKey: string) {
  return `test_${testOrderId}__${fieldKey.trim().toLowerCase()}`;
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

const priorityStyle: Record<string, string> = {
  EMERGENCY: "bg-red-50 text-red-600", URGENT: "bg-amber-50 text-amber-700", ROUTINE: "bg-slate-100 text-slate-600",
};
const statusStyle: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-600", IN_PROGRESS: "bg-blue-50 text-blue-700", COMPLETED: "bg-green-50 text-green-700", CANCELLED: "bg-red-50 text-red-600",
};

export function RadiologyTaskBoard() {
  const TASK_CACHE_TTL_MS = 20_000;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | TaskStatus>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | Priority>("ALL");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [searchFilter, setSearchFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [newExtraFieldLabel, setNewExtraFieldLabel] = useState<Record<string, string>>({});
  const [newExtraFieldValue, setNewExtraFieldValue] = useState<Record<string, string>>({});
  const [newPerTestFieldLabel, setNewPerTestFieldLabel] = useState<Record<string, string>>({});
  const [newPerTestFieldValue, setNewPerTestFieldValue] = useState<Record<string, string>>({});
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [signatureLibrary, setSignatureLibrary] = useState<SignaturePreset[]>([]);
  const [selectedSignatureByTask, setSelectedSignatureByTask] = useState<Record<string, string>>({});
  const signatureInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const loadTasksSeqRef = useRef(0);
  const taskCacheRef = useRef<Map<string, { at: number; tasks: Task[] }>>(new Map());
  const draftsRef = useRef<Record<string, Draft>>({});
  const tasksRef = useRef<Task[]>([]);
  const dirtyDraftTaskIdsRef = useRef<Set<string>>(new Set());

  // Imaging state
  const [imagingFiles, setImagingFiles] = useState<ImagingFile[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showLayoutEditorByTask, setShowLayoutEditorByTask] = useState<Record<string, boolean>>({});

  // layout items are stored in drafts[taskId].extraFields.imagingLayout as array of {id:fileId, x, y, w, h}
  function getLayoutForTask(taskId: string) {
    try {
      const d = drafts[taskId];
      const extra = d?.extraFields ?? {};
      const raw = (extra as any).imagingLayout;
      if (Array.isArray(raw)) return raw;
      if (typeof raw === "string") {
        try { return JSON.parse(raw); } catch { return []; }
      }
      return [];
    } catch {
      return [];
    }
  }

  function LayoutEditor({ taskId, imagingFiles, getLayout, onChange }: { taskId: string; imagingFiles: ImagingFile[]; getLayout: () => any[]; onChange: (layout: any[]) => void }) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [layout, setLayout] = useState<any[]>(() => getLayout() ?? []);
    const layoutRef = useRef<any[]>(layout);
    const dragRef = useRef<any>(null);

    useEffect(() => { layoutRef.current = layout; }, [layout]);

    useEffect(() => {
      setLayout(getLayout() ?? []);
      // call onChange once to initialize saved state
      onChange(getLayout() ?? []);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taskId, imagingFiles]);

    function clientToPct(clientX: number, clientY: number) {
      const el = containerRef.current; if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      return { x, y };
    }

    function startDrag(e: React.PointerEvent, idx: number) {
      const el = containerRef.current; if (!el) return;
      (e.target as Element).setPointerCapture(e.pointerId);
      const start = clientToPct(e.clientX, e.clientY);
      dragRef.current = { idx, mode: "move", start, orig: { ...layout[idx] } };
    }

    function startResize(e: React.PointerEvent, idx: number) {
      const el = containerRef.current; if (!el) return;
      (e.target as Element).setPointerCapture(e.pointerId);
      const start = clientToPct(e.clientX, e.clientY);
      dragRef.current = { idx, mode: "resize", start, orig: { ...layout[idx] } };
    }

    function onPointerMove(e: React.PointerEvent) {
      if (!dragRef.current) return;
      const { idx, mode, start, orig } = dragRef.current;
      const cur = clientToPct(e.clientX, e.clientY);
      const dx = cur.x - start.x;
      const dy = cur.y - start.y;
      setLayout((prev) => {
        const copy = prev.map((r) => ({ ...r }));
        if (!copy[idx]) return prev;
        if (mode === "move") {
          copy[idx].x = Math.max(0, Math.min(100 - (copy[idx].w ?? 20), (orig.x ?? 0) + dx));
          copy[idx].y = Math.max(0, Math.min(100 - (copy[idx].h ?? 20), (orig.y ?? 0) + dy));
        } else if (mode === "resize") {
          copy[idx].w = Math.max(5, Math.min(100 - (orig.x ?? 0), (orig.w ?? 20) + dx));
          // allow height auto by percentage or keep aspect ratio; user can set h explicitly
          if (orig.h !== null && orig.h !== undefined) {
            copy[idx].h = Math.max(5, Math.min(100 - (orig.y ?? 0), (orig.h ?? 20) + dy));
          } else {
            copy[idx].h = null;
          }
        }
        return copy;
      });
    }

    function onPointerUp(e: React.PointerEvent) {
      if (dragRef.current) {
        try { (e.target as Element).releasePointerCapture(e.pointerId); } catch {}
        dragRef.current = null;
        // notify parent of final layout on pointer up (throttles continuous updates)
        onChange(layoutRef.current ?? layout);
      }
    }

    function removeItem(idx: number) {
      setLayout((prev) => {
        const next = prev.filter((_, i) => i !== idx);
        // persist removal immediately
        onChange(next);
        return next;
      });
    }

    return (
      <div>
        <div className="mb-2 text-[11px] text-slate-500">Drag images on the canvas, resize from the bottom-right corner, and click Save Draft to persist positions.</div>
        <div ref={containerRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} className="relative bg-slate-50 border border-slate-200" style={{ width: "100%", height: 420 }}>
          {layout.map((item, idx) => {
            const file = imagingFiles.find((f) => f.id === item.id);
            if (!file) return null;
            const style: any = { position: "absolute", left: `${item.x}%`, top: `${item.y}%`, width: `${item.w}%`, cursor: "move", border: "1px solid #e5e7eb", borderRadius: 4, overflow: "hidden", background: "white" };
            if (item.h) style.height = `${item.h}%`;
            return (
              <div key={`${item.id}-${idx}`} style={style} onPointerDown={(e) => startDrag(e, idx)}>
                <img src={file.fileUrl} alt={file.fileName} style={{ width: "100%", height: item.h ? "100%" : "auto", display: "block", objectFit: "contain" }} />
                <div style={{ position: "absolute", right: 4, bottom: 4 }}>
                  <div onPointerDown={(e) => startResize(e, idx)} style={{ width: 12, height: 12, background: "rgba(0,0,0,0.6)", cursor: "nwse-resize", borderRadius: 2 }} />
                </div>
                <button onClick={(ev) => { ev.stopPropagation(); removeItem(idx); }} className="absolute right-1 top-1 rounded bg-white p-0.5 text-xs text-red-600">✕</button>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => { onChange(layout); }} className="rounded border border-blue-200 px-2 py-1 text-[11px] text-blue-700">Save Layout</button>
          <button type="button" onClick={() => { /* noop, draft saved by Save Draft */ }} className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600">Apply</button>
        </div>
      </div>
    );
  }

  function updateLayoutForTask(taskId: string, layout: any[]) {
      try {
        const current = drafts[taskId] ?? EMPTY_DRAFT;
        updateDraft(taskId, { extraFields: { ...(current.extraFields ?? {}), imagingLayout: JSON.stringify(layout) } });
      } catch (err) {
        console.error("Failed to update imaging layout", err);
        setError(typeof err === "string" ? err : (err instanceof Error ? err.message : "Failed to update layout"));
      }
  }

    // Simple error boundary to prevent a single component error from crashing the whole dashboard
    class ErrorBoundary extends React.Component<{
      children: React.ReactNode;
      onReset?: () => void;
    }, { hasError: boolean; error?: Error }> {
      constructor(props: any) {
        super(props);
        this.state = { hasError: false };
      }
      static getDerivedStateFromError() { return { hasError: true }; }
      componentDidCatch(error: Error, info: any) { console.error("ErrorBoundary caught:", error, info); }
      render() {
        if (this.state.hasError) {
          return (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <div>Layout editor failed to load. You can close and try again.</div>
              <div className="mt-2 flex gap-2">
                <button onClick={() => { this.setState({ hasError: false }); this.props.onReset?.(); }} className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600">Close Editor</button>
              </div>
            </div>
          );
        }
        return this.props.children as any;
      }
    }

  function invalidateTaskCache() {
    taskCacheRef.current.clear();
  }

  function patchTask(taskId: string, patch: Partial<Task>) {
    setTasks((prev) => {
      const next = prev.map((task) => (task.id === taskId ? { ...task, ...patch } : task));
      taskCacheRef.current.forEach((cached, key) => {
        taskCacheRef.current.set(key, {
          ...cached,
          tasks: cached.tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task)),
        });
      });
      return next;
    });
  }

  async function uploadImagingFile(file: File) {
    if (!expandedTask) return;
    
    setUploadingImage(true);
    setImageError("");
    
    try {
      // Request presign info for direct upload
      const presignRes = await fetch("/api/uploads/presign");
      const presignJson = await presignRes.json();
      if (!presignJson.success) {
        // fallback to server upload if presign not available
        const formData = new FormData();
        formData.append("file", file);
        formData.append("taskId", expandedTask);
        const res = await fetch("/api/uploads/imaging", { method: "POST", body: formData });
        const json = await res.json();
        if (!json.success) { setImageError(json.error ?? "Upload failed"); return; }
        setImagingFiles((prev) => [json.data, ...prev]);
        return;
      }

      if (presignJson.provider === "cloudinary") {
        const uploadUrl = presignJson.uploadUrl as string;
        const uploadPreset = presignJson.uploadPreset as string;
        const uploadForm = new FormData();
        uploadForm.append("file", file);
        uploadForm.append("upload_preset", uploadPreset);
        uploadForm.append("folder", `diagsync/imaging/${expandedTask}`);

        const cloudRes = await fetch(uploadUrl, { method: "POST", body: uploadForm });
        const cloudJson = await cloudRes.json();
        if (!cloudRes.ok || !cloudJson?.secure_url) {
          setImageError(cloudJson?.error?.message ?? "Upload failed");
          return;
        }

        // Register uploaded file in our DB
        const reg = await fetch(`/api/radiology/tasks/${expandedTask}/register-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileUrl: cloudJson.secure_url,
            fileName: file.name,
            fileType: file.type,
            fileSizeBytes: file.size,
            metadata: { public_id: cloudJson.public_id, width: cloudJson.width, height: cloudJson.height },
          }),
        });
        const regJson = await reg.json();
        if (!regJson.success) { setImageError(regJson.error ?? "Registration failed"); return; }
        setImagingFiles((prev) => [regJson.data, ...prev]);
        return;
      }
    } catch {
      setImageError("Network error while uploading");
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function deleteImagingFile(fileId: string) {
    if (!window.confirm("Delete this file? This cannot be undone.")) return;
    
    try {
      const res = await fetch(`/api/uploads/imaging?id=${encodeURIComponent(fileId)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.success) {
        setImageError(json.error ?? "Delete failed");
        return;
      }
      setImagingFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch {
      setImageError("Network error while deleting");
    }
  }

  async function fetchImagingFiles(taskId: string) {
    try {
      const res = await fetch(`/api/radiology/tasks/${taskId}/images`);
      const json = await res.json();
      if (json.success) {
        setImagingFiles(json.data);
      }
    } catch {
      // Silent fail for images
    }
  }

  function applyLoadedRows(rows: Task[]) {
    setTasks(rows);
    tasksRef.current = rows;
    const offlineByTask = new Map(listOfflineRadiologyDraftItems().map((item) => [item.taskId, item]));
    const nextDrafts: Record<string, Draft> = {};
    const nextTaskIds = new Set(rows.map((task) => task.id));
    dirtyDraftTaskIdsRef.current.forEach((taskId) => {
      if (!nextTaskIds.has(taskId)) dirtyDraftTaskIdsRef.current.delete(taskId);
    });
    for (const task of rows) {
      const offline = offlineByTask.get(task.id)?.draft;
      const parsedPerTest = parseRadiologyPerTestSections(task.radiologyReport?.extraFields);
      const testReports: Record<string, { findings: string; impression: string; notes: string }> = {};
      for (const order of task.testOrders) {
        const perTest = parsedPerTest.find((row) => row.testOrderId === order.id);
        testReports[order.id] = {
          findings: perTest?.findings ?? task.radiologyReport?.findings ?? "",
          impression: perTest?.impression ?? task.radiologyReport?.impression ?? "",
          notes: perTest?.notes ?? task.radiologyReport?.notes ?? "",
        };
      }
      const baselineDraft: Draft = {
        findings: offline?.findings ?? task.radiologyReport?.findings ?? "",
        impression: offline?.impression ?? task.radiologyReport?.impression ?? "",
        notes: offline?.notes ?? task.radiologyReport?.notes ?? "",
        testReports: offline?.testReports ?? testReports,
        extraFields: offline?.extraFields
          ? sanitizeDraftExtraFields(offline.extraFields)
          : sanitizeDraftExtraFields(task.radiologyReport?.extraFields),
        signatureName:
          offline?.signatureName ?? task.radiologyReport?.extraFields?.[SIGNOFF_NAME_KEY] ?? "",
        signatureImage:
          offline?.signatureImage ?? task.radiologyReport?.extraFields?.[SIGNOFF_IMAGE_KEY] ?? "",
      };
      const shouldPreserveLocalDraft =
        dirtyDraftTaskIdsRef.current.has(task.id) && Boolean(draftsRef.current[task.id]);
      nextDrafts[task.id] = shouldPreserveLocalDraft
        ? (draftsRef.current[task.id] as Draft)
        : baselineDraft;
    }
    draftsRef.current = nextDrafts;
    setDrafts(nextDrafts);
  }

  async function loadTasks(opts?: { signal?: AbortSignal; force?: boolean; silent?: boolean }) {
    const cacheKey = `${statusFilter}:${sort}:${searchFilter.trim().toLowerCase()}:${dateFilter}`;
    if (!opts?.force) {
      const cached = taskCacheRef.current.get(cacheKey);
      if (cached && Date.now() - cached.at < TASK_CACHE_TTL_MS) {
        setError("");
        setLoading(false);
        applyLoadedRows(cached.tasks);
        return;
      }
    }

    const requestId = ++loadTasksSeqRef.current;
    if (!opts?.silent) {
      setLoading(true);
    }
    setError("");
    try {
      const query = new URLSearchParams({ status: statusFilter, sort });
      if (searchFilter.trim()) query.set("search", searchFilter.trim());
      if (dateFilter) query.set("date", dateFilter);
      const res = await fetch(`/api/radiology/tasks?${query.toString()}`, { signal: opts?.signal });
      const json = await res.json();
      if (requestId !== loadTasksSeqRef.current || opts?.signal?.aborted) return;
      if (!json.success) { setError(json.error ?? "Failed to load tasks"); return; }
      const rows = json.data.tasks as Task[];
      taskCacheRef.current.set(cacheKey, { at: Date.now(), tasks: rows });
      applyLoadedRows(rows);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setError("Network error while loading radiology tasks");
    } finally {
      if (requestId !== loadTasksSeqRef.current || opts?.signal?.aborted) return;
      if (!opts?.silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadTasks({ signal: controller.signal });
    return () => controller.abort();
  }, [statusFilter, sort, searchFilter, dateFilter]);

  // Fetch imaging files when task is expanded
  useEffect(() => {
    if (!expandedTask) return;
    void fetchImagingFiles(expandedTask);
  }, [expandedTask]);

  useEffect(() => {
    const refreshNow = () => {
      if (document.visibilityState !== "visible") return;
      void loadTasks({ force: true, silent: true });
    };

    const poll = window.setInterval(refreshNow, 60_000);
    window.addEventListener("focus", refreshNow);
    document.addEventListener("visibilitychange", refreshNow);

    return () => {
      window.clearInterval(poll);
      window.removeEventListener("focus", refreshNow);
      document.removeEventListener("visibilitychange", refreshNow);
    };
  }, [statusFilter, sort, searchFilter, dateFilter]);

  useEffect(() => {
    setSignatureLibrary(loadSignaturePresets("reporting"));
  }, []);

  const filtered = useMemo(() => tasks.filter((t) => priorityFilter === "ALL" || t.priority === priorityFilter), [tasks, priorityFilter]);

  // --- Day-grouping helpers
  function pad2(v: number) { return String(v).padStart(2, "0"); }
  function toDayKey(date: string | Date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function todayDayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  }
  function formatDayLabel(dayKey: string) {
    const [y, m, d] = dayKey.split("-").map(Number);
    return new Date(y, m - 1, d, 12).toLocaleDateString("en-NG", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
  }
  const groupedByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of filtered) {
      const key = toDayKey(task.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);
  const counts = useMemo(() => ({ pending: filtered.filter((t) => t.status === "PENDING").length, inProgress: filtered.filter((t) => t.status === "IN_PROGRESS").length, completed: filtered.filter((t) => t.status === "COMPLETED").length }), [filtered]);
  function getNewlyAddedOrders(task: Task) {
    const taskCreatedAt = new Date(task.createdAt).getTime();
    return task.testOrders.filter((order) => {
      const createdAt = new Date(order.createdAt).getTime();
      return Number.isFinite(createdAt) && createdAt - taskCreatedAt > 60_000;
    });
  }

  function updateDraft(taskId: string, patch: Partial<Draft>) {
    dirtyDraftTaskIdsRef.current.add(taskId);
    setDrafts((prev) => ({
      ...prev,
      [taskId]: {
        ...(prev[taskId] ?? EMPTY_DRAFT),
        ...patch,
      },
    }));
  }
  function reportReady(taskId: string) {
    const d = drafts[taskId];
    const task = tasks.find((row) => row.id === taskId);
    if (!task) return false;
    return task.testOrders.every((order) => {
      const row = d?.testReports?.[order.id];
      return Boolean(row?.findings?.trim()) && Boolean(row?.impression?.trim());
    });
  }

  function setTestReportField(
    taskId: string,
    testOrderId: string,
    field: "findings" | "impression" | "notes",
    value: string
  ) {
    const current = drafts[taskId] ?? EMPTY_DRAFT;
    const nextTestReports = {
      ...(current.testReports ?? {}),
      [testOrderId]: {
        findings: current.testReports?.[testOrderId]?.findings ?? "",
        impression: current.testReports?.[testOrderId]?.impression ?? "",
        notes: current.testReports?.[testOrderId]?.notes ?? "",
        [field]: value,
      },
    };

    const all = Object.values(nextTestReports);
    const summaryFindings = all.map((row) => row.findings.trim()).filter(Boolean).join("\n\n");
    const summaryImpression = all.map((row) => row.impression.trim()).filter(Boolean).join("\n\n");
    const summaryNotes = all.map((row) => row.notes.trim()).filter(Boolean).join("\n\n");
    updateDraft(taskId, {
      testReports: nextTestReports,
      findings: summaryFindings,
      impression: summaryImpression,
      notes: summaryNotes,
    });
  }

  function setExtraFieldValue(taskId: string, fieldKey: string, value: string) {
    const current = drafts[taskId] ?? EMPTY_DRAFT;
    updateDraft(taskId, { extraFields: { ...current.extraFields, [fieldKey]: value } });
  }

  function setPerTestTemplateFieldValue(
    taskId: string,
    testOrderId: string,
    fieldKey: string,
    value: string
  ) {
    const storageKey = perTestFieldStorageKey(testOrderId, fieldKey);
    const current = drafts[taskId] ?? EMPTY_DRAFT;
    updateDraft(taskId, { extraFields: { ...current.extraFields, [storageKey]: value } });
  }

  function removePerTestTemplateFieldValue(taskId: string, testOrderId: string, fieldKey: string) {
    const storageKey = perTestFieldStorageKey(testOrderId, fieldKey);
    const current = drafts[taskId] ?? EMPTY_DRAFT;
    if (!Object.prototype.hasOwnProperty.call(current.extraFields, storageKey)) return;
    const next = { ...current.extraFields };
    delete next[storageKey];
    updateDraft(taskId, { extraFields: next });
  }

  function removeExtraField(taskId: string, fieldKey: string) {
    const current = drafts[taskId] ?? EMPTY_DRAFT;
    if (!Object.prototype.hasOwnProperty.call(current.extraFields, fieldKey)) return;
    const next = { ...current.extraFields };
    delete next[fieldKey];
    updateDraft(taskId, { extraFields: next });
  }

  function addExtraField(taskId: string, label: string, value: string) {
    const baseKey = toCustomFieldKey(label);
    if (!baseKey) return;
    const current = drafts[taskId] ?? EMPTY_DRAFT;
    if (Object.prototype.hasOwnProperty.call(current.extraFields, baseKey)) {
      setError(`Field '${baseKey}' already exists.`);
      return;
    }
    updateDraft(taskId, { extraFields: { ...current.extraFields, [baseKey]: value } });
    setError("");
  }

  function addPerTestExtraField(taskId: string, testOrderId: string, label: string, value: string) {
    const baseKey = toCustomFieldKey(label);
    if (!baseKey) return;
    const storageKey = perTestFieldStorageKey(testOrderId, `custom_${baseKey}`);
    const current = drafts[taskId] ?? EMPTY_DRAFT;
    if (Object.prototype.hasOwnProperty.call(current.extraFields, storageKey)) {
      setError(`Field '${baseKey}' already exists for this test.`);
      return;
    }
    updateDraft(taskId, { extraFields: { ...current.extraFields, [storageKey]: value } });
    setError("");
  }

  function resetExtraFields(taskId: string) {
    updateDraft(taskId, { extraFields: {} });
  }

  function applySignaturePreset(taskId: string, presetId: string) {
    const preset = signatureLibrary.find((item) => item.id === presetId);
    if (!preset) return;
    updateDraft(taskId, { signatureName: preset.name, signatureImage: preset.image });
    setSelectedSignatureByTask((prev) => ({ ...prev, [taskId]: presetId }));
  }

  function saveCurrentSignatureToLibrary(taskId: string) {
    const draft = drafts[taskId];
    if (!draft?.signatureName?.trim() || !draft?.signatureImage?.trim()) return;
    const res = upsertSignaturePreset(signatureLibrary, {
      name: draft.signatureName,
      image: draft.signatureImage,
    });
    if (!res.id) return;
    setSignatureLibrary(res.items);
    saveSignaturePresets("reporting", res.items);
    setSelectedSignatureByTask((prev) => ({ ...prev, [taskId]: res.id as string }));
  }

  function deleteSignaturePreset(presetId: string) {
    const next = removeSignaturePreset(signatureLibrary, presetId);
    setSignatureLibrary(next);
    saveSignaturePresets("reporting", next);
    setSelectedSignatureByTask((prev) =>
      Object.fromEntries(Object.entries(prev).map(([taskId, selectedId]) => [taskId, selectedId === presetId ? "" : selectedId]))
    );
  }

  async function startTask(taskId: string) {
    setBusyTaskId(taskId); setError("");
    invalidateTaskCache();
    try {
      const json = await (await fetch(`/api/radiology/tasks/${taskId}/start`, { method: "PATCH" })).json();
      if (!json.success) { setError(json.error ?? "Unable to start task"); return; }
      patchTask(taskId, { status: "IN_PROGRESS" });
    } catch (error) {
      setError(error instanceof Error && error.message ? `Unable to start task: ${error.message}` : "Unable to start task");
    } finally { setBusyTaskId(null); }
  }

  async function saveReport(taskId: string) {
    setBusyTaskId(taskId); setError("");
    invalidateTaskCache();
    try {
    const d = drafts[taskId] ?? EMPTY_DRAFT;
    const task = tasks.find((row) => row.id === taskId);
    if (task && !task.canEdit) {
      setError("This task is assigned to another radiographer. Please click Start on your own pending task.");
      return;
    }
    const testReports: RadiologyPerTestSection[] = Object.entries(d.testReports ?? {}).map(([testOrderId, value]) => ({
      testOrderId,
      findings: value.findings ?? "",
      impression: value.impression ?? "",
      notes: value.notes ?? "",
    }));
    const payload = {
      ...d,
      extraFields: sanitizeDraftExtraFields(d.extraFields),
      testReports,
    };
    const saveRes = await fetch(`/api/radiology/tasks/${taskId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await saveRes.json();
      if (!json.success) { setError(json.error ?? "Unable to save report"); return; }
      const pending = listOfflineRadiologyDraftItems().find((item) => item.taskId === taskId);
      if (pending) removeOfflineRadiologyDraft(pending.id);
      dirtyDraftTaskIdsRef.current.delete(taskId);
      patchTask(taskId, {
        radiologyReport: {
          findings: d.findings,
          impression: d.impression,
          notes: d.notes,
          extraFields: sanitizeDraftExtraFields(d.extraFields),
          ...(d.signatureName && d.signatureImage
            ? {
                extraFields: {
                  ...sanitizeDraftExtraFields(d.extraFields),
                  [SIGNOFF_NAME_KEY]: d.signatureName,
                  [SIGNOFF_IMAGE_KEY]: d.signatureImage,
                },
              }
            : {}),
          isSubmitted: false,
        },
      });
    } catch (error) {
      setError(error instanceof Error && error.message ? `Unable to save report: ${error.message}` : "Unable to save report");
    } finally { setBusyTaskId(null); }
  }

  async function submitTask(taskId: string) {
    setBusyTaskId(taskId); setError("");
    invalidateTaskCache();
    try {
      const d = drafts[taskId] ?? EMPTY_DRAFT;
      const task = tasks.find((row) => row.id === taskId);
      if (!task) { setError("Task not found."); return; }
      if (!task.canEdit) {
        setError("This task is assigned to another radiographer. You can only submit tasks assigned to you.");
        return;
      }
      const missing = task.testOrders.find((order) => {
        const row = d.testReports?.[order.id];
        return !row?.findings?.trim() || !row?.impression?.trim();
      });
      if (missing) { setError(`Findings and impression are required for ${missing.test.name}.`); return; }
      const testReports: RadiologyPerTestSection[] = Object.entries(d.testReports ?? {}).map(([testOrderId, value]) => ({
        testOrderId,
        findings: value.findings ?? "",
        impression: value.impression ?? "",
        notes: value.notes ?? "",
      }));
      const saveRes = await fetch(`/api/radiology/tasks/${taskId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...d,
          extraFields: sanitizeDraftExtraFields(d.extraFields),
          testReports,
        }),
      });
      const saveJson = await saveRes.json();
      if (!saveJson.success) {
        setError(saveJson.error ?? "Unable to save report before submission");
        return;
      }
      const submitRes = await fetch(`/api/radiology/tasks/${taskId}/submit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      });
      const json = await submitRes.json();
      if (!json.success) { setError(json.error ?? "Unable to submit report"); return; }
      const pending = listOfflineRadiologyDraftItems().find((item) => item.taskId === taskId);
      if (pending) removeOfflineRadiologyDraft(pending.id);
      dirtyDraftTaskIdsRef.current.delete(taskId);
      setExpandedTask(null);
      patchTask(taskId, { status: "COMPLETED" });
    } catch (error) {
      setError(
        error instanceof Error && error.message
          ? `Unable to submit report: ${error.message}`
          : "Unable to submit report"
      );
    } finally { setBusyTaskId(null); }
  }

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    if (!expandedTask) return;
    const task = tasksRef.current.find((row) => row.id === expandedTask);
    if (!task || task.status === "COMPLETED") return;
    const timer = window.setTimeout(() => {
      const draft = draftsRef.current[task.id] ?? EMPTY_DRAFT;
      upsertOfflineRadiologyDraft({
        taskId: task.id,
        draft: {
          findings: draft.findings,
          impression: draft.impression,
          notes: draft.notes,
          testReports: draft.testReports ?? {},
          extraFields: draft.extraFields ?? {},
          signatureName: draft.signatureName ?? "",
          signatureImage: draft.signatureImage ?? "",
        },
      });
    }, 700);
    // increase debounce to reduce frequent writes (was 700ms)
    // now waits 2000ms after last change before saving offline draft
    // helps reduce function invocations and I/O
    // (handled by clearing the timer in cleanup)
    return () => window.clearTimeout(timer);
  }, [drafts, expandedTask]);

  useEffect(() => {
    if (!expandedTask) return;
    const taskId = expandedTask;
    const timer = window.setInterval(() => {
      const task = tasksRef.current.find((row) => row.id === taskId);
      if (!task || task.status === "COMPLETED") return;
      const draft = draftsRef.current[task.id] ?? EMPTY_DRAFT;
      upsertOfflineRadiologyDraft({
        taskId: task.id,
        draft: {
          findings: draft.findings,
          impression: draft.impression,
          notes: draft.notes,
          testReports: draft.testReports ?? {},
          extraFields: draft.extraFields ?? {},
          signatureName: draft.signatureName ?? "",
          signatureImage: draft.signatureImage ?? "",
        },
      });
    // reduce polling frequency to 30s (was 5s) to lower function invocations
    }, 30000);
    return () => window.clearInterval(timer);
  }, [expandedTask]);

  async function uploadSignature(taskId: string, file: File) {
    const readAsDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("SIGNATURE_READ_FAILED"));
      reader.readAsDataURL(file);
    });
    updateDraft(taskId, { signatureImage: readAsDataUrl });
  }

  if (loading) return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-xs text-slate-400">Loading radiology tasks...</div>
  );

  return (
    <div className="space-y-4">
      {/* Stat strip */}
      <div className="grid grid-cols-3 gap-px rounded-lg border border-slate-200 bg-slate-200 overflow-hidden">
        {[{ label: "Pending", value: counts.pending }, { label: "In Progress", value: counts.inProgress }, { label: "Completed", value: counts.completed }].map((s) => (
          <div key={s.label} className="bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">{s.label}</p>
            <p className="text-xl font-bold text-slate-800 mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="w-full sm:w-auto">
          <input
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search patient name or ID..."
            className="h-8 w-full sm:w-56 rounded border border-slate-200 bg-white px-3 text-xs text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="h-8 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="IN_PROGRESS">In progress</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as any)}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All priorities</SelectItem>
            <SelectItem value="EMERGENCY">Emergency</SelectItem>
            <SelectItem value="URGENT">Urgent</SelectItem>
            <SelectItem value="ROUTINE">Routine</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as any)}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Sort" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
          </SelectContent>
        </Select>
        <button onClick={() => void loadTasks({ force: true })} className="ml-auto rounded border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 transition-colors">Refresh</button>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>}

      {/* Tasks table - grouped by day */}
      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white">
            <p className="px-4 py-8 text-center text-xs text-slate-400">No radiology tasks found.</p>
          </div>
        ) : (
          groupedByDay.map(([dayKey, dayTasks]) => (
            <section key={dayKey} id={`radiology-day-${dayKey}`} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              {/* Day header */}
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-700">{formatDayLabel(dayKey)}</span>
                  {dayKey === todayDayKey() ? <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">Today</span> : null}
                  <span className="text-slate-400">{dayTasks.length} task{dayTasks.length !== 1 ? "s" : ""}</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-400">{dayTasks.filter((t) => t.status === "PENDING").length} pending</span>
                  <span className="text-slate-400">{dayTasks.filter((t) => t.status === "IN_PROGRESS").length} in progress</span>
                  <span className="text-slate-400">{dayTasks.filter((t) => t.status === "COMPLETED").length} completed</span>
                </div>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">Patient</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">Priority</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">Status</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">Report</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">Assigned</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
              {dayTasks.map((task) => {
                const isExpanded = expandedTask === task.id;
                return (
                  <React.Fragment key={task.id}>
                    <tr className={`hover:bg-slate-50 transition-colors ${isExpanded ? "bg-blue-50/20" : ""}`}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-800">{task.visit.patient.fullName}</p>
                        <p className="font-mono text-slate-400">
                          {task.visit.patient.patientId} · {formatPatientAge({ age: task.visit.patient.age, dateOfBirth: task.visit.patient.dateOfBirth })} · {task.visit.patient.sex}
                        </p>
                        {getNewlyAddedOrders(task).length > 0 ? (
                          <p className="text-[11px] text-emerald-700">
                            New test(s) added: {getNewlyAddedOrders(task).map((order) => order.test.name).join(", ")}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded px-1.5 py-0.5 font-medium ${priorityStyle[task.priority]}`}>{task.priority}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded px-1.5 py-0.5 font-medium ${statusStyle[task.status]}`}>{task.status.replace("_", " ")}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {task.radiologyReport?.findings?.trim() ? "Drafted" : "Pending"}{" "}
                        · {task.testOrders.map((order) => order.test.name).join(", ")}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{formatDateTime(task.createdAt)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1.5">
                          {task.status === "PENDING" && (
                            <button disabled={busyTaskId === task.id} onClick={() => startTask(task.id)}
                              className="rounded bg-blue-600 px-2.5 py-1 font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                              Start
                            </button>
                          )}
                          {task.status !== "COMPLETED" && task.status !== "PENDING" && (
                            <button onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                              disabled={!task.canEdit}
                              className="rounded border border-slate-200 px-2.5 py-1 text-slate-600 hover:bg-slate-50 transition-colors">
                              {isExpanded ? "Close" : "Open Report"}
                            </button>
                          )}
                          {task.status !== "COMPLETED" && task.status !== "PENDING" && !task.canEdit ? (
                            <span className="text-[11px] text-amber-500">Assigned to another radiographer</span>
                          ) : null}
                          {task.status === "COMPLETED" && <span className="text-green-600 font-medium">✓ Submitted</span>}
                        </div>
                      </td>
                    </tr>

                    {isExpanded && task.status !== "COMPLETED" && (
                      <tr key={`${task.id}-expand`}>
                        <td colSpan={6} className="px-4 py-4 bg-slate-50 border-b border-slate-200">
                          <div className="space-y-3">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Radiology Report</p>
                              {task.testOrders.map((order) => (
                                <div key={`${task.id}-${order.id}`} className="rounded border border-slate-200 bg-white p-3 space-y-2">
                                  <p className="text-xs font-semibold text-slate-700">{order.test.name} <span className="font-mono text-slate-400">{order.test.code}</span></p>
                                  
                                  {/* Bullet List Editor for Findings */}
                                  <BulletListEditor
                                    label="Findings *"
                                    value={drafts[task.id]?.testReports?.[order.id]?.findings ?? ""}
                                    onChange={(value) => setTestReportField(task.id, order.id, "findings", value)}
                                    placeholder="Type each finding on a new line. Press Enter for new bullet."
                                    rows={2}
                                    disabled={!task.canEdit}
                                  />
                                  
                                  {/* Bullet List Editor for Impression */}
                                  <BulletListEditor
                                    label="Impression *"
                                    value={drafts[task.id]?.testReports?.[order.id]?.impression ?? ""}
                                    onChange={(value) => setTestReportField(task.id, order.id, "impression", value)}
                                    placeholder="Type each impression on a new line. Press Enter for new bullet."
                                    rows={2}
                                    disabled={!task.canEdit}
                                  />
                                  
                                  <div>
                                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Notes (optional)</label>
                                    <input value={drafts[task.id]?.testReports?.[order.id]?.notes ?? ""} onChange={(e) => setTestReportField(task.id, order.id, "notes", e.target.value)}
                                      className="h-7 w-full rounded border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                  </div>
                                  {order.test.resultFields
                                    .filter(
                                      (field) =>
                                        !["findings", "impression", "notes"].includes(
                                          field.fieldKey.trim().toLowerCase()
                                        )
                                    )
                                    .map((field) => {
                                      const fieldValue =
                                        drafts[task.id]?.extraFields?.[
                                          perTestFieldStorageKey(order.id, field.fieldKey)
                                        ] ?? "";
                                      const options =
                                        field.fieldType === "DROPDOWN"
                                          ? (field.options ?? "")
                                              .split(",")
                                              .map((opt) => opt.trim())
                                              .filter(Boolean)
                                          : [];

                                      return (
                                        <div key={`${order.id}-${field.fieldKey}`}>
                                          <label className="block text-[11px] font-medium text-slate-500 mb-1">
                                            {field.label}
                                            {field.isRequired ? " *" : ""}
                                          </label>
                                          {field.fieldType === "TEXTAREA" ? (
                                            <textarea
                                              rows={2}
                                              value={fieldValue}
                                              onChange={(e) =>
                                                setPerTestTemplateFieldValue(
                                                  task.id,
                                                  order.id,
                                                  field.fieldKey,
                                                  e.target.value
                                                )
                                              }
                                              className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            />
                                          ) : field.fieldType === "DROPDOWN" ? (
                                            <select
                                              value={fieldValue}
                                              onChange={(e) =>
                                                setPerTestTemplateFieldValue(
                                                  task.id,
                                                  order.id,
                                                  field.fieldKey,
                                                  e.target.value
                                                )
                                              }
                                              className="h-7 w-full rounded border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            >
                                              <option value="">Select...</option>
                                              {options.map((option) => (
                                                <option key={option} value={option}>
                                                  {option}
                                                </option>
                                              ))}
                                            </select>
                                          ) : (
                                            <input
                                              type={field.fieldType === "NUMBER" ? "number" : "text"}
                                              value={fieldValue}
                                              onChange={(e) =>
                                                setPerTestTemplateFieldValue(
                                                  task.id,
                                                  order.id,
                                                  field.fieldKey,
                                                  e.target.value
                                                )
                                              }
                                              className="h-7 w-full rounded border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            />
                                          )}
                                          <div className="mt-1 flex justify-end">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                removePerTestTemplateFieldValue(
                                                  task.id,
                                                  order.id,
                                                  field.fieldKey
                                                )
                                              }
                                              className="text-[11px] text-slate-500 hover:text-red-600"
                                            >
                                              Clear field
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  <div className="rounded border border-slate-200 bg-slate-50 p-2">
                                    <p className="text-[11px] font-medium text-slate-500 mb-1">Add per-test extra field</p>
                                    <div className="grid grid-cols-12 gap-2">
                                      <input
                                        value={newPerTestFieldLabel[`${task.id}_${order.id}`] ?? ""}
                                        onChange={(e) =>
                                          setNewPerTestFieldLabel((prev) => ({
                                            ...prev,
                                            [`${task.id}_${order.id}`]: e.target.value,
                                          }))
                                        }
                                        placeholder="Field name"
                                        className="col-span-4 rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      />
                                      <input
                                        value={newPerTestFieldValue[`${task.id}_${order.id}`] ?? ""}
                                        onChange={(e) =>
                                          setNewPerTestFieldValue((prev) => ({
                                            ...prev,
                                            [`${task.id}_${order.id}`]: e.target.value,
                                          }))
                                        }
                                        placeholder="Value"
                                        className="col-span-6 rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const scopedKey = `${task.id}_${order.id}`;
                                          const label = newPerTestFieldLabel[scopedKey] ?? "";
                                          const value = newPerTestFieldValue[scopedKey] ?? "";
                                          if (!label.trim()) return;
                                          addPerTestExtraField(task.id, order.id, label, value);
                                          setNewPerTestFieldLabel((prev) => ({ ...prev, [scopedKey]: "" }));
                                          setNewPerTestFieldValue((prev) => ({ ...prev, [scopedKey]: "" }));
                                        }}
                                        className="col-span-2 rounded border border-blue-200 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                                      >
                                        Add
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                              
                              {/* Imaging Upload Section */}
                              <div className="rounded border border-slate-200 bg-white p-3">
                                <div className="mb-2 flex items-center justify-between">
                                  <p className="text-[11px] font-medium text-slate-500">Imaging Files</p>
                                  <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploadingImage}
                                    className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                                  >
                                    <ImagePlus className="h-3 w-3" />
                                    {uploadingImage ? "Uploading..." : "Upload Image"}
                                  </button>
                                  <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      await uploadImagingFile(file);
                                    }}
                                  />
                                </div>
                                
                                {imageError && (
                                  <p className="mb-2 text-[11px] text-red-600">{imageError}</p>
                                )}
                                
                                {imagingFiles.length === 0 ? (
                                  <p className="text-[11px] text-slate-400">No images uploaded yet. Upload JPEG, PNG, or WebP files.</p>
                                ) : (
                                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                    {imagingFiles.map((file) => (
                                      <div key={file.id} className="flex items-start gap-2 rounded border border-slate-200 p-2">
                                        {file.fileType.startsWith("image/") ? (
                                          <img
                                            src={file.fileUrl}
                                            alt={file.fileName}
                                            className="h-16 w-16 rounded border object-cover"
                                          />
                                        ) : (
                                          <div className="flex h-16 w-16 items-center justify-center rounded border bg-slate-100">
                                            <span className="text-xs text-slate-500">PDF</span>
                                          </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                          <p className="truncate text-xs font-medium text-slate-700">{file.fileName}</p>
                                          <p className="text-[11px] text-slate-400">{(file.fileSizeBytes / 1024 / 1024).toFixed(2)} MB</p>
                                        </div>
                                        <div className="flex gap-1 items-center">
                                          <a
                                            href={file.fileUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="rounded p-1 text-slate-500 hover:bg-slate-100"
                                            title="Download"
                                          >
                                            <Download className="h-3.5 w-3.5" />
                                          </a>
                                          <button
                                            type="button"
                                            onClick={() => deleteImagingFile(file.id)}
                                            className="rounded p-1 text-red-500 hover:bg-red-50"
                                            title="Delete"
                                          >
                                            <X className="h-3.5 w-3.5" />
                                          </button>
                                          {file.fileType.startsWith("image/") && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                    try {
                                                      const layout = getLayoutForTask(task.id);
                                                      // add new element centered with 40% width
                                                      const newItem = {
                                                        id: file.id,
                                                        x: 30,
                                                        y: 10 + (Array.isArray(layout) ? layout.length * 5 : 0),
                                                        w: 40,
                                                        h: null,
                                                      };
                                                      updateLayoutForTask(task.id, [...(Array.isArray(layout) ? layout : []), newItem]);
                                                      setShowLayoutEditorByTask((prev) => ({ ...prev, [task.id]: true }));
                                                    } catch (err) {
                                                      console.error("Add to layout failed", err);
                                                      setError(typeof err === "string" ? err : (err instanceof Error ? err.message : "Failed to add image to layout"));
                                                    }
                                              }}
                                              className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                                              title="Add to layout"
                                            >Add to layout</button>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <p className="mt-2 text-[10px] text-slate-400">Supported: JPEG, PNG, WebP (max 25MB per file)</p>
                              </div>

                              {/* Layout Editor */}
                              {showLayoutEditorByTask[task.id] ? (
                                <div className="rounded border border-slate-200 bg-white p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <p className="text-[11px] font-medium text-slate-500">Layout Editor</p>
                                    <div className="flex gap-2">
                                      <button type="button" onClick={() => setShowLayoutEditorByTask((p) => ({ ...p, [task.id]: false }))} className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600">Close</button>
                                      <button type="button" onClick={() => updateLayoutForTask(task.id, [])} className="rounded border border-red-200 px-2 py-1 text-[11px] text-red-600">Clear</button>
                                    </div>
                                  </div>
                                  <ErrorBoundary onReset={() => setShowLayoutEditorByTask((p) => ({ ...p, [task.id]: false }))}>
                                    <LayoutEditor
                                      key={task.id}
                                      taskId={task.id}
                                      imagingFiles={imagingFiles}
                                      getLayout={() => getLayoutForTask(task.id)}
                                      onChange={(layout) => updateLayoutForTask(task.id, layout)}
                                    />
                                  </ErrorBoundary>
                                </div>
                              ) : null}
                              
                              <div className="rounded border border-slate-200 bg-white p-3">
                                <p className="text-[11px] font-medium text-slate-500 mb-2">Extra Fields</p>
                                <div className="space-y-2">
                                  {Object.entries(
                                    Object.fromEntries(
                                      Object.entries(drafts[task.id]?.extraFields ?? {}).filter(
                                        ([key]) =>
                                          key !== SIGNOFF_IMAGE_KEY &&
                                          key !== SIGNOFF_NAME_KEY &&
                                          key !== RADIOLOGY_PER_TEST_KEY
                                      )
                                    )
                                  ).length === 0 ? (
                                    <p className="text-[11px] text-slate-400">No extra fields added.</p>
                                  ) : (
                                    Object.entries(
                                      Object.fromEntries(
                                        Object.entries(drafts[task.id]?.extraFields ?? {}).filter(
                                          ([key]) =>
                                            key !== SIGNOFF_IMAGE_KEY &&
                                            key !== SIGNOFF_NAME_KEY &&
                                            key !== RADIOLOGY_PER_TEST_KEY
                                        )
                                      )
                                    ).map(([fieldKey, fieldValue]) => (
                                      <div key={fieldKey} className="grid grid-cols-12 gap-2 items-center">
                                        <input
                                          value={formatExtraFieldLabel(fieldKey)}
                                          readOnly
                                          className="col-span-4 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-500"
                                        />
                                        <input
                                          value={fieldValue}
                                          onChange={(e) => setExtraFieldValue(task.id, fieldKey, e.target.value)}
                                          className="col-span-6 rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (!window.confirm(`Remove extra field '${formatExtraFieldLabel(fieldKey)}'?`)) return;
                                            removeExtraField(task.id, fieldKey);
                                          }}
                                          className="col-span-2 rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    ))
                                  )}
                                </div>
                                <div className="mt-2 grid grid-cols-12 gap-2">
                                  <input
                                    value={newExtraFieldLabel[task.id] ?? ""}
                                    onChange={(e) => setNewExtraFieldLabel((prev) => ({ ...prev, [task.id]: e.target.value }))}
                                    placeholder="Field name"
                                    className="col-span-4 rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                  <input
                                    value={newExtraFieldValue[task.id] ?? ""}
                                    onChange={(e) => setNewExtraFieldValue((prev) => ({ ...prev, [task.id]: e.target.value }))}
                                    placeholder="Value"
                                    className="col-span-6 rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const label = newExtraFieldLabel[task.id] ?? "";
                                      const value = newExtraFieldValue[task.id] ?? "";
                                      if (!label.trim()) return;
                                      addExtraField(task.id, label, value);
                                      setNewExtraFieldLabel((prev) => ({ ...prev, [task.id]: "" }));
                                      setNewExtraFieldValue((prev) => ({ ...prev, [task.id]: "" }));
                                    }}
                                    className="col-span-2 rounded border border-blue-200 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                                  >
                                    Add
                                  </button>
                                </div>
                                <div className="mt-2 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => resetExtraFields(task.id)}
                                    className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                                  >
                                    Reset Default
                                  </button>
                                </div>
                              </div>
                              <div className="rounded border border-slate-200 bg-white p-3">
                                <p className="text-[11px] font-medium text-slate-500 mb-2">Signature (for printed report)</p>
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <select
                                      value={selectedSignatureByTask[task.id] ?? ""}
                                      onChange={(e) => {
                                        const presetId = e.target.value;
                                        setSelectedSignatureByTask((prev) => ({ ...prev, [task.id]: presetId }));
                                        if (presetId) applySignaturePreset(task.id, presetId);
                                      }}
                                      className="h-7 flex-1 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    >
                                      <option value="">Choose saved signature...</option>
                                      {signatureLibrary.map((preset) => (
                                        <option key={preset.id} value={preset.id}>
                                          {preset.name}
                                        </option>
                                      ))}
                                    </select>
                                    {selectedSignatureByTask[task.id] ? (
                                      <button
                                        type="button"
                                        onClick={() => deleteSignaturePreset(selectedSignatureByTask[task.id])}
                                        className="rounded border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 transition-colors"
                                      >
                                        Delete Saved
                                      </button>
                                    ) : null}
                                  </div>
                                  <input
                                    value={drafts[task.id]?.signatureName ?? ""}
                                    onChange={(e) => updateDraft(task.id, { signatureName: e.target.value })}
                                    placeholder="Signer name"
                                    className="h-7 w-full rounded border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                  <div className="flex items-center gap-2">
                                    <input
                                      ref={(el) => {
                                        signatureInputRefs.current[task.id] = el;
                                      }}
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        await uploadSignature(task.id, file);
                                        e.target.value = "";
                                      }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => signatureInputRefs.current[task.id]?.click()}
                                      className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
                                    >
                                      Upload Signature
                                    </button>
                                    {drafts[task.id]?.signatureImage ? (
                                      <button
                                        type="button"
                                        onClick={() => updateDraft(task.id, { signatureImage: "" })}
                                        className="rounded border border-red-200 px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 transition-colors"
                                      >
                                        Remove
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      onClick={() => saveCurrentSignatureToLibrary(task.id)}
                                      className="rounded border border-blue-200 px-2.5 py-1 text-xs text-blue-700 hover:bg-blue-50 transition-colors"
                                    >
                                      Save Signature
                                    </button>
                                  </div>
                                  {drafts[task.id]?.signatureImage ? (
                                    <img
                                      src={drafts[task.id].signatureImage}
                                      alt="Signature preview"
                                      className="h-16 w-auto max-w-[220px] object-contain border border-slate-200 rounded bg-white p-1"
                                    />
                                  ) : (
                                    <p className="text-[11px] text-slate-400">No signature image selected.</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2 pt-1">
                                <button disabled={busyTaskId === task.id} onClick={() => saveReport(task.id)}
                                  className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                                  Save Draft
                                </button>
                                <button disabled={busyTaskId === task.id || !reportReady(task.id)} onClick={() => submitTask(task.id)}
                                  className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                                  {busyTaskId === task.id ? "Submitting..." : "Submit Report"}
                                </button>
                              </div>
                              {error ? (
                                <p className="text-[11px] text-red-500">{error}</p>
                              ) : null}
                              {!reportReady(task.id) && (
                                <p className="text-[11px] text-slate-400">Each radiology test must have findings and impression before submission.</p>
                              )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
                </tbody>
              </table>
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
