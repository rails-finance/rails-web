// Lifetime flows for an f(x) position (a leveraged xPosition in one of the
// f(x) pools): the page's rows replayed into the day rows the Lifetime flows
// panel reads (lib/shared/flows-timeline.ts; rails-ops
// reference/lifetime-flows-scrubber.md, "f(x)").
// ----------------------------------------------------------------------------
// Units. f(x) states collateral in the pool's normalized unit (stETH for the
// wstETH pool, WBTC for the WBTC pool) and debt in fxUSD, and the pool's oracle
// prices the normalized unit against fxUSD: the debt ratio is debt over
// collateral × that price. fxUSD is not pinned to a dollar (chain-truth
// charter), so the panel is drawn in fxUSD (`FlowTimeline.unit`), each
// collateral flow converted at the oracle price the pool applied to it.
//
// Balances. getPosition is read at every block that moved the position: the
// row's block (the route serves the read after the block's last row for the
// position, and the read at block − 1 on a liquidation) and, for the rows the
// route does not read (rebalances, redemptions, pool-wide liquidations, and
// the before of an operate), the page's /api/chain/fx/event-state reads at
// block − 1 and the block. So each block splits:
//
//     before(block) − after(previous block)   = what the pool moved with no
//                                               row: funding on the collateral
//                                               (out), other positions' bad
//                                               debt on the debt (in)
//     after(block) − before(block)            = the block's acts: an operate's
//                                               own move (its token amount ×
//                                               the wstETH→stETH rate at the
//                                               block), a liquidation's
//                                               seizure, repayment and unpaid
//                                               debt, a rebalance's or a
//                                               redemption's take
//
// What is left of an operate's block once its own move is taken out is the
// funding the pool booked at the start of its transaction (lib/fx/in-tx-funding.ts);
// a few base units either way (the pool's share rounding) stay inside the act.
//
// Prices. An operate or a liquidation is valued at the price its
// PositionSnapshot carried (the oracle price the pool applied to the row); a
// rebalance, a redemption or a pool-wide liquidation at the oracle's min leg
// at the block before it, the price it was judged and paid at. f(x) is not in
// the daily price store, so between events the collateral keeps its latest
// event's price, and today's is the live anchor price (the card's). Nothing is
// grown between events: the pool's funding and other positions' bad debt move
// the position with no row, and the next row states them.
//
// Pure: tested offline in scripts/verify/verify-fx-flows.ts.

import type { FlowBucket, FlowDayRow, FlowEvent, FlowTimeline } from "@/lib/shared/flows-timeline";
import { daysFromEvents, unitScaleFor } from "@/lib/shared/flows-timeline";
import type { FocusEvent } from "@/lib/shared/flow-focus";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isFxEvent } from "@/lib/shared/types/event-shape";
import type { FxStateAt } from "@/lib/sources/chain/fx-event-state";
import { fxCollMoved } from "@/lib/fx/in-tx-funding";

const DAY_S = 86_400;
const WAD = 1e18;

/** Bucket keys. */
export const FXF = {
  collIn: "fx-coll-in",
  collOut: "fx-coll-out",
  funding: "fx-funding",
  collRebalanced: "fx-coll-rebalanced",
  collRedeemed: "fx-coll-redeemed",
  collSeized: "fx-coll-seized",
  collPoolLiq: "fx-coll-pool-liq",
  borrowed: "fx-borrowed",
  badDebt: "fx-bad-debt",
  repaid: "fx-repaid",
  debtRebalanced: "fx-debt-rebalanced",
  debtRedeemed: "fx-debt-redeemed",
  debtLiquidated: "fx-debt-liquidated",
  unpaid: "fx-unpaid",
  debtPoolLiq: "fx-debt-pool-liq",
} as const;

export const FX_COLL_KEYS = new Set<string>([
  FXF.collIn,
  FXF.collOut,
  FXF.funding,
  FXF.collRebalanced,
  FXF.collRedeemed,
  FXF.collSeized,
  FXF.collPoolLiq,
]);
export const FX_OUT_KEYS = new Set<string>([
  FXF.collOut,
  FXF.funding,
  FXF.collRebalanced,
  FXF.collRedeemed,
  FXF.collSeized,
  FXF.collPoolLiq,
  FXF.repaid,
  FXF.debtRebalanced,
  FXF.debtRedeemed,
  FXF.debtLiquidated,
  FXF.unpaid,
  FXF.debtPoolLiq,
]);
/** The parts the pool moves with no row of the position's own: not the
 *  event's act. */
