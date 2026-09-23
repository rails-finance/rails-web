#!/usr/bin/env node
// One holder's timeline inside one MetaMorpho vault on Base, checked against the
// chain rather than against itself. /base/morpho/vaults/<vault>/<holder>.
// ----------------------------------------------------------------------------
// EVERY EXPECTED FIGURE HERE IS THIS SCRIPT'S OWN CHAIN READ OR ITS OWN PARSE.
// Each page states the block it read at; this script then makes its OWN two
// `eth_getLogs` from BLOCK ZERO to that block, its OWN `Deposit` and `Withdraw`
// sweeps, its OWN `balanceOf`, and its OWN archive `convertToAssets(10 ** its
// own decimals() read)` and `totalSupply()` at every row's own block, and
// rebuilds the whole timeline from them — every row's kind, signed delta,
// running balance, asset leg, share price and denominator. The page's answer is
// then compared against that. The one thing taken from the page is the block
// number, which is check 0b's subject and not a source of truth for anything
// else.
//
// 🔑 THE SWEEPS HERE START AT BLOCK ZERO ON PURPOSE. The reader under test
// starts at the vault's CREATION block, from the catalogue. Sweeping from zero
// is the independent way to check that choice: if a vault ever emitted a
// `Transfer` before the block the catalogue names, this script finds it and the
// row counts disagree. Where the lane refuses a from-zero range on response
// size the fallback is stated in check 2e rather than passed over.
//
// AN EXPECTATION NEVER COMES FROM THE THING UNDER TEST. The reconcile gate's
// expectation is this script's own replay against its own `balanceOf` — check 1
// asserts the page drew a timeline IF AND ONLY IF this script's own gate
// passed, so a page that drew rows through a failed gate and a page that
// withheld them through a passing one both go red. The fixtures below are
// INPUTS — which vault, which address, which branch to expect — never expected
// figures.
//
// ⚠️ A FIXTURE THAT HAS EXITED IS A FAILURE, NEVER A SKIP. Check 12 asserts each
// fixture still holds a POSITIVE balance at the page's own block and FAILS if
// it does not: a fixture that has left makes every check resting on it
// green-but-vacuous, and a silent pass would hide that.
//
// WEI-EXACT, FROM THE API ROUTE. Section 3 reads the timeline out of
// /api/chain/morpho-base/vault, which serves the same loader in raw units — a
// figure scraped off the page is formatted, and a comparison against formatted
// cents is blind to a wei-level break. Where the DOM is judged (rows present,
// kinds, copy rules, the absence of a chart) it is the RENDERED DOM that is
// read, never the RSC payload.
//
// ── 2026-09-08 · THE POSITION HAS A PATH, AND ITS ROWS COLLAPSE ────────────
// Two things moved under this file (rails-ops plan D11) and the assertions did
// not change with them:
//   • `/base/morpho/vaults/<vault>?holder=<h>` 307s to `/base/morpho/vaults/<vault>/<h>`.
//     `readPage` still asks for the query form and Playwright follows the
//     redirect, so every check here reads the POSITION page. That page carries
//     one thing the old one did not — the listing's own card above the reading
//     — which no check in this file reads.
//   • The rows ride `ChainTruthTimeline`, so a stretch of consecutive same-kind
//     rows is painted as ONE run row. `readPage` now takes TWO readings: the
//     list AS PAINTED, and the list after every run has been expanded by the
//     reader's own click. Check 2c holds the painted one against this script's
//     OWN grouping (`ownRuns`, the rule restated from
//     lib/aave-vaults/timeline-runs.tsx rather than read off it) and the
//     expanded one against the whole life; checks 4e, 5c and 10b read the
//     expanded list, which is why they compare row for row exactly as before.
//     FAIL 2c — "0xbeef…83b2/0xaa3e…0dcb: DOM 3 (attr 8) vs own 8 |
//                0xbeef…83b2/0x3d88…dd1e: DOM 2 (attr 7) vs own 7"
//     FAIL 4e — "0xbeef…83b2 row 0: header \"Burned 80K S Withdrawn 84K
//                29 Jul '26 – \" lacks \"Withdrawal\""
//     FAIL 5c — "0xbeef…83b2 row 2: no panel states \"0.2731%\""
//     🔑 One cause, three checks: six of that fixture's eight rows were inside
//     a collapsed folder, so they were not in the document at all. 4e and 5c
//     were reading the RUN row's own header and finding a summary where they
//     expected a row — the failure a page that had silently dropped rows would
//     also produce, which is why the fix mounts them rather than relaxing the
//     comparison. Restored run: 47/47 · 1 SKIP.
//
// Run:
//   BASE=http://localhost:3801 node scripts/verify/verify-morpho-base-vault-timeline.mjs
// Needs BASE_BACKFILL_RPC_URL in .env.local (read, never printed) — the same
// lane the reader names, because it is the only Base lane that answers a
// whole-life `eth_getLogs` at all (`BASE_LOGS_RPC_URL` refuses any range over
// 1,000 blocks).
//
// ── WHAT EACH SECTION ASSERTS ────────────────────────────────────────────────
//   0  each sampled page answers 200 and states a block near this script's own
//      head, and the API route serves a timeline for the same block
//   1  the gate is real: this script's own sweeps, own replay and own
//      `balanceOf` at the page's block decide whether a timeline may be drawn,
//      and the page drew one if and only if they reconciled — with both figures
//      on the page equal to this script's own two. Then the horizon in BOTH its
//      shapes: an address whose 10,944 logs the lane hands over whole (exact
//      count, gate ran, rows withheld) and the one address the lane refuses
//      outright — the vault's own fee recipient — where the count is a walked
//      FLOOR, the gate could not run, and the page says which it has
//   2  row count and order: the page's rows equal this script's own log count,
//      DESCENDING by (block, logIndex) — newest first, like every other Rails
//      timeline. The order is asserted on the API's own array; the DOM is then
//      held to the same order by 4e and 10b, so the two cannot disagree. The
//      DOM draws exactly that many rows, and the reader's own `fromBlock` is
//      early enough to have missed nothing
//   3  every row wei-exact against this script's own decode: `sharesDelta`,
//      `balanceAfter`, the `assets` leg against the ERC-4626 event in the same
//      transaction, and `sharePriceAtBlock` against this script's own archive
//      `convertToAssets(10 ** its own decimals() read)`; and the exponent is
//      STATED on the page out of two reads rather than assumed
//   4  kinds are decided by the zero address, and the sample exercises every
//      branch the reader has, including plain transfers in BOTH directions
//   5  MetaMorpho's own per-row figure — the supply the address's balance was a
//      share OF at that row's block — wei-exact against this script's own
//      archive `totalSupply()`, on a sample that spans many denominators
//   6  the fee-share mint is absent, and for the right reason: this script reads
//      the vault's own `feeRecipient()` and asserts it is a counterparty on no
//      ordinary holder's row and named nowhere in the drawn timeline
//   7  notes are notes: `SetFee`, `SetName` and `SetSymbol` appear with this
//      script's own counts and its own decoded values, and the `AccrueInterest`
//      logs this script counts are rows nowhere
//   8  no USD anywhere on any sampled page, and no APY, no annualised figure
//      and no rate of return
//   9  no line chart of share price: no SVG `path` or `polyline` in the
//      timeline whose numbers are the rows' own share prices
//  10  locale: the reconcile figures are en-US, every day-leading row's date is
//      en-GB UTC and equals this script's own format of its own timestamp read
//  11  the dev provenance tripwire reports no uncovered figure, with a holder
//      (every row expanded) and without one
//  12  every fixture still holds a positive balance at the page's own block
//
// ── PROVED IT CAN FAIL, 2026-09-07, BASE=http://localhost:3761 ───────────────
// Restored run: 47/47 · 1 SKIP (4d, and its SKIP is a finding — see below).
// Eleven breaks, applied one at a time and reverted. Nothing on this path is
// cached — the vault page reads its figures at one block per request and the
// sweeps run on the request — so no cache had to be cleared between them.
//
//  B1  the loader salted the FIRST row's `sharesDelta` by +1 wei. 46/47.
//      FAIL 3a ("0xbeef…83b2/0xaa3e…0dcb row 0 blk 38690627: page
//      40990843066398043585 vs own …584", and the same on two more).
//      🔑 3b stayed GREEN, and that is correct: the running balance is
//      accumulated separately from the printed delta, so the two are
//      independent claims and the break forged only one.
//  B2  the loader asked `convertToAssets(10 ** the ASSET's decimals)` instead
//      of 10 ** the vault's own — the decimals trap in the only shape Base can
//      take it, since every MetaMorpho share token is 18-decimal. 46/47.
//      FAIL 3d ("row 0 blk 38690627: page 0 vs own 1021220 (10^18)" — 10^6 on
//      an 18-decimal share token converts to nothing at all).
//      🔑 The WETH-vault fixture stayed GREEN under it, because ITS asset is
//      18-decimal and the two exponents coincide. That is exactly what 3e's
//      premise is for, and it is why the sample is two vaults.
//      🔑 3f ALSO stayed green: the page went on stating `10^18` correctly
//      while the CALL used 10^6. The statement and the call are two claims and
//      only 3d sees the second one.
//  B3  the per-row denominator frozen to the first block's (`supplies[0]`).
//      45/47. FAIL 5a ("row 1 blk 38717111: page 52604599117395571753536988 vs
//      own 63633134429912229885627778") and FAIL 5c ("row 1: no panel states
//      0.1555%").
//      🔑 5b stayed green — it is a claim about THIS SCRIPT's own sample
//      spanning many supplies, not about the page — which is what keeps 5a
//      from being green-but-vacuous rather than what tests the page.
//  B4  `balanceOf` read at `blockNumber − 2,000,000`, in the gate and in its
//      one re-fetch. 37/47. FAIL 1a, 1b, 1d, 1e, 1f, 2a, 2c, 3f, 10a, 5c.
//      🔑 1c stayed GREEN: the two log counts are a separate claim from the
//      balance read, and the break forged only the balance.
//      🔑 The break landed on three of the four fixtures. The fourth held the
//      SAME balance 2,000,000 blocks earlier because it had not moved in that
//      window, so for it the wrong block was not a wrong answer. A break that
//      lands only where the quantity actually differs is evidence the check is
//      comparing quantities rather than shapes.
//      🔑 3f went red too, and for a reason worth knowing: the exponent
//      sentence renders only on a page that DREW rows, so a gate failure takes
//      it with it. 3f's subject is a drawn page.
//  B5  the rows served oldest-first (the order this surface shipped with in
//      Phase A, before Miles moved it). 36/47. FAIL 2b, 2d, and — because
//      every per-index comparison then lines a row up against a different log
//      — 3a, 3b, 3c, 3d, 3g, 4a, 4e, 5a, 10b.
//      🔑 2a and 2c stayed GREEN. The COUNT is unchanged by a reordering, and
//      the count and the order are two claims: a check that only counted rows
//      would have passed a timeline running backwards.
//  B6  a USD figure added to the timeline's closing line ("About $1,204,000 in
//      all"). 46/47. FAIL 8a ("$1" on all four pages). Every other check
//      stayed green: a chain-truth violation of this shape is an ADDITION, and
//      nothing else in this file looks for one.
//  B7  the horizon lowered from 5,000 to 10 rows. 39/47. FAIL 1a
//      ("0x6b13…8844/0x2b54…9dba: page drew 0 rows, own gate PASSED (24
//      logs)"), and 1d, 2a, 2c, 3f, 10a, 5c behind it.
//      🔑 1g went red for its own reason and it is the more interesting one:
//      the counting walk STOPS at the horizon, so a lower horizon made the
//      floor it reports 4,519 instead of 12,799, and the check caught that
//      against the 5,000 restated in THIS file. That is why the threshold is
//      restated here rather than read out of the source.
//      🔑 1e stayed green — 10,944 is above 10 as well as above 5,000.
//  B8  the horizon withheld SILENTLY (`withheldAbove: transfers.length` →
//      `null`) on the exact path. 45/47. FAIL 1e ("page drew 0 rows,
//      withheldAbove null, reconciled true") and FAIL 1f ("no horizon
//      statement on the page"), and nothing else. The pair is deliberate: 1e
//      reads the count out of the route and 1f reads the sentence off the DOM.
//  B9  a walked FLOOR reported as a census (`logCountIsLowerBound: false` on
//      the refused path). 45/47. FAIL 1g and FAIL 1h — and 1h is the one that
//      matters, because under the break the page went on to say "The whole
//      history was read and it reconciles against the vault's own balanceOf"
//      about an address whose logs were never handed over. 1e stayed green.
//  B10 the exponent sentence dropped from the page. 46/47. FAIL 3f only; 3d
//      stayed green, since the CALL was still right. The statement and the
//      call are two claims, from the other side this time.
//  B11 a mint row's counterparty forged to the vault's fee recipient. 44/47.
//      FAIL 3g (wei-exact against this script's own log: "page 0x255c…085a vs
//      own null") and FAIL 6a (the address itself).
//      🔑 6b was GREEN on the first two runs of this break, and that was a
//      fault in the CHECK, twice over. It read the UNEXPANDED page, where a
//      row's counterparty is not in the DOM at all; and it looked for the raw
//      hex where the page prints the `0x255c…085a` elision. It now runs on the
//      expanded pages beside 5c and tests both forms. A check that cannot see
//      the thing it forbids is worse than no check.
//
//  ── 2026-09-20 · four checks were stale, not four faults on the page ───────
//  1f cut on `WINDOW` (the TIER bound) where the route draws `DRAW_ROWS`; 1f2
//  looked for a window SENTENCE the page stopped drawing; 2c restated a run
//  rule that had since taken the two custody kinds; 4e wanted "Received" /
//  "Sent" in a custody row's header, which `ChainTruthRow` drops by design.
//  The Ethereum arm had already been corrected for all four in `e532166b` and
//  the fix did not carry here (TO-DO-ui-jobs §38). Restored run: 49/49 · 1
//  SKIP. Break tests, each restored and the file's sha256 equal after:
//    B12 `DRAW_ROWS` 1000 → 999. 47/49. FAIL 1f and 1f2, nothing else.
//    B13 `RUN_KINDS` back to the two vault kinds. 48/49. FAIL 2c only.
//    B14 the two custody directions reversed. 48/49. FAIL 4e only.
//
import { chromium } from "playwright";
import { createPublicClient, http, parseAbi, parseAbiItem, toEventSelector, getAddress } from "viem";
import { base } from "viem/chains";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE_URL = process.env.BASE ?? "http://localhost:3761";

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.BASE_BACKFILL_RPC_URL) throw new Error("need BASE_BACKFILL_RPC_URL in .env.local");

