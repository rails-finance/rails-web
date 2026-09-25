// Live in-browser verification of the market-surface provenance rollout — the
// views whose figures registered as market-level receipts across the pilot and
// the follow-on wave: /compound/markets, /aave-v3/market, /spark/market,
// /base/aave-v3/market, /base/seamless/market, /compound-v2/markets,
// /moonwell/markets, /morpho/markets, /fluid/vaults,
// /llamalend/markets, /dolomite/markets, /aave-v4/hubs, /liquity-v2/branches.
// Run against a dev server:  BASE=http://localhost:3000 node scripts/verify/verify-prov-receipts.mjs
// (claude-in-chrome cannot reach localhost — this script is the check.)
//
// This originally drove the per-card receipts panel ("Show provenance" →
// .prov-receipts → .prov-rrow) — that surface is RETIRED, and waiting 120s per
// page for its affordance is what turned this script into the suite's 900s
// hang. The page-level provenance inspector (prov-inspector.tsx) is THE
// receipt surface now, so the same claims are asserted against it:
//
//   1. The inspector toggle mounts (button.prov-inspect-toggle) — the page
//      participates in the provenance surface. Presence alone no longer
//      proves receipts exist (the toggle mounts unconditionally), so:
//   2. Arming stamps ≥1 pickable value ([data-prov-pickable]) — the page's
//      figures are REGISTERED receipts, not just prose. Polled with a
//      deadline: these surfaces fetch on mount, and scoped values register
//      as their data resolves.
//   3. Picking a value pins the popover (.prov-inspect-pop) whose embedded
//      receipt exposes a citable BLOCK — a reader can re-run the read. The
//      block has TWO lanes: the coordinates row (.prov-src-block, with its
//      copy button), and the vocabulary's own summary prose ("… at block N").
//      AND-ed with the pickable count so an empty page cannot pass vacuously;
//      the first few pickables are tried in order, the row preferred, and the
//      detail names which anchored and how.
//   4. On a page whose vocabulary sets `source: { block }` (`strip: true`
//      below), the block anchors on the coordinates row, not only the prose.
//      The prose lane hid a fault for two months: from the per-card panel's
//      retirement (2026-07-22) nothing read the `source` slot, so every
//      market receipt named its block in a sentence with no copyable
//      coordinate, and check 3 passed on the prose. This file recorded the
//      symptom as a measurement ("/compound/markets uses only the prose lane
//      on all 262 receipts"). The receipt reads the slot since 2026-09-21.
//
// The gate is on what we ITERATE (pickable count > 0), never on an expected
// list — `.every()` over an empty array is vacuously green (traps § in the
// plan).

import { chromium } from "playwright";
import { armInspector, openInspectorHome } from "./lib/prov-inspector.mjs";

const BASE = process.env.BASE ?? "http://localhost:3000";

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGES = [
  { name: "/ethereum/compound-v3/markets", path: "/ethereum/compound-v3/markets", strip: true },
  { name: "/ethereum/aave-v3/market", path: "/ethereum/aave-v3/market", strip: true },
  { name: "/ethereum/spark/market", path: "/ethereum/spark/market", strip: true },
  { name: "/base/aave-v3/market", path: "/base/aave-v3/market", strip: true },
  { name: "/base/seamless/market", path: "/base/seamless/market", strip: true },
  { name: "/ethereum/compound-v2/markets", path: "/ethereum/compound-v2/markets", strip: true },
  { name: "/ethereum/moonwell/markets", path: "/ethereum/moonwell/markets", strip: true },
  { name: "/ethereum/morpho/markets", path: "/ethereum/morpho/markets", strip: true },
  { name: "/ethereum/fluid/vaults", path: "/ethereum/fluid/vaults", strip: true },
  { name: "/ethereum/llamalend/markets", path: "/ethereum/llamalend/markets", strip: true },
  { name: "/ethereum/dolomite/markets", path: "/ethereum/dolomite/markets", strip: true },
  { name: "/ethereum/aave-v4/hubs", path: "/ethereum/aave-v4/hubs", strip: true },
  { name: "/ethereum/liquity-v2/branches", path: "/ethereum/liquity-v2/branches" },
];

// How many leading pickables to try for a block-bearing receipt before
// calling the page failed.
const PICK_TRIES = 5;

/** Close an open popover without disarming — via its own close button, not
 *  Escape (Escape's second rung would put the whole tool down). */
async function dismissPopover(page) {
  const pop = page.locator(".prov-inspect-pop").first();
  if ((await pop.count()) === 0) return;
  await pop
    .locator("button.prov-inspect-close")
    .first()
    .click()
    .catch(() => {});
  await sleep(150);
}

