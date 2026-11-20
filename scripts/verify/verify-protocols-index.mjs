#!/usr/bin/env node
// /protocols, the top level, one chain at a time (anatomy E8, E8.1 to E8.3;
// rails-ops decisions 0068 point 2 and 0069 points 1, 2 and 6; ui-jobs 781,
// 786 stage 2), and the retirement of /assets.
// Run against a dev server:  BASE=http://localhost:3031 node scripts/verify/verify-protocols-index.mjs
//
// ── WHAT EACH SECTION ASSERTS ─────────────────────────────────────────
//   0  /protocols answers 200; "Protocols" its one h1; the lead names the
//      table and the tab's chain
//   1  chain tabs, Ethereum first and chosen with no ?chain=; a line per
//      launched explorer on the tab's chain (the roster's), by name
//   2  each line is its explorer's link (D4 with E8.1); its menu (H5) split
//      in three cells in order, Sections, Assets, About (checked on Aave V3 and
//      Liquity V2); the columns; Assets as up to five marks and +N, one link to
//      the Assets page, "Any token" on a DEX, a dash where there is no page
//   3  a tab press moves the URL to ?chain=<id> and the lines to that chain;
//      ?chain=8453 opens on Base; an unknown chain opens on Ethereum
//   4  the Category filter and the search narrow the tab; one control row
//      (tabs left, compact search right) and no listing toolbar; Sepolia the
//      last tab, marked; the Category heading's menu by keyboard (Enter opens,
//      Escape closes and hands focus back), a choice reading "Lending" with a
//      one-click clear and ?type= in the URL (decision 0070)
//   5  the wallet panel: "View all <n> explorers" opens /protocols?chain=1;
//      no Assets link under the chooser
//   6  /assets and /assets/<chain>/<token> are gone (404, no forwarding);
//      the resolver /api/asset-page/<chain>/<token> opens a token's page under
//      the explorer `via` names where it lists it, else under the first that
//      does, else back to `from`
//   7  at 375 a line is one card (head, then its sections); no horizontal
//      scroll at 375 or 1280; no page errors
//   8  with Focus on Ethereum alone: one tab, Ethereum's; ?chain=8453 shows
//      Ethereum with the URL kept; the chooser shows Ethereum alone and no
//      "View all" link

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";

let failures = 0;
let passes = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (cond) passes++;
  else failures++;
};

/** The launched roster's (id, chainId), read from the source. */
function launched() {
  const src = fs.readFileSync(path.join(ROOT, "lib/shared/protocols.ts"), "utf8");
  const body = src.slice(src.indexOf("const SPECS"), src.indexOf("const SEEN"));
  const out = [];
  for (const m of body.matchAll(/id: "([^"]+)",[\s\S]*?chainId: (\d+),/g)) {
    const rest = body.slice(m.index);
    const block = rest.slice(0, rest.indexOf("\n  },"));
    if (!/unlaunched: true/.test(block)) out.push({ id: m[1], chainId: Number(m[2]) });
  }
  return out;
}
const ROSTER = launched();

const browser = await chromium.launch();
const errors = [];
const open = async (width) => {
  const p = await browser.newPage({ viewport: { width, height: 900 } });
  p.on("pageerror", (e) => errors.push(`${p.url()}: ${e.message}`));
  return p;
};
const go = (p, url) => p.goto(`${BASE}${url}`, { waitUntil: "networkidle", timeout: 300_000 });
const linesOf = (p) =>
  p.$$eval("tr[data-protocol-line]", (rs) =>
    rs.map((r) => ({
      id: r.getAttribute("data-protocol-line"),
      anatomy: r.getAttribute("data-anatomy") ?? "",
      hub: r.querySelector("a[data-protocol-hub]")?.getAttribute("href") ?? null,
      name: r.querySelector("a[data-protocol-hub]")?.textContent.trim() ?? "",
      sections: [...r.querySelectorAll("td [data-protocol-sections] a")]
        .filter((a) => a.getClientRects().length > 0)
        .map((a) => [a.textContent.trim(), a.getAttribute("href")]),
      assets: r.querySelector("[data-protocol-assets]")?.getAttribute("data-protocol-assets") ?? null,
      assetsHref: r.querySelector("a[data-protocol-assets-link]")?.getAttribute("href") ?? null,
      marks: r.querySelectorAll("a[data-protocol-assets-link] [data-protocol-asset]").length,
      more: r.querySelector("a[data-protocol-assets-link]")?.textContent.match(/\+(\d+)/)?.[1] ?? null,
      about: r.querySelector("a[data-protocol-about]")?.getAttribute("href") ?? null,
    })),
  );
