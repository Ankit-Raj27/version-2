import type { ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";
import { subscribe } from "../../realtime/event-bus.js";
import type { AppEvent } from "../../realtime/event.types.js";
import { whatsappService } from "../../whatsapp/whatsapp.service.js";

const HEARTBEAT_INTERVAL_MS = 25_000;
const clients = new Set<ServerResponse>();

export function formatSseEvent(event: AppEvent): string {
  if (event.type === "message.created") {
    return `event: ${event.type}\ndata: ${JSON.stringify({
      conversationId: event.conversationId,
      messageId: event.messageId
    })}\n\n`;
  }

  if (event.type === "draft.updated") {
    return `event: ${event.type}\ndata: ${JSON.stringify({
      conversationId: event.conversationId,
      draftId: event.draftId,
      status: event.status
    })}\n\n`;
  }

  return `event: ${event.type}\ndata: ${JSON.stringify({
    state: event.state,
    connected: event.connected
  })}\n\n`;
}

export function closeAllSseClients(): void {
  for (const client of clients) {
    client.end();
  }

  clients.clear();
}

export function getSseClientCount(): number {
  return clients.size;
}

export async function registerEventRoute(app: FastifyInstance): Promise<void> {
  app.get("/events", async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": env.DASHBOARD_ORIGIN
    });
    reply.raw.write("retry: 3000\n\n");
    reply.raw.write(
      formatSseEvent({ type: "whatsapp.status", ...whatsappService.getStatus() })
    );

    clients.add(reply.raw);

    const unsubscribe = subscribe((event) => {
      if (!reply.raw.destroyed && !reply.raw.writableEnded) {
        reply.raw.write(formatSseEvent(event));
      }
    });
    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed && !reply.raw.writableEnded) {
        reply.raw.write(": ping\n\n");
      }
    }, HEARTBEAT_INTERVAL_MS);
    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;
      clearInterval(heartbeat);
      unsubscribe();
      clients.delete(reply.raw);
    };

    request.raw.once("close", cleanup);
    reply.raw.once("error", cleanup);
  });
}
