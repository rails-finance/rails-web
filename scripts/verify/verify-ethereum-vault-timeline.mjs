#!/usr/bin/env node
// One holder's timeline inside one Aave vault on Ethereum, checked against the
// chain rather than against itself. /ethereum/aave/vaults/<vault>/<holder>.
// ----------------------------------------------------------------------------
// EVERY EXPECTED FIGURE HERE IS THIS SCRIPT'S OWN CHAIN READ OR ITS OWN PARSE.
// Each page states the block it read at; this script then makes its OWN two
// `eth_getLogs` over the whole chain to that block, its OWN `Deposit` and
// `Withdraw` sweeps, its OWN `balanceOf` and its OWN archive
// `convertToAssets(10 ** its own decimals())` at every row's own block, and
// rebuilds the whole timeline from them — every row's kind, signed delta,
// running balance, asset leg and share price. The page's answer is then
// compared against that. The one thing taken from the page is the block number,
// which is check 0b's subject and not a source of truth for anything else.
//
// AN EXPECTATION NEVER COMES FROM THE THING UNDER TEST. The reconcile gate's
// expectation is this script's own replay against its own `balanceOf` — check
// 1 asserts the page drew a timeline IF AND ONLY IF this script's own gate
// passed, so a page that drew rows through a failed gate and a page that
// withheld them through a passing one both go red. The fixtures below are
// INPUTS — which vault, which address, which branch to expect — never expected
// figures.
//
// ⚠️ A FIXTURE THAT HAS EXITED IS A FAILURE, NEVER A SKIP. Check 12 asserts each
// fixture still holds a POSITIVE balance at the page's own block and FAILS if
// it does not: a fixture that has left makes every check resting on it
// green-but-vacuous, and a silent pass would hide that.
//
// WEI-EXACT, FROM THE API ROUTE. Section 3 reads the timeline out of
// /api/chain/aave-vaults/vault, which serves the same loader in raw units — a
// figure scraped off the page is formatted, and a comparison against formatted
// cents is blind to a wei-level break. Where the DOM is judged (rows present,
// kinds, dates, copy rules, the absence of a chart) it is the RENDERED DOM that
// is read, never the RSC payload.
//
// Run:
//   BASE=http://localhost:3741 node scripts/verify/verify-ethereum-vault-timeline.mjs
// Needs ALCHEMY_URL in .env.local (read, never printed). This script DOES make
// `eth_getLogs` — that is the point of it — over the whole chain, address- and
// topic-filtered, which the state lane answers in one call per direction.
//
// ── 2026-09-08 · THE HOLDER IS A PATH SEGMENT ──────────────────────────────
// One line changed: the URL is `/ethereum/aave/vaults/<vault>/<holder>`. No check
// was touched, which is the point — the row grammar did not move. 48/48 · 1
// SKIP, unchanged.
//
// ── 2026-09-08 · THE ROWS MOVED ONTO `ChainTruthTimeline` ───────────────────
// The page's hand-rolled row list is gone: the rows ride the house shell, which
// COLLAPSES consecutive deposits or withdrawals into one folder row and windows
// the list at 100. Three checks compared the DOM position-for-position against
// this script's own LOG list and had to be restated against its own ROW list —
// the same logs, grouped by this script's own copy of the collapse rule
// (`ownRows`, `MIN_RUN`, `WINDOW_CHUNK` above the fixtures). 2c now asserts the
// painted rows are that grouping and that the `data-vault-timeline-rows`
// attribute is still the WHOLE life; 4e and 10b walk the row list and make
// their per-event assertions on the rows that are single events, because a
// collapsed run wears no action word and no single date.
//
// ⚠️ AND ONE CHECK WAS FOUND TO BE WRONG, not merely outdated. 9a ("no SVG
// geometry carries the rows' share prices") counted ROWS rather than DISTINCT
// prices. A stake token reads a share price of exactly 1.0 on every row, so
// once the shared toolbar's own lucide icons joined this section — an icon path
// contains the number 1 — the check reported "an SVG geometry carries 50 of the
// rows' share prices" and went red on two fixtures with no chart anywhere on
// the page. What a sparkline puts in a path is a series of DIFFERENT prices;
// the check now dedupes before matching and its message says "DISTINCT".
// 48/48 · 1 SKIP, restored.
//
// ── WHAT EACH SECTION ASSERTS ────────────────────────────────────────────────
//   0  each sampled page answers 200 and states a block near this script's own
//      head, and the API route serves a timeline for the same block
//   1  the gate is real: this script's own sweeps, own replay and own
//      `balanceOf` at the page's block decide whether a timeline may be drawn,
//      and the page drew one if and only if they reconciled — with both figures
//      on the page equal to this script's own two; and above the horizon (a
//      real 7,708-log address) the rows are withheld with the count stated
//   2  row count and order: the page's rows equal this script's own log count
//      (plus its own count of stand-alone cooldown logs), DESCENDING by
//      (block, logIndex) — newest first, like every other Rails timeline. The
//      order is asserted on the API's own array; the DOM is then held to the
//      same order by 4e and 10b, so the two cannot disagree. And the DOM draws
//      exactly that many rows
//   3  every row wei-exact against this script's own decode: `sharesDelta`,
//      `balanceAfter`, the `assets` leg against the ERC-4626 event in the same
//      transaction, and `sharePriceAtBlock` against this script's own archive
//      `convertToAssets(10 ** its own decimals() read)` — on a 6-decimal AND an
//      18-decimal share token, with 3e asserting the sample spans both
//   4  kinds are decided by the zero address, and the sample exercises every
//      branch the reader has: the Safe fixture's 28 plain transfers prove the
//      transfer arms are not dead
//   5  the Umbrella cooldown spans MORE THAN ONE state across the sample,
//      judged against the block's own timestamp, with `maxRedeem` 0 stated as
//      the cooldown it is rather than as a zero balance
//   6  the slash row is absent, and for the right reason: this script's own
//      `Slashed` and `StakeTokenSlashed` sweeps return zero. If either ever
//      returns non-zero this check FAILS and the build owes a slash row
//   7  notes are notes: `TargetRateUpdated` appears as a note with this
//      script's own count and its own decoded values, and the 4,600
//      `ExchangeRateUpdated` logs this script counts appear as no rows at all
//   8  no USD anywhere on any sampled page, and no APY, no annualised figure
//      and no rate of return
//   9  no line chart of share price: no SVG `path` or `polyline` in the
//      timeline whose numbers are the rows' own share prices
//  10  locale: the reconcile figures are en-US, every row's date is en-GB UTC
//      and equals this script's own format of its own block-timestamp read
//  11  the dev provenance tripwire reports no uncovered figure, with a holder
//      (every row expanded) and without one
//  12  every fixture still holds a positive balance at the page's own block
//  13  the lane by name, the chain-1 blast radius of moving it, and whether the
//      deployment under test has the wide lane at all
//
// ── PROVED IT CAN FAIL, 2026-09-07 (section 13, the lane by name) ───────────
// Restored run: 48/48 · 1 SKIP. Three breaks applied TOGETHER because their
// targets are disjoint, and exactly those four checks went red, 44/48:
//   EXPECTED_LANE set to a name no lane has →
//     FAIL  13a every drawn timeline names the expected lane, by env var name
//     FAIL  13b the route states chain 1's serving logs lane, and it is the expected one
//   a literal `chainLogsClient(1)` added to compound-v3-events.ts →
//     FAIL  13c the only serving-path caller of chainLogsClient on chain 1 is this timeline's loader
//   the Seamless route made to pass `chainId: 1` →
//     FAIL  13d no API route passes chain 1 into a parametrised event sweep
// 13e was not broken: it reads whether the deployment has the var, and this
// dev server reads .env.local, which has it. On a deployment without it 13e
// is a SKIP that says so, never a green.
// ── PROVED IT CAN FAIL, 2026-09-07, BASE=http://localhost:3741 ───────────────
// Restored run: 43/43 · 1 SKIP (4d, and its SKIP is a finding — see below).
// Eight breaks, applied one at a time and reverted. Nothing on this path is
// cached — the vault page reads its roster and its figures at one block per
// request and the timeline sweeps run on the request — so no cache had to be
// cleared between them.
//
//  B1  the loader salted the FIRST row's `sharesDelta` by +1 wei. 42/43.
//      FAIL 3a ("0xe175…ca1d/0x0c88…b63e row 0 blk 25116518: page
//      10526068938800000937824270 vs own …269", and the same on three more).
//      🔑 3b stayed GREEN, and that is correct: the running balance is
//      accumulated separately from the printed delta, so the two are
//      independent claims and the break forged only one. A check that derived
//      the balance from the delta could not have told them apart.
//  B2  the loader asked `convertToAssets(10^18)` on every vault instead of
//      10 ** its own `decimals()` — the decimals trap, made live. 42/43.
//      FAIL 3d ("0xd4fa…d23e row 0 blk 24944148: page 1168569954801119973 vs
//      own 1168569 (10^6)", and every other 6-decimal row).
//      🔑 3e stayed green, which is what it is for: the sample still spanned
//      both decimal classes, so 3d's premise held. And measured against the
//      route under the break, the two 18-DECIMAL fixtures printed the same
//      values they print green (1000115425947288670, 1007675558678880097)
//      while both 6-decimal ones were out by 1e12 — the 18-decimal rows stayed
//      right, which is the half of this break that proves the sample spans two
//      classes rather than one.
//  B3  the per-row cooldown join dropped (`extra: undefined` in the loader).
//      42/43. FAIL 5d ("0x6bf1…8aa6 row 13: page 0 cooldown log(s) vs own 1",
//      and 16 more on that fixture).
//      🔑 5a, 5b and 5c stayed green: the holder section's cooldown STATE is a
//      call at the page's block and the rows' cooldowns are logs, so a reader
//      can lose every row's cooldown while still printing a truthful state —
//      which is why the two are checked separately.
//  B3b the holder section's cooldown line dropped (`{holder.cooldown && (` →
//      `{false && holder.cooldown && (`). 42/43. FAIL 5c ("0x6bf1…8aa6:
//      maxRedeem 0 beside 1510111363010 shares, and no cooldown sentence on
//      the face", and the same on stkGHO).
//      🔑 5a stayed green — the state attribute was still right — and 5d too.
//      A page can carry a correct state in an attribute and say nothing to the
//      reader, which is what 5c exists to catch.
//  B4  `balanceOf` read at the wrong block (`blockNumber − 500,000`), both in
//      the gate and in its one re-fetch. 34/43. FAIL 1a ("0xe175…ca1d/
//      0x0c88…b63e: page drew 0 rows, own gate PASSED (8 logs)"), FAIL 1b
//      ("page balanceOf 0 vs own 7228713951590349280936773"), FAIL 1d, 2a, 2c,
//      7c (as it then was — see the note under B4b) and 10a.
//      🔑 1c stayed GREEN: the two log counts are a separate claim from the
//      balance read, and the break forged only the balance. That separation is
//      the reason the counts are checked apart from the sum.
//      🔑 The break landed on three of the five fixtures, not five — the other
//      two held the SAME balance 500,000 blocks earlier because neither had
//      moved in that window, so for them the wrong block was not a wrong
//      answer. A break that lands only where the quantity actually differs is
//      evidence the check is comparing quantities rather than shapes.
//  B4b the FIRST attempt only, at `blockNumber − 1,000,000`, leaving the
//      re-fetch pointed at the right block. This was run before B4 and is kept
//      because of what it found: for four of the five fixtures the gate FAILED
//      on the first read and then PASSED on the re-fetch, so the page drew a
//      correct timeline — the single re-fetch of §2 works, and is exercised.
//      The two sGHO fixtures went red anyway, because sGHO did not exist at
//      that block and the `balanceOf` call reverted, which the loader reports
//      as unread rather than as a zero balance. FAIL 1a, 1b ("page replayed
//      undefined"), 1c, 1d, 2a, 2c, 7a, 7c, 7d, 10a.
//      🔑 This break also found a fault in a CHECK. 7c ("the ExchangeRateUpdated
//      logs are rows nowhere") was written as an equality against this script's
//      own row count, which made it a duplicate of 2a and let an unrelated
//      break redden a check whose name then said the wrong thing. Its subject
//      is EXTRA rows, so it now asserts that no page drew MORE rows than this
//      script's own count.
//  B5  the row order reversed (`a.blockNumber - b.blockNumber` →
//      `b.blockNumber - a.blockNumber`). 31/43. FAIL 2b, 2d ("every row is the
//      same log this script read, id by id"), and — because every per-index
//      comparison then lines a row up against a different log — 3a, 3b, 3c,
//      3d, 4a, 4e ("row 0: header 'Sent 1 Sept '26 03:06' lacks 'Received'"),
//      5d and 10b.
//      🔑 2a and 2c stayed GREEN. The COUNT is unchanged by a reordering, and
//      the count and the order are two claims: a check that only counted rows
//      would have passed a timeline running backwards.
//  B6  a USD figure added to the timeline's closing line ("About $1,204,000 in
//      all"). 42/43. FAIL 8a ("$1" on all five pages). Every other check
//      stayed green: a chain-truth violation of this shape is an ADDITION, and
//      nothing else in this file looks for one.
//  B7  the horizon lowered from 5,000 to 10 rows. 38/43. FAIL 1a
//      ("0x1676…0d9a: page drew 0 rows, own gate PASSED (33 logs)"), and 1d,
//      2a, 2c, 10a behind it.
//      🔑 1e stayed green — the heavy fixture was still withheld, correctly —
//      which is why the threshold is restated in this file rather than read
//      out of the source: an expectation read from the thing under test cannot
//      catch a change to it.
//  B9  the rows served OLDEST-FIRST — the order this surface shipped with,
//      before Miles moved both chains' vault timelines to newest-first to match
//      every other Rails timeline. 33/43. FAIL 2b ("rows are descending by
//      (block, logIndex) — newest first", on all five fixtures), 2d, and —
//      because every per-index comparison then lines a row up against a
//      different log — 3a, 3b, 3c, 3d, 4a, 4e, 5d and 10b.
//      🔑 2a and 2c stayed GREEN, exactly as they did under B5's reversal from
//      the other direction: a count cannot see an order.
//      Run 2026-09-07 alongside the Base phase, after the flip. The order is
//      asserted on the API's own array (2b); the DOM is held to the same order
//      by 4e and 10b, so the two cannot state different orders and pass.
//
//  B8  the horizon withheld SILENTLY (`withheldAbove: transfers.length` →
//      `null`), so the rows vanish with no count stated. 41/43. FAIL 1e
//      ("page drew 0 rows, withheldAbove null, reconciled true") and FAIL 1f
//      ("no horizon statement on the page"), and nothing else.
//      🔑 The pair is deliberate: 1e reads the count out of the route and 1f
//      reads the sentence off the DOM, so a page that knows the count and does
//      not say it goes red on 1f alone.
//
// ⚠️ TWO FAULTS THIS FILE FOUND IN THE BUILD ON ITS FIRST RUN, both fixed:
//   • 6b was red. The timeline's closing line for an Umbrella stake token read
//     "This token's assets move only on a slashing, and none has ever fired" —
//     which the plan's §10.3 forbids in as many words: an absence is already
//     visible in the rows, and a sentence asserting one reads as a statement
//     about what happens next. The line now says what the accounting IS and
//     stops, and the receipt behind it no longer claims a slash census the
//     loader never made.
//   • 8b was red on two false positives, and both were worth the trouble. The
//     word "annualised" appears in the sGHO copy IN THE SENTENCE SAYING THE
//     PAGE DOES NOT ANNUALISE, and "Apr" is a month in this section's own
//     en-GB dates. A bare word test would have gone red on a page for refusing
//     the exact thing the check exists to forbid. The test is now the figure
//     and the period together, which is the shape a real violation takes.
//
// ── PROVED IT CAN FAIL, 2026-09-21, BASE=http://localhost:3741 (check 7e) ──
// Clean: 52/52 · 1 SKIP (4d). Two breaks in components/vaults/aave-vault-timeline.tsx,
// one at a time:
//  (a) a note counted in the toolbar's total — `olderCount` plus
//      `timeline.notes.length`. 51/52: FAIL 7e alone.
//  (b) a note counted in the wrapper — `data-vault-timeline-rows` plus
//      `notes.length`. 50/52: FAIL 7e ("0x844c…b26e rows 6 vs own 4") and 2c,
//      which holds the same attribute to the DOM.
// The filter arm (a note kind among the type options) was not broken.
//
import { chromium } from "playwright";
import { createPublicClient, http, parseAbi, parseAbiItem, toEventSelector, getAddress } from "viem";
import { mainnet } from "viem/chains";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = process.env.BASE ?? "http://localhost:3741";
// The lane the timeline's sweeps are EXPECTED to name — the env var's name,
// never its value. Pinned here, not read from chains.ts: the file under test is
// not a source of expectations. Moving chain 1 onto ETHEREUM_LOGS_RPC_URL was
// measured and declined on 2026-09-08 (rails-ops aave-ethereum-vault-layer.md
// §Outstanding); a change here must travel with chains.ts line 60 and a reason.
const EXPECTED_LANE = "ALCHEMY_URL";

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.ALCHEMY_URL) throw new Error("need ALCHEMY_URL in .env.local");

