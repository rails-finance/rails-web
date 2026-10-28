// The Lifetime flows panel's price view (rails-ops
// reference/lifetime-flows-scrubber.md; ui-jobs 328, step 2).
// ---------------------------------------------------------------------------
// The panel stacks the value line over one held asset's price chart, one
// cursor for both, the events under them. The readout is the price chart's
// tip, shown while the chart has focus. Per page, at 1280 and 390:
//   - the chart's panes stand, value over price, and the value line is the same
//     before and after the cursor's trip along the price chart;
//   - the strip draws no day the series lacks: every day drawn as observed is
//     a day of the page's own price answer, every day drawn carried is not;
//   - at three stops the readout's block (`data-price-block`, the value its
//     <Prov> carries as `source.block`) is the block of the answer's point on
//     the readout's day, and the price figure is inside a <Prov>;
//   - the events-and-charts how-to-read (the events heading's "?", F7.1)
//     names the selected series;
//   - one pip row under the charts;
//   - the price tip's list names each held asset with a series;
//   - the price tip's level line is hidden until its triangle toggle
//     (`data-flow-level-toggle`, F19.8) is pressed, and the chart's level line
//     is drawn either way;
//   - the date tip's chevron (`data-flow-events-toggle`, F5.1) opens the day's
//     events in a fixed-height list that stays open, at one height, as the
//     steps move the cursor.
// Pages: Aave V3 Core 0xfb93…2a71 and 0xfb45…750a (liquidated), whose answer
// is /api/aave-v3/flows, and whose chart opens on the health view (step 4,
// `checkHealth`); four Liquity V2 Troves, whose answer is
// /api/liquity-v2/prices/daily (checked over the answer's own days: before
// them the Trove's rows price the line): WETH 1022…0154 (open, read live),
// WETH 2241…2759 (open, redeemed several hundred times), rETH 1939…5964
// (redeemed, then liquidated on 5 Jun 2026) and WETH 8250…8317 (closed on
// 26 Oct 2026).
// On each Trove (step 3), against the Trove's rows (/api/trove/…/timeline):
//   - the price line carries no event or redemption marks (the events row
//     does);
//   - the liquidation level draws no day the Trove's life lacks: each day has
//     a row holding collateral and debt by its end, none after a liquidation;
//   - at the three stops, the level's <Prov> block is the block of the last
//     row holding both by the day's end (none at the live read), and the
//     runway's is the price's;
//   - a day with redemptions states the last one's redemption price at its block;
//   - on an open Trove the level's last point is today's and equals the
//     card's "Liquidates at", and the runway at the last stop is the card's;
//   - on the liquidated and the closed Trove the last stop reads "At close"
//     on the close day, and the price line draws no day after it (ruling 14);
//   - at 390 a timeline card's caption carries "View on chart" beside its
//     date, a 36px target, and a tap on it moves the cursor to that day and
//     leaves the card closed.
//
// The chart engine (ui-jobs 328 step 4c): the Liquity and Aave families draw
// on Lightweight Charts, one canvas for the value line and the price chart, one
// slider over it (`data-flow-strip-view="chart"`, its panes named by
// `data-flow-chart-panes`); a canvas leaves nothing in the DOM to read, so the
// page sets the drawn days and lines as data hooks (`[data-flow-lw-hooks]`:
// `data-price-line`, `data-liq-level`, `data-flow-value-line`). On the new
// engine the checks add: the time axis is drawn with no logo or notice on the
// chart (the site footer carries the attribution); it fits, opens on the whole
// life with the cursor at the right, spreads its pips; ⏮ ‹ › ⏭ in order at All
// and 30D, frozen and not, at 1280 and 390 with touch; the health view's older
// days a dotted series meeting the solid one (`data-price-meets`); and at 1280
// the wheel (`checkLwWheel`): over the chart it scrolls the page, Ctrl with it
// zooms, a sideways swipe pans. Aave V3 Prime 0xb8a4…715e (wstETH/WETH, more
// than 60 days with events, so its older health days are dotted) and EtherFi
// 0x0f2a…bbe take the health checks; SparkLend 0x1601…347e (no debt, so no
// health view) the price checks against its answer. Step 5 (the health view on SparkLend, Aave V3 Base and Seamless):
// SparkLend 0x070b…b113 (60 days read, its older days dotted) takes the price
// and health checks, and Aave V3 Base 0xe883…4cc8 (older days dotted) and
// Seamless 0x8182…7804 (every day read) the chart's checks and the health
// checks (`lwOnly`: their price answer is the knots). Aave V4 (step 5, its
// factors read from the spoke at each picked block): Main 0x7eac…fa09 (one
// collateral) takes the price and health checks, Main 0x7680…a65e (one
// collateral, older days dotted) and 0x7562…af18 (three collaterals, older
// days dotted) the health checks, and on each the picked collaterals' levels
// today match `assetLiqPrices` worked from the spoke's state and oracle now
// (`v4Spoke`, within 1 %: the head moves between the reads). Each health page also
// checks that an asset picked from the list draws its level. Moonwell,
// Compound V3 and Compound V2 (step 5, their factors read at each picked
// block): one borrower per family and chain takes the chart's and the health
// checks, today's figure against the card's chain read (`hf`) and each
// collateral's level today against ruling 7's from that read (`basket`, within
// 1.5 %), Moonwell Base 0x2d7a…9e9c (underwater) the health checks with no
// level. Step 4d moved every other family onto the engine: one position
// per family takes the chart's checks alone (`lwOnly`), its panes named
// (`panes`: "value" where the family has no price series, a pane per side
// where the sides have no common unit), and a one-day life (`priceOnly`) the
// price pane alone, with Home and End on its slider for the steps it does not
// draw. Where the page does not tie the chart to its timeline (no Sync to
// chart), a tap moves the cursor without freezing it and ⏭ brings it back.
// MakerDAO and Fluid (step 5, `ratio`): the view in the card's terms, the
// collateral ratio against the minimum ratio and the position ratio against
// the liquidation threshold (`checkRatio`); since step 8 Fluid's line is the
// threshold in force each day (`firstLine`, `steps`), each change a marker
// (Fluid 2156, open, two steps; 1334, closed, one). Dolomite (step 5, `ratio` with
// `noLevel`): the margin ratio against 1 + the account's margin ratio, since
// step 8 read at each picked event's block (`atBlock`: the first day's line
// against the route's answer; `sparse`: only days before the earliest read
// dotted), no level on a market's price. Liquity V1 (`v1`): the
// ETH price with the Trove's level at 110 %, today the card's "Liquidates at",
// a liquidated life's level ending on its liquidation day, the how-to-read
// naming Recovery Mode. Sky Savings (`share`): the share price (chi) in place
// of the sUSDS price, today the card's, no level, the how-to-read naming chi.
// The forks and Polaris (step 6, `level`, `checkLevelView`): Ebisu WBTC 3876
// (liquidated) and weETH 1065 (closed), whose level steps by the two minimums'
// ratio on 4 Jan 2026, Ebisu stcUSD 6774, Asymmetry scrvUSD 2145 and Basedollar
// cbETH 6846 (open: today's level the card's "Liquidates at"), Asymmetry ysyBOLD
// 4577 and Basedollar wstETH 1150 (closed: the level ends that day), Polaris USDp
// 2420 and GOLDp 18 (open: today's level the card's price × 115 % ÷ its ratio),
// USDp 3732 and GOLDp 29 (liquidated); the how-to-read names the minimum.
// LlamaLend (step 6, `band`, `checkBand`): 0xeb2c (open), 0xa32e (in soft
// liquidation), 0xd76a (under its band), 0x61db (liquidated), 0xbbc5
// (closed): Health first, today the card's; the band stepping on event days,
// today the card's Bands; the tip's band words; the drawn band against the
// scales' placing at All, zoomed and panned.
// The vault holder pages, Maple and Frankencoin (step 7, `shareLine`,
// `checkFamilyLine`): one holder per vault kind (Morpho Base 0x3d88, Aave
// Umbrella stkwaEthUSDC 0x5a2a, sGHO 0x1676, stata waEthUSDC 0xab67, Yearn
// 0xb634) draws its share price, each event day's point read at that event's
// block, today the card's top-row figure; Maple 0xc4ec its pool rate, today the
// card's exit rate; Frankencoin 0x4220 (its owner moved the price four times)
// and 0xdc18 the declared liquidation price alone, each event day's figure the
// MintingUpdate's, stepping where the rows moved it, today the position's
// price(); no level on any, the how-to-read naming the source.
// `FIXTURES=<regex>` runs the pages whose id matches.
//
// Run:  BASE_URL=http://localhost:3190 node scripts/verify/verify-lifetime-price-chart.mjs

import { chromium } from "playwright";
import { BASE as HOST_BASE, bypassHeaders, hostFetch } from "./lib/host.mjs";

const BASE = (process.env.BASE_URL ?? HOST_BASE).replace(/\/$/, "");
/** Morpho's view (step 6): the card's LTV, its LLTV in the "Share of the
 *  LLTV line" row, today's level the price its "Liquidates on a drop of"
 *  names; days between events dotted. */
const MORPHO_RATIO = {
  label: "LTV",
  liquidates: "above",
  head: "ltv",
  lineRow: "lltv-share",
  linePattern: /LLTV (\d+(?:\.\d+)?)%/,
  dropRow: "liquidation-drop",
  held: true,
  help: ["the market oracle's price", "fixed when the market was created", "drawn dotted"],
};
/** f(x)'s view (step 6): the card's debt ratio, its "Liquidates from" and
 *  "Rebalances from" lines, today's levels its "Liquidates at" and
 *  "Rebalances at"; days between events dotted. */
const FX_RATIO = {
  label: "Debt ratio",
  liquidates: "above",
  head: "debt-ratio",
  lineRow: "liquidation-line",
  warnRow: "rebalance-line",
  warnVerb: "Rebalances",
  levelRow: "liquidation-at",
  warnLevelRow: "rebalance-at",
  held: true,
  help: ["the price each event was valued at", "rebalance ratio", "read at the block of the day's last event"],
};
/** Alchemix V3's view (steps 6 and 8): the card's Collateralisation against
 *  its "Liquidates at", the lower bound read at each picked event's block
 *  (`atBlock`: the first day's line against the route's answer there); the
 *  share price's level today the price its "Liquidates on a share-price drop
 *  of" names; days with no reading dotted. */
const alchemixRatio = (chain, alchemist) => ({
  label: "Collateralisation",
  liquidates: "below",
  headRow: "collateralisation",
  lineRow: "liquidation-line",
  dropRow: "liquidates-on-drop",
  held: true,
  // eth-aleth/726 held collateral and no debt for 114 days before its mint.
  firstWithin: 160,
  help: ["the vault's share price", "lower bound in force at each event", "drawn dotted"],
  atBlock: (block) => [
    `/api/chain/alchemix/bound-at-block?chain=${chain}&alchemist=${alchemist}&block=${block}`,
    (b) => b?.lowerBound,
  ],
});
const ALX_ETH_ALUSD = "0xeb83112d925268bede86654c13d423a987587e3e";
const ALX_ETH_ALETH = "0xfa995b6abc387376c3e7de5f6d394ab5b6bee26b";
const ALX_BASE_ALUSDB = "0xeb380d86eed275c9f2ed77745ab1b2ccf364bf7a";
/** Dolomite's view (steps 5 and 8): the margin ratio against 1 + the
 *  account's margin ratio read at each picked event's block; a day before
 *  the earliest read dotted. */
