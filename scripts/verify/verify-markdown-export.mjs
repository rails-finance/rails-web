// verify-markdown-export.mjs — what "Copy for LLM" actually hands over.
// ---------------------------------------------------------------------------
// The Markdown snapshot used to end with one table row per event — 104,015 of
// them on the deepest Aave V3 wallet. It now carries the position plus a bounded
// tail, and the heading states what it left out. This checks the bound holds,
// that the stated total is the POSITION's and not the window's, and that the
// tenure line is the opening balance's date rather than the window's first row.
//
// The expectations are anchored on the page's own two API responses, observed
// off the network rather than read back out of the page — the window's length
// and the opening balance's older-event count, whose SUM the snapshot must
// state. The old code stated the window's length alone, so the check is
// falsifiable in the direction that matters.
//
// ⚠️ `?folders=0` IS PINNED IN THE DEFAULT PAGE PATH, and a PAGE_PATH given by
// hand on Aave V3 or SparkLend should pin it too. Every figure below is the
// FLAT partition's — `olderCount + windowLen` is the position's total, and the
// rows are the history's last N so they are numbered from its end. A grouped
// page has a THIRD contributor (its folders' members), its rows are not a
// contiguous tail, and `markdownTimelineSlice` states both facts differently on
// purpose. That snapshot is checked, on both families and against this one's,
// by `H3` in verify-folder-reductions.mjs. The division is deliberate: this
// script owns the flat snapshot's arithmetic across every protocol, H3 owns the
// grouped one's agreement with it.
//
// ── THE CSV TAKES ONE OF TWO PATHS (rails-ops decision 0029) ──────────────
// A windowed page whose position holds at most INSTANT_EXPORT_MAX_EVENTS
// (5,000, lib/shared/queued-export.ts) builds its CSV in the browser; a larger
// one queues it on the box and hands the reader a file to collect. The two
// default fixtures, both Aave V3 core user positions (neither on
// `protocol_plumbing_contracts`, decision 0024), take one path each:
//
//   instant  0xd411…fdbb7  4,098 events on 2026-09-21. The menu offers "Every
//            event as a spreadsheet"; the file downloads in the browser and
//            carries every event. When the position passes 5,000 the check
//            "is still under the queue threshold" goes red: pick a smaller one.
//   queued   0xee7c…2954   7,150 events. The menu offers a file to collect;
//            this follows the window from requested to ready, downloads the
//            file through the web and counts its rows against the stated rows
//            and the position's served total. Row-for-row equality with the
//            route, the refusals and the restart are verify-queued-export.mjs.
//
// ⚠️ THE QUEUED FIXTURE SPENDS ONE EXPORT REQUEST PER RUN. The box allows one
// export in progress and 10 a day per reader IP, and a request through the
// web counts against THIS MACHINE's IP — the same budget verify-queued-export
// spends its W and L arms from. A refusal is reported with the window's own
// message, never as a crash. QUEUED=0 stops at the menu (no request);
// FIXTURES=instant runs the instant fixture alone.
//
// Run from the repo root with a dev server on :3000:
//
//   node scripts/verify/verify-markdown-export.mjs
//   PROTO=maple PAGE_PATH='/ethereum/maple/0x…' node scripts/verify/verify-markdown-export.mjs
//
// Env: BASE, FIXTURES, QUEUED, WALLET, PROTO, PAGE_PATH, API_PARAMS, RECENT,
// ROWS (expected bound, default 50), SHOT=path. WALLET, PAGE_PATH or PROTO
// replaces the two defaults with that one page, whose CSV path is read off
// the menu.

import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";

const BASE = process.env.BASE ?? "http://localhost:3000";
const MARKET = process.env.MARKET ?? "core";
const PROTO = process.env.PROTO ?? "aave-v3";
const QUEUED = process.env.QUEUED !== "0";
/** The Aave V3 file's fixed header (lib/shared/events-to-csv.ts): both CSV
 *  paths, in the browser and through the queued export, write it. */
