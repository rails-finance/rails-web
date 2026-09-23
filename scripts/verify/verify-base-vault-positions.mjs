#!/usr/bin/env node
// The vault POSITION listing on Base, checked against the chain rather than
// against itself. /base/morpho/vaults/positions — the Vaults tab's listing.
// ----------------------------------------------------------------------------
// EVERY EXPECTED FIGURE HERE IS THIS SCRIPT'S OWN CHAIN READ. The listing states
// two blocks — the census block its membership was swept to, and the block its
// live overlay was read at. This script then makes its OWN whole-`Transfer`
// sweep of a small vault FROM THAT VAULT'S OWN CREATION BLOCK to the census
// block, builds its OWN participant set, proves that set whole with its OWN
// Σ `balanceOf` == `totalSupply()`, and asserts the route's rows for that vault
// are EXACTLY it. It makes its OWN `balanceOf`, `convertToAssets` and
// `totalSupply` at the overlay's block and asserts every figure on the first
// page against them, in raw units from the route AND in formatted text from the
// rendered DOM. The only things taken from the page are the two blocks, which
// are check L0's own subject.
//
// ⚠️ FROM THE VAULT'S OWN CREATION BLOCK, NOT FROM A FIXED FLOOR. On Base six
// million blocks is 139 days, so a fixed window would cut a life in half and
// this script's "own" participant set would be a different, smaller set than
// the census's — which would read as a route bug. The creation block comes from
// this script's own parse of lib/morpho-base/vault-catalog.ts.
//
// AN EXPECTATION NEVER COMES FROM THE THING UNDER TEST. Membership is not
// compared against the backend's own count: it is compared against a set this
// script swept. The facet partitions are compared against each other and
// against the chain total, so a filter that quietly drops rows cannot pass. The
// fixtures below are INPUTS — which vault, which shape of life — never expected
// figures; the closed address and the absent address are both DERIVED from this
// script's own sweep rather than pasted.
//
// ⚠️ A FIXTURE THAT HAS CHANGED STATE IS A FAILURE, NEVER A SKIP — with ONE
// exception, stated out loud. The Base census tick is refilling as this is
// written and answers 5 of the 509 catalogued vaults, so a check whose fixture
// the census does not yet KNOW cannot be exercised at all. Those SKIP naming
// exactly that, and say which vault. A fixture the census knows and that has
// MOVED is still a failure.
//
// WEI-EXACT, FROM THE PROXY ROUTE; FORMATTED, FROM THE RENDERED DOM. Section L2
// reads raw units out of /api/vaults/positions and compares them to this
// script's own reads; it then reads the SAME figures off the DOM through this
// script's own copy of the section's print rules, so a card that renders a
// different number from the one it was handed goes red. The DOM is read with a
// browser, never the RSC payload (memory `vaults-section-build`: an RSC payload
// makes a body-text check vacuous).
//
// Run:
//   BASE=http://localhost:3801 node scripts/verify/verify-base-vault-positions.mjs
// Needs BASE_RPC_URL (the `eth_call` lane) and BASE_BACKFILL_RPC_URL (the only
// Base lane that answers a whole-life `eth_getLogs`) in .env.local — read,
// never printed; the lanes are named here by env var NAME only.
//
// ── WHAT EACH SECTION ASSERTS ────────────────────────────────────────────────
//   L0  the listing answers 200, its INITIAL HTML (not the RSC payload) carries
//       a full page of [data-position-card] rows with no rendered skeleton
//       standing in their place, and the route's overlay block is within 200
//       blocks of this script's own head (Base runs at 2s/block)
//   L1  membership is the chain's: this script's own whole-Transfer sweep of
//       F-B6 from that vault's own creation block to the census block, its own
//       participant set and its own wei-exact Σ balanceOf == totalSupply,
//       asserted to be EXACTLY the route's F-B6 rows — no more, no fewer —
//       with live / transferCount / firstBlock / lastBlock each matching this
//       script's own count
//   L2  the overlay is live: every card's shares, claim and totalSupply equal
//       this script's own reads at the route's own block, wei-exact; and the
//       DOM prints those same figures through the section's own print rules
//   L3  the facets partition: live + closed == unfiltered per vault, Σ shape ==
//       the chain total, Σ census participants == the chain total, and the
//       VAULT MENU offers every census row with a participant and not one with
//       none
//   L4  sorts: shares desc is descending by RAW balance (which is what the
//       backend orders and what the page says it orders), lastActivity desc is
//       descending by last block, and the DOM's order is the API's order
//   L5  the closed card: a DERIVED address whose balance this script reads as
//       zero draws no Shares and no Claim figure, carries the CLOSED pill, and
//       states "Closed by" at this script's own last log block
//   L6  each never-held vault is STATED on the roster page as "no holder yet"
//       and contributes no row
//   L7  an address this script's own sweep proves is not in F-B6's set answers
//       zero rows; a second identical request answers zero again and the
//       chain-wide total is unchanged — nothing was inserted by a search
//   L8  one holder, one card per vault it holds, each linking to that pair's
//       own position page
//   L9  copy: no "you"/"your", no "depositor", no USD, no APY and no rate of
//       return, no curator and no app named INSIDE a position card, and every
//       date in the en-GB UTC form
//  L10  the census line on the listing states every census block the route
//       returned, in its "census at …" slot
//  L11  SSR: the filtered URL ?vault=<F-B6> carries that vault's rows in the
//       INITIAL HTML
//  L12  links: the roster page, the market view and the position page all
//       carry a link to the listing filtered to that vault
//  L13  the phone: the document does not scroll sideways at 390px, and the
//       route has a loading.tsx that mounts the shared listing skeleton
//  L14  the section's chrome: exactly one Vaults mark on the listing and on a
//       position page, one section rail whose four tabs each resolve 200 with
//       POSITIONS lit, a listing face carrying no drawer and no inspector, and
//       an about page whose three-blocks paragraph names no block of its own
//
// ── 2026-09-09 · THE SECTION CHROME MOVED OFF THE FACE ─────────────────────
// The listing's two drawers became two pages and the four surfaces became one
// rail row. The claims did not change; the surfaces they are read off did:
//
//   • The "How this listing is built" prose is /base/morpho/vaults/info,
//     the rail. `readInfoDom` reads it there with innerText — it is a VISIBLE
//     page body now, not a mounted-and-hidden panel, so the old textContent
//     trick would be reading a node under a claim that no longer describes it.
//     L4b and L7c assert on it; L9's register rules run over the listing face
//     AND that page.
//   • The roster of vaults is /base/morpho/vaults, the VAULTS tab. L6b and
//     L12a go there instead of clicking a drawer open; `[data-roster-panel]`
//     and every selector under it are unchanged.
//   • L14c, L14d and L14e are new. L14e is the one claim the move CHANGED
//     rather than relocated: the three-blocks paragraph used to state the
//     lane's own `finalized` distance, which it could when it rode the cards'
//     response and cannot now.
//
// ── STANDING TALLY, 2026-09-09, BASE=http://localhost:3010 ────────────────
// 57/57 · 0 SKIP. The census header has reached all 509 catalogued vaults, so
// L6's three checks run rather than skipping; the note below is what they say
// when it has not.
//
// ── the earlier tally, 2026-09-08, BASE=http://localhost:3801 ─────────────
// 51/51 · 3 SKIP. The three SKIPs are L6 (the never-held vaults) and they are
// one fact about the CENSUS, not about the page: the Base tick has reached 5 of
// the catalogue's 509 vaults and every one of them is held, so there is no
// zero-participant row for the roster to state as "no holder yet". L1, L5, L7
// and L11 run on a DERIVED membership vault for the same reason — F-B6 and F-B7
// are not in the census header yet — and the run prints which vault it used.
//
// ── PROVED IT CAN FAIL, 2026-09-08, BASE=http://localhost:3801 ─────────────
// Restored run: 48/48 · 4 SKIP (before L14 landed; 51/51 · 3 SKIP with it). Three breaks, applied ONE AT A TIME to the real
// source and reverted; the exact red lines follow. Nothing on this path is
// cached beyond the proxy's own listing header, which carries no figure a break
// here forges, so no cache had to be cleared between them.
//
//  A  THE VAULT FACET DROPPED HELD VAULTS — `.filter((c) => c.participants >
//     100)` in lib/morpho-base/position-list-filter-dimensions.tsx. 47/48.
//     FAIL L3d — "2 options; missing stormUSDC · 1, prodtest · 1, MMT · 11;
//                 not in the census's held set none"
//
//  A′ THE FACET OFFERED EVERY CENSUS ROW — `.filter(() => true)`, which is the
//     break the brief for this file named: a menu carrying the vaults nobody
//     has ever held. 48/48 GREEN, and that is a fact about the CENSUS rather
//     than about L3d: the tick has reached 5 of 509 vaults and every one of
//     them is held, so there is no zero-participant row for the break to leak.
//     ⚠️ SAID OUT LOUD RATHER THAN COUNTED AS PROVED. L3d's other half — that
//     the menu is not missing a held vault — is what break A exercised, and
//     the zero-participant half is untested until the census carries one. L6
//     SKIPs for the same reason and names it.
//
//  B  THE OVERLAY RESTATED THE CENSUS BALANCE AS THE LIVE FIGURE —
//     `shares: amount(BigInt(r.census.balance), shareDecimals)` in
//     app/api/vaults/positions/route.ts. 48/48 GREEN.
//     ⚠️⚠️ A CANNOT-FAIL TRAP, AND THE SAME ONE THE ETHEREUM SIBLING RECORDED.
//     L2a–L2c compare the route against this script's own reads at the OVERLAY
//     block, and on a QUIET window the census balance and the live balance are
//     the same number. Measured this run: over the 3,403 blocks between the
//     census block 51,053,859 and the overlay, ALL FIVE censused vaults emitted
//     ZERO `Transfer` logs, so not one address could have moved. L2f is the
//     check written for this break and it SKIPPED, naming that:
//     SKIP L2f — "no address already in the census changed its balance between
//                 the census block 51053859 and the overlay block 51057275 —
//                 the two lanes cannot be told apart on this window, and a
//                 green here would say nothing"
//     🔑 L2f was made CHEAPER as part of this run rather than weaker: it now
//     reads this script's own `balanceOf` for the twenty rows already on the
//     page at BOTH blocks before falling back to a whole-vault log sweep.
//     ✅ RE-RUN LATER THE SAME DAY, once one address had moved, and the trap is
//     CLOSED — break B re-applied, 45/49:
//     FAIL L2f — "0xc0c5…eb12/0x82c3…2d03: census 1717269284450625147987 @
//                 51053859, page 1717269284450625147987 @ 51058082, own
//                 1719075373980513589788 @ 51058082"
//     FAIL L2a — "0xc0c5…eb12/0x82c3…2d03: page 1717269284450625147987"
//     FAIL L2e — "0x82c3…2d03: card 1717269284450625147987, own
//                 1719075373980513589788 @ 51058083"
//     FAIL L2h — "0x82c3…2d03 Shares · gtUSDCc: title '1717.269284450625147987
//                 gtUSDCc', own '1719.075373980513589788 gtUSDCc'"
//     🔑 Four checks, one cause, and the pair L2f/L2a is the point: L2a is red
//     only because ONE of the twenty rows had moved, and L2f is the check that
//     goes red whether or not that row happened to be on page one. A run whose
//     L2f SKIPPED has not tested the live lane.
//
//  C  THE CLOSED CARD PRINTED A SHARES FIGURE — `columns = status.live ? […] :
//     [closedColumn, sharesColumn]` in components/vaults/vault-position-card.tsx.
//     45/48.
//     FAIL L5b — "CLOSED MMT· MetaMorpho vault 0x831d…ae6a 785 days ago 3
//                 Closed by 15 Jul 2024 · block 17,128,530 nothing is held at
//                 block 51,057,300 Shares"
//     🔑 L5c stayed GREEN and that is right: the "Closed by" figure was
//     untouched. An absence check and a presence check are separate claims.
//     🔑 L0b and L0c also went red on that run ("0 cards in the server's own
//     HTML") and it was a COMPILE RACE, not the break: a plain fetch of the
//     listing a moment later, with the break still applied, carried 20 cards.
//     Recorded because a reader of this log would otherwise read it as blast
//     radius.//
//  G  THE SECTION'S MARK POINTED AT THE OTHER CHAIN — `href="/ethereum/vaults"`
//     in components/vaults/vaults-identity.tsx. 49/51.
//     FAIL L14a — '{"chain":"8453","href":"/ethereum/vaults","text":"Vaults·
//                  Base","icons":1}'
//     FAIL L14b — '{"chain":"8453","href":"/ethereum/vaults"}'
//     🔑 The mark still SAYS "Vaults · Base" under this break — it is the href
//     alone that sends a reader to a page that is true about a different chain
//     — which is why L14 asserts the link and not only the words.
//     🔑 Its first run went red for a different reason and the check was wrong,
//     not the page: `textContent` joins the link and the chain span with no
//     space, so the mark reads "Vaults· Base" in the DOM and a
//     /Vaults · Base/ literal could never match.
//
import { chromium } from "playwright";
import { createPublicClient, http, parseAbi, parseAbiItem, toEventSelector } from "viem";
import { base } from "viem/chains";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPositionsRoute, retriedReads } from "../lib/read-positions-route.mjs";
import { expectedRoster } from "./lib/served-vault-roster.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = process.env.BASE ?? "http://localhost:3801";
const LISTING = `${BASE}/base/morpho/vaults/positions`;
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
// the key to whatever is reading this run. Both terminal handlers below scrub
// anything URL-shaped out of the message before it is written, and the lanes
// are named by env var NAME only.
const scrub = (text) => String(text).replace(/https?:\/\/[^\s"'`)}\]]+/g, "<lane URL redacted>");
for (const signal of ["uncaughtException", "unhandledRejection"])
  process.on(signal, (error) => {
    console.error(`\nFAILED (${signal}) — ${scrub(error?.stack ?? error?.message ?? error)}`);
    process.exit(1);
  });

console.log(`\n── /base/morpho/vaults/positions · ${BASE} ──`);
console.log(`   lanes: BASE_RPC_URL present, BASE_BACKFILL_RPC_URL present (names only; no URL is printed)\n`);

// ── the catalogue, parsed out of the generated TS ───────────────────────────
// The same parse the sibling verifiers use, completeness assertion included: a
// formatting change that hid rows from this regex is an ERROR, never a quietly
// shorter roster that every comparison below would then satisfy vacuously. The
// creation block is what makes this script's own sweeps whole (see the header).
const catalogSrc = fs.readFileSync(path.join(ROOT, "lib/morpho-base/vault-catalog.ts"), "utf8");
const BAKED_CATALOG = (() => {
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
// The pages serve the box's roster over the baked one when the web takes it
// (lib/morpho-base/vault-roster.ts), and the census this listing pages is the
// box's too; a vault the bake lacks is still a roster row and a census row. So
// this script takes the roster by the web's rule (scripts/verify/lib/
// served-vault-roster.mjs) and names which one it judges.
const ROSTER = await expectedRoster(env, {
  chainId: 8453,
  family: "metamorpho",
  bakedRows: BAKED_CATALOG,
  bakedBlock: Number(catalogSrc.match(/MORPHO_BASE_VAULT_CENSUS_BLOCK = (\d+)/)[1]),
  same: (s, b) => s.factoryVersion === b.factory && s.createdBlock === b.createdBlock,
});
const CATALOG =
  ROSTER.source === "served"
    ? ROSTER.rows.map((v) => ({
        address: v.address,
        factory: v.factoryVersion,
        createdBlock: v.createdBlock,
        name: v.name ?? "",
      }))
    : BAKED_CATALOG;
console.log(
  `   roster: ${ROSTER.source}, ${CATALOG.length} vaults at block ${ROSTER.block}` +
    (ROSTER.source === "served" ? ` (baked ${BAKED_CATALOG.length})` : ` — ${ROSTER.why}`) +
    "\n",
);
const CATALOG_BY_ADDRESS = new Map(CATALOG.map((r) => [r.address, r]));

// ── the fixtures, as INPUTS ─────────────────────────────────────────────────
/** F-B6 — Grove x Steakhouse USDC High Yield. The small vault whose WHOLE
 *  participant set this script can re-derive in one `eth_getLogs` and compare
 *  to the store, set for set. ~27 participants over ~110 logs. */
const F_B6 = "0xbeef2d50b428675a1921bc6bbf4bfb9d8cf1461a";
/** F-B7 — Froge's USDC. A second whole-vault fixture, ~45 participants over
 *  ~315 logs, and a vault with NO fee recipient — so the closed address L5
 *  derives from it cannot be the fee-share mint's counterparty by accident. */
const F_B7 = "0x2c6d169782bf18cc634d076fe639092227b82fda";
for (const v of [F_B6, F_B7]) if (!CATALOG_BY_ADDRESS.has(v)) throw new Error(`fixture ${v} is not in the catalogue`);
/** L12's market view. The case-study vault, which every sibling verifier uses. */
const F_MARKET = "0xbeefe94c8ad530842bfe7d8b397938ffc1cb83b2";

// The `eth_call` lane and the log lane are different endpoints on this chain:
// BASE_RPC_URL refuses a whole-life range, and BASE_BACKFILL_RPC_URL is the one
// that answers it. Both are read from the environment and neither is printed.
const client = createPublicClient({
  chain: base,
  transport: http(env.BASE_RPC_URL, { batch: false, retryCount: 3, timeout: 90_000 }),
});

const TRANSFER = toEventSelector(
  parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"),
);
const VAULT_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function decimals() view returns (uint8)",
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

const hex = (n) => `0x${BigInt(n).toString(16)}`;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const tailOf = (t) => (t ? `0x${t.slice(26)}`.toLowerCase() : ZERO_ADDR);
const n = (v) => v.toLocaleString("en-US");

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
/** …the same file's `assetText`. */
const assetText = (raw, decimals) => {
  const value = Number(raw) / Math.pow(10, decimals);
  const text = value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals <= 6 ? 2 : 6,
  });
  return value !== 0 && parseFloat(text.replace(/,/g, "")) === 0 ? exactUnits(raw, decimals) : text;
};
/** `lib/utils/format.ts` `formatApproximate`, and the card's own rule for when
 *  it applies: the LISTING states an approximate headline at or above a
 *  thousand and the section's exact print rule below it. Restated here so a
 *  change to either half goes red rather than being read off the page. */
const formatApproximate = (value) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const headline = (exact, value) => (Math.abs(value) >= 1000 ? formatApproximate(value) : exact);
/** lib/morpho-base/position-list-filter-dimensions.tsx `baseVaultOptionLabel`
 *  — the label a vault facet option wears. Restated so a change to it is
 *  visible here rather than read off the menu under test. A symbol that
 *  repeats among the OFFERED vaults carries the address, because three held
 *  vaults on the full census are all named "USDC". */
const vaultOptionLabel = (c, offered) => {
  const symbol = c.symbol ?? c.vault.slice(0, 10);
  const repeated = c.symbol != null && offered.some((o) => o.vault !== c.vault && o.symbol === c.symbol);
  const name = repeated ? `${symbol} ${c.vault.slice(0, 6)}…${c.vault.slice(-4)}` : symbol;
  return `${name} · ${n(c.participants)}`;
};

// ── this script's own reads ─────────────────────────────────────────────────
// Called by hand rather than through viem: viem's errors carry the endpoint,
// and a whole-life sweep on a shared key answers 429 under load. Errors here
// name the lane by ENV VAR NAME and a rate-limit answer is waited out.
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

/** Sweep ONE vault's whole Transfer stream from its own creation block to
 *  `toBlock` and build the participant set the way a census does: every address
 *  either side of every log, minus the zero address (a mint's `from` and a
 *  burn's `to`). */
async function sweepParticipants(vault, toBlock) {
  const from = CATALOG_BY_ADDRESS.get(vault).createdBlock;
  const logs = await getLogs(vault, [TRANSFER], from, toBlock);
  const byHolder = new Map();
  for (const l of logs) {
    const block = Number(BigInt(l.blockNumber));
    for (const t of [tailOf(l.topics[1]), tailOf(l.topics[2])]) {
      if (t === ZERO_ADDR) continue;
      const cur = byHolder.get(t) ?? { transferCount: 0, firstBlock: block, lastBlock: block };
      cur.transferCount += 1;
      if (block < cur.firstBlock) cur.firstBlock = block;
      if (block > cur.lastBlock) cur.lastBlock = block;
      byHolder.set(t, cur);
    }
  }
  return { logs, byHolder };
}

const readRoute = (qs) => readPositionsRoute(BASE, qs);

const listingHtml = async (qs = "") => {
  const res = await fetch(qs ? `${LISTING}?${qs}` : LISTING);
  return { status: res.status, html: await res.text() };
};

const countMatches = (html, needle) => html.split(needle).length - 1;

// ═══ L0 ═══════════════════════════════════════════════════════════════════
const head = Number(await client.getBlockNumber());
const first = await listingHtml();
// The listing's own resting selection, so the route and the rendered page are
// answering the same question — a comparison between two different orders would
// be green-but-vacuous on both sides.
// Since mig 206 the resting view is VALUE DESC (the size-floor plan's D2).
const route0 = await readRoute(`chain=${CHAIN}&sortBy=value&sortOrder=desc&limit=20`);

check("L0a the listing answers 200", first.status === 200, `status ${first.status}`);
check(
  "L0b the INITIAL HTML carries a full page of position cards",
  countMatches(first.html, "data-position-card") === 20,
  `${countMatches(first.html, "data-position-card")} cards in the server's own HTML`,
);
// The route is `force-dynamic` behind a `loading.tsx`, so Next streams the
// boundary's fallback ahead of the resolved content and BOTH arrive in one
// document. What a page that had lost its SSR seeding would fail is that the
// fallback is FOLLOWED by the real rows in that same response, rather than
// being the answer.
const skeletonAt = first.html.search(/data-skel-section="listing-skeleton"|animate-pulse/);
const firstCardAt = first.html.indexOf("data-position-card");
check(
  "L0c the skeleton in the first response is the boundary's fallback and the rows follow it in the same document",
  skeletonAt !== -1 && firstCardAt !== -1 && skeletonAt < firstCardAt,
  `skeleton at ${skeletonAt}, first card at ${firstCardAt}`,
);
// 200 blocks, not 30: Base runs at 2s/block, so the same wall-clock tolerance
// the Ethereum sibling allows is about 200 blocks here. A number chosen from
// the chain's own cadence rather than copied across.
check(
  "L0d the route's overlay block is within 200 blocks of this script's own head",
  route0.blockNumber != null && Math.abs(head - route0.blockNumber) <= 200,
  `route ${route0.blockNumber} vs own head ${head} (${Math.abs(head - (route0.blockNumber ?? 0))} blocks)`,
);

const censusRows = route0.census;
const censusBlock = censusRows[0]?.censusBlock;
// The census is ONE tick at ONE pin on the cron's day, but a vault the tick
// failed is re-run by hand with `--vault` at its own pin (2026-09-09: five
// vaults, six distinct blocks), and that is a state the page is built to
// state — "blocks A to B" — not a failure of the store. The invariant is that
// every row names a block; L10 holds the page to the exact set it names.
const censusBlocks = Array.from(new Set(censusRows.map((c) => c.censusBlock))).sort((a, b) => a - b);
check(
  "L0e every vault's census names a block",
  censusRows.length > 0 && censusRows.every((c) => Number.isInteger(c.censusBlock) && c.censusBlock > 0),
  censusBlocks.length === 1
    ? `${censusRows.length} vaults at block ${censusBlock}`
    : `${censusRows.length} vaults across ${censusBlocks.length} blocks, ${censusBlocks[0]} to ${censusBlocks[censusBlocks.length - 1]}`,
);
const censusBy = new Map(censusRows.map((c) => [c.vault, c]));
const CENSUS_IS_WHOLE = censusRows.length === CATALOG.length;
console.log(
  `      · the census header carries ${censusRows.length} of the catalogue's ${CATALOG.length} vaults` +
    `${CENSUS_IS_WHOLE ? "" : " — the tick is still filling, and every check below that needs a vault it has not reached SKIPs out loud"}`,
);

// ═══ L1 — membership is the chain's ════════════════════════════════════════
// The membership fixture is F-B6, and F-B7 stands behind it: whichever of the
// two the census knows is swept whole. A census that knows NEITHER cannot be
// asked this question at all, and the section says so rather than passing.
// ⚠️ AND A FALLBACK, NAMED IN THE OUTPUT. The census tick is refilling and does
// not carry F-B6 or F-B7 yet; skipping the whole of L1, L5, L7 and L11 until it
// does would leave the listing's central claim — that membership IS the chain's
// — untested for hours. So where neither pinned fixture is in the header, the
// membership vault is DERIVED: the largest censused vault whose whole
// `Transfer` stream this script can still sweep in one request. It is a fixture
// of the same shape, chosen by the same rule the pinned ones were chosen by,
// and every expectation below is still this script's own sweep. Which vault was
// used is printed, so a run can never be read as having checked F-B6 when it
// checked something else.
const SWEEPABLE = 400;
const MEMBERSHIP =
  [F_B6, F_B7].find((v) => censusBy.has(v)) ??
  [...censusRows]
    .filter((c) => c.participants > 0 && c.participants <= SWEEPABLE && CATALOG_BY_ADDRESS.has(c.vault))
    .sort((a, b) => b.participants - a.participants)[0]?.vault ??
  null;
const MEMBERSHIP_IS_PINNED = MEMBERSHIP === F_B6 || MEMBERSHIP === F_B7;
let ownSet = new Set();
let membershipRows = [];
let ownParticipants = [];
let ownBalances = [];
if (!MEMBERSHIP) {
  const why =
    `neither whole-vault fixture is in the census header yet — F-B6 ${F_B6} and F-B7 ${F_B7} are both absent from ` +
    `the ${censusRows.length} vaults it carries — and none of the vaults it DOES carry is small enough to sweep ` +
    `whole (at most ${SWEEPABLE} participants). The Base census tick is refilling to all ${CATALOG.length}; ` +
    `re-run when the header carries a vault of that shape.`;
  for (const name of [
    "L1a this script's OWN sweep of the membership fixture is whole (Σ balanceOf == totalSupply, wei-exact)",
    "L1b the route's rows for it are EXACTLY this script's own participant set",
    "L1c every row's live flag is this script's own balanceOf > 0 at the census block",
    "L1d every row's census balance is this script's own balanceOf, wei-exact",
    "L1e every row's transfer count, first block and last block are this script's own",
  ])
    skip(name, why);
} else {
  const label = MEMBERSHIP === F_B6 ? "F-B6" : MEMBERSHIP === F_B7 ? "F-B7" : "the derived membership vault";
  console.log(
    `      · membership fixture: ${label} ${MEMBERSHIP} (${censusBy.get(MEMBERSHIP)?.symbol ?? "?"}, ${n(censusBy.get(MEMBERSHIP)?.participants ?? 0)} participants)` +
      `${MEMBERSHIP_IS_PINNED ? "" : " — DERIVED, because neither pinned fixture is in the census header yet"}`,
  );
  const { byHolder } = await sweepParticipants(MEMBERSHIP, censusBlock);
  ownParticipants = [...byHolder.keys()];
  // This script's own Σ balanceOf == totalSupply at the census block: the proof
  // that its OWN sweep is whole, which is what makes it a fair expectation.
  ownBalances = await client.multicall({
    contracts: [
      ...ownParticipants.map((a) => ({
        address: MEMBERSHIP,
        abi: VAULT_ABI,
        functionName: "balanceOf",
        args: [a],
      })),
      { address: MEMBERSHIP, abi: VAULT_ABI, functionName: "totalSupply" },
    ],
    blockNumber: BigInt(censusBlock),
    allowFailure: false,
  });
  const supply = ownBalances[ownParticipants.length];
  const sum = ownBalances.slice(0, ownParticipants.length).reduce((s, v) => s + v, 0n);
  check(
    `L1a this script's OWN sweep of ${label} is whole (Σ balanceOf == totalSupply, wei-exact)`,
    sum === supply,
    `${ownParticipants.length} participants · Σ ${sum} vs totalSupply ${supply} @ block ${censusBlock}`,
  );

  for (let offset = 0; ; offset += 100) {
    const page = await readRoute(`chain=${CHAIN}&vault=${MEMBERSHIP}&limit=100&offset=${offset}&overlay=0`);
    membershipRows.push(...page.data);
    if (membershipRows.length >= page.pagination.total || page.data.length === 0) break;
  }
  const routeSet = new Set(membershipRows.map((r) => r.holder));
  ownSet = new Set(ownParticipants);
  const missing = [...ownSet].filter((a) => !routeSet.has(a));
  const extra = [...routeSet].filter((a) => !ownSet.has(a));
  check(
    `L1b the route's ${label} rows are EXACTLY this script's own participant set`,
    missing.length === 0 && extra.length === 0 && membershipRows.length === ownParticipants.length,
    `route ${membershipRows.length}, own ${ownParticipants.length}${missing.length ? `, missing ${missing.join(",")}` : ""}${extra.length ? `, extra ${extra.join(",")}` : ""}`,
  );

  const ownLive = new Map(ownParticipants.map((a, i) => [a, ownBalances[i] > 0n]));
  const liveBad = membershipRows.filter((r) => r.census.live !== ownLive.get(r.holder));
  check(
    "L1c every row's live flag is this script's own balanceOf > 0 at the census block",
    liveBad.length === 0,
    liveBad.length ? liveBad.map((r) => r.holder).join(", ") : `${membershipRows.length} rows agree`,
  );
  const balBad = membershipRows.filter((r) => {
    const own = ownBalances[ownParticipants.indexOf(r.holder)];
    return own == null || BigInt(r.census.balance) !== own;
  });
  check(
    "L1d every row's census balance is this script's own balanceOf, wei-exact",
    balBad.length === 0,
    balBad.length
      ? balBad.map((r) => `${r.holder}: ${r.census.balance}`).join(", ")
      : `${membershipRows.length} rows wei-exact`,
  );
  const countBad = membershipRows.filter((r) => {
    const own = byHolder.get(r.holder);
    return (
      !own ||
      own.transferCount !== r.census.transferCount ||
      own.firstBlock !== r.census.firstBlock ||
      own.lastBlock !== r.census.lastBlock
    );
  });
  check(
    "L1e every row's transfer count, first block and last block are this script's own",
    countBad.length === 0,
    countBad.length
      ? countBad
          .map((r) => {
            const o = byHolder.get(r.holder);
            return `${r.holder}: page ${r.census.transferCount}/${r.census.firstBlock}/${r.census.lastBlock} vs own ${o?.transferCount}/${o?.firstBlock}/${o?.lastBlock}`;
          })
          .join(" · ")
      : `${membershipRows.length} rows agree`,
  );
}

// ═══ L2 — the overlay is live ══════════════════════════════════════════════
const page1 = route0.data;
const overlayBlock = route0.blockNumber;
const ownOverlay = await client.multicall({
  contracts: page1.map((r) => ({ address: r.vault, abi: VAULT_ABI, functionName: "balanceOf", args: [r.holder] })),
  blockNumber: BigInt(overlayBlock),
  allowFailure: false,
});
const sharesBad = page1.filter((r, i) => !r.live || BigInt(r.live.shares.raw) !== ownOverlay[i]);
check(
  "L2a every card's shares are this script's own balanceOf at the route's own block",
  sharesBad.length === 0,
  sharesBad.length
    ? sharesBad.map((r) => `${r.vault}/${r.holder}: page ${r.live?.shares.raw ?? "unread"}`).join(" · ")
    : `${page1.length} cards wei-exact @ block ${overlayBlock}`,
);

const claimIdx = page1.map((r, i) => i).filter((i) => ownOverlay[i] > 0n);
const ownClaims = await client.multicall({
  contracts: claimIdx.map((i) => ({
    address: page1[i].vault,
    abi: VAULT_ABI,
    functionName: "convertToAssets",
    args: [ownOverlay[i]],
  })),
  blockNumber: BigInt(overlayBlock),
  allowFailure: false,
});
const claimBad = claimIdx.filter((i, k) => BigInt(page1[i].live?.claim?.raw ?? "-1") !== ownClaims[k]);
check(
  "L2b every card's claim is the vault's own convertToAssets of that balance, wei-exact",
  claimBad.length === 0,
  claimBad.length
    ? claimBad.map((i) => `${page1[i].vault}/${page1[i].holder}: ${page1[i].live?.claim?.raw}`).join(" · ")
    : `${claimIdx.length} claims wei-exact`,
);

const distinctVaults = [...new Set(page1.map((r) => r.vault))];
const ownSupplies = await client.multicall({
  contracts: distinctVaults.map((v) => ({ address: v, abi: VAULT_ABI, functionName: "totalSupply" })),
  blockNumber: BigInt(overlayBlock),
  allowFailure: false,
});
const supplyMap = new Map(distinctVaults.map((v, i) => [v, ownSupplies[i]]));
const supplyBad = page1.filter((r) => r.live && BigInt(r.live.totalSupply?.raw ?? "-1") !== supplyMap.get(r.vault));
check(
  "L2c every card's totalSupply is this script's own read at the same block",
  supplyBad.length === 0,
  supplyBad.length ? supplyBad.map((r) => r.vault).join(", ") : `${distinctVaults.length} vaults wei-exact`,
);

// ⚠️⚠️ L2a–L2c all compare the route against this script's own reads at the
// OVERLAY's block — which is right, but on a QUIET window the census balance
// and the live balance are the same number, and a route that restated the
// census as the live figure would pass all three. So the lane itself is proved
// separately, on an address that DID move after the census, for which the two
// lanes necessarily disagree. SKIPs out loud when the window really is quiet:
// a statement about the window, not about the rule.
async function movedSinceCensus() {
  // The cheap pass first: the twenty rows already on the page, read by THIS
  // SCRIPT at both blocks. A row whose two balances differ is the witness, and
  // it costs two multicalls rather than a whole-vault log sweep per vault.
  const atCensus = await client.multicall({
    contracts: page1.map((r) => ({ address: r.vault, abi: VAULT_ABI, functionName: "balanceOf", args: [r.holder] })),
    blockNumber: BigInt(censusBlock),
    allowFailure: true,
  });
  for (let i = 0; i < page1.length; i++) {
    if (atCensus[i].status !== "success") continue;
    if (atCensus[i].result === ownOverlay[i]) continue;
    return {
      row: page1[i],
      vault: page1[i].vault,
      holder: page1[i].holder,
      atCensus: atCensus[i].result,
      atOverlay: ownOverlay[i],
    };
  }
  // …and only then the wider search, over every censused vault's own log
  // stream since the census block.
  for (const c of censusRows) {
    if (c.participants === 0) continue;
    let logs;
    try {
      logs = await getLogs(c.vault, [TRANSFER], censusBlock + 1, overlayBlock);
    } catch {
      continue;
    }
    const seen = new Set();
    for (const l of logs) {
      for (const t of [tailOf(l.topics[1]), tailOf(l.topics[2])]) {
        if (t === ZERO_ADDR || seen.has(t)) continue;
        seen.add(t);
        // Appearing in a log is not enough: a transfer in and a transfer out in
        // the same window leaves the balance where it was, and the two lanes
        // would still agree. The candidate is accepted only when THIS SCRIPT's
        // own two reads disagree.
        const [atCensus, atOverlay] = await Promise.all([
          client.readContract({
            address: c.vault,
            abi: VAULT_ABI,
            functionName: "balanceOf",
            args: [t],
            blockNumber: BigInt(censusBlock),
          }),
          client.readContract({
            address: c.vault,
            abi: VAULT_ABI,
            functionName: "balanceOf",
            args: [t],
            blockNumber: BigInt(overlayBlock),
          }),
        ]);
        if (atCensus === atOverlay) continue;
        const r = await readRoute(`chain=${CHAIN}&vault=${c.vault}&q=${t}&limit=5`);
        const row = r.data.find((x) => x.holder === t);
        if (row) return { row, vault: c.vault, holder: t, atCensus, atOverlay };
      }
    }
  }
  return null;
}
const moved = await movedSinceCensus();
if (!moved) {
  skip(
    "L2f the overlay is read at the block it names, not restated from the census",
    `no address already in the census changed its balance between the census block ${censusBlock} and the overlay block ${overlayBlock} — the two lanes cannot be told apart on this window, and a green here would say nothing`,
  );
} else {
  check(
    "L2f the overlay is read at the block it names, not restated from the census",
    moved.row.live != null &&
      BigInt(moved.row.live.shares.raw) === moved.atOverlay &&
      moved.row.live.shares.raw !== moved.row.census.balance,
    `${moved.vault}/${moved.holder}: census ${moved.row.census.balance} @ ${censusBlock}, page ${moved.row.live?.shares.raw} @ ${moved.row.live?.blockNumber}, own ${moved.atOverlay} @ ${overlayBlock}`,
  );
}

// ── the same figures, off the RENDERED DOM ─────────────────────────────────
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 2400 } });