// ── the sample ──────────────────────────────────────────────────────────────
// Two vaults, and they are two on purpose. Every MetaMorpho vault's shares are
// 18-decimal — the factory sets `DECIMALS_OFFSET` so that they are — so the
// Ethereum verifier's anti-vacuity rule (a 6-decimal AND an 18-decimal share
// token in one sample) has no Base equivalent and is NOT what 3e checks here.
// What CAN differ, and does across these two, is the pair the 18 is built from:
// a USDC vault reads offset 12 over a 6-decimal asset, a WETH vault reads
// offset 0 over an 18-decimal one. A reader that hard-coded either would be
// right about one of these vaults and wrong about the other, and the asset leg
// and share price print in two different units across the sample.
const CASE_STUDY = "0xbeefe94c8ad530842bfe7d8b397938ffc1cb83b2";
const WETH_VAULT = "0x6b13c060f13af1fdb319f52315bbbf3fb1d88844";

/** Holder fixtures — INPUTS. Each names a vault, an address and the BRANCH the
 *  reader should meet there; every figure is re-read at the block the page
 *  states. `expect` is a claim about the SHAPE of the life, not its numbers. */
const FIXTURES = [
  {
    label: "case study / a life that closed and reopened",
    vault: CASE_STUDY,
    holder: "0xaa3e1a91fc83723e527062ff929a357354d10dcb",
    expect: { mints: true, burns: true, transfersIn: false, transfersOut: false },
  },
  {
    label: "case study / mints and burns, mixed direction",
    vault: CASE_STUDY,
    holder: "0x3d8863a416f3091766bfea41d3d7008236a0dd1e",
    expect: { mints: true, burns: true, transfersIn: false, transfersOut: false },
  },
  {
    label: "case study / plain transfers, both directions",
    vault: CASE_STUDY,
    holder: "0xe228c34252bd874c489c2a99e03476162d74db02",
    // The transfer branch's fixture: this address never deposited or withdrew,
    // so a reader that only knows mints and burns draws it as nothing at all,
    // and every one of its rows takes the "no asset leg was emitted" branch.
    expect: { mints: false, burns: false, transfersIn: true, transfersOut: true },
  },
  {
    label: "WETH vault / an 18-decimal asset and a DECIMALS_OFFSET of 0",
    vault: WETH_VAULT,
    holder: "0x2b540218c0af883f9c70958c361c9da8a63b9dba",
    expect: { mints: false, burns: false, transfersIn: true, transfersOut: true },
  },
];

/** The two HEAVY fixtures, in the two shapes the reader distinguishes. Neither
 *  is one of FIXTURES: nothing about an individual row is asserted on them.
 *
 *  ⚠️ 2026-09-09 — THE HORIZON SPLIT IN TWO. A life the lane hands over whole
 *  and that is at or below `CEILING` is no longer withheld: it is BUILT into
 *  Rails's store a chunk of blocks at a time across visits and then drawn, with
 *  its newest `DRAW_ROWS` rows serialised and `coverage.drawn` stating both
 *  figures. So `HEAVY` proves the build-and-window path.
 *
 *  `FLOOR` is untouched and is the Tier 2 fixture: the lane REFUSES that
 *  address's sweep on response size — it is the VAULT'S OWN FEE RECIPIENT, read
 *  from the contract rather than pasted — so the count is walked in chunks and
 *  stated as a lower bound, no gate can run, and a floor may never be built on.
 *  It is the only Tier 2 shape this chain offers: the largest Base lives are
 *  all refused rather than counted (a 19,573-transfer holder measured
 *  2026-09-09 answered as a floor of 5,286, not as a census).
 *
 *  All three policy figures are deliberately RESTATED here rather than read out
 *  of the source: an expectation read from the thing under test cannot catch a
 *  change to it. `WINDOW` is `VAULT_TIMELINE_HORIZON`, `CEILING` is
 *  `tailMaxRows(8453)` — per chain as of 2026-09-09, and Base's own figure did
 *  not move when it was split — and `DRAW_ROWS` is `VAULT_TIMELINE_DRAW_ROWS`.
 *  All three in lib/shared/vault-holder-timeline.ts. */
const HEAVY = {
  vault: "0x616a4e1db48e22028f6bbf20444cd3b8e3273738", // smUSDC
  holder: "0x45aa96f0b3188d47a1dafdbefce1db6b37f58216",
};
/** WHICH TIER a life is in — not how much of it is drawn. */
const WINDOW = 5000;
const CEILING = 11000;
/** THE DRAW WINDOW — the one cut every timeline shares (decision `0019`,
 *  amended 2026-09-10). Split from `WINDOW` on that date; one figure did both
 *  jobs before it, which is what left 1f cutting on the wrong one. */
const DRAW_ROWS = 1000;

const client = createPublicClient({
  chain: base,
  // Modestly batched and modestly parallel. This script makes three archive
  // calls per row block and there are dozens of them, but the lane meters by
  // compute units PER SECOND: one big batch costs the same as many small ones
  // and spends it all in one instant, which the lane refuses. Eight calls a
  // request and four requests in flight is what it takes without complaint.
  transport: http(env.BASE_BACKFILL_RPC_URL, {
    batch: { batchSize: 8, wait: 20 },
    retryCount: 3,
    retryDelay: 900,
    timeout: 120_000,
  }),
});

// Topic0s computed from fragments — a pasted literal is a claim nobody can
// check against the ABI it came from.
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
const SET_FEE = toEventSelector(parseAbiItem("event SetFee(address indexed caller, uint256 newFee)"));
const SET_NAME = toEventSelector(parseAbiItem("event SetName(string name)"));
const SET_SYMBOL = toEventSelector(parseAbiItem("event SetSymbol(string symbol)"));
const ACCRUE = toEventSelector(parseAbiItem("event AccrueInterest(uint256 newTotalAssets, uint256 feeShares)"));

const VAULT_ABI = parseAbi([
  "function decimals() view returns (uint8)",
  "function DECIMALS_OFFSET() view returns (uint8)",
  "function symbol() view returns (string)",
  "function asset() view returns (address)",
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function feeRecipient() view returns (address)",
]);
const ERC20_ABI = parseAbi(["function decimals() view returns (uint8)", "function symbol() view returns (string)"]);

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

/** `Promise.all` with a ceiling on how many are in flight — see the transport
 *  note above. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const pad32 = (a) => `0x${"0".repeat(24)}${a.toLowerCase().replace(/^0x/, "")}`;
const tailOf = (t) => (t ? `0x${t.slice(26)}`.toLowerCase() : ZERO_ADDR);
const hex = (n) => `0x${BigInt(n).toString(16)}`;

// ── the section's own print rules, restated so a change to them goes red ────
const exactUnits = (raw, decimals) => {
  const s = String(raw).padStart(decimals + 1, "0");
  const cut = s.length - decimals;
  return (s.slice(0, cut) + "." + s.slice(cut)).replace(/\.?0+$/, "");
};
/** components/protocol/morpho-base/vault-exposure-parts.tsx `shareText`. */
const shareText = (raw, decimals) => {
  const value = Number(raw) / Math.pow(10, decimals);
  const text = value.toLocaleString("en-US", { maximumFractionDigits: 6 });
  return value !== 0 && parseFloat(text.replace(/,/g, "")) === 0 ? exactUnits(raw, decimals) : text;
};
/** …`pctText` from the same file. */
const pctText = (fraction) => `${(fraction * 100).toPrecision(4)}%`;
/** …`lib/shared/format-event.ts` shortDate + shortDateYear: en-GB, UTC. */
const dayPrefix = (unix) =>
  `${new Date(unix * 1000).toLocaleDateString("en-GB", { timeZone: "UTC", month: "short", day: "numeric" })} '${String(
    new Date(unix * 1000).getUTCFullYear(),
  ).slice(-2)}`;
