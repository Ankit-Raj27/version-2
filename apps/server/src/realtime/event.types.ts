import type { DraftStatus } from "../agent/drafting/draft.types.js";
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
    }
  | {
      type: "draft.updated";
      conversationId: number;
      draftId: number;
      status: DraftStatus;
    };
