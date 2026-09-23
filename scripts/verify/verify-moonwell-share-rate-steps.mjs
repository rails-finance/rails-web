#!/usr/bin/env node
// Moonwell Base share-rate steps — the series endpoint and the rule behind it.
// ----------------------------------------------------------------------------
// A Compound v2 market's exchange rate is indexed nowhere, but every Mint and
// Redeem carries both legs of the same trade, so `amount / tokens` IS
// exchangeRateStored at that block. rails-server-onboarding serves the series
// and the moves accrual cannot pay for at
//   GET /api/moonwell-base/markets/:mtoken/share-rate   (api/src/routes/baseMoonwell.ts)
// and this checks the deployed endpoint against figures pinned from the Base
// box itself, then puts the RULE through the two cases that decide whether it
// is doing any work at all.
//
// ⚠️ THE STEP'S OPENING BLOCK IS NOT 50,516,316. Both plans pin the MAMO step
// as 50,516,316 → 50,516,566, because their sample table was read off ONE
// wallet's timeline (0x719e…919d, the account that minted). A market's series
// is every wallet's Mint and Redeem, and four other wallets redeemed between
// that mint and the step:
//   50,516,376 · 50,516,383 · 50,516,480 · 50,516,524   all still 0.0205132…
// so the tightest bracket the ledger can state is 50,516,524 (09:19:55) →
// 50,516,566 (09:21:19), and that is what the endpoint returns. The narrower
// bracket is also the one that CORROBORATES: the two plain ERC-20 transfers the
// Anthias post-mortem names as the cause landed at 09:19:59 and 09:21:09 UTC,
// both strictly inside it and neither inside any narrower pair of samples.
// Check 5 asserts exactly that, so the correction cannot rot back.
//
// Every pinned figure below was measured on the Sieve box (sieve_base,
// 2026-09-04) with sieve-base/sql/moonwell-base-share-rate.sql, and check 0
// re-establishes the market's identity and the era from OTHER routes
// (/positions' marketState roster, /timeline) so no expectation is taken from
// the endpoint under test. The rule's own constants are pinned here too
// (check 6) and the local detector replica uses the pinned ones, never the
// served ones.
//
// Checks:
//   0. preconditions from other routes — the MAMO market's identity/decimals in
//      the /positions roster, and the account's own mint at 50,516,316 in the
//      timeline route.
//   1. MAMO answers exactly one step over its whole life.
//   2. its ratio is 3.678 ± 0.001.
//   3. its blocks are 50,516,524 → 50,516,566.
//   4. its two observations: 0x54fc…6d69 redeem → 0x8407…17c3 redeem, and no
//      sample lies between them.
//   5. the bracket contains both transfer timestamps the post-mortem names, and
//      no narrower pair of samples does.
//   6. the served rule is the shipped rule (tolerance 10, ceiling 5%/day,
//      epsilon 1e-5).
//   7. USDC, WETH and cbBTC answer zero steps.
//   8. an address that is not a market answers 200 with an empty series — never
//      a 404.
//   9. prove-it-can-fail A — the detector replicated here reproduces the served
//      step from the served samples.
//  10. prove-it-can-fail B — with the 09:21:19 sample removed the step is STILL
//      found, against the next one (50,516,628).
//  11. prove-it-can-fail C — the bound is load-bearing: multiplied far enough
//      the step disappears. ⚠️ the strip plan says "10×" makes it miss; it does
//      not, and the margin is the point — the move is ~7,238× its own bound, so
//      the check asserts BOTH that ×10 still finds it and that ×(margin+1)
//      loses it, and prints the measured margin.
//  12. prove-it-can-fail D — the comparison discriminates: a synthetic pair
//      0.1% under the bound is not a step, one 0.1% over it is.
//
// Proved it can fail 2026-09-04, against the onboarding box, by pointing the step arm at a
// market that has no step: MARKET=0xedc817a28e8b93b03976fbd4a3ddbc9f7d176c22
// → 9 of 18 red (1, 2, 3, 4a, 4b, 5, 9, 10, 11), the rest green. The run is
// recorded verbatim at the foot of this file.
//
// Run: node scripts/verify/verify-moonwell-share-rate-steps.mjs
//      MARKET=0x… node scripts/verify/verify-moonwell-share-rate-steps.mjs

