#!/usr/bin/env node
// Market-note placement and eligibility — the pure rules, run directly.
// ----------------------------------------------------------------------------
// A market note is a receipted fact about the MARKET, placed between two of the
// account's own events (lib/shared/market-note.ts). One placement rule and one
// selector per kind decide where a note lands and whether it exists at all, and
// every one of them is the kind of rule that fails silently: a note anchored one
// row early still renders, still reads well, and claims an ordering the chain
// never stated; a selector whose threshold is off states a move that was never
// worth a row, or drops one that was.
//
// So all are proved here against the FILE THE PAGE IMPORTS, not a restatement
// of it — node loads the TypeScript module directly under type stripping
// (`--experimental-strip-types`; the script re-executes itself with the flag,
// so `node scripts/verify/…` and run-all both work). Every import in that
// module is `import type`, which is what makes this possible: type imports are
// erased before resolution, so there is no bundler, no `@/` alias to resolve
// and no build step between this check and the code that ships.
//
// NO SERVER, SO NO ROUTE-READ CHECK 0. The house pattern is a check 0 read from
// a route, so the fixture cannot come from the thing under test. There is no
// route here: this file runs the rules over synthetic event lists. Its check 0
// is the equivalent control — that the module loaded and the rules
// came from it — because a run that silently judged nothing is the one outcome
// worse than a red one. The placement fixture (sections 1–4) is a stretch's two
// blocks and the account rows around it; placement reads only blocks and ids,
// so the note there is any kind's. The rate-step fixture (section 8) is pinned
// from the raw tables, independently of this code.
//
// Proved it can fail 2026-09-04 with `e.blockNumber >= note.to.block` flipped
// to `>` in `anchorMarketNotes`: 1a goes red and nothing else does (the run is
// recorded at the foot of this file).
//
// Run: node scripts/verify/verify-market-note-placement.mjs

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Type stripping is a CLI flag, and run-all spawns `node <script>` with none.
// Re-exec once, with the flag, rather than making the suite special-case this
// file. `--disable-warning` keeps the experimental notice out of a run's output
// (run-all quotes the last line of a script it cannot classify).
if (!process.execArgv.includes("--experimental-strip-types")) {
  const r = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--disable-warning=ExperimentalWarning",
      fileURLToPath(import.meta.url),
      ...process.argv.slice(2),
    ],
    { stdio: "inherit" },
  );
  process.exit(r.status ?? 1);
}

const mod = await import("../../lib/shared/market-note.ts");
const { anchorMarketNotes, rateStepNotesFor, RATE_STEP_MIN_PP } = mod;

