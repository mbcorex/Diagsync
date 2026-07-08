"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Activity,
  BarChart3,
  Bell,
  ClipboardList,
  MessageCircle,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Scan,
  Settings2,
  Stethoscope,
  TestTube2,
  UserPlus,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Role } from "@prisma/client";
import { MessagesUnreadBadge } from "@/components/messages/messages-unread-badge";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavConfig = {
  primary: NavItem[];
  more: NavItem[];
};

const navByRole: Record<Role, NavConfig> = {
  SUPER_ADMIN: {
    primary: [
      { label: "Overview", href: "/dashboard/hrm", icon: LayoutDashboard },
      { label: "Patients", href: "/dashboard/receptionist/patients", icon: Users },
      { label: "Tasks", href: "/dashboard/hrm/operations", icon: Activity },
      { label: "Reports", href: "/dashboard/hrm/release", icon: FileText },
      { label: "Messages", href: "/dashboard/messages", icon: MessageCircle },

    ],
    more: [
      { label: "Insights", href: "/dashboard", icon: LayoutDashboard },
      { label: "Insights Reports", href: "/insights/reports", icon: BarChart3 },
      { label: "Lab Settings", href: "/dashboard/hrm/settings", icon: Settings2 },
      { label: "Consultations", href: "/dashboard/hrm/consultation", icon: Stethoscope },
      { label: "Review Queue", href: "/dashboard/md/review", icon: ClipboardList },
      { label: "Staff Management", href: "/dashboard/hrm/staff", icon: Users },
      { label: "Add Staff", href: "/dashboard/hrm/staff/new", icon: UserPlus },
      { label: "Test Catalog", href: "/dashboard/hrm/tests", icon: TestTube2 },
      { label: "Audit Log", href: "/dashboard/hrm/audit", icon: ClipboardList },
      { label: "Analytics", href: "/dashboard/hrm/analytics", icon: BarChart3 },
      { label: "Billing", href: "/dashboard/billing", icon: CreditCard },
      { label: "Notifications", href: "/dashboard/hrm/notifications", icon: Bell },
    ],
  },
  INVENTORY_MANAGER: {
    primary: [
      { label: "Inventory", href: "/dashboard/hrm/inventory", icon: LayoutDashboard },
      { label: "Reports", href: "/dashboard/hrm/inventory", icon: FileText },
      { label: "Alerts", href: "/dashboard/hrm/inventory", icon: Bell },
      { label: "Stock", href: "/dashboard/hrm/inventory", icon: Activity },
      { label: "Messages", href: "/dashboard/messages", icon: MessageCircle },

    ],
    more: [
      { label: "Billing", href: "/dashboard/billing", icon: CreditCard },
      { label: "Notifications", href: "/dashboard/hrm/notifications", icon: Bell },
    ],
  },
  HRM: {
    primary: [
      { label: "Overview", href: "/dashboard/hrm", icon: LayoutDashboard },
      { label: "Patients", href: "/dashboard/receptionist/patients", icon: Users },
      { label: "Tasks", href: "/dashboard/hrm/operations", icon: Activity },
      { label: "Reports", href: "/dashboard/hrm/release", icon: FileText },
      { label: "Messages", href: "/dashboard/messages", icon: MessageCircle },

    ],
    more: [
      { label: "Insights", href: "/dashboard", icon: LayoutDashboard },
      { label: "Insights Reports", href: "/insights/reports", icon: BarChart3 },
      { label: "Consultations", href: "/dashboard/hrm/consultation", icon: Stethoscope },
      { label: "Review Queue", href: "/dashboard/md/review", icon: ClipboardList },
      { label: "Staff Management", href: "/dashboard/hrm/staff", icon: Users },
      { label: "Add Staff", href: "/dashboard/hrm/staff/new", icon: UserPlus },
      { label: "Test Catalog", href: "/dashboard/hrm/tests", icon: TestTube2 },
      { label: "Audit Log", href: "/dashboard/hrm/audit", icon: ClipboardList },
      { label: "Analytics", href: "/dashboard/hrm/analytics", icon: BarChart3 },
      { label: "Billing", href: "/dashboard/billing", icon: CreditCard },
      { label: "Notifications", href: "/dashboard/hrm/notifications", icon: Bell },
    ],
  },
  RECEPTIONIST: {
    primary: [
      { label: "Dashboard", href: "/dashboard/receptionist", icon: LayoutDashboard },
      { label: "Patients", href: "/dashboard/receptionist/patients", icon: Users },
      { label: "Tasks", href: "/dashboard/receptionist/consultation", icon: ClipboardList },
      { label: "Reports", href: "/dashboard/receptionist/release", icon: FileText },
      { label: "Messages", href: "/dashboard/messages", icon: MessageCircle },

    ],
    more: [
      { label: "New Patient", href: "/dashboard/receptionist/new-patient", icon: UserPlus },
      { label: "Billing", href: "/dashboard/billing", icon: CreditCard },
      { label: "Notifications", href: "/dashboard/receptionist/notifications", icon: Bell },
    ],
  },
  LAB_SCIENTIST: {
    primary: [
      { label: "Dashboard", href: "/dashboard/lab-scientist", icon: LayoutDashboard },
      { label: "Patients", href: "/dashboard/lab-scientist/results", icon: Users },
      { label: "Tasks", href: "/dashboard/lab-scientist/queue", icon: ClipboardList },
      { label: "Reports", href: "/dashboard/lab-scientist/results", icon: FileText },
      { label: "Messages", href: "/dashboard/messages", icon: MessageCircle },

    ],
    more: [
      { label: "Billing", href: "/dashboard/billing", icon: CreditCard },
      { label: "Notifications", href: "/dashboard/lab-scientist/notifications", icon: Bell },
    ],
  },
  RADIOGRAPHER: {
    primary: [
      { label: "Dashboard", href: "/dashboard/radiographer", icon: LayoutDashboard },
      { label: "Patients", href: "/dashboard/radiographer/reports", icon: Users },
      { label: "Tasks", href: "/dashboard/radiographer/queue", icon: Scan },
      { label: "Reports", href: "/dashboard/radiographer/reports", icon: FileText },
      { label: "Messages", href: "/dashboard/messages", icon: MessageCircle },

    ],
    more: [
      { label: "Billing", href: "/dashboard/billing", icon: CreditCard },
      { label: "Notifications", href: "/dashboard/radiographer/notifications", icon: Bell },
    ],
  },
  MD: {
    primary: [
      { label: "Review", href: "/dashboard/md/review", icon: ClipboardList },
      { label: "Patients", href: "/dashboard/receptionist/patients", icon: Users },
      { label: "Tasks", href: "/dashboard/md/consultation", icon: Stethoscope },
      { label: "Reports", href: "/dashboard/md/reports", icon: FileText },
      { label: "Messages", href: "/dashboard/messages", icon: MessageCircle },

    ],
    more: [
      { label: "Insights", href: "/dashboard", icon: LayoutDashboard },
      { label: "Insights Reports", href: "/insights/reports", icon: BarChart3 },
      { label: "Consultation", href: "/dashboard/md/consultation", icon: Stethoscope },
      { label: "Approved", href: "/dashboard/md/approved", icon: ClipboardList },
      { label: "Billing", href: "/dashboard/billing", icon: CreditCard },
      { label: "Notifications", href: "/dashboard/md/notifications", icon: Bell },
    ],
  },
  MEGA_ADMIN: { primary: [], more: [] },
};

