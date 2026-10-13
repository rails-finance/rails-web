// The Frankencoin event prose generator: one event in, its explanation (L4)
// and "?" modal (L5) out as data, on the shared engine
// (lib/shared/event-prose/engine.ts; rails-ops decision 0036, ui-jobs 314).
// The strings come from content/frankencoin/event-prose.yaml and nowhere else;
// this file picks the template and variant and sets the values.
//
// Every sentence is keyed on the position after the event. Frankencoin runs no
// oracle and no USD: the figures are ZCHF, the position's collateral token and
// the owner's declared price. Figures the card's cells, notes and header show
// (the before and after balances, the receipt's legs, the challenge and sale
// figures) stay on the card unless a sentence says what they mean. The
// receipt read (lib/frankencoin/use-event-read.ts) and the page's facts
// (lib/frankencoin/page-facts.tsx) add what the row alone cannot say.

import type { FrankencoinContext } from "@/lib/shared/types/event-shape";
import type { EventProseCore } from "@/lib/shared/event-prose/types";
import type { FrankencoinEventRead, FrankencoinZchfSplit } from "@/lib/frankencoin/use-event-read";
import type { FrankencoinPageFacts } from "@/lib/frankencoin/page-facts";
import { challengeKey } from "@/lib/frankencoin/page-facts";
import { hubAddress } from "@/lib/frankencoin/asset-catalog";
import { forcedCurvePoint } from "@/lib/frankencoin/figures";
import {
  FRANKENCOIN_WORDS,
  PROSE,
  frankencoinEventKey,
  frankencoinEventModal,
  type FrankencoinL5Key,
} from "@/lib/frankencoin/event-templates";

/** The receipt a figure echoes on the card. */
export type FrankencoinEchoKey =
  | "collateral"
  | "minted"
  | "price_after"
  | "received"
  | "interest"
  | "paid"
  | "reserve_returned"
  | "size"
  | "acquired"
  | "bid"
  | "cleared_price"
  | "shortfall"
  | "owner_received"
  | "debt_cleared"
  | "forced"
  | "forced_cost"
  | "forced_reserve"
  | "forced_shortfall";

export type FrankencoinEventProse = EventProseCore<FrankencoinL5Key, FrankencoinEchoKey>;

export interface FrankencoinProseInput {
  ctx: FrankencoinContext;
  /** The receipt read; absent while it loads. */
  read?: FrankencoinEventRead | null;
  /** The receipt's ZCHF split of a mint or a repayment. */
  split?: FrankencoinZchfSplit | null;
  /** What the rest of the page knows: challenge starts, the phase length, the
   *  family's original, what else each transaction recorded. */
  facts?: FrankencoinPageFacts | null;
  /** The event's unix time. */
  timestamp?: number;
  txHash?: string;
  blockNumber?: number;
}

/** A balance below this is zero. */
const EPS = 1e-9;
/** A price raise pauses minting and withdrawals this long (PositionV1/V2
 *  `adjustPrice`: `cooldown` three days out). */
const RAISE_PAUSE = 3 * 86400;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

const num = (s?: string | null): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};
const scaled = (raw: string, decimals: number) => Number(raw) / 10 ** decimals;

/** The position after the event. */
interface After {
  colAfter: number;
  debtAfter: number;
  hasCol: boolean;
  hasDebt: boolean;
  closed: boolean;
}

function afterOf(ctx: FrankencoinContext): After {
  const colAfter = ctx.collateral != null ? num(ctx.collateral) : 0;
  const debtAfter = ctx.minted != null ? num(ctx.minted) : 0;
  const hasCol = colAfter > EPS;
  const hasDebt = debtAfter > EPS;
  return { colAfter, debtAfter, hasCol, hasDebt, closed: !hasCol && !hasDebt };
}

/** The sale that wrote a settlement row, from the other rows of its transaction. */
function saleOf(facts: FrankencoinPageFacts | null, txHash?: string): "challenge" | "forced" | null {
  const siblings = txHash ? (facts?.txKinds[txHash] ?? []) : [];
  return siblings.includes("challenge_succeeded") ? "challenge" : siblings.includes("forced_sale") ? "forced" : null;
}

