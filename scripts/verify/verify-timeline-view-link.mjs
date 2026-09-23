// Live in-browser verification of the timeline's VIEW LINK — the URL grammar
// useTimelineEvents reads and writes (`hide`, `hideAssets`, `hideAddresses`,
// `from`/`to`) and the copy-link control that composes it on demand (see the
// file header of hooks/useTimelineEvents.ts).
//
// ⚠️ THE CONTROL IS NOT ON THE TOOLBAR ANY MORE (`share-link-relocation`,
// merged 2026-09-12 in `8cd7330c`). It sits at the foot of the EXPLANATION
// PANE, beside Learn More — an explicit share act by a reader who has already
// opened the pane. The pane is closed by default and mounted regardless, so
// the control is always in the DOM and only sometimes visible: every check
// here reaches it through `openExplanation`, and none of them may assume it
// is on screen.
//
// What it holds:
//   1. A clean load stays clean: no param is written before a toggle, and the
//      copied link of an untouched view is the bare page URL. There is no sort
//      control on the strip at all.
//   2. The first toggle on EACH axis — type, asset, counterparty (where the
//      wallet has that control), date — writes its param into the address bar,
//      and the params compose rather than replace one another.
//   3. The copied link carries the whole view, and opening it in a FRESH
//      context (no localStorage) reproduces the count line, the date label and
//      the hidden asset. That round trip is the point of the programme: a
//      recipient sees what the sender saw.
//   4. A malformed date pair is ignored, not half-applied.
//   5. At phone width the control is there and copies the same link.
//   6. `?order=` IS RETIRED (2026-09-12). A link inherited from the two-order
//      era still opens the page, no param is written for the axis, and the
//      dead one is swept out of the address bar on the first toggle rather
//      than riding along claiming a view the page cannot be in.
//
// Subject: the Moonwell Base wallet Miles reads the timeline on. Nothing here
// pins a count — the wallet is live — only that the same view yields the same
// line on both sides of the link.
//
// Run:
//   BASE=http://localhost:3100 node scripts/verify/verify-timeline-view-link.mjs

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PAGE = process.env.PAGE ?? "/base/moonwell/0x719eae70d4a83f35bf82a2740699f5db84be919d";
const NAV = { waitUntil: "domcontentloaded", timeout: 300000 };

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

const browser = await chromium.launch();

async function open(width, url) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGE ERROR", String(e)));
  await page.goto(url, NAV);
  // ⚠️ THIS WAITED ON THE COPY-LINK CONTROL UNTIL 2026-09-12, AND THE CONTROL
  // MOVED. `share-link-relocation` (merged `8cd7330c`) took it out of the
  // always-visible toolbar and put it at the foot of the Explanation pane,
  // which is CLOSED by default and rendered `keepMounted` — so the button was
  // still in the DOM, still matched the selector, and was never visible. The
  // wait resolved it hidden 242 times in 120s and the run died on the timeout,
  // in a shape that reads exactly like a broken page.
  //
  // A page-readiness wait must therefore hang off something the page always
  // shows, and the waking flag the strip clears when its handlers are attached.
  // Reaching the control is `openExplanation`'s job below.
  //
  // ⚠️ AND THAT IS NOT THE ROWS. Waiting on `[data-event-id]` was the first
  // repair and it was wrong for the same reason in reverse: section 4 opens
  // `?from=2025-01-01&to=2025-01-31`, a span this position has NO events in, so
  // the page settles correctly on "Showing 0 of 1,021 listed" with the date
  // button reading "1 Jan – 31 Jan" — the very thing the check wants — and the
  // wait hangs for 120s on rows that are legitimately absent. A readiness
  // signal may not be a value a passing page is allowed to have none of.
  //
  // The count line is server-rendered, is visible at 390 as well as 1280, and
  // reads "Showing 0 of …" on an empty view — it is present whatever the
  // filter, so it can carry the wait. The digit is what says the data is in
  // hand rather than the shell being painted.
  await page.waitForSelector("span.text-xs.text-rb-500.tabular-nums", { timeout: 120000 });
  await page.waitForFunction(
    () => /\d/.test(document.querySelector("span.text-xs.text-rb-500.tabular-nums")?.textContent ?? ""),
    null,
    { timeout: 120000 },
  );
  await page
    .waitForFunction(() => !document.querySelector("[data-ctrl-waking]"), null, { timeout: 120000 })
    .catch(() => {});
  await page.waitForTimeout(800);
  return { ctx, page };
}

/** Open the Explanation pane, where the copy-link control now lives, and leave
 *  it open. Idempotent: the trigger is a TOGGLE, so a second call on an open
 *  pane would close it — the visible control is the test, not a flag of our
 *  own. A surface with no explanation at all has no trigger and no control,
 *  which the caller's own check reports. */