const ACCRUAL_KEYS = new Set<string>([FXF.funding, FXF.badDebt]);

/** Every bucket, in drawing order. Each side's in-lines, then its out-lines;
 *  each outflow's hatch differs from the side's others. */
const ALL_BUCKETS: FlowBucket[] = [
  { key: FXF.collIn, label: "Collateral deposited", event: "Deposit", side: "collateral", dir: "in" },
  { key: FXF.collOut, label: "Collateral withdrawn", event: "Withdraw", side: "collateral", dir: "out" },
  // The pool's funding charge: the collateral the pool takes between events
  // and at the start of the position's own transactions, dashed as the part
  // no event of the position's names.
  { key: FXF.funding, label: "Funding", event: "", side: "collateral", dir: "out", hatch: "dashes" },
  {
    key: FXF.collRebalanced,
    label: "Taken by rebalances",
    ledgerLabel: "Taken by rebalances",
    event: "Rebalance",
    side: "collateral",
    dir: "out",
    tone: "redemption",
    hatch: "forward",
    link: "fx-rebalance",
  },
  {
    key: FXF.collRedeemed,
    label: "Taken by redemptions",
    ledgerLabel: "Taken by redemptions",
    event: "Redemption",
    side: "collateral",
    dir: "out",
    tone: "redemption",
    hatch: "cross",
    link: "fx-redemption",
  },
  {
    key: FXF.collSeized,
    label: "Seized in liquidations",
    event: "Liquidation",
    side: "collateral",
    dir: "out",
    tone: "liquidation",
    hatch: "forward",
    link: "liquidation",
  },
  {
    key: FXF.collPoolLiq,
    label: "Taken by pool-wide liquidations",
    event: "Pool liquidation",
    side: "collateral",
    dir: "out",
    tone: "liquidation",
    hatch: "dots",
    link: "fx-pool-liquidation",
  },
  { key: FXF.borrowed, label: "Borrowed", event: "Borrow", side: "debt", dir: "in" },
  {
    key: FXF.badDebt,
    label: "Others' bad debt added",
    event: "",
    side: "debt",
    dir: "in",
    hatch: "dashes",
  },
  { key: FXF.repaid, label: "Repaid", event: "Repay", side: "debt", dir: "out" },
  {
    key: FXF.debtRebalanced,
    label: "Cleared by rebalances",
    ledgerLabel: "Cleared by rebalances",
    event: "Rebalance",
    side: "debt",
    dir: "out",
    tone: "redemption",
    hatch: "forward",
    link: "fx-rebalance",
  },
  {
    key: FXF.debtRedeemed,
    label: "Cleared by redemptions",
    ledgerLabel: "Cleared by redemptions",
    event: "Redemption",
    side: "debt",
    dir: "out",
    tone: "redemption",
    hatch: "cross",
    link: "fx-redemption",
  },
  {
    key: FXF.debtLiquidated,
    label: "Repaid by liquidators",
    event: "Liquidation",
    side: "debt",
    dir: "out",
    tone: "liquidation",
    hatch: "forward",
    link: "liquidation",
  },
  {
    key: FXF.unpaid,
    label: "Left unpaid at liquidation",
    event: "Liquidation",
    side: "debt",
    dir: "out",
    tone: "liquidation",
    hatch: "horizontal",
    link: "liquidation",
  },
  {
    key: FXF.debtPoolLiq,
    label: "Cleared by pool-wide liquidations",
    event: "Pool liquidation",
    side: "debt",
    dir: "out",
    tone: "liquidation",
    hatch: "dots",
    link: "fx-pool-liquidation",
  },
];

/** The buckets the replay fills, in drawing order: deposited and borrowed
 *  always, the rest where a leg fills them. */
export function fxFlowBuckets(filled: Set<string>): FlowBucket[] {
  return ALL_BUCKETS.filter((b) => b.key === FXF.collIn || b.key === FXF.borrowed || filled.has(b.key));
}

export type FxFlowKind = "operate" | "liquidation" | "poolLiquidation" | "rebalance" | "redemption";

