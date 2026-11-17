// Lifetime flows for a Polaris stability-pool deposit and a reserve loan: the
// page's rows replayed into the day rows the Lifetime flows panel reads
// (lib/shared/flows-timeline.ts), each side in its own token
// (`FlowTimeline.sideUnits`, as Frankencoin and PWN draw theirs). Nothing is
// priced (decision 0022, token mode).
//
// DEPOSIT. The deposit's bar is the pool's stablecoin: deposited and the
// stable yield the touches paid in, less withdrawn, burned by liquidations and
// the yield claimed, holds the deposit recorded at the last touch. The second
// bar is pETH: paid in at touches, less claimed, holds the stash. At today
// each bar adds what the pool has done since the last touch to the line it
// belongs to (`live.pending`): the burn, the yield and the pETH pending.
//
// LOAN. fpETH on one bar (deposited, less returned), WETH on the other
// (borrowed, with the fees each touch's index charged, less repaid, holds the
// debt after the last touch); at today the fees accrued since then join the
// fees line.

import type { FocusEvent } from "@/lib/shared/flow-focus";
import type { FlowBucket, FlowDayRow, FlowEvent, FlowTimeline } from "@/lib/shared/flows-timeline";
import { daysFromEvents, unitScaleFor } from "@/lib/shared/flows-timeline";
import type { PolarisDepositEventRow, PolarisLoanEventRow } from "@/lib/sources/api/polaris-sp-loans";
import { FPETH, PETH, POLARIS_MARKET_CONFIG, POLARIS_WETH, type PolarisMarket } from "./asset-catalog";
import { big, units, type DepositNow } from "./sp-loan-math";

const DAY_S = 86_400;
const DUST = 1e-12;
const ZERO = BigInt(0);
const A = "a";
const B = "b";

type Grains = { collateral: number; debt: number };

