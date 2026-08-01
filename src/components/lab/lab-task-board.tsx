"use client";

import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/index";
import { formatDateTime } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useSearchParams } from "next/navigation";
import { ResultInsightBox } from "@/components/results/result-insight-box";
import { buildResultInsights } from "@/lib/result-insights";
import { listOfflineLabDraftItems, removeOfflineLabDraft, upsertOfflineLabDraft } from "@/lib/offline-sync";
import { evaluateReferenceFlag, formatReferenceDisplay, toDemographicRangeKey, upsertDemographicRange } from "@/lib/reference-ranges";
import { toCustomFieldKey } from "@/lib/custom-fields-core";
import { SIGNOFF_IMAGE_KEY, SIGNOFF_NAME_KEY, SIGNOFF_ENTRIES_KEY, extractSignOffEntriesFromMap } from "@/lib/report-signoff";
import { formatPatientAge } from "@/lib/patient-age";
import {
  SignaturePreset,
  loadSignaturePresets,
  removeSignaturePreset,
  saveSignaturePresets,
  upsertSignaturePreset,
} from "@/lib/signature-presets";
import { Plus } from "lucide-react";

type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";
type Priority = "ROUTINE" | "URGENT" | "EMERGENCY";
type SampleStatus = "PENDING" | "COLLECTED" | "RECEIVED" | "PROCESSING" | "DONE";

type ResultField = {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: "NUMBER" | "TEXT" | "TEXTAREA" | "DROPDOWN" | "CHECKBOX";
  options?: string | null;
  unit?: string | null;
  normalMin?: number | null;
  normalMax?: number | null;
  normalText?: string | null;
  referenceNote?: string | null;
  isRequired: boolean;
};

type TestOrder = {
  id: string;
  createdAt: string;
  status: string;
  test: { id: string; name: string; code: string; sampleType?: string | null; resultFields: ResultField[] };
  labResults: Array<{ id: string; resultData: Record<string, unknown>; notes?: string | null; isSubmitted: boolean; abnormalFlags?: Record<string, string> }>;
};

type LabTask = {
  id: string;
  status: TaskStatus;
  priority: Priority;
  createdAt: string;
  updatedAt: string;
  visit: {
    visitNumber: string;
    patient: { fullName: string; patientId: string; age: number; dateOfBirth?: string | null; sex: string };
  };
  sample?: { status: SampleStatus } | null;
  staff?: { id: string; fullName: string } | null;
  review?: { rejectionReason?: string | null; editedData?: unknown } | null;
  testOrders: TestOrder[];
};

type Draft = { values: Record<string, unknown>; notes: string; removedDefaultFieldKeys: string[] };
type SignatureEntry = { signatureName: string; signatureImage: string };
type TaskSignOff = SignatureEntry & { extraSignatures: SignatureEntry[] };
type SensitivityCell = { antibiotic: string; zone: string; interpretation: string };
type ReferenceUpdatePayload = {
  unit?: string | null;
  normalMin?: number | null;
  normalMax?: number | null;
  normalText?: string | null;
  referenceNote?: string | null;
};

function createEmptyDraft(): Draft {
  return { values: {}, notes: "", removedDefaultFieldKeys: [] };
}

function isSensitivityFieldKey(fieldKey: string) {
  return fieldKey.trim().toLowerCase() === "sensitivity";
}

function isCommentLikeField(field: Pick<ResultField, "fieldKey" | "label">) {
  const token = `${field.fieldKey} ${field.label}`.toLowerCase();
  return token.includes("comment") || token.includes("remark") || token.includes("interpret");
}

const DEFAULT_SENSITIVITY_ANTIBIOTICS = [
  "Lyntriaxone",
  "Gentamycin",
  "Lyncypro (Ciprofloxacin)",
  "Levostat (Levofloxacin)",
  "Velxone",
  "Amoxicilin",
  "Ornidavid",
  "Excef Tz (Ceftriaxone + Tazobactam)",
  "Ceftriazidine",
  "Streptomycin",
  "Ceftriaxone",
  "Cetroxol (Azithromycin)",
  "Cozima",
  "Rifampicin",
  "Erythromycin",
  "Mesutyl (Cefoperazone)",
  "Ciprofloxacin",
];

const SENSITIVITY_VALUE_OPTIONS = ["+", "2+", "3+", "4+", "5mm", "10mm", "15mm", "20mm", "25mm", "30mm"];
const SENSITIVITY_INTERPRETATION_OPTIONS = ["S", "R", "I"];
const HOLY_SOULS_ORGANIZATION_ID = "cmqmcob1a000n8rhw063x2dsz";
const DEFAULT_SENSITIVITY_MEMORY_KEY = "diag_sync_sensitivity_memory_v1";
const HOLY_SOULS_SENSITIVITY_ANTIBIOTICS = [
  "AMPICLOX",
  "CETROXOL",
  "AMOXIL",
  "EXACEF",
  "CIPROXIN",
  "AUGMENTIN",
  "VISKOBACT",
  "TAZOVISK",
  "LYNCIPRO",
  "ROCEPHIN",
  "MEXTIL",
  "NISETAXIME",
  "STREPTOMYCIN",
  "GENTAMYCIN",
  "AMCLAVIN",
  "PEFLACINE",
  "LYNTRIAXONE",
  "AZITHROMYCIN",
  "ORNIDAVID",
  "LEVOFLOXACIN",
  "LINCOCIN",
  "ZINNAT",
  "LYNCIPRO",
  "COZIMA",
  "ERTHROMYCIN",
  "SEPTRIN",
];

function getSensitivityMemoryKey(organizationId?: string | null) {
  return organizationId === HOLY_SOULS_ORGANIZATION_ID
    ? "diag_sync_sensitivity_memory_holy_souls_v1"
    : DEFAULT_SENSITIVITY_MEMORY_KEY;
}

function getDefaultSensitivityAntibiotics(organizationId?: string | null) {
  return organizationId === HOLY_SOULS_ORGANIZATION_ID ? HOLY_SOULS_SENSITIVITY_ANTIBIOTICS : DEFAULT_SENSITIVITY_ANTIBIOTICS;
}
const LEGACY_CULTURE_RESULT_TEXT =
  "Staphylococcus aureus & Candida albican isolated after 24hours incubation @ 370C";
const DEFAULT_CULTURE_RESULT_TEXT =
  "Staphylococcus aureus & Candida albican isolated after 24hours incubation @ 37Ã‚Â°C";
const WIDAL_FIELD_ALIASES = {
  typhiO: ["typhi_o"],
  typhiH: ["typhi_h"],
  paratyphiAO: ["paratyphi_ao", "paratyphi_a_o"],
  paratyphiAH: ["paratyphi_ah", "paratyphi_a_h"],
  paratyphiBO: ["paratyphi_bo", "paratyphi_b_o"],
  paratyphiBH: ["paratyphi_bh", "paratyphi_b_h"],
  paratyphiCO: ["paratyphi_co", "paratyphi_c_o", "paratyphi_c"],
  paratyphiCH: ["paratyphi_ch", "paratyphi_c_h"],
} as const;

const WIDAL_FIELD_KEYS = new Set(
  Object.values(WIDAL_FIELD_ALIASES)
    .flat()
    .map((key) => key.toLowerCase())
);

function isWidalTest(order: TestOrder) {
  const token = `${order.test.name} ${order.test.code}`.toLowerCase();
  return token.includes("widal");
}

function fieldNeedsReferenceAndFlag(field: ResultField) {
  return field.fieldType === "NUMBER";
}

function normalizeToken(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isMcsTestName(testName: string) {
  return normalizeToken(testName).includes("m c s");
}

function isEcgOrder(order: TestOrder) {
  const token = normalizeToken(`${order.test.name} ${order.test.code}`);
  return token.includes("ecg") || token.includes("ekg") || token.includes("holter") || token.includes("treadmill");
}

type MicroscopyRowInput = {
  wbcPus: string;
  epithelial: string;
  bacterial: string;
  yeast: string;
};

const emptyMicroscopyRowInput = (): MicroscopyRowInput => ({
  wbcPus: "",
  epithelial: "",
  bacterial: "",
  yeast: "",
});

function parseMicroscopyRowInput(raw: unknown): MicroscopyRowInput {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return emptyMicroscopyRowInput();

  const lines = text
    .replace(/\r\n/g, "\n")
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);
  const parsed = emptyMicroscopyRowInput();

  for (const line of lines) {
    const [leftRaw = "", ...rest] = line.split(":");
    const left = normalizeToken(leftRaw);
    const right = rest.join(":").trim();
    if (!right) continue;
    if (left.includes("wbc") || left.includes("pus") || left.includes("hpf")) {
      parsed.wbcPus = right;
      continue;
    }
    if (left.includes("epithelial")) {
      parsed.epithelial = right;
      continue;
    }
    if (left.includes("bacterial")) {
      parsed.bacterial = right;
      continue;
    }
    if (left.includes("yeast")) {
      parsed.yeast = right;
      continue;
    }
  }

  if (parsed.wbcPus || parsed.epithelial || parsed.bacterial || parsed.yeast) return parsed;
  return {
    ...parsed,
    wbcPus: text,
  };
}

function serializeMicroscopyRowInput(input: MicroscopyRowInput) {
  const lines = [
    ["WBC/PUS cells/HPF", input.wbcPus],
    ["Epithelial cells", input.epithelial],
    ["Bacterial cells", input.bacterial],
    ["Yeast cells", input.yeast],
  ]
    .map(([label, value]) => `${label}: ${String(value ?? "").trim()}`)
    .filter((line) => !line.endsWith(":"));
  return lines.join("\n");
}

function parseSensitivityPattern(raw: unknown): SensitivityCell[] {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) {
    return DEFAULT_SENSITIVITY_ANTIBIOTICS.map((antibiotic) => ({
      antibiotic,
      zone: "",
      interpretation: "",
    }));
  }

  const rows = text
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

      let antibiotic = line;
      let details = "";
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        antibiotic = line.slice(0, colonIndex).trim();
        details = line.slice(colonIndex + 1).trim();
      }

      let interpretation = "";
      let zone = details;
      const interpretationTail = details.match(/\b(S|R|I)\b\s*$/i);
      if (interpretationTail) {
        interpretation = interpretationTail[1].toUpperCase();
        zone = details.slice(0, interpretationTail.index).trim();
      }

      if (!details) {
        const interpretationMatch = line.match(/\b(S|R|I)\b/i);
        const zoneMatch = line.match(/\b(\d+\+|\+\+\+|\+\+|\+|\d+(?:\.\d+)?\s*mm|\d+)\b/i);
        if (interpretationMatch?.index !== undefined) {
          antibiotic = line.slice(0, interpretationMatch.index).trim();
          interpretation = interpretationMatch[1].toUpperCase();
        } else if (zoneMatch?.index !== undefined) {
          antibiotic = line.slice(0, zoneMatch.index).trim();
          zone = zoneMatch[1].trim();
        }
      }

      return {
        antibiotic: antibiotic.replace(/[-ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“:,]+$/g, "").trim(),
        zone: zone.trim(),
        interpretation,
      };
    })
    .filter((item) => item.antibiotic);

  if (rows.length === 0) {
    return DEFAULT_SENSITIVITY_ANTIBIOTICS.map((antibiotic) => ({
      antibiotic,
      zone: "",
      interpretation: "",
    }));
  }

  return rows;
}

function serializeSensitivityPattern(items: SensitivityCell[]) {
  return items
    .map((item) => {
      const antibiotic = item.antibiotic.trim();
      if (!antibiotic) return "";
      return `${antibiotic}||${item.zone.trim()}||${item.interpretation.trim().toUpperCase()}`;
    })
    .filter(Boolean)
    .join("\n");
}

function hasFilledValue(value: unknown) {
  if (typeof value === "boolean") return true;
  if (value === 0) return true;
  return value !== undefined && value !== null && `${value}`.trim() !== "";
}

function parseNumericText(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : "invalid";
}

