// app/api/watch-along/matches/[id]/events/route.ts
import { NextRequest } from "next/server";
import { getMatchEmitter, WatchAlongEvent } from "@/lib/watchAlongEvents";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const emitter = getMatchEmitter(id);
  const encoder = new TextEncoder();

  let keepAliveTimer: NodeJS.Timeout | null = null;
  let eventListener: ((event: WatchAlongEvent) => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // 1. Send initial connection confirmation
      controller.enqueue(
        encoder.encode(
          `event: message\ndata: ${JSON.stringify({ type: "CONNECTED", matchId: id, timestamp: Date.now() })}\n\n`
        )
      );

      // 2. Listen for broadcast events from POST routes (quizzes, predictions, chats)
      eventListener = (event: WatchAlongEvent) => {
        try {
          controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Stream already closed by client
        }
      };

      emitter.on("match_event", eventListener);

      // 3. Heartbeat comment every 45s (0 database reads, keeps connection open through proxies/ALBs)
      keepAliveTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          if (keepAliveTimer) clearInterval(keepAliveTimer);
        }
      }, 45000);
    },
    cancel() {
      if (keepAliveTimer) clearInterval(keepAliveTimer);
      if (eventListener) emitter.off("match_event", eventListener);
    },
  });

  // Handle client disconnect or page navigation
  req.signal.addEventListener("abort", () => {
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    if (eventListener) emitter.off("match_event", eventListener);
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
