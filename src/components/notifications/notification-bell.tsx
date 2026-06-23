"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import {
  getExistingPushSubscription,
  isPushSupported,
  subscribeToDevicePush,
  syncPushSubscriptionWithServer,
} from "@/lib/push-client";

type NotificationItem = {
  id: string; type: string; title: string; message: string;
  isRead: boolean; entityId?: string | null; entityType?: string | null; createdAt: string;
};
type NotificationResponse = { items: NotificationItem[]; unreadCount: number; nextCursor: string | null };

function roleNotificationPath(role: string) {
  if (role === "RECEPTIONIST") return "/dashboard/receptionist/notifications";
  if (role === "LAB_SCIENTIST") return "/dashboard/lab-scientist/notifications";
  if (role === "RADIOGRAPHER") return "/dashboard/radiographer/notifications";
  if (role === "MD") return "/dashboard/md/notifications";
  return "/dashboard/hrm/notifications";
}

export function NotificationBell({ role }: { role: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<NotificationResponse>({ items: [], unreadCount: 0, nextCursor: null });
  const ref = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const playedAlertIdsRef = useRef<Set<string>>(new Set());
  const pendingVitalIdsRef = useRef<Set<string>>(new Set());
  const pendingCallIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastLoadAtRef = useRef(0);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushError, setPushError] = useState("");

  function isVitalNotification(item: NotificationItem) {
    const alwaysVital = new Set([
      "TASK_ASSIGNED",
      "RESULT_SUBMITTED",
      "RESULT_REJECTED",
      "RESULT_EDITED",
      "REPORT_READY_FOR_REVIEW",
      "REPORT_SEND_FAILED",
      "TASK_DELAYED",
      "TASK_REASSIGNED",
      "TASK_OVERRIDDEN",
    ]);
    if (alwaysVital.has(item.type)) return true;
    if (item.type !== "SYSTEM") return false;

    const title = (item.title ?? "").toLowerCase();
    const message = (item.message ?? "").toLowerCase();
    if (title.includes("new consultation patient")) return true; // MD
    if (title.includes("patient requested by md")) return true; // Receptionist bring-in
    if (title.includes("md wants to see you")) return true; // Staff urgent call
    if (title.includes("consultation time up")) return true; // MD timeout alert
    if (message.includes("bring in")) return true;
    if (message.includes("requested") && message.includes("support")) return true;
    if (message.includes("other patients may be waiting")) return true;
    return false;
  }

  function isCallNotification(item: NotificationItem) {
    const title = (item.title ?? "").toLowerCase();
    const message = (item.message ?? "").toLowerCase();
    if (title.includes("wants to see you")) return true;
    if (title.includes("patient requested by md")) return true;
    if (message.includes("please report now")) return true;
    if (message.includes("bring in") && message.includes("consultation")) return true;
    return false;
  }

  function playAlertTone(kind: "vital" | "call") {
    try {
      const AudioCtor =
        typeof window !== "undefined"
          ? ((window as any).AudioContext || (window as any).webkitAudioContext)
          : null;
      if (!AudioCtor) return;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtor();
      }
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === "suspended") {
        void ctx.resume();
      }
      if (ctx.state !== "running") return;

      const start = ctx.currentTime + 0.01;
      const scheduleBeep = (
        at: number,
        duration: number,
        frequency: number,
        wave: OscillatorType = "square",
        peakGain = 0.75,
      ) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = wave;
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(peakGain, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(at);
        osc.stop(at + duration);
      };
      const scheduleBell = (at: number, baseFrequency: number) => {
        // Layered high-pitch bell partials for sharper call alert audibility.
        scheduleBeep(at, 0.28, baseFrequency, "triangle", 0.98);
        scheduleBeep(at, 0.22, baseFrequency * 1.5, "sine", 0.62);
        scheduleBeep(at, 0.18, baseFrequency * 2.2, "sine", 0.42);
      };
      if (kind === "call") {
        const schedulePair = (at: number) => {
          scheduleBell(at, 2100);
          scheduleBell(at + 0.34, 2300);
        };
        schedulePair(start); // ding ding
        schedulePair(start + 0.82); // ding ding
        schedulePair(start + 1.64); // ding ding
      } else {
        scheduleBeep(start, 0.22, 950, "square");
        scheduleBeep(start + 0.28, 0.22, 1150, "square");
        scheduleBeep(start + 0.56, 0.28, 950, "square");
        const repeat = start + 1.05;
        scheduleBeep(repeat, 0.22, 950, "square");
        scheduleBeep(repeat + 0.28, 0.22, 1150, "square");
        scheduleBeep(repeat + 0.56, 0.28, 950, "square");
      }
      return true;
    } catch {
      // best-effort only
      return false;
    }
  }

  function enqueuePendingVital(ids: string[]) {
    for (const id of ids) {
      if (!id || playedAlertIdsRef.current.has(id)) continue;
      pendingVitalIdsRef.current.add(id);
    }
  }

  function enqueuePendingCall(ids: string[]) {
    for (const id of ids) {
      if (!id || playedAlertIdsRef.current.has(id)) continue;
      pendingCallIdsRef.current.add(id);
    }
  }

  function flushPendingVitalAlerts() {
    if (pendingCallIdsRef.current.size > 0) {
      const callOk = playAlertTone("call");
      if (callOk) {
        for (const id of Array.from(pendingCallIdsRef.current)) {
          playedAlertIdsRef.current.add(id);
        }
        pendingCallIdsRef.current.clear();
      }
    }

    if (pendingVitalIdsRef.current.size === 0) return;
    const ok = playAlertTone("vital");
    if (!ok) return;
    for (const id of Array.from(pendingVitalIdsRef.current)) {
      playedAlertIdsRef.current.add(id);
    }
    pendingVitalIdsRef.current.clear();
  }

  function unlockAudio() {
    try {
      const AudioCtor =
        typeof window !== "undefined"
          ? ((window as any).AudioContext || (window as any).webkitAudioContext)
          : null;
      if (!AudioCtor) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtor();
      }
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === "suspended") {
        void ctx.resume().finally(() => {
          flushPendingVitalAlerts();
        });
      } else {
        flushPendingVitalAlerts();
      }
    } catch {
      // ignore
    }
  }

  async function load(force = false) {
    if (!force && typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const nowTs = Date.now();
    if (!force && nowTs - lastLoadAtRef.current < 3000) return;
    lastLoadAtRef.current = nowTs;
    try {
      setLoading(true); setError("");
      const res = await fetch("/api/notifications?limit=10", { cache: "no-store" });
      const json = await res.json();
      if (!json.success) { setError(json.error ?? "Failed"); return; }
      const nextData = json.data as NotificationResponse;
      const newItems = nextData.items.filter((item) => !seenIdsRef.current.has(item.id));
      const callUnreadIds = newItems
        .filter((item) => !item.isRead && isCallNotification(item))
        .map((item) => item.id);
      const vitalNewUnreadIds = newItems
        .filter((item) => !item.isRead && !isCallNotification(item) && isVitalNotification(item))
        .map((item) => item.id);
      if (initializedRef.current && (callUnreadIds.length > 0 || vitalNewUnreadIds.length > 0)) {
        const callUnplayed = callUnreadIds.filter((id) => !playedAlertIdsRef.current.has(id));
        const vitalUnplayed = vitalNewUnreadIds.filter((id) => !playedAlertIdsRef.current.has(id));
        if (callUnplayed.length > 0) {
          enqueuePendingCall(callUnplayed);
        }
        if (vitalUnplayed.length > 0) {
          enqueuePendingVital(vitalUnplayed);
        }
        flushPendingVitalAlerts();
      }
      for (const item of nextData.items) {
        seenIdsRef.current.add(item.id);
      }
      if (seenIdsRef.current.size > 500) {
        const trimmed = Array.from(seenIdsRef.current).slice(-350);
        seenIdsRef.current = new Set(trimmed);
      }
      initializedRef.current = true;
      setData(nextData);
    } catch { setError("Failed to load"); }
    finally { setLoading(false); }
  }

  async function markOneRead(id: string) {
    const target = data.items.find((item) => item.id === id);
    if (!target || target.isRead) return;
    setData((prev) => ({ ...prev, unreadCount: Math.max(0, prev.unreadCount - 1), items: prev.items.map((item) => item.id === id ? { ...item, isRead: true } : item) }));
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" }).catch(() => null);
  }

  async function markAllRead() {
    setData((prev) => ({ ...prev, unreadCount: 0, items: prev.items.map((item) => ({ ...item, isRead: true })) }));
    await fetch("/api/notifications/read-all", { method: "PATCH" }).catch(() => null);
  }

  async function refreshPushStatus(opts?: { keepError?: boolean }) {
    try {
      if (!isPushSupported()) {
        setPushSupported(false);
        setPushError("");
        return;
      }
      setPushSupported(true);
      setPushPermission(Notification.permission);
      const sub = await getExistingPushSubscription();
      if (!sub) {
        setPushEnabled(false);
        if (!opts?.keepError) setPushError("");
        return;
      }
      const sync = await syncPushSubscriptionWithServer(sub);
      if (sync.ok) {
        setPushEnabled(true);
        setPushError("");
        return;
      }
      setPushEnabled(false);
      const syncDetail = "detail" in sync ? sync.detail : "";
      if (sync.reason === "network_timeout") {
        setPushError("Could not verify device subscription (network timeout).");
        return;
      }
      if (sync.reason === "unauthorized") {
        setPushError(syncDetail || "Session expired. Sign in again and retry.");
        return;
      }
      if (sync.reason === "storage_not_ready") {
        setPushError(
          syncDetail ||
            "Push database storage is not ready on server. Run production DB sync."
        );
        return;
      }
      setPushError("Device subscription exists, but server registration failed.");
    } catch {
      setPushEnabled(false);
      setPushError("Could not verify push status right now.");
    }
  }

  function getPushEnableErrorMessage(
    reason:
      | "missing_public_key"
      | "server_rejected_subscription"
      | "permission_denied"
      | "unsupported"
      | "network_timeout"
      | "unauthorized"
      | "storage_not_ready"
      | "service_worker_timeout"
      | "service_worker_register_failed"
      | "subscribe_timeout"
      | "subscribe_failed"
  ) {
    if (reason === "missing_public_key") return "Push keys are missing on server.";
    if (reason === "server_rejected_subscription") return "Server rejected device subscription.";
    if (reason === "permission_denied") return "Browser notification permission was denied.";
    if (reason === "network_timeout") return "Network timed out while enabling push notifications.";
    if (reason === "unauthorized") return "Session expired. Sign in again and retry.";
    if (reason === "storage_not_ready") return "Push storage not ready on server. Run production DB sync.";
    if (reason === "service_worker_timeout") return "Service worker setup timed out. Reload and try again.";
    if (reason === "service_worker_register_failed") return "Service worker could not register on this browser.";
    if (reason === "subscribe_timeout") return "Browser subscription timed out. Try again.";
    if (reason === "subscribe_failed") return "Browser could not create push subscription.";
    if (reason === "unsupported") return "This browser does not support push notifications.";
    return "Could not enable device notifications.";
  }

  async function enableDevicePush() {
    setPushLoading(true);
    setPushError("");
    let enabled = false;
    try {
      const result = await subscribeToDevicePush();
      setPushPermission(Notification.permission);
      if (result.ok) {
        enabled = true;
        setPushEnabled(true);
        setPushError("");
      } else {
        setPushEnabled(false);
        setPushError(getPushEnableErrorMessage(result.reason));
      }
    } catch {
      setPushEnabled(false);
      setPushError("Could not enable device notifications right now.");
    } finally {
      setPushLoading(false);
      await refreshPushStatus({ keepError: !enabled });
    }
  }

  useEffect(() => { void load(true); }, []);
  useEffect(() => { void refreshPushStatus(); }, []);

  useEffect(() => {
    const onUserGesture = () => {
      unlockAudio();
    };
    window.addEventListener("pointerdown", onUserGesture, { passive: true });
    window.addEventListener("keydown", onUserGesture);
    window.addEventListener("touchstart", onUserGesture, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", onUserGesture);
      window.removeEventListener("keydown", onUserGesture);
      window.removeEventListener("touchstart", onUserGesture);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const poll = window.setInterval(refreshVisible, 120_000);
    const onVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        void load(true);
      }
    };
    window.addEventListener("focus", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("focus", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
    };
  }, []);

  useEffect(() => {
    const visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        void load(true);
        flushPendingVitalAlerts();
      }
    };
    document.addEventListener("visibilitychange", visibilityHandler);
    return () => {
      document.removeEventListener("visibilitychange", visibilityHandler);
    };
  }, []);

  const unreadBadge = useMemo(() => {
    if (data.unreadCount <= 0) return null;
    return data.unreadCount > 99 ? "99+" : String(data.unreadCount);
  }, [data.unreadCount]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative flex h-8 w-8 items-center justify-center rounded hover:bg-slate-100 transition-colors"
      >
        <Bell className="h-4 w-4 text-slate-500" />
        {unreadBadge && (
          <span className="absolute -right-0.5 -top-0.5 rounded-full bg-red-500 px-1 py-px text-[9px] font-bold text-white leading-none">
            {unreadBadge}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed left-2 right-2 top-14 z-50 max-h-[calc(100dvh-4rem)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-1 sm:max-h-none sm:w-80">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-700">Notifications</span>
              {data.unreadCount > 0 && (
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">{data.unreadCount} unread</span>
              )}
            </div>
            <button onClick={markAllRead} disabled={data.unreadCount === 0}
              className="text-[11px] text-blue-600 hover:underline disabled:text-slate-300">
              Mark all read
            </button>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <p className="px-3 py-4 text-xs text-slate-400">Loading...</p>
            ) : error ? (
              <p className="px-3 py-4 text-xs text-red-500">{error}</p>
            ) : data.items.length === 0 ? (
              <p className="px-3 py-4 text-xs text-slate-400">No notifications yet.</p>
            ) : (
              data.items.map((item) => (
                <button key={item.id} onClick={() => void markOneRead(item.id)}
                  className="w-full px-3 py-2.5 text-left hover:bg-slate-50 transition-colors flex items-start gap-2">
                  {!item.isRead && <span className="mt-1.5 h-1.5 w-1.5 min-w-[6px] rounded-full bg-blue-500" />}
                  <div className={!item.isRead ? "" : "pl-3.5"}>
                    <p className={`text-xs ${item.isRead ? "text-slate-500" : "font-medium text-slate-800"}`}>{item.title}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">{item.message}</p>
                    <p className="text-[10px] text-slate-300 mt-0.5">{formatDateTime(item.createdAt)}</p>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          {pushSupported && (
            <div className="border-t border-slate-100 px-3 py-2">
              {pushEnabled ? (
                <p className="text-[11px] text-emerald-600">Device alerts enabled for this browser.</p>
              ) : pushPermission === "denied" ? (
                <p className="text-[11px] text-amber-600">Device alerts blocked in browser settings.</p>
              ) : (
                <div className="space-y-1">
                  <button
                    onClick={() => void enableDevicePush()}
                    disabled={pushLoading}
                    className="text-xs text-blue-600 hover:underline disabled:text-slate-400"
                  >
                    {pushLoading ? "Enabling..." : "Enable device notifications"}
                  </button>
                  {pushError ? <p className="text-[10px] text-rose-600">{pushError}</p> : null}
                </div>
              )}
            </div>
          )}
          <div className="border-t border-slate-100 px-3 py-2">
            <Link href={roleNotificationPath(role)} className="text-xs text-blue-600 hover:underline">
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

