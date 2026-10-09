// The Liquity V1 event prose generator: one event in, its explanation (L4)
// and "?" modal (L5) out as data, on the shared engine
// (lib/shared/event-prose/engine.ts; rails-ops decision 0036, ui-jobs 314).
// The strings come from content/liquity-v1/event-prose.yaml and nowhere else;
// this file picks the template and variant and sets the values.
//
// Every value a template reads is kept unrounded in `values`; a sentence is
// its id, the placeholders it read and its text as segments, so the card can
// echo a figure into its receipt without the text changing
// (components/protocol/liquity-v1/liquity-v1-event-explainer.tsx).
//
// The explanation never depends on the receipt read for its first sentence:
// the read only adds the zero-fee sentence. Figures the card's cells, notes
// and price row show (the ratio, the fee, the price, a redemption's net, a
// liquidation's route) stay on the card.

import type { LiquityV1Context } from "@/lib/shared/types/event-shape";
import type { EventProseCore } from "@/lib/shared/event-prose/types";
import type { LiquityV1EventRead } from "@/lib/sources/chain/liquity-v1-event";
import type { LiquityV1OwnerOutcome } from "@/lib/liquity-v1/owner-outcome";
import { LIQUITY_V1_RESERVE, ratioOf, sidesOf } from "@/lib/liquity-v1/event-figures";
import { liquityV1Modal, PROSE, V1_WORDS, type LiquityV1L5Key } from "@/lib/liquity-v1/event-templates";

/** The receipt a figure echoes on the card. */
export type LiquityV1EchoKey = "coll_change" | "debt_change" | "received" | "repaid";

export type LiquityV1EventProse = EventProseCore<LiquityV1L5Key, LiquityV1EchoKey>;

export interface LiquityV1ProseInput {
  ctx: LiquityV1Context;
  /** The event's receipt read, once it lands (the fee on a draw). */
  read?: LiquityV1EventRead | null;
  /** Liquity's ETH price at this block: the row's capture, else the read's. */
  price?: number | null;
  /** On a liquidation, what the Trove's life left its owner. */
  ownerOutcome?: LiquityV1OwnerOutcome | null;
  /** The decimals the card's collateral ledger prints at. */
  collDecimals?: number | null;
}

/** The minimum collateral ratio. */
const MCR = 1.1;
const EPS = 1e-9;

/** How far ETH can fall from `price` before coll × price ÷ debt reaches 110%. */
const distance = (coll: number, debt: number, price: number | null | undefined): number | null => {
  const r = ratioOf(coll, debt, price);
  return r == null ? null : 1 - MCR / r;
};

function pick(ctx: LiquityV1Context): { id: string; variant: string } {
  const s = sidesOf(ctx);
  switch (ctx.eventType) {
    case "openTrove":
      return { id: "liquity1.open", variant: "default" };
    case "adjustTrove": {
      const c = s.collDelta > EPS ? "add" : s.collDelta < -EPS ? "withdraw" : "";
      const d = s.debtDelta > EPS ? "borrow" : s.debtDelta < -EPS ? "repay" : "";
      const variant = [c, d].filter(Boolean).join("_");
      return variant ? { id: "liquity1.adjust", variant } : { id: "liquity1.fallback", variant: "default" };
    }
    case "closeTrove":
      return { id: "liquity1.close", variant: "default" };
    case "redemption":
      return { id: "liquity1.redemption", variant: s.debtAfter <= EPS ? "full" : "partial" };
    case "liquidation": {
      const r = ratioOf(s.collBefore, s.debtBefore, ctx.priceAtBlock?.usd);
      return { id: "liquity1.liquidation", variant: r == null ? "unpriced" : r < MCR ? "below_min" : "recovery" };
    }
    default:
      return { id: "liquity1.fallback", variant: "default" };
  }
}

