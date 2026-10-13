// The Aave V4 event prose generator: one event in, its explanation (L4) and
// "?" modal (L5) out as data, on the shared engine
// (lib/shared/event-prose/engine.ts; rails-ops decision 0036, ui-jobs 314).
// The strings come from content/aave-v4/event-prose.yaml and nowhere else;
// this file picks the template and variant and sets the values.
//
// Every value a template reads is kept unrounded in `values`; a sentence is
// its id, the placeholders it read and its text as segments, so the card can
// echo a figure into its receipt without the text changing
// (components/protocol/aave-v4/aave-v4-event-explainer.tsx).
//
// Figures the card's cells and price row show (the balances either side, the
// interest since the previous event, the health factor either side, the
// borrow rate) stay on the card. The health factor is said only where it
// means something: at or close to the liquidation line, or no longer there.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { AaveV4Context } from "@/lib/shared/types/protocols/aave-v4";
import type { EventProseCore } from "@/lib/shared/event-prose/types";
import type { EventProvDetail } from "@/lib/aave-v4/position-provenance";
import { aaveV4DisplaySymbol } from "@/lib/aave-v4/pt-tokens";
import { borrowRatesByDebt } from "@/lib/aave-v4/borrow-rate";
import { AT_LINE_HF } from "@/lib/aave-v4/format";
import { getSpokeMeta } from "@/lib/aave-v4/spoke-meta";
import { debtHubsOf, HUB_TIER_LABEL } from "@/components/protocol/aave-v4/aave-v4-spoke-constants";
import { aaveV4Modal, PROSE, V4_WORDS, type AaveV4L5Key } from "@/lib/aave-v4/event-templates";

export type AaveV4Event = BaseActivityEvent & { context: { protocol: "aave-v4"; data: AaveV4Context } };

/** The receipt a figure echoes on the card. */
export type AaveV4EchoKey = "amount" | "seized" | "cleared";

export type AaveV4EventProse = EventProseCore<AaveV4L5Key, AaveV4EchoKey>;

/** The health factor either side of the event, as the open card's grid reads
 *  it (useHealthFactorAround), and whether the event's reserve counted as
 *  collateral either side. Absent while the read is in flight. */
export interface AaveV4HfPair {
  before: number | null;
  after: number | null;
  collateral?: { before: boolean; after: boolean };
}

export interface AaveV4ProseInput {
  ctx: AaveV4Context;
  /** This transaction's events (self included), in order. */
  siblings?: readonly AaveV4Event[];
  /** The event, to tell it from its siblings. */
  self?: AaveV4Event;
  hf?: AaveV4HfPair;
  /** The borrow rate (decimal) the previous event recorded for this asset. */
  previousRate?: number;
  /** For a repay that clears its debt: the interest that debt accrued over its life. */
  debtLifeInterest?: number;
}

/** A balance at or below this reads as zero: the detail grid's floor, so the
 *  prose and the grid agree on when a leg is emptied. */
const EPS = 1e-4;
/** Under this health factor the position is close to the liquidation line. */
const CLOSE_HF = 1.05;

const num = (s?: string | null): number | null => {
  if (s == null) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};
const live = (rows?: { amount: string }[]) => (rows ?? []).some((r) => (num(r.amount) ?? 0) > EPS);

/** What an economic event did, for the line naming a transaction's other
 *  events; null for any other kind. */
function act(e: AaveV4Event): string | null {
  const symbol = aaveV4DisplaySymbol(e.context.data.reserveSymbol);
  switch (e.context.data.eventType) {
    case "supply":
      return PROSE.fillText(V4_WORDS.act_supply, { symbol });
    case "withdraw":
      return PROSE.fillText(V4_WORDS.act_withdraw, { symbol });
    case "borrow":
      return PROSE.fillText(V4_WORDS.act_borrow, { symbol });
    case "repay":
      return PROSE.fillText(V4_WORDS.act_repay, { symbol });
    default:
      return null;
  }
}

export function coordsFor(e: AaveV4Event): EventProvDetail {
  const c = e.context.data;
  return { spokeName: c.spokeName, spokeAddress: c.spokeAddress, txHash: e.txHash, blockNumber: e.blockNumber };
}