let browser = await chromium.launch();
const pageErrors = [];

for (const p of PAGES) {
  // One page's death (or even a chromium crash — seen live: newPage threw
  // "browser has been closed" three pages in) must cost that page's checks,
  // never the whole run's verdict.
  let page;
  try {
    page = await browser.newPage();
  } catch {
    browser = await chromium.launch();
    page = await browser.newPage();
  }
  try {
    await runPage(page, p);
  } catch (e) {
    check(`${p.name}: page verified without throwing`, false, String(e).slice(0, 140));
  }
  await page.close().catch(() => {});
}

async function runPage(page, p) {
  page.on("pageerror", (e) => pageErrors.push(`${p.name}: ${e}`));
  await page.goto(`${BASE}${p.path}`, { waitUntil: "domcontentloaded", timeout: 240000 });

  // 1. The inspector — part of the page shell, reached through the Tools menu
  //    on a position view and straight from the dock on a Market-type page.
  //    The shell takes a moment to paint, so try until it does.
  let mounted = false;
  const mountDeadline = Date.now() + 60000;
  while (Date.now() < mountDeadline) {
    mounted = await openInspectorHome(page);
    if (mounted) break;
    await sleep(500);
  }
  check(`${p.name}: provenance inspector mounts`, mounted);
  if (!mounted) return;

  // 2. Arm and wait for the coverage map. The tool is STICKY — armInspector
  //    reads the halo first, so a second call never puts it back down.
  await armInspector(page);
  await sleep(250);
  const deadline = Date.now() + 90000;
  let pickable = 0;
  while (Date.now() < deadline) {
    pickable = await page.locator("[data-prov-pickable]").count();
    if (pickable > 0) break;
    // The chain-read surfaces hydrate for many seconds after the toggle
    // paints, and a pre-hydration click lands before React attaches the
    // handler — it vanishes silently (measured live: the three slowest
    // pages stayed at 0 pickable for the full 90s while 400+ scoped values
    // sat on the page). Re-assert the armed state every round — armInspector
    // reads the halo first, and the tool is sticky, so a blind click disarms.
    await armInspector(page).catch(() => {});
    await sleep(2000);
  }
  check(
    `${p.name}: arming stamps pickable values (figures are registered receipts)`,
    pickable > 0,
    `${pickable} pickable`,
  );

  // 3. Pick until a receipt anchors on a block — on the coordinates row if
  //    any of the tries does, else on the prose.
  let anchored = null;
  if (pickable > 0) {
    for (let i = 0; i < Math.min(PICK_TRIES, pickable); i++) {
      await dismissPopover(page);
      const target = page.locator("[data-prov-pickable]").nth(i);
      await target.scrollIntoViewIfNeeded().catch(() => {});
      await target.click({ timeout: 5000 }).catch(() => {});
      await sleep(400);
      // Both block lanes: the structured strip first, else the receipt's
      // own prose ("… at block N" from the vocabulary's summary).
      const got = await page.evaluate(() => {
        const strip = document.querySelector(".prov-inspect-pop .prov-src-block");
        if (strip?.textContent) return { lane: "row", text: strip.textContent };
        // innerText, not textContent: textContent glues adjacent nodes and
        // bled a neighbouring digit onto the block number (measured:
        // "block 257588874" quoted for block 25758887 on /moonwell/markets).
        const body = document.querySelector(".prov-inspect-pop")?.innerText ?? "";
        const m = body.match(/\bblock\s+\d[\d,]{3,}/i)?.[0];
        return m ? { lane: "prose", text: m } : null;
      });
      if (got && /\bblock\s+\d[\d,]{3,}/i.test(got.text)) {
        if (!anchored) anchored = { i, lane: got.lane, blockText: got.text.trim() };
        if (got.lane === "row") {
          anchored = { i, lane: "row", blockText: got.text.trim() };
          break;
        }
      }
    }
  }
  check(
    `${p.name}: a picked receipt exposes a citable block`,
    pickable > 0 && anchored != null,
    anchored
      ? `pick ${anchored.i}, ${anchored.lane}: ${anchored.blockText}`
      : `none of the first ${Math.min(PICK_TRIES, pickable)} pickables anchored`,
  );
  if (p.strip) {
    check(
      `${p.name}: the block is a copyable coordinate, not only prose`,
      anchored?.lane === "row",
      anchored ? `anchored on the ${anchored.lane}` : "no block at all",
    );
  }
}

check("zero pageerrors across all surfaces", pageErrors.length === 0, pageErrors.join(" | "));

await browser.close();
console.log(failures === 0 ? "\nALL CHECKS GREEN" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
