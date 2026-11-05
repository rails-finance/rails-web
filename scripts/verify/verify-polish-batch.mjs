// Playwright check for the 10-item polish batch (merry-neumann plan).
// Run: node scripts/verify/verify-polish-batch.mjs   (dev server on :3000)
// Repointed (ui-jobs 432, 498; Miles 5 Nov 2026): check 8 reads the hero top down: the h1
// "Rails Explorers", the promise line, the search, the ticks.
import { chromium } from "playwright";

const results = [];
const check = (name, ok, detail = "") =>
  results.push({ name, ok, detail }) && console.log(`${ok ? "✅" : "❌"} ${name}${detail ? `  ${detail}` : ""}`);

const BASE = process.env.BASE ?? "http://localhost:3000";
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

// ── Home page items ──────────────────────────────────────────────────────
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

// 8. Hero order: h1 → promise line → search → ticked terms
const heroOrder = await page.evaluate(() => {
  const section = document.querySelector("h1")?.closest("section");
  if (!section) return "no section";
  // Read on each child's whole text: the terms line opens "Independent",
  // so "Read-only" sits past a short prefix.
  const texts = [...section.children].map((el) => el.textContent || "");
  const kids = [...section.children].map((el, i) => el.tagName + ":" + texts[i].slice(0, 25));
  const h1i = [...section.children].findIndex(
    (el) => el.querySelector("h1")?.textContent?.trim() === "Rails Explorers",
  );
  const searchi = [...section.children].findIndex((el) => el.querySelector("input"));
  const taglinei = texts.findIndex((t) =>
    t.includes("Look up any DeFi position, wallet and protocol, verified directly from the chain."),
  );
  const badgei = texts.findIndex((t) => t.toLowerCase().includes("read-only"));
  return h1i >= 0 && h1i < taglinei && taglinei < searchi && searchi < badgei ? "ok" : kids.join(" | ");
});
check("8 hero: h1 → promise → search → badges", heroOrder === "ok", heroOrder === "ok" ? "" : heroOrder);

// 3. URL pill: single pill carries the tint; toolbar row has no bg tint
const bar = page.locator("span", { hasText: "rails.finance" }).first();
const barClass = (await bar.getAttribute("class")) || "";
check(
  "3 URL pill owns the tint (bg-rb-100), hover unified",
  barClass.includes("bg-rb-100") &&
    barClass.includes("group-hover:bg-background") &&
    barClass.includes("group-hover:text-foreground"),
);
const rowClass = await bar.evaluate((el) => el.parentElement.className);
check(
  "3 toolbar row dropped its own bg band",
  !rowClass.includes("bg-rb-100"),
  rowClass.includes("bg-rb-100") ? rowClass : "",
);
const nestedSpanCount = await bar.locator("span").count();
check("3 URL text is one unit (no nested staged span)", nestedSpanCount === 0, `nested spans: ${nestedSpanCount}`);

// 4. The attribution caption is gone (Miles, 22 Oct 2026)
const capCount = await page.getByText("Live position, shared with permission.").count();
check("4 no attribution caption", capCount === 0, `count: ${capCount}`);

