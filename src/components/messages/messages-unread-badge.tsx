"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type ConversationsResponse = {
  success: boolean;
  data?: {
    items: Array<{ unreadCount: number }>;
  };
};

export function MessagesUnreadBadge({ className }: { className?: string }) {
  const [count, setCount] = useState(0);

  async function load() {
    try {
      const res = await fetch("/api/messages/conversations", { cache: "no-store" });
      const json = (await res.json()) as ConversationsResponse;
      if (!json.success) return;
      const total = (json.data?.items ?? []).reduce((sum, item) => sum + (item.unreadCount ?? 0), 0);
      setCount(total);
    } catch {
      // Quietly ignore badge refresh failures.
    }
  }

  useEffect(() => {
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const onMessagesChanged = () => void load();
    const interval = window.setInterval(refresh, 120_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("messages:changed", onMessagesChanged);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("messages:changed", onMessagesChanged);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  if (count <= 0) return null;

  return (
    <span
      className={cn(
        "inline-flex min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-sm",
        className
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