async function readListingDom(qs = "") {
  const page = await context.newPage();
  const res = await page.goto(qs ? `${LISTING}?${qs}` : LISTING, { waitUntil: "networkidle", timeout: 120_000 });
  const status = res?.status() ?? 0;
  const cards = await page.locator("[data-position-card]").evaluateAll((els) =>
    els.map((e) => {
      // The two headline figures, read as the reader sees them: the printed
      // text AND the `title` the exact value rides on. The listing's cards
      // carry no `data-figure` markers on purpose (twenty rows would make
      // twenty of each name), so each column is found by its own label —
      // "Shares · <symbol>" / "Claim · <symbol>" — and the value is the one
      // element under it that carries a title.
      const stats = [...e.querySelectorAll("div")]
        .filter((d) => d.firstElementChild && /^(Shares|Claim) · /.test(d.firstElementChild.textContent ?? ""))
        .map((d) => {
          const value = d.querySelector("[title]");
          return {
            label: (d.firstElementChild.textContent ?? "").trim(),
            text: (value?.textContent ?? "").trim(),
            title: value?.getAttribute("title") ?? "",
          };
        });
      const symbolEl = e.querySelector("[data-card-vault-symbol]");
      const pillEl = e.querySelector("[data-wallet-label]");
      return {
        id: e.getAttribute("data-position-card"),
        vault: e.getAttribute("data-vault"),
        holder: e.getAttribute("data-holder"),
        status: e.getAttribute("data-status"),
        shape: e.getAttribute("data-shape"),
        sharesRaw: e.getAttribute("data-shares-raw"),
        claimRaw: e.getAttribute("data-claim-raw"),
        lastBlock: e.getAttribute("data-last-block"),
        liveBlock: e.getAttribute("data-live-block"),
        valueUsdE8: e.getAttribute("data-value-usd-e8"),
        pricedBlock: e.getAttribute("data-priced-block"),
        stats,
        vaultSymbol: symbolEl?.getAttribute("data-card-vault-symbol") ?? null,
        symbolLeadsPill: symbolEl && pillEl ? (symbolEl.compareDocumentPosition(pillEl) & 4) === 4 : null,
        text: e.innerText.replace(/\s+/g, " ").trim(),
        href: e.closest("a")?.getAttribute("href") ?? null,
      };
    }),
  );
  // Copy rules are judged over what the page STATES. The listing's own face is
  // the rendered innerText, never `body.textContent`: that sweeps the RSC
  // payload in the <script> tags with it, where "$3" and "your" are module
  // chrome (memory `vaults-section-build`). The section's prose is not on this
  // page any more — it is read off /base/morpho/vaults/info by `readInfoDom`
  // and L9 judges the two together.
  const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
  // The face's one line — the census line under the section rail
  // (components/vaults/vault-census-line.tsx).
  const stance = (await page.locator("[data-stance]").count())
    ? (await page.locator("[data-stance]").evaluate((e) => e.textContent ?? "")).replace(/\s+/g, " ").trim()
    : "";
  const roster = await page.locator("[data-roster-drawer]").count();
  const introOnFace = await page.locator("[data-intro-drawer]").count();
  const inspector = await page.locator("button.prov-inspect-toggle").count();
  const body = bodyText;
  // The rail this page wears. Since rails-ops decision 0028 the vault layer is
  // a view of the Morpho Blue Base explorer, so the row is that explorer's
  // RailHeader — the section's own `[data-vaults-identity]` mark is gone from
  // this chain entirely, and both facts are asserted (L14a/b).
  const identity = await page.locator('nav[aria-label="Explorer sections"]').evaluateAll((navs) =>
    navs.map((nav) => ({
      tabs: Array.from(nav.querySelectorAll("a")).map((a) => ({
        href: a.getAttribute("href"),
        label: a.getAttribute("aria-label"),
        text: (a.textContent ?? "").replace(/\s+/g, " ").trim(),
        current: a.getAttribute("aria-current"),
      })),
    })),
  );
  const sectionMark = await page.locator("[data-vaults-identity]").count();
  await page.close();
  return { status, cards, body, stance, identity, sectionMark, roster, introOnFace, inspector };
}

