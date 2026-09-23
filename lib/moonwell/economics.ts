// Moonwell economics reduction — the dual tower with lifetime flows and the
// debt interest split.
// ----------------------------------------------------------------------------
// Collateral lines are the CURRENT value when the chain read landed — the exact
// mToken balance (slot-verified Transfer replay) × the market's
// exchangeRateStored, i.e. balanceOfUnderlying, interest included — and the
// replayed principal otherwise (the provenance asserts which basis each line
// carries). Debt lines are the last event's EMITTED accountBorrows, upgraded
// to the live borrowBalanceStored when the detail page's chain lane lands
// (each row's `live` flag names the basis — the provenance follows it).
// USD is ON-CHAIN: each market valued at Moonwell's own
// Chainlink-wrapper oracle (getUnderlyingPrice — the same price the
// Comptroller reads), threaded onto `priceByAddress`.
//
// With the wallet's event stream (optional second arg) the tower gains the
// lifetime layer: hatched withdrawn/repaid segments per market, the faded
// lifetime-inflow bar, and — on a single-market debt side — the
// accrued-interest segment (emitted accountBorrows − net event principal, the
// Spark legInterest arithmetic with its plausibility gates). The index is
// complete from the markets' 2026-05-27 deploy, so lifetime sums are truly
// all-time; wallet↔wallet mToken transfers emit no Mint/Redeem and are outside
// the underlying sums (the provenance says so — they live on the mToken lane).
// A liquidation's seized collateral is mTokens on ANOTHER market, so it is
// deliberately absent from the underlying flow buckets (zero liquidations
// exist as of onboarding; the seize rides the transfer lane when they come).
// When RPC is down and a contributing market is unpriced, the tower degrades
// to the token-only gated list (a strict per-total guard) rather than assert a
// partial USD total.
//
// Two seams let the index-free Base explorer run this same arithmetic:
//   • a VOCABULARY (`MoonwellTowerVocabulary`) — the receipts differ because
//     the claims differ (a live sweep from the Comptroller's first block, not
//     a captured index; a market keyed by its mToken address, not a catalog
//     tag), and the receipt is where that is said;
//   • a PRECOMPUTED lifetime — the Base route reduces every replayed row
//     server-side and sends the sums, because its rendered list is capped and
//     reducing a capped list into a bar labelled "all time" would state a
//     recent window as a lifetime.
// Passing neither is the Ethereum page, byte-identical to before the seams.

