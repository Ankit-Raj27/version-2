import type { WAMessage } from "@whiskeysockets/baileys";
import { describe, expect, it, vi } from "vitest";
import { normalizeWhatsAppMessage } from "../src/whatsapp/normalize.js";

function makeMessage(
  overrides: Partial<WAMessage> & { key?: Partial<WAMessage["key"]> } = {}
): WAMessage {
  const { key, ...rest } = overrides;

  return {
    key: {
      remoteJid: "123@s.whatsapp.net",
      fromMe: false,
      id: "A1",
      ...key
    },
    message: { conversation: "hi" },
    messageTimestamp: 1_700_000_000,
    ...rest
  } as WAMessage;
}

describe("normalizeWhatsAppMessage", () => {
  it("fails closed for a malformed event", () => {
    expect(
      normalizeWhatsAppMessage({} as WAMessage)
    ).toBeNull();
  });

  it("normalizes an incoming direct text message", () => {
    const result = normalizeWhatsAppMessage(makeMessage());

    expect(result).toMatchObject({
      externalMessageId: "A1",
      externalConversationId: "123@s.whatsapp.net",
      conversationType: "direct",
      direction: "incoming",
      origin: "CONTACT",
      type: "text",
      text: "hi",
      timestamp: 1_700_000_000_000,
      timestampWasSynthesized: false,
      sender: { jid: "123@s.whatsapp.net" },
      conversationPeer: { jid: "123@s.whatsapp.net" }
    });
  });

  it("normalizes outgoing phone messages without a sender contact", () => {
    const result = normalizeWhatsAppMessage(
      makeMessage({ key: { fromMe: true } })
    );

    expect(result).toMatchObject({
      direction: "outgoing",
      origin: "USER_PHONE",
      sender: null,
      conversationPeer: { jid: "123@s.whatsapp.net" }
    });
  });

  it("normalizes extended text and quote metadata", () => {
    const result = normalizeWhatsAppMessage(
      makeMessage({
        message: {
          extendedTextMessage: {
            text: "  sounds good  ",
            contextInfo: {
              stanzaId: "A0",
              participant: "456:7@s.whatsapp.net"
            }
          }
        }
      })
    );

    expect(result).toMatchObject({
      type: "text",
      text: "sounds good",
      quote: {
        externalMessageId: "A0",
        authorJid: "456@s.whatsapp.net"
      }
    });
  });

  it("ignores a malformed quote without dropping the message", () => {
    const result = normalizeWhatsAppMessage(
      makeMessage({
        message: {
          extendedTextMessage: {
            text: "reply",
            contextInfo: { stanzaId: "   " }
          }
        }
      })
    );

    expect(result).toMatchObject({ text: "reply", quote: null });
  });

  it("preserves LID identity and captures the alternate phone JID", () => {
    const result = normalizeWhatsAppMessage(
      makeMessage({
        key: {
          remoteJid: "55555@lid",
          remoteJidAlt: "123@s.whatsapp.net",
          addressingMode: "lid"
        },
        pushName: "Friend"
      })
    );

    expect(result).toMatchObject({
      externalConversationId: "55555@lid",
      sender: {
        jid: "55555@lid",
        altJid: "123@s.whatsapp.net",
        displayName: "Friend"
      },
      metadata: {
        rawRemoteJid: "55555@lid",
        rawRemoteJidAlt: "123@s.whatsapp.net",
        addressingMode: "lid",
        pushName: "Friend"
      }
    });
  });

  it("uses the participant as the sender for incoming group messages", () => {
    const result = normalizeWhatsAppMessage(
      makeMessage({
        key: {
          remoteJid: "group@g.us",
          participant: "456:3@s.whatsapp.net",
          participantAlt: "999@lid"
        }
      })
    );

    expect(result).toMatchObject({
      externalConversationId: "group@g.us",
      conversationType: "group",
      conversationPeer: null,
      sender: {
        jid: "456@s.whatsapp.net",
        altJid: "999@lid"
      }
    });
  });

  it("stores content-bearing media as unsupported", () => {
    const result = normalizeWhatsAppMessage(
      makeMessage({ message: { imageMessage: { caption: "look" } } })
    );

    expect(result).toMatchObject({
      type: "unsupported",
      text: null,
      metadata: { baileysContentType: "imageMessage" }
    });
  });

  it.each([
    { message: null },
    { message: {} },
    { message: { conversation: "   " } },
    { message: { reactionMessage: { key: { id: "A0" }, text: "👍" } } },
    { message: { protocolMessage: { key: { id: "A0" } } } },
    { key: { id: null } }
  ] satisfies Array<Partial<WAMessage> & { key?: Partial<WAMessage["key"]> }>) (
    "returns null for non-persistable input %#",
    (overrides) => {
      expect(normalizeWhatsAppMessage(makeMessage(overrides))).toBeNull();
    }
  );

  it("coerces Long-like timestamps", () => {
    const result = normalizeWhatsAppMessage(
      makeMessage({
        messageTimestamp: {
          toNumber: () => 1_700_000_001
        } as NonNullable<WAMessage["messageTimestamp"]>
      })
    );

    expect(result?.timestamp).toBe(1_700_000_001_000);
    expect(result?.timestampWasSynthesized).toBe(false);
  });

  it("synthesizes a timestamp when Baileys omits one", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);

    const result = normalizeWhatsAppMessage(
      makeMessage({ messageTimestamp: null })
    );

    expect(result?.timestamp).toBe(1_800_000_000_000);
    expect(result?.timestampWasSynthesized).toBe(true);
    vi.restoreAllMocks();
  });

  it("unwraps ephemeral messages", () => {
    const result = normalizeWhatsAppMessage(
      makeMessage({
        message: {
          ephemeralMessage: {
            message: { conversation: "wrapped" }
          }
        }
      })
    );

    expect(result).toMatchObject({
      type: "text",
      text: "wrapped",
      metadata: { ephemeral: true }
    });
  });
});
