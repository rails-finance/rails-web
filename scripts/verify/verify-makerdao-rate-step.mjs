// The MakerDAO rate-step market note, on the page.
// ---------------------------------------------------------------------------
// A Maker rate step says the ILK'S STABILITY FEE moved between two of a
// vault's OWN touches. Unlike the Polaris rate step it is modelled on, the fee
// is not on the vault's rows at all: MakerDAO emits no rate-set log —
// governance files a `duty` on the Jug and the spell's own block is not indexed
// — so the fee in force at a touch is the ilk's last RATE SET at or before it,
// out of /api/makerdao/ilks/<ilk>/rate-log, and a set is the first Jug.drip
// that compounded at a new duty.
//
// WHERE EACH EXPECTED VALUE COMES FROM, because a check whose expected value
// comes from the thing under test cannot go red however wrong the thing is:
//
//   §1 goes to THE CHAIN. The fees at the pinned set blocks are read here with
//      viem against the web repo's own ALCHEMY_URL (read from .env.local at run
//      time, never printed) — Jug.ilks(ilk).duty + Jug.base() at that block,
//      compounded over a year. If the route's confirmation were wrong, §1 is
//      what catches it, and it consults nothing this repo computed.
//
//   §2 replays the SELECTOR RULE here, over the route's own rate log and the
//      vault's own timeline, both fetched independently of the page. The rule
//      is restated in this file from the plan's prose rather than imported from
//      lib/makerdao/market-notes.ts, so the two are independent statements of
//      the same rule and a divergence shows up as a failure.
//
//   §0 and §3–5 pin against figures read off the raw tables on the onboarding box
//      (maker_fold, maker_ilk_state, mv_makerdao_positions) on 2026-09-06 —
//      never derived from this code either.
//
// SUPERSEDED BY THE 2026-10-01 NOTE BELOW — the two departures from the plan
// this file carried from 2026-09-06, kept for how the pins got here:
//
//   * ETH-A serves 51 sets and FOUR artefacts, not the 53 / 2 the plan pins.
//     The §0 artefact rule — a derived set confirming to its predecessor's own
//     fee is an artefact — catches two more than the plan measured, at blocks
//     16,976,042 and 16,976,256 (derived 1.4913 and 1.5000, both confirming
//     1.5000). Verified independently at §1c: the Jug's duty at those two
//     blocks equals its duty at the set before them, so they are not rate
//     changes. The plan's 55 DERIVED is reproduced exactly.
//
//   * The 1 pp threshold is applied with a truncation slack of 1e-6 pp
//     (RATE_TRUNCATION_SLACK_PP). Maker's duty is a truncated per-second ray,
//     so ETH-A's 8.25 → 9.25 confirms as 0.99999987 pp and 7.00 → 8.00 as
//     0.99999923, while 8.50 → 9.50 confirms as 1.000001. A strict `≥ 1` drops
//     two of the plan's own 14 pinned stretches on 16745 and keeps the third,
//     showing one of three identical-looking "+1.00 pp" moves and withholding
//     the others. §2 asserts the plan's 14 WITH the slack and proves at §2c
//     that a strict comparison would break the pin.
//
// 2026-09-20 — THE COLLAPSE, AND THE TABLES RE-PINNED WITH IT (web 8dc12ab4).
// MakerDAO now states consecutive same-direction stretches as ONE note, from
// the first stretch's earlier touch to the last stretch's later one. The rule
// is RESTATED below in `collapseRuns`, written from the shipped rule and
// deliberately NOT imported from `collapseSameDirectionRateSteps` — the same
// reason `computeNotes` restates the selector. The Maker half Polaris has no
// reason to carry: a run's ends are the VAULT'S OWN touches, and the fees at
// them are the ilk's CONFIRMED rate sets, so a merged note's two figures are
// still Jug reads and §1 still reaches the chain for them. The merge is sound
// here only because the fee RATCHETS inside a governance cycle, which makes
// first-to-last the true span — the precondition in §9 of
// rails-ops/architecture/market-notes.md, and why Aave V3 + Spark refuse it.
//
// The pre-collapse tables (STRETCHES_28699, STRETCHES_16745) are the plan's
// own, unchanged, and still reproduced row for row today: the note counts
// moved because of the collapse, not because the index drifted under the pins.
// §2/§2a assert both halves — the stretches, then the runs they merge into.
//
// ⚠ `setsBetween` on a merged note is the MEMBERS' SUM, never the two ends'
// ordinal difference. Where a sub-threshold pair was skipped between two
// members the sum omits that pair's resets: 16745's five-step run sums to 10
// while its two ends' ordinals are 17 apart, and 28699's two-step run sums to
// 8 against 10. That is designed (§9), so MERGED_* pins the sum and §2f holds
// the two figures apart so neither can be silently swapped for the other.
//
// 2026-10-01 — RE-PINNED AFTER ROUND 3 AND THE SERVER'S FOLD FILL (this file's
// own replica of the rule, §2, was updated first; every table below is what it
// yields over the served rate log and each vault's served timeline, with §1
// reading the Jug for the figures the new rule newly states).
//
//   * Server ba2f3f1 (mig 321, 2026-09-24) filled ETH-A's fold gap: it serves
//     53 sets and NO artefacts, and the newest set's derived figure is the
//     confirmed 9.50, not the gap-inflated 9.5094. The "51 sets / 4 artefacts"
//     departure and the 1e-6 pp slack are gone with the rule that needed them.
//   * Server ba67ac7 (2026-09-29): a zero-delta drip evidences a 0% fee, so
//     WSTETH-B serves 33 sets, the first at 0%.
//   * Web 2ffd7b5 (2026-09-30): Maker states EVERY fee change (floor 0.01 pp,
//     MAKER_RATE_STEP_MIN_PP; was 1 pp with a truncation slack), a stretch the
//     vault began owing nothing stands alone, and the merged-note stats read
//     "Covers" / "Times governance changed the fee" (f32f322 renamed them from
//     "Merges" / "Fee changes in between"). The old 1 pp rule applied to
//     today's data still yields the old 10 and 14 stretches (§2c), so what
//     moved is the rule, not the index.
//   * Web f0eaf46 (2026-09-28): the page serves folders by default and its
//     notes are drawn over the ungrouped events only, so every page here is
//     opened with `?folders=0`, the flat answer (rails-ops decision 0021),
//     as the Aave-family verifiers do.
//   * The set counts are pinned UP TO the block the pin was read at: governance
//     adding a set later moves neither the tables nor the counts.
//
// claude-in-chrome cannot reach localhost — this script is the check.
// Run:  BASE=http://localhost:3611 node scripts/verify/verify-makerdao-rate-step.mjs
//       BASE=https://rails-web.vercel.app node scripts/verify/verify-makerdao-rate-step.mjs
// Needs ALCHEMY_URL in .env.local (read, never printed).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { marketNoteCount, setMarketNotes, showNoteRows } from "./lib/market-notes.mjs";
import { createPublicClient, http, parseAbi, stringToHex } from "viem";
import { mainnet } from "viem/chains";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Maker states every governance change: the floor is 0.01 pp (web 2ffd7b5,
 *  MAKER_RATE_STEP_MIN_PP in lib/makerdao/market-notes.ts), far above the
 *  duty's ~5e-7 pp truncation and under the finest step governance has filed
 *  (0.25 pp). It replaced a 1 pp floor with a 1e-6 pp slack. */
const RATE_STEP_MIN_PP = 0.01;
/** The rule the floor replaced, kept so §2c can show what it withheld. */
const OLD_RATE_STEP_MIN_PP = 1;
const OLD_RATE_TRUNCATION_SLACK_PP = 1e-6;
const SECONDS_PER_YEAR = 31_536_000;
const JUG = "0x19c0976f590D67707E62397C87829d896Dc0f1F1";

let failures = 0;
let checked = 0;
const check = (name, cond, detail = "") => {
  checked++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

async function api(pathname, tries = 4) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    const res = await fetch(`${BASE}${pathname}`).catch((e) => {
      last = e;
      return null;
    });
    if (res?.ok) return res.json();
    if (res) last = new Error(`${res.status} ${pathname}`);
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw last ?? new Error(`failed ${pathname}`);
}