// ── the sample ──────────────────────────────────────────────────────────────
// One vault per family, and inside Umbrella both a 6-decimal and an 18-decimal
// stake token — the pair that lets check 3e prove the decimals trap is
// exercised rather than merely guarded against.
const SGHO = "0xe1753f2e00940cc31213dd92013cf019dfe4ca1d";
const WA_USDC = "0xd4fa2d31b7968e448877f69a96de69f5de8cd23e";
const STK_USDC = "0x6bf183243fdd1e306ad2c4450bc7dcf6f0bf8aa6";
const STK_GHO = "0x4f827a63755855cdf3e8f3bcd20265c833f15033";
const UMBRELLA = "0xd400fc38ed4732893174325693a63c30ee3881a8";

/** Holder fixtures — INPUTS. Each names a vault, an address and the BRANCH the
 *  reader should meet there; every figure is re-read at the block the page
 *  states. `expect` is a claim about the SHAPE of the life, not its numbers. */
const FIXTURES = [
  {
    label: "sGHO / a life that closed and reopened",
    vault: SGHO,
    // Replaced 2026-09-19: 0x0c88…b63e withdrew everything and check 12a went
    // red on it, as it is written to. This address is the same shape — mint,
    // burn to zero, mint, mint, no transfers — and held 1.42M sGHO that day.
    holder: "0x844ca21c1ba14da399b69fa0fecdefc0a0b5b26e",
    expect: { mints: true, burns: true, transfers: false, cooldowns: false },
  },
  {
    label: "sGHO / a Safe, transfer-heavy",
    vault: SGHO,
    holder: "0x1676d23711186076fa74aa53511dda750a1f0d9a",
    // The transfer branch's fixture: a timeline that only knows mints and burns
    // draws this one wrong, and no other fixture would catch it.
    expect: { mints: true, burns: false, transfers: true, cooldowns: false },
  },
  {
    label: "waEthUSDC / the 6-decimal share token",
    vault: WA_USDC,
    holder: "0xab6752ad54f05fb40c7eccee4fb11a78a322e34b",
    expect: { mints: true, burns: true, transfers: false, cooldowns: false },
  },
  {
    label: "stkwaEthUSDC / cooldown, and a 6-decimal stake token",
    vault: STK_USDC,
    holder: "0x5a2a98d3c9720734c2fca8d5ec808b073c047ccd",
    expect: { mints: true, burns: true, transfers: false, cooldowns: true },
  },
  {
    label: "stkGHO / cooldown, and the stake token that holds GHO directly",
    vault: STK_GHO,
    holder: "0x78622b0805ba35e0585c8aa0949eec00909a5cc1",
    expect: { mints: true, burns: true, transfers: false, cooldowns: true },
  },
];

/** The two HEAVY fixtures, and the two policy figures they are judged against.
 *
 *  ⚠️ 2026-09-09 — THE HORIZON SPLIT IN TWO, AND SO DID THIS CHECK. A life
 *  above `WINDOW` is no longer withheld: it is BUILT into Rails's store a chunk
 *  of blocks at a time across visits and then drawn, with its newest `DRAW_ROWS`
 *  rows serialised and `coverage.drawn` stating both figures. What is still
 *  withheld is a life above `CEILING` — larger than one stored tail can be. So
 *  the old HORIZON fixture (7,708 logs) is a TIER 1 life now and proves the
 *  build-and-window path, and a second fixture was added for the withheld path
 *  it used to cover.
 *
 *  Neither is one of FIXTURES: nothing about an individual row is asserted on
 *  them. Both policy figures are deliberately RESTATED here rather than read out
 *  of the source, because an expectation read from the thing under test cannot
 *  catch a change to it. `WINDOW` is `VAULT_TIMELINE_HORIZON` and `CEILING` is
 *  `tailMaxRows(1)` — the largest life Rails stores at all on chain 1, above
 *  which the rows are withheld. It is PER CHAIN as of 2026-09-09: an Ethereum
 *  row measured 437.9 bytes in the store against a Base row's 548.9, so the two
 *  no longer share one figure. Both in lib/shared/vault-holder-timeline.ts. */
const HEAVY = {
  vault: "0x0bfc9d54fc184518a81162f8fb99c2eaca081202", // waEthWETH
  holder: "0xce6ced23118edeb23054e06118a702797b13fc2f",
};
/** waEthUSDC held by the same address — 17,774 of its own transfers on
 *  2026-09-09, above what one stored tail holds. The sweeps still answer it
 *  whole, which is what makes it a fixture for the WITHHELD path rather than
 *  for the unread one. */
const CEILING_LIFE = {
  vault: "0xd4fa2d31b7968e448877f69a96de69f5de8cd23e", // waEthUSDC
  holder: "0xce6ced23118edeb23054e06118a702797b13fc2f",
};
const WINDOW = 5000;
// 11,000 → 14,000 on 2026-09-21: `tailMaxRows(1)` rose in web `b6a3e3f8` and this
// restatement was left at the old shared figure, so a life of 11,001–14,000 rows
// would have been judged Tier 2 here while the page built it as Tier 1.
const CEILING = 14000;
/** THE DRAW WINDOW — `VAULT_TIMELINE_DRAW_ROWS`, the one cut of rails-ops
 *  decision 0019, restated for the reason above. Re-pinned 2026-09-19 from the
 *  route as served: a life above it answers its newest 1,000 rows and
 *  `coverage.drawn` states the life they were cut from. `WINDOW` is still the
 *  Tier 0 / Tier 1 boundary and no longer the number of rows served. */
const DRAW_ROWS = 1000;

/** What the count line says after its total, once decision 0019's 2026-09-24
 *  amendment made the line state time: " · loaded 1 Jul 2026 to 25 Sept 2026",
 *  or one date where the loaded rows sit inside a day. en-GB, UTC, as
 *  `timeline-toolbar.tsx`'s `loadedSpanText` renders it. */
const LOADED_SPAN = /^ · loaded \d{1,2} [A-Za-z]+ \d{4}(?: to \d{1,2} [A-Za-z]+ \d{4})?$/;

/** The phrases that name the preload cap to the reader, which the same
 *  amendment retired ("never stated to the reader as a number", rule 2). The
 *  same set `verify-timeline-navigator.mjs` rejects. */
const NAMES_THE_CAP =
  /Showing [\d,]+ (?:rows|of [\d,]+ events)|most recent [\d,]+ events|above what Rails|showing the newest/i;

