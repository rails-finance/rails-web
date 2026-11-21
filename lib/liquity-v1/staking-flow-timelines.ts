// Lifetime flows for a Liquity V1 LQTY stake: the page's rows replayed into
// the day rows the Lifetime flows panel reads (lib/shared/flows-timeline.ts),
// each bar in its own token (`FlowTimeline.sideUnits`). Nothing is priced.
//
// The stake's bar is LQTY: staked, less unstaked, holds the stake. The second
// bar is LUSD: the borrowing fees paid in and paid out at the same touch, so
// it holds nothing between touches. ETH, the redemption fees, is the stake's
// third token; the panel draws two bars, so the card, the rows and the
// since-last-touch row state it. Today the LUSD bar adds the fees pending
// (`live.pending`).
//
// The deposit's flows (sp-flow-timelines.ts) are the shape.

import type { FocusEvent } from "@/lib/shared/flow-focus";
import type { FlowBucket, FlowDayRow, FlowEvent, FlowTimeline } from "@/lib/shared/flows-timeline";
import type { DayObs } from "@/lib/shared/price-series";
import { daysFromEvents, unitScaleFor } from "@/lib/shared/flows-timeline";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import type { LiquityV1StakeDay, LiquityV1StakeEventRow } from "@/lib/sources/api/liquity-v1-staking";
import { big, stakeLegs, units, type StakeNow } from "./staking-math";

const DAY_S = 86_400;
const DUST = 1e-12;
const ZERO = BigInt(0);
const A = "a";
const B = "b";
const LQTY = "LQTY";
const LUSD = "LUSD";

type Grains = { collateral: number; debt: number };

/** Each side's "price", its grain, every day: a unit factor, so it names
 *  no block. */
function sidePrices(firstDay: number, endDay: number, G: Grains) {
  const a: DayObs[] = [];
  const b: DayObs[] = [];
  for (let d = firstDay; d <= endDay; d++) {
    a.push([d, G.collateral]);
    b.push([d, G.debt]);
  }
  return { [A]: a, [B]: b };
}

/** The page's flows: the panel's timeline and the rows as the event cards'
 *  sums read them (lib/shared/flow-focus.ts). */
export interface StStakeFlows {
  timeline: FlowTimeline;
  focus: FocusEvent[];
}

function focusEvents(events: FlowEvent[], buckets: FlowBucket[], G: Grains): FocusEvent[] {
  const out = new Set(buckets.filter((b) => b.dir === "out").map((b) => b.key));
  const sideOf = new Map(buckets.map((b) => [b.key, b.side]));
  return events.map((e) => {
    const move = { collateral: 0, debt: 0 };
    for (const l of e.legs) move[sideOf.get(l.bucket)!] += (out.has(l.bucket) ? -1 : 1) * (l.usd ?? 0);
    const side = (k: "collateral" | "debt") => {
      const bal = e.balances.find((b) => b.side === k)!;
      const after = bal.amount * G[k];
      return {
        before: Math.max(0, after - move[k]),
        after,
        amount: move[k] / G[k],
        symbol: bal.symbol,
        held: bal.amount,
      };
    };
    return {
      id: e.id,
      ts: e.ts,
      ...(e.tx ? { tx: e.tx } : {}),
      legs: e.legs.map((l) => ({ ...l, amount: (l.usd ?? 0) / G[sideOf.get(l.bucket)!] })),
      sides: { collateral: side("collateral"), debt: side("debt") },
    };
  });
}

const D = {
  staked: "v1-st-staked",
  unstaked: "v1-st-unstaked",
  lusdIn: "v1-st-lusd-in",
  lusdOut: "v1-st-lusd-out",
} as const;

function stakeBuckets(): FlowBucket[] {
  return [
    { key: D.staked, label: "Staked", event: "Stake", side: "collateral", dir: "in" },
    { key: D.unstaked, label: "Unstaked", event: "Unstake", side: "collateral", dir: "out" },
    { key: D.lusdIn, label: "LUSD paid in", event: "", side: "debt", dir: "in" },
    { key: D.lusdOut, label: "LUSD paid out", event: "", side: "debt", dir: "out" },
  ];
}

