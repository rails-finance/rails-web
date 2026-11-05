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
// THE CONTRACT AT EVERY WIDTH (rails-ops TO-DO-ui-jobs 509): the brand rail
// (H1) is retired and the top bar is drawn on every page, the site's and the
// app's: the Rails mark with its chevron (H15.1) at the left, which opens the
// wallet panel, and H20 at the right; the theme is in H20's menu and the beta
// pill in the footers. The separate bookmarks button (H11) went on 1 Nov
// 2026; its locator stays only to turn the table red if it comes back.
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
// Every page draws the bar at 1280 (ui-jobs 509): absolute over the hero on
// home, in the flow elsewhere; the launcher and H20 in it, no rail.
for (const [p, pos] of [
  ["/", "absolute"],
  ["/coverage/ethereum", "relative"],
  ["/coverage/base", "relative"],
  ["/about", "relative"],
  ["/about/architecture", "relative"],
  ["/blog", "relative"],
  ["/pulse", "relative"],
  ["/privacy", "relative"],
  ["/terms", "relative"],
  ["/ethereum/liquity-v2", "relative"],
]) {
  await chromeState(page, p, { bar: true, cta: 0, pos });
  const launcher = await page.locator('header button[data-search-launcher="header"]:visible').count();
  const face = await page.locator('header [data-anatomy="H20"]:visible').count();
  const rail = await page.locator('aside[data-anatomy="H1"]').count();
  check(
    launcher === 1 && face === 1 && rail === 0,
    `${p}: the bar's launcher and H20, no rail (${launcher}, ${face}, ${rail})`,
  );
}
// The beta pill is in the footer at every width (ui-jobs 509).
const deskBeta = await page.locator("footer [data-phone-beta]:visible").count();
check(deskBeta === 1, `@1280: the footer carries the beta pill (${deskBeta})`);

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
check(rowButtons === 0, `the title row draws no chooser; the wallet panel carries it (${rowButtons})`);

// ── ml-auto regression: control cluster stays hard right where the bar exists ──
// The bar is drawn on every page (ui-jobs 509).
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
  // (ui-jobs 503), whose launcher is drawn here once, in the bar.
  const posTrigger = await page.locator('header button[data-search-launcher="header"]:visible').count();
  check(posTrigger === 1, `a position view draws the panel's launcher once, in the bar, at 1280 (${posTrigger})`);
  await page.waitForSelector("[data-anatomy='C20'] a[data-rail-identity]", { timeout: 15000 }).catch(() => {});
  const posLink = await page
    .locator("[data-anatomy='C20'] a[data-rail-identity]")
    .first()
    .getAttribute("href")
    .catch(() => null);
  check(posLink === "/ethereum/liquity-v2", `a position view's sidebar name links to the explorer (${posLink})`);
  const posLine = await page.locator("[data-position-wallet-row] [data-rail-identity]").count();
  check(posLine === 0, `the wallet heading draws no protocol line (${posLine})`);
}

// ── Coverage reachability from an explorer ──
// The AppFooter's quiet Coverage link was retired deliberately (`7778cf09`,
// 2026-09-02, "trim the chrome around the list"). The chain switcher's panel
// carries the path now — CHAIN-AWARE, pointing at the coverage page whose
// matrix contains the explorer the reader is on.
//
// The chooser is in the wallet panel (ui-jobs 503), opened by the search's
// launcher in the bar (ui-jobs 509). The chooser opens on
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