const dayKey = (unix) => new Date(unix * 1000).toISOString().slice(0, 10);

// ── this script's own chain reads ───────────────────────────────────────────

/** The metered lane answers a burst with an HTTP 429 whose body is a JSON-RPC
 *  error, which viem's own retry does not treat as retryable — so this script
 *  retries THAT and only that. Every other refusal (a response-size limit, most
 *  of all) is rethrown at once, because those are answers this script is here to
 *  observe rather than to wait out. */
const isThroughput = (e) => /compute units|429|rate limit/i.test(`${e?.details ?? ""} ${e?.message ?? ""}`);
async function rpc(fn, what) {
  let last;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!isThroughput(e)) throw e;
      last = e;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  throw new Error(
    `${what} did not answer — the lane refused eight attempts on throughput: ${last?.details ?? last?.message}`,
  );
}

const getLogs = (address, topics, toBlock, fromBlock = 0) =>
  rpc(
    () =>
      client.request({
        method: "eth_getLogs",
        params: [{ address, topics, fromBlock: hex(fromBlock), toBlock: hex(toBlock) }],
      }),
    "eth_getLogs",
  );
const call = (args) => rpc(() => client.readContract(args), `${args.functionName}()`);
const blockAt = (blockNumber) => rpc(() => client.getBlock({ blockNumber }), "eth_getBlockByNumber");

const word = (data, i) => BigInt(`0x${data.slice(2 + i * 64, 2 + (i + 1) * 64)}`);
/** One ABI-encoded dynamic string out of a log's data word 0. */
const stringWord = (data) => {
  const offset = Number(word(data, 0)) * 2;
  const length = Number(BigInt(`0x${data.slice(2 + offset, 2 + offset + 64)}`));
  const bytes = data.slice(2 + offset + 64, 2 + offset + 64 + length * 2);
  return Buffer.from(bytes, "hex").toString("utf8");
};

/** The vault's own identity at a block, every field a read. */
async function vaultFacts(vault, blockNumber) {
  const [decimals, offset, assetAddr, feeRecipient] = await Promise.all([
    call({ address: vault, abi: VAULT_ABI, functionName: "decimals", blockNumber }),
    call({ address: vault, abi: VAULT_ABI, functionName: "DECIMALS_OFFSET", blockNumber })
      .then(Number)
      .catch(() => null),
    call({ address: vault, abi: VAULT_ABI, functionName: "asset", blockNumber }),
    call({ address: vault, abi: VAULT_ABI, functionName: "feeRecipient", blockNumber }),
  ]);
  const assetDecimals = Number(
    await call({ address: assetAddr, abi: ERC20_ABI, functionName: "decimals", blockNumber }),
  );
  return {
    decimals: Number(decimals),
    decimalsOffset: offset,
    asset: assetAddr.toLowerCase(),
    assetDecimals,
    feeRecipient: feeRecipient.toLowerCase(),
  };
}

/** Rebuild one holder's whole timeline from this script's own reads, at the
 *  block the PAGE stated. Nothing here consults the page. */
async function ownTimeline(vault, holder, blockNumber) {
  const who = holder.toLowerCase();
  // From block ZERO: the reader starts at the catalogue's creation block, and
  // an independent check of that choice has to be able to see earlier.
  let sweptFromZero = true;
  const from0 = (topics) =>
    getLogs(vault, topics, blockNumber, 0).catch(() => {
      sweptFromZero = false;
      return null;
    });
  let [out, into, dep, wit] = await Promise.all([
    from0([TRANSFER, pad32(who), null]),
    from0([TRANSFER, null, pad32(who)]),
    from0([DEPOSIT, null, pad32(who)]),
    from0([WITHDRAW, null, null, pad32(who)]),
  ]);
  if (out === null || into === null || dep === null || wit === null) {
    // Stated in 2e rather than passed over. The fallback is the same lower
    // bound the reader uses, so the row comparison still happens.
    const created = await createdBlockOf(vault, blockNumber);
    [out, into, dep, wit] = await Promise.all([
      getLogs(vault, [TRANSFER, pad32(who), null], blockNumber, created),
      getLogs(vault, [TRANSFER, null, pad32(who)], blockNumber, created),
      getLogs(vault, [DEPOSIT, null, pad32(who)], blockNumber, created),
      getLogs(vault, [WITHDRAW, null, null, pad32(who)], blockNumber, created),
    ]);
  }

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
        : BigInt(a.blockNumber) < BigInt(b.blockNumber)
          ? -1
          : 1,
    );

  const facts = await vaultFacts(vault, blockNumber);
  const onChain = await call({
    address: vault,
    abi: VAULT_ABI,
    functionName: "balanceOf",
    args: [getAddress(who)],
    blockNumber,
  });

  let replayed = BigInt(0);
  for (const l of transfers) {
    const value = BigInt(l.data);
    if (tailOf(l.topics[2]) === who) replayed += value;
    if (tailOf(l.topics[1]) === who) replayed -= value;
  }

  const blocks = [...new Set(transfers.map((l) => BigInt(l.blockNumber).toString()))].map((b) => BigInt(b));
  const one = BigInt(10) ** BigInt(facts.decimals);
  const meta = new Map(
    await mapLimit(blocks, 4, async (b) => {
      const [blk, price, supply] = await Promise.all([
        blockAt(b),
        call({ address: vault, abi: VAULT_ABI, functionName: "convertToAssets", args: [one], blockNumber: b }),
        call({ address: vault, abi: VAULT_ABI, functionName: "totalSupply", blockNumber: b }),
      ]);
      return [b.toString(), { timestamp: Number(blk.timestamp), price: price.toString(), supply: supply.toString() }];
    }),
  );

  const legs = [...dep, ...wit].map((l) => ({
    tx: l.transactionHash,
    assets: word(l.data, 0),
    shares: word(l.data, 1),
    taken: false,
  }));
  const claim = (tx, shares) => {
    const hit = legs.find((l) => !l.taken && l.tx === tx && l.shares === shares);
    if (!hit) return null;
    hit.taken = true;
    return hit.assets.toString();
  };

  const rows = [];
  let balance = BigInt(0);
  for (const l of transfers) {
    const from = tailOf(l.topics[1]);
    const to = tailOf(l.topics[2]);
    const value = BigInt(l.data);
    let delta = BigInt(0);
    if (to === who) delta += value;
    if (from === who) delta -= value;
    balance += delta;
    const kind =
      from === who && to === who
        ? "transfer-self"
        : from === ZERO_ADDR
          ? "deposit"
          : to === ZERO_ADDR
            ? "withdrawal"
            : to === who
              ? "transfer-in"
              : "transfer-out";
    const key = BigInt(l.blockNumber).toString();
    rows.push({
      id: `${l.transactionHash}:${Number(BigInt(l.logIndex))}`,
      txHash: l.transactionHash,
      blockNumber: Number(BigInt(l.blockNumber)),
      logIndex: Number(BigInt(l.logIndex)),
      timestamp: meta.get(key).timestamp,
      kind,
      counterparty:
        kind === "deposit" || kind === "withdrawal" || kind === "transfer-self" ? null : to === who ? from : to,
      sharesDelta: delta.toString(),
      balanceAfter: balance.toString(),
      assets: kind === "deposit" || kind === "withdrawal" ? claim(l.transactionHash, value) : null,
      sharePriceAtBlock: meta.get(key).price,
      totalSupplyAtBlock: meta.get(key).supply,
    });
  }

  // Newest first — the order the reader serves and draws, so every per-index
  // comparison below lines this script's own row up against the row on screen.
  // The replay above ran ascending, because a running balance can only be
  // accumulated in the order the chain wrote the logs.
  rows.reverse();

  return {
    ...facts,
    sweptFromZero,
    logsOut: out.length,
    logsIn: into.length,
    transferCount: transfers.length,
    firstLogBlock: transfers.length ? Number(BigInt(transfers[0].blockNumber)) : null,
    reconciled: replayed === onChain,
    replayed: replayed.toString(),
    onChain: onChain.toString(),
    rows,
  };
}

/** The block a vault's code first exists at, by bisection on `eth_getCode` —
 *  this script's own answer, not the catalogue's. Used only as the fallback
 *  `fromBlock` when the lane refuses a from-zero sweep, and by check 2e. */
const createdCache = new Map();
async function createdBlockOf(vault, head) {
  const cached = createdCache.get(vault);
  if (cached != null) return cached;
  let lo = BigInt(0);
  let hi = BigInt(head);
  while (lo < hi) {
    const mid = (lo + hi) / BigInt(2);
    const code = await rpc(() => client.getCode({ address: vault, blockNumber: mid }), "eth_getCode").catch(
      () => undefined,
    );
    if (code && code !== "0x") hi = mid;
    else lo = mid + BigInt(1);
  }
  const answer = Number(lo);
  createdCache.set(vault, answer);
  return answer;
}

// ── the page and the route ──────────────────────────────────────────────────

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 2000 } });

/** ── this script's OWN run grouping, 2026-09-08 ─────────────────────────────
 *  The rows ride `ChainTruthTimeline` now, and a stretch of consecutive
 *  same-kind rows is painted as ONE run row. The rule is restated here rather
 *  than imported — `MIN_VAULT_RUN` in lib/aave-vaults/timeline-runs.tsx and the
 *  `RUN_KINDS` its spec matches on — because a check that read its expectation
 *  off the thing under test could not catch a change to either. A run longer
 *  than `CHUNK_TARGET` splits into chronological folders; none of this file's
 *  fixtures has a run near that, and a fixture that grew one would show up here
 *  as a painted-vs-own mismatch rather than passing quietly.
 *
 *  ⚠️ RESTATED IS NOT THE SAME AS RIGHT. This set held the two vault kinds and
 *  not the two custody ones until 2026-09-20, so the page grouped transfer runs
 *  and this script did not, and 2c went red on every fixture that has one —
 *  painted 3 rows (1 run) against an own grouping of 6 (0 runs). The Ethereum
 *  arm was corrected in `e532166b` and the fix did not carry here. The price of
 *  restating a rule is that it has to be re-read when the rule moves; that is
 *  the cost the paragraph above accepts, and this is what it looks like when it
 *  comes due (TO-DO-ui-jobs §38). */
const RUN_KINDS = new Set(["deposit", "withdrawal", "transfer-in", "transfer-out"]);
const MIN_RUN = 3;
function ownRuns(events) {
  const out = [];
  let i = 0;
  while (i < events.length) {
    if (!RUN_KINDS.has(events[i].kind)) {
      out.push({ kind: "event", events: [events[i]] });
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < events.length && events[j].kind === events[i].kind) j += 1;
    if (j - i >= MIN_RUN) out.push({ kind: "run", events: events.slice(i, j) });
    else for (let k = i; k < j; k++) out.push({ kind: "event", events: [events[k]] });
    i = j;
  }
  return out;
}

