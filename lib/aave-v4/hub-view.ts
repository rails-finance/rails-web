// Pure transform: raw cross-hub credit lines (+ a price map) → a per-hub view
// model for the /aave-v4/hubs comparison surface. Kept side-effect-free and out
// of the component so the aggregation logic is one readable place.
//
// Framing: present, don't rank (see aave-v4-hub-comparison.md). This
// module computes only descriptive aggregates — sizes, composition, utilisation,
// LT ranges. No score, no ordering by a risk metric (hubs stay in canonical
// order). Utilisation is a ratio, rendered with a single neutral fill.
//
// Unit reconciliation (see fetch-aave-v4-hubs): caps are whole-token units;
// addedAssets / totalOwed are raw (full `decimals`). We divide the raw amounts
// by 10^decimals to get token units, then both sides share a unit for util and
// price for USD. Number() on the big raw strings loses only sub-display digits.

import type { AaveV4HubsResponse, HubCreditLine, HubTierKey } from "@/lib/api/fetch-aave-v4-hubs";
import { assetClass, ASSET_CLASS_TITLE, type AssetClass } from "@/lib/aave-v4/asset-class";
import { SPOKE_ADDRESS_BY_KEY } from "@/lib/aave-v4/spoke-meta";

/** uint40 max — the protocol's "uncapped" sentinel (MAX_ALLOWED_SPOKE_CAP). */
const MAX_CAP = 1_099_511_627_775;

export interface HubAssetAgg {
  symbol: string;
  underlying: string;
  cls: AssetClass;
  classLabel: string;
  /** LT range across the spokes that list it; equal min/max when uniform. */
  ltMin: number | null;
  ltMax: number | null;
  /** Token amounts (supplied / borrowed), summed across spokes. */
  supplied: number;
  borrowed: number;
  suppliedUsd: number;
  borrowedUsd: number;
  price: number | null;
  /** Aggregate caps (whole tokens). null when every line is uncapped. */
  addCap: number | null;
  drawCap: number | null;
  /** Ratios in [0,∞); null when the corresponding cap is 0 or uncapped. */
  supplyUtil: number | null;
  drawUtil: number | null;
  spokeCount: number;
  anyHalted: boolean;
  /** bool_or of canBorrow across spokes; null when config not yet indexed. */
  canBorrow: boolean | null;
  /** Current variable borrow rate (the hub's drawnRate) as a decimal fraction
   *  (0.05 = 5%); null until the rate pipeline has seen this (hub, asset). */
  borrowApr: number | null;
  /** Supplier yield, derived: borrowApr × utilisation × (1 − liquidityFee),
   *  utilisation = drawn/supplied at hub level. null when borrowApr is unknown
   *  or nothing is supplied. 0 is legitimate (asset supplied but not drawn). */
  supplyApr: number | null;
  /** Liquidity fee (V4 reserve factor) as a decimal fraction (0.10 = 10%). */
  liquidityFee: number;
  /** The per-spoke reads behind the aggregated LT range — one entry per spoke
   *  that lists this asset in this hub, carrying the LT it contributed to the
   *  min/max. Backs the hub-provenance receipts, whose leaves name the spoke
   *  each read came from. The hubs API carries only the spoke slug + display
   *  name (no contract address); `address` is looked up from
   *  SPOKE_ADDRESS_BY_KEY (a stable on-chain constant, not indexer output) and
   *  is undefined for a spoke with no deployed address on record (Treasury). */
  spokeLeaves: { slug: string; name: string; lt: number | null; address?: string }[];
  /** The spoke whose line supplied borrowApr / liquidityFee (the non-null seen
   *  in the group). The rate is presented as the hub's, on the assumption the
   *  group's spokes agree; this names which line it was actually lifted from.
   *  `address` is the same SPOKE_ADDRESS_BY_KEY lookup as spokeLeaves. */
  rateSourceSpoke: { slug: string; name: string; address?: string } | null;
}

