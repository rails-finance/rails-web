#!/usr/bin/env node
// The boundary — the cut's own statement at the end of a drawn list, on every
// timeline that draws fewer rows than the position has (rails-ops decision
// 0019), and ONE CUT of 1,000 on every arm (its 2026-09-10 amendment).
// ----------------------------------------------------------------------------
//
// ── ⚠️ THE CARD BECAME A BARE SPINE NODE ON 2026-09-11, EVERYWHERE ──────────
//
// This script was written against a CARD: a row after the oldest drawn one,
// carrying "+N earlier events", the brought-forward balance, by-type and
// by-asset histograms of the omitted events, a range pill, a span in days and
// a sentence naming the CSV. Miles withdrew its body under `?nav=1` that
// morning — "just the layer icon in the spine and no event at all in the
// protocol" — and the flag came off the same evening, so what ends a drawn
// list now is the spine's `Layers` glyph and nothing beside it, on every
// family and in both sort orders.
//
// THE CARD SURVIVES ON EXACTLY ONE SHAPE OF PAGE: a list with NO drawn rows at
// all, where the node would terminate nothing and a lone glyph on a blank
// panel would state nothing. Two fixtures here are that shape today (the
// seeded Base wallets whose whole life sits before their seed's cut), and the
// checks branch on the page's own row count rather than on a fixture flag, so
// a wallet that gains its first drawn row moves itself across.
//
// WHAT STOPPED BEING VERIFIABLE ON A DRAWN LIST, stated once here rather than
// left as gaps: the brought-forward balance and the state lines (group 3), the
// small print's drawn/remaining sentence and the range pill (group 6), and the
// CSV sentence (group 11). The first of those is the real loss — "At block N,
// <date>, the position held X" is now stated NOWHERE on the page. The CSV rule
// is not lost with its sentence: `downloadCsv` refuses to write a short file
// and says by how much, so the sentence was a pointer and the menu is the
// guard.
//
// Opens each fixture in a real browser (the boundary renders after the list's
// own paging is exhausted, which no route check can see) and asserts, per
// fixture:
//
//   1  the boundary is present in the right FORM for the page — the bare spine
//      node on a drawn list, the card on a list with no rows — and it is the
//      LAST element of the list, after the local paging has drawn every
//      loaded row;
//
//      ⚠️ THE `?order=asc` HALF IS DELETED (2026-09-12) along with the order
//      itself — see useTimelineEvents's header. It asserted the same boundary
//      standing FIRST on an ascending list; its newest-first twin (last
//      element, bare) is untouched above, so what went is a second view of one
//      rule, not the rule. The same goes for check 10's ascending half;
//   2  the page states the shortfall the glyph stands for. With the card's
//      count withdrawn, the toolbar's count line is the only place it is said,
//      so the check is that the line takes its cut form and names a total
//      above the listed count — NOT that a figure equals itself, which is what
//      re-pointing the old card-versus-line check at the line would have been.
//      Row numbers, where shown, still run over the whole history: the newest
//      row's pill reads `total`, the oldest drawn row's reads `omitted + 1`;
//   3  the page's omitted count equals the arm's own — a Base fixture's
//      against the route's `coverage.omitted.count`, a vault fixture's against
//      the wrapper's `data-vault-timeline-rows/of` — read from the route on
//      the same run, never pasted, and taken off the count line where the card
//      is gone. The STATE LINES (the oldest served row's `*Before` fields, or
//      the replay's `stateAtCut`) are checked only where the card still draws;
//      on a drawn list the group reports what the page no longer says;
//   4  the offer sentence ("… complete timeline on request." / "… produce it
//      on request.") is present exactly once where the card draws, and NOWHERE
//      on a drawn list. The assertion inverts rather than disappearing: a
//      deletion that leaves no check behind is how a sentence comes back in a
//      different component six months later;
//   5  the retired sentences are absent: the windowed arm's leading notice
//      ("balance brought forward", "Reading the opening balance"), the
//      footer's "earlier events are not listed", and the ceiling footer's
//      "This list is capped";
//   6  THE CUT IS 1,000 PLUS THE ANCHORED ROWS, GIVE OR TAKE A SHARED BOUNDARY
//      BLOCK: `listed` on every cut fixture whose served rows reach the cut
//      is the cut plus the wallet-signed rows the Base route anchored from
//      below it (`omitted.anchored`, read off the route on this run, seeded
//      or not; a seeded heavy wallet draws the tail after its seed's cut,
//      which can be shorter — `tail` fixtures assert the tail is under the
//      cut where nothing was anchored, and take the same bound where the tail
//      reached the cut), the count line reads "Showing N of M events", and
//      the newest pill is `M`. Beside it, `omitted.anchoredComplete` states
//      the guarantee ("everything the wallet signed is drawn") exactly where
//      no seed stands in: true on an unseeded read, false on a `tail` (seeded)
//      one, whose seed's rows were never there to anchor. The cut is read from
//      `_timeline-window.mjs` rather than written here, so raising it moves
//      the check with it;
//   7  no control past the cut: the toolbar carries no cloud (the retired
//      "load the rest") and the list no "Load N earlier events" button;
//   8  the NEWEST row is on the page (`newest` fixtures): the position's
//      listing row names its last transaction, the timeline route's newest
//      event carries the same hash, and the page's first row is that event —
//      the regression that matters on the pages that used to sit on the
//      index's ORDER BY ASC ceiling, which dropped the newest rows;
//   9  the header's liquidation count is the WHOLE life's (`liquidations`
//      fixtures): the Base listing's index count equals the badge on the
//      position card, on a wallet whose liquidations sit before the cut;
//  11  the CSV download is offered only where it can be whole: a page with the
//      export menu and a total within its arm's one-answer ceiling says so
//      in the small print (`csv: true`); a page over its ceiling, and a
//      vault holder page (no export menu), does not (`csv: false`). Only where
//      the card still draws — see the note above on where the guard actually
//      lives;
//  12  THE PILLS SUM TO THE COUNT, on every cut the Base route states (the
//      wallet-wide `coverage.omitted`, each Comet market's `omitted`, each
//      Morpho position's): `omitted.count` equals the sum of `summary.byType`,
//      and of `summary.byAsset` where the replay states one. Both figures
//      come off the route on the same run. The anchored render cut (rails-ops
//      reference/timeline-attention-budget.md, adjustment 1) is where the two
//      part company if anything does: a wallet-signed row below the cut is
//      DRAWN, so it must be in neither the count nor a pill — and until
//      decision 0019 leg A the Moonwell replay counted it into the pills
//      before deciding to draw it. On the Aave-family arms a liquidation is
//      listed under BOTH its assets (the debt reserve and the seized
//      collateral) by design, so there the by-asset sum is bounded instead:
//      at least the count, at most the count plus the elided liquidations.
//      A seeded cut carries a count and no breakdown, and reports so. The
//      `moonwell-base-anchored` fixture is ROUTE-ONLY (`routeOnly`): the
//      exploiter wallet whose 21 anchored rows exposed the double count, read
//      without a browser because the figures live on the route alone;
//  10  the pulsing dot marks the TIP — the newest event — never a list
//      position: exactly one dot on the page, inside the newest row's spine
//      column (the first row, or a live market-note row standing above it),
//      and never inside the boundary's own column, in EITHER of its forms.
//
//      ⚠️ AND NOT AT ALL ON A CLOSED POSITION (2026-09-11, `f1027e1f`): a dot
//      on a position that has ended claims it is still running. So the check
//      first reads whether the position is open, off the tenure eyebrow's own
//      words — "Active since <date>" against "Opened <date>" — and expects no
//      dot on a closed one. A page where neither phrase is found is REPORTED
//      as unreadable rather than assumed open: three fixtures here are closed
//      positions, and a check that quietly treated an unreadable page as open
//      would have gone red on all three for the wrong reason. A list with NO
//      DRAWN ROWS answers before tenure is consulted — it has no eyebrow to
//      read, because the eyebrow is reduced from the rows, and no row for a
//      dot to sit on either way. So does a VAULT HOLDER page, for a different
//      reason: a share-transfer replay has no open/closed concept, the tip fix
//      deliberately left those call sites unthreaded, and no eyebrow is drawn
//      — there "unreadable" is the expected reading, not a failure;
//  13  THE SPAN IS STATED ONCE, where the card draws: the header carries the
//      two dates in the rows' own register ("11 May '26 – 19 Aug '26"), once,
//      and the long-format pair ("11 May 2026 – 19 Aug 2026") appears nowhere
//      on the card. The `Span` stat box holds the day count alone, `N days`,
//      and on a Base fixture that count is the route's own: the cut summary's
//      `lastAt − firstAt` in days, rounded, read on the same run (a summary
//      that carries no dates leaves the format check standing on its own).
//      The state box's label still names the cut date in the long format
//      beside the block number — a different fact, the cut block's date, and
//      not a second statement of the span, so it is excluded from the count.
//      On a drawn list the card is withdrawn and the group reports so;
//   C  a control — a position under its arm's cut — draws NO boundary at all,
//      card or bare node.
//
// Rows are read with run-collapsing OFF and row numbers ON (set in storage
// before the page's scripts run), so every row's pill is in the DOM; the
// reads are scoped to the FIRST timeline on the page (a wallet on two Comets
// draws one per market, each with its own toolbar, pills and card).
//
// Fixtures are pinned by identity (2026-09-10); every count is derived from
// the page and the route on the run. Wallets found from the listings by
// activity that day: Compound V2 0xa2b4… (44,896 events), Morpho ETH
// 0xb8fc…-0xb8a4… (5,605), Compound V3 Base 0x5c38… (97,086), Morpho Base
// 0xc047… (5,589 in market 0x9103…); from the onboarding box's account tables the same
// day: Moonwell Base 0x11a0… (2,961 events, served whole by the index), Aave
// V3 Base 0x2017… (5,366 events, 9 liquidations in the index's count), the
// vault holders by transfer count. The Aave V3 Base and Seamless seeded
// wallets draw ZERO rows today (their whole life sits before the seed's cut):
// the card then stands alone on the spine, which is its own case (check 1
// reads "only element").
//
//   BASE=http://localhost:3000 node scripts/verify/verify-timeline-boundary-card.mjs
//   ONLY=spark,vault-eth …   run a subset (fixture ids)
//
// ── PROVED IT CAN FAIL ──────────────────────────────────────────────────────
//   2026-09-10 (the card): its label pointed at `omitted + 1` (a one-line edit
//   in timeline-boundary-card.tsx) → on spark: FAIL 2 "card says 27,853, count
//   line → 27,852" and FAIL 2 "oldest pill 27,853 (omitted + 1 = 27,854)";
//   restored → 7/7. The same day, run in slices: 115/115 across 20 fixtures.
//   2026-09-10 (the cut): `TIMELINE_WINDOW_EVENTS = 999` locally → 7 reds on
//   spark, aave-v3-base-2000 and vault-eth-mid — "listed === 1,000 exactly —
//   listed 999" and "card count = M − 1,000 — card 27,861, M 28,860" on each
//   arm (and spark's state line, since the route fixture still asked for
//   1,000) — 38/45; restored → 15/15 on aave-v3-base-2000. Run in slices
//   against a local dev server the same day: 24 fixtures, all green (the
//   tally is in the session report).
//   2026-09-16 (the pills, check 12): one anchored row re-admitted to the
//   Moonwell histograms — the `!anchored` guard on the `cutTypes`/`cutAssets`
//   accumulation in lib/sources/chain/moonwell-events.ts taken off, which is
//   exactly the state before decision 0019 leg A — → on moonwell-base-anchored:
//   FAIL 12 "the by-type pills sum to omitted.count — pills 1,407, count
//   1,386, anchored 21" and the same for by-asset; restored → PASS on both,
//   the 21 gone from the pills and the count unchanged.
//   2026-09-16 (the flag, check 6): `anchoredComplete` forced true behind
//   the Comet seed (the per-market `s.seed == null` in
//   lib/sources/chain/compound-v3-events.ts replaced by `true`) → on
//   compound-base: FAIL 6 "omitted.anchoredComplete states the guarantee
//   exactly where no seed stands in — anchoredComplete true, expected false
//   (seeded: the seed's rows were never there to anchor), anchored 444";
//   restored → PASS, 101/101 across the whole Base arm. Before the flag
//   existed the same fixture was the one red in the run — "a seeded tail
//   shorter than the cut is drawn whole — listed 1,344 (cut 1,000)" —
//   because the anchored count was withheld beside a seed and the check
//   could not see the 444 rows the weth market drew.
//   2026-09-17 (the span, check 13): the check written against the card as
//   it stood, the Span box still carrying the long-format pair after the day
//   count → on aave-v3-base: FAIL 13 "the span is stated once, in the header,
//   in the rows' register — rows' register 1 (expected 1), long format 1" and
//   FAIL 13 "the Span box holds the day count alone — box '2 days 27 Nov 2024
//   – 29 Nov 2024'"; the same pair on seamless ("928 days 23 Feb 2024 – 8 Sept
//   2026"); 37/41 over aave-v3-base, seamless and aave-v3-base-2000 (whose
//   drawn list has no card to read). The pair taken out of the box → green,
//   and the day count equal to the route's cut summary in days on both.
//   2026-09-21 (the grouped fixture): `boundaryAtBottom` gated off wherever
//   the list is served rows (`&& !servedRows` in chain-truth-timeline.tsx),
//   against a local server on the onboarding api → 10/11 on
//   `aave-v3-grouped`, check 1 alone red ("914 row(s): 0 card(s), 0 bare
//   row(s)"); restored → 11/11.

