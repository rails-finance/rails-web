#!/usr/bin/env node
// The resting view is the middle path: a bare directory shows the positions that
// are still open; a search that names a holder (address or ENS) or a position id
// shows every status (Miles, 2026-09-10 — the roster rule, landing on Liquity V2
// and Polaris first).
// ---------------------------------------------------------------------------
// One section per explorer — the two pilots longhand, then the 20 the sweep of
// 2026-09-20 (web `4894a3aa`) put the rule on, driven off one spec table, then
// PWN longhand again because the in-memory tier answers differently. Each
// section asserts the same six things, in the explorer's own vocabulary:
//
//   1  the bare directory's stated total equals the API's own `pagination.total`
//      for the open params — the count is never read off the page under test;
//   2  every card on the bare directory carries an open lifecycle pill (OPEN, or
//      ZOMBIE on Liquity V2, which is an open trove redeemed below the floor);
//   3  the bare directory draws no Status chip and no Reset link — the resting
//      view is a contextual default, not a selection someone made;
//   4  the bare directory's URL stays clean: no `status=` param;
//   5  a search that names a holder relaxes the view to every status without
//      touching the Status facet — the holder's closed position renders, the
//      row count matches the API's total for that holder unfiltered, and there
//      is still no chip (nothing was selected). Same for a position-id search;
//   6  ticking Closed is a real selection: a chip appears, the URL carries the
//      `status=` param, the total matches the API for that set — and removing
//      the chip returns to the contextual default and the clean URL.
//
// Every fixture is read from the API at run time (the holder of a closed
// position, the ids, the totals). Nothing is pinned: the live index moves by the
// minute, and an expected value taken from the thing under test would prove
// nothing.
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run:  BASE=http://localhost:3414 node scripts/verify/verify-listing-resting-view.mjs
//       FIXTURES=morpho,pwn node scripts/verify/verify-listing-resting-view.mjs
//
// ── PROVED IT CAN FAIL, 2026-09-10 ──────────────────────────────────────────
//   `defaultStatuses` in lib/liquity-v2/listing-visibility.ts flipped back to
//   the full set (the pre-change rule) → V2 checks 1 and 2 went red: the bare
//   directory answered 952 rows against the API's 216 open, and the first page
//   carried CLOSED and LIQUIDATED pills. Reverted; the run below is the
//   reverted tree.
//
//   Same flip in lib/polaris/listing-visibility.ts → Polaris check 1 went red:
//   the bare directory answered 5,442 rows against the API's 5,390 open. Check 2
//   stayed green there, and that is the shape of this explorer rather than a
//   weak assertion: Polaris rests on recent activity and its newest CDPs are all
//   opens, so a first page can be open-only while the set behind it is not — the
//   COUNT is what carries check 1's weight on Polaris. Reverted.
//
// ── PROVED IT CAN FAIL, 2026-09-20 — the swept roster, three tiers ──────────
//   SparkLend (the pilot shape, server tier): `defaultStatuses` in
//   lib/spark/listing-visibility.ts flipped to the full set → Spark checks 1, 2,
//   6b, 6c and 6e went red. Check 1 answered 11,807 rows against the index's
//   4,945 open. Reverted.
//
//   PWN (the in-memory tier): lib/shared/list-filter.ts put back to treating a
//   selection EQUAL TO `defaultValues` as no constraint — the pre-sweep rule
//   that would have left PWN showing every loan → PWN checks 1, 2 and 6e went
//   red, check 1 rendering all 35 loans against the index's 1 open. That is the
//   regression this file exists to hold; reverted.
//
//   Seamless (a Base lane inheriting the rule): `parseAaveV3Search` made never
//   to recognise an address → the relax stopped on ALL THREE lanes off
//   `aaveV3ListDimensions`. Seamless 5a/5b/5d, Aave V3 5a/5b/5d/6c and Aave V3
//   Base 5a/5b/5d/6e went red (the wallet's closed position: 0 rows rendered
//   against the index's 1). Which also settles that the three lanes are not
//   redundant copies of one section — they are three routes through one
//   registry, and the section for each is what says so. Reverted.

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";

let failures = 0;
let checked = 0;
const check = (name, cond, detail = "") => {
  checked++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
  return cond;
};
const info = (name, detail) => console.log(`INFO  ${name} — ${detail}`);

/** `FIXTURES=morpho,pwn` runs only the sections whose explorer name matches
 *  (substring, case-insensitive) — the runner's own `FIXTURES=` passes through
 *  to here. Unset runs all 22. A selection that matches nothing would reach a
 *  verdict over zero checks, which run-all.mjs reports as a CRASH, so the
 *  filter states what it selected. */
const FIXTURES = (process.env.FIXTURES ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const wants = (name) => FIXTURES.length === 0 || FIXTURES.some((f) => name.toLowerCase().includes(f));
if (FIXTURES.length > 0) console.log(`FIXTURES=${FIXTURES.join(",")} — only the matching sections run\n`);

/** One API read, retried — the dev server compiles a route on first hit. */
async function api(path_, tries = 4) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    const res = await fetch(`${BASE}${path_}`, { cache: "no-store" }).catch((e) => {
      last = e;
      return null;
    });
    if (res?.ok) return res.json();
    if (res) last = new Error(`${res.status} ${path_}`);
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw last ?? new Error(`failed ${path_}`);
}

// ── page helpers, shared by every explorer section ──────────────────────────

const OPEN_PILLS = new Set(["OPEN", "ZOMBIE"]);
const ALL_PILLS = new Set(["OPEN", "ZOMBIE", "CLOSED", "LIQUIDATED"]);

/** Open a listing URL and wait for the toolbar to come alive. The strip carries
 *  `aria-busy` until its handlers are attached (ui-grammar's ctrlWaking); a
 *  click landing before that is swallowed. */
async function openListing(context, url) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page
    .locator('[data-skel-section="listing-toolbar"]:not([aria-busy="true"])')
    .first()
    .waitFor({ state: "visible", timeout: 120000 })
    .catch(() => {});
  await page.waitForTimeout(400);
  return page;
}

/** The lifecycle pill of every listing row, in order. `rowSel` is the CSS
 *  selector for the row anchors into the explorer's detail routes (Polaris takes
 *  two, one per market); the pill is the row's one all-caps status word. */
async function readPills(page, rowSel) {
  return page.evaluate((sel) => {
    // UNREAD is a listing row whose account has not been read from the chain
    // yet — no state recorded, and never "closed" (rails-ops decision 0018).
    // It is a lifecycle word like the rest, so it is read as one; which sections
    // accept it is each section's own business.
    const words = ["OPEN", "ZOMBIE", "CLOSED", "LIQUIDATED", "UNREAD"];
    const rows = [...document.querySelectorAll(sel)];
    return rows.map((row) => {
      for (const el of row.querySelectorAll("span")) {
        const t = el.textContent?.trim();
        if (t && words.includes(t)) return t;
      }
      return null;
    });
  }, rowSel);
}

/** What the page says its result set is. The pagination strip states the total
 *  ("Showing 1-20 of 216 Troves"); a single-page view draws no strip, and there
 *  the rendered row count IS the total. */
async function readTotal(page, rowSel, itemsPerPage) {
  const stated = await page.evaluate(() => {
    const m = /Showing\s+[\d,]+-[\d,]+\s+of\s+([\d,]+)\s+/.exec(document.body.innerText ?? "");
    return m ? Number(m[1].replace(/,/g, "")) : null;
  });
  if (stated != null) return { total: stated, from: "the pagination strip" };
  const rows = await page.locator(rowSel).count();
  return {
    total: rows < itemsPerPage ? rows : null,
    from: `the ${rows} rendered rows (no pagination strip)`,
  };
}

/** Wait for the stated total to stop being what it was — the same stance
 *  `search()` takes on the row set, for the same reason: a fixed sleep races the
 *  refetch, and what that produces is a stale READ rather than a broken rule.
 *  Measured 2026-09-20: ticking Closed on /base/aave-v3 asks the index for
 *  703,964 rows and the answer lands well past the 1.5s a fixed wait allowed, so
 *  the check read the 384,271 that was still on screen and called the rule
 *  broken. Waiting for "not what was there a moment ago" never waits for the
 *  value the check is about to assert.
 *
 *  Bounded, because a selection need not move the count — a family whose ended
 *  set is empty ticks Closed onto the same rows. The poll gives up and the check
 *  is asserted against the total that stood, which is then the right answer. (It
 *  was Aave V4 that put the bound here, on a count that did not move because the
 *  request was never sent — §47, fixed 2026-09-20. The bound outlived the
 *  defect; a check that waits forever for a change is not the way to catch one.) */