const FAMILY_HEADER = {
  "aave-v3":
    "Date (UTC),Block,Action,Wallet,Token Flows,Reserve,Amount,Price (USD),Value (USD),Supply Before,Supply After," +
    "Debt Before,Debt After,Liq Collateral,Liq Collateral Seized,Liq Collateral Value (USD),Liq Debt Covered," +
    "Liq Debt Value (USD),Tx Hash,Etherscan",
};
const headerOf = (text) => text.replace(/^\uFEFF/, "").split("\r\n")[0];
/** `csv` is the path the fixture exists to test; null reads it off the menu. */
const fixture = (id, wallet, csv) => ({
  id,
  csv,
  pagePath: process.env.PAGE_PATH ?? `/ethereum/aave-v3/${wallet}?market=${MARKET}&folders=0`,
  // The parameters naming the position on the API, for the responses the page
  // did not request in the browser (see "the stated total" below).
  apiParams: process.env.API_PARAMS ?? `wallet=${wallet}&market=${MARKET}`,
});
const PICK = process.env.FIXTURES ? process.env.FIXTURES.split(",") : null;
const FIXTURES =
  process.env.WALLET || process.env.PAGE_PATH || process.env.PROTO
    ? [fixture("custom", (process.env.WALLET ?? "").toLowerCase(), null)]
    : [
        fixture("instant", "0xd411d428a63cf4c7029bc53f0e0f56c4933fdbb7", "instant"),
        fixture("queued", "0xee7ca610d896c53ffe716b801c05748efd902954", "queued"),
      ].filter((f) => !PICK || PICK.includes(f.id));
const RECENT = Number(process.env.RECENT ?? 1000);
const ROWS = Number(process.env.ROWS ?? 50);

