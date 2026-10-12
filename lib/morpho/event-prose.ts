// The Morpho event prose generator: one event in, its explanation (L4) and
// "?" modal (L5) out as data, on the shared engine
// (lib/shared/event-prose/engine.ts; rails-ops decision 0036, ui-jobs 314).
// The strings come from content/morpho/event-prose.yaml and nowhere else; this
// file picks the template and variant and sets the values.
//
// Every value a template reads is kept unrounded in `values`; a sentence is
// its id, the placeholders it read and its text as segments, so the card can
// echo a figure into its receipt without the text changing
// (components/protocol/morpho/morpho-event-explainer.tsx).
//
// Every sentence reads the position after the event: a row without the
// index's running balances says only that they are not loaded. Morpho has no
// USD and the captured event carries no per-event health factor, so the
// distance to liquidation comes from the market read at the event's block
// (lib/morpho/use-market-at-block.ts) and is said only once that read lands.
// Figures the card's cells, notes and price row show (the balances, the
// health factor and LTV, the oracle price, the borrow rate) stay on the card.

import type { MorphoContext } from "@/lib/shared/types/event-shape";
import type { EventProseCore } from "@/lib/shared/event-prose/types";
import { morphoHealthMove, morphoLiquidationPrice, type MorphoAtBlock } from "@/lib/morpho/use-market-at-block";
import { isPendlePt } from "@/lib/morpho/pendle-pt";
import { morphoEventKey, morphoEventModal, PROSE, type MorphoL5Key } from "@/lib/morpho/event-templates";

/** The receipt a figure echoes on the card. */
export type MorphoEchoKey = "amount" | "seized_value" | "cleared_value";

export type MorphoEventProse = EventProseCore<MorphoL5Key, MorphoEchoKey>;

export interface MorphoProseInput {
  ctx: MorphoContext;
  /** The market read at the event's block; absent until it lands. */
  read?: MorphoAtBlock;
  /** The market read at the previous event's block (borrow and repay). */
  prevEventRead?: MorphoAtBlock;
  /** The kinds earlier in the same transaction. */
  earlierInTx?: MorphoContext["eventType"][];
  blockNumber?: number;
}

/** A magnitude below this is a rounding leftover.
 *
 *  It guards the PRINCIPAL leg and the two "was this the first one?" reads,
 *  which are differences of display floats. It does NOT guard collateral: that
 *  figure is an exact clamped sum (`mig 045`) and the server words the
 *  position's status off `collateral_final > 0`, so any collateral at all is
 *  collateral (`chain-truth-charter.md` §2). */
const EPS = 1e-9;

/** A move of the market's borrow rate worth a sentence. */
const RATE_STEP = 0.01;

/** The position after the event. */
interface After {
  collAfter: number;
  /** What the position owed after the event: the chain debt (shares at the
   *  market's totals) where the row carries it, else the net borrowed
   *  PRINCIPAL (Σ borrow − repay − liquidation cover), which can read below
   *  zero on a full repay, where the payment settled principal plus interest. */
  borrowedAfter: number;
  /** True when `borrowedAfter` is the chain debt. */
  debtIsChain: boolean;
  hasColl: boolean;
  hasDebt: boolean;
  debtCleared: boolean;
  collateralOnly: boolean;
  emptied: boolean;
  /** Principal reads below zero: a full repay returned more than was drawn. */
  principalOvershoot: boolean;
}

function afterOf(ctx: MorphoContext): After {
  const collRaw = Number(ctx.collateralAfter);
  const debtIsChain = ctx.debtAfter != null;
  const borrRaw = Number(debtIsChain ? ctx.debtAfter : ctx.borrowedAfter);
  const collAfter = Number.isFinite(collRaw) ? collRaw : 0;
  const borrowedAfter = Number.isFinite(borrRaw) ? borrRaw : 0;
  const hasColl = collAfter > 0;
  const hasDebt = borrowedAfter > EPS;
  return {
    collAfter,
    borrowedAfter,
    debtIsChain,
    hasColl,
    hasDebt,
    debtCleared: !hasDebt,
    collateralOnly: hasColl && !hasDebt,
    emptied: !hasColl && !hasDebt,
    principalOvershoot: !debtIsChain && borrowedAfter < -EPS,
  };
}

/** A liquidation's two legs, the price it ran on and what that makes of them. */
interface Legs {
  legs: boolean;
  seized: number;
  /** The debt the liquidation cleared: the loan repaid plus any bad debt. */
  cleared: number;
  used: ReturnType<typeof morphoLiquidationPrice>;
  seizedValue: number | null;
  /** The debt the seizure could not cover: cleared less the repayment the
   *  seized collateral pays for at the market's incentive. Zero unless the
   *  collateral ran out. */
  badDebt: number;
}

