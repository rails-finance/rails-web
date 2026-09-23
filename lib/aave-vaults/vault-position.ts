// A vault POSITION — the pair `(vault, holder)` — and what the two lanes behind
// it each say about it.
// ----------------------------------------------------------------------------
// The Vaults section had a directory of VAULTS and a lookup that answered one
// address at a time. A position listing needs a third thing: the SET of
// participants, which no `eth_call` answers. That set comes from the census —
// one whole-`Transfer` sweep per vault, proven complete by Σ `balanceOf` ==
// `totalSupply()` wei-exact, run daily on the box and stored — and a row here
// carries the census's answer at the census block.
//
// TWO LANES, NEVER MERGED INTO ONE FIGURE:
//
//   • `census` — membership and the counted facts (transfers, first block, last
//     block, the holder's shape) at the CENSUS block. Complete at that block by
//     construction; a day old at worst, and the block it was read at is stated
//     on every surface that draws it.
//   • `live` — `balanceOf`, `convertToAssets(balanceOf)` and `totalSupply()`,
//     read for the cards on ONE page at ONE block, now. Null means the read did
//     not answer: an unread figure is stated as unread, and a card then draws
//     its census figures LABELLED as census figures. Null is never a zero, and
//     a zero here is a reading.
//
// The two can disagree — a holder who closed since the census, or opened since
// it (the census is membership, so an address it has never seen has no row at
// all until the next tick). Where they disagree the card says so rather than
// showing either alone.
//
// ONE PRICED FIGURE, AND IT IS THE CENSUS'S. Shares are share units, a claim is
// the vault's own `convertToAssets` answer in the asset's units, and a share of
// the vault is two integers in the same units divided by each other. The one
// USD figure a row carries (`value`) is computed by the census at the census
// block — the balance through the vault's own `convertToAssets` and the chain's
// Aave V3 oracle (`IAaveOracle.getAssetPrice`), the oracle named — so a listing
// can rest on one unit across vaults whose shares are USDC, WETH and cbBTC. A
// vault that oracle does not price carries a null value and is stated as
// unpriced, never guessed (chain-truth charter S3). No rate, no yield, no P&L.

import type { AaveVaultFamily } from "@/lib/aave-vaults/vault-catalog";
import type { RawAmount } from "@/lib/sources/chain/morpho-base-vault";

/** The families a census row can carry, across every chain that has one.
 *
 *  Aave's three on Ethereum, and MetaMorpho's one on Base — the census writes
 *  `morpho` for every catalogued Base vault, because on that chain the family
 *  is the vault STANDARD (MetaMorpho on Morpho Blue) rather than three
 *  mechanics deployed by one issuer. A single-valued axis is not a facet, so
 *  Base's listing offers no family menu and the word only ever appears on a
 *  card, beside the share symbol, as the mechanism that vault runs on. The
 *  curator who runs it is a NAME and never reaches a row. */
export type VaultPositionFamily = AaveVaultFamily | "morpho";

/** The holder-shape vocabulary the census classifier writes, which is the same
 *  set `AaveVaultHolderShape["kind"]` carries on the vault page — the two
 *  surfaces must say one thing about one address. */
export type VaultPositionShape =
  | "eoa"
  | "delegated-account"
  | "safe"
  | "erc4626"
  | "erc1967-proxy"
  | "eip1167-proxy"
  | "contract"
  | "aave-vault"
  | "metamorpho-vault";

export const VAULT_POSITION_SHAPES: readonly VaultPositionShape[] = [
  "eoa",
  "delegated-account",
  "safe",
  "erc4626",
  "erc1967-proxy",
  "eip1167-proxy",
  "contract",
  "aave-vault",
  "metamorpho-vault",
];

/** The shape as a card states it: ONE MECHANISM WORD, never an app. A wallet
 *  says nothing at all — "externally owned account" is the absence of code, and
 *  a row that printed it for the eight thousand of them would be saying nothing
 *  eight thousand times. */
