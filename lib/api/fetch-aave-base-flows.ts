// The Lifetime flows summary of an Aave V3 Base or Seamless account, from
// rails-server GET /api/{aave-v3-base,seamless}/flows/daily through the Next
// hop (lib/api/aave-base-flows-route.ts): the replay of every row the Base
// box holds, reduced to the summary lib/aave-v3-base/flows.ts draws. The
// panel reads it where the page's history is elided (rails-ops
// reference/lifetime-flows-scrubber.md, "Aave V3 on Base and Seamless").

import type { AaveBaseSummary } from "@/lib/aave-v3-base/flows";
import type { FocusEvent } from "@/lib/shared/flow-focus";

/** The counts the Explanation states, as the route counts them. */
export interface AaveBaseRouteFacts {
  priced: { block: number; day: number; nearest: number; today: number };
  liquidations: number;
  aTokenSeizures: number;
  treasuryFees: number;
  transfersIn: number;
  transfersOut: number;
  interestRows: number;
}

export type AaveBaseFlowAnswer =
  | (AaveBaseSummary & {
      wallet: string;
      /** The newest events' legs, for the timeline's cards. */
      events: FocusEvent[];
      facts: AaveBaseRouteFacts;
      stats?: { rows: number; ms: number };
    })
  /** The history is not whole on the Base box (its backfill or its aToken
   *  transfers), it holds more rows than the route replays, or the server
   *  has no such route. */
  | { wallet: string; refused: "coverage" | "unavailable" }
  | { wallet: string; refused: "rows"; rows: number; cap: number }
  /** The server is replaying a heavy wallet's history in the background:
   *  `storedRows` of its `rows` are in. Asking again answers once it is built. */
  | { wallet: string; refused: "building"; rows: number; storedRows: number };

export const isAaveBaseSummaryAnswer = (a: AaveBaseFlowAnswer): a is Extract<AaveBaseFlowAnswer, { days: unknown }> =>
  !("refused" in a);

/** GET the summary: `lane` is the Next hop's ("aave-v3-base", "seamless"). */
export async function fetchAaveBaseFlows(
  lane: "aave-v3-base" | "seamless",
  wallet: string,
  signal?: AbortSignal,
): Promise<AaveBaseFlowAnswer> {
  const res = await fetch(`/api/${lane}/flows?wallet=${wallet.toLowerCase()}`, { signal });
  if (!res.ok) throw new Error(`fetchAaveBaseFlows ${lane} failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as AaveBaseFlowAnswer;
}

/** A page of the cards' flows older than the summary's newest events
 *  (rails-server GET /api/{aave-v3-base,seamless}/flows/events): the `limit`
 *  events just older than `before`, oldest first, with the summary's ids;
 *  `next` is the `before` of the page after, null at the first event. */
export type AaveBaseFlowEventsAnswer =
  | { wallet: string; totalEvents: number; older: number; next: string | null; events: FocusEvent[] }
  | { wallet: string; refused: "coverage" | "unavailable" | "rows" | "building" }
  /** No event has the cursor: the history changed since the summary. */
  | { wallet: string; unknownBefore: true };

/** GET a page; `before` is an event id from the summary or an earlier page. */
export async function fetchAaveBaseFlowEvents(
  lane: "aave-v3-base" | "seamless",
  wallet: string,
  before: string,
  limit: number,
  signal?: AbortSignal,
): Promise<AaveBaseFlowEventsAnswer> {
  const q = new URLSearchParams({ wallet: wallet.toLowerCase(), before, limit: String(limit) });
  const res = await fetch(`/api/${lane}/flows/events?${q}`, { signal });
  if (res.status === 404) return (await res.json()) as AaveBaseFlowEventsAnswer;
  if (!res.ok) throw new Error(`fetchAaveBaseFlowEvents ${lane} failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as AaveBaseFlowEventsAnswer;
}
