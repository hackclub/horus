"use client";

import { MessageSquareWarningIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { OpenSlackLink, SlackChannelLink } from "@/lib/utils";

export function SiteBanner() {
  const { data: session, isPending } = authClient.useSession();
  return (
    <div className="bg-primary text-primary-foreground">
      <div className="items-center justify-center px-4 py-2 flex flex-row gap-2">
        <MessageSquareWarningIcon size={18} />
        <p className="text-center text-sm">
          Is your instance missing? Reach out and have it added!{" "}
          <button
            type="button"
            className="underline hover:underline cursor-pointer"
            disabled={isPending}
            onClick={() =>
              OpenSlackLink(
                SlackChannelLink(
                  "C0BN1CB4NCC",
                  session?.preferences?.isSlackDeeplinkingEnabled,
                ),
                session?.preferences?.isSlackDeeplinkingEnabled,
              )
            }
          >
            #horus
          </button>
        </p>
      </div>
    </div>
  );
}
