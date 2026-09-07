import { aiClient } from "../../ai/index.js";
import { AiError } from "../../ai/errors.js";
import { env } from "../../config/env.js";
import { logger } from "../../logger.js";
import type { NormalizedMessage } from "../../messaging/message.types.js";
import { getConversationContact } from "../../messaging/queries.js";
import { publish } from "../../realtime/event-bus.js";
import { buildDraftContext } from "../context/context.builder.js";
import { CURRENT_REPLY_DRAFT } from "../prompts/reply-draft/index.js";
import { promptVersionOf } from "../prompts/prompt.types.js";
import { completeDraft, failDraft, reserveDraft } from "./draft.repository.js";
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

  publishDraftUpdate(input.conversationId, draftRow.id, "generating");

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

    completeDraft(draftRow.id, {
      generatedText: parsed.text,
      model: result.model,
      usage: result.usage,
      latencyMs: result.latencyMs,
      contextMessageCount: context.meta.includedCount
    });

    publishDraftUpdate(input.conversationId, draftRow.id, "ready");
  } catch (err) {
    const aiError = err instanceof AiError ? err : null;

    failDraft(draftRow.id, {
      errorKind: aiError?.kind ?? "server",
      errorMessage: err instanceof Error ? err.message : "Unknown draft generation error"
    });

    logger.error(
      { err, draftId: draftRow.id, kind: aiError?.kind ?? "server" },
      "Draft generation failed"
    );

    publishDraftUpdate(input.conversationId, draftRow.id, "failed");
  }
}
