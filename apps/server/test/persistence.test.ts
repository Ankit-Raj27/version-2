import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/db/client.js";
import { contacts, conversations, messages } from "../src/db/schema.js";
import type { NormalizedMessage } from "../src/messaging/message.types.js";
import { persistMessage } from "../src/messaging/persistence.js";

function makeMessage(
  overrides: Partial<NormalizedMessage> = {}
): NormalizedMessage {
  return {
    externalMessageId: "A1",
    externalConversationId: "123@s.whatsapp.net",
    conversationType: "direct",
    sender: {
      jid: "123@s.whatsapp.net",
      displayName: "Friend"
    },
    conversationPeer: {
      jid: "123@s.whatsapp.net",
      displayName: "Friend"
    },
    direction: "incoming",
    origin: "CONTACT",
    type: "text",
    text: "hi",
    quote: null,
    timestamp: 1_700_000_000_000,
    timestampWasSynthesized: false,
    metadata: {
      rawRemoteJid: "123@s.whatsapp.net",
      baileysContentType: "conversation"
    },
    ...overrides
  };
}

beforeEach(() => {
  db.delete(messages).run();
  db.delete(conversations).run();
  db.delete(contacts).run();
});

describe("persistMessage", () => {
  it("creates and reuses a direct contact and conversation", () => {
    const first = persistMessage(makeMessage());
    const second = persistMessage(
      makeMessage({ externalMessageId: "A2", text: "again" })
    );

    expect(first.status).toBe("inserted");
    expect(second.status).toBe("inserted");
    expect(db.select().from(contacts).all()).toHaveLength(1);
    expect(db.select().from(conversations).all()).toHaveLength(1);
    expect(db.select().from(messages).all()).toHaveLength(2);
    expect(db.select().from(contacts).get()).toMatchObject({
      whatsappJid: "123@s.whatsapp.net",
      replyMode: "OFF"
    });
    expect(db.select().from(conversations).get()).toMatchObject({
      externalConversationId: "123@s.whatsapp.net",
      type: "direct"
    });
  });

  it("deduplicates the same external message within a conversation", () => {
    const first = persistMessage(makeMessage());
    const second = persistMessage(makeMessage());

    expect(first.status).toBe("inserted");
    expect(second).toMatchObject({
      status: "deduped",
      messageId: first.messageId,
      conversationId: first.conversationId
    });
    expect(db.select().from(messages).all()).toHaveLength(1);
  });

  it("stores outgoing phone messages with no sender contact", () => {
    persistMessage(
      makeMessage({
        direction: "outgoing",
        origin: "USER_PHONE",
        sender: null
      })
    );

    expect(db.select().from(messages).get()).toMatchObject({
      direction: "outgoing",
      origin: "USER_PHONE",
      senderId: null
    });
    expect(db.select().from(contacts).all()).toHaveLength(1);
  });

  it("keeps lastMessageAt monotonic", () => {
    persistMessage(makeMessage({ externalMessageId: "new", timestamp: 2_000 }));
    persistMessage(makeMessage({ externalMessageId: "old", timestamp: 1_000 }));

    expect(db.select().from(conversations).get()?.lastMessageAt?.getTime()).toBe(
      2_000
    );
  });

  it("resolves a local quoted message and preserves its external id", () => {
    const quoted = persistMessage(makeMessage({ externalMessageId: "A0" }));
    persistMessage(
      makeMessage({
        externalMessageId: "A1",
        quote: { externalMessageId: "A0" }
      })
    );

    const reply = db
      .select()
      .from(messages)
      .where(eq(messages.externalMessageId, "A1"))
      .get();

    expect(reply).toMatchObject({
      quotedExternalMessageId: "A0",
      quotedMessageId: quoted.messageId
    });
  });

  it("keeps an unresolved quote without failing", () => {
    persistMessage(
      makeMessage({ quote: { externalMessageId: "not-local" } })
    );

    expect(db.select().from(messages).get()).toMatchObject({
      quotedExternalMessageId: "not-local",
      quotedMessageId: null
    });
  });

  it("stores groups without a peer contact and links the participant", () => {
    persistMessage(
      makeMessage({
        externalConversationId: "group@g.us",
        conversationType: "group",
        conversationPeer: null,
        sender: {
          jid: "456@s.whatsapp.net",
          altJid: "999@lid",
          displayName: "Participant"
        },
        metadata: {
          rawRemoteJid: "group@g.us",
          rawParticipant: "456@s.whatsapp.net"
        }
      })
    );

    const contact = db.select().from(contacts).get();
    const conversation = db.select().from(conversations).get();
    const storedMessage = db.select().from(messages).get();

    expect(contact).toMatchObject({ whatsappJid: "456@s.whatsapp.net" });
    expect(conversation).toMatchObject({
      externalConversationId: "group@g.us",
      contactId: null,
      type: "group"
    });
    expect(storedMessage?.senderId).toBe(contact?.id);
  });

  it("stores unsupported content and bounded metadata", () => {
    persistMessage(
      makeMessage({
        type: "unsupported",
        text: null,
        timestampWasSynthesized: true,
        metadata: {
          rawRemoteJid: "123@s.whatsapp.net",
          baileysContentType: "imageMessage"
        }
      })
    );

    expect(db.select().from(messages).get()).toMatchObject({
      type: "unsupported",
      text: null,
      metadata: {
        rawRemoteJid: "123@s.whatsapp.net",
        baileysContentType: "imageMessage",
        timestampWasSynthesized: true
      }
    });
  });

  it("skips missing external identifiers without writing rows", () => {
    expect(
      persistMessage(makeMessage({ externalMessageId: "" }))
    ).toMatchObject({ status: "skipped" });
    expect(
      persistMessage(makeMessage({ externalConversationId: "" }))
    ).toMatchObject({ status: "skipped" });

    expect(db.select().from(messages).all()).toHaveLength(0);
    expect(db.select().from(conversations).all()).toHaveLength(0);
    expect(db.select().from(contacts).all()).toHaveLength(0);
  });
});
