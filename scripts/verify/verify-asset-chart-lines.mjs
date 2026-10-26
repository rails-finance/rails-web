// Live check of the asset chart's line colours, hide/show and highlight
// (rails-ops TO-DO-ui-jobs 234; reference/asset-key-map.md, "Colour and the
// legend"), and of TradingView's attribution in the footers.
//
//   L1 colours: on ETH on Ethereum read from Liquity V2's WETH branch, every
//      line is drawn in a style (colour and dash) of its own, the main line in
//      blue at 2 px and the others at 1 px; each legend key's stroke is its
//      line's colour, and so is each spread row's key.
//   L2 the style follows the key: the page without `via` (another main line)
//      draws every line that is thin on both in the same colour and dash.
//   L3 hide/show: a thin line's row pressed hides it in both panes
//      (`visible: false`, the row marked hidden, aria-pressed false), "Show all
//      lines" draws it again; the main line's row has no button.
//   L4 highlight: a row hovered lights its line (alpha 1, a pixel wider) and
//      dims the others; the chart hovered over its lines lights one of them
//      and its legend row, and names it over the spread pane.
//   L5 attribution: the NOTICE and its link in the footer of /, /assets and an
//      asset page, and no TradingView logo in the asset chart.
//   L6 every page here, at 1440 and at 390 with touch, light and dark: no
//      horizontal overflow, no console error.
//
// Run:
//   BASE=http://localhost:3234 node scripts/verify/verify-asset-chart-lines.mjs

import { chromium } from "playwright";
import { BASE, bypassHeaders } from "./lib/host.mjs";

