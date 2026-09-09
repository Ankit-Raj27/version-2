import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../src/db/client.js";
import { contacts, conversations, drafts, messages } from "../src/db/schema.js";
import { persistMessage } from "../src/messaging/persistence.js";
import { makeMessage as makeMessageBase } from "./factories.js";
import type { NormalizedMessage } from "../src/messaging/message.types.js";

function makeMessage(overrides: Partial<NormalizedMessage> = {}): NormalizedMessage {
  return makeMessageBase({ timestamp: Date.now(), ...overrides });
}

const completeMock = vi.fn();

vi.mock("../src/ai/index.js", () => ({
  aiClient: { complete: (...args: unknown[]) => completeMock(...args) }
}));

const { onMessagePersisted } = await import("../src/agent/drafting/draft.service.js");
const { getLatestDraftForConversation } = await import("../src/agent/drafting/draft.repository.js");
const { subscribe } = await import("../src/realtime/event-bus.js");
const { env } = await import("../src/config/env.js");

function aiResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    text: '{"reply":"sure, see you then"}',
    model: "muse-spark-1.3",
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      reasoningTokens: null,
      cachedInputTokens: null
    },
    latencyMs: 900,
    finishReason: "stop",
    ...overrides
  };
}

beforeEach(() => {
  db.delete(drafts).run();
  db.delete(messages).run();
  db.delete(conversations).run();
  db.delete(contacts).run();
  completeMock.mockReset();
  env.AI_DRAFTING_ENABLED = true;
});

describe("onMessagePersisted", () => {
  it("generates and stores a ready draft, publishing generating then ready", async () => {
    completeMock.mockResolvedValue(aiResult());

    const message = persistMessage(makeMessage());
    const events: unknown[] = [];
    const unsubscribe = subscribe((event) => events.push(event));

    await onMessagePersisted({
      message: makeMessage(),
      conversationId: message.conversationId!,
      triggerMessageId: message.messageId!
    });
    unsubscribe();

    const draft = getLatestDraftForConversation(message.conversationId!);
    expect(draft).toMatchObject({ status: "ready", generatedText: "sure, see you then" });
    expect(events).toEqual([
      {
        type: "draft.updated",
        conversationId: message.conversationId,
        draftId: draft!.id,
        status: "generating"
      },
      {
        type: "draft.updated",
        conversationId: message.conversationId,
        draftId: draft!.id,
        status: "ready"
      }
    ]);
  });

  it("marks the draft failed when the model output fails schema validation", async () => {
    completeMock.mockResolvedValue(aiResult({ text: "not json" }));

    const message = persistMessage(makeMessage());
    await onMessagePersisted({
      message: makeMessage(),
      conversationId: message.conversationId!,
      triggerMessageId: message.messageId!
    });

    expect(getLatestDraftForConversation(message.conversationId!)).toMatchObject({
      status: "failed",
      errorKind: "invalid_response"
    });
  });

  it("does nothing for an ineligible message and never calls the AI client", async () => {
    const outgoing = makeMessage({ direction: "outgoing", origin: "USER_PHONE", sender: null });
    const message = persistMessage(outgoing);

    await onMessagePersisted({
      message: outgoing,
      conversationId: message.conversationId!,
      triggerMessageId: message.messageId!
    });

    expect(getLatestDraftForConversation(message.conversationId!)).toBeNull();
    expect(completeMock).not.toHaveBeenCalled();
  });

  it("does not call the AI client twice for a message that already has a draft", async () => {
    completeMock.mockResolvedValue(aiResult());

    const message = persistMessage(makeMessage());
    await Promise.all([
      onMessagePersisted({
        message: makeMessage(),
        conversationId: message.conversationId!,
        triggerMessageId: message.messageId!
      }),
      onMessagePersisted({
        message: makeMessage(),
        conversationId: message.conversationId!,
        triggerMessageId: message.messageId!
      })
    ]);

    expect(completeMock).toHaveBeenCalledTimes(1);
  });

  it("supersedes a draft when a newer message arrives while the AI is generating", async () => {
    const message = persistMessage(makeMessage());
    const conversationId = message.conversationId!;

    // Simulate a newer incoming message landing mid-generation.
    completeMock.mockImplementation(async () => {
      persistMessage(
        makeMessage({ externalMessageId: "arrived-during-generation", timestamp: Date.now() + 1_000 })
      );
      return aiResult();
    });

    const events: unknown[] = [];
    const unsubscribe = subscribe((event) => events.push(event));

    await onMessagePersisted({
      message: makeMessage(),
      conversationId,
      triggerMessageId: message.messageId!
    });
    unsubscribe();

    const draft = getLatestDraftForConversation(conversationId)!;
    // Text is still persisted for analytics, but the draft is not sendable.
    expect(draft).toMatchObject({ status: "superseded", generatedText: "sure, see you then" });
    expect(events.map((e) => (e as { status: string }).status)).toEqual(["generating", "superseded"]);
  });

  it("fails the draft when the AI client rejects with a non-AiError", async () => {
    completeMock.mockRejectedValue(new Error("boom"));

    const message = persistMessage(makeMessage());
    await onMessagePersisted({
      message: makeMessage(),
      conversationId: message.conversationId!,
      triggerMessageId: message.messageId!
    });

    expect(getLatestDraftForConversation(message.conversationId!)).toMatchObject({
      status: "failed",
      errorKind: "server",
      errorMessage: "boom"
    });
  });
});
