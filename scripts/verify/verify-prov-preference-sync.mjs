// The provenance inspector's one state (rails-ops TO-DO-ui-jobs 624): the
// profile menu's switch "Inspector" (H20.1), Escape and the inspector read
// and write one state; the indicator beside the profile control (H7.4) shows
// it and turns nothing off (ui-jobs 651). Putting the inspector down from
// any of them turns the saved choice off, and the switch reads off at once;
// the switch turned on arms the page at once, and turned off disarms it.
// Read on an Aave V3 position (a route the preference arms, no dock).

import { chromium } from "playwright";
import { BASE, bypassHeaders } from "./lib/host.mjs";
import { openAdvanced } from "./lib/prov-inspector.mjs";

const PATH = "/ethereum/aave-v3/0x8008316e61985599dc62d69716bab3ebe643c0a8?market=core";
const KEY = "rails-prov-inspector";
const H20 = '[data-anatomy="H20"]:visible';
const SWITCH = "[data-profile-menu-prov]";
const INDICATOR = "[data-prov-inspect-on]:visible";

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
    await openAdvanced(page);
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
  await openAdvanced(page);
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

// The indicator stands beside the visible profile control (ui-jobs 624.2,
// 651): its right edge within 16px left of H20's left, the two on one line.
const nextTo = await (async () => {
  const e = await page
    .locator(INDICATOR)
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
check("the inspector indicator stands beside the profile control", Boolean(nextTo.ok), JSON.stringify(nextTo));
// A press on the indicator changes nothing.
await page
  .locator(INDICATOR)
  .first()
  .click({ timeout: 5000 })
  .catch(() => {});
await page.waitForTimeout(400);
s = await state();
check("a press on the indicator: still armed, saved, reads on", s.armed && s.saved && s.sw === "on", JSON.stringify(s));

// The switch turned off puts it down, saved choice included, and the
// indicator leaves the header.
await pressSwitch();
s = await state();
const gone = (await page.locator(INDICATOR).count()) === 0;
check(
  "switch off: disarmed, the saved choice off, reads off, no indicator",
  !s.armed && !s.saved && s.sw === "off" && gone,
  JSON.stringify({ ...s, gone }),
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

// Off the switch's routes (ui-jobs 625, 651; Miles 13 Nov 2026): the switch
// reads the saved choice and toggles it there as anywhere, nothing is
// pickable, and the header draws no inspector indicator.
const OFF_LIST = "/assets";
await page.evaluate((k) => localStorage.setItem(k, "1"), KEY);
await page.goto(`${BASE}${OFF_LIST}`, { waitUntil: "domcontentloaded", timeout: 180000 });
await page.waitForTimeout(3000);
const offList = async () => ({
  ...(await state()),
  indicator: await page.locator(INDICATOR).count(),
});
let o = await offList();
check(
  `${OFF_LIST}: saved on, the switch reads on; nothing is pickable; no inspector indicator`,
  o.saved && o.sw === "on" && !o.armed && o.indicator === 0,
  JSON.stringify(o),
);
await pressSwitch();
o = await offList();
check(`${OFF_LIST}: a press turns it off`, !o.saved && o.sw === "off" && !o.armed, JSON.stringify(o));
await pressSwitch();
o = await offList();
check(
  `${OFF_LIST}: a second press turns it on; still nothing pickable, no indicator`,
  o.saved && o.sw === "on" && !o.armed && o.indicator === 0,
  JSON.stringify(o),
);
await browser.close();
console.log(`\n${checked - failures}/${checked} checks pass`);
process.exit(failures || checked === 0 ? 1 : 0);
