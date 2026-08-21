"use client";

import {
  type Grid,
  useClientDataSource,
} from "@1771technologies/lytenyte-core";
import type { CellRendererParams } from "@1771technologies/lytenyte-core/types";
import { ArrowUpRight, MailWarning } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getCachetUsers } from "@/app/actions/cachet";
import { LyteNyte } from "@/components/lytenyte-core";
import { authClient } from "@/lib/auth-client";
import useWindowDimensions from "@/lib/use-window-dimensions";
import { cn, relativeTime, SlackMessageLink } from "@/lib/utils";
import type { CachetUser } from "@/types/cachet";
import type { Ticket } from "@/types/nephthys";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger } from "./ui/select";

type Spec = Grid.GridSpec<Ticket>;

const minute = 60;
const hour = minute * 60;
const day = hour * 24;
const week = day * 7;

function OpenRandomTicket(
  tickets?: Ticket[],
  slackChannel?: string | null,
  deepLinking?: boolean,
) {
  if (!tickets || tickets.length === 0 || !slackChannel) return;
  const randomIndex = Math.floor(Math.random() * tickets.length);
  const ticketLink = SlackMessageLink(
    slackChannel,
    tickets[randomIndex].message_ts,
    deepLinking,
  );

  if (deepLinking) window.location.href = ticketLink;
  else window.open(ticketLink, "_blank");
}

function TicketTable({
  tickets,
  slackChannel,
  deepLinking,
}: {
  tickets?: Ticket[];
  slackChannel?: string | null;
  deepLinking: boolean | undefined;
}) {
  const ticketsData = useClientDataSource<Ticket>({
    data: tickets || [],
  });

  const windowSize = useWindowDimensions();

  const ticketsHeader: Grid.Column<Spec>[] = [
    {
      id: "id",
      name: "ID",
      width: 40,
      cellRenderer: IDCellRenderer,
    },
    {
      id: "title",
      name: "Title",
      width: windowSize.width > 720 ? 420 : 300,
      cellRenderer: ({ api, row }) => {
        if (!api.rowIsLeaf(row) || !row.data) return;
        return (
          <a
            href={SlackMessageLink(
              slackChannel || "N/A",
              row.data.message_ts,
              deepLinking,
            )}
            rel="noopener noreferrer"
            target={!deepLinking ? "_blank" : "_self"}
            className="text-primary underline"
          >
            {row.data.title}
          </a>
        );
      },
    },
    {
      id: "status",
      name: "Status",
      width: 125,
      cellRenderer: StatusCellRenderer,
    },
    {
      id: "opened_by",
      name: "Opened By",
      width: 250,
      cellRenderer: UserCellRenderer,
    },
    {
      id: "created_at",
      name: "Created",
      width: tickets?.length || 0 < 12 ? 163 : 150, // Fits perfect in max width (needs fix for longer lists)
      cellRenderer: DateCellRenderer,
    },
  ];

  if (windowSize.width < 720) {
    // Removes annoying data
    ticketsHeader.splice(0, 1); // Remove ID
    ticketsHeader.splice(1, 1); // Remove status
  }
  return <LyteNyte columns={ticketsHeader} rowSource={ticketsData} />;
}

