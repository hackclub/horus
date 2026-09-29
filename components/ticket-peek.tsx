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
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { authClient } from "@/lib/auth-client";
import {
  KEYS_CHANGED_EVENT,
  openPreferences,
  type PreferencesTab,
} from "@/lib/preferences-events";
import { ticketDisplayTitle, ticketStatus } from "@/lib/tickets";
import { useAiSummary } from "@/lib/use-ai-summary";
import { cn, OpenSlackLink, relativeTime, SlackMessageLink } from "@/lib/utils";
import type { TicketAccess } from "@/lib/viewer";
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

/** What the server knows about the viewer on this instance. */
export type PeekViewer = {
  slug: string;
  instanceName: string;
  slackChannel: string;
  access: TicketAccess;
  /** Instance admin: may add or replace the Nephthys key in Settings. */
  canManageKey: boolean;
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

  // The peek holds a snapshot of the ticket, so after a key changes it would
  // show stale notices. Close it; reopening picks up the refreshed ticket.
  useEffect(() => {
    const close = () => setIsOpen(false);
    window.addEventListener(KEYS_CHANGED_EVENT, close);
    return () => window.removeEventListener(KEYS_CHANGED_EVENT, close);
  }, []);

  const goToPreferences = useCallback((tab: PreferencesTab) => {
    setIsOpen(false);
    openPreferences(tab);
  }, []);

  const router = useRouter();
  const goToKeySettings = useCallback(async () => {
    setIsOpen(false);
    // Settings manages the active instance, so switch to this one first.
    await authClient.organization.setActive({ organizationSlug: viewer.slug });
    router.push("/dashboard/settings#nephthys");
  }, [router, viewer.slug]);

  const value = useMemo(
    () => ({ viewer, open, isOpen }),
    [viewer, open, isOpen],
  );

  return (
    <PeekContext value={value}>
      {children}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        {/* ph-no-capture keeps message and AI text out of PostHog
            autocapture and session replay. */}
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto ph-no-capture">
          {ticket && (
            <PeekBody
              ticket={ticket}
              viewer={viewer}
              goToPreferences={goToPreferences}
              goToKeySettings={goToKeySettings}
            />
          )}
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

function PeekBody({
  ticket,
  viewer,
  goToPreferences,
  goToKeySettings,
}: {
  ticket: Ticket;
  viewer: PeekViewer;
  goToPreferences: (tab: PreferencesTab) => void;
  goToKeySettings: () => void;
}) {
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

      <MessageSection
        ticket={ticket}
        viewer={viewer}
        goToKeySettings={goToKeySettings}
      />

      {session && (
        <AiSection
          ticket={ticket}
          viewer={viewer}
          goToPreferences={goToPreferences}
        />
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
  goToKeySettings,
}: {
  ticket: Ticket;
  viewer: PeekViewer;
  goToKeySettings: () => void;
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

  const name = viewer.instanceName;
  const keyButton = (label: string) =>
    viewer.canManageKey ? (
      <Button size="sm" variant="outline" onClick={goToKeySettings}>
        <KeyRound />
        {label}
      </Button>
    ) : undefined;
  const whoFixes = viewer.canManageKey
    ? "You can fix that in Settings."
    : "An instance admin can fix that in Settings.";

  switch (viewer.access) {
    case "signed-out":
      return (
        <Notice>Sign in as a member of {name} to read the message here.</Notice>
      );
    case "not-member":
      return (
        <Notice>
          Only members of {name} can read ticket messages in Horus.
        </Notice>
      );
    case "no-key":
      return (
        <Notice action={keyButton("Add key")}>
          {name} has no Nephthys API key yet, so messages are hidden. {whoFixes}
        </Notice>
      );
    case "key-rejected":
      return (
        <Notice action={keyButton("Replace key")}>
          {name}&apos;s Nephthys key doesn&apos;t work anymore (it was deleted,
          or the instance moved hosts), so messages are hidden. {whoFixes}
        </Notice>
      );
    case "unavailable":
      return (
        <Notice>
          Nephthys didn&apos;t answer the request with the instance key just
          now, so messages are hidden. Refresh to try again.
        </Notice>
      );
    case "full":
      return (
        <Notice>
          Nephthys didn&apos;t send this ticket&apos;s message. The instance
          might need updating before it shares messages with API keys.
        </Notice>
      );
  }
}

function AiSection({
  ticket,
  viewer,
  goToPreferences,
}: {
  ticket: Ticket;
  viewer: PeekViewer;
  goToPreferences: (tab: PreferencesTab) => void;
}) {
  if (!viewer.aiEnabled) {
    return (
      <Notice
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => goToPreferences("ai")}
          >
            <Sparkles />
            Set up AI
          </Button>
        }
      >
        Add your Hack Club AI key to get a quick summary of tickets like this
        one.
      </Notice>
    );
  }

  if (!ticket.description?.trim()) return null;

  return (
    <section aria-label="AI summary" className="flex flex-col gap-2">
      <AiSummary key={ticket.id} slug={viewer.slug} ticketId={ticket.id} />
    </section>
  );
}

function AiSummary({ slug, ticketId }: { slug: string; ticketId: number }) {
  const ai = useAiSummary(slug, ticketId);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const busy = ai.status === "loading" || ai.status === "streaming";

  function copy() {
    navigator.clipboard.writeText(ai.text).then(
      () => {
        setCopyState("copied");
        setTimeout(() => setCopyState("idle"), 1500);
      },
      () => setCopyState("failed"),
    );
  }

  const status =
    ai.status === "loading"
      ? "Summarizing..."
      : ai.status === "done"
        ? "Summary ready."
        : ai.status === "error"
          ? (ai.error ?? "Something broke.")
          : "";

  if (ai.status === "idle") {
    return (
      <div>
        <Button onClick={() => ai.run()}>
          <Sparkles />
          Summarize
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="sr-only" aria-live="polite">
        {status}
      </span>

      <div
        className={cn(
          "border p-3 text-sm leading-relaxed min-h-16",
          ai.status === "error" && "border-destructive/50",
        )}
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
              <span
                className="inline-block w-1.5 h-3.5 ml-0.5 bg-muted-foreground align-middle"
                aria-hidden
              />
            )}
          </p>
        )}
        {ai.truncated && (
          <p className="text-muted-foreground mt-1">(cut off)</p>
        )}
        {ai.error && <p className="text-destructive mt-1">{ai.error}</p>}
      </div>

      <div className="flex flex-row flex-wrap items-center gap-2">
        {busy ? (
          <Button size="sm" variant="outline" onClick={ai.stop}>
            <Square />
            Stop
          </Button>
        ) : (
          <>
            {ai.text && (
              <Button size="sm" variant="outline" onClick={copy}>
                {copyState === "copied" ? <Check /> : <Copy />}
                {copyState === "copied" ? "Copied" : "Copy"}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => ai.run()}>
              <RotateCcw />
              Regenerate
            </Button>
          </>
        )}
        <span className="text-muted-foreground ml-auto">
          {copyState === "failed"
            ? "Couldn't copy. Select the text and copy it yourself."
            : "AI can be wrong, so check it against the message."}
        </span>
      </div>
    </div>
  );
}