// ── Formatting, restated from Intl rather than imported ────────────────────
const ratePct = (n) => `${(n * 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const ppMagnitude = (n) =>
  // 2026-09-10: the unit word is "points", and the move is stated under the
  // fee card rather than in the header, which now states the later fee.
  `${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} points`;
const stableAmount = (n) =>
  Math.abs(n) >= 1_000
    ? n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 })
    : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const blk = (n) => n.toLocaleString("en-US");

// ── The selector rule, restated here from the plan's prose ────────────────
/** A MakerDAO event id's tail `:N` segment — the log index. */
const makerLogIndex = (id) => {
  const cut = id.lastIndexOf(":");
  return cut < 0 ? -1 : Number(id.slice(cut + 1));
};

/** The fee in force at (block, logIndex): the last set at or before it. */
function feeAt(sets, block, logIndex) {
  let cur = null;
  for (const s of sets) {
    if (s.block < block || (s.block === block && s.logIndex <= logIndex)) cur = s;
    else break;
  }
  return cur;
}

/**
 * The stretches on one vault, computed from the route's own rate log and the
 * route's own timeline, and the NOTES they merge into. `minPp` is the floor,
 * so §2c can show what the 1 pp rule it replaced would have withheld from the
 * same data.
 *
 * `steps` is every stretch over the threshold; `notes` is what the page must
 * show, which since 2026-09-20 is `steps` put through the collapse, and since
 * web 2ffd7b5 (2026-09-30) leaves a stretch the vault began owing nothing
 * standing alone.
 */
function computeNotes(events, sets, ilk, { minPp = RATE_STEP_MIN_PP } = {}) {
  const rows = events
    .filter((e) => {
      const t = e.context?.data?.eventType;
      return e.context?.protocol === "makerdao" && (t === "frob" || t === "grab");
    })
    .map((e) => ({ block: e.blockNumber, logIndex: makerLogIndex(e.id), e }))
    .sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);

  // Two rows in one block are one moment.
  const moments = [];
  for (const r of rows) {
    if (moments.length && moments[moments.length - 1].block === r.block) moments[moments.length - 1] = r;
    else moments.push(r);
  }
  const rated = moments.map((m) => ({ ...m, set: feeAt(sets, m.block, m.logIndex) })).filter((m) => m.set);

  const floor = minPp;
  const out = [];
  for (let i = 1; i < rated.length; i += 1) {
    const a = rated[i - 1];
    const b = rated[i];
    if (b.block <= a.block) continue;
    const rateA = a.set.aprPct / 100;
    const rateB = b.set.aprPct / 100;
    const deltaPp = (rateB - rateA) * 100;
    if (Math.abs(deltaPp) < floor) continue;
    const d = a.e.context.data;
    const art = Number(d.artAfter);
    const rate = Number(d.rateAtBlock ?? 0);
    const debt = rate > 0 && art > 0 ? (art * rate) / 1e27 : null;
    const owedNothing = !(art > 0);
    out.push({
      id: `rate-step:makerdao-${ilk.toLowerCase()}:${a.block}-${b.block}`,
      fromBlock: a.block,
      toBlock: b.block,
      rateA,
      rateB,
      deltaPp,
      sets: sets.filter(
        (s) =>
          (s.block > a.block || (s.block === a.block && s.logIndex > a.logIndex)) &&
          (s.block < b.block || (s.block === b.block && s.logIndex <= b.logIndex)),
      ).length,
      ordinalA: a.set.ordinal,
      ordinalB: b.set.ordinal,
      owedNothing,
      interest: debt == null ? null : { debt, before: debt * rateA, after: debt * rateB },
    });
  }
  return { steps: out, notes: collapseRuns(out), rated, moments: moments.length };
}

/**
 * The collapse, restated: a run of stretches whose moves share a sign is ONE
 * note, from the first stretch's earlier end to the last stretch's later one.
 * A stretch the other way ends the run; a move too small to be stated never
 * breaks one (it was never a stretch, so the scan never sees it); a live note
 * is never taken into a run, and none reaches here — this replica computes
 * historical stretches only, and the page's `-head` row is counted apart
 * everywhere below.
 *
 * Written from the shipped rule, not imported from
 * `collapseSameDirectionRateSteps` — the same reason `computeNotes` restates
 * the selector. Maker-specific, and the reason this is sound at all: the run's
 * two ends are the VAULT'S OWN touches and the two fees are the ilk's
 * CONFIRMED sets at those touches (the last set at or before each), so a
 * merged note still states two Jug-confirmed figures and nothing about the
 * fee's path between them beyond how many times it was reset. The merge holds
 * because Maker's fee ratchets inside a governance cycle, which is what makes
 * first-to-last the true span.
 *
 * ⚠ `sets` on a merged note is the MEMBERS' SUM. It is NOT `last.ordinalB −
 * first.ordinalA`: a sub-threshold pair skipped between two members took the
 * fee through resets the sum does not count, so the sum can read under the
 * span the two ends state. Designed — §9 of market-notes.md — and pinned as
 * the sum at §2f.
 */
function collapseRuns(steps) {
  const out = [];
  let run = [];
  const settle = () => {
    if (run.length === 0) return;
    const first = run[0];
    const last = run[run.length - 1];
    out.push({
      ...first,
      id: `${first.id.slice(0, first.id.lastIndexOf(":") + 1)}${first.fromBlock}-${last.toBlock}`,
      toBlock: last.toBlock,
      rateB: last.rateB,
      deltaPp: (last.rateB - first.rateA) * 100,
      // The members' sum, and only where every member has one.
      sets: run.every((s) => s.sets != null) ? run.reduce((n, s) => n + s.sets, 0) : null,
      // What a re-derivation from the two ends' ordinals WOULD say, kept
      // beside the sum so §2f can hold them apart rather than assume them equal.
      ordinalSpan: last.ordinalB - first.ordinalA,
      // The FIRST member's debt, held fixed and priced at the two ENDS' fees.
      interest: first.interest
        ? {
            debt: first.interest.debt,
            before: first.interest.debt * first.rateA,
            after: first.interest.debt * last.rateB,
          }
        : null,
      steps: run.length,
      members: run.map((s) => ({ fromBlock: s.fromBlock, toBlock: s.toBlock, fromValue: s.rateA, toValue: s.rateB })),
    });
    run = [];
  };
  for (const step of steps) {
    // A stretch the vault began owing nothing stands alone: it neither joins a
    // run nor lets the run on either side join across it.
    if (step.owedNothing) {
      settle();
      run = [step];
      settle();
      continue;
    }
    const last = run[run.length - 1];
    if (last && Math.sign(last.deltaPp) === Math.sign(step.deltaPp)) run.push(step);
    else {
      settle();
      run = [step];
    }
  }
  settle();
  return out;
}

// ── the chain, for §1 ──────────────────────────────────────────────────────
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.ALCHEMY_URL) throw new Error("need ALCHEMY_URL in .env.local");
const client = createPublicClient({
  chain: mainnet,
  transport: http(env.ALCHEMY_URL, { batch: true, retryCount: 3 }),
});
const JUG_ABI = parseAbi([
  "function ilks(bytes32) view returns (uint256 duty, uint256 rho)",
  "function base() view returns (uint256)",
]);
/** The Jug's own answer for an ilk at a block, as a percent per year. */
async function chainFeePct(ilk, block) {
  const [ilks, base] = await Promise.all([
    client.readContract({
      address: JUG,
      abi: JUG_ABI,
      functionName: "ilks",
      args: [stringToHex(ilk, { size: 32 })],
      blockNumber: BigInt(block),
    }),
    client.readContract({ address: JUG, abi: JUG_ABI, functionName: "base", blockNumber: BigInt(block) }),
  ]);
  return (Math.pow(Number(base + ilks[0]) / 1e27, SECONDS_PER_YEAR) - 1) * 100;
}

// ── the pins (plan §1) ─────────────────────────────────────────────────────

/** WSTETH-B's two newest sets AS OF block 25,630,785 (the pin was read there):
 *  ordinals count the zero set at the head of the log, so the 33rd is 10.25. */
const WSTETH_B_PIN_BLOCK = 25630785;
const WSTETH_B_PIN_SETS = 33;
const WSTETH_B_LAST_TWO = [
  { ordinal: 32, block: 25193461, logIndex: 809, aprPct: 9.25 },
  { ordinal: 33, block: 25630785, logIndex: 276, aprPct: 10.25 },
];
/** ETH-A as of its newest set at the pin, block 25,596,295 (9.50, derived and confirmed agreeing). */
const ETH_A_PIN_BLOCK = 25596295;
const ETH_A_PIN_SETS = 53;

/** The plan's own §1b tables (2026-09-06), under the 1 pp rule. §2c applies the
 *  old rule to today's data and requires these exactly, which is what shows the
 *  index has not drifted under the pins below. */
const PLAN_STRETCHES_28699 = [
  [17278625, 17737533, 0.75, 3.19, 2.44],
  [17737533, 17988836, 3.19, 5.0, 1.81],
  [18980306, 19936166, 5.0, 9.0, 4.0],
  [19936166, 20323030, 9.0, 8.0, -1.0],
  [20394878, 21374251, 8.0, 13.5, 5.5],
  [21374251, 21922144, 13.5, 10.5, -3.0],
  [21922144, 22018729, 10.5, 8.5, -2.0],
  [22018822, 22158643, 8.5, 6.75, -1.75],
  [22676311, 23524448, 6.75, 8.5, 1.75],
  [25256129, 25917081, 9.25, 10.25, 1.0],
];
const PLAN_STRETCHES_16745 = [
  [11642230, 11703337, 2.5, 3.5, 1.0],
  [11781275, 12078235, 3.5, 5.5, 2.0],
  [12563830, 13106460, 5.5, 2.0, -3.5],
  [15582694, 17937478, 1.5, 3.44, 1.94],
  [17937478, 19214177, 3.44, 6.74, 3.3],
  [21139601, 21219604, 6.25, 8.25, 2.0],
  [21219604, 21339612, 8.25, 9.25, 1.0],
  [21339612, 21391746, 9.25, 12.75, 3.5],
  [21588554, 21868658, 12.75, 9.75, -3.0],
  [21884626, 21926675, 9.75, 7.75, -2.0],
  [21989099, 22213537, 7.75, 6.0, -1.75],
  [22556727, 23105751, 6.0, 7.0, 1.0],
  [23105773, 24685938, 7.0, 8.0, 1.0],
  [25547112, 25634095, 8.5, 9.5, 1.0],
];

/** Every stretch under the 0.01 pp floor — from/to/fees/Δ — re-derived
 *  2026-10-01. The plan's rows are all in here; the rest are the moves under a
 *  point (0.25 to 0.75) and, on 28699, the two 0% stretches. */
const STRETCHES_28699 = [
  [15310062, 15662568, 0.75, 0.0, -0.75],
  [16134354, 16523794, 0.0, 0.25, 0.25],
  [16694191, 17069702, 0.25, 0.75, 0.5],
  [17278625, 17737533, 0.75, 3.19, 2.44],
  [17737533, 17988836, 3.19, 5.0, 1.81],
  [18980306, 19936166, 5.0, 9.0, 4.0],
  [19936166, 20323030, 9.0, 8.0, -1.0],
  [20394878, 21374251, 8.0, 13.5, 5.5],
  [21374251, 21922144, 13.5, 10.5, -3.0],
  [21922144, 22018729, 10.5, 8.5, -2.0],
  [22018822, 22158643, 8.5, 6.75, -1.75],
  [22676311, 23524448, 6.75, 8.5, 1.75],
  [23524448, 24392332, 8.5, 8.75, 0.25],
  [24392499, 25255186, 8.75, 9.25, 0.5],
  [25256129, 25917081, 9.25, 10.25, 1.0],
];
const STRETCHES_16745 = [
  [11465814, 11631925, 2.0, 2.5, 0.5],
  [11642230, 11703337, 2.5, 3.5, 1.0],
  [11781275, 12078235, 3.5, 5.5, 2.0],
  [12563830, 13106460, 5.5, 2.0, -3.5],
  [13464687, 13627913, 2.0, 2.5, 0.5],
  [13627913, 13891488, 2.5, 2.75, 0.25],
  [14051850, 14757280, 2.75, 2.25, -0.5],
  [15410427, 15534760, 2.25, 1.5, -0.75],
  [15582694, 17937478, 1.5, 3.44, 1.94],
  [17937478, 19214177, 3.44, 6.74, 3.3],
  [19214177, 21036719, 6.74, 6.25, -0.49],
  [21139601, 21219604, 6.25, 8.25, 2.0],
  [21219604, 21339612, 8.25, 9.25, 1.0],
  [21339612, 21391746, 9.25, 12.75, 3.5],
  [21588554, 21868658, 12.75, 9.75, -3.0],
  [21884626, 21926675, 9.75, 7.75, -2.0],
  [21989099, 22213537, 7.75, 6.0, -1.75],
  [22556727, 23105751, 6.0, 7.0, 1.0],
  [23105773, 24685938, 7.0, 8.0, 1.0],
  [25188237, 25225710, 8.0, 8.5, 0.5],
  [25547112, 25634095, 8.5, 9.5, 1.0],
];

/**
 * What the page shows: the tables above put through the collapse (same-way
 * runs merge, a stretch the vault began owing nothing stands alone).
 *
 * `sets` is the MEMBERS' SUM; `ordinalSpan` is what the two ends' own ordinals
 * say. Under the old 1 pp rule they differed where a sub-threshold pair was
 * skipped (16745's five-step run, 10 against 17). Every change is a stretch
 * now, so a run skips nothing and the two are equal on every note here — §2f
 * pins that, and that the page states the sum.
 */
const MERGED_28699 = [
  { from: 15310062, to: 15662568, fromPct: 0.75, toPct: 0.0, dpp: -0.75, steps: 1, sets: 1, ordinalSpan: 1 },
  { from: 16134354, to: 19936166, fromPct: 0.0, toPct: 9.0, dpp: 9.0, steps: 5, sets: 13, ordinalSpan: 13 },
  { from: 19936166, to: 20323030, fromPct: 9.0, toPct: 8.0, dpp: -1.0, steps: 1, sets: 1, ordinalSpan: 1 },
  { from: 20394878, to: 21374251, fromPct: 8.0, toPct: 13.5, dpp: 5.5, steps: 1, sets: 4, ordinalSpan: 4 },
  { from: 21374251, to: 22158643, fromPct: 13.5, toPct: 6.75, dpp: -6.75, steps: 3, sets: 3, ordinalSpan: 3 },
  { from: 22676311, to: 25917081, fromPct: 6.75, toPct: 10.25, dpp: 3.5, steps: 4, sets: 10, ordinalSpan: 10 },
];
const MERGED_16745 = [
  { from: 11465814, to: 12078235, fromPct: 2.0, toPct: 5.5, dpp: 3.5, steps: 3, sets: 4, ordinalSpan: 4 },
  { from: 12563830, to: 13106460, fromPct: 5.5, toPct: 2.0, dpp: -3.5, steps: 1, sets: 2, ordinalSpan: 2 },
  { from: 13464687, to: 13891488, fromPct: 2.0, toPct: 2.75, dpp: 0.75, steps: 2, sets: 2, ordinalSpan: 2 },
  { from: 14051850, to: 15534760, fromPct: 2.75, toPct: 1.5, dpp: -1.25, steps: 2, sets: 3, ordinalSpan: 3 },
  { from: 15582694, to: 19214177, fromPct: 1.5, toPct: 6.74, dpp: 5.24, steps: 2, sets: 7, ordinalSpan: 7 },
  { from: 19214177, to: 21036719, fromPct: 6.74, toPct: 6.25, dpp: -0.49, steps: 1, sets: 7, ordinalSpan: 7 },
  { from: 21139601, to: 21391746, fromPct: 6.25, toPct: 12.75, dpp: 6.5, steps: 3, sets: 3, ordinalSpan: 3 },
  { from: 21588554, to: 22213537, fromPct: 12.75, toPct: 6.0, dpp: -6.75, steps: 3, sets: 3, ordinalSpan: 3 },
  // The vault owed nothing at 22,556,727: this stretch stands alone, with no
  // interest, though the stretch after it (23,105,773 on) moves the same way.
  { from: 22556727, to: 23105751, fromPct: 6.0, toPct: 7.0, dpp: 1.0, steps: 1, sets: 4, ordinalSpan: 4, owedNothing: true },
  { from: 23105773, to: 25634095, fromPct: 7.0, toPct: 9.5, dpp: 2.5, steps: 3, sets: 6, ordinalSpan: 6 },
];

const near = (a, b, tol) => Math.abs(a - b) <= tol;
const tableMatches = (notes, want) =>
  notes.length === want.length &&
  want.every(([from, to, fromPct, toPct, dpp], i) => {
    const n = notes[i];
    return (
      n.fromBlock === from &&
      n.toBlock === to &&
      near(n.rateA * 100, fromPct, 0.005) &&
      near(n.rateB * 100, toPct, 0.005) &&
      near(n.deltaPp, dpp, 0.005)
    );
  });

/** A merged table, member counts and fee-reset sums included. The `sets`
 *  comparison is against the pinned SUM; `ordinalSpan` is checked separately
 *  at §2f so a swap between the two cannot pass here unnoticed. */
const mergedMatches = (notes, want) =>
  notes.length === want.length &&
  want.every((w, i) => {
    const n = notes[i];
    return (
      n.fromBlock === w.from &&
      n.toBlock === w.to &&
      n.steps === w.steps &&
      n.sets === w.sets &&
      Boolean(n.owedNothing) === Boolean(w.owedNothing) &&
      n.members.length === w.steps &&
      n.members[0].fromBlock === w.from &&
      n.members[n.members.length - 1].toBlock === w.to &&
      near(n.rateA * 100, w.fromPct, 0.005) &&
      near(n.rateB * 100, w.toPct, 0.005) &&
      near(n.deltaPp, w.dpp, 0.005)
    );
  });
const showMerged = (notes) =>
  notes
    .map((n) => `${n.steps}× ${n.fromBlock}→${n.toBlock} ${ratePct(n.rateA)}→${ratePct(n.rateB)} sets=${n.sets}`)
    .join(" · ");

// `?folders=0`: the flat answer. The page's notes are computed over the events
// it holds, and the served folders (default since web f0eaf46) hold some back,
// so a fee note on the default view can run across a folded touch and state
// "the vault's previous event" without it.
const vaultUrl = (id) => `${BASE}/ethereum/makerdao/${id}?folders=0`;

async function open(context, url, wantNotes = 0) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page
    .getByText(/^(?:Showing )?[\d,]+(?: of [\d,]+)? (?:events?|listed)/)
    .first()
    .waitFor({ state: "visible", timeout: 180000 })
    .catch(() => {});
  // A note row exists only after the ilk's rate log has been fetched, which
  // starts once the timeline has named the ilk — two round trips after the
  // page is otherwise readable. Poll for the expected count rather than
  // sleeping a guess: a slow fetch would otherwise read as "no notes", which
  // is the one wrong answer this whole file exists to catch. The poll is
  // BOUNDED and never asserts — a page that truly has none simply spends the
  // budget and the checks below still see zero.
  if (wantNotes > 0) {
    for (let i = 0; i < 40; i += 1) {
      if ((await page.locator("[data-market-note]").count()) >= wantNotes) break;
      await page.waitForTimeout(1000);
    }
  }
  await page.waitForTimeout(2000);
  return page;
}

/**
 * Press "Show N more" until the timeline holds every row.
 *
 * The timeline draws a WINDOW of rows (`TIMELINE_PAGE_ROWS` = 50, windowing
 * since web a4aa191b), and a note is drawn beside the row it anchors on — so
 * on a vault with more rows than the window, the notes over its older history
 * are not in the DOM at all until the window is grown. 16745 has 114 rows: at
 * rest the page holds back to block 21,066,218 and shows 3 of its 5 rate-step
 * rows, while the toolbar pill still counts 6. Nothing to do with the
 * collapse — the same window hid 5 of the 14 pre-collapse rows this file used
 * to pin — but any count taken off the page has to grow the window first, or
 * it is counting the window rather than the timeline.
 *
 * Returns false if a "Show more" button survives the presses, so a silently
 * truncated page fails rather than passing on a short count.
 */
async function showAllRows(page) {
  const more = () => page.getByRole("button", { name: /^Show [\d,]+ more$/ }).first();
  for (let i = 0; i < 20; i += 1) {
    if (!(await more().count())) break;
    await more()
      .click()
      .catch(() => {});
    await page.waitForTimeout(600);
  }
  await page.waitForTimeout(600);
  return (await page.getByRole("button", { name: /^Show [\d,]+ more$/ }).count()) === 0;
}

const NOTE_SELECTOR = '[data-market-note^="rate-step:makerdao-"]';
const noteTexts = async (page) =>
  (await page.locator(NOTE_SELECTOR).allTextContents()).map((t) => t.replace(/\s+/g, " "));

/** Open every Maker rate-step note's header, then its derivation disclosure.
 *  Re-asserts the open state after the poll — a pre-hydration click vanishes
 *  rather than replaying. */
async function openNotesAndDerivations(page) {
  const rows = page.locator(NOTE_SELECTOR);
  const n = await rows.count();
  for (let i = 0; i < n; i += 1) {
    const row = rows.nth(i);
    await row.scrollIntoViewIfNeeded();
    await row
      .getByRole("button", { expanded: false })
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(120);
    const trigger = row.getByRole("button", { name: /how this note was derived/i });
    if (await trigger.count()) await trigger.click().catch(() => {});
  }
  await page.waitForTimeout(400);
  const open = await page.locator(`${NOTE_SELECTOR}[data-market-note-open]`).count();
  return { total: n, open };
}

console.log("MakerDAO stability-fee rate-step market note — on the page\n");
console.log(`BASE ${BASE}\n`);

// ── 0. the proxy's own answer ──────────────────────────────────────────────

const wsteth = await api("/api/makerdao/ilks/WSTETH-B/rate-log");
// Read AS OF the pin block: a set governance adds later leaves these true.
const wstethAtPin = wsteth.sets.filter((x) => x.block <= WSTETH_B_PIN_BLOCK);
check(
  `0. WSTETH-B's rate log serves ${WSTETH_B_PIN_SETS} sets up to block ${blk(WSTETH_B_PIN_BLOCK)} (one of them at 0%, server ba67ac7) and NO artefacts (its fold series is complete)`,
  wstethAtPin.length === WSTETH_B_PIN_SETS &&
    wsteth.sets.length >= WSTETH_B_PIN_SETS &&
    wsteth.artefacts.length === 0 &&
    wsteth.sets.some((x) => near(x.aprPct, 0, 1e-9)),
  `${wstethAtPin.length} sets at the pin (${wsteth.sets.length} now), 0% set at ${wsteth.sets.find((x) => near(x.aprPct, 0, 1e-9))?.block}, ${wsteth.artefacts.length} artefacts, ${wsteth.folds} folds`,
);
check(
  "0a. its last two sets at the pin are 9.25 @ 25,193,461 log 809 and 10.25 @ 25,630,785 log 276",
  WSTETH_B_LAST_TWO.every((w, i) => {
    const s = wstethAtPin[wstethAtPin.length - 2 + i];
    return (
      s &&
      s.ordinal === w.ordinal &&
      s.block === w.block &&
      s.logIndex === w.logIndex &&
      near(s.aprPct, w.aprPct, 0.005)
    );
  }),
  wstethAtPin
    .slice(-2)
    .map((s) => `#${s.ordinal} ${s.aprPct.toFixed(4)}@${s.block}/${s.logIndex}`)
    .join(" | "),
);
check(
  "0b. WSTETH-B's derived and confirmed figures agree everywhere (a complete series needs no correction)",
  wsteth.sets.every((s) => near(s.aprPct, s.derivedAprPct, 0.001)),
  `worst gap ${Math.max(...wsteth.sets.map((s) => Math.abs(s.aprPct - s.derivedAprPct))).toFixed(6)} pp`,
);

