"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  ClipboardList,
  FlaskConical,
  Scan,
  Stethoscope,
  BarChart3,
  Bell,
  LogOut,
  Activity,
  TestTube2,
  Settings2,
  CreditCard,
  Package,
} from "lucide-react";
import { cn, ROLE_LABELS } from "@/lib/utils";
import { Role } from "@prisma/client";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const navByRole: Record<string, NavItem[]> = {
  SUPER_ADMIN: [
    { label: "Overview", href: "/dashboard/hrm", icon: LayoutDashboard },
    { label: "Insights", href: "/dashboard", icon: LayoutDashboard },
    { label: "Insights Reports", href: "/insights/reports", icon: BarChart3 },
    { label: "Lab Settings", href: "/dashboard/hrm/settings", icon: Settings2 },
    { label: "Patients", href: "/dashboard/receptionist/patients", icon: Users },
    { label: "Consultations", href: "/dashboard/hrm/consultation", icon: Stethoscope },
    { label: "Review Queue", href: "/dashboard/md/review", icon: ClipboardList },
    { label: "Staff Management", href: "/dashboard/hrm/staff", icon: Users },
    { label: "Add Staff", href: "/dashboard/hrm/staff/new", icon: UserPlus },
    { label: "Test Catalog", href: "/dashboard/hrm/tests", icon: TestTube2 },
    { label: "Operations", href: "/dashboard/hrm/operations", icon: Activity },
    { label: "Release Center", href: "/dashboard/hrm/release", icon: ClipboardList },
    { label: "Audit Log", href: "/dashboard/hrm/audit", icon: ClipboardList },
    { label: "Analytics", href: "/dashboard/hrm/analytics", icon: BarChart3 },
    { label: "Inventory", href: "/dashboard/hrm/inventory", icon: Package },
    { label: "Stock Movements", href: "/dashboard/hrm/inventory/movements", icon: ClipboardList },
    { label: "Inventory Analytics", href: "/dashboard/hrm/inventory/analytics", icon: BarChart3 },
  ],
  HRM: [
    { label: "Overview", href: "/dashboard/hrm", icon: LayoutDashboard },
    { label: "Insights", href: "/dashboard", icon: LayoutDashboard },
    { label: "Insights Reports", href: "/insights/reports", icon: BarChart3 },
    { label: "Patients", href: "/dashboard/receptionist/patients", icon: Users },
    { label: "Consultations", href: "/dashboard/hrm/consultation", icon: Stethoscope },
    { label: "Review Queue", href: "/dashboard/md/review", icon: ClipboardList },
    { label: "Staff Management", href: "/dashboard/hrm/staff", icon: Users },
    { label: "Add Staff", href: "/dashboard/hrm/staff/new", icon: UserPlus },
    { label: "Test Catalog", href: "/dashboard/hrm/tests", icon: TestTube2 },
    { label: "Operations", href: "/dashboard/hrm/operations", icon: Activity },
    { label: "Release Center", href: "/dashboard/hrm/release", icon: ClipboardList },
    { label: "Audit Log", href: "/dashboard/hrm/audit", icon: ClipboardList },
    { label: "Analytics", href: "/dashboard/hrm/analytics", icon: BarChart3 },
  ],
  RECEPTIONIST: [
    { label: "Dashboard", href: "/dashboard/receptionist", icon: LayoutDashboard },
    { label: "New Patient", href: "/dashboard/receptionist/new-patient", icon: UserPlus },
    { label: "Consultation Queue", href: "/dashboard/receptionist/consultation", icon: Stethoscope },
    { label: "Today's Patients", href: "/dashboard/receptionist/patients", icon: Users },
    { label: "Dispatch Center", href: "/dashboard/receptionist/release", icon: ClipboardList },
  ],
  LAB_SCIENTIST: [
    { label: "Dashboard", href: "/dashboard/lab-scientist", icon: LayoutDashboard },
    { label: "My Queue", href: "/dashboard/lab-scientist/queue", icon: ClipboardList },
    { label: "Results", href: "/dashboard/lab-scientist/results", icon: FlaskConical },
  ],
  INVENTORY_MANAGER: [
    { label: "Inventory", href: "/dashboard/hrm/inventory", icon: Package },
    { label: "Item Setup", href: "/dashboard/hrm/inventory/items", icon: Package },
    { label: "Stock Movements", href: "/dashboard/hrm/inventory/movements", icon: ClipboardList },
    { label: "Inventory Analytics", href: "/dashboard/hrm/inventory/analytics", icon: BarChart3 },
  ],
  RADIOGRAPHER: [
    { label: "Dashboard", href: "/dashboard/radiographer", icon: LayoutDashboard },
    { label: "Imaging Queue", href: "/dashboard/radiographer/queue", icon: Scan },
    { label: "Reports", href: "/dashboard/radiographer/reports", icon: ClipboardList },
  ],
  MD: [
    { label: "Review Queue", href: "/dashboard/md/review", icon: Stethoscope },
    { label: "Consultation Queue", href: "/dashboard/md/consultation", icon: Users },
    { label: "Patients", href: "/dashboard/receptionist/patients", icon: Users },
    { label: "Approved", href: "/dashboard/md/approved", icon: ClipboardList },
    { label: "Report Drafts", href: "/dashboard/md/reports", icon: ClipboardList },
    { label: "Insights", href: "/dashboard", icon: LayoutDashboard },
    { label: "Insights Reports", href: "/insights/reports", icon: BarChart3 },
    { label: "Inventory", href: "/dashboard/hrm/inventory", icon: Package },
    { label: "Stock Movements", href: "/dashboard/hrm/inventory/movements", icon: ClipboardList },
    { label: "Inventory Analytics", href: "/dashboard/hrm/inventory/analytics", icon: BarChart3 },
  ],
};

