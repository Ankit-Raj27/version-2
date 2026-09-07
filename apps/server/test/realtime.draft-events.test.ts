import { describe, expect, it } from "vitest";
import { formatSseEvent } from "../src/api/routes/events.js";

describe("formatSseEvent draft.updated", () => {
  it("serializes conversationId, draftId, and status only", () => {
    const formatted = formatSseEvent({
      type: "draft.updated",
      conversationId: 1,
      draftId: 2,
      status: "ready"
    });

    expect(formatted).toBe(
      `event: draft.updated\ndata: ${JSON.stringify({
        conversationId: 1,
        draftId: 2,
        status: "ready"
      })}\n\n`
    );
  });

  it("carries the generating and failed statuses through unchanged", () => {
    for (const status of ["generating", "failed"] as const) {
      const formatted = formatSseEvent({
        type: "draft.updated",
        conversationId: 1,
        draftId: 2,
        status
      });
      expect(formatted).toContain(`"status":"${status}"`);
    }
  });
});
