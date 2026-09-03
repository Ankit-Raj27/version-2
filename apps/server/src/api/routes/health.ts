import type { FastifyInstance } from "fastify";
import { checkDatabase } from "../../db/client.js";

export async function registerHealthRoute(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_request, reply) => {
    const dbHealthy = checkDatabase();

    if (!dbHealthy) {
      return reply.code(503).send({
        status: "degraded",
        service: "personal-ai-server",
        database: "unavailable",
        timestamp: new Date().toISOString()
      });
    }

    return {
      status: "ok",
      service: "personal-ai-server",
      database: "ok",
      timestamp: new Date().toISOString()
    };
  });
}
