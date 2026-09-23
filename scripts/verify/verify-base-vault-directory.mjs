#!/usr/bin/env node
// Morpho's vault roster on Base, checked against the chain rather than against
// itself — /base/morpho/vaults, the VAULTS tab of the Morpho Blue Base rail.
// ----------------------------------------------------------------------------
// EVERY EXPECTED FIGURE HERE IS THIS SCRIPT'S OWN CHAIN READ OR ITS OWN PARSE.
// The roster states the block it read at; this script then makes its OWN
// `totalAssets()` read on every catalogued vault AT THAT BLOCK, its own
// `decimals()` read on each asset, and recomputes the grouping, the order, the
// counts and the printed text from those. The catalogue is parsed out of
// lib/morpho-base/vault-catalog.ts by this script (completeness asserted), not
// scraped off the page. The one thing taken from the DOM is the block number,
// which is the subject of check 0b, not a source of truth for the rest.
//
// Run:
//   BASE=http://localhost:3801 node scripts/verify/verify-base-vault-directory.mjs
// Needs BASE_RPC_URL in .env.local (read, never printed).
//
// ── WHAT EACH SECTION ASSERTS ─────────────────────────────────────────
//   0  the roster route answers 200 and states a block
//   1  one roster row per catalogued vault: count == catalog size (511 as of
//      the 2026-09-20 census), address sets equal
//   2  every row's raw `totalAssets()` (a data attribute) equals this script's
//      own read at the stated block, wei-exact
//   3  grouping: every funded row sits in the group of its catalogued asset;
//      the group set == the distinct assets of funded vaults; inside every
//      group the raw totals are non-increasing
//   4  funded + empty + unread == catalog size, and unread == 0
//   5  the empty group is collapsed at rest, expands to exactly the stated N
//      rows, and N == this script's own count of zero readings
//   6  the printed amount follows the print rule (2 dp for a ≤6-decimal asset,
//      6 dp for an 18-decimal one) on the largest row of the three largest
//      groups
//   7  the Family facet narrows the funded rows to that family and resets
//   8  the dev provenance tripwire reports no uncovered figure (SKIP when its
//      bookends are absent — a production build renders none)
//   9  the chain switcher shows NO Vaults section row on any chain — every
//      vault is inside an explorer now
//  10  no coverage page carries a Vaults section
//  11  the retired /base/vaults routes answer 404, deleted and not redirected
//  13  share price: the page's convertToAssets(10^18) reading, wei-exact
//      against this script's own read, on ≥3 vaults including a 6-decimal and
//      an 18-decimal asset; and the printed text follows the amount rule (the
//      asset's own decimals, never a fixed two)
//
// ── 2026-09-20 · THE VAULTS MOVED UNDER MORPHO (rails-ops decision 0028) ────
// The section at /base/vaults is retired whole. What that took out of this
// file, and why none of it is a check that moved elsewhere:
//
//   • SECTIONS 12 AND 14–18 ARE DELETED, not re-pinned. They were the find
//     door — the transaction-hash lane, the holder reading, the "Find your
//     position" hero, the app tiles, the per-app guides and Safe's own
//     deployment table. 0028 point 6 rehomes none of it: the code is gone, so
//     the checks are gone. The numbering of what is left is untouched, so a log
//     from before the move still reads against this list.
//   • SECTIONS 9 AND 10 FLIPPED SIDES. Base's switcher row and coverage block
//     were the section's; the roster is a sub-page of an explorer now, so both
//     assert their ABSENCE on Base and their presence on Ethereum — the same
//     claim about the same registry, read the other way round.
//   • SECTION 11 IS THE OPPOSITE ROUTE. It used to prove /base/morpho/vaults
//     404s. That path is the roster itself now, so what must 404 is the whole
//     of /base/vaults.
//
// ── PROVED IT CAN FAIL, 2026-09-06, BASE=http://localhost:3022 ──────────
// Made against the section's own routes, before the move; every failure mode
// below still names a check in this file.
//
//  B1  the in-group order reversed in components/vaults/vault-directory-view.tsx
//      (`av < bv ? 1` → `? -1`) → FAIL 3c ("186 out-of-order pairs across 26
//      groups").
//  B2  the empty group made to drop V1.0 vaults (`&& r.factory === "v1.1"` on
//      the emptyRows filter) → FAIL 4a ("232 + 205 + 0 = 437"), FAIL 5b
//      ("stated 205, drawn 205, own 273"), and 1a/1b (68 rows missing) —
//      the page's own stated count moved WITH the break, which is why 5b
//      also compares against this script's own count of zero readings.
//  B3  +1 raw unit on every row's `data-total-assets-raw` → FAIL 2 (three
//      1-unit vaults quoted "page 2 vs own 1") and FAIL 6 (the printed
//      "0.000001 USDC" no longer matched the salted raw's expected text).
//      The formatted cents on a 418M-USDC row stayed green under +1 unit —
//      exactly why check 2 reads the raw attribute rather than the text.
//  B4  this script's own catalog-size expectation salted (+1) → FAIL 1a
//      ("505 rows, catalog 506 (SALTED)").
//
// Section 13 (share price), added 2026-09-06, BASE=http://localhost:3417.
// Two breaks, each proved alone, run, reverted.
//
//  S2  lib/sources/chain/morpho-base-vault-directory.ts's ONE_SHARE exponent
//      changed 10^18 → 10^6 (a WRONG argument to the real `convertToAssets`
//      eth_call, not a formatting change) → FAIL 13a on all three sampled
//      vaults ("page 1032155 vs own 1032155429773130997" on the 18-decimal
//      WETH vault); 13b stayed green because the (now wrong) raw value still
//      printed by the same asset-decimals rule.
//  S3  the same file's `sharePrice` field changed to `amount(sharePriceRaw,
//      2)` — a fixed cents convention — → FAIL 13b: the 18-decimal WETH vault
//      printed "10,321,554,523,633,342.00 WETH" for a share price of about 1
//      WETH (want "1.032155"); a USDC vault also missed by two orders of
//      magnitude ("11,101.98" vs "1.11"). 13a stayed green — the RAW wei value
//      this check compares is unaffected by how it is later formatted, which
//      is exactly why 13b reads the printed text and 13a reads the attribute.

