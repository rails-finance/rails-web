#!/usr/bin/env node
// The market note as a Moonwell Base position page actually renders it.
//
// 2026-09-06: the toggle moved out of the Display (eye) menu onto the toolbar
// as a `Market notes · N` pill, and every entered market the account still
// holds carries a LIVE note (`…-head` ids) in the head slot. So "the note"
// below means the HISTORICAL one (`HIST`), the toggle is the pill, and a
// control that still holds a market is EXPECTED to show a live note — what it
// must not show is a historical one or a pill without a note behind it.
// ----------------------------------------------------------------------------
// A market note is a receipted fact about the MARKET the account was in, placed
// between the two of the account's own events that bracket it — phase 1 is the
// Moonwell Base share-rate step (lib/shared/market-note.ts,
// components/shared/market-note-row.tsx). It is NEVER an event: it is attached
// at render time by the id of the row it sits beside and lives outside `tl`,
// `displayedEvents` and the row list, so nothing that counts events may move
// because a note rendered. That property is invisible — a note counted as an
// event still renders and still reads correctly, and only a total quietly
// larger than the chain's says so. Hence check 4, which reads every count on
// the page twice, with the notes on and off, and demands they be identical.
//
// WHAT IS PINNED, AND WHERE IT CAME FROM. Only the step itself: blocks
// 50,516,524 → 50,516,566, ratio 3.6786, measured on the Sieve box against the
// MAMO market's WHOLE series of Mints and Redeems (2026-09-04) — a
// chain measurement, made in a different repo, on a different box, by a
// different reader than the page. Everything else — the anchor row, the
// account's supply markets, the mToken balance the slice is drawn from, and
// every figure's rendered form — is re-derived at run time from the timeline
// route and asserted against the DOM. No event NUMBER is pinned; no absence is
// pinned (the control's markets are asked about, not assumed).
//
// Proved it can fail 2026-09-04, BASE=https://rails-web-onboarding.vercel.app,
// against the deployed site BEFORE the page wiring landed — 22 checks,
// 14 FAILED:
//
//   FAIL 1    the share-rate route: 404, the route is part of this change
//   FAIL 2, 2* no note on the page, so no figure to check it against
//   FAIL 3a/3b nothing to order
//   FAIL 4a    no "Market notes" item in the Display menu
//   FAIL 4b    the two count reads are identical, but with no note between
//              them the comparison proves nothing — so it is red, not green
//   FAIL 5a/5b/5c  no row to toggle, persist or restore
//   FAIL 7b/7c/7d  the control's markets cannot be ASKED about (404), so its
//              clean page is unproven
//   FAIL 8a    the export carries no "## Market notes" section
//   PASS 0a–0d, 6, 8b, 9, 7a, 10
//
// §6.2 of the plan predicted 0, 5 and 6 green, 1/2/3/4/7 red and 8 green.
// Two corrections. Check 7 (the control) cannot be green before the change:
// confirming that the control's markets have no step means ASKING, and the
// route that answers is itself part of this change — reporting the control
// clean without asking would be pinning an absence, the one thing this house
// style forbids outright. And check 4b is red on purpose where check 2 is red:
// two identical count reads taken with no note in between are a green that
// asserts nothing, so the counts arm carries check 2's result in its own
// condition.
//
// ALL PASS 2026-09-04 (22 checks), twice: BASE=http://localhost:3022, a dev
// server reading the onboarding API; and BASE=https://rails-web-onboarding.
// vercel.app once a98f703c had deployed.
//
// 2026-09-04 (657eb889, the mark is the header): checks 2r and 2o added — the
// at-rest header states the rates and the ratio and nothing of the slice or the
// blocks; clicking opens the panel, and every figure check reads the OPEN row.
// ALL PASS (32 checks) on localhost:3022 and on vercel.app once deployed.
//
// One thing this run had to learn about the page, recorded so it is not
// re-learned: the rows are separated by render-only markers (the dev
// prov-coverage tripwire is an empty <i>), so "the next row" is the nearest
// sibling that is or contains an event row, never `nextElementSibling`.
//
// 2026-09-12: the ascending arm is gone. Every timeline reads newest-first and
// there is no control or param to flip it (useTimelineEvents's header says
// why), so the three `?order=asc` loads here now open the page as it is and
// PAGE DOWN to the note instead. The placement check that went with them —
// "ascending, the note precedes its anchor" — had no subject left; its
// descending twin was already here and is now the only one, which also
// removes the separate fresh context that existed purely to escape the
// per-wallet sort preference.
//
// Run:
//   BASE=http://localhost:3022 node scripts/verify/verify-market-note-row.mjs
//   BASE=https://rails-web.vercel.app node scripts/verify/verify-market-note-row.mjs

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";

