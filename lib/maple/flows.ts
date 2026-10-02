// Lifetime flows for a Maple lender, one pool at a time: the page's rows
// replayed into the day rows the Lifetime flows panel reads
// (lib/shared/flows-timeline.ts; rails-ops reference/lifetime-flows-scrubber.md,
// "Maple").
// ----------------------------------------------------------------------------
// ONE SIDE, IN THE POOL'S TOKEN. A lender holds pool shares (syrupUSDC,
// syrupUSDT); its claim is (shares + shares waiting in the withdrawal queue) ×
// the pool's rate, in USDC or USDT. Maple states no USD, so every figure is the
// pool's funds asset (`FlowTimeline.unit`), and a wallet in both pools has one
// timeline per pool.
//
// Each row states the claim after it at the pool's rate in its block (server
// caca476: `value_after`, the shares and escrow after the row × totalAssets ÷
// totalSupply, or the same-block Deposit / Withdraw log's ratio). Within one
// transaction every row states the transaction's after-image, so the replay
// steps a transaction at a time:
//
//     claim after the transaction
//       = claim after the one before + what moved + interest
//
// What moved is each row's amount: a deposit's assets in, a withdrawal's
// or a queue fill's assets out, a transfer's shares at the block's rate. The
// interest is the rest: the claim's rise at the pool's rate since the last
// transaction, exact to the base unit apart from the rounding of each row's
// amount against its shares and of a rate a small log states, which it
// carries. Where it falls by more than that rounding, the pool's rate fell,
// and the fall is a separate line. A request moves shares into the queue's escrow and a
// cancellation back, both still the wallet's claim, so neither moves a line.
//
// Between events the claim's shares are fixed, and the pool's rate runs in a
// straight line from its value at one of the wallet's events to the next;
// after the last, to the pool's exit rate now (the page's chain read). Maple
// is not in the daily price store, and the token axis needs no price.
//
// Pure: tested offline in scripts/verify/verify-maple-flows.ts.

import type { FlowBucket, FlowEvent, FlowTimeline } from "@/lib/shared/flows-timeline";
import { daysFromEvents, unitScaleFor } from "@/lib/shared/flows-timeline";
import type { FocusEvent } from "@/lib/shared/flow-focus";
import type { BaseActivityEvent, MapleContext, MapleEventType } from "@/lib/shared/types/event-shape";
import { isMapleEvent } from "@/lib/shared/types/event-shape";
import { maplePoolOf } from "@/lib/maple/asset-catalog";

const DAY_S = 86_400;
const ONE_YEAR_S = 31_557_600;
const DUST = 1e-9;

/** Bucket keys. */
export const MP = {
  deposited: "mp-deposited",
  received: "mp-received",
  interest: "mp-interest",
  withdrawn: "mp-withdrawn",
  queue: "mp-queue",
  sent: "mp-sent",
  rateFall: "mp-rate-fall",
} as const;

export const MAPLE_OUT_KEYS = new Set<string>([MP.withdrawn, MP.queue, MP.sent, MP.rateFall]);
/** Legs that are not the row's act: the pool's rate moving the claim. */
const ACCRUAL_KEYS = new Set<string>([MP.interest, MP.rateFall]);

const ALL_BUCKETS: FlowBucket[] = [
  { key: MP.deposited, label: "Deposited", event: "Deposit", side: "collateral", dir: "in" },
  { key: MP.received, label: "Received by transfer", event: "Received", side: "collateral", dir: "in", hatch: "grid" },
  // Interest is dashed (rails-ops reference/lifetime-flows-scrubber.md): it
  // moves on most events, so it names none.
  { key: MP.interest, label: "Interest earned", event: "", side: "collateral", dir: "in", hatch: "dashes" },
  { key: MP.withdrawn, label: "Withdrawn", event: "Withdraw", side: "collateral", dir: "out", hatch: "reverse" },
  {
    key: MP.queue,
    label: "Withdrawn through the queue",
    event: "Withdrawal filled",
    side: "collateral",
    dir: "out",
    hatch: "cross",
  },
  { key: MP.sent, label: "Transferred out", event: "Sent", side: "collateral", dir: "out", hatch: "dots" },
  {
    key: MP.rateFall,
    label: "Fall in the pool's rate",
    event: "",
    side: "collateral",
    dir: "out",
    tone: "liquidation",
    hatch: "vertical",
  },
];

