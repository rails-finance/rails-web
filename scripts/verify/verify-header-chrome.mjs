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
//
// THE CONTRACT FROM `md` UP ON AN APP ROUTE (rails-ops TO-DO-ui-jobs 68): the
// top bar is not drawn at all. BrandRail holds the mark, the theme toggle, the
// bookmark and the beta pill; the chain chooser sits at the right end of the
// protocol title row. Below `md` there is no rail and the bar carries every
// one of those controls, which is what the mobile block at the foot holds.
async function chromeState(page, path, expect) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  const header = page.locator("header").first();
  const barVisible = await header.isVisible();
  check(barVisible === expect.bar, `${path}: top bar ${expect.bar ? "drawn" : "not drawn"} (${barVisible})`);
  const burger = await header.locator('button[aria-label="Toggle menu"]').count();
  check(burger === 0, `${path}: no hamburger (${burger})`);
  if (!expect.bar) return;

  const cta = await header.locator('button[aria-label="Open an explorer"]').count();
  // `:visible`, not a bare count: a control can be hidden by a breakpoint class
  // rather than dropped from the tree, so a DOM count would assert nothing.
  const bookmarks = await header.locator('button[aria-label="Bookmarks"]:visible').count();
  const headerText = (await header.innerText()).replace(/\s+/g, " ");
  const pos = await header.evaluate((el) => getComputedStyle(el).position);

  check(cta === expect.cta, `${path}: explorer-cta ${cta === expect.cta ? "" : "un"}expected (${cta})`);
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
await chromeState(page, "/", { bar: true, cta: 1, bookmarks: 0, pos: "absolute" });
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
  await chromeState(page, p, { bar: true, cta: 1, bookmarks: 0, pos: "relative" });
}

// ── The app surfaces from `md` up: no bar, everything in the rail and the row ──
console.log("[app chrome @1280 on /ethereum/liquity-v2]");
await chromeState(page, "/ethereum/liquity-v2", { bar: false });
const rail = page.locator('aside[aria-label="Rails"]');
for (const [name, sel] of [
  ["the Rails mark", 'a[href="/"]'],
  ["the bookmark", 'button[aria-label="Bookmarks"]'],
  ["the theme toggle", 'button[aria-label^="Switch to"]'],
]) {
  const n = await rail.locator(`${sel}:visible`).count();
  check(n === 1, `the brand rail carries ${name} (${n})`);
}
// The rail is a surface, not a margin: an opaque background, and the same one
// the cards take (`bg-raised`).
const railBg = await rail.evaluate((el) => {
  const want = getComputedStyle(document.documentElement).getPropertyValue("--surface-raised").trim();
  const probe = document.createElement("div");
  probe.style.backgroundColor = want;
  document.body.appendChild(probe);
  const raised = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return { bg: getComputedStyle(el).backgroundColor, raised };
});
console.log("   ", JSON.stringify(railBg));
check(railBg.bg !== "rgba(0, 0, 0, 0)" && railBg.bg !== "transparent", `the rail paints a background (${railBg.bg})`);
check(railBg.bg === railBg.raised, `the rail takes the raised surface tone (${railBg.bg} vs ${railBg.raised})`);
// The beta pill: at the FOOT, below the bookmark, and drawn as a label coming
// out of the browser's left edge — square left corners, rounded right, x=0.
const pill = await page.evaluate(() => {
  const r = document.querySelector('aside[aria-label="Rails"]');
  const el = [...r.querySelectorAll("span")].find((s) => /^beta$/i.test(s.textContent.trim()));
  if (!el) return null;
  const cs = getComputedStyle(el);
  const mark = r.querySelector('button[aria-label="Bookmarks"]').getBoundingClientRect();
  const b = el.getBoundingClientRect();
  return {
    left: Math.round(b.left),
    topLeftRadius: cs.borderTopLeftRadius,
    bottomLeftRadius: cs.borderBottomLeftRadius,
    topRightRadius: cs.borderTopRightRadius,
    belowBookmark: b.top >= mark.bottom,
    inLowerHalf: b.top > window.innerHeight / 2,
  };
});
check(pill !== null, "the rail draws the beta pill");
if (pill) {
  console.log("   ", JSON.stringify(pill));
  check(pill.left === 0, `the beta pill starts at the browser's left edge (left=${pill.left})`);
  check(
    pill.topLeftRadius === "0px" && pill.bottomLeftRadius === "0px",
    `the beta pill is square on its left (${pill.topLeftRadius} / ${pill.bottomLeftRadius})`,
  );
  check(pill.topRightRadius !== "0px", `the beta pill is rounded on its right (${pill.topRightRadius})`);
  check(pill.belowBookmark, "the beta pill sits below the bookmark");
  check(pill.inLowerHalf, "the beta pill sits at the foot of the rail, not under the glyph");
}

