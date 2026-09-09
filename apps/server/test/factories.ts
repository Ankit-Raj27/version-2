import { completeDraft, getDraftById, reserveDraft } from "../src/agent/drafting/draft.repository.js";
import type { DraftRow } from "../src/agent/drafting/draft.types.js";
import { persistMessage } from "../src/messaging/persistence.js";
import type { NormalizedMessage } from "../src/messaging/message.types.js";

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