/** The vault layer's about page — /base/morpho/vaults/info.
 *
 *  ⚠️ READ WITH innerText, NOT THE HIDDEN-PANEL TRICK. The prose used to be a
 *  drawer beside the listing: a panel always MOUNTED and merely hidden, whose
 *  words only `textContent` could see. It is a page now and the body is
 *  VISIBLE, so innerText is the reader's own view of it — and a wrapper that
 *  went `hidden` by accident would go red here instead of passing on text
 *  nobody can see.
 *
 *  The three-blocks paragraph is read out on its own: what it must NOT say is
 *  a claim about that paragraph and nothing else. */
async function readInfoDom() {
  const page = await context.newPage();
  const res = await page.goto(`${BASE}/base/morpho/vaults/info`, { waitUntil: "networkidle", timeout: 120_000 });
  const status = res?.status() ?? 0;
  const drawers = await page.locator("[data-intro-drawer]").count();
  if (drawers !== 1)
    throw new Error(
      `/base/morpho/vaults/info carries ${drawers} [data-intro-drawer] bodies — every prose check below rests on exactly one`,
    );
  const text = (await page.locator("[data-intro-drawer]").innerText()).replace(/\s+/g, " ").trim();
  const blocks = (await page.locator("[data-intro-blocks]").count())
    ? (await page.locator("[data-intro-blocks]").innerText()).replace(/\s+/g, " ").trim()
    : "";
  await page.close();
  return { status, text, blocks };
}

