import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../src/db/client.js";
import { contacts, conversations, drafts, memoryFacts, messages } from "../src/db/schema.js";
import { persistMessage } from "../src/messaging/persistence.js";
import { makeMessage as makeMessageBase, setConversationContactPolicy } from "./factories.js";
import type { NormalizedMessage } from "../src/messaging/message.types.js";

function makeMessage(overrides: Partial<NormalizedMessage> = {}): NormalizedMessage {
  return makeMessageBase({ timestamp: Date.now(), ...overrides });
}

const completeMock = vi.fn();

vi.mock("../src/ai/index.js", () => ({
  aiClient: { complete: (...args: unknown[]) => completeMock(...args) }
}));

const { maybeExtractMemory } = await import("../src/agent/memory/memory.service.js");
const { listFacts, setFactStatus } = await import("../src/agent/memory/memory.repository.js");
const { getConversationContact } = await import("../src/messaging/queries.js");
const { env } = await import("../src/config/env.js");

function factsResult(facts: string[]) {
  return {
    text: JSON.stringify({ facts }),
    model: "muse-spark-1.3",
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      reasoningTokens: null,
      cachedInputTokens: null
    },
    latencyMs: 400,
    finishReason: "stop"
  };
}

let seedCounter = 0;

/** Persists `count` new messages so the rate limit is satisfied, returns the last one. */
function seedConversation(count = 10) {
  const prefix = `s${(seedCounter += 1)}`;
  let last = persistMessage(makeMessage({ externalMessageId: `${prefix}-0` }));

  for (let i = 1; i < count; i += 1) {
    last = persistMessage(
      makeMessage({ externalMessageId: `${prefix}-${i}`, text: `msg ${i}` })
    );
  }

  setConversationContactPolicy(last.conversationId!);

  return { conversationId: last.conversationId!, triggerMessageId: last.messageId! };
}

function extract(seeded: { conversationId: number; triggerMessageId: number }) {
  return maybeExtractMemory({ ...seeded, conversationType: "direct" });
}

function contactIdFor(conversationId: number): number {
  return getConversationContact(conversationId)!.contactId;
}

beforeEach(() => {
  db.delete(memoryFacts).run();
  db.delete(drafts).run();
  db.delete(messages).run();
  db.delete(conversations).run();
  db.delete(contacts).run();
  completeMock.mockReset();
  env.MEMORY_ENABLED = true;
  env.MEMORY_EXTRACT_EVERY_N_MESSAGES = 10;
  env.MEMORY_MAX_FACTS_PER_CONTACT = 50;
});

describe("maybeExtractMemory gates", () => {
  it("never calls the AI when memory is disabled", async () => {
    env.MEMORY_ENABLED = false;

    const result = await extract(seedConversation());

    expect(result).toEqual({ ran: false, reason: "memory_disabled" });
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("never calls the AI for a contact the policy blocks", async () => {
    const seeded = seedConversation();
    setConversationContactPolicy(seeded.conversationId, { replyMode: "OFF" });

    const result = await extract(seeded);

    expect(result).toEqual({ ran: false, reason: "contact_policy" });
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("never calls the AI for an UNKNOWN contact", async () => {
    const seeded = seedConversation();
    setConversationContactPolicy(seeded.conversationId, {
      relationship: "UNKNOWN",
      replyMode: "DRAFT"
    });

    const result = await extract(seeded);

    expect(result).toEqual({ ran: false, reason: "contact_policy" });
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("never calls the AI for a group conversation", async () => {
    const seeded = seedConversation();

    const result = await maybeExtractMemory({ ...seeded, conversationType: "group" });

    expect(result).toEqual({ ran: false, reason: "contact_policy" });
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("holds off until enough new messages have accumulated", async () => {
    const seeded = seedConversation(4);

    const result = await extract(seeded);

    expect(result).toEqual({ ran: false, reason: "rate_limited" });
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("does not run again immediately after a run", async () => {
    completeMock.mockResolvedValue(factsResult(["Works at Zomato as a backend dev"]));
    const seeded = seedConversation();

    await extract(seeded);
    const second = await extract(seeded);

    expect(second).toEqual({ ran: false, reason: "rate_limited" });
    expect(completeMock).toHaveBeenCalledTimes(1);
  });

  it("stops extracting once the fact cap is reached", async () => {
    env.MEMORY_MAX_FACTS_PER_CONTACT = 2;
    completeMock.mockResolvedValue(factsResult(["fact one", "fact two"]));
    const seeded = seedConversation();

    await extract(seeded);
    completeMock.mockClear();

    const seededAgain = seedConversation(12);
    const result = await extract(seededAgain);

    expect(result).toEqual({ ran: false, reason: "fact_cap_reached" });
    expect(completeMock).not.toHaveBeenCalled();
  });
});

describe("maybeExtractMemory results", () => {
  it("stores extracted facts as proposed, never confirmed", async () => {
    completeMock.mockResolvedValue(
      factsResult(["Works at Zomato as a backend dev", "Has a dog named Biscuit"])
    );
    const seeded = seedConversation();

    const result = await extract(seeded);

    expect(result).toEqual({ ran: true, proposed: 2 });

    const stored = listFacts(contactIdFor(seeded.conversationId));
    expect(stored.map((row) => row.status)).toEqual(["proposed", "proposed"]);
    expect(stored[0]?.sourceMessageId).toBe(seeded.triggerMessageId);
    expect(stored[0]?.promptVersion).toBe("memory-extract@v1");
  });

  it("passes known and rejected facts to the extractor so they are not re-proposed", async () => {
    completeMock.mockResolvedValue(factsResult(["Has a dog named Biscuit"]));
    const seeded = seedConversation();
    await extract(seeded);

    const contactId = contactIdFor(seeded.conversationId);
    setFactStatus(contactId, listFacts(contactId)[0]!.id, "rejected");

    completeMock.mockResolvedValue(factsResult(["Has a dog named Biscuit"]));
    const result = await extract(seedConversation(12));

    const prompt = completeMock.mock.calls.at(-1)?.[0].messages[1].content as string;
    expect(prompt).toContain("- Has a dog named Biscuit");
    expect(result).toEqual({ ran: true, proposed: 0 });
    expect(listFacts(contactId)).toHaveLength(1);
  });

  it("survives unparseable model output without storing anything", async () => {
    completeMock.mockResolvedValue({ ...factsResult([]), text: "not json at all" });

    const seeded = seedConversation();
    const result = await extract(seeded);

    expect(result).toEqual({ ran: true, proposed: 0 });
    expect(listFacts(contactIdFor(seeded.conversationId))).toHaveLength(0);
  });

  it("stores nothing when the model correctly finds no durable facts", async () => {
    completeMock.mockResolvedValue(factsResult([]));

    const seeded = seedConversation();
    const result = await extract(seeded);

    expect(result).toEqual({ ran: true, proposed: 0 });
    expect(listFacts(contactIdFor(seeded.conversationId))).toHaveLength(0);
  });
});
