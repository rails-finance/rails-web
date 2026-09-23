#!/usr/bin/env node
// A folder carries what the page reduces over — the grouped answer and the
// ungrouped one reduce to the same history.
// ----------------------------------------------------------------------------
// Subject: leg B of the `0019` timeline-windowing programme. A served folder
// stands for members the page never receives, so every whole-history figure the
// page reduces over `opening + rows` used to be short by whatever the folders
// held. The wire now carries each folder's own arithmetic — `flows`, `actors`,
// `byDay`, in the opening balance's own shapes — and
// `lib/shared/timeline-folder-reductions.ts` merges it as the third contributor
// to the same partition.
//
//   summary  (block < cutoffBlock)  ·  ungrouped events  ·  folder members
//
// The three are disjoint and exhaustive, so every merge is an ADDITION. Nothing
// here relaxes the exclusive cut: both reads below are taken above the same
// `cutoffBlock` and the summary half is not touched.
//
// ── WHERE THE EXPECTATIONS COME FROM ───────────────────────────────────────
// GROUPED VERSUS UNGROUPED, IN THE SAME RUN. The position is live: it gains
// events between runs, so every figure in it rots. Not one number below is
// pinned — the UNGROUPED read IS the expectation, fetched second with the
// event count the grouped read just reported, and the two are compared to the
// base unit, to the actor and to the day. What IS pinned is SHAPE (`F0*`): an
// arm's fixture must still bury most of its window in folders and still hide
// whole days inside them, or the comparison is true and means nothing. A guard
// that trips says the FIXTURE drifted — it is not a finding about the code, and
// that arm's comparisons are skipped rather than reported red. The OTHER arm
// still runs.
//
// ── THE TWO ARMS, AND WHY THEY ARE NOT ONE ARM TWICE ───────────────────────
// Both families serve folders through the same route code and the same web
// merge, so a single arm would prove the merge once and the wire once. They are
// here because their fixtures have DIFFERENT SHAPES, and the shapes are what
// the checks actually run over:
//
//   aave-v3  THE THREE-WAY PARTITION. ~10k events, a cut with a summary below
//            it, ~74 % of the served window in folders and ~26 % standing
//            alone. Folder kinds `transfer` and `liquidation`. This is the arm
//            where P1 has singletons to replay event for event, and where the
//            merge is one of three contributors.
//
//   spark    THE FOLDERS ARE THE WHOLE ANSWER. 2,776 events, no cut at all
//            (the history fits the window, so there is no summary half), and
//            EVERY row of it inside a folder — 28 folders, 0 singletons, 377
//            days of which not one has an ungrouped row. Folder kind `mixed`,
//            which the Aave arm never produces. On this arm the merged
//            reduction has exactly one contributor, so a merge that silently
//            dropped the folders would draw an EMPTY heatmap rather than a
//            short one.
//
// Run one with `FIXTURES=spark`. Measured 2026-09-12; the `0xb137e7…` fixture
// is SparkLend's deepest folder-borne window — the whole 11,766-position roster
// has five positions carrying a folder at all, and this is the only one with
// more than seven.
//
// ── WHAT IS VACUOUS HERE, AND WHY IT IS NOT A DEFECT ───────────────────────
// Measured on the aave-v3 arm 2026-09-12, before any of this was built:
//
//   • The ACTOR split cannot lose an event. The index sets `pool_caller` on
//     supply / borrow / repay rows only, and `externalActor` answers null
//     without it. The Aave family's two folder specs match `liquidation` and
//     `transfer_in`/`transfer_out` rows — exactly the rows that carry no
//     caller — so no folder member can ever be attributed to a third party.
//   • The lifetime TOWER cannot lose an amount. `AAVE_FAMILY_FLOWS` excludes
//     transfers (an aToken move is a custody change, not a flow), so a transfer
//     folder contributes nothing; and the liquidation spec has never fired on
//     this index — across the 90 most-liquidated Aave V3 and Spark positions,
//     1,144 liquidation rows, the longest run of consecutive liquidation rows
//     is 1. Every liquidation is immediately preceded by its own seized-aToken
//     `transfer_out` in the same transaction, so a keeper's sweep reads
//     `transfer_out, liquidation, transfer_out, …` and matches neither spec's
//     `min: 4`.
//
// The spark arm is vacuous there for a plainer reason: all 2,776 of its events
// are transfers, so there is no flow to carry and no caller to judge.
//
// So `R3`–`R6b` are written to compare, and they WILL go red if a folder ever
// carries a wrong flow or a wrong actor — but on both arms they compare zero
// against zero. They report VACUOUS rather than PASS, and are counted apart
// from the passes, because a green line there would claim coverage it does not
// have. Their real proof is the server's unit tests over synthetic runs
// (`rails-server-onboarding/api/src/services/timeline-folders.test.ts` — a
// liquidation run of 4, a transfer run of 4, a family with no `flowsOf`, a
// folder spanning a month boundary). Do not "fix" a check that is VACUOUS for
// a reason; if one turns into a PASS, that arm gained a shape it never had.
//
// The DAY histogram is the live gap and it is large: 2,198 of 2,967 served
// events inside folders on aave-v3 (81 of 150 days have no ungrouped row), and
// all 2,776 of 2,776 on spark (377 of 377 days). `R1`, `R2`, `H1`, `H2` and
// `H3` are the checks that can fail today.
//
// ── THE THREE WHOLE-HISTORY CLAIMS ON THE PAGE, EACH WITH ITS OWN CHECK ────
// Settled 2026-09-12, after the audit found a fourth reduction the plan had not
// named: each of these is a SEPARATE reduction over the same partition, so an
// arm that watches one cannot see the others break.
//
//   H1  the heatmap grid          — the density a reader looks at
//   H2  the export menu's note    — "… lists 50 of N events"
//   H3  the Markdown transcript   — the snapshot's own heading and row count
//
// H3 opens the clipboard payload, which is why it is here rather than left as
// "not on the page": the arm grants clipboard permission, presses Copy
// Position, and reads what was actually written.
//
// ── PROVED IT CAN FAIL, 2026-09-12, BASE=http://localhost:3000 ─────────────
// Restored run: see the tally at the foot of a green run. Every break was
// applied ALONE, to the web repo (the index is deployed, so nothing here breaks
// it), and reverted. The lines below are the run's own output, quoted, and
// unless an arm is named they are the aave-v3 arm's.
//
//  (a) THE WIRE STOPS CARRYING THE DAYS — `byDay: []` in `toServedFolder`
//      (lib/sources/api/timeline-folder-wire.ts), which is what the page saw
//      before leg B.
//      FAIL R1 — "41 of 41 folders disagree (e.g. folder
//                 transfer:transfer_out:0x5c647ce0ae10… (14 members over 1
//                 day(s)): folder states no day at all)"
//      FAIL R2 — "100 day(s) the ungrouped read has and the grouped merge does
//                 not (e.g. 2025-11-20: 10 vs 24, 2025-11-24: 13 vs 17,
//                 2025-11-26: 3 vs 37), 0 the other way"
//      FAIL H1 — "grouped draws 7,847 events over 39 months, flat draws 10,045
//                 — 10 month(s) differ (e.g. 2025-11: 252 vs 371, 2026-01: 175
//                 vs 722, 2026-02: 4 vs 142)"
//      🔑 7,847 = 10,045 − 2,198. H1 is the end-to-end one: what the wire stops
//      carrying is events missing from the grid a reader looks at.
//
//  (b) THE PAGE STOPS MERGING THEM — `folderDays()` counting every bucket as
//      zero (lib/shared/timeline-folder-reductions.ts). The wire is intact;
//      the merge is not.
//      FAIL H1 — same numbers as (a).
//      🔑 R1 and R2 stayed GREEN, and that is exactly why H1 exists beside
//      them: the wire arm reads the folders' own arithmetic and cannot see a
//      merge that never happened.
//
//  (c) THE SAME DAYS COUNTED TWICE — `folderDays()` doubling every bucket.
//      FAIL H1 — "grouped draws 12,243 events over 39 months, flat draws 10,045
//                 — 10 month(s) differ (e.g. 2025-11: 490 vs 371, 2026-01:
//                 1,269 vs 722, 2026-02: 280 vs 142)"
//
//  (d) A FOLDER'S MEMBER COUNT OFF BY ONE — `count: folder.count - 1` in
//      `toServedFolder`.
//      FAIL P1  — "plan event 1: grouped supply:0x87870bca…:44 ≠ ungrouped
//                  transfer_in:0x98c23e9d…:33"
//      FAIL P2  — "folder transfer:transfer_out:0x5c647ce0ae10… claims ordinals
//                  7,079–7,092 (14) at stream position 7,079, count 13"
//      FAIL R1  — "41 of 41 folders disagree (e.g. … (13 members over 1 day(s)):
//                  0 day(s) short, 1 over (e.g. 2025-11-20 14 13))"
//      FAIL R6a — "grouped total 2,926 (769 standing alone + 2,157 inside
//                  folders), ungrouped 2,967"
//      🔑 R3 AND R5 — VACUOUS on a restored run — WENT RED HERE, because the
//      drifting cursor pulled flow-bearing and third-party-acted events into
//      folders that do not hold them. That is the standing proof that the two
//      are live comparisons rather than dead code waiting for a shape that
//      never comes. (The tally's denominator moves with them: a check that
//      stops being vacuous joins the count.)
//      🔑 R2 stayed GREEN: each folder's own `byDay` is untouched, so the
//      merged day histogram still matches. A miscount is seen by the PARTITION
//      checks, which is why they are separate checks and not a clause of R1.
//
//  (e) A FABRICATED FLOW — every folder given one extra `USDC|supplied` leg of
//      1,000,000 in `toServedFolder`. (--wire-only)
//      FAIL R3 — "41 disagreement(s) (e.g. folder transfer:transfer_out:0x5c64…
//                 USDC|supplied: folder 1000000, members 0)"
//      FAIL R4 — "1 bucket(s) differ (e.g. USDC|supplied: grouped
//                 21050171403763, ungrouped 21050130403763)"
//      🔑 41 × 1,000,000 on a 21-trillion-base-unit leg, caught to the unit —
//      and both checks report PASS/FAIL rather than VACUOUS the moment a folder
//      carries a flow at all.
//
//  (f) A FABRICATED ACTOR — every folder given `external: 1` and one actor.
//      (--wire-only)
//      FAIL R5  — "82 disagreement(s) (e.g. folder transfer:transfer_out:0x5c64…
//                  external 1, members 0)"
//      FAIL R6b — "2 disagreement(s) (e.g. external 370 vs 329 ·
//                  0x0000000000000000000000000000000000000bad: 41 vs 0)"
//
//  (g) THE GUARDS, one at a time, on the restored build — each SKIPS that arm's
//      comparisons under "⚠ THE FIXTURE DRIFTED … they would be true and would
//      mean nothing", and the other arm still runs:
//      FAIL F0a — `folders` floor 500: "grouped=true, 810 rows, 41 folders
//                  (floor 500)"
//      FAIL F0b — `totalEvents` floor 100,000: "10,045 events in the history
//                  (floor 100,000), 2,198 of 2,967 served inside folders"
//      FAIL F0c — the ungrouped read pointed at `recent=1000` instead of the
//                  grouped answer's own count: "cutoffBlock 23,840,412 /
//                  25,035,114, 1,001 ungrouped events for 2,967 served"
//      FAIL F0d — `dayGap` floor 200: "folders hide 81 day(s) from the
//                  ungrouped stream, floor 200"
//
//  (h) THE EXPORT NOTE STOPS COUNTING THE MEMBERS — `markdownHistoryScope` and
//      `exportScopeNote` called without `servedFolders` at the Aave V3 call
//      site, which is the state leg B shipped in before the 2026-09-12 audit.
//      FAIL H2 — "grouped states 7,847, flat states 10,045, the position has
//                 10,045 — grouped note: \"… lists the most recent 50 of 7,847
//                 events; the CSV downloads the whole history.\""
//      FAIL H3 — the same total, in the snapshot's own heading.
//      🔑 H1 stayed GREEN. The heatmap reduction was moved in leg B and this one
//      was not, so an arm that only watches the grid cannot see it — which is
//      the general lesson: each whole-history claim on the page needs its own
//      check, because they are separate reductions over the same partition.
//
//  (i) THE TRANSCRIPT GOES BACK TO CALLING ITS ROWS A TAIL — the
//      `history.folderMembers > 0` branch removed from `markdownTimelineSlice`
//      (lib/shared/markdown-history.ts), so a grouped snapshot numbers its rows
//      as if they were the last 50 of the history and says nothing about the
//      members it could not list.
//      FAIL H3 — "grouped heading names no event(s) inside collapsed groups, the
//                 answer holds 2,198 · grouped heading calls its rows a tail of
//                 the history — \"last 50 of 10,045 events, oldest first\" ·
//                 grouped transcript numbers its first row 9,996, claiming a
//                 place in the history its rows do not have". 11/12 (aave-v3).
//      🔑 H1 AND H2 stayed GREEN. Three claims, three checks — the third one is
//      the reason the transcript stopped being "not covered".
//
//  (j) A WHOLE WINDOW LETS `events` ANSWER FOR ITSELF AGAIN — the whole-window
//      branch of `markdownHistoryScope` returning nothing whatever the folders
//      hold, which is the state the default flip was about to ship in. The
//      spark arm found it; the aave-v3 arm cannot, because its fixture has a
//      cut and never takes that branch. 10/12 (spark).
//      FAIL H2 — "grouped states 0, flat states 2,776, the position has 2,776 —
//                 grouped note: (none drawn)"
//      FAIL H3 — "grouped heading states 0, flat states 2,776, the position has
//                 2,776 · grouped heading names no event(s) inside collapsed
//                 groups, the answer holds 2,776"
//      🔑 H1 stayed GREEN — the grid takes `folderDays` through its own input
//      and never asked the Markdown helper. And the first run of this break
//      did not report H2 at all: the arm waited 60 s for a note the broken
//      build never draws and crashed. The note is read as optional since, so
//      an absent claim is reported as the defect it is.
//
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const WIRE_ONLY = process.argv.slice(2).includes("--wire-only");
const FIXTURES = (process.env.FIXTURES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** The arms. Each states its own fixture, its own reads, and its own SHAPE
 *  floors — the floors are what make a comparison mean something, and the two
 *  fixtures do not have the same shape (see the header). Every floor sits well
 *  under what was measured on 2026-09-12, so ordinary growth never trips one.
 *  A trip means the position stopped being the thing this script reads. */
const ARMS = [
  {
    key: "aave-v3",
    label: "Aave V3 · Ethereum · market=core · 0xee7c…2954",
    api: (qs) => `${BASE}/api/aave-v3/timeline?wallet=0xee7ca610d896c53ffe716b801c05748efd902954&market=core&${qs}`,
    // `?folders=` is explicit in BOTH directions. Grouping is the default since
    // 2026-09-12, so the flat arm must ASK to be flat — a bare URL would open
    // two grouped pages and compare a thing with itself.
    pageUrl: (grouped) =>
      `${BASE}/ethereum/aave-v3/0xee7ca610d896c53ffe716b801c05748efd902954?market=core&folders=${grouped ? "1" : "0"}`,
    // Restated 2026-09-14 when a paired CoW swap became ONE event (rails-ops
    // TO-DO-ui-jobs §15): this wallet's 579 swaps each merge two rows, and their
    // legs no longer sit inside transfer folders. Measured then: 9,466 events,
    // 1,678 of 2,598 served inside folders (65 %), 44 hidden days. Restated
    // again for ParaSwap (mig 248): its 1,852 ParaSwap swaps each merge two rows
    // and 625 leftover rows net into their legs, 2,477 fewer: 6,989 events.
    floors: { totalEvents: 5_500, folders: 30, inFolderShare: 0.5, dayGap: 30 },
  },
  {
    key: "spark",
    label: "SparkLend · Ethereum · 0xb137…ece5",
    api: (qs) => `${BASE}/api/spark/timeline?wallet=0xb137e7d16564c81ae2b0c8ee6b55de81dd46ece5&${qs}`,
    pageUrl: (grouped) =>
      `${BASE}/ethereum/spark/0xb137e7d16564c81ae2b0c8ee6b55de81dd46ece5?folders=${grouped ? "1" : "0"}`,
    // This fixture's whole history fits its window, so there is no summary half
    // and no singleton: the in-folder share is 1.00 and every day is hidden.
    // The floors say so rather than reusing the other arm's.
    floors: { totalEvents: 2_000, folders: 15, inFolderShare: 0.5, dayGap: 100 },
  },
];

const arms = FIXTURES.length ? ARMS.filter((a) => FIXTURES.includes(a.key)) : ARMS;
if (!arms.length) {
  console.log(`No arm matches FIXTURES=${process.env.FIXTURES}. Known arms: ${ARMS.map((a) => a.key).join(", ")}`);
  process.exit(1);
}

// ── the reductions, this script's own statement of them ─────────────────────
// Transcribed from the SQL and the web helper that own them, NOT imported from
// the module under test: a check that read its expectation off the code it
// checks cannot see a change to either. SparkLend is an Aave fork and its rows
// arrive in the same shapes, so one transcription serves both arms.

/** `AAVE_FAMILY_FLOWS`' `CASE` over the four Pool actions (timeline-summary.ts).
 *  `transfer_in`/`transfer_out` are absent on purpose — an aToken move is a
 *  custody change, not a flow — which is why a transfer folder's `flows` is
 *  `[]` and not null. */
const POOL_LEG = { supply: "supplied", withdraw: "withdrawn", borrow: "borrowed", repay: "repaid" };

/** One event's contribution to the lifetime tower, keyed the way the merged
 *  buckets are keyed on the page: by DISPLAY SYMBOL, because `toServedFolder`
 *  resolves a folder's `tokenAddress` flow keys through the same ERC20 resolver
 *  that named the rows' symbols in the same response. A row whose asset has no
 *  symbol is returned as `unkeyable` rather than bucketed under `undefined` —
 *  two unresolved assets must never merge into one bucket. */
function flowsOf(event) {
  const d = event.context?.data ?? {};
  const out = [];
  const unkeyable = [];
  const push = (key, leg, amount) => {
    if (amount == null) return;
    if (!key) return unkeyable.push(`${event.id} ${leg}`);
    out.push({ key, leg, amount: String(amount) });
  };
  if (event.actionType === "liquidation") {
    // `debtKey` upstream is `coalesce(debt_asset, reserve)`, and the wire's
    // `reserveSymbol` on a liquidation is that same coalesce already resolved.
    push(d.reserveSymbol, "liquidatedDebt", d.raw?.debtToCover);
    push(d.collateralSymbol, "liquidatedCollateral", d.raw?.liquidatedCollateralAmount);
    return { out, unkeyable };
  }
  const leg = POOL_LEG[event.actionType];
  if (leg) push(d.reserveSymbol, leg, d.raw?.amount);
  return { out, unkeyable };
}

/** `<symbol>|<leg>` → base units, summed with BigInt. No float touches a flow. */
function reduceFlows(events) {
  const legs = new Map();
  const unkeyable = [];
  for (const e of events) {
    const { out, unkeyable: bad } = flowsOf(e);
    unkeyable.push(...bad);
    for (const f of out) {
      const id = `${f.key}|${f.leg}`;
      legs.set(id, (legs.get(id) ?? 0n) + BigInt(f.amount));
    }
  }
  return { legs, unkeyable };
}

/** The folders' carried flows, in the same `<symbol>|<leg>` shape. NULL means
 *  the family declares no flow reduction at all; `[]` means the members
 *  produced none. Neither contributes, and they are counted apart because they
 *  are different claims. */
function foldersFlows(folders) {
  const legs = new Map();
  let nullFlows = 0;
  for (const f of folders) {
    if (f.flows == null) {
      nullFlows++;
      continue;
    }
    for (const b of f.flows) {
      for (const [leg, amount] of Object.entries(b.legs ?? {})) {
        const id = `${b.key}|${leg}`;
        legs.set(id, (legs.get(id) ?? 0n) + BigInt(amount));
      }
    }
  }
  return { legs, nullFlows };
}

/** `externalActor` (lib/shared/external-actor.ts) transcribed: third-party-acted
 *  exactly when the owner is NEITHER the signer NOR the Pool's msg.sender, and
 *  the actor named is the SIGNER. Either fact alone over-marks. */
function actorOf(event, wallet) {
  const d = event.context?.data ?? {};
  if (!d.txFrom || !d.poolCaller) return null;
  const w = wallet.toLowerCase();
  if (d.txFrom === w || d.poolCaller === w) return null;
  return d.txFrom;
}

/** ⚠️ A ROW'S OWN OWNER, NOT THE QUERIED ONE. `toTimelineWire` hoists the
 *  common wallet to the envelope (`wire.w`) and leaves a row that differs its
 *  own `w` — a timeline can carry rows where the queried wallet acted on
 *  someone else's position, and judging those against the envelope's wallet
 *  would flip the verdict on every one of them. */
function reduceActors(events, wallet) {
  const counts = new Map();
  let external = 0;
  for (const e of events) {
    const actor = actorOf(e, e.w ?? wallet);
    if (!actor) continue;
    external++;
    counts.set(actor, (counts.get(actor) ?? 0) + 1);
  }
  return { total: events.length, external, counts };
}

/** `startOfUtcDay` — the heatmap's own, the summary's own, and the wire's own
 *  `byDay` key: the day's start in unix seconds as a decimal string. */
const dayKey = (ts) => String(Math.floor(ts / 86400) * 86400);
const isoDay = (key) => new Date(Number(key) * 1000).toISOString().slice(0, 10);

function reduceDays(events) {
  const days = new Map();
  for (const e of events) days.set(dayKey(e.timestamp), (days.get(dayKey(e.timestamp)) ?? 0) + 1);
  return days;
}

function addDays(into, buckets) {
  for (const b of buckets ?? []) into.set(b.key, (into.get(b.key) ?? 0) + b.count);
  return into;
}

/** Two count maps compared key for key, in both directions. */
function diffCounts(mine, theirs) {
  const missing = [];
  const extra = [];
  for (const [k, v] of theirs) if ((mine.get(k) ?? 0) < v) missing.push([k, mine.get(k) ?? 0, v]);
  for (const [k, v] of mine) if ((theirs.get(k) ?? 0) < v) extra.push([k, v, theirs.get(k) ?? 0]);
  return { missing, extra };
}

const fmt = (n) => n.toLocaleString("en-US");

// ── the tally ───────────────────────────────────────────────────────────────
let passes = 0;
let failures = 0;
let vacuous = 0;
let skipped = 0;
const check = (name, ok, detail = "", vacuousWhy = null) => {
  if (!ok) {
    failures++;
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
    return false;
  }
  if (vacuousWhy) {
    vacuous++;
    console.log(`VACUOUS ${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`        ↳ compared nothing: ${vacuousWhy}`);
    return true;
  }
  passes++;
  console.log(`PASS ${name}${detail ? ` — ${detail}` : ""}`);
  return true;
};
const skip = (name, why) => {
  skipped++;
  console.log(`SKIP ${name} — ${why}`);
};

const readJson = async (url, what) => {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(300_000) });
  const body = await res.text();
  if (res.status !== 200) throw new Error(`${what} answered ${res.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body);
};

// ── one arm ─────────────────────────────────────────────────────────────────
async function runArm(arm, ctx) {
  const id = (name) => `${arm.key} · ${name}`;
  console.log(`\n── ${arm.label} ──\n`);

  const grouped = await readJson(arm.api("group=1"), "the grouped read");
  const folders = (grouped.rowPlan ?? []).filter((r) => r.kind === "folder").map((r) => r.folder);
  const inFolders = folders.reduce((a, f) => a + f.count, 0);
  // The ungrouped twin of THIS answer: the window the grouped read just served,
  // asked for by its own event count so the two cover the same history. Where
  // the grouped answer served the WHOLE history (no cut), its twin is asked the
  // same way — `recent=N` would draw a cut the grouped answer does not have,
  // and the two would then describe windows of the same events with different
  // boundaries.
  const ungrouped = await readJson(
    arm.api(grouped.cutoffBlock == null ? "" : `recent=${grouped.eventsServed}`),
    "the ungrouped read",
  );

  // ── F0 — the fixture guard ────────────────────────────────────────────────
  const { totalEvents: MIN_TOTAL, folders: MIN_FOLDERS, inFolderShare: MIN_SHARE, dayGap: MIN_GAP } = arm.floors;
  const g0 = check(
    id("F0a the grouped read answers GROUPED, with folders to compare"),
    grouped.grouped === true && Array.isArray(grouped.rowPlan) && folders.length >= MIN_FOLDERS,
    `grouped=${grouped.grouped}, ${fmt(grouped.rowPlan?.length ?? 0)} rows, ${folders.length} folders (floor ${MIN_FOLDERS})`,
  );
  const g1 = check(
    id("F0b the fixture still buries most of its served window in folders"),
    grouped.totalEvents >= MIN_TOTAL && inFolders / grouped.eventsServed > MIN_SHARE,
    `${fmt(grouped.totalEvents)} events in the history (floor ${fmt(MIN_TOTAL)}), ${fmt(inFolders)} of ${fmt(
      grouped.eventsServed,
    )} served inside folders (${((inFolders / grouped.eventsServed) * 100).toFixed(0)} %, floor ${MIN_SHARE * 100} %)`,
  );
  // ⚠️ THE COMPARISON RESTS ON THIS ONE. Both reads must describe the SAME
  // window: the position is live, and a write between the two fetches moves the
  // cut. Unequal cuts mean the two answers are about different histories and
  // every difference below would be a true statement about the wrong thing.
  const g2 = check(
    id("F0c both reads describe the SAME window — one cut, one event count"),
    (grouped.cutoffBlock ?? null) === (ungrouped.cutoffBlock ?? null) &&
      ungrouped.events.length === grouped.eventsServed,
    `cutoffBlock ${grouped.cutoffBlock == null ? "none (whole history)" : fmt(grouped.cutoffBlock)} / ${
      ungrouped.cutoffBlock == null ? "none (whole history)" : fmt(ungrouped.cutoffBlock)
    }, ${fmt(ungrouped.events.length)} ungrouped events for ${fmt(grouped.eventsServed)} served`,
  );

  const singletonDays = reduceDays(grouped.events);
  const allDays = reduceDays(ungrouped.events);
  const hiddenDays = [...allDays.keys()].filter((k) => !singletonDays.has(k));
  const g3 = check(
    id("F0d folders still hide whole days from the ungrouped stream — the gap R1/R2/H1 rest on"),
    hiddenDays.length > MIN_GAP,
    `folders hide ${hiddenDays.length} day(s) from the ungrouped stream, floor ${MIN_GAP} (window spans ${allDays.size} days, ${singletonDays.size} of them have an ungrouped row)`,
  );

  if (!(g0 && g1 && g2 && g3)) {
    console.log(
      "\n⚠ THE FIXTURE DRIFTED — it no longer has the shape these comparisons need.\n" +
        "  This is not a finding about the code: re-probe the position (or pick another\n" +
        "  that buries a window in folders) and re-run. The comparisons below are\n" +
        "  SKIPPED: they would be true and would mean nothing.",
    );
    skip(id("P1/P2 the row plan replays over the ungrouped stream"), "fixture guard tripped");
    skip(id("R1–R6b the reductions, grouped versus ungrouped"), "fixture guard tripped");
    skip(id("H1 the heatmap counts the same events with folders on and off"), "fixture guard tripped");
    skip(id("H2 the export menu states the same history with folders on and off"), "fixture guard tripped");
    skip(id("H3 the Markdown snapshot states the same history with folders on and off"), "fixture guard tripped");
    return;
  }

  // ── P — the partition: which events a folder stands for ───────────────────
  // The plan and the ungrouped read are both in ascending chain order, so the
  // plan REPLAYS over the flat stream: an `event` entry consumes one event and
  // must BE it, a folder entry consumes its own `count`. That is what attributes
  // members to a folder without asking the members route for them — and it is a
  // check in its own right, because a folder that miscounts its members still
  // reduces the ones it holds correctly (break (c) in the header).
  const members = new Map(); // responseId → the events it stands for
  let cursor = 0;
  let singleton = 0;
  let idMismatch = null;
  for (const row of grouped.rowPlan) {
    if (row.kind === "event") {
      // An `event` entry consumes the next event of BOTH answers, and they must
      // be the same event: the grouped answer's flat `events` array is the plan's
      // own singletons, in order.
      const mine = grouped.events[singleton];
      const theirs = ungrouped.events[cursor];
      if (!idMismatch && (!mine || !theirs || mine.id !== theirs.id)) {
        idMismatch = `plan event ${singleton + 1}: grouped ${mine?.id ?? "(none)"} ≠ ungrouped ${theirs?.id ?? "(none)"}`;
      }
      singleton++;
      cursor++;
    } else {
      members.set(row.folder.responseId, ungrouped.events.slice(cursor, cursor + row.folder.count));
      cursor += row.folder.count;
    }
  }

  check(
    id("P1 the row plan replays over the ungrouped stream event for event"),
    idMismatch == null && cursor === ungrouped.events.length && singleton === grouped.events.length,
    idMismatch ??
      `the plan consumed ${fmt(cursor)} of ${fmt(ungrouped.events.length)} ungrouped events: ${fmt(
        singleton,
      )} standing for themselves, ${fmt(inFolders)} inside ${folders.length} folders`,
  );

  // The ordinals are literal and cover the whole history, oldest = 1 (0019 §3),
  // so the served window's first row is at `totalEvents - eventsServed + 1` and
  // the plan's ordinals run from there without a gap or an overlap.
  let ordinal = grouped.totalEvents - grouped.eventsServed + 1;
  let ordinalBad = null;
  for (const row of grouped.rowPlan) {
    const span = row.kind === "event" ? 1 : row.folder.count;
    if (row.kind === "folder") {
      const f = row.folder;
      if (!ordinalBad && (f.ordinalFirst !== ordinal || f.ordinalLast - f.ordinalFirst + 1 !== f.count)) {
        ordinalBad = `folder ${f.responseId.slice(0, 40)}… claims ordinals ${fmt(f.ordinalFirst)}–${fmt(
          f.ordinalLast,
        )} (${fmt(f.ordinalLast - f.ordinalFirst + 1)}) at stream position ${fmt(ordinal)}, count ${fmt(f.count)}`;
      }
    }
    ordinal += span;
  }
  check(
    id("P2 the plan's folder ordinals cover the served window in one contiguous run"),
    ordinalBad == null && ordinal - 1 === grouped.totalEvents,
    ordinalBad ??
      `ordinals ${fmt(grouped.totalEvents - grouped.eventsServed + 1)}–${fmt(ordinal - 1)} of ${fmt(
        grouped.totalEvents,
      )}, ${folders.length} folders placed`,
  );

  // ── R1/R2 — the day histogram ─────────────────────────────────────────────
  const dayBad = [];
  for (const f of folders) {
    const own = reduceDays(members.get(f.responseId) ?? []);
    const carried = addDays(new Map(), f.byDay);
    const { missing, extra } = diffCounts(carried, own);
    if (missing.length || extra.length) {
      dayBad.push(
        `folder ${f.responseId.slice(0, 36)}… (${fmt(f.count)} members over ${own.size} day(s)): ${
          carried.size === 0
            ? "folder states no day at all"
            : `${missing.length} day(s) short, ${extra.length} over (e.g. ${(missing[0] ?? extra[0])
                .map((v, i) => (i === 0 ? isoDay(v) : fmt(v)))
                .join(" ")})`
        }`,
      );
    }
  }
  check(
    id("R1 every folder's byDay is its own members' day histogram, to the day"),
    dayBad.length === 0,
    dayBad.length === 0
      ? `${folders.length} folders, ${fmt(inFolders)} members, ${fmt(
          folders.reduce((a, f) => a + f.byDay.length, 0),
        )} day buckets checked`
      : `${dayBad.length} of ${folders.length} folders disagree (e.g. ${dayBad[0]})`,
  );

  const mergedDays = addDays(
    new Map(singletonDays),
    folders.flatMap((f) => f.byDay),
  );
  const dayDiff = diffCounts(mergedDays, allDays);
  check(
    id("R2 the window's day histogram is the same grouped and ungrouped, to the day"),
    dayDiff.missing.length === 0 && dayDiff.extra.length === 0,
    dayDiff.missing.length === 0 && dayDiff.extra.length === 0
      ? `${allDays.size} days, ${fmt(grouped.eventsServed)} events — ${hiddenDays.length} of those days reach the page ONLY through a folder`
      : `${dayDiff.missing.length} day(s) the ungrouped read has and the grouped merge does not (e.g. ${dayDiff.missing
          .slice(0, 3)
          .map(([k, mine, theirs]) => `${isoDay(k)}: ${fmt(mine)} vs ${fmt(theirs)}`)
          .join(", ")}), ${dayDiff.extra.length} the other way${
          dayDiff.extra.length
            ? ` (e.g. ${dayDiff.extra
                .slice(0, 3)
                .map(([k, mine, theirs]) => `${isoDay(k)}: ${fmt(mine)} vs ${fmt(theirs)}`)
                .join(", ")})`
            : ""
        }`,
  );

  // ── R3/R4 — the lifetime tower ────────────────────────────────────────────
  const carriedFlows = foldersFlows(folders);
  const memberFlowSample = reduceFlows([...members.values()].flat());
  const VACUOUS_FLOWS =
    carriedFlows.legs.size === 0 && memberFlowSample.legs.size === 0
      ? "no folder member is a flow-bearing row on this arm (AAVE_FAMILY_FLOWS excludes transfers, and the liquidation spec has never fired — 1,144 liquidation rows, longest run 1). Proved instead in api/src/services/timeline-folders.test.ts"
      : null;

  const flowBad = [];
  for (const f of folders) {
    const own = reduceFlows(members.get(f.responseId) ?? []);
    const carried = foldersFlows([f]).legs;
    const keys = new Set([...own.legs.keys(), ...carried.keys()]);
    for (const k of keys) {
      const a = carried.get(k) ?? 0n;
      const b = own.legs.get(k) ?? 0n;
      if (a !== b) flowBad.push(`folder ${f.responseId.slice(0, 36)}… ${k}: folder ${a}, members ${b}`);
    }
    if (own.unkeyable.length)
      flowBad.push(
        `folder ${f.responseId.slice(0, 36)}… has ${own.unkeyable.length} row(s) whose asset has no symbol to key on`,
      );
  }
  check(
    id("R3 every folder's flows are its own members' tower legs, to the base unit"),
    flowBad.length === 0,
    flowBad.length === 0
      ? `${folders.length} folders, ${carriedFlows.legs.size} carried leg(s) against ${memberFlowSample.legs.size} reduced from their members (${carriedFlows.nullFlows} folder(s) carry NULL flows — the family declares none)`
      : `${flowBad.length} disagreement(s) (e.g. ${flowBad[0]})`,
    VACUOUS_FLOWS,
  );

  const ungroupedFlows = reduceFlows(ungrouped.events);
  const singletonFlows = reduceFlows(grouped.events);
  const mergedFlows = new Map(singletonFlows.legs);
  for (const [k, v] of carriedFlows.legs) mergedFlows.set(k, (mergedFlows.get(k) ?? 0n) + v);
  const flowKeys = new Set([...mergedFlows.keys(), ...ungroupedFlows.legs.keys()]);
  const flowGaps = [...flowKeys]
    .filter((k) => (mergedFlows.get(k) ?? 0n) !== (ungroupedFlows.legs.get(k) ?? 0n))
    .map((k) => `${k}: grouped ${mergedFlows.get(k) ?? 0n}, ungrouped ${ungroupedFlows.legs.get(k) ?? 0n}`);
  check(
    id("R4 the window's lifetime flows are the same grouped and ungrouped, to the base unit"),
    flowGaps.length === 0 && ungroupedFlows.unkeyable.length === 0,
    flowGaps.length === 0 && ungroupedFlows.unkeyable.length === 0
      ? `${flowKeys.size} <asset>|<leg> bucket(s) equal, ${carriedFlows.legs.size} of them carried by a folder`
      : flowGaps.length
        ? `${flowGaps.length} bucket(s) differ (e.g. ${flowGaps.slice(0, 3).join(" · ")})`
        : `${ungroupedFlows.unkeyable.length} ungrouped row(s) have no symbol to key on (e.g. ${ungroupedFlows.unkeyable[0]})`,
    carriedFlows.legs.size === 0
      ? "no folder carries a flow leg on this arm, so the merge under test adds nothing to the comparison. Proved instead in api/src/services/timeline-folders.test.ts"
      : null,
  );

  // ── R5/R6 — the actor split ───────────────────────────────────────────────
  const carriedExternal = folders.reduce((a, f) => a + (f.actors?.external ?? 0), 0);
  const nullActors = folders.filter((f) => f.actors == null).length;
  const actorBad = [];
  for (const f of folders) {
    const own = reduceActors(members.get(f.responseId) ?? [], grouped.wire?.w ?? grouped.wallet);
    const carried = f.actors;
    if (carried == null) {
      // NULL is a claim about the FAMILY ("no actor is judged here"), so it is
      // only wrong if the members would in fact have named one.
      if (own.external > 0)
        actorBad.push(`folder ${f.responseId.slice(0, 36)}… carries NULL actors but its members name ${own.external}`);
      continue;
    }
    if (carried.external !== own.external)
      actorBad.push(`folder ${f.responseId.slice(0, 36)}… external ${carried.external}, members ${own.external}`);
    const carriedCounts = new Map(carried.actors.map((a) => [a.address, a.count]));
    for (const [addr, n] of own.counts)
      if ((carriedCounts.get(addr) ?? 0) !== n)
        actorBad.push(
          `folder ${f.responseId.slice(0, 36)}… ${addr}: folder ${carriedCounts.get(addr) ?? 0}, members ${n}`,
        );
    for (const [addr, n] of carriedCounts)
      if ((own.counts.get(addr) ?? 0) !== n)
        actorBad.push(
          `folder ${f.responseId.slice(0, 36)}… ${addr}: folder ${n}, members ${own.counts.get(addr) ?? 0}`,
        );
  }
  const memberActors = reduceActors([...members.values()].flat(), grouped.wire?.w ?? grouped.wallet);
  check(
    id("R5 every folder's actor split is its own members', to the actor"),
    actorBad.length === 0,
    actorBad.length === 0
      ? `${folders.length} folders, ${carriedExternal} externally-acted member(s) carried (${nullActors} folder(s) carry NULL actors)`
      : `${actorBad.length} disagreement(s) (e.g. ${actorBad[0]})`,
    carriedExternal === 0 && memberActors.external === 0
      ? "no folder member carries a pool_caller on this arm, so no member can be third-party-acted (the two folder specs match exactly the caller-NULL rows). Proved instead in api/src/services/timeline-folders.test.ts"
      : null,
  );

  const ungroupedActors = reduceActors(ungrouped.events, ungrouped.wire?.w ?? ungrouped.wallet);
  const singletonActors = reduceActors(grouped.events, grouped.wire?.w ?? grouped.wallet);
  // `withFolderActors` (lib/shared/timeline-folder-reductions.ts) restated: a
  // folder's `count` IS its total, its `external` adds, its per-actor counts add.
  const mergedTotal = singletonActors.total + inFolders;
  const mergedExternal = singletonActors.external + carriedExternal;
  const mergedActorCounts = new Map(singletonActors.counts);
  for (const f of folders)
    for (const a of f.actors?.actors ?? [])
      mergedActorCounts.set(a.address, (mergedActorCounts.get(a.address) ?? 0) + a.count);

  check(
    id("R6a the window's event TOTAL is the same grouped and ungrouped — a folder's count is its total"),
    mergedTotal === ungroupedActors.total,
    `grouped total ${fmt(mergedTotal)} (${fmt(singletonActors.total)} standing alone + ${fmt(
      inFolders,
    )} inside folders), ungrouped ${fmt(ungroupedActors.total)}`,
  );

  const actorGaps = [];
  if (mergedExternal !== ungroupedActors.external)
    actorGaps.push(`external ${fmt(mergedExternal)} vs ${fmt(ungroupedActors.external)}`);
  for (const [addr, n] of ungroupedActors.counts)
    if ((mergedActorCounts.get(addr) ?? 0) !== n)
      actorGaps.push(`${addr}: ${mergedActorCounts.get(addr) ?? 0} vs ${n}`);
  for (const [addr, n] of mergedActorCounts)
    if ((ungroupedActors.counts.get(addr) ?? 0) !== n)
      actorGaps.push(`${addr}: ${n} vs ${ungroupedActors.counts.get(addr) ?? 0}`);
  check(
    id("R6b the window's actor split is the same grouped and ungrouped, to the actor"),
    actorGaps.length === 0,
    actorGaps.length === 0
      ? `external ${fmt(ungroupedActors.external)} of ${fmt(ungroupedActors.total)} over ${
          ungroupedActors.counts.size
        } distinct actor(s), ${carriedExternal} of them carried by a folder`
      : `${actorGaps.length} disagreement(s) (e.g. ${actorGaps.slice(0, 3).join(" · ")})`,
    carriedExternal === 0
      ? "every folder carries external 0 on this arm, so the merge under test adds nothing to the comparison. Proved instead in api/src/services/timeline-folders.test.ts"
      : null,
  );

  // ── H1/H2/H3 — the page itself, and its three whole-history claims ────────
  // Settled 2026-09-12: a day whose events all sit inside folders is an ORDINARY
  // day. The same position must therefore draw the same heatmap, state the same
  // export scope and write the same snapshot heading with folders on and with
  // folders off — and the two arms partition the history differently, so this is
  // not the same arithmetic run twice.
  if (!ctx) {
    skip(id("H1 the page's heatmap counts the same events with folders on and off"), "--wire-only");
    skip(id("H2 the export menu states the same history with folders on and off"), "--wire-only");
    skip(id("H3 the Markdown snapshot states the same history with folders on and off"), "--wire-only");
    return;
  }

  /** Reads a value off a settled page. The page paints from its SSR'd tail and
   *  the client may still be settling the rest of the window, so every read here
   *  repeats until the value holds still across THREE consecutive reads rather
   *  than sleeping a fixed time. Three and not two: a value that has not started
   *  moving yet also repeats once, and `openPage` has already waited for the
   *  input that makes it move. The values do move (0 → their total), so this is
   *  not a wait on something that never changes. */
  const settled = async (page, read) => {
    let prev = null;
    let stable = 0;
    for (let i = 0; i < 25; i++) {
      const now = await read();
      stable = now === prev ? stable + 1 : 0;
      prev = now;
      if (stable >= 2) break;
      await page.waitForTimeout(1000);
    }
    return prev;
  };

  const openPage = async (groupedPage, selector) => {
    const page = await ctx.newPage();
    // ⚠️ WAIT FOR THE OPENING BALANCE BY NAME, not by watching the value settle.
    // Every figure below is a WHOLE-HISTORY one, and on a windowed page half of
    // it arrives in a second request. The settle loop alone cannot tell "the
    // grid has finished" from "the grid has not started": it breaks on the first
    // pair of equal reads, and a grid that paints its served window and then
    // sits still for a second while the summary is in flight gives exactly that
    // pair. Seen 2026-09-12 on the aave-v3 arm — H1 read 2,967 (the served
    // window, no summary) against the position's 10,045, which is a true
    // statement about a page that had not finished loading.
    //
    // This waits on an INPUT ARRIVING, never on a value being right, so it
    // cannot make a red check green: break the merge and the grid is still
    // wrong once the summary lands. A whole-history fixture makes no such
    // request and must not wait for one.
    const summarySeen =
      grouped.cutoffBlock == null
        ? Promise.resolve(null)
        : page.waitForResponse((r) => /\/timeline\/summary/.test(r.url()), { timeout: 180_000 }).catch(() => null);
    await page.goto(arm.pageUrl(groupedPage), { waitUntil: "domcontentloaded", timeout: 300_000 });
    await page.waitForSelector(selector, { timeout: 180_000 });
    await summarySeen;
    return page;
  };

  const readHeatmap = async (groupedPage) => {
    const page = await openPage(groupedPage, "[data-date-control]");
    await page.click("[data-date-control]");
    await page.waitForSelector('[data-heatmap-grain="months"] [data-cell-at]', { timeout: 60_000 });
    const prev = await settled(page, async () =>
      JSON.stringify(
        await page.$$eval('[data-heatmap-grain="months"] [data-cell-at][data-cell-live]', (els) =>
          els.map((el) => {
            const m = /·\s*([\d,]+)\s*event/.exec(el.getAttribute("title") ?? "");
            return [el.getAttribute("data-cell-at"), m ? Number(m[1].replace(/,/g, "")) : null];
          }),
        ),
      ),
    );
    await page.close();
    return new Map(JSON.parse(prev));
  };

  const groupedGrid = await readHeatmap(true);
  const flatGrid = await readHeatmap(false);
  const months = new Set([...groupedGrid.keys(), ...flatGrid.keys()]);
  const monthGaps = [...months]
    .filter((k) => groupedGrid.get(k) !== flatGrid.get(k))
    .map((k) => `${isoDay(k).slice(0, 7)}: ${fmt(groupedGrid.get(k) ?? 0)} vs ${fmt(flatGrid.get(k) ?? 0)}`);
  const sum = (grid) => [...grid.values()].reduce((a, n) => a + (n ?? 0), 0);
  check(
    id("H1 the page's heatmap counts the same events with folders on and off"),
    monthGaps.length === 0 && sum(groupedGrid) === grouped.totalEvents && months.size > 0,
    monthGaps.length === 0 && sum(groupedGrid) === grouped.totalEvents
      ? `both arms draw ${fmt(sum(groupedGrid))} events over ${months.size} months — the position's whole history, ${fmt(
          inFolders,
        )} of them reaching the grid through a folder`
      : `grouped draws ${fmt(sum(groupedGrid))} events over ${groupedGrid.size} months, flat draws ${fmt(
          sum(flatGrid),
        )} — ${monthGaps.length} month(s) differ (e.g. ${monthGaps.slice(0, 3).join(", ")})`,
  );

  // ── H2/H3 — the export menu's two claims, read from one open of it ────────
  // The scope note is ON the page; the transcript heading is inside the
  // clipboard payload. One open of the menu answers both, so the second claim
  // costs a click rather than a page load.
  const readExport = async (groupedPage) => {
    const page = await openPage(groupedPage, "[data-export-menu] button");
    await page.click("[data-export-menu] button");
    await page.waitForSelector('[role="menu"]', { timeout: 60_000 });
    // The note is read as OPTIONAL. A page that draws none is making a claim
    // (that `events` is its whole history), and H2 must report that claim as
    // the defect it is — not time out waiting and crash the arm. Break (j).
    const note = await settled(page, async () =>
      (await page.$("[data-export-scope-note]")) ? page.textContent("[data-export-scope-note]") : null,
    );
    // `buildMarkdown` is called at click time off the same window the note was
    // drawn from, so the snapshot is stamped once the note has settled.
    await page.click('[role="menu"] button:has-text("Copy Position")');
    await page.waitForTimeout(500);
    const markdown = await page.evaluate(() => navigator.clipboard.readText());
    await page.close();
    const noteTotal = /of ([\d,]+) events/.exec(note ?? "");
    // The transcript's own heading — `markdownTimelineSlice`. Both of its
    // windowed branches state a total; the grouped one also states how many
    // events it could NOT list, and numbers its rows from 1 because their
    // absolute places in the history are unknown.
    const heading = /^##\s+(?:Recent activity|Activity timeline)\s*\((.*)\)\s*$/m.exec(markdown ?? "");
    const headingText = heading?.[1] ?? "";
    // Both windowed forms say "of N events"; the unbounded form ("2,776 events,
    // oldest first") states the same total without the preposition, and a page
    // that lists its whole history is a legitimate flat arm.
    const headTotal = /of ([\d,]+) events/.exec(headingText) ?? /^([\d,]+) events/.exec(headingText);
    const listed = /^(?:last )?([\d,]+) of [\d,]+ events/.exec(headingText);
    const notListed = /the ([\d,]+) events? inside collapsed groups are not listed/.exec(headingText);
    const tail = (markdown ?? "").slice((heading?.index ?? 0) + (heading?.[0].length ?? 0));
    const rowLines = tail.split("\n").filter((l) => /^\|\s*[\d,]+\s*\|/.test(l));
    // The first data row's `#` column, which is `firstIndex` made visible.
    const firstRow = /^\|\s*([\d,]+)\s*\|/.exec(rowLines[0] ?? "");
    const num = (m) => (m ? Number(m[1].replace(/,/g, "")) : null);
    return {
      note: (note ?? "").trim(),
      noteTotal: num(noteTotal),
      heading: headingText,
      headTotal: num(headTotal),
      listed: num(listed),
      notListed: num(notListed),
      rows: rowLines.length,
      firstRow: num(firstRow),
      claimsATail: /\blast\s/.test(headingText),
    };
  };

  const groupedExport = await readExport(true);
  const flatExport = await readExport(false);

  check(
    id("H2 the export menu states the same history with folders on and off"),
    groupedExport.noteTotal !== null &&
      groupedExport.noteTotal === flatExport.noteTotal &&
      groupedExport.noteTotal === grouped.totalEvents,
    groupedExport.noteTotal === flatExport.noteTotal && groupedExport.noteTotal === grouped.totalEvents
      ? `both arms state ${fmt(groupedExport.noteTotal)} events, ${fmt(
          inFolders,
        )} of them inside folders on the grouped arm`
      : `grouped states ${fmt(groupedExport.noteTotal ?? 0)}, flat states ${fmt(
          flatExport.noteTotal ?? 0,
        )}, the position has ${fmt(grouped.totalEvents)} — grouped note: ${
          groupedExport.note ? `"${groupedExport.note}"` : "(none drawn)"
        }`,
  );

  // H3 is three claims about one heading, and each can go wrong on its own:
  //   the TOTAL      — the same whole-history count the note and the grid state;
  //   the OMISSION   — how many events are inside folders and therefore absent;
  //   the NUMBERING  — rows numbered from 1, because a grouped page's rows are
  //                    not the history's last N and their places are unknown.
  const h3 = [];
  if (groupedExport.headTotal === null) h3.push(`grouped heading states no total — "${groupedExport.heading}"`);
  else if (groupedExport.headTotal !== grouped.totalEvents || groupedExport.headTotal !== flatExport.headTotal)
    h3.push(
      `grouped heading states ${fmt(groupedExport.headTotal)}, flat states ${fmt(
        flatExport.headTotal ?? 0,
      )}, the position has ${fmt(grouped.totalEvents)}`,
    );
  if (groupedExport.notListed !== inFolders)
    h3.push(
      `grouped heading names ${
        groupedExport.notListed === null ? "no" : fmt(groupedExport.notListed)
      } event(s) inside collapsed groups, the answer holds ${fmt(inFolders)}`,
    );
  if (groupedExport.claimsATail)
    h3.push(`grouped heading calls its rows a tail of the history — "${groupedExport.heading}"`);
  // A grouped page can hold NO listable row at all — every event inside a
  // folder, which is the spark arm exactly. There is then no numbering to
  // check, and the heading's own "0 of N" is the claim that carries it.
  if (groupedExport.rows > 0 && groupedExport.firstRow !== 1)
    h3.push(
      `grouped transcript numbers its first row ${
        groupedExport.firstRow === null ? "(no row found)" : fmt(groupedExport.firstRow)
      }, claiming a place in the history its rows do not have`,
    );
  // Whatever it lists, the heading must say how many — and the two must agree,
  // or the note and the transcript are describing different snapshots.
  // Only where the heading states a listed count at all — a heading that states
  // none is already reported by the total and omission clauses above, and
  // comparing its absence with a row count would print a disagreement between
  // two things that agree.
  if (groupedExport.listed !== null && groupedExport.listed !== groupedExport.rows)
    h3.push(
      `grouped heading claims ${fmt(groupedExport.listed)} listed row(s), the table has ${fmt(groupedExport.rows)}`,
    );
  // The FLAT arm's transcript IS a contiguous tail, so it must still say so —
  // otherwise the grouped branch is being taken on a page with no folders.
  if (!flatExport.claimsATail) h3.push(`flat heading no longer calls its rows a tail — "${flatExport.heading}"`);
  check(
    id("H3 the Markdown snapshot states the same history with folders on and off"),
    h3.length === 0,
    h3.length === 0
      ? `both arms state ${fmt(groupedExport.headTotal)} events; the grouped snapshot names the ${fmt(
          inFolders,
        )} inside folders it does not list and numbers its rows from 1, the flat one lists the last ${
          flatExport.firstRow === null ? "?" : fmt(grouped.totalEvents - flatExport.firstRow + 1)
        }`
      : h3.join(" · "),
  );
}

// ── the run ─────────────────────────────────────────────────────────────────
console.log(`\n── a folder carries what the page reduces over · ${BASE} · ${arms.map((a) => a.key).join(", ")} ──`);

const browser = WIRE_ONLY ? null : await chromium.launch();
// H3 reads what "Copy Position" actually wrote, so the context grants the
// clipboard. One context serves every arm.
const ctx = browser ? await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] }) : null;

for (const arm of arms) {
  try {
    await runArm(arm, ctx);
  } catch (err) {
    failures++;
    console.log(`\nFAIL ${arm.key} — the arm could not run: ${String(err).slice(0, 400)}`);
  }
}

if (browser) await browser.close();

console.log(
  `\n${passes}/${passes + failures} checks passed${vacuous ? ` · ${vacuous} VACUOUS (nothing to compare on these arms — see the header)` : ""}${
    skipped ? ` · ${skipped} SKIP` : ""
  } · ${arms.length} arm(s): ${arms.map((a) => a.key).join(", ")}`,
);
process.exit(failures ? 1 : 0);
