// The Polaris PSM share — settled on the row face, pending on the header strip.
// ---------------------------------------------------------------------------
// Polaris has no per-CDP redemption event: the PSM's mints and redemptions
// move every CDP's share pro rata, and the effect settles on the CDP's own
// next CDPUpdated as `_mintRedeemCollGain` / `_mintRedeemDebtGain`.
// This script proves:
//
//   1. the three pinned fixture touches on usdp CDP 8 show the right two PSM
//      labels + magnitudes on the row HEADER (not the expanded detail), and
//      the holder's own verb still renders;
//   2. the four zero-share rows on the same CDP show none of the four labels;
//   3. the page-wide PSM-label count equals the timeline route's own
//      independent count of non-zero legs;
//   4. the economics tower says "PSM redemption share" / "PSM mint share",
//      never "PSM redemptions";
//   5. the pending-share strip states the live overlay's own pending PSM
//      share (fetched independently, compared with tolerance — it's live);
//   6. a control CDP (usdp/296) — face count agrees with the route's count,
//      whatever it is;
//   7. the two sibling verifiers (rate-step, market-note-placement) still
//      pass.
//
// Every expected value in 1/2/3/6 is re-derived from `/api/polaris/timeline`,
// fetched independently of the page, never read back off it. The fixture
// figures themselves (block/tx/leg pairs, the 45/25/16/4 touch counts) were
// pinned by psql over the RAW tables on the onboarding box, 2026-09-06 — never
// re-derived from this code either.
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run:  BASE=http://localhost:3412 node scripts/verify/verify-polaris-psm-share.mjs

import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE ?? "http://localhost:3000";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let failures = 0;
let checked = 0;
const check = (name, cond, detail = "") => {
  checked++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

async function api(path_, tries = 4) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    const res = await fetch(`${BASE}${path_}`).catch((e) => {
      last = e;
      return null;
    });
    if (res?.ok) return res.json();
    if (res) last = new Error(`${res.status} ${path_}`);
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw last ?? new Error(`failed ${path_}`);
}

// ── Formatting, restated from the house helpers rather than imported
// (lib/shared/header-values.ts fmtHeaderMagnitude → components/shared/
// activity-timeline.tsx fmtSpine) — an expected value computed by IMPORTING
// the code under test could never catch that code being wrong. ────────────
function fmtSpineLike(n) {
  const a = Math.abs(n);
  if (!a || !isFinite(a)) return "";
  if (a < 0.01) return "<0.01";
  if (a >= 1_000_000) return `${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) {
    const k = a / 1_000;
    return a >= 10_000 ? `${Math.round(k)}K` : `${parseFloat(k.toFixed(1))}K`;
  }
  if (a >= 1) return a.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const s = parseFloat(a.toFixed(4)).toString();
  return s;
}

const relClose = (got, want, tol = 0.005) => {
  if (Math.abs(want) < 1e-9) return Math.abs(got) < 1e-6;
  return Math.abs(got - want) / Math.abs(want) <= tol;
};

const polarisUrl = (market, id) => `${BASE}/sepolia/polaris/${market}/${id}`;

async function open(context, url) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
  // A client-side toggle/click before hydration is lost, not replayed — wait
  // for the position card to be live before touching anything.
  await page
    .getByText(/^(?:Showing )?[\d,]+(?: of [\d,]+)? (?:events?|listed)/)
    .first()
    .waitFor({ state: "visible", timeout: 120000 })
    .catch(() => {});
  await page.waitForTimeout(1200);
  return page;
}

const PSM_LABEL_RE = /^PSM (added|redeemed|minted|cleared)$/;

async function rowText(page, eventKey) {
  const row = page.locator(`[data-event-id="${cssEscape(eventKey)}"]`);
  if ((await row.count()) === 0) return null;
  return ((await row.first().textContent()) ?? "").replace(/\s+/g, " ").trim();
}

// Minimal CSS.escape for the characters an event_key/tx hash can carry
// (":" from `cdp_updated:<tx>:<log>"). No untrusted input reaches this.
function cssEscape(s) {
  return s.replace(/[:]/g, "\\:");
}

console.log("Polaris PSM share — settled on the row face, pending on the header strip\n");
console.log(`BASE ${BASE}\n`);

// ── 0. the route, fetched independently ─────────────────────────────────────

const j8 = await api("/api/polaris/timeline?market=usdp&id=8");
check("0. usdp/8's own route yields 45 events", j8.events.length === 45, `got ${j8.events.length}`);

const mrColl = (e) => Number(e.context?.data?.mintRedeemCollGain ?? 0);
const mrDebt = (e) => Number(e.context?.data?.mintRedeemDebtGain ?? 0);
const dColl = (e) => Number(e.context?.data?.collChange ?? 0);
const dDebt = (e) => Number(e.context?.data?.debtChange ?? 0);
const nonZeroLegCount = (events) =>
  events.reduce((acc, e) => acc + (mrColl(e) !== 0 ? 1 : 0) + (mrDebt(e) !== 0 ? 1 : 0), 0);

const eventsByBlock8 = new Map(j8.events.map((e) => [e.blockNumber, e]));
check(
  "0a. usdp/8's route yields the pinned 41 non-zero PSM touches (45 − 4 zero)",
  nonZeroLegCount(j8.events) === 82 && j8.events.filter((e) => mrColl(e) !== 0 || mrDebt(e) !== 0).length === 41,
  `${nonZeroLegCount(j8.events)} legs across ${j8.events.filter((e) => mrColl(e) !== 0 || mrDebt(e) !== 0).length} touches`,
);

// ── the browser ──────────────────────────────────────────────────────────

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });

