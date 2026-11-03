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
