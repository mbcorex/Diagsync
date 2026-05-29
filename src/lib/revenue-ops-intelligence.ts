import { prisma } from "@/lib/prisma";
import { canUseHrmDashboard } from "@/lib/hrm-monitoring-core";
import { OrderStatus, PaymentEntryType, VisitStatus } from "@prisma/client";

type HrmActor = {
  id: string;
  role: string;
  organizationId: string;
};

function assertHrm(actor: HrmActor) {
  if (!canUseHrmDashboard(actor.role)) throw new Error("FORBIDDEN_ROLE");
}

function toMoney(value: unknown) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function dayKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type AnalyticsPeriod = "today" | "last7" | "last30" | "thisMonth" | "lastMonth" | "thisYear" | "allTime" | "custom";

export function getDateRangeForAnalyticsPeriod(period: AnalyticsPeriod, customStart?: Date, customEnd?: Date) {
  const now = new Date();
  let rangeStart: Date;
  let rangeEnd: Date = now;

  switch (period) {
    case "today":
      rangeStart = new Date(now);
      rangeStart.setHours(0, 0, 0, 0);
      break;
    case "last7":
      rangeStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "last30":
      rangeStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "thisMonth":
      rangeStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      break;
    case "lastMonth":
      rangeEnd = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      break;
    case "thisYear":
      rangeStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      break;
    case "custom":
      rangeStart = customStart || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      rangeEnd = customEnd || now;
      break;
    case "allTime":
    default:
      rangeStart = new Date(1970, 0, 1);
  }

  return { rangeStart, rangeEnd };
}

export async function getRevenueOpsIntelligence(actor: HrmActor, period: AnalyticsPeriod = "last30", customStart?: Date, customEnd?: Date) {
  assertHrm(actor);

  const now = new Date();
  const { rangeStart, rangeEnd } = getDateRangeForAnalyticsPeriod(period, customStart, customEnd);
  
  const start30 = rangeStart;
  const start14 = new Date(rangeStart);
  start14.setDate(Math.max(start14.getDate(), rangeStart.getDate() - 13));

  const visits = await prisma.visit.findMany({
    where: {
      organizationId: actor.organizationId,
      registeredAt: { gte: rangeStart, lte: rangeEnd },
    },
    select: {
      id: true,
      registeredAt: true,
      status: true,
      amountPaid: true,
      testOrders: {
        select: {
          id: true,
          status: true,
          price: true,
          defaultPrice: true,
          test: { select: { id: true, name: true, code: true, type: true } },
        },
      },
      payments: {
        select: { amount: true, paymentType: true },
      },
    },
    orderBy: { registeredAt: "desc" },
  });

  let billedValue = 0;
  let collectedValue = 0;
  let incompleteBilledValue = 0;
  let orderedCount = 0;
  let completedCount = 0;

  const completedStatuses = new Set<OrderStatus>([OrderStatus.APPROVED, OrderStatus.RELEASED]);
  const performanceMap = new Map<
    string,
    { name: string; code: string; type: string; orders: number; revenue: number; avgOrderValue: number }
  >();
  const dailyRevenueMap = new Map<string, { revenue: number; orders: number }>();

  for (const visit of visits) {
    const paymentLedger = visit.payments.reduce((sum, payment) => {
      const amount = toMoney(payment.amount);
      if (payment.paymentType === PaymentEntryType.REFUND) return sum - amount;
      return sum + amount;
    }, 0);
    const visitCollected = paymentLedger > 0 ? paymentLedger : toMoney(visit.amountPaid);
    collectedValue += visitCollected;

    for (const order of visit.testOrders) {
      const defaultPrice = toMoney(order.defaultPrice) > 0 ? toMoney(order.defaultPrice) : toMoney(order.price);
      const billedPrice = toMoney(order.price);
      billedValue += billedPrice;
      orderedCount += 1;

      if (completedStatuses.has(order.status)) {
        completedCount += 1;
      } else {
        incompleteBilledValue += billedPrice;
      }

      const byTest = performanceMap.get(order.test.id) ?? {
        name: order.test.name,
        code: order.test.code,
        type: order.test.type,
        orders: 0,
        revenue: 0,
        avgOrderValue: 0,
      };
      byTest.orders += 1;
      byTest.revenue += billedPrice;
      byTest.avgOrderValue = byTest.orders > 0 ? byTest.revenue / byTest.orders : 0;
      performanceMap.set(order.test.id, byTest);

      if (visit.registeredAt >= start14) {
        const key = dayKey(visit.registeredAt);
        const day = dailyRevenueMap.get(key) ?? { revenue: 0, orders: 0 };
        day.revenue += billedPrice;
        day.orders += 1;
        dailyRevenueMap.set(key, day);
      }
    }
  }

  const noShowCancelCount = visits.filter(
    (visit) => visit.status === VisitStatus.NO_SHOW || visit.status === VisitStatus.CANCELLED
  ).length;
  const totalVisits = visits.length;
  const noShowCancelRate = totalVisits > 0 ? noShowCancelCount / totalVisits : 0;

  const last7Start = new Date(now);
  last7Start.setDate(last7Start.getDate() - 6);
  const prev7Start = new Date(now);
  prev7Start.setDate(prev7Start.getDate() - 13);
  const prev7End = new Date(now);
  prev7End.setDate(prev7End.getDate() - 7);

  const last7 = visits.filter((visit) => visit.registeredAt >= last7Start);
  const prev7 = visits.filter((visit) => visit.registeredAt >= prev7Start && visit.registeredAt < prev7End);

  const last7Rate =
    last7.length > 0
      ? last7.filter((visit) => visit.status === VisitStatus.NO_SHOW || visit.status === VisitStatus.CANCELLED)
          .length / last7.length
      : 0;
  const prev7Rate =
    prev7.length > 0
      ? prev7.filter((visit) => visit.status === VisitStatus.NO_SHOW || visit.status === VisitStatus.CANCELLED)
          .length / prev7.length
      : 0;

  const trendDelta = last7Rate - prev7Rate;
  const trendDirection = trendDelta > 0.01 ? "up" : trendDelta < -0.01 ? "down" : "flat";
  const avgDailyRegistrations = last7.length / 7;
  const predictedNoShowsNext7 = Math.max(0, Math.round(last7Rate * avgDailyRegistrations * 7));
  const confidence = totalVisits >= 150 ? "high" : totalVisits >= 60 ? "medium" : "low";

  const uncollectedLeakage = Math.max(0, billedValue - collectedValue);
  const completionLeakageRate = orderedCount > 0 ? (orderedCount - completedCount) / orderedCount : 0;

  const topTestPerformance = Array.from(performanceMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 12);

  const dailyRevenue = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(start14);
    date.setDate(start14.getDate() + i);
    const key = dayKey(date);
    const day = dailyRevenueMap.get(key) ?? { revenue: 0, orders: 0 };
    return { date: key, ...day };
  });

  const windowDays = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000));

  return {
    summary: {
      windowDays,
      billedValue,
      collectedValue,
      uncollectedLeakage,
      incompleteBilledValue,
      completionLeakageRate,
      orderedCount,
      completedCount,
      rangeStart,
      rangeEnd,
    },
    topTestPerformance,
    dailyRevenue,
    noShowForecast: {
      noShowCancelRate,
      last7Rate,
      prev7Rate,
      trendDirection,
      trendDelta,
      predictedNoShowsNext7,
      confidence,
      basedOnVisits: totalVisits,
    },
  };
}
