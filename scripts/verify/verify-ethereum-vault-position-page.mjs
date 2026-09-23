#!/usr/bin/env node
// The vault POSITION page — the card, the lifetime flows, and a history half of
// which is read at a finalized block and kept. /ethereum/aave/vaults/<vault>/<holder>
// ----------------------------------------------------------------------------
// EVERY EXPECTED FIGURE HERE IS THIS SCRIPT'S OWN CHAIN READ. It makes its own
// whole-`Transfer` sweep of each fixture's life to the block the page states,
// its own `balanceOf`, its own `convertToAssets`, and its own
// `eth_getBlockByNumber("finalized")`, and asserts the page's history, the
// store's tail and the tower's six lifetime sums against those. The only things
// taken from the page are the blocks it states, which are T0's own subject.
//
// A STORE CANNOT BE CHECKED AGAINST ITSELF. T2 does not ask the store whether
// its rows are right: it re-derives the cut's own signed sum from this script's
// own logs and asserts the stored `cutBalance` equals it, that every stored row
// sits at or below the cut, and that the cut is the lane's own `finalized`
// answer rather than a distance behind the head this script picked.
//
// T4 IS PROVEN BY BREAKING IT. The store's promise is that a value which does
// not add up is refused — so T4a SENDS an off-by-one body and reads the 422.
// A check that merely asked whether a good body was accepted would be green on
// a store with no validation at all (memory `verifier-cannot-fail-traps` #8).
// T4b then stores a SELF-CONSISTENT tail with one real row removed and asserts
// the page's own gate fails on it: both figures stated, no rows, no tower. The
// next load must re-sweep whole and store a fresh tail — which is the claim
// "a tail can make a page slow, never wrong", made testable.
//
// Run:
//   BASE=http://localhost:3762 node scripts/verify/verify-ethereum-vault-position-page.mjs
// Needs ALCHEMY_URL in .env.local (read, never printed). One `next dev` at a
// time: two verifiers against one server produce a spurious 500.
//
// ── 2026-09-08 · THE POSITION HAS A PATH ───────────────────────────────────
// `pageUrl` is `/ethereum/aave/vaults/<vault>/<holder>`; the bare vault page is the
// market view. T6a's target is unchanged and the page came in at 447 words
// (was 594) once the four stat tiles that repeated the card were removed.
// 56/56, unchanged.
//
// ── WHAT EACH SECTION ASSERTS ────────────────────────────────────────────────
//   T0  F2's page answers 200 and the route's JSON carries `history`
//   T1  the cold path: `?tail=0` reports source "chain", and every row is
//       wei-exact against this script's own replay of its own sweeps
//   T2  the store happened: the tail the proxy serves has a cut equal to the
//       lane's own `finalized`, every row at or below it, ascending, and a
//       `cutBalance` equal to this script's own Σ deltas at that cut
//   T3  the warm path: source "stored+head", tailRows + headRows equals this
//       script's own log count, the log facts of every row are identical to
//       T1's, and the page states the split in its own DOM
//   T4  the tail cannot lie — the off-by-one body is REFUSED 422, and a
//       self-consistent tail missing one real row fails the page's gate
//   T5  the heavy lives — the cold path still withholds (T5a); F6 and MILES
//       build into the store across visits, each visit advancing the stored
//       cut, and then draw their newest 1,000 rows with the cut summarised
//       and the tower over the WHOLE life (T5b/T5c); above the ceiling the
//       rows are withheld and no tail is stored (T5d); a Tier 0 life above the
//       window is cut to it the same way and never states a build (T5e); and
//       no tail the store holds for any fixture carries an unread share price
//       (T5f, with T2l and T3f — rails-ops TO-DO-infra §5.13)
//   T6  the page's visible words: ≤ 600 with a holder, ≤ 450 without, and the
//       family mechanic prose is in the intro drawer
//   T7  the tower: six lifetime sums against this script's own, the same split
//       again in the figures the BARS are drawn from, the claim now against
//       this script's own `convertToAssets`, the asset-less rows counted
//   T8  regression: the two shipped vault verifiers still pass unchanged
//   T9  the card on the page is the listing's card, in its detail render
//   10  the fixtures still are what the checks above assume they are
//
// ── FIXTURES (plan §5), AS INPUTS ───────────────────────────────────────────
//   F2  stkwaEthUSDC.v1 / 0xdd62… — 8 rows, a cooldown row, a live wallet
//   F5  waEthWETH / 0xaafd… — 3,942 rows, the largest life under the horizon
//       and the warm path's own fixture
//   F6  waEthUSDC / 0x6bf1… — 9,021 rows, a TIER 1 life: built into the store
//       across visits and then drawn windowed
//   MILES  waEthUSDT / 0xa484… — 8,319 rows over 8,292 distinct blocks, the
//       page that prompted the 2026-09-09 change and the second Tier 1 fixture
//   CEILING_LIFE  waEthUSDC / 0xce6c… — 17,774 rows, above what one stored tail
//       holds, so the rows are withheld and the count stated
//   F7  stkwaEthUSDC.v1 / 0xb075… — 180 rows (168 transfers + 12 cooldowns)
//       with long stretches of consecutive daily deposits (33, 31, 17 …). The
//       run-collapse and row-transition fixture; T11a goes RED rather than
//       skipping if it ever stops having runs to collapse.
//   ⚠️ A FIXTURE THAT HAS CHANGED STATE IS A FAILURE, NEVER A SKIP: T-check 10
//   asserts F2 and F5 still hold a positive balance and F6 is still above the
//   horizon, because every check above them rests on it.
//
// ── PROVED IT CAN FAIL, 2026-09-08, BASE=http://localhost:3762 ──────────────
// Restored run: 56/56. Nothing on this path is cached beyond the tail store
// itself, which every break below either wrote or left alone, so no cache had
// to be cleared between them.
//
//  (a) THE STORE SKIPS ITS RE-SUM. The store is the api container on the onboarding box,
//      not this repo, so the break was not applied to it — instead T4a is
//      written so that it can only pass by OBSERVING the refusal: it PUTs a
//      body whose `cutBalance` is one wei above the sum of its own rows and
//      requires 422. Live, this run:
//      → 422 {"error":"Validation error","details":[{"field":"cutBalance",
//        "message":"Σ rows[].sharesDelta (4260382042290) does not equal
//        cutBalance (4260382042291)","code":"SUM_MISMATCH"}]}
//      A store that had dropped the re-sum would answer 200 and T4a would go
//      red — which is the whole reason the check sends a bad body rather than
//      a good one. Sent again with a toy 1-row body during the build, same
//      shape: "Σ rows[].sharesDelta (5) does not equal cutBalance (7)".
//
//  (b) THE LOADER STORES ABOVE `finalized` — `candidateTail(events,
//      opts.blockNumber)` and `cut: opts.blockNumber` in
//      lib/sources/chain/aave-ethereum-vault-timeline.ts, i.e. the page's own
//      block instead of the lane's finality answer. Two runs:
//      55/56 → FAIL T2b — "stored cut 25932781, own finalized 25932698"
//              FAIL T3a — "{"source":"chain","cut":null,"tailRows":0,
//                          "headRows":0,"storedThisRequest":false}"
//      51/52 (T4 SKIP, see below) → FAIL T2b — same line.
//      🔑 T3a going red WITH T2b is the finding, not noise: a tail written
//      above the page's own block is refused by the loader on the next
//      request (`usableTail`), so the break costs the warm path as well as
//      lying about the cut.
//      🔑 T2d stayed GREEN and that is right — it asserts the rows sit at or
//      below the cut the STORE states, and this break moved both together.
//      Only a check with its OWN finality read can see it, which is T2b.
//
//  (c) TRANSFERS SUMMED INTO THE MINTED BAR — `lifetimeInflow: minted +
//      inShares` on the share side in lib/aave-vaults/position-economics.ts.
//      ⚠️ ON THE FIRST ATTEMPT THIS BREAK WAS INVISIBLE: 55/55 green. T7c was
//      reading `data-minted-raw`, which is the REDUCER's sum — untouched by a
//      change to how the feeder buckets it. That is a cannot-fail trap, and
//      T7c2 was written to close it: it reads the figures the BARS are drawn
//      from (`data-tower-*`, taken off the tower data after the bucketing) and
//      compares them to this script's own sums. With T7c2 in place: 55/56.
//      FAIL T7c2 — "minted: bar 98914.90079440468, own 0"
//      🔑 F5 is the fixture for this check precisely because it has 2,975
//      transfers in and no mints at all; on F2, which has mints and no
//      transfers, the two buckets are equal and the break cannot be seen.
//
//  (d) ONE MECHANIC SECTION KEPT ON THE FACE — the Umbrella leading paragraph
//      put back into components/vaults/aave-ethereum-vault-view.tsx above the
//      stake figures. 54/56.
//      FAIL T6a — "F2's page: 673 visible words" (the gate is 600)
//      FAIL T6e — "187 words in the on-face mechanic section"
//      🔑 T6c stayed GREEN, and that is right: the drawer still carries the
//      same prose. An "it is in the drawer" check cannot see a copy left on
//      the face, which is why T6a counts words and T6e names the paragraph.
//
// ── 2026-09-08 · THE UI-ALIGNMENT PASS (audit §4 items 2, 10, 12, 14) ──────
// The rows ride `ChainTruthTimeline` now — toolbar, 50-row render window, run
// collapse — the row detail states `before → after`, the card and the tower
// carry a "?" cell, and the block that restated the holder under the card is
// gone. T11–T13 joined and T12z guards one of them. 56/56 → 68/68.
//
// ── PROVED IT CAN FAIL, 2026-09-08, BASE=http://localhost:3791 (the UI pass) ─
// The rows moved onto `ChainTruthTimeline`, the row detail states a transition,
// and T11–T13 joined. Seven breaks, applied ONE AT A TIME and reverted; the
// exact red lines follow. Every one of them was run to T13 and no further —
// the sections above are untouched by any of these edits.
//
//  (g) THE SHARED SHELL REMOVED — the rows drawn by a plain
//      `tl.displayedEvents.map()` again, as they were before this pass.
//      FAIL T11b — "toolbar present false"
//      FAIL T11c — "page 0 rows (0 runs), own 47 of 47 (13 runs)"
//      FAIL T11e — "own head is a event (deposit @ block 25893678); page head
//                   undefined"
//      FAIL T11f — "0 cards, undefined … undefined"
//      🔑 THIS BREAK FOUND A FAULT IN A CHECK. T11d read "fewer cards are
//      painted than the life has rows" and passed on ZERO cards — green on the
//      worst outcome it exists to catch. It now requires a floor of one, and
//      its name says so.
//
//  (h) THE LIST DRAWN THE WRONG WAY ROUND — `displayedEvents` reversed on the
//      way into the shell.
//      FAIL T11c — "page 47 rows (13 runs), own 47 of 47 (13 runs)" (the counts
//                   agree; the KINDS at each position do not)
//      FAIL T11e — 'page head {"kind":"run","count":33,"member":"deposit"}'
//      FAIL T11f — "34 cards, 23722843 … 25893678"
//      🔑 T11e is the one that reads clearly: oldest-first puts the fixture's
//      33-deposit run at the top, where its newest event is a lone deposit.
//
//  (i) THE TOWER FED THE WINDOW — F7's `VaultFlowsTower` handed
//      `timeline.events.slice(0, 20)`.
//      FAIL T11g — "minted: page null, own 2707879108206 · burned: page null,
//                   own 1151014247969 · …"
//      🔑 `null` rather than a small number, and that is the feeder working:
//      twenty rows do not reconcile against `balanceOf`, so it answers null and
//      the tower does not draw at all. A build that summed a window and DREW it
//      would fail the same check with numbers in it.
//      ⚠️ Scoped to F7 by holder address on purpose: applied to every page it
//      took T7 down with it and the run never reached T11.
//
//  (j) THE ROW STATES THE AFTER-STATE ALONE — `balanceBefore` dropped from this
//      family's prov kit, which is the switch that draws the transition.
//      FAIL T12c — '"1,556,864.860237" (want "1,555,457.706876" →
//                   "1,556,864.860237", 0 arrow glyph(s))'
//      🔑 T12a and T12b stayed GREEN, correctly: the row's data attributes are
//      unaffected: what changed is what a READER sees. The two halves are
//      separate checks for exactly this reason.
//
//  (k) THE BEFORE SIDE COMPUTED WITH THE WRONG SIGN — `balanceAfter +
//      sharesDelta`.
//      FAIL T12a — "before 1558272013598, delta 1407153361, after
//                   1556864860237 (route after 1556864860237, delta
//                   1407153361)"
//      FAIL T12b — "1558272013598 + 1407153361 = 1559679166959 vs
//                   1556864860237"
//      🔑 T12c stayed GREEN — a transition was still DRAWN, with two figures
//      and an arrow. Its subject is the grammar; T12a/b's is the arithmetic.
//
//  (l) A 900px MINIMUM ON THE ROW COLUMN.
//      FAIL T13 — "document.scrollWidth 916 at a 390px viewport (client 390)"
//
//  (m) THE FIXTURE GUARD ITSELF — `MIN_RUN` raised to 999 in THIS SCRIPT, which
//      is what a fixture that had stopped having runs would look like to it.
//      FAIL T11a — "180 rows, own grouping gives 0 runs (longest 0)"
//      FAIL T11c — "page 47 rows (13 runs), own 100 of 180 (0 runs)"
//      🔑 The pair is the point: T11a exists so that a fixture drifting out of
//      shape reads as a FIXTURE failure and not as a mysterious row-count
//      mismatch. Both go red, and the first one names the reason.
//
// ── PROVED IT CAN FAIL, 2026-09-21, BASE=http://localhost:3741 (T5c1, T5c1b, ─
// T5c3, T5e). Four breaks applied TOGETHER, because each moves a figure only its
// own check reads, and the run stopped after T5f. 43/54 · 3 SKIP; restored,
// 50/50 · 7 SKIP (T4b–e inside one epoch, T5b2 on lives already built).
//  (n) `drawn.cutBlock` states the row BELOW the window
//      (lib/shared/vault-holder-timeline.ts). FAIL T5c1 on F6, MILES and FRESH:
//      "cutBlock 25425726 … own cut block 25425841".
//  (o) the cut summary counts one row too few (`omitted` from DRAW_ROWS + 1).
//      FAIL T5c1b on all three: "served transfer-in 6149 … own transfer-in 6150".
//  (p) `data-vault-timeline-of` states the window, not the life
//      (components/vaults/aave-vault-timeline.tsx). FAIL T5c3 on all three:
//      "wrapper 1000/1000", with the count line still right.
//  (q) a Tier 0 life handed over whole, uncut (the aave loader skips
//      `vaultDrawWindow` at or under the horizon). FAIL T5e and T5e2: "4034
//      rows served, drawn null".
//  T5a, T5b, T5c2, T5d and T5f stayed green through all four.
//
// ── A NOTE ON T4's SKIPs ────────────────────────────────────────────────────
// T4b–T4e need to write a poisoned tail at a cut BELOW the correct one the
// loader is about to write, because the store replaces a value only when the
// new cut is HIGHER (a lower one is a 409). Mainnet finality moves once an
// epoch, ≈ 6.4 minutes, so two runs inside one epoch leave no room and T4b–T4e
// SKIP OUT LOUD naming that reason. A run whose T4 skipped has not tested the
// distrust path; wait for the next epoch and run again.
//
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { createPublicClient, http, parseAbi, parseAbiItem, toEventSelector } from "viem";
import { mainnet } from "viem/chains";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = process.env.BASE ?? "http://localhost:3762";

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.ALCHEMY_URL) throw new Error("need ALCHEMY_URL in .env.local");

