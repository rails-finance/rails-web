// Lifetime flows for a Liquity-family Trove (Liquity V2 and its forks Ebisu,
// Asymmetry and Basedollar): the Trove's own events replayed into the day rows
// the Lifetime flows panel reads (lib/shared/flows-timeline.ts; rails-ops
// reference/lifetime-flows-scrubber.md, "The Liquity family").
// ----------------------------------------------------------------------------
// Every Trove event states the collateral and the debt after it, and the
// TroveOperation log splits the move: the owner's act (or the amount a
// redemption or liquidation cleared), the upfront fee, and what a liquidated
// neighbour's redistribution added. On the debt side the rest of the move is
// the interest accrued since the Trove's last event:
//
//     debt after − debt before = act + upfront fee + redistributed debt + interest
//
// so the replay states interest exactly, event by event. On a batch member the
// interest also carries the batch's management fee, split by the batch's
// rate and fee in force before the event.
//
// Values. Collateral flows at the branch's price at their block, which every
// row carries (a row the filler has not priced takes the nearest recorded
// one). The debt is the stablecoin at its $1 face; between events it grows
// by the interest its rate builds on the recorded debt, which the day rows
// state as the debt's price (1 + rate × time since the last event), so every
// stop owes what the Trove owed that day. Between events the collateral takes
// the branch's daily price where the page read it (Liquity V2's
// /api/liquity-v2/prices/daily, `dailyColl`); a day the series lacks, and a
// fork, which has no daily lane, keeps the last price before it
// (`seriesCarry`).
//
// Pure: tested offline in scripts/verify/verify-liquity-flows.ts.

import type { FlowBucket, FlowDayRow, FlowEvent, FlowTimeline } from "@/lib/shared/flows-timeline";
import { daysFromEvents } from "@/lib/shared/flows-timeline";
import type { FocusEvent } from "@/lib/shared/flow-focus";
import type { BaseActivityEvent, LiquityForkPriceAtBlock } from "@/lib/shared/types/event-shape";
import { isLiquityEvent } from "@/lib/shared/types/event-shape";

const ONE_YEAR_S = 31_557_600;
const DAY_S = 86_400;
const DUST = 1e-9;

/** One Trove event, as every Liquity-family lane can state it. Amounts are
 *  human units; rates are annual percentages. */
export interface LiquityFlowEvent {
  id: string;
  /** Unix seconds. */
  ts: number;
  block: number;
  tx?: string;
  kind: "owner" | "redemption" | "liquidation" | "other";
  collAfter: number;
  debtAfter: number;
  /** The balances the row states before it, which order two events in one
   *  block (their ids' log indexes can tie across transactions). */
  collBefore?: number;
  debtBefore?: number;
  /** The act's own moves (TroveOperation `_collChangeFromOperation`,
   *  `_debtChangeFromOperation`); null where the row carries no operation. */
  collOp: number | null;
  debtOp: number | null;
  upfrontFee: number;
  collFromRedist: number;
  debtFromRedist: number;
  /** Collateral left for the owner to claim after a liquidation (or, on
   *  Liquity V1, a redemption that closed the Trove). */
  surplus: number;
  /** Liquity V1's 200 LUSD liquidation reserve: added to the debt at an
   *  open (+), burned at an owner's close or a full redemption (−). */
  reserve?: number;
  /** The branch's collateral price at the block, where recorded. */
  price: number | null;
  /** The rate and the batch's management fee in force after the event. */
  rate: number;
  fee: number;
  /** A rate change, and who set it: the owner (adjustTroveInterestRate) or
   *  the Trove's batch manager (setBatchManagerAnnualInterestRate). */
  rateBy?: "owner" | "delegate";
}

/** Who set a rate change, by the operation's name. */
function rateByOf(op: string | undefined): LiquityFlowEvent["rateBy"] {
  return op === "adjustTroveInterestRate"
    ? "owner"
    : op === "setBatchManagerAnnualInterestRate"
      ? "delegate"
      : undefined;
}

