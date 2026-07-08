  import webpush from "web-push";
import { prisma } from "@/lib/prisma";

type PushDispatchInput = {
  organizationId: string;
  userIds: string[];
  title: string;
  message: string;
  entityId?: string;
  entityType?: string;
};

let isConfigured = false;
let didAttemptConfig = false;

function configureWebPush() {
  if (didAttemptConfig) return isConfigured;
  didAttemptConfig = true;

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject =
    process.env.VAPID_SUBJECT ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "mailto:admin@localhost";

  if (!publicKey || !privateKey) {
    console.warn(
      "[PUSH_DISABLED] Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY and/or VAPID_PRIVATE_KEY."
    );
    isConfigured = false;
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  isConfigured = true;
  return true;
}

export function getPushPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
}

export async function dispatchPushForNotification(
  input: PushDispatchInput
) {
  if (!configureWebPush()) return;
  if (input.userIds.length === 0) return;
  try {
    const uniqueUserIds = Array.from(new Set(input.userIds));
    const subscriptions = await prisma.pushSubscription.findMany({
      where: {
        organizationId: input.organizationId,
        userId: { in: uniqueUserIds },
      },
      select: {
        id: true,
        endpoint: true,
        p256dh: true,
        auth: true,
      },
    });
    if (subscriptions.length === 0) return;

    const payload = JSON.stringify({
      title: input.title,
      body: input.message,
      tag: input.entityId || undefined,
      data: {
        entityId: input.entityId ?? null,
        entityType: input.entityType ?? null,
        url: "/dashboard",
      },
    });

    const staleIds: string[] = [];
    const sends = subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          { TTL: 60 }
        );
      } catch (error: any) {
        const statusCode = Number(error?.statusCode ?? 0);
        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(sub.id);
          return;
        }
        console.error("[PUSH_SEND_FAILED]", {
          subscriptionId: sub.id,
          statusCode: statusCode || null,
        });
      }
    });
    await Promise.allSettled(sends);

    if (staleIds.length > 0) {
      await prisma.pushSubscription.deleteMany({
        where: { id: { in: staleIds } },
      });
    }
  } catch (error: any) {
    const code = String(error?.code ?? "");
    if (code === "P2021" || code === "P2022") {
      console.warn("[PUSH_DISABLED] push_subscriptions table missing. Run Prisma migration/db push.");
      return;
    }
    console.error("[PUSH_DISPATCH_FAILED]", error);
  }
}
