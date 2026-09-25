#!/usr/bin/env node
// The vault POSITION page on Base — the card, the lifetime flows, and a history
// half of which is read at a finalized block and kept.
// /base/morpho/vaults/<vault>/<holder>
// ----------------------------------------------------------------------------
// EVERY EXPECTED FIGURE HERE IS THIS SCRIPT'S OWN CHAIN READ. It makes its own
// whole-`Transfer` sweep of each fixture's life — from the VAULT'S OWN CREATION
// BLOCK, because on Base a fixed floor of six million blocks is 139 days and
// would cut a life in half — its own `Deposit` and `Withdraw` sweeps, its own
// `balanceOf`, its own `convertToAssets`, and its own
// `eth_getBlockByNumber("finalized")`, and asserts the page's history, the
// store's tail and the tower's six lifetime sums against those. The only things
// taken from the page are the blocks it states, which are T0's own subject.
//
// A STORE CANNOT BE CHECKED AGAINST ITSELF. T2 does not ask the store whether
// its rows are right: it re-derives the cut's own signed sum from this script's
// own logs and asserts the stored `cutBalance` equals it, that every stored row
// sits at or below the cut, and that the cut is the lane's own `finalized`
// answer rather than a distance behind the head this script picked.
//
// T4 IS PROVEN BY BREAKING IT. The store's promise is that a value which does
// not add up is refused — so T4a SENDS an off-by-one body and reads the 422. A
// check that merely asked whether a good body was accepted would be green on a
// store with no validation at all (memory `verifier-cannot-fail-traps` #8). T4b
// then stores a SELF-CONSISTENT tail with one real row removed and asserts what
// the loader does with it.
//
// ⚠️ WHAT T4c ASSERTS IS NOT WHAT THE BRIEF FOR THIS FILE PREDICTED, and the
// difference is the loader being better than the prediction. The brief expected
// a poisoned tail to make "the page's gate FAIL, both figures stated, no rows
// drawn, no tower". Measured, it does not: the merged replay misses, the loader
// re-fetches the head once, misses again, then DISTRUSTS the tail whole and
// sweeps the life from the vault's creation block
// (lib/sources/chain/morpho-base-vault-timeline.ts — "a tail can therefore make
// a page slow and never wrong"). So the gate passes IN THE SAME REQUEST, and
// what this file asserts is the stronger claim the code actually makes: the
// poisoned load draws the SAME rows as the cold path, wei-exact, and offers a
// fresh tail over the poison. A check written to the prediction would have gone
// red on a correct loader.
//
// Run:
//   BASE=http://localhost:3801 node scripts/verify/verify-base-vault-position-page.mjs
// Needs BASE_RPC_URL (the `eth_call` lane) and BASE_BACKFILL_RPC_URL (the only
// Base lane that answers a whole-life `eth_getLogs`) in .env.local — read,
// never printed; named here by env var NAME only. One `next dev` at a time: two
// verifiers against one server produce a spurious 500.
//
// ── WHAT EACH SECTION ASSERTS ────────────────────────────────────────────────
//   T0  the page answers 200 and draws its card, its tower and its timeline;
//       the route's JSON carries a `history` statement
//   T1  the cold path: `?tail=0` reports source "chain", stores nothing, and
//       every row is wei-exact against this script's own replay of its own
//       sweeps
//   T4  the tail cannot lie — an off-by-one body is REFUSED 422, and a
//       self-consistent tail missing one real row is distrusted and the whole
//       life re-swept, drawing the cold path's rows wei-exact
//   T2  the store happened: the tail the proxy serves has a cut at or below the
//       lane's own `finalized` and within one epoch of it, every row at or
//       below the cut, ascending, a `cutBalance` equal to this script's own Σ
//       deltas at that cut, `LOADER_VERSION`, and NO allocation band on any row
//   T3  the warm path: source "stored+head", tailRows + headRows equals this
//       script's own log count, the rows are identical to T1's wei-exact, and
//       the page states the split in its own DOM
//   T5  F-B5, above the horizon with an EXACT count: rows withheld, gate
//       PASSED, and no tail stored
//   T6  F-B4, THE FLOOR PATH: `logCountIsLowerBound` true, the page says "at
//       least N" and states no count as a fact, the tail GET answers 404, and a
//       second load still answers 404
//   T7  the tower: six lifetime sums against this script's own, and the same
//       split again in the figures the BARS are drawn from
//   T8  windowing changes no tower figure
//   T9  run rows: a run folder collapses, and expanding it restores its members
//  T10  the card on the page is the listing's card, in its detail render, with
//       receipts and the Explanation pane
//  T11  the words, and the phone: no USD / rate / yield, and the document does
//       not scroll sideways at 390px
//  T12  F-B8: the floor path is chosen by the LANE'S REFUSAL, not by
//       `feeRecipient()` — this script's own sweep of F-B8's holder is refused
//       and F-B5's answers, which is the whole difference between them
//  T13  the fixtures still are what every check above assumes they are
//  T2k, T3i, T5f  no stored row carries a null share price (F-B1's tail, then
//       every fixture's), and every served row on both paths carries one, the
//       two equal — rails-ops TO-DO-infra §5.14, the Base twin of the Ethereum
//       script's T2l, T3f and T5f
//
// ── PROVED IT CAN FAIL, 2026-09-21, BASE=http://localhost:3857 (T2k, T3i, T5f) ─
// Two breaks together against a copy cut off before T6, neither of which
// writes to the shared store: (a) the tail route's GET nulls row 5 of F-B1's
// tail when the verifier asks (a header only its own reads carried), which is
// the store holding a null as this script sees it; (b) the Base vault route
// nulls the eleventh served row of F-B1's `?tail=0` answer, a cold read that
// did not answer. 30/36 · 1 SKIP:
//   FAIL T2k — "1 of 3364 rows with no share price"
//   FAIL T3i — "0 warm rows and 1 cold rows with no share price; 1 rows differ"
//   FAIL T5f — "F-B1 1 of 3364 unpriced · F-B3 0 of 3 · F-B5 0 of 8771"
//   and T4a–c, because T4 builds its bodies from (a)'s read and the PUT route
//   refuses a null price (400), which is right: no poison was written.
// 🔑 A first attempt nulled F-B1's fourth-oldest row in the loader and T3i
// stayed GREEN: the route serves the newest DRAW_ROWS, so no path served that
// row. T3i's name now says "served"; a row behind the window is T2k's.
// ⚠️ That first attempt also nulled rows in the GET the LOADER reads, so the
// loader refused the tail and T4's poison survived the run in the shared store
// (999 rows at cut 51,617,254). One normal visit replaced it (3,364 rows, cut
// 51,617,255, cutBalance equal to this script's own). A break here must leave
// the loader's own reads alone.
//
// ── FIXTURES, AS INPUTS ─────────────────────────────────────────────────────
//   F-B1  case study / 0x211b… — the largest ordinary life under the horizon
//         (~3,190 rows). The warm path's own fixture and the tower's.
//   F-B2  case study / 0xaffd… — CLOSED, ~2,610 rows, replay 0 == balanceOf 0.
//   F-B3  case study / 0x6340… — the median, 3 rows.
//   F-B4  case study / 0x255c… — THE FLOOR PATH: a floor near 12,799 with
//         `logCountIsLowerBound` true, no `reconcile`, 0 rows.
//   F-B5  case study / 0x25c1… — above the horizon with an EXACT count
//         (~8,686) and a PASSING gate.
//   F-B8  Gauntlet USDC Prime / 0x82c3… — a CLOSED fee recipient, floor path.
//   F-B9  Steakhouse USDC / 0x255c… — the largest life in this section; the
//         lane refuses it and the page states a floor.
//   ⚠️ A FIXTURE THAT HAS CHANGED STATE IS A FAILURE, NEVER A SKIP: T13
//   asserts F-B1 and F-B3 still hold a positive balance and F-B2 still holds
//   zero, by this script's own `balanceOf`.
//
// ── STANDING TALLY, 2026-09-08, BASE=http://localhost:3801 ────────────────
// 63/67 · 4 SKIP. The four reds are ONE bug, described immediately below, and
// they are the finding rather than a fault in this file. The SKIPs are T10 (the
// census has no row for F-B1 yet, so the page draws no card) and, on a run
// inside one step of the finalized tag, T4.
//
// ── ⚠️⚠️ A REAL BUG THIS FILE FOUND, AND DID NOT FIX ───────────────────────
// T3e, T3h, T7e and T7h go RED on any run whose T4 actually ran, and the cause
// is one fault in lib/sources/chain/morpho-base-vault-timeline.ts. On a run
// where T4 SKIPPED (see the note at the foot of this header) they are green,
// because nothing distrusted a tail on that run and the stored one still has
// its legs — so a GREEN T3h is only as strong as the T4 above it.
//
//   AFTER THE LOADER DISTRUSTS A TAIL, THE RE-SWEPT LIFE LOSES ITS ASSET LEGS,
//   AND THAT LEGLESS LIFE IS WHAT GETS STORED.
//
// `floor` is computed as `tail ? tail.cut + 1 : opts.fromBlock` BEFORE the gate
// runs, and `buildRows` is handed `sweepFrom(floor)`. When the gate distrusts a
// tail mid-request it re-sweeps the TRANSFERS from the vault's creation block —
// but the `Deposit` and `Withdraw` sweeps inside `buildRows` still start at the
// discarded tail's cut, so almost every row comes back with `assets: null`.
// That is what the request then offers the store, and every later warm request
// serves it.
//
// What a reader sees: the lifetime-flows tower draws "Deposited 0 / Withdrawn
// 0" for a life that deposited 227,244.708399 USDC and withdrew 227,048.053370,
// and every row loses its asset leg. A tail can therefore make this page WRONG,
// which is the one thing the design says it cannot do
// ("a tail can make a page slow and never wrong").
//   FAIL T3h — "warm: 3197 of 3197 deposit/withdrawal rows carry no assets;
//               cold: 0 of 3197"
//   FAIL T3e — "3197 of 3197 rows differ, e.g. 0xb2876dd9…:259 on assets
//               (warm null, cold 180000)"
//   FAIL T7e — "deposited 0/227244708399, withdrawn 0/227048053370"
//   FAIL T7h — "deposited: bar 0, own 227244.708399 | withdrawn: bar 0,
//               own 227048.05337"
// Reported rather than fixed: this file may not edit app code. The four reds
// are ONE cause and the blast radius is the point — the tower's asset side is
// drawn from those rows.
//
// ── PROVED IT CAN FAIL, 2026-09-08, BASE=http://localhost:3801 ─────────────
// Three breaks, applied ONE AT A TIME to the real source and reverted; the
// exact red lines follow. Each was run whole, and each run also carried the
// four reds above, which are the standing bug and not the break.
//
//  D  THE LOADER STORED ABOVE `finalized` — `cut: opts.blockNumber` instead of
//     `cut: finalized as number` in the store branch of
//     lib/sources/chain/morpho-base-vault-timeline.ts, i.e. the page's own
//     block instead of the lane's finality answer. 60/65.
//     FAIL T2b — "stored cut 51057803, own finalized 51057201"
//     🔑 T2c stayed GREEN, and that is right: 602 blocks is inside its window,
//     because its subject is "a finality answer rather than a fixed distance
//     behind the head" and 602 blocks IS about where the tag sits on this
//     chain. Only a check with its OWN finality read can tell the two apart,
//     which is T2b.
//     🔑 T2d also stayed green: it asserts the rows sit at or below the cut the
//     STORE states, and this break moved both together.
//     🔑 The break left the store holding a cut above the tag, and the RESTORE
//     at the foot of this file could not write over it — the store takes a
//     strictly higher cut only. It SKIPPED and said so, which is what that
//     guard is for.
//
//  E  THE FLOOR PATH STATED ITS COUNT AS A FACT — `logCountIsLowerBound: false`
//     on the refused-sweep branch. 58/66.
//     FAIL T6a — "lowerBound false, floor 12799, reconcile null, 0 rows"
//     FAIL T6b — "This address has 12,799 of its own share transfers on this
//                 vault, more than this page draws. The whole history was read
//                 and it reconciles against the vault's own balanceOf…"
//     FAIL T12c — "F-B8 floor 5345 lowerBound false; F-B5 exact 8686"
//     FAIL T12e — "floor 6521, 0 rows, tail 404"
//     🔑🔑 T6b's red line is the finding, not the flag: with the bound dropped
//     the page states a walk's floor as a census AND claims a balance check
//     that never ran (`reconcile` is null on that path). Two false statements
//     from one boolean.
//     🔑 T6c stayed GREEN: nothing was stored either way. The "states it as a
//     fact" half and the "stores it" half are separate checks because they are
//     separate failures.
//
//  F  TRANSFERS SUMMED INTO THE MINTED BAR — `lifetimeInflow: minted +
//     inShares` on the share side in lib/aave-vaults/position-economics.ts.
//     58/63.
//     FAIL T7i — "minted: bar 1792.997881302664, own 0"
//     ⚠️⚠️ T7c AND T7h's MINTED LINE STAYED GREEN, and that is why T7i exists.
//     F-B1 has 3,197 mints and burns and NOT ONE transfer, so on it the two
//     buckets never meet and the break is invisible — the same cannot-fail trap
//     the Ethereum sibling closed with its own T7c2. F-B10 is the opposite
//     shape (five transfers in, one out, no mint at all) and the break moves
//     its minted bar off zero, which is exactly what a reader would see.
//
//  G  THE SECTION'S MARK DELETED — `VaultsIdentity` made to return null.
//     62/67.
//     FAIL T14 — "no mark on the position page"
//     🔑 Recorded against the chain-scoped section, before rails-ops decision
//     0028 moved the vault under Morpho Blue Base. The mark this proved is
//     gone; T14 now holds the EXPLORER's rail to the same standard, and the
//     break that would fail it is the same one — a way back that goes quiet.
//
// ── A NOTE ON T4's SKIPs ────────────────────────────────────────────────────
// T4b–T4d need to write a poisoned tail at a cut BELOW the correct one the
// loader is about to write, and the store replaces a value only when the new
// cut is strictly HIGHER (measured: an equal cut is "Conflict — cutBlock does
// not advance the stored tail", 409). Base's `finalized` tag STEPS rather than
// creeping — 643 to 795 blocks at a time — so two runs inside one step leave no
// room and T4b–T4d SKIP OUT LOUD naming that. A run whose T4 skipped has not
// tested the distrust path; wait for the tag to move and run again.
//
import { chromium } from "playwright";
import { createPublicClient, http, parseAbi, parseAbiItem, toEventSelector } from "viem";
import { base } from "viem/chains";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = process.env.BASE ?? "http://localhost:3801";
const CHAIN = 8453;

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.BASE_RPC_URL) throw new Error("need BASE_RPC_URL in .env.local");
if (!env.BASE_BACKFILL_RPC_URL) throw new Error("need BASE_BACKFILL_RPC_URL in .env.local");

