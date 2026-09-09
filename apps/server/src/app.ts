import cors from "@fastify/cors"
import Fastify from "fastify";
import { registerConversationRoutes } from "./api/routes/conversations.js";
import { registerDraftActionRoutes } from "./api/routes/draft-actions.js";
import { closeAllSseClients, registerEventRoute } from "./api/routes/events.js";
import { registerHealthRoute } from "./api/routes/health.js";
import { registerSystemRoute } from "./api/routes/system.js";
import { env } from "./config/env.js";
import { closeDatabase } from "./db/client.js";
import { logger } from "./logger.js";

export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger
  });

  await app.register(cors, { origin: env.DASHBOARD_ORIGIN });
  await app.register(registerHealthRoute);
  await app.register(registerSystemRoute, { prefix: "/api" });
  await app.register(registerConversationRoutes, { prefix: "/api" });
  await app.register(registerDraftActionRoutes, { prefix: "/api" });
  await app.register(registerEventRoute, { prefix: "/api" });

  app.addHook("onClose", async () => {
    closeAllSseClients();
    closeDatabase();
  });

  return app;
}
