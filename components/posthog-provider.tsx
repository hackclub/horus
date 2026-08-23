"use client";

import { posthog } from "posthog-js";
import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";

export function PosthogProvider() {
  const { data: session } = authClient.useSession();
  useEffect(() => {
    if (session?.user.id) {
      posthog.identify(session.user.id, {
        name: session.user.name,
        email: session.user.email,
      });
    }
  }, [session?.user]);

  return null;
}
