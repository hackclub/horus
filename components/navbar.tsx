"use client";

import { FlameIcon } from "lucide-react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Suspense } from "react";
import { authClient } from "@/lib/auth-client";
import { cn, userIsSuperAdmin } from "@/lib/utils";
import { SettingsModal } from "./settings-modal";
import { SiteBanner } from "./site-banner";
import { StreakNavbar } from "./streak-navbar";
import { ThemeSwitcher } from "./theme-switcher";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Skeleton } from "./ui/skeleton";

export default function Navbar() {
  const { data: session, isPending } = authClient.useSession();
  const theme = useTheme();

  function handleLogin() {
    authClient.signIn.oauth2({
      providerId: "hack-club",
    });
  }

  function handleSignOut() {
    authClient.signOut();
  }

  return (
    <>
      <SiteBanner />
      <div className="border-b bg-card">
        <div className="flex items-center justify-between mx-auto px-10 py-4 max-w-6xl">
          <div
            className="flex items-center gap-4"
            style={{ width: 333 / 4, height: 122 / 4 }}
          >
            {theme.theme === "light" ? (
              <Image
                src="/Horus_Transparent_Dark.png"
                alt="Horus"
                width={333}
                height={122}
                loading="eager"
                priority
                className="object-contain"
              />
            ) : (
              <Image
                src="/Horus_Transparent.png"
                alt="Horus"
                width={333}
                height={122}
                loading="eager"
                priority
                className="object-contain"
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            {session?.session.impersonatedBy && (
              <span className="text-sm text-muted-foreground border-3 border-dashed border-restricted rounded-sm  px-2 py-1">
                Impersonating {session.user.name}
                <Button
                  variant="destructive"
                  className="ml-2"
                  onClick={() => authClient.admin.stopImpersonating()}
                >
                  Stop
                </Button>
              </span>
            )}
            <ThemeSwitcher />
            <SettingsModal />

            {session || isPending ? (
              <div className="flex items-center gap-2">
                <StreakNavbar
                  streakValue={session?.streak?.currentStreak || 0}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button type="button">
                        <div className="flex flex-row">
                          <Card className="flex items-center p-1  border ring-0 h-11">
                            <CardContent className="flex items-center gap-3 px-1 md:px-1s">
                              <Avatar>
                                <AvatarImage
                                  className="rounded-xs"
                                  src={session?.user.image || ""}
                                  alt={session?.user.name}
                                />
                                <AvatarFallback className="rounded-xs">
                                  {session?.user.name?.charAt(0) || "?"}
                                </AvatarFallback>
                              </Avatar>

                              <div className="text-left hidden md:block">
                                {isPending ? (
                                  <div className="flex flex-col gap-2 my-1">
                                    <Skeleton className="h-3 w-16" />
                                    <Skeleton className="h-2 w-20.5" />
                                  </div>
                                ) : (
                                  <>
                                    <p className="font-extrabold">
                                      {session?.user.name}{" "}
                                      {userIsSuperAdmin(session?.user.role) &&
                                        "⚡"}
                                    </p>
                                    <p className="text-xs text-muted-foreground capitalize">
                                      {session?.user.role}
                                    </p>
                                  </>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      </button>
                    }
                  />
                  <DropdownMenuContent className="w-40" align="start">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem onClick={handleSignOut}>
                        Logout
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <Button size="xl" className="text-md" onClick={handleLogin}>
                Sign in →
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className="border-b bg-card">
        <div className="max-w-6xl mx-auto flex flex-row items-center px-10">
          <PageButton path={"/"} displayName="Home" />
          <PageButton
            path={`/dashboard/${session?.preferences?.defaultHost}`}
            displayName="Dashboard"
            disabled={!isPending && !session?.preferences?.defaultHost}
          />
          <PageButton
            path={`/dashboard/${session?.preferences?.defaultHost}/review`}
            displayName="Review"
            disabled={!isPending && !session?.preferences?.defaultHost}
          />
          <Suspense fallback={null}>
            <SettingsButtonComponent />
          </Suspense>
          {userIsSuperAdmin(session?.user.role) && (
            <PageButton
              path={"/dashboard/admin"}
              displayName="Admin"
              superAdminOnly={true}
            />
          )}
        </div>
      </div>
    </>
  );
}

function PageButton({
  path,
  displayName,
  superAdminOnly = false,
  disabled = false,
}: {
  path: string;
  displayName: string;
  superAdminOnly?: boolean;
  disabled?: boolean;
}) {
  const { data: session } = authClient.useSession();

  if (superAdminOnly && !userIsSuperAdmin(session?.user.role)) {
    return null;
  }

  return (
    <Suspense
      fallback={<FallbackPageButtonComponent displayName={displayName} />}
    >
      <PageButtonComponent
        path={path}
        displayName={displayName}
        superAdminOnly={superAdminOnly}
        disabled={disabled}
      />
    </Suspense>
  );
}

function PageButtonComponent({
  path,
  displayName,
  isPending,
  disabled,
  superAdminOnly = false,
}: {
  path: string;
  displayName: string;
  isPending?: boolean;
  disabled?: boolean;
  superAdminOnly?: boolean;
}) {
  const router = useRouter();
  const pathName = usePathname();

  function isCurrentPage() {
    if (path === "/dashboard" && pathName.startsWith("/dashboard")) {
      if (pathName.includes("settings")) return false;
      if (pathName.includes("admin")) return false;
      return true;
    }
    return pathName === path;
  }

  return (
    <button
      type="button"
      onClick={() => router.push(path)}
      className={cn(
        "p-3 border-b-3 border-b-transparent text-muted-foreground",
        "disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed",
        isCurrentPage() && "border-b-primary text-foreground border-solid!",
        superAdminOnly && "border-b-3 border-restricted border-dashed",
      )}
      disabled={isPending || disabled}
    >
      {displayName}
    </button>
  );
}

function FallbackPageButtonComponent({ displayName }: { displayName: string }) {
  return (
    <div className="p-3 border-b-3 border-b-transparent text-muted-foreground">
      {displayName}
    </div>
  );
}

function SettingsButtonComponent() {
  const { data: session } = authClient.useSession();
  const { data: org } = authClient.useActiveOrganization();
  const pathname = usePathname();

  function canEditCurrentHost() {
    if (!session || !org) return false;
    if (!pathname) return false;

    const isAdminPage = pathname.startsWith("/dashboard/admin");
    const isSettingsPage = pathname.startsWith("/dashboard/settings");
    const isOnInstancePage = pathname.startsWith(`/dashboard/${org.slug}`);

    if (isAdminPage || isSettingsPage || isOnInstancePage) {
      return true;
    }

    return false;
  }

  if (canEditCurrentHost())
    return <PageButton path={"/dashboard/settings"} displayName="Settings" />;
  else return null;
}