async function readPage(vault, holder, { expandRows = false } = {}) {
  const page = await context.newPage();
  const url = `${BASE_URL}/base/morpho/vaults/${vault}${holder ? `?holder=${holder}` : ""}`;
  const res = await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  const status = res?.status() ?? 0;
  if (status !== 200) {
    await page.close();
    return { url, status };
  }
  const attr = async (sel, name) => {
    const el = page.locator(sel);
    return (await el.count()) ? el.first().getAttribute(name) : null;
  };
  const text = async (sel) => {
    const el = page.locator(sel);
    return (await el.count()) ? (await el.first().innerText()).replace(/\s+/g, " ").trim() : null;
  };
  const blockNumber = Number(await attr("[data-vault-block]", "data-vault-block"));
  const rowCountAttr = await attr("[data-vault-timeline-rows]", "data-vault-timeline-rows");
  // On a life cut to the draw window: the life it was cut from, and the
  // toolbar's count line ("Showing 1,000 of 8,422 events", decision 0019 §3).
  const rowCountOf = await attr("[data-vault-timeline-rows]", "data-vault-timeline-of");
  const toolbarText = await text("[data-vault-timeline-rows] [data-skel-section='detail-timeline-header']");

  // ── 2026-09-08 · THE ROWS RIDE `ChainTruthTimeline` AND COLLAPSE ─────────
  // A stretch of consecutive same-kind rows is drawn as ONE run row, so the
  // painted list is no longer the life. Two readings are taken, and the checks
  // below use whichever one they are about:
  //   `collapsed` — the list AS PAINTED, each entry either an event (with its
  //     id) or a run (with the count and the member kind its own aria-label
  //     states). Check 2c holds this against this script's own grouping.
  //   everything else — read AFTER every run has been expanded, so the row
  //     for every log in the life is mounted and checks 4e, 5c and 10b compare
  //     row for row as they always did.
  // Expanding is the reader's own click, on the rows whose label says "expand
  // the run"; the labels flip to "collapse" as they open, which is what stops
  // the loop.
  const collapsed = await page
    .locator("[data-vault-timeline-rows] [data-event-id], [data-vault-timeline-rows] [aria-label*='consecutive']")
    .evaluateAll((els) =>
      els.map((el) => {
        const label = el.getAttribute("aria-label");
        if (label && / consecutive /.test(label)) {
          const m = /^(\d[\d,]*) consecutive (\w+?)s? —/.exec(label);
          return { kind: "run", count: m ? Number(m[1].replace(/,/g, "")) : null, member: m ? m[2] : null };
        }
        return { kind: "event", id: el.getAttribute("data-event-id") };
      }),
    );
  const runsPainted = collapsed.filter((r) => r.kind === "run").length;
  for (let guard = 0; guard < 40; guard++) {
    const toOpen = page.locator("[data-vault-timeline-rows] [aria-label*='expand the run']");
    if ((await toOpen.count()) === 0) break;
    await toOpen.first().click({ force: true });
    await page.waitForTimeout(250);
  }
  // The note rows as the page actually drew them, in DOM order, each with the
  // id of the event row it sits under — a note is placed by block and renders
  // immediately AFTER its anchor in a newest-first list, so the pair is what
  // "at its block position" means on screen.
  const noteRows = await page.locator("[data-vault-timeline-rows] [data-market-note]").evaluateAll((els) =>
    els.map((e) => {
      let prev = e.previousElementSibling;
      while (prev && !prev.querySelector("[data-event-id]")) prev = prev.previousElementSibling;
      const anchor = prev?.querySelector("[data-event-id]") ?? e.parentElement?.querySelector("[data-event-id]");
      return {
        id: e.getAttribute("data-market-note") ?? "",
        text: e.innerText.replace(/\s+/g, " ").trim(),
        after: anchor?.getAttribute("data-event-id") ?? null,
      };
    }),
  );
  const eventRows = page.locator("[data-vault-timeline-rows] [data-event-id]");
  const domRows = await eventRows.count();
  const heads = page.locator("[data-vault-timeline-rows] [data-event-id] [role='button']");
  const headerTexts = await heads.evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, " ").trim()));
  if (expandRows) {
    const headCount = await heads.count();
    for (let i = 0; i < headCount; i++) {
      try {
        await heads.nth(i).click({ force: true, timeout: 4000 });
      } catch {
        /* a row that would not open is caught by the tripwire count below */
      }
    }
    await page.waitForTimeout(900);
  }
  // THE TYPE FILTER'S OWN OPTIONS. Read by opening the dropdown and closing it
  // again — the options are not in the DOM until it opens, and the one thing
  // this check is for (a note kind offered as a selectable event type) is only
  // visible there.
  let filterOptionText = "";
  try {
    const typeButton = page.locator("[data-vault-timeline-rows] button[aria-label='Types of event']");
    if (await typeButton.count()) {
      await typeButton.first().click({ force: true, timeout: 4000 });
      await page.waitForTimeout(200);
      const panel = page.locator("[data-vault-timeline-rows] .overlay-panel");
      filterOptionText = (await panel.count()) ? (await panel.first().innerText()).replace(/\s+/g, " ") : "";
      // CLOSED AGAIN BY THE BUTTON, not by Escape. An open dropdown leaves its
      // per-option counts in the DOM, and the provenance tripwire reads those
      // as uncovered figures — a reading this capture would have manufactured.
      await typeButton.first().click({ force: true, timeout: 4000 });
      await page.waitForTimeout(200);
    }
  } catch {
    /* a dropdown that would not open leaves the text empty, which the check reads as "no note option" */
  }
  const out = {
    url,
    status,
    blockNumber,
    rowCountAttr: rowCountAttr == null ? null : Number(rowCountAttr),
    rowCountOf: rowCountOf == null ? null : Number(rowCountOf),
    countLine: /Showing [\d,]+ of (?:at least )?[\d,]+ events/.exec(toolbarText ?? "")?.[0] ?? null,
    collapsed,
    runsPainted,
    domRows,
    headerTexts,
    noteRows,
    filterOptionText,
    noteCount: Number((await attr("[data-vault-timeline-notes]", "data-vault-timeline-notes")) ?? 0),
    noteText: await text("[data-vault-timeline-notes]"),
    reconciledText: await text("[data-figure='timeline-reconciled']"),
    unreconciledText: await text("[data-figure='timeline-unreconciled']"),
    horizonText: await text("[data-figure='timeline-horizon']"),
    buildingText: await text("[data-figure='timeline-building']"),
    unreadText: await text("[data-figure='timeline-unread']"),
    exponentText: await text("[data-figure='timeline-exponent']"),
    accrualText: await text("[data-figure='timeline-accrual']"),
    shareOfVaultTexts: await page
      .locator("[data-figure='row-share-of-vault']")
      .evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, " ").trim())),
    cardStatus: await attr("[data-position-card]", "data-status"),
    cardValueUsdE8: await attr("[data-position-card]", "data-value-usd-e8"),
    bodyText: (await page.locator("body").innerText()).replace(/\s+/g, " "),
    timelineText: (await page.locator("[data-vault-timeline]").count())
      ? (await page.locator("[data-vault-timeline]").first().innerText()).replace(/\s+/g, " ")
      : "",
    // Every SVG geometry inside the timeline, for check 9.
    svgGeometry: await page
      .locator("[data-vault-timeline] path, [data-vault-timeline] polyline, [data-vault-timeline] polygon")
      .evaluateAll((els) => els.map((e) => e.getAttribute("d") || e.getAttribute("points") || "")),
    tripwireBookends: await page.locator("[data-prov-tripwire]").count(),
    uncovered: await page
      .locator("[data-prov-uncovered]")
      .evaluateAll((els) => els.map((e) => e.textContent?.trim().slice(0, 60))),
  };
  await page.close();
  return out;
}

async function readRoute(vault, holder) {
  const res = await fetch(`${BASE_URL}/api/chain/morpho-base/vault?vault=${vault}&holder=${holder}`);
  if (res.status !== 200) return { status: res.status };
  const json = await res.json();
  return { status: 200, ...json };
}

// ═══ 0: the pages answer, and each states a block near this script's head ═══
const head = await rpc(() => client.getBlockNumber(), "eth_blockNumber");
const PAGES = new Map();
const ROUTES = new Map();
const OWN = new Map();
/** The same pages read again with every row's card opened — a row's own panel
 *  is not in the DOM until then. Populated in section 11 and read by 5c, which
 *  therefore runs down there rather than where its number lives. */
const EXPANDED = new Map();
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  PAGES.set(key, await readPage(f.vault, f.holder));
  ROUTES.set(key, await readRoute(f.vault, f.holder));
}

const bad0a = FIXTURES.filter((f) => PAGES.get(`${f.vault}:${f.holder}`).status !== 200);
check(
  "0a every sampled vault page answers 200 on its holder",
  bad0a.length === 0,
  bad0a.length
    ? bad0a
        .map((f) => `${short(f.vault)}?holder=${short(f.holder)} ${PAGES.get(`${f.vault}:${f.holder}`).status}`)
        .join(", ")
    : `${FIXTURES.length} pages`,
);
if (bad0a.length) {
  console.log("\nA page did not answer — nothing below can be judged.");
  await browser.close();
  process.exit(1);
}

// Base blocks are two seconds apart, so "near head" is a wider window here than
// it is on Ethereum for the same wall-clock tolerance: 900 blocks is half an
// hour, which is longer than this script's own run.
const bad0b = FIXTURES.filter((f) => {
  const b = PAGES.get(`${f.vault}:${f.holder}`).blockNumber;
  return !b || Number(head) - b > 900 || b > Number(head) + 60;
});
check(
  "0b each page states a block near this script's own head",
  bad0b.length === 0,
  bad0b.length
    ? bad0b
        .map((f) => `${short(f.vault)} page ${PAGES.get(`${f.vault}:${f.holder}`).blockNumber} vs own head ${head}`)
        .join(", ")
    : `head ${head}`,
);

const bad0c = FIXTURES.filter((f) => {
  const r = ROUTES.get(`${f.vault}:${f.holder}`);
  return r.status !== 200 || !r.timeline || r.timeline.blockNumber !== r.blockNumber;
});
check(
  "0c the API route serves a timeline pinned to the SAME block as its own reading",
  bad0c.length === 0,
  bad0c.length
    ? bad0c
        .map((f) => {
          const r = ROUTES.get(`${f.vault}:${f.holder}`);
          return `${short(f.vault)} reading ${r.blockNumber} vs timeline ${r.timeline?.blockNumber ?? "absent"}`;
        })
        .join(", ")
    : `${FIXTURES.length} routes`,
);

// This script's own rebuild, at the block each ROUTE states. Every expectation
// from here down comes out of these.
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  const r = ROUTES.get(key);
  OWN.set(key, await ownTimeline(f.vault, f.holder, BigInt(r.blockNumber)));
}

// ═══ 1: the gate is real ════════════════════════════════════════════════════
const bad1a = [];
const bad1b = [];
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  const own = OWN.get(key);
  const t = ROUTES.get(key).timeline;
  const drewRows = t.events.length > 0;
  // Every FIXTURE is a Tier 0 life — small enough to be built and drawn in one
  // request — so `WINDOW` is the right bound here, and a fixture that grew past
  // it would go red rather than quietly changing what this line means.
  const shouldDraw = own.reconciled && own.transferCount <= WINDOW;
  if (drewRows !== shouldDraw)
    bad1a.push(
      `${short(f.vault)}/${short(f.holder)}: page drew ${t.events.length} rows, own gate ${own.reconciled ? "PASSED" : "FAILED"} (${own.transferCount} logs)`,
    );
  if (t.reconcile?.replayed !== own.replayed || t.reconcile?.onChain !== own.onChain)
    bad1b.push(
      `${short(f.vault)}/${short(f.holder)}: page replayed ${t.reconcile?.replayed} vs own ${own.replayed}; page balanceOf ${t.reconcile?.onChain} vs own ${own.onChain}`,
    );
}
check(
  "1a the page drew a timeline if and only if this script's own replay reconciled",
  bad1a.length === 0,
  bad1a.join(" | ") || `${FIXTURES.length} fixtures`,
);
check(
  "1b both gate figures wei-exact against this script's own replay and its own balanceOf",
  bad1b.length === 0,
  bad1b.join(" | ") || `${FIXTURES.length} fixtures`,
);

