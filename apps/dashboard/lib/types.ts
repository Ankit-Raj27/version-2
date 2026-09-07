// Wire contract source: apps/server/src/messaging/view.types.ts
export type WhatsAppConnectionState =
  | "idle"
  | "connecting"
  | "qr"
  | "connected"
  | "disconnected"
  | "logged_out";

export type MessageDirection = "incoming" | "outgoing";
export type MessageOrigin =
  | "CONTACT"
  | "USER_PHONE"
  | "AI_APPROVED"
  | "AI_EDITED"
  | "AI_AUTO"
  | "SYSTEM";

export interface ConversationView {
  id: number;
  type: "direct" | "group";
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
  type: "text" | "unsupported";
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

export interface ConversationListResponse {
  conversations: ConversationSummary[];
}

export interface MessagePageResponse {
  conversation: ConversationView;
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

export type StreamState = "connecting" | "live" | "reconnecting";

export type DraftStatus = "generating" | "ready" | "failed";

export interface Draft {
  id: number;
  status: DraftStatus;
  generatedText: string | null;
  model: string | null;
  promptVersion: string;
  latencyMs: number | null;
  errorKind: string | null;
  createdAt: string;
}

export interface DraftResponse {
  draft: Draft | null;
}
