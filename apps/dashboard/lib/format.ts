const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit"
});
const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short"
});
const fullDateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric"
});

function isSameDay(left: Date, right: Date): boolean {
  return left.toDateString() === right.toDateString();
}

export function formatConversationTime(value: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const now = new Date();

  if (isSameDay(date, now)) {
    return timeFormatter.format(date);
  }

  const daysAgo = Math.floor(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) /
      86_400_000
  );

  return daysAgo >= 0 && daysAgo < 7
    ? weekdayFormatter.format(date)
    : shortDateFormatter.format(date);
}

export function formatMessageTime(value: string): string {
  return timeFormatter.format(new Date(value));
}

export function formatDateSeparator(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(date, now)) {
    return "Today";
  }

  if (isSameDay(date, yesterday)) {
    return "Yesterday";
  }

  return fullDateFormatter.format(date);
}

export function dayKey(value: string): string {
  return new Date(value).toDateString();
}

export function initials(title: string): string {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}