const dolomiteRatio = (owner, accountNumber, extra = {}) => ({
  label: "Margin ratio",
  liquidates: "below",
  head: "margin-ratio",
  lineRow: "liquidation-line",
  noLevel: true,
  sparse: true,
  help: ["the core's oracle price", "in force at each event, read at the block of each day's last event"],
  atBlock: (block) => [
    `/api/chain/dolomite/risk-at-block?owner=${owner}&accountNumber=${accountNumber}&block=${block}&markets=`,
    (b) => (b?.marginRatioForAccount > 0 ? 1 + b.marginRatioForAccount : null),
  ],
  ...extra,
});
const PAGES = [
  {
    id: "aave-v3 0xfb93",
    path: "/ethereum/aave-v3/0xfb9395e0b216823c9a60d5dfcb8c6ef458232a71?market=core",
    answer: "/api/aave-v3/flows",
    health: true,
  },
  {
    id: "aave-v3 0xfb45 (liquidated)",
    path: "/ethereum/aave-v3/0xfb45f0e612424104753f2e2fc9507b3d082e750a?market=core",
    answer: "/api/aave-v3/flows",
    health: true,
  },
  {
    id: "aave-v3 prime 0xb8a4",
    path: "/ethereum/aave-v3/0xb8a451107a9f87fde481d4d686247d6e43ed715e?market=prime",
    answer: "/api/aave-v3/flows",
    health: true,
  },
  {
    id: "aave-v3 etherfi 0x0f2a",
    path: "/ethereum/aave-v3/0x0f2a32f4f54ec9d52a193e9e3493fb5fea86cbbe?market=etherfi",
    answer: "/api/aave-v3/flows",
    health: true,
    // A health factor near 50: every asset's level is more than ten times
    // from its price (ruling 15), so none is drawn.
    noLevel: true,
  },
  {
    id: "spark 0x1601",
    path: "/ethereum/spark/0x1601843c5e9bc251a3272907010afa41fa18347e",
    answer: "/api/spark/flows",
    query: "wallet=0x1601843c5e9bc251a3272907010afa41fa18347e",
  },
  {
    id: "spark 0x070b",
    path: "/ethereum/spark/0x070b8d1f8b63eba95db31c8e85ba536b3474b113",
    answer: "/api/spark/flows",
    query: "wallet=0x070b8d1f8b63eba95db31c8e85ba536b3474b113",
    health: true,
    timeline: "/api/spark/timeline?wallet=0x070b8d1f8b63eba95db31c8e85ba536b3474b113",
  },
  {
    id: "aave-v4 main 0x7eac",
    path: "/ethereum/aave-v4/spoke/main/0x7eac02864fbae93de38394a3e7b72a22e9b5fa09",
    answer: "/api/aave-v4/flows",
    query: "wallet=0x7eac02864fbae93de38394a3e7b72a22e9b5fa09&spoke=main",
    health: true,
    v4Spoke: "main",
    timeline: "/api/aave-v4/timeline?wallet=0x7eac02864fbae93de38394a3e7b72a22e9b5fa09&recent=1000",
  },
  {
    id: "aave-v4 main 0x7680",
    path: "/ethereum/aave-v4/spoke/main/0x7680c2d966cc3a82815ad92b00cb59da0dd2a65e",
    lwOnly: true,
    health: true,
    v4Spoke: "main",
    timeline: "/api/aave-v4/timeline?wallet=0x7680c2d966cc3a82815ad92b00cb59da0dd2a65e&recent=1000",
  },
  {
    id: "aave-v4 main 0x7562",
    path: "/ethereum/aave-v4/spoke/main/0x756281ae56c3d51bcdb0f46518ba1d148282af18",
    lwOnly: true,
    health: true,
    v4Spoke: "main",
    timeline: "/api/aave-v4/timeline?wallet=0x756281ae56c3d51bcdb0f46518ba1d148282af18&recent=1000",
  },
  // Base's two Pools answer in another shape (the knots): the chart's checks
  // and the health view's.
  {
    id: "aave-v3-base 0xe883",
    path: "/base/aave-v3/0xe883426b4fc84a7f5cc86415cabbef43e73a4cc8",
    lwOnly: true,
    health: true,
    timeline: "/api/chain/aave-v3-base/timeline?wallet=0xe883426b4fc84a7f5cc86415cabbef43e73a4cc8",
  },
  {
    id: "seamless 0x8182",
    path: "/base/seamless/0x818214d3494fbc4be4f450c50677e55987804206",
    lwOnly: true,
    health: true,
    timeline: "/api/chain/seamless/timeline?wallet=0x818214d3494fbc4be4f450c50677e55987804206",
  },
  // Step 4d: one position per family on the chart's checks alone.
  // Step 5 (the health view on Moonwell, Compound V3 and Compound V2): each
  // borrower takes the chart's checks and the health checks, today's figure
  // against the card's chain read (`hf`) and each collateral's level today
  // against ruling 7's worked from that read (`basket`).
  {
    id: "moonwell 0x33a7",
    noChanges: true,
    path: "/ethereum/moonwell/0x33a7ec1055edd4cc35ef289156c7a7a078043474",
    lwOnly: true,
    health: true,
    timeline: "/api/moonwell/timeline?wallet=0x33a7ec1055edd4cc35ef289156c7a7a078043474&limit=1000",
    hf: {
      url: "/api/chain/moonwell/position?wallet=0x33a7ec1055edd4cc35ef289156c7a7a078043474",
      field: "healthFactor",
    },
    basket: { url: "/api/chain/moonwell/position?wallet=0x33a7ec1055edd4cc35ef289156c7a7a078043474", kind: "ctoken" },
  },
  {
    id: "moonwell-base 0x98b8",
    changes: { day: 20206, name: "cbBTC collateral factor", from: "81 %", to: "85 %", block: 29545911 },
    path: "/base/moonwell/0x98b8d0621c1a79dcfc5a65d01abf9cfdd46aeb7a",
    lwOnly: true,
    health: true,
    timeline: "/api/chain/moonwell-base/timeline?wallet=0x98b8d0621c1a79dcfc5a65d01abf9cfdd46aeb7a",
    hf: {
      url: "/api/chain/moonwell-base/position?wallet=0x98b8d0621c1a79dcfc5a65d01abf9cfdd46aeb7a",
      field: "healthFactor",
    },
    basket: {
      url: "/api/chain/moonwell-base/position?wallet=0x98b8d0621c1a79dcfc5a65d01abf9cfdd46aeb7a",
      kind: "ctoken",
    },
  },
  // Underwater (bad debt, a health factor near 0): every level is more than
  // ten times from its price, so none is drawn.
  {
    id: "moonwell-base 0x2d7a",
    changes: { day: 20702, name: "tBTC collateral factor", from: "80 %", to: "64 %", block: 50935342 },
    path: "/base/moonwell/0x2d7a6b617f11b6755bfd3ab79f1d7cb963ff9e9c",
    lwOnly: true,
    health: true,
    noLevel: true,
    timeline: "/api/chain/moonwell-base/timeline?wallet=0x2d7a6b617f11b6755bfd3ab79f1d7cb963ff9e9c",
  },
  {
    id: "compound-v3 usdc 0xc5cd",
    noChanges: true,
    path: "/ethereum/compound-v3/usdc/0xc5cd3abe92d857ecfb73e86de0f8a3ed3239cc46",
    lwOnly: true,
    health: true,
    timeline: "/api/compound/timeline?wallet=0xc5cd3abe92d857ecfb73e86de0f8a3ed3239cc46&market=usdc&limit=1000",
    hf: {
      url: "/api/chain/compound/position?wallet=0xc5cd3abe92d857ecfb73e86de0f8a3ed3239cc46&market=usdc",
      field: "healthFactor",
    },
    basket: {
      url: "/api/chain/compound/position?wallet=0xc5cd3abe92d857ecfb73e86de0f8a3ed3239cc46&market=usdc",
      kind: "comet",
    },
  },
  {
    id: "compound-v3-base usdc 0x3a79",
    path: "/base/compound-v3/usdc/0x3a79bf27ff626b55c601f01666bc522cc65eb852",
    lwOnly: true,
  },
  {
    id: "compound-v3-base usdc 0x2f42",
    noChanges: true,
    path: "/base/compound-v3/usdc/0x2f42b066069945a71100aef832afdbe14d954e4b",
    lwOnly: true,
    health: true,
    timeline: "/api/chain/compound-base/timeline?wallet=0x2f42b066069945a71100aef832afdbe14d954e4b",
    hf: {
      url: "/api/chain/compound-base/wallet?wallet=0x2f42b066069945a71100aef832afdbe14d954e4b",
      field: "healthFactor",
      market: "usdc",
    },
    basket: {
      url: "/api/chain/compound-base/wallet?wallet=0x2f42b066069945a71100aef832afdbe14d954e4b",
      kind: "comet",
      market: "usdc",
    },
  },
  {
    id: "compound-v3-arbitrum usdc 0x13ad",
    noChanges: true,
    path: "/arbitrum/compound-v3/usdc/0x13adb56198ea3e0789c28a5528c07b4d5d674ce3",
    lwOnly: true,
    health: true,
    timeline: "/api/chain/compound-arbitrum/timeline?wallet=0x13adb56198ea3e0789c28a5528c07b4d5d674ce3",
    hf: {
      url: "/api/chain/compound-arbitrum/wallet?wallet=0x13adb56198ea3e0789c28a5528c07b4d5d674ce3",
      field: "healthFactor",
      market: "usdc",
    },
    basket: {
      url: "/api/chain/compound-arbitrum/wallet?wallet=0x13adb56198ea3e0789c28a5528c07b4d5d674ce3",
      kind: "comet",
      market: "usdc",
    },
  },
  {
    id: "compound-v2 0x6217",
    changes: { day: 19430, name: "WBTC collateral factor", from: "70 %", to: "60 %", block: 16826903 },
    path: "/ethereum/compound-v2/0x6217c008da6ea46b6db500695287d77d03f79a42",
    lwOnly: true,
    health: true,
    timeline: "/api/compound-v2/timeline?wallet=0x6217c008da6ea46b6db500695287d77d03f79a42&limit=1000",
    hf: {
      url: "/api/chain/compound-v2/position?wallet=0x6217c008da6ea46b6db500695287d77d03f79a42",
      field: "healthReplica",
    },
  },
  // Liquidated once, two collaterals in reach of a level (0x6217's are not).
  {
    id: "compound-v2 0xb074",
    changes: { day: 19948, name: "USDC collateral factor", from: "85.50 %", to: "84.50 %", block: 20519734 },
    path: "/ethereum/compound-v2/0xb07421eecdb730794b3a7e76e54e7683c3687d8b",
    lwOnly: true,
    health: true,
    timeline: "/api/compound-v2/timeline?wallet=0xb07421eecdb730794b3a7e76e54e7683c3687d8b&limit=1000",
    hf: {
      url: "/api/chain/compound-v2/position?wallet=0xb07421eecdb730794b3a7e76e54e7683c3687d8b",
      field: "healthReplica",
    },
    basket: {
      url: "/api/chain/compound-v2/position?wallet=0xb07421eecdb730794b3a7e76e54e7683c3687d8b",
      kind: "ctoken",
    },
  },
  // Step 8 (the collateral factor changes on Compound V3, V2 and Moonwell,
  // from the setters' logs): a Comet's at the upgrade that carried it, a
  // Comptroller's at its block; each a marker (`changes`), and a life with
  // none draws none (`noChanges`, above on 0x33a7, 0xc5cd, 0x2f42 and 0x13ad).
  // Compound V3 0x072f (open, wstETH 87 → 85 % on 6 Aug 2025 and 85 → 86 %
  // on 15 Nov 2025, both between its events), 0x7829 (closed 21 Aug 2025,
  // after the first; the second outside the life), Base USDbC 0xb4f7 (WETH
  // 84 → 74 % and 74 → 64 %), Arbitrum 0x6ed2 (WETH 90 → 88 %); Compound V2
  // 0x0f8e (closed, after the last change); Moonwell Base 0x54ec (closed,
  // four tBTC and USDC changes).
  {
    id: "compound-v3 usdc 0x072f (two upgrades between events)",
    path: "/ethereum/compound-v3/usdc/0x072fc633b8546af8e2a242b36697267835734076",
    lwOnly: true,
    health: true,
    timeline: "/api/compound/timeline?wallet=0x072fc633b8546af8e2a242b36697267835734076&market=usdc&limit=1000",
    changes: { day: 20306, name: "wstETH liquidation collateral factor", from: "87 %", to: "85 %", block: 23084176 },
  },
  {
    id: "compound-v3 usdc 0x7829 (closed)",
    path: "/ethereum/compound-v3/usdc/0x782949470ddd695ce5cf506a2faff476ffdf6799",
    lwOnly: true,
    changes: {
      day: 20306,
      name: "wstETH liquidation collateral factor",
      from: "87 %",
      to: "85 %",
      block: 23084176,
      outside: 20407,
    },
  },
  {
    id: "compound-v3-base usdbc 0xb4f7",
    path: "/base/compound-v3/usdbc/0xb4f73453748396bf3a1c99b860d9932477807fa4",
    lwOnly: true,
    changes: { day: 20014, name: "WETH liquidation collateral factor", from: "84 %", to: "74 %", block: 21219146 },
  },
  {
    id: "compound-v3-arbitrum usdc 0x6ed2",
    path: "/arbitrum/compound-v3/usdc/0x6ed20ad6824302825bc92573f65c286f27e75a4e",
    lwOnly: true,
    health: true,
    timeline: "/api/chain/compound-arbitrum/timeline?wallet=0x6ed20ad6824302825bc92573f65c286f27e75a4e",
    changes: { day: 20194, name: "WETH liquidation collateral factor", from: "90 %", to: "88 %", block: 326916536 },
  },
  {
    id: "compound-v2 0x0f8e (closed, no change)",
    path: "/ethereum/compound-v2/0x0f8e3711c5be6f91fb86e54d148b0efffc82b0e0",
    lwOnly: true,
    noChanges: true,
  },
  {
    id: "moonwell-base 0x54ec (closed)",
    path: "/base/moonwell/0x54ecb3397b0bf31cb0b81eb2444e2a7b32507d8b",
    lwOnly: true,
    changes: { day: 20403, name: "tBTC collateral factor", from: "85 %", to: "84 %", block: 38046922 },
  },
  // Step 5 (the health view in the card's terms on MakerDAO and Fluid):
  // each page opens on the card's ratio against its line (`ratio`), today's
  // ratio, line and level the card's, the line at the first day the ilk
  // read's (Maker) or the one in force at the first event (Fluid), no day dotted,
  // and the how-to-read naming the source. Maker 2028 (ETH-A, 150 % → 145 %
  // in its life), 31489 (WBTC-A, liquidated 5 Jun 2026); Fluid 6 and 8538
  // (liquidated in part, open).
  {
    id: "makerdao 2028",
    path: "/ethereum/makerdao/2028",
    lwOnly: true,
    unit: "USD",
    changes: { day: 18866, name: "Minimum ratio", from: "150 %", to: "145 %", block: 13108692 },
    ratio: {
      label: "Collateral ratio",
      liquidates: "below",
      head: "collateral-ratio",
      lineRow: "minimum-ratio",
      levelRow: "liquidates-at",
      ilk: "ETH-A",
      help: ["the OSM price", "the Spotter's minimum ratio"],
    },
  },
  {
    id: "makerdao 31489 (liquidated)",
    path: "/ethereum/makerdao/31489",
    lwOnly: true,
    // The fee set of 27 Oct 2025, and the WBTC-A sets after the liquidation
    // (13.50 % on 6 Jun 2026) unmarked; every set in the life against the log.
    changes: {
      day: 20388,
      name: "Stability fee",
      from: "12.75 %",
      to: "13.00 %",
      block: 23670008,
      outside: 20610,
      feeLog: "WBTC-A",
    },
    ratio: {
      label: "Collateral ratio",
      liquidates: "below",
      head: "collateral-ratio",
      lineRow: "minimum-ratio",
      levelRow: "liquidates-at",
      ilk: "WBTC-A",
      help: ["the OSM price", "the Spotter's minimum ratio"],
    },
  },
  // Step 5 on Dolomite, Liquity V1 and Sky Savings. Dolomite 0x49d6 (closed
  // 16 Oct 2026), 0x65a9 (open, two markets a side) and 0xce8b (open,
  // liquidated before); Liquity V1 0x04ca (open) and 0xf932 life 2
  // (liquidated 5 Nov 2025); Sky 0x176f (open) and 0x0000…83eb (closed).
  {
    id: "dolomite 0x49d6 (closed)",
    path: "/ethereum/dolomite/0x49d62ca7ab8e28f7a28d9abadf84fe8b45e3caf6/15809042418583418827551470108194220080728327193143889538122062408455944908946",
    lwOnly: true,
    ratio: dolomiteRatio(
      "0x49d62ca7ab8e28f7a28d9abadf84fe8b45e3caf6",
      "15809042418583418827551470108194220080728327193143889538122062408455944908946",
    ),
  },
  {
    id: "dolomite 0x65a9",
    path: "/ethereum/dolomite/0x65a9e8ce4570624a84cbaf7e0540bd7d706b241f/32240150336664509314013882100458201794439878083374431556084268488477773350727",
    lwOnly: true,
    ratio: dolomiteRatio(
      "0x65a9e8ce4570624a84cbaf7e0540bd7d706b241f",
      "32240150336664509314013882100458201794439878083374431556084268488477773350727",
    ),
  },
  {
    id: "dolomite 0xce8b (liquidated before)",
    path: "/ethereum/dolomite/0xce8bb478053d602adf6c38a53ccd1c8e19be907a/32240150336664509314013882100458201794439878083374431556084268488477773350727",
    lwOnly: true,
    ratio: dolomiteRatio(
      "0xce8bb478053d602adf6c38a53ccd1c8e19be907a",
      "32240150336664509314013882100458201794439878083374431556084268488477773350727",
    ),
  },
  // Step 8: Dolomite 0x0aaf (closed 29 Aug 2025; its line 111.11 % →
  // 117.65 % on 10 Aug 2025, the read that first shows the account's override
  // gone, with debt on both days) and 0x6c26
  // (open; weETH's margin premium 6.25 % → 3.66 % on 4 Feb 2026, a marker,
  // the line kept by the account's override).
  {
    id: "dolomite 0x0aaf (closed, override step)",
    path: "/ethereum/dolomite/0x0aaf897d06b50a415824ab4fa00e845236fc9f69/45058837244567983852475267108604456366341992727621759411173494977889038878813",
    lwOnly: true,
    ratio: dolomiteRatio(
      "0x0aaf897d06b50a415824ab4fa00e845236fc9f69",
      "45058837244567983852475267108604456366341992727621759411173494977889038878813",
      { steps: [[20310, 1.1111111111111112, 1.1764705882352942]] },
    ),
  },
  {
    id: "dolomite 0x6c26 (weETH premium marker)",
    path: "/ethereum/dolomite/0x6c2693f5a936f37ed03cfa8465bf2d8beff19a0f/53264634398202998011678213589718677637041677243442662116055745019972740369638",
    lwOnly: true,
    changes: { day: 20488, name: "weETH margin premium", from: "6.25 %", to: "3.66 %", block: 24384982 },
    ratio: dolomiteRatio(
      "0x6c2693f5a936f37ed03cfa8465bf2d8beff19a0f",
      "53264634398202998011678213589718677637041677243442662116055745019972740369638",
    ),
  },
  {
    id: "fluid 6",
    path: "/ethereum/fluid/6",
    lwOnly: true,
    ratio: {
      label: "Position ratio",
      liquidates: "above",
      head: "position-ratio",
      lineRow: "liquidates-above",
      fluid: "/api/chain/fluid/position?nft=6",
      help: ["the vault oracle's price", "steps where Fluid governance changed it"],
      // No change inside the life: the how-to-read names no markers.
      helpNot: ["grey diamond"],
    },
  },
  {
    id: "fluid 8538 (liquidated)",
    path: "/ethereum/fluid/8538",
    lwOnly: true,
    ratio: {
      label: "Position ratio",
      liquidates: "above",
      head: "position-ratio",
      lineRow: "liquidates-above",
      fluid: "/api/chain/fluid/position?nft=8538",
      help: ["the vault oracle's price", "steps where Fluid governance changed it"],
      // No change inside the life: the how-to-read names no markers.
      helpNot: ["grey diamond"],
    },
  },
  // Step 8 (the threshold in force each day, /api/fluid/threshold-history):
  // #2156 (cbBTC/USDC, open) 85 % at its first event, 88 % from 11 Oct 2024,
  // 90 % from 21 May 2025; #1334 (WBTC/USDT, closed 25 Sep 2024) 85 %, 88 %
  // from 18 Aug 2024, the vault's 21 May 2025 change after its close unmarked.
  {
    id: "fluid 2156 (two threshold steps)",
    path: "/ethereum/fluid/2156",
    lwOnly: true,
    changes: { day: 20007, name: "Liquidation threshold", from: "85 %", to: "88 %", block: 20944531 },
    ratio: {
      label: "Position ratio",
      liquidates: "above",
      head: "position-ratio",
      lineRow: "liquidates-above",
      fluid: "/api/chain/fluid/position?nft=2156",
      firstLine: 0.85,
      steps: [
        [20007, 0.85, 0.88],
        [20229, 0.88, 0.9],
      ],
      help: [
        "the vault oracle's price",
        "steps where Fluid governance changed it",
        "each change a grey diamond on the events row",
      ],
    },
  },
  {
    id: "fluid 1334 (closed, one threshold step)",
    path: "/ethereum/fluid/1334",
    lwOnly: true,
    changes: {
      day: 19953,
      name: "Liquidation threshold",
      from: "85 %",
      to: "88 %",
      block: 20556431,
      outside: 20229,
    },
    ratio: {
      label: "Position ratio",
      liquidates: "above",
      head: "position-ratio",
      lineRow: "liquidates-above",
      fluid: "/api/chain/fluid/position?nft=1334",
      firstLine: 0.85,
      steps: [[19953, 0.85, 0.88]],
      help: [
        "the vault oracle's price",
        "steps where Fluid governance changed it",
        "each change a grey diamond on the events row",
      ],
    },
  },
  {
    id: "liquity-v1 0x04ca",
    path: "/ethereum/liquity-v1/0x04ca2a945ccba92ca2443024c07c99f81e71547f?epoch=1",
    lwOnly: true,
    v1: "open",
  },
  {
    id: "liquity-v1 0xf932 (liquidated)",
    path: "/ethereum/liquity-v1/0xf9324746fcdc2e018d7feac2293490ddbab56759?epoch=2",
    lwOnly: true,
    v1: "liquidated",
    liqTs: 1762305995,
  },
  {
    id: "sky-savings 0x176f",
    path: "/ethereum/sky-savings/0x176f3dab24a159341c0509bb36b833e7fdd0a132",
    lwOnly: true,
    valueLine: /^the balance's value in USD$/,
    changes: { day: 20657, name: "Savings Rate", from: "3.60 %", to: "3.52 %", block: 25596101 },
    share: true,
  },
  {
    id: "sky-savings 0x0000…83eb (closed)",
    path: "/ethereum/sky-savings/0x000000000000deaacbb476761b12b99b22b583eb",
    lwOnly: true,
    share: true,
  },
  // Morpho (step 6): the LTV against the market's LLTV, the collateral's
  // level debt ÷ (collateral × LLTV); a lender's position draws the value
  // pane alone.
  {
    id: "morpho 0xebb8",
    path: "/ethereum/morpho/ebd23a871b52e0a8c92bd719f4413600101b69e946cb72923b3a33fb5bc6ec85-0xebb870a0aaaa7bc55ead925d03a4af4a8db79a03",
    lwOnly: true,
    ratio: MORPHO_RATIO,
  },
  {
    id: "morpho 0x594c (liquidated)",
    path: "/ethereum/morpho/66cd49c47e1178e2c446ea9ebb94cc4b0a98448b1616c471a0733c23e98d658d-0x594c5ee5a326295ff6212c31bb3311747d3bd562",
    lwOnly: true,
    ratio: { ...MORPHO_RATIO, endDay: 20749 },
  },
  {
    id: "morpho-base 0x9f03 (lender)",
    path: "/base/morpho/0x9f03da73cf0f3a141404af735c16cf17427d81db/0xc9658cac13a9b9b5c1ebaa8ce19c735283cc761ff528d149a7221047bb7fab45",
    lwOnly: true,
    panes: "value",
  },
  {
    id: "morpho-base 0xb977",
    path: "/base/morpho/0xb97771daf3551e162be6185605d51a463067b671/0x9103c3b4e834476c9a62ea009ba2c884ee42e94e6e314a26f04d312434191836",
    lwOnly: true,
    ratio: MORPHO_RATIO,
  },
  {
    id: "morpho-base 0x0d67 (liquidated)",
    path: "/base/morpho/0x0d6772586c7d99fbe0a445fd8256a29d732e618a/0x4f55f2f1a4bcb77aa6c84da2fde5641ef0baf8dee41015efbc8e606139d34fd3",
    lwOnly: true,
    ratio: { ...MORPHO_RATIO, endDay: 20736 },
  },
  // The forks and Polaris (step 6): the collateral's price with the level
  // against the minimum in force each day.
  {
    id: "ebisu wbtc 3876 (liquidated, MCR step)",
    path: "/ethereum/ebisu/wbtc/38767992399838988350336392758823407708425408086117331868518504752269504506657",
    lwOnly: true,
    level: {
      asset: "WBTC",
      endDay: 20489,
      step: { day: 20457, ratio: 120 / 132 },
      help: ["132% until 4 Jan 2026, 120% since"],
    },
  },
  {
    id: "ebisu weeth 1065 (closed, MCR step)",
    path: "/ethereum/ebisu/weeth/106525219326064530299176858413070691994107358379893271777150080609961810096862",
    lwOnly: true,
    changes: { day: 20457, name: "Minimum ratio", from: "128 %", to: "120 %", block: 24160712 },
    level: {
      asset: "weETH",
      endDay: 20624,
      step: { day: 20457, ratio: 120 / 128 },
      help: ["128% until 4 Jan 2026, 120% since"],
    },
  },
  {
    id: "ebisu stcusd 6774",
    path: "/ethereum/ebisu/stcusd/6774201543947923016744174294482881587816035374101342731108014726689376691497",
    lwOnly: true,
    level: { asset: "stcUSD", card: "liquidates-at", help: ["115% minimum, which no governance log has moved"] },
  },
  {
    id: "asymmetry scrvusd 2145",
    path: "/ethereum/asymmetry/scrvusd/21455407195608252231693499135014282170032223495298941722085434215551435526302",
    lwOnly: true,
    level: { asset: "scrvUSD", card: "liquidates-at", help: ["today's 110% minimum, held across the life"] },
  },
  {
    id: "asymmetry ysybold 4577 (closed)",
    path: "/ethereum/asymmetry/ysybold/45771828629529054463940548704077640517998892185928814218152521258795699925919",
    lwOnly: true,
    level: { asset: "ysyBOLD", endDay: 20392, help: ["today's", "minimum, held across the life"] },
  },
  {
    id: "basedollar cbeth 6846",
    path: "/base/basedollar/cbeth/68469010491365517650601323854262902343759121653681014133081846278487342428277",
    lwOnly: true,
    level: {
      asset: "cbETH",
      card: "liquidates-at",
      help: ["today's", "held across the life", "redemption and liquidation rows alone"],
    },
  },
  {
    id: "basedollar wsteth 1150 (closed)",
    path: "/base/basedollar/wsteth/115054813357214655434932038880034226794865662069657988027541148413367718171377",
    lwOnly: true,
    // Redeemed to no debt on 28 Sep 2026, closed the day after: the level
    // ends with the debt.
    level: { asset: "wstETH", endDay: 20724, help: ["redemption and liquidation rows alone"] },
  },
  {
    id: "polaris usdp 2420",
    path: "/sepolia/polaris/usdp/2420",
    lwOnly: true,
    // The first set inside the life; the set before it is in force at no row.
    changes: { day: 20704, name: "Primary rate", from: "", to: "4.37 %", block: 11660977 },
    level: { asset: "pETH", card: "polaris", help: ["debt × 115%", "defensive mode's 150% minimum is not drawn"] },
  },
  {
    id: "polaris usdp 3732 (liquidated)",
    path: "/sepolia/polaris/usdp/3732",
    lwOnly: true,
    level: { asset: "pETH", endDay: 20734, help: ["debt × 115%", "not drawn"] },
  },
  {
    id: "polaris goldp 18",
    path: "/sepolia/polaris/goldp/18",
    lwOnly: true,
    level: { asset: "pETH", card: "polaris", help: ["debt × 115%", "not drawn"] },
  },
  {
    id: "polaris goldp 29 (liquidated)",
    path: "/sepolia/polaris/goldp/29",
    lwOnly: true,
    level: { asset: "pETH", endDay: 20709, help: ["debt × 115%", "not drawn"] },
  },
  // f(x) (step 6): the debt ratio against the pool's liquidation ratio, its
  // rebalance ratio the dashed line short of it, both read at each day's
  // last event; the collateral's two levels.
  { id: "fx wsteth-249", path: "/ethereum/fx/wsteth-249", lwOnly: true, ratio: FX_RATIO },
  { id: "fx wbtc-78", path: "/ethereum/fx/wbtc-78", lwOnly: true, ratio: FX_RATIO },
  {
    id: "fx wsteth-110 (liquidated)",
    path: "/ethereum/fx/wsteth-110",
    lwOnly: true,
    ratio: { ...FX_RATIO, endDay: 20121 },
  },
  // LlamaLend (step 6, `band`, `checkBand`): the card's Health first, its
  // line at 0; the collateral's soft-liquidation band shaded on its price,
  // stepping at events, today the card's Bands; the tip's in-band words.
  {
    id: "llamalend 0xeb2c",
    path: "/ethereum/llamalend/0x100daa78fc509db39ef7d04de0c1abd299f4c6ce/0xeb2cafb6ea9def8084842558ad1242bbf7fcac2b",
    lwOnly: true,
    band: { asset: "wstETH" },
  },
  {
    id: "llamalend 0xa32e (in soft liquidation)",
    path: "/ethereum/llamalend/0x100daa78fc509db39ef7d04de0c1abd299f4c6ce/0xa32ea34ac816397e3312423f88229b24d1ae0d5d",
    lwOnly: true,
    band: { asset: "wstETH", place: "inside" },
  },
  {
    id: "llamalend 0xd76a (under its band, liquidatable)",
    path: "/ethereum/llamalend/0xeda215b7666936ded834f76f3fbc6f323295110a/0xd76aa47f1ad6ce7f78ddcd4643a85c87b7e7c047",
    lwOnly: true,
    band: { asset: "CRV", place: "below" },
  },
  {
    id: "llamalend 0x61db (liquidated)",
    path: "/ethereum/llamalend/0x100daa78fc509db39ef7d04de0c1abd299f4c6ce/0x61db9ae37238e7c090708aa67e808cdc61a0634b",
    lwOnly: true,
    band: { asset: "wstETH", closed: true },
  },
  {
    id: "llamalend 0xbbc5 (closed)",
    path: "/ethereum/llamalend/0x4e59541306910ad6dc1dac0ac9dfb29bd9f15c67/0xbbc52d0a3fe57144d0323adf5f76ca082d070bfe",
    lwOnly: true,
    band: { asset: "WBTC", closed: true },
  },
  // Alchemix V3 (steps 6 and 8, `ratio` and `alchemix`): the
  // collateralisation against the lower bound read at each picked event's
  // block, over the vault's share price per reading.
  // Ethereum eth-alusd/1142 (open, 61 line redemptions) and eth-aleth/726
  // (closed with its collateral 26 Oct 2026); Base base-alusdb/23 (open) and
  // base-alusdb/29 (closed with its collateral). No Alchemist position has
  // been liquidated on either chain.
  {
    id: "alchemix eth-alusd/1142",
    path: "/ethereum/alchemix/eth-alusd/1142",
    lwOnly: true,
    unit: "token",
    ratio: alchemixRatio(1, ALX_ETH_ALUSD),
    alchemix: true,
  },
  {
    id: "alchemix eth-aleth/726 (closed)",
    path: "/ethereum/alchemix/eth-aleth/726",
    lwOnly: true,
    ratio: alchemixRatio(1, ALX_ETH_ALETH),
    alchemix: { closed: true },
  },
  {
    id: "alchemix base-alusdb/23",
    path: "/base/alchemix/base-alusdb/23",
    lwOnly: true,
    unit: "token",
    ratio: alchemixRatio(8453, ALX_BASE_ALUSDB),
    alchemix: true,
  },
  {
    id: "alchemix base-alusdb/29 (closed)",
    path: "/base/alchemix/base-alusdb/29",
    lwOnly: true,
    ratio: alchemixRatio(8453, ALX_BASE_ALUSDB),
    alchemix: { closed: true },
  },
  // Step 7: Frankencoin's declared liquidation price alone, under a value
  // pane per side; Maple's pool rate.
  {
    id: "frankencoin 0xdc18",
    path: "/ethereum/frankencoin/0xdc189ac81bec4db551a0478334691d71109d9382",
    lwOnly: true,
    panes: "collateral,debt,price",
    family: { kind: "declared" },
    unit: "token",
    valueLine: /^the collateral in [\w.$-]+ and the debt in ZCHF, each on its own axis,$/,
  },
  {
    id: "frankencoin 0x4220 (price moved)",
    path: "/ethereum/frankencoin/0x422050f743582bf753b4d6bf571fa1808a9d70e6",
    lwOnly: true,
    panes: "collateral,debt,price",
    family: { kind: "declared", moved: true },
  },
  {
    id: "maple 0xc4ec",
    path: "/ethereum/maple/0xc4ec216635491a6d08cfe4537ed4dd767212d8c1",
    lwOnly: true,
    family: { kind: "pool" },
    unit: "token",
    valueLine: /^the pool claim's value in USDC$/,
  },
  {
    id: "pwn 0xb2d3 (liquidated)",
    path: "/ethereum/pwn/0xb2d3fc2bbda9a71c65b69ccf39d7052c26a90d13?loan=37",
    lwOnly: true,
    panes: "collateral,debt",
  },
  // Step 7: each vault kind's share price.
  {
    id: "aave sgho holder 0x1676",
    path: "/ethereum/aave/vaults/0xe1753f2e00940cc31213dd92013cf019dfe4ca1d/0x1676d23711186076fa74aa53511dda750a1f0d9a",
    lwOnly: true,
    unit: "token",
    valueLine: /^the claim's value in GHO$/,
    family: { kind: "vault" },
    changes: { day: 20697, name: "Target rate", from: "4.25 %", to: "4.50 %", block: 25883272 },
  },
  {
    id: "aave umbrella stkwaEthUSDC holder 0x5a2a",
    path: "/ethereum/aave/vaults/0x6bf183243fdd1e306ad2c4450bc7dcf6f0bf8aa6/0x5a2a98d3c9720734c2fca8d5ec808b073c047ccd",
    lwOnly: true,
    family: { kind: "vault" },
  },
  {
    id: "aave stata waEthUSDC holder 0xab67",
    path: "/ethereum/aave/vaults/0xd4fa2d31b7968e448877f69a96de69f5de8cd23e/0xab6752ad54f05fb40c7eccee4fb11a78a322e34b",
    lwOnly: true,
    family: { kind: "vault" },
  },
  {
    id: "yearn vault holder 0xb634",
    path: "/ethereum/yearn/vaults/0x310b7ea7475a0b449cfd73be81522f1b88efafaa/0xb634316e06cc0b358437cbadd4dc94f1d3a92b3b",
    lwOnly: true,
    family: { kind: "vault" },
  },
  {
    id: "morpho-base vault holder 0x3d88",
    path: "/base/morpho/vaults/0xbeefe94c8ad530842bfe7d8b397938ffc1cb83b2/0x3d8863a416f3091766bfea41d3d7008236a0dd1e",
    lwOnly: true,
    // The vault's first SetFee: created with no fee.
    changes: { day: 20614, name: "Performance fee", from: "0.00 %", to: "5.00 %", block: 47141158 },
    family: { kind: "vault" },
  },
  // A one-day life (one transaction on 11 Oct 2026, open): the price pane alone.
  {
    id: "liquity-v2 WETH Trove (one day)",
    path: "/ethereum/liquity-v2/trove/WETH/9356199087677269607208888455574125294289574299403525409279454994357184117603",
    lwOnly: true,
    priceOnly: true,
    panes: "price",
  },
  {
    id: "liquity-v2 WETH Trove",
    path: "/ethereum/liquity-v2/trove/WETH/102247037494986730506041632222868001124387697185626929998095238518734059870154",
    answer: "/api/liquity-v2/prices/daily",
    trove: "live",
    unit: "USD",
    panes: "value,price,pace",
    pace: "WETH",
  },
  {
    id: "liquity-v2 WETH Trove (redeemed)",
    path: "/ethereum/liquity-v2/trove/WETH/22412517865912344610666591322850826630726594253808037974356128721405243892759",
    answer: "/api/liquity-v2/prices/daily",
    trove: "redeemed",
    panes: "value,price,pace",
    pace: "WETH",
  },
  {
    id: "liquity-v2 rETH Trove (liquidated)",
    path: "/ethereum/liquity-v2/trove/rETH/19392756892012588507808147823032851071198051944268422940534038614966657095964",
    answer: "/api/liquity-v2/prices/daily",
    trove: "liquidated",
    panes: "value,price,pace",
    pace: "rETH",
  },
  {
    // Listed as closed and once drawn open, its axis to today (ui-jobs 328).
    id: "liquity-v2 WETH Trove (closed)",
    path: "/ethereum/liquity-v2/trove/WETH/82501486677343366959104920060744506403266161051192207755275552075653445398317",
    answer: "/api/liquity-v2/prices/daily",
    trove: "closed",
    panes: "value,price,pace",
    pace: "WETH",
  },
  {
    // Open since 9 May 2026, never redeemed, on a branch that was (ruling 11's pace lane).
    id: "liquity-v2 wstETH Trove (never redeemed)",
    path: "/ethereum/liquity-v2/trove/wstETH/36866364639024890689412217368623603118483270545575424157920590185252139913822",
    answer: "/api/liquity-v2/prices/daily",
    trove: "live",
    neverRedeemed: true,
    panes: "value,price,pace",
    pace: "wstETH",
  },
];

