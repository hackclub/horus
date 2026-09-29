export type QueueBrief = {
  overview: string;
  groups: {
    label: string;
    summary: string;
    ticketIds: number[];
    urgency: "high" | "medium" | "low";
  }[];
  pickNext: { ticketId: number; reason: string } | null;
};

export type QueueBriefResponse = {
  brief: QueueBrief;
  queueSize: number;
  analysed: number;
  usedMessages: boolean;
  model: string | null;
  generatedAt: string;
};

/** One NDJSON line from POST /api/ai/summary. */
export type AiStreamLine =
  | { type: "text"; text: string }
  | { type: "done"; truncated: boolean }
  | { type: "error"; message: string };