const client = createPublicClient({
  chain: mainnet,
  // Five retries 1 s doubling (31 s in all): this Mac shares preview's Alchemy app, and
  // a heavy build spends its per-second budget for several seconds. Three retries
  // 150 ms apart all landed inside that 429 and failed T8b on 2026-09-21.
  transport: http(env.ALCHEMY_URL, { batch: false, retryCount: 5, retryDelay: 1000, timeout: 90_000 }),
});

// Topic0s computed from fragments — a pasted literal is a claim nobody can
// check against the ABI it came from.
const TRANSFER = toEventSelector(
  parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"),
);
const DEPOSIT = toEventSelector(
  parseAbiItem("event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)"),
);
const WITHDRAW = toEventSelector(
  parseAbiItem(
    "event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)",
  ),
);
const COOLDOWN = toEventSelector(
  parseAbiItem(
    "event StakerCooldownUpdated(address indexed user, uint256 amount, uint256 endOfCooldown, uint256 unstakeWindow)",
  ),
);
const SLASHED = toEventSelector(parseAbiItem("event Slashed(address indexed destination, uint256 amount)"));
const STAKE_TOKEN_SLASHED = toEventSelector(
  parseAbiItem(
    "event StakeTokenSlashed(address indexed reserve, address indexed umbrellaStake, uint256 amount, uint256 fee)",
  ),
);
const TARGET_RATE = toEventSelector(parseAbiItem("event TargetRateUpdated(uint256 newRate)"));
const EXCHANGE_RATE = toEventSelector(
  parseAbiItem("event ExchangeRateUpdated(uint256 timestamp, uint256 currentRate)"),
);

const VAULT_ABI = parseAbi([
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function asset() view returns (address)",
  "function balanceOf(address) view returns (uint256)",
  "function maxRedeem(address) view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function getStakerCooldown(address) view returns ((uint192 amount, uint32 endOfCooldown, uint32 withdrawalWindow))",
]);
const ERC20_ABI = parseAbi(["function decimals() view returns (uint8)", "function symbol() view returns (string)"]);

let failures = 0;
let passes = 0;
let skipped = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (cond) passes++;
  else failures++;
};
const skip = (name, why) => {
  console.log(`SKIP  ${name} — ${why}`);
  skipped++;
};

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const pad32 = (a) => `0x${"0".repeat(24)}${a.toLowerCase().replace(/^0x/, "")}`;
const tailOf = (t) => (t ? `0x${t.slice(26)}`.toLowerCase() : ZERO_ADDR);
const hex = (n) => `0x${BigInt(n).toString(16)}`;

// ── the section's own print rules, restated so a change to them goes red ────
const exactUnits = (raw, decimals) => {
  const s = String(raw).padStart(decimals + 1, "0");
  const cut = s.length - decimals;
  return (s.slice(0, cut) + "." + s.slice(cut)).replace(/\.?0+$/, "");
};
/** components/protocol/morpho-base/vault-exposure-parts.tsx `shareText`. */
const shareText = (raw, decimals) => {
  const value = Number(raw) / Math.pow(10, decimals);
  const text = value.toLocaleString("en-US", { maximumFractionDigits: 6 });
  return value !== 0 && parseFloat(text.replace(/,/g, "")) === 0 ? exactUnits(raw, decimals) : text;
};
/** …`lib/shared/format-event.ts` shortDate + shortDateYear: en-GB, UTC. */
const dayPrefix = (unix) =>
  `${new Date(unix * 1000).toLocaleDateString("en-GB", { timeZone: "UTC", month: "short", day: "numeric" })} '${String(
    new Date(unix * 1000).getUTCFullYear(),
  ).slice(-2)}`;
const dayKey = (unix) => new Date(unix * 1000).toISOString().slice(0, 10);

// ── this script's own chain reads ───────────────────────────────────────────

// ⚠️ THE LANE'S ERRORS CARRY ITS URL, key and all, and viem prints the whole
// endpoint in every error it throws. So the terminal handlers scrub anything
// URL-shaped, the lane is named by env var NAME only, and a throw ends the run
// with one FAILED line and exit 1 rather than a stack trace with a key in it
// (the same guard verify-base-vault-position-page.mjs carries).
const scrub = (text) => String(text).replace(/https?:\/\/[^\s"'`)}\]]+/g, "<lane URL redacted>");
for (const signal of ["uncaughtException", "unhandledRejection"])
  process.on(signal, (error) => {
    console.error(`\nFAILED (${signal}) — ${scrub(error?.stack ?? error?.message ?? error)}`);
    process.exit(1);
  });

/** A whole-life `eth_getLogs`, waited through a 429. Measured 2026-09-19: the
 *  sweep that follows a heavy route read answers 429 on compute units for
 *  several seconds, and viem's three retries 150 ms apart all land inside it —
 *  which ended two runs mid-way. Five attempts, 3 s doubling. */
async function getLogs(address, topics, toBlock) {
  const params = [{ address, topics, fromBlock: "0x0", toBlock: hex(toBlock) }];
  let wait = 3000;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(env.ALCHEMY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: attempt, method: "eth_getLogs", params }),
    });
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 5) throw new Error(`eth_getLogs on ALCHEMY_URL: HTTP ${res.status} after ${attempt} attempts`);
      await new Promise((r) => setTimeout(r, wait));
      wait *= 2;
      continue;
    }
    const json = await res.json();
    if (json.error) throw new Error(`eth_getLogs on ALCHEMY_URL: ${scrub(json.error.message ?? "refused")}`);
    return json.result;
  }
}

const word = (data, i) => BigInt(`0x${data.slice(2 + i * 64, 2 + (i + 1) * 64)}`);

/** Rebuild one holder's whole timeline from this script's own reads, at the
 *  block the PAGE stated. Nothing here consults the page. */
