"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/utils";

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  entityId?: string | null;
  entityType?: string | null;
  createdAt: string;
};

export function NotificationCenter() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    try {
      setLoading(true); setError("");
      const res = await fetch("/api/notifications?limit=50", { cache: "no-store" });
      const json = await res.json();
      if (!json.success) { setError(json.error ?? "Failed to load notifications"); return; }
      setItems(json.data.items);
      setUnreadCount(json.data.unreadCount);
    } catch { setError("Failed to load notifications"); }
    finally { setLoading(false); }
  }

  async function markOneRead(id: string) {
    const current = items.find((item) => item.id === id);
    if (!current || current.isRead) return;
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, isRead: true } : item));
    setUnreadCount((count) => Math.max(0, count - 1));
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" }).catch(() => null);
  }

  async function markAllRead() {
    setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);
    await fetch("/api/notifications/read-all", { method: "PATCH" }).catch(() => null);
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const poll = window.setInterval(refreshVisible, 120_000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-slate-800">Notifications</h1>
          <p className="text-xs text-slate-400 mt-0.5">Assignments, submissions, approvals, rejections.</p>
        </div>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
              {unreadCount} unread
            </span>
          )}
          <button
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="text-xs text-blue-600 hover:underline disabled:text-slate-300 disabled:no-underline"
          >
            Mark all read
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <p className="px-4 py-8 text-center text-xs text-slate-400">Loading...</p>
        ) : error ? (
          <p className="px-4 py-8 text-center text-xs text-red-500">{error}</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-slate-400">No notifications yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => void markOneRead(item.id)}
                className="w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors flex items-start gap-3"
              >
                {!item.isRead && (
                  <span className="mt-1.5 h-2 w-2 min-w-[8px] rounded-full bg-blue-500" />
                )}
                <div className={`flex-1 min-w-0 ${item.isRead ? "pl-5" : ""}`}>
                  <p className={`text-xs ${item.isRead ? "text-slate-500" : "font-semibold text-slate-800"}`}>
                    {item.title}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{item.message}</p>
                  <p className="text-[11px] text-slate-300 mt-0.5">{formatDateTime(item.createdAt)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