const only = process.env.FIXTURES ? new RegExp(process.env.FIXTURES) : null;

const DAY = 86_400;
/** A day in the panel's words ("26 Oct '26") as a UTC day number. */
const dayOfWord = (w) => {
  const m = /^(\d{1,2}) (\w{3}) '(\d{2})$/.exec(w.trim());
  if (!m) return null;
  return (
    Date.UTC(2000 + Number(m[3]), "JanFebMarAprMayJunJulAugSepOctNovDec".indexOf(m[2]) / 3, Number(m[1])) / 86_400_000
  );
};
/** The slider the price chart is read through: the price strip, or the one chart. */
const PRICE_STRIP = '[data-flow-strip-view="price"], [data-flow-strip-view="chart"]';

/** The price tip's words for a reader: its text (the level's mark carries
 *  "Liquidates at" / "Liquidates below" for a screen reader) and the picker's
 *  name, the series being drawn as a mark alone. */
function headingText(h) {
  const picker = h.querySelector("[data-price-picker]")?.getAttribute("aria-label") ?? "";
  return `${picker} ${h.textContent ?? ""}`;
}
const HEALTH = "Health factor";

/** The Aave family's health factor as its cards print it (hfLabelV3). */
function hfLabel(hf) {
  if (hf >= 100) return "∞";
  if (hf < 1) return (Math.floor(hf * 1e4 + 1e-9) / 1e4).toFixed(4);
  return hf < 1.1 ? hf.toFixed(4) : hf.toFixed(2);
}

/** The health view on an Aave V3 page (ruling 7): listed first and shown
 *  first; its line is 1; each point it draws rests on a block of one of the
 *  account's events; today's figure is the card's health factor; where the
 *  card states "Liquidates at", that asset's level today is the card's. */
async function checkHealth(page, tag, pg, listedAll) {
  check(`${tag}: the picker lists the health factor first`, listedAll[0] === HEALTH, listedAll.join(","));
  if ((await page.locator("[data-flows-combined] [data-flow-chart-engine=lw]").count()) > 0)
    await checkHealthDotted(page, tag);
  // The tip names its series by its mark: the picker's accessible name.
  const heading = await page.$eval("[data-price-heading]", headingText).catch(() => "");
  check(
    `${tag}: the chart opens on the health factor, its line at 1`,
    heading.includes(`${HEALTH}`) && /Liquidates below(, explain)?\s*1\b/.test(heading),
    heading,
  );
  const u = new URL(`${BASE}${pg.path}`);
  const wallet = u.pathname.split("/").pop();
  const tl = await hostFetch(
    `${BASE}${pg.timeline ?? `/api/aave-v3/timeline?wallet=${wallet}&market=${u.searchParams.get("market")}&limit=1000`}`,
  ).then((r) => r.json());
  const blocks = new Set((tl.events ?? []).map((e) => e.blockNumber));
  // A factor read at a protocol change's block (ui-jobs 328 step 8) is a
  // point's block too.
  for (const b of await page.$$eval("[data-flows-combined] [data-flow-change]", (ms) =>
    ms.flatMap((m) => (m.getAttribute("data-flow-change-blocks") ?? "").split(",").filter(Boolean).map(Number)),
  ))
    blocks.add(b);
  const sl = page.locator(PRICE_STRIP).first();
  await sl.focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(200);
  const max = Number(await sl.getAttribute("aria-valuemax"));
  const read = () =>
    page.$eval("[data-price-readout]", (e) => ({
      block: e.getAttribute("data-price-block"),
      text: e.textContent ?? "",
      none: e.hasAttribute("data-price-none"),
    }));
  const end = await read();
  // The card's health factor: the headline's figure.
  const cardText = await page.$eval('[data-card-head="health-factor"]', (h) => h.textContent ?? "").catch(() => "");
  const card = cardText.match(/\d+\.\d+/g)?.pop() ?? null;
  // The chart prints four places under 1.1; a card that prints two (Moonwell)
  // agrees at its places.
  const places = card?.split(".")[1]?.length ?? 0;
  if (card)
    check(
      `${tag}: today's health factor is the card's`,
      end.block === "" && (end.text.trim() === card || Number(end.text).toFixed(places) === card),
      `chart ${end.text} (block ${end.block}), card ${card}`,
    );
  // Where the card prints no health factor (Compound V3's and V2's state the
  // line's share), today's figure against the card's chain read.
  if (pg.hf && !card) {
    const body = await hostFetch(`${BASE}${pg.hf.url}`).then((r) => r.json());
    const row = pg.hf.market ? (body.positions ?? []).find((x) => x.market === pg.hf.market) : body;
    const want = row?.[pg.hf.field];
    const got = Number(end.text);
    check(
      `${tag}: today's health factor is the card's read (${pg.hf.field})`,
      end.block === "" && want > 0 && Math.abs(got - want) <= 0.005 * want + 0.006,
      `chart ${end.text} (block ${end.block}), read ${want}`,
    );
  }
  const bad = [];
  for (const target of [Math.floor(max / 2), Math.max(0, max - 1)]) {
    await page.keyboard.press("Home");
    for (let i = 0; i < Math.floor(target / 4); i++) await page.keyboard.press("PageUp");
    for (let i = 0; i < target % 4; i++) await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
    const r = await read();
    if (!r.none && r.block !== "" && !blocks.has(Number(r.block))) bad.push(`${r.block}`);
  }
  check(`${tag}: each health point rests on an event's or a change's block`, bad.length === 0, bad.join(","));
  const liq = await page
    .$eval('[data-panel-row="liquidates-at"] dd', (d) => d.textContent?.trim() ?? "")
    .catch(() => null);
  const liqSym = await page
    .$eval(
      '[data-panel-row="liquidates-at"] dd [data-token-symbol], [data-panel-row="liquidates-at"] dd img',
      (i) => i.getAttribute("data-token-symbol") ?? i.getAttribute("alt"),
    )
    .catch(() => null);
  if (liq && liqSym) {
    const picker = page.locator("button[data-price-picker]");
    await picker.click();
    await page.locator(`[role="listbox"] [data-price-asset="${liqSym}"]`).click();
    await sl.focus();
    await page.keyboard.press("End");
    await page.waitForTimeout(200);
    const v = await page.$eval("[data-liq-readout]", (e) => Number(e.getAttribute("data-liq-value"))).catch(() => null);
    // A level more than ten times under the day's price (a dust debt's) is
    // not drawn (ruling 15): then the chart has none where the card states one.
    const price = await page
      .$eval("[data-price-readout]", (e) => Number((e.textContent ?? "").replace(/[^\d.]/g, "")))
      .catch(() => null);
    const cardV = Number(
      liq
        .replace(/^[^$\d]*\$?/, "")
        .replace(/[^\d.KMB]/g, "")
        .replace(/K$/, "e3")
        .replace(/M$/, "e6"),
    );
    const dust = v == null && price != null && cardV > 0 && cardV < price / 10;
    check(
      `${tag}: ${liqSym}'s level today is the card's "Liquidates at"${dust ? " (a dust debt's: under a tenth of the price, not drawn)" : ""}`,
      dust || (v != null && liq.endsWith(formatLiquidationPrice(v))),
      `chart ${v} (${v != null ? formatLiquidationPrice(v) : "-"}), card ${liq}, price ${price}`,
    );
    await picker.click();
    await page.locator(`[role="listbox"] [data-price-asset="${HEALTH}"]`).click();
  }
}

/** The health view has landed: the heading's picker names it. */
async function waitForHealth(page, label = HEALTH) {
  await page
    .waitForFunction(
      (h) =>
        document.querySelector("[data-price-heading] [data-price-picker]")?.getAttribute("aria-label")?.includes(h),
      label,
      { timeout: 120000 },
    )
    .catch(() => {});
  await page.waitForTimeout(500);
}

/** The view in the card's terms (MakerDAO's collateral ratio against its
 *  minimum, Fluid's position ratio against its threshold; ui-jobs 328 step
 *  5): listed and shown first, its line on the card's side; on an open
 *  position today's ratio, line and level are the card's; Maker's line on
 *  the first day with a ratio is the ilk read's mat at that day's block,
 *  Fluid's the threshold in force there (`firstLine`, else today's) and
 *  steps where governance changed it (`steps`); no day is dotted; the
 *  how-to-read names the source. */
