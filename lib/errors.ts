import type { ErrorCode, ErrorResponse } from "@/types/error";

//! this entire file runs on mine and claudes hopes and prayers

/** How a call to an upstream HTTP API (nephthys, cachet, …) failed. */
export type UpstreamFailureKind = "timeout" | "network" | "http" | "parse";

const CODE_BY_KIND: Record<UpstreamFailureKind, ErrorCode> = {
  timeout: "UpstreamTimeout",
  network: "UpstreamUnreachable",
  http: "UpstreamError",
  parse: "UpstreamBadResponse",
};

/**
 * An upstream call that failed, keeping the bits you actually need to debug it:
 * which URL, which kind of failure, the status, and the original error on `cause`.
 */
export class UpstreamError extends Error {
  readonly kind: UpstreamFailureKind;
  readonly url: string;
  readonly status?: number;

  constructor(
    kind: UpstreamFailureKind,
    url: string,
    message: string,
    options?: { cause?: unknown; status?: number },
  ) {
    super(message, { cause: options?.cause });
    this.name = "UpstreamError";
    this.kind = kind;
    this.url = url;
    this.status = options?.status;
  }

  get code(): ErrorCode {
    return CODE_BY_KIND[this.kind];
  }
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Flatten an error and its whole `cause` chain into one readable line.
 *
 * This matters because undici hides the real reason on `cause`: a DNS failure
 * arrives as `TypeError: fetch failed` and you only find the `ENOTFOUND` one
 * level down. Reading `error.message` alone throws that away.
 */
export function describeError(error: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current !== undefined && current !== null && !seen.has(current)) {
    seen.add(current);

    if (!(current instanceof Error)) {
      parts.push(stringifyUnknown(current));
      break;
    }

    // Only annotate real syscall codes (ENOTFOUND, ECONNREFUSED, …). Our own
    // `code` is already returned separately, and DOMException.code is a number.
    const syscall = (current as NodeJS.ErrnoException).code;
    const tag =
      typeof syscall === "string" && !(current instanceof UpstreamError)
        ? ` [${syscall}]`
        : "";

    parts.push(`${current.name}: ${current.message}${tag}`);
    current = current.cause;
  }

  return parts.join(" <- ") || "Unknown error";
}

export function errorCodeFor(error: unknown): ErrorCode {
  return error instanceof UpstreamError ? error.code : "InternalError";
}

/**
 * Turn a thrown error into an `ErrorResponse`, logging the full error (cause
 * chain and stack included) on the way out so a failure is never silent.
 */
export function toErrorResponse(
  context: string,
  error: unknown,
): ErrorResponse {
  const description = describeError(error);
  console.error(`[${context}] ${description}`, error);

  return {
    error: errorCodeFor(error),
    message: `${context}: ${description}`,
  };
}

/** Narrows a `T | ErrorResponse` result. Safe for array payloads. */
export function isErrorResponse(value: unknown): value is ErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "error" in value
  );
}

/**
 * Throw on an `ErrorResponse`, keeping the code *and* the message. Use this
 * instead of `throw new Error(result.error)`, which reports "InternalError"
 * and drops the only part that says what actually broke.
 */
export function unwrap<T>(result: T | ErrorResponse, context: string): T {
  if (isErrorResponse(result)) {
    throw new Error(
      `${context}: ${result.error}${result.message ? ` - ${result.message}` : ""}`,
    );
  }

  return result as T;
}