/** Bucket keys. */
export const LQ = {
  deposited: "lq-deposited",
  redistColl: "lq-redist-coll",
  withdrawn: "lq-withdrawn",
  collRedeemed: "lq-coll-redeemed",
  collLiquidated: "lq-coll-liquidated",
  surplus: "lq-surplus",
  borrowed: "lq-borrowed",
  interest: "lq-interest",
  upfront: "lq-upfront",
  batchFee: "lq-batch-fee",
  redistDebt: "lq-redist-debt",
  repaid: "lq-repaid",
  debtRedeemed: "lq-debt-redeemed",
  debtLiquidated: "lq-debt-liquidated",
  reserve: "lq-reserve",
  reserveBurned: "lq-reserve-burned",
} as const;

/** Which Liquity the buckets and words are for: V2 and its forks, or V1 (no
 *  interest, a borrowing fee, the 200 LUSD liquidation reserve). */
export type LiquityFamily = "v2" | "v1";

/** The buckets in drawing order: inflows as they add up, outflows in the
 *  bar's order after what is held. Liquity V1 has no interest: its debt
 *  takes the borrowing fee and the liquidation reserve instead. */
export function liquityFlowBuckets(surplusClaimed: boolean, family: LiquityFamily = "v2"): FlowBucket[] {
  const all: FlowBucket[] = [
    { key: LQ.deposited, label: "Deposited", event: "Deposit", side: "collateral", dir: "in" },
    {
      key: LQ.redistColl,
      label: "Redistribution gains",
      event: "Redistribution",
      side: "collateral",
      dir: "in",
      hatch: "grid",
    },
    { key: LQ.withdrawn, label: "Withdrawn", event: "Withdraw", side: "collateral", dir: "out" },
    {
      key: LQ.collRedeemed,
      label: "Taken by redemptions",
      event: "Redemption",
      side: "collateral",
      dir: "out",
      tone: "redemption",
      hatch: "forward",
      link: "redemption",
    },
    {
      key: LQ.collLiquidated,
      label: "Liquidated",
      event: "Liquidation",
      side: "collateral",
      dir: "out",
      tone: "liquidation",
      hatch: "forward",
      link: "liquidation",
    },
    {
      key: LQ.surplus,
      label: surplusClaimed ? "Surplus claimed" : "Surplus to claim",
      event: "Liquidation",
      side: "collateral",
      dir: "out",
      hatch: "dots",
    },
    { key: LQ.borrowed, label: "Borrowed", event: "Borrow", side: "debt", dir: "in" },
    // Each inflow after Borrowed has its texture; interest is dashed
    // (standards/lexicon.md, lifetime bars' fills).
    { key: LQ.interest, label: "Interest", event: "", side: "debt", dir: "in", hatch: "dashes" },
    { key: LQ.upfront, label: "Upfront fees", event: "Upfront fee", side: "debt", dir: "in", hatch: "checker" },
    { key: LQ.batchFee, label: "Batch management fees", event: "", side: "debt", dir: "in", hatch: "dots" },
    {
      key: LQ.redistDebt,
      label: "Redistributed debt",
      event: "Redistribution",
      side: "debt",
      dir: "in",
      hatch: "grid",
    },
    { key: LQ.reserve, label: "Liquidation reserve", event: "Open", side: "debt", dir: "in", hatch: "horizontal" },
    { key: LQ.repaid, label: "Repaid", event: "Repay", side: "debt", dir: "out" },
    {
      key: LQ.reserveBurned,
      label: "Reserve burned",
      event: "Close",
      side: "debt",
      dir: "out",
      hatch: "dashes",
    },
    {
      key: LQ.debtRedeemed,
      label: "Redeemed",
      event: "Redemption",
      side: "debt",
      dir: "out",
      tone: "redemption",
      hatch: "forward",
      link: "redemption",
    },
    {
      key: LQ.debtLiquidated,
      label: "Liquidated",
      event: "Liquidation",
      side: "debt",
      dir: "out",
      tone: "liquidation",
      hatch: "forward",
      link: "liquidation",
    },
  ];
  if (family === "v2") return all.filter((b) => b.key !== LQ.reserve && b.key !== LQ.reserveBurned);
  const v1Out = new Set<string>([LQ.interest, LQ.batchFee]);
  return all
    .filter((b) => !v1Out.has(b.key))
    .map((b) =>
      b.key === LQ.upfront
        ? { ...b, label: "Borrowing fees", event: "Borrowing fee" }
        : b.key === LQ.surplus
          ? { ...b, event: "Liquidation or redemption" }
          : b,
    );
}

/** What a live read of the Trove states now (getLatestTroveData), where the
 *  page has one: the whole collateral and debt, and the parts no event has
 *  recorded yet. */
