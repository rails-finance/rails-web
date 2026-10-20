// The receipts the cross-protocol vault index states for itself (rails-ops
// ui-jobs 39): its group and empty counts, and Maple's pool count. Every row
// keeps its family's receipts, and each roster's count keeps its roster's.

import type { Provenance } from "@/components/shared/provenance";

const n = (v: number) => v.toLocaleString("en-US");

/** How many funded vaults the index holds in one asset on one chain. */
export const vaultIndexGroupCountProv = (assetSymbol: string, chain: string, count: number): Provenance => ({
  kind: "derived",
  pclass: "state",
  summary: `${count === 1 ? "One vault" : `${n(count)} vaults`} in ${assetSymbol} on ${chain} — a count over the rosters' rows whose asset() is this token and whose totalAssets() answered above zero, each at its roster's block. Vaults in this asset that read zero are counted in the trailing group.`,
  via: "vault index · count of roster rows with this asset and totalAssets() > 0, each @ its roster's block",
  formula: `count of roster rows where asset() = ${assetSymbol} on ${chain} and totalAssets() > 0`,
});

/** How many of the index's vaults hold nothing. */
export const vaultIndexEmptyCountProv = (count: number, total: number): Provenance => ({
  kind: "derived",
  pclass: "state",
  summary: `${n(count)} of the ${n(total)} vaults answered zero to \`totalAssets()\` — each at its roster's block. A vault whose call did not answer is stated as unread, separately, and is outside this count.`,
  via: "vault index · count of roster rows with totalAssets() = 0, each @ its roster's block",
  formula: "count of roster rows where totalAssets() = 0",
});

/** Maple's pools: the two syrup pools the pools page reads. */
export const maplePoolCountProv = (count: number, block: number): Provenance => ({
  kind: "chain",
  pclass: "state",
  source: { block },
  summary: `Maple's ${n(count)} syrup pools — the permissionless pools Maple's on-chain address registry names (lib/maple/asset-catalog.ts), each read with \`totalAssets()\`, \`totalSupply()\` and \`convertToAssets(1e6)\` at block ${n(block)}, the read Maple's pools page makes.`,
  via: "Maple pools · eth_call @ the read block",
});
