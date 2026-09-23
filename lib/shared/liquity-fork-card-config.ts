// Plain-data roster for the Liquity-family position card
// (components/protocol/liquity-family/liquity-position-card.tsx) — all four
// deployments on this architecture (Liquity V2, the reference deployment,
// plus its forks Asymmetry, Ebisu, Basedollar) run the identical card markup,
// differing only in the deployment's display name, its debt symbol, its one
// live-verified docs/site link, and — V2 only — its delegate deprecation
// announcement. Everything here is inert data; the React-bearing per-protocol
// bits (provenance helper functions, the asset-catalog lookups) live in the
// card file's own OPS lookup, keyed by the same id.

import type { LiquityFamilyId } from "@/components/protocol/liquity-family/types";

export interface LiquityForkCardConfig {
  id: LiquityFamilyId;
  /** Display name threaded into the learn-more content ("Liquity V2" | "Asymmetry" | "Ebisu" | "Basedollar"). */
  name: string;
  /** The deployment's stablecoin display symbol ("BOLD" | "USDaf" | "ebUSD" | "BD"). */
  debtSymbol: string;
  /** One live-verified docs/site link, threaded into the learn-more content. */
  docsLink: { label: string; url: string };
  /** The delegate-deprecation announcement link — set ONLY on the reference
   *  deployment (its ARM delegate wind-down); the forks carry no such notice. */
  delegateDeprecationAnnouncement?: string;
}

export const LIQUITY_FORK_CARD_CONFIGS: Record<LiquityFamilyId, LiquityForkCardConfig> = {
  "liquity-v2": {
    id: "liquity-v2",
    name: "Liquity V2",
    debtSymbol: "BOLD",
    docsLink: { label: "Liquity docs", url: "https://docs.liquity.org" },
    delegateDeprecationAnnouncement:
      "https://discord.com/channels/700620821198143498/711975093940519012/1487025900208783530",
  },
  asymmetry: {
    id: "asymmetry",
    name: "Asymmetry",
    debtSymbol: "USDaf",
    docsLink: { label: "Asymmetry docs", url: "https://docs.asymmetry.finance" },
  },
  ebisu: {
    id: "ebisu",
    name: "Ebisu",
    debtSymbol: "ebUSD",
    docsLink: { label: "Ebisu", url: "https://ebisu.money" },
  },
  basedollar: {
    id: "basedollar",
    name: "Basedollar",
    debtSymbol: "BD",
    docsLink: { label: "Basedollar", url: "https://basedollar.money" },
  },
};
