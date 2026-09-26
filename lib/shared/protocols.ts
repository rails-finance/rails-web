/**
 * The single source of truth for the protocol/explorer directory — the set of
 * rails Rails builds a dedicated explorer for, plus the display metadata that
 * drives every surface that lists them (the home directory and the header
 * protocols dropdown).
 *
 * There are no tiers: every entry is a protocol explorer, listed uniformly.
 * The explorers differ in how deep they currently go (dashboard, oracle USD,
 * chain verification, …) — /coverage is the one place that difference is
 * stated, per explorer, until they all reach the same reference depth.
 *
 * Before this module the same metadata was duplicated across the home grid,
 * the header's per-protocol chrome, the old hamburger menu, and the footer
 * switcher — all retired since. New surfaces should read from here rather
 * than re-listing.
 */

import { CHAINS, MAINNET_CHAIN_ID, type ChainId, type ChainMeta } from "@/lib/shared/chains";
import type { SessionProtocol } from "@/lib/shared/sessions";

/** A roster entry as it is written down. `href` is NOT here: it is derived from
 *  `(chainId, slug)` below, so the path text exists in exactly one place. */
type ProtocolSpec = {
  /** Stable key; also the icon basename at `/icons/protocols/<id>.png` and the
   *  glyph key in `protocol-glyphs`. Note this differs from `session` for
   *  Liquity V2 (`id: "liquity"`, `session: "liquity-v2"`). */
  id: string;
  /** The bookmarks/session-store key for this protocol (the `SessionProtocol`
   *  union). Used to map a stored bookmark back to its explorer. */
  session: SessionProtocol;
  label: string;
  /** Which chain this explorer's deployment lives on. Required, not defaulted —
   *  it is half of this explorer's route (`/<chain>/<slug>`), so an entry that
   *  did not state it would have nowhere to live. Every surface that groups or
   *  filters by chain (the chain directories, the coverage matrix, the sitemap)
   *  reads it from here rather than inferring it from the protocol. A protocol
   *  deployed on two chains is two entries — see rails-ops
   *  `decisions/0016-path-scoped-chain-routes.md`. */
  chainId: ChainId;
  /** This explorer's segment under its chain — the `<slug>` in
   *  `/<chain>/<slug>`. Unique per chain, NOT globally: Aave V3 is `aave-v3` on
   *  both Ethereum and Base, and the chain segment is what separates them. That
   *  is the point of the slug — it lets the URL say what the explorer IS,
   *  while `id` stays a stable global key for the bookmark store, the glyph
   *  table, the coverage matrix and the API and component directories, none of
   *  which the chain axis should have moved. */
  slug: string;
  /** Capability tags shown as pills (Borrow / Lend / CDP / …). Provenance
   *  meta-tags like "Chain state" are surfaced elsewhere, not here. */
  tags: string[];
  /** One-line summary shown on the directory cards. */
  desc: string;
  /** Does this explorer's own route list POSITIONS? Every explorer but the
   *  vault-native ones does, and the rail's first tab is that listing, named by
   *  the protocol's own noun. A protocol whose whole product is vaults has no
   *  position listing to draw — a share in a vault is not a position in the
   *  roster's sense (rails-ops decision 0027 call 2) — so its rail drops that
   *  tab and its own route opens on the first sub-page. Omitted means it has
   *  one; `false` is the only other value, because "has a listing" needs no
   *  declaring. */
  positionListing?: false;
  /** NOT LAUNCHED: this explorer serves at its URL and nothing on the site
   *  points at it. Every route under it renders exactly as it always did, with
   *  a strip at the top saying the surface is still being worked on; a reader
   *  reaches it by typing the URL, and only that way.
   *
   *  What the flag turns off is the LISTING surfaces — the nav switcher, the
   *  home tile strip, /coverage's matrix, the sitemap, the <head> keywords and
   *  the JSON-LD feature list — plus `robots: { index: false }` on every route
   *  under it. What it does NOT touch is RESOLUTION: `protocolForHref`,
   *  `protocolForSession` and the rest still answer for it, because its own
   *  pages are drawn from them and an unlaunched explorer is a working one.
   *
   *  Per entry rather than per chain because the two unlaunched vault layers
   *  (`aave-vaults`, `yearn`) are chain-1 rows sitting beside twenty launched
   *  ones — a chain-level flag could not reach them. No chain carries a flag:
   *  `launchedChains()` below derives the offered chains from the entries, so
   *  a chain is offered exactly while one of its explorers is launched, with
   *  nothing to keep in step. The six Base explorers launched with phase one
   *  (rails-ops decision 0030, 2026-09-23); their open matrix cells show as
   *  dashes.
   *
   *  An entry leaves this flag in the change that launches it, and that change
   *  is the one that puts it back in the nav, the sitemap and the matrix.
   *  Omitted means launched; `true` is the only other value. */
  unlaunched?: true;
  /** This explorer's protocol-level sub-pages, in tab order. The first is the
   *  overview beside the position listing — the branch roster, market roster,
   *  system state, hub comparison or loan book — and every explorer carries
   *  one; further entries are pages of their own kind (a stability pool).
   *  `segment` records the directory under the explorer route (the `<sub>` in
   *  `/<chain>/<slug>/<sub>`, e.g. "branches", "market"); Next resolves it
   *  before any dynamic `[wallet]`-style segment, so it can never be shadowed.
   *  `label` is the full link/crumb text; `tab` is the short word the rail
   *  header's sub-nav shows ("Markets", not "Markets overview"). The surfaces
   *  that read it: the rail header's tabs (`RailHeader`, which the sub-page's
   *  own `SubPageHeader` draws), the route loading boundary, and the sitemap —
   *  so moving a sub-page is one edit here rather than a hunt through them. */
  subPages: [SubPageSpec, ...SubPageSpec[]];
};