// ── the fixtures, as INPUTS ─────────────────────────────────────────────────
const F2 = {
  vault: "0x6bf183243fdd1e306ad2c4450bc7dcf6f0bf8aa6",
  holder: "0xdd62115f601daebccfdd2aeed834513d8dc2f4e2",
};
const F5 = {
  vault: "0x0bfc9d54fc184518a81162f8fb99c2eaca081202",
  holder: "0xaafd07d53a7365d3e9fb6f3a3b09ec19676b73ce",
};
const F6 = {
  vault: "0xd4fa2d31b7968e448877f69a96de69f5de8cd23e",
  holder: "0x6bf183243fdd1e306ad2c4450bc7dcf6f0bf8aa6",
};
/** F7 — stkwaEthUSDC.v1 / 0xb075… — 168 transfers plus 12 cooldown rows, and
 *  long stretches of consecutive daily deposits (33, 31, 17 …). The run-collapse
 *  fixture: a life big enough to collapse into runs and small enough to read whole. */
const F7 = {
  vault: "0x6bf183243fdd1e306ad2c4450bc7dcf6f0bf8aa6",
  holder: "0xb0758d59a2206602fe7e5a984b436d45c581feed",
};
/** MILES — waEthUSDT / 0xa484…, 8,319 of its own transfers over 8,292 distinct
 *  blocks on 2026-09-09, and the page that prompted this whole change: it drew
 *  no rows and no tower before the build existed. The address is itself
 *  stkwaEthUSDT.v1, one vault in Aave's layer holding another. */
const MILES = {
  vault: "0x7bc3485026ac48b6cf9baf0a377477fff5703af8",
  holder: "0xa484ab92fe32b143aee7019fc1502b1daa522d31",
};
/** A Tier 1 life that nothing had built when this fixture was chosen —
 *  waEthWETH / 0xba13…, 6,941 transfers over 4,862 DISTINCT BLOCKS on
 *  2026-09-09. The block count is what matters and not the row count: a life is
 *  built a chunk at a time only when its unbuilt BLOCKS pass
 *  `BUILD_BLOCKS_INLINE`, and two of this vault's nine-thousand-row holders sit
 *  under that because their logs cluster a few to a block.
 *
 *  ⚠️ WHY A THIRD ONE. The store is LIVE AND SHARED: once a run has built F6
 *  and MILES whole, every later run finds them drawn on the first visit and
 *  T5b's mid-build progress assertion has nothing to judge. T5b2 says so out
 *  loud rather than passing quietly, and this fixture is the one that was
 *  unbuilt on the day, so the red-first proof of the progress check had a life
 *  to run against. It will be built too, in time; a Tier 1 position nothing has
 *  opened is what BASE should be pointed at to exercise the advance again. */
const T1_FRESH = {
  vault: "0x0bfc9d54fc184518a81162f8fb99c2eaca081202",
  holder: "0xba1333333333a1ba1108e8412f11850a5c319ba9",
};
/** Above the CEILING — waEthUSDC / 0xce6c…, 17,774 transfers on 2026-09-09.
 *  The sweeps answer it whole, which is what makes it a fixture for the
 *  WITHHELD path rather than for the unread one. */
const CEILING_LIFE = {
  vault: "0xd4fa2d31b7968e448877f69a96de69f5de8cd23e",
  holder: "0xce6ced23118edeb23054e06118a702797b13fc2f",
};
/** The two policy figures this page holds to, restated here rather than read out
 *  of the source: an expectation taken from the thing under test cannot catch a
 *  change to it.
 *
 *  `HORIZON` is `VAULT_TIMELINE_HORIZON` — the largest life built and drawn in
 *  one request, and the DRAW WINDOW a longer one is cut to on the way to the
 *  browser (one figure doing both jobs, so a life at or under it is never
 *  windowed). `CEILING` is
 *  `tailMaxRows(1)` — the largest life Rails stores at all on chain 1, above
 *  which the rows are withheld. It is PER CHAIN as of 2026-09-09: an Ethereum
 *  row measured 437.9 bytes in the store against a Base row's 548.9, so the two
 *  no longer share one figure. Both in lib/shared/vault-holder-timeline.ts. */
const HORIZON = 5000;
const CEILING = 14000;
/** THE DRAW WINDOW — `VAULT_TIMELINE_DRAW_ROWS`, the one cut of rails-ops
 *  decision 0019. Re-pinned 2026-09-19 from the route as served: every life
 *  above it, Tier 0 or Tier 1, answers its newest 1,000 rows with
 *  `coverage.drawn` stating the life it was cut from and a summary of the rows
 *  behind the cut. `HORIZON` is still the tier boundary; it stopped being the
 *  window. Restated here for the same reason the two figures above are. */
const DRAW_ROWS = 1000;
/** `WINDOW_CHUNK` in components/shared/chain-truth-timeline.tsx, and the run
 *  spec's own floor in lib/aave-vaults/timeline-runs.tsx — both restated here,
 *  because a check that read them off the source could not catch a change to
 *  either. */
// Mirrors TIMELINE_PAGE_ROWS in lib/shared/timeline-opening-balance.ts — move it with it.
const WINDOW_CHUNK = 50;
const MIN_RUN = 3;
/** The kinds the run spec collapses, and the rule it collapses them by. This is
 *  THIS SCRIPT's own grouping of the route's own rows — the expectation the DOM
 *  is measured against.
 *
 *  The two transfer kinds joined on 2026-09-10 (plan §7b): a plumbing position
 *  has neither a deposit nor a withdrawal, so its whole window drew as
 *  individual cards. F7's own tally is unchanged by it — 47 rows, 13 folders,
 *  because its transfers never run three deep in one direction — so T11 reads
 *  the same before and after; the kinds are added here so the two statements of
 *  the rule stay in step on the day a fixture does have such a stretch. The
 *  folder's own checks live in verify-vault-transfer-folders.mjs. */
const RUN_KINDS = new Set(["deposit", "withdrawal", "transfer-in", "transfer-out"]);
function ownRuns(events) {
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
/** The word targets of plan §2.4, likewise restated. */
const WORDS_WITH_HOLDER = 600;
const WORDS_WITHOUT_HOLDER = 450;

const client = createPublicClient({
  chain: mainnet,
  // Five retries 1 s doubling (31 s in all): this Mac shares preview's Alchemy app, and
  // a heavy build spends its per-second budget for several seconds. Three retries
  // 150 ms apart all landed inside that 429 and failed T8b on 2026-09-21.
  transport: http(env.ALCHEMY_URL, { batch: false, retryCount: 5, retryDelay: 1000, timeout: 120_000 }),
});

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
const VAULT_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
]);

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

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const pad32 = (a) => `0x${"0".repeat(24)}${a.toLowerCase().replace(/^0x/, "")}`;
const tailOf = (t) => (t ? `0x${t.slice(26)}`.toLowerCase() : ZERO_ADDR);
const hex = (n) => `0x${BigInt(n).toString(16)}`;
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const word = (data, i) => BigInt(`0x${data.slice(2 + i * 64, 2 + (i + 1) * 64)}`);

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

/** The lane's own `finalized` block, asked of the node — never `latest − k`. */
async function ownFinalized() {
  const res = await fetch(env.ALCHEMY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBlockByNumber", params: ["finalized", false] }),
  });
  const json = await res.json();
  return Number(BigInt(json.result.number));
}

/** This script's own whole-life reduction of one position at one block: the
 *  merged transfer logs, the six lifetime sums the tower draws, and the running
 *  balance at any cut. Nothing here consults the page. */
