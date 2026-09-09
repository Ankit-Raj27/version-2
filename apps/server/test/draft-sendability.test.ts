import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkDraftSendability } from "../src/agent/drafting/draft-sendability.js";
import { getDraftById } from "../src/agent/drafting/draft.repository.js";
import type { DraftStatus } from "../src/agent/drafting/draft.types.js";
import { db } from "../src/db/client.js";
import { contacts, conversations, drafts, messages } from "../src/db/schema.js";
import { persistMessage } from "../src/messaging/persistence.js";
import { whatsappService } from "../src/whatsapp/whatsapp.service.js";
import { makeMessage, makeReadyDraft, setConversationContactPolicy } from "./factories.js";

const { env } = await import("../src/config/env.js");

function setStatus(draftId: number, status: DraftStatus) {
  db.update(drafts).set({ status }).where(eq(drafts.id, draftId)).run();
  return getDraftById(draftId)!;
}

beforeEach(() => {
  db.delete(drafts).run();
  db.delete(messages).run();
  db.delete(conversations).run();
  db.delete(contacts).run();
  env.WHATSAPP_KILL_SWITCH = false;
  vi.spyOn(whatsappService, "getStatus").mockReturnValue({ state: "connected", connected: true });
});

describe("checkDraftSendability", () => {
  it("is sendable for a clean ready draft with WhatsApp connected and the kill switch off", () => {
    const { draft } = makeReadyDraft();
    expect(checkDraftSendability(draft)).toEqual({ sendable: true });
  });

  it.each([
    ["generating", "draft_generating"],
    ["sending", "draft_sending"],
    ["sent", "draft_sent"],
    ["failed", "draft_failed"],
    ["ignored", "draft_ignored"],
    ["superseded", "draft_superseded"]
  ] as const)("is not sendable when status is %s", (status, reason) => {
    const { draft } = makeReadyDraft();
    const updated = setStatus(draft.id, status);
    expect(checkDraftSendability(updated)).toEqual({ sendable: false, reason });
  });

  const AFTER_TRIGGER_TIMESTAMP = 1_700_000_001_000; // 1s after makeMessage()'s default timestamp

  it("flags a draft older than DRAFT_TTL_MS as expired", () => {
    const { draft } = makeReadyDraft();
    db.update(drafts)
      .set({ createdAt: new Date(Date.now() - env.DRAFT_TTL_MS - 1_000) })
      .where(eq(drafts.id, draft.id))
      .run();

    expect(checkDraftSendability(getDraftById(draft.id)!)).toEqual({
      sendable: false,
      reason: "draft_expired"
    });
  });

  it("still allows a draft within DRAFT_TTL_MS", () => {
    const { draft } = makeReadyDraft();
    db.update(drafts)
      .set({ createdAt: new Date(Date.now() - env.DRAFT_TTL_MS + 60_000) })
      .where(eq(drafts.id, draft.id))
      .run();

    expect(checkDraftSendability(getDraftById(draft.id)!)).toEqual({ sendable: true });
  });

  it("flags a newer incoming message as stale", () => {
    const { draft } = makeReadyDraft();
    persistMessage(
      makeMessage({ externalMessageId: "next-incoming", timestamp: AFTER_TRIGGER_TIMESTAMP })
    );

    expect(checkDraftSendability(getDraftById(draft.id)!)).toEqual({
      sendable: false,
      reason: "newer_incoming_message"
    });
  });

  it("flags a manual phone reply as stale", () => {
    const { draft } = makeReadyDraft();
    persistMessage(
      makeMessage({
        externalMessageId: "manual-reply",
        direction: "outgoing",
        origin: "USER_PHONE",
        sender: null,
        timestamp: AFTER_TRIGGER_TIMESTAMP
      })
    );

    expect(checkDraftSendability(getDraftById(draft.id)!)).toEqual({
      sendable: false,
      reason: "manual_reply_detected"
    });
  });

  it("flags an already-sent AI reply as stale", () => {
    const { draft } = makeReadyDraft();
    persistMessage(
      makeMessage({
        externalMessageId: "already-sent",
        direction: "outgoing",
        origin: "AI_APPROVED",
        sender: null,
        timestamp: AFTER_TRIGGER_TIMESTAMP
      })
    );

    expect(checkDraftSendability(getDraftById(draft.id)!)).toEqual({
      sendable: false,
      reason: "already_replied"
    });
  });

  it("flags a draft whose contact was switched off after generation", () => {
    const { draft, conversationId } = makeReadyDraft();
    setConversationContactPolicy(conversationId, { relationship: "FRIEND", replyMode: "OFF" });

    expect(checkDraftSendability(getDraftById(draft.id)!)).toEqual({
      sendable: false,
      reason: "contact_policy_off"
    });
  });

  it("flags a draft whose contact was reset to an unknown relationship", () => {
    const { draft, conversationId } = makeReadyDraft();
    setConversationContactPolicy(conversationId, { relationship: "UNKNOWN", replyMode: "DRAFT" });

    expect(checkDraftSendability(getDraftById(draft.id)!)).toEqual({
      sendable: false,
      reason: "contact_policy_off"
    });
  });

  it("becomes sendable again when the contact is switched back to draft", () => {
    const { draft, conversationId } = makeReadyDraft();
    setConversationContactPolicy(conversationId, { relationship: "FRIEND", replyMode: "OFF" });
    setConversationContactPolicy(conversationId, { relationship: "FRIEND", replyMode: "DRAFT" });

    expect(checkDraftSendability(getDraftById(draft.id)!)).toEqual({ sendable: true });
  });

  it("flags a disconnected WhatsApp transport", () => {
    vi.spyOn(whatsappService, "getStatus").mockReturnValue({ state: "disconnected", connected: false });
    const { draft } = makeReadyDraft();
    expect(checkDraftSendability(draft)).toEqual({ sendable: false, reason: "whatsapp_disconnected" });
  });

  it("flags an enabled kill switch", () => {
    env.WHATSAPP_KILL_SWITCH = true;
    const { draft } = makeReadyDraft();
    expect(checkDraftSendability(draft)).toEqual({ sendable: false, reason: "kill_switch_enabled" });
  });
});
