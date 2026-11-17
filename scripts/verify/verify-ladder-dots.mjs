// verify-ladder-dots — the class dots in the inspector popover's head open the
// class modal (TO-DO-ui-jobs §33; its name is LADDER_TITLE, ui-jobs 617).
//
// The ladder's only trigger once sat in the receipt head the popover never
// renders, so no surface could open it. The dots are now a labelled button.
// Opening the ladder must not cost the reader the popover they opened it
// from: a click inside the modal is not a click away, and Escape closes the
// modal before it reaches the inspector's own Escape rungs.
//
// Usage:
//   BASE=http://localhost:3000 node scripts/verify/verify-ladder-dots.mjs
// Against the deployed preview (dev.rails.finance), the bypass header rides
// the browser context — see lib/host.mjs.

import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { ARMED, armInspector } from "./lib/prov-inspector.mjs";
import { BASE, bypassHeaders } from "./lib/host.mjs";

const PATH = "/ethereum/liquity-v2/branches";
// The modal's name, read from its one constant (plain node cannot import the
// .ts module).
const TITLE = readFileSync(new URL("../../lib/shared/prov-class-words.ts", import.meta.url), "utf8").match(
  /export const LADDER_TITLE = "([^"]+)"/,
)?.[1];
if (!TITLE) throw new Error("LADDER_TITLE not found in lib/shared/prov-class-words.ts");

const fails = [];
function check(name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) fails.push(name);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: bypassHeaders() });
await page.goto(BASE + PATH, { waitUntil: "domcontentloaded", timeout: 180000 });

await armInspector(page);
const pop = page.locator(".prov-inspect-pop");
const ladder = page.locator(`[role="dialog"][aria-label="${TITLE}"]`);
// The inspector indicator beside the profile control stands while armed: the mode's state.
const armed = async () => (await page.locator(ARMED).count()) > 0;

// Pick the first value that opens a popover.
const picks = page.locator("[data-prov-pickable]");
await picks.first().waitFor({ state: "visible", timeout: 90000 });
const n = await picks.count();
for (let i = 0; i < Math.min(n, 10) && (await pop.count()) === 0; i++) {
  await picks
    .nth(i)
    .click({ timeout: 3000 })
    .catch(() => {});
  await page.waitForTimeout(200);
}
check("a pick opens the popover", (await pop.count()) === 1, `${n} pickables`);
if ((await pop.count()) === 0) {
  await browser.close();
  console.log(`\n${fails.length} FAILURE(S)`);
  process.exit(1);
}

const dots = pop.locator(".prov-inspect-head .prov-rrow-dots");
const tag = await dots.evaluate((el) => el.tagName).catch(() => null);
const label = await dots.getAttribute("aria-label").catch(() => null);
check("the head's dots are a button", tag === "BUTTON", String(tag));
check("the button is labelled for what it opens", (label ?? "").endsWith(`. ${TITLE}`), label ?? "no label");

// Keyboard: focus the dots and press Enter.
await dots.focus().catch(() => {});
await page.keyboard.press("Enter");
await page.waitForTimeout(250);
check(
  "Enter on the dots opens the class modal",
  (await ladder.count()) === 1 &&
    (await ladder
      .locator("h2")
      .innerText()
      .catch(() => "")) === TITLE,
);
check("the popover stays open under the ladder", (await pop.count()) === 1);

// A click inside the modal is not a click away.
await ladder
  .locator("h2")
  .click()
  .catch(() => {});
await page.waitForTimeout(200);
check(
  "a click inside the ladder leaves it and the popover open",
  (await ladder.count()) === 1 && (await pop.count()) === 1,
);

// Escape closes the ladder only.
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
check("Escape closes the ladder", (await ladder.count()) === 0);
check("…and leaves the popover open and the tool armed", (await pop.count()) === 1 && (await armed()));

// Mouse: click the dots, then the ladder's close button.
await dots.click().catch(() => {});
await page.waitForTimeout(250);
check("a click on the dots opens the ladder", (await ladder.count()) === 1);
await ladder
  .locator('button[aria-label="Close"]')
  .click()
  .catch(() => {});
await page.waitForTimeout(200);
check("the ladder's close button returns to the popover", (await ladder.count()) === 0 && (await pop.count()) === 1);

// Control: with no modal open, Escape's first rung still closes the popover.
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
check("Escape without the ladder still closes the popover, tool armed", (await pop.count()) === 0 && (await armed()));

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILURE(S)` : "\nALL CHECKS PASSED");
process.exitCode = fails.length ? 1 : 0;
