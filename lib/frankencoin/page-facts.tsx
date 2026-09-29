"use client";

// What one Frankencoin event card needs from the rest of the position's page:
// when each challenge started and who started it (the averted and succeeded
// rows name neither), the position's phase length (one challenge period), what
// else each transaction recorded (a settlement row belongs to a challenge sale
// or to a forced sale), the forced sales in order, and one sale from this
// position's own history to work through in the challenge modal. Built from
// the timeline and the chain read; a card rendered without the provider (the
// per-event share route) falls back to the general wording.

import { createContext, useContext } from "react";

export { dateTimeText, phaseText, spanText } from "@/lib/frankencoin/figures";
import type { BaseActivityEvent, FrankencoinContext } from "@/lib/shared/types/event-shape";
import type { FrankencoinOpeningRead } from "@/lib/sources/chain/frankencoin-event";

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

/** One forced sale on this position, oldest first. */
export interface FrankencoinForcedSaleFact {
  txHash: string;
  timestamp: number;
  blockNumber: number;
  /** Collateral sold, whole units. */
  amount: number;
  /** The transaction's sender. */
  caller: string | null;
  /** The row itself, for its receipt read. */
  eventId: string;
  ctx: FrankencoinContext;
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
  forcedSales: FrankencoinForcedSaleFact[];
  /** Collateral each transaction's sales sold (forced sale amounts and
   *  challenge slices), whole units, keyed by tx hash. */
  txSold: Record<string, number>;
  /** When the position was denied, if it was. */
  deniedAt: number | null;
  /** The owner the creating transaction handed the position to. */
  createdFor: string | null;
  /** An original's opening transaction and terms, from its receipt and reads
   *  at the opening block (the position page supplies it). */
  opening?: FrankencoinOpeningRead | null;
  openingPending?: boolean;
  /** When the declared price was raised (each raise pauses minting and
   *  withdrawals for three days), oldest first. */
  priceRaises: number[];
  /** When collateral left the position by the owner's hand (a withdrawal, an
   *  adjust or a close), oldest first. */
  withdrawals: number[];
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
  const forcedSales: FrankencoinForcedSaleFact[] = [];
  const txSold: Record<string, number> = {};
  let deniedAt: number | null = null;
  let createdFor: string | null = null;
  const priceRaises: number[] = [];
  const withdrawals: number[] = [];
  for (const e of events) {
    const ctx = e.context.data;
    const priceBefore = Number(ctx.liqPriceBefore ?? NaN);
    const priceAfter = Number(ctx.liqPrice ?? NaN);
    if (!ctx.firstState && priceBefore > 0 && priceAfter > priceBefore) priceRaises.push(e.timestamp);
    const collBefore = Number(ctx.collateralBefore ?? NaN);
    const collAfter = Number(ctx.collateral ?? NaN);
    if (
      (ctx.eventType === "withdraw_collateral" || ctx.eventType === "adjust" || ctx.eventType === "close") &&
      !ctx.collateralUnderstated &&
      collAfter < collBefore
    )
      withdrawals.push(e.timestamp);
    if (ctx.eventType === "ownership_transferred" && ctx.initialization)
      createdFor = ctx.handoverOwner ?? ctx.newOwner ?? createdFor;
    if (ctx.eventType === "denied" && deniedAt == null) deniedAt = e.timestamp;
    (txKinds[e.txHash] ??= []).push(ctx.eventType);
    const sold =
      ctx.eventType === "forced_sale"
        ? Number(ctx.forcedSaleAmount ?? 0)
        : ctx.eventType === "challenge_succeeded"
          ? Number(ctx.acquiredCollateral ?? 0)
          : 0;
    if (sold > 0) txSold[e.txHash] = (txSold[e.txHash] ?? 0) + sold;
    if (ctx.eventType === "forced_sale")
      forcedSales.push({
        txHash: e.txHash,
        timestamp: e.timestamp,
        blockNumber: e.blockNumber,
        amount: Number(ctx.forcedSaleAmount ?? 0),
        caller: ctx.txFrom ?? null,
        eventId: e.id,
        ctx,
      });
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
  forcedSales.sort((a, b) => a.blockNumber - b.blockNumber || a.timestamp - b.timestamp);
  priceRaises.sort((a, b) => a - b);
  withdrawals.sort((a, b) => a - b);
  return {
    priceRaises,
    withdrawals,
    challengePeriod,
    familyOriginal,
    challenges,
    txKinds,
    saleExample,
    forcedSales,
    txSold,
    deniedAt,
    createdFor,
  };
}
