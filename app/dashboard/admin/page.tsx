import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { listAllUsers } from "@/app/actions/admin";
import { GetInstances } from "@/app/actions/instance";
import ErrorFallback from "@/app/error-boundary";
import {
  InstancesManager,
  UsersManager,
} from "@/components/admin/admin-managers";
import { Footer } from "@/components/footer";
import Navbar from "@/components/navbar";
import { PageWrapper } from "@/components/page-template";
import { PageDescription, PageHeader } from "@/components/text-types";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/auth";
import { isErrorResponse, unwrap } from "@/lib/errors";
import { userIsSuperAdmin } from "@/lib/utils";

export default async function AdminPage() {
  return (
    <>
      <Navbar />
      <ErrorFallback title={"ADMIN ERR"}>
        <PageWrapper variant="tight">
          <PageHeader title="Admin Dashboard⚡" breadcrumb="ADMIN">
            <PageDescription>Manage instances, orgs and users.</PageDescription>
          </PageHeader>

          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <AdminContent />
          </Suspense>
        </PageWrapper>
      </ErrorFallback>
      <Footer />
    </>
  );
}

async function AdminContent() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !userIsSuperAdmin(session.user.role)) {
    return redirect("/");
  }

  return (
    <>
      {" "}
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <InstancesSection />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <UsersSection />
      </Suspense>
    </>
  );
}

async function InstancesSection() {
  const instances = unwrap(
    await GetInstances({ includePrivateInstances: true }),
    "admin instance list",
  );
  return <InstancesManager instances={instances} />;
}

async function UsersSection() {
  const [users, instances] = await Promise.all([
    listAllUsers(),
    GetInstances({ includePrivateInstances: true }),
  ]);
  const orgs = isErrorResponse(instances)
    ? []
    : instances.map((i) => ({
        id: i.organizationId,
        name: i.name,
      }));
  return <UsersManager users={users} orgs={orgs} />;
}
