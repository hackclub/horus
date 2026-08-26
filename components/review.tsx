"use client";

import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { cn, relativeTime, SlackMessageLink } from "@/lib/utils";
import type { ErrorResponse } from "@/types/error";
import type { Ticket } from "@/types/nephthys";
import { Avatar, AvatarImage } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";

function GetRelativeTimeSince(rawDate: string) {
  const date = new Date(rawDate);
  const delta = Math.round((Date.now() - +date) / 1000);
  return relativeTime(delta);
}

export function TicketSection({
  tickets,
  slackChannel,
}: {
  tickets: Ticket[] | ErrorResponse;
  slackChannel: string;
}) {
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [selectedTicket, setSelectedTicket] = useState(1);
  const { data: session } = authClient.useSession();

  useEffect(() => {
    const keydownHandler = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedTicket((prev) => Math.max(1, prev - 1));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if ("error" in tickets) return;
        setSelectedTicket((prev) => Math.min(tickets.length, prev + 1));
      } else if (e.key === "Enter") {
        if ("error" in tickets) return;
        console.log("opening thread");
        e.preventDefault();
        SlackMessageLink(
          slackChannel,
          tickets[selectedTicket - 1]?.message_ts,
          session?.preferences?.isSlackDeeplinkingEnabled,
        );
      }
    };

    window.addEventListener("keydown", keydownHandler);

    return () => {
      window.removeEventListener("keydown", keydownHandler);
    };
  }, [
    tickets,
    selectedTicket,
    session?.preferences?.isSlackDeeplinkingEnabled,
    slackChannel,
  ]);

  useEffect(() => {
    cardRefs.current[selectedTicket - 1]?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [selectedTicket]);

  if ("error" in tickets) {
    return null;
  }

  return (
    <div className="relative h-[60vh] overflow-y-auto overflow-x-hidden overscroll-contain py-[30vh] px-1 scrollbar-none &::-webkit-scrollbar:hidden [mask-image:linear-gradient(to_bottom,transparent,#000_18%,#000_82%,transparent)]">
      <div className="space-y-4">
        {tickets.map((ticket, index) => (
          <TicketCard
            key={ticket.id}
            ref={(element) => {
              cardRefs.current[index] = element;
            }}
            ticket={ticket}
            selected={selectedTicket === index + 1}
            distance={Math.abs(selectedTicket - 1 - index)}
            onClick={() => setSelectedTicket(index + 1)}
          />
        ))}
      </div>
    </div>
  );
}

function TicketCard({
  ref,
  ticket,
  selected,
  distance,
  onClick,
}: {
  ref?: React.Ref<HTMLDivElement>;
  ticket: Ticket;
  selected?: boolean;
  distance: number;
  onClick: () => void;
}) {
  return (
    <Card
      ref={ref}
      className={cn(
        "relative grid grid-cols-10 border-2 transition-all duration-200 cursor-pointer",
        selected && "border-primary scale-100",
        distance === 1 && "opacity-55 scale-98",
        distance >= 2 && "opacity-25 scale-96",
      )}
      onClick={onClick}
    >
      <div className="px-4 col-span-8">
        <h1 className="text-[15px]">{ticket.title}</h1>
        <p className={cn(!selected && "line-clamp-2")}>
          "i dont have ts data yet :(((("
        </p>
      </div>

      <Badge
        className="absolute top-0 right-0 text-[14px] p-3 rounded-bl-sm"
        variant={"destructive"}
      >
        {GetRelativeTimeSince(ticket.created_at)}
      </Badge>

      <div className="flex flex-row justify-center items-center gap-2 p-2 absolute bottom-0 right-0 bg-primary/20 rounded-tl-sm">
        <p>{ticket.opened_by?.username}</p>
        <Avatar size="sm">
          <AvatarImage
            src={`https://cachet.hackclub.com/users/${ticket.opened_by?.slack_id}/r`}
          />
        </Avatar>
      </div>
    </Card>
  );
}
