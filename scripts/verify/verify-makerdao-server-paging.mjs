#!/usr/bin/env node
//
// verify-makerdao-server-paging — the MakerDAO listing pages against the index,
// and its Collateral type facet offers every collateral type the index holds.
//
// What this is checking, and why the checks are shaped this way.
//
// The listing used to fetch 500 of 31,750 vaults ordered by collateral USD and
// filter them in the browser. That slice reached exactly 13 of the index's 42
// collateral types, so 29 of them — USDC-A's 1,291 vaults, BAT-A's 745, LINK-A's
// 531 — could not be filtered to, searched for, or reached by any route on the
// page. The listing said nothing about it.
//
// So the load-bearing assertions are the ones about collateral types the OLD
// tier could not reach (SLICE_13 below is the exact list it could). A check that
// only confirmed ETH-A works would pass just as happily on the build this
// replaces.
//
// Counts come from a live index that grows, so nothing here pins one. Every
// figure is either an invariant (the ilk buckets sum to the total; a picked ilk
// returns exactly the count its own menu row claims) or a floor.
//
//   BASE=http://localhost:3000 node scripts/verify/verify-makerdao-server-paging.mjs

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const LIST = "/ethereum/makerdao";

/** Its vault count on 2026-08-28. The index only grows, so this is a floor. */
const FLOOR = 31750;
/** Collateral types the index holds. */
const ILK_COUNT = 42;

/** The 13 the retired 500-row slice could reach — every other collateral type
 *  was unreachable from this page by any means. */
const SLICE_13 = [
  "ETH-A",
  "ETH-B",
  "ETH-C",
  "LSEV2-SKY-A",
  "MATIC-A",
  "RENBTC-A",
  "RETH-A",
  "UNI-A",
  "WBTC-A",
  "WBTC-B",
  "WBTC-C",
  "WSTETH-A",
  "WSTETH-B",
];

/** Four the slice could NOT reach, spanning the range: the biggest of them
 *  (1,291 vaults) down to the smallest ilk in the index (1). */
const UNREACHABLE = ["USDC-A", "BAT-A", "GNO-A", "UNIV2DAIUSDT-A"];

/** A GNO-A vault's urn. No urn in the index is any vault's owner, so searching
 *  one exercises the owner→urn retry with an unambiguous answer. */
const GNO_URN = "0x454a6608385df9032ceeb78d6df8bd4cbab37110";
/** The owner holding the most vaults. */
const BIG_OWNER = "0xc679857761bee860f5ec4b3368dfe9752580b096";

let pass = 0;
let fail = 0;
const ok = (name, extra = "") => {
  pass++;
  console.log(`PASS  ${name}${extra ? " — " + extra : ""}`);
};
const bad = (name, extra = "") => {
  fail++;
  console.log(`FAIL  ${name}${extra ? " — " + extra : ""}`);
};
const check = (cond, name, extra = "") => (cond ? ok(name, extra) : bad(name, extra));

const errors = [];

/** Rows currently rendered in the listing column. */
const rowCount = (page) => page.locator('a[class*="listing-row"]').count();

/** The "Showing 1-20 of 31750 vaults" line. Null when a single page of results
 *  renders no pagination at all — then count the rows instead. */
async function total(page) {
  const el = page.locator("text=/Showing \\d+-\\d+ of \\d+ vaults/").first();
  if ((await el.count()) === 0) return null;
  const m = (await el.innerText()).match(/of (\d+) vaults/);
  return m ? Number(m[1]) : null;
}

/** Open a filter group's panel by its button label. */
async function openGroup(page, label) {
  await page.locator(`button:has-text("${label}")`).first().click();
  await page.locator(".overlay-panel").first().waitFor({ state: "visible", timeout: 5000 });
}

const closePanel = (page) => page.mouse.click(4, 4);

