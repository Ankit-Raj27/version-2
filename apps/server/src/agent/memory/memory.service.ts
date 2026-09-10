import { aiClient } from "../../ai/index.js";
import { env } from "../../config/env.js";
import { logger } from "../../logger.js";
import { getConversationContact, getRecentMessagesForContext } from "../../messaging/queries.js";
import { resolveContactPolicy } from "../policies/contact-policy.js";
import { CURRENT_MEMORY_EXTRACT, memoryExtractVersion } from "../prompts/memory-extract/index.js";
import {
  countFacts,
  countMessagesSinceLastExtraction,
  listFacts,
  markExtractionRun,
  proposeFacts
} from "./memory.repository.js";
import { memoryJsonSchema, parseMemoryOutput } from "./output.schema.js";

export type MemorySkipReason =
  | "memory_disabled"
  | "no_ai_client"
  | "no_contact"
  | "contact_policy"
  | "rate_limited"
  | "fact_cap_reached";

export type MemoryExtractionResult =
  | { ran: false; reason: MemorySkipReason }
  | { ran: true; proposed: number };

export async function maybeExtractMemory(input: {
  conversationId: number;
  triggerMessageId: number;
  conversationType: string;
}): Promise<MemoryExtractionResult> {
  if (!env.MEMORY_ENABLED) {
    return { ran: false, reason: "memory_disabled" };
  }

  if (!aiClient) {
    return { ran: false, reason: "no_ai_client" };
  }

  const contact = getConversationContact(input.conversationId);

  if (!contact) {
    return { ran: false, reason: "no_contact" };
  }

  // Same gate as drafting: an OFF/UNKNOWN contact must not reach the provider here either.
  const policy = resolveContactPolicy({
    relationship: contact.relationship,
    replyMode: contact.replyMode,
    conversationType: input.conversationType
  });

  if (policy.action !== "draft") {
    return { ran: false, reason: "contact_policy" };
  }

  if (countFacts(contact.contactId) >= env.MEMORY_MAX_FACTS_PER_CONTACT) {
    return { ran: false, reason: "fact_cap_reached" };
  }

  if (
    countMessagesSinceLastExtraction(input.conversationId) <
    env.MEMORY_EXTRACT_EVERY_N_MESSAGES
  ) {
    return { ran: false, reason: "rate_limited" };
  }

  const rows = getRecentMessagesForContext(
    input.conversationId,
    env.AI_CONTEXT_MESSAGE_LIMIT
  );

  const { system, user } = CURRENT_MEMORY_EXTRACT.build({
    contactLabel: contact.displayName?.trim() || contact.jid,
    recentMessages: rows.map((row) => ({
      id: row.id,
      direction: row.direction,
      type: row.type,
      text: row.text,
      timestamp: row.timestamp,
      quotedText: null,
      quotedUnresolved: false
    })),
    knownFacts: listFacts(contact.contactId).map((row) => row.fact)
  });

  const result = await aiClient.complete({
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
    temperature: 0,
    jsonSchema: memoryJsonSchema
  });

  // Marked before parsing: a junk run still consumed the window, and retrying it on the
  // next message would burn calls on the same transcript.
  markExtractionRun(input.conversationId, input.triggerMessageId);

  const facts = parseMemoryOutput(result.text);

  if (!facts) {
    logger.warn(
      { conversationId: input.conversationId },
      "Memory extraction returned unparseable output"
    );
    return { ran: true, proposed: 0 };
  }

  const proposed = proposeFacts({
    contactId: contact.contactId,
    facts,
    sourceMessageId: input.triggerMessageId,
    promptVersion: memoryExtractVersion()
  });

  if (proposed > 0) {
    logger.info(
      { conversationId: input.conversationId, contactId: contact.contactId, proposed },
      "Proposed new memory facts, awaiting confirmation"
    );
  }

  return { ran: true, proposed };
}