async function waitForTotalChange(page, rowSel, itemsPerPage, previous, tries = 30) {
  for (let i = 0; i < tries; i += 1) {
    const now = await readTotal(page, rowSel, itemsPerPage);
    if (now.total !== previous) return now;
    await page.waitForTimeout(750);
  }
  return readTotal(page, rowSel, itemsPerPage);
}

/** The active-filter chips row: the Status chip's text, and whether Reset is
 *  drawn at all. */
async function readChips(page) {
  return page.evaluate(() => {
    const toolbar = document.querySelector('[data-skel-section="listing-toolbar"]');
    const text = toolbar?.innerText ?? "";
    const m = /Status:[^\n]*/.exec(text);
    return { statusChip: m ? m[0].trim() : null, reset: /(^|\n)\s*Reset\s*(\n|$)/.test(text) };
  });
}

/** Type into the listing's search box and let the driver's 300 ms debounce push
 *  the URL. Given `rowSel`, wait for the row set to CHANGE before reading it: a
 *  fixed sleep races the index read on a busy dev server, and waiting for "not
 *  what was on screen a moment ago" waits for a change, never for the value the
 *  check is about to assert. */
async function search(page, text, rowSel) {
  const before = rowSel ? await page.locator(rowSel).count() : null;
  const box = page.locator('[data-skel-section="listing-toolbar"] input').first();
  await box.click();
  await box.fill(text);
  await page.waitForTimeout(1600);
  if (rowSel) {
    // 30s, not the 13.5s this waited when it held two sections. The file now
    // runs 22 of them against one dev server, and under that load Polaris's
    // holder search came back after the old bound gave up — which reads as "the
    // directory did not relax" and is really "the answer had not arrived".
    for (let i = 0; i < 40 && (await page.locator(rowSel).count()) === before; i += 1) {
      await page.waitForTimeout(750);
    }
    await page.waitForTimeout(500);
  }
}

/** Tick one option in a Status-group filter panel. The facet buttons are drawn
 *  after the toolbar's own skeleton clears (Aave V4 waits on its asset universe
 *  before the row renders at all), so wait for the control rather than for a
 *  fixed interval — a click landing on the skeleton is swallowed. */
async function tickStatus(page, label) {
  const statusBtn = page.getByRole("button", { name: "Status", exact: true }).first();
  await statusBtn.waitFor({ state: "visible", timeout: 60000 });
  await statusBtn.click();
  await page
    .locator('[role="menu"] button')
    .filter({ hasText: new RegExp(`^${label}$`) })
    .first()
    .click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1200);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 1600 } });

