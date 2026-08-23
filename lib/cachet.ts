import type { CachetUser } from "@/types/cachet";
import { describeError } from "./errors";

const CACHET_HOST = process.env.CACHET_HOST ?? "https://cachet.hackclub.com";

/**
 * Cachet is decoration (avatar + display name), so a failure degrades instead
 * of throwing — otherwise one slow lookup takes the whole leaderboard with it.
 * It is always logged: `null` here should never be a mystery.
 */
export async function getCachetUser(
  slackId: string,
): Promise<CachetUser | null> {
  const url = `${CACHET_HOST}/users/${slackId}`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { accept: "application/json" },
      next: { revalidate: 60 * 60 * 6 },
    });

    if (!response.ok) {
      console.warn(
        `[cachet] GET ${url} returned ${response.status} ${response.statusText}`,
      );
      return null;
    }

    return (await response.json()) as CachetUser;
  } catch (error) {
    console.warn(`[cachet] GET ${url} failed: ${describeError(error)}`);
    return null;
  }
}
