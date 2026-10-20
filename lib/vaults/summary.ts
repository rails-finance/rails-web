// One vault, in the shape every family's roster states it (rails-ops ui-jobs
// 407, step 1; survey 2026-10-20 §6 "Naming, anatomy, code").
// ----------------------------------------------------------------------------
// The three directory loaders (Morpho Base, Aave Ethereum, Yearn Ethereum) each
// read their family's own row; the functions below turn each into a
// `VaultSummary`, the shape the vault row (V1) and the cross-protocol index
// (ui-jobs 39) draw. Each field is the reading its loader already made: no
// new chain read, and a figure the family's directory does not read is null
// here rather than guessed (Yearn's directory reads no `totalSupply()`, so its
// summary carries none).
//
// Type-only imports of the loaders: a client component may read this module.

import type { MorphoBaseVaultResponse, RawAmount } from "@/lib/sources/chain/morpho-base-vault";
import type { AaveEthereumVaultResponse } from "@/lib/sources/chain/aave-ethereum-vault";
import type { YearnVaultResponse } from "@/lib/sources/chain/yearn-ethereum-vault";
import type {
  MorphoBaseVaultDirectoryResponse,
  MorphoBaseVaultDirectoryRow,
} from "@/lib/sources/chain/morpho-base-vault-directory";
import type {
  AaveEthereumVaultDirectoryResponse,
  AaveEthereumVaultRow,
} from "@/lib/sources/chain/aave-ethereum-vault-directory";
import type {
  YearnVaultDirectoryResponse,
  YearnVaultDirectoryRow,
} from "@/lib/sources/chain/yearn-ethereum-vault-directory";
import type { VaultCensusRow } from "@/lib/aave-vaults/vault-position";
import { releaseLabel, type VaultFamily } from "@/lib/vaults/families";

/** What the chain or the venue states about a vault's standing, as a pill
 *  reads it. `endorsed`: Yearn's Registry endorses it. `shut-down`: the vault
 *  answers `isShutdown()` true. `paused`: the vault says deposits are paused.
 *  `address-book`: Aave publishes the address in its own address book. */
export type VaultStanding = "endorsed" | "shut-down" | "paused" | "address-book";

/** Who runs the vault, by the role the contract names: a MetaMorpho
 *  `curator()` (or its `owner()` where no curator is named), an Umbrella
 *  stake token's `owner()`, a Yearn V3 vault's `role_manager()`. An address:
 *  names wait on attestation (decision 0017 point 5). */
export interface VaultSteward {
  role: "curator" | "owner" | "roleManager";
  address: string;
}

export interface VaultSummary {
  chainId: number;
  /** Lowercased: the vault's identity and its page's route. */
  address: string;
  family: VaultFamily;
  /** The factory's version ("v1.1") or the vault's `apiVersion()` ("3.0.4");
   *  null for a family with one release. */
  release: string | null;
  /** The family and release as a pill reads them ("MetaMorpho V1.1"). */
  releaseLabel: string;
  /** `name()` at the read block; null where it did not answer. */
  name: string | null;
  /** The name the catalogue recorded at its own block, where there is one: the
   *  row shows it, labelled, when `name` is null. */
  catalogName: string | null;
  /** The share token's ticker: read at the block (Aave) or the catalogue's
   *  snapshot (Yearn); null where neither is held (Morpho's directory). */
  symbol: string | null;
  /** The ERC-4626 underlying. `named` is false where `symbol()` did not decode. */
  asset: { address: string; symbol: string; decimals: number; named: boolean };
  /** The share token's decimals; null where it is not known. */
  shareDecimals: number | null;
  /** `totalAssets()` at the read block, in the asset. Null = not read. */
  totalAssets: RawAmount | null;
  /** `totalSupply()` at the read block, in shares. Null = not read. */
  totalSupply: RawAmount | null;
  /** One whole share in the asset, `convertToAssets(10 ** shareDecimals)`. */
  sharePrice: RawAmount | null;
  /** Null where the directory reads no steward, or the role is unread. A
   *  steward of the zero address is a reading (ownership renounced). */
  steward: VaultSteward | null;
  /** What the chain or the venue states; empty where it states nothing. */
  standing: VaultStanding[];
  /** The block the vault was created in, where the catalogue holds it. */
  createdBlock: number | null;
  /** The position census for this vault: every address it counted, live and
   *  closed (a floor), and how many held shares at its block. Null where there
   *  is no census (Yearn) or the census did not answer. */
  census: { holders: number; live: number; sumMatches: boolean; atBlock: number } | null;
  /** The block every figure above was read at, and when that read was taken. */
  readAt: { block: number; timestamp: string };
}