async function ownTimeline(vault, holder, blockNumber) {
  const who = holder.toLowerCase();
  const [out, into, dep, wit, cool] = await Promise.all([
    getLogs(vault, [TRANSFER, pad32(who), null], blockNumber),
    getLogs(vault, [TRANSFER, null, pad32(who)], blockNumber),
    getLogs(vault, [DEPOSIT, null, pad32(who)], blockNumber),
    getLogs(vault, [WITHDRAW, null, null, pad32(who)], blockNumber),
    getLogs(vault, [COOLDOWN, pad32(who)], blockNumber).catch(() => []),
  ]);
  const seen = new Set();
  const transfers = [...out, ...into]
    .filter((l) => {
      const k = `${l.transactionHash}:${l.logIndex}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) =>
      BigInt(a.blockNumber) === BigInt(b.blockNumber)
        ? Number(BigInt(a.logIndex) - BigInt(b.logIndex))
        : BigInt(a.blockNumber) < BigInt(b.blockNumber)
          ? -1
          : 1,
    );

  const decimals = Number(
    await client.readContract({ address: vault, abi: VAULT_ABI, functionName: "decimals", blockNumber }),
  );
  const assetAddr = await client.readContract({
    address: vault,
    abi: VAULT_ABI,
    functionName: "asset",
    blockNumber,
  });
  const assetDecimals = Number(
    await client.readContract({ address: assetAddr, abi: ERC20_ABI, functionName: "decimals", blockNumber }),
  );
  const onChain = await client.readContract({
    address: vault,
    abi: VAULT_ABI,
    functionName: "balanceOf",
    args: [getAddress(who)],
    blockNumber,
  });

  let replayed = BigInt(0);
  for (const l of transfers) {
    const value = BigInt(l.data);
    if (tailOf(l.topics[2]) === who) replayed += value;
    if (tailOf(l.topics[1]) === who) replayed -= value;
  }

  // Row blocks: every transfer's, plus every stand-alone cooldown's.
  const transferTxs = new Set(transfers.map((l) => l.transactionHash));
  const loneCooldowns = cool.filter((l) => !transferTxs.has(l.transactionHash));
  const blocks = [...new Set([...transfers, ...loneCooldowns].map((l) => BigInt(l.blockNumber).toString()))].map((b) =>
    BigInt(b),
  );
  const one = BigInt(10) ** BigInt(decimals);
  const meta = new Map();
  for (const b of blocks) {
    const [blk, price] = await Promise.all([
      client.getBlock({ blockNumber: b }),
      client.readContract({
        address: vault,
        abi: VAULT_ABI,
        functionName: "convertToAssets",
        args: [one],
        blockNumber: b,
      }),
    ]);
    meta.set(b.toString(), { timestamp: Number(blk.timestamp), price: price.toString() });
  }

  const legs = [...dep, ...wit].map((l) => ({
    tx: l.transactionHash,
    assets: word(l.data, 0),
    shares: word(l.data, 1),
    taken: false,
  }));
  const claim = (tx, shares) => {
    const hit = legs.find((l) => !l.taken && l.tx === tx && l.shares === shares);
    if (!hit) return null;
    hit.taken = true;
    return hit.assets.toString();
  };

  const rows = [];
  let balance = BigInt(0);
  for (const l of transfers) {
    const from = tailOf(l.topics[1]);
    const to = tailOf(l.topics[2]);
    const value = BigInt(l.data);
    let delta = BigInt(0);
    if (to === who) delta += value;
    if (from === who) delta -= value;
    balance += delta;
    const kind =
      from === who && to === who
        ? "transfer-self"
        : from === ZERO_ADDR
          ? "deposit"
          : to === ZERO_ADDR
            ? "withdrawal"
            : to === who
              ? "transfer-in"
              : "transfer-out";
    const key = BigInt(l.blockNumber).toString();
    rows.push({
      id: `${l.transactionHash}:${Number(BigInt(l.logIndex))}`,
      txHash: l.transactionHash,
      blockNumber: Number(BigInt(l.blockNumber)),
      logIndex: Number(BigInt(l.logIndex)),
      timestamp: meta.get(key).timestamp,
      kind,
      counterparty:
        kind === "deposit" || kind === "withdrawal" || kind === "transfer-self" ? null : to === who ? from : to,
      sharesDelta: delta.toString(),
      balanceAfter: balance.toString(),
      assets: kind === "deposit" || kind === "withdrawal" ? claim(l.transactionHash, value) : null,
      sharePriceAtBlock: meta.get(key).price,
      cooldowns: cool
        .filter((c) => c.transactionHash === l.transactionHash)
        .map((c) => ({ amount: word(c.data, 0).toString(), endOfCooldown: Number(word(c.data, 1)) })),
    });
  }
  // A stand-alone cooldown carries the balance of the last TRANSFER before it.
  // Searched over the transfer rows alone: `rows` gains the cooldown rows as
  // this loop pushes them, so with two lone cooldowns and a transfer between
  // them the last match in `rows` was the earlier cooldown, carrying the
  // balance from before that transfer (3b red on stkwaEthUSDC, 2026-09-21:
  // page 1,506,969.288427 vs own 123,623.929563 at blk 26024294).
  const transferRows = rows.slice();
  for (const c of loneCooldowns) {
    const blockNumber = Number(BigInt(c.blockNumber));
    const logIndex = Number(BigInt(c.logIndex));
    const key = BigInt(c.blockNumber).toString();
    const before = transferRows.filter(
      (r) => r.blockNumber < blockNumber || (r.blockNumber === blockNumber && r.logIndex < logIndex),
    );
    rows.push({
      id: `${c.transactionHash}:${logIndex}`,
      txHash: c.transactionHash,
      blockNumber,
      logIndex,
      timestamp: meta.get(key).timestamp,
      kind: "cooldown",
      counterparty: null,
      sharesDelta: "0",
      balanceAfter: before.length ? before[before.length - 1].balanceAfter : "0",
      assets: null,
      sharePriceAtBlock: meta.get(key).price,
      cooldowns: [{ amount: word(c.data, 0).toString(), endOfCooldown: Number(word(c.data, 1)) }],
    });
  }
  rows.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
  // Newest first — the order the reader serves and draws, so every per-index
  // comparison below lines this script's own row up against the row on screen.
  // The replay above ran ascending, because a running balance can only be
  // accumulated in the order the chain wrote the logs.
  rows.reverse();

  return {
    decimals,
    assetDecimals,
    logsOut: out.length,
    logsIn: into.length,
    transferCount: transfers.length,
    reconciled: replayed === onChain,
    replayed: replayed.toString(),
    onChain: onChain.toString(),
    rows,
  };
}

// ── the page and the route ──────────────────────────────────────────────────

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 2000 } });

async function readPage(vault, holder, { expandRows = false } = {}) {
  const page = await context.newPage();
  const url = `${BASE}/ethereum/aave/vaults/${vault}${holder ? `/${holder}` : ""}`;
  const res = await page.goto(url, { waitUntil: "networkidle" });
  const status = res?.status() ?? 0;
  if (status !== 200) {
    await page.close();
    return { url, status };
  }
  const attr = async (sel, name) => {
    const el = page.locator(sel);
    return (await el.count()) ? el.first().getAttribute(name) : null;
  };
  const text = async (sel) => {
    const el = page.locator(sel);
    return (await el.count()) ? (await el.first().innerText()).replace(/\s+/g, " ").trim() : null;
  };
  const blockNumber = Number(await attr("[data-vault-block]", "data-vault-block"));
  const rowCountAttr = await attr("[data-vault-timeline-rows]", "data-vault-timeline-rows");
  // On a life cut to the draw window: the life it was cut from, and the
  // toolbar's count line ("7,958 events · loaded 1 Jul 2026 to 25 Sept 2026",
  // decision 0019 §3 as its 2026-09-24 amendment left it).
  const rowCountOf = await attr("[data-vault-timeline-rows]", "data-vault-timeline-of");
  // ⚠️ READ WHOLE, NOT MATCHED. Until 2026-09-25 the line was pulled out of
  // the toolbar with a regex for the retired "Showing 1,000 of 7,882 events"
  // form, so when that form went it read ABSENT and 1f2 failed on a page that
  // was right. A regex that selects the shape it is about to assert cannot
  // tell a changed line from a missing one. The line has its own element.
  const countLineText = await text(
    "[data-vault-timeline-rows] [data-skel-section='detail-timeline-header'] [data-prov-exempt] span.text-xs.tabular-nums",
  );
  // ⚠️ EVENT HEADERS ONLY. Since 2026-09-20 the vault's own notes sit AMONG
  // these rows (ChainTruthTimeline's `notes` prop), and a note's header panel
  // carries `role="button"` exactly as a card's does. Counting one as a row
  // here would make every row-count check below read a note as an event, which
  // is the one thing the notes prop exists to prevent.
  const heads = page.locator("[data-vault-timeline-rows] [role='button']");
  const eventHeadIdx = await heads.evaluateAll((els) =>
    els.map((e, i) => (e.closest("[data-market-note]") ? -1 : i)).filter((i) => i >= 0),
  );
  const domRows = eventHeadIdx.length;
  const headerTexts = await heads.evaluateAll((els) =>
    els.filter((e) => !e.closest("[data-market-note]")).map((e) => e.innerText.replace(/\s+/g, " ").trim()),
  );
  // The note rows as the page actually drew them, in DOM order, each with the
  // id of the event row it sits under — a note is placed by block and renders
  // immediately AFTER its anchor in a newest-first list, so the pair is what
  // "at its block position" means on screen.
  const noteRows = await page.locator("[data-vault-timeline-rows] [data-market-note]").evaluateAll((els) =>
    els.map((e) => {
      let prev = e.previousElementSibling;
      while (prev && !prev.querySelector("[data-event-id]")) prev = prev.previousElementSibling;
      const anchor = prev?.querySelector("[data-event-id]") ?? e.parentElement?.querySelector("[data-event-id]");
      return {
        id: e.getAttribute("data-market-note") ?? "",
        text: e.innerText.replace(/\s+/g, " ").trim(),
        after: anchor?.getAttribute("data-event-id") ?? null,
      };
    }),
  );
  if (expandRows) {
    for (let i = 0; i < domRows; i++) {
      try {
        await heads.nth(i).click({ force: true, timeout: 4000 });
      } catch {
        /* a row that would not open is caught by the tripwire count below */
      }
    }
    await page.waitForTimeout(900);
  }
  // THE TYPE FILTER'S OWN OPTIONS. Read by opening the dropdown and closing it
  // again — the options are not in the DOM until it opens, and the one thing
  // this check is for (a note kind offered as a selectable event type) is only
  // visible there.
  let filterOptionText = "";
  try {
    const typeButton = page.locator("[data-vault-timeline-rows] button[aria-label='Types of event']");
    if (await typeButton.count()) {
      await typeButton.first().click({ force: true, timeout: 4000 });
      await page.waitForTimeout(200);
      const panel = page.locator("[data-vault-timeline-rows] .overlay-panel");
      filterOptionText = (await panel.count()) ? (await panel.first().innerText()).replace(/\s+/g, " ") : "";
      // CLOSED AGAIN BY THE BUTTON, not by Escape. An open dropdown leaves its
      // per-option counts in the DOM, and the provenance tripwire reads those
      // as uncovered figures — a reading this capture would have manufactured.
      await typeButton.first().click({ force: true, timeout: 4000 });
      await page.waitForTimeout(200);
    }
  } catch {
    /* a dropdown that would not open leaves the text empty, which the check reads as "no note option" */
  }
  const out = {
    url,
    status,
    blockNumber,
    rowCountAttr: rowCountAttr == null ? null : Number(rowCountAttr),
    rowCountOf: rowCountOf == null ? null : Number(rowCountOf),
    countLine: countLineText,
    domRows,
    headerTexts,
    noteRows,
    filterOptionText,
    noteCount: Number((await attr("[data-vault-timeline-notes]", "data-vault-timeline-notes")) ?? 0),
    noteText: await text("[data-vault-timeline-notes]"),
    reconciledText: await text("[data-figure='timeline-reconciled']"),
    unreconciledText: await text("[data-figure='timeline-unreconciled']"),
    horizonText: await text("[data-figure='timeline-horizon']"),
    windowText: await text("[data-figure='timeline-window']"),
    buildingText: await text("[data-figure='timeline-building']"),
    unreadText: await text("[data-figure='timeline-unread']"),
    accrualText: await text("[data-figure='timeline-accrual']"),
    cooldownState: await attr("[data-skel-section='vault-holder']", "data-holder-cooldown-state"),
    maxRedeemRaw: await attr("[data-skel-section='vault-holder']", "data-max-redeem-raw"),
    holderCooldownText: await text("[data-figure='holder-cooldown']"),
    bodyText: (await page.locator("body").innerText()).replace(/\s+/g, " "),
    cardStatus: await attr("[data-position-card]", "data-status"),
    cardValueUsdE8: await attr("[data-position-card]", "data-value-usd-e8"),
    timelineText: (await page.locator("[data-vault-timeline]").count())
      ? (await page.locator("[data-vault-timeline]").first().innerText()).replace(/\s+/g, " ")
      : "",
    // Every SVG geometry inside the timeline, for check 9.
    svgGeometry: await page
      .locator("[data-vault-timeline] path, [data-vault-timeline] polyline, [data-vault-timeline] polygon")
      .evaluateAll((els) => els.map((e) => e.getAttribute("d") || e.getAttribute("points") || "")),
    tripwireBookends: await page.locator("[data-prov-tripwire]").count(),
    uncovered: await page
      .locator("[data-prov-uncovered]")
      .evaluateAll((els) => els.map((e) => e.textContent?.trim().slice(0, 60))),
  };
  await page.close();
  return out;
}

async function readRoute(vault, holder) {
  const res = await fetch(`${BASE}/api/chain/aave-vaults/vault?vault=${vault}&holder=${holder}`);
  if (res.status !== 200) return { status: res.status };
  const json = await res.json();
  return { status: 200, ...json };
}

// ═══ 0: the pages answer, and each states a block near this script's head ═══
const head = await client.getBlockNumber();
const PAGES = new Map();
const ROUTES = new Map();
const OWN = new Map();

// ── this script's own copy of the two render rules the shared timeline applies
// The rows the page PAINTS are no longer one per log: consecutive deposits or
// withdrawals collapse into one folder row (lib/aave-vaults/timeline-runs.tsx)
// and the list is windowed (`WINDOW_CHUNK` in
// components/shared/chain-truth-timeline.tsx). Both are restated here rather
// than read out of the source — an expectation taken from the thing under test
// cannot catch a change to it — and both are applied to THIS SCRIPT's own log
// list, so what is compared against the DOM is still the chain's answer.
// Mirrors TIMELINE_PAGE_ROWS in lib/shared/timeline-opening-balance.ts — move it with it.
const WINDOW_CHUNK = 50;
const MIN_RUN = 3;
// The two transfer kinds collapse too (2026-09-10, the transfer folders), one
// direction to a folder. Re-pinned 2026-09-19 from the page as served: the
// Safe fixture's 23 consecutive sends paint as one row, 8 rows over 34 logs.
const RUN_KINDS = new Set(["deposit", "withdrawal", "transfer-in", "transfer-out"]);
/** This script's own log list, grouped the way the page draws it. */
function ownRows(key) {
  const events = OWN.get(key).rows;
  const out = [];
  let i = 0;
  while (i < events.length) {
    if (!RUN_KINDS.has(events[i].kind)) {
      out.push({ kind: "event", events: [events[i]] });
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < events.length && events[j].kind === events[i].kind) j += 1;
    if (j - i >= MIN_RUN) out.push({ kind: "run", events: events.slice(i, j) });
    else for (let k = i; k < j; k++) out.push({ kind: "event", events: [events[k]] });
    i = j;
  }
  return out;
}
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  PAGES.set(key, await readPage(f.vault, f.holder));
  ROUTES.set(key, await readRoute(f.vault, f.holder));
}

const bad0a = FIXTURES.filter((f) => PAGES.get(`${f.vault}:${f.holder}`).status !== 200);
check(
  "0a every sampled vault page answers 200 on its holder",
  bad0a.length === 0,
  bad0a.length
    ? bad0a
        .map((f) => `${short(f.vault)}?holder=${short(f.holder)} ${PAGES.get(`${f.vault}:${f.holder}`).status}`)
        .join(", ")
    : `${FIXTURES.length} pages`,
);
if (bad0a.length) {
  console.log("\nA page did not answer — nothing below can be judged.");
  await browser.close();
  process.exit(1);
}

const bad0b = FIXTURES.filter((f) => {
  const b = PAGES.get(`${f.vault}:${f.holder}`).blockNumber;
  return !b || Number(head) - b > 40 || b > Number(head) + 4;
});
check(
  "0b each page states a block near this script's own head",
  bad0b.length === 0,
  bad0b.length
    ? bad0b
        .map((f) => `${short(f.vault)} page ${PAGES.get(`${f.vault}:${f.holder}`).blockNumber} vs own head ${head}`)
        .join(", ")
    : `head ${head}`,
);

const bad0c = FIXTURES.filter((f) => {
  const r = ROUTES.get(`${f.vault}:${f.holder}`);
  return r.status !== 200 || !r.timeline || r.timeline.blockNumber !== r.blockNumber;
});
check(
  "0c the API route serves a timeline pinned to the SAME block as its own reading",
  bad0c.length === 0,
  bad0c.length
    ? bad0c
        .map((f) => {
          const r = ROUTES.get(`${f.vault}:${f.holder}`);
          return `${short(f.vault)} reading ${r.blockNumber} vs timeline ${r.timeline?.blockNumber ?? "absent"}`;
        })
        .join(", ")
    : `${FIXTURES.length} routes`,
);

// This script's own rebuild, at the block each ROUTE states. Every expectation
// from here down comes out of these.
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  const r = ROUTES.get(key);
  OWN.set(key, await ownTimeline(f.vault, f.holder, BigInt(r.blockNumber)));
}

// ═══ 1: the gate is real ════════════════════════════════════════════════════
const bad1a = [];
const bad1b = [];
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  const own = OWN.get(key);
  const t = ROUTES.get(key).timeline;
  // Drawn IF AND ONLY IF this script's own replay reconciled.
  const drewRows = t.events.length > 0;
  // Every FIXTURE is a Tier 0 life — small enough to be built and drawn in one
  // request — so `WINDOW` is the right bound here, and a fixture that grew past
  // it would go red rather than quietly changing what this line means.
  const shouldDraw = own.reconciled && own.transferCount <= WINDOW;
  if (drewRows !== shouldDraw)
    bad1a.push(
      `${short(f.vault)}/${short(f.holder)}: page drew ${t.events.length} rows, own gate ${own.reconciled ? "PASSED" : "FAILED"} (${own.transferCount} logs)`,
    );
  if (t.reconcile?.replayed !== own.replayed || t.reconcile?.onChain !== own.onChain)
    bad1b.push(
      `${short(f.vault)}/${short(f.holder)}: page replayed ${t.reconcile?.replayed} vs own ${own.replayed}; page balanceOf ${t.reconcile?.onChain} vs own ${own.onChain}`,
    );
}
check(
  "1a the page drew a timeline if and only if this script's own replay reconciled",
  bad1a.length === 0,
  bad1a.join(" | ") || `${FIXTURES.length} fixtures`,
);
check(
  "1b both gate figures wei-exact against this script's own replay and its own balanceOf",
  bad1b.length === 0,
  bad1b.join(" | ") || `${FIXTURES.length} fixtures`,
);

const bad1c = FIXTURES.filter((f) => {
  const own = OWN.get(`${f.vault}:${f.holder}`);
  const t = ROUTES.get(`${f.vault}:${f.holder}`).timeline;
  return t.reconcile?.logsOut !== own.logsOut || t.reconcile?.logsIn !== own.logsIn;
});
check(
  "1c the page's own log counts, both directions, equal this script's own sweeps",
  bad1c.length === 0,
  bad1c.length
    ? bad1c
        .map((f) => {
          const own = OWN.get(`${f.vault}:${f.holder}`);
          const t = ROUTES.get(`${f.vault}:${f.holder}`).timeline;
          return `${short(f.vault)}: page ${t.reconcile?.logsOut}/${t.reconcile?.logsIn} vs own ${own.logsOut}/${own.logsIn}`;
        })
        .join(", ")
    : "5 fixtures",
);

const bad1d = FIXTURES.filter((f) => {
  const p = PAGES.get(`${f.vault}:${f.holder}`);
  const own = OWN.get(`${f.vault}:${f.holder}`);
  const said = own.reconciled ? p.reconciledText : p.unreconciledText;
  if (!said) return true;
  return !said.includes(shareText(own.replayed, own.decimals)) || !said.includes(shareText(own.onChain, own.decimals));
});
check(
  "1d the page STATES both figures on its face, in this section's own print rule",
  bad1d.length === 0,
  bad1d.length
    ? bad1d
        .map((f) => {
          const own = OWN.get(`${f.vault}:${f.holder}`);
          return `${short(f.vault)}: expected "${shareText(own.replayed, own.decimals)}" and "${shareText(own.onChain, own.decimals)}"`;
        })
        .join(" | ")
    : "5 fixtures",
);

/** A heavy life's SPINE, from this script's own two sweeps and nothing else:
 *  how many of its own `Transfer` logs there are, and their ids newest first.
 *
 *  `ownTimeline` above reads a timestamp and an archive share price at every
 *  distinct block, one after another — right for a five-row fixture and fifteen
 *  minutes for an eight-thousand-block one, and none of those figures is what
 *  the two checks below are about. They are about a COUNT, a WINDOW and which
 *  row sits at the top, and all three are in the logs. */
async function ownHeavySpine(vault, holder, blockNumber) {
  const who = holder.toLowerCase();
  const [out, into] = await Promise.all([
    getLogs(vault, [TRANSFER, pad32(who), null], blockNumber),
    getLogs(vault, [TRANSFER, null, pad32(who)], blockNumber),
  ]);
  const seen = new Set();
  const rows = [...out, ...into]
    .filter((l) => {
      const k = `${l.transactionHash}:${l.logIndex}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((l) => ({
      id: `${l.transactionHash}:${Number(BigInt(l.logIndex))}`,
      blockNumber: Number(BigInt(l.blockNumber)),
      logIndex: Number(BigInt(l.logIndex)),
    }))
    // NEWEST FIRST, the order the reader serves in.
    .sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);
  return { transferCount: rows.length, rows };
}

// ── the two heavy paths, each exercised on a real address ───────────────────
// Tier 1 (above WINDOW, at or below CEILING): built into the store across
// visits and drawn windowed. Tier 2 (above CEILING): withheld with the count.
// ONE request each, so Tier 1 is asserted as "either mid-build or drawn" —
// which of the two it is depends on what earlier runs already stored, and the
// visit-by-visit progress is verify-ethereum-vault-position-page.mjs's T5b.
const hRoute = await readRoute(HEAVY.vault, HEAVY.holder);
const hPage = await readPage(HEAVY.vault, HEAVY.holder);
// ONE SWEEP, to whichever of the route's and the page's blocks is later: this
// life takes a row most hours, so each is then held to this script's own rows
// at or below ITS OWN block (`ownRowsAt`).
const hOwn =
  hRoute.status === 200
    ? await ownHeavySpine(HEAVY.vault, HEAVY.holder, BigInt(Math.max(hRoute.blockNumber, hPage.blockNumber || 0)))
    : null;
const ownRowsAt = (own, block) => own.rows.filter((r) => r.blockNumber <= block);
if (!hOwn) {
  skip(
    "1e a heavy life: built into the store across visits, then drawn windowed",
    `the API route answered ${hRoute.status}`,
  );
} else if (hOwn.transferCount <= WINDOW || hOwn.transferCount > CEILING) {
  // NOT a skip: the fixture was chosen for a size it no longer has, so every
  // check resting on it would be green-but-vacuous.
  check(
    "1e the heavy fixture is still between the window and the ceiling — a fixture that moved tier is a stale fixture",
    false,
    `${short(HEAVY.holder)} on ${short(HEAVY.vault)}: ${hOwn.transferCount} of its own Transfer logs, wanted ${WINDOW + 1}–${CEILING}`,
  );
} else if (!hRoute.timeline) {
  // A 200 with `timeline: null` is a route that read nothing; every line below
  // would throw on it, and a throw is a CRASH where a red check is wanted.
  check("1e a heavy life: the route serves a timeline", false, "status 200, timeline null");
} else {
  const t = hRoute.timeline;
  const building = t.history?.building ?? null;
  const drawn = t.coverage.drawn ?? null;
  // A heavy life is never WITHHELD, whichever of the two states it is in.
  check(
    "1e a heavy life is either being built into the store or drawn windowed — never withheld",
    t.coverage.withheldAbove === null && t.reconcile?.reconciled === true && (building != null || drawn != null),
    `own ${hOwn.transferCount} logs; withheldAbove ${t.coverage.withheldAbove}, reconciled ${t.reconcile?.reconciled}, building ${JSON.stringify(building)}, drawn ${JSON.stringify(drawn)}`,
  );
  if (building) {
    check(
      "1f mid-build: no rows, a cut at or below this script's own count, and the page says so",
      t.events.length === 0 &&
        building.totalRows === ownRowsAt(hOwn, hRoute.blockNumber).length &&
        building.keptRows > 0 &&
        building.keptRows <= building.totalRows &&
        building.keptCut > 0 &&
        (hPage.buildingText ?? "").includes(building.keptRows.toLocaleString("en-US")) &&
        hPage.domRows === 0,
      `${t.events.length} rows drawn, kept ${building.keptRows} of ${building.totalRows} at block ${building.keptCut}; page "${(hPage.buildingText ?? "").slice(0, 110)}"`,
    );
  } else if (drawn) {
    // Neither state is 1e's red line above, and there is nothing here to read.
    // THE WINDOW IS THIS SCRIPT'S OWN ARITHMETIC over its own logs: the newest
    // `DRAW_ROWS` of a life it counted itself, the FIRST row the newest log its
    // own sweep found, and the cut at the block of its own DRAW_ROWS-th newest.
    // A window computed off the page could not catch a window taken from the
    // wrong end. `ownHeavySpine` returns NEWEST FIRST, so the newest is index 0.
    const routeRows = ownRowsAt(hOwn, hRoute.blockNumber);
    const wantRows = Math.min(DRAW_ROWS, routeRows.length);
    const newest = routeRows[0];
    const oldestDrawn = routeRows[wantRows - 1];
    const omittedStated = (drawn.summary?.byType ?? []).reduce((a, b) => a + b.count, 0);
    check(
      "1f drawn: the newest DRAW_ROWS of this script's own life, its own count stated, the newest row at the top, and a cut summary that counts every row behind it",
      t.events.length === wantRows &&
        drawn.rows === wantRows &&
        drawn.of === routeRows.length &&
        t.events[0].id === newest.id &&
        t.events[t.events.length - 1].id === oldestDrawn.id &&
        drawn.cutBlock === oldestDrawn.blockNumber &&
        omittedStated === routeRows.length - wantRows,
      `page ${t.events.length} rows, drawn ${JSON.stringify({ ...drawn, summary: undefined })}, summary counts ${omittedStated}; own life ${routeRows.length} rows, own newest ${newest.id}, page head ${t.events[0]?.id}, own cut block ${oldestDrawn.blockNumber}`,
    );
    // The window sentence is gone (decision 0019), and since the 2026-09-24
    // amendment so is the "Showing 1,000 of…" count line: the page states the
    // life's total, literally, beside the span its loaded rows cover, and the
    // cap is "never stated to the reader as a number" (rule 2). The window
    // drawn is still on the wrapper, where it is plumbing and not the reader's.
    const pageRows = ownRowsAt(hOwn, hPage.blockNumber);
    const pageWant = Math.min(DRAW_ROWS, pageRows.length);
    const wantHead = `${pageRows.length.toLocaleString("en-US")} events`;
    const gotLine = hPage.countLine ?? "";
    const spanTail = gotLine.startsWith(wantHead) ? gotLine.slice(wantHead.length) : null;
    const namesCap = NAMES_THE_CAP.test(hPage.bodyText ?? "");
    check(
      "1f2 …and the page states the whole life and its loaded span on its face, naming no cap, with the window on the wrapper",
      spanTail !== null &&
        LOADED_SPAN.test(spanTail) &&
        !namesCap &&
        hPage.rowCountAttr === pageWant &&
        hPage.rowCountOf === pageRows.length &&
        hPage.domRows > 0,
      `count line "${hPage.countLine ?? "ABSENT"}", wanted "${wantHead} · loaded <span>"; ` +
        `wrapper ${hPage.rowCountAttr}/${hPage.rowCountOf} (want ${pageWant}/${pageRows.length}); ${hPage.domRows} rows painted` +
        (namesCap ? `; the page names the cap: "${NAMES_THE_CAP.exec(hPage.bodyText)?.[0]}"` : ""),
    );
  }
}

// Tier 2 — above what one stored tail holds. The path the old HORIZON check
// covered, kept alive on a fixture that is actually above the new bound.
const cRoute = await readRoute(CEILING_LIFE.vault, CEILING_LIFE.holder);
const cPage = await readPage(CEILING_LIFE.vault, CEILING_LIFE.holder);
const cOwn =
  cRoute.status === 200
    ? await ownHeavySpine(CEILING_LIFE.vault, CEILING_LIFE.holder, BigInt(cRoute.blockNumber))
    : null;
if (!cOwn) {
  skip("1g above the ceiling the page draws NO rows and states the count", `the API route answered ${cRoute.status}`);
} else if (cOwn.transferCount <= CEILING) {
  check(
    "1g the ceiling fixture is still above the ceiling — a fixture that shrank is a stale fixture",
    false,
    `${short(CEILING_LIFE.holder)} on ${short(CEILING_LIFE.vault)}: ${cOwn.transferCount} of its own Transfer logs, at or below the ${CEILING} ceiling`,
  );
} else {
  check(
    "1g above the ceiling the page draws NO rows, states the count, and still reconciles",
    cRoute.timeline.events.length === 0 &&
      cRoute.timeline.coverage.withheldAbove === cOwn.transferCount &&
      cRoute.timeline.reconcile?.reconciled === true &&
      cRoute.timeline.history?.building == null,
    `own ${cOwn.transferCount} logs; page drew ${cRoute.timeline.events.length} rows, withheldAbove ${cRoute.timeline.coverage.withheldAbove}, reconciled ${cRoute.timeline.reconcile?.reconciled}, building ${JSON.stringify(cRoute.timeline.history?.building ?? null)}`,
  );
  check(
    "1h and it says so on its face, with this script's own count and no partial list",
    (cPage.horizonText ?? "").includes(cOwn.transferCount.toLocaleString("en-US")) && cPage.domRows === 0,
    cPage.horizonText
      ? `"${cPage.horizonText.slice(0, 130)}…" · ${cPage.domRows} rows drawn`
      : "no ceiling statement on the page",
  );
}

// ═══ 2: row count and order ═════════════════════════════════════════════════
const bad2a = [];
const bad2b = [];
const bad2c = [];
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  const own = OWN.get(key);
  const t = ROUTES.get(key).timeline;
  const p = PAGES.get(key);
  if (t.events.length !== own.rows.length)
    bad2a.push(`${short(f.vault)}/${short(f.holder)}: page ${t.events.length} rows vs own ${own.rows.length}`);
  // DESCENDING — newest first. Asserted on the API's own array; checks 2c, 4e
  // and 10b then hold the DOM to the same order, so the two cannot disagree.
  const ordered = t.events.every(
    (e, i) =>
      i === 0 ||
      e.blockNumber < t.events[i - 1].blockNumber ||
      (e.blockNumber === t.events[i - 1].blockNumber && e.logIndex < t.events[i - 1].logIndex),
  );
  if (!ordered) bad2b.push(`${short(f.vault)}/${short(f.holder)}`);
  // The ATTRIBUTE is the whole life, always — it is the set the gate above
  // reconciled. The PAINTED rows are that life after run collapse, capped by
  // the shared timeline's render window; both are this script's own arithmetic
  // over its own logs, never a figure taken off the page.
  const wantRows = Math.min(WINDOW_CHUNK, ownRows(key).length);
  if (p.rowCountAttr !== own.rows.length || p.domRows !== wantRows)
    bad2c.push(
      `${short(f.vault)}/${short(f.holder)}: DOM ${p.domRows} (attr ${p.rowCountAttr}) vs own ${wantRows} rows over ${own.rows.length} logs`,
    );
}
check("2a the row count equals this script's own log count", bad2a.length === 0, bad2a.join(" | ") || "5 fixtures");
check(
  "2b rows are descending by (block, logIndex) — newest first",
  bad2b.length === 0,
  bad2b.join(", ") || "5 fixtures",
);
check("2c the rendered DOM draws exactly that many rows", bad2c.length === 0, bad2c.join(" | ") || "5 fixtures");

