// Live in-browser verification of Share Phase 3 batch 1 — the per-event
// route, pinned mode, the `?at=` landing and the immutable event image —
// across the three families this batch built: Aave V3, Spark, Liquity V2 —
// then the sweep batches a to d, (2026-09-17) Polaris, the 27th route, with
// its own pinned block after the generic sweep, and (2026-09-20) the three
// VAULT families — Aave's on Ethereum, MetaMorpho's on Base and Yearn V3's —
// each with a vault block of its own at the foot of this file.
//
// What it holds, per family:
//   1. The position page's card carries a copy-link control (the event
//      menu's "Copy link to event page"; on Liquity V2, which has no menu,
//      the header's number pill, a link to the event page); the
//      clipboard (the pill's href) receives an absolute URL of the form
//      `<origin>/<position path>/event/<encoded id>`, and decoding the last
//      segment gives an id that is in the page's own `data-event-id` set.
//   2. Opening that URL in a FRESH context renders exactly one event card,
//      its `data-event-id` equals the id, its detail panel is open, the
//      "View in timeline" link points at `<position path>?at=<encoded id>`,
//      and the toolbar (its Date and sort controls) is absent.
//   3. `og:image` on the event page resolves — 200 `image/png`,
//      `cache-control` containing `immutable`. The same route with a
//      fabricated id is 200 `image/png` WITHOUT `immutable` (the fallback).
//   4. Following "View in timeline" lands with that card scrolled into view,
//      its detail open, and `at` gone from `location.search`.
//   5. A fabricated event id on the event route renders the notice line, no
//      card, no page error.
//   6. Check 2 still holds at 390px width.
//
// And, in its own section below the family sweep, SERVED FOLDERS — the same
// history as ROWS (`?folders=1`, decision 0019's evening amendment) on the two
// families whose index can group: a folder renders from the wire, numbering
// stays literal across it, a permalink lands inside one by EVENT KEY, the
// header's Σ agrees with the members the folder route returns, a failed read
// states itself, and the boundary card survives where the cut still binds.
// That section SKIPS, loudly, wherever the backend cannot answer `?group=1`.
//
// And THE EVENT SHEET (ui-jobs 330) on every family whose opened card's T2 is
// a balance sheet (components/shared/event-sheet.tsx; SHEET_FAMILIES):
// pinned events, each opened on its timeline and on its event page, read by
// the sheet's attributes. Every other family draws cells, and its pinned page
// is checked to draw no sheet.
//
// Subjects are read live off each family's listing (`/ethereum/aave-v3`,
// `/ethereum/spark`, `/ethereum/liquity-v2`) rather than hard-coded — the
// first row's own href, so nothing here goes stale when a wallet/trove goes
// quiet.
//
// ── THE 2026-09-20 SWEEP, and how to run one ───────────────────────────────
// `4a28f9bf` fixed `pickWorkingSubject`, which had been vacuous since it was
// written: it asked an HTML page's `cache-control` whether it was `immutable`,
// which no HTML page's is, so every family silently fell back to
// `candidates[0]`. Three families were spot-checked after it; the other
// twenty-eight had not been run against a probe that genuinely selects
// (TO-DO-ui-jobs §38). All thirty-one are now green.
//
// RUN IT IN BATCHES OF FOUR OR FIVE, with `FAMILIES=`, and RE-RUN ANY RED
// ALONE. The dev server compiles on demand and a nine-family batch outruns it:
// measured the same day, `spark`, `spark-folders` and `moonwell-base` each
// went red inside a batch and green alone, twice each. Those reds are the
// machine, not the page, and a sweep read off one long batch reports them as
// findings.
//
// All three batch reds were this file's own and are fixed here. A pinned
// event page was read after `open()`'s fixed 600 ms, and on a wallet whose
// history the client still has to fetch the one card the page exists to draw
// is not there yet — Moonwell Base 0x4bb3…0544 lands at 11.2 s. It now waits
// for the card, and for the not-found notice, and prints the elapsed time when
// the wait runs long. The third was `spark-folders`, whose count line read
// "Showing 1,004 listed" under load where a settled page then read "Showing
// 1,000 rows of 29,513 events": that is the page saying its lifetime figures
// have not landed, not a page that failed to group. The served-folders arm
// waits for the page's own settled marker now (`scripts/lib/timeline-draw.mjs`),
// and where it never settles the two checks that read the line are reported
// UNRUN instead of red.
//   (The settled form quoted there is the 2026-09-20 one. Decision 0019's
// amendment of 2026-09-24 retired it: a settled line reads "29,513 events ·
// loaded 20 Aug 2026 to 25 Sept 2026" and names no cap. The mid-settle form,
// which is the subject of the note, is unchanged.)
//
// Run:
//   BASE=http://localhost:3101 node scripts/verify/verify-event-share.mjs
//   BASE=http://localhost:3101 FAMILIES=spark,fluid node scripts/verify/verify-event-share.mjs

import { chromium } from "playwright";
import { CLOSED_GROUP, GROUP_FRAME, openGroup } from "./lib/group-rows.mjs";
import { openPositionCards } from "./lib/position-card.mjs";
import { showCardTab, waitOnFigures } from "./lib/card-tabs.mjs";
import {
  exhaustPaging,
  waitForCountSettled,
  countLineText,
  parseCountLine,
  NAMES_THE_CAP,
} from "../lib/timeline-draw.mjs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The repo root — the static roster card and the card-model probe below are
 *  read from the checkout this script sits in, not the working directory. */
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// The Liquity V2 event page's control is an icon named by its aria-label.
const IN_TIMELINE = 'a:has-text("View in timeline")';
const BASE = process.env.BASE ?? "http://localhost:3101";
const NAV = { waitUntil: "domcontentloaded", timeout: 300000 };
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR ?? path.join(os.tmpdir(), "rails-share-events");

// A definitely-nonexistent id — a hex-64-shaped segment too, so it also
// exercises the not-found notice's "view on the chain's explorer" link.
const FAKE_ID = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff:999999";

// A comma-separated allowlist for a development run over a subset of the
// families below (e.g. `FAMILIES=ebisu,seamless node scripts/verify/…`) — the
// full call list at the bottom always stays uncommented; this is how a build
// agent runs only its own batch while developing.
const FAMILIES_FILTER = process.env.FAMILIES
  ? new Set(
      process.env.FAMILIES.split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    )
  : null;

/** Families whose pinned page must carry the Explanation pane's copy-view link
 *  (see `verifyPinnedPage`). */
const EXPLANATION_FROM_FIRST_PAINT = new Set([
  "aave-v3",
  "spark",
  "moonwell",
  "compound-v2",
  "dolomite",
  "dolomite-closed",
  "llamalend",
  "llamalend-closed",
  // Retired for liquity-v1 (ui-jobs 236): its event route is the event's page,
  // which draws no position card, so no Explanation pane carries the link.
]);

/** Families whose opened card's T2 is the event sheet (ui-jobs 330). A
 *  family's every label is listed; some of its event kinds keep the cells
 *  (MakerDAO's give and auction rows, Polaris's transfers,
 *  PWN's mint, burn, non-default claim and extension, Compound V2's rows that
 *  move neither side, Frankencoin's terms changes and challenges, a Liquity
 *  fork's batch-manager rate changes), so the generic pinned page is not
 *  checked either way here. Seamless keeps the cells (no read lane), and so
 *  does Compound V3 on Base (no sheet drawn on 0x2b4e…f40f or 0x5c38…f4f6,
 *  13 Oct 2026). */
const SHEET_FAMILIES = new Set([
  "liquity-v2",
  "aave-v3",
  "aave-v3-base",
  "spark",
  "moonwell",
  "moonwell-base",
  "compound-v2",
  "dolomite",
  "dolomite-closed",
  "liquity-v1",
  "ebisu",
  "asymmetry",
  "basedollar",
  "makerdao",
  "polaris",
  "maple",
  "frankencoin",
  "fx",
  "pwn",
  "aave-v4",
  "aave-vaults",
  "morpho-base-vaults",
  "yearn-vaults",
  "compound-v3",
  "morpho",
  "morpho-base",
  "fluid",
  "llamalend",
  "llamalend-closed",
]);
/** The families whose builders key the event's rows `event…` (the first two
 *  sheets); the checks hold them to it. */
const KEYED_EVENT_ROWS = new Set(["liquity-v2", "aave-v3"]);

let failures = 0;
/** Sheet checks a subject's flags leave out; each prints a SKIP line. */
let skipped = 0;
/** Families whose run threw once and was retried — named in the verdict. */
const retriedFamilies = [];
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
  return cond;
};

const browser = await chromium.launch();

async function open(width, url, { flattenRuns = true } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  // "Collapse like events" defaults on (TimelineDisplayProvider) and, for a
  // wallet whose activity clusters into long same-kind streaks, can swallow
  // the very event these checks click into a run row — whose member cards
  // mount only once the row is expanded, and whose `?at=` landing never
  // resolves for a run-nested target (chain-truth-timeline.tsx's own
  // documented gap, a later pass, not this batch's to close). Flattening
  // runs for every context here tests the event-share feature on its own
  // terms, independent of that separate, already-tracked limitation.
  //
  // ⚠️ NOT ON A SERVED-FOLDER PAGE. Since rails-ops decision 0021 the flag
  // does nothing there: a served page's folders are not a reader's choice, and
  // a stored `collapseRuns: false` opens none of them. (Before 0021 it opened
  // every folder in view, one read each, and the SparkLend subject ran out
  // this file's 900 s.) Writing it would state a flattening that does not
  // happen, so a served page is tested as a reader meets it: the `?at=`
  // landing resolves by event key, and `verifyServedFolders` passes
  // `flattenRuns: false` for the same reason.
  //
  // Every Aave V3, SparkLend and Moonwell Base page is served unless it opts
  // out with `?folders=0`. So the test is made here, off the URL, rather than
  // left to each caller: the listing subjects, the "View in timeline" link and
  // the fabricated-id pages all reach those families without saying so.
  const target = new URL(url);
  const servedFolders =
    /^\/(ethereum\/(aave-v3|spark)|base\/moonwell)\/0x/.test(target.pathname) &&
    target.searchParams.get("folders") !== "0";
  if (flattenRuns && !servedFolders) {
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("timeline-display-v3", JSON.stringify({ collapseRuns: false }));
      } catch {}
    });
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url, NAV);
  await page
    .waitForFunction(() => !document.querySelector("[data-ctrl-waking]"), null, { timeout: 120000 })
    .catch(() => {});
  await page.waitForTimeout(600);
  return { ctx, page, errors };
}

async function eventIds(page) {
  return page.$$eval("[data-event-id]", (els) => els.map((e) => e.getAttribute("data-event-id")));
}

// The event page's link is the event menu's "Open event page" row, the ⋮ at
// the header's right end (ui-jobs 295); copy link moved to the event page
// (ui-jobs 308).
const COPY_LINK = '[data-menu-item="view-page"]';

async function copyEventLink(page) {
  if ((await page.locator(COPY_LINK).count()) === 0) await page.locator("[data-event-menu] > button").first().click();
  return `${BASE}${await page.locator(COPY_LINK).first().getAttribute("href")}`;
}

// The header's number pill, a link to the event page (ui-jobs 291).
const PILL_LINK = '[data-event-id] [data-event-number-link="page"]';

/** Check 1 on a family with no event menu: the first card's number pill. */
async function firstCardPill(page) {
  await page.waitForSelector(PILL_LINK, { timeout: 60000 }).catch(() => {});
  return (await page.locator(PILL_LINK).count()) > 0;
}

/** Fetch a URL and report its status, content-type and cache-control —
 *  plain `fetch`, not routed through Playwright, since this is a raw HTTP
 *  check on an image route, not a browser interaction. */
async function fetchImage(url) {
  const res = await fetch(url);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return {
    status: res.status,
    contentType: res.headers.get("content-type") ?? "",
    cacheControl: res.headers.get("cache-control") ?? "",
    bytes,
  };
}

async function ogImageUrl(page) {
  return page.locator('meta[property="og:image"]').getAttribute("content");
}

/** Checks 2 + 6: opening a pinned event URL renders exactly one card, open,
 *  correctly linked, with no toolbar. Reusable at both viewport widths.
 *
 *  `url` is the copied share link itself, so its OWN query string (when one
 *  survives — PWN's `?loan=`, Liquity V1's `?epoch=`; Aave V3/V4's `?market=`
 *  when non-default) is exactly the `subjectQuery` `ChainTruthTimeline`
 *  carries into "View in timeline"'s own href (see SUBJECT_PARAMS in
 *  components/shared/chain-truth-timeline.tsx) — reused here rather than
 *  reimplementing which params are "subject" ones. */
async function verifyPinnedPage(label, url, expectedId, positionPath, width) {
  const { ctx, page } = await open(width, url);
  // ⚠️ WAIT FOR THE CARD, not for a fixed moment. `open()` waits out
  // `[data-ctrl-waking]` and then 600 ms, and on a wallet whose history the
  // client still has to read, the one card this page exists to draw is not
  // there yet — measured 2026-09-20 on Moonwell Base 0x4bb3…0544, where it
  // lands at 11.2 s behind "Reading this wallet's history from the index."
  // Reading the count cold made that a family with FOUR reds about a page that
  // is right, and it surfaced only because `4a28f9bf` made the subject probe
  // genuinely select (TO-DO-ui-jobs §38). The elapsed time is printed when the
  // wait is slow, so a page that has become slow does not hide behind it.
  const waitedFrom = Date.now();
  await page
    .locator("[data-event-id]")
    .first()
    .waitFor({ state: "attached", timeout: 60000 })
    .catch(() => {});
  const waited = Date.now() - waitedFrom;
  if (waited > 3000) console.log(`  \u23f1 ${label} @${width}: the card took ${(waited / 1000).toFixed(1)}s to attach`);
  const ids = await eventIds(page);
  check(`${label} @${width}: exactly one event card`, ids.length === 1, JSON.stringify(ids));
  check(`${label} @${width}: its data-event-id is the shared id`, ids[0] === expectedId, ids[0]);
  // The toolbar is named by its count line (`data-timeline-total`). Until
  // 2026-09-11 it was named by its copy-view-link, and `ec46e137` moved that
  // control into the position card's Explanation pane, where a pinned page
  // still draws it on most families — so that selector read the CARD and
  // called the toolbar present. From then to 2026-10-01 it was the Date
  // control, which the families tied to a Lifetime flows chart no longer
  // draw. Check 1 proves this selector finds the toolbar where there is one.
  const toolbarCount = await page.locator("[data-timeline-total]").count();
  check(`${label} @${width}: toolbar absent (no count line)`, toolbarCount === 0, `${toolbarCount} found`);
  const sortBtn = await page.locator('button[aria-label^="Currently"]').count();
  check(`${label} @${width}: toolbar sort control absent`, sortBtn === 0);
  // These families pass the card an Explanation whatever the account's status
  // and before the live chain read lands, so the pane's copy-view link is in
  // the DOM (`keepMounted`, pane closed) as soon as the card is. The two
  // `-closed` entries pin a closed account, which narrates nothing and still
  // draws the control.
  if (EXPLANATION_FROM_FIRST_PAINT.has(label)) {
    // A closed position card (ui-jobs 209) draws its Explanation row once open.
    await openPositionCards(page);
    const copyView = page.locator('button[aria-label="Copy a link to this view"]').first();
    await copyView.waitFor({ state: "attached", timeout: 5000 }).catch(() => {});
    check(`${label} @${width}: the card's Explanation pane carries the copy-view link`, (await copyView.count()) > 0);
  }
  // A cells family's opened card draws its cells and no sheet (ui-jobs 330);
  // the sheet families are read in THE EVENT SHEET below.
  if (!SHEET_FAMILIES.has(label)) {
    await page
      .locator('[data-anatomy~="T2"]')
      .first()
      .waitFor({ state: "attached", timeout: 20000 })
      .catch(() => {});
    // The cells stand under the Figures tab (ui-jobs 370).
    await showCardTab(page, "figures");
    const t2 = await page.locator('[data-anatomy~="T2"]').count();
    const sheets = await page.locator("[data-sheet]").count();
    check(`${label} @${width}: a cells family's card draws no event sheet`, sheets === 0, `${sheets} sheet, ${t2} T2`);
  }
  return { ctx, page };
}

