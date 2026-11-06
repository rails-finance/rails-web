// The vault roster's preset (components/vaults/vault-roster.tsx): which funded
// vaults a roster shows before the reader widens it. Here, client-safe, so a
// server page that links into a roster (/start's coin lists) counts the rows
// the link opens on.

import type { VaultSummary } from "@/lib/vaults/summary";

/** The preset's holder threshold: census current holders at least this. */
export const ROSTER_HOLDERS_MIN = 100;

const ZERO = BigInt(0);

/** A vault the roster draws as a row: its total assets read, and above zero. */
const isFunded = (v: VaultSummary) => v.totalAssets != null && BigInt(v.totalAssets.raw ?? "0") > ZERO;

/** The preset: 100+ current holders where the vault has a census, endorsed
 *  where it is a Yearn vault, every other vault kept. */
export function inRosterPreset(v: VaultSummary): boolean {
  if (v.census != null) return v.census.live >= ROSTER_HOLDERS_MIN;
  if (v.family === "yearn-v3") return v.standing.includes("endorsed");
  return true;
}

/** The rows a roster link asking for these vaults opens on: the funded ones
 *  under the preset, or every funded one when the preset would leave none
 *  (the roster's arrival rule). */
export function shownOnArrival(asked: VaultSummary[]): VaultSummary[] {
  const funded = asked.filter(isFunded);
  const preset = funded.filter(inRosterPreset);
  return preset.length > 0 ? preset : funded;
}
