// Lifetime flows for a Polaris CDP (Sepolia testnet): the CDP's CDPUpdated
// rows replayed into the day rows the Lifetime flows panel reads
// (lib/shared/flows-timeline.ts; rails-ops reference/lifetime-flows-scrubber.md,
// "Polaris").
// ----------------------------------------------------------------------------
// Units. A testnet token has no market price, so the panel is drawn in the
// market's stablecoin (USDp or GOLDp, `FlowTimeline.unit`): the debt at its
// face, and each pETH flow converted at the market's own price feed at the
// row's block (`priceAtBlock.pethInDebt`, the oracle-at-block lane), the price
// the protocol holds the debt against.
//
// Legs. Every CDPUpdated states the resulting collateral and debt and every
// leg that produced them, and the identity is exact (rails-ops
// TO-DO-polaris-scoping.md §4.2):
//
//     newColl = collBefore + collChange + mintRedeemCollGain + bcTokenGain
//     newDebt = debtBefore + debtChange + accruedInterest + mintRedeemDebtGain
//               − stableGain + stablesMintedToEnsureZeroDebt
//
// so each leg is a line of its own and the replay meets every row's balances.
// The holder's act is `collChange` / `debtChange` (a liquidation's are the
// seizure and the debt cleared); the rest built up since the CDP's last touch
// and is written in at this one: interest, stability gains, reward pETH, the
// PSM's net shares, and the stables minted to settle a debt the shares took
// below zero.
//
// Between rows. Interest accrues on the recorded debt at the market's rate
// (primary + secondary, the secondary on no row), so the debt grows between
// two rows by the next row's interest, in a straight line over the time
// between them; after the last row, by the interest the live read states
// pending. The PSM's shares, stability gains and reward pETH also build up
// between touches, but nothing states them until the next row, so they step
// on that row's day. Polaris is not in the daily price store: between events
// the collateral keeps its latest event's price, and today's is the feed's
// live price (the card's).
//
// Pure: tested offline in scripts/verify/verify-polaris-flows.ts.

import type { FlowBucket, FlowDayRow, FlowEvent, FlowTimeline } from "@/lib/shared/flows-timeline";
import { daysFromEvents, unitScaleFor } from "@/lib/shared/flows-timeline";
import type { FocusEvent } from "@/lib/shared/flow-focus";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isPolarisEvent } from "@/lib/shared/types/event-shape";
import type { PolarisChainResponse } from "@/lib/api/fetch-polaris-position";

const DAY_S = 86_400;
const ONE_YEAR_S = 31_557_600;
const WAD = BigInt("1000000000000000000");
const ZERO = BigInt(0);

/** Bucket keys. */
export const PF = {
  deposited: "pl-deposited",
  reward: "pl-reward",
  psmCollIn: "pl-psm-coll-in",
  withdrawn: "pl-withdrawn",
  psmCollOut: "pl-psm-coll-out",
  collLiquidated: "pl-coll-liquidated",
  surplus: "pl-surplus",
  borrowed: "pl-borrowed",
  interest: "pl-interest",
  psmDebtIn: "pl-psm-debt-in",
  settled: "pl-settled",
  repaid: "pl-repaid",
  stability: "pl-stability",
  psmDebtOut: "pl-psm-debt-out",
  debtLiquidated: "pl-debt-liquidated",
} as const;

export const PL_COLL_KEYS = new Set<string>([
  PF.deposited,
  PF.reward,
  PF.psmCollIn,
  PF.withdrawn,
  PF.psmCollOut,
  PF.collLiquidated,
  PF.surplus,
]);
export const PL_OUT_KEYS = new Set<string>([
  PF.withdrawn,
  PF.psmCollOut,
  PF.collLiquidated,
  PF.surplus,
  PF.repaid,
  PF.stability,
  PF.psmDebtOut,
  PF.debtLiquidated,
]);
/** The legs that built up since the CDP's last touch and were written in at
 *  this one: not the event's act. */
export const PL_ACCRUAL_KEYS = new Set<string>([
  PF.reward,
  PF.psmCollIn,
  PF.psmCollOut,
  PF.interest,
  PF.psmDebtIn,
  PF.settled,
  PF.stability,
  PF.psmDebtOut,
]);

