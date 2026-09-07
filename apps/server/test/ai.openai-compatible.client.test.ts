import { afterEach, describe, expect, it, vi } from "vitest";
import { AiError } from "../src/ai/errors.js";
import { createOpenAiCompatibleClient } from "../src/ai/openai-compatible/client.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

const client = createOpenAiCompatibleClient({
  apiKey: "test-key",
  baseUrl: "https://example.test/v1",
  model: "muse-spark-1.3",
  timeoutMs: 5_000,
  reasoningEffort: "minimal"
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createOpenAiCompatibleClient", () => {
  it("sends the expected request shape and parses a successful response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        model: "muse-spark-1.3",
        choices: [
          { message: { role: "assistant", content: '{"reply":"sure, see you then"}' }, finish_reason: "stop" }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.complete({
      messages: [{ role: "user", content: "hi" }],
      maxOutputTokens: 512,
      temperature: 0.6,
      jsonSchema: { name: "reply", schema: { type: "object" } }
    });

    expect(result.text).toBe('{"reply":"sure, see you then"}');
    expect(result.model).toBe("muse-spark-1.3");
    expect(result.usage).toMatchObject({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
    expect(result.finishReason).toBe("stop");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.test/v1/chat/completions");

    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: "muse-spark-1.3",
      max_completion_tokens: 512,
      reasoning_effort: "minimal",
      temperature: 0.6
    });
    expect(body.response_format.json_schema.name).toBe("reply");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
  });

  it("omits reasoning_effort entirely when configured as empty (non-reasoning models reject the param)", async () => {
    const noReasoningClient = createOpenAiCompatibleClient({
      apiKey: "test-key",
      baseUrl: "https://example.test/v1",
      model: "gpt-4o-mini",
      timeoutMs: 5_000,
      reasoningEffort: ""
    });
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        model: "gpt-4o-mini",
        choices: [{ message: { role: "assistant", content: "hi" }, finish_reason: "stop" }]
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await noReasoningClient.complete({ messages: [], maxOutputTokens: 10 });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body).not.toHaveProperty("reasoning_effort");
  });

  it("maps a 401 with an error envelope to an auth AiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: { message: "Invalid API key" } }, 401))
    );

    await expect(client.complete({ messages: [], maxOutputTokens: 10 })).rejects.toMatchObject({
      kind: "auth",
      status: 401,
      message: "Invalid API key"
    });
  });

  it("maps a 429 without a parseable body to rate_limit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status: 429 })));

    await expect(client.complete({ messages: [], maxOutputTokens: 10 })).rejects.toMatchObject({
      kind: "rate_limit",
      status: 429
    });
  });

  it("throws invalid_response when the body fails schema validation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ nope: true })));

    await expect(client.complete({ messages: [], maxOutputTokens: 10 })).rejects.toMatchObject({
      kind: "invalid_response"
    });
  });

  it("throws empty_output when the assistant message has no content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          model: "muse-spark-1.3",
          choices: [{ message: { role: "assistant", content: "" }, finish_reason: "stop" }]
        })
      )
    );

    await expect(client.complete({ messages: [], maxOutputTokens: 10 })).rejects.toMatchObject({
      kind: "empty_output"
    });
  });

  it("wraps a network failure as a network AiError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await expect(client.complete({ messages: [], maxOutputTokens: 10 })).rejects.toMatchObject({
      kind: "network"
    });
  });

  it("wraps an AbortSignal timeout as a timeout AiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation was aborted", "TimeoutError"))
    );

    const error = await client
      .complete({ messages: [], maxOutputTokens: 10 })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(AiError);
    expect((error as AiError).kind).toBe("timeout");
  });
});
