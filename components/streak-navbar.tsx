"use client";

import { FlameIcon } from "lucide-react";
import { useFeatureFlagEnabled } from "posthog-js/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export function StreakNavbar({ streakValue }: { streakValue: number }) {
  const streakEnabled = useFeatureFlagEnabled("streak", false);
  if (!streakEnabled) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button type="button">
            <div className=" bg-orange-500/10 size-11 flex flex-row justify-center items-center p-1 pr-1 gap-0.5 border border-orange-400/30 aspect-square">
              <FlameIcon className=" text-orange-400" />
            </div>
          </button>
        }
      />
      <DropdownMenuContent className="min-w-64">
        <div className="p-3">
          <h1>Streak</h1>
          {/* <div className="py-3">
            <Progress value={streakValue} max={100}>
              <ProgressLabel>{streakValue || 0}</ProgressLabel>
            </Progress>
          </div> */}
          <p className="text-xs text-muted-foreground">
            You have a {streakValue} day streak running. To keep it running,
            close at least 5 tickets each day on any program you are
            participating in.
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
