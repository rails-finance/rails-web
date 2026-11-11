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
  /** Stable identity for counting distinct protocol VERSIONS regardless of how
   *  many chains carry one — Aave V3 on Ethereum and Aave V3 on Base share a
   *  `protocolKey` and count once toward "N DeFi protocols"; Aave V3 and Aave
   *  V4 do not, because they are different versions (Miles, 2026-09-28: count
   *  a version once however many chains it's on, each version separately).
   *  Omitted defaults to `id`, which is already a version's own stable key for
   *  every entry that is the only chain row its version ships on. Only a
   *  second-chain row (a `-base` entry today) needs to state it, naming back
   *  the id of the row it shares a version with. Not `label`: the two happen
   *  to match today for every chain-duplicate pair, but a version's identity
   *  should not depend on two display strings staying equal — this field is
   *  what SETS that they are the same version, not something a reader of the
   *  label should have to infer. See `LAUNCHED_PROTOCOL_VERSIONS`. */
  protocolKey?: string;
  /** The protocol's brand hue, an oklch hue angle (0 to 360), which tints the
   *  position card's frame zone (`--brand-hue`; rails-ops color-grammar,
   *  Identity; TO-DO-position-card 427). Stated once per version: a row that
   *  names a `protocolKey` takes the hue of the row it names. DRAFTS for Miles
   *  to confirm, read off each protocol's mark or site; Aave's and Morpho's
   *  match the 22 Oct 2026 mock-ups. */
  brand?: number;
  /** Capability tags shown as pills (Borrow / Lend / CDP / …). Provenance
   *  meta-tags like "Chain state" are surfaced elsewhere, not here. */
  tags: string[];
  /** One-line summary shown on the directory cards. */
  desc: string;
  /** Does this explorer's own route list POSITIONS? Every explorer but the
   *  vault-native ones and the position-first ones does, and the rail's first
   *  tab is that listing, named by the protocol's own noun. A protocol whose
   *  whole product is vaults has no position listing to draw — a share in a
   *  vault is not a position in the roster's sense (rails-ops decision 0027
   *  call 2) — so its rail drops that tab and its own route opens on the first
   *  sub-page. Omitted means it has one; `false` is the only other value,
   *  because "has a listing" needs no declaring. */
  positionListing?: false;
  /** The explorer's own route is a front door (a wallet field and links to
   *  its pages), and its position listing is at `<route>/positions`: the
   *  position-first Arbitrum explorers (rails-ops TO-DO-arbitrum-scoping.md
   *  items 16 and 18). Omitted means the route is the listing. */
  frontDoor?: true;
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
   *  Per entry rather than per chain because an unlaunched explorer
   *  (the two vault layers until 20 Oct 2026, Sky Savings until 5 Nov 2026) is
   *  a chain-1 row sitting beside twenty launched ones — a chain-level flag could not reach it. No chain carries a flag:
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
  /** How far back Rails's index of this explorer reaches (rails-ops decisions
   *  0061 and 0063), drawn as the history tag (`HistoryTag`) on every surface
   *  that shows the roster:
   *  - "none": not yet indexed. Figures are read from the chain when a page
   *    opens, and the tag reads "Read on visit".
   *  - "from-date": indexed from a start block after the protocol's
   *    deployment. The tag reads "History from <start date>", the date drawn
   *    from the index's start block (app/api/history-start/route.ts), so a
   *    backfill moves it with no edit here.
   *  Omitted means indexed from deployment, with no tag; the field goes in the
   *  commit where the index's start block reaches the deployment block. */
  history?: "none" | "from-date";
  /** `false`: indexed, but no listing page draws the index yet, so the
   *  explorer answers one wallet or one position at a time (/coverage's "In
   *  every explorer" caveat names it). The field goes in the change that adds
   *  the listing. Omitted means it has one, or it is not indexed (`history:
   *  "none"`), which the caveat words on its own. */
  listing?: false;
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
   *  so moving a sub-page is one edit here rather than a hunt through them.
   *  The type still admits an empty list; no entry uses it. */
  subPages: SubPageSpecs;
};

