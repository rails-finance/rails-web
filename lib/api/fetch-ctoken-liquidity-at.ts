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
  /** The collateral market's protocolSeizeShareMantissa at the block (0.028). */
  protocolSeizeShare: number | null;
  /** The borrowed market's debt as the liquidation met it, in the token's
   *  base units: borrowBalanceStored at block − 1 × borrowIndex(block) ÷
   *  borrowIndex(block − 1). Null without a debt market. */
  debtBeforeRaw: string | null;
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
