"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn } from "next-auth/react";
import { ROLE_LABELS } from "@/lib/utils";
import { DeviceStaffSummary } from "@/lib/device-client";
import { PinInput } from "@/components/device/pin-input";

interface SwitchStaffModalProps {
  open: boolean;
  deviceKey: string;
  currentStaffId: string;
  staff: DeviceStaffSummary[];
  onClose: () => void;
  onSwitched: (staffId: string) => void;
  onRemoved?: (staffId: string) => void;
}

type SwitchResponse = {
  success: boolean;
  error?: string;
  message?: string;
  data?: {
    switchToken: string;
    dashboardPath: string;
    staff: DeviceStaffSummary;
  };
};

export function SwitchStaffModal({
  open,
  deviceKey,
  currentStaffId,
  staff,
  onClose,
  onSwitched,
  onRemoved,
}: SwitchStaffModalProps) {
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [removingStaffId, setRemovingStaffId] = useState<string | null>(null);
  const selected = useMemo(
    () => staff.find((item) => item.staffId === selectedStaffId) ?? null,
    [selectedStaffId, staff]
  );

  useEffect(() => {
    if (!open) return;
    setError("");
    setBusy(false);
    setPin("");
    const first = staff.find((item) => item.staffId !== currentStaffId) ?? staff[0] ?? null;
    setSelectedStaffId(first?.staffId ?? "");
  }, [open, staff, currentStaffId]);

  if (!open) return null;

  async function switchAccount() {
    if (!selected || pin.length !== 4) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/device/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceKey,
          staffId: selected.staffId,
          pin,
        }),
      });
      const json = (await res.json()) as SwitchResponse;
      if (!json.success || !json.data) {
        setError(json.error ?? "Unable to switch account");
        return;
      }

      const loginResult = await signIn("device-switch", {
        switchToken: json.data.switchToken,
        redirect: false,
      });
      if (loginResult?.error) {
        setError("Failed to activate selected account");
        return;
      }

      onSwitched(selected.staffId);
      onClose();
      window.location.assign(json.data.dashboardPath);
    } catch {
      setError("Network error while switching account.");
    } finally {
      setBusy(false);
    }
  }

  async function removeFromDevice(staffId: string) {
    if (staffId === currentStaffId) {
      setError("You cannot remove the account currently signed in.");
      return;
    }
    setRemovingStaffId(staffId);
    setError("");
    try {
      const res = await fetch("/api/device/remove-staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceKey, staffId }),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!json.success) {
        setError(json.error ?? "Failed to remove account from device");
        return;
      }
      if (selectedStaffId === staffId) setSelectedStaffId("");
      onRemoved?.(staffId);
    } catch {
      setError("Network error while removing account.");
    } finally {
      setRemovingStaffId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-800">Switch Account</h3>
          <p className="mt-0.5 text-xs text-slate-500">Select staff and enter PIN.</p>
        </div>

        {error ? (
          <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</div>
        ) : null}

        {staff.length === 0 ? (
          <div className="rounded border border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
            No staff saved on this device yet.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
              {staff.map((item) => {
                const active = item.staffId === selectedStaffId;
                const isCurrent = item.staffId === currentStaffId;
                return (
                  <div
                    key={item.staffId}
                    className={`w-full rounded border px-3 py-2 transition-colors ${
                      active ? "border-blue-300 bg-blue-50" : "border-slate-200"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedStaffId(item.staffId)}
                      className="w-full text-left"
                    >
                      <p className="text-sm font-medium text-slate-800">
                        {item.name}
                        {isCurrent ? <span className="ml-2 text-[11px] text-blue-600">(Current)</span> : null}
                      </p>
                      <p className="text-xs text-slate-500">{item.email}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">{ROLE_LABELS[item.role]}</p>
                    </button>
                    {!isCurrent ? (
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => void removeFromDevice(item.staffId)}
                          disabled={busy || removingStaffId === item.staffId}
                          className="rounded border border-red-200 px-2 py-1 text-[11px] text-red-600 hover:bg-red-50 disabled:opacity-60"
                        >
                          {removingStaffId === item.staffId ? "Removing..." : "Remove"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Enter PIN</p>
              <PinInput value={pin} onChange={setPin} autoFocus disabled={busy || !selected} />
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected || pin.length !== 4 || busy}
            onClick={() => void switchAccount()}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? "Switching..." : "Switch Account"}
          </button>
        </div>
      </div>
    </div>
  );
}