export function MobileBottomNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const config = navByRole[role];
  const isActivePath = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const moreActive = useMemo(
    () => config.more.some((item) => isActivePath(item.href)),
    [config.more, pathname]
  );

  if (!config || config.primary.length === 0) return null;

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 shadow-[0_-2px_10px_rgba(15,23,42,0.06)] backdrop-blur dark:border-neutral-800 dark:bg-black/95 dark:shadow-[0_-2px_10px_rgba(0,0,0,0.5)] md:hidden">
        <ul
          className="grid grid-cols-6 pt-1"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)",
          }}
        >
          {config.primary.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex min-h-[58px] flex-col items-center justify-center gap-1 px-1 text-[11px] ${
                    active ? "text-blue-600" : "text-slate-500 dark:text-neutral-400"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? "text-blue-600" : "text-slate-400 dark:text-neutral-500"}`} />
                  <span className="flex items-center gap-1.5 font-medium">
                    <span>{item.label}</span>
                    {item.href === "/dashboard/messages" ? <MessagesUnreadBadge /> : null}
                  </span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={`flex min-h-[58px] w-full flex-col items-center justify-center gap-1 px-1 text-[11px] ${
                moreOpen || moreActive ? "text-blue-600" : "text-slate-500 dark:text-neutral-400"
              }`}
            >
              <MoreHorizontal className={`h-4 w-4 ${moreOpen || moreActive ? "text-blue-600" : "text-slate-400 dark:text-neutral-500"}`} />
              <span className="font-medium">More</span>
            </button>
          </li>
        </ul>
      </nav>

      {moreOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close more menu"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-slate-900/35 dark:bg-black/55"
          />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-slate-200 bg-white p-4 shadow-2xl dark:border-neutral-800 dark:bg-black"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
          >
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-200 dark:bg-neutral-700" />
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">More</p>
            <div className="grid grid-cols-1 gap-1">
              {config.more.map((item) => {
                const Icon = item.icon;
                const active = isActivePath(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${
                      active
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                        : "text-slate-700 hover:bg-slate-50 dark:text-neutral-200 dark:hover:bg-neutral-900"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="mt-1 flex items-center gap-2 rounded-lg border border-red-100 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/40"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}


