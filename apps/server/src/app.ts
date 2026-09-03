import Fastify, { type FastifyInstance } from "fastify";
import { registerHealthRoute } from "./api/routes/health.js";
import { env } from "./config/env.js";
import { closeDatabase } from "./db/client.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL
    }
  });

  await app.register(registerHealthRoute);

  app.addHook("onClose", async () => {
    closeDatabase();
  });

  return app;
}
