// Live check of the asset chart's line and the page around it (rails-ops
// reference/asset-key-map.md, "The chart engine"; Miles's mockup of 24 Nov
// 2026, ui-jobs 818), and of TradingView's attribution in the footers.
//
//   L1 the line: on WETH under Liquity V2 (decision 0069: an asset's page sits
//      under a protocol and reads from its side) the chart draws one line, the
//      price Liquity V2 uses, in blue at 2 px, with no legend; the panel's
//      header (A3.8) carries the price; no second chart.
//   L2 the page's words (H7, A1, A1.9, A2.3, A2.4, A2.7, A2.6): Back falling back
//      to Liquity V2's Assets list, the title "WETH", the source ending on the
//      WETH PriceFeed under the chart panel; "Also reads
//      this oracle" naming Moonwell; one oracle row per other line, Liquity
//      V2's line left out, each protocol link a page under
//      /ethereum/<protocol>/assets/<WETH>; the as-of line.
//   L3 attribution: the NOTICE and its link in the footer of /, a protocol's
//      Assets page and an asset page, and no TradingView logo in the asset chart.
//   L4 every page here, at 1440 and at 390 with touch, light and dark: no
//      horizontal overflow, no console error.
//
// Run:
//   BASE=http://localhost:3234 node scripts/verify/verify-asset-chart-lines.mjs

import { chromium } from "playwright";
import { BASE, bypassHeaders } from "./lib/host.mjs";

const NAV = { waitUntil: "domcontentloaded", timeout: 180000 };
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
// WETH from Liquity V2's side.
const ETH_VIA = `/ethereum/liquity-v2/assets/${WETH}`;
const PAGES = [
  ETH_VIA,
  "/base/aave-v3/assets/0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
  "/base/aave-v3/assets/0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452",
  // The resolver opens it under the first explorer that lists it.
  "/api/asset-page/ethereum/0xc18360217d8f7ab5e7c516566761ea12ce7f9d72",
];
const NOTICE = "TradingView Lightweight Charts™ Copyright (с) 2025 TradingView, Inc.";
const NOTICE_URL = "https://www.tradingview.com/";

let fails = 0;
let checks = 0;
function check(ok, label, detail = "") {
  checks++;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

/** The first chart's drawn state, once its lines are in. */
async function drawn(page) {
  await page.waitForSelector("[data-asset-lw-chart][data-asset-lw-drawn]", { timeout: 180000 });
  return page.evaluate(() => JSON.parse(document.querySelector("[data-asset-lw-chart]").dataset.assetLwDrawn));
}

async function layoutCheck(page, label, errors) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(over <= 0, `L4 ${label}: no horizontal overflow`, over > 0 ? `${over} px over` : "");
  check(errors.length === 0, `L4 ${label}: no console error`, errors.slice(0, 2).join(" | "));
}

