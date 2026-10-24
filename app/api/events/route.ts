// GET /api/events — Server-Sent Events stream of live changes (orders,
// inventory, batches, deliveries…) addressed to the signed-in user or
// their role. Clients fall back to polling if the stream drops.
import { getCurrentUser } from "@/lib/auth/session";
import { bus, type LiveEvent } from "@/lib/events";
import { fail } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Opens the stream. Sends a heartbeat every 20s so proxies keep it open,
 * and unsubscribes when the client disconnects.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return fail(401, "Please sign in to continue");

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const onEvent = (e: LiveEvent) => {
        const forUser = e.userIds?.includes(user.id);
        const forRole = e.roles?.includes(user.role);
        const broadcast = !e.userIds?.length && !e.roles?.length;
        if (forUser || forRole || broadcast) send(e);
      };
      bus.on("event", onEvent);
      const heartbeat = setInterval(() => send({ type: "ping", at: Date.now() }), 20_000);
      send({ type: "hello", at: Date.now() });
      cleanup = () => {
        clearInterval(heartbeat);
        bus.off("event", onEvent);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
