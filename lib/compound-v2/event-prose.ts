// The Compound V2 event prose generator: one event in, its explanation (L4)
// and "?" modal (L5) out as data, on the shared engine
// (lib/shared/event-prose/engine.ts; rails-ops decision 0036, ui-jobs 314).
// The strings come from content/compound-v2/event-prose.yaml and nowhere else;
// this file picks the template and variant and sets the values.
//
// Compound V2 is cross-market through one risk controller, so a single event
// carries only its market's after-fields; when an after-field is absent the
// sentence that reads it is left out. Figures the card's cells, notes and price
// row show (the cToken and debt balances after, the seizure's valuation) stay
// on the card; the sentence says what they mean.

import type { BaseActivityEvent, CompoundV2Context } from "@/lib/shared/types/event-shape";
import type { EventProseCore } from "@/lib/shared/event-prose/types";
import { isCompoundV2Deprecated } from "@/lib/compound-v2/deprecated-markets";
import { COMPOUND_V2_MARKET_BY_KEY, COMPOUND_V2_NO_SEIZE_SHARE } from "@/lib/compound-v2/asset-catalog";
import { compoundV2Modal, PROSE, type CompoundV2L5Key } from "@/lib/compound-v2/event-templates";

export type CompoundV2Event = BaseActivityEvent & { context: { protocol: "compound-v2"; data: CompoundV2Context } };

/** The receipt a figure echoes on the card. */
export type CompoundV2EchoKey = "delta" | "ctokens" | "repaid" | "seized";

export type CompoundV2EventProse = EventProseCore<CompoundV2L5Key, CompoundV2EchoKey>;

export interface CompoundV2ProseInput {
  ctx: CompoundV2Context;
  /** Same-transaction events, the seize seam. */
  siblings: CompoundV2Event[];
  self: CompoundV2Event;
  /** Set where another address paid the repayment. */
  externalBy?: string;
  /** The block the event is in: whether a market was deprecated then. */
  blockNumber?: number;
}

const EPS = 1e-9;

/** What is left after the event, from its after-fields. */
function resultingState(ctx: CompoundV2Context) {
  const supplyAfter = ctx.supplyAfter != null ? Number(ctx.supplyAfter) : null;
  const debtAfter = ctx.debtAfter != null ? Number(ctx.debtAfter) : null;
  return {
    hasDebtAfter: debtAfter != null && debtAfter > EPS,
    debtCleared: debtAfter != null && debtAfter <= EPS,
    supplyEmptied: supplyAfter != null && supplyAfter <= EPS,
    debtAfter,
  };
}

/** The debt before a borrow: the row's figure, else the debt after less the amount. */
function debtBeforeBorrow(ctx: CompoundV2Context): number | null {
  if (ctx.debtBefore != null) return Number(ctx.debtBefore);
  const after = ctx.debtAfter != null ? Number(ctx.debtAfter) : null;
  return after != null && ctx.assetsDelta != null ? after - Number(ctx.assetsDelta) : null;
}

function pick(input: CompoundV2ProseInput): { id: string; variant: string } {
  const { ctx } = input;
  const rs = resultingState(ctx);
  switch (ctx.eventType) {
    case "mint":
      return { id: "compound2.mint", variant: "default" };
    case "redeem":
      return { id: "compound2.redeem", variant: rs.supplyEmptied ? "emptied" : "default" };
    case "borrow": {
      const before = debtBeforeBorrow(ctx);
      return { id: "compound2.borrow", variant: before != null && before <= EPS ? "first" : "more" };
    }
    case "repay":
      return { id: "compound2.repay", variant: rs.debtCleared ? "cleared" : rs.hasDebtAfter ? "left" : "unknown" };
    case "liquidation":
      return {
        id: "compound2.liquidation",
        variant: isCompoundV2Deprecated(ctx.market, input.blockNumber) ? "deprecated" : "account",
      };
    case "transfer_in":
    case "transfer_out":
      return { id: "compound2.transfer", variant: ctx.eventType === "transfer_out" ? "out" : "in" };
    case "seize_out":
      return { id: "compound2.seize_out", variant: "default" };
    case "seize_in":
      return { id: "compound2.seize_in", variant: "default" };
    case "seize_burn":
      return { id: "compound2.seize_burn", variant: "default" };
    default:
      return { id: "compound2.fallback", variant: "default" };
  }
}

const L5_OF: Record<string, CompoundV2L5Key> = {
  "compound2.mint": "supply",
  "compound2.redeem": "withdraw",
  "compound2.borrow": "borrow",
  "compound2.repay": "repay",
  "compound2.liquidation": "liquidation",
  "compound2.seize_out": "seize_out",
  "compound2.seize_in": "seize_in",
  "compound2.seize_burn": "seize_burn",
  "compound2.fallback": "fallback",
};

