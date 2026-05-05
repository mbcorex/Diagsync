"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/index";
import { ROLE_LABELS, DEPARTMENT_LABELS } from "@/lib/utils";
import { Role, Department, Shift } from "@prisma/client";
import { Eye, EyeOff } from "lucide-react";
import { UpgradeHint } from "@/components/billing/upgrade-hint";

const schema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().min(7, "Phone number required"),
  role: z.nativeEnum(Role),
  department: z.nativeEnum(Department),
  gender: z.string().optional(),
  defaultShift: z.nativeEnum(Shift),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type FormData = z.infer<typeof schema>;

const ROLES_FOR_FORM = Object.entries(ROLE_LABELS).filter(
  ([key]) => key !== "SUPER_ADMIN" && key !== "MEGA_ADMIN"
);

const inputCls = "h-8 w-full rounded border border-slate-200 bg-white px-2.5 text-xs text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500";
const labelCls = "block text-[11px] font-medium text-slate-500 mb-1";
const errCls = "text-[11px] text-red-500 mt-0.5";

export function AddStaffForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [radiologyAllowed, setRadiologyAllowed] = useState(true);

  const { register, handleSubmit, setValue, reset, formState: { errors, isSubmitting } } =
    useForm<FormData>({ resolver: zodResolver(schema), defaultValues: { defaultShift: Shift.MORNING } });
  
  function autoDepartmentForRole(role: Role): Department | null {
    if (role === "RECEPTIONIST") return Department.RECEPTION;
    if (role === "LAB_SCIENTIST") return Department.LABORATORY;
    if (role === "RADIOGRAPHER") return Department.RADIOLOGY;
    if (role === "MD") return Department.MEDICAL_REVIEW;
    if (role === "HRM" || role === "SUPER_ADMIN") return Department.HR_OPERATIONS;
    if (role === "INVENTORY_MANAGER") return Department.INVENTORY;
    return null;
  }

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/billing/overview");
        const json = await res.json();
        if (!json.success) return;
        setRadiologyAllowed(Boolean(json.data?.access?.canUseRadiology ?? true));
      } catch {
        // no-op
      }
    })();
  }, []);

  async function onSubmit(data: FormData) {
    setServerError("");
    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) { setServerError(json.error ?? "Something went wrong"); return; }
      setSuccess(true);
      reset();
      setTimeout(() => router.push("/dashboard/hrm/staff"), 1500);
    } catch {
      setServerError("Network error. Please try again.");
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="border-b border-slate-100 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">New Staff Member</span>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="p-4 space-y-4">
        {serverError && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">{serverError}</div>
        )}
        {success && (
          <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
            Staff member created! Redirecting...
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelCls}>Full Name *</label>
            <input placeholder="e.g. Jane Okafor" {...register("fullName")} className={inputCls} />
            {errors.fullName && <p className={errCls}>{errors.fullName.message}</p>}
          </div>

          <div>
            <label className={labelCls}>Email Address *</label>
            <input type="email" placeholder="jane@lab.com" {...register("email")} className={inputCls} />
            {errors.email && <p className={errCls}>{errors.email.message}</p>}
          </div>

          <div>
            <label className={labelCls}>Phone Number *</label>
            <input placeholder="+234..." {...register("phone")} className={inputCls} />
            {errors.phone && <p className={errCls}>{errors.phone.message}</p>}
          </div>

          <div>
            <label className={labelCls}>Gender</label>
            <Select onValueChange={(v) => setValue("gender", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select gender" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Male">Male</SelectItem>
                <SelectItem value="Female">Female</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className={labelCls}>Role *</label>
            <Select
              onValueChange={(v) => {
                const nextRole = v as Role;
                setValue("role", nextRole);
                const mappedDepartment = autoDepartmentForRole(nextRole);
                if (mappedDepartment) {
                  setValue("department", mappedDepartment, { shouldValidate: true });
                }
              }}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select role" /></SelectTrigger>
              <SelectContent>
                {ROLES_FOR_FORM.map(([value, label]) => {
                  if (value === "RADIOGRAPHER" && !radiologyAllowed) return null;
                  return (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {errors.role && <p className={errCls}>{errors.role.message}</p>}
            {!radiologyAllowed ? (
              <div className="mt-1.5">
                <UpgradeHint
                  message="Radiographer role is not available on this plan. Upgrade to Advanced to add Radiology staff."
                  ctaLabel="Open Billing"
                />
              </div>
            ) : null}
          </div>

          <div>
            <label className={labelCls}>Department *</label>
            <Select onValueChange={(v) => setValue("department", v as Department)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                {Object.entries(DEPARTMENT_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.department && <p className={errCls}>{errors.department.message}</p>}
          </div>

          <div>
            <label className={labelCls}>Default Shift *</label>
            <Select defaultValue={Shift.MORNING} onValueChange={(v) => setValue("defaultShift", v as Shift)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MORNING">Morning</SelectItem>
                <SelectItem value="AFTERNOON">Afternoon</SelectItem>
                <SelectItem value="NIGHT">Night</SelectItem>
                <SelectItem value="FULL_DAY">Full Day</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className={labelCls}>Password *</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Min 8 characters"
                {...register("password")}
                className={`${inputCls} pr-9`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-2 inline-flex items-center text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className={errCls}>{errors.password.message}</p>}
          </div>

          <div>
            <label className={labelCls}>Confirm Password *</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Repeat password"
                {...register("confirmPassword")}
                className={`${inputCls} pr-9`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-2 inline-flex items-center text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.confirmPassword && <p className={errCls}>{errors.confirmPassword.message}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? "Creating..." : "Create Staff Member"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/dashboard/hrm/staff")}
            className="rounded border border-slate-200 px-4 py-1.5 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
