import type { WhatsAppConnectionState } from "../whatsapp/whatsapp.types.js";
import type {
  ConversationType,
  MessageDirection,
  MessageOrigin,
  NormalizedMessageType
} from "./message.types.js";

export interface ConversationView {
  id: number;
  type: ConversationType;
  title: string;
  peerJid: string | null;
  externalConversationId: string;
}

export interface ConversationSummary extends ConversationView {
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageDirection: MessageDirection | null;
}

export interface MessageView {
  id: number;
  direction: MessageDirection;
  origin: MessageOrigin;
  type: NormalizedMessageType;
  text: string | null;
  timestamp: string;
  senderLabel: string | null;
  quotedMessageId: number | null;
  quotedPreview: string | null;
}

export interface MessageCursor {
  timestamp: string;
  id: number;
}

export interface MessagePage {
  messages: MessageView[];
  hasMore: boolean;
  oldest: MessageCursor | null;
}

export interface SystemStatus {
  server: "ok";
  database: "ok" | "unavailable";
  whatsapp: {
    state: WhatsAppConnectionState;
    connected: boolean;
  };
  timestamp: string;
}
