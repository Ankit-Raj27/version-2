import path from 'node:path';

import { Boom } from '@hapi/boom';
import makeWASocket, {
  DisconnectReason,
  type WASocket,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';

import { env } from '../config/env.js';
import { logger } from '../logger.js';

import type {
  WhatsAppConnectionState,
  WhatsAppStatus,
} from './whatsapp.types.js';

export class WhatsAppService {
  private socket: WASocket | null = null;

  private connectionState: WhatsAppConnectionState = 'idle';

  private reconnectTimer: NodeJS.Timeout | null = null;

  private stopping = false;

  async start(): Promise<void> {
    if (!env.WHATSAPP_ENABLED) {
      logger.info('WhatsApp transport is disabled');
      return;
    }

    if (
      this.connectionState === 'connecting' ||
      this.connectionState === 'connected'
    ) {
      return;
    }

    this.stopping = false;

    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopping = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      this.socket.end(undefined);
      this.socket = null;
    }

    this.connectionState = 'disconnected';

    logger.info('WhatsApp transport stopped');
  }

  getStatus(): WhatsAppStatus {
    return {
      state: this.connectionState,
      connected: this.connectionState === 'connected',
    };
  }

  async sendText(jid: string, text: string): Promise<void> {
     logger.info(
    {
      killSwitch: env.WHATSAPP_KILL_SWITCH,
    },
    'Checking WhatsApp kill switch',
  );
    if (env.WHATSAPP_KILL_SWITCH) {
      throw new Error(
        'WhatsApp sending blocked: global kill switch is enabled',
      );
    }
    

    if (!this.socket || this.connectionState !== 'connected') {
      throw new Error('WhatsApp is not connected');
    }

    const trimmedText = text.trim();

    if (!trimmedText) {
      throw new Error('Cannot send an empty WhatsApp message');
    }

    await this.socket.sendMessage(jid, {
      text: trimmedText,
    });

    logger.info(
      {
        jid,
      },
      'WhatsApp text message sent',
    );
  }

  private async connect(): Promise<void> {
    this.connectionState = 'connecting';

    const authDirectory = path.resolve(
      process.cwd(),
      env.WHATSAPP_AUTH_DIR,
    );

    logger.info(
      {
        authDirectory,
      },
      'Starting WhatsApp connection',
    );

    const { state, saveCreds } =
      await useMultiFileAuthState(authDirectory);

    const socket = makeWASocket({
      auth: state,

      // Keep Baileys' own logging quieter.
      // Our application logger remains the primary logger.
      logger: logger.child({
        module: 'baileys',
      }),

      // We do not want opening this process to make WhatsApp
      // behave as if the user is permanently online.
      markOnlineOnConnect: false,

      // Phase 1 does not need full WhatsApp history.
      syncFullHistory: false,
    });

    this.socket = socket;

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', (update) => {
      const {
        connection,
        lastDisconnect,
        qr,
      } = update;

      if (qr) {
        this.connectionState = 'qr';

        logger.info(
          'WhatsApp QR received. Scan it from WhatsApp Linked Devices.',
        );

        qrcode.generate(qr, {
          small: false,
        });
      }

      if (connection === 'open') {
        this.connectionState = 'connected';

        logger.info('WhatsApp connection opened');
      }

      if (connection === 'close') {
        this.handleDisconnect(lastDisconnect?.error);
      }
    });

    socket.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') {
        return;
      }

      for (const message of messages) {
        const jid = message.key.remoteJid;

        if (!jid) {
          continue;
        }

        // Groups are explicitly OFF during the MVP.
        if (jid.endsWith('@g.us')) {
          logger.debug(
            { jid },
            'Ignoring WhatsApp group message',
          );

          continue;
        }

        // WhatsApp system/broadcast messages are not part of Phase 1.
        if (
          jid === 'status@broadcast' ||
          jid.endsWith('@broadcast')
        ) {
          continue;
        }

        const text =
          message.message?.conversation ??
          message.message?.extendedTextMessage?.text ??
          null;

        if (!text) {
          logger.debug(
            {
              jid,
              messageId: message.key.id,
            },
            'Ignoring non-text WhatsApp message',
          );

          continue;
        }

        logger.info(
          {
            jid,
            messageId: message.key.id,
            fromMe: message.key.fromMe ?? false,
            text,
          },
          'WhatsApp text message received',
        );
      }
    });
  }

  private handleDisconnect(error: unknown): void {
    this.socket = null;

    const statusCode =
      error instanceof Boom
        ? error.output.statusCode
        : undefined;

    if (statusCode === DisconnectReason.loggedOut) {
      this.connectionState = 'logged_out';

      logger.warn(
        'WhatsApp session was logged out. QR authentication is required again.',
      );

      return;
    }

    this.connectionState = 'disconnected';

    logger.warn(
      {
        statusCode,
        error,
      },
      'WhatsApp connection closed',
    );

    if (this.stopping) {
      return;
    }

    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;

      void this.connect().catch((error) => {
        logger.error(
          {
            error,
          },
          'WhatsApp reconnect failed',
        );

        this.scheduleReconnect();
      });
    }, 3_000);
  }
}

export const whatsappService =
  new WhatsAppService();