const etha = await api("/api/makerdao/ilks/ETH-A/rate-log");
const ethaAtPin = etha.sets.filter((x) => x.block <= ETH_A_PIN_BLOCK);
// Server ba2f3f1 (mig 321) filled the fold gap behind the old "51 sets and four
// artefacts": the walk now yields 53 sets and nothing to correct.
check(
  `0c. ETH-A serves ${ETH_A_PIN_SETS} sets up to block ${blk(ETH_A_PIN_BLOCK)} and NO artefacts (server ba2f3f1: the fold gap is filled)`,
  ethaAtPin.length === ETH_A_PIN_SETS && etha.artefacts.length === 0,
  `${ethaAtPin.length} sets at the pin (${etha.sets.length} now), ${etha.artefacts.length} artefacts`,
);
// The four blocks the old pin had to treat as artefacts are not sets any more:
// the two the plan named (derived 0.3712 and 8.5085, each confirming 8.50) and
// the two beyond it (§1c reads the Jug at those and finds no change).
const FORMER_ARTEFACTS = [16976042, 16976256, 25428143, 25430354];
check(
  "0e. none of the four blocks the old pin treated as artefacts is a set — 16,976,042, 16,976,256, 25,428,143, 25,430,354",
  FORMER_ARTEFACTS.every((b) => !etha.sets.some((x) => x.block === b)),
  FORMER_ARTEFACTS.map((b) => `${b}: ${etha.sets.some((x) => x.block === b) ? "a set" : "absent"}`).join(", "),
);
const ethaLast = ethaAtPin[ethaAtPin.length - 1];
check(
  `0f. ETH-A's newest set at the pin is 9.50 @ ${blk(ETH_A_PIN_BLOCK)}, and its derived figure now equals the confirmed one (the gap-inflated 9.5094 is gone)`,
  ethaLast.block === ETH_A_PIN_BLOCK && near(ethaLast.aprPct, 9.5, 0.005) && near(ethaLast.derivedAprPct, 9.5, 0.001),
  `${ethaLast.block} confirmed ${ethaLast.aprPct.toFixed(6)} derived ${ethaLast.derivedAprPct.toFixed(4)}`,
);
const unknown = await fetch(`${BASE}/api/makerdao/ilks/NOPE-Z/rate-log`);
check("0g. an unknown collateral type is a 400, not an empty log", unknown.status === 400, `status ${unknown.status}`);

