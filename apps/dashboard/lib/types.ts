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

export type DraftStatus =
  | "generating"
  | "ready"
  | "sending"
  | "sent"
  | "failed"
  | "ignored"
  | "superseded";

export interface Draft {
  id: number;
  status: DraftStatus;
  generatedText: string | null;
  finalText: string | null;
  model: string | null;
  promptVersion: string;
  latencyMs: number | null;
  errorKind: string | null;
  createdAt: string;
  sendable: boolean;
  staleReason: string | null;
}

export interface DraftResponse {
  draft: Draft | null;
}

// Contact policy (Phase 7). Canonical values live in apps/server/src/db/schema.ts;
// kept in sync here by hand, matching this file's wire-contract convention.
export const RELATIONSHIPS = [
  "UNKNOWN",
  "FAMILY",
  "FRIEND",
  "WORK",
  "ACQUAINTANCE",
  "OTHER"
] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export const REPLY_MODES = ["OFF", "DRAFT", "AUTO_SAFE", "AUTO"] as const;
export type ReplyMode = (typeof REPLY_MODES)[number];

/** Reply modes a human can actually select in Phase 7. AUTO_SAFE / AUTO are stored
 * for forward compatibility but never activate autonomous sending. */
export const SELECTABLE_REPLY_MODES: ReplyMode[] = ["OFF", "DRAFT"];

export interface Contact {
  id: number;
  whatsappJid: string;
  displayName: string | null;
  relationship: Relationship;
  replyMode: ReplyMode;
  notes: string | null;
}

export interface ContactResponse {
  contact: Contact;
}

export interface ContactUpdate {
  displayName?: string;
  relationship?: Relationship;
  replyMode?: ReplyMode;
  notes?: string | null;
}

// Memory facts (Phase 9). Only 'confirmed' facts are used when drafting.
export type MemoryFactStatus = "proposed" | "confirmed" | "rejected";

export interface MemoryFact {
  id: number;
  fact: string;
  status: MemoryFactStatus;
  sourceMessageId: number | null;
  createdAt: string;
}

export interface MemoryFactsResponse {
  facts: MemoryFact[];
}
