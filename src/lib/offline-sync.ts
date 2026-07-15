const OFFLINE_PATIENT_QUEUE = "diag_sync_offline_patients";
const OFFLINE_LAB_DRAFT_QUEUE = "diag_sync_offline_lab_drafts";
const OFFLINE_RADIOLOGY_DRAFT_QUEUE = "diag_sync_offline_radiology_drafts";

export type OfflinePatientPayload = {
  patientId: string;
  fullName: string;
  age?: number;
  sex: "MALE" | "FEMALE" | "OTHER";
  phone?: string;
  email?: string;
  address?: string;
  dateOfBirth?: string;
  referringDoctor?: string;
  clinicalNote?: string;
  priority: "ROUTINE" | "URGENT" | "EMERGENCY";
  paymentStatus: "PENDING" | "PAID" | "PARTIAL" | "WAIVED";
  amountPaid: number;
  discount: number;
  paymentMethod?: string;
  notes?: string;
  testIds: string[];
  testPrices: Array<{
    testId: string;
    price: number;
  }>;
};

export type OfflinePatientItem = {
  id: string;
  createdAt: string;
  payload: OfflinePatientPayload;
};

export type OfflineLabDraftItem = {
  id: string;
  taskId: string;
  createdAt: string;
  results: Array<{
    testOrderId: string;
    resultData: Record<string, unknown>;
    notes?: string;
  }>;
};

export type OfflineRadiologyDraftItem = {
  id: string;
  taskId: string;
  createdAt: string;
  draft: {
    findings: string;
    impression: string;
    notes: string;
    testReports?: Record<string, { findings: string; impression: string; notes: string }>;
    extraFields: Record<string, string>;
    signatureName: string;
    signatureImage: string;
    extraSignatures?: Array<{
      signatureName: string;
      signatureImage: string;
    }>;
  };
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readItems<T>(key: string): T[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeItems<T>(key: string, items: T[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(items));
}

export function listOfflinePatientItems() {
  return readItems<OfflinePatientItem>(OFFLINE_PATIENT_QUEUE);
}

export function enqueueOfflinePatient(payload: OfflinePatientPayload) {
  const items = listOfflinePatientItems();
  const next: OfflinePatientItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    payload,
  };
  writeItems(OFFLINE_PATIENT_QUEUE, [next, ...items]);
  return next.id;
}

export function removeOfflinePatient(id: string) {
  const items = listOfflinePatientItems().filter((item) => item.id !== id);
  writeItems(OFFLINE_PATIENT_QUEUE, items);
}

export function listOfflineLabDraftItems() {
  return readItems<OfflineLabDraftItem>(OFFLINE_LAB_DRAFT_QUEUE);
}

export function upsertOfflineLabDraft(item: Omit<OfflineLabDraftItem, "id" | "createdAt">) {
  const items = listOfflineLabDraftItems();
  const existing = items.find((row) => row.taskId === item.taskId);
  const nextItem: OfflineLabDraftItem = {
    id: existing?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    taskId: item.taskId,
    createdAt: new Date().toISOString(),
    results: item.results,
  };
  const next = [nextItem, ...items.filter((row) => row.taskId !== item.taskId)];
  writeItems(OFFLINE_LAB_DRAFT_QUEUE, next);
  return nextItem.id;
}

export function removeOfflineLabDraft(id: string) {
  const items = listOfflineLabDraftItems().filter((item) => item.id !== id);
  writeItems(OFFLINE_LAB_DRAFT_QUEUE, items);
}

export function listOfflineRadiologyDraftItems() {
  return readItems<OfflineRadiologyDraftItem>(OFFLINE_RADIOLOGY_DRAFT_QUEUE);
}

export function upsertOfflineRadiologyDraft(item: Omit<OfflineRadiologyDraftItem, "id" | "createdAt">) {
  const items = listOfflineRadiologyDraftItems();
  const existing = items.find((row) => row.taskId === item.taskId);
  const nextItem: OfflineRadiologyDraftItem = {
    id: existing?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    taskId: item.taskId,
    createdAt: new Date().toISOString(),
    draft: item.draft,
  };
  const next = [nextItem, ...items.filter((row) => row.taskId !== item.taskId)];
  writeItems(OFFLINE_RADIOLOGY_DRAFT_QUEUE, next);
  return nextItem.id;
}

export function removeOfflineRadiologyDraft(id: string) {
  const items = listOfflineRadiologyDraftItems().filter((item) => item.id !== id);
  writeItems(OFFLINE_RADIOLOGY_DRAFT_QUEUE, items);
}

export function getOfflinePendingCount() {
  return (
    listOfflinePatientItems().length +
    listOfflineLabDraftItems().length +
    listOfflineRadiologyDraftItems().length
  );
}

