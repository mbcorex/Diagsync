"use client";

import { useState } from "react";
import { RevenuePeriod } from "@/lib/analytics/revenue";
import { ChevronDown, Calendar } from "lucide-react";

interface AnalyticsDateFilterProps {
  onPeriodChange: (period: RevenuePeriod, start?: Date, end?: Date) => void;
  currentPeriod: RevenuePeriod;
}

export function AnalyticsDateFilter({ onPeriodChange, currentPeriod }: AnalyticsDateFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const periods: Array<{ value: RevenuePeriod; label: string; description: string }> = [
    { value: "today", label: "Today", description: "Current day" },
    { value: "last7", label: "Last 7 Days", description: "Past week" },
    { value: "last30", label: "Last 30 Days", description: "Past month" },
    { value: "thisMonth", label: "This Month", description: "Current month" },
    { value: "lastMonth", label: "Last Month", description: "Previous month" },
    { value: "thisYear", label: "This Year", description: "Since January 1st" },
    { value: "allTime", label: "All Time", description: "Complete history" },
    { value: "custom", label: "Custom Date Range", description: "Pick your dates" },
  ];

  const currentPeriodLabel =
    periods.find((p) => p.value === currentPeriod)?.label || "Select Period";

  const handlePeriodSelect = (period: RevenuePeriod) => {
    if (period === "custom") {
      setShowCustom(true);
    } else {
      onPeriodChange(period);
      setIsOpen(false);
      setShowCustom(false);
    }
  };

  const handleCustomSubmit = () => {
    if (customStart && customEnd) {
      onPeriodChange("custom", new Date(customStart), new Date(customEnd));
      setIsOpen(false);
      setShowCustom(false);
    }
  };

  return (
    <div className="relative">
      {/* Main Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <Calendar className="h-4 w-4" />
        {currentPeriodLabel}
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-slate-200 bg-white shadow-lg">
          {!showCustom ? (
            <div className="p-2">
              {periods.map((period) => (
                <button
                  key={period.value}
                  onClick={() => handlePeriodSelect(period.value)}
                  className={`w-full text-left rounded-lg px-3 py-2.5 transition-colors ${
                    currentPeriod === period.value
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <div className="font-medium">{period.label}</div>
                  <div className="text-xs text-slate-500">{period.description}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3 p-4">
              <div>
                <label className="text-xs font-semibold text-slate-700">Start Date</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700">End Date</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowCustom(false)}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Back
                </button>
                <button
                  onClick={handleCustomSubmit}
                  disabled={!customStart || !customEnd}
                  className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
