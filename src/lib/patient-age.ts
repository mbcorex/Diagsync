type AgeDisplayStyle = "compact" | "long" | "yrs";

type PatientAgeInput = {
  age?: number | null;
  dateOfBirth?: string | Date | null;
};

function parseDateOnlyInput(value: string | Date | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const utc = new Date(Date.UTC(year, month, day));
    if (
      utc.getUTCFullYear() === year &&
      utc.getUTCMonth() === month &&
      utc.getUTCDate() === day
    ) {
      return utc;
    }
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function daysInUtcMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function addMonthsUtcClamped(base: Date, months: number) {
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const day = base.getUTCDate();

  const targetMonthIndex = month + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const targetDay = Math.min(day, daysInUtcMonth(targetYear, normalizedMonth));
  return new Date(Date.UTC(targetYear, normalizedMonth, targetDay));
}

function diffWholeDaysUtc(start: Date, end: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / msPerDay));
}

function computeAgeParts(dateOfBirth: Date, now: Date) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (dateOfBirth.getTime() > end.getTime()) return null;

  let totalMonths =
    (end.getUTCFullYear() - dateOfBirth.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - dateOfBirth.getUTCMonth());
  if (end.getUTCDate() < dateOfBirth.getUTCDate()) totalMonths -= 1;
  if (totalMonths < 0) totalMonths = 0;

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const anchor = addMonthsUtcClamped(dateOfBirth, totalMonths);
  const days = diffWholeDaysUtc(anchor, end);

  return { years, months, days };
}

function compactAgeLabel(parts: { years: number; months: number; days: number }) {
  if (parts.years >= 1) return `${parts.years}y`;
  if (parts.months >= 1) return `${parts.months}m`;
  return `${parts.days}d`;
}

function longAgeLabel(parts: { years: number; months: number; days: number }) {
  if (parts.years >= 1) return `${parts.years} year${parts.years === 1 ? "" : "s"}`;
  if (parts.months >= 1) return `${parts.months} month${parts.months === 1 ? "" : "s"}`;
  return `${parts.days} day${parts.days === 1 ? "" : "s"}`;
}

function yrsAgeLabel(parts: { years: number; months: number; days: number }) {
  if (parts.years >= 1) return `${parts.years} YRS`;
  if (parts.months >= 1) return `${parts.months} MTHS`;
  return `${parts.days} DAYS`;
}

export function formatPatientAge(input: PatientAgeInput, style: AgeDisplayStyle = "compact") {
  const dob = parseDateOnlyInput(input.dateOfBirth);
  if (dob) {
    const parts = computeAgeParts(dob, new Date());
    if (parts) {
      if (style === "long") return longAgeLabel(parts);
    if (style === "yrs") return yrsAgeLabel(parts);
    return compactAgeLabel(parts);
    }
  }

  const years = Number(input.age);
  if (Number.isFinite(years) && years > 0) return `${Math.trunc(years)}y`;
  return "-";
}

export function formatPatientAgeSex(
  input: PatientAgeInput & { sex?: string | null },
  opts?: { ageStyle?: AgeDisplayStyle; separator?: string }
) {
  const ageText = formatPatientAge(input, opts?.ageStyle ?? "compact");
  const sexText = String(input.sex ?? "-").trim() || "-";
  return `${ageText}${opts?.separator ?? " / "}${sexText}`;
}

export function estimateDateOfBirthFromEnteredAge(
  value: string,
  unit: "YEARS" | "MONTHS" | "DAYS"
) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;

  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (unit === "YEARS") {
    base.setUTCFullYear(base.getUTCFullYear() - Math.trunc(amount));
  } else if (unit === "MONTHS") {
    const estimated = addMonthsUtcClamped(base, -Math.trunc(amount));
    base.setTime(estimated.getTime());
  } else {
    base.setUTCDate(base.getUTCDate() - Math.trunc(amount));
  }

  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, "0");
  const d = String(base.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}