import { readFileSync } from "node:fs";

// ── the backend, from the repo root's .env.local ─────────────────────────────
// Anchored to THIS FILE, not the cwd: a script in scripts/verify/ that reads
// "./.env.local" reads scripts/verify/.env.local from anywhere else.
const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
const pick = (k) =>
  env
    .match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]
    ?.trim()
    .replace(/^"|"$/g, "");
const RAILS = pick("RAILS_API_URL");
const TOKEN = pick("API_BEARER_TOKEN");
const H = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};

// ── pinned fixtures (the Sieve box, sieve_base, 2026-09-04) ─────────────────
const MAMO = process.env.MARKET ?? "0x2f90bb22eb3979f5ffad31ea6c3f0792ca66da32";
const ZERO_STEP_MARKETS = [
  ["USDC", "0xedc817a28e8b93b03976fbd4a3ddbc9f7d176c22"],
  ["WETH", "0x628ff693426583d9a7fb391e54366292f509d457"],
  ["cbBTC", "0xf877acafa28c19b96727966690b2f44d35ad5976"],
];
const NOT_A_MARKET = "0x0000000000000000000000000000000000000001";
const ACCOUNT = "0x719eae70d4a83f35bf82a2740699f5db84be919d";
const ACCOUNT_MINT_BLOCK = 50516316;
const STEP_FROM_BLOCK = 50516524;
const STEP_TO_BLOCK = 50516566;
const STEP_RATIO = 3.678;
const STEP_RATIO_EPS = 0.001;
const STEP_FROM = { wallet: "0x54fc16fe6c49cb06417e56bbadf235650dd76d69", kind: "redeem" };
const STEP_TO = { wallet: "0x8407699e359ae158bd7ec0668600cc19a79f17c3", kind: "redeem" };
const NEXT_SAMPLE_BLOCK = 50516628;
// The two ERC-20 transfers the Anthias post-mortem names, 27 Aug 2026 UTC:
// 09:19:59 and 09:21:09. Unix seconds, not read from any Rails surface.
const TRANSFER_TS = [Date.UTC(2026, 7, 27, 9, 19, 59) / 1000, Date.UTC(2026, 7, 27, 9, 21, 9) / 1000];
// The rule as shipped (rails-server-onboarding api/src/routes/baseMoonwell.ts).
const TOLERANCE = 10;
const CEILING_PER_DAY = 0.05;
const EPSILON = 1e-5;

let failures = 0;
let checked = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  checked++;
  if (!cond) failures++;
};

// A transport failure must not read as a data failure: an upstream 429 or a
// rebuilt container answers JSON that fails every shape assertion downstream
// and describes a bug that is not there. It throws here instead.
const api = async (path) => {
  const res = await fetch(`${RAILS}${path}`, { headers: H });
  if (!res.ok) throw new Error(`upstream ${res.status} ${res.statusText} for ${path}`);
  return res.json();
};

// ── the rule, replicated (rails-server-onboarding shareRateBound /
//    detectShareRateSteps). A replica, deliberately: checks 9–12 have to be able
//    to run the rule with a bound this script chooses, which the endpoint will
//    never do for it. It uses the constants pinned above, and check 6 proves
//    those are the ones the server is serving under. ─────────────────────────
const bound = (seconds, supplyRatePerSecond, factor = 1) => {
  const elapsed = seconds > 0 ? seconds : 0;
  const accrual = supplyRatePerSecond > 0 ? supplyRatePerSecond * elapsed * TOLERANCE : 0;
  const ceiling = (CEILING_PER_DAY * elapsed) / 86_400;
  return (EPSILON + Math.max(accrual, ceiling)) * factor;
};
const detect = (samples, supplyRatePerSecond, factor = 1) => {
  const steps = [];
  for (let i = 1; i < samples.length; i++) {
    const from = samples[i - 1];
    const to = samples[i];
    if (!(from.rate > 0) || !(to.rate > 0)) continue;
    const ratio = to.rate / from.rate;
    if (Math.abs(ratio - 1) <= bound(to.ts - from.ts, supplyRatePerSecond, factor)) continue;
    steps.push({ fromBlock: from.block, toBlock: to.block, ratio });
  }
  return steps;
};