/** One row of an f(x) position that moves its balances, in human units. */
export interface FxFlowRow {
  id: string;
  /** Unix seconds. */
  ts: number;
  block: number;
  tx?: string;
  kind: FxFlowKind;
  /** An operate's collateral move in the pool's token (wstETH / WBTC), signed,
   *  as the position gained or lost it (fxCollMoved). */
  collMoved: number;
  /** An operate's debt move, fxUSD, signed. */
  debtDelta: number;
  /** A liquidation's repaid legs (fxUSD and stable), and the token it sent the
   *  liquidator. */
  liqRepaid: number;
  liqColls: number;
  /** getPosition after the block, where the route served it on this row
   *  (normalized collateral, fxUSD debt). */
  collAfter: number | null;
  debtAfter: number | null;
  /** getPosition at block − 1, served on a block's first liquidation. */
  collBefore: number | null;
  debtBefore: number | null;
  /** The PositionSnapshot's oracle price (fxUSD per normalized unit), on the
   *  position's own rows. */
  price: number | null;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** The page's rows that move the position, in the page's order (an ownership
 *  handover moves nothing and is not a flow). */
export function fxFlowRows(events: BaseActivityEvent[]): FxFlowRow[] {
  const out: FxFlowRow[] = [];
  for (const e of events.filter(isFxEvent)) {
    const d = e.context.data;
    if (d.eventType === "transfer") continue;
    const kind: FxFlowKind =
      d.eventType === "operate"
        ? "operate"
        : d.eventType === "liquidation"
          ? d.poolWide
            ? "poolLiquidation"
            : "liquidation"
          : d.redemption
            ? "redemption"
            : "rebalance";
    const own = kind === "operate" || kind === "liquidation";
    const price = own ? num(d.oraclePrice) : null;
    out.push({
      id: e.id,
      ts: e.timestamp,
      block: e.blockNumber,
      tx: e.txHash || undefined,
      kind,
      collMoved: kind === "operate" ? fxCollMoved(d) : 0,
      debtDelta: kind === "operate" ? (num(d.debtDelta) ?? 0) : 0,
      liqRepaid: kind === "liquidation" ? (num(d.liqFxusdDebts) ?? 0) + (num(d.liqStableDebts) ?? 0) : 0,
      liqColls: kind === "liquidation" ? (num(d.liqColls) ?? 0) : 0,
      collAfter: own ? num(d.collAfter) : null,
      debtAfter: own ? num(d.debtAfter) : null,
      // The before is the route's read at block − 1 only where it served the
      // collateral's too (a block's first liquidation); an operate's debt
      // before is derived from its delta and is not a read.
      collBefore: kind === "liquidation" ? num(d.collBefore) : null,
      debtBefore: kind === "liquidation" && d.collBefore != null ? num(d.debtBefore) : null,
      price: price != null && price > 0 ? price : null,
    });
  }
  // Ascending by block; a block's rows keep the page's order.
  return out
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.block - b.r.block || a.i - b.i)
    .map((x) => x.r);
}

/** The blocks the replay needs read (getPosition at block − 1 and the block):
 *  `own`, operate blocks and liquidation blocks the route served no before
 *  for; `social`, the rebalance, redemption and pool-wide liquidation blocks
 *  (read with the oracle's legs). */
export function fxFlowReadBlocks(rows: FxFlowRow[]): { own: number[]; social: number[] } {
  const own = new Set<number>();
  const social = new Set<number>();
  const byBlock = groupByBlock(rows);
  for (const [block, g] of byBlock) {
    if (g.some((r) => r.kind === "operate")) own.add(block);
    else if (g.some((r) => r.kind === "liquidation") && !g.some((r) => r.collBefore != null)) own.add(block);
    if (g.some((r) => r.kind === "rebalance" || r.kind === "redemption" || r.kind === "poolLiquidation"))
      social.add(block);
  }
  const asc = (s: Set<number>) => [...s].sort((a, b) => a - b);
  return { own: asc(own), social: asc(social) };
}

function groupByBlock(rows: FxFlowRow[]): Map<number, FxFlowRow[]> {
  const m = new Map<number, FxFlowRow[]>();
  for (const r of rows) {
    const g = m.get(r.block);
    if (g) g.push(r);
    else m.set(r.block, [r]);
  }
  return m;
}

