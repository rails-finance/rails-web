// The receipt the shared vault roster (components/vaults/vault-roster.tsx)
// states for its counts line: how many funded vaults the facets, the search and
// the preset leave shown, out of the funded vaults the roster read.

import type { Provenance } from "@/components/shared/provenance";

const n = (v: number) => v.toLocaleString("en-US");

/** `shown` of the roster's `funded` vaults, under the criteria named. */
export const vaultRosterShownProv = (shown: number, funded: number, criteria: string[]): Provenance => ({
  kind: "derived",
  pclass: "state",
  summary: `${n(shown)} of the ${n(funded)} vaults whose \`totalAssets()\` answered above zero, each at its roster's block${
    criteria.length > 0 ? `, under: ${criteria.join("; ")}` : ""
  }. The holder threshold counts the census's current holders at the census block; endorsement is Yearn's \`Registry.isEndorsed()\` at the read block. Both choose which rows are drawn and state nothing about a vault.`,
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
    via: one ? "roster read · eth_call @ the read block" : "vault index · each roster's eth_call @ its read block",
  };
};
