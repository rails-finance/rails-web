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
import { polarisPsmShareValue } from "@/lib/polaris/economics";
import { PETH } from "@/lib/polaris/asset-catalog";

/** The receipt a figure echoes on the card. */
export type PolarisEchoKey = "coll" | "debt" | "zero" | "psm_coll" | "psm_debt" | "psm_net";

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
  // The settled PSM share: with the block's price, its two legs netted in the
  // stablecoin (lib/polaris/economics.ts), the side it favours in words;
  // without one, the two legs, each signed.
  const sayPsm = () => {
    const mrColl = num(ctx.mintRedeemCollGain);
    const mrDebt = num(ctx.mintRedeemDebtGain);
    if (Math.abs(mrColl) <= EPS && Math.abs(mrDebt) <= EPS) return;
    const price = ctx.priceAtBlock?.pethInDebt;
    if (price != null && price > 0) {
      const net = polarisPsmShareValue(mrColl, mrDebt, price);
      v.psm_net = Math.abs(net);
      sp.say(net < 0 ? "psm.share_neg" : "psm.share_pos", { psm_net: "psm_net" });
      return;
    }
    v.psm_coll = mrColl;
    v.psm_debt = mrDebt;
    sp.say("psm.share_unpriced", { psm_coll: "psm_coll", psm_debt: "psm_debt" });
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

// ── T1: the timeline head ────────────────────────────────────────────────────

/** A clause after the head's kind (rails-ops decision 0045): a liquidation's
 *  surplus, or a transfer's recipient after `lead`. */
export type PolarisT1Clause = { surplus: number; symbol: string; word: string } | { lead: string; address: string };

export interface PolarisT1Words {
  kind: string;
  clauses: PolarisT1Clause[];
}

/** The timeline head's words: the past-participle kind, and the legs as words
 *  where the kind alone says nothing, in the order they run (what goes into
 *  the CDP before what comes out, the collateral first where both go one way;
 *  rails-ops reference/shared-event-card-spec.md, "Spine order"). */
export function polarisT1Words(ctx: PolarisContext): PolarisT1Words {
  const W = POLARIS_WORDS;
  switch (ctx.eventType) {
    case "open":
      return { kind: W.t1_opened, clauses: [] };
    case "close":
      return { kind: W.t1_closed, clauses: [] };
    case "adjust": {
      const coll = num(ctx.collChange);
      const debt = num(ctx.debtChange);
      const c = coll > 0 ? W.t1_added_coll : W.t1_withdrew_coll;
      const d = debt > 0 ? W.t1_borrowed : W.t1_repaid;
      if (coll === 0 && debt === 0) return { kind: W.t1_touched, clauses: [] };
      if (debt === 0) return { kind: c, clauses: [] };
      if (coll === 0) return { kind: d, clauses: [] };
      // A repayment goes in and a withdrawal comes out: the repayment first.
      return { kind: debt < 0 && coll < 0 ? `${d} ${W.t1_sep} ${c}` : `${c} ${W.t1_sep} ${d}`, clauses: [] };
    }
    case "liquidate": {
      const surplus = num(ctx.collSurplus);
      return {
        kind: W.t1_liquidated,
        clauses: surplus > 0 ? [{ surplus, symbol: PETH.symbol, word: W.t1_claimable }] : [],
      };
    }
    case "transfer":
      return { kind: W.t1_transferred, clauses: ctx.toAddr ? [{ lead: W.t1_to, address: ctx.toAddr }] : [] };
    default:
      return { kind: W.t1_touched, clauses: [] };
  }
}

/** The head's words as one line, for the phone caption and the row's
 *  accessible name. */
export function polarisT1Caption(words: PolarisT1Words): string {
  const parts = words.clauses.map((c) =>
    "surplus" in c
      ? `${c.surplus.toFixed(4)} ${c.symbol} ${c.word}`
      : `${c.lead} ${c.address.slice(0, 6)}…${c.address.slice(-4)}`,
  );
  return [words.kind, ...parts].join(` ${POLARIS_WORDS.t1_sep} `);
}