function legsOf(ctx: MorphoContext, read: MorphoAtBlock | undefined, after: After, block?: number): Legs {
  const seized = Math.abs(Number(ctx.assetsDelta));
  const cleared = Number(ctx.loanRepaid);
  const legs = Number.isFinite(seized) && Number.isFinite(cleared) && seized > 0 && cleared > 0;
  const used = read ? morphoLiquidationPrice(ctx, read, block) : null;
  const seizedValue = legs && used ? seized * used.price : null;
  const covered = seizedValue != null && used?.lif != null && used.lif > 0 ? seizedValue / used.lif : null;
  const short = covered != null ? cleared - covered : 0;
  const badDebt = !after.hasColl && short > cleared * 0.005 ? short : 0;
  return { legs, seized, cleared, used, seizedValue, badDebt };
}

function pick(ctx: MorphoContext, rs: After, delta: number, liq: Legs | null): { id: string; variant: string } {
  if (ctx.collateralAfter == null || ctx.borrowedAfter == null) return { id: "morpho.unloaded", variant: "default" };
  switch (ctx.eventType) {
    case "borrow": {
      const first = (rs.debtIsChain ? Number(ctx.debtBefore) : rs.borrowedAfter - delta) <= EPS;
      return { id: "morpho.borrow", variant: first ? "first" : "more" };
    }
    case "repay":
      return { id: "morpho.repay", variant: rs.debtCleared ? (rs.emptied ? "closed" : "full") : "partial" };
    case "supply_collateral":
      return { id: "morpho.supply_collateral", variant: rs.collAfter - delta <= EPS ? "first" : "more" };
    case "withdraw_collateral":
      return { id: "morpho.withdraw_collateral", variant: rs.emptied ? "emptied" : "partial" };
    case "liquidation": {
      const left = rs.hasDebt && rs.borrowedAfter < 0.01;
      const variant = rs.hasColl ? (left ? "remainder" : "partial") : liq && liq.badDebt > 0 ? "bad_debt" : "emptied";
      return { id: "morpho.liquidation", variant };
    }
    case "supply":
      return { id: "morpho.supply", variant: "default" };
    case "withdraw":
      return { id: "morpho.withdraw", variant: "default" };
    default:
      return { id: "morpho.fallback", variant: "default" };
  }
}

/** The fall in the collateral's price (in the loan token) that takes a
 *  position at health factor `hf` to the line: 1 − 1 ÷ HF. */
const fall = (hf: number): number => 1 - 1 / hf;