async function checkRatio(page, tag, pg) {
  const r = pg.ratio;
  const name = /^[A-Z]{2,}$/.test(r.label) ? r.label : r.label.toLowerCase();
  const pct = (t) => Number((t ?? "").match(/(\d+(?:\.\d+)?)%/)?.[1] ?? NaN);
  const picker = page.locator("button[data-price-picker]");
  await picker.click();
  await page.waitForSelector('[role="listbox"] [data-price-asset]', { timeout: 5000 }).catch(() => {});
  const listed = await page.$$eval("[data-price-asset]", (bs) => bs.map((b) => b.dataset.priceAsset));
  await page.keyboard.press("Escape");
  check(`${tag}: the picker lists the ${name} first`, listed[0] === r.label, listed.join(","));
  const heading = await page.$eval("[data-price-heading]", headingText).catch(() => "");
  check(`${tag}: the chart opens on the ${name}`, heading.includes(r.label), heading);
  const toggle = page.locator("[data-flow-level-toggle]");
  if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();
  await page.waitForTimeout(150);
  const sl = page.locator(PRICE_STRIP).first();
  const tipNow = () =>
    page.$eval("[data-price-heading]", (h) => {
      const ro = h.querySelector("[data-price-readout]");
      const lv = h.querySelector("[data-liq-readout]");
      const wv = h.querySelector("[data-warn-readout]");
      return {
        text: ro?.textContent ?? "",
        none: ro?.hasAttribute("data-price-none") ?? true,
        block: ro?.getAttribute("data-price-block") ?? "",
        price: Number((ro?.textContent ?? "").replace(/[^\d.]/g, "")),
        line: lv ? Number(lv.getAttribute("data-liq-value")) : null,
        warn: wv ? Number(wv.getAttribute("data-warn-value")) : null,
      };
    });
  const readAt = async (key) => {
    await sl.focus();
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
    return tipNow();
  };
  const end = await readAt("End");
  const head = r.headRow
    ? await page.$eval(`[data-panel-row="${r.headRow}"] dd`, (d) => d.textContent ?? "").catch(() => null)
    : await page.$eval(`[data-card-head="${r.head}"]`, (h) => h.textContent ?? "").catch(() => null);
  // A closed Alchemist position's row reads "No debt".
  const open = head != null && (!r.headRow || /%/.test(head));
  if (open) {
    check(
      `${tag}: today's ${name} is the card's`,
      end.block === "" && !end.none && pct(end.text) === pct(head),
      `chart ${end.text}, card ${head}`,
    );
    const lineCard = await page.$eval(`[data-panel-row="${r.lineRow}"] dd`, (d) => d.textContent ?? "").catch(() => "");
    const cardLine = r.linePattern ? Number(lineCard.match(r.linePattern)?.[1] ?? NaN) : pct(lineCard);
    check(
      `${tag}: today's line is the card's ${r.lineRow.replace(/-/g, " ")}`,
      end.line != null && Math.abs(end.line * 100 - cardLine) < 0.05,
      `chart ${end.line}, card ${lineCard}`,
    );
    if (r.warnRow) {
      const warnCard = await page
        .$eval(`[data-panel-row="${r.warnRow}"] dd`, (d) => d.textContent ?? "")
        .catch(() => "");
      check(
        `${tag}: today's second line is the card's ${r.warnRow.replace(/-/g, " ")}`,
        end.warn != null && Math.abs(end.warn * 100 - pct(warnCard)) < 0.05,
        `chart ${end.warn}, card ${warnCard}`,
      );
    }
  }
  // The first day with a ratio (a life can open on a deposit alone).
  let first = await readAt("Home");
  for (let i = 0; first.none && i < (r.firstWithin ?? 40); i++) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(120);
    first = await tipNow();
  }
  check(`${tag}: the ${name} draws from its first days`, !first.none, JSON.stringify(first));
  const words = `Liquidates ${r.liquidates}`;
  const tip = await page.$eval("[data-price-heading]", headingText).catch(() => "");
  check(`${tag}: the line is named "${words}"`, tip.includes(words), tip);
  if (r.warnVerb) {
    const warnWords = `${r.warnVerb} ${r.liquidates}`;
    check(`${tag}: the second line is named "${warnWords}"`, tip.includes(warnWords), tip);
  }
  if (r.ilk && first.block) {
    const body = await hostFetch(`${BASE}/api/chain/makerdao/ilk-at?ilk=${r.ilk}&blocks=${first.block}`).then((x) =>
      x.json(),
    );
    const mat = body?.reads?.[first.block]?.mat;
    check(
      `${tag}: the first day's line is the ilk read's minimum ratio at block ${first.block}`,
      mat > 0 && first.line != null && Math.abs(first.line - mat) < 1e-9,
      `chart ${first.line}, ilk-at ${mat}`,
    );
  }
  if (r.atBlock && first.block) {
    const [url, valueOf] = r.atBlock(first.block);
    const body = await hostFetch(`${BASE}${url}`).then((x) => x.json());
    const want = valueOf(body);
    check(
      `${tag}: the first day's line is the at-block read's at block ${first.block}`,
      want > 0 && first.line != null && Math.abs(first.line - want) < 1e-9,
      `chart ${first.line}, read ${want}`,
    );
  }
  let fluid = null;
  if (r.fluid) {
    const body = await hostFetch(`${BASE}${r.fluid}`).then((x) => x.json());
    fluid = body?.position ?? body;
    const firstLine = r.firstLine ?? fluid?.liquidationThreshold;
    check(
      `${tag}: the line is the threshold in force on the first day (${firstLine}) and today's at the end`,
      fluid?.liquidationThreshold > 0 &&
        first.line === firstLine &&
        (!open || end.line == null || end.line === fluid.liquidationThreshold),
      `first ${first.line}, end ${end.line}, read ${fluid?.liquidationThreshold}`,
    );
  }
  if (r.steps) {
    // The line steps on the day governance changed the threshold: the day
    // before holds the value before, the day itself the value after.
    const pts = await page.$$eval("[data-liq-level]", (ls) =>
      ls.flatMap((l) => {
        const ds = (l.getAttribute("data-liq-days") ?? "").split(",").filter(Boolean).map(Number);
        const vs = (l.getAttribute("data-liq-values") ?? "").split(",").filter(Boolean).map(Number);
        return ds.map((d, i) => [d, vs[i]]);
      }),
    );
    const at = (d) => pts.find((p) => p[0] === d)?.[1];
    for (const [d, before, after] of r.steps)
      check(
        `${tag}: the line steps on day ${d}, ${before} → ${after}`,
        at(d - 1) === before && at(d) === after,
        `day before ${at(d - 1)}, day ${at(d)}`,
      );
  }
  const dotted = await page.$eval("[data-price-line]", (g) => ({
    key: g.getAttribute("data-price-line"),
    dotted: (g.getAttribute("data-price-dotted") ?? "").split(",").filter(Boolean).length,
    dottedDays: (g.getAttribute("data-price-dotted") ?? "").split(",").filter(Boolean).map(Number),
    observed: (g.getAttribute("data-price-observed") ?? "").split(",").filter(Boolean).map(Number),
  }));
  if (r.sparse) {
    // A day before the earliest read is dotted; every day from it is solid.
    const lastDotted = Math.max(-Infinity, ...dotted.dottedDays);
    check(
      `${tag}: only days before the earliest read are dotted`,
      dotted.key === "health" && dotted.observed.length > 0 && lastDotted <= Math.min(...dotted.observed),
      JSON.stringify({ dotted: dotted.dotted, lastDotted, firstObserved: Math.min(...dotted.observed) }),
    );
  } else if (r.held) {
    // A day with an event of the position's is solid; a day between events
    // keeps the last event's price, dotted.
    const carried = await page.$eval("[data-price-line]", (g) =>
      (g.getAttribute("data-price-carried") ?? "").split(",").filter(Boolean).map(Number),
    );
    const span = dotted.observed.length + carried.length;
    check(
      `${tag}: the ${name} is solid on days with events, dotted between`,
      dotted.key === "health" && dotted.observed.length > 0 && (span <= dotted.observed.length || dotted.dotted > 0),
      JSON.stringify({ ...dotted, observed: dotted.observed.length, carried: carried.length }),
    );
  } else
    check(
      `${tag}: no day of the ${name} is drawn dotted`,
      dotted.key === "health" && dotted.dotted === 0,
      JSON.stringify(dotted),
    );
  if (r.endDay != null) {
    const days = await page.$$eval("[data-liq-level]", (ls) =>
      ls.flatMap((l) => (l.getAttribute("data-liq-days") ?? "").split(",").filter(Boolean).map(Number)),
    );
    check(
      `${tag}: the line ends the day before the position's last event left no debt`,
      days.length > 0 && Math.max(...days) === r.endDay,
      `last ${Math.max(...days)}, want ${r.endDay}`,
    );
  }
  // The collateral's level: drawn, and today the card's; none where the card
  // states no liquidation price (Dolomite).
  const coll = listed.find((x) => x !== r.label);
  if (r.noLevel) {
    if (coll) {
      await picker.click();
      await page.locator(`[role="listbox"] [data-price-asset="${coll}"]`).first().click();
      await page.waitForTimeout(250);
      const lv = await page.evaluate(() => ({
        toggle: document.querySelector("[data-flow-level-toggle]") != null,
        lines: document.querySelectorAll("[data-liq-level]").length,
      }));
      check(
        `${tag}: ${coll} draws no level (the card states no liquidation price)`,
        !lv.toggle && lv.lines === 0,
        JSON.stringify(lv),
      );
    }
  } else {
    await picker.click();
    await page.locator(`[role="listbox"] [data-price-asset="${coll}"]`).first().click();
    const lv = await readAt("End");
    const days = await page.$$eval("[data-liq-level]", (ls) =>
      ls.reduce((n, l) => n + (l.getAttribute("data-liq-days") ?? "").split(",").filter(Boolean).length, 0),
    );
    check(`${tag}: ${coll} draws its level`, days > 0, `${days} days`);
    if (open && r.levelRow) {
      const liq = await page
        .$eval(`[data-panel-row="${r.levelRow}"] dd`, (d) => d.textContent?.trim() ?? "")
        .catch(() => "");
      check(
        `${tag}: ${coll}'s level today is the card's "Liquidates at"`,
        lv.line != null && liq.includes(formatLiquidationPrice(lv.line)),
        `chart ${lv.line}, card ${liq}`,
      );
    }
    if (open && r.warnLevelRow) {
      const at = await page
        .$eval(`[data-panel-row="${r.warnLevelRow}"] dd`, (d) => d.textContent?.trim() ?? "")
        .catch(() => "");
      check(
        `${tag}: ${coll}'s second level today is the card's "${r.warnLevelRow.replace(/-/g, " ")}"`,
        lv.warn != null && at.includes(formatLiquidationPrice(lv.warn)),
        `chart ${lv.warn}, card ${at}`,
      );
    }
    if (open && r.dropRow) {
      const drop = await page.$eval(`[data-panel-row="${r.dropRow}"] dd`, (d) => d.textContent ?? "").catch(() => "");
      const share = pct(drop) / 100;
      check(
        `${tag}: ${coll}'s level today is the price the card's "Liquidates on a drop of" names`,
        lv.line != null && lv.price > 0 && Math.abs(1 - lv.line / lv.price - share) <= 0.006,
        `level ${lv.line}, price ${lv.price}, card ${drop}`,
      );
    }
    if (open && fluid?.liqPriceDebtPerCol > 0)
      check(
        `${tag}: ${coll}'s level today is the card's read (liqPriceDebtPerCol)`,
        lv.line != null && Math.abs(lv.line - fluid.liqPriceDebtPerCol) <= 0.005 * fluid.liqPriceDebtPerCol,
        `chart ${lv.line}, read ${fluid.liqPriceDebtPerCol}`,
      );
  }
  await picker.click();
  await page.locator(`[role="listbox"] [data-price-asset="${r.label}"]`).click();
  await page.waitForTimeout(250);
  await page.locator('[data-flow-help="F7.1"] button').click();
  const help = await page
    .locator('[role="dialog"][aria-label="How to read the events and charts"]')
    .textContent({ timeout: 5000 })
    .catch(() => "");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  check(
    `${tag}: the how-to-read names the ${name}'s source and line`,
    help.includes(`The ${name}`) &&
      r.help.every((w) => help.includes(w)) &&
      (r.helpNot ?? []).every((w) => !help.includes(w)),
    help,
  );
}

/** LlamaLend (ui-jobs 328 step 6): the chart opens on the card's Health, its
 *  line at 0, today's figure the card's; the collateral's band is drawn as
 *  runs that step only on days with events (or worked days), today's edges
 *  the card's Bands and the live read's pUp and pDown; at today the tip says
 *  where the price stands against the band; a closed life's band ends by its
 *  last event; the band's drawn rectangles sit where the time and price
 *  scales place its edges, at All, zoomed and panned; the how-to-read names
 *  the sources. */
async function checkBand(page, tag, pg, width) {
  const want = pg.band;
  const u = new URL(`${BASE}${pg.path}`);
  const [, , , controller, user] = u.pathname.split("/");
  const picker = page.locator("button[data-price-picker]");
  await picker.click();
  await page.waitForSelector('[role="listbox"] [data-price-asset]', { timeout: 5000 }).catch(() => {});
  const listed = await page.$$eval("[data-price-asset]", (bs) => bs.map((b) => b.dataset.priceAsset));
  await page.keyboard.press("Escape");
  check(
    `${tag}: the picker lists Health first, then ${want.asset}`,
    listed[0] === "Health" && listed.includes(want.asset),
    listed.join(","),
  );
  const sl = page.locator(PRICE_STRIP).first();
  const tip = () =>
    page.$eval("[data-price-heading]", (h) => {
      const ro = h.querySelector("[data-price-readout]");
      const bv = h.querySelector("[data-band-readout]");
      return {
        text: ro?.textContent ?? "",
        none: ro?.hasAttribute("data-price-none") ?? true,
        block: ro?.getAttribute("data-price-block") ?? "",
        day: Number(ro?.getAttribute("data-price-day")),
        price: Number((ro?.textContent ?? "").replace(/[^\d.]/g, "")),
        place: h.querySelector("[data-band-place]")?.getAttribute("data-band-place") ?? null,
        placeText: h.querySelector("[data-band-place]")?.textContent ?? "",
        hi: bv ? Number(bv.getAttribute("data-band-hi")) : null,
        lo: bv ? Number(bv.getAttribute("data-band-lo")) : null,
        bandBlock: bv?.getAttribute("data-band-block") ?? null,
        heading: h.textContent ?? "",
      };
    });
  const at = async (key) => {
    await sl.focus();
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
    return tip();
  };
  const pct = (t) =>
    Number(
      (t ?? "")
        .replace(/−/g, "-")
        .match(/-?\d+(?:\.\d+)?(?=%)/g)
        ?.pop() ?? NaN,
    );
  const toggle = page.locator("[data-flow-level-toggle]");
  if ((await toggle.getAttribute("aria-pressed").catch(() => null)) !== "true") await toggle.click().catch(() => {});
  await page.waitForTimeout(150);
  const end = await at("End");
  const headTip = await page.$eval("[data-price-heading]", headingText).catch(() => "");
  check(
    `${tag}: the chart opens on Health, its line "Liquidates below" at 0`,
    /Health/.test(headTip) && /Liquidates below(, explain)?\s*0\.00%/.test(headTip),
    headTip,
  );
  const live = await hostFetch(`${BASE}/api/chain/llamalend/position?controller=${controller}&user=${user}`)
    .then((r) => r.json())
    .catch(() => null);
  const card = await page.$eval('[data-card-head="health"]', (h) => h.textContent ?? "").catch(() => null);
  if (!want.closed) {
    check(
      `${tag}: today's health is the card's`,
      card != null && end.block === "" && !end.none && pct(end.text) === pct(card),
      `chart ${end.text}, card ${card}`,
    );
  } else check(`${tag}: a closed life's card states no health`, card == null, card ?? "");
  const tl = await hostFetch(`${BASE}/api/llamalend/timeline?controller=${controller}&user=${user}`)
    .then((r) => r.json())
    .catch(() => null);
  const events = (tl?.events ?? []).filter((e) => e.context?.data?.role !== "liquidator");
  const eventDays = new Set(events.map((e) => Math.floor(e.timestamp / 86_400)));
  const lastEventDay = Math.max(...eventDays);
  // The health rests on event blocks (or today's live read).
  const blocks = new Set(events.map((e) => String(e.blockNumber)));
  const mid = await at("Home");
  check(
    `${tag}: each health point read rests on an event's block`,
    mid.none || mid.block === "" || blocks.has(mid.block),
    mid.block,
  );

  // The collateral and its band.
  await picker.click();
  await page.locator(`[role="listbox"] [data-price-asset="${want.asset}"]`).first().click();
  await page.waitForTimeout(400);
  if ((await toggle.getAttribute("aria-pressed").catch(() => null)) !== "true") await toggle.click().catch(() => {});
  await page.waitForTimeout(150);
  const runs = await page.$$eval("[data-band-run]", (rs) =>
    rs.map((r) => ({
      from: Number(r.getAttribute("data-band-from")),
      to: Number(r.getAttribute("data-band-to")),
      hi: Number(r.getAttribute("data-band-hi")),
      lo: Number(r.getAttribute("data-band-lo")),
      est: r.hasAttribute("data-band-est"),
    })),
  );
  check(
    `${tag}: ${want.asset}'s band is drawn, its top over its bottom`,
    runs.length > 0 && runs.every((r) => r.hi > r.lo && r.lo > 0),
    `${runs.length} runs`,
  );
  const today = Math.floor(Date.now() / 86_400_000);
  const steps = runs.slice(1).filter((r, i) => !(want.closed ? false : r.from === today && i === runs.length - 2));
  const off = steps.filter((r) => !eventDays.has(r.from));
  check(
    `${tag}: the band steps only on days with events`,
    runs.length > 1 && off.length === 0,
    `${runs.length} runs; off ${off.map((r) => r.from).join(",")}`,
  );
  const last = runs.at(-1);
  if (want.closed)
    check(
      `${tag}: a closed life's band ends by its last event's day`,
      last != null && last.to <= lastEventDay,
      `ends ${last?.to}, last event ${lastEventDay}`,
    );
  const lv = await at("End");
  if (!want.closed) {
    const pUp = live?.pUp;
    const pDown = live?.pDown;
    check(
      `${tag}: today's band is the live read's pUp and pDown (the base price moves with each block)`,
      lv.bandBlock === "" && pUp > 0 && Math.abs(lv.hi - pUp) <= 1e-6 * pUp && Math.abs(lv.lo - pDown) <= 1e-6 * pDown,
      `chart ${lv.hi} → ${lv.lo} (block ${lv.bandBlock}), read ${pUp} → ${pDown}`,
    );
    const bandsRow = await page.$eval('[data-panel-row="bands"] dd', (d) => d.textContent ?? "").catch(() => "");
    const f = (v) => formatLiquidationPrice(v).replace("$", "");
    check(
      `${tag}: today's band is the card's Bands`,
      lv.hi != null && bandsRow.includes(`${f(lv.hi)} → ${f(lv.lo)}`),
      `chart ${lv.hi != null ? `${f(lv.hi)} → ${f(lv.lo)}` : "-"}, card ${bandsRow}`,
    );
    const place = lv.price < lv.lo ? "below" : lv.price <= lv.hi ? "inside" : null;
    check(
      `${tag}: the tip's band words at today (${want.place ?? "above the band: none"})`,
      lv.place === (want.place ?? null) &&
        place === lv.place &&
        (lv.place !== "inside" || /soft liquidation/.test(lv.placeText)),
      `place ${lv.place} "${lv.placeText}", price ${lv.price}, band ${lv.hi} → ${lv.lo}`,
    );
  }
  // The drawn rectangles against the scales' placing, at All, zoomed, panned.
  const drawnVsPlaced = () =>
    page.evaluate(() => {
      const box = document.querySelector("[data-flows-combined] [data-flow-lw-box]");
      const hook = document.querySelector("[data-flows-combined] [data-flow-band-drawn]");
      const drawn = (hook?.getAttribute("data-flow-band-drawn") ?? "")
        .split(",")
        .filter(Boolean)
        .map((t) => t.split(":").map(Number));
      const placed = box?.flowBandPlace ? box.flowBandPlace() : [];
      return { drawn, placed };
    });
  const agree = (d) => {
    if (d.drawn.length === 0) return false;
    return d.drawn.every(([day, x0, x1, yHi, yLo]) => {
      const p = d.placed.find((q) => q.day === day);
      return p && [x0 - p.x0, x1 - p.x1, yHi - p.yHi, yLo - p.yLo].every((v) => Math.abs(v) < 0.6);
    });
  };
  const sig = (d) => d.drawn.map((r) => r.join(":")).join(",");
  await page
    .locator('[data-flows-combined] [data-flow-range="All"]')
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(800);
  const all = await drawnVsPlaced();
  check(
    `${tag}: the band's drawn runs sit where the scales place its edges (All)`,
    agree(all),
    `${all.drawn.length} drawn`,
  );
  const ranges = await page.$$eval("[data-flows-combined] [data-flow-range]", (bs) =>
    bs.map((b) => b.getAttribute("data-flow-range")),
  );
  const zoom = ranges.find((r) => r !== "All");
  if (zoom) {
    await page.locator(`[data-flows-combined] [data-flow-range="${zoom}"]`).first().click();
    await page.waitForTimeout(900);
    const z = await drawnVsPlaced();
    check(
      `${tag}: zoomed to ${zoom}, the band moves with the scales`,
      agree(z) && sig(z) !== sig(all),
      `${z.drawn.length} drawn`,
    );
    if (width >= 640) {
      const box = page.locator("[data-flows-combined] [data-flow-lw-box]").first();
      await box.evaluate((el) => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 160));
      await page.waitForTimeout(300);
      const b = await box.boundingBox();
      await page.mouse.move(b.x + b.width * 0.5, b.y + Math.min(40, b.height / 3));
      for (let i = 0; i < 3; i++) {
        await page.mouse.wheel(-120, 0);
        await page.waitForTimeout(40);
      }
      await page.waitForTimeout(900);
      const pz = await drawnVsPlaced();
      check(
        `${tag}: panned, the band moves with the scales`,
        (pz.drawn.length === 0 || agree(pz)) && sig(pz) !== sig(z),
        `${pz.drawn.length} drawn`,
      );
    }
    await page.locator('[data-flows-combined] [data-flow-range="All"]').first().click();
    await page.waitForTimeout(600);
  }
  const help = await howToRead(page);
  check(
    `${tag}: the how-to-read names the band's and the price's sources`,
    help.includes("soft-liquidation band") && help.includes("Controller.user_prices") && help.includes("oracle price"),
    help,
  );
  await picker.click();
  await page.locator('[role="listbox"] [data-price-asset="Health"]').click();
  await page.waitForTimeout(250);
  const hHelp = await howToRead(page);
  check(
    `${tag}: the how-to-read names the health's source, its discount and oracle at each read`,
    hHelp.includes("The health") &&
      hHelp.includes("liquidation discount stored on the position") &&
      hHelp.includes("oracle price at that block"),
    hHelp,
  );
}

/** The how-to-read's text. */
async function howToRead(page) {
  await page.locator('[data-flow-help="F7.1"] button').click();
  const help = await page
    .locator('[role="dialog"][aria-label="How to read the events and charts"]')
    .textContent({ timeout: 5000 })
    .catch(() => "");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  return help;
}

/** The protocol's changes on the events row (ruling 10, ui-jobs 328 step 9):
 *  the source's change (`pg.changes`) has a marker on its day, placed where
 *  the chart places that day's close, at All, zoomed and panned; its tip
 *  (hover at 1280, a tap at 390) names it with its values before and after
 *  and its block, inside a receipt; no marker stands outside the life, nor
 *  on the `outside` day; Maker's every fee set in the life is marked as the
 *  ilk's rate log states it (`feeLog`); the "?" names the markers. */
