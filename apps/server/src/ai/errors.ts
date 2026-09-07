export type AiErrorKind =
  | "timeout"
  | "auth"
  | "rate_limit"
  | "bad_request"
  | "server"
  | "network"
  | "invalid_response"
  | "empty_output";

const RETRYABLE_KINDS: ReadonlySet<AiErrorKind> = new Set([
  "timeout",
  "rate_limit",
  "server",
  "network"
]);

export class AiError extends Error {
  readonly kind: AiErrorKind;
  readonly status: number | undefined;
  readonly retryable: boolean;

  constructor(
    kind: AiErrorKind,
    message: string,
    options?: { status?: number; cause?: unknown }
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AiError";
    this.kind = kind;
    this.status = options?.status;
    this.retryable = RETRYABLE_KINDS.has(kind);
  }
}

export function aiErrorKindFromStatus(status: number): AiErrorKind {
  if (status === 401 || status === 403) {
    return "auth";
  }

  if (status === 429) {
    return "rate_limit";
  }

  if (status === 400) {
    return "bad_request";
  }

  return "server";
}
