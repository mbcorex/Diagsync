"use client";

import { useEffect, useState } from "react";
import { getOfflinePendingCount } from "@/lib/offline-sync";

export function OfflineStatusBar() {
  const [isOnline, setIsOnline] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const sync = () => {
      setIsOnline(navigator.onLine);
      setPending(getOfflinePendingCount());
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    window.addEventListener("storage", sync);
    const timer = window.setInterval(sync, 30000);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener("storage", sync);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div
      className={`border-b px-4 py-2 text-xs ${
        isOnline
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-200"
          : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200"
      }`}
    >
      {isOnline ? (
        <span>Online{pending > 0 ? ` - syncing ${pending} pending action${pending > 1 ? "s" : ""}...` : ""}</span>
      ) : (
        <span>Offline (Saving locally...)</span>
      )}
    </div>
  );
}
