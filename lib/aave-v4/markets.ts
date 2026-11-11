// Aave V4 markets (ui-jobs 548): the spokes as markets, a spoke reserve as one
// asset on one spoke drawn from one hub, and the hubs behind them. Pure: the
// stored payloads (`/api/aave-v4/hubs` on Ethereum, `/api/aave-v4-base/reserves`
// on Base) become one list of spoke lines, and a head read of one spoke reserve
// (`/api/at-block/aave-v4/reserve`) settles into the figures its pages draw.
//
// Rules:
// - A spoke's reserve is keyed (underlying, hub); a token a spoke lists from two
//   hubs is two reserves, and its reserve URL names the hub (`?hub=`).
// - Utilisation is the hub's: drawn ÷ (drawn + liquidity), the strategy's usage.
// - Supply rate = drawn rate × utilisation × (1 + premium ÷ drawn) × (1 − liquidity fee).
// - Borrow rate is the drawn rate; the premium is named beside it.
// - Available = min(hub liquidity, draw cap − what the spoke owes).

import { HUB_ORDER, type AaveV4HubsResponse, type HubTierKey } from "@/lib/api/fetch-aave-v4-hubs";
import type { V4ReserveHead } from "@/lib/api/fetch-aave-v4-reserve";
import { assetClass, type AssetClass } from "@/lib/aave-v4/asset-class";
import { spokeFromSlug, spokeSlugOfKey } from "@/lib/aave-v4/spoke-meta";
import type { ServerRead } from "@/lib/shared/server-head-read";
import type { ArcMarketsRead } from "@/lib/aave-v4-arc/types";

export type V4HubKey = HubTierKey | "equities";

export const V4_HUB_LABEL: Record<V4HubKey, string> = {
  core: "Core",
  plus: "Plus",
  prime: "Prime",
  paxos: "Global Dollar",
  equities: "Equities",
};

export const V4_HUB_ORDER: V4HubKey[] = [...HUB_ORDER, "equities"];

export const isV4HubKey = (x: unknown): x is V4HubKey =>
  typeof x === "string" && (V4_HUB_ORDER as string[]).includes(x);

/** One deployment's routes. */
export interface V4Deployment {
  chainId: 1 | 8453 | 5042;
  chain: "ethereum" | "base" | "arc";
  /** The explorer's root: "/ethereum/aave-v4". */
  root: string;
}

export const V4_ETHEREUM: V4Deployment = { chainId: 1, chain: "ethereum", root: "/ethereum/aave-v4" };
export const V4_BASE: V4Deployment = { chainId: 8453, chain: "base", root: "/base/aave-v4" };
export const V4_ARC: V4Deployment = { chainId: 5042, chain: "arc", root: "/arc/aave-v4" };
export const v4Deployment = (chain: string): V4Deployment =>
  chain === "base" ? V4_BASE : chain === "arc" ? V4_ARC : V4_ETHEREUM;
/** Whether the deployment's figures are read from the chain when a page opens (Arc), with no store behind them. */
export const readOnVisit = (d: V4Deployment) => d.chain === "arc";

/** uint40 max: the hub's "no cap" (MAX_ALLOWED_SPOKE_CAP). */
const MAX_CAP = 1_099_511_627_775;
const RAY = 1e27;

/** A cap in whole tokens, null where the hub set none. */
export function capOf(whole: string | number | null | undefined): number | null {
  const n = Number(whole);
  if (whole == null || !Number.isFinite(n) || n >= MAX_CAP) return null;
  return n;
}

const tokens = (raw: string | null | undefined, decimals: number): number => {
  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? n / 10 ** decimals : 0;
};

/** One spoke reserve as stored: the hub's line for the spoke and the spoke's terms. */
export interface V4Line {
  hub: V4HubKey;
  spokeKey: string;
  spokeSlug: string;
  spokeName: string;
  symbol: string;
  /** Lowercased. */
  underlying: string;
  decimals: number;
  cls: AssetClass;
  /** The spoke's collateral factor, a fraction; null where it is 0. */
  collateralFactor: number | null;
  /** The block the factor was read at, where known. */
  cfBlock?: number;
  /** Whole tokens; null where uncapped. */
  addCap: number | null;
  drawCap: number | null;
  /** Token amounts: the hub's added assets and total owed for this spoke. */
  supplied: number;
  borrowed: number;
  active: boolean | null;
  halted: boolean | null;
  borrowable: boolean | null;
  /** The hub's drawn rate, a fraction a year; null until the rate pipeline has it. */
  drawnApr: number | null;
  /** The hub's liquidity fee, a fraction; null where the store does not hold it. */
  liquidityFee: number | null;
  /** Arc: the spoke oracle's price, read with the line at the head. */
  held?: { price: number; block: number; priceSource: string | null };
  /** Base: the stored row's oracle price and the facts only Base stores. */
  base?: {
    reserveId: number;
    block: number;
    price: number;
    priceSource: string | null;
    feedDescription: string | null;
    feedUpdatedAt: number | null;
    readTs: number;
    paused: boolean;
    frozen: boolean;
    registryPaused: boolean | null;
    maxLiquidationBonusBps: number | null;
    liquidationFeeBps: number | null;
  };
}

