import { OrganizationPlan, OrganizationStatus } from "@prisma/client";

export const BILLING_BANK_DETAILS = {
  bankName: "Access Bank",
  accountNumber: "0080409488",
  accountName: "Martin Chinedu-Ihim",
} as const;

export const PLAN_MONTHLY_AMOUNT_NGN: Record<OrganizationPlan, number> = {
  TRIAL: 0,
  STARTER: 15000,
  ADVANCED: 25000,
};

type OrganizationBillingLike = {
  plan: OrganizationPlan;
  status: OrganizationStatus;
  trialStartedAt?: Date | null;
  trialEndsAt?: Date | null;
  subscriptionStartedAt?: Date | null;
  subscriptionEndsAt?: Date | null;
  watermarkEnabled?: boolean | null;
  staffLimit?: number | null;
  billingLockedAt?: Date | null;
  billingLockReason?: string | null;
};

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysUntil(target: Date, now = new Date()) {
  const diffMs = startOfDay(target).getTime() - startOfDay(now).getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function getEffectiveOrganizationStatus(
  organization: OrganizationBillingLike,
  now = new Date()
): OrganizationStatus {
  if (organization.status === "TRIAL_ACTIVE" && organization.trialEndsAt && organization.trialEndsAt <= now) {
    return "TRIAL_EXPIRED";
  }

  if (
    organization.status === "ACTIVE" &&
    organization.plan !== "TRIAL" &&
    organization.subscriptionEndsAt &&
    organization.subscriptionEndsAt <= now
  ) {
    return "EXPIRED";
  }

  return organization.status;
}

export function isBillingLocked(organization: OrganizationBillingLike, now = new Date()) {
  const status = getEffectiveOrganizationStatus(organization, now);
  if (status === "TRIAL_EXPIRED" || status === "EXPIRED" || status === "SUSPENDED") return true;
  if (status === "PAYMENT_PENDING" && Boolean(organization.billingLockedAt)) return true;
  return false;
}

export function canUseRadiology(organization: OrganizationBillingLike, now = new Date()) {
  if (isBillingLocked(organization, now)) return false;
  return organization.plan === "TRIAL" || organization.plan === "ADVANCED";
}

export function canUseCardiology(organization: OrganizationBillingLike, now = new Date()) {
  if (isBillingLocked(organization, now)) return false;
  return organization.plan === "TRIAL" || organization.plan === "ADVANCED";
}

export function canUploadImaging(organization: OrganizationBillingLike, now = new Date()) {
  if (isBillingLocked(organization, now)) return false;
  return organization.plan === "TRIAL" || organization.plan === "ADVANCED" || organization.plan === "STARTER";
}

export function canUseWebPush(organization: OrganizationBillingLike, now = new Date()) {
  if (isBillingLocked(organization, now)) return false;
  return organization.plan === "TRIAL" || organization.plan === "ADVANCED" || organization.plan === "STARTER";
}

export function canUseCustomLetterhead(organization: OrganizationBillingLike, now = new Date()) {
  if (isBillingLocked(organization, now)) return false;
  return organization.plan === "TRIAL" || organization.plan === "ADVANCED" || organization.plan === "STARTER";
}

export function shouldShowWatermark(organization: OrganizationBillingLike) {
  if (organization.plan === "ADVANCED") return false;
  if (organization.plan === "TRIAL" || organization.plan === "STARTER") return true;
  return Boolean(organization.watermarkEnabled ?? true);
}

export function canAddStaff(organization: OrganizationBillingLike, currentStaffCount: number, now = new Date()) {
  if (isBillingLocked(organization, now)) return false;
  const limit = organization.plan === "STARTER" ? 15 : organization.staffLimit;
  if (!limit || limit <= 0) return true;
  return currentStaffCount < limit;
}

export function getOrganizationAccess(organization: OrganizationBillingLike, now = new Date()) {
  const effectiveStatus = getEffectiveOrganizationStatus(organization, now);
  const billingLocked = isBillingLocked(organization, now);
  const trialDaysLeft =
    organization.trialEndsAt && effectiveStatus === "TRIAL_ACTIVE" ? Math.max(0, daysUntil(organization.trialEndsAt, now)) : null;
  const subscriptionDaysLeft =
    organization.subscriptionEndsAt && effectiveStatus === "ACTIVE" ? Math.max(0, daysUntil(organization.subscriptionEndsAt, now)) : null;

  return {
    plan: organization.plan,
    status: effectiveStatus,
    billingLocked,
    trialDaysLeft,
    subscriptionDaysLeft,
    canUseRadiology: canUseRadiology(organization, now),
    canUseCardiology: canUseCardiology(organization, now),
    canUploadImaging: canUploadImaging(organization, now),
    canUseWebPush: canUseWebPush(organization, now),
    canUseCustomLetterhead: canUseCustomLetterhead(organization, now),
    shouldShowWatermark: shouldShowWatermark(organization),
    isTrialWarning: trialDaysLeft !== null && trialDaysLeft < 3,
  };
}

