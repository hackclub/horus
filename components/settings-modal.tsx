"use client";

import {
  InfoIcon,
  LockKeyhole,
  MailWarning,
  MoveUpRight,
  SaveIcon,
  UnlockKeyhole,
} from "lucide-react";
import posthog from "posthog-js";
import type React from "react";
import { useEffect, useState } from "react";
import { getMarmaladeFlagEnabled } from "@/app/actions/flags";
import { GetInstances } from "@/app/actions/instance";
import { setMarmaladeApiKey } from "@/app/actions/marmalade";
import { updatePreferences } from "@/app/actions/preferences";
import { authClient } from "@/lib/auth-client";
import { isErrorResponse } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { CogIcon } from "./ui/cog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { toast } from "./ui/toast";

export function SettingsModal() {
  const { data: session, isPending, refetch } = authClient.useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [userInstances, setUserInstances] = useState<selectItem[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string>("");
  const [marmFlagEnabled, setMarmFlagEnabled] = useState<boolean>(false);

  const lowTrafficHosts = session?.preferences?.lowTrafficHosts ?? [];
  const selectedHost =
    userInstances.find((i) => i.value === selectedInstance)?.slug ?? null;

  async function TogglePosthogCollection() {
    setIsLoading(true);
    await updatePreferences({
      isOptedOutTracking: posthog.has_opted_in_capturing(),
    });

    if (posthog.has_opted_in_capturing()) {
      posthog.opt_out_capturing();
    } else {
      posthog.opt_in_capturing();
    }

    window.location.reload();
  }

  async function ToggleDeeplinking() {
    setIsLoading(true);
    await updatePreferences({
      isSlackDeeplinkingEnabled:
        !session?.preferences?.isSlackDeeplinkingEnabled,
    });

    await refetch();
    setIsLoading(false);
  }

  async function ToggleLowTrafficHost() {
    if (!selectedHost) return;
    setIsLoading(true);
    await updatePreferences({
      lowTrafficHosts: lowTrafficHosts.includes(selectedHost)
        ? lowTrafficHosts.filter((host) => host !== selectedHost)
        : [...lowTrafficHosts, selectedHost],
    });

    await refetch();
    setIsLoading(false);
  }
  type selectItem = {
    label: string;
    value: string;
    slug: string;
  };

  useEffect(() => {
    async function fetchUserInstances() {
      if (isPending || !session?.user) return;
      const instances = await GetInstances({ onlyMemberInstances: true });

      if (isErrorResponse(instances)) {
        console.error("Failed to fetch user instances:", instances);
        toast.add({
          title: "Error",
          description:
            instances.message || "Failed to load your instances, try again?",
          type: "error",
        });
        return;
      }

      setUserInstances(
        instances.map((instance) => ({
          label: instance.name,
          value: instance.instanceId,
          slug: instance.slug,
        })),
      );
      setSelectedInstance(instances[0]?.instanceId || null);
    }

    async function fetchMarmaladeFlag() {
      const marmalade = await getMarmaladeFlagEnabled();
      setMarmFlagEnabled(marmalade);
    }

    fetchUserInstances();
    fetchMarmaladeFlag();
  }, [isPending, session?.user]);

  async function handleSaveApiKey() {
    if (!selectedInstance) return;

    setIsLoading(true);

    const response = await setMarmaladeApiKey(selectedInstance, apiKey);

    if (isErrorResponse(response)) {
      console.error("Failed to save Marmalade API key:", response);
      toast.add({
        title: "Error",
        description: `Failed to save Marmalade API key: ${response.message || response.error}`,
        type: "error",
      });
    } else {
      toast.add({
        title: "Success",
        description: "Marmalade API key saved successfully",
        type: "success",
      });
    }

    setIsLoading(false);
  }

  function OpenMarmaladeAPIKeyPage() {
    window.open("https://marmalade.hackclub.dev/", "_blank");
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button size="icon-xl" variant="outline" disabled={isPending}>
            <CogIcon size={24} className="text-muted-foreground" />
          </Button>
        }
      />
      <DialogContent className="md:min-w-xl ">
        <DialogHeader>
          <DialogTitle>Preferences</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          <SettingContainer>
            <SettingHeader
              title="Data Collection"
              description="I use Posthog to collect data so I can improve this faster, you can of course opt-out here if you wish! <3"
            />
            <Button
              className="gap-2"
              onClick={() => TogglePosthogCollection()}
              disabled={isLoading}
            >
              {posthog.has_opted_in_capturing() ? "Opt Out" : "Opt In"}
              {posthog.has_opted_in_capturing() ? (
                <LockKeyhole size={12} />
              ) : (
                <UnlockKeyhole size={12} />
              )}
            </Button>
          </SettingContainer>
          <SettingContainer>
            <SettingHeader
              title="Slack Deeplinking"
              description="Enable or disable Slack deeplinking, disable this if you aren't using the Slack app, works on desktop and mobile"
            />
            <Button
              className="gap-2"
              onClick={() => ToggleDeeplinking()}
              disabled={isLoading}
            >
              {session?.preferences?.isSlackDeeplinkingEnabled
                ? "Disable Deeplinking"
                : "Enable Deeplinking"}
              {session?.preferences?.isSlackDeeplinkingEnabled ? (
                <LockKeyhole size={12} />
              ) : (
                <UnlockKeyhole size={12} />
              )}
            </Button>
          </SettingContainer>

          {!isPending && userInstances.length === 0 ? (
            <SettingCallout
              type={"destructive"}
              icon={<MailWarning size={24} />}
              text="You are not a member of any instances"
              description="Please contact an admin to add you, if you are unsure of who to contact, reach out to @Simon K on Slack or send a message in the #horus channel! :)"
            />
          ) : (
            <>
              <SettingCallout
                type={"default"}
                icon={<InfoIcon size={24} />}
                text="Theese settings require being a member of the instance"
                description="If you are unsure of who to contact, please reach out to @Simon K on Slack or send a message in the #horus channel! :)"
              />
              <SettingContainer>
                <Card className="p-4">
                  <SettingHeader
                    title="Selected Instance"
                    description="Select the instance to modify, this applies to all settings below."
                  />
                  <Select
                    items={userInstances}
                    onValueChange={(value) => {
                      setSelectedInstance(value);
                    }}
                    defaultValue={userInstances[0]?.value}
                  >
                    <SelectTrigger
                      className="w-full"
                      disabled={isLoading || userInstances.length === 0}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {userInstances.map((instance) => (
                        <SelectItem key={instance.value} value={instance.value}>
                          {instance.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Card>
              </SettingContainer>
              {marmFlagEnabled && (
                <SettingContainer>
                  <SettingHeader
                    title="Marmalade API Key (Jelly)"
                    description="Marmalade is used to fetch your mailboxes and messages, you need one API key for each instance."
                  />
                  <div className="flex flex-row gap-2 mt-2">
                    <Input
                      placeholder="Enter API Key"
                      id="apiKey"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      type="password"
                      disabled={isLoading || userInstances.length === 0}
                    />
                    <Button
                      disabled={
                        isLoading ||
                        userInstances.length === 0 ||
                        !apiKey ||
                        apiKey.length < 1
                      }
                      onClick={handleSaveApiKey}
                    >
                      Save
                      <SaveIcon size={10} />
                    </Button>
                    <Button
                      variant="link"
                      onClick={() => OpenMarmaladeAPIKeyPage()}
                      disabled={isLoading}
                    >
                      Get API Key
                      <MoveUpRight size={10} />
                    </Button>
                  </div>
                </SettingContainer>
              )}
              <SettingContainer>
                <SettingHeader
                  title="Low Traffic Hosts"
                  description="Add hosts here to get an alternative interface more optimization for low-traffic instances."
                />
                <Button
                  className="gap-2"
                  onClick={() => ToggleLowTrafficHost()}
                  disabled={isLoading || !selectedHost}
                >
                  {selectedHost && lowTrafficHosts.includes(selectedHost)
                    ? "Disable"
                    : "Enable"}
                  {selectedHost && lowTrafficHosts.includes(selectedHost) ? (
                    <LockKeyhole size={12} />
                  ) : (
                    <UnlockKeyhole size={12} />
                  )}
                </Button>
              </SettingContainer>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-2">
      <p className="text-lg font-bold">{title}</p>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

function SettingContainer({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

function SettingCallout({
  text,
  description,
  icon,
  type = "default",
}: {
  text: string;
  description: string;
  icon: React.ReactNode;
  type: "default" | "destructive" | "warning";
}) {
  return (
    <Card className="flex flex-row gap-2 p-5">
      <div
        className={cn("", {
          "text-primary": type === "default",
          "text-destructive": type === "destructive",
          "text-warning": type === "warning",
        })}
      >
        {icon}
      </div>
      <div>
        <p
          className={cn("font-bold", {
            "text-primary": type === "default",
            "text-destructive": type === "destructive",
            "text-warning": type === "warning",
          })}
        >
          {text}
        </p>
        <p className="text-muted-foreground">{description}</p>
      </div>
    </Card>
  );
}
