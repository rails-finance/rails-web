// WalletPill resolves an EOA's ENS name itself (item 8: "ens should be primary
// for an EOA wherever possible"). Two things must hold, and they pull against
// each other — hence one verifier for both:
//
//   1. Names actually render. Before this wiring only Aave V4's listing carried
//      a backend-supplied name; every other explorer showed hex forever.
//   2. Resolution stays BATCHED. The hook coalesces a render pass into one
//      /api/ens/reverse call, so a 20-pill listing costs ~1 request. If that
//      ever regresses to per-pill, a listing fires 20 round trips and this is
//      the check that says so.
//
// Reverse resolution goes through the mainnet Universal Resolver, which
// round-trips the name back to the address — a rendered name is chain-verified
// to belong to that address, so it is safe as a primary label in a way a
// guessed one would not be.
//
// Run with the dev server up:
//   BASE=http://localhost:3000 node scripts/verify/verify-ens-pills.mjs

import { chromium } from "playwright";
const BASE = process.env.BASE || "http://localhost:3000";
// ⚠️ Select on the STRUCTURAL hook, never the typeface. This selector used to
// be `span.font-mono.text-rb-500, button.font-mono.text-rb-500` — which meant
// it identified a wallet pill by its font. When names moved off mono (a name is
// a word; mono exists so hex can be read character by character), every named
// pill silently vanished from the count and the check reported 0 names on a
// page that was rendering them correctly. A presentational class is not an
// identity.
const PILL = "[data-wallet-label]";
const ROUTES = [
  ["aave-v3", "/ethereum/aave-v3"],
  ["maple", "/ethereum/maple"],
  ["fx", "/ethereum/fx"],
  ["aave-v4", "/ethereum/aave-v4"],
  ["compound-v2", "/ethereum/compound-v2"],
];

let pass = 0,
  fail = 0;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
let reqs = 0;
page.on("request", (r) => {
  if (r.url().includes("/api/ens/reverse")) reqs++;
});

let totalPills = 0,
  totalNamed = 0;
for (const [label, path] of ROUTES) {
  reqs = 0;
  // A navigation timeout must be a FAIL, not a crash. Chaining browser
  // verifiers in one shell can leave the dev server compiling, and an
  // unhandled throw kills the script before its summary — which on a CI log
  // is indistinguishable from "this check never ran".
  let r;
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "load", timeout: 90000 });
    await page.waitForTimeout(4000);
    r = await page.evaluate((PILL) => {
      const pills = [...document.querySelectorAll(PILL)].filter((e) => (e.textContent || "").trim());
      // Count what the component DECIDED, not what the string looks like. The
      // old test was `label.endsWith(".eth")`, which silently scores a `.box`
      // or `.cb.id` primary name as unresolved — a name is whatever the
      // Universal Resolver round-tripped, not a guess about its suffix.
      return {
        total: pills.length,
        named: pills.filter((e) => e.getAttribute("data-wallet-label") === "name").length,
      };
    }, PILL);
  } catch (err) {
    fail++;
    console.log(`FAIL  ${label}: threw during the run — ${err && err.message}`);
    continue;
  }
  totalPills += r.total;
  totalNamed += r.named;
  if (r.total === 0) {
    console.log(`SKIP  ${label}: no wallet pills on this listing`);
    continue;
  }
  // One flush per render pass; a late-mounting row can legitimately add a
  // second. Anything approaching per-pill is the regression this guards.
  const cap = Math.max(3, Math.ceil(r.total / 8));
  if (reqs <= cap) {
    pass++;
    console.log(`PASS  ${label}: ${r.total} pills resolved in ${reqs} request(s) (cap ${cap}) — batching holds`);
  } else {
    fail++;
    console.log(`FAIL  ${label}: ${r.total} pills cost ${reqs} requests (cap ${cap}) — batching has regressed`);
  }
  console.log(`      ${r.named}/${r.total} carry a name`);
}

// End-to-end wiring: at least one name must render SOMEWHERE, or the hook is
// silently returning null everywhere and the pills only look correct because
// hex is the fallback.
if (totalNamed > 0) {
  pass++;
  console.log(`\nPASS  ${totalNamed}/${totalPills} pills across the roster resolved to a name — the hook is wired`);
} else {
  fail++;
  console.log(`\nFAIL  0/${totalPills} pills resolved — ENS is not reaching WalletPill at all`);
}

await browser.close();
console.log(`\n=== SUMMARY ===\nPASS=${pass} FAIL=${fail}`);
console.log(fail === 0 ? "ALL CHECKS: PASS" : "ALL CHECKS: FAIL");
process.exit(fail === 0 ? 0 : 1);
