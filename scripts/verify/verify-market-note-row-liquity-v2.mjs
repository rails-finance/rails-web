// The Liquity V2 price-gap market note, on the page.
// ---------------------------------------------------------------------------
// A price gap says the branch's oracle price moved between two of the trove's
// own events, and what that move did to the collateral ratio the earlier event
// recorded. It is a NOTE, not an event: it must render between the two rows it
// brackets, it must state figures that are re-derivable from the timeline
// route, and nothing on the page may count it.
//
// Every expected figure below is re-derived from the trove's OWN timeline route
// (/api/trove/:c/:t/timeline), fetched independently of the page, and never
// read back off the page — a check whose expected value comes from the thing
// under test cannot go red however wrong the thing is. The fixtures are pinned
// by BLOCK and TYPE, never by an event number, and never as an absence: the
// control trove is discovered at run time, and it is a trove with exactly ONE
// event in its whole history — a trove that cannot have a note between two of
// its own events whatever the threshold rule says, which is what makes it a
// control for the ROW rather than a second run of the rule.
//
// Liquity V2 trove pages are server-rendered with their timeline tail, and the
// notes are a pure reduction of that tail, so a note is expected in the SSR
// markup as well as in the hydrated DOM. Check 9 reads the document with no
// JavaScript at all to hold that.
//
// Proved it can fail 2026-09-04, against the deployed site before this change
// landed — BASE=https://rails-web-onboarding.vercel.app:
//
//   PASS  0a. the (a) trove's route states the pinned stretch — 24354005 → 24393692
//   PASS  0b. and the move across it is a fall of more than a fifth — 2,643.20 → 1,865.53 USD per WETH, −29.4%
//   PASS  0c. the (b) trove's route states a stretch ending in a redemption, and a small move — +4.7%
//   PASS  0d. a control trove was found at run time — wstETH 1417822620… (1 event)
//   FAIL  1. the stretch at the pinned blocks renders as a market note — 0 [data-market-note] on the page
//   FAIL  2. the note states both prices and the signed move
//   FAIL  3. the note states this trove's ratio at each price, and the branch minimum — wanted 169% → 119% against 110%
//   FAIL  4. desc — the note sits immediately after the row it is anchored to — no note row found in the column
//   FAIL  5. asc — the same note sits immediately before that row  [check deleted 2026-09-12]
//   FAIL  6. a stretch that ends in a redemption renders on its own account — 0 note(s) on the (b) trove
//   FAIL  7. the Display menu offers "Market notes" … — the menu never offered it
//   FAIL  7b. …and check 7 was measured with a note actually on the page — 0 note(s), 19 event rows
//   FAIL  8. turning the notes off and reloading keeps them off; a fresh context has them back
//   FAIL  9. the note is in the SSR markup — 240,981 bytes; data-market-note absent
//   FAIL  10. the markdown export carries the note … — 19 table rows, route states 19; "## Market notes" absent
//   PASS  11. the control trove shows no note and no "Market notes" toggle
//   PASS  12. the pinned single-event page renders the anchor and no note
//   11 CHECK(S) FAILED of 17
//
// The four that stayed green are the ones that must: the route fixtures, the
// discovered control and pinned mode say the same thing before and after, which
// is what makes the other eleven readable as this change's own work.
//
// Green the same day on a dev server in the worktree the change was written in
// (BASE=http://localhost:3023): ALL 17 CHECKS PASS — six notes on the (a) trove,
// the pinned stretch stating "2,643.20 → 1,865.53", "−29.4%" and "169% → 119%
// against 110%", the toggle moving no count (19 event rows and the label "19
// events" either way), and the export's table at 19 rows with the notes in it.
// Deployed (BASE=https://rails-web-onboarding.vercel.app, merge b1f4611c, 2026-09-04):
// ALL 17 CHECKS PASS — the note is in the SSR document (265,776 bytes), control
// discovered at run time (wstETH 1417822620…, one event).
//
// One verifier correction along the way, recorded so it is not re-learned: the
// dev prov-coverage tripwire stamps a hidden <i data-prov-tripwire> beside each
// receipted surface, so the row column's children are not all rows — reading
// them raw put a phantom row between every note and its own anchor and made
// checks 4 and 5 red against a page that was right.
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run:  BASE=http://localhost:3023 node scripts/verify/verify-market-note-row-liquity-v2.mjs
//       BASE=https://rails-web.vercel.app node scripts/verify/verify-market-note-row-liquity-v2.mjs

