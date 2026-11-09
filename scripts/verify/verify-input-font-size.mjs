#!/usr/bin/env node
// iOS Safari zooms into any focused input, textarea or select whose font is
// under 16px, and the zoom stays after navigation (TO-DO-ui-jobs 425). At a
// 390 px viewport every text field a page carries must compute to at least
// 16px; at 1440 px the desktop sizes stay (the field sizes are printed, not
// asserted). Sliders, the file picker, checkboxes and the display:none
// honeypot do not count. Below sm a listing's facets are the filter sheet,
// opened with each of its sub-views.
// Run: BASE=http://localhost:3086 node scripts/verify/verify-input-font-size.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const PAGES = [
  ["/ethereum/liquity-v2", "listing toolbar field, its filter panels, the feedback modal"],
  ["/ethereum/yearn/vaults", "vault roster search"],
  ["/assets", "asset explorer select"],
];

let failures = 0;
let checked = 0;
const check = (name, cond, detail = "") => {
  checked++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

const readFields = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("input, textarea, select")]
      .filter((el) => !["range", "file", "hidden", "checkbox", "radio"].includes(el.type))
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.type ?? "",
        label: el.getAttribute("aria-label") ?? el.getAttribute("placeholder") ?? el.name ?? "",
        px: parseFloat(getComputedStyle(el).fontSize),
      })),
  );

const browser = await chromium.launch();
for (const [width, height] of [
  [390, 844],
  [1440, 900],
]) {
  const context = await browser.newContext({ viewport: { width, height } });
  for (const [path, what] of PAGES) {
    const page = await context.newPage();
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page
      .locator('[data-skel-section="listing-toolbar"]:not([aria-busy="true"]), input, select')
      .first()
      .waitFor({ state: "visible", timeout: 120000 })
      .catch(() => {});
    await page.waitForTimeout(1200);
    // open each toolbar filter button so the panels' search and range fields are drawn
    const seen = new Map();
    const note = (fs) => fs.forEach((f) => seen.set(`${f.tag}:${f.type}:${f.label}`, f));
    note(await readFields(page));
    const sheetButton = page.locator('[data-skel-section="listing-toolbar"] [data-filter-sheet-open]');
    if (width < 640 && (await sheetButton.count())) {
      // Below sm the facets are the filter sheet (N1, ui-jobs 544): its list
      // draws the range fields in place, and each row opens a sub-view whose
      // option search is read too.
      await sheetButton.click({ timeout: 5000 });
      await page.locator("[data-filter-sheet]").waitFor({ timeout: 5000 });
      note(await readFields(page));
      const rows = await page
        .locator("[data-filter-sheet-row]")
        .evaluateAll((els) =>
          els.filter((e) => e.getAttribute("role") !== "switch").map((e) => e.getAttribute("data-filter-sheet-row")),
        );
      for (const id of rows.slice(0, 8)) {
        await page.locator(`[data-filter-sheet-row="${id}"]`).click({ timeout: 3000 });
        await page.locator(`[data-filter-sheet-view="${id}"]`).waitFor({ timeout: 3000 });
        note(await readFields(page));
        await page.locator("[data-filter-sheet-back]").click();
        await page.locator(`[data-filter-sheet-row="${id}"]`).waitFor({ timeout: 3000 });
      }
      await page.keyboard.press("Escape");
      await page.locator("[data-filter-sheet]").waitFor({ state: "detached", timeout: 5000 });
    } else {
      const buttons = page.locator(
        '[data-skel-section="listing-toolbar"] button[aria-haspopup="menu"], [data-skel-section="listing-toolbar"] button[aria-expanded]:not([aria-haspopup="dialog"])',
      );
      const n = Math.min(await buttons.count(), 8);
      for (let i = 0; i < n; i += 1) {
        await buttons
          .nth(i)
          .click({ timeout: 3000 })
          .catch(() => {});
        await page.waitForTimeout(400);
        note(await readFields(page));
        await page.keyboard.press("Escape");
      }
    }
    const fb = page.getByRole("button", { name: /send feedback/i }).first();
    if (await fb.count()) {
      await fb.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
      note(await readFields(page));
    }
    const fields = [...seen.values()];
    console.log(
      `INFO  ${width}px ${path} (${what}): ${fields.map((f) => `${f.tag}[${f.label}]=${f.px}px`).join(", ") || "no fields"}`,
    );
    if (width === 390) {
      check(`${path} has at least one text field at 390`, fields.length > 0);
      for (const f of fields) check(`390px ${path} ${f.tag}[${f.label}] is at least 16px`, f.px >= 16, `${f.px}px`);
    }
    await page.close();
  }
  await context.close();
}
await browser.close();
console.log(failures ? `\n${failures} CHECK(S) FAILED of ${checked}` : `\nALL ${checked} CHECKS PASS`);
process.exit(failures ? 1 : 0);
