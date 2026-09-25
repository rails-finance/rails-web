// Playwright check for the 10-item polish batch (merry-neumann plan).
// Run: node scripts/verify/verify-polish-batch.mjs   (dev server on :3000)
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

// 8. Hero order: h1 → subheading → eyebrow badges
const heroOrder = await page.evaluate(() => {
  const section = document.querySelector("h1")?.closest("section");
  if (!section) return "no section";
  const kids = [...section.children].map((el) => el.tagName + ":" + (el.textContent || "").slice(0, 25));
  const h1i = kids.findIndex((t) => t.includes("DeFi Explorers"));
  const subi = kids.findIndex((t) => t.includes("Explore any DeFi position"));
  const badgei = kids.findIndex((t) => t.toLowerCase().includes("read-only"));
  return h1i < subi && subi < badgei ? "ok" : kids.join(" | ");
});
check("8 hero: h1 → subheading → badges", heroOrder === "ok", heroOrder === "ok" ? "" : heroOrder);

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

// 4. Caption pill rounded-sm
const cap = page.locator("p", { hasText: "Live position, shared with permission." }).first();
const capClass = (await cap.getAttribute("class")) || "";
check("4 caption pill rounded-sm", capClass.includes("rounded-sm") && !capClass.includes("rounded-full"));

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

// ── 2. Listing page: recency stamp reads on from the rail identity ───────
// The (i) drawer is retired: the intro lives at /info (linked from the rail
// header's sub-nav) and the recency stamp sits in the rail header's LEFT
// cluster, directly after the protocol identity.
await page.goto(`${BASE}/ethereum/dolomite`, { waitUntil: "networkidle" });
const stampPlacement = await page.evaluate(() => {
  if (document.querySelector("button[aria-label*='introduction']")) return "drawer trigger still present";
  const nav = document.querySelector("nav[aria-label='Explorer sections']");
  if (!nav) return "no rail sub-nav";
  const infoLink = nav.querySelector("a[aria-label='About this explorer']");
  if (!infoLink) return "no (i) link in sub-nav";
  if (!/\/info$/.test(infoLink.getAttribute("href") || "")) return "(i) href is not /info";
  const row = nav.parentElement;
  const identity = row?.querySelector("a[href='/ethereum/dolomite']");
  // The stamp is a button since ui-jobs 59 — it shows the age and swaps to the
  // block number on a press — so it is found by its accessible name rather
  // than by the "block · age" text it used to read.
  const stamp = row?.querySelector("button[aria-label^='Chain head']");
  if (!identity) return "no identity link in rail row";
  if (!stamp) return "no recency stamp in rail row";
  // Same left cluster: the stamp's flex parent also contains the identity.
  return stamp.closest("div")?.contains(identity) ? "ok" : "stamp not beside identity";
});
check(
  "2 recency stamp reads on from the rail identity; (i) links to /info",
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

// ── S. Chain switcher (top-right chrome) ─────────────────────────────────
// The roster panel: chain trigger on app routes, "Open an explorer" on
// marketing routes, both opening the same two-column panel. Counts are not
// pinned literals — each chain's badge is compared against the rows the
// panel actually renders for that chain.
await page.goto(`${BASE}/ethereum/dolomite`, { waitUntil: "networkidle" });
const SWITCHER_PANEL = 'div[role="menu"][aria-label="Blockchain switcher"]';
const switcherTrigger = page.locator('button[aria-label="Switch blockchain"]');
check("S trigger names the active chain", /Ethereum/.test((await switcherTrigger.textContent()) ?? ""));
// Pre-hydration clicks are lost, not replayed — poll the panel and re-click.
let switcherOpen = false;
for (let attempt = 0; attempt < 6 && !switcherOpen; attempt++) {
  await switcherTrigger.click();
  switcherOpen = await page
    .waitForSelector(SWITCHER_PANEL, { timeout: 2000 })
    .then(() => true)
    .catch(() => false);
}
check("S panel opens from the chain trigger", switcherOpen);
const chainButtons = page.locator(`${SWITCHER_PANEL} button[aria-pressed]`);
const chainCount = await chainButtons.count();
check("S chain column renders multiple chains", chainCount >= 2, `chains: ${chainCount}`);
// Every chain's count badge equals the explorer rows shown when selected.
let badgesMatch = chainCount >= 2;
for (let i = 0; i < chainCount; i++) {
  const btn = chainButtons.nth(i);
  await btn.click();
  const badge = Number((await btn.locator("[data-chain-count]").textContent())?.trim());
  const rows = await page.locator(`${SWITCHER_PANEL} a[data-switcher-explorer]`).count();
  if (!(Number.isFinite(badge) && badge > 0 && badge === rows)) {
    badgesMatch = false;
    check(`S chain ${i} badge (${badge}) matches rendered rows (${rows})`, false);
  }
}
check("S every chain's count badge matches its rendered rows", badgesMatch);
// Back to Ethereum: the active explorer is marked current and unclickable.
await chainButtons.first().click();
const currentRow = page.locator(`${SWITCHER_PANEL} a[data-switcher-explorer][aria-current="page"]`);
check(
  "S active explorer row carries aria-current",
  (await currentRow.count()) === 1 && (await currentRow.getAttribute("href")) === "/ethereum/dolomite",
);
// An explorer row navigates to its listing.
await page.locator(`${SWITCHER_PANEL} a[href="/ethereum/llamalend"]`).click();
const navigated = await page
  .waitForURL(/\/ethereum\/llamalend/, { timeout: 8000 })
  .then(() => true)
  .catch(() => false);
check("S explorer row navigates to its listing", navigated);
// The marketing CTA opens the SAME panel, defaulting to Ethereum.
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
const cta = page.locator('button[aria-label="Open an explorer"]');
let ctaOpen = false;
for (let attempt = 0; attempt < 6 && !ctaOpen; attempt++) {
  await cta.click();
  ctaOpen = await page
    .waitForSelector(SWITCHER_PANEL, { timeout: 2000 })
    .then(() => true)
    .catch(() => false);
}
check("S marketing CTA opens the switcher panel", ctaOpen);
const ctaSelected = await page.locator(`${SWITCHER_PANEL} button[aria-pressed="true"]`).textContent();
check("S CTA panel defaults to Ethereum", /Ethereum/.test(ctaSelected ?? ""), ctaSelected ?? "none");

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(
  failed.length === 0 ? `\n✅ all ${results.length} checks passed` : `\n❌ ${failed.length}/${results.length} failed`,
);
process.exit(failed.length === 0 ? 0 : 1);
