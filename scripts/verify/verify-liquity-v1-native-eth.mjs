// Assert: Liquity V1's ETH is native ETH and draws the plain ETH mark
// (eth.png), never the wrapped mark (weth.png, the dashed ring), on its Trove
// pages and its Stability Pool pages (Miles, 20 Nov 2026). The collateral's
// chips pass native ETH's sentinel (COLLATERAL_ADDRESS in
// lib/liquity-v1/asset-catalog.ts), which components/shared/token-chip-icon.tsx
// resolves to the plain mark. Each page's first event cards are opened, so
// the spine, the head and the sheet are all counted.
//
// Run with the dev server up:
//   BASE=http://localhost:3000 node scripts/verify/verify-liquity-v1-native-eth.mjs
//
// Proved able to fail: before the sentinel reached the Trove pages, the open
// Trove below drew 16 weth.png marks and 0 eth.png.

import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3000";
const PAGES = [
  ["open Trove", "/ethereum/liquity-v1/0x04ca2a945ccba92ca2443024c07c99f81e71547f?epoch=1"],
  ["liquidated Trove", "/ethereum/liquity-v1/0x1558ad8ed679d00f7c419291b4b32da1a59b06e8?epoch=1"],
  ["Trove listing", "/ethereum/liquity-v1"],
  ["deposit listing", "/ethereum/liquity-v1/stability-pool"],
  ["open deposit", "/ethereum/liquity-v1/stability-pool/0x6bcde33a5cb39ebcbdce2702120c29672eb62b2e"],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
let fail = 0;
for (const [name, path] of PAGES) {
  await page.goto(BASE + path, { waitUntil: "load", timeout: 90_000 });
  await page.waitForTimeout(8_000);
  const heads = page.locator("[data-event-id] [data-evt-head-chev]");
  const n = Math.min(await heads.count(), 6);
  for (let i = 0; i < n; i++)
    await heads
      .nth(i)
      .click()
      .catch(() => {});
  await page.waitForTimeout(1_500);
  const srcs = await page.$$eval("img", (a) => a.map((i) => i.getAttribute("src") || ""));
  const eth = srcs.filter((s) => /\/eth\.png$/.test(s)).length;
  const weth = srcs.filter((s) => /\/weth\.png$/.test(s)).length;
  const ok = eth > 0 && weth === 0;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: eth.png ${eth}, weth.png ${weth}`);
}
await browser.close();
console.log(`\n=== SUMMARY ===\nPASS=${PAGES.length - fail} FAIL=${fail}`);
console.log(fail ? "SOME CHECKS FAILED" : "ALL CHECKS: PASS");
process.exit(fail ? 1 : 0);
