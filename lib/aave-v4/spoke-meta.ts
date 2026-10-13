/**
 * Structural metadata for Aave V4 spokes: the URL slugs, each spoke's kind,
 * the hub that holds its collateral and the hubs it borrows from, and the
 * spokes' contract addresses. What each spoke is, in words, is the position
 * card's "?" (content/aave-v4/event-prose.yaml, `L5.position`, a form per
 * spoke).
 *
 * The hub lines each spoke borrows over were re-read against the hubs table
 * and the spoke contracts' getReserve / getDynamicReserveConfig on
 * 2026-09-28. Numbers that drift with governance (caps, factors) are not
 * written here.
 */

import type { HubTier } from "@/components/protocol/aave-v4/aave-v4-spoke-constants";

// ── URL slugs ────────────────────────────────────────────────────────────────
// Canonical slug ↔ display-name map for `/ethereum/aave-v4/spoke/[slug]/[wallet]`.
// The **slug** is the single canonical key throughout this file — SPOKE_META
// below is keyed by it too. The display name is what the API returns as
// `spokeName`; the slug is its lowercase kebab-cased form, used in URLs so we
// don't ship `%20` in production paths and as the stable internal key so a
// spoke's display name can change (or gain an alias) without re-keying anything.
//
// When a new spoke ships:
//   1. Add the row here (slug → display name).
//   2. Mirror in SPOKE_META below (keyed by the same slug) if it needs
//      editorial copy.
// The encoded display-name shape needs no rule of its own: the spoke page 308s
// any segment `resolveSpokeSegment` recognises to its slug.
const SPOKE_SLUG_TO_NAME: Record<string, string> = {
  main: "Main",
  bluechip: "Bluechip",
  forex: "Forex",
  gold: "Gold",
  "ethena-correlated": "Ethena Correlated",
  "ethena-ecosystem": "Ethena Ecosystem",
  etherfi: "EtherFi",
  kelp: "Kelp",
  lido: "Lido",
  lombard: "Lombard BTC",
  treasury: "Treasury",
  "stablecoin-correlated": "Stablecoin Correlated",
  // Legacy slug: /aave-v4/spoke/global-dollar/… links predate the display rename
  // (hub "Global Dollar" / spoke "Stablecoin Correlated"). Kept so they resolve.
  "global-dollar": "Stablecoin Correlated",
  // Aave V4 on Base (/base/aave-v4/spoke/mag7/…).
  mag7: "Mag7",
};

const SPOKE_NAME_TO_SLUG: Record<string, string> = {
  ...Object.fromEntries(Object.entries(SPOKE_SLUG_TO_NAME).map(([slug, name]) => [name, slug])),
  // Alias: the older "Lombard" label still resolves to the same slug, so any
  // legacy caller passing it (rather than the API's "Lombard BTC") keeps working.
  Lombard: "lombard",
  // Two slugs resolve to "Stablecoin Correlated" (canonical + legacy); pin the
  // canonical one so generated links use it rather than the legacy alias.
  "Stablecoin Correlated": "stablecoin-correlated",
};

/** Convert a spoke display name to its URL slug. Returns null for unknown
 *  names so callers can decide whether to fall back (e.g. encodeURIComponent
 *  for a not-yet-listed spoke) rather than ship a bad URL. */
export function slugifySpoke(displayName: string): string | null {
  return SPOKE_NAME_TO_SLUG[displayName] ?? null;
}

/** Convert a URL slug to the canonical display name. Returns null when the
 *  slug isn't a known spoke. The page wrapper falls back to URL-decoding the
 *  raw param so legacy `%20`-shaped bookmarks still resolve until the 308s
 *  catch them. */
export function spokeFromSlug(slug: string): string | null {
  return SPOKE_SLUG_TO_NAME[slug] ?? null;
}

/** Resolve a `[spoke]` URL segment in any shape the site has linked — the slug,
 *  a legacy slug (`global-dollar`), or a display name, raw or percent-encoded
 *  (`Ethena%20Ecosystem`) — to its canonical slug and display name. `slug` is
 *  null for a spoke this build has not heard of; `name` is then the decoded
 *  segment. The page 308s to `slug` when it differs from the segment it was given. */
