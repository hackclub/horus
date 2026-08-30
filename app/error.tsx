"use client";

import { RotateCcw } from "lucide-react";
import { PageWrapper } from "@/components/page-template";
import { PageDescription, PageHeader } from "@/components/text-types";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <PageWrapper>
      <PageHeader title={error.name} breadcrumb={"ERROR"}>
        <PageDescription>{error.message}</PageDescription>
        <Button onClick={retry} className={"max-w-28 text-md p-4"}>
          Retry
          <RotateCcw size={12} />
        </Button>
      </PageHeader>
    </PageWrapper>
  );
}
