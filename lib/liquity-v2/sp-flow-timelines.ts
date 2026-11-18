// Lifetime flows for a Liquity V2 stability-pool deposit: the page's rows
// replayed into the day rows the Lifetime flows panel reads
// (lib/shared/flows-timeline.ts), each bar in its own token
// (`FlowTimeline.sideUnits`). Nothing is priced (decision 0022, token mode;
// the bars per its 2026-11-17 amendment).
//
// The deposit's bar is BOLD: deposited and the BOLD yield the touches paid in,
// less withdrawn, burned by liquidations and the yield claimed, holds the
// deposit recorded at the last touch. The second bar is the branch collateral:
// paid in at touches, less claimed, holds the stash. Today each bar adds what
// the pool has done since the last touch to the line it belongs to
// (`live.pending`): the burn, the yield and the collateral pending.
//
// Polaris's deposit (lib/polaris/sp-loan-flow-timelines.ts) is the shape; the
// panel draws a paid-in bar's markers the same way here.

import type { FocusEvent } from "@/lib/shared/flow-focus";
import type { FlowBucket, FlowDayRow, FlowEvent, FlowTimeline } from "@/lib/shared/flows-timeline";
import type { DayObs } from "@/lib/shared/price-series";
import { daysFromEvents, unitScaleFor } from "@/lib/shared/flows-timeline";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import type { LiquityV2DepositDay, LiquityV2DepositEventRow } from "@/lib/sources/api/liquity-v2-sp";
import { big, depositLegs, units, type DepositNow } from "./sp-math";
import type { SpBranch } from "./sp-routes";

const DAY_S = 86_400;
const DUST = 1e-12;
const ZERO = BigInt(0);
const A = "a";
const B = "b";
const BOLD = "BOLD";

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
    for (const l of e.legs) move[sideOf.get(l.bucket)!] += (out.has(l.bucket) ? -1 : 1) * l.usd;
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
      legs: e.legs.map((l) => ({ ...l, amount: l.usd / G[sideOf.get(l.bucket)!] })),
      sides: { collateral: side("collateral"), debt: side("debt") },
    };
  });
}

const D = {
  deposited: "v2-sp-deposited",
  yieldIn: "v2-sp-yield-in",
  withdrawn: "v2-sp-withdrawn",
  burned: "v2-sp-burned",
  yieldClaimed: "v2-sp-yield-claimed",
  collIn: "v2-sp-coll-in",
  collClaimed: "v2-sp-coll-claimed",
} as const;

function depositBuckets(coll: string): FlowBucket[] {
  return [
    { key: D.deposited, label: "Deposited", event: "Deposit", side: "collateral", dir: "in" },
    { key: D.yieldIn, label: "BOLD yield paid in", event: "", side: "collateral", dir: "in", hatch: "dashes" },
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
    {
      key: D.yieldClaimed,
      label: "BOLD yield claimed",
      event: "Claim",
      side: "collateral",
      dir: "out",
      hatch: "vertical",
    },
    { key: D.collIn, label: `${coll} paid in`, event: "", side: "debt", dir: "in" },
    { key: D.collClaimed, label: `${coll} claimed`, event: "", side: "debt", dir: "out" },
  ];
}

type Opts = { open: boolean; now: DepositNow | null; nowSec: number };

/** A deposit's rows, oldest first, as the panel's timeline and focus events.
 *  Null without a row. */