const bad2d = FIXTURES.filter((f) => {
  const own = OWN.get(`${f.vault}:${f.holder}`);
  const t = ROUTES.get(`${f.vault}:${f.holder}`).timeline;
  return t.events.some((e, i) => e.id !== own.rows[i]?.id);
});
check(
  "2d every row is the same log this script read, id by id",
  bad2d.length === 0,
  bad2d.map((f) => short(f.vault)).join(", ") || "5 fixtures",
);

// ═══ 3: every row wei-exact ═════════════════════════════════════════════════
const bad3 = { delta: [], balance: [], assets: [], price: [] };
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  const own = OWN.get(key);
  const t = ROUTES.get(key).timeline;
  for (let i = 0; i < Math.min(t.events.length, own.rows.length); i++) {
    const p = t.events[i];
    const o = own.rows[i];
    const where = `${short(f.vault)}/${short(f.holder)} row ${i} blk ${o.blockNumber}`;
    if (p.sharesDelta !== o.sharesDelta) bad3.delta.push(`${where}: page ${p.sharesDelta} vs own ${o.sharesDelta}`);
    if (p.balanceAfter !== o.balanceAfter)
      bad3.balance.push(`${where}: page ${p.balanceAfter} vs own ${o.balanceAfter}`);
    if ((p.assets ?? null) !== (o.assets ?? null)) bad3.assets.push(`${where}: page ${p.assets} vs own ${o.assets}`);
    if (p.sharePriceAtBlock !== o.sharePriceAtBlock)
      bad3.price.push(`${where}: page ${p.sharePriceAtBlock} vs own ${o.sharePriceAtBlock} (10^${own.decimals})`);
  }
}
check(
  "3a every row's signed share delta wei-exact",
  bad3.delta.length === 0,
  bad3.delta.slice(0, 3).join(" | ") || "every row on 5 fixtures",
);
check(
  "3b every row's replayed balance-after wei-exact",
  bad3.balance.length === 0,
  bad3.balance.slice(0, 3).join(" | ") || "every row on 5 fixtures",
);
check(
  "3c every row's asset leg equals the ERC-4626 event in the SAME transaction",
  bad3.assets.length === 0,
  bad3.assets.slice(0, 3).join(" | ") || "every row on 5 fixtures",
);
check(
  "3d every row's share price equals this script's own convertToAssets(10 ** its own decimals) at that row's block",
  bad3.price.length === 0,
  bad3.price.slice(0, 3).join(" | ") || "every row on 5 fixtures",
);