export interface HubView {
  hub: HubTierKey;
  label: string;
  purpose: string;
  positionCount: number;
  suppliedUsd: number;
  borrowedUsd: number;
  /** Collateral composition by asset class, descending, ≥1% only. */
  composition: { cls: AssetClass; label: string; pct: number }[];
  assets: HubAssetAgg[];
  /** Member spokes, sorted by display name. `slug` is the listing's `?spokes=`
   *  param value (e.g. `ethena_corr`), so each pill can link straight into the
   *  filtered listing. */
  spokes: { slug: string; name: string; halted: boolean }[];
}

export const HUB_LABEL: Record<HubTierKey, string> = {
  core: "Core",
  plus: "Plus",
  prime: "Prime",
  paxos: "Global Dollar",
};

// Canonical spoke display names, keyed by the spoke slug (l.spoke). Applied to
// the summary-card pills so /aave-v4/hubs shows the Aave-official name even
// before the server naming deploy lands — the server still emits the old
// `spokeName` until then, and this surface owns its labels (same as the listing
// filter dropdown). Only spokes whose display name we've deliberately renamed
// need an entry; everything else falls through to the server's spokeName.
const SPOKE_NAME_OVERRIDE: Partial<Record<string, string>> = {
  // Spoke "Global Dollar" → "Stablecoin Correlated" (the hub is "Global Dollar").
  usdg_pendle: "Stablecoin Correlated",
};

// Neutral, descriptive one-liners — what the hub is for, not how good it is.
export const HUB_PURPOSE: Record<HubTierKey, string> = {
  core: "The broadest market, and the shared liquidity backbone other spokes draw stablecoins from.",
  plus: "Stablecoin-strategy markets — Ethena dollars and correlated yield collateral.",
  prime: "A tightly-scoped market for bluechip collateral.",
  paxos: "The Global Dollar (USDG) market — PT-USDG collateral against USDC, USDT, and USDG borrows.",
};

function toTokens(raw: string, decimals: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n === 0) return 0;
  return n / 10 ** decimals;
}

function capValue(whole: string): number | null {
  const n = Number(whole);
  if (!Number.isFinite(n)) return null;
  if (n >= MAX_CAP) return null; // uncapped sentinel
  return n;
}