async function ownLife(vault, holder, blockNumber) {
  const who = holder.toLowerCase();
  const [out, into, dep, wit] = await Promise.all([
    getLogs(vault, [TRANSFER, pad32(who), null], blockNumber),
    getLogs(vault, [TRANSFER, null, pad32(who)], blockNumber),
    getLogs(vault, [DEPOSIT, null, pad32(who)], blockNumber),
    getLogs(vault, [WITHDRAW, null, null, pad32(who)], blockNumber),
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
        : Number(BigInt(a.blockNumber) - BigInt(b.blockNumber)),
    );

  // The asset leg, claimed once each on (transaction, share count) — the same
  // pairing rule the loader uses, restated so a change to it is visible here.
  const legs = { deposit: [...dep], withdraw: [...wit] };
  const claimLeg = (kind, txHash, shares) => {
    const pool = kind === "deposit" ? legs.deposit : legs.withdraw;
    const i = pool.findIndex((l) => l.transactionHash === txHash && word(l.data, 1) === shares);
    if (i < 0) return null;
    return word(pool.splice(i, 1)[0].data, 0);
  };

  let balance = 0n;
  const rows = [];
  const sums = { minted: 0n, burned: 0n, in: 0n, out: 0n, deposited: 0n, withdrawn: 0n };
  const counts = { mints: 0, burns: 0, in: 0, out: 0, self: 0, legless: 0 };
  for (const l of transfers) {
    const from = tailOf(l.topics[1]);
    const to = tailOf(l.topics[2]);
    const value = BigInt(l.data);
    let delta = 0n;
    if (to === who) delta += value;
    if (from === who) delta -= value;
    balance += delta;
    const kind =
      from === ZERO_ADDR && to === who
        ? "deposit"
        : to === ZERO_ADDR && from === who
          ? "withdrawal"
          : from === who && to === who
            ? "transfer-self"
            : to === who
              ? "transfer-in"
              : "transfer-out";
    let assets = null;
    if (kind === "deposit") {
      sums.minted += value;
      counts.mints += 1;
      assets = claimLeg("deposit", l.transactionHash, value);
      if (assets == null) counts.legless += 1;
      else sums.deposited += assets;
    } else if (kind === "withdrawal") {
      sums.burned += value;
      counts.burns += 1;
      assets = claimLeg("withdraw", l.transactionHash, value);
      if (assets == null) counts.legless += 1;
      else sums.withdrawn += assets;
    } else if (kind === "transfer-in") {
      sums.in += value;
      counts.in += 1;
    } else if (kind === "transfer-out") {
      sums.out += value;
      counts.out += 1;
    } else {
      counts.self += 1;
    }
    rows.push({
      id: `${l.transactionHash}:${Number(BigInt(l.logIndex))}`,
      blockNumber: Number(BigInt(l.blockNumber)),
      logIndex: Number(BigInt(l.logIndex)),
      kind,
      sharesDelta: delta.toString(),
      balanceAfter: balance.toString(),
      assets: assets == null ? null : assets.toString(),
    });
  }
  const balanceAt = (cut) => {
    let b = 0n;
    for (const r of rows) if (r.blockNumber <= cut) b += BigInt(r.sharesDelta);
    return b;
  };
  return {
    logsIn: into.length,
    logsOut: out.length,
    transfers: transfers.length,
    rows,
    sums,
    counts,
    balance,
    balanceAt,
    assetless: counts.in + counts.out + counts.self,
  };
}

// ── the page and the routes ─────────────────────────────────────────────────

const routeUrl = (f, qs = "") => `${BASE}/api/chain/aave-vaults/vault?vault=${f.vault}&holder=${f.holder}${qs}`;
const pageUrl = (f) => `${BASE}/ethereum/aave/vaults/${f.vault}/${f.holder}`;
/** `AAVE_VAULT_TAIL_VERSION` in lib/shared/vault-holder-timeline.ts, restated. */
const LOADER_VERSION = 3;
const tailUrl = (f) =>
  `${BASE}/api/vaults/positions/tail?chain=1&vault=${f.vault}&holder=${f.holder}&loaderVersion=${LOADER_VERSION}`;

/** ⚠️ `timeline: null` ON A 200 WAS A KNOWN TRANSIENT: a cold heavy life could
 *  429 the lane and the route answered without a timeline for about seven
 *  seconds (rails-ops TO-DO-infra §5.8). Since 2026-09-21 the state and logs
 *  clients wait a rate-limit refusal out (lib/sources/chain/rpc.ts) and a
 *  null here is no longer expected. The one re-read after ten seconds stays,
 *  and no more: a route that is still null then is handed to the caller as
 *  null, and `timelineOf` below turns that into a red check. */
const NULL_TIMELINE_WAIT_MS = 10_000;
async function readRoute(url) {
  const started = Date.now();
  let res = await fetch(url);
  let json = res.status === 200 ? await res.json() : null;
  const ms = Date.now() - started;
  if (json && json.timeline == null) {
    console.log(`      · timeline: null on ${url.replace(BASE, "")} — waiting 10 s and reading once more`);
    await new Promise((r) => setTimeout(r, NULL_TIMELINE_WAIT_MS));
    res = await fetch(url);
    json = res.status === 200 ? await res.json() : null;
  }
  return { status: res.status, json, ms };
}
/** The route's timeline, or a FAIL naming the section that needed it. Every
 *  caller skips its own checks on null, so a route that answers without a
 *  timeline costs one red line and the run goes on to its verdict. */
function timelineOf(r, section) {
  const t = r.json?.timeline ?? null;
  if (!t)
    check(
      `${section}: the route serves a timeline`,
      false,
      `status ${r.status}, timeline ${r.json ? "null after one re-read" : "absent"}`,
    );
  return t;
}
const readTail = async (f) => {
  const res = await fetch(tailUrl(f));
  return { status: res.status, json: res.status === 200 ? await res.json() : null };
};
const putTail = async (f, body) => {
  const res = await fetch(tailUrl(f), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
};

/** Visible words as the reader sees them: rendered `innerText`, never the RSC
 *  payload and never `body.textContent` — a `hidden` drawer's prose is not on
 *  the face, and the payload made an earlier vault check vacuous. */
async function pageText(browser, url) {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  const out = await page.evaluate(() => {
    const drawer = document.querySelector("[data-intro-drawer]");
    const q = (s, a) => document.querySelector(s)?.getAttribute(a) ?? null;
    return {
      text: document.body.innerText,
      drawerText: drawer ? drawer.textContent : "",
      drawerPresent: !!drawer,
      mechanicInDrawer: !!document.querySelector("[data-intro-drawer] [data-intro-mechanic]"),
      mechanicOnFace: [...document.querySelectorAll("[data-skel-section='vault-mechanic']")]
        .map((e) => e.innerText)
        .join(" "),
      historySource: q("[data-history-source]", "data-history-source"),
      historyCut: q("[data-history-source]", "data-history-cut"),
      historyTail: q("[data-history-source]", "data-history-tail-rows"),
      historyHead: q("[data-history-source]", "data-history-head-rows"),
      historyText: document.querySelector("[data-history-source]")?.innerText ?? "",
      pageBlock: Number(q("[data-vault-block]", "data-vault-block")),
      cardId: q("[data-position-card]", "data-position-card"),
      cardReceipts: !!document.querySelector("[data-position-card]")?.closest("[data-skel-section='detail-card']"),
      cardExplanation: [...document.querySelectorAll("[data-skel-section='detail-card'] button")]
        .map((b) => `${b.innerText.trim()} ${b.getAttribute("aria-label") ?? ""}`.trim())
        .join(" | "),
      cardSharesRaw: q("[data-position-card]", "data-shares-raw"),
      cardValueUsdE8: q("[data-position-card]", "data-value-usd-e8"),
      cardStatus: q("[data-position-card]", "data-status"),
      towerPresent: !!document.querySelector("[data-vault-flows-tower]"),
      tower: {
        minted: q("[data-vault-flows-tower]", "data-minted-raw"),
        burned: q("[data-vault-flows-tower]", "data-burned-raw"),
        in: q("[data-vault-flows-tower]", "data-transferred-in-raw"),
        out: q("[data-vault-flows-tower]", "data-transferred-out-raw"),
        deposited: q("[data-vault-flows-tower]", "data-deposited-assets-raw"),
        withdrawn: q("[data-vault-flows-tower]", "data-withdrawn-assets-raw"),
        shares: q("[data-vault-flows-tower]", "data-shares-now-raw"),
        claim: q("[data-vault-flows-tower]", "data-claim-now-raw"),
        assetless: q("[data-vault-flows-tower]", "data-assetless-rows"),
        // The figures the BARS are drawn from, after the feeder decided which
        // bucket each flow belongs in — a different claim from the raw sums.
        barMinted: q("[data-vault-flows-tower]", "data-tower-minted"),
        barReceived: q("[data-vault-flows-tower]", "data-tower-received"),
        barBurned: q("[data-vault-flows-tower]", "data-tower-burned"),
        barOut: q("[data-vault-flows-tower]", "data-tower-transferred-out"),
        barShares: q("[data-vault-flows-tower]", "data-tower-shares-now"),
        barDeposited: q("[data-vault-flows-tower]", "data-tower-deposited"),
        barWithdrawn: q("[data-vault-flows-tower]", "data-tower-withdrawn"),
        barClaim: q("[data-vault-flows-tower]", "data-tower-claim-now"),
      },
      rows: document.querySelectorAll("[data-vault-timeline-rows] [data-skel-section='detail-event']").length,
      // ── the shared timeline shell ─────────────────────────────────────
      // The toolbar, and the ROW ORDER as it is actually painted: a lone
      // event card carries the event's id and its own block; a collapsed run
      // is one row whose aria-label states how many members it stands for and
      // of what. Both selectors are read in one query so the array is in
      // document order.
      timelineToolbar: !!document.querySelector(
        "[data-vault-timeline-rows] [data-skel-section='detail-timeline-header']",
      ),
      timelineRows: [
        ...document.querySelectorAll(
          "[data-vault-timeline-rows] [data-event-id], [data-vault-timeline-rows] [aria-label*='consecutive']",
        ),
      ].map((el) => {
        const label = el.getAttribute("aria-label");
        if (label && / consecutive /.test(label)) {
          const m = /^(\d[\d,]*) consecutive (\w+?)s? —/.exec(label);
          return { kind: "run", count: m ? Number(m[1].replace(/,/g, "")) : null, member: m ? m[2] : null };
        }
        // The block is NOT read here: a collapsed card renders no detail
        // panel, so `data-row-block` exists only on an open one. The id is
        // the row's identity either way, and the route's own JSON is what
        // says which block it belongs to.
        return { kind: "event", id: el.getAttribute("data-event-id") };
      }),
      paintedEvents: document.querySelectorAll("[data-vault-timeline-rows] [data-event-id]").length,
      horizonText: document.querySelector("[data-figure='timeline-horizon']")?.innerText ?? "",
      windowText: document.querySelector("[data-figure='timeline-window']")?.innerText ?? "",
      buildingText: document.querySelector("[data-figure='timeline-building']")?.innerText ?? "",
      timelineOf: document.querySelector("[data-vault-timeline-rows]")?.getAttribute("data-vault-timeline-of") ?? null,
      // The window the wrapper was handed, and the toolbar's count line beside
      // it ("Showing 1,000 of 9,097 events" — decision 0019 §3).
      rowCountAttr:
        document.querySelector("[data-vault-timeline-rows]")?.getAttribute("data-vault-timeline-rows") ?? null,
      countLine:
        /Showing [\d,]+ of (?:at least )?[\d,]+ events/.exec(
          document.querySelector("[data-vault-timeline-rows] [data-skel-section='detail-timeline-header']")
            ?.innerText ?? "",
        )?.[0] ?? null,
      unreconciledText: document.querySelector("[data-figure='timeline-unreconciled']")?.innerText ?? "",
    };
  });
  await page.close();
  out.words = out.text.split(/\s+/).filter(Boolean).length;
  return out;
}

const browser = await chromium.launch();
console.log(`\n── /ethereum/aave/vaults/<vault>/<holder> · ${BASE} ──\n`);

// ═══ T0 ═══════════════════════════════════════════════════════════════════
// `?tail=0` here on purpose: T0 must not be the request that stores. T4 below
// writes a poisoned tail at a cut BELOW the correct one, and a storing T0 would
// leave no room under the lane's own finalized block for it to sit.
const r0 = await readRoute(routeUrl(F2, "&tail=0"));
check("T0a F2's route answers 200", r0.status === 200, `status ${r0.status}`);
check(
  "T0b the route's JSON carries a history statement",
  !!r0.json?.timeline?.history && typeof r0.json.timeline.history.source === "string",
  JSON.stringify(r0.json?.timeline?.history ?? null),
);
if (r0.status !== 200) {
  console.log("\nThe route did not answer — nothing below can be judged.");
  await browser.close();
  process.exit(1);
}

// ═══ T1 — the cold path ════════════════════════════════════════════════════
/** T1–T4 and T7–T11 all read F2's two timelines, so a run that cannot get one
 *  ends here with a red line and a verdict rather than a stack trace. */
async function needTimeline(r, section) {
  const t = timelineOf(r, section);
  if (t) return t;
  console.log(`\n${section} has no timeline to judge — nothing below can be judged.`);
  console.log(`\n${passes}/${passes + failures} checks passed${skipped ? ` · ${skipped} SKIP` : ""}`);
  await browser.close();
  process.exit(1);
}
const cold = await readRoute(routeUrl(F2, "&tail=0"));
const coldTl = await needTimeline(cold, "T1");
const f2Own = await ownLife(F2.vault, F2.holder, coldTl.blockNumber);
check(
  "T1a with ?tail=0 the history is the chain's alone",
  coldTl.history.source === "chain" && coldTl.history.cut === null && coldTl.history.tailRows === 0,
  JSON.stringify(coldTl.history),
);
check(
  "T1b it stores nothing either — ?tail=0 refuses both halves",
  coldTl.history.storedThisRequest === false,
  `storedThisRequest ${coldTl.history.storedThisRequest}`,
);
const coldRows = coldTl.events.slice().reverse();
// A cooldown row is an action with no `Transfer` behind it, so this script's
// own sweep has no counterpart for it — the wei-exact comparison is over the
// transfer rows, and the cooldown rows are counted separately below.
const coldTransfers = coldRows.filter((r) => r.kind !== "cooldown");
const badT1c = coldTransfers.filter(
  (r, i) =>
    !f2Own.rows[i] ||
    r.id !== f2Own.rows[i].id ||
    r.sharesDelta !== f2Own.rows[i].sharesDelta ||
    r.balanceAfter !== f2Own.rows[i].balanceAfter,
);
check(
  "T1c every cold row is wei-exact against this script's own replay",
  coldTransfers.length === f2Own.rows.length && badT1c.length === 0,
  badT1c.length
    ? badT1c
        .slice(0, 2)
        .map((r) => `${r.id} page ${r.balanceAfter}`)
        .join(" | ")
    : `${f2Own.rows.length} transfer rows (page ${coldTransfers.length}), own balance ${f2Own.balance}`,
);
check(
  "T1e the rows are newest first, and a cooldown row rides among them",
  coldTl.events.every((r, i) => i === 0 || r.blockNumber <= coldTl.events[i - 1].blockNumber) &&
    coldTl.events.length > coldTransfers.length,
  `${coldTl.events.length} rows drawn, ${coldTransfers.length} of them transfers`,
);
check(
  "T1d and the gate compared that replay against this script's own balanceOf",
  coldTl.reconcile.reconciled === true && coldTl.reconcile.replayed === f2Own.balance.toString(),
  `page ${coldTl.reconcile.replayed}, own ${f2Own.balance}`,
);

// ═══ T4 — the tail cannot lie ═════════════════════════════════════════════
// This runs BEFORE T2 on purpose. The store replaces a value only when the new
// cut is HIGHER than the one it holds (a lower cut is a 409), so a poisoned
// tail has to be written at a cut BELOW the correct one the loader is about to
// write — which is the same order a real deployment sees: something wrong is in
// the store, and the next request replaces it.
const ownFinalizedNow = await ownFinalized();
const existing = await readTail(F2);
const poisonCut = ownFinalizedNow - 1;
const poisonable = !existing.json || existing.json.cutBlock < poisonCut;

// (a) an off-by-one body, built from THIS SCRIPT's read of the cold path. The
//     store re-sums; a store that did not would take it, so this check can only
//     pass by OBSERVING the refusal.
// `coldRows` is already ascending (the route serves newest first and T1
// reversed it), which is the order the store requires.
const bodyRows = coldRows.filter((r) => r.blockNumber <= poisonCut);
let bodySum = 0n;
for (const r of bodyRows) bodySum += BigInt(r.sharesDelta);
const baseBody = {
  chainId: 1,
  vault: F2.vault,
  holder: F2.holder,
  loaderVersion: LOADER_VERSION,
  cutBlock: poisonCut,
  cutBalance: bodySum.toString(),
  logsIn: f2Own.logsIn,
  logsOut: f2Own.logsOut,
  lane: "ALCHEMY_URL",
  storedAt: new Date().toISOString(),
  rows: bodyRows,
};
const r4a = await putTail(F2, { ...baseBody, cutBalance: (bodySum + 1n).toString() });
check(
  "T4a the store REFUSES a body whose rows do not add up (422)",
  r4a.status === 422 && /SUM_MISMATCH|does not equal/.test(r4a.text),
  `status ${r4a.status} · ${r4a.text.slice(0, 130)}`,
);

if (!poisonable) {
  skip(
    "T4b a self-consistent tail missing one real row is accepted by the store",
    `a tail is already stored at cut ${existing.json.cutBlock}, at or above the cut a poison could take (${poisonCut}); finality moves once an epoch, so re-run in a few minutes`,
  );
  skip("T4c the page's own gate catches it and re-sweeps the whole life", "no poison was written");
  skip("T4d and it stored a fresh tail over the poisoned one", "no poison was written");
  skip("T4e the restored tail adds up to this script's own Σ deltas at its own cut", "no poison was written");
} else {
  // (b) a SELF-CONSISTENT tail with one real row removed. It adds up to its own
  //     rows, so the store takes it — the store cannot know a row is missing.
  const dropIndex = bodyRows.findIndex((r) => BigInt(r.sharesDelta) !== 0n);
  const kept = bodyRows.filter((_, i) => i !== dropIndex);
  let keptSum = 0n;
  for (const r of kept) keptSum += BigInt(r.sharesDelta);
  const r4b = await putTail(F2, { ...baseBody, cutBalance: keptSum.toString(), rows: kept });
  check(
    "T4b …and ACCEPTS one that does add up, even with a real row missing (the store cannot know)",
    r4b.status === 200 || r4b.status === 201,
    `status ${r4b.status} · ${r4b.text.slice(0, 130)}`,
  );
  const poisoned = await readRoute(routeUrl(F2));
  const pt = timelineOf(poisoned, "T4c");
  if (pt)
    check(
      "T4c the page's own gate catches it: the tail is distrusted and the whole life re-swept",
      pt.reconcile.reconciled === true && pt.history.source === "chain" && pt.events.length === coldTl.events.length,
      `source ${pt.history.source}, ${pt.events.length} rows against ${coldTl.events.length} cold, reconciled ${pt.reconcile.reconciled}`,
    );
  check(
    "T4d and that request offered a fresh tail over the poisoned one",
    pt.history.storedThisRequest === true,
    `storedThisRequest ${pt.history.storedThisRequest}`,
  );
  await new Promise((r) => setTimeout(r, 5000));
  const restored = await readTail(F2);
  const ownRestored = await ownLife(F2.vault, F2.holder, pt.blockNumber);
  check(
    "T4e the restored tail adds up to this script's own Σ deltas at its own cut",
    restored.status === 200 &&
      restored.json.cutBlock > poisonCut &&
      restored.json.cutBalance === ownRestored.balanceAt(restored.json.cutBlock).toString(),
    restored.status === 200
      ? `cut ${restored.json.cutBlock} (poison was ${poisonCut}), ${restored.json.rows.length} rows, ${restored.json.cutBalance} against own ${ownRestored.balanceAt(restored.json.cutBlock)}`
      : `status ${restored.status}`,
  );
}

// ═══ T2 — the stored tail, and its cut is the lane's own finalized ════════
const finalizedNow = await ownFinalized();
const t2 = await readTail(F2);
check("T2a the proxy serves a stored tail for F2", t2.status === 200, `status ${t2.status}`);
if (t2.status === 200) {
  const t = t2.json;
  check(
    "T2b the stored cut is at or below the lane's OWN finalized block",
    t.cutBlock <= finalizedNow,
    `stored cut ${t.cutBlock}, own finalized ${finalizedNow}`,
  );
  check(
    "T2c the cut is a finality answer, not a fixed distance behind the head",
    finalizedNow - t.cutBlock < 400,
    `own finalized ${finalizedNow} less stored cut ${t.cutBlock} = ${finalizedNow - t.cutBlock} blocks`,
  );
  const above = t.rows.filter((r) => r.blockNumber > t.cutBlock);
  check(
    "T2d every stored row sits at or below the cut",
    above.length === 0,
    above.length ? `row at block ${above[0].blockNumber} is above the cut this script read` : `${t.rows.length} rows`,
  );
  let ascending = true;
  for (let i = 1; i < t.rows.length; i++)
    if (
      t.rows[i].blockNumber < t.rows[i - 1].blockNumber ||
      (t.rows[i].blockNumber === t.rows[i - 1].blockNumber && t.rows[i].logIndex < t.rows[i - 1].logIndex)
    )
      ascending = false;
  check("T2e the stored rows are ascending", ascending, `${t.rows.length} rows`);
  const ownCut = f2Own.balanceAt(t.cutBlock);
  check(
    "T2f the stored cutBalance equals this script's own Σ deltas at that cut",
    t.cutBalance === ownCut.toString(),
    `store ${t.cutBalance}, own ${ownCut}`,
  );
  check(
    `T2g the tail is keyed to loader version ${LOADER_VERSION}`,
    t.loaderVersion === LOADER_VERSION,
    `loaderVersion ${t.loaderVersion}`,
  );
  check(
    "T2h it names the lane by env var NAME and carries no URL",
    t.lane === "ALCHEMY_URL" && !/https?:\/\//.test(JSON.stringify(t)),
    `lane ${t.lane}`,
  );
  const legs = t.rows.filter((r) => r.kind !== "cooldown").length;
  check(
    "T2i the stored sweep counts can account for the stored rows",
    t.logsIn + t.logsOut >= legs,
    `logsIn ${t.logsIn} + logsOut ${t.logsOut} against ${legs} transfer rows`,
  );
  const placeholders = t.rows.filter((r) => !(r.timestamp > 0));
  check(
    "T2j no stored row carries a placeholder timestamp — 0 is 1970, not unread",
    placeholders.length === 0,
    placeholders.length ? `${placeholders.length} rows at timestamp 0` : `${t.rows.length} rows all timestamped`,
  );
  const unpricedStored = t.rows.filter((r) => r.sharePriceAtBlock == null);
  check(
    "T2l no stored row carries a null share price — a stored row is never read again, so null would be unread for good",
    unpricedStored.length === 0,
    unpricedStored.length
      ? `${unpricedStored.length} rows with no share price, first at block ${unpricedStored[0].blockNumber}`
      : `${t.rows.length} rows all priced`,
  );
  const derived = JSON.stringify(t).toLowerCase();
  check(
    "T2k the store holds no derived figure — no claim, no share of a vault, no price in any other unit",
    !/"claim"|"usd"|"apy"|"fraction"|"sharepricenow"|"totalsupply"/.test(derived),
    `${Object.keys(t).join(", ")}`,
  );
}

// ═══ T3 — the warm path ═══════════════════════════════════════════════════
const warm = await readRoute(routeUrl(F2));
const warmTl = await needTimeline(warm, "T3");
check(
  "T3a a second load reads the store and sweeps only the head",
  warmTl.history.source === "stored+head" && warmTl.history.cut != null,
  JSON.stringify(warmTl.history),
);
check(
  "T3b tailRows + headRows equals the rows the page drew",
  warmTl.history.tailRows + warmTl.history.headRows === warmTl.events.length,
  `${warmTl.history.tailRows} + ${warmTl.history.headRows} against ${warmTl.events.length} rows drawn`,
);
const warmOwn = await ownLife(F2.vault, F2.holder, warmTl.blockNumber);
check(
  "T3c the merged reconcile still states the WHOLE life's sweep counts",
  warmTl.reconcile.logsIn === warmOwn.logsIn && warmTl.reconcile.logsOut === warmOwn.logsOut,
  `page ${warmTl.reconcile.logsIn}/${warmTl.reconcile.logsOut}, own ${warmOwn.logsIn}/${warmOwn.logsOut}`,
);
check(
  "T3d and its receipt can name both halves of the replay",
  warmTl.reconcile.cutBalance === warmOwn.balanceAt(warmTl.history.cut).toString(),
  `page ${warmTl.reconcile.cutBalance}, own ${warmOwn.balanceAt(warmTl.history.cut)}`,
);
// The LOG FACTS are compared, not the whole row: `sharePriceAtBlock` is an
// archive call that either answered or did not, and a stored null is a stated
// unread figure rather than a different answer (recorded in the build log).
const FACTS = ["id", "blockNumber", "logIndex", "kind", "sharesDelta", "balanceAfter", "assets", "timestamp"];
const warmRows = warmTl.events.slice().reverse();
const badT3e = warmRows.filter((r, i) => coldRows[i] && FACTS.some((f) => String(r[f]) !== String(coldRows[i][f])));
check(
  "T3e a stored row states the same log facts a swept one does",
  warmRows.length === coldRows.length && badT3e.length === 0,
  badT3e.length
    ? badT3e
        .slice(0, 2)
        .map((r) => r.id)
        .join(" | ")
    : `${warmRows.length} rows compared on ${FACTS.length} fields`,
);
// THE PRICE IS COMPARED ROW BY ROW AND A NULL IS NOT SKIPPED. Until
// 2026-09-21 this check skipped a row where either path had no price, and it
// passed 89/89 over 671 unread prices stored in F5 and MILES (TO-DO-infra
// §5.13). A null on the warm path is either a stored row that will never be
// read again or a head read that did not answer; a null on the cold path is a
// read that did not answer. None of the three is a quiet key's answer.
const unpricedWarm = warmRows.filter((r) => r.sharePriceAtBlock == null).length;
const unpricedCold = coldRows.filter((r) => r.sharePriceAtBlock == null).length;
const badT3f = warmRows.filter((r, i) => coldRows[i] && r.sharePriceAtBlock !== coldRows[i].sharePriceAtBlock);
check(
  "T3f every row on both paths carries a share price, and the two agree",
  unpricedWarm === 0 && unpricedCold === 0 && badT3f.length === 0,
  unpricedWarm || unpricedCold || badT3f.length
    ? `${unpricedWarm} warm rows and ${unpricedCold} cold rows with no share price; ${badT3f.length} rows differ${badT3f.length ? `, first ${badT3f[0].id}` : ""}`
    : `${warmRows.length} prices read on each path, all equal`,
);
const f2Page = await pageText(browser, pageUrl(F2));
check(
  "T3g the page states the split under the timeline heading",
  f2Page.historySource === "stored+head" &&
    /from Rails's store of chain readings/.test(f2Page.historyText) &&
    /read now/.test(f2Page.historyText) &&
    /reconciled at block/.test(f2Page.historyText),
  f2Page.historyText.replace(/\s+/g, " ").slice(0, 150),
);
console.log(`      · timing (informational): cold ${cold.ms} ms, warm ${warm.ms} ms on F2`);

// ═══ T5 — the heavy lives: built into the store, drawn windowed, or withheld ═
//
// ⚠️ 2026-09-09 — T5 WAS "ABOVE THE HORIZON, WITHHELD". It is now the Tier 1
// lifecycle, because a life above the horizon is no longer refused: it is BUILT
// into the store a chunk of blocks at a time across visits, and drawn once
// whole with its newest DRAW rows serialised. What is still withheld is a life
// above CEILING, which T5d covers on a fixture that is actually above it.
//
// T5a keeps the cold path honest: with `?tail=0` there is no store to build
// into, so a heavy life comes back the way it always did — the count, no rows,
// and reconciled. A check that only ever looked at the warm path could not tell
// "the build works" from "the tier test was deleted".

const T5_LIFECYCLE_VISITS = 6;
const T5_WAIT_MS = 30_000;

/** One visit: the route, and what the store holds once this visit's own write
 *  has landed.
 *
 *  ⚠️ THE WRITE IS QUEUED IN `after()`, so a tail read taken the instant the
 *  response arrives answers 404 or the PREVIOUS cut — and a check reading it
 *  then would go red on timing rather than on anything the loader did. This
 *  WAITS for the store to reach the cut the page claimed, and reports what it
 *  found when it stopped waiting. The cut may be past that claim by then,
 *  because the continuation keeps building behind the response; that is
 *  progress, not disagreement, so the comparison below is `at least`. */
const T5_STORE_WAIT_MS = 25_000;
async function lifecycleVisit(f) {
  const r = await readRoute(routeUrl(f));
  const t = r.json?.timeline ?? null;
  const wanted = t?.history?.building?.keptCut ?? null;
  let stored = await readTail(f);
  if (wanted != null) {
    const until = Date.now() + T5_STORE_WAIT_MS;
    while (Date.now() < until && !(stored.status === 200 && (stored.json?.cutBlock ?? -1) >= wanted)) {
      await new Promise((r) => setTimeout(r, 2000));
      stored = await readTail(f);
    }
  }
  return {
    ms: r.ms,
    status: r.status,
    events: t?.events?.length ?? null,
    withheld: t?.coverage?.withheldAbove ?? null,
    drawn: t?.coverage?.drawn ?? null,
    headId: t?.events?.[0]?.id ?? null,
    oldestDrawnBlock: t?.events?.length ? t.events[t.events.length - 1].blockNumber : null,
    routeBlock: t?.blockNumber ?? null,
    building: t?.history?.building ?? null,
    reconciled: t?.reconcile?.reconciled ?? null,
    logCount: t?.coverage?.logCount ?? null,
    storeStatus: stored.status,
    storeCut: stored.json?.cutBlock ?? null,
    storeRows: stored.json?.rows?.length ?? null,
  };
}

// ── T5a the cold path: no store to build into, so the count and no rows ─────
const r5cold = await readRoute(routeUrl(F6, "&tail=0"));
const t5cold = timelineOf(r5cold, "T5a");
if (t5cold)
  check(
    "T5a with ?tail=0 a heavy life is withheld with the count stated — there is no store to build into",
    t5cold.events.length === 0 &&
      t5cold.coverage.withheldAbove === t5cold.coverage.logCount &&
      t5cold.coverage.logCount > HORIZON &&
      t5cold.reconcile.reconciled === true &&
      t5cold.history.building == null,
    `${t5cold.coverage.withheldAbove} withheld of ${t5cold.coverage.logCount} logs, ${t5cold.events.length} rows, building ${JSON.stringify(t5cold.history.building)}`,
  );

// ── T5b the lifecycle, on F6 and on MILES ───────────────────────────────────
// Each visit is either MID-BUILD — and then the cut must have STRICTLY ADVANCED
// since the visit before, which is the whole claim "a later visit continues
// from the stored cut" — or DRAWN. Two visits at the same cut is a build that
// stopped, and it fails here rather than being waited out.
const T5_FIXTURES = [
  ["F6", F6],
  ["MILES", MILES],
  ["FRESH", T1_FRESH],
];
const t5Drawn = new Map();
for (const [name, f] of T5_FIXTURES) {
  let previousCut = -1;
  let stalled = null;
  let final = null;
  let sawBuild = false;
  for (let visit = 1; visit <= T5_LIFECYCLE_VISITS; visit++) {
    const v = await lifecycleVisit(f);
    console.log(
      `      · ${name} visit ${visit}: ${v.ms} ms · ${v.building ? `building ${v.building.keptRows}/${v.building.totalRows} at block ${v.building.keptCut}` : `drawn ${v.events} of ${v.drawn?.of ?? v.events}`} · store ${v.storeStatus}${v.storeCut ? ` cut ${v.storeCut}, ${v.storeRows} rows` : ""}`,
    );
    if (!v.building) {
      final = v;
      break;
    }
    sawBuild = true;
    // The store must AGREE with what the page said it kept: a `building` line
    // naming a cut the store does not hold would be a claim about a write that
    // never landed.
    if (v.storeStatus !== 200 || v.storeCut < v.building.keptCut || v.storeRows < v.building.keptRows)
      stalled = `visit ${visit}: page says ${v.building.keptRows} rows at block ${v.building.keptCut}, store answers ${v.storeStatus} cut ${v.storeCut} with ${v.storeRows} rows`;
    else if (v.building.keptCut <= previousCut)
      stalled = `visit ${visit}: cut ${v.building.keptCut} did not advance past ${previousCut}`;
    else if (v.building.keptRows > v.building.totalRows)
      stalled = `visit ${visit}: kept ${v.building.keptRows} of ${v.building.totalRows}`;
    if (stalled) break;
    previousCut = v.building.keptCut;
    if (visit < T5_LIFECYCLE_VISITS) await new Promise((r) => setTimeout(r, T5_WAIT_MS));
  }
  check(
    `T5b ${name} reaches the drawn state, and no mid-build visit failed to advance the stored cut`,
    stalled === null && final !== null,
    stalled ??
      (final
        ? `drawn after ${sawBuild ? "the build" : "no build"}, ${final.events} rows of ${final.logCount}`
        : `still building after ${T5_LIFECYCLE_VISITS} visits`),
  );
  // ⚠️ THE STORE IS LIVE AND SHARED, so a fixture whose life an earlier run
  // already built answers DRAWN on the first visit and this loop never sees a
  // `building` state at all. That is a real outcome, and T5c still holds the
  // drawn shape to this script's own logs — but the PROGRESS assertion above
  // then judged nothing, and a check that quietly passed on nought
  // observations is exactly the trap memory `verifier-cannot-fail-traps` is
  // about. So it says which of the two happened.
  if (final && !sawBuild)
    skip(
      `T5b2 ${name}: the mid-build progress assertion`,
      "the store already holds this life whole, so no visit was mid-build — point BASE at a Tier 1 position nothing has built yet to exercise the advance",
    );
  else
    check(
      `T5b2 ${name}: a mid-build state was actually observed, so the progress assertion above had something to judge`,
      sawBuild,
      sawBuild ? `last mid-build cut ${previousCut}` : "no mid-build visit and no drawn visit either",
    );
  if (final) t5Drawn.set(name, final);
}

// ── T5c drawn: the window is this script's own arithmetic ───────────────────
for (const [name, f] of T5_FIXTURES) {
  const v = t5Drawn.get(name);
  if (!v) {
    skip(`T5c ${name}: the window and the tower over the whole life`, "the life had not finished building");
    continue;
  }
  const page = await pageText(browser, pageUrl(f));
  const own = await ownLife(f.vault, f.holder, page.pageBlock);
  // ONE SWEEP, TWO BLOCKS. The page was read after the route visit and these
  // lives take a row most hours, so the route's figures are held to this
  // script's own rows at or below the ROUTE's block and the page's to the whole
  // sweep. `own.rows` is ascending, so the newest row is the last.
  const ownAtRoute = own.rows.filter((r) => r.blockNumber <= (v.routeBlock ?? 0));
  const wantRows = Math.min(DRAW_ROWS, ownAtRoute.length);
  const newest = ownAtRoute[ownAtRoute.length - 1];
  const oldestDrawn = ownAtRoute[ownAtRoute.length - wantRows];
  check(
    `T5c1 ${name}: the newest ${wantRows} of this script's own ${ownAtRoute.length} rows, its own newest log at the top and its own ${wantRows}th-newest at the cut`,
    v.events === wantRows &&
      v.drawn?.rows === wantRows &&
      v.drawn?.of === ownAtRoute.length &&
      v.logCount === ownAtRoute.length &&
      v.headId === newest?.id &&
      v.oldestDrawnBlock === oldestDrawn?.blockNumber &&
      v.drawn?.cutBlock === oldestDrawn?.blockNumber &&
      page.timelineRows.length > 0,
    `route ${v.events} rows at block ${v.routeBlock}, drawn ${JSON.stringify({ ...v.drawn, summary: undefined })}, head ${v.headId}; own life ${ownAtRoute.length} rows, own newest ${newest?.id}, own cut block ${oldestDrawn?.blockNumber}`,
  );
  // THE CUT SUMMARY is what the boundary states in the rows' place, so it is
  // held to this script's own tally of the rows it found behind the cut: the
  // same kinds, the same counts, and together the whole shortfall.
  const ownOmitted = new Map();
  for (const r of ownAtRoute.slice(0, ownAtRoute.length - wantRows))
    ownOmitted.set(r.kind, (ownOmitted.get(r.kind) ?? 0) + 1);
  const servedOmitted = new Map((v.drawn?.summary?.byType ?? []).map((b) => [b.key, b.count]));
  const tally = (m) =>
    [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, c]) => `${k} ${c}`)
      .join(", ");
  check(
    `T5c1b ${name}: the cut summary counts the ${ownAtRoute.length - wantRows} rows behind the cut by kind, equal to this script's own tally`,
    ownAtRoute.length > wantRows && tally(servedOmitted) === tally(ownOmitted),
    `served ${tally(servedOmitted) || "(none)"}; own ${tally(ownOmitted) || "(none)"}`,
  );
  // ⚠️ THE TOWER IS THE POINT OF THIS CHECK. It is reduced on the SERVER over
  // the WHOLE life; the page holds only the window. A build that summed the
  // window would move exactly these eight figures and nothing else, which is
  // why they are compared against this script's own whole-life sums rather
  // than against anything the page states about itself.
  const barsWanted = {
    minted: own.sums.minted,
    burned: own.sums.burned,
    in: own.sums.in,
    out: own.sums.out,
    deposited: own.sums.deposited,
    withdrawn: own.sums.withdrawn,
  };
  const barsGot = {
    minted: BigInt(page.tower.minted ?? "-1"),
    burned: BigInt(page.tower.burned ?? "-1"),
    in: BigInt(page.tower.in ?? "-1"),
    out: BigInt(page.tower.out ?? "-1"),
    deposited: BigInt(page.tower.deposited ?? "-1"),
    withdrawn: BigInt(page.tower.withdrawn ?? "-1"),
  };
  const badBars = Object.keys(barsWanted).filter((k) => barsWanted[k] !== barsGot[k]);
  check(
    `T5c2 ${name}: the tower's six lifetime sums are over ALL ${own.rows.length} rows, not the ${wantRows} drawn`,
    page.towerPresent && badBars.length === 0,
    page.towerPresent
      ? badBars.map((k) => `${k}: page ${barsGot[k]}, own ${barsWanted[k]}`).join(" · ") ||
          `six sums over ${own.rows.length} rows`
      : "no tower on the page",
  );
  // The window sentence is gone (decision 0019): the two figures are the
  // toolbar's count line and the wrapper's two attributes, and both halves are
  // this script's own arithmetic at the PAGE's block.
  const pageWant = Math.min(DRAW_ROWS, own.rows.length);
  const wantLine = `Showing ${pageWant.toLocaleString("en-US")} of ${own.rows.length.toLocaleString("en-US")} events`;
  check(
    `T5c3 ${name}: the page states both figures — the count line and the wrapper, the window drawn and the life it was cut from`,
    page.countLine === wantLine &&
      Number(page.rowCountAttr) === pageWant &&
      Number(page.timelineOf) === own.rows.length &&
      page.rows > 0,
    `${page.rows} row cards painted; count line "${page.countLine ?? "ABSENT"}", wanted "${wantLine}"; wrapper ${page.rowCountAttr}/${page.timelineOf}`,
  );
}

