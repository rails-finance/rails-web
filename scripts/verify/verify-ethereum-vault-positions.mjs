#!/usr/bin/env node
// The vault POSITION listing on Ethereum, checked against the chain rather than
// against itself. /ethereum/aave/vaults — the section route IS this listing.
// ----------------------------------------------------------------------------
// EVERY EXPECTED FIGURE HERE IS THIS SCRIPT'S OWN CHAIN READ. The listing states
// two blocks — the census block its membership was swept to, and the block its
// live overlay was read at. This script then makes its OWN whole-`Transfer`
// sweep of a small vault to the census block, builds its OWN participant set,
// proves that set whole with its OWN Σ `balanceOf` == `totalSupply()`, and
// asserts the route's rows for that vault are EXACTLY it. It makes its OWN
// `balanceOf`, `convertToAssets` and `totalSupply` at the overlay's block and
// asserts every figure on the first page against them, in raw units from the
// route AND in formatted text from the rendered DOM. The only things taken from
// the page are the two blocks, which are checks L0's own subject.
//
// AN EXPECTATION NEVER COMES FROM THE THING UNDER TEST. Membership is not
// compared against the backend's own count: it is compared against a set this
// script swept. The facet partitions are compared against each other and
// against the chain total, so a filter that quietly drops rows cannot pass. The
// fixtures below are INPUTS — which vault, which address, which shape of life —
// never expected figures.
//
// ⚠️ A FIXTURE THAT HAS CHANGED STATE IS A FAILURE, NEVER A SKIP. L5's closed
// fixture must still hold zero and L8's multi-vault holder must still hold
// several, asserted by this script's own `balanceOf` at the census block. A
// fixture that moved makes every check resting on it green-but-vacuous.
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
//   BASE=http://localhost:3762 node scripts/verify/verify-ethereum-vault-positions.mjs
// Needs ALCHEMY_URL in .env.local (read, never printed).
//
// ── 2026-09-08 · THE LISTING IS THE SECTION ROUTE ──────────────────────────
// Moved from /ethereum/aave/vaults/positions to /ethereum/aave/vaults (the `positions`
// segment is deleted, no redirect). L8b's card links are the position PATH;
// L12a reads the roster's own links inside the listing's drawer, which is where
// the roster went. 44/44, unchanged.
//
// ── WHAT EACH SECTION ASSERTS ────────────────────────────────────────────────
//   L0  the listing answers 200, its INITIAL HTML (not the RSC payload) carries
//       a full page of [data-position-card] rows and no rendered skeleton, and
//       the route's overlay block is within 30 blocks of this script's own head
//   L1  membership is the chain's: this script's own whole-Transfer sweep of
//       F1 to the census block, its own participant set and its own wei-exact
//       Σ balanceOf == totalSupply, asserted to be EXACTLY the route's F1 rows
//       — no more, no fewer — with live / transferCount / firstBlock /
//       lastBlock each matching this script's own count
//   L2  the overlay is live: every card's shares, claim and totalSupply equal
//       this script's own reads at the route's own block, wei-exact; and the
//       DOM prints those same figures through the section's own print rules
//   L3  the facets partition: live + closed == unfiltered per vault, Σ family
//       == the chain total, Σ shape == the chain total, and the vault menu
//       carries the whole catalogue with the never-held ones marked
//   L4  sorts: shares desc is descending by RAW balance (which is what the
//       backend orders and what the page says it orders), lastActivity desc is
//       descending by last block, and the DOM's order is the API's order
//   L5  the closed card (F4): no Shares and no Claim figure in the DOM, the
//       CLOSED pill, and "closed by" naming this script's own last log block
//   L6  F9: each never-held vault is STATED on the listing with its census
//       block, and none of them contributes a row
//   L7  F10: an address this script's own sweep proves is not in F1's set
//       answers zero rows; a second identical request answers zero again and
//       the chain-wide total is unchanged — nothing was inserted by a search
//   L8  F11: one holder, one card per vault it holds, each linking to that
//       vault's own page opened on that holder
//   L9  copy: no "you"/"your", no "depositor", no USD, no APY and no rate of
//       return, no app named on any card, and every date in the en-GB UTC form
//  L10  the census line on the listing states every census block the route
//       returned, in its "census at …" slot
//  L11  SSR: the filtered URL ?vault=<F1> carries F1's rows in the INITIAL HTML
//  L12  links: the roster page (/ethereum/aave/vaults) and F2's vault page
//       both carry a link to the listing filtered to that vault
//  L13  the UI-alignment pass: the headline figures are COMPACT on the face
//       and exact on their `title`, at least one of them is really shortened,
//       the vault symbol leads the card in DOM order with the holder pill
//       after it, the document does not scroll sideways at 390px, and the
//       route has a `loading.tsx` that mounts the shared listing skeleton
//  L14  the section rail on the listing: four tabs that each resolve 200, the
//       find and (i) doors named, POSITIONS lit — and the listing face
//       carrying no intro drawer, no roster drawer and no inspector toggle
//
// ── 2026-09-09 · THE SECTION CHROME MOVED OFF THE FACE ─────────────────────
// The listing's two drawers became two pages and the four surfaces became one
// rail row. The claims did not change; the surfaces they are read off did:
//
//   • The "How this listing is built" prose is /ethereum/aave/vaults/info, the (i)
//     in the rail. `readInfoDom` reads it there, with innerText — it is a
//     VISIBLE page body now, not a mounted-and-hidden panel, so the old
//     textContent trick would be reading a node under a claim that no longer
//     describes it. L4b, L6b and L7c assert on it; L9's register rules run
//     over the listing face AND that page.
//   • The roster of vaults is /ethereum/aave/vaults, the VAULTS tab.
//     L12a goes there instead of clicking a drawer open; `[data-roster-panel]`
//     and `[data-vault-row]` are unchanged inside it.
//   • L14c and L14d are new: the rail is checked as a rail (every tab fetched,
//     one lit), and the face is checked for the ABSENCE of all three things
//     that used to sit on it.
//
// ── PROVED IT CAN FAIL, 2026-09-09, BASE=http://localhost:3010 ─────────────
// Restored run: 53/53. Two breaks, applied ONE AT A TIME and reverted.
//
//  L  THE MOVED CLAIM. `<p data-intro-search>` deleted from
//     app/(app)/ethereum/aave/vaults/(views)/info/page.tsx — the paragraph L7c
//     followed off the listing's face and onto the about page. 52/53.
//     FAIL L7c — '/ethereum/aave/vaults/info does not: "never seen has no row"
//                 false, "records nothing about the search" false'
//     🔑 The detail names WHICH half of the claim is missing, which is what a
//     one-paragraph deletion has to say to be worth reading. L4b and L6b
//     stayed GREEN and that is right: they rest on their own paragraphs, and
//     the reader itself still found exactly one `[data-intro-drawer]`.
//
//  M  AN ABSENCE CHECK THAT COULD NOT SEE. L14d's `introOnFace` counter
//     pointed at `[data-stance]` — a selector that IS on the listing face — to
//     prove the assertion bites rather than passing on a selector that can
//     never match. 52/53.
//     FAIL L14d — "[data-intro-drawer] 1, [data-roster-drawer] 0,
//                  button.prov-inspect-toggle 0"
//     🔑 This is the trap an absence check walks into (memory
//     `verifier-cannot-fail-traps`): a zero count proves nothing unless the
//     selector is one the page could carry. Each of the three is a selector
//     the section really rendered before this change.
//
// ── FIXTURES RE-PINNED, 2026-09-08 (the plan's §5 measured before Phase 1) ───
//   • F10 was `0x…dead` on the grounds that it is "not a participant". IT IS
//     ONE: the census has it holding 1,149,177,275,636,312 of stkwaEthWETH.v1
//     at block 25,932,054, live. A check built on the plan's premise would have
//     been green-but-vacuous the other way — it would have gone red on a
//     correct route. L7 now derives its absent address from L1's OWN sweep: an
//     address the script has proven is not in F1's participant set.
//   • F11 was "one holder in 5 vaults". It is in EIGHT at this census
//     (waEthUSDe, waEthWETH, waEthRLUSD, sGho, waEthUSDtb, waEthUSDC,
//     waEthUSDT, waEthPYUSD). L8 asserts the count against this script's own
//     balanceOf sweep rather than against the plan's number.
//
// ── PROVED IT CAN FAIL, 2026-09-08, BASE=http://localhost:3762 ─────────────
// Restored run: 44/44. Five breaks, applied one at a time and reverted; the
// exact red lines are below. Nothing on this path is cached beyond the proxy's
// 60s listing header and the catalogue's five minutes, and neither carries a
// figure a break here forges, so no cache had to be cleared between them.
//
//  A  the proxy dropped one participant from every page it forwards
//     (`rows.shift()` after the reshape in app/api/vaults/positions/route.ts).
//     34/43 (before L2f existed).
//     FAIL L1b — "route 20, own 21, missing 0x1f2f10d1c40777ae1da742455c65828ff36df387"
//     FAIL L0b — "19 cards in the server's own HTML"
//     FAIL L2d — "19 cards"
//     FAIL L4c, FAIL L11 — "19 cards, F1 has 20 participants (6 live)"
//     FAIL L5a — "the fixture is not in the census"
//     FAIL L5b — "no card"; FAIL L5c — "card says undefined"
//     FAIL L8a — "own live in 8 vaults · route 7 cards, missing 0x5f9d…a575b"
//     🔑 The blast radius is the point: membership is one lane, so a break in
//     it goes red on the set check AND on every fixture that rode the set.
//
//  B  the overlay returned the CENSUS balance as the live figure
//     (`amount(BigInt(r.census.balance), shareDecimals)`), which is the plan's
//     stronger form of "the overlay read latest instead of the pin".
//     ⚠️ ON THE FIRST ATTEMPT THIS BREAK WAS INVISIBLE: 43/43 green. Measured
//     at the time, 0 of the top 20 rows on ANY of the four sorts had changed
//     balance in the 170 blocks between the census and the overlay, so the two
//     lanes carried the same number and L2a–L2c could not tell them apart.
//     That is a cannot-fail trap, and L2f was written to close it: it finds an
//     address whose balance THIS SCRIPT reads differently at the two blocks,
//     and SKIPs out loud when the window really is quiet. With L2f in place:
//     42/44.
//     FAIL L2a — "0xd4fa…d23e/0x6bf1…8aa6: page 49434153246660"
//     FAIL L2f — "0x6bf1…8aa6/0x2ba9…f823: census 872556644 @ 25932054,
//                 page 872556644 @ 25932231, own 0 @ 25932231"
//
//  C  the closed card drew no "Closed by" figure (its column list cut to
//     `[transfersColumn]`). 43/44.
//     FAIL L5c — "own last log block 25399204, card says 25399204"
//     🔑 The detail line reads as agreement and the check is red anyway,
//     which is correct: L5c asserts the DOM SAYS the block as well as
//     carrying it in its data attribute, and the break removed the words.
//     🔑 L5b stayed GREEN, and that is right: it asserts the ABSENCE of
//     Shares and Claim, which the break did not touch. An absence check
//     cannot see a second absence.
//
//  D  the proxy "inserted" on a search: a searched address that answered no
//     rows came back as a fabricated row with a zero balance, counted in the
//     filtered total. 43/44.
//     FAIL L7b — "1/1 rows · chain total 11837 → 11837"
//     🔑 The chain-wide total was UNCHANGED under the break — a fabricated row
//     is not a stored one — so the half of L7b that watches the total stayed
//     true and only the row count caught it. Both halves are kept: a real
//     insert would move the total, and a fabricated row would not.
//
//  E  the SSR page reversed the rows it handed the client
//     (`r.data.slice().reverse()` in page.tsx). 42/44.
//     FAIL L4d — "#0,#1,#2,#3,…,#19"
//     FAIL L4c — "20 route rows and 20 rendered rows, newest activity first
//                 with no sort in the URL"
//     🔑 The pair is deliberate: L4d compares the DOM against the API's order
//     and L4c asserts the DOM's own blocks descend, so a page that reversed
//     BOTH lanes together would still go red on L4c.
//
// ── 2026-09-08 · THE UI-ALIGNMENT PASS (audit §4 items 1, 6, 7, 8) ─────────
// The card now leads with the vault symbol, carries `PositionCardMeta` instead
// of a Transfers stat column, and states its headline figures compactly with
// the exact value on `title=`; the route grew a `loading.tsx`. Five checks
// joined (L2e0, L13a–L13f) and two were restated (L0c, L2e). 44/44 → 51/51.
//
// ⚠️ L2e AND L13a/b NOW READ THE CHAIN AT THE BLOCK THE CARD NAMES, not the
// route JSON captured minutes earlier at L0. The two are separate requests at
// separate blocks and a wrapper's balance moves between them: measured this
// run, `waEthUSDC`/0xde6e… differed by 7.6 units, which a wei-exact title
// comparison against the route would have called a bug. Compact text hid the
// same drift, so the FORMATTED half of the old L2e was passing for a reason
// that had nothing to do with the figures agreeing.
//
// ── PROVED IT CAN FAIL, 2026-09-08, BASE=http://localhost:3791 ─────────────
// Restored run: 51/51. Six breaks, applied ONE AT A TIME and reverted; the
// exact red lines follow.
//
//  F  the listing's `renderCard` dropped `compact`
//     (`<VaultPositionCard row={row} />` in vault-positions-listing.tsx). 49/51.
//     FAIL L13a — '0xde6e08ac208088cc62812ba30608d852c6b0ecbc Shares · waEthUSDC:
//                  card "10,455,240.617366", own "10.5M"'
//     FAIL L13e — "document.scrollWidth 394 at a 390px viewport (client 390)"
//     🔑 The pair is the whole point of the item: the compact rule is not a
//     taste change, it is what stops the document scrolling sideways on a
//     phone. L13b stayed GREEN — the title was untouched — and that is right.
//
//  G  the shares title carried the PRINTED figure rather than the exact one
//     (`title={shareText(...)}` in vault-position-card.tsx). 50/51.
//     FAIL L13b — 'Shares · waEthUSDC: title "10,455,240.617366 waEthUSDC",
//                  own "10455240.617366 waEthUSDC"'
//     🔑 L13a stayed GREEN: the face still printed the right thing. A compact
//     face is only admissible because the exact value is one hover away, so
//     the two halves are checked separately.
//
//  H  the holder pill put back in front of the vault symbol (the two nodes
//     swapped inside `leadingIdentity`). 50/51.
//     FAIL L13d — "0x056b269eb1f75477a8666ae8c7fe01b64dd55ecc: symbol
//                  waEthUSDC, leads false · …"
//     🔑 Read with `compareDocumentPosition`, not by text order in
//     `innerText`: the two identities sit in one flex row, so a CSS `order`
//     that moved them visually without moving them in the DOM would read the
//     same in text and is exactly what this must not miss.
//
//  I  the listing's `loading.tsx` deleted. 49/51.
//     FAIL L13f — "no loading.tsx at the section root" (the file was at the
//                  section root when the break was run; `check:routes` then
//                  moved it into the `(views)` group — see that gate's own
//                  message, and the file's header)
//     FAIL L0c  — "skeleton at -1, first card at 32432"
//     🔑 L0c going red WITH it is the finding: without the boundary there is
//     no fallback in the document at all, which is the state the route was in
//     — a click into it painting nothing for the whole census round trip.
//
//  J  the card's `data-shares-raw` set to the CENSUS balance. 50/51.
//     FAIL L2e — "0xde6e08…: card 10455248003347, own 10455240617366 @
//                 25933712 · …"
//     🔑 L13a/L13b stayed GREEN, correctly: the printed figure and its title
//     both come from the live lane, so a break in the raw ATTRIBUTE is only
//     visible to a check that reads the attribute and the chain.
//
//  K  the card's `data-live-block` made to vary by row
//     (`+ (row.census.transferCount % 2)`).
//     FAIL L2e0 — "25933717, 25933716"
//     🔑 The guard exists because everything above it is pinned to that one
//     block. Two blocks on one render would make L2e compare half the cards
//     against the wrong moment and read as a data bug.
//
import { chromium } from "playwright";
import { createPublicClient, http, parseAbi, parseAbiItem, toEventSelector } from "viem";
import { mainnet } from "viem/chains";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readPositionsRoute } from "../lib/read-positions-route.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = process.env.BASE ?? "http://localhost:3762";
const LISTING = `${BASE}/ethereum/aave/vaults/positions`;

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.ALCHEMY_URL) throw new Error("need ALCHEMY_URL in .env.local");

