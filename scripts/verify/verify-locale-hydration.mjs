#!/usr/bin/env node
// verify-locale-hydration — the pages render the same numbers for a reader
// whose browser is not English.
// ----------------------------------------------------------------------------
// `n.toLocaleString()` formats in whatever locale the runtime is set to. Once
// the detail pages render on the server that is TWO runtimes for one piece of
// markup: the server's ICU default writes "1,234" and a de-DE browser writes
// "1.234". React sees the text differ, discards the server's markup for that
// subtree and repaints it — error #418 — so a German reader gets a flash and a
// page that is no longer the document the server sent. Every call site now
// names its locale ("en-US" numbers, "en-GB" dates), and scripts/check-locale.mjs
// keeps it that way statically. This is the runtime half of the same claim.
//
// ⇒ IT CARRIES ITS OWN POSITIVE CONTROL. A green run that only says "no errors"
// cannot distinguish a working pin from a page that rendered no numbers at all,
// so a run where nothing was grouped is reported as NO EVIDENCE, not a pass.
// The control is the grouping character: under a de-DE context a pinned figure
// still groups with a comma ("1,234"), and an unpinned one would group with a
// dot.
//
// The dot-grouped scan wants TWO groups ("1.234.567") before it will call a
// token de-formatted. One group is ambiguous with an ordinary decimal — a
// collateral amount printed to three places reads as "660.277" and is not a
// finding — and a check that cries wolf on real page copy gets ignored, which
// is worse than not running it.
//
// This verifier is also the one that found the SECOND axis. The locale sweep
// alone left every position page throwing #418 for a Berlin browser, because
// the times were still rendered in the runtime's zone; running the two axes
// apart (locale-only vs zone-only) is what separated them.
//
//   BASE=http://localhost:3111 node scripts/verify/verify-locale-hydration.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";

// One route per shape the sweep touched: a listing that renders a roster count,
// a market/system view, and a position page from each of the four SSR split
// shapes. Fixtures are pinned addresses with real history — a wallet with no
// events renders no numbers and would make the control vacuous.
const ROUTES = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      "/",
      "/coverage/ethereum",
      "/coverage/base",
      "/ethereum/morpho/markets",
      "/ethereum/spark/market",
      "/ethereum/spark/0x1601843c5e9bc251a3272907010afa41fa18347e",
      "/ethereum/aave-v3/0x11111605b53ecef22726df86881e4d6d40b5ca11",
      "/ethereum/compound-v2/0x1a6bae20f70691ce1755a003c4560879b7798910",
      "/ethereum/liquity-v1/0x04ca2a945ccba92ca2443024c07c99f81e71547f",
      "/ethereum/makerdao/0x226ede73e2efae6a1acf4f162b8e28caee3aaeb4",
      "/ethereum/moonwell/0x9781f72f15ff9d961f5b0aaf1d93b40c23905f05",
      "/ethereum/pwn/0x0598b250a99bd45155a6b9b04af2ee19a2e5fed0",
      // Dolomite's position grain is (owner, accountNumber) — two segments.
      // /dolomite/[owner] alone 404s deliberately.
      "/ethereum/dolomite/0xe6705fccaf951870ef24463c88a81f31610efba4/53264333596970428064010753932179380014364720754547549633613121572245119207273",
      // LlamaLend's grain is (controller, user) — each controller is an
      // isolated market, so one page per user would assert a single health
      // across markets that liquidate independently.
      "/ethereum/llamalend/0x100daa78fc509db39ef7d04de0c1abd299f4c6ce/0xe32a8cf93af8661ec4708ef627b255801184ad2f",
      "/ethereum/maple/0x9ec2d8dd95ee25975ba2a5bb4e9d50dd57b7c87a",
      "/ethereum/frankencoin/0x6377a63b2a8caa1db4190a5419d2dc9215d74a3f",
    ];

const DOT_GROUPED = /\b\d{1,3}(?:\.\d{3}){2,}(?!\d)/g;
const COMMA_GROUPED = /\b\d{1,3}(?:,\d{3})+\b/g;

const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: "de-DE", timezoneId: "Europe/Berlin" });

let checked = 0;
let failed = 0;
let withNumbers = 0;

for (const route of ROUTES) {
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message).split("\n")[0]));
  page.on("console", (m) => {
    const t = m.text();
    if (/#418|#423|hydrat/i.test(t)) errs.push(t.split("\n")[0]);
  });
  checked += 1;
  try {
    const res = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForTimeout(1500);
    const status = res?.status() ?? 0;
    const body = await page.evaluate(() => document.body.innerText);
    const dot = body.match(DOT_GROUPED) ?? [];
    const comma = body.match(COMMA_GROUPED) ?? [];
    if (comma.length) withNumbers += 1;
    const hyd = errs.filter((e) => /#418|#423|hydrat/i.test(e));
    if (hyd.length || status >= 500 || dot.length) {
      failed += 1;
      const why = hyd.length
        ? hyd.slice(0, 2).join(" | ")
        : dot.length
          ? `de-grouped figures on the page: ${dot.slice(0, 4).join(", ")}`
          : "server error";
      console.log(`FAIL  ${route}  [${status}]  ${why}`);
    } else {
      console.log(`PASS  ${route}  [${status}]  ${comma.length} comma-grouped figures, 0 hydration errors`);
    }
  } catch (e) {
    failed += 1;
    console.log(`CRASH ${route}  ${String(e.message).split("\n")[0]}`);
  }
  await page.close();
}

await browser.close();

// The control: a run where nothing rendered a grouped number proves nothing
// about the pin, so it is not allowed to read as a pass.
if (withNumbers === 0) {
  console.log(`\nNO EVIDENCE — not one route rendered a grouped number, so the de-DE control never fired.`);
  process.exit(1);
}

console.log(
  `\n${checked} routes, ${checked - failed} passed, ${failed} failed.` +
    ` ${withNumbers} rendered comma-grouped figures under a de-DE browser (the control).`,
);
process.exit(failed > 0 ? 1 : 0);
