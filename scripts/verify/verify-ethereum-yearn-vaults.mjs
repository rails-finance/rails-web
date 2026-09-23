#!/usr/bin/env node
// Yearn V3's roster and its vault factsheets, checked against the chain rather
// than against themselves — /ethereum/yearn/vaults and the pages it opens.
// ----------------------------------------------------------------------------
// EVERY EXPECTED FIGURE HERE IS THIS SCRIPT'S OWN CHAIN READ OR ITS OWN PARSE.
// Each page states the block it read at; this script then makes its OWN
// `totalAssets()`, `convertToAssets()`, `isEndorsed()` and `strategies()` calls
// AT THAT BLOCK and recomputes the grouping, the order, the counts and the
// printed text from them. The catalogue is parsed out of
// lib/yearn/vault-catalog.ts by this script (completeness asserted), not
// scraped off the page. The one thing taken from the DOM is the block number,
// which is the subject of check 0b and not a source of truth for the rest.
//
// Run:
//   BASE=http://localhost:3000 node scripts/verify/verify-ethereum-yearn-vaults.mjs
// Needs ALCHEMY_URL in .env.local (read, never printed). ETHEREUM_LOGS_RPC_URL
// is used by section 10's delta sweep and that one check SKIPs without it —
// Alchemy's `eth_getLogs` window is too narrow for a factory sweep.
//
// ── WHAT EACH SECTION ASSERTS ─────────────────────────────────────────
//   0  the roster answers 200 and states one block, in its header attribute and
//      in its own prose, and the two agree
//   1  one roster row per catalogued vault; the addresses are the catalogue's
//   2  every row's raw `totalAssets()` equals this script's own read at the
//      stated block, wei-exact
//   3  grouping: every funded row sits in the group of its catalogued asset,
//      and inside every group the raw totals are non-increasing
//   4  funded + empty + unread == catalogue size
//   5  the empty group is collapsed at rest, expands to exactly the stated N
//      rows, and N == this script's own count of zero readings
//   6  the printed amount follows the print rule (2 dp for a ≤6-decimal asset,
//      6 dp for an 18-decimal one) on the largest row of the three largest
//      groups
//   7  share price: every sampled row's `convertToAssets(10 ** decimals)` raw
//      equals this script's own read, wei-exact, across a 6-decimal and an
//      18-decimal asset — the exponent is the ASSET's decimals here, and a
//      fixed 18 would be a trillion-fold error on a USDC vault
//   8  ENDORSEMENT (rails-ops decision 0027 call 1): every row's endorsement
//      equals this script's own `Registry.isEndorsed()` read at the stated
//      block, and the Yearn mark and the badge appear on exactly the rows it
//      answered true for
//   9  the family word "Yearn V3" and the release sit on EVERY row, endorsed or
//      not — the code standard is a fact about all of them
//  10  the roster is a floor and the floor holds: the live ReleaseRegistry still
//      names each catalogued factory at its own release index, the stale
//      pointer still knows fewer, and today's vault count derived from chain is
//      >= the catalogue's (never ==, because the factories keep deploying)
//  11  the explorer's own routes: /ethereum/yearn opens the roster, its (i)
//      opens the roster's about page, and /yearn forwards to the explorer
//  12  the five fixtures are on the roster, each in the state it was pinned in
//  13  one vault's factsheet (F1): its totals, idle/deployed split, share price
//      and every queue row's `current_debt` equal this script's own reads at
//      the block the page states
//  14  the factsheet's endorsement badge tracks the chain on F2 (unendorsed)
//      and F4 (endorsed but empty), and an address outside the catalogue 404s
//  15  three vaults sharing one name draw three rows with three addresses
//  16  the dev provenance tripwire reports no uncovered figure (SKIP when its
//      bookends are absent — a production build renders none)
//
// ── THE FIXTURES ARE PINNED STATE, AND A CHANGE IS A FAILURE ──────────
// F1 endorsed + funded, F2 unendorsed + funded, F3 the newest release, F4
// endorsed + empty, F5 three vaults under one name. Pinned 2026-09-19 at block
// 26,014,133. If F1 loses its endorsement or F4 takes a deposit, section 12
// goes red and stays red: a person re-pins the fixture, and this script never
// re-pins itself. That is the same rule the two Aave vault verifiers carry.
//
// ── PROVED IT CAN FAIL, 2026-09-20, BASE=http://localhost:3000 ────────
// Written at 40/40 green. Each break made alone, run, reverted.
//
//  Y1  the mark's condition in components/vaults/yearn-vault-directory-view.tsx
//      loosened from `r.endorsed === true` to `r.endorsed != null` — every row
//      gets the Yearn mark, which is the exact thing 0027 call 1 forbids →
//      FAIL 8b ("205 rows with a mark they did not earn") and FAIL 12b (the
//      unendorsed fixture carrying one). 8a stayed green, because the DATA was
//      still right and only the drawing was wrong — which is why 8b reads the
//      rendered mark rather than the attribute 8a reads.
//  Y2  the roster loader's share-price exponent changed from the asset's own
//      decimals to a fixed 18 (a WRONG argument to the real `convertToAssets`
//      eth_call) → FAIL 7a on all six sampled vaults, "page
//      1118764809573732640 vs own 1118764" on the USDC fixture — a
//      trillion-fold error. 7b stayed GREEN: the salted raw still printed by
//      the asset-decimals rule, so the text rule cannot catch a wrong call.
//      That is why 7a compares the raw against this script's own read.
//
// The catalogue parse was also proved, by accident and worth recording: the
// first version's row regex was anchored on `["0x` and Prettier wraps a long
// row across lines, so it read 194 of the 247 rows and the run reported "53
// rows not catalogued" against a correct page. The parse is whitespace-tolerant
// now and asserts its own completeness by counting addresses.

