import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { completeDraft, reserveDraft } from "../src/agent/drafting/draft.repository.js";
import { buildApp } from "../src/app.js";
import { db } from "../src/db/client.js";
import { contacts, conversations, drafts, messages } from "../src/db/schema.js";
import { persistMessage } from "../src/messaging/persistence.js";
import { makeMessage } from "./factories.js";

const app = await buildApp();

beforeEach(() => {
  db.delete(drafts).run();
  db.delete(messages).run();
  db.delete(conversations).run();
  db.delete(contacts).run();
});

afterAll(async () => {
  await app.close();
});

describe("GET /api/conversations/:id/draft", () => {
  it("returns draft: null as a 200 when no draft exists", async () => {
    const message = persistMessage(makeMessage());
    const response = await app.inject({
      method: "GET",
      url: `/api/conversations/${message.conversationId}/draft`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ draft: null });
  });

  it("returns a generating draft", async () => {
    const message = persistMessage(makeMessage());
    reserveDraft({
      conversationId: message.conversationId!,
      triggerMessageId: message.messageId!,
      promptVersion: "reply-draft@v1"
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/conversations/${message.conversationId}/draft`
    });

    expect(response.json().draft).toMatchObject({ status: "generating" });
  });

  it("returns a ready draft without leaking the raw error message field", async () => {
    const message = persistMessage(makeMessage());
    const draft = reserveDraft({
      conversationId: message.conversationId!,
      triggerMessageId: message.messageId!,
      promptVersion: "reply-draft@v1"
    })!;
    completeDraft(draft.id, {
      generatedText: "sure",
      model: "muse-spark-1.3",
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
        reasoningTokens: null,
        cachedInputTokens: null
      },
      latencyMs: 500,
      contextMessageCount: 1
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/conversations/${message.conversationId}/draft`
    });
    const body = response.json();

    expect(body.draft).toMatchObject({
      status: "ready",
      generatedText: "sure",
      model: "muse-spark-1.3"
    });
    expect(body.draft.errorMessage).toBeUndefined();
  });

  it("404s for a missing conversation", async () => {
    const response = await app.inject({ method: "GET", url: "/api/conversations/999999/draft" });
    expect(response.statusCode).toBe(404);
  });

  it("400s for an invalid conversation id", async () => {
    const response = await app.inject({ method: "GET", url: "/api/conversations/abc/draft" });
    expect(response.statusCode).toBe(400);
  });
});
