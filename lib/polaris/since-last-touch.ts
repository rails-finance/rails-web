// Polaris — the window between a CDP's own touches, split into its two causes.
// ----------------------------------------------------------------------------
// Between two touches a CDP's STATED figures do not move: `getCDP(id).coll` and
// `.debt` are the slots written at the last touch and nothing rewrites them
// until the next one. So over that window exactly two things can change what
// the position is worth at the market's own feed, and the chain states both:
//
//   the feed      the price of pETH in the market's stablecoin moved, against
//                 the collateral the CDP stated at that touch
//   the protocol  the legs that accrue between touches and settle at the next
//                 one — interest charged, the Protocol Safety Rate's stability
//                 gain, the pETH reward on the debt, and the PSM's pro-rata
//                 share of every mint and redemption since
//
// and they sum, by construction, to the whole move in the CDP's equity at the
// feed. Every input is a getter the overlay already reads separately, plus the
// price at the touch's own block from the oracle-at-block lane:
//
//   equityNow    = (coll + mrColl + bcGain) × priceNow
//                  − (debt + interest + mrDebt − stables)      [entire*, at head]
//   equityAtTouch = coll × priceAtTouch − debt                 [the stated slots]
//   feed          = coll × (priceNow − priceAtTouch)
//   protocol      = (mrColl + bcGain) × priceNow
//                   − interest − mrDebt + stables
//   feed + protocol ≡ equityNow − equityAtTouch
//
// This is the one window where the split is a fact rather than a choice: it
// needs no cost basis, because the holder did nothing inside it. Anything
// wider — a life, a chosen date — needs a price for the holder's own deposits,
// which is a decision about basis and not a fact of the chain, and Rails does
// not make it (the same stance the "Equity at the feed" stat carries).
//
// NOT a profit, NOT a return: no percentage, no colour, no verdict. The words
// are "moved" and "changed", and each figure carries its own receipt.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isPolarisEvent } from "@/lib/shared/types/event-shape";
import { flowsReconcile } from "@/lib/shared/chain-truth-economics";
import { formatCompact } from "@/lib/utils/format";

/** The overlay fields this needs — a structural subset of PolarisChainResponse
 *  so the markdown export and the verifier can pass a plain object. */
export interface PolarisSinceTouchChain {
  blockNumber: number;
  blockTimestamp: number;
  isOpen: boolean;
  chainStale?: boolean;
  recordedColl: number;
  recordedDebt: number;
  entireColl: number;
  entireDebt: number;
  accruedInterest: number;
  accruedStables: number;
  bcTokenGain: number;
  mintRedeemCollChange: number;
  mintRedeemDebtChange: number;
  lastTouchTime: number;
  price?: {
    pethInDebt: number;
    curve?: number | null;
    ethUsd?: number | null;
    xauUsd?: number | null;
  } | null;
}

/** One end of the window's price, with the legs the feed is built from —
 *  `previewPrice() = curve × ethUsd ÷ xauUsd` on GOLDp, `× ethInDebt` on USDp.
 *  The legs are stated, never split into shares of the figure: apportioning
 *  one move between three multiplicative legs is a choice of index, not a
 *  fact, and this module states only facts. */
export interface PolarisFeedEnd {
  block: number;
  timestamp: number;
  pethInDebt: number;
  curve?: number;
  ethUsd?: number;
  xauUsd?: number;
}

export interface PolarisSinceLastTouch {
  from: PolarisFeedEnd;
  to: PolarisFeedEnd;
  /** The slots the CDP stated at that touch — the quantities the feed term is
   *  measured against, read from the chain's own `getCDP`, not replayed. */
  collAtTouch: number;
  debtAtTouch: number;
  equityAtTouch: number;
  equityNow: number;
  /** collAtTouch × (priceNow − priceAtTouch). */
  feed: number;
  /** The pending legs, valued at the feed now. */
  protocol: number;
  /** feed + protocol — equal to equityNow − equityAtTouch by construction. */
  total: number;
  /** The protocol term's legs, each in the market's stablecoin. `psm` is the
   *  net of its two legs (pETH taken or added at the feed now, against the
   *  debt cleared or added); the raw token legs ride alongside for the
   *  receipt, because a redemption share moves both sides at once. */
  legs: {
    interest: number;
    stabilityGain: number;
    reward: number;
    psm: number;
  };
  raw: {
    psmColl: number;
    psmDebt: number;
    reward: number;
  };
  /** Seconds between the touch's block header and the head block's. */
  elapsedSeconds: number;
}

const DUST = 1e-9;

/** Both ends' prices and the stated slots, or null where the window cannot be
 *  stated honestly. Null — never a partial or a dash — when: the CDP is closed
 *  or the overlay is stale (there is no live end); the collateral is zero (the
 *  feed term is meaningless); the index's newest touch is not the chain's
 *  (`lastTouchTime` disagrees, so the row's price is not this window's
 *  opening price); the newest row's resulting figures disagree with the
 *  chain's own slots (the index is behind a touch); the newest touch carries
 *  no price yet (the oracle-at-block lane has not reached its block); or the
 *  identity does not close. A window nothing has happened in is also null:
 *  a CDP touched seconds ago has nothing to say. */