function sidePrices(firstDay: number, endDay: number, G: Grains) {
  const a: [number, number][] = [];
  const b: [number, number][] = [];
  for (let d = firstDay; d <= endDay; d++) {
    a.push([d, G.collateral]);
    b.push([d, G.debt]);
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
    { key: D.pethClaimed, label: "pETH claimed", event: "Claim", side: "debt", dir: "out" },
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
  for (const r of ops) {
    const ch = units(big(r.top_up_or_withdrawal));
    inA += Math.max(0, ch) + units(big(r.stable_gain_since));
    inB += units(big(r.bc_gain_since));
    peakA = Math.max(peakA, inA);
    peakB = Math.max(peakB, inB);
  }
  if (o.now) {
    peakA = Math.max(peakA, inA + units(o.now.pendingStable));
    peakB = Math.max(peakB, inB + units(o.now.bcSinceTouch));
  }
  const scale = { collateral: unitScaleFor(peakA), debt: unitScaleFor(peakB) };
  const G: Grains = { collateral: 10 ** scale.collateral, debt: 10 ** scale.debt };

  const events: FlowEvent[] = ops.map((r) => {
    const ch = big(r.top_up_or_withdrawal);
    const legs: FlowEvent["legs"] = [];
    const a = (bucket: string, v: bigint) => v > ZERO && legs.push({ bucket, usd: units(v) * G.collateral, symbol: s });
    const b = (bucket: string, v: bigint) =>
      v > ZERO && legs.push({ bucket, usd: units(v) * G.debt, symbol: PETH.symbol });
    a(D.deposited, ch > ZERO ? ch : ZERO);
    a(D.withdrawn, ch < ZERO ? -ch : ZERO);
    a(D.burned, big(r.deposit_loss));
    a(D.yieldIn, big(r.stable_gain_since));
    a(D.yieldClaimed, big(r.stable_gain_claimed));
    b(D.pethIn, big(r.bc_gain_since));
    b(D.pethClaimed, big(r.bc_gain_claimed));
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
        { asset: A, symbol: s, side: "collateral", amount: units(big(r.new_deposit)) },
        { asset: B, symbol: PETH.symbol, side: "debt", amount: units(big(r.stashed_bc_tokens)) },
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
  const today = Math.floor(o.nowSec / DAY_S);
  const firstDay = Math.floor(events[0].ts / DAY_S);
  const lastDay = Math.floor(events[events.length - 1].ts / DAY_S);
  const endDay = o.open ? Math.max(today, lastDay + 1) : lastDay + 1;

  const last = ops[ops.length - 1];
  const n = o.now;
  const heldA = o.open ? (n ? units(n.now) + units(n.pendingStable) : units(big(last.new_deposit))) : 0;
  const heldB = o.open ? units(big(last.stashed_bc_tokens)) + (n ? units(n.bcSinceTouch) : 0) : 0;
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

  const timeline: FlowTimeline = {
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
    dailyPrices: sidePrices(firstDay, endDay, G),
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
      moment: {
        tokensOnly: ["collateral", "debt"],
        notes: [
          `The pool records a deposit only at its touches: between them each figure stands as the last touch left it.`,
        ],
      },
    },
  };
  return { timeline, focus: focusEvents(events, buckets, G) };
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

/** A loan's touches, oldest first, as the panel's timeline and focus events. */
export function loanFlows(
  rowsAsc: PolarisLoanEventRow[],
  o: { open: boolean; collNowRaw: string | null; debtNowRaw: string | null; nowSec: number },
): SpLoanFlows | null {
  const touches = rowsAsc.filter((r) => r.event_type !== "transfer");
  if (touches.length === 0) return null;
  let peakA = 0;
  let peakB = 0;
  for (const r of touches) {
    peakA = Math.max(peakA, units(big(r.coll_after)));
    peakB = Math.max(peakB, units(big(r.debt_after)));
  }
  if (o.debtNowRaw) peakB = Math.max(peakB, units(big(o.debtNowRaw)));
  const scale = { collateral: unitScaleFor(peakA * 2), debt: unitScaleFor(peakB * 2) };
  const G: Grains = { collateral: 10 ** scale.collateral, debt: 10 ** scale.debt };

  let debtBefore = ZERO;
  const events: FlowEvent[] = touches.map((r) => {
    const c = big(r.coll_change);
    const d = big(r.debt_change);
    const after = big(r.debt_after);
    // The fee the index charged on the shares before this touch.
    const fee = after - debtBefore - d;
    debtBefore = after;
    const legs: FlowEvent["legs"] = [];
    const a = (bucket: string, v: bigint) =>
      v > ZERO && legs.push({ bucket, usd: units(v) * G.collateral, symbol: FPETH.symbol });
    const b = (bucket: string, v: bigint) =>
      v > ZERO && legs.push({ bucket, usd: units(v) * G.debt, symbol: POLARIS_WETH.symbol });
    a(L.deposited, c > ZERO ? c : ZERO);
    a(L.returned, c < ZERO ? -c : ZERO);
    b(L.borrowed, d > ZERO ? d : ZERO);
    b(L.repaid, d < ZERO ? -d : ZERO);
    b(L.fees, fee);
    const movedA = c !== ZERO;
    const movedB = d !== ZERO;
    return {
      id: r.event_key,
      ts: Number(r.block_timestamp),
      block: Number(r.block_number),
      tick: movedA && movedB ? "both" : movedB ? "debt" : "collateral",
      legs,
      tx: r.tx_hash,
      balances: [
        { asset: A, symbol: FPETH.symbol, side: "collateral", amount: units(big(r.coll_after)) },
        { asset: B, symbol: POLARIS_WETH.symbol, side: "debt", amount: units(after) },
      ],
      prices: [
        { asset: A, usd: G.collateral },
        { asset: B, usd: G.debt },
      ],
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
  const last = touches[touches.length - 1];
  const heldA = o.open ? units(big(o.collNowRaw ?? last.coll_after)) : 0;
  const heldB = o.open ? units(big(o.debtNowRaw ?? last.debt_after)) : 0;
  const accrued = o.open && o.debtNowRaw ? big(o.debtNowRaw) - big(last.debt_after) : ZERO;
  const assets: NonNullable<FlowTimeline["live"]["assets"]> = [];
  if (heldA > DUST) assets.push({ side: "collateral", symbol: FPETH.symbol, amount: heldA, usd: heldA * G.collateral });
  if (heldB > DUST) assets.push({ side: "debt", symbol: POLARIS_WETH.symbol, amount: heldB, usd: heldB * G.debt });

  const timeline: FlowTimeline = {
    unit: { symbol: POLARIS_WETH.symbol, scale: scale.debt },
    sideUnits: {
      collateral: { symbol: FPETH.symbol, scale: scale.collateral },
      debt: { symbol: POLARIS_WETH.symbol, scale: scale.debt },
    },
    buckets,
    days,
    live: {
      collateralUsd: heldA * G.collateral,
      debtUsd: heldB * G.debt,
      assets,
      ...(accrued > ZERO
        ? { pending: [{ bucket: L.fees, symbol: POLARIS_WETH.symbol, usd: units(accrued) * G.debt }] }
        : {}),
    },
    todayPrices: { [A]: G.collateral, [B]: G.debt },
    dailyPrices: sidePrices(firstDay, endDay, G),
    seriesCarry: true,
    today: o.open ? today : endDay,
    labels: { collateral: "Collateral", debt: "Debt" },
    addresses: { [FPETH.symbol]: FPETH.address, [POLARIS_WETH.symbol]: POLARIS_WETH.address },
    words: {
      restBySide: { debt: "Fees since the last touch" },
      basis: {
        collateral: `Every figure is in ${FPETH.symbol}.`,
        debt: `Every figure is in ${POLARIS_WETH.symbol}. The floor prices ${FPETH.symbol} in ${POLARIS_WETH.symbol}; the bars are drawn apart.`,
      },
      heldBasis: {
        collateral: `the ${FPETH.symbol} the loan held after its last touch.`,
        debt: `the ${POLARIS_WETH.symbol} owed after the loan's last touch, at the fee index in force there.`,
      },
      linePrices: `with the collateral in ${FPETH.symbol} and the debt in ${POLARIS_WETH.symbol}, each on its own scale`,
      moment: { tokensOnly: ["collateral", "debt"] },
    },
  };
  return { timeline, focus: focusEvents(events, buckets, G) };
}
