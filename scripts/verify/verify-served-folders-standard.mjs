#!/usr/bin/env node
// On a served timeline the folders are the standard: a page the server answered
// in folders opens none of them, and a folder's events are read when the reader
// opens that folder.
// ----------------------------------------------------------------------------
// Subject: steps 1 and 2 of rails-ops decision 0021 (Aave V3, SparkLend,
// Moonwell Base). 326 (web `81662167`) retired the "Collapse like events"
// toggle, so S1 (the menu does not offer it), S4 and C1 (the toggle stays on
// other pages) are gone, and S2 reads the default page.
//
// ── THE CHECKS, per served family ──────────────────────────────────────────
//   S0  the default page draws folders (the fixture is still served — a guard;
//       every other check on the family waits on it)
//   S5  no folder header names a lone standout member (decision 0019, rule 6,
//       amended 2026-09-25: the header states the sums only, never
//       "including one …")
//   S2  the default page: zero `/timeline/folder` reads through load and
//       settle, and no folder drawn open
//   S3  opening one folder by click makes exactly one folder read and draws
//       that folder's first window of members: min(count, GROUP_MEMBER_BATCH =
//       50), the rest paged on scroll (decision 0039 rule 5, web 55e1919e), with
//       the frame stating the whole count in `data-group-members`
// and a list with folders is never empty (rails-ops TO-DO-ui-jobs §13):
//   E1  SparkLend 0xb137…ece5, every event inside a folder: folder rows drawn,
//       no empty label
//   E2  Moonwell Base 0x11a0…520a, the same shape: the same
//   E3  SparkLend 0x0000…8a90 with ?hide=supply, which hides its loose supply
//       event and no folder: no loose supply card, folder rows drawn, no "filtered
//       out" label
//   E4  E1's wallet cut at 2023-05-17 (`?to=`, the Lifetime flows chart's
//       "Sync to chart" button), a day inside its OLDEST folder: the list's ends read the
//       folders' own dates, so the top carries the "tip" boundary row and no
//       pulsing dot. The cut slices that folder to the one event on or before
//       the day, which stands loose under the five-transaction rule (af40fed1),
//       so the rows drawn are a folder or a loose card. Until 2026-10-01 this was a `?from=&to=` Dates filter,
//       which also drew the "view" row at the bottom; a cut hides nothing
//       older, so it draws none
//
// Absence is only ever asserted after a positive signal: "no folder read" is
// counted once the folder rows are drawn and the page has sat still for SETTLE_MS.
//
// ── PROVED IT CAN FAIL, 2026-09-13, BASE=http://localhost:3000 ─────────────
// Green: 16 checks (S0–S4 on three families, C1). Each break applied ALONE to
// components/shared/chain-truth-timeline.tsx, run with ONLY=spark,moonwell-base,
// and restored by checksum:
//
//  (a) the old menu line, `runs?.length || servedRows ? [..., COLLAPSE_RUNS_ITEM]`
//      — FAIL S1 on both: "menu offers "Collapse like events""; S0 S2 S3 S4
//      pass (8/10).
//  (b) `openEveryFolder = !!servedRows && !collapseRuns` restored and passed to
//      `forceOpen` — FAIL S2 on both: spark "5 folder row(s), 5 folder read(s),
//      5 drawn open", moonwell-base "24 folder row(s), 14 folder read(s), 24
//      drawn open"; S0 S1 S3 S4 pass (8/10).
//
// E1–E4 added the same day (TO-DO-ui-jobs §13); green 21 checks. Each break
// applied ALONE, run with ONLY=empty-spark,empty-moonwell-base,filter-spark,
// ends-spark, restored by checksum:
//
//  (c) the list gated on `events.length > 0` again — FAIL all five: E1 "0
//      folder row(s) … says "No transaction history available"", E2 "says
//      "has no Moonwell activity"", E3 and E4a "says "All events filtered
//      out"", E4 "0 tip row(s), 0 pulsing dot(s), 0 view row(s)" (0/5).
//  (d) both ends read `sortedEvents` only (`newestLoadedAt = newestLooseAt`,
//      `oldestLoadedAt = oldestLooseAt`) — FAIL E4 "28 folder row(s), 0 tip
//      row(s), 1 pulsing dot(s), 0 view row(s)"; E1 E2 E3 E4a pass (4/5).
//
//   BASE=http://localhost:3000 node scripts/verify/verify-served-folders-standard.mjs
//   ONLY=spark,client …   run a subset (fixture ids)