async function main() {
  console.log(`── Moonwell Base share-rate steps · market ${MAMO}\n`);

  // ── 0. preconditions, from routes that are not the one under test ─────────
  const roster = await api("/api/moonwell-base/positions?limit=1");
  const listed = (roster.marketState ?? []).find((m) => m.market.toLowerCase() === MAMO);
  check(
    "0a. the market is in the /positions roster, with its underlying's decimals",
    !!listed && Number.isInteger(Number(listed.decimals)) && Number(listed.decimals) > 0,
    listed ? `${listed.symbol} / ${listed.mSymbol}, ${listed.decimals} dp` : "not in the roster",
  );
  const timeline = await api(`/api/moonwell-base/timeline?wallet=${ACCOUNT}`);
  const ownMint = (timeline.rows ?? []).find(
    (r) =>
      r.kind === "mint" &&
      Number(r.block_number) === ACCOUNT_MINT_BLOCK &&
      r.market === "0x2f90bb22eb3979f5ffad31ea6c3f0792ca66da32",
  );
  check(
    "0b. the account's own MAMO mint at 50,516,316 is in the timeline route",
    !!ownMint,
    ownMint ? `${ownMint.amount} MAMO raw → ${ownMint.mtokens} mMAMO raw` : "no such row",
  );

  // ── 1–6. the step the endpoint states ─────────────────────────────────────
  const full = await api(`/api/moonwell-base/markets/${MAMO}/share-rate`);
  const stepsOnly = await api(`/api/moonwell-base/markets/${MAMO}/share-rate?steps=1`);
  const steps = full.steps ?? [];
  const samples = full.samples ?? [];
  check(
    "1. exactly one step over the market's whole life",
    steps.length === 1,
    `${steps.length} step(s), ${samples.length} samples`,
  );
  check(
    "1b. ?steps=1 answers the same steps and omits samples",
    JSON.stringify(stepsOnly.steps) === JSON.stringify(steps) && stepsOnly.samples === undefined,
    `${(stepsOnly.steps ?? []).length} step(s), samples ${stepsOnly.samples === undefined ? "omitted" : "present"}`,
  );

  const step = steps[0];
  check(
    "2. ratio 3.678 ± 0.001",
    !!step && Math.abs(step.ratio - STEP_RATIO) <= STEP_RATIO_EPS,
    step ? String(step.ratio) : "no step",
  );
  check(
    "3. blocks 50,516,524 → 50,516,566",
    !!step && step.fromBlock === STEP_FROM_BLOCK && step.toBlock === STEP_TO_BLOCK,
    step ? `${step.fromBlock} → ${step.toBlock}` : "no step",
  );
  check(
    "4a. observations: 0x54fc…6d69 redeem → 0x8407…17c3 redeem",
    !!step &&
      step.from.wallet === STEP_FROM.wallet &&
      step.from.kind === STEP_FROM.kind &&
      step.to.wallet === STEP_TO.wallet &&
      step.to.kind === STEP_TO.kind,
    step ? `${step.from.wallet} ${step.from.kind} → ${step.to.wallet} ${step.to.kind}` : "no step",
  );
  const between = samples.filter((s) => s.block > STEP_FROM_BLOCK && s.block < STEP_TO_BLOCK);
  check("4b. no sample lies inside the bracket", !!step && between.length === 0, `${between.length} sample(s) between`);

  const inside = step ? TRANSFER_TS.filter((t) => t > step.fromTs && t < step.toTs) : [];
  check(
    "5. both post-mortem transfers land inside the bracket",
    inside.length === 2,
    step ? `bracket ${step.fromTs}–${step.toTs}, transfers ${TRANSFER_TS.join(", ")}` : "no step",
  );
  check(
    "6. the served rule is the shipped rule",
    full.rule?.tolerance === TOLERANCE &&
      full.rule?.ceilingPerDay === CEILING_PER_DAY &&
      full.rule?.epsilon === EPSILON,
    JSON.stringify(full.rule),
  );

  // ── 7. the markets with nothing to state ──────────────────────────────────
  for (const [symbol, addr] of ZERO_STEP_MARKETS) {
    const r = await api(`/api/moonwell-base/markets/${addr}/share-rate?steps=1`);
    check(`7. ${symbol} answers zero steps`, (r.steps ?? []).length === 0, `${(r.steps ?? []).length} step(s)`);
  }

  // ── 8. an address that is not a market ────────────────────────────────────
  const res = await fetch(`${RAILS}/api/moonwell-base/markets/${NOT_A_MARKET}/share-rate?steps=1`, { headers: H });
  const notMarket = res.ok ? await res.json() : null;
  check(
    "8. an address that is not a market answers 200 with an empty series",
    res.status === 200 && notMarket?.decimals === null && (notMarket?.steps ?? null)?.length === 0,
    `${res.status}, decimals ${JSON.stringify(notMarket?.decimals)}, ${(notMarket?.steps ?? []).length} step(s)`,
  );

  // ── 9–12. the rule, run here ──────────────────────────────────────────────
  // The supply rate the server drew the bound with, scaled out of 1e18. It is a
  // PARAMETER of the rule, not an expectation: check 6 already pinned the three
  // constants that decide the bound's shape.
  const supplyRatePerSecond = Number(full.rule?.supplyRatePerTimestamp ?? 0) / 1e18;
  const replayed = detect(samples, supplyRatePerSecond);
  check(
    "9. the rule replicated here reproduces the served step from the served samples",
    replayed.length === 1 && replayed[0].fromBlock === STEP_FROM_BLOCK && replayed[0].toBlock === STEP_TO_BLOCK,
    replayed.map((s) => `${s.fromBlock}→${s.toBlock}`).join(", ") || "none",
  );

  const without = samples.filter((s) => s.block !== STEP_TO_BLOCK);
  const afterCut = detect(without, supplyRatePerSecond);
  check(
    "10. with the 09:21:19 sample removed the step is still found, against the next one",
    afterCut.length === 1 && afterCut[0].fromBlock === STEP_FROM_BLOCK && afterCut[0].toBlock === NEXT_SAMPLE_BLOCK,
    afterCut.map((s) => `${s.fromBlock}→${s.toBlock}`).join(", ") || "none",
  );

  const margin = step ? Math.abs(step.ratio - 1) / bound(step.toTs - step.fromTs, supplyRatePerSecond) : 0;
  const loose = detect(samples, supplyRatePerSecond, Math.ceil(margin) + 1);
  const tenfold = detect(samples, supplyRatePerSecond, 10);
  check(
    "11. the bound is load-bearing — ×10 still finds the step, ×(margin+1) loses it",
    tenfold.length === 1 && loose.length === 0,
    `move is ${margin.toFixed(0)}× its own bound; ×10 → ${tenfold.length} step(s), ×${Math.ceil(margin) + 1} → ${loose.length}`,
  );

  // A synthetic pair either side of the bound, so the comparison is tested
  // rather than inferred from the one real step. Not the bound EXACTLY: at
  // r2 = 1 + b, `r2 / 1 - 1` is b plus a float64 rounding of ~1e-17, which the
  // strict `<=` then reads as over — an artefact of the arithmetic, not of the
  // rule, and a check that asserted it would be asserting the artefact.
  const b60 = bound(60, supplyRatePerSecond);
  const pair = (r2) => [
    { block: 1, ts: 0, rate: 1 },
    { block: 2, ts: 60, rate: r2 },
  ];
  check(
    "12. the comparison discriminates either side of the bound",
    detect(pair(1 + b60 * 0.999), supplyRatePerSecond).length === 0 &&
      detect(pair(1 + b60 * 1.001), supplyRatePerSecond).length === 1,
    `bound over 60 s = ${b60.toExponential(3)}`,
  );

  console.log(failures ? `\n${failures} CHECK(S) FAILED of ${checked}` : `\nALL CHECKS PASS (${checked})`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(`\nCRASH — reached no verdict: ${err.message}`);
  process.exit(1);
});

