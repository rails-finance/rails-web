// The home count as the way to how it is counted (anatomy S3.3, S3.4; ui-jobs 785).
// Run against a dev server:  BASE=http://localhost:3031 node scripts/verify/verify-home-figures-link.mjs
//
// Checklist:
//   1. Home: no "How these are counted" line.
//   2. The position count is a link to /about/figures, named "<count>: how the
//      figures are counted", in the figure's colour (not the link blue).
//   3. At rest it carries no visible underline; on hover a dotted one.
//   4. Following it lands on /about/figures, whose first paragraph is the claim:
//      "The home page says Rails explores <same count> positions … This page
//      shows how those figures are counted."
//   5. At 375 the count's link sits inside the viewport.
//   6. No page errors.
// SHOTS=<dir> writes the pages at 1280 and 375.

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS;

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

const browser = await chromium.launch();
const errors = [];
const open = async (width) => {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on("pageerror", (e) => errors.push(e.message));
  return page;
};

const page = await open(1280);
await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 180000 });
const link = page.locator('[data-anatomy="S3.3"]');
await link.waitFor({ timeout: 60000 });

check("1. no 'How these are counted' line", (await page.getByText("How these are counted").count()) === 0);

const count = (await link.textContent())?.trim() ?? "";
const name = await link.getAttribute("aria-label");
check(
  "2. the count links to /about/figures",
  (await link.evaluate((a) => a.tagName)) === "A" && (await link.getAttribute("href")) === "/about/figures",
);
check("2. its name says where it goes", name === `${count}: how the figures are counted`, name ?? "none");
const colours = await page.evaluate(() => {
  const a = document.querySelector('[data-anatomy="S3.3"]');
  const t = document.querySelector('[data-anatomy="S3.1"]');
  return { a: getComputedStyle(a).color, body: getComputedStyle(document.body).color, t: getComputedStyle(t).color };
});
check("2. in the figure's colour", !/rgb\(37, 99, 235\)/.test(colours.a), JSON.stringify(colours));

const deco = () => link.evaluate((a) => getComputedStyle(a).textDecorationColor);
const style = await link.evaluate((a) => getComputedStyle(a).textDecorationStyle);
const rest = await deco();
await link.hover();
await page.waitForTimeout(200);
const hover = await deco();
check("3. dotted underline", style === "dotted", style);
check("3. invisible at rest, shown on hover", /, 0\)$|transparent/.test(rest) && rest !== hover, `${rest} → ${hover}`);
if (SHOTS) await page.screenshot({ path: `${SHOTS}/785-home-1280.png` });

await Promise.all([page.waitForURL(/\/about\/figures$/, { timeout: 120000 }), link.click()]);
const claim = page.locator("[data-figures-claim]");
await claim.waitFor({ timeout: 120000 });
const text = ((await claim.textContent()) ?? "").replace(/\s+/g, " ").trim();
const firstP = await page.evaluate(() => {
  const body = document.querySelector('[data-anatomy="S3.4"]');
  return body?.querySelector("p")?.hasAttribute("data-figures-claim") ?? false;
});
check("4. lands on /about/figures", new URL(page.url()).pathname === "/about/figures");
check("4. the claim opens the page", firstP);
check(
  "4. the claim restates the count",
  text.startsWith(`The home page says Rails explores ${count} positions`) &&
    text.endsWith("This page shows how those figures are counted."),
  text,
);
if (SHOTS) await page.screenshot({ path: `${SHOTS}/785-figures-1280.png` });

const phone = await open(375);
await phone.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 180000 });
const pl = phone.locator('[data-anatomy="S3.3"]');
await pl.waitFor({ timeout: 60000 });
const box = await pl.boundingBox();
check("5. inside the viewport at 375", box != null && box.x >= 0 && box.x + box.width <= 375, JSON.stringify(box));
if (SHOTS) {
  await pl.scrollIntoViewIfNeeded();
  await phone.screenshot({ path: `${SHOTS}/785-home-375.png` });
  await phone.goto(`${BASE}/about/figures`, { waitUntil: "networkidle", timeout: 180000 });
  await phone.screenshot({ path: `${SHOTS}/785-figures-375.png` });
}

check("6. no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
