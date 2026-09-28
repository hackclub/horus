"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { ai_settings } from "@/db/schemas/instance-schema";
import { DEFAULT_AI_MODEL } from "@/lib/ai-models";
import { auth } from "@/lib/auth";
import { encrypt } from "@/lib/encryption";
import { isErrorResponse, toErrorResponse } from "@/lib/errors";
import {
  AiError,
  type AiModel,
  type AiUsage,
  getUsage,
  listModels,
} from "@/lib/hackclub-ai";
import { censorKey, getAiConfig } from "@/lib/user-keys";
import type { ErrorResponse } from "@/types/error";

// The Hack Club AI key each user brings themselves. Only a censored hint ever
// leaves the server.

const MAX_KEY_LENGTH = 512;
const MODEL_ID = /^[~a-z0-9][\w.:/~-]{1,120}$/i;

async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

function cleanKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  if (!key || key.length > MAX_KEY_LENGTH || /\s/.test(key)) return null;
  return key;
}

export type AiSettingsView = {
  keyHint: string | null;
  model: string;
  defaultModel: string;
};

export async function getMyAiSettings(): Promise<
  ErrorResponse | AiSettingsView
> {
  const user = await requireUser();
  if (!user) return { error: "Unauthorized" };

  const row = await db.query.ai_settings.findFirst({
    where: { userId: user.id },
    columns: { keyHint: true, model: true },
  });
  return {
    keyHint: row?.keyHint ?? null,
    model: row?.model || DEFAULT_AI_MODEL,
    defaultModel: DEFAULT_AI_MODEL,
  };
}

function aiError(error: unknown, context: string): ErrorResponse {
  if (error instanceof AiError) {
    return { error: error.code, message: error.message };
  }
  return toErrorResponse(context, error);
}

/** Validates against the proxy's free usage endpoint, then stores it. */
export async function setAiApiKey(
  apiKey: string,
): Promise<ErrorResponse | { keyHint: string; usage: AiUsage }> {
  const user = await requireUser();
  if (!user) return { error: "Unauthorized" };

  const key = cleanKey(apiKey);
  if (!key) return { error: "InvalidInput", message: "Paste a key first." };
  if (key.startsWith("sk_neph_")) {
    return {
      error: "InvalidInput",
      message:
        "That's a Nephthys key. Instance admins add those in the instance's Settings.",
    };
  }

  let usage: AiUsage;
  try {
    usage = await getUsage(key);
  } catch (error) {
    return aiError(error, "hack club ai key check");
  }

  const encrypted = encrypt(key);
  if (isErrorResponse(encrypted)) return encrypted;

  const keyHint = censorKey(key);
  await db
    .insert(ai_settings)
    .values({ userId: user.id, apiKey: encrypted, keyHint })
    .onConflictDoUpdate({
      target: ai_settings.userId,
      set: { apiKey: encrypted, keyHint },
    });

  return { keyHint, usage };
}

export async function setAiModel(
  model: string,
): Promise<ErrorResponse | { model: string }> {
  const user = await requireUser();
  if (!user) return { error: "Unauthorized" };

  const id = typeof model === "string" ? model.trim() : "";
  if (!MODEL_ID.test(id)) {
    return { error: "InvalidInput", message: "That isn't a model id." };
  }

  // Catch typos early. If the model list can't be loaded, trust the user.
  try {
    const models = await listModels();
    if (models.length > 0 && !models.some((m) => m.id === id)) {
      return {
        error: "NotFound",
        message: `Hack Club AI doesn't know a model called ${id}.`,
      };
    }
  } catch (error) {
    console.warn("[ai model check] model list unavailable", error);
  }

  const updated = await db
    .update(ai_settings)
    .set({ model: id === DEFAULT_AI_MODEL ? null : id })
    .where(eq(ai_settings.userId, user.id))
    .returning({ userId: ai_settings.userId });

  if (updated.length === 0) {
    return { error: "KeyNotSet", message: "Save your API key first." };
  }
  return { model: id };
}

export async function deleteAiApiKey(): Promise<
  ErrorResponse | { success: true }
> {
  const user = await requireUser();
  if (!user) return { error: "Unauthorized" };

  await db.delete(ai_settings).where(eq(ai_settings.userId, user.id));
  return { success: true };
}

export async function getMyAiUsage(): Promise<ErrorResponse | AiUsage> {
  const user = await requireUser();
  if (!user) return { error: "Unauthorized" };

  const config = await getAiConfig(user.id);
  if (!config) return { error: "KeyNotSet" };

  try {
    return await getUsage(config.apiKey);
  } catch (error) {
    return aiError(error, "hack club ai usage");
  }
}

export async function getAiModels(): Promise<ErrorResponse | AiModel[]> {
  try {
    return await listModels();
  } catch (error) {
    return aiError(error, "hack club ai models");
  }
}
