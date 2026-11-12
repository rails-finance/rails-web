// The provenance inspector's one state (rails-ops TO-DO-ui-jobs 624): the
// profile menu's switch (H20.1), "Exit inspector" beside the profile control (H7.4), Escape
// and the inspector read and write one state. Putting the inspector down from
// any of them turns the saved choice off, and the switch reads off at once;
// the switch turned on arms the page at once, and turned off disarms it.
// Read on an Aave V3 position (a route the preference arms, no dock).

import { chromium } from "playwright";
import { BASE, bypassHeaders } from "./lib/host.mjs";

const PATH = "/ethereum/aave-v3/0x8008316e61985599dc62d69716bab3ebe643c0a8?market=core";
const KEY = "rails-prov-inspector";
const H20 = '[data-anatomy="H20"]:visible';
const SWITCH = "[data-profile-menu-prov]";
const EXIT = ".prov-inspect-exit:visible";

let checked = 0;
let failures = 0;
function check(name, ok, detail = "") {
  checked += 1;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, extraHTTPHeaders: bypassHeaders() });
const page = await ctx.newPage();
const ready = async () => {
  await page.waitForSelector("[data-prov-covered], .prov-locate-box", { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(2500);
};
await page.goto(`${BASE}${PATH}`, { waitUntil: "domcontentloaded", timeout: 180000 });
await page.evaluate((k) => localStorage.setItem(k, "1"), KEY);
await page.reload({ waitUntil: "domcontentloaded" });
await ready();

/** The three readings: the page armed, the saved choice, and the switch (opened, read, closed). */
async function state() {
  const armed = (await page.locator("[data-prov-pickable]").count()) > 0;
  const saved = await page.evaluate((k) => localStorage.getItem(k) === "1", KEY);
  let sw = null;
  for (let i = 0; i < 4 && sw == null; i++) {
    await page.locator(H20).click();
    sw = await page
      .waitForSelector(SWITCH, { timeout: 3000 })
      .then((e) => e.getAttribute("data-profile-menu-prov"))
      .catch(() => null);
  }
  await closeMenu();
  return { armed, saved, sw };
}
async function pressSwitch() {
  await page.locator(H20).click();
  await page.waitForSelector(SWITCH, { timeout: 5000 });
  await page.locator(SWITCH).click();
  await page.waitForTimeout(500);
  await closeMenu();
}
/** Close the menu from its trigger: Escape would also be the inspector's. */
async function closeMenu() {
  if (await page.$("[data-profile-menu]")) await page.locator(H20).click();
  await page.waitForTimeout(400);
}

let s = await state();
check(
  "saved on: the page arms on arrival and the switch reads on",
  s.armed && s.saved && s.sw === "on",
  JSON.stringify(s),
);

// Exit inspector puts it down, saved choice included.
// "Exit inspector" stands beside the visible profile control (ui-jobs 624.2):
// its right edge within 16px left of H20's left, the two on one line.
const nextTo = await (async () => {
  const e = await page
    .locator(EXIT)
    .first()
    .boundingBox()
    .catch(() => null);
  const h = await page
    .locator(H20)
    .first()
    .boundingBox()
    .catch(() => null);
  if (!e || !h) return { e, h };
  const gap = h.x - (e.x + e.width);
  const midDy = Math.abs(e.y + e.height / 2 - (h.y + h.height / 2));
  return { ok: gap >= 0 && gap <= 16 && midDy <= 6, gap, midDy };
})();
check("Exit inspector stands beside the profile control", Boolean(nextTo.ok), JSON.stringify(nextTo));
await page
  .locator(EXIT)
  .first()
  .click({ timeout: 5000 })
  .catch(() => {});
await page.waitForTimeout(400);
s = await state();
check(
  "Exit inspector: disarmed, the saved choice off, the switch reads off",
  !s.armed && !s.saved && s.sw === "off",
  JSON.stringify(s),
);

// The switch turned on arms the page at once; off disarms it.
await pressSwitch();
s = await state();
check("switch on: armed at once, saved, reads on", s.armed && s.saved && s.sw === "on", JSON.stringify(s));
await pressSwitch();
s = await state();
check("switch off: disarmed at once, not saved, reads off", !s.armed && !s.saved && s.sw === "off", JSON.stringify(s));

// Escape's second rung puts it down the same way.
await pressSwitch();
await page
  .locator("main")
  .first()
  .click({ position: { x: 5, y: 5 } })
  .catch(() => {});
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
s = await state();
check(
  "Escape: disarmed, the saved choice off, the switch reads off",
  !s.armed && !s.saved && s.sw === "off",
  JSON.stringify(s),
);

await browser.close();
console.log(`\n${checked - failures}/${checked} checks pass`);
process.exit(failures || checked === 0 ? 1 : 0);
