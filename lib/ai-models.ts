// Client-safe: shared by the preferences UI and the server.

export const DEFAULT_AI_MODEL = "anthropic/claude-haiku-4.5";

/** Shortlist shown in Preferences → AI. Any other model id can be typed in. */
export const SUGGESTED_AI_MODELS: { id: string; label: string }[] = [
  { id: DEFAULT_AI_MODEL, label: "Claude Haiku 4.5" },
  { id: "openai/gpt-6-luna", label: "GPT-6 Luna" },
  { id: "anthropic/claude-sonnet-5.5", label: "Claude Sonnet 5.5" },
];

export const HACK_CLUB_AI_URL = "https://ai.hackclub.com";
