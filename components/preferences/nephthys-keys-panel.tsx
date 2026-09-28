"use client";

import { KeyRound, MoveUpRight, SaveIcon, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  deleteNephthysApiKey,
  getMyNephthysKeys,
  type NephthysKeyEntry,
  setNephthysApiKey,
} from "@/app/actions/keys";
import { LinkHref } from "@/components/text-types";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { isErrorResponse } from "@/lib/errors";
import { KEYS_CHANGED_EVENT } from "@/lib/preferences-events";
import { cn } from "@/lib/utils";

const SCRAPING_POLICY_URL =
  "https://news.hackclub.com/news/scraping-use-policy/";

export function NephthysKeysPanel() {
  const router = useRouter();
  const [entries, setEntries] = useState<NephthysKeyEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await getMyNephthysKeys();
    if (isErrorResponse(result)) {
      setLoadError(result.message || result.error);
      return;
    }
    setLoadError(null);
    setEntries(result);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function changed() {
    load();
    // Server components refetch tickets with (or without) message text.
    router.refresh();
    window.dispatchEvent(new Event(KEYS_CHANGED_EVENT));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p>
          Nephthys only shares the full ticket message with people who have
          their own API key. Keys are per instance: make one in that
          instance&apos;s lobby, paste it here, and Horus shows you the message
          text and lets AI read it.
        </p>
        <p>
          Keys are stored encrypted and only unlock things for you. Message text
          falls under the{" "}
          <LinkHref href={SCRAPING_POLICY_URL}>
            Slack Scraping Use Policy
          </LinkHref>
          , so don&apos;t copy it anywhere public.
        </p>
      </div>

      {loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : entries === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No instances have a Nephthys host yet.
        </p>
      ) : (
        <ul className="flex flex-col border divide-y max-h-[45vh] overflow-y-auto">
          {entries.map((entry) => (
            <KeyRow key={entry.instanceId} entry={entry} onChanged={changed} />
          ))}
        </ul>
      )}
    </div>
  );
}

function KeyRow({
  entry,
  onChanged,
}: {
  entry: NephthysKeyEntry;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const lobbyUrl = `https://${entry.host}/lobby/api_keys`;
  const inputId = `nephthys-key-${entry.instanceId}`;

  async function save() {
    setBusy(true);
    const result = await setNephthysApiKey(entry.instanceId, value);
    setBusy(false);

    if (isErrorResponse(result)) {
      toast.add({
        title: "Key not saved",
        description: result.message || result.error,
        type: "error",
      });
      return;
    }

    setValue("");
    setEditing(false);
    toast.add({
      title: `Connected to ${entry.name}`,
      description:
        result.descriptions === false
          ? "The key works, but this Nephthys didn't send message text. It may need updating before you'll see messages."
          : "You'll now see ticket messages for this instance.",
      type: result.descriptions === false ? "warning" : "success",
    });
    onChanged();
  }

  async function remove() {
    setBusy(true);
    const result = await deleteNephthysApiKey(entry.instanceId);
    setBusy(false);
    if (isErrorResponse(result)) {
      toast.add({
        title: "Couldn't remove key",
        description: result.message || result.error,
        type: "error",
      });
      return;
    }
    toast.add({ title: `Removed your ${entry.name} key`, type: "success" });
    onChanged();
  }

  return (
    <li className="flex flex-col gap-2 p-3">
      <div className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col min-w-0">
          <p className="font-bold text-sm truncate">
            {entry.name}
            {entry.deprecated && (
              <span className="font-normal text-muted-foreground">
                {" "}
                · deprecated
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground truncate">{entry.host}</p>
        </div>
        <div className="flex flex-row items-center gap-1">
          {entry.hostChanged ? (
            <Badge
              variant="outline"
              title="This instance moved to a different Nephthys host after you saved the key, so it isn't used. Add a key from the new host."
            >
              Host changed, add again
            </Badge>
          ) : entry.keyHint ? (
            <Badge variant="default" title="Connected">
              <KeyRound />
              <span className="font-mono">{entry.keyHint}</span>
            </Badge>
          ) : (
            <Badge variant="outline">Not connected</Badge>
          )}
          <a
            href={lobbyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "link", size: "sm" })}
          >
            Get key
            <MoveUpRight />
          </a>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditing((v) => !v)}
            disabled={busy}
            aria-expanded={editing}
            aria-controls={inputId}
          >
            {entry.keyHint ? "Replace" : "Add"}
          </Button>
          {entry.keyHint && (
            <Button
              size="icon-sm"
              variant="destructive"
              onClick={remove}
              disabled={busy}
              aria-label={`Remove ${entry.name} key`}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>

      <form
        className={cn("flex-row gap-2", editing ? "flex" : "hidden")}
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) save();
        }}
      >
        <Input
          id={inputId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk_neph_..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
          aria-label={`Nephthys API key for ${entry.name}`}
        />
        <Button type="submit" disabled={busy || !value.trim()}>
          {busy ? "Checking..." : "Save"}
          <SaveIcon size={10} />
        </Button>
      </form>
    </li>
  );
}