/** A subject whose position page renders at least one event AND whose event
 *  image actually resolves as the found (immutable) render, not the fallback
 *  — probed silently (no `check()` calls) over the listing's live rows, in
 *  order, rather than always trusting the first one.
 *
 *  Why this exists: some families' server loaders seed no events for a
 *  subject whose WALLET-level history both exceeds the served window and
 *  spans more than one life (Liquity V1's multi-epoch case — see the
 *  `EMPTY`-return comment in lib/liquity-v1/position-page-data.ts) — a
 *  pre-existing gap the position's own opengraph-image.tsx already falls
 *  back for the same way, not something this event route introduces. Rather
 *  than let the FIRST listing row land on that gap and read as a broken
 *  event route, this tries a few candidates and settles on the first one the
 *  backend actually answers for. Falls back to the first candidate (so the
 *  normal checks below fail informatively) if none of the first 10 work.
 *
 *  ⚠️ FIXED 2026-09-20, and it had been vacuous since it was written: the
 *  probe fetched the event PAGE and asked whether ITS `cache-control` said
 *  `immutable`. An HTML page's never does, so every candidate failed and every
 *  family silently fell back to `candidates[0]` — the loop looked like a
 *  search and was a first-row pick. The probe now resolves the page's own
 *  `og:image` and asks THAT, which is the question the docstring above always
 *  claimed it was asking. Found by the vault families, where a stored tail
 *  that has not caught up to the newest event is a real and common reason for
 *  the first row's card to be the fallback. */
async function pickWorkingSubject(hrefs, rowHrefRe) {
  const candidates = hrefs.filter((h) => h && rowHrefRe.test(h));
  for (const href of candidates.slice(0, 10)) {
    const { ctx, page } = await open(1280, `${BASE}${href}`);
    const positionPath = await page.evaluate(() => window.location.pathname);
    await page.waitForSelector("[data-event-id]", { timeout: 15000 }).catch(() => {});
    const ids = await eventIds(page);
    await ctx.close();
    if (ids.length === 0) continue;
    const eventUrl = `${BASE}${positionPath}/event/${encodeURIComponent(ids[0])}`;
    // Plain fetch, no browser: the event page renders on the server and
    // `og:image` is in the markup it sends.
    const og = await fetch(eventUrl)
      .then((r) => (r.ok ? r.text() : ""))
      .then((html) => html.match(/property="og:image"\s+content="([^"]+)"/)?.[1] ?? null)
      .catch(() => null);
    if (!og) continue;
    const probe = await fetchImage(og.startsWith("http") ? og : `${BASE}${og}`).catch(() => null);
    if (probe && probe.status === 200 && probe.cacheControl.includes("immutable")) return href;
  }
  return candidates[0];
}

/** Check 1's click: the first card's event menu, in its header, and report
 *  whether the copy-link row is now on the page. The card stays closed: the
 *  ⋮'s press does not reach the header's toggle. */
async function revealFirstCardCopyLink(page) {
  await page.waitForSelector("[data-event-id] [data-event-head-menu]", { timeout: 60000 }).catch(() => {});
  const firstCard = page.locator("[data-event-id]").first();
  // A press before hydration is lost: pressed until the row shows.
  for (let i = 0; i < 6 && (await page.locator(COPY_LINK).count()) === 0; i++) {
    await firstCard
      .locator("[data-event-head-menu] [data-event-menu] > button")
      .first()
      .click({ timeout: 15000 })
      .catch(() => {});
    await page.waitForSelector(COPY_LINK, { timeout: 2500 }).catch(() => {});
  }
  return (await page.locator(COPY_LINK).count()) > 0;
}

/** What the first card looks like right now — logged when check 1 fails. */
function firstCardState(page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll("[data-event-id]")];
    const first = cards[0];
    return {
      cards: cards.length,
      firstId: first?.getAttribute("data-event-id") ?? null,
      firstButtons: first
        ? [...first.querySelectorAll("button,[role=button]")]
            .map((b) => b.getAttribute("aria-label") ?? "?")
            .slice(0, 10)
        : null,
      panelOpen: !!first?.querySelector(".rounded-b-xl.bg-raised"),
      waking: !!document.querySelector("[data-ctrl-waking]"),
    };
  });
}

/** Check 4's viewport test, polled: the landing scroll is smooth and `at`
 *  leaves the URL the moment it STARTS, so a single measurement taken then
 *  reads the card where it was before the scroll (Maple: y=905 in a 900px
 *  viewport, mid-scroll, with the card at y=359 half a second later). Wait
 *  for the card to intersect, up to a budget that covers the smooth scroll
 *  plus `keepCentred`'s re-centre window, and report the final box. */
async function waitForCardInViewport(page, eventId) {
  const inView = await page
    .waitForFunction(
      (id) => {
        const el = document.querySelector(`[data-event-id="${id}"]`);
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.y < innerHeight && r.y + r.height > 0 && r.x < innerWidth && r.x + r.width > 0;
      },
      eventId,
      { timeout: 6000 },
    )
    .then(() => true)
    .catch(() => false);
  const box = await page.locator(`[data-event-id="${eventId}"]`).first().boundingBox();
  return { inView, box };
}

// ══════════════════════════════════════════════════════════════════════════
// THE EVENT SHEET (ui-jobs 330) — every family with a sheet builder
// ══════════════════════════════════════════════════════════════════════════
//
// The opened card's T2 on these families is a balance sheet: `data-sheet`
// with `data-sheet-breakdown`, the controls row (`data-sheet-switch`, and on
// phones the asset | USD group `data-sheet-column`), the sides
// (`data-sheet-side`, `data-sheet-touched`), the breakdown's layers
// (`data-sheet-layer`), rows (`data-sheet-row`, `total` the side's total,
// `event…` the event's rows), columns (`data-sheet-col`), the Risk and Limits
// panels (`data-sheet-panel`) and the values that swap to their change
// (`data-swap-value`). The checks count what they find and fail on a missing
// attribute or a state that did not follow a press, never on a figure's value.
// The words (the switch's label, "Not changed by this event", the panels'
// rows) are verify-disclosure-grammar.mjs's.
//
// The events are pinned by id (a chain coordinate), so a wallet that keeps
// acting does not move them; each is opened by its `?at=` landing. `event` is
// one with a previous event (its values swap, its breakdown has a carry
// layer), `second` another card on the same page, opened beside it, and
// `first` an event with no previous one, whose values are plain.
//
// Liquity V2 and Aave V3 are held to every check. A later family states what
// its sheet does not draw as a flag set false, its reason in `why`, and the
// check it would fail prints a SKIP line: `swaps` (no value swaps to its
// change), `carry` (no carry-forward layer), `usd` (no dollar column, so the
// phone's asset | USD toggle has nothing to swap), `panels` (no Risk or Limits
// panel, checked absent). `oneSided` is a lender's or holder's sheet: one
// side, named by the family (`SheetSide.name`).
const SHEET_SUBJECTS = {
  "liquity-v2": [
    {
      label: "Trove …545773770",
      path: "/ethereum/liquity-v2/trove/WETH/29779854367542649123526514384205099621162281315544372345570836626121545773770",
      event: "0xe5509980170a44f3f5878afd1b13d3e797cba9789b1509de475fcb9fb97ad930_1", // #3, a Borrow
      second: "0x46fb24cd6c2b19b143699504bfa3ed11b08a2bb8af11c96953a39cef053eb33c_17", // #1, the open
      first: "0x46fb24cd6c2b19b143699504bfa3ed11b08a2bb8af11c96953a39cef053eb33c_17",
      sides: ["collateral", "escrow", "debt"],
    },
  ],
  "aave-v3": [
    {
      label: "0xc593…5948",
      path: "/ethereum/aave-v3/0xc593352eefa7c45863525a3194870929fd6f5948",
      // 5 Oct 2026, Repay with collateral WETH → USDC: both sides touched.
      event:
        "transfer_out:0x4d5f47fa6a74757f35c14fd3a6ef8e3c9bc514e8:0x7e796baa18541a2018cb7c06f7079bcea2b9591f0ffd00232bad7cc847c4da2e:28",
      second:
        "withdraw:0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2:0x790a10a9b287a9ad6ee5ed4582bcd1dde5a129e7784bd6b412c540683de7ed04:4",
    },
    {
      label: "0x9ff6…0de5",
      path: "/ethereum/aave-v3/0x9ff679ef5e663a223c5ef07fd191e9e7eda90de5",
      // 6 Oct 2026, a WETH Borrow: the collateral side untouched.
      event:
        "borrow:0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2:0x2b82089ec595c4609440e634572811db526179653f67dea0bb4c324b0511f417:4",
      // The account's first event.
      first:
        "supply:0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2:0x1e69dafd5a2ca3310edf6fa7f9e39cf48edd998396fdb40063b16935c21ac222:6",
    },
  ],
  // ── The families that followed (330's overnight sprint). A flag set false
  // names a check the family's sheet cannot pass, with the reason from item
  // 330's gaps in `why`; the run prints a SKIP line for each. ──
  spark: [
    {
      label: "0x1601…347e",
      path: "/ethereum/spark/0x1601843c5e9bc251a3272907010afa41fa18347e",
      // 13 Oct 2026, a Withdraw with a Market move; Spark draws through aaveFamilySheet.
      event: "withdraw:0x27bc2b480b5f8097cdd121baa615017d34190cf94afc4a3463ddc5a50b04af0d:4",
      second: "supply:0x448f90f08cdb9b214c4db8774342f71f80eb76f0dee831405ebce2e57c666a3f:31",
    },
  ],
  moonwell: [
    {
      label: "0x9781…5f05",
      path: "/ethereum/moonwell/0x9781f72f15ff9d961f5b0aaf1d93b40c23905f05",
      // 10 Sep 2026, a Withdraw. The Ethereum and Base names share the builder.
      event: "0x1f10abf19d6af3e4f41901ac9576026d9a08de07792cec138e18112df462b183-4",
      second: "0x59fa943af178b6fc645f186cf9d04c34c6ffd9418ca1b606c0bedd8d6c86e27f-4",
      swaps: false,
      why: { swaps: "Risk and Limits are unread (the page carries no per-event Comptroller state), so no value swaps" },
    },
  ],
  "compound-v2": [
    {
      label: "0x1a6b…9910",
      path: "/ethereum/compound-v2/0x1a6bae20f70691ce1755a003c4560879b7798910",
      // 29 Dec 2021, a Repay with a Market move.
      event: "repay:6db9b0118adb0763a140babff113b07c206215d112d7b0365c6aca31f77b3105:0",
      second: "redeem:7096b7359ba8b7eb5fe17f18111d7dd58b8d8d850c2e62d205c6db840f3d9cd5:1",
      swaps: false,
      why: {
        swaps:
          "Risk and Limits are unread (getAccountLiquidity and markets() at the event's block are not on the page), so no value swaps",
      },
    },
  ],
  dolomite: [
    {
      label: "0xe670…7273",
      path: "/ethereum/dolomite/0xe6705fccaf951870ef24463c88a81f31610efba4/53264333596970428064010753932179380014364720754547549633613121572245119207273",
      // 9 Aug 2026, a Repay (a deposit of the owed asset).
      event: "deposit:7a188131629ca1733dfe5b2068842a9ee5df52eca7b522f905352f42c96bf7f6:8:self",
      second: "withdraw:c635006b74581a9f7a1f85880578a63dbe9e437a720e4eec6b73793e52db8ee5:6:self",
      swaps: false,
      why: {
        swaps:
          "Risk and Limits are unread (the account's margin reads at the event's block are not on the page), so no value swaps",
      },
    },
  ],
  "liquity-v1": [
    {
      label: "0x8eb2…d74c",
      path: "/ethereum/liquity-v1/0x8eb2e0cebcd191625037a042c9edf67b7f7fd74c",
      // 14 Jun 2022, a Repay: the collateral side untouched.
      event: "0x279c6976b089bdb2fde79c11eea756c46ef01dd8dc1ea1e05b4049cd893137d6-420",
      second: "0xe409ed2b68b9bc04511c5b5939a298599a70846a94cc194c4ee8ac71d8fa0724-455",
      // The open, 28 Aug 2021.
      first: "0x6f54fef7f4a201edd128d9224910678961d2279042a232b941e58c1647ceb0b1-139",
      sides: ["collateral", "debt", "reserve"],
    },
  ],
  ebisu: [
    {
      label: "WBTC …7638",
      path: "/ethereum/ebisu/WBTC/75911241408635389930317354588378809432274724767733080584082611717827843647638",
      // 9 Jun 2026, a Withdraw. Ebisu, Asymmetry and Basedollar share liquity-fork-sheet.tsx.
      event: "0x8496531fb5d25fc73d0d2df3695176b44d86f057871e9b89a5de224f16590a18-0",
      second: "0x56f402df843e775def041e3096fbef00dcebc3873d309b8d52629b204f7f0c32-2",
      sides: ["collateral", "escrow", "debt"],
    },
  ],
  basedollar: [
    {
      label: "wstETH …0874",
      path: "/base/basedollar/wstETH/35503968854505941585891917177059866138830265432583817156640567483056892500874",
      // 29 Aug 2026, Add and Borrow; the collateral total reads "Not read on
      // this page" (Basedollar's operate rows carry no price).
      event: "0x81c3c97a12ae9b68adfa808ef542f7cfb157f5fd0890e7eb37b21336e5e0f757-2",
      second: "0x08ed0149157d9954c4ea33ff7567578a91cd94deb0e0d93e2d22bf5489dae6e8-2",
      sides: ["collateral", "escrow", "debt"],
    },
  ],
  makerdao: [
    {
      label: "0x226e…eb4",
      path: "/ethereum/makerdao/0x226ede73e2efae6a1acf4f162b8e28caee3aaeb4",
      // 8 Oct 2026, a Withdraw (frob).
      event: "frob:0xb23e4a4d2a5dc6a25010c0c123f3a680e892ed16ec9e347ee1fdf39f918a7e35:498",
      second: "frob:0x12405480368425ba378ac66172a1c9103de29f8713967897614083b27ca6520a:683",
    },
  ],
  polaris: [
    {
      label: "usdp/166",
      path: "/sepolia/polaris/usdp/166",
      // 27 Aug 2026, a Withdraw; the liquidation above it keeps the cells.
      event: "cdp_updated:0xc12e8b48a67cb713800b900f19091df1a8bafff6c3b7a0f3f42bac9d0c3e5999:10",
      second: "cdp_updated:0x9e33142311ce234052410e8d2455045035c59370eae3e72c35a633fe6caec872:14",
      // The open.
      first: "cdp_updated:0xc3cd88b40626d8f4caa15c76e73b9a9e3b2982ca3727f2a0a1b6a9f14256dc28:21",

      sides: ["collateral", "escrow", "debt"],
    },
  ],
  maple: [
    {
      label: "0xd2f8…aa97",
      path: "/ethereum/maple/0xd2f8d420b06328b50b3593da1a60f362053aaa97",
      // 13 Oct 2026, a withdrawal request (USDC pool).
      event: "request:83c49c5687101aed6a0a1494933bb2ba8e0c85bc8d5ecabc144491332b6ee471:5",
      second: "request_fill:64cf04ea90b65e50d04884ca5d20f2e89a6efe7489687f62700975bde22fab65:0",
      oneSided: true,
      panels: false,
      swaps: false,
      usd: false,
      why: {
        oneSided: "a lender holds a pool claim, drawn as one side named Pool claim",
        panels: "a lender has no liquidation, so 330's table gives Maple no Risk or Limits",
        swaps: "no panel, so no value swaps",
        usd: "the claim is stated in the pool's asset, no dollar column",
      },
    },
  ],
  frankencoin: [
    {
      label: "0x6377…a3f",
      path: "/ethereum/frankencoin/0x6377a63b2a8caa1db4190a5419d2dc9215d74a3f",
      // 15 Jul 2026, Close Position.
      event: "minting_update:807177d0a82fcc6d334f645792264052d59164a85f52f6c0d2db116a11afb93d:143",
      second: "minting_update:16f31cae70b1f9075899e79c312bc96675f7ee062331622f3dc8d8d908e7a801:101",
      swaps: false,
      usd: false,
      why: {
        swaps:
          "on the close the liquidation price reads Closed and the rest read Not read on this page (no market price, no receipt rate); the page's other sheet row is the open, with no previous event",
        usd: "Frankencoin prices nothing in dollars: both totals state the unit figure",
      },
    },
  ],
  fx: [
    {
      label: "wsteth-249",
      path: "/ethereum/fx/wsteth-249",
      // 28 Feb 2025, Withdraw and Repay.
      event: "0x8766352d623d50606f8a6929ee945523619b5e9c81a83d5dcf740f3c15a0f795:21",
      second: "0xe6dab53fd66f31cdea1bb1f7ec776bfb292e7b1adabc5063c5aba213bce9aea1:18",
    },
  ],
  pwn: [
    {
      label: "loan 20",
      path: "/ethereum/pwn/0x0598b250a99bd45155a6b9b04af2ee19a2e5fed0?loan=20",
      // 1 Nov 2023, the repayment; Default state is the one swap value.
      event: "paid_back:d9505efcdac9fe2798b1870ca57e03c3cb810c2c9d6b03ea52f5ace086d4cbd8:5",
      second: "created:3325cf7144a87e1a2d9d23e2080800752a39637b813e27678a009a902a1d0dc4:4",
      // The creation.
      first: "created:3325cf7144a87e1a2d9d23e2080800752a39637b813e27678a009a902a1d0dc4:4",
      usd: false,
      why: { usd: "the page holds no price, so no dollar column" },
    },
  ],
  "aave-v4": [
    {
      label: "main 0x7eac…fa09",
      path: "/ethereum/aave-v4/spoke/main/0x7eac02864fbae93de38394a3e7b72a22e9b5fa09",
      // 19 Sep 2026, a Withdraw with a Market move; LTV is the one swap value.
      event: "0x93924cd94df220dd1ab3691d52e949bc413fa9fd03838d20dae69195db1d6898-6",
      second: "0x76bd74533a140879613d00986f828c5734fd9dd79892f85a8be550ec930e7c18-6",
    },
  ],
  "compound-v3": [
    {
      label: "usdc 0xd51c…f519c",
      path: "/ethereum/compound-v3/usdc/0xd51c5283b8727206bf9be2b2db4e5673efaf519c",
      // 26 Sep 2026, Withdraw Collateral.
      event: "0x1b24d1761a9ca435f2b63b76ed2f6b7b119c9474b37e2fc2c60e7266b9e55fec-1",
      second: "0x1b24d1761a9ca435f2b63b76ed2f6b7b119c9474b37e2fc2c60e7266b9e55fec-3",
      swaps: false,
      why: {
        swaps:
          "the collateral factors are read only for an absorb's seized assets, so the Risk and Limits values stand unread and none swaps",
      },
    },
  ],
  fluid: [
    {
      label: "11044",
      path: "/ethereum/fluid/11044",
      // 21 Jul 2026, a Withdraw.
      event: "withdraw:09dc1e0d4e197230f505de564bd5e1d7ab3ff1299462a9bf36f08d72a512ffcc:355:11044",
      second: "payback:5106b940ddf22656194b98b35a6a6f076cff396e01b1df03669248d63f88aaa6:233:11044",
      usd: false,
      why: { usd: "Fluid prices nothing in dollars: the totals state the leg's token" },
    },
  ],
  "morpho-base": [
    {
      label: "0xd13d…/0x9103…",
      path: "/base/morpho/0xd13de0ab683e6b1eef10532759d9717b65d8a8bd/0x9103c3b4e834476c9a62ea009ba2c884ee42e94e6e314a26f04d312434191836",
      // 5 Oct 2026, Remove Collateral. Ethereum and Base share morpho-sheet.ts.
      event: "0x17675f8d57fdd518d7cc8c8f607588887495778d8f00f00883920b29f7e2ff78:3",
      second: "0x249a970937cbda2e4fae1445393bae26e1af37bed69d5c921ca2f9fa0da4d2ba:6",
      usd: false,
      why: { usd: "Morpho prices nothing in dollars: the sheet is in tokens" },
    },
  ],
  llamalend: [
    {
      label: "0x100d…/0xe32a…",
      path: "/ethereum/llamalend/0x100daa78fc509db39ef7d04de0c1abd299f4c6ce/0xe32a8cf93af8661ec4708ef627b255801184ad2f",
      // 29 Jul 2026, a Repay.
      event: "repay:8acd69cf7e9ec31a63b7a6f3c93f7642826a266dc60b578707d0d072a69697b4:732:self",
      second: "borrow:73d5f7a54ab2338d01859dbf7f175d64ffebe95f1896c37bc962da3a85f5abec:384:self",
    },
  ],
  "aave-vaults": [
    {
      label: "0x7bc3…/0x6348…",
      path: "/ethereum/aave/vaults/0x7bc3485026ac48b6cf9baf0a377477fff5703af8/0x634826fb67d4eb9633f0011fae8e23cf99acd6f0",
      // 20 Jun 2026, a Withdrawal (the Deposit after it starts from nothing,
      // so it draws no carry rows). Yearn, the Aave vaults and MetaMorpho share
      // vault-sheet.tsx.
      event: "0x386ee149ce06cce688af210acd99d1b222f6bd4606e7702ca170b4b5eac5e423:77",
      second: "0x386ee149ce06cce688af210acd99d1b222f6bd4606e7702ca170b4b5eac5e423:115",
      oneSided: true,
      panels: false,
      swaps: false,
      usd: false,
      why: {
        oneSided: "a vault holding is one side, named Vault shares",
        panels: "a vault holding has no liquidation, so 330's table gives the vault rows no Risk or Limits",
        swaps: "no panel, so no value swaps",
        usd: "the page holds no price: the total states the asset",
      },
    },
  ],
};