const browser = await chromium.launch();
try {
  // L1 and L2 at 1440, light.
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      extraHTTPHeaders: bypassHeaders(),
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(BASE + ETH_VIA, NAV);
    const d = await drawn(page);
    const ids = Object.keys(d);
    check(ids.length === 1, "L1 the chart draws one line", ids.join(" "));
    check(d[ids[0]].width === 2, "L1 the line is 2 px", `${d[ids[0]].width}`);
    const head = await page.evaluate(() => ({
      legend: document.querySelectorAll("[data-asset-lw-chart] [data-asset-lw-legend], [data-asset-lw-line]").length,
      price: document.querySelector("[data-asset-lw-chart] [data-asset-head-price]")?.textContent.trim() ?? "",
    }));
    check(head.legend === 0, "L1 no legend under the header", `${head.legend}`);
    check(/^\$[\d,]+(\.\d+)?$|^–$/.test(head.price), "L1 the panel's header carries the price", head.price);
    check((await page.locator("[data-asset-lw-gap], [data-asset-lw-gap-box]").count()) === 0, "L1 no second chart");

    // L2 the page's words.
    const words = await page.evaluate(() => ({
      title: document.querySelector("[data-asset-title]")?.textContent.trim() ?? "",
      back: document.querySelector("[data-asset-back]")?.getAttribute("data-asset-back") ?? "",
      sourceAfterChart: !!document.querySelector("[data-asset-chart] ~ [data-asset-source-row] [data-asset-source]"),
      source: document.querySelector("[data-asset-source]")?.getAttribute("data-asset-source") ?? "",
      heading: document.querySelector("[data-asset-oracles] h2")?.textContent.trim() ?? "",
      intro: document.querySelector("[data-asset-oracles-intro]")?.textContent.trim() ?? "",
      headers: [...document.querySelectorAll("[data-asset-oracles] thead th")].map((th) => th.textContent.trim()),
      tableName: document.querySelector("[data-asset-oracles] table")?.getAttribute("aria-label") ?? "",
      rows: [...document.querySelectorAll("[data-asset-oracles] tr[data-asset-oracle]")].map((tr) => ({
        id: tr.dataset.assetOracle,
        group: tr.dataset.assetOracleGroup,
        text: tr.textContent.trim(),
        href: tr.dataset.assetOracleHref,
        rowLinks: tr.querySelectorAll("a[data-row-link]").length,
        label: tr.querySelector("a[data-row-link]")?.getAttribute("aria-label") ?? "",
        nestedLinks: tr.querySelectorAll("a:not([data-row-cover]):not([data-row-link])").length,
        expands: tr.querySelectorAll("details, summary").length,
      })),
      history: document.querySelector("[data-asset-source-row] [data-asset-history]")?.textContent.trim() ?? "",
      priceCents: /^\$[\d,]+\.\d{2}$/.test(
        document.querySelector("[data-asset-lw-chart] [data-asset-head-price]")?.textContent.trim() ?? "",
      ),
      asOf: document.querySelector("[data-asset-as-of]")?.textContent.trim() ?? "",
    }));
    check(words.title === "WETH", "L2 the title", words.title);
    check(words.back === "/ethereum/liquity-v2/assets", "L2 Back falls back to Liquity V2's Assets list", words.back);
    check(words.sourceAfterChart, "L2 the source row sits under the chart panel");
    check(
      words.source === "0xcc5f8102eb670c89a4a3c567c13851260303c24f",
      "L2 the source line ends on Liquity V2's WETH PriceFeed",
      words.source,
    );
    check(words.heading === "", "L2 the table has no heading", words.heading);
    check(
      /^The table below shows how other protocols on Ethereum price WETH: the oracle each one reads, its (latest price|price at one block and its gap from Liquity V2's price)\.$/.test(
        words.intro,
      ),
      "L2 the intro sentence above the table",
      words.intro,
    );
    check(
      !words.headers.includes("Contract") && ["Used by", "Oracle", "Price now"].every((h) => words.headers.includes(h)),
      "L2 the table has no Contract column",
      words.headers.join(" | "),
    );
    check(words.tableName === "How other protocols price WETH", "L2 the table keeps its name", words.tableName);
    const same = words.rows.filter((r) => r.group === "same");
    check(
      same.length === 1 && same[0].text.startsWith("Moonwell") && same[0].text.includes("Same oracle as Liquity V2"),
      "L2 Moonwell alone is on Liquity V2's oracle, in the table",
      same.map((r) => r.text).join(" | "),
    );
    const order = words.rows.map((r) => r.group).join(" ");
    check(/^(same )*(other )+(listed ?)*$/.test(`${order} `), "L2 the groups run same, other, listed", order);
    check(
      words.rows.filter((r) => r.group === "other").length >= 4,
      "L2 a row per other oracle",
      `${words.rows.length}`,
    );
    check(
      words.rows.filter((r) => r.group === "listed").every((r) => r.text.includes("Not saved by Rails")),
      "L2 a listed-only row reads Not saved by Rails",
    );
    check(
      !words.rows.some((r) => r.id === "1:0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419"),
      "L2 Liquity V2's line is not a row",
    );
    const links = words.rows.map((r) => r.href).filter(Boolean);
    check(
      links.length > 0 && links.every((h) => new RegExp(`^/ethereum/[a-z0-9-]+/assets/${WETH}$`).test(h)),
      "L2 each row links its protocol's page for WETH",
      links.join(" "),
    );
    check(
      words.rows.every((r) => r.rowLinks === (r.href ? 1 : 0)),
      "L2 a row is one link to its page, a plain row where the protocol has none",
    );
    check(
      new Set(words.rows.filter((r) => r.label).map((r) => r.label)).size === words.rows.filter((r) => r.label).length,
      "L2 each row link has its own accessible name",
    );
    check(
      words.rows.every((r) => r.expands === 0 && r.nestedLinks === 0),
      "L2 a row does not expand and holds no link of its own",
    );
    check(
      new Set(words.rows.map((r) => r.id)).size === words.rows.length &&
        words.rows.every((r) => !/\bV[0-9], [A-Z]/.test(r.text.slice(0, 40))),
      "L2 one row per protocol",
    );
    check(
      /^Stored since \d{1,2} \w{3} \d{4}$/.test(words.history),
      "L2 the page protocol's history, one line",
      words.history,
    );
    check(words.priceCents, "L2 the chart header's price carries cents");
    check(
      words.asOf === "" || /^As of /.test(words.asOf),
      "L2 the as-of line, where drawn, states one block (the stub draws none)",
      words.asOf,
    );
    await layoutCheck(page, "WETH under Liquity V2 1440 light", errors);
    await ctx.close();
  }

  // L3 attribution.
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      extraHTTPHeaders: bypassHeaders(),
    });
    const page = await ctx.newPage();
    for (const path of ["/", "/ethereum/aave-v3/assets", ETH_VIA]) {
      await page.goto(BASE + path, NAV);
      const f = await page
        .waitForSelector("footer [data-lw-attribution]", { timeout: 120000 })
        .then(() =>
          page.evaluate(() => {
            const el = document.querySelector("footer [data-lw-attribution]");
            return { text: el.textContent, href: el.querySelector("a")?.getAttribute("href") };
          }),
        )
        .catch(() => null);
      check(
        !!f && f.text.includes(NOTICE) && f.href === NOTICE_URL,
        `L3 ${path}: the footer carries the NOTICE and its link`,
        f ? f.text : "no footer notice",
      );
    }
    await page.waitForSelector("[data-asset-lw-box] canvas", { timeout: 120000 });
    const logo = await page.locator("[data-asset-lw-box] a[href*='tradingview'], #tv-attr-logo").count();
    check(logo === 0, "L3 the asset chart draws no TradingView logo", `${logo}`);
    await ctx.close();
  }

  // L4 every page at 1440 and 390 (touch), light and dark.
  for (const [w, touch] of [
    [1440, false],
    [390, true],
  ])
    for (const scheme of ["light", "dark"]) {
      const ctx = await browser.newContext({
        viewport: { width: w, height: 900 },
        hasTouch: touch,
        isMobile: touch,
        colorScheme: scheme,
        extraHTTPHeaders: bypassHeaders(),
      });
      await ctx.addInitScript((s) => localStorage.setItem("theme", s), scheme);
      const page = await ctx.newPage();
      for (const path of PAGES) {
        const errors = [];
        page.removeAllListeners("console");
        page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
        await page.goto(BASE + path, NAV);
        await page.waitForSelector("[data-asset-lw-box] canvas", { timeout: 180000 });
        await page.waitForTimeout(800);
        await layoutCheck(page, `${path} ${w} ${scheme}`, errors);
      }
      await ctx.close();
    }
} finally {
  await browser.close();
}
console.log(`\n${checks - fails}/${checks} checks pass`);
if (checks === 0 || fails > 0) process.exit(1);
