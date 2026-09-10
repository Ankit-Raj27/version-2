import { eq } from "drizzle-orm";
import { completeDraft, getDraftById, reserveDraft } from "../src/agent/drafting/draft.repository.js";
import type { DraftRow } from "../src/agent/drafting/draft.types.js";
import { db } from "../src/db/client.js";
import { contacts, conversations, type Relationship, type ReplyMode } from "../src/db/schema.js";
import { persistMessage } from "../src/messaging/persistence.js";
import type { NormalizedMessage } from "../src/messaging/message.types.js";

/**
 * Overrides the contact policy on the contact behind a direct conversation. New contacts
 * default to relationship=UNKNOWN / replyMode=OFF (Phase 7), which blocks drafting — most
 * drafting/sendability fixtures need a contact that is explicitly allowed to draft.
 */
export function setConversationContactPolicy(
  conversationId: number,
  patch: { relationship?: Relationship; replyMode?: ReplyMode } = {
    relationship: "FRIEND",
    replyMode: "DRAFT"
  }
): void {
  const conv = db
    .select({ contactId: conversations.contactId })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .get();

  if (conv?.contactId == null) {
    throw new Error(`Conversation ${conversationId} has no contact to configure`);
  }

  db.update(contacts)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(contacts.id, conv.contactId))
    .run();
}

/** Persists an incoming message and sets its contact to a draft-eligible policy. */
export function persistDraftableIncoming(
  overrides: Partial<NormalizedMessage> = {}
): { conversationId: number; messageId: number } {
  const result = persistMessage(makeMessage(overrides));
  setConversationContactPolicy(result.conversationId!);
  return { conversationId: result.conversationId!, messageId: result.messageId! };
}

export function makeMessage(
  overrides: Partial<NormalizedMessage> = {}
): NormalizedMessage {
  return {
    externalMessageId: "A1",
    externalConversationId: "919876543210@s.whatsapp.net",
    conversationType: "direct",
    sender: {
      jid: "919876543210@s.whatsapp.net",
      displayName: "Friend"
    },
    conversationPeer: {
      jid: "919876543210@s.whatsapp.net",
      displayName: "Friend"
    },
    direction: "incoming",
    origin: "CONTACT",
    type: "text",
    text: "hello",
    quote: null,
    timestamp: 1_700_000_000_000,
    timestampWasSynthesized: false,
    metadata: { rawRemoteJid: "919876543210@s.whatsapp.net" },
    ...overrides
  };
}

/** Persists an incoming trigger message and reserves+completes a 'ready' draft for it. */
export function makeReadyDraft(
  overrides: Partial<NormalizedMessage> = {},
  generatedText = "sure, see you then"
): { conversationId: number; triggerMessageId: number; draft: DraftRow } {
  const message = persistMessage(makeMessage(overrides));
  const conversationId = message.conversationId!;
  const triggerMessageId = message.messageId!;
  setConversationContactPolicy(conversationId);

  const reserved = reserveDraft({
    conversationId,
    triggerMessageId,
    promptVersion: "reply-draft@v1"
  })!;

  completeDraft(reserved.id, {
    generatedText,
    model: "muse-spark-1.3",
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      reasoningTokens: null,
      cachedInputTokens: null
    },
    latencyMs: 900,
    contextMessageCount: 1
  });

  return { conversationId, triggerMessageId, draft: getDraftById(reserved.id)! };
}