/** Every bucket, in drawing order: each side's in-lines, then its out-lines.
 *  No two lines of a side share a fill. */
const ALL_BUCKETS: FlowBucket[] = [
  { key: PF.deposited, label: "Deposited", event: "Deposit", side: "collateral", dir: "in" },
  // pETH yield to minters, paid by the debt: the collateral's earned part.
  { key: PF.reward, label: "Reward pETH", event: "", side: "collateral", dir: "in", hatch: "dashes" },
  {
    key: PF.psmCollIn,
    label: "Net PSM shares added",
    event: "",
    side: "collateral",
    dir: "in",
    hatch: "checker",
    link: "polaris-psm-added",
  },
  { key: PF.withdrawn, label: "Withdrawn", event: "Withdraw", side: "collateral", dir: "out" },
  {
    key: PF.psmCollOut,
    label: "Net PSM shares taken",
    ledgerLabel: "Net PSM shares taken",
    event: "",
    side: "collateral",
    dir: "out",
    tone: "redemption",
    hatch: "cross",
    link: "polaris-psm-taken",
  },
  {
    key: PF.collLiquidated,
    label: "Liquidated",
    event: "Liquidation",
    side: "collateral",
    dir: "out",
    tone: "liquidation",
    hatch: "forward",
    link: "liquidation",
  },
  { key: PF.surplus, label: "Surplus to claim", event: "Liquidation", side: "collateral", dir: "out", hatch: "dots" },
  { key: PF.borrowed, label: "Borrowed", event: "Borrow", side: "debt", dir: "in" },
  { key: PF.interest, label: "Interest", event: "", side: "debt", dir: "in", hatch: "dashes" },
  {
    key: PF.psmDebtIn,
    label: "Net PSM shares added",
    event: "",
    side: "debt",
    dir: "in",
    hatch: "checker",
    link: "polaris-psm-added",
  },
  { key: PF.settled, label: "Settled to zero", event: "", side: "debt", dir: "in", hatch: "grid" },
  { key: PF.repaid, label: "Repaid", event: "Repay", side: "debt", dir: "out" },
  // Vertical lines, as Frankencoin's Reserve share returned: the debt's
  // dashes are Interest's.
  { key: PF.stability, label: "Stability gains", event: "", side: "debt", dir: "out", hatch: "vertical" },
  {
    key: PF.psmDebtOut,
    label: "Net PSM shares cleared",
    ledgerLabel: "Net PSM shares cleared",
    event: "",
    side: "debt",
    dir: "out",
    tone: "redemption",
    hatch: "cross",
    link: "polaris-psm-taken",
  },
  {
    key: PF.debtLiquidated,
    label: "Liquidated",
    event: "Liquidation",
    side: "debt",
    dir: "out",
    tone: "liquidation",
    hatch: "forward",
    link: "liquidation",
  },
];

/** The buckets a CDP fills, in drawing order: deposited and borrowed always,
 *  the rest where a leg or a pending leg fills them. */
export function polarisFlowBuckets(filled: Set<string>): FlowBucket[] {
  return ALL_BUCKETS.filter((b) => b.key === PF.deposited || b.key === PF.borrowed || filled.has(b.key));
}

/** One CDPUpdated row, its legs in wei. */
export interface PolarisFlowRow {
  id: string;
  /** Unix seconds. */
  ts: number;
  block: number;
  logIndex: number;
  tx?: string;
  kind: "owner" | "liquidation";
  collChange: bigint;
  debtChange: bigint;
  mintRedeemCollGain: bigint;
  mintRedeemDebtGain: bigint;
  accruedInterest: bigint;
  stableGain: bigint;
  settled: bigint;
  bcTokenGain: bigint;
  collBefore: bigint;
  debtBefore: bigint;
  newColl: bigint;
  newDebt: bigint;
  /** A liquidation's collateral left for the owner to claim. */
  surplus: bigint;
  /** pETH in the market's stablecoin at the row's block, where the lane
   *  priced it. */
  price: number | null;
}

/** A wei integer string, else the 18dp decimal string, as a bigint. */
function wei(raw: string | undefined, human: string | undefined): bigint {
  if (raw != null && /^-?\d+$/.test(raw)) return BigInt(raw);
  if (human == null || human === "") return ZERO;
  const neg = human.startsWith("-");
  const [i, f = ""] = (neg ? human.slice(1) : human).split(".");
  const v = BigInt(i || "0") * WAD + BigInt((f + "0".repeat(18)).slice(0, 18) || "0");
  return neg ? -v : v;
}