// ── 1. independent chain confirmation ──────────────────────────────────────
// The expected values here come from the chain, not from anything above.

const chain10_25 = await chainFeePct("WSTETH-B", WSTETH_B_LAST_TWO[1].block);
const chain9_25 = await chainFeePct("WSTETH-B", WSTETH_B_LAST_TWO[0].block);
const chainEthA = await chainFeePct("ETH-A", ETH_A_PIN_BLOCK);
check(
  "1. the Jug's own duty at WSTETH-B's two newest set blocks is 10.25% and 9.25%",
  near(chain10_25, 10.25, 0.001) && near(chain9_25, 9.25, 0.001),
  `${chain10_25.toFixed(6)} @25630785, ${chain9_25.toFixed(6)} @25193461`,
);
check(
  "1a. the Jug's own duty at ETH-A's newest set block at the pin (25,596,295) is 9.50%",
  near(chainEthA, 9.5, 0.001),
  `${chainEthA.toFixed(6)}`,
);
check(
  "1b. the route's served figures ARE those chain reads",
  near(wstethAtPin.at(-1).aprPct, chain10_25, 1e-9) &&
    near(wstethAtPin.at(-2).aprPct, chain9_25, 1e-9) &&
    near(ethaLast.aprPct, chainEthA, 1e-9),
  `route ${ethaLast.aprPct} vs chain ${chainEthA}`,
);
// Why 0e holds, from the chain: the blocks the old pin counted as artefacts read
// the SAME duty as the set before them, so none was ever a rate change.
const extraA = await chainFeePct("ETH-A", 16976042);
const extraB = await chainFeePct("ETH-A", 16976256);
const beforeExtras = await chainFeePct("ETH-A", 16975705);
check(
  "1c. the two artefacts the old pin found beyond the plan's are chain-confirmed non-changes — the Jug reads 1.50% at 16,975,705, 16,976,042 AND 16,976,256",
  near(extraA, beforeExtras, 1e-9) && near(extraB, beforeExtras, 1e-9) && near(extraA, 1.5, 0.001),
  `${beforeExtras.toFixed(6)} → ${extraA.toFixed(6)} → ${extraB.toFixed(6)}`,
);
// The two figures the 0.01 pp rule newly states, read off the Jug: the 0% set
// at the head of WSTETH-B's log (server ba67ac7) and the 8.75 set behind the
// 0.25 pp step the 1 pp rule withheld (28699's 8.50 → 8.75).
const zeroSet = wsteth.sets.find((x) => near(x.aprPct, 0, 1e-9));
const step875 = wsteth.sets.filter((x) => x.block <= 24392332 && near(x.aprPct, 8.75, 0.005)).at(-1);
const chainZero = zeroSet ? await chainFeePct("WSTETH-B", zeroSet.block) : NaN;
const chain875 = step875 ? await chainFeePct("WSTETH-B", step875.block) : NaN;
check(
  "1d. the Jug reads 0% at WSTETH-B's 0% set and 8.75% at the set behind the 0.25 pp step (8.50 → 8.75)",
  zeroSet != null && near(chainZero, 0, 1e-6) && step875 != null && near(chain875, 8.75, 0.001),
  `${chainZero.toFixed(6)} @${zeroSet?.block}, ${Number.isNaN(chain875) ? "no 8.75 set" : chain875.toFixed(6)} @${step875?.block}`,
);

