import { logger } from "../../logger.js";
import type { NormalizedMessage, MessageOrigin } from "../../messaging/message.types.js";
import { persistMessage } from "../../messaging/persistence.js";
import { getConversation, getConversationContact } from "../../messaging/queries.js";
import { publish } from "../../realtime/event-bus.js";
import { whatsappService } from "../../whatsapp/whatsapp.service.js";
import { CURRENT_REPLY_DRAFT } from "../prompts/reply-draft/index.js";
import { promptVersionOf } from "../prompts/prompt.types.js";
import { checkDraftSendability, PERMANENT_STALE_REASONS, type StaleReason } from "./draft-sendability.js";
import {
  getDraftById,
  insertRegeneratedDraft,
  markIgnored,
  markSuperseded,
  markSent,
  reserveSend,
  revertSendFailure
} from "./draft.repository.js";
import { generateDraft } from "./draft.service.js";
import type { DraftRow } from "./draft.types.js";

export type DraftActionErrorCode =
  | "DRAFT_NOT_FOUND"
  | "DRAFT_CONVERSATION_MISMATCH"
  | "DRAFT_NOT_ACTIONABLE"
  | "DRAFT_NOT_REGENERABLE"
  | "DRAFT_ALREADY_SENDING"
  | "DRAFT_EXPIRED"
  | "DRAFT_STALE_NEWER_MESSAGE"
  | "DRAFT_STALE_MANUAL_REPLY"
  | "DRAFT_STALE_ALREADY_REPLIED"
  | "WHATSAPP_DISCONNECTED"
  | "KILL_SWITCH_ENABLED"
  | "WHATSAPP_SEND_FAILED";

export type DraftActionResult =
  | { ok: true; draft: DraftRow }
  | { ok: false; code: DraftActionErrorCode; message: string };

const REASON_CODES: Record<StaleReason, DraftActionErrorCode> = {
  draft_generating: "DRAFT_NOT_ACTIONABLE",
  draft_sending: "DRAFT_ALREADY_SENDING",
  draft_sent: "DRAFT_NOT_ACTIONABLE",
  draft_failed: "DRAFT_NOT_ACTIONABLE",
  draft_ignored: "DRAFT_NOT_ACTIONABLE",
  draft_superseded: "DRAFT_NOT_ACTIONABLE",
  trigger_message_invalid: "DRAFT_NOT_ACTIONABLE",
  draft_expired: "DRAFT_EXPIRED",
  newer_incoming_message: "DRAFT_STALE_NEWER_MESSAGE",
  manual_reply_detected: "DRAFT_STALE_MANUAL_REPLY",
  already_replied: "DRAFT_STALE_ALREADY_REPLIED",
  whatsapp_disconnected: "WHATSAPP_DISCONNECTED",
  kill_switch_enabled: "KILL_SWITCH_ENABLED"
};

const REASON_MESSAGES: Record<StaleReason, string> = {
  draft_generating: "Draft is still generating",
  draft_sending: "Draft is already being sent",
  draft_sent: "Draft has already been sent",
  draft_failed: "Draft generation failed; regenerate before sending",
  draft_ignored: "Draft was ignored",
  draft_superseded: "Draft has been superseded by a newer one",
  trigger_message_invalid: "Draft's trigger message could not be verified",
  draft_expired: "Draft has expired; regenerate before sending",
  newer_incoming_message: "A newer message has arrived in this conversation",
  manual_reply_detected: "You already replied to this from your phone",
  already_replied: "Another reply has already been sent for this message",
  whatsapp_disconnected: "WhatsApp is not connected",
  kill_switch_enabled: "Sending is disabled by the kill switch"
};

function loadDraft(
  conversationId: number,
  draftId: number
): { ok: true; draft: DraftRow } | { ok: false; result: DraftActionResult } {
  const draft = getDraftById(draftId);

  if (!draft) {
    return {
      ok: false,
      result: { ok: false, code: "DRAFT_NOT_FOUND", message: `Draft ${draftId} does not exist` }
    };
  }

  if (draft.conversationId !== conversationId) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "DRAFT_CONVERSATION_MISMATCH",
        message: `Draft ${draftId} does not belong to conversation ${conversationId}`
      }
    };
  }

  return { ok: true, draft };
}

function staleResult(reason: StaleReason): DraftActionResult {
  return { ok: false, code: REASON_CODES[reason], message: REASON_MESSAGES[reason] };
}