/** The modal's key, which depends on the event's kind (and a transfer's direction). */
function modalKey(ctx: CompoundV2Context, id: string): CompoundV2L5Key {
  if (id === "compound2.transfer") return ctx.eventType === "transfer_out" ? "transfer_out" : "transfer_in";
  return L5_OF[id];
}

/** The modal's forms: a seizure in a market with no protocol share reads differently. */
function modalForm(ctx: CompoundV2Context): string[] {
  const seized = ctx.collateralMarket ?? ctx.market;
  return ctx.eventType.startsWith("seize") && COMPOUND_V2_NO_SEIZE_SHARE.has(seized) ? ["no_share"] : [];
}

/** One event's explanation and modal. */
export function compoundV2EventProse(input: CompoundV2ProseInput): CompoundV2EventProse {
  const { ctx, siblings, self } = input;
  const sel = pick(input);
  const variant = sel.variant;
  const run = PROSE.start(PROSE.template(sel.id));
  const { t, values, sp } = run;
  const v = values;
  const rs = resultingState(ctx);

  const market = COMPOUND_V2_MARKET_BY_KEY[ctx.market];
  v.market_symbol = ctx.marketSymbol;
  v.c_symbol = market?.cSymbol ?? `c${ctx.marketSymbol}`;
  v.delta = Math.abs(Number(ctx.assetsDelta));
  v.ctokens = Math.abs(Number(ctx.cTokensDelta));
  const underlying = { delta: "delta" } as const;
  const cTokens = { ctokens: "ctokens" } as const;

  // A seize leg is never a standalone act: its debt repayment is a
  // LiquidateBorrow in the same transaction, whose market is the debt cleared.
  const saySameTx = () => {
    const debtSymbol = siblings.find((s) => s !== self && s.context.data.eventType === "liquidation")?.context.data
      .marketSymbol;
    if (debtSymbol) {
      v.debt_symbol = debtSymbol;
      sp.say("seize.same_tx_symbol");
    } else sp.say("seize.same_tx");
  };

  switch (t.id) {
    case "compound2.mint": {
      sp.say("mint.what", { ...underlying, ...cTokens });
      break;
    }
    case "compound2.redeem": {
      sp.say("redeem.what", { ...underlying, ...cTokens });
      if (variant === "emptied") sp.say("redeem.emptied");
      break;
    }
    case "compound2.borrow": {
      sp.say("borrow.what", underlying);
      if (variant === "first") sp.say("borrow.first");
      break;
    }
    case "compound2.repay": {
      sp.say("repay.what", underlying);
      if (input.externalBy) sp.say("repay.by_other");
      if (variant === "cleared") sp.say("repay.cleared");
      else if (variant === "left") sp.say("repay.left");
      break;
    }
    case "compound2.liquidation": {
      v.repaid = Math.abs(Number(ctx.assetsDelta));
      const collateral = ctx.collateralMarket ? COMPOUND_V2_MARKET_BY_KEY[ctx.collateralMarket] : undefined;
      const collateralCSymbol = collateral?.cSymbol ?? (ctx.collateralSymbol ? `c${ctx.collateralSymbol}` : "");
      if (ctx.seizeTokens != null && collateralCSymbol) {
        v.seized = Number(ctx.seizeTokens);
        v.collateral_csymbol = collateralCSymbol;
        sp.say("liq.what", { repaid: "repaid", seized: "seized" });
      } else sp.say("liq.what_no_seize", { repaid: "repaid" });
      sp.say(variant === "deprecated" ? "liq.why_deprecated" : "liq.why_account");
      if (rs.hasDebtAfter) sp.say("liq.survived");
      else if (rs.debtCleared) sp.say("liq.cleared");
      break;
    }
    case "compound2.transfer": {
      sp.say(variant === "in" ? "xfer.in" : "xfer.out", cTokens);
      sp.say(variant === "in" ? "xfer.claim_in" : "xfer.claim_out");
      break;
    }
    case "compound2.seize_out": {
      sp.say("seize_out.what", cTokens);
      saySameTx();
      break;
    }
    case "compound2.seize_in": {
      sp.say("seize_in.what", cTokens);
      saySameTx();
      break;
    }
    case "compound2.seize_burn": {
      sp.say("seize_burn.what", cTokens);
      break;
    }
    default: {
      v.event_type = ctx.eventType;
      sp.say("fallback.what");
    }
  }

  // ── The run's sentences ──
  const said = PROSE.finish(run, variant);
  const key = modalKey(ctx, t.id);
  return { ...said, L5: { key, content: compoundV2Modal(key, modalForm(ctx)) } };
}

/** L4 as the explanation prints it: one flat run, or one run per group. */
export const compoundV2ExplanationRuns = PROSE.explanationRuns;