async function openExplanation(page) {
  const link = page.locator('button[aria-label="Copy a link to this view"], button[aria-label="Link copied"]').first();
  if (await link.isVisible().catch(() => false)) return;
  const trigger = page.locator('button[aria-label="Show explanation"]').first();
  if ((await trigger.count()) === 0) return;
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await link.waitFor({ state: "visible", timeout: 30000 });
}

const search = (page) => page.evaluate(() => window.location.search);
const params = (page) => page.evaluate(() => Object.fromEntries(new URLSearchParams(window.location.search)));
const countLine = (page) => page.locator("span.text-xs.text-rb-500.tabular-nums").first().innerText();
// ⚠️ THE TITLES MOVED UNDER THIS CHECK. The Date button read "Filter by date
// range" / "Hide activity heatmap" until `9852b387` (the navigator, which
// turned the inline heatmap into a panel and the day filter into a span);
// this file kept the old pair and the locator simply timed out. Both of the
// current titles are listed, because the button states the panel's state.
const dateButton = (page) =>
  page.locator('button[title="Filter by a span of dates"], button[title="Hide the date span"]').first();

async function copyLink(page) {
  await openExplanation(page);
  await page.click('button[aria-label="Copy a link to this view"]');
  await page.waitForSelector('button[aria-label="Link copied"]', { timeout: 5000 });
  const text = await page.evaluate(() => navigator.clipboard.readText());
  await page.waitForSelector('button[aria-label="Copy a link to this view"]', { timeout: 5000 });
  return text;
}

/** Toggle the first option of the menu whose trigger is labelled `label`;
 *  returns the option's label, or null when the wallet has no such control. */
async function hideFirstOption(page, label) {
  const trigger = page.locator(`button[aria-label="${label}"]`);
  if ((await trigger.count()) === 0) return null;
  await trigger.click();
  const option = page.locator("button.overlay-item").first();
  await option.waitFor({ timeout: 5000 });
  const text = (await option.locator("span.flex-1").innerText()).trim();
  await option.click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  return text;
}

// ── 1. Clean load, clean link ────────────────────────────────────────────
{
  const { ctx, page } = await open(1280, `${BASE}${PAGE}`);
  check("clean load writes nothing", (await search(page)) === "", await search(page));
  const link = await copyLink(page);
  check("untouched view copies the bare URL", link === `${BASE}${PAGE}`, link);
  check("copy does not touch the address bar", (await search(page)) === "");
  // The sort control is gone, not merely defaulted — its aria-label was the
  // only thing on the strip beginning "Currently".
  check("no sort control on the strip", (await page.locator('button[aria-label^="Currently"]').count()) === 0);

  // ── 2. Each axis writes its param after the first toggle ──────────────
  const type = await hideFirstOption(page, "Types of event");
  let p = await params(page);
  check("hiding a type writes ?hide=", typeof p.hide === "string" && p.hide.length > 0, `${type} → hide=${p.hide}`);

  const asset = await hideFirstOption(page, "Assets");
  p = await params(page);
  if (asset === null) console.log("SKIP  no Assets control on this wallet");
  else {
    check("hiding an asset writes ?hideAssets=", p.hideAssets === asset, `${asset} → hideAssets=${p.hideAssets}`);
    // The axes COMPOSE — the second toggle must not replace the first.
    check("…and the type param survives it", typeof p.hide === "string" && p.hide.length > 0, `hide=${p.hide}`);
  }

  const addr = await hideFirstOption(page, "Addresses");
  p = await params(page);
  if (addr === null) console.log("SKIP  no Addresses control on this wallet");
  else
    check(
      "hiding an address writes ?hideAddresses= (full hex, not the shortened label)",
      /^0x[0-9a-fA-F]{40}$/.test(p.hideAddresses ?? ""),
      `${addr} → hideAddresses=${p.hideAddresses}`,
    );

  // Date: open the heatmap and press the last selectable month cell.
  await dateButton(page).click();
  const cell = page.locator("div.cursor-pointer.h-5").last();
  await cell.waitFor({ timeout: 10000 });
  await cell.dispatchEvent("mousedown");
  await page.mouse.up();
  await page.waitForTimeout(200);
  p = await params(page);
  check(
    "selecting a month writes ?from=&to=",
    /^\d{4}-\d{2}-01$/.test(p.from ?? "") && /^\d{4}-\d{2}-\d{2}$/.test(p.to ?? ""),
    `from=${p.from} to=${p.to}`,
  );
  const dateLabelSender = await dateButton(page).innerText();
  check("Date button carries the range", dateLabelSender !== "Date", dateLabelSender);

  // ── 3. The link carries the whole view and round-trips ────────────────
  const link2 = await copyLink(page);
  const lp = Object.fromEntries(new URL(link2).searchParams);
  check("copied link = address bar after toggles", link2 === (await page.evaluate(() => window.location.href)), link2);
  // There is one order, so there is no param for it — on a link composed from
  // a view that has been toggled on every other axis.
  check("no order param rides the link", !("order" in lp), Object.keys(lp).join(","));
  check("link has hide", lp.hide === p.hide);
  if (asset !== null) check("link has hideAssets", lp.hideAssets === asset);
  if (addr !== null) check("link has hideAddresses", lp.hideAddresses === p.hideAddresses);
  check("link has from/to", lp.from === p.from && lp.to === p.to);
  check(
    "no display param rides the link",
    !Object.keys(lp).some((k) => /show|display|collapse/i.test(k)),
    Object.keys(lp).join(","),
  );

  const senderCount = await countLine(page);
  await ctx.close();

  const fresh = await open(1280, link2);
  const recvCount = await countLine(fresh.page);
  check("fresh context: same count line", recvCount === senderCount, `${senderCount} vs ${recvCount}`);
  check(
    "fresh context: same date label",
    (await dateButton(fresh.page).innerText()) === dateLabelSender,
    dateLabelSender,
  );
  if (asset !== null) {
    await fresh.page.click('button[aria-label="Assets"]');
    const first = fresh.page.locator("button.overlay-item").first();
    const label = (await first.locator("span.flex-1").innerText()).trim();
    const ticked = (await first.locator("svg").count()) > 0;
    check("fresh context: the hidden asset is unticked", label === asset && !ticked, `${label} ticked=${ticked}`);
    await fresh.page.keyboard.press("Escape");
  }
  check(
    "fresh context: the recipient's own address bar keeps the link's params",
    (await search(fresh.page)) === new URL(link2).search,
  );
  const relink = await copyLink(fresh.page);
  check("fresh context: copying again yields the same link", relink === link2, relink);
  await fresh.ctx.close();
}

