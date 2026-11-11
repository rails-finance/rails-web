#!/usr/bin/env node
/**
 * Counts React hydration errors (#418 and kin) on the home page.
 * ----------------------------------------------------------------------------
 * ui-jobs 464: production logged #418 on every load of `/` because Vercel's
 * background regeneration renders the home route as `/index`, so `usePathname()`
 * read `/index` on the server and `/` in the browser (`hooks/useIsHome.ts`).
 * A fresh deploy is clean until its first regeneration, so read production more
 * than an hour after a deploy. A local build never renders `/index`.
 *
 * Loads `/` under seven conditions (three locale and timezone pairs at 1280 and
 * 390, plus dark mode) and prints each load's console errors and a total.
 *
 * Run:
 *   node scripts/probe-home-hydration.mjs <baseUrl> [loadsPerCondition=3]
 *   BYPASS=<VERCEL_AUTOMATION_BYPASS_SECRET> node scripts/probe-home-hydration.mjs https://dev.rails.finance 1
 * SWAP_INDEX=1 serves `/index` in place of `/`, to read the markup a
 * regenerated page carries.
 */
import { chromium } from "playwright";

const base = process.argv[2];
if (!base) {
  console.error("usage: node scripts/probe-home-hydration.mjs <baseUrl> [loadsPerCondition]");
  process.exit(2);
}
const loads = Number(process.argv[3] || 3);
const conditions = [
  { name: "en-GB London 1280", locale: "en-GB", timezoneId: "Europe/London", width: 1280, height: 900 },
  { name: "en-GB London 390", locale: "en-GB", timezoneId: "Europe/London", width: 390, height: 844, mobile: true },
  { name: "en-US LA 1280", locale: "en-US", timezoneId: "America/Los_Angeles", width: 1280, height: 900 },
  { name: "en-US LA 390", locale: "en-US", timezoneId: "America/Los_Angeles", width: 390, height: 844, mobile: true },
  { name: "de-DE Tokyo 1280", locale: "de-DE", timezoneId: "Asia/Tokyo", width: 1280, height: 900 },
  { name: "de-DE Tokyo 390", locale: "de-DE", timezoneId: "Asia/Tokyo", width: 390, height: 844, mobile: true },
  {
    name: "en-US LA 1280 dark",
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    width: 1280,
    height: 900,
    dark: true,
  },
];

const browser = await chromium.launch();
let total = 0;
for (const c of conditions) {
  for (let i = 0; i < loads; i++) {
    const ctx = await browser.newContext({
      locale: c.locale,
      timezoneId: c.timezoneId,
      viewport: { width: c.width, height: c.height },
      isMobile: !!c.mobile,
      hasTouch: !!c.mobile,
      colorScheme: c.dark ? "dark" : "light",
      ...(process.env.BYPASS
        ? {
            extraHTTPHeaders: {
              "x-vercel-protection-bypass": process.env.BYPASS,
              "x-vercel-set-bypass-cookie": "true",
            },
          }
        : {}),
    });
    const page = await ctx.newPage();
    if (process.env.SWAP_INDEX) {
      await page.route(base + "/", async (r) => {
        const res = await r.fetch({ url: base + "/index" });
        await r.fulfill({ response: res });
      });
    }
    const errs = [];
    page.on("console", (m) => {
      if (m.type() === "error") errs.push(m.text().slice(0, 300));
    });
    page.on("pageerror", (e) => errs.push("pageerror: " + String(e.message).slice(0, 300)));
    await page.goto(base + "/", { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(4000);
    const hyd = errs.filter((e) => /418|419|423|425|hydrat/i.test(e));
    total += hyd.length;
    console.log(`${c.name} load ${i + 1}: ${errs.length} console errors, ${hyd.length} hydration`);
    for (const e of errs) console.log("   ", e);
    await ctx.close();
  }
}
await browser.close();
console.log(`TOTAL hydration errors: ${total}`);
