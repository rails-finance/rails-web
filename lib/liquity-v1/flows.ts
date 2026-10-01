// Lifetime flows for a Liquity V1 Trove life: the page's rows mapped onto the
// Liquity family's replay (lib/shared/liquity-flows.ts; rails-ops
// reference/lifetime-flows-scrubber.md, "Liquity V1").
// ----------------------------------------------------------------------------
// Each row states the Trove's collateral and debt after it (TroveUpdated). V1
// charges no interest, so the debt moves only by:
//
//     debt after − debt before = act + borrowing fee + redistributed debt ± reserve
//
//   • the borrowing fee: the transaction receipt's LUSDBorrowingFeePaid for the
//     owner (the receipt read, /api/chain/liquity-v1/event); unread, it stays
//     in Borrowed and is counted;
//   • the reserve: the 200 LUSD liquidation reserve every open adds to the
//     debt, burned when the owner closes the Trove or a redemption cancels the
//     last of its debt ("Reserve burned"); a liquidation pays it to the
//     liquidator, so there it is part of the debt liquidated;
//   • redistribution: eventless. A liquidation the Stability Pool cannot cover
//     raises the system's L_ETH and L_LUSDDebt, and each Trove takes its share
//     at its next touch. The TroveManager then emits a TroveUpdated with the
//     operation applyPendingRewards (the index's `accrue` row) stating the
//     balances with the gains applied, ahead of the touch's own row. The step
//     from the last recorded balances to that row's is the redistribution, put
//     on the touch's "Redistribution gains" / "Redistributed debt". A pending
//     share a liquidation or a full redemption takes with it is not on the
//     rows (TroveLiquidated states the whole; the rows state the recorded
//     part). L_ETH and L_LUSDDebt read zero at block 26,098,636 (1 Oct 2026):
//     no V1 liquidation has ever been redistributed.
//
// Prices: ETH at Liquity's PriceFeed price at the event's block — on the
// redemption and liquidation rows (server mig 110), else the receipt read's
// lastGoodPrice; unread, the day's closing price where Liquity V2's WETH
// branch recorded one, else the nearest recorded event's.
//
// Pure: tested offline in scripts/verify/verify-liquity-flows.ts.

import type { BaseActivityEvent, LiquityV1Context } from "@/lib/shared/types/event-shape";
import { isLiquityV1Event } from "@/lib/shared/types/event-shape";
import type { LiquityFlowEvent } from "@/lib/shared/liquity-flows";
import { LIQUITY_V1_RESERVE, redemptionSplit } from "@/lib/liquity-v1/event-figures";

const DAY_S = 86_400;
const EPS = 1e-9;

/** What a receipt read adds to an owner's event. */
export interface LiquityV1FlowRead {
  /** PriceFeed.lastGoodPrice at the block. */
  priceUsd: number | null;
  /** LUSDBorrowingFeePaid for the owner; null where the transaction drew none. */
  borrowingFee: string | null;
}

export interface LiquityV1FlowInput {
  /** The life's rows, as the page holds them. */
  events: BaseActivityEvent[];
  /** Receipt reads by transaction hash (lower case). */
  reads: Map<string, LiquityV1FlowRead> | null;
  /** ETH's closing price per UTC day, `[day, usd]` ascending (Liquity V2's
   *  WETH branch), where the page read it. */
  daily: [number, number][] | null;
  /** The ETH the life's closing transaction left in the CollSurplusPool. */
  surplus: { tx: string; eth: number } | null;
}

export interface LiquityV1FlowEvents {
  events: LiquityFlowEvent[];
  /** How the events' ETH prices were found. */
  prices: { block: number; dayClose: number; nearest: number };
  /** Draws whose receipt was not read: their fee stays in Borrowed. */
  feesUnread: number;
  /** Rows that applied redistribution gains. */
  redistributions: number;
}

const num = (s: string | undefined | null): number => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

/** The owner transactions whose receipts the flows read: every open, adjust
 *  and close, draws first (their fee), at most `cap`. */