// ⚠️⚠️ NO LANE URL EVER REACHES THE OUTPUT. viem puts the endpoint it called
// into every error it throws — URL, key and all — so an unhandled one prints
// the key to whatever is reading this run. Measured on the first run of this
// file: a 429 from the log lane printed the whole endpoint. Both terminal
// handlers below scrub anything URL-shaped out of the message before it is
// written, and the lanes are named by env var NAME only.
const scrub = (text) => String(text).replace(/https?:\/\/[^\s"'`)}\]]+/g, "<lane URL redacted>");
for (const signal of ["uncaughtException", "unhandledRejection"])
  process.on(signal, (error) => {
    console.error(`\nFAILED (${signal}) — ${scrub(error?.stack ?? error?.message ?? error)}`);
    process.exit(1);
  });

// ── the catalogue, for each vault's own creation block ──────────────────────
const catalogSrc = fs.readFileSync(path.join(ROOT, "lib/morpho-base/vault-catalog.ts"), "utf8");
const CREATED = (() => {
  const flat = catalogSrc.match(/const ROWS[^=]*=\s*\[([\s\S]*?)\n\];/)[1].replace(/\s+/g, " ");
  const str = `("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')`;
  const re = new RegExp(`\\[ ?"(0x[0-9a-f]{40})" ?, ?(\\d) ?, ?(\\d+) ?, ?${str} ?, ?${str} ?, ?(\\d+) ?,? ?\\]`, "g");
  const rows = [...flat.matchAll(re)];
  const expected = (flat.match(/\[ ?"0x/g) || []).length;
  if (rows.length !== expected) throw new Error(`vault-catalog parse read ${rows.length} of ${expected} rows`);
  return new Map(rows.map((m) => [m[1], Number(m[3])]));
})();

// ── the fixtures, as INPUTS ─────────────────────────────────────────────────
const CASE_STUDY = "0xbeefe94c8ad530842bfe7d8b397938ffc1cb83b2";
const F_B1 = { vault: CASE_STUDY, holder: "0x211bc3a35a5aba59531e00703a2768e966154d18" };
const F_B2 = { vault: CASE_STUDY, holder: "0xaffd3c3cd06cf499deddf78b26868018a93f2c31" };
const F_B3 = { vault: CASE_STUDY, holder: "0x63408832d25d0c91e2d70d606320170407091794" };
const F_B4 = { vault: CASE_STUDY, holder: "0x255c7705e8bb334dfcae438197f7c4297988085a" };
const F_B5 = { vault: CASE_STUDY, holder: "0x25c10987091f98bff0f48a5bd24d7b3bf3419c52" };
/** F-B10 — case study / 0xe228… — a life made ENTIRELY of plain transfers: five
 *  in, one out, not a single mint. The tower's own fixture for the split, and
 *  the only shape on which a build that summed transfers into the MINTED bar is
 *  visible at all: on F-B1, which has 3,197 mints and burns and no transfers,
 *  the two buckets never meet and the break cannot be seen. */
const F_B10 = { vault: CASE_STUDY, holder: "0xe228c34252bd874c489c2a99e03476162d74db02" };
const F_B8 = {
  vault: "0xee8f4ec5672f09119b96ab6fb59c27e1b7e44b61",
  holder: "0x82c30b9db2e3b92ace4e1593b32890dcf8612d03",
};
const F_B9 = {
  vault: "0xbeef010f9cb27031ad51e3333f9af9c6b1228183",
  holder: "0x255c7705e8bb334dfcae438197f7c4297988085a",
};
for (const f of [F_B1, F_B2, F_B3, F_B4, F_B5, F_B8, F_B9, F_B10])
  if (!CREATED.has(f.vault)) throw new Error(`fixture vault ${f.vault} is not in the catalogue`);

/** The two policy figures this page holds to, and the tail's own loader
 *  version, restated here rather than read out of the source: an expectation
 *  taken from the thing under test cannot catch a change to it.
 *
 *  `HORIZON` is `VAULT_TIMELINE_HORIZON` — the largest life built and drawn in
 *  one request, and the DRAW WINDOW a longer one is cut to on the way to the
 *  browser. `CEILING` is `tailMaxRows(8453)` — the largest life Rails stores at
 *  all on Base, above which the rows are withheld. It is PER CHAIN as of
 *  2026-09-09; Base's own figure did not move when it was split. Both in
 *  lib/shared/vault-holder-timeline.ts. */
const HORIZON = 5000;
const CEILING = 11000;
const LOADER_VERSION = 2;
/** THE DRAW WINDOW — `VAULT_TIMELINE_DRAW_ROWS` in
 *  lib/shared/vault-holder-timeline.ts (= `TIMELINE_WINDOW_EVENTS`), the newest
 *  N rows of ANY tier that cross to the browser (rails-ops decision 0019,
 *  amended 2026-09-10). It is NOT `HORIZON` — a life at or under HORIZON is
 *  still built and gated whole, but only its newest DRAW_ROWS are serialised. */
const DRAW_ROWS = 1000;
/** `WINDOW_CHUNK` in components/shared/chain-truth-timeline.tsx and the run
 *  spec's own floor (`MIN_VAULT_RUN` in lib/aave-vaults/timeline-runs.tsx),
 *  both restated for the same reason. */
// Mirrors TIMELINE_PAGE_ROWS in lib/shared/timeline-opening-balance.ts — move it with it.
const WINDOW_CHUNK = 50;
const MIN_RUN = 3;
const RUN_KINDS = new Set(["deposit", "withdrawal"]);
/** The word target of the section's own copy charter, likewise restated. */
const WORDS_WITH_HOLDER = 600;

const client = createPublicClient({
  chain: base,
  transport: http(env.BASE_RPC_URL, { batch: false, retryCount: 3, timeout: 120_000 }),
});

const TRANSFER = toEventSelector(
  parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"),
);
const DEPOSIT = toEventSelector(
  parseAbiItem("event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)"),
);
const WITHDRAW = toEventSelector(
  parseAbiItem(
    "event Withdraw(address indexed sender, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)",
  ),
);
const VAULT_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function feeRecipient() view returns (address)",
]);

let failures = 0;
let passes = 0;
let skipped = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (cond) passes++;
  else failures++;
};
const skip = (name, why) => {
  console.log(`SKIP  ${name} — ${why}`);
  skipped++;
};

/** The only `extra` a STORED row ever carries — `BARE_EXTRA` in
 *  lib/sources/chain/morpho-base-vault-timeline.ts, restated here because every
 *  body this script sends the store must be the shape the loader would send.
 *  The allocation band is a READING re-made over the newest rows on every
 *  request; a body of this script's that carried one would put a derived figure
 *  into the store and T2j would then be red about this file. (Measured: the
 *  restore's first version sent the route's own rows and left 80 banded rows in
 *  the store.) */
const BARE_EXTRA = {
  kind: "metamorpho",
  totalSupplyAtBlock: null,
  holderSharesAtBlock: null,
  allocation: null,
  allocatedTotal: null,
};
const bare = (rows) => rows.map((r) => ({ ...r, extra: BARE_EXTRA }));

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const pad32 = (a) => `0x${"0".repeat(24)}${a.toLowerCase().replace(/^0x/, "")}`;
const tailOf = (t) => (t ? `0x${t.slice(26)}`.toLowerCase() : ZERO_ADDR);
const hex = (n) => `0x${BigInt(n).toString(16)}`;
const word = (data, i) => BigInt(`0x${data.slice(2 + i * 64, 2 + (i + 1) * 64)}`);
const n = (v) => v.toLocaleString("en-US");

// ── this script's own chain reads ───────────────────────────────────────────
// The log lane is called by hand rather than through viem, for two reasons the
// first run of this file made plain: viem's errors carry the endpoint, and a
// whole-life sweep on a shared key answers 429 under any concurrency. So the
// request is raw, its errors name the lane by ENV VAR NAME, and a rate-limit
// answer is waited out rather than retried into the same wall.
//
// ⚠️ A REFUSAL ON RESPONSE SIZE IS A CHAIN ANSWER AND MUST STILL THROW: T12
// reads it as the finding. It is distinguished from a transport failure by its
// own JSON-RPC error, which is carried on the thrown error as `rpcCode`.
async function rpcLogs(method, params, { attempts = 6 } = {}) {
  let wait = 1500;
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(env.BASE_BACKFILL_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: attempt, method, params }),
      });
    } catch (error) {
      if (attempt >= attempts) throw new Error(`${method} on BASE_BACKFILL_RPC_URL: ${scrub(error.message)}`);
      await new Promise((r) => setTimeout(r, wait));
      wait *= 2;
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= attempts) throw new Error(`${method} on BASE_BACKFILL_RPC_URL: HTTP ${res.status}`);
      await new Promise((r) => setTimeout(r, wait));
      wait *= 2;
      continue;
    }
    const json = await res.json();
    if (json.error) {
      const error = new Error(`${method} on BASE_BACKFILL_RPC_URL: ${scrub(json.error.message ?? "refused")}`);
      error.rpcCode = json.error.code;
      throw error;
    }
    return json.result;
  }
}
const getLogs = (address, topics, fromBlock, toBlock) =>
  rpcLogs("eth_getLogs", [{ address, topics, fromBlock: hex(fromBlock), toBlock: hex(toBlock) }]);

/** The lane's own `finalized` block, asked of the node — never `latest − k`.
 *  On Base the tag STEPS rather than creeping, so the distance behind head is
 *  a chain answer and never a constant this script could assume. */
async function ownFinalized() {
  const block = await rpcLogs("eth_getBlockByNumber", ["finalized", false]);
  return Number(BigInt(block.number));
}

/** This script's own whole-life reduction of one position at one block: the
 *  merged transfer logs, the six lifetime sums the tower draws, and the running
 *  balance at any cut. Nothing here consults the page. */
