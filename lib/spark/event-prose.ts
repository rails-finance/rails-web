// The SparkLend event prose generator: one event in, its explanation (L4) and
// "?" modal (L5) out as data, on the shared engine
// (lib/shared/event-prose/engine.ts; rails-ops decision 0036, ui-jobs 314).
// The strings come from content/spark/event-prose.yaml and nowhere else; this
// file picks the template and variant and sets the values.
//
// Every value a template reads is kept unrounded in `values`; a sentence is its
// id, the placeholders it read and its text as segments, so the card can echo a
// figure into its receipt without the text changing
// (components/protocol/spark/spark-event-explainer.tsx).
//
// The account figures (health factor, e-mode, the reserve's collateral switch,
// a liquidation's bonus and fee) come from the chain read at blocks N-1 and N
// that the open card makes (lib/spark/event-state); without it the explanation
// keeps to the row's figures. Figures the card's cells, notes and price row show
// stay on the card unless the sentence says what they mean.

import type { SparkContext } from "@/lib/shared/types/event-shape";
import type { EventProseCore } from "@/lib/shared/event-prose/types";
import { externalActor } from "@/lib/shared/external-actor";
import type { SparkEmodeRead, SparkEventState } from "@/lib/spark/event-state";
import {
  isGatewayWithdrawal,
  sparkFeeLiquidation,
  sparkLiquidationFee,
  type SparkTimelineEvent,
} from "@/lib/spark/liquidation-fee";
import { PROSE, SPARK_WORDS, sparkModal, type SparkL5Key } from "@/lib/spark/event-templates";

/** The receipt a figure echoes on the card. */
export type SparkEchoKey = "amount" | "amount_in" | "amount_out" | "seized" | "cleared" | "premium";

export type SparkEventProse = EventProseCore<SparkL5Key, SparkEchoKey>;

export interface SparkProseInput {
  ctx: SparkContext;
  /** The position's owner: the third-party sentence keys on it. */
  owner?: string;
  /** This transaction's rows: a liquidation and its fee transfer. */
  siblings?: SparkTimelineEvent[];
  /** The account read around this transaction. */
  state?: SparkEventState;
}

/** A balance at or below this reads as cleared: the interest-blind residual a
 *  full repay or a full seizure can leave. */
const EPS = 1e-6;
/** Health factors within this of each other read as unchanged. */
const FALL_STEP = 0.005;
/** A first debt this far from liquidation says nothing worth saying. */
const FIRST_DEBT_MAX_FALL = 0.9;

