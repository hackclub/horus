"use server";

import { headers } from "next/headers";
import { db } from "@/db";
import { user_preferences } from "@/db/schemas/auth-schema";
import { auth } from "@/lib/auth";

export async function updatePreferences(input: {
  defaultHost?: string;
  isOptedOutTracking?: boolean;
  isSlackDeeplinkingEnabled?: boolean;
  lowTrafficHosts?: string[];
}) {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session) return { error: "Unauthorized" };

  const preferences = {
    defaultHost: input.defaultHost,
    isOptedOutTracking: input.isOptedOutTracking,
    isSlackDeeplinkingEnabled: input.isSlackDeeplinkingEnabled,
    lowTrafficHosts: input.lowTrafficHosts,
  };

  await db
    .insert(user_preferences)
    .values({
      ...preferences,
      userId: session.user.id,
    })
    .onConflictDoUpdate({
      target: user_preferences.userId,
      set: preferences,
    });

  // The default host also picks which instance the Settings page manages:
  // point the active org at the host's org, but only if the user is a member.
  if (input.defaultHost !== undefined) {
    await syncActiveOrg(session.user.id, input.defaultHost, h);
  }

  return { success: true };
}

async function syncActiveOrg(userId: string, defaultHost: string, h: Headers) {
  const host = await db.query.nephthys_host.findFirst({
    where: { host: defaultHost },
    with: { instance: true },
  });
  const organizationId = host?.instance?.organizationId ?? null;

  const isMember =
    organizationId != null &&
    !!(await db.query.member.findFirst({
      where: { organizationId, userId },
    }));

  await auth.api.setActiveOrganization({
    headers: h,
    body: { organizationId: isMember ? organizationId : null },
  });
}