export interface LiquityLive {
  /** The branch's price now. */
  price: number | null;
  coll?: number;
  debt?: number;
  accruedInterest?: number;
  batchFee?: number;
  redistColl?: number;
  redistDebt?: number;
}

export interface LiquityFlowOptions {
  collSymbol: string;
  debtSymbol: string;
  live: LiquityLive | null;
  surplusClaimed: boolean;
  /** Unix seconds now; the page's clock. */
  now: number;
  /** Liquity V1, or V2 and its forks (the default). */
  family?: LiquityFamily;
  /** The branch's daily price, `[UTC day, usd]` ascending, where the page
   *  read one (Liquity V2's daily route); null or absent keeps each event's
   *  price between events. */
  dailyColl?: [number, number][] | null;
}

/** A replayed event's legs, for the tests and the Explanation. */
export interface LiquityReplayed {
  ev: LiquityFlowEvent;
  price: number;
  /** The price was the nearest recorded one, not the event's own. */
  borrowedPrice: boolean;
  legs: { bucket: string; amount: number }[];
}

/** An event id's log index (`${txHash}_${logIndex}`), for events in one block. */
function logIndex(id: string): number {
  const n = Number(id.split("_").pop());
  return Number.isFinite(n) ? n : 0;
}

const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** Orders the events inside each block by their stated balances: each next
 *  one is the event whose before-state is the last one's after-state. Events
 *  that state none keep their order. */
function chainBlocks(sorted: LiquityFlowEvent[]): LiquityFlowEvent[] {
  const out: LiquityFlowEvent[] = [];
  let coll = 0;
  let debt = 0;
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j < sorted.length && sorted[j].block === sorted[i].block) j++;
    const left = sorted.slice(i, j);
    while (left.length > 0) {
      let k = left.findIndex(
        (e) => e.collBefore != null && e.debtBefore != null && near(e.collBefore, coll) && near(e.debtBefore, debt),
      );
      if (k < 0) k = 0;
      const [e] = left.splice(k, 1);
      out.push(e);
      coll = e.collAfter;
      debt = e.debtAfter;
    }
    i = j;
  }
  return out;
}

/** The per-event replay: each event's legs in token units, by bucket. */
export function replayLiquity(events: LiquityFlowEvent[]): LiquityReplayed[] {
  const sorted = chainBlocks(
    [...events].sort((a, b) => a.ts - b.ts || a.block - b.block || logIndex(a.id) - logIndex(b.id)),
  );
  // A row the filler has not priced takes the last recorded price before it,
  // else the first after it.
  const firstPrice = sorted.find((e) => e.price != null && e.price > 0)?.price ?? 0;
  let lastPrice = firstPrice;
  let collBefore = 0;
  let debtBefore = 0;
  let rate = 0;
  let fee = 0;
  const out: LiquityReplayed[] = [];
  for (const ev of sorted) {
    const own = ev.price != null && ev.price > 0;
    if (own) lastPrice = ev.price as number;
    const legs: { bucket: string; amount: number }[] = [];
    const add = (bucket: string, amount: number) => {
      if (Math.abs(amount) > DUST) legs.push({ bucket, amount });
    };
    const dColl = ev.collAfter - collBefore;
    const dDebt = ev.debtAfter - debtBefore;
    const collRedist = Math.max(0, ev.collFromRedist);
    const debtRedist = Math.max(0, ev.debtFromRedist);
    const upfront = Math.max(0, ev.upfrontFee);
    const reserve = ev.reserve ?? 0;
    // The act's collateral move is the change less the redistribution, so the
    // side adds up to the recorded balance whatever the log rounds.
    const collOp = dColl - collRedist;
    add(LQ.redistColl, collRedist);
    add(LQ.redistDebt, debtRedist);
    add(LQ.upfront, upfront);
    if (reserve > 0) add(LQ.reserve, reserve);
    else add(LQ.reserveBurned, -reserve);
    let debtOp = ev.debtOp ?? 0;
    if (ev.kind === "liquidation" && ev.debtOp == null) debtOp = -(debtBefore + debtRedist + upfront);
    // Interest accrued since the last event: the rest of the debt's move.
    const accrued = dDebt - debtOp - upfront - debtRedist - reserve;
    const share = fee > 0 && rate + fee > 0 ? fee / (rate + fee) : 0;
    add(LQ.batchFee, accrued * share);
    add(LQ.interest, accrued * (1 - share));
    if (ev.kind === "liquidation") {
      const taken = Math.max(0, -collOp);
      const surplus = Math.min(taken, Math.max(0, ev.surplus));
      add(LQ.collLiquidated, taken - surplus);
      add(LQ.surplus, surplus);
      if (collOp > 0) add(LQ.deposited, collOp);
      add(LQ.debtLiquidated, Math.max(0, -debtOp));
      if (debtOp > 0) add(LQ.borrowed, debtOp);
    } else if (ev.kind === "redemption") {
      // A Liquity V1 redemption that cancels the last of the debt closes the
      // Trove and leaves the rest of its collateral to claim.
      const taken = Math.max(0, -collOp);
      const surplus = Math.min(taken, Math.max(0, ev.surplus));
      add(LQ.collRedeemed, taken - surplus);
      add(LQ.surplus, surplus);
      if (collOp > 0) add(LQ.deposited, collOp);
      add(LQ.debtRedeemed, Math.max(0, -debtOp));
      if (debtOp > 0) add(LQ.borrowed, debtOp);
    } else {
      if (collOp > 0) add(LQ.deposited, collOp);
      else add(LQ.withdrawn, -collOp);
      if (debtOp > 0) add(LQ.borrowed, debtOp);
      else add(LQ.repaid, -debtOp);
    }
    out.push({ ev, price: own ? (ev.price as number) : lastPrice, borrowedPrice: !own, legs });
    collBefore = ev.collAfter;
    debtBefore = ev.debtAfter;
    rate = ev.rate;
    fee = ev.fee;
  }
  return out;
}

