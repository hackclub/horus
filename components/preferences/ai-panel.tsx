"use client";

import { KeyRound, MoveUpRight, SaveIcon, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type AiSettingsView,
  deleteAiApiKey,
  getAiModels,
  getMyAiSettings,
  getMyAiUsage,
  setAiApiKey,
  setAiModel,
} from "@/app/actions/ai";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { HACK_CLUB_AI_URL, SUGGESTED_AI_MODELS } from "@/lib/ai-models";
import { isErrorResponse } from "@/lib/errors";
import type { AiModel, AiUsage } from "@/lib/hackclub-ai";
import { KEYS_CHANGED_EVENT } from "@/lib/preferences-events";

const OTHER_MODEL = "__other__";
const numberFormat = new Intl.NumberFormat("en-US");

function price(value: number) {
  // Routers like openrouter/auto report -1: the price depends on the pick.
  if (!Number.isFinite(value) || value < 0) return "varies";
  return `$${value < 1 ? value.toFixed(2) : value.toFixed(value % 1 ? 2 : 0)}`;
}

export function AiPanel() {
  const router = useRouter();
  const [settings, setSettings] = useState<AiSettingsView | null>(null);
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [models, setModels] = useState<AiModel[]>([]);
  const [keyValue, setKeyValue] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await getMyAiSettings();
    if (isErrorResponse(result)) {
      toast.add({
        title: "Couldn't load AI settings",
        description: result.message || result.error,
        type: "error",
      });
      return;
    }
    setSettings(result);
    if (result.keyHint) {
      const u = await getMyAiUsage();
      setUsage(isErrorResponse(u) ? null : u);
    } else {
      setUsage(null);
    }
  }, []);

  useEffect(() => {
    load();
    getAiModels().then((result) => {
      if (!isErrorResponse(result)) setModels(result);
    });
  }, [load]);

  function changed() {
    load();
    router.refresh();
    window.dispatchEvent(new Event(KEYS_CHANGED_EVENT));
  }

  async function saveKey() {
    setBusy(true);
    const result = await setAiApiKey(keyValue);
    setBusy(false);
    if (isErrorResponse(result)) {
      toast.add({
        title: "Key not saved",
        description: result.message || result.error,
        type: "error",
      });
      return;
    }
    setKeyValue("");
    toast.add({ title: "Hack Club AI connected", type: "success" });
    changed();
  }

  async function removeKey() {
    setBusy(true);
    const result = await deleteAiApiKey();
    setBusy(false);
    if (isErrorResponse(result)) {
      toast.add({
        title: "Couldn't remove key",
        description: result.message || result.error,
        type: "error",
      });
      return;
    }
    toast.add({ title: "Removed your Hack Club AI key", type: "success" });
    changed();
  }

  if (!settings) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p>
          Bring your own{" "}
          <a
            href={HACK_CLUB_AI_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            Hack Club AI
          </a>{" "}
          key to get ticket summaries and reply drafts in the ticket peek, plus
          a queue brief on each dashboard. Summaries and drafts read the
          ticket&apos;s message, so they work on instances you&apos;re a member
          of once an instance admin has added a Nephthys key in Settings.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-row flex-wrap items-center justify-between gap-2">
          <p className="text-lg font-bold">API Key</p>
          {settings.keyHint ? (
            <Badge variant="default">
              <KeyRound />
              <span className="font-mono">{settings.keyHint}</span>
            </Badge>
          ) : (
            <Badge variant="outline">Not connected</Badge>
          )}
        </div>
        <form
          className="flex flex-row gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (keyValue.trim()) saveKey();
          }}
        >
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={settings.keyHint ? "Paste a new key" : "sk-hc-v1-..."}
            value={keyValue}
            onChange={(e) => setKeyValue(e.target.value)}
            disabled={busy}
            aria-label="Hack Club AI API key"
          />
          <Button type="submit" disabled={busy || !keyValue.trim()}>
            {busy ? "Checking..." : "Save"}
            <SaveIcon size={10} />
          </Button>
          {settings.keyHint && (
            <Button
              type="button"
              size="icon"
              variant="destructive"
              onClick={removeKey}
              disabled={busy}
              aria-label="Remove Hack Club AI key"
            >
              <Trash2 />
            </Button>
          )}
          <a
            href={HACK_CLUB_AI_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "link" })}
          >
            Get key
            <MoveUpRight />
          </a>
        </form>
        {usage && (
          <p className="text-xs text-muted-foreground">
            This key has made {numberFormat.format(usage.totalRequests)}{" "}
            requests using {numberFormat.format(usage.totalTokens)} tokens. Hack
            Club AI caps each person&apos;s daily spend.
          </p>
        )}
      </div>

      {settings.keyHint && (
        <ModelPicker
          current={settings.model}
          defaultModel={settings.defaultModel}
          models={models}
          onSaved={(model) => setSettings({ ...settings, model })}
        />
      )}

      <div className="bg-input/30 border p-4 text-sm text-muted-foreground flex flex-col gap-1">
        <p className="font-bold text-foreground">Where ticket text goes</p>
        <p>
          Nothing is sent until you press an AI button. Then the ticket text
          goes to Hack Club AI (which logs requests) with your key, and Horus
          asks OpenRouter to only use providers that don&apos;t collect data,
          since Slack messages must never be used to train models. Horus
          doesn&apos;t store the results.
        </p>
      </div>
    </div>
  );
}

function ModelPicker({
  current,
  defaultModel,
  models,
  onSaved,
}: {
  current: string;
  defaultModel: string;
  models: AiModel[];
  onSaved: (model: string) => void;
}) {
  const suggested = SUGGESTED_AI_MODELS.some((m) => m.id === current);
  const [choice, setChoice] = useState(suggested ? current : OTHER_MODEL);
  const [custom, setCustom] = useState(suggested ? "" : current);
  const [busy, setBusy] = useState(false);

  const selected = choice === OTHER_MODEL ? custom.trim() : choice;
  const info = useMemo(
    () => models.find((m) => m.id === selected),
    [models, selected],
  );

  async function save() {
    setBusy(true);
    const result = await setAiModel(selected);
    setBusy(false);
    if (isErrorResponse(result)) {
      toast.add({
        title: "Model not saved",
        description: result.message || result.error,
        type: "error",
      });
      return;
    }
    toast.add({ title: `Using ${result.model}`, type: "success" });
    onSaved(result.model);
  }

  const items = [
    ...SUGGESTED_AI_MODELS.map((m) => ({
      value: m.id,
      label: m.id === defaultModel ? `${m.label} (default)` : m.label,
    })),
    { value: OTHER_MODEL, label: "Another model..." },
  ];

  return (
    <div className="flex flex-col gap-2">
      <p className="text-lg font-bold">Model</p>
      <div className="flex flex-row gap-2">
        <Select
          items={items}
          value={choice}
          onValueChange={(value) => setChoice(value || defaultModel)}
        >
          <SelectTrigger className="w-full" disabled={busy}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={save}
          disabled={busy || !selected || selected === current}
        >
          Use model
        </Button>
      </div>
      {choice === OTHER_MODEL && (
        <>
          <Input
            list="hcai-models"
            placeholder="provider/model, e.g. openai/gpt-5.4-mini"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            disabled={busy}
            aria-label="Model id"
          />
          <datalist id="hcai-models">
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </datalist>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        {info
          ? `${info.name}: ${price(info.promptPrice)} in / ${price(info.completionPrice)} out per million tokens.`
          : "Pricing shows up here once Hack Club AI's model list loads."}{" "}
        Currently using <span className="font-mono">{current}</span>.
      </p>
    </div>
  );
}
