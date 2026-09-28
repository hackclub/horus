"use client";

import {
  ArrowUpRight,
  Check,
  Copy,
  KeyRound,
  Loader,
  RotateCcw,
  Sparkles,
  Square,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { authClient } from "@/lib/auth-client";
import { openPreferences } from "@/lib/preferences-events";
import { ticketDisplayTitle, ticketStatus } from "@/lib/tickets";
import { useAiTicket } from "@/lib/use-ai-ticket";
import { cn, OpenSlackLink, relativeTime, SlackMessageLink } from "@/lib/utils";
import type { TicketAccess } from "@/lib/viewer";
import type { AiTicketTask } from "@/types/ai";
import type { Ticket } from "@/types/nephthys";
import { SlackText } from "./slack-text";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Textarea } from "./ui/textarea";

/** What the server knows about the viewer on this instance. */
export type PeekViewer = {
  slug: string;
  instanceName: string;
  slackChannel: string;
  access: TicketAccess;
  aiEnabled: boolean;
};

type PeekContextValue = {
  viewer: PeekViewer;
  open: (ticket: Ticket) => void;
  isOpen: boolean;
};

const PeekContext = createContext<PeekContextValue | null>(null);

/** Null outside a provider (e.g. loading skeletons), so callers can hide peek UI. */
export function useTicketPeek() {
  return useContext(PeekContext);
}

export function TicketPeekProvider({
  viewer,
  children,
}: {
  viewer: PeekViewer;
  children: React.ReactNode;
}) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback((next: Ticket) => {
    setTicket(next);
    setIsOpen(true);
  }, []);

  const value = useMemo(
    () => ({ viewer, open, isOpen }),
    [viewer, open, isOpen],
  );

  return (
    <PeekContext value={value}>
      {children}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          {ticket && <PeekBody ticket={ticket} viewer={viewer} />}
        </DialogContent>
      </Dialog>
    </PeekContext>
  );
}

function age(iso: string) {
  return relativeTime(
    Math.round((Date.now() - new Date(iso).getTime()) / 1000),
  ).replace(/\.$/, "");
}

function PeekBody({ ticket, viewer }: { ticket: Ticket; viewer: PeekViewer }) {
  const { data: session } = authClient.useSession();
  const deepLinking = session?.preferences?.isSlackDeeplinkingEnabled;
  const status = ticketStatus(ticket.status);
  const threadLink = SlackMessageLink(
    viewer.slackChannel,
    ticket.message_ts,
    deepLinking,
  );

  return (
    <>
      <DialogHeader className="pr-8">
        <div className="flex flex-row flex-wrap items-center gap-1.5 text-muted-foreground">
          <span className="font-mono">#{ticket.id}</span>
          <Badge variant={status?.variant ?? "outline"}>
            {status?.text ?? ticket.status}
          </Badge>
          {ticket.category_tag && (
            <Badge variant="outline">{ticket.category_tag}</Badge>
          )}
          {ticket.team_tags?.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
        <DialogTitle className="text-base">
          {ticketDisplayTitle(ticket)}
        </DialogTitle>
        <DialogDescription render={<div />}>
          <span className="flex flex-row flex-wrap items-center gap-x-3 gap-y-1">
            <Person user={ticket.opened_by} prefix="Opened by" />
            <span>{age(ticket.created_at)}</span>
            {ticket.assigned_to && (
              <Person user={ticket.assigned_to} prefix="Assigned to" />
            )}
          </span>
        </DialogDescription>
      </DialogHeader>

      <MessageSection ticket={ticket} viewer={viewer} signedIn={!!session} />

      {session && (
        <AiSection ticket={ticket} viewer={viewer} threadLink={threadLink} />
      )}

      <div className="flex flex-row flex-wrap justify-end gap-2 border-t pt-4">
        <Button
          size="lg"
          onClick={() => OpenSlackLink(threadLink, deepLinking)}
        >
          OPEN THREAD
          <ArrowUpRight />
        </Button>
      </div>
    </>
  );
}

function Person({
  user,
  prefix,
}: {
  user: Ticket["opened_by"];
  prefix: string;
}) {
  if (!user) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      {prefix}
      <Avatar size="sm" className="size-4">
        <AvatarImage
          src={`https://cachet.hackclub.com/users/${user.slack_id}/r`}
        />
        <AvatarFallback>{user.username?.charAt(0) ?? "?"}</AvatarFallback>
      </Avatar>
      <span className="text-foreground">{user.username ?? user.slack_id}</span>
    </span>
  );
}

function Notice({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-input/30 border p-3 flex flex-row flex-wrap items-center justify-between gap-2 text-muted-foreground">
      <p className="max-w-md">{children}</p>
      {action}
    </div>
  );
}