// ── Mobile (@390): the same bar, the footer still there ──
console.log("[mobile @390]");
const mob = await browser.newPage({ viewport: { width: 390, height: 800 } });
await mob.goto(BASE + "/ethereum/liquity-v2", { waitUntil: "networkidle" });
const mBurger = await mob.locator('header button[aria-label="Toggle menu"]').count();
check(mBurger === 0, `mobile header has no hamburger (${mBurger})`);
// Below `md` the brand rail does not render: the bar is the Rails mark with a
// chevron, which opens the panel (H15.1), and H20 (rails-ops TO-DO-ui-jobs 67,
// 68, 507, 509).
const mRail = await mob.locator('aside[aria-label="Rails"]').isVisible();
check(mRail === false, `mobile draws no brand rail (${mRail})`);
const mLauncher = await mob.locator('header button[data-anatomy="H15.1"]:visible').count();
check(mLauncher === 1, `mobile header keeps the panel's launcher (${mLauncher})`);
const mBookmarks = await mob.locator('header button[aria-label="Bookmarks"]').count();
check(mBookmarks === 0, `mobile header carries no bookmarks button, retired 1 Nov 2026 (${mBookmarks})`);
const mToggle = await mob.locator('header button[aria-label^="Switch to"]:visible').count();
check(mToggle === 0, `mobile header carries no theme toggle, its switch is in H20's menu, ui-jobs 507 (${mToggle})`);
const mSwitcherAll = await mob.locator("button[data-chooser-trigger]").count();
check(mSwitcherAll === 0, `mobile draws no grid glyph, ui-jobs 503 (${mSwitcherAll})`);
const mOrder = await mob.evaluate(() => {
  const c = document.querySelector('header button[data-search-launcher="header"]');
  const f = document.querySelector('header [data-anatomy="H20"]');
  return !!c && !!f && c.getBoundingClientRect().right <= f.getBoundingClientRect().left && !!c.querySelector("svg");
});
check(mOrder, "mobile header: the mark's launcher at the left, H20 at the right (ui-jobs 509)");
const mHome = await mob.locator('header a[href="/"]:visible').count();
check(mHome === 0, `mobile header's mark opens the panel, not home (${mHome})`);
const mWordmark = await mob.locator("header").first().innerText();
check(!/Rails|Ethereum/i.test(mWordmark), `mobile header shows neither word (${mWordmark.replace(/\s+/g, " ")})`);
// The phone header on home (ui-jobs 509): the launcher on the left, H20 on the
// right, no "Start here" (it is in H20's menu). The panel's top row closes it
// from the launcher's place and links Home. The beta pill is in the footer
// below md, and the rail's from md.
const mHomePage = await browser.newPage({ viewport: { width: 390, height: 800 } });
await mHomePage.goto(BASE + "/", { waitUntil: "networkidle" });
const mStart = await mHomePage.locator('header[data-anatomy="H2"] a[href="/start"]').count();
check(mStart === 0, `home @390: the header carries no Start here (${mStart})`);
const launcher = mHomePage.locator('header button[data-search-launcher="header"]');
const lBox = await launcher.boundingBox();
await launcher.click();
await mHomePage.waitForTimeout(500);
const panelRow = await mHomePage.evaluate(() => {
  const c = document.querySelector("[data-wallet-panel-close]")?.getBoundingClientRect();
  const h = document.querySelector("[data-wallet-panel-home]");
  return { x: c ? Math.round(c.x) : null, y: c ? Math.round(c.y) : null, home: h?.getAttribute("href") ?? null };
});
check(
  panelRow.x === Math.round(lBox.x) && panelRow.y === Math.round(lBox.y) && panelRow.home === "/",
  `home @390: the panel's close stands on the launcher's place and Home links / (${JSON.stringify(panelRow)} vs ${Math.round(lBox.x)},${Math.round(lBox.y)})`,
);
await mHomePage.mouse.click(lBox.x + lBox.width / 2, lBox.y + lBox.height / 2);
await mHomePage.waitForTimeout(500);
const panelShut = await mHomePage.evaluate(() => document.documentElement.hasAttribute("data-wallet-panel-open"));
check(!panelShut, "home @390: a second press on the launcher's place closes the panel");
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
// The sheet rises over 220ms; read it where it settles.
await mHomePage.waitForTimeout(400);
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
    start: !!m?.querySelector('[data-profile-menu-empty] a[data-profile-menu-start][href="/start"]'),
    scrim: !!document.querySelector("[data-profile-menu-scrim]"),
  };
});
check(
  sheet.role === "menu" &&
    sheet.width === 390 &&
    sheet.bottom === 800 &&
    sheet.empty &&
    sheet.manage &&
    sheet.start &&
    sheet.scrim &&
    sheet.themes === "Light,Dark,Auto",
  `home @390: H20 opens a full-width sheet at the screen's foot over a dim: the line with Start here and how to save, Manage wallets, the theme switch (${JSON.stringify(sheet)})`,
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
