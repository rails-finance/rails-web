// Aave V4 spoke metadata used both by the spoke card (heavy component) and by
// the wallet-timeline page header (just two map lookups). Splitting these out
// keeps the wallet-page chunk from pulling in `aave-spoke-card.tsx` and its
// transitive deps just to render a hub label.

// `Equities` is Aave V4 on Base's one hub (EQUITIES_HUB in Aave's address book).
export type HubTier = "Core" | "Plus" | "Prime" | "Paxos" | "Equities";

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
  Equities: "Equities",
};

// The lowercase hub keys the API sends on each reserve (`hub`: the hub that
// reserve draws from, live from aave_v4_hub_spoke_credit).
const HUB_TIER_BY_KEY: Record<string, HubTier> = {
  core: "Core",
  plus: "Plus",
  prime: "Prime",
  paxos: "Paxos",
  equities: "Equities",
};
const HUB_ORDER: HubTier[] = ["Core", "Plus", "Prime", "Paxos", "Equities"];

/** The hubs a position borrows from: one entry per hub behind a reserve with
 *  debt, in hub order. A reserve whose hub the API has not resolved adds none. */
export function debtHubsOf(reserves: readonly { hub?: string | null; hasDebt: boolean }[]): HubTier[] {
  const hubs = new Set<HubTier>();
  for (const r of reserves) {
    const tier = r.hasDebt && r.hub ? HUB_TIER_BY_KEY[r.hub.toLowerCase()] : undefined;
    if (tier) hubs.add(tier);
  }
  return HUB_ORDER.filter((h) => hubs.has(h));
}

/** The hub chip's two parts (Miles 2026-09-28, TO-DO-ui-jobs item 102): the
 *  spoke's collateral hub, and the hubs the position borrows from when those
 *  are anything other than that one hub. A spoke lists some assets on more than
 *  one hub (Bluechip borrows USDC from Prime and from Core), so a Bluechip
 *  position with all its debt on Core reads "Prime · debt on Core". No debt, or
 *  all of it on the collateral hub, keeps the one name. */
export function hubChipParts(
  collateralHub: HubTier,
  debtHubs: readonly HubTier[],
): {
  collateral: string;
  debt: string | null;
} {
  const collateral = HUB_TIER_LABEL[collateralHub];
  if (debtHubs.length === 0 || (debtHubs.length === 1 && debtHubs[0] === collateralHub)) {
    return { collateral, debt: null };
  }
  // The collateral hub leads when the position borrows from it too.
  const ordered = [...debtHubs].sort((a, b) => Number(b === collateralHub) - Number(a === collateralHub));
  return { collateral, debt: ordered.map((h) => HUB_TIER_LABEL[h]).join(" and ") };
}

/** The chip text: "Prime", or "Prime · debt on Core". */
export function hubChipLabel(collateralHub: HubTier, debtHubs: readonly HubTier[]): string {
  const { collateral, debt } = hubChipParts(collateralHub, debtHubs);
  return debt ? `${collateral} · debt on ${debt}` : collateral;
}

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
  // Aave V4 on Base.
  Mag7: "Equities",
};