type SubPageSpec = {
  segment: string;
  label: string;
  tab: string;
  /** This sub-page has a `positions` route of its own that reads `q` —
   *  `/ethereum/aave/vaults/positions` and `/base/morpho/vaults/positions`.
   *
   *  It answers two questions for `listingHrefForWallet`. Where an explorer
   *  is `positionListing: false` it has to send the wallet filter somewhere it
   *  LANDS: Aave's vault layer lists every `(vault, holder)` pair, so it has
   *  such a route; Yearn V3 does not and will not until the share-ledger
   *  census exists (TO-DO-infra-and-backend §5.4), so a link formed for it
   *  would 404. And where a rail owns TWO listings of one address — Morpho
   *  Blue Base lists Blue borrower positions at `/base/morpho` and MetaMorpho
   *  holdings here — it names the second one, so a bookmark taken on the vault
   *  listing reopens the vault listing (§42 item 1).
   *
   *  Declared per sub-page rather than inferred from `positionListing` because
   *  the two are different facts: one says the EXPLORER's own route lists
   *  positions, this says the sub-page has a listing of holders under it.
   *  Omitted means it has none. */
  holderListing?: true;
};

/** A sub-page as everything else reads it — the spec plus its route, `href`
 *  of the explorer plus `segment`. Derived, never hand-joined, so no call site
 *  strings the path together itself. */
export type SubPageEntry = SubPageSpec & { href: string };

/** A roster entry as everything else reads it — the spec plus its derived routes. */
export type ProtocolEntry = Omit<ProtocolSpec, "subPages"> & {
  /** Explorer home (discovery listing) — never a specific wallet. Derived, never
   *  hand-written: see `explorerHref`. */
  href: string;
  /** The spec's sub-pages, each carrying its derived route. */
  subPages: [SubPageEntry, ...SubPageEntry[]];
  /** This explorer's info page (`href` + "/info") — the intro prose and the
   *  /coverage door. Derived like a sub-page's `href`. */
  infoHref: string;
};

/** The one place an explorer's route is spelled. Every href, prefix matcher,
 *  sitemap entry and canonical URL in the app comes back here, so moving an
 *  explorer means editing one slug. */
export function explorerHref(chainId: ChainId, slug: string): string {
  return `/${CHAINS[chainId].slug}/${slug}`;
}

/** Ordered alphabetically by label — the roster is tierless, so the listing
 *  order carries no ranking. Keep new entries in alphabetical position. */
