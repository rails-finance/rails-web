#!/usr/bin/env node
// The wallet page's vault-holdings note, checked against the chain rather than
// against itself. /base/morpho/<wallet>
// ----------------------------------------------------------------------------
// components/protocol/morpho-base/vault-holdings-note.tsx mounts on the wallet
// page for any address that is NOT itself a catalogued MetaMorpho vault, fetches
// GET /api/chain/morpho-base/holder-exposure?holder=<address>&summary=1 after
// mount, and renders ONE line naming the catalogued vaults the address holds
// shares of — nothing while loading, on error, or when nothing is held. It is
// deliberately the ONE place a wallet-page view makes a chain read on the
// viewer's behalf (Miles's condition: a regular wallet page must not get
// slower), so the thing this script has to prove is not just "the line is
// right" but "the SSR never carries it, and a wallet holding nothing pays no
// visible cost either" — see checks 1 and 6.
//
// EVERY EXPECTED VALUE HERE IS THIS SCRIPT'S OWN CHAIN READ. It runs its own
// `balanceOf` sweep over the whole vault census, at the SAME block the summary
// route answered with (captured off the network, not off the DOM — this page
// carries no block stamp in its own copy besides the note's own sentence, which
// check 5 does read). Nothing expected is scraped from the note, the loader, or
// a fixture.
//
// Run:
//   BASE=http://localhost:3022 node scripts/verify/verify-morpho-base-wallet-vault-note.mjs
//   BASE=… node …/verify-morpho-base-wallet-vault-note.mjs --holder=0x…
// Needs BASE_RPC_URL in .env.local (read, never printed).
//
// ── WHY THIS DEFAULT HOLDER ─────────────────────────────────────────────────
// 0xe5f4716ac8161999c92361e3f72932fad0310dfe — a four-vault, two-asset holder,
// chosen for exercising both a six-decimal and an 18-decimal asset and the
// per-asset grouping. It was the default of the find door's own verifier, which
// went with that door (rails-ops decision 0028); the address is kept because
// its shape is recorded and understood.
//
// ── THE NO-HOLDINGS FIXTURE IS DISCOVERED, NOT ASSUMED ──────────────────────
// Copied practice from the sibling verifier: 0x…0001 is NOT an empty address (it
// holds shares of six catalogued vaults — burn-style addresses are where
// MetaMorpho dead shares end up). This script walks 0x…0001, 0x…0002, … with its
// OWN sweep until one comes back with zero non-zero balances, and reports SKIP
// with the cap if none of them is empty, rather than asserting against an
// address that could only fail.
//
// ── PROVED IT CAN FAIL, 2026-09-05, BASE=http://localhost:3022 ──────────────
// Three breaks, each made alone and reverted; the restored run is 12/12 green.
//
//  B1  this script's own sweep salted with a bogus held address
//      (0xffff…ffff, balance 1) right after the real sweep → FAIL 3 "api 4,
//      own 5, own-only 0xffffffffffffffffffffffffffffffffffffffff" AND FAIL 4
//      "page 4 names, own 5 addresses, own-only 0xffffffffffffffffffffffffffffffffffffffff"
//      — both the wei-exact set check (3) and the rendered-names check (4)
//      caught the same salted address, from two independent readings of the
//      page (the network response and the DOM).
//  B2  check 6's navigation pointed at HOLDER (which holds four vaults)
//      instead of the discovered empty fixture → FAIL 6 "a note WAS rendered:
//      This address holds shares of 4 MetaMorpho vaults at block …: Gauntlet
//      USDC Frontier, Seamless USDC Vault, Steakhouse Prime USDC, Seamless
//      WETH Vault. Vault exposure →", proving the check can see a note that
//      should not be there.
//  B3  check 1 flipped to assert the note's phrase IS present in the
//      plain-fetch HTML → FAIL 1 "no match" (the true body has none, so
//      asserting the opposite fails as it must).
//
// ── WHAT THIS SCRIPT DOES NOT RE-PROVE ───────────────────────────────────────
// Nothing about the note's AMOUNTS, because it states none — it names vaults.
// What this script proves is the WIRING: the note mounts only client-side,
// names the vaults this script's own sweep finds, carries no link out, and
// costs nothing when there is nothing to say. The names themselves are held
// against this script's own `balanceOf` sweep at the route's own block.

