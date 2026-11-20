// Each protocol's primary type (rails-ops decision 0068 point 8; ui-jobs 780):
// Rails' classification, as the asset categories are
// (lib/shared/asset-categories.ts). The protocols state no type, so the field
// carries no source receipt and a page that shows it says whose grouping it
// is. One type per protocol: the one its position card reads in (a Liquity
// fork is a CDP though it has a stability pool). Every chain row of a version
// takes the same type. It is kept apart from `tags`, the capability pills.
// A new kind of protocol arrives as a new type (a prediction market, once one
// is on the roster).
//
// Pure: no imports.

export type ProtocolType = "lending" | "cdp" | "dex" | "vaults" | "savings" | "staking" | "trading" | "fixed-rate";

/** The labels, in the Type facet's order. */
export const PROTOCOL_TYPE_LABELS: Record<ProtocolType, string> = {
  lending: "Lending",
  cdp: "CDP",
  dex: "DEX",
  vaults: "Vaults",
  savings: "Savings",
  staking: "Staking",
  trading: "Trading",
  "fixed-rate": "Fixed rate",
};
