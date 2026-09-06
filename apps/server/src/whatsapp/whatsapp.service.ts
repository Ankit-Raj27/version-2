import path from 'node:path';

import { Boom } from '@hapi/boom';
import makeWASocket, {
  DisconnectReason,
  isJidBroadcast,
  isJidNewsletter,
  isJidStatusBroadcast,
  type WASocket,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';

import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { persistMessage } from '../messaging/persistence.js';
import { publish } from '../realtime/event-bus.js';
import { normalizeWhatsAppMessage } from './normalize.js';

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

    this.setConnectionState('disconnected');

    logger.info('WhatsApp transport stopped');
  }

  getStatus(): WhatsAppStatus {
    return {
      state: this.connectionState,
      connected: this.connectionState === 'connected',
    };
  }

  async sendText(jid: string, text: string): Promise<void> {
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
    this.setConnectionState('connecting');

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
        this.setConnectionState('qr');

        logger.info(
          'WhatsApp QR received. Scan it from WhatsApp Linked Devices.',
        );

        qrcode.generate(qr, {
          small: false,
        });
      }

      if (connection === 'open') {
        this.setConnectionState('connected');

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

        // Broadcast, status, and newsletter events are not conversations.
        if (
          isJidStatusBroadcast(jid) ||
          isJidBroadcast(jid) ||
          isJidNewsletter(jid)
        ) {
          continue;
        }

        try {
          const normalized = normalizeWhatsAppMessage(message);

          if (!normalized) {
            logger.debug(
              { jid, messageId: message.key.id },
              'Skipping non-persistable WhatsApp event',
            );
            continue;
          }

          const result = persistMessage(normalized);

          if (
            result.status === 'inserted' &&
            result.conversationId !== undefined &&
            result.messageId !== undefined
          ) {
            publish({
              type: 'message.created',
              conversationId: result.conversationId,
              messageId: result.messageId,
            });
          }

          logger.info(
            {
              externalMessageId: normalized.externalMessageId,
              externalConversationId:
                normalized.externalConversationId,
              direction: normalized.direction,
              messageType: normalized.type,
              status: result.status,
            },
            'WhatsApp message persisted',
          );
        } catch (err) {
          logger.error(
            { err, jid, messageId: message.key.id },
            'Failed to persist WhatsApp message',
          );
        }
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
      this.setConnectionState('logged_out');

      logger.warn(
        'WhatsApp session was logged out. QR authentication is required again.',
      );

      return;
    }

    this.setConnectionState('disconnected');

    logger.warn(
      {
        statusCode,
        err: error,
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

      void this.connect().catch((err) => {
        logger.error(
          {
            err,
          },
          'WhatsApp reconnect failed',
        );

        this.scheduleReconnect();
      });
    }, 3_000);
  }

  private setConnectionState(next: WhatsAppConnectionState): void {
    if (next === this.connectionState) {
      return;
    }

    this.connectionState = next;
    publish({
      type: 'whatsapp.status',
      state: next,
      connected: next === 'connected',
    });
  }
}

export const whatsappService =
  new WhatsAppService();