export function spDepositFlows(branch: SpBranch, rowsAsc: LiquityV2DepositEventRow[], o: Opts): SpDepositFlows | null {
  if (rowsAsc.length === 0) return null;
  const c = branch;
  let peakA = 0;
  let peakB = 0;
  let inA = 0;
  let inB = 0;
  const legsOf = rowsAsc.map(depositLegs);
  for (const g of legsOf) {
    inA += units(g.deposited) + units(g.yieldIn);
    inB += units(g.collIn);
    peakA = Math.max(peakA, inA);
    peakB = Math.max(peakB, inB);
  }
  if (o.now) {
    peakA = Math.max(peakA, inA + units(o.now.pendingYield));
    peakB = Math.max(peakB, inB + units(o.now.collSinceTouch));
  }
  const scale = { collateral: unitScaleFor(peakA), debt: unitScaleFor(peakB) };
  const G: Grains = { collateral: 10 ** scale.collateral, debt: 10 ** scale.debt };

  const events: FlowEvent[] = rowsAsc.map((r, i) => {
    const g = legsOf[i];
    const legs: FlowEvent["legs"] = [];
    const a = (bucket: string, v: bigint) =>
      v > ZERO && legs.push({ bucket, usd: units(v) * G.collateral, symbol: BOLD });
    const b = (bucket: string, v: bigint) => v > ZERO && legs.push({ bucket, usd: units(v) * G.debt, symbol: c });
    a(D.deposited, g.deposited);
    a(D.withdrawn, g.withdrawn);
    a(D.burned, g.burned);
    a(D.yieldIn, g.yieldIn);
    a(D.yieldClaimed, g.yieldClaimed);
    b(D.collIn, g.collIn);
    b(D.collClaimed, g.collClaimed);
    const movedA = legs.some((l) => l.symbol === BOLD);
    const movedB = legs.some((l) => l.symbol === c);
    return {
      id: r.event_key,
      ts: Number(r.block_timestamp),
      block: Number(r.block_number),
      tick: movedA && movedB ? "both" : movedB ? "debt" : "collateral",
      legs,
      tx: r.tx_hash,
      balances: [
        { asset: A, symbol: BOLD, side: "collateral", amount: units(g.deposit) },
        { asset: B, symbol: c, side: "debt", amount: units(g.stash) },
      ],
      prices: [
        { asset: A, usd: G.collateral },
        { asset: B, usd: G.debt },
      ],
    };
  });
  const buckets = depositBuckets(c);
  const days: FlowDayRow[] = daysFromEvents(
    buckets.map((x) => x.key),
    events,
  );
  const firstDay = Math.floor(events[0].ts / DAY_S);
  const lastDay = Math.floor(events[events.length - 1].ts / DAY_S);
  const last = legsOf[legsOf.length - 1];
  const timeline = depositTimeline(branch, buckets, days, { firstDay, lastDay, last, scale, G }, o);
  return { timeline, focus: focusEvents(events, buckets, G) };
}

/** The deposit's timeline around its day rows: the live figures (what the
 *  pool has done since the last touch, at today), the axes and the words. */