async function ownLife(vault, holder, blockNumber) {
  const who = holder.toLowerCase();
  const from = CREATED.get(vault);
  // SERIALISED, not in parallel: four whole-life sweeps at once on a shared key
  // answer 429 on compute units, and a retry into the same wall is not a fix.
  const out = await getLogs(vault, [TRANSFER, pad32(who), null], from, blockNumber);
  const into = await getLogs(vault, [TRANSFER, null, pad32(who)], from, blockNumber);
  const dep = await getLogs(vault, [DEPOSIT, null, pad32(who)], from, blockNumber);
  const wit = await getLogs(vault, [WITHDRAW, null, null, pad32(who)], from, blockNumber);
  const seen = new Set();
  const transfers = [...out, ...into]
    .filter((l) => {
      const k = `${l.transactionHash}:${l.logIndex}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) =>
      BigInt(a.blockNumber) === BigInt(b.blockNumber)
        ? Number(BigInt(a.logIndex) - BigInt(b.logIndex))
        : Number(BigInt(a.blockNumber) - BigInt(b.blockNumber)),
    );

  // The asset leg, claimed once each on (transaction, share count) — the same
  // pairing rule the loader uses, restated so a change to it is visible here.
  const legs = { deposit: [...dep], withdraw: [...wit] };
  const claimLeg = (kind, txHash, shares) => {
    const pool = kind === "deposit" ? legs.deposit : legs.withdraw;
    const i = pool.findIndex((l) => l.transactionHash === txHash && word(l.data, 1) === shares);
    if (i < 0) return null;
    return word(pool.splice(i, 1)[0].data, 0);
  };

  let balance = 0n;
  const rows = [];
  const sums = { minted: 0n, burned: 0n, in: 0n, out: 0n, deposited: 0n, withdrawn: 0n };
  const counts = { mints: 0, burns: 0, in: 0, out: 0, self: 0, legless: 0 };
  for (const l of transfers) {
    const fromAddr = tailOf(l.topics[1]);
    const to = tailOf(l.topics[2]);
    const value = BigInt(l.data);
    let delta = 0n;
    if (to === who) delta += value;
    if (fromAddr === who) delta -= value;
    balance += delta;
    const kind =
      fromAddr === ZERO_ADDR && to === who
        ? "deposit"
        : to === ZERO_ADDR && fromAddr === who
          ? "withdrawal"
          : fromAddr === who && to === who
            ? "transfer-self"
            : to === who
              ? "transfer-in"
              : "transfer-out";
    let assets = null;
    if (kind === "deposit") {
      sums.minted += value;
      counts.mints += 1;
      assets = claimLeg("deposit", l.transactionHash, value);
      if (assets == null) counts.legless += 1;
      else sums.deposited += assets;
    } else if (kind === "withdrawal") {
      sums.burned += value;
      counts.burns += 1;
      assets = claimLeg("withdraw", l.transactionHash, value);
      if (assets == null) counts.legless += 1;
      else sums.withdrawn += assets;
    } else if (kind === "transfer-in") {
      sums.in += value;
      counts.in += 1;
    } else if (kind === "transfer-out") {
      sums.out += value;
      counts.out += 1;
    } else {
      counts.self += 1;
    }
    rows.push({
      id: `${l.transactionHash}:${Number(BigInt(l.logIndex))}`,
      blockNumber: Number(BigInt(l.blockNumber)),
      logIndex: Number(BigInt(l.logIndex)),
      kind,
      sharesDelta: delta.toString(),
      balanceAfter: balance.toString(),
      assets: assets == null ? null : assets.toString(),
    });
  }
  const balanceAt = (cut) => {
    let b = 0n;
    for (const r of rows) if (r.blockNumber <= cut) b += BigInt(r.sharesDelta);
    return b;
  };
  return {
    logsIn: into.length,
    logsOut: out.length,
    transfers: transfers.length,
    rows,
    sums,
    counts,
    balance,
    balanceAt,
    assetless: counts.in + counts.out + counts.self,
  };
}

/** THIS SCRIPT's own grouping of the route's rows into the runs the shared
 *  timeline collapses. The rule is restated (see `MIN_RUN` above) so a change
 *  to it goes red rather than being read off the page. */
function ownRuns(events) {
  const outRows = [];
  let i = 0;
  while (i < events.length) {
    if (!RUN_KINDS.has(events[i].kind)) {
      outRows.push({ kind: "event", events: [events[i]] });
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < events.length && events[j].kind === events[i].kind) j += 1;
    if (j - i >= MIN_RUN) outRows.push({ kind: "run", events: events.slice(i, j) });
    else for (let k = i; k < j; k++) outRows.push({ kind: "event", events: [events[k]] });
    i = j;
  }
  return outRows;
}

// ── the page and the routes ─────────────────────────────────────────────────
const routeUrl = (f, qs = "") => `${BASE}/api/chain/morpho-base/vault?vault=${f.vault}&holder=${f.holder}${qs}`;
const pageUrl = (f) => `${BASE}/base/morpho/vaults/${f.vault}/${f.holder}`;
const tailUrl = (f) =>
  `${BASE}/api/vaults/positions/tail?chain=${CHAIN}&vault=${f.vault}&holder=${f.holder}&loaderVersion=${LOADER_VERSION}`;

async function readRoute(url, { attempts = 3 } = {}) {
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const started = Date.now();
    const res = await fetch(url);
    const json = res.status === 200 ? await res.json() : null;
    last = { status: res.status, json, ms: Date.now() - started };
    // A 500 from the dev server on one request is a bad minute, not a finding
    // about the page: without this a single one ended the run and hid every
    // check after it (measured on the first run of this file).
    if (res.status === 200 && json?.timeline) return last;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return last;
}
const readTail = async (f) => {
  const res = await fetch(tailUrl(f));
  return { status: res.status, json: res.status === 200 ? await res.json() : null };
};
const putTail = async (f, body) => {
  const res = await fetch(tailUrl(f), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
};

/** Visible words as the reader sees them: rendered `innerText`, never the RSC
 *  payload and never `body.textContent` — a `hidden` drawer's prose is not on
 *  the face, and the payload made an earlier vault check vacuous. */
async function pageRead(browser, url, { expandRuns = false, growWindow = false } = {}) {
  const page = await browser.newPage();
  const started = Date.now();
  const res = await page.goto(url, { waitUntil: "networkidle", timeout: 180_000 });
  const status = res?.status() ?? 0;
  const ms = Date.now() - started;
  // ⚠️ THE WINDOW IS GROWN INSIDE ONE VISIT. Two page loads are two requests at
  // two blocks, and a claim moves between them — measured: F-B1's claim went
  // 253,861,818 → 253,861,831 across two loads, which a before/after comparison
  // across visits read as "the window moved the tower". So the tower is read
  // BEFORE the click and again after it, in the same document.
  let towerBefore = null;
  let paintedBefore = null;
  if (growWindow) {
    ({ towerBefore, paintedBefore } = await page.evaluate(() => {
      const el = document.querySelector("[data-vault-flows-tower]");
      const t = {};
      if (el) for (const a of el.attributes) if (a.name.startsWith("data-")) t[a.name] = a.value;
      return {
        towerBefore: t,
        paintedBefore: document.querySelectorAll("[data-vault-timeline-rows] [data-event-id]").length,
      };
    }));
    const more = page.locator("[data-vault-timeline-rows] button", { hasText: /^Show \d/ });
    if ((await more.count()) > 0) {
      await more.first().click({ force: true });
      await page.waitForTimeout(800);
    }
  }
  if (expandRuns)
    for (let guard = 0; guard < 40; guard++) {
      const toOpen = page.locator("[data-vault-timeline-rows] [aria-label*='expand the run']");
      if ((await toOpen.count()) === 0) break;
      await toOpen.first().click({ force: true });
      await page.waitForTimeout(250);
    }
  const out = await page.evaluate(() => {
    const q = (s, a) => document.querySelector(s)?.getAttribute(a) ?? null;
    return {
      text: document.body.innerText,
      historySource: q("[data-history-source]", "data-history-source"),
      historyCut: q("[data-history-source]", "data-history-cut"),
      historyTail: q("[data-history-source]", "data-history-tail-rows"),
      historyHead: q("[data-history-source]", "data-history-head-rows"),
      historyText: document.querySelector("[data-history-source]")?.innerText ?? "",
      pageBlock: Number(q("[data-vault-block]", "data-vault-block")),
      cardId: q("[data-position-card]", "data-position-card"),
      cardPresent: !!document.querySelector("[data-position-card]"),
      cardReceipts: !!document.querySelector("[data-position-card]")?.closest("[data-skel-section='detail-card']"),
      cardExplanation: [...document.querySelectorAll("[data-skel-section='detail-card'] button")]
        .map((b) => `${b.innerText.trim()} ${b.getAttribute("aria-label") ?? ""}`.trim())
        .join(" | "),
      cardSharesRaw: q("[data-position-card]", "data-shares-raw"),
      cardValueUsdE8: q("[data-position-card]", "data-value-usd-e8"),
      cardStatus: q("[data-position-card]", "data-status"),
      towerPresent: !!document.querySelector("[data-vault-flows-tower]"),
      tower: {
        minted: q("[data-vault-flows-tower]", "data-minted-raw"),
        burned: q("[data-vault-flows-tower]", "data-burned-raw"),
        in: q("[data-vault-flows-tower]", "data-transferred-in-raw"),
        out: q("[data-vault-flows-tower]", "data-transferred-out-raw"),
        deposited: q("[data-vault-flows-tower]", "data-deposited-assets-raw"),
        withdrawn: q("[data-vault-flows-tower]", "data-withdrawn-assets-raw"),
        shares: q("[data-vault-flows-tower]", "data-shares-now-raw"),
        claim: q("[data-vault-flows-tower]", "data-claim-now-raw"),
        assetless: q("[data-vault-flows-tower]", "data-assetless-rows"),
        // The figures the BARS are drawn from, after the feeder decided which
        // bucket each flow belongs in — a different claim from the raw sums.
        barMinted: q("[data-vault-flows-tower]", "data-tower-minted"),
        barReceived: q("[data-vault-flows-tower]", "data-tower-received"),
        barBurned: q("[data-vault-flows-tower]", "data-tower-burned"),
        barOut: q("[data-vault-flows-tower]", "data-tower-transferred-out"),
        barShares: q("[data-vault-flows-tower]", "data-tower-shares-now"),
        barDeposited: q("[data-vault-flows-tower]", "data-tower-deposited"),
        barWithdrawn: q("[data-vault-flows-tower]", "data-tower-withdrawn"),
        barClaim: q("[data-vault-flows-tower]", "data-tower-claim-now"),
      },
      rowCountAttr: Number(q("[data-vault-timeline-rows]", "data-vault-timeline-rows")),
      // The WHOLE life the wrapper was cut from — `data-vault-timeline-rows`
      // is now the DRAWN window (≤ DRAW_ROWS), not the whole life.
      vaultTimelineOf: q("[data-vault-timeline-rows]", "data-vault-timeline-of"),
      timelineToolbar: !!document.querySelector(
        "[data-vault-timeline-rows] [data-skel-section='detail-timeline-header']",
      ),
      // A lone event card carries the event's id; a collapsed run is one row
      // whose aria-label states how many members it stands for and of what.
      // Both selectors in ONE query, so the array is in document order.
      timelineRows: [
        ...document.querySelectorAll(
          "[data-vault-timeline-rows] [data-event-id], [data-vault-timeline-rows] [aria-label*='consecutive']",
        ),
      ].map((el) => {
        const label = el.getAttribute("aria-label");
        if (label && / consecutive /.test(label)) {
          const m = /^(\d[\d,]*) consecutive (\w+?)s? —/.exec(label);
          return { kind: "run", count: m ? Number(m[1].replace(/,/g, "")) : null, member: m ? m[2] : null };
        }
        return { kind: "event", id: el.getAttribute("data-event-id") };
      }),
      paintedEvents: document.querySelectorAll("[data-vault-timeline-rows] [data-event-id]").length,
      // The rail — the reader's way back from inside a position. The vault
      // belongs to Morpho Blue Base (rails-ops decision 0028), so the row is
      // that explorer's own RailHeader and the chain-scoped section's mark is
      // gone; both are asserted at T14.
      identity: [...document.querySelectorAll('nav[aria-label="Explorer sections"]')].map((nav) => ({
        tabs: [...nav.querySelectorAll("a")].map((a) => a.getAttribute("href")),
        lit: [...nav.querySelectorAll('a[aria-current="page"]')].map((a) => a.getAttribute("href")),
      })),
      railIdentity: [...document.querySelectorAll("[data-rail-identity]")].map((a) => a.getAttribute("href")),
      backRow: document.querySelectorAll("[data-back-row]").length,
      sectionMark: document.querySelectorAll("[data-vaults-identity]").length,
      horizonText: document.querySelector("[data-figure='timeline-horizon']")?.innerText ?? "",
      windowText: document.querySelector("[data-figure='timeline-window']")?.innerText ?? "",
      buildingText: document.querySelector("[data-figure='timeline-building']")?.innerText ?? "",
      reconciledText: document.querySelector("[data-figure='timeline-reconciled']")?.innerText ?? "",
      unreconciledText: document.querySelector("[data-figure='timeline-unreconciled']")?.innerText ?? "",
      // The boundary card (rails-ops decision 0019) — "+N earlier events".
    };
  });
  const proseWords = await page.evaluate(() => {
    const rows = document.querySelector("[data-vault-timeline-rows]")?.innerText ?? "";
    const w = (t) => t.split(/\s+/).filter(Boolean).length;
    return w(document.body.innerText) - w(rows);
  });
  const towerAll = await page.evaluate(() => {
    const el = document.querySelector("[data-vault-flows-tower]");
    const t = {};
    if (el) for (const a of el.attributes) if (a.name.startsWith("data-")) t[a.name] = a.value;
    return t;
  });
  await page.close();
  out.words = out.text.split(/\s+/).filter(Boolean).length;
  out.proseWords = proseWords;
  out.towerBefore = towerBefore;
  out.paintedBefore = paintedBefore;
  out.towerAll = towerAll;
  out.ms = ms;
  out.status = status;
  return out;
}

const browser = await chromium.launch();
console.log(`\n── /base/morpho/vaults/<vault>/<holder> · ${BASE} ──`);
console.log(`   lanes: BASE_RPC_URL present, BASE_BACKFILL_RPC_URL present (names only; no URL is printed)\n`);

// ═══ T0 ═══════════════════════════════════════════════════════════════════
// `?tail=0` on the route here on purpose: T0 must not be the request that
// stores. T4 below writes a poisoned tail at a cut BELOW the correct one the
// loader is about to write, and a storing T0 would leave no room for it.
const r0 = await readRoute(routeUrl(F_B3, "&tail=0"));
check("T0a F-B3's route answers 200", r0.status === 200, `status ${r0.status}`);
check(
  "T0b the route's JSON carries a history statement",
  !!r0.json?.timeline?.history && typeof r0.json.timeline.history.source === "string",
  JSON.stringify(r0.json?.timeline?.history ?? null),
);
if (r0.status !== 200) {
  console.log("\nThe route did not answer — nothing below can be judged.");
  await browser.close();
  process.exit(1);
}
const p3 = await pageRead(browser, pageUrl(F_B3));
check(
  "T0c F-B3's page answers 200 and draws its tower and its timeline rows",
  p3.status === 200 && p3.towerPresent && p3.rowCountAttr > 0,
  `status ${p3.status}, tower ${p3.towerPresent}, ${p3.rowCountAttr} rows on the wrapper`,
);

// ═══ T1 — the cold path ════════════════════════════════════════════════════
const cold = await readRoute(routeUrl(F_B1, "&tail=0"));
const coldTl = cold.json.timeline;
const f1Own = await ownLife(F_B1.vault, F_B1.holder, coldTl.blockNumber);
check(
  "T1a with ?tail=0 the history is the chain's alone",
  coldTl.history.source === "chain" && coldTl.history.cut === null && coldTl.history.tailRows === 0,
  JSON.stringify(coldTl.history),
);
check(
  "T1b it stores nothing either — ?tail=0 refuses both halves",
  coldTl.history.storedThisRequest === false,
  `storedThisRequest ${coldTl.history.storedThisRequest}`,
);
const coldRows = coldTl.events.slice().reverse();
const coldWantRows = Math.min(DRAW_ROWS, f1Own.rows.length);
// coldRows is only the newest window, so it must be compared against the
// matching TAIL of the own replay, not the own replay's head.
const coldOwnWindow = f1Own.rows.slice(-coldWantRows);
const badT1c = coldRows.filter(
  (r, i) =>
    !coldOwnWindow[i] ||
    r.id !== coldOwnWindow[i].id ||
    r.sharesDelta !== coldOwnWindow[i].sharesDelta ||
    r.balanceAfter !== coldOwnWindow[i].balanceAfter,
);
check(
  "T1c every cold row is wei-exact against this script's own replay",
  coldRows.length === coldWantRows &&
    (coldTl.coverage.drawn ? coldTl.coverage.drawn.of === f1Own.rows.length : coldWantRows === f1Own.rows.length) &&
    badT1c.length === 0,
  badT1c.length
    ? badT1c
        .slice(0, 2)
        .map((r) => `${r.id} page ${r.balanceAfter}`)
        .join(" | ")
    : `${coldWantRows} of ${f1Own.rows.length} rows (page ${coldRows.length}), own balance ${f1Own.balance}`,
);
check(
  "T1d the rows are newest first",
  coldTl.events.every(
    (r, i) =>
      i === 0 ||
      r.blockNumber < coldTl.events[i - 1].blockNumber ||
      (r.blockNumber === coldTl.events[i - 1].blockNumber && r.logIndex < coldTl.events[i - 1].logIndex),
  ),
  `${coldTl.events.length} rows drawn`,
);
check(
  "T1e and the gate compared that replay against this script's own balanceOf",
  coldTl.reconcile.reconciled === true && coldTl.reconcile.replayed === f1Own.balance.toString(),
  `page ${coldTl.reconcile.replayed}, own ${f1Own.balance}`,
);

// ═══ T4 — the tail cannot lie ═════════════════════════════════════════════
// This runs BEFORE T2 on purpose. The store replaces a value only when the new
// cut is HIGHER than the one it holds (a lower one is a 409), so a poisoned
// tail has to be written at a cut BELOW the correct one the loader will write —
// which is the same order a real deployment sees: something wrong is in the
// store, and the next request replaces it.
//
// ⚠️ THE POISON IS A SHORT PREFIX, NOT THE WHOLE LIFE, and its cut is far below
// finality. Two reasons, both measured on this file's first run:
//   • `usableTail` refuses a tail carrying `timestamp: 0` on any row, and the
//     route's own rows carry it wherever the timestamp wave did not answer —
//     443 of F-B1's 3,197 on one read. A poison built from those is thrown away
//     on the way OUT, and T4c/T4d would then be green for a reason that has
//     nothing to do with the gate. So the prefix is short enough for this
//     script to read the missing block timestamps ITSELF.
//   • A cut far below finality leaves the head large, which is what makes the
//     loader's own re-store rule fire on the next request.
// The body's sweep counts are set to satisfy the store's shape rule and nothing
// else: this body is a fabrication, and the only field of it that is true is
// its rows.
const finalizedBeforePoison = await ownFinalized();
const existing = await readTail(F_B1);
const poisonCut = finalizedBeforePoison - 1;
const poisonable = !existing.json || existing.json.cutBlock < poisonCut;
/** How far below finality the RESTORE at the foot of this file writes its tail.
 *  A cut below the tag is still final, and leaving this much room is what lets
 *  the NEXT run write a poison under it — the store refuses a lower cut with a
 *  409, so a restore written at the tag itself locks T4 out until the tag has
 *  stepped. Measured: on Base it steps 643 to 795 blocks at a time. */
const RESTORE_MARGIN = 900;
// EVERY ROW THE STORE WILL TAKE, and no more: the rows at or below the cut that
// carry a real block time. The ones the route left at `timestamp: 0` are left
// out — `usableTail` refuses a tail carrying one, so a body containing them
// would be discarded on the way OUT and T4c would then be green for a reason
// that has nothing to do with the gate. Leaving them out is itself part of what
// makes this body a poison: it is self-consistent and it is missing real rows.
const bodyRows = bare(coldRows.filter((r) => r.blockNumber <= poisonCut && r.timestamp > 0));
const droppedForTime = coldRows.filter((r) => r.blockNumber <= poisonCut).length - bodyRows.length;
let bodySum = 0n;
for (const r of bodyRows) bodySum += BigInt(r.sharesDelta);
const baseBody = {
  chainId: CHAIN,
  vault: F_B1.vault,
  holder: F_B1.holder,
  loaderVersion: LOADER_VERSION,
  cutBlock: poisonCut,
  cutBalance: bodySum.toString(),
  logsIn: bodyRows.length,
  logsOut: bodyRows.length,
  lane: "BASE_BACKFILL_RPC_URL",
  storedAt: new Date().toISOString(),
  rows: bodyRows,
};
console.log(
  `      · the poison body: ${bodyRows.length} rows to block ${n(poisonCut)}, ${droppedForTime} of the life's rows left out because the route returned no block time for them; finality is at ${n(finalizedBeforePoison)}`,
);

// (a) an off-by-one body. The store re-sums; a store that did not would take
//     it, so this check can only pass by OBSERVING the refusal.
const r4a = await putTail(F_B1, { ...baseBody, cutBalance: (bodySum + 1n).toString() });
check(
  "T4a the store REFUSES a body whose rows do not add up (422)",
  r4a.status === 422 && /SUM_MISMATCH|does not equal/.test(r4a.text),
  `status ${r4a.status} · ${r4a.text.slice(0, 150)}`,
);

let poisonWritten = false;
if (!poisonable) {
  const why =
    `a tail is already stored at cut ${existing.json?.cutBlock}, at or above the cut a poison could take ` +
    `(${poisonCut}); the store refuses a lower cut with a 409. Clear the position's tail, or wait for the fixture's ` +
    `life to grow, and run again. A run whose T4 skipped has not tested the distrust path.`;
  skip("T4b a self-consistent tail missing one real row is accepted by the store", why);
  skip("T4c the loader distrusts it and re-sweeps the whole life, drawing the cold path's rows wei-exact", why);
  skip("T4d the poison does not survive — the store ends up holding this script's OWN Σ at a higher cut", why);
} else {
  // (b) a SELF-CONSISTENT tail with one real row removed. It adds up to its own
  //     rows, so the store takes it — the store cannot know a row is missing.
  // One MORE row removed, deliberately, so the body is a poison even on a run
  // where the block-time wave answered whole and `droppedForTime` is zero.
  const dropIndex = bodyRows.findIndex((r) => BigInt(r.sharesDelta) !== 0n);
  const kept = bodyRows.filter((_, i) => i !== dropIndex);
  let keptSum = 0n;
  for (const r of kept) keptSum += BigInt(r.sharesDelta);
  const r4b = await putTail(F_B1, { ...baseBody, cutBalance: keptSum.toString(), rows: kept });
  check(
    "T4b …and ACCEPTS one that does add up, even with a real row missing (the store cannot know)",
    r4b.status === 200 || r4b.status === 201,
    `status ${r4b.status} · ${r4b.text.slice(0, 130)}`,
  );
  poisonWritten = r4b.status === 200 || r4b.status === 201;
  const poisoned = await readRoute(routeUrl(F_B1));
  const pt = poisoned.json.timeline;
  const poisonedRows = pt.events.slice().reverse();
  const drift = poisonedRows.filter(
    (r, i) =>
      !coldRows[i] ||
      r.id !== coldRows[i].id ||
      r.sharesDelta !== coldRows[i].sharesDelta ||
      r.balanceAfter !== coldRows[i].balanceAfter,
  );
  check(
    "T4c the loader distrusts it and re-sweeps the whole life, drawing the cold path's rows wei-exact",
    pt.reconcile.reconciled === true &&
      pt.history.source === "chain" &&
      poisonedRows.length >= coldRows.length &&
      drift.length === 0,
    `source ${pt.history.source}, ${poisonedRows.length} rows against ${coldRows.length} cold, reconciled ${pt.reconcile.reconciled}, ${drift.length} rows differing`,
  );
}

// ═══ T2 — the stored tail, and its cut is the lane's own finalized ════════
// ⚠️ THE STORE IS OFFERED, NOT GUARANTEED, ON ANY ONE REQUEST. The loader keeps
// a tail only when EVERY row it would store carries a real timestamp
// (`wholeRows` in lib/sources/chain/morpho-base-vault-timeline.ts — 0 is 1970,
// not "unread"), and the timestamp wave over a 3,000-row life does not always
// answer whole. Measured on this file's first run: 443 of 3,197 rows came back
// at 0 on one read and 31 on another. So the storing load is REPEATED until the
// store holds a tail, and how many attempts it took is reported — a statement
// about the lane, not a relaxation of the check.
let storeAttempts = 0;
let t2 = { status: 404, json: null };
let lastStoring = null;
for (; storeAttempts < 5; storeAttempts++) {
  lastStoring = await readRoute(routeUrl(F_B1));
  await new Promise((r) => setTimeout(r, 6000));
  t2 = await readTail(F_B1);
  // A tail that is still the poison is not a store: its cut is the poison's.
  if (t2.status === 200 && (!poisonWritten || t2.json.cutBlock > poisonCut)) break;
}
const finalizedNow = await ownFinalized();
check(
  "T2a the proxy serves a stored tail for F-B1, above any poison, after a normal load",
  t2.status === 200 && (!poisonWritten || t2.json.cutBlock > poisonCut),
  `status ${t2.status} after ${storeAttempts + 1} load(s); cut ${t2.json?.cutBlock ?? "—"}, poison cut ${poisonCut}; last request said storedThisRequest ${lastStoring?.json?.timeline?.history?.storedThisRequest}`,
);
if (poisonWritten)
  check(
    "T4d the poison does not survive — the store ends up holding a tail at a HIGHER cut",
    t2.status === 200 && t2.json.cutBlock > poisonCut,
    `stored cut ${t2.json?.cutBlock ?? "—"} against poison cut ${poisonCut}`,
  );
if (t2.status !== 200) {
  for (const name of [
    "T2b the stored cut is at or below the lane's OWN finalized block",
    "T2c the cut is a finality answer, not a fixed distance behind the head",
    "T2d every stored row sits at or below the cut",
    "T2e the stored rows are ascending",
    "T2f the stored cutBalance equals this script's own Σ deltas at that cut",
    `T2g the tail is keyed to loader version ${LOADER_VERSION}`,
    "T2h it names the lane by env var NAME and carries no URL",
    "T2i no stored row carries a placeholder timestamp — 0 is 1970, not unread",
    "T2j NO stored row carries an allocation band — the band is never stored",
  ])
    skip(name, `the store answered no tail for F-B1 after ${storeAttempts + 1} loads, so there is nothing to judge`);
} else {
  const t = t2.json;
  check(
    "T2b the stored cut is at or below the lane's OWN finalized block",
    t.cutBlock <= finalizedNow,
    `stored cut ${t.cutBlock}, own finalized ${finalizedNow}`,
  );
  // ONE STEP, not a constant. On Base the tag sits 643 to 795 blocks behind
  // head and moves in jumps, so a cut written a moment before this read can be
  // a whole step behind the answer read now. 1,600 blocks is two of those steps
  // — wide enough for the tag to have moved between the two reads, narrow
  // enough that a cut computed as `latest − 10,000` fails it.
  check(
    "T2c the cut is a finality answer, not a fixed distance behind the head",
    finalizedNow - t.cutBlock < 1600,
    `own finalized ${finalizedNow} less stored cut ${t.cutBlock} = ${finalizedNow - t.cutBlock} blocks`,
  );
  const above = t.rows.filter((r) => r.blockNumber > t.cutBlock);
  check(
    "T2d every stored row sits at or below the cut",
    above.length === 0,
    above.length ? `row at block ${above[0].blockNumber} is above the cut this script read` : `${t.rows.length} rows`,
  );
  let ascending = true;
  for (let i = 1; i < t.rows.length; i++)
    if (
      t.rows[i].blockNumber < t.rows[i - 1].blockNumber ||
      (t.rows[i].blockNumber === t.rows[i - 1].blockNumber && t.rows[i].logIndex < t.rows[i - 1].logIndex)
    )
      ascending = false;
  check("T2e the stored rows are ascending", ascending, `${t.rows.length} rows`);
  const ownCut = f1Own.balanceAt(t.cutBlock);
  check(
    "T2f the stored cutBalance equals this script's own Σ deltas at that cut",
    t.cutBalance === ownCut.toString(),
    `store ${t.cutBalance}, own ${ownCut}`,
  );
  check(
    `T2g the tail is keyed to loader version ${LOADER_VERSION}`,
    t.loaderVersion === LOADER_VERSION,
    `loaderVersion ${t.loaderVersion}`,
  );
  check(
    "T2h it names the lane by env var NAME and carries no URL",
    t.lane === "BASE_BACKFILL_RPC_URL" && !/https?:\/\//.test(JSON.stringify(t)),
    `lane ${t.lane}`,
  );
  const placeholders = t.rows.filter((r) => !(r.timestamp > 0));
  check(
    "T2i no stored row carries a placeholder timestamp — 0 is 1970, not unread",
    placeholders.length === 0,
    placeholders.length ? `${placeholders.length} rows at timestamp 0` : `${t.rows.length} rows all timestamped`,
  );
  // The allocation band is a READING of what the vault's asset sat in at that
  // block, re-read on every request over the newest rows. Storing it would keep
  // a derived figure — the one thing a tail may never hold.
  const banded = t.rows.filter((r) => r.extra?.allocation != null || r.extra?.allocatedTotal != null);
  check(
    "T2j NO stored row carries an allocation band — the band is never stored",
    banded.length === 0,
    banded.length
      ? `${banded.length} of ${t.rows.length} rows carry a band, e.g. ${banded[0].id}`
      : `${t.rows.length} rows, every band null`,
  );
  // A stored row is never read again, so a null there is unread for good. Three
  // v1 tails held 1,608 of them (rails-ops TO-DO-infra §5.14, web f7bfbe2a).
  const unpricedStored = t.rows.filter((r) => r.sharePriceAtBlock == null);
  check(
    "T2k no stored row carries a null share price — a stored row is never read again, so null would be unread for good",
    unpricedStored.length === 0,
    unpricedStored.length
      ? `${unpricedStored.length} of ${t.rows.length} rows with no share price, first ${unpricedStored[0].id}`
      : `${t.rows.length} rows all priced`,
  );
}

// ═══ T3 — the warm path ═══════════════════════════════════════════════════
const warm = await readRoute(routeUrl(F_B1));
const warmTl = warm.json.timeline;
check(
  "T3a a second load reads the store and sweeps only the head",
  warmTl.history.source === "stored+head" && warmTl.history.cut != null,
  JSON.stringify(warmTl.history),
);
check(
  "T3b tailRows + headRows equals this script's own log count, drawn is the DRAW_ROWS window over it",
  warmTl.history.tailRows + warmTl.history.headRows === f1Own.rows.length &&
    warmTl.events.length === Math.min(DRAW_ROWS, f1Own.rows.length) &&
    (warmTl.coverage.drawn ? warmTl.coverage.drawn.of === f1Own.rows.length : true),
  `${warmTl.history.tailRows} + ${warmTl.history.headRows} = ${f1Own.rows.length} logs, ${warmTl.events.length} rows drawn`,
);
const warmOwn = await ownLife(F_B1.vault, F_B1.holder, warmTl.blockNumber);
check(
  "T3c the merged reconcile still states the WHOLE life's sweep counts",
  warmTl.reconcile.logsIn === warmOwn.logsIn && warmTl.reconcile.logsOut === warmOwn.logsOut,
  `page ${warmTl.reconcile.logsIn}/${warmTl.reconcile.logsOut}, own ${warmOwn.logsIn}/${warmOwn.logsOut}`,
);
check(
  "T3d and its receipt can name both halves of the replay",
  warmTl.reconcile.cutBalance === warmOwn.balanceAt(warmTl.history.cut).toString(),
  `page ${warmTl.reconcile.cutBalance}, own ${warmOwn.balanceAt(warmTl.history.cut)}`,
);
// The LOG FACTS are compared, not the whole row: `sharePriceAtBlock` is an
// archive call that either answered or did not, and a stored null is a stated
// unread figure rather than a different answer.
// ⚠️ `timestamp` IS NOT ONE OF THESE, and that is a finding rather than a
// convenience. The row grammar leaves `timestamp: 0` where the block-time wave
// did not answer, and on this chain it often does not — 443 of F-B1's 3,197
// rows came back at 0 on one cold read of this run and 31 on another. A STORED
// row can never carry it (the loader refuses to store a life with one), so a
// stored row and a swept one legitimately differ there: the store is the more
// complete of the two. T3e compares the log facts; T3g compares the timestamps
// where BOTH answered, and states how many the cold path left unread.
const FACTS = ["id", "blockNumber", "logIndex", "kind", "sharesDelta", "balanceAfter", "assets"];
const warmRows = warmTl.events.slice().reverse();
const badT3e = warmRows.filter((r, i) => coldRows[i] && FACTS.some((f) => String(r[f]) !== String(coldRows[i][f])));
check(
  "T3e a stored row states the same log facts a swept one does",
  warmRows.length === coldRows.length && badT3e.length === 0,
  badT3e.length
    ? `${badT3e.length} of ${warmRows.length} rows differ, e.g. ` +
        badT3e
          .slice(0, 2)
          .map((r, i) => {
            const f = FACTS.find((k) => String(r[k]) !== String(coldRows[warmRows.indexOf(r)]?.[k]));
            return `${r.id} on ${f} (warm ${r[f]}, cold ${coldRows[warmRows.indexOf(r)]?.[f]})`;
          })
          .join(" | ")
    : `${warmRows.length} rows compared on ${FACTS.length} fields`,
);
const coldUnread = coldRows.filter((r) => !(r.timestamp > 0)).length;
const timeDisagree = warmRows.filter(
  (r, i) => coldRows[i] && coldRows[i].timestamp > 0 && r.timestamp > 0 && r.timestamp !== coldRows[i].timestamp,
);
check(
  "T3g where both paths read a block time, the two agree — and a stored row never carries the 1970 placeholder",
  timeDisagree.length === 0 && warmRows.filter((r) => !(r.timestamp > 0)).length <= coldUnread,
  timeDisagree.length
    ? timeDisagree[0].id
    : `${coldUnread} of ${coldRows.length} cold rows had no block time; ${warmRows.filter((r) => !(r.timestamp > 0)).length} on the warm path`,
);
// ⚠️⚠️⚠️ THIS CHECK FOUND A REAL BUG AND IS EXPECTED RED UNTIL IT IS FIXED.
// A row's ERC-4626 leg — the `assets` a `Deposit` or `Withdraw` names — is a
// LOG FACT, and a stored row must carry it. On the warm path it does not: every
// one of F-B1's 3,197 deposit and withdrawal rows comes back with
// `assets: null` after the store has been written, and the lifetime-flows tower
// then draws "Deposited 0 / Withdrawn 0" for a life that deposited 227,244.71
// USDC and withdrew 227,048.05.
//
// THE CAUSE, read off lib/sources/chain/morpho-base-vault-timeline.ts: `floor`
// is computed as `tail ? tail.cut + 1 : opts.fromBlock` BEFORE the gate runs,
// and `buildRows` is handed `sweepFrom(floor)` — so when the gate distrusts a
// tail mid-request and re-sweeps the TRANSFERS from the vault's creation block,
// the `Deposit`/`Withdraw` sweeps still start at the discarded tail's cut. The
// re-swept life comes back with no legs, and THAT is what gets stored. Every
// later warm request then serves it.
//
// A tail can therefore make this page WRONG, which is the one thing the design
// says it cannot do. Reported rather than fixed: this file may not edit app
// code. T7e and T7h below go red for the same cause, and that blast radius is
// the point — the asset side of the tower is drawn from these rows.
const legsWarm = warmTl.events.filter((r) => r.kind === "deposit" || r.kind === "withdrawal");
const legsWarmNull = legsWarm.filter((r) => r.assets == null).length;
const legsCold = coldRows.filter((r) => r.kind === "deposit" || r.kind === "withdrawal");
const legsColdNull = legsCold.filter((r) => r.assets == null).length;
check(
  "T3h a stored row keeps its ERC-4626 asset leg — a Deposit's `assets` is a log fact, not a derived figure",
  legsWarmNull <= legsColdNull,
  `warm: ${legsWarmNull} of ${legsWarm.length} deposit/withdrawal rows carry no assets; cold: ${legsColdNull} of ${legsCold.length}`,
);

// THE PRICE IS COMPARED ROW BY ROW AND A NULL IS NOT SKIPPED, as in the
// Ethereum script's T3f. A null on the warm path is a stored row that will
// never be read again or a head read that did not answer; a null on the cold
// path is a read that did not answer after the loader's own retry. None of the
// three is a quiet lane's answer. The route serves F-B1's newest DRAW_ROWS, so
// this judges the served window; a row behind it is judged where it is kept,
// by T2k. (Found by the break test: a null put on F-B1's fourth-oldest row
// passed here, because no path served that row.)
const unpricedWarm = warmRows.filter((r) => r.sharePriceAtBlock == null).length;
const unpricedCold = coldRows.filter((r) => r.sharePriceAtBlock == null).length;
const badT3i = warmRows.filter((r, i) => coldRows[i] && r.sharePriceAtBlock !== coldRows[i].sharePriceAtBlock);
check(
  "T3i every served row on both paths carries a share price, and the two agree",
  warmRows.length > 0 && unpricedWarm === 0 && unpricedCold === 0 && badT3i.length === 0,
  unpricedWarm || unpricedCold || badT3i.length
    ? `${unpricedWarm} warm rows and ${unpricedCold} cold rows with no share price; ${badT3i.length} rows differ${badT3i.length ? `, first ${badT3i[0].id}` : ""}`
    : `${warmRows.length} prices read on each path, all equal`,
);

const f1Page = await pageRead(browser, pageUrl(F_B1));
check(
  "T3f the page states the split under the timeline heading",
  f1Page.historySource === "stored+head" &&
    /from Rails's store of chain readings/.test(f1Page.historyText) &&
    /read now/.test(f1Page.historyText) &&
    /reconciled at block/.test(f1Page.historyText),
  f1Page.historyText.replace(/\s+/g, " ").slice(0, 160),
);
console.log(
  `      · timing (informational): cold route ${cold.ms} ms, warm route ${warm.ms} ms, warm page ${f1Page.ms} ms on F-B1`,
);

// ═══ T5 — a heavy life the lane hands over whole: built, then drawn windowed ═
//
// ⚠️ 2026-09-09 — T5 WAS "ABOVE THE HORIZON WITH AN EXACT COUNT, WITHHELD". A
// life the lane answers whole and that is at or below CEILING is no longer
// refused: it is BUILT into Rails's store a chunk of blocks at a time across
// visits, and drawn once whole with its newest HORIZON rows serialised. The
// withheld path this used to cover is T6's floor and T12's, both untouched:
// on this chain the largest lives are refused by the lane rather than counted,
// so a floor IS the Tier 2 shape here.
const T5_LIFECYCLE_VISITS = 6;
const T5_WAIT_MS = 30_000;
const T5_STORE_WAIT_MS = 25_000;

/** One visit: the route, and what the store holds once this visit's own write
 *  has landed. The write is queued in `after()`, so a tail read taken the
 *  instant the response arrives answers 404 or the previous cut — this waits
 *  for the store to reach the cut the page claimed. The cut may be past that
 *  claim by then, because the continuation keeps building behind the response;
 *  that is progress, not disagreement. */
async function lifecycleVisit(f) {
  const r = await readRoute(routeUrl(f));
  const t = r.json?.timeline ?? null;
  const wanted = t?.history?.building?.keptCut ?? null;
  let stored = await readTail(f);
  if (wanted != null) {
    const until = Date.now() + T5_STORE_WAIT_MS;
    while (Date.now() < until && !(stored.status === 200 && (stored.json?.cutBlock ?? -1) >= wanted)) {
      await new Promise((r) => setTimeout(r, 2000));
      stored = await readTail(f);
    }
  }
  return {
    ms: r.ms,
    events: t?.events?.length ?? null,
    drawn: t?.coverage?.drawn ?? null,
    building: t?.history?.building ?? null,
    reconciled: t?.reconcile?.reconciled ?? null,
    logCount: t?.coverage?.logCount ?? null,
    lowerBound: t?.coverage?.logCountIsLowerBound ?? null,
    withheld: t?.coverage?.withheldAbove ?? null,
    storeStatus: stored.status,
    storeCut: stored.json?.cutBlock ?? null,
    storeRows: stored.json?.rows?.length ?? null,
  };
}

const r5 = await readRoute(routeUrl(F_B5, "&tail=0"));
if (!r5.json?.timeline) {
  console.log(`\nFAILED — F-B5's route answered ${r5.status} with no timeline; nothing below it can be judged.`);
  await browser.close();
  process.exit(1);
}
const t5 = r5.json.timeline;
check(
  "T5a with ?tail=0 a heavy life is withheld with an EXACT count and a PASSING gate — there is no store to build into",
  t5.events.length === 0 &&
    t5.coverage.withheldAbove === t5.coverage.logCount &&
    t5.coverage.logCount > HORIZON &&
    t5.coverage.logCount <= CEILING &&
    t5.coverage.logCountIsLowerBound === false &&
    t5.reconcile?.reconciled === true &&
    t5.history.building == null,
  `${t5.coverage.withheldAbove} logs, lowerBound ${t5.coverage.logCountIsLowerBound}, reconciled ${t5.reconcile?.reconciled}, ${t5.events.length} rows drawn`,
);

let t5Final = null;
{
  let previousCut = -1;
  let stalled = null;
  let sawBuild = false;
  for (let visit = 1; visit <= T5_LIFECYCLE_VISITS; visit++) {
    const v = await lifecycleVisit(F_B5);
    console.log(
      `      · F-B5 visit ${visit}: ${v.ms} ms · ${v.building ? `building ${v.building.keptRows}/${v.building.totalRows} at block ${v.building.keptCut}` : `drawn ${v.events} of ${v.drawn?.of ?? v.events}`} · store ${v.storeStatus}${v.storeCut ? ` cut ${v.storeCut}, ${v.storeRows} rows` : ""}`,
    );
    if (!v.building) {
      t5Final = v;
      break;
    }
    sawBuild = true;
    if (v.storeStatus !== 200 || v.storeCut < v.building.keptCut || v.storeRows < v.building.keptRows)
      stalled = `visit ${visit}: page says ${v.building.keptRows} rows at block ${v.building.keptCut}, store answers ${v.storeStatus} cut ${v.storeCut} with ${v.storeRows} rows`;
    else if (v.building.keptCut <= previousCut)
      stalled = `visit ${visit}: cut ${v.building.keptCut} did not advance past ${previousCut}`;
    if (stalled) break;
    previousCut = v.building.keptCut;
    if (visit < T5_LIFECYCLE_VISITS) await new Promise((r) => setTimeout(r, T5_WAIT_MS));
  }
  check(
    "T5b F-B5 reaches the drawn state, and no mid-build visit failed to advance the stored cut",
    stalled === null && t5Final !== null,
    stalled ??
      (t5Final
        ? `drawn after ${sawBuild ? "the build" : "no build"}, ${t5Final.events} rows of ${t5Final.logCount}`
        : `still building after ${T5_LIFECYCLE_VISITS} visits`),
  );
  // ⚠️ The store is LIVE AND SHARED, so a run that finds this life already built
  // never sees a mid-build state and the progress assertion judges nothing. It
  // says which of the two happened rather than passing quietly.
  if (t5Final && !sawBuild)
    skip(
      "T5b2 the mid-build progress assertion",
      "the store already holds this life whole, so no visit was mid-build — point BASE at a Tier 1 position nothing has built yet to exercise the advance",
    );
  else
    check(
      "T5b2 a mid-build state was actually observed, so the progress assertion above had something to judge",
      sawBuild,
      sawBuild ? `last mid-build cut ${previousCut}` : "no mid-build visit and no drawn visit either",
    );
}

if (!t5Final) {
  skip("T5c the window over F-B5's life", "the life had not finished building");
  skip("T5d the page states both figures and draws its rows", "the life had not finished building");
} else {
  const b5Own = await ownLife(F_B5.vault, F_B5.holder, r5.json.blockNumber);
  const wantRows = Math.min(DRAW_ROWS, b5Own.rows.length);
  check(
    "T5c the newest DRAW_ROWS of this script's own life, with its own whole-life count stated beside them",
    t5Final.events === wantRows &&
      t5Final.drawn?.rows === wantRows &&
      t5Final.drawn?.of >= b5Own.rows.length &&
      t5Final.withheld === null,
    `route ${t5Final.events} rows, drawn ${JSON.stringify(t5Final.drawn)}; own life ${b5Own.rows.length} rows`,
  );
  const p5 = await pageRead(browser, pageUrl(F_B5));
  check(
    "T5d the page draws its window, states the life it was cut from, and carries the tower over the WHOLE life",
    p5.paintedEvents > 0 &&
      p5.rowCountAttr === wantRows &&
      Number(p5.vaultTimelineOf) === b5Own.rows.length &&
      p5.towerPresent &&
      BigInt(p5.tower?.minted ?? "-1") === b5Own.sums.minted &&
      BigInt(p5.tower?.burned ?? "-1") === b5Own.sums.burned &&
      BigInt(p5.tower?.in ?? "-1") === b5Own.sums.in &&
      BigInt(p5.tower?.out ?? "-1") === b5Own.sums.out,
    `${p5.paintedEvents} rows painted, wrapper ${p5.rowCountAttr}/${p5.vaultTimelineOf}; tower ${p5.towerPresent}; page minted ${p5.tower?.minted}, own ${b5Own.sums.minted}`,
  );
  // NO BOUNDARY-CARD CLAIM HERE, and that is not an omission. At the bottom of
  // a DRAWN list the boundary is a bare spine node with no text of its own
  // (`TimelineBoundaryRow`); the card survives in one place only — an empty
  // list, where there are no rows to speak for it (components/shared/
  // chain-truth-timeline.tsx, 2026-09-11). The shortfall this page states is
  // the count line's, and that ground is held by
  // verify-timeline-boundary-card.mjs's own vault fixtures (`vault-base` is
  // this very page family, with `vault-eth`, `vault-eth-mid` and a control).
  // A check here for `[data-figure='timeline-boundary']` cannot pass: it asks a
  // drawn list for an element the design removed from it.
}

// ── T5f no stored tail carries an unread share price ────────────────────────
// Every fixture this script leads the store to hold, read back whole. T2k
// holds F-B1 alone; the unread prices that reached the store were in the heavy
// lives (0x25c1…9c52, F-B5, held 804 in v1), which only this read covers. A
// run where the store held none of them has judged nothing, so that is red.
const t5fTails = [];
for (const [name, f] of [
  ["F-B1", F_B1],
  ["F-B3", F_B3],
  ["F-B5", F_B5],
]) {
  const tail = await readTail(f);
  if (tail.status !== 200) continue;
  const rows = tail.json?.rows ?? [];
  t5fTails.push({ name, rows: rows.length, unpriced: rows.filter((r) => r.sharePriceAtBlock == null).length });
}
check(
  "T5f no tail the store holds for a fixture carries a null share price",
  t5fTails.length > 0 && t5fTails.every((t) => t.unpriced === 0),
  t5fTails.length
    ? t5fTails.map((t) => `${t.name} ${t.unpriced} of ${t.rows} unpriced`).join(" · ")
    : "the store holds no tail for any fixture, so nothing was judged",
);

// ═══ T6 — THE FLOOR PATH ══════════════════════════════════════════════════
const r6 = await readRoute(routeUrl(F_B4));
const t6 = r6.json.timeline;
check(
  "T6a F-B4 takes the floor path: a lower-bound count, no gate, and no rows",
  t6.coverage.logCountIsLowerBound === true &&
    t6.coverage.withheldAbove > HORIZON &&
    t6.reconcile === null &&
    t6.events.length === 0,
  `lowerBound ${t6.coverage.logCountIsLowerBound}, floor ${t6.coverage.withheldAbove}, reconcile ${JSON.stringify(t6.reconcile)}, ${t6.events.length} rows`,
);
const p6 = await pageRead(browser, pageUrl(F_B4));
check(
  "T6b the page says 'at least' that count and states NO count as a fact",
  /at least/.test(p6.horizonText) &&
    p6.horizonText.includes(n(t6.coverage.withheldAbove)) &&
    /a floor rather than a census/.test(p6.horizonText) &&
    p6.paintedEvents === 0 &&
    !p6.towerPresent &&
    !p6.reconciledText,
  `"${p6.horizonText.replace(/\s+/g, " ").slice(0, 170)}"`,
);
const t6Tail1 = await readTail(F_B4);
await pageRead(browser, pageUrl(F_B4));
await new Promise((r) => setTimeout(r, 4000));
const t6Tail2 = await readTail(F_B4);
check(
  "T6c the tail GET answers 404, and a second load leaves it answering 404 — the floor path stores nothing",
  t6Tail1.status === 404 && t6Tail2.status === 404,
  `first ${t6Tail1.status}, after a second load ${t6Tail2.status}`,
);

// ═══ T7 — the tower ═══════════════════════════════════════════════════════
// The tower's figures are the PAGE's own reading, so every expectation here is
// re-derived at the block the PAGE states — not at the block a separate route
// call happened to answer at, which is a different moment.
const f1TowerOwn = await ownLife(F_B1.vault, F_B1.holder, f1Page.pageBlock);
const f1Claim = await client.readContract({
  address: F_B1.vault,
  abi: VAULT_ABI,
  functionName: "convertToAssets",
  args: [f1TowerOwn.balance],
  blockNumber: BigInt(f1Page.pageBlock),
});
check("T7a F-B1 draws a lifetime-flows tower", f1Page.towerPresent, `tower present ${f1Page.towerPresent}`);
check(
  "T7b the shares now equal this script's own balanceOf, and the claim its own convertToAssets",
  f1Page.tower.shares === f1TowerOwn.balance.toString() && f1Page.tower.claim === f1Claim.toString(),
  `shares ${f1Page.tower.shares} vs own ${f1TowerOwn.balance}; claim ${f1Page.tower.claim} vs own ${f1Claim}`,
);
check(
  "T7c minted is MINTS ALONE — transfers in are a separate line, never added into it",
  f1Page.tower.minted === f1TowerOwn.sums.minted.toString() && f1Page.tower.in === f1TowerOwn.sums.in.toString(),
  `page minted ${f1Page.tower.minted}, own mints ${f1TowerOwn.sums.minted}, own transfers in ${f1TowerOwn.sums.in}`,
);
check(
  "T7d burned and transferred out are this script's own sums",
  f1Page.tower.burned === f1TowerOwn.sums.burned.toString() && f1Page.tower.out === f1TowerOwn.sums.out.toString(),
  `burned ${f1Page.tower.burned}/${f1TowerOwn.sums.burned}, out ${f1Page.tower.out}/${f1TowerOwn.sums.out}`,
);
check(
  "T7e the asset side is the contract's own Deposit and Withdraw words",
  f1Page.tower.deposited === f1TowerOwn.sums.deposited.toString() &&
    f1Page.tower.withdrawn === f1TowerOwn.sums.withdrawn.toString(),
  `deposited ${f1Page.tower.deposited}/${f1TowerOwn.sums.deposited}, withdrawn ${f1Page.tower.withdrawn}/${f1TowerOwn.sums.withdrawn}`,
);
check(
  "T7f the share ledger reconciles wei-exact: mints + in − burns − out IS balanceOf",
  BigInt(f1Page.tower.minted) + BigInt(f1Page.tower.in) - BigInt(f1Page.tower.burned) - BigInt(f1Page.tower.out) ===
    f1TowerOwn.balance,
  `own balance ${f1TowerOwn.balance}`,
);
check(
  "T7g the rows that moved shares and no asset are COUNTED, never converted",
  Number(f1Page.tower.assetless) === f1TowerOwn.assetless,
  `page ${f1Page.tower.assetless}, own ${f1TowerOwn.assetless}`,
);
// ⚠️⚠️ …and the same claims about the BARS, which is what a reader sees. The
// raw attributes above are the REDUCER's sums; these come out of the feeder,
// after the decision about which bucket each flow belongs in. A build that
// summed transfers into the minted bar moves only these — the cannot-fail trap
// the Ethereum sibling found and closed with its own T7c2.
const SHARE_DECIMALS = coldTl.events[0]?.shareDecimals ?? 18;
const ASSET_DECIMALS = coldTl.events[0]?.assetDecimals ?? 6;
const scaled = (raw, decimals) => String(Number(raw) / Math.pow(10, decimals));
const barMismatch = [
  ["minted", f1Page.tower.barMinted, scaled(f1TowerOwn.sums.minted, SHARE_DECIMALS)],
  ["received", f1Page.tower.barReceived, scaled(f1TowerOwn.sums.in, SHARE_DECIMALS)],
  ["burned", f1Page.tower.barBurned, scaled(f1TowerOwn.sums.burned, SHARE_DECIMALS)],
  ["transferred out", f1Page.tower.barOut, scaled(f1TowerOwn.sums.out, SHARE_DECIMALS)],
  ["shares now", f1Page.tower.barShares, scaled(f1TowerOwn.balance, SHARE_DECIMALS)],
  ["deposited", f1Page.tower.barDeposited, scaled(f1TowerOwn.sums.deposited, ASSET_DECIMALS)],
  ["withdrawn", f1Page.tower.barWithdrawn, scaled(f1TowerOwn.sums.withdrawn, ASSET_DECIMALS)],
].filter(([, page, own]) => page !== own);
check(
  "T7h …and the BARS carry the same split — a transfer never lands in the minted bar",
  barMismatch.length === 0,
  barMismatch.length
    ? barMismatch.map(([k, page, own]) => `${k}: bar ${page}, own ${own}`).join(" | ")
    : "7 bar figures against this script's own sums",
);

// ── the same split, on a life made ENTIRELY of transfers ──────────────────
// ⚠️⚠️ THIS IS THE FIXTURE THE MINTED BAR IS ACTUALLY TESTED ON. F-B1 has 3,197
// mints and burns and NOT ONE transfer, so `minted` and `received` never meet
// there and a build that added transfers into the minted bar would leave T7c
// and T7h green. F-B10 is the opposite shape — five transfers in, one out, no
// mint at all — so the same break moves its minted bar off zero.
const p10 = await pageRead(browser, pageUrl(F_B10));
const own10 = await ownLife(F_B10.vault, F_B10.holder, p10.pageBlock);
const bar10Bad = [
  ["minted", p10.tower.barMinted, scaled(own10.sums.minted, SHARE_DECIMALS)],
  ["received", p10.tower.barReceived, scaled(own10.sums.in, SHARE_DECIMALS)],
  ["burned", p10.tower.barBurned, scaled(own10.sums.burned, SHARE_DECIMALS)],
  ["transferred out", p10.tower.barOut, scaled(own10.sums.out, SHARE_DECIMALS)],
].filter(([, page, own]) => page !== own);
check(
  "T7i on a life of plain transfers the minted bar is ZERO and the received bar carries the whole of it",
  p10.towerPresent &&
    own10.sums.minted === 0n &&
    own10.sums.in > 0n &&
    p10.tower.minted === "0" &&
    bar10Bad.length === 0,
  bar10Bad.length
    ? bar10Bad.map(([k, page, own]) => `${k}: bar ${page}, own ${own}`).join(" | ")
    : `${own10.counts.in} in, ${own10.counts.out} out, ${own10.counts.mints} mints — minted bar ${p10.tower.barMinted}, received bar ${p10.tower.barReceived}`,
);
check(
  "T7j and the rows that moved shares and no asset are COUNTED on it, never converted",
  Number(p10.tower.assetless) === own10.assetless && own10.assetless > 0,
  `page ${p10.tower.assetless}, own ${own10.assetless}`,
);

// ═══ T8 — the window is a render cap and nothing else ═════════════════════
// The tower above the rows is a WHOLE-LIFE sum; if it were reduced over what is
// PAINTED it would be a window's arithmetic presented as a lifetime's. So the
// tower is read, the reader's own "Show N more" is clicked, and it is read
// again — BOTH INSIDE ONE VISIT, because two loads are two blocks and the claim
// moves between them.
const f1Grown = await pageRead(browser, pageUrl(F_B1), { growWindow: true });
const beforeTower = f1Grown.towerBefore ?? {};
const afterTower = f1Grown.towerAll ?? {};
const movedByWindow = Object.keys(beforeTower).filter((k) => beforeTower[k] !== afterTower[k]);
check(
  "T8a growing the render window moves NO tower figure",
  f1Grown.paintedEvents > (f1Grown.paintedBefore ?? 0) &&
    Object.keys(beforeTower).length > 0 &&
    movedByWindow.length === 0,
  movedByWindow.length
    ? movedByWindow.map((k) => `${k}: ${beforeTower[k]} → ${afterTower[k]}`).join(" · ")
    : `${f1Grown.paintedBefore} → ${f1Grown.paintedEvents} cards painted, ${Object.keys(beforeTower).length} tower attributes unchanged`,
);
check(
  "T8b the wrapper's own count is the WHOLE life, not the painted window",
  Number(f1Page.vaultTimelineOf) === f1Own.rows.length &&
    f1Page.rowCountAttr === Math.min(DRAW_ROWS, f1Own.rows.length) &&
    f1Page.paintedEvents < f1Own.rows.length,
  `wrapper-of ${f1Page.vaultTimelineOf}, own ${f1Own.rows.length}, wrapper-drawn ${f1Page.rowCountAttr}, painted ${f1Page.paintedEvents}`,
);

// ═══ T9 — the rows ride the shared shell, and runs collapse ═══════════════
const f1Runs = ownRuns(coldTl.events);
const f1RunRows = f1Runs.filter((r) => r.kind === "run");
check(
  "T9a the fixture still has consecutive same-kind rows to collapse",
  f1RunRows.length > 0,
  `${coldTl.events.length} rows, own grouping gives ${f1RunRows.length} runs (longest ${Math.max(0, ...f1RunRows.map((r) => r.events.length))})`,
);
check(
  "T9b the timeline draws the shared toolbar",
  f1Page.timelineToolbar === true,
  `toolbar present ${f1Page.timelineToolbar}`,
);
check(
  "T9c at least one run row is painted COLLAPSED, standing for members that are not in the document",
  f1Page.timelineRows.some((r) => r.kind === "run" && r.count >= MIN_RUN) &&
    f1Page.paintedEvents <
      f1Page.timelineRows.length + f1Page.timelineRows.filter((r) => r.kind === "run").reduce((a, r) => a + r.count, 0),
  `${f1Page.timelineRows.filter((r) => r.kind === "run").length} run rows painted, ${f1Page.paintedEvents} event cards`,
);
const f1Expanded = await pageRead(browser, pageUrl(F_B1), { expandRuns: true });
check(
  "T9d expanding every run restores its member rows",
  f1Expanded.paintedEvents > f1Page.paintedEvents,
  `${f1Page.paintedEvents} cards collapsed → ${f1Expanded.paintedEvents} expanded`,
);

// ═══ T10 — the card is the listing's card ═════════════════════════════════
if (!f1Page.cardPresent) {
  const why =
    "the census has no row for this (vault, holder) pair yet — the card's CENSUS lane comes from the store " +
    "through the listing proxy, and the Base census tick is still refilling, so the page draws no card at all. " +
    "That is a fact about the census, not about the page; re-run when the tick has reached this vault.";
  skip("T10a the position page draws the listing's own card for this pair", why);
  skip("T10b it is the DETAIL render, with its own receipts scope", why);
  skip("T10c and that render carries the Explanation pane the listing row has no room for", why);
  skip("T10d and its shares are the PAGE's own reading, not a second block's", why);
} else {
  check(
    "T10a the position page draws the listing's own card for this pair",
    f1Page.cardId === `${F_B1.vault}:${F_B1.holder}`,
    `card ${f1Page.cardId}`,
  );
  check(
    "T10b it is the DETAIL render, which the listing's row is not — its own receipts scope",
    f1Page.cardReceipts === true,
    `inside the detail-card shell: ${f1Page.cardReceipts}`,
  );
  check(
    "T10c and that render carries the Explanation pane the listing row has no room for",
    /explanation/i.test(f1Page.cardExplanation),
    f1Page.cardExplanation || "(no heading buttons on the card)",
  );
  check(
    "T10d and its shares are the PAGE's own reading, not a second block's",
    f1Page.cardSharesRaw === f1TowerOwn.balance.toString(),
    `card ${f1Page.cardSharesRaw}, own balanceOf ${f1TowerOwn.balance} @ ${f1Page.pageBlock}`,
  );
}

// ═══ T11 — the words, and the phone ═══════════════════════════════════════
// ⚠️⚠️ A FIXED WORD CEILING WOULD BE A ROW-COUNT GATE HERE, NOT A COPY ONE, and
// this check was rewritten once for that reason. Measured this run: F-B3 (3
// rows) draws 1,075 visible words and F-B1 (3,197 rows) draws 3,699 — the
// difference is the ROWS, which are the life rather than the copy. The claim
// worth holding is that the page's own PROSE does not grow with the life: the
// words OUTSIDE the row list were 883 on a three-row life and 816 on a
// three-thousand-row one, and a page that restated something per row would move
// that number by a factor, not by eight per cent. Both counts are printed so a
// drift in either is visible even while the gate passes.
const proseGrowth = Math.abs(f1Page.proseWords - p3.proseWords) / Math.max(1, p3.proseWords);
check(
  "T11a the page's own prose does not grow with the life — the row list is the only thing that does",
  // The second half stops the gate being vacuous: the two fixtures must really
  // differ in length by a wide factor, or "the prose did not grow" says
  // nothing. `vaultTimelineOf` is the WHOLE life — `rowCountAttr` is now only
  // the DRAW_ROWS window, which is F-B1's own life (~3,249) rounded down to
  // 1,000 either way, but reading the true figure is what the claim is about.
  proseGrowth < 0.2 && Number(f1Page.vaultTimelineOf ?? f1Page.rowCountAttr) >= 100 * p3.rowCountAttr,
  `F-B3 (${p3.rowCountAttr} rows): ${p3.proseWords} prose words of ${p3.words}; F-B1 (${f1Page.vaultTimelineOf ?? f1Page.rowCountAttr} rows): ${f1Page.proseWords} of ${f1Page.words} — ${(proseGrowth * 100).toFixed(1)}% apart`,
);
const banned = [
  ...f1Page.text.matchAll(
    // APY/APR case-SENSITIVELY: "Apr" is April, and an en-GB date is the house
    // form on every row of the timeline below.
    /.{0,40}(\bAPY\b|\bAPR\b|per annum|annualised|annualized|\byield\b|\bprofit\b|P&L).{0,40}/g,
  ),
];
// Since mig 206 the card carries ONE dollar figure — Value · USD, the census's
// oracle read at the census block — so "no dollar sign" became "no dollar
// figure other than that stat": the count of `$` figures on the page equals one
// for an open, priced card and zero otherwise.
const dollarFigures = (f1Page.text.match(/\$\s?\d[\d,.]*[kMB]?/g) ?? []).length;
const expectedDollars = f1Page.cardStatus === "live" && f1Page.cardValueUsdE8 ? 1 : 0;
check(
  "T11b0 the only dollar figure on the position page is the card's Value · USD stat",
  dollarFigures === expectedDollars,
  `${dollarFigures} dollar figure(s), card ${f1Page.cardStatus ?? "?"} with value ${f1Page.cardValueUsdE8 || "unpriced"}`,
);
check(
  "T11b no rate or yield anywhere on the position page",
  banned.length === 0,
  banned.length
    ? banned
        .slice(0, 2)
        .map((m) => JSON.stringify(m[0].replace(/\s+/g, " ")))
        .join(" | ")
    : `${f1Page.words} visible words, none of them a priced or annualised figure`,
);
check(
  "T11c no 'you' / 'your' / 'depositor' on the position page",
  !/\byou\b|\byour\b|\bdepositor/i.test(f1Page.text),
  (f1Page.text.match(/\byou\b|\byour\b|\bdepositor\w*/gi) ?? []).join(", ") || "none",
);
const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
const phonePage = await phone.newPage();
await phonePage.goto(pageUrl(F_B3), { waitUntil: "networkidle", timeout: 180_000 });
const phoneWidth = await phonePage.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}));
await phonePage.close();
await phone.close();
check(
  "T11d the position page does not scroll sideways at 390px",
  phoneWidth.scrollWidth === 390,
  `document.scrollWidth ${phoneWidth.scrollWidth} at a 390px viewport (client ${phoneWidth.clientWidth})`,
);

