import { aiClient } from "../../ai/index.js";
import { AiError } from "../../ai/errors.js";
import { env } from "../../config/env.js";
import { logger } from "../../logger.js";
import type { NormalizedMessage } from "../../messaging/message.types.js";
import { findMessageAfter, getConversationContact, getMessageById } from "../../messaging/queries.js";
import { publish } from "../../realtime/event-bus.js";
import { buildDraftContext } from "../context/context.builder.js";
import { CURRENT_REPLY_DRAFT } from "../prompts/reply-draft/index.js";
import { promptVersionOf } from "../prompts/prompt.types.js";
import { completeDraft, failDraft, markSuperseded, reserveDraft } from "./draft.repository.js";
import { draftJsonSchema, parseDraftOutput } from "./output.schema.js";
import { evaluateEligibility } from "./eligibility.js";
import type { DraftStatus } from "./draft.types.js";

function publishDraftUpdate(
  conversationId: number,
  draftId: number,
  status: DraftStatus
): void {
  publish({ type: "draft.updated", conversationId, draftId, status });
}

/**
 * Runs the AI call for an already-reserved ('generating') draft row and persists the
 * outcome. Shared by the inbound-message trigger (onMessagePersisted) and the REGENERATE
 * action, so both go through the exact same Agent/AI boundary and context-building logic.
 */
export async function generateDraft(input: {
  draftId: number;
  conversationId: number;
  triggerMessageId: number;
}): Promise<void> {
  publishDraftUpdate(input.conversationId, input.draftId, "generating");

  try {
    if (!aiClient) {
      throw new AiError("server", "AI drafting is enabled but no AI client is configured");
    }

    const context = buildDraftContext(
      input.conversationId,
      input.triggerMessageId,
      env.AI_CONTEXT_MESSAGE_LIMIT
    );
    const { system, user } = CURRENT_REPLY_DRAFT.build(context);

    const result = await aiClient.complete({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
      temperature: env.AI_TEMPERATURE,
      jsonSchema: draftJsonSchema
    });

    const parsed = parseDraftOutput(result.text);

    if (!parsed.ok) {
      throw new AiError(parsed.kind, "Draft output failed post-generation validation");
    }

    // The AI call ran across an await; a newer message or a manual phone reply may have
    // landed meanwhile, making this draft stale before it was ever shown. Persist the
    // generated text for analytics but supersede it so the dashboard never offers it.
    // completeDraft -> markSuperseded is two synchronous better-sqlite3 writes with no
    // await between them, so a 'ready' state is never observable to an approve request.
    const trigger = getMessageById(input.triggerMessageId);
    const movedOn = trigger
      ? findMessageAfter(input.conversationId, { timestamp: trigger.timestamp, id: trigger.id })
      : null;

    completeDraft(input.draftId, {
      generatedText: parsed.text,
      model: result.model,
      usage: result.usage,
      latencyMs: result.latencyMs,
      contextMessageCount: context.meta.includedCount
    });

    if (movedOn) {
      markSuperseded(input.draftId, ["ready"]);
      logger.info(
        {
          draftId: input.draftId,
          conversationId: input.conversationId,
          reason: movedOn.direction === "incoming" ? "newer_incoming_message" : "reply_already_sent"
        },
        "Discarding draft generated for a conversation that moved on"
      );
      publishDraftUpdate(input.conversationId, input.draftId, "superseded");
      return;
    }

    publishDraftUpdate(input.conversationId, input.draftId, "ready");
  } catch (err) {
    const aiError = err instanceof AiError ? err : null;

    failDraft(input.draftId, {
      errorKind: aiError?.kind ?? "server",
      errorMessage: err instanceof Error ? err.message : "Unknown draft generation error"
    });

    logger.error(
      { err, draftId: input.draftId, kind: aiError?.kind ?? "server" },
      "Draft generation failed"
    );

    publishDraftUpdate(input.conversationId, input.draftId, "failed");
  }
}

export async function onMessagePersisted(input: {
  message: NormalizedMessage;
  conversationId: number;
  triggerMessageId: number;
}): Promise<void> {
  const contact = getConversationContact(input.conversationId);

  const eligibility = evaluateEligibility({
    draftingEnabled: env.AI_DRAFTING_ENABLED,
    persistOutcome: "inserted",
    direction: input.message.direction,
    type: input.message.type,
    text: input.message.text,
    conversationType: input.message.conversationType,
    contactId: contact?.contactId ?? null,
    peerJid: contact?.jid ?? null,
    allowedJids: env.AI_DRAFT_ALLOWED_JIDS,
    messageTimestamp: input.message.timestamp,
    now: Date.now()
  });

  if (!eligibility.eligible) {
    logger.debug(
      { reason: eligibility.reason, triggerMessageId: input.triggerMessageId },
      "Draft generation skipped"
    );
    return;
  }

  const draftRow = reserveDraft({
    conversationId: input.conversationId,
    triggerMessageId: input.triggerMessageId,
    promptVersion: promptVersionOf(CURRENT_REPLY_DRAFT)
  });

  if (!draftRow) {
    logger.debug(
      { triggerMessageId: input.triggerMessageId },
      "Draft already reserved for this message"
    );
    return;
  }

  await generateDraft({
    draftId: draftRow.id,
    conversationId: input.conversationId,
    triggerMessageId: input.triggerMessageId
  });
}