// ── the fixtures, as INPUTS ─────────────────────────────────────────────────
/** F1 — waEthPYUSD. The small vault whose WHOLE participant set this script can
 *  re-derive in one sweep and compare to the store, set for set. */
const F1_VAULT = "0xb51edddd8c47856d81c8681ea71404cec93e92c6";
/** F2 — a typical live wallet in stkwaEthUSDC.v1; L12's vault page. */
const F2_VAULT = "0x6bf183243fdd1e306ad2c4450bc7dcf6f0bf8aa6";
/** F4 — a CLOSED position with a large life: waEthUSDC / a wallet at zero. */
const F4_VAULT = "0xd4fa2d31b7968e448877f69a96de69f5de8cd23e";
const F4_HOLDER = "0x50d3865a63d52c0a54e4679949647ea752107390";
/** F11 — one holder across several vaults. */
const F11_HOLDER = "0xba1333333333a1ba1108e8412f11850a5c319ba9";

const client = createPublicClient({
  chain: mainnet,
  // Five retries 1 s doubling (31 s in all): this Mac shares preview's Alchemy app, and
  // a heavy build spends its per-second budget for several seconds. Three retries
  // 150 ms apart all landed inside that 429 and failed T8b on 2026-09-21.
  transport: http(env.ALCHEMY_URL, { batch: false, retryCount: 5, retryDelay: 1000, timeout: 90_000 }),
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
 *  thousand and the section's exact print rule below it, where rounding to two
 *  decimals would state a zero the chain did not. Restated here so a change to
 *  either half goes red rather than being read off the page. */
const formatApproximate = (value) => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const headline = (exact, value) => (Math.abs(value) >= 1000 ? formatApproximate(value) : exact);

/** lib/date.ts `formatDate`: en-GB, UTC. */
const ukDate = (unix) =>
  new Date(unix * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

// ── this script's own reads ─────────────────────────────────────────────────
const getLogs = (address, topics, toBlock) =>
  client.request({
    method: "eth_getLogs",
    params: [{ address, topics, fromBlock: "0x0", toBlock: hex(toBlock) }],
  });

/** Sweep ONE vault's whole Transfer stream to `toBlock` and build the
 *  participant set the way a census does: every address either side of every
 *  log, minus the zero address (a mint's `from` and a burn's `to`). */
async function sweepParticipants(vault, toBlock) {
  const logs = await getLogs(vault, [TRANSFER], toBlock);
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

console.log(`\n── /ethereum/aave/vaults · ${BASE} ──\n`);

// ═══ L0 ═══════════════════════════════════════════════════════════════════
const head = Number(await client.getBlockNumber());
const first = await listingHtml();
// The listing's own resting selection, so the route and the rendered page
// are answering the same question — a comparison between two different
// orders would be green-but-vacuous on both sides.
// Since mig 206 the resting view is VALUE DESC (the size-floor plan's D2).
const route0 = await readRoute("chain=1&sortBy=value&sortOrder=desc&limit=20");

check("L0a the listing answers 200", first.status === 200, `status ${first.status}`);
check(
  "L0b the INITIAL HTML carries a full page of position cards",
  countMatches(first.html, "data-position-card") === 20,
  `${countMatches(first.html, "data-position-card")} cards in the server's own HTML`,
);
// ⚠️ RESTATED 2026-09-08, when `app/(app)/ethereum/aave/vaults/loading.tsx` landed.
// This used to assert the initial HTML carried NO skeleton at all, which a
// route with a `loading.tsx` cannot satisfy and no listing in the house does:
// Next wraps the page in a Suspense boundary and streams the fallback ahead of
// the resolved content, so the fallback and the rows arrive in ONE document.
// (`/ethereum/liquity-v2`, the reference listing, carries the same fallback.)
// What is still worth asserting — and what a page that had lost its SSR
// seeding would fail — is that the fallback is followed by the real rows in
// that same response, rather than being the answer.
const skeletonAt = first.html.search(/data-skel-section="listing-skeleton"|animate-pulse/);
const firstCardAt = first.html.indexOf("data-position-card");
check(
  "L0c the skeleton in the first response is the boundary's fallback and the rows follow it in the same document",
  skeletonAt !== -1 && firstCardAt !== -1 && skeletonAt < firstCardAt,
  `skeleton at ${skeletonAt}, first card at ${firstCardAt}`,
);
check(
  "L0d the route's overlay block is within 30 blocks of this script's own head",
  route0.blockNumber != null && Math.abs(head - route0.blockNumber) <= 30,
  `route ${route0.blockNumber} vs own head ${head}`,
);

const censusRows = route0.census;
const censusBlock = censusRows[0]?.censusBlock;
// The census is ONE tick at ONE pin on the cron's day, but a vault the tick
// failed is re-run by hand with `--vault` at its own pin (Base, 2026-09-09:
// five vaults, six distinct blocks), and that is a state the page is built to
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

// ═══ L1 — membership is the chain's ════════════════════════════════════════
const { byHolder: f1Own } = await sweepParticipants(F1_VAULT, censusBlock);
const f1Addresses = [...f1Own.keys()];

// This script's own Σ balanceOf == totalSupply at the census block: the proof
// that its OWN sweep is whole, which is what makes it a fair expectation.
const f1Balances = await client.multicall({
  contracts: [
    ...f1Addresses.map((a) => ({ address: F1_VAULT, abi: VAULT_ABI, functionName: "balanceOf", args: [a] })),
    { address: F1_VAULT, abi: VAULT_ABI, functionName: "totalSupply" },
  ],
  blockNumber: BigInt(censusBlock),
  allowFailure: false,
});
const f1Supply = f1Balances[f1Addresses.length];
const f1Sum = f1Balances.slice(0, f1Addresses.length).reduce((s, v) => s + v, 0n);
check(
  "L1a this script's OWN sweep of F1 is whole (Σ balanceOf == totalSupply, wei-exact)",
  f1Sum === f1Supply,
  `${f1Addresses.length} participants · Σ ${f1Sum} vs totalSupply ${f1Supply} @ block ${censusBlock}`,
);

// The route's F1 rows, paged to the end.
const f1Rows = [];
for (let offset = 0; ; offset += 100) {
  const page = await readRoute(`chain=1&vault=${F1_VAULT}&limit=100&offset=${offset}&overlay=0`);
  f1Rows.push(...page.data);
  if (f1Rows.length >= page.pagination.total || page.data.length === 0) break;
}
const routeSet = new Set(f1Rows.map((r) => r.holder));
const ownSet = new Set(f1Addresses);
const missing = [...ownSet].filter((a) => !routeSet.has(a));
const extra = [...routeSet].filter((a) => !ownSet.has(a));
check(
  "L1b the route's F1 rows are EXACTLY this script's own participant set",
  missing.length === 0 && extra.length === 0 && f1Rows.length === f1Addresses.length,
  `route ${f1Rows.length}, own ${f1Addresses.length}${missing.length ? `, missing ${missing.join(",")}` : ""}${extra.length ? `, extra ${extra.join(",")}` : ""}`,
);

const ownLive = new Map(f1Addresses.map((a, i) => [a, f1Balances[i] > 0n]));
const liveBad = f1Rows.filter((r) => r.census.live !== ownLive.get(r.holder));
check(
  "L1c every F1 row's live flag is this script's own balanceOf > 0 at the census block",
  liveBad.length === 0,
  liveBad.length ? liveBad.map((r) => r.holder).join(", ") : `${f1Rows.length} rows agree`,
);

const balBad = f1Rows.filter((r, i) => {
  const own = f1Balances[f1Addresses.indexOf(r.holder)];
  return own == null || BigInt(r.census.balance) !== own;
});
check(
  "L1d every F1 row's census balance is this script's own balanceOf, wei-exact",
  balBad.length === 0,
  balBad.length ? balBad.map((r) => `${r.holder}: ${r.census.balance}`).join(", ") : `${f1Rows.length} rows wei-exact`,
);

const countBad = f1Rows.filter((r) => {
  const own = f1Own.get(r.holder);
  return (
    !own ||
    own.transferCount !== r.census.transferCount ||
    own.firstBlock !== r.census.firstBlock ||
    own.lastBlock !== r.census.lastBlock
  );
});
check(
  "L1e every F1 row's transfer count, first block and last block are this script's own",
  countBad.length === 0,
  countBad.length
    ? countBad
        .map((r) => {
          const o = f1Own.get(r.holder);
          return `${r.holder}: page ${r.census.transferCount}/${r.census.firstBlock}/${r.census.lastBlock} vs own ${o?.transferCount}/${o?.firstBlock}/${o?.lastBlock}`;
        })
        .join(" · ")
    : `${f1Rows.length} rows agree`,
);

// ═══ L2 — the overlay is live ══════════════════════════════════════════════
const page1 = route0.data;
const overlayBlock = route0.blockNumber;
const ownOverlay = await client.multicall({
  contracts: page1.map((r) => ({
    address: r.vault,
    abi: VAULT_ABI,
    functionName: "balanceOf",
    args: [r.holder],
  })),
  blockNumber: BigInt(overlayBlock),
  allowFailure: false,
});
const sharesBad = page1.filter((r, i) => !r.live || BigInt(r.live.shares.raw) !== ownOverlay[i]);
check(
  "L2a every card's shares are this script's own balanceOf at the route's own block",
  sharesBad.length === 0,
  sharesBad.length
    ? sharesBad.map((r, k) => `${r.vault}/${r.holder}: page ${r.live?.shares.raw ?? "unread"}`).join(" · ")
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

// L2's three checks above all compare the route against this script's own
// reads at the overlay's block — which is right, but on a QUIET window the
// census balance and the live balance are the same number, and a route that
// restated the census as the live figure would pass all three. (Measured
// 2026-09-08: on a 170-block window, 0 of the top 20 rows on any of the four
// sorts had moved.) So the lane itself is proved separately, on an address that
// DID move after the census — for which the two lanes necessarily disagree.
async function movedSinceCensus() {
  for (const c of censusRows) {
    if (c.participants === 0) continue;
    const logs = await client.request({
      method: "eth_getLogs",
      params: [{ address: c.vault, topics: [TRANSFER], fromBlock: hex(censusBlock + 1), toBlock: hex(overlayBlock) }],
    });
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
        const r = await readRoute(`chain=1&vault=${c.vault}&q=${t}&limit=5`);
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
  const ownAtOverlay = moved.atOverlay;
  check(
    "L2f the overlay is read at the block it names, not restated from the census",
    moved.row.live != null &&
      BigInt(moved.row.live.shares.raw) === ownAtOverlay &&
      moved.row.live.shares.raw !== moved.row.census.balance,
    `${moved.vault}/${moved.holder}: census ${moved.row.census.balance} @ ${censusBlock}, page ${moved.row.live?.shares.raw} @ ${moved.row.live?.blockNumber}, own ${ownAtOverlay} @ ${overlayBlock}`,
  );
}

// ── the same figures, off the RENDERED DOM ─────────────────────────────────
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 2400 } });

async function readListingDom(qs = "") {
  const page = await context.newPage();
  const res = await page.goto(qs ? `${LISTING}?${qs}` : LISTING, { waitUntil: "networkidle" });
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
        .filter((d) => d.firstElementChild && /^(Shares|Claim) \u00b7 /.test(d.firstElementChild.textContent ?? ""))
        .map((d) => {
          const value = d.querySelector("[title]");
          return {
            label: (d.firstElementChild.textContent ?? "").trim(),
            text: (value?.textContent ?? "").trim(),
            title: value?.getAttribute("title") ?? "",
          };
        });
      // DOM order of the two identities in the card header. 4 =
      // DOCUMENT_POSITION_FOLLOWING, i.e. the wallet pill comes after the
      // vault symbol.
      const symbolEl = e.querySelector("[data-card-vault-symbol]");
      const pillEl = e.querySelector("[data-wallet-label]");
      return {
        id: e.getAttribute("data-position-card"),
        vault: e.getAttribute("data-vault"),
        holder: e.getAttribute("data-holder"),
        status: e.getAttribute("data-status"),
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
  // the rendered innerText — never `body.textContent`: that sweeps the RSC
  // payload in the <script> tags with it, where "$3" and "your" are module
  // chrome (memory `vaults-section-build` — the RSC payload makes a body-text
  // check vacuous; here it would make one permanently red instead). The
  // section's prose is no longer on this page at all; it is read off
  // /ethereum/aave/vaults/info by `readInfoDom` below and the two are judged
  // together at L9.
  const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
  // The face's one line — the census line under the section rail
  // (components/vaults/vault-census-line.tsx). It is VISIBLE, so innerText
  // would do; textContent is kept because it is the whole node either way and
  // the block spans inside it must read as one sentence.
  const stance = (await page.locator("[data-stance]").count())
    ? (await page.locator("[data-stance]").evaluate((e) => e.textContent ?? "")).replace(/\s+/g, " ").trim()
    : "";
  const roster = await page.locator("[data-roster-drawer]").count();
  const introOnFace = await page.locator("[data-intro-drawer]").count();
  const inspector = await page.locator("button.prov-inspect-toggle").count();
  await page.close();
  return { status, cards, body: bodyText, stance, roster, introOnFace, inspector };
}

/** The section's about page — /ethereum/aave/vaults/info, the (i) in the rail.
 *
 *  ⚠️ READ WITH innerText, NOT THE HIDDEN-PANEL TRICK. The prose used to be a
 *  drawer beside the listing: a panel always MOUNTED and merely hidden, whose
 *  words only `textContent` could see. It is a page now and the body is
 *  VISIBLE, so innerText is the reader's own view of it — and a wrapper that
 *  went `hidden` by accident would go red here instead of passing on text
 *  nobody can see.
 *
 *  The `[data-empty-vault]` markers moved with the paragraph that carries them,
 *  so they are read here too. */
async function readInfoDom() {
  const page = await context.newPage();
  const res = await page.goto(`${BASE}/ethereum/aave/vaults/info`, { waitUntil: "networkidle" });
  const status = res?.status() ?? 0;
  const drawers = await page.locator("[data-intro-drawer]").count();
  if (drawers !== 1)
    throw new Error(
      `/ethereum/aave/vaults/info carries ${drawers} [data-intro-drawer] bodies — every prose check below rests on exactly one`,
    );
  const text = (await page.locator("[data-intro-drawer]").innerText()).replace(/\s+/g, " ").trim();
  const emptyVaults = await page
    .locator("[data-empty-vault]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-empty-vault")));
  await page.close();
  return { status, text, emptyVaults };
}

const dom = await readListingDom();
const info = await readInfoDom();
dom.info = info.text;
dom.emptyVaults = info.emptyVaults;
check("L2d the rendered listing draws a full page of cards", dom.cards.length === 20, `${dom.cards.length} cards`);

// ── the headline figures, compact on the face and exact on the title ───────
//
// ⚠️ THE EXPECTATION IS THIS SCRIPT'S OWN READ AT THE BLOCK THE CARD NAMES,
// not the route JSON read minutes earlier. The two are different requests at
// different blocks, and a wrapper's balance moves between them — measured
// 2026-09-08: `waEthUSDC`/0xde6e… differed by 7.6 units between the route read
// and the render, which a wei-exact title comparison against the route would
// have called a bug. Every card states the block its live lane was read at
// (`data-live-block`), so the comparison is pinned to that block and the
// formatting rules below are applied to THIS SCRIPT's integers.
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
const meta = new Map(route0.census.map((c) => [c.vault, { symbol: c.symbol, shareDecimals: c.shareDecimals ?? 18 }]));
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
  rawBad.length === 0,
  rawBad.length ? rawBad.slice(0, 3).join(" · ") : `${liveCards.length} live cards wei-exact @ block ${domBlock}`,
);
check(
  "L13a the listing prints its headline figures through the COMPACT rule",
  liveCards.length > 0 && domFigureBad.length === 0,
  domFigureBad.length ? domFigureBad.slice(0, 4).join(" · ") : `${liveCards.length} live cards match`,
);
check(
  "L13b every headline figure carries the EXACT value on its title",
  liveCards.length > 0 && titleBad.length === 0,
  titleBad.length ? titleBad.slice(0, 4).join(" · ") : `${liveCards.length} live cards, titles wei-exact`,
);
// ⚠️ Without this the two checks above are green on a page that never compacts
// anything: every figure would equal its own exact form and the compact rule
// would be untested. SKIP rather than PASS when the page really carries no
// figure over a thousand — a statement about the page, not about the rule.
if (compactSeen.length > 0) {
  check(
    "L13c the listing SHORTENS a figure its title still states in full",
    true,
    `${compactSeen.length} compacted figures, e.g. ${compactSeen[0]}`,
  );
} else {
  skip("L13c the listing SHORTENS a figure", "no figure on this page reaches a thousand");
}
check(
  "L13d the vault symbol leads the card and the holder pill follows it",
  dom.cards.length > 0 && dom.cards.every((c) => c.vaultSymbol && c.symbolLeadsPill === true),
  dom.cards
    .filter((c) => c.symbolLeadsPill !== true)
    .slice(0, 3)
    .map((c) => `${c.holder}: symbol ${c.vaultSymbol ?? "(none)"}, leads ${c.symbolLeadsPill}`)
    .join(" · ") || `${dom.cards.length} cards lead with the vault`,
);

// ═══ L3 — the facets partition ═════════════════════════════════════════════
const chainTotal = (await readRoute("chain=1&limit=1&overlay=0")).pagination.total;
let partitionBad = [];
for (const c of censusRows) {
  const all = (await readRoute(`chain=1&vault=${c.vault}&limit=1&overlay=0`)).pagination.total;
  const live = (await readRoute(`chain=1&vault=${c.vault}&status=live&limit=1&overlay=0`)).pagination.total;
  const closed = (await readRoute(`chain=1&vault=${c.vault}&status=closed&limit=1&overlay=0`)).pagination.total;
  if (live + closed !== all) partitionBad.push(`${c.symbol}: ${live}+${closed}≠${all}`);
  if (all !== c.participants) partitionBad.push(`${c.symbol}: rows ${all} ≠ census participants ${c.participants}`);
  if (live !== c.liveCount) partitionBad.push(`${c.symbol}: live ${live} ≠ census liveCount ${c.liveCount}`);
}
check(
  "L3a per vault, live + closed == unfiltered, and both agree with the census header",
  partitionBad.length === 0,
  partitionBad.length ? partitionBad.join(" · ") : `${censusRows.length} vaults partition`,
);

const families = ["sgho", "stata", "umbrella-stake"];
let familySum = 0;
for (const f of families) familySum += (await readRoute(`chain=1&family=${f}&limit=1&overlay=0`)).pagination.total;
check("L3b Σ over the family facet == the chain total", familySum === chainTotal, `${familySum} vs ${chainTotal}`);

const shapes = [
  "eoa",
  "delegated-account",
  "safe",
  "erc4626",
  "erc1967-proxy",
  "eip1167-proxy",
  "contract",
  "aave-vault",
];
let shapeSum = 0;
for (const s of shapes) shapeSum += (await readRoute(`chain=1&shape=${s}&limit=1&overlay=0`)).pagination.total;
check("L3c Σ over the shape facet == the chain total", shapeSum === chainTotal, `${shapeSum} vs ${chainTotal}`);

const vaultSum = censusRows.reduce((s, c) => s + c.participants, 0);
check(
  "L3d Σ over the vault facet's own census counts == the chain total",
  vaultSum === chainTotal,
  `${vaultSum} vs ${chainTotal} across ${censusRows.length} vaults`,
);

// ═══ L4 — sorts ════════════════════════════════════════════════════════════
// The backend orders `shares` on the RAW balance, and the page says so in
// words. That is what is asserted here: a check that expected a
// decimals-adjusted order would go red on a correct route.
const sharesDesc = await readRoute("chain=1&sortBy=shares&sortOrder=desc&limit=20&overlay=0");
const rawOrdered = sharesDesc.data.every(
  (r, i) => i === 0 || BigInt(sharesDesc.data[i - 1].census.balance) >= BigInt(r.census.balance),
);
check("L4a sortBy=shares desc is descending by the RAW census balance", rawOrdered, `${sharesDesc.data.length} rows`);
check(
  "L4b the section's about page states that the shares sort is in each vault's own units",
  /own units/.test(dom.info) && /6, 8 and 18 decimals/.test(dom.info),
  /own units/.test(dom.info) && /6, 8 and 18 decimals/.test(dom.info)
    ? "/ethereum/aave/vaults/info names the decimals"
    : `/ethereum/aave/vaults/info does not: "own units" ${/own units/.test(dom.info)}, "6, 8 and 18 decimals" ${/6, 8 and 18 decimals/.test(dom.info)}`,
);

const lastAct = await readRoute("chain=1&sortBy=lastActivity&sortOrder=desc&limit=20&overlay=0");
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
const f4Route = await readRoute(`chain=1&vault=${F4_VAULT}&q=${F4_HOLDER}&limit=5`);
const f4Row = f4Route.data.find((r) => r.holder === F4_HOLDER);
const f4OwnBalance = f4Row
  ? await client.readContract({
      address: F4_VAULT,
      abi: VAULT_ABI,
      functionName: "balanceOf",
      args: [F4_HOLDER],
      blockNumber: BigInt(f4Route.blockNumber ?? censusBlock),
    })
  : null;
check(
  "L5a the closed fixture still holds ZERO at the page's own block (a moved fixture is a failure)",
  f4Row != null && f4OwnBalance === 0n,
  f4Row ? `balanceOf = ${f4OwnBalance}` : "the fixture is not in the census",
);

// Scoped to the holder in the topic filter, both directions: a whole-vault
// sweep of waEthUSDC is 125,815 logs and the state lane caps a response at
// 10,000, so an unscoped read here would not be a slow check — it would be a
// refused one.
const pad32 = (a) => `0x${"0".repeat(24)}${a.toLowerCase().replace(/^0x/, "")}`;
const f4Sent = await getLogs(F4_VAULT, [TRANSFER, pad32(F4_HOLDER)], censusBlock);
const f4Recv = await getLogs(F4_VAULT, [TRANSFER, null, pad32(F4_HOLDER)], censusBlock);
const f4OwnLast = [...f4Sent, ...f4Recv].reduce((m, l) => Math.max(m, Number(BigInt(l.blockNumber))), 0);

const f4Dom = await readListingDom(`vault=${F4_VAULT}&q=${F4_HOLDER}`);
const f4Card = f4Dom.cards.find((c) => c.holder === F4_HOLDER);
check(
  "L5b the closed card carries the CLOSED pill and no Shares or Claim figure",
  f4Card != null &&
    f4Card.status === "closed" &&
    /CLOSED/.test(f4Card.text) &&
    !/Shares ·/.test(f4Card.text) &&
    !/Claim ·/.test(f4Card.text),
  f4Card ? f4Card.text.slice(0, 120) : "no card",
);
check(
  "L5c the closed card states 'Closed by' at this script's OWN last log block",
  f4Card != null &&
    /Closed by/.test(f4Card.text) &&
    f4Card.text.includes(`block ${f4OwnLast.toLocaleString("en-US")}`) &&
    Number(f4Card.lastBlock) === f4OwnLast,
  `own last log block ${f4OwnLast}, card says ${f4Card?.lastBlock}`,
);

// ═══ L6 — the never-held vaults ════════════════════════════════════════════
const emptyCensus = censusRows.filter((c) => c.participants === 0);
const emptyOwn = [];
for (const c of emptyCensus) {
  const logs = await getLogs(c.vault, [TRANSFER], censusBlock);
  if (logs.length !== 0) emptyOwn.push(`${c.symbol}: ${logs.length} logs`);
}
check(
  "L6a this script's own sweep confirms each never-held vault has NO Transfer logs at all",
  emptyCensus.length > 0 && emptyOwn.length === 0,
  emptyOwn.length ? emptyOwn.join(" · ") : `${emptyCensus.length} vaults, zero logs each`,
);
check(
  "L6b every never-held vault is STATED on the section's about page, with the census block",
  emptyCensus.length > 0 &&
    emptyCensus.every((c) => dom.emptyVaults.includes(c.vault)) &&
    emptyCensus.every((c) => dom.info.includes(c.symbol)) &&
    dom.info.includes(censusBlock.toLocaleString("en-US")),
  `${dom.emptyVaults.length} marked on /ethereum/aave/vaults/info, ${emptyCensus.length} never-held in the census: ${emptyCensus.map((c) => c.symbol).join(", ")}`,
);
let emptyRowBad = [];
for (const c of emptyCensus) {
  const t = (await readRoute(`chain=1&vault=${c.vault}&limit=1&overlay=0`)).pagination.total;
  if (t !== 0) emptyRowBad.push(`${c.symbol}: ${t}`);
}
check(
  "L6c a never-held vault contributes no row",
  emptyRowBad.length === 0,
  emptyRowBad.join(" · ") || "zero rows each",
);

// ═══ L7 — a search inserts nothing ═════════════════════════════════════════
// The absent address is DERIVED from L1's own sweep: an address this script has
// proven is not in F1's participant set. (The plan's `0x…dead` is a real
// participant of stkwaEthWETH.v1 — see the re-pin note in the header.)
const ABSENT = "0x000000000000000000000000000000000000dead";
check(
  "L7a this script's own F1 sweep proves the searched address is NOT an F1 participant",
  !ownSet.has(ABSENT),
  `${ABSENT} absent from ${f1Addresses.length} F1 participants`,
);
const totalBefore = (await readRoute("chain=1&limit=1&overlay=0")).pagination.total;
const miss1 = await readRoute(`chain=1&vault=${F1_VAULT}&q=${ABSENT}&limit=5`);
const miss2 = await readRoute(`chain=1&vault=${F1_VAULT}&q=${ABSENT}&limit=5`);
const totalAfter = (await readRoute("chain=1&limit=1&overlay=0")).pagination.total;
check(
  "L7b the search answers zero rows, twice, and inserts nothing",
  miss1.pagination.total === 0 &&
    miss1.data.length === 0 &&
    miss2.pagination.total === 0 &&
    miss2.data.length === 0 &&
    totalAfter === totalBefore,
  `${miss1.pagination.total}/${miss2.pagination.total} rows · chain total ${totalBefore} → ${totalAfter}`,
);
check(
  "L7c the section's about page says an address the census has never seen has no row and records nothing",
  /never seen has no row/.test(dom.info) && /records nothing about the search/.test(dom.info),
  /never seen has no row/.test(dom.info) && /records nothing about the search/.test(dom.info)
    ? "/ethereum/aave/vaults/info states it"
    : `/ethereum/aave/vaults/info does not: "never seen has no row" ${/never seen has no row/.test(dom.info)}, "records nothing about the search" ${/records nothing about the search/.test(dom.info)}`,
);

// ═══ L8 — one holder, one card per vault ═══════════════════════════════════
const f11 = await readRoute(`chain=1&q=${F11_HOLDER}&limit=20`);
const f11Balances = await client.multicall({
  contracts: censusRows.map((c) => ({
    address: c.vault,
    abi: VAULT_ABI,
    functionName: "balanceOf",
    args: [F11_HOLDER],
  })),
  blockNumber: BigInt(censusBlock),
  allowFailure: false,
});
const ownHeld = censusRows.filter((_, i) => f11Balances[i] > 0n).map((c) => c.vault);
const routeHeld = f11.data.map((r) => r.vault);
const notCovered = ownHeld.filter((v) => !routeHeld.includes(v));
const unexplained = f11.data.filter((r) => !ownHeld.includes(r.vault) && r.census.live);
check(
  "L8a every vault this script reads a positive balance in is a card, and every extra card is a CLOSED one",
  ownHeld.length > 1 && notCovered.length === 0 && unexplained.length === 0,
  `own live in ${ownHeld.length} vaults · route ${f11.data.length} cards${notCovered.length ? `, missing ${notCovered.join(",")}` : ""}`,
);

const f11Dom = await readListingDom(`q=${F11_HOLDER}`);
const hrefBad = f11Dom.cards.filter((c) => c.href !== `/ethereum/aave/vaults/${c.vault}/${F11_HOLDER}`);
check(
  "L8b every card links to that vault's own page opened on that holder",
  f11Dom.cards.length === f11.data.length && hrefBad.length === 0,
  hrefBad.length ? hrefBad.map((c) => c.href).join(" · ") : `${f11Dom.cards.length} cards linked`,
);

// ═══ L9 — copy ═════════════════════════════════════════════════════════════
// The register rules are the SECTION's, not one page's: they run over the
// listing's own face AND the prose that moved to /ethereum/aave/vaults/info, so a
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
// "Safe" is exempt: it is the MECHANISM word for a Safe-shaped holder, which
// the charter allows in as many words. Every other app in the registry is not.
const appNames = ["Coinbase", "MetaMask", "Uniswap"];
const named = appNames.filter((a) => new RegExp(`\\b${a}\\b`, "i").test(body));
check("L9d no app is named on the listing", named.length === 0, named.join(", ") || "none of the registry's apps");
// Every date on the page must be the en-GB UTC form ("8 Sept 2026"), never a
// runtime-locale one ("Sep 8, 2026" / "08/09/2026").
const badDates = body.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b|\b[A-Z][a-z]{2} \d{1,2}, \d{4}\b/g) ?? [];
check("L9e every date is the en-GB UTC form", badDates.length === 0, badDates.join(", ") || "no runtime-locale dates");

