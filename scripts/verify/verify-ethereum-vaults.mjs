#!/usr/bin/env node
// The Vaults section's ROSTER on Ethereum, checked against the chain rather
// than against itself. /ethereum/aave/vaults — Aave's own vault layer:
// sGHO, the Umbrella stake tokens and the static aTokens. The section route is
// the position listing and the roster is the VAULTS tab beside it, so every
// check here opens that page (`openRoster`) and reads the same DOM it always
// did.
// ----------------------------------------------------------------------------
// EVERY EXPECTED FIGURE HERE IS THIS SCRIPT'S OWN CHAIN READ, ITS OWN PARSE, OR
// A FETCH OF AAVE'S ADDRESS BOOK AT A PINNED COMMIT. The page states the block
// it read at; this script then calls the two enumerators AT THAT BLOCK and
// re-reads `totalAssets()`, `decimals()`, `convertToAssets(10 ** decimals)` and
// each family's mechanic on every address they returned, and recomputes the
// roster, the grouping, the order, the counts and the printed text from those.
// The one thing taken from the DOM is the block number, which is check 0b's
// subject and not a source of truth for anything else.
//
// AN EXPECTATION NEVER COMES FROM THE THING UNDER TEST. The roster's expectation
// is the CHAIN's answer, never the page's row set and never a list committed in
// this repo — a committed roster and a page can move together, which is the
// demotion trap `verify-base-vault-directory.mjs` records twice (D2, E2). The
// only committed thing this script judges is the address-book attestation, and
// it judges it against a fetch of `aave-dao/aave-address-book` at the commit the
// catalogue pins (check 1e), which is an expectation from outside this repo.
//
// Run:
//   BASE=http://localhost:3611 node scripts/verify/verify-ethereum-vaults.mjs
// Needs ALCHEMY_URL in .env.local (read, never printed). NO eth_getLogs
// anywhere: every read here is an eth_call at one block, so the whole run works
// on a state endpoint.
//
// ── 2026-09-08 · THE SELECTOR MOVED, THE ASSERTIONS DID NOT ────────────────
// /ethereum/vaults became the section's POSITION LISTING and the roster became
// the drawer inside it, read from chain on open. Every check below is the one
// it was; each of the three navigations now calls `openRoster()` first. Proved
// it still fails: `data-directory-block` renamed on the roster →
// `locator.getAttribute: Timeout 30000ms exceeded. - waiting for
// locator('[data-directory-block]')`, the run stopping before 0b — the same
// loud failure that attribute's absence has always produced. Restored: 33/33 ·
// 1 SKIP (3d, unchanged).
//
// ── 2026-09-09 · AND MOVED AGAIN, TO A PAGE ────────────────────────────────
// The drawer became a page of its own, the VAULTS tab of the rail
// rail. `openRoster` navigates there instead of clicking a panel open; nothing
// else changed, because `[data-roster-panel]` and every selector under it were
// kept deliberately when the rows moved.
//
// ── WHAT EACH SECTION ASSERTS ────────────────────────────────────────────────
//   0  the directory answers 200 and states a block near this script's own head
//   1  the roster: row count and address set equal the enumerators' own answers
//      at the stated block, every row's family is the family the chain puts it
//      in, and the five addresses the catalogue attests to Aave's address book
//      are the addresses that book publishes at the pinned commit
//   2  every row's raw `totalAssets()` (a data attribute) equals this script's
//      own read at the stated block, wei-exact
//   3  grouping and order: one section per family, each row inside its own
//      family's section, rows contiguous by asset, assets ascending by symbol,
//      and non-increasing raw totals WITHIN one asset (never across two) — that
//      last one SKIPS out loud when no two funded vaults share an asset, which
//      is the state of this catalogue today (see B4)
//   4  funded + empty + unread == the roster size, and unread == 0
//   5  the empty group is collapsed at rest and expands to exactly the stated N
//      rows, with N this script's own count of zero readings
//   6  the printed total follows the section's amount rule on the largest row
//      of each family
//   7  the share price: every row's raw equals this script's own
//      `convertToAssets(10 ** decimals)` with the exponent read PER VAULT, the
//      sample provably spans a 6-decimal and an 18-decimal share token, and the
//      printed text follows the share-price rule on one of each
//   8  no USD figure anywhere in the section's DOM — no "$" at all, and no
//      amount beside a bare "USD" ("USDC"/"USDtb" are asset symbols and must
//      not trip it)
//   9  every number the page prints is formatted in en-US, judged against this
//      script's own re-format of its own chain read
//  10  the dev provenance tripwire reports no uncovered figure (SKIP when its
//      bookends are absent — a production build renders none)
//  11  the chain switcher shows the Vaults row on Ethereum at ITS OWN href and
//      on Base at Base's, and none on Sepolia
//  12  /coverage/ethereum carries the Vaults section linking here;
//      /coverage/sepolia carries none
//  13  each family's mechanic, as printed, equals this script's own reads: the
//      sGHO rate and cap, each stata row's `aToken()`, and each stake token's
//      cooldown, unstake window and `Umbrella.isReserveSlashable(reserve)` —
//      with the reserve reached by this script's own `asset()` hops
//  14  the citation block: every URL lib/aave-vaults/first-party-sources.ts
//      lists is rendered as an href and answers 200 (the `aave.com/docs` ones
//      under `Accept: text/markdown` too), the URL that is not a page is absent,
//      the two sentences the block exists to carry are on the face, and the
//      block draws no tile and names no app — Aave included
//
// ── PROVED IT CAN FAIL, 2026-09-06, BASE=http://localhost:3611 ───────────────
// Restored run: 27/27 · 1 SKIP (3d, and its SKIP is a finding — see B4). Three
// break groups, each aimed at different checks, run, then reverted. Section 14
// was added later the same day and has its own group — GROUP 4, at the foot.
// Restored run WITH section 14: 33/33 · 1 SKIP (BASE=http://localhost:3614). The dev
// data cache holds a directory reading for five minutes, so every group deleted
// .next/cache/fetch-cache and reloaded the page before the run — a loader break
// judged against a cached reading proves nothing.
//
// GROUP 1 — the decimals trap, a salted raw, and an added USD figure. 24/28.
//
//  B1  lib/sources/chain/aave-ethereum-vault-directory.ts asked
//      `convertToAssets(10^18)` on every vault instead of 10 ** its own
//      `decimals()` — the decimals trap, made live → FAIL 7a on every
//      six-decimal vault by a factor of 1e12 ("0xb51e…92c6: page
//      1088152338675330535 vs own 1088152 (10^6)") and FAIL 7c
//      ("1,088,152,338,675.3306 PYUSD" against a share price of about 1.088152).
//      🔑 7b stayed green, which is what it is for: the sample still spanned
//      both decimal classes, so 7a's premise held and the break landed on the
//      check that was supposed to catch it.
//  B3  +1 raw unit on every row's `data-total-assets-raw` in
//      components/vaults/aave-vault-directory-view.tsx → FAIL 2 ("0xe175…ca1d:
//      page 165387182502556868300650533 vs own …532").
//      🔑 6 stayed GREEN, and that is correct here: this script re-formats its
//      OWN chain read rather than the page's attribute, so the printed text and
//      the raw attribute are two independent claims. (The Base verifier's
//      equivalent break turns its print check red because that one formats the
//      page's raw.)
//  B6  a USD figure added to the denominator paragraph ("$165,387,043 held in
//      all") → FAIL 8 ("1 USD token(s): $"). Every other check stayed green: a
//      chain-truth violation of this shape is an ADDITION, and nothing else in
//      this file looks for one.
//
// GROUP 2 — a dropped family, a reversed comparator, a salted attestation.
// 21/27 · 1 SKIP.
//
//  B2  the loader's roster dropped sGHO (the `{ address: SGHO, family: "sgho" }`
//      seed removed) → FAIL 1a ("17 rows, chain says 18"), FAIL 1b ("1 missing
//      (0xe175…ca1d)"), FAIL 3a ("sections [stata, umbrella-stake]") and FAIL 4a
//      ("12 + 5 + 0 = 17 against 18"), plus FAIL 13a with the family line gone.
//      🔑 1e stayed green: Aave's book still publishes sGHO and the catalogue
//      still names it. A page can drop a row the book attests — which is why
//      1a's expectation is the CHAIN's roster and not the catalogue's.
//      🔑 This break also found a real fault in the verifier: 13a read the sGHO
//      family line through an unguarded locator, which threw and aborted the run
//      before 13b and 13c. Now the missing line is a FAIL. One dead section must
//      not hide every check after it (the P5 lesson in
//      verify-base-vault-directory.mjs).
//  B4  the in-family comparator reversed in the view (`av < bv ? 1` → `? -1`) →
//      NOTHING WENT RED, and that is the finding. Aave's catalogue has at most
//      one funded vault per asset per family — the stata factory allows one
//      wrapper per underlying, each stake token holds a different wrapper, and
//      sGHO is alone — so the size rule had no pair to exercise and a green 3d
//      would have said nothing about the comparator at all. 3d now counts its
//      comparable pairs and SKIPS out loud at zero rather than passing; the
//      order that IS exercised (contiguity and ascending asset symbol) is 3c,
//      which the same break does not touch.
//  B7  the catalogue's stkGHO address salted one nibble (…f15033 → …f15034) →
//      FAIL 1e ("UmbrellaEthereum.UMBRELLA_STAKE_ASSETS.STK_GHO_V1: catalogue
//      0x4f82…5034, book 0x4f82…5033").
//      🔑 1a, 1b and 1c stayed green: `getStkTokens()` still answered the real
//      address, and the salted one is only ever used for the attestation. Only
//      an expectation FETCHED FROM AAVE can catch a wrong attestation.
//
// GROUP 3 — a narrowed empty group and two wrong mechanic cells. 21/27 · 1 SKIP.
//
//  B5  zero readings on an 18-decimal asset dropped from the empty group
//      (`&& r.asset.decimals !== 18` on `emptyRows`) → FAIL 1a ("16 rows"),
//      FAIL 1b ("2 missing (0xb80b…a4df, 0x5caf…cb9b)"), FAIL 4a
//      ("13 + 3 + 0 = 16 against 18") and FAIL 5b ("stated 3, drawn 3, own 5").
//      🔑 The page's OWN stated count moved with the break — stated 3, drawn 3,
//      agreeing with each other — which is exactly why 5b compares against this
//      script's own count of zero readings and not against the page's.
//      (Narrowing the filter to `family === "stata"` was tried first and moved
//      nothing: all five zero-reading vaults ARE stata, so that break was not a
//      break. Recorded because a break that changes nothing is not evidence.)
//  B8  the cooldown cell printed `getUnstakeWindow()` for both figures → FAIL
//      13c on all four stake tokens ("2 days, then 2 days to redeem" against an
//      own read of 1728000 s / 172800 s).
//  B9  the stata mechanic cell named the vault's own address instead of the
//      aToken it wraps → FAIL 13b on all eight funded wrappers ("0xd4fa…d23e:
//      page 0xd4fa…d23e vs own 0x98c2…6f5c").
//
// GROUP 4 — the citation block (section 14), 2026-09-06, BASE=http://localhost:3614.
// Five breaks, each aimed at a different way a small claim goes wrong.
//
//  C0  the block's second sentence read "neither surface below has a per-address
//      route" while 14e wanted the clause "no per-address route" → FAIL 14e
//      ("missing \"no per-address route\""). Found by writing the check first and
//      the copy second; the copy now carries the plan's own words.
//  C1  the Umbrella page removed from AAVE_FIRST_PARTY_SOURCES → FAIL 14a
//      ("module is missing https://aave.com/docs/aave-v3/umbrella").
//      🔑🔑 14b STAYED GREEN, and that is the whole reason 14a exists: the page
//      renders what the module lists, so a dropped page moves the module and
//      the DOM together and they agree with each other. Only an expectation
//      pinned OUTSIDE the file under test can see a citation that shrank.
//  C2  `https://aave.com/docs/aave-v3/guides/sgho` added to the module → FAIL
//      14a ("module adds …"), FAIL 14c ("→ 308; (text/markdown) → 308") and
//      FAIL 14d ("IS PRESENT").
//      🔑 That URL 404'd when the plan was written and 308s to the canonical
//      sGHO page today. A fetch that FOLLOWED redirects would have called it a
//      200 and 14c would have passed it — which is why 14c asks with
//      `redirect: "manual"` and why 14d asserts absence separately.
//  C3  "the same shape as a MetaMask guide" added to the block's copy → FAIL
//      14f ("names inside MetaMask"). The name came from this script's own parse
//      of lib/shared/vault-providers.ts, so an app added to that registry is
//      covered here without touching this file.
//  C4  the component rendered `AAVE_FIRST_PARTY_SOURCES.slice(0, 3)` → FAIL 14b
//      ("not rendered https://app.aave.com/sgho/, https://app.aave.com/staking/").
//      14a stayed green: the module was whole and the PAGE was short, which is
//      the break 14b is for and the mirror image of C1.

