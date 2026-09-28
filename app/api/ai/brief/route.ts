import {
  BRIEF_SCHEMA,
  BRIEF_TICKET_LIMIT,
  briefMessages,
  parseBrief,
} from "@/lib/ai-prompts";
import {
  aiErrorResponse,
  isSameOrigin,
  jsonError,
  readJsonBody,
} from "@/lib/api-response";
import { auth } from "@/lib/auth";
import { isErrorResponse } from "@/lib/errors";
import { chat } from "@/lib/hackclub-ai";
import { getAiConfig } from "@/lib/user-keys";
import { getInstanceBySlug, loadViewerTickets } from "@/lib/viewer";
import type { QueueBriefResponse } from "@/types/ai";

export const maxDuration = 60;

/**
 * An AI read of the unassigned queue: themes, urgency, and what to pick up
 * next. Works on titles alone; with the viewer's Nephthys key it also reads
 * the start of each message.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return jsonError("Forbidden", "Cross-site request refused.", 403);
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return jsonError("Unauthorized", "Sign in first.", 401);

  const body = await readJsonBody(request);
  const slug = body?.slug;
  if (typeof slug !== "string" || slug.length > 100) {
    return jsonError("InvalidInput", "Malformed request.", 400);
  }

  const ai = await getAiConfig(session.user.id);
  if (!ai) {
    return jsonError(
      "KeyNotSet",
      "Add your Hack Club AI key in Preferences → AI first.",
      400,
    );
  }

  const instance = await getInstanceBySlug(slug);
  if (!instance) return jsonError("NotFound", "Unknown instance.", 404);

  const loaded = await loadViewerTickets(instance, session.user.id, {
    status: "OPEN,IN_PROGRESS",
  });
  if (isErrorResponse(loaded)) {
    return jsonError(loaded.error, "Couldn't load the queue.", 502);
  }

  const queue = loaded.tickets
    .filter((ticket) => !ticket.assigned_to)
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

  const generatedAt = new Date().toISOString();
  if (queue.length === 0) {
    return Response.json(
      {
        brief: {
          overview: "The unassigned queue is empty. Nice.",
          groups: [],
          pickNext: null,
        },
        queueSize: 0,
        analysed: 0,
        usedMessages: false,
        model: null,
        generatedAt,
      } satisfies QueueBriefResponse,
      { headers: { "cache-control": "no-store" } },
    );
  }

  const included = queue.slice(0, BRIEF_TICKET_LIMIT);
  const omitted = queue.length - included.length;

  let content: string;
  try {
    ({ content } = await chat({
      apiKey: ai.apiKey,
      model: ai.model,
      messages: briefMessages(included, omitted),
      maxTokens: 3_000,
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "queue_brief",
          strict: true,
          schema: BRIEF_SCHEMA,
        },
      },
      signal: request.signal,
    }));
  } catch (error) {
    return aiErrorResponse(error, "ai brief");
  }

  const brief = parseBrief(content, new Set(included.map((t) => t.id)));
  if (!brief) {
    return jsonError(
      "UpstreamBadResponse",
      `${ai.model} answered with something Horus couldn't read. Try again, or pick another model in Preferences → AI.`,
      502,
    );
  }

  return Response.json(
    {
      brief,
      queueSize: queue.length,
      analysed: included.length,
      usedMessages: included.some((ticket) => !!ticket.description),
      model: ai.model,
      generatedAt,
    } satisfies QueueBriefResponse,
    { headers: { "cache-control": "no-store" } },
  );
}