// 9. View-live pill: blue border wins (computed style, not class list)
const pill = page.locator("a >> span", { hasText: "View a live position" }).first();
const pillBorder = await pill.evaluate((el) => getComputedStyle(el).borderTopColor);
// blue-500 = oklch(62.3% 0.214 259.815) ≈ rgb(59, 130, 246)
check("9 view-live pill computed border is blue", /59, 130, 246|rgb\(59/.test(pillBorder), pillBorder);
const pillClass = (await pill.getAttribute("class")) || "";
check("9 no neutral border class remains on pill", !pillClass.includes("border-rb-200"));

// 6. Four persona paragraphs roughly even (max/min length ratio < 1.6)
const paras = await page.locator("p.body-text.flex-1").allTextContents();
const lens = paras.map((t) => t.trim().length);
const ratio = Math.max(...lens) / Math.min(...lens);
check(
  "6 persona paragraph lengths even (ratio < 1.6)",
  lens.length === 4 && ratio < 1.6,
  `lengths: ${lens.join(", ")}`,
);

// 7. Team cards: no card chrome
const teamCard = page.locator("h2", { hasText: /^The team$/ }).locator("xpath=following-sibling::div[1]/div[1]");
const teamClass = (await teamCard.getAttribute("class")) ?? "";
check(
  "7 team cards dropped bg-raised/rounded/p-6",
  !teamClass.includes("bg-raised") && !teamClass.includes("p-6"),
  teamClass,
);

// 10. Get in touch copy
const git = await page.locator("text=open infrastructure for DeFi").count();
const gitTg = await page.locator("text=@railsfinance").count();
check("10 get-in-touch new copy + @railsfinance", git >= 1 && gitTg >= 1);

// 5. Protocol ordering: Compound V2 before Compound V3 in the home row, once
// "View all" has opened the whole roster (Compound V2 is not among the most used).
await page.locator("[data-home-view-all]").click();
const protoOrder = await page.evaluate(() => {
  const text = document.body.innerText;
  const v2 = text.indexOf("Compound V2");
  const v3 = text.indexOf("Compound V3");
  return v2 !== -1 && v3 !== -1 ? (v2 < v3 ? "ok" : `v2@${v2} v3@${v3}`) : "not found";
});
check("5 Compound V2 precedes V3 on home", protoOrder === "ok", protoOrder === "ok" ? "" : protoOrder);

// ── Glyphs (the rail header's identity mark on protocol pages) ───────────
// The chrome header no longer carries a protocol mark — the identity line
// moved onto the page (the rail header), so the glyph is asserted there.
for (const [proto, path] of [
  ["dolomite", "/ethereum/dolomite"],
  ["llamalend", "/ethereum/llamalend"],
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  // A glyph renders as inline <svg fill="currentColor">; the PNG fallback is <img>.
  const headerSvg = await page.evaluate(() => {
    const nav = document.querySelector("nav[aria-label='Explorer sections']");
    const row = nav?.parentElement;
    if (!row) return "no rail header row";
    const svgs = [...row.querySelectorAll("svg")].filter((s) => s.getAttribute("fill") === "currentColor");
    return svgs.length > 0 ? "svg" : row.querySelector("img[src*='icons/protocols']") ? "png-fallback" : "neither";
  });
  check(`1 ${proto} rail header shows currentColor glyph`, headerSvg === "svg", headerSvg);
}

// ── 2. Listing page: two rows — identity alone, then stamp + sub-nav ─────
// The (i) drawer is retired: the intro lives at /info (linked from the rail
// header's sub-nav). Since rails-ops ui-jobs 66 the rail is two rows at every
// width — the protocol identity alone on the first, the recency stamp and the
// sub-nav sharing the second (stamp on the left, sub-nav on the right) — so
// the stamp no longer shares a row with the identity.
await page.goto(`${BASE}/ethereum/dolomite`, { waitUntil: "networkidle" });
const stampPlacement = await page.evaluate(() => {
  if (document.querySelector("button[aria-label*='introduction']")) return "drawer trigger still present";
  const nav = document.querySelector("nav[aria-label='Explorer sections']");
  if (!nav) return "no rail sub-nav";
  const infoLink = nav.querySelector("a[aria-label='About this explorer']");
  if (!infoLink) return "no (i) link in sub-nav";
  if (!/\/info$/.test(infoLink.getAttribute("href") || "")) return "(i) href is not /info";
  const identity = document.querySelector("[data-rail-identity]");
  // The stamp is a button that reads "3 min", the block number in
  // its peek, so it is found by its accessible name.
  const stamp = document.querySelector("button[aria-label^='Chain head'], button[aria-label^='Indexed to block']");
  if (!identity) return "no identity link in rail header";
  if (!stamp) return "no recency stamp in rail header";
  // The stamp's peek (RevealTip) wraps the button; the row holds the wrapper.
  const stampRow = (stamp.closest("[data-reveal-tip]") ?? stamp).parentElement;
  if (!stampRow || !stampRow.contains(nav)) return "stamp is not sharing a row with the sub-nav";
  if (stampRow.contains(identity)) return "stamp still shares a row with the identity";
  return "ok";
});
check(
  "2 two rows: identity alone, stamp shares the sub-nav's row; (i) links to /info",
  stampPlacement === "ok",
  stampPlacement === "ok" ? "" : String(stampPlacement),
);

// ── Footer Liquity supporters modal ──────────────────────────────────────
// Ported from the retired verify-about-merge: this footer modal is covered
// nowhere else in the suite. Trimmed to the parts still true after the modal's
// logo was redesigned (the old viewBox=148 40 logo assertion pinned replaced
// design): it opens from the footer line, carries the thank-you copy + the
// outbound liquity.org link, and Escape closes it.
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
const LIQUITY_DIALOG = 'div[role="dialog"][aria-labelledby="liquity-modal-title"]';
const liquityTrigger = page.locator('footer button:has-text("Liquity")').last();
check("L footer Liquity trigger is a button", (await liquityTrigger.count()) === 1);
let liquityOpened = false;
for (let attempt = 0; attempt < 6 && !liquityOpened; attempt++) {
  await liquityTrigger.scrollIntoViewIfNeeded();
  await liquityTrigger.click();
  liquityOpened = await page
    .waitForSelector(LIQUITY_DIALOG, { timeout: 4000 })
    .then(() => true)
    .catch(() => false);
}
check("L Liquity modal opens from the footer line", liquityOpened);
const liquityThanks = page.locator(`${LIQUITY_DIALOG} p`, {
  hasText: "instrumental in getting Rails off the ground",
});
check("L modal carries the thank-you copy", (await liquityThanks.count()) === 1);
const liquityOut = page.locator(`${LIQUITY_DIALOG} a[href="https://liquity.org"][target="_blank"]`);
check("L modal keeps the outbound liquity.org link", (await liquityOut.count()) === 1);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
check("L Escape closes the modal", (await page.locator(LIQUITY_DIALOG).count()) === 0);

// ── S. Explorer chooser ─────────────────────────────────────────────────
// The roster under the search in the wallet panel (ui-jobs 503), opened by
// the search's glyph on every page and opening on Ethereum. Each chain shows
// its most used explorers, the rest behind "View all <n> explorers". Counts
// are not pinned literals: each chain's count is compared against the rows
// the chooser renders for it with every explorer shown.
await page.goto(`${BASE}/ethereum/dolomite`, { waitUntil: "networkidle" });
const CHOOSER = "[data-search-launcher-panel] [data-explorer-chooser]";
// `:visible`: from `md` up the rail's glyph is drawn and the header bar's is
// in the tree but hidden with the bar.
const switcherTrigger = page.locator("button[data-search-launcher]:visible").first();
check(
  "S the rail's search glyph opens the chooser; no grid glyph",
  (await switcherTrigger.getAttribute("data-search-launcher")) === "rail" &&
    (await page.locator("button[data-chooser-trigger]").count()) === 0,
  (await switcherTrigger.getAttribute("aria-label")) ?? "",
);
// Pre-hydration clicks are lost, not replayed — poll the panel and re-click.
const openChooser = async () => {
  let open = false;
  for (let attempt = 0; attempt < 6 && !open; attempt++) {
    await page.locator("button[data-search-launcher]:visible").first().click();
    open = await page
      .waitForSelector(CHOOSER, { state: "visible", timeout: 2000 })
      .then(() => true)
      .catch(() => false);
  }
  return open;
};
check("S the panel opens with the chooser under the search", await openChooser());
check(
  "S the field has the focus as the panel opens",
  await page.evaluate(() => document.activeElement?.matches("[data-search-launcher-panel] input") ?? false),
);
const chainButtons = page.locator(`${CHOOSER} [data-switcher-tabs] [role="tab"]:not([data-switcher-robinhood])`);
const chainCount = await chainButtons.count();
check("S the chain row renders multiple chains", chainCount >= 2, `chains: ${chainCount}`);
// Every chain's count equals its explorer rows with every explorer shown, and
// the most used number eight at most.
let badgesMatch = chainCount >= 2;
for (let i = 0; i < chainCount; i++) {
  const btn = chainButtons.nth(i);
  await btn.click();
  const badge = Number(await btn.getAttribute("data-chain-count"));
  const shown = await page.locator(`${CHOOSER} a[data-switcher-explorer]`).count();
  const viewAll = page.locator(`${CHOOSER} [data-chooser-view-all]`);
  if (await viewAll.count()) await viewAll.click();
  const rows = await page.locator(`${CHOOSER} a[data-switcher-explorer]`).count();
  if (!(Number.isFinite(badge) && badge > 0 && badge === rows && shown <= 8)) {
    badgesMatch = false;
    check(`S chain ${i} count (${badge}) matches its rows (${rows}), ${shown} shown first`, false);
  }
}
check("S every chain's count matches its rows, eight at most shown first", badgesMatch);
// Back to Ethereum: the chain is named beside the glyphs, and the active
// explorer is marked current and unclickable.
await chainButtons.first().click();
check(
  "S the selected chain is named beside the glyphs",
  (await page.locator(`${CHOOSER} [data-chooser-chain-name]`).textContent())?.trim() === "Ethereum",
);
const currentRow = page.locator(`${CHOOSER} a[data-switcher-explorer][aria-current="page"]`);
check(
  "S active explorer row carries aria-current",
  (await currentRow.count()) === 1 && (await currentRow.getAttribute("href")) === "/ethereum/dolomite",
);
// "View all" reaches the long tail, and a row there navigates to its listing.
await page.locator(`${CHOOSER} [data-chooser-view-all]`).click();
await page.locator(`${CHOOSER} a[href="/ethereum/llamalend"]`).click();
const navigated = await page
  .waitForURL(/\/ethereum\/llamalend/, { timeout: 8000 })
  .then(() => true)
  .catch(() => false);
check("S explorer row navigates to its listing", navigated);
// On the home page the rail's glyph opens the SAME panel, on Ethereum: the
// site pages stand in the rail shell (ui-jobs 498).
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
check("S home's rail glyph opens the chooser", await openChooser());
const ctaSelected = await page.locator(`${CHOOSER} [role="tab"][aria-selected="true"]`).getAttribute("aria-label");
check("S home's chooser opens on Ethereum", ctaSelected === "Ethereum", ctaSelected ?? "none");

// Home's order below the hero (Miles, 5 Nov 2026): the track lines, the
// roster counted, the live sample, the directory.
const homeOrder = async (pg) =>
  pg.evaluate(() =>
    ["S1", "S4", "S3", "S2", "S5"].map(
      (c) => document.querySelector(`[data-anatomy="${c}"]`)?.getBoundingClientRect().top ?? null,
    ),
  );
const ascending = (tops) => tops.every((t, i) => t !== null && (i === 0 || t > tops[i - 1]));
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
const wideOrder = await homeOrder(page);
check("O home: hero, track lines, value line, sample, directory", ascending(wideOrder), JSON.stringify(wideOrder));
// One ground from S5 to the foot (Miles, 5 Nov 2026): the lower sections draw
// none of their own, the lower wrapper carries the gradient, and the home
// footer takes its end tone, not the canvas.
const ground = await page.evaluate(() => {
  const bg = (el) => (el ? getComputedStyle(el).backgroundColor : "missing");
  const own = ["S6", "S7", "S8", "S9"].map((c) => {
    const el = document.querySelector(`[data-anatomy="${c}"]`);
    return [c, bg(el), bg(el?.parentElement)];
  });
  return {
    own: own.filter(([, a, b]) => a !== "rgba(0, 0, 0, 0)" || b !== "rgba(0, 0, 0, 0)").map(([c]) => c),
    gradient: getComputedStyle(document.querySelector("[data-home-lower]")).backgroundImage.startsWith(
      "linear-gradient",
    ),
    footer: bg(document.querySelector('footer[data-anatomy="H9"]')),
    canvas: getComputedStyle(document.body).backgroundColor,
  };
});
check(
  "G home: one gradient below S5, no section grounds, footer in its end tone",
  ground.own.length === 0 && ground.gradient && ground.footer !== "rgb(255, 255, 255)",
  JSON.stringify(ground),
);

// "What Rails does" (Miles, 5 Nov 2026): each card is one button showing its
// heading; a press swaps in its text in the same box, which keeps its size;
// one open at a time; a second press returns it. Under reduced motion the
// text stays until a press.
const stations = page.locator("[data-station-toggle]");
await stations.first().scrollIntoViewIfNeeded();
await page.mouse.move(0, 0);
const shown = (i) =>
  stations.nth(i).evaluate((b) => !b.querySelector("[data-station-line]").classList.contains("invisible"));
const sizeOf = (i) => stations.nth(i).evaluate((b) => [b.offsetWidth, b.offsetHeight].join("×"));
const restSize = await sizeOf(3);
await stations.nth(3).click();
await page.mouse.move(0, 0);
const swapped = await shown(3);
const openSize = await sizeOf(3);
await stations.nth(1).click();
await page.mouse.move(0, 0);
const pressed = await stations.evaluateAll((bs) =>
  bs.map((b) => (b.getAttribute("aria-pressed") === "true" ? 1 : 0)).join(""),
);
await stations.nth(1).click();
const allBack = await stations.evaluateAll((bs) => bs.every((b) => b.getAttribute("aria-pressed") === "false"));
check(
  "R stations: a press swaps in the text, same size; one open at a time; a second press returns it",
  swapped && restSize === openSize && pressed === "01000" && allBack,
  JSON.stringify({ swapped, restSize, openSize, pressed, allBack }),
);
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  const rp = await ctx.newPage();
  await rp.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const st = rp.locator("[data-station-toggle]").nth(0);
  await st.scrollIntoViewIfNeeded();
  await st.click();
  await rp.mouse.move(0, 0);
  const ms = Number(await st.getAttribute("data-snake-ms"));
  await rp.waitForTimeout(ms + 1000);
  const stays = (await st.getAttribute("aria-pressed")) === "true";
  await st.click();
  const back = (await st.getAttribute("aria-pressed")) === "false";
  check("R stations: under reduced motion the text stays past its time, until a press", stays && back, `${ms}ms`);
  await ctx.close();
}

const directoryGeo = (pg) =>
  pg.evaluate(() => {
    const s5 = document.querySelector('[data-anatomy="S5"]');
    const R = (el) => el?.getBoundingClientRect();
    const tabs = R(
      s5.querySelector(
        '[data-anatomy="S5"] [role="tablist"], [data-anatomy="S5"] nav, [data-anatomy="S5"] [aria-label]',
      ),
    );
    const heading = R(s5.querySelector("[data-home-directory-heading]"));
    const tile = R(s5.querySelector('a[href^="/"]:not([href^="/coverage"])'));
    const pill = R(s5.querySelector("[data-home-coverage]"));
    const col = s5.querySelector("[data-home-coverage]").parentElement.getBoundingClientRect();
    return {
      left: [heading, tile, col].map((r) => Math.round(r.left)),
      pill: [Math.round(pill.left), Math.round(pill.right), Math.round(pill.top)],
      colRight: Math.round(col.right),
      colTop: Math.round(col.top),
    };
  });
// The directory on the page's left edge, the coverage pill on the tab row's
// right from sm (Miles, 5 Nov 2026).
{
  const g = await directoryGeo(page);
  check(
    "D home directory: heading, tiles and tab row share one left edge; the pill ends the tab row",
    new Set(g.left).size === 1 && g.pill[1] === g.colRight && g.pill[2] - g.colTop < 12,
    JSON.stringify(g),
  );
}
// The directory lists a chain's most used explorers, as the drawer's chooser
// does, and "View all <n> explorers" opens the rest in place.
const dirTiles = () =>
  page.locator('[data-anatomy="S5"] a[href^="/"]:not([href^="/coverage"])').evaluateAll((as) => as.length);
const viewAll = page.locator("[data-home-view-all]");
const featuredCount = await dirTiles();
const viewAllText = (await viewAll.textContent())?.trim() ?? "";
const allCount = Number(viewAllText.match(/View all (\d+) explorers/)?.[1] ?? 0);
await viewAll.click();
const expandedCount = await dirTiles();
check(
  "D home: eight explorers, View all opens the rest in place",
  featuredCount === 8 && allCount > 8 && expandedCount === allCount,
  `${featuredCount} → ${expandedCount} (${viewAllText})`,
);

// The live sample on a phone (Miles, 5 Nov 2026): no frame, the link to the
// position alone, "View a live position", a tap target on the screen.
const phone = await browser.newContext({ viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true });
const pp = await phone.newPage();
await pp.goto(`${BASE}/`, { waitUntil: "networkidle" });
await pp.waitForTimeout(1500);
const sample = await pp.evaluate(() => {
  const link = document.querySelector("[data-live-button] a");
  const r = link?.getBoundingClientRect();
  return {
    text: link?.textContent?.trim() ?? null,
    href: link?.getAttribute("href") ?? null,
    box: r ? [Math.round(r.left), Math.round(r.right), Math.round(r.height)] : null,
    framed: [...document.querySelectorAll("span")].some(
      (s) => s.textContent === "Live position" && s.getClientRects().length > 0,
    ),
    scroll: document.documentElement.scrollWidth,
  };
});
check("P phone @390: no framed sample", !sample.framed);
{
  const g = await directoryGeo(pp);
  check(
    "D home @390: the coverage pill wraps under the tabs, on the left edge",
    g.pill[0] === g.left[2] && g.pill[2] - g.colTop > 20,
    JSON.stringify(g),
  );
}
const phoneOrder = await homeOrder(pp);
check(
  "O home @390: hero, track lines, value line, button, directory",
  ascending(phoneOrder),
  JSON.stringify(phoneOrder),
);
check(
  "P phone @390: the link reads View a live position and goes to the Trove",
  sample.text === "View a live position →" && /^\/ethereum\/liquity-v2\/trove\//.test(sample.href ?? ""),
  JSON.stringify(sample),
);
check(
  "P phone @390: the link is on the screen, 48px or taller, no scroll",
  !!sample.box && sample.box[0] >= 0 && sample.box[1] <= 390 && sample.box[2] >= 48 && sample.scroll === 390,
  JSON.stringify(sample.box),
);
await phone.close();

// Saved wallets in the reader's order (ui-jobs 504): a list stored before the
// order is shown newest first; a move on /bookmarks persists, and the profile
// menu lists them in that order.
{
  const W = [
    "0xf06016d822943c42e3cb7fc3a6a3b1889c1045f8",
    "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
    "0x1111111111111111111111111111111111111111",
  ];
  const held = W.map((a, i) => ({
    key: a,
    addresses: [a],
    ensNames: { [a]: null },
    lastVisited: 1000 + i,
    pinned: true,
  }));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((rows) => {
    if (!localStorage.getItem("rails-bookmarks")) localStorage.setItem("rails-bookmarks", JSON.stringify(rows));
  }, held);
  const bp = await ctx.newPage();
  await bp.goto(`${BASE}/bookmarks`, { waitUntil: "networkidle" });
  await bp.waitForSelector("[data-bookmark-row]");
  const order = () =>
    bp.locator("[data-bookmark-open]").evaluateAll((as) => as.map((a) => a.getAttribute("href").split("/").pop()));
  const first = await order();
  check(
    "W saved wallets: an unordered list reads newest first",
    first.join() === [W[2], W[1], W[0]].join(),
    first.join(),
  );
  await bp.locator("[data-bookmark-row]").first().locator('[data-bookmark-move="down"]').click();
  await bp.reload({ waitUntil: "networkidle" });
  await bp.waitForSelector("[data-bookmark-row]");
  const moved = await order();
  check("W saved wallets: a move persists", moved.join() === [W[1], W[2], W[0]].join(), moved.join());
  await bp.locator('[data-profile-corner] [data-anatomy="H20"]').click();
  const menu = await bp
    .locator("[data-profile-menu-wallet]")
    .evaluateAll((as) => as.map((a) => a.getAttribute("data-profile-menu-wallet")));
  check("W profile menu lists them in that order", menu.join() === moved.join(), menu.join());
  await bp.keyboard.press("Escape");
  // The drawer's search (Miles, 5 Nov 2026): focused on open with the list
  // shut and the chooser uncovered; ArrowDown opens the saved wallets; typing
  // opens the list and clearing the field shuts it. No saved-wallets link.
  await bp.locator('aside[data-anatomy="H1"] button[data-search-launcher]').click();
  const field = bp.locator("[data-search-launcher-panel] input");
  await field.waitFor();
  await bp.waitForTimeout(300);
  const listShown = () => bp.locator("[data-search-launcher-panel] [role=listbox]").isVisible();
  const atOpen = { focused: await field.evaluate((el) => el === document.activeElement), list: await listShown() };
  await field.press("ArrowDown");
  const onArrow = await listShown();
  await field.press("Escape");
  await field.fill("aa");
  const onType = await listShown();
  await field.fill("");
  const onClear = await listShown();
  const panelLink = await bp.locator("[data-wallet-panel-bookmarks]").count();
  check(
    "S drawer search: focused, list shut on open; ArrowDown and typing open it; clearing shuts it; no saved link",
    atOpen.focused && !atOpen.list && onArrow && onType && !onClear && panelLink === 0,
    JSON.stringify({ atOpen, onArrow, onType, onClear, panelLink }),
  );
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(
  failed.length === 0 ? `\n✅ all ${results.length} checks passed` : `\n❌ ${failed.length}/${results.length} failed`,
);
process.exit(failed.length === 0 ? 0 : 1);