import { chromium } from "playwright";
import { createPublicClient, http, parseAbi } from "viem";
import { base } from "viem/chains";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expectedRoster } from "./lib/served-vault-roster.mjs";

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

// ── the census, parsed out of the generated TS ──────────────────────────────
// Copied from scripts/verify/verify-morpho-base-vault-exposure.mjs, completeness
// assertion included: a formatting change that hid rows from this regex is an
// error, not a quietly shorter roster. The asset column is the interned index
// into the `A` table, resolved here the same way the module resolves it.
const catalogSrc = fs.readFileSync(path.join(ROOT, "lib/morpho-base/vault-catalog.ts"), "utf8");
const BAKED_CATALOG = (() => {
  const assets = catalogSrc
    .match(/const A: readonly string\[\] = \[([\s\S]*?)\];/)[1]
    .match(/0x[0-9a-f]{40}/g)
    .map((a) => a.toLowerCase());
  const flat = catalogSrc.match(/const ROWS[^=]*=\s*\[([\s\S]*?)\n\];/)[1].replace(/\s+/g, " ");
  const str = `("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')`;
  const re = new RegExp(`\\[ ?"(0x[0-9a-f]{40})" ?, ?(\\d) ?, ?(\\d+) ?, ?${str} ?, ?${str} ?, ?(\\d+) ?,? ?\\]`, "g");
  const rows = [...flat.matchAll(re)].map((m) => ({
    address: m[1],
    factory: m[2] === "1" ? "v1.1" : "v1.0",
    createdBlock: Number(m[3]),
    name: m[4][0] === '"' ? JSON.parse(m[4]) : m[4].slice(1, -1),
    asset: assets[Number(m[6])],
  }));
  const expected = (flat.match(/\[ ?"0x/g) || []).length;
  if (rows.length !== expected) throw new Error(`vault-catalog parse read ${rows.length} of ${expected} rows`);
  if (rows.some((r) => !r.asset)) throw new Error("vault-catalog parse: an asset index missed the A table");
  return rows;
})();
// The page draws the box's roster over the baked one when the web takes it
// (lib/morpho-base/vault-roster.ts); so does this script, by the same rule
// (scripts/verify/lib/served-vault-roster.mjs). Every check below judges the
// roster named here.
const ROSTER = await expectedRoster(env, {
  chainId: 8453,
  family: "metamorpho",
  bakedRows: BAKED_CATALOG,
  bakedBlock: Number(catalogSrc.match(/MORPHO_BASE_VAULT_CENSUS_BLOCK = (\d+)/)[1]),
  same: (s, b) => s.factoryVersion === b.factory && s.createdBlock === b.createdBlock && s.asset === b.asset,
});
const CATALOG =
  ROSTER.source === "served"
    ? ROSTER.rows.map((v) => ({
        address: v.address,
        factory: v.factoryVersion,
        createdBlock: v.createdBlock,
        name: v.name,
        asset: v.asset,
      }))
    : BAKED_CATALOG;
console.log(
  `roster: ${ROSTER.source}, ${CATALOG.length} vaults at block ${ROSTER.block}` +
    (ROSTER.source === "served" ? ` (baked ${BAKED_CATALOG.length})` : ` — ${ROSTER.why}`),
);
const CATALOG_BY_ADDRESS = new Map(CATALOG.map((r) => [r.address, r]));
const CASE_STUDY_VAULT = "0xbeefe94c8ad530842bfe7d8b397938ffc1cb83b2";
if (!CATALOG_BY_ADDRESS.has(CASE_STUDY_VAULT)) throw new Error("the case-study vault is not in the catalog");

const client = createPublicClient({ chain: base, transport: http(env.BASE_RPC_URL, { batch: false, retryCount: 3 }) });
const VAULT_ABI = parseAbi(["function totalAssets() view returns (uint256)"]);
const ERC20_ABI = parseAbi(["function decimals() view returns (uint8)"]);
const BALANCE_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const CONVERT_ABI = parseAbi(["function convertToAssets(uint256) view returns (uint256)"]);
/** One whole share, in the vault's own 18-decimal share units — same exponent
 *  the directory's own `convertToAssets` call uses (see the loader's header
 *  note on why it is fixed rather than read per vault). */
const ONE_SHARE = BigInt(10) ** BigInt(18);

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

/** The section's print rule, restated here from the header of
 *  components/protocol/morpho-base/vault-exposure-parts.tsx so a change to the
 *  page's rule that this script did not agree to goes red. */
const expectedAmountText = (raw, decimals) => {
  const value = Number(raw) / Math.pow(10, decimals);
  const text = value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals <= 6 ? 2 : 6,
  });
  if (value !== 0 && parseFloat(text.replace(/,/g, "")) === 0) {
    // exact from raw units, trailing zeros trimmed
    let s = String(raw).padStart(decimals + 1, "0");
    const cut = s.length - decimals;
    return (s.slice(0, cut) + "." + s.slice(cut)).replace(/\.?0+$/, "");
  }
  return text;
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

// ── 0: the roster page answers, and states a block ──────────────────────────
// The roster is the landing page of the VAULTS tab — /base/morpho/vaults — and
// it is a READING: the page makes its own Multicall3 wave over every catalogued
// vault. Every roster check below reads inside `[data-roster-panel]`, the
// wrapper the rows have carried since they were a drawer, so nothing under it
// changed with the move.
const res0 = await page.goto(`${BASE}/base/morpho/vaults`, { waitUntil: "networkidle" });
check("0a GET /base/morpho/vaults answers 200", res0?.status() === 200, `status ${res0?.status()}`);
await page.waitForSelector("[data-roster-panel] [data-vault-row]", { timeout: 120_000 });

// The block the roster read at. It is STATED in the panel's own sentence about
// the vaults that hold nothing rather than in a data attribute, so it is read
// out of the panel's rendered text and then held against the block the header
// names — the panel cannot state one block and have been read at another.
const rosterText = (await page.locator("[data-roster-panel]").innerText()).replace(/\s+/g, " ");
// ⚠️ NOT the first "at block" in the panel. The roster states TWO blocks and
// they are different facts: the catalogue's census block ("the 511 vaults the
// two factories had deployed on Base at block N") and the block this READING
// was taken at. A bare /at block/ match takes the first, which is the census
// one — measured on the first run of this move: block 51,054,072 against a
// reading at 51,054,846, and checks 2 and 13a both went red against a real
// page. The sentence anchored on is the one that names the CALL.
const statedBlock = Number((rosterText.match(/totalAssets\(\) at block ([\d,]+)/) ?? [])[1]?.replace(/,/g, "") ?? NaN);
// The page's own header states the same block in `[data-directory-block]`, and
// it sits OUTSIDE the panel — so it is read off the page, never scoped to
// `[data-roster-panel]`. Two statements of one reading: a header left on a
// stale block while the rows moved on goes red here.
const headerBlockAttr = (await page.locator("[data-directory-block]").count())
  ? Number(await page.locator("[data-directory-block]").first().getAttribute("data-directory-block"))
  : null;
check(
  "0b the roster page states the block it read at, in its header attribute and in its own prose, and the two agree",
  Number.isInteger(statedBlock) && statedBlock > 0 && headerBlockAttr === statedBlock,
  `prose block ${statedBlock}, header attribute ${headerBlockAttr}`,
);
const blockNumber = BigInt(statedBlock);

// ── 1: one row per catalogued vault ─────────────────────────────────────────
// The empty group is collapsed at rest; its rows are not in the DOM until
// expanded. Section 5 checks the collapse itself; here the rows are read with
// the group open so the whole roster is countable.
const emptyToggle = page.locator("[data-roster-panel] [data-empty-group] button");
const hasEmptyGroup = (await emptyToggle.count()) > 0;
const emptyRowsBefore = await page.locator("[data-roster-panel] [data-empty-rows] [data-vault-row]").count();
if (hasEmptyGroup) {
  await emptyToggle.click();
  await page.waitForSelector("[data-roster-panel] [data-empty-rows]");
}
const readRows = async () =>
  page.locator("[data-roster-panel] [data-vault-row]").evaluateAll((els) =>
    els.map((el) => ({
      address: el.getAttribute("data-vault-row"),
      group: el.getAttribute("data-group"),
      asset: el.getAttribute("data-asset"),
      family: el.getAttribute("data-family"),
      raw: el.getAttribute("data-total-assets-raw"),
      sharePriceRaw: el.getAttribute("data-share-price-raw"),
      groupAsset: el.closest("[data-asset-group]")?.getAttribute("data-asset-group") ?? null,
      inEmpty: Boolean(el.closest("[data-empty-rows]")),
      amountText: el.querySelector('[data-cell="total-assets"]')?.textContent?.trim() ?? null,
      sharePriceText: el.querySelector('[data-cell="share-price"]')?.textContent?.trim() ?? null,
    })),
  );
const rows = await readRows();
check(
  "1a the directory draws one row per catalogued vault",
  rows.length === CATALOG.length,
  `${rows.length} rows, catalog ${CATALOG.length}`,
);
const rowSet = new Set(rows.map((r) => r.address));
const missing = CATALOG.filter((r) => !rowSet.has(r.address)).length;
const extra = rows.filter((r) => !CATALOG_BY_ADDRESS.has(r.address)).length;
check(
  "1b the rows are exactly the catalog's addresses",
  missing === 0 && extra === 0 && rowSet.size === rows.length,
  `${missing} missing, ${extra} not catalogued, ${rows.length - rowSet.size} duplicated`,
);

// ── 2: every raw total equals this script's own read at the stated block ───
const own = await client.multicall({
  contracts: CATALOG.map((r) => ({ address: r.address, abi: VAULT_ABI, functionName: "totalAssets" })),
  allowFailure: true,
  blockNumber,
});
const ownTotal = new Map(CATALOG.map((r, i) => [r.address, own[i].status === "success" ? own[i].result : null]));
const ownUnread = [...ownTotal.values()].filter((v) => v == null).length;
let mismatches = [];
for (const r of rows) {
  const mine = ownTotal.get(r.address);
  if (mine == null) continue;
  if (r.raw !== mine.toString()) mismatches.push(`${r.address}: page ${r.raw} vs own ${mine}`);
}
check(
  `2  every row's raw totalAssets() equals this script's own read at block ${statedBlock}, wei-exact`,
  mismatches.length === 0 && ownUnread === 0,
  mismatches.length
    ? mismatches.slice(0, 3).join("; ")
    : `${rows.length - ownUnread} compared, ${ownUnread} own reads unanswered`,
);

// ── 3: grouping and order ───────────────────────────────────────────────────
const funded = rows.filter((r) => r.group === "funded");
const wrongGroup = funded.filter(
  (r) => r.groupAsset !== r.asset || CATALOG_BY_ADDRESS.get(r.address)?.asset !== r.asset,
);
check(
  "3a every funded row sits in the group of its catalogued asset",
  wrongGroup.length === 0,
  `${wrongGroup.length} of ${funded.length} misplaced`,
);
const ownFundedAssets = new Set(CATALOG.filter((r) => (ownTotal.get(r.address) ?? 0n) > 0n).map((r) => r.asset));
const pageGroups = new Set(
  await page
    .locator("[data-roster-panel] [data-asset-group]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-asset-group"))),
);
check(
  "3b the group set equals the distinct assets of funded vaults, by this script's own read",
  pageGroups.size === ownFundedAssets.size && [...ownFundedAssets].every((a) => pageGroups.has(a)),
  `${pageGroups.size} groups on the page, ${ownFundedAssets.size} funded assets read`,
);
let disorder = 0;
for (const asset of pageGroups) {
  const inGroup = funded.filter((r) => r.groupAsset === asset).map((r) => BigInt(r.raw));
  for (let i = 1; i < inGroup.length; i++) if (inGroup[i] > inGroup[i - 1]) disorder++;
}
check(
  "3c inside every group the totals are non-increasing (largest first)",
  disorder === 0,
  `${disorder} out-of-order pairs across ${pageGroups.size} groups`,
);

