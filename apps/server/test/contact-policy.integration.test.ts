import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../src/db/client.js";
import { contacts, conversations, drafts, messages } from "../src/db/schema.js";
import { persistMessage } from "../src/messaging/persistence.js";
import { getContactByConversation, updateContactSettings } from "../src/messaging/contacts.js";
import { makeMessage as makeMessageBase } from "./factories.js";
import type { NormalizedMessage } from "../src/messaging/message.types.js";

function makeMessage(overrides: Partial<NormalizedMessage> = {}): NormalizedMessage {
  return makeMessageBase({ timestamp: Date.now(), ...overrides });
}

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

const { onMessagePersisted } = await import("../src/agent/drafting/draft.service.js");
const { getLatestDraftForConversation } = await import("../src/agent/drafting/draft.repository.js");
const { env } = await import("../src/config/env.js");

function aiReply() {
  return {
    text: '{"reply":"drafted"}',
    model: "muse-spark-1.3",
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      reasoningTokens: null,
      cachedInputTokens: null
    },
    latencyMs: 100,
    finishReason: "stop"
  };
}

/** Persist an incoming message and run the drafting trigger the inbound pipeline runs. */
async function receive(overrides: Partial<NormalizedMessage> = {}) {
  const message = makeMessage(overrides);
  const persisted = persistMessage(message);
  await onMessagePersisted({
    message,
    conversationId: persisted.conversationId!,
    triggerMessageId: persisted.messageId!
  });
  return persisted;
}

beforeEach(() => {
  db.delete(drafts).run();
  db.delete(messages).run();
  db.delete(conversations).run();
  db.delete(contacts).run();
  completeMock.mockReset();
  completeMock.mockResolvedValue(aiReply());
  sendTextMock.mockReset();
  env.AI_DRAFTING_ENABLED = true;
});

describe("contact policy gate before AI generation", () => {
  it("creates new contacts with UNKNOWN + OFF and does not draft", async () => {
    const persisted = await receive();

    const contact = getContactByConversation(persisted.conversationId!);
    expect(contact).toMatchObject({ relationship: "UNKNOWN", replyMode: "OFF" });
    // message persisted, but no AI call and no draft
    expect(db.select().from(messages).all()).toHaveLength(1);
    expect(completeMock).not.toHaveBeenCalled();
    expect(getLatestDraftForConversation(persisted.conversationId!)).toBeNull();
  });

  it("does not draft for a known contact explicitly set to OFF", async () => {
    const first = await receive();
    updateContactSettings(getContactByConversation(first.conversationId!)!.id, {
      relationship: "FRIEND",
      replyMode: "OFF"
    });

    await receive({ externalMessageId: "m2", timestamp: Date.now() + 1000 });

    expect(completeMock).not.toHaveBeenCalled();
    expect(getLatestDraftForConversation(first.conversationId!)).toBeNull();
  });

  it("drafts for a known contact set to DRAFT", async () => {
    const first = await receive();
    updateContactSettings(getContactByConversation(first.conversationId!)!.id, {
      relationship: "FRIEND",
      replyMode: "DRAFT"
    });

    await receive({ externalMessageId: "m2", timestamp: Date.now() + 1000 });

    expect(completeMock).toHaveBeenCalledTimes(1);
    expect(getLatestDraftForConversation(first.conversationId!)).toMatchObject({
      status: "ready",
      generatedText: "drafted"
    });
  });

  it("does not draft for group conversations", async () => {
    await receive({
      externalConversationId: "group-1@g.us",
      conversationType: "group",
      conversationPeer: null,
      sender: { jid: "999@s.whatsapp.net", displayName: "Someone" }
    });

    expect(completeMock).not.toHaveBeenCalled();
  });

  it("picks up an OFF -> DRAFT change on the next incoming message", async () => {
    const first = await receive();
    const contactId = getContactByConversation(first.conversationId!)!.id;

    updateContactSettings(contactId, { relationship: "FRIEND", replyMode: "DRAFT" });
    await receive({ externalMessageId: "m2", timestamp: Date.now() + 1000 });
    expect(completeMock).toHaveBeenCalledTimes(1);
  });

  it("picks up a DRAFT -> OFF change on the next incoming message", async () => {
    const first = await receive();
    const contactId = getContactByConversation(first.conversationId!)!.id;
    updateContactSettings(contactId, { relationship: "FRIEND", replyMode: "DRAFT" });

    await receive({ externalMessageId: "m2", timestamp: Date.now() + 1000 });
    expect(completeMock).toHaveBeenCalledTimes(1);

    updateContactSettings(contactId, { replyMode: "OFF" });
    await receive({ externalMessageId: "m3", timestamp: Date.now() + 2000 });

    expect(completeMock).toHaveBeenCalledTimes(1); // unchanged
    expect(db.select().from(messages).all()).toHaveLength(3); // still persisted
  });

  it.each(["AUTO_SAFE", "AUTO"] as const)(
    "never auto-sends for replyMode %s (at most a draft)",
    async (replyMode) => {
      const first = await receive();
      updateContactSettings(getContactByConversation(first.conversationId!)!.id, {
        relationship: "FRIEND",
        replyMode
      });

      await receive({ externalMessageId: "m2", timestamp: Date.now() + 1000 });

      // The message may enter the DRAFT flow, but WhatsApp send is never invoked.
      expect(sendTextMock).not.toHaveBeenCalled();
      const draft = getLatestDraftForConversation(first.conversationId!);
      expect(draft?.status === "ready" || draft?.status === "superseded").toBe(true);
      expect(
        db.select().from(messages).all().every((m) => m.direction === "incoming")
      ).toBe(true);
    }
  );
});