import { chromium } from "playwright";

// 2026-09-04 (657eb889, the mark is the header): checks 1r and 1o added. Proved
// to fail first against the still-deployed old shape — 2 of 19 red (1r: the
// sentence stated the blocks at rest; 1o: no header button) — then ALL 19 PASS
// on localhost:3022 and on vercel.app once deployed.
//
// 2026-09-04 (header alignment): check 2d added, and 1r/2/6/9 read
// `changeMagnitude` instead of the signed `change`. Fail-first against the
// still-deployed old header, BASE=https://rails-web-onboarding.vercel.app —
// 1 of 21 red: 2d (no lucide-arrow-down-right svg — the old header has no
// glyph). Everything else PASSED, including 1r/2/6/9's new magnitude
// assertions — an unsigned "29.4%" is a substring of the old header's signed
// "−29.4%", so those checks cannot by themselves prove the sign was dropped;
// 2d is what actually exercises this change.

const BASE = process.env.BASE ?? "http://localhost:3000";

// Fixture (a)/(c) — a WETH trove that ran from November into a liquidation, so
// it carries both an ordinary stretch that crosses the threshold and one that
// ends in a liquidation. Pinned by trove id and by BLOCK; every figure comes
// from the route.
const TROVE_A = "78653451855876984404200224290704233324607545013117117463168140077362570442915";
const GAP_FROM_BLOCK = 24_354_005;
const GAP_TO_BLOCK = 24_393_692;
// Fixture (b) — a WETH trove whose stretch into a redemption moves only ~5%:
// it renders because of what it ends in, not because of how far the price went,
// which is the half of the threshold rule the (a) fixture cannot show.
const TROVE_B = "29779854367542649123526514384205099621162281315544372345570836626121545773770";
const REDEMPTION_FROM_BLOCK = 25_890_591;
const REDEMPTION_TO_BLOCK = 25_900_314;
const MCR_PCT = 110; // the WETH branch's own minimum, LIQUITY_V2_BRANCHES.weth.mcr

const COUNT_RE = /^(?:Showing )?[\d,]+(?: of [\d,]+)? (?:events?|listed)/;

let failures = 0;
let checked = 0;
const check = (name, cond, detail = "") => {
  checked++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

async function api(path, tries = 4) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    const res = await fetch(`${BASE}${path}`).catch((e) => {
      last = e;
      return null;
    });
    if (res?.ok) return res.json();
    if (res) last = new Error(`${res.status} ${path}`);
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw last ?? new Error(`failed ${path}`);
}

