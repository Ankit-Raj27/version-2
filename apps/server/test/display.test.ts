import { describe, expect, it } from "vitest";
import { formatJid, resolveConversationTitle } from "../src/messaging/display.js";

describe("message display helpers", () => {
  it("formats phone, group, and opaque LID identifiers", () => {
    expect(formatJid("919876543210@s.whatsapp.net")).toBe("+919876543210");
    expect(formatJid("120363123456789@g.us")).toBe("Group ·6789");
    expect(formatJid("12345@lid")).toBe("Hidden ·2345");
  });

  it("handles malformed identifiers and title fallbacks", () => {
    expect(formatJid("")).toBe("Unknown conversation");
    expect(formatJid("not-a-jid")).toBe("not-a-jid");
    expect(resolveConversationTitle("Saved title", "Name", "1@lid")).toBe("Saved title");
    expect(resolveConversationTitle(null, "Name", "1@lid")).toBe("Name");
    expect(resolveConversationTitle(null, null, "1@lid")).toBe("Hidden ·1");
  });
});