// ═══ T14 — the rail the position page wears ═══════════════════════════════
// One Morpho Blue Base title, linking to that explorer, and no mark from the
// retired chain-scoped section. Since rails-ops TO-DO-ui-jobs 48 a position
// draws NO sub-nav: the tabs belong to the protocol, not to one holding, and
// none of them was ever lit here. The roster this position was reached
// through is the back control's fallback, which is the row below the title.
check(
  "T14 the position page carries exactly one Morpho Blue Base title linking to the explorer, no sub-nav, a back row, and no Vaults-section mark",
  f1Page.railIdentity.length === 1 &&
    f1Page.railIdentity[0] === "/base/morpho" &&
    f1Page.identity.length === 0 &&
    f1Page.backRow === 1 &&
    f1Page.sectionMark === 0,
  `${JSON.stringify(f1Page.railIdentity)}, ${f1Page.identity.length} sub-nav(s), ${f1Page.backRow} back row(s), ${f1Page.sectionMark} section mark(s)`,
);

// ═══ T12 — the floor is chosen by the REFUSAL ═════════════════════════════
// ⚠️⚠️ THE PREMISE IS THIS SCRIPT'S OWN REFUSED REQUEST. F-B8's holder IS the
// vault's `feeRecipient()`, and F-B4's is the case study's — so a loader that
// took the floor path FOR fee recipients would look identical on both. What
// tells the two apart is F-B5, which is above the horizon, is not refused, and
// gets an EXACT count. This section reads the lane itself: F-B8's whole-range
// sweep is refused and F-B5's answers, and the page's two answers follow that
// and not the contract's fee field.
const feeRecipient = (
  await client.readContract({ address: F_B8.vault, abi: VAULT_ABI, functionName: "feeRecipient" })
).toLowerCase();
check(
  "T12a F-B8's holder IS the vault's own feeRecipient(), by this script's own read",
  feeRecipient === F_B8.holder,
  `feeRecipient ${feeRecipient}, fixture ${F_B8.holder}`,
);
const headNow = Number(BigInt(await rpcLogs("eth_blockNumber", [])));
let b8Refused = false;
await getLogs(F_B8.vault, [TRANSFER, null, pad32(F_B8.holder)], CREATED.get(F_B8.vault), headNow).catch(() => {
  b8Refused = true;
});
let b5Refused = false;
await getLogs(F_B5.vault, [TRANSFER, null, pad32(F_B5.holder)], CREATED.get(F_B5.vault), headNow).catch(() => {
  b5Refused = true;
});
check(
  "T12b the lane REFUSES F-B8's whole-range sweep and ANSWERS F-B5's — which is the whole difference between them",
  b8Refused && !b5Refused,
  `F-B8 refused ${b8Refused}, F-B5 refused ${b5Refused}`,
);
const r12 = await readRoute(routeUrl(F_B8));
const t12 = r12.json.timeline;
check(
  "T12c F-B8 takes the floor path and stores nothing, and F-B5 — not refused — states an EXACT count",
  t12.coverage.logCountIsLowerBound === true &&
    t12.reconcile === null &&
    t12.history.storedThisRequest === false &&
    t5.coverage.logCountIsLowerBound === false,
  `F-B8 floor ${t12.coverage.withheldAbove} lowerBound ${t12.coverage.logCountIsLowerBound}; F-B5 exact ${t5.coverage.logCount}`,
);
const t12Tail = await readTail(F_B8);
check("T12d the store holds no tail for F-B8", t12Tail.status === 404, `status ${t12Tail.status}`);
// F-B9 is the largest life in this section; the lane refuses it too, and the
// page states a floor rather than the count. Asserted here rather than swept:
// a whole sweep is what the lane refuses, which is the point.
const r9 = await readRoute(routeUrl(F_B9));
const t9 = r9.json.timeline;
const t9Tail = await readTail(F_B9);
check(
  "T12e F-B9, the largest life here, is a floor as well, and nothing is stored for it",
  t9.coverage.logCountIsLowerBound === true &&
    t9.coverage.withheldAbove > HORIZON &&
    t9.events.length === 0 &&
    t9Tail.status === 404,
  `floor ${t9.coverage.withheldAbove}, ${t9.events.length} rows, tail ${t9Tail.status}`,
);