const sorted = (xs) => [...xs].sort().join();

const page = await open(1280);

// 0, 1
const r0 = await go(page, "/protocols");
await page.waitForSelector("tr[data-protocol-line]", { timeout: 120_000 });
const h1 = (await page.locator("h1").allTextContents()).map((t) => t.trim());
check("0a /protocols answers 200", r0?.status() === 200, String(r0?.status()));
check('0b "Protocols by chain" is the one h1', h1.length === 1 && h1[0] === "Protocols by chain", h1.join(" | "));
const lead = ((await page.locator("[data-protocol-index-lead]").textContent()) ?? "").trim();
check(
  "0c the lead names the table and the chain",
  /^The table below lists each protocol .* on Ethereum,/.test(lead),
  lead.slice(0, 90),
);
const tabs = await page.$$eval("[data-protocol-tab]", (ts) =>
  ts.map((t) => ({
    id: Number(t.getAttribute("data-protocol-tab")),
    on: t.getAttribute("aria-selected") === "true",
    name: t.textContent.trim(),
  })),
);
check(
  "1a chain tabs, Ethereum first and chosen",
  tabs.length > 1 && tabs[0].id === 1 && tabs[0].on && tabs.filter((t) => t.on).length === 1,
  tabs.map((t) => t.name).join("|"),
);
const eth = await linesOf(page);
const want = ROSTER.filter((p) => p.chainId === 1).map((p) => p.id);
check(
  "1b a line per launched explorer on Ethereum",
  sorted(eth.map((l) => l.id)) === sorted(want),
  `${eth.length} lines, roster ${want.length}`,
);
const names = eth.map((l) => l.name);
check("1c by name", names.join("|") === [...names].sort((a, b) => a.localeCompare(b, "en-US")).join("|"));

// 2
check(
  "2a each line is its explorer's link (D4 with E8.1)",
  eth.every((l) => l.anatomy.split(/\s+/).includes("D4") && l.anatomy.includes("E8.1") && l.hub),
);
const menuOf = async (href) => {
  const p = await open(1280);
  await go(p, href);
  const m = await p.$$eval("[data-sections-menu] [role='menuitem']", (as) =>
    as.map((a) => [a.textContent.trim(), a.getAttribute("href")]),
  );
  await p.close();
  return m;
};
for (const id of ["aave-v3", "liquity"]) {
  const line = eth.find((l) => l.id === id);
  const menu = line ? await menuOf(line.hub) : [];
  check(
    `2b ${id}: Sections, Assets and About are its menu's, in order`,
    line != null &&
      JSON.stringify([...line.sections, ["Assets", line.assetsHref], ["About", line.about]]) === JSON.stringify(menu) &&
      !line.sections.some(([n]) => n === "Assets" || n === "About"),
    `${line?.sections.map(([n]) => n).join("|")} · ${line?.assetsHref} · ${line?.about}`,
  );
}
const uni = eth.find((l) => l.id === "uniswap-v3");
check(
  '2c a DEX: "Any token", no Assets link; About last',
  uni != null && uni.assets === "any" && uni.assetsHref === null && uni.about === "/ethereum/uniswap-v3/info",
  `${uni?.assets} ${uni?.about}`,
);
// The headings as seen: sr-only text (a control's description, About's
// name) left out.
const heads = await page.$$eval("[data-protocol-table] thead th", (ths) =>
  ths.map((t) => {
    const c = t.cloneNode(true);
    c.querySelectorAll(".sr-only").forEach((x) => x.remove());
    return c.textContent.trim();
  }),
);
check(
  "2d the columns seen: Protocol, Category, Sections, Assets, and a last one named About for a screen reader alone",
  heads.join("|") === "Protocol|Category|Sections|Assets|",
  heads.join("|"),
);
const withAssets = eth.filter((l) => l.assetsHref);
const marksWrong = withAssets.filter(
  (l) =>
    l.assetsHref !== `${l.hub}/assets` ||
    l.marks !== Math.min(5, Number(l.assets)) ||
    (Number(l.assets) > 5 ? Number(l.more) !== Number(l.assets) - 5 : l.more != null),
);
check(
  "2e Assets: up to five marks and +N, one link to the explorer's Assets page",
  withAssets.length >= 15 && marksWrong.length === 0,
  `${withAssets.length} linked; wrong ${marksWrong.map((l) => `${l.id} ${l.marks}/${l.assets}+${l.more}`).join(" ")}`,
);
const dash = eth.filter((l) => l.assets === "none");
// 2g the reserve and market pages' asset link (ui-jobs 786), in the
// reserve's ⋮ menu, goes through the resolver read from that explorer's
// side, and no link names /assets/.
await go(page, `/ethereum/aave-v3/markets/${USDC}`);
// The link sits in the reserve's ⋮ menu (its title the symbol).
await page.click('button[aria-label="USDC reserve menu"]', { timeout: 120_000 });
const assetLink = await page
  .waitForSelector(`a[href^="/api/asset-page/ethereum/${USDC}"]`, { timeout: 120_000 })
  .then((a) => a.getAttribute("href"))
  .catch(() => null);