// ── T5d above the ceiling: withheld, counted, and NOT stored ────────────────
// The route's own top-level block, not the timeline's: the fixture's size is
// this script's to state even on a run where the route served no timeline.
const r5d = await readRoute(routeUrl(CEILING_LIFE));
const t5d = timelineOf(r5d, "T5d");
const ownCeiling = await ownLife(
  CEILING_LIFE.vault,
  CEILING_LIFE.holder,
  r5d.json?.blockNumber ?? (await client.getBlockNumber()),
);
check(
  "T5d0 the ceiling fixture is still above the ceiling — a fixture that shrank is a stale fixture",
  ownCeiling.transfers > CEILING,
  `${ownCeiling.transfers} of its own Transfer logs, ceiling ${CEILING}`,
);
if (t5d)
  check(
    "T5d above the ceiling the rows are withheld with the count stated, and no build is claimed",
    t5d.events.length === 0 &&
      t5d.coverage.withheldAbove === ownCeiling.transfers &&
      t5d.reconcile.reconciled === true &&
      t5d.history.building == null &&
      t5d.history.storedThisRequest === false,
    `${t5d.coverage.withheldAbove} withheld (own ${ownCeiling.transfers}), ${t5d.events.length} rows, building ${JSON.stringify(t5d.history.building)}, stored ${t5d.history.storedThisRequest}`,
  );