import { chromium } from "playwright";
import { bypassHeaders } from "./lib/host.mjs";
import {
  CLOSED_GROUP,
  GROUP_FRAME,
  GROUP_HEADER,
  HEADER_IN_GROUP,
  OPEN_GROUP,
  groupCount,
  openGroup,
} from "./lib/group-rows.mjs";

/** An open group's first window (components/shared/group-frame.tsx). */
const GROUP_MEMBER_BATCH = 50;

const BASE = process.env.BASE ?? "http://localhost:3000";
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",").map((s) => s.trim())) : null;
const SETTLE_MS = 6000;

// aave-v3 is verify-folder-reductions.mjs's arm and moonwell-base the exploiter
// verify-moonwell-base-folders.mjs pins. SparkLend is NOT the reductions arm's
// 0xb137…ece5: every one of its events is inside a folder, which is E1's case
// below, and S3 wants a loose event beside its folders. This one was found on
// the SparkLend listing the same day: 480 events, five folders and one
// ungrouped event, a folder in the first window. S0 says if it drifts.
const SERVED = [
  { id: "aave-v3", path: "/ethereum/aave-v3/0xee7ca610d896c53ffe716b801c05748efd902954?market=core" },
  { id: "spark", path: "/ethereum/spark/0x000000000004444c5dc75cb358380d2e3de08a90" },
  { id: "moonwell-base", path: "/base/moonwell/0x719eae70d4a83f35bf82a2740699f5db84be919d" },
];

// §13: a list with folders and no loose event, bare and filtered.
// 0xb137…ece5 is Spark's deployer, not a borrower: all 2,776 of its events are
// spToken transfers (2,529 in from 864 senders, 247 out), so every one sits in
// a folder. Kept for that: its history is long and settled, where the listing's
// all-folder users (0x2d6fd0fd73f43e272669501fc80acaed223d9520, 16 events) are
// active and would take a loose event on their next supply. 0x0000…8a90 is a
// contract too (Uniswap V4's PoolManager address).
const NEVER_EMPTY = [
  { id: "empty-spark", path: "/ethereum/spark/0xb137e7d16564c81ae2b0c8ee6b55de81dd46ece5", loose: null },
  { id: "empty-moonwell-base", path: "/base/moonwell/0x11a020d80b0a4468bf45888a0ab33cf4169f520a", loose: null },
  // It once held one loose event, a supply; its folders hold transfers. Its
  // newest transfers arrive as loose cards before a folder takes them (3 on
  // 2 Oct 2026), so the pin is that no supply stays drawn, not a count of zero.
  {
    id: "filter-spark",
    path: "/ethereum/spark/0x000000000004444c5dc75cb358380d2e3de08a90?hide=supply",
    loose: null,
    looseNot: "supply",
  },
  // 28 folders, oldest 2023-04-04 → 2024-06-29 holding one event on 2023-05-17
  // (its `byDay`, read 2026-09-13); the newest folder ends 2026-08-31.
  {
    id: "ends-spark",
    // SparkLend has no Dates since 2026-10-01: `?to=` is the Lifetime flows
    // chart's cut at that day's close, which this link restores.
    path: "/ethereum/spark/0xb137e7d16564c81ae2b0c8ee6b55de81dd46ece5?to=2023-05-17",
    loose: null,
    ends: true,
  },
];
// Every family's empty and filtered-out wording on these pages.
const EMPTY_LABELS = [
  "No transaction history available",
  "All events filtered out",
  "has no Moonwell activity",
  "No events to show",
];

const FOLDER_READ = /\/timeline\/folder\?/;
// A folder is a group frame since ui-jobs 250 (lib/group-rows.mjs): its
// closed header is named by its label, and its ⋮ opens the members.
const FOLDER_HEADER = GROUP_HEADER;

let failures = 0;
let counted = 0;
function check(name, cond, detail = "") {
  counted++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
  return cond;
}

const browser = await chromium.launch();