import { chromium } from "playwright";
import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = process.env.BASE ?? "http://localhost:3611";

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.ALCHEMY_URL) throw new Error("need ALCHEMY_URL in .env.local");

// ── the catalogue's own claims, parsed out of the TS ─────────────────────────
// Only three things live in that file: the two enumerator addresses, and the
// five addresses Aave's address book names one by one with the constant each
// comes from. This script parses them to know WHAT TO JUDGE — the judgement
// itself comes from the chain (sections 1a-1d) and from the book (1e).
//
// Completeness is asserted the way the Base catalogue parse asserts it: a parse
// that read fewer entries than the source has `address:` lines is an ERROR, not
// a quietly shorter expectation every later comparison would then satisfy.
const CATALOG = (() => {
  const src = fs.readFileSync(path.join(ROOT, "lib/aave-vaults/vault-catalog.ts"), "utf8");
  const commit = src.match(/AAVE_ADDRESS_BOOK_COMMIT = "([0-9a-f]{40})"/)?.[1];
  const stataFactory = src.match(/AAVE_STATA_FACTORY = "(0x[0-9a-f]{40})"/)?.[1];
  const umbrella = src.match(/AAVE_UMBRELLA = "(0x[0-9a-f]{40})"/)?.[1];
  if (!commit || !stataFactory || !umbrella) throw new Error("vault-catalog parse: commit or enumerator missing");
  const body = src.slice(src.indexOf("export const AAVE_ETHEREUM_BOOK_VAULTS"), src.indexOf("const BY_ADDRESS"));
  const entries = [
    ...body.matchAll(
      /address: "(0x[0-9a-f]{40})",\s*\n\s*family: "([a-z-]+)",\s*\n\s*bookConstant: "([^"]+)",\s*\n\s*bookFile: "([A-Za-z0-9]+)",/g,
    ),
  ].map((m) => ({ address: m[1], family: m[2], constant: m[3], file: m[4] }));
  const expected = (body.match(/address: "0x/g) || []).length;
  if (entries.length === 0 || entries.length !== expected)
    throw new Error(`vault-catalog parse read ${entries.length} of ${expected} book entries`);
  return { commit, stataFactory, umbrella, entries };
})();
const SGHO = CATALOG.entries.find((e) => e.family === "sgho")?.address;
if (!SGHO) throw new Error("vault-catalog parse: no sGHO entry");