/** Symbols joined: "USDC", "USDC and USDT", "USDC, USDT and GHO". */
function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} ${V4_WORDS.and} ${parts[parts.length - 1]}`;
}

function pick(ctx: AaveV4Context): { id: string; variant: string } {
  const debtBefore = num(ctx.debtBefore) ?? 0;
  const debtAfter = num(ctx.debtAfter);
  switch (ctx.eventType) {
    case "supply":
      return { id: "aave4.supply", variant: ctx.alsoToggledCollateral ? "enabled" : "default" };
    case "withdraw":
      return { id: "aave4.withdraw", variant: "default" };
    case "borrow":
      return {
        id: "aave4.borrow",
        variant: debtAfter != null && debtAfter > EPS && debtBefore <= EPS ? "first" : "default",
      };
    case "repay": {
      const amount = num(ctx.amount) ?? 0;
      if (debtAfter != null && debtAfter <= EPS && debtBefore > EPS) return { id: "aave4.repay", variant: "cleared" };
      return { id: "aave4.repay", variant: amount > 0 && amount < 0.000001 ? "dust" : "default" };
    }
    case "liquidation":
      return { id: "aave4.liquidation", variant: "default" };
    case "collateral_toggle":
      return { id: "aave4.toggle", variant: ctx.enabled ? "enabled" : "disabled" };
    default:
      return { id: "aave4.fallback", variant: "default" };
  }
}

/** One event's explanation and modal. */
export function aaveV4EventProse(input: AaveV4ProseInput): AaveV4EventProse {
  const { ctx, siblings, self, hf, previousRate, debtLifeInterest } = input;
  const sel = pick(ctx);
  const variant = sel.variant;
  const run = PROSE.start(PROSE.template(sel.id));
  const { t, values, sp } = run;
  const v = values;
  const amount = { amount: "amount" } as const;

  v.symbol = aaveV4DisplaySymbol(ctx.reserveSymbol);
  v.amount = num(ctx.amount) ?? 0;
  v.where = ctx.spokeName ? PROSE.fillText(V4_WORDS.spoke_named, { spoke: ctx.spokeName }) : V4_WORDS.spoke_unnamed;

  // Nothing supplied and nothing owed on the spoke after this event.
  const supplyAfter = num(ctx.supplyAfter);
  const debtAfter = num(ctx.debtAfter);
  const supplyEmptied = supplyAfter != null && supplyAfter <= EPS && (num(ctx.supplyBefore) ?? 0) > EPS;
  const debtCleared = debtAfter != null && debtAfter <= EPS && (num(ctx.debtBefore) ?? 0) > EPS;
  const closes =
    (supplyEmptied || debtCleared) &&
    ctx.allSupplies != null &&
    ctx.allDebts != null &&
    !live(ctx.allSupplies) &&
    !live(ctx.allDebts);
  const otherDebts = (ctx.allDebts ?? [])
    .filter((d) => d.symbol !== ctx.reserveSymbol && (num(d.amount) ?? 0) > EPS)
    .map((d) => aaveV4DisplaySymbol(d.symbol));

  // On a spoke that borrows from more than one hub, the hub this asset came
  // from or went back to.
  const meta = ctx.spokeName ? getSpokeMeta(ctx.spokeName) : null;
  const tier = ctx.hub ? debtHubsOf([{ hub: ctx.hub, hasDebt: true }])[0] : undefined;
  const hub = meta && meta.borrowHubs.length > 1 && tier ? HUB_TIER_LABEL[tier] : null;
  if (hub) v.hub = hub;

  // Who sent it: a caller other than the owner is a position manager (every
  // spoke entry point is gated on one); else the transaction's other events.
  const whoLine = (withSiblings = true) => {
    const owner = ctx.owner?.toLowerCase();
    const caller = ctx.caller?.toLowerCase();
    if (owner && caller && caller !== owner) {
      v.manager = caller;
      return sp.say(ctx.txFrom?.toLowerCase() === owner ? "by_manager" : "by_manager_alone");
    }
    if (!withSiblings) return;
    const others = (siblings ?? [])
      .filter((s) => s !== self && s.id !== self?.id)
      .map(act)
      .filter((a): a is string => a != null);
    if ((siblings?.length ?? 0) < 2 || others.length === 0) return;
    v.sibling_acts = joinWords(others);
    sp.say("sibling");
  };

  // The health factor after the event, where it means something.
  const hfLine = () => {
    const a = hf?.after;
    if (a == null || a < 1) return;
    v.hf_after = a;
    if (a < AT_LINE_HF) sp.say("hf.at_line");
    else if (a < CLOSE_HF) sp.say("hf.close");
  };

  // The asset's borrow rate, where it moved by half or more since the previous event.
  const rateLine = () => {
    const now = num(borrowRatesByDebt(ctx).find((r) => r.symbol === ctx.reserveSymbol)?.apr);
    if (now == null || previousRate == null || previousRate <= 0) return;
    const ratio = now / previousRate;
    if (Math.abs(now - previousRate) < 0.005 || (ratio < 1.5 && ratio > 1 / 1.5)) return;
    v.rate_then = previousRate;
    v.rate_now = now;
    sp.say("rate.moved");
  };

  switch (t.id) {
    case "aave4.supply": {
      sp.say(variant === "enabled" ? "supply.enabled" : "supply.what", amount);
      whoLine();
      const coll = hf?.collateral;
      if (ctx.alsoToggledCollateral || (coll?.after === true && coll.before === false)) sp.say("coll.on");
      else if (coll?.after === true) sp.say("coll.was_on");
      else if (coll?.after === false) sp.say("coll.off");
      hfLine();
      break;
    }
    case "aave4.withdraw": {
      sp.say("withdraw.what", amount);
      whoLine();
      if (closes) sp.say("closed");
      else {
        if (supplyEmptied) sp.say("withdraw.all");
        hfLine();
      }
      break;
    }
    case "aave4.borrow": {
      const first = variant === "first";
      sp.say(first ? (hub ? "borrow.first_hub" : "borrow.first") : hub ? "borrow.what_hub" : "borrow.what", amount);
      whoLine();
      hfLine();
      rateLine();
      break;
    }
    case "aave4.repay": {
      const cleared = variant === "cleared";
      sp.say(cleared ? (hub ? "repay.all_hub" : "repay.all") : hub ? "repay.what_hub" : "repay.what", amount);
      whoLine();
      if (variant === "dust") sp.say("repay.dust");
      if (cleared) {
        if (debtLifeInterest != null && debtLifeInterest > 0) {
          v.life_interest = debtLifeInterest;
          sp.say("repay.life");
        }
        if (closes) sp.say("closed");
        else if (otherDebts.length > 0) {
          v.other_debt = joinWords(otherDebts);
          sp.say("repay.other");
          hfLine();
        } else sp.say("hf.cleared");
      } else {
        hfLine();
        if (variant !== "dust") rateLine();
      }
      break;
    }
    case "aave4.liquidation": {
      const cleared = num(ctx.debtToCover);
      const seized = num(ctx.liquidatedCollateralAmount);
      v.debt_symbol = aaveV4DisplaySymbol(ctx.reserveSymbol);
      v.coll_symbol = aaveV4DisplaySymbol(ctx.collateralSymbol);
      if (cleared != null) v.cleared = cleared;
      if (seized != null) v.seized = seized;
      const legs = { cleared: "cleared", seized: "seized" } as const;
      if (cleared != null && seized != null && ctx.collateralSymbol) sp.say("liq.what", legs);
      else if (cleared != null) sp.say("liq.what_cleared", legs);
      else if (seized != null && ctx.collateralSymbol) sp.say("liq.what_seized", legs);
      if (ctx.liquidator) {
        v.liquidator = ctx.liquidator;
        sp.say("liq.by");
      }
      // The legs valued at the two prices the row carries.
      const cp = ctx.collateralPrice?.usd;
      const dp = ctx.debtPrice?.usd;
      if (cp && dp && cleared != null && seized != null && cleared > 0 && seized > 0) {
        v.seized_usd = seized * cp;
        v.cleared_usd = cleared * dp;
        sp.say("liq.value");
        const bonus = (seized * cp) / (cleared * dp) - 1;
        if (Number.isFinite(bonus) && bonus > 0) {
          v.bonus = bonus;
          sp.say("liq.bonus");
        }
      }
      if (debtCleared) {
        if (otherDebts.length > 0) {
          v.other_debt = joinWords(otherDebts);
          sp.say("liq.cleared_one");
        } else sp.say("liq.cleared_only");
      } else if (debtAfter != null && debtAfter > EPS) sp.say("liq.again");
      break;
    }
    case "aave4.toggle": {
      sp.say(variant === "enabled" ? "toggle.on" : "toggle.off");
      whoLine(false);
      sp.say(variant === "enabled" ? "toggle.backs" : "toggle.freed");
      break;
    }
    default: {
      v.event_type = ctx.eventType;
      sp.say("fallback.what");
    }
  }

  // ── The run's sentences ──
  const said = PROSE.finish(run, variant);
  const key = t.L5;
  return { ...said, L5: { key, content: aaveV4Modal(key) } };
}

/** L4 as the explanation prints it: one flat run, or one run per group. */
export const aaveV4ExplanationRuns = PROSE.explanationRuns;