const page8 = await open(context, polarisUrl("usdp", "8"));

// ── 1. the three pinned fixture touches — header labels + magnitudes ──────

const FIXTURES = [
  { block: 11603483, holderVerb: "Borrow" },
  { block: 11562362, holderVerb: "Borrow" },
  { block: 11610231, holderVerb: "Deposit" },
];

for (const f of FIXTURES) {
  const e = eventsByBlock8.get(f.block);
  check(`1. usdp/8 block ${f.block} is on the route`, e != null);
  if (e == null) continue;
  const collLabel = mrColl(e) > 0 ? "PSM added" : "PSM redeemed";
  const debtLabel = mrDebt(e) > 0 ? "PSM minted" : "PSM cleared";
  const collMag = fmtSpineLike(mrColl(e));
  const debtMag = fmtSpineLike(mrDebt(e));
  const text = await rowText(page8, e.id);
  check(`1. usdp/8 block ${f.block} row found on the page (event_key ${e.id})`, text != null);
  if (text == null) continue;
  check(
    `1. block ${f.block} header shows "${collLabel}" + ${collMag}`,
    text.includes(collLabel) && text.includes(collMag),
    text.slice(0, 200),
  );
  check(
    `1. block ${f.block} header shows "${debtLabel}" + ${debtMag}`,
    text.includes(debtLabel) && text.includes(debtMag),
    text.slice(0, 200),
  );
  check(
    `1. block ${f.block} header still shows the holder's own verb "${f.holderVerb}"`,
    text.includes(f.holderVerb),
    text.slice(0, 200),
  );
}

// ── 2. the four zero-share rows show none of the four labels ──────────────

const ZERO_BLOCKS = [11507592, 11514810, 11519755, 11519759];
for (const block of ZERO_BLOCKS) {
  const e = eventsByBlock8.get(block);
  check(`2. usdp/8 block ${block} is on the route`, e != null);
  if (e == null) continue;
  check(
    `2. usdp/8 block ${block} has zero PSM legs on the route (as pinned)`,
    mrColl(e) === 0 && mrDebt(e) === 0,
    `coll ${mrColl(e)}, debt ${mrDebt(e)}`,
  );
  const text = await rowText(page8, e.id);
  check(`2. usdp/8 block ${block} row found on the page`, text != null);
  const hasAnyLabel =
    text != null && ["PSM added", "PSM redeemed", "PSM minted", "PSM cleared"].some((l) => text.includes(l));
  check(`2. usdp/8 block ${block} header shows NO PSM label`, !hasAnyLabel, text?.slice(0, 200) ?? "");
}

// ── 3. page-wide PSM-label count vs the route's own independent count ─────

const wantLegs8 = nonZeroLegCount(j8.events);
const domLabelCount8 = await page8.getByText(PSM_LABEL_RE).count();
check(
  `3. usdp/8: ${wantLegs8} PSM labels on the page (41 touches × 2 legs, pinned) match the DOM count`,
  domLabelCount8 === wantLegs8,
  `DOM ${domLabelCount8}, route ${wantLegs8}`,
);

