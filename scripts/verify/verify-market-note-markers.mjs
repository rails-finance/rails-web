// Market notes as spine markers (rails-ops TO-DO-ui-jobs item 118), on a
// Liquity V2 trove with notes.
// ----------------------------------------------------------------------------
// On desktop a closed note is a marker on the spine (`[data-note-marker]`, a
// button) and takes no row height; a click or Enter/Space opens the note's row
// and panel in place and moves focus to its header, and the open row's filled
// diamond closes it and returns focus to the marker. Display carries
// "Market notes" and "Open all market notes"; the toolbar's "Market
// notes · N" pill is gone. A marker stays when a Types of event filter hides
// every event. On a phone the list view keeps note rows, its Display offers the
// switch alone, and the spine view (`?timeline=spine`) keeps its markers.
//
// The trove is TROVE_A of verify-market-note-row-liquity-v2.mjs, which pins
// what its notes state; this script holds the markers, not the figures. The
// note count is read off the page (`data-market-notes`), never pinned, and a
// run that finds no note says so rather than passing.
//
// Run: BASE=http://localhost:3471 node scripts/verify/verify-market-note-markers.mjs

import { chromium } from "playwright";
import { BASE, bypassHeaders } from "./lib/host.mjs";
import { marketNoteCount } from "./lib/market-notes.mjs";

const TROVE_A = "78653451855876984404200224290704233324607545013117117463168140077362570442915";
const URL_A = `${BASE}/ethereum/liquity-v2/trove/WETH/${TROVE_A}`;

let failures = 0;
let checked = 0;
const check = (name, ok, detail = "") => {
  checked++;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
};