// ── Formatting, restated from Intl rather than imported ────────────────────
// The page's own formatters are part of what is under test, so these are
// written out here from the locale rules alone.
const price = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct0 = (n) => `${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}%`;
const change = (n) =>
  `${n < 0 ? "−" : "+"}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const magnitude = (n) =>
  `${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const blk = (n) => n.toLocaleString("en-US");

const logIndex = (e) => Number(e.id.split("_").pop());
const ENDPOINT_TYPES = new Set(["trove", "liquidation", "redemption", "batch_manager"]);

/** The trove's own rows that can state a price, oldest first — the same
 *  event types and the same price>0 rule the note's endpoints obey, applied
 *  here to the ROUTE payload so the fixture is read from the index. */
async function endpoints(troveId) {
  const j = await api(`/api/trove/WETH/${troveId}/timeline?limit=500`);
  const rows = j.events
    .filter((e) => {
      const d = e.context?.data;
      return d && ENDPOINT_TYPES.has(d.eventType) && d.collateralPrice > 0;
    })
    .sort((a, b) => a.blockNumber - b.blockNumber || logIndex(a) - logIndex(b));
  return { total: j.totalEvents, count: j.events.length, rows };
}

/** The pair whose later end sits at `toBlock`, with the row before it. */
function pairEndingAt(rows, toBlock) {
  const i = rows.findIndex((e) => e.blockNumber === toBlock);
  if (i < 1) return null;
  return { a: rows[i - 1], b: rows[i] };
}

/** What the page must state about one pair, computed from the route's own
 *  debt, collateral and prices. */
function expected(pairRows) {
  const da = pairRows.a.context.data;
  const db = pairRows.b.context.data;
  const pa = da.collateralPrice;
  const pb = db.collateralPrice;
  const crBefore =
    da.stateAfter.collateralRatio > 0
      ? da.stateAfter.collateralRatio
      : ((da.stateAfter.coll * pa) / da.stateAfter.debt) * 100;
  return {
    fromPrice: price(pa),
    toPrice: price(pb),
    change: change((pb / pa - 1) * 100),
    changeMagnitude: magnitude((pb / pa - 1) * 100),
    fromBlock: blk(pairRows.a.blockNumber),
    toBlock: blk(pairRows.b.blockNumber),
    blocks: `${blk(pairRows.a.blockNumber)} and ${blk(pairRows.b.blockNumber)}`,
    crBefore: pct0(crBefore),
    crAfter: pct0((crBefore * pb) / pa),
    mcr: pct0(MCR_PCT),
    elapsed: elapsedText(pairRows.a.timestamp, pairRows.b.timestamp),
    anchorId: pairRows.b.id,
  };
}

/** The elapsed-time wording the page uses, from two Unix-second timestamps:
 *  minutes under an hour, hours under a day, else days. */
const elapsedText = (fromTs, toTs) => {
  const m = Math.floor((toTs - fromTs) / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (h < 1) return m < 1 ? "less than a minute" : `${m} ${m === 1 ? "minute" : "minutes"}`;
  if (d < 1) return `${h} ${h === 1 ? "hr" : "hrs"}`;
  return `${d} ${d === 1 ? "day" : "days"}`;
};

// ── Page helpers ───────────────────────────────────────────────────────────

/** The timeline's own rows, in DOM order: each top-level child of the row
 *  column, described by the note it is (if any) and the event ids it holds.
 *  A note anchored inside a collapsed run renders against the RUN ROW, so the
 *  ids are collected from the whole subtree, not from the child itself.
 *
 *  Children that are neither are dropped: the dev prov-coverage tripwire
 *  stamps a hidden `<i data-prov-tripwire>` beside every receipted surface,
 *  and counting those as rows would put one between every note and its own
 *  anchor. */
const rowSequence = (page) =>
  page.evaluate(() => {
    const note = document.querySelector("[data-market-note]");
    const anyRow = document.querySelector("[data-event-id]");
    const column = (note ?? anyRow)?.closest(".flex.flex-col.gap-2");
    if (!column) return [];
    return [...column.children]
      .map((el) => {
        const noteEl = el.matches("[data-market-note]") ? el : el.querySelector("[data-market-note]");
        return {
          note: noteEl?.getAttribute("data-market-note") ?? null,
          text: noteEl?.textContent ?? "",
          events: [...el.querySelectorAll("[data-event-id]")]
            .map((n) => n.getAttribute("data-event-id"))
            .concat(el.matches("[data-event-id]") ? [el.getAttribute("data-event-id")] : []),
        };
      })
      .filter((r) => r.note !== null || r.events.length > 0);
  });

/** The market-notes toggle, on the toolbar's own pill (2026-09-06: moved off
 *  the Display/eye menu — see market-notes-toolbar-and-live-note.md §2A).
 *  "Market notes · N" beside the eye menu, `aria-pressed` for its state.
 *  Returns false when the page offers no pill (no notes of any kind), which
 *  is a fact worth reporting rather than an exception. */
async function setDisplayFlag(page, _label, wantOn) {
  const pill = page.getByRole("button", { name: /^Market notes/i }).first();
  const offered = await pill
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!offered) return false;
  const isOn = (await pill.getAttribute("aria-pressed")) === "true";
  if (isOn !== wantOn) await pill.click();
  await page.waitForTimeout(400);
  return true;
}

async function readCounts(page) {
  return {
    rows: await page.locator("[data-event-id]").count(),
    label: (await page.getByText(COUNT_RE).first().textContent())?.trim() ?? "",
    filters:
      (await page
        .locator("button")
        .filter({ hasText: /^\s*\d+\s*$/ })
        .count()) ?? 0,
  };
}

const troveUrl = (id, q = "") => `${BASE}/ethereum/liquity-v2/trove/WETH/${id}${q}`;

async function open(context, url) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.getByText(COUNT_RE).first().waitFor({ state: "visible", timeout: 120000 });
  // The toggle is a client-side control: a click before hydration is lost, not
  // replayed, so wait for the row column to be live before touching anything.
  await page.locator("[data-event-id]").first().waitFor({ state: "visible", timeout: 60000 });
  await page.waitForTimeout(1200);
  return page;
}