const SPECS: ProtocolSpec[] = [
  {
    id: "aave-v3",
    session: "aave-v3",
    label: "Aave V3",
    chainId: 1,
    slug: "aave-v3",
    tags: ["Lend", "Borrow"],
    desc: "Single-pool lending — one cross-collateralised account per wallet",
    subPages: [{ segment: "market", label: "Market overview", tab: "Market" }],
  },
  {
    id: "aave-v3-base",
    session: "aave-v3-base",
    label: "Aave V3",
    chainId: 8453,
    slug: "aave-v3",
    tags: ["Lend", "Borrow"],
    desc: "Aave V3's Base deployment — a separate Pool with its own reserves and risk parameters, every wallet's account read whole from the contracts, no modeled state",
    subPages: [{ segment: "market", label: "Market overview", tab: "Market" }],
  },
  {
    id: "aave-v4",
    session: "aave-v4",
    label: "Aave V4",
    chainId: 1,
    slug: "aave-v4",
    tags: ["Lend", "Borrow"],
    desc: "Multi-spoke lending with unified liquidity across asset classes",
    subPages: [{ segment: "hubs", label: "Hub comparison", tab: "Hubs" }],
  },
  {
    // Aave's VAULT LAYER, and a third Aave row on Ethereum beside the two pool
    // explorers — intended (rails-ops decision 0028 point 5). The door is
    // unstamped because savings GHO and Umbrella stake tokens are Aave-wide
    // rather than V3's, and a version in the URL of a contract that has none
    // would be false. `aave-v3`, `aave-v3-base` and `aave-v4` are untouched.
    id: "aave-vaults",
    session: "aave-vaults",
    label: "Aave vaults",
    chainId: 1,
    slug: "aave",
    // The vault layer is off the nav while it is being refined — see `unlaunched`.
    unlaunched: true,
    tags: ["Vaults", "Savings"],
    desc: "Aave's own vault layer — savings GHO, Umbrella stake tokens and static aTokens, each vault's totals and share price read from chain at one block, and every address that holds one",
    // No position listing: a holder's share in a vault is not a position in the
    // roster's sense (rails-ops decision 0027 call 2), so the rail's first tab
    // is this sub-page and `/ethereum/aave` opens on it.
    positionListing: false,
    subPages: [{ segment: "vaults", label: "Vaults overview", tab: "Vaults", holderListing: true }],
  },
  {
    // Alchemix V3's ETHEREUM lines — alUSD and alETH. Two entries rather than a
    // chain switch, for the reason aave-v3 / aave-v3-base are two: a position's
    // identity is the (chain, line) pair, and a token id on one chain says
    // nothing about the same number on the other.
    //
    // Off the nav while the surface is being built — see `unlaunched`.
    id: "alchemix",
    session: "alchemix",
    label: "Alchemix",
    chainId: 1,
    slug: "alchemix",
    unlaunched: true,
    tags: ["CDP", "Yield"],
    desc: "Self-repaying loans against a yield-bearing vault token — each position's debt and collateral stated with the grade and the block they were settled at, and the line-wide redemptions that moved them",
    subPages: [{ segment: "lines", label: "Lines overview", tab: "Lines" }],
  },
  {
    // Alchemix V3's BASE line — alUSDb. Its own Alchemist, its own Transmuter,
    // its own positions. It also answers a different GRADE from the two
    // Ethereum lines: Base has had no redemption, so its figures replay
    // wei-exact from the position's own events, while Ethereum's are read from
    // getCDP at a block (rails-ops decisions/0032). That difference is a thing
    // each explorer says in words, not a property of the roster.
    id: "alchemix-base",
    session: "alchemix-base",
    label: "Alchemix",
    chainId: 8453,
    slug: "alchemix",
    unlaunched: true,
    tags: ["CDP", "Yield"],
    desc: "Alchemix V3's Base deployment — the alUSDb line, every position's debt and collateral replayed from its own events, with the block each figure was settled at stated beside it",
    subPages: [{ segment: "lines", label: "Lines overview", tab: "Lines" }],
  },
  {
    id: "asymmetry",
    session: "asymmetry",
    label: "Asymmetry",
    chainId: 1,
    slug: "asymmetry",
    tags: ["CDP"],
    desc: "A Liquity V2 fork minting USDaf across seven collateral branches — each Trove's collateral and debt read straight from events, no modeled state",
    subPages: [{ segment: "branches", label: "Branches", tab: "Branches" }],
  },
  {
    id: "compound-v2",
    session: "compound-v2",
    label: "Compound V2",
    chainId: 1,
    slug: "compound-v2",
    tags: ["Lend", "Borrow"],
    desc: "The original cToken markets replayed over six years — every account's supplies, borrows and liquidations from the contracts' own events, with the markets themselves read live at /compound-v2/markets",
    subPages: [{ segment: "markets", label: "Markets overview", tab: "Markets" }],
  },
  {
    id: "compound",
    session: "compound",
    label: "Compound V3",
    chainId: 1,
    slug: "compound-v3",
    tags: ["Lend", "Borrow"],
    desc: "Compound V3 markets replayed from events — signed base principal and each collateral asset traceable, no modeled state",
    subPages: [{ segment: "markets", label: "Markets overview", tab: "Markets" }],
  },
  {
    // Compound V3's Base deployment — five Comets of its own, none of them the
    // Ethereum ones. Nothing is shared between the two: separate contracts,
    // separate collateral rosters, separate risk parameters, separate accounts.
    // A second roster row rather than a chain switch, for the same reason as
    // aave-v3-base and moonwell-base.
    id: "compound-base",
    session: "compound-base",
    label: "Compound V3",
    chainId: 8453,
    slug: "compound-v3",
    tags: ["Lend", "Borrow"],
    desc: "Compound V3's Base deployment — five Comets read live, and a wallet's standing in every one of them found by asking each market directly",
    subPages: [{ segment: "market", label: "Market overview", tab: "Market" }],
  },
  {
    id: "dolomite",
    session: "dolomite",
    label: "Dolomite",
    chainId: 1,
    slug: "dolomite",
    tags: ["Lend", "Borrow"],
    desc: "Solo-fork margin accounts at the contract's own (owner, account number) grain — balances replayed from emitted absolutes, debt as negative balances, the account's own margin line read live including the LST/ETH override",
    subPages: [{ segment: "markets", label: "Markets overview", tab: "Markets" }],
  },
  {
    id: "basedollar",
    session: "basedollar",
    label: "Basedollar",
    chainId: 8453,
    slug: "basedollar",
    tags: ["CDP"],
    desc: "A Liquity V2 fork on Base minting BD across five collateral branches — captured from Base directly, each Trove's collateral and debt read straight from events",
    subPages: [{ segment: "branches", label: "Branches", tab: "Branches" }],
  },
  {
    id: "ebisu",
    session: "ebisu",
    label: "Ebisu",
    chainId: 1,
    slug: "ebisu",
    tags: ["CDP"],
    desc: "A Liquity V2 fork minting ebUSD across five collateral branches — each Trove's collateral and debt read straight from events, no modeled state",
    subPages: [{ segment: "branches", label: "Branches", tab: "Branches" }],
  },
  {
    id: "fluid",
    session: "fluid",
    label: "Fluid",
    chainId: 1,
    slug: "fluid",
    tags: ["Lend", "Borrow", "CDP"],
    desc: "Instadapp's vault positions as NFTs — composite deposit/borrow events chain-read, tick-swept liquidations attributed per position from the vault's own settlement views",
    subPages: [{ segment: "vaults", label: "Vaults overview", tab: "Vaults" }],
  },
  {
    id: "frankencoin",
    session: "frankencoin",
    label: "Frankencoin",
    chainId: 1,
    slug: "frankencoin",
    tags: ["Borrow", "CDP"],
    desc: "Oracle-free ZCHF minting positions — each a contract of its own, owner-declared liquidation prices tested by two-phase challenge auctions, everything in native units",
    subPages: [{ segment: "system", label: "System overview", tab: "System" }],
  },
  {
    id: "fx",
    session: "fx",
    label: "f(x) Protocol",
    chainId: 1,
    slug: "fx",
    tags: ["Leverage", "CDP"],
    desc: "Leveraged xPOSITIONs on wstETH and WBTC — every event chain-read, current state settled from the pool's own views, socialized funding reconciled explicitly",
    subPages: [{ segment: "pools", label: "Pools overview", tab: "Pools" }],
  },
  {
    id: "liquity-v1",
    session: "liquity-v1",
    label: "Liquity V1",
    chainId: 1,
    slug: "liquity-v1",
    tags: ["Borrow"],
    desc: "The original interest-free Trove — ETH collateral and exact LUSD debt emitted per event, no modeled state",
    subPages: [{ segment: "system", label: "System overview", tab: "System" }],
  },
  {
    id: "liquity",
    session: "liquity-v2",
    label: "Liquity V2",
    chainId: 1,
    slug: "liquity-v2",
    tags: ["Borrow"],
    desc: "Borrow the BOLD stablecoin with user-set interest rates",
    subPages: [{ segment: "branches", label: "Branches", tab: "Branches" }],
  },
  {
    id: "llamalend",
    session: "llamalend",
    label: "LlamaLend",
    chainId: 1,
    slug: "llamalend",
    tags: ["Borrow"],
    desc: "Curve's LLAMMA lending — isolated markets where liquidation is a band, not a line: soft-liquidation read live from the protocol's own state, cross-checked across two contracts",
    subPages: [{ segment: "markets", label: "Markets overview", tab: "Markets" }],
  },
  {
    id: "makerdao",
    session: "makerdao",
    label: "MakerDAO",
    chainId: 1,
    slug: "makerdao",
    tags: ["CDP"],
    desc: "Vaults read straight from the chain — every value traceable, no modeled state",
    subPages: [{ segment: "system", label: "System overview", tab: "System" }],
  },
  {
    id: "maple",
    session: "maple",
    label: "Maple",
    chainId: 1,
    slug: "maple",
    tags: ["Lend", "RWA"],
    desc: "Institutional credit pools, the lender's on-chain side — exact share balances, the withdrawal queue, and what is liquid now vs deployed to off-chain-custodied loans",
    subPages: [{ segment: "pools", label: "Pools overview", tab: "Pools" }],
  },
  {
    id: "moonwell",
    session: "moonwell",
    label: "Moonwell",
    chainId: 1,
    slug: "moonwell",
    tags: ["Lend", "Borrow"],
    desc: "A Compound v2 fork newly on Ethereum — mToken balances replayed exactly, debt from emitted balances, no modeled state",
    subPages: [{ segment: "markets", label: "Markets overview", tab: "Markets" }],
  },
  {
    // Moonwell's Base deployment — the protocol's real home, and a separate
    // roster entry from the Ethereum one above rather than a chain switch
    // inside it. Same reasoning as aave-v3 / aave-v3-base: separate contracts,
    // separate Comptroller, separate markets, so a wallet's position on one
    // says nothing about its position on the other.
    id: "moonwell-base",
    session: "moonwell-base",
    label: "Moonwell",
    chainId: 8453,
    slug: "moonwell",
    tags: ["Lend", "Borrow"],
    desc: "Moonwell's Base deployment — twenty-one markets under one Comptroller, every account's standing read from the contracts themselves, no modeled state",
    subPages: [{ segment: "markets", label: "Markets overview", tab: "Markets" }],
  },
  {
    id: "morpho",
    session: "morpho",
    label: "Morpho Blue",
    chainId: 1,
    slug: "morpho",
    tags: ["Lend", "Borrow"],
    desc: "Isolated lending markets replayed from events — positions reconstructed with zero modeled state",
    subPages: [{ segment: "markets", label: "Markets overview", tab: "Markets" }],
  },
  {
    // Morpho Blue's Base deployment. Blue is a singleton at the SAME address on
    // both chains, so this is a second roster entry for what is literally the
    // same contract code — but not the same markets, and a market is what a
    // position belongs to. The 4,306 Base markets and the 1,648 Ethereum ones
    // are disjoint sets with disjoint positions.
    id: "morpho-base",
    session: "morpho-base",
    label: "Morpho Blue",
    chainId: 8453,
    slug: "morpho",
    tags: ["Lend", "Borrow"],
    desc: "Morpho Blue's Base deployment — more than 4,300 isolated markets, every borrower position across them listed, and a wallet's whole standing found by asking the singleton directly",
    // MetaMorpho is Morpho's own vault layer, so it is a view of this explorer
    // rather than a section beside it (rails-ops decision 0028): the tab lands
    // on the roster of vaults, and each vault's page and each holder's reading
    // hang off it at `/base/morpho/vaults/<vault>[/<holder>]`.
    subPages: [
      { segment: "markets", label: "Markets overview", tab: "Markets" },
      { segment: "vaults", label: "Vaults overview", tab: "Vaults", holderListing: true },
    ],
  },
  {
    // The first testnet explorer. A Sepolia figure is a test figure, and the
    // chain axis says so (`CHAINS[11155111].testnet`); the roster entry is
    // otherwise an ordinary one — same rail header, same coverage row.
    id: "polaris",
    session: "polaris",
    label: "Polaris",
    chainId: 11155111,
    slug: "polaris",
    tags: ["CDP", "Stablecoin"],
    desc: "Polaris's Sepolia testnet — USDp and GOLDp minted against pETH, every CDP replayed from the market's own events, liquidations absorbed by the stability pools",
    subPages: [{ segment: "markets", label: "Markets overview", tab: "Markets" }],
  },
  {
    id: "pwn",
    session: "pwn",
    label: "PWN",
    chainId: 1,
    slug: "pwn",
    tags: ["P2P", "Fixed-term"],
    desc: "Peer-to-peer fixed-term loans read straight from events — each loan's collateral, credit and terms traceable, no modeled state",
    subPages: [{ segment: "book", label: "Loan book", tab: "Loan book" }],
  },
  {
    id: "seamless",
    session: "seamless",
    label: "Seamless",
    chainId: 8453,
    slug: "seamless",
    tags: ["Lend", "Borrow"],
    desc: "An Aave V3 fork on Base, frozen since April 2025 — every position read whole from the contracts, and none of them can grow",
    subPages: [{ segment: "market", label: "Market overview", tab: "Market" }],
  },
  {
    id: "spark",
    session: "spark",
    label: "SparkLend",
    chainId: 1,
    slug: "spark",
    tags: ["Lend", "Borrow"],
    desc: "An Aave V3 fork replayed from events — each reserve's principal traceable, no modeled state",
    subPages: [{ segment: "market", label: "Market overview", tab: "Market" }],
  },
  {
    // The first entry here whose WHOLE PRODUCT is vaults, and therefore a
    // roster subject rather than a section (rails-ops decision 0027 point 2).
    // The `vaults` segment is kept although nothing else lives under this door,
    // because one rule everywhere is the point and the short form
    // `/ethereum/yearn/<vault>` would buy only an exception (0028 point 1).
    // Yearn V2 is an older registry and different vault code, and is out of
    // scope (0027 call 4); the roster page says so in a sentence.
    id: "yearn",
    session: "yearn",
    label: "Yearn V3",
    chainId: 1,
    slug: "yearn",
    // The vault layer is off the nav while it is being refined — see `unlaunched`.
    unlaunched: true,
    tags: ["Vaults", "Yield"],
    desc: "Every vault the V3 factories made rather than the endorsed shortlist, each one's totals, share price and endorsement read from chain at one block",
    // No position listing, for the reason Aave's vault layer has none: a
    // holder's share in a vault is not a position in the roster's sense
    // (rails-ops decision 0027 call 2), so the rail's first tab is this
    // sub-page and `/ethereum/yearn` opens on it.
    positionListing: false,
    subPages: [{ segment: "vaults", label: "Vaults overview", tab: "Vaults" }],
  },
];