const COLL_BUCKETS = new Set<string>([
  LQ.deposited,
  LQ.redistColl,
  LQ.withdrawn,
  LQ.collRedeemed,
  LQ.collLiquidated,
  LQ.surplus,
]);

const OUT_BUCKETS = new Set<string>(
  [...liquityFlowBuckets(false), ...liquityFlowBuckets(false, "v1")].filter((b) => b.dir === "out").map((b) => b.key),
);

/** The debt's price on a day: $1 plus the interest its rate builds on the
 *  recorded debt from the Trove's last event to the day's end. */
function accrualFactor(rate: number, fee: number, sinceTs: number, atTs: number): number {
  const dt = Math.max(0, atTs - sinceTs);
  return 1 + ((rate + fee) / 100) * (dt / ONE_YEAR_S);
}

/** The Trove's events as the Lifetime flows panel's timeline. Null with no
 *  events. */
export function liquityFlowTimeline(events: LiquityFlowEvent[], o: LiquityFlowOptions): FlowTimeline | null {
  const replayed = replayLiquity(events);
  if (replayed.length === 0) return null;
  const coll = `coll:${o.collSymbol}`;
  const debt = `debt:${o.debtSymbol}`;
  const family = o.family ?? "v2";
  const buckets = liquityFlowBuckets(o.surplusClaimed, family);
  const flowEvents: FlowEvent[] = replayed.map(({ ev, price, legs, borrowedPrice }) => {
    const moved = { coll: false, debt: false };
    for (const l of legs) {
      if (l.bucket === LQ.interest || l.bucket === LQ.batchFee) continue;
      if (COLL_BUCKETS.has(l.bucket)) moved.coll = true;
      else moved.debt = true;
    }
    // An event that records no price takes the last one recorded before it.
    const unpriced =
      borrowedPrice && price > 0 && (ev.collAfter > DUST || legs.some((l) => COLL_BUCKETS.has(l.bucket)));
    return {
      ...(unpriced
        ? {
            unsure: [
              {
                side: "collateral" as const,
                why: `${o.collSymbol} priced at the last event's price: this event records none.`,
                held: true,
              },
            ],
          }
        : {}),
      id: ev.id,
      ts: ev.ts,
      block: ev.block,
      tick:
        ev.kind === "liquidation"
          ? "liquidation"
          : ev.kind === "redemption"
            ? "redemption"
            : ev.rateBy === "delegate"
              ? "rate-delegate"
              : ev.rateBy === "owner"
                ? "rate-owner"
                : moved.coll && moved.debt
                  ? "both"
                  : moved.coll
                    ? "collateral"
                    : "debt",
      legs: legs.map((l) =>
        COLL_BUCKETS.has(l.bucket)
          ? { bucket: l.bucket, usd: l.amount * price, symbol: o.collSymbol }
          : { bucket: l.bucket, usd: l.amount, symbol: o.debtSymbol },
      ),
      tx: ev.tx,
      // The card counts the owner's transactions; a redemption or a
      // liquidation is another party's.
      countsTx: ev.kind === "owner",
      balances: [
        { asset: coll, symbol: o.collSymbol, side: "collateral", amount: Math.max(0, ev.collAfter) },
        { asset: debt, symbol: o.debtSymbol, side: "debt", amount: Math.max(0, ev.debtAfter) },
      ],
      prices: [...(price > 0 ? [{ asset: coll, usd: price }] : []), { asset: debt, usd: 1 }],
    };
  });
  const days: FlowDayRow[] = daysFromEvents(
    buckets.map((b) => b.key),
    flowEvents,
  );

  const today = Math.floor(o.now / DAY_S);
  const last = replayed[replayed.length - 1].ev;
  const open = last.collAfter > DUST || last.debtAfter > DUST;
  const livePrice = o.live?.price != null && o.live.price > 0 ? o.live.price : null;

  // The collateral's recorded prices, by day (the last each day), the
  // branch's daily series over them where the page read it (a day's close),
  // and today's.
  const collObs = new Map<number, number>();
  for (const r of replayed) if (!r.borrowedPrice && r.price > 0) collObs.set(Math.floor(r.ev.ts / DAY_S), r.price);
  const daily = (o.dailyColl ?? []).filter(([d, usd]) => d <= today && usd > 0);
  for (const [d, usd] of daily) collObs.set(d, usd);
  if (livePrice != null && open) collObs.set(today, livePrice);
  // The debt's price each day from the first event to today (or the day after
  // the last event on a closed Trove).
  const debtObs: [number, number][] = [];
  const firstDay = Math.floor(replayed[0].ev.ts / DAY_S);
  const endDay = open ? Math.max(today, Math.floor(last.ts / DAY_S) + 1) : Math.floor(last.ts / DAY_S) + 1;
  let ei = 0;
  for (let d = firstDay; d <= endDay; d++) {
    const end = Math.min((d + 1) * DAY_S, o.now);
    while (ei + 1 < replayed.length && replayed[ei + 1].ev.ts <= end) ei++;
    const e = replayed[ei].ev;
    debtObs.push([d, e.ts <= end ? accrualFactor(e.rate, e.fee, e.ts, end) : 1]);
  }

  // Now: the live read where the page has one, else the last recorded
  // balances with the interest built since.
  const nowColl = open ? (o.live?.coll ?? last.collAfter) : 0;
  const nowDebt = open ? (o.live?.debt ?? last.debtAfter * accrualFactor(last.rate, last.fee, last.ts, o.now)) : 0;
  const pricedNow = livePrice ?? replayed[replayed.length - 1].price;
  const pending: NonNullable<FlowTimeline["live"]["pending"]> = [];
  if (open && o.live) {
    if ((o.live.redistColl ?? 0) > DUST)
      pending.push({ bucket: LQ.redistColl, symbol: o.collSymbol, usd: (o.live.redistColl as number) * pricedNow });
    if ((o.live.redistDebt ?? 0) > DUST)
      pending.push({ bucket: LQ.redistDebt, symbol: o.debtSymbol, usd: o.live.redistDebt as number });
    if ((o.live.batchFee ?? 0) > DUST)
      pending.push({ bucket: LQ.batchFee, symbol: o.debtSymbol, usd: o.live.batchFee as number });
  }

  return {
    buckets,
    days,
    live: {
      collateralUsd: nowColl * pricedNow,
      debtUsd: nowDebt,
      assets: open
        ? [
            { side: "collateral", symbol: o.collSymbol, amount: nowColl, usd: nowColl * pricedNow },
            { side: "debt", symbol: o.debtSymbol, amount: nowDebt, usd: nowDebt },
          ]
        : [],
      ...(pending.length ? { pending } : {}),
    },
    todayPrices: { [coll]: pricedNow, [debt]: 1 },
    dailyPrices: {
      [coll]: [...collObs].sort((a, b) => a[0] - b[0]),
      [debt]: debtObs,
    },
    seriesCarry: true,
    carriedWhy: {
      [coll]:
        daily.length > 0
          ? "the branch's daily price has none for this day, so it keeps the last price before it."
          : "no daily price is recorded for this branch, so a day between events keeps the last event's price.",
    },
    // A closed Liquity V1 life is the page's whole position: its line ends
    // the day after its last event.
    today: family === "v1" && !open ? endDay : today,
    words:
      family === "v1"
        ? liquityV1FlowWords(daily.length > 0)
        : liquityFlowWords(o.collSymbol, o.debtSymbol, daily.length > 0),
  };
}

