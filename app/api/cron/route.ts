import { headers } from "next/headers";
import { GetInstances } from "@/app/actions/instance";
import { describeError, isErrorResponse } from "@/lib/errors";
import { getStats } from "@/lib/nephthys";
import { redis } from "@/lib/redis";
import type { RedisInstanceStats } from "@/types/instances";

/**
  test command:
  curl -X POST http://localhost:3000/api/cron -H "cron-secret: TEST_CRON_SECRET"
 */

type InstanceFailure = {
  instance: string;
  reason: string;
};

// update instance stats
export async function POST() {
  const headersData = await headers();

  if (!process.env.CRON_SECRET) {
    return new Response("CRON isnt setup", { status: 500 });
  }

  if (headersData.get("cron-secret") !== `${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const instances = await GetInstances();
  if (isErrorResponse(instances)) {
    console.error("[cron] failed to fetch instances", instances);
    return new Response(
      `Failed to fetch instances: ${instances.error} - ${instances.message ?? "no detail"}`,
      { status: 500 },
    );
  }

  // Start from what is already stored: an instance that fails this run keeps
  // its last known numbers instead of silently dropping to 0 on the dashboard.
  const previousStats = await readPreviousStats();
  const instanceStats: RedisInstanceStats = { ...previousStats };
  const failures: InstanceFailure[] = [];

  for (const instance of instances) {
    const label = instance?.name ?? instance?.instanceId ?? "unknown instance";

    if (!instance || !instance.instanceId || !instance.nephthysHostname) {
      failures.push({
        instance: label,
        reason: "missing instanceId or nephthys host",
      });
      continue;
    }

    try {
      const stats = await getStats(instance.nephthysHostname);

      if (
        typeof stats.all_time.tickets_in_progress !== "number" ||
        typeof stats.all_time.tickets_open !== "number" ||
        typeof stats.all_time.tickets_closed !== "number"
      ) {
        failures.push({
          instance: label,
          reason: `unexpected stats payload: ${JSON.stringify(stats.all_time)}`,
        });
        continue;
      }

      // why did i use postgres for this bradar
      instanceStats[instance.instanceId] = {
        openTickets: stats.all_time.tickets_open,
        inProgressTickets: stats.all_time.tickets_in_progress,
        resolvedTickets: stats.all_time.tickets_closed,
      };
    } catch (error) {
      // One unreachable instance must not abort the other fourteen.
      console.error(`[cron] ${label} stats failed`, error);
      failures.push({ instance: label, reason: describeError(error) });
    }
  }

  try {
    // no expiration, cuz we want this to persist until the next cron job runs
    await redis.set("instanceStats", JSON.stringify(instanceStats));
  } catch (error) {
    console.error("[cron] saving instance stats to Redis failed", error);
    return new Response(
      `Failed to save instance stats to Redis: ${describeError(error)}`,
      { status: 500 },
    );
  }

  if (failures.length > 0) {
    console.error(
      `[cron] ${failures.length}/${instances.length} instances failed`,
      failures,
    );
  }

  const succeeded = instances.length - failures.length;
  const status =
    failures.length === 0
      ? 200
      : succeeded === 0 && instances.length > 0
        ? 500
        : 207;

  return Response.json(
    {
      ok: failures.length === 0,
      instances: instances.length,
      succeeded,
      failed: failures.length,
      failures,
    },
    { status },
  );
}

async function readPreviousStats(): Promise<RedisInstanceStats> {
  try {
    const stored = await redis.get("instanceStats");
    // hopes and prayers right here
    if (stored && typeof stored === "object")
      return stored as RedisInstanceStats;
    return {};
  } catch (error) {
    console.warn(
      `[cron] could not read previous instance stats: ${describeError(error)}`,
    );
    return {};
  }
}

export async function GET() {
  return new Response("Method not allowed", { status: 405 });
}
