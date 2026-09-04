/** How far back a receptionist may backdate a visit that was handled but not entered on the day. */
export const MAX_BACKDATE_DAYS = 90;

export type BackdateResult = { ok: true; date: Date } | { ok: false; error: string };

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

export function toDayKey(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Turns a `YYYY-MM-DD` day key from the receptionist into the timestamp the visit, its patient
 * record and its payments are stamped with. A past day is stamped at midday so the record lands
 * squarely inside that local day regardless of how ranges are rounded; today resolves to now.
 */
export function resolveBackdatedVisitDate(dayKey: string, now: Date = new Date()): BackdateResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    return { ok: false, error: "Visit date must be in YYYY-MM-DD format" };
  }

  const [year, month, day] = dayKey.split("-").map((part) => Number(part));
  const candidate = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (Number.isNaN(candidate.getTime())) {
    return { ok: false, error: "Visit date is not a valid date" };
  }
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return { ok: false, error: "Visit date is not a valid date" };
  }

  const todayKey = toDayKey(now);
  if (dayKey > todayKey) {
    return { ok: false, error: "Visit date cannot be in the future" };
  }
  if (dayKey === todayKey) {
    return { ok: true, date: now };
  }

  const earliest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - MAX_BACKDATE_DAYS, 0, 0, 0, 0);
  if (candidate < earliest) {
    return { ok: false, error: `Visit date cannot be more than ${MAX_BACKDATE_DAYS} days in the past` };
  }

  return { ok: true, date: candidate };
}
