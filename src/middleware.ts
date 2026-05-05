import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getDashboardPath } from "@/lib/utils";
import { Role } from "@prisma/client";

const publicRoutes = new Set(["/", "/login", "/register", "/offline"]);
const AUTH_SECRET =
  process.env.AUTH_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  (process.env.NODE_ENV !== "production" ? "diagsync-local-dev-auth-secret" : undefined);

const roleRouteMap: Record<string, Role[]> = {
  "/insights": ["MD", "HRM", "SUPER_ADMIN"],
  "/dashboard/hrm/inventory": ["INVENTORY_MANAGER", "SUPER_ADMIN", "MD"],
  "/dashboard/receptionist": ["RECEPTIONIST", "SUPER_ADMIN"],
  "/dashboard/lab-scientist": ["LAB_SCIENTIST", "SUPER_ADMIN"],
  "/dashboard/radiographer": ["RADIOGRAPHER", "SUPER_ADMIN"],
  "/dashboard/md": ["MD", "SUPER_ADMIN"],
  "/dashboard/hrm": ["HRM", "SUPER_ADMIN"],
};

export default async function middleware(req: NextRequest) {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;

  const token = await getToken({
    req,
    secret: AUTH_SECRET,
    cookieName:
      process.env.NODE_ENV === "production"
        ? "__Secure-authjs.session-token"
        : "authjs.session-token",
  });

  const isPublicRoute =
    publicRoutes.has(pathname) ||
    pathname.startsWith("/labs") ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/workbox-") ||
    pathname.startsWith("/public/reports/") ||
    pathname.startsWith("/api/auth") ||
    pathname === "/api/uploads/branding" ||
    pathname === "/api/organizations/register";
  if (isPublicRoute) {
    if (token && (pathname === "/login" || pathname === "/register")) {
      const role = token.role as Role;
      return NextResponse.redirect(new URL(getDashboardPath(role), nextUrl.origin));
    }
    return NextResponse.next();
  }

  if (!token) {
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const userRole = token.role as Role;
  if (pathname.startsWith("/admin") && userRole !== "MEGA_ADMIN") {
    return NextResponse.redirect(new URL(getDashboardPath(userRole), nextUrl.origin));
  }

  if (userRole === "MEGA_ADMIN" && pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/admin/dashboard", nextUrl.origin));
  }

  // Allow MD/HRM to access patient list in read-only mode without opening full receptionist area.
  if (pathname === "/dashboard/receptionist/patients" || pathname === "/dashboard/receptionist/patients/") {
    if (!["RECEPTIONIST", "SUPER_ADMIN", "HRM", "MD"].includes(userRole)) {
      return NextResponse.redirect(new URL(getDashboardPath(userRole), nextUrl.origin));
    }
    return NextResponse.next();
  }

  for (const [route, allowedRoles] of Object.entries(roleRouteMap)) {
    if (pathname.startsWith(route)) {
      if (!allowedRoles.includes(userRole)) {
        return NextResponse.redirect(new URL(getDashboardPath(userRole), nextUrl.origin));
      }
      return NextResponse.next();
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*\\.js|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.svg|.*\\.ico|.*\\.webp).*)",
  ],
};
