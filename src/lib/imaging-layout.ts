// src/lib/imaging-layout.ts
//
// The positioned imaging layout rides along in RadiologyReport.extraFields,
// which is validated by validateCustomFieldsMap(). That validator lowercases
// every key and rejects anything outside [a-z0-9_], so the key has to be
// lower snake case or it silently arrives under a different name - which both
// hides the layout from the renderer and prints the raw JSON in the report as
// if it were a custom field.
export const IMAGING_LAYOUT_KEY = "imaging_layout";

// Keys written before the constant above existed. Still read, never written.
const LEGACY_IMAGING_LAYOUT_KEYS = ["imagingLayout", "imaginglayout"];

export function isImagingLayoutKey(key: string) {
  return key === IMAGING_LAYOUT_KEY || LEGACY_IMAGING_LAYOUT_KEYS.includes(key);
}

/** Reads the layout from an extraFields map, tolerating the legacy key names. */
export function readImagingLayout(extraFields: unknown): unknown[] | null {
  if (!extraFields || typeof extraFields !== "object" || Array.isArray(extraFields)) return null;
  const source = extraFields as Record<string, unknown>;

  for (const key of [IMAGING_LAYOUT_KEY, ...LEGACY_IMAGING_LAYOUT_KEYS]) {
    const raw = source[key];
    if (raw === undefined || raw === null || raw === "") continue;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // fall through to the next candidate key
      }
    }
  }
  return null;
}

/** Drops every layout key, so a write can replace them all with the current one. */
export function withoutImagingLayout(extraFields: Record<string, string> | null | undefined) {
  const source = extraFields ?? {};
  return Object.fromEntries(Object.entries(source).filter(([key]) => !isImagingLayoutKey(key)));
}
