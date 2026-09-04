export const PAYMENT_METHOD_KEYS = ["CASH", "TRANSFER", "POS", "HMO", "OTHER"] as const;
export type PaymentMethodKey = (typeof PAYMENT_METHOD_KEYS)[number];

/** Written to `Visit.paymentMethod` when a visit was settled with more than one method. */
export const MIXED_PAYMENT_METHOD = "MIXED";

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  TRANSFER: "Transfer",
  POS: "POS / Card",
  HMO: "HMO / Insurance",
  OTHER: "Other",
  MIXED: "Mixed",
  UNKNOWN: "Unknown",
};

/** Keys that can appear in a per-method collection breakdown. */
export const PAYMENT_METHOD_BREAKDOWN_KEYS = [...PAYMENT_METHOD_KEYS, "UNKNOWN"] as const;

export function isPaymentMethodKey(value: unknown): value is PaymentMethodKey {
  return PAYMENT_METHOD_KEYS.includes(`${value ?? ""}`.trim().toUpperCase() as PaymentMethodKey);
}

/** Normalizes a stored method to a breakdown bucket. `MIXED` is a visit-level summary, not a bucket. */
export function normalizePaymentMethodKey(value?: string | null) {
  const key = `${value ?? ""}`.trim().toUpperCase();
  return isPaymentMethodKey(key) ? key : "UNKNOWN";
}

export function paymentMethodLabel(value?: string | null) {
  const key = `${value ?? ""}`.trim().toUpperCase();
  return PAYMENT_METHOD_LABELS[key] ?? PAYMENT_METHOD_LABELS.UNKNOWN;
}

/**
 * Collapses every method used on a visit into the single value stored on `Visit.paymentMethod`:
 * the one method when they all agree, `MIXED` when they do not, `null` when nothing was recorded.
 */
export function summarizeVisitPaymentMethod(methods: Array<string | null | undefined>) {
  const distinct = new Set(
    methods
      .map((method) => `${method ?? ""}`.trim().toUpperCase())
      .filter((method) => method.length > 0 && method !== MIXED_PAYMENT_METHOD)
  );
  if (distinct.size === 0) return null;
  if (distinct.size === 1) return Array.from(distinct)[0];
  return MIXED_PAYMENT_METHOD;
}

export type PaymentLedgerEntry = {
  amount: number;
  paymentMethod?: string | null;
  paymentType?: string | null;
};

/**
 * Splits collected money per method. Refunds and adjustments subtract from the method they
 * were recorded against — both entry types are only ever written for a reduction in what the
 * patient has paid. Visits with no ledger rows (registered before payments were itemised)
 * fall back to attributing `amountPaid` to the visit-level method.
 */
export function collectedByPaymentMethod(
  entries: PaymentLedgerEntry[],
  fallback?: { amountPaid: number; paymentMethod?: string | null }
) {
  const totals: Record<string, number> = {};
  for (const key of PAYMENT_METHOD_BREAKDOWN_KEYS) totals[key] = 0;

  if (entries.length === 0) {
    if (fallback && fallback.amountPaid !== 0) {
      totals[normalizePaymentMethodKey(fallback.paymentMethod)] += fallback.amountPaid;
    }
    return totals;
  }

  for (const entry of entries) {
    const amount = Number(entry.amount);
    if (!Number.isFinite(amount)) continue;
    const entryType = `${entry.paymentType ?? "PAYMENT"}`.toUpperCase();
    const signed = entryType === "REFUND" || entryType === "ADJUSTMENT" ? -Math.abs(amount) : amount;
    totals[normalizePaymentMethodKey(entry.paymentMethod)] += signed;
  }
  return totals;
}