// A slug is unique WITHIN a chain, and a collision would make one explorer
// unreachable — silently, because the loser simply never routes. Two entries
// deliberately share a slug across chains (`aave-v3`, `compound-v3`, `moonwell`,
// `morpho`), so the key is the pair, not the slug alone. Checked at load, where
// the whole roster is in hand.
const SEEN = new Set<string>();
for (const spec of SPECS) {
  const key = `${spec.chainId}/${spec.slug}`;
  if (SEEN.has(key)) {
    throw new Error(
      `two roster entries claim /${CHAINS[spec.chainId].slug}/${spec.slug} — one of them would be unreachable. Give "${spec.id}" a different slug.`,
    );
  }
  SEEN.add(key);
}

/** The roster, each entry carrying the routes derived from its chain, slug and
 *  sub-page segment. */
export const PROTOCOLS: ProtocolEntry[] = SPECS.map((spec) => {
  const href = explorerHref(spec.chainId, spec.slug);
  const sub = (s: SubPageSpec): SubPageEntry => ({ ...s, href: `${href}/${s.segment}` });
  const [first, ...rest] = spec.subPages;
  return { ...spec, href, subPages: [sub(first), ...rest.map(sub)], infoHref: `${href}/info` };
});

/** The roster a LISTING surface shows — the nav switcher, the home tile strip,
 *  /coverage's matrix, the sitemap, the <head> keywords, the JSON-LD feature
 *  list and the home page's counted set. Everything that RESOLVES a route, a
 *  session or a bookmark reads `PROTOCOLS`, because an unlaunched explorer is
 *  a working one and its own pages are drawn from those lookups.
 *
 *  The rule of thumb: if the surface is how a reader FINDS an explorer, it
 *  reads this; if it is how a page the reader is already on draws itself, it
 *  reads `PROTOCOLS`. */
