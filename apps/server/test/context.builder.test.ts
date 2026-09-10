import { beforeEach, describe, expect, it } from "vitest";
import { buildDraftContext } from "../src/agent/context/context.builder.js";
import {
  listFacts,
  proposeFacts,
  setFactStatus
} from "../src/agent/memory/memory.repository.js";
import { db } from "../src/db/client.js";
import { contacts, conversations, memoryFacts, messages } from "../src/db/schema.js";
import { persistMessage } from "../src/messaging/persistence.js";
import { getConversationContact } from "../src/messaging/queries.js";
import type { NormalizedMessage } from "../src/messaging/message.types.js";
import { makeMessage, persistDraftableIncoming } from "./factories.js";

beforeEach(() => {
  db.delete(memoryFacts).run();
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

describe("style measurement excludes the AI's own output", () => {
  /** Persists an outgoing message with the given origin. */
  function outgoing(externalMessageId: string, text: string, origin: NormalizedMessage["origin"]) {
    return persistMessage(
      makeMessage({
        externalMessageId,
        text,
        timestamp: 2_000 + externalMessageId.length,
        direction: "outgoing",
        origin,
        sender: null
      })
    );
  }

  it("ignores AI_APPROVED replies when measuring style", () => {
    const trigger = persistMessage(makeMessage({ externalMessageId: "t", timestamp: 1_000 }));

    ["a", "bb", "ccc", "dddd", "eeeee"].forEach((text, i) =>
      outgoing(`user-${i}`, text, "USER_PHONE")
    );
    for (let i = 0; i < 10; i += 1) {
      outgoing(`ai-${i}`, "A much longer machine written reply 😏", "AI_APPROVED");
    }

    const context = buildDraftContext(trigger.conversationId!, trigger.messageId!, 20);

    expect(context.style).toEqual({ sampleCount: 5, medianChars: 3, emojiRatio: 0 });
    expect(context.exemplars?.every((e) => !e.reply.includes("machine written"))).toBe(true);
  });

  it("counts AI_EDITED replies, which carry the user's own corrections", () => {
    const trigger = persistMessage(makeMessage({ externalMessageId: "t2", timestamp: 1_000 }));

    ["a", "bb", "ccc", "dddd"].forEach((text, i) => outgoing(`u-${i}`, text, "USER_PHONE"));
    outgoing("edited", "chal be", "AI_EDITED");

    const context = buildDraftContext(trigger.conversationId!, trigger.messageId!, 20);

    expect(context.style?.sampleCount).toBe(5);
    expect(context.exemplars?.map((e) => e.reply)).toContain("chal be");
  });

  it("pairs each exemplar with the message it replied to", () => {
    const trigger = persistMessage(
      makeMessage({ externalMessageId: "q", text: "kya kar raha hai", timestamp: 1_000 })
    );
    outgoing("r", "kuch nahi bas", "USER_PHONE");

    const context = buildDraftContext(trigger.conversationId!, trigger.messageId!, 20);

    expect(context.exemplars).toContainEqual({
      incoming: "kya kar raha hai",
      reply: "kuch nahi bas"
    });
  });
});

describe("buildDraftContext memory", () => {
  it("injects only confirmed facts, never proposed or rejected ones", () => {
    const result = persistDraftableIncoming();
    const contactId = getConversationContact(result.conversationId)!.contactId;

    proposeFacts({
      contactId,
      facts: ["confirmed fact", "still proposed", "rejected fact"],
      sourceMessageId: result.messageId,
      promptVersion: "memory-extract@v1"
    });

    const stored = listFacts(contactId);
    setFactStatus(contactId, stored[0]!.id, "confirmed");
    setFactStatus(contactId, stored[2]!.id, "rejected");

    const context = buildDraftContext(result.conversationId, result.messageId, 20);

    expect(context.memory).toEqual(["confirmed fact"]);
  });

  it("is empty for a contact with no facts", () => {
    const result = persistDraftableIncoming();
    const context = buildDraftContext(result.conversationId, result.messageId, 20);

    expect(context.memory).toEqual([]);
  });
});

describe("buildDraftContext style snapshot", () => {
  /** Seeds one incoming trigger plus the user's own replies, and builds the context. */
  function withOutgoing(texts: string[], extra: () => void = () => {}) {
    const trigger = persistMessage(
      makeMessage({ externalMessageId: "trigger", timestamp: 1_000, text: "yo" })
    );

    texts.forEach((text, index) =>
      persistMessage(
        makeMessage({
          externalMessageId: `out-${index}`,
          timestamp: 2_000 + index,
          text,
          direction: "outgoing",
          origin: "USER_PHONE",
          sender: null
        })
      )
    );

    extra();

    return buildDraftContext(trigger.conversationId!, trigger.messageId!, 20);
  }

  it("omits the snapshot when there is too little history to measure honestly", () => {
    const context = withOutgoing(["a", "bb", "ccc", "dddd"]);
    expect(context.style).toBeUndefined();
  });

  it("reports the median reply length once there are enough samples", () => {
    const context = withOutgoing(["a", "bb", "ccc", "dddd", "eeeee"]);

    expect(context.style).toEqual({ sampleCount: 5, medianChars: 3, emojiRatio: 0 });
  });

  it("averages the two middle lengths for an even sample count", () => {
    const context = withOutgoing(["a", "bb", "ccc", "dddd", "eeeee", "ffffff"]);

    expect(context.style?.sampleCount).toBe(6);
    expect(context.style?.medianChars).toBe(4);
  });

  it("measures the share of replies carrying an emoji", () => {
    const context = withOutgoing(["ok 🔥", "done ✅", "plain", "plain", "plain"]);

    expect(context.style?.emojiRatio).toBeCloseTo(0.4);
  });

  it("measures only the user's own text replies, not the contact's or media", () => {
    const context = withOutgoing(["a", "bb", "ccc", "dddd", "eeeee"], () => {
      // Incoming chatter and an outgoing image must not count as style samples.
      persistMessage(
        makeMessage({ externalMessageId: "noise", timestamp: 3_000, text: "a".repeat(500) })
      );
      persistMessage(
        makeMessage({
          externalMessageId: "img",
          timestamp: 3_001,
          type: "unsupported",
          text: null,
          direction: "outgoing",
          origin: "USER_PHONE",
          sender: null,
          metadata: {
            rawRemoteJid: "919876543210@s.whatsapp.net",
            baileysContentType: "imageMessage"
          }
        })
      );
    });

    expect(context.style).toEqual({ sampleCount: 5, medianChars: 3, emojiRatio: 0 });
  });
});
