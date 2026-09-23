// Liquity V2 (BOLD) mainnet contract catalog (chain-state tier).
// ----------------------------------------------------------------------------
// V2 is the REFERENCE deployment its forks (Ebisu, Asymmetry) copy: one
// stablecoin — BOLD — minted across THREE independent collateral branches
// (WETH / wstETH / rETH), each a full TroveManager / BorrowerOperations /
// SortedTroves / PriceFeed set. A Trove is an ERC-721 id (uint256) WITHIN its
// branch, so identity is (branch, troveId); SortedTroves is ordered by annual
// interest rate (redemptions sweep the LOWEST rate first), not by collateral
// ratio. All three collaterals are 18-decimal — unlike the forks' 8-decimal
// BTC branches — so the price scale lands uniformly at 1e18.
//
// This is the same V2 architecture the shared fork branch machinery reads
// (lib/sources/chain/liquity-fork-branches.ts): the getters, the fetchPrice
// simulation and the 1e(36 − decimals) price scale are identical, because the
// forks were cloned from HERE. Where V2 differs from the forks is real and
// followed below, not papered over: three branches (not five/seven), and the
// governance constants (MCR / CCR / SCR) live on each branch's own
// BorrowerOperations getters — not the forks' AddressesRegistry storage slot.
//
// Every address and constant is re-derived and asserted against the protocol's
// own getters by scripts/verify-liquity-chain.mjs (the only script that covers
// the reference deployment — the forks verifier has no V2 arm). The three
// TroveManagers here are the same ones lib/liquity/event-provenance.ts:127-129
// seeds the event pipeline with.

export interface LiquityV2Branch {
  /** Lowercase branch key (weth | wsteth | reth) — matches the TROVE_MANAGER
   *  keys in lib/liquity/event-provenance.ts and the collateral facet lower-cased. */
  key: string;
  /** Display collateral symbol (WETH | wstETH | rETH) — the exact form the
   *  /api/troves rows carry as `collateralType`, so branch → trove links match. */
  symbol: string;
  /** Registry index in the CollateralRegistry (0 = WETH, 1 = wstETH, 2 = rETH). */
  idx: number;
  /** Collateral token decimals — all three V2 branches are 18. */
  decimals: number;
  /** Collateral ERC20 address (lowercase). */
  collateralAddr: string;
  /** The branch's TroveManager — emits the trove events and answers
   *  getLatestTroveData / getEntireBranch{Debt,Coll}. */
  troveManager: string;
  /** The branch's BorrowerOperations — where MCR / CCR / SCR / BCR are read
   *  from (BO getters), chain-verified against TroveManager.CCR() as a cross-check. */
  borrowerOperations: string;
  /** The branch's own PriceFeed. lastGoodPrice is STALE between user ops — the
   *  lane simulates fetchPrice via eth_call. Scale 1e(36 − decimals). */
  priceFeed: string;
  /** The branch's SortedTroves — descending annual interest rate; the
   *  redemption queue. */
  sortedTroves: string;
  /** Governance constants (BorrowerOperations getters, chain-verified
   *  2026-07 — re-verify via scripts/verify-liquity-chain.mjs if V2
   *  governance moves them). MCR is the per-trove liquidation line; CCR gates
   *  branch-level borrowing; below SCR the branch can be shut down. */
  mcr: number;
  ccr: number;
  scr: number;
}

export const LIQUITY_V2_BRANCHES: Record<string, LiquityV2Branch> = {
  weth: {
    key: "weth",
    symbol: "WETH",
    idx: 0,
    decimals: 18,
    collateralAddr: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    troveManager: "0x7bcb64b2c9206a5b699ed43363f6f98d4776cf5a",
    borrowerOperations: "0x372abd1810eaf23cb9d941bbe7596dfb2c46bc65",
    priceFeed: "0xcc5f8102eb670c89a4a3c567c13851260303c24f",
    sortedTroves: "0xa25269e41bd072513849f2e64ad221e84f3063f4",
    mcr: 1.1,
    ccr: 1.5,
    scr: 1.1,
  },
  wsteth: {
    key: "wsteth",
    symbol: "wstETH",
    idx: 1,
    decimals: 18,
    collateralAddr: "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
    troveManager: "0xa2895d6a3bf110561dfe4b71ca539d84e1928b22",
    borrowerOperations: "0xa741a32f9dcfe6adba088fd0f97e90742d7d5da3",
    priceFeed: "0xe7aa2ba9e086a379d3beb224098bc634a46e314e",
    sortedTroves: "0x84eb85a8c25049255614f0536bea8f31682e86f1",
    mcr: 1.2,
    ccr: 1.6,
    scr: 1.2,
  },
  reth: {
    key: "reth",
    symbol: "rETH",
    idx: 2,
    decimals: 18,
    collateralAddr: "0xae78736cd615f374d3085123a210448e74fc6393",
    troveManager: "0xb2b2abeb5c357a234363ff5d180912d319e3e19e",
    borrowerOperations: "0xe8119fc02953b27a1b48d2573855738485a17329",
    priceFeed: "0x34f1e9c7dcc279ec70d3c4488eb2d80fba8b7b2b",
    sortedTroves: "0x14d8d8011df2b396ed2bbc4959bb73250324f386",
    mcr: 1.2,
    ccr: 1.6,
    scr: 1.2,
  },
};

/** BOLD — the shared debt token across every V2 branch (18 decimals). */
export const DEBT_SYMBOL = "BOLD";
