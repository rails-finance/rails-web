// The rosters the cross-protocol vault index reads (rails-ops ui-jobs 39), as
// the page and its rows name them. Client-safe: the read is lib/vaults/index-read.ts.

import { CHAINS, type ChainId } from "@/lib/shared/chains";
import { isUnlaunchedPath } from "@/lib/shared/protocols";
import type { VaultSummary } from "@/lib/vaults/summary";
import type { ServerRead } from "@/lib/shared/server-head-read";
import {
  metaMorphoVaultHref,
  metaMorphoVaultRosterHref,
  metaMorphoVaultsListingHref,
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

/** The rosters the index reads, in its order: a protocol on a chain. Morpho
 *  has two, MetaMorpho on Base and on Ethereum (ui-jobs 486). */
export const VAULT_INDEX_ROSTERS: readonly { protocol: VaultIndexProtocol; chainId: ChainId }[] = [
  { protocol: "morpho", chainId: 8453 },
  { protocol: "morpho", chainId: 1 },
  { protocol: "aave", chainId: 1 },
  { protocol: "yearn", chainId: 1 },
  { protocol: "maple", chainId: 1 },
];

/** A roster's key: its protocol and chain. */
export const vaultIndexRosterKey = (r: { protocol: VaultIndexProtocol; chainId: number }) =>
  `${r.protocol}:${r.chainId}`;

/** The roster key a vault's row belongs to. */
export const vaultIndexRosterKeyOf = (v: VaultSummary) =>
  vaultIndexRosterKey({ protocol: vaultIndexProtocol(v), chainId: v.chainId });

/** One roster as the index read it: its block, its count, and what its
 *  count sentence's receipt needs. */
export interface VaultIndexRoster {
  protocol: VaultIndexProtocol;
  chainId: ChainId;
  /** The block the roster's figures were read at; 0 where the read failed. */
  blockNumber: number;
  /** rails-server's read of `blockNumber`, when it answered every read. */
  readBy?: ServerRead;
  chainStale: boolean;
  /** When the roster's loader took its read, ISO-8601 UTC. */
  readAt: string;
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

/** MetaMorpho's chain for a route: Ethereum, else Base. */
const morphoChain = (chainId: number): 1 | 8453 => (chainId === 1 ? 1 : 8453);

/** MetaMorpho's vault pages and positions listing are served on this chain.
 *  Ethereum's arrive with ui-jobs 486 pass 3; until then its rows are drawn
 *  without a link rather than linking to a 404. */
export const metaMorphoVaultPagesServed = (chainId: number): boolean => chainId === 8453;

/** The roster page a protocol's rows on a chain come from. */
export function vaultIndexRosterHref(p: VaultIndexProtocol, chainId: number): string {
  return p === "morpho"
    ? metaMorphoVaultRosterHref(morphoChain(chainId))
    : p === "aave"
      ? ethereumVaultRosterHref()
      : p === "yearn"
        ? yearnVaultRosterHref()
        : maplePoolsHref();
}

/** The vault's page under its protocol (decision 0028 point 8); a Maple pool's
 *  is the pools page. Null where the vault's pages are not served yet. */
export function vaultIndexHref(v: VaultSummary): string | null {
  const p = vaultIndexProtocol(v);
  return p === "morpho"
    ? metaMorphoVaultPagesServed(v.chainId)
      ? metaMorphoVaultHref(morphoChain(v.chainId), v.address)
      : null
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
    ? metaMorphoVaultPagesServed(v.chainId)
      ? metaMorphoVaultsListingHref(morphoChain(v.chainId), { vault: v.address })
      : null
    : p === "aave"
      ? ethereumVaultsListingHref({ vault: v.address })
      : null;
}

/** The index is offered (the site footer, the sitemap, indexing) once every
 *  roster it reads is: while one is flagged `unlaunched` the index serves at
 *  its URL and the rosters' heads link it, as an unlaunched roster does. */
export function vaultIndexLaunched(): boolean {
  return VAULT_INDEX_ROSTERS.every((r) => !isUnlaunchedPath(vaultIndexRosterHref(r.protocol, r.chainId)));
}
