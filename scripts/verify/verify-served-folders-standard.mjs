#!/usr/bin/env node
// On a served timeline the folders are the standard: the toggle is gone, and a
// stored preference opens nothing.
// ----------------------------------------------------------------------------
// Subject: steps 1 and 2 of rails-ops decision 0021. On a page the server
// answered in folders (Aave V3, SparkLend, Moonwell Base) the eye menu does not
// offer "Collapse like events", a stored `collapseRuns: false` opens no folder,
// and a folder's events are read when the reader opens that folder. A page that
// groups in the browser keeps the toggle, and so does `?folders=0`, which is
// flat and therefore groups in the browser.
//
// ── THE CHECKS, per served family ──────────────────────────────────────────
//   S0  the default page draws folders (the fixture is still served — a guard;
//       every other check on the family waits on it)
//   S1  the default page's eye menu has no "Collapse like events"
//   S5  no folder header names a lone standout member (decision 0019, rule 6,
//       amended 2026-09-25: the header states the sums only, never
//       "including one …")
//   S2  with `timeline-display-v3` = {"collapseRuns":false} stored before load:
//       zero `/timeline/folder` reads through load and settle, and no folder
//       drawn open
//   S3  opening one folder by click makes exactly one folder read and draws
//       that folder's members
//   S4  the same wallet with `?folders=0` still offers the toggle
// and once:
//   C1  a client-grouped family page still offers the toggle
// and a list with folders is never empty (rails-ops TO-DO-ui-jobs §13):
//   E1  SparkLend 0xb137…ece5, every event inside a folder: folder rows drawn,
//       no empty label
//   E2  Moonwell Base 0x11a0…520a, the same shape: the same
//   E3  SparkLend 0x0000…8a90 with ?hide=supply, which hides its one loose
//       event and no folder: no loose card, folder rows drawn, no "filtered
//       out" label
//   E4  E1's wallet filtered to 2023-05-17, a day inside its OLDEST folder:
//       the list's ends read the folders' own dates, so the top carries the
//       "tip" boundary row and no pulsing dot, and the bottom the "view" row
//
// Absence is only ever asserted after a positive signal: the menu is read once
// one of its other items is visible, and "no folder read" is counted once the
// folder rows are drawn and the page has sat still for SETTLE_MS.
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
// 🔑 The menu title-cases its labels. The first draft compared the label
// exactly, and S1 passed on a page that did offer the toggle; the comparison
// is case-insensitive, and (a) is what shows it now reads the menu.
//
//   BASE=http://localhost:3000 node scripts/verify/verify-served-folders-standard.mjs
//   ONLY=spark,client …   run a subset (fixture ids)

import { chromium } from "playwright";
import { bypassHeaders } from "./lib/host.mjs";

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
// Aave V3 on Base declares `runs` and is not served (verify-timeline-boundary-card.mjs).
const CLIENT = { id: "client", path: "/base/aave-v3/0x7ac2887e026e4239416aac6483c15df05a04a92e" };

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
  // Its one loose event is a supply; its five folders hold transfers only.
  { id: "filter-spark", path: "/ethereum/spark/0x000000000004444c5dc75cb358380d2e3de08a90?hide=supply", loose: 0 },
  // 28 folders, oldest 2023-04-04 → 2024-06-29 holding one event on 2023-05-17
  // (its `byDay`, read 2026-09-13); the newest folder ends 2026-08-31.
  {
    id: "ends-spark",
    path: "/ethereum/spark/0xb137e7d16564c81ae2b0c8ee6b55de81dd46ece5?from=2023-05-17&to=2023-05-17",
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

const TOGGLE = "Collapse like events";
const FOLDER_READ = /\/timeline\/folder\?/;
const FOLDER_HEADER = '[role="button"][aria-expanded][aria-label*=" consecutive "]';

let failures = 0;
let counted = 0;
function check(name, cond, detail = "") {
  counted++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
  return cond;
}

const withFlat = (path) => `${path}${path.includes("?") ? "&" : "?"}folders=0`;

const browser = await chromium.launch();

/** A page with its folder reads counted from the first request. */
async function openPage(path, { stored } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1400 }, extraHTTPHeaders: bypassHeaders() });
  if (stored) {
    await ctx.addInitScript((value) => {
      try {
        localStorage.setItem("timeline-display-v3", value);
      } catch {}
    }, JSON.stringify(stored));
  }
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
    .waitForSelector(FOLDER_HEADER, { timeout: 120_000 })
    .then(() => page.locator(FOLDER_HEADER).count())
    .catch(() => 0);
}

