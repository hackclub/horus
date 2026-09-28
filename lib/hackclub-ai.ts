import type { ErrorCode } from "@/types/error";

// Hack Club AI (https://ai.hackclub.com) is an OpenAI-compatible proxy in
// front of OpenRouter. Every call here uses the viewer's own key.

const BASE_URL = (
  process.env.HACK_CLUB_AI_BASE_URL || "https://ai.hackclub.com/proxy/v1"
).replace(/\/+$/, "");

const USER_AGENT = "HorusDashboard (+https://github.com/hackclub/horus)";
const REQUEST_TIMEOUT_MS = 60_000;
// Only bounds the wait for response headers; a stream may then run longer.
const STREAM_HEADERS_TIMEOUT_MS = 30_000;
// Extra output budget for models that can't stop reasoning: OpenRouter
// counts reasoning tokens against max_tokens.
const REASONING_HEADROOM = 4_000;

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
  reasoning?: ReasoningConfig;
  responseFormat?: JsonSchemaFormat;
  signal?: AbortSignal;
};

/** OpenRouter's unified reasoning parameter. */
export type ReasoningConfig =
  | { effort: string; exclude: true }
  | { enabled: false; exclude: true };

export class AiError extends Error {
  readonly code: ErrorCode;
  readonly status?: number;
  /** The proxy's prompt/agent filter refused the request body. */
  readonly blocked: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    status?: number,
    options?: { blocked?: boolean },
  ) {
    super(message);
    this.name = "AiError";
    this.code = code;
    this.status = status;
    this.blocked = options?.blocked ?? false;
  }
}

function requestBody(req: ChatRequest, stream: boolean) {
  return JSON.stringify({
    model: req.model,
    messages: req.messages,
    max_tokens: req.maxTokens,
    stream,
    ...(req.reasoning ? { reasoning: req.reasoning } : {}),
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
  if (
    status === 403 &&
    /aren't allowed to be used with ai\.hackclub\.com/i.test(message)
  ) {
    // The proxy blocks bodies containing known coding-agent prompts. Ticket
    // text can trip it; say so plainly rather than trying to get around it.
    return new AiError(
      "Forbidden",
      "Hack Club AI's filter refused this request, most likely because of something in the ticket text.",
      status,
      { blocked: true },
    );
  }
  if (status === 403) {
    return new AiError("Forbidden", message, status);
  }
  return new AiError("UpstreamError", `Hack Club AI: ${message}`, status);
}

const TIMED_OUT = () =>
  new AiError(
    "UpstreamTimeout",
    "Hack Club AI took too long to answer. Try again in a bit.",
  );

/**
 * POST with a timer. The caller clears it via `done()`: right after the
 * headers for a stream (the body may legitimately take longer), or after the
 * body has been read for a plain request.
 */
async function post(
  path: string,
  apiKey: string,
  body: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ response: Response; done: () => void; timedOut: () => boolean }> {
  const timer = new AbortController();
  const handle = setTimeout(() => timer.abort(), timeoutMs);
  const done = () => clearTimeout(handle);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: headers(apiKey),
      body,
      cache: "no-store",
      signal: signal ? AbortSignal.any([signal, timer.signal]) : timer.signal,
    });
    return { response, done, timedOut: () => timer.signal.aborted };
  } catch (error) {
    done();
    if (signal?.aborted) throw error;
    if (timer.signal.aborted) throw TIMED_OUT();
    throw new AiError("UpstreamUnreachable", "Couldn't reach Hack Club AI.");
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
  const { response, done, timedOut } = await post(
    "/chat/completions",
    req.apiKey,
    requestBody(req, false),
    REQUEST_TIMEOUT_MS,
    req.signal,
  );

  let text: string;
  try {
    if (!response.ok) throw await toAiError(response);
    text = await response.text();
  } catch (error) {
    if (timedOut()) throw TIMED_OUT();
    throw error;
  } finally {
    done();
  }

  let data: Completion;
  try {
    // The proxy writes heartbeat whitespace before the JSON; JSON.parse
    // tolerates leading whitespace.
    data = JSON.parse(text);
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
  const { response, done } = await post(
    "/chat/completions",
    req.apiKey,
    requestBody(req, true),
    STREAM_HEADERS_TIMEOUT_MS,
    req.signal,
  );
  // Headers are in: from here only the caller's signal ends the stream.
  done();
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
  reasoning: {
    mandatory: boolean;
    /** Reasons unless told otherwise. */
    byDefault: boolean;
    efforts: string[];
  } | null;
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
      reasoning?: {
        mandatory?: boolean;
        default_enabled?: boolean;
        supported_efforts?: string[];
      };
    }[];
  };

  return (body.data ?? [])
    .filter(
      (m) =>
        typeof m.id === "string" &&
        // Batch variants are for the batch API, not live requests.
        !m.id.endsWith(":batch") &&
        (m.architecture?.output_modalities ?? ["text"]).includes("text"),
    )
    .map((m) => ({
      id: m.id,
      name: m.name || m.id,
      promptPrice: Number(m.pricing?.prompt ?? 0) * 1_000_000,
      completionPrice: Number(m.pricing?.completion ?? 0) * 1_000_000,
      reasoning: m.reasoning
        ? {
            mandatory: !!m.reasoning.mandatory,
            byDefault: !!(m.reasoning.mandatory || m.reasoning.default_enabled),
            efforts: m.reasoning.supported_efforts ?? [],
          }
        : null,
    }));
}

/**
 * Output budget and reasoning setting for a model. These tasks don't need
 * deep thinking, so turn reasoning off where the model allows it, otherwise
 * use its lowest effort and leave room for the reasoning tokens, which count
 * against max_tokens.
 */
export async function budgetFor(
  model: string,
  maxTokens: number,
): Promise<{ maxTokens: number; reasoning?: ReasoningConfig }> {
  let info: AiModel | undefined;
  try {
    info = (await listModels()).find((m) => m.id === model);
  } catch {
    // Model list unavailable: assume it may reason and give it room.
    return { maxTokens: maxTokens + REASONING_HEADROOM };
  }
  const reasoning = info?.reasoning;
  if (!reasoning?.byDefault) return { maxTokens };

  if (!reasoning.mandatory) {
    return {
      maxTokens,
      reasoning: reasoning.efforts.includes("none")
        ? { effort: "none", exclude: true }
        : { enabled: false, exclude: true },
    };
  }

  const effort = ["minimal", "low"].find((e) => reasoning.efforts.includes(e));
  return {
    maxTokens: maxTokens + REASONING_HEADROOM,
    reasoning: effort ? { effort, exclude: true } : undefined,
  };
}
