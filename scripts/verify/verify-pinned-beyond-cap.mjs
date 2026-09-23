#!/usr/bin/env node
// Event links below the render cap — the pinned page, the `?at=` landing and
// the server-side lookup all reach an event the default card list elides.
// ----------------------------------------------------------------------------
// Moonwell Base's index arm draws the newest 2,000 rows plus every
// wallet-signed row below that cut; unsigned rows below it (liquidations,
// their repay legs and seize transfers) are elided until the reader loads
// older events. Before 2026-09-03 an `/event/<id>` link to one of those
// rendered a title with no verb and the card slot read "not among what's
// here", and the pinned page's own "View in timeline" (`?at=<id>`) did the
// same. Both now ask for the whole history once before saying so, and the
// event route's server lookup reads the life uncapped.
//
// The fixture is the wallet with the deepest elided prefix on the roster —
// the 2026-08-27 MAMO exploiter (2,405 rows, 384 elided at the default
// limit). Its first liquidation (09:30:45 UTC, block 50,516,849) sits below
// the cut; a liquidation from 09:33:51 (the earliest the default limit
// serves) is the control. Check 0 asserts that shape against the timeline
// route first: if the cap, the limit or the wallet's history ever changes so
// that the "deep" id is served by default, this verifier says so instead of
// passing on a fixture that no longer exercises anything.
//
// Checks:
//   0. Precondition — the default timeline response omits DEEP_ID and serves
//      SHALLOW_ID; a `limit=3000` read serves DEEP_ID (the id exists).
//   1. Server lookup — the event page's HTML (no JS) titles DEEP_ID with its
//      verb ("· Liquidation"), so metadata and the share image name it.
//   2. Pinned page, fresh context — `/event/DEEP_ID` renders the card
//      (`[data-event-id]` equals the id) and never the not-found notice.
//   3. Control — `/event/SHALLOW_ID` renders the same way.
//   4. Not-found still works — a fabricated id renders the notice, no card,
//      and the "reading the rest" line does not stay up.
//   5. `?at=DEEP_ID` on the position page asks for the deeper read and
//      renders no not-found notice once it has come back.
//
// Proved it can fail 2026-09-03: run against the deployed site before the fix
// (BASE=https://rails-web-onboarding.vercel.app), checks 1, 2 and 5 FAIL while
// 0, 3 and 4 PASS. The same run against a dev server on the fix is ALL PASS.
//
// Run:
//   BASE=http://localhost:3000 node scripts/verify/verify-pinned-beyond-cap.mjs

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const NAV = { waitUntil: "domcontentloaded", timeout: 300000 };
const CARD_TIMEOUT_MS = 240000;

const WALLET = "0x719eae70d4a83f35bf82a2740699f5db84be919d";
const POSITION = `/base/moonwell/${WALLET}`;
// 27 Aug 2026 09:30:45 UTC — the first liquidation, 32 s after the last
// borrow. An unsigned row below the default render cut.
const DEEP_ID = "0x3f5bc84f9bd32daa3961aa601ba39488b633ca87419f7caaba4344e8e0cc0161-27";
// 27 Aug 2026 09:33:51 UTC — the earliest liquidation the default limit
// serves (the first row above the cut).
const SHALLOW_ID = "0x2736d8b5a8f2e508b6e90faa007637cd82c74ef71858b0f6bbd193741ab52f77-20";
const FAKE_ID = "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff-999999";
const NOT_FOUND_TEXT = "among the events Rails has served";

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
  return cond;
};