interface SidebarProps {
  user: {
    fullName: string;
    email: string;
    role: Role;
    organizationName?: string;
  };
  className?: string;
  onNavigate?: () => void;
}

function notificationPathForRole(role: Role) {
  if (role === "RECEPTIONIST") return "/dashboard/receptionist/notifications";
  if (role === "LAB_SCIENTIST") return "/dashboard/lab-scientist/notifications";
  if (role === "RADIOGRAPHER") return "/dashboard/radiographer/notifications";
  if (role === "MD") return "/dashboard/md/notifications";
  return "/dashboard/hrm/notifications";
}

export function Sidebar({ user, className, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const navItems = navByRole[user.role] ?? [];
  const isActivePath = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <aside className={cn("flex h-[100dvh] w-56 flex-col border-r border-slate-200 bg-white", className)}>
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 border-b border-slate-200 px-4">
        <Image
          src="/diagsync-logo.png"
          alt="Diagsync"
          width={28}
          height={28}
          className="h-7 w-7 rounded object-cover"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-800">Diagsync</p>
          {user.organizationName && (
            <p className="truncate text-[11px] text-slate-400">{user.organizationName}</p>
          )}
        </div>
      </div>

      {/* Role label */}
      <div className="px-4 pt-4 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          {ROLE_LABELS[user.role]}
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = isActivePath(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-blue-600 text-white font-medium"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Notifications */}
      <div className="border-t border-slate-200 px-2 py-1">
        <Link
          href="/dashboard/billing"
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
        >
          <CreditCard className="h-4 w-4" />
          Billing
        </Link>
        <Link
          href={notificationPathForRole(user.role)}
          onClick={onNavigate}
          className="flex items-center gap-2.5 rounded px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
        >
          <Bell className="h-4 w-4" />
          Notifications
        </Link>
      </div>

      {/* User + Sign out */}
      <div className="border-t border-slate-200 p-3">
        <div className="mb-2 flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
            {user.fullName.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-800">{user.fullName}</p>
            <p className="truncate text-[11px] text-slate-400">{user.email}</p>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center gap-2 rounded px-3 py-1.5 text-xs text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