export async function approveDraft(
  conversationId: number,
  draftId: number,
  editedText: string | undefined
): Promise<DraftActionResult> {
  const loaded = loadDraft(conversationId, draftId);

  if (!loaded.ok) {
    return loaded.result;
  }

  const { draft } = loaded;
  const sendability = checkDraftSendability(draft);

  if (!sendability.sendable) {
    if (PERMANENT_STALE_REASONS.has(sendability.reason)) {
      markSuperseded(draftId, ["ready"]);
    }

    return staleResult(sendability.reason);
  }

  if (!draft.generatedText) {
    logger.error({ draftId }, "Ready draft has no generated text");
    return { ok: false, code: "DRAFT_NOT_ACTIONABLE", message: "Draft has no text to send" };
  }

  const trimmedEdit = editedText?.trim();
  const finalText = trimmedEdit || draft.generatedText;
  const origin: MessageOrigin = finalText === draft.generatedText ? "AI_APPROVED" : "AI_EDITED";

  const reserved = reserveSend(draftId, finalText);

  if (!reserved) {
    return staleResult("draft_sending");
  }

  const contact = getConversationContact(conversationId);
  const conversation = getConversation(conversationId);

  if (!contact || !conversation) {
    revertSendFailure(draftId, {
      errorKind: "server",
      errorMessage: "Conversation contact could not be resolved"
    });
    publish({ type: "draft.updated", conversationId, draftId, status: "ready" });
    return {
      ok: false,
      code: "WHATSAPP_SEND_FAILED",
      message: "Conversation contact could not be resolved"
    };
  }

  let sent;

  try {
    sent = await whatsappService.sendText(contact.jid, finalText);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown WhatsApp send error";
    revertSendFailure(draftId, { errorKind: "send_failed", errorMessage: message });
    logger.error({ err, draftId, conversationId }, "WhatsApp send failed");
    publish({ type: "draft.updated", conversationId, draftId, status: "ready" });
    return { ok: false, code: "WHATSAPP_SEND_FAILED", message };
  }

  const outgoing: NormalizedMessage = {
    externalMessageId: sent.externalMessageId,
    externalConversationId: conversation.externalConversationId,
    conversationType: "direct",
    sender: null,
    conversationPeer: { jid: contact.jid },
    direction: "outgoing",
    origin,
    type: "text",
    text: finalText,
    quote: null,
    timestamp: sent.timestamp,
    timestampWasSynthesized: false,
    metadata: { rawRemoteJid: contact.jid }
  };

  const persisted = persistMessage(outgoing);
  const sentMessageId = persisted.messageId ?? null;

  if (sentMessageId === null) {
    // Unreachable in practice (externalMessageId/externalConversationId are always
    // non-empty here) — but the WhatsApp message is already sent, so fail closed by
    // recording the draft as sent without a linked row rather than reverting it and
    // risking a retry that sends a second message.
    logger.error({ draftId, conversationId }, "WhatsApp message sent but could not be persisted locally");
  } else {
    publish({ type: "message.created", conversationId, messageId: sentMessageId });
  }

  const updated = markSent(draftId, sentMessageId);
  publish({ type: "draft.updated", conversationId, draftId, status: "sent" });

  return { ok: true, draft: updated ?? { ...draft, status: "sent", finalText, sentMessageId } };
}

export function ignoreDraft(conversationId: number, draftId: number): DraftActionResult {
  const loaded = loadDraft(conversationId, draftId);

  if (!loaded.ok) {
    return loaded.result;
  }

  const ok = markIgnored(draftId);

  if (!ok) {
    return { ok: false, code: "DRAFT_NOT_ACTIONABLE", message: "Draft is not actionable" };
  }

  publish({ type: "draft.updated", conversationId, draftId, status: "ignored" });

  const draft = getDraftById(draftId);
  return { ok: true, draft: draft ?? { ...loaded.draft, status: "ignored" } };
}

export function regenerateDraft(conversationId: number, draftId: number): DraftActionResult {
  const loaded = loadDraft(conversationId, draftId);

  if (!loaded.ok) {
    return loaded.result;
  }

  const { draft } = loaded;

  if (draft.status !== "ready" && draft.status !== "failed") {
    return {
      ok: false,
      code: "DRAFT_NOT_REGENERABLE",
      message: "Draft cannot be regenerated right now"
    };
  }

  const newDraft = insertRegeneratedDraft({
    oldDraftId: draftId,
    fromStatuses: ["ready", "failed"],
    conversationId,
    triggerMessageId: draft.triggerMessageId,
    promptVersion: promptVersionOf(CURRENT_REPLY_DRAFT)
  });

  if (!newDraft) {
    return {
      ok: false,
      code: "DRAFT_NOT_REGENERABLE",
      message: "Draft was already regenerated or acted on"
    };
  }

  // generateDraft publishes the "generating" event itself (synchronously, before its first
  // await), so the new draft's state is already visible to SSE clients by the time this
  // returns even though the AI call below keeps running in the background.
  void generateDraft({
    draftId: newDraft.id,
    conversationId,
    triggerMessageId: draft.triggerMessageId
  }).catch((err) => {
    logger.error({ err, draftId: newDraft.id }, "Draft regeneration failed");
  });

  return { ok: true, draft: newDraft };
}
