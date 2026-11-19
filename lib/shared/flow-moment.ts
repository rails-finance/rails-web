// The state card: the position at a moment between its events (rails-ops
// reference/lifetime-flows-scrubber.md, "The day links the chart and the
// timeline"). Where "Sync to chart" cuts the timeline at the close of a
// day with no events of its own, the cut timeline opens with a card for that
// moment. It states only what the flow model holds exactly for that day, the
// figures the chart states there:
//
//   - each asset as held after the last event, grown by its interest to the
//     day's close where the timeline carries the reserves' indexes (the Aave
//     family: recorded × the index at the close ÷ the index at that event,
//     the chart's figure), as recorded otherwise;
//   - its USD where the model has a price recorded that day (the Aave
//     family's daily series); none where it carries an older one (a Liquity
//     branch, whose collateral is priced only at its events);
//   - a side counted at a $1 face (a Liquity Trove's debt): the recorded
//     balance plus the interest its rate builds to that moment, which is the
//     model's figure for the day, in tokens.
//
// Pure: tested offline in scripts/verify/verify-lifetime-flows-state.ts and
// scripts/verify/verify-liquity-flows.ts.

import {
  DAY_MS,
  unitOf,
  type FlowAssetHeld,
  type FlowGrowth,
  type FlowModel,
  type FlowSide,
  type FlowUnit,
} from "@/lib/shared/flows-timeline";
import type { FocusEvent } from "@/lib/shared/flow-focus";
import { centsOf, faceAmount, shownUsd } from "@/lib/shared/shown-usd";

const DAY_S = 86_400;
const ONE_YEAR_S = 31_557_600;

/** One asset at the moment. */
export interface MomentAsset {
  symbol: string;
  /** The balance its last event recorded. */
  recorded: number;
  /** What is held or owed at the moment, in tokens: the recorded balance, or
   *  on a side counted at its face, that plus the interest built since. */
  tokens: number;
  /** Its USD at the day's recorded price, the shown product to the cent (the
   *  chart's figure); null where none was recorded that day, and on a side
   *  counted at its face. */
  usd: number | null;
  /** The day's recorded price (USD per token), where it states USD. */
  price: number | null;
  /** The model's row for the asset that day: its price's day and block, for
   *  the receipts (ui-jobs 743). */
  row: FlowAssetHeld;
  /** Where the balance was grown by its reserve's index since the event that
   *  recorded it: how, and the interest that adds in tokens and (at the day's
   *  price, where it states USD) in USD: the asset's shown product less the
   *  recorded balance's (`heldUsd`), to the cent. */
  grown: FlowGrowth | null;
  interest: number | null;
  interestUsd: number | null;
  /** The recorded balance at the day's price, the shown product to the cent,
   *  where the balance grew since; else `usd`. */
  heldUsd: number | null;
}

export interface MomentSide {
  assets: MomentAsset[];
  /** The side counted at its $1 face (tokens are USD). */
  face: boolean;
  /** Every asset is valued at a price recorded that day (or at its face):
   *  the side's sum to that day reads cleanly. */
  priced: boolean;
  /** The model's figure for the side at that day's close: what the chart
   *  states there. */
  held: number;
}

export interface FlowMoment {
  /** The moment: the close of `day` (unix seconds). */
  endTs: number;
  /** Absolute UTC day, and its stop in the model. */
  day: number;
  stop: number;
  /** The last day with events before the moment (absolute UTC day). */
  lastDay: number;
  /** The next day with events, or null where there is none. */
  nextDay: number | null;
  /** The last event before the moment, where the page holds it. */
  last: FocusEvent | null;
  /** Where a side is counted at its face: the rate the last event left in
   *  force (annual %, fees included), the seconds since that event to the
   *  day's end, and the factor they give. */
  accrual: {
    rate: number;
    seconds: number;
    factor: number;
    /** Where the interest is a contract's minute sum (`FlowMomentWords.minuteSum`):
     *  the whole minutes it counts to the moment, and the deadline it stopped
     *  at where the moment is past it. */
    minutes?: number;
    stopped?: number;
  } | null;
  sides: Record<FlowSide, MomentSide>;
}

