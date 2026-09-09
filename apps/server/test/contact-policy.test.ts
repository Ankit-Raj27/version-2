import { describe, expect, it } from "vitest";
import {
  resolveContactPolicy,
  type ContactPolicyInput
} from "../src/agent/policies/contact-policy.js";

function input(overrides: Partial<ContactPolicyInput> = {}): ContactPolicyInput {
  return {
    relationship: "FRIEND",
    replyMode: "DRAFT",
    conversationType: "direct",
    ...overrides
  };
}

describe("resolveContactPolicy", () => {
  it("allows drafting for a known contact set to DRAFT", () => {
    expect(resolveContactPolicy(input())).toEqual({
      action: "draft",
      reason: "reply_mode_draft"
    });
  });

  it("ignores group conversations regardless of contact settings", () => {
    expect(
      resolveContactPolicy(input({ conversationType: "group" }))
    ).toEqual({ action: "ignore", reason: "group_disabled" });
  });

  it.each(["UNKNOWN", null, "", "bestie"])(
    "ignores an unknown/unrecognised relationship (%s), even with replyMode DRAFT",
    (relationship) => {
      expect(
        resolveContactPolicy(input({ relationship, replyMode: "DRAFT" }))
      ).toEqual({ action: "ignore", reason: "unknown_contact" });
    }
  );

  it("ignores a known contact set to OFF", () => {
    expect(resolveContactPolicy(input({ replyMode: "OFF" }))).toEqual({
      action: "ignore",
      reason: "reply_mode_off"
    });
  });

  it.each(["AUTO_SAFE", "AUTO"] as const)(
    "degrades %s to draft-only (never auto-send in Phase 7)",
    (replyMode) => {
      expect(resolveContactPolicy(input({ replyMode }))).toEqual({
        action: "draft",
        reason: "reply_mode_draft"
      });
    }
  );

  it.each([null, "", "always_send"])(
    "ignores an unsupported reply mode (%s)",
    (replyMode) => {
      expect(resolveContactPolicy(input({ replyMode }))).toEqual({
        action: "ignore",
        reason: "unsupported_reply_mode"
      });
    }
  );

  it("checks group first, before the relationship boundary", () => {
    expect(
      resolveContactPolicy(
        input({ conversationType: "group", relationship: "UNKNOWN", replyMode: "OFF" })
      )
    ).toEqual({ action: "ignore", reason: "group_disabled" });
  });
});