// ═══ T13 — the fixtures still are what they were ══════════════════════════
const [b1Bal, b2Bal, b3Bal] = await client.multicall({
  contracts: [F_B1, F_B2, F_B3].map((f) => ({
    address: f.vault,
    abi: VAULT_ABI,
    functionName: "balanceOf",
    args: [f.holder],
  })),
  allowFailure: false,
});
check(
  "T13a F-B1 and F-B3 still hold a positive balance and F-B2 still holds ZERO",
  b1Bal > 0n && b3Bal > 0n && b2Bal === 0n,
  `F-B1 ${b1Bal}, F-B2 ${b2Bal}, F-B3 ${b3Bal}`,
);
const b2 = await readRoute(routeUrl(F_B2, "&tail=0"));
const b2Tl = b2.json.timeline;
const b2Own = await ownLife(F_B2.vault, F_B2.holder, b2Tl.blockNumber);
check(
  "T13b F-B2's closed life replays to ZERO and the gate agrees with this script's own balanceOf",
  b2Tl.reconcile?.reconciled === true &&
    b2Tl.reconcile.replayed === "0" &&
    b2Own.balance === 0n &&
    b2Tl.events.length === Math.min(DRAW_ROWS, b2Own.rows.length),
  `page replayed ${b2Tl.reconcile?.replayed} over ${b2Tl.events.length} rows, own ${b2Own.balance} over ${b2Own.rows.length}`,
);
check(
  "T13c F-B1 is still a Tier 0 life and F-B5 still Tier 1 with an exact count",
  f1Own.rows.length < HORIZON &&
    t5.coverage.logCount > HORIZON &&
    t5.coverage.logCount <= CEILING &&
    t5.coverage.logCountIsLowerBound === false,
  `F-B1 ${f1Own.rows.length} rows, F-B5 ${t5.coverage.logCount}`,
);

