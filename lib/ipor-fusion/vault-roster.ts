// The IPOR Fusion roster the pages serve: the census in ./vault-catalog
// (rails-ops TO-DO-ipor-scoping §6.1), one chain at a time. A floor, as the
// catalogue's header says: a vault no factory event names is absent.

import { IPOR_FUSION_CENSUS } from "./vault-catalog";

type CensusKey = keyof typeof IPOR_FUSION_CENSUS;
export type IporFusionChainId = 1 | 42161 | 8453;

const KEY: Record<IporFusionChainId, CensusKey> = { 1: "ethereum", 42161: "arbitrum", 8453: "base" };

export type IporFusionRosterEntry = (typeof IPOR_FUSION_CENSUS)[CensusKey]["vaults"][number];

export interface IporFusionRoster {
  chainId: IporFusionChainId;
  factory: string;
  factoryVersion: number;
  censusBlock: number;
  censusBlockIso: string;
  vaults: readonly IporFusionRosterEntry[];
  byAddress: ReadonlyMap<string, IporFusionRosterEntry>;
}

const cache = new Map<IporFusionChainId, IporFusionRoster>();

/** The roster on one chain, built once per process. */
export function iporFusionRoster(chainId: IporFusionChainId): IporFusionRoster {
  const hit = cache.get(chainId);
  if (hit) return hit;
  const c = IPOR_FUSION_CENSUS[KEY[chainId]];
  const roster: IporFusionRoster = {
    chainId,
    factory: c.factory,
    factoryVersion: c.factoryVersion,
    censusBlock: c.censusBlock,
    censusBlockIso: c.censusBlockIso,
    vaults: c.vaults,
    byAddress: new Map(c.vaults.map((v) => [v.address.toLowerCase(), v])),
  };
  cache.set(chainId, roster);
  return roster;
}

/** The census row for `address` on `chainId`, or null: the factsheet 404s on null. */
export const iporFusionRosterEntry = (chainId: IporFusionChainId, address: string) =>
  iporFusionRoster(chainId).byAddress.get(address.toLowerCase()) ?? null;