// ── 4: the three kinds of row add up ────────────────────────────────────────
const emptyRows = rows.filter((r) => r.group === "empty");
const unreadRows = rows.filter((r) => r.group === "unread");
check(
  "4a funded + empty + unread == catalog size",
  funded.length + emptyRows.length + unreadRows.length === CATALOG.length,
  `${funded.length} + ${emptyRows.length} + ${unreadRows.length} = ${funded.length + emptyRows.length + unreadRows.length}`,
);
check("4b no vault went unread at this block", unreadRows.length === 0, `${unreadRows.length} unread`);

// ── 5: the empty group ──────────────────────────────────────────────────────
check(
  "5a the empty group is collapsed at rest (no rows in the DOM before the click)",
  hasEmptyGroup && emptyRowsBefore === 0,
  `${emptyRowsBefore} rows before`,
);
const statedEmpty = Number(
  ((await page.locator('[data-roster-panel] [data-figure="empty-count"]').textContent()) ?? "")
    .replace(/,/g, "")
    .match(/(\d+) vaults?/)?.[1] ?? NaN,
);
const ownEmpty = CATALOG.filter((r) => ownTotal.get(r.address) === 0n).length;
check(
  "5b expanded, it holds exactly the stated N rows, and N is this script's own count of zero readings",
  emptyRows.length === statedEmpty && statedEmpty === ownEmpty && emptyRows.every((r) => r.inEmpty),
  `stated ${statedEmpty}, drawn ${emptyRows.length}, own ${ownEmpty}`,
);

