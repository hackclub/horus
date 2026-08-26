"use server";

import { cacheLife } from "next/cache";
import { toErrorResponse } from "@/lib/errors";
import {
  getStats,
  getTickets,
  getTicketsTTR,
  type NephthysTicketFilter,
} from "@/lib/nephthys";
import type { ErrorResponse } from "@/types/error";
import type { CachetEnrichedStats, Ticket, TicketTTR } from "@/types/nephthys";

export async function fetchNephthysStats(
  nephthysHost: string,
): Promise<CachetEnrichedStats | ErrorResponse> {
  "use cache";
  cacheLife("seconds");
  try {
    return await getStats(nephthysHost);
  } catch (error) {
    return toErrorResponse(`nephthys stats (${nephthysHost})`, error);
  }
}

export async function fetchNephthysTickets(
  nephthysHost: string,
  filter?: NephthysTicketFilter,
  skipCache = false,
): Promise<ErrorResponse | Ticket[]> {
  try {
    return await getTickets(nephthysHost, filter, skipCache);
  } catch (error) {
    return toErrorResponse(`nephthys tickets (${nephthysHost})`, error);
  }
}

export async function fetchNephthysTicketsTTR(
  nephthysHost: string,
): Promise<ErrorResponse | TicketTTR> {
  "use cache";
  cacheLife("minutes");
  try {
    return await getTicketsTTR(nephthysHost);
  } catch (error) {
    return toErrorResponse(`nephthys ticket TTR (${nephthysHost})`, error);
  }
}