const L5_OF: Record<string, LiquityV1L5Key> = {
  "liquity1.open": "open",
  "liquity1.adjust": "adjust",
  "liquity1.close": "close",
  "liquity1.redemption": "redemption",
  "liquity1.liquidation": "liquidation",
  "liquity1.fallback": "fallback",
};

/** One event's explanation and modal. */
export function liquityV1EventProse(input: LiquityV1ProseInput): LiquityV1EventProse {
  const { ctx, read, price, ownerOutcome } = input;
  const sel = pick(ctx);
  const variant = sel.variant;
  const run = PROSE.start(PROSE.template(sel.id), input.collDecimals ?? null);
  const { t, values, sp } = run;
  const v = values;
  const s = sidesOf(ctx);

  v.coll_change = Math.abs(s.collDelta);
  v.debt_change = Math.abs(s.debtDelta);
  const echo = { coll_change: "coll_change", debt_change: "debt_change", received: "received" } as const;

  // The row's draw: the LUSD the owner received, which the header prints.
  const rowReceived = s.debtDelta > EPS && ctx.lusdReceived != null && ctx.borrowingFee != null;
  const fee = ctx.borrowingFee ?? read?.borrowingFee ?? null;
  const noFee = () => {
    if (s.debtDelta > EPS && fee != null && Number(fee) === 0) sp.say("draw.no_fee");
  };
  const before = distance(s.collBefore, s.debtBefore, price);
  const after = distance(s.collAfter, s.debtAfter, price);
  const move = () => {
    if (before == null || after == null || !(after > 0)) return;
    v.liq_distance_before = before;
    v.liq_distance_after = after;
    sp.say(after >= before ? "liq.safer" : "liq.less_safe");
  };

  switch (t.id) {
    case "liquity1.open": {
      if (rowReceived) {
        v.received = Number(ctx.lusdReceived);
        sp.say("open.what_received", echo);
      } else sp.say("open.what", echo);
      noFee();
      if (after != null && after > 0) {
        v.liq_distance_after = after;
        sp.say("liq.after");
      }
      break;
    }
    case "liquity1.adjust": {
      if (s.collDelta > EPS) sp.say("add.what", echo);
      else if (s.collDelta < -EPS) sp.say("withdraw.what", echo);
      if (s.debtDelta > EPS && rowReceived) {
        v.received = Number(ctx.lusdReceived);
        sp.say("borrow.what_received", echo);
      } else if (s.debtDelta > EPS) sp.say("borrow.what", echo);
      else if (s.debtDelta < -EPS) sp.say("repay.what", echo);
      noFee();
      move();
      break;
    }
    case "liquity1.close": {
      v.repaid = Math.max(0, Math.abs(s.debtDelta) - LIQUITY_V1_RESERVE);
      sp.say("close.what", { repaid: "repaid", coll_change: "coll_change" });
      break;
    }
    case "liquity1.redemption": {
      if (variant === "full") sp.say("redeem.what_full", echo);
      else sp.say("redeem.what", echo);
      sp.say("redeem.why");
      if (variant === "partial") move();
      break;
    }
    case "liquity1.liquidation": {
      sp.say("liq.what", echo);
      if (variant === "below_min") sp.say("liq.why_below");
      else if (variant === "recovery") sp.say("liq.why_recovery");
      const near = ownerOutcome?.nearLine;
      if (near) {
        const both = near.kinds.includes("withdraw") && near.kinds.includes("borrow");
        v.act = both
          ? V1_WORDS.act_both
          : near.kinds.includes("withdraw")
            ? V1_WORDS.act_withdraw
            : V1_WORDS.act_borrow;
        v.act_date = near.timestamp;
        v.near_ratio = near.ratioAfter;
        sp.say("liq.near_line");
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
  return { ...said, L5: { key, content: liquityV1Modal(key) } };
}

/** L4 as the explanation prints it: one flat run, or one run per group. */
export const liquityV1ExplanationRuns = PROSE.explanationRuns;