/** Wei as token units. */
export const units = (v: bigint): number => Number(v) / 1e18;

function logIndexOf(id: string): number {
  const n = Number(id.split(/[:_]/).pop());
  return Number.isFinite(n) ? n : 0;
}

/** The CDP's rows that move it, ascending (a custody transfer moves nothing
 *  and is not a flow). */
export function polarisFlowRows(events: BaseActivityEvent[]): PolarisFlowRow[] {
  const out: PolarisFlowRow[] = [];
  for (const e of events) {
    if (!isPolarisEvent(e)) continue;
    const c = e.context.data;
    if (c.eventType === "transfer" || c.newColl == null || c.newDebt == null) continue;
    const r = c.raw ?? {};
    const price = c.priceAtBlock?.pethInDebt;
    out.push({
      id: e.id,
      ts: e.timestamp,
      block: e.blockNumber,
      logIndex: logIndexOf(e.id),
      tx: e.txHash || undefined,
      kind: c.eventType === "liquidate" ? "liquidation" : "owner",
      collChange: wei(r.collChange, c.collChange),
      debtChange: wei(r.debtChange, c.debtChange),
      mintRedeemCollGain: wei(r.mintRedeemCollGain, c.mintRedeemCollGain),
      mintRedeemDebtGain: wei(r.mintRedeemDebtGain, c.mintRedeemDebtGain),
      accruedInterest: wei(r.accruedInterest, c.accruedInterest),
      stableGain: wei(r.stableGain, c.stableGain),
      settled: wei(r.stablesMintedToEnsureZeroDebt, c.stablesMintedToEnsureZeroDebt),
      bcTokenGain: wei(r.bcTokenGain, c.bcTokenGain),
      collBefore: wei(r.collBefore, c.collBefore),
      debtBefore: wei(r.debtBefore, c.debtBefore),
      newColl: wei(r.newColl, c.newColl),
      newDebt: wei(r.newDebt, c.newDebt),
      surplus: c.eventType === "liquidate" ? wei(r.collSurplus, c.collSurplus) : ZERO,
      price: price != null && price > 0 ? price : null,
    });
  }
  return out.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);
}

/** Where a row's collateral price came from: its block's feed, the nearest
 *  priced row, or today's live read. */
export type PolarisPriceFrom = "row" | "nearest" | "today";

export interface PolarisReplayed {
  row: PolarisFlowRow;
  /** The row's legs, each positive: collateral in pETH, debt in the
   *  stablecoin. */
  legs: { bucket: string; amount: number }[];
  /** Balances after the row (the row's own `_newColl` / `_newDebt`). */
  coll: number;
  debt: number;
  /** pETH in the stablecoin, and where it came from. */
  price: number;
  priceFrom: PolarisPriceFrom;
  /** The yearly rate the debt grows at from this row to the next (the next
   *  row's interest over this row's debt and the time between), as a
   *  fraction; after the last row, the live read's. */
  rate: number;
}

/** The rows' replay. The legs of each row add, side by side, to its
 *  balances less the row before's (the identity above); `chained` is false
 *  where a row's stated before is not the row before's after. */
export interface PolarisReplay {
  replayed: PolarisReplayed[];
  /** Rows whose stated before is not the previous row's after. */
  unchained: string[];
  /** Rows whose legs do not reach their stated after. */
  unbalanced: string[];
  grain: number;
  scale: number;
}

/** What the page states now, where it has it: the CDP's entire figures and
 *  the pending legs from the live read (getCDPEntireColl / Debt and their
 *  parts), and the feed's price. */
export interface PolarisLive {
  /** pETH in the market's stablecoin now. */
  price: number | null;
  /** The live read's block time (unix seconds). */
  ts: number;
  open: boolean;
  entireColl: number;
  entireDebt: number;
  recordedDebt: number;
  accruedInterest: number;
  accruedStables: number;
  bcTokenGain: number;
  mintRedeemCollChange: number;
  mintRedeemDebtChange: number;
}