// ── 4. Malformed dates are ignored ──────────────────────────────────────
{
  const { ctx, page } = await open(1280, `${BASE}${PAGE}?from=2025-02-30&to=2025-03-01`);
  check("impossible day → no range", (await dateButton(page).innerText()) === "Date");
  await ctx.close();
  const b = await open(1280, `${BASE}${PAGE}?from=2025-03-01&to=2025-01-01`);
  check("from after to → no range", (await dateButton(b.page).innerText()) === "Date");
  await b.ctx.close();
  const c = await open(1280, `${BASE}${PAGE}?from=2025-01-01&to=2025-01-31`);
  check(
    "valid pair → range applied",
    (await dateButton(c.page).innerText()) === "1 Jan – 31 Jan",
    await dateButton(c.page).innerText(),
  );
  await c.ctx.close();
}

// ── 5. Phone width ──────────────────────────────────────────────────────
{
  const { ctx, page } = await open(390, `${BASE}${PAGE}?from=2025-01-01&to=2025-01-31`);
  await openExplanation(page);
  const btn = page.locator('button[aria-label="Copy a link to this view"]');
  check("phone: the pane's copy-link control is visible", await btn.isVisible());
  const link = await copyLink(page);
  const sp = new URL(link).searchParams;
  check("phone: link carries the view", sp.get("from") === "2025-01-01" && sp.get("to") === "2025-01-31", link);
  await ctx.close();
}

// ── 6. A link from the two-order era ────────────────────────────────────
// `?order=asc` was a real, shareable param until 2026-09-12. Such a link must
// still open the page — and must not leave a dead param sitting in the address
// bar, claiming an order this timeline cannot be in.
{
  const { ctx, page } = await open(1280, `${BASE}${PAGE}?order=asc`);
  check("stale ?order=asc still loads the timeline", (await page.locator("[data-event-id]").count()) > 0);
  // Nothing is written before a toggle, so the param is still there on load —
  // this is what makes the sweep below a real assertion rather than a no-op.
  check("…and is untouched before any toggle", (await params(page)).order === "asc", await search(page));
  await hideFirstOption(page, "Types of event");
  const p = await params(page);
  check("…and is swept out by the first toggle", !("order" in p), await search(page));
  check("…which still writes its own axis", typeof p.hide === "string" && p.hide.length > 0, `hide=${p.hide}`);
  const link = await copyLink(page);
  check("…and the copied link carries no order", !new URL(link).searchParams.has("order"), link);
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