// The MAMO cascade's liquidated account (2026-08-27): it held mMAMO across the
// step, so its page is the one that must carry the note.
const WALLET = (process.env.WALLET ?? "0x719eae70d4a83f35bf82a2740699f5db84be919d").toLowerCase();
// An account with Moonwell Base history in markets whose series the detector
// found nothing in — check 7 confirms that from the route rather than assuming
// it, and says so if the account turns out to have a step after all.
const CONTROL = (process.env.CONTROL ?? "0x70c1997ca695cc2c3a08ac1ba0f19d5a7e30c7fc").toLowerCase();

// The step, as measured on the Sieve box against the market's whole series.
const STEP_FROM_BLOCK = 50_516_524;
const STEP_TO_BLOCK = 50_516_566;
const STEP_RATIO = 3.678614;
const STEP_MARKET_SYMBOL = "MAMO";

const TIMELINE = (w) => `/api/chain/moonwell-base/timeline?wallet=${w}`;
const SHARE_RATE = (m) => `/api/chain/moonwell-base/share-rate?market=${m}`;
const PAGE = (w) => `${BASE}/base/moonwell/${w}`;

// The toolbar's count label, in every form `eventCountLine` writes it:
// "2,405 events", "1,200 of 2,405 events", "2,021 listed · 2,405 events",
// "Showing 2,021 listed of 2,405", and — on a position whose whole life is on
// the page under the cap arm — a bare "Showing 59". en-US grouping, so no bare
// \d+; and every branch is anchored and needs either the "Showing " prefix or
// a unit word, because a pattern that matches a lone number matches a filter
// chip's count too and every locator hung off it then addresses the wrong
// strip.
// ⚠️ THE COUNT LINE OUTGREW THIS PATTERN and the old one matched NONE of the
// forms the page actually draws with a cut on it. A windowed page whose ROWS
// and EVENTS have parted company — a served list groups repetitive stretches
// into folders, so 1,021 rows can cover 2,407 events — states both: "Showing
// 268 of 1,021 listed · 2,407 events". The trailing "· N events" made `$`
// fail; so did the plain "Showing 1,000 of 3,342 events", which no branch
// admitted either. `waitForList` then waited out its full 180 s on a page that
// was rendering perfectly, and the run died in the first fixture.
//
// Rewritten as ONE alternation over the real shapes rather than three
// overlapping ones: an optional "Showing", a count, an optional "of M", and
// then either "listed" (with the event total after it, where the two counts
// differ) or "events". It still refuses a bare "Showing 268".
const COUNT_RE = /^(?:Showing )?[\d,]+(?: of [\d,]+)?(?:(?: listed)(?: · [\d,]+ events?)?| events?)$/;

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

async function api(path, tries = 3) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    const res = await fetch(`${BASE}${path}`).catch((e) => {
      last = e;
      return null;
    });
    if (res?.ok) return res.json();
    if (res) last = new Error(`${res.status} ${res.statusText} ${path}`);
    await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
  }
  return { __error: String(last?.message ?? last ?? "unreachable") };
}

// ── The figures, formatted the way lib/shared/market-note.ts documents ──────
// Restated here rather than imported: a verifier that formats through the code
// under test cannot see that code format something differently.