/** The Trove's events as the event cards' sums read them (lib/shared/flow-focus.ts):
 *  each event's legs in USD at its price, ascending in the replay's order,
 *  the same legs the day rows add up. Each card states its row's recorded
 *  balances, so each sum closes at its event and carries no `tx`: with one,
 *  a transaction that touches the Trove twice (two redemptions, a leave and
 *  an adjust) runs the first card's sum on to the second event. Each side's
 *  USD just before and after the event is its recorded balance at its price,
 *  less its legs. Liquity V2's debt counts the interest and management fee
 *  accrued since the previous event as part of the event's move, so its before
 *  is the debt recorded at the previous event (ui-jobs 285); V1 has none. */
export function liquityFocusEvents(
  events: LiquityFlowEvent[],
  collSymbol: string,
  debtSymbol: string,
  family: LiquityFamily = "v2",
): FocusEvent[] {
  return replayLiquity(events).map((r) => {
    let collMove = 0;
    let debtMove = 0;
    for (const l of r.legs) {
      const sign = OUT_BUCKETS.has(l.bucket) ? -1 : 1;
      if (COLL_BUCKETS.has(l.bucket)) collMove += sign * l.amount;
      else if (family === "v2" || (l.bucket !== LQ.interest && l.bucket !== LQ.batchFee)) debtMove += sign * l.amount;
    }
    const collAfter = Math.max(0, r.ev.collAfter);
    const debtAfter = Math.max(0, r.ev.debtAfter);
    return {
      id: r.ev.id,
      ts: r.ev.ts,
      legs: r.legs.map((l) =>
        COLL_BUCKETS.has(l.bucket)
          ? { bucket: l.bucket, usd: l.amount * r.price, amount: l.amount, symbol: collSymbol }
          : {
              bucket: l.bucket,
              usd: l.amount,
              amount: l.amount,
              symbol: debtSymbol,
              ...(l.bucket === LQ.interest || l.bucket === LQ.batchFee ? { accrual: true } : {}),
            },
      ),
      sides: {
        collateral: {
          before: Math.max(0, collAfter - collMove) * r.price,
          after: collAfter * r.price,
          amount: collMove,
          symbol: collSymbol,
          held: collAfter,
        },
        debt: {
          before: Math.max(0, debtAfter - debtMove),
          after: debtAfter,
          amount: debtMove,
          symbol: debtSymbol,
          held: debtAfter,
        },
      },
      // Liquity V1 has no rate: its debt stays as its last event left it.
      ...(family === "v2" ? { rate: r.ev.rate + r.ev.fee } : {}),
    };
  });
}

