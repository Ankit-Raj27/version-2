import { buildApp } from "./app.js";
import { env } from "./config/env.js";
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
  } catch (error) {
    logger.error(
      {
        error,
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
  await app.listen({
    host: env.SERVER_HOST,
    port: env.SERVER_PORT
  });
  await whatsappService.start();
  setTimeout(() => {
  void whatsappService
    .sendText(
      '916201562166@s.whatsapp.net',
      'Phase 1 send test',
    )
    .catch((error) => {
      logger.error({ error }, 'WhatsApp send test failed');
    });
}, 5_000);
} catch (error) {
  app.log.fatal({ err: error }, "server failed to start");
  process.exitCode = 1;
  await app.close();
}
