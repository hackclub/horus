"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { AiStreamLine, AiTicketTask } from "@/types/ai";

export type AiTicketState = {
  status: "idle" | "loading" | "streaming" | "done" | "error";
  text: string;
  truncated: boolean;
  error: string | null;
};

const IDLE: AiTicketState = {
  status: "idle",
  text: "",
  truncated: false,
  error: null,
};

// One entry per ticket and task, for this tab only. Requests live here rather
// than in a component, so switching Summary/Reply or closing the peek doesn't
// throw away an answer that's already being paid for, and reopening a ticket
// shows it again. Never persisted: it's derived from Slack message content.
type Entry = {
  state: AiTicketState;
  controller: AbortController | null;
  listeners: Set<() => void>;
};

const entries = new Map<string, Entry>();

function entryFor(key: string): Entry {
  let entry = entries.get(key);
  if (!entry) {
    entry = { state: IDLE, controller: null, listeners: new Set() };
    entries.set(key, entry);
  }
  return entry;
}

function update(key: string, state: AiTicketState) {
  const entry = entryFor(key);
  entry.state = state;
  for (const listener of entry.listeners) listener();
}

async function stream(
  key: string,
  body: { slug: string; ticketId: number; task: AiTicketTask; notes?: string },
) {
  const entry = entryFor(key);
  entry.controller?.abort();
  const controller = new AbortController();
  entry.controller = controller;
  update(key, { ...IDLE, status: "loading" });

  let text = "";
  let truncated = false;
  try {
    const response = await fetch("/api/ai/ticket", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.message || `Request failed (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const raw = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        if (!raw) continue;

        const line = JSON.parse(raw) as AiStreamLine;
        if (line.type === "text") {
          text += line.text;
          update(key, {
            status: "streaming",
            text,
            truncated: false,
            error: null,
          });
        } else if (line.type === "done") {
          truncated = line.truncated;
        } else if (line.type === "error") {
          throw new Error(line.message);
        }
      }
    }

    text = text.trim();
    update(
      key,
      text
        ? { status: "done", text, truncated, error: null }
        : {
            status: "error",
            text,
            truncated,
            error: "The model returned an empty answer.",
          },
    );
  } catch (error) {
    if (controller.signal.aborted) {
      // Stopped by the helper (or superseded by a newer run of this key).
      if (entry.controller === controller) {
        update(
          key,
          text ? { status: "done", text, truncated: true, error: null } : IDLE,
        );
      }
      return;
    }
    update(key, {
      status: "error",
      text,
      truncated,
      error: error instanceof Error ? error.message : "Something broke.",
    });
  } finally {
    if (entry.controller === controller) entry.controller = null;
  }
}

/** Streams POST /api/ai/ticket for one ticket and task. */
export function useAiTicket(
  slug: string,
  ticketId: number,
  task: AiTicketTask,
) {
  const key = `${slug}:${ticketId}:${task}`;

  const subscribe = useCallback(
    (listener: () => void) => {
      const entry = entryFor(key);
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
      };
    },
    [key],
  );
  const state = useSyncExternalStore(
    subscribe,
    () => entryFor(key).state,
    () => IDLE,
  );

  const run = useCallback(
    (notes?: string) => stream(key, { slug, ticketId, task, notes }),
    [key, slug, ticketId, task],
  );
  const stop = useCallback(() => entryFor(key).controller?.abort(), [key]);

  return { ...state, run, stop };
}