const bad1c = FIXTURES.filter((f) => {
  const own = OWN.get(`${f.vault}:${f.holder}`);
  const t = ROUTES.get(`${f.vault}:${f.holder}`).timeline;
  return t.reconcile?.logsOut !== own.logsOut || t.reconcile?.logsIn !== own.logsIn;
});
check(
  "1c the page's own log counts, both directions, equal this script's own sweeps",
  bad1c.length === 0,
  bad1c.length
    ? bad1c
        .map((f) => {
          const own = OWN.get(`${f.vault}:${f.holder}`);
          const t = ROUTES.get(`${f.vault}:${f.holder}`).timeline;
          return `${short(f.vault)}: page ${t.reconcile?.logsOut}/${t.reconcile?.logsIn} vs own ${own.logsOut}/${own.logsIn}`;
        })
        .join(", ")
    : `${FIXTURES.length} fixtures`,
);

const bad1d = FIXTURES.filter((f) => {
  const p = PAGES.get(`${f.vault}:${f.holder}`);
  const own = OWN.get(`${f.vault}:${f.holder}`);
  const said = own.reconciled ? p.reconciledText : p.unreconciledText;
  if (!said) return true;
  return !said.includes(shareText(own.replayed, own.decimals)) || !said.includes(shareText(own.onChain, own.decimals));
});
check(
  "1d the page STATES both figures on its face, in this section's own print rule",
  bad1d.length === 0,
  bad1d.length
    ? bad1d
        .map((f) => {
          const own = OWN.get(`${f.vault}:${f.holder}`);
          return `${short(f.vault)}: expected "${shareText(own.replayed, own.decimals)}" and "${shareText(own.onChain, own.decimals)}"`;
        })
        .join(" | ")
    : `${FIXTURES.length} fixtures`,
);

/** A heavy life's SPINE, from this script's own two sweeps and nothing else:
 *  how many of its own `Transfer` logs there are, and their ids newest first.
 *  `ownTimeline` above reads a timestamp, a share price and an allocation at
 *  every distinct block — right for a small fixture and half an hour for an
 *  eight-thousand-block one, and none of those figures is what the checks below
 *  are about. */
async function ownHeavySpine(vault, holder, blockNumber) {
  const who = holder.toLowerCase();
  const [out, into] = await Promise.all([
    getLogs(vault, [TRANSFER, pad32(who), null], blockNumber, 0),
    getLogs(vault, [TRANSFER, null, pad32(who)], blockNumber, 0),
  ]);
  const seen = new Set();
  const rows = [...out, ...into]
    .filter((l) => {
      const k = `${l.transactionHash}:${l.logIndex}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((l) => ({
      id: `${l.transactionHash}:${Number(BigInt(l.logIndex))}`,
      blockNumber: Number(BigInt(l.blockNumber)),
      logIndex: Number(BigInt(l.logIndex)),
    }))
    // NEWEST FIRST, the order the reader serves in.
    .sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);
  return { transferCount: rows.length, rows };
}

// Tier 1: a life the lane hands over whole, above the window and at or below
// the ceiling. It is built into the store across visits and then drawn
// windowed — ONE request here, so it is asserted as "either mid-build or
// drawn"; the visit-by-visit progress is verify-base-vault-position-page.mjs's.
const hRoute = await readRoute(HEAVY.vault, HEAVY.holder);
const hPage = await readPage(HEAVY.vault, HEAVY.holder);
const hOwn = hRoute.status === 200 ? await ownHeavySpine(HEAVY.vault, HEAVY.holder, BigInt(hRoute.blockNumber)) : null;
if (!hOwn) {
  skip(
    "1e a heavy life: built into the store across visits, then drawn windowed",
    `the API route answered ${hRoute.status}`,
  );
} else if (hOwn.transferCount <= WINDOW || hOwn.transferCount > CEILING) {
  // NOT a skip: the fixture was chosen for a size it no longer has, so every
  // check resting on it would be green-but-vacuous.
  check(
    "1e the heavy fixture is still between the window and the ceiling — a fixture that moved tier is a stale fixture",
    false,
    `${short(HEAVY.holder)} on ${short(HEAVY.vault)}: ${hOwn.transferCount} of its own Transfer logs, wanted ${WINDOW + 1}–${CEILING}`,
  );
} else {
  const t = hRoute.timeline;
  const building = t.history?.building ?? null;
  const drawn = t.coverage.drawn ?? null;
  check(
    "1e a heavy life the lane hands over whole is either being built into the store or drawn windowed — never withheld",
    t.coverage.withheldAbove === null &&
      t.coverage.logCountIsLowerBound === false &&
      t.reconcile?.reconciled === true &&
      (building != null || drawn != null),
    `own ${hOwn.transferCount} logs; withheldAbove ${t.coverage.withheldAbove}, reconciled ${t.reconcile?.reconciled}, building ${JSON.stringify(building)}, drawn ${JSON.stringify(drawn)}`,
  );
  if (building) {
    check(
      "1f mid-build: no rows, a cut the page names, and its own words on the face",
      t.events.length === 0 &&
        building.totalRows === hOwn.transferCount &&
        building.keptRows > 0 &&
        building.keptRows <= building.totalRows &&
        building.keptCut > 0 &&
        (hPage.buildingText ?? "").includes(building.keptRows.toLocaleString("en-US")) &&
        hPage.domRows === 0,
      `${t.events.length} rows drawn, kept ${building.keptRows} of ${building.totalRows} at block ${building.keptCut}; page "${(hPage.buildingText ?? "").slice(0, 110)}"`,
    );
  } else {
    // ⚠️ THE DRAW WINDOW, NOT THE TIER BOUND. This cut on `WINDOW` (5,000)
    // until 2026-09-20 and went red on every run: `WINDOW` is
    // `VAULT_TIMELINE_HORIZON`, the bound that decides which TIER a life is in,
    // and the route draws `VAULT_TIMELINE_DRAW_ROWS` of it. One figure did both
    // jobs until 2026-09-10, which is why reusing it read as right. The
    // Ethereum arm was corrected in `e532166b` and the fix did not carry here
    // (TO-DO-ui-jobs §38).
    const wantRows = Math.min(DRAW_ROWS, hOwn.rows.length);
    const newest = hOwn.rows[0];
    check(
      "1f drawn: the newest DRAW_ROWS of this script's own life, its own count stated, and the newest row at the top",
      t.events.length === wantRows &&
        drawn.rows === wantRows &&
        drawn.of === hOwn.rows.length &&
        t.events[0].id === newest.id,
      `page ${t.events.length} rows, drawn ${JSON.stringify({ ...drawn, summary: undefined })}; own life ${hOwn.rows.length} rows, own newest ${newest.id}, page head ${t.events[0]?.id}`,
    );
    // The window SENTENCE is gone (decision 0019): the page states the two
    // figures in the toolbar's count line and on the rows wrapper. This read
    // `[data-figure='timeline-window']`, which the Base page stopped drawing
    // with the rest of them, so it failed on an absence rather than on a
    // disagreement.
    const wantLine = `Showing ${wantRows.toLocaleString("en-US")} of ${hOwn.rows.length.toLocaleString("en-US")} events`;
    check(
      "1f2 …and the page states both figures on its face — the count line and the wrapper",
      hPage.countLine === wantLine &&
        hPage.rowCountAttr === wantRows &&
        hPage.rowCountOf === hOwn.rows.length &&
        hPage.domRows > 0,
      `count line "${hPage.countLine ?? "ABSENT"}", wanted "${wantLine}"; wrapper ${hPage.rowCountAttr}/${hPage.rowCountOf}; ${hPage.domRows} rows painted`,
    );
  }
}

// The withheld path, shape two: the lane REFUSES this address's sweep on
// response size. The address is the vault's own fee recipient, read from the
// contract at the page's own block rather than pasted.
const caseFacts = await vaultFacts(CASE_STUDY, BigInt(PAGES.get(`${CASE_STUDY}:${FIXTURES[0].holder}`).blockNumber));
const FEE_RECIPIENT = caseFacts.feeRecipient;
const frRoute = await readRoute(CASE_STUDY, FEE_RECIPIENT);
const frPage = await readPage(CASE_STUDY, FEE_RECIPIENT);
let ownFeeRefused = false;
await getLogs(CASE_STUDY, [TRANSFER, null, pad32(FEE_RECIPIENT)], BigInt(frRoute.blockNumber ?? head), 0).catch(() => {
  ownFeeRefused = true;
});
if (frRoute.status !== 200) {
  skip("1g the horizon, floor: the one address the lane refuses outright", `the API route answered ${frRoute.status}`);
} else if (!ownFeeRefused) {
  // The premise moved: the lane now answers this address whole, so a lower
  // bound is no longer the right answer and this check would be vacuous.
  check(
    "1g the floor-horizon fixture's sweep is still refused by the lane — a premise that changed is a stale fixture",
    false,
    `${short(FEE_RECIPIENT)} on ${short(CASE_STUDY)}: this script's own whole-range sweep now answers, so the reader should be stating an EXACT count and this check must be rewritten`,
  );
} else {
  check(
    "1g the fee recipient states a horizon rather than its rows, with the count marked as a FLOOR and no gate claimed",
    frRoute.timeline?.events.length === 0 &&
      frRoute.timeline?.coverage.logCountIsLowerBound === true &&
      frRoute.timeline?.coverage.withheldAbove > WINDOW &&
      frRoute.timeline?.reconcile === null &&
      frRoute.timeline?.unread === null,
    `page drew ${frRoute.timeline?.events.length} rows, withheldAbove ${frRoute.timeline?.coverage.withheldAbove}, lowerBound ${frRoute.timeline?.coverage.logCountIsLowerBound}, reconcile ${JSON.stringify(frRoute.timeline?.reconcile)}, unread ${frRoute.timeline?.unread}`,
  );
  check(
    "1h and its face says 'at least' that count, draws no rows, and does not claim a balance check it could not run",
    (frPage.horizonText ?? "").includes("at least") &&
      (frPage.horizonText ?? "").includes(frRoute.timeline.coverage.withheldAbove.toLocaleString("en-US")) &&
      frPage.domRows === 0 &&
      !frPage.reconciledText,
    frPage.horizonText
      ? `"${frPage.horizonText.slice(0, 150)}…" · ${frPage.domRows} rows drawn`
      : "no horizon statement on the page",
  );
}

// ═══ 2: row count, order, and the reader's own fromBlock ════════════════════
const bad2a = [];
const bad2b = [];
const bad2c = [];
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  const own = OWN.get(key);
  const t = ROUTES.get(key).timeline;
  const p = PAGES.get(key);
  if (t.events.length !== own.rows.length)
    bad2a.push(`${short(f.vault)}/${short(f.holder)}: page ${t.events.length} rows vs own ${own.rows.length}`);
  // DESCENDING — newest first. Asserted on the API's own array; check 2c and
  // check 4e then hold the DOM to the same order, so the two cannot disagree.
  const ordered = t.events.every(
    (e, i) =>
      i === 0 ||
      e.blockNumber < t.events[i - 1].blockNumber ||
      (e.blockNumber === t.events[i - 1].blockNumber && e.logIndex < t.events[i - 1].logIndex),
  );
  if (!ordered) bad2b.push(`${short(f.vault)}/${short(f.holder)}`);
  // TWO CLAIMS, because the rows collapse now. The wrapper's count is the WHOLE
  // life and a run must never restate it; the PAINTED list is this script's own
  // grouping of the same rows; and expanding every run brings the life back row
  // for row, which is what every check below this one reads.
  const ownGrouped = ownRuns(own.rows);
  const painted = p.collapsed ?? [];
  const groupingBad =
    painted.length !== ownGrouped.length ||
    painted.some(
      (row, i) => row.kind !== ownGrouped[i].kind || (row.kind === "run" && row.count !== ownGrouped[i].events.length),
    );
  if (p.rowCountAttr !== own.rows.length || p.domRows !== own.rows.length || groupingBad)
    bad2c.push(
      `${short(f.vault)}/${short(f.holder)}: painted ${painted.length} rows (${painted.filter((r) => r.kind === "run").length} runs) vs own grouping ${ownGrouped.length} (${ownGrouped.filter((r) => r.kind === "run").length} runs); expanded ${p.domRows} (attr ${p.rowCountAttr}) vs own ${own.rows.length}`,
    );
}
check(
  "2a the row count equals this script's own log count",
  bad2a.length === 0,
  bad2a.join(" | ") || `${FIXTURES.length} fixtures`,
);
check(
  "2b rows are descending by (block, logIndex) — newest first",
  bad2b.length === 0,
  bad2b.join(", ") || `${FIXTURES.length} fixtures`,
);
check(
  "2c the painted list is this script's own run grouping, and expanding every run gives back exactly the life's rows",
  bad2c.length === 0,
  bad2c.join(" | ") ||
    `${FIXTURES.length} fixtures, ${FIXTURES.reduce((a, f) => a + (PAGES.get(`${f.vault}:${f.holder}`).runsPainted ?? 0), 0)} run rows collapsed across them`,
);

