// Lifetime flows for a Polaris stability-pool deposit and a reserve loan: the
// page's rows replayed into the day rows the Lifetime flows panel reads
// (lib/shared/flows-timeline.ts), each side in its own token
// (`FlowTimeline.sideUnits`, as Frankencoin and PWN draw theirs). Nothing is
// priced (decision 0022, token mode).
//
// DEPOSIT. The deposit's bar is the pool's stablecoin: deposited and the
// stable yield the touches paid in, less withdrawn, burned by liquidations and
// the yield claimed, holds the deposit recorded at the last touch. The second
// bar is pETH: paid in at touches, less claimed, holds the stash. Today
// each bar adds what the pool has done since the last touch to the line it
// belongs to (`live.pending`): the burn, the yield and the pETH pending.
//
// LOAN. Both bars in WETH, so their lengths compare: the fpETH at the bonding
// curve's floor (deposited, less returned, each at the floor in force at its
// touch; the floor's rise since is the bar's balancing item), and the debt
// (borrowed, with the fees each touch's index charged, less repaid). The
// floor is read at each day's close; where that read fails, the touches'
// floors are carried; today is the chain's.
// Today the fees accrued since the last touch join the fees line, where the
// chain's loans(id) agrees with the last touch.
//
// The panel draws each day's markers by side: on its second bar an inflow is
// marked as leaving the position, which fits a debt and not the pETH a
// deposit is paid. The pETH lines name no event, so they draw no marker; the
// tick and the deposit's own lines still mark the day.

import type { FocusEvent } from "@/lib/shared/flow-focus";
import type { FlowBucket, FlowDayRow, FlowEvent, FlowTimeline } from "@/lib/shared/flows-timeline";
import type { DayObs } from "@/lib/shared/price-series";
import { daysFromEvents, unitScaleFor } from "@/lib/shared/flows-timeline";
import type {
  PolarisDepositDay,
  PolarisDepositEventRow,
  PolarisLoanEventRow,
} from "@/lib/sources/api/polaris-sp-loans";
import { FPETH, PETH, POLARIS_MARKET_CONFIG, POLARIS_WETH, type PolarisMarket } from "./asset-catalog";
import { big, depositLegs, loanChainAgrees, loanFloorBook, loanLegs, units, type DepositNow } from "./sp-loan-math";

const DAY_S = 86_400;
const DUST = 1e-12;
const ZERO = BigInt(0);
const A = "a";
const B = "b";

type Grains = { collateral: number; debt: number };

/** Each side's "price", its grain, every day; a day the page read from a
 *  day row carries that row's last block, so its receipt names the block. */
function sidePrices(firstDay: number, endDay: number, G: Grains, blocks?: Map<number, number>) {
  const a: DayObs[] = [];
  const b: DayObs[] = [];
  for (let d = firstDay; d <= endDay; d++) {
    const block = blocks?.get(d);
    a.push(block != null ? [d, G.collateral, block] : [d, G.collateral]);
    b.push(block != null ? [d, G.debt, block] : [d, G.debt]);
  }
  return { [A]: a, [B]: b };
}

/** The page's flows: the panel's timeline and the rows as the event cards'
 *  sums read them (lib/shared/flow-focus.ts). */
export interface SpLoanFlows {
  timeline: FlowTimeline;
  focus: FocusEvent[];
}

/** Each row's legs in the model's figures and in tokens, and each side just
 *  before and once the row had run. */
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

// ── Deposit ────────────────────────────────────────────────────────────────

const D = {
  deposited: "sp-deposited",
  yieldIn: "sp-yield-in",
  withdrawn: "sp-withdrawn",
  burned: "sp-burned",
  yieldClaimed: "sp-yield-claimed",
  pethIn: "sp-peth-in",
  pethClaimed: "sp-peth-claimed",
} as const;

function depositBuckets(stable: string): FlowBucket[] {
  return [
    { key: D.deposited, label: "Deposited", event: "Deposit", side: "collateral", dir: "in" },
    { key: D.yieldIn, label: `${stable} yield paid in`, event: "", side: "collateral", dir: "in", hatch: "dashes" },
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
      label: `${stable} yield claimed`,
      event: "Claim",
      side: "collateral",
      dir: "out",
      hatch: "vertical",
    },
    { key: D.pethIn, label: "pETH paid in", event: "", side: "debt", dir: "in" },
    { key: D.pethClaimed, label: "pETH claimed", event: "", side: "debt", dir: "out" },
  ];
}