async function checkChanges(page, tag, pg, width) {
  const want = pg.changes;
  const read = () =>
    page.evaluate(() => {
      const row = document.querySelector("[data-flows-combined] [data-flow-pips]");
      const w = document.querySelector("[data-flows-combined] [data-flow-chart-engine=lw]");
      return {
        life: (row?.getAttribute("data-flow-life") ?? "").split("-").map(Number),
        from: Number(w?.getAttribute("data-flow-lw-from")),
        to: Number(w?.getAttribute("data-flow-lw-to")),
        plotW: Number(w?.getAttribute("data-flow-lw-plot-w") || 0),
        cursorX: Number(w?.getAttribute("data-flow-lw-cursor-x") || NaN),
        markers: [...document.querySelectorAll("[data-flows-combined] [data-flow-change]")].map((m) => ({
          days: (m.getAttribute("data-flow-change-days") ?? "").split(",").map(Number),
          x: Number(m.getAttribute("data-flow-change-x")),
          label: m.querySelector("button")?.getAttribute("aria-label") ?? "",
        })),
      };
    });
  // Where the chart's equal-time axis places a day's close, within a cell.
  const placed = (st, m) => {
    const span = st.to - st.from;
    if (!(span > 0) || !(st.plotW > 0)) return false;
    const want = (((m.days[0] + 1) * DAY - st.from) / span) * st.plotW;
    const cell = Math.max(3, (st.plotW * 2 * DAY) / span);
    return Math.abs(m.x - want) <= cell;
  };
  const sig = (st) => st.markers.map((m) => `${m.days[0]}:${m.x}`).join(",");
  await page
    .locator('[data-flows-combined] [data-flow-range="All"]')
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(700);
  const all = await read();
  const m = all.markers.find((k) => k.days.includes(want.day));
  if (
    !check(
      `${tag}: a protocol-change marker stands on ${want.day} (${want.name})`,
      !!m,
      all.markers.length + " markers",
    )
  )
    return;
  check(
    `${tag}: every marker sits where the chart places its day's close (All)`,
    all.markers.length > 0 && all.markers.every((k) => placed(all, k)),
    all.markers
      .filter((k) => !placed(all, k))
      .slice(0, 3)
      .map((k) => `${k.days[0]}@${k.x}`)
      .join(" "),
  );
  const [lifeFrom, lifeTo] = all.life;
  const days = all.markers.flatMap((k) => k.days);
  check(
    `${tag}: no marker stands outside the life (${lifeFrom}–${lifeTo})`,
    lifeFrom > 0 && days.every((d) => d >= lifeFrom && d <= lifeTo),
    days.filter((d) => d < lifeFrom || d > lifeTo).join(","),
  );
  if (want.outside != null)
    check(`${tag}: the change on ${want.outside}, after the life, has no marker`, !days.includes(want.outside));
  if (want.feeLog) {
    const log = await hostFetch(`${BASE}/api/makerdao/ilks/${want.feeLog}/rate-log`).then((r) => r.json());
    const pct = (v) => `${v.toFixed(2)} %`;
    const inLife = log.sets
      .map((x, i) => ({ ...x, prev: log.sets[i - 1] }))
      .filter((x) => {
        const d = Math.floor(x.timestamp / DAY);
        return d >= lifeFrom && d <= lifeTo;
      });
    const labels = all.markers.map((k) => k.label).join(" | ");
    const missing = inLife.filter(
      (x) =>
        !labels.includes(
          `Stability fee ${x.prev ? pct(x.prev.aprPct) : ""}`.trim() +
            (x.prev ? ` → ${pct(x.aprPct)}` : ` set to ${pct(x.aprPct)}`),
        ),
    );
    check(
      `${tag}: each of the ${inLife.length} ${want.feeLog} fee sets in the life is marked as the rate log states it`,
      inLife.length > 0 && missing.length === 0,
      missing
        .slice(0, 3)
        .map((x) => x.block)
        .join(","),
    );
  }
  // The tip: the change's name, its values and its block, in a receipt.
  const btn = page.locator(`[data-flows-combined] [data-flow-change="${m.days[0]}"] button`).first();
  await btn.scrollIntoViewIfNeeded();
  if (width < 640) await btn.tap();
  else await btn.hover();
  await page.waitForTimeout(300);
  const items = await page.$$eval("[data-flows-combined] [data-flow-change-tip] [data-flow-change-item]", (els) =>
    els.map((e) => ({
      day: Number(e.closest("[data-flow-change-day]")?.getAttribute("data-flow-change-day")),
      name: e.getAttribute("data-flow-change-name"),
      from: e.getAttribute("data-flow-change-from"),
      to: e.getAttribute("data-flow-change-to"),
      block: Number(e.getAttribute("data-flow-change-block")),
      text: e.textContent ?? "",
      prov: !!e.querySelector("[data-prov-covered], [data-prov-inspect], [data-prov-pickable]"),
    })),
  );
  const it = items.find((i) => i.day === want.day && i.block === want.block && i.name === want.name);
  check(
    `${tag}: the marker's ${width < 640 ? "tap" : "hover"} names it, before → after: ${want.name} ${want.from || "set"} → ${want.to}`,
    !!it && it.name === want.name && it.from === want.from && it.to === want.to && it.text.includes(want.to),
    it ? JSON.stringify(it) : `${items.length} items`,
  );
  check(`${tag}: the change's figure stands in a receipt, at its block ${want.block}`, !!it?.prov);
  if (width < 640)
    await page.evaluate(() => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
  else await page.mouse.move(2, 2);
  await page.waitForTimeout(200);
  check(`${tag}: the tip closes`, (await page.locator("[data-flows-combined] [data-flow-change-tip]").count()) === 0);
  // Zoomed and panned, the markers move with the chart.
  const ranges = await page.$$eval("[data-flows-combined] [data-flow-range]", (bs) =>
    bs.map((b) => b.getAttribute("data-flow-range")),
  );
  const zoom = ranges.includes("1Y") ? "1Y" : ranges.find((r) => r !== "All");
  if (zoom) {
    await page.locator(`[data-flows-combined] [data-flow-range="${zoom}"]`).first().click();
    await page.waitForTimeout(900);
    const z = await read();
    const inWindow = z.markers.every((k) => k.x >= 0 && k.x <= z.plotW + 1);
    check(
      `${tag}: zoomed to ${zoom}, the markers move with the chart and stay in its window`,
      sig(z) !== sig(all) && inWindow && z.markers.every((k) => placed(z, k)),
      `${z.markers.length} markers`,
    );
    if (width >= 640) {
      const box = page.locator("[data-flows-combined] [data-flow-lw-box]").first();
      await box.evaluate((el) => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 160));
      await page.waitForTimeout(300);
      const b = await box.boundingBox();
      await page.mouse.move(b.x + b.width * 0.5, b.y + Math.min(40, b.height / 3));
      for (let i = 0; i < 3; i++) {
        await page.mouse.wheel(-120, 0);
        await page.waitForTimeout(40);
      }
      await page.waitForTimeout(900);
      const pz = await read();
      check(
        `${tag}: panned, the markers move with the chart`,
        pz.from !== z.from && (pz.markers.length === 0 || sig(pz) !== sig(z)) && pz.markers.every((k) => placed(pz, k)),
        `${pz.markers.length} markers, window ${z.from}→${pz.from}`,
      );
    }
    await page.locator('[data-flows-combined] [data-flow-range="All"]').first().click();
    await page.waitForTimeout(600);
  }
  const help = await howToRead(page);
  const named = /^[A-Z][^A-Z]*$/.test(want.name) ? want.name[0].toLowerCase() + want.name.slice(1) : want.name;
  check(
    `${tag}: the events' "?" names the markers and ${named}`,
    help.includes("The grey diamonds") && help.includes(named),
    help.slice(0, 400),
  );
}

/** A life no protocol change falls in (ui-jobs 328 step 8, `noChanges`):
 *  no marker on the row, and the how-to-read names no grey diamonds. */
async function checkNoChanges(page, tag) {
  const n = await page.locator("[data-flows-combined] [data-flow-change]").count();
  check(`${tag}: no protocol-change marker in a life with no change`, n === 0, `${n} markers`);
  const help = await howToRead(page);
  check(`${tag}: the how-to-read names no grey diamonds`, !help.includes("grey diamond"), help.slice(0, 200));
}

/** Liquity V1 (ui-jobs 328 step 5): Liquity V2's view, the ETH price with the
 *  Trove's level at 110 %. On an open Trove today's level is the card's
 *  "Liquidates at"; on a liquidated life the level ends on the liquidation's
 *  day; every level day is debt × 1.1 ÷ coll of a row, so it lies under the
 *  price where the Trove stood above 110 %; the how-to-read names Recovery
 *  Mode as not drawn. */
async function checkV1Level(page, tag, pg) {
  const toggle = page.locator("[data-flow-level-toggle]");
  if (!check(`${tag}: the ETH price draws the Trove's level`, (await toggle.count()) === 1)) return;
  if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();
  await page.waitForTimeout(150);
  const sl = page.locator(PRICE_STRIP).first();
  await sl.focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(250);
  const end = await page.$eval("[data-price-heading]", (h) => {
    const lv = h.querySelector("[data-liq-readout]");
    return {
      line: lv ? Number(lv.getAttribute("data-liq-value")) : null,
      asset: h.querySelector("[data-price-asset]")?.getAttribute("data-price-asset"),
    };
  });
  check(`${tag}: the price is ETH's`, end.asset === "ETH", end.asset);
  const days = await page.$$eval("[data-liq-level]", (ls) =>
    ls.flatMap((l) => (l.getAttribute("data-liq-days") ?? "").split(",").filter(Boolean).map(Number)),
  );
  check(`${tag}: the level is drawn`, days.length > 0, `${days.length} days`);
  if (pg.v1 === "open") {
    const card = await page.$eval('[data-panel-row="liquidates-at"] dd', (d) => d.textContent ?? "").catch(() => "");
    const m = card.replace(/,/g, "").match(/\$(\d+(?:\.\d+)?)(K?)/);
    const cardV = m ? Number(m[1]) * (m[2] ? 1000 : 1) : NaN;
    check(
      `${tag}: today's level is the card's "Liquidates at"`,
      end.line != null && Math.abs(end.line - cardV) <= (m?.[2] ? 50 : 0.006),
      `chart ${end.line}, card ${card}`,
    );
  } else {
    // The liquidation's day, from the listing's last activity of the life.
    const last = Math.max(...days);
    const ld = Math.floor(pg.liqTs / 86400);
    check(
      `${tag}: the level ends on the liquidation's day`,
      last === ld,
      `last level day ${last}, liquidation day ${ld}`,
    );
  }
  const help = await howToRead(page);
  check(
    `${tag}: the how-to-read names the 110% line and Recovery Mode as not drawn`,
    help.includes("debt × 110%") && help.includes("Recovery Mode") && help.includes("not drawn"),
    help,
  );
}

/** The forks and Polaris (ui-jobs 328 step 6): the collateral's price with
 *  the level debt × the minimum ÷ collateral. It opens on the collateral; on
 *  an open position today's level is the card's "Liquidates at" (a fork) or
 *  the card's price × 115 % ÷ its ratio (Polaris, whose card states no
 *  level); on a closed or liquidated one the level ends on that day; where
 *  Ebisu's minimum moved, the level steps by the two minimums' ratio on that
 *  day; the how-to-read names the minimum and what is not drawn. */
async function checkLevelView(page, tag, pg) {
  const want = pg.level;
  const toggle = page.locator("[data-flow-level-toggle]");
  if (!check(`${tag}: the ${want.asset} price draws the level`, (await toggle.count()) === 1)) return;
  if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();
  await page.waitForTimeout(150);
  const sl = page.locator(PRICE_STRIP).first();
  await sl.focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(250);
  const end = await page.$eval("[data-price-heading]", (h) => {
    const lv = h.querySelector("[data-liq-readout]");
    return {
      line: lv ? Number(lv.getAttribute("data-liq-value")) : null,
      price: Number((h.querySelector("[data-price-readout]")?.textContent ?? "").replace(/[^\d.]/g, "")),
      asset: h.querySelector("[data-price-asset]")?.getAttribute("data-price-asset"),
    };
  });
  check(`${tag}: it opens on the ${want.asset} price`, end.asset === want.asset, end.asset);
  const pts = await page.$$eval("[data-liq-level]", (ls) =>
    ls.flatMap((l) => {
      const v = (l.getAttribute("data-liq-values") ?? "").split(",");
      return (l.getAttribute("data-liq-days") ?? "")
        .split(",")
        .filter(Boolean)
        .map((d, i) => [Number(d), Number(v[i])]);
    }),
  );
  check(`${tag}: the level is drawn`, pts.length > 0, `${pts.length} days`);
  if (pts.length === 0) return;
  const days = pts.map((p) => p[0]);
  if (want.card === "liquidates-at") {
    const card = await page.$eval('[data-panel-row="liquidates-at"] dd', (d) => d.textContent ?? "").catch(() => "");
    const m = card.replace(/,/g, "").match(/\$(\d+(?:\.(\d+))?)(K?)/);
    const k = m?.[3] ? 1000 : 1;
    const cardV = m ? Number(m[1]) * k : NaN;
    // Half the card's last printed place.
    const tol = m ? (0.5 * k) / 10 ** (m[2]?.length ?? 0) + 1e-9 : 0;
    check(
      `${tag}: today's level is the card's "Liquidates at"`,
      end.line != null && Math.abs(end.line - cardV) <= tol,
      `chart ${end.line}, card ${card}`,
    );
  } else if (want.card === "polaris") {
    const ratio = await page.$eval('[data-figure="collateral-ratio"]', (d) => d.textContent ?? "").catch(() => "");
    const icr = Number(ratio.replace(/[,%\s≈]/g, "")) / 100;
    const worked = (end.price * 1.15) / icr;
    check(
      `${tag}: today's level is the card's price × 115% ÷ its ratio`,
      end.line != null && Math.abs(end.line - worked) / worked < 0.001,
      `chart ${end.line}, card ratio ${ratio} at ${end.price}: ${worked}`,
    );
  } else {
    check(
      `${tag}: the level ends on the close's day`,
      Math.max(...days) === want.endDay,
      `last ${Math.max(...days)}, want ${want.endDay}`,
    );
  }
  if (want.step) {
    const at = (d) => pts.find((p) => p[0] === d)?.[1];
    const a = at(want.step.day - 1);
    const b = at(want.step.day);
    check(
      `${tag}: the level steps where the minimum moved`,
      a != null && b != null && Math.abs(b / a - want.step.ratio) < 0.002,
      `${a} → ${b}, ${b / a} against ${want.step.ratio}`,
    );
  }
  const help = await howToRead(page);
  check(
    `${tag}: the how-to-read names the minimum`,
    want.help.every((w) => help.includes(w)),
    help,
  );
}

/** Sky Savings (ui-jobs 328 step 5, ruling 8): the share price, chi in USDS,
 *  in place of the sUSDS price; each completed day at its drip block; today
 *  (on an open position) the card's share price; no level; the how-to-read
 *  names chi and the drip. */
async function checkShareLine(page, tag) {
  const line = await page.$eval("[data-price-line]", (g) => ({
    key: g.getAttribute("data-price-line"),
    observed: (g.getAttribute("data-price-observed") ?? "").split(",").filter(Boolean).length,
  }));
  check(
    `${tag}: the chart draws the share price (chi)`,
    line.key === "sky-savings:chi" && line.observed > 0,
    JSON.stringify(line),
  );
  const sl = page.locator(PRICE_STRIP).first();
  await sl.focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(250);
  const end = await page.$eval("[data-price-heading]", (h) => ({
    text: h.querySelector("[data-price-readout]")?.textContent ?? "",
    block: h.querySelector("[data-price-readout]")?.getAttribute("data-price-block") ?? "",
    toggle: document.querySelector("[data-flow-level-toggle]") != null,
  }));
  check(`${tag}: the share price has no level`, !end.toggle, JSON.stringify(end));
  check(`${tag}: the share price rests on a block`, /^\d+$/.test(end.block), JSON.stringify(end));
  const card = await page.$eval('[data-panel-row="share-price"] dd', (d) => d.textContent ?? "").catch(() => "");
  const held = await page.$eval('[data-card-head="worth"]', (d) => d.textContent ?? "").catch(() => "");
  const chartV = end.text.match(/(\d+\.\d{6}) USDS/)?.[1];
  const cardV = card.match(/= (\d+\.\d{6}) USDS/)?.[1];
  if (!held.includes("nothing held"))
    check(
      `${tag}: today's share price is the card's`,
      chartV != null && chartV === cardV,
      `chart ${end.text}, card ${card}`,
    );
  else
    check(
      `${tag}: a closed position's share price stands at its close, under today's`,
      chartV != null && Number(chartV) <= Number(cardV),
      `chart ${end.text}, card ${card}`,
    );
  // A past day: chi at its day's drip block, in the receipt's words.
  await page.keyboard.press("Home");
  await page.waitForTimeout(250);
  const first = await page.$eval("[data-price-heading] [data-price-readout]", (r) => ({
    text: r.textContent ?? "",
    block: r.getAttribute("data-price-block") ?? "",
  }));
  check(
    `${tag}: the first day's share price is chi at a drip block`,
    /USDS/.test(first.text) && /^\d+$/.test(first.block),
    JSON.stringify(first),
  );
  const help = await howToRead(page);
  check(
    `${tag}: the how-to-read names the share price's source`,
    help.includes("The sUSDS share price") && help.includes("chi") && help.includes("drip"),
    help,
  );
}

/** Alchemix V3 (step 6): the vault's share price stands in the list beside
 *  the collateralisation, one point per day with a reading at that reading's
 *  block, drawn dotted between, today the card's "Share price" row to six
 *  places at the card's reading block; it carries the level; the bound line's
 *  receipt says it is today's, held across the life. */
async function checkAlchemixShare(page, tag, pg) {
  const picker = page.locator("button[data-price-picker]");
  const pick = async (asset) => {
    await picker.click();
    await page.locator(`[role="listbox"] [data-price-asset="${asset}"]`).first().click();
    await page.waitForTimeout(300);
  };
  await picker.click();
  await page.waitForSelector('[role="listbox"] [data-price-asset]', { timeout: 5000 }).catch(() => {});
  const listed = await page.$$eval("[data-price-asset]", (bs) => bs.map((b) => b.dataset.priceAsset));
  await page.keyboard.press("Escape");
  check(
    `${tag}: the list holds the collateralisation and the share price alone`,
    listed.length === 2 && listed[0] === "Collateralisation",
    listed.join(","),
  );
  // The bound line's words, on the collateralisation.
  const sl = page.locator(PRICE_STRIP).first();
  await sl.focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(250);
  const liqText = await page.$eval("[data-price-heading]", (h) => {
    const lv = h.querySelector("[data-liq-readout]");
    return lv?.closest("[data-prov]")?.getAttribute("data-prov-summary") ?? lv?.textContent ?? "";
  });
  const levelHelp = await howToRead(page);
  check(
    `${tag}: the bound line's words say it is the bound in force at each event`,
    /lower bound in force at each event/.test(levelHelp) &&
      /read at the block of each day's last event/.test(levelHelp),
    liqText || levelHelp.slice(0, 300),
  );
  await pick(listed[1]);
  const line = await page.$eval("[data-price-line]", (g) => ({
    key: g.getAttribute("data-price-line") ?? "",
    observed: (g.getAttribute("data-price-observed") ?? "").split(",").filter(Boolean).map(Number),
    carried: (g.getAttribute("data-price-carried") ?? "").split(",").filter(Boolean).length,
    dotted: (g.getAttribute("data-price-dotted") ?? "").split(",").filter(Boolean).length,
    dottedDays: (g.getAttribute("data-price-dotted") ?? "").split(",").filter(Boolean).map(Number),
    grain: g.getAttribute("data-price-grain"),
  }));
  check(
    `${tag}: the chart draws the vault's share price per reading, dotted between`,
    /^alchemix:[\w-]+:share-price$/.test(line.key) &&
      line.observed.length > 0 &&
      line.grain === "daily" &&
      (line.carried === 0 || line.dotted > 0),
    JSON.stringify({ ...line, observed: line.observed.length }),
  );
  await sl.focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(300);
  const end = await page.$eval("[data-price-heading]", (h) => {
    const r = h.querySelector("[data-price-readout]");
    return {
      text: r?.textContent ?? "",
      block: r?.getAttribute("data-price-block") ?? "",
      toggle: document.querySelector("[data-flow-level-toggle]") != null,
    };
  });
  const card = await page.$eval('[data-panel-row="share-price"] dd', (d) => d.textContent ?? "").catch(() => "");
  const cardV = card.match(/= (\d+\.\d{6}) /)?.[1];
  const chartV = end.text.match(/(\d+\.\d{6})/)?.[1];
  if (!pg.alchemix.closed) {
    const reading = await page
      .$eval("[data-card-notice] a, [data-position-card] a[href*='/block/']", (a) => a.textContent ?? "")
      .catch(() => "");
    check(
      `${tag}: today's share price is the card's (${cardV})`,
      chartV != null && chartV === cardV,
      `chart ${end.text}, card ${card}`,
    );
    check(
      `${tag}: today's share price rests on the card's reading block`,
      /^\d+$/.test(end.block) && (reading === "" || reading.replace(/,/g, "").includes(end.block)),
      `chart ${end.block}, card ${reading}`,
    );
    check(`${tag}: the share price carries the level`, end.toggle, JSON.stringify(end));
  } else check(`${tag}: a closed position's card states no share price`, cardV == null, card);
  const help = await howToRead(page);
  check(
    `${tag}: the how-to-read names the share price's source`,
    help.includes("convertToAssets") && help.includes("drawn dotted"),
    help.slice(0, 400),
  );
  await pick("Collateralisation");
}

/** The card's top-row figure as `fmtNative` prints it
 *  (components/shared/price-pill.tsx). */
const fmtNative = (v, unit) =>
  v < 1
    ? `${v.toFixed(4)} ${unit}`
    : v < 100
      ? `${v.toFixed(2)} ${unit}`
      : v < 10_000
        ? `${Math.round(v).toLocaleString("en-US")} ${unit}`
        : `${(v / 1000).toFixed(1)}K ${unit}`;

/** A family's line in place of an asset's price (step 7, `shareLine`): a
 *  vault's share price, Maple's pool rate, Frankencoin's declared liquidation
 *  price. The line is drawn with no level; stepping back from today over the
 *  days with events, each day's figure rests on a block (Frankencoin: the
 *  day's last MintingUpdate's price, the line stepping only where the rows
 *  moved it); today's is the card's; the how-to-read names the source. */