import type { MoonwellPositionView } from "@/components/protocol/moonwell/moonwell-position-card";
import type { Provenance } from "@/components/shared/provenance";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isMoonwellEvent } from "@/lib/shared/types/event-shape";
import { scaleBaseUnits, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";
import {
  positionSupplyCurrentProv,
  positionSupplyPrincipalProv,
  positionDebtProv,
  moonwellLifetimeFlowProv,
  moonwellDebtInterestProv,
  moonwellDebtPrincipalProv,
} from "@/lib/moonwell/event-provenance";
import { moonwellLiveDebtProv } from "@/lib/moonwell/position-provenance";
import { MOONWELL_MARKET_BY_KEY } from "@/lib/moonwell/asset-catalog";
import type { ChainTruthTowerData, TowerLine } from "@/lib/shared/chain-truth-economics";

const DUST = 1e-9;

/** Per-market lifetime gross underlying flows, replayed from the wallet's own
 *  mToken events. Addresses ride along (from the catalog) for oracle pricing. */
export interface MarketFlows {
  market: string;
  symbol: string;
  address?: string;
  supplied: number;
  withdrawn: number;
  borrowed: number;
  repaid: number;
  liquidatedDebt: number;
}

/** The receipts the tower's lines carry. Each takes the ROW it describes (the
 *  market key and symbol), so a vocabulary can resolve the market's identity
 *  its own way — the Ethereum catalog on one deployment, the mToken address
 *  itself on the other. */
export interface MoonwellTowerVocabulary {
  /** A supply line at its CURRENT value (mTokens × exchange rate). */
  supplyCurrent: (row: { market: string; symbol: string }) => Provenance;
  /** A supply line at its replayed PRINCIPAL (no chain read landed). */
  supplyPrincipal: (row: { market: string; symbol: string }) => Provenance;
  /** A debt line — the live borrowBalanceStored when `live`, else the last
   *  event's emitted accountBorrows. */
  debt: (row: { market: string; symbol: string; live?: boolean }) => Provenance;
  lifetimeFlow: (flow: "withdrawn" | "repaid" | "liquidated debt", symbol: string) => Provenance;
  debtInterest: (symbol: string, live?: boolean) => Provenance;
  debtPrincipal: (symbol: string) => Provenance;
}

/** The Ethereum explorer's receipts — the captured index, the fixed catalog. */
export const MOONWELL_INDEXED_VOCABULARY: MoonwellTowerVocabulary = {
  supplyCurrent: (r) =>
    positionSupplyCurrentProv(r.symbol, MOONWELL_MARKET_BY_KEY[r.market]?.mSymbol ?? `m${r.symbol}`),
  supplyPrincipal: (r) => positionSupplyPrincipalProv(r.symbol),
  debt: (r) => {
    const m = MOONWELL_MARKET_BY_KEY[r.market];
    return r.live
      ? moonwellLiveDebtProv(r.symbol, m?.mSymbol ?? `m${r.symbol}`, m?.mtoken)
      : positionDebtProv(r.symbol);
  },
  lifetimeFlow: moonwellLifetimeFlowProv,
  debtInterest: moonwellDebtInterestProv,
  debtPrincipal: moonwellDebtPrincipalProv,
};

/** Raw per-market accumulation from a wallet's own mToken events — BEFORE the
 *  repaid −= liquidatedDebt carve-out below. Kept separate from
 *  `replayMoonwellLifetime` so a windowed page can accumulate its loaded rows
 *  on the SAME uncorrected basis the opening balance's own buckets carry
 *  (rails-server's `flowsSql` is deliberately uncorrected for the same
 *  reason), sum the two, and apply the correction exactly once over the
 *  merged total. Applying it to either half alone would subtract the
 *  liquidation twice, or subtract it from a `repaid` figure that never held
 *  it in the first place. */
function accumulateMoonwellFlows(events: BaseActivityEvent[]): Map<string, MarketFlows> {
  const flows = new Map<string, MarketFlows>();
  const get = (market: string, symbol: string): MarketFlows => {
    const cur = flows.get(market) ?? {
      market,
      symbol,
      address: MOONWELL_MARKET_BY_KEY[market]?.underlying,
      supplied: 0,
      withdrawn: 0,
      borrowed: 0,
      repaid: 0,
      liquidatedDebt: 0,
    };
    flows.set(market, cur);
    return cur;
  };

  for (const ev of events) {
    if (!isMoonwellEvent(ev)) continue;
    const ctx = ev.context.data;
    // Liquidation: the row's amount is the debt the liquidator repaid on this
    // (borrowed) market. The paired RepayBorrow row carries the same movement
    // into `repaid`, so the liquidation row feeds ONLY the liquidated bucket —
    // the repaid bucket is reduced by it later, once, over the merged total.
    if (ctx.eventType === "liquidation") {
      const covered = Math.abs(Number(ctx.assetsDelta ?? "0"));
      if (Number.isFinite(covered)) get(ctx.market, ctx.marketSymbol).liquidatedDebt += covered;
      continue;
    }
    if (ctx.eventType === "transfer_in" || ctx.eventType === "transfer_out") continue; // mToken lane, no underlying amount
    const mag = Math.abs(Number(ctx.assetsDelta ?? "0"));
    if (!Number.isFinite(mag) || mag === 0) continue;
    const r = get(ctx.market, ctx.marketSymbol);
    if (ctx.eventType === "mint") r.supplied += mag;
    else if (ctx.eventType === "redeem") r.withdrawn += mag;
    else if (ctx.eventType === "borrow") r.borrowed += mag;
    else if (ctx.eventType === "repay") r.repaid += mag;
  }
  return flows;
}

function replayMoonwellLifetime(events: BaseActivityEvent[]): Map<string, MarketFlows> {
  const flows = accumulateMoonwellFlows(events);
  // A liquidation's debt leg is ALSO a RepayBorrow (payer = liquidator), so it
  // landed in `repaid` too. Move it: repaid keeps only voluntary repayments.
  for (const f of flows.values()) {
    if (f.liquidatedDebt > 0) f.repaid = Math.max(0, f.repaid - f.liquidatedDebt);
  }
  return flows;
}

/**
 * The lifetime flows for a WINDOWED page: the opening balance's raw
 * (uncorrected) buckets seeded first, the loaded rows' own raw accumulation
 * added on top, and the repaid −= liquidatedDebt carve-out applied exactly
 * ONCE, over the merged total — never to either half alone (see
 * `accumulateMoonwellFlows` above).
 *
 * Pass the result to `computeMoonwellEconomics` / `computeMoonwellCardCaptions`
 * as `precomputedLifetime` — the seam that already existed for the swept Base
 * explorers, which draw a capped slice of a longer history and must still
 * state the whole of it. This is the same claim reached by a different route,
 * so it reuses the seam rather than teaching the reducer a second one.
 *
 * The two halves never overlap: the opening balance covers `block_number <
 * cutoffBlock` and every event passed in is at or after it, so summing them is
 * addition and not reconciliation.
 *
 * ⚠️ A leg the opening balance cannot scale — no decimals for its market — is
 * NOT added as zero. The market is dropped from the lifetime layer entirely,
 * even where the loaded rows also touched it, so the tower shows nothing for
 * it rather than a total that is short by whatever the summarised part held —
 * the same refusal the reducer already makes for an unpriced market.
 */
export function moonwellLifetimeWithOpening(
  events: BaseActivityEvent[],
  opening: TimelineOpeningBalance | null | undefined,
): MarketFlows[] | undefined {
  if (!opening) return undefined;
  const merged = accumulateMoonwellFlows(events);
  const get = (market: string): MarketFlows => {
    const cur = merged.get(market) ?? {
      market,
      symbol: MOONWELL_MARKET_BY_KEY[market]?.symbol ?? market.toUpperCase(),
      address: MOONWELL_MARKET_BY_KEY[market]?.underlying,
      supplied: 0,
      withdrawn: 0,
      borrowed: 0,
      repaid: 0,
      liquidatedDebt: 0,
    };
    merged.set(market, cur);
    return cur;
  };

  // The opening balance's leg names are the field names below, matching
  // rails-server's flowsSql exactly so the merge needs no translation table.
  const LEGS = ["supplied", "withdrawn", "borrowed", "repaid", "liquidatedDebt"] as const;
  const unscalable = new Set<string>();
  for (const bucket of opening.flows ?? []) {
    const scaled: Partial<Record<(typeof LEGS)[number], number>> = {};
    let scalable = true;
    for (const leg of LEGS) {
      const raw = bucket.legs[leg];
      if (raw === undefined) continue;
      const value = scaleBaseUnits(raw, bucket.decimals);
      if (value == null) {
        scalable = false;
        break;
      }
      scaled[leg] = value;
    }
    if (!scalable) {
      unscalable.add(bucket.key);
      continue;
    }
    const r = get(bucket.key);
    for (const leg of LEGS) r[leg] += scaled[leg] ?? 0;
  }
  // Dropped even where the loaded rows above already created an entry for this
  // market — a window-only total would understate it by whatever the
  // summarised part held, which is worse than stating nothing.
  for (const market of unscalable) merged.delete(market);

  for (const f of merged.values()) {
    if (f.liquidatedDebt > 0) f.repaid = Math.max(0, f.repaid - f.liquidatedDebt);
  }

  return [...merged.values()];
}

/** Chain-faithful interest on one leg (the Spark legInterest gates):
 *  - no current figure / no gross inflow → can't attribute, bail;
 *  - interest < dust → zero (or negative: missed principal, bail);
 *  - interest > grossIn → >100% cumulative yield, physically implausible → bail. */
function legInterest(current: number | undefined, netPrincipal: number, grossIn: number): number {
  if (current == null || grossIn <= 0) return 0;
  const interest = current - netPrincipal;
  if (interest < DUST) return 0;
  if (interest > grossIn) return 0;
  return interest;
}

/** Position-card stat captions (the V4 spoke-card grammar, computed with this
 *  tier's gates). null = the gate failed and the caption simply doesn't render. */
export interface MoonwellCardCaptions {
  /** USD of accrued supply interest included in the collateral value. */
  supplyInterestUsd: number | null;
  /** USD of accrued borrow interest included in the debt figure. */
  debtInterestUsd: number | null;
  /** Current variable borrow APR (%). `avg` when debt-USD-weighted across
   *  several borrowed markets; `symbol` names the market when single. */
  borrowRate: { pct: number; avg: boolean; symbol?: string } | null;
}

/** USD of accrued interest included in one side's figure — per live market,
 *  (current − net event principal) × oracle price, summed. STRICT: a market
 *  that can't attribute (no captured inflow, negative interest = missed
 *  principal, interest > gross inflow = an mToken transfer the underlying sums
 *  never saw, no current reading, or an unpriced market) nulls the whole
 *  caption rather than understate it. */
function sideInterestUsd(
  side: "supply" | "debt",
  view: MoonwellPositionView,
  lifetime: Map<string, MarketFlows> | null,
  usdOf: (address: string | undefined, amount: number) => number | null,
): number | null {
  if (!lifetime) return null;
  let sum = 0;
  if (side === "supply") {
    const live = view.supplies.filter((r) => r.mTokens > 0);
    if (live.length === 0) return null;
    for (const cur of live) {
      if (cur.current == null) return null; // no chain read → can't split
      const f = lifetime.get(cur.market);
      if (!f || f.supplied <= 0) return null;
      const net = f.supplied - f.withdrawn;
      const interest = cur.current - net;
      if (interest < -DUST || interest > f.supplied) return null;
      if (interest <= DUST) continue;
      const usd = usdOf(cur.address, interest);
      if (usd == null) return null;
      sum += usd;
    }
  } else {
    const live = view.borrows.filter((r) => r.amount > 0);
    if (live.length === 0) return null;
    for (const cur of live) {
      const f = lifetime.get(cur.market);
      if (!f || f.borrowed <= 0) return null;
      const net = f.borrowed - f.repaid - f.liquidatedDebt;
      const interest = cur.amount - net;
      if (interest < -DUST || interest > f.borrowed) return null;
      if (interest <= DUST) continue;
      const usd = usdOf(cur.address, interest);
      if (usd == null) return null;
      sum += usd;
    }
  }
  return sum;
}

export function computeMoonwellCardCaptions(
  view: MoonwellPositionView,
  events?: BaseActivityEvent[],
  /** Lifetime sums reduced over the WHOLE history elsewhere (the Base sweep
   *  route) — the interest split then attributes against the whole life
   *  rather than a capped slice. When given, `events` are not reduced. */
  precomputedLifetime?: MarketFlows[],
): MoonwellCardCaptions {
  const prices = view.priceByAddress;
  const usdOf = (address: string | undefined, amount: number): number | null => {
    if (!address) return null;
    const p = prices?.[address.toLowerCase()];
    return typeof p === "number" && p > 0 ? amount * p : null;
  };
  const lifetime = precomputedLifetime
    ? new Map(precomputedLifetime.map((f) => [f.market, f]))
    : events && events.length > 0
      ? replayMoonwellLifetime(events)
      : null;

  // Borrow rate — from the per-market chain read (borrowRatePerTimestamp,
  // annualized). One borrowed market → its own rate; several → the
  // debt-USD-weighted average, with the strict guard (every borrowed market
  // rated AND oracle-priced, else omit).
  let borrowRate: MoonwellCardCaptions["borrowRate"] = null;
  const borrowed = view.borrows.filter((r) => r.amount > 0);
  const rateOf = (market: string): number | null => view.ratesByMarket?.[market]?.borrowApr ?? null;
  if (borrowed.length === 1) {
    const r = rateOf(borrowed[0].market);
    if (r != null) borrowRate = { pct: r * 100, avg: false, symbol: borrowed[0].symbol };
  } else if (borrowed.length > 1 && borrowed.every((b) => rateOf(b.market) != null)) {
    let wSum = 0;
    let rSum = 0;
    for (const b of borrowed) {
      const w = usdOf(b.address, b.amount);
      if (w == null || w <= 0) {
        wSum = 0;
        break;
      }
      wSum += w;
      rSum += (rateOf(b.market) as number) * w;
    }
    if (wSum > 0) borrowRate = { pct: (rSum / wSum) * 100, avg: true };
  }

  return {
    supplyInterestUsd: sideInterestUsd("supply", view, lifetime, usdOf),
    debtInterestUsd: sideInterestUsd("debt", view, lifetime, usdOf),
    borrowRate,
  };
}

export function computeMoonwellEconomics(
  view: MoonwellPositionView,
  events?: BaseActivityEvent[],
  vocab: MoonwellTowerVocabulary = MOONWELL_INDEXED_VOCABULARY,
  /** Lifetime sums reduced over the WHOLE history elsewhere (the Base sweep
   *  route). When given, `events` are not reduced here at all. */
  precomputedLifetime?: MarketFlows[],
): ChainTruthTowerData {
  const prices = view.priceByAddress;
  const usdOf = (address: string | undefined, amount: number): number | null => {
    if (!address) return null;
    const p = prices?.[address.toLowerCase()];
    return typeof p === "number" && p > 0 ? amount * p : null;
  };

  // Collateral: the current value (interest included) when the chain read
  // landed, the replayed principal otherwise — the provenance names the basis.
  const supplyLines: TowerLine[] = view.supplies
    .filter((r) => r.mTokens > 0)
    .map((r) => {
      const amount = r.current ?? r.principal;
      return {
        key: r.address,
        symbol: r.symbol,
        amount,
        usd: usdOf(r.address, amount),
        prov: r.current != null ? vocab.supplyCurrent(r) : vocab.supplyPrincipal(r),
      };
    })
    .filter((l) => l.amount > DUST);

  const debtLines: TowerLine[] = view.borrows
    .filter((r) => r.amount > 0)
    .map((r) => ({
      key: r.address,
      symbol: r.symbol,
      amount: r.amount,
      usd: usdOf(r.address, r.amount),
      // The live borrowBalanceStored lane when the detail page's chain read
      // upgraded this row; the emitted-accountBorrows lane otherwise.
      prov: vocab.debt(r),
    }));

  // ── Lifetime layer (needs the event stream, or the sums reduced upstream) ──
  const lifetime = precomputedLifetime
    ? precomputedLifetime.length > 0
      ? new Map(precomputedLifetime.map((f) => [f.market, f]))
      : null
    : events && events.length > 0
      ? replayMoonwellLifetime(events)
      : null;
  const flowLines = (
    pick: (r: MarketFlows) => number,
    flow: "withdrawn" | "repaid" | "liquidated debt",
    keyPrefix: string,
  ): TowerLine[] =>
    lifetime
      ? [...lifetime.values()]
          .filter((r) => pick(r) > DUST)
          .map((r) => ({
            key: `${keyPrefix}-${r.symbol}`,
            symbol: r.symbol,
            amount: pick(r),
            usd: usdOf(r.address, pick(r)),
            prov: vocab.lifetimeFlow(flow, r.symbol),
          }))
      : [];

  const collExited = flowLines((r) => r.withdrawn, "withdrawn", "coll-withdrawn");
  const debtExited = flowLines((r) => r.repaid, "repaid", "debt-repaid");
  const debtLiquidated = flowLines((r) => r.liquidatedDebt, "liquidated debt", "debt-liq");

  // Interest segment — only on a SINGLE-market debt side (one symbol, one
  // token amount; a cross-market token sum would be meaningless). The tower
  // stacks `current + interest` as the total, so when the split engages the
  // current line must DROP to the net event principal — the emitted
  // accountBorrows already includes the interest accrued to that event.
  let interest: TowerLine | null = null;
  if (lifetime && debtLines.length === 1) {
    const cur = debtLines[0];
    const f = [...lifetime.values()].find((r) => r.symbol === cur.symbol);
    // A net principal at or below zero means the wallet has already repaid
    // more than it ever drew — the interest it paid over its life exceeds what
    // it still owes. The subtraction would then put a NEGATIVE principal line
    // under a positive interest segment, which is arithmetic with no meaning
    // on a bar; the split stays off and the note explains the figure instead.
    if (f && f.borrowed - f.repaid - f.liquidatedDebt > DUST) {
      const net = f.borrowed - f.repaid - f.liquidatedDebt;
      const amt = legInterest(cur.amount, net, f.borrowed);
      if (amt > 0) {
        interest = {
          key: "debt-interest",
          symbol: cur.symbol,
          amount: amt,
          usd: usdOf(cur.key, amt),
          prov: vocab.debtInterest(cur.symbol, view.borrows.find((r) => r.amount > 0)?.live),
        };
        debtLines[0] = {
          ...cur,
          amount: net,
          usd: usdOf(cur.key, net),
          prov: vocab.debtPrincipal(cur.symbol),
        };
      }
    }
  }

  // Value the tower only when EVERY contributing line is oracle-priced — a strict
  // per-total guard. A single unpriced market drops it to the token gated list,
  // so a bar height is never a partial (misleading) USD figure.
  const contributing = [
    ...supplyLines,
    ...debtLines,
    ...collExited,
    ...debtExited,
    ...debtLiquidated,
    ...(interest ? [interest] : []),
  ];
  const valued = contributing.length > 0 && contributing.every((l) => l.usd != null);

  // Lifetime inflow (the faded side bar) — USD when valued; a token amount is
  // only meaningful when one market flowed, else suppressed.
  const inflow = (pick: (r: MarketFlows) => number): number => {
    if (!lifetime) return 0;
    const rows = [...lifetime.values()].filter((r) => pick(r) > DUST);
    if (rows.length === 0) return 0;
    if (valued) return rows.reduce((s, r) => s + (usdOf(r.address, pick(r)) ?? 0), 0);
    return rows.length === 1 ? pick(rows[0]) : 0;
  };

  return {
    valued,
    // On-chain oracle price → chain-derived, so the USD bars survive On-chain-values.
    priceKind: valued ? "chain-derived" : undefined,
    collateral: {
      current: supplyLines,
      interest: null,
      exited: collExited,
      liquidated: [],
      lifetimeInflow: inflow((r) => r.supplied),
    },
    debt: {
      current: debtLines,
      interest,
      exited: debtExited,
      liquidated: debtLiquidated,
      lifetimeInflow: inflow((r) => r.borrowed),
    },
    // The debt-side sentence depends on which basis the debt rows carry: the
    // live borrowBalanceStored (every row on Base, and Ethereum once its chain
    // lane lands) already includes the interest; the emitted accountBorrows
    // does not include any accrued since that event.
    interestNote:
      interest != null
        ? undefined
        : debtLines.length > 0 && view.borrows.filter((r) => r.amount > 0).every((r) => r.live)
          ? "Collateral is shown at its current value, interest included — the amount above the deposited total is interest earned. Debt is shown as it stands now, interest included; it is split into principal and accrued interest only when the position's whole history is in hand and the arithmetic lands inside its own bounds. USD values use Moonwell's own oracle price."
          : "Collateral is shown at its current value, interest included — the amount above the deposited total is interest earned. Debt is shown as it stood at the position's most recent borrow or repay, so interest built up since then isn't counted there yet. USD values use Moonwell's own oracle price.",
  };
}