export const VAULT_SHAPE_WORD: Record<VaultPositionShape, string | null> = {
  eoa: null,
  "delegated-account": "delegated account",
  safe: "Safe",
  erc4626: "ERC-4626 vault",
  "erc1967-proxy": "proxy",
  "eip1167-proxy": "proxy",
  contract: "contract",
  "aave-vault": "a vault in this catalogue",
  "metamorpho-vault": "a vault in this catalogue",
};

/** The shape as a FACET names it — the menu says the mechanism in full,
 *  including the wallet case the card leaves silent. */
export const VAULT_SHAPE_FACET_LABEL: Record<VaultPositionShape, string> = {
  eoa: "Wallet (no code)",
  "delegated-account": "Delegated account",
  safe: "Safe",
  erc4626: "ERC-4626 vault",
  "erc1967-proxy": "Proxy (EIP-1967)",
  "eip1167-proxy": "Proxy (EIP-1167)",
  contract: "Contract",
  "aave-vault": "A vault in this catalogue",
  "metamorpho-vault": "A vault in this catalogue",
};

export const isVaultPositionShape = (v: string): v is VaultPositionShape =>
  (VAULT_POSITION_SHAPES as readonly string[]).includes(v);

/** What the census counted about one `(vault, holder)` pair, at ONE block. */
export interface VaultPositionCensus {
  /** The block the sweep ran to. Every field beside it is at that block. */
  block: number;
  /** `balanceOf(holder)` at the census block, in raw share units. */
  balance: string;
  /** Was that balance above zero at the census block? */
  live: boolean;
  /** How many `Transfer` logs of this vault named this address, either side. */
  transferCount: number;
  firstBlock: number;
  lastBlock: number;
  /** The classification of the holder's own code at the census block. Null when
   *  the census stored none — stated as unread, never guessed. */
  shape: VaultPositionShape | null;
  /** The classifier's evidence (code size, a delegate, a singleton …). Opaque
   *  here: the card states a mechanism word and the receipt states the read. */
  shapeDetail: Record<string, unknown> | null;
  /** This balance over the vault's `totalSupply()` at the census block, in
   *  parts per million to six places — a decimal string. Null when the vault
   *  had no supply. The cross-vault ORDER the raw shares sort never was. */
  sharePpm: string | null;
}

/** The one priced figure, and everything its receipt states — all read by the
 *  census at ONE block (`pricedBlock`), never at page time. `usdE8` null means
 *  UNPRICED: the oracle reverted or answered zero for the asset (and, on
 *  Ethereum, for its underlying), which the card says in words. The other
 *  fields are still carried so the receipt can name which oracle declined
 *  which asset. */
export interface VaultPositionValue {
  /** The position's value in USD × 1e8, truncated, as a decimal string. */
  usdE8: string | null;
  /** The block every field here was read at. Null when the census has not
   *  priced this vault at all (the columns are empty, not declined). */
  pricedBlock: number | null;
  /** The `IAaveOracle` the price came from, resolved from the chain's
   *  PoolAddressesProvider at run time. */
  oracle: string | null;
  /** The address the oracle was asked for — the vault's asset, or (a stata
   *  hop) that asset's own underlying. */
  pricedAsset: string | null;
  /** `getAssetPrice(pricedAsset)`, 8-dec USD, as a decimal string. */
  oraclePriceE8: string | null;
  /** The vault's `asset()`, its symbol and decimals as the census read them. */
  asset: string | null;
  assetSymbol: string | null;
  assetDecimals: number | null;
  /** `convertToAssets(10^shareDecimals)` — one whole share in asset units. */
  shareUnitAssets: string | null;
  /** The stata hop, when the oracle priced the underlying rather than the
   *  asset: one whole asset (10^assetDecimals) in underlying units, and the
   *  underlying's decimals. Both null where no hop was taken. */
  underlyingUnitAssets: string | null;
  underlyingDecimals: number | null;
}