/** Where a row's collateral price came from: its PositionSnapshot, the
 *  min leg read at the block before it, the nearest priced row, or today's
 *  live read. */
export type FxPriceFrom = "row" | "block" | "nearest" | "today";

export interface FxReplayed {
  row: FxFlowRow;
  /** The row's legs: collateral in the normalized unit, debt in fxUSD, each
   *  positive. */
  legs: { bucket: string; amount: number }[];
  /** Balances after the row. */
  coll: number;
  debt: number;
  /** fxUSD per normalized unit, and where it came from. */
  price: number;
  priceFrom: FxPriceFrom;
  /** A debt fall between two of the position's rows with no row of its own:
   *  booked to Cleared by rebalances (the only act that lowers it). */
  unrecorded?: boolean;
}

export type FxReplayResult =
  | { ok: true; replayed: FxReplayed[] }
  /** A read the replay needs did not land. */
  | { ok: false; reason: "reads"; blocks: number[] }
  /** A block moved a balance the way none of its rows can (collateral up on a
   *  rebalance or liquidation block): the replay states no lifetime. */
  | { ok: false; reason: "mismatch"; blocks: number[] };

/** How far a residual may sit from zero and still be the pool's rounding. */
const tol = (scale: number) => Math.max(1e-12, Math.abs(scale) * 1e-9);

/** The per-row replay. `normalizes`: the pool's token is not its normalized
 *  unit (wstETH → stETH at the block's rate); `livePrice` is the nearest price
 *  for rows nearer today than any priced row. */
