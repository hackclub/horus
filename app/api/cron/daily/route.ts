import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { fetchNephthysTickets } from "@/app/actions/nephthys";
import { db } from "@/db";
import { user_streak_data } from "@/db/schemas/auth-schema";
import { isErrorResponse } from "@/lib/errors";
import { daysAgoIsoDate } from "@/lib/nephthys";

/**
  test command:
  curl -X POST http://localhost:3000/api/cron/daily -H "cron-secret: TEST_CRON_SECRET"
 */

// intial idea
// okay so this is one person
// only log days with tickets closed
// U123786123: {
//    "2026-08-23": 3
//    "2026-08-25": 1
// }

// at the beginning, make an empty table for each person and start from scratch

// 1. fetch all tickets of all instances
// 2. sort out all tickets that are still open/in_progress or have noone assigned
// 3. sort through all closed tickets and for each ticket use assigned_to
//    slack ID to find the correct place in the variable at the top
//    then use the closed_at to find which day to add that ticket credit to
// 4. pray

const MIN_TICKETS_PER_DAY = 5;
const DAY_MS = 86_400_000;

const utcDay = (isoDate: string) => Date.parse(`${isoDate}T00:00:00Z`);

interface ClosedTicketsData {
  [key: string]: {
    [key: string]: number;
  };
}

type InstanceFailure = {
  instance: string;
  reason: string;
};

// codex might be good its just not CC ;)
// TODO: streaks should optimally break at midnight their timezone but like uhh then
// i need to fight timezones, now its like just always the same
function summariseStreak(dayData: Record<string, number>, today: string) {
  const activeDays = Object.entries(dayData)
    .filter(([, count]) => count >= MIN_TICKETS_PER_DAY)
    .map(([day]) => day)
    .sort();

  if (activeDays.length === 0)
    return {
      currentStreak: 0,
      longestStreak: 0,
    };

  let longestStreak = 1;
  let run = 1;

  for (let i = 1; i < activeDays.length; i++) {
    const gap = (utcDay(activeDays[i]) - utcDay(activeDays[i - 1])) / DAY_MS;
    run = gap === 1 ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
  }

  const daysSinceActive =
    (utcDay(today) - utcDay(activeDays[activeDays.length - 1])) / DAY_MS;

  return {
    currentStreak: daysSinceActive <= 1 ? run : 0,
    longestStreak,
  };
}

export async function POST() {
  const headersData = await headers();

  if (!process.env.CRON_SECRET) {
    return new NextResponse("CRON isnt setup", { status: 500 });
  }

  if (headersData.get("cron-secret") !== `${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const lastClosedAt: Record<string, string> = {};
  const closedTicketsData: ClosedTicketsData = {};
  const failures: InstanceFailure[] = [];
  let succeeded = 0;
  let ticketsCounted = 0;

  const instances = await db.query.instance.findMany({
    with: { organization: true, nephthys_host: true },
  });

  await Promise.all(
    instances.map(async (instance) => {
      const label = instance.organization?.slug ?? instance.name ?? instance.id;
      const host = instance.nephthys_host?.host;

      if (!host) {
        failures.push({
          instance: label,
          reason: "no nephthys host configured",
        });
        return;
      }

      const tickets = await fetchNephthysTickets(host, {
        // TODO: modify nephthys to just give me what i need instead of ts bs
        since: daysAgoIsoDate(365), // if this needs extending, lets remake nephthys bro
        status: "closed",
      });

      if (isErrorResponse(tickets)) {
        failures.push({
          instance: label,
          reason: tickets.message ?? tickets.error,
        });
        return;
      }

      const validTickets = tickets.filter(
        (ticket) => ticket.assigned_to?.slack_id && ticket.closed_at,
      );

      console.log(
        `[cron/daily] ${label}: ${tickets.length} tickets, ${validTickets.length} countable`,
      );

      validTickets.forEach((ticket) => {
        const slackId = ticket.assigned_to?.slack_id;
        const date = ticket.closed_at?.split("T")[0];
        if (!slackId || !date || !ticket.closed_at) return;

        closedTicketsData[slackId] ??= {};
        closedTicketsData[slackId][date] =
          (closedTicketsData[slackId][date] ?? 0) + 1;
        ticketsCounted++;

        if (!lastClosedAt[slackId] || ticket.closed_at > lastClosedAt[slackId])
          lastClosedAt[slackId] = ticket.closed_at;
      });

      succeeded++;
    }),
  );

  console.log(JSON.stringify(closedTicketsData));

  // actually save the shits
  const summaries = Object.entries(closedTicketsData).map(
    ([slackId, dayData]) => ({
      slackId,
      dayData,
      ...summariseStreak(dayData, daysAgoIsoDate(0)),
    }),
  );

  const users = await db.query.user.findMany({
    columns: { id: true, slack_id: true },
    where: { slack_id: { in: summaries.map((s) => s.slackId) } },
  });

  const userIdBySlackId = new Map(
    users.map((user) => [user.slack_id, user.id]),
  );

  const rows = summaries.flatMap((summary) => {
    const userId = userIdBySlackId.get(summary.slackId);
    if (!userId) return [];
    return [
      {
        userId,
        currentStreak: summary.currentStreak,
        longestStreak: summary.longestStreak,
        lastActiveAt: new Date(lastClosedAt[summary.slackId]),
        data: JSON.stringify(summary.dayData),
      },
    ];
  });

  if (rows.length > 0) {
    await db
      .insert(user_streak_data)
      .values(rows)
      .onConflictDoUpdate({
        target: user_streak_data.userId,
        set: {
          currentStreak: sql`excluded.current_streak`,
          longestStreak: sql`greatest(user_streak_data.longest_streak, excluded.longest_streak)`,
          lastActiveAt: sql`excluded.last_active_at`,
          data: sql`excluded.data`,
        },
      });
  }

  if (failures.length > 0) {
    console.error(
      `[cron/daily] ${failures.length}/${instances.length} instances failed`,
      failures,
    );
  }

  // 200 all good, 207 some instances are missing from the totals, 500 nothing
  // got through. Never report success for a run that silently lost instances.
  const status =
    failures.length === 0
      ? 200
      : succeeded === 0 && instances.length > 0
        ? 500
        : 207;

  return NextResponse.json(
    {
      ok: failures.length === 0,
      instances: instances.length,
      succeeded,
      failed: failures.length,
      ticketsCounted,
      failures,
    },
    { status },
  );
}

export async function GET() {
  return new NextResponse("Method not allowed", { status: 405 });
}

// its 3:44 AM
