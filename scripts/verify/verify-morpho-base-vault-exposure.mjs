#!/usr/bin/env node
// The MetaMorpho vault-exposure page, checked against the chain rather than
// against itself. /base/morpho/vaults/<vault> (the market view) and, where a holder is
// named, /base/morpho/vaults/<vault>/<holder> (the position page).
//
// ── 2026-09-08 · `?holder=` NAMES A PATH NOW (rails-ops plan D11) ──────────
// The market view's lookup form is a native GET, and its landing place 307s to
// `/base/morpho/vaults/<vault>/<what was typed>` — a position has a path of its own.
// Playwright's `goto` follows that, so every holder check in this file reads
// the POSITION page and asserts exactly what it did; the page carries one thing
// the old one did not, the listing's own card, which no check here reads. Only
// check 8 had to move a selector — see its own note. 48/48, unchanged.
// ----------------------------------------------------------------------------
// EVERY EXPECTED VALUE HERE IS THIS SCRIPT'S OWN CHAIN READ. The page states the
// block it read at; this verifier then makes its own viem calls AT THAT BLOCK —
// `totalAssets`, `totalSupply`, `withdrawQueue`, `market(id)`, `position(id,
// vault)`, `balanceOf(holder)` — and recomputes every figure from them. Nothing
// expected is scraped from the page, from the loader, or from a fixture: the one
// thing taken from the DOM is the block number, and that is the subject of check
// 2, not a source of truth for the rest.
//
// Run:
//   BASE=http://localhost:3022 node scripts/verify/verify-morpho-base-vault-exposure.mjs
//   BASE=http://localhost:3022 node …/verify-morpho-base-vault-exposure.mjs --vault=0x…
// The default BASE is localhost:3022 — the port this was developed on, chosen
// so a stray `next dev` on 3000 cannot be verified by accident. Needs
// BASE_RPC_URL and BASE_BACKFILL_RPC_URL in .env.local (read, never printed).
//
// ONE VAULT PER RUN, and `--vault=` says which; the default is the case-study
// vault, so a bare run is the run this script was written for. The served test
// is catalog membership (lib/morpho-base/vault-case-study.ts), so `--vault=`
// takes any address in lib/morpho-base/vault-catalog.ts with no server-side
// override needed.
//
// NO FIXTURE IS HARDCODED. The holders this run reads about are DISCOVERED at
// the block the page states: the vault's own ERC-20 `Transfer` logs are swept
// from its creation block (lib/morpho-base/vault-catalog.ts) to that block over
// BASE_BACKFILL_RPC_URL, every sender and recipient becomes a candidate, and
// `balanceOf` at that block through Multicall3 keeps the ones that still hold
// something. LARGEST and DUST are the top and bottom of that list. A vault with
// fewer than two holders cannot support the comparison, and the checks that
// need one report SKIP with the reason rather than a PASS they did not earn.
// A THIRD FIXTURE rides on the same sweep: the largest holder whose
// `eth_getCode` comes back EMPTY, which gives the shape line's no-code branch a
// subject this run discovered instead of one it was told. On the case-study
// vault that is the fifth-largest holder — the four above it are a re-wrapping
// ERC-4626, two proxies and an unnamed contract — so the scan is capped and
// reports SKIP with the cap when a vault's largest holders are all contracts.
//
// THE SWEEP MUST NOT ACCEPT A SHORT ANSWER. A provider that quietly truncates a
// log range answers 200 with a subset, and a subset would silently shrink the
// candidate set — the holder the run should have found simply would not exist.
// So: every returned log's `blockNumber` is asserted inside the asked range, the
// asked ranges are asserted to tile the whole span with no hole (check 0a), and a
// chunk that comes back at the provider's page size is re-asked halved rather
// than believed. BASE_HYPERRPC_URL is deliberately not used anywhere here: it has
// answered 200 with a partial log set before.
//
// NOTHING IS ASSUMED ABOUT THE ASSET. The asset's decimals come from this
// script's own `decimals()` read on the vault's own `asset()`, so a WETH vault's
// figures resolve at 18 and a USDC vault's at 6 from the same code.
//
// ── PROVED IT CAN FAIL, 2026-09-05, BASE=http://localhost:3022 ───────────────
// Nine breaks, each made alone and reverted; the restored run is 35/35 green.
// Recorded verbatim, because a check nobody has seen go red is a check nobody
// has tested.
//
//  R1  +1 RAW UNIT on this script's own Σ legs → 2 red (3b, 3d) and every DOM
//      check still GREEN. That is the finding this run exists for: the page
//      prints cents, so the DOM comparisons resolve to 10^4 raw units and a
//      sub-cent error is invisible to them. Checks 3b/3c/3d/5h/5i were added
//      because of it — they compare the addressable read wei-for-wei.
//        FAIL 3b served 21154687352249 vs own 21154687352250
//        FAIL 3d served gap 743993 vs own 743992
//  R1b +1 USDC on the same sum → 4 red: 3 (page 21,154,687.39 vs own
//      21,154,688.39), 3b, 3d, and 4 (gap card 0.99 vs own −0.01). The gap going
//      red with the Σ is the right coupling — a wrong Σ must not leave it green.
//  R2  check 5 reads the DUST holder's balance while the page is asked for the
//      LARGEST → 7 red: 5a (page 4,176,402.851847 vs own 0) and all five
//      attributed rows plus 5g (4,032,262.45 vs 0.00, …).
//  R3  the dust assertion asks for "2 wei", and the floor line for
//      "less than 0.001%" → 2 red: 6a, 6b.
//  R4  the H1 expectation salted with a word the vault is not called → 1 red.
//  R4b check 7's fixture pointed at 0x…dEaD, which is NOT empty → 2 red: 7a
//      (balanceOf 1000000000000) and 7b (no no-shares line rendered); and
//      check 8's phrase changed → FAIL 8. R4 also showed 7b throwing a locator
//      timeout instead of failing, which ended the run before checks 8-10 — so
//      7b is now count-guarded and a missing line is red, not fatal.
//  R5  the case-study roster temporarily admits a second vault → 2 red: 9a
//      (status 200, not 404) and 9b (the served vault's own page renders).
//  R6  "proportional, not fund-tracing" removed from the page's caveat → FAIL 10.
//  R7  an unwrapped "1,234.56" added inside the receipts scope → 2 red: 11a and
//      11b, each reporting 1 element marked. The tripwire does see this page.
//  R8  the stamp phrase the verifier looks for changed to "Read at height" →
//      FAIL 2, and the run stops rather than checking figures against a block
//      it never established.
//  R9  this script's own reads made 500 blocks BEFORE the block the page states
//      → 8 red (2a, 3, four leg rows, 4). The pinning is load-bearing, and a
//      verifier reading at "now" instead of at the page's block would have been
//      quietly wrong rather than green.
//
// ── PROVED IT CAN FAIL, 2026-09-05 (the widening to any vault) ──────────────
// Seven more breaks, each made alone and reverted, for what the parameterisation
// added. The checks it added are 0a (the sweep tiles its span), 0b/0c (the read
// endpoint honours the pin), 2d (the stamp has not moved under the figure
// reads), 3a (one drawn row per withdraw-queue entry) and 6c/6d (the smallest
// holder's NON-dust reading), plus two SKIP paths — checks 5, 6, 11b when a
// vault has too few holders, and 7b when the zero-balance fixture turns out not
// to be one.
//
//  S1  the sweep's first asked range left out of the recorded intervals →
//      FAIL 0a "0 ranges over 23788334 blocks, 1 logs". The tiling is replayed
//      from the intervals actually asked for, so a range that was never asked
//      cannot be counted as covered.
//  S2  3a's expectation set to `own.legs.length + 1` → FAIL 3a "7 rows vs 7
//      entries in withdrawQueue" on a seven-leg vault. The row count is read,
//      not assumed from the case study's six.
//  S3  the dust branch inverted so the NON-dust assertions ran against a 1-wei
//      holder of the twenty-leg vault → 2 red: 6c (the card does say "Exactly 1
//      wei of shares") and 6d ("less than 0.0001%" vs own 4.142e-23%). Both
//      halves of the branch have now been seen red.
//  S4  check 7's fixture pointed at an address that does hold shares → FAIL 7a
//      (balanceOf 1) and SKIP 7b with that reason, rather than a check about the
//      page that could only fail.
//  S5  0b asked for the page's block plus 100,000 → FAIL 0b after thirty polls.
//      The wait is real, not a formality that would pass whatever it read.
//  S6  the witness read one block EARLIER than the page's → FAIL 0c "witness
//      2561086069783 vs 2561086078435". One block of extrapolated interest is
//      enough to move it, so 0c would see a provider that answered a pinned call
//      with a different block's state.
//  S7  a navigation slipped in between the figure reads and the stamp re-read →
//      FAIL 2d "stated 50905852 vs 50905851".
//
// ── PROVED IT CAN FAIL, 2026-09-05 (what the holder ADDRESS is) ────────────
// Five more breaks, each made alone and reverted, for the checks the page's
// holder-shape line added: 12a (the line agrees with this script's own
// `eth_getCode` at the page's block), 12b (it names the token the script's own
// `asset()` read), 12c (the line's verdict is covered by a receipt), and 13a/13b
// (an address this run found with no code reads as an externally owned account).
//
//  H1  12a's expectation flipped — "has no code" expected of an address whose
//      code this script had just read as 17,615 bytes → FAIL 12a, quoting both
//      the read and the line. 46 green, 1 red.
//  H2  12b's expectation salted to "USDCx" → FAIL 12b on a line that says USDC.
//      The symbol is this script's own `symbol()` read on the address's own
//      `asset()`, so a page naming a token nobody read cannot pass it.
//  H3  the page's <Prov> removed from the shape line, leaving the verdict as
//      plain prose → FAIL 12c "0 covered spans in the line" — and 11a AND 11b
//      STILL GREEN. That is exactly why 12c exists: the dev tripwire only marks
//      an element whose ENTIRE text is a stat token, a sentence is not one, and
//      an uncovered figure inside prose is therefore invisible to it.
//  H4  13's discovery inverted, so the no-code fixture was the largest holder (a
//      contract) → FAIL 13a and SKIP 13b with that reason. A check about the
//      fixture, never a check about the page that could only fail.
//  H5  13b's phrase changed to "has no bytecode at block" → FAIL 13b, quoting
//      the sentence the page actually renders.
//
// Restored: 47/47 green on the case-study vault.
//
// ── PROVED IT CAN FAIL, 2026-09-05 (the catalog becomes the served roster) ──
// The served test moved from a one-vault hand-picked roster to catalog
// membership (lib/morpho-base/vault-case-study.ts), so check 9's fixtures
// changed shape: NOT_SERVED is now the Morpho Blue singleton (never a vault,
// so never in the catalog) rather than a catalogued-but-unserved address —
// under the new rule there is no such thing — and a new check 9c asserts a
// SECOND catalogued vault, other than VAULT, also answers 200. Two breaks,
// each made in lib/morpho-base/vault-case-study.ts, run against the dev
// server directly rather than through this script (a live-reload dev cache
// corruption unrelated to either break interrupted a full run mid-way; the
// two fixture URLs are exactly what checks 9a/9c assert, so curl against the
// same running server is the same assertion this script makes for them).
//
//  C1  isMorphoBaseServedVault patched to also return true for the Blue
//      singleton → GET /base/morpho/vaults/0xbbbb…ffcb 200 (was 404), which is
//      exactly what would fail 9a. Reverted, re-checked: 404 again.
//  C2  isMorphoBaseServedVault patched to return true ONLY for VAULT (the old,
//      one-vault rule) → GET /base/morpho/vaults/0xed0a7a49f2228e01a3169c4a5a
//      72a2ebfe8756dc (a second catalogued vault) 404 (was 200), which is
//      exactly what would fail 9c; VAULT itself stayed 200 throughout.
//      Reverted, re-checked: both 200 again, and the Blue singleton 404.
//
// Full run after both reverts: 48/48 green (47 plus the new 9c).
//
// ── THE ORDERING BUG 2d EXISTS FOR, MEASURED ────────────────────────────────
// The first version of the widening put the holder sweep BETWEEN the stamp read
// and the figure reads. On Gauntlet USDC Prime — 23,098 holders, a ten-minute
// sweep, and figures that move every block — that produced six red checks twice
// in a row about a page that was right: the DOM had been re-rendered in the
// window and matched a read about 25 blocks AFTER the stamp this script was
// still holding. A back-to-back probe (load, then read at the stated block)
// matched 8 times out of 8, which is what proved the reds were the verifier's.
// The sweep now runs first, at its own block, and 2d re-reads the stamp after
// the figures so a page that moves under the run is red rather than a page bug
// invented by the run's own timing.
//
// ── TWO PRESENTATION BUGS THE SAMPLE FOUND, AND THE FIX PROVED, 2026-09-05 ──
// The sweep over six vaults was green on every wei-exact check and still showed
// two wrong pages, because the page's formatting was a cents convention applied
// to every asset. On the dust vault (SageFlow Frontier ETH, 1 wei of WETH, one
// holder) every Supplied cell read "0.00" beside "1 of 7 carry a balance", and
// the sole holder of 100% of the vault read "Shares held 0" beside "100.0%".
// On Seamless WETH the gap card read "0.00" for 154,895,090,822 wei. The DOM
// checks were green because this script restated the same contract.
//
// The rule is now magnitude-keyed: two decimals for a six-decimal asset, six for
// an 18-decimal one, and a non-zero amount that would round to nothing printed
// EXACTLY from its raw units (share counts likewise). This script's mirror uses
// viem's formatUnits for the exact form, not the page's helper.
//
//  P1  the page's exact fallback disabled (round, never fall back) → 7 red on
//      the dust vault: 2a "0.00 vs own 0.000000000000000001", 2b "0 vs own
//      0.000000000000000001", 3, 3-0x5dffff, 5a, 5-0x5dffff, 5g. Restored:
//      42/42 (SageFlow, 1 SKIP for a single holder), 32/32 (Seamless WETH, gap
//      card "0.000000154895090822"), 42/42 (the default case study, unchanged
//      output — a six-decimal asset never reaches the fallback above dust).
//
// ── ONE FIXTURE CORRECTION, MEASURED ────────────────────────────────────────
// The brief named 0x…dEaD as the zero-balance address. It is not: at Base block
// 50,899,806 it holds 1,000,000,000,000 wei of steakUSDC (and still does at
// head). Asserting the no-shares line against it would have been a check that
// could only fail. Check 7 uses 0x…0001 instead, whose balance this script reads
// as zero at the page's own block rather than assuming it.
//
// ── WHAT CHECK 11 CAN AND CANNOT SEE ────────────────────────────────────────
// The dev provenance tripwire (components/shared/prov-coverage-tripwire.tsx)
// renders only when NODE_ENV !== "production", so on a Vercel build there are no
// bookends and no `data-prov-uncovered` can ever appear. Asserting its absence
// there would be green-but-vacuous. So check 11 first looks for the bookends
// (`[data-prov-tripwire]`) and reports SKIP with that reason when they are
// missing, rather than a PASS it did not earn.

