export interface AiMessage {
  role: "system" | "user";
  content: string;
}

export interface AiJsonSchema {
  name: string;
  schema: Record<string, unknown>;
}

export interface AiCompletionRequest {
  messages: AiMessage[];
  maxOutputTokens: number;
  temperature?: number;
  jsonSchema?: AiJsonSchema;
}

export interface AiTokenUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  reasoningTokens: number | null;
  cachedInputTokens: number | null;
}

export interface AiCompletionResult {
  text: string;
  model: string;
  usage: AiTokenUsage;
  latencyMs: number;
  finishReason: string | null;
}

export interface AiClient {
  complete(request: AiCompletionRequest): Promise<AiCompletionResult>;
}