/** The panel's words for a Trove; `daily`: the collateral between events is
 *  at the branch's daily price. */
export function liquityFlowWords(
  collSymbol: string,
  debtSymbol: string,
  daily = false,
): NonNullable<FlowTimeline["words"]> {
  return {
    held: "Still deposited",
    restBySide: { collateral: "Market move", debt: "Interest since the last event" },
    restNote: {
      collateral: `the change in ${collSymbol}'s price since each flow`,
      debt: "the interest built up on the recorded debt since the Trove's last event",
    },
    basis: {
      collateral: "Each flow is valued at the branch's price when it happened.",
      debt: `Debt is counted at ${debtSymbol}'s $1 face.`,
    },
    heldBasis: {
      collateral: daily
        ? `the ${collSymbol} the Trove held after its last event by then, at the branch's price at the close of that day (the last any Trove's operation on the branch recorded that day).`
        : `the ${collSymbol} the Trove held after its last event by then, at the branch's price that event or a later one recorded.`,
      debt: `the ${debtSymbol} debt the Trove's last event recorded by then, plus the interest its rate built on it to the end of that day.`,
    },
    linePrices: daily
      ? `with the collateral at the branch's price at each day's close and the debt at $1 plus the interest built since`
      : `with the collateral at the branch's price on the Trove's latest event by then and the debt at $1 plus the interest built since`,
    moment: {
      face: ["debt"],
      noPrice: {
        collateral: `The branch's daily price for ${collSymbol} is not recorded yet, so the collateral is stated in ${collSymbol} only.`,
      },
      notes: [
        "Redistribution from other Troves' liquidations not yet applied to this Trove is not included: it lands on the Trove at its next event.",
      ],
    },
  };
}

