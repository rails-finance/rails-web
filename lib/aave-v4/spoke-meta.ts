/**
 * Editorial metadata for Aave V4 spokes.
 *
 * The position card shows numbers; this file carries the *narrative* — what
 * archetype each spoke is, which Hub holds collateral, which Hub backs the
 * borrow, and a plain-English description users can read without already
 * knowing V4's Hub/Spoke architecture.
 *
 * Architectural reality (current understanding):
 *   - Hubs are unified-liquidity tiers (Core / Plus / Prime).
 *   - Spokes are modular interfaces with rules. Most spokes pool collateral
 *     and borrows within a single Hub; some — like Bluechip — accept
 *     collateral in one Hub and draw borrows from another via a cross-hub
 *     credit line. Rate, when surfaced, layers a Hub base + Spoke risk
 *     premium; we don't decompose it live (that would require reads against
 *     multiple Hubs and Spoke IRM strategy contracts).
 *
 * The narratives below are verified against the V4 activation ARFC
 * (governance.aave.com/t/…/24293), the Global Dollar Hub Direct-to-AIP
 * (…/24942), and aave.com/docs (2026-07-14). Numbers that drift with
 * governance (caps, LTVs) are deliberately not hard-coded here — narratives
 * state structure (hubs, asset scope, credit lines), not live parameters.
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
//   2. Add a 308 redirect in next.config.ts from the encoded display name
//      shape, in case the spoke's name contains a space.
//   3. Mirror in SPOKE_META below (keyed by the same slug) if it needs
//      editorial copy.
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

export type SpokeArchetype =
  /** General-purpose single-hub spoke. Collateral and borrows live in the
   *  same Hub; rate is Hub utilization + Spoke premium. */
  | "standard"
  /** Collateral lives in one Hub; borrow is drawn from another Hub's
   *  liquidity via a credit line capped by Hub-level safeguards. */
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
  /** Where the borrow draws liquidity from. Differs from `collateralHub`
   *  only on cross-hub-credit spokes. */
  borrowHub: HubTier;
  /** Plain-English narrative, rendered as a stack of sentences in the
   *  SpokeNarrativeBand. Keep each entry to one or two sentences. */
  narrative: string[];
  /** Optional structural disclosure about rate composition. Today we don't
   *  decompose live; this surfaces the layered nature of V4 borrow rates
   *  (Hub base + Spoke premium) without inventing numbers. */
  rateNote?: string;
}

const RATE_NOTE_CROSS_HUB =
  "Borrow rate combines Core Hub's utilization-driven base rate with this Spoke's risk premium. Higher-quality collateral earns a lower premium; the displayed total is the sum.";