import { chromium } from "playwright";
import { RECENT_QS, TIMELINE_WINDOW_ROWS } from "./_timeline-window.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null;
// The cut, read from the constant the pages themselves use — never written
// here. A literal would keep asserting the old number on the day it moves, and
// a check comparing a window against a different window goes quiet, not red.
const CUT = TIMELINE_WINDOW_ROWS;
// Enough presses to draw a list the anchor has lengthened (check 6): the
// Aave V3 Base fixture 0x2017… draws 5,364 rows, 50 a press.
const PAGE_CLICKS_MAX = 200;
const PRESS = () =>
  [...document.querySelectorAll("button")].some((b) => {
    if (!/^Show \d+ more$/.test(b.textContent?.trim() ?? "")) return false;
    b.click();
    return true;
  });

/** id · path · arm · route (for the state/omitted cross-check) · control ·
 *  tail (a seeded heavy wallet whose drawn rows are the tail after the seed's
 *  cut, fewer than the window) · newest (listing route naming the last tx) ·
 *  liquidations (listing route carrying the index's whole-life count) */
const FIXTURES = [
  // mainnet window (1,000 newest + opening balance)
  {
    id: "aave-v3",
    arm: "window",
    // `folders=0` PINNED, here and on `spark` below: this arm is checked
    // against the FLAT `route`, and grouping became these two families' page
    // default on 2026-09-12. The grouped page of the same position is
    // `aave-v3-grouped` below.
    //
    // A user position (2026-09-21): 0xee7c…2954 is in neither
    // `protocol_plumbing_contracts` nor the router flag. Until then this was
    // CoW's settlement contract 0x9008…ab41, which decision 0024 rules is
    // protocol plumbing.
    path: "/ethereum/aave-v3/0xee7ca610d896c53ffe716b801c05748efd902954?folders=0",
    route: `/api/aave-v3/timeline?market=core&wallet=0xee7ca610d896c53ffe716b801c05748efd902954&${RECENT_QS}`,
  },
  {
    // THE CARD SURVIVES GROUPING (decision 0019's evening amendment): the same
    // position on its DEFAULT page, answered in folders, still exceeds the cut
    // after grouping — 1,000 rows (86 folders beside 914 events) of 7,150
    // events on 2026-09-21 — so the list still ends in the boundary. The cut
    // counts ROWS here, so the count line takes its grouped form, "Showing
    // <rows> rows of <total> events", and the route asserted is the grouped
    // one: `boundBy: "rows"` and as many rows as the line names.
    id: "aave-v3-grouped",
    arm: "grouped",
    path: "/ethereum/aave-v3/0xee7ca610d896c53ffe716b801c05748efd902954",
    route: "/api/aave-v3/timeline?market=core&wallet=0xee7ca610d896c53ffe716b801c05748efd902954&group=1",
  },
  {
    id: "spark",
    arm: "window",
    path: "/ethereum/spark/0x1601843c5e9bc251a3272907010afa41fa18347e?folders=0",
    route: `/api/spark/timeline?wallet=0x1601843c5e9bc251a3272907010afa41fa18347e&${RECENT_QS}`,
    // A former ceiling-arm page (28k events): the newest row must be on it.
    newest: "/api/spark/positions?wallet=0x1601843c5e9bc251a3272907010afa41fa18347e",
    // 28k events, under the ceiling: the small print offers the CSV.
    csv: true,
  },
  {
    id: "maple",
    arm: "window",
    path: "/ethereum/maple/0x134ccaaa4f1e4552ec8aecb9e4a2360ddcf8df76",
    route: `/api/maple/timeline?wallet=0x134ccaaa4f1e4552ec8aecb9e4a2360ddcf8df76&${RECENT_QS}`,
  },
  {
    id: "compound-v3",
    arm: "window",
    path: "/ethereum/compound-v3/usdc/0xe7f525dd1bc6d748ae4d7f21d31e54741e05e110",
    route: `/api/compound/timeline?market=usdc&wallet=0xe7f525dd1bc6d748ae4d7f21d31e54741e05e110&${RECENT_QS}`,
    afterOnly: true,
  },
  // Liquity V1's deepest wallet (1,482 events) holds THREE lives, and the
  // page fetches a multi-life wallet whole and draws the current life (11
  // events) — the window is declined at that grain (its view says why). So
  // no Liquity V1 page is windowed today, and this is a no-card control.
  { id: "liquity-v1", control: true, path: "/ethereum/liquity-v1/0x0561a78021d8966ddd20c28c6c4318d8675ee1f0" },
  { id: "fluid", arm: "window", path: "/ethereum/fluid/1566", route: `/api/fluid/timeline?nft=1566&${RECENT_QS}` },
  {
    id: "compound-v2",
    arm: "window",
    path: "/ethereum/compound-v2/0xa2b47e3d5c44877cca798226b7b8118f9bfb7a56",
    route: `/api/compound-v2/timeline?wallet=0xa2b47e3d5c44877cca798226b7b8118f9bfb7a56&${RECENT_QS}`,
  },
  {
    id: "morpho",
    arm: "window",
    path: "/ethereum/morpho/b8fc70e82bc5bb53e773626fcc6a23f7eefa036918d7ef216ecfb1950a94a85e-0xb8a451107a9f87fde481d4d686247d6e43ed715e",
    afterOnly: true,
  },
  // Base gated (whole-life replay, newest rows drawn)
  {
    id: "aave-v3-base",
    arm: "base",
    tail: true,
    path: "/base/aave-v3/0x7ac2887e026e4239416aac6483c15df05a04a92e",
    route: "/api/chain/aave-v3-base/timeline?wallet=0x7ac2887e026e4239416aac6483c15df05a04a92e",
  },
  {
    id: "aave-v3-base-2000",
    arm: "base",
    path: "/base/aave-v3/0xe883426b4fc84a7f5cc86415cabbef43e73a4cc8",
    route: "/api/chain/aave-v3-base/timeline?wallet=0xe883426b4fc84a7f5cc86415cabbef43e73a4cc8",
  },
  {
    id: "aave-v3-base-liquidated",
    arm: "base",
    path: "/base/aave-v3/0x20172ec3d9cb14cb555aa5b612e50d30b97485dd",
    route: "/api/chain/aave-v3-base/timeline?wallet=0x20172ec3d9cb14cb555aa5b612e50d30b97485dd",
    liquidations: "/api/aave-v3-base/positions?wallet=0x20172ec3d9cb14cb555aa5b612e50d30b97485dd",
  },
  {
    id: "moonwell-base",
    arm: "base",
    // `folders=0` PINNED on both Moonwell Base fixtures, for the reason the
    // window arm pins it above: grouping became this page's default with leg C
    // of `0019` (2026-09-13), and the base arm is checked against the FLAT
    // `route`, whose render cut is what draws the boundary.
    tail: true,
    path: "/base/moonwell/0xbc8dd54d1ae1b738b40ffddccee1428b178fa80b?folders=0",
    route: "/api/chain/moonwell-base/timeline?wallet=0xbc8dd54d1ae1b738b40ffddccee1428b178fa80b",
  },
  {
    id: "moonwell-base-cut",
    arm: "base",
    path: "/base/moonwell/0x11a020d80b0a4468bf45888a0ab33cf4169f520a?folders=0",
    route: "/api/chain/moonwell-base/timeline?wallet=0x11a020d80b0a4468bf45888a0ab33cf4169f520a",
  },
  {
    // The Moonwell Base exploiter (2,407 events, 21 of them owner-signed rows
    // below the cut): the wallet on which the anchored rows were counted into
    // the boundary's pills as well as drawn (decision 0019 leg A). Route only
    // — check 12 reads the count and the pills off the route, and the page
    // adds nothing to that statement. `anchored` asserts the route DID anchor
    // rows here, so the check is known to have a subject.
    id: "moonwell-base-anchored",
    arm: "base",
    routeOnly: true,
    anchored: true,
    route: "/api/chain/moonwell-base/timeline?wallet=0x719eae70d4a83f35bf82a2740699f5db84be919d",
  },
  {
    id: "seamless",
    arm: "base",
    tail: true,
    path: "/base/seamless/0x258730e23cf2f25887cb962d32bd10b878ea8a4e",
    route: "/api/chain/seamless/timeline?wallet=0x258730e23cf2f25887cb962d32bd10b878ea8a4e",
  },
  {
    id: "compound-base",
    arm: "base",
    tail: true,
    path: "/base/compound-v3/0x5c38a0ab51ac64d93203247eefbc5b6b3ee7f4f6",
    route: "/api/chain/compound-base/timeline?wallet=0x5c38a0ab51ac64d93203247eefbc5b6b3ee7f4f6",
  },
  {
    id: "morpho-base",
    arm: "base",
    // The wallet page is a roster; the timeline is the (wallet, market) page.
    path: "/base/morpho/0xc047a11b00ec9fae2355b4506d17e3c84d7f9437/0x9103c3b4e834476c9a62ea009ba2c884ee42e94e6e314a26f04d312434191836",
    route: "/api/chain/morpho-base/timeline?wallet=0xc047a11b00ec9fae2355b4506d17e3c84d7f9437",
    grouped: true,
  },
  // vault (the loader's draw window)
  {
    id: "vault-eth",
    arm: "vault",
    path: "/ethereum/aave/vaults/0x7bc3485026ac48b6cf9baf0a377477fff5703af8/0x634826fb67d4eb9633f0011fae8e23cf99acd6f0",
    // No export menu on a vault holder page: never a CSV offer.
    csv: false,
  },
  {
    // 3,958 transfers: under the old 5,000 window, cut by the one of 1,000.
    id: "vault-eth-mid",
    arm: "vault",
    path: "/ethereum/aave/vaults/0x0bfc9d54fc184518a81162f8fb99c2eaca081202/0xaafd07d53a7365d3e9fb6f3a3b09ec19676b73ce",
  },
  {
    id: "vault-base",
    arm: "vault",
    path: "/base/morpho/vaults/0x6b13c060f13af1fdb319f52315bbbf3fb1d88844/0x5773e329824d3120fd253d1ce94ab7705fe77432",
  },
  // controls — under the cut, no card
  { id: "control-spark", control: true, path: "/ethereum/spark/0x9988b7f353737aef52ad8391a917a901a45493c9" },
  {
    id: "control-liquity-v2",
    control: true,
    path: "/ethereum/liquity-v2/trove/rETH/15819037836432619065432019909407415740867073754834407017193922594371690360030",
  },
  {
    // 910 transfers — under the cut.
    id: "control-vault",
    control: true,
    // The arm matters even on a control: a vault holder page has no open/closed
    // concept for the tip rule to consult. See `noTenure` below.
    arm: "vault",
    path: "/ethereum/aave/vaults/0x0bfc9d54fc184518a81162f8fb99c2eaca081202/0x99719e434ec7e5bf587599e4ca55817b3baceb8a",
  },
];

