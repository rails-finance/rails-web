// A protocol's Assets (decision 0069, ui-jobs 786 stage 1; anatomy A6, A7, H3,
// H5) on Aave V3 and Liquity V2 on Ethereum.
// Run against a dev server:  BASE=http://localhost:3031 node scripts/verify/verify-protocol-assets.mjs
//
// Checklist:
//   1. H3's name and icon are plain text (no link); H5 reads Positions, Markets,
//      Assets, About on Aave V3 and Troves, Branches, Stability Pool, Assets,
//      About on Liquity V2, Assets current on its pages.
//   2g-2l the roster's controls (decision 0070): from sm no search row, the
//      Asset heading's search filtering as typed, Category and "Also used in"
//      filtered from their headings with a one-click clear; Focus on USDC
//      holds the page. At 375 one plain search over every text column and a
//      chip for a URL filter.
//   2. /ethereum/aave-v3/assets: no visible heading (an sr-only h1, as the
//      listing), a line per asset each opening
//      its page under Aave V3; "In Aave V3" links the reserve page (which
//      answers 200); "Also used in" opens other explorers' pages, never Aave
//      V3's; ?cat=stablecoin keeps stablecoins alone.
//   3. /ethereum/liquity-v2/assets: WETH links its branch, BOLD its Stability Pools.
//   4. USDC under Aave V3: its title, the reserve link at the heading's right
//      (A1.10) and the other oracles' protocols (A2.4); from WETH under
//      Liquity V2, Aave V3's link in the oracle table opens WETH under Aave
//      V3, and the two pages name one canonical URL.
//   5. BOLD under Liquity V2 answers 200; BOLD under Aave V3 is a 404.
//   6. A front-door explorer's H5 opens with "Overview", its front door.
//   7. At 375 no sideways scroll on the Assets page; each line reads as a card.
//   8. No page errors.
// SHOTS=<dir> writes the pages at 1280 and 375.

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS;
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const BOLD = "0x6440f144b7e50d6a8439336510312d2f54beb01d";

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/786s1-${name}.png` });

const browser = await chromium.launch();
const errors = [];
const open = async (width) => {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
  return page;
};
const go = (page, path) => page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 300_000 });
const status = async (path) => (await fetch(`${BASE}${path}`, { redirect: "manual" })).status;

/** H3's identity and H5's entries. */
const header = (page) =>
  page.evaluate(() => {
    const id = document.querySelector("[data-anatomy='H3'] [data-rail-identity]");
    const menu = [...document.querySelectorAll("[data-sections-menu] [role='menuitem']")];
    return {
      identityTag: id?.tagName ?? null,
      identityLinks: id ? id.querySelectorAll("a").length + (id.closest("a") ? 1 : 0) : -1,
      entries: menu.map((a) => a.textContent.trim()),
      hrefs: menu.map((a) => a.getAttribute("href")),
      current: menu.find((a) => a.getAttribute("aria-current") === "page")?.textContent.trim() ?? null,
    };
  });

const page = await open(1280);

// 1, 2. Aave V3's Assets
await go(page, "/ethereum/aave-v3/assets");
await page.waitForSelector('[data-asset-table="protocol"]', { timeout: 120_000 });
const h = await header(page);
check(
  "1a H3's name is plain text",
  h.identityTag === "SPAN" && h.identityLinks === 0,
  `${h.identityTag}, ${h.identityLinks} links`,
);
check(
  "1b H5 on Aave V3: Positions, Markets, Assets, About; Assets current",
  h.entries.join("|") === "Positions|Markets|Assets|About" && h.current === "Assets",
  `${h.entries.join("|")}; current ${h.current}`,
);
const h1 = await page.$$eval("h1", (hs) =>
  hs.map((x) => ({ text: x.textContent.trim(), sr: x.classList.contains("sr-only") })),
);
check(
  '2a no visible heading: one sr-only h1, "Aave V3 assets"',
  h1.length === 1 && h1[0].sr && h1[0].text === "Aave V3 assets",
  JSON.stringify(h1),
);
const rows = await page.$$eval("tr[data-asset-line]", (rs) =>
  rs.map((r) => ({
    line: r.getAttribute("data-asset-line"),
    cat: r.getAttribute("data-asset-category"),
    href: r.querySelector("a[data-row-link], a")?.getAttribute("href") ?? null,
    markets: [...r.querySelectorAll("[data-asset-market]")].map((a) => a.getAttribute("href")),
    also: [...r.querySelectorAll("[data-asset-also] [data-asset-chip]")].map((a) => [
      a.getAttribute("data-asset-chip"),
      a.getAttribute("href"),
    ]),
  })),
);
check(
  "2b a line per asset, each opening its page under Aave V3",
  rows.length > 10 &&
    rows.every((r) => r.line.startsWith("1:") && r.href === `/ethereum/aave-v3/assets/${r.line.slice(2)}`),
  `${rows.length} lines`,
);
check(
  '2c "In Aave V3" links a reserve page per market the token is in (Core, Prime, EtherFi)',
  rows.every(
    (r) =>
      r.markets.length >= 1 &&
      r.markets.every((h) =>
        new RegExp(`^/ethereum/aave-v3/markets/${r.line.slice(2)}(\\?market=(prime|etherfi))?$`).test(h),
      ),
  ),
);
const usdcRow = rows.find((r) => r.line === `1:${USDC}`);
check(
  "2d the reserve page answers 200",
  usdcRow != null && (await status(usdcRow.markets[0])) === 200,
  usdcRow?.markets[0],
);
const alsoAll = rows.flatMap((r) => r.also.map(([id, href]) => ({ id, href, token: r.line.slice(2) })));
// Every other explorer is opened at its page for the token (stage 1b gave
// each explorer with an asset list an Assets page); a vault no explorer
// deploys keeps its own page.
check(
  '2e "Also used in" never names Aave V3; each opens that explorer\'s page for the token',
  alsoAll.length > 10 &&
    alsoAll.every((a) => a.id !== "aave-v3") &&
    alsoAll
      .filter((a) => a.id !== "sbold")
      .every((a) => /^\/[a-z]+\/[a-z0-9-]+\/assets\/0x[0-9a-f]{40}$/.test(a.href) && a.href.endsWith(a.token)),
  `${alsoAll.length} marks`,
);
await shot(page, "aave-assets-1280");
await go(page, "/ethereum/aave-v3/assets?cat=stablecoin");
await page.waitForSelector('[data-asset-table="protocol"]', { timeout: 120_000 });
const cats = await page.$$eval("tr[data-asset-line]", (rs) => rs.map((r) => r.getAttribute("data-asset-category")));
check(
  "2f ?cat=stablecoin keeps stablecoins alone",
  cats.length > 3 && cats.length < rows.length && cats.every((c) => c === "stablecoin"),
  `${cats.length} lines`,
);

// 2g-2l the roster's controls (decision 0070): from sm no search row, the
// search in the Asset heading (D10); Category and "Also used in" filtered
// from their headings (D9); no listing toolbar.
const ctrl = await page.evaluate(() => ({
  toolbar: document.querySelectorAll('[data-anatomy~="N1"], [data-pill-row]').length,
  search:
    ![...document.querySelectorAll("[data-roster-controls] input")].some((i) => i.getClientRects().length > 0) &&
    !!document.querySelector("thead [data-heading-search='asset'] [data-heading-search-open]"),
  heading: document
    .querySelector("thead [data-heading-filter='category'] [data-heading-filter-button]")
    ?.textContent.trim(),
}));
check(
  "2g no search row, the Asset heading's search, no listing toolbar; the heading reads the chosen category",
  ctrl.toolbar === 0 && ctrl.search && ctrl.heading === "Category: Stablecoin",
  JSON.stringify(ctrl),
);
const aHead = page.locator("thead [data-heading-filter='category']");
await aHead.locator("[data-heading-filter-clear]").click();
await page.waitForTimeout(300);
const all2 = await page.$$eval("tr[data-asset-line]", (rs) => rs.length);
check(
  "2h one click clears the category",
  all2 === rows.length && !new URL(page.url()).searchParams.has("cat"),
  `${all2}`,
);
await aHead.locator("[data-heading-filter-button]").click();
await page.click("[data-heading-filter-menu='category'] [data-heading-filter-option='governance']");
await page.waitForTimeout(300);
const gov = await page.$$eval("tr[data-asset-line]", (rs) => rs.map((r) => r.getAttribute("data-asset-category")));
check(
  '2i a choice from the heading: "Governance", ?cat=governance, governance lines alone',
  ((await aHead.locator("[data-heading-filter-button]").textContent()) ?? "").trim() === "Category: Governance" &&
    new URL(page.url()).searchParams.get("cat") === "governance" &&
    gov.length > 0 &&
    gov.every((c) => c === "governance"),
  `${gov.length}`,
);
const aSearch = page.locator("thead [data-heading-search='asset']");
await aSearch.locator("[data-heading-search-open]").click();
await aSearch.locator("[data-heading-search-input]").fill("aave");
await page.waitForTimeout(300);
const aaveOnly = await page.$$eval("tr[data-asset-line] [data-asset-name]", (ns) =>
  ns.map((x) => x.textContent.trim()),
);
const aLive = ((await page.locator("[data-roster-live]").textContent()) ?? "").trim();
check(
  "2j the Asset heading's search filters as it is typed, labelled Asset, the live line counting",
  (await aSearch.locator("[data-heading-search-input]").getAttribute("aria-label")) === "Asset" &&
    aaveOnly.length >= 1 &&
    aaveOnly.every((x) => /aave/i.test(x)) &&
    aLive === `${aaveOnly.length} ${aaveOnly.length === 1 ? "asset" : "assets"} shown`,
  `${aaveOnly.join(" ")} · ${aLive}`,
);
await page.keyboard.press("Escape");
await aHead.locator("[data-heading-filter-clear]").click();
await page.waitForTimeout(300);
// "Also used in" from its heading: the other explorers, by count; a choice
// keeps what that explorer also uses, ?also=<id>.
const alsoHead = page.locator("thead [data-heading-filter='also']");
await alsoHead.locator("[data-heading-filter-button]").click();
const alsoOpts = await page.$$eval("[data-heading-filter-menu='also'] [role=menuitemradio]", (as) =>
  as.map((a) => [a.getAttribute("data-heading-filter-option"), a.textContent.trim()]),
);
const pick = alsoOpts[1];
await page.click(`[data-heading-filter-menu='also'] [data-heading-filter-option='${pick?.[0]}']`);
await page.waitForTimeout(300);
const alsoLines = await page.$$eval("tr[data-asset-line]", (rs) =>
  rs.map((r) =>
    [...r.querySelectorAll("[data-asset-also] [data-asset-chip]")].map((c) => c.getAttribute("data-asset-chip")),
  ),
);
const expected = Number(/(\d+)$/.exec(pick?.[1] ?? "")?.[1]);
check(
  `2l "Also used in" from its heading: ${pick?.[1]}, ?also=${pick?.[0]}, only lines it also uses`,
  alsoOpts.length > 2 &&
    new URL(page.url()).searchParams.get("also") === pick?.[0] &&
    alsoLines.length > 0 &&
    // Its count is the lines it keeps; a line draws four marks then "+N", so
    // the explorer is read off the lines whose marks show it.
    alsoLines.length === expected &&
    alsoLines.filter((cs) => cs.length < 4).every((cs) => cs.includes(pick?.[0])) &&
    (await alsoHead.locator("[data-heading-filter-clear]").count()) === 1,
  `${alsoLines.length} lines, menu ${alsoOpts
    .map(([, t]) => t)
    .slice(0, 4)
    .join(" | ")}`,
);

// 2m a category the protocol's assets hold none of (a stale ?cat=) stays
// chosen: Liquity V2 has no governance asset.
await go(page, "/ethereum/liquity-v2/assets?cat=governance");
await page.waitForSelector('[data-asset-table="protocol"]', { timeout: 120_000 });
const sHead = page.locator("thead [data-heading-filter='category']");
const sText = ((await sHead.locator("[data-heading-filter-button]").textContent()) ?? "").trim();
const sNone = await page.locator("[data-asset-none]").count();
await sHead.locator("[data-heading-filter-clear]").click();
await page.waitForTimeout(300);
const sFocus = await page.evaluate(() => document.activeElement?.hasAttribute("data-heading-filter-button"));
check(
  '2m ?cat=governance on Liquity V2 (none there): the heading shows "Governance" chosen, "No asset matches."; × clears it, focus on the button',
  sText === "Category: Governance" && sNone === 1 && sFocus && !new URL(page.url()).searchParams.has("cat"),
  `${sText} · ${sNone} · ${sFocus}`,
);

// 2k the Focus's asset scope still holds the page: a view of USDC alone.
const fctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await fctx.addInitScript((usdc) => {
  localStorage.setItem(
    "rails-focus-views",
    JSON.stringify({
      views: [
        {
          id: "v786a",
          assets: [{ chain: 1, token: usdc, symbol: "USDC", builtOn: false }],
          chains: [],
          savedAt: Date.now(),
        },
      ],
      active: "v786a",
    }),
  );
}, USDC);
const fpage = await fctx.newPage();
fpage.on("pageerror", (e) => errors.push(`${fpage.url()}: ${e.message}`));
await fpage.goto(`${BASE}/ethereum/aave-v3/assets`, { waitUntil: "networkidle", timeout: 300_000 });
await fpage
  .waitForSelector("[data-asset-table][data-scope-ready], [data-scope-ready] [data-asset-table]", { timeout: 60_000 })
  .catch(() => {});
const fLines = await fpage.$$eval("tr[data-asset-line]", (rs) =>
  rs.filter((r) => r.getClientRects().length > 0).map((r) => r.getAttribute("data-asset-line")),
);
check(
  "2k with Focus on USDC, Aave V3's Assets holds USDC (and what is built on it) alone",
  fLines.length >= 1 && fLines.length < rows.length && fLines.includes(`1:${USDC}`),
  `${fLines.length} of ${rows.length}`,
);
await fctx.close();

// 3. Liquity V2's Assets
await go(page, "/ethereum/liquity-v2/assets");
await page.waitForSelector('[data-asset-table="protocol"]', { timeout: 120_000 });
const hl = await header(page);
check(
  "1c H5 on Liquity V2: Troves, Branches, Stability Pool, Assets, About",
  hl.entries.join("|") === "Troves|Branches|Stability Pool|Assets|About" && hl.current === "Assets",
  `${hl.entries.join("|")}; current ${hl.current}`,
);
const lq = await page.$$eval("tr[data-asset-line]", (rs) =>
  rs.map((r) => ({
    symbol: r.querySelector("[data-asset-name]")?.textContent.trim(),
    markets: [...r.querySelectorAll("[data-asset-market]")].map((a) => [a.textContent.trim(), a.getAttribute("href")]),
  })),
);
const weth = lq.find((r) => r.symbol === "WETH");
const bold = lq.find((r) => r.symbol === "BOLD");
check(
  "3a WETH links its branch and its troves",
  weth != null &&
    weth.markets.some(([t, h]) => t === "Branch" && h === "/ethereum/liquity-v2/branches") &&
    weth.markets.some(([, h]) => /collateralTypes=WETH/.test(h)),
  JSON.stringify(weth?.markets),
);
check(
  "3b BOLD links its Stability Pools",
  bold != null && bold.markets.some(([t]) => t === "Stability Pools"),
  JSON.stringify(bold?.markets),
);
await shot(page, "liquity-assets-1280");

// 4. USDC under Aave V3
await go(page, `/ethereum/aave-v3/assets/${USDC}`);
await page.waitForSelector("[data-asset-oracles]", { timeout: 120_000 });
const hu = await header(page);
check(
  "4a the asset page: H3 plain, Assets current",
  hu.identityLinks === 0 && hu.current === "Assets",
  `${hu.current}`,
);
const titleAave = (await page.locator("[data-asset-title]").textContent())?.trim();
const reserve = await page.$$eval('[data-anatomy="A1.10"] [data-asset-market]', (as) =>
  as.map((a) => a.getAttribute("href")),
);
check(
  '4b the page titled "USDC" links its reserve',
  titleAave === "USDC" && reserve[0] === `/ethereum/aave-v3/markets/${USDC}`,
  `${titleAave}; ${reserve.join(", ")}`,
);
const pills = await page.$$eval("[data-asset-oracles] a[data-asset-oracle-link]", (as) =>
  as.map((a) => [a.getAttribute("data-asset-oracle-link"), a.getAttribute("href")]),
);
const pillStatus = await Promise.all(pills.slice(0, 4).map(([, h]) => status(h)));
check(
  "4c the other oracles name their protocols, each link answering",
  pills.length > 2 &&
    // The page's protocol has no link in its table: its rows are unlinked.
    pills.every(([id]) => id !== "aave-v3") &&
    pills.every(([, h]) => /^\/ethereum\/[a-z0-9-]+\/assets\/0x[0-9a-f]{40}$/.test(h)) &&
    pillStatus.every((x) => x === 200 || x === 307 || x === 308),
  pills
    .map(([, h]) => h)
    .slice(0, 4)
    .join(", ") + ` · ${pillStatus.join(",")}`,
);
const canonical = () =>
  page.evaluate(() => document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null);
const canonAave = await canonical();
const charts = await page.locator('[data-anatomy="A2"]').count();
check("4d one chain section, Ethereum's", charts <= 1, `${charts}`);
await shot(page, "aave-usdc-1280");
// From WETH under Liquity V2, Aave V3's pill opens WETH under Aave V3.
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
await go(page, `/ethereum/liquity-v2/assets/${WETH}`);
await page.waitForSelector("[data-asset-oracles]", { timeout: 120_000 });
const canonLiquity = await canonical();
const toAave = `/ethereum/aave-v3/assets/${WETH}`;
const AAVE_LINK = '[data-asset-oracles] a[data-asset-oracle-link="aave-v3"]';
const aavePill = await page.getAttribute(AAVE_LINK, "href").catch(() => null);
check("4e WETH under Liquity V2: Aave V3's link opens WETH under Aave V3", aavePill === toAave, aavePill ?? "none");
await shot(page, "liquity-weth-1280");
if (aavePill === toAave) {
  await Promise.all([page.waitForURL((u) => u.pathname === toAave, { timeout: 120_000 }), page.click(AAVE_LINK)]);
  await page.waitForSelector('[data-anatomy="A7"]', { timeout: 120_000 });
}
const otherIn = (await page.locator("[data-asset-title]").textContent())?.trim();
const canonAaveWeth = await canonical();
check(
  "4f it lands under Aave V3, and both pages name one canonical URL",
  otherIn === "WETH" &&
    new URL(page.url()).pathname === toAave &&
    canonLiquity != null &&
    canonLiquity === canonAaveWeth,
  `${otherIn}; ${canonLiquity} / ${canonAaveWeth}; USDC's ${canonAave}`,
);