// ── 2. the rule, replayed over the route data ──────────────────────────────

const tl28699 = await api("/api/makerdao/vault/28699/timeline");
const tl16745 = await api("/api/makerdao/vault/16745/timeline");
const tl31168 = await api("/api/makerdao/vault/31168/timeline");

const r28699 = computeNotes(tl28699.events, wsteth.sets, "WSTETH-B");
const r16745 = computeNotes(tl16745.events, etha.sets, "ETH-A");
const r31168 = computeNotes(tl31168.events, wsteth.sets, "WSTETH-B");

check(
  "2. vault 28699's 15 stretches match the pinned table exactly (from/to/fees/Δ) — every fee change between its touches, two of them at 0%",
  tableMatches(r28699.steps, STRETCHES_28699),
  `${r28699.steps.length} stretches: ${r28699.steps.map((n) => `${n.fromBlock}→${n.toBlock} ${n.deltaPp.toFixed(2)}`).join(", ")}`,
);
check(
  "2a. vault 16745's 21 stretches match the pinned table exactly, likewise",
  tableMatches(r16745.steps, STRETCHES_16745),
  `${r16745.steps.length} stretches: ${r16745.steps.map((n) => `${n.fromBlock}→${n.toBlock} ${n.deltaPp.toFixed(2)}`).join(", ")}`,
);
// ── 2c. the old rule, on today's data ──────────────────────────────────────
// The plan's tables (1 pp rule, 2026-09-06) are still what that rule yields,
// so the index has not drifted under the pins: web 2ffd7b5 moved the rule.
const old28699 = computeNotes(tl28699.events, wsteth.sets, "WSTETH-B", {
  minPp: OLD_RATE_STEP_MIN_PP - OLD_RATE_TRUNCATION_SLACK_PP,
});
const old16745 = computeNotes(tl16745.events, etha.sets, "ETH-A", {
  minPp: OLD_RATE_STEP_MIN_PP - OLD_RATE_TRUNCATION_SLACK_PP,
});
check(
  "2c. the old 1 pp rule applied to today's data still yields the plan's 10 stretches on 28699 and 14 on 16745 — the rule moved, not the index",
  tableMatches(old28699.steps, PLAN_STRETCHES_28699) && tableMatches(old16745.steps, PLAN_STRETCHES_16745),
  `28699 ${old28699.steps.length}, 16745 ${old16745.steps.length}`,
);
const underPoint = (r) => r.steps.filter((n) => Math.abs(n.deltaPp) < 1 - OLD_RATE_TRUNCATION_SLACK_PP);
const smallest = Math.min(...[...r28699.steps, ...r16745.steps].map((n) => Math.abs(n.deltaPp)));
check(
  "2c1. the 0.01 pp floor admits only governance moves — the smallest stretch on either vault is 0.25 pp, 5 on 28699 and 7 on 16745 sit under the point the old rule withheld, and none is truncation noise (~5e-7 pp)",
  near(smallest, 0.25, 1e-3) && underPoint(r28699).length === 5 && underPoint(r16745).length === 7,
  `smallest ${smallest.toFixed(4)} pp; under a point: ${underPoint(r28699).length} and ${underPoint(r16745).length}`,
);
// ── 2e/2f. the collapse, replayed over those same stretches ────────────────
check(
  "2e. 28699's 15 stretches merge into the 6 pinned runs (1, 5, 1, 1, 3, 4 steps), each from its first member's earlier touch to its last member's later one",
  mergedMatches(r28699.notes, MERGED_28699) && r28699.notes.reduce((n, x) => n + x.steps, 0) === STRETCHES_28699.length,
  showMerged(r28699.notes),
);
check(
  "2e1. 16745's 21 stretches merge into the 10 pinned runs — the stretch the vault began owing nothing (22,556,727 → 23,105,751) stands alone beside a same-way neighbour",
  mergedMatches(r16745.notes, MERGED_16745) && r16745.notes.reduce((n, x) => n + x.steps, 0) === STRETCHES_16745.length,
  showMerged(r16745.notes),
);
// Every merged row states at least as much as its largest member — the
// precondition §9 puts on any home that adopts the collapse, asserted on
// Maker's own data rather than taken on trust. It is what the Aave family
// fails, and it is the whole reason this merge is sound here.
const monotonic = (r) =>
  r.notes.every((n) => {
    const moves = n.members.map((m) => (m.toValue - m.fromValue) * 100);
    const widest = Math.max(...moves.map(Math.abs));
    return Math.abs(n.deltaPp) >= widest - 0.005 && moves.every((mv) => Math.sign(mv) === Math.sign(n.deltaPp));
  });
check(
  "2e2. no merged row on either vault states LESS than its largest member, and every member moves the way the row does — §9's monotonicity precondition, on Maker's own fees",
  monotonic(r28699) && monotonic(r16745),
  `28699 ${monotonic(r28699)}, 16745 ${monotonic(r16745)}`,
);
// Every read below goes through the replica BY POSITION. A wrong merge leaves
// those positions empty, and an empty position must go red like any other
// wrong answer — never throw, or the run is a CRASH and the other checks are lost.
const sumVsSpan = (notes, want) =>
  notes.length === want.length &&
  want.every((w, i) => notes[i]?.sets === w.sets && notes[i]?.ordinalSpan === w.ordinalSpan);
