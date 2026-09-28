"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { ai_settings, nephthys_key } from "@/db/schemas/instance-schema";
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
import { checkNephthysKey } from "@/lib/nephthys";
import { censorKey, getAiConfig } from "@/lib/user-keys";
import type { ErrorResponse } from "@/types/error";

// Keys the user brings themselves: one Nephthys key per instance, one Hack
// Club AI key. Only censored hints ever leave the server.

const MAX_KEY_LENGTH = 512;
// A bare hostname with an optional port. Anything else (paths, queries,
// credentials) could smuggle the key somewhere unexpected.
const PLAIN_HOST =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/i;
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

// ==================== nephthys ====================

export type NephthysKeyEntry = {
  instanceId: string;
  name: string;
  slug: string;
  host: string;
  deprecated: boolean;
  isMember: boolean;
  keyHint: string | null;
  /** The instance moved to another host since the key was saved. */
  hostChanged: boolean;
  updatedAt: string | null;
};

/** Every instance with a Nephthys host, and whether the caller saved a key. */
export async function getMyNephthysKeys(): Promise<
  ErrorResponse | NephthysKeyEntry[]
> {
  const user = await requireUser();
  if (!user) return { error: "Unauthorized" };

  const [instances, keys, memberships] = await Promise.all([
    db.query.instance.findMany({
      with: { organization: true, nephthys_host: true },
    }),
    db.query.nephthys_key.findMany({
      where: { userId: user.id },
      columns: {
        instanceId: true,
        keyHint: true,
        host: true,
        updatedAt: true,
      },
    }),
    db.query.member.findMany({
      where: { userId: user.id },
      columns: { organizationId: true },
    }),
  ]);

  const keyByInstance = new Map(keys.map((k) => [k.instanceId, k]));
  const memberOrgs = new Set(memberships.map((m) => m.organizationId));

  return instances
    .flatMap((instance): NephthysKeyEntry[] => {
      if (!instance.nephthys_host || !instance.organization) return [];
      const key = keyByInstance.get(instance.id);
      return [
        {
          instanceId: instance.id,
          name: instance.name || instance.organization.name,
          slug: instance.organization.slug,
          host: instance.nephthys_host.host,
          deprecated: !!instance.deprecated,
          isMember: memberOrgs.has(instance.organization.id),
          keyHint: key?.keyHint ?? null,
          hostChanged: !!key && key.host !== instance.nephthys_host.host,
          updatedAt: key?.updatedAt.toISOString() ?? null,
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(!!b.keyHint) - Number(!!a.keyHint) ||
        Number(b.isMember) - Number(a.isMember) ||
        Number(a.deprecated) - Number(b.deprecated) ||
        a.name.localeCompare(b.name),
    );
}

/**
 * Checks the key against that instance's own host before storing it. The
 * host always comes from the database, never the client, so a key can't be
 * sent anywhere but the Nephthys it was made for.
 */
export async function setNephthysApiKey(
  instanceId: string,
  apiKey: string,
): Promise<ErrorResponse | { keyHint: string; descriptions: boolean | null }> {
  const user = await requireUser();
  if (!user) return { error: "Unauthorized" };

  const key = cleanKey(apiKey);
  if (!key) return { error: "InvalidInput", message: "Paste a key first." };
  if (!key.startsWith("sk_neph_")) {
    return {
      error: "InvalidInput",
      message:
        "That doesn't look like a Nephthys key. They start with sk_neph_.",
    };
  }

  if (typeof instanceId !== "string") return { error: "InvalidInput" };
  const host = await db.query.nephthys_host.findFirst({
    where: { instanceId },
    columns: { host: true },
  });
  if (!host) return { error: "NotFound", message: "Unknown instance." };
  if (!PLAIN_HOST.test(host.host)) {
    return {
      error: "InvalidInput",
      message: `This instance's Nephthys host (${host.host}) isn't a plain hostname, so Horus won't send a key to it. Ask an instance admin to fix it in Settings.`,
    };
  }

  let check: Awaited<ReturnType<typeof checkNephthysKey>>;
  try {
    check = await checkNephthysKey(host.host, key);
  } catch (error) {
    return toErrorResponse(`nephthys key check (${host.host})`, error);
  }
  if (!check.valid) {
    return {
      error: "InvalidApiKey",
      message: `${host.host} didn't accept that key. Keys only work on the instance they were made on.`,
    };
  }

  const encrypted = encrypt(key);
  if (isErrorResponse(encrypted)) return encrypted;

  const keyHint = censorKey(key);
  await db
    .insert(nephthys_key)
    .values({
      keyId: crypto.randomUUID(),
      instanceId,
      userId: user.id,
      apiKey: encrypted,
      keyHint,
      host: host.host,
    })
    .onConflictDoUpdate({
      target: [nephthys_key.instanceId, nephthys_key.userId],
      set: { apiKey: encrypted, keyHint, host: host.host },
    });

  return { keyHint, descriptions: check.descriptions };
}

export async function deleteNephthysApiKey(
  instanceId: string,
): Promise<ErrorResponse | { success: true }> {
  const user = await requireUser();
  if (!user) return { error: "Unauthorized" };
  if (typeof instanceId !== "string") return { error: "InvalidInput" };

  await db
    .delete(nephthys_key)
    .where(
      and(
        eq(nephthys_key.userId, user.id),
        eq(nephthys_key.instanceId, instanceId),
      ),
    );
  return { success: true };
}

// ==================== hack club ai ====================

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
      message: "That's a Nephthys key. Put it under Keys instead.",
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
