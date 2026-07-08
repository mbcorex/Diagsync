"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Plus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/index";
import { formatCurrency } from "@/lib/utils";
import { UpgradeHint } from "@/components/billing/upgrade-hint";
import { enqueueOfflinePatient, listOfflinePatientItems, removeOfflinePatient, type OfflinePatientPayload } from "@/lib/offline-sync";
import { buildReferenceNote, splitReferenceNote } from "@/lib/reference-ranges";
import { estimateDateOfBirthFromEnteredAge } from "@/lib/patient-age";

interface TestResult {
  id: string; name: string; code: string; type: "LAB" | "RADIOLOGY";
  department: string; price?: number | string; sampleType?: string | null; category?: { name: string } | null;
  resultFields?: Array<{
    id: string;
    label: string;
    fieldKey: string;
    fieldType: "NUMBER" | "TEXT" | "TEXTAREA" | "DROPDOWN" | "CHECKBOX";
    unit?: string | null;
    normalMin?: number | null;
    normalMax?: number | null;
    normalText?: string | null;
    referenceNote?: string | null;
  }>;
}
interface CartItem extends TestResult { enteredPrice: string }
type Priority = "ROUTINE" | "URGENT" | "EMERGENCY";
type PaymentStatus = "PENDING" | "PAID" | "PARTIAL" | "WAIVED";
type Sex = "MALE" | "FEMALE" | "OTHER";
type AgeUnit = "YEARS" | "MONTHS" | "DAYS";
type RangeProfile = "MALE" | "FEMALE" | "CHILD";
type FieldType = "NUMBER" | "TEXT" | "TEXTAREA" | "DROPDOWN" | "CHECKBOX";
type TestType = "LAB" | "RADIOLOGY";
type Department = "LABORATORY" | "RADIOLOGY";

type CreateFieldDraft = {
  label: string;
  fieldKey: string;
  fieldType: FieldType;
  unit: string;
  normalMin: string;
  normalMax: string;
  normalText: string;
  referenceNote: string;
  options: string;
};
const TEST_PRICE_MEMORY_KEY = "diag_sync_test_price_memory_v1";