const cardSel = (id) => `[data-event-id="${id}"]`;
const sheetSel = (id) => `${cardSel(id)} [data-anatomy~="T2"] [data-sheet]`;
/** The card's breakdown switch: on its tab strip while Figures is open
 *  (decision 0044), on the sheet's controls row where the card has no strip. */
const switchSel = (id) => `${cardSel(id)} [data-sheet-switch]`;
/** One switch, in its place: on the strip and none in the sheet on a tabbed
 *  card, in the sheet on an untabbed one. */
const switchPlaced = (at) =>
  !!at && (at.tabbed ? at.stripSwitches === 1 && at.switches === 0 : at.switches === 1 && at.allSwitches === 1);
/** A press by the element's click(): a Playwright click times out on an
 *  element a layer hides, and the sheet's controls sit in the card's body. */
const press = (page, sel) =>
  page
    .locator(sel)
    .first()
    .evaluate((el) => el.click())
    .then(() => true)
    .catch(() => false);

/** The sheet's state, read off its attributes. */
const readSheet = (page, id) =>
  page
    .locator(sheetSel(id))
    .first()
    .evaluate((s) => {
      const vis = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
      const rowsOf = (el) => [...el.querySelectorAll("[data-sheet-row]")].map((r) => r.getAttribute("data-sheet-row"));
      return {
        breakdown: s.getAttribute("data-sheet-breakdown"),
        controls: s.querySelectorAll("[data-sheet-controls]").length,
        switches: s.querySelectorAll("[data-sheet-switch]").length,
        tabbed: !!s.closest("[data-card-tab-open]"),
        stripSwitches: (s.closest("[data-event-id]") ?? s).querySelectorAll('[role="tablist"] [data-sheet-switch]')
          .length,
        allSwitches: (s.closest("[data-event-id]") ?? s).querySelectorAll("[data-sheet-switch]").length,
        layers: [...s.querySelectorAll("[data-sheet-layer]")].map((e) => e.getAttribute("data-sheet-layer")),
        sides: [...s.querySelectorAll("[data-sheet-side]")].map((e) => {
          const rows = rowsOf(e);
          return {
            side: e.getAttribute("data-sheet-side"),
            name: e.querySelector("h3")?.textContent.trim() ?? "",
            touched: e.getAttribute("data-sheet-touched"),
            totals: rows.filter((r) => r === "total").length,
            // The escrow's and the reserve's panels key their row by the move.
            events: rows.filter((r) => /^(event|escrow-|reserve-)/.test(r)).length,
            // The rows outside every layer, less the total and Before: the
            // event's rows, whatever key the builder gave them.
            moved: [...e.querySelectorAll("[data-sheet-row]")].filter(
              (r) =>
                !r.closest("[data-sheet-layer]") && !["total", "before"].includes(r.getAttribute("data-sheet-row")),
            ).length,
          };
        }),
        panels: [...s.querySelectorAll("[data-sheet-panel]")].map((e) => ({
          panel: e.getAttribute("data-sheet-panel"),
          rows: rowsOf(e).length,
        })),
        swaps: s.querySelectorAll("[data-swap-value]").length,
        swapButtons: s.querySelectorAll("button[data-swap-value]").length,
        cols: [
          ...new Set(
            [...s.querySelectorAll("[data-sheet-col]")].filter(vis).map((e) => e.getAttribute("data-sheet-col")),
          ),
        ],
        market: s.querySelectorAll('[data-sheet-row="market"]').length,
        marketReceipt: s.querySelectorAll('[data-sheet-row="market"] .prov-locate-box').length,
      };
    })
    .catch(() => null);

/** The sheet's figures, each with whether it sits in a receipt box (the
 *  `<Prov>` span inside the card's receipts scope). A figure is a visible value
 *  cell, a side's total or a panel value with a digit in it; the repaid
 *  assets' row states a zero of no receipt and is left out. */
const sheetFigures = (page, id) =>
  page
    .locator(sheetSel(id))
    .first()
    .evaluate((s) => {
      const vis = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
      const out = [];
      s.querySelectorAll(
        '[data-sheet-col], [data-sheet-row="total"] [role="group"], [data-sheet-panel] [data-swap-value]',
      ).forEach((el) => {
        if (!vis(el) || el.closest('[data-sheet-row="repaid"]')) return;
        const text = el.textContent.replace(/\s+/g, " ").trim();
        if (!/\d/.test(text)) return;
        out.push({
          row: el.closest("[data-sheet-row]")?.getAttribute("data-sheet-row") ?? "?",
          text,
          receipt: !!el.querySelector(".prov-locate-box"),
        });
      });
      return out;
    })
    .catch(() => []);

/** Wait for the card's sheet; the Aave sheet stands once the block read lands.
 *  On the timeline the sheet stands under the opened card's Figures tab
 *  (ui-jobs 370), so the tab is pressed; the event page draws no strip. Under
 *  640px a `?at=` landing leaves the card closed, so it is opened by its
 *  control when no T2 has drawn. */
async function waitSheet(page, id, timeout = 120000) {
  const card = page.locator(cardSel(id)).first();
  const t2 = card.locator('[data-anatomy~="T2"]').first();
  await t2.waitFor({ state: "attached", timeout: Math.min(timeout, 20000) }).catch(() => {});
  if (!(await t2.count())) await openCardById(page, id);
  return waitOnFigures(card, '[data-anatomy~="T2"] [data-sheet]', timeout);
}

/** Open a card on the timeline by its row control (the header from 640px, the
 *  spine's segment under it), pressed until it reads open. */
async function openCardById(page, id) {
  const card = page.locator(cardSel(id)).first();
  if (!(await card.count())) return false;
  const control = card
    .locator('[data-spine-toggle], [data-anatomy~="T1"] [data-row-control][role="button"]')
    .locator("visible=true")
    .first();
  for (let i = 0; i < 8; i++) {
    if ((await card.locator('[data-anatomy~="T2"]').count()) > 0) return true;
    await control.evaluate((el) => el.click()).catch(() => {});
    await card
      .locator('[data-anatomy~="T2"]')
      .first()
      .waitFor({ state: "attached", timeout: 8000 })
      .catch(() => {});
  }
  return (await card.locator('[data-anatomy~="T2"]').count()) > 0;
}

/** Wait for the sheet's breakdown attribute to read `want`. */
const waitBreakdown = (page, id, want) =>
  page
    .waitForFunction(
      ([sel, want]) => document.querySelector(sel)?.getAttribute("data-sheet-breakdown") === want,
      [sheetSel(id), want],
      { timeout: 10000 },
    )
    .then(() => true)
    .catch(() => false);