type Opts = { open: boolean; now: StakeNow | null; nowSec: number };

/** A stake's rows, oldest first, as the panel's timeline and focus events.
 *  Null without a row. */
export function stStakeFlows(rowsAsc: LiquityV1StakeEventRow[], o: Opts): StStakeFlows | null {
  if (rowsAsc.length === 0) return null;
  let peakA = 0;
  let inA = 0;
  let inB = 0;
  let peakB = 0;
  const legsOf = rowsAsc.map(stakeLegs);
  for (const g of legsOf) {
    inA += units(g.staked);
    inB += units(g.lusd);
    peakA = Math.max(peakA, inA);
    peakB = Math.max(peakB, inB);
  }
  if (o.now) peakB = Math.max(peakB, inB + units(o.now.pendingLusd));
  const scale = { collateral: unitScaleFor(peakA), debt: unitScaleFor(peakB) };
  const G: Grains = { collateral: 10 ** scale.collateral, debt: 10 ** scale.debt };

  const events: FlowEvent[] = rowsAsc.map((r, i) => {
    const g = legsOf[i];
    const legs: FlowEvent["legs"] = [];
    const a = (bucket: string, v: bigint) =>
      v > ZERO && legs.push({ bucket, usd: units(v) * G.collateral, symbol: LQTY });
    const b = (bucket: string, v: bigint) => v > ZERO && legs.push({ bucket, usd: units(v) * G.debt, symbol: LUSD });
    a(D.staked, g.staked);
    a(D.unstaked, g.unstaked);
    b(D.lusdIn, g.lusd);
    b(D.lusdOut, g.lusd);
    const movedA = legs.some((l) => l.symbol === LQTY);
    const movedB = legs.some((l) => l.symbol === LUSD);
    return {
      id: r.event_key,
      ts: Number(r.block_timestamp),
      block: Number(r.block_number),
      tick: movedA && movedB ? "both" : movedB ? "debt" : "collateral",
      legs,
      tx: r.tx_hash,
      balances: [
        { asset: A, symbol: LQTY, side: "collateral", amount: units(g.stake) },
        { asset: B, symbol: LUSD, side: "debt", amount: 0 },
      ],
      prices: [
        { asset: A, usd: G.collateral },
        { asset: B, usd: G.debt },
      ],
    };
  });
  const buckets = stakeBuckets();
  const days: FlowDayRow[] = daysFromEvents(
    buckets.map((x) => x.key),
    events,
  );
  const firstDay = Math.floor(events[0].ts / DAY_S);
  const lastDay = Math.floor(events[events.length - 1].ts / DAY_S);
  const last = legsOf[legsOf.length - 1];
  const timeline = stakeTimeline(buckets, days, { firstDay, lastDay, stake: last.stake, scale, G }, o);
  return { timeline, focus: focusEvents(events, buckets, G) };
}

/** The stake's timeline around its day rows: the live figures (the stake,
 *  and the LUSD fees paid in since the last touch, at today), the axes and
 *  the words. */
