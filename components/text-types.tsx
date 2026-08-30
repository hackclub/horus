"use client";

import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

function PageBreadcrumb({ name }: { name: string }) {
  return (
    <p className="text-xs font-medium tracking-widest text-primary">
      HORUS · {name.toUpperCase()}
    </p>
  );
}

function PageTitle({ title }: { title: string }) {
  return <h1 className="text-4xl font-bold font-heading">{title}</h1>;
}

export function PageDescriptionAuth({
  signedInText,
  signedOutText,
}: {
  signedInText?: string;
  signedOutText: string;
}) {
  const { data: session, isPending } = authClient.useSession();

  return (
    <p className="text-md text-muted-foreground max-w-xl tracking-wide">
      {session?.user && !isPending ? signedInText : signedOutText}
    </p>
  );
}

export function PageDescription({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-md text-muted-foreground max-w-xl tracking-wide">
      {children}
    </p>
  );
}

export function LinkHref({
  href,
  children,
  ...props
}: {
  href: string;
  children: React.ReactNode;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { className, ...restProps } = props;
  return (
    <a
      href={href}
      target="_blank"
      className={`text-primary underline ${className || ""}`}
      rel="noopener noreferrer"
      {...restProps}
    >
      {children}
    </a>
  );
}

export function PageHeader({
  breadcrumb,
  title,
  justifyBetween = false,
  center = false,
  children,
}: {
  breadcrumb: string;
  title: string;
  justifyBetween?: boolean;
  center?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex  flex-col gap-4 py-2",
        center ? "flex-col items-center justify-center" : "flex-1",
      )}
    >
      <PageBreadcrumb name={breadcrumb} />
      <PageTitle title={title} />
      <div
        className={cn(
          "flex flex-col gap-4",
          justifyBetween && "lg:flex-row lg:justify-between",
          center && "justify-center items-center",
        )}
      >
        {children}
      </div>
    </div>
  );
}