/** One subject's sheet checks. */
async function verifySheetSubject(name, s) {
  const tag = `${name} sheet ${s.label}`;
  // A path may carry its subject's query (PWN's `?loan=`); `at` joins it.
  const [route, query] = s.path.split("?");
  const landing = (id) => `${BASE}${route}?${query ? `${query}&` : ""}at=${encodeURIComponent(id)}`;
  const eventPage = (id) => `${BASE}${route}/event/${encodeURIComponent(id)}${query ? `?${query}` : ""}`;
  /** A check the subject's flags leave out, stated in the run. */
  const skip = (what, why) => {
    skipped++;
    console.log(`SKIP  ${tag}: ${what} — ${why}`);
  };
  const flag = (k) => s[k] !== false;
  // Liquity V2 and Aave V3 key the event's rows `event…`, and the check
  // holds them to it; the families that followed name their rows freely, and
  // their event rows are read as the rows outside every layer.
  const keyed = KEYED_EVENT_ROWS.has(name);
  const eventRows = (x) => (keyed ? x.events : x.moved);
  const layersWanted = flag("carry") ? ["carry"] : [];

  // ── 1280, the timeline: the sheet on open, the switch, the sides, the
  // panels, the swap, the receipts ──
  {
    const { ctx, page, errors } = await open(1280, landing(s.event));
    const drawn = await waitSheet(page, s.event);
    if (!check(`${tag} @1280: the opened card's T2 draws data-sheet`, drawn)) {
      await ctx.close();
      return;
    }
    const at = await readSheet(page, s.event);
    check(`${tag} @1280: the breakdown is off on open`, at?.breakdown === "off", at?.breakdown);
    check(`${tag} @1280: no data-sheet-layer is drawn off`, at?.layers.length === 0, JSON.stringify(at?.layers));
    check(
      `${tag} @1280: one data-sheet-switch, on the tab strip (a tabbed card) or the controls row`,
      at?.controls === 1 && switchPlaced(at),
      JSON.stringify({
        controls: at?.controls,
        tabbed: at?.tabbed,
        strip: at?.stripSwitches,
        inSheet: at?.switches,
        all: at?.allSwitches,
      }),
    );
    const sides = at?.sides ?? [];
    if (s.oneSided)
      check(
        `${tag} @1280: one side, headed by the family's name for it (${s.why.oneSided})`,
        sides.length === 1 && !!sides[0].name && !["Collateral", "Debt"].includes(sides[0].name),
        JSON.stringify(sides.map((x) => [x.side, x.name])),
      );
    else {
      // A family whose position holds an amount beside the two sides draws it
      // as a panel of its own (`sides`): the gas compensation escrow between
      // Collateral and Debt, Liquity V1's liquidation reserve after Debt.
      const want = s.sides ?? ["collateral", "debt"];
      check(
        `${tag} @1280: the sides are ${want.join(", ")}`,
        JSON.stringify(sides.map((x) => x.side)) === JSON.stringify(want),
        JSON.stringify(sides.map((x) => x.side)),
      );
    }
    check(
      `${tag} @1280: each side has one total row`,
      sides.length > 0 && sides.every((x) => x.totals === 1),
      JSON.stringify(sides),
    );
    check(
      `${tag} @1280: a touched side has the event's row, an untouched side none`,
      sides.length > 0 &&
        sides.every((x) => (x.touched === "true" ? eventRows(x) > 0 : x.touched === "false" && eventRows(x) === 0)),
      JSON.stringify(sides),
    );
    if (flag("panels"))
      check(
        `${tag} @1280: the Risk and Limits panels, each with rows`,
        JSON.stringify(at?.panels.map((p) => p.panel)) === JSON.stringify(["risk", "limits"]) &&
          at.panels.every((p) => p.rows > 0),
        JSON.stringify(at?.panels),
      );
    else
      check(
        `${tag} @1280: no Risk or Limits panel (${s.why.panels})`,
        at?.panels.length === 0,
        JSON.stringify(at?.panels),
      );
    check(
      `${tag} @1280: amount and usd columns, no phone column`,
      JSON.stringify([...(at?.cols ?? [])].sort()) === JSON.stringify(["amount", "usd"]),
      JSON.stringify(at?.cols),
    );

    // A second card on the page, opened beside it.
    let second = s.second ?? null;
    if (second && !(await page.locator(cardSel(second)).count())) second = null;
    if (!second)
      second = await page
        .$$eval(
          "[data-event-id]",
          (els, id) => els.map((e) => e.getAttribute("data-event-id")).find((x) => x !== id),
          s.event,
        )
        .catch(() => null);
    const secondOpen = second ? (await openCardById(page, second)) && (await waitSheet(page, second, 60000)) : false;
    check(`${tag} @1280: a second card opens to its sheet`, secondOpen, second ?? "no other card");
    const secondAt = secondOpen ? await readSheet(page, second) : null;
    if (secondOpen) check(`${tag} @1280: the second card's breakdown is off on open`, secondAt?.breakdown === "off");

    // The switch: on, the layers drawn, the second card unchanged; off again.
    await press(page, switchSel(s.event));
    const on = await waitBreakdown(page, s.event, "on");
    const atOn = await readSheet(page, s.event);
    check(`${tag} @1280: a press on the switch turns the breakdown on`, on, atOn?.breakdown);
    if (flag("carry"))
      check(
        `${tag} @1280: with the breakdown on, its layers are drawn`,
        (atOn?.layers.length ?? 0) > 0 && atOn.layers.includes("carry"),
        JSON.stringify(atOn?.layers),
      );
    else skip("with the breakdown on, the carry layer is drawn", s.why.carry);
    if (secondOpen) {
      const other = await readSheet(page, second);
      check(
        `${tag} @1280: only that card changed (the second stays off, no layer)`,
        other?.breakdown === "off" && other.layers.length === 0,
        JSON.stringify({ breakdown: other?.breakdown, layers: other?.layers }),
      );
    }
    check(
      // A sheet leaves the row out where the prices moved nothing.
      `${tag} @1280: a Market move row, where drawn, carries a receipt`,
      !!atOn && atOn.marketReceipt >= atOn.market,
      `${atOn?.market} row, ${atOn?.marketReceipt} receipt`,
    );
    const figs = await sheetFigures(page, s.event);
    const bare = figs.filter((f) => !f.receipt);
    check(
      `${tag} @1280: every figure in the sheet carries a receipt (${figs.length})`,
      figs.length > 0 && bare.length === 0,
      JSON.stringify(bare.slice(0, 4)),
    );
    await press(page, switchSel(s.event));
    const off = await waitBreakdown(page, s.event, "off");
    const atOff = await readSheet(page, s.event);
    check(
      `${tag} @1280: a second press turns it off, no layer drawn`,
      off && atOff?.layers.length === 0,
      JSON.stringify({ breakdown: atOff?.breakdown, layers: atOff?.layers }),
    );

    // The swap: a press shows the change, a second the level again.
    const swap = `${sheetSel(s.event)} button[data-swap-value]`;
    const swaps = await page.locator(swap).count();
    if (!flag("swaps")) skip("a value swaps to its change", s.why.swaps);
    else if (check(`${tag} @1280: a value swaps to its change (${swaps})`, swaps > 0)) {
      const read = () =>
        page
          .locator(swap)
          .first()
          .evaluate((el) => ({ face: el.getAttribute("data-swap-value"), text: el.textContent.trim() }))
          .catch(() => null);
      const level = await read();
      await press(page, swap);
      await page
        .waitForFunction((sel) => document.querySelector(sel)?.getAttribute("data-swap-value") === "change", swap, {
          timeout: 5000,
        })
        .catch(() => {});
      const change = await read();
      await press(page, swap);
      await page
        .waitForFunction((sel) => document.querySelector(sel)?.getAttribute("data-swap-value") === "level", swap, {
          timeout: 5000,
        })
        .catch(() => {});
      const back = await read();
      check(
        `${tag} @1280: a press swaps the level for its change, a second press swaps back`,
        level?.face === "level" &&
          change?.face === "change" &&
          change.text !== level.text &&
          back?.face === "level" &&
          back.text === level.text,
        JSON.stringify([level, change, back]),
      );
    }
    check(`${tag} @1280: no page error`, errors.length === 0, errors.join("; "));
    await ctx.close();
  }

  // ── An event with no previous one: its values are plain. Read on its event
  // page: a served Aave page's `?at=` landing does not reach an account's
  // oldest event. ──
  if (s.first && !flag("swaps")) skip("with no previous event the values are plain", s.why.swaps);
  else if (s.first) {
    const { ctx, page } = await open(1280, eventPage(s.first));
    if (check(`${tag} first event, event page: the card draws its sheet`, await waitSheet(page, s.first))) {
      const at = await readSheet(page, s.first);
      check(
        `${tag} first event, event page: with no previous event the values are plain (no swap control)`,
        (at?.swaps ?? 0) > 0 && at.swapButtons === 0,
        `${at?.swaps} values, ${at?.swapButtons} swap controls`,
      );
    }
    await ctx.close();
  }

  // ── 390: the phone column, the asset | USD toggle, no overflow ──
  {
    const { ctx, page } = await open(390, landing(s.event));
    if (check(`${tag} @390: the opened card draws its sheet`, await waitSheet(page, s.event))) {
      const at = await readSheet(page, s.event);
      check(
        `${tag} @390: only phone columns are visible`,
        JSON.stringify(at?.cols) === JSON.stringify(["phone"]),
        JSON.stringify(at?.cols),
      );
      const phone = () =>
        page.$$eval(`${sheetSel(s.event)} [data-sheet-col="phone"]`, (els) => els.map((e) => e.textContent.trim()));
      const pressed = () =>
        page.$$eval(`${sheetSel(s.event)} [data-sheet-column] button`, (els) =>
          els.map((e) => e.getAttribute("aria-pressed")),
        );
      const before = { cells: await phone(), pressed: await pressed() };
      const idle = before.pressed.indexOf("false");
      if (!flag("usd")) skip("the asset | USD toggle changes what the phone column shows", s.why.usd);
      else if (
        check(
          `${tag} @390: the controls row holds the asset | USD group, the switch its place (strip or row)`,
          before.pressed.length === 2 && idle >= 0 && switchPlaced(at),
          JSON.stringify({
            group: before.pressed,
            tabbed: at?.tabbed,
            strip: at?.stripSwitches,
            inSheet: at?.switches,
          }),
        )
      ) {
        await press(page, `${sheetSel(s.event)} [data-sheet-column] button:nth-child(${idle + 1})`);
        await page.waitForTimeout(300);
        const after = { cells: await phone(), pressed: await pressed() };
        check(
          `${tag} @390: the asset | USD toggle changes what the phone column shows`,
          after.pressed[idle] === "true" && after.cells.some((c, i) => c !== before.cells[i]),
          `${before.cells.filter((c, i) => c !== after.cells[i]).length} of ${before.cells.length} cells changed`,
        );
      }
      const width = () => page.evaluate(() => document.documentElement.scrollWidth);
      const offWidth = await width();
      await press(page, switchSel(s.event));
      await waitBreakdown(page, s.event, "on");
      await page.waitForTimeout(300);
      const onWidth = await width();
      check(
        `${tag} @390: scrollWidth is 390 with the breakdown off and on`,
        offWidth === 390 && onWidth === 390,
        `${offWidth} off, ${onWidth} on`,
      );
    }
    await ctx.close();
  }

  // ── The event page: the breakdown always on, no switch ──
  {
    const { ctx, page, errors } = await open(1280, eventPage(s.event));
    if (check(`${tag} event page: the card draws its sheet`, await waitSheet(page, s.event))) {
      const at = await readSheet(page, s.event);
      check(
        `${tag} event page: the breakdown is on, its layers drawn, no data-sheet-switch`,
        at?.breakdown === "on" && layersWanted.every((l) => at.layers.includes(l)) && at.allSwitches === 0,
        JSON.stringify({ breakdown: at?.breakdown, layers: at?.layers, switches: at?.allSwitches }),
      );
    }
    check(`${tag} event page: no page error`, errors.length === 0, errors.join("; "));
    await ctx.close();
  }
}

/** The sheet checks of one family, gated by FAMILIES like the sweep. */
async function verifySheet(name) {
  if (FAMILIES_FILTER && !FAMILIES_FILTER.has(name)) return;
  console.log(`\n── ${name}: the event sheet (ui-jobs 330) ──────────────`);
  for (const s of SHEET_SUBJECTS[name] ?? []) await verifySheetSubject(name, s);
}

/** Every family, run once, with the run retried whole if it THROWS.
 *
 *  A sweep over thirty-one families is about an hour of dev-server work, and a
 *  single page that answers 500 for one navigation ends it — measured
 *  2026-09-20: `spark` died mid-family on one run and passed alone on the next,
 *  three minutes later, on a server `preflight` called healthy throughout. That
 *  is one transient costing a whole sweep, the same shape as the
 *  `/api/vaults/positions` read the vault verifiers used to die on
 *  (scripts/lib/read-positions-route.mjs, TO-DO-ui-jobs §38).
 *
 *  Only a THROW is retried, and only once. A red CHECK is a finding and is
 *  never re-rolled — a retry that could turn a failing assertion green would
 *  be worse than the crash it replaced. The failure count is rewound before
 *  the second attempt so the checks that did run first time are not counted
 *  twice, and the retry SPEAKS, because a sweep that needed one is a different
 *  fact from a sweep that did not. */
async function verifyFamily(name, opts) {
  if (FAMILIES_FILTER && !FAMILIES_FILTER.has(name)) return null;
  const before = failures;
  try {
    return await verifyFamilyOnce(name, opts);
  } catch (e) {
    failures = before;
    console.log(`  \u27f3 ${name} threw — ${String(e?.message ?? e).slice(0, 120)}; one retry`);
    retriedFamilies.push(name);
    return await verifyFamilyOnce(name, opts);
  }
}

