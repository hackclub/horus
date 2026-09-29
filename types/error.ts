export type ErrorCode =
  | "Unauthorized"
  | "Forbidden"
  | "NotFound"
  | "NoNephthysHost"
  | "SlugNotFound"
  | "IncompleteInstanceData"
  | "EncryptionKeyMissing"
  | "EncryptionFailed"
  | "InvalidInput"
  // bring-your-own keys (hack club ai)
  | "InvalidApiKey"
  | "KeyNotSet"
  | "RateLimited"
  // upstream HTTP failures, see lib/errors.ts
  | "UpstreamTimeout"
  | "UpstreamUnreachable"
  | "UpstreamError"
  | "UpstreamBadResponse"
  | "InternalError";

export type ErrorResponse = {
  error: ErrorCode;
  message?: string;
};
