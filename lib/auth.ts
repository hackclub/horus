import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import {
  admin,
  customSession,
  genericOAuth,
  organization,
} from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schemas/auth-schema";
import {
  ac,
  admin as adminRole,
  helper as helperRole,
  sponsor,
} from "./auth-permissions";
import { redisSecondaryStorage } from "./auth-redis";

const CACHET_HOST = process.env.CACHET_HOST || "https://cachet.hackclub.com";

const additionalFields = {
  slack_id: {
    required: true,
    type: "string",
    unique: true,
  },
} as const;

// Type-only hint so customSession's callback sees the admin plugin's user
// fields (role, banned, ...) — the admin plugin registers them at runtime
// regardless; this object is never read.
const adminFieldsForTyping = {
  ...additionalFields,
  role: { type: "string", required: false },
  banned: { type: "boolean", required: false },
  banReason: { type: "string", required: false },
  banExpires: { type: "date", required: false },
} as const;

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...schema,
    },
  }),
  advanced: {
    ipAddress: {
      ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],
    },
  },
  user: {
    additionalFields,
  },
  session: {
    cookieCache: { enabled: true, maxAge: 60 * 5 }, // 5 min
  },
  secondaryStorage: redisSecondaryStorage,
  plugins: [
    genericOAuth({
      config: genericOAuthConfig(),
    }),
    admin({
      adminUserIds: process.env.SUPER_ADMIN_IDS?.split(",") || [],
    }),
    organization({
      allowUserToCreateOrganization: false,
      creatorRole: "sponsor",
      ac,
      roles: {
        helper: helperRole,
        admin: adminRole,
        sponsor,
      },
    }),
    customSession(
      async ({ user, session }) => {
        const userPrefs = await db.query.user_preferences.findFirst({
          where: { userId: user.id },
        });
        const userStreak = await db.query.user_streak_data.findFirst({
          where: { userId: user.id },
        });
        return {
          user,
          session,
          preferences: userPrefs ?? null,
          streak: userStreak ?? null,
        };
      },
      {
        user: {
          additionalFields: adminFieldsForTyping,
        },
      },
    ),
  ],
});

function genericOAuthConfig(): Parameters<typeof genericOAuth>[0]["config"] {
  return [
    {
      providerId: "hack-club",
      clientId: process.env.HACK_CLUB_AUTH_CLIENT || "",
      clientSecret: process.env.HACK_CLUB_AUTH_SECRET || "",
      discoveryUrl:
        "https://auth.hackclub.com/.well-known/openid-configuration",
      scopes: ["slack_id", "email", "openid"],
      getUserInfo: async (tokens) => {
        const authResponse = await fetch(
          "https://auth.hackclub.com/api/v1/me",
          {
            headers: {
              Authorization: `Bearer ${tokens.accessToken}`,
            },
          },
        );

        if (!authResponse.ok) {
          console.error("Failed to fetch user info:", authResponse.statusText);
          return null;
        }

        let userInfo = await authResponse.json();
        userInfo = userInfo.identity || userInfo;

        const cachetResponse = await fetch(
          `${CACHET_HOST}/users/${userInfo.slack_id}`,
        );

        if (!cachetResponse.ok) {
          console.error(
            "Failed to fetch Cachet user info:",
            cachetResponse.statusText,
          );
          return null;
        }

        const cachetData = await cachetResponse.json();

        return {
          id: userInfo.id,
          email: userInfo.primary_email,
          emailVerified: true,
          name: cachetData.displayName || userInfo.primary_email.split("@")[0],
          slack_id: userInfo.slack_id,
          image: cachetData.imageUrl,
        };
      },
    },
  ];
}