/** The live read as the replay reads it; null without one. */
export function polarisFlowLive(chain: PolarisChainResponse | null): PolarisLive | null {
  if (!chain || chain.chainStale) return null;
  return {
    price: chain.price?.pethInDebt != null && chain.price.pethInDebt > 0 ? chain.price.pethInDebt : null,
    ts: chain.blockTimestamp,
    open: chain.isOpen,
    entireColl: chain.entireColl,
    entireDebt: chain.entireDebt,
    recordedDebt: chain.recordedDebt,
    accruedInterest: chain.accruedInterest,
    accruedStables: chain.accruedStables,
    bcTokenGain: chain.bcTokenGain,
    mintRedeemCollChange: chain.mintRedeemCollChange,
    mintRedeemDebtChange: chain.mintRedeemDebtChange,
  };
}

/** The per-row replay. `live` sets the rate after the last row and prices a
 *  row no other row is nearer to. */
export function replayPolaris(rows: PolarisFlowRow[], live: PolarisLive | null, now: number): PolarisReplay {
  const out: PolarisReplayed[] = [];
  const unchained: string[] = [];
  const unbalanced: string[] = [];
  let prevColl = ZERO;
  let prevDebt = ZERO;
  for (const r of rows) {
    if (r.collBefore !== prevColl || r.debtBefore !== prevDebt) unchained.push(r.id);
    const legs: { bucket: string; amount: number }[] = [];
    const add = (bucket: string, v: bigint) => {
      if (v > ZERO) legs.push({ bucket, amount: units(v) });
    };
    const signed = (v: bigint, inKey: string, outKey: string) => {
      if (v > ZERO) add(inKey, v);
      else if (v < ZERO) add(outKey, -v);
    };
    if (r.kind === "liquidation") {
      const taken = r.collChange < ZERO ? -r.collChange : ZERO;
      const surplus = r.surplus > taken ? taken : r.surplus > ZERO ? r.surplus : ZERO;
      add(PF.collLiquidated, taken - surplus);
      add(PF.surplus, surplus);
      if (r.collChange > ZERO) add(PF.deposited, r.collChange);
      if (r.debtChange < ZERO) add(PF.debtLiquidated, -r.debtChange);
      else add(PF.borrowed, r.debtChange);
    } else {
      signed(r.collChange, PF.deposited, PF.withdrawn);
      signed(r.debtChange, PF.borrowed, PF.repaid);
    }
    add(PF.reward, r.bcTokenGain);
    signed(r.mintRedeemCollGain, PF.psmCollIn, PF.psmCollOut);
    add(PF.interest, r.accruedInterest);
    signed(r.mintRedeemDebtGain, PF.psmDebtIn, PF.psmDebtOut);
    add(PF.stability, r.stableGain);
    add(PF.settled, r.settled);
    const collSum = prevColl + r.collChange + r.mintRedeemCollGain + r.bcTokenGain;
    const debtSum = prevDebt + r.debtChange + r.accruedInterest + r.mintRedeemDebtGain - r.stableGain + r.settled;
    if (collSum !== r.newColl || debtSum !== r.newDebt) unbalanced.push(r.id);
    out.push({
      row: r,
      legs,
      coll: units(r.newColl),
      debt: units(r.newDebt),
      price: r.price ?? NaN,
      priceFrom: "row",
      rate: 0,
    });
    prevColl = r.newColl;
    prevDebt = r.newDebt;
  }
  // The debt's rate from each row to the next: the next row's interest over
  // this row's debt and the time between; after the last, the live read's
  // pending interest over the recorded debt and the time since.
  for (let i = 0; i < out.length; i++) {
    const a = out[i];
    const next = out[i + 1];
    const dt = next ? next.row.ts - a.row.ts : live ? live.ts - a.row.ts : 0;
    const accrued = next ? units(next.row.accruedInterest) : live?.open ? live.accruedInterest : 0;
    const base = next ? a.debt : live?.open ? live.recordedDebt : 0;
    a.rate = dt > 0 && base > 0 && accrued > 0 ? (accrued / base) * (ONE_YEAR_S / dt) : 0;
  }
  // A row the lane has not priced takes the nearest priced moment in time.
  const priced = out.filter((r) => r.price > 0);
  for (const r of out) {
    if (r.price > 0) continue;
    let best: { dt: number; price: number; from: PolarisPriceFrom } | null = null;
    for (const p of priced) {
      const dt = Math.abs(p.row.ts - r.row.ts);
      if (!best || dt < best.dt) best = { dt, price: p.price, from: "nearest" };
    }
    if (live?.price != null && live.price > 0) {
      const dt = Math.abs(now - r.row.ts);
      if (!best || dt < best.dt) best = { dt, price: live.price, from: "today" };
    }
    r.price = best?.price ?? 0;
    r.priceFrom = best?.from ?? "nearest";
  }
  let peak = 0;
  let inColl = 0;
  let inDebt = 0;
  for (const r of out) {
    for (const l of r.legs) {
      if (PL_OUT_KEYS.has(l.bucket)) continue;
      if (PL_COLL_KEYS.has(l.bucket)) inColl += l.amount * r.price;
      else inDebt += l.amount;
    }
    peak = Math.max(peak, inColl, inDebt, r.coll * r.price, r.debt);
  }
  const scale = unitScaleFor(peak);
  return { replayed: out, unchained, unbalanced, grain: 10 ** scale, scale };
}

