import type {
  CachetEnrichedStats,
  Stats,
  Ticket,
  TicketTTR,
  TimeDurations,
} from "@/types/nephthys";
import { getCachetUser } from "./cachet";
import { UpstreamError } from "./errors";

type FetchOptions = {
  revalidate?: number;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const BODY_SNIPPET_LIMIT = 300;

/** Best-effort peek at an error response body, so a 4xx/5xx says why. */
async function readBodySnippet(response: Response): Promise<string> {
  try {
    const text = (await response.text()).trim();
    if (!text) return "";
    return text.length > BODY_SNIPPET_LIMIT
      ? ` - body: ${text.slice(0, BODY_SNIPPET_LIMIT)}...`
      : ` - body: ${text}`;
  } catch {
    return "";
  }
}

export type NephthysTicketFilter = {
  status?: string;
  since?: string;
  after?: string;
  until?: string;
  before?: string;
};

export async function fetchNephthys<T>(
  path: string,
  host: string | null,
  options: FetchOptions = {},
): Promise<T> {
  if (!host) {
    throw new Error(`Missing required parameter: host (for ${path})`);
  }

  const url = `https://${host}${path}`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let response: Response;

  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json" },
      next: { revalidate: options.revalidate ?? 10 },
    });
  } catch (error) {
    // AbortSignal.timeout rejects with a TimeoutError; anything else out of
    // fetch() is a TypeError whose real reason (ENOTFOUND, ECONNREFUSED, TLS
    // failure, …) is only reachable through `cause`.
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");

    throw new UpstreamError(
      timedOut ? "timeout" : "network",
      url,
      timedOut
        ? `GET ${url} timed out after ${timeoutMs}ms`
        : `GET ${url} could not be reached`,
      { cause: error },
    );
  }

  if (!response.ok) {
    throw new UpstreamError(
      "http",
      url,
      `GET ${url} returned ${[response.status, response.statusText].join(" ").trim()}${await readBodySnippet(response)}`,
      { status: response.status },
    );
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new UpstreamError(
      "parse",
      url,
      `GET ${url} returned a body that is not valid JSON`,
      { cause: error },
    );
  }
}

export async function getStats(
  host: string | null,
): Promise<CachetEnrichedStats> {
  if (!host) {
    throw new Error("Missing required parameter: host");
  }

  const rawStats = await fetchNephthys<Stats>("/api/stats_v2", host, {
    revalidate: 10,
  });

  const enrichedStats = {
    ...rawStats,
    all_time: {
      ...rawStats.all_time,
      helpers_leaderboard: await Promise.all(
        rawStats.all_time.helpers_leaderboard.map(async (helper) => {
          const cachetUser = await getCachetUser(helper.slack_id);
          return {
            ...helper,
            imageUrl: cachetUser?.imageUrl,
            displayName: cachetUser?.displayName,
          };
        }),
      ),
    },
  };

  return enrichedStats as CachetEnrichedStats;
}

export async function getTickets(
  host: string,
  filter?: NephthysTicketFilter,
  skipCache = false,
): Promise<Ticket[]> {
  if (!host) {
    throw new Error("Missing required parameter: host");
  }

  const params = new URLSearchParams();
  if (filter) {
    Object.entries(filter).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
  }
  if (!params.has("status")) params.set("status", "open");
  if (
    params.get("status") === "closed" &&
    !params.has("since") &&
    !params.has("after") &&
    !params.has("until") &&
    !params.has("before")
  ) {
    params.set("since", daysAgoIsoDate(30));
  }

  if (params.get("status")?.includes(",")) {
    const statuses = params.get("status")?.split(",") || [];

    const results = await Promise.all(
      statuses.map((status) => {
        const statusParams = new URLSearchParams(params);
        statusParams.set("status", status);
        return fetchNephthys<Ticket[]>(`/api/tickets?${statusParams}`, host, {
          revalidate: skipCache ? 0 : 5,
        });
      }),
    );

    return results.flat() as Ticket[];
  }

  const results = await fetchNephthys<Ticket[]>(
    `/api/tickets?${params}`,
    host,
    {
      revalidate: skipCache ? 0 : 5,
    },
  );

  return results;
}

// TODO: this really needs its own function in nephthys api
export async function getTicketsTTR(host: string) {
  if (!host) {
    throw new Error("Missing required parameter: host");
  }

  const params = new URLSearchParams();
  params.set("status", "closed");
  params.set("since", daysAgoIsoDate(365)); // last 365 days

  const results = await fetchNephthys<Ticket[]>(
    `/api/tickets?${params}`,
    host,
    {
      revalidate: 300,
    },
  );

  const chartData: { name: TimeDurations; value: number; fill: string }[] = [
    { name: "5 Minutes", value: 0, fill: "var(--color-primary)" },
    { name: "1 Hour", value: 0, fill: "var(--color-primary)" },
    { name: "12 Hours", value: 0, fill: "var(--color-primary)" },
    { name: "24 Hours", value: 0, fill: "var(--color-orange-400)" },
    { name: "4 Days", value: 0, fill: "var(--color-orange-400)" },
    { name: "7 Days", value: 0, fill: "var(--color-destructive)" },
    { name: "More", value: 0, fill: "var(--color-destructive)" },
  ];

  //Calculate the age of each closed ticket and update the chart data
  results.forEach((ticket) => {
    if (!ticket.closed_at || !ticket.created_at) return;
    const ageInMinutes =
      (new Date(ticket.closed_at).getTime() -
        new Date(ticket.created_at).getTime()) /
      (1000 * 60);

    if (ageInMinutes <= 5) {
      chartData[0].value++;
    } else if (ageInMinutes <= 60) {
      chartData[1].value++;
    } else if (ageInMinutes <= 720) {
      chartData[2].value++;
    } else if (ageInMinutes <= 1440) {
      chartData[3].value++;
    } else if (ageInMinutes <= 5760) {
      chartData[4].value++;
    } else if (ageInMinutes <= 10080) {
      chartData[5].value++;
    } else {
      chartData[6].value++;
    }
  });
  return chartData as TicketTTR;
}

export function daysAgoIsoDate(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