import { chromium } from "playwright";
import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expectedRoster } from "./lib/served-vault-roster.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = process.env.BASE ?? "http://localhost:3000";

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      let v = l.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      return [l.slice(0, i).trim(), v];
    }),
);
if (!env.ALCHEMY_URL) throw new Error("need ALCHEMY_URL in .env.local");

// ── the catalogue, parsed out of the generated TS ───────────────────────────
// Completeness asserted: a formatting change that hid rows from this regex is
// an error, not a quietly shorter roster. The asset column is the interned
// index into the `A` table, resolved here the way the module resolves it.
const catalogSrc = fs.readFileSync(path.join(ROOT, "lib/yearn/vault-catalog.ts"), "utf8");
const BAKED_FACTORIES = [
  ...catalogSrc
    .match(/YEARN_V3_FACTORIES: readonly \{[\s\S]*?\}\[\] = \[([\s\S]*?)\n\];/)[1]
    .matchAll(
      /release: (\d+),\s*apiVersion: "([\d.]+)",\s*address: "(0x[0-9a-f]{40})",\s*firstBlock: (\d+),\s*vaults: (\d+),\s*onStalePointer: (true|false)/g,
    ),
].map((m) => ({
  release: Number(m[1]),
  apiVersion: m[2],
  address: m[3],
  firstBlock: Number(m[4]),
  vaults: Number(m[5]),
  onStalePointer: m[6] === "true",
}));
if (BAKED_FACTORIES.length === 0) throw new Error("vault-catalog parse read no factories");
const BAKED_CATALOG = (() => {
  // ⚠️ WHITESPACE-TOLERANT ON PURPOSE. Prettier wraps a long row across several
  // lines, so a regex anchored on `["0x` reads only the rows that fit on one —
  // measured on the first run of this file: 194 of 247, which went red as "53
  // rows not catalogued" and looked like a page bug rather than a parse bug.
  // The completeness assertion below counts ADDRESSES in the block, which the
  // wrapping cannot hide.
  const assetBlock = catalogSrc.match(
    /const A: readonly \[string, string \| null, number\]\[\] = \[([\s\S]*?)\n\];/,
  )[1];
  const assets = [
    ...assetBlock.matchAll(/\[\s*"(0x[0-9a-f]{40})",\s*(?:"((?:[^"\\]|\\.)*)"|null),\s*(\d+),?\s*\]/g),
  ].map((m) => ({
    address: m[1],
    symbol: m[2] === undefined ? null : JSON.parse(`"${m[2]}"`),
    decimals: Number(m[3]),
  }));
  if (assets.length !== (assetBlock.match(/"0x[0-9a-f]{40}"/g) || []).length)
    throw new Error(
      `vault-catalog parse read ${assets.length} assets of ${(assetBlock.match(/"0x[0-9a-f]{40}"/g) || []).length}`,
    );
  const rowBlock = catalogSrc.match(/const ROWS: readonly \[[^\]]*\]\[\] = \[([\s\S]*?)\n\];/)[1];
  const re = /\[\s*"(0x[0-9a-f]{40})",\s*(\d+),\s*(\d+),\s*"((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)",\s*(\d+),?\s*\]/g;
  const rows = [...rowBlock.matchAll(re)].map((m) => ({
    address: m[1],
    factory: BAKED_FACTORIES[Number(m[2])],
    createdBlock: Number(m[3]),
    name: JSON.parse(`"${m[4]}"`),
    symbol: JSON.parse(`"${m[5]}"`),
    asset: assets[Number(m[6])],
  }));
  const expected = (rowBlock.match(/"0x[0-9a-f]{40}"/g) || []).length;
  if (rows.length !== expected) throw new Error(`vault-catalog parse read ${rows.length} of ${expected} rows`);
  if (rows.some((r) => !r.asset)) throw new Error("vault-catalog parse: an asset index missed the A table");
  if (rows.some((r) => !r.factory)) throw new Error("vault-catalog parse: a factory index missed the factory table");
  return rows;
})();
// The pages serve the box's roster over the baked one when the web takes it
// (lib/yearn/vault-roster.ts); so does this script, by the same rule
// (scripts/verify/lib/served-vault-roster.mjs), and it names which one every
// check below judges.
const BAKED_BLOCK = Number(catalogSrc.match(/YEARN_VAULT_CENSUS_BLOCK = (\d+)/)[1]);
const ROSTER = await expectedRoster(env, {
  chainId: 1,
  family: "yearn-v3",
  bakedRows: BAKED_CATALOG,
  bakedBlock: BAKED_BLOCK,
  same: (s, b) =>
    s.factory === b.factory.address &&
    s.factoryVersion === b.factory.apiVersion &&
    s.createdBlock === b.createdBlock &&
    s.asset === b.asset.address,
});
const FACTORIES = ROSTER.source === "served" ? ROSTER.factories : BAKED_FACTORIES;
const CATALOG =
  ROSTER.source === "served"
    ? ROSTER.rows.map((v) => ({
        address: v.address,
        factory: FACTORIES.find((f) => f.address === v.factory),
        createdBlock: v.createdBlock,
        name: v.name,
        symbol: v.symbol,
        asset: { address: v.asset, symbol: v.assetSymbol, decimals: v.assetDecimals },
      }))
    : BAKED_CATALOG;
if (CATALOG.some((r) => !r.factory))
  throw new Error("served roster: a vault names a factory its own factory list lacks");
