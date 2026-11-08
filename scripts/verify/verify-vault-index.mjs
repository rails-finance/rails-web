#!/usr/bin/env node
// The cross-protocol vault index — /vaults (rails-ops ui-jobs 39; decision
// 0028 point 8) — checked against the rosters it is the union of.
// ----------------------------------------------------------------------------
// EVERY EXPECTED COUNT IS A ROSTER'S OWN STATEMENT OR THIS SCRIPT'S OWN PARSE:
// Morpho's, Aave's and Yearn's roster pages each state their vault count in
// their census sentence, and Maple's pools are parsed out of
// lib/maple/asset-catalog.ts. The index's figures are then held to the roster
// pages' figures for the same vault at the same block.
//
// Run:
//   BASE=http://localhost:3033 node scripts/verify/verify-vault-index.mjs
// Needs nothing from .env.local: the server makes every read.
//
// ── WHAT EACH SECTION ASSERTS ─────────────────────────────────────────
// A ROSTER IS A PROTOCOL ON A CHAIN (ui-jobs 486): Morpho has two, MetaMorpho on
// Base and on Ethereum, keyed `morpho:8453` and `morpho:1` (the index's
// `data-index-key`, a row's `data-protocol` and `data-chain`).
//
//   0  /vaults answers 200 and names a block for each of the five rosters
//   1  each roster's count, as its page states it (Maple: the catalogue),
//      equals the index's count for it, and the index's rows per protocol
//      (funded + empty + unread) equal it; the sum equals the union
//   2  the Protocol facet narrows the rows to each protocol's count, every
//      row shown that protocol's, and Reset restores them
//   3  the Network facet narrows to Base: exactly Morpho on Base's rows
//   4  every row's lead zone (D5) names its protocol and its chain
//   5  a Maple row shows the Yield slot's "no daily series yet" state
//   6  four rows' Total assets (each Morpho, Aave, Yearn, the largest each) equal
//      the protocol roster's raw figure for the same vault at the same block
//   7  every row links under its protocol, to a vault its roster lists; two
//      links per protocol answer 200
//   8  the rosters' heads link the index
//   9  the index draws no receipt and offers no provenance inspector (ui-jobs 538)
//  10  the default view (ui-jobs 485): the preset's rows against ?show=all,
//      its chip, the counts line, its removal and Reset, and the table's
//      sorts (ui-jobs 538: Holders by default, Total assets within each token)
//  11  ?asset=ETH,WETH keeps the preset; a token it would empty lifts it
// Sections 0 to 9 read /vaults?show=all and the rosters' ?show=all pages.

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkRosterView, presetKeeps, readRosterRows } from "./lib/vault-roster-view.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = process.env.BASE ?? "http://localhost:3033";

let failures = 0;
let passes = 0;
let skipped = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (cond) passes++;
  else failures++;
};
const skip = (name, why) => {
  console.log(`SKIP  ${name} — ${why}`);
  skipped++;
};

const PROTOCOLS = ["morpho", "aave", "yearn", "maple"];
/** The rosters, by `protocol:chain`; `sidebar` is the roster entry the lead zone (D5) draws. */
const ROSTER = {
  "morpho:8453": {
    protocol: "morpho",
    href: "/base/morpho/vaults",
    figure: "directory-census",
    prefix: "/base/morpho/vaults/",
    chain: "8453",
    sidebar: "morpho-base",
  },
  "morpho:1": {
    protocol: "morpho",
    href: "/ethereum/morpho/vaults",
    figure: "directory-census",
    prefix: "/ethereum/morpho/vaults/",
    chain: "1",
    sidebar: "morpho",
  },
  "aave:1": {
    protocol: "aave",
    href: "/ethereum/aave/vaults",
    figure: "directory-catalogue",
    prefix: "/ethereum/aave/vaults/",
    chain: "1",
    sidebar: "aave-vaults",
  },
  "yearn:1": {
    protocol: "yearn",
    href: "/ethereum/yearn/vaults",
    figure: "roster-census",
    prefix: "/ethereum/yearn/vaults/",
    chain: "1",
    sidebar: "yearn",
  },
  "maple:1": {
    protocol: "maple",
    href: "/ethereum/maple/pools",
    figure: null,
    prefix: "/ethereum/maple/pools",
    chain: "1",
    sidebar: "maple",
  },
};
const KEYS = Object.keys(ROSTER);
const keyOf = (r) => `${r.protocol}:${r.chain}`;
const LABEL = { morpho: "Morpho", aave: "Aave", yearn: "Yearn", maple: "Maple" };

