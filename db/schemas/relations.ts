import { defineRelations } from "drizzle-orm";
import {
  account,
  invitation,
  member,
  organization,
  session,
  user,
  user_preferences,
  user_streak_data,
  verification,
} from "./auth-schema";
import {
  instance,
  marmalade_data,
  marmalade_key,
  nephthys_host,
} from "./instance-schema";

export const relations = defineRelations(
  {
    user,
    user_preferences,
    user_streak_data,
    session,
    account,
    organization,
    member,
    invitation,
    verification,
    instance,
    nephthys_host,
    marmalade_data,
    marmalade_key,
  },
  (r) => ({
    // auth-schema.ts
    user: {
      sessions: r.many.session(),
      accounts: r.many.account(),
      preferences: r.one.user_preferences(),
      streak: r.one.user_streak_data(),
      members: r.many.member(),
      invitations: r.many.invitation(),
    },
    session: {
      user: r.one.user({ from: r.session.userId, to: r.user.id }),
    },
    account: {
      user: r.one.user({ from: r.account.userId, to: r.user.id }),
    },
    user_preferences: {
      user: r.one.user({ from: r.user_preferences.userId, to: r.user.id }),
    },
    user_streak_data: {
      user: r.one.user({ from: r.user_streak_data.userId, to: r.user.id }),
    },
    organization: {
      members: r.many.member(),
      invitations: r.many.invitation(),
      instance: r.one.instance({
        from: r.organization.id,
        to: r.instance.organizationId,
      }),
    },
    member: {
      organization: r.one.organization({
        from: r.member.organizationId,
        to: r.organization.id,
      }),
      user: r.one.user({ from: r.member.userId, to: r.user.id }),
    },
    invitation: {
      organization: r.one.organization({
        from: r.invitation.organizationId,
        to: r.organization.id,
      }),
      user: r.one.user({ from: r.invitation.inviterId, to: r.user.id }),
    },

    // instance-schema.ts
    instance: {
      organization: r.one.organization({
        from: r.instance.organizationId,
        to: r.organization.id,
      }),
      nephthys_host: r.one.nephthys_host({
        from: r.instance.id,
        to: r.nephthys_host.instanceId,
      }),
      marmalade_data: r.one.marmalade_data({
        from: r.instance.id,
        to: r.marmalade_data.instanceId,
      }),
    },
    nephthys_host: {
      instance: r.one.instance(),
    },
    marmalade_data: {
      instance: r.one.instance(),
    },
    marmalade_key: {
      instance: r.one.instance({
        from: r.marmalade_key.instanceId,
        to: r.instance.id,
      }),
      user: r.one.user({ from: r.marmalade_key.userId, to: r.user.id }),
    },
  }),
);