const dom = await readListingDom();
const info = await readInfoDom();
dom.info = info.text;
check("L2d the rendered listing draws a full page of cards", dom.cards.length === 20, `${dom.cards.length} cards`);

// ⚠️ THE EXPECTATION IS THIS SCRIPT'S OWN READ AT THE BLOCK THE CARD NAMES, not
// the route JSON read minutes earlier. The two are different requests at
// different blocks and a balance moves between them; every card states the
// block its live lane was read at (`data-live-block`), so the comparison is
// pinned to that block and the formatting rules above are applied to THIS
// SCRIPT's integers.
const liveCards = dom.cards.filter((c) => c.status === "live" && c.sharesRaw && Number(c.liveBlock) > 0);
const cardBlocks = [...new Set(liveCards.map((c) => c.liveBlock))];
check(
  "L2e0 every card on one render names ONE live block",
  cardBlocks.length === 1,
  cardBlocks.join(", ") || "no live cards",
);
const domBlock = Number(cardBlocks[0] ?? 0);
// Symbols and decimals are constants of the vault, so they may come from the
// route; every FIGURE below is read again by this script.
const meta = new Map(censusRows.map((c) => [c.vault, { symbol: c.symbol, shareDecimals: c.shareDecimals ?? 18 }]));
const assetOf = new Map(page1.filter((r) => r.asset).map((r) => [r.vault, r.asset]));

const ownDomShares = liveCards.length
  ? await client.multicall({
      contracts: liveCards.map((c) => ({
        address: c.vault,
        abi: VAULT_ABI,
        functionName: "balanceOf",
        args: [c.holder],
      })),
      blockNumber: BigInt(domBlock),
      allowFailure: false,
    })
  : [];
