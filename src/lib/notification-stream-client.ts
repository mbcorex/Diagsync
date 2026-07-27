"use client";

import { useEffect, useRef } from "react";

export type NotificationStreamPayload = {
  unreadCount: number;
  topId: string | null;
  topType: string | null;
  topTitle: string | null;
  topMessage: string | null;
  topIsRead: boolean | null;
};

type Listener = (payload: NotificationStreamPayload) => void;

let source: EventSource | null = null;
const listeners = new Set<Listener>();

function ensureSource() {
  if (source || typeof window === "undefined" || typeof EventSource === "undefined") return;
  source = new EventSource("/api/notifications/stream");
  source.addEventListener("notification", (event) => {
    try {
      const payload = JSON.parse((event as MessageEvent).data) as NotificationStreamPayload;
      listeners.forEach((listener) => listener(payload));
    } catch {
      // ignore malformed payload
    }
  });
  // EventSource retries automatically on drop/close (including the server's
  // periodic connection recycle), so no manual reconnect logic is needed here.
}

function teardownSource() {
  source?.close();
  source = null;
}

/**
 * Subscribes to the app-wide notification SSE stream, sharing a single
 * EventSource connection across every subscriber in the tab.
 */
export function subscribeToNotificationStream(listener: Listener) {
  if (typeof window === "undefined") return () => {};
  listeners.add(listener);
  ensureSource();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) teardownSource();
  };
}

export function useNotificationStream(onEvent: Listener) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    return subscribeToNotificationStream((payload) => handlerRef.current(payload));
  }, []);
}