const readAt = (d: { blockNumber: number; readAt: string }) => ({ block: d.blockNumber, timestamp: d.readAt });

/** Census rows by lowercased vault address. */
export function censusByVault(rows: readonly VaultCensusRow[]): Map<string, VaultCensusRow> {
  const by = new Map<string, VaultCensusRow>();
  for (const c of rows) by.set(c.vault.toLowerCase(), c);
  return by;
}

function censusOf(c: VaultCensusRow | undefined): VaultSummary["census"] {
  return c == null
    ? null
    : { holders: c.participants, live: c.liveCount, sumMatches: c.sumMatches, atBlock: c.censusBlock };
}

/** A MetaMorpho vault on Base. The steward is `curator()`, else `owner()`. */
export function morphoBaseVaultSummary(
  r: MorphoBaseVaultDirectoryRow,
  d: MorphoBaseVaultDirectoryResponse,
  census?: VaultCensusRow,
): VaultSummary {
  return {
    chainId: 8453,
    address: r.address,
    family: "metamorpho",
    release: r.factory,
    releaseLabel: releaseLabel("metamorpho", r.factory),
    name: r.name,
    catalogName: r.censusName,
    symbol: null,
    asset: r.asset,
    // Every MetaMorpho share answers 18 to `decimals()` for the assets this
    // catalogue holds (the loader's header).
    shareDecimals: 18,
    totalAssets: r.totalAssets,
    totalSupply: r.totalSupply,
    sharePrice: r.sharePrice,
    steward: r.curator ? { role: "curator", address: r.curator } : r.owner ? { role: "owner", address: r.owner } : null,
    standing: [],
    createdBlock: r.createdBlock,
    census: censusOf(census),
    readAt: readAt(d),
  };
}

export const morphoBaseVaultSummaries = (
  d: MorphoBaseVaultDirectoryResponse,
  census: readonly VaultCensusRow[] = [],
): VaultSummary[] => {
  const by = censusByVault(census);
  return d.rows.map((r) => morphoBaseVaultSummary(r, d, by.get(r.address)));
};

/** An Aave vault on Ethereum. `bookAddress` says whether Aave's address book
 *  publishes this address (lib/aave-vaults/vault-catalog.ts
 *  `aaveVaultAttestation`); the directory reads no steward. */
export function aaveEthereumVaultSummary(
  r: AaveEthereumVaultRow,
  d: AaveEthereumVaultDirectoryResponse,
  inBook: boolean,
  census?: VaultCensusRow,
): VaultSummary {
  return {
    chainId: 1,
    address: r.address,
    family: r.family,
    release: null,
    releaseLabel: releaseLabel(r.family, null),
    name: r.name,
    catalogName: null,
    symbol: r.symbol,
    asset: r.asset,
    shareDecimals: r.shareDecimals,
    totalAssets: r.totalAssets,
    totalSupply: r.totalSupply,
    sharePrice: r.sharePrice,
    steward: null,
    standing: inBook ? ["address-book"] : [],
    createdBlock: null,
    census: censusOf(census),
    readAt: readAt(d),
  };
}

export const aaveEthereumVaultSummaries = (
  d: AaveEthereumVaultDirectoryResponse,
  inBook: (address: string) => boolean,
  census: readonly VaultCensusRow[] = [],
): VaultSummary[] => {
  const by = censusByVault(census);
  return d.rows.map((r) => aaveEthereumVaultSummary(r, d, inBook(r.address), by.get(r.address)));
};

/** A Yearn V3 vault on Ethereum. Its share has the asset's decimals (Yearn V3's
 *  `decimals()` returns the asset's); the directory reads no `totalSupply()`
 *  and no role manager, and there is no census. */