/** The live read's legs not yet written into the CDP, as positive amounts by
 *  bucket: collateral in pETH, debt in the stablecoin. An entire debt below
 *  zero is settled to zero at the next touch. */
export function polarisPendingLegs(live: PolarisLive): { bucket: string; amount: number }[] {
  const out: { bucket: string; amount: number }[] = [];
  const add = (bucket: string, v: number) => {
    if (v > 0) out.push({ bucket, amount: v });
  };
  add(PF.reward, live.bcTokenGain);
  if (live.mintRedeemCollChange > 0) add(PF.psmCollIn, live.mintRedeemCollChange);
  else add(PF.psmCollOut, -live.mintRedeemCollChange);
  add(PF.interest, live.accruedInterest);
  if (live.mintRedeemDebtChange > 0) add(PF.psmDebtIn, live.mintRedeemDebtChange);
  else add(PF.psmDebtOut, -live.mintRedeemDebtChange);
  add(PF.stability, live.accruedStables);
  if (live.entireDebt < 0) add(PF.settled, -live.entireDebt);
  return out;
}

export interface PolarisFlowOptions {
  /** The market's stablecoin ("USDp", "GOLDp"). */
  stable: string;
  /** Unix seconds now; the page's clock. */
  now: number;
  /** The CDP is open (the page's verdict). */
  open: boolean;
  live: PolarisLive | null;
}

const COLL = "coll";
const DEBT = "debt";
export const PETH_SYMBOL = "pETH";

/** The CDP's rows as the Lifetime flows panel's timeline, in the market's
 *  stablecoin. Null with no rows, or where nothing prices the collateral. */
