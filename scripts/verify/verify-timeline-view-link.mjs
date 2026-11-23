// Live in-browser verification of the timeline's VIEW LINK — the URL grammar
// useTimelineEvents reads and writes (`hide`, `hideAssets`, `hideAddresses`,
// `from`/`to`), which the address bar carries (see the file header of
// hooks/useTimelineEvents.ts).
//
// THE COPY-LINK CONTROL IS GONE from the position card's Explanation pane
// (ui-jobs 807: the card's ⋮ carries Copy Position). The link a reader shares
// is the address bar, so `copyLink` reads it, and the phone check states that
// the pane draws no control.
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
// Subject: a Sky Savings holder. The Dates control is gone from every page tied
// to its Lifetime flows chart (Moonwell Base among them; a `?to=` cut replaces
// it), and Sky Savings is one that still draws it. It has no Assets or
// Addresses control, so those steps report SKIP. Nothing here pins a count —
// the holder is live — only that the same view yields the same line on both
// sides of the link.
//
// Run:
//   BASE=http://localhost:3100 node scripts/verify/verify-timeline-view-link.mjs

import { axisOptions, closeAxis, hideOption, openAxis } from "./lib/timeline-pills.mjs";
import { chromium } from "playwright";
import { BASE, bypassHeaders } from "./lib/host.mjs";

const PAGE = process.env.PAGE ?? "/ethereum/sky-savings/0xef42cf85be6adf3081ada73af87e27996046fe63";
const NAV = { waitUntil: "domcontentloaded", timeout: 300000 };

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

const browser = await chromium.launch();

async function open(width, url) {
  const ctx = await browser.newContext({
    extraHTTPHeaders: bypassHeaders(),
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
  await page.waitForSelector('[data-anatomy~="L1.2"]', { timeout: 120000 });
  await page.waitForFunction(
    () => /\d/.test(document.querySelector('[data-anatomy~="L1.2"]')?.textContent ?? ""),
    null,
    { timeout: 120000 },
  );
  await page
    .waitForFunction(() => !document.querySelector("[data-ctrl-waking]"), null, { timeout: 120000 })
    .catch(() => {});
  await page.waitForTimeout(800);
  return { ctx, page };
}

/** Open the Explanation pane. The position card's pane carries no copy-link
 *  control since ui-jobs 807 (the ⋮ carries Copy Position); a surface with no
 *  explanation has no trigger. */
async function openExplanation(page) {
  const trigger = page.locator('button[aria-label^="Show"][aria-label$="explanation"]').first();
  if ((await trigger.count()) === 0) return;
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await page.locator('button[aria-label^="Hide"][aria-label$="explanation"]').first().waitFor({ timeout: 30000 });
}

const search = (page) => page.evaluate(() => window.location.search);
const params = (page) => page.evaluate(() => Object.fromEntries(new URLSearchParams(window.location.search)));
const countLine = (page) => page.locator('[data-anatomy~="L1.2"]').first().innerText();
// The Date pill (ui-jobs 735) keeps the old button's `data-date-control` on
// its main button; titles and words are not hooks.
const dateButton = (page) => page.locator("[data-date-control]").first();
/** The Date pill's words: its range once set, "Dates" while unset (the old
 *  button's rest label, so the checks below read as they did). */
const dateLabel = async (page) => {
  const pill = page.locator('[data-filter-pill="Date"]').first();
  if ((await pill.getAttribute("data-pill-state")) === "unset") return "Dates";
  return (await pill.locator("span.font-semibold").first().innerText()).trim();
};

/** The view's link: the address bar, which carries the view's params (the
 *  card's copy-link control went with ui-jobs 807). */
async function copyLink(page) {
  return page.evaluate(() => window.location.href);
}

/** Hide the first option of the axis named by `label` (its old menu name,
 *  scripts/verify/lib/timeline-pills.mjs, which opens the axis's pill or its
 *  row in the Filters sheet); returns the option's label, or null when the
 *  wallet has no such axis. */
const hideFirstOption = (page, label) => hideOption(page, label, 0);

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
  // The navigator panel draws one button per month (`data-cell-at`), disabled
  // where the month holds no event.
  const cell = page.locator("[data-timeline-navigator] button[data-cell-at]:not([disabled])").last();
  await cell.waitFor({ timeout: 10000 });
  await cell.click();
  await page.waitForTimeout(400);
  p = await params(page);
  check(
    "selecting a month writes ?from=&to=",
    /^\d{4}-\d{2}-01$/.test(p.from ?? "") && /^\d{4}-\d{2}-\d{2}$/.test(p.to ?? ""),
    `from=${p.from} to=${p.to}`,
  );
  const dateLabelSender = await dateLabel(page);
  check("Date button carries the range", dateLabelSender !== "Dates", dateLabelSender);

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
  check("fresh context: same date label", (await dateLabel(fresh.page)) === dateLabelSender, dateLabelSender);
  if (asset !== null) {
    await openAxis(fresh.page, "Assets");
    const [first] = await axisOptions(fresh.page);
    check(
      "fresh context: the hidden asset is unticked",
      first?.label === asset && !first?.checked,
      `${first?.label} ticked=${first?.checked}`,
    );
    await closeAxis(fresh.page, "Assets");
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
  check("impossible day → no range", (await dateLabel(page)) === "Dates");
  await ctx.close();
  const b = await open(1280, `${BASE}${PAGE}?from=2025-03-01&to=2025-01-01`);
  check("from after to → no range", (await dateLabel(b.page)) === "Dates");
  await b.ctx.close();
  const c = await open(1280, `${BASE}${PAGE}?from=2025-01-01&to=2025-01-31`);
  check("valid pair → range applied", (await dateLabel(c.page)) === "Jan 2025", await dateLabel(c.page));
  await c.ctx.close();
}

// ── 5. Phone width ──────────────────────────────────────────────────────
{
  const { ctx, page } = await open(390, `${BASE}${PAGE}?from=2025-01-01&to=2025-01-31`);
  await openExplanation(page);
  const btn = page.locator('button[aria-label="Copy a link to this view"]');
  check("phone: the card's pane draws no copy-link control (ui-jobs 807)", (await btn.count()) === 0);
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
