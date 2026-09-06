import type {
  ConversationListResponse,
  MessageCursor,
  MessagePageResponse,
  SystemStatus
} from "./types";

const serverBaseUrl = (
  process.env.NEXT_PUBLIC_SERVER_BASE_URL ?? "http://127.0.0.1:3001"
).replace(/\/$/, "");

interface ApiErrorPayload {
  error?: { code?: string; message?: string };
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${serverBaseUrl}${path}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: signal ?? null
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorPayload;
    throw new ApiError(
      body.error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      body.error?.code ?? null
    );
  }

  return (await response.json()) as T;
}

export function getServerBaseUrl(): string {
  return serverBaseUrl;
}

export function getConversations(signal?: AbortSignal) {
  return getJson<ConversationListResponse>("/api/conversations", signal);
}

export function getMessages(
  conversationId: number,
  cursor: MessageCursor | null = null,
  signal?: AbortSignal
) {
  const query = new URLSearchParams({ limit: "50" });

  if (cursor) {
    query.set("beforeTimestamp", String(new Date(cursor.timestamp).getTime()));
    query.set("beforeId", String(cursor.id));
  }

  return getJson<MessagePageResponse>(
    `/api/conversations/${conversationId}/messages?${query}`,
    signal
  );
}

export function getSystemStatus(signal?: AbortSignal) {
  return getJson<SystemStatus>("/api/system/status", signal);
}
