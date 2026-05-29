"use client";

import { useEffect, useState } from "react";
import { formatCurrency, formatMinutes, ROLE_LABELS } from "@/lib/utils";
import { AnalyticsDateFilter } from "@/components/insights/analytics-date-filter";
import { AnalyticsPeriod } from "@/lib/revenue-ops-intelligence";

interface AnalyticsData {
  summary: {
    windowDays: number;
    billedValue: number;
    collectedValue: number;
    uncollectedLeakage: number;
    incompleteBilledValue: number;
    completionLeakageRate: number;
    orderedCount: number;
    completedCount: number;
    rangeStart: string;
    rangeEnd: string;
  };
  topTestPerformance: Array<{
    name: string;
    code: string;
    type: string;
    orders: number;
    revenue: number;
    avgOrderValue: number;
  }>;
  dailyRevenue: Array<{ date: string; revenue: number; orders: number }>;
  noShowForecast: {
    noShowCancelRate: number;
    last7Rate: number;
    prev7Rate: number;
    trendDirection: string;
    trendDelta: number;
    predictedNoShowsNext7: number;
    confidence: string;
    basedOnVisits: number;
  };
}

interface OperationsAnalyticsDashboardProps {
  busyStaff: Array<{
    id: string;
    fullName: string;
    role: string;
    active: number;
    overloaded: boolean;
  }>;
  tasksPerDepartment: Record<string, number>;
}