const client = createPublicClient({
  chain: mainnet,
  transport: http(env.ALCHEMY_URL, { batch: false, retryCount: 3 }),
});

const ENUM_ABI = parseAbi([
  "function getStataTokens() view returns (address[])",
  "function getStkTokens() view returns (address[])",
]);
const VAULT_ABI = parseAbi([
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function asset() view returns (address)",
  "function totalAssets() view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
]);
const MECH_ABI = parseAbi([
  "function aToken() view returns (address)",
  "function getCooldown() view returns (uint256)",
  "function getUnstakeWindow() view returns (uint256)",
  "function isReserveSlashable(address) view returns (bool, uint256)",
  "function targetRate() view returns (uint16)",
  "function supplyCap() view returns (uint160)",
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

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The section's AMOUNT rule, restated here from
 *  components/protocol/morpho-base/vault-exposure-parts.tsx so a change to the
 *  page's rule this script did not agree to goes red. */
const expectedAmountText = (raw, decimals) => {
  const value = Number(raw) / Math.pow(10, decimals);
  const text = value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals <= 6 ? 2 : 6,
  });
  return value !== 0 && parseFloat(text.replace(/,/g, "")) === 0 ? exactUnits(raw, decimals) : text;
};
/** The SHARE-PRICE rule, restated from the directory view: the amount rule with
 *  six places allowed whatever the asset's decimals are, because a share price
 *  is a ratio near one and cents would make every stata row read "1.18". */
const expectedSharePriceText = (raw, decimals) => {
  const value = Number(raw) / Math.pow(10, decimals);
  const text = value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  return value !== 0 && parseFloat(text.replace(/,/g, "")) === 0 ? exactUnits(raw, decimals) : text;
};
const exactUnits = (raw, decimals) => {
  const s = String(raw).padStart(decimals + 1, "0");
  const cut = s.length - decimals;
  return (s.slice(0, cut) + "." + s.slice(cut)).replace(/\.?0+$/, "");
};
/** The duration rule, restated from the view. */
const expectedDuration = (seconds) => {
  if (seconds % 86400 === 0)
    return `${(seconds / 86400).toLocaleString("en-US")} ${seconds === 86400 ? "day" : "days"}`;
  if (seconds % 3600 === 0) return `${(seconds / 3600).toLocaleString("en-US")} ${seconds === 3600 ? "hour" : "hours"}`;
  return `${seconds.toLocaleString("en-US")} seconds`;
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 1200 } });
const page = await context.newPage();

/** THE ROSTER IS THE VAULTS TAB'S LANDING PAGE — /ethereum/aave/vaults, since
 *  rails-ops decision 0028 moved Aave's vault layer under its own unstamped
 *  door (app/(app)/ethereum/aave/vaults/(views)/page.tsx). The position listing
 *  is one segment under it. Every assertion below is the one it always was —
 *  the selector is where it moved to, and `[data-roster-panel]` came with it. A
 *  roster that never fills is a FAILURE here, not a skip: the timeout throws
 *  and the run stops with the wait's own message. */
const ROSTER = "/ethereum/aave/vaults";
async function openRoster(target = page) {
  const res = await target.goto(`${BASE}${ROSTER}`, { waitUntil: "networkidle" });
  await target.waitForSelector("[data-roster-panel] [data-vault-row]", { timeout: 90000 });
  return res;
}

// ── 0: the directory answers, and states a block ────────────────────────────
const res0 = await openRoster();
check(`0a GET ${ROSTER} answers 200`, res0?.status() === 200, `status ${res0?.status()}`);
const statedBlock = Number(await page.locator("[data-directory-block]").getAttribute("data-directory-block"));
const head = await client.getBlockNumber();
check(
  "0b the page states the block it read at, and it is within 200 blocks of this script's own head",
  Number.isInteger(statedBlock) && statedBlock > 0 && Number(head) - statedBlock < 200 && statedBlock <= Number(head),
  `page ${statedBlock}, own head ${head}`,
);
const blockNumber = BigInt(statedBlock);

// ── the chain's own roster, at the block the page named ─────────────────────
const [stataRaw, stakeRaw] = await Promise.all([
  client.readContract({
    address: CATALOG.stataFactory,
    abi: ENUM_ABI,
    functionName: "getStataTokens",
    blockNumber,
  }),
  client.readContract({ address: CATALOG.umbrella, abi: ENUM_ABI, functionName: "getStkTokens", blockNumber }),
]);
const stata = stataRaw.map((a) => a.toLowerCase());
const stake = stakeRaw.map((a) => a.toLowerCase());
const CHAIN_ROSTER = [
  { address: SGHO, family: "sgho" },
  ...stata.map((address) => ({ address, family: "stata" })),
  ...stake.map((address) => ({ address, family: "umbrella-stake" })),
];
const CHAIN_FAMILY = new Map(CHAIN_ROSTER.map((r) => [r.address, r.family]));