function pickRandom<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function generateLabScientistComment(input: {
  task: LabTask;
  order: TestOrder;
  draft: Draft;
  commentFieldKey: string;
}) {
  const values = input.draft.values ?? {};
  const measuredParts: string[] = [];
  let measuredCount = 0;
  let abnormalCount = 0;

  for (const field of input.order.test.resultFields) {
    if (field.fieldKey === input.commentFieldKey) continue;
    if (isSensitivityFieldKey(field.fieldKey)) continue;
    const raw = values[field.fieldKey];
    if (!hasFilledValue(raw)) continue;

    measuredCount += 1;
    const valueText =
      typeof raw === "boolean" ? (raw ? "positive" : "negative") : String(raw).trim();
    const withUnit = field.unit ? `${valueText} ${field.unit}` : valueText;
    const flag = evaluateReferenceFlag(field, raw, {
      sex: input.task.visit.patient.sex,
      age: input.task.visit.patient.age,
    });

    if (flag === "HIGH") {
      abnormalCount += 1;
      measuredParts.push(`${field.label} is elevated (${withUnit})`);
      continue;
    }
    if (flag === "LOW") {
      abnormalCount += 1;
      measuredParts.push(`${field.label} is reduced (${withUnit})`);
      continue;
    }
    if (flag === "ABNORMAL") {
      abnormalCount += 1;
      measuredParts.push(`${field.label} is abnormal (${withUnit})`);
      continue;
    }
    measuredParts.push(`${field.label} is ${withUnit}`);
  }

  const sensitivityRows = parseSensitivityPattern(values.sensitivity).filter(
    (row) => hasFilledValue(row.zone) || hasFilledValue(row.interpretation)
  );
  const sensitiveCount = sensitivityRows.filter((row) => row.interpretation === "S").length;
  const resistantCount = sensitivityRows.filter((row) => row.interpretation === "R").length;
  const intermediateCount = sensitivityRows.filter((row) => row.interpretation === "I").length;
  const leadingSensitive = sensitivityRows
    .filter((row) => row.interpretation === "S")
    .slice(0, 3)
    .map((row) => row.antibiotic);

  const opener = pickRandom([
    `Review of ${input.order.test.name} for ${input.task.visit.patient.fullName} shows`,
    `${input.order.test.name} result summary indicates`,
    `Current laboratory profile demonstrates`,
    `Analyte review suggests`,
    `Result interpretation at this stage shows`,
  ]);

  const measuredSentence =
    measuredCount > 0
      ? pickRandom([
          `${opener} ${measuredParts.slice(0, 3).join("; ")}.`,
          `${opener} ${measuredParts.slice(0, 3).join(", ")}.`,
          `${opener} ${measuredParts.slice(0, 3).join(" and ")}.`,
        ])
      : pickRandom([
          `${opener} no additional numeric analytes were entered yet.`,
          `${opener} limited analyte data at this point.`,
          `${opener} no non-comment parameters documented yet.`,
        ]);

  const trendSentence =
    measuredCount > 0
      ? abnormalCount === 0
        ? pickRandom([
            "Overall pattern is within expected limits for the parameters provided.",
            "Entered parameters appear within reference expectation at this time.",
            "No clear deviation from expected reference trend in the documented fields.",
          ])
        : pickRandom([
            `${abnormalCount} parameter(s) show deviation that may require clinical correlation.`,
            `Observed abnormalities (${abnormalCount}) should be interpreted with the patient's clinical picture.`,
            `There are ${abnormalCount} out-of-range finding(s) requiring follow-up interpretation.`,
          ])
      : "";

  const sensitivitySentence =
    sensitivityRows.length > 0
      ? pickRandom([
          `Sensitivity profile: S=${sensitiveCount}, R=${resistantCount}, I=${intermediateCount}.`,
          `Antibiogram trend shows ${sensitiveCount} sensitive, ${resistantCount} resistant and ${intermediateCount} intermediate agents.`,
          `Susceptibility summary recorded ${sensitiveCount} sensitive, ${resistantCount} resistant, ${intermediateCount} intermediate.`,
        ]) +
        (leadingSensitive.length > 0
          ? ` Preferred sensitive options include ${leadingSensitive.join(", ")}.`
          : "")
      : "";

  const closingSentence = pickRandom([
    "Kindly correlate with symptoms and treatment history before final decision.",
    "Clinical correlation and physician review are advised.",
    "Interpret together with patient history, examination and treatment response.",
    "Recommend final interpretation in context of full clinical assessment.",
  ]);

  return [measuredSentence, trendSentence, sensitivitySentence, closingSentence]
    .filter((line) => line.trim().length > 0)
    .join(" ");
}

const priorityStyle: Record<string, string> = {
  EMERGENCY: "bg-red-50 text-red-600",
  URGENT: "bg-amber-50 text-amber-700",
  ROUTINE: "bg-slate-100 text-slate-600",
};

const statusStyle: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  COMPLETED: "bg-green-50 text-green-700",
};

function getMinutesAgoLabel(dateText: string) {
  const deltaMs = Date.now() - new Date(dateText).getTime();
  const mins = Math.max(1, Math.floor(deltaMs / 60000));
  return `${mins} min${mins > 1 ? "s" : ""} ago`;
}

function getHighlightFields(task: LabTask) {
  if (!task.review?.editedData || typeof task.review.editedData !== "object") return [];
  const data = task.review.editedData as { highlightFields?: unknown };
  if (!Array.isArray(data.highlightFields)) return [];
  return data.highlightFields.filter((row): row is string => typeof row === "string");
}

type OrderResultCardProps = {
  task: LabTask;
  order: TestOrder;
  draft: Draft;
  highlightFields: string[];
  isReady: boolean;
  suppressSensitivityField?: boolean;
  hiddenDefaultFieldKeys?: string[];
  onPersist: (task: LabTask) => Promise<void>;
  onSetFieldValue: (testOrderId: string, fieldKey: string, value: unknown) => void;
  onSetNotes: (testOrderId: string, value: string) => void;
  onAddCustomField: (testOrderId: string, label: string, value: string) => Promise<void>;
  onRemoveCustomField: (testOrderId: string, fieldKey: string) => void;
  onResetCustomFields: (testOrderId: string) => void;
  onRemoveDefaultField: (testOrderId: string, fieldKey: string) => void;
  onRestoreDefaultFields: (testOrderId: string) => void;
  onUpdateFieldReference: (testId: string, fieldId: string, payload: ReferenceUpdatePayload) => Promise<void>;
  sensitivityAntibioticOptions: string[];
  sensitivityValueOptions: string[];
  sensitivityInterpretationOptions: string[];
  onRememberSensitivityCell: (cell: SensitivityCell) => void;
};

