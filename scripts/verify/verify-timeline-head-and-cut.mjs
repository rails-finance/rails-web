// verify-timeline-head-and-cut — rails-ops ui-jobs 170, 231 and 232.
//
//   231  The timeline heading states one thing, the start date in the short
//        year ("Active since 31 Jan '25"), and a click flips it to the tenure
//        ("Active for 608 days"), remembered per viewer. No freshness: the
//        position card's header carries it. On Base Aave V3 the card's count
//        and the timeline's agree on what they count: a liquidation's own
//        transaction is not one of the owner's, and the count's tip names the
//        rows beyond the transactions.
//   232  A "Show timeline to" cut that empties the loaded list says what it
//        hides and how to reach it, never that the wallet has no activity; and
//        the wallet row names what the address is, from its code.
//   170  LlamaLend's controller read says whether `approval(address,address)`
//        answers, which decides the liquidation modal's approved-address words.
//
// Usage:
//   BASE=http://localhost:3000 node scripts/verify/verify-timeline-head-and-cut.mjs
// Against dev.rails.finance the bypass header rides the context (lib/host.mjs).

import { chromium } from "playwright";
import { BASE, bypassHeaders, hostFetch } from "./lib/host.mjs";

const LIQUIDATED = "/base/aave-v3/0x73b1d62f8e1767990885a850d49548077f5bb501";
const CONTRACT = "/base/aave-v3/0xe5ec006540be4f7cbb2cbc7be79708a6d96f90dc";
const SUPER_ETH = "/base/aave-v3/0x46fd5cfb4c12d87acd3a13e92baa53240c661d93";

const fails = [];
function check(name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) fails.push(name);
}

// ── 170: the approval probe ────────────────────────────────────────────────
const USER = "0x538c8ec378fa4a27331c281ed7803a46fd17f566";
for (const [controller, want, what] of [
  ["0xa920de414ea4ab66b97da1bfe9e6eca7d4219635", false, "WETH mint market (no approvals)"],
  ["0x652aea6b22310c89dcc506710cad24d2dba56b11", true, "a mint market whose approval() answers"],
]) {
  const r = await hostFetch(`${BASE}/api/chain/llamalend/position?controller=${controller}&user=${USER}`);
  const j = r.ok ? await r.json() : null;
  check(`170: ${what}`, j?.controllerHasApprovals === want, `controllerHasApprovals=${j?.controllerHasApprovals}`);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: bypassHeaders() });
const page = await ctx.newPage();

// ── 231: the heading ───────────────────────────────────────────────────────
await page.goto(BASE + LIQUIDATED, { waitUntil: "domcontentloaded", timeout: 180000 });
const head = page.locator("[data-timeline-activity-head]").first();
await head.waitFor({ state: "visible", timeout: 120000 });
const toggle = head.locator("button[data-head-form]");
const dateText = ((await toggle.textContent()) ?? "").trim();
check(
  "231: heading states the start date, short year",
  /^(Active since|Opened) \d{1,2} [A-Z][a-z]{2} '\d\d$/.test(dateText),
  dateText,
);
const headText = ((await head.textContent()) ?? "").trim();
check("231: no freshness in the heading", !/updated|ago|last activity/.test(headText), headText);
await toggle.click();
await page.waitForTimeout(300);
const tenureText = ((await toggle.textContent()) ?? "").trim();
check(
  "231: a click states the tenure",
  /^(Active|Open) for \d[\d,]* (days?|hrs?|minutes?)$/.test(tenureText),
  tenureText,
);
await page.reload({ waitUntil: "domcontentloaded" });
await head.waitFor({ state: "visible", timeout: 120000 });
await page.waitForTimeout(500);
const kept = await toggle.getAttribute("data-head-form");
check("231: the choice survives a reload", kept === "tenure", String(kept));
await toggle.click();

// ── 231: the counts ────────────────────────────────────────────────────────
// The count's accessible name is its tip's text (RevealTip `label`, sr-only).
const countTip = page.locator('[data-anatomy="C8"] .sr-only', { hasText: " events: " }).first();
await countTip.waitFor({ state: "attached", timeout: 120000 }).catch(() => {});
const tip = ((await countTip.textContent().catch(() => "")) ?? "").trim();
check(
  "231: the card counts the owner's transactions and names the rest",
  /^41 transactions · 44 events: 1 liquidation by a liquidator, 2 aToken transfers in that liquidation's transaction/.test(
    tip,
  ),
  tip,
);

// ── 232: the wallet row ────────────────────────────────────────────────────
const kindOf = async (path) => {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 180000 });
  const el = page.locator("[data-position-wallet-row] [data-address-kind]").first();
  await el.waitFor({ state: "attached", timeout: 60000 }).catch(() => {});
  return {
    kind: await el.getAttribute("data-address-kind").catch(() => null),
    text: ((await el.textContent().catch(() => "")) ?? "").trim(),
  };
};
const ethx = await kindOf(SUPER_ETH);
check(
  "232: Super ETH reads as a contract with its own name",
  ethx.kind === "contract" && ethx.text === "Contract: Super ETH (ETHx)",
  JSON.stringify(ethx),
);
const owner = await kindOf(LIQUIDATED);
check("232: a wallet row names its kind", owner.kind != null, JSON.stringify(owner));

// ── 232: a cut that empties the loaded list ────────────────────────────────
await page.goto(`${BASE}${CONTRACT}?to=2026-09-06`, { waitUntil: "domcontentloaded", timeout: 180000 });
await page.locator("[data-flow-rewind-chip]").first().waitFor({ state: "visible", timeout: 180000 });
// Either the read up to the cut brought its rows, or the list says what it hides.
await page.waitForFunction(
  () =>
    document.querySelector("[data-timeline-empty]") != null ||
    (Number(document.querySelector("[data-timeline-rows-drawn]")?.getAttribute("data-timeline-rows-drawn")) || 0) > 0,
  null,
  { timeout: 180000 },
);
await page.waitForTimeout(3000);
const empty = (
  (await page
    .locator("[data-timeline-empty]")
    .first()
    .textContent()
    .catch(() => "")) ?? ""
).trim();
const drawn = Number(
  (await page.locator("[data-timeline-rows-drawn]").first().getAttribute("data-timeline-rows-drawn")) ?? 0,
);
check(
  "232: the cut list never says the wallet has no activity",
  !/has no .* activity/.test(empty),
  empty || `${drawn} rows`,
);
check(
  "232: the cut holds rows, or says what it hides",
  drawn > 0 || /on or before 6 Sep '26/.test(empty),
  empty || `${drawn} rows`,
);

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILURE(S)` : "\nALL PASS");
process.exit(fails.length ? 1 : 0);