/** A deposit's rows, oldest first, as the panel's timeline and focus events. Null without a
 *  deposit operation. */
export function depositFlows(
  market: PolarisMarket,
  rowsAsc: PolarisDepositEventRow[],
  o: { open: boolean; now: DepositNow | null; nowSec: number },
): SpLoanFlows | null {
  const ops = rowsAsc.filter((r) => r.event_type === "deposit_operation");
  if (ops.length === 0) return null;
  const s = POLARIS_MARKET_CONFIG[market].stable.symbol;
  let peakA = 0;
  let peakB = 0;
  let inA = 0;
  let inB = 0;
  const legsOf = ops.map(depositLegs);
  for (const g of legsOf) {
    inA += units(g.deposited) + units(g.yieldIn);
    inB += units(g.pethIn);
    peakA = Math.max(peakA, inA);
    peakB = Math.max(peakB, inB);
  }
  if (o.now) {
    peakA = Math.max(peakA, inA + units(o.now.pendingStable));
    peakB = Math.max(peakB, inB + units(o.now.bcSinceTouch));
  }
  const scale = { collateral: unitScaleFor(peakA), debt: unitScaleFor(peakB) };
  const G: Grains = { collateral: 10 ** scale.collateral, debt: 10 ** scale.debt };

  const events: FlowEvent[] = ops.map((r, i) => {
    const g = legsOf[i];
    const legs: FlowEvent["legs"] = [];
    const a = (bucket: string, v: bigint) => v > ZERO && legs.push({ bucket, usd: units(v) * G.collateral, symbol: s });
    const b = (bucket: string, v: bigint) =>
      v > ZERO && legs.push({ bucket, usd: units(v) * G.debt, symbol: PETH.symbol });
    a(D.deposited, g.deposited);
    a(D.withdrawn, g.withdrawn);
    a(D.burned, g.burned);
    a(D.yieldIn, g.yieldIn);
    a(D.yieldClaimed, g.yieldClaimed);
    b(D.pethIn, g.pethIn);
    b(D.pethClaimed, g.pethClaimed);
    const movedA = legs.some((l) => l.symbol === s);
    const movedB = legs.some((l) => l.symbol === PETH.symbol);
    return {
      id: r.event_key,
      ts: Number(r.block_timestamp),
      block: Number(r.block_number),
      tick: movedA && movedB ? "both" : movedB ? "debt" : "collateral",
      legs,
      tx: r.tx_hash,
      balances: [
        { asset: A, symbol: s, side: "collateral", amount: units(g.deposit) },
        { asset: B, symbol: PETH.symbol, side: "debt", amount: units(g.stash) },
      ],
      prices: [
        { asset: A, usd: G.collateral },
        { asset: B, usd: G.debt },
      ],
    };
  });
  const buckets = depositBuckets(s);
  const days: FlowDayRow[] = daysFromEvents(
    buckets.map((x) => x.key),
    events,
  );
  const firstDay = Math.floor(events[0].ts / DAY_S);
  const lastDay = Math.floor(events[events.length - 1].ts / DAY_S);
  const last = legsOf[legsOf.length - 1];
  const timeline = depositTimeline(market, buckets, days, { firstDay, lastDay, last, scale, G }, o);
  return { timeline, focus: focusEvents(events, buckets, G) };
}

/** The deposit's timeline around its day rows: the live figures (what the
 *  pool has done since the last touch, at today), the axes and the words. */
