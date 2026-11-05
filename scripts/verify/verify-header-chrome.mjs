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
// top bar is not drawn at all, on the app and the site pages alike (ui-jobs
// 498). BrandRail holds the mark, the search's glyph, the chooser, the theme
// toggle and the beta pill; H20 stands at the column's top right. Below `md` there is no rail and the bar carries
// every one of those controls, which is what the mobile block at the foot
// holds. The separate bookmarks button (H11) went on 1 Nov 2026: the glyph
// opens the wallet panel, where the bookmarks are listed, so its locator stays
// only to turn the table red if the button comes back.
async function chromeState(page, path, expect) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  const header = page.locator("header").first();
  const barVisible = await header.isVisible();
  check(barVisible === expect.bar, `${path}: top bar ${expect.bar ? "drawn" : "not drawn"} (${barVisible})`);
  const burger = await header.locator('button[aria-label="Toggle menu"]').count();
  check(burger === 0, `${path}: no hamburger (${burger})`);
  if (!expect.bar) return;

  const cta = await header.locator('button[aria-label="Open an explorer"]:visible').count();
  // `:visible`, not a bare count: a control can be hidden by a breakpoint class
  // rather than dropped from the tree, so a DOM count would assert nothing.
  const bookmarks = await header.locator('button[aria-label="Bookmarks"]:visible').count();
  const headerText = (await header.innerText()).replace(/\s+/g, " ");
  const pos = await header.evaluate((el) => getComputedStyle(el).position);

  check(cta === expect.cta, `${path}: explorer-cta ${cta === expect.cta ? "" : "un"}expected (${cta})`);
  check(bookmarks === 0, `${path}: no bookmarks button, retired 1 Nov 2026 (${bookmarks})`);
  check(!/Coverage/.test(headerText), `${path}: no inline "Coverage" text in the header strip`);
  check(pos === expect.pos, `${path}: header position=${pos} (want ${expect.pos})`);
}

// ── Chrome-state table (wide viewport) ──
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
console.log("[chrome states @1280]");
// Every app/(site) page stands in the rail shell from md, as the app pages do
// (ui-jobs 498): no bar, the rail and H20 drawn, no "Open an explorer" pill.
for (const p of [
  "/",
  "/coverage/ethereum",
  "/coverage/base",
  "/about",
  "/about/architecture",
  "/blog",
  "/pulse",
  "/privacy",
  "/terms",
]) {
  await chromeState(page, p, { bar: false });
  const siteRail = await page.locator('aside[data-anatomy="H1"] button[data-search-launcher="rail"]:visible').count();
  const siteFace = await page.locator('[data-profile-corner] [data-anatomy="H20"]:visible').count();
  const pill = await page.locator('button[aria-label="Open an explorer"]:visible').count();
  check(siteRail === 1 && siteFace === 1, `${p}: the rail's search glyph and H20 drawn (${siteRail}, ${siteFace})`);
  check(pill === 0, `${p}: no "Open an explorer" pill or grid glyph, ui-jobs 503 (${pill})`);
}

