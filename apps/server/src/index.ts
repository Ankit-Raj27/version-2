import { buildApp } from "./app.js";
import { env } from "./config/env.js";

const app = await buildApp();
let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  app.log.info({ signal }, "shutdown requested");

  try {
    await app.close();
    process.exitCode = 0;
  } catch (error) {
    app.log.error({ err: error }, "graceful shutdown failed");
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({
    host: env.SERVER_HOST,
    port: env.SERVER_PORT
  });
} catch (error) {
  app.log.fatal({ err: error }, "server failed to start");
  process.exitCode = 1;
  await app.close();
}
