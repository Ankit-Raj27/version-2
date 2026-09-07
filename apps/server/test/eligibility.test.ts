import { describe, expect, it } from "vitest";
import {
  evaluateEligibility,
  type EligibilityInput,
  type IneligibleReason
} from "../src/agent/drafting/eligibility.js";

function baseInput(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    draftingEnabled: true,
    persistOutcome: "inserted",
    direction: "incoming",
    type: "text",
    text: "hello there",
    conversationType: "direct",
    contactId: 1,
    peerJid: "123@s.whatsapp.net",
    allowedJids: [],
    messageTimestamp: 1_000_000,
    now: 1_000_000,
    ...overrides
  };
}

describe("evaluateEligibility", () => {
  it("is eligible for a fresh incoming direct text message", () => {
    expect(evaluateEligibility(baseInput())).toEqual({ eligible: true });
  });

  const cases: Array<[IneligibleReason, Partial<EligibilityInput>]> = [
    ["drafting_disabled", { draftingEnabled: false }],
    ["not_inserted", { persistOutcome: "deduped" }],
    ["outgoing", { direction: "outgoing" }],
    ["not_text", { type: "unsupported" }],
    ["empty_text", { text: "   " }],
    ["text_too_long", { text: "a".repeat(4001) }],
    ["not_direct", { conversationType: "group" }],
    ["no_contact", { contactId: null }],
    ["not_allowlisted", { allowedJids: ["other@s.whatsapp.net"] }],
    ["message_too_old", { now: 1_000_000 + 11 * 60 * 1000 }]
  ];

  it.each(cases)("returns %s", (reason, overrides) => {
    expect(evaluateEligibility(baseInput(overrides))).toEqual({
      eligible: false,
      reason
    });
  });

  it("allows a jid present in a non-empty allowlist", () => {
    expect(
      evaluateEligibility(
        baseInput({ allowedJids: ["123@s.whatsapp.net", "other@s.whatsapp.net"] })
      )
    ).toEqual({ eligible: true });
  });

  it("allows a message exactly at the recency boundary", () => {
    expect(evaluateEligibility(baseInput({ now: 1_000_000 + 10 * 60 * 1000 }))).toEqual({
      eligible: true
    });
  });

  it("checks drafting_disabled before every other rule", () => {
    expect(
      evaluateEligibility(
        baseInput({ draftingEnabled: false, direction: "outgoing", type: "unsupported" })
      )
    ).toEqual({ eligible: false, reason: "drafting_disabled" });
  });
});
