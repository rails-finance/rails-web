// Aave V4 on Arc (rails-ops ui-jobs 577): the deployment and the answers of
// rails-server's /api/at-block/aave-v4-arc routes (api/src/services/
// aave-v4-arc-at-block.ts). Raw chain values, bigints as decimal strings;
// lib/aave-v4-arc/position.ts does the math.
//
// Addresses from Aave's address book (aave-dao/aave-address-book
// src/AaveV4Arc.sol at 967c772c, 10 Nov 2026), each checked on Arc on
// 11 Nov 2026: the hub lists the three spokes, each spoke's ORACLE() is the
// book's oracle, and every reserve draws from the Core hub.

export const ARC_SESSION = "aave-v4-arc" as const;

export const AAVE_V4_ARC_CONTRACTS = {
  hub: "0x17288dfc86205301064577b98B02b81017e6F79C",
  spokes: [
    {
      key: "main",
      slug: "main",
      name: "Main",
      address: "0xB843bdC3a87A05E77E07Df9FE48928b3A34b134d",
      oracle: "0x6ffE98F3422041236c19923EDB949F18A69e8A09",
    },
    {
      key: "forex",
      slug: "forex",
      name: "Forex",
      address: "0x4164EBCAF74670aa74C8D4F59de6157c0780F1bB",
      oracle: "0x2abd2B5C30D649273B3b762b0E1758BaC8F87cFE",
    },
    {
      key: "usdc-maple",
      slug: "usdc-maple",
      name: "USDC Maple",
      address: "0x18Dde098d25722C14e09842a6Fa7db6aAFC395a2",
      oracle: "0x1Dd77518EC8A68E91C0656660d7972e301Fc00A4",
    },
  ],
} as const;

export type ArcSpokeMeta = (typeof AAVE_V4_ARC_CONTRACTS.spokes)[number];

/** A spoke by its URL slug; null for any other. */
export const arcSpokeBySlug = (slug: string): ArcSpokeMeta | null =>
  AAVE_V4_ARC_CONTRACTS.spokes.find((s) => s.slug === slug) ?? null;
export const arcSpokeByKey = (key: string): ArcSpokeMeta | null =>
  AAVE_V4_ARC_CONTRACTS.spokes.find((s) => s.key === key) ?? null;

export type BlockRef = { block: number; time: number };
type Str = string | null;

export interface ArcLiquidationConfig {
  targetHealthFactor: string;
  healthFactorForMaxBonus: string;
  liquidationBonusFactor: string;
}

export interface ArcSpokeHead {
  key: string;
  name: string;
  address: string;
  oracle: string;
  priceDecimals: number;
  liquidationConfig: ArcLiquidationConfig | null;
  reserveCount: number;
}

/** GET /api/at-block/aave-v4-arc/markets */
export interface ArcMarketsRead {
  chainId: 5042;
  head: BlockRef;
  provider: string;
  hub: { key: string; name: string; address: string };
  spokes: ArcSpokeHead[];
  assets: {
    assetId: number;
    underlying: string;
    symbol: string;
    decimals: number;
    added: Str;
    totalOwed: Str;
    liquidity: Str;
    drawnRate: Str;
    liquidityFee: number | null;
    irStrategy: Str;
  }[];
  reserves: {
    spoke: string;
    reserveId: number;
    underlying: string;
    symbol: string;
    decimals: number;
    hub: string;
    assetId: number;
    dynamicConfigKey: number;
    collateralRisk: number | null;
    paused: boolean | null;
    frozen: boolean | null;
    borrowable: boolean | null;
    collateralFactor: number | null;
    maxLiquidationBonus: number | null;
    liquidationFee: number | null;
    price: Str;
    priceSource: Str;
    spokeAdded: Str;
    spokeOwed: Str;
    addCap: Str;
    drawCap: Str;
    active: boolean | null;
    halted: boolean | null;
  }[];
}

export interface ArcAccount {
  riskPremium: string;
  avgCollateralFactor: string;
  healthFactor: string;
  totalCollateralValue: string;
  totalDebtValueRay: string;
  activeCollateralCount: string;
  borrowCount: string;
}

/** GET /api/at-block/aave-v4-arc/wallet */
export interface ArcWalletRead {
  chainId: 5042;
  head: BlockRef;
  provider: string;
  wallet: string;
  spokes: {
    key: string;
    name: string;
    address: string;
    oracle: string;
    priceDecimals: number;
    account: ArcAccount;
    reserves: {
      reserveId: number;
      underlying: string;
      symbol: string;
      decimals: number;
      supplied: string;
      debt: string;
      isCollateral: boolean;
      price: Str;
    }[];
  }[];
}

export interface ArcUserPosition {
  drawnShares: string;
  premiumShares: string;
  premiumOffsetRay: string;
  suppliedShares: string;
  dynamicConfigKey: number;
}

export interface ArcPositionReserve {
  reserveId: number;
  underlying: string;
  symbol: string;
  decimals: number;
  hub: string;
  assetId: number;
  supplied: string;
  debt: string;
  isCollateral: boolean;
  hasBorrow: boolean;
  position: ArcUserPosition;
  collateralRisk: number | null;
  paused: boolean | null;
  frozen: boolean | null;
  borrowable: boolean | null;
  collateralFactor: number | null;
  maxLiquidationBonus: number | null;
  liquidationFee: number | null;
  price: Str;
  priceSource: Str;
  drawnRate: Str;
  past: { supplied: string; debt: string; position: ArcUserPosition } | null;
}

/** GET /api/at-block/aave-v4-arc/position */
export interface ArcPositionRead {
  chainId: 5042;
  head: BlockRef;
  then: BlockRef;
  provider: string;
  wallet: string;
  hub: { key: string; name: string; address: string };
  spoke: ArcSpokeHead;
  account: ArcAccount;
  reserves: ArcPositionReserve[];
}

export const isArcWallet = (w: string) => /^0x[0-9a-fA-F]{40}$/.test(w);
