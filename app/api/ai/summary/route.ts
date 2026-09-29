import { summaryMessages } from "@/lib/ai-prompts";
import {
  aiErrorResponse,
  isSameOrigin,
  jsonError,
  readJsonBody,
} from "@/lib/api-response";
import { auth } from "@/lib/auth";
import { toErrorResponse, UpstreamError } from "@/lib/errors";
import {
  AiError,
  budgetFor,
  chatStream,
  type StreamEvent,
} from "@/lib/hackclub-ai";
import { getTicket, isInvalidApiKeyError } from "@/lib/nephthys";
import { getAiConfig } from "@/lib/user-keys";
import { getInstanceBySlug, resolveViewerKey } from "@/lib/viewer";
import type { Ticket } from "@/types/nephthys";

export const maxDuration = 60;

const SUMMARY_MAX_TOKENS = 1_200;

/**
 * Streams an AI summary of one ticket as NDJSON:
 * `{"type":"text","text":…}` chunks, then `{"type":"done","truncated":bool}`,
 * or `{"type":"error","message":…}` if the stream breaks midway.
 *
 * The client only sends a ticket id. The message itself is fetched here with
 * the instance's Nephthys key (members only), so this can't be used as a
 * generic prompt proxy and the text never has to round-trip through the
 * browser.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return jsonError("Forbidden", "Cross-site request refused.", 403);
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return jsonError("Unauthorized", "Sign in first.", 401);

  const body = await readJsonBody(request);
  const slug = body?.slug;
  const ticketId = body?.ticketId;
  if (
    typeof slug !== "string" ||
    slug.length > 100 ||
    !Number.isSafeInteger(ticketId) ||
    (ticketId as number) <= 0
  ) {
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

  const viewer = await resolveViewerKey(instance, session.user.id);
  if (!viewer.key) {
    const messages: Record<typeof viewer.access, string> = {
      "signed-out": "Sign in first.",
      "not-member": `Only members of ${instance.name} can use AI on its tickets, since it reads the message.`,
      "no-key": `AI needs the ticket's message, and ${instance.name} has no Nephthys API key yet. An instance admin can add one in Settings.`,
      "key-rejected": `${instance.name}'s Nephthys key doesn't work anymore (it was deleted, or the instance moved hosts). An instance admin can replace it in Settings.`,
    };
    return jsonError(
      viewer.access === "not-member" ? "Forbidden" : "KeyNotSet",
      messages[viewer.access],
      viewer.access === "not-member" ? 403 : 400,
    );
  }

  let ticket: Ticket;
  try {
    ticket = await getTicket(
      instance.host,
      ticketId as number,
      viewer.key.apiKey,
    );
  } catch (error) {
    if (isInvalidApiKeyError(error)) {
      return jsonError(
        "InvalidApiKey",
        `${instance.name}'s Nephthys doesn't accept its saved API key anymore. An instance admin can replace it in Settings.`,
        400,
      );
    }
    if (error instanceof UpstreamError && error.status === 404) {
      return jsonError("NotFound", "That ticket doesn't exist.", 404);
    }
    const response = toErrorResponse(`ai ticket (${instance.host})`, error);
    return jsonError(response.error, "Couldn't load the ticket.", 502);
  }

  if (!ticket.description?.trim()) {
    return jsonError(
      "UpstreamBadResponse",
      "Nephthys didn't send this ticket's message. The instance may not support API keys yet.",
      502,
    );
  }

  let events: AsyncGenerator<StreamEvent>;
  try {
    events = await chatStream({
      apiKey: ai.apiKey,
      model: ai.model,
      messages: summaryMessages(ticket),
      ...(await budgetFor(ai.model, SUMMARY_MAX_TOKENS)),
      signal: request.signal,
    });
  } catch (error) {
    return aiErrorResponse(error, "ai ticket");
  }

  const encoder = new TextEncoder();
  const line = (value: object) => encoder.encode(`${JSON.stringify(value)}\n`);

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await events.next();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(line(value));
        if (value.type === "done") {
          controller.close();
          // Release the upstream connection now rather than on timeout.
          await events.return(undefined);
        }
      } catch (error) {
        // The helper pressed Stop or closed the tab: nobody is listening.
        if (request.signal.aborted) return;
        if (!(error instanceof AiError)) console.error("[ai ticket]", error);
        controller.enqueue(
          line({
            type: "error",
            message:
              error instanceof AiError
                ? error.message
                : "The answer stream broke off.",
          }),
        );
        controller.close();
      }
    },
    async cancel() {
      await events.return(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
