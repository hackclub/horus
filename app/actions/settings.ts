"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/db";
import { member, organization } from "@/db/schemas/auth-schema";
import {
  marmalade_data,
  nephthys_host,
  nephthys_key,
} from "@/db/schemas/instance-schema";
import { auth } from "@/lib/auth";
import {
  authorizeInstanceRole,
  ORG_ROLES,
  type OrgRole,
  type PermissionRequest,
} from "@/lib/auth-permissions";
import { encrypt } from "@/lib/encryption";
import { isErrorResponse, toErrorResponse } from "@/lib/errors";
import { checkNephthysKey } from "@/lib/nephthys";
import { censorKey } from "@/lib/user-keys";
import type { ErrorResponse } from "@/types/error";
import { searchGlobalUsers } from "./shared";

// customSession's inferred type drops the org plugin's session field, but the
// organization plugin does set it at runtime. Read it through a narrow cast.
function activeOrgOf(
  session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>,
): string | null {
  return (
    (session.session as { activeOrganizationId?: string | null })
      .activeOrganizationId ?? null
  );
}

// ==================== permission gate ====================

// Resolves the caller's active instance and enforces `permissions` against
// their org role. Every mutating action below routes through this — it is the
// single server-side authority; the UI flags from getSettingsData are cosmetic.
async function requireInstance(permissions: PermissionRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");

  const organizationId = activeOrgOf(session);
  if (!organizationId) throw new Error("No active instance selected");

  const m = await db.query.member.findFirst({
    where: { organizationId, userId: session.user.id },
  });
  if (!m) throw new Error("You are not a member of this instance");
  if (!authorizeInstanceRole(m.role, permissions)) throw new Error("Forbidden");

  return { session, organizationId, callerMemberId: m.id, role: m.role };
}

function revalidate() {
  revalidatePath("/dashboard/settings");
}

// ==================== read ====================

export type SettingsData = Awaited<ReturnType<typeof getSettingsData>>;

export async function getSettingsData() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const organizationId = activeOrgOf(session);
  if (!organizationId) return null;

  const org = await db.query.organization.findFirst({
    where: { id: organizationId },
    with: {
      instance: {
        with: {
          nephthys_host: true,
          marmalade_data: true,
          nephthys_key: {
            columns: { keyHint: true, host: true, updatedAt: true },
            with: { setByUser: { columns: { name: true } } },
          },
        },
      },
      members: { with: { user: true } },
    },
  });
  if (!org?.instance) return null;

  const me = org.members.find((m) => m.userId === session.user.id);
  if (!me) return null; // not a member → no access

  const authorize = (p: PermissionRequest) => authorizeInstanceRole(me.role, p);
  let transparent = false;
  try {
    transparent = !!JSON.parse(org.metadata ?? "{}").transparent;
  } catch {}

  return {
    perms: {
      identityRead: authorize({ instance: ["general:read"] }),
      identityWrite: authorize({ instance: ["general:write"] }),
      nephthysRead: authorize({ instance: ["general:read"] }),
      nephthysWrite: authorize({ instance: ["general:write"] }),
      membersRead: authorize({ instance: ["members:read"] }),
      membersWrite: authorize({ instance: ["members:write"] }),
      sensitiveRead: authorize({ instance: ["sensitive:read"] }),
      sensitiveWrite: authorize({ instance: ["sensitive:write"] }),
      danger: authorize({ instance: ["danger:write"] }),
    },
    identity: {
      name: org.name,
      slug: org.slug,
      logo: org.logo,
      transparent,
    },
    nephthys: {
      host: org.instance.nephthys_host?.host ?? "",
      slackChannel: org.instance.nephthys_host?.slackChannel ?? "",
      // Only a censored hint; the key itself never leaves the server.
      key: org.instance.nephthys_key
        ? {
            hint: org.instance.nephthys_key.keyHint,
            setBy: org.instance.nephthys_key.setByUser?.name ?? null,
            updatedAt: org.instance.nephthys_key.updatedAt.toISOString(),
            hostChanged:
              org.instance.nephthys_key.host !==
              org.instance.nephthys_host?.host,
          }
        : null,
    },
    marmalade: {
      mailboxId: org.instance.marmalade_data?.mailboxId ?? "",
    },
    members: org.members.map((m) => ({
      memberId: m.id,
      userId: m.userId,
      name: m.user?.name ?? "Unknown",
      slack_id: m.user?.slack_id ?? "",
      role: m.role,
    })),
  };
}