// Everything about every vault, read by this script at the same block.
const own = await client.multicall({
  contracts: CHAIN_ROSTER.flatMap((r) => [
    { address: r.address, abi: VAULT_ABI, functionName: "decimals" },
    { address: r.address, abi: VAULT_ABI, functionName: "asset" },
    { address: r.address, abi: VAULT_ABI, functionName: "totalAssets" },
  ]),
  allowFailure: true,
  batchSize: 0,
  blockNumber,
});
const OWN = new Map();
CHAIN_ROSTER.forEach((r, i) => {
  const g = (k) => (own[i * 3 + k].status === "success" ? own[i * 3 + k].result : null);
  OWN.set(r.address, { family: r.family, decimals: g(0), asset: g(1)?.toLowerCase() ?? null, totalAssets: g(2) });
});
// The share price, asked with each vault's OWN decimals — the exponent is the
// point of check 7, so this script reads it rather than assuming it.
const spOwn = await client.multicall({
  contracts: CHAIN_ROSTER.map((r) => ({
    address: r.address,
    abi: VAULT_ABI,
    functionName: "convertToAssets",
    args: [BigInt(10) ** BigInt(OWN.get(r.address).decimals ?? 18)],
  })),
  allowFailure: true,
  batchSize: 0,
  blockNumber,
});
CHAIN_ROSTER.forEach((r, i) => {
  OWN.get(r.address).sharePrice = spOwn[i].status === "success" ? spOwn[i].result : null;
});
// Every distinct asset's symbol and decimals — the units the page prints in.
const assetAddrs = [...new Set([...OWN.values()].map((v) => v.asset).filter(Boolean))];
const assetMeta = await client.multicall({
  contracts: assetAddrs.flatMap((a) => [
    { address: a, abi: VAULT_ABI, functionName: "symbol" },
    { address: a, abi: VAULT_ABI, functionName: "decimals" },
  ]),
  allowFailure: true,
  batchSize: 0,
  blockNumber,
});
const ASSET = new Map(
  assetAddrs.map((a, i) => [
    a,
    {
      symbol: assetMeta[i * 2].status === "success" ? assetMeta[i * 2].result : null,
      decimals: assetMeta[i * 2 + 1].status === "success" ? assetMeta[i * 2 + 1].result : null,
    },
  ]),
);

// ── 1: the roster ───────────────────────────────────────────────────────────
// The empty group is collapsed at rest; section 5 checks the collapse itself,
// so here the rows are read with it open and the whole roster is countable.
const emptyToggle = page.locator("[data-empty-group] button");
const hasEmptyGroup = (await emptyToggle.count()) > 0;
const emptyRowsBefore = await page.locator("[data-empty-rows] [data-vault-row]").count();
if (hasEmptyGroup) {
  await emptyToggle.click();
  await page.waitForSelector("[data-empty-rows]");
}
const readRows = async () =>
  page.locator("[data-vault-row]").evaluateAll((els) =>
    els.map((el) => ({
      address: el.getAttribute("data-vault-row"),
      group: el.getAttribute("data-group"),
      family: el.getAttribute("data-family"),
      asset: el.getAttribute("data-asset"),
      raw: el.getAttribute("data-total-assets-raw"),
      sharePriceRaw: el.getAttribute("data-share-price-raw"),
      familyGroup: el.closest("[data-family-group]")?.getAttribute("data-family-group") ?? null,
      inEmpty: Boolean(el.closest("[data-empty-rows]")),
      amountText: el.querySelector('[data-cell="total-assets"]')?.textContent?.trim() ?? null,
      sharePriceText: el.querySelector('[data-cell="share-price"]')?.textContent?.trim() ?? null,
      mechanicText: el.querySelector('[data-cell="mechanic"]')?.textContent?.trim() ?? null,
    })),
  );
const rows = await readRows();
check(
  "1a the directory draws one row per vault the chain's own enumerators name",
  rows.length === CHAIN_ROSTER.length,
  `${rows.length} rows, chain says ${CHAIN_ROSTER.length} (1 sGHO + ${stata.length} stata + ${stake.length} stake)`,
);
const rowSet = new Set(rows.map((r) => r.address));
const missing = CHAIN_ROSTER.filter((r) => !rowSet.has(r.address));
const extra = rows.filter((r) => !CHAIN_FAMILY.has(r.address));
check(
  "1b the rows are exactly the addresses the chain returned",
  missing.length === 0 && extra.length === 0 && rowSet.size === rows.length,
  `${missing.length} missing${missing.length ? ` (${missing.map((m) => short(m.address)).join(", ")})` : ""}, ` +
    `${extra.length} not on chain, ${rows.length - rowSet.size} duplicated`,
);
const wrongFamily = rows.filter((r) => CHAIN_FAMILY.get(r.address) !== r.family);
check(
  "1c every row's family is the family the chain's enumerators put it in",
  wrongFamily.length === 0,
  wrongFamily
    .slice(0, 3)
    .map((r) => `${short(r.address)}: page ${r.family}, chain ${CHAIN_FAMILY.get(r.address)}`)
    .join("; ") || `${rows.length} rows checked`,
);
// 1d/1e — Aave's own address book at the commit the catalogue pins. The one
// expectation in this script that comes from neither the chain nor this repo.
const BOOK_BASE = `https://raw.githubusercontent.com/aave-dao/aave-address-book/${CATALOG.commit}/src/ts`;
let book = null;
try {
  const files = [...new Set(CATALOG.entries.map((e) => e.file)), "AaveV3Ethereum", "UmbrellaEthereum"];
  const texts = await Promise.all(
    [...new Set(files)].map(async (f) => {
      const r = await fetch(`${BOOK_BASE}/${f}.ts`);
      if (!r.ok) throw new Error(`${f}.ts ${r.status}`);
      return [f, await r.text()];
    }),
  );
  book = new Map(texts);
} catch (error) {
  book = null;
  console.log(`      (address book fetch failed: ${error.message})`);
}
/** Resolve `File.CONST` or `File.OBJECT.KEY` against the generated TypeScript. */
const bookAddress = (file, dotted) => {
  const src = book?.get(file);
  if (!src) return null;
  const parts = dotted.split(".");
  if (parts.length === 1)
    return src.match(new RegExp(`export const ${parts[0]} =\\s*'(0x[0-9a-fA-F]{40})'`))?.[1] ?? null;
  const objStart = src.indexOf(`export const ${parts[0]} = {`);
  if (objStart < 0) return null;
  const obj = src.slice(objStart);
  const keyAt = obj.indexOf(`${parts[1]}: {`);
  if (keyAt < 0) return null;
  return obj.slice(keyAt).match(/STAKE_TOKEN: '(0x[0-9a-fA-F]{40})'/)?.[1] ?? null;
};
if (!book) {
  skip("1d the enumerator addresses are the ones Aave's address book publishes", "address book fetch failed");
  skip("1e every attested catalogue address is the address Aave's book publishes", "address book fetch failed");
} else {
  const bookStata = bookAddress("AaveV3Ethereum", "STATA_FACTORY")?.toLowerCase();
  const bookUmbrella = bookAddress("UmbrellaEthereum", "UMBRELLA")?.toLowerCase();
  check(
    "1d the two enumerators this section asks are the ones Aave's address book publishes",
    bookStata === CATALOG.stataFactory && bookUmbrella === CATALOG.umbrella,
    `stata ${bookStata}, umbrella ${bookUmbrella}`,
  );
  const wrong = CATALOG.entries
    .map((e) => ({ e, book: bookAddress(e.file, e.constant.split(".").slice(1).join("."))?.toLowerCase() ?? null }))
    .filter(({ e, book: b }) => b !== e.address);
  check(
    "1e every address the catalogue attests to a book constant is that constant's address at the pinned commit",
    wrong.length === 0,
    wrong
      .map(({ e, book: b }) => `${e.constant}: catalogue ${short(e.address)}, book ${b ? short(b) : "not found"}`)
      .join("; ") || `${CATALOG.entries.length} constants checked at ${CATALOG.commit.slice(0, 10)}`,
  );
}

