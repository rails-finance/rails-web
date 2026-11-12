// Tips and the provenance inspector (rails-ops TO-DO-ui-jobs 623).
// ----------------------------------------------------------------------------
// With the inspector armed, a RevealTip outside any pickable value (a label's
// rich tooltip, "Primary rate") still opens, on a click and on Enter; a press
// on a pickable figure, and on a tip inside one, opens the figure's receipt
// and no tooltip. Read on three families, since RevealTip is shared: a
// Liquity V2 Trove, an Aave V3 position and a MetaMorpho vault page.

import { chromium } from "playwright";
import { BASE, bypassHeaders } from "./lib/host.mjs";
import { HALO, armInspector } from "./lib/prov-inspector.mjs";

const PAGES = [
  {
    tag: "liquity-v2 trove",
    path: "/ethereum/liquity-v2/trove/WETH/102247037494986730506041632222868001124387697185626929998095238518734059870154",
  },
  { tag: "aave-v3 position", path: "/ethereum/aave-v3/0x8008316e61985599dc62d69716bab3ebe643c0a8?market=core" },
  { tag: "morpho vault", path: "/ethereum/morpho/vaults/0xbeef01735c132ada46aa9aa4c54623caa92a64cb" },
];

let checked = 0;
let failures = 0;
function check(name, ok, detail = "") {
  checked += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

/** Stamp the elements under test: `free` / `free-key` a tip (click / focusable)
 *  outside every pickable value, `fig` a pickable figure (one holding a tip
 *  where the page has one), `fig-tip` the tip inside it. */
const stamp = (page) =>
  page.evaluate(() => {
    const seen = (e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const tips = [...document.querySelectorAll("[data-reveal-tip]")].filter(seen);
    const free = tips.filter((t) => !t.closest("[data-prov-pickable]") && !t.querySelector("[data-prov-pickable]"));
    const out = { tips: tips.length, free: free.length };
    const a = free.find((t) => t.getAttribute("role") !== "button") ?? free[0];
    const k = free.find((t) => t.getAttribute("role") === "button");
    if (a) a.setAttribute("data-v623", "free");
    if (k && k !== a) k.setAttribute("data-v623", "free-key");
    else if (k) k.setAttribute("data-v623-key", "");
    const figs = [...document.querySelectorAll("[data-prov-pickable]")].filter(seen);
    const withTip = figs.find((f) => f.querySelector("[data-reveal-tip]"));
    const fig = withTip ?? figs[0];
    if (fig) fig.setAttribute("data-v623", "fig");
    if (withTip) withTip.querySelector("[data-reveal-tip]").setAttribute("data-v623", "fig-tip");
    out.figs = figs.length;
    out.figWithTip = Boolean(withTip);
    out.keyTip = Boolean(k);
    return out;
  });

const tipOpen = (page, sel) => page.evaluate((q) => Boolean(document.querySelector(`${q} [role="tooltip"]`)), sel);
const popOpen = async (page) => Boolean(await page.$(".prov-inspect-pop"));
const closePop = async (page) => {
  await page
    .locator(".prov-inspect-close")
    .click({ timeout: 3000 })
    .catch(() => {});
  await page.waitForTimeout(200);
};

const browser = await chromium.launch();
for (const { tag, path } of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, extraHTTPHeaders: bypassHeaders() });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForSelector("[data-reveal-tip]", { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const armed = await armInspector(page);
  check(`${tag}: the inspector arms`, armed && Boolean(await page.$(HALO)));
  await page.waitForTimeout(500);
  const s = await stamp(page);
  check(
    `${tag}: a tip outside the pickable values and a pickable figure are on the page`,
    s.free > 0 && s.figs > 0,
    JSON.stringify(s),
  );

  // A label's tip opens on a click while armed, and no receipt opens.
  const free = '[data-v623="free"]';
  if (await page.$(free)) {
    await page
      .locator(free)
      .scrollIntoViewIfNeeded()
      .catch(() => {});
    await page
      .locator(free)
      .click({ timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(300);
    const open = await tipOpen(page, free);
    check(`${tag}: armed, a click opens a tip outside the pickable values`, open && !(await popOpen(page)));
    await page
      .locator(free)
      .click({ timeout: 5000 })
      .catch(() => {});
  }
  // …and a focusable one on Enter and on Space.
  const key = (await page.$('[data-v623="free-key"]')) ? '[data-v623="free-key"]' : "[data-v623-key]";
  if (s.keyTip) {
    for (const k of ["Enter", " "]) {
      await page.locator(key).focus();
      await page.keyboard.press(k);
      await page.waitForTimeout(300);
      const expanded = await page.locator(key).getAttribute("aria-expanded");
      check(
        `${tag}: armed, ${k === " " ? "Space" : "Enter"} opens a focusable tip`,
        expanded === "true",
        expanded ?? "",
      );
      await page.keyboard.press(k);
      await page.waitForTimeout(200);
    }
  }

  // A press on a pickable figure opens its receipt and no tip.
  const fig = '[data-v623="fig"]';
  const pressAt = s.figWithTip ? '[data-v623="fig-tip"]' : fig;
  await page
    .locator(pressAt)
    .scrollIntoViewIfNeeded()
    .catch(() => {});
  await page
    .locator(pressAt)
    .click({ timeout: 5000 })
    .catch(() => {});
  await page.waitForTimeout(400);
  check(
    `${tag}: a click on a figure${s.figWithTip ? " (on the tip inside it)" : ""} opens its receipt`,
    (await popOpen(page)) && !(await tipOpen(page, fig)),
  );
  await closePop(page);
  // …and Enter on it (on the tip inside it, where that tip takes focus).
  const keyAt =
    s.figWithTip && (await page.locator('[data-v623="fig-tip"]').getAttribute("tabindex")) === "0"
      ? '[data-v623="fig-tip"]'
      : fig;
  await page.locator(keyAt).focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  check(`${tag}: Enter on a figure opens its receipt`, (await popOpen(page)) && !(await tipOpen(page, fig)), keyAt);
  await closePop(page);
  await ctx.close();
}
await browser.close();
console.log(`\n${checked - failures}/${checked} checks pass`);
process.exit(failures || checked === 0 ? 1 : 0);
