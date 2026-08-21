import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function greet(name: string | undefined | null): string {
  const currentTime = new Date();
  const currentHour = currentTime.getHours();
  let greeting: string;

  if (currentHour < 6) {
    greeting = name ? `Still up, ${name}.` : "Still up?";
  } else if (currentHour < 12) {
    greeting = name ? `Morning, ${name}.` : "Good morning";
  } else if (currentHour < 18) {
    greeting = name ? `Afternoon, ${name}.` : "Good afternoon";
  } else {
    greeting = name ? `Evening, ${name}.` : "Good evening";
  }

  return greeting;
}

const CaughtUpTexts = [
  "You're all caught up!",
  "Keep it up!",
  "Nothing new yet!",
];

export function caughtUpText() {
  const randomIndex = Math.floor(Math.random() * CaughtUpTexts.length);
  return CaughtUpTexts[randomIndex];
}

const minute = 60,
  hour = minute * 60,
  day = hour * 24;

export function relativeTime(delta: number) {
  let since: string;

  if (delta < 30) {
    since = "just then.";
  } else if (delta < minute) {
    since = `${delta} seconds ago.`;
  } else if (delta < 2 * minute) {
    since = "a minute ago.";
  } else if (delta < hour) {
    since = `${Math.floor(delta / minute)} minutes ago.`;
  } else if (Math.floor(delta / hour) === 1) {
    since = "1 hour ago.";
  } else if (delta < day) {
    since = `${Math.floor(delta / hour)} hours ago.`;
  } else if (delta < day * 2) {
    since = "yesterday.";
  } else {
    since = `${Math.floor(delta / day)} days ago.`;
  }

  return since;
}

export function SlackChannelLink(
  channelId: string,
  deepLinking: boolean = true,
) {
  return deepLinking
    ? `slack://channel?team=E09V59WQY1E&id=${channelId}`
    : `https://hackclub.enterprise.slack.com/archives/${channelId}`;
}

export function SlackMessageLink(
  channelId: string,
  messageTs: string,
  deepLinking: boolean = true,
) {
  //! /p${messageTs.replace(".", "")} for normal link
  if (deepLinking)
    return `${SlackChannelLink(channelId, deepLinking)}&thread_ts=${messageTs}`;
  else
    return `${SlackChannelLink(channelId, deepLinking)}/p${messageTs.replace(".", "")} `;
}

export function userIsSuperAdmin(role: string | null | undefined): boolean {
  return role === "admin";
}
