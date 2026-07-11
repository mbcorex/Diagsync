"use client";

import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/index";
import { formatCurrency } from "@/lib/utils";
import { UpgradeHint } from "@/components/billing/upgrade-hint";

type Sex = "MALE" | "FEMALE" | "OTHER";
type Priority = "ROUTINE" | "URGENT" | "EMERGENCY";
type PaymentStatus = "PENDING" | "PARTIAL" | "PAID" | "WAIVED";
type FieldType = "NUMBER" | "TEXT" | "TEXTAREA" | "DROPDOWN" | "CHECKBOX";
type TestType = "LAB" | "RADIOLOGY";
type Department = "LABORATORY" | "RADIOLOGY";

const NON_REMOVABLE_STATUSES = new Set([
  "SUBMITTED_FOR_REVIEW",
  "EDIT_REQUESTED",
  "RESUBMITTED",
  "APPROVED",
  "RELEASED",
]);

interface TestResult {
  id: string;
  name: string;
  code: string;
  type: "LAB" | "RADIOLOGY";
  department: string;
  price?: number | string;
  sampleType?: string | null;
  category?: { name: string } | null;
}

type CartItem = TestResult & {
  enteredPrice: string;
  orderId?: string;
  status?: string;
};

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

interface Props {
  visitId: string;
  patient: {
    id: string;
    patientId: string;
    fullName: string;
    age: number;
    sex: Sex;
    phone: string;
    email?: string | null;
    address?: string | null;
    dateOfBirth?: string | null;
    referringDoctor?: string | null;
    clinicalNote?: string | null;
  };
  visit: {
    priority: Priority;
    amountPaid: number;
    discount: number;
    paymentMethod?: string | null;
    notes?: string | null;
  };
  tests: Array<{
    orderId: string;
    status: string;
    id: string;
    name: string;
    code: string;
    type: "LAB" | "RADIOLOGY";
    department: string;
    sampleType?: string | null;
    category?: { name: string } | null;
    price: number;
  }>;
}

