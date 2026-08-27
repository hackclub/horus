import { Suspense } from "react";
import { GetNephthysHostnameFromSlug } from "@/app/actions/instance";
import { fetchNephthysTickets } from "@/app/actions/nephthys";
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
import { isErrorResponse } from "@/lib/errors";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ host: string }>;
}) {
  const { host: selectedHost } = await params;

  const nephthysHost = await GetNephthysHostnameFromSlug(selectedHost);
  if ("error" in nephthysHost || !nephthysHost) {
    return (
      <PageDescriptionAuth
        signedOutText="Sign in to see claimed tickets and more!"
        signedInText="Unable to load ticket stats."
      />
    );
  }

  const ticketResponse = await fetchNephthysTickets(nephthysHost.host, {
    status: "OPEN",
  });

  if (isErrorResponse(ticketResponse)) {
    return (
      <>
        <Navbar />
        <ErrorFallback title={"ERR"}>
          <PageWrapper variant="tight">
            <PageHeader title="What needs help next" breadcrumb="REVIEW">
              <PageDescription>Flip through tickets</PageDescription>
            </PageHeader>
          </PageWrapper>
        </ErrorFallback>
      </>
    );
  }
  return (
    <>
      <Navbar />
      <ErrorFallback title={"ERR"}>
        <PageWrapper variant="tight">
          <PageHeader title="What needs help next" breadcrumb="REVIEW">
            <PageDescription>Flip through tickets</PageDescription>
          </PageHeader>
          <Suspense>
            <TicketSection
              tickets={ticketResponse}
              slackChannel={nephthysHost.slackChannel}
            />
            <div className="w-full border-2 my-8" />
            <div className="flex flex-row gap-2">
              <KeybindGroup>
                <Keybind btn="↑" />
                <Keybind btn="↓" name="Go back/Next" />
              </KeybindGroup>
              <KeybindGroup>
                <Keybind btn="↵" name="Open thread" />
              </KeybindGroup>
            </div>
          </Suspense>
        </PageWrapper>
      </ErrorFallback>
    </>
  );
}
