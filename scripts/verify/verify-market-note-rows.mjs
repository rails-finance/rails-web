// Market notes as collapsed rows (rails-ops TO-DO-ui-jobs items 118, 399), on a
// MakerDAO vault with stability-fee notes.
// ----------------------------------------------------------------------------
// Every note draws its collapsed row whenever Display's "Market notes" is on
// (Miles, 20 Oct 2026: the collapsed row is the view; the bare spine marker
// went). The row's node is the hollow diamond; a rate note's head names its
// kind in words and its rate after stands in the pink pill on the spine's
// flank. The whole row, or Enter/Space on its header, opens the panel in
// place and closes it again. Display carries "Market notes" alone; the
// toolbar's "Market notes · N" pill is gone. A note stays when a Types of
// event filter hides every event, and the notes that then share one gap draw
// as one group row per kind.
//
// The vault is 28699 of verify-makerdao-rate-step.mjs, which pins what its
// notes state; this script holds the rows. The note count is read off the
// page (`data-market-notes`), never pinned, and a run that finds no note says
// so rather than passing.
//
// Run: BASE=http://localhost:3471 node scripts/verify/verify-market-note-rows.mjs

import { chromium } from "playwright";
import { BASE, bypassHeaders } from "./lib/host.mjs";
import { marketNoteCount } from "./lib/market-notes.mjs";

const VAULT_A = "28699";
const URL_A = `${BASE}/ethereum/makerdao/${VAULT_A}`;

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
  // A fee note exists only once the ilk's rate log has landed, after the
  // timeline names the ilk: wait for a note rather than a fixed delay.
  await page
    .locator("[data-market-note], [data-market-note-run]")
    .first()
    .waitFor({ state: "attached", timeout: 60000 })
    .catch(() => {});
  await page.waitForTimeout(1500);
  return { ctx, page };
}
/** The notes the drawn rows stand for: a lone row is one, a run row its
 *  count chip's, a live card's lines are rows of their own. */
const rowNotes = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll("[data-market-note]")].filter((e) => !e.closest("[data-market-note-run]")).length +
      [...document.querySelectorAll("[data-market-note-run] [data-group-count]")].reduce(
        (n, e) => n + Number(e.getAttribute("data-group-count")),
        0,
      ),
  );
const displayTrigger = (page) =>
  page.locator('button[aria-label="Display"][title="Choose what each timeline row shows"]').first();
const menuItem = (page, text) => page.locator("button.overlay-item", { hasText: new RegExp(`^${text}$`, "i") }).first();
const isTicked = async (item) => (await item.locator(".bg-rb-500").count()) > 0;

console.log(`Market notes — against ${BASE}\n`);

// ── Desktop ────────────────────────────────────────────────────────────────
{
  const { ctx, page } = await open(1280);
  const total = await marketNoteCount(page);
  if (!check("0. the vault has notes to draw", total > 0, `data-market-notes ${total}`)) {
    await browser.close();
    process.exit(1);
  }
  const drawn = await rowNotes(page);
  check("1. every note draws its collapsed row at rest", drawn === total, `${drawn} of ${total}`);
  check("1b. no row's panel is open at rest", (await page.locator("[data-market-note-open]").count()) === 0);
  check("1c. no spine marker stands", (await page.locator("[data-note-marker]").count()) === 0);
  check(
    '1d. the toolbar carries no "Market notes · N" pill',
    (await page.getByRole("button", { name: /^Market notes ·/i }).count()) === 0,
  );

  // A lone fee note: the T1 head, the diamond, the pink pill on the flank.
  const row = page.locator("[data-market-note]:not([data-market-note-run] [data-market-note])").first();
  const id = await row.getAttribute("data-market-note");
  const head = ((await row.locator("[data-head-kind]").first().textContent()) ?? "").trim();
  check("2. the row's head names its kind in words", /^Stability fee (increased|decreased|adjusted)$/.test(head), head);
  const flank = await row.evaluate((el) => {
    const r = el.querySelector("[data-spine-rate]");
    return { dir: r?.getAttribute("data-spine-rate") ?? null, text: r?.textContent?.trim() ?? "" };
  });
  check(
    "2b. the rate after stands in the pill on the spine's flank, with its arrow",
    /^\d+\.\d{2}%$/.test(flank.text) && ["up", "down", "both"].includes(flank.dir ?? ""),
    `${flank.text} ${flank.dir}`,
  );
  check(
    "2c. the row's node is the hollow diamond",
    (await row.locator('[data-spine-node] svg rect[transform^="rotate(45"]').count()) >= 1,
  );

  const header = row.locator('[role="button"][aria-expanded]').first();
  await header.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  check("3. Enter on the header opens its panel", (await row.getAttribute("data-market-note-open")) !== null);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  check("3b. Enter again closes it", (await row.getAttribute("data-market-note-open")) === null);
  await page.keyboard.press("Space");
  await page.waitForTimeout(300);
  check("3c. Space opens it", (await row.getAttribute("data-market-note-open")) !== null);
  await header.click();
  await page.waitForTimeout(300);
  check("3d. a click on the header closes it", (await row.getAttribute("data-market-note-open")) === null, id ?? "");

  await displayTrigger(page).click();
  const notesItem = menuItem(page, "Market Notes");
  check(
    '4. Display offers "Market notes", ticked, and no "Open all market notes"',
    (await notesItem.count()) === 1 &&
      (await isTicked(notesItem)) &&
      (await menuItem(page, "Open All Market Notes").count()) === 0,
  );
  await notesItem.click();
  await page.waitForTimeout(400);
  check(
    "5. Market notes off hides every note",
    (await page.locator("[data-market-note], [data-market-note-run]").count()) === 0,
  );
  await notesItem.click();
  await page.waitForTimeout(400);
  check("5b. turning them back on restores every row", (await rowNotes(page)) === total);
  await displayTrigger(page).click();

  // Every event type filtered out: the notes share one gap, so each kind's
  // run is one group row that counts its changes.
  const countBefore = (await page.locator("[data-event-id]").count()) > 0;
  await page.getByRole("button", { name: "Types of event", exact: true }).click();
  const options = page.locator("button.overlay-item");
  const k = await options.count();
  for (let i = 0; i < k; i++) {
    await options.nth(i).click();
    await page.waitForTimeout(150);
  }
  await page.getByRole("button", { name: "Types of event", exact: true }).click();
  await page.waitForTimeout(800);
  const left = await rowNotes(page);
  check(
    "6. with every event type filtered out, every note keeps its row",
    countBefore && (await page.locator("[data-event-id]").count()) === 0 && left === total,
    `${left} of ${total}`,
  );
  const run = page.locator("[data-market-note-run]").first();
  if ((await run.count()) > 0) {
    const runHead = ((await run.locator("[data-head-kind]").first().textContent()) ?? "").trim();
    check(
      "6b. a run's head names the kind and its count",
      /^Stability fee (increased|decreased|adjusted)\d+$/.test(runHead),
      runHead,
    );
    await run.locator('[role="button"][aria-expanded]').first().click();
    await page.waitForTimeout(400);
    const lines = run.locator("[data-market-note]");
    const n = await lines.count();
    check(
      "6c. the run opens to one line per change",
      n === Number(await run.locator("[data-group-count]").first().getAttribute("data-group-count")),
      `${n} lines`,
    );
    await lines.first().locator('[role="button"]').first().click();
    await page.waitForTimeout(300);
    check("6d. a line opens to its own panel", (await run.locator("[data-market-note-open]").count()) === 1);
    await run.locator('[role="button"][aria-expanded]').first().click();
    await page.waitForTimeout(300);
    check("6e. the run closes from its head", (await run.locator("[data-market-note]").count()) === 0);
  }
  await ctx.close();
}