// ── 6: the print rule on the largest rows ───────────────────────────────────
const groupOrder = await page
  .locator("[data-roster-panel] [data-asset-group]")
  .evaluateAll((els) => els.map((e) => e.getAttribute("data-asset-group")));
const sampleAssets = groupOrder.slice(0, 3);
const decimalsRead = await client.multicall({
  contracts: sampleAssets.map((a) => ({ address: a, abi: ERC20_ABI, functionName: "decimals" })),
  allowFailure: false,
  blockNumber,
});
let printBad = [];
sampleAssets.forEach((asset, i) => {
  const top = funded.find((r) => r.groupAsset === asset);
  if (!top) return;
  const want = expectedAmountText(top.raw, Number(decimalsRead[i]));
  if (!top.amountText?.startsWith(want)) printBad.push(`${top.address}: "${top.amountText}" vs "${want}"`);
});
check(
  "6  the largest row of the three largest groups prints by the section's amount rule",
  printBad.length === 0 && sampleAssets.length === 3,
  printBad.join("; ") || `${sampleAssets.length} sampled`,
);

// ── 7: the Family facet ─────────────────────────────────────────────────────
// Scoped to the panel: the LISTING's own toolbar sits above this drawer with
// facets of its own, and an unscoped click would press the wrong control.
const rosterPanel = page.locator("[data-roster-panel]");
await rosterPanel
  .locator("button", { hasText: /^Family/ })
  .first()
  .click();
