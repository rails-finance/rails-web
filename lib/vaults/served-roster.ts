// The vault rosters the box writes, read from rails-server over the catalogues
// this repo bakes.
// ----------------------------------------------------------------------------
// Two catalogues here are hand-run snapshots committed as TypeScript:
// lib/morpho-base/vault-catalog.ts (scripts/census-morpho-base-vaults.mjs) and
// lib/yearn/vault-catalog.ts (scripts/census-yearn-ethereum-vaults.mjs). A vault
// created after the snapshot's block is absent until someone re-runs the script
// and commits the file, and on 2026-09-20 the Base one had drifted two vaults
// behind the box's own daily census. The box now writes both rosters itself
// (rails-server-onboarding mig 283: the Base census tick every morning, a weekly
// job for Yearn) and serves them at GET /api/vaults/roster. This file reads that
// answer; lib/morpho-base/vault-roster.ts and lib/yearn/vault-roster.ts decide
// whether to take it over the baked copy.
//
// A FAILED READ IS THE BAKED ROSTER, NEVER AN EMPTY ONE. No RAILS_API_URL, a
// non-200, a timeout or a body of the wrong shape all answer null, and the
// caller serves the catalogue it was built with.
//
// SERVER-ONLY: reads RAILS_API_URL and the bearer token.

import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";

/** How long a served roster is reused before it is asked for again. The box
 *  writes Base's once a day and Yearn's once a week. */
export const SERVED_ROSTER_REVALIDATE_SECONDS = 3600;
const TIMEOUT_MS = 5000;

const ADDRESS = /^0x[0-9a-f]{40}$/;

export interface ServedRosterVault {
  address: string;
  factory: string;
  factoryVersion: string;
  asset: string;
  assetSymbol: string | null;
  assetDecimals: number | null;
  createdBlock: number;
  name: string | null;
  symbol: string | null;
}

export interface ServedRoster {
  chainId: number;
  family: "metamorpho" | "yearn-v3";
  rosterBlock: number;
  rosterBlockTime: string;
  factories: unknown[];
  vaults: ServedRosterVault[];
}

const str = (v: unknown): v is string => typeof v === "string";
const strOrNull = (v: unknown) => v === null || typeof v === "string";
const intOrNull = (v: unknown) => v === null || Number.isInteger(v);

function isVault(v: unknown): v is ServedRosterVault {
  const r = v as Record<string, unknown>;
  return (
    r != null &&
    str(r.address) &&
    ADDRESS.test(r.address) &&
    str(r.factory) &&
    ADDRESS.test(r.factory) &&
    str(r.asset) &&
    ADDRESS.test(r.asset) &&
    str(r.factoryVersion) &&
    Number.isInteger(r.createdBlock) &&
    (r.createdBlock as number) > 0 &&
    strOrNull(r.name) &&
    strOrNull(r.symbol) &&
    strOrNull(r.assetSymbol) &&
    intOrNull(r.assetDecimals)
  );
}

/** The stored roster for (chain, family), or null when it could not be read. */
export async function fetchServedRoster(chainId: number, family: ServedRoster["family"]): Promise<ServedRoster | null> {
  const base = process.env.RAILS_API_URL;
  if (!base) return null;
  try {
    const res = await fetch(
      `${base}/api/vaults/roster?chain=${chainId}&family=${family}`,
      createAuthFetchOptions({
        next: { revalidate: SERVED_ROSTER_REVALIDATE_SECONDS },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }),
    );
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    if (
      j.chainId !== chainId ||
      j.family !== family ||
      !Number.isInteger(j.rosterBlock) ||
      !str(j.rosterBlockTime) ||
      !Array.isArray(j.factories) ||
      !Array.isArray(j.vaults) ||
      !j.vaults.every(isVault)
    ) {
      console.error(`served vault roster ${chainId}/${family}: the body is not a roster; serving the baked one`);
      return null;
    }
    return j as unknown as ServedRoster;
  } catch (error) {
    console.error(`served vault roster ${chainId}/${family}: read failed; serving the baked one:`, error);
    return null;
  }
}
