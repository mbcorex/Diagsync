// src/components/radiology/radiology-queue-table.tsx
"use client";

import { formatDateTime } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Row = {
  taskId: string;
  patientName: string;
  patientId: string;
  visitNumber: string;
  tests: string[];
  priority: "ROUTINE" | "URGENT" | "EMERGENCY";
  taskStatus: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  assignedAt: Date;
  updatedAt: Date;
  imageCount?: number;
};

const priorityStyle: Record<string, string> = {
  EMERGENCY: "bg-red-50 text-red-600",
  URGENT: "bg-amber-50 text-amber-700",
  ROUTINE: "bg-slate-100 text-slate-600",
};

const statusStyle: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  COMPLETED: "bg-green-50 text-green-700",
  CANCELLED: "bg-red-50 text-red-600",
};

export function RadiologyQueueTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const refreshingRef = useRef(false);

  useEffect(() => {
    const refreshNow = () => {
      if (refreshingRef.current) return;
      if (document.visibilityState !== "visible") return;
      refreshingRef.current = true;
      router.refresh();
      window.setTimeout(() => {
        refreshingRef.current = false;
      }, 1200);
    };

    const poll = window.setInterval(refreshNow, 60_000);
    window.addEventListener("focus", refreshNow);
    document.addEventListener("visibilitychange", refreshNow);

    return () => {
      window.clearInterval(poll);
      window.removeEventListener("focus", refreshNow);
      document.removeEventListener("visibilitychange", refreshNow);
    };
  }, [router]);

  async function startTask(taskId: string) {
    setBusy(taskId);
    setError("");
    try {
      const res = await fetch(`/api/radiology/tasks/${taskId}/start`, { method: "PATCH" });
      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? "Unable to start task");
        return;
      }
      router.push(`/dashboard/radiographer?task=${taskId}`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-xs text-slate-400">
        No radiology queue items yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </div>
      )}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">
                  Patient
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">
                  Tests
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">
                  Priority
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">
                  Status
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">
                  Images
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">
                  Assigned
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">
                  Updated
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-400 whitespace-nowrap">
                  Action
                </th>
               </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.taskId} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-slate-800">{row.patientName}</p>
                    <p className="font-mono text-slate-400">
                      {row.patientId} · {row.visitNumber}
                    </p>
                   </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {row.tests.join(", ")}
                   </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded px-1.5 py-0.5 font-medium ${priorityStyle[row.priority]}`}>
                      {row.priority}
                    </span>
                   </td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded px-1.5 py-0.5 font-medium ${statusStyle[row.taskStatus]}`}>
                      {row.taskStatus.replace("_", " ")}
                    </span>
                   </td>
                  <td className="px-4 py-2.5">
                    {(row.imageCount ?? 0) > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                        📷 {row.imageCount} file{row.imageCount !== 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                   </td>
                  <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">
                    {formatDateTime(row.assignedAt)}
                   </td>
                  <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">
                    {formatDateTime(row.updatedAt)}
                   </td>
                  <td className="px-4 py-2.5">
                    {row.taskStatus === "PENDING" ? (
                      <button
                        disabled={busy === row.taskId}
                        onClick={() => startTask(row.taskId)}
                        className="rounded bg-blue-600 px-2.5 py-1 font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {busy === row.taskId ? "Starting..." : "Start"}
                      </button>
                    ) : (
                      <button
                        onClick={() => router.push(`/dashboard/radiographer?task=${row.taskId}`)}
                        className="rounded border border-slate-200 px-2.5 py-1 text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        Open
                      </button>
                    )}
                   </td>
                </tr>
              ))}
            </tbody>
           </table>
        </div>
      </div>
    </div>
  );
}