const OrderResultCard = memo(function OrderResultCard({
  task,
  order,
  draft,
  highlightFields,
  isReady,
  suppressSensitivityField = false,
  hiddenDefaultFieldKeys = [],
  onPersist,
  onSetFieldValue,
  onSetNotes,
  onAddCustomField,
  onRemoveCustomField,
  onResetCustomFields,
  onRemoveDefaultField,
  onRestoreDefaultFields,
  onUpdateFieldReference,
  sensitivityAntibioticOptions,
  sensitivityValueOptions,
  sensitivityInterpretationOptions,
  onRememberSensitivityCell,
}: OrderResultCardProps) {
  const insightMessages = useMemo(() => buildResultInsights(draft.values ?? {}), [draft.values]);
  const highlightKey = useMemo(() => new Set(highlightFields), [highlightFields]);
  const [customLabel, setCustomLabel] = useState("");
  const [customValue, setCustomValue] = useState("");
  const [customError, setCustomError] = useState("");
  const [referenceDraftByFieldId, setReferenceDraftByFieldId] = useState<
    Record<string, { unit: string; normalMin: string; normalMax: string; normalText: string }>
  >({});
  const removedDefaults = useMemo(() => new Set(draft.removedDefaultFieldKeys ?? []), [draft.removedDefaultFieldKeys]);
  const hiddenDefaultFieldKeysSet = useMemo(
    () => new Set(hiddenDefaultFieldKeys.map((key) => key.toLowerCase())),
    [hiddenDefaultFieldKeys]
  );
  const defaultFieldKeys = useMemo(() => new Set(order.test.resultFields.map((field) => field.fieldKey)), [order.test.resultFields]);
  const visibleDefaultFields = useMemo(
    () =>
      order.test.resultFields.filter(
        (field) => !removedDefaults.has(field.fieldKey) && !hiddenDefaultFieldKeysSet.has(field.fieldKey.toLowerCase())
      ),
    [hiddenDefaultFieldKeysSet, order.test.resultFields, removedDefaults]
  );
  const visibleFieldByKey = useMemo(() => {
    const map = new Map<string, ResultField>();
    for (const field of visibleDefaultFields) {
      map.set(field.fieldKey.toLowerCase(), field);
    }
    return map;
  }, [visibleDefaultFields]);
  const findWidalField = useCallback(
    (aliases: readonly string[]) => aliases.map((key) => visibleFieldByKey.get(key)).find(Boolean),
    [visibleFieldByKey]
  );
  const widalRows = useMemo(
    () => [
      { organism: "Salmonella Typhi", titreO: findWidalField(WIDAL_FIELD_ALIASES.typhiO), h: findWidalField(WIDAL_FIELD_ALIASES.typhiH) },
      { organism: "Salmonella Paratyphi A", titreO: findWidalField(WIDAL_FIELD_ALIASES.paratyphiAO), h: findWidalField(WIDAL_FIELD_ALIASES.paratyphiAH) },
      { organism: "Salmonella Paratyphi B", titreO: findWidalField(WIDAL_FIELD_ALIASES.paratyphiBO), h: findWidalField(WIDAL_FIELD_ALIASES.paratyphiBH) },
      { organism: "Salmonella Paratyphi C", titreO: findWidalField(WIDAL_FIELD_ALIASES.paratyphiCO), h: findWidalField(WIDAL_FIELD_ALIASES.paratyphiCH) },
    ],
    [findWidalField]
  );
  const shouldRenderWidalGrid = useMemo(
    () => isWidalTest(order) && widalRows.some((row) => row.titreO || row.h),
    [order, widalRows]
  );
  const nonWidalDefaultFields = useMemo(
    () => visibleDefaultFields.filter((field) => !(shouldRenderWidalGrid && WIDAL_FIELD_KEYS.has(field.fieldKey.toLowerCase()))),
    [shouldRenderWidalGrid, visibleDefaultFields]
  );
  const customEntries = useMemo(
    () =>
      Object.entries(draft.values ?? {}).filter(([key]) => !defaultFieldKeys.has(key)),
    [defaultFieldKeys, draft.values]
  );
  const getReferenceDraft = useCallback(
    (field: ResultField) =>
      referenceDraftByFieldId[field.id] ?? {
        unit: field.unit ?? "",
        normalMin: field.normalMin == null ? "" : String(field.normalMin),
        normalMax: field.normalMax == null ? "" : String(field.normalMax),
        normalText: field.normalText ?? "",
      },
    [referenceDraftByFieldId]
  );
  const setReferenceDraft = useCallback(
    (field: ResultField, patch: Partial<{ unit: string; normalMin: string; normalMax: string; normalText: string }>) => {
      setReferenceDraftByFieldId((prev) => {
        const current = prev[field.id] ?? {
          unit: field.unit ?? "",
          normalMin: field.normalMin == null ? "" : String(field.normalMin),
          normalMax: field.normalMax == null ? "" : String(field.normalMax),
          normalText: field.normalText ?? "",
        };
        return { ...prev, [field.id]: { ...current, ...patch } };
      });
    },
    []
  );
  const persistReferenceDraft = useCallback(
    async (field: ResultField) => {
      const draftRef = getReferenceDraft(field);
      const nextMin = parseNumericText(draftRef.normalMin);
      const nextMax = parseNumericText(draftRef.normalMax);
      if (nextMin === "invalid" || nextMax === "invalid") return;

      const demographicKey = toDemographicRangeKey(task.visit.patient.sex);
      const nextReferenceNote = upsertDemographicRange(
        field.referenceNote,
        demographicKey,
        nextMin === null || nextMax === null ? null : { min: nextMin, max: nextMax }
      );
      const payload: ReferenceUpdatePayload = {
        unit: draftRef.unit.trim() || null,
        normalMin: nextMin,
        normalMax: nextMax,
        normalText: draftRef.normalText.trim() || null,
        referenceNote: nextReferenceNote || null,
      };

      const sameAsCurrent =
        (field.unit ?? null) === payload.unit &&
        (field.normalMin ?? null) === payload.normalMin &&
        (field.normalMax ?? null) === payload.normalMax &&
        (field.normalText ?? null) === payload.normalText &&
        (field.referenceNote ?? null) === payload.referenceNote;
      if (sameAsCurrent) return;

      await onUpdateFieldReference(order.test.id, field.id, payload);
    },
    [getReferenceDraft, onUpdateFieldReference, order.test.id, task.visit.patient.sex]
  );
  const renderWidalCell = useCallback(
    (field?: ResultField) => {
      if (!field) {
        return <span className="text-[11px] text-slate-400">-</span>;
      }

      const value = draft.values?.[field.fieldKey];
      const highlight = highlightKey.has(field.fieldKey);
      if (field.fieldType === "DROPDOWN") {
        const options = (field.options ?? "")
          .split(",")
          .map((row) => row.trim())
          .filter(Boolean);
        return (
          <select
            value={typeof value === "string" ? value : ""}
            onBlur={() => void onPersist(task).catch(() => undefined)}
            onChange={(e) => onSetFieldValue(order.id, field.fieldKey, e.target.value)}
            className={`w-full rounded border px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 ${highlight ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}
          >
            <option value="">Select...</option>
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );
      }

      return (
        <input
          type={field.fieldType === "NUMBER" ? "number" : "text"}
          value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
          onBlur={() => void onPersist(task).catch(() => undefined)}
          onChange={(e) => onSetFieldValue(order.id, field.fieldKey, e.target.value)}
          className={`w-full rounded border px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 ${highlight ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}
        />
      );
    },
    [draft.values, highlightKey, onPersist, onSetFieldValue, order.id, task]
  );
  const renderFieldValueControl = useCallback(
    (field: ResultField, highlight: boolean) => {
      const value = draft.values?.[field.fieldKey];
      const isCultureResultField = field.fieldKey.trim().toLowerCase() === "culture_result";
      const hasCultureValueKey =
        isCultureResultField && Object.prototype.hasOwnProperty.call(draft.values ?? {}, field.fieldKey);
      const effectiveValue =
        isCultureResultField && !hasCultureValueKey ? DEFAULT_CULTURE_RESULT_TEXT : value;
      if (field.fieldType === "DROPDOWN" && !isCultureResultField) {
        const options = (field.options ?? "").split(",").map((row) => row.trim()).filter(Boolean);
        return (
          <select
            value={typeof value === "string" ? value : ""}
            onBlur={() => void onPersist(task).catch(() => undefined)}
            onChange={(e) => onSetFieldValue(order.id, field.fieldKey, e.target.value)}
            className={`w-full rounded border px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 ${highlight ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}
          >
            <option value="">Select...</option>
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );
      }

      if (field.fieldType === "CHECKBOX") {
        return (
          <label className={`inline-flex items-center gap-2 rounded border px-2 py-1 ${highlight ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
            <input
              type="checkbox"
              checked={Boolean(value)}
              onBlur={() => void onPersist(task).catch(() => undefined)}
              onChange={(e) => onSetFieldValue(order.id, field.fieldKey, e.target.checked)}
              className="rounded border-slate-300"
            />
            <span className="text-[11px] text-slate-600">{Boolean(value) ? "Yes" : "No"}</span>
          </label>
        );
      }

      return (
        <input
          type={field.fieldType === "NUMBER" ? "number" : "text"}
          value={typeof effectiveValue === "string" || typeof effectiveValue === "number" ? String(effectiveValue) : ""}
          onBlur={() => void onPersist(task).catch(() => undefined)}
          onChange={(e) => onSetFieldValue(order.id, field.fieldKey, e.target.value)}
          className={`w-full rounded border px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 ${highlight ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}
        />
      );
    },
    [draft.values, onPersist, onSetFieldValue, order.id, task]
  );
  const sensitivityFields = useMemo(
    () => nonWidalDefaultFields.filter((field) => isSensitivityFieldKey(field.fieldKey)),
    [nonWidalDefaultFields]
  );
  const textareaFields = useMemo(
    () => nonWidalDefaultFields.filter((field) => field.fieldType === "TEXTAREA"),
    [nonWidalDefaultFields]
  );
  const tabularFields = useMemo(
    () =>
      nonWidalDefaultFields.filter(
        (field) => !isSensitivityFieldKey(field.fieldKey) && field.fieldType !== "TEXTAREA"
      ),
    [nonWidalDefaultFields]
  );
  const showReferenceAndFlagColumns = useMemo(
    () => tabularFields.some((field) => fieldNeedsReferenceAndFlag(field)),
    [tabularFields]
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs font-semibold text-slate-800">{order.test.name}</p>
          <p className="text-[11px] font-mono text-slate-400">{order.test.code}{order.test.sampleType ? ` - ${order.test.sampleType}` : ""}</p>
        </div>
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${isReady ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-600"}`}>
          {isReady ? "Ready" : "Incomplete"}
        </span>
      </div>

      <ResultInsightBox messages={insightMessages} />

      {shouldRenderWidalGrid ? (
        <div className="mt-3 rounded border border-slate-200 bg-white p-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-slate-600">Widal Test</p>
            <p className="text-[10px] text-slate-500">Titre {">="} 1:80 may be clinically significant.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-50">
                  <th className="border border-slate-200 px-2 py-1 text-left font-semibold text-slate-500">Widal Test</th>
                  <th className="border border-slate-200 px-2 py-1 text-left font-semibold text-slate-500">Titre O</th>
                  <th className="border border-slate-200 px-2 py-1 text-left font-semibold text-slate-500">H</th>
                </tr>
              </thead>
              <tbody>
                {widalRows.map((row) => (
                  <tr key={row.organism}>
                    <td className="border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700">{row.organism}</td>
                    <td className="border border-slate-200 p-1.5">{renderWidalCell(row.titreO)}</td>
                    <td className="border border-slate-200 p-1.5">{renderWidalCell(row.h)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="mt-3 space-y-3">
        {!suppressSensitivityField
          ? sensitivityFields.map((field) => {
            const value = draft.values?.[field.fieldKey];
            const label = `${field.label}${field.isRequired ? " *" : ""}${field.unit ? ` (${field.unit})` : ""}`;
            const highlight = highlightKey.has(field.fieldKey);
            const referenceText = formatReferenceDisplay(field, {
              sex: task.visit.patient.sex,
              age: task.visit.patient.age,
            });
            const cells = parseSensitivityPattern(value);
            const updateCell = (index: number, next: Partial<SensitivityCell>) => {
              const updated = cells.map((cell, cellIndex) =>
                cellIndex === index ? { ...cell, ...next } : cell
              );
              onSetFieldValue(order.id, field.fieldKey, serializeSensitivityPattern(updated));
            };
            const addRow = () => {
              const updated = [...cells, { antibiotic: "", zone: "", interpretation: "" }];
              onSetFieldValue(order.id, field.fieldKey, serializeSensitivityPattern(updated));
            };
            const removeRow = (index: number) => {
              if (cells.length <= 1) return;
              const updated = cells.filter((_, cellIndex) => cellIndex !== index);
              onSetFieldValue(order.id, field.fieldKey, serializeSensitivityPattern(updated));
            };

            return (
              <div key={field.id}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="block text-[11px] font-medium text-slate-500">{label}</label>
                  <button
                    type="button"
                    onClick={() => onRemoveDefaultField(order.id, field.fieldKey)}
                    className="rounded border border-red-200 px-1.5 py-0.5 text-[10px] text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
                {referenceText ? <p className="mb-1 text-[10px] text-slate-400">{referenceText}</p> : null}
                <div className={`rounded border ${highlight ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"} p-2`}>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] border-collapse text-[11px]">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="border border-slate-200 px-2 py-1 text-left font-semibold text-slate-500">Antibiotic</th>
                          <th className="border border-slate-200 px-2 py-1 text-left font-semibold text-slate-500">Value (+/2+/3+)</th>
                          <th className="border border-slate-200 px-2 py-1 text-left font-semibold text-slate-500">S / R / I</th>
                          <th className="border border-slate-200 px-2 py-1 text-left font-semibold text-slate-500">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cells.map((cell, index) => (
                          <tr key={`sens-row-${index}`}>
                            <td className="border border-slate-200 p-1.5">
                              <input
                                list={`sens-antibiotic-options-${order.id}`}
                                value={cell.antibiotic}
                                onBlur={() => {
                                  onRememberSensitivityCell(cell);
                                  void onPersist(task).catch(() => undefined);
                                }}
                                onChange={(e) => updateCell(index, { antibiotic: e.target.value })}
                                className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="Antibiotic name"
                              />
                            </td>
                            <td className="border border-slate-200 p-1.5">
                              <input
                                list={`sens-zone-options-${order.id}`}
                                value={cell.zone}
                                onBlur={() => {
                                  onRememberSensitivityCell(cell);
                                  void onPersist(task).catch(() => undefined);
                                }}
                                onChange={(e) => updateCell(index, { zone: e.target.value })}
                                className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="+ / 2+ / 3+ / 20mm"
                              />
                            </td>
                            <td className="border border-slate-200 p-1.5">
                              <input
                                list={`sens-int-options-${order.id}`}
                                value={cell.interpretation}
                                onBlur={() => {
                                  onRememberSensitivityCell(cell);
                                  void onPersist(task).catch(() => undefined);
                                }}
                                onChange={(e) =>
                                  updateCell(index, { interpretation: e.target.value.toUpperCase() })
                                }
                                className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="S / R / I"
                              />
                            </td>
                            <td className="border border-slate-200 p-1.5">
                              <button
                                type="button"
                                onClick={() => removeRow(index)}
                                disabled={cells.length <= 1}
                                className="rounded border border-red-200 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50 disabled:opacity-50"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <datalist id={`sens-zone-options-${order.id}`}>
                      {sensitivityValueOptions.map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                    <datalist id={`sens-int-options-${order.id}`}>
                      {sensitivityInterpretationOptions.map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                    <datalist id={`sens-antibiotic-options-${order.id}`}>
                      {sensitivityAntibioticOptions.map((option) => (
                        <option key={option} value={option} />
                      ))}
                    </datalist>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={addRow}
                      className="rounded border border-blue-200 px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-50"
                    >
                      Add antibiotic
                    </button>
                    <p className="text-[10px] text-slate-500">Note: S = Sensitivity, R = Resistance, I = Intermediate</p>
                  </div>
                </div>
              </div>
            );
          })
          : null}

        {tabularFields.length > 0 ? (
          <div className="rounded border border-slate-200 bg-white p-2">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border border-slate-200 px-2 py-1 text-left font-semibold text-slate-500">Parameter</th>
                    <th className="border border-slate-200 px-2 py-1 text-left font-semibold text-slate-500">Value</th>
                    {showReferenceAndFlagColumns ? (
                      <th className="border border-slate-200 px-2 py-1 text-left font-semibold text-slate-500">Reference</th>
                    ) : null}
                    {showReferenceAndFlagColumns ? (
                      <th className="border border-slate-200 px-2 py-1 text-left font-semibold text-slate-500">Flag</th>
                    ) : null}
                    <th className="border border-slate-200 px-2 py-1 text-left font-semibold text-slate-500">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tabularFields.map((field) => {
                    const value = draft.values?.[field.fieldKey];
                    const highlight = highlightKey.has(field.fieldKey);
                    const referenceDraft = getReferenceDraft(field);
                    const draftMin = parseNumericText(referenceDraft.normalMin);
                    const draftMax = parseNumericText(referenceDraft.normalMax);
                    const effectiveField: ResultField = {
                      ...field,
                      unit: referenceDraft.unit.trim() || null,
                      normalMin: typeof draftMin === "number" || draftMin === null ? draftMin : field.normalMin ?? null,
                      normalMax: typeof draftMax === "number" || draftMax === null ? draftMax : field.normalMax ?? null,
                      normalText: referenceDraft.normalText.trim() || null,
                    };
                    const allowReferenceAndFlag = fieldNeedsReferenceAndFlag(field);
                    const referenceText = allowReferenceAndFlag
                      ? formatReferenceDisplay(effectiveField, {
                          sex: task.visit.patient.sex,
                          age: task.visit.patient.age,
                        })
                      : "";
                    const flag = allowReferenceAndFlag
                      ? evaluateReferenceFlag(effectiveField, value, {
                          sex: task.visit.patient.sex,
                          age: task.visit.patient.age,
                        })
                      : null;
                    const label = `${field.label}${field.isRequired ? " *" : ""}${effectiveField.unit ? ` (${effectiveField.unit})` : ""}`;
                    return (
                      <tr key={field.id}>
                        <td className="border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700">{label}</td>
                        <td className="border border-slate-200 p-1.5">{renderFieldValueControl(field, highlight)}</td>
                        {showReferenceAndFlagColumns ? (
                          <td className="border border-slate-200 px-2 py-1.5 text-[10px] text-slate-500">
                            {allowReferenceAndFlag ? (
                              <>
                                <p className="mb-1">{referenceText || "-"}</p>
                                <div className="grid grid-cols-3 gap-1.5">
                                  <input
                                    type="number"
                                    placeholder="Min"
                                    value={referenceDraft.normalMin}
                                    onChange={(e) => setReferenceDraft(field, { normalMin: e.target.value })}
                                    onBlur={() => {
                                      void persistReferenceDraft(field).catch(() => undefined);
                                    }}
                                    className="h-6 rounded border border-slate-200 px-1.5 text-[10px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                  <input
                                    type="number"
                                    placeholder="Max"
                                    value={referenceDraft.normalMax}
                                    onChange={(e) => setReferenceDraft(field, { normalMax: e.target.value })}
                                    onBlur={() => {
                                      void persistReferenceDraft(field).catch(() => undefined);
                                    }}
                                    className="h-6 rounded border border-slate-200 px-1.5 text-[10px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                  <input
                                    type="text"
                                    placeholder="Unit"
                                    value={referenceDraft.unit}
                                    onChange={(e) => setReferenceDraft(field, { unit: e.target.value })}
                                    onBlur={() => {
                                      void persistReferenceDraft(field).catch(() => undefined);
                                    }}
                                    className="h-6 rounded border border-slate-200 px-1.5 text-[10px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                </div>
                              </>
                            ) : (
                              <span className="text-[10px] text-slate-400">-</span>
                            )}
                          </td>
                        ) : null}
                        {showReferenceAndFlagColumns ? (
                          <td className="border border-slate-200 px-2 py-1.5">
                            {allowReferenceAndFlag && flag ? (
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                  flag === "NORMAL"
                                    ? "bg-green-50 text-green-700"
                                    : "bg-red-50 text-red-700"
                                }`}
                              >
                                {flag}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">-</span>
                            )}
                          </td>
                        ) : null}
                        <td className="border border-slate-200 px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => onRemoveDefaultField(order.id, field.fieldKey)}
                            className="rounded border border-red-200 px-1.5 py-0.5 text-[10px] text-red-600 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {textareaFields.map((field) => {
          const value = draft.values?.[field.fieldKey];
          const label = `${field.label}${field.isRequired ? " *" : ""}${field.unit ? ` (${field.unit})` : ""}`;
          const highlight = highlightKey.has(field.fieldKey);
          const referenceText = formatReferenceDisplay(field, {
            sex: task.visit.patient.sex,
            age: task.visit.patient.age,
          });
          return (
            <div key={field.id}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="block text-[11px] font-medium text-slate-500">{label}</label>
                <div className="flex items-center gap-1.5">
                  {isCommentLikeField(field) ? (
                    <button
                      type="button"
                      onClick={() => {
                        const generated = generateLabScientistComment({
                          task,
                          order,
                          draft,
                          commentFieldKey: field.fieldKey,
                        });
                        onSetFieldValue(order.id, field.fieldKey, generated);
                      }}
                      className="rounded border border-blue-200 px-1.5 py-0.5 text-[10px] text-blue-700 hover:bg-blue-50"
                    >
                      {hasFilledValue(value) ? "Rewrite" : "Auto-write"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onRemoveDefaultField(order.id, field.fieldKey)}
                    className="rounded border border-red-200 px-1.5 py-0.5 text-[10px] text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
              {referenceText ? <p className="mb-1 text-[10px] text-slate-400">{referenceText}</p> : null}
              <textarea
                rows={2}
                value={typeof value === "string" ? value : ""}
                onBlur={() => void onPersist(task).catch(() => undefined)}
                onChange={(e) => onSetFieldValue(order.id, field.fieldKey, e.target.value)}
                className={`w-full rounded border px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 ${highlight ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-3">
        <label className="block text-[11px] font-medium text-slate-500 mb-1">Notes</label>
        <textarea
          rows={1}
          value={draft.notes ?? ""}
          onBlur={() => void onPersist(task).catch(() => undefined)}
          onChange={(e) => onSetNotes(order.id, e.target.value)}
          className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="mt-3 rounded border border-slate-200 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-medium text-slate-500">Extra Fields</p>
          <div className="flex items-center gap-1.5">
            {draft.removedDefaultFieldKeys.length > 0 ? (
              <button
                type="button"
                onClick={() => onRestoreDefaultFields(order.id)}
                className="rounded border border-blue-200 px-2 py-0.5 text-[11px] text-blue-700 hover:bg-blue-50"
              >
                Restore Removed Fields
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onResetCustomFields(order.id)}
              className="rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
            >
              Reset Extra
            </button>
          </div>
        </div>
        {draft.removedDefaultFieldKeys.length > 0 ? (
          <p className="mb-2 text-[11px] text-amber-700">
            {draft.removedDefaultFieldKeys.length} default field(s) removed for this report.
          </p>
        ) : null}
        <div className="space-y-2">
          {customEntries.length === 0 ? (
            <p className="text-[11px] text-slate-400">No extra fields added.</p>
          ) : (
            customEntries.map(([fieldKey, fieldValue]) => (
              <div key={fieldKey} className="grid grid-cols-12 gap-2 items-center">
                <input
                  value={fieldKey}
                  readOnly
                  className="col-span-4 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-500"
                />
                <input
                  value={typeof fieldValue === "string" || typeof fieldValue === "number" ? String(fieldValue) : ""}
                  onBlur={() => void onPersist(task).catch(() => undefined)}
                  onChange={(e) => onSetFieldValue(order.id, fieldKey, e.target.value)}
                  className="col-span-6 rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm(`Remove extra field '${fieldKey}'?`)) return;
                    onRemoveCustomField(order.id, fieldKey);
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
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="Field name (e.g. colony_count)"
            className="col-span-4 rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <input
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            placeholder="Value"
            className="col-span-6 rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => {
              if (!customLabel.trim()) return;
              const nextKey = toCustomFieldKey(customLabel);
              if (!nextKey) {
                setCustomError("Field name is invalid.");
                return;
              }
              void onAddCustomField(order.id, customLabel, customValue)
                .then(() => {
                  setCustomLabel("");
                  setCustomValue("");
                  setCustomError("");
                })
                .catch(() => undefined);
            }}
            className="col-span-2 rounded border border-blue-200 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
          >
            Add
          </button>
        </div>
        {customError ? <p className="mt-1 text-[11px] text-red-600">{customError}</p> : null}
      </div>
    </div>
  );
});

type LabTaskBoardProps = {
  organizationId?: string | null;
};

export function LabTaskBoard({ organizationId }: LabTaskBoardProps) {
  const TASK_CACHE_TTL_MS = 20_000;
  const [tasks, setTasks] = useState<LabTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "ALL" | TaskStatus>("ACTIVE");
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | Priority>("ALL");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [searchInput, setSearchInput] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [signOffByTask, setSignOffByTask] = useState<Record<string, TaskSignOff>>({});
  const [signatureLibrary, setSignatureLibrary] = useState<SignaturePreset[]>([]);
  const [selectedSignatureByTask, setSelectedSignatureByTask] = useState<Record<string, string>>({});
  const [sampleStatusByTask, setSampleStatusByTask] = useState<Record<string, SampleStatus>>({});
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [counts, setCounts] = useState({ pending: 0, inProgress: 0, completed: 0 });
  const [sensitivityAntibioticOptions, setSensitivityAntibioticOptions] = useState<string[]>(() => getDefaultSensitivityAntibiotics(organizationId));
  const [sensitivityValueOptions, setSensitivityValueOptions] = useState<string[]>(SENSITIVITY_VALUE_OPTIONS);
  const [sensitivityInterpretationOptions, setSensitivityInterpretationOptions] = useState<string[]>(SENSITIVITY_INTERPRETATION_OPTIONS);
  const signatureInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [isOnline, setIsOnline] = useState(true);
  const searchParams = useSearchParams();
  const draftsRef = useRef<Record<string, Draft>>({});
  const tasksRef = useRef<LabTask[]>([]);
  const submittingTaskIdsRef = useRef<Set<string>>(new Set());
  const loadTasksSeqRef = useRef(0);
  const taskCacheRef = useRef<
    Map<
      string,
      {
        at: number;
        tasks: LabTask[];
        counts: { pending: number; inProgress: number; completed: number };
      }
    >
  >(new Map());
  const consumedTaskParamRef = useRef<string | null>(null);
  function invalidateTaskCache() {
    taskCacheRef.current.clear();
  }

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(getSensitivityMemoryKey(organizationId));
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        antibiotics?: unknown;
        values?: unknown;
        interpretations?: unknown;
      };
      const normalize = (input: unknown, fallback: string[]) => {
        const list = Array.isArray(input) ? input : [];
        const merged = [...fallback, ...list.filter((item): item is string => typeof item === "string")];
        return Array.from(new Set(merged.map((item) => item.trim()).filter(Boolean)));
      };
      setSensitivityAntibioticOptions(normalize(parsed.antibiotics, getDefaultSensitivityAntibiotics(organizationId)));
      setSensitivityValueOptions(normalize(parsed.values, SENSITIVITY_VALUE_OPTIONS));
      setSensitivityInterpretationOptions(
        normalize(parsed.interpretations, SENSITIVITY_INTERPRETATION_OPTIONS).map((item) => item.toUpperCase())
      );
    } catch {
      // Ignore malformed memory cache.
    }
  }, []);

  const rememberSensitivityCell = useCallback((cell: SensitivityCell) => {
    const addUnique = (base: string[], nextValue: string) => {
      const trimmed = nextValue.trim();
      if (!trimmed) return base;
      if (base.includes(trimmed)) return base;
      return [...base, trimmed];
    };

    let nextAntibiotics = sensitivityAntibioticOptions;
    let nextValues = sensitivityValueOptions;
    let nextInterpretations = sensitivityInterpretationOptions;

    if (cell.antibiotic.trim()) {
      nextAntibiotics = addUnique(nextAntibiotics, cell.antibiotic);
      if (nextAntibiotics !== sensitivityAntibioticOptions) setSensitivityAntibioticOptions(nextAntibiotics);
    }
    if (cell.zone.trim()) {
      nextValues = addUnique(nextValues, cell.zone);
      if (nextValues !== sensitivityValueOptions) setSensitivityValueOptions(nextValues);
    }
    if (cell.interpretation.trim()) {
      const token = cell.interpretation.trim().toUpperCase();
      nextInterpretations = addUnique(nextInterpretations, token);
      if (nextInterpretations !== sensitivityInterpretationOptions) {
        setSensitivityInterpretationOptions(nextInterpretations);
      }
    }

    try {
      window.localStorage.setItem(
        getSensitivityMemoryKey(organizationId),
        JSON.stringify({
          antibiotics: nextAntibiotics,
          values: nextValues,
          interpretations: nextInterpretations,
        })
      );
    } catch {
      // Best-effort local memory only.
    }
  }, [sensitivityAntibioticOptions, sensitivityInterpretationOptions, sensitivityValueOptions]);

  const applyLoadedRows = useCallback((rows: LabTask[]) => {
    const offlineByTask = new Map(listOfflineLabDraftItems().map((item) => [item.taskId, item]));
    setTasks(rows);

    setDrafts((prev) => {
      const next = { ...prev };
      for (const task of rows) {
        const offline = offlineByTask.get(task.id);
        const offlineByOrder = new Map(
          (offline?.results ?? []).map((entry) => [entry.testOrderId, entry])
        );
        for (const order of task.testOrders) {
          if (!next[order.id]) {
            const existing = order.labResults[0];
            const existingValues = ((existing?.resultData as Record<string, unknown>) ?? {});
            const { [SIGNOFF_IMAGE_KEY]: _ignoredSignatureImage, [SIGNOFF_NAME_KEY]: _ignoredSignatureName, ...cleanValues } =
              existingValues;
            const offlineEntry = offlineByOrder.get(order.id);
            const baseValues =
              (offlineEntry?.resultData as Record<string, unknown> | undefined) ?? cleanValues;
            const seededValues: Record<string, unknown> = { ...baseValues };
            const cultureField = order.test.resultFields.find(
              (field) => field.fieldKey.trim().toLowerCase() === "culture_result"
            );
            if (cultureField) {
              const currentCultureValue = seededValues[cultureField.fieldKey];
              if (typeof currentCultureValue === "string" && currentCultureValue.trim() === LEGACY_CULTURE_RESULT_TEXT) {
                seededValues[cultureField.fieldKey] = DEFAULT_CULTURE_RESULT_TEXT;
              } else if (typeof currentCultureValue !== "string" || currentCultureValue.trim() === "") {
                seededValues[cultureField.fieldKey] = DEFAULT_CULTURE_RESULT_TEXT;
              }
            }
            next[order.id] = {
              values: seededValues,
              notes: offlineEntry?.notes ?? existing?.notes ?? "",
              removedDefaultFieldKeys: [],
            };
          }
        }
      }
      draftsRef.current = next;
      return next;
    });
    setSampleStatusByTask((prev) => {
      const next = { ...prev };
      for (const task of rows) {
        if (!next[task.id]) {
          next[task.id] = task.sample?.status ?? "PENDING";
        }
      }
      return next;
    });
    setSignOffByTask((prev) => {
      const next = { ...prev };
      for (const task of rows) {
        if (next[task.id]) continue;
        const offline = offlineByTask.get(task.id);
        const loadSignOffEntries = (resultData: Record<string, unknown> | undefined) => {
          if (!resultData) return [] as SignatureEntry[];
          const entries = extractSignOffEntriesFromMap(resultData);
          return entries.length > 0 ? entries : [];
        };

        let signOffEntries: SignatureEntry[] = [];
        if (offline?.results) {
          for (const entry of offline.results) {
            const entries = loadSignOffEntries(entry.resultData as Record<string, unknown> | undefined);
            if (entries.length > 0) {
              signOffEntries = entries;
              break;
            }
          }
        }

        if (signOffEntries.length === 0) {
          for (const order of task.testOrders) {
            const resultData = order.labResults[0]?.resultData as Record<string, unknown> | undefined;
            const entries = loadSignOffEntries(resultData);
            if (entries.length > 0) {
              signOffEntries = entries;
              break;
            }
          }
        }

        next[task.id] = {
          signatureName: signOffEntries[0]?.signatureName ?? "",
          signatureImage: signOffEntries[0]?.signatureImage ?? "",
          extraSignatures: signOffEntries.slice(1),
        };
      }
      return next;
    });
  }, []);

  const loadTasks = useCallback(async (opts?: { signal?: AbortSignal; force?: boolean; silent?: boolean }) => {
    const cacheKey = `${statusFilter}:${sort}:${searchFilter.trim().toLowerCase()}:${dateFilter}`;
    if (!opts?.force) {
      const cached = taskCacheRef.current.get(cacheKey);
      if (cached && Date.now() - cached.at < TASK_CACHE_TTL_MS) {
        setError("");
        setLoading(false);
        applyLoadedRows(cached.tasks);
        setCounts(cached.counts);
        return;
      }
    }

    const requestId = opts?.silent ? loadTasksSeqRef.current : ++loadTasksSeqRef.current;
    if (!opts?.silent) {
      if (tasksRef.current.length === 0) {
        setLoading(true);
      }
      setError("");
    }
    try {
      const query = new URLSearchParams({ status: statusFilter, sort });
      if (searchFilter.trim()) query.set("search", searchFilter.trim());
      if (dateFilter) query.set("date", dateFilter);
      const controller = new AbortController();
      let timeoutTriggered = false;
      const timeoutId = window.setTimeout(() => {
        timeoutTriggered = true;
        controller.abort();
      }, 20000);
      const relayAbort = () => controller.abort();
      opts?.signal?.addEventListener("abort", relayAbort, { once: true });
      let res: Response;
      try {
        res = await fetch(`/api/lab/tasks?${query.toString()}`, { signal: controller.signal });
      } catch (error) {
        if (timeoutTriggered) {
          throw new Error("REQUEST_TIMEOUT");
        }
        throw error;
      } finally {
        window.clearTimeout(timeoutId);
        opts?.signal?.removeEventListener("abort", relayAbort);
      }
      const json = (await res.json()) as {
        success: boolean;
        error?: string;
        data?: {
          tasks: LabTask[];
          counts?: { pending?: number; inProgress?: number; completed?: number };
        };
      };
      if (requestId !== loadTasksSeqRef.current || opts?.signal?.aborted) return;
      if (!json.success || !json.data) {
        setError(json.error ?? "Failed to load tasks");
        return;
      }
      const rows = json.data.tasks;
      const nextCounts = {
        pending: Number(json.data.counts?.pending ?? 0),
        inProgress: Number(json.data.counts?.inProgress ?? 0),
        completed: Number(json.data.counts?.completed ?? 0),
      };
      taskCacheRef.current.set(cacheKey, { at: Date.now(), tasks: rows, counts: nextCounts });
      applyLoadedRows(rows);
      setCounts(nextCounts);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof Error && error.message === "REQUEST_TIMEOUT") {
        setError("Loading lab dashboard timed out. Please click Refresh.");
        return;
      }
      setError("Network error while loading tasks");
    } finally {
      if (requestId !== loadTasksSeqRef.current || opts?.signal?.aborted) return;
      if (!opts?.silent) {
        setLoading(false);
      }
    }
  }, [TASK_CACHE_TTL_MS, applyLoadedRows, dateFilter, searchFilter, sort, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchFilter(searchInput.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => {
      setLoading(false);
      setError((previous) =>
        previous || "Loading is taking too long. Click Refresh to retry."
      );
    }, 25000);
    return () => window.clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    const controller = new AbortController();
    void loadTasks({ signal: controller.signal });
    return () => controller.abort();
  }, [loadTasks]);

  useEffect(() => {
    if (!isOnline) return;

    const refreshNow = () => {
      if (document.visibilityState !== "visible") return;
      void loadTasks({ force: true, silent: true });
    };

    const poll = window.setInterval(refreshNow, 30_000);
    window.addEventListener("focus", refreshNow);
    document.addEventListener("visibilitychange", refreshNow);

    return () => {
      window.clearInterval(poll);
      window.removeEventListener("focus", refreshNow);
      document.removeEventListener("visibilitychange", refreshNow);
    };
  }, [isOnline, loadTasks]);

  useEffect(() => {
    const syncStatus = () => setIsOnline(navigator.onLine);
    syncStatus();
    window.addEventListener("online", syncStatus);
    window.addEventListener("offline", syncStatus);
    return () => {
      window.removeEventListener("online", syncStatus);
      window.removeEventListener("offline", syncStatus);
    };
  }, []);

  const syncOfflineDrafts = useCallback(async () => {
    if (!navigator.onLine) return;
    const pending = listOfflineLabDraftItems();
    for (const item of pending) {
      try {
        const res = await fetch(`/api/lab/tasks/${item.taskId}/results`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submit: false, results: item.results }),
        });
        const json = (await res.json()) as { success: boolean };
        if (json.success) removeOfflineLabDraft(item.id);
      } catch {
        break;
      }
    }
  }, []);

  useEffect(() => {
    if (!isOnline) return;
    void syncOfflineDrafts();
  }, [isOnline, syncOfflineDrafts]);

  useEffect(() => {
    setSignatureLibrary(loadSignaturePresets("reporting"));
  }, []);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    const taskId = searchParams.get("task");
    if (!taskId) return;
    if (consumedTaskParamRef.current === taskId) return;
    const target = tasks.find((task) => task.id === taskId);
    if (!target) return;

    consumedTaskParamRef.current = taskId;
    setExpandedTask(taskId);
    window.setTimeout(() => {
      document.getElementById(`lab-task-row-${taskId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }, [searchParams, tasks]);

  const filtered = useMemo(() => {
    const base =
      statusFilter === "ACTIVE"
        ? tasks.filter((task) => task.status === "PENDING" || task.status === "IN_PROGRESS")
        : tasks;
    return base.filter((task) => priorityFilter === "ALL" || task.priority === priorityFilter);
  }, [tasks, priorityFilter, statusFilter]);

  // --- Day-grouping helpers (mirrors receptionist patients page) ---
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
    const map = new Map<string, LabTask[]>();
    for (const task of filtered) {
      const key = toDayKey(task.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    }
    // Sort day keys descending (newest day first)
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  function getNewlyAddedOrders(task: LabTask) {
    const taskCreatedAt = new Date(task.createdAt).getTime();
    return task.testOrders.filter((order) => {
      const createdAt = new Date(order.createdAt).getTime();
      return Number.isFinite(createdAt) && createdAt - taskCreatedAt > 60_000;
    });
  }

  function getSampleStatus(task: LabTask): SampleStatus {
    return sampleStatusByTask[task.id] ?? task.sample?.status ?? "PENDING";
  }

  function getActionLabel(task: LabTask) {
    if (task.status === "COMPLETED") return "Submitted";
    if (task.status === "PENDING") return "Start Task";
    const sampleStatus = getSampleStatus(task);
    if (sampleStatus === "PENDING") return "Mark Sample Collected";
    if (sampleStatus === "COLLECTED" || sampleStatus === "RECEIVED") return "Start Processing";
    return "Submit Result";
  }

  function getNextStep(task: LabTask) {
    if (task.status === "PENDING") return "Next: Open case and begin task";
    const sampleStatus = getSampleStatus(task);
    if (sampleStatus === "PENDING") return "Next: Collect sample";
    if (sampleStatus === "COLLECTED" || sampleStatus === "RECEIVED") return "Next: Start processing";
    if (sampleStatus === "PROCESSING") return "Next: Enter test result";
    return "Next: Submit for MD review";
  }

  function isValueFilled(value: unknown) {
    if (typeof value === "boolean") return true;
    if (value === 0) return true;
    return value !== undefined && value !== null && `${value}`.trim() !== "";
  }

  function findTaskForOrder(testOrderId: string) {
    return tasksRef.current.find((task) => task.testOrders.some((order) => order.id === testOrderId));
  }

  async function updateFieldReference(testId: string, fieldId: string, payload: ReferenceUpdatePayload) {
    const min = payload.normalMin ?? null;
    const max = payload.normalMax ?? null;
    if (typeof min === "number" && typeof max === "number" && min > max) {
      setError("Normal min cannot be greater than normal max.");
      return;
    }

    setError("");
    const applyPatch = (rows: LabTask[], patch: ReferenceUpdatePayload) =>
      rows.map((task) => ({
        ...task,
        testOrders: task.testOrders.map((order) => {
          if (order.test.id !== testId) return order;
          return {
            ...order,
            test: {
              ...order.test,
              resultFields: order.test.resultFields.map((field) =>
                field.id === fieldId
                  ? {
                      ...field,
                      unit: patch.unit === undefined ? field.unit : patch.unit,
                      normalMin: patch.normalMin === undefined ? field.normalMin : patch.normalMin,
                      normalMax: patch.normalMax === undefined ? field.normalMax : patch.normalMax,
                      normalText: patch.normalText === undefined ? field.normalText : patch.normalText,
                      referenceNote: patch.referenceNote === undefined ? field.referenceNote : patch.referenceNote,
                    }
                  : field
              ),
            },
          };
        }),
      }));

    setTasks((prev) => applyPatch(prev, payload));
    taskCacheRef.current.clear();

    try {
      const res = await fetch(`/api/tests/${testId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rangeFields: [
            {
              id: fieldId,
              unit: payload.unit ?? null,
              normalMin: payload.normalMin ?? null,
              normalMax: payload.normalMax ?? null,
              normalText: payload.normalText ?? null,
              referenceNote: payload.referenceNote ?? null,
            },
          ],
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        error?: string;
        data?: { resultFields?: Array<ResultField> };
      };
      if (!json.success) {
        throw new Error(json.error ?? "Unable to update reference.");
      }

      const updatedField = json.data?.resultFields?.find((field) => field.id === fieldId);
      if (!updatedField) return;
      setTasks((prev) =>
        prev.map((task) => ({
          ...task,
          testOrders: task.testOrders.map((order) => {
            if (order.test.id !== testId) return order;
            return {
              ...order,
              test: {
                ...order.test,
                resultFields: order.test.resultFields.map((field) =>
                  field.id === fieldId ? { ...field, ...updatedField } : field
                ),
              },
            };
          }),
        }))
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to update reference.");
      await loadTasks({ force: true, silent: true });
    }
  }

  function getSharedSensitivity(task: LabTask, draftsSnapshot: Record<string, Draft> = draftsRef.current) {
    for (const order of task.testOrders) {
      if (!order.test.resultFields.some((field) => isSensitivityFieldKey(field.fieldKey))) continue;
      if ((draftsSnapshot[order.id]?.removedDefaultFieldKeys ?? []).some(isSensitivityFieldKey)) continue;
      const value = draftsSnapshot[order.id]?.values?.sensitivity;
      if (isValueFilled(value)) return value;
    }
    return undefined;
  }

  function isOrderReady(task: LabTask, order: TestOrder) {
    const draft = drafts[order.id] ?? createEmptyDraft();
    if (isEcgOrder(order)) {
      return true;
    }
    const removedDefaults = new Set(draft.removedDefaultFieldKeys ?? []);
    const required = order.test.resultFields.filter((field) => field.isRequired && !removedDefaults.has(field.fieldKey));
    if (required.length === 0) {
      return Object.values(draft.values).some(isValueFilled) || draft.notes.trim().length > 0;
    }
    const sharedSensitivity = getSharedSensitivity(task);
    return required.every((field) => {
      const localValue = draft.values[field.fieldKey];
      if (isValueFilled(localValue)) return true;
      if (isSensitivityFieldKey(field.fieldKey)) return isValueFilled(sharedSensitivity);
      return false;
    });
  }

  function showResultForm(task: LabTask) {
    const sampleStatus = getSampleStatus(task);
    return sampleStatus === "PROCESSING" || sampleStatus === "DONE" || task.status === "COMPLETED";
  }

  function renderSharedSensitivityPanel(task: LabTask) {
    const sensitivityOrders = task.testOrders.filter((order) =>
      order.test.resultFields.some((field) => isSensitivityFieldKey(field.fieldKey))
    );
    if (sensitivityOrders.length <= 1) return null;

    const primaryOrder = sensitivityOrders[0];
    const sharedRaw = getSharedSensitivity(task);
    const cells = parseSensitivityPattern(sharedRaw);
    const testNames = sensitivityOrders.map((order) => order.test.name).join(", ");

    const updateCell = (index: number, next: Partial<SensitivityCell>) => {
      const updated = cells.map((cell, cellIndex) =>
        cellIndex === index ? { ...cell, ...next } : cell
      );
      setDraftFieldValue(primaryOrder.id, "sensitivity", serializeSensitivityPattern(updated));
    };
    const addRow = () => {
      const updated = [...cells, { antibiotic: "", zone: "", interpretation: "" }];
      setDraftFieldValue(primaryOrder.id, "sensitivity", serializeSensitivityPattern(updated));
    };
    const removeRow = (index: number) => {
      if (cells.length <= 1) return;
      const updated = cells.filter((_, cellIndex) => cellIndex !== index);
      setDraftFieldValue(primaryOrder.id, "sensitivity", serializeSensitivityPattern(updated));
    };

    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="block text-[11px] font-medium text-slate-500">
            Sensitivity Pattern (Shared)
          </label>
          <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700">
            Applies to: {testNames}
          </span>
        </div>
        <div className="rounded border border-slate-200 bg-white p-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-50">
                  <th className="border border-slate-200 px-2 py-1 text-left font-semibold text-slate-500">Antibiotic</th>
                  <th className="border border-slate-200 px-2 py-1 text-left font-semibold text-slate-500">Value (+/2+/3+)</th>
                  <th className="border border-slate-200 px-2 py-1 text-left font-semibold text-slate-500">S / R / I</th>
                  <th className="border border-slate-200 px-2 py-1 text-left font-semibold text-slate-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {cells.map((cell, index) => (
                  <tr key={`shared-sens-row-${index}`}>
                    <td className="border border-slate-200 p-1.5">
                      <input
                        list={`sens-antibiotic-options-shared-${task.id}`}
                        value={cell.antibiotic}
                        onBlur={() => {
                          rememberSensitivityCell(cell);
                          void persistDraft(task).catch(() => undefined);
                        }}
                        onChange={(e) => updateCell(index, { antibiotic: e.target.value })}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Antibiotic name"
                      />
                    </td>
                    <td className="border border-slate-200 p-1.5">
                      <input
                        list={`sens-zone-options-shared-${task.id}`}
                        value={cell.zone}
                        onBlur={() => {
                          rememberSensitivityCell(cell);
                          void persistDraft(task).catch(() => undefined);
                        }}
                        onChange={(e) => updateCell(index, { zone: e.target.value })}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="+ / 2+ / 3+ / 20mm"
                      />
                    </td>
                    <td className="border border-slate-200 p-1.5">
                      <input
                        list={`sens-int-options-shared-${task.id}`}
                        value={cell.interpretation}
                        onBlur={() => {
                          rememberSensitivityCell(cell);
                          void persistDraft(task).catch(() => undefined);
                        }}
                        onChange={(e) =>
                          updateCell(index, { interpretation: e.target.value.toUpperCase() })
                        }
                        className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="S / R / I"
                      />
                    </td>
                    <td className="border border-slate-200 p-1.5">
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        disabled={cells.length <= 1}
                        className="rounded border border-red-200 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <datalist id={`sens-antibiotic-options-shared-${task.id}`}>
              {sensitivityAntibioticOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <datalist id={`sens-zone-options-shared-${task.id}`}>
              {sensitivityValueOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
            <datalist id={`sens-int-options-shared-${task.id}`}>
              {sensitivityInterpretationOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={addRow}
              className="rounded border border-blue-200 px-2 py-1 text-[11px] text-blue-700 hover:bg-blue-50"
            >
              Add antibiotic
            </button>
            <p className="text-[10px] text-slate-500">Note: S = Sensitivity, R = Resistance, I = Intermediate</p>
          </div>
        </div>
      </div>
    );
  }

  function renderSharedMcsPanel(task: LabTask) {
    const mcsOrders = task.testOrders.filter((order) => isMcsTestName(order.test.name));
    if (mcsOrders.length === 0) return null;

    const orderLabel = (order: TestOrder) => order.test.name.trim() || order.test.code || "Specimen";
    const findField = (order: TestOrder, key: string) =>
      order.test.resultFields.find((field) => field.fieldKey.trim().toLowerCase() === key);
    const isFieldRemoved = (orderId: string, fieldKey: string) =>
      (drafts[orderId]?.removedDefaultFieldKeys ?? []).some((key) => key.toLowerCase() === fieldKey.toLowerCase());
    const testNames = mcsOrders.map((order) => order.test.name).join(", ");

    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <label className="block text-[11px] font-medium text-slate-500">
            Microscopy Culture And Sensitivity (Shared Entry)
          </label>
          <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700">
            Specimens: {testNames}
          </span>
        </div>

        <div className="overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="w-full min-w-[900px] border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-50">
                <th className="border border-slate-200 px-2 py-1 text-left font-semibold text-slate-500">SPECIMEN</th>
                {mcsOrders.map((order) => (
                  <th key={`mcs-h-${order.id}`} className="border border-slate-200 px-2 py-1 text-left font-semibold text-slate-500">
                    {orderLabel(order)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { key: "wbcPus" as const, label: "WBC/PUS cells/HPF" },
                { key: "epithelial" as const, label: "Epithelial cells" },
                { key: "bacterial" as const, label: "Bacterial cells" },
                { key: "yeast" as const, label: "Yeast cells" },
              ].map((microscopyRow) => (
                <tr key={microscopyRow.key}>
                  <td className="border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700">
                    {microscopyRow.label}
                  </td>
                  {mcsOrders.map((order) => {
                    const microscopyField = findField(order, "microscopy");
                    const disabled = !microscopyField || isFieldRemoved(order.id, microscopyField.fieldKey);
                    const parsed = parseMicroscopyRowInput(
                      microscopyField ? drafts[order.id]?.values?.[microscopyField.fieldKey] : ""
                    );
                    return (
                      <td key={`mcs-micro-${order.id}-${microscopyRow.key}`} className="border border-slate-200 p-1.5">
                        {disabled || !microscopyField ? (
                          <span className="text-[10px] text-slate-400">-</span>
                        ) : (
                          <input
                            value={parsed[microscopyRow.key]}
                            onBlur={() => void persistDraft(task).catch(() => undefined)}
                            onChange={(e) => {
                              const next = { ...parsed, [microscopyRow.key]: e.target.value };
                              setDraftFieldValue(order.id, microscopyField.fieldKey, serializeMicroscopyRowInput(next));
                            }}
                            className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            placeholder="-"
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="bg-slate-50/40">
                <td className="border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700">CULTURE RESULT</td>
                {mcsOrders.map((order) => {
                  const cultureField = findField(order, "culture_result");
                  const disabled = !cultureField || isFieldRemoved(order.id, cultureField.fieldKey);
                  const value = cultureField ? drafts[order.id]?.values?.[cultureField.fieldKey] : "";
                  const hasCultureValueKey = Boolean(
                    cultureField &&
                      Object.prototype.hasOwnProperty.call(drafts[order.id]?.values ?? {}, cultureField.fieldKey)
                  );
                  const effectiveCultureValue =
                    !hasCultureValueKey && cultureField ? DEFAULT_CULTURE_RESULT_TEXT : value;
                  return (
                    <td key={`mcs-culture-${order.id}`} className="border border-slate-200 p-1.5">
                      {disabled || !cultureField ? (
                        <span className="text-[10px] text-slate-400">-</span>
                      ) : (
                        <input
                          type="text"
                          value={typeof effectiveCultureValue === "string" ? effectiveCultureValue : ""}
                          onBlur={() => void persistDraft(task).catch(() => undefined)}
                          onChange={(e) => setDraftFieldValue(order.id, cultureField.fieldKey, e.target.value)}
                          className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="Type culture result"
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700">ISOLATED ORGANISM(S)</td>
                {mcsOrders.map((order) => {
                  const organismField = findField(order, "organisms");
                  const disabled = !organismField || isFieldRemoved(order.id, organismField.fieldKey);
                  const value = organismField ? drafts[order.id]?.values?.[organismField.fieldKey] : "";
                  return (
                    <td key={`mcs-org-${order.id}`} className="border border-slate-200 p-1.5">
                      {disabled || !organismField ? (
                        <span className="text-[10px] text-slate-400">-</span>
                      ) : (
                        <textarea
                          rows={2}
                          value={typeof value === "string" ? value : ""}
                          onBlur={() => void persistDraft(task).catch(() => undefined)}
                          onChange={(e) => setDraftFieldValue(order.id, organismField.fieldKey, e.target.value)}
                          className="w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="Organism(s)"
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function updateDraft(testOrderId: string, updater: (prev: Draft) => Draft) {
    setDrafts((prev) => {
      const current = prev[testOrderId] ?? createEmptyDraft();
      const next = { ...prev, [testOrderId]: updater(current) };
      draftsRef.current = next;
      return next;
    });
  }

  const setDraftFieldValue = useCallback((testOrderId: string, fieldKey: string, value: unknown) => {
    const task = tasksRef.current.find((item) => item.testOrders.some((row) => row.id === testOrderId));
    const shouldSyncSensitivity = Boolean(task && isSensitivityFieldKey(fieldKey));
    const sensitivityOrderIds = shouldSyncSensitivity
      ? task!.testOrders
          .filter((order) => order.test.resultFields.some((field) => isSensitivityFieldKey(field.fieldKey)))
          .map((order) => order.id)
      : [];

    setDrafts((prev) => {
      const next = { ...prev };
      const targetOrderIds = sensitivityOrderIds.length > 0 ? sensitivityOrderIds : [testOrderId];
      for (const orderId of targetOrderIds) {
        const current = next[orderId] ?? createEmptyDraft();
        if ((current.removedDefaultFieldKeys ?? []).includes(fieldKey)) continue;
        next[orderId] = { ...current, values: { ...current.values, [fieldKey]: value } };
      }
      draftsRef.current = next;
      return next;
    });
  }, []);

  const setDraftNotesValue = useCallback((testOrderId: string, value: string) => {
    updateDraft(testOrderId, (prev) => ({ ...prev, notes: value }));
  }, []);

  const addCustomField = useCallback(async (testOrderId: string, label: string, value: string) => {
    const task = findTaskForOrder(testOrderId);
    const order = task?.testOrders.find((row) => row.id === testOrderId);
    if (!order) return;

    const baseKey = toCustomFieldKey(label);
    if (!baseKey) return;

    const defaultFieldKeys = new Set(order.test.resultFields.map((field) => field.fieldKey));
    const existingValues = draftsRef.current[testOrderId]?.values ?? {};
    let nextKey = baseKey;
    let counter = 2;
    while (defaultFieldKeys.has(nextKey) || Object.prototype.hasOwnProperty.call(existingValues, nextKey)) {
      nextKey = `${baseKey}_${counter}`;
      counter += 1;
    }

    updateDraft(testOrderId, (prev) => ({
      ...prev,
      values: { ...prev.values, [nextKey]: value },
    }));

    try {
      const res = await fetch(`/api/tests/${order.test.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addFields: [{ label: label.trim(), fieldKey: nextKey, fieldType: "TEXT", isRequired: false }],
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        error?: string;
        data?: { resultFields?: Array<{ fieldKey: string; label: string }> };
      };
      if (!json.success) return;

      const serverKey =
        json.data?.resultFields?.find((field) => field.fieldKey === nextKey)?.fieldKey ?? nextKey;
      if (serverKey !== nextKey) {
        updateDraft(testOrderId, (prev) => {
          const nextValues = { ...prev.values };
          if (Object.prototype.hasOwnProperty.call(nextValues, nextKey)) {
            nextValues[serverKey] = nextValues[nextKey];
            delete nextValues[nextKey];
          }
          return { ...prev, values: nextValues };
        });
      }

      invalidateTaskCache();
      await loadTasks({ force: true, silent: true });
    } catch {
      // Keep local draft even if template promotion fails.
    }
  }, [loadTasks]);

  const removeCustomField = useCallback((testOrderId: string, fieldKey: string) => {
    updateDraft(testOrderId, (prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev.values, fieldKey)) return prev;
      const nextValues = { ...prev.values };
      delete nextValues[fieldKey];
      return { ...prev, values: nextValues };
    });
  }, []);

  const removeDefaultField = useCallback((testOrderId: string, fieldKey: string) => {
    updateDraft(testOrderId, (prev) => {
      const nextValues = { ...prev.values };
      delete nextValues[fieldKey];
      const removedDefaultFieldKeys = prev.removedDefaultFieldKeys.includes(fieldKey)
        ? prev.removedDefaultFieldKeys
        : [...prev.removedDefaultFieldKeys, fieldKey];
      return { ...prev, values: nextValues, removedDefaultFieldKeys };
    });
  }, []);

  const restoreDefaultFields = useCallback((testOrderId: string) => {
    updateDraft(testOrderId, (prev) => ({ ...prev, removedDefaultFieldKeys: [] }));
  }, []);

  const resetCustomFields = useCallback((testOrderId: string) => {
    const task = findTaskForOrder(testOrderId);
    const order = task?.testOrders.find((row) => row.id === testOrderId);
    if (!order) return;
    const defaultKeys = new Set(order.test.resultFields.map((field) => field.fieldKey));
    updateDraft(testOrderId, (prev) => {
      const nextValues = Object.fromEntries(
        Object.entries(prev.values).filter(([key]) => defaultKeys.has(key))
      );
      return { ...prev, values: nextValues };
    });
  }, []);

  async function uploadSignature(taskId: string, file: File) {
    const readAsDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("SIGNATURE_READ_FAILED"));
      reader.readAsDataURL(file);
    });
    setSignOffByTask((prev) => ({
      ...prev,
      [taskId]: {
        signatureName: prev[taskId]?.signatureName ?? "",
        signatureImage: readAsDataUrl,
        extraSignatures: prev[taskId]?.extraSignatures ?? [],
      },
    }));
  }

  function applySignaturePreset(taskId: string, presetId: string) {
    const preset = signatureLibrary.find((item) => item.id === presetId);
    if (!preset) return;
    setSignOffByTask((prev) => ({
      ...prev,
      [taskId]: {
        signatureName: preset.name,
        signatureImage: preset.image,
        extraSignatures: prev[taskId]?.extraSignatures ?? [],
      },
    }));
    setSelectedSignatureByTask((prev) => ({ ...prev, [taskId]: presetId }));
  }

  function saveCurrentSignatureToLibrary(taskId: string) {
    const signOff = signOffByTask[taskId];
    if (!signOff?.signatureName?.trim() || !signOff?.signatureImage?.trim()) return;
    const res = upsertSignaturePreset(signatureLibrary, {
      name: signOff.signatureName,
      image: signOff.signatureImage,
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

  function addExtraSignature(taskId: string) {
    setSignOffByTask((prev) => {
      const current = prev[taskId] ?? { signatureName: "", signatureImage: "", extraSignatures: [] };
      return {
        ...prev,
        [taskId]: {
          ...current,
          extraSignatures: [...(current.extraSignatures ?? []), { signatureName: "", signatureImage: "" }],
        },
      };
    });
  }

  function updateExtraSignature(taskId: string, index: number, patch: Partial<SignatureEntry>) {
    setSignOffByTask((prev) => {
      const current = prev[taskId] ?? { signatureName: "", signatureImage: "", extraSignatures: [] };
      const nextExtras = (current.extraSignatures ?? []).map((entry, i) => (i === index ? { ...entry, ...patch } : entry));
      return {
        ...prev,
        [taskId]: { ...current, extraSignatures: nextExtras },
      };
    });
  }

  function removeExtraSignature(taskId: string, index: number) {
    setSignOffByTask((prev) => {
      const current = prev[taskId] ?? { signatureName: "", signatureImage: "", extraSignatures: [] };
      return {
        ...prev,
        [taskId]: {
          ...current,
          extraSignatures: (current.extraSignatures ?? []).filter((_, i) => i !== index),
        },
      };
    });
  }

  async function uploadExtraSignature(taskId: string, index: number, file: File) {
    const readAsDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("SIGNATURE_READ_FAILED"));
      reader.readAsDataURL(file);
    });
    updateExtraSignature(taskId, index, { signatureImage: readAsDataUrl });
  }

  function collectTaskDraftResults(task: LabTask, draftsSnapshot: Record<string, Draft> = draftsRef.current) {
    const sharedSensitivity = getSharedSensitivity(task, draftsSnapshot);
    const signOff = signOffByTask[task.id];
    const signOffEntries = signOff
      ? [
          { signatureName: signOff.signatureName, signatureImage: signOff.signatureImage },
          ...(signOff.extraSignatures ?? []),
        ].filter((entry) => entry.signatureName.trim() || entry.signatureImage.trim())
      : [];
    return task.testOrders.map((order) => ({
      testOrderId: order.id,
      resultData: (() => {
        const draft = draftsSnapshot[order.id] ?? createEmptyDraft();
        const removedDefaults = new Set(draft.removedDefaultFieldKeys ?? []);
        const cleanedValues = Object.fromEntries(
          Object.entries(draft.values ?? {}).filter(([key]) => !removedDefaults.has(key))
        );
        const canApplySharedSensitivity =
          order.test.resultFields.some((field) => isSensitivityFieldKey(field.fieldKey)) &&
          !removedDefaults.has("sensitivity") &&
          isValueFilled(sharedSensitivity) &&
          !isValueFilled(cleanedValues.sensitivity);
        const withSharedSensitivity = {
          ...cleanedValues,
          ...(canApplySharedSensitivity ? { sensitivity: sharedSensitivity } : {}),
        };
        const valuesForSubmit = isEcgOrder(order)
          ? Object.fromEntries(
              Object.entries(withSharedSensitivity).filter(([, value]) => isValueFilled(value))
            )
          : withSharedSensitivity;
        return {
          ...valuesForSubmit,
          ...(signOffEntries.length > 0
            ? {
                [SIGNOFF_ENTRIES_KEY]: JSON.stringify(signOffEntries),
                [SIGNOFF_IMAGE_KEY]: signOffEntries[0].signatureImage,
                [SIGNOFF_NAME_KEY]: signOffEntries[0].signatureName,
              }
            : {}),
        };
      })(),
      notes: draftsSnapshot[order.id]?.notes ?? "",
    }));
  }

  async function persistDraft(task: LabTask, draftsSnapshot: Record<string, Draft> = draftsRef.current) {
    if (submittingTaskIdsRef.current.has(task.id)) return;
    const results = collectTaskDraftResults(task, draftsSnapshot);
    upsertOfflineLabDraft({ taskId: task.id, results });
    if (!navigator.onLine) return;

    const res = await fetch(`/api/lab/tasks/${task.id}/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submit: false, results }),
    });
    const json = (await res.json()) as { success: boolean; error?: string };
    if (!json.success) {
      throw new Error(json.error ?? "Auto-save failed");
    }
    const pending = listOfflineLabDraftItems().find((item) => item.taskId === task.id);
    if (pending) removeOfflineLabDraft(pending.id);
  }

  useEffect(() => {
    if (!expandedTask) return;
    const taskId = expandedTask;

    const timer = window.setInterval(() => {
      const task = tasksRef.current.find((row) => row.id === taskId);
      if (!task || !showResultForm(task) || task.status === "COMPLETED") return;
      void persistDraft(task, draftsRef.current).catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [expandedTask]);

  useEffect(() => {
    if (!expandedTask) return;
    const task = tasksRef.current.find((row) => row.id === expandedTask);
    if (!task || task.status === "COMPLETED") return;
    const timer = window.setTimeout(() => {
      void persistDraft(task, draftsRef.current).catch(() => undefined);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [collectTaskDraftResults, drafts, expandedTask, signOffByTask]);

  async function onWorkflowClick(task: LabTask) {
    if (task.status === "COMPLETED") return;
    submittingTaskIdsRef.current.add(task.id);
    setSavingTaskId(task.id);
    setError("");
    invalidateTaskCache();
    try {
      if (task.status === "PENDING") {
        setTasks((prev) => prev.map((row) => (row.id === task.id ? { ...row, status: "IN_PROGRESS" } : row)));
        const res = await fetch(`/api/lab/tasks/${task.id}/start`, { method: "PATCH" });
        const json = (await res.json()) as { success: boolean; error?: string };
        if (!json.success) {
          setError(json.error ?? "Unable to start");
          await loadTasks();
        }
        return;
      }

      const sampleStatus = getSampleStatus(task);
      if (sampleStatus === "PENDING") {
        setSampleStatusByTask((prev) => ({ ...prev, [task.id]: "COLLECTED" }));
        const res = await fetch(`/api/lab/tasks/${task.id}/sample`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "COLLECTED" }),
        });
        const json = (await res.json()) as { success: boolean; error?: string };
        if (!json.success) {
          setError(json.error ?? "Error updating sample");
          await loadTasks();
        }
        return;
      }

      if (sampleStatus === "COLLECTED" || sampleStatus === "RECEIVED") {
        setSampleStatusByTask((prev) => ({ ...prev, [task.id]: "PROCESSING" }));
        const res = await fetch(`/api/lab/tasks/${task.id}/sample`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "PROCESSING" }),
        });
        const json = (await res.json()) as { success: boolean; error?: string };
        if (!json.success) {
          setError(json.error ?? "Error updating sample");
          await loadTasks();
        }
        return;
      }

      const missingOrders = task.testOrders.filter((order) => !isOrderReady(task, order));
      if (missingOrders.length > 0) {
        setError(
          `Cannot submit yet. Complete required field(s) for: ${missingOrders
            .map((order) => order.test.name)
            .join(", ")}`
        );
        return;
      }

      if (!navigator.onLine) {
        await persistDraft(task);
        setError("You are offline. Draft is saved locally and will sync automatically.");
        return;
      }

      const res = await fetch(`/api/lab/tasks/${task.id}/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submit: true, results: collectTaskDraftResults(task) }),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) {
        setError(json.error ?? "Submit failed");
        await loadTasks();
        return;
      }
      await loadTasks({ force: true, silent: true });
      const pending = listOfflineLabDraftItems().find((item) => item.taskId === task.id);
      if (pending) removeOfflineLabDraft(pending.id);
      setExpandedTask(null);
    } catch (error) {
      const reason = error instanceof Error && error.message.trim().length > 0 ? error.message : "";
      setError(reason ? `Action failed: ${reason}` : "Action failed. Please retry.");
      await loadTasks();
    } finally {
      submittingTaskIdsRef.current.delete(task.id);
      setSavingTaskId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-px rounded-lg border border-slate-200 bg-slate-200 overflow-hidden">
        {[
          { label: "Pending", value: counts.pending },
          { label: "In Progress", value: counts.inProgress },
          { label: "Completed", value: counts.completed },
        ].map((item) => (
          <div key={item.label} className="bg-white px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">{item.label}</p>
            <p className="text-xl font-bold text-slate-800 mt-0.5">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="w-full sm:w-auto">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
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
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "ACTIVE" | "ALL" | TaskStatus)}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Active queue</SelectItem>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="IN_PROGRESS">In progress</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={(value) => setPriorityFilter(value as "ALL" | Priority)}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All priorities</SelectItem>
            <SelectItem value="EMERGENCY">Emergency</SelectItem>
            <SelectItem value="URGENT">Urgent</SelectItem>
            <SelectItem value="ROUTINE">Routine</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(value) => setSort(value as "newest" | "oldest")}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Sort" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
          </SelectContent>
        </Select>
        <button onClick={() => void loadTasks({ force: true })} className="ml-auto rounded border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 transition-colors">
          Refresh
        </button>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div> : null}

      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white">
            <p className="px-4 py-8 text-center text-xs text-slate-400">No assigned tests. You're all caught up.</p>
          </div>
        ) : (
          groupedByDay.map(([dayKey, dayTasks]) => (
            <section key={dayKey} id={`lab-day-${dayKey}`} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              {/* Day header */}
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-700">{formatDayLabel(dayKey)}</span>
                  {dayKey === todayDayKey() ? <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">Today</span> : null}
                  <span className="text-slate-400">{dayTasks.length} task{dayTasks.length !== 1 ? "s" : ""}</span>
                  <span className="text-slate-300">Ã‚Â·</span>
                  <span className="text-slate-400">{dayTasks.filter((t) => t.status === "PENDING").length} pending</span>
                  <span className="text-slate-400">{dayTasks.filter((t) => t.status === "IN_PROGRESS").length} in progress</span>
                  <span className="text-slate-400">{dayTasks.filter((t) => t.status === "COMPLETED").length} completed</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">Patient</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">Tests</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">Priority</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">Status</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">Sample</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">Updated</th>
                    <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
              {dayTasks.map((task) => {
                const highlightFields = getHighlightFields(task);
                const shouldUseSharedSensitivityPanel =
                  task.testOrders.filter((order) =>
                    order.test.resultFields.some((field) => isSensitivityFieldKey(field.fieldKey))
                  ).length > 1;
                const shouldUseSharedMcsPanel = task.testOrders.some((order) => isMcsTestName(order.test.name));
                return (
                  <Fragment key={task.id}>
                    <tr id={`lab-task-row-${task.id}`} key={task.id} className={`hover:bg-slate-50 transition-colors ${expandedTask === task.id ? "bg-blue-50/30" : ""}`}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-800">{task.visit.patient.fullName}</p>
                        <p className="font-mono text-slate-400">
                          {task.visit.patient.patientId} - {formatPatientAge({ age: task.visit.patient.age, dateOfBirth: task.visit.patient.dateOfBirth })} - {task.visit.patient.sex}
                        </p>
                        {getNewlyAddedOrders(task).length > 0 ? (
                          <p className="text-[11px] text-emerald-700">
                            New test(s) added: {getNewlyAddedOrders(task).map((order) => order.test.name).join(", ")}
                          </p>
                        ) : null}
                        <p className="text-[11px] text-slate-400">Last updated {getMinutesAgoLabel(task.updatedAt)} by {task.staff?.fullName ?? "assigned staff"}</p>
                        <p className="text-[11px] text-blue-600">{getNextStep(task)}</p>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500 min-w-[220px]">{task.testOrders.map((order) => order.test.name).join(", ")}</td>
                      <td className="px-4 py-2.5"><span className={`rounded px-1.5 py-0.5 font-medium ${priorityStyle[task.priority]}`}>{task.priority}</span></td>
                      <td className="px-4 py-2.5"><span className={`rounded px-1.5 py-0.5 font-medium ${statusStyle[task.status]}`}>{task.status.replace("_", " ")}</span></td>
                      <td className="px-4 py-2.5 text-slate-500">{getSampleStatus(task)}</td>
                      <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">{formatDateTime(task.updatedAt)}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="flex gap-1.5">
                          {task.status !== "COMPLETED" ? (
                            <button
                              disabled={savingTaskId === task.id}
                              onClick={() => void onWorkflowClick(task)}
                              className="rounded bg-blue-600 px-2.5 py-1 font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                              {savingTaskId === task.id ? "Working..." : getActionLabel(task)}
                            </button>
                          ) : null}
                          {showResultForm(task) ? (
                            <button
                              onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                              className="rounded border border-slate-200 px-2.5 py-1 text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                              {expandedTask === task.id ? "Close" : "Enter Results"}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>

                    {expandedTask === task.id && showResultForm(task) ? (
                      <tr key={`${task.id}-form`}>
                        <td colSpan={7} className="px-4 py-4 bg-slate-50 border-b border-slate-200">
                          <div className="space-y-4">
                            {task.review?.rejectionReason ? (
                              <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                Edit requested by MD: {task.review.rejectionReason}
                              </div>
                            ) : null}
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
                                  value={signOffByTask[task.id]?.signatureName ?? ""}
                                  onChange={(e) =>
                                    setSignOffByTask((prev) => ({
                                      ...prev,
                                      [task.id]: {
                                        signatureImage: prev[task.id]?.signatureImage ?? "",
                                        signatureName: e.target.value,
                                        extraSignatures: prev[task.id]?.extraSignatures ?? [],
                                      },
                                    }))
                                  }
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
                                  {signOffByTask[task.id]?.signatureImage ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSignOffByTask((prev) => ({
                                          ...prev,
                                          [task.id]: {
                                            signatureName: prev[task.id]?.signatureName ?? "",
                                            signatureImage: "",
                                            extraSignatures: prev[task.id]?.extraSignatures ?? [],
                                          },
                                        }))
                                      }
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
                                  <button
                                    type="button"
                                    onClick={() => addExtraSignature(task.id)}
                                    className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                    Add Signature
                                  </button>
                                </div>
                                {signOffByTask[task.id]?.signatureImage ? (
                                  <img
                                    src={signOffByTask[task.id].signatureImage}
                                    alt="Signature preview"
                                    className="h-16 w-auto max-w-[220px] object-contain border border-slate-200 rounded bg-white p-1"
                                  />
                                ) : (
                                  <p className="text-[11px] text-slate-400">No signature image selected.</p>
                                )}
                                <div className="space-y-2">
                                  {(signOffByTask[task.id]?.extraSignatures ?? []).map((entry, idx) => (
                                    <div key={idx} className="rounded border border-slate-100 bg-slate-50 p-2 space-y-2">
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="text-[11px] font-medium text-slate-500">Additional Signature {idx + 1}</p>
                                        <button
                                          type="button"
                                          onClick={() => removeExtraSignature(task.id, idx)}
                                          className="rounded border border-red-200 px-2 py-0.5 text-[11px] text-red-600 hover:bg-red-50"
                                        >
                                          Remove
                                        </button>
                                      </div>
                                      <input
                                        value={entry.signatureName}
                                        onChange={(e) => updateExtraSignature(task.id, idx, { signatureName: e.target.value })}
                                        placeholder="Signer name"
                                        className="h-7 w-full rounded border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      />
                                      <div className="flex items-center gap-2">
                                        <input
                                          id={`lab-extra-signature-${task.id}-${idx}`}
                                          type="file"
                                          accept="image/*"
                                          className="hidden"
                                          onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            await uploadExtraSignature(task.id, idx, file);
                                            e.target.value = "";
                                          }}
                                        />
                                        <label
                                          htmlFor={`lab-extra-signature-${task.id}-${idx}`}
                                          className="cursor-pointer rounded border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
                                        >
                                          Upload Signature
                                        </label>
                                        {entry.signatureImage ? (
                                          <img
                                            src={entry.signatureImage}
                                            alt={"Additional signature " + (idx + 1) + " preview"}
                                            className="h-12 w-auto max-w-[180px] object-contain border border-slate-200 rounded bg-white p-1"
                                          />
                                        ) : null}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                            {shouldUseSharedMcsPanel ? renderSharedMcsPanel(task) : null}
                            {shouldUseSharedSensitivityPanel ? renderSharedSensitivityPanel(task) : null}
                            {task.testOrders.map((order) => (
                              <OrderResultCard
                                key={order.id}
                                task={task}
                                order={order}
                                draft={drafts[order.id] ?? createEmptyDraft()}
                                highlightFields={highlightFields}
                                isReady={isOrderReady(task, order)}
                                suppressSensitivityField={shouldUseSharedSensitivityPanel}
                                hiddenDefaultFieldKeys={
                                  shouldUseSharedMcsPanel && isMcsTestName(order.test.name)
                                    ? ["microscopy", "culture_result", "organisms"]
                                    : []
                                }
                                onPersist={persistDraft}
                                onSetFieldValue={setDraftFieldValue}
                                onSetNotes={setDraftNotesValue}
                                onAddCustomField={addCustomField}
                                onRemoveCustomField={removeCustomField}
                                onResetCustomFields={resetCustomFields}
                                onRemoveDefaultField={removeDefaultField}
                                onRestoreDefaultFields={restoreDefaultFields}
                                onUpdateFieldReference={updateFieldReference}
                                sensitivityAntibioticOptions={sensitivityAntibioticOptions}
                                sensitivityValueOptions={sensitivityValueOptions}
                                sensitivityInterpretationOptions={sensitivityInterpretationOptions}
                                onRememberSensitivityCell={rememberSensitivityCell}
                              />
                            ))}

                            {task.status !== "COMPLETED" ? (
                              <button
                                disabled={savingTaskId === task.id}
                                onClick={() => void onWorkflowClick(task)}
                                className="rounded bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                              >
                                {savingTaskId === task.id ? "Submitting..." : "Submit Result"}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
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







