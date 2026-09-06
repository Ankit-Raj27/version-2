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