export function replayFx(
  rows: FxFlowRow[],
  reads: Record<string, FxStateAt>,
  o: { normalizes: boolean; livePrice: number | null; now: number },
): FxReplayResult {
  const missing: number[] = [];
  const mismatch: number[] = [];
  const at = (b: number) => reads[String(b)];
  const colls = (s: FxStateAt | undefined) => (s?.colls != null ? Number(s.colls) / WAD : null);
  const debts = (s: FxStateAt | undefined) => (s?.debts != null ? Number(s.debts) / WAD : null);
  const out: FxReplayed[] = [];
  let prevC = 0;
  let prevD = 0;
  for (const [block, g] of groupByBlock(rows)) {
    const ops = g.filter((r) => r.kind === "operate");
    const liqs = g.filter((r) => r.kind === "liquidation");
    const social = g.filter((r) => r.kind !== "operate" && r.kind !== "liquidation");
    const servedBefore = liqs.find((r) => r.collBefore != null && r.debtBefore != null);
    const servedAfter = [...g].reverse().find((r) => r.collAfter != null && r.debtAfter != null);
    const Cb = servedBefore?.collBefore ?? colls(at(block - 1));
    const Db = servedBefore?.debtBefore ?? debts(at(block - 1));
    const Ca = servedAfter?.collAfter ?? colls(at(block));
    const Da = servedAfter?.debtAfter ?? debts(at(block));
    const rateRaw = at(block)?.rate ?? at(block - 1)?.rate ?? null;
    const rate = o.normalizes ? (rateRaw != null ? Number(rateRaw) / WAD : null) : 1;
    if (Cb == null || Db == null || Ca == null || Da == null || (ops.length > 0 && rate == null)) {
      missing.push(block);
      continue;
    }
    const legs = new Map<string, { bucket: string; amount: number }[]>(g.map((r) => [r.id, []]));
    const add = (r: FxFlowRow, bucket: string, amount: number) => {
      if (amount !== 0) legs.get(r.id)!.push({ bucket, amount });
    };
    const first = g[0];
    const tC = tol(Math.max(prevC, Cb, Ca));
    const tD = tol(Math.max(prevD, Db, Da));

    // What the pool moved since the last block, with no row: funding takes
    // collateral, other positions' bad debt adds debt. A move the other way
    // within rounding stays with the block's acts.
    const gC = Cb - prevC;
    const gD = Db - prevD;
    let carryC = 0;
    let carryD = 0;
    let unrecorded = false;
    if (gC < -tC) add(first, FXF.funding, -gC);
    else carryC = gC;
    if (gD > tD) add(first, FXF.badDebt, gD);
    else if (gD < -tD) {
      // A debt fall with no row: only a rebalance, a redemption or a
      // liquidation lowers it, and the route attributed none here.
      add(first, FXF.debtRebalanced, -gD);
      unrecorded = true;
    } else carryD = gD;

    // The block's acts.
    let actC = 0;
    let actD = 0;
    for (const r of ops) {
      const c = r.collMoved * (rate as number);
      if (c > 0) add(r, FXF.collIn, c);
      else if (c < 0) add(r, FXF.collOut, -c);
      if (r.debtDelta > 0) add(r, FXF.borrowed, r.debtDelta);
      else if (r.debtDelta < 0) add(r, FXF.repaid, -r.debtDelta);
      actC += c;
      actD += r.debtDelta;
    }
    let repaid = 0;
    for (const r of liqs) {
      add(r, FXF.debtLiquidated, r.liqRepaid);
      repaid += r.liqRepaid;
    }
    // What the acts leave unexplained: positive raises the side.
    const restC = Ca - Cb - actC + carryC;
    const restD = Da - Db - actD + repaid + carryD;
    const lastLiq = liqs[liqs.length - 1];
    const lead = social[social.length - 1];
    const socialKind = social.some((r) => r.kind === "poolLiquidation")
      ? "poolLiquidation"
      : social.some((r) => r.kind === "rebalance")
        ? "rebalance"
        : "redemption";
    const takeC = { poolLiquidation: FXF.collPoolLiq, rebalance: FXF.collRebalanced, redemption: FXF.collRedeemed };
    const takeD = { poolLiquidation: FXF.debtPoolLiq, rebalance: FXF.debtRebalanced, redemption: FXF.debtRedeemed };

    // Collateral.
    if (restC < -tC) {
      const taken = -restC;
      if (liqs.length > 0) {
        // Split across the block's liquidations by what each sent the
        // liquidator; the last takes the remainder.
        const sent = liqs.reduce((a, r) => a + r.liqColls, 0);
        let left = taken;
        liqs.forEach((r, i) => {
          const part = i === liqs.length - 1 ? left : sent > 0 ? (taken * r.liqColls) / sent : 0;
          add(r, FXF.collSeized, part);
          left -= part;
        });
      } else if (lead) add(lead, takeC[socialKind], taken);
      // An operate's block: funding booked at the start of its transaction.
      else add(ops[0], FXF.funding, taken);
    } else if (restC > tC) {
      // Collateral rose past what the block's deposits explain.
      if (ops.length > 0) settleResidual(legs, ops, restC, true);
      else mismatch.push(block);
    } else if (restC !== 0) settleResidual(legs, g, restC, true);

    // Debt.
    if (restD < -tD) {
      const cleared = -restD;
      if (liqs.length > 0) add(lastLiq, FXF.unpaid, cleared);
      else if (lead) add(lead, takeD[socialKind], cleared);
      else settleResidual(legs, ops, restD, false);
    } else if (restD > tD) add(first, FXF.badDebt, restD);
    else if (restD !== 0) settleResidual(legs, g, restD, false);

    // Each row's balances: the running sum, the block's last row the read.
    let c = prevC;
    let d = prevD;
    g.forEach((r, i) => {
      const ls = mergeLegs(legs.get(r.id)!);
      for (const l of ls) {
        const s = FX_OUT_KEYS.has(l.bucket) ? -1 : 1;
        if (FX_COLL_KEYS.has(l.bucket)) c += s * l.amount;
        else d += s * l.amount;
      }
      if (i === g.length - 1) {
        c = Ca;
        d = Da;
      }
      out.push({
        row: r,
        legs: ls,
        coll: c,
        debt: d,
        price: 0,
        priceFrom: "row",
        ...(unrecorded && i === 0 ? { unrecorded: true } : {}),
      });
    });
    // A row's own price; a pool-moved row's the min leg it was judged at.
    for (let i = out.length - g.length; i < out.length; i++) {
      const r = out[i].row;
      const own = r.price;
      const judged = num(at(block - 1)?.minPrice) ?? num(at(block)?.anchorPrice);
      if (own != null) out[i].price = own;
      else if (judged != null && judged > 0) {
        out[i].price = judged / WAD;
        out[i].priceFrom = "block";
      } else out[i].price = NaN;
    }
    prevC = Ca;
    prevD = Da;
  }
  if (missing.length > 0) return { ok: false, reason: "reads", blocks: missing };
  if (mismatch.length > 0) return { ok: false, reason: "mismatch", blocks: mismatch };
  // Rows with no price take the nearest priced moment.
  const priced = out.filter((r) => Number.isFinite(r.price) && r.price > 0);
  for (const r of out) {
    if (Number.isFinite(r.price) && r.price > 0) continue;
    let best: { dt: number; price: number; from: FxPriceFrom } | null = null;
    for (const p of priced) {
      const dt = Math.abs(p.row.ts - r.row.ts);
      if (!best || dt < best.dt) best = { dt, price: p.price, from: "nearest" };
    }
    if (o.livePrice != null && o.livePrice > 0) {
      const dt = Math.abs(o.now - r.row.ts);
      if (!best || dt < best.dt) best = { dt, price: o.livePrice, from: "today" };
    }
    r.price = best?.price ?? 0;
    r.priceFrom = best?.from ?? "nearest";
  }
  return { ok: true, replayed: out };
}