export function polarisFlowTimeline(rp: PolarisReplay, o: PolarisFlowOptions): FlowTimeline | null {
  const { replayed, grain: G, scale } = rp;
  if (replayed.length === 0) return null;
  if (!replayed.some((r) => r.price > 0)) return null;
  const cp = (r: PolarisReplayed) => r.price * G;
  const last = replayed[replayed.length - 1];
  const open = o.open && (last.coll > 0 || last.debt > 0);
  const live = open && o.live?.open ? o.live : null;
  const livePrice = live?.price != null && live.price > 0 ? live.price : null;
  const pending = live ? polarisPendingLegs(live) : [];
  const filled = new Set([...replayed.flatMap((r) => r.legs.map((l) => l.bucket)), ...pending.map((p) => p.bucket)]);
  const buckets = polarisFlowBuckets(filled);

  const flowEvents: FlowEvent[] = replayed.map((r) => {
    const moved = { coll: false, debt: false };
    for (const l of r.legs) {
      if (PL_ACCRUAL_KEYS.has(l.bucket)) continue;
      if (PL_COLL_KEYS.has(l.bucket)) moved.coll = true;
      else moved.debt = true;
    }
    return {
      id: r.row.id,
      ts: r.row.ts,
      block: r.row.block,
      tick:
        r.row.kind === "liquidation"
          ? "liquidation"
          : moved.coll && moved.debt
            ? "both"
            : moved.coll
              ? "collateral"
              : "debt",
      legs: r.legs.map((l) =>
        PL_COLL_KEYS.has(l.bucket)
          ? { bucket: l.bucket, usd: l.amount * cp(r), symbol: PETH_SYMBOL }
          : { bucket: l.bucket, usd: l.amount * G, symbol: o.stable },
      ),
      tx: r.row.tx,
      // A liquidation is the liquidator's transaction.
      countsTx: r.row.kind === "owner",
      balances: [
        { asset: COLL, symbol: PETH_SYMBOL, side: "collateral", amount: Math.max(0, r.coll) },
        { asset: DEBT, symbol: o.stable, side: "debt", amount: Math.max(0, r.debt) },
      ],
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
  const endDay = open ? Math.max(today, Math.floor(last.row.ts / DAY_S) + 1) : Math.floor(last.row.ts / DAY_S) + 1;
  // Now: the live read's entire figures, else the last row's with the debt
  // grown at its rate.
  const growth = (r: PolarisReplayed, at: number) => 1 + r.rate * (Math.max(0, at - r.row.ts) / ONE_YEAR_S);
  const nowColl = open ? (live?.entireColl ?? last.coll) : 0;
  const nowDebt = open ? (live ? Math.max(0, live.entireDebt) : last.debt * growth(last, o.now)) : 0;
  const priceNow = (livePrice ?? last.price) * G;

  // The collateral's price: each event day the price its flows took, carried
  // over the days between, and today's.
  const collObs = new Map<number, number>();
  for (const r of replayed) collObs.set(Math.floor(r.row.ts / DAY_S), cp(r));
  if (livePrice != null) collObs.set(today, livePrice * G);
  // The debt's price each day: its face grown by the interest since the
  // day's last row, to the day's close (or now).
  const debtObs: [number, number][] = [];
  const firstDay = Math.floor(replayed[0].row.ts / DAY_S);
  let ei = 0;
  for (let d = firstDay; d <= endDay; d++) {
    const end = Math.min((d + 1) * DAY_S, o.now);
    while (ei + 1 < replayed.length && replayed[ei + 1].row.ts <= end) ei++;
    const e = replayed[ei];
    debtObs.push([d, e.row.ts <= end ? growth(e, end) * G : G]);
  }

  const assets: NonNullable<FlowTimeline["live"]["assets"]> = [];
  if (open) {
    if (nowColl > 0) assets.push({ side: "collateral", symbol: PETH_SYMBOL, amount: nowColl, usd: nowColl * priceNow });
    if (nowDebt > 0) assets.push({ side: "debt", symbol: o.stable, amount: nowDebt, usd: nowDebt * G });
  }
  return {
    unit: { symbol: o.stable, scale },
    buckets,
    days,
    live: {
      collateralUsd: open ? nowColl * priceNow : 0,
      debtUsd: open ? nowDebt * G : 0,
      assets,
      ...(pending.length
        ? {
            pending: pending.map((p) =>
              PL_COLL_KEYS.has(p.bucket)
                ? { bucket: p.bucket, symbol: PETH_SYMBOL, usd: p.amount * priceNow }
                : { bucket: p.bucket, symbol: o.stable, usd: p.amount * G },
            ),
          }
        : {}),
    },
    todayPrices: { [COLL]: priceNow, [DEBT]: G },
    dailyPrices: { [COLL]: [...collObs].sort((a, b) => a[0] - b[0]), [DEBT]: debtObs },
    seriesCarry: true,
    today: open ? today : endDay,
    labels: { collateral: "Collateral", debt: "Debt" },
    words: polarisFlowWords(o.stable),
  };
}

/** The panel's words for a Polaris CDP. */
export function polarisFlowWords(stable: string): NonNullable<FlowTimeline["words"]> {
  return {
    held: "Still deposited",
    restBySide: { collateral: "Market move", debt: "Interest since the last event" },
    restNote: {
      collateral: `the change in pETH's price, in ${stable}, since each flow`,
      debt: "the interest built up on the recorded debt since the CDP's last event, at the rate its next event charged",
    },
    basis: {
      collateral: `Every figure is in ${stable}, the market's stablecoin; each pETH flow is converted at the market's price feed at its block.`,
      debt: `Every figure is in ${stable}, the market's stablecoin.`,
    },
    heldBasis: {
      collateral: `the pETH the CDP held after its last event by then, at the feed's price at that event, in ${stable}; today, the live read at the feed's price now.`,
      debt: `the ${stable} the CDP's last event recorded by then, plus the interest charged on it at the rate its next event charged (after the last, the live read's), to the end of that day.`,
    },
    linePrices: `in ${stable}, with the collateral at the feed's price of its latest event and the debt plus the interest built since`,
    moment: {
      face: ["debt"],
      noPrice: {
        collateral: "No price is recorded for this day, so the collateral is stated in pETH only.",
      },
      notes: [
        "PSM shares, stability gains and reward pETH built up since the last event are not included: the CDP's next event writes them in.",
      ],
    },
  };
}

/** The rows as the event cards' sums read them (lib/shared/flow-focus.ts):
 *  each row's legs in the model's figures (the stablecoin in grains) and in
 *  tokens, the legs the day rows add up. Each side's figure just before and
 *  once the row's transaction had run is the transaction's last row's balance
 *  at that row's price, less the transaction's acts (what built up since the
 *  last touch stays in the before: it had built up by the block). */
export function polarisFocusEvents(rp: PolarisReplay, stable: string): FocusEvent[] {
  const { replayed, grain: G } = rp;
  const cp = (r: PolarisReplayed) => r.price * G;
  const byTx = new Map<string, PolarisReplayed[]>();
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
        if (PL_ACCRUAL_KEYS.has(l.bucket)) continue;
        const sign = PL_OUT_KEYS.has(l.bucket) ? -1 : 1;
        if (PL_COLL_KEYS.has(l.bucket)) collMove += sign * l.amount;
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
        PL_COLL_KEYS.has(l.bucket)
          ? {
              bucket: l.bucket,
              usd: l.amount * cp(r),
              amount: l.amount,
              symbol: PETH_SYMBOL,
              ...(PL_ACCRUAL_KEYS.has(l.bucket) ? { accrual: true } : {}),
            }
          : {
              bucket: l.bucket,
              usd: l.amount * G,
              amount: l.amount,
              symbol: stable,
              ...(PL_ACCRUAL_KEYS.has(l.bucket) ? { accrual: true } : {}),
            },
      ),
      sides: {
        collateral: {
          before: Math.max(0, collHeld - collMove) * collPrice,
          after: collHeld * collPrice,
          amount: collMove,
          symbol: PETH_SYMBOL,
          held: collHeld,
        },
        debt: {
          before: Math.max(0, debtHeld - debtMove) * G,
          after: debtHeld * G,
          amount: debtMove,
          symbol: stable,
          held: debtHeld,
        },
      },
      rate: r.rate * 100,
    };
  });
}

