"use client";

import { useEffect, useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/index";
import { formatDateTime } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type TaskRow = {
  taskId: string;
  department: string;
  priority: "ROUTINE" | "URGENT" | "EMERGENCY";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  assignedStaff: { id: string; fullName: string } | null;
  visit: { patient: { fullName: string; patientId: string } };
  testNames: string[];
  createdAt: string;
  updatedAt: string;
  delayed: boolean;
};

type StaffPerf = {
  id: string;
  fullName: string;
  role: string;
  assigned: number;
  active: number;
  completed: number;
  overloaded: boolean;
};

type StaffOption = {
  id: string;
  fullName: string;
  role: string;
  department: string;
};

const statusStyle: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-50 text-blue-700",
  COMPLETED: "bg-green-50 text-green-700",
  CANCELLED: "bg-red-50 text-red-600",
};

const priorityStyle: Record<string, string> = {
  ROUTINE: "bg-slate-100 text-slate-600",
  URGENT: "bg-amber-50 text-amber-700",
  EMERGENCY: "bg-red-50 text-red-600",
};

export function HrmOperationsBoard({ staffOptions }: { staffOptions: StaffOption[] }) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [staffPerf, setStaffPerf] = useState<StaffPerf[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [department, setDepartment] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [priority, setPriority] = useState("ALL");
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [reassign, setReassign] = useState<Record<string, string>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string>("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ department, status, priority });
      const [taskRes, perfRes] = await Promise.all([
        fetch(`/api/hrm/tasks?${query.toString()}`),
        fetch("/api/hrm/staff-performance"),
      ]);
      const taskJson = await taskRes.json();
      const perfJson = await perfRes.json();
      if (!taskJson.success) { setError(taskJson.error ?? "Failed to load tasks"); return; }
      if (!perfJson.success) { setError(perfJson.error ?? "Failed to load staff performance"); return; }
      setTasks(taskJson.data);
      setStaffPerf(perfJson.data);
      setLastLoadedAt(new Date().toISOString());
    } catch {
      setError("Network error while loading operations data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadData(); }, [department, status, priority]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (busyTaskId) return;
      void loadData();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [busyTaskId, department, status, priority]);

  const delayedCount = useMemo(() => tasks.filter((t) => t.delayed).length, [tasks]);

  async function onReassign(task: TaskRow) {
    const newStaffId = reassign[task.taskId];
    if (!newStaffId) { setError("Select a staff member to reassign."); return; }
    setBusyTaskId(task.taskId);
    setError("");
    try {
      const res = await fetch(`/api/hrm/tasks/${task.taskId}/reassign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStaffId, reason: reason[task.taskId] ?? "" }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error ?? "Reassignment failed"); return; }
      setExpandedTask(null);
      await loadData();
    } finally { setBusyTaskId(null); }
  }

  async function onOverride(taskId: string, action: "RELEASE_TO_PENDING" | "FORCE_COMPLETE") {
    setBusyTaskId(taskId);
    setError("");
    try {
      const res = await fetch(`/api/hrm/tasks/${taskId}/override`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason[taskId] ?? "" }),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error ?? "Override failed"); return; }
      setExpandedTask(null);
      await loadData();
    } finally { setBusyTaskId(null); }
  }

  function nextStep(task: TaskRow) {
    if (task.status === "PENDING") return "Next: Assign and open case";
    if (task.status === "IN_PROGRESS") return "Next: Complete processing and submit";
    return "Next: Await MD/release flow";
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={department} onValueChange={setDepartment}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Departments</SelectItem>
            <SelectItem value="LABORATORY">Laboratory</SelectItem>
            <SelectItem value="RADIOLOGY">Radiology</SelectItem>
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Priorities</SelectItem>
            <SelectItem value="EMERGENCY">Emergency</SelectItem>
            <SelectItem value="URGENT">Urgent</SelectItem>
            <SelectItem value="ROUTINE">Routine</SelectItem>
          </SelectContent>
        </Select>

        {delayedCount > 0 && (
          <span className="rounded bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
            {delayedCount} delayed
          </span>
        )}

        <button
          onClick={loadData}
          className="ml-auto rounded border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Refresh
        </button>
        {lastLoadedAt ? (
          <span className="text-[11px] text-slate-400">Updated {formatDateTime(lastLoadedAt)}</span>
        ) : null}
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </div>
      )}

      {/* Tasks Table */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tasks</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-2.5 text-left font-medium text-slate-400">Patient</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-400">Dept</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-400">Tests</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-400">Assigned</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-400">Status</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-400">Priority</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-400">Updated</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-4">
                    <div className="space-y-2">
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-full" />
                    </div>
                  </td>
                </tr>
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                    No assigned tests. You're all caught up.
                  </td>
                </tr>
              ) : (
                tasks.map((task) => (
                  <>
                    <tr key={task.taskId} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-800">{task.visit.patient.fullName}</p>
                        <p className="font-mono text-slate-400">{task.visit.patient.patientId}</p>
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">{task.department}</td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {task.testNames.join(", ")}
                      </td>
                      <td className="px-4 py-2.5 text-slate-500">
                        {task.assignedStaff?.fullName ?? (
                          <span className="text-slate-300">Unassigned</span>
                        )}
                        <p className="text-[11px] text-slate-400">{nextStep(task)}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded px-1.5 py-0.5 font-medium ${statusStyle[task.status] ?? "bg-slate-100 text-slate-500"}`}>
                          {task.status.replace("_", " ")}
                        </span>
                        {task.delayed && (
                          <span className="ml-1 rounded bg-red-50 px-1.5 py-0.5 font-medium text-red-600">
                            DELAYED
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded px-1.5 py-0.5 font-medium ${priorityStyle[task.priority] ?? "bg-slate-100 text-slate-500"}`}>
                          {task.priority}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">
                        {formatDateTime(task.updatedAt)}
                        <p className="text-[11px]">by {task.assignedStaff?.fullName ?? "system"}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() =>
                            setExpandedTask(expandedTask === task.taskId ? null : task.taskId)
                          }
                          className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                          {expandedTask === task.taskId ? "Close" : "Manage"}
                        </button>
                      </td>
                    </tr>

                    {/* Inline expand row for actions */}
                    {expandedTask === task.taskId && (
                      <tr key={`${task.taskId}-expand`} className="bg-blue-50/40">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="flex flex-wrap items-end gap-3">
                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
                                Reassign to
                              </label>
                              <select
                                value={reassign[task.taskId] ?? ""}
                                onChange={(e) =>
                                  setReassign((p) => ({ ...p, [task.taskId]: e.target.value }))
                                }
                                className="h-8 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700"
                              >
                                <option value="">Select staff...</option>
                                {staffOptions
                                  .filter((s) => s.department === task.department)
                                  .map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.fullName} ({s.role})
                                    </option>
                                  ))}
                              </select>
                            </div>

                            <div className="flex flex-col gap-1">
                              <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
                                Reason (optional)
                              </label>
                              <input
                                type="text"
                                placeholder="e.g. Staff unavailable"
                                value={reason[task.taskId] ?? ""}
                                onChange={(e) =>
                                  setReason((p) => ({ ...p, [task.taskId]: e.target.value }))
                                }
                                className="h-8 w-56 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 placeholder:text-slate-300"
                              />
                            </div>

                            <div className="flex gap-2">
                              <button
                                disabled={busyTaskId === task.taskId}
                                onClick={() => onReassign(task)}
                                className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                              >
                                Reassign
                              </button>
                              <button
                                disabled={busyTaskId === task.taskId}
                                onClick={() => onOverride(task.taskId, "RELEASE_TO_PENDING")}
                                className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                              >
                                Release
                              </button>
                              <button
                                disabled={busyTaskId === task.taskId}
                                onClick={() => onOverride(task.taskId, "FORCE_COMPLETE")}
                                className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                              >
                                Force Complete
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Staff Monitoring */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Staff Monitoring
          </span>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-2.5 text-left font-medium text-slate-400">Staff</th>
              <th className="px-4 py-2.5 text-left font-medium text-slate-400">Role</th>
              <th className="px-4 py-2.5 text-left font-medium text-slate-400">Assigned</th>
              <th className="px-4 py-2.5 text-left font-medium text-slate-400">Active</th>
              <th className="px-4 py-2.5 text-left font-medium text-slate-400">Completed</th>
              <th className="px-4 py-2.5 text-left font-medium text-slate-400">Workload</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {staffPerf.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  No staff performance data.
                </td>
              </tr>
            ) : (
              staffPerf.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{s.fullName}</td>
                  <td className="px-4 py-2.5 text-slate-500">{s.role}</td>
                  <td className="px-4 py-2.5 text-slate-700">{s.assigned}</td>
                  <td className="px-4 py-2.5 text-slate-700">{s.active}</td>
                  <td className="px-4 py-2.5 text-slate-700">{s.completed}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded px-1.5 py-0.5 font-medium ${
                        s.overloaded
                          ? "bg-amber-50 text-amber-700"
                          : "bg-green-50 text-green-700"
                      }`}
                    >
                      {s.overloaded ? "Overloaded" : "Normal"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