let passes = 0;
let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (cond) passes++;
  else failures++;
};
const info = (name, detail) => console.log(`INFO  ${name} — ${detail}`);
const num = (s) => Number(String(s).replace(/,/g, ""));
const n = (v) => Number(v).toLocaleString("en-US");
/** The card's hover title is the row formatter's own rounding (2, 4 or 6
 *  decimals by magnitude — `formatCompact`), so a route figure matches when it
 *  rounds to the title: within half a unit of the title's last decimal. */
const close = (shown, exact, title = String(shown)) => {
  const decimals = (String(title).split(".")[1] ?? "").length;
  return Math.abs(shown - exact) <= 0.5 * 10 ** -decimals + 1e-9;
};

const RETIRED = [
  "balance brought forward",
  "Reading the opening balance",
  "earlier events are not listed",
  "This list is capped",
];

/** Row numbers on, light theme — set before any script of the page runs. */
const INIT = `
  try {
    const k = "timeline-display-v3";
    const cur = JSON.parse(localStorage.getItem(k) || "{}");
    // Row numbers on; run-collapsing off, so every row's pill is in the DOM
    // (a collapsed run draws one row for its members and no member pills).
    localStorage.setItem(k, JSON.stringify({ ...cur, showEventNumbers: true, collapseRuns: false }));
    localStorage.setItem("theme", "light");
  } catch {}
`;

/** Wait for the toolbar's count line, then draw every loaded row by pressing
 *  the list's own "Show N more" until it is gone. Returns the press count, or
 *  -1 when the cap was hit. */
