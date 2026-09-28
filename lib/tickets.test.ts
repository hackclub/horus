import { describe, expect, test } from "bun:test";
import type { Ticket } from "@/types/nephthys";
import {
  slackToPlainText,
  ticketDisplayTitle,
  ticketMatches,
  UNTITLED_TICKET,
} from "./tickets";

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 42,
    title: "Hackatime isn't tracking my time",
    status: "OPEN",
    opened_by: { id: 1, slack_id: "U01", username: "orpheus" },
    closed_by: null,
    assigned_to: null,
    reopened_by: null,
    team_tags: ["hackatime"],
    category_tag: "bug",
    created_at: new Date().toISOString(),
    closed_at: null,
    message_ts: "1775942657.605349",
    ...overrides,
  };
}

describe("slackToPlainText", () => {
  test("unwraps links, mentions and channels", () => {
    expect(
      slackToPlainText(
        "see <https://example.com|the docs> and <https://x.dev>, ping <@U0123ABC> in <#C0456|help>",
      ),
    ).toBe("see the docs and https://x.dev, ping @U0123ABC in #help");
  });

  test("decodes entities after unwrapping", () => {
    expect(slackToPlainText("a &lt;b&gt; &amp; <!here>")).toBe("a <b> & @here");
  });
});

describe("ticketDisplayTitle", () => {
  test("uses the AI title when there is one", () => {
    expect(ticketDisplayTitle(ticket())).toBe(
      "Hackatime isn't tracking my time",
    );
  });

  test("falls back to the description for Nephthys' placeholder", () => {
    expect(
      ticketDisplayTitle(
        ticket({
          title: UNTITLED_TICKET,
          description: "my  <@U1> project\nbroke",
        }),
      ),
    ).toBe("my @U1 project broke");
  });

  test("truncates long descriptions", () => {
    const title = ticketDisplayTitle(
      ticket({ title: null, description: "word ".repeat(100) }),
    );
    expect(title.length).toBeLessThanOrEqual(91);
    expect(title.endsWith("…")).toBe(true);
  });

  test("falls back to the id without a description", () => {
    expect(ticketDisplayTitle(ticket({ title: UNTITLED_TICKET }))).toBe(
      "Ticket #42",
    );
  });
});

describe("ticketMatches", () => {
  test("matches title, description, people and tags case-insensitively", () => {
    const t = ticket({ description: "Error: ENOENT when running wakatime" });
    expect(ticketMatches(t, "HACKATIME")).toBe(true);
    expect(ticketMatches(t, "enoent")).toBe(true);
    expect(ticketMatches(t, "orph")).toBe(true);
    expect(ticketMatches(t, "bug")).toBe(true);
    expect(ticketMatches(t, "payout")).toBe(false);
  });

  test("matches ids with or without #", () => {
    expect(ticketMatches(ticket(), "#4")).toBe(true);
    expect(ticketMatches(ticket(), "42")).toBe(true);
    expect(ticketMatches(ticket(), "43")).toBe(false);
  });

  test("empty query matches everything", () => {
    expect(ticketMatches(ticket(), "  ")).toBe(true);
  });
});
