// The Yearn V3 roster on Ethereum as the pages serve it: the box's, over the baked one.
// ----------------------------------------------------------------------------
// lib/yearn/vault-catalog.ts is a snapshot at one census block. The box runs the
// same census weekly (rails-server-onboarding api/src/scripts/
// census-vault-roster.ts, mig 283). This module takes that served roster when it
// passes the checks below, and the baked catalogue when it does not or cannot be
// read (lib/vaults/served-roster.ts).
//
// THE SERVED ROSTER IS TAKEN ONLY WHEN IT CONTAINS THE BAKED ONE: its block at
// or after the baked census block, every baked vault in it, and each agreeing
// on factory, api version, creation block and asset. A release Yearn adds after
// the bake arrives here as a factory the baked file does not name, so a served
// vault's `apiVersion` is a string, not the baked union.
//
// SERVER-ONLY.

import { cache } from "react";
import { fetchServedRoster } from "@/lib/vaults/served-roster";
import {
  YEARN_V3_FACTORIES,
  YEARN_VAULTS,
  YEARN_VAULT_CENSUS_BLOCK,
  YEARN_VAULT_CENSUS_BLOCK_ISO,
  type YearnVaultCatalogEntry,
} from "./vault-catalog";

export type YearnRosterEntry = Omit<YearnVaultCatalogEntry, "apiVersion"> & { apiVersion: string };

export interface YearnRosterFactory {
  release: number;
  apiVersion: string;
  address: string;
  firstBlock: number;
  vaults: number;
  onStalePointer: boolean;
}

export interface YearnVaultRoster {
  vaults: readonly YearnRosterEntry[];
  factories: readonly YearnRosterFactory[];
  censusBlock: number;
  censusBlockIso: string;
  source: "served" | "baked";
  byAddress: ReadonlyMap<string, YearnRosterEntry>;
}

const BAKED: YearnVaultRoster = {
  vaults: YEARN_VAULTS,
  factories: YEARN_V3_FACTORIES,
  censusBlock: YEARN_VAULT_CENSUS_BLOCK,
  censusBlockIso: YEARN_VAULT_CENSUS_BLOCK_ISO,
  source: "baked",
  byAddress: new Map(YEARN_VAULTS.map((v) => [v.address, v])),
};

function isFactory(f: unknown): f is YearnRosterFactory {
  const r = f as Record<string, unknown>;
  return (
    r != null &&
    Number.isInteger(r.release) &&
    typeof r.apiVersion === "string" &&
    typeof r.address === "string" &&
    Number.isInteger(r.firstBlock) &&
    Number.isInteger(r.vaults) &&
    typeof r.onStalePointer === "boolean"
  );
}

/** The roster the pages serve, read once per request. */
export const loadYearnVaultRoster = cache(async (): Promise<YearnVaultRoster> => {
  const served = await fetchServedRoster(1, "yearn-v3");
  if (!served) return BAKED;
  const reject = (why: string) => {
    console.error(`served Yearn V3 roster at block ${served.rosterBlock} not taken: ${why}; serving the baked one`);
    return BAKED;
  };
  if (served.rosterBlock < YEARN_VAULT_CENSUS_BLOCK)
    return reject(`it is older than the baked census block ${YEARN_VAULT_CENSUS_BLOCK}`);
  if (!served.factories.every(isFactory)) return reject("its factories are not in the catalogue's shape");
  const vaults: YearnRosterEntry[] = [];
  for (const v of served.vaults) {
    if (v.name == null || v.symbol == null || v.assetDecimals == null)
      return reject(`${v.address} lacks a name, symbol or asset decimals`);
    vaults.push({
      address: v.address,
      factory: v.factory,
      apiVersion: v.factoryVersion,
      createdBlock: v.createdBlock,
      name: v.name,
      symbol: v.symbol,
      asset: { address: v.asset, symbol: v.assetSymbol, decimals: v.assetDecimals },
    });
  }
  const byAddress = new Map(vaults.map((v) => [v.address, v]));
  for (const b of YEARN_VAULTS) {
    const s = byAddress.get(b.address);
    if (!s) return reject(`it lacks ${b.address}`);
    if (
      s.factory !== b.factory ||
      s.apiVersion !== b.apiVersion ||
      s.createdBlock !== b.createdBlock ||
      s.asset.address !== b.asset.address
    )
      return reject(`${b.address} disagrees on factory, api version, creation block or asset`);
  }
  return {
    vaults,
    factories: served.factories as YearnRosterFactory[],
    censusBlock: served.rosterBlock,
    censusBlockIso: served.rosterBlockTime,
    source: "served",
    byAddress,
  };
});

/** The vault at `addr` in the roster the pages serve, or undefined. A miss means
 *  "not in this roster", which is not "not a Yearn V3 vault": it is a floor. */
export async function yearnRosterEntry(addr: string): Promise<YearnRosterEntry | undefined> {
  return (await loadYearnVaultRoster()).byAddress.get(addr.toLowerCase());
}

/** True when this address is one the Yearn vault pages serve. */
export async function isYearnRosterVault(addr: string): Promise<boolean> {
  return (await yearnRosterEntry(addr)) !== undefined;
}