async function settle(page) {
  await page.waitForSelector("[data-prov-exempt] span.text-xs.tabular-nums", { timeout: 300_000 });
  // The Base arms fetch client-side; give the sweep/index read its time.
  await page.waitForFunction(
    () => {
      const t = document.querySelector("[data-prov-exempt] span.text-xs.tabular-nums")?.textContent ?? "";
      return /\d/.test(t);
    },
    { timeout: 180_000 },
  );
  // HYDRATION, not just paint: the count line is server-rendered, and a press
  // before React has attached its handlers is lost (the pre-hydration click
  // window). The row-number pills only render after the display flag is
  // restored from storage in an effect — so a pill (or the card itself, on a
  // list with no rows) is the sign the page is live.
  await page.waitForFunction(
    () =>
      document.querySelector('span[aria-label^="Event "]') != null ||
      document.querySelector('[data-figure="timeline-boundary"]') != null ||
      document.querySelector('[data-boundary-row="cut"]') != null,
    { timeout: 180_000 },
  );
  // A windowed page's opening balance is a second request (about 6 s on the
  // deepest Aave V3 wallet, past the server tail's budget): until it lands
  // the count line reads "Showing 1,000 listed" with no total and the card is
  // in its "being counted" form. Wait for the total, within reason.
  await page
    .waitForFunction(
      () =>
        !/listed$/.test(
          (document.querySelector("[data-prov-exempt] span.text-xs.tabular-nums")?.textContent ?? "").trim(),
        ),
      { timeout: 90_000 },
    )
    .catch(() => {});
  // ⚠️ HYDRATION, AND NOT MERELY THE FIGURES. The waits above are all about
  // CONTENT — a count line with a number in it, a total that has stopped
  // reading "listed" — and content is server-rendered, so all of them can be
  // satisfied while React has not yet attached a single handler. Every press
  // this script makes after this point is then swallowed: the "Show more"
  // paging, and the click that opens the card's explanation pane.
  //
  // It cost a whole diagnosis on 2026-09-11. The same fixture passed "the
  // offer sentence is present once" on one run and failed it on the next with
  // identical code — a loaded box simply hydrated the Base pages later, the
  // pane never opened, and the check reported the sentence missing from a page
  // that had it. `data-ctrl-waking` is the control strip's own statement that
  // it is not live yet; waiting for it to clear is the only honest gate.
  await page.waitForFunction(() => document.querySelector("[data-ctrl-waking]") == null, { timeout: 120_000 });
  await page.waitForTimeout(300);
  // Pressed from inside the page: a Playwright click scrolls the button into
  // view first, which trips the list's own scroll sentinel and re-renders the
  // button out from under the click.
  let presses = 0;
  for (; presses < PAGE_CLICKS_MAX; presses++) {
    let pressed = await page.evaluate(PRESS);
    if (!pressed) {
      // A second look: the button re-renders after a press.
      await page.waitForTimeout(600);
      pressed = await page.evaluate(PRESS);
      if (!pressed) break;
    }
    await page.waitForTimeout(400);
  }
  if (presses >= PAGE_CLICKS_MAX) return -1;
  await page.waitForTimeout(400);
  return presses;
}

/** listed/total off the toolbar line. `whole` when the line names no cut;
 *  `cutForm` when it is the amended "Showing N of M events" form. */
function parseCountLine(text) {
  const t = text.replace(/\s+/g, " ").trim();
  // Cut, unfiltered — the amended form.
  let m = t.match(/^Showing ([\d,]+) of (at least )?([\d,]+) events$/);
  if (m) return { listed: num(m[1]), total: num(m[3]), floor: !!m[2], cutForm: true };
  // Cut, unfiltered, answered in folders — `listed` counts ROWS, a folder one.
  m = t.match(/^Showing ([\d,]+) rows of (at least )?([\d,]+) events$/);
  if (m) return { listed: num(m[1]), total: num(m[3]), floor: !!m[2], cutForm: true, rows: true };
  // Cut, filtered — the ratio over the listed rows, the total beside it.
  m = t.match(/^Showing [\d,]+ of ([\d,]+) listed · (at least )?([\d,]+) events$/);
  if (m) return { listed: num(m[1]), total: num(m[3]), floor: !!m[2], cutForm: true };
  // Cut, total pending (window arm before the opening balance lands).
  m = t.match(/^Showing (?:[\d,]+ of )?([\d,]+) listed$/);
  if (m) return { listed: num(m[1]), total: null, floor: false, cutForm: true };
  // Whole.
  m = t.match(/^(?:[\d,]+ of )?([\d,]+) events?$/);
  if (m) return { listed: num(m[1]), total: num(m[1]), floor: false, whole: true };
  return null;
}

/** The small print sits in the card's (i) pane, which the event-card shell
 *  mounts only when opened — open it before reading.
 *
 *  ⚠️ IT WAITS FOR THE TRIGGER NOW. It used to count the locator ONCE and do
 *  nothing if the button had not mounted yet, which made every check that
 *  reads the pane flaky: observed 2026-09-11 passing and failing on the same
 *  fixture and the same code, minutes apart, under a loaded box — "the offer
 *  sentence is present once — 0 in card, 0 on page" against a page that had
 *  the sentence and had simply not been asked to show it. A check that depends
 *  on an interaction has to wait for the thing it interacts with; a
 *  count-and-shrug reads as a verdict about the page. */
