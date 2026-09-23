import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
// Screenshots are a debugging aid, not an assertion. They used to hard-code an
// absolute path into one long-dead session's scratchpad directory, which throws
// ENOENT anywhere else — a guard must not die decorating its own output. Opt in
// with SHOT=/some/dir/name.png; each shot appends its own suffix. A path that
// cannot be written is reported and ignored, never a verdict.
async function shoot(target, suffix, opts) {
  if (!process.env.SHOT) return;
  const path = process.env.SHOT.replace(/(\.png)?$/i, `-${suffix}.png`);
  try {
    await target.screenshot({ path, ...opts });
  } catch (e) {
    console.log("  (screenshot skipped:", e.message, ")");
  }
}
const fails = [];
function check(cond, msg) {
  if (cond) console.log("  ok:", msg);
  else {
    console.log("  FAIL:", msg);
    fails.push(msg);
  }
}

const browser = await chromium.launch();

// The hamburger menu is retired: the roster lives in the ChainSwitcher panel
// (asserted by verify-polish-batch), and the site's own pages + socials live
// in the footers. This verifier holds the header to that shape — the burger
// locator stays so a resurrected hamburger turns the table red — and checks
// the footer really carries what the menu used to.
async function chromeState(page, path, expect) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  const header = page.locator("header").first();
  const cta = await header.locator('button[aria-label="Open an explorer"]').count();
  const burger = await header.locator('button[aria-label="Toggle menu"]').count();
  const bookmarks = await header.locator('button[aria-label="Bookmarks"]').count();
  const headerText = (await header.innerText()).replace(/\s+/g, " ");
  const pos = await header.evaluate((el) => getComputedStyle(el).position);

  check(cta === expect.cta, `${path}: explorer-cta ${cta === expect.cta ? "" : "un"}expected (${cta})`);
  check(burger === 0, `${path}: no hamburger (${burger})`);
  check(
    bookmarks === expect.bookmarks,
    `${path}: bookmarks ${bookmarks === expect.bookmarks ? "" : "un"}expected (${bookmarks})`,
  );
  check(!/Coverage/.test(headerText), `${path}: no inline "Coverage" text in the header strip`);
  check(pos === expect.pos, `${path}: header position=${pos} (want ${expect.pos})`);
}

// ── Chrome-state table (wide viewport) ──
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
console.log("[chrome states @1280]");
await chromeState(page, "/", { cta: 1, bookmarks: 0, pos: "absolute" });
// Every real app/(site) page: marketing chrome, but normal-flow (relative) header.
// (/about bare 308-redirects to / — the real page is /about/architecture.)
// Coverage is per-chain routes; both take marketing chrome (their prefix is
// in SITE_PREFIXES).
for (const p of [
  "/coverage/ethereum",
  "/coverage/base",
  "/about/architecture",
  "/blog",
  "/pulse",
  "/privacy",
  "/terms",
]) {
  await chromeState(page, p, { cta: 1, bookmarks: 0, pos: "relative" });
}
await chromeState(page, "/ethereum/liquity-v2", { cta: 0, bookmarks: 1, pos: "relative" });

// ── ml-auto regression: control cluster stays hard right on a wide app page ──
console.log("[ml-auto cluster @1280 on /liquity-v2]");
await page.goto(BASE + "/ethereum/liquity-v2", { waitUntil: "networkidle" });
const geo = await page.evaluate(() => {
  const header = document.querySelector("header");
  const container = header.querySelector("div");
  const cluster = [...header.querySelectorAll("div")].find((d) => d.className.includes("ml-auto"));
  const cr = cluster.getBoundingClientRect();
  const cc = container.getBoundingClientRect();
  return {
    clusterLeft: Math.round(cr.left),
    clusterRight: Math.round(cr.right),
    contRight: Math.round(cc.right),
    vw: window.innerWidth,
  };
});
console.log("   ", JSON.stringify(geo));
check(
  geo.clusterLeft > geo.vw * 0.5,
  `cluster sits in the right half (left=${geo.clusterLeft}, vw=${geo.vw}) — no ml-auto drift`,
);
check(
  Math.abs(geo.clusterRight - geo.contRight) <= 40,
  `cluster right edge hugs the container right (${geo.clusterRight} vs ${geo.contRight})`,
);