// ── The protocol title row: size, case, tracking, and the chooser on it ──
console.log("[protocol title row @1280 on /ethereum/liquity-v2]");
const title = await page.evaluate(() => {
  const link = document.querySelector("[data-rail-identity]");
  const span = link.querySelector("span");
  const icon = link.querySelector("svg, img");
  const cs = getComputedStyle(span);
  // The bar's own trigger is still in the tree below `md`, hidden by a
  // breakpoint class, so take the one that is actually drawn.
  const trigger = [...document.querySelectorAll('button[aria-label="Switch blockchain"]')].find(
    (b) => b.getBoundingClientRect().width > 0,
  );
  const lb = link.getBoundingClientRect();
  const tb = trigger?.getBoundingClientRect();
  return {
    fontSize: cs.fontSize,
    transform: cs.textTransform,
    tracking: cs.letterSpacing,
    text: span.textContent.trim(),
    icon: [Math.round(icon.getBoundingClientRect().width), Math.round(icon.getBoundingClientRect().height)],
    chooserOnRow: !!tb && Math.abs((tb.top + tb.bottom) / 2 - (lb.top + lb.bottom) / 2) < 24,
    chooserRight: tb ? Math.round(tb.right) : null,
    lines: link.getClientRects().length,
  };
});
console.log("   ", JSON.stringify(title));
check(title.fontSize === "20px", `the protocol title is 20px (${title.fontSize})`);
check(title.transform === "none", `the protocol title is not upper-cased by CSS (${title.transform})`);
check(
  title.tracking === "normal" || title.tracking === "0px",
  `the protocol title carries no tracking (${title.tracking})`,
);
check(title.text === "Liquity V2", `the protocol title reads as written, not shouted (${title.text})`);
check(title.icon[0] === 32 && title.icon[1] === 32, `the protocol glyph is 32px square (${title.icon.join("x")})`);
check(title.chooserOnRow, "the chain chooser sits on the protocol title row");

// ── ml-auto regression: control cluster stays hard right where the bar exists ──
// It moved off the app routes with the bar itself (ui-jobs 68) — marketing is
// where the cluster still lives at this width.
console.log("[ml-auto cluster @1280 on /blog]");
await page.goto(BASE + "/blog", { waitUntil: "networkidle" });
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

// ── A position view keeps the chooser (ui-jobs 68's one open question) ──
// It draws no sub-nav and renders ProtocolIdentity alone, so if the chooser
// did not follow the identity there, the deepest app surface would be the one
// with no way to change chain above `md`.
console.log("[position view keeps the chooser @1280]");
await page.goto(BASE + "/ethereum/liquity-v2", { waitUntil: "networkidle" });
const trovePath = await page.evaluate(() => {
  const a = [...document.querySelectorAll('a[href^="/ethereum/liquity-v2/trove/"]')][0];
  return a ? new URL(a.href).pathname : null;
});
if (!trovePath) {
  check(false, "found a trove link on the Liquity V2 listing to open a position view with");
} else {
  await page.goto(BASE + trovePath, { waitUntil: "networkidle" });
  const posTrigger = await page.locator('button[aria-label="Switch blockchain"]:visible').count();
  check(posTrigger === 1, `a position view carries the chain chooser (${posTrigger})`);
  const posBar = await page.locator("header").first().isVisible();
  check(posBar === false, `a position view draws no top bar at 1280 (${posBar})`);
}

