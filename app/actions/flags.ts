"use server";

import { marmaladeFlag, streakFlag } from "@/lib/flags";

export async function getMarmaladeFlagEnabled(): Promise<boolean> {
  const marmalade = (await marmaladeFlag()) as boolean;
  return marmalade;
}

export async function getStreakFlagEnabled(): Promise<boolean> {
  const streak = (await streakFlag()) as boolean;
  return streak;
}