// ═══ RESTORE — leave the store holding a WHOLE tail for F-B1 ══════════════
// T4 wrote a poison, and the request that distrusted it stored a life with no
// asset legs (T3h's finding), which every later warm page would then serve. The
// Ethereum sibling restores its fixture by loading the page once more; here
// that is not enough, because the loader would keep re-storing the same
// leg-less life. So the repair is written explicitly, from THIS SCRIPT's own
// cold rows — which carry the legs and the block times — at the lane's own
// finalized block, and the store is asked whether it took.
// As low under the tag as the store will take: a cut below finality is still
// final, and the lower it sits the more room the NEXT run has for its poison.
// The store refuses a cut lower than the one it holds, so it can never go below
// that — and on a run where those two collide, T4 says so and skips out loud
// rather than passing.
// The store takes a STRICTLY HIGHER cut and nothing else — measured: an equal
// cut is "Conflict — cutBlock does not advance the stored tail" (409). So the
// repair waits for the finalized tag to step past whatever the run left in the
// store, and says so out loud if it does not step in time rather than pretending
// the fixture was left whole.
const heldNow = (await readTail(F_B1)).json?.cutBlock ?? 0;
let finalizedAtRestore = await ownFinalized();
for (let wait = 0; wait < 6 && finalizedAtRestore <= heldNow; wait++) {
  await new Promise((r) => setTimeout(r, 45_000));
  finalizedAtRestore = await ownFinalized();
}
const restoreCut = Math.max(finalizedAtRestore - RESTORE_MARGIN, heldNow + 1);
const restoreRows = bare(coldRows.filter((r) => r.blockNumber <= restoreCut && r.timestamp > 0));
let restoreSum = 0n;
for (const r of restoreRows) restoreSum += BigInt(r.sharesDelta);
const restored = await putTail(F_B1, {
  chainId: CHAIN,
  vault: F_B1.vault,
  holder: F_B1.holder,
  loaderVersion: LOADER_VERSION,
  cutBlock: restoreCut,
  cutBalance: restoreSum.toString(),
  logsIn: f1Own.logsIn,
  logsOut: f1Own.logsOut,
  lane: "BASE_BACKFILL_RPC_URL",
  storedAt: new Date().toISOString(),
  rows: restoreRows,
});
const afterRestore = await readTail(F_B1);
const restoredLegless = (afterRestore.json?.rows ?? []).filter(
  (r) => (r.kind === "deposit" || r.kind === "withdrawal") && r.assets == null,
).length;
if (finalizedAtRestore <= heldNow)
  skip(
    "RESTORE the fixture is left with a whole tail",
    `the store holds a tail at cut ${n(heldNow)} and the lane's finalized tag has not stepped past it in four and a half minutes (it answers ${n(finalizedAtRestore)}). Nothing could be written over it: the store takes a strictly higher cut only. The fixture is left holding whatever the run above stored, which the next run — or the loader's own next store — replaces.`,
  );
else
  check(
    "RESTORE the fixture is left with a whole tail — this script's own rows, legs included, at the lane's own finalized block",
    (restored.status === 200 || restored.status === 201 || restored.status === 409) &&
      afterRestore.status === 200 &&
      restoredLegless === 0,
    `PUT ${restored.status} at cut ${n(restoreCut)} with ${restoreRows.length} rows; the store now holds ${afterRestore.json?.rows?.length ?? 0} rows, ${restoredLegless} of them legless`,
  );

await browser.close();
console.log(`\n${passes}/${passes + failures} checks passed${skipped ? ` · ${skipped} SKIP` : ""}`);
process.exit(failures ? 1 : 0);
