// ============================================================================
// FETCH AAVE V4
// ============================================================================
//
// Thin typed clients over /api/aave-v4/timeline and /api/aave-v4/positions.
// From the browser both go via the Next route handlers, which attach the bearer
// token and forward to the rails-server-onboarding Express endpoints. A server
// component passes `baseUrl` + `headers`: the box's own origin with bearer auth
// (`boxHop`, the cheaper path where the proxy only forwards), or this
// deployment's origin with the signed reader headers (`ssrHop`). The paths are
// the same either way, which is what lets one client serve both.
//
// Wire-format contracts:
//   /timeline → BaseActivityEvent[] with AaveV4Context attached. Match the
//     rails-server-onboarding api/src/routes/aaveV4.ts TimelineResponse type.
//     `recent` asks for a WINDOW of the newest N events; without it the box
//     answers the whole history, which its rate limiter counts in the
//     60-a-minute whole-history bucket (rails-ops decisions/0019). A position
//     page passes the window; the CSV export is what asks whole, once.
//   /positions → flat list of (spoke, reserve) rows; one entry per non-zero
//     supply/debt pair from mv_aave_v4_positions.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { settleFetchMark } from "@/lib/perf/settle-marks";

export interface FetchAaveV4TimelineResult {
  wallet: string;
  /** What this answer CARRIES: the whole history, or the newest window of it. */
  events: BaseActivityEvent[];
  /** What the wallet HAS across every spoke, counted before the window. */
  totalEvents: number;
  /** What each spoke has, keyed by the display name the events carry ("Main",
   *  "Kelp"). Absent on a whole-history answer, where the drawn events are
   *  already the count. A spoke page reads its own entry to number its rows
   *  over the whole history and to say what sits below the cut. */
  eventsBySpoke?: Record<string, number>;
  /** Where `recent` drew the line: `events` holds every event from this block
   *  onward. Null when no window was asked for, and when the wallet holds
   *  fewer events than the window — then the events ARE the history. */
  cutoffBlock?: number | null;
}

export interface AaveV4Position {
  spoke: string;
  spokeName: string;
  reserveId: string;
  reserveSymbol: string;
  reserveAddress: string;
  reserveDecimals: number;
  /** Human-readable supply balance. */
  supply: string;
  /** Human-readable debt balance. */
  debt: string;
  lastActivityAt: number;
  lastBlockNumber: number;
  lastTxHash: string | null;
}

export interface FetchAaveV4PositionsResult {
  wallet: string;
  positions: AaveV4Position[];
}

export interface FetchAaveV4Params {
  wallet: string;
  /** SSR override — server components calling the Next API route directly
   *  need an absolute origin since `fetch` in node has no implicit base. */
  baseUrl?: string;
  /** The headers a server render's hop carries, naming the reader to whatever
   *  answers (lib/shared/listing-ssr.ts `ssrHop` / `boxHop`). */
  headers?: HeadersInit;
}

export interface FetchAaveV4TimelineParams extends FetchAaveV4Params {
  /** Ask for a WINDOW of the most recent N events instead of the whole
   *  history. The response says where the window opened and what the wallet
   *  holds, per spoke, so the page can number its rows over the whole life.
   *  Omitted keeps the whole-history fetch — which is what the CSV export
   *  wants and what the box's whole-history budget is counting. */
  recent?: number;
}

export async function fetchAaveV4Timeline({
  wallet,
  baseUrl = "",
  headers,
  recent,
}: FetchAaveV4TimelineParams): Promise<FetchAaveV4TimelineResult> {
  const recentQs = recent ? `&recent=${encodeURIComponent(String(recent))}` : "";
  const url = `${baseUrl}/api/aave-v4/timeline?wallet=${encodeURIComponent(wallet)}${recentQs}`;
  const done = settleFetchMark("aave-v4-timeline");
  const res = await fetch(url, { cache: "no-store", headers });
  if (!res.ok) {
    done(false);
    throw new Error(`fetchAaveV4Timeline failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as FetchAaveV4TimelineResult;
  done(true);
  return json;
}

export async function fetchAaveV4Positions({
  wallet,
  baseUrl = "",
  headers,
}: FetchAaveV4Params): Promise<FetchAaveV4PositionsResult> {
  const url = `${baseUrl}/api/aave-v4/positions?wallet=${encodeURIComponent(wallet)}`;
  const res = await fetch(url, { cache: "no-store", headers });
  if (!res.ok) {
    throw new Error(`fetchAaveV4Positions failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as FetchAaveV4PositionsResult;
}
