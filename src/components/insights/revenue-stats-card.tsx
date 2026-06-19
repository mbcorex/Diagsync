"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { StatCard } from "@/components/insights/StatCard";
import { SectionCard } from "@/components/insights/SectionCard";
import { AnalyticsDateFilter } from "@/components/insights/analytics-date-filter";
import { RevenuePeriod } from "@/lib/analytics/revenue";

interface RevenueStats {
  periodRevenue: number;
  comparisonRevenue: number;
  growth: number;
  rangeStart: string;
  rangeEnd: string;
  topTests: Array<{ testId: string; testName: string; amount: number }>;
  staffRevenue: Array<{ staffId?: string; staffName: string; amount: number }>;
}

interface RevenueStatsCardProps {
  patientsToday: number;
  labStats: { patientsThisWeek: number; growthPercent: number; busiestDay: string };
  alerts: number;
  staffPerformance: Array<{ id: string; name: string; completedTests: number }>;
}

export function RevenueStatsCard({
  patientsToday,
  labStats,
  alerts,
  staffPerformance,
}: RevenueStatsCardProps) {
  const [period, setPeriod] = useState<RevenuePeriod>("today");
  const [stats, setStats] = useState<RevenueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd, setCustomEnd] = useState<Date | undefined>();

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          period,
          ...(customStart && { start: customStart.toISOString() }),
          ...(customEnd && { end: customEnd.toISOString() }),
        });

        const response = await fetch(`/api/analytics/revenue?${params}`);
        if (!response.ok) throw new Error("Failed to fetch stats");

        const data = await response.json();
        setStats(data);
      } catch (error) {
        console.error("Error fetching revenue stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [period, customStart, customEnd]);

  const handlePeriodChange = (newPeriod: RevenuePeriod, start?: Date, end?: Date) => {
    setPeriod(newPeriod);
    setCustomStart(start);
    setCustomEnd(end);
  };

  const formatDateRange = () => {
    if (!stats) return "";
    const start = new Date(stats.rangeStart).toLocaleDateString("en-NG", {
      month: "short",
      day: "numeric",
    });
    const end = new Date(stats.rangeEnd).toLocaleDateString("en-NG", {
      month: "short",
      day: "numeric",
    });
    return `${start} - ${end}`;
  };

  if (loading || !stats) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold text-slate-800">Insights Dashboard</h1>
          <AnalyticsDateFilter onPeriodChange={handlePeriodChange} currentPeriod={period} />
        </div>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-slate-800">Insights Dashboard</h1>
          <p className="text-xs text-slate-500">Revenue, growth, activity and performance at a glance.</p>
        </div>
        <AnalyticsDateFilter onPeriodChange={handlePeriodChange} currentPeriod={period} />
      </div>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          title="Total Revenue"
          value={formatCurrency(stats.periodRevenue)}
          sub={`Vs Period: ${formatCurrency(stats.comparisonRevenue)}`}
        />
        <StatCard
          title="Growth"
          value={`${stats.growth >= 0 ? "+" : ""}${stats.growth}%`}
          sub={formatDateRange()}
          color={stats.growth >= 0 ? "green" : "red"}
        />
        <StatCard
          title="Patients Today"
          value={`${patientsToday}`}
          sub={`This week: ${labStats.patientsThisWeek}`}
        />
        <StatCard
          title="Operational Alerts"
          value={`${alerts} Delays`}
          sub={alerts > 0 ? "Needs attention" : "No delay warnings"}
          color={alerts > 0 ? "red" : "green"}
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Top Tests by Revenue">
          {stats.topTests.length === 0 ? (
            <p className="text-xs text-slate-500">No data yet</p>
          ) : (
            <div className="space-y-2">
              {stats.topTests.map((test) => (
                <div
                  key={test.testId}
                  className="flex items-center justify-between rounded-lg border border-slate-100 p-2"
                >
                  <span className="text-sm text-slate-700">{test.testName}</span>
                  <span className="text-sm font-semibold text-slate-900">{formatCurrency(test.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Staff Revenue">
          {stats.staffRevenue.length === 0 ? (
            <p className="text-xs text-slate-500">No data yet</p>
          ) : (
            <div className="space-y-2">
              {stats.staffRevenue.map((staff, idx) => (
                <div
                  key={`${staff.staffId || "unassigned"}-${idx}`}
                  className="flex items-center justify-between rounded-lg border border-slate-100 p-2"
                >
                  <span className="text-sm text-slate-700">{staff.staffName}</span>
                  <span className="text-sm font-semibold text-slate-900">{formatCurrency(staff.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </section>

      <SectionCard title="Weekly Summary">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-100 p-3">
            <p className="text-xs text-slate-500">Patients This Week</p>
            <p className="text-lg font-semibold text-slate-900">{labStats.patientsThisWeek}</p>
          </div>
          <div className="rounded-lg border border-slate-100 p-3">
            <p className="text-xs text-slate-500">Growth %</p>
            <p className={`text-lg font-semibold ${labStats.growthPercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {labStats.growthPercent >= 0 ? "+" : ""}
              {labStats.growthPercent}%
            </p>
          </div>
          <div className="rounded-lg border border-slate-100 p-3">
            <p className="text-xs text-slate-500">Busiest Day</p>
            <p className="text-lg font-semibold text-slate-900">{labStats.busiestDay}</p>
          </div>
          <div className="rounded-lg border border-slate-100 p-3">
            <p className="text-xs text-slate-500">Total Revenue</p>
            <p className="text-lg font-semibold text-slate-900">{formatCurrency(stats.periodRevenue)}</p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