/** The panel's words for a Liquity V1 Trove: ETH at Liquity's price feed,
 *  LUSD at its face, no interest. `daily`: the page read ETH's daily price. */
export function liquityV1FlowWords(daily = false): NonNullable<FlowTimeline["words"]> {
  return {
    held: "Still deposited",
    restBySide: { collateral: "Market move", debt: "Unrecorded change" },
    restNote: {
      collateral: "the change in ETH's price since each flow",
      debt: "zero, since Liquity V1 charges no interest and each event records the debt after it",
    },
    basis: {
      collateral: "Each flow is valued at Liquity's ETH price at its block.",
      debt: "Debt is counted at LUSD's $1 face.",
    },
    heldBasis: {
      collateral: daily
        ? "the ETH the Trove held after its last event by then, at ETH's price at the close of that day where one is recorded (from 19 May 2025), else at the price of its latest event."
        : "the ETH the Trove held after its last event by then, at the price of its latest event.",
      debt: "the LUSD debt the Trove's last event recorded.",
    },
    linePrices: daily
      ? "with ETH at each day's closing price where one is recorded (from 19 May 2025), else at the Trove's latest event's price, and LUSD at $1"
      : "with ETH at the price of the Trove's latest event by then and LUSD at $1",
    moment: {
      face: ["debt"],
      noPrice: {
        collateral: "No ETH price is recorded for this day, so the collateral is stated in ETH only.",
      },
      notes: [
        "Redistribution from other Troves' liquidations not yet applied to this Trove is not included: it lands on the Trove at its next event.",
      ],
    },
  };
}

// ── The lanes ────────────────────────────────────────────────────────────

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** A raw integer string at `scale` decimals, else the display float. */
function rawAt(raw: string | undefined, scale: number, float: number): number {
  if (raw != null && /^-?\d+$/.test(raw)) {
    const neg = raw.startsWith("-");
    const digits = (neg ? raw.slice(1) : raw).padStart(scale + 1, "0");
    const v = Number(`${digits.slice(0, -scale)}.${digits.slice(-scale)}`);
    return neg ? -v : v;
  }
  return num(float);
}
const raw18 = (raw: string | undefined, float: number) => rawAt(raw, 18, float);
const raw16 = (raw: string | undefined, float: number) => rawAt(raw, 16, float);

/** Liquity V2's trove events. */
export function liquityV2FlowEvents(events: BaseActivityEvent[]): LiquityFlowEvent[] {
  const out: LiquityFlowEvent[] = [];
  let fee = 0;
  let prev = { coll: 0, debt: 0, rate: 0 };
  const sorted = [...events].sort(
    (a, b) => a.timestamp - b.timestamp || a.blockNumber - b.blockNumber || logIndex(a.id) - logIndex(b.id),
  );
  for (const e of sorted) {
    if (!isLiquityEvent(e)) continue;
    const c = e.context.data;
    const op = c.troveOperation;
    // A row with no after-state (a bare transfer) leaves the balances as they were.
    // The raw integers where the row carries them: the floats are rounded
    // for display (the debt to cents), which the interest, a remainder of
    // four of them, would pick up event by event.
    const st = c.stateAfter;
    const after = st
      ? {
          coll: raw18(st.raw?.coll, st.coll),
          debt: raw18(st.raw?.debt, st.debt),
          rate: raw16(st.raw?.annualInterestRate, st.annualInterestRate),
        }
      : prev;
    prev = after;
    // The batch's fee is on its BatchUpdated rows; it stands until the next.
    if (c.batchUpdate) fee = num(c.batchUpdate.annualManagementFee);
    if (!c.isInBatch) fee = 0;
    out.push({
      id: e.id,
      ts: e.timestamp,
      block: e.blockNumber,
      tx: e.txHash,
      kind:
        c.operation === "redeemCollateral"
          ? "redemption"
          : c.operation === "liquidate"
            ? "liquidation"
            : c.eventType === "trove" || c.eventType === "transfer"
              ? "owner"
              : "other",
      collAfter: after.coll,
      debtAfter: after.debt,
      ...(c.stateBefore
        ? {
            collBefore: raw18(c.stateBefore.raw?.coll, c.stateBefore.coll),
            debtBefore: raw18(c.stateBefore.raw?.debt, c.stateBefore.debt),
          }
        : {}),
      collOp: op ? raw18(op.raw?.collChangeFromOperation, op.collChangeFromOperation) : null,
      debtOp: op ? raw18(op.raw?.debtChangeFromOperation, op.debtChangeFromOperation) : null,
      upfrontFee: op ? raw18(op.raw?.debtIncreaseFromUpfrontFee, op.debtIncreaseFromUpfrontFee) : 0,
      collFromRedist: op ? raw18(op.raw?.collIncreaseFromRedist, op.collIncreaseFromRedist) : 0,
      debtFromRedist: op ? raw18(op.raw?.debtIncreaseFromRedist, op.debtIncreaseFromRedist) : 0,
      surplus: c.liquidation ? num(c.liquidation.collSurplus) : 0,
      price: c.collateralPrice > 0 ? c.collateralPrice : null,
      rate: after.rate,
      fee,
      rateBy: rateByOf(c.operation),
    });
  }
  return out;
}

