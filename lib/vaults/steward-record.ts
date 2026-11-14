// The steward's record on a vault page (rails-ops ui-jobs 554, piece C): the
// vaults one steward runs now, rolled up from the /vaults directory's rows.
// ----------------------------------------------------------------------------
// The steward follows the steward line's rule: a MetaMorpho vault's curator,
// or its owner where no curator is set; a Maple pool's delegate. Rows match on
// the address, case-insensitive, across Base and Ethereum and across the two
// families that carry a steward here (MetaMorpho and Maple). A roster of the
// three that did not answer leaves the record unread: a count over part of the
// directory is no count.
//
// SERVER-ONLY: `loadVaultIndex` reads ALCHEMY_URL and RAILS_API_URL.

import { loadVaultIndex } from "@/lib/vaults/index-read";
import { vaultIndexRosterKey, vaultIndexRosterKeyOf } from "@/lib/vaults/index-rosters";
import type { VaultSteward, VaultSummary } from "@/lib/vaults/summary";
import type { ServerRead } from "@/lib/shared/server-head-read";

/** One roster the record counts over, as the directory read it. */
export interface StewardRecordRoster {
  protocol: "morpho" | "maple";
  chainId: number;
  block: number;
  readBy?: ServerRead;
}

export interface StewardRecord {
  steward: VaultSteward;
  /** The page's vault, `<chainId>:<address>`. */
  current: string;
  /** Every directory row this steward runs, the page's vault among them. */
  vaults: VaultSummary[];
  /** The MetaMorpho and Maple rows the directory lists on Base and Ethereum. */
  listed: number;
  rosters: StewardRecordRoster[];
}

/** Null: the directory, or one of its three rosters, did not answer. */
export type StewardRecordRead = StewardRecord | null;

const ROSTERS = [
  { protocol: "morpho", chainId: 8453 },
  { protocol: "morpho", chainId: 1 },
  { protocol: "maple", chainId: 1 },
] as const;

/** `<chainId>:<address>`, the record's key for a vault. */
const stewardVaultKey = (v: { chainId: number; address: string }) => `${v.chainId}:${v.address.toLowerCase()}`;

/** The record for the steward of `vault` on `chainId`. `fallback` is the
 *  page's read of the steward, used where the directory holds no row for the
 *  vault. */
export async function loadStewardRecord(
  chainId: number,
  vault: string,
  fallback: VaultSteward | null,
): Promise<StewardRecordRead> {
  let index;
  try {
    index = await loadVaultIndex();
  } catch (error) {
    console.error("The vault directory did not answer for the steward's record:", error);
    return null;
  }
  const rosters: StewardRecordRoster[] = [];
  for (const want of ROSTERS) {
    const r = index.rosters.find((x) => vaultIndexRosterKey(x) === vaultIndexRosterKey(want));
    if (!r || r.chainStale || r.blockNumber === 0) return null;
    rosters.push({ ...want, block: r.blockNumber, ...(r.readBy ? { readBy: r.readBy } : {}) });
  }
  const keys = new Set(rosters.map(vaultIndexRosterKey));
  const rows = index.vaults.filter((v) => keys.has(vaultIndexRosterKeyOf(v)));
  const current = stewardVaultKey({ chainId, address: vault });
  const steward = rows.find((v) => stewardVaultKey(v) === current)?.steward ?? fallback;
  if (!steward) return null;
  const address = steward.address.toLowerCase();
  return {
    steward,
    current,
    vaults: rows.filter((v) => v.steward?.address.toLowerCase() === address),
    listed: rows.length,
    rosters,
  };
}