function depositTimeline(
  branch: SpBranch,
  buckets: FlowBucket[],
  days: FlowDayRow[],
  at: { firstDay: number; lastDay: number; last: { deposit: bigint; stash: bigint }; scale: Grains; G: Grains },
  o: Opts,
): FlowTimeline {
  const c = branch;
  const { firstDay, lastDay, last, scale, G } = at;
  const today = Math.floor(o.nowSec / DAY_S);
  const endDay = o.open ? Math.max(today, lastDay + 1) : lastDay + 1;

  const n = o.now;
  const heldA = o.open ? (n ? units(n.now) + units(n.pendingYield) : units(last.deposit)) : 0;
  // A closed deposit can still hold a stash, which only a claim sends.
  const heldB = units(last.stash) + (o.open && n ? units(n.collSinceTouch) : 0);
  const pending: NonNullable<FlowTimeline["live"]["pending"]> = [];
  if (n) {
    if (n.pendingLoss > ZERO)
      pending.push({ bucket: D.burned, symbol: BOLD, usd: units(n.pendingLoss) * G.collateral });
    if (n.pendingYield > ZERO)
      pending.push({ bucket: D.yieldIn, symbol: BOLD, usd: units(n.pendingYield) * G.collateral });
    if (n.collSinceTouch > ZERO) pending.push({ bucket: D.collIn, symbol: c, usd: units(n.collSinceTouch) * G.debt });
  }
  const assets: NonNullable<FlowTimeline["live"]["assets"]> = [];
  if (heldA > DUST) assets.push({ side: "collateral", symbol: BOLD, amount: heldA, usd: heldA * G.collateral });
  if (heldB > DUST) assets.push({ side: "debt", symbol: c, amount: heldB, usd: heldB * G.debt });

  return {
    unit: { symbol: BOLD, scale: scale.collateral },
    sideUnits: {
      collateral: { symbol: BOLD, scale: scale.collateral },
      debt: { symbol: c, scale: scale.debt },
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
    labels: { collateral: "BOLD deposit", debt: `${c} paid in` },
    addresses: { [BOLD]: TOKEN_ADDRESSES.BOLD, [c]: LIQUITY_V2_BRANCHES[c.toLowerCase()].collateralAddr },
    words: {
      held: "Held",
      restBySide: { collateral: "Burned since the last touch", debt: "Paid in since the last touch" },
      basis: {
        collateral: "Every figure is in BOLD.",
        debt: `Every figure is in ${c}. Nothing prices ${c} in BOLD here.`,
      },
      heldBasis: {
        collateral: "the deposit recorded at its last touch; the pool records a deposit only when it is touched.",
        debt: `the ${c} stashed at the last touch.`,
      },
      linePrices: `with the deposit in BOLD and the ${c} in ${c}, each on its own scale`,
      moment: { tokensOnly: ["collateral", "debt"] },
    },
  };
}

/** A deposit too long to send whole, from its day rows
 *  (/stability-pool/flows/daily): the running sums after each day's last
 *  operation. No focus events: the page lists only the newest operations. */
export function spDepositFlowsFromDays(branch: SpBranch, rows: LiquityV2DepositDay[], o: Opts): SpDepositFlows | null {
  if (rows.length === 0) return null;
  const c = branch;
  const v = (raw: string) => units(big(raw));
  let peakA = 0;
  let peakB = 0;
  for (const r of rows) {
    peakA = Math.max(peakA, v(r.deposited) + v(r.yield_in));
    peakB = Math.max(peakB, v(r.coll_in));
  }
  const lastRow = rows[rows.length - 1];
  if (o.now) {
    peakA = Math.max(peakA, v(lastRow.deposited) + v(lastRow.yield_in) + units(o.now.pendingYield));
    peakB = Math.max(peakB, v(lastRow.coll_in) + units(o.now.collSinceTouch));
  }
  const scale = { collateral: unitScaleFor(peakA), debt: unitScaleFor(peakB) };
  const G: Grains = { collateral: 10 ** scale.collateral, debt: 10 ** scale.debt };
  let events = 0;
  let txs = 0;
  let prev: LiquityV2DepositDay | null = null;
  const days: FlowDayRow[] = rows.map((r) => {
    events += r.events;
    txs += r.txs;
    const moved = (keys: (keyof LiquityV2DepositDay)[]) =>
      keys.some((k) => big(String(r[k])) !== (prev ? big(String(prev[k])) : ZERO));
    const movedA = moved(["deposited", "withdrawn", "burned", "yield_in", "yield_claimed"]);
    const movedB = moved(["coll_in", "coll_claimed"]);
    prev = r;
    const ts = Number(r.last_timestamp);
    const cum = {
      [D.deposited]: v(r.deposited) * G.collateral,
      [D.yieldIn]: v(r.yield_in) * G.collateral,
      [D.withdrawn]: v(r.withdrawn) * G.collateral,
      [D.burned]: v(r.burned) * G.collateral,
      [D.yieldClaimed]: v(r.yield_claimed) * G.collateral,
      [D.collIn]: v(r.coll_in) * G.debt,
      [D.collClaimed]: v(r.coll_claimed) * G.debt,
    };
    const cumAsset = Object.entries(cum).map(([bucket, usd]) => ({
      bucket,
      symbol: bucket === D.collIn || bucket === D.collClaimed ? c : BOLD,
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
        { asset: A, symbol: BOLD, side: "collateral", amount: v(r.deposit) },
        { asset: B, symbol: c, side: "debt", amount: v(r.stash) },
      ],
      prices: [
        { asset: A, usd: G.collateral, ts },
        { asset: B, usd: G.debt, ts },
      ],
    };
  });
  const timeline = depositTimeline(
    branch,
    depositBuckets(c),
    days,
    {
      firstDay: rows[0].day,
      lastDay: lastRow.day,
      last: { deposit: big(lastRow.deposit), stash: big(lastRow.stash) },
      scale,
      G,
    },
    o,
  );
  return { timeline, focus: [] };
}
