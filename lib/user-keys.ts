import { db } from "@/db";
import { DEFAULT_AI_MODEL } from "./ai-models";
import { decrypt } from "./encryption";
import { isErrorResponse } from "./errors";

// Server-side reads of the keys users bring themselves. Nothing here may be
// exported through a "use server" file or handed to a client component: the
// decrypted values only ever leave the server as an Authorization header.

/** Show a key without revealing it, like Nephthys' own `sk_neph_abcd...wxyz`. */
export function censorKey(key: string): string {
  if (key.length <= 16) return `${key.slice(0, 4)}…`;
  return `${key.slice(0, 12)}…${key.slice(-4)}`;
}

function safeDecrypt(payload: string): string | null {
  try {
    const value = decrypt(payload);
    return isErrorResponse(value) ? null : value || null;
  } catch (error) {
    // Wrong/rotated ENCRYPTION_KEY or a corrupted row. Treat as "no key" so
    // the user can paste it again instead of the page crashing.
    console.error("[user-keys] could not decrypt a stored key", error);
    return null;
  }
}

export async function getNephthysKey(
  userId: string,
  instanceId: string,
): Promise<string | null> {
  const row = await db.query.nephthys_key.findFirst({
    where: { userId, instanceId },
    columns: { apiKey: true },
  });
  return row ? safeDecrypt(row.apiKey) : null;
}

export type AiConfig = { apiKey: string; model: string };

export async function getAiConfig(userId: string): Promise<AiConfig | null> {
  const row = await db.query.ai_settings.findFirst({
    where: { userId },
    columns: { apiKey: true, model: true },
  });
  if (!row) return null;
  const apiKey = safeDecrypt(row.apiKey);
  if (!apiKey) return null;
  return { apiKey, model: row.model || DEFAULT_AI_MODEL };
}

export async function hasAiKey(userId: string): Promise<boolean> {
  const row = await db.query.ai_settings.findFirst({
    where: { userId },
    columns: { userId: true },
  });
  return !!row;
}
