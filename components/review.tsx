"use client";

import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { cn, OpenSlackLink, relativeTime, SlackMessageLink } from "@/lib/utils";
import type { ErrorResponse } from "@/types/error";
import type { Ticket } from "@/types/nephthys";
import { Avatar, AvatarImage } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";

//? claudes plan
const WINDOW = 4;
const SLOTS = WINDOW * 2 + 1;

const CARD_H = 120;
const ROW_GAP = 16;
const ROW_H = CARD_H + ROW_GAP;

const WHEEL_STEP = 50;

const DEPTH_SCALE = [1, 0.98, 0.96, 0.95];
const DEPTH_OPACITY = [1, 0.55, 0.25, 0];
const HIDDEN_DEPTH = DEPTH_OPACITY.length - 1;

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));

/** Which ticket each fixed slot shows, or null where the window runs off the list. */
export function ticketSlots(selected: number, count: number) {
  const start = Math.max(0, selected - WINDOW);
  const end = Math.min(count - 1, selected + WINDOW);
  return Array.from({ length: SLOTS }, (_, slot) => {
    const index = start + ((((slot - start) % SLOTS) + SLOTS) % SLOTS);
    return index <= end ? index : null;
  });
}

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [rawSelected, setSelected] = useState(0);
  const { data: session } = authClient.useSession();

  const list = "error" in tickets ? [] : tickets;
  const max = list.length - 1;
  const selected = clamp(rawSelected, max);
  const deeplink = session?.preferences?.isSlackDeeplinkingEnabled;

  useEffect(() => {
    const keydownHandler = (e: KeyboardEvent) => {
      if (!list.length) return;

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((prev) => clamp(prev - 1, max));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((prev) => clamp(prev + 1, max));
      } else if (e.key === "Enter") {
        e.preventDefault();
        OpenSlackLink(
          SlackMessageLink(slackChannel, list[selected]?.message_ts, deeplink),
          deeplink,
        );
      }
    };

    window.addEventListener("keydown", keydownHandler);

    return () => {
      window.removeEventListener("keydown", keydownHandler);
    };
  }, [list, max, selected, slackChannel, deeplink]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    let accumulated = 0;
    const wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      accumulated += e.deltaY;
      const steps = Math.trunc(accumulated / WHEEL_STEP);
      if (!steps) return;
      accumulated -= steps * WHEEL_STEP;
      setSelected((prev) => clamp(prev + steps, max));
    };

    element.addEventListener("wheel", wheelHandler, { passive: false });

    return () => {
      element.removeEventListener("wheel", wheelHandler);
    };
  }, [max]);

  if ("error" in tickets) {
    return null;
  }

  const slots = ticketSlots(selected, list.length);

  return (
    <div
      ref={containerRef}
      className="relative h-[60vh] overflow-hidden px-1 mask-[linear-gradient(to_bottom,transparent,#000_18%,#000_82%,transparent)]"
    >
      {slots.map((index, slot) =>
        index === null ? null : (
          <TicketCard
            // biome-ignore lint/suspicious/noArrayIndexKey: slot is the identity
            key={slot}
            ticket={list[index]}
            offset={index - selected}
            onClick={() => setSelected(index)}
          />
        ),
      )}
    </div>
  );
}

function TicketCard({
  ticket,
  offset,
  onClick,
}: {
  ticket: Ticket;
  offset: number;
  onClick: () => void;
}) {
  const depth = Math.min(Math.abs(offset), HIDDEN_DEPTH);
  const selected = offset === 0;

  return (
    <Card
      style={{
        height: CARD_H,
        opacity: DEPTH_OPACITY[depth],
        transform: `translate3d(0, ${offset * ROW_H - CARD_H / 2}px, 0) scale(${DEPTH_SCALE[depth]})`,
      }}
      className={cn(
        "absolute inset-x-1 top-1/2 grid grid-cols-10 border-2 cursor-pointer",
        "transition-[transform,opacity,border-color] duration-150 ease-out motion-reduce:transition-none",
        selected && "border-primary",
        depth === HIDDEN_DEPTH && "pointer-events-none",
      )}
      aria-hidden={depth === HIDDEN_DEPTH}
      onClick={onClick}
    >
      <div className="px-4 col-span-8">
        <h1 className="text-[15px]">{ticket.title}</h1>
        <p className={cn(selected ? "line-clamp-3" : "line-clamp-2")}>
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
