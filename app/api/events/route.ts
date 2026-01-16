import { NextRequest } from "next/server";

// Store connected clients
const clients = new Set<ReadableStreamDefaultController>();

// Broadcast event to all connected clients
export function broadcastEvent(event: { type: string; data: any }) {
  const message = `data: ${JSON.stringify(event)}\n\n`;
  clients.forEach((controller) => {
    try {
      controller.enqueue(new TextEncoder().encode(message));
    } catch {
      // Client disconnected
      clients.delete(controller);
    }
  });
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const stream = new ReadableStream({
    start(controller) {
      clients.add(controller);

      // Send initial connection message
      controller.enqueue(
        new TextEncoder().encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`)
      );

      // Keep connection alive with heartbeat
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ type: "heartbeat" })}\n\n`)
          );
        } catch {
          clearInterval(heartbeat);
          clients.delete(controller);
        }
      }, 30000); // Every 30 seconds

      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        clients.delete(controller);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
