// The vault families, named once (rails-ops ui-jobs 407; survey 2026-10-20 §6,
// "Naming, anatomy, code").
// ----------------------------------------------------------------------------
// Every vault surface names its family from this table: the venue mark, the
// family word on a row or a heading, the explorer the vault lives under, the
// census's word for it and the served roster's. The older vocabularies
// (`VaultPositionFamily` in lib/aave-vaults/vault-position.ts, `VaultVenue` in
// components/vaults/vault-venue-mark.tsx, `VaultFamilyKey` in
// lib/vaults/explorer.ts, `ServedRoster.family` in lib/vaults/served-roster.ts)
// are keys into it or derived from it.
//
// No imports: the shell's client components, the server loaders and the
// scripts all read it.

/** One vault product. MetaMorpho on Base and Ethereum; savings GHO, static aTokens and
 *  Umbrella stake tokens on Ethereum (Aave); Yearn V3 on Ethereum; Maple's
 *  syrup pools on Ethereum, which keep their own pools page and join only the
 *  cross-protocol index (ui-jobs 39; survey 2026-10-20 §7.6). */
export type VaultFamily = "metamorpho" | "sgho" | "stata" | "umbrella-stake" | "yearn-v3" | "maple-pool";

/** The explorer a vault sits under (decision 0028), which is also the session
 *  key its listing is filed under. MetaMorpho's is chain-keyed: `morpho-base`
 *  on Base, `morpho` on Ethereum. */
export type VaultExplorer = "morpho-base" | "morpho" | "aave-vaults" | "yearn";

/** The census's word for a family. The census writes `morpho` for every
 *  MetaMorpho vault and `yearn-v3` for Yearn V3. */
export type VaultCensusFamily = "morpho" | "sgho" | "stata" | "umbrella-stake" | "yearn-v3";

export interface VaultFamilyEntry {
  /** Maple's explorer is a lender explorer with no vault holder pages, so it
   *  is outside `VaultExplorer`. MetaMorpho's is Base's here; on Ethereum it
   *  is `morpho`. */
  explorer: VaultExplorer | "maple";
  /** The `ProtocolIcon` id of the venue that deployed it. */
  venue: "morpho" | "aave-v3" | "yearn" | "maple";
  /** The family as a heading or a facet names it. */
  label: string;
  /** The same, for one vault. */
  singular: string;
  /** What kind of vault it is, in words that hold across venues: the
   *  index's Kind column (ui-jobs 553). */
  kind: string;
  /** The census's word, or null where there is no census. */
  census: VaultCensusFamily | null;
  /** The served roster's family, where the box serves one. */
  served: "metamorpho" | "yearn-v3" | null;
  /** The protocol's documented word for the figure nearest Rails's Yield,
   *  attributed, with the difference in a few words: the Yield tip's last
   *  sentence (decision 0047, amended 13 Nov 2026; ui-jobs 664 VA1). */
  yieldDocsWord?: string;
  /** The Share price tip's last sentence, where the docs name the figure
   *  another way (ui-jobs 664 VA2). */
  sharePriceDocsWord?: string;
  /** The vault's asset is a vault whose share grows (Umbrella's stake on a
   *  static aToken): the Yield subline adds the asset's own growth over the
   *  same days, never added into one figure (decision 0047 as amended). */
  assetGrows?: true;
}

export const VAULT_FAMILIES: Record<VaultFamily, VaultFamilyEntry> = {
  metamorpho: {
    explorer: "morpho-base",
    venue: "morpho",
    label: "MetaMorpho",
    singular: "MetaMorpho vault",
    kind: "Curated vault",
    census: "morpho",
    served: "metamorpho",
    yieldDocsWord:
      "Morpho's docs call a figure on the same basis (post-fee, excludes rewards) the “realized average APY”; Morpho's API states it compounded.",
  },
  sgho: {
    explorer: "aave-vaults",
    venue: "aave-v3",
    label: "Savings GHO",
    singular: "Savings GHO",
    kind: "Savings GHO",
    census: "sgho",
    served: null,
    yieldDocsWord:
      "Aave's docs state Savings GHO's rate as a “fixed APR”; this figure is the share price's realised growth at that rate.",
  },
  stata: {
    explorer: "aave-vaults",
    venue: "aave-v3",
    label: "Static aTokens",
    singular: "Static aToken",
    kind: "Static aToken",
    census: "stata",
    served: null,
  },
  "umbrella-stake": {
    explorer: "aave-vaults",
    venue: "aave-v3",
    label: "Umbrella stake tokens",
    singular: "Umbrella stake token",
    kind: "Umbrella stake token",
    census: "umbrella-stake",
    served: null,
    assetGrows: true,
  },
  "yearn-v3": {
    explorer: "yearn",
    venue: "yearn",
    label: "Yearn V3",
    singular: "Yearn V3 vault",
    kind: "Allocator vault",
    census: "yearn-v3",
    served: "yearn-v3",
    yieldDocsWord:
      "Yearn's docs call the nearest figure the “Monthly APY”, from the share price's change over 30 days; the docs' figure compounds.",
    sharePriceDocsWord: "Yearn's contract also answers it as pricePerShare.",
  },
  "maple-pool": {
    explorer: "maple",
    venue: "maple",
    label: "Maple pools",
    singular: "Maple pool",
    kind: "Credit pool",
    census: null,
    served: null,
  },
};

/** The family a census row names. */
export const familyOfCensus = (f: VaultCensusFamily): VaultFamily => (f === "morpho" ? "metamorpho" : f);

/** The family and release as one pill reads: "MetaMorpho V1.1", "Yearn V3
 *  3.0.4", "Static aToken". `release` is the factory's version ("v1.1") or the
 *  vault's `apiVersion()` ("3.0.4"); a family with one release passes none. */
export function releaseLabel(family: VaultFamily, release: string | null): string {
  if (family === "metamorpho") return release ? `MetaMorpho ${release.replace(/^v/, "V")}` : "MetaMorpho";
  if (family === "yearn-v3") return release ? `Yearn V3 ${release}` : "Yearn V3";
  return VAULT_FAMILIES[family].singular;
}