const num = (s: string | undefined): number | null => {
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** The fall in the collateral's value against the debt that would take the
 *  health factor to 1, as a fraction rounded to a tenth of a percent. */
const fallTo1 = (hf: number): number => Math.round((1 - 1 / hf) * 1000) / 1000;

/** The bonus a liquidation paid, read off the row's figures: the collateral that
 *  left (seized + fee) against the debt cleared at the block's prices, and the
 *  fee's share of the bonus. */
export function liquidationBonus(liq: SparkContext, fee: SparkContext | undefined) {
  const cp = liq.collateralPrice?.usd;
  const dp = liq.debtPrice?.usd;
  const seized = Number(liq.liquidatedCollateralAmount);
  const cleared = Number(liq.debtToCover);
  const feeAmt = fee ? Math.abs(Number(fee.assetsDelta)) || 0 : 0;
  if (!cp || !dp || !(seized > 0) || !(cleared > 0)) return null;
  const base = (cleared * dp) / cp; // collateral worth the debt cleared
  const total = seized + feeAmt;
  const bonusPart = total - base;
  return {
    total,
    feeAmt,
    feeShare: feeAmt > 0 && bonusPart > 0 ? feeAmt / bonusPart : null,
    premium: seized / base - 1,
    seizedUsd: seized * cp,
    collUsd: total * cp,
    clearedUsd: cleared * dp,
  };
}

function pick(ctx: SparkContext, siblings?: SparkTimelineEvent[]): { id: string; variant: string } {
  switch (ctx.eventType) {
    case "supply":
      return { id: "spark.supply", variant: "default" };
    case "withdraw": {
      const after = num(ctx.supplyAfter);
      return { id: "spark.withdraw", variant: after != null && after <= EPS ? "empty" : "partial" };
    }
    case "borrow":
      return { id: "spark.borrow", variant: "default" };
    case "repay": {
      const after = num(ctx.debtAfter);
      return { id: "spark.repay", variant: after != null && after <= EPS ? "full" : "partial" };
    }
    case "transfer_in":
      return { id: "spark.transfer_in", variant: "default" };
    case "transfer_out": {
      const liq = sparkFeeLiquidation(ctx, siblings);
      if (liq) return { id: "spark.fee", variant: liquidationBonus(liq, ctx) ? "share" : "plain" };
      if (isGatewayWithdrawal(ctx)) return { id: "spark.gateway", variant: "default" };
      return { id: "spark.transfer_out", variant: "default" };
    }
    case "liquidation":
      return { id: "spark.liquidation", variant: "default" };
    default:
      return { id: "spark.fallback", variant: "default" };
  }
}

const L5_OF: Record<string, SparkL5Key> = {
  "spark.supply": "supply",
  "spark.withdraw": "withdraw",
  "spark.borrow": "borrow",
  "spark.repay": "repay",
  "spark.transfer_in": "transfer",
  "spark.transfer_out": "transfer",
  "spark.gateway": "withdraw",
  "spark.fee": "liquidation",
  "spark.liquidation": "liquidation",
  "spark.fallback": "fallback",
};

/** An e-mode category as a phrase: none, the named category, or its number. */
const emodeName = (e: SparkEmodeRead): string =>
  e.id === 0
    ? SPARK_WORDS.emode_none
    : e.label
      ? `${SPARK_WORDS.emode_the} ${e.label} ${SPARK_WORDS.emode_post}`
      : `${SPARK_WORDS.emode_post} ${e.id}`;

/** One event's explanation and modal. */
export function sparkEventProse(input: SparkProseInput): SparkEventProse {
  const { ctx, owner, siblings, state } = input;
  const sel = pick(ctx, siblings);
  const variant = sel.variant;
  const run = PROSE.start(PROSE.template(sel.id), null);
  const { t, values, sp } = run;
  const v = values;

  v.symbol = ctx.reserveSymbol;
  v.amount = Math.abs(Number(ctx.assetsDelta));

  /** What the event did to the health factor, as the room before liquidation. */
  const health = () => {
    if (!state) return;
    const b = state.before.hf;
    const a = state.after.hf;
    if (a == null) {
      if (b != null) sp.say("hf.none");
      return;
    }
    if (a <= 1) return;
    v.fall_after = fallTo1(a);
    if (b == null) {
      if (fallTo1(a) <= FIRST_DEBT_MAX_FALL) sp.say("hf.first");
      return;
    }
    v.fall_before = b > 1 ? fallTo1(b) : 0;
    const step = fallTo1(a) - fallTo1(b);
    if (Math.abs(step) < FALL_STEP) return;
    sp.say(step > 0 ? "hf.safer" : "hf.less_safe");
  };

  /** An e-mode change: between the previous event and this one (a switch with
   *  no row), or inside this transaction. */
  const emode = () => {
    if (!state) return;
    const p = state.emodePrevious;
    if (p && p.id !== state.emodeBefore.id) {
      v.emode_from = emodeName(p);
      v.emode_to = emodeName(state.emodeBefore);
      sp.say("emode.between");
    } else if (state.emodeBefore.id !== state.emodeAfter.id) {
      v.emode_from = emodeName(state.emodeBefore);
      v.emode_to = emodeName(state.emodeAfter);
      sp.say("emode.now");
    }
  };

  /** Whether a supplied reserve backs borrowing, from its collateral switch and
   *  its liquidation threshold at the block. */
  const collateral = () => {
    const r = state?.reserve;
    if (!state || !r?.collateral) return;
    if (!r.collateral.after) {
      sp.say("coll.off");
      return;
    }
    const lt = state.reserveLtBps ?? r.liquidationThresholdBps ?? 0;
    if (lt === 0) sp.say("coll.zero");
    else if (lt < 100) {
      v.lt = lt / 10000;
      sp.say("coll.low");
    } else {
      v.ltv = (state.reserveLtvBps ?? r.ltvBps ?? 0) / 10000;
      sp.say("coll.on");
    }
  };

  /** A supply, repay or borrow another account sent for the owner. */
  const delegated = (id: string) => {
    if (owner && externalActor(ctx, owner)) sp.say(id);
  };

  switch (t.id) {
    case "spark.supply": {
      sp.say("supply.what", { amount: "amount" });
      delegated("delegated.add");
      collateral();
      emode();
      health();
      break;
    }
    case "spark.withdraw": {
      sp.say(variant === "empty" ? "withdraw.what_empty" : "withdraw.what", { amount: "amount" });
      emode();
      health();
      break;
    }
    case "spark.borrow": {
      sp.say("borrow.what", { amount: "amount" });
      delegated("delegated.borrow");
      const rate = ctx.borrowRate ? Number(ctx.borrowRate) / 1e27 : null;
      if (rate != null && rate > 0) {
        v.rate = rate;
        sp.say("borrow.rate");
      }
      emode();
      health();
      break;
    }
    case "spark.repay": {
      sp.say(ctx.useATokens ? "repay.what_sptokens" : "repay.what", { amount: "amount" });
      delegated("delegated.add");
      if (variant === "full") sp.say("repay.cleared");
      emode();
      health();
      break;
    }
    case "spark.transfer_in": {
      sp.say("transfer_in.what", { amount: "amount_in" });
      collateral();
      emode();
      health();
      break;
    }
    case "spark.transfer_out": {
      sp.say("transfer_out.what", { amount: "amount_out" });
      emode();
      health();
      break;
    }
    case "spark.gateway": {
      sp.say("gateway.what", { amount: "amount_out" });
      sp.say("gateway.counts");
      emode();
      health();
      break;
    }
    case "spark.fee": {
      const liq = sparkFeeLiquidation(ctx, siblings);
      const b = liq ? liquidationBonus(liq, ctx) : null;
      v.fee = Math.abs(Number(ctx.assetsDelta));
      sp.say("fee.what", { fee: "amount_out" });
      if (b?.feeShare != null) {
        v.fee_share = b.feeShare;
        sp.say("fee.share");
      } else sp.say("fee.see");
      break;
    }
    case "spark.liquidation": {
      const fee = sparkLiquidationFee(ctx, siblings);
      const b = liquidationBonus(ctx, fee);
      const collSymbol = ctx.collateralSymbol ?? ctx.reserveSymbol;
      v.coll_symbol = collSymbol;
      v.debt_symbol = ctx.reserveSymbol;
      v.seized = Number(ctx.liquidatedCollateralAmount ?? Math.abs(Number(ctx.assetsDelta)));
      v.cleared = Number(ctx.debtToCover ?? Math.abs(Number(ctx.debtDelta)));
      const echo = { seized: "seized", cleared: "cleared" } as const;
      if (ctx.liquidator) {
        v.liquidator = ctx.liquidator;
        sp.say("liq.what", echo);
      } else sp.say("liq.what_anon", echo);

      // Why the account was liquidatable: the oracle move since the previous
      // event, else the health factor at the call.
      const hfCall = state ? (state.liqHfAtCall ?? state.before.hf) : null;
      if (state && hfCall != null) {
        v.hf_call = hfCall;
        const move = state.priceMove;
        const priceTo = state.liqPriceMove?.to ?? move?.to;
        if (move && priceTo != null && priceTo < move.from) {
          v.move_symbol = move.symbol;
          v.move = 1 - priceTo / move.from;
          sp.say("liq.why_fell");
        } else sp.say("liq.why");
      } else sp.say("liq.why_plain");

      // The bonus: the collateral reserve's (or its e-mode category's) at the end
      // of the block before, and the treasury's share of it.
      const r = state?.reserve;
      const configured =
        r && r.inEmode && state && state.emodeBefore.id !== 0 && state.emodeBefore.liquidationBonusBps != null
          ? state.emodeBefore.liquidationBonusBps
          : (r?.liquidationBonusBps ?? null);
      const feeBps = r?.liquidationProtocolFeeBps ?? null;
      if (b && configured != null && configured > 10000) {
        v.bonus = (configured - 10000) / 10000;
        if (feeBps != null && feeBps > 0 && b.feeAmt > 0) {
          v.fee_share = feeBps / 10000;
          sp.say("liq.bonus");
        } else sp.say("liq.bonus_nofee");
      } else if (b) {
        v.premium = b.premium;
        sp.say("liq.premium", { premium: "premium" });
      }
      if (b && b.collUsd - b.clearedUsd > 0.005) {
        v.net_usd = b.collUsd - b.clearedUsd;
        sp.say("liq.net");
      }

      // Where the account stands once the transaction has run.
      if (state) {
        const a = state.after.hf;
        if (a == null) sp.say("hf.none");
        else {
          v.hf_after = a;
          sp.say(a >= 1 ? "liq.after_ok" : "liq.after_low");
        }
      }
      break;
    }
    default: {
      v.event_type = ctx.eventType;
      sp.say("fallback.what");
    }
  }

  // ── The run's sentences ──
  const said = PROSE.finish(run, variant);
  const key = L5_OF[t.id];
  return { ...said, L5: { key, content: sparkModal(key) } };
}

/** L4 as the explanation prints it: one flat run, or one run per group. */
export const sparkExplanationRuns = PROSE.explanationRuns;
