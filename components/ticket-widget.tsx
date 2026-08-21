"use client";

import {
  ArrowUpRight,
  Check,
  Loader,
  MessageCircleWarning,
} from "lucide-react";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { caughtUpText, cn, SlackMessageLink } from "@/lib/utils";
import type { Ticket } from "@/types/nephthys";
import { Button } from "./ui/button";
import { Card, CardAction, CardContent, CardHeader } from "./ui/card";

type TicketWidgetTypes = "oldest" | "checkup";

interface TicketWidgetProps {
  ticket?: Ticket | null;
  ticketWidgetType: TicketWidgetTypes;
  slackChannel?: string | null;
  isLoading?: boolean;
  ticketAgeMinutes?: number | null;
  ticketThreadLink?: string | null;
}

const TicketWidgetData: Record<TicketWidgetTypes, { title: string }> = {
  oldest: {
    title: "Oldest Unanswered",
  },
  checkup: {
    title: "Ticket Check Up",
  },
};

export function TicketWidget({
  ticket,
  ticketWidgetType,
  slackChannel,
  isLoading = false,
  ticketAgeMinutes,
  ticketThreadLink,
}: TicketWidgetProps) {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const loading = isLoading || sessionPending;
  const threadTimestamp =
    ticket?.message_ts || ticketThreadLink?.split?.("/p")?.[1] || null;

  function getTicketAge() {
    return ticketAgeMinutes
      ? ticketAgeMinutes / 60 / 24
      : (Date.now() - new Date(ticket?.created_at || "").getTime()) /
          (1000 * 60 * 60 * 24);
  }

  const [caughtUp] = useState<string | null>(() =>
    isLoading ? "Loading..." : caughtUpText(),
  );
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function openTicket() {
    if (threadTimestamp && slackChannel) {
      const msgLink = SlackMessageLink(
        slackChannel,
        threadTimestamp,
        session?.preferences?.isSlackDeeplinkingEnabled,
      );

      if (session?.preferences?.isSlackDeeplinkingEnabled) {
        window.location.href = msgLink;
      } else {
        window.open(msgLink, "_blank");
      }
    } else {
      console.error("Unable to open ticket: missing channel or ticket data");
    }
  }

  if (!mounted) {
    return (
      <Card className="min-h-72">
        <CardHeader>
          <h1 className="text-lg">
            {TicketWidgetData[ticketWidgetType].title}
          </h1>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 justify-center my-auto">
          <div
            className={cn(
              "rounded-full size-12 flex items-center justify-center",
              "bg-orange-400/30 text-orange-400",
            )}
          >
            <Loader className="animate-spin" />
          </div>
          <h1 className="font-medium text-card-foreground text-lg">
            Loading...
          </h1>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="min-h-72">
      <CardHeader>
        <h1 className="text-lg">{TicketWidgetData[ticketWidgetType].title}</h1>
      </CardHeader>
      {ticket?.id ? (
        <>
          <CardContent className="flex flex-col items-left gap-2">
            <h1
              className={cn(
                "text-4xl font-bold",
                (getTicketAge() || 0) > 6 ? "text-destructive" : "text-primary",
              )}
            >
              {(getTicketAge() || 0).toFixed(1)}d
            </h1>
            <p className="text-muted-foreground">
              slow response · #{ticket?.id}
            </p>
            <p className="text-lg">{ticket?.title}</p>
          </CardContent>
          <CardAction className="w-full px-4 mt-auto">
            <Button onClick={openTicket} className="w-full text-md" size="lg">
              VIEW TICKET
              <ArrowUpRight size={16} />
            </Button>
          </CardAction>
        </>
      ) : (
        <CardContent className="flex flex-col items-center gap-4 justify-center my-auto">
          <div
            className={cn(
              "rounded-full size-12 flex items-center justify-center",
              loading
                ? "bg-orange-400/30 text-orange-400"
                : !session?.user && ticketWidgetType === "checkup"
                  ? "bg-destructive/30 text-destructive"
                  : "bg-primary/30 text-primary",
            )}
          >
            {loading ? (
              <Loader className="animate-spin" />
            ) : !session?.user && ticketWidgetType === "checkup" ? (
              <MessageCircleWarning size={28} />
            ) : (
              <Check size={36} />
            )}
          </div>
          <h1 className="font-medium text-card-foreground text-lg">
            {loading
              ? "Loading..."
              : !session?.user && ticketWidgetType === "checkup"
                ? "Sign in to see this"
                : caughtUp}
          </h1>
        </CardContent>
      )}
    </Card>
  );
}
