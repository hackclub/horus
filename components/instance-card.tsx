"use client";

import { ChevronRight } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { updatePreferences } from "@/app/actions/preferences";
import { toast } from "@/components/ui/toast";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

export function InstanceCard({
  name,
  slug,
  stats,
  imageUrl,
  deprecated = false,
}: {
  name: string;
  slug: string;
  stats: {
    open: number;
    resolved: number;
    inProgress: number;
  };
  imageUrl?: string | null;
  deprecated?: boolean;
}) {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);

  async function handleSelectHost() {
    await updatePreferences({
      defaultHost: slug,
    });
    const changeOrg = await authClient.organization.setActive({
      organizationSlug: slug,
    });

    if (changeOrg.error) {
      if (changeOrg.error.status !== 403)
        toast.add({
          title: "Error",
          description: "Failed to change active organization",
        });
    }
    router.push(`/dashboard/${slug}`);
  }

  function handleMouseEnter() {
    setIsHovered(true);
  }

  function handleMouseLeave() {
    setIsHovered(false);
  }

  function DeprecatedBadgeText() {
    return <div className="text-lg font-bold text-orange-400">DEPRECATED</div>;
  }

  return (
    <Card
      key={slug}
      onClick={() => handleSelectHost()}
      className={cn(
        "cursor-pointer border-2 p-0",
        deprecated ? "border-orange-400" : "",
      )}
    >
      <CardContent className="p-0 h-full">
        <button
          type="button"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className={cn(
            "relative overflow-hidden cursor-pointer aspect-video w-full h-full",
          )}
        >
          {imageUrl && (
            <Image
              src={imageUrl}
              alt={`${name} banner`}
              loading="eager"
              className="absolute top-0 left-0 object-cover"
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          )}
          {deprecated && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <div className="text-lg font-bold text-orange-400">
                    DEPRECATED
                  </div>
                } // Perfect spacing idk
                className="absolute top-0 right-0 bg-card rounded-bl-md flex items-center justify-center px-2 py-1"
              >
                <div className="absolute top-0 right-0 bg-card rounded-bl-md flex items-center justify-center px-2 py-1">
                  <DeprecatedBadgeText />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                This instance is deprecated and can be removed at any time.
              </TooltipContent>
            </Tooltip>
          )}
          <div
            className={cn(
              imageUrl
                ? "absolute bottom-0 left-0 w-full h-36 bg-linear-to-t from-card dark:from-black to-transparent p-4 flex flex-col"
                : "w-full h-full p-4 flex flex-col",
            )}
          >
            <div className="flex flex-col gap-2 mt-auto text-left">
              <h3 className="text-lg font-bold">{name}</h3>
              <div className="flex flex-row justify-between">
                <div className="flex flex-row gap-4 text-sm text-muted-foreground">
                  <div className="flex flex-col text-left">
                    <p className="text-xl font-bold text-destructive">
                      {stats.open}
                    </p>
                    <p className="text-xs text-muted-foreground">OPEN</p>
                  </div>
                  <div className="flex flex-col text-left">
                    <p className="text-xl font-bold text-orange-400">
                      {stats.inProgress}
                    </p>
                    <p className="text-xs tracking-tight text-muted-foreground">
                      IN PROGRESS
                    </p>
                  </div>
                  <div className="flex flex-col text-left">
                    <p className="text-xl font-bold text-primary">
                      {stats.resolved}
                    </p>
                    <p className="text-xs text-muted-foreground">RESOLVED</p>
                  </div>
                </div>
                <ChevronRight
                  className={cn(
                    "absolute right-4 bottom-4 text-muted-foreground transition-all duration-300 ease-in-out",
                    isHovered &&
                      `translate-x-1 ${deprecated ? "text-orange-400" : "text-primary"}`,
                  )}
                />
              </div>
            </div>
          </div>
        </button>
      </CardContent>
    </Card>
  );
}

export function InstanceCardLogin() {
  const { data: session, isPending } = authClient.useSession();

  function handleLogin() {
    authClient.signIn.oauth2({
      providerId: "hack-club",
    });
  }

  if (session?.user || isPending) return null;

  return (
    <Card className="bg-transparent border-dashed border-2 ring-0 border-primary/60">
      <CardContent className="p-4 justify-center items-center flex flex-col gap-4 h-full px-12 font-semibold text-muted-foreground">
        <button className="h-full" type="button" onClick={handleLogin}>
          Login to see other instances you might have access to&nbsp;→
        </button>
      </CardContent>
    </Card>
  );
}

export function InstanceCardSkeleton() {
  return <Skeleton className="aspect-video w-full rounded-md" />;
}