const strip = (html) =>
  html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;|&rsquo;/g, "’")
    .replace(/&amp;/g, "&");

async function get(pathname) {
  const res = await fetch(`${BASE}${pathname}`, { signal: AbortSignal.timeout(300_000) });
  return { status: res.status, html: await res.text() };
}

/** The text of the element carrying `data-figure="<figure>"`. */
function figureText(html, figure) {
  const i = html.indexOf(`data-figure="${figure}"`);
  if (i < 0) return null;
  const open = html.lastIndexOf("<", i);
  const tag = html.slice(open + 1).match(/^(\w+)/)[1];
  let depth = 0;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "g");
  re.lastIndex = open;
  let m;
  while ((m = re.exec(html))) {
    if (m[1] === "/") depth--;
    else if (!m[0].endsWith("/>")) depth++;
    if (depth === 0) return strip(html.slice(open, m.index));
  }
  return null;
}

/** A roster page's rows: address → raw total assets, and the block it names. */
function rosterRows(html) {
  const rows = new Map();
  for (const m of html.matchAll(/data-vault-row="(0x[0-9a-f]{40})"[^>]*?data-total-assets-raw="(\d*)"/g))
    rows.set(m[1], m[2]);
  const block = html.match(/data-directory-block="(\d+)"/)?.[1] ?? null;
  return { rows, block: block ? Number(block) : null };
}

