"use client";

// What one Frankencoin event card needs from the rest of the position's page:
// when each challenge started and who started it (the averted and succeeded
// rows name neither), the position's phase length (one challenge period), what
// else each transaction recorded (a settlement row belongs to a challenge sale
// or to a forced sale), and one sale from this position's own history to work
// through in the challenge modal. Built from the timeline and the chain read;
// a card rendered without the provider (the per-event share route) falls back
// to the general wording.

import { createContext, useContext } from "react";

export { dateTimeText, phaseText, spanText } from "@/lib/frankencoin/figures";
import type { BaseActivityEvent, FrankencoinContext } from "@/lib/shared/types/event-shape";

export interface FrankencoinChallengeFacts {
  start: number;
  challenger: string | null;
}

/** A phase-2 sale on this position, for the modal's worked example. */
export interface FrankencoinSaleExample {
  number: string;
  symbol: string;
  /** The declared price in force, ZCHF per unit. */
  liqPrice: number;
  /** One phase, seconds. */
  phase: number;
  startedAt: number;
  soldAt: number;
  bid: number;
  sold: number;
}

export interface FrankencoinPageFacts {
  challengePeriod: number | null;
  /** The family's original (the chain's original()), for a clone's lineage. */
  familyOriginal: string | null;
  /** Keyed `${hub}|${number}`. */
  challenges: Record<string, FrankencoinChallengeFacts>;
  /** The kinds each transaction recorded, keyed by tx hash. */
  txKinds: Record<string, string[]>;
  saleExample: FrankencoinSaleExample | null;
}

const FactsContext = createContext<FrankencoinPageFacts | null>(null);

export const FrankencoinPageFactsProvider = FactsContext.Provider;

export function useFrankencoinPageFacts(): FrankencoinPageFacts | null {
  return useContext(FactsContext);
}

export const challengeKey = (ctx: Pick<FrankencoinContext, "hub" | "challengeNumber">): string =>
  `${ctx.hub}|${ctx.challengeNumber ?? ""}`;

export function frankencoinPageFacts(
  events: (BaseActivityEvent & { context: { protocol: "frankencoin"; data: FrankencoinContext } })[],
  challengePeriod: number | null,
  familyOriginal: string | null,
): FrankencoinPageFacts {
  const challenges: Record<string, FrankencoinChallengeFacts> = {};
  const txKinds: Record<string, string[]> = {};
  for (const e of events) {
    const ctx = e.context.data;
    (txKinds[e.txHash] ??= []).push(ctx.eventType);
    if (ctx.eventType === "challenge_started" && ctx.challengeNumber != null)
      challenges[challengeKey(ctx)] = { start: e.timestamp, challenger: ctx.challenger ?? null };
  }
  let saleExample: FrankencoinSaleExample | null = null;
  if (challengePeriod != null && challengePeriod > 0) {
    for (const e of events) {
      const ctx = e.context.data;
      if (ctx.eventType !== "challenge_succeeded") continue;
      const started = challenges[challengeKey(ctx)];
      const settlement = events.find((s) => s.txHash === e.txHash && s.context.data.eventType === "auction_settlement")
        ?.context.data;
      const liqPrice = Number(settlement?.liqPriceBefore ?? settlement?.liqPrice ?? NaN);
      const bid = Number(ctx.bid ?? NaN);
      const sold = Number(ctx.acquiredCollateral ?? NaN);
      if (!started || !(liqPrice > 0) || !(bid > 0) || !(sold > 0)) continue;
      if (e.timestamp <= started.start + challengePeriod) continue;
      // The latest sale on the position is the one a reader has just looked at.
      saleExample = {
        number: ctx.challengeNumber ?? "",
        symbol: ctx.collateralSymbol,
        liqPrice,
        phase: challengePeriod,
        startedAt: started.start,
        soldAt: e.timestamp,
        bid,
        sold,
      };
    }
  }
  return { challengePeriod, familyOriginal, challenges, txKinds, saleExample };
}