/** The position at the close of the day `endTs` falls in, where that day has
 *  no events of its own and lies between the first event and today; null
 *  otherwise. `events` ascending (the page's focus events). */
export function flowMoment(model: FlowModel, events: FocusEvent[], endTs: number): FlowMoment | null {
  const startDay = model.start / DAY_MS;
  const day = Math.floor(endTs / DAY_S);
  const stop = day - startDay;
  // A chart standing alone has no position to state between its events.
  if (model.chartAlone) return null;
  if (stop <= 0 || stop >= model.liveStop || model.eventDays.includes(stop)) return null;
  // The event days around it (a balance step's row is not one).
  let ei = -1;
  for (let i = 0; i < model.eventDays.length && model.eventDays[i] <= stop; i++) ei = i;
  if (ei < 0) return null;
  const lastDay = startDay + model.eventDays[ei];
  const nextEvent = model.eventDays[ei + 1];
  const close = (day + 1) * DAY_S;
  let last: FocusEvent | null = null;
  for (const e of events) if (e.ts < close) last = e;
  if (last && Math.floor(last.ts / DAY_S) !== lastDay) last = null;
  const face = new Set(model.words.moment?.face ?? []);
  const tokensOnly = new Set(model.words.moment?.tokensOnly ?? []);
  const held = model.heldAt[stop] ?? [];
  const valued = model.valued[stop] ?? { collateral: 0, debt: 0 };
  const sideOf = (side: FlowSide): MomentSide => {
    const isFace = face.has(side);
    const bare = tokensOnly.has(side);
    const assets: MomentAsset[] = held
      .filter((h) => h.side === side && (h.amount ?? 0) > 0)
      .map((h) => {
        const amount = h.amount as number;
        const grown = !isFace && h.grown ? h.grown : null;
        const recorded = grown ? grown.recorded : amount;
        const today = !bare && h.priced != null && h.priced.series && h.priced.day === day;
        const price = !isFace && today ? (h.priced?.price ?? h.usd / amount) : null;
        const interest = grown ? amount - grown.recorded : null;
        const usd = !isFace && today ? h.usd : null;
        const heldUsd = usd != null && price != null ? (interest != null ? shownUsd(recorded, price) : usd) : null;
        return {
          symbol: h.symbol,
          recorded,
          // A token axis states the face side's tokens in grains (FlowUnit).
          // A face side in dollars: the recorded debt × its factor, as its
          // receipt multiplies them out, to six decimals.
          tokens: isFace
            ? unitOf(model, side)
              ? h.usd / 10 ** (unitOf(model, side) as FlowUnit).scale
              : h.priced?.price != null
                ? faceAmount(amount, h.priced.price)
                : h.usd
            : amount,
          usd,
          price,
          row: h,
          grown,
          interest,
          interestUsd: interest != null && usd != null && heldUsd != null ? centsOf(usd - heldUsd) : null,
          heldUsd,
        };
      });
    return {
      assets,
      face: isFace,
      priced: bare || assets.every((a) => isFace || a.usd != null),
      held: valued[side],
    };
  };
  const sides = { collateral: sideOf("collateral"), debt: sideOf("debt") };
  let accrual: FlowMoment["accrual"] = null;
  if (face.size > 0 && last?.rate != null) {
    const seconds = Math.max(0, close - last.ts);
    const year = model.words.moment?.yearSeconds ?? ONE_YEAR_S;
    const t = (last.rate / 100) * (seconds / year);
    accrual = { rate: last.rate, seconds, factor: model.words.moment?.compound ? Math.exp(t) : 1 + t };
    const sum = model.words.moment?.minuteSum;
    if (sum) {
      const past = sum.deadline != null && close > sum.deadline;
      const to = past ? (sum.deadline as number) : close;
      accrual.minutes = Math.max(0, Math.floor((to - sum.start) / 60));
      accrual.seconds = Math.max(0, to - last.ts);
      if (past) accrual.stopped = sum.deadline as number;
    }
  }
  return {
    endTs: close - 1,
    day,
    stop,
    lastDay,
    nextDay: nextEvent != null ? startDay + nextEvent : null,
    last,
    accrual,
    sides,
  };
}
