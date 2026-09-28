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

// Nephthys API keys are per instance (a key for one host doesn't work on
// another), so one row per user per instance. The key unlocks Slack message
// content, so it's stored encrypted and only ever used server-side.
export const nephthys_key = pgTable(
  "nephthys_key",
  {
    keyId: text("key_id").primaryKey(),
    instanceId: text("instance_id")
      .notNull()
      .references(() => instance.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    apiKey: text("api_key").notNull(),
    keyHint: text("key_hint").notNull(), // censored, safe to show
    // The host the key was checked against. If an admin later points the
    // instance at another host, the key is not sent there.
    host: text("host").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (t) => [unique().on(t.instanceId, t.userId)],
);

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