export function AssignedTicketsWidget({
  tickets,
  slackId,
  slackChannel,
}: {
  tickets?: Ticket[];
  slackId?: string;
  slackChannel?: string | null;
}) {
  const [staffs, setStaffs] = useState<CachetUser[]>([]);
  const [filterBy, setFilterBy] = useState<string>(slackId || "");
  const { data: session } = authClient.useSession();
  const assignedTickets = useMemo(() => {
    if (filterBy === "") return tickets || [];
    if (!filterBy) return [];
    return tickets?.filter(
      (ticket) => ticket.assigned_to?.slack_id === filterBy,
    );
  }, [filterBy, tickets]);

  const staffIds = useMemo(() => {
    const uniqueIds = new Set<string>();
    tickets?.forEach((ticket) => {
      if (ticket.assigned_to?.slack_id) {
        uniqueIds.add(ticket.assigned_to.slack_id);
      }
    });
    return Array.from(uniqueIds);
  }, [tickets]);

  useEffect(() => {
    if (!staffIds.length) return;
    getCachetUsers(staffIds).then(setStaffs);
    if (!slackId || !staffIds.includes(slackId)) {
      setFilterBy(staffIds[0]);
    }
  }, [staffIds, slackId]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex flex-row items-center gap-1.5">
          <h1 className="text-lg">Assigned to </h1>
          <Select
            value={filterBy}
            onValueChange={(value) => setFilterBy(value || "")}
          >
            <SelectTrigger>
              {filterBy !== "" && (
                <Avatar className="size-4">
                  <AvatarImage
                    src={`https://cachet.hackclub.com/users/${filterBy}/r`}
                  />
                  <AvatarFallback>
                    {staffs
                      .find((user) => user.userId === filterBy)
                      ?.displayName?.charAt(0) || "?"}
                  </AvatarFallback>
                </Avatar>
              )}
              {staffs.find((user) => user.userId === filterBy)?.displayName ||
                "Anyone"}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Anyone</SelectItem>
              {staffs.map((user) => (
                <SelectItem key={user.userId} value={user.userId}>
                  <Avatar className="size-4">
                    <AvatarImage src={user.imageUrl} />
                    <AvatarFallback>
                      {user.displayName.charAt(0)}
                    </AvatarFallback>
                  </Avatar>{" "}
                  {user.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Badge variant="default">{assignedTickets?.length || 0} Tickets</Badge>
      </CardHeader>
      <CardContent className="h-125">
        <TicketTable
          tickets={assignedTickets}
          slackChannel={slackChannel}
          deepLinking={session?.preferences?.isSlackDeeplinkingEnabled}
        />
      </CardContent>
    </Card>
  );
}

export function UnassignedTicketsWidget({
  tickets,
  slackChannel,
}: {
  tickets?: Ticket[];
  slackChannel?: string | null;
}) {
  const { data: session } = authClient.useSession();
  const unassignedTickets =
    tickets?.filter((ticket) => !ticket.assigned_to) || [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <h1 className="text-lg">Unassigned queue</h1>
          <Button
            className={"mt-2"}
            onClick={() =>
              OpenRandomTicket(
                unassignedTickets,
                slackChannel,
                session?.preferences?.isSlackDeeplinkingEnabled,
              )
            }
            variant={"outline"}
          >
            Open random
            <ArrowUpRight />
          </Button>
        </div>
        <Badge
          variant={unassignedTickets.length > 50 ? "destructive" : "default"}
        >
          {unassignedTickets.length} Tickets
        </Badge>
      </CardHeader>
      <CardContent className="h-125">
        <TicketTable
          tickets={unassignedTickets}
          slackChannel={slackChannel}
          deepLinking={session?.preferences?.isSlackDeeplinkingEnabled}
        />
      </CardContent>
    </Card>
  );
}

function IDCellRenderer({ api, row }: CellRendererParams<Spec>) {
  if (!api.rowIsLeaf(row) || !row.data) return;

  return `#${row.data.id}`;
}

function StatusCellRenderer({ api, row }: CellRendererParams<Spec>) {
  if (!api.rowIsLeaf(row) || !row.data) return;

  const statusMap = {
    IN_PROGRESS: {
      text: "In Progress",
      variant: "default",
    },
    OPEN: {
      text: "Waiting",
      variant: "orange",
    },
    CLOSED: {
      text: "Closed",
      variant: "destructive",
    },
  } as const;

  const status = statusMap[row.data.status as keyof typeof statusMap];

  return (
    <Badge variant={status?.variant || "default"}>
      {status?.text || row.data.status}
    </Badge>
  );
}

function UserCellRenderer({ api, row }: CellRendererParams<Spec>) {
  if (!api.rowIsLeaf(row) || !row.data) return;

  return (
    <span className="flex flex-row justify-center items-center gap-2">
      <Avatar size={"sm"}>
        <AvatarImage
          src={`https://cachet.hackclub.com/users/${row.data.opened_by?.slack_id}/r`}
        />
        <AvatarFallback>
          {row.data.opened_by?.username?.charAt(0)}
        </AvatarFallback>
      </Avatar>
      {row.data.opened_by?.username}
    </span>
  );
}

function DateCellRenderer({ api, row }: CellRendererParams<Spec>) {
  if (!api.rowIsLeaf(row) || !row.data) return;

  const date = new Date(row.data.created_at);
  const delta = Math.round((Date.now() - +date) / 1000);
  const since = relativeTime(delta);

  return (
    <span
      className={cn(
        delta < 2 * day
          ? "text-primary"
          : delta > week
            ? "text-destructive"
            : "text-orange-400",
        "flex flex-row justify-center items-center gap-1",
      )}
    >
      {delta > week && <MailWarning size={16} className="text-destructive" />}
      {since}
    </span>
  );
}