// ── Coverage reachability from an explorer ──
// The AppFooter's quiet Coverage link was retired deliberately (`7778cf09`,
// 2026-09-02, "trim the chrome around the list"). The chain switcher's panel
// carries the path now — CHAIN-AWARE, pointing at the coverage page whose
// matrix contains the explorer the reader is on.
//
// The trigger is located by its label rather than by "inside <header>": since
// ui-jobs 68 it sits on the protocol title row from `md` up and in the bar
// below `md`, and this block should hold either one to the same behaviour.
async function switcherCoverage(target, slug) {
  await target.locator('button[aria-label="Switch blockchain"]:visible').click();
  await target.waitForSelector(`a[href="/coverage/${slug}"]`, { timeout: 5000 }).catch(() => {});
  return target.locator(`a[href="/coverage/${slug}"]`).count();
}
console.log("[chain switcher on /ethereum/liquity-v2]");
await page.goto(BASE + "/ethereum/liquity-v2", { waitUntil: "networkidle" });
const switcherCov = await switcherCoverage(page, "ethereum");
check(switcherCov >= 1, `chain switcher reaches /coverage/ethereum on an Ethereum rail (${switcherCov})`);
// Base is a launched chain (rails-ops decision 0030, 2026-09-23), so a Base
// rail gets the same chrome as an Ethereum one: the chain trigger names Base,
// the panel offers the /coverage/base door and lists the Base explorers, and
// there is no work-in-progress strip.
console.log("[chrome on /base/moonwell — Base is launched]");
await page.goto(BASE + "/base/moonwell", { waitUntil: "networkidle" });
const baseChainTrigger = await page.locator('button[aria-label="Switch blockchain"]:visible').count();
check(baseChainTrigger === 1, `a Base rail names the chain trigger once (${baseChainTrigger})`);
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
// Below `md` the brand rail does not render and the bar carries the lot: mark,
// wordmark, bookmark, theme toggle, chain trigger (rails-ops TO-DO-ui-jobs
// 67, 68). The chooser is drawn ONCE — the title row's copy is `md` and up.
const mRail = await mob.locator('aside[aria-label="Rails"]').isVisible();
check(mRail === false, `mobile draws no brand rail (${mRail})`);
const mBookmarks = await mob.locator('header button[aria-label="Bookmarks"]:visible').count();
check(mBookmarks === 1, `mobile header keeps the bookmark (${mBookmarks})`);
const mToggle = await mob.locator('header button[aria-label^="Switch to"]:visible').count();
check(mToggle === 1, `mobile header keeps the theme toggle (${mToggle})`);
const mSwitcherAll = await mob.locator('button[aria-label="Switch blockchain"]:visible').count();
check(mSwitcherAll === 1, `mobile draws one chain trigger, not two (${mSwitcherAll})`);
const mWordmark = await mob.locator("header").first().innerText();
check(/Rails/.test(mWordmark), `mobile header keeps the Rails wordmark (${mWordmark.replace(/\s+/g, " ")})`);
// FRANKENCOIN is the roster's longest name: at 390 the title must stay on one
// line, and at 1440 it must not crowd the chooser it now shares a row with.
for (const [w, h] of [
  [390, 800],
  [1440, 900],
]) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.goto(BASE + "/ethereum/frankencoin", { waitUntil: "networkidle" });
  const t = await p.evaluate(() => {
    const link = document.querySelector("[data-rail-identity]");
    const trigger = [...document.querySelectorAll('button[aria-label="Switch blockchain"]')].find(
      (b) => b.getBoundingClientRect().width > 0,
    );
    const lb = link.getBoundingClientRect();
    const tb = trigger?.getBoundingClientRect();
    return {
      text: link.textContent.trim(),
      lines: link.getClientRects().length,
      gap: tb && tb.left > lb.right ? Math.round(tb.left - lb.right) : null,
    };
  });
  console.log(`    @${w}`, JSON.stringify(t));
  check(t.text === "Frankencoin", `@${w}: the longest name reads as written (${t.text})`);
  check(t.lines === 1, `@${w}: the longest name sits on one line (${t.lines})`);
  if (w >= 768) check(t.gap !== null && t.gap > 40, `@${w}: the title does not crowd the chooser (gap=${t.gap})`);
  await p.close();
}
const mCov = await switcherCoverage(mob, "ethereum");
check(mCov >= 1, `mobile chain switcher reaches /coverage/ethereum (${mCov})`);
await shoot(mob, "hdr-mobile");

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILURE(S)` : "\nALL CHECKS PASSED");
process.exitCode = fails.length ? 1 : 0;