/** A residual within rounding goes into the largest leg on its side among
 *  `rows` (an in-leg grows by a positive one, an out-leg shrinks); with no
 *  leg on that side it is dropped, and the block's last row still states the
 *  read. */
function settleResidual(
  legs: Map<string, { bucket: string; amount: number }[]>,
  rows: FxFlowRow[],
  r: number,
  coll: boolean,
): void {
  let best: { bucket: string; amount: number } | null = null;
  for (const row of rows)
    for (const l of legs.get(row.id) ?? []) {
      if (FX_COLL_KEYS.has(l.bucket) !== coll) continue;
      if (!best || l.amount > best.amount) best = l;
    }
  if (!best) return;
  const next = best.amount + (FX_OUT_KEYS.has(best.bucket) ? -r : r);
  if (next > 0) best.amount = next;
}

function mergeLegs(ls: { bucket: string; amount: number }[]): { bucket: string; amount: number }[] {
  const out: { bucket: string; amount: number }[] = [];
  for (const l of ls) {
    if (!(l.amount > 0)) continue;
    const m = out.find((x) => x.bucket === l.bucket);
    if (m) m.amount += l.amount;
    else out.push({ ...l });
  }
  return out;
}

/** What the page states now, where it has it. */
export interface FxLive {
  /** The oracle's anchor price now (fxUSD per normalized unit), the card's. */
  price: number | null;
  /** The pool's settled read (getPosition at the sweep's head block). */
  coll?: number | null;
  debt?: number | null;
}

export interface FxFlowOptions {
  /** The normalized unit ("stETH", "WBTC"). */
  collSymbol: string;
  /** Unix seconds now; the page's clock. */
  now: number;
  /** The position is open (the page's verdict). */
  open: boolean;
  live: FxLive | null;
}

export interface FxFlowReplay {
  replayed: FxReplayed[];
  /** Whether the position ever owed. */
  borrower: boolean;
  grain: number;
  scale: number;
}

export function fxFlowReplay(replayed: FxReplayed[]): FxFlowReplay {
  const borrower = replayed.some((r) => r.debt > 0 || r.legs.some((l) => l.bucket === FXF.borrowed));
  let peak = 0;
  let inColl = 0;
  let inDebt = 0;
  for (const r of replayed) {
    for (const l of r.legs) {
      if (FX_OUT_KEYS.has(l.bucket)) continue;
      if (FX_COLL_KEYS.has(l.bucket)) inColl += l.amount * r.price;
      else inDebt += l.amount;
    }
    peak = Math.max(peak, inColl, inDebt, r.coll * r.price, r.debt);
  }
  const scale = unitScaleFor(peak);
  return { replayed, borrower, grain: 10 ** scale, scale };
}

const COLL = "coll";
const DEBT = "debt";
const DEBT_SYMBOL = "fxUSD";

/** The position's rows as the Lifetime flows panel's timeline, in fxUSD. Null
 *  with no rows, or where no row and no live read prices the collateral. */
