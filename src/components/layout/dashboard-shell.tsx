"use client";

import { Role } from "@prisma/client";
import { Sidebar } from "@/components/layout/sidebar";
import { HeaderBar } from "@/components/layout/header-bar";
import { OfflineStatusBar } from "@/components/shared/offline-status-bar";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { InstallPrompt } from "@/components/install-prompt";

type DashboardShellProps = {
  user: {
    fullName: string;
    email: string;
    role: Role;
    organizationName?: string;
  };
  staffId: string;
  staffName: string;
  staffEmail: string;
  role: Role;
  organizationId: string;
  initialAvailability: boolean;
  showAvailabilityToggle?: boolean;
  trialBanner?: { text: string; warning?: boolean } | null;
  children: React.ReactNode;
};

export function DashboardShell({
  user,
  staffId,
  staffName,
  staffEmail,
  role,
  organizationId,
  initialAvailability,
  showAvailabilityToggle = true,
  trialBanner = null,
  children,
}: DashboardShellProps) {
  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      <Sidebar user={user} className="hidden md:flex" />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <HeaderBar
          staffId={staffId}
          staffName={staffName}
          staffEmail={staffEmail}
          role={role}
          organizationId={organizationId}
          initialAvailability={initialAvailability}
          showAvailabilityToggle={showAvailabilityToggle}
        />
        <OfflineStatusBar />
        <InstallPrompt />
        {trialBanner ? (
          <div
            className={`mx-3 mt-3 rounded-md border px-3 py-2 text-xs sm:mx-4 md:mx-6 ${
              trialBanner.warning
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-blue-200 bg-blue-50 text-blue-700"
            }`}
          >
            {trialBanner.text}
          </div>
        ) : null}
        <main className="flex-1 overflow-y-auto px-3 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+108px)] sm:px-4 md:p-6 md:pb-6">
          {children}
        </main>
      </div>
      <MobileBottomNav role={role} />
    </div>
  );
}
