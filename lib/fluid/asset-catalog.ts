// Fluid (Instadapp) — contract coordinates + vault-shape helpers.
// ----------------------------------------------------------------------------
// Fluid has NO fixed market catalog: one vault contract per (collateral, debt)
// pair, minted sequentially by the VaultFactory (181+ and growing). Vault
// identity (pair symbols/decimals, vault type) rides on every API row from the
// backend's fluid_vault roster — this file only carries the protocol-level
// contract coordinates (provenance receipts, links) and the vault-type
// vocabulary.

export const FLUID_ADDRESSES = {
  /** The ERC721 position factory — every position NFT is minted here. */
  VAULT_FACTORY: "0x324c5dc1fc42c7a4d43d92df1eba58a54d13bf2d",
  /** The Liquidity layer — the central contract holding all Fluid funds. */
  LIQUIDITY: "0x52aa899454998be5b000ad077a46bbe360f4e497",
  /** VaultResolver — positionByNftId, the settled-position read. */
  VAULT_RESOLVER: "0xa5c3e16523eeeddcc34706b0e6be88b4c6ea95cc",
  /** VaultPositionsResolver — per-vault settled position sweeps (the overlay). */
  VAULT_POSITIONS_RESOLVER: "0xaa21a86030eaa16546a759d2d10fd3bf9d053bc7",
} as const;

/** Vault TYPE() codes. 10000 = plain token pair; the smart variants hold Fluid
 *  DEX pool shares on one or both legs (amounts render as shares). */
export type FluidVaultKind = "t1" | "smart-col" | "smart-debt" | "smart";

export function vaultKindOf(vaultType: number): FluidVaultKind {
  switch (vaultType) {
    case 20000:
      return "smart-col";
    case 30000:
      return "smart-debt";
    case 40000:
      return "smart";
    default:
      return "t1";
  }
}

export function vaultKindLabel(vaultType: number): string {
  switch (vaultKindOf(vaultType)) {
    case "smart-col":
      return "Smart collateral";
    case "smart-debt":
      return "Smart debt";
    case "smart":
      return "Smart collateral + debt";
    default:
      return "Standard pair";
  }
}

/** Display pair for a vault row — smart-vault legs have no ERC20 symbol (the
 *  "token" is a Fluid DEX pool); they render as shares, pool-named when the
 *  roster (or a chain read) has told us what the shares are OF. */
export function pairLabel(
  supplySymbol: string | null,
  borrowSymbol: string | null,
  supplyPoolPair?: readonly [string, string] | null,
  borrowPoolPair?: readonly [string, string] | null,
): string {
  const supply = supplySymbol ?? poolShareLabel(supplyPoolPair) ?? "DEX shares";
  const borrow = borrowSymbol ?? poolShareLabel(borrowPoolPair) ?? "DEX shares";
  return `${supply} / ${borrow}`;
}

/** A smart leg's display label when the pool's two sides are known: the vault
 *  names both itself, so "wstETH·ETH shares" says what the shares are OF. The
 *  quantity stays shares; nothing is converted and nothing extra is asserted. */
export function poolShareLabel(pair: readonly [string, string] | null | undefined): string | null {
  return pair ? `${pair[0]}·${pair[1]} shares` : null;
}

export function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Fluid's native-ETH sentinel — the address a vault names on a leg that holds
 *  native ETH rather than an ERC-20. It implements no `symbol()`, so a generic
 *  ERC-20 probe leaves the most common collateral on the protocol unnamed. The
 *  indexed roster resolves it by hand (workers/fluid-backfill/src/roster.mjs);
 *  the chain arm must reach the same answer or the two lanes disagree about
 *  what an ETH vault is called. 18 decimals, like native ETH. */
export const FLUID_ETH_SENTINEL = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

export function isFluidEthSentinel(addr: string | undefined | null): boolean {
  return Boolean(addr) && addr!.toLowerCase() === FLUID_ETH_SENTINEL;
}

/** The (col, debt) decimal pair that scales a Fluid oracle price: raw price =
 *  human debt-per-col × 1e(27 + debtDec − colDec), share legs at 18.
 *
 *  A Fluid vault oracle quotes the collateral IN THE DEBT TOKEN — the protocol
 *  runs no USD feed anywhere — so this scale is the only thing standing between
 *  the raw uint and the figure the liquidation engine judged with. It lives
 *  here, in the pure vocabulary, because BOTH arms need it and neither may own
 *  it: the chain arm reads `configs.oraclePrice*` off the resolver at head, and
 *  the api arm converts the at-block raw the price filler captured (mig 114).
 *  Two copies of this exponent would be two chances to be wrong by 1e12. */
export function fluidOraclePriceScale(colDecimals: number, debtDecimals: number): number {
  return 10 ** (27 + debtDecimals - colDecimals);
}
