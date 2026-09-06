import type { FastifyInstance } from "fastify";
import { checkDatabase } from "../../db/client.js";
import type { SystemStatus } from "../../messaging/view.types.js";
import { whatsappService } from "../../whatsapp/whatsapp.service.js";

export async function registerSystemRoute(app: FastifyInstance): Promise<void> {
  app.get("/system/status", async (): Promise<SystemStatus> => ({
    server: "ok",
    database: checkDatabase() ? "ok" : "unavailable",
    whatsapp: whatsappService.getStatus(),
    timestamp: new Date().toISOString()
  }));
}
