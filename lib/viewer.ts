import { db } from "@/db";
import type { ErrorResponse } from "@/types/error";
import type { Ticket } from "@/types/nephthys";
import { toErrorResponse } from "./errors";
import {
  getTickets,
  isInvalidApiKeyError,
  type NephthysTicketFilter,
} from "./nephthys";
import { getNephthysKey } from "./user-keys";

export type InstanceRef = {
  instanceId: string;
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
    name: org.instance.name || org.name,
    slug: org.slug,
    host: org.instance.nephthys_host.host,
    slackChannel: org.instance.nephthys_host.slackChannel,
  };
}

/**
 * - `public`: fetched anonymously, no message content.
 * - `full`: fetched with the viewer's own key; tickets carry `description`
 *   unless the Nephthys instance predates API keys.
 * - `key-rejected`: the viewer has a key saved but Nephthys refused it
 *   (deleted in the lobby?), so we fell back to the public view.
 */
export type TicketAccess = "public" | "full" | "key-rejected";

/**
 * Tickets as this viewer is allowed to see them. Message content only comes
 * back for a signed-in user who saved their own key for this instance, and is
 * fetched uncached so it never lands in a cache another viewer could hit.
 */
export async function loadViewerTickets(
  instance: InstanceRef,
  userId: string | null | undefined,
  filter?: NephthysTicketFilter,
): Promise<ErrorResponse | { tickets: Ticket[]; access: TicketAccess }> {
  const context = `nephthys tickets (${instance.host})`;
  const apiKey = userId
    ? await getNephthysKey(userId, instance.instanceId)
    : null;

  let access: TicketAccess = "public";
  if (apiKey) {
    try {
      const tickets = await getTickets(instance.host, filter, false, apiKey);
      return { tickets, access: "full" };
    } catch (error) {
      if (!isInvalidApiKeyError(error)) return toErrorResponse(context, error);
      access = "key-rejected";
    }
  }

  try {
    const tickets = await getTickets(instance.host, filter);
    return { tickets, access };
  } catch (error) {
    return toErrorResponse(context, error);
  }
}
