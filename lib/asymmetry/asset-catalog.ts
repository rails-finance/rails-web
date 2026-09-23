// Asymmetry Finance (Liquity V2 fork) contract catalog (chain-state tier).
// ----------------------------------------------------------------------------
// Asymmetry mints USDaf against SEVEN collateral branches, each its own
// TroveManager (unlike Liquity V1's single ETH Trove). A Trove is an NFT keyed by
// trove_id WITHIN its branch, so identity is (branch, troveId). Unlike Ebisu, every
// Asymmetry branch is 18-decimal — the BTC variants are wrapped to 18 (hence the
// WBTC18 / cbBTC18 keys), so there is no mixed-decimal branch to trip on. Debt is
// always USDaf (18).
//
// The live lane (2026-07-14 depth pass): each branch's PriceFeed sits at
// BorrowerOperations STORAGE SLOT 2; MCR/CCR/SCR are BO getters on this fork
// revision; the price scale is 1e18 (all branches 18-dec). Every address +
// constant below is re-derived and asserted from the TroveManagers themselves
// by scripts/verify-liquity-forks-chain.mjs.

import { chainMeta, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

export interface AsymmetryBranch {
  /** Lowercase branch key as stored in the MV (ysybold | scrvusd | susds | sfrxusd | tbtc | wbtc18 | cbbtc18). */
  key: string;
  /** Display collateral symbol (ysyBOLD | scrvUSD | sUSDS | sfrxUSD | tBTC | WBTC18 | cbBTC18). */
  symbol: string;
  /** Collateral token decimals — uniform 18 across every Asymmetry branch. */
  decimals: number;
  /** Collateral ERC20 address (lowercase) — the branch's own
   *  ActivePool.collToken(), which is what the verifier asserts it against.
   *  For the BTC branches that is the 18-decimal WRAPPER (WBTC18 0xe065Bc16…,
   *  cbBTC18 0x7fD713fe…), not the 8-decimal asset it wraps: naming the
   *  underlying here contradicts the `decimals: 18` beside it and sends every
   *  flow's token link to the wrong contract. */
  collateralAddr: string;
  /** The branch's TroveManager — emits TroveUpdated / TroveOperation. */
  troveManager: string;
  /** The branch's own PriceFeed (BO storage slot 2, chain-verified). The lane
   *  simulates fetchPrice via eth_call (lastGoodPrice lags between user ops). */
  priceFeed: string;
  /** The branch's SortedTroves — descending annual interest rate; the
   *  redemption queue. */
  sortedTroves: string;
  /** The branch's TroveNFT — the ERC-721 a Trove IS, token id = trove id.
   *  Read back from `TroveManager.troveNFT()` on mainnet 2026-09-20, each
   *  cross-checked by its own `troveManager()` backpointer. */
  troveNft: string;
  /** Governance constants (BorrowerOperations getters, chain-verified
   *  2026-07-14 — re-verify via the script if governance moves them). */
  mcr: number;
  ccr: number;
  scr: number;
}

export const ASYMMETRY_BRANCHES: Record<string, AsymmetryBranch> = {
  ysybold: {
    key: "ysybold",
    symbol: "ysyBOLD",
    decimals: 18,
    collateralAddr: "0x23346b04a7f55b8760e5860aa5a77383d63491cd",
    troveManager: "0xf8a25a2e4c863bb7cea7e4b4eeb3866bb7f11718",
    priceFeed: "0x7f575323ddedfbad449fef5459fad031fe49520b",
    sortedTroves: "0x98d9b02b41cc2f8e72775da528401a33765bc166",
    troveNft: "0x63321ee523a8d4e23c65a9206da5a755dd6a72fe",
    mcr: 1.1,
    ccr: 1.2,
    scr: 1.05,
  },
  scrvusd: {
    key: "scrvusd",
    symbol: "scrvUSD",
    decimals: 18,
    collateralAddr: "0x0655977feb2f289a4ab78af67bab0d17aab84367",
    troveManager: "0x7aff0173e3d7c5416d8caa3433871ef07568220d",
    priceFeed: "0xf125c72ae447efdf3fa3601eda9ac0ebec06cbb8",
    sortedTroves: "0x233817bd6970f2ec7f6963b02ab941dec0a87a70",
    troveNft: "0x5aad68387cec384dc4d7af6bfc23f4f05e424d85",
    mcr: 1.1,
    ccr: 1.2,
    scr: 1.05,
  },
  susds: {
    key: "susds",
    symbol: "sUSDS",
    decimals: 18,
    collateralAddr: "0xa3931d71877c0e7a3148cb7eb4463524fec27fbd",
    troveManager: "0x53ce82ac43660aab1f80fecd1d74afe7a033d505",
    priceFeed: "0x2113468843cf2d0fd976690f4ec6e4213df46911",
    sortedTroves: "0x1d9cc5a514368e6f28eba79b2db8fa5c9484b058",
    troveNft: "0x0f462915322cc2ca01f2e1e3dc7c598c43929b55",
    mcr: 1.1,
    ccr: 1.2,
    scr: 1.05,
  },
  sfrxusd: {
    key: "sfrxusd",
    symbol: "sfrxUSD",
    decimals: 18,
    collateralAddr: "0xcf62f905562626cfcdd2261162a51fd02fc9c5b6",
    troveManager: "0x478e7c27193aca052964c3306d193446027630b0",
    priceFeed: "0x653df748bf7a692555dcdbf4c504a8c84807f7c7",
    sortedTroves: "0x7c1765fd1ab5afaed4a0a0ac74b2e4c45f5a5572",
    troveNft: "0x6563200449414f8d147d34d0f043045e48ddc89f",
    mcr: 1.1,
    ccr: 1.2,
    scr: 1.05,
  },
  tbtc: {
    key: "tbtc",
    symbol: "tBTC",
    decimals: 18,
    collateralAddr: "0x18084fba666a33d37592fa2633fd49a74dd93a88",
    troveManager: "0xfb17d0402ae557e3efa549812b95e931b2b63bce",
    priceFeed: "0xeaf3b36748d89d64ef1b6b3e1d7637c3e4745094",
    sortedTroves: "0xd7a4d09680b8211940f19e1d1d25dc6568a4e0d0",
    troveNft: "0x7ff33ef1a2dcb95c711cc13b890be183f6288e6b",
    mcr: 1.2,
    ccr: 1.5,
    scr: 1.1,
  },
  wbtc18: {
    key: "wbtc18",
    symbol: "WBTC18",
    decimals: 18,
    collateralAddr: "0xe065bc161b90c9c4bba2de7f1e194b70a3267c47",
    troveManager: "0x7bd47eca45ee18609d3d64ba683ce488ca9320a3",
    priceFeed: "0x4b74d043336678d2f62dae6595bc42dccabc3bb1",
    sortedTroves: "0x4b677b2c2bdaa64bca08c62c4596d526e319ea7b",
    troveNft: "0xcc47da99965e3c8dd89b6e9305bb10232a314d23",
    mcr: 1.2,
    ccr: 1.5,
    scr: 1.1,
  },
  cbbtc18: {
    key: "cbbtc18",
    symbol: "cbBTC18",
    decimals: 18,
    collateralAddr: "0x7fd713fe57fcd0a7636c152faba6bdc2d3b27d15",
    troveManager: "0x0291c873838f7b62d743952d268bebe9ace1efa4",
    priceFeed: "0xaf99e6cf5832222c0e22ef6bf0868c4ed7f2953f",
    sortedTroves: "0x2e937bbf06ad085e98d6eddec887589d61edd3b7",
    troveNft: "0x274d12cc490d93371e36e1204ae4988cb83d26a5",
    mcr: 1.2,
    ccr: 1.5,
    scr: 1.1,
  },
};

/** USDaf — the shared debt token across every branch (18 decimals). */
export const DEBT_SYMBOL = "USDaf";
/** Minimum Trove debt (display units) — `MIN_DEBT = 2000e18` in the verified
 *  BorrowerOperations source (Etherscan, 2026-08-11). Owner operations enforce
 *  the floor, so only a redemption can leave an open Trove below it — an open
 *  Trove under this floor is a ZOMBIE (V2 status 4, outside the rate-ordered
 *  redemption queue, redeemed first). */
export const MIN_DEBT = 2000;
export const DEBT_ADDRESS = "0x9cf12ccd6020b6888e4d4c4e4c7aca33c1eb91f8";
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
  Object.values(ASYMMETRY_BRANCHES).map((b) => [b.symbol.toLowerCase(), b.key]),
);

/** Resolve a branch from a display symbol or a branch key (any case). */
export function resolveBranch(collateralType: string | undefined | null): AsymmetryBranch | undefined {
  if (!collateralType) return undefined;
  const c = collateralType.trim().toLowerCase();
  const key = SYMBOL_TO_KEY[c] ?? (ASYMMETRY_BRANCHES[c] ? c : undefined);
  return key ? ASYMMETRY_BRANCHES[key] : undefined;
}

/** Short, copy-friendly form of a trove id (long uint256) or address. */
export const shortId = (id: string): string => (id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id);

/** OpenSea link for a Trove NFT — the same host/path pattern the rest of the
 *  Liquity family uses (`getTroveNftUrl`, `getBasedollarTroveNftUrl`), built
 *  from this branch's own `troveNft` address and the mainnet chain slug from
 *  `lib/shared/chains.ts`. Null when the branch can't be resolved. */
export function getAsymmetryTroveNftUrl(collateralType: string | undefined | null, troveId: string): string | null {
  const branch = resolveBranch(collateralType);
  if (!branch || !troveId) return null;
  return `https://opensea.io/item/${chainMeta(MAINNET_CHAIN_ID).slug}/${branch.troveNft}/${troveId}`;
}
