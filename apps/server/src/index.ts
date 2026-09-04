import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { runMigrations } from "./db/migrate.js";
import { logger } from "./logger.js";
import { whatsappService } from './whatsapp/whatsapp.service.js';

const app = await buildApp();
let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  logger.info({ signal }, 'Shutting down server');

  try {
    await whatsappService.stop();

    await app.close();

    logger.info('Server shutdown complete');

    process.exit(0);
  } catch (err) {
    logger.error(
      {
        err,
      },
      'Error during server shutdown',
    );

    process.exit(1);
  }
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

try {
  runMigrations();

  await app.listen({
    host: env.SERVER_HOST,
    port: env.SERVER_PORT
  });
  await whatsappService.start();
} catch (error) {
  app.log.fatal({ err: error }, "server failed to start");
  process.exitCode = 1;
  await app.close();
}