// 5. BOLD
check("5a BOLD under Liquity V2 answers 200", (await status(`/ethereum/liquity-v2/assets/${BOLD}`)) === 200);
check("5b BOLD under Aave V3 is a 404", (await status(`/ethereum/aave-v3/assets/${BOLD}`)) === 404);
await go(page, `/ethereum/liquity-v2/assets/${BOLD}`);
await shot(page, "liquity-bold-1280");

// 6. a front door
await go(page, "/arbitrum/aave-v3/positions");
const ha = await header(page);
check(
  '6 a front-door explorer\'s H5 opens with "Overview", its front door',
  ha.entries[0] === "Overview" && ha.hrefs[0] === "/arbitrum/aave-v3" && ha.identityLinks === 0,
  `${ha.entries.join("|")}`,
);

// 7. at 375
const phone = await open(375);
await go(phone, "/ethereum/aave-v3/assets");
await phone.waitForSelector('[data-asset-table="protocol"]', { timeout: 120_000 });
const wide = await phone.evaluate(() => document.documentElement.scrollWidth);
check("7a no sideways scroll at 375", wide <= 375, `${wide}px`);
const phoneLines = await phone.$$eval(
  "[data-phone-line]",
  (ls) => ls.filter((l) => l.getBoundingClientRect().height > 0).length,
);
check("7b each line reads as a card", phoneLines > 10, `${phoneLines}`);
// One plain search over every text column; no heading filters; a URL filter as a chip.
const pFilters = await phone.$$eval(
  "[data-heading-filter-button], [data-heading-search-open]",
  (bs) => bs.filter((b) => b.getClientRects().length > 0).length,
);
await phone.locator("[data-roster-controls] input").fill("morpho");
await phone.waitForTimeout(400);
const morphoLines = await phone.$$eval("tr[data-asset-line]", (rs) => rs.length);
check(
  '7b2 at 375 no heading filters; the one search reads explorer names too ("morpho")',
  pFilters === 0 && morphoLines > 3 && morphoLines < phoneLines,
  `${pFilters} filters, ${morphoLines} of ${phoneLines}`,
);
await go(phone, "/ethereum/aave-v3/assets?cat=stablecoin");
await phone.waitForSelector('[data-asset-table="protocol"]', { timeout: 120_000 });
const pchip = phone.locator("[data-heading-filter-chip='category']");
const pchipText = ((await pchip.textContent().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
await pchip.locator("[data-heading-filter-clear]").click();
await phone.waitForTimeout(400);
check(
  "7b3 at 375 ?cat=stablecoin shows a chip; its × clears it",
  pchipText === "Category: Stablecoin" && !new URL(phone.url()).searchParams.has("cat"),
  pchipText,
);
await shot(phone, "aave-assets-375");
await go(phone, `/ethereum/aave-v3/assets/${USDC}`);
await shot(phone, "aave-usdc-375");
const wide2 = await phone.evaluate(() => document.documentElement.scrollWidth);
check("7c the asset page: no sideways scroll at 375", wide2 <= 375, `${wide2}px`);

check("8 no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
