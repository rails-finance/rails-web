// Pure transform: one Aave-V3-architecture market's live reserve roster → the
// view model for the shared market-overview surface (/aave-v3/market,
// /spark/market). The V3-family sibling of lib/aave-v4/hub-view.ts, adjusted
// for the single-market reality: one summary (not a hub band) + per-reserve
// rows. Kept side-effect-free and out of the component so the aggregation
// logic is one readable place.
//
// Framing: present, don't rank (the hub-comparison rule carries across). Only
// descriptive aggregates — sizes, composition, utilisation, a supply-weighted
// LT. No score, no risk valence; rows sort by size by default and the reader
// re-sorts as they like.

import type { AaveMarketReserve } from "@/lib/api/fetch-aave-market-overview";
import { assetClass, ASSET_CLASS_TITLE, type AssetClass } from "@/lib/aave-v4/asset-class";

export interface MarketReserveRow extends AaveMarketReserve {
  cls: AssetClass;
  classLabel: string;
  /** USD sides; 0 when the oracle didn't price the reserve. */
  suppliedUsd: number;
  borrowedUsd: number;
  /** What each side's cap says, sentinels read (see capSide). */
  supplyCapState: CapState;
  borrowCapState: CapState;
  /** Every way this reserve is closed to new business; empty when open. */
  closed: ClosedRoute[];
}

// ── Caps ─────────────────────────────────────────────────────────────────────
// A cap field holds whole tokens, and two of its values are sentinels. 1 whole
// token is how Aave governance closes a side (30 supply and 44 borrow caps on
// Aave V3 Core at 2026-09-22); dividing use by it produces shares in the
// millions (GHO read 135,101,535× before this). 2^36 − 1, the largest value the
// 36-bit field holds, is SparkLend's way of saying no cap. Both are named here
// and never divided by.
//
// SparkLend's live caps are a moving step: its CapAutomator keeps each a short
// gap above use and raises it up to a maximum. The maximum is the size the
// market is allowed to reach, so use is measured against it; the live cap only
// applies where the automator holds no config for the reserve.

/** The largest value a 36-bit cap field holds — SparkLend's "no cap". */
export const CAP_FIELD_MAX = 2 ** 36 - 1;

export type CapState =
  /** No ceiling: the field is 0, or holds its largest value. */
  | { state: "none"; why: "zero" | "field-max"; basis: "live" | "automator" }
  /** A cap of one whole token: the side is closed. */
  | { state: "closed"; basis: "live" | "automator" }
  /** Borrowing is switched off; the borrow cap says nothing. */
  | { state: "off" }
  /** A real cap, and the share of it in use. */
  | {
      state: "used";
      used: number;
      /** The amount the Pool's cap check counts, token units. */
      amount: number;
      /** The ceiling measured against, whole tokens. */
      cap: number;
      basis: "live" | "automator";
      /** The live cap when the ceiling is the automator's maximum. */
      liveCap: number | null;
    };

/** One side's cap, read. Supply counts the aToken supply plus the treasury's
 *  unminted share, which is what the Pool's supply-cap check adds up. */
export function capSide(r: AaveMarketReserve, side: "supply" | "borrow"): CapState {
  if (side === "borrow" && !r.borrowEnabled) return { state: "off" };
  const live = side === "supply" ? r.supplyCap : r.borrowCap;
  const max = side === "supply" ? r.supplyCapMax : r.borrowCapMax;
  const amount = side === "supply" ? r.supplied + (r.accruedToTreasury ?? 0) : r.borrowed;
  const judge = (cap: number, basis: "live" | "automator"): CapState => {
    if (cap >= CAP_FIELD_MAX) return { state: "none", why: "field-max", basis };
    if (cap === 1) return { state: "closed", basis };
    return { state: "used", used: amount / cap, amount, cap, basis, liveCap: basis === "automator" ? live : null };
  };
  if (max != null && max > 0) return judge(max, "automator");
  if (live == null) return { state: "none", why: "zero", basis: "live" };
  return judge(live, "live");
}