export function polarisSinceLastTouch(
  chain: PolarisSinceTouchChain,
  events: BaseActivityEvent[],
): PolarisSinceLastTouch | null {
  if (!chain.isOpen || chain.chainStale || !chain.price || !(chain.price.pethInDebt > 0)) return null;
  if (!(chain.recordedColl > 0) || !(chain.lastTouchTime > 0) || !(chain.blockTimestamp > 0)) return null;

  const touches = events
    .filter((e) => isPolarisEvent(e) && e.context.data.eventType !== "transfer")
    .sort((a, b) => a.blockNumber - b.blockNumber || a.id.localeCompare(b.id));
  const last = touches[touches.length - 1];
  if (!last || !isPolarisEvent(last)) return null;
  const d = last.context.data;

  // The row must BE the chain's last touch, three ways: its block header, and
  // the two slots it left behind. Any disagreement means the index is behind
  // the chain (or ahead of the overlay's block) and the window's opening price
  // would be the wrong block's.
  if (last.timestamp !== chain.lastTouchTime) return null;
  const collAtTouch = Number(d.newColl);
  const debtAtTouch = Number(d.newDebt);
  if (!Number.isFinite(collAtTouch) || !Number.isFinite(debtAtTouch)) return null;
  const slotTol = Math.max(Math.abs(chain.recordedColl), 1) * 1e-9;
  const debtTol = Math.max(Math.abs(chain.recordedDebt), 1) * 1e-9;
  if (Math.abs(collAtTouch - chain.recordedColl) > slotTol) return null;
  if (Math.abs(debtAtTouch - chain.recordedDebt) > debtTol) return null;

  const priceAtTouch = d.priceAtBlock?.pethInDebt;
  if (!(priceAtTouch != null && priceAtTouch > 0)) return null;
  const priceNow = chain.price.pethInDebt;

  const equityAtTouch = collAtTouch * priceAtTouch - debtAtTouch;
  const equityNow = chain.entireColl * priceNow - chain.entireDebt;
  const feed = collAtTouch * (priceNow - priceAtTouch);
  const legs = {
    interest: -chain.accruedInterest,
    stabilityGain: chain.accruedStables,
    reward: chain.bcTokenGain * priceNow,
    psm: chain.mintRedeemCollChange * priceNow - chain.mintRedeemDebtChange,
  };
  const protocol = legs.interest + legs.stabilityGain + legs.reward + legs.psm;
  const total = feed + protocol;

  // The gate is the identity itself: if the two terms do not add up to the
  // move in equity at the feed, the window is not the one the chain describes
  // and nothing is stated. (They do, by construction, from these getters.)
  if (!flowsReconcile(total, equityNow - equityAtTouch)) return null;
  if (Math.abs(feed) < DUST && Math.abs(protocol) < DUST) return null;

  return {
    from: {
      block: last.blockNumber,
      timestamp: last.timestamp,
      pethInDebt: priceAtTouch,
      curve: d.priceAtBlock?.curve ?? undefined,
      ethUsd: d.priceAtBlock?.ethUsd ?? undefined,
      xauUsd: d.priceAtBlock?.xauUsd ?? undefined,
    },
    to: {
      block: chain.blockNumber,
      timestamp: chain.blockTimestamp,
      pethInDebt: priceNow,
      curve: chain.price.curve ?? undefined,
      ethUsd: chain.price.ethUsd ?? undefined,
      xauUsd: chain.price.xauUsd ?? undefined,
    },
    collAtTouch,
    debtAtTouch,
    equityAtTouch,
    equityNow,
    feed,
    protocol,
    total,
    legs,
    raw: {
      psmColl: chain.mintRedeemCollChange,
      psmDebt: chain.mintRedeemDebtChange,
      reward: chain.bcTokenGain,
    },
    elapsedSeconds: Math.max(0, chain.blockTimestamp - last.timestamp),
  };
}

/** The same price grain the card's formatPethPrice uses, restated here so this
 *  module stays free of component imports (the markdown export loads it). */
const formatPrice = (p: number): string => {
  if (p < 0.01) return "<0.01";
  if (p < 1) return p.toFixed(3);
  if (p < 100) return p.toFixed(2);
  return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
};

/** "+120.004 GOLDp" / "−0.229 GOLDp", the real minus sign. */
export const signedFigure = (n: number, unit: string): string =>
  `${n >= 0 ? "+" : "−"}${formatCompact(Math.abs(n))} ${unit}`;

/** The named protocol legs, largest first — the clause that says WHICH legs
 *  the protocol term is made of. Legs at dust are left out entirely rather
 *  than stated as zero. */
export function polarisProtocolLegNames(w: PolarisSinceLastTouch): string[] {
  const named: Array<[number, string]> = [
    [
      w.legs.psm,
      w.raw.psmColl < 0 || (w.raw.psmColl === 0 && w.raw.psmDebt < 0) ? "a PSM redemption share" : "a PSM mint share",
    ],
    [w.legs.reward, "the pETH reward"],
    [w.legs.interest, "interest charged"],
    [w.legs.stabilityGain, "the stability gain"],
  ];
  return named
    .filter(([v]) => Math.abs(v) > DUST)
    .sort((a, b) => Math.abs(b[0]) - Math.abs(a[0]))
    .map(([, name]) => name);
}

/** One sentence, the same words the strip and the markdown export both use. */
export function polarisSinceLastTouchSentence(w: PolarisSinceLastTouch, stable: string): string {
  const names = polarisProtocolLegNames(w);
  const made = names.length > 0 ? ` (${names.join(", ")})` : "";
  return (
    `Since its last touch at block ${w.from.block.toLocaleString("en-US")}, the feed moved pETH from ` +
    `${formatPrice(w.from.pethInDebt)} to ${formatPrice(w.to.pethInDebt)} ${stable}, worth ` +
    `${signedFigure(w.feed, stable)} on the collateral the CDP stated then, and the protocol added ` +
    `${signedFigure(w.protocol, stable)}${made} — together ${signedFigure(w.total, stable)}, the whole ` +
    `change in its equity at the feed.`
  );
}