const ownDomClaims = liveCards.length
  ? await client.multicall({
      contracts: liveCards.map((c, i) => ({
        address: c.vault,
        abi: VAULT_ABI,
        functionName: "convertToAssets",
        args: [ownDomShares[i]],
      })),
      blockNumber: BigInt(domBlock),
      allowFailure: false,
    })
  : [];

const domFigureBad = [];
const titleBad = [];
const rawBad = [];
const compactSeen = [];
liveCards.forEach((card, i) => {
  const m = meta.get(card.vault);
  if (!m) return;
  const sd = m.shareDecimals;
  const shareSymbol = m.symbol ?? `${card.vault.slice(0, 6)}…${card.vault.slice(-4)}`;
  const asset = assetOf.get(card.vault);
  if (BigInt(card.sharesRaw) !== ownDomShares[i])
    rawBad.push(`${card.holder}: card ${card.sharesRaw}, own ${ownDomShares[i]} @ ${domBlock}`);
  const want = [
    {
      label: `Shares · ${shareSymbol}`,
      exact: shareText(ownDomShares[i], sd),
      text: headline(shareText(ownDomShares[i], sd), Number(ownDomShares[i]) / Math.pow(10, sd)),
      title: `${exactUnits(ownDomShares[i], sd)} ${shareSymbol}`,
    },
  ];
  if (asset && card.claimRaw)
    want.push({
      label: `Claim · ${asset.symbol}`,
      exact: assetText(ownDomClaims[i], asset.decimals),
      text: headline(
        assetText(ownDomClaims[i], asset.decimals),
        Number(ownDomClaims[i]) / Math.pow(10, asset.decimals),
      ),
      title: `${exactUnits(ownDomClaims[i], asset.decimals)} ${asset.symbol}`,
    });
  for (const w of want) {
    const got = card.stats.find((st) => st.label === w.label);
    if (!got) {
      domFigureBad.push(`${card.holder}: no "${w.label}" column`);
      continue;
    }
    if (got.text !== w.text) domFigureBad.push(`${card.holder} ${w.label}: card "${got.text}", own "${w.text}"`);
    if (got.title !== w.title) titleBad.push(`${card.holder} ${w.label}: title "${got.title}", own "${w.title}"`);
    if (w.text !== w.exact) compactSeen.push(`${w.label} ${w.text} (exact ${w.exact})`);
  }
});
check(
  "L2e the DOM's own raw figures are this script's reads at the block the card names",
  liveCards.length > 0 && rawBad.length === 0,
  rawBad.length ? rawBad.slice(0, 3).join(" · ") : `${liveCards.length} live cards wei-exact @ block ${domBlock}`,
);
check(
  "L2g the listing prints its headline figures through the COMPACT rule",
  liveCards.length > 0 && domFigureBad.length === 0,
  domFigureBad.length ? domFigureBad.slice(0, 4).join(" · ") : `${liveCards.length} live cards match`,
);
check(
  "L2h every headline figure carries the EXACT value on its title",
  liveCards.length > 0 && titleBad.length === 0,
  titleBad.length ? titleBad.slice(0, 4).join(" · ") : `${liveCards.length} live cards, titles wei-exact`,
);
// ⚠️ Without this the two checks above are green on a page that never compacts
// anything: every figure would equal its own exact form and the compact rule
// would be untested. SKIP rather than PASS when the page really carries no
// figure over a thousand — a statement about the page, not about the rule.
if (compactSeen.length > 0)
  check(
    "L2i the listing SHORTENS a figure its title still states in full",
    true,
    `${compactSeen.length} compacted figures, e.g. ${compactSeen[0]}`,
  );
else skip("L2i the listing SHORTENS a figure", "no figure on this page reaches a thousand");
check(
  "L2j the vault symbol leads the card and the holder pill follows it",
  dom.cards.length > 0 && dom.cards.every((c) => c.vaultSymbol && c.symbolLeadsPill === true),
  dom.cards
    .filter((c) => c.symbolLeadsPill !== true)
    .slice(0, 3)
    .map((c) => `${c.holder}: symbol ${c.vaultSymbol ?? "(none)"}, leads ${c.symbolLeadsPill}`)
    .join(" · ") || `${dom.cards.length} cards lead with the vault`,
);

// ═══ L3 — the facets partition ═════════════════════════════════════════════
const chainTotal = (await readRoute(`chain=${CHAIN}&limit=1&overlay=0`)).pagination.total;
// ⚠️ THE CENSUS IS REWRITTEN VAULT BY VAULT WHILE THIS RUNS. The daily tick on
// the box sweeps 511 vaults over about two and a quarter hours, one transaction
// per vault, and the four slowest take ten to thirteen minutes each. So a run
// that lands mid-tick reads a vault's ROWS from one sweep and its CENSUS ROW
// from another, and the two legitimately differ by a handful. That is a fact
// about the tick, not about the page, and failing on it is a FALSE red — the
// kind that teaches a reader to ignore this file.
//
// It is told apart rather than tolerated: each vault's `loadedAt` is read again
// AFTER its three row counts, and a vault whose stamp moved across that window
// was being rewritten under this check and is named and skipped. A vault whose
// stamp did NOT move is asserted exactly as before — so a real disagreement
// between the census header and the rows still goes red, and only the moving
// ones are set aside. Skipping silently would be the other failure: the count
// of them is stated, and the whole check skips out loud if the tick was so busy
// that too few vaults stood still to prove anything.
// The stamp is compared from ONE re-read of the whole header after the loop,
// not one per vault: the unfiltered census page costs seconds at this row count
// and 511 of them would add half an hour to a check that is otherwise minutes.
const stamp = (r) => `${r.loadedAt}:${r.participants}:${r.liveCount}`;
const partitionBad = [];
const perVault = [];
for (const c of censusRows) {
  const all = (await readRoute(`chain=${CHAIN}&vault=${c.vault}&limit=1&overlay=0`)).pagination.total;
  const live = (await readRoute(`chain=${CHAIN}&vault=${c.vault}&status=live&limit=1&overlay=0`)).pagination.total;
  const closed = (await readRoute(`chain=${CHAIN}&vault=${c.vault}&status=closed&limit=1&overlay=0`)).pagination.total;
  // live + closed == unfiltered is a statement about ONE read of the rows and
  // holds whatever the tick is doing, so it is asserted for every vault.
  if (live + closed !== all) partitionBad.push(`${c.symbol}: ${live}+${closed}≠${all}`);
  perVault.push({ c, all, live });
}
const after = new Map((await readRoute(`chain=${CHAIN}&limit=1&overlay=0`)).census.map((r) => [r.vault, stamp(r)]));
const movedUnderUs = [];
for (const { c, all, live } of perVault) {
  if (after.get(c.vault) !== stamp(c)) {
    movedUnderUs.push(c.symbol);
    continue;
  }
  if (all !== c.participants) partitionBad.push(`${c.symbol}: rows ${all} ≠ census participants ${c.participants}`);
  if (live !== c.liveCount) partitionBad.push(`${c.symbol}: live ${live} ≠ census liveCount ${c.liveCount}`);
}
const stood = censusRows.length - movedUnderUs.length;
if (stood < censusRows.length / 2)
  skip(
    "L3a per vault, live + closed == unfiltered, and both agree with the census header",
    `the daily census tick rewrote ${movedUnderUs.length} of ${censusRows.length} vaults while this check ran, so too few stood still to prove the header against the rows — re-run when the tick is idle`,
  );
else
  check(
    "L3a per vault, live + closed == unfiltered, and both agree with the census header",
    censusRows.length > 0 && partitionBad.length === 0,
    partitionBad.length
      ? partitionBad.join(" · ")
      : `${stood} vaults partition and agree with their census row${movedUnderUs.length ? `; ${movedUnderUs.length} set aside, rewritten by the tick mid-check: ${movedUnderUs.slice(0, 3).join(", ")}` : ""}`,
  );

// The shape vocabulary is restated here rather than imported: a check that read
// its option list off the thing under test could not catch a shape being
// dropped from the facet, and a dropped shape is rows that no selection can
// reach. Σ over it must be the chain total exactly.
const SHAPES = [
  "eoa",
  "delegated-account",
  "safe",
  "erc4626",
  "erc1967-proxy",
  "eip1167-proxy",
  "contract",
  "aave-vault",
  "metamorpho-vault",
];
let shapeSum = 0;
for (const s of SHAPES) shapeSum += (await readRoute(`chain=${CHAIN}&shape=${s}&limit=1&overlay=0`)).pagination.total;
check("L3b Σ over the shape facet == the chain total", shapeSum === chainTotal, `${shapeSum} vs ${chainTotal}`);

const vaultSum = censusRows.reduce((s, c) => s + c.participants, 0);
check(
  "L3c Σ over the census's own per-vault participant counts == the chain total",
  vaultSum === chainTotal,
  `${vaultSum} vs ${chainTotal} across ${censusRows.length} vaults`,
);

// ⚠️⚠️ THE OPTION UNIVERSE, READ OUT OF THE MENU ITSELF. A facet offers only
// what the WHERE matches (memory `moonwell-base-asset-facets`): a census row
// with no participant would be a choice that always answers an empty page, and
// a row with participants that is MISSING is rows no selection can reach. Both
// are failures and this check sees both, because it compares the menu's own
// option labels against the set this script builds from the census header
// through the section's own label rule.
// A long dimension renders OPTION_RENDER_CAP (50) items at rest behind a
// "Filter options" input and STATES how many more match, so the universe is
// read in two moves: the items rendered at rest, then, for every held vault
// the rest did not show, the input narrowed to its symbol — the option must
// appear. A label that neither the rest nor its own search shows is a vault
// no selection can reach (2026-09-09: 236 held vaults on the full census).
const readMenuItems = (page) =>
  page
    .locator("[role='menuitemradio']")
    .evaluateAll((els) => els.map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim()));
async function vaultMenuOptions(expected) {
  const page = await context.newPage();
  await page.goto(LISTING, { waitUntil: "networkidle", timeout: 120_000 });
  await page
    .locator("button", { hasText: /^Vault$/ })
    .first()
    .click();
  await page.waitForSelector("[role='menuitemradio']", { timeout: 30_000 });
  const atRest = await readMenuItems(page);
  const restSet = new Set(atRest);
  const search = page.locator("input[placeholder='Filter options']");
  const searchable = (await search.count()) > 0;
  const foundBySearch = [];
  const notFound = [];
  for (const label of expected.filter((l) => !restSet.has(l))) {
    if (!searchable) {
      notFound.push(label);
      continue;
    }
    await search.fill(label);
    await page.waitForTimeout(150);
    const items = await readMenuItems(page);
    (items.includes(label) ? foundBySearch : notFound).push(label);
  }
  if (searchable) await search.fill("");
  await page.close();
  return { atRest, foundBySearch, notFound, searchable };
}
const heldRows = censusRows.filter((c) => c.participants > 0);
const shouldOffer = heldRows.map((c) => vaultOptionLabel(c, heldRows));
const neverHeldCensus = censusRows.filter((c) => c.participants === 0);
const menu = await vaultMenuOptions(shouldOffer);
const shouldSet = new Set(shouldOffer);
const menuExtra = menu.atRest.filter((l) => !shouldSet.has(l));
check(
  "L3d the vault menu offers every census row with a participant and not one with none",
  menu.atRest.length > 0 && menu.notFound.length === 0 && menuExtra.length === 0,
  menu.notFound.length || menuExtra.length
    ? `${menu.atRest.length} at rest, ${menu.foundBySearch.length} by search; missing ${menu.notFound.slice(0, 3).join(", ") || "none"}; not in the census's held set ${menuExtra.slice(0, 3).join(", ") || "none"}`
    : `${menu.atRest.length} at rest + ${menu.foundBySearch.length} by search = ${shouldOffer.length} held vaults, ${neverHeldCensus.length} never-held offered as none`,
);