/** The overlay the proxy reads for the cards on ONE page, at ONE block. */
export interface VaultPositionLive {
  /** The block every figure in this object was read at. */
  blockNumber: number;
  /** `balanceOf(holder)` now, in raw share units. */
  shares: RawAmount;
  /** `convertToAssets(shares)` — the vault's own answer, in the asset's units.
   *  Null = the call did not answer, which is stated rather than divided out. */
  claim: RawAmount | null;
  /** `totalSupply()` of the share token at the same block. Null = unread. */
  totalSupply: RawAmount | null;
  /** `shares > 0` at THIS block — the live/closed reading now, which may differ
   *  from the census's reading at the census block. */
  live: boolean;
}

/** One row of the listing. */
export interface VaultPositionRow {
  chainId: number;
  /** Lowercased. */
  vault: string;
  /** Lowercased. */
  holder: string;
  family: VaultPositionFamily;
  /** The share token's `symbol()` as the census read it. Null = unread. */
  symbol: string | null;
  /** The share token's `decimals()` as the census read it. Null = unread. */
  shareDecimals: number | null;
  census: VaultPositionCensus;
  /** Null when the page carried no overlay, or when this card's live read did
   *  not answer. The card says which. */
  live: VaultPositionLive | null;
  /** The asset `convertToAssets` answers in — the catalogue's own read, carried
   *  so the card can name the unit beside the claim. Null = unread. */
  asset: { address: string; symbol: string; decimals: number } | null;
  /** Block timestamps for the census's first/last blocks, unix seconds, read at
   *  those blocks. Null = the read did not answer; the card then states the
   *  block alone rather than a date it does not have. */
  firstSeenAt: number | null;
  lastActivityAt: number | null;
  /** The census-block USD figure and its receipt inputs — composed by the
   *  proxy from the row and its vault's census header. */
  value: VaultPositionValue;
}

/** One vault's census header — the facet universe and the block line come with
 *  every page, so neither is ever sized from a page of rows. */
export interface VaultCensusRow {
  chainId: number;
  vault: string;
  family: VaultPositionFamily;
  symbol: string | null;
  shareDecimals: number | null;
  censusBlock: number;
  /** Every address the sweep saw, live and closed. Zero is a reading. */
  participants: number;
  /** How many of them held something at the census block. */
  liveCount: number;
  /** Did Σ `balanceOf` == `totalSupply()` wei-exact? A false here means the set
   *  is not proven whole and the page must say so rather than list it. */
  sumMatches: boolean;
  /** When the row was written, ISO-8601. */
  loadedAt: string;
  // ── the price inputs (mig 206), all at `pricedBlock`; every one nullable ──
  /** `totalSupply()` at the census block, raw share units. */
  totalSupply?: string | null;
  asset?: string | null;
  assetSymbol?: string | null;
  assetDecimals?: number | null;
  shareUnitAssets?: string | null;
  pricedAsset?: string | null;
  underlyingUnitAssets?: string | null;
  underlyingDecimals?: number | null;
  oracle?: string | null;
  /** Null = the oracle declined the asset (revert or zero): the vault is
   *  UNPRICED and every one of its rows carries a null value. */
  oraclePriceE8?: string | null;
  pricedBlock?: number | null;
}

/** The value object a row carries, built from its vault's census header. */
export function vaultPositionValueFrom(
  census: Pick<
    VaultCensusRow,
    | "oracle"
    | "pricedAsset"
    | "oraclePriceE8"
    | "pricedBlock"
    | "asset"
    | "assetSymbol"
    | "assetDecimals"
    | "shareUnitAssets"
    | "underlyingUnitAssets"
    | "underlyingDecimals"
  > | null,
  usdE8: string | null,
): VaultPositionValue {
  return {
    usdE8: usdE8 ?? null,
    pricedBlock: census?.pricedBlock ?? null,
    oracle: census?.oracle ?? null,
    pricedAsset: census?.pricedAsset ?? null,
    oraclePriceE8: census?.oraclePriceE8 ?? null,
    asset: census?.asset ?? null,
    assetSymbol: census?.assetSymbol ?? null,
    assetDecimals: census?.assetDecimals ?? null,
    shareUnitAssets: census?.shareUnitAssets ?? null,
    underlyingUnitAssets: census?.underlyingUnitAssets ?? null,
    underlyingDecimals: census?.underlyingDecimals ?? null,
  };
}