/** The text of every note on the page, whitespace-normalised. `textContent`,
 *  not innerText: the notes are read wherever they sit in the column, scrolled
 *  into view or not. */
const noteTexts = async (page) =>
  (await page.locator("[data-market-note]").allTextContents()).map((t) => t.replace(/\s+/g, " "));

/** Open every note's panel (the mark is the header, 2026-09-04): the blocks,
 *  the ratios and the prose are mounted only while a note is open. */
async function openNotes(page) {
  const rows = page.locator("[data-market-note]");
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const row = rows.nth(i);
    await row.scrollIntoViewIfNeeded();
    await row.getByRole("button", { expanded: false }).first().click();
  }
  await page.waitForTimeout(300);
  return n > 0 && (await page.locator("[data-market-note-open]").count()) === n;
}

console.log("Liquity V2 price-gap market note — on the page\n");
console.log(`BASE ${BASE}\n`);

// ── 0. fixtures, read from the routes ──────────────────────────────────────

const a = await endpoints(TROVE_A);
const gapPair = pairEndingAt(a.rows, GAP_TO_BLOCK);
check(
  "0a. the (a) trove's route states the pinned stretch",
  gapPair != null && gapPair.a.blockNumber === GAP_FROM_BLOCK,
  gapPair ? `${gapPair.a.blockNumber} → ${gapPair.b.blockNumber}` : "no row at the later block",
);
const wantGap = gapPair ? expected(gapPair) : null;
check(
  "0b. and the move across it is a fall of more than a fifth",
  wantGap != null && Number(wantGap.change.replace(/[^\d.]/g, "")) > 20 && wantGap.change.startsWith("−"),
  wantGap ? `${wantGap.fromPrice} → ${wantGap.toPrice} USD per WETH, ${wantGap.change}, blocks ${wantGap.blocks}` : "",
);

const b = await endpoints(TROVE_B);
const redemptionPair = pairEndingAt(b.rows, REDEMPTION_TO_BLOCK);
const wantRedemption = redemptionPair ? expected(redemptionPair) : null;
check(
  "0c. the (b) trove's route states a stretch ending in a redemption, and a small move",
  redemptionPair != null &&
    redemptionPair.a.blockNumber === REDEMPTION_FROM_BLOCK &&
    redemptionPair.b.context.data.eventType === "redemption" &&
    Math.abs(redemptionPair.b.context.data.collateralPrice / redemptionPair.a.context.data.collateralPrice - 1) < 0.1,
  wantRedemption ? `${wantRedemption.prices}, ${wantRedemption.change}` : "no redemption at the later block",
);