const t5dTail = await readTail(CEILING_LIFE);
check(
  "T5d2 the store holds no tail for it — a tail it cannot hold whole is not a tail",
  t5dTail.status === 404,
  `status ${t5dTail.status}`,
);

// ── T5e Tier 0 is built in one request, and cut to the same window ──────────
// F5 is about 4,000 rows — the largest life still built inline. Re-pinned
// 2026-09-19 from the route as served: a Tier 0 life above DRAW_ROWS is no
// longer handed over whole. It answers its newest DRAW_ROWS with
// `coverage.drawn` stating this script's own count, exactly as Tier 1 does.
// What still marks it as Tier 0 is that no request ever finds it mid-build:
// `history.building` is ABSENT, not null-and-present, because its presence is
// what makes it a statement. A life at or under DRAW_ROWS would carry no
// `drawn` key either, and `tier0Shape` holds that arm too, so the check
// survives the fixture shrinking under the window.
//
// BOTH LANES, and the cold one especially: a warm F5 is served almost entirely
// out of the store, so its head is a handful of blocks and a build-path guard
// that had gone wrong would never be reached. `?tail=0` is where a Tier 0 life
// is swept and built from nothing, which is where that guard has to hold.
const r5eCold = await readRoute(routeUrl(F5, "&tail=0"));
const r5e = await readRoute(routeUrl(F5));
const t5eCold = timelineOf(r5eCold, "T5e (cold)");
const t5e = timelineOf(r5e, "T5e2 (warm)");
const f5OwnLife = await ownLife(F5.vault, F5.holder, r5e.json?.blockNumber ?? (await client.getBlockNumber()));
check(
  "T5e0 F5 is still a Tier 0 life above the draw window — built in one request, drawn cut",
  f5OwnLife.transfers <= HORIZON && f5OwnLife.transfers > DRAW_ROWS,
  `${f5OwnLife.transfers} of its own Transfer logs, window ${DRAW_ROWS}, horizon ${HORIZON}`,
);
// Each lane is held to this script's own rows at or below THAT lane's block:
// the cold read is a few blocks behind the warm one.
const tier0Shape = (t) => {
  const ownAt = f5OwnLife.rows.filter((r) => r.blockNumber <= t.blockNumber);
  const want = Math.min(DRAW_ROWS, ownAt.length);
  const windowed = ownAt.length > DRAW_ROWS;
  return (
    t.events.length === want &&
    t.events[0]?.id === ownAt[ownAt.length - 1]?.id &&
    (windowed ? t.coverage.drawn?.rows === want && t.coverage.drawn?.of === ownAt.length : !("drawn" in t.coverage)) &&
    !("building" in t.history) &&
    t.coverage.withheldAbove === null
  );
};
const tier0Say = (t) =>
  `${t.events.length} rows served, drawn ${JSON.stringify(t.coverage.drawn ? { rows: t.coverage.drawn.rows, of: t.coverage.drawn.of } : null)}, own life ${f5OwnLife.rows.filter((r) => r.blockNumber <= t.blockNumber).length}; history keys ${Object.keys(t.history).join(",")}`;