function depositTimeline(
  market: PolarisMarket,
  buckets: FlowBucket[],
  days: FlowDayRow[],
  at: {
    firstDay: number;
    lastDay: number;
    last: { deposit: bigint; stash: bigint };
    scale: Grains;
    G: Grains;
    /** The block of each day row's last operation, where the page read day rows. */
    blocks?: Map<number, number>;
  },
  o: { open: boolean; now: DepositNow | null; nowSec: number },
): FlowTimeline {
  const s = POLARIS_MARKET_CONFIG[market].stable.symbol;
  const { firstDay, lastDay, last, scale, G } = at;
  const today = Math.floor(o.nowSec / DAY_S);
  const endDay = o.open ? Math.max(today, lastDay + 1) : lastDay + 1;

  const n = o.now;
  const heldA = o.open ? (n ? units(n.now) + units(n.pendingStable) : units(last.deposit)) : 0;
  const heldB = o.open ? units(last.stash) + (n ? units(n.bcSinceTouch) : 0) : 0;
  const pending: NonNullable<FlowTimeline["live"]["pending"]> = [];
  if (n) {
    if (n.pendingLoss > ZERO) pending.push({ bucket: D.burned, symbol: s, usd: units(n.pendingLoss) * G.collateral });
    if (n.pendingStable > ZERO)
      pending.push({ bucket: D.yieldIn, symbol: s, usd: units(n.pendingStable) * G.collateral });
    if (n.bcSinceTouch > ZERO)
      pending.push({ bucket: D.pethIn, symbol: PETH.symbol, usd: units(n.bcSinceTouch) * G.debt });
  }
  const assets: NonNullable<FlowTimeline["live"]["assets"]> = [];
  if (heldA > DUST) assets.push({ side: "collateral", symbol: s, amount: heldA, usd: heldA * G.collateral });
  if (heldB > DUST) assets.push({ side: "debt", symbol: PETH.symbol, amount: heldB, usd: heldB * G.debt });

  return {
    unit: { symbol: s, scale: scale.collateral },
    sideUnits: {
      collateral: { symbol: s, scale: scale.collateral },
      debt: { symbol: PETH.symbol, scale: scale.debt },
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
    dailyPrices: sidePrices(firstDay, endDay, G, at.blocks),
    seriesCarry: true,
    today: o.open ? today : endDay,
    labels: { collateral: `${s} deposit`, debt: "pETH paid in" },
    addresses: { [s]: POLARIS_MARKET_CONFIG[market].stable.address, [PETH.symbol]: PETH.address },
    words: {
      held: "Held",
      restBySide: { collateral: "Burned since the last touch", debt: "Paid in since the last touch" },
      basis: {
        collateral: `Every figure is in ${s}, the pool's stablecoin.`,
        debt: `Every figure is in pETH. Nothing prices pETH in ${s} here.`,
      },
      heldBasis: {
        collateral: `the deposit recorded at its last touch; the pool records a deposit only when it is touched.`,
        debt: `the pETH stashed at the last touch.`,
      },
      linePrices: `with the deposit in ${s} and the pETH in pETH, each on its own scale`,
      moment: { tokensOnly: ["collateral", "debt"] },
    },
  };
}

/** A deposit too long to send whole (the vault-held deposits), from its day
 *  rows (/stability-pool/flows/daily): the running sums after each day's last
 *  operation. No focus events: the page lists only the newest operations. */
export function depositFlowsFromDays(
  market: PolarisMarket,
  rows: PolarisDepositDay[],
  o: { open: boolean; now: DepositNow | null; nowSec: number },
): SpLoanFlows | null {
  if (rows.length === 0) return null;
  const s = POLARIS_MARKET_CONFIG[market].stable.symbol;
  const v = (raw: string) => units(big(raw));
  let peakA = 0;
  let peakB = 0;
  for (const r of rows) {
    peakA = Math.max(peakA, v(r.deposited) + v(r.yield_in));
    peakB = Math.max(peakB, v(r.peth_in));
  }
  const lastRow = rows[rows.length - 1];
  if (o.now) {
    peakA = Math.max(peakA, v(lastRow.deposited) + v(lastRow.yield_in) + units(o.now.pendingStable));
    peakB = Math.max(peakB, v(lastRow.peth_in) + units(o.now.bcSinceTouch));
  }
  const scale = { collateral: unitScaleFor(peakA), debt: unitScaleFor(peakB) };
  const G: Grains = { collateral: 10 ** scale.collateral, debt: 10 ** scale.debt };
  let events = 0;
  let txs = 0;
  let prev: PolarisDepositDay | null = null;
  const days: FlowDayRow[] = rows.map((r) => {
    events += r.events;
    txs += r.txs;
    // Each side moved where its running sums did since the day before, as
    // the event-built rows judge a side by its legs.
    const moved = (keys: (keyof PolarisDepositDay)[]) =>
      keys.some((k) => big(String(r[k])) !== (prev ? big(String(prev[k])) : ZERO));
    const movedA = moved(["deposited", "withdrawn", "burned", "yield_in", "yield_claimed"]);
    const movedB = moved(["peth_in", "peth_claimed"]);
    prev = r;
    const ts = Number(r.last_timestamp);
    const cum = {
      [D.deposited]: v(r.deposited) * G.collateral,
      [D.yieldIn]: v(r.yield_in) * G.collateral,
      [D.withdrawn]: v(r.withdrawn) * G.collateral,
      [D.burned]: v(r.burned) * G.collateral,
      [D.yieldClaimed]: v(r.yield_claimed) * G.collateral,
      [D.pethIn]: v(r.peth_in) * G.debt,
      [D.pethClaimed]: v(r.peth_claimed) * G.debt,
    };
    // Each line's running figure by asset, as the event-built rows state it.
    const cumAsset = Object.entries(cum).map(([bucket, usd]) => ({
      bucket,
      symbol: bucket === D.pethIn || bucket === D.pethClaimed ? PETH.symbol : s,
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
        { asset: A, symbol: s, side: "collateral", amount: v(r.deposit) },
        { asset: B, symbol: PETH.symbol, side: "debt", amount: v(r.stash) },
      ],
      prices: [
        { asset: A, usd: G.collateral, ts },
        { asset: B, usd: G.debt, ts },
      ],
    };
  });
  const timeline = depositTimeline(
    market,
    depositBuckets(s),
    days,
    {
      firstDay: rows[0].day,
      lastDay: lastRow.day,
      last: { deposit: big(lastRow.deposit), stash: big(lastRow.stash) },
      scale,
      G,
      blocks: new Map(rows.map((r) => [r.day, Number(r.last_block)])),
    },
    o,
  );
  return { timeline, focus: [] };
}

// ── Loan ───────────────────────────────────────────────────────────────────

const L = {
  deposited: "loan-deposited",
  returned: "loan-returned",
  borrowed: "loan-borrowed",
  fees: "loan-fees",
  repaid: "loan-repaid",
} as const;

function loanBuckets(): FlowBucket[] {
  return [
    { key: L.deposited, label: "Deposited", event: "Deposit", side: "collateral", dir: "in" },
    { key: L.returned, label: "Returned", event: "Repayment", side: "collateral", dir: "out" },
    { key: L.borrowed, label: "Borrowed", event: "Borrow", side: "debt", dir: "in" },
    { key: L.fees, label: "Fees", event: "", side: "debt", dir: "in", hatch: "dashes" },
    { key: L.repaid, label: "Repaid", event: "Repayment", side: "debt", dir: "out" },
  ];
}

/** The chain's read of a loan, as the page passes it. */
export interface LoanChainNow {
  collRaw: string;
  sharesRaw: string;
  debtRaw: string;
  floorPriceRaw: string;
}

/** A loan's touches, oldest first, as the panel's timeline and focus events:
 *  both bars in WETH, the fpETH at the floor in force at each touch, and
 *  today at the chain's floor. */
export function loanFlows(
  rowsAsc: PolarisLoanEventRow[],
  o: {
    open: boolean;
    chain: LoanChainNow | null;
    nowSec: number;
    /** The floor at each day's last FeesAccrued (/reserve-loans/floor/daily),
     *  or null where it was not read: the touches' floors are carried. */
    floorDays?: { day: number; floor_price_raw: string; block_number: string }[] | null;
  },
): SpLoanFlows | null {
  const touches = rowsAsc.filter((r) => r.event_type !== "transfer");
  if (touches.length === 0) return null;
  const legsOf = loanLegs(touches);
  // Each touch's floor (lib/polaris/sp-loan-math.ts, loanFloorBook): a row
  // with none takes the one before, leading rows the first known.
  const floorNowRaw = o.chain && BigInt(o.chain.floorPriceRaw) > ZERO ? BigInt(o.chain.floorPriceRaw) : null;
  const book = loanFloorBook(legsOf, floorNowRaw);
  if (book == null) return null;
  const floors = book.floors.map(units);
  const lastFloor = floors[floors.length - 1];
  const firstOwn = book.carried.indexOf(false);
  const lastRow = touches[touches.length - 1];
  const last = legsOf[legsOf.length - 1];
  // The floor is the protocol's, read whether or not the loan agrees; the
  // loan's own figures only where loans(id) agrees with the last touch.
  const floorNow = o.chain && BigInt(o.chain.floorPriceRaw) > ZERO ? units(floorNowRaw ?? BigInt(0)) : lastFloor;
  const agrees = o.open && o.chain != null && loanChainAgrees(o.chain, lastRow, touches.length);
  const debtNow = agrees && o.chain ? BigInt(o.chain.debtRaw) : null;

  let peak = 0;
  legsOf.forEach((g, i) => {
    peak = Math.max(peak, units(g.coll) * floors[i], units(g.debt));
  });
  peak = Math.max(peak, units(last.coll) * floorNow, debtNow != null ? units(debtNow) : 0);
  const scale = unitScaleFor(peak * 2);
  const G = 10 ** scale;

  const events: FlowEvent[] = touches.map((r, i) => {
    const g = legsOf[i];
    const f = floors[i];
    const legs: FlowEvent["legs"] = [];
    const a = (bucket: string, v: bigint) =>
      v > ZERO && legs.push({ bucket, usd: units(v) * f * G, symbol: FPETH.symbol });
    const b = (bucket: string, v: bigint) =>
      v > ZERO && legs.push({ bucket, usd: units(v) * G, symbol: POLARIS_WETH.symbol });
    a(L.deposited, g.collIn);
    a(L.returned, g.collOut);
    b(L.borrowed, g.borrowed);
    b(L.repaid, g.repaid);
    b(L.fees, g.fee);
    const movedA = g.collIn > ZERO || g.collOut > ZERO;
    const movedB = g.borrowed > ZERO || g.repaid > ZERO;
    return {
      id: r.event_key,
      ts: Number(r.block_timestamp),
      block: Number(r.block_number),
      tick: movedA && movedB ? "both" : movedB ? "debt" : "collateral",
      legs,
      tx: r.tx_hash,
      balances: [
        { asset: A, symbol: FPETH.symbol, side: "collateral", amount: units(g.coll) },
        { asset: B, symbol: POLARIS_WETH.symbol, side: "debt", amount: units(g.debt) },
      ],
      prices: [
        { asset: A, usd: f * G },
        { asset: B, usd: G },
      ],
      // A touch before the first that states a floor takes that later floor.
      ...(i < firstOwn
        ? {
            unsure: [
              {
                side: "collateral" as const,
                why: "is valued at the first floor the loan's touches record, as this touch records none",
                held: true,
              },
            ],
          }
        : {}),
    };
  });
  const buckets = loanBuckets();
  const days = daysFromEvents(
    buckets.map((x) => x.key),
    events,
  );
  const today = Math.floor(o.nowSec / DAY_S);
  const firstDay = Math.floor(events[0].ts / DAY_S);
  const lastDay = Math.floor(events[events.length - 1].ts / DAY_S);
  const endDay = o.open ? Math.max(today, lastDay + 1) : lastDay + 1;

  // The floor is recorded on the days the loan was touched, and today; a day
  // between keeps the last (`seriesCarry`), drawn dotted (`carriedWhy`).
  const floorObs = new Map<number, DayObs>();
  // A touch with no floor of its own records none: its day carries, dotted.
  events.forEach((e, i) => {
    if (!book.carried[i] || i < firstOwn) {
      const d = Math.floor(e.ts / DAY_S);
      floorObs.set(d, [d, floors[i] * G, e.block]);
    }
  });
  // The daily floor, where it was read, for every day of the life.
  const daily = o.floorDays && o.floorDays.length > 0;
  if (daily) {
    for (const f of o.floorDays!) {
      if (f.day < firstDay || f.day > endDay) continue;
      const v = units(BigInt(f.floor_price_raw));
      if (v > 0) floorObs.set(f.day, [f.day, v * G, Number(f.block_number)]);
    }
  }
  if (o.open && o.chain) floorObs.set(today, [today, floorNow * G]);
  const wethObs: [number, number][] = [];
  for (let d = firstDay; d <= endDay; d++) wethObs.push([d, G]);

  const heldA = o.open ? units(last.coll) : 0;
  const heldB = o.open ? units(debtNow ?? last.debt) : 0;
  const accrued = debtNow != null && debtNow > last.debt ? debtNow - last.debt : ZERO;
  const assets: NonNullable<FlowTimeline["live"]["assets"]> = [];
  if (heldA > DUST) assets.push({ side: "collateral", symbol: FPETH.symbol, amount: heldA, usd: heldA * floorNow * G });
  if (heldB > DUST) assets.push({ side: "debt", symbol: POLARIS_WETH.symbol, amount: heldB, usd: heldB * G });

  const timeline: FlowTimeline = {
    unit: { symbol: POLARIS_WETH.symbol, scale },
    buckets,
    days,
    live: {
      collateralUsd: heldA * floorNow * G,
      debtUsd: heldB * G,
      assets,
      ...(accrued > ZERO
        ? { pending: [{ bucket: L.fees, symbol: POLARIS_WETH.symbol, usd: units(accrued) * G }] }
        : {}),
    },
    todayPrices: { [A]: floorNow * G, [B]: G },
    dailyPrices: { [A]: [...floorObs.values()].sort((x, y) => x[0] - y[0]), [B]: wethObs },
    seriesCarry: true,
    ...(daily
      ? { priceSource: "the bonding curve's floor, the last FeesAccrued of each day" }
      : {
          carriedWhy: { [A]: "the index records the floor only at this loan's touches" },
          priceSource: "the bonding curve's floor, at the loan's touches and today",
        }),
    today: o.open ? today : endDay,
    labels: { collateral: "Collateral at the floor", debt: "Debt" },
    addresses: { [FPETH.symbol]: FPETH.address, [POLARIS_WETH.symbol]: POLARIS_WETH.address },
    words: {
      restBySide: { collateral: "Floor rise", debt: "Fees since the last touch" },
      restNote: {
        collateral: "the rise in the floor since each fpETH came in",
        debt: "the fees the index built since the loan's last touch",
      },
      basis: {
        collateral: `Each ${FPETH.symbol} flow is valued in ${POLARIS_WETH.symbol} at the floor in force at its touch.`,
        debt: `Every figure is in ${POLARIS_WETH.symbol}.`,
      },
      heldBasis: {
        collateral: daily
          ? `the ${FPETH.symbol} the loan held after its last touch, at the day's closing floor, and today at the chain's floor.`
          : `the ${FPETH.symbol} the loan held after its last touch, at the floor: the floor in force at the loan's last touch on the days between, the chain's floor today.`,
        debt: `the ${POLARIS_WETH.symbol} owed after the loan's last touch, at the fee index in force there.`,
      },
      linePrices: `in ${POLARIS_WETH.symbol}, the ${FPETH.symbol} at the floor`,
      throughput: "each at the floor in force at its touch",
    },
  };
  return { timeline, focus: loanFocusEvents(events, buckets, floors, G) };
}

/** The touches as the event cards' sums read them, the collateral at each
 *  touch's floor. */
function loanFocusEvents(events: FlowEvent[], buckets: FlowBucket[], floors: number[], G: number): FocusEvent[] {
  const out = new Set(buckets.filter((b) => b.dir === "out").map((b) => b.key));
  const sideOf = new Map(buckets.map((b) => [b.key, b.side]));
  return events.map((e, i) => {
    const per = { collateral: floors[i] * G, debt: G };
    const move = { collateral: 0, debt: 0 };
    for (const l of e.legs) move[sideOf.get(l.bucket)!] += (out.has(l.bucket) ? -1 : 1) * l.usd;
    const side = (k: "collateral" | "debt") => {
      const bal = e.balances.find((b) => b.side === k)!;
      const after = bal.amount * per[k];
      return {
        before: Math.max(0, after - move[k]),
        after,
        amount: move[k] / per[k],
        symbol: bal.symbol,
        held: bal.amount,
      };
    };
    return {
      id: e.id,
      ts: e.ts,
      ...(e.tx ? { tx: e.tx } : {}),
      legs: e.legs.map((l) => ({ ...l, amount: l.usd / per[sideOf.get(l.bucket)!] })),
      sides: { collateral: side("collateral"), debt: side("debt") },
    };
  });
}