// ═══ L4 — sorts ════════════════════════════════════════════════════════════
// The backend orders `shares` on the RAW balance, and the page says so in
// words. That is what is asserted here: a check that expected a
// decimals-adjusted order would go red on a correct route.
const sharesDesc = await readRoute(`chain=${CHAIN}&sortBy=shares&sortOrder=desc&limit=20&overlay=0`);
check(
  "L4a sortBy=shares desc is descending by the RAW census balance",
  sharesDesc.data.every((r, i) => i === 0 || BigInt(sharesDesc.data[i - 1].census.balance) >= BigInt(r.census.balance)),
  `${sharesDesc.data.length} rows`,
);
check(
  "L4b the section's about page states that the shares sort is in each vault's own units",
  /own units/.test(dom.info) && /decimals\(\)/.test(dom.info),
  "the drawer's sort paragraph names the units",
);

const lastAct = await readRoute(`chain=${CHAIN}&sortBy=lastActivity&sortOrder=desc&limit=20&overlay=0`);
const domValues = dom.cards.map((c) => (c.valueUsdE8 ? BigInt(c.valueUsdE8) : null));
check(
  "L4c lastActivity desc is descending by last block; the RESTING view is value desc (mig 206, decision D2)",
  lastAct.data.every((r, i) => i === 0 || lastAct.data[i - 1].census.lastBlock >= r.census.lastBlock) &&
    domValues.length === 20 &&
    domValues.every((v, i) => v != null && (i === 0 || domValues[i - 1] >= v)),
  `${lastAct.data.length} route rows newest-activity first; ${domValues.length} rendered rows largest value first with no sort in the URL`,
);
check(
  "L4d the DOM's row order is the API's row order",
  dom.cards.length === page1.length && dom.cards.every((c, i) => c.id === `${page1[i].vault}:${page1[i].holder}`),
  dom.cards
    .map((c, i) => (c.id === `${page1[i]?.vault}:${page1[i]?.holder}` ? null : `#${i}`))
    .filter(Boolean)
    .join(",") || "same order",
);

// ═══ L5 — the closed card ══════════════════════════════════════════════════
// THE FIXTURE IS DERIVED, NOT PASTED: an address this script's own sweep of the
// membership vault names, whose `balanceOf` this script reads as ZERO at the
// census block. Pasting one would make L5 a check about a constant.
let closedHolder = null;
if (MEMBERSHIP) closedHolder = ownParticipants.find((_, i) => ownBalances[i] === 0n) ?? null;
if (!MEMBERSHIP)
  for (const name of [
    "L5a the derived closed fixture holds ZERO at the page's own block",
    "L5b the closed card carries the CLOSED pill and no Shares or Claim figure",
    "L5c the closed card states 'Closed by' at this script's OWN last log block",
  ])
    skip(
      name,
      "no vault the census knows is small enough for this script to sweep whole, so no closed address could be derived from a swept set",
    );
else if (!closedHolder)
  for (const name of [
    "L5a the derived closed fixture holds ZERO at the page's own block",
    "L5b the closed card carries the CLOSED pill and no Shares or Claim figure",
    "L5c the closed card states 'Closed by' at this script's OWN last log block",
  ])
    skip(name, `every one of the ${ownParticipants.length} participants this script swept still holds a balance`);
else {
  const f5Route = await readRoute(`chain=${CHAIN}&vault=${MEMBERSHIP}&q=${closedHolder}&limit=5`);
  const f5Row = f5Route.data.find((r) => r.holder === closedHolder);
  const f5Own = await client.readContract({
    address: MEMBERSHIP,
    abi: VAULT_ABI,
    functionName: "balanceOf",
    args: [closedHolder],
    blockNumber: BigInt(f5Route.blockNumber ?? censusBlock),
  });
  check(
    "L5a the derived closed fixture holds ZERO at the page's own block",
    f5Row != null && f5Own === 0n,
    f5Row ? `${closedHolder}: balanceOf = ${f5Own}` : `${closedHolder} is not in the census`,
  );
  // Scoped to the holder in the topic filter, both directions. A whole-vault
  // sweep is already in hand for the membership vault, but the scoped read is
  // what a bigger vault would need and it is the same answer here.
  const pad32 = (a) => `0x${"0".repeat(24)}${a.toLowerCase().replace(/^0x/, "")}`;
  const from = CATALOG_BY_ADDRESS.get(MEMBERSHIP).createdBlock;
  const sent = await getLogs(MEMBERSHIP, [TRANSFER, pad32(closedHolder)], from, censusBlock);
  const recv = await getLogs(MEMBERSHIP, [TRANSFER, null, pad32(closedHolder)], from, censusBlock);
  const ownLast = [...sent, ...recv].reduce((m, l) => Math.max(m, Number(BigInt(l.blockNumber))), 0);

  const f5Dom = await readListingDom(`vault=${MEMBERSHIP}&q=${closedHolder}`);
  const f5Card = f5Dom.cards.find((c) => c.holder === closedHolder);
  check(
    "L5b the closed card carries the CLOSED pill and no Shares or Claim figure",
    f5Card != null &&
      f5Card.status === "closed" &&
      /CLOSED/.test(f5Card.text) &&
      !/Shares ·/.test(f5Card.text) &&
      !/Claim ·/.test(f5Card.text),
    f5Card ? f5Card.text.slice(0, 140) : "no card",
  );
  check(
    "L5c the closed card states 'Closed by' at this script's OWN last log block",
    f5Card != null &&
      /Closed by/.test(f5Card.text) &&
      f5Card.text.includes(`block ${n(ownLast)}`) &&
      Number(f5Card.lastBlock) === ownLast,
    `own last log block ${ownLast}, card says ${f5Card?.lastBlock}`,
  );
}

// ═══ L6 — the never-held vaults ════════════════════════════════════════════
// The roster drawer is where they are STATED, and a chain sweep is what proves
// the statement. Capped at eight sweeps: the claim is about the class and every
// one of them is a whole-life `eth_getLogs`.
if (neverHeldCensus.length === 0) {
  const why =
    `the census header carries no vault with zero participants — ${censusRows.length} of the catalogue's ` +
    `${CATALOG.length} rows have arrived and every one of them is held, so there is nothing for the roster to ` +
    `state as "no holder yet" and a green here would say nothing. Re-run when the tick has reached all ${CATALOG.length}.`;
  skip("L6a this script's own sweep confirms each never-held vault has NO Transfer logs at all", why);
  skip("L6b every never-held vault is STATED on the roster page as 'no holder yet'", why);
  skip("L6c a never-held vault contributes no row", why);
} else {
  const sample = neverHeldCensus.slice(0, 8);
  const withLogs = [];
  for (const c of sample) {
    const logs = await getLogs(c.vault, [TRANSFER], CATALOG_BY_ADDRESS.get(c.vault).createdBlock, censusBlock);
    if (logs.length !== 0) withLogs.push(`${c.symbol ?? c.vault}: ${logs.length} logs`);
  }
  check(
    "L6a this script's own sweep confirms each never-held vault has NO Transfer logs at all",
    withLogs.length === 0,
    withLogs.length
      ? withLogs.join(" · ")
      : `${sample.length} of ${neverHeldCensus.length} vaults swept, zero logs each`,
  );

  const rosterPage = await context.newPage();
  await rosterPage.goto(`${BASE}/base/morpho/vaults`, { waitUntil: "networkidle", timeout: 120_000 });
  await rosterPage.waitForSelector("[data-roster-panel] [data-vault-row]", { timeout: 120_000 });
  // Every catalogued vault has a roster row, but the ones holding nothing sit
  // in a collapsed group; opened here so the whole roster is readable.
  const emptyToggle = rosterPage.locator("[data-roster-panel] [data-empty-group] button");
  if ((await emptyToggle.count()) > 0) {
    await emptyToggle.click();
    await rosterPage.waitForSelector("[data-roster-panel] [data-empty-rows]", { timeout: 30_000 });
  }
  const statedNone = new Set(
    await rosterPage
      .locator("[data-roster-panel] [data-vault-row]:has([data-positions-none])")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-vault-row"))),
  );
  await rosterPage.close();
  const notStated = neverHeldCensus.filter((c) => !statedNone.has(c.vault));
  check(
    "L6b every never-held vault is STATED on the roster page as 'no holder yet'",
    notStated.length === 0 && statedNone.size === neverHeldCensus.length,
    notStated.length
      ? `${notStated.length} of ${neverHeldCensus.length} not stated, e.g. ${notStated[0].vault}`
      : `${statedNone.size} roster rows say "no holder yet", and the census counts ${neverHeldCensus.length}`,
  );
  const rowBad = [];
  for (const c of neverHeldCensus.slice(0, 8)) {
    const t = (await readRoute(`chain=${CHAIN}&vault=${c.vault}&limit=1&overlay=0`)).pagination.total;
    if (t !== 0) rowBad.push(`${c.symbol ?? c.vault}: ${t}`);
  }
  check("L6c a never-held vault contributes no row", rowBad.length === 0, rowBad.join(" · ") || "zero rows each");
}