let failures = 0;
let checked = 0;
function check(name, cond, detail = "") {
  checked++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

console.log("Market notes — placement + eligibility (pure, no server)\n");

// ── fixtures ────────────────────────────────────────────────────────────────

const WALLET = "0x719eae70d4a83f35bf82a2740699f5db84be919d";
/** The stretch's two ends. Nothing on the account's side sits between them. */
const FROM_BLOCK = 50_516_524;
const TO_BLOCK = 50_516_566;

/** A plain event at a block — only the block and the id matter to placement. */
const ev = (id, blockNumber) => ({
  id,
  txHash: `0x${id
    .replace(/[^0-9a-f]/gi, "0")
    .padEnd(64, "0")
    .slice(0, 64)}`,
  blockNumber,
  timestamp: 0,
  wallet: WALLET,
  actionType: "borrow",
  actionLabel: "Borrow",
  flows: [],
  etherscanUrl: "",
});

/** The account's history around the stretch, oldest first: three rows
 *  before it opens, two after it closes. */
const HISTORY = [
  ev("e_supply1-1", 50_512_452),
  ev("e_supply3-1", 50_516_316),
  ev("e_borrow-3", 50_516_400),
  ev("0x6bac80e2797127c7c8de61fb7d8b86b2e8264be924c89bab2c72c0882883a495-5", 50_516_570),
  ev("e_liq-27", 50_516_849),
];
const desc = (list) => [...list].reverse();
const note = (over = {}) => ({
  id: "rate-step:usdc:stretch",
  kind: "rate-step",
  marketSymbol: "USDC",
  marketAddress: `0x${"a".repeat(40)}`,
  unitLabel: "% per year",
  from: {
    block: FROM_BLOCK,
    timestamp: 0,
    value: 0.04,
    txHash: `0x${"c".repeat(64)}`,
    logIndex: 27,
    wallet: "",
    kind: "borrow",
  },
  to: {
    block: TO_BLOCK,
    timestamp: 0,
    value: 0.06,
    txHash: `0x${"b".repeat(64)}`,
    logIndex: 7,
    wallet: "",
    kind: "repay",
  },
  deltaPp: 2,
  setsBetween: null,
  observed: { from: null, to: null },
  ...over,
});

const anchorOf = (notes, events, dir) => {
  const map = anchorMarketNotes(notes, events, dir);
  const keys = [...map.keys()];
  return keys.length === 1 ? keys[0] : keys.length === 0 ? null : keys;
};

const near = (a, b) => Math.abs(a - b) / b < 0.001;

// ── 0. control: the rules under test came from the shipped module ───────────

check(
  "0. the module loaded and both rules are functions from it",
  typeof anchorMarketNotes === "function" && typeof rateStepNotesFor === "function",
  `lib/shared/market-note.ts exports ${Object.keys(mod).length} names`,
);

// ── 1. the anchor is the first displayed event at or past to.block ──────────
// "At or past" is the whole rule: the step is known to have happened BY
// to.block, so an event exactly there is already after it. An off-by-one here
// places the note before an event that precedes the step.

const atBoundary = [...HISTORY.slice(0, 3), ev("e_to", TO_BLOCK), ...HISTORY.slice(3)];
check(
  "1a. asc — the event AT toBlock is the anchor",
  anchorOf([note()], atBoundary, "asc") === "e_to",
  `anchored ${anchorOf([note()], atBoundary, "asc")}, wanted e_to`,
);
check(
  "1b. asc — with no event at toBlock, the next one past it anchors (the deployed shape)",
  anchorOf([note()], HISTORY, "asc") === HISTORY[3].id,
  `anchored ${anchorOf([note()], HISTORY, "asc")}, wanted block ${HISTORY[3].blockNumber}`,
);
check(
  "1c. desc — the SAME event anchors when the list is drawn newest-first",
  anchorOf([note()], desc(HISTORY), "desc") === HISTORY[3].id,
  `anchored ${anchorOf([note()], desc(HISTORY), "desc")}`,
);

// ── 2. an anchor inside a run maps to a member id ──────────────────────────
// The timeline attaches the note to the RUN ROW by taking the union over the
// run's member ids, so all this rule owes is a member id.

const RUN_MEMBERS = [ev("e_run-1", TO_BLOCK + 4), ev("e_run-2", TO_BLOCK + 9), ev("e_run-3", TO_BLOCK + 12)];
const withRun = [...HISTORY.slice(0, 3), ...RUN_MEMBERS];
check(
  "2. anchor inside a collapsed run → the note maps to a member of that run",
  RUN_MEMBERS.some((m) => m.id === anchorOf([note()], withRun, "asc")),
  `anchored ${anchorOf([note()], withRun, "asc")} · run members ${RUN_MEMBERS.map((m) => m.id).join(", ")}`,
);

// ── 3. nothing at or past to.block → the note is dropped ───────────────────

const beforeOnly = HISTORY.filter((e) => e.blockNumber < TO_BLOCK);
check(
  "3. no displayed event at or past toBlock → the note does not render",
  anchorMarketNotes([note()], beforeOnly, "asc").size === 0,
  `${beforeOnly.length} events, all before block ${TO_BLOCK}`,
);
check("3b. no events at all → the note does not render", anchorMarketNotes([note()], [], "desc").size === 0);

// ── 4. the anchor filtered out → the next surviving event anchors ──────────

const filtered = HISTORY.filter((e) => e.id !== HISTORY[3].id);
check(
  "4. anchor filtered out of the displayed list → the next event past toBlock anchors",
  anchorOf([note()], filtered, "asc") === HISTORY[4].id,
  `anchored ${anchorOf([note()], filtered, "asc")}, wanted ${HISTORY[4].id}`,
);

// ── 8. Polaris primary-rate step — both ends the CDP's touches ─────────────
// The real-world fixture below (the primary stretch) was pinned by psql
// over the RAW tables (polaris_cdp_updated + polaris_primary_rate_set) on
// the onboarding box, 2026-09-05 — never derived from this code. usdp CDP 27's
// first
// rate-step stretch:
//
//   A  block 11,512,561  rate 0.059560109811460596 (raw 59560109811460596)
//      debt 77.459136 USDp   set 11,512,518 log 284, ordinal 52
//   B  block 11,548,724  rate 0                     (raw 0)
//      set 11,548,232 log 254, ordinal 832
//   Δ = -5.956 pp · 780 sets in between · interest 4.61 → 0.00 USDp/yr
//
// A polaris event id is `cdp_updated:<txHash>:<logIndex>` — the ids below are
// the fixture's own `a_key`/`b_key`, so this section doubles as proof that
// `polarisLogIndexOf` reads the real id shape (`logIndexOf`'s `-`/`_` split
// would land inside "cdp_updated"'s own underscore and return -1).

const RS_MARKET = { key: "usdp", stableSymbol: "USDp", cdpManager: "0xbdc1fe97e787ae7f653ffbccd74ec49814fe6aa1" };

/** A polaris cdp_updated row — only the fields the selector and the receipts
 *  read are set. `rateSet` is the backend's per-row PrimaryRateSet join
 *  (plan §3); omitted, a note still forms off the CDP's own two touches. */
const polarisEv = (id, blockNumber, primaryRate, over = {}) => {
  const { eventType = "adjust", newDebt = "0", rateSet } = over;
  const txHash = id.split(":")[1];
  return {
    id,
    txHash,
    blockNumber,
    timestamp: 0,
    wallet: "0x3f8d5618bb449f27d34f8381cb4e30e34e3db1d6",
    actionType: eventType,
    actionLabel: eventType,
    flows: [],
    etherscanUrl: "",
    context: {
      protocol: "polaris",
      data: {
        eventType,
        market: "usdp",
        cdpId: "27",
        stableSymbol: "USDp",
        primaryRate,
        newDebt,
        ...(rateSet ? { rateSet } : {}),
      },
    },
  };
};

// The pinned real stretch — usdp CDP 27's first note.
const RS_A_ID = "cdp_updated:0x29835870055bcb254df6c4efe1441899eb02303f58719ab487f40136a7dd1cf8:125";
const RS_B_ID = "cdp_updated:0x0be66d8695c82b84a29be3319739ab936249affb05bcdf3200ee9b4ad5196ef2:97";
const RS_A = polarisEv(RS_A_ID, 11_512_561, 0.059560109811460596, {
  eventType: "open",
  newDebt: "77.459136",
  rateSet: {
    block: 11_512_518,
    logIndex: 284,
    txHash: "0x5fb95c3741d8bbd1bfe3466b13d99bdf88ad1c0e8e3ca136b192be05f96b5630",
    txFrom: "0x3f8d5618bb449f27d34f8381cb4e30e34e3db1d6",
    timestamp: 1787024376,
    ordinal: 52,
  },
});
const RS_B = polarisEv(RS_B_ID, 11_548_724, 0, {
  eventType: "adjust",
  newDebt: "43.711757",
  rateSet: {
    block: 11_548_232,
    logIndex: 254,
    txHash: "0x4beb71dbdd5f22b4b442d98c43b8da2873530888f7aa2db233cf22bc7616aa5b",
    txFrom: "0x22f23610da519045488393a205e9236a6bca3507",
    timestamp: 1787466060,
    ordinal: 832,
  },
});

const rsReal = rateStepNotesFor([RS_A, RS_B], RS_MARKET);
check(
  "8. RATE_STEP_MIN_PP is 1 percentage point, exported",
  RATE_STEP_MIN_PP === 1,
  `RATE_STEP_MIN_PP = ${RATE_STEP_MIN_PP}`,
);
check(
  "8a. the pinned real stretch (usdp/27) renders one note, id and Δ matching the raw-table fixture",
  rsReal.length === 1 && rsReal[0].id === "rate-step:usdp:11512561-11548724" && near(rsReal[0].deltaPp, -5.956),
  `${rsReal.length} note(s), id ${rsReal[0]?.id}, Δ ${rsReal[0]?.deltaPp?.toFixed(4)} pp (wanted -5.956)`,
);
check(
  "8b. setsBetween = to.ordinal − from.ordinal (832 − 52 = 780, the fixture's own count)",
  rsReal[0]?.setsBetween === 780,
  `setsBetween ${rsReal[0]?.setsBetween}`,
);
check(
  "8c. the interest slice holds A's debt fixed and moves only the rate (77.459136 USDp × rate)",
  near(rsReal[0]?.interest?.before ?? NaN, 77.459136 * 0.059560109811460596) && rsReal[0]?.interest?.after === 0,
  `${rsReal[0]?.interest?.before?.toFixed(4)} → ${rsReal[0]?.interest?.after} USDp/yr`,
);
check(
  "8d. a polaris id's trailing `:N` is read as the log index (125 / 97), not -1",
  rsReal[0]?.from.logIndex === 125 && rsReal[0]?.to.logIndex === 97,
  `from.logIndex ${rsReal[0]?.from.logIndex}, to.logIndex ${rsReal[0]?.to.logIndex}`,
);
const rsAnchored = anchorMarketNotes(rsReal, [RS_A, RS_B], "asc");
check(
  "8e. placement anchors on B (to.block = B's block) — the shared rule, unchanged for this kind",
  rsAnchored.size === 1 && [...rsAnchored.keys()][0] === RS_B.id,
  `anchored ${[...rsAnchored.keys()][0]}`,
);

// ── synthetic edge cases — clean numbers, so the threshold arithmetic is
// exact rather than fighting float noise on the real fixture's own rates.
const rsMarket2 = { key: "usdp", stableSymbol: "USDp", cdpManager: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" };
const rsPair = (rateA, rateB, over = {}) => [
  polarisEv("cdp_updated:0x01:1", 500_000, rateA, { eventType: "open", newDebt: "1000", ...over.a }),
  polarisEv("cdp_updated:0x02:2", over.bBlock ?? 500_100, rateB, { eventType: "adjust", ...over.b }),
];

check(
  "8f. a 1.5 pp step (above threshold) renders one note",
  (() => {
    const n = rateStepNotesFor(rsPair(0.05, 0.065), rsMarket2);
    return n.length === 1 && near(n[0].deltaPp, 1.5);
  })(),
);
check(
  "8g. a 0.9 pp step (below threshold) renders none",
  rateStepNotesFor(rsPair(0.05, 0.059), rsMarket2).length === 0,
);
check(
  "8h. exactly 1.0 pp is INCLUSIVE (the gate is `< RATE_STEP_MIN_PP`, not `<=`)",
  rateStepNotesFor(rsPair(0, 0.01), rsMarket2).length === 1,
);
check("8i. equal rates state no move", rateStepNotesFor(rsPair(0.05, 0.05), rsMarket2).length === 0);
check(
  "8j. two touches in the SAME block are one moment, not a stretch",
  rateStepNotesFor(rsPair(0.05, 0.065, { bBlock: 500_000 }), rsMarket2).length === 0,
);

// (k) a transfer row between A and B is not an end and does not split the
// stretch — the note still spans A → B directly.
const rsTransfer = polarisEv("cdp_updated:0x03:3", 500_050, null, { eventType: "transfer" });
const [rsA15, rsB15] = rsPair(0.05, 0.065);
const rsWithTransfer = rateStepNotesFor([rsA15, rsTransfer, rsB15], rsMarket2);
check(
  "8k. a transfer row between A and B is not an end and does not split the stretch",
  rsWithTransfer.length === 1 && rsWithTransfer[0].from.block === 500_000 && rsWithTransfer[0].to.block === 500_100,
  `${rsWithTransfer.length} note(s), ${rsWithTransfer[0]?.from.block} → ${rsWithTransfer[0]?.to.block}`,
);

// (l) a null-rate row (before the market's first PrimaryRateSet) is not an end.
const rsNullRate = polarisEv("cdp_updated:0x04:4", 500_075, null, { eventType: "adjust" });
const rsWithNull = rateStepNotesFor([rsA15, rsNullRate, rsB15], rsMarket2);
check(
  "8l. a null-rate row is not an end — the stretch still spans A → B",
  rsWithNull.length === 1 && rsWithNull[0].from.block === 500_000 && rsWithNull[0].to.block === 500_100,
  `${rsWithNull.length} note(s), ${rsWithNull[0]?.from.block} → ${rsWithNull[0]?.to.block}`,
);

// (m) the interest slice is present iff A's debt is positive.
const rsZeroDebt = rateStepNotesFor(rsPair(0.05, 0.065, { a: { newDebt: "0" } }), rsMarket2);
check(
  "8m. no interest slice when A's own debt is 0",
  rsZeroDebt.length === 1 && rsZeroDebt[0].interest === undefined,
  `interest ${JSON.stringify(rsZeroDebt[0]?.interest)}`,
);
const rsWithDebt = rateStepNotesFor(rsPair(0.05, 0.065), rsMarket2);
check(
  "8n. the interest slice is debt × rate at each end, debt held fixed",
  near(rsWithDebt[0].interest.before, 1000 * 0.05) && near(rsWithDebt[0].interest.after, 1000 * 0.065),
  `${rsWithDebt[0]?.interest?.before} → ${rsWithDebt[0]?.interest?.after}`,
);

// (o) placing a note among `-`-id events and a rate step among `:`-id polaris
// events in one anchorMarketNotes call: neither id shape disturbs the other.
const mixedNotes = [note(), rsReal[0]];
const mixedEvents = [...HISTORY, RS_A, RS_B].sort((a, b) => a.blockNumber - b.blockNumber);
const mixedAnchors = anchorMarketNotes(mixedNotes, mixedEvents, "asc");
check(
  "8o. notes among `-`-id events and `:`-id events anchor together, neither disturbing the other",
  mixedAnchors.size === 2,
  `${mixedAnchors.size} anchor(s)`,
);

// ── 9. The live notes as one card — which notes join, and in what order ─────
// Synthetic notes: only `kind`, `live`, `id` and the move a rate step states
// (`deltaPp`) reach the rule. The shapes are the example wallet's (Aave V3
// Core 0x0af1…6a6a, 2026-09-30): five borrow-rate notes at the head.

{
  const { liveNoteGroup, orderLiveNotes, LIVE_NOTE_GROUP_ID } = mod;
  const rate = (id, deltaPp, live = true) => ({ id, kind: "rate-step", deltaPp, ...(live ? { live: true } : {}) });
  const terms = (id) => ({ id, kind: "vault-terms", live: true });
  check(
    "9. the group rule is exported from the module the page imports",
    typeof liveNoteGroup === "function" && typeof orderLiveNotes === "function",
  );

  const five = [rate("a", 0.4), rate("b", -2.1), rate("c", 1.7), rate("d", 0.4), rate("e", -0.02)];
  const g = liveNoteGroup(five);
  check(
    "9a. five live notes make one group, largest move first, ties in the builder's order",
    g?.id === LIVE_NOTE_GROUP_ID && g.notes.map((n) => n.id).join("") === "bcade",
    g?.notes.map((n) => n.id).join("") ?? "no group",
  );
  check("9b. one live note makes no group (it keeps its own row)", liveNoteGroup([rate("a", 1)]) === null);
  const mixedLive = liveNoteGroup([rate("h", 3, false), rate("a", 1), rate("t", 9, false)]);
  check("9c. a historical note never joins a group", mixedLive === null);
  const mixedKinds = orderLiveNotes([terms("p"), rate("r", 4), rate("s", 6), terms("q")]);
  check(
    "9d. kinds keep the builder's order; each kind is ordered by its move",
    mixedKinds.map((n) => n.id).join("") === "pqsr",
    mixedKinds.map((n) => n.id).join(""),
  );
}

// ── summary ────────────────────────────────────────────────────────────────

console.log(
  failures
    ? `\n${failures} CHECK(S) FAILED of ${checked}`
    : `\nALL ${checked} CHECKS PASS — placement and eligibility hold`,
);
process.exit(failures ? 1 : 0);

// ── the proved-to-fail run, in full ─────────────────────────────────────────
//
// 2026-09-04, with `e.blockNumber >= note.to.block` flipped to `>` in
// lib/shared/market-note.ts (`anchorMarketNotes`), everything else untouched:
//
//   PASS  0. the module loaded and both rules are functions from it — lib/shared/market-note.ts exports 5 names
//   FAIL  1a. asc — the event AT toBlock is the anchor — anchored 0x6bac80e2797127c7c8de61fb7d8b86b2e8264be924c89bab2c72c0882883a495-5, wanted e_to
//   PASS  1b. asc — with no event at toBlock, the next one past it anchors (the deployed shape)
//   PASS  1c. desc — the SAME event anchors when the list is drawn newest-first
//   PASS  2. anchor inside a collapsed run → the note maps to a member of that run
//   PASS  3 / 3b / 4 / 5a–5f / 6a–6c
//   1 CHECK(S) FAILED of 17   (exit 1)
//
// The flip is invisible everywhere else in the suite: only 1a puts an event
// exactly ON toBlock, which is why that fixture exists.