export const LAUNCHED_PROTOCOLS: ProtocolEntry[] = PROTOCOLS.filter((p) => !p.unlaunched);

/** Is this route inside an unlaunched explorer? Takes any path under one — the
 *  listing, a sub-page, a vault, a position, an event — so a surface that has
 *  only a pathname in hand (the work-in-progress strip, a metadata builder)
 *  can ask without knowing which explorer it is looking at. */
export function isUnlaunchedPath(pathname: string | null): boolean {
  return protocolForPathname(pathname)?.unlaunched === true;
}

/** The chains a reader is offered — the chain toggle's segments, the switcher's
 *  left column, the per-chain coverage routes the sitemap names.
 *
 *  Derived, never declared: a chain is offered exactly while it has a launched
 *  explorer on it, so flagging every entry on a chain takes the chain off the
 *  nav and launching the first puts it back, with no second place to keep in
 *  step. Today all three chains are offered. The order is `CHAINS`', which is
 *  the display order the toggle wants (Ethereum, Base, Sepolia). */
export function launchedChains(): ChainMeta[] {
  return (Object.values(CHAINS) as ChainMeta[]).filter((c) => LAUNCHED_PROTOCOLS.some((p) => p.chainId === c.id));
}

/** The PRODUCTION chains Rails offers — the launched chains minus the
 *  testnets. What the home page's coverage claims are stated over: a Sepolia
 *  figure is a test figure, so it is not part of a claim about DeFi. */