// The control is DISCOVERED: 2026-09-06 (live notes) — a live note applies
// to any OPEN trove with a priced endpoint whatever its event count, so the
// old guarantee ("exactly one event ⇒ no note") only rules out a HISTORICAL
// note now; the roster is `status=closed` (never live), and a closed trove
// needs at least two touches (open, then close), so "one event" can no
// longer be the guarantee either. Instead this replicates `priceGapNotesFor`
// itself — independently, over the ROUTE's own rows, not by importing the
// module under test — and picks the first closed trove whose own history
// produces ZERO qualifying stretches, which is the same "cannot have one
// whatever the rule decides" guarantee restated for this shape.
const ENDPOINT_KINDS = new Set(["trove", "liquidation", "redemption", "batch_manager"]);
const ZOMBIE_OPS = new Set(["adjustZombieTrove", "adjustUnredeemableZombieTrove"]);
function historicalNoteCount(events, mcr) {
  const ends = events
    .filter((e) => {
      const d = e.context?.data;
      return d && ENDPOINT_KINDS.has(d.eventType) && d.collateralPrice > 0;
    })
    .sort((a, b) => a.blockNumber - b.blockNumber || logIndex(a) - logIndex(b));
  let n = 0;
  for (let i = 0; i < ends.length - 1; i++) {
    const a = ends[i];
    const b = ends[i + 1];
    const da = a.context.data;
    const db = b.context.data;
    if (da.eventType !== "trove") continue;
    if (b.blockNumber <= a.blockNumber) continue;
    const pa = da.collateralPrice;
    const pb = db.collateralPrice;
    if (pa === pb) continue;
    const state = da.stateAfter;
    const debt = state?.debt ?? 0;
    const coll = state?.coll ?? 0;
    if (!(debt > 0) || !(coll > 0)) continue;
    const crBefore = state && state.collateralRatio > 0 ? state.collateralRatio : ((coll * pa) / debt) * 100;
    const runway = 1 - mcr / (crBefore / 100);
    const move = Math.abs(pb / pa - 1);
    const consumed = runway > 0 ? move / runway : Infinity;
    const endedBy =
      db.eventType === "liquidation"
        ? "liquidation"
        : db.eventType === "redemption" || ZOMBIE_OPS.has(db.operation)
          ? "redemption"
          : "adjustment";
    if (endedBy === "adjustment" && !(consumed >= 0.25)) continue;
    n++;
  }
  return n;
}
const BRANCH_MCR = { WETH: 1.1, wstETH: 1.1, rETH: 1.1 };
let control = null;
const roster = await api("/api/troves?status=closed&sortField=lastActivity&limit=100");
for (const t of roster.data ?? []) {
  const own = await api(`/api/trove/${t.collateralType}/${t.id}/timeline?limit=500`);
  if (historicalNoteCount(own.events, BRANCH_MCR[t.collateralType] ?? 1.1) === 0) {
    control = { id: t.id, collateralType: t.collateralType, eventId: own.events[0].id, eventCount: own.events.length };
    break;
  }
}
check(
  "0d. a control trove was found at run time — closed, zero qualifying historical stretches",
  control != null,
  control
    ? `${control.collateralType} ${control.id.slice(0, 10)}… (${control.eventCount} events)`
    : "NO EVIDENCE — no zero-note closed trove in the first 100 of the roster",
);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1400 },
  permissions: ["clipboard-read", "clipboard-write"],
});

// ── 1–3. the note renders, and states what the route says ──────────────────

const pageA = await open(context, troveUrl(TROVE_A));
const statesBlocks = (t) => wantGap != null && t.includes(wantGap.fromBlock) && t.includes(wantGap.toBlock);
// At rest: a header states the two prices and the signed move, and no note
// states its blocks — those live in the panel, closed until clicked.
const restTexts = await noteTexts(pageA);
const restNote = wantGap ? restTexts.find((t) => t.includes(wantGap.fromPrice) && t.includes(wantGap.toPrice)) : null;
check(
  "1r. at rest a header states the pinned pair's prices and move, and no note states its blocks",
  restNote != null && restNote.includes(wantGap.changeMagnitude) && !restTexts.some(statesBlocks),
  restNote
    ? restNote.slice(0, 120)
    : `${restTexts.length} note(s); none states ${wantGap?.fromPrice} → ${wantGap?.toPrice}`,
);
check("1o. clicking each header opens its panel", await openNotes(pageA));
const openTexts = await noteTexts(pageA);
const noteWithBlocks = openTexts.find(statesBlocks);
check(
  "1. the stretch at the pinned blocks renders as a market note",
  noteWithBlocks != null,
  `${openTexts.length} [data-market-note] on the page` +
    (wantGap ? `; wanted one stating blocks ${wantGap.blocks}` : ""),
);
const noteText = noteWithBlocks ?? "";
check(
  "2. the note states both prices and the unsigned move",
  wantGap != null &&
    noteText.includes(wantGap.fromPrice) &&
    noteText.includes(wantGap.toPrice) &&
    noteText.includes(wantGap.changeMagnitude),
  wantGap ? `wanted "${wantGap.fromPrice}", "${wantGap.toPrice}" and "${wantGap.changeMagnitude}"` : "",
);
// The note whose panel states the pinned blocks — the same one check 1/2 just
// read — carries the direction glyph instead of the sign: down-right for a
// fall (the typographic minus U+2212), up-right otherwise.
const glyphLocator = wantGap
  ? pageA.locator("[data-market-note]").filter({ hasText: wantGap.fromBlock }).first()
  : null;