/** Every option row in the open panel, as { label, meta }. */
async function panelOptions(page) {
  return page.locator('.overlay-panel [role="menuitemcheckbox"]').evaluateAll((els) =>
    els.map((el) => {
      const spans = [...el.querySelectorAll("span")];
      const label = spans.find((s) => s.className.includes("flex-1"))?.textContent?.trim() ?? "";
      const meta = spans.find((s) => s.className.includes("tabular-nums"))?.textContent?.trim() ?? "";
      return { label, meta };
    }),
  );
}

/** Wait until the rendered row set stops matching `before` (a refetch landed). */
async function settled(page, before) {
  await page
    .waitForFunction(
      (prev) => {
        const hrefs = [...document.querySelectorAll('a[class*="listing-row"]')].map((a) => a.getAttribute("href"));
        const empty = document.body.innerText.includes("No vaults match these filters.");
        return empty || (hrefs.length > 0 && hrefs.join("|") !== prev);
      },
      before,
      { timeout: 20000 },
    )
    .catch(() => {});
}

const hrefs = (page) =>
  page.locator('a[class*="listing-row"]').evaluateAll((els) => els.map((a) => a.getAttribute("href")).join("|"));

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  page.on("pageerror", (e) => errors.push(String(e)));

  // ---- 1. the page pages ---------------------------------------------------
  await page.goto(BASE + LIST, { waitUntil: "networkidle" });
  await page.locator('a[class*="listing-row"]').first().waitFor({ timeout: 20000 });

  const n = await rowCount(page);
  check(n === 20, "listing: one page of 20 rows, not a 500-row dump", `${n} rows`);

  const t = await total(page);
  check(t != null && t >= FLOOR, "listing: the whole index is counted", `${t} vaults, floor ${FLOOR}`);

  // ---- 2. the collateral facet offers the whole roster ---------------------
  await openGroup(page, "Collateral");
  const opts = await panelOptions(page);
  const labels = opts.map((o) => o.label);
  check(
    labels.length === ILK_COUNT,
    "facet: every collateral type in the index is offered",
    `${labels.length} of ${ILK_COUNT}`,
  );

  const missingOld = SLICE_13.filter((i) => !labels.includes(i));
  check(
    missingOld.length === 0,
    "facet: it still offers the 13 the old slice reached",
    missingOld.join(",") || "all 13",
  );

  const missingNew = UNREACHABLE.filter((i) => !labels.includes(i));
  check(
    missingNew.length === 0,
    "facet: and the ones the old slice could NOT reach at all",
    missingNew.length ? `missing ${missingNew.join(",")}` : UNREACHABLE.join(", "),
  );

  // Buckets account for every vault: the menu's own counts sum to the total.
  const sum = opts.reduce((acc, o) => acc + Number(o.meta.replace(/,/g, "")), 0);
  check(t != null && sum === t, "facet: the counts account for every vault", `${sum} bucketed vs ${t}`);

  // The rare ilk's own claimed count, to hold the pick to.
  const gnoMeta = Number((opts.find((o) => o.label === "GNO-A")?.meta ?? "0").replace(/,/g, ""));
  check(gnoMeta > 0, "facet: GNO-A states a count", `${gnoMeta}`);

  // ---- 3. picking one the old tier could not reach -------------------------
  let before = await hrefs(page);
  await page.locator('.overlay-panel [role="menuitemcheckbox"]:has-text("GNO-A")').first().click();
  await closePanel(page);
  await settled(page, before);

  check(page.url().includes("ilk=GNO-A"), "pick: the selection is in the URL", page.url().split("?")[1] ?? "");
  const gnoRows = await rowCount(page);
  check(gnoRows === gnoMeta, "pick: GNO-A returns exactly the count its menu row claims", `${gnoRows} of ${gnoMeta}`);

  // ---- 4. paging ----------------------------------------------------------
  await page.goto(BASE + LIST, { waitUntil: "networkidle" });
  await page.locator('a[class*="listing-row"]').first().waitFor({ timeout: 20000 });
  const page1 = await hrefs(page);
  await page.locator('button[aria-label="Go to next page"]').first().click();
  await settled(page, page1);
  const page2 = await hrefs(page);
  check(page.url().includes("page=2"), "paging: page 2 is in the URL");
  check(page2 !== page1 && page2.length > 0, "paging: page 2 is a different slice");
  const overlap = page2.split("|").filter((h) => page1.split("|").includes(h));
  check(overlap.length === 0, "paging: the two slices do not overlap", `${overlap.length} shared rows`);

  // ---- 5. the Debt sort means DAI ----------------------------------------
  // rails-server falls back to its default column for a sortBy it doesn't
  // recognise, so a mis-mapped key sorts by collateral and looks fine. Compare
  // the page's rows against the backend column the label claims: art x the
  // ilk's live rate, the DAI owed — NOT the raw normalized art, which orders
  // differently across ilks (a high-rate ETH-A vault outranks a larger-art
  // ETH-C one).
  await page.goto(`${BASE}${LIST}?sortBy=debt`, { waitUntil: "networkidle" });
  await page.locator('a[class*="listing-row"]').first().waitFor({ timeout: 20000 });
  const sorted = (await hrefs(page)).split("|");
  const api = await fetch(`${BASE}/api/makerdao/vaults?sortBy=debtDai&sortOrder=desc&limit=20`).then((r) => r.json());
  const expected = api.data.map((v) => `${LIST}/${v.cdpId ?? v.urn}`);
  check(
    sorted.join("|") === expected.join("|"),
    "sort: Debt orders by the DAI owed, not the raw art",
    sorted[0] === expected[0] ? "row order matches" : `${sorted[0]} vs ${expected[0]}`,
  );
  const byArt = await fetch(`${BASE}/api/makerdao/vaults?sortBy=debt&sortOrder=desc&limit=20`).then((r) => r.json());
  check(
    byArt.data.map((v) => v.urn).join("|") !== api.data.map((v) => v.urn).join("|"),
    "sort: the two debt columns really do differ, so the check above bites",
  );

  // ---- 6. search: owner, urn, name ----------------------------------------
  await page.goto(`${BASE}${LIST}?q=${BIG_OWNER}`, { waitUntil: "networkidle" });
  await page.locator('a[class*="listing-row"]').first().waitFor({ timeout: 20000 });
  const ownerTotal = await total(page);
  check(ownerTotal != null && ownerTotal > 20, "search: a wallet resolves to its vaults", `${ownerTotal} vaults`);

  // The owner→urn retry: this address owns nothing, but IS a vault.
  await page.goto(`${BASE}${LIST}?q=${GNO_URN}`, { waitUntil: "networkidle" });
  await page.locator('a[class*="listing-row"]').first().waitFor({ timeout: 20000 });
  const urnRows = await rowCount(page);
  check(urnRows === 1, "search: a urn resolves through the owner→urn retry", `${urnRows} row`);

  // A typed name reaches every vault of every collateral type it names — both
  // wstETH ilks, not whichever one the old slice happened to carry.
  await page.goto(`${BASE}${LIST}?q=wsteth`, { waitUntil: "networkidle" });
  await page.locator('a[class*="listing-row"]').first().waitFor({ timeout: 20000 });
  const wstethTotal = await total(page);
  const wstethExpected =
    Number((opts.find((o) => o.label === "WSTETH-A")?.meta ?? "0").replace(/,/g, "")) +
    Number((opts.find((o) => o.label === "WSTETH-B")?.meta ?? "0").replace(/,/g, ""));
  check(
    wstethTotal === wstethExpected,
    "search: a typed name reaches BOTH matching collateral types",
    `${wstethTotal} vs ${wstethExpected} (A+B)`,
  );

  // A name nothing carries is answered as nothing — never as the whole index.
  await page.goto(`${BASE}${LIST}?q=notacollateraltype`, { waitUntil: "networkidle" });
  await page.locator("text=No vaults match these filters.").waitFor({ timeout: 20000 });
  const emptyRows = await rowCount(page);
  check(emptyRows === 0, "search: an unmatched name is empty, not unfiltered", `${emptyRows} rows`);

  check(errors.length === 0, "no page errors", errors.slice(0, 3).join(" | "));

  await browser.close();
  console.log(fail === 0 ? "ALL PASS" : `${fail} FAILED (${pass} passed)`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