async function verifyFamilyOnce(
  name,
  { listingPath, rowHrefRe, skip, subjectHref, eventImage = "dynamic", linkFrom = "menu" },
) {
  if (FAMILIES_FILTER && !FAMILIES_FILTER.has(name)) return null;
  // A family whose route is built but cannot be exercised end to end yet
  // states why here rather than being left out of the table; the run reports
  // it as skipped, never as passed.
  if (skip) {
    console.log(`\nSKIP  ${name} — ${skip}`);
    return null;
  }
  console.log(`\n── ${name} ──────────────────────────────`);

  // A family with NO listing of positions names its subject outright — Yearn's
  // vault layer has a holder lane and no position listing, because a listing
  // needs a whole-`Transfer` census per vault and Yearn has none
  // (TO-DO-infra-and-backend §5.4). A pinned subject that has gone quiet is a
  // FAILURE for a person to re-pin, never a skip: the checks below go red by
  // name rather than being silently dropped.
  // Pick a live subject off the listing rather than hard-coding one. `open`'s
  // own wait covers the common case (no `[data-ctrl-waking]` marker, then a
  // flat 600ms), but a listing with a large roster (asymmetry's 288 troves,
  // priced client-side) can still be mid-render at that point — so this polls
  // a few more times rather than failing the family on a slow first paint.
  let rowHref = subjectHref ?? null;
  if (!rowHref) {
    // Polling covers a listing that is still painting. It does NOT cover a
    // listing that answered 500 — re-reading that document finds the same Next
    // error page however long the loop runs, and the family then failed with
    // `["https://nextjs.org/docs/messages/version-staleness", …]` as its list
    // of candidate rows (measured on `spark`, 2026-09-20; it passed alone
    // minutes later). So the whole document is fetched again, up to three
    // times, and the run says when it took more than one.
    let hrefs = [];
    for (let load = 1; load <= 3; load++) {
      const { ctx: listCtx, page: listPage } = await open(1280, `${BASE}${listingPath}`);
      for (let attempt = 0; attempt < 16; attempt++) {
        hrefs = await listPage.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
        if (hrefs.some((h) => h && rowHrefRe.test(h))) break;
        await listPage.waitForTimeout(500);
      }
      await listCtx.close();
      if (hrefs.some((h) => h && rowHrefRe.test(h))) {
        if (load > 1) {
          console.log(`  \u27f3 ${name}: ${listingPath} answered no row until load ${load} — RELOADED, not clean`);
          retriedFamilies.push(`${name} (listing)`);
        }
        break;
      }
    }
    rowHref = await pickWorkingSubject(hrefs, rowHrefRe);
    if (!check(`${name}: found a live subject on ${listingPath}`, !!rowHref, JSON.stringify(hrefs.slice(0, 5)))) {
      return null;
    }
  }
  console.log(`  subject: ${rowHref}${subjectHref ? " (pinned)" : ""}`);

  // ── Check 1: the position page's copy-link ──────────────────────────
  // The copy-link control is a row of the event menu (EventCardMenu), the ⋮
  // at the foot of the open Explanation, inside the card's detail panel. Getting to it needs TWO clicks: open the card,
  // then open the menu.
  //
  // Two attempts, each in a fresh context: on a live page the first card can
  // re-key under the click when the head replay lands (Liquity V2 failed
  // this check on two of five live runs and passed a four-run repro of the
  // same steps), so one retry separates a flake from a missing control. A
  // failed attempt leaves a screenshot and a state dump so the next flake
  // explains itself instead of being re-run blind.
  //
  // `linkFrom: "pill"` reads the first card's number pill, without opening
  // the card; no family passes it since the timeline's number went plain
  // (ui-jobs 250). The copy-link button is on the event page's side column
  // (`verifyLiquityMarkdown`, ui-jobs 308).
  let posCtx = null;
  let posPage = null;
  let positionPath = null;
  let hasCopyBtn = false;
  for (let attempt = 1; attempt <= 2 && !hasCopyBtn; attempt++) {
    if (posCtx) await posCtx.close();
    ({ ctx: posCtx, page: posPage } = await open(1280, `${BASE}${rowHref}`));
    positionPath = await posPage.evaluate(() => window.location.pathname);
    hasCopyBtn = linkFrom === "pill" ? await firstCardPill(posPage) : await revealFirstCardCopyLink(posPage);
    if (!hasCopyBtn) {
      const state = await firstCardState(posPage);
      await mkdir(SCREENSHOT_DIR, { recursive: true });
      const shot = path.join(SCREENSHOT_DIR, `${name}-check1-attempt${attempt}.png`);
      await posPage.screenshot({ path: shot }).catch(() => {});
      console.log(`  check 1 attempt ${attempt} found no copy-link — ${JSON.stringify(state)} (${shot})`);
    }
  }
  if (
    !check(
      linkFrom === "pill"
        ? `${name}: position page's first card has a number pill linking to the event page`
        : `${name}: position page has an event copy-link control`,
      hasCopyBtn,
    )
  ) {
    await posCtx.close();
    return null;
  }
  // The positive half of check 2's "toolbar absent": the same selector finds
  // the toolbar on the position page, so an absence there is not a selector
  // that matches nothing.
  const posToolbar = await posPage.locator("[data-timeline-total]").count();
  check(`${name}: position page draws the toolbar's count line`, posToolbar > 0, `${posToolbar} found`);
  const idsOnPage = await eventIds(posPage);
  const link =
    linkFrom === "pill"
      ? `${BASE}${await posPage.locator(PILL_LINK).first().getAttribute("href")}`
      : await copyEventLink(posPage);
  const linkUrl = new URL(link);
  check(`${name}: clipboard holds an absolute URL`, link.startsWith(BASE), link);
  const m = linkUrl.pathname.match(/^(.*)\/event\/([^/]+)$/);
  check(`${name}: URL shape is <position path>/event/<id>`, !!m && m[1] === positionPath, linkUrl.pathname);
  const decodedId = m ? decodeURIComponent(m[2]) : null;
  check(
    `${name}: decoded id is in the page's data-event-id set`,
    !!decodedId && idsOnPage.includes(decodedId),
    decodedId,
  );
  await posCtx.close();
  if (!decodedId) return null;

  // ── Check 2 + 6: the pinned page, at 1280px and 390px ────────────────
  const pinned2 = await verifyPinnedPage(name, link, decodedId, positionPath, 1280);
  await pinned2.ctx.close();
  const pinned6 = await verifyPinnedPage(name, link, decodedId, positionPath, 390);
  await pinned6.ctx.close();

  // ── Check 3: the immutable image, found vs fallback ──────────────────
  // A route that carries no `opengraph-image.tsx` at all is checked for what
  // it DOES advertise instead: its explorer's static roster card. Yearn's
  // vault event route is the one such route — its family keeps no stored
  // history, so there is nothing an image route could read without running
  // the page's own log sweeps (lib/vaults/event-share-card.ts). Asserting the
  // static card here is what stops that absence from becoming an unfurl with
  // no card at all, which is what a `"dynamic"` metadata on an imageless route
  // produces.
  const { ctx: imgCtx, page: imgPage } = await open(1280, link);
  const ogUrl = await ogImageUrl(imgPage);
  check(`${name}: og:image meta present`, !!ogUrl, ogUrl);
  if (ogUrl && eventImage === "explorer") {
    check(
      `${name}: the event route advertises its explorer's static card`,
      /\/og\/explore-[a-z0-9-]+\.png$/.test(new URL(ogUrl, BASE).pathname),
      ogUrl,
    );
  } else if (ogUrl) {
    const abs = ogUrl.startsWith("http") ? ogUrl : `${BASE}${ogUrl}`;
    const found = await fetchImage(abs);
    check(`${name}: found image 200`, found.status === 200, String(found.status));
    check(`${name}: found image is image/png`, found.contentType.includes("image/png"), found.contentType);
    check(
      `${name}: found image cache-control is immutable`,
      found.cacheControl.includes("immutable"),
      found.cacheControl,
    );
    await mkdir(SCREENSHOT_DIR, { recursive: true });
    await writeFile(path.join(SCREENSHOT_DIR, `${name}-event-og.png`), found.bytes);
  }
  await imgCtx.close();

  const fakeEventPath = `${positionPath}/event/${encodeURIComponent(FAKE_ID)}`;
  const { ctx: fakeImgCtx, page: fakeImgPage } = await open(1280, `${BASE}${fakeEventPath}`);
  const fakeOgUrl = await ogImageUrl(fakeImgPage);
  await fakeImgCtx.close();
  // An imageless route advertises the same static card whatever the id, so
  // "found vs fallback" is not a distinction it can draw.
  if (eventImage === "explorer") {
    check(`${name}: fabricated-id page carries the same static card`, !!fakeOgUrl && fakeOgUrl === ogUrl, fakeOgUrl);
  } else if (check(`${name}: fabricated-id page also carries an og:image`, !!fakeOgUrl, fakeOgUrl)) {
    const abs = fakeOgUrl.startsWith("http") ? fakeOgUrl : `${BASE}${fakeOgUrl}`;
    const fallback = await fetchImage(abs);
    check(`${name}: fallback image 200`, fallback.status === 200, String(fallback.status));
    check(`${name}: fallback image is image/png`, fallback.contentType.includes("image/png"), fallback.contentType);
    check(
      `${name}: fallback image cache-control is NOT immutable`,
      !fallback.cacheControl.includes("immutable"),
      fallback.cacheControl,
    );
  }

  // ── Check 4: following "View in timeline" ────────────────────────────
  const { ctx: viewCtx, page: viewPage } = await open(1280, link);
  // A heavier family's own chain-state reads (Aave V4's spoke health factor,
  // fetched independently of the seeded tail) can still be settling once
  // `open()`'s own wait returns — the link is already in the DOM by then,
  // but layout is still shifting under it, and Playwright's actionability
  // check treats that as "not stable". Waiting for it to exist, then giving
  // the click itself a longer budget than Playwright's 30s default, is
  // slower on the fast path and correct on the slow one.
  // A throw here (the link never settling, a navigation that hangs) is this
  // check's failure, not the run's — record it and move on to the next
  // family rather than taking the whole table down with an uncaught error.
  const followed = await viewPage
    .waitForSelector(IN_TIMELINE, { timeout: 60000 })
    .then(() => viewPage.click(IN_TIMELINE, { timeout: 60000 }))
    .then(() => viewPage.waitForLoadState("domcontentloaded"))
    .then(() => null)
    .catch((e) => String(e).split("\n")[0]);
  if (!check(`${name}: "View in timeline" could be followed`, followed === null, followed ?? "")) {
    await viewCtx.close();
    return null;
  }
  await viewPage
    .waitForFunction(() => !document.querySelector("[data-ctrl-waking]"), null, { timeout: 120000 })
    .catch(() => {});
  // A flat wait here used to be enough, but the harder-to-collapse contexts
  // this script now opens with (see `open`'s own note) can hold thousands of
  // individually-rendered rows before the landing effect finds its target —
  // slower to paint than a few dozen collapsed runs, so poll instead of
  // guessing a fixed budget.
  await viewPage
    .waitForFunction(() => !window.location.search.includes("at="), null, { timeout: 20000 })
    .catch(() => {});
  const search = await viewPage.evaluate(() => window.location.search);
  check(`${name}: "at" dropped from location.search after landing`, !search.includes("at="), search);
  const { inView, box } = await waitForCardInViewport(viewPage, decodedId);
  check(`${name}: landed card's box intersects the viewport`, inView, JSON.stringify(box));
  const landedPanel = viewPage.locator(`[data-event-id="${decodedId}"] .rounded-b-xl.bg-raised`);
  await landedPanel
    .first()
    .waitFor({ state: "attached", timeout: 5000 })
    .catch(() => {});
  const landedOpen = await landedPanel.count();
  check(`${name}: landed card's detail panel is open`, landedOpen > 0);
  await viewCtx.close();

  // ── Check 5: a fabricated id renders the notice, no card, no error ───
  const { ctx: nfCtx, page: nfPage, errors: nfErrors } = await open(1280, `${BASE}${fakeEventPath}`);
  // The notice is drawn once the history is in and the id is known to be
  // absent, so this waits for the notice rather than for 400 ms — the same
  // reason `verifyPinnedPage` waits for its card. A page that never draws it
  // still fails, 60 s later, on the assertion below.
  const NOTICE = /isn.t among the events Rails has served for this position/;
  await nfPage
    .getByText(NOTICE)
    .first()
    .waitFor({ state: "attached", timeout: 60000 })
    .catch(() => {});
  const nfIds = await eventIds(nfPage);
  check(`${name}: fabricated id renders no card`, nfIds.length === 0, JSON.stringify(nfIds));
  const noticeText = await nfPage.locator("body").innerText();
  check(`${name}: fabricated id shows the not-found notice`, NOTICE.test(noticeText));
  check(`${name}: fabricated id raised no page error`, nfErrors.length === 0, nfErrors.join("; "));
  await nfCtx.close();

  // Handed back so a family's OWN block can go on asking about the same
  // subject without a second listing probe.
  return { positionPath, decodedId, link };
}

// ══════════════════════════════════════════════════════════════════════════
// SERVED FOLDERS — the same history as ROWS (`?folders=1`)
// ══════════════════════════════════════════════════════════════════════════
//
// Decision 0019's evening amendment: repetitive stretches arrive as FOLDERS
// carrying their members' aggregate, ungrouped events arrive as themselves,
// the cut counts rows, and opening a folder fetches its members. Two families
// can be served that way — SparkLend and Aave V3, whose index carries each
// event's own running state.
//
// ⚠️ THIS SECTION SKIPS WHERE THE BACKEND CANNOT ANSWER `?group=1`, AND SAYS
// SO. A skip is not a pass. The grouping lives in rails-server
// (`services/timeline-folders.ts`); until that is deployed behind whatever
// BASE points at, every check below is UNRUN and the run states it.
//
// Grouping is ON in every context here, and deliberately: this is the path
// where a `?at=` landing into a collapsed stretch actually resolves, because
// the folder route answers by EVENT KEY — a chain coordinate. The flat-path
// contexts above still flatten runs (`collapseRuns: false`), because that
// landing gap is closed only on the served path and only two families are on
// it; this section is what proves the closure.
//
// The checks, numbered as the plan numbers them: 1 a folder renders from the
// wire; 2 numbering stays literal across it; 3 a permalink lands inside one
// and no folder id reaches the URL or localStorage; 4 the header's Σ agrees
// with the members the folder route returns; 5 a failed members read states
// itself and the expanded area is never empty; 8 the boundary card survives
// where the grouped history still exceeds the cut.

/** One family's grouped answer, straight off the app's own proxy. NULL means
 *  the backend cannot answer `?group=1`, which is the skip signal. */
async function groupedAnswer(apiPath, params) {
  const qs = new URLSearchParams({ ...params, group: "1" });
  const res = await fetch(`${BASE}${apiPath}?${qs.toString()}`).catch(() => null);
  if (!res || !res.ok) return null;
  const json = await res.json().catch(() => null);
  if (!json || !Array.isArray(json.rowPlan)) return null;
  return json;
}

/** How many listing rows to try before giving up on finding one that groups.
 *  A listing's head is ordered by recency, not by churn, so the position this
 *  feature exists for is not reliably near the top. */
const FOLDER_SUBJECT_TRIES = 8;

/** THE PAGE PAINTS A PREFIX, so nothing below the first render window is in
 *  the DOM to assert about — not a folder further down the list, and not the
 *  boundary card, which is the very last element. Both of the checks that
 *  looked for those were reading an unexhausted window and calling it absent.
 *  The helper is `scripts/lib/timeline-draw.mjs` now, one copy for every
 *  verifier that censuses rows. */

/** Every folder on a grouped answer, in served (ascending) order. */
const foldersOf = (answer) => answer.rowPlan.filter((r) => r.kind === "folder").map((r) => r.folder);

/** Scale a base-unit decimal string — the page's own `scaleBaseUnits`, needed
 *  here so this script's arithmetic is its own rather than the page's. BigInt
 *  down to the divide, so a 30-digit Σ does not lose its low digits to a
 *  float first. */
function scaleBaseUnits(raw, decimals) {
  if (decimals == null) return null;
  let v;
  try {
    v = BigInt(raw);
  } catch {
    return null;
  }
  if (v === 0n) return 0;
  if (decimals <= 0) return Number(v);
  const d = BigInt("1" + "0".repeat(decimals));
  return Number(v / d) + Number(v % d) / Number(d);
}