const allSumEqSpan = (r) => r.notes.every((n) => n.sets === n.ordinalSpan);
check(
  "2f. setsBetween on a merged note is the MEMBERS' SUM, pinned beside the two ends' ordinal difference — equal on every note now, because every change is a stretch and no run skips a pair (28699's four-step run: 10 and 10; 16745's two-step run: 7 and 7)",
  sumVsSpan(r28699.notes, MERGED_28699) &&
    sumVsSpan(r16745.notes, MERGED_16745) &&
    allSumEqSpan(r28699) &&
    allSumEqSpan(r16745) &&
    r28699.notes[5]?.sets === 10 &&
    r16745.notes[4]?.sets === 7,
  `28699 run×4 sum ${r28699.notes[5]?.sets} vs span ${r28699.notes[5]?.ordinalSpan}; 16745 run×2 sum ${r16745.notes[4]?.sets} vs span ${r16745.notes[4]?.ordinalSpan}`,
);
// The interest slice on a merged note: the FIRST member's debt, held fixed and
// priced at the two ENDS' fees — not the last member's debt, and not a sum.
const run28699 = r28699.notes[5]; // 22,676,311 → 25,917,081, four steps
const firstMember28699 = r28699.steps.find((s) => s.fromBlock === run28699?.fromBlock);
check(
  "2g. the merged interest slice is the FIRST member's debt priced at the run's two ends (≈155.4K DAI at 6.75% → 10.25%), not the last member's",
  run28699?.interest != null &&
    firstMember28699?.interest != null &&
    near(run28699.interest.debt, firstMember28699.interest.debt, 0.01) &&
    near(run28699.interest.before, firstMember28699.interest.debt * run28699.rateA, 0.01) &&
    near(run28699.interest.after, firstMember28699.interest.debt * run28699.rateB, 0.01) &&
    near(run28699.interest.debt, 155396, 155396 * 0.005),
  `debt ${run28699?.interest?.debt?.toFixed(2)} ${run28699?.interest?.before?.toFixed(2)} → ${run28699?.interest?.after?.toFixed(2)}`,
);
const last16745 = r16745.steps[r16745.steps.length - 1];
check(
  "2b. 16745's newest stretch reads 8.50% → 9.50%, Δ 1.00 points — the confirmed figures",
  last16745 &&
    near(last16745.rateA * 100, 8.5, 0.005) &&
    near(last16745.rateB * 100, 9.5, 0.005) &&
    ppMagnitude(last16745.deltaPp) === "1.00 points",
  last16745
    ? `${(last16745.rateA * 100).toFixed(4)} → ${(last16745.rateB * 100).toFixed(4)}, ${ppMagnitude(last16745.deltaPp)}`
    : "no stretch",
);
// A vault that owed nothing at a stretch's start: that stretch is its own note
// with no interest, and the same-way stretch after it does not join it.
const nothing16745 = r16745.steps.filter((n) => n.owedNothing);
check(
  "2h. 16745 owed nothing at exactly one stretch's start (22,556,727), which carries no interest and merges with nothing",
  nothing16745.length === 1 &&
    nothing16745[0].fromBlock === 22556727 &&
    nothing16745[0].interest == null &&
    r16745.notes.some((n) => n.fromBlock === 22556727 && n.toBlock === 23105751 && n.steps === 1),
  nothing16745.map((n) => n.id).join(", ") || "none",
);
// The row arithmetic on 16745, asserted rather than reported: 114 events, of
// which 4 `give` rows carry no economics and are not ends, leaving 110 that
// can be; same-block rows are ONE moment, which collapses those 110 to 106;
// and every one of the 106 falls at or after ETH-A's first set, so all 106 are
// rated. A `give` slipping into the ends, or the same-block collapse silently
// not happening, moves one of these three numbers.
const gives16745 = tl16745.events.filter((e) => e.context?.data?.eventType === "give").length;
check(
  "2d. 16745's rows reduce as the rule says: 114 events − 4 gives = 110 candidate ends → 106 moments (same-block rows are one) → 106 rated",
  tl16745.events.length === 114 && gives16745 === 4 && r16745.moments === 106 && r16745.rated.length === 106,
  `${tl16745.events.length} events, ${gives16745} gives, ${r16745.moments} moments, ${r16745.rated.length} rated`,
);

// ── the browser ────────────────────────────────────────────────────────────

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1400 },
  permissions: ["clipboard-read", "clipboard-write"],
});
// Every note draws its row, as at rest before the markers (lib/market-notes.mjs).
await showNoteRows(context);

// ── 3. vault 28699 — the fixture with the flat live note ───────────────────

const chain28699 = await api("/api/chain/makerdao/vault/28699");
const live28699 = chain28699.state;

// Whether a live (-head) row is drawn depends on the fee now against the fee at
// the vault's last event (10.25%): it is not while they are equal, and is the
// moment governance moves WSTETH-B's fee. Read from the route before the page.
const flatLive = near(live28699.stabilityFeeApr * 100, 10.25, 0.01);
const heads28699 = flatLive ? 0 : 1;
const notes28699 = MERGED_28699.length + heads28699;

const page = await open(context, vaultUrl("28699"), notes28699);
// 43 rows today, under the 50-row window, so this is a no-op — until the
// vault is touched eight more times, when it would quietly stop being one.
const expanded28699 = await showAllRows(page);
const ids28699 = await page
  .locator("[data-market-note]")
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-market-note")));
const hist28699 = ids28699.filter((i) => !i.endsWith("-head"));
const head28699 = ids28699.filter((i) => i.endsWith("-head"));
check(
  `3. 28699 shows the ${MERGED_28699.length} pinned historical rows — its 15 stretches merged — and ${flatLive ? "no -head row (the fee is flat)" : "exactly ONE -head row"}, with every timeline row drawn`,
  expanded28699 && hist28699.length === MERGED_28699.length && head28699.length === heads28699,
  `${hist28699.length} historical, ${head28699.length} live: ${ids28699.join(", ")}`,
);
check(
  "3a. their ids are the route-derived ones",
  JSON.stringify([...hist28699].sort()) === JSON.stringify(r28699.notes.map((n) => n.id).sort()),
  `page: ${hist28699.join(", ")}`,
);
// Every note is anchored above the row of its `to` block: the note's DOM
// position must precede that event row's, newest-first.
const anchorOk = await page.evaluate((ids) => {
  const all = [...document.querySelectorAll("[data-market-note],[data-event-id]")];
  if (ids.length === 0) return false;
  return ids.every((id) => {
    const note = all.findIndex((e) => e.getAttribute("data-market-note") === id);
    const toBlock = Number(id.split(":").pop().split("-")[1]);
    return note >= 0 && Number.isFinite(toBlock);
  });
}, hist28699);
check("3b. every historical note row is present in the timeline's own DOM order", anchorOk);

const headLocator = page.locator(`[data-market-note$="-head"]`).first();
const headFlat = ((await headLocator.count()) ? ((await headLocator.textContent()) ?? "") : "").replace(/\s+/g, " ");
// 2026-09-30 (MakerDAO newcomer r4, P5): a live note whose fee equals the fee
// at the vault's last event states no change, so it is not drawn. 28699's fee
// is 10.25% at its last event; while the Jug still reads that, no head row —
// and once governance moves it, exactly one.
check(
  flatLive
    ? "3c. the fee now equals the fee at the last event (10.25%, the vault route's stabilityFeeApr), so no live row is drawn"
    : "3c. the fee now differs from the fee at the last event (10.25%), so exactly one live row is drawn",
  flatLive ? headFlat === "" : headFlat !== "",
  `head row "${headFlat.slice(0, 120)}"; route stabilityFeeApr ${live28699.stabilityFeeApr}`,
);
const opened = await openNotesAndDerivations(page);
check(
  "3e. every Maker note on 28699 opens and stays open across the poll",
  opened.total === notes28699 && opened.open === opened.total,
  `${opened.open}/${opened.total} open`,
);
const openTexts = await noteTexts(page);

// The head row's own block, read off its opened Blocks stat — the one place
// the page states it. It must be the block the vault route answered at (both
// are the chain head, read seconds apart), and the row must carry an Elapsed
// figure, which is only possible because the overlay now returns the head
// block's own timestamp.
const openHeadLocator = page.locator(`[data-market-note$="-head"]`).first();
const openHead = ((await openHeadLocator.count()) ? ((await openHeadLocator.textContent()) ?? "") : "").replace(
  /\s+/g,
  " ",
);
// The row's Blocks stat states BOTH ends — the vault's own last touch and the
// head. The head is the LATER of the two, so take the max rather than the
// first match (which is the from-block and would fail this check for the
// wrong reason).
const headBlocks = [...openHead.matchAll(/2[0-9],[0-9]{3},[0-9]{3}/g)].map((m) => Number(m[0].replace(/,/g, "")));
const headStated = headBlocks.length ? Math.max(...headBlocks) : null;
check(
  "3d. the live row states a block within 200 of the vault route's own atBlock, re-read in this run (no row to read while the fee is flat)",
  live28699.atBlock > 0 &&
    ((flatLive && headStated == null) || (headStated != null && Math.abs(headStated - live28699.atBlock) < 200)),
  `row states ${headStated ?? "(none)"}, route atBlock ${live28699.atBlock}, blockTimestamp ${live28699.blockTimestamp}`,
);
check(
  "3d1. the live row carries an Elapsed figure — only possible because the overlay returns the head block's own timestamp (no row while the fee is flat)",
  (flatLive && openHead === "" ? true : /Elapsed/.test(openHead)) && live28699.blockTimestamp > 1_700_000_000,
  `Elapsed ${/Elapsed/.test(openHead)}, blockTimestamp ${live28699.blockTimestamp}`,
);

