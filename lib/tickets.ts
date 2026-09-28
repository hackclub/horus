import type { Ticket } from "@/types/nephthys";

/** Nephthys' placeholder when its AI couldn't title a ticket. */
export const UNTITLED_TICKET = "No title provided by AI.";

const TITLE_FROM_DESCRIPTION_LIMIT = 90;

/**
 * What to call a ticket in the UI. Nephthys suggests falling back to the
 * description (if we have it) or the ID when its AI had no title.
 */
export function ticketDisplayTitle(
  ticket: Pick<Ticket, "id" | "title" | "description">,
): string {
  const title = ticket.title?.trim();
  if (title && title !== UNTITLED_TICKET) return title;

  const description = ticket.description
    ? slackToPlainText(ticket.description).replace(/\s+/g, " ").trim()
    : "";
  if (description) {
    return description.length > TITLE_FROM_DESCRIPTION_LIMIT
      ? `${description.slice(0, TITLE_FROM_DESCRIPTION_LIMIT).trimEnd()}…`
      : description;
  }

  return `Ticket #${ticket.id}`;
}

/** Strip Slack mrkdwn control sequences so text reads cleanly on one line. */
export function slackToPlainText(text: string): string {
  return (
    text
      .replace(/<#[A-Z0-9]+\|([^<>]+)>/g, "#$1")
      .replace(/<@[A-Z0-9]+\|([^<>]+)>/g, "@$1")
      .replace(/<[^<>|]+\|([^<>]+)>/g, "$1")
      .replace(/<@([A-Z0-9]+)>/g, "@$1")
      .replace(/<#([A-Z0-9]+)>/g, "#$1")
      .replace(/<!(here|channel|everyone)>/g, "@$1")
      .replace(/<([^<>]+)>/g, "$1")
      // *bold*, _italic_, ~strike~ and `code` markers
      .replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, "$1")
      .replace(/(?<![\w_])_([^_\n]+)_(?![\w_])/g, "$1")
      .replace(/(?<![\w~])~([^~\n]+)~(?![\w~])/g, "$1")
      .replace(/`{1,3}/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
  );
}

/**
 * Ticket status vocabulary from DESIGN.md's three-state rule: red is
 * waiting, orange is in progress, emerald is resolved.
 */
export const TICKET_STATUS = {
  OPEN: { text: "Waiting", variant: "destructive" },
  IN_PROGRESS: { text: "In Progress", variant: "orange" },
  CLOSED: { text: "Closed", variant: "default" },
} as const;

export function ticketStatus(status: string) {
  return TICKET_STATUS[status as keyof typeof TICKET_STATUS] ?? null;
}

/** Case-insensitive match against what a helper would search a queue by. */
export function ticketMatches(ticket: Ticket, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const id = q.replace(/^#/, "");
  if (/^\d+$/.test(id) && String(ticket.id).startsWith(id)) return true;
  return [
    ticket.title,
    ticket.description,
    ticket.opened_by?.username,
    ticket.assigned_to?.username,
    ticket.category_tag,
    ...(ticket.team_tags ?? []),
  ].some((field) => field?.toLowerCase().includes(q));
}

export function ticketAgeMs(ticket: Pick<Ticket, "created_at">): number {
  return Date.now() - new Date(ticket.created_at).getTime();
}
