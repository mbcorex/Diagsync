import { signOut } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  await signOut({ redirectTo: "/login" });
}

export async function POST() {
  await signOut({ redirectTo: "/login" });
}