// ── Closed to new business ───────────────────────────────────────────────────

export type ClosedRoute = "frozen" | "paused" | "borrowOff" | "supplyCapOne" | "borrowCapOne" | "ltvZero";

/** A loan-to-value of 0 on a reserve that still carries a threshold: existing
 *  positions keep counting it, and it backs no new borrowing — unless an eMode
 *  category lends it a loan-to-value of its own, in which case wallets in that
 *  category can still borrow against it. */
export function ltvZeroClosed(r: AaveMarketReserve): boolean {
  const ltvBps = r.bps?.ltv ?? (r.ltv != null ? 1 : 0);
  const ltBps = r.bps?.lt ?? (r.lt != null ? 1 : 0);
  if (ltvBps > 0 || ltBps === 0) return false;
  return !(r.emodeCategories ?? []).some((c) => (c.ltv ?? 0) > 0);
}

export function closedRoutes(r: AaveMarketReserve, supply: CapState, borrow: CapState): ClosedRoute[] {
  const out: ClosedRoute[] = [];
  if (r.frozen) out.push("frozen");
  if (r.paused) out.push("paused");
  if (!r.borrowEnabled) out.push("borrowOff");
  if (supply.state === "closed") out.push("supplyCapOne");
  if (borrow.state === "closed") out.push("borrowCapOne");
  if (ltvZeroClosed(r)) out.push("ltvZero");
  return out;
}

export interface AaveMarketView {
  /** Market identity — supplied by the page (e.g. "Aave V3 Core"). */
  label: string;
  /** Neutral, descriptive one-liner — what the market is, not how good it is. */
  purpose: string;
  /** Protocol id — selects the market-surface provenance vocabulary. */
  protocol: string;
  /** The head block the reserves were read at — the receipts' citable coord. */
  blockNumber: number;
  /** The live Pool + IAaveOracle addresses the surface read from (the exact
   *  contracts every receipt cites). */
  pool: string;
  oracle: string;
  /** SparkLend's CapAutomator, when the payload names one. */
  capAutomator?: string;
  suppliedUsd: number;
  borrowedUsd: number;
  reserveCount: number;
  /** Supply composition by asset class, descending, ≥1% only. */
  composition: { cls: AssetClass; label: string; pct: number }[];
  rows: MarketReserveRow[];
}

/** Build the market view from the chain payload's reserves. */
export function buildAaveMarketView(
  reserves: AaveMarketReserve[],
  identity: {
    label: string;
    purpose: string;
    protocol: string;
    blockNumber: number;
    pool: string;
    oracle: string;
    capAutomator?: string;
  },
): AaveMarketView {
  const rows: MarketReserveRow[] = reserves.map((r) => {
    const cls = assetClass(r.symbol);
    const supplyCapState = capSide(r, "supply");
    const borrowCapState = capSide(r, "borrow");
    return {
      ...r,
      cls,
      classLabel: ASSET_CLASS_TITLE[cls],
      suppliedUsd: r.priceUsd != null ? r.supplied * r.priceUsd : 0,
      borrowedUsd: r.priceUsd != null ? r.borrowed * r.priceUsd : 0,
      supplyCapState,
      borrowCapState,
      closed: closedRoutes(r, supplyCapState, borrowCapState),
    };
  });

  rows.sort((a, b) => b.suppliedUsd - a.suppliedUsd || b.supplied - a.supplied);

  const suppliedUsd = rows.reduce((s, r) => s + r.suppliedUsd, 0);
  const borrowedUsd = rows.reduce((s, r) => s + r.borrowedUsd, 0);

  // Composition by class, weighted by supplied USD.
  const byClass = new Map<AssetClass, number>();
  for (const r of rows) byClass.set(r.cls, (byClass.get(r.cls) ?? 0) + r.suppliedUsd);
  const composition =
    suppliedUsd > 0
      ? [...byClass.entries()]
          .map(([cls, usd]) => ({ cls, label: ASSET_CLASS_TITLE[cls], pct: Math.round((usd / suppliedUsd) * 100) }))
          .filter((c) => c.pct >= 1)
          .sort((a, b) => b.pct - a.pct)
      : [];

  return {
    label: identity.label,
    purpose: identity.purpose,
    protocol: identity.protocol,
    blockNumber: identity.blockNumber,
    pool: identity.pool,
    oracle: identity.oracle,
    capAutomator: identity.capAutomator,
    suppliedUsd,
    borrowedUsd,
    reserveCount: rows.length,
    composition,
    rows,
  };
}