// ==================== identity (general:write) ====================

export async function updateIdentity(input: {
  name?: string;
  slug?: string;
  logo?: string | null;
  transparent?: boolean;
}) {
  const { organizationId } = await requireInstance({
    instance: ["general:write"],
  });

  const set: Record<string, unknown> = {};
  if (input.name !== undefined) set.name = input.name;
  if (input.slug !== undefined) set.slug = input.slug.toLowerCase();
  if (input.logo !== undefined) set.logo = input.logo || null;
  if (input.transparent !== undefined) {
    const current = await db.query.organization.findFirst({
      where: { id: organizationId },
    });
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(current?.metadata ?? "{}");
    } catch {}
    meta.transparent = input.transparent;
    set.metadata = JSON.stringify(meta);
  }

  if (Object.keys(set).length === 0) return;
  await db
    .update(organization)
    .set(set)
    .where(eq(organization.id, organizationId));
  revalidate();
}

// ==================== nephthys host (general:write) ====================

export async function updateNephthys(input: {
  host: string;
  slackChannel: string;
}) {
  const { organizationId } = await requireInstance({
    instance: ["general:write"],
  });
  const instanceId = await instanceIdFor(organizationId);

  await db
    .insert(nephthys_host)
    .values({ instanceId, ...input })
    .onConflictDoUpdate({ target: nephthys_host.instanceId, set: input });
  revalidate();
}

// ==================== nephthys api key (general:write) ====================

// A bare hostname with an optional port. Anything else (paths, queries,
// credentials) could smuggle the key somewhere unexpected.
const PLAIN_HOST =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/i;

/**
 * One key per instance. It's checked against the instance's current host
 * before it's stored, and pinned to that host: if the host changes later,
 * the key isn't sent to the new one.
 */
export async function setNephthysKey(
  apiKey: string,
): Promise<ErrorResponse | { keyHint: string; descriptions: boolean | null }> {
  const { session, organizationId } = await requireInstance({
    instance: ["general:write"],
  });

  const key = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!key || key.length > 512 || /\s/.test(key)) {
    return { error: "InvalidInput", message: "Paste a key first." };
  }
  if (!key.startsWith("sk_neph_")) {
    return {
      error: "InvalidInput",
      message:
        "That doesn't look like a Nephthys key. They start with sk_neph_.",
    };
  }

  const instanceId = await instanceIdFor(organizationId);
  const host = await db.query.nephthys_host.findFirst({
    where: { instanceId },
    columns: { host: true },
  });
  if (!host) {
    return {
      error: "NoNephthysHost",
      message: "Save the Nephthys host first.",
    };
  }
  if (!PLAIN_HOST.test(host.host)) {
    return {
      error: "InvalidInput",
      message: `The Nephthys host (${host.host}) isn't a plain hostname, so Horus won't send a key to it. Fix the host above first.`,
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
      message: `${host.host} didn't accept that key. Keys only work on the Nephthys they were made on.`,
    };
  }

  const encrypted = encrypt(key);
  if (isErrorResponse(encrypted)) return encrypted;

  const keyHint = censorKey(key);
  const values = {
    apiKey: encrypted,
    keyHint,
    host: host.host,
    setBy: session.user.id,
  };
  await db
    .insert(nephthys_key)
    .values({ instanceId, ...values })
    .onConflictDoUpdate({ target: nephthys_key.instanceId, set: values });

  revalidate();
  return { keyHint, descriptions: check.descriptions };
}

export async function removeNephthysKey() {
  const { organizationId } = await requireInstance({
    instance: ["general:write"],
  });
  const instanceId = await instanceIdFor(organizationId);
  await db.delete(nephthys_key).where(eq(nephthys_key.instanceId, instanceId));
  revalidate();
}

// ==================== marmalade/jelly mailbox (general:write) ====================

export async function updateJellyMailbox(mailboxId: string) {
  const { organizationId } = await requireInstance({
    instance: ["general:write"],
  });
  const instanceId = await instanceIdFor(organizationId);

  await db
    .insert(marmalade_data)
    .values({ instanceId, mailboxId })
    .onConflictDoUpdate({
      target: marmalade_data.instanceId,
      set: { mailboxId },
    });
  revalidate();
}