async function checkFamilyLine(page, tag, pg) {
  const kind = pg.family.kind;
  const KEY = {
    vault: /^vault:0x[0-9a-f]+:share-price$/,
    pool: /^maple:.+:pool-rate$/,
    declared: /^frankencoin:declared-price$/,
  };
  const line = await page.$eval("[data-price-line]", (g) => ({
    key: g.getAttribute("data-price-line") ?? "",
    observed: (g.getAttribute("data-price-observed") ?? "").split(",").filter(Boolean).map(Number),
    grain: g.getAttribute("data-price-grain"),
  }));
  check(
    `${tag}: the chart draws the ${kind === "vault" ? "share price" : kind === "pool" ? "pool rate" : "declared liquidation price"}`,
    KEY[kind].test(line.key) && line.observed.length > 0 && line.grain === (kind === "declared" ? "event" : "daily"),
    JSON.stringify({ ...line, observed: line.observed.length }),
  );
  const sl = page.locator(PRICE_STRIP).first();
  await sl.focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(300);
  const readout = () =>
    page.$eval("[data-price-heading]", (h) => {
      const r = h.querySelector("[data-price-readout]");
      return {
        text: r?.textContent ?? "",
        day: Number(r?.getAttribute("data-price-day") ?? NaN),
        block: r?.getAttribute("data-price-block") ?? "",
        carried: r?.getAttribute("data-price-carried") != null,
        none: r?.hasAttribute("data-price-none") ?? true,
        toggle: document.querySelector("[data-flow-level-toggle]") != null,
      };
    });
  const end = await readout();
  check(`${tag}: no level`, !end.toggle, JSON.stringify(end));
  const num = (t) => Number((t.match(/[\d,]+\.\d+/)?.[0] ?? "").replace(/,/g, ""));
  const v = num(end.text);
  const today = Math.floor(Date.now() / 86_400_000);
  const open = end.day >= today - 1 && line.observed.includes(end.day);
  if (kind === "vault") {
    const card = await page
      .$eval("[data-latest-prices] button .tabular-nums", (e) => e.textContent?.trim() ?? "")
      .catch(() => "");
    const unit = card.replace(/^[\d.,K]+\s*/, "");
    if (open)
      check(
        `${tag}: today's share price is the card's (${card}), read at the page's block`,
        card !== "" && fmtNative(v, unit) === card && /^\d+$/.test(end.block),
        `chart ${end.text} at ${end.block}, card ${card}`,
      );
  } else if (kind === "pool") {
    const pool = line.key.split(":")[1];
    const card = await page
      .$$eval(
        "[data-panel-row]",
        (rows, pool) => {
          const r = rows.find((e) => (e.getAttribute("data-panel-row") ?? "").toLowerCase() === `shares-${pool}`);
          return r?.textContent?.match(/@\s*(\d+\.\d{4})/)?.[1] ?? "";
        },
        pool,
      )
      .catch(() => "");
    if (open)
      check(
        `${tag}: today's pool rate is the card's exit rate (@ ${card})`,
        card !== "" && v.toFixed(4) === card,
        `chart ${end.text}, card @ ${card}`,
      );
  } else {
    const position = pg.path.split("/").pop();
    const chain = await hostFetch(`${BASE}/api/chain/frankencoin/position?position=${position}`)
      .then((r) => r.json())
      .catch(() => null);
    const live = chain?.liqPrice;
    if (open && live != null)
      check(
        `${tag}: today's declared price is the position's price() (${live})`,
        Math.abs(v - live) < 0.005,
        `chart ${end.text}, price() ${live}`,
      );
  }
  // Back over the days with events: each figure rests on a block.
  const PREV = 'button[aria-label="Previous event"]';
  const steps = [];
  for (let i = 0; i < 12; i++) {
    const prev = page.locator(PREV).first();
    if ((await prev.count()) === 0 || (await prev.isDisabled())) break;
    await prev.click();
    await page.waitForTimeout(250);
    const r = await readout();
    if (steps.length && steps[steps.length - 1].day === r.day) break;
    steps.push(r);
  }
  const bad = steps.filter((r) => r.none || r.carried || !/^\d+$/.test(r.block));
  check(
    `${tag}: each day with an event reads its figure at a block of that day (${steps.length} days)`,
    steps.length > 0 && bad.length === 0,
    bad.map((r) => `${r.day}: ${r.text} @${r.block}${r.carried ? " carried" : ""}`).join("; "),
  );
  if (kind === "declared") {
    // The rows: each day's last MintingUpdate price, and the days the owner moved it.
    const position = pg.path.split("/").pop();
    const tl = await hostFetch(`${BASE}/api/frankencoin/timeline?position=${position}`)
      .then((r) => r.json())
      .catch(() => null);
    const rows = (tl?.events ?? [])
      .map((e) => ({ day: Math.floor(e.timestamp / 86_400), block: e.blockNumber, c: e.context?.data ?? {} }))
      .filter((r) => r.c.liqPrice != null)
      .sort((a, b) => a.block - b.block);
    const dayEnd = new Map();
    for (const r of rows) dayEnd.set(r.day, Number(r.c.liqPrice));
    const off = steps.filter((r) => dayEnd.has(r.day) && Math.abs(num(r.text) - dayEnd.get(r.day)) > 0.005);
    check(
      `${tag}: each event day's declared price is its last MintingUpdate's`,
      steps.some((r) => dayEnd.has(r.day)) && off.length === 0,
      off.map((r) => `${r.day}: ${r.text} against ${dayEnd.get(r.day)}`).join("; "),
    );
    // The line steps only on a day a row moved the price.
    const moved = new Set(
      rows
        .filter((r) => r.c.liqPriceBefore != null && Number(r.c.liqPriceBefore) !== Number(r.c.liqPrice))
        .map((r) => r.day),
    );
    const ordered = [...steps].reverse();
    const stepsOff = ordered.filter((r, i) => i > 0 && num(r.text) !== num(ordered[i - 1].text) && !moved.has(r.day));
    check(
      `${tag}: the declared price steps only on a day a MintingUpdate moved it`,
      stepsOff.length === 0,
      stepsOff.map((r) => r.day).join(","),
    );
    if (pg.family.moved) {
      const adjusted = rows.filter((r) => r.c.eventType === "adjust_price" && moved.has(r.day)).map((r) => r.day);
      const stepped = ordered.filter((r, i) => i > 0 && num(r.text) !== num(ordered[i - 1].text)).map((r) => r.day);
      check(
        `${tag}: the declared price steps at the owner's adjust_price rows`,
        adjusted.length > 0 && adjusted.filter((d) => d > ordered[0].day).every((d) => stepped.includes(d)),
        `adjust_price ${adjusted.join(",")}, stepped ${stepped.join(",")}`,
      );
    }
  }
  const help = await howToRead(page);
  const words = {
    vault: ["share price", "convertToAssets", "drawn dotted"],
    pool: ["pool rate", "straight line", "exit rate"],
    declared: ["declared", "MintingUpdate", "no market price is drawn"],
  }[kind];
  check(
    `${tag}: the how-to-read names the source`,
    words.every((w) => help.includes(w)),
    help.slice(0, 400),
  );
}

/** The how-to-read's value-line sentence names the unit the value pane is
 *  drawn in (ui-jobs 328): USD where the page values in dollars, else the
 *  token or tokens the pane's figures are in. */