const bad2d = FIXTURES.filter((f) => {
  const own = OWN.get(`${f.vault}:${f.holder}`);
  const t = ROUTES.get(`${f.vault}:${f.holder}`).timeline;
  return t.events.some((e, i) => e.id !== own.rows[i]?.id);
});
check(
  "2d every row is the same log this script read, id by id",
  bad2d.length === 0,
  bad2d.map((f) => short(f.vault)).join(", ") || `${FIXTURES.length} fixtures`,
);

// The reader starts at the catalogue's creation block. This script starts at
// zero (or says so when it could not), and additionally bisects `eth_getCode`
// for the block the vault's code first exists at — so a creation block that
// was too LATE, and would have cut a life off at its start, goes red here.
const fromZero = FIXTURES.filter((f) => OWN.get(`${f.vault}:${f.holder}`).sweptFromZero);
const bad2e = [];
for (const f of FIXTURES) {
  const t = ROUTES.get(`${f.vault}:${f.holder}`).timeline;
  const own = OWN.get(`${f.vault}:${f.holder}`);
  const created = await createdBlockOf(f.vault, Number(head));
  if (t.reconcile && t.reconcile.fromBlock > created)
    bad2e.push(`${short(f.vault)}: reader from ${t.reconcile.fromBlock}, code first exists at ${created}`);
  if (own.firstLogBlock != null && t.reconcile && t.reconcile.fromBlock > own.firstLogBlock)
    bad2e.push(`${short(f.vault)}: reader from ${t.reconcile.fromBlock}, earliest own log at ${own.firstLogBlock}`);
}
check(
  "2e the reader's own fromBlock is at or before the block each vault's code first exists at, so nothing was cut off",
  bad2e.length === 0,
  bad2e.join(" | ") ||
    `${fromZero.length}/${FIXTURES.length} of this script's own sweeps ran from block 0; creation blocks bisected from eth_getCode: ${[...createdCache.entries()].map(([v, b]) => `${short(v)}:${b}`).join(", ")}`,
);

// ═══ 3: every row wei-exact, and the exponent is a read ═════════════════════
const bad3 = { delta: [], balance: [], assets: [], price: [], counterparty: [] };
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  const own = OWN.get(key);
  const t = ROUTES.get(key).timeline;
  for (let i = 0; i < Math.min(t.events.length, own.rows.length); i++) {
    const p = t.events[i];
    const o = own.rows[i];
    const where = `${short(f.vault)}/${short(f.holder)} row ${i} blk ${o.blockNumber}`;
    if (p.sharesDelta !== o.sharesDelta) bad3.delta.push(`${where}: page ${p.sharesDelta} vs own ${o.sharesDelta}`);
    if (p.balanceAfter !== o.balanceAfter)
      bad3.balance.push(`${where}: page ${p.balanceAfter} vs own ${o.balanceAfter}`);
    if ((p.assets ?? null) !== (o.assets ?? null)) bad3.assets.push(`${where}: page ${p.assets} vs own ${o.assets}`);
    if (p.sharePriceAtBlock !== o.sharePriceAtBlock)
      bad3.price.push(`${where}: page ${p.sharePriceAtBlock} vs own ${o.sharePriceAtBlock} (10^${own.decimals})`);
    if ((p.counterparty ?? null) !== (o.counterparty ?? null))
      bad3.counterparty.push(`${where}: page ${p.counterparty} vs own ${o.counterparty}`);
  }
}
check(
  "3a every row's signed share delta wei-exact",
  bad3.delta.length === 0,
  bad3.delta.slice(0, 3).join(" | ") || `every row on ${FIXTURES.length} fixtures`,
);
check(
  "3b every row's replayed balance-after wei-exact",
  bad3.balance.length === 0,
  bad3.balance.slice(0, 3).join(" | ") || `every row on ${FIXTURES.length} fixtures`,
);
check(
  "3c every row's asset leg equals the ERC-4626 event in the SAME transaction, and is absent where none was emitted",
  bad3.assets.length === 0,
  bad3.assets.slice(0, 3).join(" | ") || `every row on ${FIXTURES.length} fixtures`,
);
check(
  "3d every row's share price equals this script's own convertToAssets(10 ** its own decimals) at that row's block",
  bad3.price.length === 0,
  bad3.price.slice(0, 3).join(" | ") || `every row on ${FIXTURES.length} fixtures`,
);

check(
  "3g every row's counterparty is the address at the other end of this script's own log, or absent where the other end is the zero address",
  bad3.counterparty.length === 0,
  bad3.counterparty.slice(0, 3).join(" | ") || `every row on ${FIXTURES.length} fixtures`,
);

// The anti-vacuity rule, in the shape Base allows. There is no 6-decimal share
// token here to span — MetaMorpho's factory pins every vault's shares to 18 —
// so what the sample must span instead is the PAIR the 18 is built out of.
const offsets = new Set(FIXTURES.map((f) => OWN.get(`${f.vault}:${f.holder}`).decimalsOffset));
const assetClasses = new Set(FIXTURES.map((f) => OWN.get(`${f.vault}:${f.holder}`).assetDecimals));
check(
  "3e the sample spans more than one DECIMALS_OFFSET and more than one asset-decimal class, so 3d and 3f are not vacuous",
  offsets.size > 1 && assetClasses.size > 1,
  `DECIMALS_OFFSET values in the sample: ${[...offsets].join(", ")}; asset decimals: ${[...assetClasses].join(", ")}`,
);

const bad3f = [];
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  const own = OWN.get(key);
  const p = PAGES.get(key);
  const said = p.exponentText ?? "";
  const wants = [`10^${own.decimals}`, `decimals()`];
  if (own.decimalsOffset != null) wants.push(`DECIMALS_OFFSET`, String(own.decimalsOffset), String(own.assetDecimals));
  const missing = wants.filter((w) => !said.includes(w));
  if (missing.length) bad3f.push(`${short(f.vault)}: "${said.slice(0, 120)}" lacks ${missing.join(", ")}`);
  const t = ROUTES.get(key).timeline;
  if (t.events.some((e) => e.shareDecimals !== own.decimals))
    bad3f.push(
      `${short(f.vault)}: a row states shareDecimals other than this script's own decimals() read ${own.decimals}`,
    );
}
check(
  "3f the exponent is STATED on the page and equals this script's own decimals() read, with the offset it is built from",
  bad3f.length === 0,
  bad3f.slice(0, 3).join(" | ") ||
    FIXTURES.map((f) => {
      const own = OWN.get(`${f.vault}:${f.holder}`);
      return `${short(f.vault)} 10^${own.decimals} = ${own.assetDecimals} + ${own.decimalsOffset}`;
    }).join(", "),
);

// ═══ 4: kinds are decided by the zero address ═══════════════════════════════
const bad4a = [];
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  const own = OWN.get(key);
  const t = ROUTES.get(key).timeline;
  for (let i = 0; i < Math.min(t.events.length, own.rows.length); i++)
    if (t.events[i].kind !== own.rows[i].kind)
      bad4a.push(`${short(f.vault)} row ${i}: page "${t.events[i].kind}" vs own "${own.rows[i].kind}"`);
}
check(
  "4a every row's kind equals this script's own zero-address classification",
  bad4a.length === 0,
  bad4a.slice(0, 3).join(" | ") || `every row on ${FIXTURES.length} fixtures`,
);

const bad4b = [];
for (const f of FIXTURES) {
  const own = OWN.get(`${f.vault}:${f.holder}`);
  const kinds = new Set(own.rows.map((r) => r.kind));
  const has = {
    mints: kinds.has("deposit"),
    burns: kinds.has("withdrawal"),
    transfersIn: kinds.has("transfer-in"),
    transfersOut: kinds.has("transfer-out"),
  };
  for (const [k, want] of Object.entries(f.expect))
    if (want && !has[k]) bad4b.push(`${f.label}: expected ${k}, this script's own read found none`);
}
check(
  "4b each fixture still exercises the branch it was chosen for — a fixture whose shape changed is a stale fixture",
  bad4b.length === 0,
  bad4b.join(" | ") || FIXTURES.map((f) => f.label.split(" / ")[0]).join(", "),
);

const allKinds = new Set();
for (const f of FIXTURES) for (const r of OWN.get(`${f.vault}:${f.holder}`).rows) allKinds.add(r.kind);
const wanted4c = ["deposit", "withdrawal", "transfer-in", "transfer-out"];
const missing4c = wanted4c.filter((k) => !allKinds.has(k));
check(
  "4c the sample reaches every row kind a MetaMorpho vault can produce",
  missing4c.length === 0,
  missing4c.length ? `never met: ${missing4c.join(", ")}` : [...allKinds].sort().join(", "),
);
if (!allKinds.has("transfer-self"))
  skip(
    "4d the self-transfer branch (from == to == the holder)",
    "no fixture in this sample has one, and this script's own sweeps found none on any of them — the branch is written and untested rather than wrong; a fixture with one would exercise it",
  );