function stakeTimeline(
  buckets: FlowBucket[],
  days: FlowDayRow[],
  at: { firstDay: number; lastDay: number; stake: bigint; scale: Grains; G: Grains },
  o: Opts,
): FlowTimeline {
  const { firstDay, lastDay, stake, scale, G } = at;
  const today = Math.floor(o.nowSec / DAY_S);
  const endDay = o.open ? Math.max(today, lastDay + 1) : lastDay + 1;

  const n = o.now;
  const heldA = o.open ? (n ? units(n.stake) : units(stake)) : 0;
  const heldB = o.open && n ? units(n.pendingLusd) : 0;
  const pending: NonNullable<FlowTimeline["live"]["pending"]> = [];
  if (n && n.pendingLusd > ZERO) pending.push({ bucket: D.lusdIn, symbol: LUSD, usd: units(n.pendingLusd) * G.debt });
  const assets: NonNullable<FlowTimeline["live"]["assets"]> = [];
  if (heldA > DUST) assets.push({ side: "collateral", symbol: LQTY, amount: heldA, usd: heldA * G.collateral });
  if (heldB > DUST) assets.push({ side: "debt", symbol: LUSD, amount: heldB, usd: heldB * G.debt });

  return {
    unit: { symbol: LQTY, scale: scale.collateral },
    sideUnits: {
      collateral: { symbol: LQTY, scale: scale.collateral },
      debt: { symbol: LUSD, scale: scale.debt },
    },
    buckets,
    days,
    live: {
      collateralUsd: heldA * G.collateral,
      debtUsd: heldB * G.debt,
      assets,
      ...(pending.length ? { pending } : {}),
    },
    todayPrices: { [A]: G.collateral, [B]: G.debt },
    dailyPrices: sidePrices(firstDay, endDay, G),
    seriesCarry: true,
    today: o.open ? today : endDay,
    labels: { collateral: "LQTY stake", debt: "LUSD fees paid in" },
    addresses: { [LQTY]: TOKEN_ADDRESSES.LQTY, [LUSD]: TOKEN_ADDRESSES.LUSD },
    words: {
      held: "Held",
      restBySide: { debt: "Paid in since the last touch" },
      basis: {
        collateral: "Every figure is in LQTY.",
        debt: "Every figure is in LUSD.",
      },
      heldBasis: {
        collateral: "the stake, which moves only at the staker's touches.",
        debt: "nothing at a touch, which pays out all the fees paid in.",
      },
      linePrices: "with the stake in LQTY and the fees in LUSD, each on its own scale",
      moment: { tokensOnly: ["collateral", "debt"] },
    },
  };
}

/** A stake too long to send whole, from its day rows (/staking/flows/daily):
 *  the running sums after each day's last touch. No focus events: the page
 *  lists only the newest touches. */
export function stStakeFlowsFromDays(rows: LiquityV1StakeDay[], o: Opts): StStakeFlows | null {
  if (rows.length === 0) return null;
  const v = (raw: string) => units(big(raw));
  let peakA = 0;
  let peakB = 0;
  for (const r of rows) {
    peakA = Math.max(peakA, v(r.staked));
    peakB = Math.max(peakB, v(r.lusd_in));
  }
  const lastRow = rows[rows.length - 1];
  if (o.now) peakB = Math.max(peakB, v(lastRow.lusd_in) + units(o.now.pendingLusd));
  const scale = { collateral: unitScaleFor(peakA), debt: unitScaleFor(peakB) };
  const G: Grains = { collateral: 10 ** scale.collateral, debt: 10 ** scale.debt };
  let events = 0;
  let txs = 0;
  let prev: LiquityV1StakeDay | null = null;
  const days: FlowDayRow[] = rows.map((r) => {
    events += r.events;
    txs += r.txs;
    const moved = (keys: (keyof LiquityV1StakeDay)[]) =>
      keys.some((k) => big(String(r[k])) !== (prev ? big(String(prev[k])) : ZERO));
    const movedA = moved(["staked", "unstaked"]);
    const movedB = moved(["lusd_in"]);
    prev = r;
    const ts = Number(r.last_timestamp);
    const cum = {
      [D.staked]: v(r.staked) * G.collateral,
      [D.unstaked]: v(r.unstaked) * G.collateral,
      [D.lusdIn]: v(r.lusd_in) * G.debt,
      [D.lusdOut]: v(r.lusd_in) * G.debt,
    };
    const cumAsset = Object.entries(cum).map(([bucket, usd]) => ({
      bucket,
      symbol: bucket === D.lusdIn || bucket === D.lusdOut ? LUSD : LQTY,
      usd,
    }));
    return {
      day: r.day,
      cumAsset,
      events,
      txs,
      tick: movedA && movedB ? "both" : movedB ? "debt" : "collateral",
      cum,
      balances: [
        { asset: A, symbol: LQTY, side: "collateral", amount: v(r.stake) },
        { asset: B, symbol: LUSD, side: "debt", amount: 0 },
      ],
      prices: [
        { asset: A, usd: G.collateral, ts },
        { asset: B, usd: G.debt, ts },
      ],
    };
  });
  const timeline = stakeTimeline(
    stakeBuckets(),
    days,
    { firstDay: rows[0].day, lastDay: lastRow.day, stake: big(lastRow.stake), scale, G },
    o,
  );
  return { timeline, focus: [] };
}