/**
 * A neutral, plain-language synthesis of the market's supply: dominant asset
 * class(es), concentration across reserves, and the supply-weighted liquidation
 * threshold. Same grammar as the hub cards' hubSummaryText — strictly
 * descriptive, no verdicts. Returns null when there is no supply to describe.
 */
export function marketSummaryText(view: AaveMarketView): string | null {
  if (view.suppliedUsd <= 0 || view.composition.length === 0) return null;

  const c0 = view.composition[0];
  const c1 = view.composition[1];
  const classClause =
    c1 && c1.pct >= 15
      ? `${c0.pct}% ${c0.label.toLowerCase()}, ${c1.pct}% ${c1.label.toLowerCase()}`
      : `${c0.pct}% ${c0.label.toLowerCase()}`;
  const parts = [`Supply is ${classClause}.`];

  // Concentration — the smallest set of top reserves covering ≥80% of supply.
  const supplied = view.rows.filter((r) => r.suppliedUsd > 0);
  if (supplied.length > 3) {
    let cum = 0;
    let k = 0;
    for (const r of supplied) {
      cum += r.suppliedUsd;
      k += 1;
      if (cum / view.suppliedUsd >= 0.8) break;
    }
    parts.push(`Top ${k} of ${supplied.length} reserves hold ${Math.round((cum / view.suppliedUsd) * 100)}% of it.`);
  }

  // Supply-weighted liquidation threshold across reserves that carry one.
  let ltUsd = 0;
  let ltWeighted = 0;
  for (const r of view.rows) {
    if (r.suppliedUsd <= 0 || r.lt == null) continue;
    ltWeighted += r.suppliedUsd * r.lt;
    ltUsd += r.suppliedUsd;
  }
  if (ltUsd > 0) parts.push(`Supply-weighted LT ${((ltWeighted / ltUsd) * 100).toFixed(1)}%.`);

  const closed = closedText(view.rows);
  if (closed) parts.push(closed);

  return parts.join(" ");
}

/** How many reserves are closed to new business, and by which routes. A
 *  reserve closed two ways counts once in the total; the routes after the
 *  colon each count every reserve they close, so they can add up to more. */
export function closedText(rows: MarketReserveRow[]): string | null {
  const closed = rows.filter((r) => r.closed.length > 0);
  if (closed.length === 0) return null;
  const n = (route: ClosedRoute | ClosedRoute[]) => {
    const set = Array.isArray(route) ? route : [route];
    return rows.filter((r) => r.closed.some((c) => set.includes(c))).length;
  };
  const routes = [
    [n("frozen"), "frozen"],
    [n("paused"), "paused"],
    [n("borrowOff"), "with borrowing switched off"],
    [n(["supplyCapOne", "borrowCapOne"]), "with a cap of one token"],
    [n("ltvZero"), "backing no new borrowing at a loan-to-value of 0"],
  ] as const;
  const listed = routes.filter(([k]) => k > 0).map(([k, what]) => `${k} ${what}`);
  const total = rows.length;
  const head =
    closed.length === total
      ? `All ${total} reserves are closed to some new business`
      : `${closed.length} of ${total} reserves ${closed.length === 1 ? "is" : "are"} closed to some new business`;
  return `${head}: ${listed.join(", ")}. A reserve closed more than one way counts once.`;
}
