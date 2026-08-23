import type { PostHogEntities } from "@flags-sdk/posthog";
import { createPostHogAdapter } from "@flags-sdk/posthog";
import type { Identify } from "flags";
import { flag } from "flags/next";
import { auth } from "./auth";

export const identify: Identify<PostHogEntities> = async ({ headers }) => {
  const session = await auth.api.getSession({ headers });
  return { distinctId: session?.user?.id || "anon" };
};

const postHogAdapter = createPostHogAdapter({
  postHogKey: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || "",
  postHogOptions: {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "",
  },
});

export const marmaladeFlag = flag({
  key: "marmalade",
  defaultValue: false,
  adapter: postHogAdapter,
  identify,
});

export const streakFlag = flag({
  key: "streak",
  defaultValue: false,
  adapter: postHogAdapter,
  identify,
});
