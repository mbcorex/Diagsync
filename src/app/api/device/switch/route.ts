import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { createAuditLog } from "@/lib/audit";
import { getAuditMetaFromRequest } from "@/lib/audit-core";
import { prisma } from "@/lib/prisma";
import { createDeviceToken } from "@/lib/device-tokens";
import { ensureDeviceInOrganization, requireSessionStaffContext, toSafeStaffSummary } from "@/lib/device-server";
import {
  getPinAttemptState,
  pinAttemptKey,
  recordPinFailure,
  resetPinFailures,
} from "@/lib/device-pin-attempts";
import { getDashboardPath } from "@/lib/utils";

export const dynamic = "force-dynamic";

const schema = z.object({
  deviceKey: z.string().min(10, "Invalid device key"),
  staffId: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/, "Enter a valid 4-digit PIN"),
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
    const { deviceKey, staffId, pin } = parsed.data;
    const device = await ensureDeviceInOrganization(deviceKey, actor.organizationId!);
    if (!device) {
      return NextResponse.json({ success: false, error: "Device not found. Please reset this device." }, { status: 404 });
    }
    if (device === "OTHER_ORGANIZATION") {
      return NextResponse.json({ success: false, error: "This device belongs to another organization" }, { status: 409 });
    }

    const attemptKey = pinAttemptKey(deviceKey, staffId);
    const blockState = getPinAttemptState(attemptKey);
    if (blockState.blocked) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many PIN attempts. Try again in ${blockState.secondsLeft}s`,
        },
        { status: 429 }
      );
    }

    const target = await prisma.staff.findUnique({
      where: { id: staffId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        status: true,
        organizationId: true,
        pinHash: true,
      },
    });
    if (!target || target.organizationId !== actor.organizationId) {
      return NextResponse.json({ success: false, error: "Staff not found in this organization" }, { status: 404 });
    }
    if (target.status !== "ACTIVE") {
      return NextResponse.json({ success: false, error: "This staff account is inactive" }, { status: 403 });
    }
    let link: { id: string; pinHash: string | null } | null = null;
    try {
      link = await prisma.deviceStaff.findUnique({
        where: {
          deviceId_staffId: {
            deviceId: device.id,
            staffId: target.id,
          },
        },
        select: { id: true, pinHash: true },
      });
    } catch (error) {
      // Backward compatibility: if device-level PIN columns are not migrated yet,
      // fall back to checking only staff-level PIN hash.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
        const legacyLink = await prisma.deviceStaff.findUnique({
          where: {
            deviceId_staffId: {
              deviceId: device.id,
              staffId: target.id,
            },
          },
          select: { id: true },
        });
        link = legacyLink ? { id: legacyLink.id, pinHash: null } : null;
      } else {
        throw error;
      }
    }
    if (!link) {
      return NextResponse.json({ success: false, error: "Staff not linked to this device" }, { status: 403 });
    }

    const pinHashToCheck = link.pinHash ?? target.pinHash;
    if (!pinHashToCheck) {
      return NextResponse.json({ success: false, error: "This staff account has no PIN yet on this device" }, { status: 400 });
    }

    const pinOk = await bcrypt.compare(pin, pinHashToCheck);
    if (!pinOk) {
      recordPinFailure(attemptKey);
      return NextResponse.json({ success: false, error: "Incorrect PIN" }, { status: 401 });
    }

    resetPinFailures(attemptKey);

    const now = new Date();
    await prisma.$transaction([
      prisma.staff.update({
        where: { id: target.id },
        data: { lastQuickSwitchAt: now },
      }),
      prisma.deviceStaff.update({
        where: {
          deviceId_staffId: {
            deviceId: device.id,
            staffId: target.id,
          },
        },
        data: { lastUsedAt: now },
      }),
    ]);

    await createAuditLog({
      actorId: actor.id,
      actorRole: actor.role,
      action: "STAFF_QUICK_SWITCHED",
      entityType: "Staff",
      entityId: target.id,
      changes: {
        fromStaffId: actor.id,
        toStaffId: target.id,
        deviceId: device.id,
        deviceKey: device.deviceKey,
      },
      ...getAuditMetaFromRequest(req),
    });

    const switchToken = createDeviceToken(
      "quick_switch",
      {
        staffId: target.id,
        organizationId: actor.organizationId!,
        deviceKey: device.deviceKey,
        actorId: actor.id,
      },
      60
    );

    return NextResponse.json({
      success: true,
      data: {
        switchToken,
        staff: toSafeStaffSummary(target),
        dashboardPath: getDashboardPath(target.role),
      },
      message: "Account switched successfully",
    });
  } catch (error) {
    console.error("[DEVICE_SWITCH_POST]", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
