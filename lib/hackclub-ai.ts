import type { ErrorCode } from "@/types/error";

// Hack Club AI (https://ai.hackclub.com) is an OpenAI-compatible proxy in
// front of OpenRouter. Every call here uses the viewer's own key.

const BASE_URL = (
  process.env.HACK_CLUB_AI_BASE_URL || "https://ai.hackclub.com/proxy/v1"
).replace(/\/+$/, "");

const USER_AGENT = "HorusDashboard (+https://github.com/hackclub/horus)";
const REQUEST_TIMEOUT_MS = 60_000;
const STREAM_HEADERS_TIMEOUT_MS = 30_000;

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type JsonSchemaFormat = {
  type: "json_schema";
  json_schema: { name: string; strict?: boolean; schema: object };
};

export type ChatRequest = {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  /**
   * Always set. The proxy reserves `max_tokens × price` against the user's
   * daily limit before running, and without it reserves the model's whole
   * output window.
   */
  maxTokens: number;
  responseFormat?: JsonSchemaFormat;
  signal?: AbortSignal;
};

export class AiError extends Error {
  readonly code: ErrorCode;
  readonly status?: number;

  constructor(code: ErrorCode, message: string, status?: number) {
    super(message);
    this.name = "AiError";
    this.code = code;
    this.status = status;
  }
}

function requestBody(req: ChatRequest, stream: boolean) {
  return JSON.stringify({
    model: req.model,
    messages: req.messages,
    max_tokens: req.maxTokens,
    stream,
    ...(req.responseFormat ? { response_format: req.responseFormat } : {}),
    // Ticket text is Slack message content, which the Slack scraping policy
    // says must never be used to train models. Ask OpenRouter to only route
    // to providers that don't collect prompts.
    provider: { data_collection: "deny" },
  });
}

function headers(apiKey: string): HeadersInit {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    accept: "application/json",
    "user-agent": USER_AGENT,
  };
}

/** Pull a human message out of the proxy's (or OpenRouter's) error body. */
async function errorMessage(response: Response): Promise<string> {
  const text = (await response.text().catch(() => "")).trim();
  if (!text) return response.statusText || `HTTP ${response.status}`;
  try {
    const body = JSON.parse(text);
    const message =
      typeof body?.error === "string"
        ? body.error
        : (body?.error?.message ?? body?.message);
    if (typeof message === "string" && message) return message;
  } catch {}
  return text.slice(0, 300);
}

async function toAiError(response: Response): Promise<AiError> {
  const message = await errorMessage(response);
  const status = response.status;

  if (status === 401) {
    return new AiError(
      "InvalidApiKey",
      "Hack Club AI didn't accept your API key. Check it in Preferences → AI.",
      status,
    );
  }
  if (status === 429) {
    return new AiError("RateLimited", message, status);
  }
  if (/data policy|data_collection|no endpoints found/i.test(message)) {
    return new AiError(
      "UpstreamError",
      "No provider for this model promises not to collect your data, so Horus won't send ticket content to it. Pick another model in Preferences → AI.",
      status,
    );
  }
  if (status === 403) {
    return new AiError("Forbidden", message, status);
  }
  return new AiError("UpstreamError", `Hack Club AI: ${message}`, status);
}

async function post(
  path: string,
  apiKey: string,
  body: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs);
  try {
    return await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: headers(apiKey),
      body,
      cache: "no-store",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    throw new AiError(
      timedOut ? "UpstreamTimeout" : "UpstreamUnreachable",
      timedOut
        ? "Hack Club AI took too long to answer. Try again in a bit."
        : "Couldn't reach Hack Club AI.",
    );
  }
}

type Completion = {
  choices?: {
    message?: { content?: string | null };
    finish_reason?: string | null;
  }[];
  error?: { message?: string };
};

export async function chat(
  req: ChatRequest,
): Promise<{ content: string; truncated: boolean }> {
  const response = await post(
    "/chat/completions",
    req.apiKey,
    requestBody(req, false),
    REQUEST_TIMEOUT_MS,
    req.signal,
  );
  if (!response.ok) throw await toAiError(response);

  let data: Completion;
  try {
    // The proxy writes heartbeat whitespace before the JSON; JSON.parse
    // tolerates leading whitespace.
    data = JSON.parse(await response.text());
  } catch {
    throw new AiError(
      "UpstreamBadResponse",
      "Hack Club AI sent back something that isn't JSON.",
    );
  }

  if (data.error?.message) {
    throw new AiError("UpstreamError", `Hack Club AI: ${data.error.message}`);
  }

  const choice = data.choices?.[0];
  return {
    content: choice?.message?.content ?? "",
    truncated: choice?.finish_reason === "length",
  };
}

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "done"; truncated: boolean };

/**
 * Stream a completion as text deltas. Throws an AiError before yielding
 * anything if the proxy rejects the request.
 */
export async function chatStream(
  req: ChatRequest,
): Promise<AsyncGenerator<StreamEvent>> {
  const response = await post(
    "/chat/completions",
    req.apiKey,
    requestBody(req, true),
    STREAM_HEADERS_TIMEOUT_MS,
    req.signal,
  );
  if (!response.ok) throw await toAiError(response);
  if (!response.body) {
    throw new AiError("UpstreamBadResponse", "Hack Club AI sent no stream.");
  }

  return readSse(response.body);
}

async function* readSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamEvent> {
  const decoder = new TextDecoder();
  let buffer = "";
  let truncated = false;

  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });

    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");

      // Blank lines separate events; ":" lines are keep-alive comments.
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") {
        yield { type: "done", truncated };
        return;
      }

      let parsed: {
        choices?: {
          delta?: { content?: string | null };
          finish_reason?: string | null;
        }[];
        error?: { message?: string } | string;
      };
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }

      if (parsed.error) {
        const message =
          typeof parsed.error === "string"
            ? parsed.error
            : parsed.error.message || "unknown error";
        throw new AiError("UpstreamError", `Hack Club AI: ${message}`);
      }

      const choice = parsed.choices?.[0];
      if (choice?.finish_reason === "length") truncated = true;
      const text = choice?.delta?.content;
      if (text) yield { type: "text", text };
    }
  }

  yield { type: "done", truncated };
}

export type AiUsage = {
  totalRequests: number;
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
};

/** Lifetime usage for a key. Free to call, so it doubles as key validation. */
export async function getUsage(apiKey: string): Promise<AiUsage> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/stats`, {
      headers: headers(apiKey),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new AiError("UpstreamUnreachable", "Couldn't reach Hack Club AI.");
  }
  if (!response.ok) throw await toAiError(response);
  return (await response.json()) as AiUsage;
}

export type AiModel = {
  id: string;
  name: string;
  promptPrice: number; // USD per million input tokens
  completionPrice: number; // USD per million output tokens
};

/** Models the proxy can route to (public, no key needed). */
export async function listModels(): Promise<AiModel[]> {
  const response = await fetch(`${BASE_URL}/models`, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw await toAiError(response);

  const body = (await response.json()) as {
    data?: {
      id: string;
      name?: string;
      pricing?: { prompt?: string; completion?: string };
      architecture?: { output_modalities?: string[] };
    }[];
  };

  return (body.data ?? [])
    .filter(
      (m) =>
        typeof m.id === "string" &&
        (m.architecture?.output_modalities ?? ["text"]).includes("text"),
    )
    .map((m) => ({
      id: m.id,
      name: m.name || m.id,
      promptPrice: Number(m.pricing?.prompt ?? 0) * 1_000_000,
      completionPrice: Number(m.pricing?.completion ?? 0) * 1_000_000,
    }));
}
