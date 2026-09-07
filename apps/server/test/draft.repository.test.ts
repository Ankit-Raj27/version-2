import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  completeDraft,
  expireStaleGenerating,
  failDraft,
  getLatestDraftForConversation,
  reserveDraft
} from "../src/agent/drafting/draft.repository.js";
import { db } from "../src/db/client.js";
import { contacts, conversations, drafts, messages } from "../src/db/schema.js";
import { persistMessage } from "../src/messaging/persistence.js";
import { makeMessage } from "./factories.js";

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
});