let pass = 0;
let fail = 0;
const assert = (ok, label, detail) => {
  if (ok) {
    pass++;
    console.log(`PASS  ${label}`);
  } else {
    fail++;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

const num = (s) => Number(String(s).replace(/,/g, ""));

async function runFixture(browser, fx) {
  console.log(`\n── ${fx.id}  ${fx.pagePath}`);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
    permissions: ["clipboard-read", "clipboard-write"],
    acceptDownloads: true,
  });
  const page = await context.newPage();

  // What the page loaded, observed independently of what it rendered.
  let windowLen = null;
  let olderCount = null;
  let openingFirstTs = null;
  page.on("response", async (res) => {
    const u = res.url();
    if (!u.includes(`/api/${PROTO}/timeline`)) return;
    try {
      const body = await res.json();
      if (u.includes("/timeline/summary")) {
        olderCount = body?.totalEvents ?? null;
        openingFirstTs = body?.firstTimestamp ?? null;
      } else if (Array.isArray(body?.events)) {
        windowLen = body.events.length;
      }
    } catch {
      /* non-JSON or aborted */
    }
  });

  // A shallow position never asks for a window at 1000; rewrite the ask so the
  // page exercises the same path its deep siblings do.
  if (RECENT < 1000) {
    await page.route(/\/api\/[^?]+\/timeline\?/, (route) => {
      const u = new URL(route.request().url());
      if (u.searchParams.get("recent") === "1000") {
        u.searchParams.set("recent", String(RECENT));
        return route.continue({ url: u.toString() });
      }
      return route.continue();
    });
  }

  // The opening balance is the page's second request and on a deep position it
  // is the slow one. Wait for it by name: a fixed pause races the snapshot
  // against the very figures it is supposed to carry, and the snapshot would
  // then be checked in its window-only state and look like a code defect.
  //
  // ⚠️ OR FOR THE COUNT LINE'S "Showing L of T events" FORM, whichever comes
  // first. When the server rendered the opening balance the browser never asks
  // for it, and waiting on the response alone spent its full 180 s per page.
  const summarySeen = page
    .waitForResponse((r) => r.url().includes(`/api/${PROTO}/timeline/summary`), { timeout: 180000 })
    .catch(() => null);
  await page.goto(`${BASE}${fx.pagePath}`, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: /Export this (position|loan|trove)|Copy for LLM/i })
    .first()
    .waitFor({ timeout: 180000 });
  const balanceLine = page
    .waitForFunction(
      () =>
        [...document.querySelectorAll("span.tabular-nums")].some((el) =>
          /^Showing [\d,]+ of [\d,]+ events?$/.test((el.textContent || "").trim()),
        ),
      null,
      { timeout: 180000 },
    )
    .catch(() => null);
  await Promise.race([summarySeen, balanceLine]);
  await page.waitForTimeout(2500);

  await page
    .getByRole("button", { name: /Export this (position|loan|trove)|Copy for LLM/i })
    .first()
    .click();
  await page.getByRole("menuitem", { name: /Copy Position/i }).click();
  const md = await page.evaluate(() => navigator.clipboard.readText());
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: false });

  assert(typeof md === "string" && md.length > 0, "snapshot copied to the clipboard", `${md?.length ?? 0} chars`);

  // ── the transcript is bounded, and says so ───────────────────────────────
  const heading = md.match(/^## (?:Recent activity|Activity timeline|Lifecycle timeline) \(([^)]*)\)$/m);
  assert(!!heading, "the timeline section states its own scope", heading ? "" : "no heading matched");
  const headingText = heading?.[1] ?? "";

  const tail = heading ? md.slice(md.indexOf(heading[0]) + heading[0].length) : "";
  const rowLines = tail.split("\n").filter((l) => /^\|\s*[\d,]+\s*\|/.test(l));
  assert(rowLines.length <= ROWS, `the snapshot lists at most ${ROWS} event rows`, `listed ${rowLines.length}`);

  // ── the stated total is the POSITION's, not the window's ─────────────────
  // The two observed responses ARE the expectation. If neither arrived the run
  // proved nothing, so say so rather than passing a branch that asserts less:
  // a check that goes quiet when its inputs are missing cannot go red.
  //
  // ⚠️ THE PAGE MAY NOT ASK FOR THEM IN THE BROWSER. The Aave V3 page renders
  // both on the server (2026-09-21, preview: no `/timeline` request in the
  // browser, and `/timeline/summary` only sometimes), so a response it never
  // made cannot be observed. What was not observed is fetched here, from the
  // same routes, independently of the page — the anchoring
  // verify-timeline-window.mjs uses.
  if (windowLen == null || olderCount == null) {
    try {
      const rows = await (await fetch(`${BASE}/api/${PROTO}/timeline?${fx.apiParams}&recent=${RECENT}`)).json();
      if (windowLen == null && Array.isArray(rows?.events)) windowLen = rows.events.length;
      if (olderCount == null && typeof rows?.cutoffBlock === "number") {
        const s = await (
          await fetch(`${BASE}/api/${PROTO}/timeline/summary?${fx.apiParams}&cutoffBlock=${rows.cutoffBlock}`)
        ).json();
        olderCount = s?.totalEvents ?? null;
        openingFirstTs = s?.firstTimestamp ?? null;
      }
    } catch {
      /* the asserts below say what is missing */
    }
  }
  const stated = headingText.match(/last ([\d,]+) of ([\d,]+)/);
  assert(windowLen != null, "the window's length is known", "no /timeline response, observed or fetched");
  assert(
    olderCount != null,
    "the opening balance's count is known",
    "no /timeline/summary response, observed or fetched",
  );
  const expectedTotal = olderCount != null && windowLen != null ? olderCount + windowLen : null;
  assert(expectedTotal != null, "the expected total could be computed off the network", "inputs missing");
  // The snapshot is short of the position when the rows it can keep — the
  // lesser of the bound and what the page loaded — do not reach the total.
  const keptCeiling = Math.min(ROWS, windowLen ?? ROWS);
  if (expectedTotal != null && keptCeiling < expectedTotal) {
    assert(!!stated, "a truncated snapshot names the position's whole event count", headingText);
    assert(
      stated != null && num(stated[2]) === expectedTotal,
      "the stated total is the opening balance plus the window",
      `markdown ${stated?.[2]} vs ${olderCount} older + ${windowLen} in window = ${expectedTotal}`,
    );
    assert(
      stated != null && num(stated[1]) === rowLines.length && rowLines.length === keptCeiling,
      "the stated kept-row count matches the rows it kept",
      `says ${stated?.[1]}, listed ${rowLines.length}, ceiling ${keptCeiling}`,
    );
    // The numbering is the position's, so the last row is the last event.
    const lastNo = rowLines.length ? num(rowLines[rowLines.length - 1].split("|")[1]) : NaN;
    assert(lastNo === expectedTotal, "the last row is numbered as the position's last event", `#${lastNo}`);
    const firstNo = rowLines.length ? num(rowLines[0].split("|")[1]) : NaN;
    assert(
      firstNo === expectedTotal - rowLines.length + 1,
      "the numbering opens where the kept rows begin",
      `#${firstNo}`,
    );
    // A window's own length must not appear as the total anywhere.
    assert(
      stated != null && num(stated[2]) !== windowLen,
      "the window's length is not passed off as the position's",
      `both ${windowLen}`,
    );
  } else if (expectedTotal != null) {
    assert(!stated, "an unbounded snapshot does not claim a truncation", headingText);
  }

  // ── tenure comes from the opening balance ────────────────────────────────
  // Protocols name the tenure line differently (Opened / First captured
  // activity / First activity); all of them state the same fact.
  const firstLine = md.match(/^- \*\*(?:Opened|First (?:captured |swept )?activity):\*\* (.+)$/m);
  // A protocol whose snapshot states tenure from the loan's own terms rather
  // than from events has no such line; TENURE=0 says so explicitly, so the
  // check still fails loudly anywhere it is expected and missing.
  if (openingFirstTs && process.env.TENURE !== "0") {
    const want = new Date(openingFirstTs * 1000).toISOString().slice(0, 10);
    assert(
      !!firstLine && firstLine[1].includes(want),
      "the tenure line is the opening balance's first event",
      `markdown "${firstLine?.[1] ?? "(absent)"}" vs opening ${want}`,
    );
  }

  // ── no transcript-sized payload ──────────────────────────────────────────
  assert(md.length < 200_000, "the snapshot is a summary, not a transcript", `${md.length} chars`);

  // ── the CSV carries the rows the Markdown left out ───────────────────────
  await page
    .getByRole("button", { name: /Export this (position|loan|trove)|Copy for LLM/i })
    .first()
    .click();
  const csvItem = page.getByRole("menuitem", { name: /Download CSV/i });
  await csvItem.waitFor();
  const csvLabel = (await csvItem.innerText()).replace(/\s+/g, " ").trim();
  const wholeHistoryCsv = csvLabel.includes("Every event");
  const queuedCsvOffered = /prepared as a file to collect/.test(csvLabel);
  assert(
    expectedTotal == null || expectedTotal <= windowLen || wholeHistoryCsv,
    "a windowed page offers the CSV as every event",
    csvLabel,
  );
  if (fx.csv != null) {
    assert(
      queuedCsvOffered === (fx.csv === "queued"),
      fx.csv === "queued"
        ? "the queued fixture is offered a file to collect"
        : "the instant fixture is still under the queue threshold",
      `${expectedTotal} events; the menu reads "${csvLabel}"`,
    );
  }
  if (queuedCsvOffered) {
    if (QUEUED) await queuedCsv(page, fx, csvItem, expectedTotal);
    else console.log("SKIP  the queued export — QUEUED=0, no request spent");
    return context.close();
  }
  // Either the file arrives or the menu states a shortfall. Race them: the
  // branch that wins IS the behaviour under test, and neither is allowed to be
  // silent.
  const downloadP = page.waitForEvent("download", { timeout: 300000 }).catch(() => null);
  const shortfallP = page
    .getByText(/could not reach the other/i)
    .waitFor({ timeout: 300000 })
    .then(() => "short")
    .catch(() => null);
  await csvItem.click();
  if (wholeHistoryCsv) {
    // The wait must be visible; a 28-second silent button reads as broken.
    await page
      .getByText(/Loading the whole history/i)
      .waitFor({ timeout: 15000 })
      .then(() => assert(true, "the CSV states that it is loading"))
      .catch(() => assert(false, "the CSV states that it is loading", "no progress text appeared"));
  }
  const outcome = await Promise.race([downloadP.then((d) => d && "file"), shortfallP]);
  if (outcome === "short") {
    const msg = await page.getByText(/could not reach the other/i).innerText();
    assert(true, "the CSV refuses rather than downloading a short file", msg.replace(/\s+/g, " "));
    const served = Number((msg.match(/served ([\d,]+) events/) ?? [])[1]?.replace(/,/g, "") ?? NaN);
    const missed = Number((msg.match(/other ([\d,]+)/) ?? [])[1]?.replace(/,/g, "") ?? NaN);
    assert(
      Number.isFinite(served) && Number.isFinite(missed) && expectedTotal != null && served + missed === expectedTotal,
      "the refusal names the shortfall in the position's own terms",
      `${served} + ${missed} vs ${expectedTotal}`,
    );
    return context.close();
  }
  const download = await downloadP;
  assert(!!download, "a complete history downloads a file", "no download event");
  if (!download) return context.close();
  const text = await readFile(await download.path(), "utf8");
  const dataRows = csvRows(text);
  assert(download.suggestedFilename().endsWith(".csv"), "the download is named as a CSV", download.suggestedFilename());
  if (FAMILY_HEADER[PROTO])
    assert(headerOf(text) === FAMILY_HEADER[PROTO], "the CSV has the family's columns", headerOf(text).slice(0, 80));
  if (expectedTotal != null) {
    assert(
      dataRows === expectedTotal,
      "the CSV carries every event the position has",
      `${dataRows} rows vs ${olderCount} older + ${windowLen} in window = ${expectedTotal}`,
    );
    assert(dataRows !== windowLen || expectedTotal === windowLen, "the CSV is not the window", `${dataRows} rows`);
  }
  return context.close();
}