const wantGlyphClass = wantGap?.change.startsWith("−") ? "lucide-arrow-down-right" : "lucide-arrow-up-right";
const glyphCount = glyphLocator ? await glyphLocator.locator(`svg.${wantGlyphClass}`).count() : 0;
check(
  "2d. the header carries the direction glyph — arrow-down-right for a fall, arrow-up-right for a rise",
  wantGap != null && glyphCount > 0,
  wantGap ? `wanted svg.${wantGlyphClass}; found ${glyphCount}` : "",
);
check(
  "3e. the note states the time between the two events, from their own timestamps",
  wantGap != null && noteText.includes(wantGap.elapsed),
  wantGap ? `wanted "${wantGap.elapsed}"` : "",
);
check(
  "3. the note states this trove's ratio at each price, and the branch minimum",
  wantGap != null &&
    noteText.includes(wantGap.crBefore) &&
    noteText.includes(wantGap.crAfter) &&
    noteText.includes(wantGap.mcr),
  wantGap ? `wanted ${wantGap.crBefore} → ${wantGap.crAfter} against ${wantGap.mcr}` : "",
);

// ── 4. placement ───────────────────────────────────────────────────────────

// The note is found by the block pair it STATES — read from the route — not by
// the shape of the id the code under test builds, and not by position.
const seqDesc = await rowSequence(pageA);
const iDesc = wantGap ? seqDesc.findIndex((r) => r.note && statesBlocks(r.text.replace(/\s+/g, " "))) : -1;
check(
  "4. desc — the note sits immediately after the row it is anchored to (below = older)",
  iDesc > 0 && wantGap != null && seqDesc[iDesc - 1].events.includes(wantGap.anchorId),
  iDesc > 0
    ? `previous row holds ${seqDesc[iDesc - 1].events.length} event(s); anchor ${wantGap?.anchorId.slice(0, 12)}…`
    : "no note row found in the column",
);

// ⚠️ CHECK 5 STOOD HERE AND IS DELETED, 2026-09-12. It loaded the same trove
// under `?order=asc` and asserted the mirror of check 4 — the note sitting
// immediately BEFORE its anchor rather than after it. Every timeline reads
// newest-first now and there is no way to ask for the other order (see
// useTimelineEvents's header), so the check has no subject. Check 4 above is
// untouched and is the whole of the placement rule the page can express.
//
// The placement FUNCTION still takes a direction and still has both arms —
// `anchorMarketNotes(notes, events, "asc" | "desc")` — because the markdown
// exports render a life forwards. That arm is covered by the pure checks in
// verify-market-note-placement.mjs, which call it directly, and by check 10
// below, which reads the export itself.

// ── 6. the terminal arm of the rule ────────────────────────────────────────

const pageB = await open(context, troveUrl(TROVE_B));
await openNotes(pageB);
const bNotes = await noteTexts(pageB);
const bNote = wantRedemption
  ? bNotes.find((t) => t.includes(wantRedemption.fromBlock) && t.includes(wantRedemption.toBlock))
  : undefined;
check(
  "6. a stretch that ends in a redemption renders on its own account, whatever the move",
  bNote != null && wantRedemption != null && bNote.includes(wantRedemption.changeMagnitude),
  bNote
    ? `states ${wantRedemption.change}`
    : `${bNotes.length} note(s) on the (b) trove; wanted one at blocks ${wantRedemption?.blocks}`,
);
await pageB.close();

// ── 7–8. the toggle, and that nothing counts a note ────────────────────────

const before = await readCounts(pageA);
const offered = await setDisplayFlag(pageA, "Market notes", false);
const afterOff = await readCounts(pageA);
const notesOff = await pageA.locator("[data-market-note]").count();
check(
  '7. the Display menu offers "Market notes", and turning it off changes no count',
  offered && notesOff === 0 && afterOff.rows === before.rows && afterOff.label === before.label,
  offered
    ? `${notesOff} note(s) left · rows ${before.rows} → ${afterOff.rows} · label "${before.label}" → "${afterOff.label}"`
    : "the menu never offered it",
);
// A vacuous pass is the one outcome worse than a red one: with no note on the
// page at all, "no count moved" says nothing.
check(
  "7b. …and check 7 was measured with a note actually on the page",
  noteWithBlocks != null && before.rows > 0,
  `${noteTexts.length} note(s), ${before.rows} event rows before the toggle`,
);

