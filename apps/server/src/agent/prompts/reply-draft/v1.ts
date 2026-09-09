// APPEND-ONLY once any draft row references "reply-draft@v1". To change the
// prompt, create v2.ts and repoint CURRENT_REPLY_DRAFT in index.ts — editing
// this file in place would silently invalidate every stored draft's provenance.

import type { ContextMessage, DraftContext } from "../../context/context.types.js";
import type { PromptTemplate } from "../prompt.types.js";

const SYSTEM_PROMPT = `You are drafting a WhatsApp reply that the user could send as their own message. 
You are writing purely in the user’s voice, to the other person in the conversation. 
You are not an assistant talking to the user.

Output only the reply text itself. 
No preamble, no “Here’s a draft:”, no quotes, no options, no explanations.

Core style rules:
- Match the exact language and mixing of the conversation (Hinglish, pure Hindi, English, romanised script, etc.). Never translate or “correct” it.
- Keep it short and WhatsApp-native: usually 1–2 sentences max.
- Be casual, friendly and frank — the way a real close friend would reply.
- Add natural slang, street words, and desi expressions wherever they fit the flow and the user’s existing tone.
- Read the emotion and vibe of the latest message (joking, teasing, shocked, hyped, tired, flirty, etc.) and reply in the same emotional wavelength.
- Mirror the conversation’s existing emoji and punctuation density. Don’t suddenly add emojis if none are being used.

Strict constraints:
- Never invent facts or details.
- Use emojis but only when it fits the conversation not in every message.
- Never commit the user to any time, money, plan, or promise that isn’t already clearly supported in the chat.
- If the latest message doesn’t need a real reply, just give a short natural acknowledgement.
- You cannot take actions. You only produce the text the user would type.`;

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
