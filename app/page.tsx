import { Suspense } from "react";
import { Footer } from "@/components/footer";
import {
  InstanceCard,
  InstanceCardLogin,
  InstanceCardSkeleton,
} from "@/components/instance-card";
import Navbar from "@/components/navbar";
import { PageWrapper } from "@/components/page-template";
import { PosthogPrefsLoader } from "@/components/posthog-prefs-loader";
import { PageDescription, PageHeader } from "@/components/text-types";
import { unwrap } from "@/lib/errors";
import { GetInstances } from "./actions/instance";

export default async function Home() {
  return (
    <>
      <PosthogPrefsLoader />
      <Navbar />
      <PageWrapper variant="tight">
        <PageHeader breadcrumb="directory" title="Hacker help, made simple.">
          <PageDescription>
            Horus centralizes your support channels and gives you a unified view
            of your support operations.
          </PageDescription>
        </PageHeader>
        <div className="grid lg:grid-cols-3 md:grid-cols-2 gap-4 py-7">
          <Suspense fallback={<InstanceGridFallback />}>
            <InstanceGrid />
          </Suspense>
          <InstanceCardLogin />
        </div>
        <Suspense>
          <div className="w-full border-2" />
          <div className="grid lg:grid-cols-3 md:grid-cols-2 gap-4 py-7">
            <InstanceGrid deprecated />
          </div>
        </Suspense>
      </PageWrapper>
      <Footer />
    </>
  );
}

async function InstanceGrid({ deprecated = false }: { deprecated?: boolean }) {
  const instances = unwrap(await GetInstances(), "instance directory");

  const normalInstances = instances
    .sort((a, b) => {
      const statsA = a.openTickets + a.resolvedTickets + a.inProgressTickets;
      const statsB = b.openTickets + b.resolvedTickets + b.inProgressTickets;

      return statsB - statsA;
    })
    .reduce(
      (acc, instance) => {
        if (instance.deprecated === deprecated) {
          acc.push(instance);
        }
        return acc;
      },
      [] as typeof instances,
    );
  return (
    <>
      {normalInstances?.map((instance) => (
        <InstanceCard
          key={instance.instanceId}
          name={instance.name}
          slug={instance.slug}
          stats={{
            open: instance.openTickets,
            resolved: instance.resolvedTickets,
            inProgress: instance.inProgressTickets,
          }}
          imageUrl={instance.imageUrl}
          deprecated={instance.deprecated}
        />
      ))}{" "}
    </>
  );
}

function InstanceGridFallback() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: not worth it
        <InstanceCardSkeleton key={index} />
      ))}
    </>
  );
}