/** One event's explanation and modal. */
export function morphoEventProse(input: MorphoProseInput): MorphoEventProse {
  const { ctx, read, prevEventRead, earlierInTx } = input;
  const rs = afterOf(ctx);
  const delta = Number(ctx.assetsDelta) || 0;
  const liq = ctx.eventType === "liquidation" ? legsOf(ctx, read, rs, input.blockNumber) : null;
  const sel = pick(ctx, rs, delta, liq);
  const variant = sel.variant;
  const run = PROSE.start(PROSE.template(sel.id), null);
  const { t, values, sp } = run;
  const v = values;

  v.loan_symbol = ctx.loanSymbol;
  v.coll_symbol = ctx.collateralSymbol;
  v.amount = Math.abs(delta);
  v.event_type = ctx.eventType;
  const echo = { amount: "amount" } as const;
  // Both facts ship only on a row another account ran for the owner.
  const third = !!ctx.txFrom && !!ctx.caller;

  // The interest the debt accrued since the previous event, which the card's
  // Debt cell states; a full repay's amount is the previous debt plus it.
  const interest = Number(ctx.interestSincePrevious ?? 0) || 0;
  const interestKnown = rs.debtIsChain && ctx.debtBefore != null && interest > 0;

  // How far the collateral's price can fall before and after the event, at the
  // oracle price going into the block.
  const risk = () => {
    if (rs.collateralOnly) {
      sp.say("liq.none");
      return;
    }
    if (!rs.hasDebt) return;
    const move = read ? morphoHealthMove(ctx, read, input.blockNumber) : null;
    if (!move) return;
    const { hfBefore, hfAfter } = move;
    if (hfAfter == null || (hfAfter >= 100 && (hfBefore == null || hfBefore >= 100))) {
      sp.say("liq.dust");
      return;
    }
    if (hfAfter < 1) {
      sp.say("liq.below");
      return;
    }
    v.fall_after = fall(hfAfter);
    if (hfBefore == null || hfBefore < 1 || Math.abs(hfAfter - hfBefore) < 1e-9) {
      sp.say("liq.after");
      return;
    }
    v.fall_before = fall(hfBefore);
    sp.say(hfAfter > hfBefore ? "liq.safer" : "liq.less_safe");
  };

  // A move of the borrow rate within the block, else since the previous event.
  const rates = () => {
    if (!read || read.status !== "ok") return;
    const prevEventApr = prevEventRead?.status === "ok" ? prevEventRead.at.borrowApr : null;
    const before = read.prev.borrowApr;
    const after = read.at.borrowApr;
    if (before != null && after != null && Math.abs(after - before) > RATE_STEP) {
      v.rate_before = before;
      v.rate_after = after;
      sp.say("rate.block");
    } else if (prevEventApr != null && before != null && Math.abs(before - prevEventApr) > RATE_STEP) {
      v.rate_before = prevEventApr;
      v.rate_after = before;
      sp.say("rate.drift");
    }
  };

  switch (t.id) {
    case "morpho.borrow": {
      if (variant === "first") sp.say("borrow.what_first", echo);
      else sp.say("borrow.what", echo);
      if (third) sp.say("actor.authorised");
      risk();
      rates();
      break;
    }
    case "morpho.repay": {
      if (variant === "closed") sp.say("repay.what_closed", echo);
      else if (variant === "full") sp.say("repay.what_full", echo);
      else sp.say("repay.what", echo);
      if (third) sp.say("actor.open");
      if (variant !== "partial") {
        if (interestKnown) sp.say("repay.covers");
        else if (rs.principalOvershoot) sp.say("repay.overshoot");
      }
      risk();
      if (variant === "partial") rates();
      break;
    }
    case "morpho.supply_collateral": {
      if (variant === "first") sp.say("collateral.what_first", echo);
      else sp.say("collateral.what", echo);
      if (third) sp.say("actor.open");
      risk();
      break;
    }
    case "morpho.withdraw_collateral": {
      if (variant === "emptied") sp.say("withdraw.what_closed", echo);
      else sp.say("withdraw.what", echo);
      if (third) sp.say("actor.authorised");
      if (variant === "emptied" && earlierInTx?.includes("repay")) sp.say("withdraw.same_tx");
      risk();
      break;
    }
    case "morpho.liquidation": {
      if (liq && liq.legs) {
        v.repaid = liq.cleared - liq.badDebt;
        v.seized = liq.seized;
        sp.say("seize.what", { repaid: "bold", seized: "bold" });
      } else sp.say("seize.what_unknown");
      // The health factor at the price the call ran on, the figure the opened
      // card's health cell shows as its before-value.
      const move = read ? morphoHealthMove(ctx, read, input.blockNumber) : null;
      const hfAtCall = move?.liquidationPrice ? move.hfBefore : null;
      if (hfAtCall != null && hfAtCall < 1) sp.say("seize.why");
      if (liq && liq.legs && liq.used && liq.seizedValue != null) {
        v.seized_value = liq.seizedValue;
        v.cleared_value = liq.cleared;
        v.price_used = liq.used.price;
        sp.say("seize.value", { seized_value: "seized_value", cleared_value: "cleared_value" });
        if (liq.seizedValue > liq.cleared) {
          v.net = liq.seizedValue - liq.cleared;
          sp.say("seize.net");
        }
      }
      if (variant === "bad_debt" && liq) {
        v.bad_debt = liq.badDebt;
        sp.say("seize.bad_debt");
      } else if (variant === "remainder") sp.say("seize.remainder");
      break;
    }
    case "morpho.supply": {
      sp.say("lend.supply", echo);
      if (third) sp.say("actor.open");
      break;
    }
    case "morpho.withdraw": {
      sp.say("lend.withdraw", echo);
      if (third) sp.say("actor.authorised");
      // The running supplied figure reads below zero once withdrawals have
      // returned more than was supplied; the excess is interest earned.
      const supplied = ctx.suppliedAfter != null ? Number(ctx.suppliedAfter) : NaN;
      if (Number.isFinite(supplied) && supplied < -EPS) sp.say("lend.interest");
      break;
    }
    case "morpho.unloaded": {
      sp.say("unloaded.what");
      break;
    }
    default: {
      sp.say("fallback.what");
    }
  }

  // ── The run's sentences ──
  const said = PROSE.finish(run, variant);
  const pt = isPendlePt(ctx.collateralSymbol);
  return { ...said, L5: { key: morphoEventKey(ctx.eventType), content: morphoEventModal(ctx.eventType, { pt }) } };
}

/** L4 as the explanation prints it: one flat run, or one run per group. */
export const morphoExplanationRuns = PROSE.explanationRuns;