export function yearnVaultSummary(r: YearnVaultDirectoryRow, d: YearnVaultDirectoryResponse): VaultSummary {
  const standing: VaultStanding[] = [];
  if (r.endorsed === true) standing.push("endorsed");
  if (r.shutdown === true) standing.push("shut-down");
  return {
    chainId: 1,
    address: r.address,
    family: "yearn-v3",
    release: r.apiVersion,
    releaseLabel: releaseLabel("yearn-v3", r.apiVersion),
    name: r.name,
    catalogName: r.censusName,
    symbol: r.censusSymbol,
    asset: r.asset,
    shareDecimals: r.asset.decimals,
    totalAssets: r.totalAssets,
    totalSupply: null,
    sharePrice: r.sharePrice,
    steward: null,
    standing,
    createdBlock: r.createdBlock,
    census: null,
    readAt: readAt(d),
  };
}

export const yearnVaultSummaries = (d: YearnVaultDirectoryResponse): VaultSummary[] =>
  d.rows.map((r) => yearnVaultSummary(r, d));

/** The name a row prints: the live `name()`, else the catalogue's snapshot,
 *  else the share symbol, else null (the row then prints the address). */
export const vaultDisplayName = (v: VaultSummary): string | null => v.name ?? v.catalogName ?? v.symbol;

// ── The vault pages' reads (V2) ─────────────────────────────────────────────
// Each vault page reads its vault at one block with its own loader; these turn
// that read into the same shape, so the card and the row draw one summary.

/** A MetaMorpho vault's page read. */
export function morphoBaseVaultPageSummary(d: MorphoBaseVaultResponse, census: VaultCensusRow | null): VaultSummary {
  const v = d.vault;
  return {
    chainId: 8453,
    address: v.address.toLowerCase(),
    family: "metamorpho",
    release: v.factory,
    releaseLabel: releaseLabel("metamorpho", v.factory),
    name: v.name || null,
    catalogName: null,
    symbol: v.symbol || null,
    asset: v.asset,
    shareDecimals: v.decimals,
    totalAssets: d.totalAssets,
    totalSupply: d.totalSupply,
    sharePrice: d.sharePrice,
    steward: v.curator ? { role: "curator", address: v.curator } : { role: "owner", address: v.owner },
    standing: [],
    createdBlock: v.createdBlock,
    census: censusOf(census ?? undefined),
    readAt: { block: d.blockNumber, timestamp: "" },
  };
}

/** An Aave vault's page read. sGHO's `paused()` is a standing. */
export function aaveEthereumVaultPageSummary(
  d: AaveEthereumVaultResponse,
  inBook: boolean,
  census: VaultCensusRow | null,
): VaultSummary {
  const v = d.vault;
  const standing: VaultStanding[] = [];
  if (d.sgho?.paused === true) standing.push("paused");
  if (inBook) standing.push("address-book");
  return {
    chainId: 1,
    address: v.address.toLowerCase(),
    family: v.family,
    release: null,
    releaseLabel: releaseLabel(v.family, null),
    name: v.name,
    catalogName: null,
    symbol: v.symbol,
    asset: v.asset,
    shareDecimals: v.shareDecimals,
    totalAssets: d.totalAssets,
    totalSupply: d.totalSupply,
    sharePrice: d.sharePrice,
    steward: d.umbrella?.owner ? { role: "owner", address: d.umbrella.owner } : null,
    standing,
    createdBlock: null,
    census: censusOf(census ?? undefined),
    readAt: { block: d.blockNumber, timestamp: "" },
  };
}

/** A Yearn V3 vault's page read. There is no census. */
export function yearnVaultPageSummary(d: YearnVaultResponse): VaultSummary {
  const v = d.vault;
  const standing: VaultStanding[] = [];
  if (v.endorsed === true) standing.push("endorsed");
  if (v.shutdown === true) standing.push("shut-down");
  return {
    chainId: 1,
    address: v.address.toLowerCase(),
    family: "yearn-v3",
    release: v.apiVersion,
    releaseLabel: releaseLabel("yearn-v3", v.apiVersion),
    name: v.name,
    catalogName: v.censusName,
    symbol: v.symbol,
    asset: v.asset,
    shareDecimals: v.shareDecimals,
    totalAssets: v.totalAssets,
    totalSupply: v.totalSupply,
    sharePrice: v.sharePrice,
    steward: v.roleManager ? { role: "roleManager", address: v.roleManager } : null,
    standing,
    createdBlock: v.createdBlock,
    census: null,
    readAt: { block: d.blockNumber, timestamp: "" },
  };
}
