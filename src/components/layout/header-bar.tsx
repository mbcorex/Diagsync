"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, MessageCircle } from "lucide-react";
import { Switch } from "@/components/ui/index";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { MessagesUnreadBadge } from "@/components/messages/messages-unread-badge";
import { DeviceAccountMenu } from "@/components/device/device-account-menu";
import { Role } from "@prisma/client";
import { ThemeToggle } from "@/components/layout/theme-toggle";

interface HeaderBarProps {
  staffId: string;
  staffName: string;
  staffEmail: string;
  role: Role;
  organizationId: string;
  initialAvailability: boolean;
  showAvailabilityToggle?: boolean;
  onOpenSidebar?: () => void;
}

export function HeaderBar({
  staffId,
  staffName,
  staffEmail,
  role,
  organizationId,
  initialAvailability,
  showAvailabilityToggle = true,
  onOpenSidebar,
}: HeaderBarProps) {
  const [isAvailable, setIsAvailable] = useState(initialAvailability);
  const [loading, setLoading] = useState(false);

  const operationalRoles = ["LAB_SCIENTIST", "RADIOGRAPHER", "MD", "RECEPTIONIST"];
  const showToggle = showAvailabilityToggle && operationalRoles.includes(role);

  async function handleAvailabilityToggle(checked: boolean) {
    setLoading(true);
    try {
      const res = await fetch(`/api/staff/${staffId}/availability`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: checked ? "AVAILABLE" : "UNAVAILABLE" }),
      });
      const data = await res.json();
      if (data.success) setIsAvailable(checked);
    } catch (error) {
      console.error("Failed to update availability:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <header className="flex h-12 items-center justify-between border-b border-slate-200 bg-white px-3 sm:px-4 md:px-5">
      <div className="flex items-center gap-2">
        {onOpenSidebar ? (
          <button
            type="button"
            aria-label="Open menu"
            onClick={onOpenSidebar}
            className="inline-flex h-8 w-8 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-50 md:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
        ) : null}
        <p className="text-sm text-slate-500">
        {getTimeOfDay()},{" "}
        <span className="font-semibold text-slate-800">{staffName.split(" ")[0]}</span>
      </p>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        {showToggle && (
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                isAvailable ? "bg-green-500" : "bg-slate-300"
              )}
            />
            <span className="text-xs text-slate-500">
              {isAvailable ? "Available" : "Unavailable"}
            </span>
            <Switch
              checked={isAvailable}
              onCheckedChange={handleAvailabilityToggle}
              disabled={loading}
              aria-label="Toggle availability"
            />
          </div>
        )}
        <Link
          href="/dashboard/messages"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50"
          aria-label="Messages"
        >
          <MessageCircle className="h-4 w-4" />
          <MessagesUnreadBadge className="absolute -right-1 -top-1" />
        </Link>
        <NotificationBell role={role} />
        <ThemeToggle />
        <DeviceAccountMenu
          staffId={staffId}
          staffName={staffName}
          staffEmail={staffEmail}
          role={role}
          organizationId={organizationId}
        />
      </div>
    </header>
  );
}

function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}