// ── 2: every raw total equals this script's own read ────────────────────────
const totalMismatch = [];
let ownUnread = 0;
for (const r of rows) {
  const mine = OWN.get(r.address)?.totalAssets;
  if (mine == null) {
    ownUnread++;
    continue;
  }
  if (r.raw !== mine.toString()) totalMismatch.push(`${short(r.address)}: page ${r.raw} vs own ${mine}`);
}
check(
  `2  every row's raw totalAssets() equals this script's own read at block ${statedBlock}, wei-exact`,
  totalMismatch.length === 0 && ownUnread === 0,
  totalMismatch.slice(0, 3).join("; ") || `${rows.length} compared, ${ownUnread} own reads unanswered`,
);

// ── 3: grouping and order ───────────────────────────────────────────────────
const familySections = await page
  .locator("[data-family-group]")
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-family-group")));
const chainFamilies = [...new Set(CHAIN_ROSTER.map((r) => r.family))];
check(
  "3a one section per family the chain's roster contains, and no other",
  chainFamilies.every((f) => familySections.includes(f)) && familySections.length === chainFamilies.length,
  `sections ${JSON.stringify(familySections)}, chain families ${JSON.stringify(chainFamilies)}`,
);
const funded = rows.filter((r) => r.group === "funded");
const misplaced = funded.filter((r) => r.familyGroup !== CHAIN_FAMILY.get(r.address));
check(
  "3b every funded row sits in the section of the family the chain puts it in",
  misplaced.length === 0,
  misplaced
    .slice(0, 3)
    .map((r) => `${short(r.address)} in ${r.familyGroup}`)
    .join("; ") || `${funded.length} funded rows placed`,
);
let disorder = 0;
let assetBreaks = 0;
let comparablePairs = 0;
for (const family of familySections) {
  const inGroup = funded.filter((r) => r.familyGroup === family);
  const seen = new Set();
  let prevAsset = null;
  for (let i = 0; i < inGroup.length; i++) {
    const a = inGroup[i].asset;
    if (a !== prevAsset) {
      // A new asset must not be one already left behind (rows of one asset are
      // contiguous), and its symbol must sort after the previous asset's.
      if (seen.has(a)) assetBreaks++;
      if (prevAsset && (ASSET.get(a)?.symbol ?? "").localeCompare(ASSET.get(prevAsset)?.symbol ?? "", "en-US") < 0)
        assetBreaks++;
      seen.add(a);
      prevAsset = a;
      continue;
    }
    // Two funded rows of the SAME asset, in one family — the only pair the size
    // rule can be exercised on. Counted, because a run with none of them proves
    // nothing about the rule (see 3d).
    comparablePairs++;
    if (BigInt(inGroup[i].raw) > BigInt(inGroup[i - 1].raw)) disorder++;
  }
}
check(
  "3c inside a family, rows are contiguous by asset and ascending by asset symbol (this script's own symbol reads)",
  assetBreaks === 0,
  `${assetBreaks} breaks across ${familySections.length} families`,
);
// 🔑 VACUITY GUARD. Aave's catalogue has at most one funded vault per asset per
// family today — the stata factory allows one wrapper per underlying, each stake
// token holds a different wrapper, and sGHO is alone — so there is usually NO
// pair this rule can be exercised on, and a green "0 out-of-order pairs" would
// say nothing whatever about the comparator. Proved: reversing the comparator in
// the view left this check green (break B4). So it SKIPS out loud when it has no
// pair rather than passing.
if (comparablePairs === 0) {
  skip(
    "3d within ONE asset the totals are non-increasing",
    "no family holds two funded vaults of the same asset at this block — the size rule has no pair to order, and a pass would be vacuous",
  );
} else {
  check(
    "3d within ONE asset the totals are non-increasing — and two assets are never ordered against each other",
    disorder === 0,
    `${disorder} out-of-order pairs across ${comparablePairs} same-asset pairs`,
  );
}

// ── 4: the three kinds of row add up ────────────────────────────────────────
const emptyRows = rows.filter((r) => r.group === "empty");
const unreadRows = rows.filter((r) => r.group === "unread");
check(
  "4a funded + empty + unread == the roster the chain named",
  funded.length + emptyRows.length + unreadRows.length === CHAIN_ROSTER.length,
  `${funded.length} + ${emptyRows.length} + ${unreadRows.length} = ${funded.length + emptyRows.length + unreadRows.length} against ${CHAIN_ROSTER.length}`,
);
check("4b no vault went unread at this block", unreadRows.length === 0, `${unreadRows.length} unread`);

// ── 5: the empty group ──────────────────────────────────────────────────────
check(
  "5a the empty group is collapsed at rest (no rows in the DOM before the click)",
  hasEmptyGroup && emptyRowsBefore === 0,
  `${emptyRowsBefore} rows before the click`,
);
const statedEmpty = Number(
  ((await page.locator('[data-figure="empty-count"]').textContent()) ?? "")
    .replace(/,/g, "")
    .match(/(\d+) vaults?/)?.[1] ?? NaN,
);
const ownEmpty = CHAIN_ROSTER.filter((r) => OWN.get(r.address)?.totalAssets === BigInt(0)).length;
check(
  "5b expanded, it holds exactly the stated N rows, and N is this script's own count of zero readings",
  emptyRows.length === statedEmpty && statedEmpty === ownEmpty && emptyRows.every((r) => r.inEmpty),
  `stated ${statedEmpty}, drawn ${emptyRows.length}, own ${ownEmpty}`,
);

// ── 6: the print rule on the largest row of each family ─────────────────────
const printBad = [];
for (const family of familySections) {
  const inGroup = funded.filter((r) => r.familyGroup === family);
  const top = inGroup.reduce((a, b) => (a && BigInt(a.raw) >= BigInt(b.raw) ? a : b), null);
  if (!top) continue;
  const decimals = ASSET.get(OWN.get(top.address).asset)?.decimals;
  const want = expectedAmountText(OWN.get(top.address).totalAssets, Number(decimals));
  if (!top.amountText?.startsWith(want))
    printBad.push(`${family} ${short(top.address)}: "${top.amountText}" vs "${want}"`);
}
check(
  "6  the largest row of every family prints its total by the section's amount rule",
  printBad.length === 0 && familySections.length > 0,
  printBad.join("; ") || `${familySections.length} families sampled`,
);

