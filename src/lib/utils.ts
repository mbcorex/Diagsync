import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Role } from "@prisma/client";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Map each role to its dashboard path
export function getDashboardPath(role: Role): string {
  const map: Record<Role, string> = {
    MEGA_ADMIN: "/admin/dashboard",
    SUPER_ADMIN: "/dashboard/hrm",
    INVENTORY_MANAGER: "/dashboard/hrm/inventory",
    HRM: "/dashboard/hrm",
    RECEPTIONIST: "/dashboard/receptionist",
    LAB_SCIENTIST: "/dashboard/lab-scientist",
    RADIOGRAPHER: "/dashboard/radiographer",
    MD: "/dashboard/md/review",
  };
  return map[role] ?? "/dashboard/hrm";
}

// Format date to readable string
export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Format time
export function formatTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString("en-NG", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Format datetime
export function formatDateTime(date: Date | string): string {
  return `${formatDate(date)} ${formatTime(date)}`;
}

// Format currency
export function formatCurrency(amount: number, currency = "NGN"): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
}

// Format minutes to human readable string
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// Generate patient ID
export function generatePatientId(prefix: string, count: number): string {
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

// Generate visit number
export function generateVisitNumber(prefix: string, count: number): string {
  return `${prefix}-V-${String(count + 1).padStart(4, "0")}`;
}

// Role display labels
export const ROLE_LABELS: Record<Role, string> = {
  MEGA_ADMIN: "Platform Admin",
  SUPER_ADMIN: "Super Admin",
  INVENTORY_MANAGER: "Inventory Manager",
  HRM: "HRM / Operations",
  RECEPTIONIST: "Receptionist",
  LAB_SCIENTIST: "Lab Scientist",
  RADIOGRAPHER: "Radiographer",
  MD: "Medical Doctor",
};

// Department display labels
export const DEPARTMENT_LABELS: Record<string, string> = {
  RECEPTION: "Reception",
  LABORATORY: "Laboratory",
  RADIOLOGY: "Radiology",
  MEDICAL_REVIEW: "Medical Review",
  HR_OPERATIONS: "HR & Operations",
  INVENTORY: "Inventory",
};