if (t5eCold)
  check(
    "T5e a Tier 0 life answers its newest DRAW_ROWS with this script's own count beside them, and states no build — swept cold",
    tier0Shape(t5eCold),
    tier0Say(t5eCold),
  );
if (t5e) check("T5e2 …and the same warm, out of the store", tier0Shape(t5e), tier0Say(t5e));

// ── T5f no stored tail carries an unread share price ────────────────────────
// Every fixture this script leads the store to hold, read back whole. T2l holds
// F2 alone; the unread prices that reached the store were in the heavy lives
// (F5 and MILES, 671 rows, found 2026-09-21), which only this read covers. A
// run where the store held none of them has judged nothing, so that is red.
const t5fTails = [];
for (const [name, f] of [["F2", F2], ["F5", F5], ...T5_FIXTURES]) {
  const tail = await readTail(f);
  if (tail.status !== 200) continue;
  const rows = tail.json?.rows ?? [];
  t5fTails.push({ name, rows: rows.length, unpriced: rows.filter((r) => r.sharePriceAtBlock == null).length });
}
check(
  "T5f no tail the store holds for a fixture carries a null share price",
  t5fTails.length > 0 && t5fTails.every((t) => t.unpriced === 0),
  t5fTails.length
    ? t5fTails.map((t) => `${t.name} ${t.unpriced} of ${t.rows} unpriced`).join(" · ")
    : "the store holds no tail for any fixture, so nothing was judged",
);

