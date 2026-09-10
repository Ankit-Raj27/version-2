import { env } from "../../config/env.js";
import {
  findMessageAfter,
  getConversationContact,
  getMessageById
} from "../../messaging/queries.js";
import { whatsappService } from "../../whatsapp/whatsapp.service.js";
import { resolveContactPolicy } from "../policies/contact-policy.js";
import type { DraftRow, DraftStatus } from "./draft.types.js";

export type StaleReason =
  | "draft_generating"
  | "draft_sending"
  | "draft_sent"
  | "draft_failed"
  | "draft_ignored"
  | "draft_superseded"
  | "trigger_message_invalid"
  | "draft_expired"
  | "newer_incoming_message"
  | "manual_reply_detected"
  | "already_replied"
  | "contact_policy_off"
  | "whatsapp_disconnected"
  | "kill_switch_enabled";

export type SendabilityResult =
  | { sendable: true }
  | { sendable: false; reason: StaleReason };

/** Reasons where the conversation has structurally moved on — the draft can never become
 * sendable again and should be marked 'superseded' rather than left retryable. */
export const PERMANENT_STALE_REASONS: ReadonlySet<StaleReason> = new Set([
  "draft_expired",
  "newer_incoming_message",
  "manual_reply_detected",
  "already_replied"
]);

const STATUS_REASONS: Partial<Record<DraftStatus, StaleReason>> = {
  generating: "draft_generating",
  sending: "draft_sending",
  sent: "draft_sent",
  failed: "draft_failed",
  ignored: "draft_ignored",
  superseded: "draft_superseded"
};

function stale(reason: StaleReason): SendabilityResult {
  return { sendable: false, reason };
}

/**
 * Fail-closed check for whether a draft can be sent right now. Read-only: never mutates
 * the draft. Called both to annotate a GET response for the dashboard and, authoritatively,
 * from the approve route before it reserves the send.
 */
export function checkDraftSendability(draft: DraftRow): SendabilityResult {
  if (draft.status !== "ready") {
    return stale(STATUS_REASONS[draft.status] ?? "draft_generating");
  }

  if (Date.now() - draft.createdAt.getTime() > env.DRAFT_TTL_MS) {
    return stale("draft_expired");
  }

  const trigger = getMessageById(draft.triggerMessageId);

  if (!trigger || trigger.conversationId !== draft.conversationId) {
    return stale("trigger_message_invalid");
  }

  const next = findMessageAfter(draft.conversationId, {
    timestamp: trigger.timestamp,
    id: trigger.id
  });

  if (next) {
    if (next.direction === "incoming") {
      return stale("newer_incoming_message");
    }

    if (next.origin === "USER_PHONE") {
      return stale("manual_reply_detected");
    }

    return stale("already_replied");
  }

  // Permission is re-checked at execution time, not only at generation time: if the
  // contact was switched to OFF (or otherwise no longer draft-eligible) after this draft
  // was generated, it must no longer be sendable. Not a permanent reason — re-enabling
  // the contact makes the draft sendable again (subject to the TTL check above).
  const contact = getConversationContact(draft.conversationId);
  const policy = resolveContactPolicy({
    relationship: contact?.relationship ?? null,
    replyMode: contact?.replyMode ?? null,
    conversationType: "direct"
  });

  if (policy.action !== "draft") {
    return stale("contact_policy_off");
  }

  if (!whatsappService.getStatus().connected) {
    return stale("whatsapp_disconnected");
  }

  if (env.WHATSAPP_KILL_SWITCH) {
    return stale("kill_switch_enabled");
  }

  return { sendable: true };
}