// ── 7: the share price, and the decimals trap it exists for ─────────────────
const spBad = [];
for (const r of rows) {
  const mine = OWN.get(r.address)?.sharePrice;
  if (mine == null) continue;
  if (r.sharePriceRaw !== mine.toString())
    spBad.push(`${short(r.address)}: page ${r.sharePriceRaw} vs own ${mine} (10^${OWN.get(r.address).decimals})`);
}
check(
  "7a every row's raw share price equals this script's own convertToAssets(10 ** its own decimals), wei-exact",
  spBad.length === 0,
  spBad.slice(0, 3).join("; ") || `${rows.length} compared`,
);
const sixDec = rows.filter((r) => Number(OWN.get(r.address)?.decimals) === 6);
const eighteenDec = rows.filter((r) => Number(OWN.get(r.address)?.decimals) === 18);
check(
  "7b the comparison above covers a 6-decimal AND an 18-decimal share token — a sample of one class proves nothing",
  sixDec.length > 0 && eighteenDec.length > 0,
  `6-dec: ${sixDec.length} (e.g. ${sixDec[0] ? short(sixDec[0].address) : "none"}), 18-dec: ${eighteenDec.length} (e.g. ${eighteenDec[0] ? short(eighteenDec[0].address) : "none"})`,
);
const spTextBad = [];
for (const r of [sixDec[0], eighteenDec[0]].filter(Boolean)) {
  const o = OWN.get(r.address);
  const want = expectedSharePriceText(o.sharePrice, Number(ASSET.get(o.asset)?.decimals));
  if (!r.sharePriceText?.startsWith(want)) spTextBad.push(`${short(r.address)}: "${r.sharePriceText}" vs "${want}"`);
}
check(
  "7c the printed share price follows the share-price rule on one 6-decimal and one 18-decimal vault",
  spTextBad.length === 0,
  spTextBad.join("; ") || "both classes printed as expected",
);

// ── 8: no USD anywhere in the section ───────────────────────────────────────
// A chain-truth violation of this shape is an ADDITION — a "$" or a "USD" that
// was not there — so nothing else in this file would notice it. "USDC", "USDT"
// and "USDtb" are asset symbols and must not trip it, which is what the word
// boundary is for.
const sectionText = await page.locator("main, body").first().innerText();
const usdHits = [...sectionText.matchAll(/\$|\d[\d,]*(?:\.\d+)?\s?USD\b(?![A-Za-z])|\bUSD\s?\d[\d,]*(?:\.\d+)?/g)].map(
  (m) => m[0],
);
check(
  "8  the section states no USD figure — no dollar sign anywhere, and no amount beside a bare USD",
  usdHits.length === 0,
  usdHits.length ? `${usdHits.length} USD token(s): ${usdHits.slice(0, 3).join(", ")}` : "none in the rendered text",
);

// ── 9: the locale is pinned ─────────────────────────────────────────────────
// Every figure above was compared against a `toLocaleString("en-US")` of this
// script's own read, so a runtime-locale format would already have gone red on
// 6 and 7c. This check names the one figure those do not cover — the block —
// so the assertion is explicit rather than a side effect.
const blockText = ((await page.locator("[data-directory-block]").innerText()) ?? "").replace(/\s+/g, " ");
check(
  "9  the block is printed in en-US, not in the runtime's locale",
  blockText.includes(statedBlock.toLocaleString("en-US")),
  `wanted "${statedBlock.toLocaleString("en-US")}" in "${blockText.slice(0, 60)}…"`,
);

// ── 10: the dev provenance tripwire ─────────────────────────────────────────
if ((await page.locator("[data-prov-tripwire]").count()) > 0) {
  const uncovered = await page.locator("[data-prov-uncovered]").count();
  const texts = uncovered
    ? await page
        .locator("[data-prov-uncovered]")
        .evaluateAll((els) => els.slice(0, 3).map((e) => e.textContent?.trim()))
    : [];
  check(
    "10 the dev provenance tripwire reports no uncovered figure on the directory",
    uncovered === 0,
    uncovered ? `${uncovered} uncovered: ${texts.join(" · ")}` : "none",
  );
} else {
  skip(
    "10 the dev provenance tripwire reports no uncovered figure",
    "no tripwire bookends on this build (production renders none)",
  );
}

// ── 11: the chain switcher ──────────────────────────────────────────────────
// The drawn one: the bar keeps a hidden copy below `md` (ui-jobs 68).
await page.locator('button[aria-label="Switch blockchain"]:visible').click();
await page.waitForSelector("[role='menu']");
// The chains the panel OFFERS, read off the panel rather than listed here: it
// shows the launched chains (`launchedChains()`), so a hardcoded list here
// would drift the day one is flagged. Base launched with rails-ops decision
// 0030 (2026-09-23), so it is a column.
const chainButtons = await page
  .locator("[role='menu'] [data-chain-count]")
  .evaluateAll((els) => els.map((e) => (e.parentElement?.textContent ?? "").replace(/\s+/g, " ").trim()));
check(
  "11a the switcher offers a Base column now that Base is launched",
  chainButtons.some((t) => /^Base/.test(t)),
  JSON.stringify(chainButtons),
);
// NO chain has a Vaults row any more: rails-ops decision 0028 moved every vault
// inside the explorer whose factory deployed it, so the switcher's rows are
// roster entries and nothing else. Check 11b holds Aave's vault layer to what
// an UNLAUNCHED roster entry gets, which is no row at all.
const vaultsRowAny = await page
  .locator("[data-switcher-vaults]")
  .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
check(
  "11a′ no Vaults SECTION row on any offered chain — every vault is inside an explorer now",
  vaultsRowAny.length === 0,
  JSON.stringify(vaultsRowAny),
);
await page.locator("[role='menu'] button", { hasText: "Ethereum" }).click();
const aaveVaultsRow = await page
  .locator("[role='menu'] a[href='/ethereum/aave']")
  .evaluateAll((els) => els.map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim()));
// Aave's vault layer is UNLAUNCHED (lib/shared/protocols.ts `unlaunched`): it
// serves at /ethereum/aave/vaults and nothing on the site points at it, the
// switcher included. It becomes an ordinary row again when the flag comes off.
check(
  "11b …and Aave's vault layer is NOT a switcher row while it is unlaunched",
  aaveVaultsRow.length === 0,
  JSON.stringify(aaveVaultsRow),
);
await page.keyboard.press("Escape");

// ── 12: the coverage pages ──────────────────────────────────────────────────
const coverage = async (slug) => {
  await page.goto(`${BASE}/coverage/${slug}`, { waitUntil: "domcontentloaded" });
  const count = await page.locator("[data-coverage-vaults]").count();
  const href = count
    ? ((await (
        await page.locator("[data-coverage-vaults] a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")))
      ).find((h) => h === `/${slug}/vaults`)) ?? null)
    : null;
  return { count, href };
};
const covEth = await coverage("ethereum");
const covSep = await coverage("sepolia");
// The Vaults SECTION beneath the matrix is gone from every coverage page; the
// vault layer has a row IN the matrix instead, which is what 12b reads.
const covEthRow = await page
  .goto(`${BASE}/coverage/ethereum`, { waitUntil: "domcontentloaded" })
  .then(() => page.locator("a[href='/ethereum/aave']").evaluateAll((els) => els.length));
check(
  "12a no coverage page carries a Vaults section any more",
  covEth.count === 0 && covSep.count === 0,
  `ethereum ${covEth.count}, sepolia ${covSep.count}`,
);
check(
  "12b /coverage/ethereum carries no Aave vault-layer row while it is unlaunched",
  covEthRow === 0,
  `${covEthRow} link(s) to /ethereum/aave`,
);