// The anti-vacuity rule: 3d proves nothing about the decimals trap unless the
// sample spans both decimal classes. If it ever stops spanning them, 3d is
// green-but-vacuous and this says so.
const decimalClasses = new Set(FIXTURES.map((f) => OWN.get(`${f.vault}:${f.holder}`).decimals));
check(
  "3e the sample spans a 6-decimal AND an 18-decimal share token, so 3d's premise holds",
  decimalClasses.has(6) && decimalClasses.has(18),
  `share decimals in the sample: ${[...decimalClasses].sort((a, b) => a - b).join(", ")}`,
);

// ═══ 4: kinds are decided by the zero address ═══════════════════════════════
const bad4a = [];
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  const own = OWN.get(key);
  const t = ROUTES.get(key).timeline;
  for (let i = 0; i < Math.min(t.events.length, own.rows.length); i++)
    if (t.events[i].kind !== own.rows[i].kind)
      bad4a.push(`${short(f.vault)} row ${i}: page "${t.events[i].kind}" vs own "${own.rows[i].kind}"`);
}
check(
  "4a every row's kind equals this script's own zero-address classification",
  bad4a.length === 0,
  bad4a.slice(0, 3).join(" | ") || "every row on 5 fixtures",
);

const bad4b = [];
for (const f of FIXTURES) {
  const own = OWN.get(`${f.vault}:${f.holder}`);
  const kinds = new Set(own.rows.map((r) => r.kind));
  const has = {
    mints: kinds.has("deposit"),
    burns: kinds.has("withdrawal"),
    transfers: kinds.has("transfer-in") || kinds.has("transfer-out"),
    cooldowns: kinds.has("cooldown"),
  };
  for (const [k, want] of Object.entries(f.expect))
    if (want && !has[k]) bad4b.push(`${f.label}: expected ${k}, this script's own read found none`);
}
check(
  "4b each fixture still exercises the branch it was chosen for — a fixture whose shape changed is a stale fixture",
  bad4b.length === 0,
  bad4b.join(" | ") || FIXTURES.map((f) => f.label.split(" / ")[0]).join(", "),
);

// The arms the sample as a whole must reach, or the reader has dead branches.
const allKinds = new Set();
for (const f of FIXTURES) for (const r of OWN.get(`${f.vault}:${f.holder}`).rows) allKinds.add(r.kind);
const wanted4c = ["deposit", "withdrawal", "transfer-in", "transfer-out", "cooldown"];
const missing4c = wanted4c.filter((k) => !allKinds.has(k));
check(
  "4c the sample reaches every row kind the reader draws differently",
  missing4c.length === 0,
  missing4c.length ? `never met: ${missing4c.join(", ")}` : [...allKinds].sort().join(", "),
);
if (!allKinds.has("transfer-self"))
  skip(
    "4d the self-transfer branch (from == to == the holder)",
    "no fixture in this sample has one, and this script's own sweeps found none on any of them — the branch is written and untested rather than wrong; a fixture with one would exercise it",
  );

// The DOM says the same words the kinds do. A lone transfer is a custody row:
// its header carries no action word, it reads "<amount> <token> to 0x1234…abcd"
// (or "from"), so the words held to it are the direction and this script's own
// counterparty, read from its own log's topics. Re-pinned 2026-09-19 from the
// page as served.
const LABELS = {
  deposit: () => "Deposit",
  withdrawal: () => "Withdrawal",
  "transfer-in": (e) => `from ${short(e.counterparty)}`,
  "transfer-out": (e) => `to ${short(e.counterparty)}`,
  "transfer-self": () => "No change",
  cooldown: () => "Cooldown started",
};
const bad4e = [];
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  const p = PAGES.get(key);
  // A collapsed run is one row standing for several, and it wears no action
  // word of its own (its summed verbs say what happened). So the walk is over
  // the ROW list, and the assertion is made on the rows that are single events.
  const rows = ownRows(key);
  for (let i = 0; i < Math.min(p.headerTexts.length, rows.length); i++) {
    if (rows[i].kind === "run") continue;
    const event = rows[i].events[0];
    const want = LABELS[event.kind](event);
    if (!p.headerTexts[i].includes(want))
      bad4e.push(`${short(f.vault)} row ${i}: header "${p.headerTexts[i].slice(0, 40)}" lacks "${want}"`);
  }
}
check(
  "4e each rendered row's action word is the one its own kind names",
  bad4e.length === 0,
  bad4e.slice(0, 3).join(" | ") || "every row on 5 fixtures",
);

// ═══ 5: the Umbrella cooldown spans more than one state ═════════════════════
const STAKE = FIXTURES.filter((f) => f.vault === STK_USDC || f.vault === STK_GHO);
const states = [];
const bad5a = [];
const bad5b = [];
for (const f of STAKE) {
  const key = `${f.vault}:${f.holder}`;
  const p = PAGES.get(key);
  const r = ROUTES.get(key);
  const blockNumber = BigInt(r.blockNumber);
  const blk = await client.getBlock({ blockNumber });
  const [snap, maxRedeem] = await Promise.all([
    client.readContract({
      address: f.vault,
      abi: VAULT_ABI,
      functionName: "getStakerCooldown",
      args: [getAddress(f.holder)],
      blockNumber,
    }),
    client.readContract({
      address: f.vault,
      abi: VAULT_ABI,
      functionName: "maxRedeem",
      args: [getAddress(f.holder)],
      blockNumber,
    }),
  ]);
  const now = Number(blk.timestamp);
  const own =
    snap.endOfCooldown === 0
      ? "none"
      : now < snap.endOfCooldown
        ? "waiting"
        : now <= snap.endOfCooldown + snap.withdrawalWindow
          ? "open"
          : "expired";
  states.push(own);
  if (p.cooldownState !== own)
    bad5a.push(
      `${short(f.vault)}: page "${p.cooldownState}" vs own "${own}" (block ts ${now}, end ${snap.endOfCooldown})`,
    );
  // A zero maxRedeem beside a positive balance must be stated as the cooldown
  // it is, not left to read as an empty balance.
  const balance = BigInt(OWN.get(key).onChain);
  if (
    maxRedeem === BigInt(0) &&
    balance > BigInt(0) &&
    !(p.holderCooldownText ?? "").toLowerCase().includes("cooldown")
  )
    bad5b.push(`${short(f.vault)}: maxRedeem 0 beside ${balance} shares, and no cooldown sentence on the face`);
}
check(
  "5a each stake fixture's cooldown state equals this script's own comparison against the BLOCK's own timestamp",
  bad5a.length === 0,
  bad5a.join(" | ") || states.join(", "),
);
check(
  "5b the sample spans MORE THAN ONE cooldown state, so 5a cannot pass on a page that prints one state for everyone",
  new Set(states).size > 1,
  `states met: ${[...new Set(states)].join(", ")}`,
);
check(
  "5c a zero maxRedeem beside a positive balance is stated as the cooldown it is",
  bad5b.length === 0,
  bad5b.join(" | ") || `${STAKE.length} stake fixtures`,
);

