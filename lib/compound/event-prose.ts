// The Compound V3 event prose generator: one event in, its explanation (L4)
// and "?" modal (L5) out as data, on the shared engine
// (lib/shared/event-prose/engine.ts; rails-ops decision 0036, ui-jobs 314).
// The strings come from content/compound/event-prose.yaml and nowhere else;
// this file picks the template and variant and sets the values.
//
// Comet's base axis is signed: a supply lifts the running base toward lending
// (paying down any debt first) and a withdraw drives it toward borrowing, so
// the template follows what the row did to the balance, read from the row's
// after-balance. When the balance is absent (a swept row has none before
// it) the sentences that depend on it are left out. Figures the card's cells,
// notes and price row show stay on the card; the sentence says what they mean.

import type { BaseActivityEvent, CompoundContext } from "@/lib/shared/types/event-shape";
import type { EventProseCore } from "@/lib/shared/event-prose/types";
import type { CometMarket } from "@/lib/compound/asset-catalog";
import { compoundAbsorbSplit, compoundBaseBefore } from "@/lib/compound/row-facts";
import { decimalSub } from "@/lib/utils/format";
import { compoundModal, PROSE, type CompoundL5Key } from "@/lib/compound/event-templates";

export type CompoundEvent = BaseActivityEvent & { context: { protocol: "compound"; data: CompoundContext } };

/** The receipt a figure echoes on the card. */
export type CompoundEchoKey = "delta" | "base_after" | "cleared" | "credit" | "kept";

export type CompoundEventProse = EventProseCore<CompoundL5Key, CompoundEchoKey>;

export interface CompoundProseInput {
  ctx: CompoundContext;
  /** The market, resolved against the page's deployment. */
  market: CometMarket;
  /** Same-transaction events, the absorb-leg seam. */
  siblings: CompoundEvent[];
  self: CompoundEvent;
  /** Set where the owner neither signed the transaction nor provided the
   *  tokens: the sender, whether the wallet is a smart account, and whether
   *  the tokens came through Compound's Bulker. */
  external?: { actor: string; smartAccount: boolean; bulker: boolean } | null;
}

/** Below this magnitude a leg reads as zero: the residual a crossed base
 *  balance or a fully spent balance leaves behind. */
const EPS = 1e-9;

/** What a supply did on each side of zero: the debt it repaid and the rest it lent. */
function supplySides(ctx: CompoundContext, decimals: number): { repaid: number; lent: number } {
  const delta = Number(ctx.assetsDelta);
  const beforeStr = compoundBaseBefore(ctx, decimals);
  const before = beforeStr != null ? Number(beforeStr) : null;
  const repay = before != null && delta > 0 ? Math.min(delta, Math.max(0, -before)) : 0;
  const lent = delta - repay;
  if (beforeStr != null && beforeStr.startsWith("-"))
    return {
      repaid: Number(beforeStr.slice(1)),
      lent: Number(decimalSub(ctx.assetsDelta, beforeStr.slice(1)) ?? lent),
    };
  return { repaid: 0, lent };
}

/** What a withdraw did: the part from the lent balance and the part borrowed. */
function withdrawSides(ctx: CompoundContext, decimals: number): { fromSavings: number; borrowed: number } {
  const mag = Math.abs(Number(ctx.assetsDelta));
  const beforeStr = compoundBaseBefore(ctx, decimals);
  const before = beforeStr != null ? Number(beforeStr) : null;
  const fromSavings = before != null ? Math.min(mag, Math.max(0, before)) : mag;
  return { fromSavings, borrowed: mag - fromSavings };
}

const isZeroAmount = (ctx: CompoundContext) => /^-?0(\.0*)?$/.test(ctx.assetsDelta);

