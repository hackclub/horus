// Client-safe: shared by the preferences UI and the server.

export const DEFAULT_AI_MODEL = "anthropic/claude-haiku-4.5";

/**
 * Shortlist shown in Preferences → AI. Any other model id can be typed in.
 * Picked from Artificial Analysis Intelligence Index scores, Hack Club AI
 * prices and OpenRouter's zero-data-retention endpoint list (Sept 2026); all
 * four can be routed with `data_collection: deny`.
 */
export const SUGGESTED_AI_MODELS: {
  id: string;
  label: string;
  note: string;
}[] = [
  {
    id: DEFAULT_AI_MODEL,
    label: "Claude Haiku 4.5",
    note: "fast and steady",
  },
  {
    id: "deepseek/deepseek-v4.1-flash",
    label: "DeepSeek V4.1 Flash",
    note: "best value",
  },
  {
    id: "anthropic/claude-sonnet-5.5",
    label: "Claude Sonnet 5.5",
    note: "smartest, slower",
  },
  { id: "openai/gpt-6-luna", label: "GPT-6 Luna", note: "cheapest" },
];

export const HACK_CLUB_AI_URL = "https://ai.hackclub.com";
