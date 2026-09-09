import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDraftById, reserveDraft } from "../src/agent/drafting/draft.repository.js";
import { db } from "../src/db/client.js";
import { contacts, conversations, drafts, messages } from "../src/db/schema.js";
import { persistMessage } from "../src/messaging/persistence.js";
import { makeMessage, makeReadyDraft } from "./factories.js";

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

const { approveDraft, ignoreDraft, regenerateDraft } = await import(
  "../src/agent/drafting/draft-approval.service.js"
);
const { env } = await import("../src/config/env.js");

function aiResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    text: '{"reply":"a fresh reply"}',
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
  sendTextMock.mockReset();
  env.WHATSAPP_KILL_SWITCH = false;
});

describe("approveDraft", () => {
  it("sends exactly once and persists the outgoing message as AI_APPROVED", async () => {
    sendTextMock.mockResolvedValue({ externalMessageId: "wa-1", timestamp: Date.now() });
    const { draft, conversationId } = makeReadyDraft();

    const result = await approveDraft(conversationId, draft.id, undefined);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.status).toBe("sent");
    }
    expect(sendTextMock).toHaveBeenCalledTimes(1);

    const outgoing = db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .all()
      .find((m) => m.direction === "outgoing");
    expect(outgoing).toMatchObject({ origin: "AI_APPROVED", text: draft.generatedText });
  });

  it("persists the edited text with origin AI_EDITED", async () => {
    sendTextMock.mockResolvedValue({ externalMessageId: "wa-2", timestamp: Date.now() });
    const { draft, conversationId } = makeReadyDraft();

    const result = await approveDraft(conversationId, draft.id, "an edited reply");

    expect(result.ok).toBe(true);
    const outgoing = db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .all()
      .find((m) => m.direction === "outgoing");
    expect(outgoing).toMatchObject({ origin: "AI_EDITED", text: "an edited reply" });
    expect(getDraftById(draft.id)!.finalText).toBe("an edited reply");
  });

  it("does not send twice when two approvals race", async () => {
    sendTextMock.mockResolvedValue({ externalMessageId: "wa-3", timestamp: Date.now() });
    const { draft, conversationId } = makeReadyDraft();

    const [first, second] = await Promise.all([
      approveDraft(conversationId, draft.id, undefined),
      approveDraft(conversationId, draft.id, undefined)
    ]);

    expect(sendTextMock).toHaveBeenCalledTimes(1);
    const results = [first, second];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
  });

  it("reverts to ready and records the error when the WhatsApp send fails", async () => {
    sendTextMock.mockRejectedValue(new Error("socket closed"));
    const { draft, conversationId } = makeReadyDraft();

    const result = await approveDraft(conversationId, draft.id, undefined);

    expect(result).toMatchObject({ ok: false, code: "WHATSAPP_SEND_FAILED" });
    const updated = getDraftById(draft.id)!;
    expect(updated.status).toBe("ready");
    expect(updated.errorKind).toBe("send_failed");
    const outgoing = db.select().from(messages).where(eq(messages.conversationId, conversationId)).all();
    expect(outgoing.some((m) => m.direction === "outgoing")).toBe(false);
  });

  it("rejects a draft that does not belong to the given conversation", async () => {
    const { draft } = makeReadyDraft();
    const other = makeReadyDraft({ externalMessageId: "other", externalConversationId: "other@s.whatsapp.net", conversationPeer: { jid: "other@s.whatsapp.net" }, sender: { jid: "other@s.whatsapp.net" } });

    const result = await approveDraft(other.conversationId, draft.id, undefined);

    expect(result).toMatchObject({ ok: false, code: "DRAFT_CONVERSATION_MISMATCH" });
    expect(sendTextMock).not.toHaveBeenCalled();
  });

  it("rejects an ignored draft without sending", async () => {
    const { draft, conversationId } = makeReadyDraft();
    ignoreDraft(conversationId, draft.id);

    const result = await approveDraft(conversationId, draft.id, undefined);

    expect(result.ok).toBe(false);
    expect(sendTextMock).not.toHaveBeenCalled();
  });

  it("rejects a superseded draft without sending", async () => {
    completeMock.mockResolvedValue(aiResult());
    const { draft, conversationId } = makeReadyDraft();
    regenerateDraft(conversationId, draft.id);

    const result = await approveDraft(conversationId, draft.id, undefined);

    expect(result).toMatchObject({ ok: false, code: "DRAFT_NOT_ACTIONABLE" });
    expect(sendTextMock).not.toHaveBeenCalled();
  });
});

describe("ignoreDraft", () => {
  it("marks the draft ignored and never calls WhatsApp", () => {
    const { draft, conversationId } = makeReadyDraft();

    const result = ignoreDraft(conversationId, draft.id);

    expect(result).toMatchObject({ ok: true, draft: { status: "ignored" } });
    expect(sendTextMock).not.toHaveBeenCalled();
  });

  it("an ignored draft cannot later be approved", async () => {
    const { draft, conversationId } = makeReadyDraft();
    ignoreDraft(conversationId, draft.id);

    const result = await approveDraft(conversationId, draft.id, undefined);

    expect(result.ok).toBe(false);
  });
});

describe("regenerateDraft", () => {
  it("supersedes the previous draft and generates a replacement without sending", async () => {
    completeMock.mockResolvedValue(aiResult());
    const { draft, conversationId } = makeReadyDraft();

    const result = regenerateDraft(conversationId, draft.id);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.draft.id).not.toBe(draft.id);
    expect(result.draft.status).toBe("generating");
    expect(getDraftById(draft.id)!.status).toBe("superseded");

    await vi.waitFor(() => {
      expect(getDraftById(result.draft.id)?.status).toBe("ready");
    });
    expect(getDraftById(result.draft.id)?.generatedText).toBe("a fresh reply");
    expect(sendTextMock).not.toHaveBeenCalled();
  });

  it("leaves the replacement failed and sends nothing when the AI call rejects", async () => {
    completeMock.mockRejectedValue(new Error("provider down"));
    const { draft, conversationId } = makeReadyDraft();

    const result = regenerateDraft(conversationId, draft.id);
    if (!result.ok) throw new Error("expected ok");

    await vi.waitFor(() => {
      expect(getDraftById(result.draft.id)?.status).toBe("failed");
    });
    expect(sendTextMock).not.toHaveBeenCalled();
    expect(completeMock).toHaveBeenCalledTimes(1);
  });

  it("rejects regenerating a still-generating draft", () => {
    const { conversationId } = makeReadyDraft();
    const secondTrigger = persistMessage(
      makeMessage({ externalMessageId: "second-trigger", timestamp: 1_700_000_002_000 })
    );
    const generating = reserveDraft({
      conversationId,
      triggerMessageId: secondTrigger.messageId!,
      promptVersion: "reply-draft@v1"
    });
    expect(generating).not.toBeNull();

    const result = regenerateDraft(conversationId, generating!.id);
    expect(result).toMatchObject({ ok: false, code: "DRAFT_NOT_REGENERABLE" });
  });

  it("an old draft's approval is rejected after regeneration (superseded)", async () => {
    completeMock.mockResolvedValue(aiResult());
    const { draft, conversationId } = makeReadyDraft();
    regenerateDraft(conversationId, draft.id);

    const result = await approveDraft(conversationId, draft.id, undefined);

    expect(result.ok).toBe(false);
    expect(sendTextMock).not.toHaveBeenCalled();
  });
});