// ═══ T6 — the words ═══════════════════════════════════════════════════════
const f2Bare = await pageText(browser, `${BASE}/ethereum/aave/vaults/${F2.vault}`);
check(
  `T6a F2's position page is at or under ${WORDS_WITH_HOLDER} visible words`,
  f2Page.words <= WORDS_WITH_HOLDER,
  `F2's page: ${f2Page.words} visible words`,
);
check(
  `T6b the same vault with no holder is at or under ${WORDS_WITHOUT_HOLDER}`,
  f2Bare.words <= WORDS_WITHOUT_HOLDER,
  `${f2Bare.words} visible words`,
);
check(
  "T6c the family mechanic prose is reachable in the intro drawer, on both",
  f2Page.mechanicInDrawer && f2Bare.mechanicInDrawer && /How an Umbrella stake token works/.test(f2Bare.drawerText),
  `drawer present ${f2Bare.drawerPresent}, mechanic heading inside it ${f2Bare.mechanicInDrawer}`,
);
check(
  "T6d …and the drawer's statements are in the initial HTML, not only once opened",
  /How an Umbrella stake token works/.test(await (await fetch(`${BASE}/ethereum/aave/vaults/${F2.vault}`)).text()),
  "the drawer stays mounted and hidden",
);
check(
  "T6e no mechanic PARAGRAPH was left on the face",
  !/Staked, and slashable/.test(f2Page.mechanicOnFace) &&
    !/Redemption runs through a cooldown/.test(f2Page.mechanicOnFace),
  `${f2Page.mechanicOnFace.split(/\s+/).filter(Boolean).length} words in the on-face mechanic section`,
);

// ═══ T7 — the tower ═══════════════════════════════════════════════════════
// F5 is the tower's fixture: it has transfers in BOTH directions and mints, so
// a build that summed transfers into the minted bar is visible here where it
// would not be on F2.
// The tower's figures are the PAGE's own reading, so every expectation here is
// re-derived at the block the PAGE states — not at the block a separate route
// call happened to answer at, which is a different moment.
const f5Page = await pageText(browser, pageUrl(F5));
const f5Own = await ownLife(F5.vault, F5.holder, f5Page.pageBlock);
const f5Claim = await client.readContract({
  address: F5.vault,
  abi: VAULT_ABI,
  functionName: "convertToAssets",
  args: [f5Own.balance],
  blockNumber: BigInt(f5Page.pageBlock),
});
check("T7a F5 draws a lifetime-flows tower", f5Page.towerPresent, `tower present ${f5Page.towerPresent}`);
check(
  "T7b the shares now equal this script's own balanceOf, and the claim its own convertToAssets",
  f5Page.tower.shares === f5Own.balance.toString() && f5Page.tower.claim === f5Claim.toString(),
  `shares ${f5Page.tower.shares} vs own ${f5Own.balance}; claim ${f5Page.tower.claim} vs own ${f5Claim}`,
);
check(
  "T7c minted is MINTS ALONE — transfers in are a separate line, never added into it",
  f5Page.tower.minted === f5Own.sums.minted.toString() && f5Page.tower.in === f5Own.sums.in.toString(),
  `page minted ${f5Page.tower.minted}, own mints ${f5Own.sums.minted}, own transfers in ${f5Own.sums.in}`,
);
// …and the same claim about the BARS, which is what a reader sees. The raw
// attribute above is the reducer's sum; this one is what the feeder handed the
// tower, and a build that added transfers into the minted bar moves only this.
const f5Dec = 18;
const scaled = (raw) => String(Number(raw) / Math.pow(10, f5Dec));
const barMismatch = [
  ["minted", f5Page.tower.barMinted, scaled(f5Own.sums.minted)],
  ["received", f5Page.tower.barReceived, scaled(f5Own.sums.in)],
  ["burned", f5Page.tower.barBurned, scaled(f5Own.sums.burned)],
  ["transferred out", f5Page.tower.barOut, scaled(f5Own.sums.out)],
  ["shares now", f5Page.tower.barShares, scaled(f5Own.balance)],
].filter(([, page, own]) => page !== own);
check(
  "T7c2 …and the BARS carry the same split — a transfer never lands in the minted bar",
  barMismatch.length === 0,
  barMismatch.length
    ? barMismatch.map(([k, page, own]) => `${k}: bar ${page}, own ${own}`).join(" | ")
    : `5 bar figures against this script's own sums`,
);
check(
  "T7d burned and transferred out are this script's own sums",
  f5Page.tower.burned === f5Own.sums.burned.toString() && f5Page.tower.out === f5Own.sums.out.toString(),
  `burned ${f5Page.tower.burned}/${f5Own.sums.burned}, out ${f5Page.tower.out}/${f5Own.sums.out}`,
);
check(
  "T7e the asset side is the contract's own Deposit and Withdraw words",
  f5Page.tower.deposited === f5Own.sums.deposited.toString() &&
    f5Page.tower.withdrawn === f5Own.sums.withdrawn.toString(),
  `deposited ${f5Page.tower.deposited}/${f5Own.sums.deposited}, withdrawn ${f5Page.tower.withdrawn}/${f5Own.sums.withdrawn}`,
);
check(
  "T7f the share ledger reconciles wei-exact: mints + in − burns − out IS balanceOf",
  BigInt(f5Page.tower.minted) + BigInt(f5Page.tower.in) - BigInt(f5Page.tower.burned) - BigInt(f5Page.tower.out) ===
    f5Own.balance,
  `own balance ${f5Own.balance}`,
);
check(
  "T7g the rows that moved shares and no asset are COUNTED, never converted",
  Number(f5Page.tower.assetless) === f5Own.assetless,
  `page ${f5Page.tower.assetless}, own ${f5Own.assetless}`,
);
const banned = [
  ...f5Page.text.matchAll(
    // APY/APR case-SENSITIVELY: "Apr" is April, and an en-GB date is the house
    // form on every row of the timeline below.
    /.{0,40}(\bAPY\b|\bAPR\b|per annum|annualised|annualized|\byield\b|\bprofit\b|P&L).{0,40}/g,
  ),
];
// Since mig 206 the card carries ONE dollar figure — Value · USD, the census's
// oracle read at the census block — so "no dollar sign" became "no dollar
// figure other than that stat": the count of `$` figures on the page equals one
// for an open, priced card and zero otherwise.
const dollarFigures = (f5Page.text.match(/\$\s?\d[\d,.]*[kMB]?/g) ?? []).length;
const expectedDollars = f5Page.cardStatus === "live" && f5Page.cardValueUsdE8 ? 1 : 0;
check(
  "T7h0 the only dollar figure on the position page is the card's Value · USD stat",
  dollarFigures === expectedDollars,
  `${dollarFigures} dollar figure(s), card ${f5Page.cardStatus ?? "?"} with value ${f5Page.cardValueUsdE8 || "unpriced"}`,
);
check(
  "T7h no rate or yield anywhere on the position page",
  banned.length === 0,
  banned.length
    ? banned
        .slice(0, 2)
        .map((m) => JSON.stringify(m[0].replace(/\s+/g, " ")))
        .join(" | ")
    : `${f5Page.words} visible words, none of them a priced or annualised figure`,
);
// F6 was this check's fixture until 2026-09-09 and is a DRAWN life now, so the
// subject moved to a life above the ceiling — the one shape that still withholds.
const ceilingPage = await pageText(browser, pageUrl(CEILING_LIFE));
check(
  "T7i a withheld life draws NO tower — the flows are a whole-life claim",
  !ceilingPage.towerPresent && /more than Rails keeps a stored history for/.test(ceilingPage.horizonText),
  `tower present ${ceilingPage.towerPresent}; horizon words "${ceilingPage.horizonText.replace(/\s+/g, " ").slice(0, 90)}"`,
);
check(
  "T7i2 …and a DRAWN heavy life does draw one, over the whole life rather than the window",
  f5Page.towerPresent,
  `F5 tower ${f5Page.towerPresent}`,
);

// A pause before the sibling verifiers: this script has just made several
// hundred archive calls on the same key, and the lane answers 429 on compute
// units when two whole verifier runs overlap. The wait is not a check.
await new Promise((r) => setTimeout(r, 20_000));

// ═══ T11 — the rows ride the shared timeline shell ════════════════════════
// The hand-rolled list is gone: the rows sit in `ChainTruthTimeline`, which
// brings the toolbar, the 50-row render window and run collapse. Every
// expectation below is THIS SCRIPT's own grouping of the ROUTE's own rows.
const f7Route = await readRoute(routeUrl(F7));
const f7Events = f7Route.json?.timeline?.events ?? [];
const f7Page = await pageText(browser, pageUrl(F7));
const f7Runs = ownRuns(f7Events);
const f7RunRows = f7Runs.filter((r) => r.kind === "run");

check(
  "T11a the fixture still has consecutive same-kind rows to collapse",
  // Deeper than the render window, so T11d's "fewer painted than the life has"
  // is a real claim — stated as the window rather than as a literal, which is
  // what it always meant.
  f7Events.length > WINDOW_CHUNK && f7RunRows.length > 0,
  `${f7Events.length} rows, own grouping gives ${f7RunRows.length} runs (longest ${Math.max(0, ...f7RunRows.map((r) => r.events.length))})`,
);
check(
  "T11b the timeline draws the shared toolbar",
  f7Page.timelineToolbar === true,
  `toolbar present ${f7Page.timelineToolbar}`,
);
// The window is a PREFIX of the row list, so the expectation is the first
// `WINDOW_CHUNK` of this script's own grouping — right whether or not this
// fixture's life ever grows past it.
const f7Visible = f7Runs.slice(0, WINDOW_CHUNK);
check(
  "T11c the DOM's rows are this script's own grouping of the route's rows",
  f7Page.timelineRows.length === f7Visible.length &&
    f7Page.timelineRows.every((row, i) => row.kind === f7Visible[i].kind) &&
    f7Page.timelineRows.every((row, i) => row.kind !== "run" || row.count === f7Visible[i].events.length),
  `page ${f7Page.timelineRows.length} rows (${f7Page.timelineRows.filter((r) => r.kind === "run").length} runs), own ${f7Visible.length} of ${f7Runs.length} (${f7RunRows.length} runs)`,
);
check(
  // ⚠️ `> 0` is load-bearing: without it a page that painted NOTHING would
  // satisfy "fewer than the life has" and this check would go green on the
  // worst outcome it exists to catch. Measured — the first break below drew
  // zero cards and this line read PASS until the floor was added.
  "T11d fewer cards are painted than the life has rows, and more than none",
  f7Page.paintedEvents > 0 &&
    f7Page.paintedEvents < f7Events.length &&
    f7Page.paintedEvents <= WINDOW_CHUNK + f7RunRows.length,
  `${f7Page.paintedEvents} cards painted, ${f7RunRows.length} run rows, ${f7Events.length} rows in the life`,
);
// The head row is the newest. Which row that IS depends on whether the newest
// events form a run, so it is decided by this script's own grouping rather
// than assumed — either way the assertion names the route's newest event.
const newest = f7Events[0];
const headRow = f7Runs[0];
check(
  "T11e the head row is the newest event in the life",
  f7Page.timelineRows.length > 0 &&
    (headRow.kind === "run"
      ? f7Page.timelineRows[0].kind === "run" && f7Page.timelineRows[0].count === headRow.events.length
      : f7Page.timelineRows[0].kind === "event" && f7Page.timelineRows[0].id === newest.id),
  `own head is a ${headRow.kind} (${newest.kind} @ block ${newest.blockNumber}); page head ${JSON.stringify(f7Page.timelineRows[0])}`,
);
// …and the painted cards run newest first, by the route's own blocks.
const f7BlockOf = new Map(f7Events.map((e) => [e.id, e.blockNumber]));
const paintedBlocks = f7Page.timelineRows.filter((r) => r.kind === "event").map((r) => f7BlockOf.get(r.id) ?? -1);
check(
  "T11f the painted cards descend by the route's own block numbers",
  paintedBlocks.length > 1 && paintedBlocks.every((b, i) => i === 0 || b <= paintedBlocks[i - 1]),
  `${paintedBlocks.length} cards, ${paintedBlocks[0]} … ${paintedBlocks[paintedBlocks.length - 1]}`,
);