// The cooldown values on the rows are the LOGS' own words.
const bad5d = [];
for (const f of STAKE) {
  const key = `${f.vault}:${f.holder}`;
  const own = OWN.get(key);
  const t = ROUTES.get(key).timeline;
  for (let i = 0; i < Math.min(t.events.length, own.rows.length); i++) {
    const pageCd = t.events[i].extra?.cooldown ?? [];
    const ownCd = own.rows[i].cooldowns;
    if (pageCd.length !== ownCd.length) {
      bad5d.push(`${short(f.vault)} row ${i}: page ${pageCd.length} cooldown log(s) vs own ${ownCd.length}`);
      continue;
    }
    for (let j = 0; j < ownCd.length; j++)
      if (pageCd[j].amount !== ownCd[j].amount || pageCd[j].endOfCooldown !== ownCd[j].endOfCooldown)
        bad5d.push(
          `${short(f.vault)} row ${i}: page ${pageCd[j].amount}@${pageCd[j].endOfCooldown} vs own ${ownCd[j].amount}@${ownCd[j].endOfCooldown}`,
        );
  }
}
check(
  "5d every cooldown carried on a row equals this script's own decode of that transaction's own log",
  bad5d.length === 0,
  bad5d.slice(0, 3).join(" | ") || `${STAKE.length} stake fixtures`,
);

// ═══ 6: the slash row is absent, and for the right reason ═══════════════════
const slashCounts = [];
for (const v of [STK_USDC, STK_GHO]) slashCounts.push([short(v), (await getLogs(v, [SLASHED], head)).length]);
const controllerSlashes = (await getLogs(UMBRELLA, [STAKE_TOKEN_SLASHED], head)).length;
const anySlash = slashCounts.some(([, n]) => n > 0) || controllerSlashes > 0;
check(
  "6a this script's OWN sweeps find no slashing on the sampled stake tokens or on the Umbrella controller",
  !anySlash,
  anySlash
    ? `A SLASHING HAS FIRED — ${slashCounts.map(([v, n]) => `${v}:${n}`).join(", ")}, controller:${controllerSlashes}. The timeline now owes a slash row on every holder of that token, and this check must be rewritten against the real instance.`
    : `${slashCounts.map(([v, n]) => `${v}:${n}`).join(", ")}, controller:${controllerSlashes}`,
);
const bad6b = STAKE.filter((f) =>
  (PAGES.get(`${f.vault}:${f.holder}`).timelineText ?? "").toLowerCase().includes("slash"),
);
check(
  "6b and the page draws no slash row and claims nothing about slashing on the timeline",
  bad6b.length === 0,
  bad6b.map((f) => short(f.vault)).join(", ") || `${STAKE.length} stake fixtures`,
);

// ═══ 7: notes are notes ════════════════════════════════════════════════════
const ownTargetRate = await getLogs(SGHO, [TARGET_RATE], head);
const ownExchangeRate = await getLogs(SGHO, [EXCHANGE_RATE], head);
const sghoKeys = FIXTURES.filter((f) => f.vault === SGHO).map((f) => `${f.vault}:${f.holder}`);
const bad7a = sghoKeys.filter(
  (k) => (ROUTES.get(k).timeline.notes ?? []).filter((x) => x.kind === "target-rate").length !== ownTargetRate.length,
);
check(
  "7a sGHO's TargetRateUpdated appears as a NOTE, with this script's own count",
  bad7a.length === 0,
  bad7a.length
    ? `own ${ownTargetRate.length}, page ${bad7a.map((k) => ROUTES.get(k).timeline.notes.length).join("/")}`
    : `${ownTargetRate.length} notes`,
);
const bad7b = sghoKeys.filter((k) => {
  const notes = ROUTES.get(k).timeline.notes.filter((x) => x.kind === "target-rate");
  return notes.some((note, i) => {
    const own = ownTargetRate[i];
    return note.blockNumber !== Number(BigInt(own.blockNumber)) || note.fields.newRate !== word(own.data, 0).toString();
  });
});
check(
  "7b each note's block and value equal this script's own decode of that log",
  bad7b.length === 0,
  bad7b.length ? bad7b.join(", ") : ownTargetRate.map((l) => `${BigInt(l.blockNumber)}:${word(l.data, 0)}`).join(", "),
);
// The subject here is EXTRA rows — a reader that drew the accrual stream would
// have thousands of them. Deliberately not an equality against this script's own
// count: that is check 2a's job, and duplicating it here made an unrelated break
// redden a check whose name would then have said the wrong thing.
const bad7c = sghoKeys.filter((k) => ROUTES.get(k).timeline.events.length > OWN.get(k).rows.length);
check(
  `7c and the ${ownExchangeRate.length.toLocaleString("en-US")} ExchangeRateUpdated logs this script counts are rows nowhere`,
  bad7c.length === 0 && ownExchangeRate.length > 1000,
  `sGHO rows drawn: ${sghoKeys.map((k) => ROUTES.get(k).timeline.events.length).join(", ")}, none of them an accrual row; ExchangeRateUpdated logs on the vault: ${ownExchangeRate.length}`,
);
// ⚠️ 2026-09-20 — THE NOTES MOVED IN AMONG THE ROWS, AND THIS CHECK MOVED WITH
// THEM. They used to sit in a block of their own above the list, and 7d asked
// that the block existed and said so. They are house note rows now, placed by
// block through `ChainTruthTimeline`'s `notes` prop — which is worth more to a
// reader (they can see WHEN the terms moved against their own events) and is
// worth exactly nothing unless the never-counted guarantee still holds. So 7d
// asks where a note landed, and 7e asks what it moved.
const bad7d = sghoKeys.filter((k) => {
  const p = PAGES.get(k);
  if (p.noteCount !== ownTargetRate.length) return true;
  // Every note the page BUILT that has a row at or after its block renders,
  // and it renders under that row: a note sits after the first event at or
  // past its own block, and a newest-first list puts "after" below.
  if (p.noteRows.length === 0 || p.noteRows.length > p.noteCount) return true;
  return p.noteRows.some((note) => !note.id.startsWith("vault-terms:target-rate:") || note.after == null);
});
check(
  "7d each note is drawn among the rows, under the event at or after its own block",
  bad7d.length === 0,
  bad7d.length
    ? bad7d
        .map((k) => `${short(k.split(":")[1])} built ${PAGES.get(k).noteCount} drew ${PAGES.get(k).noteRows.length}`)
        .join(", ")
    : sghoKeys.map((k) => `${short(k.split(":")[1])}: ${PAGES.get(k).noteRows.length} note row(s) placed`).join(", "),
);
// THE POINT OF THE PROP, ASSERTED RATHER THAN ASSUMED. A note must move no
// count: not the wrapper's row attribute, not the toolbar's own count line, not
// the number of event headers the page painted, and not the type filter's
// options — a note kind appearing there would make a vault-wide fact
// selectable as if it were one of this address's actions.
const bad7e = sghoKeys.filter((k) => {
  const p = PAGES.get(k);
  const own = OWN.get(k);
  if (p.noteRows.length === 0) return false;
  // The wrapper's own count is the LOADER's row count, unmoved by the notes
  // drawn beside those rows. `domRows` is deliberately NOT compared here: a
  // resting page collapses runs, so it is smaller than the row count for a
  // reason that has nothing to do with notes — and it can no longer count one
  // in any case, since `heads` is scoped to `[data-event-id]`.
  if (p.rowCountAttr !== own.rows.length) return true;
  // The toolbar's own total. It led with "Showing 1,000 of" until the
  // 2026-09-24 amendment and now opens the line; reading it by the retired
  // form left this clause matching nothing, so it judged nought from that day
  // until 2026-09-25.
  const stated = /^(?:at least )?([\d,]+) events\b/.exec(p.countLine ?? "");
  if (stated && Number(stated[1].replace(/,/g, "")) !== own.rows.length) return true;
  // The type filter's options, as the toolbar renders them — no note kind, and
  // no note's own words, may be among them.
  return /vault-terms|target rate/i.test(p.filterOptionText ?? "");
});
check(
  "7e and it moves no count — the row attribute, the toolbar's total and the type filter are what they were without it",
  bad7e.length === 0,
  bad7e.length
    ? bad7e
        // All three arms, because the break test of 2026-09-21 (a note added to
        // the toolbar's total) went red on a line that named only the row
        // attribute, which was right.
        .map(
          (k) =>
            `${short(k.split(":")[1])} rows ${PAGES.get(k).rowCountAttr} vs own ${OWN.get(k).rows.length}, ` +
            `count line "${PAGES.get(k).countLine ?? "ABSENT"}", filter "${(PAGES.get(k).filterOptionText ?? "").slice(0, 80)}"`,
        )
        .join(", ")
    : sghoKeys
        .map((k) => `${short(k.split(":")[1])}: ${OWN.get(k).rows.length} rows, ${PAGES.get(k).noteRows.length} notes`)
        .join(", "),
);

// ═══ 8: one USD figure at most, no APY, no rate of return ══════════════════
// Since mig 206 the position card carries ONE dollar figure — Value · USD,
// the census's oracle read at the census block — so the rule is no longer "no
// dollar figure" but "no dollar figure other than that stat": an open, priced
// card accounts for exactly one, and a closed or unpriced one for none.
const USD_FIGURE_RE = /\$\s?\d[\d,.]*[kMB]?/g;
const USD_SUFFIX_RE = /\b\d[\d,]*(?:\.\d+)?\s?USD\b/;
// A rate of return is a FIGURE wearing a period, so the test is the figure and
// the period together. Two false positives shaped this: "Apr" is a month in the
// section's own en-GB dates, and the sGHO copy contains the word "annualised"
// in the sentence saying it does not annualise — a bare word test would have
// gone red on a page for refusing the exact thing the check exists to forbid,
// which is the least useful kind of red there is.
const RETURN_RE =
  /\d[\d.,]*\s?%?\s?(?:APY|APR)\b|(?:APY|APR)\s?(?:of|:)?\s?\d|\d\s?%\s?(?:a year|per year|annually|annuali[sz]ed)|rate of return|annuali[sz]ed (?:rate|yield|return|figure) of/;