// ═══════════════════════════════════════════════════════════════════════════
// Liquity V2  —  /ethereum/liquity-v2
// ═══════════════════════════════════════════════════════════════════════════
// Resting set: active + zombie. A zombie trove has been redeemed below the
// minimum debt — still on chain, still the holder's — so it belongs with the
// open troves, and `?status=active,zombie` is the API's own name for that set.
if (wants("Liquity V2")) {
  // :not([data-holder-strip] a) — the holder strip a wallet search draws above
  // the cards links to the trove nearest its floor, and that link is not a row.
  const ROWS = 'a[href^="/ethereum/liquity-v2/trove/"]:not([data-holder-strip] a)';
  const PER_PAGE = 20;
  const label = (s) => `V2 ${s}`;

  // ── fixtures, read from the API ───────────────────────────────────────────
  const openApi = await api("/api/troves?status=active,zombie&limit=1");
  const allApi = await api("/api/troves?limit=1");
  const closedApi = await api("/api/troves?status=closed&limit=1");
  const openTotal = openApi.pagination?.total;
  const closedRow = closedApi.data?.[0];
  // A closed trove's NFT is burned, so `owner` is null and `lastOwner` names who
  // held it — that is the holder to search for.
  const holder = closedRow?.lastOwner ?? closedRow?.owner ?? null;
  const closedId = closedRow?.id ?? null;
  info(label("fixtures"), `open total ${openTotal}, every status ${allApi.pagination?.total}`);
  info(label("fixtures"), `closed trove ${closedId?.slice(0, 12)}… held by ${holder}`);

  const holderApi = holder ? await api(`/api/troves?ownerAddress=${holder}&limit=100`) : null;
  const holderTotal = holderApi?.pagination?.total ?? 0;
  const holderClosed = (holderApi?.data ?? []).filter((r) => r.status === "closed" || r.status === "liquidated").length;
  info(label("fixtures"), `that holder has ${holderTotal} trove(s), ${holderClosed} of them ended`);

  // ── 1-4. the bare directory ──────────────────────────────────────────────
  const bare = await openListing(context, `${BASE}/ethereum/liquity-v2`);
  const bareSearchOnLoad = await bare.evaluate(() => window.location.search);
  const bareTotal = await readTotal(bare, ROWS, PER_PAGE);
  const barePills = await readPills(bare, ROWS);
  const bareChips = await readChips(bare);

  check(
    label("1. the bare directory's total is the API's open total"),
    bareTotal.total != null && bareTotal.total === openTotal,
    `page ${bareTotal.total} (${bareTotal.from}) vs API ${openTotal} for status=active,zombie`,
  );
  check(
    label("2. every card on the bare directory is open or zombie"),
    barePills.length > 0 && barePills.every((p) => p != null && OPEN_PILLS.has(p)),
    `${barePills.length} rows: ${[...new Set(barePills)].join(", ") || "none"}`,
  );
  check(
    label("3. the bare directory draws no Status chip and no Reset"),
    bareChips.statusChip == null && !bareChips.reset,
    bareChips.statusChip ?? (bareChips.reset ? "Reset drawn" : "neither"),
  );
  check(
    label("4. the bare directory's URL carries no status param"),
    bareSearchOnLoad === "",
    `location.search "${bareSearchOnLoad}"`,
  );

  // ── 5. a search that names a holder relaxes the view ─────────────────────
  if (holder) {
    await search(bare, holder, ROWS);
    const searchUrl = await bare.evaluate(() => window.location.search);
    const searchPills = await readPills(bare, ROWS);
    const searchChips = await readChips(bare);
    const searchTotal = await readTotal(bare, ROWS, PER_PAGE);
    info(label("5. after typing the holder"), `location.search "${searchUrl}"`);
    check(
      label("5a. the holder's ended trove renders"),
      searchPills.filter((p) => p === "CLOSED" || p === "LIQUIDATED").length === holderClosed && holderClosed > 0,
      `${searchPills.filter((p) => p === "CLOSED" || p === "LIQUIDATED").length} ended of ${searchPills.length} rows vs API ${holderClosed}`,
    );
    check(
      label("5b. the holder's row count is the API's unfiltered total"),
      searchTotal.total === holderTotal,
      `page ${searchTotal.total} (${searchTotal.from}) vs API ${holderTotal}`,
    );
    check(
      label("5c. relaxing on a search selects nothing — still no chip, no Reset"),
      searchChips.statusChip == null && !searchChips.reset,
      searchChips.statusChip ?? (searchChips.reset ? "Reset drawn" : "neither"),
    );
    check(
      label("5d. every rendered pill is a real lifecycle word"),
      searchPills.length > 0 && searchPills.every((p) => p != null && ALL_PILLS.has(p)),
      [...new Set(searchPills)].join(", ") || "none",
    );
  } else {
    check(label("5. holder fixture"), false, "no closed trove with a lastOwner in the API answer");
  }

  // ── 5e-f. a position-id search relaxes it too ────────────────────────────
  if (closedId) {
    const byId = await openListing(context, `${BASE}/ethereum/liquity-v2?q=${closedId}`);
    const idPills = await readPills(byId, ROWS);
    const idChips = await readChips(byId);
    check(
      label("5e. a trove-id search finds the closed trove"),
      idPills.length === 1 && idPills[0] === "CLOSED",
      `${idPills.length} row(s): ${idPills.join(", ") || "none"}`,
    );
    check(
      label("5f. the id search draws no chip either"),
      idChips.statusChip == null && !idChips.reset,
      idChips.statusChip ?? (idChips.reset ? "Reset drawn" : "neither"),
    );
    await byId.close();
  } else {
    check(label("5e. trove-id fixture"), false, "no closed trove id in the API answer");
  }

  // ── 6. ticking Closed is a selection: chip, URL param, and back again ────
  const picked = await openListing(context, `${BASE}/ethereum/liquity-v2`);
  await tickStatus(picked, "Closed");
  const pickedUrl = await picked.evaluate(() => window.location.search);
  const pickedChips = await readChips(picked);
  const pickedTotal = await readTotal(picked, ROWS, PER_PAGE);
  const pickedApi = await api("/api/troves?status=active,zombie,closed&limit=1");
  check(
    label("6a. ticking Closed draws a Status chip"),
    pickedChips.statusChip != null && pickedChips.reset,
    `${pickedChips.statusChip ?? "no chip"}${pickedChips.reset ? " + Reset" : " + no Reset"}`,
  );
  check(
    label("6b. ticking Closed writes the status param, closed included"),
    /(^|[?&])status=/.test(pickedUrl) && pickedUrl.includes("closed"),
    `location.search "${pickedUrl}"`,
  );
  check(
    label("6c. the ticked view's total is the API's for that set"),
    pickedTotal.total != null && pickedTotal.total === pickedApi.pagination?.total,
    `page ${pickedTotal.total} vs API ${pickedApi.pagination?.total} for status=active,zombie,closed`,
  );

  // Remove the chip → back to the contextual default and the clean URL.
  await picked.getByRole("button", { name: "Remove Status filter" }).first().click();
  await picked.waitForTimeout(1200);
  const clearedUrl = await picked.evaluate(() => window.location.search);
  const clearedChips = await readChips(picked);
  const clearedTotal = await readTotal(picked, ROWS, PER_PAGE);
  check(
    label("6d. removing the chip returns to the clean URL"),
    !/(^|[?&])status=/.test(clearedUrl),
    `location.search "${clearedUrl}"`,
  );
  check(
    label("6e. removing the chip returns to the open resting set"),
    clearedChips.statusChip == null && clearedTotal.total === openTotal,
    `${clearedChips.statusChip ?? "no chip"}, page ${clearedTotal.total} vs API ${openTotal}`,
  );

  await bare.close();
  await picked.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// Polaris  —  /sepolia/polaris
// ═══════════════════════════════════════════════════════════════════════════
// Resting set: OPEN alone — Polaris has no zombie bucket, and `?status=open` is
// the index's own name for that set.
//
// Two vocabulary notes this section works to:
//   • the row anchor is TWO segments (/sepolia/polaris/<market>/<id>), and the
//     page also links to /sepolia/polaris/markets and /info, so the row selector
//     names the two markets rather than the bare base path;
//   • every ended CDP — closed or liquidated — draws the shared grey/red CLOSED
//     badge and names the outcome in its own column (closed-position-stats.tsx),
//     so "ended" on this explorer means the CLOSED pill, and a liquidation is
//     read from the Outcome word beside it.
//
// The "Liquidated before" facet (`history=liquidated`) is a server no-op today
// and a separate card covers it — nothing here asserts on it.
if (wants("Polaris")) {
  // :not([data-holder-strip] a) — the holder strip a wallet search draws above
  // the cards links to the CDP nearest its floor, and that link is not a row.
  const ROWS =
    'a[href^="/sepolia/polaris/usdp/"]:not([data-holder-strip] a), a[href^="/sepolia/polaris/goldp/"]:not([data-holder-strip] a)';
  const PER_PAGE = 20;
  const label = (s) => `Polaris ${s}`;
  const ENDED_PILLS = new Set(["CLOSED"]);
  const POLARIS_PILLS = new Set(["OPEN", "CLOSED"]);

  /** Every row's href + its rendered text, for the outcome-word reads.
   *  `innerText` (not textContent) — the card's columns are adjacent elements
   *  with no whitespace between them, so textContent reads "OutcomeLiquidated"
   *  as one word. */
  const readRows = (page) =>
    page.evaluate(
      (sel) =>
        [...document.querySelectorAll(sel)].map((a) => ({
          href: a.getAttribute("href"),
          text: (a.innerText ?? "").replace(/\s+/g, " ").trim(),
        })),
      ROWS,
    );

  // ── fixtures, read from the API ───────────────────────────────────────────
  const openApi = await api("/api/polaris/positions?status=open&limit=1");
  const allApi = await api("/api/polaris/positions?limit=1");
  const openTotal = openApi.pagination?.total;
  info(label("fixtures"), `open total ${openTotal}, every status ${allApi.pagination?.total}`);

  /** A holder to prove the search rule on: one whose CDPs include an ended one
   *  and whose whole set fits on the first page, so the rendered rows ARE the
   *  answer. Candidates come from the index (never from the page under test);
   *  a closed CDP keeps its owner here, but `lastOwner` is the fallback. */
  async function pickHolder(statusPath) {
    const candidates = await api(statusPath);
    for (const row of candidates.data ?? []) {
      const addr = row.owner ?? row.lastOwner ?? null;
      if (!addr) continue;
      const held = await api(`/api/polaris/positions?wallet=${addr}&limit=100`);
      const total = held.pagination?.total ?? 0;
      const ended = (held.data ?? []).filter((r) => r.status === "closed" || r.status === "liquidated");
      if (total > 0 && total <= PER_PAGE && ended.length > 0) {
        return { addr, total, ended, row };
      }
    }
    return null;
  }

  const closedHolder = await pickHolder("/api/polaris/positions?market=usdp&status=closed&limit=50");
  const liqHolder = await pickHolder("/api/polaris/positions?market=usdp&status=liquidated&limit=50");

  // ── 1-4. the bare directory ──────────────────────────────────────────────
  const bare = await openListing(context, `${BASE}/sepolia/polaris`);
  const bareSearchOnLoad = await bare.evaluate(() => window.location.search);
  const bareTotal = await readTotal(bare, ROWS, PER_PAGE);
  const barePills = await readPills(bare, ROWS);
  const bareChips = await readChips(bare);

  check(
    label("1. the bare directory's total is the API's open total"),
    bareTotal.total != null && bareTotal.total === openTotal,
    `page ${bareTotal.total} (${bareTotal.from}) vs API ${openTotal} for status=open`,
  );
  check(
    label("2. every card on the bare directory is open"),
    barePills.length > 0 && barePills.every((p) => p === "OPEN"),
    `${barePills.length} rows: ${[...new Set(barePills)].join(", ") || "none"}`,
  );
  check(
    label("3. the bare directory draws no Status chip and no Reset"),
    bareChips.statusChip == null && !bareChips.reset,
    bareChips.statusChip ?? (bareChips.reset ? "Reset drawn" : "neither"),
  );
  check(
    label("4. the bare directory's URL carries no status param"),
    bareSearchOnLoad === "",
    `location.search "${bareSearchOnLoad}"`,
  );

  // ── 5. a search that names a holder relaxes the view ─────────────────────
  if (closedHolder) {
    info(
      label("fixtures"),
      `holder ${closedHolder.addr} holds ${closedHolder.total} CDP(s), ${closedHolder.ended.length} of them ended`,
    );
    await search(bare, closedHolder.addr, ROWS);
    const searchUrl = await bare.evaluate(() => window.location.search);
    const searchPills = await readPills(bare, ROWS);
    const searchChips = await readChips(bare);
    const searchTotal = await readTotal(bare, ROWS, PER_PAGE);
    // Known URL noise, not a defect: the encoder compares the effective set
    // against the PAGE-level default (["open"]), so a holder search writes the
    // relaxed set out. It round-trips and draws no chip — the shared encode rule
    // (lib/shared/list-filter.ts:99-110) is deliberately page-level.
    info(label("5. after typing the holder"), `location.search "${searchUrl}"`);
    check(
      label("5a. the holder's ended CDP renders"),
      searchPills.filter((p) => ENDED_PILLS.has(p)).length === closedHolder.ended.length,
      `${searchPills.filter((p) => ENDED_PILLS.has(p)).length} ended of ${searchPills.length} rows vs API ${closedHolder.ended.length}`,
    );
    check(
      label("5b. the holder's row count is the API's unfiltered total"),
      searchTotal.total === closedHolder.total,
      `page ${searchTotal.total} (${searchTotal.from}) vs API ${closedHolder.total}`,
    );
    check(
      label("5c. relaxing on a search selects nothing — still no chip, no Reset"),
      searchChips.statusChip == null && !searchChips.reset,
      searchChips.statusChip ?? (searchChips.reset ? "Reset drawn" : "neither"),
    );
    check(
      label("5d. every rendered pill is a real lifecycle word"),
      searchPills.length > 0 && searchPills.every((p) => p != null && POLARIS_PILLS.has(p)),
      [...new Set(searchPills)].join(", ") || "none",
    );
  } else {
    check(label("5. holder fixture"), false, "no closed CDP with a single-page holder in the API answer");
  }

  // ── 5e-g. a CDP-number search relaxes it too ─────────────────────────────
  const closedId = closedHolder?.row?.cdpId ?? null;
  if (closedId) {
    const idApi = await api(`/api/polaris/positions?id=${closedId}`);
    const idTotal = idApi.pagination?.total ?? 0;
    const byId = await openListing(context, `${BASE}/sepolia/polaris?q=${closedId}`);
    const idRows = await readRows(byId);
    const idPills = await readPills(byId, ROWS);
    const idChips = await readChips(byId);
    // A bare id names the number in BOTH markets — the index fans it out (one
    // call, measured 2026-09-10), so the page shows every market's CDP with that
    // number, and the closed one among them carries the ended pill.
    info(label("5e. id fixtures"), `id ${closedId} → API ${idTotal} row(s) across the markets`);
    check(
      label("5e. a CDP-number search answers the index's own row set"),
      idRows.length === idTotal && idTotal > 0,
      `${idRows.length} row(s) rendered vs API ${idTotal}: ${idRows.map((r) => r.href).join(", ") || "none"}`,
    );
    const endedIdx = idRows.findIndex((r) => r.href === `/sepolia/polaris/usdp/${closedId}`);
    check(
      label("5f. the closed CDP of that number renders, ended"),
      endedIdx >= 0 && ENDED_PILLS.has(idPills[endedIdx]),
      `usdp/${closedId} pill ${idPills[endedIdx] ?? "not rendered"}`,
    );
    check(
      label("5g. the id search draws no chip either"),
      idChips.statusChip == null && !idChips.reset,
      idChips.statusChip ?? (idChips.reset ? "Reset drawn" : "neither"),
    );
    await byId.close();
  } else {
    check(label("5e. CDP-number fixture"), false, "no closed CDP id in the API answer");
  }

  // ── 5h. a liquidation reaches its holder's search, named as one ──────────
  if (liqHolder) {
    const liq = liqHolder.ended.filter((r) => r.status === "liquidated");
    const page = await openListing(context, `${BASE}/sepolia/polaris?q=${liqHolder.addr}`);
    const rows = await readRows(page);
    // The badge on every ended card reads CLOSED; the Outcome column carries the
    // actual word, which is where a liquidation is named.
    const named = rows.filter((r) => /Outcome\s+Liquidated\b/.test(r.text)).length;
    info(
      label("fixtures"),
      `liquidated holder ${liqHolder.addr} holds ${liqHolder.total} CDP(s), ${liq.length} liquidated`,
    );
    check(
      label("5h. the holder's liquidated CDP renders and says so"),
      rows.length === liqHolder.total && named === liq.length && liq.length > 0,
      `${rows.length} rows vs API ${liqHolder.total}; ${named} say Liquidated vs API ${liq.length}`,
    );
    await page.close();
  } else {
    check(
      label("5h. liquidated-holder fixture"),
      false,
      "no liquidated CDP with a single-page holder in the API answer",
    );
  }

  // ── 6. ticking Closed is a selection: chip, URL param, and back again ────
  const picked = await openListing(context, `${BASE}/sepolia/polaris`);
  await tickStatus(picked, "Closed");
  const pickedUrl = await picked.evaluate(() => window.location.search);
  const pickedChips = await readChips(picked);
  const pickedTotal = await readTotal(picked, ROWS, PER_PAGE);
  // Status rests on the open set, so ticking Closed ADDS to it: the selection is
  // open + closed, and that is the set the index is asked for.
  const pickedApi = await api("/api/polaris/positions?status=open,closed&limit=1");
  check(
    label("6a. ticking Closed draws a Status chip"),
    pickedChips.statusChip != null && pickedChips.reset,
    `${pickedChips.statusChip ?? "no chip"}${pickedChips.reset ? " + Reset" : " + no Reset"}`,
  );
  check(
    label("6b. ticking Closed writes the status param, closed included"),
    /(^|[?&])status=/.test(pickedUrl) && pickedUrl.includes("closed"),
    `location.search "${pickedUrl}"`,
  );
  check(
    label("6c. the ticked view's total is the API's for that set"),
    pickedTotal.total != null && pickedTotal.total === pickedApi.pagination?.total,
    `page ${pickedTotal.total} vs API ${pickedApi.pagination?.total} for status=open,closed`,
  );

  // Remove the chip → back to the contextual default and the clean URL.
  await picked.getByRole("button", { name: "Remove Status filter" }).first().click();
  await picked.waitForTimeout(1200);
  const clearedUrl = await picked.evaluate(() => window.location.search);
  const clearedChips = await readChips(picked);
  const clearedTotal = await readTotal(picked, ROWS, PER_PAGE);
  check(
    label("6d. removing the chip returns to the clean URL"),
    !/(^|[?&])status=/.test(clearedUrl),
    `location.search "${clearedUrl}"`,
  );
  check(
    label("6e. removing the chip returns to the open resting set"),
    clearedChips.statusChip == null && clearedTotal.total === openTotal,
    `${clearedChips.statusChip ?? "no chip"}, page ${clearedTotal.total} vs API ${openTotal}`,
  );

  await bare.close();
  await picked.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// The swept roster  —  the 20 explorers the rule landed on after the pilots
// ═══════════════════════════════════════════════════════════════════════════
// Sixteen took the pilot shape in web `4894a3aa` (a `lib/<proto>/search.ts`
// holding the parse, a `lib/<proto>/listing-visibility.ts` holding
// `defaultStatuses(f)`, the registry resolving through both). Moonwell on Base
// is in by inheritance — its registry maps over Ethereum's dimensions and
// `MOONWELL_BASE_LIST_DEFAULTS` spreads `MOONWELL_LIST_DEFAULTS`. Three more
// Base lanes inherit it for free and the rails-ops entry names none of them:
// aave-v3-base and seamless (both reuse `aaveV3ListDimensions` +
// `AAVE_V3_LIST_DEFAULTS`) and compound-base (reuses Compound's).
//
// One spec per family below, and one runner over them — the assertions are the
// pilots' six, in each explorer's own vocabulary. PWN is written out longhand
// after the loop: it is the only non-fork explorer on the in-memory tier and
// what its section has to catch is a shared-driver regression, not a registry
// one.
//
// ── what carries the weight ─────────────────────────────────────────────────
// THE COUNT, against the index's own total — never the pills alone. Flipping
// Polaris's default back to the full set left "every card is open" GREEN (its
// newest CDPs are all opens) and only the count caught it. So every section
// asserts the bare directory's stated total against `pagination.total` for the
// index's OPEN set, and check 0 first asserts that the index can tell the two
// sets apart at all — a family whose open set equalled its whole set would make
// check 1 pass vacuously, which is the failure this whole file exists to
// prevent.
//
// ── the tolerance, and why there is one ─────────────────────────────────────
// These indexes move while the page renders: /ethereum/morpho answered 12,527
// open one minute and 12,529 the next. So the index is read BEFORE and AFTER
// the page, and the page's total has to land in that bracket plus a 0.1% floor
// (min 3 rows). The gap the check is actually about is never that small — the
// narrowest separation on this roster is Compound V2's 283k open against 418k
// all — so the slack cannot hide a broken default.

const OPEN_PILLS_ROSTER = new Set(["OPEN", "UNREAD"]); // 0018: unread is an open row not yet chain-read
const ENDED_PILLS_ROSTER = new Set(["CLOSED", "LIQUIDATED"]);
const ALL_PILLS_ROSTER = new Set(["OPEN", "UNREAD", "CLOSED", "LIQUIDATED"]);

const rowsOf = (j) => j.rows ?? j.data ?? [];
const totalOf = (j) => j.pagination?.total ?? j.total ?? null;
const joinQs = (...parts) => parts.filter(Boolean).join("&");

/** `pagination.total` for one index query. Both envelopes are in use across the
 *  roster — `{ rows, total }` (the Aave lanes) and `{ data, pagination }`
 *  (everything else) — so the read is normalised here. */
async function indexTotal(base, query) {
  return totalOf(await api(`${base}?${joinQs(query, "limit=1")}`));
}

/** Did the page's total land where the index was while it rendered? See the
 *  tolerance note above. */
function withinIndex(pageTotal, before, after) {
  if (pageTotal == null || before == null || after == null) return false;
  const lo = Math.min(before, after);
  const hi = Math.max(before, after);
  // A non-empty index may never read as an empty page. That is a page that has
  // not painted yet, and no slack should absorb it — measured 2026-09-20 on
  // PWN, where the index holds one open loan, a 3-row floor swallowed the whole
  // signal and check 1 passed over zero rendered rows.
  if (hi > 0 && pageTotal === 0) return false;
  // The bracket already absorbs whatever the index moved between the two reads;
  // the slack is only for the page having rendered just outside it. One row, or
  // 0.05% on the big Base indexes.
  const slack = Math.max(1, Math.ceil(hi * 0.0005));
  return pageTotal >= lo - slack && pageTotal <= hi + slack;
}

/** Wait for the first row to paint. The in-memory tier fetches its whole set in
 *  the browser, so the toolbar can come alive a beat before any card exists —
 *  and reading pills off that beat reports "no open cards" when the truth is
 *  "no cards yet". Bounded, because an empty answer is a legitimate view. */
async function waitForRows(page, rowSel, tries = 40) {
  for (let i = 0; i < tries && (await page.locator(rowSel).count()) === 0; i += 1) {
    await page.waitForTimeout(500);
  }
}

/** A holder to prove the search rule on: one whose whole set fits on the first
 *  page (so the rendered rows ARE the answer, and so `search()`'s wait for the
 *  row set to change can never be waiting for 20 → 20) and whose positions
 *  include one that has ended. Candidates come from the index, never from the
 *  page under test. */
async function pickRosterHolder(spec) {
  for (const st of spec.ended) {
    const seed = await api(`${spec.api}?status=${st}&limit=60`);
    for (const row of rowsOf(seed)) {
      const addr = spec.holder(row);
      if (!addr) continue;
      const held = await api(`${spec.api}?${spec.holderParam}=${addr}&limit=100`);
      const total = totalOf(held) ?? 0;
      const ended = rowsOf(held).filter((r) => spec.ended.includes(r.status)).length;
      if (total > 0 && total < spec.perPage && ended > 0) return { addr, total, ended, row };
    }
  }
  return null;
}

async function runRestingViewSection(spec) {
  const label = (s) => `${spec.name} ${s}`;
  const ROWS = spec.rows;
  const PER_PAGE = spec.perPage;
  if (spec.note) info(label("note"), spec.note);

  // ── 0. the index can tell the two views apart ────────────────────────────
  const openBefore = await indexTotal(spec.api, spec.open);
  const allTotal = await indexTotal(spec.api, spec.all);
  info(label("fixtures"), `index: ${openBefore} open, ${allTotal} across every status`);
  check(
    label("0. the index's open set is smaller than its whole set"),
    openBefore != null && allTotal != null && allTotal > openBefore,
    `${openBefore} open vs ${allTotal} all — the count check below is vacuous unless these differ`,
  );

  // ── 0b. what an ABSENT status param means on this index ──────────────────
  // The client drops `status` when the selection is the whole set, on the rule
  // that a bare request is unfiltered. That rule is a property of each route,
  // not of the roster, and Aave V4 breaks it: unscoped, its index rests on the
  // OPEN set, so the dropped param made Closed a chip that changed the URL and
  // not the list (TO-DO-ui-jobs §47, fixed web-side 2026-09-20 by always
  // sending the three buckets). Every family states which it is, and this
  // check is what holds the statement to the route.
  const bareMeans = spec.bareMeans ?? "all";
  const bareIndex = await indexTotal(spec.api, "");
  const bareExpect = bareMeans === "open" ? openBefore : allTotal;
  const bareOther = bareMeans === "open" ? allTotal : openBefore;
  check(
    label(`0b. a bare index request answers the ${bareMeans === "open" ? "open" : "whole"} set`),
    withinIndex(bareIndex, bareExpect, bareExpect),
    `no status param → ${bareIndex}; declared ${bareMeans} (${bareExpect}), the other set is ${bareOther}`,
  );

  // ── 1-4. the bare directory ──────────────────────────────────────────────
  const bare = await openListing(context, `${BASE}${spec.route}`);
  await waitForRows(bare, ROWS);
  const bareSearchOnLoad = await bare.evaluate(() => window.location.search);
  const bareTotal = await readTotal(bare, ROWS, PER_PAGE);
  const barePills = await readPills(bare, ROWS);
  const bareChips = await readChips(bare);
  const openAfter = await indexTotal(spec.api, spec.open);

  check(
    label("1. the bare directory's total is the index's open total"),
    withinIndex(bareTotal.total, openBefore, openAfter),
    `page ${bareTotal.total} (${bareTotal.from}) vs index ${openBefore}→${openAfter} for ${spec.open || "no status param"}, whole set ${allTotal}`,
  );
  check(
    label("2. every card on the bare directory is still open"),
    barePills.length > 0 && barePills.every((p) => p != null && OPEN_PILLS_ROSTER.has(p)),
    `${barePills.length} rows: ${[...new Set(barePills)].join(", ") || "none"}`,
  );
  check(
    label("3. the bare directory draws no Status chip and no Reset"),
    bareChips.statusChip == null && !bareChips.reset,
    bareChips.statusChip ?? (bareChips.reset ? "Reset drawn" : "neither"),
  );
  check(
    label("4. the bare directory's URL carries no status param"),
    bareSearchOnLoad === "",
    `location.search "${bareSearchOnLoad}"`,
  );

  // ── 5. a search that names a holder relaxes the view ─────────────────────
  const holder = await pickRosterHolder(spec);
  if (holder) {
    info(label("fixtures"), `holder ${holder.addr} holds ${holder.total}, ${holder.ended} of them ended`);
    await search(bare, holder.addr, ROWS);
    const searchUrl = await bare.evaluate(() => window.location.search);
    const searchPills = await readPills(bare, ROWS);
    const searchChips = await readChips(bare);
    const searchTotal = await readTotal(bare, ROWS, PER_PAGE);
    info(label("5. after typing the holder"), `location.search "${searchUrl}"`);
    check(
      label("5a. the holder's ended position renders"),
      searchPills.filter((p) => ENDED_PILLS_ROSTER.has(p)).length === holder.ended && holder.ended > 0,
      `${searchPills.filter((p) => ENDED_PILLS_ROSTER.has(p)).length} ended of ${searchPills.length} rows vs index ${holder.ended}`,
    );
    check(
      label("5b. the holder's row count is the index's total for them, unfiltered"),
      searchTotal.total === holder.total,
      `page ${searchTotal.total} (${searchTotal.from}) vs index ${holder.total}`,
    );
    check(
      label("5c. relaxing on a search selects nothing — still no chip, no Reset"),
      searchChips.statusChip == null && !searchChips.reset,
      searchChips.statusChip ?? (searchChips.reset ? "Reset drawn" : "neither"),
    );
    check(
      label("5d. every rendered pill is a real lifecycle word"),
      searchPills.length > 0 && searchPills.every((p) => p != null && ALL_PILLS_ROSTER.has(p)),
      [...new Set(searchPills)].join(", ") || "none",
    );
  } else {
    check(label("5. holder fixture"), false, "no single-page holder with an ended position in the index's answer");
  }
  await bare.close();

  // ── 5e-g. a position-id search relaxes it too, where the box takes one ───
  if (spec.id && holder) {
    const v = spec.id.of(holder.row);
    if (v == null) {
      check(label("5e. position-id fixture"), false, `no ${spec.id.what} on the seeded ended row`);
    } else {
      const idTotal = await indexTotal(spec.api, spec.id.query(v));
      const byId = await openListing(context, `${BASE}${spec.route}?q=${encodeURIComponent(v)}`);
      const idPills = await readPills(byId, ROWS);
      const idChips = await readChips(byId);
      info(label("5e. id fixtures"), `${spec.id.what} ${v} → index ${idTotal} row(s), unfiltered`);
      check(
        label(`5e. a ${spec.id.what} search answers the index's own row set`),
        idPills.length === idTotal && idTotal > 0,
        `${idPills.length} row(s) rendered vs index ${idTotal}`,
      );
      check(
        label("5f. the ended position of that id renders, ended"),
        idPills.some((p) => ENDED_PILLS_ROSTER.has(p)),
        [...new Set(idPills)].join(", ") || "none",
      );
      check(
        label("5g. the id search draws no chip either"),
        idChips.statusChip == null && !idChips.reset,
        idChips.statusChip ?? (idChips.reset ? "Reset drawn" : "neither"),
      );
      await byId.close();
    }
  }

  // ── 5h. a search that names something which is NOT an identity holds ─────
  // Miles settled this on 2026-09-20 for Morpho and Morpho Base: a market id
  // names a slice of the directory, not a holder or a position, so the resting
  // view does NOT relax there. It is a ruling rather than a side effect, so it
  // is asserted — a future change would otherwise go unnoticed. Reversible in
  // one line in each `search.ts`.
  if (spec.notIdentity) {
    const fixture = await spec.notIdentity.pick(spec);
    if (!fixture) {
      check(
        label(`5h. ${spec.notIdentity.what} fixture`),
        false,
        `no ${spec.notIdentity.what} with both open and ended positions in the index's answer`,
      );
    } else {
      const page = await openListing(context, `${BASE}${spec.route}?q=${fixture.q}`);
      const pills = await readPills(page, ROWS);
      const total = await readTotal(page, ROWS, PER_PAGE);
      const openAgain = await indexTotal(spec.api, joinQs(fixture.scope, spec.open));
      info(
        label(`5h. ${spec.notIdentity.what} fixture`),
        `${fixture.q.slice(0, 14)}… holds ${fixture.open} open of ${fixture.all} across every status`,
      );
      check(
        label(`5h. a ${spec.notIdentity.what} search leaves the listing resting open-only`),
        withinIndex(total.total, fixture.open, openAgain),
        `page ${total.total} (${total.from}) vs index ${fixture.open}→${openAgain} open, ${fixture.all} all`,
      );
      check(
        label(`5i. every card under a ${spec.notIdentity.what} search is still open`),
        pills.length > 0 && pills.every((p) => p != null && OPEN_PILLS_ROSTER.has(p)),
        `${pills.length} rows: ${[...new Set(pills)].join(", ") || "none"}`,
      );
      await page.close();
    }
  }

  // ── 6. ticking the ended option is a real selection ──────────────────────
  const picked = await openListing(context, `${BASE}${spec.route}`);
  await waitForRows(picked, ROWS);
  const restingTotal = await readTotal(picked, ROWS, PER_PAGE);
  await tickStatus(picked, spec.ticked.label);
  const tickedBefore = await indexTotal(spec.api, spec.ticked.query);
  const pickedTotal = await waitForTotalChange(picked, ROWS, PER_PAGE, restingTotal.total);
  const tickedAfter = await indexTotal(spec.api, spec.ticked.query);
  const pickedUrl = await picked.evaluate(() => window.location.search);
  const pickedChips = await readChips(picked);
  check(
    label(`6a. ticking ${spec.ticked.label} draws a Status chip`),
    pickedChips.statusChip != null && pickedChips.reset,
    `${pickedChips.statusChip ?? "no chip"}${pickedChips.reset ? " + Reset" : " + no Reset"}`,
  );
  check(
    label(`6b. ticking ${spec.ticked.label} writes the status param`),
    /(^|[?&])status=/.test(pickedUrl) && pickedUrl.includes(spec.ticked.urlWord),
    `location.search "${pickedUrl}"`,
  );
  check(
    label("6c. the ticked view's total is the index's for that set"),
    withinIndex(pickedTotal.total, tickedBefore, tickedAfter),
    `page ${pickedTotal.total} vs index ${tickedBefore}→${tickedAfter} for ${spec.ticked.query || "no status param"}`,
  );

  // Remove the chip → back to the contextual default and the clean URL.
  await picked.getByRole("button", { name: "Remove Status filter" }).first().click();
  const clearedTotal = await waitForTotalChange(picked, ROWS, PER_PAGE, pickedTotal.total);
  const clearedIndex = await indexTotal(spec.api, spec.open);
  const clearedUrl = await picked.evaluate(() => window.location.search);
  const clearedChips = await readChips(picked);
  check(
    label("6d. removing the chip returns to the clean URL"),
    !/(^|[?&])status=/.test(clearedUrl),
    `location.search "${clearedUrl}"`,
  );
  check(
    label("6e. removing the chip returns to the open resting set"),
    clearedChips.statusChip == null && withinIndex(clearedTotal.total, openAfter, clearedIndex),
    `${clearedChips.statusChip ?? "no chip"}, page ${clearedTotal.total} vs index ${openAfter}→${clearedIndex}`,
  );
  await picked.close();
}

/** The market-id fixture for Morpho and Morpho Base: a market holding both open
 *  and ended positions, so "did the view relax?" has a visible answer. */
async function pickMarketFixture(spec) {
  for (const st of spec.ended) {
    const seed = await api(`${spec.api}?status=${st}&limit=40`);
    for (const row of rowsOf(seed)) {
      const id = row.marketId;
      if (!id) continue;
      const scope = `market=${id.replace(/^0x/, "")}`;
      const open = await indexTotal(spec.api, joinQs(scope, spec.open));
      const all = await indexTotal(spec.api, joinQs(scope, spec.all));
      // Not exactly one page of open rows: at PER_PAGE the pagination strip is
      // not drawn and the rendered rows cannot state the total.
      if (open > 0 && all > open && open !== spec.perPage) return { q: id, scope, open, all };
    }
  }
  return null;
}

const ROSTER = [
  {
    name: "Aave V3",
    route: "/ethereum/aave-v3",
    api: "/api/aave-v3/positions",
    rows: 'a[href^="/ethereum/aave-v3/0x"]',
    perPage: 20,
    open: "status=open",
    all: "status=open,closed,liquidated",
    ended: ["closed", "liquidated"],
    holderParam: "wallet",
    holder: (r) => r.wallet,
    ticked: { label: "Closed", query: "status=open,closed", urlWord: "closed" },
  },
  {
    // Inherits the rule with no modules of its own: the Base lane builds its
    // registry from `aaveV3ListDimensions` + `AAVE_V3_LIST_DEFAULTS`.
    name: "Aave V3 Base",
    route: "/base/aave-v3",
    api: "/api/aave-v3-base/positions",
    rows: 'a[href^="/base/aave-v3/0x"]',
    perPage: 20,
    open: "status=open",
    all: "status=open,closed,liquidated",
    ended: ["closed", "liquidated"],
    holderParam: "wallet",
    holder: (r) => r.wallet,
    ticked: { label: "Closed", query: "status=open,closed", urlWord: "closed" },
  },
  {
    // The other lane off Aave V3's registry.
    name: "Seamless",
    route: "/base/seamless",
    api: "/api/seamless/positions",
    rows: 'a[href^="/base/seamless/0x"]',
    perPage: 20,
    open: "status=open",
    all: "status=open,closed,liquidated",
    ended: ["closed", "liquidated"],
    holderParam: "wallet",
    holder: (r) => r.wallet,
    ticked: { label: "Closed", query: "status=open,closed", urlWord: "closed" },
  },
  {
    name: "Aave V4",
    route: "/ethereum/aave-v4",
    api: "/api/aave-v4/spoke-positions",
    rows: 'a[href^="/ethereum/aave-v4/spoke/"]',
    perPage: 20,
    open: "status=open",
    all: "status=open,closed,liquidated",
    // The one family on the roster whose bare request is NOT unfiltered — see 0b.
    bareMeans: "open",
    ended: ["closed", "liquidated"],
    holderParam: "wallet",
    holder: (r) => r.wallet,
    // V4's Status facet is a two-bucket axis (open | closed; a liquidation is
    // the orthogonal History toggle), so ticking Closed makes the selection the
    // WHOLE set. On every other explorer the client then sends no `status` at
    // all, because a bare request there answers the whole lifecycle. The V4
    // index does not: unscoped, it rests on OPEN-ONLY, and its token for no
    // restriction is the explicit "all". So the ticked query here names the
    // three buckets, and 6c is a discriminating check — the defect it was
    // written against (2026-09-20, TO-DO §47) rendered 3,931 against an index
    // of 7,507. Check 1 still cannot discriminate on its own: the holder search
    // (check 5) is what proves V4's relax, and it is a real relax — scoped to a
    // wallet the index answers every status.
    ticked: { label: "Closed", query: "status=open,closed,liquidated", urlWord: "closed" },
    note: "V4 changed behaviour most — it rested on every status in both contexts and now rests open-only. Its parse moved to lib/aave-v4/search.ts because the registry imports visibility.",
  },
  {
    name: "Compound V3",
    route: "/ethereum/compound-v3",
    api: "/api/compound/positions",
    rows: 'a[href^="/ethereum/compound-v3/"][href*="/0x"]',
    perPage: 20,
    open: "status=open",
    all: "status=open,closed,liquidated",
    ended: ["closed", "liquidated"],
    holderParam: "wallet",
    holder: (r) => r.account,
    ticked: { label: "Closed", query: "status=open,closed", urlWord: "closed" },
  },
  {
    // Inherits the rule from Compound's registry.
    name: "Compound V3 Base",
    route: "/base/compound-v3",
    api: "/api/compound-base/positions",
    rows: 'a[href^="/base/compound-v3/0x"]',
    perPage: 20,
    open: "status=open",
    all: "status=open,closed,liquidated",
    ended: ["closed", "liquidated"],
    holderParam: "wallet",
    holder: (r) => r.account,
    ticked: { label: "Closed", query: "status=open,closed", urlWord: "closed" },
  },
  {
    name: "Compound V2",
    route: "/ethereum/compound-v2",
    api: "/api/compound-v2/positions",
    rows: 'a[href^="/ethereum/compound-v2/0x"]',
    perPage: 20,
    open: "status=open",
    all: "status=open,closed,liquidated",
    ended: ["closed", "liquidated"],
    holderParam: "wallet",
    holder: (r) => r.wallet,
    ticked: { label: "Closed", query: "status=open,closed", urlWord: "closed" },
  },
  {
    name: "Dolomite",
    route: "/ethereum/dolomite",
    api: "/api/dolomite/positions",
    rows: 'a[href^="/ethereum/dolomite/0x"]',
    perPage: 20,
    open: "status=open",
    all: "status=open,closed,liquidated",
    ended: ["closed", "liquidated"],
    holderParam: "owner",
    holder: (r) => r.owner,
    ticked: { label: "Closed", query: "status=open,closed", urlWord: "closed" },
  },
  {
    name: "Fluid",
    route: "/ethereum/fluid",
    api: "/api/fluid/positions",
    rows: 'a[href^="/ethereum/fluid/"]:not([href$="/vaults"]):not([href$="/info"])',
    perPage: 20,
    open: "status=open",
    all: "status=open,closed",
    ended: ["closed"],
    holderParam: "wallet",
    holder: (r) => r.owner,
    // A Fluid position is an NFT, so the box takes an id as well as a holder.
    id: { what: "position NFT id", of: (r) => r.nftId, query: (v) => `nft=${v}` },
    // Two buckets, so ticking Closed selects the whole lifecycle and the status
    // param drops — which on this index IS every status (unlike Aave V4's).
    ticked: { label: "Closed", query: "", urlWord: "closed" },
    note: "Fluid parses the same search box twice — once in the registry's fetch dispatch (pre-existing, forwarding free text as a wallet) and once in search.ts for the identity test. Known, and left alone by the sweep.",
  },
  {
    name: "Frankencoin",
    route: "/ethereum/frankencoin",
    api: "/api/frankencoin/positions",
    rows: 'a[href^="/ethereum/frankencoin/0x"]',
    perPage: 20,
    open: "status=open",
    all: "status=open,closed,denied",
    // "denied" is Frankencoin's third terminal bucket — a position the hub
    // refused — and it draws the same terminal card as a closed one.
    ended: ["closed", "denied"],
    holderParam: "owner",
    holder: (r) => r.owner,
    ticked: { label: "Closed", query: "status=open,closed", urlWord: "closed" },
  },
  {
    name: "f(x)",
    route: "/ethereum/fx",
    api: "/api/fx/positions",
    rows: 'a[href^="/ethereum/fx/"]:not([href$="/pools"]):not([href$="/info"])',
    perPage: 20,
    open: "status=open",
    all: "status=open,closed,liquidated",
    ended: ["closed", "liquidated"],
    holderParam: "owner",
    holder: (r) => r.owner,
    // A bare number names that position in BOTH pools — the index fans it out,
    // as Polaris's markets do — so the count is read from the index, not assumed
    // to be one row.
    id: { what: "position number", of: (r) => r.positionId, query: (v) => `positionId=${v}` },
    ticked: { label: "Closed", query: "status=open,closed", urlWord: "closed" },
    note: "f(x) parses the same search box twice (parseFxQuery in the registry, parseFxSearch for the identity test). Known, and left alone by the sweep.",
  },
  {
    name: "LlamaLend",
    route: "/ethereum/llamalend",
    api: "/api/llamalend/positions",
    rows: 'a[href^="/ethereum/llamalend/0x"]',
    perPage: 20,
    open: "status=open",
    all: "status=open,closed,liquidated",
    ended: ["closed", "liquidated"],
    holderParam: "user",
    holder: (r) => r.user,
    ticked: { label: "Closed", query: "status=open,closed", urlWord: "closed" },
  },
  {
    name: "MakerDAO",
    route: "/ethereum/makerdao",
    api: "/api/makerdao/vaults",
    // A row links by vault number or by owner depending on what the card leads
    // with, so the row set is "everything under the route that is not one of
    // the two page links".
    rows: 'a[href^="/ethereum/makerdao/"]:not([href$="/system"]):not([href$="/info"])',
    perPage: 20,
    open: "status=open",
    all: "status=open,closed,liquidated",
    ended: ["closed", "liquidated"],
    holderParam: "owner",
    holder: (r) => r.owner,
    id: { what: "vault number", of: (r) => r.cdpId, query: (v) => `cdpId=${v}` },
    ticked: { label: "Closed", query: "status=open,closed", urlWord: "closed" },
    note: "MakerDAO parses the same search box twice (makerSearchTarget in the registry, parseMakerSearch for the identity test). Known, and left alone by the sweep.",
  },
  {
    name: "Maple",
    route: "/ethereum/maple",
    api: "/api/maple/positions",
    rows: 'a[href^="/ethereum/maple/0x"]',
    perPage: 20,
    open: "status=open",
    all: "status=open,closed",
    ended: ["closed"],
    holderParam: "wallet",
    holder: (r) => r.wallet,
    // Two buckets again: ticking Closed is the whole lifecycle, so no param.
    ticked: { label: "Closed", query: "", urlWord: "closed" },
  },
  {
    name: "Moonwell",
    route: "/ethereum/moonwell",
    api: "/api/moonwell/positions",
    rows: 'a[href^="/ethereum/moonwell/0x"]',
    perPage: 20,
    open: "status=open",
    all: "status=open,closed,liquidated",
    ended: ["closed", "liquidated"],
    holderParam: "wallet",
    holder: (r) => r.wallet,
    ticked: { label: "Closed", query: "status=open,closed", urlWord: "closed" },
  },
  {
    // IN BY INHERITANCE, and the one the rails-ops entry asked to confirm: the
    // Base registry maps over Ethereum's dimensions and
    // `MOONWELL_BASE_LIST_DEFAULTS` spreads `MOONWELL_LIST_DEFAULTS`, so the
    // rule lands through Moonwell with no modules of its own.
    name: "Moonwell Base",
    route: "/base/moonwell",
    api: "/api/moonwell-base/positions",
    rows: 'a[href^="/base/moonwell/0x"]',
    perPage: 20,
    open: "status=open",
    all: "status=open,closed,liquidated",
    ended: ["closed", "liquidated"],
    holderParam: "wallet",
    holder: (r) => r.wallet,
    ticked: { label: "Closed", query: "status=open,closed", urlWord: "closed" },
  },
  {
    name: "Morpho Blue",
    route: "/ethereum/morpho",
    api: "/api/morpho/positions",
    rows: 'a[href^="/ethereum/morpho/"]:not([href^="/ethereum/morpho/markets"]):not([href$="/info"])',
    perPage: 20,
    open: "status=open",
    all: "status=open,closed,liquidated",
    ended: ["closed", "liquidated"],
    holderParam: "user",
    holder: (r) => r.owner,
    notIdentity: { what: "market id", pick: pickMarketFixture },
    ticked: { label: "Closed", query: "status=open,closed", urlWord: "closed" },
  },
  {
    name: "Morpho Base",
    route: "/base/morpho",
    api: "/api/morpho-base/positions",
    rows: 'a[href^="/base/morpho/0x"]',
    perPage: 20,
    open: "status=open",
    all: "status=open,closed,liquidated",
    ended: ["closed", "liquidated"],
    holderParam: "user",
    holder: (r) => r.owner,
    notIdentity: { what: "market id", pick: pickMarketFixture },
    ticked: { label: "Closed", query: "status=open,closed", urlWord: "closed" },
  },
  {
    name: "SparkLend",
    route: "/ethereum/spark",
    api: "/api/spark/positions",
    rows: 'a[href^="/ethereum/spark/0x"]',
    perPage: 20,
    open: "status=open",
    all: "status=open,closed,liquidated",
    ended: ["closed", "liquidated"],
    holderParam: "wallet",
    holder: (r) => r.wallet,
    ticked: { label: "Closed", query: "status=open,closed", urlWord: "closed" },
  },
];

for (const spec of ROSTER) {
  if (!wants(spec.name)) continue;
  console.log(`\n── ${spec.name}  ${spec.route} ──────────────────────────────`);
  await runRestingViewSection(spec);
}

// ═══════════════════════════════════════════════════════════════════════════
// PWN  —  /ethereum/pwn
// ═══════════════════════════════════════════════════════════════════════════
// The only non-fork explorer on the IN-MEMORY tier (`memoryStrategy`): the page
// holds every loan and `applyListFilter` does the work, so there is no paged
// index answer to compare against and no pagination strip — the rendered rows
// ARE the result set, and the expected count is arithmetic over the index's own
// rows.
//
// What this section has to catch is a shared-driver regression, not a registry
// one. `applyListFilter` used to treat a selection EQUAL TO `defaultValues` as
// no constraint at all, so PWN's contextual default of ["open"] would have been
// silently ignored and the directory would have kept showing every loan.
// lib/shared/list-filter.ts now treats only an EMPTY selection as inactive.
// Check 1 below is what fails if that line is reverted: PWN's index carries 35
// loans and one of them is open, so the two views are a page apart.
//
// Vocabulary: PWN's buckets are open / repaid / defaulted, and both terminal
// ones draw the shared CLOSED badge with the outcome word in its own column.
if (wants("PWN")) {
  const ROWS = 'a[href^="/ethereum/pwn/0x"]';
  // The memory tier draws no pagination strip (the driver only builds one for
  // the server tier), so every matching row renders and the rendered count is
  // always the total — `readTotal` is told the page is unbounded.
  const PER_PAGE = Number.MAX_SAFE_INTEGER;
  const label = (s) => `PWN ${s}`;
  const ENDED = new Set(["repaid", "defaulted"]);

  /** Every loan the index has, read whole — the memory tier's own input. */
  const allLoans = async () => rowsOf(await api("/api/pwn/positions?limit=500"));

  const before = await allLoans();
  const openBefore = before.filter((r) => r.status === "open").length;
  info(label("fixtures"), `index: ${openBefore} open of ${before.length} loans`);
  check(
    label("0. the index's open set is smaller than its whole set"),
    before.length > openBefore && openBefore >= 0,
    `${openBefore} open vs ${before.length} loans — check 1 is vacuous unless these differ`,
  );

  // ── 1-4. the bare directory ──────────────────────────────────────────────
  const bare = await openListing(context, `${BASE}/ethereum/pwn`);
  await waitForRows(bare, ROWS);
  const bareSearchOnLoad = await bare.evaluate(() => window.location.search);
  const bareTotal = await readTotal(bare, ROWS, PER_PAGE);
  const barePills = await readPills(bare, ROWS);
  const bareChips = await readChips(bare);
  const openAfter = (await allLoans()).filter((r) => r.status === "open").length;

  check(
    label("1. the bare directory renders the index's open loans and no others"),
    withinIndex(bareTotal.total, openBefore, openAfter),
    `page ${bareTotal.total} (${bareTotal.from}) vs index ${openBefore}→${openAfter} open, ${before.length} loans in all`,
  );
  check(
    label("2. every card on the bare directory is still open"),
    barePills.length > 0 && barePills.every((p) => p != null && OPEN_PILLS_ROSTER.has(p)),
    `${barePills.length} rows: ${[...new Set(barePills)].join(", ") || "none"}`,
  );
  check(
    label("3. the bare directory draws no Status chip and no Reset"),
    bareChips.statusChip == null && !bareChips.reset,
    bareChips.statusChip ?? (bareChips.reset ? "Reset drawn" : "neither"),
  );
  check(
    label("4. the bare directory's URL carries no status param"),
    bareSearchOnLoad === "",
    `location.search "${bareSearchOnLoad}"`,
  );

  // ── 5. a party's address relaxes the view ────────────────────────────────
  // PWN's search is the in-memory predicate over loan id / lender / borrower
  // (PWN_APPLY.search), so the expected row set is that predicate over the
  // index's own rows — the same arithmetic, done here rather than read off the
  // page under test.
  const matches = (rows, q) =>
    rows.filter(
      (r) =>
        r.loanId.toLowerCase().includes(q) ||
        (r.lender?.toLowerCase().includes(q) ?? false) ||
        (r.borrower?.toLowerCase().includes(q) ?? false),
    );
  const party = before.find((r) => ENDED.has(r.status) && (r.borrower ?? r.lender));
  if (party) {
    const addr = (party.borrower ?? party.lender).toLowerCase();
    const theirs = matches(before, addr);
    const theirEnded = theirs.filter((r) => ENDED.has(r.status)).length;
    info(label("fixtures"), `party ${addr} is on ${theirs.length} loan(s), ${theirEnded} of them settled`);
    await search(bare, addr, ROWS);
    const searchUrl = await bare.evaluate(() => window.location.search);
    const searchPills = await readPills(bare, ROWS);
    const searchChips = await readChips(bare);
    info(label("5. after typing the party"), `location.search "${searchUrl}"`);
    check(
      label("5a. the party's settled loan renders"),
      searchPills.filter((p) => ENDED_PILLS_ROSTER.has(p)).length === theirEnded && theirEnded > 0,
      `${searchPills.filter((p) => ENDED_PILLS_ROSTER.has(p)).length} settled of ${searchPills.length} rows vs index ${theirEnded}`,
    );
    check(
      label("5b. the party's row count is every loan they are on"),
      searchPills.length === theirs.length,
      `page ${searchPills.length} vs index ${theirs.length}`,
    );
    check(
      label("5c. relaxing on a search selects nothing — still no chip, no Reset"),
      searchChips.statusChip == null && !searchChips.reset,
      searchChips.statusChip ?? (searchChips.reset ? "Reset drawn" : "neither"),
    );
  } else {
    check(label("5. party fixture"), false, "no settled loan with a named party in the index's answer");
  }
  await bare.close();

  // ── 5d-f. a loan number relaxes it too ──────────────────────────────────
  const settled = before.find((r) => ENDED.has(r.status));
  if (settled) {
    // The in-memory predicate is a SUBSTRING match on the loan id, so "3" finds
    // 3, 13, 30…39 — the expected set is that same predicate, not one row.
    const expected = matches(before, settled.loanId.toLowerCase());
    const byId = await openListing(context, `${BASE}/ethereum/pwn?q=${settled.loanId}`);
    const idPills = await readPills(byId, ROWS);
    const idChips = await readChips(byId);
    info(label("5d. id fixtures"), `loan #${settled.loanId} → ${expected.length} loan(s) match that string`);
    check(
      label("5d. a loan-number search answers the index's own row set"),
      idPills.length === expected.length && expected.length > 0,
      `${idPills.length} row(s) rendered vs index ${expected.length}`,
    );
    check(
      label("5e. the settled loan of that number renders, settled"),
      idPills.some((p) => ENDED_PILLS_ROSTER.has(p)),
      [...new Set(idPills)].join(", ") || "none",
    );
    check(
      label("5f. the id search draws no chip either"),
      idChips.statusChip == null && !idChips.reset,
      idChips.statusChip ?? (idChips.reset ? "Reset drawn" : "neither"),
    );
    await byId.close();
  } else {
    check(label("5d. loan-number fixture"), false, "no settled loan in the index's answer");
  }

  // ── 6. ticking Repaid is a real selection ────────────────────────────────
  const picked = await openListing(context, `${BASE}/ethereum/pwn`);
  await waitForRows(picked, ROWS);
  const restingRows = await readTotal(picked, ROWS, PER_PAGE);
  await tickStatus(picked, "Repaid");
  await waitForTotalChange(picked, ROWS, PER_PAGE, restingRows.total);
  const pickedUrl = await picked.evaluate(() => window.location.search);
  const pickedChips = await readChips(picked);
  const pickedPills = await readPills(picked, ROWS);
  const now = await allLoans();
  const expectOpenRepaid = now.filter((r) => r.status === "open" || r.status === "repaid").length;
  check(
    label("6a. ticking Repaid draws a Status chip"),
    pickedChips.statusChip != null && pickedChips.reset,
    `${pickedChips.statusChip ?? "no chip"}${pickedChips.reset ? " + Reset" : " + no Reset"}`,
  );
  check(
    label("6b. ticking Repaid writes the status param"),
    /(^|[?&])status=/.test(pickedUrl) && pickedUrl.includes("repaid"),
    `location.search "${pickedUrl}"`,
  );
  check(
    label("6c. the ticked view is the open loans plus the repaid ones"),
    pickedPills.length === expectOpenRepaid,
    `page ${pickedPills.length} vs index ${expectOpenRepaid} (open + repaid) of ${now.length} loans`,
  );

  await picked.getByRole("button", { name: "Remove Status filter" }).first().click();
  await waitForTotalChange(picked, ROWS, PER_PAGE, pickedPills.length);
  const clearedUrl = await picked.evaluate(() => window.location.search);
  const clearedChips = await readChips(picked);
  const clearedPills = await readPills(picked, ROWS);
  check(
    label("6d. removing the chip returns to the clean URL"),
    !/(^|[?&])status=/.test(clearedUrl),
    `location.search "${clearedUrl}"`,
  );
  check(
    label("6e. removing the chip returns to the open resting set"),
    clearedChips.statusChip == null &&
      withinIndex(clearedPills.length, openAfter, now.filter((r) => r.status === "open").length),
    `${clearedChips.statusChip ?? "no chip"}, page ${clearedPills.length} rows vs index ${openAfter} open`,
  );
  await picked.close();
}

await context.close();
await browser.close();

console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — the resting view is open-only on a bare directory, everything on a search`,
);
process.exit(failures ? 1 : 0);