// ═══ L10 — the census block line ═══════════════════════════════════════════
// One block reads "block N"; several read "blocks A to B" — the page's own
// rule, restated here from the rows so the line is held to what they carry.
const fmtBlock = (b) => b.toLocaleString("en-US");
const expectedBlockLine =
  censusBlocks.length === 1
    ? `block ${fmtBlock(censusBlocks[0])}`
    : `blocks ${fmtBlock(censusBlocks[0])} to ${fmtBlock(censusBlocks[censusBlocks.length - 1])}`;
check(
  "L10 the census line states exactly the blocks the route's census rows carry, in the census slot",
  dom.stance.includes(`census at ${expectedBlockLine}`),
  `the line reads "${dom.stance.slice(0, 160)}" — expected "census at ${expectedBlockLine}" from ${censusRows.length} census rows over ${censusBlocks.length} block(s)`,
);

// ═══ L11 — SSR under a filter ══════════════════════════════════════════════
const ssr = await listingHtml(`vault=${F1_VAULT}`);
const f1Live = f1Rows.filter((r) => r.census.live).length;
check(
  "L11 the filtered URL carries F1's rows in the INITIAL HTML",
  ssr.status === 200 &&
    countMatches(ssr.html, "data-position-card") === Math.min(20, f1Rows.length) &&
    countMatches(ssr.html, `data-vault="${F1_VAULT}"`) === Math.min(20, f1Rows.length),
  `${countMatches(ssr.html, "data-position-card")} cards, F1 has ${f1Rows.length} participants (${f1Live} live)`,
);