// A dev server started beside this script may still be booting.
async function waitForBase() {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/`, { redirect: "manual" });
      if (res.status > 0) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`${BASE} did not answer within 120s`);
}

async function timeline(params = "") {
  const res = await fetch(`${BASE}/api/chain/moonwell-base/timeline?wallet=${WALLET}${params}`);
  if (!res.ok) throw new Error(`timeline route ${res.status}`);
  return res.json();
}

await waitForBase();

// ── 0. Precondition: the fixture still straddles the cut ──────────────────
const byDefault = await timeline();
const whole = await timeline("&limit=3000");
const defaultIds = new Set(byDefault.events.map((e) => e.id));
const wholeIds = new Set(whole.events.map((e) => e.id));
check(
  "0a index arm serves this wallet",
  byDefault.coverage?.source === "index",
  `source=${byDefault.coverage?.source}`,
);
check(
  "0b default response is render-capped",
  byDefault.totalEvents > byDefault.events.length,
  `${byDefault.events.length} served of ${byDefault.totalEvents}`,
);
check("0c DEEP_ID is NOT served at the default limit", !defaultIds.has(DEEP_ID));
check("0d SHALLOW_ID IS served at the default limit", defaultIds.has(SHALLOW_ID));
check("0e DEEP_ID exists in the whole history", wholeIds.has(DEEP_ID), `${whole.events.length} rows at limit=3000`);

// ── 1. Server lookup reads the life uncapped ──────────────────────────────
{
  const res = await fetch(`${BASE}${POSITION}/event/${encodeURIComponent(DEEP_ID)}`);
  const html = await res.text();
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";
  check("1  event page HTML titles the deep event with its verb", /· Liquidation/.test(title), title);
}

const browser = await chromium.launch();
// Fresh context per check: the position view remembers how deep a reader
// loaded (render-depth-store in localStorage), and a remembered depth would
// hide exactly the case under test.
async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  return { ctx, page: await ctx.newPage() };
}

async function pinnedCase(name, id, expectCard) {
  const { ctx, page } = await fresh();
  const url = `${BASE}${POSITION}/event/${encodeURIComponent(id)}`;
  await page.goto(url, NAV);
  const cardSel = `[data-event-id="${id}"]`;
  let cardFound = false;
  if (expectCard) {
    try {
      await page.waitForSelector(cardSel, { timeout: CARD_TIMEOUT_MS });
      cardFound = true;
    } catch {
      cardFound = false;
    }
  } else {
    // Give the page its initial load and any deeper read, then settle.
    await page.waitForLoadState("networkidle", { timeout: CARD_TIMEOUT_MS }).catch(() => {});
    try {
      await page.waitForSelector("[data-pinned-reading]", { state: "detached", timeout: CARD_TIMEOUT_MS });
    } catch {
      /* asserted below */
    }
    cardFound = (await page.locator(cardSel).count()) > 0;
  }
  const notice = (await page.getByText(NOT_FOUND_TEXT).count()) > 0;
  const reading = (await page.locator("[data-pinned-reading]").count()) > 0;
  const cards = await page.locator("[data-event-id]").count();
  if (expectCard) {
    check(`${name} renders the card`, cardFound, `cards=${cards}`);
    check(`${name} shows no not-found notice`, !notice);
  } else {
    check(`${name} renders the not-found notice`, notice);
    check(`${name} renders no card`, !cardFound && cards === 0, `cards=${cards}`);
    check(`${name} is not stuck on "reading the rest"`, !reading);
  }
  await ctx.close();
}

// ── 2/3/4 pinned pages ────────────────────────────────────────────────────
await pinnedCase("2  /event/DEEP_ID", DEEP_ID, true);
await pinnedCase("3  /event/SHALLOW_ID (control)", SHALLOW_ID, true);
await pinnedCase("4  /event/FAKE_ID", FAKE_ID, false);

// ── 5. `?at=` landing below the cut ───────────────────────────────────────
{
  const { ctx, page } = await fresh();
  const deeper = page
    .waitForResponse((r) => r.url().includes("/api/chain/moonwell-base/timeline") && /[?&]limit=/.test(r.url()), {
      timeout: CARD_TIMEOUT_MS,
    })
    .then(() => true)
    .catch(() => false);
  await page.goto(`${BASE}${POSITION}?at=${encodeURIComponent(DEEP_ID)}`, NAV);
  const askedDeeper = await deeper;
  check("5a ?at= below the cut asks for the deeper read", askedDeeper);
  await page.waitForLoadState("networkidle", { timeout: CARD_TIMEOUT_MS }).catch(() => {});
  // The list re-renders after the deeper read lands; give it a beat.
  await page.waitForTimeout(3000);
  const notice = (await page.getByText(NOT_FOUND_TEXT).count()) > 0;
  check("5b ?at= below the cut shows no not-found notice", !notice);
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