/** Every line the family can draw, in drawing order. */
export const mapleFlowBuckets = (): FlowBucket[] => ALL_BUCKETS;

/** One row of a Maple position, in the pool's token. */
export interface MapleFlowRow {
  id: string;
  /** Unix seconds. */
  ts: number;
  block: number;
  tx: string;
  kind: MapleEventType;
  pool: string;
  /** The row's amount, signed (in +, out −), in the funds asset: a
   *  deposit's or a withdrawal's or a fill's assets, a transfer's shares at the
   *  block's rate. Zero for the queue's requests and cancellations. */
  amount: number;
  /** A transfer whose block has no rate: its amount is unknown. */
  unvalued: boolean;
  /** The pool's rate in the row's block, funds asset per share; null where
   *  the index holds none. */
  rate: number | null;
  /** The rate's precision, relative: one base unit of the smaller of the two
   *  amounts it divides (a small same-block log prices the pool coarsely). */
  ratePrecision: number;
  /** The claim after the row (its transaction's after-image), null where the
   *  block has no rate. */
  claimAfter: number | null;
  /** Shares plus shares in the queue after the row. */
  sharesHeld: number;
  /** The server's interest since the pool's previous row (that row's shares
   *  and escrow at this block's rate, less its claim), where it states one. */
  interestSincePrev: number | null;
}

const DEC = 1e6;