const stalePaths = await page.$$eval('a[href^="/assets/"], a[href="/assets"]', (as) => as.length);
check(
  "2g a reserve page's asset link opens the resolver from Aave V3's side; no link names /assets",
  assetLink === `/api/asset-page/ethereum/${USDC}?via=aave-v3` && stalePaths === 0,
  `${assetLink} · ${stalePaths}`,
);
await go(page, "/protocols");
await page.waitForSelector("tr[data-protocol-line]");
check(
  "2f an explorer with no Assets page: a muted dash, no link",
  dash.length > 0 && dash.every((l) => l.assetsHref === null && l.about),
  dash.map((l) => l.id).join(" "),
);

// 3
await Promise.all([page.waitForURL(/chain=8453/, { timeout: 30_000 }), page.click('[data-protocol-tab="8453"]')]);
const base = await linesOf(page);
const wantBase = ROSTER.filter((p) => p.chainId === 8453).map((p) => p.id);
check(
  "3a a tab press: ?chain=8453 and Base's lines",
  sorted(base.map((l) => l.id)) === sorted(wantBase),
  `${base.length} lines`,
);
await go(page, "/protocols?chain=8453");
await page.waitForSelector("tr[data-protocol-line]");
check(
  "3b ?chain=8453 opens on Base",
  (await page.getAttribute('[data-protocol-tab="8453"]', "aria-selected")) === "true",
);
await go(page, "/protocols?chain=999");
await page.waitForSelector("tr[data-protocol-line]");
check(
  "3c an unknown chain opens on Ethereum",
  (await page.getAttribute('[data-protocol-tab="1"]', "aria-selected")) === "true",
);

// 4
await go(page, "/protocols?type=dex");
await page.waitForSelector("[data-protocol-table], [data-protocol-none]");
const dex = await page.$$eval("tr[data-protocol-line]", (rs) => rs.map((r) => r.getAttribute("data-protocol-type")));
check("4a ?type=dex keeps the DEXes", dex.length > 0 && dex.every((t) => t === "dex"), `${dex.length}`);
await go(page, "/protocols");
await page.waitForSelector("tr[data-protocol-line]");
// The Protocol heading's search (D10): the magnifier opens an input labelled
// "Protocol"; it filters as typed and the live line counts the lines.
const hs = page.locator("thead [data-heading-search='protocol']");
await hs.locator("[data-heading-search-open]").click();
const hsInput = hs.locator("[data-heading-search-input]");
await hsInput.fill("aave");
await page.waitForTimeout(400);
const aave = await page.$$eval("tr[data-protocol-line]", (rs) => rs.map((r) => r.getAttribute("data-protocol-line")));
const live = ((await page.locator("[data-roster-live]").textContent()) ?? "").trim();
check(
  "4b the Protocol heading's search: an input labelled Protocol keeps Aave's lines, the live line counting them",
  (await hsInput.getAttribute("aria-label")) === "Protocol" &&
    aave.length > 0 &&
    aave.every((id) => id.startsWith("aave")) &&
    live === `${aave.length} protocols shown`,
  `${aave.join(" ")} · ${live}`,
);
// Leaving it keeps the query in the heading with a ×; Escape in the input
// clears it and hands focus to the magnifier.
await page.locator("h1").click();
const kept = ((await hs.locator("[data-heading-search-query]").textContent()) ?? "").trim();
await hs.locator("[data-heading-search-open]").click();
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
const back = await page.$$eval("tr[data-protocol-line]", (rs) => rs.length);
const onMagnifier = await page.evaluate(() => document.activeElement?.hasAttribute("data-heading-search-open"));
check(
  '4b2 left with a query the heading shows it; Escape clears it, focus on the magnifier; "/" opens it',
  kept === "aave" && back === eth.length && onMagnifier,
  `${kept} · ${back} · ${onMagnifier}`,
);
await page.locator("h1").click();
await page.keyboard.press("/");
const slashOpen = (await hs.locator("[data-heading-search-input]").count()) === 1;
await page.keyboard.press("Escape");
check('4b3 "/" opens the heading search', slashOpen);