export function fxFlowTimeline(rp: FxFlowReplay, o: FxFlowOptions): FlowTimeline | null {
  const { replayed, grain: G, scale } = rp;
  if (replayed.length === 0) return null;
  if (!replayed.some((r) => r.price > 0)) return null;
  const cp = (r: FxReplayed) => r.price * G;
  const filled = new Set(replayed.flatMap((r) => r.legs.map((l) => l.bucket)));
  const buckets = fxFlowBuckets(filled);
  const flowEvents: FlowEvent[] = replayed.map((r) => {
    const moved = { coll: false, debt: false };
    for (const l of r.legs) {
      if (ACCRUAL_KEYS.has(l.bucket)) continue;
      if (FX_COLL_KEYS.has(l.bucket)) moved.coll = true;
      else moved.debt = true;
    }
    const k = r.row.kind;
    return {
      id: r.row.id,
      ts: r.row.ts,
      block: r.row.block,
      tick:
        k === "liquidation" || k === "poolLiquidation"
          ? "liquidation"
          : k === "redemption"
            ? "redemption"
            : k === "rebalance"
              ? "caution"
              : moved.coll && moved.debt
                ? "both"
                : moved.debt
                  ? "debt"
                  : "collateral",
      legs: r.legs.map((l) =>
        FX_COLL_KEYS.has(l.bucket)
          ? { bucket: l.bucket, usd: l.amount * cp(r), symbol: o.collSymbol }
          : { bucket: l.bucket, usd: l.amount * G, symbol: DEBT_SYMBOL },
      ),
      tx: r.row.tx,
      countsTx: k === "operate",
      balances: [
        { asset: COLL, symbol: o.collSymbol, side: "collateral", amount: Math.max(0, r.coll) },
        { asset: DEBT, symbol: DEBT_SYMBOL, side: "debt", amount: Math.max(0, r.debt) },
      ],
      // Every row states the price its collateral flows were valued at, so a
      // card and the bars agree on its day.
      prices: [
        { asset: COLL, usd: cp(r) },
        { asset: DEBT, usd: G },
      ],
    };
  });
  const days: FlowDayRow[] = daysFromEvents(
    buckets.map((b) => b.key),
    flowEvents,
  );

  const today = Math.floor(o.now / DAY_S);
  const last = replayed[replayed.length - 1];
  const open = o.open && (last.coll > 0 || last.debt > 0);
  const livePrice = o.live?.price != null && o.live.price > 0 ? o.live.price : null;
  const endDay = open ? Math.max(today, Math.floor(last.row.ts / DAY_S) + 1) : Math.floor(last.row.ts / DAY_S) + 1;
  // Now: the pool's settled read where the page has one, else the last row's.
  const nowColl = open ? (o.live?.coll ?? last.coll) : 0;
  const nowDebt = open ? (o.live?.debt ?? last.debt) : 0;
  const priceNow = (livePrice ?? last.price) * G;

  // The collateral's price: each event day the price its flows took, carried
  // over the days between, and today's.
  const collObs = new Map<number, number>();
  for (const r of replayed) collObs.set(Math.floor(r.row.ts / DAY_S), cp(r));
  if (livePrice != null && open) collObs.set(today, livePrice * G);
  const firstDay = Math.floor(replayed[0].row.ts / DAY_S);
  const unitObs: [number, number][] = [];
  for (let d = firstDay; d <= endDay; d++) unitObs.push([d, G]);

  const assets: NonNullable<FlowTimeline["live"]["assets"]> = [];
  if (open) {
    if (nowColl > 0)
      assets.push({ side: "collateral", symbol: o.collSymbol, amount: nowColl, usd: nowColl * priceNow });
    if (nowDebt > 0) assets.push({ side: "debt", symbol: DEBT_SYMBOL, amount: nowDebt, usd: nowDebt * G });
  }
  return {
    unit: { symbol: DEBT_SYMBOL, scale },
    buckets,
    days,
    live: {
      collateralUsd: open ? nowColl * priceNow : 0,
      debtUsd: open ? nowDebt * G : 0,
      assets,
    },
    todayPrices: { [COLL]: priceNow, [DEBT]: G },
    dailyPrices: { [COLL]: [...collObs].sort((a, b) => a[0] - b[0]), [DEBT]: unitObs },
    seriesCarry: true,
    today: open ? today : endDay,
    labels: { collateral: "Collateral", debt: "Debt" },
    words: fxFlowWords(o.collSymbol),
  };
}

