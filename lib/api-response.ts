import type { ErrorCode, ErrorResponse } from "@/types/error";
import { AiError } from "./hackclub-ai";

export function jsonError(
  error: ErrorCode,
  message: string,
  status: number,
): Response {
  return Response.json({ error, message } satisfies ErrorResponse, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

const STATUS_BY_CODE: Partial<Record<ErrorCode, number>> = {
  InvalidApiKey: 400,
  KeyNotSet: 400,
  InvalidInput: 400,
  Forbidden: 403,
  RateLimited: 429,
  UpstreamTimeout: 504,
};

export function aiErrorResponse(error: unknown, context: string): Response {
  if (error instanceof AiError) {
    return jsonError(
      error.code,
      error.message,
      STATUS_BY_CODE[error.code] ?? 502,
    );
  }
  console.error(`[${context}]`, error);
  return jsonError("InternalError", "Something broke on our side.", 500);
}

/**
 * Browsers always send Origin on a cross-site POST; refuse those so another
 * site can't spend a signed-in helper's AI credits. Same idea as the check
 * Next.js runs for Server Actions.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = (
    request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  )
    ?.split(",")[0]
    .trim();
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return null;
  }
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