// ── the rosters, as their pages state them ─────────────────────────────────
const rosterPages = {};
const expected = {};
for (const k of KEYS) {
  // Every row of the roster (ui-jobs 485: the default view is the preset).
  const r = await get(`${ROSTER[k].href}?show=all`);
  rosterPages[k] = { status: r.status, html: r.html, ...rosterRows(r.html) };
  if (ROSTER[k].figure) {
    const text = figureText(r.html, ROSTER[k].figure) ?? "";
    const m = text.match(/([\d,]+) vaults/);
    expected[k] = m ? Number(m[1].replace(/,/g, "")) : null;
  }
}
{
  const src = fs.readFileSync(path.join(ROOT, "lib/maple/asset-catalog.ts"), "utf8");
  const body = src.slice(src.indexOf("export const MAPLE_POOLS"), src.indexOf("/** Pool key → catalog entry"));
  expected["maple:1"] = (body.match(/^\s+key: "/gm) || []).length;
}
console.log(`rosters state: ${KEYS.map((k) => `${k} ${expected[k]}`).join(", ")}`);
/** A protocol's rows across its rosters. */
const expectedOf = (p) => KEYS.filter((k) => ROSTER[k].protocol === p).reduce((a, k) => a + (expected[k] ?? 0), 0);

// ── 0: the route ────────────────────────────────────────────────────────────
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
// ui-jobs 485: every row; section 10 checks the default view against it.
const res = await page.goto(`${BASE}/vaults?show=all`, { waitUntil: "networkidle", timeout: 300_000 });
check("0a /vaults answers 200", res?.status() === 200, String(res?.status()));
await page.waitForSelector("[data-vault-index] [data-vault-row]", { timeout: 120_000 });
const blocks = await page
  .locator("[data-index-key]")
  .evaluateAll((els) =>
    Object.fromEntries(
      els.map((el) => [
        el.getAttribute("data-index-key"),
        { block: Number(el.getAttribute("data-index-block")), chain: el.getAttribute("data-index-chain") },
      ]),
    ),
  );
check(
  "0b the index names a block for each roster",
  KEYS.every((k) => blocks[k]?.block > 0),
  KEYS.map((k) => `${k} ${blocks[k]?.block ?? "none"}`).join(", "),
);

// ── 1: the counts ───────────────────────────────────────────────────────────
const counts = await page
  .locator("[data-index-key]")
  .evaluateAll((els) =>
    Object.fromEntries(els.map((el) => [el.getAttribute("data-index-key"), Number(el.getAttribute("data-count"))])),
  );
const union = Number(await page.locator("[data-index-counts]").getAttribute("data-index-counts"));
const emptyToggle = page.locator("[data-vault-index] [data-empty-group] > button");
const openEmpty = async () => {
  if ((await emptyToggle.count()) > 0 && (await emptyToggle.getAttribute("aria-expanded")) !== "true") {
    await emptyToggle.click();
    await page.waitForTimeout(300);
  }
};
await openEmpty();
const readRows = () =>
  page.locator("[data-vault-index] [data-vault-row]").evaluateAll((els) =>
    els.map((el) => ({
      address: el.getAttribute("data-vault-row"),
      protocol: el.getAttribute("data-protocol"),
      chain: el.getAttribute("data-chain"),
      group: el.getAttribute("data-group"),
      raw: el.getAttribute("data-total-assets-raw"),
      href: el.querySelector("[data-vault-link]")?.getAttribute("href") ?? el.querySelector("a")?.getAttribute("href"),
      sidebar: el.querySelector("[data-row-zone]")?.getAttribute("data-row-zone") ?? null,
      sidebarChain: el.querySelector("[data-row-zone]")?.getAttribute("data-row-zone-chain") ?? null,
      yieldNone: el.querySelector("[data-yield-none]")?.getAttribute("data-yield-none") ?? null,
      yieldText: el.querySelector("[data-yield-none]")?.textContent?.trim() ?? null,
    })),
  );
const rows = await readRows();
const byRoster = Object.fromEntries(KEYS.map((k) => [k, rows.filter((r) => keyOf(r) === k)]));
for (const k of KEYS) {
  check(
    `1a ${k}: the roster's count equals the index's count and its rows`,
    expected[k] != null && counts[k] === expected[k] && byRoster[k].length === expected[k],
    `roster ${expected[k]}, index states ${counts[k]}, index rows ${byRoster[k].length}`,
  );
}
const sum = KEYS.reduce((a, k) => a + (expected[k] ?? 0), 0);
check(
  "1b the rosters' counts sum to the union, and the index holds that many rows",
  sum === union && rows.length === union && new Set(rows.map((r) => `${r.chain}:${r.address}`)).size === union,
  `sum ${sum}, union ${union}, rows ${rows.length}`,
);

// ── 2: the Protocol facet ───────────────────────────────────────────────────
const panel = page.locator("[data-vault-index]");
const pick = async (facet, option) => {
  await panel
    .locator("button", { hasText: new RegExp(`^${facet}`) })
    .first()
    .click();
  await page.locator("[role='menuitemcheckbox']", { hasText: option }).first().click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
};
const reset = async (facet) => {
  await panel
    .locator("button", { hasText: new RegExp(`^${facet}`) })
    .first()
    .click();
  await page
    .locator("button", { hasText: /^Reset$/ })
    .first()
    .click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
};
for (const p of PROTOCOLS) {
  await pick("Protocol", LABEL[p]);
  await openEmpty();
  const shown = await readRows();
  check(
    `2a Protocol: ${LABEL[p]} narrows to its ${expectedOf(p)} rows`,
    shown.length === expectedOf(p) && shown.every((r) => r.protocol === p),
    `${shown.length} shown, ${shown.filter((r) => r.protocol !== p).length} of another protocol`,
  );
  await reset("Protocol");
}
await openEmpty();
check("2b Reset restores every row", (await readRows()).length === union);

// ── 3: the Network facet ────────────────────────────────────────────────────
await pick("Network", "Base");
await openEmpty();
{
  const shown = await readRows();
  check(
    "3  Network: Base shows exactly Morpho on Base's rows",
    shown.length === expected["morpho:8453"] && shown.every((r) => keyOf(r) === "morpho:8453"),
    `${shown.length} shown of ${expected["morpho:8453"]}`,
  );
}
await reset("Network");
await openEmpty();

// ── 4: the lead zone names each row's protocol and chain (D5) ────────────
const NAME = { 1: "Ethereum", 8453: "Base" };
const baseRow = rows.find((r) => r.chain === "8453");
const ethRow = rows.find((r) => r.chain === "1");
check(
  "4a a Base row's lead zone names Base",
  baseRow?.sidebarChain === "Base",
  `${baseRow?.address} → ${baseRow?.sidebarChain}`,
);
check(
  "4b an Ethereum row's lead zone names Ethereum",
  ethRow?.sidebarChain === "Ethereum",
  `${ethRow?.address} → ${ethRow?.sidebarChain}`,
);
const wrongSidebar = rows.filter(
  (r) => r.group !== "unread" && (r.sidebarChain !== NAME[r.chain] || r.sidebar !== ROSTER[keyOf(r)]?.sidebar),
);
check(
  "4c every drawn row's lead zone names its protocol and chain",
  wrongSidebar.length === 0,
  `${wrongSidebar.length} wrong`,
);

// ── 5: Maple's Yield slot ───────────────────────────────────────────────────
{
  const maple = byRoster["maple:1"].filter((r) => r.group === "funded");
  check(
    "5  a Maple row shows the no-series state",
    maple.length > 0 && maple.every((r) => r.yieldNone === "no-series" && r.yieldText === "no daily series yet"),
    maple.map((r) => `${r.address.slice(0, 8)} ${r.yieldNone}`).join(", "),
  );
}

// ── 6: Total assets against the protocol roster ─────────────────────────────
for (const k of KEYS.filter((k) => ROSTER[k].protocol !== "maple")) {
  const funded = byRoster[k].filter((r) => r.group === "funded");
  const top = funded.sort((a, b) => (BigInt(b.raw) > BigInt(a.raw) ? 1 : -1))[0];
  const roster = rosterPages[k];
  if (!top) {
    check(`6  ${k}: a funded row to compare`, false, "none");
    continue;
  }
  if (roster.block !== blocks[k].block) {
    skip(
      `6  ${k}: Total assets against the roster`,
      `the roster read block ${roster.block}, the index ${blocks[k].block} (a cache boundary between the two loads)`,
    );
    continue;
  }
  check(
    `6  ${k}: ${top.address.slice(0, 10)} Total assets equals the roster's at block ${roster.block}`,
    roster.rows.get(top.address) === top.raw,
    `index ${top.raw}, roster ${roster.rows.get(top.address)}`,
  );
}

// ── 7: the links ────────────────────────────────────────────────────────────
{
  const bad = rows.filter((r) => {
    const R = ROSTER[keyOf(r)];
    if (!R) return true;
    if (!r.href) return true;
    if (r.protocol === "maple") return r.href !== R.prefix;
    return r.href !== `${R.prefix}${r.address}`;
  });
  check("7a every row links to its vault under its protocol", bad.length === 0, `${bad.length} off-pattern`);
  const unlisted = rows.filter((r) => {
    if (r.protocol === "maple") return false;
    const html = rosterPages[keyOf(r)]?.html ?? "";
    return !html.includes(`data-vault-row="${r.address}"`) && !html.includes(r.address);
  });
  check(
    "7b every non-Maple row is a vault its roster page lists",
    unlisted.length === 0,
    `${unlisted.length} unlisted`,
  );
  const sample = KEYS.flatMap((k) => [...new Set(byRoster[k].map((r) => r.href))].slice(0, 2));
  for (const href of sample) {
    const r = await fetch(`${BASE}${href}`, { signal: AbortSignal.timeout(300_000) });
    check(`7c ${href} answers 200`, r.status === 200, String(r.status));
  }
}

// ── 8: the rosters link the index ───────────────────────────────────────────
for (const k of KEYS) {
  const html = rosterPages[k].html;
  check(
    `8  ${ROSTER[k].href} links the index`,
    rosterPages[k].status === 200 &&
      /data-link="vault-index"[^>]*href="\/vaults"|href="\/vaults"[^>]*data-link="vault-index"/.test(html),
  );
}

// ── 9: no receipts and no inspector (ui-jobs 538) ───────────────────────
{
  const receipts = await page
    .locator("[data-vault-index] .prov-locate-box, [data-vault-index] [data-prov-covered]")
    .count();
  check("9a the index draws no receipt", receipts === 0, `${receipts} receipt spans`);
  const tools = await page.locator("button.prov-inspect-toggle, [data-prov-tripwire]").count();
  check("9b the page offers no provenance inspector", tools === 0, `${tools} inspector controls`);
}

// ── 10: the default view (ui-jobs 485) ──────────────────────────────────────
await checkRosterView({
  page,
  base: BASE,
  route: "/vaults",
  scope: "[data-vault-index]",
  check,
  tag: "10",
  table: true,
});

// ── 11: a token link keeps the preset, and lifts it where it would empty ───
{
  const open = async (q) => {
    await page.goto(`${BASE}/vaults${q}`, { waitUntil: "networkidle", timeout: 300_000 });
    await page.waitForSelector("[data-vault-index] [data-figure='shown-count']", { timeout: 120_000 });
    return {
      rows: await readRosterRows(page, "[data-vault-index]"),
      chip: await page.locator("[data-vault-index] [data-default-chip='show']").count(),
    };
  };
  const all = (await open("?asset=ETH,WETH&show=all")).rows.filter((r) => r.group === "funded");
  const kept = await open("?asset=ETH,WETH");
  const keptFunded = kept.rows.filter((r) => r.group === "funded");
  check(
    "11a ?asset=ETH,WETH keeps the preset: the WETH vaults it keeps, under the chip",
    kept.chip === 1 &&
      all.length > 0 &&
      keptFunded.length === all.filter(presetKeeps).length &&
      keptFunded.every((r) => all.some((a) => a.address === r.address) && presetKeeps(r)),
    `${keptFunded.length} of ${all.length}, chip ${kept.chip}`,
  );
  // A token every vault of which the preset hides: the link opens on all of them.
  const full = (await open("?show=all")).rows.filter((r) => r.group === "funded");
  // The table's rows by token (the Token facet's value, `data-token`).
  const bySymbol = new Map();
  for (const r of full) bySymbol.set(r.token, [...(bySymbol.get(r.token) ?? []), r.address]);
  // A symbol that did not decode is an option by address, so it is left out.
  const hidden = [...bySymbol].find(
    ([symbol, addrs]) =>
      symbol != null && !symbol.startsWith("0x") && addrs.every((a) => !presetKeeps(full.find((r) => r.address === a))),
  );
  if (!hidden) skip("11b a link whose token the preset would empty opens without it", "no such token today");
  else {
    const lifted = await open(`?asset=${encodeURIComponent(hidden[0])}`);
    const n = lifted.rows.filter((r) => r.group === "funded").length;
    check(
      "11b a link whose token the preset would empty opens without it",
      lifted.chip === 0 && n === hidden[1].length,
      `${hidden[0]}: ${n} of ${hidden[1].length} drawn, chip ${lifted.chip}`,
    );
  }
}

await browser.close();
console.log(`\n${passes} passed, ${failures} failed, ${skipped} skipped`);
process.exit(failures > 0 ? 1 : 0);