// Keyed by the canonical spoke slug (see SPOKE_SLUG_TO_NAME). Look up via
// getSpokeMeta(), which normalizes an API display name to its slug first —
// don't index this map with a raw display name.
export const SPOKE_META: Record<string, SpokeMeta> = {
  main: {
    name: "Main",
    archetype: "standard",
    collateralHub: "Core",
    borrowHub: "Core",
    narrative: [
      "Aave V4's general-purpose Spoke on the Core Hub.",
      "Collateral and borrows share the same Hub; rates respond to Core Hub utilization.",
    ],
  },
  bluechip: {
    name: "Bluechip",
    archetype: "cross-hub-credit",
    collateralHub: "Prime",
    borrowHub: "Core",
    narrative: [
      "Bluechip is a Prime Hub Spoke: collateral (wstETH, BTC variants) sits in Prime, but borrows are drawn from Core Hub liquidity over a cross-hub credit line.",
      "The rate here is favorable because high-quality bluechip collateral earns a low risk premium, layered on top of Core Hub's base rate.",
      "Liquidation parameters and the recovery health factor are Spoke-specific and may differ from other Spokes — Hub-level safeguards cap how much liquidity the Spoke can draw.",
      "A health factor in the mid-1s is normal here, not a sign of an overlevered position: the Spoke's liquidation thresholds keep some headroom in reserve at launch, so the displayed HF will sit lower than V3 users may expect for the same collateral mix.",
    ],
    rateNote: RATE_NOTE_CROSS_HUB,
  },
  forex: {
    name: "Forex",
    // The ARFC frames this venue on asset correlation ("tight correlation
    // between assets allows capital-efficient" FX exposure), not isolation.
    archetype: "correlated",
    collateralHub: "Core",
    borrowHub: "Core",
    narrative: [
      "FX Spoke on the Core Hub: stablecoin collateral — USDC, USDT and EURC — against the Hub's full stable roster (USDT, USDC, USDG, RLUSD, frxUSD, GHO, EURC).",
      "EURC is the venue's non-USD leg; tight correlation between the currencies carries higher borrowing power than the same assets earn on the Main Spoke, with liquidation tuned to a narrow volatility profile.",
    ],
  },
  gold: {
    name: "Gold",
    archetype: "isolation",
    collateralHub: "Core",
    borrowHub: "Core",
    narrative: [
      "Tokenized-gold Spoke on the Core Hub: XAUt (Tether Gold) collateral against the Hub's stablecoin roster.",
      "Parameters are the most conservative of the launch Spokes — non-crypto collateral gets a deeper post-liquidation restoration than any crypto venue.",
    ],
  },
  "ethena-correlated": {
    name: "Ethena Correlated",
    archetype: "correlated",
    collateralHub: "Plus",
    borrowHub: "Plus",
    narrative: [
      "Correlated e-Mode Spoke on the Plus Hub: the Ethena basket — USDe, sUSDe and their Pendle principal tokens — borrowing USDe only.",
      "The USDe-only borrow side is what earns the tight correlated parameter set, with PT collateral carrying the Hub's highest borrowing power; the Spoke connects to the Plus Hub alone, with no Core credit line.",
    ],
  },
  "ethena-ecosystem": {
    name: "Ethena Ecosystem",
    archetype: "ecosystem",
    collateralHub: "Plus",
    borrowHub: "Plus",
    narrative: [
      "Ethena ecosystem Spoke on the Plus Hub: the same collateral basket as the Correlated Spoke (USDe, sUSDe, Pendle PTs), borrowing outward — USDT, USDC and GHO alongside USDe.",
      "External stables arrive over a governed credit line from the Core Hub (the core-prefixed borrow assets), capping how much Core liquidity Ethena strategies can draw without merging the Hubs' solvency boundaries.",
    ],
  },
  etherfi: {
    name: "EtherFi",
    archetype: "ecosystem",
    collateralHub: "Core",
    borrowHub: "Core",
    narrative: [
      "EtherFi e-Mode Spoke on the Core Hub: weETH collateral borrowing wETH only — a single-pair restaking-loop venue.",
      "The one-collateral, one-borrow scope keeps LTV, liquidation bonus, oracle scope and caps independently adjustable for the LRT without touching the wider Hub.",
    ],
  },
  kelp: {
    name: "Kelp",
    archetype: "ecosystem",
    collateralHub: "Core",
    borrowHub: "Core",
    narrative: [
      "Kelp e-Mode Spoke on the Core Hub: rsETH collateral borrowing wETH only — the same single-pair restaking-loop shape as the EtherFi and Lido Spokes.",
      "Parameters move independently of the wider Hub, sized to rsETH's own risk.",
    ],
  },
  lido: {
    name: "Lido",
    archetype: "ecosystem",
    collateralHub: "Core",
    borrowHub: "Core",
    narrative: [
      "Lido e-Mode Spoke on the Core Hub: wstETH collateral borrowing wETH only — the dedicated LST looping venue.",
      "Governance designates it a zero-risk-premium Spoke (alongside Bluechip): the borrow rate is the Hub base with no collateral surcharge.",
    ],
  },
  lombard: {
    name: "Lombard BTC",
    archetype: "ecosystem",
    collateralHub: "Core",
    borrowHub: "Core",
    narrative: [
      "Lombard BTC e-Mode Spoke on the Core Hub: LBTC — Lombard's Babylon-staked BTC — borrowing wBTC and cbBTC.",
      "The dedicated Spoke keeps Babylon-protocol exposure inside its own bounded perimeter rather than in the Hub-wide collateral pool.",
    ],
  },
  "stablecoin-correlated": {
    name: "Stablecoin Correlated",
    archetype: "ecosystem",
    collateralHub: "Paxos",
    borrowHub: "Paxos",
    narrative: [
      "The Stablecoin Correlated Spoke on the Global Dollar Hub — Aave V4's fourth Hub, built for the Global Dollar (USDG) ecosystem and live since 1 Jul 2026.",
      "Collateral is PT-USDG-24SEP2026, a Pendle principal token maturing 24 Sep 2026; against it the Spoke borrows USDC and USDT natively, plus USDG drawn from the Core Hub over a cross-hub credit line.",
      "The PT is priced by a linear discount-rate oracle (a zero-coupon-bond model), so collateral value converges to par at maturity; later PT-USDG maturities join the same Spoke as rollover destinations.",
    ],
  },
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
};

export const ARCHETYPE_LABEL: Record<SpokeArchetype, string> = {
  standard: "Standard Spoke",
  "cross-hub-credit": "Cross-Hub Credit",
  correlated: "Correlated Spoke",
  isolation: "Isolation Spoke",
  ecosystem: "Ecosystem Spoke",
};

// A former `ARCHETYPE_ACCENT` map (per-archetype amber/violet/cyan/fuchsia tints)
// lived here but was never consumed — the archetype renders as a neutral label
// via ARCHETYPE_LABEL. It was removed to keep off-grammar color references out of
// the code; the archetype is identity, not a status, so it carries no color.

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
};