export interface V4Spoke {
  key: string;
  slug: string;
  name: string;
  /** The hubs it has lines on, in hub order. */
  hubs: V4HubKey[];
  lines: V4Line[];
  /** Open positions; null where the store does not count them. */
  positions: number | null;
}

/** A deployment's stored lines, by spoke. */
export interface V4Stored {
  d: V4Deployment;
  block: number | null;
  /** When the store last read the chain (ISO), or the row's block time. */
  readAt: string | null;
  lines: V4Line[];
  spokes: V4Spoke[];
  /** Hub key → per-hub open positions (Ethereum). */
  hubPositions: Partial<Record<V4HubKey, number>>;
}

function spokesOf(lines: V4Line[], positions: (key: string) => number | null): V4Spoke[] {
  const by = new Map<string, V4Line[]>();
  for (const l of lines) by.set(l.spokeKey, [...(by.get(l.spokeKey) ?? []), l]);
  return [...by.entries()].map(([key, ls]) => ({
    key,
    slug: ls[0].spokeSlug,
    name: ls[0].spokeName,
    hubs: V4_HUB_ORDER.filter((h) => ls.some((l) => l.hub === h)),
    lines: ls,
    positions: positions(key),
  }));
}

/** Ethereum's stored lines (`/api/aave-v4/hubs`). */
export function storedFromHubs(data: AaveV4HubsResponse & { spokePositionCounts?: Record<string, number> }): V4Stored {
  const lines: V4Line[] = data.lines.map((l) => {
    const slug = spokeSlugOfKey(l.spoke, l.spokeName);
    return {
      hub: l.hub,
      spokeKey: l.spoke,
      spokeSlug: slug,
      spokeName: spokeFromSlug(slug) ?? l.spokeName,
      symbol: l.symbol,
      underlying: l.underlying.toLowerCase(),
      decimals: l.decimals,
      cls: assetClass(l.symbol),
      collateralFactor: l.lt,
      cfBlock: l.ltBlock,
      addCap: capOf(l.addCap),
      drawCap: capOf(l.drawCap),
      supplied: tokens(l.addedAssets, l.decimals),
      borrowed: tokens(l.totalOwed, l.decimals),
      active: l.active,
      halted: l.halted,
      borrowable: l.canBorrow,
      drawnApr: l.borrowRate != null ? Number(l.borrowRate) / RAY : null,
      liquidityFee: l.liquidityFeeBps / 10_000,
    };
  });
  return {
    d: V4_ETHEREUM,
    block: data.blockNumber,
    readAt: data.updatedAt,
    lines,
    spokes: spokesOf(lines, (k) => data.spokePositionCounts?.[k] ?? null),
    hubPositions: data.positionCounts,
  };
}

/** Base's stored reserves (`/api/aave-v4-base/reserves`). */
export interface V4BaseReserves {
  spokes: {
    spoke: string;
    name: string;
    hubName: string | null;
    address: string;
    targetHealthFactor: number;
    healthFactorForMaxBonus: number;
    liquidationBonusFactorBps: number;
    openPositions: number;
    positionsWithDebt: number;
    blockNumber?: number;
    blockTimestamp?: number;
  }[];
  reserves: {
    spoke: string;
    reserveId: number;
    underlying: string;
    symbol: string | null;
    decimals: number;
    hub: string;
    collateralFactorBps: number | null;
    maxLiquidationBonusBps: number | null;
    liquidationFeeBps: number | null;
    paused: boolean;
    frozen: boolean;
    registryPaused: boolean | null;
    borrowable: boolean;
    addCap: string | null;
    drawCap: string | null;
    spokeActive: boolean | null;
    spokeHalted: boolean | null;
    addedRaw: string | null;
    owedRaw: string | null;
    drawnRateRay: string | null;
    priceRaw: string;
    priceDecimals: number;
    priceSource?: string | null;
    feedDescription?: string | null;
    feedUpdatedAt: number | null;
    blockNumber: number;
    blockTimestamp: number;
  }[];
}

