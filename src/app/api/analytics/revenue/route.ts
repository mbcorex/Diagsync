import { auth } from "@/lib/auth";
import { getRevenueStats, RevenuePeriod } from "@/lib/analytics/revenue";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user as any;
    const searchParams = request.nextUrl.searchParams;
    const period = (searchParams.get("period") as RevenuePeriod) || "thisMonth";
    const customStart = searchParams.get("start");
    const customEnd = searchParams.get("end");

    const stats = await getRevenueStats(
      user.organizationId,
      period,
      customStart ? new Date(customStart) : undefined,
      customEnd ? new Date(customEnd) : undefined
    );

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Revenue stats error:", error);
    return NextResponse.json({ error: "Failed to fetch revenue stats" }, { status: 500 });
  }
}
