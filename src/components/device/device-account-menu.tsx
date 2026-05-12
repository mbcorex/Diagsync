"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { ChevronDown, RefreshCw, UserPlus, Users, UserX } from "lucide-react";
import {
  DeviceStaffSummary,
  clearDeviceContext,
  ensureDeviceContext,
  markLastActiveStaff,
  setDeviceStaff,
} from "@/lib/device-client";
import { ROLE_LABELS } from "@/lib/utils";
import { AddStaffToDeviceModal } from "@/components/device/add-staff-to-device-modal";
import { SwitchStaffModal } from "@/components/device/switch-staff-modal";
import { RemoveStaffFromDeviceDialog } from "@/components/device/remove-staff-from-device-dialog";

interface DeviceAccountMenuProps {
  staffId: string;
  staffName: string;
  staffEmail: string;
  role: keyof typeof ROLE_LABELS;
  organizationId: string;
}

export function DeviceAccountMenu({
  staffId,
  staffName,
  staffEmail,
  role,
  organizationId,
}: DeviceAccountMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [deviceKey, setDeviceKey] = useState("");
  const [savedStaff, setSavedStaffState] = useState<DeviceStaffSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sortedStaff = useMemo(() => {
    const deduped = new Map<string, DeviceStaffSummary>();
    for (const item of savedStaff) deduped.set(item.staffId, item);
    return Array.from(deduped.values());
  }, [savedStaff]);

  const syncStaffToState = useCallback(
    (staff: DeviceStaffSummary[]) => {
      setSavedStaffState(staff);
      if (organizationId) setDeviceStaff(organizationId, staff);
    },
    [organizationId]
  );

  const loadDeviceState = useCallback(
    async (key: string, allowRetryWithReset = true) => {
      if (!key) return;
      setLoading(true);
      setError("");
      try {
        const registerRes = await fetch("/api/device/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceKey: key }),
        });
        const registerJson = (await registerRes.json()) as {
          success: boolean;
          error?: string;
          data?: { staff?: DeviceStaffSummary[] };
        };
        if (!registerJson.success) {
          if (allowRetryWithReset && registerJson.error?.toLowerCase().includes("another organization")) {
            clearDeviceContext();
            const ctx = ensureDeviceContext(organizationId);
            setDeviceKey(ctx.deviceKey);
            await loadDeviceState(ctx.deviceKey, false);
            return;
          }
          setError(registerJson.error ?? "Failed to register device");
          return;
        }

        const listRes = await fetch(`/api/device/staff?deviceKey=${encodeURIComponent(key)}`);
        const listJson = (await listRes.json()) as {
          success: boolean;
          error?: string;
          data?: { staff: DeviceStaffSummary[] };
        };
        if (!listJson.success) {
          setError(listJson.error ?? "Failed to load saved staff");
          return;
        }
        syncStaffToState(listJson.data?.staff ?? registerJson.data?.staff ?? []);
      } catch {
        setError("Network error while loading device account list.");
      } finally {
        setLoading(false);
      }
    },
    [organizationId, syncStaffToState]
  );

  useEffect(() => {
    const ctx = ensureDeviceContext(organizationId);
    setDeviceKey(ctx.deviceKey);
    setSavedStaffState(ctx.staff ?? []);
    void loadDeviceState(ctx.deviceKey);
  }, [organizationId, loadDeviceState]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!menuRef.current || menuRef.current.contains(event.target as Node)) return;
      setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function resetThisDevice() {
    if (!deviceKey) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/device/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceKey }),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) {
        setError(json.error ?? "Failed to reset device");
        return;
      }
      clearDeviceContext();
      const next = ensureDeviceContext(organizationId);
      setDeviceKey(next.deviceKey);
      syncStaffToState([]);
      await loadDeviceState(next.deviceKey, false);
    } catch {
      setError("Network error while resetting device.");
    } finally {
      setLoading(false);
      setMenuOpen(false);
    }
  }

  function addStaffToLocal(staff: DeviceStaffSummary) {
    syncStaffToState([staff, ...sortedStaff.filter((item) => item.staffId !== staff.staffId)]);
  }

  function removeStaffFromLocal(targetStaffId: string) {
    syncStaffToState(sortedStaff.filter((item) => item.staffId !== targetStaffId));
  }

  function onSwitched(staffIdToMark: string) {
    markLastActiveStaff(organizationId, staffIdToMark);
    setMenuOpen(false);
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded border border-slate-200 px-2.5 py-1.5 text-left hover:bg-slate-50"
      >
        <div className="hidden sm:block">
          <p className="max-w-[140px] truncate text-xs font-semibold text-slate-700">{staffName}</p>
          <p className="text-[11px] text-slate-500">{ROLE_LABELS[role]}</p>
        </div>
        <ChevronDown className="h-4 w-4 text-slate-500" />
      </button>

      {menuOpen ? (
        <div className="absolute right-0 z-[65] mt-2 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          <div className="border-b border-slate-100 px-2.5 pb-2">
            <p className="truncate text-xs font-semibold text-slate-800">{staffName}</p>
            <p className="truncate text-[11px] text-slate-500">
              {ROLE_LABELS[role]} · {staffEmail}
            </p>
          </div>

          {error ? (
            <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-600">
              {error}
            </div>
          ) : null}

          <div className="mt-2 space-y-1">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setShowSwitchModal(true);
              }}
              className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-xs text-slate-700 hover:bg-slate-50"
            >
              <Users className="h-3.5 w-3.5" />
              Switch Account
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setShowAddModal(true);
              }}
              className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-xs text-slate-700 hover:bg-slate-50"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Add Staff to This Device
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setShowRemoveModal(true);
              }}
              className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-xs text-slate-700 hover:bg-slate-50"
            >
              <UserX className="h-3.5 w-3.5" />
              Remove Staff from Device
            </button>
            <button
              type="button"
              onClick={() => void resetThisDevice()}
              disabled={loading}
              className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-60"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reset This Device
            </button>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-xs text-red-600 hover:bg-red-50"
            >
              Logout
            </button>
          </div>
        </div>
      ) : null}

      <AddStaffToDeviceModal
        open={showAddModal}
        deviceKey={deviceKey}
        onClose={() => setShowAddModal(false)}
        onStaffAdded={addStaffToLocal}
      />

      <SwitchStaffModal
        open={showSwitchModal}
        deviceKey={deviceKey}
        currentStaffId={staffId}
        staff={sortedStaff}
        onClose={() => setShowSwitchModal(false)}
        onSwitched={onSwitched}
        onRemoved={removeStaffFromLocal}
      />

      <RemoveStaffFromDeviceDialog
        open={showRemoveModal}
        deviceKey={deviceKey}
        staff={sortedStaff}
        currentStaffId={staffId}
        onClose={() => setShowRemoveModal(false)}
        onRemoved={removeStaffFromLocal}
      />
    </div>
  );
}
