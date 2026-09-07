import { beforeEach, describe, expect, it } from "vitest";
import { buildDraftContext } from "../src/agent/context/context.builder.js";
import { db } from "../src/db/client.js";
import { contacts, conversations, messages } from "../src/db/schema.js";
import { persistMessage } from "../src/messaging/persistence.js";
import { makeMessage } from "./factories.js";

beforeEach(() => {
  db.delete(messages).run();
  db.delete(conversations).run();
  db.delete(contacts).run();
});

describe("buildDraftContext", () => {
  it("builds contact, conversation, and an ascending transcript ending in the trigger message", () => {
    const first = persistMessage(makeMessage({ externalMessageId: "1", timestamp: 1_000, text: "hi" }));
    const second = persistMessage(
      makeMessage({
        externalMessageId: "2",
        timestamp: 2_000,
        text: "there",
        direction: "outgoing",
        origin: "USER_PHONE",
        sender: null
      })
    );

    const context = buildDraftContext(first.conversationId!, second.messageId!, 20);

    expect(context.contact).toMatchObject({
      displayName: "Friend",
      jid: "919876543210@s.whatsapp.net"
    });
    expect(context.conversation).toEqual({ id: first.conversationId, type: "direct" });
    expect(context.recentMessages.map((message) => message.text)).toEqual(["hi", "there"]);
    expect(context.triggerMessage.id).toBe(second.messageId);
    expect(context.meta).toMatchObject({
      requestedLimit: 20,
      includedCount: 2,
      truncated: false
    });
  });

  it("renders unsupported messages as placeholders instead of empty text", () => {
    const result = persistMessage(
      makeMessage({
        externalMessageId: "img",
        type: "unsupported",
        text: null,
        metadata: {
          rawRemoteJid: "919876543210@s.whatsapp.net",
          baileysContentType: "imageMessage"
        }
      })
    );

    const context = buildDraftContext(result.conversationId!, result.messageId!, 20);
    expect(context.triggerMessage.text).toBe("[image]");
  });

  it("falls back to a generic placeholder for an unrecognised content type", () => {
    const result = persistMessage(
      makeMessage({
        externalMessageId: "poll",
        type: "unsupported",
        text: null,
        metadata: {
          rawRemoteJid: "919876543210@s.whatsapp.net",
          baileysContentType: "pollCreationMessage"
        }
      })
    );

    const context = buildDraftContext(result.conversationId!, result.messageId!, 20);
    expect(context.triggerMessage.text).toBe("[unsupported message]");
  });

  it("resolves a local quote and flags an unresolved one", () => {
    const original = persistMessage(makeMessage({ externalMessageId: "a0", text: "original text" }));
    const resolved = persistMessage(
      makeMessage({ externalMessageId: "a1", quote: { externalMessageId: "a0" }, text: "reply" })
    );
    const unresolved = persistMessage(
      makeMessage({ externalMessageId: "a2", quote: { externalMessageId: "missing" }, text: "another reply" })
    );

    const context = buildDraftContext(original.conversationId!, unresolved.messageId!, 20);
    const resolvedMessage = context.recentMessages.find((message) => message.id === resolved.messageId);
    const unresolvedMessage = context.recentMessages.find((message) => message.id === unresolved.messageId);

    expect(resolvedMessage?.quotedText).toBe("original text");
    expect(resolvedMessage?.quotedUnresolved).toBe(false);
    expect(unresolvedMessage?.quotedUnresolved).toBe(true);
    expect(unresolvedMessage?.quotedText).toBeNull();
  });

  it("truncates an individual message body at 1000 characters", () => {
    const longText = "y".repeat(1500);
    const result = persistMessage(makeMessage({ externalMessageId: "long", text: longText }));

    const context = buildDraftContext(result.conversationId!, result.messageId!, 20);
    expect(context.triggerMessage.text).toBe(`${"y".repeat(1000)}…`);
  });

  it("truncates from the oldest end when the transcript exceeds the char budget, keeping the trigger", () => {
    const longText = "x".repeat(1000);
    let last: ReturnType<typeof persistMessage> | undefined;

    for (let i = 0; i < 10; i += 1) {
      last = persistMessage(
        makeMessage({ externalMessageId: `m${i}`, timestamp: 1_000 + i, text: longText })
      );
    }

    const context = buildDraftContext(last!.conversationId!, last!.messageId!, 20);
    expect(context.meta.truncated).toBe(true);
    expect(context.recentMessages.length).toBeLessThan(10);
    expect(context.recentMessages.at(-1)?.id).toBe(last!.messageId);
  });

  it("bounds the query with SQL LIMIT rather than filtering a full fetch in JS", () => {
    for (let i = 0; i < 50; i += 1) {
      persistMessage(makeMessage({ externalMessageId: `bulk-${i}`, timestamp: 1_000 + i, text: `msg ${i}` }));
    }

    const last = persistMessage(makeMessage({ externalMessageId: "bulk-last", timestamp: 5_000, text: "last" }));
    const context = buildDraftContext(last.conversationId!, last.messageId!, 10);

    expect(context.recentMessages).toHaveLength(10);
    expect(context.recentMessages.at(-1)?.id).toBe(last.messageId);
  });

  it("throws when the conversation has no resolvable direct contact", () => {
    const result = persistMessage(
      makeMessage({
        externalConversationId: "group@g.us",
        conversationType: "group",
        conversationPeer: null,
        sender: { jid: "555@s.whatsapp.net" }
      })
    );

    expect(() => buildDraftContext(result.conversationId!, result.messageId!, 20)).toThrow();
  });
});
