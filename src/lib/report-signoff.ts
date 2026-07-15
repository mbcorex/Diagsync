export const SIGNOFF_IMAGE_KEY = "__signature_image";
export const SIGNOFF_NAME_KEY = "__signature_name";
export const SIGNOFF_ENTRIES_KEY = "__signature_entries";

export type ReportSignOff = {
  signatureImage: string;
  signatureName: string;
};

export type ReportSignOffEntries = ReportSignOff[];

function asText(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

export function isDataImageUrl(value: string) {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value);
}

function normalizeSignOffEntry(value: unknown): ReportSignOff | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const map = value as Record<string, unknown>;
  const signatureImage = asText(map.signatureImage ?? map[SIGNOFF_IMAGE_KEY]);
  const signatureName = asText(map.signatureName ?? map[SIGNOFF_NAME_KEY]);
  if (!signatureImage || !signatureName) return null;
  if (!isDataImageUrl(signatureImage)) return null;
  return { signatureImage, signatureName };
}

function parseSignOffEntries(raw: unknown): ReportSignOffEntries {
  if (Array.isArray(raw)) {
    return raw.map((item) => normalizeSignOffEntry(item)).filter((item): item is ReportSignOff => Boolean(item));
  }
  if (typeof raw === "string") {
    try {
      return parseSignOffEntries(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}

export function extractSignOffEntriesFromMap(input: unknown): ReportSignOffEntries {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  const map = input as Record<string, unknown>;
  const parsed = parseSignOffEntries(map[SIGNOFF_ENTRIES_KEY]);
  if (parsed.length > 0) return parsed;
  const single = extractSignOffFromMap(map);
  return single ? [single] : [];
}

export function extractSignOffFromMap(input: unknown): ReportSignOff | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const map = input as Record<string, unknown>;
  const signatureImage = asText(map[SIGNOFF_IMAGE_KEY]);
  const signatureName = asText(map[SIGNOFF_NAME_KEY]);
  if (!signatureImage || !signatureName) return null;
  if (!isDataImageUrl(signatureImage)) return null;
  return { signatureImage, signatureName };
}

export function stripSignOffKeys(input: Record<string, unknown>) {
  const next = { ...input };
  delete next[SIGNOFF_IMAGE_KEY];
  delete next[SIGNOFF_NAME_KEY];
  delete next[SIGNOFF_ENTRIES_KEY];
  return next;
}

