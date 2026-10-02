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
  | { wallet: string; refused: "rows"; rows: number; cap: number };

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