await page.locator("[role='menuitemcheckbox'], label, button", { hasText: "MetaMorpho V1.0" }).first().click();
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
const facetRows = (await readRows()).filter((r) => r.group === "funded");
const ownV10Funded = CATALOG.filter((r) => r.factory === "v1.0" && (ownTotal.get(r.address) ?? 0n) > 0n).length;
check(
  "7a choosing Family: MetaMorpho V1.0 shows exactly the funded V1.0 vaults",
  facetRows.length === ownV10Funded && facetRows.every((r) => r.family === "v1.0"),
  `${facetRows.length} shown, ${ownV10Funded} expected`,
);
await rosterPanel
  .locator("button", { hasText: /^Reset$/ })
  .first()
  .click();
await page.waitForTimeout(200);
const afterReset = (await readRows()).filter((r) => r.group === "funded").length;
check("7b Reset restores every funded row", afterReset === funded.length, `${afterReset} of ${funded.length}`);

// ── 8: the dev provenance tripwire ──────────────────────────────────────────
if ((await page.locator("[data-prov-tripwire]").count()) > 0) {
  const uncovered = await page.locator("[data-prov-uncovered]").count();
  check(
    "8  the dev provenance tripwire reports no uncovered figure on the directory",
    uncovered === 0,
    `${uncovered} uncovered`,
  );
} else {
  skip(
    "8  the dev provenance tripwire reports no uncovered figure",
    "no tripwire bookends on this build (production renders none)",
  );
}

