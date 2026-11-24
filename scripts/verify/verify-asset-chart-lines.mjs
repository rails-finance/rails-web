// Live check of the asset chart's line, the list of other protocols under it
// (rails-ops reference/asset-key-map.md, "The chart engine"; Miles, 24 Nov
// 2026, ui-jobs 818), and of TradingView's attribution in the footers.
//
//   L1 the line: on WETH under Liquity V2 (decision 0069: an asset's page sits
//      under a protocol and reads from its side) the chart draws one line, the
//      price Liquity V2 uses, in blue at 2 px; its legend key's stroke is its
//      colour; no second chart.
//   L2 the list (A2.2): one entry per other line, Liquity V2 left out, each
//      protocol link a page under /ethereum/<protocol>/assets/<WETH>, and
//      "the same feed as Liquity V2" on Moonwell's entry alone.
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
/** Each legend row of the chart: its id and key stroke. */
const legend = (page) =>
  page.evaluate(() =>
    [...document.querySelector("[data-asset-lw-chart]").querySelectorAll("[data-asset-lw-line]")].map((li) => {
      const line = li.querySelector("[data-line-key] line");
      return { id: li.dataset.assetLwLine, stroke: line ? getComputedStyle(line).stroke : null };
    }),
  );
const rgb = (c) => (c ?? "").replace(/rgba?\(([^,]+),\s*([^,]+),\s*([^,)]+).*/, "$1,$2,$3");
/** A CSS colour (oklch from the tokens) as the rgba() a canvas paints it. */
const asRgb = (page, list) =>
  page.evaluate((cs) => {
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    return cs.map((c) => {
      if (!c) return null;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return `rgba(${r}, ${g}, ${b}, 1)`;
    });
  }, list);

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
    const rows = await legend(page);
    (
      await asRgb(
        page,
        rows.map((r) => r.stroke),
      )
    ).forEach((c, i) => (rows[i].stroke = c));
    const ids = Object.keys(d);
    check(ids.length === 1 && rows.length === 1 && rows[0].id === ids[0], "L1 the chart draws one line", ids.join(" "));
    check(d[ids[0]].width === 2, "L1 the line is 2 px", `${d[ids[0]].width}`);
    check(rgb(rows[0].stroke) === rgb(d[ids[0]].color), "L1 the legend key is the line's colour", `${rows[0].stroke}`);
    check((await page.locator("[data-asset-lw-gap], [data-asset-lw-gap-box]").count()) === 0, "L1 no second chart");

    // L2 the list of other protocols.
    const list = await page.evaluate(() =>
      [...document.querySelectorAll("[data-asset-readers] [data-asset-reader]")].map((li) => ({
        id: li.dataset.assetReader,
        same: li.dataset.assetSameFeed ?? null,
        text: li.textContent,
        links: [...li.querySelectorAll("a[data-asset-reader-link]")].map((a) => a.getAttribute("href")),
      })),
    );
    check(list.length >= 4, "L2 the list has an entry per other line", `${list.length}`);
    const links = list.flatMap((e) => e.links);
    check(
      links.length > 0 && links.every((h) => new RegExp(`^/ethereum/[a-z0-9-]+/assets/${WETH}$`).test(h)),
      "L2 each protocol links its page for WETH",
      links.join(" "),
    );
    check(!links.some((h) => h.includes("/liquity-v2/")), "L2 Liquity V2 is left out");
    const same = list.filter((e) => e.same);
    check(
      same.length === 1 && same[0].same === "Liquity V2" && same[0].text.startsWith("Moonwell"),
      "L2 Moonwell alone reads the same feed as Liquity V2",
      same.map((e) => e.text).join(" | "),
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