function pick(input: FrankencoinProseInput, rs: After): { id: string; variant: string } {
  const { ctx, read, facts } = input;
  const dMint = ctx.minted != null && ctx.mintedBefore != null ? num(ctx.minted) - num(ctx.mintedBefore) : null;
  const priceBefore = ctx.liqPriceBefore != null ? num(ctx.liqPriceBefore) : null;
  const priceAfter = ctx.liqPrice != null ? num(ctx.liqPrice) : null;
  const moved = priceBefore != null && priceAfter != null && priceBefore !== priceAfter;
  switch (ctx.eventType) {
    case "open":
      return { id: "frankencoin.open", variant: facts?.opening ? "terms" : "plain" };
    case "clone": {
      const root = facts?.familyOriginal ?? null;
      const deep = root != null && ctx.original != null && root !== ctx.original;
      return { id: "frankencoin.clone", variant: deep ? "deep" : "parent" };
    }
    case "mint": {
      const first = dMint != null && Math.abs(num(ctx.minted) - dMint) <= EPS;
      return { id: "frankencoin.mint", variant: first ? "first" : "more" };
    }
    case "repay":
      return { id: "frankencoin.repay", variant: rs.hasDebt ? "partial" : rs.hasCol ? "cleared" : "closed" };
    case "add_collateral":
      return { id: "frankencoin.add_collateral", variant: "default" };
    case "withdraw_collateral":
      return { id: "frankencoin.withdraw_collateral", variant: rs.closed ? "emptied" : "partial" };
    case "adjust_price":
      return {
        id: "frankencoin.adjust_price",
        variant: !moved ? "set" : (priceAfter as number) > (priceBefore as number) ? "raised" : "lowered",
      };
    case "adjust": {
      const dColl =
        ctx.collateral != null && ctx.collateralBefore != null ? num(ctx.collateral) - num(ctx.collateralBefore) : 0;
      const changed = moved || (dMint != null && dMint !== 0) || dColl !== 0 || !!ctx.collateralUnderstated;
      return { id: "frankencoin.adjust", variant: changed ? "change" : "none" };
    }
    case "close":
      return { id: "frankencoin.close", variant: "default" };
    case "auction_settlement": {
      const sale = saleOf(facts ?? null, input.txHash);
      return {
        id: "frankencoin.auction_settlement",
        variant: sale === "challenge" ? "challenge" : sale === "forced" ? "forced" : "other",
      };
    }
    case "denied":
      return { id: "frankencoin.denied", variant: ctx.deniedBy ? "by" : "anon" };
    case "challenge_started": {
      const phase = facts?.challengePeriod ?? null;
      return {
        id: "frankencoin.challenge_started",
        variant: phase === 0 ? "zero" : phase != null && input.timestamp != null ? "timed" : "untimed",
      };
    }
    case "challenge_averted": {
      const a = read?.challenge?.kind === "averted" ? read.challenge : null;
      const withdrawn = a?.buyer != null && a.challenger != null && a.buyer === a.challenger;
      return { id: "frankencoin.challenge_averted", variant: !a ? "unread" : withdrawn ? "withdrawn" : "bought" };
    }
    case "challenge_succeeded":
      return {
        id: "frankencoin.challenge_succeeded",
        variant: read?.challenge?.kind === "succeeded" ? "read" : "unread",
      };
    case "forced_sale": {
      if (num(ctx.forcedSaleAmount) > EPS)
        return { id: "frankencoin.forced_sale", variant: read?.forced ? "sold" : "unread" };
      return { id: "frankencoin.forced_sale", variant: priorSale(input) ? "nothing_after" : "nothing" };
    }
    case "ownership_transferred": {
      if (!ctx.initialization) return { id: "frankencoin.transfer", variant: "default" };
      const step = ctx.handoverStep;
      const steps = ctx.handoverSteps;
      const stepped = step != null && steps != null && steps > 1;
      const isHub = ctx.newOwner != null && ctx.newOwner === hubAddress(ctx.hub).toLowerCase();
      const first = ctx.previousOwner === ZERO_ADDR || !ctx.previousOwner;
      return {
        id: "frankencoin.handover",
        variant: !stepped ? (isHub ? "single_hub" : "single") : first ? "start" : step === steps ? "last" : "middle",
      };
    }
    default:
      return { id: "frankencoin.fallback", variant: "default" };
  }
}

/** The earlier forced sale that bought all the collateral, for a call that
 *  found none. */