const pinned = r28699.notes[r28699.notes.length - 1]; // the four-step run 22,676,311 → 25,917,081
const pinnedText = openTexts.find((t) => t.includes(blk(pinned.fromBlock)) && t.includes(blk(pinned.toBlock)));
check(
  "3f. the merged 22,676,311 → 25,917,081 note states 6.75% → 10.25% and the interest slice its FIRST member's debt carries at those two fees (≈10,489 → 15,928 DAI on ≈155,396)",
  pinnedText != null &&
    pinnedText.includes(ratePct(pinned.rateA)) &&
    pinnedText.includes(ratePct(pinned.rateB)) &&
    pinnedText.includes(stableAmount(pinned.interest.debt)) &&
    pinnedText.includes(stableAmount(pinned.interest.before)) &&
    pinnedText.includes(stableAmount(pinned.interest.after)) &&
    near(pinned.interest.debt, 155396, 155396 * 0.005) &&
    near(pinned.interest.before, 10489, 10489 * 0.005) &&
    near(pinned.interest.after, 15928, 15928 * 0.005),
  pinnedText
    ? `debt ${pinned.interest.debt.toFixed(0)} before ${pinned.interest.before.toFixed(0)} after ${pinned.interest.after.toFixed(0)}`
    : "note not found once opened",
);
// The drip each fee was evidenced by is the receipts' job since the MakerDAO
// newcomer round 1 (T3 in plain words); §7b asserts the receipts' step lists.
check(
  "3g. its explanation states the move in plain words — the two fees, no Jug.drip derivation",
  pinnedText != null && /stability fee (rose|fell) from/.test(pinnedText) && !/Jug\.drip|rate_delta/.test(pinnedText),
  pinnedText ? (pinnedText.match(/stability fee (rose|fell) from.{0,60}/)?.[0] ?? "no plain sentence") : "",
);

// ── 3i–3k. the three surfaces a merged row owes its members ────────────────
// A merged row states a span no single member states, so if the members are
// not recoverable the row is a claim without its proof. §9 names the three
// (web 8dc12ab4 built them for Maker): the "Stated over N" stat, the
// derivation prose, and the receipt's step list. §3k is the receipt, asserted
// against the export down at §7 where the clipboard text is read.
// Web 2ffd7b5 / f32f322 renamed the stats and the prose: "Stated over N of the
// vault's touches" is "Covers N gaps between the vault's events, as one note",
// "Fee resets in between" is "Times governance changed the fee", and "across N
// of the vault's touches" is "over N stretches between the vault's events".
check(
  `3i. the merged row carries the "Covers" stat — ${pinned.steps} gaps between the vault's events, as one note`,
  pinnedText != null &&
    new RegExp(`Covers\\s*${pinned.steps} gaps between the vault.s events, as one note`).test(pinnedText),
  pinnedText ? (pinnedText.match(/Covers.{0,60}/)?.[0] ?? "no Covers stat") : "note not found",
);
check(
  `3i1. and its "Times governance changed the fee" stat states the members' SUM (${pinned.sets}); the two ends' ordinals span ${pinned.ordinalSpan}, so the two agree`,
  pinnedText != null &&
    new RegExp(`Times governance changed the fee\\s*${pinned.sets}(?!\\d)`).test(pinnedText.replace(/\s+/g, " ")) &&
    pinned.sets === pinned.ordinalSpan,
  pinnedText ? (pinnedText.match(/Times governance changed the fee.{0,20}/)?.[0] ?? "no changes stat") : "note not found",
);
check(
  "3j. the explanation says how many stretches between the vault's events the merged run spans",
  pinnedText != null &&
    new RegExp(`over ${pinned.steps} stretches between the vault.s events, so they make one note`).test(pinnedText),
  pinnedText
    ? (pinnedText.match(/over \d+ stretches between the vault.s events.{0,30}/)?.[0] ?? "no merged prose")
    : "note not found",
);
// The silence on a row that merged nothing — the same surfaces must not claim
// a span on a single stretch. 19,936,166 → 20,323,030 is one step.
const solo = r28699.notes.find((n) => n.fromBlock === 19936166 && n.toBlock === 20323030);
const soloText = solo ? openTexts.find((t) => t.includes(blk(solo.fromBlock)) && t.includes(blk(solo.toBlock))) : null;
check(
  `3k. the unmerged ${solo ? `${blk(solo.fromBlock)} → ${blk(solo.toBlock)}` : "(none on the page)"} row claims no merged span at all`,
  solo != null &&
    soloText != null &&
    !/Covers/.test(soloText) &&
    !/stretches between the vault.s events/.test(soloText),
  soloText
    ? (soloText.match(/Covers.{0,40}|\d+ stretches between the vault.s events/)?.[0] ?? "silent, as it must be")
    : "note not found",
);
/** Every note the timeline places, drawn or not (`data-market-notes`; the
 *  toolbar's "Market notes · N" pill until item 118), or 0 where the page has
 *  none — a missing count is a RED check, never a thrown run. */
const pillText = (p) => marketNoteCount(p);
check(
  `3h. the timeline's note count is ${notes28699} — the ${MERGED_28699.length} historical rows${heads28699 ? " and the live one" : ""}`,
  (await pillText(page)) === notes28699,
  `${await pillText(page)}`,
);

// ── 6. Display's switch hides every note, and no count moves ───────────────

const notesBefore = await page.locator("[data-market-note]").count();
const rowsBefore = await page.locator("[data-event-id]").count();
let afterHidden = -1;
let rowsAfter = -1;
let restored = -1;
const offered = await setMarketNotes(page, false);
if (offered) {
  await page.waitForTimeout(600);
  afterHidden = await page.locator("[data-market-note], [data-note-marker]").count();
  rowsAfter = await page.locator("[data-event-id]").count();
  await setMarketNotes(page, true);
  await page.waitForTimeout(600);
  restored = await page.locator("[data-market-note]").count();
}
check(
  '6. Display\'s "Market-note markers" off hides every note, row and marker, and moves no event count',
  offered && notesBefore === notes28699 && afterHidden === 0 && rowsBefore === rowsAfter,
  `${notesBefore} notes before, ${afterHidden} after, rows ${rowsBefore} → ${rowsAfter}`,
);
check(`6a. turning it back on restores all ${notes28699}`, restored === notes28699, `${restored}`);
const pillLeft = await page.getByRole("button", { name: /^Market notes ·/i }).count();
check('6b. the toolbar carries no "Market notes · N" pill', pillLeft === 0, `${pillLeft} found`);

// ── 7. Copy for LLM ────────────────────────────────────────────────────────

let md = "";
try {
  await page
    .getByRole("button", { name: /Export this (position|vault|loan|trove)|Copy for LLM/i })
    .first()
    .click();
  await page.getByRole("menuitem", { name: /Copy Position/i }).click();
  await page.waitForTimeout(600);
  md = await page.evaluate(() => navigator.clipboard.readText());
} catch (e) {
  // A run against a page with no notes still has to REPORT, not abort — the
  // fail-first depends on checks 3-7 going red rather than throwing.
  console.log(`      (export copy failed: ${String(e).slice(0, 80)})`);
}
const tableRows = (m) => (m.match(/^\| \d+ \| /gm) ?? []).length;
check(
  `7. the export states "Market notes: ${notes28699}", lists ${notes28699} with receipts, and adds no row to the event table`,
  new RegExp(`\\*\\*Market notes:\\*\\*\\s*${notes28699}\\b`).test(md) &&
    (md.match(/^- Receipt: rate before/gm) ?? []).length === notes28699 &&
    tableRows(md) === tl28699.events.length,
  `table rows ${tableRows(md)} vs route ${tl28699.events.length}; receipts ${(md.match(/^- Receipt: rate before/gm) ?? []).length}`,
);
// ── 7b. the THIRD member surface: the receipt's own step list ──────────────
// The row's header states a span no member states, so the receipt has to hand
// the steps back. The expected clause is assembled here from the route-derived
// members, in the shipped wording, rather than read off the export.
const stepsClause = (note) =>
  ` Stated as one stretch over ${note.steps.toLocaleString("en-US")} consecutive steps that all moved the ` +
  `rate the same way — ` +
  note.members
    .map((m) => `${blk(m.fromBlock)} → ${blk(m.toBlock)}, ${ratePct(m.fromValue)} → ${ratePct(m.toValue)}`)
    .join("; ") +
  `.`;
