#!/usr/bin/env node
// The protocols index — /protocols (anatomy E8; rails-ops decision 0068,
// ui-jobs 781) — checked against the roster it is built from.
// ----------------------------------------------------------------------------
// EVERY EXPECTED ROW IS THE ROSTER'S: lib/shared/protocols.ts is read as
// source for each entry's id, label, chain, type, launch flag and Vaults tab.
//
// Run:
//   BASE=http://localhost:3029 node scripts/verify/verify-protocols-index.mjs
// Needs nothing from .env.local: the server makes every read.
//
// ── WHAT EACH SECTION ASSERTS ─────────────────────────────────────────
//   0  /protocols answers 200; "Protocols" its one h1; under it, no drawer,
//      the lead naming the table and whose the categories are
//   1  a group per protocol (a version) and a line per launched explorer,
//      none for an unlaunched one; groups by name, lines in the chain order;
//      the group's first line carries the name and the roster's type as its
//      category, a later line neither, continuing the group (a dashed
//      hairline between its lines, a solid one after it)
//   2  each line is its explorer's link (D4 with E8.1); its chain one mark
//      tile, no link of its own; one line per category answers 200
//   3  Assets per line: "Any token" on a DEX or trading line; elsewhere at
//      most five marks, then "+N", the cell one link to /assets on that
//      explorer that a press reaches past the line's cover; every chain and
//      asset mark draws at 24px; no Vaults or Coverage link; each coverage
//      page still holds its explorers' ids. Aave V3's three lines are logged
//   4  ?chain= keeps the chain's lines and ?type= the category's groups, the
//      first line shown taking the name; the facets read Chain and Category;
//      the search keeps a group on its name and a line on its chain; the
//      headers do not sort; /assets's rows carry D4, its chains are 24px
//      mark tiles, its lead is body text and its first column lines up; it
//      groups an asset's chains as lines, each opening that chain's page;
//      it draws the first 60 assets, then "Show all <n>"; sBOLD's Listed-by
//      mark is its monochrome glyph
//   5  the wallet panel: "View all <n> explorers" opens /protocols?chain=1;
//      an Assets link under the chooser opens /assets
//   6  at 375 and 1280 the page has no horizontal scroll; at 375 a group on
//      /protocols and /assets is one card (its head once, a compact row per
//      chain, no per-line labels), and a coverage link's #<id> scrolls the
//      explorer's card into view

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = process.env.BASE ?? "http://localhost:3029";

let failures = 0;
let passes = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (cond) passes++;
  else failures++;
};

