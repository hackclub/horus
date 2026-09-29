import { boolean, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { organization, user } from "./auth-schema";

export const instance = pgTable("instance", {
  id: text("id").primaryKey(),
  name: text("name"),
  organizationId: text("organization_id").references(() => organization.id, {
    onDelete: "cascade",
  }),
  deprecated: boolean("deprecated").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const nephthys_host = pgTable("nephthys_host", {
  instanceId: text("instance_id")
    .primaryKey()
    .references(() => instance.id, { onDelete: "cascade" })
    .unique(),
  host: text("host").notNull(),
  slackChannel: text("slack_channel").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const marmalade_data = pgTable("marmalade", {
  instanceId: text("instance_id")
    .primaryKey()
    .references(() => instance.id, { onDelete: "cascade" })
    .unique(),
  mailboxId: text("mailbox_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const marmalade_key = pgTable(
  "marmalade_key",
  {
    keyId: text("key_id").primaryKey(),
    instanceId: text("instance_id").references(() => instance.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    apiKey: text("api_key").notNull(),
    version: text("version").default("v1"), // TODO: Move to KMS?
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (t) => [unique().on(t.instanceId, t.userId)],
);

// One Nephthys API key per instance, set by an instance admin. Nephthys keys
// are per host (a key for one instance doesn't work on another) and unlock
// Slack message content, so the key is stored encrypted, only used
// server-side, and message text is only shown to members of the instance.
export const nephthys_key = pgTable("nephthys_key", {
  instanceId: text("instance_id")
    .primaryKey()
    .references(() => instance.id, { onDelete: "cascade" }),
  apiKey: text("api_key").notNull(),
  keyHint: text("key_hint").notNull(), // censored, safe to show
  // The host the key was checked against. If the instance is later pointed
  // at another host, the key is not sent there.
  host: text("host").notNull(),
  setBy: text("set_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// Per-user Hack Club AI (ai.hackclub.com) key and model choice.
export const ai_settings = pgTable("ai_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  apiKey: text("api_key").notNull(),
  keyHint: text("key_hint").notNull(),
  model: text("model"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});
