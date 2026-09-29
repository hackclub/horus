import { afterEach, describe, expect, test } from "bun:test";
import {
  AiError,
  budgetFor,
  chat,
  chatStream,
  type StreamEvent,
} from "./hackclub-ai";

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

describe("budgetFor", () => {
  function models(reasoning: Record<string, unknown> | undefined) {
    mockFetch(() =>
      Response.json({
        data: [{ id: "x/model", name: "Model", pricing: {}, reasoning }],
      }),
    );
  }

  test("leaves non-reasoning models alone", async () => {
    models({ mandatory: false });
    expect(await budgetFor("x/model", 1000)).toEqual({ maxTokens: 1000 });
  });

  test("turns off optional default-on reasoning", async () => {
    models({
      mandatory: false,
      default_enabled: true,
      supported_efforts: ["high", "low", "none"],
    });
    expect(await budgetFor("x/model", 1000)).toEqual({
      maxTokens: 1000,
      reasoning: { effort: "none", exclude: true },
    });
  });

  test("uses the lowest effort and adds headroom when reasoning is mandatory", async () => {
    models({ mandatory: true, supported_efforts: ["high", "medium", "low"] });
    const budget = await budgetFor("x/model", 1000);
    expect(budget.reasoning).toEqual({ effort: "low", exclude: true });
    expect(budget.maxTokens).toBeGreaterThan(1000);
  });

  test("adds headroom when the model list is unreachable", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect((await budgetFor("x/model", 1000)).maxTokens).toBeGreaterThan(1000);
  });
});

test("flags the proxy's prompt filter as blocked", async () => {
  mockFetch(() =>
    Response.json(
      {
        error:
          "For now, AI coding agents and frontends like SillyTavern aren't allowed to be used with ai.hackclub.com. Join #hackclub-ai on the Hack Club Slack for future updates.",
      },
      { status: 403 },
    ),
  );
  const error = await chat(request).catch((e) => e);
  expect(error.blocked).toBe(true);
  expect(error.code).toBe("Forbidden");
});

describe("budgetFor think mode", () => {
  function models(reasoning: Record<string, unknown> | undefined) {
    mockFetch(() =>
      Response.json({
        data: [{ id: "x/model", name: "Model", pricing: {}, reasoning }],
      }),
    );
  }

  test("uses low effort where offered, even if reasoning is optional", async () => {
    models({
      mandatory: false,
      default_enabled: true,
      supported_efforts: ["max", "high", "low"],
    });
    const budget = await budgetFor("x/model", 1000, "think");
    expect(budget.reasoning).toEqual({ effort: "low", exclude: true });
    expect(budget.maxTokens).toBeGreaterThan(1000);
  });

  test("leaves models without effort levels alone", async () => {
    models({ mandatory: false });
    expect(await budgetFor("x/model", 1000, "think")).toEqual({
      maxTokens: 1000,
    });
  });
});