function pick(ctx: CompoundContext, market: CometMarket): { id: string; variant: string } {
  switch (ctx.eventType) {
    case "supply": {
      if (isZeroAmount(ctx)) return { id: "compound3.supply", variant: "zero" };
      if (ctx.baseUnsettled) return { id: "compound3.supply", variant: "unsettled" };
      const s = supplySides(ctx, market.baseDecimals);
      if (s.repaid > EPS && s.lent > EPS) return { id: "compound3.supply", variant: "split" };
      return { id: "compound3.supply", variant: s.repaid > EPS ? "repay" : "lend" };
    }
    case "withdraw": {
      if (isZeroAmount(ctx)) return { id: "compound3.withdraw", variant: "zero" };
      if (ctx.baseUnsettled) return { id: "compound3.withdraw", variant: "unsettled" };
      const s = withdrawSides(ctx, market.baseDecimals);
      if (s.borrowed > EPS && s.fromSavings > EPS) return { id: "compound3.withdraw", variant: "split" };
      return { id: "compound3.withdraw", variant: s.borrowed > EPS ? "borrow" : "savings" };
    }
    case "supply_collateral":
      return { id: "compound3.supply_collateral", variant: "default" };
    case "withdraw_collateral":
      return { id: "compound3.withdraw_collateral", variant: "default" };
    case "absorb_debt": {
      const split = compoundAbsorbSplit(ctx);
      return { id: "compound3.absorb_debt", variant: split && Number(split.credit) > EPS ? "credit" : "plain" };
    }
    case "absorb_collateral": {
      const priced = ctx.usdValue != null && Number.isFinite(Number(ctx.usdValue));
      return { id: "compound3.absorb_collateral", variant: priced ? "priced" : "unpriced" };
    }
    case "transfer_in":
    case "transfer_out":
      return { id: "compound3.transfer", variant: ctx.eventType === "transfer_out" ? "out" : "in" };
    case "transfer_collateral_in":
    case "transfer_collateral_out":
      return {
        id: "compound3.transfer_collateral",
        variant: ctx.eventType === "transfer_collateral_out" ? "out" : "in",
      };
    default:
      return { id: "compound3.fallback", variant: "default" };
  }
}

const L5_OF: Record<string, CompoundL5Key> = {
  "compound3.supply": "supply",
  "compound3.withdraw": "withdraw",
  "compound3.supply_collateral": "collateral_in",
  "compound3.withdraw_collateral": "collateral_out",
  "compound3.absorb_debt": "absorb",
  "compound3.absorb_collateral": "absorb",
  "compound3.transfer": "transfer_base",
  "compound3.transfer_collateral": "transfer_collateral",
  "compound3.fallback": "fallback",
};

