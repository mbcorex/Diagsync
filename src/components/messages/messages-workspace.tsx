"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCheck,
  MessageCircle,
  Plus,
  Search,
  Send,
  Users,
  X,
} from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";

type StaffPreview = {
  id: string;
  fullName: string;
  role: string;
  department: string;
  availabilityStatus: string;
};

type ConversationItem = {
  counterpart: StaffPreview;
  lastMessage: {
    id: string;
    body: string;
    createdAt: string;
    isRead: boolean;
    senderId: string;
    recipientId: string;
  };
  unreadCount: number;
};

type ThreadMessage = {
  id: string;
  body: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  senderId: string;
  recipientId: string;
  sender: StaffPreview;
  recipient: StaffPreview;
};

type Props = {
  currentUserId: string;
  currentUserName: string;
};

type ConversationResponse = {
  success: boolean;
  data?: { items: ConversationItem[] };
  error?: string;
};

type StaffListResponse = {
  success: boolean;
  data?: { items: StaffPreview[] };
  error?: string;
};

type ThreadResponse = {
  success: boolean;
  data?: { counterpart: StaffPreview; items: ThreadMessage[] };
  error?: string;
};

function formatRole(role: string) {
  return role.replace(/_/g, " ").toLowerCase();
}

function formatAvailability(status: string) {
  if (status === "AVAILABLE") return "Available";
  if (status === "UNAVAILABLE") return "Away";
  return status.replace(/_/g, " ").toLowerCase();
}