function toFieldKey(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toNumber(value: number | string) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

const inputCls =
  "h-8 w-full rounded border border-slate-200 bg-white px-2.5 text-xs text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500";
const labelCls = "block text-[11px] font-medium text-slate-500 mb-1";

export function EditPatientForm({ visitId, patient, visit, tests }: Props) {
  const router = useRouter();
  const searchRef = useRef<HTMLDivElement>(null);

  const [patientNumber, setPatientNumber] = useState(patient.patientId);
  const [fullName, setFullName] = useState(patient.fullName);
  const [age, setAge] = useState(patient.age > 0 ? String(patient.age) : "");
  const [sex, setSex] = useState<Sex>(patient.sex);
  const [phone, setPhone] = useState(patient.phone);
  const [email, setEmail] = useState(patient.email ?? "");
  const [address, setAddress] = useState(patient.address ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(patient.dateOfBirth?.slice(0, 10) ?? "");
  const [referringDoctor, setReferringDoctor] = useState(patient.referringDoctor ?? "");
  const [clinicalNote, setClinicalNote] = useState(patient.clinicalNote ?? "");

  const [priority, setPriority] = useState<Priority>(visit.priority);
  const [amountPaid, setAmountPaid] = useState(String(visit.amountPaid));
  const [discount, setDiscount] = useState(String(visit.discount));
  const [paymentMethod, setPaymentMethod] = useState(visit.paymentMethod ?? "");
  const [visitNotes, setVisitNotes] = useState(visit.notes ?? "");

  const [testSearch, setTestSearch] = useState("");
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasAdvancedDiagnosticsAccess, setHasAdvancedDiagnosticsAccess] = useState(true);
  const [billingAccessLoaded, setBillingAccessLoaded] = useState(false);

  const [cart, setCart] = useState<CartItem[]>(
    tests.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      type: row.type,
      department: row.department,
      sampleType: row.sampleType,
      category: row.category,
      enteredPrice: String(row.price),
      orderId: row.orderId,
      status: row.status,
    }))
  );

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

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + toNumber(item.enteredPrice), 0), [cart]);
  const discountAmount = toNumber(discount);
  const totalAmount = Math.max(0, subtotal - discountAmount);
  const amountPaidNumber = toNumber(amountPaid);
  const balance = Math.max(0, totalAmount - amountPaidNumber);

  const paymentStatus: PaymentStatus = useMemo(() => {
    if (totalAmount <= 0) return "PAID";
    if (amountPaidNumber >= totalAmount) return "PAID";
    if (amountPaidNumber > 0) return "PARTIAL";
    return "PENDING";
  }, [totalAmount, amountPaidNumber]);

  const paymentBadge: Record<PaymentStatus, string> = {
    PAID: "bg-green-50 text-green-700",
    PARTIAL: "bg-amber-50 text-amber-700",
    PENDING: "bg-red-50 text-red-600",
    WAIVED: "bg-slate-100 text-slate-600",
  };

  const searchTests = useCallback(
    async (query: string) => {
      if (query.length < 1) {
        setTestResults([]);
        setShowDropdown(false);
        return;
      }
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/tests?search=${encodeURIComponent(query)}`);
        const json = await res.json();
        if (!json.success) return;
        const cartIds = new Set(cart.map((item) => item.id));
        setTestResults((json.data as TestResult[]).filter((item) => !cartIds.has(item.id)));
        setShowDropdown(true);
      } finally {
        setSearchLoading(false);
      }
    },
    [cart]
  );

  useEffect(() => {
    const t = setTimeout(() => {
      void searchTests(testSearch);
    }, 250);
    return () => clearTimeout(t);
  }, [searchTests, testSearch]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
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

  function addToCart(test: TestResult) {
    setCart((prev) => [...prev, { ...test, enteredPrice: String(toNumber(test.price ?? 0)) }]);
    setTestSearch("");
    setShowDropdown(false);
    setTestResults([]);
  }

  function removeFromCart(item: CartItem) {
    if (item.status && NON_REMOVABLE_STATUSES.has(item.status)) {
      setError(`Cannot remove ${item.name} because result was already submitted to MD.`);
      return;
    }
    setCart((prev) => prev.filter((row) => row.id !== item.id));
  }

  function updatePrice(testId: string, value: string) {
    setCart((prev) => prev.map((row) => (row.id === testId ? { ...row, enteredPrice: value } : row)));
  }

  function setField(index: number, patch: Partial<CreateFieldDraft>) {
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

  function addFieldDraft() {
    setCreateFields((prev) => [...prev, emptyField()]);
  }

  function removeFieldDraft(index: number) {
    setCreateFields((prev) => prev.filter((_, i) => i !== index));
  }

  async function createTest() {
    setError("");
    setSuccess("");
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
          price: toNumber(createPrice),
          turnaroundMinutes: Math.max(1, Math.trunc(toNumber(createTurnaround) || 120)),
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
        setError(json.error ?? "Failed to create test.");
        return;
      }

      const createdId = json.data?.id as string | undefined;
      if (!createdId) {
        setError("Test created but ID was missing from response.");
        return;
      }

      const singleRes = await fetch(`/api/tests/${createdId}`);
      const singleJson = await singleRes.json();
      if (!singleJson.success) {
        setError("Test created, but failed to load it for this patient.");
        return;
      }

      addToCart(singleJson.data as TestResult);
      setSuccess("Test created and added to this patient.");
      setCreateName("");
      setCreateCode("");
      setCreatePrice("");
      setCreateTurnaround("120");
      setCreateSampleType("");
      setCreateDescription("");
      setCreateFields([emptyField()]);
      setShowCreateTest(false);
    } catch {
      setError("Network error while creating test.");
    } finally {
      setCreateBusy(false);
    }
  }

  async function saveChanges() {
    setError("");
    setSuccess("");

    if (!patientNumber.trim()) return setError("Patient number is required.");
    if (!fullName.trim()) return setError("Patient full name is required.");
    if (age.trim() && Number.isNaN(Number(age))) return setError("Enter a valid age.");
    if (phone.trim() && phone.trim().replace(/\D/g, "").length < 7) return setError("Enter a valid phone number.");
    if (cart.length === 0) return setError("At least one test is required.");
    if (cart.some((item) => toNumber(item.enteredPrice) <= 0)) return setError("Each test must have a valid price.");

    setSaving(true);
    try {
      const payload = {
        patient: {
          patientId: patientNumber.trim(),
          fullName: fullName.trim(),
          age: age.trim() ? Math.trunc(Number(age)) : undefined,
          sex,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          address: address.trim() || undefined,
          dateOfBirth: dateOfBirth || undefined,
          referringDoctor: referringDoctor.trim() || undefined,
          clinicalNote: clinicalNote.trim() || undefined,
        },
        visit: {
          priority,
          amountPaid: amountPaidNumber,
          discount: discountAmount,
          paymentMethod: paymentMethod || undefined,
          notes: visitNotes.trim() || undefined,
        },
        tests: cart.map((item) => ({ testId: item.id, price: toNumber(item.enteredPrice) })),
      };

      const res = await fetch(`/api/visits/${visitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? "Failed to save patient updates.");
        return;
      }

      setSuccess("Patient updates saved. Added tests were routed to lab automatically.");
      router.refresh();
    } catch {
      setError("Network error while saving patient updates.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
        Remove test is allowed only before result submission to MD. Added tests are routed to lab automatically.
      </div>

      {error ? (
        <div className="space-y-2">
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>
          {isUpgradeRelatedMessage(error) ? (
            <UpgradeHint message="Your current plan limits this action. Upgrade to continue." ctaLabel="Open Billing" />
          ) : null}
        </div>
      ) : null}
      {success ? <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">{success}</div> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Patient Details</span>
            </div>
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Patient Number *</label>
                <input className={inputCls} value={patientNumber} onChange={(e) => setPatientNumber(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Full Name *</label>
                <input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Age</label>
                <input className={inputCls} type="number" min="0" max="150" value={age} onChange={(e) => setAge(e.target.value)} />
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
                <label className={labelCls}>Phone</label>
                <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Date of Birth</label>
                <input className={inputCls} type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Referring Doctor</label>
                <input className={inputCls} value={referringDoctor} onChange={(e) => setReferringDoctor(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Address</label>
                <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Clinical Note</label>
                <textarea
                  rows={2}
                  className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  value={clinicalNote}
                  onChange={(e) => setClinicalNote(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tests Ordered</span>
            </div>
            <div className="space-y-3 p-4">
              <div ref={searchRef} className="relative">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    className="h-8 w-full rounded border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Search existing tests by name/code"
                    value={testSearch}
                    onChange={(e) => setTestSearch(e.target.value)}
                    onFocus={() => testSearch.length > 0 && setShowDropdown(true)}
                  />
                  {searchLoading ? <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">Searching...</span> : null}
                </div>

                {showDropdown && testResults.length > 0 ? (
                  <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded border border-slate-200 bg-white shadow-lg">
                    {testResults.map((test) => (
                      <button
                        key={test.id}
                        type="button"
                        onClick={() => addToCart(test)}
                        className="flex w-full items-center justify-between border-b border-slate-100 px-3 py-2.5 text-left text-xs hover:bg-slate-50 last:border-0"
                      >
                        <div>
                          <p className="font-medium text-slate-800">{test.name}</p>
                          <p className="text-slate-400">{test.code} · {test.category?.name ?? test.department}</p>
                        </div>
                        <span className={`rounded px-1.5 py-0.5 font-medium text-[11px] ${test.type === "LAB" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                          {test.type}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {showDropdown && testSearch.length > 0 && testResults.length === 0 && !searchLoading ? (
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
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setShowCreateTest((prev) => !prev)}
                className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
              >
                <Plus className="h-3.5 w-3.5" />
                {showCreateTest ? "Hide New Test Form" : "Create New Test"}
              </button>

              {showCreateTest ? (
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
                      <button type="button" onClick={addFieldDraft} className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100">Add Field</button>
                    </div>
                    {createFields.map((field, idx) => (
                      <div key={idx} className="grid grid-cols-1 gap-2 rounded border border-slate-200 bg-white p-2 sm:grid-cols-2 lg:grid-cols-4">
                        <input className={inputCls} placeholder="Label" value={field.label} onChange={(e) => setField(idx, { label: e.target.value })} />
                        <input className={inputCls} placeholder="field_key" value={field.fieldKey} onChange={(e) => setField(idx, { fieldKey: e.target.value })} />
                        <Select value={field.fieldType} onValueChange={(v) => setField(idx, { fieldType: v as FieldType })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="NUMBER">NUMBER</SelectItem>
                            <SelectItem value="TEXT">TEXT</SelectItem>
                            <SelectItem value="TEXTAREA">TEXTAREA</SelectItem>
                            <SelectItem value="DROPDOWN">DROPDOWN</SelectItem>
                            <SelectItem value="CHECKBOX">CHECKBOX</SelectItem>
                          </SelectContent>
                        </Select>
                        <input className={inputCls} placeholder="Unit" value={field.unit} onChange={(e) => setField(idx, { unit: e.target.value })} />
                        <input className={inputCls} placeholder="Normal min" value={field.normalMin} onChange={(e) => setField(idx, { normalMin: e.target.value })} />
                        <input className={inputCls} placeholder="Normal max" value={field.normalMax} onChange={(e) => setField(idx, { normalMax: e.target.value })} />
                        <input className={inputCls} placeholder="Normal text" value={field.normalText} onChange={(e) => setField(idx, { normalText: e.target.value })} />
                        <input className={inputCls} placeholder="Options (a,b,c)" value={field.options} onChange={(e) => setField(idx, { options: e.target.value })} />
                        <input className={inputCls} placeholder="Reference note" value={field.referenceNote} onChange={(e) => setField(idx, { referenceNote: e.target.value })} />
                        {createFields.length > 1 ? (
                          <button type="button" onClick={() => removeFieldDraft(idx)} className="rounded border border-red-200 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50">Remove</button>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => void createTest()}
                    disabled={createBusy}
                    className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {createBusy ? "Creating..." : "Create Test and Add"}
                  </button>
                </div>
              ) : null}

              {cart.length === 0 ? (
                <p className="rounded border border-dashed border-slate-200 py-4 text-center text-xs text-slate-400">No tests selected.</p>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="pb-2 text-left font-medium text-slate-400">Test</th>
                      <th className="pb-2 text-left font-medium text-slate-400">Status</th>
                      <th className="pb-2 text-left font-medium text-slate-400">Price (N)</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cart.map((item) => {
                      const isLocked = !!item.status && NON_REMOVABLE_STATUSES.has(item.status);
                      return (
                        <tr key={item.id}>
                          <td className="py-2 text-slate-700">
                            <p className="font-medium text-slate-800">{item.name}</p>
                            <p className="font-mono text-[11px] text-slate-400">{item.code}</p>
                          </td>
                          <td className="py-2">
                            <span className={`rounded px-1.5 py-0.5 ${isLocked ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                              {item.status ?? "NEW"}
                            </span>
                          </td>
                          <td className="py-2">
                            <input className="h-7 w-24 rounded border border-slate-200 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" type="number" min="0" value={item.enteredPrice} onChange={(e) => updatePrice(item.id, e.target.value)} />
                          </td>
                          <td className="py-2 text-right">
                            <button type="button" onClick={() => removeFromCart(item)} className="text-slate-300 hover:text-red-600" title={isLocked ? "Cannot remove after MD submission" : "Remove test"}>
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Visit & Payment</span>
            </div>
            <div className="space-y-3 p-4">
              <div>
                <label className={labelCls}>Priority</label>
                <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ROUTINE">Routine</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                    <SelectItem value="EMERGENCY">Emergency</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className={labelCls}>Discount (N)</label>
                <input className={inputCls} type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Amount Paid (N)</label>
                <input className={inputCls} type="number" min="0" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Payment Method</label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="TRANSFER">Transfer</SelectItem>
                    <SelectItem value="POS">POS / Card</SelectItem>
                    <SelectItem value="HMO">HMO / Insurance</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className={labelCls}>Visit Notes</label>
                <textarea
                  rows={2}
                  className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  value={visitNotes}
                  onChange={(e) => setVisitNotes(e.target.value)}
                />
              </div>

              <div className="rounded border border-slate-100 bg-slate-50 p-2.5 text-xs space-y-1.5">
                <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
                <div className="flex justify-between text-slate-500"><span>Discount</span><span>{formatCurrency(discountAmount)}</span></div>
                <div className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-800"><span>Total</span><span>{formatCurrency(totalAmount)}</span></div>
                <div className="flex justify-between text-slate-500"><span>Balance</span><span>{formatCurrency(balance)}</span></div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Payment Status</span>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${paymentBadge[paymentStatus]}`}>{paymentStatus}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={() => void saveChanges()}
            className="w-full rounded bg-blue-600 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Patient Updates"}
          </button>
        </div>
      </div>
    </div>
  );
}

