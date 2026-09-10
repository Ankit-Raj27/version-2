// APPEND-ONLY once any draft row references "reply-draft@v4".

import { normalizeRelationship } from "../../policies/contact-policy.js";
import type { Relationship } from "../../../db/schema.js";
import type {
  ContextMessage,
  DraftContext,
  StyleExemplar
} from "../../context/context.types.js";
import type { PromptTemplate } from "../prompt.types.js";

const SYSTEM_PROMPT = `You are drafting a WhatsApp reply that the user could send as their own message.
You are writing purely in the user’s voice, to the other person in the conversation.
You are not an assistant talking to the user.

Output only the reply text itself.
No preamble, no “Here’s a draft:”, no quotes, no options, no explanations.

The “how the user actually texts” block below contains real messages this user has sent.
Imitate them exactly — capitalisation, length, spelling, punctuation, slang, and how much
effort they put in. Those examples outrank every instinct you have about what a good reply
looks like. When the examples and these rules disagree, follow the examples.

Core style rules:
- Match the exact language and mixing of the conversation (Hinglish, pure Hindi, English, romanised script, etc.). Never translate or “correct” it.
- Copy the user’s capitalisation. If their messages are lowercase, write lowercase.
- Match the length of the examples. If the user sends three-word fragments, send a three-word fragment.
- Do not explain or justify. Real texts state a reaction and stop.
- Do not add a question at the end unless the examples show the user doing that.
- A blunt, dismissive or low-effort reply is often the correct reply. Never be warmer, more curious or more helpful than the user actually is.
- Match the register given for this contact. If no register is given, be casual and frank.
- Read the emotion of the latest message and answer on the same wavelength.
- Copy the user’s spelling habits, including their shortenings and typos. Do not tidy them up.

Strict constraints:
- Never invent facts or details.
- Never commit the user to any time, money, plan, or promise that isn’t already clearly supported in the chat.
- If the latest message doesn’t need a real reply, a short acknowledgement is enough.
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
const MAX_EXEMPLAR_CHARS = 300;

// Models over-use emojis, so the measured rate is stated as an instruction, not a fact.
function emojiDirective(ratio: number): string {
  if (ratio < 0.1) {
    return "This user almost never uses emojis here. Do not use one.";
  }

  if (ratio < 0.4) {
    return `Only about ${Math.round(ratio * 100)}% of this user’s replies here contain an emoji. Most replies should have none.`;
  }

  return `About ${Math.round(ratio * 100)}% of this user’s replies here contain an emoji.`;
}

// A burst of replies shares one incoming; render it once so they don't read as
// alternative replies to the same message.
function renderExemplars(exemplars: StyleExemplar[]): string[] {
  const lines: string[] = [];
  let lastIncoming: string | null = null;

  for (const exemplar of exemplars) {
    if (exemplar.incoming && exemplar.incoming !== lastIncoming) {
      lines.push(
        `them: ${exemplar.incoming.replace(/\s+/g, " ").slice(0, MAX_EXEMPLAR_CHARS)}`
      );
    }

    lines.push(`you: ${exemplar.reply.replace(/\s+/g, " ").slice(0, MAX_EXEMPLAR_CHARS)}`);
    lastIncoming = exemplar.incoming;
  }

  return lines;
}

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
  const exemplars = context.exemplars ?? [];

  const user = [
    ...(exemplars.length > 0
      ? [
          "--- how the user actually texts (real messages they sent — imitate this exactly) ---",
          ...renderExemplars(exemplars),
          "--- end ---",
          ""
        ]
      : []),
    `Conversation with ${contactLabel} (WhatsApp, direct chat).`,
    ...(register ? [`Your relationship with ${contactLabel}: ${register}`] : []),
    ...(style
      ? [
          `Their replies here run about ${style.medianChars} characters. ${emojiDirective(style.emojiRatio)}`
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

export const replyDraftV4: PromptTemplate = {
  id: "reply-draft",
  version: "v4",
  build
};
