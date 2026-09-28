"use client";

import { ArrowUpRight, Eye, Loader, RotateCcw, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { ticketDisplayTitle } from "@/lib/tickets";
import { OpenSlackLink, SlackMessageLink } from "@/lib/utils";
import type { QueueBriefResponse } from "@/types/ai";
import type { Ticket } from "@/types/nephthys";
import { useTicketPeek } from "./ticket-peek";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader } from "./ui/card";

// Kept per instance for this tab only, so switching pages doesn't lose it.
const lastBrief = new Map<string, QueueBriefResponse>();

const URGENCY = {
  high: "Urgent",
  medium: "Soon",
  low: "Can wait",
} as const;

export function QueueBriefWidget({
  slug,
  slackChannel,
  tickets,
}: {
  slug: string;
  slackChannel: string;
  tickets: Ticket[];
}) {
  const [result, setResult] = useState<QueueBriefResponse | null>(
    () => lastBrief.get(slug) ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const peek = useTicketPeek();
  const { data: session } = authClient.useSession();
  const deepLinking = session?.preferences?.isSlackDeeplinkingEnabled;

  const byId = useMemo(
    () => new Map(tickets.map((ticket) => [ticket.id, ticket])),
    [tickets],
  );

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/ai/brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.brief) {
        throw new Error(body?.message || `Request failed (${response.status})`);
      }
      lastBrief.set(slug, body);
      setResult(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something broke.");
    } finally {
      setLoading(false);
    }
  }

  const brief = result?.brief;
  const pick = brief?.pickNext ? byId.get(brief.pickNext.ticketId) : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <h1 className="text-lg flex flex-row items-center gap-2">
            <Sparkles size={16} className="text-primary" />
            Queue brief
          </h1>
          <p className="text-muted-foreground font-sans">
            What the unassigned queue is about, and what to grab first.
          </p>
        </div>
        <Button
          variant={result ? "outline" : "default"}
          onClick={run}
          disabled={loading}
        >
          {loading ? (
            <Loader className="animate-spin" />
          ) : result ? (
            <RotateCcw />
          ) : (
            <Sparkles />
          )}
          {loading ? "Reading the queue..." : result ? "Refresh" : "Brief me"}
        </Button>
      </CardHeader>

      {(brief || error) && (
        <CardContent className="flex flex-col gap-4">
          {error && <p className="text-destructive">{error}</p>}

          {brief && (
            <>
              {brief.overview && (
                <p className="text-sm max-w-3xl">{brief.overview}</p>
              )}

              {brief.pickNext && (
                <div className="bg-primary/10 p-3 flex flex-row flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex flex-col gap-0.5">
                    <p className="text-xs font-medium tracking-widest text-primary">
                      PICK NEXT · #{brief.pickNext.ticketId}
                    </p>
                    {pick && (
                      <p className="text-sm font-bold truncate">
                        {ticketDisplayTitle(pick)}
                      </p>
                    )}
                    <p className="text-muted-foreground">
                      {brief.pickNext.reason}
                    </p>
                  </div>
                  {pick && (
                    <div className="flex flex-row gap-2">
                      {peek && (
                        <Button
                          variant="outline"
                          onClick={() => peek.open(pick)}
                        >
                          <Eye />
                          Peek
                        </Button>
                      )}
                      <Button
                        onClick={() =>
                          OpenSlackLink(
                            SlackMessageLink(
                              slackChannel,
                              pick.message_ts,
                              deepLinking,
                            ),
                            deepLinking,
                          )
                        }
                      >
                        Open thread
                        <ArrowUpRight />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {brief.groups.length > 0 && (
                <ul className="grid md:grid-cols-2 gap-3">
                  {brief.groups.map((group) => (
                    <li
                      key={`${group.label}-${group.ticketIds[0]}`}
                      className="border p-3 flex flex-col gap-2"
                    >
                      <div className="flex flex-row items-center justify-between gap-2">
                        <p className="font-bold text-sm">{group.label}</p>
                        <Badge variant="outline">
                          {URGENCY[group.urgency]} · {group.ticketIds.length}
                        </Badge>
                      </div>
                      {group.summary && (
                        <p className="text-muted-foreground">{group.summary}</p>
                      )}
                      <div className="flex flex-row flex-wrap gap-1">
                        {group.ticketIds.map((id) => (
                          <TicketChip
                            key={id}
                            id={id}
                            ticket={byId.get(id)}
                            onPeek={peek?.open}
                          />
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {result && (
                <p className="text-muted-foreground">
                  Read {result.analysed} of {result.queueSize} tickets
                  {result.usedMessages ? " with their messages" : " by title"}
                  {result.model ? ` using ${result.model}` : ""} at{" "}
                  {new Date(result.generatedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  . AI can be wrong, so double check before acting on it.
                </p>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function TicketChip({
  id,
  ticket,
  onPeek,
}: {
  id: number;
  ticket?: Ticket;
  onPeek?: (ticket: Ticket) => void;
}) {
  if (!ticket || !onPeek) {
    return (
      <Badge variant="outline" className="font-mono">
        #{id}
      </Badge>
    );
  }
  return (
    <Button
      size="xs"
      variant="outline"
      className="font-mono"
      onClick={() => onPeek(ticket)}
      title={ticketDisplayTitle(ticket)}
    >
      #{id}
    </Button>
  );
}
