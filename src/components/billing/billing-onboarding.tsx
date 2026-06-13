"use client";

import { useMemo, useState } from "react";
import { BILLING_BANK_DETAILS, PLAN_MONTHLY_AMOUNT_NGN } from "@/lib/billing-access";
import { formatCurrency } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type BillingProps = {
  organization: {
    plan: BillingPlan;
    status: BillingStatus;
    trialStartedAt: string | null;
    trialEndsAt: string | null;
    subscriptionEndsAt: string | null;
  };
  access: {
    trialDaysLeft: number | null;
    subscriptionDaysLeft: number | null;
    isTrialWarning: boolean;
    billingLocked: boolean;
  };
  paymentRequests: Array<{
    id: string;
    requestedPlan: BillingPlan;
    amount: number;
    status: PaymentRequestStatusValue;
    transactionReference: string | null;
    createdAt: string;
  }>;
};

type BillingPlan = "TRIAL" | "STARTER" | "ADVANCED";
type BillingStatus =
  | "ACTIVE"
  | "SUSPENDED"
  | "TRIAL_ACTIVE"
  | "TRIAL_EXPIRED"
  | "PAYMENT_PENDING"
  | "EXPIRED";
type PaymentRequestStatusValue = "PENDING" | "APPROVED" | "REJECTED";

function formatShortDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── Feature lists ────────────────────────────────────────────────────────────

const TRIAL_FEATURES = [
  { text: "All departments & roles unlocked", included: true },
  { text: "Radiology & Cardiology access", included: true },
  { text: "Unlimited patients & visits", included: true },
  { text: "Imaging file uploads (Cloudinary)", included: true },
  { text: "Web push notifications", included: true },
  { text: "Shareable report links", included: true },
  { text: "DiagSync watermark on all reports", included: false, warn: true },
];

const STARTER_FEATURES = [
  { text: "Up to 15 staff accounts", included: true },
  { text: "Roles: Receptionist, Lab Scientist, MD, HRM", included: true },
  { text: "Laboratory — full access (all lab tests)", included: true },
  { text: "Reception, Medical Review & HR Operations", included: true },
  { text: "Unlimited patients & visits", included: true },
  { text: "Audit logs & result versioning", included: true },
  { text: "In-app notifications & shareable links", included: true },
  { text: "WhatsApp support", included: true },
  { text: "Radiology / Cardiology department", included: false },
  { text: "Imaging uploads & custom letterhead", included: true },
  { text: "Web push notifications", included: true },
  { text: "DiagSync watermark on all reports", included: false, warn: true },
];

const ADVANCED_FEATURES = [
  { text: "Unlimited staff accounts", included: true },
  { text: "All roles including Radiographer", included: true },
  { text: "Laboratory — full access (all lab tests)", included: true },
  { text: "Radiology department & tests", included: true },
  { text: "Cardiology tests", included: true },
  { text: "Unlimited patients & visits", included: true },
  { text: "Imaging file uploads (Cloudinary)", included: true },
  { text: "Custom letterhead on reports", included: true },
  { text: "In-app + web push notifications", included: true },
  { text: "Shareable report links", included: true },
  { text: "Priority WhatsApp support", included: true },
  { text: "No DiagSync watermark — clean reports", included: true },
];

// ─── Feature Row ──────────────────────────────────────────────────────────────

function FeatureRow({ text, included, warn }: { text: string; included: boolean; warn?: boolean }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold
          ${warn ? "bg-amber-100 text-amber-600" : included ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}
      >
        {warn ? "!" : included ? "✓" : "–"}
      </span>
      <span
        className={`text-xs leading-relaxed ${
          warn ? "text-amber-700" : included ? "text-slate-700" : "text-slate-400"
        }`}
      >
        {text}
      </span>
    </div>
  );
}

// ─── Plan Card ────────────────────────────────────────────────────────────────

