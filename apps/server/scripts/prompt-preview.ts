// Builds a draft context + prompt for a real conversation and prints it.
// No API call, no cost — usage: tsx scripts/prompt-preview.ts <conversationId> [triggerMessageId]

import { desc, eq } from "drizzle-orm";
import { buildDraftContext } from "../src/agent/context/context.builder.js";
import { CURRENT_REPLY_DRAFT } from "../src/agent/prompts/reply-draft/index.js";
import { promptVersionOf } from "../src/agent/prompts/prompt.types.js";
import { env } from "../src/config/env.js";
import { db } from "../src/db/client.js";
import { messages } from "../src/db/schema.js";

const conversationIdArg = process.argv[2];

if (!conversationIdArg) {
  console.error("Usage: tsx scripts/prompt-preview.ts <conversationId> [triggerMessageId]");
  process.exit(1);
}

const conversationId = Number(conversationIdArg);
const triggerMessageIdArg = process.argv[3];

const triggerMessageId = triggerMessageIdArg
  ? Number(triggerMessageIdArg)
  : db
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.timestamp), desc(messages.id))
      .limit(1)
      .get()?.id;

if (!triggerMessageId) {
  console.error(`No messages found for conversation ${conversationId}`);
  process.exit(1);
}

const context = buildDraftContext(
  conversationId,
  triggerMessageId,
  env.AI_CONTEXT_MESSAGE_LIMIT
);
const { system, user } = CURRENT_REPLY_DRAFT.build(context);

console.log(`Prompt version: ${promptVersionOf(CURRENT_REPLY_DRAFT)}\n`);
console.log("=== SYSTEM ===\n");
console.log(system);
console.log("\n=== USER ===\n");
console.log(user);
console.log("\n=== CONTEXT META ===\n");
console.log(JSON.stringify(context.meta, null, 2));
