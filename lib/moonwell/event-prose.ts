// The Moonwell event prose generator: one event in, its explanation (L4) and
// "?" modal (L5) out as data, on the shared engine
// (lib/shared/event-prose/engine.ts; rails-ops decision 0036, ui-jobs 314).
// The strings come from content/moonwell/event-prose.yaml and nowhere else;
// this file picks the template and variant and sets the values.
//
// Every value a template reads is kept unrounded in `values`; a sentence is its
// id, the placeholders it read and its text as segments, so the card can echo a
// figure into its receipt without the text changing
// (components/protocol/moonwell/moonwell-event-explainer.tsx).
//
// The indexed stream carries no per-event health factor, collateral ratio or
// oracle price, so an explanation keys on the event's resulting state (what the
// position looks like after it) and on the row's figures. Figures the
// card's cells, notes and price row show stay on the card.

import type { MoonwellContext } from "@/lib/shared/types/event-shape";
import type { EventProseCore } from "@/lib/shared/event-prose/types";
import { MOONWELL_WORDS, PROSE, moonwellModal, type MoonwellL5Key } from "@/lib/moonwell/event-templates";

/** The receipt a figure echoes on the card. */
export type MoonwellEchoKey = "amount" | "mtokens" | "mtokens_in" | "mtokens_out" | "repaid" | "seized";

export type MoonwellEventProse = EventProseCore<MoonwellL5Key, MoonwellEchoKey>;

export interface MoonwellProseInput {
  ctx: MoonwellContext;
  /** A third party executed the event (owner neither signer nor party). */
  externalBy?: string;
  /** The market's mToken address: a transfer to it is the protocol's share of a seize. */
  mtoken?: string;
  /** The market's mToken label ("mWETH"). */
  marketLabel?: string;
}

/** A balance at or below this reads as an emptied leg. */
export const MOONWELL_EPS = 1e-9;

const num = (h: string | undefined): number | null => (h == null ? null : Number(h));

/** A transfer to the market's contract only happens as the protocol's cut
 *  of a liquidation seize; it is not a wallet the tokens went to. */
const toMarket = (ctx: MoonwellContext, mtoken?: string): boolean => mtoken != null && ctx.counterparty === mtoken;

function pick(ctx: MoonwellContext, mtoken?: string): { id: string; variant: string } {
  const after = num(ctx.mTokensAfter);
  const emptied = after != null && after <= MOONWELL_EPS;
  switch (ctx.eventType) {
    case "mint":
      return { id: "moonwell.mint", variant: "default" };
    case "redeem":
      return { id: "moonwell.redeem", variant: emptied ? "empty" : "partial" };
    case "borrow": {
      const before = num(ctx.debtBefore);
      return { id: "moonwell.borrow", variant: before != null && before <= MOONWELL_EPS ? "first" : "more" };
    }
    case "repay": {
      const debtAfter = num(ctx.debtAfter);
      return { id: "moonwell.repay", variant: debtAfter != null && debtAfter <= MOONWELL_EPS ? "full" : "partial" };
    }
    case "liquidation":
      return { id: "moonwell.liquidation", variant: "default" };
    case "transfer_in":
      return { id: "moonwell.transfer_in", variant: "default" };
    case "transfer_out":
      return toMarket(ctx, mtoken)
        ? { id: "moonwell.protocol_share", variant: "default" }
        : { id: "moonwell.transfer_out", variant: emptied ? "empty" : "partial" };
    default:
      return { id: "moonwell.fallback", variant: "default" };
  }
}

const L5_OF: Record<string, MoonwellL5Key> = {
  "moonwell.mint": "supply",
  "moonwell.redeem": "withdraw",
  "moonwell.borrow": "borrow",
  "moonwell.repay": "repay",
  "moonwell.liquidation": "liquidation",
  "moonwell.transfer_in": "transfer_in",
  "moonwell.transfer_out": "transfer_out",
  "moonwell.protocol_share": "liquidation",
  "moonwell.fallback": "fallback",
};

/** One event's explanation and modal. */
export function moonwellEventProse(input: MoonwellProseInput): MoonwellEventProse {
  const { ctx, externalBy, mtoken } = input;
  const sel = pick(ctx, mtoken);
  const variant = sel.variant;
  const run = PROSE.start(PROSE.template(sel.id), null);
  const { t, values, sp } = run;
  const v = values;

  const symbol = ctx.marketSymbol ?? MOONWELL_WORDS.the_asset;
  v.symbol = symbol;
  v.msymbol = input.marketLabel ?? `m${symbol}`;
  v.amount = Math.abs(Number(ctx.assetsDelta));
  v.mtokens = Math.abs(Number(ctx.mTokensDelta));

  switch (t.id) {
    case "moonwell.mint": {
      sp.say("mint.what", { amount: "amount", mtokens: "mtokens" });
      if (ctx.routerProxied) sp.say("mint.router");
      break;
    }
    case "moonwell.redeem": {
      sp.say("redeem.what", { amount: "amount", mtokens: "mtokens" });
      if (variant === "empty") sp.say("stake.empty");
      break;
    }
    case "moonwell.borrow": {
      sp.say(variant === "first" ? "borrow.what_first" : "borrow.what", { amount: "amount" });
      break;
    }
    case "moonwell.repay": {
      sp.say("repay.what", { amount: "amount" });
      if (externalBy) sp.say("repay.external");
      if (variant === "full") sp.say("repay.cleared");
      break;
    }
    case "moonwell.liquidation": {
      v.repaid = Math.abs(Number(ctx.assetsDelta));
      // The collateral market's receipt-token label is "m" + its symbol on
      // every deployment, so it needs no catalog.
      if (ctx.seizeTokens != null && ctx.collateralSymbol) {
        v.seized = Number(ctx.seizeTokens);
        v.coll_msymbol = `m${ctx.collateralSymbol}`;
        sp.say("liq.what", { repaid: "repaid", seized: "seized" });
      } else sp.say("liq.what_debt", { repaid: "repaid" });
      sp.say("liq.why");
      if (ctx.liquidator) {
        v.liquidator = ctx.liquidator;
        // Two addresses on a bot's liquidation: the wallet that sent the
        // transaction, and the contract it called, which is the liquidator the
        // market records (it repaid the debt and received the mTokens).
        if (ctx.txFrom && ctx.txFrom.toLowerCase() !== ctx.liquidator.toLowerCase()) {
          v.sender = ctx.txFrom;
          sp.say("liq.sender");
        } else sp.say("liq.bot");
      }
      break;
    }
    case "moonwell.transfer_in": {
      sp.say("transfer_in.what", { mtokens: "mtokens_in" });
      break;
    }
    case "moonwell.transfer_out": {
      sp.say("transfer_out.what", { mtokens: "mtokens_out" });
      if (variant === "empty") sp.say("stake.empty");
      break;
    }
    case "moonwell.protocol_share": {
      sp.say("share.what", { mtokens: "mtokens_out" });
      if (num(ctx.mTokensAfter) != null && (num(ctx.mTokensAfter) as number) <= MOONWELL_EPS) sp.say("stake.empty");
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
  return { ...said, L5: { key, content: moonwellModal(key) } };
}

/** L4 as the explanation prints it: one flat run, or one run per group. */
export const moonwellExplanationRuns = PROSE.explanationRuns;