async function openSmallPrint(page) {
  const trigger = page.locator('[data-figure="timeline-boundary"] button[aria-expanded="false"]').first();
  // No card at all is the ordinary case now (a drawn list ends in the bare
  // spine node), so a miss here is not a failure — it is "nothing to open".
  if ((await page.locator('[data-figure="timeline-boundary"]').count()) === 0) return;
  try {
    await trigger.waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    return;
  }
  // Twice if need be, and the SECOND press is the point: a press that lands
  // before its handler is attached leaves the button looking exactly as it did
  // and returns success, so "clicked" is not evidence that anything opened.
  for (let i = 0; i < 2; i++) {
    await trigger.click().catch(() => {});
    const opened = await page
      .locator('[data-figure="timeline-boundary"] button[aria-expanded="true"]')
      .first()
      .waitFor({ state: "visible", timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (opened) break;
    await page.waitForTimeout(1_000);
  }
  await page.waitForTimeout(300);
}

async function readPage(page) {
  await openSmallPrint(page);
  return page.evaluate(() => {
    // Scoped to the FIRST timeline on the page: a wallet on two Comets draws
    // one timeline per market, each with its own toolbar, pills and card.
    //
    // ⚠️ THE CUT'S BOUNDARY IS A BARE SPINE NODE NOW, not a card (2026-09-11)
    // — see the header. The card survives on ONE shape of page, the list with
    // no rows at all, so both are read and the checks branch on which is
    // there rather than on a fixture flag: a wallet that gains its first
    // drawn row flips that branch by itself.
    const cards = [...document.querySelectorAll('[data-figure="timeline-boundary"]')];
    const cutRows = [...document.querySelectorAll('[data-boundary-row="cut"]')];
    const card = cards[0] ?? null;
    // ⚠️ THE ANCHOR TAKES THE BOUNDARY IN EITHER FORM, and that matters. An
    // earlier reader found the CARD and fell back to `document` when there was
    // none — harmless while every windowed page drew a card, and a silent
    // widening the day the card was withdrawn (2026-09-11): on a wallet with
    // two Comets the fallback counted the dots of BOTH timelines and reported
    // "2 dot(s)" against a page that was perfectly correct. A scoping fallback
    // is a check quietly changing its subject.
    const anchor = card ?? cutRows[0] ?? null;
    const root = anchor?.parentElement?.parentElement ?? document;
    const line = root.querySelector("[data-prov-exempt] span.text-xs.tabular-nums")?.textContent ?? "";
    let label = null,
      state = [],
      offerInCard = 0,
      position = null,
      siblings = 0,
      smallPrint = "",
      rangePill = null,
      meta = null,
      spanBox = null,
      cardText = "";
    if (anchor && !card) {
      const parent = anchor.parentElement;
      const kids = parent ? [...parent.children] : [];
      siblings = kids.length;
      position = kids.indexOf(anchor);
    }
    if (card) {
      label = card.querySelector(".text-sm.font-medium")?.textContent?.trim() ?? null;
      rangePill = card.querySelector("[data-boundary-range]")?.getAttribute("data-boundary-range") ?? null;
      state = [...card.querySelectorAll("dd[title]")].map((dd) => ({
        label: dd.previousElementSibling?.textContent?.trim() ?? "",
        title: dd.getAttribute("title") ?? "",
      }));
      offerInCard = (card.textContent.match(/(?:complete timeline|produce it) on/g) ?? []).length;
      smallPrint = card.textContent ?? "";
      // The header's meta slot (the span, then the range pill) and the `Span`
      // stat box, read by its label so the two are never parsed out of the
      // card's text twice. The box's body is the text after its label.
      meta = card.querySelector(".evt-meta > span")?.textContent?.trim() ?? null;
      const spanLabel = [...card.querySelectorAll(".text-xs.font-semibold")].find(
        (el) => el.textContent?.trim() === "Span",
      );
      spanBox = spanLabel ? (spanLabel.parentElement?.textContent ?? "").replace(/^Span/, "").trim() : null;
      cardText = card.innerText ?? card.textContent ?? "";
      const parent = card.parentElement;
      const kids = parent ? [...parent.children] : [];
      siblings = kids.length;
      position = kids.indexOf(card);
    }
    const pills = [...root.querySelectorAll('span[aria-label^="Event "]')].map((s) => Number(s.textContent));
    const body = document.body.textContent ?? "";
    const wrap = document.querySelector("[data-vault-timeline-rows]");
    // Any control past the cut: the retired toolbar cloud (aria-labelled
    // "Load the N events not yet listed" / "Every event is listed") or the
    // stepped "Load N earlier events" button.
    const capControls = [...document.querySelectorAll("button, [aria-label]")].filter((el) => {
      const a = el.getAttribute("aria-label") ?? "";
      const t = el.textContent?.trim() ?? "";
      return (
        /^Load the [\d,]+ events? not yet listed$/.test(a) ||
        a === "Every event is listed" ||
        /^Load [\d,]+ earlier events?$/.test(t)
      );
    }).length;
    const firstRow = root.querySelector("[data-event-id]");
    const tipDots = [...root.querySelectorAll("[data-spine-tip]")];
    const tipRows = [...root.querySelectorAll("[data-event-id], [data-market-note]")];
    const tip = {
      dots: tipDots.length,
      rows: tipRows.length,
      inEdge: tipDots[0] != null && tipRows[0] != null && tipRows[0].contains(tipDots[0]),
      // Never inside the boundary, in EITHER form: a boundary is not the tip,
      // whichever end of the list it stands at.
      inCard:
        tipDots[0] != null &&
        tipDots[0].closest('[data-figure="timeline-boundary"], [data-figure="timeline-boundary-row"]') != null,
      side: tipDots[0]?.getAttribute("data-spine-tip") ?? null,
    };
    const liqBadge = document.querySelector('[aria-label^="Liquidated "]')?.getAttribute("aria-label") ?? null;
    // OPEN OR CLOSED, in the page's own words. The tenure eyebrow reads
    // "Active since <date>" on a live position and "Opened <date>" on a closed
    // one (TimelineActivityHeader), and since 2026-09-11 the pulsing tip dot
    // is withheld from a closed position — a dot on a position that ended is a
    // claim that it is still running. Neither phrase found is not "open": it
    // is a page this check cannot read, and it is reported as one.
    const eyebrow = [...document.querySelectorAll("span")]
      .map((e) => (e.textContent ?? "").trim())
      .find((t) => /^(Active since|Opened) /.test(t) || t === "Active since —" || t === "Opened —");
    const tenure = eyebrow == null ? null : /^Opened/.test(eyebrow) ? "closed" : "open";
    return {
      line,
      cards: root === document ? cards.length : root.querySelectorAll('[data-figure="timeline-boundary"]').length,
      cardsOnPage: cards.length,
      cutRows: root === document ? cutRows.length : root.querySelectorAll('[data-boundary-row="cut"]').length,
      /** Drawn event rows. Zero is the shape where the card still stands. */
      rowCount: root.querySelectorAll("[data-event-id]").length,
      /** Served folder headers (a grouped page): one row each. */
      folderRows: root.querySelectorAll('[role="button"][aria-expanded][aria-label*=" consecutive "]').length,
      label,
      state,
      offerInCard,
      smallPrint,
      rangePill,
      meta,
      spanBox,
      cardText,
      position,
      siblings,
      pills,
      capControls,
      firstRowId: firstRow?.getAttribute("data-event-id") ?? null,
      tip,
      liqBadge,
      tenure,
      offerOnPage: (
        (root === document ? body : (root.textContent ?? "")).match(/(?:complete timeline|produce it) on/g) ?? []
      ).length,
      retired: [
        "balance brought forward",
        "Reading the opening balance",
        "earlier events are not listed",
        "This list is capped",
      ].filter((s) => body.includes(s)),
      vault: wrap
        ? {
            rows: Number(wrap.getAttribute("data-vault-timeline-rows")),
            of: Number(wrap.getAttribute("data-vault-timeline-of")),
          }
        : null,
    };
  });
}

/** Non-zero numeric `*Before` values of the oldest served event, from a
 *  mainnet timeline route — what the card's state lines restate. */
function beforeFiguresOf(json) {
  const events = json.events ?? [];
  if (events.length === 0) return null;
  const oldest = events.reduce((a, e) => (e.blockNumber < a.blockNumber ? e : a), events[0]);
  const data = oldest.context?.data ?? {};
  const out = [];
  const walk = (o) => {
    for (const [k, v] of Object.entries(o)) {
      if (k === "stateBefore" && v && typeof v === "object") {
        for (const [kk, vv] of Object.entries(v)) if (typeof vv === "number" && vv !== 0) out.push(vv);
      } else if (/Before$/.test(k) && (typeof v === "string" || typeof v === "number")) {
        const x = Number(v);
        if (Number.isFinite(x) && x !== 0) out.push(x);
      }
    }
  };
  walk(data);
  return out;
}

/** The newest event of a timeline route's list, by block. The route ships
 *  the lean wire shape (lib/shared/timeline-wire.ts): the tx hash rides as
 *  `h` when it is not already spelt inside the id, so the hash is read from
 *  whichever carries it. */
function newestEventOf(json) {
  const events = json.events ?? [];
  if (events.length === 0) return null;
  const e = events.reduce((a, x) => (x.blockNumber > a.blockNumber ? x : a), events[0]);
  const id = String(e.id ?? "").toLowerCase();
  const h = String(e.h ?? e.txHash ?? "").toLowerCase();
  const hasHash = (hash) => h === hash || (h === "" && id.includes(hash.replace(/^0x/, "")));
  return { ...e, hasHash };
}

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  return res.json();
}

/** The Base route's cut for the timeline the page drew first (matched by its
 *  omitted count, as check 3 matches it): how many wallet-signed rows the
 *  replay anchored from below it (`anchored`, undefined where the route does
 *  not anchor) and whether that is the whole set of wallet-signed rows down
 *  there (`complete`, the route's `omitted.anchoredComplete`, present exactly
 *  when `anchored` is). The route is read once per fixture and kept for the
 *  later groups. */
const routeCache = new Map();
const NO_ANCHOR = { anchored: undefined, complete: undefined };
async function anchoredOf(f, said) {
  if (!routeCache.has(f.route)) routeCache.set(f.route, await getJson(f.route));
  const json = routeCache.get(f.route);
  if (!json || json.error) return NO_ANCHOR;
  const groups = f.grouped ? (json.positions ?? []) : json.markets?.length ? json.markets : [json];
  const om = groups.map((p) => p.omitted ?? p.coverage?.omitted).filter((o) => o && o.count > 0);
  const o = om.find((o) => o.count === said) ?? om[0];
  return { anchored: o?.anchored, complete: o?.anchoredComplete };
}

/** 12 — the boundary's pills sum to its count, on every cut a Base route
 *  states. Both figures are the route's own, read on this run: a check that
 *  compared the pills with a pasted count would go quiet the day the wallet
 *  moved. `f.anchored` asserts the route anchored rows on this fixture, so a
 *  green here is known to have exercised the one case that can diverge. */
function checkHistograms(f, json) {
  if (json.error) {
    check(`12 ${f.id}: route answered`, false, json.error);
    return;
  }
  const groups = [
    { name: "wallet", om: json.coverage?.omitted },
    ...(json.markets ?? []).map((m) => ({ name: m.market, om: m.omitted })),
    ...(json.positions ?? []).map((p) => ({ name: `${String(p.marketId).slice(0, 10)}…`, om: p.omitted })),
  ].filter((g) => g.om && g.om.count > 0);
  if (groups.length === 0) {
    check(`12 ${f.id}: route reports a cut`, false, "no omitted count");
    return;
  }
  const sum = (buckets) => buckets.reduce((acc, b) => acc + b.count, 0);
  // Aave V3 Base and Seamless share one replay, and its by-asset histogram
  // lists an elided liquidation under both the debt reserve and the seized
  // collateral (lib/sources/chain/aave-v3-events.ts, `cutAssets`) — one row,
  // two assets touched. So the by-asset sum there is bounded, not equal.
  const aaveFamily = /^(aave-v3-base|seamless)/.test(f.id);
  for (const { name, om } of groups) {
    const s = om.summary ?? {};
    const tag = groups.length > 1 ? ` [${name}]` : "";
    const anchoredNote = om.anchored != null ? `, anchored ${n(om.anchored)}` : "";
    if (s.byType == null) {
      info(
        `12 ${f.id}${tag}: no by-type pills — a seeded cut carries a count, not a breakdown`,
        `count ${n(om.count)}`,
      );
    } else {
      const t = sum(s.byType);
      check(
        `12 ${f.id}${tag}: the by-type pills sum to omitted.count`,
        t === om.count,
        `pills ${n(t)}, count ${n(om.count)}${anchoredNote}`,
      );
    }
    if (s.byAsset != null) {
      const a = sum(s.byAsset);
      if (aaveFamily) {
        const liq = (s.byType ?? []).find((b) => b.key === "liquidation")?.count ?? 0;
        check(
          `12 ${f.id}${tag}: the by-asset pills sum to omitted.count plus at most one per elided liquidation`,
          a >= om.count && a <= om.count + liq,
          `pills ${n(a)}, count ${n(om.count)}, elided liquidations ${n(liq)}${anchoredNote}`,
        );
      } else {
        check(
          `12 ${f.id}${tag}: the by-asset pills sum to omitted.count`,
          a === om.count,
          `pills ${n(a)}, count ${n(om.count)}${anchoredNote}`,
        );
      }
    }
    if (f.anchored) {
      check(
        `12 ${f.id}${tag}: the route anchored rows from below the cut, so the check has a subject`,
        om.anchored > 0,
        `anchored ${om.anchored == null ? "absent" : n(om.anchored)}`,
      );
    }
  }
}

console.log(`Boundary card checks — against ${BASE}\n`);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });
await ctx.addInitScript(INIT);