// ── 9: the chain switcher ───────────────────────────────────────────────────
await page.getByRole("button", { name: "Switch blockchain" }).click();
await page.waitForSelector("[role='menu']");
const baseSelected = await page.locator("[role='menu'] button[aria-pressed='true']").textContent();
const vaultsRowBase = await page
  .locator("[data-switcher-vaults]")
  .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
check(
  "9a on a /base route the switcher opens on Base and shows NO Vaults row — Base's vaults are the Morpho explorer's now",
  /Base/.test(baseSelected ?? "") && vaultsRowBase.length === 0,
  `selected "${baseSelected?.trim()}", rows ${JSON.stringify(vaultsRowBase)}`,
);
// Ethereum's Vaults section went the same way on 2026-09-20 — Aave's layer is a
// roster entry at /ethereum/aave now — so no chain draws this row. Sepolia never
// had one.
await page.locator("[role='menu'] button", { hasText: "Ethereum" }).click();
const vaultsRowEth = await page
  .locator("[data-switcher-vaults]")
  .evaluateAll((els) => els.map((e) => e.getAttribute("href")));
await page.locator("[role='menu'] button", { hasText: "Sepolia" }).click();
const vaultsRowSep = await page.locator("[data-switcher-vaults]").count();
check(
  "9b and neither does Ethereum or Sepolia — Aave's vault layer is a roster row, not a section",
  vaultsRowEth.length === 0 && vaultsRowSep === 0,
  `ethereum ${JSON.stringify(vaultsRowEth)}, sepolia ${vaultsRowSep}`,
);
await page.keyboard.press("Escape");

// ── 10: the coverage pages ──────────────────────────────────────────────────
const coverage = async (slug) => {
  await page.goto(`${BASE}/coverage/${slug}`, { waitUntil: "domcontentloaded" });
  const n = await page.locator("[data-coverage-vaults]").count();
  const href = n
    ? ((await (
        await page.locator("[data-coverage-vaults] a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")))
      ).find((h) => h === `/${slug}/vaults`)) ?? null)
    : null;
  return { n, href };
};
const covBase = await coverage("base");
const covEth = await coverage("ethereum");
const covSep = await coverage("sepolia");
check(
  "10a /coverage/base carries NO Vaults section — Base's vaults have a protocol row instead",
  covBase.n === 0,
  `${covBase.n} sections, link ${covBase.href}`,
);
check(
  "10b and neither does /coverage/ethereum or /coverage/sepolia",
  covEth.n === 0 && covSep.n === 0,
  `ethereum ${covEth.n} link ${covEth.href}, sepolia ${covSep.n}`,
);

