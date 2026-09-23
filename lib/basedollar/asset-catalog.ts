// Basedollar (Liquity V2 fork on BASE) contract catalog (chain-state tier).
// ----------------------------------------------------------------------------
// Basedollar mints BD against FIVE collateral branches, each its own
// TroveManager. A Trove is an NFT keyed by trove_id WITHIN its branch, so
// identity is (branch, troveId) — the same shape as Ebisu and Asymmetry.
//
// THE DECIMALS TRAP: every branch here is 18, wcbBTC INCLUDED. It reads like an
// 8-decimal BTC branch and is not — wcbBTC is a wrapper that normalises cbBTC's
// 8 decimals up to 18. Scaling it as 8 would be off by 10^10. Verified by
// calling decimals() on each collateral ERC20 directly, not inferred from the
// ticker. Debt is always BD (18).
//
// Basedollar's governance constants do NOT sit where Ebisu's do: MCR / CCR /
// SCR / BCR answer on BORROWEROPERATIONS, and the TroveManager exposes only
// CCR — addressesRegistry() reverts on both. Every value below was read from
// the deployed contracts on Base (chain 8453), not carried over from a
// sibling fork.

import { chainMeta, BASE_CHAIN_ID } from "@/lib/shared/chains";

export interface BasedollarBranch {
  /** Lowercase branch key as stored in the MV (weth | wsteth | reth | wcbbtc | cbeth). */
  key: string;
  /** Display collateral symbol (WETH | wstETH | rETH | wcbBTC | cbETH). */
  symbol: string;
  /** Collateral token decimals — 18 on every branch, wcbBTC included. */
  decimals: number;
  /** Collateral ERC20 address (lowercase). */
  collateralAddr: string;
  /** The branch's TroveManager — emits TroveUpdated / TroveOperation. */
  troveManager: string;
  /** The branch's BorrowerOperations — owner of MCR/CCR/SCR/BCR here. */
  borrowerOperations: string;
  /** The branch's own PriceFeed. lastGoodPrice is STALE on quiet branches —
   *  the lane simulates fetchPrice via eth_call. Scale 1e(36 − decimals). */
  priceFeed: string;
  /** The branch's SortedTroves — descending annual interest rate; the
   *  redemption queue. */
  sortedTroves: string;
  /** The branch's TroveNFT — the ERC-721 a Trove IS, token id = trove id.
   *  Recorded in rails-ops `architecture/base-l2-lane.md` §4 (read back via
   *  `TroveManager.troveNFT()` and cross-checked against the deployment
   *  broadcast), not re-derived here. */
  troveNft: string;
  /** Governance constants, read from BorrowerOperations on Base 2026-08-21. */
  mcr: number;
  ccr: number;
  scr: number;
  /** Batch CR buffer — a batched Trove sits BCR above MCR. Liquity V2 gained
   *  this after the original fork; Ebisu's catalog predates it. */
  bcr: number;
}

