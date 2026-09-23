// Aave V4 spoke metadata used both by the spoke card (heavy component) and by
// the wallet-timeline page header (just two map lookups). Splitting these out
// keeps the wallet-page chunk from pulling in `aave-spoke-card.tsx` and its
// transitive deps just to render a hub label.

export type HubTier = "Core" | "Plus" | "Prime" | "Paxos";

// Hub tiers render as neutral text badges (see SpokeIdentity / position card) —
// the tier is identity, not a status, so it carries no color. A former
// `HUB_COLORS` map (per-tier blue/amber/green) was unused and removed to keep
// off-grammar color out of the code; don't reintroduce it. See color-grammar.md.

// Display label for a hub tier. The tier identifiers (Core/Plus/Prime/Paxos)
// are stable internal keys — `Paxos` matches the governance address book's
// PAXOS_HUB — but the badge follows Aave's UI, which names that hub
// "Global Dollar". Keep this the single source for the rendered hub label.
export const HUB_TIER_LABEL: Record<HubTier, string> = {
  Core: "Core",
  Plus: "Plus",
  Prime: "Prime",
  Paxos: "Global Dollar",
};

export const SPOKE_HUB: Record<string, HubTier> = {
  Main: "Core",
  Forex: "Core",
  Gold: "Core",
  "Ethena Correlated": "Plus",
  "Ethena Ecosystem": "Plus",
  EtherFi: "Core",
  Kelp: "Core",
  Lido: "Core",
  Lombard: "Core",
  Bluechip: "Prime",
  "Stablecoin Correlated": "Paxos",
  // Legacy alias: the API briefly returned this spoke as "Global Dollar" before
  // the display-name rename. Kept so the badge resolves during a split deploy.
  "Global Dollar": "Paxos",
};