type SubPageSpecs = [SubPageSpec, ...SubPageSpec[]] | [];

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
  /** Explorer home (the discovery listing, or a front door) — never a specific wallet. Derived, never
   *  hand-written: see `explorerHref`. */
  href: string;
  /** Where this explorer's position listing is: `href`, or `href` +
   *  "/positions" on a front-door explorer (`frontDoor`). Derived. */
  listingHref: string;
  /** The spec's sub-pages, each carrying its derived route. */
  subPages: [SubPageEntry, ...SubPageEntry[]] | [];
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
    brand: 336,
    tags: ["Lend", "Borrow"],
    desc: "Single-pool lending on Ethereum: one cross-collateralised account per wallet, valued at Aave's oracle, with every liquidation traced",
    subPages: [{ segment: "markets", label: "Market overview", tab: "Markets" }],
  },
  {
    id: "aave-v3-base",
    session: "aave-v3-base",
    label: "Aave V3",
    chainId: 8453,
    slug: "aave-v3",
    protocolKey: "aave-v3",
    tags: ["Lend", "Borrow"],
    desc: "Aave V3's Base deployment, a separate Pool with its own reserves and risk parameters: every wallet's account read whole from the contracts",
    subPages: [{ segment: "markets", label: "Market overview", tab: "Markets" }],
  },
  {
    // Aave V3 on Arbitrum One, position-first (rails-ops
    // TO-DO-arbitrum-scoping.md): the explorer's own route is the front door,
    // a wallet field and links to the market overview, the positions listing
    // and the info page (items 16 and 18).
    id: "aave-v3-arbitrum",
    session: "aave-v3-arbitrum",
    label: "Aave V3",
    chainId: 42161,
    slug: "aave-v3",
    protocolKey: "aave-v3",
    tags: ["Lend", "Borrow"],
    desc: "Aave V3's Arbitrum deployment, a separate Pool with its own reserves and risk parameters: any wallet's account read whole from the contracts",
    frontDoor: true,
    subPages: [{ segment: "markets", label: "Market overview", tab: "Markets" }],
  },
  {
    id: "aave-v4",
    session: "aave-v4",
    label: "Aave V4",
    chainId: 1,
    slug: "aave-v4",
    brand: 280,
    tags: ["Lend", "Borrow"],
    desc: "Multi-spoke lending with unified liquidity across asset classes",
    subPages: [
      { segment: "markets", label: "Markets", tab: "Markets" },
      { segment: "hubs", label: "Hubs", tab: "Hubs" },
    ],
  },
  {
    // Aave V4's Base deployment — the Equities hub and its one spoke, Mag7:
    // Coinbase tokenized stocks as collateral, USDC to borrow. A second
    // roster row rather than a chain switch, for the reason aave-v3 /
    // aave-v3-base are two: separate contracts, separate accounts. The
    // seventh Base explorer, launched 2026-09-27.
    id: "aave-v4-base",
    session: "aave-v4-base",
    label: "Aave V4",
    chainId: 8453,
    slug: "aave-v4",
    protocolKey: "aave-v4",
    tags: ["Lend", "Borrow"],
    desc: "Aave V4 on Base: the Equities hub's Mag7 spoke, where Coinbase tokenized stocks back USDC loans, each stock price stated with when it was published",
    subPages: [
      { segment: "markets", label: "Markets", tab: "Markets" },
      { segment: "hubs", label: "Hubs", tab: "Hubs" },
    ],
  },
  {
    // Aave V4 on Arc (rails-ops ui-jobs 577): the Core hub and its three
    // lending spokes (Main, Forex, USDC Maple), read from the chain when a
    // page opens. A front door taking a wallet, its spoke accounts at
    // `<route>/<wallet>`, each opening `<route>/spoke/<spoke>/<wallet>`; the
    // Markets and Hubs pages are Ethereum's and Base's, fed by rails-server's
    // /api/at-block/aave-v4-arc routes. Unlaunched while Miles reads it.
    id: "aave-v4-arc",
    session: "aave-v4-arc",
    label: "Aave V4",
    chainId: 5042,
    slug: "aave-v4",
    protocolKey: "aave-v4",
    tags: ["Lend", "Borrow"],
    desc: "Aave V4 on Arc: a wallet's accounts on the Core hub's three spokes, each with its balances in dollars at the spoke's oracle, its health factor and 30 days of interest",
    positionListing: false,
    history: "none",
    unlaunched: true,
    subPages: [
      { segment: "markets", label: "Markets", tab: "Markets" },
      { segment: "hubs", label: "Hubs", tab: "Hubs" },
    ],
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
    brand: 336,
    tags: ["Vaults", "Savings"],
    desc: "Aave's vaults (savings GHO, Umbrella stake tokens and static aTokens): each vault's size and share price, and every address that holds one",
    // No position listing: a holder's share in a vault is not a position in the
    // roster's sense (rails-ops decision 0027 call 2), so the rail's first tab
    // is this sub-page and `/ethereum/aave` opens on it.
    positionListing: false,
    subPages: [{ segment: "vaults", label: "Vaults overview", tab: "Vaults", holderListing: true }],
  },
  {
    // Aerodrome Slipstream on Base (rails-ops ui-jobs 566), Uniswap's door 1
    // on Base: a front door taking a wallet, its positions at
    // `<route>/<wallet>`, each opening `<route>/position/<deployment>/<id>`
    // (ids overlap across Slipstream's three position managers). Reads come
    // from rails-server's at-block routes (lib/api/fetch-aerodrome.ts).
    id: "aerodrome",
    session: "aerodrome",
    label: "Aerodrome",
    chainId: 8453,
    slug: "aerodrome",
    // Hue 264, Aerodrome's blue #0433FF in oklch (the mark's second stripe, from
    // the favicon in aerodrome-finance/agents on GitHub).
    brand: 264,
    tags: ["Liquidity"],
    desc: "Concentrated liquidity on Base, staked or not: a position's range, fees or AERO and pool over the last 30 days",
    positionListing: false,
    history: "none",
    subPages: [],
  },
  {
    // Balancer V3 on Ethereum (rails-ops ui-jobs 569), Uniswap's door 1: a
    // front door taking a wallet, the pools it holds a share of at
    // `<route>/<wallet>`, each opening `<route>/position/<pool>/<wallet>` (a
    // pool share is a Vault balance, so the pool and the wallet name it). Reads
    // come from rails-server's at-block routes (lib/api/fetch-balancer.ts).
    id: "balancer-v3",
    session: "balancer-v3",
    label: "Balancer V3",
    chainId: 1,
    slug: "balancer-v3",
    tags: ["Liquidity"],
    desc: "Pool shares on Ethereum: a wallet's part of each pool's tokens and the pool over the last 30 days",
    positionListing: false,
    unlaunched: true,
    history: "none",
    listing: false,
    subPages: [],
  },
  {
    // Balancer V3 on Arbitrum (rails-ops ui-jobs 569): Ethereum's explorer on
    // the same Vault address, its 30-day read at a UTC midnight's block.
    id: "balancer-v3-arbitrum",
    session: "balancer-v3-arbitrum",
    label: "Balancer V3",
    chainId: 42161,
    slug: "balancer-v3",
    protocolKey: "balancer-v3",
    tags: ["Liquidity"],
    desc: "Pool shares on Arbitrum: a wallet's part of each pool's tokens and the pool over the last 30 days",
    positionListing: false,
    unlaunched: true,
    history: "none",
    listing: false,
    subPages: [],
  },
  {
    // Alchemix V3's ETHEREUM lines — alUSD and alETH. Two entries rather than a
    // chain switch, for the reason aave-v3 / aave-v3-base are two: a position's
    // identity is the (chain, line) pair, and a token id on one chain says
    // nothing about the same number on the other. Launched 2026-09-27.
    id: "alchemix",
    session: "alchemix",
    label: "Alchemix",
    chainId: 1,
    slug: "alchemix",
    brand: 50,
    tags: ["CDP", "Yield"],
    desc: "Self-repaying loans against yield-bearing vault tokens: each position's debt and collateral, dated by block, and the redemptions that moved them",
    subPages: [{ segment: "lines", label: "Lines overview", tab: "Lines" }],
  },
  {
    // Alchemix V3's BASE line — alUSDb. Its own Alchemist, its own Transmuter,
    // its own positions. It also answers a different GRADE from the two
    // Ethereum lines: Base has had no redemption, so its figures replay
    // wei-exact from the position's own events, while Ethereum's are read from
    // getCDP at a block (rails-ops decisions/0032). That difference is a thing
    // each explorer says in words, not a property of the roster. Launched
    // 2026-09-27.
    id: "alchemix-base",
    session: "alchemix-base",
    label: "Alchemix",
    chainId: 8453,
    slug: "alchemix",
    protocolKey: "alchemix",
    tags: ["CDP", "Yield"],
    desc: "Alchemix V3 on Base: every position on the alUSDb line, its debt and collateral rebuilt from its events and dated by block",
    subPages: [{ segment: "lines", label: "Lines overview", tab: "Lines" }],
  },
  {
    id: "asymmetry",
    session: "asymmetry",
    label: "Asymmetry",
    chainId: 1,
    slug: "asymmetry",
    brand: 240,
    tags: ["CDP"],
    desc: "A Liquity V2 fork minting USDaf across seven collateral branches: each Trove's collateral and debt read from events",
    subPages: [{ segment: "branches", label: "Branches", tab: "Branches" }],
  },
  {
    id: "compound-v2",
    session: "compound-v2",
    label: "Compound V2",
    chainId: 1,
    slug: "compound-v2",
    brand: 160,
    tags: ["Lend", "Borrow"],
    desc: "The original cToken markets over six years: every account's supplies, borrows and liquidations, with the markets read live at /compound-v2/markets",
    subPages: [{ segment: "markets", label: "Markets overview", tab: "Markets" }],
  },
  {
    id: "compound",
    session: "compound",
    label: "Compound V3",
    chainId: 1,
    slug: "compound-v3",
    brand: 160,
    tags: ["Lend", "Borrow"],
    desc: "Compound V3 markets replayed from events: each account's signed base principal and every collateral asset traceable",
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
    protocolKey: "compound",
    tags: ["Lend", "Borrow"],
    desc: "Compound V3's Base deployment: five Comets read live, and a wallet's standing in every one of them found by asking each market",
    subPages: [{ segment: "markets", label: "Markets overview", tab: "Markets" }],
  },
  {
    // Compound V3 on Arbitrum One, position-first (rails-ops
    // TO-DO-arbitrum-scoping.md item 12): the explorer's own route is the
    // front door (items 16 and 18) and the four Comets' overview is the
    // markets sub-page.
    id: "compound-v3-arbitrum",
    session: "compound-v3-arbitrum",
    label: "Compound V3",
    chainId: 42161,
    slug: "compound-v3",
    protocolKey: "compound",
    tags: ["Lend", "Borrow"],
    desc: "Compound V3's Arbitrum deployment: four Comets read live, and any wallet's standing in each one read from the contracts at one block",
    frontDoor: true,
    subPages: [{ segment: "markets", label: "Market overview", tab: "Markets" }],
  },
  {
    id: "dolomite",
    session: "dolomite",
    label: "Dolomite",
    chainId: 1,
    slug: "dolomite",
    brand: 195,
    tags: ["Lend", "Borrow"],
    desc: "Dolomite margin accounts, one per owner and account number: balances and debts from the contract's events, each account's liquidation line read live",
    subPages: [{ segment: "markets", label: "Markets overview", tab: "Markets" }],
  },
  {
    id: "basedollar",
    session: "basedollar",
    label: "Basedollar",
    chainId: 8453,
    slug: "basedollar",
    brand: 80,
    tags: ["CDP"],
    desc: "A Liquity V2 fork on Base minting BD across five collateral branches, captured from Base: each Trove's collateral and debt read from events",
    subPages: [{ segment: "branches", label: "Branches", tab: "Branches" }],
  },
  {
    id: "ebisu",
    session: "ebisu",
    label: "Ebisu",
    chainId: 1,
    slug: "ebisu",
    brand: 350,
    tags: ["CDP"],
    desc: "A Liquity V2 fork minting ebUSD across five collateral branches: each Trove's collateral and debt read from events",
    subPages: [{ segment: "branches", label: "Branches", tab: "Branches" }],
  },
  {
    // Euler V2 on Base and Arbitrum (rails-ops reference/read-on-visit-candidates-572.md,
    // row 10): a vault kit under one connector, the same code on both chains and
    // separate vaults, so two entries. The route is a front door taking a
    // wallet; its accounts are at `<route>/<wallet>`, each holding opening
    // `<route>/position/<account>/<vault>`. Reads come from rails-server's
    // at-block routes (lib/api/fetch-euler.ts). No Ethereum entry: its 902
    // vaults put a wallet's read over the tier's budget.
    id: "euler-v2-base",
    session: "euler-v2-base",
    label: "Euler V2",
    chainId: 8453,
    slug: "euler-v2",
    protocolKey: "euler-v2",
    // DRAFT: hue 160, read off the green of Euler's app; Miles to confirm.
    brand: 160,
    tags: ["Lend", "Borrow"],
    desc: "Euler's vaults on Base: a wallet's 256 accounts, each loan with its collateral and health, and each deposit over the last 30 days",
    positionListing: false,
    history: "none",
    unlaunched: true,
    subPages: [],
  },
  {
    id: "euler-v2-arbitrum",
    session: "euler-v2-arbitrum",
    label: "Euler V2",
    chainId: 42161,
    slug: "euler-v2",
    protocolKey: "euler-v2",
    tags: ["Lend", "Borrow"],
    desc: "Euler's vaults on Arbitrum: a wallet's 256 accounts, each loan with its collateral and health, and each deposit over the last 30 days",
    positionListing: false,
    history: "none",
    unlaunched: true,
    subPages: [],
  },
  {
    id: "fluid",
    session: "fluid",
    label: "Fluid",
    chainId: 1,
    slug: "fluid",
    brand: 260,
    tags: ["Lend", "Borrow", "CDP"],
    desc: "Fluid vault positions as NFTs: deposits and borrows from the chain, and each liquidation's effect on every position it touched",
    subPages: [{ segment: "vaults", label: "Vaults overview", tab: "Vaults" }],
  },
  {
    // Fluid's vaults on Base (rails-ops ui-jobs 574), read on visit: a front
    // door taking a wallet, its positions at `<route>/<wallet>`, each opening
    // `<route>/position/<id>`. A separate entry from Ethereum's indexed
    // explorer. Reads come from rails-server's at-block routes
    // (lib/api/fetch-fluid-base.ts). Unlaunched while Miles reads it.
    id: "fluid-base",
    session: "fluid-base",
    label: "Fluid",
    chainId: 8453,
    slug: "fluid",
    protocolKey: "fluid",
    tags: ["Borrow", "CDP"],
    desc: "Fluid vault positions on Base: a position's collateral, debt, ratio to its limits and interest over the last 30 days",
    positionListing: false,
    history: "none",
    unlaunched: true,
    subPages: [],
  },
  {
    id: "frankencoin",
    session: "frankencoin",
    label: "Frankencoin",
    chainId: 1,
    slug: "frankencoin",
    brand: 25,
    tags: ["Borrow", "CDP"],
    desc: "Oracle-free ZCHF loans, each a separate contract whose owner declares the liquidation price, which anyone can challenge by auction, all in native units",
    subPages: [{ segment: "system", label: "System overview", tab: "System" }],
  },
  {
    id: "fx",
    session: "fx",
    label: "f(x) Protocol",
    chainId: 1,
    slug: "fx",
    brand: 15,
    tags: ["Leverage", "CDP"],
    desc: "Leveraged f(x) positions on wstETH and WBTC: every event from the chain, current state from the pools, and shared funding costs split per position",
    subPages: [{ segment: "pools", label: "Pools overview", tab: "Pools" }],
  },
  {
    // Lido on Ethereum (rails-ops ui-jobs 570): a front door taking a wallet
    // and stating Lido's totals, the wallet's stake (stETH and wstETH) and its
    // withdrawal requests at `<route>/<wallet>`. A wallet holds one Lido stake,
    // so its wallet page is its position page. Reads come from rails-server's
    // at-block routes (lib/api/fetch-lido.ts).
    id: "lido",
    session: "lido",
    label: "Lido",
    chainId: 1,
    slug: "lido",
    // Hue 240, a draft read off Lido's blue mark (public/icons/protocols/lido.png).
    brand: 240,
    tags: ["Staking"],
    desc: "Staked ether on Ethereum: a wallet's stETH and wstETH in ETH, its change over the last 30 days, and its withdrawal requests",
    positionListing: false,
    unlaunched: true,
    history: "none",
    subPages: [],
  },
  {
    id: "liquity-v1",
    session: "liquity-v1",
    label: "Liquity V1",
    chainId: 1,
    slug: "liquity-v1",
    brand: 270,
    tags: ["Borrow"],
    desc: "The original interest-free Trove: ETH collateral and exact LUSD debt emitted per event",
    subPages: [{ segment: "system", label: "System overview", tab: "System" }],
  },
  {
    id: "liquity",
    session: "liquity-v2",
    label: "Liquity V2",
    chainId: 1,
    slug: "liquity-v2",
    brand: 270,
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
    brand: 20,
    tags: ["Borrow"],
    desc: "Curve's LlamaLend markets, where liquidation happens gradually across a price band: each loan's soft-liquidation state read live and cross-checked",
    subPages: [{ segment: "markets", label: "Markets overview", tab: "Markets" }],
  },
  {
    id: "makerdao",
    session: "makerdao",
    label: "MakerDAO",
    chainId: 1,
    slug: "makerdao",
    brand: 180,
    tags: ["CDP"],
    desc: "MakerDAO vaults and LockStake urns read from the chain, every value traceable",
    subPages: [{ segment: "system", label: "System overview", tab: "System" }],
  },
  {
    id: "maple",
    session: "maple",
    label: "Maple",
    chainId: 1,
    slug: "maple",
    brand: 30,
    tags: ["Lend", "RWA"],
    desc: "Maple's institutional credit pools from the lender's side: share balances, the withdrawal queue, and what is liquid now against what is lent out",
    subPages: [{ segment: "pools", label: "Pools overview", tab: "Pools" }],
  },
  {
    id: "moonwell",
    session: "moonwell",
    label: "Moonwell",
    chainId: 1,
    slug: "moonwell",
    brand: 250,
    tags: ["Lend", "Borrow"],
    desc: "A Compound v2 fork newly on Ethereum: exact mToken balances replayed from events, debt from emitted balances",
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
    protocolKey: "moonwell",
    tags: ["Lend", "Borrow"],
    desc: "Moonwell's Base deployment: twenty-one markets under one Comptroller, every account's standing read from the contracts",
    subPages: [{ segment: "markets", label: "Markets overview", tab: "Markets" }],
  },
  {
    id: "morpho",
    session: "morpho",
    label: "Morpho Blue",
    chainId: 1,
    slug: "morpho",
    brand: 264,
    tags: ["Lend", "Borrow"],
    desc: "Morpho Blue's isolated lending markets on Ethereum: every position replayed from events and priced in its market's loan token",
    // MetaMorpho on Ethereum hangs off this explorer as it does on Base
    // (decision 0028; rails-ops ui-jobs 486).
    subPages: [
      { segment: "markets", label: "Markets overview", tab: "Markets" },
      { segment: "vaults", label: "Vaults overview", tab: "Vaults", holderListing: true },
    ],
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
    protocolKey: "morpho",
    tags: ["Lend", "Borrow"],
    desc: "Morpho Blue on Base: more than 4,300 isolated markets, every borrower listed, and any wallet's positions across all of them",
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
    // Morpho Blue on Arbitrum One, position-first (rails-ops
    // TO-DO-arbitrum-scoping.md item 13): the explorer's own route is the
    // front door (items 16 and 18) and the census's markets read live are the
    // markets sub-page.
    id: "morpho-arbitrum",
    session: "morpho-arbitrum",
    label: "Morpho Blue",
    chainId: 42161,
    slug: "morpho",
    protocolKey: "morpho",
    tags: ["Lend", "Borrow"],
    desc: "Morpho Blue's Arbitrum deployment: 258 isolated markets censused from the singleton, any wallet's positions read from the contract at one block",
    frontDoor: true,
    subPages: [{ segment: "markets", label: "Market overview", tab: "Markets" }],
  },
  {
    // PancakeSwap V3 on Base and Arbitrum (rails-ops ui-jobs 575), a Uniswap
    // V3 fork read by Uniswap's pages (components/protocol/uniswap, with
    // `protocol: "pancakeswap"`): a front door taking a wallet, its positions
    // at `<route>/<wallet>` (staked in the farm or not), each opening
    // `<route>/position/<id>`. Unlaunched until decision 0061's launch list
    // holds.
    id: "pancakeswap-v3-base",
    session: "pancakeswap-v3-base",
    label: "PancakeSwap V3",
    chainId: 8453,
    slug: "pancakeswap-v3",
    // Hue 57, the bunny's #D1884F in oklch (pancakeswap/pancake-developer, docs/public/logo.svg).
    brand: 57,
    tags: ["Liquidity"],
    desc: "PancakeSwap V3 on Base, staked in its farm or not: a position's range, fees, CAKE and pool over the last 30 days",
    positionListing: false,
    unlaunched: true,
    history: "none",
    subPages: [],
  },
  {
    id: "pancakeswap-v3-arbitrum",
    session: "pancakeswap-v3-arbitrum",
    label: "PancakeSwap V3",
    chainId: 42161,
    slug: "pancakeswap-v3",
    protocolKey: "pancakeswap-v3-base",
    tags: ["Liquidity"],
    desc: "PancakeSwap V3 on Arbitrum, staked in its farm or not: a position's range, fees, CAKE and pool over the last 30 days",
    positionListing: false,
    unlaunched: true,
    history: "none",
    subPages: [],
  },
  {
    // Pendle on Ethereum, phase 1: a wallet's PT, YT and LP per market at a
    // pinned block, from the routers' events and chain reads. A Pendle market
    // is not a share vault and holds no loan, so there is no position listing
    // and no place in /vaults; `/ethereum/pendle` opens on the market roster.
    id: "pendle",
    session: "pendle",
    label: "Pendle",
    chainId: 1,
    slug: "pendle",
    // Hue 260, read off pendle.finance's favicon #1A2E4F (known-infrastructure's
    // PENDLE_BAR).
    brand: 260,
    tags: ["Fixed yield", "Yield trading"],
    desc: "A wallet's principal, yield and liquidity tokens in each Pendle market, valued at Pendle's oracle and read at one block",
    positionListing: false,
    subPages: [{ segment: "markets", label: "Markets overview", tab: "Markets" }],
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
    brand: 220,
    tags: ["CDP", "Stablecoin"],
    desc: "Polaris on the Sepolia testnet: USDp and GOLDp minted against pETH, every position from the market's events, liquidations absorbed by stability pools",
    subPages: [{ segment: "markets", label: "Markets overview", tab: "Markets" }],
  },
  {
    id: "pwn",
    session: "pwn",
    label: "PWN",
    chainId: 1,
    slug: "pwn",
    brand: 180,
    tags: ["P2P", "Fixed-term"],
    desc: "Peer-to-peer fixed-term loans read from events: each loan's collateral, credit and terms traceable",
    subPages: [{ segment: "book", label: "Loan book", tab: "Loan book" }],
  },
  {
    id: "seamless",
    session: "seamless",
    label: "Seamless",
    chainId: 8453,
    slug: "seamless",
    brand: 285,
    tags: ["Lend", "Borrow"],
    desc: "An Aave V3 fork on Base, frozen since April 2025: every position read whole from the contracts, and none of them can grow",
    subPages: [{ segment: "markets", label: "Market overview", tab: "Markets" }],
  },
  {
    // Sky Savings (sUSDS on Ethereum). Sky rebranded MakerDAO, and a saver is
    // not a borrower, so savings are an explorer of their own, linked from
    // MakerDAO's (rails-ops TO-DO-sky-savings-scoping §6.3). A holder's
    // sUSDS carries no debt and no threshold, so it is left out of the home
    // position headline (NOT_POSITION_EXPLORERS) while it lists positions.
    id: "sky-savings",
    session: "sky-savings",
    label: "Sky Savings",
    chainId: 1,
    slug: "sky-savings",
    brand: 280,
    tags: ["Savings"],
    desc: "Every sUSDS holder on Ethereum: the balance, its worth in USDS and the interest earned, from the token's logs and checked against the contract",
    subPages: [{ segment: "rates", label: "Savings Rate history", tab: "Rate" }],
  },
  {
    // CoW on Ethereum: a wallet's trades through GPv2Settlement, read from
    // the `Trade` logs victoria's Sieve captures (rails-ops decisions/0058
    // step 3). The route is a front door; a wallet's trades are at
    // `/ethereum/cow/<wallet>`. A trade is not a position, so there is no
    // position listing. Launched 4 Nov 2026 (Miles).
    id: "cow",
    session: "cow",
    label: "CoW",
    chainId: 1,
    slug: "cow",
    // Hue 307, read off CoW's brand purple #490072 (its kit pairs it with
    // #F996EE, hue 331); the zone draws the hue at the site's fixed lightness
    // and chroma per theme.
    brand: 307,
    tags: ["Trades"],
    desc: "Every trade a wallet settled through CoW, read from the settlement contract's logs and chosen by token",
    positionListing: false,
    subPages: [],
  },
  {
    id: "spark",
    session: "spark",
    label: "SparkLend",
    chainId: 1,
    slug: "spark",
    brand: 25,
    tags: ["Lend", "Borrow"],
    desc: "SparkLend, an Aave V3 fork, replayed from events: each reserve's principal traceable and valued at the Pool's oracle",
    subPages: [{ segment: "markets", label: "Market overview", tab: "Markets" }],
  },
  {
    // Uniswap V3 and V4 on Ethereum (rails-ops ui-jobs 556): two versions,
    // two entries. The route is a front door taking a wallet; its positions
    // are at `<route>/<wallet>`, each opening `<route>/position/<id>`. A pool
    // has no page yet, so there is no sub-page and no position listing. Reads
    // come from rails-server's at-block routes (lib/api/fetch-uniswap.ts).
    id: "uniswap-v3",
    session: "uniswap-v3",
    label: "Uniswap V3",
    chainId: 1,
    slug: "uniswap-v3",
    // DRAFT: hue 4, read off Uniswap's pink #FF007A in oklch, the space this
    // field takes (its HSL hue is 331).
    brand: 4,
    tags: ["Liquidity"],
    desc: "Concentrated liquidity on Ethereum: a position's range, fees and pool over the last 30 days, read from the pool at two blocks",
    positionListing: false,
    history: "none",
    subPages: [],
  },
  {
    id: "uniswap-v4",
    session: "uniswap-v4",
    label: "Uniswap V4",
    chainId: 1,
    slug: "uniswap-v4",
    brand: 4,
    tags: ["Liquidity"],
    desc: "Uniswap's singleton pools on Ethereum, hooks included: a position's range, fees and pool over the last 30 days",
    positionListing: false,
    history: "none",
    subPages: [],
  },
  {
    // Uniswap V3 on Base (rails-ops ui-jobs 568) and V3 and V4 on Arbitrum
    // (573), each its own entry on the Ethereum explorers' pages
    // (components/protocol/uniswap, with a chain): Base reads no position's
    // history. Unlaunched until decision 0061's launch list holds.
    id: "uniswap-v3-base",
    session: "uniswap-v3-base",
    label: "Uniswap V3",
    chainId: 8453,
    slug: "uniswap-v3",
    protocolKey: "uniswap-v3",
    tags: ["Liquidity"],
    desc: "Uniswap V3 on Base: a position's range, fees and pool over the last 30 days",
    positionListing: false,
    unlaunched: true,
    history: "none",
    subPages: [],
  },
  {
    id: "uniswap-v3-arbitrum",
    session: "uniswap-v3-arbitrum",
    label: "Uniswap V3",
    chainId: 42161,
    slug: "uniswap-v3",
    protocolKey: "uniswap-v3",
    tags: ["Liquidity"],
    desc: "Uniswap V3 on Arbitrum: a position's range, fees and pool over the last 30 days",
    positionListing: false,
    unlaunched: true,
    history: "none",
    subPages: [],
  },
  {
    id: "uniswap-v4-arbitrum",
    session: "uniswap-v4-arbitrum",
    label: "Uniswap V4",
    chainId: 42161,
    slug: "uniswap-v4",
    protocolKey: "uniswap-v4",
    tags: ["Liquidity"],
    desc: "Uniswap's singleton pools on Arbitrum, hooks included: a position's range, fees and pool over the last 30 days",
    positionListing: false,
    unlaunched: true,
    history: "none",
    subPages: [],
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
    brand: 260,
    tags: ["Vaults", "Yield"],
    desc: "Every vault the V3 factories made, endorsed or not, each one's totals, share price and endorsement read from chain at one block",
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
  const subPages: ProtocolEntry["subPages"] = first ? [sub(first), ...rest.map(sub)] : [];
  const listingHref = spec.frontDoor ? `${href}/positions` : href;
  return { ...spec, href, listingHref, subPages, infoHref: `${href}/info` };
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
/** A roster entry's history kind, by its roster id; null for an explorer
 *  indexed from deployment, which wears no history tag. */
export const historyOf = (id: string): "none" | "from-date" | null =>
  PROTOCOLS.find((p) => p.id === id)?.history ?? null;

export const LAUNCHED_PROTOCOLS: ProtocolEntry[] = PROTOCOLS.filter((p) => !p.unlaunched);

/** One row per distinct launched protocol VERSION — the roster deduplicated on
 *  `protocolKey`, keeping the first entry in roster order for each key (so a
 *  chain-1 row stands for its `-base` sibling). This is what "N DeFi
 *  protocols" counts: Aave V3 on Ethereum and Aave V3 on Base are one version
 *  and count once; Aave V3 and Aave V4 (or Compound V2/V3, Liquity V1/V2) are
 *  different versions and count separately; a fork (Spark, Seamless, Ebisu,
 *  Asymmetry, Basedollar) is its own protocol, distinct from what it forked.
 *  Unlaunched entries are excluded, same as `LAUNCHED_PROTOCOLS` — see its own
 *  note (Miles, 2026-09-28: count a version once however many chains it's on,
 *  each version separately). Also the source for a labels list that cannot
 *  print a version twice (StructuredData's `featureList`). */
export const LAUNCHED_PROTOCOL_VERSIONS: ProtocolEntry[] = (() => {
  const seen = new Set<string>();
  const versions: ProtocolEntry[] = [];
  for (const entry of LAUNCHED_PROTOCOLS) {
    const key = entry.protocolKey ?? entry.id;
    if (seen.has(key)) continue;
    seen.add(key);
    versions.push(entry);
  }
  return versions;
})();

/** The distinct DeFi protocol versions Rails has a launched explorer for on a
 *  PRODUCTION chain (24 on 2 Nov 2026): the count the home/SEO/share copy
 *  states as "N DeFi protocols on Ethereum, Base, and Arbitrum, plus Polaris
 *  on Sepolia". Testnet explorers are left out because that sentence names
 *  Polaris in words; counting it too would count it twice (ui-jobs 475). One
 *  row per version (see `LAUNCHED_PROTOCOL_VERSIONS`), so a version on two
 *  chains counts once. */
export const LAUNCHED_PRODUCTION_PROTOCOL_VERSION_COUNT = LAUNCHED_PROTOCOL_VERSIONS.filter(
  (p) => !CHAINS[p.chainId].testnet,
).length;

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
  return (Object.values(CHAINS) as ChainMeta[]).filter((c) => isLaunchedChain(c.id));
}