// ═══ L12 — the links in ════════════════════════════════════════════════════
async function linkOn(url) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  const hrefs = await page
    .locator('[data-link="vault-positions"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  await page.close();
  return hrefs;
}
// The roster is the VAULTS tab's landing page — /ethereum/aave/vaults —
// the section rail — so its links are read there, with no click needed. The
// assertion is the same one at the surface it moved to; `[data-roster-panel]`
// is the same wrapper the drawer used, kept deliberately, so the row selector
// under it did not change.
async function rosterLinks() {
  const page = await context.newPage();
  await page.goto(`${BASE}/ethereum/aave/vaults`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-roster-panel] [data-vault-row]", { timeout: 60000 });
  const hrefs = await page
    .locator('[data-roster-panel] [data-link="vault-positions"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  await page.close();
  return hrefs;
}
const dirLinks = await rosterLinks();
check(
  "L12a the roster page links every vault to the listing filtered to it",
  dirLinks.length > 0 && dirLinks.includes(`/ethereum/aave/vaults/positions?vault=${F1_VAULT}`),
  `${dirLinks.length} links on /ethereum/aave/vaults`,
);
const vaultLinks = await linkOn(`${BASE}/ethereum/aave/vaults/${F2_VAULT}`);
check(
  "L12b F2's vault page links to the listing filtered to it",
  vaultLinks.includes(`/ethereum/aave/vaults/positions?vault=${F2_VAULT}`),
  vaultLinks.join(", ") || "no link",
);

// ═══ L13 (cont.) — the phone, and the route's own skeleton ════════════════
// The overflow this closes was MEASURED, not assumed: at 390 the full-precision
// headline figures ran 221px into a 150px cell and the document scrolled
// sideways (`document.scrollWidth` 397). The assertion is the document's own
// width against the viewport's, which is the reader's experience of it, rather
// than any one element's box.
const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
const phonePage = await phone.newPage();
await phonePage.goto(LISTING, { waitUntil: "networkidle" });
const phoneWidth = await phonePage.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}));
await phonePage.close();
await phone.close();
check(
  "L13e the listing does not scroll sideways at 390px",
  phoneWidth.scrollWidth === 390,
  `document.scrollWidth ${phoneWidth.scrollWidth} at a 390px viewport (client ${phoneWidth.clientWidth})`,
);

