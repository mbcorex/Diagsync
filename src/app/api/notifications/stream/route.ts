import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const user = session.user as any;

  let cleanup: (() => void) | null = null;
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      let lastTopId: string | null = null;
      let lastUnread = -1;
      let tick = 0;
      let inFlight = false;

      const write = (chunk: string) => {
        if (closed) return;
        controller.enqueue(encoder.encode(chunk));
      };

      write(sse("ready", { ok: true }));

      const interval = setInterval(async () => {
        if (inFlight) return;
        inFlight = true;
        try {
          tick += 1;
          const top = await prisma.notification.findFirst({
            where: { organizationId: user.organizationId, userId: user.id },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              createdAt: true,
              type: true,
              title: true,
              message: true,
              isRead: true,
            },
          });
          const topId = top?.id ?? null;
          // Count unread less frequently to reduce DB reads while keeping badge reasonably fresh.
          let unreadCount = lastUnread < 0 ? 0 : lastUnread;
          if (tick % 4 === 1 || topId !== lastTopId || lastUnread < 0) {
            unreadCount = await prisma.notification.count({
              where: { organizationId: user.organizationId, userId: user.id, isRead: false },
            });
          }

          if (topId !== lastTopId || unreadCount !== lastUnread) {
            lastTopId = topId;
            lastUnread = unreadCount;
            write(
              sse("notification", {
                unreadCount,
                topId,
                topType: top?.type ?? null,
                topTitle: top?.title ?? null,
                topMessage: top?.message ?? null,
                topIsRead: top?.isRead ?? null,
              })
            );
          } else {
            write(": heartbeat\n\n");
          }
        } catch {
          write(sse("error", { message: "stream_error" }));
        } finally {
          inFlight = false;
        }
      }, 5000);

      const timeout = setTimeout(() => {
        clearInterval(interval);
        if (!closed) {
          closed = true;
          controller.close();
        }
      }, 1000 * 60 * 10);

      cleanup = () => {
        clearInterval(interval);
        clearTimeout(timeout);
        if (!closed) {
          closed = true;
          controller.close();
        }
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