// ==================== members (members:write) ====================

export async function searchInstanceCandidates(query: string) {
  await requireInstance({ instance: ["members:write"] });

  //! NO EMAIL SEARCH FOR MEMBERSHIP MANAGEMENT — EMAIL IS ONLY FOR SUPERADMIN SEARCH
  return searchGlobalUsers(query, false);
}

export async function addInstanceMember(userId: string, role: OrgRole) {
  if (!ORG_ROLES.includes(role)) {
    throw new Error(`Invalid role: ${role}`);
  }

  if (role.includes("sponsor")) {
    throw new Error("Cannot add a sponsor — transfer ownership instead");
  }

  const { organizationId } = await requireInstance({
    instance: ["members:write"],
  });

  const existing = await db.query.member.findFirst({
    where: { organizationId, userId },
  });
  if (existing) throw new Error("User is already a member");

  await db.insert(member).values({
    id: crypto.randomUUID(),
    organizationId,
    userId,
    role,
    createdAt: new Date(),
  });
  revalidate();
}

export async function updateInstanceMemberRole(
  memberId: string,
  role: OrgRole,
) {
  const { organizationId } = await requireInstance({
    instance: ["members:write"],
  });
  const target = await memberInOrg(memberId, organizationId);

  if (role.includes("sponsor")) {
    throw new Error("Cannot promote to sponsor — transfer ownership instead");
  }

  if (target.role.includes("sponsor")) {
    throw new Error("Cannot demote the sponsor — transfer ownership instead");
  }

  await db.update(member).set({ role }).where(eq(member.id, memberId));
  revalidate();
}

export async function removeInstanceMember(memberId: string) {
  const { organizationId } = await requireInstance({
    instance: ["members:write"],
  });
  const target = await memberInOrg(memberId, organizationId);

  if (target.role === "sponsor") await assertNotLastSponsor(organizationId);

  await db.delete(member).where(eq(member.id, memberId));
  revalidate();
}

// ==================== danger zone (danger:write) ====================

export async function transferInstance(newSponsorUserId: string) {
  const { organizationId, callerMemberId } = await requireInstance({
    instance: ["danger:write"],
  });

  const target = await db.query.member.findFirst({
    where: { organizationId, userId: newSponsorUserId },
  });
  if (!target) throw new Error("New sponsor must already be a member");
  if (target.id === callerMemberId)
    throw new Error("You already own this instance");

  await db.transaction(async (tx) => {
    await tx
      .update(member)
      .set({ role: "sponsor" })
      .where(eq(member.id, target.id));
    await tx
      .update(member)
      .set({ role: "admin" })
      .where(eq(member.id, callerMemberId));
  });

  // No more neon heh
  // await db.batch([
  //   db.update(member).set({ role: "sponsor" }).where(eq(member.id, target.id)),
  //   db
  //     .update(member)
  //     .set({ role: "admin" })
  //     .where(eq(member.id, callerMemberId)),
  // ]);

  revalidate();
}
export async function deleteInstance() {
  const { organizationId } = await requireInstance({
    instance: ["danger:write"],
  });
  // Cascades to instance / member / nephthys_host / nephthys_key / jelly_host
  // via FKs.
  await db.delete(organization).where(eq(organization.id, organizationId));
  // Nothing left to be active in.
  await auth.api.setActiveOrganization({
    headers: await headers(),
    body: { organizationId: null },
  });
  revalidate();
}

// ==================== helpers ====================

async function instanceIdFor(organizationId: string) {
  const org = await db.query.organization.findFirst({
    where: { id: organizationId },
    with: { instance: true },
  });
  if (!org?.instance) throw new Error("Instance not found");
  return org.instance.id;
}

// Guarantees the member row belongs to the caller's org — otherwise a sponsor
// could pass a memberId from someone else's instance.
async function memberInOrg(memberId: string, organizationId: string) {
  const m = await db.query.member.findFirst({ where: { id: memberId } });
  if (!m || m.organizationId !== organizationId) {
    throw new Error("Member not found in this instance");
  }
  return m;
}

async function assertNotLastSponsor(organizationId: string) {
  const sponsors = await db.query.member.findMany({
    where: { organizationId, role: "sponsor" },
    columns: { id: true },
  });
  if (sponsors.length <= 1) {
    throw new Error("Transfer ownership first — an instance needs a sponsor");
  }
}