// ── 12c: the retired section routes ─────────────────────────────────────────
// rails-ops decision 0028: the old paths 404 and NOTHING forwards, because a
// redirect would need a catalogue lookup in a route handler and would keep
// /ethereum/vaults alive as machinery for ever.
const retired = [
  "/ethereum/vaults",
  "/ethereum/vaults/directory",
  "/ethereum/vaults/info",
  "/ethereum/vaults/find",
  `/ethereum/vaults/${SGHO}`,
];
const retiredStatuses = [];
for (const route of retired) {
  const r = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
  retiredStatuses.push(`${route} ${r?.status()}`);
}
check(
  "12c every retired /ethereum/vaults route answers 404 (deleted, not redirected)",
  retiredStatuses.every((st) => st.endsWith(" 404")),
  retiredStatuses.join(", "),
);

// ── 13: each family's mechanic, against this script's own reads ─────────────
await openRoster();
const mechRows = (await readRows()).filter((r) => r.mechanicText != null);
// sGHO: the rate is in the family line, the cap in the row's mechanic cell.
const sghoRow = mechRows.find((r) => r.address === SGHO);
const sghoMech = await client.multicall({
  contracts: [
    { address: SGHO, abi: MECH_ABI, functionName: "targetRate" },
    { address: SGHO, abi: MECH_ABI, functionName: "supplyCap" },
  ],
  allowFailure: false,
  batchSize: 0,
  blockNumber,
});
const sghoLineEl = page.locator('[data-family-mechanic="sgho"]');
// A missing section is a FAILURE of 13a, never an exception: an unguarded
// locator would abort the run here and hide 13b and 13c behind it (the P5
// lesson in verify-base-vault-directory.mjs).
const sghoLine = (await sghoLineEl.count()) > 0 ? (await sghoLineEl.innerText()).replace(/\s+/g, " ") : "";
const wantRate = `${Number(sghoMech[0]).toLocaleString("en-US")} basis points`;
const wantCap = expectedAmountText(sghoMech[1], Number(ASSET.get(OWN.get(SGHO).asset)?.decimals));
check(
  "13a the sGHO family line states this script's own targetRate(), and the row its own supplyCap()",
  sghoLine.includes(wantRate) && Boolean(sghoRow?.mechanicText?.startsWith(wantCap)),
  `line wants "${wantRate}" (${sghoLine.includes(wantRate)}), cell "${sghoRow?.mechanicText}" wants "${wantCap}"`,
);
// stata: every row's printed aToken is that wrapper's own aToken().
const aTokens = await client.multicall({
  contracts: stata.map((a) => ({ address: a, abi: MECH_ABI, functionName: "aToken" })),
  allowFailure: true,
  batchSize: 0,
  blockNumber,
});
const aBad = [];
stata.forEach((a, i) => {
  const row = mechRows.find((r) => r.address === a);
  if (!row) return; // an empty stata row has no mechanic cell — 5b counts those
  const mine = aTokens[i].status === "success" ? aTokens[i].result.toLowerCase() : null;
  if (!mine) return aBad.push(`${short(a)}: own aToken() did not answer`);
  if (row.mechanicText !== short(mine)) aBad.push(`${short(a)}: page "${row.mechanicText}" vs own ${short(mine)}`);
});
check(
  "13b every static aToken row names the aToken this script's own aToken() call returns",
  aBad.length === 0,
  aBad.slice(0, 3).join("; ") || `${stata.filter((a) => mechRows.some((r) => r.address === a)).length} rows compared`,
);
// umbrella: cooldown, unstake window, the reserve reached by this script's own
// asset() hops, and Umbrella's own answer about that reserve.
const stakeMech = await client.multicall({
  contracts: stake.flatMap((s) => [
    { address: s, abi: MECH_ABI, functionName: "getCooldown" },
    { address: s, abi: MECH_ABI, functionName: "getUnstakeWindow" },
  ]),
  allowFailure: false,
  batchSize: 0,
  blockNumber,
});
const reserves = stake.map((s) => {
  const asset = OWN.get(s).asset;
  return OWN.has(asset) && OWN.get(asset).family === "stata" ? OWN.get(asset).asset : asset;
});
const slashable = await client.multicall({
  contracts: reserves.map((r) => ({
    address: CATALOG.umbrella,
    abi: MECH_ABI,
    functionName: "isReserveSlashable",
    args: [r],
  })),
  allowFailure: false,
  batchSize: 0,
  blockNumber,
});
const stakeBad = [];
stake.forEach((s, i) => {
  const row = mechRows.find((r) => r.address === s);
  if (!row) return stakeBad.push(`${short(s)}: no row`);
  const text = row.mechanicText.replace(/\s+/g, " ");
  const wantCooldown = `${expectedDuration(Number(stakeMech[i * 2]))}, then ${expectedDuration(Number(stakeMech[i * 2 + 1]))} to redeem`;
  const wantReserve = `covers ${ASSET.get(reserves[i])?.symbol}`;
  const wantSlash = slashable[i][0] ? "a deficit is outstanding" : "no deficit outstanding";
  if (!text.includes(wantCooldown) || !text.includes(wantReserve) || !text.includes(wantSlash))
    stakeBad.push(
      `${short(s)}: "${text}" wants "${wantCooldown}" + "${wantReserve}" + "${wantSlash}" (own ${stakeMech[i * 2]}s / ${stakeMech[i * 2 + 1]}s)`,
    );
});
check(
  "13c every stake token states this script's own cooldown, unstake window, reserve hop and slashable answer",
  stakeBad.length === 0 && stake.length > 0,
  stakeBad.slice(0, 2).join("; ") || `${stake.length} stake tokens compared`,
);

// ── 14: the citation block — Aave's own pages, and what it may not be ───────
// The block that stands where the provider tiles are drawn. Its claim
// is deliberately small — "Aave publishes these pages" — so the checks are about
// the two ways a small claim goes wrong: citing a URL that is not a page, and
// drifting into an attribution.
//
// THE EXPECTATION IS PINNED, THEN THE MODULE, THEN THE INTERNET. 14a judges the
// module against a list pinned in THIS script, so a page dropped from the module
// cannot take the expectation with it; 14b then asks whether the page rendered
// what the module lists; and 14c asks AAVE whether each URL answers, which is
// the half that can catch a citation this repo invented.
/** The five pages, PINNED HERE — the expectation for 14a, and the reason this
 *  section can see a citation the module dropped. Reading the set out of the
 *  module alone would move the expectation with the file under test: a module
 *  that dropped a page and a page that stopped rendering it would agree, and
 *  every check below would stay green over a shorter citation. This list is
 *  rails-ops `plans/aave-vaults-ethereum.md` §4B's, from outside this repo's
 *  code. */
const EXPECTED_FIRST_PARTY_URLS = [
  "https://aave.com/docs/ecosystem/gho/sgho",
  "https://aave.com/docs/aave-v3/umbrella",
  "https://aave.com/docs/aave-v3/smart-contracts/tokenization",
  "https://app.aave.com/sgho/",
  "https://app.aave.com/staking/",
];