async function checkValueUnit(page, tag, pg) {
  const help = await howToRead(page);
  // A page with no collateral and debt names what its value line is
  // (`valueLine`: the holding's value in its unit, each side's in its token).
  if (pg.valueLine) {
    const line = help.match(/The value line\s*—\s*([^•]*?) at each day's close\./)?.[1] ?? "";
    check(
      `${tag}: the how-to-read's value line names what it draws (${line})`,
      pg.valueLine.test(line),
      line || help.slice(0, 300),
    );
    return;
  }
  const sentence = help.match(/The value line\s*—\s*collateral and debt in ([^.]*?) at each day/)?.[1] ?? "";
  if (pg.unit === "USD")
    check(`${tag}: the how-to-read's value line is in USD`, sentence === "USD", sentence || help.slice(0, 300));
  else
    check(
      `${tag}: the how-to-read's value line names the token unit (${sentence})`,
      sentence !== "" && sentence !== "USD" && /^[\w.$-]+( and [\w.$-]+)?$/.test(sentence),
      sentence || help.slice(0, 300),
    );
}

/** An asset picked from the health view's list draws its liquidation level
 *  (ruling 15): at least one listed asset has a level drawn on its chart. */
async function checkPickedLevel(page, tag, listedAll) {
  const picker = page.locator("button[data-price-picker]");
  const drawn = [];
  // A Comet's base is listed twice where the account has both supplied and
  // borrowed it (its supply and its debt): each listed entry is picked.
  for (const [sym, nth] of listedAll
    .map((x, i) => [x, listedAll.slice(0, i).filter((y) => y === x).length])
    .filter(([x]) => x !== HEALTH)) {
    await picker.click();
    await page.locator(`[role="listbox"] [data-price-asset="${sym}"]`).nth(nth).click();
    await page.waitForTimeout(250);
    const days = await page.$$eval("[data-liq-level]", (ls) =>
      ls.reduce((n, l) => n + (l.getAttribute("data-liq-days") ?? "").split(",").filter(Boolean).length, 0),
    );
    if (days > 0) drawn.push(`${sym} ${days}`);
  }
  check(`${tag}: an asset picked from the list draws its level`, drawn.length > 0, drawn.join(", ") || "none");
  await picker.click();
  await page.locator(`[role="listbox"] [data-price-asset="${HEALTH}"]`).click();
  await page.waitForTimeout(250);
}

/** The health checks on a page the price checks do not read (`lwOnly`): its
 *  tip's level toggle, the list, the health checks and a
 *  picked asset's level. */
async function checkHealthAlone(page, tag, pg) {
  await checkLevelToggle(page, tag);
  const picker = page.locator("button[data-price-picker]");
  let listedAll = [];
  if ((await picker.count()) > 0) {
    await picker.click();
    await page.waitForSelector('[role="listbox"] [data-price-asset]', { timeout: 5000 }).catch(() => {});
    listedAll = await page.$$eval("[data-price-asset]", (bs) => bs.map((b) => b.dataset.priceAsset));
    await page.keyboard.press("Escape");
  }
  await checkHealth(page, tag, pg, listedAll);
  if (!pg.noLevel) await checkPickedLevel(page, tag, listedAll);
  if (pg.v4Spoke) await checkV4Levels(page, tag, pg, listedAll);
  if (pg.basket) await checkBasketLevels(page, tag, pg, listedAll);
}

/** Moonwell, Compound V2 and V3: each collateral's level today is ruling 7's,
 *  the price at which the health factor reaches 1 with every other balance
 *  and price held, worked from the card's chain read (each entered market's
 *  collateral factor; each Comet collateral's liquidate factor). Compared as
 *  a share of the price, which is unit-free (a Comet quotes in its base unit).
 *  A level more than ten times from the price is not drawn. */
async function checkBasketLevels(page, tag, pg, listedAll) {
  const body = await hostFetch(`${BASE}${pg.basket.url}`).then((r) => r.json());
  const row = pg.basket.market ? (body.positions ?? []).find((x) => x.market === pg.basket.market) : body;
  const lines = [];
  if (pg.basket.kind === "ctoken") {
    for (const m of row?.markets ?? [])
      lines.push({
        symbol: m.symbol,
        coll: m.supplyUnderlying,
        debt: m.borrowUnderlying,
        price: m.priceUsd ?? 0,
        lt: m.entered ? (m.collateralFactor ?? 0) : 0,
      });
  } else if (row) {
    for (const c of row.collateral ?? [])
      lines.push({
        symbol: c.symbol,
        coll: Number(c.balanceRaw) / 10 ** c.decimals,
        debt: 0,
        price: c.price,
        lt: c.liquidateCollateralFactor,
      });
    lines.push({
      symbol: row.baseSymbol,
      coll: 0,
      debt: Number(row.borrowBalanceRaw) / 10 ** row.baseDecimals,
      price: row.basePrice,
      lt: 0,
    });
  }
  const w = lines.reduce((n, l) => n + l.coll * l.price * l.lt, 0);
  const debt = lines.reduce((n, l) => n + l.debt * l.price, 0);
  const want = new Map();
  for (const l of lines) {
    const cw = l.coll * l.lt;
    if (!(cw > 0) || !(l.price > 0)) continue;
    const share = (debt - l.debt * l.price - (w - cw * l.price)) / (cw - l.debt) / l.price;
    if (share > 0.1 && share < 10) want.set(l.symbol, share);
  }
  const picker = page.locator("button[data-price-picker]");
  const sl = page.locator(PRICE_STRIP).first();
  const got = [];
  const bad = [];
  for (const [sym, share] of want) {
    const listed = listedAll.find((x) => x.toLowerCase() === sym.toLowerCase());
    if (!listed) {
      bad.push(`${sym} not listed`);
      continue;
    }
    await picker.click();
    await page.locator(`[role="listbox"] [data-price-asset="${listed}"]`).first().click();
    await sl.focus();
    await page.keyboard.press("End");
    await page.waitForTimeout(250);
    const v = await page.$eval("[data-liq-readout]", (e) => Number(e.getAttribute("data-liq-value"))).catch(() => null);
    const price = await page
      .$eval("[data-price-readout]", (e) => Number((e.textContent ?? "").replace(/[^\d.]/g, "")))
      .catch(() => null);
    const s = v != null && price ? v / price : null;
    got.push(`${sym} ${s?.toFixed(4)} / ${share.toFixed(4)}`);
    if (s == null || Math.abs(s - share) > 0.015 * share) bad.push(sym);
  }
  check(
    `${tag}: each collateral's level today is ruling 7's from the card's read`,
    want.size > 0 && bad.length === 0,
    `${got.join(", ")}${bad.length ? `; off: ${bad.join(",")}` : ""}`,
  );
  await picker.click();
  await page.locator(`[role="listbox"] [data-price-asset="${HEALTH}"]`).click();
  await page.waitForTimeout(250);
}

/** Aave V4: each collateral's level today is its `assetLiqPrices` entry
 *  (lib/aave-v4/utils/position-calculation.ts), worked here from the spoke's
 *  state and the oracle now; with one collateral, its price ÷ the health
 *  factor. A level more than ten times from the price is not drawn. */
async function checkV4Levels(page, tag, pg, listedAll) {
  const wallet = pg.path.split("/").pop();
  const [pos, oracle] = await Promise.all([
    hostFetch(`${BASE}/api/chain/aave-v4/spoke-position?wallet=${wallet}&spoke=${pg.v4Spoke}`).then((r) => r.json()),
    hostFetch(`${BASE}/api/oracle/aave-v4`).then((r) => r.json()),
  ]);
  const supplies = [];
  let debt = 0;
  for (const r of pos.reserves ?? []) {
    const price = oracle.prices?.[r.address]?.usd;
    if (price == null) continue;
    const amt = (raw) => Number(raw) / 10 ** r.decimals;
    if (amt(r.supplyBalanceRaw) > 0)
      supplies.push({ symbol: r.symbol, amount: amt(r.supplyBalanceRaw), price, lt: r.isCollateral ? (r.lt ?? 0) : 0 });
    debt += amt(r.debtBalanceRaw) * price;
  }
  const weighted = supplies.reduce((n, x) => n + x.amount * x.price * x.lt, 0);
  const coll = supplies.filter((x) => x.lt > 0);
  const want = new Map();
  for (const x of coll) {
    const lv =
      coll.length === 1
        ? x.price / (weighted / debt)
        : (debt - (weighted - x.amount * x.price * x.lt)) / (x.amount * x.lt);
    if (lv > x.price / 10 && lv < x.price * 10) want.set(x.symbol, lv);
  }
  const picker = page.locator("button[data-price-picker]");
  const sl = page.locator(PRICE_STRIP).first();
  const got = [];
  const bad = [];
  for (const [sym, lv] of want) {
    if (!listedAll.includes(sym)) {
      bad.push(`${sym} not listed`);
      continue;
    }
    await picker.click();
    await page.locator(`[role="listbox"] [data-price-asset="${sym}"]`).click();
    await sl.focus();
    await page.keyboard.press("End");
    await page.waitForTimeout(250);
    const v = await page.$eval("[data-liq-readout]", (e) => Number(e.getAttribute("data-liq-value"))).catch(() => null);
    got.push(`${sym} ${v?.toFixed(4)} / ${lv.toFixed(4)}`);
    if (v == null || Math.abs(v - lv) > 0.01 * lv) bad.push(sym);
  }
  check(
    `${tag}: each collateral's level today is its assetLiqPrices entry`,
    want.size > 0 && bad.length === 0,
    `${got.join(", ")}${bad.length ? `; off: ${bad.join(",")}` : ""}`,
  );
  await picker.click();
  await page.locator(`[role="listbox"] [data-price-asset="${HEALTH}"]`).click();
  await page.waitForTimeout(250);
}

/** The price tip's level line: hidden until the triangle toggle is pressed,
 *  the chart's level line drawn either way. Leaves the level shown, for the
 *  readout checks that follow. */
async function checkLevelToggle(page, tag) {
  const toggle = page.locator("[data-flow-level-toggle]");
  if (!check(`${tag}: the price tip has the level toggle`, (await toggle.count()) === 1)) return;
  const state = () =>
    page.evaluate(() => ({
      pressed: document.querySelector("[data-flow-level-toggle]")?.getAttribute("aria-pressed"),
      readout: !!document.querySelector("[data-liq-readout]"),
      lines: document.querySelectorAll("[data-liq-level]").length,
    }));
  const off = await state();
  await toggle.click();
  await page.waitForTimeout(150);
  const on = await state();
  check(
    `${tag}: the level line is hidden until the toggle shows it; the chart's level line stays`,
    off.pressed === "false" &&
      !off.readout &&
      on.pressed === "true" &&
      on.readout &&
      off.lines > 0 &&
      on.lines === off.lines,
    `off ${JSON.stringify(off)}, on ${JSON.stringify(on)}`,
  );
}

/** The date tip's chevron: opens the day's events in a list of one height,
 *  which stays open while the steps move the cursor. */
async function checkEventsToggle(page, tag) {
  const toggle = page.locator("[data-flow-events-toggle]");
  if (!check(`${tag}: the date tip has the events chevron`, (await toggle.count()) === 1)) return;
  const state = () =>
    page.evaluate(() => {
      const list = document.querySelector("[data-flow-pip-tip]");
      return {
        expanded: document.querySelector("[data-flow-events-toggle]")?.getAttribute("aria-expanded"),
        h: list ? Math.round(list.getBoundingClientRect().height) : null,
        items: list ? list.querySelectorAll("li").length : null,
        none: !!list?.querySelector("[data-flow-pip-none]"),
      };
    });
  const closed = await state();
  await toggle.click();
  await page.waitForTimeout(150);
  const seen = [await state()];
  await page.locator("[data-flow-jump=start]").click();
  for (let i = 0; i < 4; i++) {
    await page.locator('[aria-label="Next event"]').click();
    await page.waitForTimeout(100);
    seen.push(await state());
  }
  const heights = new Set(seen.map((s) => s.h));
  check(
    `${tag}: the chevron opens the day's events at one height, open while stepping`,
    closed.expanded === "false" &&
      closed.h == null &&
      seen.every((s) => s.expanded === "true" && s.h > 0 && (s.items > 0 || s.none)) &&
      heights.size === 1 &&
      seen.some((s) => s.items > 0),
    seen.map((s) => `${s.items ?? "-"}${s.none ? " none" : ""} @${s.h}px`).join(", "),
  );
  await page.locator("[data-flow-jump=end]").click();
  await toggle.click();
  await page.waitForTimeout(100);
}

/** The Trove's rows, every page of them, as the page reads them. */
async function troveRows(path) {
  const [, , , , ct, id] = path.split("/");
  const rows = [];
  for (let offset = 0; offset <= 10_000; offset += 1000) {
    const body = await hostFetch(`${BASE}/api/trove/${ct}/${id}/timeline?limit=1000&offset=${offset}`).then((r) =>
      r.json(),
    );
    for (const e of body.events ?? []) {
      const c = e.context?.data;
      if (!c) continue;
      rows.push({
        id: e.id,
        block: e.blockNumber,
        ts: e.timestamp,
        logIndex: Number(String(e.id).split("_").pop()) || 0,
        price: c.collateralPrice > 0 ? c.collateralPrice : null,
        redemption: c.operation === "redeemCollateral",
        redemptionPrice: c.redemption?.redemptionPrice > 0 ? c.redemption.redemptionPrice : null,
        holds: c.stateAfter ? c.stateAfter.coll > 0 && c.stateAfter.debt > 0 : null,
        liquidation: c.operation === "liquidate",
      });
    }
    if (!body.pagination?.hasMore) break;
  }
  // Duplicated rows (a page boundary) once each, in the replay's order.
  const seen = new Set();
  return rows
    .filter((r) => {
      const k = r.id;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.ts - b.ts || a.block - b.block || a.logIndex - b.logIndex);
}

/** The block the level on `day` rests on: the last row by the day's end,
 *  where it holds collateral and debt (a row stating no after-state keeps the
 *  last state); on the day a row leaves nothing, the last row that held both;
 *  null where there is no level. */
function levelBlockOn(rows, day, nowS) {
  const end = Math.min((day + 1) * DAY, nowS);
  let held = false;
  let block = null;
  let lastHold = null;
  let dropDay = null;
  for (const r of rows) {
    if (r.ts > end) break;
    if (r.holds === false) {
      if (held) dropDay = Math.floor(r.ts / DAY);
      held = false;
    } else if (r.holds === true || held) {
      held = true;
      block = r.block;
      lastHold = r.block;
    }
  }
  return held ? block : dropDay === day ? lastHold : null;
}

/** The card's liquidation price format (lib/utils/liquidation-utils.ts). */
function formatLiquidationPrice(p) {
  if (p < 0.01) return "< $0.01";
  if (p < 1) return "$" + p.toFixed(3);
  if (p < 100) return "$" + p.toFixed(2);
  if (p < 1_000) return "$" + p.toFixed(0);
  if (p < 1_000_000) return "$" + (p / 1000).toFixed(p < 10_000 ? 2 : 1) + "K";
  return "$" + (p / 1_000_000).toFixed(2) + "M";
}

const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

let checked = 0;
let failures = 0;
function check(name, ok, detail = "") {
  checked += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

/** Per asset symbol, the answer's observations by day: [price, block]. */
function answerSeries(kind, body, collSymbol) {
  const out = new Map();
  if (kind.endsWith("/flows")) {
    const held = new Set();
    for (const d of body.days ?? []) for (const b of d[4] ?? []) held.add(b[1]);
    for (const [addr, p] of Object.entries(body.prices ?? {})) {
      if (!held.has(addr)) continue;
      const sym = body.assets?.[addr]?.symbol ?? addr;
      out.set(sym, new Map((p.obs ?? []).filter((o) => o[1] > 0).map((o) => [o[0], [o[1], o[2] ?? null]])));
    }
  } else {
    out.set(collSymbol, new Map((body.obs ?? []).filter((o) => o[1] > 0).map((o) => [o[0], [o[1], o[2] ?? null]])));
  }
  return out;
}

/** No marks on the price line, and the level's days against the Trove's rows. */
async function checkTroveMarks(page, tag, pg, rows) {
  const marks = await page.$$eval("[data-price-event], [data-redemption-mark]", (cs) => cs.length);
  check(`${tag}: the price line carries no event or redemption marks`, marks === 0, `${marks} marks`);
  const levelDays = await page.$$eval("[data-liq-level]", (ps) =>
    ps.flatMap((p) => (p.dataset.liqDays ?? "").split(",").filter(Boolean).map(Number)),
  );
  const nowS = Date.now() / 1000;
  const lacking = levelDays.filter((d) => levelBlockOn(rows, d, nowS) == null);
  const liq = rows.find((r) => r.liquidation);
  const after = liq ? levelDays.filter((d) => d > Math.floor(liq.ts / DAY)) : [];
  check(
    `${tag}: the liquidation level draws no day the Trove's life lacks`,
    levelDays.length > 0 && lacking.length === 0 && after.length === 0,
    `${levelDays.length} days; without a holding row ${lacking.slice(0, 3)}; after the liquidation ${after.slice(0, 3)}`,
  );
  if (pg.trove === "liquidated")
    check(
      `${tag}: the level ends on the liquidation's day`,
      liq != null && Math.max(...levelDays) === Math.floor(liq.ts / DAY),
      `last ${Math.max(...levelDays)}, liquidation ${liq ? Math.floor(liq.ts / DAY) : "none"}`,
    );
}

/** The pace lane (ruling 11, Liquity V2's branch redemptions): the days the
 *  chart holds are the route's over the life, from the first row's day to the
 *  close or today; each of the Trove's redemption days has the branch's
 *  redemptions, at least as many as the Trove's; the bars drawn are the days
 *  with BOLD redeemed and the tallest is the window's largest day; the tip
 *  reads each stop's day as the route answers it, zero on a day it lists
 *  none; the how-to-read says the series is branch-wide. */
async function checkPace(page, tag, pg, rows, width) {
  const t = `${tag} pace`;
  const hook = await page.evaluate(() => {
    const e = document.querySelector("[data-flow-pace]");
    return e
      ? {
          label: e.getAttribute("data-flow-pace"),
          from: Number(e.getAttribute("data-pace-from")),
          to: Number(e.getAttribute("data-pace-to")),
          max: Number(e.getAttribute("data-pace-max")),
          days: (e.getAttribute("data-pace-days") ?? "")
            .split(",")
            .filter(Boolean)
            .map((x) => x.split(":").map(Number)),
          drawn: (e.getAttribute("data-flow-pace-drawn") ?? "")
            .split(",")
            .filter(Boolean)
            .map((x) => x.split(":").map(Number)),
        }
      : null;
  });
  if (!check(`${t}: the lane stands under the price pane`, hook != null)) return;
  const today = Math.floor(Date.now() / 86_400_000);
  const first = Math.floor(rows[0].ts / DAY);
  const last = pg.trove === "redeemed" || pg.trove === "live" ? today : Math.floor(rows[rows.length - 1].ts / DAY);
  check(
    `${t}: the range read is the life, ${first} to ${last}, and the lane names the ${pg.pace} branch`,
    hook.from === first && hook.to === last && hook.label.startsWith(`${pg.pace} branch`),
    `${hook.from}–${hook.to} "${hook.label}"`,
  );
  const iso = (d) => new Date(d * 86_400_000).toISOString().slice(0, 10);
  const answer = await hostFetch(
    `${BASE}/api/liquity-v2/redemption-pace?branch=${pg.pace}&from=${iso(hook.from)}&to=${iso(hook.to)}`,
  ).then((r) => r.json());
  const want = new Map(
    (answer.days ?? []).map((d) => [Date.parse(`${d.day}T00:00:00Z`) / 86_400_000, { bold: d.bold, count: d.count }]),
  );
  const held = new Map(hook.days.map(([d, a, c]) => [d, { bold: a, count: c }]));
  const off = [...want].filter(([d, w]) => {
    const h = held.get(d);
    return !h || Math.abs(h.bold - w.bold) > 1e-6 || h.count !== w.count;
  });
  const extra = [...held.keys()].filter((d) => !want.has(d));
  check(
    `${t}: the lane holds the route's days, BOLD and counts, nothing else`,
    off.length === 0 && extra.length === 0 && held.size === want.size,
    `${held.size} held, ${want.size} answered; off ${off.slice(0, 3).map((x) => x[0])}; extra ${extra.slice(0, 3)}`,
  );
  const own = new Map();
  for (const r of rows) if (r.redemption) own.set(Math.floor(r.ts / DAY), (own.get(Math.floor(r.ts / DAY)) ?? 0) + 1);
  const short = [...own].filter(([d, n]) => (want.get(d)?.count ?? 0) < n);
  check(
    `${t}: each of the Trove's ${own.size} redemption days has at least its redemptions on the branch`,
    short.length === 0,
    short
      .slice(0, 3)
      .map(([d, n]) => `${d}: Trove ${n}, branch ${want.get(d)?.count ?? 0}`)
      .join("; "),
  );
  if (pg.neverRedeemed || pg.trove === "closed")
    check(`${t}: the Trove was never redeemed`, own.size === 0, `${own.size}`);
  // At All, the drawn bars are the days with BOLD, the tallest the largest.
  const positive = [...held].filter(([, h]) => h.bold > 0);
  const drawnDays = new Set(hook.drawn.map((b) => b[0]));
  const notHeld = [...drawnDays].filter((d) => !(held.get(d)?.bold > 0));
  const tallest = hook.drawn.reduce((a, b) => (a == null || b[3] < a[3] ? b : a), null);
  const maxDay = positive.reduce((a, b) => (a == null || b[1].bold > a[1].bold ? b : a), null);
  check(
    `${t}: the bars drawn are the days with BOLD redeemed, the tallest the life's largest (${maxDay ? maxDay[1].bold.toFixed(0) : 0})`,
    notHeld.length === 0 &&
      drawnDays.size === positive.length &&
      (positive.length === 0 || (tallest && Math.abs(held.get(tallest[0]).bold - maxDay[1].bold) < 1e-6)) &&
      Math.abs(hook.max - (maxDay ? maxDay[1].bold : 0)) < 1e-6,
    `${drawnDays.size} drawn, ${positive.length} with BOLD; not held ${notHeld.slice(0, 3)}`,
  );
  // The tip, stop by stop (every stop at 1280, every seventh at 390).
  const sl = page.locator(PRICE_STRIP).first();
  await sl.focus();
  await page.keyboard.press("Home");
  const max = Number(await sl.getAttribute("aria-valuemax"));
  const read = [];
  for (let i = 0; i <= max; i++) {
    if (i > 0) await page.keyboard.press("ArrowRight");
    if (width < 640 && i % 7 !== 0 && i !== max) continue;
    await page.waitForTimeout(30);
    const r = await page
      .$eval("[data-pace-readout]", (e) => ({
        day: Number(e.getAttribute("data-pace-day")),
        bold: Number(e.getAttribute("data-pace-amount")),
        count: Number(e.getAttribute("data-pace-count")),
        text: e.textContent ?? "",
        prov: !!e.querySelector("[data-prov-covered], [data-prov-inspect], [data-prov-pickable]"),
      }))
      .catch(() => null);
    read.push(r);
  }
  const wrong = read.filter((r) => {
    if (!r) return true;
    const w = want.get(r.day) ?? { bold: 0, count: 0 };
    const words =
      w.count === 0
        ? r.text.includes("0 BOLD") && r.text.includes("no redemptions")
        : r.text.includes(`${Math.round(w.bold).toLocaleString("en-US")} BOLD`) &&
          r.text.includes(`${w.count.toLocaleString("en-US")} redemption`);
    return Math.abs(r.bold - w.bold) > 1e-6 || r.count !== w.count || !words;
  });
  const zeros = read.filter((r) => r && r.count === 0).length;
  const busy = read.filter((r) => r && r.count > 0).length;
  check(
    `${t}: the tip reads the route's day at ${read.length} stops (${busy} with redemptions, ${zeros} at zero)`,
    read.length > 0 && wrong.length === 0 && (want.size === 0 || busy > 0),
    wrong
      .slice(0, 3)
      .map((r) => (r ? `${r.day}: ${r.text}` : "no readout"))
      .join("; "),
  );
  if (BASE.includes("localhost"))
    check(
      `${t}: the tip's figure is inside a <Prov>`,
      read.every((r) => r?.prov),
    );
  await page.keyboard.press("End");
  await page.locator('[data-flow-help="F7.1"] button').click();
  const help = await page
    .locator('[role="dialog"][aria-label="How to read the events and charts"]')
    .textContent({ timeout: 5000 })
    .catch(() => "");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  check(
    `${t}: the how-to-read says the bars are the ${pg.pace} branch's, every Trove on it`,
    help.includes("The orange bars") &&
      help.includes(`on the ${pg.pace} branch each day, every Trove on the branch, this one included`),
    help.slice(0, 200),
  );
}

/** The level's line of the readout at a stop: its <Prov> blocks. */
async function checkLevelReadout(page, tag, now, r, rows) {
  const lv = await page
    .$eval("[data-liq-readout]", (e) => ({
      day: e.getAttribute("data-liq-day"),
      block: e.getAttribute("data-liq-block"),
      runwayBlock: e.getAttribute("data-runway-block"),
      redeemedBlock: e.getAttribute("data-redeemed-block"),
      redeemedPrice: e.getAttribute("data-redeemed-price"),
      provs: e.querySelectorAll("[data-prov-covered], [data-prov-inspect], [data-prov-pickable]").length,
      text: e.textContent,
    }))
    .catch(() => null);
  const today = Math.floor(Date.now() / 1000 / DAY);
  const day = r.day != null ? Number(r.day) : null;
  if (!lv || lv.day == null) {
    // No level on the day: none is due (before the open, in a gap, after the end).
    const due = day != null && day !== today && levelBlockOn(rows, day, Date.now() / 1000) != null;
    check(`${tag}: stop ${now}, no level where none is due`, !due, lv?.text ?? "no level line");
    return;
  }
  const lday = Number(lv.day);
  const live = lday === today && rows[rows.length - 1].holds;
  const want = live ? "" : String(levelBlockOn(rows, lday, Date.now() / 1000) ?? "");
  check(
    `${tag}: stop ${now}, the level's block is the last holding row's by the day's end`,
    lv.block === want,
    `day ${lday}: readout ${lv.block}, rows ${want}; ${lv.text}`,
  );
  if (lv.runwayBlock != null)
    check(
      `${tag}: stop ${now}, the runway's block is the price's`,
      lv.runwayBlock === (r.block || lv.block),
      `runway ${lv.runwayBlock}, price ${r.block}`,
    );
  if (lv.redeemedBlock != null) {
    const reds = rows.filter((x) => x.redemption && x.redemptionPrice != null && Math.floor(x.ts / DAY) === lday);
    const lastRed = reds[reds.length - 1];
    check(
      `${tag}: stop ${now}, the redemption price is the day's last redemption's, at its block`,
      lastRed != null &&
        String(lastRed.block) === lv.redeemedBlock &&
        near(lastRed.redemptionPrice, Number(lv.redeemedPrice)),
      `readout ${lv.redeemedBlock} ${lv.redeemedPrice}; rows ${lastRed?.block} ${lastRed?.redemptionPrice}`,
    );
  }
  if (BASE.includes("localhost"))
    check(`${tag}: stop ${now}, the level's figures are inside <Prov>s`, lv.provs >= 1, `${lv.provs}`);
}

/** The last stop against the card, and a redemption day's readout. */
async function checkTroveEnd(page, tag, pg, rows, sl) {
  await sl.focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(250);
  const end = await page
    .$eval("[data-liq-readout]", (e) => ({
      day: e.getAttribute("data-liq-day"),
      value: e.getAttribute("data-liq-value"),
    }))
    .catch(() => null);
  if (pg.trove === "live" || pg.trove === "redeemed") {
    const today = Math.floor(Date.now() / 1000 / DAY);
    const card = (
      await page
        .locator('[data-panel-row="liquidates-at"] dd')
        .first()
        .textContent()
        .catch(() => null)
    )?.trim();
    check(
      `${tag}: the level's last point is today's and equals the card's "Liquidates at"`,
      end != null && Number(end.day) === today && card != null && formatLiquidationPrice(Number(end.value)) === card,
      `level ${end?.day} ${end?.value} (${end ? formatLiquidationPrice(Number(end.value)) : "-"}), card ${card}`,
    );
  }
  if (pg.trove === "liquidated" || pg.trove === "closed") {
    // A closed position's chart ends at the close (ruling 14): the last stop
    // reads the close day, plain, under "At close", and the line draws no day
    // after it.
    const liqDay = Math.floor(
      (pg.trove === "liquidated" ? rows.find((r) => r.liquidation) : rows[rows.length - 1]).ts / DAY,
    );
    const close = await page.evaluate(() => {
      const r = document.querySelector("[data-price-readout]");
      const g = document.querySelector("[data-price-line]");
      const days = ["data-price-observed", "data-price-carried"].flatMap((a) =>
        (g?.getAttribute(a) ?? "").split(",").filter(Boolean).map(Number),
      );
      return {
        day: r?.getAttribute("data-price-day"),
        green: /text-green/.test(r?.className ?? ""),
        last: Math.max(...days),
        heading: document.querySelector("[data-flow-date]")?.textContent ?? "",
      };
    });
    check(
      `${tag}: at the last stop the panel reads "At close" on the close day`,
      close.heading.startsWith("At close, ") && dayOfWord(close.heading.slice("At close, ".length)) === liqDay,
      `${close.heading}; close ${liqDay}`,
    );
    check(
      `${tag}: at the last stop the heading reads the close day, and the line ends there`,
      Number(close.day) <= liqDay && !close.green && close.last === liqDay,
      `readout day ${close.day}${close.green ? " (live green)" : ""}, line's last day ${close.last}, liquidation ${liqDay}`,
    );
  }
  // The runway and the redemption price left the chart's readout for the
  // card's "Collateral can fall" and the event cards (heading figures, 14 Oct
  // 2026): the heading states the price and the level alone.
}

/** Under 640px a timeline card's "View on chart" stands in its caption,
 *  beside the date, a 36px target: a tap moves the chart's cursor to that
 *  day and leaves the card closed. */
async function checkPhoneDayMark(page, tag) {
  const btn = page.locator("[data-flow-day-mark-phone] [data-flow-day-move]").nth(1);
  if (!check(`${tag}: 390, the captions carry "View on chart"`, (await btn.count()) > 0)) return;
  await btn.scrollIntoViewIfNeeded();
  const want = await btn.evaluate((b) => {
    const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + 3);
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: hit != null && b.contains(hit),
      day: Number(b.closest("[data-flow-day-mark-phone]").getAttribute("data-flow-day-mark-phone")),
    };
  });
  check(
    `${tag}: 390, the caption's chart button is a 36px target, its top edge its own`,
    want.w === 36 && want.h === 36 && want.top,
    JSON.stringify(want),
  );
  const opened = () => page.locator('[data-anatomy="T2"]').count();
  const before = await opened();
  await btn.tap();
  await page.waitForTimeout(600);
  const heading = (await page.locator("[data-flow-date]").first().textContent()) ?? "";
  check(
    `${tag}: 390, a tap on it moves the chart's cursor to that day, the card left closed`,
    dayOfWord(heading) === want.day && (await opened()) === before,
    `heading "${heading}", day ${want.day}, cards open ${before} → ${await opened()}`,
  );
}

/** The chart's cursor and window as its data hooks state them. */
const lwState = (page) =>
  page.evaluate(() => {
    const w = document.querySelector("[data-flows-combined] [data-flow-chart-engine=lw]");
    const sl = document.querySelector('[data-flows-combined] [data-flow-strip-view="chart"]');
    const x = w?.getAttribute("data-flow-lw-cursor-x") ?? "";
    return {
      x: x === "" ? null : Number(x),
      plotW: Number(w?.getAttribute("data-flow-lw-plot-w") || 0),
      from: Number(w?.getAttribute("data-flow-lw-from")),
      to: Number(w?.getAttribute("data-flow-lw-to")),
      now: Number(sl?.getAttribute("aria-valuenow")),
      max: Number(sl?.getAttribute("aria-valuemax")),
      frozen: document.querySelector("[data-flows-combined][data-flow-frozen]") != null,
    };
  });
const atRight = (s) => s.x != null && s.plotW > 0 && s.x >= s.plotW - 4 && s.x <= s.plotW + 1;
const inPlot = (s) => s.x != null && s.plotW > 0 && s.x >= 0 && s.x <= s.plotW + 1;
const lwShow = (s) => `x ${s.x} of ${s.plotW}, stop ${s.now}/${s.max}${s.frozen ? ", frozen" : ""}`;

/** On open (ui-jobs 328 step 4c, the phone's clipped chart): the chart fits
 *  the panel with no page overflow, its window covers the whole life, the
 *  cursor stands on the last stop at the plot's right end, and the events row
 *  spreads its pips over the plot. A day's close inside a grid cell (a cell
 *  longer than a day, a phone's width) once read x 0. */
async function checkLwOpen(page, tag, priceOnly = false) {
  // The value line's hook, once the line is drawn (a model rebuilt over more
  // of the life sets it again).
  if (!priceOnly)
    await page
      .waitForFunction(
        () =>
          document.querySelector("[data-flows-combined] [data-flow-value-line]")?.getAttribute("data-flow-value-line"),
        null,
        { timeout: 30000 },
      )
      .catch(() => {});
  const r = await page.evaluate((priceOnly) => {
    const w = document.querySelector("[data-flows-combined] [data-flow-chart-engine=lw]");
    const panel = w.closest("[data-flows-combined]").getBoundingClientRect();
    const box = w.querySelector("[data-flow-lw-box]").getBoundingClientRect();
    const canv = [...w.querySelectorAll("[data-flow-lw-box] canvas")].map((c) => c.getBoundingClientRect());
    const line = w.querySelector("[data-flow-value-line]")?.getAttribute("data-flow-value-line") ?? "";
    // The price chart alone: its observed days' closes.
    const price = w.querySelector("[data-price-line]");
    const ts = priceOnly
      ? ["data-price-observed", "data-price-carried"].flatMap((a) =>
          (price?.getAttribute(a) ?? "")
            .split(",")
            .filter(Boolean)
            .map((d) => (Number(d) + 1) * 86400),
        )
      : line
          .split(/[|,]/)
          .map((p) => Number(p.split(":")[0]))
          .filter((t) => Number.isFinite(t) && t > 0);
    return {
      fits:
        box.left >= panel.left - 1 &&
        box.right <= panel.right + 1 &&
        canv.length > 0 &&
        canv.every((c) => c.left >= box.left - 1 && c.right <= box.right + 1),
      sizes: `panel ${Math.round(panel.left)}–${Math.round(panel.right)}, box ${Math.round(box.left)}–${Math.round(box.right)}`,
      overflow: document.documentElement.scrollWidth - innerWidth,
      first: ts.length ? Math.min(...ts) : 0,
      last: ts.length ? Math.max(...ts) : 0,
      pips: [...document.querySelectorAll("[data-flows-combined] [data-flow-pip]")].map((p) =>
        parseFloat(p.style.left),
      ),
    };
  }, priceOnly);
  check(
    `${tag}: the chart fits the panel, no page overflow`,
    r.fits && r.overflow <= 0,
    `${r.sizes}, overflow ${r.overflow}`,
  );
  const s = await lwState(page);
  check(
    `${tag}: the window on open covers the whole life`,
    s.from <= r.first && s.to >= r.last,
    `window ${new Date(s.from * 1000).toISOString().slice(0, 10)}–${new Date(s.to * 1000).toISOString().slice(0, 10)}, life ${new Date(r.first * 1000).toISOString().slice(0, 10)}–${new Date(r.last * 1000).toISOString().slice(0, 10)}`,
  );
  check(
    `${tag}: on open the cursor stands on the last stop, at the plot's right end`,
    s.now === s.max && atRight(s),
    lwShow(s),
  );
  if (priceOnly) return;
  check(
    `${tag}: the events row spreads its pips over the plot`,
    r.pips.length > 1 && r.pips.every((x) => x >= -1 && x <= s.plotW + 1) && r.pips.filter((x) => x <= 1).length <= 1,
    `${r.pips.length} pips, ${r.pips.filter((x) => x <= 1).length} at x 0`,
  );
}

/** The wheel on a position page (Miles, 26 Oct 2026): over the chart it
 *  scrolls the page and leaves the window; Ctrl with the wheel (a trackpad's
 *  pinch arrives so) zooms about the pointer and leaves the page; a sideways
 *  swipe pans the zoomed window. Desktop only: a phone has no wheel. */
async function checkLwWheel(page, tag) {
  await page
    .locator('[data-flows-combined] [data-flow-range="All"]')
    .first()
    .click()
    .catch(() => {});
  await page.waitForTimeout(600);
  const box = page.locator("[data-flows-combined] [data-flow-lw-box]").first();
  // The chart in the viewport's upper half, so the page has room to scroll.
  const place = async () => {
    await box.evaluate((el) => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 160));
    await page.waitForTimeout(300);
  };
  await place();
  const over = async () => {
    const b = await box.boundingBox();
    await page.mouse.move(b.x + b.width * 0.5, b.y + Math.min(40, b.height / 3));
  };
  const at = async () => ({ y: await page.evaluate(() => window.scrollY), ...(await lwState(page)) });
  await over();
  const a = await at();
  // A short page (a one-day life) may have no room left below: the wheel
  // scrolls it up instead.
  const down = await page.evaluate(() => window.scrollY + innerHeight < document.documentElement.scrollHeight - 2);
  await page.mouse.wheel(0, down ? 240 : -240);
  await page.waitForTimeout(700);
  const b = await at();
  check(
    `${tag}: the wheel over the chart scrolls the page and leaves the window`,
    (down ? b.y > a.y : b.y < a.y) && b.from === a.from && b.to === a.to,
    `scroll ${a.y} → ${b.y}, window ${a.to - a.from} → ${b.to - b.from} s`,
  );
  // The wheel moved the chart up the viewport: back under the pointer.
  await place();
  await over();
  const c = await at();
  await page.keyboard.down("Control");
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(40);
  }
  await page.keyboard.up("Control");
  await page.waitForTimeout(900);
  const d = await at();
  check(
    `${tag}: Ctrl with the wheel zooms the chart and leaves the page`,
    d.y === c.y && d.to - d.from < (c.to - c.from) * 0.9,
    `scroll ${c.y} → ${d.y}, window ${c.to - c.from} → ${d.to - d.from} s`,
  );
  await page.waitForTimeout(300);
  for (let i = 0; i < 3; i++) {
    await page.mouse.wheel(-120, 0);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(900);
  const e = await at();
  check(
    `${tag}: a sideways swipe pans the zoomed window and leaves the page`,
    e.y === d.y && e.from < d.from && Math.abs(e.to - e.from - (d.to - d.from)) <= (d.to - d.from) * 0.05,
    `scroll ${d.y} → ${e.y}, from ${d.from} → ${e.from}`,
  );
  await page.locator('[data-flows-combined] [data-flow-range="All"]').first().click();
  await page.waitForTimeout(600);
}