function toNumberPrice(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toFieldKey(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isAdvancedFeatureSearch(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return [
    "xray",
    "x-ray",
    "x ray",
    "mri",
    "ct",
    "scan",
    "ultrasound",
    "uss",
    "radiology",
    "cardio",
    "ecg",
    "echo",
    "doppler",
  ].some((token) => q.includes(token));
}

function isUpgradeRelatedMessage(message: string) {
  const value = message.toLowerCase();
  return (
    value.includes("available on trial or advanced plan") ||
    value.includes("staff limit reached") ||
    value.includes("upgrade")
  );
}

function emptyField(): CreateFieldDraft {
  return {
    label: "",
    fieldKey: "",
    fieldType: "TEXT",
    unit: "",
    normalMin: "",
    normalMax: "",
    normalText: "",
    referenceNote: "",
    options: "",
  };
}

const inputCls = "h-8 w-full rounded border border-slate-200 bg-white px-2.5 text-xs text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500";
const labelCls = "block text-[11px] font-medium text-slate-500 mb-1";

function profileKey(profile: RangeProfile): "male" | "female" | "child" {
  if (profile === "FEMALE") return "female";
  if (profile === "CHILD") return "child";
  return "male";
}

function defaultRangeProfile(age: string, sex: Sex, ageUnit: AgeUnit = "YEARS"): RangeProfile {
  const parsedAge = toAgeYears(age, ageUnit);
  if (parsedAge !== null && parsedAge >= 0 && parsedAge < 18) return "CHILD";
  return sex === "FEMALE" ? "FEMALE" : "MALE";
}

function toAgeYears(ageInput: string, ageUnit: AgeUnit): number | null {
  const parsedAge = Number(ageInput);
  if (!Number.isFinite(parsedAge) || parsedAge < 0) return null;
  const asYears =
    ageUnit === "YEARS" ? parsedAge : ageUnit === "MONTHS" ? parsedAge / 12 : parsedAge / 365;
  const normalized = Math.floor(asYears);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 150) return null;
  return normalized;
}

function toNullableNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function NewPatientForm() {
  const router = useRouter();
  const [patientNumber, setPatientNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [ageUnit, setAgeUnit] = useState<AgeUnit>("YEARS");
  const [sex, setSex] = useState<Sex>("MALE");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [referringDoctor, setReferringDoctor] = useState("");
  const [clinicalNote, setClinicalNote] = useState("");
  const [priority, setPriority] = useState<Priority>("ROUTINE");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("PENDING");
  const [amountPaid, setAmountPaid] = useState("");
  const [discount, setDiscount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [visitNotes, setVisitNotes] = useState("");
  const [testSearch, setTestSearch] = useState("");
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showCreateTest, setShowCreateTest] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createCode, setCreateCode] = useState("");
  const [createType, setCreateType] = useState<TestType>("LAB");
  const [createDepartment, setCreateDepartment] = useState<Department>("LABORATORY");
  const [createPrice, setCreatePrice] = useState("");
  const [createTurnaround, setCreateTurnaround] = useState("120");
  const [createSampleType, setCreateSampleType] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createFields, setCreateFields] = useState<CreateFieldDraft[]>([emptyField()]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [rangeDraftByTest, setRangeDraftByTest] = useState<Record<string, NonNullable<TestResult["resultFields"]>>>({});
  const [rangeSavingByTest, setRangeSavingByTest] = useState<Record<string, boolean>>({});
  const [expandedRangeByTest, setExpandedRangeByTest] = useState<Record<string, boolean>>({});
  const [rangeProfileByTest, setRangeProfileByTest] = useState<Record<string, RangeProfile>>({});
  const [showDropdown, setShowDropdown] = useState(false);
  const [hasAdvancedDiagnosticsAccess, setHasAdvancedDiagnosticsAccess] = useState(true);
  const [billingAccessLoaded, setBillingAccessLoaded] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [syncingOffline, setSyncingOffline] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [savedData, setSavedData] = useState<{ patientId: string; visitNumber: string; offline: boolean } | null>(null);
  const [savedPriceByTestId, setSavedPriceByTestId] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TEST_PRICE_MEMORY_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
      const normalized: Record<string, string> = {};
      for (const [testId, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (!testId || typeof value !== "string") continue;
        const trimmed = value.trim();
        if (!trimmed) continue;
        const num = Number(trimmed);
        if (!Number.isFinite(num) || num <= 0) continue;
        normalized[testId] = trimmed;
      }
      setSavedPriceByTestId(normalized);
    } catch {
      // Ignore malformed local cache and proceed.
    }
  }, []);

  function persistSavedPrice(testId: string, price: string) {
    setSavedPriceByTestId((prev) => {
      const next = { ...prev, [testId]: price };
      try {
        window.localStorage.setItem(TEST_PRICE_MEMORY_KEY, JSON.stringify(next));
      } catch {
        // Best-effort local cache only.
      }
      return next;
    });
  }

  function readFieldProfileRange(
    field: NonNullable<TestResult["resultFields"]>[number],
    profile: RangeProfile
  ) {
    const { demographicRanges } = splitReferenceNote(field.referenceNote);
    const selected = demographicRanges[profileKey(profile)];
    if (selected) return { normalMin: selected.min, normalMax: selected.max };
    return {
      normalMin: toNullableNumber(field.normalMin),
      normalMax: toNullableNumber(field.normalMax),
    };
  }

  function updateRangeValueForProfile(
    testId: string,
    fieldId: string,
    profile: RangeProfile,
    patch: { normalMin?: number | null; normalMax?: number | null }
  ) {
    setRangeDraftByTest((prev) => ({
      ...prev,
      [testId]: (prev[testId] ?? []).map((field) => {
        if (field.id !== fieldId) return field;
        const key = profileKey(profile);
        const { plainText, demographicRanges } = splitReferenceNote(field.referenceNote);
        const fallbackMin = toNullableNumber(field.normalMin);
        const fallbackMax = toNullableNumber(field.normalMax);
        const current = demographicRanges[key] ?? { min: fallbackMin, max: fallbackMax };
        const nextMin = patch.normalMin === undefined ? current.min : patch.normalMin;
        const nextMax = patch.normalMax === undefined ? current.max : patch.normalMax;
        const nextRanges = {
          ...demographicRanges,
          ...(nextMin === null || nextMax === null ? {} : { [key]: { min: nextMin, max: nextMax } }),
        };
        if (nextMin === null || nextMax === null) {
          delete nextRanges[key];
        }
        return {
          ...field,
          normalMin: nextMin,
          normalMax: nextMax,
          referenceNote: buildReferenceNote(plainText, nextRanges),
        };
      }),
    }));
  }

  const searchTests = useCallback(async (query: string) => {
    if (query.length < 1) { setTestResults([]); setShowDropdown(false); return; }
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/tests?search=${encodeURIComponent(query)}`);
      const json = await res.json();
      if (json.success) {
        const cartIds = new Set(cart.map((c) => c.id));
        setTestResults((json.data as TestResult[]).filter((t) => !cartIds.has(t.id)));
        setShowDropdown(true);
      }
    } catch {} finally { setSearchLoading(false); }
  }, [cart]);

  useEffect(() => { const t = setTimeout(() => searchTests(testSearch), 300); return () => clearTimeout(t); }, [testSearch, searchTests]);

  useEffect(() => {
    function handler(e: MouseEvent) { if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const sync = () => setIsOnline(navigator.onLine);
    sync(); window.addEventListener("online", sync); window.addEventListener("offline", sync);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/billing/overview");
        const json = await res.json();
        if (!alive || !json.success) return;
        const canUseRadiology = Boolean(json.data?.access?.canUseRadiology);
        const canUseCardiology = Boolean(json.data?.access?.canUseCardiology);
        setHasAdvancedDiagnosticsAccess(canUseRadiology || canUseCardiology);
      } catch {
        // keep permissive default to avoid false upgrade prompts
      } finally {
        if (alive) setBillingAccessLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const subtotal = cart.reduce((s, t) => s + toNumberPrice(t.enteredPrice), 0);
  const discountAmount = parseFloat(discount) || 0;
  const totalAmount = Math.max(0, subtotal - discountAmount);
  const amountPaidNum = parseFloat(amountPaid) || 0;
  const balance = Math.max(0, totalAmount - amountPaidNum);

  useEffect(() => {
    if (totalAmount === 0) return;
    if (amountPaidNum >= totalAmount) setPaymentStatus("PAID");
    else if (amountPaidNum > 0) setPaymentStatus("PARTIAL");
    else setPaymentStatus("PENDING");
  }, [amountPaidNum, totalAmount]);

  function addToCart(test: TestResult) {
    const rememberedPrice = savedPriceByTestId[test.id];
    const suggestedPrice = toNumberPrice(test.price ?? 0);
    setCart((prev) => [...prev, { ...test, enteredPrice: rememberedPrice ?? (suggestedPrice > 0 ? String(suggestedPrice) : "") }]);
    setRangeDraftByTest((prev) => ({
      ...prev,
      [test.id]: (test.resultFields ?? []).map((field) => ({ ...field })),
    }));
    setExpandedRangeByTest((prev) => ({ ...prev, [test.id]: true }));
    setRangeProfileByTest((prev) => ({ ...prev, [test.id]: defaultRangeProfile(age, sex, ageUnit) }));
    setTestSearch("");
    setTestResults([]);
    setShowDropdown(false);
  }
  function removeFromCart(id: string) {
    setCart((prev) => prev.filter((t) => t.id !== id));
    setRangeDraftByTest((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setExpandedRangeByTest((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setRangeProfileByTest((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }
  function updateCartPrice(id: string, value: string) {
    setCart((prev) => prev.map((item) => item.id === id ? { ...item, enteredPrice: value } : item));

    const trimmed = value.trim();
    const parsed = Number(trimmed);
    if (!trimmed || !Number.isFinite(parsed) || parsed <= 0) return;
    persistSavedPrice(id, trimmed);
  }

  function setCreateField(index: number, patch: Partial<CreateFieldDraft>) {
    setCreateFields((prev) =>
      prev.map((field, i) => {
        if (i !== index) return field;
        const next = { ...field, ...patch };
        if ("label" in patch && (!next.fieldKey || next.fieldKey === toFieldKey(field.label))) {
          next.fieldKey = toFieldKey(next.label);
        }
        return next;
      })
    );
  }

  function addCreateField() {
    setCreateFields((prev) => [...prev, emptyField()]);
  }

  function removeCreateField(index: number) {
    setCreateFields((prev) => prev.filter((_, i) => i !== index));
  }

  async function createTestAndAddToCart() {
    setError("");
    if (!createName.trim() || !createCode.trim()) {
      setError("Test name and code are required.");
      return;
    }
    if (createFields.some((field) => !field.label.trim() || !field.fieldKey.trim())) {
      setError("Each test field needs label and field key.");
      return;
    }

    setCreateBusy(true);
    try {
      const res = await fetch("/api/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          code: createCode.trim().toUpperCase(),
          type: createType,
          department: createDepartment,
          price: toNumberPrice(createPrice),
          turnaroundMinutes: Math.max(1, Math.trunc(toNumberPrice(createTurnaround) || 120)),
          sampleType: createSampleType.trim() || undefined,
          description: createDescription.trim() || undefined,
          fields: createFields.map((field) => ({
            label: field.label.trim(),
            fieldKey: field.fieldKey.trim(),
            fieldType: field.fieldType,
            unit: field.unit.trim() || undefined,
            normalMin: field.normalMin.trim() ? Number(field.normalMin) : undefined,
            normalMax: field.normalMax.trim() ? Number(field.normalMax) : undefined,
            normalText: field.normalText.trim() || undefined,
            referenceNote: field.referenceNote.trim() || undefined,
            options: field.options.trim() || undefined,
            isRequired: true,
          })),
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? "Failed to create test");
        return;
      }

      const createdId = json.data?.id as string | undefined;
      if (!createdId) {
        setError("Test created but could not be added automatically.");
        return;
      }

      const singleRes = await fetch(`/api/tests/${createdId}`);
      const singleJson = await singleRes.json();
      if (!singleJson.success) {
        setError("Test created, but failed to load it back.");
        return;
      }

      addToCart(singleJson.data as TestResult);
      setShowCreateTest(false);
      setCreateName("");
      setCreateCode("");
      setCreatePrice("");
      setCreateTurnaround("120");
      setCreateSampleType("");
      setCreateDescription("");
      setCreateFields([emptyField()]);
    } catch {
      setError("Network error while creating test.");
    } finally {
      setCreateBusy(false);
    }
  }

  function updateRangeValue(
    testId: string,
    fieldId: string,
    patch: Partial<NonNullable<TestResult["resultFields"]>[number]>
  ) {
    setRangeDraftByTest((prev) => ({
      ...prev,
      [testId]: (prev[testId] ?? []).map((field) => {
        if (field.id !== fieldId) return field;
        if (typeof patch.referenceNote === "string") {
          const { demographicRanges } = splitReferenceNote(field.referenceNote);
          return {
            ...field,
            ...patch,
            referenceNote: buildReferenceNote(patch.referenceNote, demographicRanges),
          };
        }
        return { ...field, ...patch };
      }),
    }));
  }

  async function saveRangesForTest(testId: string) {
    const rows = rangeDraftByTest[testId] ?? [];
    if (rows.length === 0) return;
    for (const row of rows) {
      const min = toNullableNumber(row.normalMin);
      const max = toNullableNumber(row.normalMax);
      if (typeof min === "number" && typeof max === "number" && min > max) {
        setError(`Invalid range in ${row.label}: min cannot be greater than max.`);
        return;
      }
      const { demographicRanges } = splitReferenceNote(row.referenceNote);
      for (const profile of ["male", "female", "child"] as const) {
        const selected = demographicRanges[profile];
        if (!selected) continue;
        if (selected.min > selected.max) {
          setError(`Invalid ${profile} range in ${row.label}: min cannot be greater than max.`);
          return;
        }
      }
    }
    setRangeSavingByTest((prev) => ({ ...prev, [testId]: true }));
    try {
      const payload = {
        rangeFields: rows.map((row) => ({
          id: row.id,
          normalMin: toNullableNumber(row.normalMin),
          normalMax: toNullableNumber(row.normalMax),
          normalText: row.normalText ?? null,
          referenceNote: row.referenceNote ?? null,
        })),
      };
      const res = await fetch(`/api/tests/${testId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? "Unable to save ranges");
        return;
      }
      const updatedFields = (json.data?.resultFields ?? rows) as NonNullable<TestResult["resultFields"]>;
      setRangeDraftByTest((prev) => ({ ...prev, [testId]: updatedFields }));
      setCart((prev) =>
        prev.map((item) => (item.id === testId ? { ...item, resultFields: updatedFields } : item))
      );
    } catch {
      setError("Network error while saving ranges.");
    } finally {
      setRangeSavingByTest((prev) => ({ ...prev, [testId]: false }));
    }
  }

  function buildPayload(): OfflinePatientPayload {
    const ageYears = toAgeYears(age, ageUnit);
    const resolvedDateOfBirth =
      dateOfBirth ||
      (ageUnit !== "YEARS" ? estimateDateOfBirthFromEnteredAge(age, ageUnit) ?? undefined : undefined);
    return {
      patientId: patientNumber.trim(),
      fullName: fullName.trim(), age: ageYears ?? undefined, sex, phone: phone.trim() || undefined,
      email: email.trim() || undefined, address: address.trim() || undefined,
      dateOfBirth: resolvedDateOfBirth, referringDoctor: referringDoctor.trim() || undefined,
      clinicalNote: clinicalNote.trim() || undefined, priority, paymentStatus,
      amountPaid: amountPaidNum, discount: discountAmount,
      paymentMethod: paymentMethod || undefined, notes: visitNotes.trim() || undefined,
      testIds: cart.map((item) => item.id),
      testPrices: cart.map((item) => ({ testId: item.id, price: toNumberPrice(item.enteredPrice) })),
    };
  }

  const syncOfflinePatients = useCallback(async () => {
    if (!navigator.onLine) return;
    const pending = listOfflinePatientItems();
    if (pending.length === 0) return;
    setSyncingOffline(true);
    for (const item of pending) {
      try {
        const res = await fetch("/api/patients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.payload) });
        const json = await res.json();
        if (json.success) removeOfflinePatient(item.id);
      } catch { break; }
    }
    setSyncingOffline(false);
  }, []);

  useEffect(() => { if (isOnline) void syncOfflinePatients(); }, [isOnline, syncOfflinePatients]);

  async function handleSubmit() {
    setError("");
    const ageYears = toAgeYears(age, ageUnit);
    const phoneValue = phone.trim();
    if (!patientNumber.trim()) return setError("Patient number is required.");
    if (!fullName.trim()) return setError("Patient full name is required.");
    if (age.trim() && ageYears === null) return setError("Enter a valid age.");
    if (phoneValue && phoneValue.replace(/\D/g, "").length < 7) return setError("Enter a valid phone number.");
    if (cart.length === 0) return setError("Please add at least one test.");
    if (cart.some((item) => toNumberPrice(item.enteredPrice) <= 0)) return setError("Enter a valid price for each test.");
    const payload = buildPayload();
    if (!isOnline) {
      enqueueOfflinePatient(payload);
      setSavedData({ patientId: patientNumber.trim(), visitNumber: `LOCAL-${Date.now().toString().slice(-6)}`, offline: true });
      setSuccess(true); return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/patients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!json.success) { setError(json.error ?? "Something went wrong"); return; }
      setSavedData({ patientId: json.data.patientId, visitNumber: json.data.visitNumber, offline: false });
      setSuccess(true);
    } catch { setError("Network error. Please try again."); }
    finally { setSubmitting(false); }
  }

  function resetForm() {
    setPatientNumber(""); setFullName(""); setAge(""); setAgeUnit("YEARS"); setPhone(""); setEmail(""); setAddress(""); setDateOfBirth("");
    setReferringDoctor(""); setClinicalNote(""); setPriority("ROUTINE"); setPaymentStatus("PENDING");
    setAmountPaid(""); setDiscount(""); setPaymentMethod(""); setVisitNotes(""); setCart([]);
    setRangeDraftByTest({});
    setRangeSavingByTest({});
    setExpandedRangeByTest({});
    setRangeProfileByTest({});
  }

  const paymentBadge: Record<string, string> = {
    PAID: "bg-green-50 text-green-700", PARTIAL: "bg-amber-50 text-amber-700",
    PENDING: "bg-red-50 text-red-600", WAIVED: "bg-slate-100 text-slate-600",
  };

  // Success screen
  if (success && savedData) return (
    <div className="max-w-sm mx-auto rounded-lg border border-slate-200 bg-white p-6 text-center space-y-4">
      <div className="mx-auto h-12 w-12 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-xl">✓</div>
      <div>
        <h2 className="text-sm font-semibold text-slate-800">Patient Registered</h2>
        <p className="text-xs text-slate-400 mt-1">
          {savedData.offline ? "Saved locally. Will sync when online." : "Tests routed to departments."}
        </p>
      </div>
      <div className="rounded border border-slate-100 bg-slate-50 p-3 text-left space-y-1.5">
        {[["Patient ID", savedData.patientId], ["Visit No.", savedData.visitNumber], ["Tests", cart.length], ["Total", formatCurrency(totalAmount)]].map(([k, v]) => (
          <div key={String(k)} className="flex justify-between text-xs">
            <span className="text-slate-500">{k}</span>
            <span className="font-mono font-medium text-slate-800">{v}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={() => { setSuccess(false); setSavedData(null); resetForm(); }} className="flex-1 rounded border border-slate-200 py-1.5 text-xs text-slate-600 hover:bg-slate-50 transition-colors">Register Another</button>
        <button onClick={() => router.push("/dashboard/receptionist")} className="flex-1 rounded bg-blue-600 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors">Dashboard</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Online status */}
      <div className={`rounded border px-3 py-1.5 text-xs ${isOnline ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
        {isOnline ? (syncingOffline ? "Online — syncing offline registrations..." : "Online") : "Offline — registration will be saved locally."}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {/* Left: patient + tests */}
        <div className="lg:col-span-2 space-y-4">

          {/* Patient details */}
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Patient Details</span>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Patient Number *</label>
                <input placeholder="e.g. PT-CMO-00009" value={patientNumber} onChange={(e) => setPatientNumber(e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Full Name *</label>
                <input placeholder="e.g. Musa Ibrahim" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Age (optional)</label>
                <div className="grid grid-cols-[1fr_120px] gap-2">
                  <input
                    type="number"
                    min="0"
                    max={ageUnit === "YEARS" ? 150 : ageUnit === "MONTHS" ? 1800 : 55000}
                    placeholder={ageUnit === "YEARS" ? "32" : ageUnit === "MONTHS" ? "8" : "14"}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    className={inputCls}
                  />
                  <Select value={ageUnit} onValueChange={(v) => setAgeUnit(v as AgeUnit)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="YEARS">Years</SelectItem>
                      <SelectItem value="MONTHS">Months</SelectItem>
                      <SelectItem value="DAYS">Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="mt-1 text-[10px] text-slate-400">Leave blank if unknown. For babies, enter months or days.</p>
              </div>
              <div>
                <label className={labelCls}>Sex *</label>
                <Select value={sex} onValueChange={(v) => setSex(v as Sex)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">Male</SelectItem>
                    <SelectItem value="FEMALE">Female</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className={labelCls}>Phone (optional)</label>
                <input placeholder="+234..." value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Email (optional)</label>
                <input type="email" placeholder="patient@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Date of Birth (optional)</label>
                <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Referring Doctor (optional)</label>
                <input placeholder="Dr. ..." value={referringDoctor} onChange={(e) => setReferringDoctor(e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Address (optional)</label>
                <input placeholder="Home address" value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Clinical Note / Complaint (optional)</label>
                <textarea rows={2} placeholder="Brief clinical complaint..." value={clinicalNote} onChange={(e) => setClinicalNote(e.target.value)}
                  className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
              </div>
            </div>
          </div>

          {/* Tests */}
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tests Ordered</span>
            </div>
            <div className="p-4 space-y-3">
              {/* Search */}
              <div ref={searchRef} className="relative">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    placeholder="Search tests by name or code (e.g. FBC, X-Ray)..."
                    value={testSearch}
                    onChange={(e) => setTestSearch(e.target.value)}
                    onFocus={() => testSearch.length > 0 && setShowDropdown(true)}
                    className="h-8 w-full rounded border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {searchLoading && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">Searching...</span>}
                </div>

                {showDropdown && testResults.length > 0 && (
                  <div className="absolute z-50 mt-1 w-full rounded border border-slate-200 bg-white shadow-lg max-h-[min(24rem,calc(100vh-12rem))] overflow-y-auto">
                    {testResults.map((test) => (
                      <button key={test.id} type="button" onClick={() => addToCart(test)}
                        className="flex w-full items-center justify-between px-3 py-2.5 text-xs hover:bg-slate-50 transition-colors text-left border-b border-slate-100 last:border-0">
                        <div>
                          <p className="font-medium text-slate-800">{test.name}</p>
                          <p className="text-slate-400">{test.code} · {test.category?.name ?? test.department}{test.sampleType ? ` · ${test.sampleType}` : ""}</p>
                        </div>
                        <span className={`rounded px-1.5 py-0.5 font-medium text-[11px] ${test.type === "LAB" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                          {test.type}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {showDropdown && testSearch.length > 0 && testResults.length === 0 && !searchLoading && (
                  <div className="absolute z-50 mt-1 w-full rounded border border-slate-200 bg-white shadow-lg px-3 py-3">
                    {billingAccessLoaded && !hasAdvancedDiagnosticsAccess && isAdvancedFeatureSearch(testSearch) ? (
                      <UpgradeHint
                        message={`No tests found for "${testSearch}". Radiology/Cardiology tests are available on Advanced plan.`}
                        ctaLabel="Go to Billing"
                      />
                    ) : (
                      <p className="text-center text-xs text-slate-400">No tests found for "{testSearch}"</p>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowCreateTest((prev) => !prev)}
                className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
              >
                <Plus className="h-3.5 w-3.5" />
                {showCreateTest ? "Hide New Test Form" : "Create New Test"}
              </button>

              {showCreateTest && (
                <div className="rounded border border-slate-200 bg-slate-50 p-3 space-y-3">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <label className={labelCls}>Test Name</label>
                      <input className={inputCls} value={createName} onChange={(e) => setCreateName(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Code</label>
                      <input className={inputCls} value={createCode} onChange={(e) => setCreateCode(e.target.value.toUpperCase())} />
                    </div>
                    <div>
                      <label className={labelCls}>Type</label>
                      <Select
                        value={createType}
                        onValueChange={(v) => {
                          const next = v as TestType;
                          setCreateType(next);
                          setCreateDepartment(next === "LAB" ? "LABORATORY" : "RADIOLOGY");
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LAB">Lab</SelectItem>
                          <SelectItem value="RADIOLOGY">Radiology</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className={labelCls}>Department</label>
                      <Select value={createDepartment} onValueChange={(v) => setCreateDepartment(v as Department)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LABORATORY">Laboratory</SelectItem>
                          <SelectItem value="RADIOLOGY">Radiology</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className={labelCls}>Price (N)</label>
                      <input className={inputCls} type="number" min="0" value={createPrice} onChange={(e) => setCreatePrice(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Turnaround (mins)</label>
                      <input className={inputCls} type="number" min="1" value={createTurnaround} onChange={(e) => setCreateTurnaround(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Sample Type</label>
                      <input className={inputCls} value={createSampleType} onChange={(e) => setCreateSampleType(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Description</label>
                      <input className={inputCls} value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-600">Result Fields</p>
                      <button type="button" onClick={addCreateField} className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100">Add Field</button>
                    </div>
                    {createFields.map((field, idx) => (
                      <div key={idx} className="grid grid-cols-1 gap-2 rounded border border-slate-200 bg-white p-2 sm:grid-cols-2 lg:grid-cols-4">
                        <input className={inputCls} placeholder="Label" value={field.label} onChange={(e) => setCreateField(idx, { label: e.target.value })} />
                        <input className={inputCls} placeholder="field_key" value={field.fieldKey} onChange={(e) => setCreateField(idx, { fieldKey: e.target.value })} />
                        <Select value={field.fieldType} onValueChange={(v) => setCreateField(idx, { fieldType: v as FieldType })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NUMBER">NUMBER</SelectItem>
                            <SelectItem value="TEXT">TEXT</SelectItem>
                            <SelectItem value="TEXTAREA">TEXTAREA</SelectItem>
                            <SelectItem value="DROPDOWN">DROPDOWN</SelectItem>
                            <SelectItem value="CHECKBOX">CHECKBOX</SelectItem>
                          </SelectContent>
                        </Select>
                        <input className={inputCls} placeholder="Unit" value={field.unit} onChange={(e) => setCreateField(idx, { unit: e.target.value })} />
                        <input className={inputCls} placeholder="Normal min" value={field.normalMin} onChange={(e) => setCreateField(idx, { normalMin: e.target.value })} />
                        <input className={inputCls} placeholder="Normal max" value={field.normalMax} onChange={(e) => setCreateField(idx, { normalMax: e.target.value })} />
                        <input className={inputCls} placeholder="Normal text" value={field.normalText} onChange={(e) => setCreateField(idx, { normalText: e.target.value })} />
                        <input className={inputCls} placeholder="Options (a,b,c)" value={field.options} onChange={(e) => setCreateField(idx, { options: e.target.value })} />
                        <input className={inputCls} placeholder="Reference note" value={field.referenceNote} onChange={(e) => setCreateField(idx, { referenceNote: e.target.value })} />
                        {createFields.length > 1 ? (
                          <button type="button" onClick={() => removeCreateField(idx)} className="rounded border border-red-200 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50">Remove</button>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => void createTestAndAddToCart()}
                    disabled={createBusy}
                    className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {createBusy ? "Creating..." : "Create Test and Add"}
                  </button>
                </div>
              )}

              {/* Cart */}
              {cart.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-4 border border-dashed border-slate-200 rounded">No tests added yet.</p>
              ) : (
                <div className="space-y-3">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-xs">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="pb-2 text-left font-medium text-slate-400">Test</th>
                        <th className="pb-2 text-left font-medium text-slate-400">Type</th>
                        <th className="pb-2 w-6"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cart.map((item) => (
                        <tr key={item.id}>
                          <td className="py-2 font-medium text-slate-800">{item.name} <span className="font-mono text-slate-400">{item.code}</span></td>
                          <td className="py-2">
                            <span className={`rounded px-1.5 py-0.5 font-medium ${item.type === "LAB" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{item.type}</span>
                          </td>
                          <td className="py-2">
                            <button onClick={() => removeFromCart(item.id)} className="text-slate-300 hover:text-red-500 transition-colors"><X className="h-3.5 w-3.5" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 space-y-3">
                  {cart.map((item) => {
                    const rows = rangeDraftByTest[item.id] ?? [];
                    const rangeFields = rows.filter((field) =>
                      field.fieldType === "NUMBER" ||
                      field.normalMin != null ||
                      field.normalMax != null ||
                      !!field.normalText ||
                      !!field.referenceNote
                    );
                    if (rangeFields.length === 0) return null;

                    const isOpen = expandedRangeByTest[item.id] ?? true;
                    const isSaving = !!rangeSavingByTest[item.id];
                    const activeProfile = rangeProfileByTest[item.id] ?? defaultRangeProfile(age, sex, ageUnit);

                    return (
                      <div key={`${item.id}-ranges`} className="rounded border border-blue-100 bg-blue-50/40">
                        <button
                          type="button"
                          onClick={() => setExpandedRangeByTest((prev) => ({ ...prev, [item.id]: !isOpen }))}
                          className="flex w-full items-center justify-between px-3 py-2 text-left"
                        >
                          <div>
                            <p className="text-xs font-semibold text-slate-700">{item.name} Range Fields</p>
                            <p className="text-[11px] text-slate-500">Edit values for this registration, or save as default for future patients.</p>
                          </div>
                          <span className="text-xs text-slate-500">{isOpen ? "Hide" : "Edit"}</span>
                        </button>

                        {isOpen && (
                          <div className="border-t border-blue-100 px-3 py-3 space-y-2">
                            <div className="rounded border border-slate-200 bg-white p-2.5">
                              <label className="flex items-center gap-2 text-[11px] text-slate-600">
                                <span className="font-medium">Editing default ranges for</span>
                                <Select
                                  value={activeProfile}
                                  onValueChange={(value) =>
                                    setRangeProfileByTest((prev) => ({ ...prev, [item.id]: value as RangeProfile }))
                                  }
                                >
                                  <SelectTrigger className="h-8 w-[160px] text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="MALE">Male</SelectItem>
                                    <SelectItem value="FEMALE">Female</SelectItem>
                                    <SelectItem value="CHILD">Child</SelectItem>
                                  </SelectContent>
                                </Select>
                              </label>
                            </div>
                            {rangeFields.map((field) => (
                              <div key={field.id} className="rounded border border-slate-200 bg-white p-2.5 space-y-2">
                                {(() => {
                                  const profileRange = readFieldProfileRange(field, activeProfile);
                                  const { plainText } = splitReferenceNote(field.referenceNote);
                                  return (
                                    <>
                                <div className="text-xs font-medium text-slate-700">{field.label}</div>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  <label className="space-y-1">
                                    <span className="text-[11px] text-slate-500">Normal Min</span>
                                    <input
                                      type="number"
                                      value={profileRange.normalMin ?? ""}
                                      onChange={(e) =>
                                        updateRangeValueForProfile(item.id, field.id, activeProfile, {
                                          normalMin: e.target.value === "" ? null : Number(e.target.value),
                                        })
                                      }
                                      className={inputCls}
                                    />
                                  </label>
                                  <label className="space-y-1">
                                    <span className="text-[11px] text-slate-500">Normal Max</span>
                                    <input
                                      type="number"
                                      value={profileRange.normalMax ?? ""}
                                      onChange={(e) =>
                                        updateRangeValueForProfile(item.id, field.id, activeProfile, {
                                          normalMax: e.target.value === "" ? null : Number(e.target.value),
                                        })
                                      }
                                      className={inputCls}
                                    />
                                  </label>
                                </div>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  <label className="space-y-1">
                                    <span className="text-[11px] text-slate-500">Normal Text</span>
                                    <input
                                      value={field.normalText ?? ""}
                                      onChange={(e) => updateRangeValue(item.id, field.id, { normalText: e.target.value })}
                                      className={inputCls}
                                      placeholder="e.g. Negative"
                                    />
                                  </label>
                                  <label className="space-y-1">
                                    <span className="text-[11px] text-slate-500">Reference Note</span>
                                    <input
                                      value={plainText}
                                      onChange={(e) => updateRangeValue(item.id, field.id, { referenceNote: e.target.value })}
                                      className={inputCls}
                                      placeholder="Optional note"
                                    />
                                  </label>
                                </div>
                                    </>
                                  );
                                })()}
                              </div>
                            ))}

                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[11px] text-slate-500">You can continue registration without saving these defaults.</p>
                              <button
                                type="button"
                                onClick={() => void saveRangesForTest(item.id)}
                                disabled={isSaving}
                                className="rounded border border-blue-200 bg-white px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isSaving ? "Saving..." : "Save as Default"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                </div>
              )}
            </div>
          </div>

          {/* Visit notes */}
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Visit Notes (optional)</span>
            </div>
            <div className="p-4">
              <textarea rows={2} placeholder="Any additional notes about this visit..." value={visitNotes} onChange={(e) => setVisitNotes(e.target.value)}
                className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
            </div>
          </div>
        </div>

        {/* Right: priority + billing + submit */}
        <div className="space-y-4">
          {/* Priority */}
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Priority</span>
            </div>
            <div className="p-3 space-y-1.5">
              {(["ROUTINE", "URGENT", "EMERGENCY"] as Priority[]).map((p) => (
                <button key={p} type="button" onClick={() => setPriority(p)}
                  className={`w-full flex items-center justify-between rounded border px-3 py-2 text-xs font-medium transition-colors ${
                    priority === p
                      ? p === "EMERGENCY" ? "border-red-300 bg-red-50 text-red-700" : p === "URGENT" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-blue-300 bg-blue-50 text-blue-700"
                      : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}>
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                  {priority === p && <span>✓</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Billing */}
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Billing</span>
            </div>
            <div className="p-4 space-y-3">
              {/* Line items */}
              {cart.length > 0 && (
                <div className="space-y-1">
                  {cart.map((item) => (
                    <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_130px] items-center gap-2 text-xs">
                      <span className="text-slate-500 truncate pr-2">{item.name}</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="Price"
                        value={item.enteredPrice}
                        onChange={(e) => updateCartPrice(item.id, e.target.value)}
                        className="h-8 w-full rounded border border-slate-200 px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className={labelCls}>Discount (₦)</label>
                <input type="number" min="0" placeholder="0" value={discount} onChange={(e) => setDiscount(e.target.value)} className={inputCls} />
              </div>

              {/* Totals */}
              <div className="rounded border border-slate-100 bg-slate-50 p-2.5 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-green-700">
                    <span>Discount</span><span>−{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-slate-800 border-t border-slate-200 pt-1.5">
                  <span>Total</span><span>{formatCurrency(totalAmount)}</span>
                </div>
              </div>

              <div>
                <label className={labelCls}>Amount Paid (₦)</label>
                <input type="number" min="0" placeholder="0" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} className={inputCls} />
              </div>

              <div>
                <label className={labelCls}>Payment Method</label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="TRANSFER">Bank Transfer</SelectItem>
                    <SelectItem value="POS">POS / Card</SelectItem>
                    <SelectItem value="HMO">HMO / Insurance</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Payment Status</span>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${paymentBadge[paymentStatus]}`}>{paymentStatus}</span>
              </div>

              {balance > 0 && (
                <div className="flex items-center justify-between text-xs font-semibold text-amber-700">
                  <span>Balance Due</span><span>{formatCurrency(balance)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Submit */}
          <div className="space-y-2">
            {error && (
              <div className="space-y-2">
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>
                {isUpgradeRelatedMessage(error) ? (
                  <UpgradeHint message="Your current plan limits this action. Upgrade to continue." ctaLabel="Open Billing" />
                ) : null}
              </div>
            )}
            <button
              disabled={submitting || cart.length === 0}
              onClick={handleSubmit}
              className="w-full rounded bg-blue-600 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Saving & Routing..." : `Save & Route to Lab${cart.length > 0 ? ` (${cart.length} test${cart.length !== 1 ? "s" : ""})` : ""}`}
            </button>
            <p className="text-center text-[11px] text-slate-400">Tests will be automatically routed to the correct department.</p>
          </div>
        </div>
      </div>
    </div>
  );
}


