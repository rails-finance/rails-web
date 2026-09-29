#!/usr/bin/env node
// Event links below the render cap — the pinned page, the `?at=` landing and
// the server-side lookup all reach an event the default card list elides.
// ----------------------------------------------------------------------------
// Moonwell Base's index arm omits certain event TYPES from the default list —
// unsigned rows (liquidations, their repay legs and seize transfers) — no
// matter how deep a reader reads; it states what it left out in
// `coverage.omitted`. Before 2026-09-03 an `/event/<id>` link to one of those
// rendered a title with no verb and the card slot read "not among what's
// here", and the pinned page's own "View in timeline" (`?at=<id>`) did the
// same. Both now reach the event through the server-side lookup that reads
// the life uncapped, regardless of what the list route serves.
//
// REBUILT 2026-09-27 (rails-ops TO-DO-infra-and-backend.md §8): leg C
// (2026-09-13) moved Moonwell Base's index arm to server-side folders
// (`?group=1`), and with it the omission rule went from DEPTH (a row below
// some cut) to TYPE (liquidations are never individually listed, whatever a
// caller asks for). `?limit=` on the list route stopped doing anything —
// 0d/0e/5a all assumed the old depth cut and went red without a page bug: the
// fix they guard (the server-side lookup route, checks 1/2/3/4) still passes.
// The `?at=` landing's own deeper-read path changed with it: it no longer
// re-asks the list route with a bigger `limit=`, it asks the FOLDER route by
// event key (`/api/chain/moonwell-base/timeline/folder?wallet=…&event=<id>`,
// lib/moonwell-base/timeline-folders.ts) — 5a now watches for that request.
//
// DEEP_ID is left exactly as it was: a real liquidation from the 2026-08-27
// MAMO exploiter, and liquidations are the omitted TYPE now just as
// consistently as they were the below-cut rows before — if anything, more
// durably, since no amount of future activity from this wallet can push it
// back into the list. SHALLOW_ID could not stay: it was ALSO a liquidation
// (the old "first one above the cut"), and every liquidation is omitted now,
// so it stopped being served — 0d's own failure. The control has to be a
// SERVED row, which no longer correlates with block or timestamp, only with
// event type; §0 below queries the wallet's own default response for one
// rather than pin a second literal that the next redesign could just as
// easily retire.
//
// Checks:
//   0. Precondition — DEEP_ID (a liquidation) is never in the default list;
//      the list's own `coverage.omitted` shows liquidations are the reason;
//      SHALLOW_ID (read off the default list itself) IS served.
//   1. Server lookup — the event page's HTML (no JS) titles DEEP_ID with its
//      verb ("· Liquidated"), so metadata and the share image name it.
//   2. Pinned page, fresh context — `/event/DEEP_ID` renders the card
//      (`[data-event-id]` equals the id) and never the not-found notice.
//   3. Control — `/event/SHALLOW_ID` renders the same way.
//   4. Not-found still works — a fabricated id renders the notice, no card,
//      and the "reading the rest" line does not stay up.
//   5. `?at=DEEP_ID` on the position page asks the folder route for the
//      event by key and renders no not-found notice once it has come back.
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
// borrow. Omitted-by-type from the list route, whatever a caller asks for.
const DEEP_ID = "0x3f5bc84f9bd32daa3961aa601ba39488b633ca87419f7caaba4344e8e0cc0161-27";
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

// ── 0. Precondition: the fixture still exercises an omitted-type event ────
const byDefault = await timeline();
const defaultIds = new Set(byDefault.events.map((e) => e.id));
check(
  "0a index arm serves this wallet",
  byDefault.coverage?.source === "index",
  `source=${byDefault.coverage?.source}`,
);
check(
  "0b default response omits rows",
  byDefault.totalEvents > byDefault.events.length,
  `${byDefault.events.length} served of ${byDefault.totalEvents}`,
);
check("0c DEEP_ID is NOT served", !defaultIds.has(DEEP_ID));
// The reason 0c holds: liquidations are an omitted TYPE, not a below-cut
// depth — `?limit=` does not change this (retired 2026-09-27, see the
// header). `omitted.summary.byType` states which types and how many.
const omittedTypes = byDefault.coverage?.omitted?.summary?.byType ?? [];
const omittedLiquidations = omittedTypes.find((t) => t.key === "liquidation")?.count ?? 0;
check(
  "0d the default response's own omitted-summary names liquidations as a reason",
  omittedLiquidations > 0,
  `omitted by type: ${JSON.stringify(omittedTypes)}`,
);
// The control: whichever row the list route itself currently serves — read
// off the list rather than a second pinned id, so a future redesign of WHAT
// gets served (not just how deep) fails this precondition instead of quietly
// testing nothing. Any served id does the control's job in checks 0e/3.
const SHALLOW_ID = byDefault.events[0]?.id;
check("0e the default response serves at least one row to use as the control", Boolean(SHALLOW_ID), `${SHALLOW_ID}`);

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

// ── 5. `?at=` landing on an omitted-type event ─────────────────────────────
{
  const { ctx, page } = await fresh();
  // The landing asks the FOLDER route by event key, not the list route with a
  // bigger `limit=` (retired — see the header): resolveEventKey in
  // lib/moonwell-base/timeline-folders.ts.
  const deeper = page
    .waitForResponse(
      (r) => r.url().includes("/api/chain/moonwell-base/timeline/folder") && r.url().includes(`event=${DEEP_ID}`),
      { timeout: CARD_TIMEOUT_MS },
    )
    .then(() => true)
    .catch(() => false);
  await page.goto(`${BASE}${POSITION}?at=${encodeURIComponent(DEEP_ID)}`, NAV);
  const askedDeeper = await deeper;
  check("5a ?at= on an omitted-type event asks the folder route for it by key", askedDeeper);
  await page.waitForLoadState("networkidle", { timeout: CARD_TIMEOUT_MS }).catch(() => {});
  // The list re-renders after the deeper read lands; give it a beat.
  await page.waitForTimeout(3000);
  const notice = (await page.getByText(NOT_FOUND_TEXT).count()) > 0;
  check("5b ?at= on an omitted-type event shows no not-found notice", !notice);
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