/** Aggregate one hub's credit lines into per-asset rows + hub totals. */
function buildHubView(
  hub: HubTierKey,
  lines: HubCreditLine[],
  prices: Record<string, number>,
  positionCount: number,
): HubView {
  // Group lines by asset (symbol). A spoke can list the same asset under one
  // line per hub, so (symbol) is the right key within a single hub.
  const bySymbol = new Map<string, HubCreditLine[]>();
  for (const l of lines) {
    const arr = bySymbol.get(l.symbol);
    if (arr) arr.push(l);
    else bySymbol.set(l.symbol, [l]);
  }

  const assets: HubAssetAgg[] = [];
  for (const [symbol, group] of bySymbol) {
    const underlying = group[0].underlying;
    const decimals = group[0].decimals;
    const price = prices[underlying.toLowerCase()] ?? null;

    let supplied = 0;
    let borrowed = 0;
    let addCapSum = 0;
    let drawCapSum = 0;
    let anyAddCapped = false;
    let anyDrawCapped = false;
    let ltMin: number | null = null;
    let ltMax: number | null = null;
    let anyHalted = false;
    let canBorrow: boolean | null = null;
    // Borrow rate + liquidity fee are per (hub, asset) — identical across the
    // group's spokes — so capture the first non-null we see.
    let borrowRateRay: string | null = null;
    let liquidityFeeBps = 0;
    let rateSourceSpoke: { slug: string; name: string; address?: string } | null = null;
    const spokes = new Set<string>();
    // One leaf per spoke that lists this asset (deduped by slug), carrying the
    // LT it contributed. Keyed by slug so a spoke appearing twice is one leaf,
    // keeping the leaf count equal to spokeCount.
    const leafMap = new Map<string, { slug: string; name: string; lt: number | null; address?: string }>();

    for (const l of group) {
      spokes.add(l.spoke);
      if (!leafMap.has(l.spoke)) {
        leafMap.set(l.spoke, {
          slug: l.spoke,
          name: SPOKE_NAME_OVERRIDE[l.spoke] ?? l.spokeName,
          lt: l.lt,
          address: SPOKE_ADDRESS_BY_KEY[l.spoke],
        });
      }
      supplied += toTokens(l.addedAssets, decimals);
      borrowed += toTokens(l.totalOwed, decimals);
      const ac = capValue(l.addCap);
      const dc = capValue(l.drawCap);
      if (ac != null) {
        addCapSum += ac;
        anyAddCapped = true;
      }
      if (dc != null) {
        drawCapSum += dc;
        anyDrawCapped = true;
      }
      if (l.lt != null) {
        ltMin = ltMin == null ? l.lt : Math.min(ltMin, l.lt);
        ltMax = ltMax == null ? l.lt : Math.max(ltMax, l.lt);
      }
      if (l.halted) anyHalted = true;
      if (l.canBorrow != null) canBorrow = (canBorrow ?? false) || l.canBorrow;
      if (l.borrowRate != null) {
        borrowRateRay = l.borrowRate;
        rateSourceSpoke = {
          slug: l.spoke,
          name: SPOKE_NAME_OVERRIDE[l.spoke] ?? l.spokeName,
          address: SPOKE_ADDRESS_BY_KEY[l.spoke],
        };
      }
      if (l.liquidityFeeBps) liquidityFeeBps = l.liquidityFeeBps;
    }
    const spokeLeaves = [...leafMap.values()].sort((a, b) => a.name.localeCompare(b.name));

    const addCap = anyAddCapped ? addCapSum : null;
    const drawCap = anyDrawCapped ? drawCapSum : null;

    // Rates. Borrow rate is the hub's drawnRate (ray). Supplier yield is the
    // standard pool identity: borrowApr × utilisation × (1 − fee), where
    // utilisation is drawn/supplied at the hub (actual amounts, not caps).
    const borrowApr = borrowRateRay != null ? Number(borrowRateRay) / 1e27 : null;
    const liquidityFee = liquidityFeeBps / 10_000;
    const rateUtil = supplied > 0 ? borrowed / supplied : 0;
    const supplyApr = borrowApr != null && supplied > 0 ? borrowApr * rateUtil * (1 - liquidityFee) : null;
    assets.push({
      symbol,
      underlying,
      cls: assetClass(symbol),
      classLabel: ASSET_CLASS_TITLE[assetClass(symbol)],
      ltMin,
      ltMax,
      supplied,
      borrowed,
      suppliedUsd: price != null ? supplied * price : 0,
      borrowedUsd: price != null ? borrowed * price : 0,
      price,
      addCap,
      drawCap,
      supplyUtil: addCap && addCap > 0 ? supplied / addCap : null,
      drawUtil: drawCap && drawCap > 0 ? borrowed / drawCap : null,
      spokeCount: spokes.size,
      anyHalted,
      canBorrow,
      borrowApr,
      supplyApr,
      liquidityFee,
      spokeLeaves,
      rateSourceSpoke,
    });
  }

  assets.sort((a, b) => b.suppliedUsd - a.suppliedUsd || b.supplied - a.supplied);

  const suppliedUsd = assets.reduce((s, a) => s + a.suppliedUsd, 0);
  const borrowedUsd = assets.reduce((s, a) => s + a.borrowedUsd, 0);

  // Composition by class, weighted by supplied USD.
  const byClass = new Map<AssetClass, number>();
  for (const a of assets) byClass.set(a.cls, (byClass.get(a.cls) ?? 0) + a.suppliedUsd);
  const composition =
    suppliedUsd > 0
      ? [...byClass.entries()]
          .map(([cls, usd]) => ({ cls, label: ASSET_CLASS_TITLE[cls], pct: Math.round((usd / suppliedUsd) * 100) }))
          .filter((c) => c.pct >= 1)
          .sort((a, b) => b.pct - a.pct)
      : [];

  // One entry per spoke in this hub. A spoke is "halted" here if any of its
  // lines in this hub is halted.
  const spokeMap = new Map<string, { slug: string; name: string; halted: boolean }>();
  for (const l of lines) {
    const prev = spokeMap.get(l.spoke);
    if (prev) prev.halted = prev.halted || l.halted;
    else spokeMap.set(l.spoke, { slug: l.spoke, name: SPOKE_NAME_OVERRIDE[l.spoke] ?? l.spokeName, halted: l.halted });
  }
  const spokes = [...spokeMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  return {
    hub,
    label: HUB_LABEL[hub],
    purpose: HUB_PURPOSE[hub],
    positionCount,
    suppliedUsd,
    borrowedUsd,
    composition,
    assets,
    spokes,
  };
}

/** Build all hub views in canonical order from the API payload + a price map
 *  (keyed by lowercase token address — i.e. the prices-context PriceMap). */
export function buildHubViews(data: AaveV4HubsResponse, prices: Record<string, number>): HubView[] {
  const byHub = new Map<HubTierKey, HubCreditLine[]>();
  for (const l of data.lines) {
    const arr = byHub.get(l.hub);
    if (arr) arr.push(l);
    else byHub.set(l.hub, [l]);
  }
  return data.hubs.map((hub) => buildHubView(hub, byHub.get(hub) ?? [], prices, data.positionCounts?.[hub] ?? 0));
}

/** All distinct underlying addresses in the payload — for useRequestPrices. */
export function hubUnderlyings(data: AaveV4HubsResponse): string[] {
  return [...new Set(data.lines.map((l) => l.underlying.toLowerCase()))];
}

/**
 * A neutral, plain-language synthesis of a hub's supply: the dominant asset
 * class(es), how concentrated supply is across assets, and the supply-weighted
 * liquidation threshold. Adds the two facts the composition bar and per-asset
 * list don't give at a glance — concentration and a single portfolio LT.
 *
 * Strictly descriptive (present, don't rank — see aave-v4-hub-
 * comparison.md): no "risky"/"safe", no verdict, just stated figures. Returns
 * null when the hub has no supply to describe.
 */
export function hubSummaryText(view: HubView): string | null {
  if (view.suppliedUsd <= 0 || view.composition.length === 0) return null;

  // Lead class, plus a second only when it's a meaningful share — otherwise the
  // sentence reads as a single dominant class.
  const c0 = view.composition[0];
  const c1 = view.composition[1];
  const classClause =
    c1 && c1.pct >= 15
      ? `${c0.pct}% ${c0.label.toLowerCase()}, ${c1.pct}% ${c1.label.toLowerCase()}`
      : `${c0.pct}% ${c0.label.toLowerCase()}`;
  const parts = [`Supply is ${classClause}.`];

  // Concentration — the smallest set of top assets covering ≥80% of supply.
  // Only worth stating when there are enough assets that it isn't obvious from
  // the (short) per-asset list itself.
  const supplied = view.assets.filter((a) => a.suppliedUsd > 0);
  if (supplied.length > 3) {
    let cum = 0;
    let k = 0;
    for (const a of supplied) {
      cum += a.suppliedUsd;
      k += 1;
      if (cum / view.suppliedUsd >= 0.8) break;
    }
    parts.push(`Top ${k} of ${supplied.length} assets hold ${Math.round((cum / view.suppliedUsd) * 100)}% of it.`);
  }

  // The supply-weighted LT clause is rendered separately by the card (it carries
  // its own provenance receipt), so it is NOT joined into this prose — see
  // hubSupplyWeightedLt.
  return parts.join(" ");
}

/** A hub's supply-weighted liquidation threshold across the assets that carry
 *  one — each asset entering as the MIDPOINT of its LT range (named so, not "the
 *  LT"; see the receipt), weighted by supplied USD (supply, not strictly
 *  collateral — see "Supply mix"). Returns the figure plus the USD weight base,
 *  or null when no supplied asset carries an LT. Split out of hubSummaryText so
 *  the card can render it as its own traced value. */
export function hubSupplyWeightedLt(view: HubView): { lt: number; weightUsd: number } | null {
  let ltUsd = 0;
  let ltWeighted = 0;
  for (const a of view.assets) {
    if (a.suppliedUsd <= 0 || a.ltMin == null || a.ltMax == null) continue;
    ltWeighted += a.suppliedUsd * ((a.ltMin + a.ltMax) / 2);
    ltUsd += a.suppliedUsd;
  }
  if (ltUsd <= 0) return null;
  return { lt: ltWeighted / ltUsd, weightUsd: ltUsd };
}
