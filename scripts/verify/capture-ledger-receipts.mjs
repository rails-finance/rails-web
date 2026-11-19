// One load of a Liquity V2 Trove page, printing three USD receipts a line
// each (rails-ops TO-DO-ui-jobs 743, the ledger pass): the Lifetime flows
// collateral headline at the live stop, the same headline at the opening stop, and
// an event sheet's "Collateral after" cell. Prints, asserts nothing; a missing
// receipt prints "(none)" and the run exits 1.
//
//   BASE=http://localhost:3743 node scripts/verify/capture-ledger-receipts.mjs
//   TROVE=/ethereum/liquity-v2/trove/WETH/<id> EVENT=0xac82:a8_3 ...  (EVENT: id prefix:suffix)
//
// Hooks: [data-flow-headline-row="collateral"] holds the collateral headline
// in the combined layout ([data-flow-headlines] is the bars-and-slider body's,
// drawn only on a position with no series); [data-flow-controls] steps the
// cursor; [data-flow-date] is its date; the sheet's total line is
// [data-sheet-side="collateral"] [data-sheet-row="total"].

import { chromium } from "playwright";
import { BASE, bypassHeaders } from "./lib/host.mjs";
import { receiptIn } from "./lib/prov-inspector.mjs";
import { openCardOnFigures } from "./lib/card-tabs.mjs";

const TROVE =
  process.env.TROVE ??
  "/ethereum/liquity-v2/trove/WETH/36817653502461173406235085928277722740547981328879213190909299646091662636247";
const [EV_HEAD, EV_TAIL] = (process.env.EVENT ?? "0xac82:a8_3").split(":");
const oneLine = (t) => (t == null ? "(none)" : t.replace(/\s*\n+\s*/g, " · ").trim());

const browser = await chromium.launch();
const page = await (await browser.newContext({ extraHTTPHeaders: bypassHeaders() })).newPage();
let missing = 0;
const print = (tag, text) => {
  if (text == null) missing++;
  console.log(`${tag}: ${oneLine(text)}`);
};

try {
  await page.goto(`${BASE}${TROVE}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  const head = page.locator('[data-flow-headline-row="collateral"]').first();
  await page.waitForFunction(
    () => /\$\d/.test(document.querySelector('[data-flow-headline-row="collateral"]')?.textContent ?? ""),
    null,
    { timeout: 180_000 },
  );
  const figure = () => head.locator("span.prov-locate-box").first();
  const date = async () => (await page.locator("[data-flow-date]").first().textContent()) ?? "";

  // (a) the live stop.
  const partial = await page
    .locator('[data-flow-partial="collateral"]')
    .first()
    .evaluate((el) => el.closest("[data-reveal-tip]")?.querySelector(".sr-only")?.textContent ?? null)
    .catch(() => null);
  console.log(`live date: ${oneLine(await date())}`);
  console.log(`live note: ${oneLine(partial)}`);
  print("live collateral", await receiptIn(head, figure()));

  // (b) the opening stop.
  const was = await date();
  await page.locator('[data-flow-controls] [data-flow-jump="start"]').first().click();
  await page.waitForFunction((w) => (document.querySelector("[data-flow-date]")?.textContent ?? "") !== w, was, {
    timeout: 30_000,
  });
  console.log(`past date: ${oneLine(await date())}`);
  print("past collateral", await receiptIn(head, figure()));

  // (c) the event sheet's Collateral after.
  const row = page.locator(`[data-event-id^="${EV_HEAD}"][data-event-id$="${EV_TAIL}"]`).first();
  await row.waitFor({ state: "attached", timeout: 120_000 });
  console.log(`event: ${await row.getAttribute("data-event-id")}`);
  console.log(`card tab: ${await openCardOnFigures(row)}`);
  const total = row.locator('[data-sheet-side="collateral"] [data-sheet-row="total"] [role="group"]').first();
  await total.waitFor({ state: "attached", timeout: 60_000 });
  print("event collateral after", await receiptIn(row, total.locator("span.prov-locate-box").first()));
} catch (e) {
  missing++;
  console.log(`error: ${oneLine(e instanceof Error ? e.message : String(e))}`);
} finally {
  await browser.close();
}
process.exit(missing > 0 ? 1 : 0);
