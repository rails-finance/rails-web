// The rosters the cross-protocol vault index reads (rails-ops ui-jobs 39), as
// the page and its rows name them. Client-safe: the read is lib/vaults/index-read.ts.

import { CHAINS, type ChainId } from "@/lib/shared/chains";
import { isUnlaunchedPath } from "@/lib/shared/protocols";
import type { VaultSummary } from "@/lib/vaults/summary";
import {
  baseVaultHref,
  baseVaultRosterHref,
  baseVaultsListingHref,
  ethereumVaultHref,
  ethereumVaultRosterHref,
  ethereumVaultsListingHref,
  maplePoolsHref,
  yearnVaultHref,
  yearnVaultRosterHref,
} from "@/lib/vaults/routes";

/** One protocol's roster: the Protocol facet's value and the row's protocol. */
export type VaultIndexProtocol = "morpho" | "aave" | "yearn" | "maple";

export const VAULT_INDEX_PROTOCOLS: readonly VaultIndexProtocol[] = ["morpho", "aave", "yearn", "maple"];

export const VAULT_INDEX_PROTOCOL_LABEL: Record<VaultIndexProtocol, string> = {
  morpho: "Morpho",
  aave: "Aave",
  yearn: "Yearn",
  maple: "Maple",
};

/** One roster as the index read it: its block, its count, and what its
 *  count sentence's receipt needs. */
export interface VaultIndexRoster {
  protocol: VaultIndexProtocol;
  chainId: ChainId;
  /** The block the roster's figures were read at; 0 where the read failed. */
  blockNumber: number;
  chainStale: boolean;
  /** The rows the index holds from this roster. */
  count: number;
  catalog: {
    catalogSize: number;
    censusBlock?: number | null;
    stataCount?: number;
    stakeCount?: number;
  };
}

export function vaultIndexProtocol(v: VaultSummary): VaultIndexProtocol {
  switch (v.family) {
    case "metamorpho":
      return "morpho";
    case "sgho":
    case "stata":
    case "umbrella-stake":
      return "aave";
    case "yearn-v3":
      return "yearn";
    case "maple-pool":
      return "maple";
  }
}

/** A vault's key across chains: two chains can hold one address. */
export const vaultIndexKey = (v: Pick<VaultSummary, "chainId" | "address">) => `${v.chainId}:${v.address}`;

export const chainName = (chainId: number): string => CHAINS[chainId as ChainId]?.name ?? String(chainId);

/** The roster page a protocol's rows come from. */
export function vaultIndexRosterHref(p: VaultIndexProtocol): string {
  return p === "morpho"
    ? baseVaultRosterHref()
    : p === "aave"
      ? ethereumVaultRosterHref()
      : p === "yearn"
        ? yearnVaultRosterHref()
        : maplePoolsHref();
}

/** The vault's page under its protocol (decision 0028 point 8); a Maple pool's
 *  is the pools page. */
export function vaultIndexHref(v: VaultSummary): string {
  const p = vaultIndexProtocol(v);
  return p === "morpho"
    ? baseVaultHref(v.address)
    : p === "aave"
      ? ethereumVaultHref(v.address)
      : p === "yearn"
        ? yearnVaultHref(v.address)
        : maplePoolsHref();
}

/** The positions listing filtered to this vault, where its roster has one. */
export function vaultIndexHoldersHref(v: VaultSummary): string | null {
  const p = vaultIndexProtocol(v);
  return p === "morpho"
    ? baseVaultsListingHref({ vault: v.address })
    : p === "aave"
      ? ethereumVaultsListingHref({ vault: v.address })
      : null;
}

/** The index is offered (the site footer, the sitemap, indexing) once every
 *  roster it reads is: while one is flagged `unlaunched` the index serves at
 *  its URL and the four rosters' heads link it, as an unlaunched roster does. */
export function vaultIndexLaunched(): boolean {
  return VAULT_INDEX_PROTOCOLS.every((p) => !isUnlaunchedPath(vaultIndexRosterHref(p)));
}
