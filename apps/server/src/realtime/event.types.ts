import type { WhatsAppConnectionState } from "../whatsapp/whatsapp.types.js";

export type AppEvent =
  | {
      type: "message.created";
      conversationId: number;
      messageId: number;
    }
  | {
      type: "whatsapp.status";
      state: WhatsAppConnectionState;
      connected: boolean;
    };
