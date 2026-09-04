export type MessageDirection = "incoming" | "outgoing";

export type MessageOrigin =
  | "CONTACT"
  | "USER_PHONE"
  | "AI_APPROVED"
  | "AI_EDITED"
  | "AI_AUTO"
  | "SYSTEM";

export type NormalizedMessageType = "text" | "unsupported";

export type ConversationType = "direct" | "group";

export interface NormalizedParty {
  jid: string;
  altJid?: string;
  displayName?: string;
}

export interface NormalizedQuote {
  externalMessageId: string;
  authorJid?: string;
}

export interface NormalizedMessageMetadata {
  rawRemoteJid: string;
  rawRemoteJidAlt?: string;
  rawParticipant?: string;
  rawParticipantAlt?: string;
  addressingMode?: string;
  baileysContentType?: string;
  pushName?: string;
  ephemeral?: boolean;
  viewOnce?: boolean;
}

export interface NormalizedMessage {
  externalMessageId: string;
  externalConversationId: string;
  conversationType: ConversationType;
  sender: NormalizedParty | null;
  conversationPeer: NormalizedParty | null;
  direction: MessageDirection;
  origin: MessageOrigin;
  type: NormalizedMessageType;
  text: string | null;
  quote: NormalizedQuote | null;
  timestamp: number;
  timestampWasSynthesized: boolean;
  metadata: NormalizedMessageMetadata;
}

export interface PersistResult {
  status: "inserted" | "deduped" | "skipped";
  messageId?: number;
  conversationId?: number;
  reason?: string;
}
