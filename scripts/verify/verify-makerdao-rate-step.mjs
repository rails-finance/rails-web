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
// TWO PINS THIS FILE DELIBERATELY DEPARTS FROM, both stated at the check that
// departs (and in the run's own summary):
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
// claude-in-chrome cannot reach localhost — this script is the check.
// Run:  BASE=http://localhost:3611 node scripts/verify/verify-makerdao-rate-step.mjs
//       BASE=https://rails-web-onboarding.vercel.app node scripts/verify/verify-makerdao-rate-step.mjs
// Needs ALCHEMY_URL in .env.local (read, never printed).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createPublicClient, http, parseAbi, stringToHex } from "viem";
import { mainnet } from "viem/chains";

const BASE = process.env.BASE ?? "http://localhost:3000";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const RATE_STEP_MIN_PP = 1;
/** See the header: Maker's duty is a truncated per-second ray. */
const RATE_TRUNCATION_SLACK_PP = 1e-6;
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
 * route's own timeline, and the NOTES they merge into. `strict` drops the
 * truncation slack, so §2c can show what a knife-edge comparison would do to
 * the same data.
 *
 * `steps` is every stretch over the threshold; `notes` is what the page must
 * show, which since 2026-09-20 is `steps` put through the collapse.
 */
function computeNotes(events, sets, ilk, { strict = false } = {}) {
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

  const floor = strict ? RATE_STEP_MIN_PP : RATE_STEP_MIN_PP - RATE_TRUNCATION_SLACK_PP;
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

const WSTETH_B_LAST_TWO = [
  { ordinal: 31, block: 25193461, logIndex: 809, aprPct: 9.25 },
  { ordinal: 32, block: 25630785, logIndex: 276, aprPct: 10.25 },
];
/** The plan's own §1b table for vault 28699 — from/to/fees/Δ. PRE-COLLAPSE:
 *  these are the stretches, and the page has shown the runs they merge into
 *  since 2026-09-20. Reproduced row for row on that date, which is what rules
 *  index drift out of the count that moved (MERGED_28699). */
const STRETCHES_28699 = [
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
/** The plan's own §1b table for vault 16745, pre-collapse, likewise intact. */
const STRETCHES_16745 = [
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

/**
 * What the page shows: the tables above put through the collapse, re-pinned
 * 2026-09-20 from the two vaults that reproduce the pre-collapse tables
 * exactly. 28699's 10 stretches become 5 notes, 16745's 14 become 5.
 *
 * `sets` is the MEMBERS' SUM (the header's ⚠). `ordinalSpan` is what the two
 * ends' own ordinals would say — pinned beside it, not instead of it, and the
 * two differ on the two runs that skipped a sub-threshold pair: 16745's
 * five-step run (10 against 17, the 19,214,177 → 21,139,601 gap taking the
 * fee through seven resets no member states) and 28699's two-step run (8
 * against 10).
 */
const MERGED_28699 = [
  { from: 17278625, to: 19936166, fromPct: 0.75, toPct: 9.0, dpp: 8.25, steps: 3, sets: 10, ordinalSpan: 10 },
  { from: 19936166, to: 20323030, fromPct: 9.0, toPct: 8.0, dpp: -1.0, steps: 1, sets: 1, ordinalSpan: 1 },
  { from: 20394878, to: 21374251, fromPct: 8.0, toPct: 13.5, dpp: 5.5, steps: 1, sets: 4, ordinalSpan: 4 },
  { from: 21374251, to: 22158643, fromPct: 13.5, toPct: 6.75, dpp: -6.75, steps: 3, sets: 3, ordinalSpan: 3 },
  { from: 22676311, to: 25917081, fromPct: 6.75, toPct: 10.25, dpp: 3.5, steps: 2, sets: 8, ordinalSpan: 10 },
];
const MERGED_16745 = [
  { from: 11642230, to: 12078235, fromPct: 2.5, toPct: 5.5, dpp: 3.0, steps: 2, sets: 3, ordinalSpan: 3 },
  { from: 12563830, to: 13106460, fromPct: 5.5, toPct: 2.0, dpp: -3.5, steps: 1, sets: 2, ordinalSpan: 2 },
  { from: 15582694, to: 21391746, fromPct: 1.5, toPct: 12.75, dpp: 11.25, steps: 5, sets: 10, ordinalSpan: 17 },
  { from: 21588554, to: 22213537, fromPct: 12.75, toPct: 6.0, dpp: -6.75, steps: 3, sets: 3, ordinalSpan: 3 },
  { from: 22556727, to: 25634095, fromPct: 6.0, toPct: 9.5, dpp: 3.5, steps: 3, sets: 9, ordinalSpan: 10 },
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

const vaultUrl = (id) => `${BASE}/ethereum/makerdao/${id}`;

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
check(
  "0. WSTETH-B's rate log serves 32 sets and NO artefacts (its fold series is complete)",
  wsteth.sets.length === 32 && wsteth.artefacts.length === 0,
  `${wsteth.sets.length} sets, ${wsteth.artefacts.length} artefacts, ${wsteth.folds} folds`,
);
check(
  "0a. its last two sets are the pinned ones — 9.25 @ 25,193,461 log 809 and 10.25 @ 25,630,785 log 276",
  WSTETH_B_LAST_TWO.every((w, i) => {
    const s = wsteth.sets[wsteth.sets.length - 2 + i];
    return (
      s &&
      s.ordinal === w.ordinal &&
      s.block === w.block &&
      s.logIndex === w.logIndex &&
      near(s.aprPct, w.aprPct, 0.005)
    );
  }),
  wsteth.sets
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
const derivedCount = etha.sets.length + etha.artefacts.length;
check(
  "0c. ETH-A's walk yields the pinned 55 DERIVED sets",
  derivedCount === 55,
  `${etha.sets.length} served + ${etha.artefacts.length} artefacts = ${derivedCount}`,
);
// ⚠ DEPARTS FROM THE PIN (plan §1a: 53 sets, two artefacts). See the header.
check(
  "0d. ⚠ ETH-A serves 51 sets and FOUR artefacts — the plan pins 53 and two; the artefact rule catches two more (see 1c)",
  etha.sets.length === 51 && etha.artefacts.length === 4,
  `${etha.sets.length} sets, artefacts at ${etha.artefacts.map((a) => a.block).join(", ")}`,
);
check(
  "0e. both artefacts the plan DOES pin are there — 25,428,143 (derived 0.3712) and 25,430,354 (derived 8.5085), each confirming 8.50",
  [25428143, 25430354].every((b) => {
    const a = etha.artefacts.find((x) => x.block === b);
    return a && near(a.confirmedAprPct, 8.5, 0.01);
  }) &&
    near(etha.artefacts.find((a) => a.block === 25428143)?.derivedAprPct ?? 0, 0.3712, 0.01) &&
    near(etha.artefacts.find((a) => a.block === 25430354)?.derivedAprPct ?? 0, 8.5085, 0.01),
  etha.artefacts.map((a) => `${a.block} d=${a.derivedAprPct.toFixed(4)} c=${a.confirmedAprPct.toFixed(4)}`).join(" | "),
);
const ethaLast = etha.sets[etha.sets.length - 1];
check(
  "0f. ETH-A's newest set is 9.50 @ 25,596,295, and its DERIVED figure is the gap-inflated 9.5094",
  ethaLast.block === 25596295 && near(ethaLast.aprPct, 9.5, 0.005) && near(ethaLast.derivedAprPct, 9.5094, 0.005),
  `${ethaLast.block} confirmed ${ethaLast.aprPct.toFixed(6)} derived ${ethaLast.derivedAprPct.toFixed(4)}`,
);
const unknown = await fetch(`${BASE}/api/makerdao/ilks/NOPE-Z/rate-log`);
check("0g. an unknown collateral type is a 400, not an empty log", unknown.status === 400, `status ${unknown.status}`);

// ── 1. independent chain confirmation ──────────────────────────────────────
// The expected values here come from the chain, not from anything above.

const chain10_25 = await chainFeePct("WSTETH-B", 25630785);
const chain9_25 = await chainFeePct("WSTETH-B", 25193461);
const chainEthA = await chainFeePct("ETH-A", 25596295);
check(
  "1. the Jug's own duty at WSTETH-B's two newest set blocks is 10.25% and 9.25%",
  near(chain10_25, 10.25, 0.001) && near(chain9_25, 9.25, 0.001),
  `${chain10_25.toFixed(6)} @25630785, ${chain9_25.toFixed(6)} @25193461`,
);
check(
  "1a. the Jug's own duty at ETH-A's newest set block (25,596,295) is 9.50% — NOT the derived 9.5094",
  near(chainEthA, 9.5, 0.001),
  `${chainEthA.toFixed(6)}`,
);
check(
  "1b. the route's served figures ARE those chain reads",
  near(wsteth.sets.at(-1).aprPct, chain10_25, 1e-9) &&
    near(wsteth.sets.at(-2).aprPct, chain9_25, 1e-9) &&
    near(ethaLast.aprPct, chainEthA, 1e-9),
  `route ${ethaLast.aprPct} vs chain ${chainEthA}`,
);
// The departure at 0d, proved from the chain: the two extra artefacts read the
// SAME duty as the set before them, so they are not rate changes.
const extraA = await chainFeePct("ETH-A", 16976042);
const extraB = await chainFeePct("ETH-A", 16976256);
const beforeExtras = await chainFeePct("ETH-A", 16975705);
check(
  "1c. ⚠ the two artefacts beyond the pin are chain-confirmed non-changes — the Jug reads 1.50% at 16,975,705, 16,976,042 AND 16,976,256",
  near(extraA, beforeExtras, 1e-9) && near(extraB, beforeExtras, 1e-9) && near(extraA, 1.5, 0.001),
  `${beforeExtras.toFixed(6)} → ${extraA.toFixed(6)} → ${extraB.toFixed(6)}`,
);

// ── 2. the rule, replayed over the route data ──────────────────────────────

const tl28699 = await api("/api/makerdao/vault/28699/timeline");
const tl16745 = await api("/api/makerdao/vault/16745/timeline");
const tl31168 = await api("/api/makerdao/vault/31168/timeline");

const r28699 = computeNotes(tl28699.events, wsteth.sets, "WSTETH-B");
const r16745 = computeNotes(tl16745.events, etha.sets, "ETH-A");
const r31168 = computeNotes(tl31168.events, wsteth.sets, "WSTETH-B");

check(
  "2. vault 28699's 10 stretches match the plan's §1b table exactly (from/to/fees/Δ) — the pre-collapse table, still intact",
  tableMatches(r28699.steps, STRETCHES_28699),
  `${r28699.steps.length} stretches: ${r28699.steps.map((n) => `${n.fromBlock}→${n.toBlock} ${n.deltaPp.toFixed(2)}`).join(", ")}`,
);
check(
  "2a. vault 16745's 14 stretches match the plan's §1b table exactly, likewise",
  tableMatches(r16745.steps, STRETCHES_16745),
  `${r16745.steps.length} stretches: ${r16745.steps.map((n) => `${n.fromBlock}→${n.toBlock} ${n.deltaPp.toFixed(2)}`).join(", ")}`,
);
// ── 2e/2f. the collapse, replayed over those same stretches ────────────────
// Both tables above are the plan's, reproduced unchanged, so a count that has
// moved here has moved BECAUSE OF THE COLLAPSE and not because the index
// drifted under the pins. The runs, their members and their two ends are the
// collapse's own claim and are asserted before the page is ever opened.
check(
  "2e. 28699's 10 stretches merge into the 5 pinned runs (3, 1, 1, 3, 2 steps), each from its first member's earlier touch to its last member's later one",
  mergedMatches(r28699.notes, MERGED_28699) && r28699.notes.reduce((n, x) => n + x.steps, 0) === STRETCHES_28699.length,
  showMerged(r28699.notes),
);
check(
  "2e1. 16745's 14 stretches merge into the 5 pinned runs (2, 1, 5, 3, 3 steps) — the five-step run states 1.50% → 12.75%, +11.25 points",
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
// ⚠ The sum-vs-span trap, asserted as a difference rather than assumed away.
// Every check from here reads a note out of the replica BY POSITION. A wrong
// merge leaves those positions empty, and an empty position must go red like
// any other wrong answer — never throw, or the run is a CRASH and the other
// fifty checks are lost with it.
const sumVsSpan = (notes, want) =>
  want.every((w, i) => notes[i]?.sets === w.sets && notes[i]?.ordinalSpan === w.ordinalSpan);
const skipped16745 = r16745.notes[2]; // the five-step run, 15,582,694 → 21,391,746
const skipped28699 = r28699.notes[4]; // the two-step run, 22,676,311 → 25,917,081
check(
  "2f. ⚠ setsBetween on a merged note is the MEMBERS' SUM, not the two ends' ordinal difference: 16745's five-step run sums 10 where its ends are 17 apart, 28699's two-step run 8 where they are 10",
  sumVsSpan(r28699.notes, MERGED_28699) &&
    sumVsSpan(r16745.notes, MERGED_16745) &&
    skipped16745?.sets === 10 &&
    skipped16745?.ordinalSpan === 17 &&
    skipped28699?.sets === 8 &&
    skipped28699?.ordinalSpan === 10,
  `16745 run×5 sum ${skipped16745?.sets} vs span ${skipped16745?.ordinalSpan}; 28699 run×2 sum ${skipped28699?.sets} vs span ${skipped28699?.ordinalSpan}`,
);
// The interest slice on a merged note: the FIRST member's debt, held fixed and
// priced at the two ENDS' fees — not the last member's debt, and not a sum.
const run28699 = r28699.notes[4]; // 22,676,311 → 25,917,081, two steps
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
  "2b. 16745's newest stretch reads 8.50% → 9.50%, Δ 1.00 points — the confirmed figures, NOT the derived 8.5085 → 9.5094 (Δ 1.0009)",
  last16745 &&
    near(last16745.rateA * 100, 8.5, 0.005) &&
    near(last16745.rateB * 100, 9.5, 0.005) &&
    ppMagnitude(last16745.deltaPp) === "1.00 points",
  last16745
    ? `${(last16745.rateA * 100).toFixed(4)} → ${(last16745.rateB * 100).toFixed(4)}, ${ppMagnitude(last16745.deltaPp)}`
    : "no stretch",
);
// ⚠ The threshold departure, proved by breaking it: a strict `≥ 1 pp` on the
// confirmed figures drops two of the plan's own pinned stretches. Read at the
// STRETCH level, because the collapse hides it: both dropped stretches sit
// inside runs that survive without them, so a strict comparison yields the
// same FIVE notes and the note count alone would never show the loss.
const strict16745 = computeNotes(tl16745.events, etha.sets, "ETH-A", { strict: true });
const droppedStrict = STRETCHES_16745.filter(
  ([from, to]) => !strict16745.steps.some((n) => n.fromBlock === from && n.toBlock === to),
).map(([from, to]) => `${from}→${to}`);
check(
  "2c. ⚠ a STRICT ≥1pp on the confirmed fees would drop exactly two pinned stretches (21219604→21339612 and 23105773→24685938) — which is why the 1e-6 pp truncation slack exists",
  strict16745.steps.length === 12 &&
    droppedStrict.length === 2 &&
    droppedStrict.includes("21219604→21339612") &&
    droppedStrict.includes("23105773→24685938"),
  `strict yields ${strict16745.steps.length} stretches; dropped ${droppedStrict.join(", ") || "(none)"}`,
);
check(
  "2c1. ⚠ and the collapse MASKS that loss — strict still merges to 5 notes, so the slack has to be asserted over stretches, never over the note count",
  strict16745.notes.length === r16745.notes.length && strict16745.notes.length === 5,
  `strict merges to ${strict16745.notes.length}, lenient to ${r16745.notes.length}`,
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

// ── 3. vault 28699 — the fixture with the flat live note ───────────────────

const chain28699 = await api("/api/chain/makerdao/vault/28699");
const live28699 = chain28699.state;

const page = await open(context, vaultUrl("28699"), 6);
// 43 rows today, under the 50-row window, so this is a no-op — until the
// vault is touched eight more times, when it would quietly stop being one.
const expanded28699 = await showAllRows(page);
const ids28699 = await page
  .locator("[data-market-note]")
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-market-note")));
const hist28699 = ids28699.filter((i) => !i.endsWith("-head"));
const head28699 = ids28699.filter((i) => i.endsWith("-head"));
check(
  "3. 28699 shows the 5 pinned historical rows — its 10 stretches merged — and exactly ONE -head row, with every timeline row drawn",
  expanded28699 && hist28699.length === MERGED_28699.length && head28699.length === 1,
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
// 2026-09-10: the header states the LATER fee, not the move — and on a flat
// live note the later fee IS 10.25%, so the row's own figure is the assertion
// here; the move ("0.00 points") moved into the panel under the fee card.
check(
  "3c. the live row states 10.25% — the vault route's own stabilityFeeApr — and it RENDERS despite a flat move",
  headFlat.includes(ratePct(0.1025)) && !/\bpp\b/.test(headFlat) && near(live28699.stabilityFeeApr * 100, 10.25, 0.01),
  `head row "${headFlat.slice(0, 120)}"; route stabilityFeeApr ${live28699.stabilityFeeApr}`,
);
const opened = await openNotesAndDerivations(page);
check(
  "3e. every Maker note on 28699 opens and stays open across the poll",
  opened.total === 6 && opened.open === opened.total,
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
  "3d. the live row states a block within 200 of the vault route's own atBlock, re-read in this run",
  live28699.atBlock > 0 && headStated != null && Math.abs(headStated - live28699.atBlock) < 200,
  `row states ${headStated ?? "(none)"}, route atBlock ${live28699.atBlock}, blockTimestamp ${live28699.blockTimestamp}`,
);
check(
  "3d1. the live row carries an Elapsed figure — only possible because the overlay returns the head block's own timestamp",
  /Elapsed/.test(openHead) && live28699.blockTimestamp > 1_700_000_000,
  `Elapsed ${/Elapsed/.test(openHead)}, blockTimestamp ${live28699.blockTimestamp}`,
);

const pinned = r28699.notes[r28699.notes.length - 1]; // the merged run 22,676,311 → 25,917,081
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
check(
  "3g. its derivation names the drip the later fee was evidenced by — block 25,630,785, the set in force at the run's LAST member's later touch",
  pinnedText != null && pinnedText.includes(blk(25630785)),
  pinnedText ? `wanted "${blk(25630785)}"` : "",
);

// ── 3i–3k. the three surfaces a merged row owes its members ────────────────
// A merged row states a span no single member states, so if the members are
// not recoverable the row is a claim without its proof. §9 names the three
// (web 8dc12ab4 built them for Maker): the "Stated over N" stat, the
// derivation prose, and the receipt's step list. §3k is the receipt, asserted
// against the export down at §7 where the clipboard text is read.
check(
  `3i. the merged row carries the "Stated over" stat — ${pinned.steps} of the vault's touches`,
  pinnedText != null &&
    /Stated over/.test(pinnedText) &&
    new RegExp(`${pinned.steps} of the vault.s touches`).test(pinnedText),
  pinnedText ? (pinnedText.match(/Stated over.{0,40}/)?.[0] ?? "no Stated over stat") : "note not found",
);
check(
  `3i1. and its "Fee resets in between" stat states the members' SUM (${pinned.sets}), not the ${pinned.ordinalSpan} its two ends' ordinals span`,
  pinnedText != null &&
    /Fee resets in between/.test(pinnedText) &&
    new RegExp(`Fee resets in between\\s*${pinned.sets}(?!\\d)`).test(pinnedText.replace(/\s+/g, " ")),
  pinnedText ? (pinnedText.match(/Fee resets in between.{0,20}/)?.[0] ?? "no resets stat") : "note not found",
);
check(
  "3j. the derivation prose says how far apart the two ends are in this vault's own touches, and that a step the other way ends the run",
  pinnedText != null &&
    new RegExp(`${pinned.steps} of this vault.s touches apart`).test(pinnedText) &&
    /step the other way ends the run/i.test(pinnedText),
  pinnedText
    ? (pinnedText.match(/.{0,30}of this vault.s touches apart.{0,60}/)?.[0] ?? "no merged prose")
    : "note not found",
);
// The silence on a row that merged nothing — the same surfaces must not claim
// a span on a single stretch. 19,936,166 → 20,323,030 is one step.
const solo = r28699.notes.find((n) => n.steps === 1);
const soloText = solo ? openTexts.find((t) => t.includes(blk(solo.fromBlock)) && t.includes(blk(solo.toBlock))) : null;
check(
  `3k. the unmerged ${solo ? `${blk(solo.fromBlock)} → ${blk(solo.toBlock)}` : "(none on the page)"} row claims no merged span at all`,
  solo != null &&
    soloText != null &&
    !/Stated over/.test(soloText) &&
    !/of (?:this|the) vault.s touches/.test(soloText),
  soloText
    ? (soloText.match(/Stated over.{0,40}|of th\w+ vault.s touches/)?.[0] ?? "silent, as it must be")
    : "note not found",
);
/** The toolbar pill's text, or "" where the page shows no pill at all — a
 *  missing pill is a RED check, never a thrown run. */
const pillText = async (p) => {
  const l = p.getByRole("button", { name: /^Market notes/i }).first();
  return (await l.count()) ? ((await l.textContent()) ?? "").trim() : "";
};
const pill = page.getByRole("button", { name: /^Market notes/i }).first();
check(
  '3h. the toolbar pill reads "Market notes · 6" — the 5 merged rows and the live one',
  (await pillText(page)) === "Market notes · 6",
  `"${await pillText(page)}"`,
);

// ── 6. the pill hides every note, and no count moves ───────────────────────

const notesBefore = await page.locator("[data-market-note]").count();
const rowsBefore = await page.locator("[data-event-id]").count();
let afterHidden = -1;
let rowsAfter = -1;
let pressed = null;
let restored = -1;
if (await pill.count()) {
  await pill.click();
  await page.waitForTimeout(600);
  afterHidden = await page.locator("[data-market-note]").count();
  rowsAfter = await page.locator("[data-event-id]").count();
  pressed = await pill.getAttribute("aria-pressed");
  await pill.click();
  await page.waitForTimeout(600);
  restored = await page.locator("[data-market-note]").count();
}
check(
  "6. toggling the pill hides every note row, flips aria-pressed, and moves no event count",
  notesBefore === 6 && afterHidden === 0 && rowsBefore === rowsAfter && pressed === "false",
  `${notesBefore} notes before, ${afterHidden} after, rows ${rowsBefore} → ${rowsAfter}, aria-pressed ${pressed}`,
);
check("6a. toggling back restores all 6", restored === 6, `${restored}`);
const eyeItem = await page.getByRole("button", { name: /^Market notes$/i }).count();
check('6b. the eye menu has no "Market notes" item (the pill owns it)', eyeItem === 0, `${eyeItem} found`);

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
  '7. the export states "Market notes: 6", lists 6 with receipts, and adds no row to the event table',
  /\*\*Market notes:\*\*\s*6\b/.test(md) &&
    (md.match(/^- Receipt: rate before/gm) ?? []).length === 6 &&
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
// counted: at rest the page draws only the 3 rate-step rows whose anchors fall
// in the newest 50 rows, while the pill counts all 6. Note the order — the
// wantNotes poll would spend its whole budget waiting for rows the window is
// holding back.
const page16745 = await open(context, vaultUrl("16745"), 0);
const windowedNotes16745 = await page16745.locator("[data-market-note]").count();
const windowedPill16745 = await pillText(page16745);
const expanded16745 = await showAllRows(page16745);
const ids16745 = await page16745
  .locator("[data-market-note]")
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-market-note")));
const hist16745 = ids16745.filter((i) => !i.endsWith("-head"));
check(
  "4. 16745 shows 5 historical rows — its 14 stretches merged — and one -head row, once every row of its 114 is drawn",
  expanded16745 && hist16745.length === MERGED_16745.length && ids16745.length - hist16745.length === 1,
  `${hist16745.length} historical, ${ids16745.length - hist16745.length} live: ${hist16745.join(", ")}`,
);
check(
  "4a1. before the window is grown the page draws only 4 of those 6 rows while the pill already states 6 — the pill counts the timeline, the DOM counts the window",
  windowedNotes16745 === 4 && windowedPill16745 === "Market notes · 6",
  `${windowedNotes16745} row(s) drawn against pill "${windowedPill16745}"`,
);
check(
  '4a. its pill reads "Market notes · 6"',
  (await pillText(page16745)) === "Market notes · 6",
  `"${await pillText(page16745)}"`,
);
// The 25,547,112 → 25,634,095 stretch is now the LAST member of the run that
// ends at 25,634,095, so it is no longer a row of its own: the page states the
// run, and the stretch has to be recoverable from it rather than visible.
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
  "4c. that row's later fee reads 9.50% on the page — the confirmed fee at its last member's touch, not the gap-inflated derived 9.5094",
  newestText != null && newestText.includes(ratePct(0.06)) && newestText.includes(ratePct(0.095)),
  newestText ? newestText.slice(0, 140) : "note not found once opened",
);
// The five-step run, and the trap on its own page: the stat states the
// members' sum (10), not the 17 its two ends' ordinals span.
const deep16745 = r16745.notes[2];
const deepText = deep16745
  ? texts16745.find((t) => t.includes(blk(deep16745.fromBlock)) && t.includes(blk(deep16745.toBlock)))
  : null;
check(
  "4d. its five-step run states 1.50% → 12.75% over 5 of the vault's touches, and 10 fee resets in between — the members' sum, not the 17 its ends span",
  deepText != null &&
    deepText.includes(ratePct(0.015)) &&
    deepText.includes(ratePct(0.1275)) &&
    /5 of the vault.s touches/.test(deepText) &&
    /Fee resets in between\s*10(?!\d)/.test(deepText.replace(/\s+/g, " ")),
  deepText ? (deepText.match(/Stated over.{0,60}|Fee resets in between.{0,12}/g) ?? []).join(" | ") : "note not found",
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
  "\nTwo pins this run departs from, both proved from the chain above:\n" +
    "  · ETH-A serves 51 sets / 4 artefacts (plan §1a pins 53 / 2) — check 1c reads the Jug at the two\n" +
    "    extra artefact blocks and finds the same duty as the set before them. The plan's 55 DERIVED holds.\n" +
    "  · The 1 pp threshold carries a 1e-6 pp truncation slack — check 2c shows a strict comparison drops\n" +
    "    two of the plan's own 14 pinned stretches on 16745.",
);
console.log(
  "\nAnd two things the counts here depend on, both asserted above:\n" +
    "  · The tables are pinned TWICE — the plan's stretches (§2/§2a, unchanged since 2026-09-06) and the runs\n" +
    "    they merge into (§2e/§2e1). A count that moves with the stretches intact moved with the collapse.\n" +
    "  · A note is drawn beside the row it anchors on, so a vault with more rows than the 50-row window\n" +
    "    (16745: 114) draws only some of its notes until the window is grown — §4 grows it first.",
);
process.exit(failures ? 1 : 0);