/** What the Explanation counts. */
export interface PolarisFlowFacts {
  /** Collateral-moving rows priced at their block, at the nearest priced
   *  row, and at today's read. */
  pricing: Record<PolarisPriceFrom, number>;
  liquidated: boolean;
  /** Rows carrying each protocol leg. */
  psmRows: number;
  settledRows: number;
  rewardRows: number;
  stabilityRows: number;
  /** The live read's pending legs were added at today's stop. */
  pendingToday: boolean;
}

export function polarisFlowFacts(rp: PolarisReplay, live: PolarisLive | null): PolarisFlowFacts {
  const pricing: Record<PolarisPriceFrom, number> = { row: 0, nearest: 0, today: 0 };
  const has = (r: PolarisReplayed, ...ks: string[]) => r.legs.some((l) => ks.includes(l.bucket));
  for (const r of rp.replayed) if (r.legs.some((l) => PL_COLL_KEYS.has(l.bucket))) pricing[r.priceFrom]++;
  const rs = rp.replayed;
  return {
    pricing,
    liquidated: rs.some((r) => r.row.kind === "liquidation"),
    psmRows: rs.filter((r) => has(r, PF.psmCollIn, PF.psmCollOut, PF.psmDebtIn, PF.psmDebtOut)).length,
    settledRows: rs.filter((r) => has(r, PF.settled)).length,
    rewardRows: rs.filter((r) => has(r, PF.reward)).length,
    stabilityRows: rs.filter((r) => has(r, PF.stability)).length,
    pendingToday: !!live?.open && polarisPendingLegs(live).length > 0,
  };
}