/** One event's explanation and modal. */
export function compoundEventProse(input: CompoundProseInput): CompoundEventProse {
  const { ctx, market, siblings, self } = input;
  const sel = pick(ctx, market);
  const variant = sel.variant;
  const run = PROSE.start(PROSE.template(sel.id));
  const { t, values, sp } = run;
  const v = values;

  const signedDelta = Number.isFinite(Number(ctx.assetsDelta)) ? Number(ctx.assetsDelta) : 0;
  v.delta = Math.abs(signedDelta);
  v.asset_symbol = ctx.assetSymbol;
  v.market = ctx.marketLabel;
  v.base_symbol = market.baseSymbol;
  const moved = { delta: "delta" } as const;

  // The resulting base state: what the balance now is, from the row's
  // after-balance. `skip` leaves out the state the lead sentence already states.
  const sayBase = (skip: "lends" | "owes" | null) => {
    if (ctx.baseUnsettled) return sp.say("base.unsettled");
    if (ctx.baseAfter == null) return;
    const a = Number(ctx.baseAfter);
    const state = a > EPS ? "lends" : a < -EPS ? "owes" : "flat";
    if (state === skip) return;
    sp.say(state === "lends" ? "base.lends" : state === "owes" ? "base.owes" : "base.flat");
  };

  // The collateral's resulting role: the base debt it stands behind, or none.
  const sayCollateral = (arrived: boolean) => {
    if (ctx.baseAfter == null || ctx.baseUnsettled) return;
    const a = Number(ctx.baseAfter);
    if (a < -EPS) {
      v.base_debt = Math.abs(a);
      sp.say(arrived ? "coll.backs_debt" : "coll.still_backs", { base_debt: "base_after" });
    } else sp.say(arrived ? "coll.no_debt_in" : "coll.no_debt_out");
  };

  // Who sent the transaction and where the tokens came from, when the owner
  // neither signed it nor provided them.
  const sayActor = () => {
    const ext = input.external;
    if (!ext || !ctx.funder) return;
    v.actor = ext.actor;
    v.funder = ctx.funder;
    if (ext.smartAccount) sp.say("actor.bundler");
    else if (ctx.funder === ext.actor) sp.say("actor.sent_funded");
    else sp.say("actor.sent");
    if (ctx.funder !== ext.actor) sp.say(ext.bulker ? "actor.tokens_bulker" : "actor.tokens_from");
  };

  switch (t.id) {
    case "compound3.supply": {
      if (variant === "zero") {
        sp.say("supply.zero");
        break;
      }
      if (variant === "lend") sp.say("supply.what_lend", moved);
      else if (variant === "repay") sp.say("supply.what_repay", moved);
      else sp.say("supply.what", moved);
      if (variant === "split") {
        const s = supplySides(ctx, market.baseDecimals);
        v.repaid = s.repaid;
        v.lent = s.lent;
        sp.say("supply.split");
      }
      sayActor();
      sayBase(variant === "lend" || variant === "split" ? "lends" : null);
      break;
    }
    case "compound3.withdraw": {
      if (variant === "zero") {
        sp.say("withdraw.zero");
        break;
      }
      if (variant === "savings") sp.say("withdraw.what_savings", moved);
      else if (variant === "borrow") sp.say("withdraw.what_borrow", moved);
      else sp.say("withdraw.what", moved);
      if (variant === "split") {
        const s = withdrawSides(ctx, market.baseDecimals);
        v.from_savings = s.fromSavings;
        v.borrowed = s.borrowed;
        sp.say("withdraw.split");
      }
      sayBase(variant === "borrow" || variant === "split" ? "owes" : null);
      break;
    }
    case "compound3.supply_collateral": {
      sp.say("coll.what_in", moved);
      sayActor();
      sayCollateral(true);
      break;
    }
    case "compound3.withdraw_collateral": {
      sp.say("coll.what_out", moved);
      sayCollateral(false);
      break;
    }
    case "compound3.absorb_debt": {
      const split = compoundAbsorbSplit(ctx);
      v.cleared = split ? Number(split.cleared) : Math.abs(signedDelta);
      sp.say("absorb.what");
      if (variant === "credit") {
        v.credit = Number(split?.credit ?? 0);
        sp.say("absorb.cleared_credit", { cleared: "cleared", credit: "credit" });
      } else sp.say("absorb.cleared", { cleared: "cleared" });
      // The protocol's margin, from the legs' valuations.
      const legs = ctx.absorbedCollateral;
      const creditedUsd = Number(ctx.usdValue);
      if (split && legs?.length && Number.isFinite(creditedUsd) && creditedUsd > 0) {
        const seizedUsd = legs.reduce((s, l) => s + Number(l.usdValue), 0);
        if (Number.isFinite(seizedUsd)) {
          const kept = seizedUsd - creditedUsd;
          if (kept >= 0) {
            v.kept = kept;
            sp.say("absorb.kept", { kept: "kept" });
          } else {
            v.short = -kept;
            sp.say("absorb.short", { short: "kept" });
          }
        }
      }
      break;
    }
    case "compound3.absorb_collateral": {
      if (variant === "priced") {
        v.seized_usd = Number(ctx.usdValue);
        sp.say("seize.what_usd", moved);
      } else sp.say("seize.what", moved);
      // The cross-reference reads the transaction, so it holds even where the
      // absorb row is on another page.
      const sib = siblings.find((s) => s !== self && s.context.data.eventType === "absorb_debt");
      if (sib) {
        const sc = sib.context.data;
        v.sibling_cleared = Number(compoundAbsorbSplit(sc)?.cleared ?? Math.abs(Number(sc.assetsDelta)));
        sp.say("seize.same_tx_amount");
      } else sp.say("seize.same_tx");
      break;
    }
    case "compound3.transfer": {
      sp.say(variant === "in" ? "xfer.in" : "xfer.out", moved);
      sayBase(null);
      break;
    }
    case "compound3.transfer_collateral": {
      sp.say(variant === "in" ? "xfer_coll.in" : "xfer_coll.out", moved);
      sayCollateral(variant === "in");
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
  return { ...said, L5: { key, content: compoundModal(key) } };
}

/** L4 as the explanation prints it: one flat run, or one run per group. */
export const compoundExplanationRuns = PROSE.explanationRuns;