// ── the roster, as source ───────────────────────────────────────────────────
const src = fs.readFileSync(path.join(ROOT, "lib/shared/protocols.ts"), "utf8");
const specs = src.slice(src.indexOf("const SPECS: ProtocolSpec[] = ["), src.indexOf("export const PROTOCOLS"));
const entries = [];
for (const line of specs.split("\n")) {
  const id = line.match(/^ {4}id: "([^"]+)",$/);
  if (id) entries.push({ id: id[1], unlaunched: false, vaults: false });
  const e = entries.at(-1);
  if (!e) continue;
  const m = (re) => line.match(re)?.[1];
  e.label ??= m(/^ {4}label: "([^"]+)",$/);
  e.chainId ??= m(/^ {4}chainId: (\d+),$/) && Number(m(/^ {4}chainId: (\d+),$/));
  e.slug ??= m(/^ {4}slug: "([^"]+)",$/);
  e.type ??= m(/^ {4}type: "([^"]+)",$/);
  e.key ??= m(/^ {4}protocolKey: "([^"]+)",$/);
  if (/^ {4}unlaunched: true,$/.test(line)) e.unlaunched = true;
  if (/segment: "vaults"/.test(line)) e.vaults = true;
}
const SLUG = { 1: "ethereum", 8453: "base", 42161: "arbitrum", 11155111: "sepolia", 10: "optimism", 5042: "arc" };
const launched = entries.filter((e) => !e.unlaunched);
for (const e of entries) e.key ??= e.id;
// One row per version: its launched explorers, in the chain order.
const ORDER = [1, 8453, 42161, 11155111, 10, 5042];
const groups = new Map();
for (const e of launched) groups.set(e.key, [...(groups.get(e.key) ?? []), e]);
for (const es of groups.values()) es.sort((a, b) => ORDER.indexOf(a.chainId) - ORDER.indexOf(b.chainId));
const ANY = new Set(["dex", "trading"]);
console.log(`roster: ${entries.length} entries, ${launched.length} launched, ${groups.size} protocols`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const readLines = (p) =>
  p.locator("[data-protocol-line]").evaluateAll((els) =>
    els.map((el) => {
      const cell = el.querySelector(":scope > :first-child");
      return {
        key: el.getAttribute("data-protocol-row"),
        id: el.getAttribute("data-protocol-line"),
        type: el.getAttribute("data-protocol-type"),
        cont: el.hasAttribute("data-dt-cont"),
        anatomy: el.getAttribute("data-anatomy") ?? "",
        category: el.querySelector("[data-protocol-category]")?.textContent.trim() ?? null,
        nameShown: (() => {
          const a = el.querySelector("[data-protocol-hub]");
          return a && !a.classList.contains("sr-only") ? a.textContent.trim() : null;
        })(),
        hub: el.querySelector("[data-protocol-hub]")?.getAttribute("href") ?? null,
        chain: Number(el.querySelector("[data-protocol-chain]")?.getAttribute("data-protocol-chain") ?? 0),
        // The chain's mark is no link: the line is.
        chainLinked: !!el.querySelector("[data-protocol-chain]")?.closest("a"),
        chainMarks: el.querySelectorAll("[data-protocol-chain]").length,
        assets: el.querySelector("[data-protocol-assets]")?.getAttribute("data-protocol-assets") ?? null,
        symbols: el.querySelector("a[data-protocol-assets-link]")?.getAttribute("title") ?? "",
        marks: el.querySelectorAll("[data-protocol-asset]").length,
        more: el.querySelector("[data-protocol-assets]")?.textContent.match(/\+(\d+)/)?.[1] ?? null,
        assetsHref: el.querySelector("a[data-protocol-assets-link]")?.getAttribute("href") ?? null,
        oldLinks: el.querySelectorAll("[data-protocol-link]").length,
        // The hairline under the line, as drawn.
        rule: cell ? getComputedStyle(cell).borderBottomStyle : "",
        tiles: [...el.querySelectorAll("[data-protocol-asset], [data-protocol-chain]")].map((t) => {
          const r = t.getBoundingClientRect();
          const m = (
            t.querySelector("img, svg") ??
            t.firstElementChild?.firstElementChild ??
            t.firstElementChild
          )?.getBoundingClientRect();
          return [Math.round(r.width), Math.round(r.height), Math.round(m?.width ?? 0), Math.round(m?.height ?? 0)];
        }),
      };
    }),
  );
const route = (e) => `/${SLUG[e.chainId]}/${e.slug}`;
const byGroup = (lines) => {
  const m = new Map();
  for (const l of lines) m.set(l.key, [...(m.get(l.key) ?? []), l]);
  return m;
};

// ── 0 ─────────────────────────────────────────────────────────────────────
const res = await page.goto(`${BASE}/protocols`, { waitUntil: "networkidle", timeout: 300_000 });
check("0a /protocols answers 200", res?.status() === 200, String(res?.status()));
await page.waitForSelector("[data-protocol-line]", { timeout: 120_000 });
const h1 = await page.locator("h1").allTextContents();
check('0b "Protocols" is the one h1', h1.length === 1 && h1[0].trim() === "Protocols", h1.join(" | "));
const lead = (await page.locator("[data-protocol-index-lead]").textContent())?.trim() ?? "";
check(
  "0c no drawer; the lead names the table and the categories as Rails' classification",
  (await page.locator("#protocol-index-intro, [data-intro-drawer]").count()) === 0 &&
    /^The table below lists each protocol Rails runs an explorer for/.test(lead) &&
    lead.includes("Rails’ classification"),
  lead,
);

// ── 1 ─────────────────────────────────────────────────────────────────────
const lines = await readLines(page);
const shownGroups = byGroup(lines);
check(
  "1a a group per protocol and a line per launched explorer, none unlaunched",
  shownGroups.size === groups.size &&
    lines.length === launched.length &&
    launched.every((e) => lines.some((l) => l.id === e.id)) &&
    !entries.some((e) => e.unlaunched && lines.some((l) => l.id === e.id)),
  `${shownGroups.size} groups of ${groups.size}, ${lines.length} lines of ${launched.length}`,
);
const names = [...shownGroups.values()].map((ls) => ls[0].nameShown ?? "");
const orderWrong = [...shownGroups].filter(
  ([k, ls]) =>
    ls.map((l) => l.id).join() !==
    groups
      .get(k)
      .map((e) => e.id)
      .join(),
);
check(
  "1b groups by name, each group's lines in the chain order",
  names.every((n, i) => i === 0 || names[i - 1].localeCompare(n, "en-US") <= 0) && orderWrong.length === 0,
  orderWrong.map(([k]) => k).join(" ") || names.slice(0, 10).join(", "),
);
const firstWrong = [...shownGroups].filter(([k, ls]) => {
  const want = groups.get(k)[0];
  const [first, ...rest] = ls;
  return (
    first.cont ||
    first.nameShown !== want.label ||
    first.category == null ||
    first.type !== want.type ||
    rest.some((l) => !l.cont || l.nameShown != null || l.category != null)
  );
});
check(
  "1c the first line names the protocol and its category; later lines continue the group, blank",
  firstWrong.length === 0,
  firstWrong.map(([k]) => k).join(" "),
);
const ruleWrong = lines.filter((l, i) => {
  const next = lines[i + 1];
  if (!next) return false;
  return next.cont ? l.rule !== "dashed" : l.rule !== "solid";
});
check(
  "1d a dashed hairline between a group's lines, a solid one between groups",
  ruleWrong.length === 0 && lines.some((l) => l.rule === "dashed"),
  ruleWrong
    .map((l) => `${l.id} ${l.rule}`)
    .slice(0, 6)
    .join(" "),
);

// ── 2 ─────────────────────────────────────────────────────────────────────
const byId = Object.fromEntries(launched.map((e) => [e.id, e]));
const linkWrong = lines.filter(
  (l) => l.hub !== route(byId[l.id]) || l.chainLinked || l.chain !== byId[l.id].chainId || l.chainMarks !== 1,
);
check(
  "2a each line opens its explorer; its chain one mark tile, not a link of its own",
  linkWrong.length === 0,
  linkWrong.map((l) => l.id).join(" "),
);
check(
  "2b every line is a linked row (D4), its hover the house blue border",
  lines.every((l) => l.anatomy.split(/\s+/).includes("D4") && l.anatomy.split(/\s+/).includes("E8.1")),
  lines.find((l) => !l.anatomy.includes("D4"))?.id ?? "",
);
for (const l of [...new Map(lines.map((l) => [l.type, l])).values()]) {
  const got = await page.request.get(`${BASE}${l.hub}`, { timeout: 300_000, maxRedirects: 5 });
  check(`2c ${l.type}: ${l.hub} answers 200`, got.status() === 200, String(got.status()));
}

// ── 3 ─────────────────────────────────────────────────────────────────────
const anyWrong = lines.filter((l) => ANY.has(l.type) !== (l.assets === "any"));
check(
  '3a "Any token" on every DEX and trading line and no other',
  anyWrong.length === 0 && lines.some((l) => l.assets === "any"),
  anyWrong.map((l) => l.id).join(" "),
);
const listed = lines.filter((l) => l.assets && l.assets !== "any");
const marksWrong = listed.filter((l) => {
  const total = Number(l.assets);
  return l.marks !== Math.min(5, total) || (total > 5 ? Number(l.more) !== total - 5 : l.more != null);
});
check(
  '3b at most five marks, then "+N" for the rest',
  listed.length > 0 && marksWrong.length === 0,
  `${listed.length} lines; wrong: ${marksWrong.map((l) => `${l.id} ${l.marks}/${l.assets}+${l.more}`).join(" ")}`,
);
const hrefWrong = listed.filter((l) => l.assetsHref !== `/assets?explorer=${l.id}`);
check(
  "3c each listed Assets cell is one link to /assets on that explorer",
  hrefWrong.length === 0,
  hrefWrong.map((l) => l.id).join(" "),
);
const badTile = ([w, h, mw, mh]) => w !== 24 || h !== 24 || mw > 24 || mh > 24 || mw < 12;
const sizeWrong = lines.filter((l) => l.tiles.some(badTile));
check(
  "3d every chain and asset mark draws at 24px",
  sizeWrong.length === 0,
  sizeWrong
    .slice(0, 4)
    .map((l) => `${l.id} ${JSON.stringify(l.tiles.filter(badTile))}`)
    .join(" | "),
);
const hit = await page
  .locator("a[data-protocol-assets-link]")
  .first()
  .evaluate((a) => {
    const r = a.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!at && a.contains(at);
  });
check("3e a press on the Assets cell lands on its link, not the line's cover", hit);
check(
  "3f no Vaults or Coverage link left in a line",
  lines.every((l) => l.oldLinks === 0),
);
const covPages = {};
for (const slug of [...new Set(launched.map((e) => SLUG[e.chainId]))]) {
  const got = await page.request.get(`${BASE}/coverage/${slug}`, { timeout: 300_000 });
  covPages[slug] = { status: got.status(), html: await got.text() };
}
const noAnchor = launched.filter((e) => {
  const p = covPages[SLUG[e.chainId]];
  return p.status !== 200 || !p.html.includes(`id="${e.id}"`);
});
check("3g each coverage page holds its explorers' ids", noAnchor.length === 0, noAnchor.map((e) => e.id).join(" "));
// For Miles: how far Aave V3's three lists differ.
{
  const aave = (shownGroups.get("aave-v3") ?? []).map((l) => ({
    chain: l.chain,
    set: new Set(l.symbols.split(", ").filter(Boolean)),
  }));
  const all = new Set(aave.flatMap((a) => [...a.set]));
  const inAll = [...all].filter((s) => aave.every((a) => a.set.has(s)));
  console.log(
    `INFO  Aave V3 assets by chain: ${aave.map((a) => `${a.chain} ${a.set.size}`).join(", ")}; ${all.size} across them, ${inAll.length} on every chain; only on one: ${aave
      .map((a) => `${a.chain} [${[...a.set].filter((s) => aave.every((b) => b === a || !b.set.has(s))).join(" ")}]`)
      .join(" ")}`,
  );
}

// ── 4 ─────────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/protocols?chain=8453&type=lending`, { waitUntil: "networkidle", timeout: 300_000 });
await page.waitForSelector("[data-protocol-line]", { timeout: 120_000 });
const cut = await readLines(page);
const cutGroups = byGroup(cut);
const wantGroups = [...groups.values()].filter((es) => es[0].type === "lending" && es.some((e) => e.chainId === 8453));
check(
  "4a ?chain=8453&type=lending: Base's lines of the lending protocols, the first shown taking the name",
  cutGroups.size === wantGroups.length &&
    cut.length === wantGroups.length &&
    cut.every((l) => l.chain === 8453 && l.type === "lending" && !l.cont && l.nameShown && l.category),
  `${cutGroups.size} groups, ${cut.length} lines; want ${wantGroups.length}`,
);
const facetText = (await page.evaluate(() => document.body.innerText)) ?? "";
check(
  "4b the facets read Chain and Category, not Type",
  /\bChain\b/.test(facetText) && /\bCategory\b/.test(facetText) && !/\+ Type\b/.test(facetText),
);
await page.goto(`${BASE}/protocols`, { waitUntil: "networkidle", timeout: 300_000 });
await page.waitForSelector("[data-protocol-line]", { timeout: 120_000 });
const search = page.locator('input[placeholder="Protocol, category or chain"]:visible').first();
await search.fill("aave v3");
await page.waitForTimeout(300);
const byName = await readLines(page);
await search.fill("arbitrum");
await page.waitForTimeout(300);
const byChain = await readLines(page);
check(
  "4c the search keeps a group on its name, every line, and a line on its chain",
  byName.length === (groups.get("aave-v3")?.length ?? -1) &&
    byName.every((l) => l.key === "aave-v3") &&
    byChain.length > 0 &&
    byChain.every((l) => l.chain === 42161),
  `"aave v3" ${byName.length} lines; "arbitrum" ${byChain.map((l) => l.id).join(" ")}`,
);
await search.fill("");
const sorters = await page.locator("[data-protocol-table] thead button, [data-protocol-table] [data-sort-key]").count();
check("4d the headers do not sort", sorters === 0, `${sorters} sort controls`);
const protocolFirst = await page
  .locator("[data-protocol-table] tr[data-protocol-line] > :first-child")
  .first()
  .evaluate((el) => Math.round(el.getBoundingClientRect().width));
await page.goto(`${BASE}/assets`, { waitUntil: "networkidle", timeout: 300_000 });
await page.waitForSelector("[data-asset-table] tr[data-asset-card]", { timeout: 120_000 }).catch(() => {});
const assetRow = await page
  .locator("[data-asset-table] tr[data-asset-card]")
  .first()
  .evaluate((el) => el.getAttribute("data-anatomy") ?? "")
  .catch(() => "");
const assetLead =
  (
    await page
      .locator("[data-asset-explorer-lead]")
      .textContent()
      .catch(() => "")
  )?.trim() ?? "";
const assetTiles = await page
  .locator("[data-asset-table] tr[data-asset-card] [data-asset-card-chains] > *")
  .evaluateAll((els) =>
    els
      .slice(0, 40)
      .map((t) => [Math.round(t.getBoundingClientRect().width), Math.round(t.getBoundingClientRect().height)]),
  )
  .catch(() => []);
const assetFirst = await page
  .locator("[data-asset-table] tr[data-asset-card] > :first-child")
  .first()
  .evaluate((el) => Math.round(el.getBoundingClientRect().width))
  .catch(() => 0);
const assetLines = await page
  .locator("[data-asset-table] tr[data-asset-line]")
  .evaluateAll((els) =>
    els.map((el) => ({
      card: el.getAttribute("data-asset-card"),
      line: el.getAttribute("data-asset-line"),
      cont: el.hasAttribute("data-dt-cont"),
      category: el.querySelector("[data-asset-category-badge]") != null,
      href: el.querySelector("[data-row-link]")?.getAttribute("href") ?? null,
      chainLinked: !!el.querySelector("[data-asset-card-chains] a"),
      chipChains: [...el.querySelectorAll("[data-asset-chip]")].map((a) => a.getAttribute("aria-label") ?? ""),
      chainName: el.querySelector("[data-asset-card-chains] [role=img]")?.getAttribute("aria-label") ?? "",
    })),
  )
  .catch(() => []);
const assetGroups = byGroup(assetLines.map((l) => ({ ...l, key: l.card })));
const groupWrong = [...assetGroups].filter(([, ls]) => {
  const [first, ...rest] = ls;
  return (
    first.cont ||
    !first.category ||
    rest.some((l) => !l.cont || l.category) ||
    ls.some((l) => {
      const [chain, token] = l.line.split(":");
      return l.href != null && l.href !== `/assets/${SLUG[chain]}/${token.toLowerCase()}`;
    }) ||
    ls.some((l) => l.chainLinked) ||
    ls.some((l) => l.chipChains.some((c) => !c.endsWith(`, ${l.chainName}`)))
  );
});
const multi = [...assetGroups.values()].filter((ls) => ls.length > 1);
check(
  "4h /assets: a group per asset, a line per chain opening that chain's page; name and category on the first line; the chain mark no link; Listed by that chain's",
  assetLines.length > 0 && groupWrong.length === 0 && multi.length > 0,
  `${assetGroups.size} assets, ${assetLines.length} lines, ${multi.length} on several chains; wrong: ${groupWrong
    .map(([k]) => k)
    .slice(0, 6)
    .join(" ")}`,
);
// The first 60 assets, then "Show all <n>"; sBOLD's Listed-by mark is its glyph.
const firstView = await page.evaluate(() => ({
  groups: new Set(
    [...document.querySelectorAll("[data-asset-table] tr[data-asset-line]")].map((r) =>
      r.getAttribute("data-asset-card"),
    ),
  ).size,
  more: document.querySelector("[data-asset-show-all]")?.getAttribute("data-asset-show-all") ?? null,
  label: document.querySelector("[data-asset-show-all]")?.textContent.trim() ?? "",
  sbold: (() => {
    const a = document.querySelector('[data-asset-chip="sbold"]');
    return a ? (a.querySelector("svg")?.getAttribute("viewBox") ?? "img") : "absent";
  })(),
}));
await page
  .locator("[data-asset-show-all]")
  .click()
  .catch(() => {});
await page.waitForTimeout(500);
const allView = await page.evaluate(() => ({
  groups: new Set(
    [...document.querySelectorAll("[data-asset-table] tr[data-asset-line]")].map((r) =>
      r.getAttribute("data-asset-card"),
    ),
  ).size,
  more: document.querySelectorAll("[data-asset-show-all]").length,
}));
check(
  '4i /assets draws the first 60 assets, then "Show all <n>" draws them all',
  firstView.groups === 60 &&
    Number(firstView.more) > 60 &&
    firstView.label === `Show all ${firstView.more}` &&
    allView.groups === Number(firstView.more) &&
    allView.more === 0,
  `${firstView.groups} then ${allView.groups} of ${firstView.more}; "${firstView.label}"`,
);
// sBOLD sits past the first 60: read it on its own explorer's list.
await page.goto(`${BASE}/assets?explorer=sbold`, { waitUntil: "networkidle", timeout: 300_000 });
await page.waitForSelector('[data-asset-chip="sbold"]', { timeout: 60_000 }).catch(() => {});
const sboldMark = await page.evaluate(() => {
  const a = document.querySelector('[data-asset-chip="sbold"]');
  return a ? (a.querySelector("svg")?.getAttribute("viewBox") ?? "img") : "absent";
});
check("4j sBOLD in Listed by draws its monochrome glyph", sboldMark === "0 0 540 540", sboldMark);
await page.goto(`${BASE}/assets`, { waitUntil: "networkidle", timeout: 300_000 });
check(
  "4e /assets: its rows carry D4 with A5.4; the lead is body text, no drawer",
  assetRow.split(/\s+/).includes("D4") &&
    assetRow.split(/\s+/).includes("A5.4") &&
    /^The table below lists each asset/.test(assetLead) &&
    (await page.locator("#asset-explorer-intro").count()) === 0,
  `${assetRow} | ${assetLead.slice(0, 80)}`,
);
check(
  "4f /assets: each chain is a 24px mark tile, as Listed by's",
  assetTiles.length > 0 && assetTiles.every(([w, h]) => w === 24 && h === 24),
  JSON.stringify(assetTiles.slice(0, 6)),
);
check(
  "4g the two tables line up: /assets's first column is /protocols' width",
  assetFirst > 0 && Math.abs(assetFirst - protocolFirst) <= 2,
  `/assets ${assetFirst}px, /protocols ${protocolFirst}px`,
);

// ── 5: the wallet panel ─────────────────────────────────────────────────────
const CHOOSER = "[data-search-launcher-panel] [data-explorer-chooser]";
await page.goto(`${BASE}/ethereum/aave-v3`, { waitUntil: "networkidle", timeout: 300_000 });
let open = false;
for (let attempt = 0; attempt < 6 && !open; attempt++) {
  await page.locator("button[data-search-launcher]:visible").first().click();
  open = await page
    .waitForSelector(CHOOSER, { state: "visible", timeout: 2000 })
    .then(() => true)
    .catch(() => false);
}
check("5a the wallet panel opens", open);
const viewAll = page.locator(`${CHOOSER} [data-chooser-view-all]`);
const viewAllText = ((await viewAll.textContent()) ?? "").trim();
const ethCount = launched.filter((e) => e.chainId === 1).length;
check(
  '5b "View all <n> explorers" links /protocols?chain=1, n the chain\'s launched explorers',
  (await viewAll.getAttribute("href")) === "/protocols?chain=1" && viewAllText === `View all ${ethCount} explorers`,
  viewAllText,
);
const assetsLink = page.locator(`${CHOOSER} a[data-chooser-index="assets"]`);
check(
  "5c an Assets link under the chooser opens /assets, with no Vaults link yet and no visible lead-in",
  (await assetsLink.getAttribute("href")) === "/assets" &&
    ((await assetsLink.textContent()) ?? "").trim() === "Assets" &&
    (await page.locator(`${CHOOSER} [data-chooser-index]`).count()) === 1 &&
    ((await page.locator(`${CHOOSER} [data-chooser-indexes]`).innerText()) ?? "").trim() === "Assets",
);
await viewAll.click();
const landed = await page
  .waitForURL(/\/protocols\?chain=1$/, { timeout: 30_000 })
  .then(() => true)
  .catch(() => false);
await page.waitForSelector("[data-protocol-line]", { timeout: 120_000 }).catch(() => {});
const ethLines = await readLines(page);
check(
  "5d pressing it lands on /protocols with Ethereum's lines alone, one per explorer",
  landed && ethLines.length === ethCount && ethLines.every((l) => l.chain === 1),
  `${ethLines.length} of ${ethCount}`,
);

// ── 6: widths ───────────────────────────────────────────────────────────────
for (const width of [375, 1280]) {
  const p = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
  await p.goto(`${BASE}/protocols`, { waitUntil: "networkidle", timeout: 300_000 });
  await p.waitForSelector("[data-protocol-line]", { timeout: 120_000 });
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  check(`6a ${width}px: no horizontal scroll`, sw <= width, `scrollWidth ${sw}`);
  if (width === 375) {
    // A group is one card: its head once, a compact row per chain, no
    // per-line cell labels; every line keeps its chain row (ui-jobs 781).
    const phone = async (path, line, head) => {
      await p.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 300_000 });
      await p.waitForSelector(line, { timeout: 120_000 });
      return p.evaluate(
        ({ line, head }) => {
          const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
          const rows = [...document.querySelectorAll(line)];
          return {
            rows: rows.length,
            chainRows: rows.filter((r) => vis(r.querySelector("[data-phone-line]"))).length,
            heads: rows.filter((r) => vis(r.querySelector(head))).length,
            groups: rows.filter((r) => !r.hasAttribute("data-dt-cont")).length,
            labels: [...document.querySelectorAll(`${line} .dt-cell-label`)].filter(vis).length,
            cells: rows.reduce(
              (n, r) =>
                n +
                [...r.children].filter(
                  (c) => c.getAttribute("role") === "cell" && vis(c) && !c.classList.contains("dt-row-menu"),
                ).length,
              0,
            ),
          };
        },
        { line, head },
      );
    };
    for (const [path, line, head] of [
      ["/protocols", "tr[data-protocol-line]", "[data-protocol-hub]:not(.sr-only)"],
      [
        "/assets",
        "tr[data-asset-line]",
        "[data-row-link]:not(.sr-only) [data-asset-name], td > div > [data-asset-name], th > div > [data-asset-name]",
      ],
    ]) {
      const v = await phone(path, line, head);
      check(
        `6c 375px ${path}: a group is one card, its head once and a chain row per line, no cell labels`,
        v.rows > 0 && v.chainRows === v.rows && v.heads === v.groups && v.labels === 0 && v.cells === 0,
        JSON.stringify(v),
      );
    }
    await p.goto(`${BASE}/coverage/base#morpho-base`, { waitUntil: "networkidle", timeout: 300_000 });
    await p.waitForTimeout(500);
    const top = await p.evaluate(
      () => document.querySelector('[data-coverage-card="morpho-base"]')?.getBoundingClientRect().top ?? null,
    );
    check(
      "6b 375px: /coverage/base#morpho-base scrolls the explorer's card into view",
      top != null && top >= 0 && top < 400,
      `card top ${top}`,
    );
  }
  await p.close();
}

await browser.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
