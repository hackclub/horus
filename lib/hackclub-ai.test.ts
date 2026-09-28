import { afterEach, describe, expect, test } from "bun:test";
import { AiError, chat, chatStream, type StreamEvent } from "./hackclub-ai";

const realFetch = globalThis.fetch;
let lastBody: Record<string, unknown> | null = null;

function mockFetch(respond: () => Response) {
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    lastBody = init?.body ? JSON.parse(String(init.body)) : null;
    return respond();
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  lastBody = null;
});

const request = {
  apiKey: "sk-hc-v1-test",
  model: "anthropic/claude-haiku-4.5",
  messages: [{ role: "user" as const, content: "hi" }],
  maxTokens: 500,
};

/** A body that arrives in awkward chunks, like a real network stream. */
function chunked(parts: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
}

async function collect(events: AsyncGenerator<StreamEvent>) {
  const out: StreamEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

describe("chatStream", () => {
  test("parses SSE split across chunks, skipping comments", async () => {
    mockFetch(
      () =>
        new Response(
          chunked([
            ": OPENROUTER PROCESSING\n\n",
            'data: {"choices":[{"delta":{"content":"Hel',
            'lo"}}]}\n\ndata: {"choices":[{"delta":{"reasoning":"hmm"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":" there"},"finish_reason":"length"}]}\n',
            "\ndata: [DONE]\n\n",
          ]),
        ),
    );

    const events = await collect(await chatStream(request));
    expect(events).toEqual([
      { type: "text", text: "Hello" },
      { type: "text", text: " there" },
      { type: "done", truncated: true },
    ]);
  });

  test("always asks for no-data-collection providers and a token cap", async () => {
    mockFetch(() => new Response(chunked(["data: [DONE]\n"])));
    await collect(await chatStream(request));
    expect(lastBody).toMatchObject({
      model: "anthropic/claude-haiku-4.5",
      max_tokens: 500,
      stream: true,
      provider: { data_collection: "deny" },
    });
  });

  test("surfaces errors sent mid-stream", async () => {
    mockFetch(
      () =>
        new Response(
          chunked([
            'data: {"choices":[{"delta":{"content":"Hi"}}]}\n',
            'data: {"error":{"message":"provider exploded"}}\n',
          ]),
        ),
    );
    const events = await chatStream(request);
    await expect(collect(events)).rejects.toThrow("provider exploded");
  });

  test("ends cleanly when the stream closes without [DONE]", async () => {
    mockFetch(
      () =>
        new Response(
          chunked(['data: {"choices":[{"delta":{"content":"Hi"}}]}\n']),
        ),
    );
    expect(await collect(await chatStream(request))).toEqual([
      { type: "text", text: "Hi" },
      { type: "done", truncated: false },
    ]);
  });
});

describe("errors", () => {
  test("maps a bad key to InvalidApiKey", async () => {
    mockFetch(() =>
      Response.json({ error: "Authentication failed" }, { status: 401 }),
    );
    const error = await chat(request).catch((e) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(error.code).toBe("InvalidApiKey");
  });

  test("passes the daily limit message through", async () => {
    mockFetch(() =>
      Response.json(
        { error: { message: "Daily spending limit of $3 reached." } },
        { status: 429 },
      ),
    );
    const error = await chat(request).catch((e) => e);
    expect(error.code).toBe("RateLimited");
    expect(error.message).toBe("Daily spending limit of $3 reached.");
  });

  test("explains when no provider meets the data policy", async () => {
    mockFetch(() =>
      Response.json(
        { error: { message: "No endpoints found matching your data policy" } },
        { status: 404 },
      ),
    );
    const error = await chat(request).catch((e) => e);
    expect(error.message).toContain("promises not to collect your data");
  });
});

describe("chat", () => {
  test("tolerates the proxy's heartbeat whitespace", async () => {
    mockFetch(
      () =>
        new Response(
          `   ${JSON.stringify({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] })}`,
        ),
    );
    expect(await chat(request)).toEqual({ content: "ok", truncated: false });
  });
});