function priorSale(input: FrankencoinProseInput) {
  const { facts, blockNumber, timestamp } = input;
  if (!facts || blockNumber == null || timestamp == null) return undefined;
  return [...facts.forcedSales].reverse().find((s) => s.blockNumber < blockNumber && s.amount > EPS);
}

/** One event's explanation and modal. */
export function frankencoinEventProse(input: FrankencoinProseInput): FrankencoinEventProse {
  const { ctx, read, split, facts, timestamp: ts } = input;
  const rs = afterOf(ctx);
  const sel = pick(input, rs);
  const variant = sel.variant;
  const run = PROSE.start(PROSE.template(sel.id), null);
  const { t, values, sp } = run;
  const v = values;

  const dec = ctx.collateralDecimals;
  const showColl = !ctx.collateralUnderstated && ctx.collateral != null;
  const dMint = ctx.minted != null && ctx.mintedBefore != null ? num(ctx.minted) - num(ctx.mintedBefore) : null;
  const dColl = showColl && ctx.collateralBefore != null ? num(ctx.collateral) - num(ctx.collateralBefore) : null;
  const priceBefore = ctx.liqPriceBefore != null ? num(ctx.liqPriceBefore) : null;
  const priceAfter = ctx.liqPrice != null ? num(ctx.liqPrice) : null;
  const priceMoved = priceBefore != null && priceAfter != null && priceBefore !== priceAfter;
  const raised = priceMoved && (priceAfter as number) > (priceBefore as number);

  v.coll_symbol = ctx.collateralSymbol;
  v.event_type = ctx.eventType;
  if (priceBefore != null) v.price_before = priceBefore;
  if (priceAfter != null) v.price_after = priceAfter;
  const collEcho = { coll_change: "collateral" } as const;
  const repaidEcho = { repaid: "minted" } as const;
  const priceEcho = { price_after: "price_after" } as const;

  // What a mint paid out, from the receipt.
  const mintLegs = () => {
    if (split?.received == null) return;
    v.received = split.received;
    sp.say("mint.received", { received: "received" });
  };
  const mintInterest = () => {
    if (split?.interest == null || !(split.interest > 0)) return;
    v.interest = split.interest;
    sp.say(split.minimumTerm ? "mint.interest_min" : "mint.interest", { interest: "interest" });
  };
  // A roll: the same transaction emptied one other position.
  const roll = (): boolean => {
    const emptied = read?.otherPositions.filter((o) => o.emptied) ?? [];
    if (!read || emptied.length !== 1) return false;
    v.rolled = emptied[0].position;
    sp.say("mint.roll");
    return true;
  };
  // What a repayment cost the payer, where the reserve released a share.
  const repayLegs = () => {
    if (split?.paid == null || split.reserveReturned == null || !(split.reserveReturned > 0)) return;
    v.paid = split.paid;
    v.reserve_back = split.reserveReturned;
    sp.say("repay.paid", { paid: "paid", reserve_back: "reserve_returned" });
  };
  const understated = () => {
    if (ctx.collateralUnderstated) sp.say("coll.understated");
  };
  // What the declared price lets the collateral back.
  const limit = (withAt: boolean) => {
    if (!showColl || priceAfter == null || ctx.minted == null) return;
    const ceiling = rs.colAfter * priceAfter;
    const exact = Math.abs(ceiling - rs.debtAfter) < 0.005;
    v.ceiling = ceiling;
    if (!rs.hasDebt) {
      if (!withAt) sp.say("limit.no_debt");
    } else if (exact) sp.say(withAt ? "limit.at" : "limit.full");
    else if (ceiling > rs.debtAfter) {
      v.room = ceiling - rs.debtAfter;
      sp.say("limit.room");
    }
  };
  // The latest raise before this event and the end of its pause.
  const lastRaise = ts != null ? [...(facts?.priceRaises ?? [])].reverse().find((r) => r < ts) : undefined;
  const pauseEnd = lastRaise != null ? lastRaise + RAISE_PAUSE : null;
  // The price move's pause: a raise starts one, a cut leaves a running one.
  const pause = (): boolean => {
    if (!priceMoved || ts == null) return false;
    if (raised) {
      v.pause_end = ts + RAISE_PAUSE;
      sp.say("price.pause");
    } else if (lastRaise != null && pauseEnd != null && pauseEnd > ts) {
      v.raise_at = lastRaise;
      v.pause_end = pauseEnd;
      sp.say("price.pause_runs");
    } else sp.say("price.no_pause");
    return true;
  };
  // The first withdrawal after a raise's pause ended.
  const pauseEnded = (): boolean => {
    if (dColl == null || dColl >= 0 || lastRaise == null || pauseEnd == null || ts == null) return false;
    if (pauseEnd > ts) return false;
    if ((facts?.withdrawals ?? []).some((w) => w > lastRaise && w < ts)) return false;
    v.raise_at = lastRaise;
    sp.say("pause.ended");
    return true;
  };

  switch (t.id) {
    case "frankencoin.open": {
      const o = facts?.opening ?? null;
      const deposited = showColl ? num(ctx.collateral) : 0;
      sp.say(deposited > 0 ? "open.what" : "open.what_empty");
      sp.say("open.price");
      if (o) {
        if (Number(o.fee) > 0) sp.say("open.fee");
        if (o.start != null && ts != null && o.start > ts) {
          const deniedAt = facts?.deniedAt ?? null;
          if (deniedAt != null && deniedAt < o.start) {
            v.denied_at = deniedAt;
            sp.say("open.vetoed");
          } else {
            v.veto_end = o.start;
            sp.say("open.veto");
          }
        }
      } else if (num(ctx.minted) > 0) mintLegs();
      break;
    }
    case "frankencoin.clone": {
      if (ctx.original) {
        v.parent = ctx.original;
        v.root = facts?.familyOriginal ?? ctx.original;
        sp.say(variant === "deep" ? "clone.what_deep" : "clone.what");
      } else sp.say("clone.what_plain");
      if (ctx.liqPrice != null) sp.say("clone.price");
      if (num(ctx.minted) > 0) {
        mintLegs();
        roll();
      }
      understated();
      break;
    }
    case "frankencoin.mint": {
      sp.say(variant === "first" ? "mint.what_first" : "mint.what");
      mintLegs();
      mintInterest();
      roll();
      break;
    }
    case "frankencoin.repay": {
      sp.say(variant === "closed" ? "repay.what_closed" : variant === "cleared" ? "repay.what_cleared" : "repay.what");
      repayLegs();
      if (variant === "cleared") sp.say("repay.next");
      break;
    }
    case "frankencoin.add_collateral": {
      if (ctx.collateralUnderstated) sp.say("coll.understated");
      else sp.say("add.what");
      break;
    }
    case "frankencoin.withdraw_collateral": {
      if (ctx.collateralUnderstated) sp.say("coll.understated");
      else sp.say(variant === "emptied" ? "withdraw.what_emptied" : "withdraw.what");
      if (rs.hasDebt) limit(true);
      pauseEnded();
      break;
    }
    case "frankencoin.adjust_price": {
      sp.say(variant === "raised" ? "price.raised" : variant === "lowered" ? "price.lowered" : "price.set", priceEcho);
      pause();
      limit(false);
      break;
    }
    case "frankencoin.adjust": {
      if (variant === "none") {
        sp.say("adjust.none");
        break;
      }
      if (ctx.collateralUnderstated) sp.say("coll.understated");
      else if (dColl != null && dColl !== 0) sp.say(dColl > 0 ? "adjust.coll_in" : "adjust.coll_out");
      if (dMint != null && dMint < 0) {
        sp.say("adjust.repaid");
        repayLegs();
      } else if (dMint != null && dMint > 0) {
        sp.say("adjust.minted");
        mintLegs();
      }
      if (priceMoved) sp.say(raised ? "price.raised" : "price.lowered", priceEcho);
      // One closing fact: the price's pause, else a roll, else a pause that ended.
      if (!pause() && !(dMint != null && dMint > 0 && roll())) pauseEnded();
      break;
    }
    case "frankencoin.close": {
      sp.say("close.what");
      if (dMint != null && dMint < 0) repayLegs();
      pauseEnded();
      break;
    }
    case "frankencoin.auction_settlement": {
      v.sale =
        variant === "challenge"
          ? FRANKENCOIN_WORDS.sale_challenge
          : variant === "forced"
            ? FRANKENCOIN_WORDS.sale_forced
            : FRANKENCOIN_WORDS.sale_other;
      const tookColl = dColl != null && dColl < 0;
      const clearedDebt = dMint != null && dMint < 0;
      const soldHere = input.txHash ? (facts?.txSold[input.txHash] ?? 0) : 0;
      if (tookColl) v.coll_change = Math.abs(dColl as number);
      if (clearedDebt) v.repaid = Math.abs(dMint as number);
      if (tookColl && clearedDebt) sp.say("settle.both", { ...collEcho, ...repaidEcho });
      else if (tookColl) sp.say("settle.coll", collEcho);
      else if (clearedDebt) sp.say("settle.debt", repaidEcho);
      else if (variant !== "other" && rs.closed && soldHere > EPS) {
        v.sold = soldHere;
        sp.say("settle.unrecorded");
      } else if (variant === "forced" && rs.closed) sp.say("settle.nothing");
      else sp.say("settle.unchanged");
      if (rs.closed && (tookColl || clearedDebt)) sp.say("settle.closed");
      if (variant !== "other") sp.say(variant === "challenge" ? "settle.see_challenge" : "settle.see_forced");
      understated();
      break;
    }
    case "frankencoin.denied": {
      if (variant === "by") {
        v.denier = ctx.deniedBy as string;
        sp.say("denied.what_by");
      } else sp.say("denied.what");
      if (ctx.deniedMessage) {
        v.message = ctx.deniedMessage;
        sp.say("denied.message");
      }
      sp.say("denied.next");
      break;
    }
    case "frankencoin.challenge_started": {
      v.size = num(ctx.challengeSize);
      if (ctx.challenger) {
        v.challenger = ctx.challenger;
        sp.say("challenge.what", { size: "size" });
      } else sp.say("challenge.what_anon", { size: "size" });
      sp.say("challenge.stake");
      if (variant === "zero") sp.say("challenge.zero");
      else if (variant === "timed") {
        v.phase_end = (ts as number) + (facts?.challengePeriod as number);
        sp.say("challenge.phase_one");
      }
      break;
    }
    case "frankencoin.challenge_averted": {
      const a = read?.challenge?.kind === "averted" ? read.challenge : null;
      const started = facts?.challenges[challengeKey(ctx)];
      const startAt = a?.challengeStart ?? started?.start ?? null;
      if (startAt != null && ts != null && ts > startAt) {
        v.after = ts - startAt;
        sp.say("avert.what");
      } else sp.say("avert.what_plain");
      if (variant === "withdrawn") sp.say("avert.withdrawn");
      else if (a && a.buyer && a.owner && a.buyer === a.owner) sp.say("avert.owner");
      else if (a && a.buyer) {
        v.buyer = a.buyer;
        sp.say("avert.buyer");
      } else sp.say("avert.unread");
      if (a?.cooldownUntil != null && ts != null && a.cooldownUntil > ts) {
        v.cooldown = a.cooldownUntil;
        sp.say("avert.pause");
      } else sp.say("avert.untouched");
      break;
    }
    case "frankencoin.challenge_succeeded": {
      const c = read?.challenge?.kind === "succeeded" ? read.challenge : null;
      const bid = num(ctx.bid);
      const acquired = num(ctx.acquiredCollateral);
      v.acquired = acquired;
      v.bid = bid;
      sp.say("won.what", { acquired: "acquired", bid: "bid" });
      const phase = c?.phase ?? facts?.challengePeriod ?? null;
      const liq = c?.liqPriceRaw != null ? scaled(c.liqPriceRaw, 36 - dec) : null;
      if (bid > 0 && acquired > EPS) {
        v.unit = bid / acquired;
        const unitEcho = c ? ({ unit: "cleared_price" } as const) : undefined;
        if (liq != null && liq > 0) {
          v.share = bid / acquired / liq;
          sp.say("won.price", unitEcho);
        } else sp.say("won.price_plain", unitEcho);
      } else if (phase === 0 && bid === 0) sp.say("won.zero");
      if (c) {
        const cleared = Number(c.debtCleared);
        const shortfall = Number(c.shortfall);
        const ownerGot = Number(c.ownerReceived);
        const kept = Number(c.excessToReserve);
        if (shortfall > 0) {
          v.shortfall = shortfall;
          sp.say("won.shortfall", { shortfall: "shortfall" });
        } else if (ownerGot > 0 || kept > 0) {
          if (cleared > 0) {
            v.owner_got = ownerGot;
            v.excess = kept;
            sp.say("won.excess", { owner_got: "owner_received" });
          } else sp.say("won.no_debt");
        }
        if (cleared > 0) {
          v.cleared = cleared;
          sp.say("won.owner_keeps", { cleared: "debt_cleared" });
        }
      }
      break;
    }
    case "frankencoin.forced_sale": {
      const amt = num(ctx.forcedSaleAmount);
      const f = read?.forced ?? null;
      v.amount = amt;
      if (variant === "nothing_after") {
        const prev = priorSale(input);
        v.gap = (ts as number) - (prev?.timestamp ?? 0);
        sp.say("forced.nothing_after");
        break;
      }
      if (variant === "nothing") {
        sp.say("forced.nothing");
        break;
      }
      if (!f || !f.buyer) {
        sp.say("forced.what_unread", { amount: "forced" });
        break;
      }
      const cost = Number(f.cost);
      v.buyer = f.buyer;
      if (cost > 0) {
        v.cost = cost;
        sp.say("forced.what", { amount: "forced", cost: "forced_cost" });
      } else sp.say("forced.what_free", { amount: "forced" });
      const unit = scaled(f.priceRaw, 36 - dec);
      const liq = f.liqPriceRaw != null ? scaled(f.liqPriceRaw, 36 - dec) : null;
      const curve =
        f.expiration != null && f.challengePeriod != null && ts != null
          ? forcedCurvePoint(ts, f.expiration, f.challengePeriod, unit, liq)
          : null;
      if (curve) {
        v.since = curve.since;
        if (curve.stage === "zero" || unit === 0) sp.say("forced.price_zero");
        else if (curve.multiple != null) {
          v.share = curve.multiple;
          sp.say("forced.price");
        }
      }
      if (f.branch === "full") {
        const back = Number(f.reserveToBuyer);
        if (back > 0) {
          v.reserve_back = back;
          sp.say("forced.reserve", { reserve_back: "forced_reserve" });
        }
        sp.say("forced.full");
      } else if (f.branch === "shortfall") {
        v.loss = Number(f.loss);
        sp.say("forced.shortfall", { loss: "forced_shortfall" });
      } else if (f.branch === "partial") {
        if (f.mintedBefore != null) {
          v.left = Math.max(0, Number(f.mintedBefore) - Number(f.debtCleared));
          sp.say("forced.partial");
        }
      } else sp.say(cost > 0 ? "forced.no_debt" : "forced.no_debt_zero");
      break;
    }
    case "frankencoin.transfer": {
      if (ctx.previousOwner && ctx.newOwner) {
        v.from = ctx.previousOwner;
        v.to = ctx.newOwner;
        sp.say("own.what");
      } else if (ctx.newOwner) {
        v.to = ctx.newOwner;
        sp.say("own.what_to");
      } else sp.say("own.what_plain");
      sp.say("own.means");
      break;
    }
    case "frankencoin.handover": {
      const to = ctx.newOwner ?? null;
      v.step = ctx.handoverStep ?? 1;
      v.steps = ctx.handoverSteps ?? 1;
      if (to) {
        v.to = to;
        const isHub = to === hubAddress(ctx.hub).toLowerCase();
        if (variant === "single") sp.say("hand.single");
        else if (variant === "single_hub") sp.say("hand.single_hub");
        else if (variant === "start") sp.say(isHub ? "hand.start_hub" : "hand.start");
        else if (variant === "last") sp.say("hand.last");
        else sp.say("hand.middle");
      }
      if ((variant === "start" || variant === "middle") && ctx.handoverOwner) {
        v.final = ctx.handoverOwner;
        sp.say("hand.ends");
      }
      sp.say("hand.means");
      break;
    }
    default: {
      sp.say("fallback.what");
    }
  }

  // ── The run's sentences ──
  const said = PROSE.finish(run, variant);
  const forcedTx = input.txHash != null && (facts?.txKinds[input.txHash] ?? []).includes("forced_sale");
  return {
    ...said,
    L5: { key: frankencoinEventKey(ctx, forcedTx), content: frankencoinEventModal(ctx, forcedTx) },
  };
}

/** L4 as the explanation prints it: one flat run, or one run per group. */
export const frankencoinExplanationRuns = PROSE.explanationRuns;