async function verifyServedFolders(name, { listingPath, rowHrefRe, apiPath, paramsFromPath }) {
  if (FAMILIES_FILTER && !FAMILIES_FILTER.has(name)) return;
  console.log(`\n── ${name} ──────────────────────────────`);

  const { ctx: listCtx, page: listPage } = await open(1280, `${BASE}${listingPath}`);
  let hrefs = [];
  for (let attempt = 0; attempt < 16; attempt++) {
    hrefs = await listPage.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
    if (hrefs.some((h) => h && rowHrefRe.test(h))) break;
    await listPage.waitForTimeout(500);
  }
  await listCtx.close();
  const candidates = [...new Set(hrefs.filter((h) => h && rowHrefRe.test(h)))];
  if (!check(`${name}: found a live subject on ${listingPath}`, candidates.length > 0, `${candidates.length} rows`))
    return;

  // MOST POSITIONS HAVE NOTHING TO GROUP, so the subject cannot be "the first
  // row of the listing". A folder needs five or more consecutive
  // transactions of liquidations or transfers, and an ordinary position simply does not have
  // one — measured 2026-09-11 on the first Spark row, 1,403 events and zero
  // folders, which is the correct answer for that wallet and tells us nothing
  // about the feature. So walk the listing until a subject actually groups,
  // and if none of them do, say that rather than failing: "no folder on the
  // rows we looked at" is a fixture fact, not a defect. The checks below need
  // a folder to have something to assert about.
  let rowHref = null;
  let answer = null;
  let served = false;
  for (const href of candidates.slice(0, FOLDER_SUBJECT_TRIES)) {
    const got = await groupedAnswer(apiPath, paramsFromPath(href));
    if (!got) break; // the route does not group at all — reported below
    served = true;
    if (foldersOf(got).length > 0) {
      rowHref = href;
      answer = got;
      break;
    }
  }
  if (!served) {
    console.log(
      `SKIP  ${name} — ${BASE}${apiPath} does not answer ?group=1. The grouping is rails-server's\n` +
        "      (services/timeline-folders.ts) and is not deployed behind this BASE, so checks 1-5\n" +
        "      and 8 are UNRUN. This is not a pass.",
    );
    return;
  }
  if (!answer) {
    console.log(
      `SKIP  ${name} — the route groups, but none of the first ${FOLDER_SUBJECT_TRIES} positions on\n` +
        `      ${listingPath} holds a stretch long enough to group, so there is no folder to assert\n` +
        "      about. Checks 1-5 and 8 are UNRUN. This is not a pass — re-run against a listing\n" +
        "      whose head has a churned position, or pin one.",
    );
    return;
  }
  const params = paramsFromPath(rowHref);
  const folders = foldersOf(answer);
  check(
    `${name}: the grouped answer carries at least one folder`,
    folders.length > 0,
    `${folders.length} on ${rowHref}`,
  );

  // ── 4: the header's Σ against the members, computed here ───────────────
  // Independent arithmetic — the folder route's own rows, counted by this
  // script, against what the header states. This is the check that would
  // catch a lost double-count guard on a family that has one.
  //
  // The NEWEST folder. The row plan runs oldest first, so `folders[0]` sits
  // on the window's floor, and on a live wallet two events at the head move
  // the floor above its first member: checks 3 and 3b then asked by a key the
  // route rightly called BELOW_THE_WINDOW (aave-v3-folders on
  // 0x37e7e93093ae3a8aaef4a0d41dbd9c037508eb60, 95,105 → 95,107 events
  // between the reads, 2026-09-21).
  const target = folders[folders.length - 1];
  const memberQs = new URLSearchParams({ ...params, folder: target.responseId ?? target.id });
  const members = await fetch(`${BASE}${apiPath}/folder?${memberQs.toString()}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  if (check(`${name}: the folder route answers its own id`, !!members && Array.isArray(members.events))) {
    check(
      `${name}: the members answer is exactly the header's count`,
      members.events.length === target.count,
      `${members.events.length} vs ${target.count}`,
    );
    check(
      `${name}: the header's parts sum to its count`,
      target.counts.reduce((n, c) => n + c.count, 0) + target.other === target.count,
      JSON.stringify({ counts: target.counts, other: target.other, count: target.count }),
    );
    for (const leg of target.legs) {
      check(
        `${name}: leg "${leg.verb} ${leg.symbol}" states a scalable Σ over its own members`,
        scaleBaseUnits(leg.amount, leg.decimals) != null && leg.count > 0 && leg.count <= target.count,
        `${leg.amount} @${leg.decimals} × ${leg.count} of ${target.count}`,
      );
    }
  }

  // ── 1 + 2 + 8: the page itself, with `?folders=1` ──────────────────────
  const pageUrl = `${BASE}${rowHref}${rowHref.includes("?") ? "&" : "?"}folders=1`;
  const { ctx, page } = await open(1280, pageUrl, { flattenRuns: false });
  await page.waitForSelector("[data-event-id]", { timeout: 60000 }).catch(() => {});
  const presses = await exhaustPaging(page);
  const folderRows = await page.locator(GROUP_FRAME).count();
  check(`${name}: at least one folder row drew (1)`, folderRows > 0, `${folderRows}, ${presses} presses`);
  // THE COUNT LINE HAS TWO SHAPES AND ONLY ONE OF THEM IS THE SETTLED PAGE.
  // Until the position's lifetime figures land the line states what is listed
  // and no ratio — "Showing 1,004 listed" — and the assertions below then read
  // a page mid-settle as a page that grouped nothing. Wait for the page's own
  // marker, and where it never settles say THAT rather than reporting the
  // prose it was left with (§38; it was read as a defect for a day).
  const settled = await waitForCountSettled(page, { timeout: 45000 });
  const bodyText = await page.locator("body").innerText();
  // ⚠️ READ THE LINE OFF ITS OWN ELEMENT, not by scanning the body for a line
  // that starts with "Showing". Decision 0019's amendment of 2026-09-24 took
  // the cap off the reader's face and the settled line now OPENS with the
  // life's total ("7,161 events · loaded 20 Jan 2025 to 24 Sept 2026"), so
  // from that day the scan found nothing, check 1 fell to the "no count line"
  // branch and printed a note instead of judging, and check 2's total quietly
  // reverted to the answer fetched moments earlier — the drift this file was
  // corrected for on 2026-09-11 (TO-DO-ui-jobs §58).
  const countLine = (await countLineText(page)) ?? "";
  const counts = parseCountLine(countLine);
  if (settled === "pending") {
    console.log(
      `SKIP  ${name} — the count line never left "pending" inside 45 s: the position's lifetime\n` +
        `      figures had not arrived, so the line reads "${countLine}" and the two checks that\n` +
        "      read it (1's count line, 2's total) would be judging a page mid-settle. UNRUN, not\n" +
        "      a pass — re-run this family alone; the dev server compiles on demand under a batch.\n" +
        "      Checks 3, 5 and 8 below do not read the line and run as normal.",
    );
  }
  // WHAT THE LINE STATES NOW (decision 0019 §3, amended 2026-09-24): the
  // life's total, literally, and the span the loaded rows cover — never the
  // grain of the cut, which "Showing N rows of M events" used to name and
  // which rule 2 forbids ("never stated to the reader as a number"). So the
  // rows/events distinction has left the line, and what is left to hold is
  // that the total on the page IS the position's. A page served whole with
  // nothing cut states the total alone and no span, which is the same check
  // with one fewer clause.
  if (settled === "pending") {
    // handled above — the line is the mid-settle one and states no total
  } else if (countLine) {
    check(
      `${name}: the count line states a lifetime total and names no cap (1)`,
      counts != null && counts.total != null && !NAMES_THE_CAP.test(bodyText),
      `"${countLine}"${counts == null ? " — matched no form the toolbar writes" : ""}` +
        `${counts?.span ? `, span ${counts.span}` : ""}` +
        `${NAMES_THE_CAP.test(bodyText) ? `; the page names the cap: "${NAMES_THE_CAP.exec(bodyText)?.[0]}"` : ""}`,
    );
  } else {
    check(`${name}: the count line is on the page at all (1)`, false, "no count line element");
  }

  // 2 — numbering runs over the WHOLE history and closes at the top: the
  // newest row's own number is the position's total.
  //
  // READ THE TOTAL OFF THE PAGE, not off the answer fetched moments earlier.
  // These are live positions: the first Spark subject gained four events
  // between the two reads on 2026-09-11, and the check failed on the drift
  // rather than on anything about numbering. The page's own count line is the
  // total that the page's own numbering must close against.
  if (settled !== "pending") {
    const totalOnPage = counts?.total ?? NaN;
    const total = Number.isFinite(totalOnPage) && totalOnPage > 0 ? totalOnPage : answer.totalEvents;
    check(
      `${name}: the newest row is numbered the position's total (2)`,
      bodyText.includes(total.toLocaleString("en-US")),
      `${total}${total !== answer.totalEvents ? ` (answer said ${answer.totalEvents}; the position moved)` : ""}`,
    );
  }

  // ── 3: a permalink lands INSIDE a folder, by event key ─────────────────
  const memberId = members?.events?.[0]?.id;
  if (memberId) {
    const positionPath = await page.evaluate(() => window.location.pathname);
    const { ctx: landCtx, page: landPage } = await open(
      1280,
      `${BASE}${positionPath}?at=${encodeURIComponent(memberId)}&folders=1`,
      { flattenRuns: false },
    );
    await landPage.waitForSelector(`[data-event-id="${memberId}"]`, { timeout: 60000 }).catch(() => {});
    check(
      `${name}: ?at= landed on a member inside a folder (3)`,
      (await landPage.locator(`[data-event-id="${memberId}"]`).count()) > 0,
    );
    const search = await landPage.evaluate(() => window.location.search);
    check(`${name}: ?at= was dropped once applied (3)`, !search.includes("at="), search);
    // The folder id is response-scoped: it must never reach a URL, storage or
    // a share href.
    const leaked = await landPage.evaluate((id) => {
      const values = [window.location.href];
      try {
        for (let i = 0; i < localStorage.length; i += 1) values.push(localStorage.getItem(localStorage.key(i)) ?? "");
      } catch {}
      return values.some((v) => v.includes(id));
    }, target.responseId ?? target.id);
    check(`${name}: no folder id in the URL or in localStorage (3)`, !leaked);
    await landCtx.close();

    // ── 3b: the same member's own event page draws its card ─────────────
    // Pinned mode read the served events only, so a folder member's
    // `/event/<id>` said "not found" (TO-DO-ui-jobs §11). It now asks the
    // folder route by event key, as the landing above does. Waits for the
    // card OR the notice, since either is the page's answer.
    const subject = new URLSearchParams(await page.evaluate(() => window.location.search));
    subject.delete("folders");
    subject.delete("at");
    const q = subject.toString();
    const eventUrl = `${BASE}${positionPath}/event/${encodeURIComponent(memberId)}${q ? `?${q}` : ""}`;
    const { ctx: pinCtx, page: pinPage } = await open(1280, eventUrl);
    await pinPage
      .waitForFunction(
        () =>
          document.querySelector("[data-event-id]") != null ||
          /isn.t among the events Rails has served/.test(document.body.innerText),
        null,
        { timeout: 90000 },
      )
      .catch(() => {});
    const pinnedIds = await eventIds(pinPage);
    check(
      `${name}: a folder member's own event page draws its card (3b)`,
      pinnedIds.length === 1 && pinnedIds[0] === memberId,
      `${JSON.stringify(pinnedIds)} for ${memberId}`,
    );
    await pinCtx.close();
  }

  // ── 5: a failed members read states itself ─────────────────────────────
  // Failed outright rather than throttled: the promise the card makes is that
  // the expanded area is never empty, and a 500 is the shortest road to
  // testing it.
  const failCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const failPage = await failCtx.newPage();
  await failPage.route("**/timeline/folder**", (route) => route.fulfill({ status: 500, body: "{}" }));
  await failPage.goto(pageUrl, NAV);
  await failPage.waitForSelector("[data-event-id]", { timeout: 60000 }).catch(() => {});
  // The folder may be below the first render window here too.
  await exhaustPaging(failPage);
  // A folder is a group frame since ui-jobs 250; its ⋮ opens the members.
  await failPage.waitForSelector(CLOSED_GROUP, { timeout: 60000 }).catch(() => {});
  await openGroup(failPage, failPage.locator(CLOSED_GROUP).first()).catch(() => {});
  await failPage.waitForTimeout(2000);
  check(
    `${name}: a failed members read states itself (5)`,
    (await failPage.locator("body").innerText()).includes("could not be loaded"),
  );
  await failCtx.close();

  // ── 8: the boundary card survives where the cut still binds ────────────
  // Asserted only where the answer says it WAS cut, so a position that now
  // reads whole under grouping is not failed for reading whole.
  if (answer.boundBy) {
    // ROT, found 2026-09-12: this read `/earlier events/` off the body, and
    // that copy was retired on 2026-09-11 (web `a7f84598` — "the boundary can
    // speak in the spine alone"). Where the node TERMINATES A DRAWN LIST it is
    // now a bare spine glyph carrying no text; the card survives only where
    // there are no rows at all. The check had been red on BOTH arms since that
    // commit, grouped and flat alike, which is why it is not a leg B
    // regression. The boundary is a node, so the check is the node.
    const cutNodes = await page.locator('[data-boundary-row="cut"]').count();
    check(
      `${name}: a cut grouped answer still draws the boundary node (8)`,
      cutNodes === 1,
      `${cutNodes} node(s) · boundBy ${answer.boundBy}`,
    );
  } else {
    console.log(`      (${name}: reads whole under grouping — no boundary card is the correct answer)`);
  }
  await ctx.close();
}

await verifyServedFolders("spark-folders", {
  listingPath: "/ethereum/spark",
  rowHrefRe: /^\/ethereum\/spark\/0x[0-9a-fA-F]{40}/,
  apiPath: "/api/spark/timeline",
  paramsFromPath: (href) => ({ wallet: href.split("?")[0].split("/")[3] }),
});
await verifyServedFolders("aave-v3-folders", {
  listingPath: "/ethereum/aave-v3",
  rowHrefRe: /^\/ethereum\/aave-v3\/0x[0-9a-fA-F]{40}/,
  apiPath: "/api/aave-v3/timeline",
  paramsFromPath: (href) => {
    const [pathPart, query = ""] = href.split("?");
    const market = new URLSearchParams(query).get("market");
    const wallet = pathPart.split("/")[3];
    return market ? { wallet, market } : { wallet };
  },
});

await verifyFamily("aave-v3", {
  listingPath: "/ethereum/aave-v3",
  rowHrefRe: /^\/ethereum\/aave-v3\/0x[0-9a-fA-F]{40}/,
});
await verifySheet("aave-v3");
await verifyFamily("spark", {
  listingPath: "/ethereum/spark",
  rowHrefRe: /^\/ethereum\/spark\/0x[0-9a-fA-F]{40}/,
});
await verifySheet("spark");
const liquityV2Subject = await verifyFamily("liquity-v2", {
  listingPath: "/ethereum/liquity-v2",
  rowHrefRe: /^\/ethereum\/liquity-v2\/trove\//,
  // The timeline's number is plain since ui-jobs 250 (`e427ee5`); the event
  // page opens from the row's ⋮, as on every family.
});
await verifyLiquityMarkdown(liquityV2Subject);
await verifySheet("liquity-v2");

/** Liquity V2's raw Markdown per event (ui-jobs 287): `<event page>.md`
 *  answers 200 `text/markdown`, `noindex`, the page as its canonical `Link`,
 *  and the body Copy for LLM puts on the clipboard; an unknown id answers 404.
 *  The event page's actions row (ui-jobs 291, 294) holds View in timeline,
 *  Etherscan, View as Markdown (a new tab, at the route), Copy link, Copy
 *  transaction hash and Copy for LLM; the facts table has the Transaction
 *  row; the page and the timeline card draw no ⋮, and each one's number pill
 *  links to the other. With Display's "Transaction hashes" on (ui-jobs 294)
 *  the timeline card's pill reads the short hash, its aria-label the number,
 *  and the event page's pill still reads the number. Neither the card's nor
 *  the page's Explanation row carries the hash. For the event the family's
 *  checks above read. */