// A row's verb, as its OWN kind renders it — and the two kinds do not render it
// the same way. This expected "Received" / "Sent" in a custody row's header
// until 2026-09-20 and went red on every one of them. The PAGE is right:
// `ChainTruthRow` drops the label on a custody row by design
// (components/shared/chain-truth-event.tsx:369, `spec.label && !spec.custody`),
// because the spine's plane badge and the chip's to/from already carry the
// verb, and an empty span would steal a gap. The words themselves are still on
// the page — `KIND_LABEL` hands them to the run card, the surface that
// summarises a run (lib/aave-vaults/timeline-runs.tsx:106,214). So a
// deposit/withdrawal row is checked on its label and a custody row on the
// direction PLUS its own counterparty — "from" on its own would pass a header
// that read either way, and the counterparty is what makes the two directions
// impossible to confuse (TO-DO-ui-jobs §38, the Ethereum arm's own shape).
const LABELS_4E = {
  deposit: () => "Deposit",
  withdrawal: () => "Withdrawal",
  "transfer-in": (e) => `from ${short(e.counterparty)}`,
  "transfer-out": (e) => `to ${short(e.counterparty)}`,
  "transfer-self": () => "No change",
};
const bad4e = [];
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  const own = OWN.get(key);
  const p = PAGES.get(key);
  // THE FLAT LIFE is the right index here, collapsing or not: `readPage` opens
  // every run before it reads `headerTexts`, so every log in the life has a
  // mounted row of its own (the reading note in `readPage` says so). The
  // painted list is `collapsed`, and check 2c is the one that walks that.
  for (let i = 0; i < Math.min(p.headerTexts.length, own.rows.length); i++) {
    const event = own.rows[i];
    const want = LABELS_4E[event.kind]?.(event);
    if (want == null) continue;
    if (!p.headerTexts[i].includes(want))
      bad4e.push(
        `${short(f.vault)} row ${i} (${event.kind}): header "${p.headerTexts[i].slice(0, 44)}" lacks "${want}"`,
      );
  }
}
check(
  "4e each rendered row carries its own kind's verb — the label on a vault row, the direction and counterparty on a custody one",
  bad4e.length === 0,
  bad4e.slice(0, 3).join(" | ") || `every row on ${FIXTURES.length} fixtures`,
);

// ═══ 5: MetaMorpho's own per-row figure — the denominator ═══════════════════
// The Ethereum verifier's section 5 is the Umbrella cooldown; a MetaMorpho
// vault has no cooldown and no per-holder event beyond the three ERC-4626 ones,
// so what stands in its place is the figure this family's whole page rests on:
// exposure here is proportional, so a balance means nothing without the supply
// it sat beside, and that supply is different on every row.
const bad5a = [];
const denominators = new Set();
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  const own = OWN.get(key);
  const t = ROUTES.get(key).timeline;
  for (let i = 0; i < Math.min(t.events.length, own.rows.length); i++) {
    const page = t.events[i].extra?.totalSupplyAtBlock ?? null;
    denominators.add(own.rows[i].totalSupplyAtBlock);
    if (page !== own.rows[i].totalSupplyAtBlock)
      bad5a.push(
        `${short(f.vault)} row ${i} blk ${own.rows[i].blockNumber}: page ${page} vs own ${own.rows[i].totalSupplyAtBlock}`,
      );
  }
}
check(
  "5a every row's supply equals this script's own archive totalSupply() at that row's own block",
  bad5a.length === 0,
  bad5a.slice(0, 3).join(" | ") || `every row on ${FIXTURES.length} fixtures`,
);
check(
  "5b the sample spans MORE THAN ONE denominator, so 5a cannot pass on a page printing one supply for every row",
  denominators.size > 1,
  `${denominators.size} distinct supplies across the sample`,
);

// ═══ 6: the fee-share mint is absent, and for the right reason ══════════════
// MetaMorpho mints performance-fee shares to its fee recipient inside nearly
// every deposit and withdrawal. Those mints carry NEITHER of the holder's own
// topics, so they are never fetched — there is nothing to exclude, and this
// section is the proof that nothing crept in another way.
const bad6a = [];
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  const facts = OWN.get(key);
  const t = ROUTES.get(key).timeline;
  for (const e of t.events)
    if (e.counterparty && e.counterparty.toLowerCase() === facts.feeRecipient)
      bad6a.push(`${short(f.vault)} row at blk ${e.blockNumber}: counterparty is the vault's own feeRecipient()`);
}
check(
  "6a the vault's own feeRecipient() is a counterparty on no ordinary holder's row",
  bad6a.length === 0,
  bad6a.join(" | ") ||
    `feeRecipient() read at each page's block: ${[...new Set(FIXTURES.map((f) => short(OWN.get(`${f.vault}:${f.holder}`).feeRecipient)))].join(", ")}`,
);
// ═══ 7: notes are notes ════════════════════════════════════════════════════
const caseBlock = BigInt(PAGES.get(`${CASE_STUDY}:${FIXTURES[0].holder}`).blockNumber);
const ownSetFee = await getLogs(CASE_STUDY, [SET_FEE], caseBlock, 0);
const ownSetName = await getLogs(CASE_STUDY, [SET_NAME], caseBlock, 0);
const ownSetSymbol = await getLogs(CASE_STUDY, [SET_SYMBOL], caseBlock, 0);
const ownNoteCount = ownSetFee.length + ownSetName.length + ownSetSymbol.length;
const caseKeys = FIXTURES.filter((f) => f.vault === CASE_STUDY).map((f) => `${f.vault}:${f.holder}`);
const bad7a = caseKeys.filter((k) => (ROUTES.get(k).timeline.notes ?? []).length !== ownNoteCount);
check(
  "7a the vault's configuration events appear as NOTES, with this script's own counts",
  bad7a.length === 0,
  bad7a.length
    ? `own ${ownNoteCount}, page ${bad7a.map((k) => ROUTES.get(k).timeline.notes.length).join("/")}`
    : `SetFee ${ownSetFee.length}, SetName ${ownSetName.length}, SetSymbol ${ownSetSymbol.length}`,
);
const bad7b = caseKeys.filter((k) => {
  const notes = ROUTES.get(k).timeline.notes;
  const fee = notes.filter((x) => x.kind === "fee");
  const name = notes.filter((x) => x.kind === "vault-name");
  const symbol = notes.filter((x) => x.kind === "vault-symbol");
  return (
    fee.some(
      (x, i) =>
        x.blockNumber !== Number(BigInt(ownSetFee[i].blockNumber)) ||
        x.fields.newFee !== word(ownSetFee[i].data, 0).toString(),
    ) ||
    name.some(
      (x, i) =>
        x.blockNumber !== Number(BigInt(ownSetName[i].blockNumber)) || x.fields.name !== stringWord(ownSetName[i].data),
    ) ||
    symbol.some(
      (x, i) =>
        x.blockNumber !== Number(BigInt(ownSetSymbol[i].blockNumber)) ||
        x.fields.symbol !== stringWord(ownSetSymbol[i].data),
    )
  );
});
check(
  "7b each note's block and value equal this script's own decode of that log",
  bad7b.length === 0,
  bad7b.length
    ? bad7b.join(", ")
    : `${ownSetFee.map((l) => `fee@${BigInt(l.blockNumber)}=${word(l.data, 0)}`).join(", ")}, name "${ownSetName.length ? stringWord(ownSetName[0].data) : "—"}", symbol "${ownSetSymbol.length ? stringWord(ownSetSymbol[0].data) : "—"}"`,
);
// The subject here is EXTRA rows — a reader that drew the accrual stream would
// have tens of thousands. Deliberately not an equality against this script's
// own count: that is 2a's job.
let ownAccrue = null;
try {
  ownAccrue = (await getLogs(CASE_STUDY, [ACCRUE], caseBlock, Number(caseBlock) - 500_000)).length;
} catch {
  ownAccrue = null;
}
const bad7c = caseKeys.filter((k) => ROUTES.get(k).timeline.events.length > OWN.get(k).rows.length);
if (ownAccrue == null) {
  skip(
    "7c the AccrueInterest logs this script counts are rows nowhere",
    "the lane refused this script's own AccrueInterest sweep, so the premise could not be measured",
  );
} else {
  check(
    `7c and the ${ownAccrue.toLocaleString("en-US")} AccrueInterest logs this script counts in the last 500,000 blocks alone are rows nowhere`,
    bad7c.length === 0 && ownAccrue > 100,
    `rows drawn on the case-study vault: ${caseKeys.map((k) => ROUTES.get(k).timeline.events.length).join(", ")}, none of them an accrual row; AccrueInterest logs counted: ${ownAccrue}`,
  );
}
// ⚠️ 2026-09-20 — THE NOTES MOVED IN AMONG THE ROWS, AND THIS CHECK MOVED WITH
// THEM. They used to sit in a block of their own above the list, and 7d asked
// that the block existed and said so. They are house note rows now, placed by
// block through `ChainTruthTimeline`'s `notes` prop — which is worth more to a
// reader (they can see WHEN the terms moved against their own events) and is
// worth exactly nothing unless the never-counted guarantee still holds. So 7d
// asks where a note landed, and 7e asks what it moved.
const bad7d = caseKeys.filter((k) => {
  const p = PAGES.get(k);
  if (p.noteCount !== ownNoteCount) return true;
  // Every note the page BUILT that has a row at or after its block renders,
  // and it renders under that row: a note sits after the first event at or
  // past its own block, and a newest-first list puts "after" below.
  if (p.noteRows.length === 0 || p.noteRows.length > p.noteCount) return true;
  return p.noteRows.some((note) => !note.id.startsWith("vault-terms:") || note.after == null);
});
check(
  "7d each note is drawn among the rows, under the event at or after its own block",
  bad7d.length === 0,
  bad7d.length
    ? bad7d
        .map((k) => `${short(k.split(":")[1])} built ${PAGES.get(k).noteCount} drew ${PAGES.get(k).noteRows.length}`)
        .join(", ")
    : caseKeys.map((k) => `${short(k.split(":")[1])}: ${PAGES.get(k).noteRows.length} note row(s) placed`).join(", "),
);
// THE POINT OF THE PROP, ASSERTED RATHER THAN ASSUMED. A note must move no
// count: not the wrapper's row attribute, not the toolbar's own count line, not
// the number of event rows the page painted, and not the type filter's
// options — a note kind appearing there would make a vault-wide fact
// selectable as if it were one of this address's actions.
const bad7e = caseKeys.filter((k) => {
  const p = PAGES.get(k);
  const own = OWN.get(k);
  if (p.noteRows.length === 0) return false;
  // The wrapper's own count is the LOADER's row count, unmoved by the notes
  // drawn beside those rows — and `domRows` on this verifier's pages is the
  // expanded count, which check 2a already owns.
  if (p.rowCountAttr !== own.rows.length) return true;
  return /vault-terms|performance fee|share token name|share token symbol/i.test(p.filterOptionText ?? "");
});
check(
  "7e and it moves no count — the row attribute and the type filter are what they were without it",
  bad7e.length === 0,
  bad7e.length
    ? bad7e
        .map((k) => `${short(k.split(":")[1])} rows ${PAGES.get(k).rowCountAttr} vs own ${OWN.get(k).rows.length}`)
        .join(", ")
    : caseKeys
        .map((k) => `${short(k.split(":")[1])}: ${OWN.get(k).rows.length} rows, ${PAGES.get(k).noteRows.length} notes`)
        .join(", "),
);

