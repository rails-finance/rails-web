// Client for /api/chain/ctoken-liquidity-at — the Comptroller's account
// liquidity just before and at a liquidation's block, the close factor then,
// and the collateral market's protocol seize share
// (lib/sources/chain/ctoken-liquidity-at.ts).

export type CTokenProtocol = "compound-v2" | "moonwell" | "moonwell-base";

export interface CTokenLiquidityAt {
  block: number;
  /** getAccountLiquidity at block − 1 and at the block; null where the read
   *  failed or the Comptroller returned an error code. */
  before: { liquidityUsd: number; shortfallUsd: number } | null;
  after: { liquidityUsd: number; shortfallUsd: number } | null;
  /** closeFactorMantissa at block − 1, as a fraction (0.5). */
  closeFactor: number | null;
  /** The collateral market's protocolSeizeShareMantissa at the block (0.028);
   *  0 where the cToken has no such getter (its seizures go wholly to the
   *  liquidator). */
  protocolSeizeShare: number | null;
  /** The borrowed market's debt as the liquidation met it, in the token's
   *  base units: borrowBalanceStored at block − 1 × borrowIndex(block) ÷
   *  borrowIndex(block − 1). Null without a debt market. */
  debtBeforeRaw: string | null;
  /** What counted toward the borrow limit at block − 1: each entered market
   *  (getAssetsIn) holding a supply, with its collateral factor and its value
   *  at the oracle in the Comptroller's numeraire. Null where the reads failed. */
  counted: { market: string; label: string; collateralFactor: number; value: number | null }[] | null;
  /** The seized market's cToken/mToken address. */
  collateralMarket: string | null;
  /** Whether the seized market was entered as collateral at block − 1. */
  collateralEntered: boolean | null;
  /** Compound V2: Comptroller.isDeprecated(borrowed market) at block − 1. */
  debtMarketDeprecated: boolean | null;
}

const cache = new Map<string, Promise<CTokenLiquidityAt | null>>();

export function fetchCTokenLiquidityAt(p: {
  protocol: CTokenProtocol;
  wallet: string;
  block: number;
  collateral: string;
  debtMarket?: string;
}): Promise<CTokenLiquidityAt | null> {
  const key = `${p.protocol}:${p.wallet}:${p.block}:${p.collateral}:${p.debtMarket ?? ""}`;
  let hit = cache.get(key);
  if (!hit) {
    const q = new URLSearchParams({
      // v: the response shape; a new field changes it, and the route's answer
      // is cached as immutable.
      v: "2",
      protocol: p.protocol,
      wallet: p.wallet,
      block: String(p.block),
      collateral: p.collateral,
      ...(p.debtMarket ? { debtMarket: p.debtMarket } : {}),
    });
    hit = fetch(`/api/chain/ctoken-liquidity-at?${q}`)
      .then((r) => (r.ok ? (r.json() as Promise<CTokenLiquidityAt | null>) : null))
      .catch(() => null);
    cache.set(key, hit);
  }
  return hit;
}

export interface CTokenMembershipAt {
  block: number;
  entered: boolean;
  collateralFactor: number | null;
}

const membershipCache = new Map<string, Promise<CTokenMembershipAt | null>>();

/** Whether `market` was entered as collateral at `block` (Comptroller
 *  getAssetsIn), and its collateral factor then. */
export function fetchCTokenMembershipAt(p: {
  protocol: CTokenProtocol;
  wallet: string;
  block: number;
  market: string;
}): Promise<CTokenMembershipAt | null> {
  const key = `${p.protocol}:${p.wallet}:${p.block}:${p.market}`;
  let hit = membershipCache.get(key);
  if (!hit) {
    const q = new URLSearchParams({
      protocol: p.protocol,
      wallet: p.wallet,
      block: String(p.block),
      membership: p.market,
    });
    hit = fetch(`/api/chain/ctoken-liquidity-at?${q}`)
      .then((r) => (r.ok ? (r.json() as Promise<CTokenMembershipAt | null>) : null))
      .catch(() => null);
    membershipCache.set(key, hit);
  }
  return hit;
}
