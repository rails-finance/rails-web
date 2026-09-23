#!/usr/bin/env node
// The borrow-capacity readout past its own ceiling — a stated multiple, not
// a fourteen-digit percentage.
// ----------------------------------------------------------------------------
// The risk strip on the Compound-family position cards (Moonwell, Compound
// V2, Comet, Morpho) states where the debt stands against the liquidation
// line: "Borrow capacity: 61.2% of the liquidation line". When the collateral
// left is dust against the debt — the 2026-08-27 MAMO exploiter holds $9.3M of
// debt against a capacity line worth under a cent — that share printed as
// "19070621780048.1% of the liquidation line" (and the Explanation sentence
// "The debt stands at 19070621780048.1% of the liquidation line"). Since
// 2026-09-03 `capacityShare` (lib/shared/capacity-share.ts) stops the
// percentage at 1,000× and states the floor instead: "over 1,000× the
// liquidation line". The receipt behind the figure is the same division.
//
// Fixture: the exploiter wallet (the ratio is ~1.9e11 today and only grows
// as interest accrues on a debt nothing backs); the control is the second
// wallet by debt on the Base roster, well inside the ceiling. Check 0 reads
// both from the position route first, so a fixture that stopped straddling
// the ceiling is reported, not silently passed.
//
// Checks:
//   0. Precondition — EXPLOITER's debt ÷ capacity is above the ceiling;
//      CONTROL's sits between 0 and the ceiling.
//   1. EXPLOITER page — the strip reads "Borrow capacity: over 1,000× the
//      liquidation line".
//   2. EXPLOITER page — no seven-digit-plus percentage anywhere in the
//      document (the Explanation stays mounted while hidden, so this
//      covers its sentence too).
//   3. CONTROL page — the strip still reads "N.N% of the liquidation line".
//
// Proved it can fail 2026-09-03: against the deployed site before the fix
// (BASE=https://rails-web-onboarding.vercel.app), checks 1 and 2 FAIL while
// 0 and 3 PASS. Against a dev server on the fix: ALL PASS.
//
// Run:
//   BASE=http://localhost:3000 node scripts/verify/verify-capacity-share-floor.mjs

import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const NAV = { waitUntil: "domcontentloaded", timeout: 300000 };
const STRIP_TIMEOUT_MS = 240000;
const CEILING = 1000;

const EXPLOITER = "0x719eae70d4a83f35bf82a2740699f5db84be919d";
const CONTROL = "0x70c1997ca695cc2c3a08ac1ba0f19d5a7e30c7fc";
const FLOOR_TEXT = "Borrow capacity: over 1,000× the liquidation line";
const SHARE_RE = /Borrow capacity: \d+\.\d% of the liquidation line/;
const GIANT_PCT_RE = /\d{7,}\.\d%/;

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
  return cond;
};

async function waitForBase() {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/`, { redirect: "manual" });
      if (res.status > 0) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`${BASE} did not answer within 120s`);
}

async function ratioOf(wallet) {
  const res = await fetch(`${BASE}/api/chain/moonwell-base/position?wallet=${wallet}`);
  if (!res.ok) throw new Error(`position route ${res.status} for ${wallet}`);
  const d = await res.json();
  return { ratio: d.debtValueUsd / d.collateralCapacityUsd, debt: d.debtValueUsd, cap: d.collateralCapacityUsd };
}

await waitForBase();

// ── 0. Precondition: the fixtures straddle the ceiling ────────────────────
const ex = await ratioOf(EXPLOITER);
const ct = await ratioOf(CONTROL);
check("0a EXPLOITER is past the ceiling", ex.ratio > CEILING, `debt ${ex.debt} ÷ capacity ${ex.cap} = ${ex.ratio}`);
check("0b CONTROL is inside the ceiling", ct.ratio > 0 && ct.ratio < CEILING, `ratio ${ct.ratio}`);

const browser = await chromium.launch();

async function stripText(wallet) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/base/moonwell/${wallet}`, NAV);
  let strip = "";
  try {
    const el = page.getByText("Borrow capacity:", { exact: false }).first();
    await el.waitFor({ timeout: STRIP_TIMEOUT_MS });
    strip = (await el.textContent()) ?? "";
  } catch {
    strip = "";
  }
  const body = await page.evaluate(() => document.body.textContent ?? "");
  await ctx.close();
  return { strip: strip.replace(/\s+/g, " ").trim(), body };
}

// ── 1/2. The exploiter page ───────────────────────────────────────────────
{
  const { strip, body } = await stripText(EXPLOITER);
  check("1  EXPLOITER strip states the floor", strip.includes(FLOOR_TEXT), strip || "(strip not found)");
  const giant = GIANT_PCT_RE.exec(body)?.[0];
  check("2  EXPLOITER page carries no seven-digit percentage", giant == null, giant ?? "");
}

// ── 3. The control page ───────────────────────────────────────────────────
{
  const { strip } = await stripText(CONTROL);
  check("3  CONTROL strip still states a share", SHARE_RE.test(strip), strip || "(strip not found)");
}

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
