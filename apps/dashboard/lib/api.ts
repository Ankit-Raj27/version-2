import type {
  ContactResponse,
  ContactUpdate,
  ConversationListResponse,
  DraftResponse,
  MemoryFact,
  MemoryFactsResponse,
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

async function sendJson<T>(
  path: string,
  method: "POST" | "PATCH",
  payload: unknown
): Promise<T> {
  const response = await fetch(`${serverBaseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload)
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

function postJson<T>(path: string, payload: unknown): Promise<T> {
  return sendJson<T>(path, "POST", payload);
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

export function getDraft(conversationId: number, signal?: AbortSignal) {
  return getJson<DraftResponse>(`/api/conversations/${conversationId}/draft`, signal);
}

export function approveDraft(conversationId: number, draftId: number, editedText?: string) {
  return postJson<DraftResponse>(
    `/api/conversations/${conversationId}/drafts/${draftId}/approve`,
    editedText !== undefined ? { editedText } : {}
  );
}

export function regenerateDraft(conversationId: number, draftId: number) {
  return postJson<DraftResponse>(`/api/conversations/${conversationId}/drafts/${draftId}/regenerate`, {});
}

export function ignoreDraft(conversationId: number, draftId: number) {
  return postJson<DraftResponse>(`/api/conversations/${conversationId}/drafts/${draftId}/ignore`, {});
}

export function getContact(conversationId: number, signal?: AbortSignal) {
  return getJson<ContactResponse>(`/api/conversations/${conversationId}/contact`, signal);
}

export function updateContact(conversationId: number, patch: ContactUpdate) {
  return sendJson<ContactResponse>(`/api/conversations/${conversationId}/contact`, "PATCH", patch);
}

export function getContactFacts(conversationId: number, signal?: AbortSignal) {
  return getJson<MemoryFactsResponse>(
    `/api/conversations/${conversationId}/contact/facts`,
    signal
  );
}

export function setContactFactStatus(
  conversationId: number,
  factId: number,
  status: "confirmed" | "rejected"
) {
  return sendJson<{ fact: MemoryFact }>(
    `/api/conversations/${conversationId}/contact/facts/${factId}`,
    "PATCH",
    { status }
  );
}

export async function deleteContactFact(conversationId: number, factId: number) {
  const response = await fetch(
    `${serverBaseUrl}/api/conversations/${conversationId}/contact/facts/${factId}`,
    { method: "DELETE", headers: { Accept: "application/json" } }
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorPayload;
    throw new ApiError(
      body.error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      body.error?.code ?? null
    );
  }
}
