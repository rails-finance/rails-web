// Lifetime flows for a Liquity V1 stability-pool deposit: the page's rows
// replayed into the day rows the Lifetime flows panel reads
// (lib/shared/flows-timeline.ts), each bar in its own token
// (`FlowTimeline.sideUnits`). Nothing is priced (decision 0022, token mode).
//
// The deposit's bar is LUSD: deposited, less withdrawn and burned by
// liquidations, holds the deposit recorded at the last touch. The second bar
// is ETH: paid in by liquidations and paid out at the same touch, so it holds
// nothing between touches. LQTY is the deposit's third token; the panel draws
// two bars, so the card, the rows and the since-last-touch row state it. Today
// each bar adds what the pool has done since the last touch (`live.pending`):
// the burn and the ETH pending.
//
// Liquity V2's deposit (lib/liquity-v2/sp-flow-timelines.ts) is the shape.

import type { FocusEvent } from "@/lib/shared/flow-focus";
import type { FlowBucket, FlowDayRow, FlowEvent, FlowTimeline } from "@/lib/shared/flows-timeline";
import type { DayObs } from "@/lib/shared/price-series";
import { daysFromEvents, unitScaleFor } from "@/lib/shared/flows-timeline";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import { NATIVE } from "@/lib/shared/asset-roster";
import type { LiquityV1DepositDay, LiquityV1DepositEventRow } from "@/lib/sources/api/liquity-v1-sp";
import { big, depositLegs, units, type DepositNow } from "./sp-math";

const DAY_S = 86_400;
const DUST = 1e-12;
const ZERO = BigInt(0);
const A = "a";
const B = "b";
const LUSD = "LUSD";
const ETH = "ETH";

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
export interface SpDepositFlows {
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
  deposited: "v1-sp-deposited",
  withdrawn: "v1-sp-withdrawn",
  burned: "v1-sp-burned",
  ethIn: "v1-sp-eth-in",
  ethOut: "v1-sp-eth-out",
} as const;

function depositBuckets(): FlowBucket[] {
  return [
    { key: D.deposited, label: "Deposited", event: "Deposit", side: "collateral", dir: "in" },
    { key: D.withdrawn, label: "Withdrawn", event: "Withdrawal", side: "collateral", dir: "out" },
    {
      key: D.burned,
      label: "Burned by liquidations",
      event: "",
      side: "collateral",
      dir: "out",
      tone: "liquidation",
      hatch: "forward",
    },
    { key: D.ethIn, label: "ETH paid in", event: "", side: "debt", dir: "in" },
    { key: D.ethOut, label: "ETH paid out", event: "", side: "debt", dir: "out" },
  ];
}

type Opts = { open: boolean; now: DepositNow | null; nowSec: number };

/** A deposit's rows, oldest first, as the panel's timeline and focus events.
 *  Null without a row. */
export function spDepositFlows(rowsAsc: LiquityV1DepositEventRow[], o: Opts): SpDepositFlows | null {
  if (rowsAsc.length === 0) return null;
  let peakA = 0;
  let inA = 0;
  let inB = 0;
  let peakB = 0;
  const legsOf = rowsAsc.map(depositLegs);
  for (const g of legsOf) {
    inA += units(g.deposited);
    inB += units(g.eth);
    peakA = Math.max(peakA, inA);
    peakB = Math.max(peakB, inB);
  }
  if (o.now) peakB = Math.max(peakB, inB + units(o.now.pendingEth));
  const scale = { collateral: unitScaleFor(peakA), debt: unitScaleFor(peakB) };
  const G: Grains = { collateral: 10 ** scale.collateral, debt: 10 ** scale.debt };

  const events: FlowEvent[] = rowsAsc.map((r, i) => {
    const g = legsOf[i];
    const legs: FlowEvent["legs"] = [];
    const a = (bucket: string, v: bigint) =>
      v > ZERO && legs.push({ bucket, usd: units(v) * G.collateral, symbol: LUSD });
    const b = (bucket: string, v: bigint) => v > ZERO && legs.push({ bucket, usd: units(v) * G.debt, symbol: ETH });
    a(D.deposited, g.deposited);
    a(D.withdrawn, g.withdrawn);
    a(D.burned, g.burned);
    b(D.ethIn, g.eth);
    b(D.ethOut, g.eth);
    const movedA = legs.some((l) => l.symbol === LUSD);
    const movedB = legs.some((l) => l.symbol === ETH);
    return {
      id: r.event_key,
      ts: Number(r.block_timestamp),
      block: Number(r.block_number),
      tick: movedA && movedB ? "both" : movedB ? "debt" : "collateral",
      legs,
      tx: r.tx_hash,
      balances: [
        { asset: A, symbol: LUSD, side: "collateral", amount: units(g.deposit) },
        { asset: B, symbol: ETH, side: "debt", amount: 0 },
      ],
      prices: [
        { asset: A, usd: G.collateral },
        { asset: B, usd: G.debt },
      ],
    };
  });
  const buckets = depositBuckets();
  const days: FlowDayRow[] = daysFromEvents(
    buckets.map((x) => x.key),
    events,
  );
  const firstDay = Math.floor(events[0].ts / DAY_S);
  const lastDay = Math.floor(events[events.length - 1].ts / DAY_S);
  const last = legsOf[legsOf.length - 1];
  const timeline = depositTimeline(buckets, days, { firstDay, lastDay, deposit: last.deposit, scale, G }, o);
  return { timeline, focus: focusEvents(events, buckets, G) };
}