// 4c-4h the roster's controls (decision 0070): from sm the control row holds
// the tabs alone, the search in the Protocol heading; Category filtered from
// its heading; no toolbar; the last column's heading for a screen reader alone.
const ctl = await page.evaluate(() => {
  const search = document.querySelector("[data-roster-controls] input");
  const tabEls = [...document.querySelectorAll("[data-protocol-tab]")];
  const last = tabEls.at(-1);
  const aboutHead = [...document.querySelectorAll("[data-protocol-table] thead th")].at(-1);
  return {
    rowSearch: !!search && search.getClientRects().length > 0,
    toolbar: document.querySelectorAll('[data-anatomy~="N1"], [data-pill-row]').length,
    lastTab: last?.getAttribute("data-protocol-tab"),
    lastPill: !!last?.querySelector("[data-testnet-pill]"),
    aboutHead: aboutHead?.querySelector(".sr-only")?.textContent ?? null,
    // Its one text is the sr-only "About".
    aboutSeen: aboutHead
      ? aboutHead.textContent.trim() !== (aboutHead.querySelector(".sr-only")?.textContent ?? "")
      : null,
  };
});
check(
  "4c from sm the control row holds the tabs alone; no listing toolbar; the About column's heading for a screen reader alone",
  !ctl.rowSearch && ctl.toolbar === 0 && ctl.aboutHead === "About" && ctl.aboutSeen === false,
  JSON.stringify(ctl),
);
check(
  "4d Sepolia is the last tab, marked as a testnet",
  ctl.lastTab === "11155111" && ctl.lastPill,
  `${ctl.lastTab}, pill ${ctl.lastPill}`,
);
const head = page.locator("thead [data-heading-filter='category']");
const btn = head.locator("[data-heading-filter-button]");
check(
  '4e the Category heading is a button reading "Category", aria-expanded false',
  (await btn.textContent())?.trim() === "Category" && (await btn.getAttribute("aria-expanded")) === "false",
);
await btn.focus();
await page.keyboard.press("Enter");
await page.waitForSelector("[data-heading-filter-menu='category']", { timeout: 5000 });
const items = await page.$$eval("[data-heading-filter-menu='category'] [role=menuitemradio]", (as) =>
  as.map((a) => [a.getAttribute("data-heading-filter-option"), a.textContent.trim()]),
);
const expanded = await btn.getAttribute("aria-expanded");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
const closed = (await page.locator("[data-heading-filter-menu='category']").count()) === 0;
const refocused = await page.evaluate(() => document.activeElement?.hasAttribute("data-heading-filter-button"));
check(
  "4f by keyboard: Enter opens a menu of the tab's categories with counts; Escape closes it, focus back on the button",
  expanded === "true" &&
    items.length > 2 &&
    items[0][0] === "" &&
    items.slice(1).every(([, t]) => /\d+$/.test(t)) &&
    closed &&
    refocused,
  items.map(([, t]) => t).join(" | "),
);
await btn.click();
await page.click("[data-heading-filter-menu='category'] [data-heading-filter-option='lending']");
await page.waitForTimeout(300);
const lending = await page.$$eval("tr[data-protocol-line]", (rs) =>
  rs.map((r) => r.getAttribute("data-protocol-type")),
);
// The button's name: the column, then the choice (its sr-only prefix).
const chosenText = ((await btn.textContent()) ?? "").trim();
check(
  '4g choosing Lending: the heading reads "Lending" with a clear, the URL ?type=lending, the lines lending',
  chosenText === "Category: Lending" &&
    (await head.locator("[data-heading-filter-clear]").count()) === 1 &&
    new URL(page.url()).searchParams.get("type") === "lending" &&
    lending.length > 0 &&
    lending.every((t) => t === "lending"),
  `${chosenText}; ${page.url()}; ${lending.length}`,
);
await head.locator("[data-heading-filter-clear]").click();
await page.waitForTimeout(300);
const cleared = await page.$$eval("tr[data-protocol-line]", (rs) => rs.length);
check(
  "4h one click clears it",
  cleared === eth.length &&
    !new URL(page.url()).searchParams.has("type") &&
    (await btn.textContent())?.trim() === "Category",
  `${cleared} lines`,
);