const FIRST_PARTY = (() => {
  const src = fs.readFileSync(path.join(ROOT, "lib/aave-vaults/first-party-sources.ts"), "utf8");
  const body = src.slice(src.indexOf("export const AAVE_FIRST_PARTY_SOURCES"));
  const urls = [...body.matchAll(/\n\s+url: "(https:\/\/[^"]+)",/g)].map((m) => m[1]);
  const expected = (body.match(/\n\s+url: "https:\/\//g) || []).length;
  // The same completeness rule the catalogue parse above uses: a parse that read
  // fewer URLs than the module has is an ERROR, never a shorter expectation that
  // 14a would then satisfy while the page cited something else.
  if (urls.length === 0 || urls.length !== expected)
    throw new Error(`first-party-sources parse read ${urls.length} of ${expected} urls`);
  const fetchedOn = src.match(/AAVE_FIRST_PARTY_FETCHED_ON = "(\d{4}-\d{2}-\d{2})"/)?.[1];
  if (!fetchedOn) throw new Error("first-party-sources parse: no AAVE_FIRST_PARTY_FETCHED_ON");
  return { urls, fetchedOn };
})();

/** The URL this section must never cite. It answered 404 when the plan was
 *  written and answers a 308 redirect to the canonical sGHO page today — which
 *  is why 14d looks for its ABSENCE rather than trusting 14c's status test to
 *  reject it: a URL that resolves only by redirect would pass a followed fetch.
 *  Pinned here, in the script, so the expectation does not live in the file
 *  under test. */
const FORBIDDEN_URL = "https://aave.com/docs/aave-v3/guides/sgho";

/** The four apps the retired provider registry named. PINNED here rather than
 *  parsed: lib/shared/vault-providers.ts went with the find door it was written
 *  for (rails-ops decision 0028). 14f asserts none of them, and Aave itself, is
 *  named inside the citation block — the block is a citation, and a citation
 *  that named an app would be an attribution wearing a citation's clothes. */
const PROVIDER_NAMES = ["Coinbase", "MetaMask", "Uniswap", "Safe"];

const unlisted = EXPECTED_FIRST_PARTY_URLS.filter((u) => !FIRST_PARTY.urls.includes(u));
const unpinned = FIRST_PARTY.urls.filter((u) => !EXPECTED_FIRST_PARTY_URLS.includes(u));
check(
  `14a the module lists exactly the ${EXPECTED_FIRST_PARTY_URLS.length} pages this script pins — none dropped, none added`,
  unlisted.length === 0 && unpinned.length === 0,
  unlisted.length || unpinned.length
    ? `module is missing ${unlisted.join(", ") || "none"}; module adds ${unpinned.join(", ") || "none"}`
    : `${FIRST_PARTY.urls.length} matched, fetched ${FIRST_PARTY.fetchedOn}`,
);

await openRoster();
const citation = page.locator("[data-first-party-sources]");
const citationDrawn = (await citation.count()) === 1;
const citedHrefs = citationDrawn
  ? await citation.locator("a[href^='https://']").evaluateAll((els) => els.map((e) => e.getAttribute("href")))
  : [];
const missingCited = FIRST_PARTY.urls.filter((u) => !citedHrefs.includes(u));
const extraCited = citedHrefs.filter((u) => !FIRST_PARTY.urls.includes(u));
check(
  `14b the block renders every URL the module lists as an href, and no other (${FIRST_PARTY.urls.length})`,
  citationDrawn && missingCited.length === 0 && extraCited.length === 0,
  !citationDrawn
    ? "no citation block on the page"
    : missingCited.length || extraCited.length
      ? `not rendered ${missingCited.join(", ") || "none"}; rendered but unlisted ${extraCited.join(", ") || "none"}`
      : `${citedHrefs.length} hrefs matched`,
);

// Asked of AAVE, with redirects UNFOLLOWED: a citation is a claim that the URL
// written down is the page, and a 308 to somewhere else is a different page.
// `aave.com/docs/*` serves the same page as raw markdown, so those are asked
// twice and both answers have to be 200.
const badStatus = [];
for (const url of FIRST_PARTY.urls) {
  const r = await fetch(url, { redirect: "manual", headers: { "user-agent": "rails-verify/1.0" } }).catch((e) => ({
    status: `threw ${e.message.slice(0, 40)}`,
  }));
  if (r.status !== 200) badStatus.push(`${url} → ${r.status}`);
  if (url.startsWith("https://aave.com/docs/")) {
    const m = await fetch(url, {
      redirect: "manual",
      headers: { accept: "text/markdown", "user-agent": "rails-verify/1.0" },
    }).catch((e) => ({ status: `threw ${e.message.slice(0, 40)}` }));
    if (m.status !== 200) badStatus.push(`${url} (text/markdown) → ${m.status}`);
  }
}
check(
  "14c every cited URL answers 200 without a redirect, and the docs pages answer 200 as markdown too",
  badStatus.length === 0 && FIRST_PARTY.urls.length > 0,
  badStatus.join("; ") || `${FIRST_PARTY.urls.length} URLs answered`,
);

const pageHtml = await page.content();
check(
  "14d the URL that is not a page is cited nowhere in the section",
  !pageHtml.includes(FORBIDDEN_URL),
  `${FORBIDDEN_URL} ${pageHtml.includes(FORBIDDEN_URL) ? "IS PRESENT" : "absent"}`,
);

// The two sentences the block exists to carry, each asserted by the clause that
// carries its meaning rather than by the whole sentence — a rewording is allowed
// to keep the claim, and dropping the claim is not.
const citationText = citationDrawn ? (await citation.innerText()).replace(/\s+/g, " ") : "";
const wantClauses = [
  "a holder in this section is the holder’s own wallet address",
  "the section names no app on any row",
  "Rails states a reading for any address",
  "no per-address route",
];
const missingClause = wantClauses.filter((c) => !citationText.includes(c));
check(
  "14e the block states both facts — that a holder here is the holder's own address and no row names an app, and that Aave's surfaces carry no per-address route",
  citationDrawn && missingClause.length === 0,
  missingClause.length ? `missing "${missingClause.join('", "')}"` : `${wantClauses.length} clauses on the face`,
);

// The block is a citation. A tile inside it, or an app's name inside it, would
// make it an attribution — and Aave's own name on a TILE anywhere on the page
// would be the claim the whole tile rule refuses (plan §7): its app deploys no
// per-customer wallet, so no chain read on this chain identifies it behind a
// holder.
const tilesInside = citationDrawn ? await citation.locator("[data-provider-tile]").count() : 0;
const namedInside = citationDrawn ? PROVIDER_NAMES.filter((n) => citationText.includes(n)) : [];
const tileIds = await page
  .locator("[data-provider-tile]")
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-provider-tile")));
const aaveTile = tileIds.filter((id) => (id ?? "").includes("aave"));
check(
  "14f the block draws no tile and names no app, and no tile on the page is Aave's",
  citationDrawn && tilesInside === 0 && namedInside.length === 0 && aaveTile.length === 0,
  `${tilesInside} tiles inside; names inside ${namedInside.join(", ") || "none"}; aave tiles ${aaveTile.join(", ") || "none"}`,
);

await browser.close();
console.log(`\n${passes}/${passes + failures} checks passed${skipped ? ` · ${skipped} SKIP` : ""}`);
process.exit(failures > 0 ? 1 : 0);