/** The eye menu's item labels, read once one of its always-present items is
 *  visible. Retries the trigger: a click before hydration is lost. Returns
 *  null when the menu never opened — a crash of the check, not an absence. */
async function menuLabels(page) {
  // The position card has a Display menu of its own; the timeline's is the one
  // sharing an ancestor with the count line, nearest first.
  const tagged = await page.evaluate(() => {
    const COUNT = /^(Showing )?[\d,]+( rows)?( of (at least )?[\d,]+)? (events?|listed)/;
    const span = [...document.querySelectorAll("span.tabular-nums")].find((el) =>
      COUNT.test((el.textContent || "").trim()),
    );
    for (let node = span?.parentElement; node; node = node.parentElement) {
      const button = node.querySelector('button[aria-label="Display"][aria-haspopup="listbox"]');
      if (button) {
        button.setAttribute("data-verify-timeline-display", "");
        return true;
      }
    }
    return false;
  });
  if (!tagged) return null;
  const trigger = page.locator("button[data-verify-timeline-display]");
  const anchor = page.getByRole("button", { name: /^(Event numbers|Timestamps \(UTC\))$/i }).first();
  for (let attempt = 0; attempt < 8; attempt++) {
    await trigger.click().catch(() => {});
    const open = await anchor
      .waitFor({ state: "visible", timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (open) {
      const labels = await page
        .getByRole("button")
        .evaluateAll((els) => els.map((e) => (e.textContent || "").trim()).filter(Boolean));
      await page.keyboard.press("Escape");
      return labels;
    }
    await page.waitForTimeout(700);
  }
  return null;
}

async function offersToggle(page, id, name, want) {
  const labels = await menuLabels(page);
  if (!labels) return check(id(name), false, "the eye menu never opened");
  // The menu title-cases its labels ("Collapse Like Events"), so compare
  // without case — an exact match would report every page as lacking it.
  const has = labels.some((l) => l.toLowerCase() === TOGGLE.toLowerCase());
  return check(id(name), has === want, `menu ${has ? "offers" : "does not offer"} "${TOGGLE}"`);
}

async function runServed(f) {
  const id = (s) => `${s} [${f.id}]`;
  console.log(`\n── ${f.id} ${f.path}`);

  // ── S0, S1, S3 — the default page ──────────────────────────────────────
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
    await offersToggle(page, id, "S1 the eye menu does not offer the toggle", false);

    // S5 — rule 6's retired naming: no header reads "including one …".
    const bodyText = await page.evaluate(() => document.body.innerText);
    check(
      id("S5 no folder header names a lone standout member"),
      !bodyText.includes("including one"),
      bodyText.includes("including one") ? 'a header still reads "including one …"' : "clean",
    );

    // S3 — one click, one read, its members drawn.
    await page.waitForTimeout(SETTLE_MS);
    const before = reads.length;
    const header = page.locator(`${FOLDER_HEADER}[aria-expanded="false"]`).first();
    const label = (await header.getAttribute("aria-label")) ?? "";
    const count = Number((/^([\d,]+) consecutive/.exec(label)?.[1] ?? "0").replace(/,/g, ""));
    const cardsBefore = await page.locator("[data-event-id]").count();
    const answered = page.waitForResponse((r) => FOLDER_READ.test(r.url()), { timeout: 240_000 }).catch(() => null);
    let expanded = false;
    for (let attempt = 0; attempt < 6 && !expanded; attempt++) {
      await header.click();
      expanded = await page
        .waitForFunction(
          ([sel, lbl]) =>
            [...document.querySelectorAll(sel)].some(
              (el) =>
                el.getAttribute("aria-label")?.startsWith(lbl.split(" — ")[0]) &&
                el.getAttribute("aria-expanded") === "true",
            ),
          [FOLDER_HEADER, label],
          { timeout: 2500 },
        )
        .then(() => true)
        .catch(() => false);
    }
    const response = expanded ? await answered : null;
    const grew = response
      ? await page
          .waitForFunction(
            ([sel, n]) => document.querySelectorAll(sel).length >= n,
            ["[data-event-id]", cardsBefore + count],
            { timeout: 120_000 },
          )
          .then(() => true)
          .catch(() => false)
      : false;
    await page.waitForTimeout(SETTLE_MS);
    const cardsAfter = await page.locator("[data-event-id]").count();
    const clickReads = reads.length - before;
    check(
      id("S3 opening one folder makes exactly one folder read and draws its members"),
      before === 0 && expanded && clickReads === 1 && grew && cardsAfter - cardsBefore === count,
      `${before} read(s) before the click, ${clickReads} on it; folder of ${count}, ${cardsAfter - cardsBefore} card(s) drawn${
        expanded ? "" : "; the folder never opened"
      }`,
    );
    if (errors.length) console.log(`      page errors: ${errors.slice(0, 2).join(" | ")}`);
    await ctx.close();
  }

  // ── S2 — the stored preference opens nothing ───────────────────────────
  {
    const { ctx, page, reads } = await openPage(f.path, { stored: { collapseRuns: false } });
    const line = await countLine(page);
    const folders = line ? await folderRows(page) : 0;
    if (folders > 0) await page.waitForTimeout(SETTLE_MS);
    const open = await page.locator(`${FOLDER_HEADER}[aria-expanded="true"]`).count();
    check(
      id("S2 a stored collapseRuns:false makes no folder read and opens no folder"),
      folders > 0 && reads.length === 0 && open === 0,
      `${folders} folder row(s), ${reads.length} folder read(s), ${open} drawn open`,
    );
    await ctx.close();
  }

  // ── S4 — `?folders=0` is flat, so it groups in the browser ─────────────
  {
    const { ctx, page } = await openPage(withFlat(f.path));
    const line = await countLine(page);
    if (line) await offersToggle(page, id, "S4 the ?folders=0 page offers the toggle", true);
    else check(id("S4 the ?folders=0 page offers the toggle"), false, "no count line");
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
  const looseOk = f.loose == null || loose === f.loose;
  check(
    `${name} [${f.id}]`,
    folders > 0 && said.length === 0 && looseOk,
    `count line "${line}", ${folders} folder row(s), ${loose} loose card(s)${
      said.length ? `; says "${said.join('", "')}"` : ""
    }`,
  );
  if (f.ends) {
    // Read only once folders are drawn: an absent dot on an empty page says nothing.
    const tipRows = await page.locator('[data-boundary-row="tip"]').count();
    const viewRows = await page.locator('[data-boundary-row="view"]').count();
    const dots = await page.locator("[data-spine-tip]").count();
    check(
      `E4 a past day inside the oldest folder: tip row, no pulsing dot, view row [${f.id}]`,
      folders > 0 && tipRows === 1 && dots === 0 && viewRows === 1,
      `${folders} folder row(s), ${tipRows} tip row(s), ${dots} pulsing dot(s), ${viewRows} view row(s)`,
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
    await runNeverEmpty(e4, "E4a a past-day filter on an all-folder answer draws the folder, not the empty label");
  if (!ONLY || ONLY.has(CLIENT.id)) {
    console.log(`\n── ${CLIENT.id} ${CLIENT.path}`);
    const { ctx, page } = await openPage(CLIENT.path);
    const line = await countLine(page);
    if (line)
      await offersToggle(page, (s) => `${s} [${CLIENT.id}]`, "C1 a client-grouped page offers the toggle", true);
    else check("C1 a client-grouped page offers the toggle", false, "no count line");
    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(`\n${counted - failures}/${counted} checks passed`);
if (counted === 0) {
  console.log("CRASH — zero checks ran");
  process.exit(2);
}
process.exit(failures === 0 ? 0 : 1);