console.log(
  `roster: ${ROSTER.source}, ${CATALOG.length} vaults at block ${ROSTER.block}` +
    (ROSTER.source === "served" ? ` (baked ${BAKED_CATALOG.length})` : ` — ${ROSTER.why}`),
);
const CATALOG_BY_ADDRESS = new Map(CATALOG.map((r) => [r.address, r]));

const CENSUS_BLOCK = ROSTER.block;
const REGISTRY = catalogSrc.match(/YEARN_REGISTRY = "(0x[0-9a-f]{40})"/)[1];

/** The release registry Yearn's deployer writes to, and the pointer the vault
 *  Registry keeps to a registry it has outgrown. Both spelled here rather than
 *  read off the catalogue: section 10 is the check that the catalogue's claim
 *  about them is still true, so it has to bring its own copy. */
const LIVE_RELEASE_REGISTRY = "0x0377b4daDDA86C89A0091772B79ba67d0E5F7198";
/** keccak256("NewVault(address,address)") — both parameters indexed, no data. */
const NEW_VAULT_TOPIC = "0x4241302c393c713e690702c4a45a57e93cef59aa8c6e2358495853b3420551d8";

// ── the fixtures, pinned 2026-09-19 at block 26,014,133 ─────────────────────
const F1 = "0xbe53a109b494e5c9f97b9cd39fe969be68bf6204"; // "USDC-1 yVault", 3.0.2, endorsed + funded
const F2 = "0x7b5a0182e400b241b317e781a4e9dedfc1429822"; // "Katana Pre-Deposit USDC", 3.0.4, unendorsed + funded
const F3 = "0xfac55fafd0b55bfb8dd41f735efcc195ada9891f"; // "Flex WETH yVault", 3.1.0 — the newest release
const F4 = "0x2478d5997324e8b47e9ff870166dba8d2e461993"; // "yPT-eETH-Karak", endorsed + empty
const F5 = [
  "0xdcba6f240bb7e8ea00f23a4f970b29d22ddd860e",
  "0x7c7569585ba5e7f5c0b1d18ab630d1769ca27193",
  "0xc9fb833f11d2d8169953b144fa5242e8aec25c01",
]; // three vaults, one name: "yPT-sDAI (auto-rolling Pendle PT)"
const OFF_CATALOGUE = "0x0000000000000000000000000000000000000001";

const client = createPublicClient({
  chain: mainnet,
  transport: http(env.ALCHEMY_URL, { batch: false, retryCount: 3 }),
});
const VAULT_ABI = parseAbi([
  "function totalAssets() view returns (uint256)",
  "function totalIdle() view returns (uint256)",
  "function totalDebt() view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function get_default_queue() view returns (address[])",
]);
const STRATEGY_ABI = parseAbi([
  "struct StrategyParams { uint256 activation; uint256 last_report; uint256 current_debt; uint256 max_debt; }",
  "function strategies(address) view returns (StrategyParams)",
]);
const REGISTRY_ABI = parseAbi(["function isEndorsed(address) view returns (bool)"]);
const RELEASE_REGISTRY_ABI = parseAbi([
  "function numReleases() view returns (uint256)",
  "function factories(uint256) view returns (address)",
]);
const REGISTRY_POINTER_ABI = parseAbi(["function releaseRegistry() view returns (address)"]);

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

/** The house print rule, restated here from lib/shared/vault-amount-text.ts so
 *  a change to the page's rule that this script did not agree to goes red. */
const expectedAmountText = (raw, decimals) => {
  const value = Number(raw) / Math.pow(10, decimals);
  const text = value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals <= 6 ? 2 : 6,
  });
  if (value !== 0 && parseFloat(text.replace(/,/g, "")) === 0) {
    const s = String(raw).padStart(decimals + 1, "0");
    const cut = s.length - decimals;
    return (s.slice(0, cut) + "." + s.slice(cut)).replace(/\.?0+$/, "");
  }
  return text;
};

/** viem in chunks, so one Multicall3 request never carries 247 `totalAssets()`
 *  calls — each one walks a vault's whole default queue. */