// ── Coverage reachability from an explorer ──
// The AppFooter's quiet Coverage link was retired deliberately (`7778cf09`,
// 2026-09-02, "trim the chrome around the list"). The chain switcher's panel
// carries the path now — CHAIN-AWARE, pointing at the coverage page whose
// matrix contains the explorer the reader is on.
async function switcherCoverage(target, slug) {
  await target.locator('header button[aria-label="Switch blockchain"]').click();
  await target.waitForSelector(`a[href="/coverage/${slug}"]`, { timeout: 5000 }).catch(() => {});
  return target.locator(`a[href="/coverage/${slug}"]`).count();
}
console.log("[chain switcher on /ethereum/liquity-v2]");
await page.goto(BASE + "/ethereum/liquity-v2", { waitUntil: "networkidle" });
const switcherCov = await switcherCoverage(page, "ethereum");
check(switcherCov >= 1, `chain switcher reaches /coverage/ethereum on an Ethereum rail (${switcherCov})`);
// Base is a launched chain (rails-ops decision 0030, 2026-09-23), so a Base
// rail gets the same header as an Ethereum one: the chain trigger names Base,
// the panel offers the /coverage/base door and lists the Base explorers, and
// there is no work-in-progress strip.
console.log("[header on /base/moonwell — Base is launched]");
await page.goto(BASE + "/base/moonwell", { waitUntil: "networkidle" });
const baseChainTrigger = await page.locator('header button[aria-label="Switch blockchain"]').count();
check(baseChainTrigger === 1, `a Base rail names the chain trigger (${baseChainTrigger})`);
const switcherCovBase = await switcherCoverage(page, "base");
check(switcherCovBase >= 1, `chain switcher reaches /coverage/base on a Base rail (${switcherCovBase})`);
const baseRows = await page.locator('[role="menu"] a[href^="/base/"]').count();
check(baseRows >= 1, `the switcher panel lists the Base explorer rows (${baseRows})`);
await page.keyboard.press("Escape");
const wipStrip = await page.locator("[data-work-in-progress]").count();
check(wipStrip === 0, `a launched rail carries no work-in-progress strip (${wipStrip})`);
await shoot(page, "chain-switcher-coverage", { fullPage: false });

// Marketing routes: SiteFooter carries Coverage and the Connect block.
console.log("[site footer on /blog]");
await page.goto(BASE + "/blog", { waitUntil: "networkidle" });
const siteFooter = page.locator("footer").last();
const siteCov = await siteFooter.locator('a[href="/coverage/ethereum"]').count();
check(siteCov >= 1, `site footer links /coverage/ethereum (${siteCov})`);
for (const [name, href] of [
  ["X", "https://x.com/rails_finance"],
  ["YouTube", "https://www.youtube.com/@rails_finance"],
  ["GitHub", "https://github.com/rails-finance"],
  ["Telegram", "https://t.me/railsfinance"],
]) {
  const n = await siteFooter.locator(`a[href="${href}"]`).count();
  check(n >= 1, `site footer links ${name} (${n})`);
}

// ── Mobile (@390): same header shape, no sheet to open, footer still there ──
console.log("[mobile @390]");
const mob = await browser.newPage({ viewport: { width: 390, height: 800 } });
await mob.goto(BASE + "/ethereum/liquity-v2", { waitUntil: "networkidle" });
const mBurger = await mob.locator('header button[aria-label="Toggle menu"]').count();
const mSwitcher = await mob.locator('header button[aria-label="Switch blockchain"]').count();
check(mBurger === 0, `mobile header has no hamburger (${mBurger})`);
check(mSwitcher === 1, `mobile header keeps the chain switcher trigger (${mSwitcher})`);
const mCov = await switcherCoverage(mob, "ethereum");
check(mCov >= 1, `mobile chain switcher reaches /coverage/ethereum (${mCov})`);
await shoot(mob, "hdr-mobile");

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILURE(S)` : "\nALL CHECKS PASSED");
process.exitCode = fails.length ? 1 : 0;
