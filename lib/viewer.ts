import "server-only";
import { db } from "@/db";
import type { ErrorResponse } from "@/types/error";
import type { Ticket } from "@/types/nephthys";
import { authorizeInstanceRole } from "./auth-permissions";
import { describeError, toErrorResponse } from "./errors";
import {
  getTickets,
  isInvalidApiKeyError,
  type NephthysTicketFilter,
} from "./nephthys";
import { getInstanceNephthysKey, type SavedNephthysKey } from "./user-keys";

export type InstanceRef = {
  instanceId: string;
  organizationId: string;
  name: string;
  slug: string;
  host: string;
  slackChannel: string;
};

export async function getInstanceBySlug(
  slug: string,
): Promise<InstanceRef | null> {
  const org = await db.query.organization.findFirst({
    where: { slug: slug.toLocaleLowerCase() },
    with: { instance: { with: { nephthys_host: true } } },
  });

  if (!org?.instance?.nephthys_host) return null;

  return {
    instanceId: org.instance.id,
    organizationId: org.id,
    name: org.instance.name || org.name,
    slug: org.slug,
    host: org.instance.nephthys_host.host,
    slackChannel: org.instance.nephthys_host.slackChannel,
  };
}

/**
 * Whether ticket messages come with the tickets, and if not, why:
 * - `full`: fetched with the instance's key; tickets carry `description`
 *   unless the Nephthys instance predates API keys.
 * - `signed-out` / `not-member`: messages are only for signed-in members of
 *   the instance. Dashboards are public, and the Slack scraping policy says
 *   message content must never be publicly accessible.
 * - `no-key`: no instance admin has added a Nephthys key yet.
 * - `key-rejected`: Nephthys refused the saved key (deleted in the lobby?) or
 *   the instance moved to another host since it was saved.
 * - `unavailable`: the request with the key failed for another reason (a
 *   Nephthys hiccup), so we fell back to the public list for now.
 */
export type TicketAccess =
  | "full"
  | "signed-out"
  | "not-member"
  | "no-key"
  | "key-rejected"
  | "unavailable";

export type ViewerKey = {
  /** Why there are no messages, if the key below can't be used. */
  access: Exclude<TicketAccess, "full" | "unavailable">;
  key: Extract<SavedNephthysKey, { status: "ok" }> | null;
  /** May add or replace the instance's Nephthys key in Settings. */
  canManageKey: boolean;
};

/**
 * The instance's Nephthys key, if this viewer may have message text read
 * with it: only signed-in members of the instance.
 */
export async function resolveViewerKey(
  instance: InstanceRef,
  userId: string | null | undefined,
): Promise<ViewerKey> {
  if (!userId) return { access: "signed-out", key: null, canManageKey: false };

  const membership = await db.query.member.findFirst({
    where: { organizationId: instance.organizationId, userId },
    columns: { role: true },
  });
  if (!membership) {
    return { access: "not-member", key: null, canManageKey: false };
  }

  const canManageKey = authorizeInstanceRole(membership.role, {
    instance: ["general:write"],
  });
  const saved = await getInstanceNephthysKey(instance);
  return {
    access: saved.status === "host-changed" ? "key-rejected" : "no-key",
    key: saved.status === "ok" ? saved : null,
    canManageKey,
  };
}

/**
 * Tickets as this viewer is allowed to see them. Message content only comes
 * back for signed-in members of the instance when it has a key, and is
 * fetched uncached so it never lands in a cache another viewer could hit.
 */
export async function loadViewerTickets(
  instance: InstanceRef,
  userId: string | null | undefined,
  filter?: NephthysTicketFilter,
): Promise<
  | ErrorResponse
  | { tickets: Ticket[]; access: TicketAccess; canManageKey: boolean }
> {
  const context = `nephthys tickets (${instance.host})`;
  const viewer = await resolveViewerKey(instance, userId);

  let access: TicketAccess = viewer.access;
  if (viewer.key) {
    try {
      const tickets = await getTickets(
        instance.host,
        filter,
        false,
        viewer.key.apiKey,
      );
      return { tickets, access: "full", canManageKey: viewer.canManageKey };
    } catch (error) {
      if (isInvalidApiKeyError(error)) {
        access = "key-rejected";
      } else {
        // Keyed requests are uncached, so a blip would otherwise take the
        // whole page down for exactly the people who can read messages.
        console.error(`[${context} with key] ${describeError(error)}`);
        access = "unavailable";
      }
    }
  }

  try {
    const tickets = await getTickets(instance.host, filter);
    return { tickets, access, canManageKey: viewer.canManageKey };
  } catch (error) {
    return toErrorResponse(context, error);
  }
}
