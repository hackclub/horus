"use client";

import { Suspense, useEffect, useState } from "react";
import ErrorFallback from "@/app/error-boundary";
import DashboardHeader from "@/components/dashboard-header";
import Navbar from "@/components/navbar";
import { PageWrapper } from "@/components/page-template";
import { PageDescription, PageHeader } from "@/components/text-types";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

export default function ReviewPage() {
  const [selectedTicket, setSelectedTicket] = useState(1);

  useEffect(() => {
    const keydownHandler = (e) => {
      if (e.key === "ArrowUp") {
        setSelectedTicket((prev) => Math.max(1, prev - 1));
      } else if (e.key === "ArrowDown") {
        setSelectedTicket((prev) => Math.min(3, prev + 1));
      }
    };

    window.addEventListener("keydown", keydownHandler);

    return () => {
      window.removeEventListener("keydown", keydownHandler);
    };
  }, []);

  return (
    <>
      <Navbar />
      <ErrorFallback title={"ERR"}>
        <PageWrapper variant="tight">
          <PageHeader title="What needs help next" breadcrumb="REVIEW">
            <PageDescription>Flip through tickets</PageDescription>
          </PageHeader>
          <Suspense>
            <div className="space-y-4">
              <TicketCard
                selected={selectedTicket === 1}
                onClick={() => setSelectedTicket(1)}
              />
              <TicketCard
                selected={selectedTicket === 2}
                onClick={() => setSelectedTicket(2)}
              />
              <TicketCard
                selected={selectedTicket === 3}
                onClick={() => setSelectedTicket(3)}
              />
            </div>
            <div className="w-full border-2 my-8" />
            <div className="flex flex-row gap-2">
              <KeybindGroup>
                <Keybind btn="↑" />
                <Keybind btn="↓" name="Go back/Next" />
              </KeybindGroup>
              <KeybindGroup>
                <Keybind btn="↵" name="Open thread" />
              </KeybindGroup>
              <KeybindGroup>
                <Keybind btn="R" name="Refresh" />
              </KeybindGroup>
            </div>
          </Suspense>
        </PageWrapper>
      </ErrorFallback>
    </>
  );
}

function KeybindGroup({ children }: { children: React.ReactNode }) {
  return <div className="px-2 flex flex-row gap-1">{children}</div>;
}

function Keybind({ btn, name }: { btn: string; name?: string }) {
  return (
    <div className="text-sm text-muted-foreground text-mono">
      <Kbd className={name && "mr-1"}>{btn}</Kbd> {name}
    </div>
  );
}

function TicketCard({
  selected,
  onClick,
}: {
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      className={cn(
        "relative grid grid-cols-10 border-2 transition-all duration-200",
        selected && "border-primary scale-102",
      )}
      onClick={onClick}
    >
      <div className="px-4 col-span-8">
        <h1 className="text-[15px]">Something something ticket title here</h1>
        <p>
          Hi, I designed a software at NASA to catalog parts that took me a full
          34 hours (or at least that's what hackatime tracked), and I forgot to
          add devlogs. Now I'm finished, ready to ship, and I found out that
          only 10 of those 34 ho...
        </p>
      </div>

      <Badge
        className="absolute top-0 right-0 text-[14px] p-3 rounded-bl-sm"
        variant={"destructive"}
      >
        67d 68m
      </Badge>

      <div className="flex flex-row justify-center items-center gap-2 p-2 absolute bottom-0 right-0 bg-primary/20 rounded-tl-sm">
        <p>Lazyllama</p>
        <Avatar size="sm">
          <AvatarImage src="https://cachet.hackclub.com/users/U09SMLCPXM3/r" />
        </Avatar>
      </div>
    </Card>
  );
}
