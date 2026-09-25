// Live in-browser verification of Share Phase 3 batch 1 — the per-event
// route, pinned mode, the `?at=` landing and the immutable event image —
// across the three families this batch built: Aave V3, Spark, Liquity V2 —
// then the sweep batches a to d, (2026-09-17) Polaris, the 27th route, with
// its own pinned block after the generic sweep, and (2026-09-20) the three
// VAULT families — Aave's on Ethereum, MetaMorpho's on Base and Yearn V3's —
// each with a vault block of its own at the foot of this file.
//
// What it holds, per family:
//   1. The position page's card footer carries a copy-link control; the
//      clipboard receives an absolute URL of the form
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
  "liquity-v1",
]);

let failures = 0;
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

async function copyEventLink(page) {
  await page.click('button[aria-label="Copy a link to this event"]');
  await page.waitForSelector('button[aria-label="Link copied"]', { timeout: 5000 });
  return page.evaluate(() => navigator.clipboard.readText());
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
  // Pinned mode forces the card open by writing card-open-store during
  // render (see chain-truth-timeline.tsx), but the detail panel's own DOM
  // still lands on the next paint — an outright `.count()` right after
  // `open()`'s fixed wait can race it on a loaded machine, so this waits
  // rather than reading the count cold.
  const detailPanel = page.locator(`[data-event-id="${expectedId}"] .rounded-b-xl.bg-raised`);
  await detailPanel
    .first()
    .waitFor({ state: "attached", timeout: 5000 })
    .catch(() => {});
  const detailOpen = await detailPanel.count();
  check(`${label} @${width}: detail panel open`, detailOpen > 0);
  const viewInTimeline = page.locator('a:has-text("View in timeline")');
  const href = await viewInTimeline.getAttribute("href").catch(() => null);
  const subjectSearch = new URL(url).search;
  const expectedHref = `${positionPath}?at=${encodeURIComponent(expectedId)}${subjectSearch ? `&${subjectSearch.slice(1)}` : ""}`;
  check(`${label} @${width}: "View in timeline" points at ?at=`, href === expectedHref, `${href} vs ${expectedHref}`);
  // The toolbar is named by its own Date control. Until 2026-09-11 it was
  // named by its copy-view-link, and `ec46e137` moved that control into the
  // position card's Explanation pane, where a pinned page still draws it on
  // most families — so the old selector read the CARD and called the toolbar
  // present. Check 1 proves this selector finds the toolbar where there is one.
  const toolbarDate = await page.locator("[data-date-control]").count();
  check(`${label} @${width}: toolbar absent (no Date control)`, toolbarDate === 0, `${toolbarDate} found`);
  const sortBtn = await page.locator('button[aria-label^="Currently"]').count();
  check(`${label} @${width}: toolbar sort control absent`, sortBtn === 0);
  // These families pass the card an Explanation whatever the account's status
  // and before the live chain read lands, so the pane's copy-view link is in
  // the DOM (`keepMounted`, pane closed) as soon as the card is. The two
  // `-closed` entries pin a closed account, which narrates nothing and still
  // draws the control.
  if (EXPLANATION_FROM_FIRST_PAINT.has(label)) {
    const copyView = page.locator('button[aria-label="Copy a link to this view"]').first();
    await copyView.waitFor({ state: "attached", timeout: 5000 }).catch(() => {});
    check(`${label} @${width}: the card's Explanation pane carries the copy-view link`, (await copyView.count()) > 0);
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

/** Check 1's two clicks: open the first event card, then its Explanation
 *  disclosure, and report whether the copy-link control is now on the page. */
async function revealFirstCardCopyLink(page) {
  await page.waitForSelector('[data-event-id] [role="button"]', { timeout: 60000 }).catch(() => {});
  const firstCard = page.locator("[data-event-id]").first();
  await firstCard
    .locator('[role="button"]')
    .first()
    .click()
    .catch(() => {});
  await firstCard
    .locator('button[aria-label="Show explanation"], button[aria-label="Show details"]')
    .first()
    .click({ timeout: 15000 })
    .catch(() => {});
  await page.waitForSelector('button[aria-label="Copy a link to this event"]', { timeout: 15000 }).catch(() => {});
  return (await page.locator('button[aria-label="Copy a link to this event"]').count()) > 0;
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

async function verifyFamilyOnce(name, { listingPath, rowHrefRe, skip, subjectHref, eventImage = "dynamic" }) {
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

  // ── Check 1: the position page's footer copy-link ───────────────────
  // The copy-link control sits in EventCardFooter, which — like the tx-hash
  // badge and explorer mark beside it — is inside the card's "Explanation"
  // info-disclosure panel (InfoTabsDisclosure's `footer` prop), which is
  // itself nested inside the card's own detail panel. Getting to it needs
  // TWO clicks: open the card, then open its (i) Explanation disclosure.
  //
  // Two attempts, each in a fresh context: on a live page the first card can
  // re-key under the click when the head replay lands (Liquity V2 failed
  // this check on two of five live runs and passed a four-run repro of the
  // same steps), so one retry separates a flake from a missing control. A
  // failed attempt leaves a screenshot and a state dump so the next flake
  // explains itself instead of being re-run blind.
  let posCtx = null;
  let posPage = null;
  let positionPath = null;
  let hasCopyBtn = false;
  for (let attempt = 1; attempt <= 2 && !hasCopyBtn; attempt++) {
    if (posCtx) await posCtx.close();
    ({ ctx: posCtx, page: posPage } = await open(1280, `${BASE}${rowHref}`));
    positionPath = await posPage.evaluate(() => window.location.pathname);
    hasCopyBtn = await revealFirstCardCopyLink(posPage);
    if (!hasCopyBtn) {
      const state = await firstCardState(posPage);
      await mkdir(SCREENSHOT_DIR, { recursive: true });
      const shot = path.join(SCREENSHOT_DIR, `${name}-check1-attempt${attempt}.png`);
      await posPage.screenshot({ path: shot }).catch(() => {});
      console.log(`  check 1 attempt ${attempt} found no copy-link — ${JSON.stringify(state)} (${shot})`);
    }
  }
  if (!check(`${name}: position page has an event copy-link control`, hasCopyBtn)) {
    await posCtx.close();
    return null;
  }
  // The positive half of check 2's "toolbar absent": the same selector finds
  // the toolbar on the position page, so an absence there is not a selector
  // that matches nothing.
  const posDate = await posPage.locator("[data-date-control]").count();
  check(`${name}: position page draws the toolbar's Date control`, posDate > 0, `${posDate} found`);
  const idsOnPage = await eventIds(posPage);
  const link = await copyEventLink(posPage);
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
    .waitForSelector('a:has-text("View in timeline")', { timeout: 60000 })
    .then(() => viewPage.click('a:has-text("View in timeline")', { timeout: 60000 }))
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
  // row of the listing". A folder needs a stretch of four or more consecutive
  // liquidations or transfers, and an ordinary position simply does not have
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
  const folderRows = await page.locator('[aria-expanded][aria-label*="consecutive"]').count();
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
  await failPage.waitForSelector('[aria-expanded][aria-label*="consecutive"]', { timeout: 60000 }).catch(() => {});
  await failPage
    .locator('[aria-expanded][aria-label*="consecutive"]')
    .first()
    .click()
    .catch(() => {});
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
await verifyFamily("spark", {
  listingPath: "/ethereum/spark",
  rowHrefRe: /^\/ethereum\/spark\/0x[0-9a-fA-F]{40}/,
});
await verifyFamily("liquity-v2", {
  listingPath: "/ethereum/liquity-v2",
  rowHrefRe: /^\/ethereum\/liquity-v2\/trove\//,
});

// ── sweep batch a ────────────────────────────────────────────────────────
await verifyFamily("compound-v3", {
  listingPath: "/ethereum/compound-v3",
  rowHrefRe: /^\/ethereum\/compound-v3\/[^/]+\/0x[0-9a-fA-F]{40}/,
});
await verifyFamily("compound-v2", {
  listingPath: "/ethereum/compound-v2",
  rowHrefRe: /^\/ethereum\/compound-v2\/0x[0-9a-fA-F]{40}/,
});
await verifyFamily("moonwell", {
  listingPath: "/ethereum/moonwell",
  rowHrefRe: /^\/ethereum\/moonwell\/0x[0-9a-fA-F]{40}/,
});
await verifyFamily("maple", {
  listingPath: "/ethereum/maple",
  rowHrefRe: /^\/ethereum\/maple\/0x[0-9a-fA-F]{40}/,
});
await verifyFamily("makerdao", {
  listingPath: "/ethereum/makerdao",
  rowHrefRe: /^\/ethereum\/makerdao\/(\d+|0x[0-9a-fA-F]{40})$/,
});
await verifyFamily("fluid", {
  listingPath: "/ethereum/fluid",
  rowHrefRe: /^\/ethereum\/fluid\/\d+$/,
});
await verifyFamily("frankencoin", {
  listingPath: "/ethereum/frankencoin",
  rowHrefRe: /^\/ethereum\/frankencoin\/0x[0-9a-fA-F]{40}/,
});

// ── sweep batch b ──
await verifyFamily("fx", {
  listingPath: "/ethereum/fx",
  // The slug is `<pool>-<id>` (parseFxPositionSlug) — anchored so it doesn't
  // also catch the listing's own `/ethereum/fx/pools` and `/info` links.
  rowHrefRe: /^\/ethereum\/fx\/(wsteth|wbtc)-\d+$/,
});
await verifyFamily("dolomite", {
  listingPath: "/ethereum/dolomite",
  rowHrefRe: /^\/ethereum\/dolomite\/0x[0-9a-fA-F]{40}\//,
});
await verifyFamily("llamalend", {
  listingPath: "/ethereum/llamalend",
  rowHrefRe: /^\/ethereum\/llamalend\/0x[0-9a-fA-F]{40}\/0x[0-9a-fA-F]{40}/,
});
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
await verifyFamily("liquity-v1", {
  listingPath: "/ethereum/liquity-v1",
  rowHrefRe: /^\/ethereum\/liquity-v1\/0x[0-9a-fA-F]{40}\?epoch=/,
});
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

// ── sweep batch c ──────────────────────────────────────────────────────────
await verifyFamily("ebisu", {
  listingPath: "/ethereum/ebisu",
  rowHrefRe: /^\/ethereum\/ebisu\/[^/]+\/[^/]+$/,
});
await verifyFamily("asymmetry", {
  listingPath: "/ethereum/asymmetry",
  rowHrefRe: /^\/ethereum\/asymmetry\/[^/]+\/[^/]+$/,
});
await verifyFamily("basedollar", {
  listingPath: "/base/basedollar",
  rowHrefRe: /^\/base\/basedollar\/[^/]+\/[^/]+$/,
});
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
  rowHrefRe: /^\/base\/compound-v3\/0x[0-9a-fA-F]{40}$/,
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
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
