export type NephthysUser = {
  id: number;
  slack_id: string;
  username?: string | null;
};

export type Helper = {
  id: number;
  slack_id: string;
  count: number;
};

export type CachetEnrichedHelper = Helper & {
  imageUrl: string;
  displayName: string;
};

export type Ticket = {
  id: number;
  title: string | null;
  status: "OPEN" | "CLOSED" | "IN_PROGRESS" | string;
  opened_by: NephthysUser | null;
  closed_by: NephthysUser | null;
  assigned_to: NephthysUser | null;
  reopened_by: NephthysUser | null;
  team_tags: string[];
  category_tag?: string | null;
  created_at: string;
  closed_at: string | null;
  message_ts: string;
  description?: string;
};

export type TimeDurations =
  | "5 Minutes"
  | "1 Hour"
  | "12 Hours"
  | "24 Hours"
  | "4 Days"
  | "7 Days"
  | "More";

// Used for Time-to-Resolution (TTR) calculations
export type TicketTTR = { name: TimeDurations; value: number; fill: string }[];

export type PeriodStats = {
  new_tickets_total: number;
  new_tickets_now_closed: number;
  new_tickets_still_open: number;
  new_tickets_in_progress: number;
  closed_today: number;
  closed_today_from_today: number;
  assigned_today_in_progress: number;
  helpers_leaderboard: Helper[];
  mean_hang_time_minutes_unresolved: number | null;
  mean_hang_time_minutes_all: number | null;
  mean_resolution_time_minutes: number | null;
};

export type Stats = {
  all_time: {
    tickets_total: number;
    tickets_open: number;
    tickets_closed: number;
    tickets_in_progress: number;
    helpers_leaderboard: Helper[];
    mean_hang_time_minutes_unresolved: number | null;
    mean_hang_time_minutes_all: number | null;
    mean_resolution_time_minutes: number | null;
    oldest_unanswered_ticket: {
      id: number;
      created_at: string;
      age_minutes: number;
      link: string;
    } | null;
  };
  past_24h: PeriodStats;
  past_24h_previous: PeriodStats;
  past_7d: PeriodStats;
  past_7d_previous: PeriodStats;
};

export type CachetEnrichedStats = Stats & {
  all_time: {
    helpers_leaderboard: CachetEnrichedHelper[];
  };
};