async function verifyLiquityMarkdown(subject) {
  if (!subject) return;
  const name = "liquity-v2";
  const { positionPath, decodedId, link } = subject;
  const pagePath = new URL(link).pathname;
  const mdPath = `${pagePath}.md`;
  const res = await fetch(`${BASE}${mdPath}`);
  const body = await res.text();
  check(`${name}: ${mdPath.slice(-24)} answers 200`, res.status === 200, String(res.status));
  check(
    `${name}: Markdown route's content type is text/markdown; charset=utf-8`,
    (res.headers.get("content-type") ?? "") === "text/markdown; charset=utf-8",
    res.headers.get("content-type") ?? "",
  );
  check(
    `${name}: Markdown route says X-Robots-Tag: noindex`,
    (res.headers.get("x-robots-tag") ?? "") === "noindex",
    res.headers.get("x-robots-tag") ?? "",
  );
  check(
    `${name}: Markdown route's Link names the event page as canonical`,
    (res.headers.get("link") ?? "") === `<${BASE}${pagePath}>; rel="canonical"`,
    res.headers.get("link") ?? "",
  );
  check(`${name}: Markdown body opens with the context header`, body.startsWith("# Liquity V2 · "), body.slice(0, 60));
  const fake = await fetch(`${BASE}${positionPath}/event/${encodeURIComponent(FAKE_ID)}.md`);
  check(`${name}: an unknown event's Markdown answers 404`, fake.status === 404, String(fake.status));

  // The event page's actions row under the side column's title (ui-jobs
  // 291): the links, then the copy buttons.
  const ACTIONS = "[data-event-page-actions]";
  const COPY_LLM = `${ACTIONS} [data-menu-item="copy-for-llm"]`;
  const COPY_LINK_BTN = `${ACTIONS} [data-menu-item="copy-link"]`;
  const VIEW_MD = `${ACTIONS} [data-menu-item="view-markdown"]`;
  const COPY_HASH = `${ACTIONS} [data-menu-item="copy-tx-hash"]`;
  const WANT = ["view-timeline", "view-explorer", "view-markdown", "copy-link", "copy-tx-hash", "copy-for-llm"];
  const TX_ID = /^(0x[0-9a-f]{64})/i.exec(decodedId)?.[1]?.toLowerCase() ?? null;
  {
    const { ctx, page, errors } = await open(1280, link);
    await page
      .locator(COPY_LLM)
      .first()
      .waitFor({ state: "attached", timeout: 120000 })
      .catch(() => {});
    const items = await page.$$eval(`${ACTIONS} [data-menu-item]`, (els) =>
      els.map((e) => e.getAttribute("data-menu-item")),
    );
    check(
      `${name} event page: the actions row holds the six items in order`,
      JSON.stringify(items) === JSON.stringify(WANT),
      JSON.stringify(items),
    );
    const asideLinks = await page.locator('[data-event-page-side] a:has-text("View in timeline")').count();
    check(`${name} event page: the aside has one View in timeline link`, asideLinks === 1, `${asideLinks} found`);
    const timelineHref = await page.locator(`${ACTIONS} [data-menu-item="view-timeline"]`).getAttribute("href");
    check(
      `${name} event page: View in timeline links to the ?at= landing`,
      timelineHref === `${positionPath}?at=${encodeURIComponent(decodedId)}`,
      timelineHref ?? "",
    );
    const row = page.locator(VIEW_MD).first();
    const href = await row.getAttribute("href").catch(() => null);
    const target = await row.getAttribute("target").catch(() => null);
    check(`${name} event page: View as Markdown links to the route`, href === mdPath, href ?? "");
    check(`${name} event page: View as Markdown opens a new tab`, target === "_blank", target ?? "");
    // The card's ⋮ in T1 carries the event's Inspect provenance alone.
    const menus = await page.locator("[data-event-menu]").count();
    check(`${name} event page: one event menu`, menus === 1, `${menus} found`);
    const pillHref = await page
      .locator('[data-event-number-link="timeline"]')
      .first()
      .getAttribute("href")
      .catch(() => null);
    check(
      `${name} event page: the number pill links to the timeline`,
      pillHref === `${positionPath}?at=${encodeURIComponent(decodedId)}`,
      pillHref ?? "none",
    );
    // Hydration: the buttons are in the server's HTML; a click before React
    // attaches is lost, so the copy is pressed until it confirms.
    let copiedLink = null;
    for (let i = 0; i < 20 && copiedLink == null; i++) {
      copiedLink = await page
        .click(COPY_LINK_BTN, { timeout: 5000 })
        .then(() => page.waitForSelector(`${COPY_LINK_BTN}[data-copied]`, { timeout: 1500 }))
        .then(() => page.evaluate(() => navigator.clipboard.readText()))
        .catch(() => null);
    }
    check(`${name} event page: Copy link copies the page's URL`, copiedLink === link, copiedLink ?? "no copy");
    const copiedHash = await page
      .click(COPY_HASH, { timeout: 5000 })
      .then(() => page.waitForSelector(`${COPY_HASH}[data-copied]`, { timeout: 1500 }))
      .then(() => page.evaluate(() => navigator.clipboard.readText()))
      .catch(() => null);
    check(
      `${name} event page: Copy transaction hash copies the event's hash`,
      !!copiedHash && /^0x[0-9a-f]{64}$/i.test(copiedHash) && (!TX_ID || copiedHash.toLowerCase() === TX_ID),
      copiedHash ?? "no copy",
    );
    const factHash = await page
      .locator("[data-event-page-facts] [data-tx-hash]")
      .first()
      .evaluate((el) => ({
        text: el.textContent,
        title: el.getAttribute("title"),
        th: el.closest("tr")?.querySelector("th")?.textContent,
      }))
      .catch(() => null);
    check(
      `${name} event page: the facts table's Transaction row holds the full hash`,
      !!factHash &&
        factHash.th === "Transaction" &&
        /^0x[0-9a-f]{64}$/i.test(factHash.text ?? "") &&
        factHash.title === factHash.text,
      JSON.stringify(factHash),
    );
    // The event page stands the explanation (T3) open above the sheet.
    const pageT3 = await page.locator('[data-anatomy="T3"]').count();
    const pageT3Hash = await page.locator('[data-anatomy="T3"] [data-tx-hash]').count();
    check(
      `${name} event page: the explanation stands open and carries no hash`,
      pageT3 > 0 && pageT3Hash === 0,
      `${pageT3} T3, ${pageT3Hash} hash found`,
    );
    const copied = await page
      .click(COPY_LLM, { timeout: 10000 })
      .then(() => page.waitForSelector(`${COPY_LLM}[data-copied]`, { timeout: 20000 }))
      .then(() => page.evaluate(() => navigator.clipboard.readText()))
      .catch(() => null);
    check(
      `${name} event page: Copy for LLM copies the route's body`,
      copied === body,
      copied == null ? "no copy" : `${copied.length} vs ${body.length} characters`,
    );
    check(`${name} event page: no page error`, errors.length === 0, errors.join("; "));
    await ctx.close();
  }
  {
    // The timeline card: the Display menu offers Transaction hashes.
    const { ctx, page, errors } = await open(1280, `${BASE}${positionPath}?at=${encodeURIComponent(decodedId)}`);
    const card = page.locator(`[data-event-id="${decodedId}"]`).first();
    await card.waitFor({ timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(1500);
    check(`${name} timeline card: no page error`, errors.length === 0, errors.join("; "));

    const trigger = page.locator('button[aria-label="Display"][title="Choose what each timeline row shows"]').first();
    await trigger.click().catch(() => {});
    const item = page.locator("button.overlay-item", { hasText: /^Transaction hashes$/i }).first();
    const offered = await item
      .waitFor({ state: "visible", timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    check(`${name} timeline: the Display menu offers Transaction hashes`, offered);
    if (offered) {
      const wasOn = (await item.locator(".bg-rb-500").count()) > 0;
      check(`${name} timeline: Transaction hashes is off by default`, !wasOn);
      if (!wasOn) await item.click();
      await trigger.click().catch(() => {});
      await page.waitForTimeout(300);
      // The opened card's Explanation tab (ui-jobs 370), its default.
      await showCardTab(card, "explanation");
      const t3 = await card.locator('[data-anatomy="T3"]').count();
      const t3Hash = await page.locator('[data-anatomy="T3"] [data-tx-hash]').count();
      check(
        `${name} timeline: the opened card's Explanation tab carries no hash`,
        t3 > 0 && t3Hash === 0,
        `${t3} T3 on the card, ${t3Hash} hash found`,
      );
    }
    await ctx.close();
  }
  {
    // The event page's pill reads the number with Transaction hashes on.
    const { ctx, page } = await open(1280, link);
    // Runs after `open`'s init script, which rewrites the key on every load.
    await ctx.addInitScript(() => {
      try {
        const k = "timeline-display-v3";
        const cur = JSON.parse(localStorage.getItem(k) ?? "{}");
        localStorage.setItem(k, JSON.stringify({ ...cur, showTxHashes: true }));
      } catch {}
    });
    await page.reload(NAV);
    const pill = page.locator('[data-event-number-link="timeline"]').first();
    await pill.waitFor({ timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(1000);
    const read = await pill
      .evaluate((el) => ({ text: el.textContent, n: el.getAttribute("data-event-number") }))
      .catch(() => null);
    check(
      `${name} event page: with Transaction hashes on, the pill reads the number`,
      !!read && read.text === read.n,
      JSON.stringify(read),
    );
    await ctx.close();
  }
}

// ── sweep batch a ────────────────────────────────────────────────────────
await verifyFamily("compound-v3", {
  listingPath: "/ethereum/compound-v3",
  rowHrefRe: /^\/ethereum\/compound-v3\/[^/]+\/0x[0-9a-fA-F]{40}/,
});
await verifySheet("compound-v3");
await verifyFamily("compound-v2", {
  listingPath: "/ethereum/compound-v2",
  rowHrefRe: /^\/ethereum\/compound-v2\/0x[0-9a-fA-F]{40}/,
});
await verifySheet("compound-v2");
await verifyFamily("moonwell", {
  listingPath: "/ethereum/moonwell",
  rowHrefRe: /^\/ethereum\/moonwell\/0x[0-9a-fA-F]{40}/,
});
await verifySheet("moonwell");
await verifyFamily("maple", {
  listingPath: "/ethereum/maple",
  rowHrefRe: /^\/ethereum\/maple\/0x[0-9a-fA-F]{40}/,
});
await verifySheet("maple");
await verifyFamily("makerdao", {
  listingPath: "/ethereum/makerdao",
  rowHrefRe: /^\/ethereum\/makerdao\/(\d+|0x[0-9a-fA-F]{40})$/,
});
await verifySheet("makerdao");
await verifyFamily("fluid", {
  listingPath: "/ethereum/fluid",
  rowHrefRe: /^\/ethereum\/fluid\/\d+$/,
});
await verifySheet("fluid");
await verifyFamily("frankencoin", {
  listingPath: "/ethereum/frankencoin",
  rowHrefRe: /^\/ethereum\/frankencoin\/0x[0-9a-fA-F]{40}/,
});
await verifySheet("frankencoin");

// ── sweep batch b ──
await verifyFamily("fx", {
  listingPath: "/ethereum/fx",
  // The slug is `<pool>-<id>` (parseFxPositionSlug) — anchored so it doesn't
  // also catch the listing's own `/ethereum/fx/pools` and `/info` links.
  rowHrefRe: /^\/ethereum\/fx\/(wsteth|wbtc)-\d+$/,
});
await verifySheet("fx");
await verifyFamily("dolomite", {
  listingPath: "/ethereum/dolomite",
  rowHrefRe: /^\/ethereum\/dolomite\/0x[0-9a-fA-F]{40}\//,
});
await verifySheet("dolomite");
await verifyFamily("llamalend", {
  listingPath: "/ethereum/llamalend",
  rowHrefRe: /^\/ethereum\/llamalend\/0x[0-9a-fA-F]{40}\/0x[0-9a-fA-F]{40}/,
});
await verifySheet("llamalend");
/** A closed account's position path, read off the family's own listing API
 *  (`status=closed`, the first row with events), or null when none answers. */
async function closedSubject(name, apiPath, toHref) {
  if (FAMILIES_FILTER && !FAMILIES_FILTER.has(name)) return null;
  const body = await fetch(`${BASE}${apiPath}?status=closed&limit=10`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  const row = (body?.data ?? []).find((r) => r.status === "closed" && (r.eventCount ?? 0) > 0);
  return row ? toHref(row) : null;
}
// A closed Dolomite or LlamaLend account has no Explanation of its own to
// narrate; the card still receives one (narrating nothing) so the copy-view
// link draws. Pinned to a closed account so the listing's open rows cannot
// stand in for it.
const dolomiteClosed = await closedSubject(
  "dolomite-closed",
  "/api/dolomite/positions",
  (r) => `/ethereum/dolomite/${r.owner}/${r.accountNumber}`,
);
await verifyFamily("dolomite-closed", {
  subjectHref: dolomiteClosed,
  skip: dolomiteClosed ? undefined : "no closed account answered /api/dolomite/positions?status=closed",
});
const llamalendClosed = await closedSubject(
  "llamalend-closed",
  "/api/llamalend/positions",
  (r) => `/ethereum/llamalend/${r.controller}/${r.user}`,
);
await verifyFamily("llamalend-closed", {
  subjectHref: llamalendClosed,
  skip: llamalendClosed ? undefined : "no closed account answered /api/llamalend/positions?status=closed",
});
await verifyFamily("pwn", {
  listingPath: "/ethereum/pwn",
  rowHrefRe: /^\/ethereum\/pwn\/0x[0-9a-fA-F]{40}\?loan=/,
});
await verifySheet("pwn");
await verifyFamily("liquity-v1", {
  listingPath: "/ethereum/liquity-v1",
  rowHrefRe: /^\/ethereum\/liquity-v1\/0x[0-9a-fA-F]{40}\?epoch=/,
});
await verifySheet("liquity-v1");
await verifyFamily("morpho", {
  listingPath: "/ethereum/morpho",
  // Anchored to the (market, user) id shape so it doesn't also catch the
  // listing's own `/ethereum/morpho/markets` link.
  rowHrefRe: /^\/ethereum\/morpho\/(0x)?[a-fA-F0-9]{64}-0x[a-fA-F0-9]{40}/,
});
await verifyFamily("aave-v4", {
  listingPath: "/ethereum/aave-v4",
  rowHrefRe: /^\/ethereum\/aave-v4\/spoke\//,
});
await verifySheet("aave-v4");

// ── sweep batch c ──────────────────────────────────────────────────────────
await verifyFamily("ebisu", {
  listingPath: "/ethereum/ebisu",
  rowHrefRe: /^\/ethereum\/ebisu\/[^/]+\/[^/]+$/,
});
await verifySheet("ebisu");
await verifyFamily("asymmetry", {
  listingPath: "/ethereum/asymmetry",
  rowHrefRe: /^\/ethereum\/asymmetry\/[^/]+\/[^/]+$/,
});
await verifyFamily("basedollar", {
  listingPath: "/base/basedollar",
  rowHrefRe: /^\/base\/basedollar\/[^/]+\/[^/]+$/,
});
await verifySheet("basedollar");
await verifyFamily("aave-v3-base", {
  listingPath: "/base/aave-v3",
  rowHrefRe: /^\/base\/aave-v3\/0x[0-9a-fA-F]{40}$/,
});
await verifyFamily("seamless", {
  listingPath: "/base/seamless",
  rowHrefRe: /^\/base\/seamless\/0x[0-9a-fA-F]{40}$/,
});
await verifyFamily("compound-v3-base", {
  listingPath: "/base/compound-v3",
  // A row's link carries its market as a fragment (`#market-usdc`).
  rowHrefRe: /^\/base\/compound-v3\/0x[0-9a-fA-F]{40}(#[\w-]+)?$/,
});

// ── sweep batch d ──────────────────────────────────────────────────────────
await verifyFamily("moonwell-base", {
  listingPath: "/base/moonwell",
  rowHrefRe: /^\/base\/moonwell\/0x[0-9a-fA-F]{40}/,
});
await verifyFamily("morpho-base", {
  listingPath: "/base/morpho",
  // A row is `/base/morpho/<wallet>/<64-hex market id>` — the per-market
  // position page, which is the one that carries an event route (the wallet
  // overview above it renders no timeline of its own; see the family's
  // opengraph-image.tsx header).
  rowHrefRe: /^\/base\/morpho\/0x[0-9a-fA-F]{40}\/0x[0-9a-f]{64}/,
  // Index-served since the box's Morpho Base backfill landed (2026-09-03):
  // the server loader seeds the whole history, so the event route renders
  // its card rather than the fallback.
});
await verifySheet("morpho-base");

// ── polaris (2026-09-17) ───────────────────────────────────────────────────
// The 27th event route, built after the sweep (rails-ops
// TO-DO-polaris-v2-parity.md §1.3). The generic six checks run off the
// listing's first live row, as every family's do; `verifyPolarisOwn` after
// them holds what is Polaris's own, and a FAMILIES-gated run of `polaris`
// prints both.
await verifyFamily("polaris", {
  listingPath: "/sepolia/polaris",
  rowHrefRe: /^\/sepolia\/polaris\/(usdp|goldp)\/\d+$/,
});
await verifyPolarisOwn();
await verifySheet("polaris");

/** Polaris's own assertions, beyond the shared six — kept out of
 *  `verifyFamily`, which every family shares.
 *
 *  Two CDPs are named on purpose (usdp/175, the forensics fixture, which
 *  holds a liquidation; usdp/8, the parity audit's timeline fixture), but
 *  every id, label and flow is read off THIS run's `/api/polaris/timeline`
 *  answer, never restated from the code under test. What IS pinned: the
 *  family's static roster card, and that a Polaris flow carries no
 *  `valueUsd` (the family states native units — if that goes red because a
 *  price HAS appeared on the wire, it is a family change, not a card bug).
 *
 *   1. The liquidation of usdp/175: `og:image` present, the `<title>`
 *      carries the row's own actionLabel, the image is the found (immutable)
 *      render and not the static card — and the card model draws NO flow
 *      line and NO USD line, because a Polaris liquidation carries no flows
 *      on the wire (the seized legs live in `context.data`).
 *   2. The open of usdp/8: the model's two flows are `+ pETH` and `− USDp`,
 *      in that order, with no USD line.
 *   3. The fabricated-id notice's explorer link points at Sepolia's explorer
 *      — the `/sepolia` segment's `ChainProvider`, proven, not assumed.
 *   4. A malformed market or id answers the static card, NOT immutable, on
 *      the event image route (the abuse census holds the zero-request half).
 *
 *  The card-model probe (1 and 2) is the holder-share verifier's scaffold:
 *  a node child under `--experimental-strip-types` with an `@/` alias hook,
 *  fed the wire answer, rehydrating it with the app's own `fromTimelineWire`
 *  and calling `eventCardModel` on the event — the same mapper the image
 *  route calls. */
async function verifyPolarisOwn() {
  if (FAMILIES_FILTER && !FAMILIES_FILTER.has("polaris")) return;
  console.log("\n── polaris · own ─────────────────────────");
  const staticBytes = await readFile(path.join(REPO, "public/og/explore-polaris.png"));
  const isStatic = (bytes) => Buffer.compare(Buffer.from(bytes), staticBytes) === 0;

  const wire = async (id) => {
    const res = await fetch(`${BASE}/api/polaris/timeline?market=usdp&id=${id}`);
    return res.ok ? res.json() : null;
  };
  // `actionLabel` is dictionary-encoded on the wire (lib/shared/timeline-wire.ts).
  const labelOf = (answer, e) => answer.wire?.al?.[e.al] ?? e.actionLabel ?? null;
  const w175 = await wire("175");
  const w8 = await wire("8");
  if (!check("polaris: usdp/175 and usdp/8 answer on /api/polaris/timeline", !!w175?.events && !!w8?.events)) return;
  const liq = w175.events.find((e) => e.actionType === "liquidate") ?? null;
  const open8 = w8.events.find((e) => e.actionType === "open") ?? null;
  if (!check("polaris: usdp/175 carries a liquidation and usdp/8 an open", !!liq && !!open8)) return;
  const liqLabel = labelOf(w175, liq);
  console.log(`  liquidation: ${liq.id} (${liqLabel}); open: ${open8.id} (${labelOf(w8, open8)})`);

  // 1 — the liquidation's page and image
  const liqPath = `/sepolia/polaris/usdp/175/event/${encodeURIComponent(liq.id)}`;
  const liqHtml = await fetch(`${BASE}${liqPath}`).then((r) => r.text());
  const liqTitle = /<title>([^<]*)<\/title>/.exec(liqHtml)?.[1] ?? "";
  // The image URL is read off the page's own `og:image`, never spelled here:
  // Next serves a dynamic segment's image at `opengraph-image-<hash>`, and the
  // bare `/opengraph-image` path answers 404 (for every family, in dev). The
  // hash is per route file, so the malformed cases in 4 reuse this one.
  const liqOg = /property="og:image" content="([^"]*)"/.exec(liqHtml)?.[1] ?? null;
  const imageFile = liqOg ? (/\/(opengraph-image[^/?]*)/.exec(liqOg)?.[1] ?? "opengraph-image") : "opengraph-image";
  if (!check("polaris own 1: the liquidation page carries an og:image", !!liqOg, String(liqOg))) return;
  check(
    "polaris own 1: the liquidation page's <title> carries the row's own actionLabel",
    !!liqLabel && liqTitle.includes(liqLabel),
    `"${liqTitle}" vs "${liqLabel}"`,
  );
  const liqImg = await fetchImage(liqOg.startsWith("http") ? liqOg : `${BASE}${liqOg}`);
  check(
    "polaris own 1: the liquidation image is 200 image/png, immutable",
    liqImg.status === 200 && liqImg.contentType.includes("image/png") && liqImg.cacheControl.includes("immutable"),
    `${liqImg.status} ${liqImg.contentType} ${liqImg.cacheControl}`,
  );
  check(
    "polaris own 1: the liquidation image is not the static roster card",
    !isStatic(liqImg.bytes),
    `${liqImg.bytes.length} B`,
  );
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await writeFile(path.join(SCREENSHOT_DIR, "polaris-liquidation-og.png"), liqImg.bytes);

  // 1 + 2 — the card model, off the wire, through the app's own mapper
  const PROBE = `
import { register } from "node:module";
import { pathToFileURL } from "node:url";
const ROOT = pathToFileURL(${JSON.stringify(REPO)} + "/").href;
const hook = \`
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = \${JSON.stringify(ROOT)};
export async function resolve(spec, ctx, next) {
  let url = null;
  if (spec.startsWith("@/")) url = ROOT + spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) url = new URL(spec, ctx.parentURL).href;
  if (url) {
    if (!/\\\\.[a-z]+$/.test(url)) {
      for (const ext of [".ts", ".tsx", "/index.ts"]) {
        if (existsSync(fileURLToPath(url + ext))) { url += ext; break; }
      }
    }
    return next(url, ctx);
  }
  return next(spec, ctx);
}
\`;
register("data:text/javascript," + encodeURIComponent(hook));
const { fromTimelineWire } = await import(ROOT + "lib/shared/timeline-wire.ts");
const { eventCardModel } = await import(ROOT + "lib/share/event-model.ts");
const w175 = fromTimelineWire(${JSON.stringify(w175)});
const w8 = fromTimelineWire(${JSON.stringify(w8)});
const liq = w175.events.find((e) => e.id === ${JSON.stringify(liq.id)});
const open = w8.events.find((e) => e.id === ${JSON.stringify(open8.id)});
const ctx = (id) => ({ session: "polaris", subject: "#" + id, market: "USDp" });
const strip = (m) => ({ actionLabel: m.actionLabel, flows: m.flows, usd: m.usd ?? null, txHash: m.txHash });
console.log("RESULT " + JSON.stringify({
  liq: strip(eventCardModel(liq, ctx("175"))),
  open: strip(eventCardModel(open, ctx("8"))),
  openValueUsd: open.flows.map((f) => f.valueUsd ?? null),
}));
`;
  const probe = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", PROBE], {
    cwd: REPO,
    encoding: "utf8",
    timeout: 120000,
    maxBuffer: 32 * 1024 * 1024,
  });
  const probeLine = /RESULT (\{.*\})/.exec(probe.stdout ?? "");
  if (
    check(
      "polaris own: the card-model probe runs",
      Boolean(probeLine),
      probeLine ? "" : (probe.stderr ?? "").slice(-600),
    )
  ) {
    const got = JSON.parse(probeLine[1]);
    check(
      "polaris own 1: the liquidation's model has the verb and the tx hash, no flow line, no USD line",
      got.liq.actionLabel === liqLabel &&
        got.liq.flows.length === 0 &&
        got.liq.usd === null &&
        /^0x[0-9a-f]{64}$/.test(got.liq.txHash),
      JSON.stringify(got.liq),
    );
    const [f0, f1] = got.open.flows;
    check(
      "polaris own 2: the open's model shows + pETH then − USDp, no USD line",
      got.open.flows.length === 2 &&
        f0?.sign === "+" &&
        f0?.symbol === "pETH" &&
        f1?.sign === "−" &&
        f1?.symbol === "USDp" &&
        got.open.usd === null,
      JSON.stringify(got.open),
    );
    check(
      "polaris own 2: no Polaris flow carries a valueUsd on the wire (native units only)",
      got.openValueUsd.every((v) => v === null),
      JSON.stringify(got.openValueUsd),
    );
  }

  // 3 — the fabricated-id notice links to Sepolia's explorer. Its own
  // fabricated id, not the shared FAKE_ID: that one is 62 hex characters,
  // and the notice draws its explorer link only when the id carries a full
  // 64-hex transaction hash (`TX_HASH_IN_ID` in chain-truth-timeline.tsx),
  // so on every family's check 5 the link is absent by design.
  const FAKE_HASH_ID = `0x${"f".repeat(64)}:999999`;
  const fakePath = `/sepolia/polaris/usdp/8/event/${encodeURIComponent(FAKE_HASH_ID)}`;
  const { ctx: nfCtx, page: nfPage } = await open(1280, `${BASE}${fakePath}`);
  await nfPage.waitForTimeout(400);
  const noticeHref = await nfPage
    .locator('a:has-text("View the transaction on the chain")')
    .first()
    .getAttribute("href")
    .catch(() => null);
  await nfCtx.close();
  check(
    "polaris own 3: the not-found notice's explorer link points at Sepolia Etherscan",
    !!noticeHref && noticeHref.includes("sepolia.etherscan.io"),
    String(noticeHref),
  );

  // 4 — malformed parameters answer the static card, not immutable
  for (const [label, bad] of [
    ["bad market", `/sepolia/polaris/hello/8/event/${encodeURIComponent(open8.id)}/${imageFile}`],
    ["bad id", `/sepolia/polaris/usdp/abc/event/${encodeURIComponent(open8.id)}/${imageFile}`],
  ]) {
    const r = await fetchImage(`${BASE}${bad}`);
    check(
      `polaris own 4: ${label} answers 200, the static roster card, NOT immutable`,
      r.status === 200 &&
        r.contentType.includes("image/png") &&
        isStatic(r.bytes) &&
        !r.cacheControl.includes("immutable"),
      `${r.status} ${r.contentType} ${r.cacheControl} static=${isStatic(r.bytes)}`,
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════
// THE VAULT LAYER — three families, 2026-09-20
// ══════════════════════════════════════════════════════════════════════════
//
// Until this batch, a vault event was the only kind of event in Rails a reader
// could not link to: all three timelines nested an EMPTY `EventShareProvider`
// to shadow the shell's href and turn the copy-link control off, because there
// was no `event/[eventId]` route to land on. There is now, on all three.
//
// The generic six run off each family's own subject, exactly as they do for a
// position route. Then `verifyVaultOwn` holds the two things a VAULT event
// route has to answer for that a position route does not:
//
//   V1  THE PINNED CARD IS THE TIMELINE'S CARD, WEI-EXACT. Not "renders a
//       card" — the row's own raw attributes (`data-row-kind`, its block, the
//       balance before and after, the shares moved, the share price, the asset
//       leg) read off the position page and off the pinned page must be
//       identical strings. Those are the figures the wei-exact gate stands
//       behind, and a pinned page that drew any of them differently would be
//       a second reading of one log.
//   V2  A PINNED EVENT INSIDE A COLLAPSED RUN LANDS. Vault rows collapse into
//       runs of ≥3 consecutive same-kind logs, and a `?at=` landing into one
//       is a KNOWN, SEPARATE gap (the share programme's own status note; the
//       contexts above sidestep it with `collapseRuns: false`). Pinned mode
//       bypasses the run spec entirely, so an event a reader cannot land on
//       with `?at=` must still be reachable by its permalink — that is the
//       whole point of a permalink. The target is found by DIFFERENCE, with
//       no run selector: an id the flattened page paints and the grouped page
//       does not is inside a collapsed run.
//
// The three families' event IMAGES differ, and V3 states which is which:
// Ethereum's and Base's draw the card from the stored tail; Yearn's route has
// none, because Yearn keeps no stored history and an image route must not run
// the timeline's own log sweeps — so it advertises Yearn's explorer card and
// the generic check 3 asserts that instead.

/** The row's own wei-exact attributes for one event, or null where the detail
 *  panel is not mounted. The card must be OPEN for these to exist — on the
 *  position page that takes a click; on a pinned page it is already open. */
const vaultRowFacts = (page, eventId) =>
  page.evaluate((id) => {
    const el = document.querySelector(`[data-event-id="${id}"] [data-row-kind]`);
    if (!el) return null;
    return {
      kind: el.getAttribute("data-row-kind"),
      block: el.getAttribute("data-row-block"),
      balanceBefore: el.getAttribute("data-row-balance-before"),
      balanceAfter: el.getAttribute("data-row-balance-after"),
      sharesDelta: el.getAttribute("data-row-shares-delta"),
      sharePrice: el.getAttribute("data-row-share-price"),
      assets: el.getAttribute("data-row-assets"),
    };
  }, eventId);

/** Open one event's card on the position page and read its raw attributes. */
async function factsOnPositionPage(positionPath, eventId) {
  const { ctx, page } = await open(1280, `${BASE}${positionPath}`);
  await page.waitForSelector(`[data-event-id="${eventId}"]`, { timeout: 60000 }).catch(() => {});
  await page
    .locator(`[data-event-id="${eventId}"] [role="button"]`)
    .first()
    .click()
    .catch(() => {});
  await page.waitForSelector(`[data-event-id="${eventId}"] [data-row-kind]`, { timeout: 15000 }).catch(() => {});
  const facts = await vaultRowFacts(page, eventId);
  await ctx.close();
  return facts;
}

/** An id the FLATTENED page paints and the GROUPED page does not — i.e. one
 *  swallowed by a collapsed run. Null where this subject's life has no run of
 *  the minimum length, which is a fact about the subject and is reported as
 *  one rather than passed over. */
async function idInsideACollapsedRun(positionPath) {
  const flat = await open(1280, `${BASE}${positionPath}`);
  await flat.page.waitForSelector("[data-event-id]", { timeout: 60000 }).catch(() => {});
  await exhaustPaging(flat.page);
  const flatIds = await eventIds(flat.page);
  await flat.ctx.close();

  // Runs ON — the default a reader meets, which is exactly why this case
  // matters and why the contexts above are not it.
  const grouped = await open(1280, `${BASE}${positionPath}`, { flattenRuns: false });
  await grouped.page.waitForSelector("[data-event-id]", { timeout: 60000 }).catch(() => {});
  await exhaustPaging(grouped.page);
  const groupedIds = new Set(await eventIds(grouped.page));
  await grouped.ctx.close();

  return { hidden: flatIds.find((id) => !groupedIds.has(id)) ?? null, flat: flatIds.length, grouped: groupedIds.size };
}

async function verifyVaultOwn(name, subject) {
  if (FAMILIES_FILTER && !FAMILIES_FILTER.has(name)) return;
  if (!subject) {
    check(`${name} · own: the generic block found a subject to go on from`, false);
    return;
  }
  console.log(`\n── ${name} · own ─────────────────────────`);
  const { positionPath, decodedId, link } = subject;

  // ── V1: the pinned card IS the timeline's card ───────────────────────
  const onPage = await factsOnPositionPage(positionPath, decodedId);
  const pinnedCtx = await open(1280, link);
  await pinnedCtx.page
    .waitForSelector(`[data-event-id="${decodedId}"] [data-row-kind]`, { timeout: 15000 })
    .catch(() => {});
  const onPinned = await vaultRowFacts(pinnedCtx.page, decodedId);
  await pinnedCtx.ctx.close();
  check(`${name} · own: the row's raw figures are readable on the position page`, !!onPage, JSON.stringify(onPage));
  check(`${name} · own: the row's raw figures are readable on the pinned page`, !!onPinned, JSON.stringify(onPinned));
  check(
    `${name} · own: the pinned card's figures are the timeline card's, wei-exact`,
    !!onPage && !!onPinned && JSON.stringify(onPage) === JSON.stringify(onPinned),
    `${JSON.stringify(onPage)} vs ${JSON.stringify(onPinned)}`,
  );

  // ── V2: a pinned event inside a collapsed run ────────────────────────
  const run = await idInsideACollapsedRun(positionPath);
  if (
    !check(
      `${name} · own: this subject's life has a collapsed run to pin into`,
      !!run.hidden,
      `${run.flat} rows flat, ${run.grouped} with runs on${run.hidden ? "" : " — no id is swallowed, so V2 could not be exercised on this subject; re-pin it"}`,
    )
  )
    return;
  const runLink = `${BASE}${positionPath}/event/${encodeURIComponent(run.hidden)}`;
  const { ctx: runCtx, page: runPage, errors: runErrors } = await open(1280, runLink, { flattenRuns: false });
  const runIds = await eventIds(runPage);
  check(
    `${name} · own: an event inside a collapsed run pins to exactly one card`,
    runIds.length === 1,
    JSON.stringify(runIds),
  );
  check(`${name} · own: and it is that event`, runIds[0] === run.hidden, `${runIds[0]} vs ${run.hidden}`);
  const runPanel = runPage.locator(`[data-event-id="${run.hidden}"] .rounded-b-xl.bg-raised`);
  await runPanel
    .first()
    .waitFor({ state: "attached", timeout: 5000 })
    .catch(() => {});
  check(`${name} · own: its detail panel is open`, (await runPanel.count()) > 0);
  check(`${name} · own: and it raised no page error`, runErrors.length === 0, runErrors.join("; "));
  await runCtx.close();
}

// Aave's three families on Ethereum — savings GHO, the Umbrella stake tokens
// and the static aTokens — all sit under one listing of `(vault, holder)`
// pairs, and a row's href IS the position page.
const aaveVaultSubject = await verifyFamily("aave-vaults", {
  listingPath: "/ethereum/aave/vaults/positions",
  rowHrefRe: /^\/ethereum\/aave\/vaults\/0x[0-9a-fA-F]{40}\/0x[0-9a-fA-F]{40}$/,
});
await verifyVaultOwn("aave-vaults", aaveVaultSubject);
await verifySheet("aave-vaults");

// MetaMorpho on Base, off the same shape of listing.
const morphoVaultSubject = await verifyFamily("morpho-base-vaults", {
  listingPath: "/base/morpho/vaults/positions",
  rowHrefRe: /^\/base\/morpho\/vaults\/0x[0-9a-fA-F]{40}\/0x[0-9a-fA-F]{40}$/,
});
await verifyVaultOwn("morpho-base-vaults", morphoVaultSubject);

// Yearn V3 has a holder lane and NO position listing, so its subject is
// pinned. The VAULT is `verify-ethereum-yearn-vault-timeline.mjs`'s first
// fixture (yvUSDT-1, a 6-decimal asset); the HOLDER is this file's own, and
// deliberately not that file's — its holder's life is four logs with no two
// consecutive of a kind, so V2 below had nothing to pin into (re-pinned
// 2026-09-20 for exactly that: 32 logs, 20 of them inside collapsed runs).
// A pinned subject that has gone quiet is a FAILURE for a person to re-pin,
// never a skip. And this event route carries no image of its own — see
// `eventImage`.
const yearnVaultSubject = await verifyFamily("yearn-vaults", {
  subjectHref:
    "/ethereum/yearn/vaults/0x310b7ea7475a0b449cfd73be81522f1b88efafaa/0xe15a66b7b8e385caa6f69fd0d55984b96d7263cf",
  eventImage: "explorer",
});
await verifyVaultOwn("yearn-vaults", yearnVaultSubject);

await browser.close();
if (retriedFamilies.length)
  console.log(
    `\n\u27f3 ${retriedFamilies.length} retried: ${retriedFamilies.join(", ")} — green, but not on the first attempt`,
  );
if (skipped) console.log(`\n${skipped} sheet check(s) skipped by a subject's flags (SKIP lines above)`);
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