// ── 4. the tower's renamed flow labels; "PSM redemptions" nowhere on page ─

const bodyText8 = (await page8.locator("body").innerText()).replace(/\s+/g, " ");
check(
  '4. "PSM redemption share" appears on the page (the renamed collateral/debt flow label)',
  bodyText8.includes("PSM redemption share"),
);
check('4. "PSM mint share" appears on the page', bodyText8.includes("PSM mint share"));
check('4. the string "PSM redemptions" appears nowhere on the page', !bodyText8.includes("PSM redemptions"));

// ── 5. the pending-share strip — fetched independently, live tolerance ────

const chain8 = await api("/api/chain/polaris/position?market=usdp&id=8");
const pendingLocator = page8.getByText(/pending since the last touch/);
// The strip depends on the page's OWN client-side chain fetch (separate from
// ours above) — give it a beat to land before deciding it's absent.
await pendingLocator
  .first()
  .waitFor({ state: "visible", timeout: 15_000 })
  .catch(() => {});
const pendingCount = await pendingLocator.count();
const pendingText = pendingCount > 0 ? ((await pendingLocator.first().textContent()) ?? "").replace(/\s+/g, " ") : "";
const shareNonZero = chain8.mintRedeemCollChange !== 0 || chain8.mintRedeemDebtChange !== 0;

if (shareNonZero) {
  check("5. usdp/8's pending strip is present (interest or PSM share pending)", pendingCount > 0, pendingText);
  check(
    '5. the strip states "PSM share" when the live share is non-zero',
    pendingText.includes("PSM share"),
    pendingText,
  );
  const m = pendingText.match(/PSM share of ([+−][\d,.]+) pETH \/ ([+−][\d,.]+) (\S+)/);
  check("5. the strip's PSM-share sentence parses (signed pETH / signed stable)", m != null, pendingText);
  if (m) {
    const gotColl = Number(m[1].replace(/,/g, "").replace("−", "-"));
    const gotDebt = Number(m[2].replace(/,/g, "").replace("−", "-"));
    check(
      "5. the strip's pETH figure matches the live overlay within 0.5%",
      relClose(gotColl, chain8.mintRedeemCollChange),
      `strip ${gotColl}, overlay ${chain8.mintRedeemCollChange}`,
    );
    check(
      "5. the strip's stable figure matches the live overlay within 0.5%",
      relClose(gotDebt, chain8.mintRedeemDebtChange),
      `strip ${gotDebt}, overlay ${chain8.mintRedeemDebtChange}`,
    );
  }
} else {
  check(
    '5. the live PSM share is zero, so the strip (if any) states no "PSM share"',
    !pendingText.includes("PSM share"),
    pendingText || "(no strip)",
  );
}

await page8.close();

// ── 6. control — face count agrees with the route's count, unpinned ───────

const j296 = await api("/api/polaris/timeline?market=usdp&id=296");
const wantLegs296 = nonZeroLegCount(j296.events);
const page296 = await open(context, polarisUrl("usdp", "296"));
const domLabelCount296 = await page296.getByText(PSM_LABEL_RE).count();
check(
  `6. usdp/296: DOM PSM-label count agrees with the route's own non-zero-leg count (${wantLegs296}, unpinned)`,
  domLabelCount296 === wantLegs296,
  `DOM ${domLabelCount296}, route ${wantLegs296}`,
);
await page296.close();

await context.close();
await browser.close();

// ── 7. the sibling verifiers still pass ────────────────────────────────────

function runSibling(name, file, extraEnv = {}) {
  const scriptPath = path.join(__dirname, file);
  try {
    const out = execFileSync("node", [scriptPath], {
      env: { ...process.env, BASE, ...extraEnv },
      encoding: "utf8",
      timeout: 300_000,
    });
    check(`7. ${name} still passes`, /ALL \d+ CHECKS PASS/.test(out), out.trim().split("\n").slice(-1)[0]);
  } catch (err) {
    const out = String(err.stdout ?? err.message ?? err);
    check(`7. ${name} still passes`, false, out.trim().split("\n").slice(-3).join(" | "));
  }
}

runSibling("verify-polaris-rate-step.mjs (51/51)", "verify-polaris-rate-step.mjs");
runSibling("verify-market-note-placement.mjs", "verify-market-note-placement.mjs");

console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — the Polaris PSM share holds, on the face and on the strip`,
);
process.exit(failures ? 1 : 0);