const bad8a = [];
const bad8b = [];
for (const f of FIXTURES) {
  const p = PAGES.get(`${f.vault}:${f.holder}`);
  const figures = p.bodyText.match(USD_FIGURE_RE) ?? [];
  const expected = p.cardStatus === "live" && p.cardValueUsdE8 ? 1 : 0;
  const suffix = p.bodyText.match(USD_SUFFIX_RE);
  if (figures.length !== expected || suffix)
    bad8a.push(
      `${short(f.vault)}/${short(f.holder)}: ${figures.length} dollar figure(s) (${figures.join(", ") || "none"}) for a ${p.cardStatus ?? "?"} card ${p.cardValueUsdE8 ? "with" : "without"} a value${suffix ? `; "${suffix[0]}"` : ""}`,
    );
  const ret = p.bodyText.match(RETURN_RE);
  if (ret) bad8b.push(`${short(f.vault)}/${short(f.holder)}: "${ret[0]}"`);
}
check(
  "8a the only dollar figure on any sampled page is the card's Value · USD stat",
  bad8a.length === 0,
  bad8a.join(", ") || `${FIXTURES.length} pages`,
);
check(
  "8b no APY, no annualised figure and no rate of return",
  bad8b.length === 0,
  bad8b.join(", ") || `${FIXTURES.length} pages`,
);

// ═══ 9: no line chart of share price ═══════════════════════════════════════
// A sparkline of the rows' share prices would put those numbers into an SVG's
// own geometry. This takes every number out of every path/polyline/polygon in
// the timeline and asserts none carries two or more of the row prices.
const bad9 = [];
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  const own = OWN.get(key);
  const p = PAGES.get(key);
  // ⚠️ DISTINCT prices, not one entry per row. A stake token's share price is
  // 1.0 on every row of a fixture, so counting rows made "an icon path contains
  // the number 1" read as "fifty of the rows' prices are in this geometry" —
  // measured 2026-09-08, when the shared toolbar's own lucide icons joined this
  // section and turned the check permanently red on two fixtures. What a
  // sparkline would put in a path is a series of DIFFERENT prices; a flat line
  // through one repeated value is not one, and cannot be told from an icon.
  const prices = [...new Set(own.rows.map((r) => Number(r.sharePriceAtBlock) / Math.pow(10, own.assetDecimals)))];
  for (const geo of p.svgGeometry) {
    const nums = (geo.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const matched = prices.filter((v) => nums.some((x) => Math.abs(x - v) < 1e-6));
    if (matched.length >= 2)
      bad9.push(`${short(f.vault)}: an SVG geometry carries ${matched.length} DISTINCT row share prices`);
  }
}
check(
  "9a no SVG path, polyline or polygon in the timeline carries the rows' share prices — no curve is drawn through them",
  bad9.length === 0,
  bad9.join(" | ") ||
    `${FIXTURES.reduce((a, f) => a + PAGES.get(`${f.vault}:${f.holder}`).svgGeometry.length, 0)} SVG geometries examined, none of them a price series`,
);
const bad9b = FIXTURES.filter((f) => {
  const p = PAGES.get(`${f.vault}:${f.holder}`);
  // A price DIFFERENCE between two rows would be the same claim in words.
  return /price (?:rose|fell|grew|climbed|increased|decreased)|since (?:the|your) (?:first|last) (?:deposit|event)/i.test(
    p.timelineText,
  );
});
check(
  "9b and the copy states no movement between two rows' prices",
  bad9b.length === 0,
  bad9b.map((f) => short(f.vault)).join(", ") || `${FIXTURES.length} pages`,
);

// ═══ 10: locale ════════════════════════════════════════════════════════════
const bad10a = FIXTURES.filter((f) => {
  const own = OWN.get(`${f.vault}:${f.holder}`);
  const p = PAGES.get(`${f.vault}:${f.holder}`);
  return !(p.reconciledText ?? "").includes(shareText(own.replayed, own.decimals));
});
check(
  "10a the reconcile figures print in en-US, judged against this script's own re-format of its own chain read",
  bad10a.length === 0,
  bad10a
    .map(
      (f) =>
        `${short(f.vault)} expected "${shareText(OWN.get(`${f.vault}:${f.holder}`).replayed, OWN.get(`${f.vault}:${f.holder}`).decimals)}"`,
    )
    .join(" | ") || `${FIXTURES.length} pages`,
);
const bad10b = [];
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  const own = OWN.get(key);
  const p = PAGES.get(key);
  // The first row of each UTC day carries the date; it must be this script's
  // own en-GB UTC format of its own block-timestamp read.
  // Same walk as 4e: the date prefix is a property of an EVENT card, and a
  // collapsed run carries a date RANGE instead. The day-grouping itself still
  // runs over the flat event list — the shared timeline computes it there —
  // so a run in the middle does not restart it.
  const rows = ownRows(key);
  for (let i = 0; i < Math.min(p.headerTexts.length, rows.length); i++) {
    if (rows[i].kind === "run") continue;
    const event = rows[i].events[0];
    const flat = own.rows.indexOf(event);
    const prev = flat > 0 ? own.rows[flat - 1] : null;
    if (prev && dayKey(event.timestamp) === dayKey(prev.timestamp)) continue;
    const want = dayPrefix(event.timestamp);
    if (!p.headerTexts[i].includes(want))
      bad10b.push(`${short(f.vault)} row ${i}: header "${p.headerTexts[i].slice(0, 50)}" lacks "${want}"`);
  }
}
check(
  "10b every day-leading row carries its date in en-GB UTC, equal to this script's own format of its own timestamp read",
  bad10b.length === 0,
  bad10b.slice(0, 3).join(" | ") || `${FIXTURES.length} pages`,
);
const bad10c = FIXTURES.filter((f) =>
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(PAGES.get(`${f.vault}:${f.holder}`).timelineText),
);
check(
  "10c no slash-form date anywhere in the timeline",
  bad10c.length === 0,
  bad10c.map((f) => short(f.vault)).join(", ") || `${FIXTURES.length} pages`,
);

// ═══ 11: the dev provenance tripwire ═══════════════════════════════════════
const expanded = new Map();
for (const f of FIXTURES)
  expanded.set(`${f.vault}:${f.holder}`, await readPage(f.vault, f.holder, { expandRows: true }));
const noHolder = await readPage(SGHO, null);

if (![...expanded.values()].some((p) => p.tripwireBookends > 0)) {
  skip(
    "11a the dev provenance tripwire reports no uncovered figure (with a holder)",
    "no tripwire bookends in the DOM — a production build renders none",
  );
} else {
  const bad11a = FIXTURES.filter((f) => expanded.get(`${f.vault}:${f.holder}`).uncovered.length > 0);
  check(
    "11a with a holder, every row expanded: no uncovered figure",
    bad11a.length === 0,
    bad11a.length
      ? bad11a
          .map((f) => `${short(f.vault)}: ${expanded.get(`${f.vault}:${f.holder}`).uncovered.slice(0, 4).join(" · ")}`)
          .join(" | ")
      : `${FIXTURES.length} pages, ${FIXTURES.reduce((a, f) => a + expanded.get(`${f.vault}:${f.holder}`).domRows, 0)} rows expanded`,
  );
  check(
    "11b and with no holder at all: no uncovered figure",
    noHolder.uncovered.length === 0,
    noHolder.uncovered.slice(0, 4).join(" · ") || "no holder, no findings",
  );
}

// ═══ 12: a fixture that has exited is a FAILURE ════════════════════════════
const bad12 = FIXTURES.filter((f) => BigInt(OWN.get(`${f.vault}:${f.holder}`).onChain) <= BigInt(0));
check(
  "12a every fixture still holds a positive balance at the page's own block — an exited fixture makes every check above it vacuous",
  bad12.length === 0,
  bad12.length
    ? bad12.map((f) => `${f.label}: balanceOf ${OWN.get(`${f.vault}:${f.holder}`).onChain}`).join(" | ")
    : FIXTURES.map(
        (f) =>
          `${short(f.holder)} ${shareText(OWN.get(`${f.vault}:${f.holder}`).onChain, OWN.get(`${f.vault}:${f.holder}`).decimals)}`,
      ).join(", "),
);
const bad12b = FIXTURES.filter((f) => OWN.get(`${f.vault}:${f.holder}`).rows.length === 0);
check(
  "12b and every fixture still has a life to draw",
  bad12b.length === 0,
  bad12b.map((f) => f.label).join(" | ") ||
    FIXTURES.map((f) => `${short(f.holder)} ${OWN.get(`${f.vault}:${f.holder}`).rows.length} rows`).join(", "),
);

// ═══ 13: the lane, by name, and the blast radius of moving it ═══════════════
// The plan's Phase D would have moved chain 1's `logsRpcEnv` onto a wide-range
// lane and named three sibling sweeps a missing var would break; measured, every
// route that calls those parametrised sweeps passes a Base chain id, so the only
// serving-path caller of `chainLogsClient` on chain 1 is this timeline's loader.
// The move was declined (2026-09-08) but the bound is worth keeping true: 13c/13d
// hold it mechanically, and 13e states whether the deployment under test has the
// wide lane at all, so a future flip can be judged against a real deployment.
const lanes13 = FIXTURES.map((f) => ROUTES.get(`${f.vault}:${f.holder}`).timeline?.reconcile?.lane).filter(Boolean);
check(
  "13a every drawn timeline names the expected lane, by env var name",
  lanes13.length > 0 && lanes13.every((l) => l === EXPECTED_LANE),
  lanes13.length
    ? `${lanes13.length} timelines: ${[...new Set(lanes13)].join(", ")} (expected ${EXPECTED_LANE})`
    : "no timeline carried a lane",
);
const route13 = ROUTES.get(`${FIXTURES[0].vault}:${FIXTURES[0].holder}`);
check(
  "13b the route states chain 1's serving logs lane, and it is the expected one",
  route13.lanes?.ethereumLogs?.serving === EXPECTED_LANE,
  `serving ${route13.lanes?.ethereumLogs?.serving ?? "(absent)"}, expected ${EXPECTED_LANE}`,
);
const sourceFiles = (dir) =>
  fs
    .readdirSync(path.join(ROOT, dir), { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /\.(ts|tsx)$/.test(d.name))
    .map((d) => path.join(d.parentPath ?? d.path, d.name));
const codeLines = (file) =>
  fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
const chain1Callers = [...sourceFiles("lib"), ...sourceFiles("app")]
  .filter((file) => codeLines(file).some((l) => /chainLogsClient\((\)|1\b|MAINNET_CHAIN_ID)/.test(l)))
  .map((file) => path.relative(ROOT, file))
  .sort();
check(
  "13c the only serving-path caller of chainLogsClient on chain 1 is this timeline's loader",
  chain1Callers.length === 1 && chain1Callers[0] === "lib/sources/chain/aave-ethereum-vault-timeline.ts",
  chain1Callers.join(", ") || "no caller at all",
);
const sweepRoutes = sourceFiles("app/api").filter((file) => codeLines(file).some((l) => /EventsFromChain\(/.test(l)));
const routes13d = sweepRoutes
  .filter((file) => codeLines(file).some((l) => /MAINNET_CHAIN_ID|chainId:\s*1\b/.test(l)))
  .map((file) => path.relative(ROOT, file));
check(
  "13d no API route passes chain 1 into a parametrised event sweep",
  sweepRoutes.length > 0 && routes13d.length === 0,
  routes13d.join(", ") || `${sweepRoutes.length} sweep routes, all on other chains`,
);
if (route13.lanes?.ethereumLogs?.wideLaneConfigured !== true)
  skip(
    "13e the wide-range lane is configured on the deployment under test",
    `${route13.lanes?.ethereumLogs?.wideLaneVar ?? "ETHEREUM_LOGS_RPC_URL"} is not set there — Phase D's flip must wait for it`,
  );
else
  check(
    "13e the wide-range lane is configured on the deployment under test",
    route13.lanes.ethereumLogs.wideLaneVar === "ETHEREUM_LOGS_RPC_URL",
    `${route13.lanes.ethereumLogs.wideLaneVar} set (name only; the value is never read here)`,
  );

await browser.close();
console.log(`\n${passes}/${passes + failures} checks passed${skipped ? ` · ${skipped} SKIP` : ""}`);
process.exit(failures ? 1 : 0);
