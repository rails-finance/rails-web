// The rosters the cross-protocol vault index reads (rails-ops ui-jobs 39), as
// the page and its rows name them. Client-safe: the read is lib/vaults/index-read.ts.

import { CHAINS, type ChainId } from "@/lib/shared/chains";
import { isUnlaunchedPath } from "@/lib/shared/protocols";
import type { VaultSummary } from "@/lib/vaults/summary";
import type { ServerRead } from "@/lib/shared/server-head-read";
import {
  metaMorphoVaultHref,
  metaMorphoVaultRosterHref,
  ethereumVaultHref,
  ethereumVaultRosterHref,
  maplePoolHref,
  maplePoolsHref,
  yearnVaultHref,
  yearnVaultRosterHref,
  iporFusionVaultHref,
  iporFusionVaultRosterHref,
} from "@/lib/vaults/routes";
import { SBOLD_PAGE_PATH } from "@/lib/liquity-v2/sbold";

/** One protocol's roster: the Protocol facet's value and the row's protocol.
 *  `sbold` is the one vault no explorer deploys, its own roster of one
 *  (ui-jobs 765). */
/** "ipor-fusion" joins the index with its three chains (rails-ops
 *  TO-DO-ipor-scoping §6.3 phase C). */
export type VaultIndexProtocol = "morpho" | "aave" | "yearn" | "maple" | "sbold" | "ipor-fusion";

export const VAULT_INDEX_PROTOCOL_LABEL: Record<VaultIndexProtocol, string> = {
  morpho: "Morpho",
  aave: "Aave",
  yearn: "Yearn",
  maple: "Maple",
  sbold: "sBOLD",
  "ipor-fusion": "IPOR Fusion",
};

/** The rosters the index reads, in its order: a protocol on a chain. Morpho
 *  has two, MetaMorpho on Base and on Ethereum (ui-jobs 486). */
export const VAULT_INDEX_ROSTERS: readonly { protocol: VaultIndexProtocol; chainId: ChainId }[] = [
  { protocol: "morpho", chainId: 8453 },
  { protocol: "morpho", chainId: 1 },
  { protocol: "aave", chainId: 1 },
  { protocol: "yearn", chainId: 1 },
  { protocol: "maple", chainId: 1 },
  { protocol: "sbold", chainId: 1 },
  { protocol: "ipor-fusion", chainId: 1 },
  { protocol: "ipor-fusion", chainId: 42161 },
  { protocol: "ipor-fusion", chainId: 8453 },
];

/** Protocols whose rosters join the index only once launched, and never hold
 *  back its launch (rails-ops TO-DO-ipor-scoping §6.3 phase C): while a
 *  roster of one is unlaunched the index neither reads nor lists its rows. */
const LISTED_ONCE_LAUNCHED: readonly VaultIndexProtocol[] = ["ipor-fusion"];

const gated = (r: { protocol: VaultIndexProtocol }) => LISTED_ONCE_LAUNCHED.includes(r.protocol);

/** The rosters the index reads and lists, given which roster pages are
 *  launched: every roster of an ungated protocol, and a gated one's where its
 *  page is launched. */
export function listedIndexRosters(
  isLaunched: (rosterHref: string) => boolean,
): readonly { protocol: VaultIndexProtocol; chainId: ChainId }[] {
  return VAULT_INDEX_ROSTERS.filter((r) => !gated(r) || isLaunched(vaultIndexRosterHref(r.protocol, r.chainId)));
}

/** The rosters the index lists today. */
export const VAULT_INDEX_LISTED = () => listedIndexRosters((href) => !isUnlaunchedPath(href));

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
    case "sbold":
      return "sbold";
    case "ipor-fusion":
      return "ipor-fusion";
  }
}

/** A vault's key across chains: two chains can hold one address. */
export const vaultIndexKey = (v: Pick<VaultSummary, "chainId" | "address">) => `${v.chainId}:${v.address}`;

export const chainName = (chainId: number): string => CHAINS[chainId as ChainId]?.name ?? String(chainId);

/** MetaMorpho's chain for a route: Ethereum, else Base. */
const morphoChain = (chainId: number): 1 | 8453 => (chainId === 1 ? 1 : 8453);

/** The roster page a protocol's rows on a chain come from. */
export function vaultIndexRosterHref(p: VaultIndexProtocol, chainId: number): string {
  return p === "morpho"
    ? metaMorphoVaultRosterHref(morphoChain(chainId))
    : p === "aave"
      ? ethereumVaultRosterHref()
      : p === "yearn"
        ? yearnVaultRosterHref()
        : p === "maple"
          ? maplePoolsHref()
          : p === "ipor-fusion"
            ? (iporFusionVaultRosterHref(chainId) ?? SBOLD_PAGE_PATH)
            : SBOLD_PAGE_PATH;
}

/** The rosters that read `?asset=` on arrival (VaultRoster); Maple's pools
 *  page and sBOLD's vault page do not. */
const TAKES_ASSET: readonly VaultIndexProtocol[] = ["morpho", "aave", "yearn", "ipor-fusion"];

/** The roster's page, carrying `?asset=` where the roster reads it (the
 *  /vaults overview's card under `?asset=`, ui-jobs 776). */
export function rosterHrefWithAsset(p: VaultIndexProtocol, chainId: number, asset?: string): string {
  const href = vaultIndexRosterHref(p, chainId);
  return asset && TAKES_ASSET.includes(p) ? `${href}?asset=${encodeURIComponent(asset)}` : href;
}

/** The vault's page under its protocol (decision 0028 point 8); a Maple
 *  pool's under Maple's pools tab; sBOLD's at /ethereum/vaults/sbold. */
export function vaultIndexHref(v: VaultSummary): string {
  const p = vaultIndexProtocol(v);
  return p === "morpho"
    ? metaMorphoVaultHref(morphoChain(v.chainId), v.address)
    : p === "aave"
      ? ethereumVaultHref(v.address)
      : p === "yearn"
        ? yearnVaultHref(v.address)
        : p === "maple"
          ? maplePoolHref(v.address)
          : p === "ipor-fusion"
            ? (iporFusionVaultHref(v.chainId, v.address) ?? SBOLD_PAGE_PATH)
            : SBOLD_PAGE_PATH;
}

/** The index is offered (the site footer, the sitemap, indexing) once every
 *  roster it reads is: while one is flagged `unlaunched` the index serves at
 *  its URL and the rosters' heads link it, as an unlaunched roster does. */
export function vaultIndexLaunched(): boolean {
  return VAULT_INDEX_ROSTERS.filter((r) => !gated(r)).every(
    (r) => !isUnlaunchedPath(vaultIndexRosterHref(r.protocol, r.chainId)),
  );
}