// 4i a category the tab holds no more stays chosen and clearable: one on
// Ethereum that Base has none of, asked for on Base.
await go(page, "/protocols");
await page.waitForSelector("tr[data-protocol-line]");
const ethTypes = await page.$$eval("tr[data-protocol-line]", (rs) =>
  rs.map((r) => r.getAttribute("data-protocol-type")),
);
await go(page, "/protocols?chain=8453");
await page.waitForSelector("tr[data-protocol-line]");
const baseTypes = new Set(
  await page.$$eval("tr[data-protocol-line]", (rs) => rs.map((r) => r.getAttribute("data-protocol-type"))),
);
const stale = ethTypes.find((t) => !baseTypes.has(t));
await go(page, `/protocols?chain=8453&type=${stale}`);
await page.waitForSelector("[data-protocol-table]");
const staleHead = page.locator("thead [data-heading-filter='category']");
const staleText = ((await staleHead.locator("[data-heading-filter-button]").textContent()) ?? "").trim();
const staleNone = await page.locator("[data-protocol-none]").count();
await staleHead.locator("[data-heading-filter-button]").click();
const staleItem = (
  (await page.locator(`[data-heading-filter-menu='category'] [data-heading-filter-option='${stale}']`).textContent()) ??
  ""
).trim();
await page.keyboard.press("Escape");
await staleHead.locator("[data-heading-filter-clear]").click();
await page.waitForTimeout(300);
const staleFocus = await page.evaluate(() => document.activeElement?.hasAttribute("data-heading-filter-button"));
const staleAfter = await page.$$eval("tr[data-protocol-line]", (rs) => rs.length);
check(
  `4i ?type=${stale} on Base (none there): the heading shows it chosen, "No protocol matches.", the menu lists it at 0; × clears it, focus on the button`,
  staleText.endsWith(staleText.replace(/^.*: /, "")) &&
    staleText.length > 0 &&
    staleText !== "Category" &&
    staleNone === 1 &&
    /0$/.test(staleItem) &&
    staleFocus &&
    staleAfter === base.length,
  `${staleText} · ${staleItem} · focus ${staleFocus} · ${staleAfter}`,
);
// 4j the tabs: one tab stop, the arrows move the choice and the focus.
await go(page, "/protocols");
await page.waitForSelector("tr[data-protocol-line]");
const stops = await page.$$eval("[data-protocol-tab]", (ts) =>
  ts.map((t) => [t.getAttribute("tabindex"), t.getAttribute("aria-controls")]),
);
await page.focus('[data-protocol-tab="1"]');
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(300);
const moved = await page.evaluate(() => [
  document.activeElement?.getAttribute("data-protocol-tab"),
  document.activeElement?.getAttribute("aria-selected"),
]);
const panel = stops[0]?.[1]
  ? await page
      .locator(`#${stops[0][1].replace(/:/g, "\\:")}`)
      .getAttribute("role")
      .catch(() => null)
  : null;
check(
  "4j the chain tabs: one tab stop, aria-controls the panel, ArrowRight moves the choice and the focus",
  stops.filter(([t]) => t === "0").length === 1 &&
    panel === "tabpanel" &&
    moved[0] === String(tabs[1].id) &&
    moved[1] === "true",
  `${JSON.stringify(stops.map(([t]) => t))} · ${moved.join(" ")} · ${panel}`,
);