/** The fork context the three fork lanes share (Ebisu, Asymmetry,
 *  Basedollar). */
interface ForkCtx {
  eventType: string;
  collAfter: string;
  debtAfter: string;
  collBefore: string;
  debtBefore: string;
  interestRate?: string;
  isBatched: boolean;
  priceAtBlock?: LiquityForkPriceAtBlock;
  operation?: {
    debtFromOperation: string;
    debtUpfrontFee: string;
    debtFromRedist: string;
    collFromOperation: string;
    collFromRedist: string;
  };
  liquidation?: { collSurplus: string };
  batchRate?: { managementFee: string };
}

/** A fork's trove events, through the lane's guard. */
export function liquityForkFlowEvents(
  events: BaseActivityEvent[],
  is: (e: BaseActivityEvent) => boolean,
): LiquityFlowEvent[] {
  const out: LiquityFlowEvent[] = [];
  let fee = 0;
  const sorted = [...events].sort(
    (a, b) => a.timestamp - b.timestamp || a.blockNumber - b.blockNumber || logIndex(a.id) - logIndex(b.id),
  );
  for (const e of sorted) {
    if (!is(e)) continue;
    const c = (e.context as { data: ForkCtx }).data;
    const op = c.operation;
    if (c.batchRate) fee = num(c.batchRate.managementFee);
    if (!c.isBatched) fee = 0;
    out.push({
      id: e.id,
      ts: e.timestamp,
      block: e.blockNumber,
      tx: e.txHash,
      kind:
        c.eventType === "redeemCollateral"
          ? "redemption"
          : c.eventType === "liquidate"
            ? "liquidation"
            : c.eventType === "setBatchManagerAnnualInterestRate" || c.eventType === "lowerBatchManagerAnnualFee"
              ? "other"
              : "owner",
      collAfter: num(c.collAfter),
      debtAfter: num(c.debtAfter),
      collBefore: num(c.collBefore),
      debtBefore: num(c.debtBefore),
      collOp: op ? numOrNull(op.collFromOperation) : null,
      debtOp: op ? numOrNull(op.debtFromOperation) : null,
      upfrontFee: op ? num(op.debtUpfrontFee) : 0,
      collFromRedist: op ? num(op.collFromRedist) : 0,
      debtFromRedist: op ? num(op.debtFromRedist) : 0,
      surplus: c.liquidation ? num(c.liquidation.collSurplus) : 0,
      price: c.priceAtBlock?.usd != null && c.priceAtBlock.usd > 0 ? c.priceAtBlock.usd : null,
      rate: num(c.interestRate),
      fee,
      rateBy: rateByOf(c.eventType),
    });
  }
  return out;
}

/** How many of the Trove's events carry no price of their own. */
export function unpricedEvents(events: LiquityFlowEvent[]): number {
  return events.filter((e) => !(e.price != null && e.price > 0)).length;
}