/** The PRODUCTION chains Rails offers — the launched chains minus the
 *  testnets. What the home page's coverage claims are stated over: a Sepolia
 *  figure is a test figure, so it is not part of a claim about DeFi. */
export function launchedProductionChains(): ChainMeta[] {
  return launchedChains().filter((c) => !c.testnet);
}

/** "Ethereum, Base, and Arbitrum" — the production chains Rails names in a
 *  coverage or count claim: the home page's scope phrase ("positions across
 *  Ethereum, Base, and Arbitrum DeFi"), the hero's terms, the site metadata.
 *  Built from the roster rather than written out, so a sentence about what
 *  Rails covers cannot name a chain the nav has stopped linking. Three or more
 *  chains take an Oxford comma. A testnet (Sepolia, Polaris) is left out —
 *  the copy sites that count it name it on their own, in words, where they
 *  have room ("…on Ethereum, Base, and Arbitrum, plus Polaris on Sepolia"), because it is
 *  one explorer on one chain, outside the production chains the site offers. */
export function launchedProductionChainNames(): string {
  const names = launchedProductionChains().map((c) => c.name);
  return names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

/** THE CHAIN LAUNCH FLAG: a chain is launched when it has at least one launched
 *  explorer. False for a chain with no explorers at all (Optimism and Arc while
 *  their first explorers are built) and for one whose every explorer is
 *  unlaunched. Every surface a reader finds a chain on asks this, directly or
 *  through `launchedChains()`: the home chain tabs, the nav, the chain toggle,
 *  Focus's chain picks, /coverage's chain list, the sitemap, /about, llms.txt
 *  and StructuredData. An unlaunched chain's /coverage/<slug> still serves,
 *  with the work-in-progress strip and `index: false`. Tested in
 *  scripts/test/chain-launch.test.mjs. */
export function isLaunchedChain(chainId: ChainId): boolean {
  return chainLaunchedIn(PROTOCOLS, chainId);
}

/** The rule over any roster: some entry on the chain is not flagged
 *  `unlaunched`. `some` over no entries is false, so a chain with none is
 *  unlaunched. */
export function chainLaunchedIn(roster: readonly Pick<ProtocolEntry, "chainId" | "unlaunched">[], chainId: ChainId) {
  return roster.some((p) => p.chainId === chainId && !p.unlaunched);
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
  "aave-v4-base": "Position",
  "aave-v3": "Position",
  "aave-v3-base": "Position",
  "aave-v3-arbitrum": "Position",
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
  "morpho-arbitrum": "Position",
  spark: "Position",
  compound: "Position",
  "compound-base": "Position",
  "compound-v3-arbitrum": "Position",
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
  // Polaris calls the position a CDP; the page says position and teaches the
  // acronym once (rails-ops TO-DO-ui-jobs 405).
  polaris: "Position",
  // A holder address of sUSDS (rails-ops TO-DO-sky-savings-scoping §1).
  "sky-savings": "Position",
  // A wallet's trades: the page titles name them, and nothing lists positions.
  cow: "Trades",
  pendle: "Position",
  "uniswap-v3": "Position",
  "uniswap-v4": "Position",
  aerodrome: "Position",
  "uniswap-v3-base": "Position",
  "uniswap-v3-arbitrum": "Position",
  "uniswap-v4-arbitrum": "Position",
  "pancakeswap-v3-base": "Position",
  "pancakeswap-v3-arbitrum": "Position",
  // A wallet's stETH and wstETH; the page names it a stake.
  lido: "Stake",
  "fluid-base": "Position",
  "aave-v4-arc": "Position",
  // One account's holding in one vault.
  "euler-v2-base": "Position",
  "euler-v2-arbitrum": "Position",
  // A Vault balance of a pool's shares; the page names it a pool share.
  "balancer-v3": "Position",
  "balancer-v3-arbitrum": "Position",
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

/** A roster id's brand hue, through its `protocolKey` row when it names one;
 *  undefined for an id outside the roster or a version with no hue yet. */
export function protocolBrand(id: string): { hue: number } | undefined {
  const entry = PROTOCOLS.find((p) => p.id === id);
  if (!entry) return undefined;
  const hue = entry.brand ?? PROTOCOLS.find((p) => p.id === entry.protocolKey)?.brand;
  return hue == null ? undefined : { hue };
}

export function protocolIconSrc(id: string): string {
  // A Base deployment shares its protocol's mark: the roster id carries the
  // chain ("aave-v3-base") but the brand does not, and no `<id>-base.png`
  // exists — without the strip, every Base entry rendered a broken image. An
  // Arbitrum deployment ("aave-v3-arbitrum") is the same case.
  const brand = id.replace(/-(base|arbitrum)$/, "");
  // Compound V3 on Arbitrum is keyed by its server lane, `compound-v3-arbitrum`;
  // its mark is Compound's, as Base's (`compound-base`) is.
  // Uniswap V4 takes Uniswap's mark; the repo holds no V4 image of its own.
  if (brand === "uniswap-v4") return "/icons/protocols/uniswap.png";
  // Balancer V3 takes Balancer's mark.
  if (brand === "balancer-v3") return "/icons/protocols/balancer.png";
  return `/icons/protocols/${brand === "compound-v3" ? "compound" : brand}.png`;
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
  let listing = entry.listingHref;
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
    if (!entry.subPages[0]?.holderListing) return null;
    listing = `${entry.subPages[0].href}/positions`;
  }
  return `${listing}?q=${encodeURIComponent(wallet.toLowerCase())}`;
}
