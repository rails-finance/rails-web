// The receipt the shared vault roster (components/vaults/vault-roster.tsx)
// states for its counts line: how many funded vaults the facets, the search and
// the preset leave shown, out of the funded vaults the roster read.

import type { Provenance } from "@/components/shared/provenance";

const n = (v: number) => v.toLocaleString("en-US");

/** `shown` of the roster's `funded` vaults, under the criteria named. */
export const vaultRosterShownProv = (shown: number, funded: number, criteria: string[]): Provenance => ({
  kind: "derived",
  pclass: "state",
  summary: `${n(shown)} of the ${n(funded)} vaults that hold assets, each at its roster's block${
    criteria.length > 0 ? `, under: ${criteria.join("; ")}` : ""
  }. The holder threshold counts the holders at the census block; endorsement is the Yearn V3 registry's answer at the read block. Both choose which rows are drawn.`,
  via: "vault roster · count of funded rows passing the chosen facets, search and preset",
  formula: "count of roster rows where totalAssets() > 0 and every chosen criterion holds",
});

/** One roster's read, as the read stamp states it. */
export interface RosterRead {
  /** "Morpho on Base". */
  label: string;
  block: number;
  /** The block's time, seconds; null where it is not known. */
  at: number | null;
}

const utc = (at: number | null) =>
  at == null
    ? "time not known"
    : new Date(at * 1000)
        .toISOString()
        .replace("T", " ")
        .replace(/\.\d+Z$/, " UTC");

/** One roster's vault count on its /vaults overview card (ui-jobs 776):
 *  every vault its roster lists, or every one over `asset` under `?asset=`,
 *  funded or not, read at its block. */
export const rosterCountProv = (read: RosterRead, count: number, asset?: string): Provenance => ({
  kind: "chain",
  pclass: "state",
  ...(read.block > 0 ? { source: { block: read.block } } : {}),
  summary: `${read.label} — ${n(count)} vaults${asset ? ` over ${asset}` : ""} on this roster, funded or not, read at ${
    read.block > 0 ? `block ${n(read.block)} (${utc(read.at)})` : "its roster's read block"
  }.`,
  via: "vault overview · the roster's rows @ its read block",
});

/** The read stamp's receipt: each roster's block and its time. The stamp's age
 *  is the oldest of them. */
export const rosterReadProv = (reads: RosterRead[]): Provenance => {
  const one = reads.length === 1;
  return {
    kind: "chain",
    pclass: "state",
    ...(one ? { source: { block: reads[0].block } } : {}),
    summary: one
      ? `Every figure on this roster was read at block ${n(reads[0].block)} (${utc(reads[0].at)}). The read is reused for up to five minutes; the stamp's age is that block's.`
      : `Each roster was read at a block of its chain: ${reads.map((r) => `${r.label} at block ${n(r.block)} (${utc(r.at)})`).join("; ")}. The stamp's age is the oldest of these reads; the index is reused for up to five minutes.`,
    via: one
      ? "roster read · each row's contract calls @ the read block"
      : "vault index · each roster's contract calls @ its read block",
  };
};

/** One family's part of a roster that carries several (Aave's: Savings GHO,
 *  static aTokens, Umbrella stake tokens) on /vaults/products (ui-jobs 773):
 *  the roster's rows of that family, out of all its rows, at its block. */
export const rosterFamilyCountProv = (
  read: RosterRead,
  roster: string,
  family: string,
  count: number,
  total: number,
): Provenance => ({
  kind: "chain",
  pclass: "state",
  ...(read.block > 0 ? { source: { block: read.block } } : {}),
  summary: `${n(count)} of the ${roster} roster's ${n(total)} vaults are ${family}, read at ${
    read.block > 0 ? `block ${n(read.block)} (${utc(read.at)})` : "its roster's read block"
  }.`,
  via: `vault products · the ${roster} roster's rows @ its read block, filtered to family ${family}`,
  formula: `count of the roster's rows whose family is ${family}`,
});
