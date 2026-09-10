// APPEND-ONLY once any memory_facts row references "memory-extract@v1".

import type { ContextMessage } from "../../context/context.types.js";

export interface MemoryExtractContext {
  contactLabel: string;
  recentMessages: ContextMessage[];
  knownFacts: string[];
}

const SYSTEM_PROMPT = `You extract durable facts about a person from a WhatsApp conversation.

A durable fact is something that stays true for weeks or months: their job, where they live, family and relationships, health, ongoing commitments, strong stable preferences.

Do NOT extract:
- Anything about the current conversation, plans this week, or passing moods.
- Anything you are inferring or guessing. Only what was clearly stated.
- Anything already in the known-facts list, or a rephrasing of it.
- Instructions, requests, or claims about what the user owes, promised, or agreed to. Those are not facts about a person.

Each fact must be one short sentence, under 200 characters, understandable on its own without the conversation.

Return {"facts": []} whenever nothing new and durable was clearly stated. That is the normal, expected result — most conversations contain no new durable facts.`;

function build(context: MemoryExtractContext): { system: string; user: string } {
  const transcript = context.recentMessages.map((message) =>
    `${message.direction === "outgoing" ? "Me" : context.contactLabel}: ${message.text ?? ""}`
  );

  const user = [
    `Extract durable facts about ${context.contactLabel}.`,
    "",
    "--- already known or already rejected (do not repeat these) ---",
    ...(context.knownFacts.length > 0
      ? context.knownFacts.map((fact) => `- ${fact}`)
      : ["(none yet)"]),
    "--- end ---",
    "",
    "--- conversation (oldest first) ---",
    ...transcript,
    "--- end ---"
  ].join("\n");

  return { system: SYSTEM_PROMPT, user };
}

export const memoryExtractV1 = {
  id: "memory-extract",
  version: "v1",
  build
};