function MessageSection({
  ticket,
  viewer,
  signedIn,
}: {
  ticket: Ticket;
  viewer: PeekViewer;
  signedIn: boolean;
}) {
  if (ticket.description?.trim()) {
    return (
      <section aria-label="Ticket message">
        <SlackText
          text={ticket.description}
          className="text-sm leading-relaxed max-h-72 overflow-y-auto border p-3 bg-input/20"
        />
      </section>
    );
  }

  const fixKey = (label: string) => (
    <Button size="sm" variant="outline" onClick={() => openPreferences("keys")}>
      <KeyRound />
      {label}
    </Button>
  );

  if (!signedIn) {
    return (
      <Notice>
        Sign in and add your own Nephthys API key to read the message here.
      </Notice>
    );
  }
  if (viewer.access === "key-rejected") {
    return (
      <Notice action={fixKey("Replace key")}>
        {viewer.instanceName}&apos;s Nephthys stopped accepting your saved API
        key, so messages are hidden.
      </Notice>
    );
  }
  if (viewer.access === "full") {
    return (
      <Notice>
        Nephthys didn&apos;t send this ticket&apos;s message. The instance might
        need updating before it shares messages with API keys.
      </Notice>
    );
  }
  return (
    <Notice action={fixKey("Add key")}>
      Nephthys only shows the full message to people with their own API key for{" "}
      {viewer.instanceName}.
    </Notice>
  );
}

function AiSection({
  ticket,
  viewer,
  threadLink,
}: {
  ticket: Ticket;
  viewer: PeekViewer;
  threadLink: string;
}) {
  const [task, setTask] = useState<AiTicketTask>("summary");

  if (!viewer.aiEnabled) {
    return (
      <Notice
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => openPreferences("ai")}
          >
            <Sparkles />
            Set up AI
          </Button>
        }
      >
        Add your Hack Club AI key to get a summary and a reply draft for tickets
        like this one.
      </Notice>
    );
  }

  if (!ticket.description?.trim()) return null;

  return (
    <section aria-label="AI" className="flex flex-col gap-2">
      <div className="flex flex-row items-center gap-1" role="tablist">
        <Sparkles size={14} className="text-primary mr-1" />
        {(["summary", "reply"] as const).map((t) => (
          <Button
            key={t}
            size="sm"
            variant={task === t ? "secondary" : "ghost"}
            role="tab"
            aria-selected={task === t}
            onClick={() => setTask(t)}
          >
            {t === "summary" ? "Summary" : "Reply draft"}
          </Button>
        ))}
      </div>
      <AiOutput
        key={`${ticket.id}:${task}`}
        slug={viewer.slug}
        ticketId={ticket.id}
        task={task}
        threadLink={threadLink}
      />
    </section>
  );
}

function AiOutput({
  slug,
  ticketId,
  task,
  threadLink,
}: {
  slug: string;
  ticketId: number;
  task: AiTicketTask;
  threadLink: string;
}) {
  const ai = useAiTicket(slug, ticketId, task);
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState(false);
  const { data: session } = authClient.useSession();
  const busy = ai.status === "loading" || ai.status === "streaming";

  async function copy() {
    await navigator.clipboard.writeText(ai.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function copyAndOpen() {
    await copy();
    OpenSlackLink(threadLink, session?.preferences?.isSlackDeeplinkingEnabled);
  }

  return (
    <div className="flex flex-col gap-2">
      {task === "reply" && !busy && (
        <Textarea
          placeholder="Optional: what should the reply say or ask? (e.g. point them to #hackatime-help)"
          value={notes}
          maxLength={500}
          onChange={(e) => setNotes(e.target.value)}
          aria-label="Notes for the reply draft"
        />
      )}

      {ai.status === "idle" ? (
        <div>
          <Button onClick={() => ai.run(task === "reply" ? notes : undefined)}>
            <Sparkles />
            {task === "summary" ? "Summarize" : "Draft a reply"}
          </Button>
        </div>
      ) : (
        <div
          className={cn(
            "border p-3 text-sm leading-relaxed min-h-16",
            ai.status === "error" && "border-destructive/50",
          )}
          aria-live="polite"
          aria-busy={busy}
        >
          {ai.status === "loading" ? (
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Loader size={14} className="animate-spin" />
              Reading the ticket...
            </span>
          ) : (
            <p className="whitespace-pre-wrap break-words">
              {ai.text}
              {ai.status === "streaming" && (
                <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-primary animate-pulse align-middle" />
              )}
            </p>
          )}
          {ai.truncated && (
            <p className="text-muted-foreground mt-1">(cut off)</p>
          )}
          {ai.error && <p className="text-destructive mt-1">{ai.error}</p>}
        </div>
      )}

      {ai.status !== "idle" && (
        <div className="flex flex-row flex-wrap items-center gap-2">
          {busy ? (
            <Button size="sm" variant="outline" onClick={ai.stop}>
              <Square />
              Stop
            </Button>
          ) : (
            <>
              {ai.text && task === "reply" && (
                <Button size="sm" onClick={copyAndOpen}>
                  {copied ? <Check /> : <Copy />}
                  Copy and open thread
                </Button>
              )}
              {ai.text && (
                <Button size="sm" variant="outline" onClick={copy}>
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => ai.run(task === "reply" ? notes : undefined)}
              >
                <RotateCcw />
                Regenerate
              </Button>
            </>
          )}
          <span className="text-muted-foreground ml-auto">
            AI can be wrong. Check before you send.
          </span>
        </div>
      )}
    </div>
  );
}
