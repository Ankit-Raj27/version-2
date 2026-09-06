export function formatJid(jid: string): string {
  const trimmed = jid.trim();

  if (!trimmed) {
    return "Unknown conversation";
  }

  const separator = trimmed.lastIndexOf("@");

  if (separator <= 0 || separator === trimmed.length - 1) {
    return trimmed;
  }

  const local = trimmed.slice(0, separator).split(":", 1)[0] ?? "";
  const domain = trimmed.slice(separator + 1);

  if (domain === "s.whatsapp.net") {
    return local ? `+${local}` : trimmed;
  }

  if (domain === "g.us") {
    return `Group ·${local.slice(-4) || "unknown"}`;
  }

  if (domain === "lid") {
    return `Hidden ·${local.slice(-4) || "unknown"}`;
  }

  return trimmed;
}

export function resolveConversationTitle(
  title: string | null,
  displayName: string | null,
  jid: string
): string {
  return title?.trim() || displayName?.trim() || formatJid(jid);
}