/** The panel's words for an f(x) position. */
export function fxFlowWords(collSymbol: string): NonNullable<FlowTimeline["words"]> {
  return {
    held: "Still deposited",
    restBySide: {
      collateral: "Market move and funding since the last event",
      debt: "Moved by the pool since the last event",
    },
    restNote: {
      collateral: `the change in ${collSymbol}'s oracle price, in fxUSD, since each flow, and the funding the pool took since the position's last event`,
      debt: "what the pool moved on the debt since the position's last event: other positions' bad debt added, or a rebalance not yet on the timeline",
    },
    basis: {
      collateral: `Every figure is in fxUSD, the pool's debt token; each ${collSymbol} flow is converted at the pool oracle's price the flow was made at.`,
      debt: "Every figure is in fxUSD, the pool's debt token.",
    },
    heldBasis: {
      collateral: `the ${collSymbol} the last event left, at the pool oracle's price of that event, in fxUSD; today, the pool's reading at the anchor price.`,
      debt: "the fxUSD the last event left; today, the pool's reading.",
    },
    linePrices: `in fxUSD, with the collateral at the pool oracle's price of its latest event and each balance as its last event left it`,
    moment: {
      notes: [
        "f(x) moves a position with no row of its own between events: funding takes collateral and other positions' bad debt adds debt. Each balance here is as the last event left it, and the next event states what the pool moved.",
      ],
    },
  };
}

/** The rows as the event cards' sums read them (lib/shared/flow-focus.ts):
 *  each row's legs in the model's figures (fxUSD in grains) and in tokens,
 *  the legs the day rows add up. Each side's figure just before and once the
 *  row's transaction had run is the transaction's last row's balance at that
 *  row's price, less the transaction's acts. */
export function fxFocusEvents(rp: FxFlowReplay, collSymbol: string): FocusEvent[] {
  const { replayed, grain: G } = rp;
  const cp = (r: FxReplayed) => r.price * G;
  const byTx = new Map<string, FxReplayed[]>();
  for (const r of replayed) {
    const k = r.row.tx ?? r.row.id;
    const list = byTx.get(k);
    if (list) list.push(r);
    else byTx.set(k, [r]);
  }
  return replayed.map((r) => {
    const tx = byTx.get(r.row.tx ?? r.row.id) ?? [r];
    const lastOf = tx[tx.length - 1];
    let collMove = 0;
    let debtMove = 0;
    for (const t of tx)
      for (const l of t.legs) {
        if (ACCRUAL_KEYS.has(l.bucket)) continue;
        const sign = FX_OUT_KEYS.has(l.bucket) ? -1 : 1;
        if (FX_COLL_KEYS.has(l.bucket)) collMove += sign * l.amount;
        else debtMove += sign * l.amount;
      }
    const collHeld = Math.max(0, lastOf.coll);
    const debtHeld = Math.max(0, lastOf.debt);
    const collPrice = cp(lastOf);
    return {
      id: r.row.id,
      ts: r.row.ts,
      ...(r.row.tx ? { tx: r.row.tx } : {}),
      legs: r.legs.map((l) =>
        FX_COLL_KEYS.has(l.bucket)
          ? {
              bucket: l.bucket,
              usd: l.amount * cp(r),
              amount: l.amount,
              symbol: collSymbol,
              ...(ACCRUAL_KEYS.has(l.bucket) ? { accrual: true } : {}),
            }
          : {
              bucket: l.bucket,
              usd: l.amount * G,
              amount: l.amount,
              symbol: DEBT_SYMBOL,
              ...(ACCRUAL_KEYS.has(l.bucket) ? { accrual: true } : {}),
            },
      ),
      sides: {
        collateral: {
          before: Math.max(0, collHeld - collMove) * collPrice,
          after: collHeld * collPrice,
          amount: collMove,
          symbol: collSymbol,
          held: collHeld,
        },
        debt: {
          before: Math.max(0, debtHeld - debtMove) * G,
          after: debtHeld * G,
          amount: debtMove,
          symbol: DEBT_SYMBOL,
          held: debtHeld,
        },
      },
    };
  });
}

/** How the collateral flows were priced: at their row, at the block's
 *  min leg (a pool-moved row), at the nearest priced row, or today's. */
export function fxPricing(rp: FxFlowReplay): Record<FxPriceFrom, number> {
  const out: Record<FxPriceFrom, number> = { row: 0, block: 0, nearest: 0, today: 0 };
  for (const r of rp.replayed) {
    if (!r.legs.some((l) => FX_COLL_KEYS.has(l.bucket))) continue;
    out[r.priceFrom]++;
  }
  return out;
}