/** A page with its folder reads counted from the first request. */
async function openPage(path) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1400 }, extraHTTPHeaders: bypassHeaders() });
  const page = await ctx.newPage();
  const reads = [];
  page.on("request", (r) => {
    if (FOLDER_READ.test(r.url())) reads.push(r.url());
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 300_000 });
  return { ctx, page, reads, errors };
}

/** The toolbar's count line — the positive signal that the list is drawn. */
async function countLine(page) {
  return page
    .waitForFunction(
      () => {
        for (const el of document.querySelectorAll("span.tabular-nums")) {
          const s = (el.textContent || "").trim();
          if (/^(Showing )?[\d,]+( rows)?( of (at least )?[\d,]+)? (events?|listed)/.test(s)) return s;
        }
        return false;
      },
      null,
      { timeout: 240_000 },
    )
    .then((h) => h.jsonValue())
    .catch(() => null);
}

async function folderRows(page) {
  return page
    .waitForSelector(GROUP_FRAME, { timeout: 120_000 })
    .then(() => page.locator(GROUP_FRAME).count())
    .catch(() => 0);
}

async function runServed(f) {
  const id = (s) => `${s} [${f.id}]`;
  console.log(`\n── ${f.id} ${f.path}`);

  // ── S0, S3, S5 — the default page ──────────────────────────────────────
  {
    const { ctx, page, reads, errors } = await openPage(f.path);
    const line = await countLine(page);
    const folders = line ? await folderRows(page) : 0;
    if (
      !check(id("S0 the default page draws folders"), folders > 0, `count line "${line}", ${folders} folder row(s)`)
    ) {
      await ctx.close();
      return;
    }
    // S5 — rule 6's retired naming: no header reads "including one …".
    const bodyText = await page.evaluate(() => document.body.innerText);
    check(
      id("S5 no folder header names a lone standout member"),
      !bodyText.includes("including one"),
      bodyText.includes("including one") ? 'a header still reads "including one …"' : "clean",
    );

    // S3 — one open from the folder's ⋮, one read, its members drawn.
    await page.waitForTimeout(SETTLE_MS);
    const before = reads.length;
    const frame = page.locator(CLOSED_GROUP).first();
    const handle = await frame.elementHandle();
    const label = (await frame.locator(HEADER_IN_GROUP).first().getAttribute("aria-label")) ?? "";
    const count = groupCount(label);
    const cardsBefore = await page.locator("[data-event-id]").count();
    const answered = page.waitForResponse((r) => FOLDER_READ.test(r.url()), { timeout: 240_000 }).catch(() => null);
    // The first window only: the members arrive after the frame reads open,
    // so openGroup's draw-all would find no next-batch button yet.
    const expanded = await openGroup(page, frame, { allMembers: false });
    const response = expanded ? await answered : null;
    const window = Math.min(count, GROUP_MEMBER_BATCH);
    const grew = response
      ? await page
          .waitForFunction(
            ([sel, n]) => document.querySelectorAll(sel).length >= n,
            ["[data-event-id]", cardsBefore + window],
            { timeout: 120_000 },
          )
          .then(() => true)
          .catch(() => false)
      : false;
    await page.waitForTimeout(SETTLE_MS);
    const cardsAfter = await page.locator("[data-event-id]").count();
    const stated = handle
      ? await handle.evaluate((el) =>
          Number(el.querySelector("[data-group-members]")?.getAttribute("data-group-members")),
        )
      : NaN;
    const clickReads = reads.length - before;
    check(
      id("S3 opening one folder makes exactly one folder read and draws its first window of members"),
      before === 0 && expanded && clickReads === 1 && grew && cardsAfter - cardsBefore === window && stated === count,
      `${before} read(s) before the click, ${clickReads} on it; folder of ${count}, ${cardsAfter - cardsBefore} card(s) drawn of a window of ${window}, the frame states ${stated}${
        expanded ? "" : "; the folder never opened"
      }`,
    );
    if (errors.length) console.log(`      page errors: ${errors.slice(0, 2).join(" | ")}`);
    await ctx.close();
  }

  // ── S2 — the default page opens nothing ───────────────────────────
  {
    const { ctx, page, reads } = await openPage(f.path);
    const line = await countLine(page);
    const folders = line ? await folderRows(page) : 0;
    if (folders > 0) await page.waitForTimeout(SETTLE_MS);
    const open = await page.locator(OPEN_GROUP).count();
    check(
      id("S2 the default page makes no folder read and opens no folder"),
      folders > 0 && reads.length === 0 && open === 0,
      `${folders} folder row(s), ${reads.length} folder read(s), ${open} drawn open`,
    );
    await ctx.close();
  }
}