// ── Phone ──────────────────────────────────────────────────────────────────
{
  const { ctx, page } = await open(390);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check("7. no horizontal scroll at 390", sw <= 390, `scrollWidth ${sw}`);
  const total = await marketNoteCount(page);
  const drawn = await rowNotes(page);
  check("7b. at rest the phone draws every note's row", total > 0 && drawn === total, `${drawn} of ${total}`);
  check(
    "7c. each row stands under its diamond on the line",
    await page.evaluate(() =>
      [...document.querySelectorAll("[data-note-item]")].every(
        (el) =>
          el
            .querySelector('[data-note-phone-node] [data-spine-node] rect[transform^="rotate(45"]')
            ?.getBoundingClientRect().height > 0,
      ),
    ),
  );
  const row = page.locator("[data-market-note]").first();
  await row.locator('[role="button"][aria-expanded]').first().click();
  await page.waitForTimeout(400);
  const swOpen = await page.evaluate(() => document.documentElement.scrollWidth);
  check(
    "7d. a tap opens the row's panel, still no horizontal scroll",
    (await row.getAttribute("data-market-note-open")) !== null && swOpen <= 390,
    `scrollWidth ${swOpen}`,
  );
  await ctx.close();
}

// ── Several live notes: one card ───────────────────────────────────────────
// An Aave V3 Core wallet borrowing several reserves carries one live rate note
// per borrowed reserve. They stand in the head slot as ONE card: one spine
// node, one line per note, each line opening to that note's panel. The number
// of lines is read off the page, never pinned.
const URL_GROUP = `${BASE}/ethereum/aave-v3/0x0af11de52b8dc8bdafa9e10764d2b08202939a6a?market=core`;
for (const width of [1280, 390]) {
  const { ctx, page } = await open(width, URL_GROUP);
  const card = page.locator("[data-live-note-group]");
  await card
    .first()
    .waitFor({ state: "attached", timeout: 60000 })
    .catch(() => {});
  const lines = card.locator('[data-market-note$="-head"]');
  const n = await lines.count();
  const headRows = await page.locator('[data-market-note$="-head"]').count();
  check(
    `8. (${width}) the live notes stand as one card at rest, one line per note`,
    (await card.count()) === 1 &&
      n >= 2 &&
      headRows === n &&
      Number(await card.getAttribute("data-live-note-group")) === n,
    `${await card.count()} card(s), ${n} lines, ${headRows} live rows on the page`,
  );
  check(
    `8b. (${width}) the card is headed "Market since the last event" with "Now"`,
    /^Market since the last event\s*Now/.test((await card.innerText()).trim()),
  );
  const first = lines.first();
  await first.getByRole("button", { expanded: false }).first().click();
  await page.waitForTimeout(300);
  check(
    `9. (${width}) a line opens to its note's panel, the other lines stay closed`,
    (await first.getAttribute("data-market-note-open")) !== null &&
      (await card.locator("[data-market-note-open]").count()) === 1,
  );
  const info = first.getByRole("button", { name: /how this note was derived/i });
  await info.click();
  await page.waitForTimeout(200);
  const infoOpen = (await info.getAttribute("aria-expanded")) === "true";
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  check(
    `9b. (${width}) the line's (i) opens, and Escape closes it`,
    infoOpen && (await info.getAttribute("aria-expanded")) === "false",
  );
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  check(`9c. (${width}) no horizontal scroll`, sw <= width, `scrollWidth ${sw}`);
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} CHECK(S) FAILED of ${checked}` : `\nALL ${checked} CHECKS PASS`);
process.exit(failures ? 1 : 0);