await pageA.reload({ waitUntil: "domcontentloaded" });
await pageA.getByText(COUNT_RE).first().waitFor({ state: "visible", timeout: 120000 });
await pageA.waitForTimeout(1500);
const afterReload = await pageA.locator("[data-market-note]").count();
const fresh = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
const freshPage = await open(fresh, troveUrl(TROVE_A));
const freshNotes = await freshPage.locator("[data-market-note]").count();
check(
  "8. turning the notes off and reloading keeps them off; a fresh context has them back",
  afterReload === 0 && freshNotes > 0,
  `same context after reload ${afterReload}, fresh context ${freshNotes}`,
);
await freshPage.close();
await fresh.close();
await pageA.close();

// ── 9. the SSR markup already carries it ───────────────────────────────────

const ssr = await fetch(troveUrl(TROVE_A)).then((r) => r.text());
check(
  "9. the note is in the SSR markup, before any JavaScript runs",
  ssr.includes("data-market-note") && wantGap != null && ssr.includes(wantGap.changeMagnitude),
  `document ${ssr.length.toLocaleString("en-US")} bytes; data-market-note ${ssr.includes("data-market-note") ? "present" : "absent"}`,
);

// ── 10. the markdown export ────────────────────────────────────────────────

const exportPage = await open(context, troveUrl(TROVE_A));
const copyMarkdown = async () => {
  await exportPage
    .getByRole("button", { name: /Export this (position|loan|trove)|Copy for LLM/i })
    .first()
    .click();
  await exportPage.getByRole("menuitem", { name: /Copy Position/i }).click();
  await exportPage.waitForTimeout(500);
  return exportPage.evaluate(() => navigator.clipboard.readText());
};
const tableRows = (md) => (md.match(/^\| \d+ \| /gm) ?? []).length;
const md = await copyMarkdown();
// The event table's row count is the trove's own event count as the ROUTE
// states it — the notes must have added nothing to it, and the heading must
// still name that number.
const heading = md.match(/^## Activity timeline \((\d[\d,]*) events?, oldest first\)$/m);
check(
  "10. the markdown export carries the note and adds no row to the event table",
  md.includes("## Market notes") &&
    wantGap != null &&
    md.includes(wantGap.change) &&
    tableRows(md) === a.count &&
    Number((heading?.[1] ?? "").replace(/,/g, "")) === a.count,
  `${tableRows(md)} table rows, route states ${a.count} events, heading says ${heading?.[1] ?? "(none)"}; "## Market notes" ${md.includes("## Market notes") ? "present" : "absent"}`,
);
await exportPage.close();

// ── 11–12. the control, and pinned mode ────────────────────────────────────

if (control) {
  const controlPage = await open(context, `${BASE}/ethereum/liquity-v2/trove/${control.collateralType}/${control.id}`);
  const controlNotes = await controlPage.locator("[data-market-note]").count();
  const controlOffered = await setDisplayFlag(controlPage, "Market notes", false);
  check(
    '11. the control trove shows no note and no "Market notes" toggle',
    controlNotes === 0 && controlOffered === false,
    `${controlNotes} note(s); menu ${controlOffered ? "OFFERED the item" : "did not offer it"}`,
  );
  await controlPage.close();
} else {
  check('11. the control trove shows no note and no "Market notes" toggle', false, "NO EVIDENCE — no control found");
}

if (wantGap) {
  const pinned = await context.newPage();
  await pinned.goto(`${troveUrl(TROVE_A)}/event/${encodeURIComponent(wantGap.anchorId)}`, {
    waitUntil: "domcontentloaded",
    timeout: 180000,
  });
  await pinned.locator("[data-event-id]").first().waitFor({ state: "visible", timeout: 120000 });
  await pinned.waitForTimeout(1200);
  const pinnedNotes = await pinned.locator("[data-market-note]").count();
  const pinnedRows = await pinned.locator("[data-event-id]").count();
  check(
    "12. the pinned single-event page renders the anchor and no note",
    pinnedRows === 1 && pinnedNotes === 0,
    `${pinnedRows} event row(s), ${pinnedNotes} note(s)`,
  );
  await pinned.close();
} else {
  check("12. the pinned single-event page renders the anchor and no note", false, "NO EVIDENCE — no fixture pair");
}

await context.close();
await browser.close();

console.log(
  failures ? `\n${failures} CHECK(S) FAILED of ${checked}` : `\nALL ${checked} CHECKS PASS — the price-gap note holds`,
);
process.exit(failures ? 1 : 0);