// ═══ 8: one USD figure at most, no APY, no rate of return ══════════════════
// Since mig 206 the position card carries ONE dollar figure — Value · USD,
// the census's oracle read at the census block — so the rule is no longer "no
// dollar figure" but "no dollar figure other than that stat": an open, priced
// card accounts for exactly one, and a closed or unpriced one for none. The
// timeline itself still carries none, which is what B6 below breaks.
const USD_FIGURE_RE = /\$\s?\d[\d,.]*[kMB]?/g;
const USD_SUFFIX_RE = /\b\d[\d,]*(?:\.\d+)?\s?USD\b/;
// A rate of return is a FIGURE wearing a period, so the test is the figure and
// the period together — "Apr" is a month in this section's own en-GB dates, and
// the word "annualised" can appear in a sentence REFUSING to annualise.
const RETURN_RE =
  /\d[\d.,]*\s?%?\s?(?:APY|APR)\b|(?:APY|APR)\s?(?:of|:)?\s?\d|\d\s?%\s?(?:a year|per year|annually|annuali[sz]ed)|rate of return|annuali[sz]ed (?:rate|yield|return|figure) of/;
const bad8a = [];
const bad8b = [];
for (const f of FIXTURES) {
  const p = PAGES.get(`${f.vault}:${f.holder}`);
  const figures = p.bodyText.match(USD_FIGURE_RE) ?? [];
  const expected = p.cardStatus === "live" && p.cardValueUsdE8 ? 1 : 0;
  const suffix = p.bodyText.match(USD_SUFFIX_RE);
  if (figures.length !== expected || suffix)
    bad8a.push(
      `${short(f.vault)}/${short(f.holder)}: ${figures.length} dollar figure(s) (${figures.join(", ") || "none"}) for a ${p.cardStatus ?? "?"} card ${p.cardValueUsdE8 ? "with" : "without"} a value${suffix ? `; "${suffix[0]}"` : ""}`,
    );
  const ret = p.bodyText.match(RETURN_RE);
  if (ret) bad8b.push(`${short(f.vault)}/${short(f.holder)}: "${ret[0]}"`);
}
check(
  "8a the only dollar figure on any sampled page is the card's Value · USD stat",
  bad8a.length === 0,
  bad8a.join(", ") || `${FIXTURES.length} pages`,
);
check(
  "8b no APY, no annualised figure and no rate of return",
  bad8b.length === 0,
  bad8b.join(", ") || `${FIXTURES.length} pages`,
);

// ═══ 9: no line chart of share price ═══════════════════════════════════════
const bad9 = [];
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  const own = OWN.get(key);
  const p = PAGES.get(key);
  const prices = own.rows.map((r) => Number(r.sharePriceAtBlock) / Math.pow(10, own.assetDecimals));
  for (const geo of p.svgGeometry) {
    const nums = (geo.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const matched = prices.filter((v) => nums.some((x) => Math.abs(x - v) < 1e-6));
    if (matched.length >= 2)
      bad9.push(`${short(f.vault)}: an SVG geometry carries ${matched.length} of the rows' share prices`);
  }
}
check(
  "9a no SVG path, polyline or polygon in the timeline carries the rows' share prices — no curve is drawn through them",
  bad9.length === 0,
  bad9.join(" | ") ||
    `${FIXTURES.reduce((a, f) => a + PAGES.get(`${f.vault}:${f.holder}`).svgGeometry.length, 0)} SVG geometries examined, none of them a price series`,
);
const bad9b = FIXTURES.filter((f) => {
  const p = PAGES.get(`${f.vault}:${f.holder}`);
  return /price (?:rose|fell|grew|climbed|increased|decreased)|since (?:the|your) (?:first|last) (?:deposit|event)/i.test(
    p.timelineText,
  );
});
check(
  "9b and the copy states no movement between two rows' prices",
  bad9b.length === 0,
  bad9b.map((f) => short(f.vault)).join(", ") || `${FIXTURES.length} pages`,
);

// ═══ 10: locale ════════════════════════════════════════════════════════════
const bad10a = FIXTURES.filter((f) => {
  const own = OWN.get(`${f.vault}:${f.holder}`);
  const p = PAGES.get(`${f.vault}:${f.holder}`);
  return !(p.reconciledText ?? "").includes(shareText(own.replayed, own.decimals));
});
check(
  "10a the reconcile figures print in en-US, judged against this script's own re-format of its own chain read",
  bad10a.length === 0,
  bad10a
    .map((f) => {
      const own = OWN.get(`${f.vault}:${f.holder}`);
      return `${short(f.vault)} expected "${shareText(own.replayed, own.decimals)}"`;
    })
    .join(" | ") || `${FIXTURES.length} pages`,
);
const bad10b = [];
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  const own = OWN.get(key);
  const p = PAGES.get(key);
  for (let i = 0; i < Math.min(p.headerTexts.length, own.rows.length); i++) {
    const here = own.rows[i];
    const prev = i > 0 ? own.rows[i - 1] : null;
    if (prev && dayKey(here.timestamp) === dayKey(prev.timestamp)) continue;
    const want = dayPrefix(here.timestamp);
    if (!p.headerTexts[i].includes(want))
      bad10b.push(`${short(f.vault)} row ${i}: header "${p.headerTexts[i].slice(0, 50)}" lacks "${want}"`);
  }
}
check(
  "10b every day-leading row carries its date in en-GB UTC, equal to this script's own format of its own timestamp read",
  bad10b.length === 0,
  bad10b.slice(0, 3).join(" | ") || `${FIXTURES.length} pages`,
);
const bad10c = FIXTURES.filter((f) =>
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(PAGES.get(`${f.vault}:${f.holder}`).timelineText),
);
check(
  "10c no slash-form date anywhere in the timeline",
  bad10c.length === 0,
  bad10c.map((f) => short(f.vault)).join(", ") || `${FIXTURES.length} pages`,
);

// ═══ 11: the dev provenance tripwire ═══════════════════════════════════════
for (const f of FIXTURES)
  EXPANDED.set(`${f.vault}:${f.holder}`, await readPage(f.vault, f.holder, { expandRows: true }));
const noHolder = await readPage(CASE_STUDY, null);

// 5c and 6b waited for the expanded pages: a row's own panel — where its
// counterparty and its share of the vault are stated — is only in the DOM once
// the card is open. 🔑 6b was written against the UNEXPANDED page first and
// stayed green under the break that forged a counterparty, because the address
// it was looking for had nowhere to appear.
const bad5c = [];
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  const own = OWN.get(key);
  const p = EXPANDED.get(key);
  // A missing expanded read is a FAILURE, not a skip: 5c is the only check that
  // reads the figure off the face, and passing it by would make it vacuous.
  if (!p) {
    bad5c.push(`${short(f.vault)}: the expanded page could not be read`);
    continue;
  }
  for (let i = 0; i < own.rows.length; i++) {
    const want = pctText(Number(BigInt(own.rows[i].balanceAfter)) / Number(BigInt(own.rows[i].totalSupplyAtBlock)));
    if (!p.shareOfVaultTexts.some((t) => t.includes(want)))
      bad5c.push(`${short(f.vault)} row ${i}: no panel states "${want}"`);
  }
}
const bad6b = [];
for (const f of FIXTURES) {
  const key = `${f.vault}:${f.holder}`;
  const facts = OWN.get(key);
  const p = EXPANDED.get(key);
  if (!p) {
    bad6b.push(`${short(f.vault)}: the expanded page could not be read`);
    continue;
  }
  // Both forms the page could print it in: the whole address, and the
  // `0x1234…abcd` elision every address on this surface wears.
  const text = (p.timelineText ?? "").toLowerCase();
  if (text.includes(facts.feeRecipient) || text.includes(short(facts.feeRecipient).toLowerCase()))
    bad6b.push(`${short(f.vault)}: the drawn timeline names ${short(facts.feeRecipient)}`);
}
check(
  "6b and its address is named nowhere in a drawn timeline, every row's panel open",
  bad6b.length === 0,
  bad6b.join(" | ") || `${FIXTURES.length} timelines, every row expanded`,
);

check(
  "5c every row's panel states this script's own share of the vault, in the section's own print rule",
  bad5c.length === 0,
  bad5c.slice(0, 3).join(" | ") ||
    `${FIXTURES.reduce((a, f) => a + (EXPANDED.get(`${f.vault}:${f.holder}`)?.shareOfVaultTexts.length ?? 0), 0)} panels read`,
);

if (![...EXPANDED.values()].some((p) => p.tripwireBookends > 0)) {
  skip(
    "11a the dev provenance tripwire reports no uncovered figure (with a holder)",
    "no tripwire bookends in the DOM — a production build renders none",
  );
} else {
  const bad11a = FIXTURES.filter((f) => EXPANDED.get(`${f.vault}:${f.holder}`).uncovered.length > 0);
  check(
    "11a with a holder, every row expanded: no uncovered figure",
    bad11a.length === 0,
    bad11a.length
      ? bad11a
          .map((f) => `${short(f.vault)}: ${EXPANDED.get(`${f.vault}:${f.holder}`).uncovered.slice(0, 4).join(" · ")}`)
          .join(" | ")
      : `${FIXTURES.length} pages, ${FIXTURES.reduce((a, f) => a + EXPANDED.get(`${f.vault}:${f.holder}`).domRows, 0)} rows expanded`,
  );
  check(
    "11b and with no holder at all: no uncovered figure",
    noHolder.uncovered.length === 0,
    noHolder.uncovered.slice(0, 4).join(" · ") || "no holder, no findings",
  );
}

// ═══ 12: a fixture that has exited is a FAILURE ════════════════════════════
const bad12 = FIXTURES.filter((f) => BigInt(OWN.get(`${f.vault}:${f.holder}`).onChain) <= BigInt(0));
check(
  "12a every fixture still holds a positive balance at the page's own block — an exited fixture makes every check above it vacuous",
  bad12.length === 0,
  bad12.length
    ? bad12.map((f) => `${f.label}: balanceOf ${OWN.get(`${f.vault}:${f.holder}`).onChain}`).join(" | ")
    : FIXTURES.map(
        (f) =>
          `${short(f.holder)} ${shareText(OWN.get(`${f.vault}:${f.holder}`).onChain, OWN.get(`${f.vault}:${f.holder}`).decimals)}`,
      ).join(", "),
);
const bad12b = FIXTURES.filter((f) => OWN.get(`${f.vault}:${f.holder}`).rows.length === 0);
check(
  "12b and every fixture still has a life to draw",
  bad12b.length === 0,
  bad12b.map((f) => f.label).join(" | ") ||
    FIXTURES.map((f) => `${short(f.holder)} ${OWN.get(`${f.vault}:${f.holder}`).rows.length} rows`).join(", "),
);

await browser.close();
console.log(`\n${passes}/${passes + failures} checks passed${skipped ? ` · ${skipped} SKIP` : ""}`);
process.exit(failures ? 1 : 0);
