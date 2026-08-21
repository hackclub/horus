"use client";

import Image from "next/image";
import { useTheme } from "next-themes";

export function Footer() {
  const lastCommitName =
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_MESSAGE || "unknown";
  const lastCommitSha =
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "unknown";
  const theme = useTheme();

  return (
    <div className="flex flex-col items-center justify-center border-t py-12 mt-6 bg-card">
      {theme.theme === "light" ? (
        <Image
          src="/HorusDashboard_Transparent_Dark.png"
          alt="Horus"
          width={817 / 2.5}
          height={123 / 2.5}
          loading="eager"
        />
      ) : (
        <Image
          src="/HorusDashboard_Transparent.png"
          alt="Horus"
          width={817 / 2.5}
          height={123 / 2.5}
          loading="eager"
        />
      )}
      <a
        href={`https://github.com/lazylllama/horus-dashboard/commit/${lastCommitSha}`}
        className="text-muted-foreground pt-4 hover:underline"
      >
        {lastCommitName} ({lastCommitSha.slice(0, 7)})
      </a>
    </div>
  );
}
