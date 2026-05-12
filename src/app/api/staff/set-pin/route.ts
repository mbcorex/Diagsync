import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";
import { getAuditMetaFromRequest } from "@/lib/audit-core";
import { prisma } from "@/lib/prisma";
import { verifyDeviceToken } from "@/lib/device-tokens";
import { ensureDeviceInOrganization, requireSessionStaffContext } from "@/lib/device-server";

export const dynamic = "force-dynamic";

const schema = z.object({
  staffId: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits"),
  pinSetupToken: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const actorContext = await requireSessionStaffContext();
    if ("error" in actorContext) {
      return NextResponse.json({ success: false, error: actorContext.error }, { status: actorContext.status });
    }

    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.errors[0]?.message ?? "Invalid payload" }, { status: 400 });
    }

    const { actor } = actorContext;
    const { staffId, pin, pinSetupToken } = parsed.data;

    const target = await prisma.staff.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        organizationId: true,
        status: true,
      },
    });
    if (!target || target.organizationId !== actor.organizationId) {
      return NextResponse.json({ success: false, error: "Staff not found in your organization" }, { status: 404 });
    }
    if (target.status !== "ACTIVE") {
      return NextResponse.json({ success: false, error: "This staff account is inactive" }, { status: 403 });
    }

    let linkIdForDevicePin: string | null = null;

    if (actor.id !== target.id) {
      if (!pinSetupToken) {
        return NextResponse.json({ success: false, error: "PIN setup authorization is required" }, { status: 403 });
      }
      const tokenData = verifyDeviceToken(pinSetupToken, "pin_setup");
      if (!tokenData) {
        return NextResponse.json({ success: false, error: "Invalid or expired PIN setup session" }, { status: 401 });
      }
      if (tokenData.staffId !== target.id || tokenData.organizationId !== actor.organizationId) {
        return NextResponse.json({ success: false, error: "Invalid PIN setup target" }, { status: 403 });
      }
      const device = await ensureDeviceInOrganization(tokenData.deviceKey, actor.organizationId!);
      if (!device || device === "OTHER_ORGANIZATION") {
        return NextResponse.json({ success: false, error: "This device belongs to another organization" }, { status: 409 });
      }
      const link = await prisma.deviceStaff.findUnique({
        where: {
          deviceId_staffId: {
            deviceId: device.id,
            staffId: target.id,
          },
        },
        select: { id: true },
      });
      if (!link) {
        return NextResponse.json({ success: false, error: "Staff is not linked to this device" }, { status: 404 });
      }
      linkIdForDevicePin = link.id;
    }

    const pinHash = await bcrypt.hash(pin, 12);
    const now = new Date();
    if (linkIdForDevicePin) {
      await prisma.deviceStaff.update({
        where: { id: linkIdForDevicePin },
        data: {
          pinHash,
          pinSetAt: now,
        },
      });
    } else {
      await prisma.staff.update({
        where: { id: target.id },
        data: {
          pinHash,
          pinSetAt: now,
        },
      });
    }

    await createAuditLog({
      actorId: actor.id,
      actorRole: actor.role,
      action: "STAFF_PIN_SET",
      entityType: "Staff",
      entityId: target.id,
      changes: { staffId: target.id },
      ...getAuditMetaFromRequest(req),
    });

    return NextResponse.json({
      success: true,
      message: linkIdForDevicePin ? "PIN set for this device successfully" : "PIN created successfully",
    });
  } catch (error) {
    console.error("[STAFF_SET_PIN_POST]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
