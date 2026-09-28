import { headers } from "next/headers";
import { Suspense } from "react";
import ErrorFallback from "@/app/error-boundary";
import { Keybind, KeybindGroup } from "@/components/keyboard";
import Navbar from "@/components/navbar";
import { PageWrapper } from "@/components/page-template";
import { TicketSection } from "@/components/review";
import {
  PageDescription,
  PageDescriptionAuth,
  PageHeader,
} from "@/components/text-types";
import { TicketPeekProvider } from "@/components/ticket-peek";
import { auth } from "@/lib/auth";
import { isErrorResponse } from "@/lib/errors";
import { hasAiKey } from "@/lib/user-keys";
import { getInstanceBySlug, loadViewerTickets } from "@/lib/viewer";

export default function ReviewPage({
  params,
}: {
  params: Promise<{ host: string }>;
}) {
  return (
    <>
      <Navbar />
      <ErrorFallback title={"ERR"}>
        <PageWrapper variant="tight">
          <PageHeader title="What needs help next" breadcrumb="REVIEW">
            <PageDescription>Flip through tickets</PageDescription>
          </PageHeader>
          <Suspense>
            <ReviewSection params={params} />
          </Suspense>
        </PageWrapper>
      </ErrorFallback>
    </>
  );
}

async function ReviewSection({
  params,
}: {
  params: Promise<{ host: string }>;
}) {
  const { host: selectedHost } = await params;

  const instance = await getInstanceBySlug(selectedHost);
  if (!instance) {
    return (
      <PageDescriptionAuth
        signedOutText="Sign in to see claimed tickets and more!"
        signedInText="Unable to load ticket stats."
      />
    );
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const [ticketResponse, aiEnabled] = await Promise.all([
    loadViewerTickets(instance, session?.user?.id, { status: "OPEN" }),
    session ? hasAiKey(session.user.id) : false,
  ]);

  if (isErrorResponse(ticketResponse)) return null;

  return (
    <TicketPeekProvider
      viewer={{
        slug: instance.slug,
        instanceName: instance.name,
        slackChannel: instance.slackChannel,
        access: ticketResponse.access,
        aiEnabled,
      }}
    >
      <TicketSection
        tickets={ticketResponse.tickets}
        slackChannel={instance.slackChannel}
      />
      <div className="w-full border-2 my-8" />
      <div className="flex flex-row flex-wrap gap-2">
        <KeybindGroup>
          <Keybind btn="↑" />
          <Keybind btn="↓" name="Go back/Next" />
        </KeybindGroup>
        <KeybindGroup>
          <Keybind btn="Space" name="Peek" />
        </KeybindGroup>
        <KeybindGroup>
          <Keybind btn="↵" name="Open thread" />
        </KeybindGroup>
      </div>
    </TicketPeekProvider>
  );
}