/** The USD figure as a number of dollars, or null where unpriced. 1e8 is well
 *  inside a double's exact range for any value a vault position can hold. */
export function vaultPositionUsd(row: VaultPositionRow): number | null {
  return row.value.usdE8 == null ? null : Number(row.value.usdE8) / 1e8;
}

/** Is this vault one the census's oracle declined? True only when the vault
 *  WAS priced (a priced block exists) and still carries no price — the columns
 *  being empty because the census has not run its price pass yet is a
 *  different absence, which the card also states differently. */
export function vaultIsUnpricedByOracle(c: Pick<VaultCensusRow, "pricedBlock" | "oraclePriceE8">): boolean {
  return c.pricedBlock != null && c.oraclePriceE8 == null;
}

/** The USD print rule — dollars and cents, en-US, the sign in front. A value
 *  below one cent that is not zero prints its exact 1e-8 dollars instead, so
 *  a $0.000012 position never reads as "$0.00" (a zero the chain did not say). */
export function usdText(usdE8: string): string {
  const e8 = BigInt(usdE8);
  const negative = e8 < BigInt(0);
  const abs = negative ? -e8 : e8;
  const cents = abs / BigInt(1_000_000);
  const dollars = Number(cents) / 100;
  if (abs !== BigInt(0) && cents === BigInt(0)) {
    const frac = (abs % BigInt(100_000_000)).toString().padStart(8, "0").replace(/0+$/, "");
    return `${negative ? "-" : ""}$0.${frac}`;
  }
  return `${negative ? "-" : ""}$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface VaultPositionsResult {
  data: VaultPositionRow[];
  pagination: { total: number; limit: number; offset: number };
  census: VaultCensusRow[];
  /** The block the overlay was read at, or null when no overlay was read. */
  blockNumber: number | null;
  /** The lane's OWN `finalized` block, read in the same request as the block
   *  above — never `latest − k` and never a constant. It is the cut the
   *  section's history store keeps rows below, and the distance between the two
   *  is a chain answer that moves: about 65 blocks on Ethereum and about 650 on
   *  Base, both stepping rather than creeping. Null where the lane would not
   *  answer the tag, or where no overlay was read. */
  finalizedBlock: number | null;
}

/** A position's identity, on the wire and in the listing's `keyFor`. */
export const vaultPositionKey = (r: { vault: string; holder: string }) =>
  `${r.vault.toLowerCase()}:${r.holder.toLowerCase()}`;

/** The lifecycle the CARD draws. `live` is the live read where there is one and
 *  the census's reading otherwise; `divergent` is true when the two lanes
 *  disagree, which the card states in words rather than resolving silently. */
export function vaultPositionStatus(r: VaultPositionRow): {
  live: boolean;
  divergent: boolean;
  at: number;
} {
  if (!r.live) return { live: r.census.live, divergent: false, at: r.census.block };
  return { live: r.live.live, divergent: r.live.live !== r.census.live, at: r.live.blockNumber };
}

/** The holder's fraction of the share token at the overlay's block. Null when
 *  either read is missing — an unstated ratio, never a zero. */
export function vaultPositionFraction(r: VaultPositionRow): number | null {
  if (!r.live?.totalSupply) return null;
  const supply = BigInt(r.live.totalSupply.raw);
  if (supply === BigInt(0)) return null;
  return Number(BigInt(r.live.shares.raw)) / Number(supply);
}

/** The same dust rule the vault page uses: a fraction that rounds to nothing at
 *  four significant figures beside a non-zero balance, where the exact share
 *  count is the only truthful thing to print. */
export function vaultPositionIsDust(r: VaultPositionRow): boolean {
  const f = vaultPositionFraction(r);
  return f != null && f > 0 && f < 0.000001;
}