export function liquityV1FlowTxs(events: BaseActivityEvent[], cap = 250): string[] {
  const draws: string[] = [];
  const rest: string[] = [];
  const seen = new Set<string>();
  for (const e of events) {
    if (!isLiquityV1Event(e) || !e.txHash) continue;
    const c = e.context.data;
    if (c.eventType !== "openTrove" && c.eventType !== "adjustTrove" && c.eventType !== "closeTrove") continue;
    if (c.priceAtBlock?.usd) continue;
    const tx = e.txHash.toLowerCase();
    if (seen.has(tx)) continue;
    seen.add(tx);
    (num(c.debtDelta) > EPS ? draws : rest).push(tx);
  }
  return [...draws, ...rest].slice(0, cap);
}

export function liquityV1FlowEvents(input: LiquityV1FlowInput): LiquityV1FlowEvents {
  const daily = new Map(input.daily ?? []);
  const prices = { block: 0, dayClose: 0, nearest: 0 };
  let feesUnread = 0;
  let redistributions = 0;
  const out: LiquityFlowEvent[] = [];
  // The balances the last mapped event left, and the redistribution an
  // applyPendingRewards row has applied since.
  let coll = 0;
  let debt = 0;
  let gain = { coll: 0, debt: 0 };
  const feeTaken = new Set<string>();
  for (const e of input.events) {
    if (!isLiquityV1Event(e)) continue;
    const c: LiquityV1Context = e.context.data;
    const collAfter = num(c.collAfter);
    const debtAfter = num(c.debtAfter);
    // The index's `accrue` row: the TroveManager's applyPendingRewards.
    if ((c.eventType as string) === "accrue") {
      gain = { coll: collAfter - coll, debt: debtAfter - debt };
      continue;
    }
    const tx = (e.txHash ?? "").toLowerCase();
    const read = input.reads?.get(tx) ?? null;
    const kind: LiquityFlowEvent["kind"] =
      c.eventType === "redemption" ? "redemption" : c.eventType === "liquidation" ? "liquidation" : "owner";
    const own = c.priceAtBlock?.usd ?? read?.priceUsd ?? null;
    const dayClose = daily.get(Math.floor(e.timestamp / DAY_S)) ?? null;
    const price = own != null && own > 0 ? own : dayClose;
    if (own != null && own > 0) prices.block++;
    else if (dayClose != null) prices.dayClose++;
    else prices.nearest++;

    const redistColl = Math.max(0, gain.coll);
    const redistDebt = Math.max(0, gain.debt);
    if (redistColl > EPS || redistDebt > EPS) redistributions++;
    // The debt's move past the redistribution: the act, the fee, the reserve.
    const moved = debtAfter - debt - redistDebt;
    const closes = debtAfter <= EPS && collAfter <= EPS;
    let reserve = 0;
    if (c.eventType === "openTrove") reserve = LIQUITY_V1_RESERVE;
    else if (closes && (c.eventType === "closeTrove" || c.eventType === "redemption"))
      reserve = -Math.min(LIQUITY_V1_RESERVE, debt + redistDebt);
    let fee = 0;
    if (kind === "owner" && moved - reserve > EPS) {
      if (read == null) feesUnread++;
      else if (read.borrowingFee != null && !feeTaken.has(tx)) {
        fee = Math.min(Math.max(0, num(read.borrowingFee)), moved - reserve);
        feeTaken.add(tx);
      }
    }
    let surplus = 0;
    if (closes && (kind === "liquidation" || kind === "redemption")) {
      if (input.surplus && input.surplus.tx.toLowerCase() === tx) surplus = input.surplus.eth;
      else if (kind === "redemption") surplus = redemptionSplit(c)?.ethSurplus ?? 0;
    }
    out.push({
      id: e.id,
      ts: e.timestamp,
      block: e.blockNumber,
      tx: e.txHash,
      kind,
      collAfter,
      debtAfter,
      collBefore: coll,
      debtBefore: debt,
      collOp: null,
      debtOp: moved - fee - reserve,
      upfrontFee: fee,
      collFromRedist: redistColl,
      debtFromRedist: redistDebt,
      surplus,
      price: price != null && price > 0 ? price : null,
      rate: 0,
      fee: 0,
      ...(reserve !== 0 ? { reserve } : {}),
    });
    coll = collAfter;
    debt = debtAfter;
    gain = { coll: 0, debt: 0 };
  }
  return { events: out, prices, feesUnread, redistributions };
}