/** A base-unit integer string to the token (both syrup pools are 6-dp). */
const units = (raw: string | undefined, human?: string): number | null => {
  if (raw != null && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n / DEC;
  }
  if (human != null && human !== "") {
    const n = Number(human);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

/** The page's rows as the replay reads them, oldest first, per pool. The
 *  served order is newest first by (block, transaction, log), turned round. */
export function mapleFlowRows(events: BaseActivityEvent[]): Map<string, MapleFlowRow[]> {
  const rows = events.filter(isMapleEvent);
  if (rows.length > 1 && rows[0].blockNumber > rows[rows.length - 1].blockNumber) rows.reverse();
  rows.sort((a, b) => a.blockNumber - b.blockNumber);
  const out = new Map<string, MapleFlowRow[]>();
  for (const e of rows) {
    const c = e.context.data as MapleContext;
    const raw = c.raw ?? {};
    const rateA = units(raw.rateAssets);
    const rateS = units(raw.rateShares);
    const rate = rateA != null && rateS != null && rateS > 0 ? rateA / rateS : null;
    const assets = Math.abs(units(raw.assets, c.assetsDelta) ?? 0);
    const shares = Math.abs(units(raw.shares, c.sharesDelta) ?? 0);
    let amount = 0;
    let unvalued = false;
    switch (c.eventType) {
      case "deposit":
        amount = assets;
        break;
      case "withdraw":
      case "request_fill":
        amount = -assets;
        break;
      case "transfer_in":
      case "transfer_out": {
        const v = rate != null ? shares * rate : units(raw.transferAssets, c.transferValue);
        if (v == null) unvalued = true;
        amount = (c.eventType === "transfer_in" ? 1 : -1) * (v ?? 0);
        break;
      }
      default:
        amount = 0;
    }
    const row: MapleFlowRow = {
      id: e.id,
      ts: e.timestamp,
      block: e.blockNumber,
      tx: (e.txHash ?? e.id).toLowerCase(),
      kind: c.eventType,
      pool: c.pool,
      amount,
      unvalued,
      rate,
      ratePrecision: rateA != null && rateS != null && rateA > 0 && rateS > 0 ? 1e-6 / Math.min(rateA, rateS) : 0,
      claimAfter: units(raw.valueAfter, c.valueAfter),
      sharesHeld: (units(raw.sharesAfter, c.sharesAfter) ?? 0) + (units(raw.escrowAfter, c.escrowAfter) ?? 0),
      interestSincePrev: units(raw.interestSincePrev, c.interestSincePrev),
    };
    const list = out.get(c.pool);
    if (list) list.push(row);
    else out.set(c.pool, [row]);
  }
  return out;
}

/** A replayed row: its legs in the funds asset, and the claim once its
 *  transaction had run. */
export interface MapleReplayed {
  row: MapleFlowRow;
  legs: { bucket: string; amount: number }[];
  /** The claim after the row's transaction. */
  claim: number;
  /** The pool's rate the claim is valued at (the transaction's). */
  rate: number | null;
  /** Whether the row is its transaction's last in this pool. */
  lastOfTx: boolean;
}

export interface MapleReplayFacts {
  /** Transactions whose block has no rate: their claim is the one before plus
   *  what moved, and the interest before them lands on the next rated one. */
  unrated: number;
  /** Transfers with no value (no rate in their block). */
  unvalued: number;
  /** Queue fills whose transaction left the claim as it was (the shares came
   *  out of the queue to the wallet and a later withdrawal redeemed them): the
   *  later withdrawal is the outflow. */
  fillsWithoutPayout: number;
  /** Transactions whose rows' amounts leave a claim move other than the
   *  interest the server states, by more than rounding: the difference is in
   *  Interest earned. */
  unmatched: number;
  /** Falls in the pool's rate beyond rounding. */
  rateFalls: number;
}

/** The rounding a transaction's amounts may differ from its claim by: each
 *  row rounds its shares or assets to the base unit at its rate. */
const tolerance = (claim: number, rows: MapleFlowRow[], before: MapleFlowRow | null) =>
  0.00005 * rows.length + claim * (2e-7 + Math.max(...rows.map((r) => r.ratePrecision)) + (before?.ratePrecision ?? 0));

/** The per-transaction replay of one pool's rows. */
export function replayMaple(rows: MapleFlowRow[]): { replayed: MapleReplayed[]; facts: MapleReplayFacts } {
  const facts: MapleReplayFacts = { unrated: 0, unvalued: 0, fillsWithoutPayout: 0, unmatched: 0, rateFalls: 0 };
  const replayed: MapleReplayed[] = [];
  let claim = 0;
  let i = 0;
  while (i < rows.length) {
    let j = i + 1;
    while (j < rows.length && rows[j].tx === rows[i].tx) j++;
    const tx = rows.slice(i, j);
    const last = tx[tx.length - 1];
    let amounts = tx.map((r) => r.amount);
    facts.unvalued += tx.filter((r) => r.unvalued).length;
    const moved = (a: number[]) => a.reduce((s, x) => s + x, 0);
    let after: number;
    let interest = 0;
    let fell = false;
    if (last.claimAfter == null) {
      facts.unrated += 1;
      after = Math.max(0, claim + moved(amounts));
    } else {
      after = last.claimAfter;
      const tol = tolerance(Math.max(claim, after), tx, replayed.length > 0 ? replayed[replayed.length - 1].row : null);
      let rest = after - claim - moved(amounts);
      // The server states the interest on each row (the previous row's shares
      // and escrow at this block's rate, less its claim): the rows' amounts
      // should leave that, give or take their rounding.
      const first = replayed.length === 0;
      const stated = first
        ? 0
        : tx.reduce<number | null>(
            (s, r) => (s == null || r.interestSincePrev == null ? null : s + r.interestSincePrev),
            0,
          );
      const off = (x: number) => (stated == null ? 0 : Math.abs(x - stated));
      if (off(rest) > tol && tx.some((r) => r.kind === "request_fill")) {
        const without = tx.map((r, k) => (r.kind === "request_fill" ? 0 : amounts[k]));
        const restWithout = after - claim - moved(without);
        if (off(restWithout) <= tol) {
          facts.fillsWithoutPayout += tx.filter((r) => r.kind === "request_fill").length;
          amounts = without;
          rest = restWithout;
        }
      }
      if (off(rest) > tol) facts.unmatched += 1;
      // A fall beyond the rounding is the pool's rate falling.
      if (rest < -tol && !first) {
        facts.rateFalls += 1;
        fell = true;
      }
      interest = rest;
    }
    for (let k = 0; k < tx.length; k++) {
      const r = tx[k];
      const legs: { bucket: string; amount: number }[] = [];
      if (k === 0 && interest !== 0)
        legs.push(fell ? { bucket: MP.rateFall, amount: -interest } : { bucket: MP.interest, amount: interest });
      const a = amounts[k];
      if (Math.abs(a) > DUST) {
        const bucket =
          r.kind === "deposit"
            ? MP.deposited
            : r.kind === "withdraw"
              ? MP.withdrawn
              : r.kind === "request_fill"
                ? MP.queue
                : r.kind === "transfer_in"
                  ? MP.received
                  : MP.sent;
        legs.push({ bucket, amount: Math.abs(a) });
      }
      replayed.push({ row: r, legs, claim: after, rate: last.rate ?? r.rate, lastOfTx: k === tx.length - 1 });
    }
    claim = after;
    i = j;
  }
  return { replayed, facts };
}

/** What the page's chain read states now for this pool. */
export interface MapleLive {
  /** (shares + escrowed) × the exit rate at head. */
  claim: number | null;
  /** The exit rate at head, funds asset per share. */
  rate: number | null;
}

export interface MapleFlowOptions {
  assetSymbol: string;
  poolSymbol: string;
  /** Unix seconds now; the page's clock. */
  now: number;
  live: MapleLive | null;
}

/** One pool's replay, with the scale and the pool's rate at each
 *  transaction, for the timeline, the cards and the tests. */
export interface MapleFlowReplay {
  pool: string;
  replayed: MapleReplayed[];
  facts: MapleReplayFacts;
  /** Grains per token: the model's figures are the funds asset × this. */
  grain: number;
  scale: number;
  /** The pool's rate at each transaction that has one, ascending: [unix
   *  seconds, rate]. */
  rates: [number, number][];
}

export function mapleFlowReplay(pool: string, rows: MapleFlowRow[]): MapleFlowReplay {
  const { replayed, facts } = replayMaple(rows);
  let peak = 0;
  let inflow = 0;
  for (const r of replayed) {
    for (const l of r.legs) if (!MAPLE_OUT_KEYS.has(l.bucket)) inflow += Math.max(0, l.amount);
    peak = Math.max(peak, inflow, r.claim);
  }
  const scale = unitScaleFor(peak);
  const rates: [number, number][] = [];
  for (const r of replayed)
    if (r.lastOfTx && r.rate != null && r.rate > 0) {
      const prev = rates[rates.length - 1];
      if (prev && prev[0] === r.row.ts) prev[1] = r.rate;
      else rates.push([r.row.ts, r.rate]);
    }
  return { pool, replayed, facts, grain: 10 ** scale, scale, rates };
}

/** The pool's rate at `t`: a straight line between its rates at the wallet's
 *  events, and after the last toward `liveRate` at `now` (held where the page
 *  has no live read). Null before the first. */
export function mapleRateAt(rates: [number, number][], t: number, now: number, liveRate: number | null): number | null {
  if (rates.length === 0 || t < rates[0][0]) return null;
  let lo = 0;
  let hi = rates.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (rates[mid][0] <= t) lo = mid;
    else hi = mid - 1;
  }
  const [t0, r0] = rates[lo];
  const next: [number, number] | null =
    lo + 1 < rates.length ? rates[lo + 1] : liveRate != null && liveRate > 0 && now > t0 ? [now, liveRate] : null;
  if (!next || next[0] <= t0) return r0;
  const f = Math.min(1, (t - t0) / (next[0] - t0));
  return r0 + (next[1] - r0) * f;
}

const CLAIM = "claim";

/** One pool's rows as the Lifetime flows panel's timeline, in its funds
 *  asset. Null with no rows. */
export function mapleFlowTimeline(rp: MapleFlowReplay, o: MapleFlowOptions): FlowTimeline | null {
  const { replayed, grain: G, scale, rates } = rp;
  if (replayed.length === 0) return null;
  const used = new Set(replayed.flatMap((r) => r.legs.map((l) => l.bucket)));
  // Deposited and Interest earned always; the rest where the rows filled them.
  const buckets = ALL_BUCKETS.filter((b) => b.key === MP.deposited || b.key === MP.interest || used.has(b.key));
  const flowEvents: FlowEvent[] = replayed.map((r) => ({
    id: r.row.id,
    ts: r.row.ts,
    block: r.row.block,
    tick: "collateral",
    legs: r.legs.map((l) => ({ bucket: l.bucket, usd: l.amount * G, symbol: o.assetSymbol })),
    tx: r.row.tx,
    balances: [{ asset: CLAIM, symbol: o.assetSymbol, side: "collateral", amount: Math.max(0, r.claim) }],
    prices: [{ asset: CLAIM, usd: G }],
  }));
  const days = daysFromEvents(
    buckets.map((b) => b.key),
    flowEvents,
  );

  const today = Math.floor(o.now / DAY_S);
  const last = replayed[replayed.length - 1];
  const open = last.claim > DUST || (o.live?.claim ?? 0) > DUST;
  const firstDay = Math.floor(replayed[0].row.ts / DAY_S);
  const lastDay = Math.floor(last.row.ts / DAY_S);
  const endDay = open ? Math.max(today, lastDay + 1) : lastDay + 1;
  const liveRate = o.live?.rate != null && o.live.rate > 0 ? o.live.rate : null;
  const lastRate = rates.length > 0 ? rates[rates.length - 1][1] : null;

  // Now: the chain read where the page has one, else the last claim at the
  // live rate (held at the last row's rate without one).
  const nowClaim = open
    ? (o.live?.claim ?? (liveRate != null && lastRate != null ? (last.claim * liveRate) / lastRate : last.claim))
    : 0;

  // The claim's price each day: a grain a token at its last transaction's
  // rate, grown as the pool's rate runs to the day's close; today's meets the
  // chain read.
  const claimObs: [number, number][] = [];
  let ei = 0;
  for (let d = firstDay; d <= endDay; d++) {
    const end = Math.min((d + 1) * DAY_S, o.now);
    while (ei + 1 < replayed.length && replayed[ei + 1].row.ts <= end) ei++;
    const r = replayed[ei];
    if (r.row.ts > end) {
      claimObs.push([d, G]);
      continue;
    }
    if (d === today && open && ei === replayed.length - 1 && r.claim > DUST) {
      claimObs.push([d, (nowClaim / r.claim) * G]);
      continue;
    }
    const at = r.rate;
    const then = mapleRateAt(rates, end, o.now, liveRate);
    claimObs.push([d, at != null && at > 0 && then != null ? (then / at) * G : G]);
  }

  return {
    unit: { symbol: o.assetSymbol, scale },
    buckets,
    days,
    live: {
      collateralUsd: nowClaim * G,
      debtUsd: 0,
      assets:
        open && nowClaim > DUST
          ? [{ side: "collateral", symbol: o.assetSymbol, amount: nowClaim, usd: nowClaim * G }]
          : [],
    },
    todayPrices: { [CLAIM]: G },
    dailyPrices: { [CLAIM]: claimObs },
    seriesCarry: true,
    today: open ? today : endDay,
    totalEvents: replayed.length,
    labels: { collateral: "Pool claim", debt: "Debt" },
    words: mapleFlowWords(o.assetSymbol, o.poolSymbol),
  };
}

/** The panel's words for a Maple pool: everything in its funds asset. */
export function mapleFlowWords(assetSymbol: string, poolSymbol: string): NonNullable<FlowTimeline["words"]> {
  return {
    held: "Still in the pool",
    restBySide: { collateral: "Interest since the last event" },
    restNote: {
      collateral: `the rise in the pool's rate since the position's last event, on the ${poolSymbol} it held`,
    },
    basis: { collateral: `Every figure is in ${assetSymbol}, the pool's funds asset.` },
    heldBasis: {
      collateral: `the ${poolSymbol} held after the last event by then, at the pool's rate in a straight line from that event to the next (after the last, to its exit rate now).`,
    },
    linePrices: `in ${assetSymbol}, with the pool's rate in a straight line between the position's events`,
    moment: { face: ["collateral"], notes: [] },
  };
}

/** The rows as the event cards' sums read them (lib/shared/flow-focus.ts):
 *  each row's legs in the model's figures (the funds asset in grains) and in
 *  tokens, ascending. Each card states the claim once its transaction had
 *  run. */
export function mapleFocusEvents(rp: MapleFlowReplay, assetSymbol: string): FocusEvent[] {
  const { replayed, grain: G, rates } = rp;
  const byTx = new Map<string, MapleReplayed[]>();
  for (const r of replayed) {
    const list = byTx.get(r.row.tx);
    if (list) list.push(r);
    else byTx.set(r.row.tx, [r]);
  }
  return replayed.map((r) => {
    const tx = byTx.get(r.row.tx) ?? [r];
    let move = 0;
    for (const t of tx)
      for (const l of t.legs) {
        if (ACCRUAL_KEYS.has(l.bucket)) continue;
        move += (MAPLE_OUT_KEYS.has(l.bucket) ? -1 : 1) * l.amount;
      }
    const held = Math.max(0, r.claim);
    // The pool's rate from this event to the next, a year's growth in percent.
    const at = rates.findIndex(([ts]) => ts >= r.row.ts);
    const next = at >= 0 && at + 1 < rates.length ? rates[at + 1] : null;
    const rate =
      at >= 0 && next && next[0] > rates[at][0]
        ? ((next[1] / rates[at][1] - 1) / ((next[0] - rates[at][0]) / ONE_YEAR_S)) * 100
        : undefined;
    return {
      id: r.row.id,
      ts: r.row.ts,
      tx: r.row.tx,
      legs: r.legs.map((l) => ({
        bucket: l.bucket,
        usd: l.amount * G,
        amount: l.amount,
        symbol: assetSymbol,
        ...(ACCRUAL_KEYS.has(l.bucket) ? { accrual: true } : {}),
      })),
      sides: {
        collateral: {
          before: Math.max(0, held - move) * G,
          after: held * G,
          amount: move,
          symbol: assetSymbol,
          held,
        },
        debt: { before: 0, after: 0, amount: 0, symbol: assetSymbol, held: 0 },
      },
      ...(rate != null && Number.isFinite(rate) ? { rate } : {}),
    };
  });
}

/** Every pool's replay, in the catalog's order. */
export function maplePoolReplays(events: BaseActivityEvent[]): MapleFlowReplay[] {
  const byPool = mapleFlowRows(events);
  return [...byPool.entries()]
    .map(([pool, rows]) => mapleFlowReplay(pool, rows))
    .sort((a, b) => maplePoolOf(a.pool).symbol.localeCompare(maplePoolOf(b.pool).symbol));
}
