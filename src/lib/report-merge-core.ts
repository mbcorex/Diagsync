/**
 * Folding newly approved tests into a report that already exists for the same visit and
 * department. A visit can gain tests after its first report was drafted or even released, and
 * the released report must then carry the old tests and the new one together.
 */

export function reportTestKey(entry: unknown) {
  if (!entry || typeof entry !== "object") return "";
  const row = entry as Record<string, unknown>;
  const testOrderId = String(row.testOrderId ?? "").trim();
  if (testOrderId) return `id:${testOrderId}`;
  return `name:${String(row.name ?? "").trim().toLowerCase()}`;
}

/**
 * Keeps every test already on the report — including edits the MD made to it — and folds the
 * freshly approved tests in, replacing an entry only when it is the same test order.
 */
export function mergeReportTests(existing: unknown[], incoming: unknown[]) {
  const incomingByKey = new Map<string, unknown>();
  for (const entry of incoming) {
    const key = reportTestKey(entry);
    if (key) incomingByKey.set(key, entry);
  }

  const consumed = new Set<string>();
  const merged = existing.map((entry) => {
    const key = reportTestKey(entry);
    const replacement = key ? incomingByKey.get(key) : undefined;
    if (!replacement) return entry;
    consumed.add(key);
    return replacement;
  });

  for (const entry of incoming) {
    const key = reportTestKey(entry);
    if (key && consumed.has(key)) continue;
    if (key) consumed.add(key);
    merged.push(entry);
  }

  return merged;
}

export function mergeImagingFiles(existing: unknown[], incoming: unknown[]) {
  const seen = new Set<string>();
  const merged: unknown[] = [];
  for (const entry of [...existing, ...incoming]) {
    if (!entry || typeof entry !== "object") continue;
    const url = String((entry as Record<string, unknown>).url ?? "").trim();
    const key = url || JSON.stringify(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }
  return merged;
}

export function mergeReportContent(existingContent: unknown, incomingContent: Record<string, any>) {
  if (!existingContent || typeof existingContent !== "object" || Array.isArray(existingContent)) {
    return incomingContent;
  }
  const existing = existingContent as Record<string, any>;
  const existingTests = Array.isArray(existing.tests) ? existing.tests : [];
  const incomingTests = Array.isArray(incomingContent.tests) ? incomingContent.tests : [];
  const existingImaging = Array.isArray(existing.imagingFiles) ? existing.imagingFiles : [];
  const incomingImaging = Array.isArray(incomingContent.imagingFiles) ? incomingContent.imagingFiles : [];
  const mergedImaging = mergeImagingFiles(existingImaging, incomingImaging);
  const incomingSignOff = Array.isArray(incomingContent.signOffEntries) ? incomingContent.signOffEntries : [];
  const existingSignOff = Array.isArray(existing.signOffEntries) ? existing.signOffEntries : [];

  return {
    ...existing,
    ...incomingContent,
    tests: mergeReportTests(existingTests, incomingTests),
    ...(mergedImaging.length > 0 ? { imagingFiles: mergedImaging } : {}),
    ...(incomingSignOff.length > 0
      ? { signOffEntries: incomingSignOff }
      : existingSignOff.length > 0
      ? { signOffEntries: existingSignOff }
      : {}),
  };
}