export const BASEDOLLAR_BRANCHES: Record<string, BasedollarBranch> = {
  weth: {
    key: "weth",
    symbol: "WETH",
    decimals: 18,
    collateralAddr: "0x4200000000000000000000000000000000000006",
    troveManager: "0xa957d42c4c43eb97d5f71b8435eb638e5dd9f639",
    borrowerOperations: "0x1867772fba1bcc13d94eb22f1d100ce524148a3f",
    priceFeed: "0x40b4199347af7738643ef4a12a771f7421b84e7f",
    sortedTroves: "0x4f1d9102448fde06955a6cd20d085d6b468e92ad",
    troveNft: "0xaed689cf95802fbbd9c8a787379d4dc66768c802",
    mcr: 1.1,
    ccr: 1.5,
    scr: 1.1,
    bcr: 0.1,
  },
  wsteth: {
    key: "wsteth",
    symbol: "wstETH",
    decimals: 18,
    collateralAddr: "0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452",
    troveManager: "0x79a6a3361eae4d4b80939206426f2320c11a4bfb",
    borrowerOperations: "0xc4b0a1011f2cb0438429724594d2ab3d4d8ef54a",
    priceFeed: "0x176363a20ba1dc75b418d7954f5222499b276186",
    sortedTroves: "0x4dad0339c1c33a247fc137f44bbc5dbe8df80ee1",
    troveNft: "0xdb5747eaca2c4283ac56fe2b6ce84cb16c259990",
    mcr: 1.1,
    ccr: 1.6,
    scr: 1.1,
    bcr: 0.1,
  },
  reth: {
    key: "reth",
    symbol: "rETH",
    decimals: 18,
    collateralAddr: "0xb6fe221fe9eef5aba221c348ba20a1bf5e73624c",
    troveManager: "0xd31987fcba98f471b6e4220c52f7741b11b2fc5e",
    borrowerOperations: "0x69e933767974fcd7cabeea976226783f4b952521",
    priceFeed: "0x6627b94533be5bba42d1aaaf982330e9746b6133",
    sortedTroves: "0x637344c0634626bb5d3c8fd5cc0fb332558778f8",
    troveNft: "0xec22e1dd649a98d2718cc2d9afb69dbf25ed3fa6",
    mcr: 1.1,
    ccr: 1.6,
    scr: 1.1,
    bcr: 0.1,
  },
  wcbbtc: {
    key: "wcbbtc",
    symbol: "wcbBTC",
    decimals: 18,
    collateralAddr: "0x92a7aee8afaa71ba0a9cc04a3dbe1f34237c33e0",
    troveManager: "0x835b04eefbb0e32d8f75cfe96acb527a42f1a0d9",
    borrowerOperations: "0xb9a3c82486d0b6d72dec55fcc9192af09aaa393b",
    priceFeed: "0x9e191d9f3f3c138c81753acf6f4ec32e84daa89e",
    sortedTroves: "0xe55530a4205ec2eda84adf9f5efb2f456d5cb721",
    troveNft: "0x9bac1f53bb7d309df424f16ee8a0bbb5803b9776",
    mcr: 1.1,
    ccr: 1.5,
    scr: 1.1,
    bcr: 0.1,
  },
  cbeth: {
    key: "cbeth",
    symbol: "cbETH",
    decimals: 18,
    collateralAddr: "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22",
    troveManager: "0x482de97e667330afba99f8ced527118aec66f15d",
    borrowerOperations: "0xfa6e7e44e538b2cf7d73720b2b1942ab28abd1d5",
    priceFeed: "0x23bb111e94ec68009da6b8fc50c19628a972b9e0",
    sortedTroves: "0x2792304889f35b60ccd79c3e173837bc6ec3ab44",
    troveNft: "0x2c3a69fe04c976a05e72033ac2433bcfaa15b68a",
    mcr: 1.1,
    ccr: 1.6,
    scr: 1.1,
    bcr: 0.1,
  },
};

/** BD — the shared debt token across every branch (18 decimals). */
export const DEBT_SYMBOL = "BD";
/** Minimum Trove debt (display units) — `MIN_DEBT = 200e18` in
 *  contracts/src/Dependencies/Constants.sol. NOT Liquity's 2000: basedollar
 *  lowered the floor by 10x, and the captured troves corroborate it (the
 *  smallest open Trove carries 500.15 BD, which a 2000 floor would forbid).
 *  Owner operations enforce the floor, so only a redemption can leave an open
 *  Trove below it — an open Trove under this floor is a ZOMBIE (V2 status 4,
 *  outside the rate-ordered redemption queue, redeemed first). */
export const MIN_DEBT = 200;
export const DEBT_ADDRESS = "0x252d36f435582ecb01686448d21e8c9ea0b2ca65";
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
  Object.values(BASEDOLLAR_BRANCHES).map((b) => [b.symbol.toLowerCase(), b.key]),
);

/** Resolve a branch from a display symbol or a branch key (any case). */
export function resolveBranch(collateralType: string | undefined | null): BasedollarBranch | undefined {
  if (!collateralType) return undefined;
  const c = collateralType.trim().toLowerCase();
  const key = SYMBOL_TO_KEY[c] ?? (BASEDOLLAR_BRANCHES[c] ? c : undefined);
  return key ? BASEDOLLAR_BRANCHES[key] : undefined;
}

/** Short, copy-friendly form of a trove id (long uint256) or address. */
export const shortId = (id: string): string => (id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id);

/** OpenSea link for a Trove NFT — same host/path pattern as
 *  `getTroveNftUrl` in `lib/utils/nft-utils.ts` (V2's mainnet troves), built
 *  from this branch's own `troveNft` address and the Base chain slug already
 *  registered in `lib/shared/chains.ts` (`"base"`), so the chain segment
 *  isn't a second hardcoded string. Null when the branch can't be resolved. */
export function getBasedollarTroveNftUrl(collateralType: string | undefined | null, troveId: string): string | null {
  const branch = resolveBranch(collateralType);
  if (!branch || !troveId) return null;
  return `https://opensea.io/item/${chainMeta(BASE_CHAIN_ID).slug}/${branch.troveNft}/${troveId}`;
}