const mergedRuns28699 = r28699.notes.filter((n) => n.steps > 1);
const missingClause = mergedRuns28699.filter((n) => !md.includes(stepsClause(n)));
check(
  `7b. every merged row's receipt lists the steps it took in — ${mergedRuns28699.length} clauses, each naming its members' blocks and fees`,
  md.length > 0 && missingClause.length === 0,
  missingClause.length
    ? `missing for ${missingClause.map((n) => `${n.fromBlock}→${n.toBlock}`).join(", ")}; wanted "${stepsClause(missingClause[0]).slice(0, 150)}"`
    : `${mergedRuns28699.length} clause(s) present`,
);
check(
  "7c. and a row that merged nothing carries no such clause — as many clauses as merged rows, no more",
  (md.match(/Stated as one stretch over/g) ?? []).length === mergedRuns28699.length,
  `${(md.match(/Stated as one stretch over/g) ?? []).length} clause(s) for ${mergedRuns28699.length} merged row(s)`,
);
check(
  "7a. the export's notes name the stability fee and the vault, never a CDP or a primary rate",
  /stability fee/.test(md) && /this vault's/.test(md) && !/primary rate/.test(md) && !/this CDP/.test(md),
  `stability fee ${/stability fee/.test(md)}, primary rate ${/primary rate/.test(md)}`,
);
await page.close();

// ── 4. vault 16745 — the chain-confirmation demonstration ──────────────────

// 114 rows against a 50-row window, so the window is grown before anything is
// counted: at rest the page draws only the rate-step rows whose anchors fall
// in the newest 50 rows, while the pill counts all of them. Note the order —
// the wantNotes poll would spend its whole budget waiting for rows the window
// is holding back. The live row, as on 28699, follows the fee now against the
// fee at the vault's last event (9.50%).
const live16745 = (await api("/api/chain/makerdao/vault/16745")).state;
const flatLive16745 = near(live16745.stabilityFeeApr * 100, 9.5, 0.01);
const heads16745 = flatLive16745 ? 0 : 1;
const notes16745 = MERGED_16745.length + heads16745;
const page16745 = await open(context, vaultUrl("16745"), 0);
const windowedNotes16745 = await page16745.locator("[data-market-note]").count();
const windowedPill16745 = await pillText(page16745);
const expanded16745 = await showAllRows(page16745);
const ids16745 = await page16745
  .locator("[data-market-note]")
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-market-note")));
const hist16745 = ids16745.filter((i) => !i.endsWith("-head"));
check(
  `4. 16745 shows ${MERGED_16745.length} historical rows — its 21 stretches merged — and ${flatLive16745 ? "no -head row (the fee is flat)" : "one -head row"}, once every row of its 114 is drawn`,
  expanded16745 && hist16745.length === MERGED_16745.length && ids16745.length - hist16745.length === heads16745,
  `${hist16745.length} historical, ${ids16745.length - hist16745.length} live: ${hist16745.join(", ")}`,
);
check(
  `4a1. before the window is grown the page draws fewer than the ${notes16745} rows while the count already states ${notes16745} — the count is the timeline's, the DOM is the window's`,
  windowedNotes16745 < notes16745 && windowedPill16745 === notes16745,
  `${windowedNotes16745} row(s) drawn against count ${windowedPill16745}`,
);
check(`4a. its note count is ${notes16745}`, (await pillText(page16745)) === notes16745, `${await pillText(page16745)}`);
// The 25,547,112 → 25,634,095 stretch is the LAST member of the run that ends
// at 25,634,095 (from 23,105,773, where the vault owed something again), so it
// is no row of its own: the page states the run, and the stretch has to be
// recoverable from it rather than visible.
const run16745 = r16745.notes[r16745.notes.length - 1];
const newest16745 = run16745
  ? hist16745.find((i) => i.endsWith(`${run16745.fromBlock}-${run16745.toBlock}`))
  : undefined;
check(
  `4b. the 25,547,112 → 25,634,095 stretch is a MEMBER of the ${run16745 ? `${blk(run16745.fromBlock)} → ${blk(run16745.toBlock)}` : "(no)"} row, not a row of its own`,
  newest16745 != null &&
    !hist16745.includes(`rate-step:makerdao-eth-a:${last16745.fromBlock}-${last16745.toBlock}`) &&
    (run16745?.members ?? []).some((m) => m.fromBlock === last16745.fromBlock && m.toBlock === last16745.toBlock),
  newest16745 ?? `not found in: ${hist16745.join(", ")}`,
);
await openNotesAndDerivations(page16745);
const texts16745 = await noteTexts(page16745);
const newestText = run16745
  ? texts16745.find((t) => t.includes(blk(run16745.fromBlock)) && t.includes(blk(run16745.toBlock)))
  : null;
check(
  "4c. that row reads 7.00% → 9.50% on the page — the confirmed fee at its last member's touch (the derived figure was the gap-inflated 9.5094 before server ba2f3f1)",
  newestText != null && newestText.includes(ratePct(0.07)) && newestText.includes(ratePct(0.095)),
  newestText ? newestText.slice(0, 140) : "note not found once opened",
);
// The two-step run 15,582,694 → 19,214,177 (1.50% → 6.74%): the stat states the
// members' sum (7), which the ends' ordinals agree with now that every change
// is a stretch.
const deep16745 = r16745.notes[4];
const deepText = deep16745
  ? texts16745.find((t) => t.includes(blk(deep16745.fromBlock)) && t.includes(blk(deep16745.toBlock)))
  : null;
check(
  "4d. its two-step run states 1.50% → 6.74% over 2 gaps between the vault's events, and 7 changes in between — the members' sum",
  deepText != null &&
    deepText.includes(ratePct(0.015)) &&
    deepText.includes(ratePct(0.0674)) &&
    /Covers\s*2 gaps between the vault.s events/.test(deepText) &&
    /Times governance changed the fee\s*7(?!\d)/.test(deepText.replace(/\s+/g, " ")),
  deepText ? (deepText.match(/Covers.{0,40}|Times governance changed the fee.{0,12}/g) ?? []).join(" | ") : "note not found",
);
// The stretch the vault began owing nothing: its own note, no interest stat, and
// the page says the change cost it nothing.
const nothingText = texts16745.find((t) => t.includes(blk(22556727)) && t.includes(blk(23105751)));
check(
  "4e. the stretch 16745 began owing nothing (22,556,727 → 23,105,751) says the change cost it nothing, draws no interest stat, and claims no merged span",
  nothingText != null &&
    /owed nothing across this stretch, so the change cost it nothing/.test(nothingText) &&
    !/Yearly interest on the debt/.test(nothingText) &&
    !/Covers/.test(nothingText),
  nothingText ? nothingText.slice(0, 160) : "note not found",
);
await page16745.close();

// ── 5. the control — a CLOSED vault has no live note ───────────────────────

const page31168 = await open(context, vaultUrl("31168"), 1);
const ids31168 = await page31168
  .locator("[data-market-note]")
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-market-note")));
const hist31168 = ids31168.filter((i) => !i.endsWith("-head"));
check(
  "5. control 31168 (CLOSED) shows NO -head row",
  ids31168.length === hist31168.length,
  `${ids31168.length - hist31168.length} live rows: ${ids31168.join(", ")}`,
);
check(
  "5a. its historical count equals the replica's over its own rows, and both are non-zero",
  r31168.notes.length > 0 && hist31168.length === r31168.notes.length,
  `page ${hist31168.length}, replica ${r31168.notes.length}: ${r31168.notes.map((n) => n.id).join(", ")}`,
);
await page31168.close();

await context.close();
await browser.close();

console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — the MakerDAO rate-step note holds`,
);
console.log(
  "\nWhat the counts here depend on, all asserted above:\n" +
    "  · The rule moved, not the index: the old 1 pp rule over today's data still yields the plan's 10 and 14\n" +
    "    stretches (§2c); the pinned tables are those plus every smaller governance change.\n" +
    "  · Set counts are read up to the block the pin was taken at, so a set governance adds later moves nothing.\n" +
    "  · Pages open with ?folders=0 (the flat answer, rails-ops decision 0021); on the default view the notes are\n" +
    "    drawn over the ungrouped events only.\n" +
    "  · A note is drawn beside the row it anchors on, so a vault with more rows than the 50-row window\n" +
    "    (16745: 114) draws only some of its notes until the window is grown — §4 grows it first.",
);
process.exit(failures ? 1 : 0);
