import { headers } from "next/headers";
import { Suspense } from "react";
import { GetNephthysHostnameFromSlug } from "@/app/actions/instance";
import {
  fetchNephthysStats,
  fetchNephthysTickets,
  fetchNephthysTicketsTTR,
} from "@/app/actions/nephthys";
import ErrorFallback from "@/app/error-boundary";
import DashboardHeader from "@/components/dashboard-header";
import { Footer } from "@/components/footer";
import { HelperLeaderboardWidget } from "@/components/helper-leaderboard";
import Navbar from "@/components/navbar";
import { PageWrapper } from "@/components/page-template";
import { StatusChartWidget } from "@/components/status-chart-widget";
import { SurveyWidget } from "@/components/survey-widget";
import { PageDescription, PageDescriptionAuth } from "@/components/text-types";
import { TicketAgeChartWidget } from "@/components/ticket-age-chart-widget";
import {
  AssignedTicketsWidget,
  UnassignedTicketsWidget,
} from "@/components/ticket-table";
import { TicketWidget } from "@/components/ticket-widget";
import { auth } from "@/lib/auth";
import { isErrorResponse, unwrap } from "@/lib/errors";
import type { Ticket as TicketType } from "@/types/nephthys";

export default async function Dashboard({
  params,
}: {
  params: Promise<{ host: string }>;
}) {
  return (
    <>
      <Navbar />
      <ErrorFallback title={"ERR"}>
        <PageWrapper variant="tight">
          <Suspense>
            <DashboardHeader
              params={params}
              description={
                <Suspense
                  fallback={<PageDescription>Loading...</PageDescription>}
                >
                  <StatsPageDescription params={params} />
                </Suspense>
              }
            />
          </Suspense>

          <Suspense fallback={<TicketsSectionFallback />}>
            <TicketsSection params={params} />
          </Suspense>

          <div className="grid lg:grid-cols-3 md:grid-cols-2 gap-4 py-2">
            <Suspense
              fallback={
                <>
                  <TicketAgeChartWidget />
                  <StatusChartWidget />
                  <HelperLeaderboardWidget />
                </>
              }
            >
              <StatsSection params={params} />
            </Suspense>
          </div>
        </PageWrapper>
      </ErrorFallback>
      <Footer />
    </>
  );
}

async function StatsPageDescription({
  params,
}: {
  params: Promise<{ host: string }>;
}) {
  const { host: selectedHost } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const nephthysHost = await GetNephthysHostnameFromSlug(selectedHost);
  if ("error" in nephthysHost || !nephthysHost) {
    return (
      <PageDescriptionAuth
        signedOutText="Sign in to see claimed tickets and more!"
        signedInText="Unable to load ticket stats."
      />
    );
  }

  const nephthysStats = { assigned: 0, unclaimed: 0, inProgress: 0 };

  const res = await fetchNephthysTickets(nephthysHost.host, {
    status: "OPEN,IN_PROGRESS",
  });

  if (!isErrorResponse(res)) {
    res.forEach((element) => {
      if (
        element.assigned_to &&
        element.assigned_to.slack_id === session?.user?.slack_id
      )
        nephthysStats.assigned++;
      else if (!element.assigned_to) nephthysStats.unclaimed++;
      else if (element.status === "IN_PROGRESS") nephthysStats.inProgress++;
    });
  }

  return (
    <PageDescriptionAuth
      signedOutText="Sign in to see claimed tickets and more!"
      signedInText={`${nephthysStats.assigned} assigned to you · ${nephthysStats.unclaimed}  unclaimed in the queue · ${nephthysStats.inProgress} in progress.`}
    />
  );
}

async function TicketsSection({
  params,
}: {
  params: Promise<{ host: string }>;
}) {
  const { host: selectedHost } = await params;
  const nephthysHost = await GetNephthysHostnameFromSlug(selectedHost);
  if ("error" in nephthysHost || !nephthysHost)
    throw new Error(
      nephthysHost.message ||
        "Nephthys hostname not found for the selected host",
    );

  const { host: hostname, slackChannel } = nephthysHost;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const ticketsResult = await fetchNephthysTickets(hostname, {
    status: "OPEN,IN_PROGRESS",
  });

  const tickets = unwrap(ticketsResult, `tickets for ${hostname}`);

  const userStats = { assigned: 0, unclaimed: 0, inProgress: 0 };
  const slackId = session?.user?.slack_id;

  for (const ticket of tickets) {
    if (ticket.assigned_to?.slack_id === slackId) userStats.assigned++;
    else if (!ticket.assigned_to) userStats.unclaimed++;
    else if (ticket.status === "IN_PROGRESS") userStats.inProgress++;
  }

  const oldestTicket = tickets.reduce(
    (oldest, ticket) => {
      if (!oldest || ticket.created_at < oldest.created_at) {
        return ticket;
      }
      return oldest;
    },
    null as TicketType | null,
  );

  return (
    <>
      <div className="grid lg:grid-cols-3 md:grid-cols-2 grid-cols-1 gap-4 py-2 min-h-66">
        <TicketWidget
          slackChannel={slackChannel}
          ticket={oldestTicket}
          ticketWidgetType={"oldest"}
        />
        <TicketWidget
          slackChannel={slackChannel}
          ticket={null} // TODO: Implement this
          ticketWidgetType={"checkup"}
        />
        <SurveyWidget />
      </div>

      <div className="grid lg:grid-cols-3 md:grid-cols-2 gap-4 py-2">
        <div className="col-span-3 flex flex-col gap-4">
          {session?.user && (
            <AssignedTicketsWidget
              slackId={slackId}
              tickets={tickets}
              slackChannel={slackChannel}
            />
          )}
          <UnassignedTicketsWidget
            tickets={tickets}
            slackChannel={slackChannel}
          />
        </div>
      </div>
    </>
  );
}

function TicketsSectionFallback() {
  return (
    <>
      <div className="grid lg:grid-cols-3 md:grid-cols-2 grid-cols-1 gap-4 py-2 min-h-66">
        <TicketWidget ticketWidgetType={"oldest"} isLoading />
        <TicketWidget ticketWidgetType={"checkup"} isLoading />
        <SurveyWidget />
      </div>

      <div className="grid lg:grid-cols-3 md:grid-cols-2 gap-4 py-2">
        <div className="col-span-3 flex flex-col gap-4">
          <AssignedTicketsWidget />
          <UnassignedTicketsWidget />
        </div>
      </div>
    </>
  );
}

async function StatsSection({ params }: { params: Promise<{ host: string }> }) {
  const { host: selectedHost } = await params;
  const nepthysData = unwrap(
    await GetNephthysHostnameFromSlug(selectedHost),
    `nephthys host for ${selectedHost}`,
  );

  const [ticketsTTRResult, statsResult] = await Promise.all([
    fetchNephthysTicketsTTR(nepthysData.host),
    fetchNephthysStats(nepthysData.host),
  ]);

  const ticketsTTR = unwrap(
    ticketsTTRResult,
    `ticket TTR for ${nepthysData.host}`,
  );
  const stats = unwrap(statsResult, `stats for ${nepthysData.host}`);

  return (
    <>
      <TicketAgeChartWidget ticketsTTR={ticketsTTR} />
      <StatusChartWidget
        openCount={stats?.all_time?.tickets_open || 0}
        inProgressCount={stats?.all_time?.tickets_in_progress || 0}
        closedCount={stats?.all_time?.tickets_closed || 0}
      />
      <HelperLeaderboardWidget
        helperData={stats?.all_time?.helpers_leaderboard || []}
      />
    </>
  );
}