// 5 the wallet panel
const CHOOSER = "[data-search-launcher-panel] [data-explorer-chooser]";
await go(page, "/ethereum/aave-v3");
let opened = false;
for (let attempt = 0; attempt < 6 && !opened; attempt++) {
  await page.locator("button[data-search-launcher]:visible").first().click();
  opened = await page
    .waitForSelector(CHOOSER, { state: "visible", timeout: 2000 })
    .then(() => true)
    .catch(() => false);
}
const viewAll = await page
  .locator(`${CHOOSER} [data-chooser-view-all]`)
  .getAttribute("href")
  .catch(() => null);
const indexes = await page.locator(`${CHOOSER} [data-chooser-indexes], ${CHOOSER} [data-chooser-index]`).count();
check(
  "5 the chooser: View all opens /protocols?chain=1; no Assets link",
  opened && viewAll === "/protocols?chain=1" && indexes === 0,
  `${opened ? "opened" : "not opened"}; ${viewAll}; ${indexes} index links`,
);

// 6 /assets retired, the resolver
const status = async (u) => (await fetch(`${BASE}${u}`, { redirect: "manual" })).status;
check("6a /assets is gone", (await status("/assets")) === 404);
check("6b /assets/<chain>/<token> is gone", (await status(`/assets/ethereum/${USDC}`)) === 404);
const loc = async (u) => {
  const r = await fetch(`${BASE}${u}`, { redirect: "manual" });
  return [r.status, r.headers.get("location") ?? ""];
};
const [s1, l1] = await loc(`/api/asset-page/ethereum/${USDC}?via=morpho`);
check(
  "6c the resolver opens the token under via's explorer",
  s1 === 307 && l1.endsWith(`/ethereum/morpho/assets/${USDC}`),
  `${s1} ${l1}`,
);
const [s2, l2] = await loc(`/api/asset-page/ethereum/${USDC}?via=uniswap-v3`);
check(
  "6d via without the token: the first explorer that lists it",
  s2 === 307 && /\/ethereum\/[a-z0-9-]+\/assets\/0xa0b8/.test(l2) && !l2.includes("uniswap"),
  `${s2} ${l2}`,
);
const [s3, l3] = await loc(
  `/api/asset-page/ethereum/0x000000000000000000000000000000000000dead?from=%2Fethereum%2Faave-v3`,
);
check("6e a token no explorer lists: back to from", s3 === 307 && l3.endsWith("/ethereum/aave-v3"), `${s3} ${l3}`);

