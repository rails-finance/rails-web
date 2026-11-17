// Polaris — a position against holding the pETH it deposited (ui-jobs 695).
// ----------------------------------------------------------------------------
// The since-open window (lib/polaris/since-last-touch.ts) needs the feed at the
// open, so it is stated only on a position touched once. This figure needs only
// the feed now, so it is stated on every position:
//
//   gain (pETH) = (collateral now + withdrawn + surplus − deposited)
//                 + (borrowed − repaid − debt now) ÷ feed now
//
// in pETH, against the pETH deposited. Every term but the feed is a quantity:
//
//   collateral now  getCDPEntireColl(id) at the head block; 0 once closed
//   debt now        getCDPEntireDebt(id), counted as zero at or below zero, as
//                   the card's equity counts it; 0 once closed
//   deposited …     the holder's own legs (`collChange`, `debtChange`) summed
//                   over every touch (polarisLifetime). A liquidation's seizure
//                   and cleared debt are not the holder's, so they are left out.
//   surplus         a liquidation's `_collSurplus`: paid to the owner when
//                   claimed, and owed to the owner until then, so it counts
//                   claimed or not.
//
// Interest, stability gains, reward pETH, PSM shares and redistributions need
// no term: each is in the collateral and debt now (or, once closed, in the
// close's own legs). A debt a PSM share took below zero is settled to zero by
// the next touch, so the stables minted for it are not counted either.
//
// The 0.0375 pETH gas compensation escrow sits outside the CDP's collateral
// (`getCDP(id).gasCompDeposit`), so no leg carries it and the figure leaves it
// out, as the since-open window does.
//
// On a position touched once, gain × feed now equals the since-open window's
// protocol term: the window's total less its feed term.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isPolarisEvent } from "@/lib/shared/types/event-shape";
import { polarisLifetime } from "@/lib/polaris/economics";

/** The head read's fields this needs: a structural subset of
 *  PolarisChainResponse, so the export and the tests pass a plain object. */
export interface PolarisHoldingChain {
  blockNumber: number;
  blockTimestamp: number;
  isOpen: boolean;
  chainStale?: boolean;
  recordedColl: number;
  recordedDebt: number;
  entireColl: number;
  entireDebt: number;
  lastTouchTime: number;
  price?: { pethInDebt: number } | null;
}

export interface PolarisAgainstHolding {
  /** pETH in the market's stablecoin at the head block, and that block. */
  feed: { pethInDebt: number; block: number; timestamp: number };
  /** The index's last touch closed or liquidated the position. */
  closed: boolean;
  collNow: number;
  /** getCDPEntireDebt(id) as read, and as counted (zero at or below zero). */
  debtNowRead: number;
  debtNow: number;
  deposited: number;
  withdrawn: number;
  /** Liquidation surplus, split by what became of it. */
  surplusClaimed: number;
  surplusOwed: number;
  borrowed: number;
  repaid: number;
  /** collNow + withdrawn + surplus − deposited, in pETH. */
  collTerm: number;
  /** borrowed − repaid − debtNow, in the stablecoin. */
  debtTerm: number;
  /** debtTerm ÷ feed, in pETH. */
  debtTermPeth: number;
  gain: number;
  /** gain ÷ deposited; null where nothing was deposited. */
  share: number | null;
  touches: number;
}

/** Why no figure is stated: the head read did not answer (or carried no
 *  price), or the index has not reached the chain's latest touch. */
export type PolarisAgainstHoldingNone = { none: "live-read" | "index-behind" };

export const isAgainstHoldingNone = (
  r: PolarisAgainstHolding | PolarisAgainstHoldingNone,
): r is PolarisAgainstHoldingNone => "none" in r;

const near = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(Math.abs(b), 1) * 1e-9;

/** The figure, or why it is not stated. Null on a position with no touch. */
export function polarisAgainstHolding(
  events: BaseActivityEvent[],
  chain: PolarisHoldingChain | null,
): PolarisAgainstHolding | PolarisAgainstHoldingNone | null {
  const touches = events
    .filter((e) => isPolarisEvent(e) && e.context.data.eventType !== "transfer")
    .sort((a, b) => a.blockNumber - b.blockNumber || a.id.localeCompare(b.id));
  const last = touches[touches.length - 1];
  if (!last || !isPolarisEvent(last)) return null;

  const live = chain && !chain.chainStale ? chain : null;
  const feed = live?.price?.pethInDebt;
  if (!live || feed == null || !(feed > 0)) return { none: "live-read" };

  const d = last.context.data;
  const lastColl = Number(d.newColl ?? NaN);
  const lastDebt = Number(d.newDebt ?? NaN);
  const closed = d.eventType === "liquidate" || (lastColl === 0 && lastDebt === 0);
  if (closed) {
    // A position the index has closed: the chain agrees, or the read is wrong.
    if (live.isOpen) return { none: "index-behind" };
  } else {
    // An open position: the index's last touch must be the chain's, or a
    // deposit or repayment the index has not reached is in the figures now
    // and missing from the sums.
    if (!live.isOpen) return { none: "index-behind" };
    if (last.timestamp !== live.lastTouchTime) return { none: "index-behind" };
    if (!near(lastColl, live.recordedColl) || !near(lastDebt, live.recordedDebt)) return { none: "index-behind" };
  }

  const l = polarisLifetime(touches);
  let surplusClaimed = 0;
  let surplusOwed = 0;
  for (const e of touches) {
    if (!isPolarisEvent(e) || e.context.data.eventType !== "liquidate") continue;
    const c = e.context.data;
    const amount = Number(c.collSurplus ?? 0) || 0;
    if (amount <= 0) continue;
    if (c.surplus?.claim) surplusClaimed += amount;
    else surplusOwed += amount;
  }

  const collNow = closed ? 0 : live.entireColl;
  const debtNowRead = closed ? 0 : live.entireDebt;
  const debtNow = Math.max(0, debtNowRead);
  const collTerm = collNow + l.withdrawn + surplusClaimed + surplusOwed - l.deposited;
  const debtTerm = l.borrowed - l.repaid - debtNow;
  const debtTermPeth = debtTerm / feed;
  const gain = collTerm + debtTermPeth;
  return {
    feed: { pethInDebt: feed, block: live.blockNumber, timestamp: live.blockTimestamp },
    closed,
    collNow,
    debtNowRead,
    debtNow,
    deposited: l.deposited,
    withdrawn: l.withdrawn,
    surplusClaimed,
    surplusOwed,
    borrowed: l.borrowed,
    repaid: l.repaid,
    collTerm,
    debtTerm,
    debtTermPeth,
    gain,
    share: l.deposited > 0 ? gain / l.deposited : null,
    touches: l.rows,
  };
}

/** "+2.1%" / "−0.4%", the real minus sign. */
export const againstHoldingShareText = (share: number): string =>
  `${share >= 0 ? "+" : "−"}${Math.abs(share * 100).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** The figure as one line, for the export: "+1.2345 pETH (+2.1% of pETH
 *  deposited)". `peth` formats the magnitude. */
export function againstHoldingText(r: PolarisAgainstHolding, peth: (n: number) => string): string {
  const fig = `${r.gain >= 0 ? "+" : "−"}${peth(Math.abs(r.gain))} pETH`;
  return r.share != null ? `${fig} (${againstHoldingShareText(r.share)} of pETH deposited)` : fig;
}

/** The words for a figure that is not stated. */
export const AGAINST_HOLDING_NONE: Record<PolarisAgainstHoldingNone["none"], string> = {
  "live-read": "The live read is unavailable.",
  "index-behind": "The index has not reached the position's latest touch.",
};