export function OperationsAnalyticsDashboard({
  busyStaff,
  tasksPerDepartment,
}: OperationsAnalyticsDashboardProps) {
  const [period, setPeriod] = useState<AnalyticsPeriod>("last30");
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd, setCustomEnd] = useState<Date | undefined>();

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          period,
          ...(customStart && { start: customStart.toISOString() }),
          ...(customEnd && { end: customEnd.toISOString() }),
        });

        const response = await fetch(`/api/analytics/operations?${params}`);
        if (!response.ok) throw new Error("Failed to fetch analytics");

        const data = await response.json();
        setAnalytics(data);
      } catch (error) {
        console.error("Error fetching analytics:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [period, customStart, customEnd]);

  const handlePeriodChange = (newPeriod: AnalyticsPeriod, start?: Date, end?: Date) => {
    setPeriod(newPeriod);
    setCustomStart(start);
    setCustomEnd(end);
  };

  const formatDateRange = () => {
    if (!analytics) return "";
    const start = new Date(analytics.summary.rangeStart).toLocaleDateString("en-NG", {
      month: "short",
      day: "numeric",
    });
    const end = new Date(analytics.summary.rangeEnd).toLocaleDateString("en-NG", {
      month: "short",
      day: "numeric",
    });
    return `${start} - ${end}`;
  };

  if (loading || !analytics) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-slate-800">Operations Analytics</h1>
          <AnalyticsDateFilter onPeriodChange={handlePeriodChange} currentPeriod={period} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with date filter */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-slate-800">Operations Analytics</h1>
          <p className="text-xs text-slate-400 mt-0.5">Throughput, delays, and workload across the lab.</p>
        </div>
        <AnalyticsDateFilter onPeriodChange={handlePeriodChange} currentPeriod={period} />
      </div>

      {/* Stat strip with dynamic revenue data */}
      <div className="grid grid-cols-1 gap-px rounded-lg border border-slate-200 bg-slate-200 overflow-hidden sm:grid-cols-3">
        <div className="bg-white px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Billed Value</p>
          <p className="text-xl font-bold mt-0.5 text-slate-800">{formatCurrency(analytics.summary.billedValue)}</p>
          <p className="text-xs text-slate-500 mt-1">{formatDateRange()}</p>
        </div>
        <div className="bg-white px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Collected</p>
          <p className="text-xl font-bold mt-0.5 text-slate-800">{formatCurrency(analytics.summary.collectedValue)}</p>
          <p className="text-xs text-slate-500 mt-1">
            {analytics.summary.completedCount} of {analytics.summary.orderedCount} completed
          </p>
        </div>
        <div className="bg-white px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Uncollected Leakage</p>
          <p className={`text-xl font-bold mt-0.5 ${analytics.summary.uncollectedLeakage > 0 ? "text-red-600" : "text-slate-800"}`}>
            {formatCurrency(analytics.summary.uncollectedLeakage)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {Math.round(analytics.summary.completionLeakageRate * 100)}% incomplete
          </p>
        </div>
      </div>

      {/* Tasks per department */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tasks Per Department</span>
        </div>
        <div className="p-4 flex flex-wrap gap-2">
          {Object.entries(tasksPerDepartment).map(([dept, count]) => (
            <span key={dept} className="rounded bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
              {dept}: <strong>{count as number}</strong>
            </span>
          ))}
          {Object.keys(tasksPerDepartment).length === 0 && (
            <p className="text-xs text-slate-400">No task data yet.</p>
          )}
        </div>
      </div>

      {/* Busiest staff */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Busiest Staff</span>
        </div>
        {busyStaff.length === 0 ? (
          <p className="px-4 py-6 text-xs text-slate-400">No active workload yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-2.5 text-left font-medium text-slate-400">Name</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-400">Role</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-400">Active Tasks</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-400">Workload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {busyStaff.map((staff) => (
                  <tr key={staff.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{staff.fullName}</td>
                    <td className="px-4 py-2.5 text-slate-500">{ROLE_LABELS[staff.role as keyof typeof ROLE_LABELS] || staff.role}</td>
                    <td className="px-4 py-2.5 text-slate-700">{staff.active}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded px-1.5 py-0.5 font-medium ${
                          staff.overloaded ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"
                        }`}
                      >
                        {staff.overloaded ? "Overloaded" : "Normal"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Revenue + collections */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Revenue + Collections ({analytics.summary.windowDays}d)
          </span>
        </div>
        <div className="grid grid-cols-1 gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Billed Value", value: formatCurrency(analytics.summary.billedValue) },
            { label: "Collected", value: formatCurrency(analytics.summary.collectedValue) },
            {
              label: "Uncollected Leakage",
              value: formatCurrency(analytics.summary.uncollectedLeakage),
              alert: analytics.summary.uncollectedLeakage > 0,
            },
            {
              label: "Incomplete Billed",
              value: formatCurrency(analytics.summary.incompleteBilledValue),
              alert: analytics.summary.incompleteBilledValue > 0,
            },
          ].map((s) => (
            <div key={s.label} className="bg-white px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{s.label}</p>
              <p className={`text-base font-semibold mt-0.5 ${s.alert ? "text-red-600" : "text-slate-800"}`}>
                {s.value}
              </p>
            </div>
          ))}
        </div>
        <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
          Completion leakage: <span className="font-semibold text-slate-700">{Math.round(analytics.summary.completionLeakageRate * 100)}%</span>
          {" "}({analytics.summary.completedCount}/{analytics.summary.orderedCount} orders completed)
        </div>
      </div>

      {/* Top test performance */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top Test Performance</span>
        </div>
        {analytics.topTestPerformance.length === 0 ? (
          <p className="px-4 py-6 text-xs text-slate-400">No billing data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-2.5 text-left font-medium text-slate-400">Test</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-400">Orders</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-400">Revenue</th>
                  <th className="px-4 py-2.5 text-left font-medium text-slate-400">Avg Order Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analytics.topTestPerformance.map((row) => (
                  <tr key={`${row.code}-${row.name}`}>
                    <td className="px-4 py-2.5 font-medium text-slate-800">
                      {row.name} <span className="text-slate-400">({row.code})</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{row.orders}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{formatCurrency(row.revenue)}</td>
                    <td className="px-4 py-2.5 text-slate-700">{formatCurrency(row.avgOrderValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