/** E1–E3: folder rows drawn, and — only once they are — no empty wording. */
async function runNeverEmpty(f, name) {
  console.log(`\n── ${f.id} ${f.path}`);
  const { ctx, page } = await openPage(f.path);
  const line = await countLine(page);
  const folders = line ? await folderRows(page) : 0;
  if (folders > 0) await page.waitForTimeout(SETTLE_MS);
  const text = await page.evaluate(() => document.body.innerText);
  const said = EMPTY_LABELS.filter((l) => text.includes(l));
  const loose = await page.locator("[data-event-id]").count();
  const looseKinds = f.looseNot
    ? await page.locator("[data-event-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-event-id") ?? ""))
    : [];
  const looseOk = (f.loose == null || loose === f.loose) && !looseKinds.some((k) => k.startsWith(`${f.looseNot}:`));
  // A cut (`f.ends`) slices the oldest folder to one member, a loose card
  // (af40fed1). Whether the whole folder is seen first depends on how fast the
  // cut lands after hydration: on a local production build it lands before the
  // folder draws. Either is the list drawing the cut's events.
  const drawn = f.ends ? folders + loose > 0 : folders > 0;
  check(
    `${name} [${f.id}]`,
    drawn && said.length === 0 && looseOk,
    `count line "${line}", ${folders} folder row(s), ${loose} loose card(s)${
      said.length ? `; says "${said.join('", "')}"` : ""
    }`,
  );
  if (f.ends) {
    // Read only once folders are drawn: an absent dot on an empty page says nothing.
    // The cut is applied after hydration, so the folders are counted again
    // here, after SETTLE_MS: the one straddling the cut stands.
    // Since af40fed1 (decision 0039) a group is sliced to the chart's cut and
    // stands only at five transactions: this cut keeps one member of the
    // oldest folder (17 May '23), which draws as a loose card. Either is the
    // list drawing the cut's events.
    // The cut reads its month after hydration (chain-truth-timeline's
    // segments.onPick), and the list stands empty while it does: read once
    // the cut's end row is drawn.
    await page.waitForSelector('[data-boundary-row="cut"]', { timeout: 120_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const cutFolders = await page.locator(GROUP_FRAME).count();
    const cutCards = await page.locator("[data-event-id]").count();
    const tipRows = await page.locator('[data-boundary-row="tip"]').count();
    const viewRows = await page.locator('[data-boundary-row="view"]').count();
    const dots = await page.locator("[data-spine-tip]").count();
    check(
      `E4 a cut inside the oldest folder: its rows drawn, tip row, no pulsing dot, no view row [${f.id}]`,
      cutFolders + cutCards > 0 && tipRows === 1 && dots === 0 && viewRows === 0,
      `${cutFolders} folder row(s), ${cutCards} loose card(s), ${tipRows} tip row(s), ${dots} pulsing dot(s), ${viewRows} view row(s)`,
    );
  }
  await ctx.close();
}

try {
  for (const f of SERVED) if (!ONLY || ONLY.has(f.id)) await runServed(f);
  const [e1, e2, e3, e4] = NEVER_EMPTY;
  if (!ONLY || ONLY.has(e1.id))
    await runNeverEmpty(e1, "E1 an all-folder answer draws its folders, not the empty label");
  if (!ONLY || ONLY.has(e2.id))
    await runNeverEmpty(e2, "E2 an all-folder answer draws its folders, not the empty label");
  if (!ONLY || ONLY.has(e3.id))
    await runNeverEmpty(e3, 'E3 a filter that hides every loose event leaves the folders, not "filtered out"');
  if (!ONLY || ONLY.has(e4.id))
    await runNeverEmpty(e4, "E4a a past-day cut on an all-folder answer draws its events, not the empty label");
} finally {
  await browser.close();
}

console.log(`\n${counted - failures}/${counted} checks passed`);
if (counted === 0) {
  console.log("CRASH — zero checks ran");
  process.exit(2);
}
process.exit(failures === 0 ? 0 : 1);
