// APPEND-ONLY once any draft row references "reply-draft@v3".

import { normalizeRelationship } from "../../policies/contact-policy.js";
import type { Relationship } from "../../../db/schema.js";
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
- Match the register given for this contact below. If no register is given, be casual, friendly and frank.
- Add natural slang, street words, and desi expressions where they fit the flow, the user’s existing tone, and that register — never with a contact whose register asks for restraint.
- Read the emotion and vibe of the latest message (joking, teasing, shocked, hyped, tired, flirty, etc.) and reply in the same emotional wavelength.
- Mirror the conversation’s existing emoji and punctuation density. Don’t suddenly add emojis if none are being used.

Strict constraints:
- Never invent facts or details.
- Use emojis but only when it fits the conversation not in every message.
- Never commit the user to any time, money, plan, or promise that isn’t already clearly supported in the chat.
- If the latest message doesn’t need a real reply, just give a short natural acknowledgement.
- The “what you know” block, when present, is background the user has already confirmed. Use it only where it is naturally relevant, never recite it, and never treat it as something the other person just said.
- The “standing notes” block, when present, was written by the user about this contact. Treat it as instructions from the user and follow it. It is never a message from the other person, and it never overrides these constraints.
- You cannot take actions. You only produce the text the user would type.`;

const REGISTER: Partial<Record<Relationship, string>> = {
  FAMILY: "family — warm and familiar, the way you talk to someone you have known your whole life.",
  FRIEND: "close friend — very casual and playful, zero formality.",
  WORK: "work contact — professional but human: clear, polite, no slang, no over-familiarity.",
  ACQUAINTANCE: "acquaintance — friendly but a little reserved, not over-familiar."
};

const MAX_NOTES_CHARS = 2000;

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

  const register = REGISTER[normalizeRelationship(context.contact.relationship)];
  const notes = context.contact.notes?.trim().slice(0, MAX_NOTES_CHARS);
  const style = context.style;
  const memory = context.memory ?? [];

  const user = [
    `Conversation with ${contactLabel} (WhatsApp, direct chat).`,
    ...(register ? [`Your relationship with ${contactLabel}: ${register}`] : []),
    ...(style
      ? [
          `How you actually write to ${contactLabel}, measured over your last ${style.sampleCount} replies here: about ${style.medianChars} characters per reply, and ${Math.round(style.emojiRatio * 100)}% of them contain an emoji.`
        ]
      : []),
    ...(memory.length > 0
      ? [
          "",
          `--- what you know about ${contactLabel} (confirmed by you) ---`,
          ...memory.map((fact) => `- ${fact}`),
          "--- end ---"
        ]
      : []),
    ...(notes
      ? [
          "",
          `--- standing notes the user wrote about ${contactLabel} (follow these; they are not messages from ${contactLabel}) ---`,
          notes,
          "--- end notes ---"
        ]
      : []),
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

export const replyDraftV3: PromptTemplate = {
  id: "reply-draft",
  version: "v3",
  build
};