/** The deposit's timeline around its day rows: the live figures (what the
 *  pool has done since the last touch, at today), the axes and the words. */
function depositTimeline(
  buckets: FlowBucket[],
  days: FlowDayRow[],
  at: { firstDay: number; lastDay: number; deposit: bigint; scale: Grains; G: Grains },
  o: Opts,
): FlowTimeline {
  const { firstDay, lastDay, deposit, scale, G } = at;
  const today = Math.floor(o.nowSec / DAY_S);
  const endDay = o.open ? Math.max(today, lastDay + 1) : lastDay + 1;

  const n = o.now;
  const heldA = o.open ? (n ? units(n.now) : units(deposit)) : 0;
  const heldB = o.open && n ? units(n.pendingEth) : 0;
  const pending: NonNullable<FlowTimeline["live"]["pending"]> = [];
  if (n) {
    if (n.pendingLoss > ZERO)
      pending.push({ bucket: D.burned, symbol: LUSD, usd: units(n.pendingLoss) * G.collateral });
    if (n.pendingEth > ZERO) pending.push({ bucket: D.ethIn, symbol: ETH, usd: units(n.pendingEth) * G.debt });
  }
  const assets: NonNullable<FlowTimeline["live"]["assets"]> = [];
  if (heldA > DUST) assets.push({ side: "collateral", symbol: LUSD, amount: heldA, usd: heldA * G.collateral });
  if (heldB > DUST) assets.push({ side: "debt", symbol: ETH, amount: heldB, usd: heldB * G.debt });

  return {
    unit: { symbol: LUSD, scale: scale.collateral },
    sideUnits: {
      collateral: { symbol: LUSD, scale: scale.collateral },
      debt: { symbol: ETH, scale: scale.debt },
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
    labels: { collateral: "LUSD deposit", debt: "ETH paid in" },
    addresses: { [LUSD]: TOKEN_ADDRESSES.LUSD, [ETH]: NATIVE },
    words: {
      held: "Held",
      restBySide: { collateral: "Burned since the last touch", debt: "Paid in since the last touch" },
      basis: {
        collateral: "Every figure is in LUSD.",
        debt: "Every figure is in ETH; the bar does not price ETH in LUSD.",
      },
      heldBasis: {
        collateral: "the deposit recorded at its last touch; the pool records a deposit only when it is touched.",
        debt: "nothing at a touch, which pays out all the ETH paid in.",
      },
      linePrices: "with the deposit in LUSD and the ETH in ETH, each on its own scale",
      moment: { tokensOnly: ["collateral", "debt"] },
    },
  };
}

/** A deposit too long to send whole, from its day rows
 *  (/stability-pool/flows/daily): the running sums after each day's last
 *  touch. No focus events: the page lists only the newest touches. */
export function spDepositFlowsFromDays(rows: LiquityV1DepositDay[], o: Opts): SpDepositFlows | null {
  if (rows.length === 0) return null;
  const v = (raw: string) => units(big(raw));
  let peakA = 0;
  let peakB = 0;
  for (const r of rows) {
    peakA = Math.max(peakA, v(r.deposited));
    peakB = Math.max(peakB, v(r.eth_in));
  }
  const lastRow = rows[rows.length - 1];
  if (o.now) peakB = Math.max(peakB, v(lastRow.eth_in) + units(o.now.pendingEth));
  const scale = { collateral: unitScaleFor(peakA), debt: unitScaleFor(peakB) };
  const G: Grains = { collateral: 10 ** scale.collateral, debt: 10 ** scale.debt };
  let events = 0;
  let txs = 0;
  let prev: LiquityV1DepositDay | null = null;
  const days: FlowDayRow[] = rows.map((r) => {
    events += r.events;
    txs += r.txs;
    const moved = (keys: (keyof LiquityV1DepositDay)[]) =>
      keys.some((k) => big(String(r[k])) !== (prev ? big(String(prev[k])) : ZERO));
    const movedA = moved(["deposited", "withdrawn", "burned"]);
    const movedB = moved(["eth_in"]);
    prev = r;
    const ts = Number(r.last_timestamp);
    const cum = {
      [D.deposited]: v(r.deposited) * G.collateral,
      [D.withdrawn]: v(r.withdrawn) * G.collateral,
      [D.burned]: v(r.burned) * G.collateral,
      [D.ethIn]: v(r.eth_in) * G.debt,
      [D.ethOut]: v(r.eth_in) * G.debt,
    };
    const cumAsset = Object.entries(cum).map(([bucket, usd]) => ({
      bucket,
      symbol: bucket === D.ethIn || bucket === D.ethOut ? ETH : LUSD,
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
        { asset: A, symbol: LUSD, side: "collateral", amount: v(r.deposit) },
        { asset: B, symbol: ETH, side: "debt", amount: 0 },
      ],
      prices: [
        { asset: A, usd: G.collateral, ts },
        { asset: B, usd: G.debt, ts },
      ],
    };
  });
  const timeline = depositTimeline(
    depositBuckets(),
    days,
    { firstDay: rows[0].day, lastDay: lastRow.day, deposit: big(lastRow.deposit), scale, G },
    o,
  );
  return { timeline, focus: [] };
}