/** Follow the queued export's window from the request to the file. */
async function queuedCsv(page, fx, csvItem, expectedTotal) {
  await csvItem.click();
  const win = page.locator("[data-queued-export-window]");
  const opened = await win
    .waitFor({ timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  assert(opened, "the CSV opens the queued export's window", "no window after the click");
  if (!opened) return;
  // Requested → queued/running → ready, or a refusal. Ten minutes covers the
  // deep fixture's build with room; a timeout is a red check with the state
  // the window was left in.
  const END = ["ready", "failed", "expired", "refused", "not-found"];
  const state = await page
    .waitForFunction(
      (end) => {
        const s = document
          .querySelector("[data-queued-export-window] [data-export-state]")
          ?.getAttribute("data-export-state");
        return end.includes(s) ? s : false;
      },
      END,
      { timeout: 600_000, polling: 1000 },
    )
    .then((h) => h.jsonValue())
    .catch(() => null);
  const said = ((await win.innerText().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
  assert(state === "ready", "the queued export reaches ready", `${state ?? "no end state in 10 min"}: ${said}`);
  if (state !== "ready") return;
  const stated = num((said.match(/([\d,]+) rows?/) ?? [])[1] ?? NaN);
  const downloadP = page.waitForEvent("download", { timeout: 300_000 }).catch(() => null);
  await win.locator("[data-export-download]").click();
  const download = await downloadP;
  assert(!!download, "the ready export downloads a file", "no download event");
  if (!download) return;
  const text = await readFile(await download.path(), "utf8");
  const dataRows = csvRows(text);
  assert(download.suggestedFilename().endsWith(".csv"), "the download is named as a CSV", download.suggestedFilename());
  if (FAMILY_HEADER[PROTO])
    assert(
      headerOf(text) === FAMILY_HEADER[PROTO],
      "the queued file has the in-browser file's columns",
      headerOf(text).slice(0, 80),
    );
  assert(dataRows === stated, "the file holds the rows the window states", `${dataRows} in the file, ${stated} stated`);
  // The served total, read before the page opened and again now: a live
  // position may gain events while the file is built, and the file is the
  // history as the box served it at build time.
  const now = await fetch(`${BASE}/api/${PROTO}/timeline/summary?${fx.apiParams}&cutoffBlock=99999999`)
    .then((r) => r.json())
    .then((b) => b?.totalEvents ?? null)
    .catch(() => null);
  assert(
    expectedTotal != null && now != null && dataRows >= expectedTotal && dataRows <= now,
    "the file carries every event the position has",
    `${dataRows} rows; the position held ${expectedTotal} when the page opened and ${now} now`,
  );
}

/** Data rows in a CSV — RFC-4180 aware: a newline inside a quoted field is not
 *  a row break. The header is not counted. */
function csvRows(text) {
  let rows = 0;
  let quoted = false;
  let sawContent = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') i++;
      else quoted = !quoted;
      sawContent = true;
    } else if (ch === "\n" && !quoted) {
      if (sawContent) rows++;
      sawContent = false;
    } else if (ch !== "\r") {
      sawContent = true;
    }
  }
  if (sawContent) rows++;
  return rows - 1;
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    for (const fx of FIXTURES) await runFixture(browser, fx);
  } finally {
    await browser.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 && pass > 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
