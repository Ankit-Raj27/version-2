import { expireStaleGenerating, expireStaleSending } from "./agent/drafting/draft.repository.js";
import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { runMigrations } from "./db/migrate.js";
import { logger } from "./logger.js";
import { whatsappService } from './whatsapp/whatsapp.service.js';

const STALE_DRAFT_THRESHOLD_MS = 5 * 60 * 1000;
// 'sending' only spans one in-flight HTTP request/WhatsApp call, so a much shorter
// cutoff than generation's is enough to identify a genuinely interrupted send.
const STALE_SENDING_THRESHOLD_MS = 30 * 1000;

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

  const swept = expireStaleGenerating(STALE_DRAFT_THRESHOLD_MS);

  if (swept > 0) {
    logger.warn({ swept }, 'Marked interrupted drafts as failed');
  }

  const sweptSending = expireStaleSending(STALE_SENDING_THRESHOLD_MS);

  if (sweptSending > 0) {
    logger.warn({ swept: sweptSending }, 'Marked interrupted sends as failed');
  }

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