type PlanCardProps = {
  badge: string;
  badgeColor: string;
  name: string;
  price: string;
  priceNote?: string;
  desc: string;
  features: { text: string; included: boolean; warn?: boolean }[];
  buttonText: string;
  buttonClass: string;
  onClick: () => void;
  disabled?: boolean;
  highlight?: boolean;
  tag?: string;
};

function PlanCard({
  badge,
  badgeColor,
  name,
  price,
  priceNote,
  desc,
  features,
  buttonText,
  buttonClass,
  onClick,
  disabled = false,
  highlight = false,
  tag,
}: PlanCardProps) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-md
        ${highlight ? "border-blue-500 ring-1 ring-blue-500" : "border-slate-200"}`}
    >
      {tag && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="rounded-full bg-blue-600 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-white shadow">
            {tag}
          </span>
        </div>
      )}

      <div className="p-5 pb-4">
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${badgeColor}`}
        >
          {badge}
        </span>
        <h3 className="mt-3 text-base font-bold text-slate-900">{name}</h3>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-2xl font-extrabold text-slate-900">{price}</span>
          {priceNote && <span className="text-xs text-slate-500">{priceNote}</span>}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">{desc}</p>
      </div>

      <div className="mx-5 border-t border-slate-100" />

      <div className="flex-1 px-5 py-3">
        {features.map((f, i) => (
          <FeatureRow key={i} {...f} />
        ))}
      </div>

      <div className="p-5 pt-3">
        <button
          type="button"
          disabled={disabled}
          onClick={onClick}
          className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${buttonClass}`}
        >
          {buttonText}
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function BillingOnboarding({ organization, access, paymentRequests }: BillingProps) {
  const [selectedPlan, setSelectedPlan] = useState<Extract<BillingPlan, "STARTER" | "ADVANCED"> | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"trial" | "payment" | null>(null);
  const planPriceMap = PLAN_MONTHLY_AMOUNT_NGN as unknown as Record<string, number>;

  const activePending = useMemo(
    () => paymentRequests.find((item) => item.status === "PENDING"),
    [paymentRequests]
  );
  const hasPendingRequest = Boolean(activePending);
  const isActiveSubscription = organization.status === "ACTIVE" && access.subscriptionDaysLeft !== null;
  const isStarterActive = isActiveSubscription && organization.plan === "STARTER";
  const isAdvancedActive = isActiveSubscription && organization.plan === "ADVANCED";

  const canStartTrial = useMemo(() => {
    if (organization.status === "ACTIVE" || organization.plan !== "TRIAL") return false;
    if (organization.status === "TRIAL_EXPIRED" || organization.status === "EXPIRED") return false;
    return !organization.trialStartedAt;
  }, [organization.status, organization.trialStartedAt, organization.plan]);

  const starterButtonText = useMemo(() => {
    if (isStarterActive) return "Renew Starter";
    if (isAdvancedActive) return "Current plan is Advanced";
    return "Get Starter";
  }, [isStarterActive, isAdvancedActive]);

  const starterDisabled = isAdvancedActive || busy !== null || hasPendingRequest;

  const advancedButtonText = useMemo(() => {
    if (isAdvancedActive) return "Renew Advanced";
    if (isStarterActive) return "Upgrade to Advanced";
    return "Get Advanced";
  }, [isAdvancedActive, isStarterActive]);

  async function handleStartTrial() {
    setError("");
    setMessage("");
    setBusy("trial");
    try {
      const res = await fetch("/api/billing/trial/start", { method: "POST" });
      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? "Could not start trial");
        return;
      }
      setMessage("Free trial started. Refreshing your billing status...");
      window.location.reload();
    } catch {
      setError("Network error. Could not start free trial.");
    } finally {
      setBusy(null);
    }
  }

  async function handlePaymentSubmit(formData: FormData) {
    setError("");
    setMessage("");
    setBusy("payment");
    try {
      const res = await fetch("/api/billing/payment-requests", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? "Could not submit payment request");
        return;
      }
      setMessage("Payment submitted. Your account will be activated after verification.");
      setSelectedPlan(null);
      window.location.reload();
    } catch {
      setError("Network error. Could not submit payment request.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">

      {/* ── Header card ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Choose Your DiagSync Plan</h1>
            <p className="mt-1 text-sm text-slate-500">
              Pick a plan to continue using your lab workspace. Your data remains safe even when billing is locked.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
              Current plan: <strong>{organization.plan}</strong>
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-medium
                ${organization.status === "TRIAL_ACTIVE"
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : organization.status === "TRIAL_EXPIRED" || organization.status === "EXPIRED"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : organization.status === "ACTIVE"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"}`}
            >
              Status: <strong>{organization.status}</strong>
            </span>
            {organization.trialEndsAt && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                Trial ends: <strong>{formatShortDate(organization.trialEndsAt)}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Trial countdown */}
        {access.trialDaysLeft !== null && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium
              ${access.isTrialWarning ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}
          >
            <span>{access.isTrialWarning ? "⚠️" : "⏳"}</span>
            <span>
              Your free trial ends in{" "}
              <strong>{access.trialDaysLeft} day{access.trialDaysLeft === 1 ? "" : "s"}</strong>.
              Upgrade anytime to remove the watermark and unlock more features.
            </span>
          </div>
        )}
        {access.subscriptionDaysLeft !== null && organization.status === "ACTIVE" && organization.plan !== "TRIAL" && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
            <span>⏳</span>
            <span>
              Subscription ends in{" "}
              <strong>{access.subscriptionDaysLeft} day{access.subscriptionDaysLeft === 1 ? "" : "s"}</strong>.
            </span>
          </div>
        )}

        {/* Expired alert */}
        {(organization.status === "TRIAL_EXPIRED" || organization.status === "EXPIRED") && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <span className="mt-0.5 text-red-500">🔒</span>
            <div>
              <p className="text-sm font-semibold text-red-800">Your free trial has ended</p>
              <p className="text-xs text-red-600">
                Choose a plan below to unlock your workspace. All your data is safe.
              </p>
            </div>
          </div>
        )}

        {/* Payment pending alert */}
        {organization.status === "PAYMENT_PENDING" && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <span className="mt-0.5 text-amber-500">⏳</span>
            <div>
              <p className="text-sm font-semibold text-amber-800">Payment submitted — awaiting verification</p>
              <p className="text-xs text-amber-600">
                We'll activate your account as soon as we confirm your payment.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Alerts ── */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {message && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>
      )}

      {/* ── Plan cards ── */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <PlanCard
          badge="Free Trial"
          badgeColor="bg-amber-100 text-amber-700"
          name="2-Week Free Trial"
          price="Free"
          desc="Full access from day one — every feature unlocked. The only catch: a DiagSync watermark appears on all printed reports."
          features={TRIAL_FEATURES}
          buttonText={canStartTrial ? (busy === "trial" ? "Starting..." : "Start Free Trial") : "Trial Unavailable"}
          buttonClass="bg-amber-500 text-white hover:bg-amber-600"
          disabled={!canStartTrial || busy !== null || hasPendingRequest}
          onClick={() => {
            if (!canStartTrial || busy) return;
            void handleStartTrial();
          }}
        />
        <PlanCard
          badge="Starter"
          badgeColor="bg-blue-100 text-blue-700"
          name="Starter Pack"
          price={formatCurrency(planPriceMap.STARTER)}
          priceNote="/ month"
          desc="For labs focused on laboratory work. Full lab workflow, imaging uploads, custom letterhead and web-push — DiagSync watermark remains on prints."
          features={STARTER_FEATURES}
          buttonText={starterButtonText}
          buttonClass="border border-blue-600 text-blue-600 hover:bg-blue-50"
          disabled={starterDisabled}
          onClick={() => setSelectedPlan("STARTER")}
        />
        <PlanCard
          badge="Advanced"
          badgeColor="bg-emerald-100 text-emerald-700"
          name="Advanced Pack"
          price={formatCurrency(planPriceMap.ADVANCED)}
          priceNote="/ month"
          desc="Full-service labs. Lab + Radiology + Cardiology, custom branding, imaging uploads, push notifications — clean reports, no watermark."
          features={ADVANCED_FEATURES}
          buttonText={advancedButtonText}
          buttonClass="bg-blue-600 text-white hover:bg-blue-700"
          disabled={busy !== null || hasPendingRequest}
          highlight
          tag="Most Popular"
          onClick={() => setSelectedPlan("ADVANCED")}
        />
      </div>

      {/* ── Payment form ── */}
      {selectedPlan && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Manual Payment Instructions</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Transfer the exact amount and submit your reference below.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedPlan(null)}
              className="rounded-md px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100"
            >
              ✕ Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-500">Selected Plan</p>
              <p className="mt-1 text-lg font-bold text-slate-800">
                {selectedPlan === "STARTER" ? "Starter Pack" : "Advanced Pack"}
              </p>
              <p className="text-xs text-slate-500">
                {selectedPlan === organization.plan && isActiveSubscription
                  ? "Renewal request"
                  : organization.plan === "STARTER" && selectedPlan === "ADVANCED" && isActiveSubscription
                  ? "Upgrade request"
                  : "New subscription request"}
              </p>
              <p className="text-sm font-semibold text-blue-700">
                {formatCurrency(planPriceMap[selectedPlan])} / month
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bank Details</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{BILLING_BANK_DETAILS.bankName}</p>
              <p className="mt-0.5 text-xs text-slate-600">Account: {BILLING_BANK_DETAILS.accountNumber}</p>
              <p className="text-xs text-slate-600">Name: {BILLING_BANK_DETAILS.accountName}</p>
            </div>
          </div>

          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              data.set("requestedPlan", selectedPlan);
              void handlePaymentSubmit(data);
            }}
          >
            <input type="hidden" name="requestedPlan" value={selectedPlan} />
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Transaction Reference <span className="text-red-500">*</span>
              </label>
              <input
                name="transactionReference"
                required
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                placeholder="e.g. TRF20250401XYZ"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Payment Proof <span className="text-slate-400">(Optional)</span>
              </label>
              <input
                name="proof"
                type="file"
                className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 file:mr-3 file:rounded file:border-0 file:bg-blue-50 file:px-2 file:py-1 file:text-xs file:text-blue-600"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Note <span className="text-slate-400">(Optional)</span>
              </label>
              <textarea
                name="notes"
                rows={2}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                placeholder="Any extra info for verification..."
              />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={busy === "payment"}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {busy === "payment" ? "Submitting..." : "I have made payment"}
              </button>
              <button
                type="button"
                onClick={() => setSelectedPlan(null)}
                className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Recent payment requests ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800">Recent Payment Requests</h3>
        {paymentRequests.length === 0 ? (
          <p className="mt-3 text-xs text-slate-400">No payment requests submitted yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[620px] text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-400">
                  <th className="pb-2 pr-4 font-medium">Plan</th>
                  <th className="pb-2 pr-4 font-medium">Amount</th>
                  <th className="pb-2 pr-4 font-medium">Reference</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {paymentRequests.map((item) => (
                  <tr key={item.id} className="text-slate-700">
                    <td className="py-2.5 pr-4">{item.requestedPlan}</td>
                    <td className="py-2.5 pr-4">{formatCurrency(item.amount)}</td>
                    <td className="py-2.5 pr-4 text-slate-500">{item.transactionReference ?? "–"}</td>
                    <td className="py-2.5 pr-4">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold
                          ${item.status === "APPROVED"
                            ? "bg-emerald-50 text-emerald-700"
                            : item.status === "REJECTED"
                            ? "bg-red-50 text-red-600"
                            : "bg-amber-50 text-amber-700"}`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-400">{formatShortDate(item.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {activePending && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            ⏳ Pending request: <strong>{activePending.requestedPlan}</strong> (
            {formatCurrency(activePending.amount)}) — awaiting verification.
          </p>
        )}
      </div>

    </div>
  );
}
