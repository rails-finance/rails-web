// Maple Finance (syrup pools) contract + pool catalog.
// ----------------------------------------------------------------------------
// Maple V2's permissionless lender side: two ERC-4626 pool share tokens
// (syrupUSDC / syrupUSDT), each with a FIFO queue WithdrawalManager, a
// PoolManager, and two LoanManagers ("strategies"). The roster is FIXED
// (Maple's proxy factories spawn per-LOAN contracts, not pools), so symbols,
// decimals and the whole per-pool contract set live HERE — no per-request
// ERC20 resolution. All addresses from Maple's own on-chain address registry
// (github.com/maple-labs/address-registry), cross-checked on-chain 2026-07-14
// (totalAssets identity + governor reads).
//
// The share price is the protocol's own bookkeeping: totalAssets = cash in
// the pool + Σ strategy assetsUnderManagement(), where the loan legs accrue a
// posted issuanceRate over loans whose collateral is custodied OFF-chain
// (BitGo / Copper / Anchorage / Hex Trust, tri-party). Exit pricing uses
// convertToExitAssets = shares × (totalAssets − unrealizedLosses) /
// totalSupply — impairment marks are socialized to exiters. The explorer
// renders these as the chain values they are, with the custody caveat carried
// by the provenance receipts.

/** Short, copy-friendly form of a wallet address. */
export const shortAddress = (addr: string): string => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

// ── Pool catalog ─────────────────────────────────────────────────────────────
// Pool keys mirror the backend's `pool` tag ('syrupusdc' | 'syrupusdt').
// Shares and funds assets are both 6-dp.

export interface MaplePool {
  /** The backend pool key. */
  key: string;
  /** Pool share token display symbol. */
  symbol: string;
  /** Funds asset display symbol. */
  assetSymbol: string;
  /** Pool share token (the ERC-4626 pool itself), lowercased. */
  pool: string;
  /** Funds asset token address, lowercased. */
  asset: string;
  /** Funds asset + share decimals (both 6 for the syrup pools). */
  decimals: number;
  /** PoolManager — totalAssets aggregation, strategyList enumeration. */
  poolManager: string;
  /** Queue WithdrawalManager — escrow custody, totalShares. */
  withdrawalManager: string;
  /** Fixed-term LoanManager (accrual PRECISION 1e30). */
  fixedTermLoanManager: string;
  /** Open-term LoanManager (accrual PRECISION 1e27). */
  openTermLoanManager: string;
  /** Pool deploy block. */
  deployBlock: number;
}

/** Share-token decimals (both syrup pools; equal to the asset's). */
export const MAPLE_SHARE_DECIMALS = 6;

export const MAPLE_POOLS: MaplePool[] = [
  {
    key: "syrupusdc",
    symbol: "syrupUSDC",
    assetSymbol: "USDC",
    pool: "0x80ac24aa929eaf5013f6436cda2a7ba190f5cc0b",
    asset: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    decimals: 6,
    poolManager: "0x7ad5ffa5fdf509e30186f4609c2f6269f4b6158f",
    withdrawalManager: "0x1bc47a0dd0fdab96e9ef982fdf1f34dc6207cfe3",
    fixedTermLoanManager: "0x4a1c3f0d9ad0b3f9da085bebfc22dea54263371b",
    openTermLoanManager: "0x6aceb4caba81fa6a8065059f3a944fb066a10fac",
    deployBlock: 19_920_366,
  },
  {
    key: "syrupusdt",
    symbol: "syrupUSDT",
    assetSymbol: "USDT",
    pool: "0x356b8d89c1e1239cbbb9de4815c39a1474d5ba7d",
    asset: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    decimals: 6,
    poolManager: "0x0cda32e08b48bfddbc7ee96b44b09cf286f9e21a",
    withdrawalManager: "0x86ebdf902d800f2a82038290b6dbb2a5ee29eb8c",
    fixedTermLoanManager: "0xc17aa0cb662bc4787bb16bd3bc13d0d88eb7abdd",
    openTermLoanManager: "0x616022e54324ef9c13b99c229dac8ea69af4faff",
    deployBlock: 20_434_756,
  },
];

/** Pool key → catalog entry. */
export const MAPLE_POOL_BY_KEY: Record<string, MaplePool> = Object.fromEntries(MAPLE_POOLS.map((p) => [p.key, p]));

/** The stand-in for a pool key the catalog does not carry — the index naming a
 *  pool this file has not learned yet. Degraded, but never anonymous: the key
 *  itself carries through so the reader sees which pool it is. */
const fallbackPool = (key: string): MaplePool => ({
  key,
  symbol: key,
  assetSymbol: key.toUpperCase(),
  pool: "0x0000000000000000000000000000000000000000",
  asset: "0x0000000000000000000000000000000000000000",
  decimals: 6,
  poolManager: "0x0000000000000000000000000000000000000000",
  withdrawalManager: "0x0000000000000000000000000000000000000000",
  fixedTermLoanManager: "0x0000000000000000000000000000000000000000",
  openTermLoanManager: "0x0000000000000000000000000000000000000000",
  deployBlock: 0,
});

/** The index's pool key → the catalog entry the presentation reads.
 *
 *  ONE definition, deliberately, because three callers on both sides of a
 *  windowed timeline's cut must agree: `buildMapleTimeline` resolves every row
 *  through it, the /timeline/summary proxy resolves the opening balance's pool
 *  keys through it, and the lifetime merge names its merged pools with it. A
 *  key that resolved to USDC in the window and to 'SYRUPUSDX' in the opening
 *  balance would split one asset into two buckets, and nothing downstream could
 *  tell that from a real second pool. */
export const maplePoolOf = (key: string): MaplePool => MAPLE_POOL_BY_KEY[key] ?? fallbackPool(key);

/** Share-token display symbol → pool key (filter chips). */
export const MAPLE_KEY_BY_SYMBOL: Record<string, string> = Object.fromEntries(
  MAPLE_POOLS.map((p) => [p.symbol, p.key]),
);