for (const f of FIXTURES) {
  if (ONLY && !ONLY.has(f.id)) continue;
  // A route-only fixture: the figures it checks live on the route alone, so
  // no page is opened for it.
  if (f.routeOnly) {
    checkHistograms(f, await getJson(f.route));
    console.log("");
    continue;
  }
  const page = await ctx.newPage();
  page.setDefaultTimeout(180_000);
  try {
    await page.goto(`${BASE}${f.path}`, { waitUntil: "domcontentloaded" });
    const presses = await settle(page);
    const r = await readPage(page);
    const counts = parseCountLine(r.line);
    // A VAULT HOLDER PAGE HAS NO OPEN/CLOSED CONCEPT, so the tip rule that
    // withholds the dot from a closed position does not reach it — `f1027e1f`
    // left those two call sites unthreaded deliberately, because whether a
    // fully-withdrawn vault position counts as "closed" is a design call
    // nobody has made. It draws no tenure eyebrow either, so "unreadable" is
    // the correct and expected reading there rather than a failure, and the
    // dot is asserted exactly as it was before that fix.
    const noTenure = f.arm === "vault";

    if (f.control) {
      check(
        `C  ${f.id}: no boundary at all under the cut`,
        r.cards === 0 && r.cutRows === 0,
        `count line "${r.line}", ${r.cards} card(s), ${r.cutRows} bare row(s)`,
      );
      check(`C  ${f.id}: the count line names no cut`, counts?.whole === true, `"${r.line}"`);
      check(`5  ${f.id}: retired sentences absent`, r.retired.length === 0, r.retired.join("; "));
      check(`7  ${f.id}: no control past the cut`, r.capControls === 0, `${r.capControls} control(s)`);
      check(
        `10 ${f.id}: ${r.tip.rows === 0 ? "no rows, so no dot" : r.tenure === "closed" ? "a closed position draws no dot at all" : "one dot, on the newest row"}`,
        r.tip.rows === 0
          ? r.tip.dots === 0
          : r.tenure == null && !noTenure
            ? false
            : r.tenure === "closed"
              ? r.tip.dots === 0
              : r.tip.dots === 1 && r.tip.inEdge && r.tip.side === "above",
        `${r.tenure ?? "TENURE UNREADABLE"}: ${r.tip.dots} dot(s), ${r.tip.rows} rows, on the first row: ${r.tip.inEdge}`,
      );
      continue;
    }

    // 1 — present, and last (newest-first, paging exhausted).
    //
    // ⚠️ WHAT IS PRESENT CHANGED ON 2026-09-11: a drawn list ends in the bare
    // spine node, and only a list with NO rows still ends in the card. The
    // branch is on the page's own row count, not on a fixture flag, so a
    // seeded wallet that gains its first drawn row moves itself across.
    const emptyList = r.rowCount === 0;
    check(
      `1  ${f.id}: one boundary, the last element of the list`,
      (emptyList ? r.cards === 1 && r.cutRows === 0 : r.cutRows === 1 && r.cards === 0) &&
        r.position === r.siblings - 1 &&
        presses >= 0,
      `${emptyList ? "empty list" : `${r.rowCount} row(s)`}: ${r.cards} card(s), ${r.cutRows} bare row(s); position ${r.position} of ${r.siblings}${presses < 0 ? " (paging cap hit)" : `, ${presses} presses`}`,
    );
    // ⚠️ CHECK 1b AND CHECK 10's SECOND HALF STOOD HERE AND ARE DELETED,
    // 2026-09-12. Both loaded the fixture a second time under `?order=asc` and
    // read the same two rules from the other end: the boundary standing FIRST
    // rather than last, and the pulsing dot BELOW the newest row rather than
    // above it. The order was removed from every timeline that day, so neither
    // has a subject any more. Their newest-first twins are the checks directly
    // above and below this note and are untouched — what went is a second view
    // of two rules, not the rules. Kept as a note rather than closed up so the
    // missing page load does not later read as coverage that quietly stopped.

    // 2 — the arithmetic closes.
    //
    // ⚠️ WHERE THE OMITTED COUNT IS READ MOVED ON 2026-09-11. It used to be
    // stated on the card ("+N earlier events") and the check was that the
    // card agreed with the count line. With the card withdrawn, the COUNT
    // LINE is the only place the page states it, so the figure is taken from
    // there — and the old check is DELETED rather than re-pointed at the same
    // line it derives from, which would have compared a number with itself.
    //
    // On a page that still draws the card (the empty list) the card's own
    // label is read and the two are compared as before.
    const m = r.label?.match(/^\+(at least )?([\d,]+) earlier events?$/);
    const horizon = r.label === "Earlier events" && f.arm === "base";
    // On a grouped page `listed` counts ROWS, so total − listed is no count of
    // anything; the events below the cut are read off the grouped route there
    // (check 3).
    const fromLine =
      counts?.total != null && counts?.listed != null && !counts.rows ? counts.total - counts.listed : null;
    const said = m ? num(m[2]) : emptyList ? null : fromLine;
    if (horizon) {
      info(`2  ${f.id}: horizon — the record starts at the cut, no count stated`, r.label);
    } else if (r.label === "Earlier events") {
      check(`2  ${f.id}: the opening balance landed`, false, `card still reads "${r.label}"; count line "${r.line}"`);
    } else {
      if (emptyList) {
        check(
          `2  ${f.id}: card count = total − listed`,
          said != null && fromLine != null && said === fromLine,
          `card says ${said == null ? "?" : n(said)}, count line "${r.line}" → ${fromLine == null ? "?" : n(fromLine)}`,
        );
      } else {
        // What the count line has to do now that nothing else states the
        // shortfall: name one. A line that simply read "4,333 events" on a
        // windowed page would leave the bare glyph standing for a number the
        // page never gives.
        check(
          `2  ${f.id}: the count line states the shortfall the bare glyph stands for`,
          counts?.cutForm === true && counts?.total != null && counts.total > counts.listed,
          `"${r.line}" → listed ${counts?.listed == null ? "?" : n(counts.listed)}, total ${counts?.total == null ? "?" : n(counts.total)}`,
        );
      }
      if (r.pills.length > 0 && counts?.total != null && counts.rows) {
        // The oldest listed event may sit in a shut folder, whose members
        // draw no pill, so only the newest end is fixed here.
        const newest = Math.max(...r.pills);
        check(
          `2  ${f.id}: row numbers run over the whole history (the newest pill is the total)`,
          newest === counts.total,
          `newest pill ${n(newest)} (total ${n(counts.total)})`,
        );
      } else if (r.pills.length > 0 && counts?.total != null) {
        const newest = Math.max(...r.pills);
        const oldest = Math.min(...r.pills);
        check(
          `2  ${f.id}: row numbers run over the whole history`,
          newest === counts.total && oldest === (said ?? 0) + 1,
          `newest pill ${n(newest)} (total ${n(counts.total)}), oldest pill ${n(oldest)} (omitted + 1 = ${n((said ?? 0) + 1)})`,
        );
      } else {
        info(`2  ${f.id}: no row pills on the page`, `${r.pills.length} pills`);
      }
    }

    // 6 — the cut is 1,000 exactly, and the page says so in the amended form.
    if (counts?.listed != null) {
      // The anchored rows and the guarantee flag, off the route on this run.
      // `omitted.anchored` rides seeded or not — a seed leaves the anchor ON
      // over the tail the reader holds — so a seeded tail that reaches the cut
      // lists the cut plus its anchored rows exactly as an unseeded wallet
      // does, and takes the same bound below. `omitted.anchoredComplete` is
      // what a seed withholds: the guarantee that the figure is the whole set.
      const anchor = f.arm === "base" && f.route ? await anchoredOf(f, said) : NO_ANCHOR;
      const anchoredRows = anchor.anchored ?? 0;
      if (f.tail && anchoredRows === 0) {
        check(
          `6  ${f.id}: a seeded tail shorter than the cut is drawn whole`,
          counts.listed < CUT,
          `listed ${n(counts.listed)} (cut ${n(CUT)})`,
        );
      } else {
        // ⚠️ NOT "EXACTLY", AND IT NEVER COULD BE. The window opens at the
        // BLOCK holding the oldest of the newest N events, and the row query
        // takes every event from that block onward — so when the boundary
        // block holds more than one of the position's events the answer
        // overshoots by however many share it. That is deliberate (a partition
        // with no gap; api/src/services/timeline-summary.ts states it) and
        // this check asserted the opposite until 2026-09-11, when Maple's
        // boundary block happened to hold three events and it went red against
        // a correct page. The bound is the overshoot's own shape: at or above
        // the cut, and short of one more page of rows.
        //
        // PLUS THE ANCHORED ROWS ON THE BASE ARM (2026-09-16, decision 0019
        // leg F). A Base replay draws the newest CUT rows AND every older row
        // the wallet signed itself (rails-ops
        // reference/timeline-attention-budget.md, adjustment 1), and the route
        // says how many it drew from below the cut as `omitted.anchored`. On a
        // wallet that signs its own transactions that is most of its history
        // — 0x2017… on Aave V3 Base: 4,364 anchored rows, 5,364 listed — so
        // `listed` is the cut plus that figure, read off the route on this
        // run. A SEEDED wallet whose tail reaches the cut lands here too
        // (0x5c38… on Comet Base: 444 anchored rows below the weth market's
        // cut, 1,344 listed): the anchor stays on behind a seed, and since
        // this check could not see the count while it was withheld beside
        // one, the fixture was the run's one red until the flag below took
        // over the guarantee. Comet's cut is WALLET-WIDE and the page draws
        // one timeline per market, so a market's listed figure is its share
        // of the 1,000 plus its own anchored rows (weth: 900 + 444), which
        // this check reports as a negative overshoot; the lower bound holds
        // only while the market's anchored rows outnumber the other market's
        // share of the cut. Whether the 1,000-row amendment should bind such
        // a wallet is Miles's call, not this check's; it asserts the rule as
        // it stands.
        check(
          `6  ${f.id}: listed is the cut${anchoredRows > 0 ? " plus the anchored rows" : ""}, give or take a shared boundary block`,
          counts.listed >= CUT && counts.listed < CUT + anchoredRows + 50,
          `listed ${n(counts.listed)} (cut ${n(CUT)}, anchored ${n(anchoredRows)}, overshoot ${n(counts.listed - CUT - anchoredRows)})`,
        );
      }
      // The guarantee itself. A `tail` fixture is a seeded read by
      // construction, so its flag must be false whatever the tail's length;
      // an unseeded index read had a sender for every row below the cut and
      // states true. The flag is asserted only where the count rides — a
      // route that does not anchor carries neither.
      if (anchor.anchored != null) {
        check(
          `6  ${f.id}: omitted.anchoredComplete states the guarantee exactly where no seed stands in`,
          anchor.complete === !f.tail,
          `anchoredComplete ${anchor.complete === undefined ? "absent" : anchor.complete}, expected ${!f.tail} (${
            f.tail
              ? "seeded: the seed's rows were never there to anchor"
              : "unseeded: every row below the cut had a sender"
          }), anchored ${n(anchoredRows)}`,
        );
      }
      check(
        f.arm === "grouped"
          ? `6  ${f.id}: the count line reads "Showing N rows of M events"`
          : `6  ${f.id}: the count line reads "Showing N of M events"`,
        counts.cutForm === true &&
          (f.arm === "grouped"
            ? /^Showing [\d,]+ rows of (at least )?[\d,]+ events$/
            : /^Showing [\d,]+ of (at least )?[\d,]+ events$/
          ).test(r.line.trim()),
        `"${r.line}"`,
      );
      // ⚠️ THREE CHECKS STOOD HERE AND ARE DELETED, 2026-09-11: "card count =
      // M − 1,000", the small print's "displays the most recent N …" sentence,
      // and the range pill "N – 1". All three read the CARD'S BODY, and the
      // card is withdrawn from a drawn list. They are not re-pointed anywhere,
      // because there is nowhere: the page states the shortfall once, in the
      // count line, and check 2 above reads it there. Kept as this note rather
      // than closed up so the gap does not read later as checks that quietly
      // stopped running.
      if (emptyList && !f.tail && counts.total != null && said != null && !horizon) {
        check(
          `6  ${f.id}: card count = M − ${n(CUT)}`,
          said === counts.total - CUT,
          `card ${n(said)}, M ${n(counts.total)}`,
        );
      }
      // The range pill reads DOWN, because the list does: the card stands under
      // the oldest drawn row and the numbers run towards event 1. It was a
      // ternary on the list's order until 2026-09-12; now that there is one
      // order it is one string, and this holds it to the direction the rows
      // around it actually read.
      //
      // ⚠️ ITS OWN GATE, not the one above. That gate also wants `!f.tail` and
      // a total off the count line, and BOTH empty-list fixtures are tail
      // fixtures — so a check nested inside it never runs at all. Read the
      // run's output before believing a new check is being exercised: this one
      // was written in there first and reported nothing, green.
      if (emptyList && said != null) {
        check(
          `6  ${f.id}: the range pill counts down to 1`,
          r.rangePill === `${n(said)} – 1`,
          `pill "${r.rangePill}", card ${n(said)}`,
        );
      }
    } else {
      check(`6  ${f.id}: the count line parsed`, false, `"${r.line}"`);
    }

    // 11 — the CSV offer, only where the export can be whole.
    //
    // ⚠️ DELETED FOR A DRAWN LIST, 2026-09-11, with the card that carried the
    // sentence. The RULE is not lost, and that is why this is a deletion and
    // not a hole: the sentence was a pointer at the export menu, and the menu
    // itself is the guard — `downloadCsv` refuses to write a file when the
    // whole-history fetch comes back short and says by how much
    // (components/shared/export-menu.tsx). What is lost is discoverability,
    // not truth. The check still runs where the card still draws.
    if (f.csv !== undefined && emptyList) {
      const has = r.smallPrint.includes("downloaded as a CSV");
      check(
        `11 ${f.id}: the small print ${f.csv ? "offers" : "does not offer"} the CSV download`,
        has === f.csv,
        has ? "names the download" : "no download named",
      );
    }
    // 7 — no control past the cut.
    check(`7  ${f.id}: no control past the cut`, r.capControls === 0, `${r.capControls} control(s)`);
    // 10 — the tip newest-first: one dot, above the first row, never on the
    // boundary in either of its forms.
    check(
      `10 ${f.id}: ${r.tip.rows === 0 ? "no rows, so no dot" : r.tenure === "closed" ? "a closed position draws no dot at all" : "one dot, above the newest (first) row, none on the boundary"}`,
      r.tip.rows === 0
        ? r.tip.dots === 0 && !r.tip.inCard
        : r.tenure == null && !noTenure
          ? false
          : r.tenure === "closed"
            ? r.tip.dots === 0
            : r.tip.dots === 1 && r.tip.inEdge && r.tip.side === "above" && !r.tip.inCard,
      `${r.tenure ?? "TENURE UNREADABLE"}: ${r.tip.dots} dot(s), ${r.tip.rows} rows, on the first row: ${r.tip.inEdge}, side ${r.tip.side}, on the boundary: ${r.tip.inCard}`,
    );

    // 3 — the state lines are the arm's own figures.
    //
    // ⚠️ THE BROUGHT-FORWARD BALANCE IS NO LONGER STATED ON A DRAWN LIST
    // (2026-09-11). "At block N, <date>, the position held X" lived in the
    // card's body and nothing else on the page says it — not the count line,
    // not the spine node, not the economics tower, which reduces the rows it
    // has. So this group's WINDOW arm is deleted for a drawn list rather than
    // re-pointed: there is no second source to point it at, and a check with
    // no subject that keeps passing is worse than one that is gone.
    //
    // It still runs where the card still draws — the seeded Base wallets whose
    // whole life sits before their seed's cut and which therefore draw no rows
    // at all. That is not a consolation; it is the one shape of page where the
    // statement survives, and it is worth saying which.
    let routeJson = null;
    // The span in days the Base route's cut summary states, for check 13.
    let routeDays = null;
    if (f.arm === "window" && f.route) {
      routeJson = await getJson(f.route);
      const figures = routeJson.error ? null : beforeFiguresOf(routeJson);
      if (!emptyList) {
        info(
          `3  ${f.id}: no state line to check — the card is withdrawn from a drawn list`,
          `${figures?.length ?? 0} before-figure(s) on the oldest served row, stated nowhere on the page`,
        );
      } else if (f.afterOnly) {
        check(`3  ${f.id}: after-only rows → no state line`, r.state.length === 0, `${r.state.length} lines`);
      } else if (!figures) {
        check(`3  ${f.id}: route answered`, false, routeJson.error ?? "no events");
      } else if (figures.length === 0) {
        // The oldest served row's before-figures are all zero: the card
        // states no line rather than a zero (chain-truth charter).
        check(
          `3  ${f.id}: no non-zero before-figure on the oldest served row → no state line`,
          r.state.length === 0,
          `${r.state.length} lines`,
        );
      } else {
        const bad = r.state.filter((l) => !figures.some((x) => close(num(l.title), x, l.title)));
        check(
          `3  ${f.id}: every state line equals a before-figure of the oldest served row`,
          r.state.length > 0 && bad.length === 0,
          bad.length
            ? `unmatched: ${bad.map((l) => `${l.label} ${l.title}`).join("; ")}`
            : `${r.state.length} lines vs ${figures.length} figures`,
        );
      }
    } else if (f.arm === "base" && f.route) {
      routeJson = routeCache.get(f.route) ?? (await getJson(f.route));
      const json = routeJson;
      // 12 — the pills sum to the count, on every cut this route states.
      checkHistograms(f, json);
      // One timeline per position (Morpho) or per market (Compound): the
      // card read above belongs to whichever the page drew first, so match
      // it by its own count among the route's per-group cuts.
      const groups = f.grouped ? (json.positions ?? []) : json.markets?.length ? json.markets : [json];
      const om = groups.map((p) => p.omitted ?? p.coverage?.omitted).filter((o) => o && o.count > 0);
      const first = om.find((o) => o.count === said) ?? om[0];
      if (!first) {
        check(`3  ${f.id}: route reports a cut`, false, json.error ?? "no omitted count");
      } else {
        // The page's own shortfall against the index's — read off the card
        // where it still draws, off the count line otherwise. Either way this
        // crosses the PAGE with the ROUTE, which is what makes it a check.
        check(
          `3  ${f.id}: the page's omitted count = the route's`,
          said === first.count,
          `route ${n(first.count)}, page ${said == null ? "?" : n(said)} (${emptyList ? "card" : "count line"})`,
        );
        const stateAtCut = first.summary?.stateAtCut ?? null;
        // The card's first date is the summary's, or the coverage's first
        // event where the summary carries none (lib/shared/timeline-boundary.ts,
        // `boundaryFromCoverage`); its cut date is the summary's alone.
        const firstAt = first.summary?.firstAt ?? json.coverage?.firstEventAt ?? null;
        const lastAt = first.summary?.lastAt ?? null;
        routeDays = firstAt != null && lastAt != null ? Math.round((lastAt - firstAt) / 86400) : null;
        if (!emptyList) {
          info(
            `3  ${f.id}: no state line to check — the card is withdrawn from a drawn list`,
            `${stateAtCut?.length ?? 0} figure(s) at the cut, stated nowhere on the page`,
          );
        } else if (stateAtCut) {
          const bad = r.state.filter((l) => !stateAtCut.some((x) => close(num(l.title), Number(x.value), l.title)));
          check(
            `3  ${f.id}: every state line equals the replay's state at the cut`,
            r.state.length === stateAtCut.length && bad.length === 0,
            bad.length ? `unmatched: ${bad.map((l) => `${l.label} ${l.title}`).join("; ")}` : `${r.state.length} lines`,
          );
        } else {
          check(`3  ${f.id}: no state at the cut → no state line`, r.state.length === 0, `${r.state.length} lines`);
        }
      }
    } else if (f.arm === "grouped" && f.route) {
      // The grouped answer the page drew, read on the same run: cut by ROWS,
      // as many rows as the line names, folders among them, and fewer events
      // listed than the position has — the shortfall the boundary stands for.
      routeJson = await getJson(f.route);
      const plan = routeJson.rowPlan ?? [];
      const folderCount = plan.filter((x) => x.kind === "folder").length;
      check(
        `3  ${f.id}: the grouped route is cut by rows, and the line names its rows and total`,
        !routeJson.error &&
          routeJson.grouped === true &&
          routeJson.boundBy === "rows" &&
          plan.length === counts?.listed &&
          routeJson.totalEvents === counts?.total,
        routeJson.error ??
          `boundBy ${routeJson.boundBy}, ${n(plan.length)} rows of ${n(routeJson.totalEvents)} events; line "${r.line}"`,
      );
      check(
        `3  ${f.id}: the rows are part folders, and the page draws them`,
        folderCount > 0 && r.folderRows === folderCount && routeJson.eventsServed < routeJson.totalEvents,
        `${folderCount} folder(s) in the answer, ${r.folderRows} folder row(s) drawn; ${n(routeJson.eventsServed ?? 0)} of ${n(routeJson.totalEvents ?? 0)} events listed`,
      );
    } else if (f.arm === "vault") {
      check(
        `3  ${f.id}: the page's omitted count = of − rows on the wrapper`,
        r.vault != null && said === r.vault.of - r.vault.rows,
        r.vault
          ? `rows ${n(r.vault.rows)} of ${n(r.vault.of)}, page ${said == null ? "?" : n(said)} (${emptyList ? "card" : "count line"})`
          : "no wrapper",
      );
      info(`3  ${f.id}: state lines`, r.state.map((l) => `${l.label} ${l.title}`).join("; ") || "none");
    }

    // 8 — the newest row is on the page (a former ceiling-arm page).
    if (f.newest) {
      const listing = await getJson(f.newest);
      const row = (listing.data ?? listing.rows ?? [])[0];
      const newest = routeJson && !routeJson.error ? newestEventOf(routeJson) : null;
      if (!row || !newest) {
        check(`8  ${f.id}: the listing and the route answered`, false, listing.error ?? routeJson?.error ?? "no rows");
      } else {
        const hash = String(row.lastTxHash ?? "").toLowerCase();
        check(
          `8  ${f.id}: the route's newest event is the listing's last transaction`,
          hash.length > 0 && newest.hasHash(hash),
          `listing ${hash.slice(0, 12)}…, route id ${String(newest.id).slice(0, 20)}…`,
        );
        check(
          `8  ${f.id}: the page's first row is that event`,
          r.firstRowId != null && r.firstRowId === newest.id,
          `page ${r.firstRowId?.slice(0, 20) ?? "?"}…, route ${String(newest.id).slice(0, 20)}…`,
        );
      }
    }

    // 9 — the header's liquidation count is the whole life's.
    if (f.liquidations) {
      const listing = await getJson(f.liquidations);
      const row = (listing.rows ?? listing.data ?? [])[0];
      const indexCount = row ? Number(row.liquidationCount) : null;
      const badge = r.liqBadge?.match(/^Liquidated ([\d,]+) times?$/);
      const shown = badge ? num(badge[1]) : null;
      // How many of them the DRAWN rows hold — the figure the header used to
      // state. Stated so the report can say the cut hid some.
      const drawn =
        routeJson && !routeJson.error
          ? (routeJson.events ?? []).filter((e) => e.context?.data?.eventType === "liquidation").length
          : null;
      check(
        `9  ${f.id}: the header's liquidation count equals the index's whole-life count`,
        indexCount != null && indexCount > 0 && shown === indexCount,
        `index ${indexCount ?? "?"}, badge ${shown ?? r.liqBadge ?? "none"}, in the drawn rows ${drawn ?? "?"}`,
      );
    }

    // 4 — the offer, once. On a drawn list the sentence went with the card,
    // so the assertion INVERTS rather than disappearing: it must not turn up
    // anywhere else on the page. A deletion that leaves no check behind is how
    // a sentence comes back in a different component six months later.
    check(
      emptyList
        ? `4  ${f.id}: the offer sentence is present once`
        : `4  ${f.id}: the offer sentence went with the card and is nowhere else`,
      emptyList ? r.offerInCard === 1 && r.offerOnPage === 1 : r.offerInCard === 0 && r.offerOnPage === 0,
      `${r.offerInCard} in card, ${r.offerOnPage} on page`,
    );
    // 5 — retired sentences absent.
    check(`5  ${f.id}: retired sentences absent`, r.retired.length === 0, r.retired.join("; "));

    // 13 — the span is stated once, where the card draws. The header carries
    // the two dates in the rows' register; the Span box carries the day count
    // and nothing else; the long-format pair is on the card nowhere. The
    // state box's label names the cut date alone in the long format, which
    // the pair regex does not match, so it is not counted.
    if (!emptyList) {
      info(`13 ${f.id}: no span to read — the card is withdrawn from a drawn list`, `${r.cutRows} bare row(s)`);
    } else {
      const rowSpans = (r.cardText.match(/\d{1,2} \w{3,4} '\d{2} – \d{1,2} \w{3,4} '\d{2}/g) ?? []).length;
      const longSpans = (r.cardText.match(/\d{1,2} \w{3,4} \d{4} – \d{1,2} \w{3,4} \d{4}/g) ?? []).length;
      const box = r.spanBox?.match(/^(\d[\d,]*) days?$/) ?? null;
      // A card that knows both dates draws the Span box; one that knows the
      // cut date alone draws neither the pair nor the box.
      const expectRows = r.spanBox != null ? 1 : 0;
      check(
        `13 ${f.id}: the span is stated once, in the header, in the rows' register`,
        rowSpans === expectRows && longSpans === 0,
        `rows' register ${rowSpans} (expected ${expectRows}), long format ${longSpans}, header "${r.meta ?? "absent"}"`,
      );
      if (r.spanBox != null) {
        check(`13 ${f.id}: the Span box holds the day count alone`, box != null, `box "${r.spanBox}"`);
        if (box != null && routeDays != null) {
          check(
            `13 ${f.id}: the day count is the route's cut summary in days`,
            num(box[1]) === routeDays,
            `box ${box[1]}, route ${n(routeDays)}`,
          );
        } else if (box != null) {
          info(
            `13 ${f.id}: the route states no first and cut dates, so the format check stands alone`,
            `box ${box[1]}`,
          );
        }
      } else {
        info(`13 ${f.id}: no Span box — the card knows the cut date alone`, `header "${r.meta ?? "absent"}"`);
      }
    }
  } catch (err) {
    check(`0  ${f.id}: the page answered`, false, String(err?.message ?? err).slice(0, 200));
  } finally {
    await page.close();
    console.log("");
  }
}

await browser.close();
console.log(`${passes}/${passes + failures} checks passed`);
process.exit(failures ? 1 : 0);
