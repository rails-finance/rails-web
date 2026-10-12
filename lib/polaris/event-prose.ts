// The Polaris event prose generator: one event in, its explanation (L4) and
// "?" modal (L5) out as data, on the shared engine
// (lib/shared/event-prose/engine.ts; rails-ops decision 0036, ui-jobs 314).
// The strings come from content/polaris/event-prose.yaml and nowhere else;
// this file picks the template and variant and sets the values.
//
// A sentence is keyed on the event's resulting state (a deposit, a close that
// repaid, a liquidation the stability pool absorbed), never on the kind alone.
// Figures the card's cells, notes and price row show (the balances after, the
// legs, the liquidation's valuation) stay on the card; a sentence says what
// they mean.

import type { PolarisContext } from "@/lib/shared/types/event-shape";
import type { EventProseCore } from "@/lib/shared/event-prose/types";
import {
  POLARIS_LIQ_CONSTANTS,
  polarisLiquidationFigures,
} from "@/components/protocol/polaris/polaris-liquidation-forensics";
import { polarisModal, POLARIS_WORDS, PROSE, type PolarisL5Key } from "@/lib/polaris/event-templates";

/** The receipt a figure echoes on the card. */
export type PolarisEchoKey = "coll" | "debt" | "zero";

export type PolarisEventProse = EventProseCore<PolarisL5Key, PolarisEchoKey>;

export interface PolarisProseInput {
  ctx: PolarisContext;
}

const EPS = 1e-9;

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};

function pick(ctx: PolarisContext): { id: string; variant: string } {
  const dColl = num(ctx.collChange);
  const dDebt = num(ctx.debtChange);
  switch (ctx.eventType) {
    case "open":
      return {
        id: "polaris.open",
        variant: dColl > EPS && dDebt > EPS ? "with_debt" : dColl > EPS ? "no_debt" : "bare",
      };
    case "adjust":
      return { id: "polaris.adjust", variant: Math.abs(dColl) > EPS || Math.abs(dDebt) > EPS ? "moved" : "unmoved" };
    case "close":
      return {
        id: "polaris.close",
        variant:
          dDebt < -EPS && dColl < -EPS ? "both" : dDebt < -EPS ? "repay_only" : dColl < -EPS ? "withdraw_only" : "bare",
      };
    case "liquidate": {
      const priced = polarisLiquidationFigures(ctx) != null;
      return {
        id: "polaris.liquidation",
        variant: ctx.spAbsorbed ? (priced ? "pool_priced" : "pool") : priced ? "redistributed_priced" : "redistributed",
      };
    }
    case "transfer":
      return { id: "polaris.transfer", variant: ctx.fromAddr && ctx.toAddr ? "both" : "none" };
    default:
      return { id: "polaris.fallback", variant: "default" };
  }
}

const L5_OF: Record<string, PolarisL5Key> = {
  "polaris.open": "open",
  "polaris.adjust": "adjust",
  "polaris.close": "close",
  "polaris.liquidation": "liquidation",
  "polaris.transfer": "transfer",
  "polaris.fallback": "fallback",
};

/** One event's explanation and modal. */
export function polarisEventProse(input: PolarisProseInput): PolarisEventProse {
  const { ctx } = input;
  const sel = pick(ctx);
  const variant = sel.variant;
  const run = PROSE.start(PROSE.template(sel.id));
  const { t, values, sp } = run;
  const v = values;

  v.stable = ctx.stableSymbol;
  v.coll_change = Math.abs(num(ctx.collChange));
  v.debt_change = Math.abs(num(ctx.debtChange));
  v.escrow = POLARIS_LIQ_CONSTANTS.gasComp.amount;
  v.mcr = POLARIS_LIQ_CONSTANTS.mcr.fraction;
  const coll = { coll_change: "coll" } as const;
  const debt = { debt_change: "debt" } as const;

  // The legs the touch wrote in, in the card's order: named in one sentence.
  const sayLegs = () => {
    const names: string[] = [];
    if (num(ctx.accruedInterest) > EPS) names.push(POLARIS_WORDS.leg_interest);
    if (num(ctx.stableGain) > EPS) names.push(POLARIS_WORDS.leg_gain);
    if (num(ctx.bcTokenGain) > EPS) names.push(POLARIS_WORDS.leg_reward);
    if (names.length === 0) return;
    v.legs =
      names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(", ")} ${POLARIS_WORDS.and} ${names[names.length - 1]}`;
    sp.say("legs.written");
  };
  const sayPsm = () => {
    if (Math.abs(num(ctx.mintRedeemCollGain)) > EPS || Math.abs(num(ctx.mintRedeemDebtGain)) > EPS) sp.say("psm.share");
  };
  const saySettled = () => {
    if (num(ctx.stablesMintedToEnsureZeroDebt) > EPS) {
      v.zero_mint = num(ctx.stablesMintedToEnsureZeroDebt);
      sp.say("zero.settled", { zero_mint: "zero" });
    }
  };

  switch (t.id) {
    case "polaris.open": {
      if (variant === "with_debt") sp.say("open.what_debt", { ...coll, ...debt });
      else if (variant === "no_debt") sp.say("open.what_no_debt", coll);
      else sp.say("open.what_bare");
      if (variant !== "bare") sp.say("open.escrow", { escrow: "bold" });
      break;
    }
    case "polaris.adjust": {
      if (variant === "unmoved") sp.say("adj.none");
      else {
        const dColl = num(ctx.collChange);
        const dDebt = num(ctx.debtChange);
        if (dColl > EPS) sp.say("adj.deposit", coll);
        if (dColl < -EPS) sp.say("adj.withdraw", coll);
        if (dDebt > EPS) sp.say("adj.borrow", debt);
        if (dDebt < -EPS) sp.say("adj.repay", debt);
      }
      sayLegs();
      sayPsm();
      saySettled();
      break;
    }
    case "polaris.close": {
      if (variant === "both") sp.say("close.both", { ...coll, ...debt });
      else if (variant === "repay_only") sp.say("close.repay", debt);
      else if (variant === "withdraw_only") sp.say("close.withdraw", coll);
      else sp.say("close.bare");
      sayLegs();
      sayPsm();
      saySettled();
      sp.say("close.ended");
      break;
    }
    case "polaris.liquidation": {
      const figures = polarisLiquidationFigures(ctx);
      if (figures) {
        v.penalty = POLARIS_LIQ_CONSTANTS[figures.path].fraction;
        sp.say("liq.what_priced", { mcr: "bold" });
      } else sp.say("liq.what");
      if (ctx.spAbsorbed) sp.say("liq.pool");
      else sp.say("liq.redistributed");
      if (figures) sp.say(figures.path === "sp" ? "liq.penalty_pool" : "liq.penalty_redist", { penalty: "bold" });
      sayLegs();
      if (num(ctx.collSurplus) > EPS) sp.say("liq.surplus");
      break;
    }
    case "polaris.transfer": {
      if (variant === "both") {
        v.from_addr = ctx.fromAddr ?? "";
        v.to_addr = ctx.toAddr ?? "";
        sp.say("xfer.what");
      } else sp.say("xfer.what_none");
      sp.say("xfer.holder");
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
  return { ...said, L5: { key, content: polarisModal(key) } };
}

/** L4 as the explanation prints it: one flat run, or one run per group. */
export const polarisExplanationRuns = PROSE.explanationRuns;