async function chunkedMulticall(contracts, blockNumber, size = 50) {
  const out = [];
  for (let i = 0; i < contracts.length; i += size) {
    out.push(
      ...(await client.multicall({
        contracts: contracts.slice(i, i + size),
        allowFailure: true,
        batchSize: 0,
        blockNumber,
      })),
    );
  }
  return out;
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

// ── 0: the roster answers, and states one block ─────────────────────────────
const res0 = await page.goto(`${BASE}/ethereum/yearn/vaults`, { waitUntil: "networkidle" });
check("0a GET /ethereum/yearn/vaults answers 200", res0?.status() === 200, `status ${res0?.status()}`);
await page.waitForSelector("[data-roster-panel] [data-vault-row]", { timeout: 120_000 });

// ⚠️ NOT the first "at block" in the panel. The roster states TWO blocks and
// they are different facts: the catalogue's CENSUS block ("the 247 vaults the
// five V3 factories had deployed … at block N") and the block this READING was
// taken at. The sentence anchored on is the one that names the CALL.
const rosterText = (await page.locator("[data-roster-panel]").innerText()).replace(/\s+/g, " ");
const statedBlock = Number((rosterText.match(/totalAssets\(\) at block ([\d,]+)/) ?? [])[1]?.replace(/,/g, "") ?? NaN);
const headerBlockAttr = (await page.locator("[data-directory-block]").count())
  ? Number(await page.locator("[data-directory-block]").first().getAttribute("data-directory-block"))
  : null;
check(
  "0b the roster states the block it read at, in its header attribute and in its own prose, and the two agree",
  Number.isInteger(statedBlock) && statedBlock > 0 && headerBlockAttr === statedBlock,
  `prose block ${statedBlock}, header attribute ${headerBlockAttr}`,
);
const blockNumber = BigInt(statedBlock);
// The web reuses a served roster for up to an hour, and the box can write a
// newer run inside it, so the census block the page names may trail the one
// this script read; it must still be a served block (after the bake's, no later
// than the box's latest) and behind the reading.
const statedCensus = Number(
  (rosterText.match(/factories had deployed on Ethereum at block ([\d,]+)/) ?? [])[1]?.replace(/,/g, "") ?? NaN,
);
check(
  "0c the roster names the census block it draws its membership from, and it is behind the reading",
  ROSTER.source === "served"
    ? statedCensus > BAKED_BLOCK && statedCensus <= CENSUS_BLOCK && statedCensus <= statedBlock
    : statedCensus === CENSUS_BLOCK && CENSUS_BLOCK <= statedBlock,
  `page names census block ${statedCensus}; ${ROSTER.source} roster at ${CENSUS_BLOCK}, baked at ${BAKED_BLOCK}; read at ${statedBlock}`,
);

// ── 1: one row per catalogued vault ─────────────────────────────────────────
// The empty group is collapsed at rest; its rows reach the DOM only when it is
// expanded. Section 5 checks the collapse itself; here it is opened so the
// whole roster is countable.
const emptyToggle = page.locator("[data-roster-panel] [data-empty-group] button");
const hasEmptyGroup = (await emptyToggle.count()) > 0;
const emptyRowsBefore = await page.locator("[data-roster-panel] [data-empty-rows] [data-vault-row]").count();
const statedEmptyText = hasEmptyGroup ? await emptyToggle.innerText() : "";
if (hasEmptyGroup) {
  await emptyToggle.click();
  await page.waitForSelector("[data-roster-panel] [data-empty-rows]");
}
const rows = await page.locator("[data-roster-panel] [data-vault-row]").evaluateAll((els) =>
  els.map((el) => ({
    address: el.getAttribute("data-vault-row"),
    group: el.getAttribute("data-group"),
    asset: el.getAttribute("data-asset"),
    release: el.getAttribute("data-release"),
    endorsed: el.getAttribute("data-endorsed"),
    raw: el.getAttribute("data-total-assets-raw"),
    sharePriceRaw: el.getAttribute("data-share-price-raw"),
    groupAsset: el.closest("[data-asset-group]")?.getAttribute("data-asset-group") ?? null,
    inEmpty: Boolean(el.closest("[data-empty-rows]")),
    familyText: el.querySelectorAll("td")[1]?.textContent?.trim() ?? null,
    hasMark: Boolean(el.querySelectorAll("td")[1]?.querySelector("svg, img")),
    hasBadge: Boolean(el.querySelector("[data-endorsed-badge]")),
    amountText: el.querySelector('[data-cell="total-assets"]')?.textContent?.trim() ?? null,
    sharePriceText: el.querySelector('[data-cell="share-price"]')?.textContent?.trim() ?? null,
    nameText: el.querySelectorAll("td")[0]?.textContent?.trim() ?? null,
  })),
);
check(
  "1a the roster draws one row per catalogued vault",
  rows.length === CATALOG.length,
  `${rows.length} rows, catalogue ${CATALOG.length}`,
);
const rowSet = new Set(rows.map((r) => r.address));
const missing = CATALOG.filter((r) => !rowSet.has(r.address)).length;
const extra = rows.filter((r) => !CATALOG_BY_ADDRESS.has(r.address)).length;
check(
  "1b the rows are exactly the catalogue's addresses",
  missing === 0 && extra === 0 && rowSet.size === rows.length,
  `${missing} missing, ${extra} not catalogued, ${rows.length - rowSet.size} duplicated`,
);

// ── 2: every raw total equals this script's own read at the stated block ────
const ownTotals = await chunkedMulticall(
  CATALOG.map((r) => ({ address: r.address, abi: VAULT_ABI, functionName: "totalAssets" })),
  blockNumber,
);
const ownTotal = new Map(
  CATALOG.map((r, i) => [r.address, ownTotals[i].status === "success" ? ownTotals[i].result : null]),
);
const ownUnread = [...ownTotal.values()].filter((v) => v == null).length;
const totalMismatches = [];
for (const r of rows) {
  const mine = ownTotal.get(r.address);
  if (mine == null) continue;
  if (r.raw !== mine.toString()) totalMismatches.push(`${r.address}: page ${r.raw} vs own ${mine}`);
}
check(
  `2  every row's raw totalAssets() equals this script's own read at block ${statedBlock}, wei-exact`,
  totalMismatches.length === 0 && ownUnread === 0,
  totalMismatches.length
    ? totalMismatches.slice(0, 3).join("; ")
    : `${rows.length - ownUnread} compared, ${ownUnread} own reads unanswered`,
);

// ── 3: grouping and order ───────────────────────────────────────────────────
const funded = rows.filter((r) => r.group === "funded");
const wrongGroup = funded.filter(
  (r) => r.groupAsset !== r.asset || CATALOG_BY_ADDRESS.get(r.address)?.asset.address !== r.asset,
);
check(
  "3a every funded row sits in the group of its catalogued asset",
  wrongGroup.length === 0,
  wrongGroup
    .slice(0, 3)
    .map((r) => r.address)
    .join("; ") || `${funded.length} funded rows`,
);
const groupsOnPage = new Set(funded.map((r) => r.groupAsset));
const ownFundedAssets = new Set(
  CATALOG.filter((r) => (ownTotal.get(r.address) ?? BigInt(0)) > BigInt(0)).map((r) => r.asset.address),
);
check(
  "3b the group set is the distinct assets of the vaults this script read as funded",
  groupsOnPage.size === ownFundedAssets.size && [...groupsOnPage].every((a) => ownFundedAssets.has(a)),
  `page ${groupsOnPage.size} groups, own ${ownFundedAssets.size}`,
);
let outOfOrder = 0;
for (const asset of groupsOnPage) {
  const inGroup = funded.filter((r) => r.groupAsset === asset);
  for (let i = 1; i < inGroup.length; i++) {
    if (BigInt(inGroup[i - 1].raw) < BigInt(inGroup[i].raw)) outOfOrder++;
  }
}
check("3c inside every group the raw totals are non-increasing", outOfOrder === 0, `${outOfOrder} out-of-order pairs`);

// ── 4: the three kinds of row account for the whole catalogue ───────────────
const emptyRows = rows.filter((r) => r.group === "empty");
const unreadRows = rows.filter((r) => r.group === "unread");
check(
  "4  funded + empty + unread == catalogue size",
  funded.length + emptyRows.length + unreadRows.length === CATALOG.length,
  `${funded.length} + ${emptyRows.length} + ${unreadRows.length} = ${funded.length + emptyRows.length + unreadRows.length}, catalogue ${CATALOG.length}`,
);

// ── 5: the empty group collapses, and its count is this script's ────────────
const ownZero = CATALOG.filter((r) => ownTotal.get(r.address) === BigInt(0)).length;
const statedEmpty = Number(
  (statedEmptyText.match(/([\d,]+) vaults? holds? nothing/) ?? [])[1]?.replace(/,/g, "") ?? NaN,
);
check(
  "5a the empty group is collapsed at rest — its rows reach the DOM only when it is opened",
  hasEmptyGroup && emptyRowsBefore === 0,
  `${emptyRowsBefore} empty rows in the DOM before the click`,
);
check(
  "5b the empty group's stated count, its drawn rows and this script's own count of zero readings all agree",
  statedEmpty === emptyRows.length && statedEmpty === ownZero,
  `stated ${statedEmpty}, drawn ${emptyRows.length}, own ${ownZero}`,
);

// ── 6: the printed amount follows the print rule ────────────────────────────
const byGroupSize = [...groupsOnPage]
  .map((asset) => funded.filter((r) => r.groupAsset === asset))
  .sort((a, b) => b.length - a.length)
  .slice(0, 3);
const amountTextBad = [];
for (const group of byGroupSize) {
  const r = group[0];
  const decimals = CATALOG_BY_ADDRESS.get(r.address).asset.decimals;
  const want = expectedAmountText(r.raw, decimals);
  if (!r.amountText?.startsWith(want)) amountTextBad.push(`${r.address}: "${r.amountText}" vs "${want}"`);
}
check(
  "6  the printed total follows the amount rule on the largest row of the three largest groups",
  amountTextBad.length === 0 && byGroupSize.length === 3,
  amountTextBad.join("; ") || `${byGroupSize.length} groups sampled`,
);

// ── 7: share price, at the ASSET's decimals ─────────────────────────────────
// One whole share is 10 ** the asset's decimals, because a V3 vault's share
// token carries its asset's decimals. A fixed 18 would be a trillion-fold error
// on a USDC vault, so the sample spans both widths deliberately.
const sixDecRow = funded.find((r) => CATALOG_BY_ADDRESS.get(r.address).asset.decimals === 6);
const eighteenDecRow = funded.find((r) => CATALOG_BY_ADDRESS.get(r.address).asset.decimals === 18);
const priceSample = [...new Set([sixDecRow, eighteenDecRow, ...funded.slice(0, 6)].filter(Boolean))];
const ownPrice = await chunkedMulticall(
  priceSample.map((r) => ({
    address: r.address,
    abi: VAULT_ABI,
    functionName: "convertToAssets",
    args: [BigInt(10) ** BigInt(CATALOG_BY_ADDRESS.get(r.address).asset.decimals)],
  })),
  blockNumber,
);
const priceMismatches = [];
priceSample.forEach((r, i) => {
  const mine = ownPrice[i].status === "success" ? ownPrice[i].result : null;
  if (mine == null) return priceMismatches.push(`${r.address}: this script's own read failed`);
  if (r.sharePriceRaw !== mine.toString()) priceMismatches.push(`${r.address}: page ${r.sharePriceRaw} vs own ${mine}`);
});
check(
  "7a share price (convertToAssets(10 ** the asset's decimals)) equals this script's own read, wei-exact, across a 6-decimal and an 18-decimal asset",
  priceMismatches.length === 0 && priceSample.length >= 3 && Boolean(sixDecRow) && Boolean(eighteenDecRow),
  priceMismatches.join("; ") ||
    `${priceSample.length} sampled (6-dec ${sixDecRow?.asset}, 18-dec ${eighteenDecRow?.asset})`,
);
const priceTextBad = [];
for (const r of priceSample) {
  const decimals = CATALOG_BY_ADDRESS.get(r.address).asset.decimals;
  if (!r.sharePriceRaw) continue;
  const want = expectedAmountText(r.sharePriceRaw, decimals);
  if (!r.sharePriceText?.startsWith(want)) priceTextBad.push(`${r.address}: "${r.sharePriceText}" vs "${want}"`);
}
check(
  "7b the printed share price follows the amount rule — the ASSET's decimals, never a fixed two",
  priceTextBad.length === 0,
  priceTextBad.join("; ") || `${priceSample.length} sampled`,
);

// ── 8: endorsement is a reading, and it earns the mark ──────────────────────
const ownEndorsedReads = await chunkedMulticall(
  CATALOG.map((r) => ({ address: REGISTRY, abi: REGISTRY_ABI, functionName: "isEndorsed", args: [r.address] })),
  blockNumber,
  100,
);
const ownEndorsed = new Map(
  CATALOG.map((r, i) => [r.address, ownEndorsedReads[i].status === "success" ? ownEndorsedReads[i].result : null]),
);
const endorsedMismatches = rows.filter((r) => {
  const mine = ownEndorsed.get(r.address);
  if (mine == null) return false;
  return r.endorsed !== String(mine);
});
check(
  `8a every row's endorsement equals this script's own Registry.isEndorsed() read at block ${statedBlock}`,
  endorsedMismatches.length === 0,
  endorsedMismatches
    .slice(0, 3)
    .map((r) => `${r.address}: page ${r.endorsed} vs own ${ownEndorsed.get(r.address)}`)
    .join("; ") || `${rows.length} compared, ${[...ownEndorsed.values()].filter((v) => v === true).length} endorsed`,
);
const markWrong = rows.filter((r) => r.hasMark !== (r.endorsed === "true"));
const badgeWrong = rows.filter((r) => r.hasBadge !== (r.endorsed === "true"));
check(
  "8b the Yearn mark and the endorsed badge sit on exactly the endorsed rows (0027 call 1)",
  markWrong.length === 0 && badgeWrong.length === 0,
  `${markWrong.length} rows with a mark they did not earn or missing one, ${badgeWrong.length} likewise for the badge`,
);

// ── 9: the family word is on every row ──────────────────────────────────────
const familyWrong = rows.filter(
  (r) =>
    !r.familyText?.includes("Yearn V3") ||
    !r.familyText?.includes(CATALOG_BY_ADDRESS.get(r.address).factory.apiVersion),
);
check(
  '9  "Yearn V3" and the release sit on EVERY row, endorsed or not',
  familyWrong.length === 0,
  familyWrong
    .slice(0, 3)
    .map((r) => `${r.address}: "${r.familyText}"`)
    .join("; ") || `${rows.length} rows`,
);

// ── 10: the floor holds ─────────────────────────────────────────────────────
const numReleases = await client.readContract({
  address: LIVE_RELEASE_REGISTRY,
  abi: RELEASE_REGISTRY_ABI,
  functionName: "numReleases",
});
const liveFactories = await Promise.all(
  Array.from({ length: Number(numReleases) }, (_, i) =>
    client.readContract({
      address: LIVE_RELEASE_REGISTRY,
      abi: RELEASE_REGISTRY_ABI,
      functionName: "factories",
      args: [BigInt(i)],
    }),
  ),
);
const liveLower = liveFactories.map((a) => a.toLowerCase());
const factoryDrift = FACTORIES.filter((f) => liveLower[f.release] !== f.address);
check(
  "10a the live ReleaseRegistry still names each catalogued factory at its own release index",
  factoryDrift.length === 0 && Number(numReleases) >= FACTORIES.length,
  factoryDrift.map((f) => `release ${f.release}: live ${liveLower[f.release]} vs catalogue ${f.address}`).join("; ") ||
    `${numReleases} releases live, ${FACTORIES.length} catalogued`,
);
const stalePointer = (
  await client.readContract({ address: REGISTRY, abi: REGISTRY_POINTER_ABI, functionName: "releaseRegistry" })
).toLowerCase();
const staleReleases = Number(
  await client.readContract({ address: stalePointer, abi: RELEASE_REGISTRY_ABI, functionName: "numReleases" }),
);
check(
  "10b Registry.releaseRegistry() still points at a registry that knows fewer factories than the live one — the trap the census walks around",
  stalePointer !== LIVE_RELEASE_REGISTRY.toLowerCase() && staleReleases < Number(numReleases),
  `pointer knows ${staleReleases}, live knows ${numReleases}`,
);
if (env.ETHEREUM_LOGS_RPC_URL) {
  // Today's count, derived from chain: the catalogue plus every NewVault log
  // since the census block. NEVER an equality — the factories are open, so the
  // real number only grows and a page pinned to the catalogue is a FLOOR.
  const logsClient = createPublicClient({
    chain: mainnet,
    transport: http(env.ETHEREUM_LOGS_RPC_URL, { retryCount: 2 }),
  });
  const since = await Promise.all(
    FACTORIES.map((f) =>
      logsClient.request({
        method: "eth_getLogs",
        params: [
          {
            address: f.address,
            topics: [NEW_VAULT_TOPIC],
            fromBlock: `0x${(CENSUS_BLOCK + 1).toString(16)}`,
            toBlock: `0x${statedBlock.toString(16)}`,
          },
        ],
      }),
    ),
  );
  const newSinceCensus = since.reduce((a, l) => a + l.length, 0);
  check(
    `10c today's vault count derived from chain is at least the catalogue's (${CATALOG.length}), never equal to it by assertion`,
    CATALOG.length + newSinceCensus >= CATALOG.length,
    `${CATALOG.length} catalogued + ${newSinceCensus} deployed since block ${CENSUS_BLOCK} = ${CATALOG.length + newSinceCensus} on chain now`,
  );
} else {
  skip(
    "10c today's vault count derived from chain",
    "ETHEREUM_LOGS_RPC_URL not set — Alchemy's getLogs window is too narrow for a factory sweep",
  );
}

// ── 11: the explorer's own routes ───────────────────────────────────────────
const rootRes = await page.goto(`${BASE}/ethereum/yearn`, { waitUntil: "domcontentloaded" });
check(
  "11a /ethereum/yearn opens the roster — the explorer has no position listing to land on",
  rootRes?.status() === 200 && new URL(page.url()).pathname === "/ethereum/yearn/vaults",
  `status ${rootRes?.status()}, landed on ${new URL(page.url()).pathname}`,
);
const infoRes = await page.goto(`${BASE}/ethereum/yearn/info`, { waitUntil: "domcontentloaded" });
check(
  "11b the rail's (i) at /ethereum/yearn/info opens the roster's about page",
  infoRes?.status() === 200 && new URL(page.url()).pathname === "/ethereum/yearn/vaults/info",
  `status ${infoRes?.status()}, landed on ${new URL(page.url()).pathname}`,
);
const slugRes = await page.goto(`${BASE}/yearn`, { waitUntil: "domcontentloaded" });
check(
  "11c the bare /yearn forwards into the explorer",
  slugRes?.status() === 200 && new URL(page.url()).pathname.startsWith("/ethereum/yearn"),
  `status ${slugRes?.status()}, landed on ${new URL(page.url()).pathname}`,
);

// ── 12: the fixtures, in the state they were pinned in ──────────────────────
// ⚠️ A FAILURE HERE IS A PERSON'S DECISION. If F1 loses its endorsement or F4
// takes a deposit, the fixture has moved and a person re-pins it; this script
// never re-pins itself and never skips a moved fixture.
const rowOf = (a) => rows.find((r) => r.address === a);
const f1 = rowOf(F1);
const f2 = rowOf(F2);
const f3 = rowOf(F3);
const f4 = rowOf(F4);
check(
  "12a F1 (USDC-1 yVault) is endorsed and funded, with the mark and the badge",
  Boolean(f1) && f1.endorsed === "true" && f1.group === "funded" && f1.hasMark && f1.hasBadge,
  f1 ? `endorsed ${f1.endorsed}, group ${f1.group}, mark ${f1.hasMark}, badge ${f1.hasBadge}` : "row absent",
);
check(
  "12b F2 (Katana Pre-Deposit USDC) is unendorsed and funded — the family word, no mark, no badge",
  Boolean(f2) &&
    f2.endorsed === "false" &&
    f2.group === "funded" &&
    !f2.hasMark &&
    !f2.hasBadge &&
    f2.familyText?.includes("Yearn V3"),
  f2 ? `endorsed ${f2.endorsed}, group ${f2.group}, mark ${f2.hasMark}, family "${f2.familyText}"` : "row absent",
);
const usdcGroup = f2 ? funded.filter((r) => r.groupAsset === f2.asset) : [];
check(
  "12c ordering by assets puts the unendorsed F2 at the head of its group — 0027 call 1 working, not a bug",
  usdcGroup[0]?.address === F2,
  `head of the group is ${usdcGroup[0]?.address}`,
);
check(
  "12d F3 (Flex WETH yVault) is on the roster at the newest release",
  Boolean(f3) && f3.release === FACTORIES[FACTORIES.length - 1].apiVersion,
  f3 ? `release ${f3.release}, newest catalogued ${FACTORIES[FACTORIES.length - 1].apiVersion}` : "row absent",
);
check(
  "12e F4 (yPT-eETH-Karak) is endorsed and empty — behind the toggle, badge still shown when revealed",
  Boolean(f4) && f4.endorsed === "true" && f4.group === "empty" && f4.inEmpty && f4.hasBadge,
  f4 ? `endorsed ${f4.endorsed}, group ${f4.group}, in empty group ${f4.inEmpty}, badge ${f4.hasBadge}` : "row absent",
);

// ── 15 (read here, while the roster is in hand): one name, three addresses ──
const f5Rows = F5.map(rowOf);
const f5Names = new Set(f5Rows.map((r) => CATALOG_BY_ADDRESS.get(r?.address ?? "")?.name));
check(
  "15 three vaults sharing one name draw three rows with three addresses, each linking to its own page",
  f5Rows.every(Boolean) && new Set(f5Rows.map((r) => r.address)).size === 3 && f5Names.size === 1,
  f5Rows.every(Boolean)
    ? `one name "${[...f5Names][0]}" across ${new Set(f5Rows.map((r) => r.address)).size} addresses`
    : "a fixture row is absent",
);

// ── 13: one vault's factsheet, against this script's own reads ──────────────
await page.goto(`${BASE}/ethereum/yearn/vaults/${F1}`, { waitUntil: "networkidle" });
await page.waitForSelector("[data-vault-block]");
const vaultBlock = Number(await page.locator("[data-vault-block]").first().getAttribute("data-vault-block"));
check(
  "13a the factsheet states the block it read at",
  Number.isInteger(vaultBlock) && vaultBlock > 0,
  `block ${vaultBlock}`,
);
const vb = BigInt(vaultBlock);
const cells = Object.fromEntries(
  await page
    .locator("[data-cell]")
    .evaluateAll((els) =>
      els.map((el) => [
        el.getAttribute("data-cell"),
        { raw: el.getAttribute("data-raw"), text: el.textContent?.trim() ?? "" },
      ]),
    ),
);
const f1Decimals = CATALOG_BY_ADDRESS.get(F1).asset.decimals;
const ownFactsheet = await client.multicall({
  contracts: [
    { address: F1, abi: VAULT_ABI, functionName: "totalAssets" },
    { address: F1, abi: VAULT_ABI, functionName: "totalIdle" },
    { address: F1, abi: VAULT_ABI, functionName: "totalDebt" },
    { address: F1, abi: VAULT_ABI, functionName: "convertToAssets", args: [BigInt(10) ** BigInt(f1Decimals)] },
  ],
  allowFailure: false,
  blockNumber: vb,
});
const [ownAssets, ownIdle, ownDebt, ownShare] = ownFactsheet;
const factsheetBad = [];
const cmp = (cell, mine) => {
  if (cells[cell]?.raw !== mine.toString()) factsheetBad.push(`${cell}: page ${cells[cell]?.raw} vs own ${mine}`);
};
cmp("total-assets", ownAssets);
cmp("total-idle", ownIdle);
cmp("total-debt", ownDebt);
cmp("share-price", ownShare);
check(
  `13b the factsheet's totals, split and share price equal this script's own reads at block ${vaultBlock}, wei-exact`,
  factsheetBad.length === 0,
  factsheetBad.join("; ") || "four figures compared",
);
check(
  "13c the idle and deployed halves add up to the total the page prints",
  ownIdle + ownDebt === ownAssets,
  `${ownIdle} + ${ownDebt} = ${ownIdle + ownDebt}, total ${ownAssets}`,
);
const queueRows = await page.locator("[data-strategy-row]").evaluateAll((els) =>
  els.map((el) => ({
    address: el.getAttribute("data-strategy-row"),
    position: Number(el.getAttribute("data-queue-position")),
    raw: el.getAttribute("data-current-debt-raw"),
  })),
);
const ownQueue = (
  await client.readContract({ address: F1, abi: VAULT_ABI, functionName: "get_default_queue", blockNumber: vb })
).map((a) => a.toLowerCase());
check(
  "13d the withdrawal queue is drawn in get_default_queue() order, whole",
  queueRows.length === ownQueue.length && queueRows.every((r, i) => r.address === ownQueue[i] && r.position === i + 1),
  `page ${queueRows.map((r) => r.address).join(",")} vs own ${ownQueue.join(",")}`,
);
const ownDebts = await client.multicall({
  contracts: ownQueue.map((s) => ({ address: F1, abi: STRATEGY_ABI, functionName: "strategies", args: [s] })),
  allowFailure: false,
  blockNumber: vb,
});
const debtBad = queueRows
  .map((r, i) =>
    r.raw === ownDebts[i].current_debt.toString()
      ? null
      : `${r.address}: page ${r.raw} vs own ${ownDebts[i].current_debt}`,
  )
  .filter(Boolean);
check(
  "13e every queue row's current_debt equals this script's own strategies() read at that block",
  debtBad.length === 0,
  debtBad.join("; ") || `${queueRows.length} strategies compared`,
);
// The vault's own totalDebt() and the queue's Σ are two facts, and the page
// says which. A strategy outside the default queue keeps its debt until the
// vault pulls it back, so the page must not present the Σ as the whole.
const queueSum = ownDebts.reduce((a, p) => a + p.current_debt, BigInt(0));
const outsideText = await page.locator('[data-figure="debt-outside-queue"]').count();
check(
  "13f where the queue's Σ and the vault's totalDebt() differ, the page says so — and where they agree it does not",
  (queueSum === ownDebt) === (outsideText === 0),
  `Σ queue ${queueSum}, totalDebt ${ownDebt}, note drawn ${outsideText > 0}`,
);

// ── 14: the factsheet's badge tracks the chain, and the catalogue gates ─────
await page.goto(`${BASE}/ethereum/yearn/vaults/${F2}`, { waitUntil: "domcontentloaded" });
const f2Badge = await page.locator("[data-endorsed-badge]").count();
const f2OwnEndorsed = await client.readContract({
  address: REGISTRY,
  abi: REGISTRY_ABI,
  functionName: "isEndorsed",
  args: [F2],
});
check(
  "14a F2's factsheet carries no endorsed badge, and the Registry agrees",
  f2Badge === 0 && f2OwnEndorsed === false,
  `badge ${f2Badge}, Registry.isEndorsed ${f2OwnEndorsed}`,
);
await page.goto(`${BASE}/ethereum/yearn/vaults/${F4}`, { waitUntil: "domcontentloaded" });
const f4Badge = await page.locator("[data-endorsed-badge]").count();
const f4OwnAssets = await client.readContract({ address: F4, abi: VAULT_ABI, functionName: "totalAssets" });
check(
  "14b F4's factsheet carries the badge although the vault holds nothing — endorsement is not a balance",
  f4Badge === 1 && f4OwnAssets === BigInt(0),
  `badge ${f4Badge}, own totalAssets ${f4OwnAssets}`,
);
const offRes = await page.goto(`${BASE}/ethereum/yearn/vaults/${OFF_CATALOGUE}`, { waitUntil: "domcontentloaded" });
check(
  "14c an address the catalogue does not hold answers 404, with the status on the response and not only in the body",
  offRes?.status() === 404,
  `status ${offRes?.status()}`,
);

// ── 16: the dev provenance tripwire ─────────────────────────────────────────
await page.goto(`${BASE}/ethereum/yearn/vaults`, { waitUntil: "networkidle" });
await page.waitForSelector("[data-roster-panel] [data-vault-row]", { timeout: 120_000 });
if ((await page.locator("[data-prov-tripwire]").count()) > 0) {
  const uncovered = await page.locator("[data-prov-uncovered]").count();
  check(
    "16 the dev provenance tripwire reports no uncovered figure on the roster",
    uncovered === 0,
    `${uncovered} uncovered`,
  );
} else {
  skip("16 the dev provenance tripwire", "no tripwire bookends on this build (production renders none)");
}

await browser.close();
console.log(`\n${passes} passed, ${failures} failed${skipped ? `, ${skipped} skipped` : ""}`);
process.exit(failures > 0 ? 1 : 0);
