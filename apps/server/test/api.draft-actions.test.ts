import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDraftById } from "../src/agent/drafting/draft.repository.js";
import { db } from "../src/db/client.js";
import { contacts, conversations, drafts, messages } from "../src/db/schema.js";
import { makeReadyDraft } from "./factories.js";

const completeMock = vi.fn();
const sendTextMock = vi.fn();

vi.mock("../src/ai/index.js", () => ({
  aiClient: { complete: (...args: unknown[]) => completeMock(...args) }
}));

vi.mock("../src/whatsapp/whatsapp.service.js", () => ({
  whatsappService: {
    sendText: (...args: unknown[]) => sendTextMock(...args),
    getStatus: () => ({ state: "connected", connected: true })
  }
}));

const { buildApp } = await import("../src/app.js");
const { env } = await import("../src/config/env.js");

const app = await buildApp();

beforeEach(() => {
  db.delete(drafts).run();
  db.delete(messages).run();
  db.delete(conversations).run();
  db.delete(contacts).run();
  completeMock.mockReset();
  sendTextMock.mockReset();
  env.WHATSAPP_KILL_SWITCH = false;
});

afterAll(async () => {
  await app.close();
});

describe("POST /api/conversations/:conversationId/drafts/:draftId/approve", () => {
  it("sends the draft and returns it as sent", async () => {
    sendTextMock.mockResolvedValue({ externalMessageId: "wa-route-1", timestamp: Date.now() });
    const { draft, conversationId } = makeReadyDraft();

    const response = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversationId}/drafts/${draft.id}/approve`,
      payload: {}
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().draft).toMatchObject({ status: "sent" });
  });

  it("sends the edited text when provided", async () => {
    sendTextMock.mockResolvedValue({ externalMessageId: "wa-route-2", timestamp: Date.now() });
    const { draft, conversationId } = makeReadyDraft();

    const response = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversationId}/drafts/${draft.id}/approve`,
      payload: { editedText: "edited via route" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().draft).toMatchObject({ status: "sent", finalText: "edited via route" });
  });

  it("400s on whitespace-only editedText", async () => {
    const { draft, conversationId } = makeReadyDraft();

    const response = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversationId}/drafts/${draft.id}/approve`,
      payload: { editedText: "   " }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_EDITED_TEXT");
    expect(sendTextMock).not.toHaveBeenCalled();
  });

  it("400s on a non-numeric draft id", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/conversations/1/drafts/abc/approve",
      payload: {}
    });

    expect(response.statusCode).toBe(400);
  });

  it("404s for a draft that does not exist", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/conversations/1/drafts/999999/approve",
      payload: {}
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("DRAFT_NOT_FOUND");
  });

  it("404s when the draft belongs to a different conversation", async () => {
    const { draft } = makeReadyDraft();

    const response = await app.inject({
      method: "POST",
      url: `/api/conversations/${draft.conversationId + 1}/drafts/${draft.id}/approve`,
      payload: {}
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("DRAFT_CONVERSATION_MISMATCH");
  });

  it("409s when the draft is already ignored", async () => {
    const { draft, conversationId } = makeReadyDraft();
    await app.inject({
      method: "POST",
      url: `/api/conversations/${conversationId}/drafts/${draft.id}/ignore`,
      payload: {}
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversationId}/drafts/${draft.id}/approve`,
      payload: {}
    });

    expect(response.statusCode).toBe(409);
    expect(sendTextMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/conversations/:conversationId/drafts/:draftId/regenerate", () => {
  it("supersedes the old draft and returns the new generating draft", async () => {
    completeMock.mockResolvedValue({
      text: '{"reply":"regenerated"}',
      model: "muse-spark-1.3",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, reasoningTokens: null, cachedInputTokens: null },
      latencyMs: 100,
      finishReason: "stop"
    });
    const { draft, conversationId } = makeReadyDraft();

    const response = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversationId}/drafts/${draft.id}/regenerate`
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().draft.status).toBe("generating");
    expect(getDraftById(draft.id)!.status).toBe("superseded");
    expect(sendTextMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/conversations/:conversationId/drafts/:draftId/ignore", () => {
  it("ignores the draft and never sends", async () => {
    const { draft, conversationId } = makeReadyDraft();

    const response = await app.inject({
      method: "POST",
      url: `/api/conversations/${conversationId}/drafts/${draft.id}/ignore`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().draft).toMatchObject({ status: "ignored" });
    expect(sendTextMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/conversations/:id/draft (Phase 5 fields)", () => {
  it("reports sendable:true for a clean ready draft", async () => {
    const { conversationId } = makeReadyDraft();

    const response = await app.inject({
      method: "GET",
      url: `/api/conversations/${conversationId}/draft`
    });

    expect(response.json().draft).toMatchObject({ sendable: true, staleReason: null });
  });

  it("reports staleReason when the kill switch blocks sending", async () => {
    env.WHATSAPP_KILL_SWITCH = true;
    const { conversationId } = makeReadyDraft();

    const response = await app.inject({
      method: "GET",
      url: `/api/conversations/${conversationId}/draft`
    });

    expect(response.json().draft).toMatchObject({ sendable: false, staleReason: "kill_switch_enabled" });
  });
});