import { chromium } from "playwright";
import { createPublicClient, http, parseAbi } from "viem";
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

const arg = (name) =>
  process.argv
    .slice(2)
    .find((a) => a.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
const DEFAULT_HOLDER = "0xe5f4716ac8161999c92361e3f72932fad0310dfe";
const HOLDER = (arg("holder") ?? DEFAULT_HOLDER).toLowerCase();
if (!/^0x[0-9a-f]{40}$/.test(HOLDER)) throw new Error(`--holder must be a 20-byte address, got "${HOLDER}"`);

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
/** Candidates for "holds nothing", walked in order until this script's own
 *  sweep proves one empty. Never assumed — see the header. */
const NO_HOLDINGS_CANDIDATES = Array.from({ length: 8 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}`);

// ── the census, parsed out of the generated TS ──────────────────────────────
// Copied from scripts/verify/verify-morpho-base-vault-exposure.mjs, including
// the completeness
// assertion: this is plain node with no TS loader, so the rows are read out of
// the generated file's own source rather than imported.
const catalogSrc = fs.readFileSync(path.join(ROOT, "lib/morpho-base/vault-catalog.ts"), "utf8");
const CATALOG = (() => {
  const flat = catalogSrc.match(/const ROWS[^=]*=\s*\[([\s\S]*?)\n\];/)[1].replace(/\s+/g, " ");
  const str = `("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')`;
  const re = new RegExp(`\\[ ?"(0x[0-9a-f]{40})" ?, ?(\\d) ?, ?(\\d+) ?, ?${str} ?, ?${str} ?, ?(\\d+) ?,? ?\\]`, "g");
  const rows = [...flat.matchAll(re)].map((m) => ({
    address: m[1],
    createdBlock: Number(m[3]),
    name: m[4][0] === '"' ? JSON.parse(m[4]) : m[4].slice(1, -1),
  }));
  const expected = (flat.match(/\[ ?"0x/g) || []).length;
  if (rows.length !== expected) throw new Error(`vault-catalog parse read ${rows.length} of ${expected} rows`);
  return rows;
})();
const CENSUS_BLOCK = Number(catalogSrc.match(/MORPHO_BASE_VAULT_CENSUS_BLOCK = (\d+)/)[1]);
const NAME_BY_ADDRESS = new Map(CATALOG.map((v) => [v.address, v.name]));

const client = createPublicClient({ chain: base, transport: http(env.BASE_RPC_URL, { batch: false, retryCount: 3 }) });

const BALANCE_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);

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

/** `balanceOf(holder)` on every catalogued vault at one block, through
 *  Multicall3 — this script's OWN sweep, two requests, the roster split in
 *  half. Returns a Map of address → raw balance, non-zero entries only. */
async function sweep(holder, blockNumber) {
  const half = Math.ceil(CATALOG.length / 2);
  const chunks = [CATALOG.slice(0, half), CATALOG.slice(half)];
  const held = new Map();
  for (const chunk of chunks) {
    const balances = await client.multicall({
      contracts: chunk.map((v) => ({
        address: v.address,
        abi: BALANCE_ABI,
        functionName: "balanceOf",
        args: [holder],
      })),
      allowFailure: true,
      blockNumber,
      multicallAddress: MULTICALL3,
      batchSize: 0,
    });
    balances.forEach((r, i) => {
      if (r.status === "success" && r.result > BigInt(0)) held.set(chunk[i].address, r.result);
    });
  }
  return held;
}

/** Wait until the read endpoint's own head has reached `target`. */
async function awaitBlock(target) {
  for (let i = 0; i < 30; i++) {
    if ((await client.getBlockNumber({ cacheTime: 0 })) >= target) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

/** Every response to the summary route, collected across whatever navigation
 *  is in flight when this is read — reset per-navigation by re-assigning. */
let summaryResponses = [];
page.on("response", (res) => {
  if (res.url().includes("/api/chain/morpho-base/holder-exposure") && res.url().includes("summary=1")) {
    summaryResponses.push(res);
  }
});

const walletHref = (holder) => `${BASE}/base/morpho/${holder}`;

// ── 0: the parsed census is the whole roster ────────────────────────────────
check(
  "0  the parsed census is the whole roster",
  CATALOG.length > 0,
  `${CATALOG.length} vaults, censused at ${CENSUS_BLOCK}`,
);

// ── 1: the SSR HTML (no JS at all) carries no note ──────────────────────────
const ssrHtml = await (await fetch(walletHref(HOLDER))).text();
check(
  "1  the SSR HTML contains no note text",
  !ssrHtml.includes("holds shares of") && !ssrHtml.includes("MetaMorpho vault"),
  ssrHtml.includes("holds shares of") ? "found the note's own phrase in the plain-fetch HTML" : "no match",
);

// ── 2: the hydrated page renders the note, and states a network read ───────
summaryResponses = [];
await page.goto(walletHref(HOLDER), { waitUntil: "domcontentloaded" });
const noteLoc = page.locator("text=/holds shares of/");
await noteLoc.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
const noteCount = await noteLoc.count();
check(
  "2  the hydrated page renders the note",
  noteCount === 1,
  noteCount === 0 ? "(no note rendered)" : `${noteCount} matches`,
);
if (noteCount === 0) {
  console.log("\nno note rendered — nothing further about its content can be checked");
} else {
  const noteText = (await noteLoc.innerText()).replace(/\s+/g, " ").trim();

  // Pull the block the summary route answered with off the NETWORK, not the
  // DOM — the one figure this script pins its own sweep to.
  const summaryRes = summaryResponses.find((r) => r.ok());
  check(
    "2a  the summary route answered 200 for this holder's view",
    summaryRes != null,
    summaryRes ? `${summaryRes.status()}` : "no matching response captured",
  );
  const summaryJson = summaryRes ? await summaryRes.json() : null;
  check("2b  the summary response is not chain-stale", summaryJson != null && summaryJson.chainStale === false);

  if (summaryJson && !summaryJson.chainStale) {
    const block = BigInt(summaryJson.blockNumber);
    const reached = await awaitBlock(block);
    check("2c  the read endpoint has reached the block the summary route answered with", reached, `block ${block}`);

    const own = await sweep(HOLDER, block);
    console.log(`\n· ${HOLDER} holds ${own.size} of ${CATALOG.length} catalogued vaults at block ${block}`);

    // ── 3: the summary route's held set is wei-exact against this script's ──
    const apiHeld = new Map(summaryJson.held.map((v) => [v.address, BigInt(v.shares.raw)]));
    const apiOnly = [...apiHeld.keys()].filter((a) => !own.has(a));
    const ownOnlyVsApi = [...own.keys()].filter((a) => !apiHeld.has(a));
    const rawMismatch = [...own.entries()].filter(([a, bal]) => apiHeld.has(a) && apiHeld.get(a) !== bal);
    check(
      "3  the summary route's held set equals this script's own sweep, wei-for-wei on shares.raw",
      apiOnly.length === 0 && ownOnlyVsApi.length === 0 && rawMismatch.length === 0 && apiHeld.size === own.size,
      `api ${apiHeld.size}, own ${own.size}` +
        (apiOnly.length ? `, api-only ${apiOnly.join(",")}` : "") +
        (ownOnlyVsApi.length ? `, own-only ${ownOnlyVsApi.join(",")}` : "") +
        (rawMismatch.length ? `, raw mismatch on ${rawMismatch.map(([a]) => a).join(",")}` : ""),
    );

    // ── 4: the note's named vaults equal this script's own set, both ways ──
    const ownNames = new Set([...own.keys()].map((a) => NAME_BY_ADDRESS.get(a) ?? a));
    // The sentence ends on the last name and a full stop; the note carries no
    // link after it since the find door went (check 5a), so the stop is what is
    // trimmed rather than the words that used to follow it.
    const namedText = noteText.replace(/^.*vaults?\s+at\s+block\s+[\d,]+:\s*/, "").replace(/\.\s*$/, "");
    const pageNames = new Set(
      namedText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    const pageOnly = [...pageNames].filter((n) => !ownNames.has(n));
    const ownOnlyNames = [...ownNames].filter((n) => !pageNames.has(n));
    check(
      "4  the note names exactly this script's own non-zero-balance set of vaults",
      pageOnly.length === 0 && ownOnlyNames.length === 0 && pageNames.size === ownNames.size,
      `page ${pageNames.size} names, own ${ownNames.size} addresses` +
        (pageOnly.length ? `, page-only ${pageOnly.join(" | ")}` : "") +
        (ownOnlyNames.length ? `, own-only ${ownOnlyNames.join(" | ")}` : ""),
    );

    // ── 5: the note states the same block it read at ────────────────────────
    check(
      "5  the note states the block the summary route answered with",
      noteText.includes(Number(block).toLocaleString("en-US")),
      noteText,
    );

    // ── 5a: the note carries no link out ──────────────────────────────────
    // ── 2026-09-20 · THE FIND DOOR IS DELETED (rails-ops decision 0028) ───
    // The note used to end on "Vault exposure →", into the cross-vault address
    // sweep at /base/vaults/find. 0028 point 6 rehomes no cross-family holder
    // lookup, so the sweep is gone and the sentence stands alone. The check is
    // inverted rather than dropped: a link reappearing here would be a door
    // into a route that 404s.
    const strayLink = await noteLoc
      .locator("xpath=following-sibling::a | .//a")
      .count()
      .catch(() => 0);
    check(
      "5a  the note carries no link out — the cross-vault address sweep is retired",
      strayLink === 0,
      `${strayLink} link(s) on the note`,
    );
  }
}

// ── 6: an address the script proves holds nothing ──────────────────────────
let NO_HOLDINGS = null;
let noHoldingsHeld = null;
const probeBlock = await client.getBlockNumber();
for (const candidate of NO_HOLDINGS_CANDIDATES) {
  const held = await sweep(candidate, probeBlock);
  if (held.size === 0) {
    NO_HOLDINGS = candidate;
    break;
  }
  if (noHoldingsHeld == null) noHoldingsHeld = { candidate, size: held.size };
}
check(
  "6a  a fixture that holds nothing was found, and proved empty by this script's own sweep",
  NO_HOLDINGS != null,
  NO_HOLDINGS ??
    `none of ${NO_HOLDINGS_CANDIDATES.length} candidates is empty — ${noHoldingsHeld?.candidate} holds ${noHoldingsHeld?.size}`,
);
if (NO_HOLDINGS == null) {
  skip(
    "6  no note renders for the holds-nothing fixture, and the summary route answered without error",
    "no empty fixture found",
  );
} else {
  summaryResponses = [];
  await page.goto(walletHref(NO_HOLDINGS), { waitUntil: "domcontentloaded" });
  // A generous wait: the note's own fetch has to complete, and this check's
  // whole point is that NOTHING appears — there is no selector to wait FOR.
  await page.waitForTimeout(6000);
  const emptyNoteCount = await page.locator("text=/holds shares of/").count();
  const errored = summaryResponses.filter((r) => !r.ok());
  check(
    "6  no note is rendered for the holds-nothing fixture, and no summary-route response errored",
    emptyNoteCount === 0 && errored.length === 0 && summaryResponses.length > 0,
    emptyNoteCount > 0
      ? `a note WAS rendered: ${await page
          .locator("text=/holds shares of/")
          .innerText()
          .catch(() => "")}`
      : errored.length > 0
        ? `${errored.length} of ${summaryResponses.length} summary responses errored (${errored.map((r) => r.status()).join(",")})`
        : summaryResponses.length === 0
          ? "no summary-route request observed at all"
          : `0 notes, ${summaryResponses.length} clean responses`,
  );
}

await browser.close();

console.log(`\n${passes} passed, ${failures} failed, ${skipped} skipped`);
process.exit(failures > 0 ? 1 : 0);