// ── 11: the retired routes ──────────────────────────────────────────────────
// The other way round since rails-ops decision 0028: /base/morpho/vaults is the
// roster (check 0a), and the whole of /base/vaults is gone. Nothing forwards.
const retired = [
  "/base/vaults",
  "/base/vaults/directory",
  "/base/vaults/info",
  `/base/vaults/${CASE_STUDY_VAULT}`,
  "/base/vaults/find",
  "/base/vaults/find/coinbase",
];
const retiredStatuses = [];
for (const route of retired) {
  const r = await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
  retiredStatuses.push(`${route} ${r?.status()}`);
}
check(
  "11 every retired /base/vaults route answers 404 (deleted, not redirected)",
  retiredStatuses.every((s) => s.endsWith(" 404")),
  retiredStatuses.join(", "),
);

// ── 13: share price ──────────────────────────────────────────────────────
// `funded` and `blockNumber` are the same arrays section 2/3 already scraped
// and read from chain — no fresh navigation needed for the wei-exact compare.
const priceAssetAddrs = [...new Set(funded.map((r) => r.asset))];
const priceAssetDecReads = await client.multicall({
  contracts: priceAssetAddrs.map((a) => ({ address: a, abi: ERC20_ABI, functionName: "decimals" })),
  allowFailure: true,
  blockNumber,
});
const priceAssetDecimals = new Map(
  priceAssetAddrs.map((a, i) => [
    a,
    priceAssetDecReads[i].status === "success" ? Number(priceAssetDecReads[i].result) : null,
  ]),
);
const sixDecRow = funded.find((r) => priceAssetDecimals.get(r.asset) === 6);
const eighteenDecRow = funded.find((r) => priceAssetDecimals.get(r.asset) === 18 && r.address !== sixDecRow?.address);
const thirdRow = funded.find((r) => r.address !== sixDecRow?.address && r.address !== eighteenDecRow?.address);
const priceSample = [sixDecRow, eighteenDecRow, thirdRow].filter(Boolean);
const ownPrice = await client.multicall({
  contracts: priceSample.map((r) => ({
    address: r.address,
    abi: CONVERT_ABI,
    functionName: "convertToAssets",
    args: [ONE_SHARE],
  })),
  allowFailure: true,
  blockNumber,
});
const priceMismatches = [];
priceSample.forEach((r, i) => {
  const mine = ownPrice[i].status === "success" ? ownPrice[i].result : null;
  if (mine == null) {
    priceMismatches.push(`${r.address}: this script's own read failed`);
    return;
  }
  if (r.sharePriceRaw !== mine.toString()) priceMismatches.push(`${r.address}: page ${r.sharePriceRaw} vs own ${mine}`);
});
check(
  "13a share price (convertToAssets(10^18)) equals this script's own read, wei-exact, on ≥3 vaults incl. a 6-decimal and an 18-decimal asset",
  priceMismatches.length === 0 && priceSample.length >= 3 && Boolean(sixDecRow) && Boolean(eighteenDecRow),
  priceMismatches.length
    ? priceMismatches.join("; ")
    : `${priceSample.length} sampled (6-dec asset ${sixDecRow?.asset}, 18-dec asset ${eighteenDecRow?.asset})`,
);
const priceTextBad = [];
priceSample.forEach((r) => {
  const decimals = priceAssetDecimals.get(r.asset);
  if (decimals == null || !r.sharePriceRaw) return;
  const want = expectedAmountText(r.sharePriceRaw, decimals);
  if (!r.sharePriceText?.startsWith(want)) priceTextBad.push(`${r.address}: "${r.sharePriceText}" vs "${want}"`);
});
check(
  "13b the printed share price follows the section's amount rule — the ASSET's own decimals, never a fixed two",
  priceTextBad.length === 0,
  priceTextBad.join("; ") || `${priceSample.length} sampled`,
);

await browser.close();
console.log(`\n${passes} passed, ${failures} failed${skipped ? `, ${skipped} skipped` : ""}`);
process.exit(failures > 0 ? 1 : 0);