// The route is `force-dynamic` and its first paint waits on a census round
// trip, so a click into it paints nothing without a boundary to prefetch to.
// A file check is the whole of the claim: Next mounts `loading.tsx` by
// convention, and what it must render is the shared listing shell rather than
// a hand-rolled one.
const loadingPath = path.join(ROOT, "app", "(app)", "ethereum", "aave", "vaults", "(views)", "loading.tsx");
const loadingSrc = fs.existsSync(loadingPath) ? fs.readFileSync(loadingPath, "utf8") : "";
check(
  "L13f the listing route has a loading.tsx that renders ListingRouteLoading",
  /<ListingRouteLoading\s*\/>/.test(loadingSrc) &&
    /from "@\/components\/shared\/listing-route-loading"/.test(loadingSrc),
  loadingSrc
    ? "app/(app)/ethereum/aave/vaults/(views)/loading.tsx → <ListingRouteLoading />"
    : "no loading.tsx in the listing's (views) group",
);

// ═══ L14 — the explorer rail, and what the listing face no longer carries ══
// Aave's vault layer is a roster subject now (rails-ops decision 0028), so the
// row is its own `RailHeader` and the chain-scoped section's four-tab row is
// gone. Its tabs are the sub-page and the (i) — there is no POSITIONS tab,
// because a share in a vault is not a position the roster counts — and the lit
// one is VAULTS, since this listing is a route UNDER that sub-page.
// A href is read off the DOM and then FETCHED — a tab that points at a 404 is
// the failure this is for, and a link check that only compared strings could
// not see it.
const railPage = await context.newPage();
await railPage.goto(LISTING, { waitUntil: "networkidle" });
const rail = await railPage.locator('nav[aria-label="Explorer sections"]').evaluateAll((navs) =>
  navs.map((nav) =>
    Array.from(nav.querySelectorAll("a")).map((a) => ({
      href: a.getAttribute("href"),
      text: (a.textContent ?? "").trim(),
      label: a.getAttribute("aria-label"),
      link: a.getAttribute("data-link"),
      current: a.getAttribute("aria-current"),
    })),
  ),
);
const sectionRails = await railPage.locator('nav[aria-label="Section surfaces"]').count();
const railLinks = rail[0] ?? [];
const railStatus = [];
// Followed, not manual: this explorer's (i) is a DOOR to the vault layer's own
// about page rather than a second copy of it (0028 gives a page one address),
// so it answers a 307 and the page behind it is what must be there.
for (const l of railLinks) {
  const r = await fetch(`${BASE}${l.href}`, { redirect: "follow" });
  railStatus.push(`${l.href} ${r.status}`);
}
const wanted = ["/ethereum/aave/vaults", "/ethereum/aave/info"];
const infoTab = railLinks.find((l) => l.label === "About this explorer");
const litTabs = railLinks.filter((l) => l.current === "page");
check(
  "L14c the listing draws ONE Aave vaults rail whose two tabs each resolve, with the (i) door named, VAULTS lit, and no section rail anywhere",
  rail.length === 1 &&
    sectionRails === 0 &&
    railLinks.length === 2 &&
    wanted.every((w) => railLinks.some((l) => l.href === w)) &&
    infoTab?.href === "/ethereum/aave/info" &&
    railStatus.every((s) => s.endsWith(" 200")) &&
    litTabs.length === 1 &&
    litTabs[0].href === "/ethereum/aave/vaults",
  `${rail.length} rail(s), ${sectionRails} section rail(s), ${railLinks.length} tabs · ${railStatus.join(", ")} · lit: ${litTabs.map((l) => l.href).join(",") || "none"}`,
);
await railPage.close();

// The face is the figures it read and nothing else. All three of these were on
// it before this change — the "How this listing is built" drawer, the roster
// drawer, and the provenance inspector's toggle — and each is asserted ABSENT
// by the selector it actually rendered under, so a drawer put back would go
// red here rather than quietly returning.
check(
  "L14d the listing face carries no intro drawer, no roster drawer and no provenance inspector",
  dom.introOnFace === 0 && dom.roster === 0 && dom.inspector === 0,
  `[data-intro-drawer] ${dom.introOnFace}, [data-roster-drawer] ${dom.roster}, button.prov-inspect-toggle ${dom.inspector}`,
);

await browser.close();
console.log(`\n${passes}/${passes + failures} checks passed${skipped ? ` · ${skipped} SKIP` : ""}`);
process.exit(failures ? 1 : 0);
