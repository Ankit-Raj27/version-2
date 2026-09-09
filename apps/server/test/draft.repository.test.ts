import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  completeDraft,
  expireStaleGenerating,
  expireStaleSending,
  failDraft,
  getDraftById,
  getLatestDraftForConversation,
  insertRegeneratedDraft,
  markIgnored,
  markSuperseded,
  markSent,
  reserveDraft,
  reserveSend,
  revertSendFailure
} from "../src/agent/drafting/draft.repository.js";
import { db } from "../src/db/client.js";
import { contacts, conversations, drafts, messages } from "../src/db/schema.js";
import { persistMessage } from "../src/messaging/persistence.js";
import { makeMessage, makeReadyDraft } from "./factories.js";

beforeEach(() => {
  db.delete(drafts).run();
  db.delete(messages).run();
  db.delete(conversations).run();
  db.delete(contacts).run();
});

describe("draft repository", () => {
  it("reserves a draft and rejects a second reservation for the same trigger message", () => {
    const message = persistMessage(makeMessage());
    const first = reserveDraft({
      conversationId: message.conversationId!,
      triggerMessageId: message.messageId!,
      promptVersion: "reply-draft@v1"
    });
    const second = reserveDraft({
      conversationId: message.conversationId!,
      triggerMessageId: message.messageId!,
      promptVersion: "reply-draft@v1"
    });

    expect(first).toMatchObject({ status: "generating" });
    expect(second).toBeNull();
    expect(db.select().from(drafts).all()).toHaveLength(1);
  });

  it("completes a draft with generated text and usage metadata", () => {
    const message = persistMessage(makeMessage());
    const draft = reserveDraft({
      conversationId: message.conversationId!,
      triggerMessageId: message.messageId!,
      promptVersion: "reply-draft@v1"
    })!;

    completeDraft(draft.id, {
      generatedText: "sure, see you then",
      model: "muse-spark-1.3",
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        reasoningTokens: 0,
        cachedInputTokens: null
      },
      latencyMs: 1_200,
      contextMessageCount: 3
    });

    expect(getLatestDraftForConversation(message.conversationId!)).toMatchObject({
      status: "ready",
      generatedText: "sure, see you then",
      model: "muse-spark-1.3",
      contextMessageCount: 3
    });
  });

  it("fails a draft and truncates a long error message to 500 characters", () => {
    const message = persistMessage(makeMessage());
    const draft = reserveDraft({
      conversationId: message.conversationId!,
      triggerMessageId: message.messageId!,
      promptVersion: "reply-draft@v1"
    })!;

    failDraft(draft.id, { errorKind: "timeout", errorMessage: "x".repeat(600) });

    const latest = getLatestDraftForConversation(message.conversationId!);
    expect(latest?.status).toBe("failed");
    expect(latest?.errorKind).toBe("timeout");
    expect(latest?.errorMessage).toHaveLength(500);
  });

  it("returns the most recently created draft across conversations", () => {
    const first = persistMessage(makeMessage({ externalMessageId: "1", timestamp: 1_000 }));
    const second = persistMessage(
      makeMessage({
        externalMessageId: "2",
        externalConversationId: "222@s.whatsapp.net",
        conversationPeer: { jid: "222@s.whatsapp.net" },
        sender: { jid: "222@s.whatsapp.net" },
        timestamp: 2_000
      })
    );

    reserveDraft({
      conversationId: first.conversationId!,
      triggerMessageId: first.messageId!,
      promptVersion: "reply-draft@v1"
    });
    const secondDraft = reserveDraft({
      conversationId: second.conversationId!,
      triggerMessageId: second.messageId!,
      promptVersion: "reply-draft@v1"
    });

    expect(getLatestDraftForConversation(second.conversationId!)?.id).toBe(secondDraft!.id);
  });

  it("expires stale generating drafts older than the cutoff and leaves recent ones alone", () => {
    const old = persistMessage(makeMessage({ externalMessageId: "old" }));
    const recent = persistMessage(
      makeMessage({
        externalMessageId: "recent",
        externalConversationId: "222@s.whatsapp.net",
        conversationPeer: { jid: "222@s.whatsapp.net" },
        sender: { jid: "222@s.whatsapp.net" }
      })
    );

    const oldDraft = reserveDraft({
      conversationId: old.conversationId!,
      triggerMessageId: old.messageId!,
      promptVersion: "reply-draft@v1"
    })!;
    db.update(drafts)
      .set({ createdAt: new Date(Date.now() - 10 * 60 * 1000) })
      .where(eq(drafts.id, oldDraft.id))
      .run();

    reserveDraft({
      conversationId: recent.conversationId!,
      triggerMessageId: recent.messageId!,
      promptVersion: "reply-draft@v1"
    });

    const swept = expireStaleGenerating(5 * 60 * 1000);

    expect(swept).toBe(1);
    expect(getLatestDraftForConversation(old.conversationId!)?.status).toBe("failed");
    expect(getLatestDraftForConversation(recent.conversationId!)?.status).toBe("generating");
  });

  it("reserveSend moves ready -> sending and stores finalText, but only once", () => {
    const { draft } = makeReadyDraft();

    const reserved = reserveSend(draft.id, "final text");
    expect(reserved).toMatchObject({ status: "sending", finalText: "final text" });

    const second = reserveSend(draft.id, "final text");
    expect(second).toBeNull();
  });

  it("markSent moves sending -> sent and clears error fields", () => {
    const { draft, triggerMessageId } = makeReadyDraft();
    reserveSend(draft.id, "final text");

    // sentMessageId has an FK to messages.id; reuse the trigger message's row as a stand-in.
    const sent = markSent(draft.id, triggerMessageId);
    expect(sent).toMatchObject({
      status: "sent",
      sentMessageId: triggerMessageId,
      errorKind: null,
      errorMessage: null
    });

    expect(markSent(draft.id, triggerMessageId)).toBeNull();
  });

  it("revertSendFailure moves sending -> ready and records the failure", () => {
    const { draft } = makeReadyDraft();
    reserveSend(draft.id, "final text");

    const reverted = revertSendFailure(draft.id, { errorKind: "send_failed", errorMessage: "boom" });
    expect(reverted).toMatchObject({ status: "ready", errorKind: "send_failed", errorMessage: "boom" });

    expect(revertSendFailure(draft.id, { errorKind: "send_failed", errorMessage: "boom" })).toBeNull();
  });

  it("markIgnored moves ready -> ignored exactly once", () => {
    const { draft } = makeReadyDraft();

    expect(markIgnored(draft.id)).toBe(true);
    expect(getDraftById(draft.id)!.status).toBe("ignored");
    expect(markIgnored(draft.id)).toBe(false);
  });

  it("markSuperseded only transitions from an allowed source status", () => {
    const { draft } = makeReadyDraft();

    expect(markSuperseded(draft.id, ["failed"])).toBe(false);
    expect(markSuperseded(draft.id, ["ready"])).toBe(true);
    expect(getDraftById(draft.id)!.status).toBe("superseded");
  });

  it("insertRegeneratedDraft supersedes the old row and inserts a fresh one for the same trigger", () => {
    const { draft, triggerMessageId, conversationId } = makeReadyDraft();

    const next = insertRegeneratedDraft({
      oldDraftId: draft.id,
      fromStatuses: ["ready", "failed"],
      conversationId,
      triggerMessageId,
      promptVersion: "reply-draft@v1"
    });

    expect(next).toMatchObject({ status: "generating", triggerMessageId });
    expect(getDraftById(draft.id)!.status).toBe("superseded");
  });

  it("insertRegeneratedDraft returns null when the old draft was already acted on", () => {
    const { draft, triggerMessageId, conversationId } = makeReadyDraft();
    markIgnored(draft.id);

    const next = insertRegeneratedDraft({
      oldDraftId: draft.id,
      fromStatuses: ["ready", "failed"],
      conversationId,
      triggerMessageId,
      promptVersion: "reply-draft@v1"
    });

    expect(next).toBeNull();
  });

  it("expireStaleSending fails interrupted sends older than the cutoff", () => {
    const { draft } = makeReadyDraft();
    reserveSend(draft.id, "final text");
    db.update(drafts)
      .set({ updatedAt: new Date(Date.now() - 60_000) })
      .where(eq(drafts.id, draft.id))
      .run();

    const swept = expireStaleSending(30_000);

    expect(swept).toBe(1);
    expect(getDraftById(draft.id)).toMatchObject({ status: "failed", errorKind: "interrupted" });
  });
});