/** A rate at five to six significant digits. */
const rate = (n) => n.toLocaleString("en-US", { minimumSignificantDigits: 5, maximumSignificantDigits: 6 });
// Mirrors lib/shared/market-note.ts formatRatio: a multiplier at a doubling or
// more (or a halving), the unsigned percentage move under that.
const ratio = (n) => {
  if (!(n > 0) || n >= 2 || n <= 0.5) return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}×`;
  const pct = Math.abs(n - 1) * 100;
  const text =
    pct >= 1
      ? pct.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      : pct.toLocaleString("en-US", { maximumSignificantDigits: 2 });
  return `${text}%`;
};
const block = (n) => n.toLocaleString("en-US");
/** The site's compact headline form for a large amount. */
const units = (n) =>
  n.toLocaleString("en-US", Math.abs(n) >= 1_000 ? { notation: "compact", maximumFractionDigits: 2 } : {});

// ── Check 0: what the timeline route says, before any page is opened ────────

const tl = await api(TIMELINE(WALLET));
const events = Array.isArray(tl.events) ? tl.events : [];
check(
  `0a  the timeline route answers for ${WALLET.slice(0, 10)}…`,
  events.length > 0,
  `${events.length} drawn of ${tl.totalEvents} total, source ${tl.coverage?.source ?? "?"}`,
);
const md = (e) => e.context?.data ?? {};
const ascending = [...events].sort((a, b) => a.blockNumber - b.blockNumber);

// The markets the account ever supplied into. On Base the market key on an
// event IS the mToken address (two Base markets both answer symbol() =
// "mUSDC", so the roster keys by address).
const supplyMarkets = new Map();
for (const e of ascending) {
  const d = md(e);
  if (d.side === "supply" && d.market) supplyMarkets.set(String(d.market).toLowerCase(), d.marketSymbol);
}
const stepMarket = [...supplyMarkets.entries()].find(([, sym]) => sym === STEP_MARKET_SYMBOL);
check(
  `0b  the account supplied into the ${STEP_MARKET_SYMBOL} market`,
  !!stepMarket,
  `supply markets: ${[...supplyMarkets.values()].join(", ") || "none"}`,
);

// The anchor: the first DRAWN event, in ascending block order, at or past the
// block the step is known to have happened by. Discovered, never pinned.
const anchor = ascending.find((e) => e.blockNumber >= STEP_TO_BLOCK);
check(
  `0c  an anchor row exists — the first drawn event at or past block ${block(STEP_TO_BLOCK)}`,
  !!anchor,
  anchor ? `block ${block(anchor.blockNumber)}, ${md(anchor).eventType}, id ${anchor.id}` : "none",
);

// The slice's input: the last supply-side row in that market at or before the
// step's opening block that left a positive mToken balance.
let held = null;
for (const e of ascending) {
  const d = md(e);
  if (e.blockNumber > STEP_FROM_BLOCK) break;
  if (d.side === "supply" && stepMarket && String(d.market).toLowerCase() === stepMarket[0] && d.mTokensAfter != null) {
    held = e;
  }
}
const heldUnits = held ? Number(md(held).mTokensAfter) : 0;
check(
  `0d  the account held ${STEP_MARKET_SYMBOL} shares across the step`,
  heldUnits > 0,
  held ? `${units(heldUnits)} mMAMO after its ${md(held).eventType} at block ${block(held.blockNumber)}` : "no holding",
);

// ── Check 1: the share-rate route, against the Sieve-box measurement ────────

const sr = stepMarket ? await api(SHARE_RATE(stepMarket[0])) : { __error: "no market to ask about" };
const steps = Array.isArray(sr.steps) ? sr.steps : [];
const step = steps.find((s) => s.fromBlock === STEP_FROM_BLOCK && s.toBlock === STEP_TO_BLOCK);
check(
  `1   the share-rate route answers one ${STEP_MARKET_SYMBOL} step, ${block(STEP_FROM_BLOCK)} → ${block(STEP_TO_BLOCK)}, ratio ${STEP_RATIO}`,
  steps.length === 1 && !!step && Math.abs(step.ratio - STEP_RATIO) < 0.001,
  sr.__error ? `route error: ${sr.__error}` : `${steps.length} step(s), ratio ${step?.ratio ?? "n/a"}`,
);

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

// Every string the note must state, derived from the two routes above.
const EXPECT = step
  ? {
      fromRate: rate(step.fromRate),
      toRate: rate(step.toRate),
      ratio: ratio(step.ratio),
      fromBlock: block(step.fromBlock),
      toBlock: block(step.toBlock),
      units: `${units(heldUnits)} mMAMO`,
      before: `${units(heldUnits * step.fromRate)} ${STEP_MARKET_SYMBOL}`,
      after: `${units(heldUnits * step.toRate)} ${STEP_MARKET_SYMBOL}`,
      // The time between the two blocks, from the route's own timestamps —
      // stated under the Blocks card once the panel is open.
      ...(step.fromTs > 0 && step.toTs > 0 ? { elapsed: elapsedText(step.fromTs, step.toTs) } : {}),
    }
  : null;
if (EXPECT) console.log(`      note must state: ${Object.values(EXPECT).join(" | ")}`);

// ── Page helpers ────────────────────────────────────────────────────────────

async function waitForList(page) {
  await page.getByText(COUNT_RE).first().waitFor({ state: "visible", timeout: 180_000 });
  // The timeline is client-fetched here (no SSR markup), and the page holds it
  // until the notes have settled — so the rows and the notes arrive together.
  await page.locator("[data-event-id]").first().waitFor({ state: "visible", timeout: 180_000 });
}

/** Press the toolbar's `Market notes · N` pill until `aria-pressed` reads
 *  `wantOn`. Pre-hydration clicks are lost, so the state is re-read after each
 *  press. Returns false when the pill is not on the page at all. */
async function setMarketNotesPill(page, wantOn) {
  const pill = page.getByRole("button", { name: /^Market notes/i }).first();
  if ((await pill.count()) === 0) return false;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const on = (await pill.getAttribute("aria-pressed")) === "true";
    if (on === wantOn) return true;
    await pill.click();
    await page.waitForTimeout(400);
  }
  return (await pill.getAttribute("aria-pressed")) === "true" ? wantOn : !wantOn;
}

/** Whether the Display menu offers an item at all — the "no inert toggle" rule.
 *  Throws if the menu itself never opened, so "absent" can never mean "the
 *  menu was never read". */
async function displayMenuOffers(page, label) {
  const countSpan = page.getByText(COUNT_RE).first();
  await countSpan.waitFor({ state: "visible", timeout: 60_000 });
  const row = countSpan.locator(
    'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " gap-2 ") and contains(concat(" ", normalize-space(@class), " "), " items-center ")][1]',
  );
  const trigger = row.locator("div.relative.inline-flex.items-center > button").last();
  // Open it, and confirm it opened by an item we know every page has, so a
  // menu that never opened cannot read as "the item is absent".
  let opened = false;
  for (let attempt = 0; attempt < 6 && !opened; attempt += 1) {
    await trigger.click();
    opened = await page
      .getByRole("button", { name: /^Timestamps \(UTC\)$/i })
      .waitFor({ state: "visible", timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (!opened) await page.waitForTimeout(700);
  }
  if (!opened) throw new Error(`the Display menu never opened on ${page.url()}`);
  const present = (await page.getByRole("button", { name: new RegExp(`^${label}$`, "i") }).count()) > 0;
  await countSpan.click();
  return present;
}

/**
 * The event row that sits next to the note, in one direction — the nearest
 * sibling that IS an event row or CONTAINS one (a collapsed run's folder holds
 * its members, and a note anchored inside a folder belongs beside the folder,
 * never in it). Everything between them is skipped, which is the point: the
 * list carries render-only markers between rows — the dev prov-coverage
 * tripwire is one — and a raw nextElementSibling reads one of those as "no
 * neighbour" and turns a correct placement red.
 */
async function neighbourEventId(page, direction) {
  return page
    .locator('[data-market-note]:not([data-market-note$="-head"])')
    .first()
    .evaluate((el, dir) => {
      let n = dir === "next" ? el.nextElementSibling : el.previousElementSibling;
      while (n) {
        const own = n.getAttribute("data-event-id");
        if (own) return own;
        const inner = n.querySelector("[data-event-id]");
        if (inner) return inner.getAttribute("data-event-id");
        n = dir === "next" ? n.nextElementSibling : n.previousElementSibling;
      }
      return null;
    }, direction)
    .catch(() => null);
}

/** Grow the local window until the note is on the page, or the clicks run out. */
async function revealNote(page, maxClicks = 30) {
  for (let i = 0; i < maxClicks; i += 1) {
    if ((await page.locator('[data-market-note]:not([data-market-note$="-head"])').count()) > 0) return true;
    const btn = page.getByRole("button", { name: /^Show \d+ more$/ });
    if ((await btn.count()) === 0) break;
    await btn.first().click();
    await page.waitForTimeout(200);
  }
  return (await page.locator('[data-market-note]:not([data-market-note$="-head"])').count()) > 0;
}

/** Every count on the page that reads the event list. */
async function readCounts(page) {
  return {
    countLine: await page.getByText(COUNT_RE).first().innerText(),
    eventRows: await page.locator("[data-event-id]").count(),
    windowLine: await page
      .getByText(/^Showing [\d,]+ of [\d,]+ rows$/)
      .first()
      .innerText()
      .catch(() => "(no window line)"),
    typeFilter: await readFilterPanel(page, "Types of event"),
  };
}

async function readFilterPanel(page, label) {
  const trigger = page.getByRole("button", { name: new RegExp(`^${label}$`) }).first();
  if ((await trigger.count()) === 0) return "(no filter)";
  await trigger.click();
  const panel = page.locator('[role="listbox"], [aria-haspopup="listbox"] + div').first();
  const text = await panel
    .innerText()
    .catch(() => "(unreadable)")
    .then((t) => t.replace(/\s+/g, " ").trim());
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  return text;
}

// ── The page ────────────────────────────────────────────────────────────────

const browser = await chromium.launch();
const pageErrors = [];

// The anchor sits a dozen rows into this account's life, which newest-first is
// deep in the list — so the load is followed by `revealNote`, which grows the
// local render window until the note is actually on the page. Every check
// below reads a note that is drawn, never one the window has not reached.
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1400 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await ctx.newPage();
page.on("pageerror", (e) => pageErrors.push(String(e)));
await page.goto(PAGE(WALLET), { waitUntil: "domcontentloaded", timeout: 300_000 });
await waitForList(page);
await revealNote(page);

const HIST = '[data-market-note]:not([data-market-note$="-head"])';
const noteCount = await page.locator(HIST).count();
const noteRow = page.locator(HIST).first();
const rowText = async () => (await noteRow.innerText()).replace(/\s+/g, " ");
check(
  "2   exactly one HISTORICAL market note renders on the position page",
  noteCount === 1,
  noteCount === 1 ? (await rowText()).slice(0, 220) : `${noteCount} found`,
);

// The mark is the header (2026-09-04): at rest the row states the two rates
// and the ratio and nothing of the slice; the slice, the blocks and the prose
// arrive when the header is opened, the way an event card's detail does.
const restText = noteCount > 0 ? await rowText() : "";
check(
  "2r  at rest the header states both rates and the ratio, and not the slice",
  !!EXPECT &&
    restText.includes(EXPECT.fromRate) &&
    restText.includes(EXPECT.toRate) &&
    restText.includes(EXPECT.ratio) &&
    !restText.includes(EXPECT.units) &&
    !restText.includes(EXPECT.fromBlock),
  restText ? restText.slice(0, 160) : "no note",
);
if (noteCount > 0) {
  await noteRow.getByRole("button", { expanded: false }).first().click();
  await page
    .locator("[data-market-note-open]")
    .waitFor({ state: "attached", timeout: 10_000 })
    .catch(() => {});
}
const opened = noteCount > 0 && (await page.locator("[data-market-note-open]").count()) === 1;
check("2o  clicking the header opens the note's panel", opened);
// The MAMO step's ratio is > 1 (measured on the Sieve box) — read that
// from the route rather than hard-coding the direction, so the check still
// means something if the pinned step is ever swapped for a falling one.
const stepGlyphClass = step && step.ratio > 1 ? "lucide-arrow-up-right" : "lucide-arrow-down-right";
const stepGlyphCount = noteCount > 0 ? await noteRow.locator(`svg.${stepGlyphClass}`).count() : 0;
check(
  "2d  the header carries the arrow-up-right glyph — the step rises",
  !!step && step.ratio > 1 && stepGlyphCount > 0,
  step ? `ratio ${step.ratio}, wanted svg.${stepGlyphClass}; found ${stepGlyphCount}` : "no step",
);
const noteText = noteCount > 0 ? await rowText() : "";
if (EXPECT) {
  for (const [what, expected] of Object.entries(EXPECT)) {
    check(`2${what.padEnd(10)} the note states ${expected}`, noteText.includes(expected), noteText ? "" : "no note");
  }
} else {
  check("2*  the note's expected figures could be derived", false, "no step from the share-rate route");
}

// Order: the note FOLLOWS the anchor's row. Below is older, and the note is
// only known to have happened BY its closing block — so it may not sit below a
// row that postdates that block.
const noteNeighbour = noteCount > 0 ? await neighbourEventId(page, "previous") : null;
check(
  "3a  the note's preceding row is the anchor",
  !!anchor && noteNeighbour === anchor.id,
  `preceding row ${noteNeighbour ?? "none"} vs anchor ${anchor?.id ?? "none"}`,
);

// Counts, with the note on the page and with it off. Read on THIS page, where
// check 2 has already established the note is present — so a green here can
// never mean "nothing was there to count".
const withNotes = await readCounts(page);
const toggled = await setMarketNotesPill(page, false);
const eyeOffers = await displayMenuOffers(page, "Market notes").catch((e) => String(e).split("\n")[0]);
check(
  "4a  the toolbar offers the Market notes pill, and the Display menu no longer does",
  toggled && eyeOffers === false,
  `pill ${toggled ? "pressed off" : "absent"}; eye menu ${typeof eyeOffers === "string" ? eyeOffers : eyeOffers ? "still offers it" : "does not"}`,
);
await page.waitForTimeout(300);
const noteGone = (await page.locator("[data-market-note]").count()) === 0;
const withoutNotes = await readCounts(page);
check(
  "4b  every count on the page is identical with the notes on and off",
  noteCount === 1 &&
    JSON.stringify(withNotes) === JSON.stringify(withoutNotes) &&
    withNotes.eventRows > 0 &&
    withNotes.typeFilter !== "(no filter)",
  `${JSON.stringify(withNotes)} vs ${JSON.stringify(withoutNotes)}`,
);
check(
  "5a  the toggle removes the note row",
  toggled && noteCount === 1 && noteGone,
  noteGone ? "" : "the row survived the toggle",
);

// The choice persists in this context, and only in it.
await page.reload({ waitUntil: "domcontentloaded", timeout: 300_000 });
await waitForList(page);
await page.waitForTimeout(500);
check(
  "5b  the choice survives a reload in the same context",
  toggled && (await page.locator("[data-market-note]").count()) === 0,
);
await page.close();

const fresh = await ctx.browser().newContext({ viewport: { width: 1440, height: 1400 } });
const freshPage = await fresh.newPage();
freshPage.on("pageerror", (e) => pageErrors.push(String(e)));
await freshPage.goto(PAGE(WALLET), { waitUntil: "domcontentloaded", timeout: 300_000 });
await waitForList(freshPage);
await revealNote(freshPage);
check("5c  a fresh reader sees the note again — the toggle defaults on", (await freshPage.locator(HIST).count()) === 1);

// The count line states the position's own total, not the drawn list's, and
// the notes have not touched it.
const countLine = await freshPage.getByText(COUNT_RE).first().innerText();
check(
  "6   the count line states the timeline route's own total",
  typeof tl.totalEvents === "number" && countLine.includes(tl.totalEvents.toLocaleString("en-US")),
  `"${countLine}" vs totalEvents ${tl.totalEvents}`,
);

// The Markdown export carries the note, and the event table is the same length
// either way — a note is not a row.
async function copyMarkdown(p) {
  await p
    .getByRole("button", { name: /Export this position|Copy for LLM/i })
    .first()
    .click();
  await p.getByRole("menuitem", { name: /Copy Position/i }).click();
  await p.waitForTimeout(400);
  return p.evaluate(() => navigator.clipboard.readText());
}
const exportCtx = await browser.newContext({
  viewport: { width: 1440, height: 1400 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const exportPage = await exportCtx.newPage();
exportPage.on("pageerror", (e) => pageErrors.push(String(e)));
await exportPage.goto(PAGE(WALLET), { waitUntil: "domcontentloaded", timeout: 300_000 });
await waitForList(exportPage);
const mdOn = await copyMarkdown(exportPage).catch((e) => `__error ${e}`);
await setMarketNotesPill(exportPage, false);
const mdOff = await copyMarkdown(exportPage).catch((e) => `__error ${e}`);
const tableRows = (s) => (typeof s === "string" ? s.split("\n").filter((l) => /^\|\s*[\d,]+\s*\|/.test(l)).length : -1);
check(
  "8a  the export carries a Market notes section and the note's sentence",
  typeof mdOn === "string" &&
    mdOn.includes("## Market notes") &&
    (!EXPECT || (mdOn.includes(EXPECT.fromRate) && mdOn.includes(EXPECT.toRate) && mdOn.includes(EXPECT.ratio))),
  typeof mdOn === "string" ? `${mdOn.length} chars` : String(mdOn),
);
check(
  "8b  the exported event table is the same length with the notes on and off",
  tableRows(mdOn) > 0 && tableRows(mdOn) === tableRows(mdOff),
  `${tableRows(mdOn)} rows on vs ${tableRows(mdOff)} off`,
);
await exportCtx.close();

// A pinned event page renders one card and nothing beside it.
if (anchor) {
  const pinned = await fresh.newPage();
  pinned.on("pageerror", (e) => pageErrors.push(String(e)));
  await pinned.goto(`${PAGE(WALLET)}/event/${encodeURIComponent(anchor.id)}`, {
    waitUntil: "domcontentloaded",
    timeout: 300_000,
  });
  await pinned.locator("[data-event-id]").first().waitFor({ state: "visible", timeout: 180_000 });
  await pinned.waitForTimeout(800);
  check("9   the pinned event page renders no note", (await pinned.locator("[data-market-note]").count()) === 0);
  await pinned.close();
} else {
  check("9   the pinned event page renders no note", false, "no anchor to pin");
}

// ── The control account ─────────────────────────────────────────────────────

const ctl = await api(TIMELINE(CONTROL));
const ctlEvents = Array.isArray(ctl.events) ? ctl.events : [];
const ctlMarkets = new Map();
for (const e of ctlEvents) {
  const d = e.context?.data ?? {};
  if (d.side === "supply" && d.market) ctlMarkets.set(String(d.market).toLowerCase(), d.marketSymbol);
}
check(
  `7a  the control ${CONTROL.slice(0, 10)}… has Moonwell Base history`,
  ctlEvents.length > 0 && ctlMarkets.size > 0,
  `${ctlEvents.length} events, supplied into ${[...ctlMarkets.values()].join(", ") || "nothing"}`,
);
// Asked, not assumed: a control whose markets DID step would make the arm below
// meaningless, so the run says so and stops trusting it.
let ctlSteps = 0;
let ctlUnread = 0;
for (const m of ctlMarkets.keys()) {
  const r = await api(SHARE_RATE(m), 2);
  if (r.__error || !Array.isArray(r.steps)) ctlUnread += 1;
  else ctlSteps += r.steps.length;
}
check(
  "7b  none of the control's supply markets has a step (read from the route, not assumed)",
  ctlUnread === 0 && ctlSteps === 0,
  ctlUnread > 0
    ? `${ctlUnread} of ${ctlMarkets.size} market(s) unreadable — pick another control and say so`
    : `${ctlSteps} step(s)`,
);
const ctlPage = await fresh.newPage();
ctlPage.on("pageerror", (e) => pageErrors.push(String(e)));
await ctlPage.goto(PAGE(CONTROL), { waitUntil: "domcontentloaded", timeout: 300_000 });
await waitForList(ctlPage);
await ctlPage.waitForTimeout(500);
check(
  "7c  the control page renders no HISTORICAL note",
  ctlUnread === 0 && ctlSteps === 0 && (await ctlPage.locator(HIST).count()) === 0,
);
// A live note is expected on a control that still holds an entered market; the
// pill must then be present, and absent when no note of any kind is — never an
// inert toggle either way. The eye menu offers nothing on any page.
const ctlNotes = await ctlPage.locator("[data-market-note]").count();
const ctlPill = await ctlPage.getByRole("button", { name: /^Market notes/i }).count();
const ctlOffers = await displayMenuOffers(ctlPage, "Market notes").catch((e) => String(e).split("\n")[0]);
check(
  "7d  the control page's pill is present exactly when a note (live) is, and the Display menu offers none",
  ctlUnread === 0 && ctlSteps === 0 && ctlPill > 0 === ctlNotes > 0 && ctlOffers === false,
  `${ctlNotes} note(s), pill ${ctlPill}, eye menu ${typeof ctlOffers === "string" ? ctlOffers : ctlOffers ? "offers it" : "does not"}`,
);

check("10  no page errors", pageErrors.length === 0, pageErrors.slice(0, 2).join(" | "));

await browser.close();
console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