/** The health view's older days (ruling 15): drawn as a second, dotted
 *  series, which meets the solid line on each day the two touch. */
async function checkHealthDotted(page, tag) {
  const h = await page.$eval("[data-price-line]", (g) => ({
    key: g.getAttribute("data-price-line"),
    dotted: (g.getAttribute("data-price-dotted") ?? "").split(",").filter(Boolean).length,
    dottedDays: (g.getAttribute("data-price-dotted") ?? "").split(",").filter(Boolean).map(Number),
    meets: g.getAttribute("data-price-meets") ?? "",
  }));
  if (h.key !== "health" || h.dotted === 0) return;
  const [met, days] = h.meets.split("/").map(Number);
  check(
    `${tag}: the health view's older days are a dotted series that meets the solid one`,
    days > 0 && met === days,
    `${h.dotted} dotted vertices; meets ${h.meets}`,
  );
}

/** The price chart alone draws no steps: Home and End on its slider put the
 *  cursor on the first stop in the plot and the last at the right end. */
async function checkLwKeys(page, tag) {
  const sl = page.locator('[data-flows-combined] [data-flow-strip-view="chart"]').first();
  await sl.focus();
  await page.keyboard.press("Home");
  await page.waitForTimeout(400);
  const a = await lwState(page);
  await page.keyboard.press("End");
  await page.waitForTimeout(400);
  const e = await lwState(page);
  check(
    `${tag}: Home puts the cursor on the first stop in the plot, End on the last at the right end`,
    a.now === 0 && inPlot(a) && a.x < e.x && e.now === e.max && atRight(e),
    `${lwShow(a)} → ${lwShow(e)}`,
  );
}

/** The steps (⏮ ‹ › ⏭), at All and zoomed to 30D, frozen and not: ⏭ puts the
 *  cursor on the last stop at the plot's right end and releases a freeze;
 *  every step leaves the cursor in the plot, in order. */
async function checkLwSteps(page, tag, touch) {
  const press = async (sel) => {
    await page.locator(`[data-flows-combined] ${sel}`).first().click();
    await page.waitForTimeout(500);
    return lwState(page);
  };
  const START = '[data-flow-jump="start"]';
  const END = '[data-flow-jump="end"]';
  const PREV = 'button[aria-label="Previous event"]';
  const NEXT = 'button[aria-label="Next event"]';
  const freeze = async () => {
    const sl = page.locator('[data-flows-combined] [data-flow-strip-view="chart"]').first();
    const b = await sl.boundingBox();
    const s = await lwState(page);
    const at = { x: Math.round(s.plotW * 0.5), y: Math.min(40, Math.round((b?.height ?? 80) / 3)) };
    if (touch) await sl.tap({ position: at });
    else await sl.click({ position: at });
    await page.waitForTimeout(500);
    return lwState(page);
  };
  // A page that ties the chart to its timeline (Sync to chart) freezes on a tap.
  const tied = (await page.locator("[data-flow-sync]").count()) > 0;
  const zooms =
    (await page.locator('[data-flows-combined] [data-flow-range="30D"]').count()) > 0 ? ["All", "30D"] : ["All"];
  for (const z of zooms) {
    if (z !== "All") await press(`[data-flow-range="${z}"]`);
    const t = `${tag} ${z}`;
    const a = await press(START);
    check(`${t}: ⏮ puts the cursor on the first stop, in the plot`, a.now === 0 && inPlot(a), lwShow(a));
    const b = await press(NEXT);
    check(`${t}: › moves the cursor right, in the plot`, b.now > a.now && inPlot(b) && b.x >= a.x, lwShow(b));
    const e = await press(END);
    check(
      `${t}: ⏭ puts the cursor on the last stop, at the plot's right end`,
      e.now === e.max && atRight(e),
      lwShow(e),
    );
    const p = await press(PREV);
    check(`${t}: ‹ moves the cursor left, in the plot`, p.now < e.now && inPlot(p) && p.x <= e.x, lwShow(p));
    const f = await freeze();
    const fe = await press(END);
    if (tied)
      check(
        `${t}: ⏭ from a frozen cursor releases it on the last stop, at the right end`,
        f.frozen && !fe.frozen && fe.now === fe.max && atRight(fe),
        `${lwShow(f)} → ${lwShow(fe)}`,
      );
    else
      check(
        `${t}: a tap moves the cursor without freezing it; ⏭ brings it to the right end`,
        !f.frozen && f.now < f.max && inPlot(f) && !fe.frozen && fe.now === fe.max && atRight(fe),
        `${lwShow(f)} → ${lwShow(fe)}`,
      );
  }
  if (zooms.length > 1) await press('[data-flow-range="All"]');
}

const browser = await chromium.launch();

for (const pg of PAGES.filter((p) => !only || only.test(p.id))) {
  for (const width of [1280, 390]) {
    const tag = `${pg.id} @${width}`;
    const ctx = await browser.newContext({
      viewport: { width, height: 1000 },
      hasTouch: width < 640,
      isMobile: width < 640,
      extraHTTPHeaders: bypassHeaders(),
    });
    // The full Lifetime flows panel: the compact view (the default) has no
    // scrubber or events row.
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("rails-flows-view-v1", "full");
      } catch {}
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let body = null;
    page.on("response", async (r) => {
      const u = new URL(r.url());
      if (!pg.answer || u.pathname !== pg.answer || !r.ok()) return;
      try {
        body = await r.json();
      } catch {}
    });
    await page.goto(`${BASE}${pg.path}`, { waitUntil: "domcontentloaded", timeout: 240000 });
    await page
      .waitForSelector("[data-flows-combined] [data-flow-strip] svg, [data-flows-combined] [data-flow-lw-box] canvas", {
        timeout: 180000,
      })
      .catch(() => {});
    // On the new engine, the canvas: the library loads after the panel, and
    // the panel's own icons are svgs too.
    if ((await page.locator("[data-flows-combined] [data-flow-chart-engine=lw]").count()) > 0)
      await page
        .waitForFunction(
          () =>
            document.querySelector("[data-flows-combined] [data-flow-lw-box] canvas") &&
            (document
              .querySelector("[data-flows-combined] [data-flow-value-line]")
              ?.getAttribute("data-flow-value-line") ||
              document.querySelector('[data-flows-combined="price"] [data-price-line]')),
          null,
          { timeout: 120000 },
        )
        .catch(() => {});
    await page.waitForTimeout(2500);
    // The health view lands once its position-state reads have, and redraws
    // the price pane: every check below waits for it.
    if (pg.health) await waitForHealth(page);
    if (pg.ratio) await waitForHealth(page, pg.ratio.label);
    if (pg.band) await waitForHealth(page, "Health");
    // The pace lane lands with its own read.
    if (pg.pace) await page.waitForSelector("[data-flow-pace]", { state: "attached", timeout: 60000 }).catch(() => {});
    // The drawn strips name their views; the chart names its panes.
    const views = await page.$$eval("[data-flows-combined] [data-flow-strip]", (els) =>
      els.flatMap((e) =>
        e.getAttribute("data-flow-strip-view") === "chart"
          ? (e.querySelector("[data-flow-chart-panes]")?.getAttribute("data-flow-chart-panes") ?? "").split(",")
          : [e.getAttribute("data-flow-strip-view")],
      ),
    );
    const panes = pg.panes ?? "value,price";
    if (!check(`${tag}: the chart's panes stand stacked (${panes})`, views.join() === panes, views.join())) {
      await ctx.close();
      continue;
    }
    const lw = (await page.locator("[data-flows-combined] [data-flow-chart-engine=lw]").count()) > 0;
    if (lw) {
      // The attribution is the site footer's (Miles, 26 Oct 2026): no logo
      // or notice on the chart.
      const drawn = await page.evaluate(() => ({
        canvases: document.querySelectorAll("[data-flow-lw-box] canvas").length,
        notice: document.querySelector("[data-flows-combined] [data-flow-lw-notice]") != null,
        logo: document.querySelector('[data-flow-lw-box] a[href*="tradingview"]') != null,
      }));
      check(
        `${tag}: the chart draws on Lightweight Charts with its time axis, no logo or notice on it`,
        drawn.canvases > 0 && !drawn.notice && !drawn.logo,
        JSON.stringify(drawn),
      );
      await page.locator("[data-flows-combined] [data-flow-chart-engine=lw]").scrollIntoViewIfNeeded();
      await checkLwOpen(page, tag, pg.priceOnly);
    }
    if (pg.unit || pg.valueLine) await checkValueUnit(page, tag, pg);
    if (pg.lwOnly) {
      if (!check(`${tag}: the chart draws on Lightweight Charts`, lw)) {
        await ctx.close();
        continue;
      }
      if (pg.priceOnly) await checkLwKeys(page, tag);
      else await checkLwSteps(page, tag, width < 640);
      if (width >= 640) await checkLwWheel(page, tag);
      if (pg.health) await checkHealthAlone(page, tag, pg);
      if (pg.ratio) await checkRatio(page, tag, pg);
      if (pg.v1) await checkV1Level(page, tag, pg);
      if (pg.level) await checkLevelView(page, tag, pg);
      if (pg.share) await checkShareLine(page, tag);
      if (pg.family) await checkFamilyLine(page, tag, pg);
      if (pg.alchemix) await checkAlchemixShare(page, tag, pg);
      if (pg.band) await checkBand(page, tag, pg, width);
      if (pg.changes) await checkChanges(page, tag, pg, width);
      if (pg.noChanges) await checkNoChanges(page, tag);
      check(`${tag}: console clean`, errors.length === 0, errors.slice(0, 3).join(" | "));
      await ctx.close();
      continue;
    }
    const PRICE = PRICE_STRIP;
    await page.locator(PRICE).scrollIntoViewIfNeeded();
    if (!body) {
      // The answer was read before the listener saw it: read it as the page does.
      const u = new URL(`${BASE}${pg.path}`);
      const q =
        pg.query ??
        (pg.answer === "/api/aave-v3/flows"
          ? `wallet=${u.pathname.split("/").pop()}&market=${u.searchParams.get("market")}`
          : `collateralType=${u.pathname.split("/")[4]}`);
      body = await hostFetch(`${BASE}${pg.answer}?${q}`).then((r) => r.json());
    }
    const series = answerSeries(pg.answer, body, pg.path.split("/")[4]);

    // The value line as drawn: the strip's paths, or the chart's hook.
    const valueLine = () =>
      page.evaluate(
        () =>
          document
            .querySelector("[data-flows-combined] [data-flow-value-line]")
            ?.getAttribute("data-flow-value-line") ??
          [...document.querySelectorAll('[data-flows-combined] [data-flow-strip-view="value"] svg path')]
            .map((p) => p.getAttribute("d"))
            .join("|"),
      );
    const pips = () =>
      page.$$eval("[data-flows-combined] [data-flow-pips]", (rows) =>
        rows.map((r) => [...r.querySelectorAll("[data-flow-pip]")].map((p) => p.style.left).join(",")),
      );
    const before = { line: await valueLine(), pips: await pips() };
    check(`${tag}: one pip row under the charts`, before.pips.length === 1, `${before.pips.length} rows`);

    // The picker: each held asset with a series.
    // The heading's list (several assets: open it to read its options) or
    // the asset's name (one).
    const picker = page.locator("button[data-price-picker]");
    // The tip's toggles, once the series the chart opens on has landed.
    // Only a page that draws a level has the toggle: the Aave family's
    // health view and the Troves; a SparkLend page with no debt has no
    // health view.
    if (pg.health || pg.trove) await checkLevelToggle(page, tag);
    await checkEventsToggle(page, tag);
    if ((await picker.count()) > 0) {
      await picker.click();
      await page.waitForSelector('[role="listbox"] [data-price-asset]', { timeout: 5000 }).catch(() => {});
    }
    const listedAll = await page.$$eval("[data-price-asset]", (bs) => bs.map((b) => b.dataset.priceAsset));
    if ((await picker.count()) > 0) await page.keyboard.press("Escape");
    // The health view (Aave V3, ruling 7) is listed first; the assets follow.
    const listed = listedAll.filter((s) => s !== HEALTH);
    if (pg.health) {
      await checkHealth(page, tag, pg, listedAll);
      if (!pg.noLevel) await checkPickedLevel(page, tag, listedAll);
      if (pg.v4Spoke) await checkV4Levels(page, tag, pg, listedAll);
    }
    const pick = async (sym) => {
      if ((await picker.count()) === 0) return;
      await picker.click();
      await page.locator(`[role="listbox"] [data-price-asset="${sym}"]`).click();
    };
    const want = [...series.keys()];
    check(
      `${tag}: the picker lists each held asset with a series`,
      want.length > 0 && want.every((s) => listed.includes(s)) && listed.every((s) => want.includes(s)),
      `listed ${listed.join(",")}; answer ${want.join(",")}`,
    );

    // Each listed asset: the drawn days against the answer, and the charts'
    // how-to-read naming the series.
    for (const sym of listed) {
      await pick(sym);
      await page.waitForTimeout(250);
      const drawn = await page.$eval("[data-price-line]", (g) => ({
        observed: (g.getAttribute("data-price-observed") ?? "").split(",").filter(Boolean).map(Number),
        carried: (g.getAttribute("data-price-carried") ?? "").split(",").filter(Boolean).map(Number),
      }));
      const obs = series.get(sym) ?? new Map();
      const days = [...obs.keys()];
      const lo = Math.min(...days);
      const hi = Math.max(...days);
      const inRange = (d) => pg.answer.endsWith("/flows") || (d >= lo && d <= hi);
      const extra = drawn.observed.filter((d) => inRange(d) && !obs.has(d));
      const wrong = drawn.carried.filter((d) => inRange(d) && obs.has(d));
      check(
        `${tag} ${sym}: every day drawn observed is in the answer, none drawn carried is`,
        drawn.observed.length > 0 && extra.length === 0 && wrong.length === 0,
        `${drawn.observed.length} observed, ${drawn.carried.length} carried; extra ${extra.slice(0, 3)}; carried but answered ${wrong.slice(0, 3)}`,
      );
      await page.locator('[data-flow-help="F7.1"] button').click();
      const help = await page
        .locator('[role="dialog"][aria-label="How to read the events and charts"]')
        .textContent({ timeout: 5000 })
        .catch(() => "");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);
      check(`${tag} ${sym}: the charts' how-to-read names the series`, help?.includes(`The ${sym} price`), help ?? "");
    }
    // Back to the first asset for the stops.
    await pick(listed[0]);
    const rows = pg.trove ? await troveRows(pg.path) : null;
    if (rows) await checkTroveMarks(page, tag, pg, rows);
    if (rows && pg.pace) await checkPace(page, tag, pg, rows, width);
    const obs0 = series.get(listed[0]) ?? new Map();

    // Three stops: the opening, the middle and the day before today; the
    // price strip focused, which shows its readout as the cursor's tip.
    // The value line as the stops find it: read here, after the asset picks
    // and the health view's late reads, so the check below is about the
    // stops alone (on 0xfb93 the line read at load is not the line the stops
    // find, 23 Oct 2026, so the load-time read tested the picks and the late
    // reads along with them).
    const lineBeforeStops = await valueLine();
    const sl = page.locator(PRICE).first();
    await sl.focus();
    const max = Number(await sl.getAttribute("aria-valuemax"));
    const targets = [0, Math.floor(max / 2), Math.max(0, max - 1)];
    for (const target of targets) {
      await page.keyboard.press("Home");
      for (let i = 0; i < Math.floor(target / 4); i++) await page.keyboard.press("PageUp");
      for (let i = 0; i < target % 4; i++) await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(150);
      const r = await page.$eval("[data-price-readout]", (e) => ({
        day: e.getAttribute("data-price-day"),
        block: e.getAttribute("data-price-block"),
        prov: !!e.querySelector("[data-prov-covered], [data-prov-inspect], [data-prov-pickable]"),
        text: e.textContent,
      }));
      const now = Number(await sl.getAttribute("aria-valuenow"));
      if (rows) await checkLevelReadout(page, tag, now, r, rows);
      if (r.day == null) {
        check(`${tag}: stop ${now} has a price`, false, r.text ?? "");
        continue;
      }
      const day = Number(r.day);
      const point = obs0.get(day);
      // Outside the Liquity answer's days the Trove's own rows price the line.
      if (
        !point &&
        !pg.answer.endsWith("/flows") &&
        (day < Math.min(...obs0.keys()) || day > Math.max(...obs0.keys()))
      ) {
        check(`${tag}: stop ${now} reads a row's price outside the answer's days`, true, r.text ?? "");
        continue;
      }
      // An open Trove's today is the live read, which has no block.
      if (pg.trove && day === Math.floor(Date.now() / 86_400_000) && r.block === "") {
        check(`${tag}: stop ${now}, today reads the live price`, true, r.text ?? "");
        continue;
      }
      check(
        `${tag}: stop ${now}, the readout's block is the answer's block on its day`,
        point != null && String(point[1] ?? "") === (r.block ?? ""),
        `day ${day}: readout ${r.block}, answer ${point ? point[1] : "none"}; ${r.text}`,
      );
      if (BASE.includes("localhost")) check(`${tag}: stop ${now}, the price is inside a <Prov>`, r.prov);
    }

    if (rows) await checkTroveEnd(page, tag, pg, rows, sl);
    if (lw) await checkLwSteps(page, tag, width < 640);
    if (lw && width >= 640) await checkLwWheel(page, tag);

    // The value line is the one it was: the stops moved the cursor only.
    await sl.focus();
    await page.keyboard.press("End");
    await page.waitForTimeout(300);
    check(
      `${tag}: the value line is unchanged by the stops`,
      (await valueLine()) === lineBeforeStops && lineBeforeStops.length > 0,
    );
    if (pg.trove && width < 640) await checkPhoneDayMark(page, tag);
    check(`${tag}: console clean`, errors.length === 0, errors.slice(0, 3).join(" | "));
    await ctx.close();
  }
}

await browser.close();
console.log(`\n${checked - failures}/${checked} checks pass`);
process.exit(failures === 0 && checked > 0 ? 0 : 1);
