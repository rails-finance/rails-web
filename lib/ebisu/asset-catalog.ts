// Ebisu Money (Liquity V2 fork) contract catalog (chain-state tier).
// ----------------------------------------------------------------------------
// Ebisu mints ebUSD against FIVE collateral branches, each its own TroveManager
// (unlike Liquity V1's single ETH Trove). A Trove is an NFT keyed by trove_id
// WITHIN its branch, so identity is (branch, troveId). Branch decimals are
// LOAD-BEARING — weETH/sUSDe/stcUSD are 18, WBTC/LBTC are 8; scaling collateral
// with the wrong decimals is off by 10^10. Debt is always ebUSD (18).
//
// The live lane (2026-07-14 depth pass): each branch's PriceFeed sits at
// BorrowerOperations STORAGE SLOT 2 (Ebisu's contracts are clones — config is
// storage, not immutables), the per-branch MCR/CCR/SCR on the EbisuBranchManager
// found at TM slot 15, and the price scale is 1e(36 − collateral decimals).
// Every address + constant below is re-derived and asserted from the
// TroveManagers themselves by scripts/verify-liquity-forks-chain.mjs.

import { chainMeta, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

export interface EbisuBranch {
  /** Lowercase branch key as stored in the MV (weeth | susde | wbtc | lbtc | stcusd). */
  key: string;
  /** Display collateral symbol (weETH | sUSDe | WBTC | LBTC | stcUSD). */
  symbol: string;
  /** Collateral token decimals — LOAD-BEARING (WBTC/LBTC = 8, rest = 18). */
  decimals: number;
  /** Collateral ERC20 address (lowercase). */
  collateralAddr: string;
  /** The branch's TroveManager — emits TroveUpdated / TroveOperation. */
  troveManager: string;
  /** The branch's EbisuBranchManager (TM storage slot 15) — holds the
   *  MCR/CCR/SCR below and runs redemptions: it emits Redemption and
   *  RedemptionFeePaidToTrove. */
  branchManager: string;
  /** The branch's own PriceFeed (BO storage slot 2, chain-verified).
   *  lastGoodPrice is STALE on quiet branches — the lane simulates
   *  fetchPrice via eth_call. Scale 1e(36 − decimals). */
  priceFeed: string;
  /** The branch's SortedTroves — descending annual interest rate; the
   *  redemption queue. */
  sortedTroves: string;
  /** The branch's TroveNFT — the ERC-721 a Trove IS, token id = trove id.
   *  Read back from `TroveManager.troveNFT()` on mainnet 2026-09-20, each
   *  cross-checked by its own `troveManager()` backpointer. */
  troveNft: string;
  /** Governance constants (EbisuBranchManager @ TM slot 15, chain-verified
   *  2026-07-14 — re-verify via the script if Ebisu governance moves them). */
  mcr: number;
  ccr: number;
  scr: number;
}

export const EBISU_BRANCHES: Record<string, EbisuBranch> = {
  weeth: {
    key: "weeth",
    symbol: "weETH",
    decimals: 18,
    collateralAddr: "0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee",
    troveManager: "0x0eabd8c3f7b4058093c1e9b147c93b4d9f6f54d4",
    branchManager: "0xc0b550a3c6b81521da89562dac10f331d7d3de40",
    priceFeed: "0x36fb029e6feec43d96be2f8ccc0e572d1663f5fc",
    sortedTroves: "0xcf24189972002ecb283b453571e829249cde039c",
    troveNft: "0x32541a7a06d3792b46512f3b6c7d8467b5c7d754",
    mcr: 1.2,
    ccr: 1.5,
    scr: 1.2,
  },
  susde: {
    key: "susde",
    symbol: "sUSDe",
    decimals: 18,
    collateralAddr: "0x9d39a5de30e57443bff2a8307a4256c8797a3497",
    troveManager: "0xcc522ac32fa51cb234da97c4b3a0bba9f1c578ae",
    branchManager: "0x6e2c51cf113f45235f6e2bc2d9f7db195d98e895",
    priceFeed: "0x3e58fb6ffd3a568487c72a170411ebf7be6a2062",
    sortedTroves: "0x95e098daefa015349ded8e2e6e5a445aa64d67ca",
    troveNft: "0x6988930e0d67098d33306e29fd5a689b43f9c21b",
    mcr: 1.15,
    ccr: 1.2,
    scr: 1.1,
  },
  wbtc: {
    key: "wbtc",
    symbol: "WBTC",
    decimals: 8,
    collateralAddr: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
    troveManager: "0xee49febd1b4469cbe0d5114a95d7cf831f3c7a48",
    branchManager: "0x26507af4c68ea91d31e76f5eaaafdac73f2f5cbd",
    priceFeed: "0x83387ff1234c2525ec0eb37dfe30d005356a222b",
    sortedTroves: "0x4e5e60cd7d33b00e308504f75bb6737c14f113dd",
    troveNft: "0x7ef172d1869c50cc3a3de88033d1f36b2ed83fdf",
    mcr: 1.2,
    ccr: 1.5,
    scr: 1.2,
  },
  lbtc: {
    key: "lbtc",
    symbol: "LBTC",
    decimals: 8,
    collateralAddr: "0x8236a87084f8b84306f72007f36f2618a5634494",
    troveManager: "0x088582f656eb5b148d575c054680255e8b11b3c7",
    branchManager: "0x84572792d91ba1ea1d67fe3476354de317af387e",
    priceFeed: "0x71aa4e0ae5435aa3d4724d14df91c5a26720cc4f",
    sortedTroves: "0x4fc7fc8cd3a9b6e50f1305f80e62e79488621f1e",
    troveNft: "0x9b4b5040d1c442e375e09070d2cd5efffd3947a4",
    mcr: 1.35,
    ccr: 1.5,
    scr: 1.2,
  },
  stcusd: {
    key: "stcusd",
    symbol: "stcUSD",
    decimals: 18,
    collateralAddr: "0x88887be419578051ff9f4eb6c858a951921d8888",
    troveManager: "0xa0911635345ea7ee6c4a50f23e06f2fb1fcf5190",
    branchManager: "0x0c906ba27a9b747653ed16b82d77a7a8eefeb19c",
    priceFeed: "0xdb0cd67899e071a8798a58c9d2dd43795833c71d",
    sortedTroves: "0xf5b66656ee851ee9dfd3b89d19a453f50fb9139e",
    troveNft: "0x1f9b6ac92d51a5adc19d96bf27fd285fffe993c0",
    mcr: 1.15,
    ccr: 1.3,
    scr: 1.1,
  },
};

/** ebUSD — the shared debt token across every branch (18 decimals). */
export const DEBT_SYMBOL = "ebUSD";
/** Minimum Trove debt (display units) — `MIN_DEBT = 2000e18` in the verified
 *  BorrowerOperations source (Etherscan, 2026-08-11). Owner operations enforce
 *  the floor, so only a redemption can leave an open Trove below it — an open
 *  Trove under this floor is a ZOMBIE (V2 status 4, outside the rate-ordered
 *  redemption queue, redeemed first). */
export const MIN_DEBT = 2000;
export const DEBT_ADDRESS = "0x09fd37d9aa613789c517e76df1c53aece2b60df4";
export const DEBT_DECIMALS = 18;

/** The index derivation of the zombie state, for surfaces with no per-row
 *  chain read (listing pills, filter buckets): an OPEN Trove below the
 *  MIN_DEBT floor. The detail page's live getTroveStatus wins where it runs.
 *  The index can miss a zombie whose redemption emitted no captured event —
 *  such a row keeps reading Open (incomplete, never false). */
export function indexZombie(status: string, debt: number): boolean {
  return status === "open" && debt < MIN_DEBT;
}

/** Lowercased display symbol → branch key. */
const SYMBOL_TO_KEY: Record<string, string> = Object.fromEntries(
  Object.values(EBISU_BRANCHES).map((b) => [b.symbol.toLowerCase(), b.key]),
);

/** Resolve a branch from a display symbol or a branch key (any case). */
export function resolveBranch(collateralType: string | undefined | null): EbisuBranch | undefined {
  if (!collateralType) return undefined;
  const c = collateralType.trim().toLowerCase();
  const key = SYMBOL_TO_KEY[c] ?? (EBISU_BRANCHES[c] ? c : undefined);
  return key ? EBISU_BRANCHES[key] : undefined;
}

/** Short, copy-friendly form of a trove id (long uint256) or address. */
export const shortId = (id: string): string => (id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id);

/** OpenSea link for a Trove NFT — the same host/path pattern the rest of the
 *  Liquity family uses (`getTroveNftUrl`, `getBasedollarTroveNftUrl`), built
 *  from this branch's own `troveNft` address and the mainnet chain slug from
 *  `lib/shared/chains.ts`. Null when the branch can't be resolved. */
export function getEbisuTroveNftUrl(collateralType: string | undefined | null, troveId: string): string | null {
  const branch = resolveBranch(collateralType);
  if (!branch || !troveId) return null;
  return `https://opensea.io/item/${chainMeta(MAINNET_CHAIN_ID).slug}/${branch.troveNft}/${troveId}`;
}
