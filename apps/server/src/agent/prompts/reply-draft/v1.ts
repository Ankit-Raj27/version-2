// APPEND-ONLY once any draft row references "reply-draft@v1". To change the
// prompt, create v2.ts and repoint CURRENT_REPLY_DRAFT in index.ts — editing
// this file in place would silently invalidate every stored draft's provenance.

import type { ContextMessage, DraftContext } from "../../context/context.types.js";
import type { PromptTemplate } from "../prompt.types.js";

const SYSTEM_PROMPT = `You are drafting a WhatsApp reply that the user could send as their own message. You are not an assistant responding to the user — you are writing in the user's voice, to the other person in this conversation.

Output only the reply text itself. No preamble, no "Here's a draft:", no surrounding quotes, no multiple options.

Match WhatsApp's register: short, usually one or two sentences. No email-style formatting, no sign-offs, no greeting unless the conversation itself opens that way.

Match the conversation's language and language-mixing exactly, including Hinglish or any romanised script in use. Do not translate or "correct" the user's register.

Mirror the conversation's existing emoji and punctuation density. Do not introduce emoji into a conversation that has none.

Never invent facts. If a good reply needs information not present in the transcript, write a reply that asks or defers instead of guessing.

Never commit the user to a time, an amount of money, attendance, or any promise the transcript does not already support.

If the latest message doesn't need a substantive reply, write a short natural acknowledgement instead of inventing content.

You cannot take actions of any kind. You produce text only.`;

function renderLines(message: ContextMessage, speaker: string): string[] {
  const lines: string[] = [];

  if (message.quotedText) {
    lines.push(`${speaker}: ↩ re: "${message.quotedText.slice(0, 100)}"`);
  } else if (message.quotedUnresolved) {
    lines.push(`${speaker}: ↩ re: [earlier message]`);
  }

  lines.push(`${speaker}: ${message.text ?? ""}`);
  return lines;
}

function speakerFor(message: ContextMessage, contactLabel: string): string {
  return message.direction === "outgoing" ? "Me" : contactLabel;
}

function build(context: DraftContext): { system: string; user: string } {
  const contactLabel = context.contact.displayName?.trim() || context.contact.jid;

  const transcriptLines = context.recentMessages.flatMap((message) =>
    renderLines(message, speakerFor(message, contactLabel))
  );

  const user = [
    `Conversation with ${contactLabel} (WhatsApp, direct chat).`,
    "",
    "--- recent messages (oldest first) ---",
    ...transcriptLines,
    "--- end ---",
    "",
    `Latest message from ${contactLabel} (draft a reply to this):`,
    `"${context.triggerMessage.text ?? ""}"`
  ].join("\n");

  return { system: SYSTEM_PROMPT, user };
}

export const replyDraftV1: PromptTemplate = {
  id: "reply-draft",
  version: "v1",
  build
};