import { chromium } from "playwright";
import { createPublicClient, formatUnits, http, parseAbi, keccak256, toBytes } from "viem";
import { base } from "viem/chains";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = process.env.BASE ?? "http://localhost:3022";

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.BASE_RPC_URL) throw new Error("need BASE_RPC_URL in .env.local");
if (!env.BASE_BACKFILL_RPC_URL) throw new Error("need BASE_BACKFILL_RPC_URL in .env.local (the holder sweep)");

/** The case-study vault — the default subject, so a bare run is unchanged. */
const CASE_STUDY = "0xbeefe94c8ad530842bfe7d8b397938ffc1cb83b2";
const arg = (name) =>
  process.argv
    .slice(2)
    .find((a) => a.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
const VAULT = (arg("vault") ?? CASE_STUDY).toLowerCase();
if (!/^0x[0-9a-f]{40}$/.test(VAULT)) throw new Error(`--vault must be a 20-byte address, got "${VAULT}"`);

const BLUE = "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb";
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
/** Read as zero at the page's own block by check 7 — never assumed. */
const NO_SHARES = "0x0000000000000000000000000000000000000001";

// ── the census, parsed out of the generated TS ──────────────────────────────
// The creation block is the floor of the holder sweep and it is history, so the
// catalogue is the right place to take it from — it is not a figure about the
// vault's state. The rows are read out of the generated file rather than
// imported, because this is plain node with no TS loader; the parse asserts it
// read as many rows as the file has, so a formatting change that hides rows from
// the regex is an error and not a quietly shorter roster.
const catalogSrc = fs.readFileSync(path.join(ROOT, "lib/morpho-base/vault-catalog.ts"), "utf8");
const CATALOG = (() => {
  const flat = catalogSrc.match(/const ROWS[^=]*=\s*\[([\s\S]*?)\n\];/)[1].replace(/\s+/g, " ");
  const str = `("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')`;
  const re = new RegExp(`\\[ ?"(0x[0-9a-f]{40})" ?, ?(\\d) ?, ?(\\d+) ?, ?${str} ?, ?${str} ?, ?(\\d+) ?,? ?\\]`, "g");
  const rows = [...flat.matchAll(re)].map((m) => ({
    address: m[1],
    factory: m[2] === "1" ? "v1.1" : "v1.0",
    createdBlock: Number(m[3]),
    name: m[4][0] === '"' ? JSON.parse(m[4]) : m[4].slice(1, -1),
  }));
  const expected = (flat.match(/\[ ?"0x/g) || []).length;
  if (rows.length !== expected) throw new Error(`vault-catalog parse read ${rows.length} of ${expected} rows`);
  return rows;
})();
const catalogued = CATALOG.find((r) => r.address === VAULT);
if (!catalogued)
  throw new Error(`${VAULT} is not in lib/morpho-base/vault-catalog.ts — no creation block to sweep from`);

/** The served test is catalog membership, so check 9's "not served" fixture has
 *  to be an address that is not a vault at all — the Morpho Blue singleton
 *  itself: it has code, answers none of the MetaMorpho methods, and is
 *  asserted below to not be in the catalog, so it is refused for the reason
 *  the catalog exists to test, not one the roster happens not to have caught
 *  up with. */
const NOT_SERVED = BLUE;
if (CATALOG.some((r) => r.address === NOT_SERVED))
  throw new Error(
    `${NOT_SERVED} is meant to be the Blue singleton but is ALSO in the catalog — check 9 has no fixture`,
  );
/** A catalogued vault other than VAULT — proves serving VAULT is not serving
 *  only VAULT. */
const OTHER_SERVED = CATALOG.find((r) => r.address !== VAULT)?.address;
if (!OTHER_SERVED) throw new Error("the catalog has only one vault — check 9 has no second fixture");

const client = createPublicClient({ chain: base, transport: http(env.BASE_RPC_URL, { batch: false, retryCount: 3 }) });
/** A metered endpoint that answers wide log ranges — the sweep, and only the
 *  sweep. Every figure a check compares against still comes from `client`. */
const sweepClient = createPublicClient({
  chain: base,
  transport: http(env.BASE_BACKFILL_RPC_URL, { batch: false, retryCount: 2 }),
});

const VAULT_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function asset() view returns (address)",
  "function totalAssets() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function withdrawQueueLength() view returns (uint256)",
  "function withdrawQueue(uint256) view returns (bytes32)",
  "function balanceOf(address) view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
]);
const BLUE_ABI = parseAbi([
  "function idToMarketParams(bytes32) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)",
  "function market(bytes32) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)",
  "function position(bytes32, address) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)",
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

// The page's own formatting contract, restated here rather than imported: an
// amount of the asset at two decimal places for a six-decimal asset and six for
// an 18-decimal one, en-US — and a non-zero amount that would round to nothing
// printed EXACTLY from its raw units. The exact form here is viem's own
// formatUnits, not the page's helper, so the two are independent renderings of
// the same wei.
const assetText = (raw, decimals) => {
  const text = (Number(raw) / Math.pow(10, decimals)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals <= 6 ? 2 : 6,
  });
  return raw !== BigInt(0) && parseFloat(text.replace(/,/g, "")) === 0 ? formatUnits(raw, decimals) : text;
};
// A share count: six decimals, the same exact fallback.
const sharesText = (raw, decimals) => {
  const text = (Number(raw) / Math.pow(10, decimals)).toLocaleString("en-US", { maximumFractionDigits: 6 });
  return raw !== BigInt(0) && parseFloat(text.replace(/,/g, "")) === 0 ? formatUnits(raw, decimals) : text;
};

const read = (fn, args, blockNumber) =>
  client.readContract({ address: VAULT, abi: VAULT_ABI, functionName: fn, args, blockNumber });

/** Wait until the read endpoint's own head has reached `target`. Cheap, and it
 *  removes the one race between a page that read at the head and a verifier that
 *  re-reads it: a node a block or two behind can answer a pinned call with its
 *  own state instead of an error. */
async function awaitBlock(target) {
  for (let i = 0; i < 30; i++) {
    if ((await client.getBlockNumber({ cacheTime: 0 })) >= target) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

// ── discovering this vault's holders, at the block the page states ──────────
const TRANSFER_TOPIC = keccak256(toBytes("Transfer(address,address,uint256)"));
const hex = (n) => `0x${n.toString(16)}`;
const fromTopic = (t) => `0x${t.slice(26)}`.toLowerCase();
/** A chunk that comes back at a round page size is the SHAPE of a truncation,
 *  not evidence of completeness. Anything at or above this is re-asked halved. */
const LOG_PAGE_GUARD = 9999;

/** Every address that has sent or received this vault's shares between the two
 *  blocks, with the ranges actually asked for so check 0a can replay them. */
async function sweepCandidates(fromBlock, toBlock) {
  const seen = new Set();
  const asked = [];
  let cursor = fromBlock;
  let span = toBlock - fromBlock + BigInt(1);
  let logs = 0;
  while (cursor <= toBlock) {
    const end = cursor + span - BigInt(1) > toBlock ? toBlock : cursor + span - BigInt(1);
    let out;
    try {
      out = await sweepClient.request({
        method: "eth_getLogs",
        params: [{ address: VAULT, topics: [TRANSFER_TOPIC], fromBlock: hex(cursor), toBlock: hex(end) }],
      });
    } catch (error) {
      // "too many results" and its cousins: halve and re-ask. A single block
      // that still errors is a real failure and must not be stepped over.
      if (span === BigInt(1)) throw error;
      span = span / BigInt(2);
      continue;
    }
    if (out.length >= LOG_PAGE_GUARD && span > BigInt(1)) {
      span = span / BigInt(2);
      continue;
    }
    for (const log of out) {
      const at = BigInt(log.blockNumber);
      if (at < cursor || at > end) throw new Error(`sweep: a log at block ${at} came back for [${cursor}, ${end}]`);
      if (log.address.toLowerCase() !== VAULT) throw new Error(`sweep: a log from ${log.address}, not ${VAULT}`);
      seen.add(fromTopic(log.topics[1]));
      seen.add(fromTopic(log.topics[2]));
    }
    logs += out.length;
    asked.push([cursor, end]);
    cursor = end + BigInt(1);
    // Widen again after a quiet stretch, so an early dense era does not hold the
    // whole sweep at one block per call.
    if (out.length < 2000) span = span * BigInt(2);
  }
  return { candidates: [...seen], asked, logs };
}

/** True when the ranges asked for tile [from, to] exactly — no hole, no overlap.
 *  Replayed from the recorded intervals rather than from a running total, so a
 *  chunk that was never asked for cannot be counted as covered. */
function tiles(asked, fromBlock, toBlock) {
  let at = fromBlock;
  for (const [a, b] of asked) {
    if (a !== at) return false;
    at = b + BigInt(1);
  }
  return at === toBlock + BigInt(1);
}

/** `balanceOf` for every candidate at one block, through Multicall3, keeping the
 *  ones that still hold something — largest first. */
async function holdersAt(candidates, blockNumber) {
  const held = [];
  for (let i = 0; i < candidates.length; i += 500) {
    const batch = candidates.slice(i, i + 500);
    const balances = await sweepClient.multicall({
      contracts: batch.map((address) => ({
        address: VAULT,
        abi: VAULT_ABI,
        functionName: "balanceOf",
        args: [address],
      })),
      allowFailure: false,
      blockNumber,
      multicallAddress: MULTICALL3,
      batchSize: 0,
    });
    balances.forEach((shares, j) => {
      if (shares > BigInt(0)) held.push({ address: batch[j], shares });
    });
  }
  return held.sort((a, b) => (a.shares < b.shares ? 1 : a.shares > b.shares ? -1 : 0));
}

/** Everything this script needs about the vault at one block, read independently. */
async function readVaultAt(blockNumber) {
  const [name, symbol, decimals, asset, totalAssets, totalSupply, queueLength] = await Promise.all([
    read("name", [], blockNumber),
    read("symbol", [], blockNumber),
    read("decimals", [], blockNumber),
    read("asset", [], blockNumber),
    read("totalAssets", [], blockNumber),
    read("totalSupply", [], blockNumber),
    read("withdrawQueueLength", [], blockNumber),
  ]);
  const assetDecimals = await client.readContract({
    address: asset,
    abi: parseAbi(["function decimals() view returns (uint8)"]),
    functionName: "decimals",
    blockNumber,
  });
  const ids = [];
  for (let i = 0; i < Number(queueLength); i++) ids.push(await read("withdrawQueue", [BigInt(i)], blockNumber));
  const legs = [];
  for (const id of ids) {
    const [m, p] = await Promise.all([
      client.readContract({ address: BLUE, abi: BLUE_ABI, functionName: "market", args: [id], blockNumber }),
      client.readContract({ address: BLUE, abi: BLUE_ABI, functionName: "position", args: [id, VAULT], blockNumber }),
    ]);
    const assets = m[1] === BigInt(0) ? BigInt(0) : (p[0] * m[0]) / m[1];
    legs.push({ id, assets });
  }
  const allocated = legs.reduce((s, l) => s + l.assets, BigInt(0));
  return {
    name,
    symbol,
    decimals: Number(decimals),
    assetDecimals: Number(assetDecimals),
    totalAssets,
    totalSupply,
    legs,
    allocated,
    gap: totalAssets - allocated,
  };
}

// ── 0: the holder fixtures, discovered BEFORE the page is opened ────────────
// The order is load-bearing, and it was got wrong once: with the sweep BETWEEN
// the stamp and the figure reads, the DOM was read minutes after the stamp was,
// and a dev page that re-renders in that window is compared against a block it
// no longer states. On Gauntlet USDC Prime — the busiest vault in the sample,
// where the figures move every block — that showed as six red checks about a
// page that was right (measured: the DOM matched a read ~25 blocks AFTER the
// stamp this script had captured). So the sweep runs first, at its own block,
// and the page is opened only once there is nothing left to do but read it.
//
// The fixtures do not need the page's block: they are addresses, and every
// balance a check states is re-read at whatever block the page turns out to
// name. This block is only where "holds a non-zero balance" was decided.
const sweepAt = await client.getBlockNumber();
const witness = await read("totalAssets", [], sweepAt);
const sweepFrom = BigInt(catalogued.createdBlock);
const { candidates, asked, logs } = await sweepCandidates(sweepFrom, sweepAt);
check(
  "0a the Transfer sweep tiles creation → the sweep block with no hole",
  tiles(asked, sweepFrom, sweepAt),
  `${asked.length} ranges over ${(sweepAt - sweepFrom + BigInt(1)).toString()} blocks, ${logs} logs`,
);
// A PINNED READ IS A FUNCTION OF ITS BLOCK. A load-balanced endpoint can route a
// call to a node that does not have the block and answer with its own state
// instead of erroring, and then every comparison below is against the wrong
// moment for a reason that has nothing to do with the page. So one figure is
// read before the sweep and re-read after it, minutes later, at the same block.
check(
  "0c the pinned read held: totalAssets at one block answers the same after the sweep",
  (await read("totalAssets", [], sweepAt)) === witness,
  `witness ${witness} at block ${sweepAt}`,
);
const holders = await holdersAt(candidates, sweepAt);
console.log(`· ${candidates.length} addresses have touched the shares; ${holders.length} hold a non-zero balance`);
const LARGEST = holders[0]?.address ?? null;
const DUST = holders.length > 1 ? holders[holders.length - 1].address : null;

// ── an address with NO code, discovered rather than fixtured ────────────────
// The page states what the holder address is from its own `eth_getCode`, and the
// "no code" branch needs a holder that genuinely has none. Which addresses those
// are is a fact about this vault at this block, so it is read here: the holders
// already found, largest first, until one comes back empty. Capped, because the
// check needs ONE and each candidate costs a call — on a vault whose holders are
// all contracts the check reports SKIP with the cap it searched, not a PASS.
const EOA_SCAN = 80;
let EOA_HOLDER = null;
for (const h of holders.slice(0, EOA_SCAN)) {
  const code = await client.getCode({ address: h.address, blockNumber: sweepAt });
  if (!code || code === "0x") {
    EOA_HOLDER = h.address;
    break;
  }
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

const href = (holder) => `${BASE}/base/morpho/vaults/${VAULT}${holder ? `?holder=${encodeURIComponent(holder)}` : ""}`;

const figure = async (name) => (await page.locator(`[data-figure="${name}"] > div`).nth(1).textContent())?.trim();

/** The holder-shape sentence as a reader sees it, or a stated absence. Count-
 *  guarded: a line the page never drew is a red check, never a locator timeout. */
const shapeLine = async () => {
  const loc = page.locator('[data-figure="holder-shape"]');
  return (await loc.count()) ? (await loc.innerText()).replace(/\s+/g, " ").trim() : "(no shape line rendered)";
};
/** The two accessors check 12 reads on the HOLDER address — this script's own
 *  reads, so the expectation never comes from the page. */
const HOLDER_ABI = parseAbi(["function asset() view returns (address)", "function symbol() view returns (string)"]);
const tryRead = async (address, functionName, blockNumber) => {
  try {
    return await client.readContract({ address, abi: HOLDER_ABI, functionName, blockNumber });
  } catch {
    return null;
  }
};

/** The block the page STATES, from the stamp a reader sees — check 2's subject. */
async function statedBlock() {
  const text = (await page.locator('[data-skel-section="page-header"]').innerText()).replace(/\s+/g, " ");
  const m = text.match(/Read at block ([\d,]+)/);
  return m ? BigInt(m[1].replace(/,/g, "")) : null;
}

// ── 1–4: the vault, at the block it says ────────────────────────────────────
await page.goto(href(), { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-figure="total-assets"]');

const block = await statedBlock();
check(
  "2  the page states the block it was read at",
  block != null,
  block == null ? "no stamp found" : `block ${block}`,
);
if (block == null) {
  await browser.close();
  process.exit(1);
}
const reached = await awaitBlock(block);
check("0b the read endpoint has reached the block the page states", reached, `block ${block}`);
const own = await readVaultAt(block);
console.log(
  `\n· ${VAULT} — ${catalogued.factory}, created at block ${catalogued.createdBlock}, ` +
    `asset decimals ${own.assetDecimals}, ${own.legs.length} legs in the withdraw queue`,
);

const h1 = (await page.locator("h1").first().innerText()).replace(/\s+/g, " ").trim();
check("1  the H1 is the vault's own name() at that block", h1.startsWith(own.name), `"${h1}" vs name() "${own.name}"`);

const pageTotal = await figure("total-assets");
check(
  "2a totalAssets on the page re-reads at that block",
  pageTotal === assetText(own.totalAssets, own.assetDecimals),
  `${pageTotal} vs own ${assetText(own.totalAssets, own.assetDecimals)}`,
);
const pageSupply = await figure("total-shares");
check(
  "2b totalSupply on the page re-reads at that block",
  pageSupply === sharesText(own.totalSupply, own.decimals),
  `${pageSupply} vs own ${sharesText(own.totalSupply, own.decimals)}`,
);
const pagePrice = await figure("share-price");
const ownPrice = await read("convertToAssets", [BigInt(10) ** BigInt(own.decimals)], block);
check(
  "2c the share price on the page re-reads at that block",
  pagePrice ===
    (Number(ownPrice) / 10 ** own.assetDecimals).toLocaleString("en-US", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 6,
    }),
  `${pagePrice}`,
);

const pageAllocated = await figure("allocated");
check(
  "3  Σ legs on the page equals this script's own Σ over position/market",
  pageAllocated === assetText(own.allocated, own.assetDecimals),
  `page ${pageAllocated} vs own ${assetText(own.allocated, own.assetDecimals)}`,
);
// The queue is however long this vault's queue is — one leg, six, twenty, none.
// A page that drew a different number of rows would still sum correctly if the
// missing leg were empty, so the count is its own check.
const legRows = await page.locator("[data-leg]").count();
check(
  "3a the allocation table draws one row per withdraw-queue entry",
  legRows === own.legs.length,
  `${legRows} rows vs ${own.legs.length} entries in withdrawQueue`,
);
// Per leg too, so a compensating pair of errors cannot sum to the right total.
// Count-guarded: a row this script's own read expects and the page never drew is
// a red check, not a locator timeout that ends the run early.
for (const leg of own.legs) {
  const cellLoc = page.locator(`[data-leg="${leg.id}"] [data-cell="leg-assets"]`);
  const cell = (await cellLoc.count()) ? ((await cellLoc.textContent()) ?? "").trim() : "(no row for this leg)";
  check(
    `3-${leg.id.slice(0, 8)} the leg's supplied figure equals this script's own read`,
    cell === assetText(leg.assets, own.assetDecimals),
    `${cell} vs ${assetText(leg.assets, own.assetDecimals)}`,
  );
}

// The page prints cents, so the DOM checks above resolve to one cent (10^4 raw
// units) and cannot see an error smaller than that — measured: +1 raw unit in
// this script's own Σ left every DOM check green. The addressable read behind
// the page is therefore checked at FULL precision too, against this script's own
// raw sum at the block that read states.
{
  const r = await fetch(`${BASE}/api/chain/morpho-base/vault?vault=${VAULT}`);
  const j = await r.json();
  const raw = await readVaultAt(BigInt(j.blockNumber));
  check(
    "3b the served read's Σ legs is wei-exact against this script's own",
    j.allocated.raw === raw.allocated.toString(),
    `served ${j.allocated.raw} vs own ${raw.allocated}`,
  );
  check(
    "3c every leg of the served read is wei-exact against this script's own",
    j.legs.length === raw.legs.length && j.legs.every((l, i) => l.assets.raw === raw.legs[i].assets.toString()),
    j.legs.map((l, i) => `${l.assets.raw}/${raw.legs[i]?.assets}`).join(" "),
  );
  check(
    "3d the served read's gap is wei-exact against totalAssets − Σ legs",
    j.gap.raw === raw.gap.toString(),
    `served ${j.gap.raw} vs own ${raw.gap}`,
  );
}

const pageGap = await figure("gap");
check(
  "4  the gap card equals totalAssets − Σ legs",
  pageGap === assetText(own.gap, own.assetDecimals),
  `page ${pageGap} vs own ${assetText(own.gap, own.assetDecimals)}`,
);
// The figures above were compared against a read pinned to the stamp captured
// before them. If the page re-rendered in between — a dev refresh, a navigation
// this script did not make — those figures belong to a later block and every
// comparison above was about the wrong moment. The stamp is therefore re-read
// after the figures, and it must still say the same block.
check(
  "2d the stamp still names the same block after the figures were read",
  (await statedBlock()) === block,
  `stated ${await statedBlock()} vs ${block}`,
);

// ── 11a: the dev tripwire, at rest ──────────────────────────────────────────
const armed = (await page.locator("[data-prov-tripwire]").count()) > 0;
if (!armed) skip("11a no uncovered figure at rest", "the dev prov tripwire is not mounted (production build)");
else {
  await page.waitForTimeout(1200);
  const uncovered = await page.locator("[data-prov-uncovered]").count();
  check("11a no uncovered figure at rest", uncovered === 0, `${uncovered} marked`);
}

// ── 5: the largest holder ───────────────────────────────────────────────────
// An empty vault has none, and there is nothing here to be right or wrong about.
if (LARGEST == null) {
  skip("5  the largest holder's attributed exposure", "no address holds a non-zero balance at this block");
} else {
  await page.goto(href(LARGEST), { waitUntil: "domcontentloaded" });
  await page.locator('[data-skel-section="vault-exposure"] [data-figure="holder-shares"]').first().waitFor();
  const hBlock = await statedBlock();
  const hOwn = await readVaultAt(hBlock);
  const hShares = await read("balanceOf", [LARGEST], hBlock);

  const pageShares = await figure("holder-shares");
  check(
    "5a the shares stated equal balanceOf at the page's block",
    pageShares === sharesText(hShares, hOwn.decimals),
    `page ${pageShares} vs own ${sharesText(hShares, hOwn.decimals)}`,
  );
  for (const leg of hOwn.legs) {
    const expected = (hShares * leg.assets) / hOwn.totalSupply;
    const cellLoc = page.locator(`[data-exposure-leg="${leg.id}"] [data-cell="attributed"]`);
    const cell = (await cellLoc.count()) ? ((await cellLoc.textContent()) ?? "").trim() : "(no row for this leg)";
    check(
      `5-${leg.id.slice(0, 8)} attributed = floor(shares × leg ÷ totalSupply)`,
      cell === assetText(expected, hOwn.assetDecimals),
      `${cell} vs ${assetText(expected, hOwn.assetDecimals)}`,
    );
  }
  const attributedTotal = hOwn.legs.reduce((s, l) => s + (hShares * l.assets) / hOwn.totalSupply, BigInt(0));
  const pageAttrTotal = (await page.locator('[data-figure="attributed-total"]').textContent())?.trim();
  check(
    "5g the attributed total is the Σ of the rows, recomputed here",
    pageAttrTotal === assetText(attributedTotal, hOwn.assetDecimals),
    `${pageAttrTotal} vs ${assetText(attributedTotal, hOwn.assetDecimals)}`,
  );

  // ── 12: what the page says this address IS ────────────────────────────────
  // The page reads the holder's own code and states the shape it found. The
  // expectation is this script's OWN `eth_getCode` at the block the page names —
  // the one thing that can contradict the sentence — and the two directions are
  // asserted against each other, so a page printing both forms is not green on a
  // test that only looks for one.
  const lShape = await shapeLine();
  const lCode = await client.getCode({ address: LARGEST, blockNumber: hBlock });
  const hasCode = Boolean(lCode && lCode !== "0x");
  const saysContract = /is a (contract|Safe|proxy to)/.test(lShape);
  const saysNoCode = lShape.includes("has no code");
  check(
    "12a the shape line agrees with this script's own eth_getCode at the page's block",
    hasCode ? saysContract && !saysNoCode : saysNoCode && !saysContract,
    `own code ${hasCode ? `${(lCode.length - 2) / 2} bytes` : "empty"} — "${lShape}"`,
  );
  // And when the address answers ERC-4626's `asset()`, the sentence must name
  // the token this script read there — by the symbol the token itself answers,
  // or as this vault's own shares when the asset IS this vault.
  const lAsset = (await tryRead(LARGEST, "asset", hBlock))?.toLowerCase() ?? null;
  if (!lAsset)
    skip("12b the shape line names the asset this script's own asset() read", "the address answers no asset()");
  else if (lAsset === VAULT)
    check(
      "12b the shape line names the asset this script's own asset() read",
      lShape.includes("this vault's own shares"),
      `asset() ${lAsset} is this vault — "${lShape}"`,
    );
  else {
    const lAssetSymbol = await tryRead(lAsset, "symbol", hBlock);
    if (!lAssetSymbol)
      skip("12b the shape line names the asset this script's own asset() read", `${lAsset} answers no symbol()`);
    else
      check(
        "12b the shape line names the asset this script's own asset() read",
        lShape.includes(lAssetSymbol),
        `asset() ${lAsset} symbol() "${lAssetSymbol}" — "${lShape}"`,
      );
  }
  // The sentence's block-bearing clause is a traced figure, so it must sit
  // INSIDE the receipts scope — which is what 11a/11b's tripwire count rests on
  // (an uncovered value is only counted where the scope reaches). Dev-only: the
  // coverage stamp is not rendered in a production build.
  if (!armed) skip("12c the shape line's verdict is covered by a receipt", "the dev prov tripwire is not mounted");
  else {
    const covered = await page.locator('[data-figure="holder-shape"] [data-prov-covered]').count();
    check(
      "12c the shape line's verdict is covered by a receipt",
      covered === 1,
      `${covered} covered spans in the line`,
    );
  }

  // Wei-exact again, for the attribution itself.
  {
    const r = await fetch(`${BASE}/api/chain/morpho-base/vault?vault=${VAULT}&holder=${LARGEST}`);
    const j = await r.json();
    const raw = await readVaultAt(BigInt(j.blockNumber));
    const shares = await read("balanceOf", [LARGEST], BigInt(j.blockNumber));
    check(
      "5h the served shares are wei-exact against balanceOf",
      j.holder.shares.raw === shares.toString(),
      `served ${j.holder.shares.raw} vs own ${shares}`,
    );
    check(
      "5i every attributed leg of the served read is wei-exact",
      j.legs.length === raw.legs.length &&
        raw.totalSupply > BigInt(0) &&
        j.legs.every((l, i) => l.attributed.raw === ((shares * raw.legs[i].assets) / raw.totalSupply).toString()),
      j.legs
        .map((l, i) => `${l.attributed.raw}/${raw.legs[i] && (shares * raw.legs[i].assets) / raw.totalSupply}`)
        .join(" "),
    );
  }
}

// ── 11b: the dev tripwire, with a holder ────────────────────────────────────
if (!armed) skip("11b no uncovered figure with a holder", "the dev prov tripwire is not mounted (production build)");
else if (LARGEST == null)
  skip("11b no uncovered figure with a holder", "no holder to draw an exposure section for at this block");
else {
  await page.waitForTimeout(1200);
  const uncovered = await page.locator("[data-prov-uncovered]").count();
  check("11b no uncovered figure with a holder", uncovered === 0, `${uncovered} marked`);
}

// ── 13: a holder with no code ───────────────────────────────────────────────
// The other half of the shape branch, on an address this run found for itself.
// Both halves matter: a page that printed "is a contract" for everything would
// be green on check 12a alone wherever the largest holder happens to be one.
if (EOA_HOLDER == null) {
  skip(
    "13 a holder with no code reads as an externally owned account",
    `none of the largest ${Math.min(EOA_SCAN, holders.length)} holders has empty code at block ${sweepAt}`,
  );
} else {
  await page.goto(href(EOA_HOLDER), { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-skel-section="vault-exposure"]');
  const eBlock = await statedBlock();
  const eCode = await client.getCode({ address: EOA_HOLDER, blockNumber: eBlock });
  const eEmpty = !eCode || eCode === "0x";
  const eLine = await shapeLine();
  check("13a the fixture still has no code at the page's own block", eEmpty, `${EOA_HOLDER} at block ${eBlock}`);
  if (!eEmpty)
    // Code was deployed to it between the sweep and this read. Asserting the
    // no-code line now would be a check about the fixture that could only fail.
    skip("13b the page states no code, naming the block", `the address has code at block ${eBlock}`);
  else
    check(
      "13b the page states no code, naming the block",
      eLine.includes("has no code at block") &&
        eLine.includes(Number(eBlock).toLocaleString("en-US")) &&
        eLine.includes("externally owned account"),
      eLine,
    );
}

// ── 6: the smallest holder ──────────────────────────────────────────────────
// WHICH READING IS RIGHT IS THIS SCRIPT'S OWN ARITHMETIC, not the page's. The
// page prints an exact wei count and a "less than 0.0001%" floor only below one
// part in a million (the loader's `dust` flag); above it, a percentage at four
// significant figures. On a vault with two holders the smallest can be either,
// so the branch is chosen from balanceOf ÷ totalSupply read here, and the OTHER
// branch's text is asserted absent — a page that printed both would be green on
// a test that only looked for one.
if (DUST == null) {
  skip("6  the smallest holder's reading", `fewer than two holders hold a non-zero balance (${holders.length})`);
} else {
  await page.goto(href(DUST), { waitUntil: "domcontentloaded" });
  // SCOPED TO THE EXPOSURE SECTION. `?holder=` lands on the position page, and
  // that page draws the listing's own position card above this view — the card
  // carries the same figure names, so an unscoped `[data-figure="holder-…"]`
  // matches twice on any address the census has a row for.
  const exposure = page.locator('[data-skel-section="vault-exposure"]');
  await exposure.locator('[data-figure="holder-shares"]').first().waitFor();
  const dBlock = await statedBlock();
  const dOwn = await readVaultAt(dBlock);
  const dShares = await read("balanceOf", [DUST], dBlock);
  const dFraction = dOwn.totalSupply === BigInt(0) ? 0 : Number(dShares) / Number(dOwn.totalSupply);
  const dText = (await exposure.locator('[data-figure="holder-shares"]').innerText()).replace(/\s+/g, " ");
  const dPct = (await exposure.locator('[data-figure="holder-fraction"]').innerText()).replace(/\s+/g, " ");
  if (dFraction < 1e-6) {
    check(
      "6a the page states the exact share count in wei",
      dShares > BigInt(0) && dText.includes(`Exactly ${dShares.toString()} wei of shares`),
      `balanceOf ${dShares}, fraction ${dFraction}, card reads "${dText}"`,
    );
    check("6b the share of the vault reads as a floor, not a zero", dPct.includes("less than 0.0001%"), dPct);
  } else {
    check(
      "6c the share count is stated, not floored to an exact-wei sentence",
      dText.includes(sharesText(dShares, dOwn.decimals)) && !dText.includes("wei of shares"),
      `balanceOf ${dShares}, fraction ${dFraction}, card reads "${dText}"`,
    );
    check(
      "6d the share of the vault is a percentage, not the dust floor",
      dPct.includes(`${(dFraction * 100).toPrecision(4)}%`) && !dPct.includes("less than 0.0001%"),
      `${dPct} vs own ${(dFraction * 100).toPrecision(4)}%`,
    );
  }
}

// ── 7: an address with no shares ────────────────────────────────────────────
await page.goto(href(NO_SHARES), { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-skel-section="vault-exposure"]');
const zBlock = await statedBlock();
const zShares = await read("balanceOf", [NO_SHARES], zBlock);
check("7a the fixture really holds nothing at the page's block", zShares === BigInt(0), `balanceOf ${zShares}`);
// Guarded by a count: a MISSING line must be a red check, not a locator timeout
// that ends the run before checks 8 to 10 are reached.
const zLine = page.locator('[data-figure="no-shares"]');
const zText = (await zLine.count()) ? (await zLine.innerText()).replace(/\s+/g, " ") : "(no no-shares line rendered)";
if (zShares > BigInt(0)) {
  // 7a has already reported the fixture; asserting the line here would be a
  // check that could only fail, about the fixture rather than about the page.
  skip("7b the page states the no-shares line, naming the block", `the fixture holds ${zShares} at this block`);
} else {
  check(
    "7b the page states the no-shares line, naming the block",
    zText.includes("holds no shares of this vault at block") && zText.includes(Number(zBlock).toLocaleString("en-US")),
    zText,
  );
}

// ── 8: an input that is neither form ────────────────────────────────────────
// ── 2026-09-08 · THE READING MOVED TO THE POSITION PATH ───────────────────
// `?holder=` on the market view is a native GET form's landing place and 307s
// to `/base/morpho/vaults/<vault>/<what was typed>` (rails-ops plan D11: a position
// has a path, and the address is passed on AS TYPED so a name is resolved by
// the page that reads it). The unusable input is therefore stated THERE, in
// `[data-lookup-error="invalid"]`, rather than inside the market view's lookup
// block — which is why waiting on `[data-skel-section="vault-lookup"]` here
// timed out. Same assertion, same reading, at the selector it moved to; the
// accepted forms are three now (a Basename joined them), so the check names
// each one it must find rather than counting them.
//     FAIL 8 (as a timeout, which is why it is written with a count guard now)
//       — page.waitForSelector: Timeout 30000ms exceeded waiting for
//         locator('[data-skel-section="vault-lookup"]') to be visible
await page.goto(href("nope"), { waitUntil: "domcontentloaded" });
const invalidLoc = page.locator('[data-lookup-error="invalid"]');
const invalid = (await invalidLoc.count()) ? (await invalidLoc.innerText()).replace(/\s+/g, " ") : "(no reading drawn)";
check(
  "8  an unusable input states the accepted forms",
  invalid.includes("none of the accepted forms") &&
    invalid.includes("0x") &&
    invalid.includes(".eth") &&
    invalid.includes(".base.eth"),
  invalid.slice(0, 160),
);
check(
  "8b it does not render an exposure section for an input it could not use",
  (await page.locator('[data-skel-section="vault-exposure"]').count()) === 0,
);

// ── 9: an address outside the catalog, and a catalogued vault besides VAULT ─
const res = await page.goto(`${BASE}/base/morpho/vaults/${NOT_SERVED}`, { waitUntil: "networkidle" });
check("9a an address outside the catalog answers 404", res?.status() === 404, `status ${res?.status()}`);
// A `notFound()` thrown from a page ships its body in the FLIGHT payload, not in
// the HTML (see components/shared/route-not-found.tsx) — so the words appear only
// once the browser has drawn them. Reading at domcontentloaded read an empty
// body and made check 9b red for a reason that had nothing to do with the page.
await page.waitForTimeout(2000);
const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
check(
  "9b the not-found body renders, naming what is missing",
  body.includes("No vault exposure page for this address"),
  body.slice(0, 160),
);
// Serving VAULT does not mean serving only VAULT: a second catalogued vault,
// parsed from the same catalog rather than fixtured, must answer 200 too.
const res9c = await page.goto(`${BASE}/base/morpho/vaults/${OTHER_SERVED}`, { waitUntil: "domcontentloaded" });
check(
  "9c a catalogued vault other than the one under test also answers 200",
  res9c?.status() === 200,
  `${OTHER_SERVED} status ${res9c?.status()}`,
);

// ── 10: the caveat ──────────────────────────────────────────────────────────
// It rides with the exposure section, so it is read on a page that has one: the
// largest holder where there is one, and the no-shares reading where there is
// not — the caveat must be there either way.
await page.goto(href(LARGEST ?? NO_SHARES), { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-skel-section="vault-caveat"]');
const caveat = (await page.locator('[data-skel-section="vault-caveat"]').innerText()).replace(/\s+/g, " ");
check(
  "10 the attribution caveat is on the page with the exposure",
  caveat.includes("proportional, not fund-tracing") &&
    caveat.includes("equal shares carry equal figures") &&
    caveat.includes("not an identified person"),
  caveat.slice(0, 200),
);

await browser.close();
console.log(
  `\n${VAULT} "${own.name}" · ${passes} passed · ${failures} failed · ${skipped} skipped` +
    `\n${failures === 0 ? "ALL CHECKS PASS" : `${failures} FAILED`}${skipped ? ` · ${skipped} skipped` : ""}`,
);
process.exit(failures > 0 ? 1 : 0);