// 7
const phone = await open(375);
await go(phone, "/protocols");
await phone.waitForSelector("tr[data-protocol-line]");
const card = await phone.evaluate(() => {
  const r = document.querySelector("tr[data-protocol-line]");
  const line = r.querySelector("[data-phone-line]");
  return {
    line: !!line && line.getClientRects().length > 0,
    links: line ? line.querySelectorAll("a").length : 0,
    wide: document.documentElement.scrollWidth,
  };
});
check("7a at 375 a line is a card with its sections", card.line && card.links > 1, JSON.stringify(card));
const pc = await phone.evaluate(() => {
  const tabs = document.querySelector("[data-protocol-tabs]")?.getBoundingClientRect();
  const search = document.querySelector("[data-roster-controls] input")?.getBoundingClientRect();
  const filters = [...document.querySelectorAll("[data-heading-filter-button], [data-heading-search-open]")].filter(
    (b) => b.getClientRects().length > 0,
  ).length;
  return { below: tabs && search ? search.top >= tabs.bottom - 1 : false, filters };
});
check(
  "7a2 at 375 one plain search under the tabs, no heading filters",
  pc.below && pc.filters === 0,
  JSON.stringify(pc),
);
// The phone's search reads every text column: "lending" keeps the lending lines.
await phone.locator("[data-roster-controls] input").fill("lending");
await phone.waitForTimeout(400);
const pl = await phone.$$eval("tr[data-protocol-line]", (rs) => rs.map((r) => r.getAttribute("data-protocol-type")));
check(
  '7a3 at 375 the search reads the category: "lending" keeps the lending lines',
  pl.length > 0 && pl.every((t) => t === "lending"),
  `${pl.length}`,
);
// A Category the URL sets shows as a removable chip.
await go(phone, "/protocols?type=dex");
await phone.waitForSelector("tr[data-protocol-line]");
const chip = phone.locator("[data-heading-filter-chip='category']");
const chipText = ((await chip.textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
await chip.locator("[data-heading-filter-clear]").click();
await phone.waitForTimeout(400);
const after = await phone.$$eval("tr[data-protocol-line]", (rs) => rs.length);
check(
  "7a4 at 375 ?type=dex shows a chip; its × clears it",
  chipText === "Category: DEX" && !new URL(phone.url()).searchParams.has("type") && after > 3,
  `${chipText} · ${after}`,
);
check("7b no horizontal scroll at 375", card.wide <= 375, `${card.wide}`);
const wide = await page.evaluate(() => document.documentElement.scrollWidth);
check("7c no horizontal scroll at 1280", wide <= 1280, `${wide}`);
check("7d no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));

// 8 the tabs follow the Focus (Miles, 20 Nov 2026): a view focused on
// Ethereum alone, as the profile menu saves it.
const focused = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await focused.addInitScript(() => {
  localStorage.setItem(
    "rails-focus-views",
    JSON.stringify({ views: [{ id: "v786", assets: [], chains: [1], savedAt: Date.now() }], active: "v786" }),
  );
});
const fp = await focused.newPage();
fp.on("pageerror", (e) => errors.push(`${fp.url()}: ${e.message}`));
const tabsOf = async () => {
  await fp.waitForSelector("[data-roster-controls][data-scope-ready] [data-protocol-tab]", { timeout: 60_000 });
  return fp.$$eval("[data-protocol-tab]", (ts) =>
    ts.map((t) => [Number(t.getAttribute("data-protocol-tab")), t.getAttribute("aria-selected") === "true"]),
  );
};
await fp.goto(`${BASE}/protocols`, { waitUntil: "networkidle", timeout: 300_000 });
const fTabs = await tabsOf();
check(
  "8a with Focus on Ethereum, the one tab is Ethereum's",
  fTabs.length === 1 && fTabs[0][0] === 1 && fTabs[0][1],
  JSON.stringify(fTabs),
);
await fp.goto(`${BASE}/protocols?chain=8453`, { waitUntil: "networkidle", timeout: 300_000 });
const fTabs2 = await tabsOf();
const fLines = await fp.$$eval("tr[data-protocol-line]", (rs) => rs.map((r) => r.getAttribute("data-protocol-line")));
const fLead = ((await fp.locator("[data-protocol-index-lead]").textContent()) ?? "").trim();
check(
  "8b ?chain=8453 outside the Focus shows Ethereum, the URL kept",
  fTabs2.length === 1 &&
    fTabs2[0][0] === 1 &&
    sorted(fLines) === sorted(want.filter((id) => fLines.includes(id))) &&
    fLines.every((id) => ROSTER.find((p) => p.id === id)?.chainId === 1) &&
    / on Ethereum,/.test(fLead) &&
    new URL(fp.url()).searchParams.get("chain") === "8453",
  `${fLines.length} lines; ${fp.url()}`,
);
// The chooser under the same Focus: its tabs are the focused chains, and it
// draws no "View all" link while it filters, so none leads off the Focus.
await fp.goto(`${BASE}/ethereum/aave-v3`, { waitUntil: "networkidle", timeout: 300_000 });
let fOpen = false;
for (let attempt = 0; attempt < 6 && !fOpen; attempt++) {
  await fp.locator("button[data-search-launcher]:visible").first().click();
  fOpen = await fp
    .waitForSelector(CHOOSER, { state: "visible", timeout: 2000 })
    .then(() => true)
    .catch(() => false);
}
const fChooser = await fp.evaluate((sel) => {
  const c = document.querySelector(sel);
  return {
    tabs: [...(c?.querySelectorAll("[data-chain-tab]") ?? [])].map((t) => t.getAttribute("data-chain-tab")),
    viewAll: c?.querySelector("[data-chooser-view-all]")?.getAttribute("href") ?? null,
  };
}, CHOOSER);
check(
  "8c the chooser under that Focus: Ethereum's tab alone, no View all link",
  fOpen && fChooser.tabs.join() === "ethereum" && fChooser.viewAll === null,
  JSON.stringify(fChooser),
);
await focused.close();

await browser.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