function getAvatarLabel(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function MessagesWorkspace({ currentUserId, currentUserName }: Props) {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [staffList, setStaffList] = useState<StaffPreview[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [counterpart, setCounterpart] = useState<StaffPreview | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [staffLoading, setStaffLoading] = useState(false);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [staffSearch, setStaffSearch] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const currentConversation = useMemo(
    () => conversations.find((item) => item.counterpart.id === selectedStaffId) ?? null,
    [conversations, selectedStaffId]
  );

  const visibleStaff = useMemo(() => {
    const query = staffSearch.trim().toLowerCase();
    if (!query) return staffList;
    return staffList.filter((staff) => {
      const haystack = `${staff.fullName} ${staff.role} ${staff.department} ${staff.availabilityStatus}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [staffList, staffSearch]);

  async function loadConversations() {
    setConversationsLoading(true);
    try {
      const res = await fetch("/api/messages/conversations", { cache: "no-store" });
      const json = (await res.json()) as ConversationResponse;
      if (!json.success) {
        setError(json.error ?? "Failed to load conversations");
        return;
      }
      const items = json.data?.items ?? [];
      setConversations(items);
      setError("");
      setSelectedStaffId((current) => current ?? items[0]?.counterpart.id ?? null);
    } catch {
      setError("Failed to load conversations");
    } finally {
      setConversationsLoading(false);
    }
  }

  async function loadStaffList() {
    if (staffList.length > 0) return;
    setStaffLoading(true);
    try {
      const res = await fetch("/api/messages/staff-list", { cache: "no-store" });
      const json = (await res.json()) as StaffListResponse;
      if (!json.success) {
        setError(json.error ?? "Failed to load staff list");
        return;
      }
      setStaffList(json.data?.items ?? []);
    } catch {
      setError("Failed to load staff list");
    } finally {
      setStaffLoading(false);
    }
  }

  async function loadThread(staffId: string) {
    setThreadLoading(true);
    try {
      const res = await fetch(`/api/messages/thread/${staffId}`, { cache: "no-store" });
      const json = (await res.json()) as ThreadResponse;
      if (!json.success || !json.data) {
        setError(json.error ?? "Failed to load thread");
        return;
      }
      setCounterpart(json.data.counterpart);
      setMessages(json.data.items);
      setError("");
      await fetch("/api/messages/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counterpartId: staffId }),
      }).catch(() => null);
      await loadConversations();
    } catch {
      setError("Failed to load thread");
    } finally {
      setThreadLoading(false);
    }
  }

  async function sendMessage() {
    if (!selectedStaffId || !messageBody.trim()) return;
    setSending(true);
    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: selectedStaffId, body: messageBody.trim() }),
      });
      const json = (await res.json()) as ThreadResponse;
      if (!json.success) {
        setError(json.error ?? "Failed to send message");
        return;
      }
      setMessageBody("");
      await loadThread(selectedStaffId);
      await loadConversations();
    } catch {
      setError("Failed to send message");
    } finally {
      setSending(false);
    }
  }

  function startNewMessage(staff: StaffPreview) {
    setSelectedStaffId(staff.id);
    setCounterpart(staff);
    setMessages([]);
    setStaffSearch("");
    setShowNewMessage(false);
  }

  useEffect(() => {
    void loadConversations();
  }, []);

  useEffect(() => {
    if (showNewMessage) {
      void loadStaffList();
    }
  }, [showNewMessage]);

  useEffect(() => {
    if (!selectedStaffId) {
      setCounterpart(null);
      setMessages([]);
      return;
    }
    void loadThread(selectedStaffId);
    const interval = window.setInterval(() => {
      void loadThread(selectedStaffId);
    }, 10_000);
    return () => window.clearInterval(interval);
  }, [selectedStaffId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, selectedStaffId]);

  const threadSelected = Boolean(selectedStaffId);

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] bg-[linear-gradient(135deg,#d7f3e7_0%,#f0f2f5_45%,#e7efff_100%)] p-2 sm:p-4">
      <div className="mx-auto flex h-[calc(100dvh-4.5rem)] max-w-[1600px] overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.12)]">
        <aside
          className={cn(
            "flex h-full w-full flex-col border-r border-slate-200 bg-[#f7f8fa] lg:w-[390px]",
            threadSelected ? "hidden lg:flex" : "flex"
          )}
        >
          <div className="border-b border-slate-200 bg-blue-50 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-600">Messages</p>
                <h1 className="mt-1 text-lg font-semibold text-slate-900">Staff chat</h1>
                <p className="text-xs text-slate-500">Direct messages across your organization</p>
                <p className="mt-1 text-[11px] text-slate-400">Signed in as {currentUserName}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewMessage(true)}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                New Message
              </button>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={staffSearch}
                onChange={(e) => setStaffSearch(e.target.value)}
                placeholder="Search chats"
                className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {conversationsLoading ? (
              <div className="px-4 py-10 text-center text-sm text-slate-400">Loading conversations...</div>
            ) : conversations.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <MessageCircle className="h-8 w-8" />
                </div>
                <p className="mt-4 text-sm font-semibold text-slate-800">No conversations yet</p>
                <p className="mt-1 text-xs text-slate-500">Start a new message to begin chatting with staff.</p>
                <button
                  type="button"
                  onClick={() => setShowNewMessage(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  Start Chat
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-200/80">
                {conversations
                  .filter((item) => {
                    const query = staffSearch.trim().toLowerCase();
                    if (!query) return true;
                    const haystack = `${item.counterpart.fullName} ${item.counterpart.role} ${item.counterpart.department}`.toLowerCase();
                    return haystack.includes(query);
                  })
                  .map((item) => {
                    const active = item.counterpart.id === selectedStaffId;
                    const initial = getAvatarLabel(item.counterpart.fullName);
                    return (
                      <button
                        key={item.counterpart.id}
                        type="button"
                        onClick={() => setSelectedStaffId(item.counterpart.id)}
                        className={cn(
                          "flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors",
                          active ? "bg-blue-50/80" : "hover:bg-white"
                        )}
                      >
                        <div className="relative mt-0.5">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-sky-500 text-sm font-bold text-white shadow-sm">
                            {initial || "?"}
                          </div>
                          <span
                            className={cn(
                              "absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white",
                              item.counterpart.availabilityStatus === "AVAILABLE" ? "bg-blue-500" : "bg-slate-300"
                            )}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900">{item.counterpart.fullName}</p>
                            <span className="shrink-0 text-[11px] text-slate-400">
                              {formatDateTime(item.lastMessage.createdAt)}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500">
                            {formatRole(item.counterpart.role)} · {item.counterpart.department}
                          </p>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <p className="truncate text-xs text-slate-600">{item.lastMessage.body}</p>
                            {item.unreadCount > 0 ? (
                              <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-blue-500 px-2 py-0.5 text-[11px] font-bold text-white">
                                {item.unreadCount > 99 ? "99+" : item.unreadCount}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        </aside>

        <section
          className={cn(
            "flex h-full flex-1 flex-col bg-[#efeae2]",
            threadSelected ? "flex" : "hidden lg:flex"
          )}
          style={{
            backgroundImage:
              "radial-gradient(circle at 20px 20px, rgba(255,255,255,0.6) 2px, transparent 0), radial-gradient(circle at 60px 60px, rgba(255,255,255,0.34) 1px, transparent 0)",
            backgroundSize: "80px 80px, 100px 100px",
          }}
        >
          <div className="flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedStaffId(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 lg:hidden"
                aria-label="Back to conversations"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-sky-500 text-sm font-bold text-white shadow-sm">
                {getAvatarLabel(counterpart?.fullName ?? currentConversation?.counterpart.fullName ?? "Chat") || ""}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {counterpart?.fullName ?? currentConversation?.counterpart.fullName ?? "Select a conversation"}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {counterpart
                    ? `${formatRole(counterpart.role)} · ${counterpart.department}`
                    : currentConversation
                      ? `${formatRole(currentConversation.counterpart.role)} · ${currentConversation.counterpart.department}`
                      : "Open a staff chat to start messaging"}
                </p>
              </div>
            </div>
            <div className="hidden items-center gap-3 md:flex">
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                <span className={cn("h-2 w-2 rounded-full", counterpart?.availabilityStatus === "AVAILABLE" ? "bg-blue-500" : "bg-slate-300")} />
                {counterpart ? formatAvailability(counterpart.availabilityStatus) : "Messages"}
              </span>
              <Link
                href="/dashboard/messages"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                <Users className="h-3.5 w-3.5" />
                Directory
              </Link>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
            {!selectedStaffId ? (
              <div className="flex h-full items-center justify-center">
                <div className="max-w-md rounded-[28px] border border-white/70 bg-white/90 p-8 text-center shadow-xl backdrop-blur">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <MessageCircle className="h-8 w-8" />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold text-slate-900">Choose a conversation</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    Open a staff thread from the left pane, or start a new chat with someone in your organization.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowNewMessage(true)}
                    className="mt-5 inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4" />
                    New message
                  </button>
                </div>
              </div>
            ) : threadLoading && messages.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading thread...</div>
            ) : (
              <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
                {messages.map((message) => {
                  const mine = message.senderId === currentUserId;
                  return (
                    <div key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}> 
                      <div
                        className={cn(
                          "max-w-[88%] rounded-3xl px-4 py-2.5 shadow-sm sm:max-w-[72%]",
                          mine
                            ? "rounded-br-md bg-blue-600 text-white"
                            : "rounded-bl-md bg-white text-slate-900"
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p>
                        <div className={cn("mt-1 flex items-center justify-end gap-1 text-[11px]", mine ? "text-blue-100" : "text-slate-500")}>
                          <span>{formatDateTime(message.createdAt)}</span>
                          {mine ? <CheckCheck className="h-3.5 w-3.5 text-blue-100" /> : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 bg-white/95 px-3 py-3 backdrop-blur sm:px-4">
            <div className="mx-auto flex max-w-5xl items-end gap-2 rounded-[26px] border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <button
                type="button"
                onClick={() => setShowNewMessage(true)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100"
                aria-label="Start new chat"
              >
                <Plus className="h-4 w-4" />
              </button>
              <textarea
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder={selectedStaffId ? "Type a message" : "Select a staff member first"}
                rows={1}
                disabled={!selectedStaffId}
                className="min-h-10 max-h-32 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed"
              />
              <button
                type="button"
                onClick={() => void sendMessage()}
                disabled={!selectedStaffId || sending || !messageBody.trim()}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            {error ? <p className="mx-auto mt-2 max-w-5xl text-xs text-red-600">{error}</p> : null}
            <p className="mx-auto mt-1 max-w-5xl text-[11px] text-slate-400">
              Messages are visible to staff in your organization only.
            </p>
          </div>
        </section>
      </div>

      {showNewMessage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-3 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-blue-50 px-4 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-600">New message</p>
                <h3 className="mt-1 text-base font-semibold text-slate-900">Start a staff chat</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewMessage(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                  placeholder="Search staff by name, role, or department"
                  className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                />
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {staffLoading ? (
                <div className="px-4 py-8 text-center text-sm text-slate-400">Loading staff...</div>
              ) : visibleStaff.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-400">No staff match your search.</div>
              ) : (
                <div className="space-y-1">
                  {visibleStaff.map((staff) => {
                    const initial = getAvatarLabel(staff.fullName);
                    return (
                      <button
                        key={staff.id}
                        type="button"
                        onClick={() => startNewMessage(staff)}
                        className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-slate-50"
                      >
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-sky-500 text-sm font-bold text-white">
                          {initial || "?"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900">{staff.fullName}</p>
                            <span className="shrink-0 text-[11px] text-slate-400">{formatAvailability(staff.availabilityStatus)}</span>
                          </div>
                          <p className="truncate text-xs text-slate-500">
                            {formatRole(staff.role)} · {staff.department}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}



