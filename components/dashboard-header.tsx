"use client";

import { ArrowUpRight } from "lucide-react";
import { use, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { greet, SlackChannelLink } from "@/lib/utils";
import { PageHeader } from "./text-types";
import { Button } from "./ui/button";

export default function DashboardHeader({
  description,
  params,
}: {
  description: React.ReactNode;
  params: Promise<{ host: string }>;
}) {
  const { data: session } = authClient.useSession();
  const { host: selectedHost } = use(params);
  const [greeting, setGreeting] = useState<string>("Hey there!");

  useEffect(() => {
    setGreeting(greet(session?.user?.name));
  }, [session]);

  function OpenSlackChannel(channelId: string | null) {
    if (!channelId) return console.error("Channel ID is null?");

    const channelLink = SlackChannelLink(
      channelId,
      session?.preferences?.isSlackDeeplinkingEnabled,
    );

    if (session?.preferences?.isSlackDeeplinkingEnabled) {
      window.location.href = channelLink;
    } else {
      window.open(channelLink, "_blank");
    }
  }

  return (
    <PageHeader title={greeting} breadcrumb={selectedHost} justifyBetween>
      {description}
      <div className="flex flex-row gap-2">
        <Button size="lg" variant="outline" disabled>
          OPEN JELLY
        </Button>
        <Button
          size="lg"
          variant="default"
          onClick={() => OpenSlackChannel("")}
          disabled
        >
          OPEN CHANNEL
          <ArrowUpRight size={16} />
        </Button>
      </div>
    </PageHeader>
  );
}
