import { auth } from "@/lib/auth";
import { getRevenueOpsIntelligence, AnalyticsPeriod } from "@/lib/revenue-ops-intelligence";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user as any;
    if (!["HRM", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const period = (searchParams.get("period") as AnalyticsPeriod) || "last30";
    const customStart = searchParams.get("start");
    const customEnd = searchParams.get("end");

    const analytics = await getRevenueOpsIntelligence(
      {
        id: user.id,
        role: user.role,
        organizationId: user.organizationId,
      },
      period,
      customStart ? new Date(customStart) : undefined,
      customEnd ? new Date(customEnd) : undefined
    );

    return NextResponse.json(analytics);
  } catch (error) {
    console.error("Analytics error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
