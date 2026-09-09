import { RELATIONSHIPS, type Relationship, type ReplyMode } from "../../db/schema.js";

/**
 * Phase 7 — deterministic contact policy.
 *
 * Application policy decides WHETHER the AI may act; the AI only decides WHAT to say
 * once permission is granted. This resolver is pure and side-effect free: it is
 * evaluated after a message is persisted but before any AI generation request.
 *
 * AUTO_SAFE / AUTO are accepted as stored values for forward compatibility but are
 * degraded to draft-only here — Phase 7 introduces no autonomous send path. A real
 * auto-reply path is deferred to the selective auto-reply phase.
 */

export type ContactPolicyDecision =
  | {
      action: "ignore";
      reason:
        | "unknown_contact"
        | "reply_mode_off"
        | "group_disabled"
        | "unsupported_reply_mode";
    }
  | { action: "draft"; reason: "reply_mode_draft" };

export interface ContactPolicyInput {
  relationship: string | null;
  replyMode: string | null;
  conversationType: string;
}

/** Coerce any stored value (null, legacy free-text, junk) to a known relationship. */
export function normalizeRelationship(value: string | null): Relationship {
  return (RELATIONSHIPS as readonly string[]).includes(value ?? "")
    ? (value as Relationship)
    : "UNKNOWN";
}

export function resolveContactPolicy(
  input: ContactPolicyInput
): ContactPolicyDecision {
  // Groups are disabled regardless of any other setting.
  if (input.conversationType !== "direct") {
    return { action: "ignore", reason: "group_disabled" };
  }

  // Unknown is a safety boundary: an unknown (or unrecognised/null) relationship never
  // drafts, even if the stored reply mode says otherwise (fail-closed on invalid state).
  if (normalizeRelationship(input.relationship) === "UNKNOWN") {
    return { action: "ignore", reason: "unknown_contact" };
  }

  switch (input.replyMode as ReplyMode | null) {
    case "DRAFT":
      return { action: "draft", reason: "reply_mode_draft" };
    // Degraded to draft-only — no autonomous send in Phase 7.
    case "AUTO_SAFE":
    case "AUTO":
      return { action: "draft", reason: "reply_mode_draft" };
    case "OFF":
      return { action: "ignore", reason: "reply_mode_off" };
    default:
      return { action: "ignore", reason: "unsupported_reply_mode" };
  }
}