// ═══ L7 — a search inserts nothing ═════════════════════════════════════════
// The absent address is DERIVED from L1's own sweep: an address this script has
// proven is not in the membership vault's participant set. A pasted burn
// address would not do — on Ethereum's sibling `0x…dead` turned out to be a
// real participant, and the check built on that premise would have gone red on
// a correct route.
if (!MEMBERSHIP) {
  const why =
    "no vault the census knows is small enough for this script to sweep whole, so no address could be PROVEN absent from a swept set";
  skip("L7a this script's own sweep proves the searched address is NOT a participant of the fixture", why);
  skip("L7b the search answers zero rows, twice, and inserts nothing", why);
  skip("L7c the listing says an address the census has never seen has no row and records nothing", why);
} else {
  // Walked rather than pasted: the first low address this script's own sweep
  // does not name. `0x…0001` and friends are where dead shares end up on this
  // chain, so being absent is a thing to establish, not to assume.
  const candidates = Array.from({ length: 32 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}`);
  const ABSENT = candidates.find((a) => !ownSet.has(a));
  check(
    "L7a this script's own sweep proves the searched address is NOT a participant of the fixture",
    ABSENT != null && !ownSet.has(ABSENT),
    `${ABSENT} absent from the ${ownSet.size} participants swept`,
  );
  const totalBefore = (await readRoute(`chain=${CHAIN}&limit=1&overlay=0`)).pagination.total;
  const miss1 = await readRoute(`chain=${CHAIN}&vault=${MEMBERSHIP}&q=${ABSENT}&limit=5`);
  const miss2 = await readRoute(`chain=${CHAIN}&vault=${MEMBERSHIP}&q=${ABSENT}&limit=5`);
  const totalAfter = (await readRoute(`chain=${CHAIN}&limit=1&overlay=0`)).pagination.total;
  check(
    "L7b the search answers zero rows, twice, and inserts nothing",
    miss1.pagination.total === 0 &&
      miss1.data.length === 0 &&
      miss2.pagination.total === 0 &&
      miss2.data.length === 0 &&
      totalAfter === totalBefore,
    `${miss1.pagination.total}/${miss2.pagination.total} rows · chain total ${totalBefore} → ${totalAfter}`,
  );
  const searchStated = /never seen has no row here/.test(dom.info) && /records nothing about the search/.test(dom.info);
  check(
    "L7c the section's about page says an address the census has never seen has no row and records nothing",
    searchStated,
    searchStated
      ? "/base/morpho/vaults/info states it"
      : `/base/morpho/vaults/info does not: "never seen has no row here" ${/never seen has no row here/.test(dom.info)}, "records nothing about the search" ${/records nothing about the search/.test(dom.info)}`,
  );
}

// ═══ L8 — one holder, one card per vault ═══════════════════════════════════
// The holder is DERIVED: the address the resting page names most often, which
// is a fact about what the census holds rather than a pinned constant.
const holderCounts = new Map();
for (const r of page1) holderCounts.set(r.holder, (holderCounts.get(r.holder) ?? 0) + 1);
const multiHolder = [...holderCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? page1[0]?.holder;
const f8 = await readRoute(`chain=${CHAIN}&q=${multiHolder}&limit=20`);
const heldVaults = [...new Set(f8.data.map((r) => r.vault))];
const f8Own = await client.multicall({
  contracts: f8.data.map((r) => ({ address: r.vault, abi: VAULT_ABI, functionName: "balanceOf", args: [r.holder] })),
  blockNumber: BigInt(censusBlock),
  allowFailure: false,
});
const liveMismatch = f8.data.filter((r, i) => r.census.live !== f8Own[i] > 0n);
check(
  "L8a every card for one holder states the live flag this script's own balanceOf gives at the census block",
  f8.data.length > 0 && liveMismatch.length === 0,
  liveMismatch.length
    ? liveMismatch.map((r) => `${r.vault}/${r.holder}`).join(", ")
    : `${f8.data.length} cards across ${heldVaults.length} vaults`,
);
const f8Dom = await readListingDom(`q=${multiHolder}`);
const hrefBad = f8Dom.cards.filter((c) => c.href !== `/base/morpho/vaults/${c.vault}/${c.holder}`);
check(
  "L8b every card links to that pair's own position page",
  f8Dom.cards.length > 0 && hrefBad.length === 0,
  hrefBad.length ? hrefBad.map((c) => c.href).join(" · ") : `${f8Dom.cards.length} cards linked`,
);

// ═══ L9 — copy ═════════════════════════════════════════════════════════════
// The register rules are the SECTION's, not one page's: they run over the
// listing's own face AND the prose that moved to /base/morpho/vaults/info, so a
// forbidden word does not stop being the section's because it is one route
// along.
const body = `${dom.body} ${dom.info}`.trim();
check(
  "L9a no 'you' / 'your' / 'depositor' anywhere on the listing",
  !/\byou\b|\byour\b|\bdepositor/i.test(body),
  (body.match(/\byou\b|\byour\b|\bdepositor\w*/gi) ?? []).join(", ") || "none",
);
// Since mig 206 a card carries ONE dollar figure — its Value · USD stat, the
// census's oracle read at the census block — so the copy rule is no longer "no
// dollar sign" but "no dollar figure that is not that stat": every `$` on the
// page is accounted for by an open, priced card, and none is anywhere else.
const dollarFigures = (body.match(/\$\s?\d[\d,.]*[kMB]?/g) ?? []).length;
const pricedOpenCards = dom.cards.filter((c) => c.status === "live" && c.valueUsdE8).length;
check(
  "L9b the only dollar figures on the listing are the open cards' Value · USD stats",
  dollarFigures === pricedOpenCards,
  `${dollarFigures} dollar figure(s) on the page, ${pricedOpenCards} open priced card(s)`,
);
// The figure AND the period together — the shape a real violation takes. A page
// that says "no rate" is refusing the thing, not committing it.
check(
  "L9c no APY, no annualised figure and no rate of return",
  !/\bAPY\b/i.test(body) && !/[\d.]+\s?%\s?(APY|a year|per year|annual)/i.test(body),
  (body.match(/\bAPY\b|[\d.]+\s?%\s?(APY|a year|per year|annual)/gi) ?? []).join(", ") || "none",
);
// ⚠️⚠️ THE CURATOR NAMES ARE DERIVED FROM THE CATALOGUE, not written down here.
// A MetaMorpho vault's on-chain `name()` leads with its curator ("Gauntlet USDC
// Prime", "Steakhouse Prime USDC", "Re7 USDC"), and the registry names four
// apps. A card must carry none of them: what it states is the vault's SYMBOL,
// the family word, the holder's address and the MECHANISM its address is. The
// mechanism vocabulary is the one excuse, and it too is derived — from
// `VAULT_SHAPE_WORD` — so a name excused here is one the charter itself uses.
const SHAPE_WORDS = (() => {
  const src = fs.readFileSync(path.join(ROOT, "lib/aave-vaults/vault-position.ts"), "utf8");
  const map = src.match(/VAULT_SHAPE_WORD: Record<VaultPositionShape, string \| null> = \{([\s\S]*?)\};/)?.[1];
  if (!map) throw new Error("vault-position parse: no VAULT_SHAPE_WORD map");
  const words = [...map.matchAll(/:\s*"([^"]+)"/g)].map((m) => m[1]);
  if (words.length === 0) throw new Error("vault-position parse read no shape words");
  return new Set(words);
})();
/** The four apps the retired provider registry named. PINNED here rather than
 *  parsed, because lib/shared/vault-providers.ts went with the find door it was
 *  written for (rails-ops decision 0028). The copy rule outlives the registry:
 *  a card states the vault's SYMBOL, the family word, the holder's address and
 *  the MECHANISM its address is — never the name of an app a deposit was made
 *  through, because no chain read on these surfaces identifies one. */
const APP_NAMES = ["Coinbase", "MetaMask", "Uniswap", "Safe"];
/** The FAMILY word the card wears beside the share symbol — "MetaMorpho vault"
 *  — read out of the card's own source rather than written down here. It is a
 *  VENUE, not a curator: two catalogued vaults happen to be NAMED "MetaMorpho
 *  Test" and "WETH TEST DA" on chain, so the first-word derivation below picks
 *  up both words, and the family word and the asset symbol are the two chain
 *  strings a card legitimately states. */
const FAMILY_WORDS = (() => {
  const src = fs.readFileSync(path.join(ROOT, "components/vaults/vault-position-card.tsx"), "utf8");
  const map = src.match(/const FAMILY_SINGULAR: Record<VaultPositionFamily, string> = \{([\s\S]*?)\};/)?.[1] ?? "";
  const own = [...map.matchAll(/:\s*"([^"]+)"/g)].map((m) => m[1]);
  const shared = fs.readFileSync(path.join(ROOT, "components/vaults/aave-vault-format.ts"), "utf8");
  const sharedMap = shared.match(/AAVE_FAMILY_SINGULAR: Record<AaveVaultFamily, string> = \{([\s\S]*?)\};/)?.[1] ?? "";
  const words = [...own, ...[...sharedMap.matchAll(/:\s*"([^"]+)"/g)].map((m) => m[1])];
  if (words.length === 0) throw new Error("vault-position-card parse read no family words");
  // Each family word is a phrase; every token in it is excused, so "MetaMorpho
  // vault" excuses "MetaMorpho" without excusing an unrelated sentence.
  return new Set(words.flatMap((w) => [w, ...w.split(/\s+/)]));
})();
const VALUE_LABELS = (() => {
  const src = fs.readFileSync(path.join(ROOT, "components/vaults/vault-position-card.tsx"), "utf8");
  const labels = [...src.matchAll(/label: "(Value · [^"]+)"/g)].map((m) => m[1]);
  if (labels.length === 0) throw new Error("vault-position-card parse read no Value label");
  return labels;
})();
const CURATOR_NAMES = [
  ...new Set([
    // The first word of every catalogued vault's own name, where it reads as a
    // name rather than a unit: that is where a MetaMorpho curator puts itself.
    ...CATALOG.map((r) => r.name.trim().split(/\s+/)[0]).filter((w) => /^[A-Za-z][A-Za-z0-9'&.-]{2,}$/.test(w)),
    ...APP_NAMES,
  ]),
].filter((w) => !SHAPE_WORDS.has(w) && !FAMILY_WORDS.has(w));
const nameLeaks = [];
const excusedOnCards = new Set();
for (const card of dom.cards) {
  // TWO chain strings are set aside before the search, and both are DERIVED
  // from what this card is about rather than written down: the vault's own
  // SYMBOL, which leads the card, and its ASSET's symbol, which labels the
  // Claim column. Neither is an attribution — they are what the two contracts
  // call themselves — and 289 first words of catalogued vault names include
  // "WETH" because one vault is named "WETH TEST DA".
  // …and since mig 206 the card's own Value column label, read out of the
  // card's source ("Value · USD"): a catalogued vault is NAMED "USD …", so the
  // first-word derivation carries "USD", and the label is a unit, not a name.
  const strip = [card.vaultSymbol, assetOf.get(card.vault)?.symbol, ...VALUE_LABELS].filter(Boolean);
  // …and the holder's own ENS name, whatever it is. It is set aside for the
  // same reason the two symbols are: it is what that address calls itself on
  // chain, not an attribution Rails made. One real holder of a catalogued vault
  // is `morpho-association.eth`, and `\bmorpho\b` matches across the hyphen —
  // so without this the rule reads a holder's own name as a curator leak.
  let text = card.text.replace(/\b[a-z0-9][a-z0-9-]*\.eth\b/gi, " ");
  for (const token of strip) {
    if (text.includes(token)) excusedOnCards.add(token);
    text = text.split(token).join(" ");
  }
  for (const name of CURATOR_NAMES)
    if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text))
      nameLeaks.push(`${card.id} names ${name}`);
}
check(
  `L9d no curator and no app is named inside a position card (${CURATOR_NAMES.length} names derived from the catalogue and the registry)`,
  nameLeaks.length === 0,
  nameLeaks.slice(0, 3).join("; ") ||
    `${dom.cards.length} cards clean; excused only the family word and each card's own two chain symbols (${[...excusedOnCards].join(", ")})`,
);
// Every date on the page must be the en-GB UTC form ("8 Sept 2026"), never a
// runtime-locale one ("Sep 8, 2026" / "08/09/2026").
const badDates = body.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b|\b[A-Z][a-z]{2} \d{1,2}, \d{4}\b/g) ?? [];
check("L9e every date is the en-GB UTC form", badDates.length === 0, badDates.join(", ") || "no runtime-locale dates");

// ═══ L10 — the census block line ═══════════════════════════════════════════
// One block reads "block N"; several read "blocks A to B" — the page's own
// rule, restated here from the rows so the line is held to what they carry.
const expectedBlockLine =
  censusBlocks.length === 1
    ? `block ${n(censusBlocks[0])}`
    : `blocks ${n(censusBlocks[0])} to ${n(censusBlocks[censusBlocks.length - 1])}`;