export function resolveSpokeSegment(segment: string): { slug: string | null; name: string } {
  const given = spokeFromSlug(segment) ?? decodeSegment(segment);
  const slug = slugifySpoke(given);
  return { slug, name: (slug && spokeFromSlug(slug)) ?? given };
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export type SpokeArchetype =
  /** General-purpose single-hub spoke. Collateral and borrows live in the
   *  same Hub; rate is the Hub's base rate plus the user's risk premium. */
  | "standard"
  /** Collateral lives in one Hub; borrows are drawn from it and also from
   *  another Hub over a credit line capped by that Hub. */
  | "cross-hub-credit"
  /** Correlated-asset basket with elevated LTV between assets (e-Mode lineage). */
  | "correlated"
  /** Capped exposure, narrow asset list. The Spoke itself is the isolation
   *  boundary in V4 — distinct from V3's per-asset isolation flag. */
  | "isolation"
  /** Partner / ecosystem bundle around a specific asset family. */
  | "ecosystem";

export interface SpokeMeta {
  name: string;
  archetype: SpokeArchetype;
  /** Where supplied collateral sits. */
  collateralHub: HubTier;
  /** The Hubs the Spoke borrows from, home Hub first. More than one only on
   *  spokes with a cross-hub credit line. */
  borrowHubs: HubTier[];
}

// Keyed by the canonical spoke slug (see SPOKE_SLUG_TO_NAME). Look up via
// getSpokeMeta(), which normalizes an API display name to its slug first —
// don't index this map with a raw display name.
export const SPOKE_META: Record<string, SpokeMeta> = {
  main: {
    name: "Main",
    archetype: "standard",
    collateralHub: "Core",
    borrowHubs: ["Core"],
  },
  bluechip: {
    name: "Bluechip",
    archetype: "cross-hub-credit",
    collateralHub: "Prime",
    borrowHubs: ["Prime", "Core"],
  },
  forex: {
    name: "Forex",
    // The ARFC frames this venue on asset correlation ("tight correlation
    // between assets allows capital-efficient" FX exposure), not isolation.
    archetype: "correlated",
    collateralHub: "Core",
    borrowHubs: ["Core"],
  },
  gold: {
    name: "Gold",
    archetype: "isolation",
    collateralHub: "Core",
    borrowHubs: ["Core"],
  },
  "ethena-correlated": {
    name: "Ethena Correlated",
    archetype: "correlated",
    collateralHub: "Plus",
    borrowHubs: ["Plus"],
  },
  "ethena-ecosystem": {
    name: "Ethena Ecosystem",
    archetype: "ecosystem",
    collateralHub: "Plus",
    borrowHubs: ["Plus", "Core"],
  },
  etherfi: {
    name: "EtherFi",
    archetype: "ecosystem",
    collateralHub: "Core",
    borrowHubs: ["Core"],
  },
  kelp: {
    name: "Kelp",
    archetype: "ecosystem",
    collateralHub: "Core",
    borrowHubs: ["Core"],
  },
  lido: {
    name: "Lido",
    archetype: "ecosystem",
    collateralHub: "Core",
    borrowHubs: ["Core"],
  },
  lombard: {
    name: "Lombard BTC",
    archetype: "ecosystem",
    collateralHub: "Core",
    borrowHubs: ["Core"],
  },
  "stablecoin-correlated": {
    name: "Stablecoin Correlated",
    archetype: "ecosystem",
    collateralHub: "Paxos",
    borrowHubs: ["Paxos", "Core"],
  },
};

// Aave V4 on Base. Structure from Aave's announcement
// (aave.com/blog/coinbase-tokenized-stocks, 2026-09-25) and address book
// (bgd-labs/aave-address-book AaveV4Base.sol), each confirmed on chain
// 2026-09-27: eight reserves, the seven stocks not borrowable, USDC the only
// borrowable reserve, one hub. Live parameters are read, never written here.
SPOKE_META.mag7 = {
  name: "Mag7",
  archetype: "isolation",
  collateralHub: "Equities",
  borrowHubs: ["Equities"],
};

/** Look up a spoke's editorial metadata by API display name ("Lombard BTC"),
 *  legacy alias ("Lombard"), or raw slug ("lombard"). All three normalize to
 *  the canonical slug that keys SPOKE_META, so callers never have to match the
 *  API's display name against the internal key exactly. Returns null for an
 *  unknown spoke so callers can omit the "?" affordance. */
export function getSpokeMeta(name: string): SpokeMeta | null {
  // slugifySpoke resolves a display name (or alias) to its slug; if `name` is
  // already a slug it isn't in that map, so fall back to `name` unchanged.
  const slug = slugifySpoke(name) ?? name;
  return SPOKE_META[slug] ?? null;
}

// ── contract addresses (indexer API key scheme — NOT the URL slug above) ────
// The hub-comparison payload (/api/aave-v4/hubs → HubCreditLine.spoke) names a
// spoke only by the API's stable spoke KEY (e.g. "ethena_corr", "usdg_pendle")
// plus a display name — no contract address of its own; the hubs endpoint
// materializes credit lines, and adds no chain call to resolve one. These are
// the spokes' deployed contract addresses: stable on-chain constants, not
// indexer output, mirrored from rails-server-onboarding's
// api/src/config/aave-v4-spokes.ts SPOKE_BY_KEY and this repo's
// lib/sources/chain/aave-v4-position.ts SPOKES map (the live chain-overlay
// reader's own copy) so a hub-surface receipt can carry the address it read
// without an extra chain call.
//
// Keyed by the API's spoke key, which is NOT the SPOKE_SLUG_TO_NAME URL slug
// above — the two schemes only coincide for the spokes whose key has no
// underscore (main, bluechip, forex, gold, etherfi, kelp, lido, lombard).
// Never key this map off a spoke's display name: rails-server-onboarding's
// backend still emits the pre-rename display name ("Global Dollar") for the
// usdg_pendle spoke on at least one deploy, while the key itself is stable.
//
// Treasury has no deployed address yet (rails-server-onboarding's config notes
// it as "unknown"), so it is intentionally omitted here too.
export const SPOKE_ADDRESS_BY_KEY: Record<string, `0x${string}`> = {
  main: "0x94e7a5dcbe816e498b89ab752661904e2f56c485",
  bluechip: "0x973a023a77420ba610f06b3858ad991df6d85a08",
  ethena_corr: "0x58131e79531cab1d52301228d1f7b842f26b9649",
  ethena_eco: "0xba1b3d55d249692b669a164024a838309b7508af",
  etherfi: "0xbf10bdfe177de0336afd7fccf80a904e15386219",
  forex: "0xd8b93635b8c6d0ff98cbe90b5988e3f2d1cd9da1",
  gold: "0x65407b940966954b23dfa3caa5c0702bb42984dc",
  kelp: "0x3131fe68c4722e726fe6b2819ed68e514395b9a4",
  lido: "0xe1900480ac69f0b296841cd01cc37546d92f35cd",
  lombard: "0x7ec68b5695e803e98a21a9a05d744f28b0a7753d",
  usdg_pendle: "0x956d8e0a89cfa3744428c4641b5a53b56167a7f9",
  usdg_syrup: "0x774b9655413c34809c1f1b16b654465a89ebe989",
  usdg_paxg: "0xad75ce6354f87f3135ce10621d385d8d1e2562c2",
};

/** Spoke contracts of Aave V4 on Base (Aave's address book, AaveV4Base.sol). */
export const BASE_SPOKE_ADDRESSES = new Set<string>(["0x17905db0e4a3514467539956c084180616ae7b8d"]);

/** The chain a spoke contract lives on: Base for the Base deployment's
 *  spokes, Ethereum otherwise (every other spoke this explorer knows). */
export function chainIdForSpokeAddress(address?: string | null): 1 | 8453 {
  return address && BASE_SPOKE_ADDRESSES.has(address.toLowerCase()) ? 8453 : 1;
}

// Display-name → server spoke-key map. Mirrors SPOKE_BY_KEY in
// rails-server-onboarding/api/src/config/aave-v4-spokes.ts. Translates the
// resolved display name into the lowercase chain key that
// `/api/aave-v4/spoke-position` expects.
//
// Here rather than on the spoke page because the page's server half and its
// client half both resolve it, and the server loader is SERVER-ONLY.
export const SPOKE_NAME_TO_KEY: Record<string, string> = {
  Main: "main",
  Bluechip: "bluechip",
  Forex: "forex",
  Gold: "gold",
  "Ethena Correlated": "ethena_corr",
  "Ethena Ecosystem": "ethena_eco",
  EtherFi: "etherfi",
  Kelp: "kelp",
  Lido: "lido",
  "Lombard BTC": "lombard",
  Lombard: "lombard",
  Treasury: "treasury",
  "Stablecoin Correlated": "usdg_pendle",
  // Legacy alias: pre-rename URLs/bookmarks resolved this spoke as "Global
  // Dollar". Kept so the chain-state fetch still resolves for those.
  "Global Dollar": "usdg_pendle",
  // Aave V4 on Base.
  Mag7: "mag7",
};