export function storedFromBase(data: V4BaseReserves): V4Stored {
  const spoke = data.spokes[0];
  const lines: V4Line[] = data.reserves.map((r) => {
    const symbol = r.symbol ?? "???";
    return {
      hub: "equities",
      spokeKey: r.spoke,
      spokeSlug: spokeSlugOfKey(r.spoke, spoke?.name),
      spokeName: spoke?.name ?? r.spoke,
      symbol,
      underlying: r.underlying.toLowerCase(),
      decimals: r.decimals,
      cls: assetClass(symbol),
      collateralFactor: r.collateralFactorBps ? r.collateralFactorBps / 10_000 : null,
      cfBlock: r.blockNumber,
      addCap: capOf(r.addCap),
      drawCap: capOf(r.drawCap),
      supplied: tokens(r.addedRaw, r.decimals),
      borrowed: tokens(r.owedRaw, r.decimals),
      active: r.spokeActive,
      halted: r.spokeHalted,
      borrowable: r.borrowable,
      drawnApr: r.drawnRateRay != null ? Number(r.drawnRateRay) / RAY : null,
      liquidityFee: null,
      base: {
        reserveId: r.reserveId,
        block: r.blockNumber,
        price: Number(r.priceRaw) / 10 ** r.priceDecimals,
        priceSource: r.priceSource ?? null,
        feedDescription: r.feedDescription ?? null,
        feedUpdatedAt: r.feedUpdatedAt,
        readTs: r.blockTimestamp,
        paused: r.paused,
        frozen: r.frozen,
        registryPaused: r.registryPaused,
        maxLiquidationBonusBps: r.maxLiquidationBonusBps,
        liquidationFeeBps: r.liquidationFeeBps,
      },
    };
  });
  const first = data.reserves[0];
  return {
    d: V4_BASE,
    block: first?.blockNumber ?? null,
    readAt: first ? new Date(first.blockTimestamp * 1000).toISOString() : null,
    lines,
    spokes: spokesOf(lines, (k) => data.spokes.find((s) => s.spoke === k)?.openPositions ?? null),
    hubPositions: { equities: spoke?.openPositions ?? 0 },
  };
}

/** Arc's lines (`/api/at-block/aave-v4-arc/markets`), read at the head when the page opens. */
export function storedFromArc(data: ArcMarketsRead): V4Stored {
  const name = new Map(data.spokes.map((sp) => [sp.key, sp.name]));
  const dec = new Map(data.spokes.map((sp) => [sp.key, sp.priceDecimals]));
  const fee = new Map(data.assets.map((a) => [a.assetId, a.liquidityFee]));
  const rate = new Map(data.assets.map((a) => [a.assetId, a.drawnRate]));
  const lines: V4Line[] = data.reserves.map((r) => {
    const f = fee.get(r.assetId);
    const dr = rate.get(r.assetId);
    return {
      hub: "core",
      spokeKey: r.spoke,
      spokeSlug: r.spoke,
      spokeName: name.get(r.spoke) ?? r.spoke,
      symbol: r.symbol,
      underlying: r.underlying.toLowerCase(),
      decimals: r.decimals,
      cls: assetClass(r.symbol),
      collateralFactor: r.collateralFactor ? r.collateralFactor / 10_000 : null,
      cfBlock: data.head.block,
      addCap: capOf(r.addCap),
      drawCap: capOf(r.drawCap),
      supplied: tokens(r.spokeAdded, r.decimals),
      borrowed: tokens(r.spokeOwed, r.decimals),
      active: r.active,
      halted: r.halted,
      borrowable: r.borrowable,
      drawnApr: dr != null ? Number(dr) / RAY : null,
      liquidityFee: f != null ? f / 10_000 : null,
      held:
        r.price != null
          ? {
              price: Number(r.price) / 10 ** (dec.get(r.spoke) ?? 8),
              block: data.head.block,
              priceSource: r.priceSource,
            }
          : undefined,
    };
  });
  return {
    d: V4_ARC,
    block: data.head.block,
    readAt: new Date(data.head.time * 1000).toISOString(),
    lines,
    spokes: spokesOf(lines, () => null),
    hubPositions: {},
  };
}

