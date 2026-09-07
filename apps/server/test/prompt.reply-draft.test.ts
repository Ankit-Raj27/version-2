import { describe, expect, it } from "vitest";
import type { DraftContext } from "../src/agent/context/context.types.js";
import { promptVersionOf } from "../src/agent/prompts/prompt.types.js";
import { CURRENT_REPLY_DRAFT } from "../src/agent/prompts/reply-draft/index.js";

function makeContext(overrides: Partial<DraftContext> = {}): DraftContext {
  return {
    contact: { displayName: "Rohan", jid: "123@s.whatsapp.net", relationship: null, notes: null },
    conversation: { id: 1, type: "direct" },
    recentMessages: [
      {
        id: 1,
        direction: "incoming",
        type: "text",
        text: "yo you coming friday?",
        timestamp: 1_000,
        quotedText: null,
        quotedUnresolved: false
      },
      {
        id: 2,
        direction: "outgoing",
        type: "text",
        text: "not sure yet, depends on work",
        timestamp: 2_000,
        quotedText: null,
        quotedUnresolved: false
      },
      {
        id: 3,
        direction: "incoming",
        type: "unsupported",
        text: "[image]",
        timestamp: 3_000,
        quotedText: null,
        quotedUnresolved: false
      },
      {
        id: 4,
        direction: "incoming",
        type: "text",
        text: "lmk by thursday",
        timestamp: 4_000,
        quotedText: "not sure yet, depends on work",
        quotedUnresolved: false
      }
    ],
    triggerMessage: {
      id: 4,
      direction: "incoming",
      type: "text",
      text: "lmk by thursday",
      timestamp: 4_000,
      quotedText: "not sure yet, depends on work",
      quotedUnresolved: false
    },
    meta: { requestedLimit: 20, includedCount: 4, truncated: false },
    ...overrides
  };
}

describe("replyDraftV1", () => {
  it("has a stable, addressable version identifier", () => {
    expect(promptVersionOf(CURRENT_REPLY_DRAFT)).toBe("reply-draft@v1");
  });

  it("labels the user's own messages as Me and the contact by display name", () => {
    const { user } = CURRENT_REPLY_DRAFT.build(makeContext());

    expect(user).toContain("Rohan: yo you coming friday?");
    expect(user).toContain("Me: not sure yet, depends on work");
    expect(user).toContain("Rohan: [image]");
  });

  it("renders a resolved quote as its own line ahead of the message text", () => {
    const { user } = CURRENT_REPLY_DRAFT.build(makeContext());

    expect(user).toContain('Rohan: ↩ re: "not sure yet, depends on work"');
    expect(user).toContain("Rohan: lmk by thursday");
  });

  it("renders an unresolved quote as [earlier message]", () => {
    const context = makeContext();
    context.recentMessages[3] = {
      ...context.recentMessages[3]!,
      quotedText: null,
      quotedUnresolved: true
    };

    const { user } = CURRENT_REPLY_DRAFT.build(context);
    expect(user).toContain("Rohan: ↩ re: [earlier message]");
  });

  it("falls back to the JID when there is no display name", () => {
    const context = makeContext({
      contact: { displayName: null, jid: "123@s.whatsapp.net", relationship: null, notes: null }
    });

    const { user } = CURRENT_REPLY_DRAFT.build(context);
    expect(user).toContain("123@s.whatsapp.net: yo you coming friday?");
  });

  it("closes with the trigger message text as the thing to reply to", () => {
    const { user } = CURRENT_REPLY_DRAFT.build(makeContext());
    expect(user.trim().endsWith('"lmk by thursday"')).toBe(true);
  });

  it("instructs the model to output only the reply text", () => {
    const { system } = CURRENT_REPLY_DRAFT.build(makeContext());
    expect(system).toContain("Output only the reply text");
  });
});