const browser = await chromium.launch();
async function open(width, url = URL_A) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, extraHTTPHeaders: bypassHeaders() });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.locator("[data-timeline-rows-drawn]").first().waitFor({ state: "attached", timeout: 120000 });
  await page.locator("[data-event-id]").first().waitFor({ state: "visible", timeout: 120000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}
const closedMarkers = (page) => page.locator("[data-note-marker][aria-expanded='false']:visible");
const displayTrigger = (page) =>
  page.locator('button[aria-label="Display"][title="Choose what each timeline row shows"]').first();
const menuItem = (page, text) => page.locator("button.overlay-item", { hasText: new RegExp(`^${text}$`, "i") }).first();
const isTicked = async (item) => (await item.locator(".bg-rb-500").count()) > 0;

console.log(`Market notes — against ${BASE}\n`);

// ── Desktop ────────────────────────────────────────────────────────────────
{
  const { ctx, page } = await open(1280);
  const total = await marketNoteCount(page);
  const n = await closedMarkers(page).count();
  if (!check("0. the trove has notes to mark", total > 0, `data-market-notes ${total}`)) {
    await browser.close();
    process.exit(1);
  }
  check("1. every note is a closed marker on desktop", n === total, `${n} markers, ${total} notes`);
  check(
    "1b. no note row stands while every note is a marker",
    (await page.locator("[data-market-note]").count()) === 0,
  );
  check(
    '1c. the toolbar carries no "Market notes · N" pill',
    (await page.getByRole("button", { name: /^Market notes ·/i }).count()) === 0,
  );
  // No row height: the rows either side of a marker keep the list's spacing.
  const gap = await page.evaluate(() => {
    const g = document.querySelector('[data-note-gap=""]');
    const prev = g?.previousElementSibling?.getBoundingClientRect();
    const next = g?.nextElementSibling?.getBoundingClientRect();
    return g && prev && next ? Math.round(next.top - prev.bottom) : null;
  });
  check("1d. a single marker takes no row height (the rows either side stay 8px apart)", gap === 8, `${gap}px`);

  const first = closedMarkers(page).first();
  const id = await first.getAttribute("data-note-marker");
  const label = (await first.getAttribute("aria-label")) ?? "";
  check("2. a marker is a button with a full label", /^Market note, .+: .+ (up|down) /.test(label), label);
  await first.hover();
  await page.waitForTimeout(300);
  // The tooltip is the marker's ::after, drawn from `data-tip`, so it adds no
  // text to the page.
  const tip = await first.evaluate((el) => {
    const s = getComputedStyle(el, "::after");
    return { shown: s.opacity === "1", text: el.getAttribute("data-tip") ?? "", content: s.content };
  });
  check(
    "2b. hover shows the tooltip in the header's form",
    tip.shown && tip.content.includes(tip.text) && /price [−+]/.test(tip.text),
    tip.text,
  );

  await first.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  const row = page.locator(`[data-market-note="${id}"]`);
  check("3. Enter on a marker opens its row", (await row.count()) === 1);
  check("3b. …with its panel open", (await row.getAttribute("data-market-note-open")) !== null);
  check(
    "3c. focus moves to the note's header",
    await page.evaluate((nid) => !!document.activeElement?.closest(`[data-market-note="${CSS.escape(nid)}"]`), id),
  );
  const close = page.locator(`[data-note-marker="${id}"][aria-expanded="true"]`);
  check("4. the open row's filled diamond is a button", (await close.count()) === 1);
  await close.click();
  await page.waitForTimeout(400);
  check("4b. clicking it puts the note back to a marker", (await row.count()) === 0);
  check(
    "4c. focus returns to the marker",
    await page.evaluate((nid) => document.activeElement?.getAttribute("data-note-marker") === nid, id),
  );
  await page.keyboard.press("Space");
  await page.waitForTimeout(400);
  check("5. Space on a marker opens its note", (await row.count()) === 1);
  await close.click();
  await page.waitForTimeout(300);

  await displayTrigger(page).click();
  const markersItem = menuItem(page, "Market Notes");
  const openAllItem = menuItem(page, "Open All Market Notes");
  check(
    '6. Display offers "Market notes", ticked, and "Open all market notes"',
    (await markersItem.count()) === 1 && (await isTicked(markersItem)) && (await openAllItem.count()) === 1,
  );
  await openAllItem.click();
  await page.waitForTimeout(500);
  const rowsOpenAll = await page.locator("[data-market-note]").count();
  const panelsOpenAll = await page.locator("[data-market-note-open]").count();
  check(
    "7. Open all shows every note as its header row, no panel open",
    rowsOpenAll === total && panelsOpenAll === 0,
    `${rowsOpenAll} rows, ${panelsOpenAll} panels`,
  );
  check(
    "7b. under Open all the diamonds are inert",
    (await page.locator("[data-note-marker][aria-expanded='true']").first().getAttribute("aria-disabled")) === "true",
  );
  await openAllItem.click();
  await page.waitForTimeout(300);
  check("7c. turning Open all off puts every note back to a marker", (await closedMarkers(page).count()) === total);
  await markersItem.click();
  await page.waitForTimeout(400);
  check(
    "8. Market notes off hides every note",
    (await page.locator("[data-note-marker], [data-market-note]").count()) === 0,
  );
  check("8b. Open all is greyed while markers are off", (await openAllItem.getAttribute("aria-disabled")) === "true");
  await markersItem.click();
  await page.waitForTimeout(400);
  check("8c. turning the markers back on restores them", (await closedMarkers(page).count()) === total);
  await displayTrigger(page).click();

  // Every event type filtered out.
  const countBefore = (await page.locator("[data-event-id]").count()) > 0;
  await page.getByRole("button", { name: "Types of event" }).click();
  const options = page.locator("button.overlay-item");
  const k = await options.count();
  for (let i = 0; i < k; i++) {
    await options.nth(i).click();
    await page.waitForTimeout(150);
  }
  await page.getByRole("button", { name: "Types of event" }).click();
  await page.waitForTimeout(800);
  const left = await closedMarkers(page).count();
  check(
    "9. with every event type filtered out, every marker stays",
    countBefore && (await page.locator("[data-event-id]").count()) === 0 && left === total,
    `${left} of ${total}`,
  );
  await ctx.close();
}

// ── Phone ──────────────────────────────────────────────────────────────────
{
  const { ctx, page } = await open(390);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check("10. no horizontal scroll at 390", sw <= 390, `scrollWidth ${sw}`);
  check(
    '10b. no "Market notes · N" pill on the phone',
    (await page.getByRole("button", { name: /^Market notes ·/i }).count()) === 0,
  );
  const rows = await page.locator("[data-market-note]:visible").count();
  check("10c. the phone list view keeps note rows", rows > 0, `${rows} rows`);
  await displayTrigger(page).click();
  await page.waitForTimeout(400);
  const mk = page.getByRole("button", { name: /^Market Notes$/i });
  const oa = page.getByRole("button", { name: /^Open All Market Notes$/i });
  check(
    "11. the phone's Display offers the markers switch alone",
    (await mk.count()) === 1 && (await oa.count()) === 0,
  );
  await mk.click();
  await page.waitForTimeout(400);
  check("11b. …and it hides the phone's note rows", (await page.locator("[data-market-note]:visible").count()) === 0);
  await ctx.close();
}
{
  const { ctx, page } = await open(390, `${URL_A}?timeline=spine`);
  await page.waitForTimeout(800);
  if ((await page.locator("[data-mview='spine']").count()) > 0) {
    const n = await page.locator("[data-note-marker]:visible").count();
    check("12. the phone spine view keeps its markers", n > 0, `${n}`);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    check("12b. no horizontal scroll in the spine view", sw <= 390, `scrollWidth ${sw}`);
  } else {
    check("12. the phone spine view keeps its markers", false, "the spine view did not turn on");
  }
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} CHECK(S) FAILED of ${checked}` : `\nALL ${checked} CHECKS PASS`);
process.exit(failures ? 1 : 0);