const NAV = { waitUntil: "domcontentloaded", timeout: 180000 };
const ETH = "/assets/ethereum/0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const ETH_VIA = `${ETH}?via=liquity:WETH`;
const PAGES = [
  ETH_VIA,
  "/assets/base/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "/assets/base/0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452?via=aave-v3-base",
  "/assets/ethereum/0xc18360217d8f7ab5e7c516566761ea12ce7f9d72",
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
/** Each legend row of the first chart: its id, key stroke as rgb, slot and dash. */
const legend = (page) =>
  page.evaluate(() =>
    [...document.querySelector("[data-asset-lw-chart]").querySelectorAll("[data-asset-lw-line]")].map((li) => {
      const line = li.querySelector("[data-line-key] line");
      return {
        id: li.dataset.assetLwLine,
        stroke: line ? getComputedStyle(line).stroke : null,
        dash: li.dataset.assetLwDash,
        button: !!li.querySelector("button[aria-pressed]"),
        pressed: li.querySelector("button[aria-pressed]")?.getAttribute("aria-pressed") ?? null,
        hidden: li.hasAttribute("data-asset-lw-hidden"),
        lit: li.hasAttribute("data-asset-lw-lit"),
      };
    }),
  );
const spreadKeys = (page) =>
  page.evaluate(() =>
    [...document.querySelector("[data-asset-lw-chart]").querySelectorAll("[data-asset-spread-line]")].map((li) => ({
      id: li.dataset.assetSpreadLine,
      stroke: li.querySelector("[data-line-key] line")
        ? getComputedStyle(li.querySelector("[data-line-key] line")).stroke
        : null,
    })),
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
  check(over <= 0, `L6 ${label}: no horizontal overflow`, over > 0 ? `${over} px over` : "");
  check(errors.length === 0, `L6 ${label}: no console error`, errors.slice(0, 2).join(" | "));
}

const browser = await chromium.launch();
try {
  // L1–L4 at 1440, light.
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
    const ids = rows.map((r) => r.id);
    const styles = ids.map((id) => `${rgb(d[id].color)}|${d[id].style}`);
    check(ids.length >= 4, "L1 the chart draws several lines", `${ids.length}`);
    check(new Set(styles).size === styles.length, "L1 every line in a style of its own", styles.join(" "));
    check(d[ids[0]].width === 2 && ids.slice(1).every((id) => d[id].width === 1), "L1 main 2 px, the others 1 px");
    const mismatch = rows.filter((r) => rgb(r.stroke) !== rgb(d[r.id].color));
    check(
      mismatch.length === 0,
      "L1 each legend key is its line's colour",
      mismatch.map((r) => `${r.id} ${r.stroke} vs ${d[r.id].color}`).join("; "),
    );
    const sk = await spreadKeys(page);
    (
      await asRgb(
        page,
        sk.map((r) => r.stroke),
      )
    ).forEach((c, i) => (sk[i].stroke = c));
    const smis = sk.filter((r) => rgb(r.stroke) !== rgb(d[r.id]?.color));
    check(
      sk.length === 0 || smis.length === 0,
      "L1 each spread row's key is its line's colour",
      `${sk.length} rows ${smis.map((r) => r.id).join(" ")}`,
    );

    // L3 hide/show.
    check(!rows[0].button, "L3 the main line's row has no button");
    const target = rows.find((r) => r.button);
    await page.click(`[data-asset-lw-line="${target.id}"] button`);
    await page.waitForTimeout(300);
    let d2 = await drawn(page);
    let r2 = (await legend(page)).find((r) => r.id === target.id);
    check(
      d2[target.id].visible === false && r2.hidden && r2.pressed === "false",
      "L3 a row pressed hides its line",
      JSON.stringify({ visible: d2[target.id].visible, ...r2 }),
    );
    check((await page.locator("[data-asset-lw-show-all]").count()) === 1, "L3 a Show all lines control appears");
    await page.click("[data-asset-lw-show-all]");
    await page.waitForTimeout(300);
    d2 = await drawn(page);
    check(
      Object.values(d2).every((x) => x.visible),
      "L3 Show all lines draws every line again",
    );

    // L3 a hidden line leaves the price axis: at 1D, every thin line hidden,
    // the axis spans the main line alone, narrower than with them all.
    await page.click('[data-asset-range="1D"]');
    await page.waitForTimeout(1200);
    const scale = async () =>
      (await page.getAttribute("[data-asset-lw-chart]", "data-asset-lw-scale")).split(",").map(Number);
    const [a0, a1] = await scale();
    for (const r of rows.filter((x) => x.button)) await page.click(`[data-asset-lw-line="${r.id}"] button`);
    await page.waitForTimeout(600);
    const [b0, b1] = await scale();
    check(
      b1 - b0 < a1 - a0,
      "L3 hidden lines leave the price axis's range",
      `${a0.toFixed(2)}–${a1.toFixed(2)} → ${b0.toFixed(2)}–${b1.toFixed(2)}`,
    );
    await page.click("[data-asset-lw-show-all]");
    await page.click('[data-asset-range="All"]');
    await page.waitForTimeout(1200);

    // L4 highlight from a row.
    await page.hover(`[data-asset-lw-line="${target.id}"] button`);
    await page.waitForTimeout(300);
    d2 = await drawn(page);
    const others = ids.filter((id) => id !== target.id);
    check(
      d2[target.id].alpha === 1 && d2[target.id].width === 2 && others.every((id) => d2[id].alpha < 0.5),
      "L4 a row hovered lights its line and dims the others",
      JSON.stringify(Object.fromEntries(ids.map((id) => [id.slice(-8), [d2[id].alpha, d2[id].width]]))),
    );
    await page.mouse.move(0, 0);
    await page.waitForTimeout(200);
    // L4 highlight from the chart: sweep the spread pane, then the price pane.
    const box = await page.locator("[data-asset-lw-box]").first().boundingBox();
    let hit = null;
    for (let y = box.y + box.height - 40; y > box.y + 10 && !hit; y -= 3) {
      await page.mouse.move(box.x + box.width * 0.5, y);
      await page.waitForTimeout(25);
      hit = await page.evaluate(
        () => document.querySelector("[data-asset-lw-chart] [data-asset-lw-lit]")?.dataset.assetLwLine ?? null,
      );
    }
    check(hit != null, "L4 the chart hovered lights a line's legend row", hit ?? "none lit");
    if (hit) {
      d2 = await drawn(page);
      check(d2[hit].alpha === 1, "L4 the line nearest the cursor is drawn lit", `${hit} alpha ${d2[hit].alpha}`);
      if (hit !== ids[0]) {
        const label = await page
          .getAttribute("[data-asset-lw-spread-label]", "data-asset-lw-spread-label")
          .catch(() => null);
        check(label === hit, "L4 the lit line is named over the spread pane", `${label}`);
      }
    }
    await layoutCheck(page, "ETH via liquity:WETH 1440 light", errors);

    // L2 the same keys without via.
    await page.goto(BASE + ETH, NAV);
    const d3 = await drawn(page);
    const main3 = (await legend(page))[0].id;
    const moved = ids
      .slice(1)
      .filter(
        (id) => id !== main3 && d3[id] && (rgb(d3[id].color) !== rgb(d[id].color) || d3[id].style !== d[id].style),
      );
    check(moved.length === 0, "L2 a line keeps its colour and dash when the main line changes", moved.join(" "));
    await ctx.close();
  }

  // L5 attribution.
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      extraHTTPHeaders: bypassHeaders(),
    });
    const page = await ctx.newPage();
    for (const path of ["/", "/assets", ETH_VIA]) {
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
        `L5 ${path}: the footer carries the NOTICE and its link`,
        f ? f.text : "no footer notice",
      );
    }
    await page.waitForSelector("[data-asset-lw-box] canvas", { timeout: 120000 });
    const logo = await page.locator("[data-asset-lw-box] a[href*='tradingview'], #tv-attr-logo").count();
    check(logo === 0, "L5 the asset chart draws no TradingView logo", `${logo}`);
    await ctx.close();
  }

  // L6 every page at 1440 and 390 (touch), light and dark.
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
        if (touch) {
          // A tap on a thin line's row hides it; a second shows it.
          const btn = page.locator("[data-asset-lw-chart] [data-asset-lw-line] button").first();
          if (await btn.count()) {
            await btn.tap();
            await page.waitForTimeout(250);
            const p1 = await btn.getAttribute("aria-pressed");
            await btn.tap();
            await page.waitForTimeout(250);
            const p2 = await btn.getAttribute("aria-pressed");
            check(
              p1 === "false" && p2 === "true",
              `L3 ${path} ${scheme} 390: a tap hides the line and a second shows it`,
              `${p1} ${p2}`,
            );
          }
        }
        await layoutCheck(page, `${path} ${w} ${scheme}`, errors);
      }
      await ctx.close();
    }
} finally {
  await browser.close();
}
console.log(`\n${checks - fails}/${checks} checks pass`);
if (checks === 0 || fails > 0) process.exit(1);
