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
const pill = page.locator("a >> span", { hasText: "View live position" }).first();
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
const teamCard = page.locator("h2", { hasText: /^Team$/ }).locator("xpath=following-sibling::div[1]/div[1]");
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

// 5. Protocol ordering: Compound V2 before Compound V3 in the home row
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

// The live sample on a phone (Miles, 5 Nov 2026): the position card and the
// Lifetime flows panel as two live slices, the flows panel over the card and
// running off the right edge with no sideways scroll, and "View live position"
// as a pill on the screen.
const phone = await browser.newContext({ viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true });
const pp = await phone.newPage();
await pp.goto(`${BASE}/`, { waitUntil: "networkidle" });
const slicesDrawn = await pp
  .waitForFunction(
    () =>
      document.querySelector('[data-live-slice="card"]')?.textContent?.includes("Collateral ratio") &&
      document.querySelector('[data-live-slice="flows"]')?.textContent?.includes("Lifetime flows"),
    null,
    { timeout: 60000 },
  )
  .then(() => true)
  .catch(() => false);
check("P sample @390: the card and the flows panel draw as slices", slicesDrawn);
const sample = await pp.evaluate(() => {
  const R = (el) => {
    const r = el?.getBoundingClientRect();
    return r ? [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] : null;
  };
  const pill = [...document.querySelectorAll("[data-live-layered] a")].find((a) =>
    a.textContent.includes("View live position"),
  );
  return {
    card: R(document.querySelector('[data-live-slice="card"]')),
    flows: R(document.querySelector('[data-live-slice="flows"]')),
    pill: R(pill),
    framed: [...document.querySelectorAll("span")].some(
      (s) => s.textContent === "LIVE SAMPLE" && s.getClientRects().length > 0,
    ),
    scroll: document.documentElement.scrollWidth,
  };
});
check("P sample @390: no framed page on a phone", !sample.framed);
check(
  "P sample @390: the flows panel lies right of and below the card's top, off the right edge, no scroll",
  !!sample.card &&
    !!sample.flows &&
    sample.flows[0] > sample.card[0] &&
    sample.flows[1] > sample.card[1] &&
    sample.flows[2] > 390 &&
    sample.scroll === 390,
  JSON.stringify(sample),
);
check(
  "P sample @390: the pill is on the screen",
  !!sample.pill && sample.pill[0] >= 0 && sample.pill[2] <= 390,
  JSON.stringify(sample.pill),
);
await phone.close();

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(
  failed.length === 0 ? `\n✅ all ${results.length} checks passed` : `\n❌ ${failed.length}/${results.length} failed`,
);
process.exit(failed.length === 0 ? 0 : 1);