check(
  "L10 the census line states exactly the blocks the route's census rows carry, in the census slot",
  dom.stance.includes(`census at ${expectedBlockLine}`),
  `the line reads "${dom.stance.slice(0, 160)}" — expected "census at ${expectedBlockLine}" from ${censusRows.length} census rows over ${censusBlocks.length} block(s)`,
);

// ═══ L11 — SSR under a filter ══════════════════════════════════════════════
if (!MEMBERSHIP) {
  skip(
    "L11 the filtered URL carries the fixture's rows in the INITIAL HTML",
    "no vault the census knows is small enough for this script to sweep whole, so there is no fixture to filter on",
  );
} else {
  const ssr = await listingHtml(`vault=${MEMBERSHIP}`);
  check(
    "L11 the filtered URL carries the fixture's rows in the INITIAL HTML",
    ssr.status === 200 &&
      countMatches(ssr.html, "data-position-card") === Math.min(20, membershipRows.length) &&
      countMatches(ssr.html, `data-vault="${MEMBERSHIP}"`) === Math.min(20, membershipRows.length),
    `${countMatches(ssr.html, "data-position-card")} cards, the fixture has ${membershipRows.length} participants`,
  );
}

// ═══ L12 — the links in ════════════════════════════════════════════════════
async function linksOn(url) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  const hrefs = await page
    .locator('[data-link="vault-positions"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  await page.close();
  return hrefs;
}
// The roster is the VAULTS tab's landing page — /base/morpho/vaults — and the
// section rail — so its links are read there, with no click needed.
// `[data-roster-panel]` is the same wrapper the drawer used, kept deliberately,
// so every selector under it is unchanged.
async function rosterLinks() {
  const page = await context.newPage();
  await page.goto(`${BASE}/base/morpho/vaults`, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForSelector("[data-roster-panel] [data-vault-row]", { timeout: 120_000 });
  // The vaults that hold nothing at this block sit in a collapsed group, and a
  // vault every holder has left is one of them while its closed positions are
  // still rows the census knows: open the group, or five held vaults' links
  // are invisible to this read (2026-09-09, on the full 509-vault census).
  const emptyToggle = page.locator('[data-roster-panel] [data-empty-group] button[aria-expanded="false"]');
  if ((await emptyToggle.count()) > 0) {
    await emptyToggle.first().click();
    await page.waitForSelector("[data-roster-panel] [data-empty-group] [data-vault-row]", { timeout: 60_000 });
  }
  const hrefs = await page
    .locator("[data-roster-panel] [data-positions-link]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  await page.close();
  return hrefs;
}
const rosterHrefs = await rosterLinks();
const heldCensus = censusRows.filter((c) => c.participants > 0);
const rosterMissing = heldCensus.filter((c) => !rosterHrefs.includes(`/base/morpho/vaults/positions?vault=${c.vault}`));
check(
  "L12a the roster page links every held vault to the listing filtered to it",
  heldCensus.length > 0 && rosterMissing.length === 0,
  rosterMissing.length
    ? `${rosterMissing.length} of ${heldCensus.length} unlinked, e.g. ${rosterMissing[0].vault}`
    : `${rosterHrefs.length} links on /base/morpho/vaults for ${heldCensus.length} held vaults`,
);
const marketLinks = await linksOn(`${BASE}/base/morpho/vaults/${F_MARKET}`);
check(
  "L12b the market view links to the listing filtered to it",
  marketLinks.includes(`/base/morpho/vaults/positions?vault=${F_MARKET}`),
  marketLinks.join(", ") || "no link",
);
const positionLinks = await linksOn(`${BASE}/base/morpho/vaults/${page1[0].vault}/${page1[0].holder}`);
check(
  "L12c the position page links to the listing filtered to its own vault",
  positionLinks.includes(`/base/morpho/vaults/positions?vault=${page1[0].vault}`),
  positionLinks.join(", ") || "no link",
);

// ═══ L14 — the rail the listing wears ═════════════════════════════════════
// A vault is never a roster row; the protocol whose factory deployed it is
// (rails-ops decision 0028). So Base's vault surfaces wear Morpho Blue Base's
// own RailHeader, and the chain-scoped section's mark is gone from this chain —
// a mark still drawn here would be a door to a section that no longer exists.
const idOnListing = dom.identity;
check(
  "L14a the listing draws exactly one Morpho Blue Base rail and no Vaults-section mark",
  idOnListing.length === 1 && dom.sectionMark === 0,
  `${idOnListing.length} rail(s), ${dom.sectionMark} section mark(s)`,
);
const idOnPosition = await (async () => {
  const page = await context.newPage();
  await page.goto(`${BASE}/base/morpho/vaults/${page1[0].vault}/${page1[0].holder}`, {
    waitUntil: "networkidle",
    timeout: 120_000,
  });
  const rails = await page.locator('nav[aria-label="Explorer sections"]').count();
  const marks = await page.locator("[data-vaults-identity]").count();
  await page.close();
  return { rails, marks };
})();
check(
  "L14b and so does a position page under the roster",
  idOnPosition.rails === 1 && idOnPosition.marks === 0,
  `${idOnPosition.rails} rail(s), ${idOnPosition.marks} section mark(s)`,
);

// The explorer's four slots are one row (components/shared/rail-header.tsx):
// the position listing, each sub-page in roster order, then the (i). A href is
// read off the DOM and then FETCHED — a tab pointing at a 404 is the failure
// this is for, and a link check that only compared strings could not see it.
// The VAULTS tab is the lit one: this listing is a route UNDER that sub-page.
const railPage = await context.newPage();
await railPage.goto(LISTING, { waitUntil: "networkidle", timeout: 120_000 });
const rail = await railPage.locator('nav[aria-label="Explorer sections"]').evaluateAll((navs) =>
  navs.map((nav) =>
    Array.from(nav.querySelectorAll("a")).map((a) => ({
      href: a.getAttribute("href"),
      label: a.getAttribute("aria-label"),
      link: a.getAttribute("data-link"),
      current: a.getAttribute("aria-current"),
    })),
  ),
);
const railLinks = rail[0] ?? [];
const railStatus = [];
for (const l of railLinks) {
  const r = await fetch(`${BASE}${l.href}`, { redirect: "manual" });
  railStatus.push(`${l.href} ${r.status}`);
}
const wantedTabs = ["/base/morpho", "/base/morpho/markets", "/base/morpho/vaults", "/base/morpho/info"];
const infoTab = railLinks.find((l) => l.label === "About this explorer");
const litTabs = railLinks.filter((l) => l.current === "page");
check(
  "L14c the listing draws ONE explorer rail whose four tabs each resolve, with the (i) door named, and VAULTS lit",
  rail.length === 1 &&
    railLinks.length === 4 &&
    wantedTabs.every((w) => railLinks.some((l) => l.href === w)) &&
    infoTab?.href === "/base/morpho/info" &&
    railStatus.every((st) => st.endsWith(" 200")) &&
    litTabs.length === 1 &&
    litTabs[0].href === "/base/morpho/vaults",
  `${rail.length} rail(s), ${railLinks.length} tabs · ${railStatus.join(", ")} · lit: ${litTabs.map((l) => l.href).join(",") || "none"}`,
);
await railPage.close();

// The face is the figures it read and nothing else. All three of these were on
// it before the chrome moved — the "How this listing is built" drawer, the
// roster drawer, and the provenance inspector's toggle — and each is asserted
// ABSENT by the selector it actually rendered under.
check(
  "L14d the listing face carries no intro drawer, no roster drawer and no provenance inspector",
  dom.introOnFace === 0 && dom.roster === 0 && dom.inspector === 0,
  `[data-intro-drawer] ${dom.introOnFace}, [data-roster-drawer] ${dom.roster}, button.prov-inspect-toggle ${dom.inspector}`,
);

// ⚠️ THE THREE-BLOCKS PARAGRAPH NAMES NO BLOCK OF ITS OWN. In the drawer it
// could: the drawer rode the same response as the cards, so the `finalized`
// distance it stated was the one that lane answered for those cards. This page
// reads no position and no overlay, so a block number here would be a different
// request's answer wearing the listing's words. The check is the absence of a
// comma-grouped block figure — the form every block on this section is printed
// in — inside that paragraph alone, so the sampled distance ("between 643 and
// 795 blocks behind head") stays admissible and a re-stated block does not.
const blockFigures = info.blocks.match(/\b\d{1,3}(?:,\d{3})+\b/g) ?? [];
check(
  "L14e the about page's three-blocks paragraph states the mechanism and names no block of its own",
  /Three blocks/.test(info.blocks) && /finalized/.test(info.blocks) && blockFigures.length === 0,
  info.blocks
    ? blockFigures.length
      ? `the paragraph names ${blockFigures.join(", ")}`
      : `${info.blocks.length} chars, no block figure`
    : "no [data-intro-blocks] paragraph on /base/morpho/vaults/info",
);

// ═══ L13 — the phone, and the route's own skeleton ════════════════════════
// The assertion is the DOCUMENT's own width against the viewport's, which is
// the reader's experience of it, rather than any one element's box.
const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
const phonePage = await phone.newPage();
await phonePage.goto(LISTING, { waitUntil: "networkidle", timeout: 120_000 });
const phoneWidth = await phonePage.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}));
await phonePage.close();
await phone.close();
check(
  "L13a the listing does not scroll sideways at 390px",
  phoneWidth.scrollWidth === 390,
  `document.scrollWidth ${phoneWidth.scrollWidth} at a 390px viewport (client ${phoneWidth.clientWidth})`,
);

// The route is `force-dynamic` and its first paint waits on a census round
// trip, so a click into it paints nothing without a boundary to prefetch to.
const loadingPath = path.join(ROOT, "app", "(app)", "base", "morpho", "vaults", "(views)", "loading.tsx");
const loadingSrc = fs.existsSync(loadingPath) ? fs.readFileSync(loadingPath, "utf8") : "";
check(
  "L13b the listing route has a loading.tsx that renders ListingRouteLoading",
  /<ListingRouteLoading\s*\/>/.test(loadingSrc) &&
    /from "@\/components\/shared\/listing-route-loading"/.test(loadingSrc),
  loadingSrc
    ? "app/(app)/base/morpho/vaults/(views)/loading.tsx → <ListingRouteLoading />"
    : "no loading.tsx in the listing's (views) group",
);

await browser.close();
// The L3 partition pass alone reads the route about 1,533 times, so a read
// that only answered on its second attempt scrolls a thousand lines out of
// sight. A green run that needed retries is a different fact from a green run
// that did not, and the verdict says which (TO-DO-ui-jobs §38).
if (retriedReads.length)
  console.log(
    `\n⟳ ${retriedReads.length} route read${retriedReads.length === 1 ? "" : "s"} needed a retry: ` +
      retriedReads.map((r) => `${r.status}×${r.attempts - 1} on ${r.qs}`).join(" · "),
  );
console.log(`\n${passes}/${passes + failures} checks passed${skipped ? ` · ${skipped} SKIP` : ""}`);
process.exit(failures ? 1 : 0);