// ⚠️⚠️ THE WINDOW IS A RENDER CAP AND NOTHING ELSE. The tower above the rows
// is a whole-life sum; if it were reduced over what is PAINTED it would be a
// window's arithmetic presented as a lifetime's. So its six figures are
// compared against sums taken over the ROUTE's own whole event list, on a page
// that is demonstrably painting fewer rows than the life has (T11d).
const f7Sums = { minted: 0n, burned: 0n, in: 0n, out: 0n, deposited: 0n, withdrawn: 0n };
for (const e of f7Events) {
  const shares = BigInt(e.sharesDelta);
  const assets = e.assets == null ? null : BigInt(e.assets);
  if (e.kind === "deposit") {
    f7Sums.minted += shares;
    if (assets != null) f7Sums.deposited += assets;
  } else if (e.kind === "withdrawal") {
    f7Sums.burned += shares < 0n ? -shares : shares;
    if (assets != null) f7Sums.withdrawn += assets;
  } else if (e.kind === "transfer-in") f7Sums.in += shares;
  else if (e.kind === "transfer-out") f7Sums.out += shares < 0n ? -shares : shares;
}
const towerBad = [
  ["minted", f7Page.tower.minted, f7Sums.minted],
  ["burned", f7Page.tower.burned, f7Sums.burned],
  ["transferred in", f7Page.tower.in, f7Sums.in],
  ["transferred out", f7Page.tower.out, f7Sums.out],
  ["deposited", f7Page.tower.deposited, f7Sums.deposited],
  ["withdrawn", f7Page.tower.withdrawn, f7Sums.withdrawn],
].filter(([, page, own]) => page !== own.toString());
check(
  "T11g the lifetime tower is the WHOLE life, not the painted window",
  f7Page.towerPresent && towerBad.length === 0,
  towerBad.length
    ? towerBad.map(([what, page, own]) => `${what}: page ${page}, own ${own}`).join(" · ")
    : `six sums over ${f7Events.length} rows, ${f7Page.paintedEvents} of them painted`,
);

// ═══ T12 — a row states the transition, not the after-state ═══════════════
// The row detail is opened by clicking the card's own header control — the
// same click a reader makes — and the three figures are read off the OPEN
// panel. Every expectation is the route's own integers.
async function openRowDetail(url, id) {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForSelector("[data-vault-timeline-rows] [data-event-id]", { timeout: 60_000 });
  const wrapper = page.locator(`[data-vault-timeline-rows] [data-event-id="${id}"]`);
  await wrapper.locator('[role="button"]').first().click();
  await page.waitForSelector("[data-row-balance-after]", { timeout: 30_000 });
  const out = await page.evaluate(() => {
    const el = document.querySelector("[data-row-balance-after]");
    const value = document.querySelector("[data-figure='row-balance-after'] [data-figure-value]");
    return {
      before: el?.getAttribute("data-row-balance-before") ?? null,
      after: el?.getAttribute("data-row-balance-after") ?? null,
      delta: el?.getAttribute("data-row-shares-delta") ?? null,
      stated: (value?.textContent ?? "").replace(/\s+/g, " ").trim(),
      arrows: value?.querySelectorAll("svg").length ?? 0,
    };
  });
  await page.close();
  return { id, ...out };
}
// ⚠️ THE ROW IS CHOSEN FOR A NON-ZERO DELTA, ON PURPOSE. A cooldown row and a
// self-transfer both move nothing, so their before and after are the SAME
// figure — and "the cell contains the before AND the after" is then one
// assertion made twice, which a page stating the after-state alone would still
// satisfy. Measured: the first painted row was a cooldown on one run of this
// script, and T12c passed on a string that said one number twice. The target
// is the newest row that is drawn on its own (a run's members are not mounted
// until it is expanded) and actually moved shares.
const t12Event =
  f7Runs.find(
    (r) =>
      r.kind === "event" && r.events[0].sharesDelta !== "0" && r.events[0].balanceAfter !== r.events[0].sharesDelta,
  )?.events[0] ?? f7Runs.find((r) => r.kind === "event" && r.events[0].sharesDelta !== "0")?.events[0];
const t12 = await openRowDetail(pageUrl(F7), t12Event?.id ?? "");
check(
  "T12z the row this check opens moved shares — before and after are different figures",
  t12Event != null && t12Event.sharesDelta !== "0" && t12.before !== t12.after,
  t12Event
    ? `${t12Event.kind} delta ${t12Event.sharesDelta}: ${t12.before} → ${t12.after}`
    : "no non-zero row painted on its own",
);
check(
  "T12a the opened row's three figures are the route's own integers",
  t12Event != null &&
    t12.after === t12Event.balanceAfter &&
    t12.delta === t12Event.sharesDelta &&
    t12.before === (BigInt(t12Event.balanceAfter) - BigInt(t12Event.sharesDelta)).toString(),
  t12Event
    ? `${t12.id}: before ${t12.before}, delta ${t12.delta}, after ${t12.after} (route after ${t12Event.balanceAfter}, delta ${t12Event.sharesDelta})`
    : `no route row for ${t12.id}`,
);
check(
  "T12b before + delta == after",
  t12.before != null && BigInt(t12.before) + BigInt(t12.delta) === BigInt(t12.after),
  `${t12.before} + ${t12.delta} = ${BigInt(t12.before ?? 0) + BigInt(t12.delta ?? 0)} vs ${t12.after}`,
);
// ⚠️ The two above are satisfied by data attributes alone, which a reader
// cannot see. This is the half that says the transition is DRAWN: the value
// cell states both figures with the house arrow glyph between them.
const t12Sd = t12Event?.shareDecimals ?? 18;
const shareTextOf = (raw, decimals) => {
  const value = Number(raw) / Math.pow(10, decimals);
  const text = value.toLocaleString("en-US", { maximumFractionDigits: 6 });
  if (value === 0 || parseFloat(text.replace(/,/g, "")) !== 0) return text;
  const s = String(raw).padStart(decimals + 1, "0");
  const cut = s.length - decimals;
  return (s.slice(0, cut) + "." + s.slice(cut)).replace(/\.?0+$/, "");
};
const wantBefore = shareTextOf(t12.before, t12Sd);
const wantAfter = shareTextOf(t12.after, t12Sd);
check(
  "T12c the row STATES the transition — both figures, with the arrow between",
  t12.stated.includes(wantBefore) && t12.stated.includes(wantAfter) && t12.arrows >= 1,
  `"${t12.stated}" (want "${wantBefore}" → "${wantAfter}", ${t12.arrows} arrow glyph(s))`,
);

// ═══ T13 — the phone ══════════════════════════════════════════════════════
const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
const phonePage = await phone.newPage();
await phonePage.goto(pageUrl(F7), { waitUntil: "networkidle", timeout: 120_000 });
const phoneWidth = await phonePage.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}));
await phonePage.close();
await phone.close();
check(
  "T13 the position page does not scroll sideways at 390px",
  phoneWidth.scrollWidth === 390,
  `document.scrollWidth ${phoneWidth.scrollWidth} at a 390px viewport (client ${phoneWidth.clientWidth})`,
);

// ═══ T8 — regression ══════════════════════════════════════════════════════
const rerun = (script) => {
  try {
    const out = execFileSync("node", [path.join(ROOT, "scripts/verify", script)], {
      encoding: "utf8",
      env: { ...process.env, BASE },
      maxBuffer: 64 * 1024 * 1024,
    });
    return out.trim().split("\n").pop();
  } catch (e) {
    return `FAILED — ${
      (e.stdout ?? "")
        .trim()
        .split("\n")
        .filter((l) => l.startsWith("FAIL"))
        .join(" | ") || e.message
    }`;
  }
};
const t8a = rerun("verify-ethereum-vault-timeline.mjs");
// 48 → 51 on 2026-09-09: that suite's single horizon check (1e/1f) became the
// heavy-life pair (1e/1f/1f2) plus a ceiling pair (1g/1h). The tally is PINNED
// on purpose — a sibling suite that quietly lost a check would pass a `>=`.
// TWO TALLIES, both pinned, because the suite's dev-only checks are SKIPs on a
// production build: 11a/11b need the dev tripwire's bookends and 13e a lane the
// deployment may not set. 51 → 52 on 2026-09-21 for check 7e (web `b7d9fc87`):
// 49 checks · 3 SKIP against preview.rails.finance and 52/52 · 1 SKIP (4d, no
// self-transfer fixture) on a dev server, both measured 2026-09-21.
check(
  "T8a verify-ethereum-vault-timeline.mjs still passes, unchanged",
  /^52\/52 checks passed · 1 SKIP$/.test(t8a) || /^49\/49 checks passed · 3 SKIP$/.test(t8a),
  t8a,
);
const t8b = rerun("verify-ethereum-vault-positions.mjs");
// 51 → 53 on 2026-09-09, when the section's chrome moved off the listing face:
// that suite grew L14c (the rail's four tabs, each fetched) and L14d (the face
// carries no drawer and no inspector toggle). The tally is PINNED on purpose —
// a sibling suite that quietly lost a check would pass a `>=` and go red here.
check("T8b verify-ethereum-vault-positions.mjs still passes, unchanged", /^53\/53 checks passed/.test(t8b), t8b);

// ═══ T9 — the card is the listing's card ══════════════════════════════════
check(
  "T9a the position page draws the listing's own card for this pair",
  f2Page.cardId === `${F2.vault}:${F2.holder}`,
  `card ${f2Page.cardId}`,
);
check(
  "T9b it is the DETAIL render, which the listing's row is not — its own receipts scope",
  f2Page.cardReceipts === true,
  `inside the detail-card shell: ${f2Page.cardReceipts}`,
);
check(
  "T9c and that render carries the Explanation pane the listing row has no room for",
  /explanation/i.test(f2Page.cardExplanation),
  f2Page.cardExplanation || "(no heading buttons on the card)",
);
check(
  "T9d and its shares are the PAGE's own reading, not a second block's",
  f2Page.cardSharesRaw === warmOwn.balance.toString(),
  `card ${f2Page.cardSharesRaw}, own balanceOf ${warmOwn.balance}`,
);

// ═══ 10 — the fixtures still are what they were ═══════════════════════════
check(
  "10a F2 and F5 still hold a positive balance — an exited fixture makes every check above it vacuous",
  f2Own.balance > 0n && f5Own.balance > 0n,
  `F2 ${f2Own.balance}, F5 ${f5Own.balance}`,
);
check(
  "10b F5 is still the largest Tier 0 life, F6 still Tier 1, and the ceiling fixture still Tier 2",
  f5Own.transfers > 3000 &&
    f5Own.transfers <= HORIZON &&
    t5cold != null &&
    t5cold.coverage.logCount > HORIZON &&
    t5cold.coverage.logCount <= CEILING &&
    ownCeiling.transfers > CEILING,
  `F5 ${f5Own.transfers} rows, F6 ${t5cold?.coverage.logCount ?? "unread (T5a)"}, ceiling ${ownCeiling.transfers}`,
);

await browser.close();
console.log(`\n${passes}/${passes + failures} checks passed${skipped ? ` · ${skipped} SKIP` : ""}`);
process.exit(failures ? 1 : 0);