export function launchedProductionChains(): ChainMeta[] {
  return launchedChains().filter((c) => !c.testnet);
}

/** "Ethereum L1 and Base L2" — the home page's scope phrase, built from the
 *  chains above rather than written out, so a sentence about what Rails covers
 *  cannot name a chain the nav has stopped linking. Three or more chains take
 *  an Oxford comma. */
export function launchedChainScope(): string {
  const names = launchedProductionChains().map((c) => `${c.name} ${c.layer}`);
  return names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

/** Is this chain's own front door (`/coverage/<slug>`) offered? False while
 *  every explorer on the chain is unlaunched — the coverage page would be a
 *  directory of pages nothing else links. */
export function isLaunchedChain(chainId: ChainId): boolean {
  return LAUNCHED_PROTOCOLS.some((p) => p.chainId === chainId);
}

/** The singular noun each protocol's positions go by, for per-position page
 *  titles ("MakerDAO Vault 31245", "Spark Position 0x1a2b…c4d5"). Lives in the
 *  roster module so a new explorer declares its noun here, not scattered across
 *  a title helper. Keyed on `SessionProtocol` (a closed union), so the `Record`
 *  makes a missing protocol a compile error. PWN carries "Loans" (plural): its
 *  per-wallet page lists a wallet's many discrete loans, not one account —
 *  unlike the single-account/single-id pages, which read singular.
 *  (positionNounPlural — for the listing-title vocabulary — is deferred with the
 *  `noun=` prop consolidation; the listing titles reuse their existing strings.) */
export const POSITION_NOUN: Record<SessionProtocol, string> = {
  "liquity-v2": "Trove",
  "aave-v4": "Position",
  "aave-v3": "Position",
  "aave-v3-base": "Position",
  // A holder's reading of one vault. It names no headline position — the vault
  // layer is in NOT_POSITION_EXPLORERS — and the rail never prints it either,
  // because that explorer draws no position tab; the entry exists because this
  // map is keyed on the closed session union.
  "aave-vaults": "Holding",
  // Alchemix calls the NFT a position, and so do its getters and its events.
  alchemix: "Position",
  "alchemix-base": "Position",
  // Yearn's is the same word for the same reason, and goes unprinted the same
  // way: the explorer draws no position tab and lists no positions.
  yearn: "Holding",
  seamless: "Position",
  makerdao: "Vault",
  maple: "Position",
  moonwell: "Position",
  "moonwell-base": "Position",
  morpho: "Position",
  "morpho-base": "Position",
  spark: "Position",
  compound: "Position",
  "compound-base": "Position",
  "compound-v2": "Position",
  dolomite: "Account",
  pwn: "Loans",
  "liquity-v1": "Trove",
  ebisu: "Trove",
  asymmetry: "Trove",
  basedollar: "Trove",
  fx: "Position",
  fluid: "Position",
  frankencoin: "Position",
  llamalend: "Position",
  // Polaris's own noun: the position is a CDP NFT, and the protocol's
  // getters, events and analytics all say "CDP".
  polaris: "CDP",
};

/** The listing-tab vocabulary: the position noun pluralised ("Troves",
 *  "Vaults", "Accounts"). PWN's noun is already the plural "Loans" (its
 *  per-wallet page lists many discrete loans), so a noun ending in "s" is
 *  passed through rather than doubled. */
export function positionNounPlural(session: SessionProtocol): string {
  const noun = POSITION_NOUN[session];
  return noun.endsWith("s") ? noun : `${noun}s`;
}

/** The explorer's name for a TEXT-ONLY surface — a tab title, an aria-label,
 *  a sentence — where the chain mark cannot go. On screen the chain is a mark
 *  beside the label (ChainMark), never a suffix on the name; where only words
 *  can carry it, it is said as a place: "Aave V3 on Base". Ethereum is the
 *  default and stays unsaid. */
export function explorerName(entry: Pick<ProtocolEntry, "label" | "chainId">): string {
  return entry.chainId === MAINNET_CHAIN_ID ? entry.label : `${entry.label} on ${CHAINS[entry.chainId].name}`;
}

/** LAUNCHED explorers only — this is a listing function, and every caller of it
 *  is a directory a reader picks from. An unlaunched entry is reached by typing
 *  its URL and by nothing else, so it is not here; nothing needs the whole of
 *  one chain's roster today, and a caller that did would filter `PROTOCOLS`
 *  itself rather than get the unfiltered set from a name that reads like a
 *  directory. */
export function protocolsForChain(chainId: ChainId): ProtocolEntry[] {
  return LAUNCHED_PROTOCOLS.filter((p) => p.chainId === chainId);
}

export function protocolIconSrc(id: string): string {
  // A Base deployment shares its protocol's mark: the roster id carries the
  // chain ("aave-v3-base") but the brand does not, and no `<id>-base.png`
  // exists — without the strip, every Base entry rendered a broken image.
  return `/icons/protocols/${id.replace(/-base$/, "")}.png`;
}

/** Resolve a bookmarks/session-store key (`SessionProtocol`) to its explorer
 *  directory entry — label, href, icon id. Undefined only if the union and the
 *  directory ever drift apart. */
export function protocolForSession(session: SessionProtocol): ProtocolEntry | undefined {
  return PROTOCOLS.find((p) => p.session === session);
}

/** Resolve an explorer home route (a listing's `basePath`, e.g. `/ethereum/spark`) to its
 *  directory entry. Undefined for non-explorer routes. Lets a shared listing shell
 *  look up protocol-level metadata from the path it already knows. */
export function protocolForHref(href: string): ProtocolEntry | undefined {
  return PROTOCOLS.find((p) => p.href === href);
}

/** Resolve ANY route inside an explorer (the listing, a sub-page, a position
 *  view) to its directory entry by href prefix. Undefined off the rails —
 *  marketing routes and the chain directories match nothing. Lets a shared
 *  loading boundary draw the real rail header for whatever route is being
 *  opened, from the pathname alone. */
export function protocolForPathname(pathname: string | null): ProtocolEntry | undefined {
  if (!pathname) return undefined;
  return PROTOCOLS.find((p) => pathname === p.href || pathname.startsWith(p.href + "/"));
}

/** The sub-page of `entry` whose route holds `pathname` (its own route or one
 *  nested under it), or undefined when the pathname is on none of them. */
export function subPageForPathname(entry: ProtocolEntry, pathname: string | null): SubPageEntry | undefined {
  if (!pathname) return undefined;
  return entry.subPages.find((s) => pathname === s.href || pathname.startsWith(s.href + "/"));
}

/** The one formation site for a wallet-filtered listing URL. Every explorer
 *  reads `q` centrally (lib/shared/list-filter.ts) — decision 0009 graduated the
 *  last two bespoke explorers onto the shared driver, so there is no per-protocol
 *  wallet param any more. Keyed on `SessionProtocol` (a closed union, so a typo is
 *  a compile error) rather than `id`. Returns `null` for an unknown session.
 *
 *  AN EXPLORER WITH NO POSITION LISTING FILTERS ITS SUB-PAGE'S — WHERE IT HAS
 *  ONE. Its own route opens on that sub-page and reads no `q`, so a filter hung
 *  on it would be silently dropped; the listing that honours one is the
 *  sub-page's `positions` route, which is where that explorer's holders are
 *  listed. An explorer with NEITHER gets null, and every caller here already
 *  falls back to the explorer's own route: until 2026-09-20 this formed
 *  `${subPages[0].href}/positions` unconditionally, which for a vault-native
 *  explorer with no holder census is a link to a 404. Unreachable while no
 *  such explorer had a wallet to bookmark; Yearn V3's holder lane is the first
 *  (TO-DO-ui-jobs §42 item 2).
 *
 *  Lowercasing is load-bearing, not cosmetic: `parseAaveV4Search`'s address regex
 *  is `[a-f0-9]` only, so a checksummed address silently matches nothing. */
export function listingHrefForWallet(session: SessionProtocol, wallet: string, takenOn?: string): string | null {
  const entry = protocolForSession(session);
  if (!entry) return null;
  let listing = entry.href;
  // A sub-page the caller names WINS over the explorer's own route: one rail
  // can own two listings of the same address, and only the caller knows which
  // one it is asking about. Morpho Blue Base lists Blue borrower positions at
  // `/base/morpho` and MetaMorpho holdings at `/base/morpho/vaults/positions`,
  // and a bookmark taken on the second opened the first until 2026-09-20
  // (§42 item 1) — the right namespace, a findable wallet, the wrong listing.
  // A name this build cannot resolve — a retired segment, or one that has lost
  // its holder listing — falls through to what follows rather than to null, so
  // the worst an unrecognised name costs is the landing it had before.
  const takenOnSub = takenOn ? entry.subPages.find((s) => s.segment === takenOn && s.holderListing) : undefined;
  if (takenOnSub) {
    listing = `${takenOnSub.href}/positions`;
  } else if (entry.positionListing === false) {
    if (!entry.subPages[0].holderListing) return null;
    listing = `${entry.subPages[0].href}/positions`;
  }
  return `${listing}?q=${encodeURIComponent(wallet.toLowerCase())}`;
}

/** The `segment` of the sub-page holding this rail's HOLDER listing, or
 *  undefined where it has none. A vault card asks for it as it bookmarks: the
 *  row is a holding, so the bookmark belongs on the listing of holdings,
 *  whatever segment that rail spells it under. */
export function holderListingSegment(session: SessionProtocol): string | undefined {
  return protocolForSession(session)?.subPages.find((s) => s.holderListing)?.segment;
}

/** Deep-link into an explorer's listing filtered to a wallet — used by the
 *  bookmarks modal. A thin wrapper over `listingHrefForWallet` so the URL is
 *  formed in exactly one place. `takenOn` is the sub-page segment the bookmark
 *  was taken on (`WalletSession.listing`); without one it opens the explorer's
 *  own listing, which is where every bookmark written before that was
 *  recorded opened. */
export function bookmarkHref(entry: ProtocolEntry, wallet: string, takenOn?: string): string {
  return listingHrefForWallet(entry.session, wallet, takenOn) ?? entry.href;
}