// ── The app surfaces from `md` up: no bar, everything in the rail and the row ──
console.log("[app chrome @1280 on /ethereum/liquity-v2]");
await chromeState(page, "/ethereum/liquity-v2", { bar: false });
const rail = page.locator('aside[aria-label="Rails"]');
for (const [name, sel] of [
  ["the Rails mark", 'a[href="/"]'],
  ["the search's glyph", 'button[data-anatomy="H15.1"]'],
]) {
  const n = await rail.locator(`${sel}:visible`).count();
  check(n === 1, `the brand rail carries ${name} (${n})`);
}
// The theme is set in the profile control's menu from md (ui-jobs 504).
const railToggle = await rail.locator('button[aria-label^="Switch to"]').count();
check(railToggle === 0, `the brand rail carries no theme toggle, ui-jobs 504 (${railToggle})`);
// The grid glyph (497) went with ui-jobs 503: the chooser is in the wallet panel.
const railGrid = await rail.locator("button[data-chooser-trigger]").count();
check(railGrid === 0, `the brand rail carries no grid glyph, ui-jobs 503 (${railGrid})`);
const railBookmarks = await rail.locator('button[aria-label="Bookmarks"]').count();
check(railBookmarks === 0, `the brand rail carries no bookmarks button, retired 1 Nov 2026 (${railBookmarks})`);
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
// The beta pill: at the FOOT, drawn as a full-width
// strip across the rail from the browser's left edge, square on every corner,
// x=0 (c0534d67, 13 Oct 2026).
const pill = await page.evaluate(() => {
  const r = document.querySelector('aside[aria-label="Rails"]');
  const el = [...r.querySelectorAll("span")].find((s) => /^beta$/i.test(s.textContent.trim()));
  if (!el) return null;
  const cs = getComputedStyle(el);
  const b = el.getBoundingClientRect();
  return {
    left: Math.round(b.left),
    topLeftRadius: cs.borderTopLeftRadius,
    bottomLeftRadius: cs.borderBottomLeftRadius,
    topRightRadius: cs.borderTopRightRadius,
    width: Math.round(b.width),
    railWidth: Math.round(r.getBoundingClientRect().width),
    atFoot: Math.round(b.bottom) === Math.round(r.getBoundingClientRect().bottom),
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
  check(pill.topRightRadius === "0px", `the beta pill is square on its right (${pill.topRightRadius})`);
  check(pill.width === pill.railWidth, `the beta pill spans the rail (${pill.width} of ${pill.railWidth}px)`);
  check(pill.atFoot, "the beta pill sits at the rail's foot");
  check(pill.inLowerHalf, "the beta pill sits at the foot of the rail, not under the glyph");
}

// ── The protocol title row: size, case, tracking, and the chain's label on it ──
console.log("[protocol title row @1280 on /ethereum/liquity-v2]");
const title = await page.evaluate(() => {
  const link = document.querySelector("[data-rail-identity]");
  const span = link.querySelector("span");
  const icon = link.querySelector("svg, img");
  const cs = getComputedStyle(span);
  // The chain's label (ui-jobs 497) stands where the chooser did; the
  // chooser is the rail's.
  const trigger = document.querySelector("[data-anatomy='H3'] [data-chain-label]");
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
check(title.chooserOnRow, "the chain's label sits on the protocol title row");
const rowButtons = await page.locator("[data-anatomy='H3'] button[aria-haspopup='menu']").count();
check(rowButtons === 0, `the title row draws no chooser; the rail carries it (${rowButtons})`);

// ── ml-auto regression: control cluster stays hard right where the bar exists ──
// The bar is drawn below md only, on every page (ui-jobs 68, 498).
console.log("[ml-auto cluster @390 on /blog]");
const narrow = await browser.newPage({ viewport: { width: 390, height: 800 } });
await narrow.goto(BASE + "/blog", { waitUntil: "networkidle" });
const geo = await narrow.evaluate(() => {
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
await narrow.close();

// ── A position view draws the wallet heading and no chooser (decision 0052) ──
// The chain switch stays on the home page, the listings, the info and markets
// pages; the protocol's name in the card's sidebar is the way to the explorer
// (ui-jobs 430), and no line under the heading names the protocol.
console.log("[position view: no chooser, the sidebar link @1280]");
await page.goto(BASE + "/ethereum/liquity-v2", { waitUntil: "networkidle" });
const trovePath = await page.evaluate(() => {
  const a = [...document.querySelectorAll('a[href^="/ethereum/liquity-v2/trove/"]')][0];
  return a ? new URL(a.href).pathname : null;
});
if (!trovePath) {
  check(false, "found a trove link on the Liquity V2 listing to open a position view with");
} else {
  await page.goto(BASE + trovePath, { waitUntil: "networkidle" });
  // Decision 0052: the wallet heading frames a position page; the card's
  // sidebar name links to the explorer. The chooser is in the wallet panel
  // (ui-jobs 503), whose glyph is drawn here once, in the rail.
  const posTrigger = await page.locator("button[data-search-launcher]:visible").count();
  const posRail = await page.locator('aside[data-anatomy="H1"] button[data-search-launcher]:visible').count();
  check(
    posTrigger === 1 && posRail === 1,
    `a position view draws the panel's glyph once, in the rail, at 1280 (${posTrigger}, ${posRail})`,
  );
  await page.waitForSelector("[data-anatomy='C20'] a[data-rail-identity]", { timeout: 15000 }).catch(() => {});
  const posLink = await page
    .locator("[data-anatomy='C20'] a[data-rail-identity]")
    .first()
    .getAttribute("href")
    .catch(() => null);
  check(posLink === "/ethereum/liquity-v2", `a position view's sidebar name links to the explorer (${posLink})`);
  const posLine = await page.locator("[data-position-wallet-row] [data-rail-identity]").count();
  check(posLine === 0, `the wallet heading draws no protocol line (${posLine})`);
  const posBar = await page.locator("header").first().isVisible();
  check(posBar === false, `a position view draws no top bar at 1280 (${posBar})`);
}

// ── Coverage reachability from an explorer ──
// The AppFooter's quiet Coverage link was retired deliberately (`7778cf09`,
// 2026-09-02, "trim the chrome around the list"). The chain switcher's panel
// carries the path now — CHAIN-AWARE, pointing at the coverage page whose
// matrix contains the explorer the reader is on.
//
// The chooser is in the wallet panel (ui-jobs 503), opened by the search's
// glyph: in the rail from `md`, in the bar below it. The chooser opens on
// Ethereum whatever the page (ui-jobs 497); another chain's door is one press
// on its glyph.
// The chooser carries no coverage link (Miles, 5 Nov 2026): the count is of
// the chain's explorer rows, and of coverage links, which must be none.
async function chooserRows(target, slug, chainName) {
  await target.locator("button[data-search-launcher]:visible").click();
  await target.waitForSelector("[data-explorer-chooser]", { state: "visible", timeout: 5000 }).catch(() => {});
  if (chainName) await target.locator(`[data-switcher-tabs] [role="tab"][aria-label="${chainName}"]`).click();
  const rows = await target
    .locator(`[data-explorer-chooser] a[data-switcher-explorer][href^="/${slug}/"]:visible`)
    .count();
  const coverage = await target.locator('[data-explorer-chooser] a[href^="/coverage/"]').count();
  return coverage === 0 ? rows : -coverage;
}
console.log("[chain switcher on /ethereum/liquity-v2]");
await page.goto(BASE + "/ethereum/liquity-v2", { waitUntil: "networkidle" });
const switcherCov = await chooserRows(page, "ethereum");
check(switcherCov >= 1, `chooser lists Ethereum's explorers, no coverage link, on an Ethereum rail (${switcherCov})`);
// Base is a launched chain (rails-ops decision 0030, 2026-09-23), so a Base
// rail gets the same chrome as an Ethereum one: the chain trigger names Base,
// the panel offers the /coverage/base door and lists the Base explorers, and
// there is no work-in-progress strip.
console.log("[chrome on /base/moonwell — Base is launched]");
await page.goto(BASE + "/base/moonwell", { waitUntil: "networkidle" });
const baseChainTrigger = await page.locator("button[data-search-launcher]:visible").count();
check(baseChainTrigger === 1, `a Base rail draws the panel's glyph once (${baseChainTrigger})`);
const baseLabel = await page.locator("[data-anatomy='H3'] [data-chain-label='base']").count();
check(baseLabel === 1, `a Base rail names its chain on the title row (${baseLabel})`);
const switcherCovBase = await chooserRows(page, "base", "Base");
check(switcherCovBase >= 1, `chooser lists Base's explorers, no coverage link, on a Base rail (${switcherCovBase})`);
const baseRows = await page.locator('[data-explorer-chooser] a[data-switcher-explorer][href^="/base/"]').count();
check(baseRows >= 1, `the chooser lists the Base explorer rows (${baseRows})`);
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
  ["GitHub", "https://github.com/rails-finance/rails-web"],
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
check(mBurger === 0, `mobile header has no hamburger (${mBurger})`);
// Below `md` the brand rail does not render and the bar carries the lot: mark,
// H20 and the search's glyph (rails-ops TO-DO-ui-jobs 67, 68, 507). The
// search's glyph opens the panel with the chooser (503).
const mRail = await mob.locator('aside[aria-label="Rails"]').isVisible();
check(mRail === false, `mobile draws no brand rail (${mRail})`);
const mLauncher = await mob.locator('header button[data-anatomy="H15.1"]:visible').count();
check(mLauncher === 1, `mobile header keeps the search's glyph (${mLauncher})`);
const mBookmarks = await mob.locator('header button[aria-label="Bookmarks"]').count();
check(mBookmarks === 0, `mobile header carries no bookmarks button, retired 1 Nov 2026 (${mBookmarks})`);
const mToggle = await mob.locator('header button[aria-label^="Switch to"]:visible').count();
check(mToggle === 0, `mobile header carries no theme toggle, its switch is in H20's menu, ui-jobs 507 (${mToggle})`);
const mSwitcherAll = await mob.locator("button[data-chooser-trigger]").count();
check(mSwitcherAll === 0, `mobile draws no grid glyph, ui-jobs 503 (${mSwitcherAll})`);
const mOrder = await mob.evaluate(() => {
  const c = document.querySelector('header button[data-search-launcher="header"]');
  const f = document.querySelector('header [data-anatomy="H20"]');
  return !!c && !!f && f.getBoundingClientRect().right <= c.getBoundingClientRect().left;
});
check(mOrder, "mobile header draws the profile control before the search's glyph, which ends the row (ui-jobs 507)");
// The app header carries the mark alone and the chain glyph without its name
// (Miles 18 Oct 2026).
const mHome = await mob.locator('header a[aria-label="Rails home"]:visible').count();
check(mHome === 1, `mobile header carries the Rails mark as the home link (${mHome})`);
const mWordmark = await mob.locator("header").first().innerText();
check(!/Rails|Ethereum/i.test(mWordmark), `mobile header shows neither word (${mWordmark.replace(/\s+/g, " ")})`);
// The phone header on home (Miles, 5 Nov 2026): the mark on the left, then
// "Start here", H20 and the search's glyph on the right (ui-jobs 507). The
// beta pill is in the footer below md, and the rail's from md.
const mHomePage = await browser.newPage({ viewport: { width: 390, height: 800 } });
await mHomePage.goto(BASE + "/", { waitUntil: "networkidle" });
const mHomeOrder = await mHomePage.evaluate(() => {
  const at = (sel) => document.querySelector(`header[data-anatomy="H2"] ${sel}`)?.getBoundingClientRect().left ?? null;
  return [
    at('a[aria-label="Rails home"]'),
    at("[data-start-here]"),
    at('[data-anatomy="H20"]'),
    at('button[data-search-launcher="header"]'),
  ];
});
check(
  mHomeOrder.every((x, i) => x !== null && (i === 0 || x > mHomeOrder[i - 1])),
  `home @390: mark, Start here, H20, search left to right (${mHomeOrder.join(", ")})`,
);
const mHeaderBeta = await mHomePage.locator('header[data-anatomy="H2"]').first().innerText();
check(!/beta/i.test(mHeaderBeta), "home @390: the header carries no beta pill");
const mFooterBeta = await mHomePage.locator("footer [data-phone-beta]").isVisible();
check(mFooterBeta, "home @390: the beta pill is in the footer");
// The profile control's menu (ui-jobs 504): a menu button; with nothing
// saved, the line on saving one and the theme switch; a full-width sheet at
// the foot of the screen (ui-jobs 507)
// below md; Escape closes it and returns focus.
const h20 = mHomePage.locator('header [data-anatomy="H20"]');
check((await h20.getAttribute("aria-haspopup")) === "menu", "H20 is a menu button");
await h20.click();
const sheet = await mHomePage.evaluate(() => {
  const m = document.querySelector("[data-profile-menu]");
  const r = m?.getBoundingClientRect();
  return {
    role: m?.getAttribute("role"),
    width: r ? Math.round(r.width) : 0,
    bottom: r ? Math.round(r.bottom) : 0,
    empty: !!m?.querySelector("[data-profile-menu-empty]"),
    themes: [...(m?.querySelectorAll("[data-theme-option]") ?? [])].map((b) => b.textContent.trim()).join(","),
    manage: !!m?.querySelector('[data-profile-menu-manage][href="/bookmarks"]'),
    scrim: !!document.querySelector("[data-profile-menu-scrim]"),
  };
});
check(
  sheet.role === "menu" &&
    sheet.width === 390 &&
    sheet.bottom === 800 &&
    sheet.empty &&
    sheet.manage &&
    sheet.scrim &&
    sheet.themes === "Light,Dark,Auto",
  `home @390: H20 opens a full-width sheet at the screen's foot over a dim: the saving line, Manage wallets, the theme switch (${JSON.stringify(sheet)})`,
);
// A press on the dim closes the sheet.
await mHomePage.waitForTimeout(300);
await mHomePage.mouse.click(195, 200);
const dimClosed = await mHomePage.evaluate(() => !document.querySelector("[data-profile-menu]"));
check(dimClosed, "home @390: a press on the dim closes the menu");
await h20.click();
await mHomePage.keyboard.press("Escape");
const h20Back = await mHomePage.evaluate(
  () =>
    !document.querySelector("[data-profile-menu]") && document.activeElement?.getAttribute("data-anatomy") === "H20",
);
check(h20Back, "home @390: Escape closes the menu and focus returns to H20");
// A second press where the control is closes the sheet and leaves it closed.
const h20Box = await h20.boundingBox();
await h20.click();
await mHomePage.waitForTimeout(300);
await mHomePage.mouse.click(h20Box.x + h20Box.width / 2, h20Box.y + h20Box.height / 2);
await mHomePage.waitForTimeout(300);
const samePlaceClosed = await mHomePage.evaluate(() => !document.querySelector("[data-profile-menu]"));
check(samePlaceClosed, "home @390: a second press on H20's place closes the sheet");
await mHomePage.close();
const dFooterBeta = await page.locator("footer [data-phone-beta]:visible").count();
check(dFooterBeta === 0, `@1280: the footer's beta pill is hidden, the rail carries it (${dFooterBeta})`);
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
    const trigger = document.querySelector("[data-anatomy='H3'] [data-chain-label]");
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
  if (w >= 768) check(t.gap !== null && t.gap > 40, `@${w}: the title does not crowd the chain's label (gap=${t.gap})`);
  await p.close();
}
const mCov = await chooserRows(mob, "ethereum");
check(mCov >= 1, `mobile chooser lists Ethereum's explorers, no coverage link (${mCov})`);
await shoot(mob, "hdr-mobile");

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILURE(S)` : "\nALL CHECKS PASSED");
process.exitCode = fails.length ? 1 : 0;