// ── Links ────────────────────────────────────────────────────────────────────

export const marketsHref = (d: V4Deployment) => `${d.root}/markets`;
export const spokeHref = (d: V4Deployment, slug: string) => `${d.root}/markets/${slug}`;
export const hubsHref = (d: V4Deployment) => `${d.root}/hubs`;
/** The listing filtered to one spoke. */
export const spokePositionsHref = (d: V4Deployment, key: string) =>
  d.chain === "ethereum" ? `${d.root}?spokes=${key}` : d.root;

/** Whether a spoke lists `underlying` from more than one hub. */
export const listedTwice = (spoke: V4Spoke, underlying: string) =>
  spoke.lines.filter((l) => l.underlying === underlying.toLowerCase()).length > 1;

/** A reserve page: `?hub=` where the spoke lists the token from two hubs. */
export function reserveHref(d: V4Deployment, spoke: V4Spoke, l: Pick<V4Line, "underlying" | "hub">): string {
  const base = `${spokeHref(d, spoke.slug)}/${l.underlying.toLowerCase()}`;
  return listedTwice(spoke, l.underlying) ? `${base}?hub=${l.hub}` : base;
}

/** "Core and Prime", "Core, Plus and Prime". */
export function andList(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

// ── A head read, settled ─────────────────────────────────────────────────────

const num = (s: string | null | undefined): number | null => {
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const bps = (s: string | null | undefined): number | null => {
  const n = num(s);
  return n == null ? null : n / 10_000;
};
const flag = (s: string | null | undefined): boolean | null => (s == null ? null : s === "true");

export interface V4ReserveFigures {
  chainId: 1 | 8453 | 5042;
  block: number;
  blockTime: number;
  readBy: ServerRead;
  spokeAddress: string;
  hubAddress: string;
  oracle: string | null;
  strategy: string | null;
  assetId: number;
  reserveId: number;
  decimals: number;
  /** The spoke oracle's price in USD; null where the oracle did not answer. */
  price: number | null;
  priceSource: string | null;
  /** Token amounts. */
  spokeSupplied: number;
  spokeBorrowed: number;
  hubSupplied: number;
  hubBorrowed: number;
  hubDrawn: number;
  hubPremium: number;
  liquidity: number;
  hubDeficit: number;
  spokeDeficit: number;
  /** Fractions a year. */
  drawnApr: number | null;
  supplyApr: number | null;
  /** Premium owed ÷ drawn owed on the hub. */
  premiumRatio: number;
  /** drawn ÷ (drawn + liquidity); null where both are 0. */
  utilisation: number | null;
  liquidityFee: number | null;
  addCap: number | null;
  drawCap: number | null;
  active: boolean | null;
  halted: boolean | null;
  /** What the spoke can still draw: min(liquidity, draw cap − spoke owed). */
  available: number;
  /** spoke owed ÷ draw cap; null where uncapped or the cap is 0. */
  creditUsed: number | null;
  collateralFactor: number | null;
  /** The bonus over 1: 0.05 for a 105% max liquidation bonus. */
  maxLiquidationBonus: number | null;
  liquidationFee: number | null;
  collateralRisk: number | null;
  paused: boolean | null;
  frozen: boolean | null;
  borrowable: boolean | null;
  curve: { optimal: number; base: number; slope1: number; slope2: number } | null;
  liquidation: { targetHealthFactor: number; healthFactorForMaxBonus: number; bonusFactor: number } | null;
  /** The raw reads, for the receipts. */
  raw: V4ReserveHead;
}

export function settleHead(h: V4ReserveHead): V4ReserveFigures {
  const dec = h.reserve.decimals;
  const t = (s: string | null | undefined) => tokens(s, dec);
  const drawn = t(h.hub.owedDrawn);
  const premium = t(h.hub.owedPremium);
  const liquidity = t(h.hub.liquidity);
  const spokeBorrowed = t(h.spokeLine.totalOwed);
  const drawnApr = h.hub.drawnRateRay != null ? Number(h.hub.drawnRateRay) / RAY : null;
  const fee = bps(h.hub.config?.liquidityFee);
  const utilisation = drawn + liquidity > 0 ? drawn / (drawn + liquidity) : null;
  const premiumRatio = drawn > 0 ? premium / drawn : 0;
  const supplyApr =
    drawnApr != null && utilisation != null ? drawnApr * utilisation * (1 + premiumRatio) * (1 - (fee ?? 0)) : null;
  const addCap = capOf(h.spokeLine.config?.addCap);
  const drawCap = capOf(h.spokeLine.config?.drawCap);
  const room = drawCap == null ? liquidity : Math.max(0, drawCap - spokeBorrowed);
  const priceDec = num(h.reserve.priceDecimals);
  const price = h.reserve.price != null && priceDec != null ? Number(h.reserve.price) / 10 ** priceDec : null;
  const ir = h.hub.interestRateData;
  const lc = h.spoke.liquidationConfig;
  const bonus = num(h.reserve.dynamicConfig?.maxLiquidationBonus);
  const cf = bps(h.reserve.dynamicConfig?.collateralFactor);
  return {
    chainId: h.chainId,
    block: h.blockNumber,
    blockTime: h.blockTime,
    readBy: { blockTime: h.blockTime, readAt: h.readAt, provider: h.provider, block: h.blockNumber },
    spokeAddress: h.spoke.address,
    hubAddress: h.reserve.hub,
    oracle: h.spoke.oracle,
    strategy: h.hub.config?.irStrategy?.toLowerCase() ?? null,
    assetId: h.reserve.assetId,
    reserveId: h.reserve.reserveId,
    decimals: dec,
    price,
    priceSource: h.reserve.priceSource,
    spokeSupplied: t(h.spokeLine.added),
    spokeBorrowed,
    hubSupplied: t(h.hub.added),
    hubBorrowed: t(h.hub.totalOwed),
    hubDrawn: drawn,
    hubPremium: premium,
    liquidity,
    hubDeficit: (num(h.hub.deficitRay) ?? 0) / RAY / 10 ** dec,
    spokeDeficit: (num(h.spokeLine.deficitRay) ?? 0) / RAY / 10 ** dec,
    drawnApr,
    supplyApr,
    premiumRatio,
    utilisation,
    liquidityFee: fee,
    addCap,
    drawCap,
    active: flag(h.spokeLine.config?.active),
    halted: flag(h.spokeLine.config?.halted),
    available: Math.max(0, Math.min(liquidity, room)),
    creditUsed: drawCap != null && drawCap > 0 ? spokeBorrowed / drawCap : null,
    collateralFactor: cf != null && cf > 0 ? cf : null,
    maxLiquidationBonus: bonus != null ? Math.max(0, bonus / 10_000 - 1) : null,
    liquidationFee: bps(h.reserve.dynamicConfig?.liquidationFee),
    collateralRisk: bps(h.reserve.config?.collateralRisk),
    paused: flag(h.reserve.config?.paused),
    frozen: flag(h.reserve.config?.frozen),
    borrowable: flag(h.reserve.config?.borrowable),
    curve: ir
      ? {
          optimal: (num(ir.optimalUsageRatio) ?? 0) / 10_000,
          base: (num(ir.baseDrawnRate) ?? 0) / 10_000,
          slope1: (num(ir.rateGrowthBeforeOptimal) ?? 0) / 10_000,
          slope2: (num(ir.rateGrowthAfterOptimal) ?? 0) / 10_000,
        }
      : null,
    liquidation: lc
      ? {
          targetHealthFactor: (num(lc.targetHealthFactor) ?? 0) / 1e18,
          healthFactorForMaxBonus: (num(lc.healthFactorForMaxBonus) ?? 0) / 1e18,
          bonusFactor: (num(lc.liquidationBonusFactor) ?? 0) / 10_000,
        }
      : null,
    raw: h,
  };
}

/** A hub asset over its spokes, as stored: the Hubs page's row. */
export interface V4HubAsset {
  hub: V4HubKey;
  symbol: string;
  underlying: string;
  decimals: number;
  cls: AssetClass;
  supplied: number;
  borrowed: number;
  /** supplied − borrowed: what the hub holds undrawn. */
  liquidity: number;
  /** borrowed ÷ supplied. */
  utilisation: number | null;
  drawnApr: number | null;
  /** drawn rate × (borrowed ÷ supplied) × (1 − fee); borrowed carries the premium. */
  supplyApr: number | null;
  liquidityFee: number | null;
  lines: V4Line[];
}

export interface V4Hub {
  key: V4HubKey;
  label: string;
  assets: V4HubAsset[];
  /** The spokes it lends to. */
  spokes: { key: string; slug: string; name: string }[];
  positions: number | null;
}

export function hubsOf(s: V4Stored): V4Hub[] {
  return V4_HUB_ORDER.flatMap((hub) => {
    const ls = s.lines.filter((l) => l.hub === hub);
    if (ls.length === 0) return [];
    const by = new Map<string, V4Line[]>();
    for (const l of ls) by.set(l.underlying, [...(by.get(l.underlying) ?? []), l]);
    const assets: V4HubAsset[] = [...by.values()].map((g) => {
      const supplied = g.reduce((a, l) => a + l.supplied, 0);
      const borrowed = g.reduce((a, l) => a + l.borrowed, 0);
      const drawnApr = g.find((l) => l.drawnApr != null)?.drawnApr ?? null;
      const liquidityFee = g.find((l) => l.liquidityFee != null)?.liquidityFee ?? null;
      const utilisation = supplied > 0 ? borrowed / supplied : null;
      return {
        hub,
        symbol: g[0].symbol,
        underlying: g[0].underlying,
        decimals: g[0].decimals,
        cls: g[0].cls,
        supplied,
        borrowed,
        liquidity: Math.max(0, supplied - borrowed),
        utilisation,
        drawnApr,
        supplyApr: drawnApr != null && utilisation != null ? drawnApr * utilisation * (1 - (liquidityFee ?? 0)) : null,
        liquidityFee,
        lines: g,
      };
    });
    const spokes = new Map<string, { key: string; slug: string; name: string }>();
    for (const l of ls) spokes.set(l.spokeKey, { key: l.spokeKey, slug: l.spokeSlug, name: l.spokeName });
    return [
      {
        key: hub,
        label: V4_HUB_LABEL[hub],
        assets,
        spokes: [...spokes.values()].sort((a, b) => a.name.localeCompare(b.name)),
        positions: s.hubPositions[hub] ?? null,
      },
    ];
  });
}

// ── Prices ───────────────────────────────────────────────────────────────────
// Every USD figure prices a token at the spoke oracle's getReservePrice where
// one is held (Ethereum: `/api/oracle/aave-v4`; Base: the stored row), and at
// the off-chain market feed (DefiLlama) only where the oracle holds none. An
// asset with neither is unpriced: it joins no USD total, and the total says so.

export interface V4Price {
  usd: number;
  via: "oracle" | "market";
  /** A spoke listing the asset, whose oracle answers for it (oracle prices). */
  spoke?: string;
  block?: number | null;
}

export type V4PriceBook = (underlying: string) => V4Price | null;

export function priceBook(
  s: V4Stored,
  oracle: { prices: Record<string, { usd: number }>; block: number | null } | null,
  market: Record<string, number>,
): V4PriceBook {
  const spokeOf = new Map<string, string>();
  for (const sp of [...s.spokes].sort((a, b) => a.name.localeCompare(b.name)))
    for (const l of sp.lines) if (!spokeOf.has(l.underlying)) spokeOf.set(l.underlying, sp.name);
  const base = new Map(s.lines.filter((l) => l.base).map((l) => [l.underlying, l.base!]));
  const held = new Map(s.lines.filter((l) => l.held).map((l) => [l.underlying, l.held!]));
  return (underlying) => {
    const a = underlying.toLowerCase();
    const b = base.get(a) ?? held.get(a);
    if (b) return { usd: b.price, via: "oracle", spoke: spokeOf.get(a), block: b.block };
    const o = oracle?.prices[a]?.usd;
    if (o != null && Number.isFinite(o)) return { usd: o, via: "oracle", spoke: spokeOf.get(a), block: oracle?.block };
    const m = market[a];
    return m != null && Number.isFinite(m) ? { usd: m, via: "market" } : null;
  };
}

/** A USD total over token amounts: the priced part, and what it leaves out. */
export interface PricedSum {
  usd: number;
  /** Symbols priced at the market feed. */
  market: string[];
  /** Symbols with a balance and no price, left out of `usd`. */
  unpriced: string[];
}

export function pricedSum(
  items: { underlying: string; symbol: string; tokens: number }[],
  book: V4PriceBook,
): PricedSum {
  const out: PricedSum = { usd: 0, market: [], unpriced: [] };
  for (const it of items) {
    if (it.tokens <= 0) continue;
    const p = book(it.underlying);
    if (!p) {
      if (!out.unpriced.includes(it.symbol)) out.unpriced.push(it.symbol);
      continue;
    }
    out.usd += it.tokens * p.usd;
    if (p.via === "market" && !out.market.includes(it.symbol)) out.market.push(it.symbol);
  }
  return out;
}