// ── Recorded runs ────────────────────────────────────────────────────────────
//
// Proved it can fail 2026-09-04 (the onboarding box), pointing the step arm at USDC — a
// market with no step, so every MAMO-specific assertion has to go red while the
// rule's own arms stay green:
//   MARKET=0xedc817a28e8b93b03976fbd4a3ddbc9f7d176c22 node scripts/verify/verify-moonwell-share-rate-steps.mjs
//
//   ── Moonwell Base share-rate steps · market 0xedc817a28e8b93b03976fbd4a3ddbc9f7d176c22
//
//   PASS  0a. the market is in the /positions roster, with its underlying's decimals — USDC / mUSDC, 6 dp
//   PASS  0b. the account's own MAMO mint at 50,516,316 is in the timeline route — 7100000000000000000000000 MAMO raw → 34611765066876537 mMAMO raw
//   FAIL  1. exactly one step over the market's whole life — 0 step(s), 5000 samples
//   PASS  1b. ?steps=1 answers the same steps and omits samples — 0 step(s), samples omitted
//   FAIL  2. ratio 3.678 ± 0.001 — no step
//   FAIL  3. blocks 50,516,524 → 50,516,566 — no step
//   FAIL  4a. observations: 0x54fc…6d69 redeem → 0x8407…17c3 redeem — no step
//   FAIL  4b. no sample lies inside the bracket — 0 sample(s) between
//   FAIL  5. both post-mortem transfers land inside the bracket — no step
//   PASS  6. the served rule is the shipped rule — {"tolerance":10,"ceilingPerDay":0.05,"epsilon":0.00001,"minRawUnits":1000000,"supplyRatePerTimestamp":"28453613190","supplyRateBlock":50865096}
//   PASS  7. USDC answers zero steps — 0 step(s)
//   PASS  7. WETH answers zero steps — 0 step(s)
//   PASS  7. cbBTC answers zero steps — 0 step(s)
//   PASS  8. an address that is not a market answers 200 with an empty series — 200, decimals null, 0 step(s)
//   FAIL  9. the rule replicated here reproduces the served step from the served samples — none
//   FAIL  10. with the 09:21:19 sample removed the step is still found, against the next one — none
//   FAIL  11. the bound is load-bearing — ×10 still finds the step, ×(margin+1) loses it — move is 0× its own bound; ×10 → 0 step(s), ×1 → 0
//   PASS  12. the comparison discriminates either side of the bound — bound over 60 s = 4.472e-5
//
//   9 CHECK(S) FAILED of 18
//
// Green 2026-09-04 (the onboarding box), default market:
//   PASS  0a. … MAMO / mMAMO, 18 dp
//   PASS  1. exactly one step over the market's whole life — 1 step(s), 2190 samples
//   PASS  2. ratio 3.678 ± 0.001 — 3.678614465775387
//   PASS  3. blocks 50,516,524 → 50,516,566
//   PASS  5. both post-mortem transfers land inside the bracket — bracket 1787822395–1787822479, transfers 1787822399, 1787822469
//   PASS  11. the bound is load-bearing — move is 7238× its own bound; ×10 → 1 step(s), ×7239 → 0
//   ALL CHECKS PASS (18)
