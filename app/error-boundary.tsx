"use client";
import { ArrowUpRight, RotateCcw } from "lucide-react";
import { catchError, type ErrorInfo } from "next/error";
import { PageWrapper } from "@/components/page-template";
import { PageDescription, PageHeader } from "@/components/text-types";
import { Button } from "@/components/ui/button";

function ErrorFallback(_props: { title: string }, { error, retry }: ErrorInfo) {
  const err = error instanceof Error ? error : new Error(String(error));

  function ReachOut() {
    window.open(
      "https://hackclub.enterprise.slack.com/team/U07F2QA059B",
      "_blank",
    );
  }
  return (
    <PageWrapper variant="tight">
      <PageHeader title={err.message} breadcrumb={"ERROR"}>
        <PageDescription>
          {err.name}: {err.message}
          <br />
          <br />
          Stack: {err.stack}
        </PageDescription>
        <div className="flex flex-row gap-2">
          <Button size={"xl"} className={"text-md px-4 py-0"} onClick={retry}>
            Retry
            <RotateCcw size={12} />
          </Button>
          <Button
            onClick={ReachOut}
            variant={"link"}
            size={"xl"}
            className={"text-md"}
          >
            Reach out <ArrowUpRight />
          </Button>
        </div>
      </PageHeader>
    </PageWrapper>
  );
}

export default catchError(ErrorFallback);
