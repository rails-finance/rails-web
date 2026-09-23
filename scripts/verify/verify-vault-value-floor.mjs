#!/usr/bin/env node
// The vault-position listing's VALUE — the census-block USD figure (mig 206),
// the Size floor built on it, the two sorts, the Vault chip's count and the
// unpriced set — checked on BOTH chains against this script's own chain reads.
// ----------------------------------------------------------------------------
// EVERY EXPECTED FIGURE HERE IS THIS SCRIPT'S OWN READ. The census stores, per
// vault, the block it priced at and every input of the value arithmetic; this
// script takes ONLY the block and the holder from the route, then makes its
// OWN `balanceOf`, `decimals`, `asset`, `convertToAssets(10^dec)` on the vault,
// resolves the chain's Aave V3 oracle ITSELF from the PoolAddressesProvider at
// that block, asks THAT oracle `getAssetPrice`, decides the stata hop by its
// OWN logic (the oracle declines the asset and the asset answers `asset()`),
// recomputes the value with BigInt and asserts the route's figure equals it
// wei-exact. The floor is asserted at its BOUNDARY (rank N by value is ≥ the
// bracket, rank N+1 is below it), which is the assertion with teeth: a bound
// applied at the wrong amount passes "every row ≥ $1,000" and fails here.
//
// A FIXTURE THAT HAS CHANGED STATE IS A FAILURE, NEVER A SKIP — with one
// exception, said out loud: a chain whose census has not yet run its price
// pass (every `pricedBlock` null) cannot be exercised, and the whole chain
// SKIPs naming that. Never green-but-vacuous.
//
// Run:
//   BASE=http://localhost:3801 node scripts/verify/verify-vault-value-floor.mjs
// Needs BASE_RPC_URL (Base `eth_call`, block-tagged) and ALCHEMY_URL (Ethereum)
// in .env.local — read, never printed; the lanes are named here by env var
// NAME only.
//
// ── WHAT EACH SECTION ASSERTS (per chain: B = Base, E = Ethereum) ───────────
//   V0  the route answers 200 with a census header that carries a priced block
//       for at least one vault — else the chain SKIPs out loud
//   V1  arithmetic: (a) every census row's `oracle` is the address this
//       script's own `getPriceOracle()` resolves at that row's priced block;
//       (b) for the page-one top row and the pinned fixtures, the route's
//       `valueUsdE8`, `pricedAsset` and `oraclePriceE8` equal this script's
//       own reads and BigInt recomputation at the priced block, wei-exact —
//       the Ethereum umbrella fixture exercises the stata hop
//   V2  the floor: (a) every row under size=1000 is ≥ $1,000; (b) the BOUNDARY
//       — rank total(1000) of the unfiltered value order is ≥ $1,000 and rank
//       total(1000)+1 is below it or unpriced; (c) the brackets nest and the
//       priced + unpriced totals never exceed the unfiltered total; (d) the
//       total the census header answers equals a counted total (`q=0x`)
//   V3  sorts: (a) value desc page one is non-increasing with no unpriced row;
//       (b) the unpriced set is exactly the null rows; (c) `sharePpm` on a
//       small vault is this script's own balanceOf × 1e6 ÷ its own totalSupply
//       at the census block, to 1e-6, and (d) share desc orders by it
//   V4  the Vault chip's count follows the applied Status filter — live under
//       Open, participants − live under Closed, participants otherwise — each
//       against this script's OWN count of non-zero balances at the census
//       block; and the Size chip prints its bracket
//   V5  an unpriced vault (Base only — Ethereum's eighteen are all priced, said
//       out loud): this script's own oracle call declines its asset; its rows
//       carry a null value; it is absent from every bracket and whole under
//       Unpriced; its card prints "not priced"; the intro drawer names its
//       asset
//   V6  the DOM: the resting listing's card order is the value-desc order
//       (default sort, decision D2); the top card prints its value through the
//       section's own print rule, exact dollars on `title=`
//
// ── STANDING TALLY, 2026-09-09, BASE=http://localhost:3801 ────────────────
// 44/44 · 2 SKIP (42/42 before V2d landed). Both SKIPs are one fact about Ethereum's census, said out
// loud: all eighteen vaults' assets are priced by the oracle (the three stata
// wrappers through the hop), so there is no unpriced row for V3Eb and no
// unpriced vault for V5E to exercise. Base's unpriced vault was eUSD's (2,183
// participants); the small vaults were zf-mbUSDC (3 rows: 2 live, 1 closed) on
// Base and waEthUSDtb (4 rows: 3 live, 1 closed) on Ethereum, both DERIVED from
// the census header and named in the run.
//
// ── PROVED IT CAN FAIL, 2026-09-09, BASE=http://localhost:3801 ─────────────
// Four breaks, applied ONE AT A TIME to the real source and reverted; the exact
// red lines follow.
//
//  A  THE PROXY SERVED EVERY VALUE ×10 — `String(BigInt(r.valueUsdE8) * 10n)`
//     in app/api/vaults/positions/route.ts `toRow`. 34/42.
//     FAIL V1Bb ×3, V1Eb ×3 — "own 224923317 … vs route 2249233170", every
//                 fixture on both chains, the hop fixture included
//     FAIL V2Bb, V2Eb — "rank 11,300 = $10,000.58, rank 11,301 = $9,999.86"
//  B  THE PROXY FORWARDED THE BRACKET ×10 — `minUsd = String(Number(size) * 10)`.
//     40/42. V2a stayed GREEN (every row under the wrong bound is still ≥
//     $1,000 — the check without teeth), and the boundary caught it:
//     FAIL V2Bb — "rank 2,864 of the value order is ≥ $1,000 and rank 2,865 is
//                 below it — rank 2,864 = $10,001.11, rank 2,865 = $9,995.71"
//     FAIL V2Eb — "rank 1,367 = $10,000.00, rank 1,368 = $9,992.45"
//  C  THE RESTING SORT WENT BACK TO lastActivity — `sortBy: "lastActivity"` in
//     lib/morpho-base/position-list-filter-dimensions.tsx. 41/42.
//     FAIL V6Ba — "DOM leads 0xbeefe94c…:0x1688aeb3…, API 0xee8f4ec5…:0x93904eec…"
//  D  AN UNPRICED CARD PRINTED A ZERO — `<span>$0.00</span>` for the Unread in
//     components/vaults/vault-position-card.tsx. 41/42.
//     FAIL V5Bd — '"Value · USD$0.00the oracle declined eUSD"'

import { chromium } from "playwright";
import { createPublicClient, http, parseAbi } from "viem";
import { base, mainnet } from "viem/chains";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = process.env.BASE ?? "http://localhost:3801";

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l
        .slice(l.indexOf("=") + 1)
        .trim()
        .replace(/^"|"$/g, ""),
    ]),
);
if (!env.BASE_RPC_URL) throw new Error("need BASE_RPC_URL in .env.local");
if (!env.ALCHEMY_URL) throw new Error("need ALCHEMY_URL in .env.local");
// ⚠️⚠️ NO LANE URL EVER REACHES THE OUTPUT (viem puts the endpoint into every
// error it throws). Both terminal handlers scrub anything URL-shaped.
const scrub = (text) => String(text).replace(/https?:\/\/[^\s"'`)}\]]+/g, "<lane URL redacted>");
for (const signal of ["uncaughtException", "unhandledRejection"])
  process.on(signal, (error) => {
    console.error(`\nFAILED (${signal}) — ${scrub(error?.stack ?? error?.message ?? error)}`);
    process.exit(1);
  });

console.log(`\n── vault value floor · ${BASE} ──`);
console.log(`   lanes: BASE_RPC_URL present, ALCHEMY_URL present (names only; no URL is printed)\n`);

const ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function asset() view returns (address)",
  "function getPriceOracle() view returns (address)",
  "function getAssetPrice(address) view returns (uint256)",
]);

/** The one pinned thing per chain besides the fixtures: Aave V3's
 *  PoolAddressesProvider, the contract that NAMES the oracle. The oracle itself
 *  is resolved from it at the priced block, never written down. */
const CHAINS = {
  8453: {
    word: "Base",
    listing: `${BASE}/base/morpho/vaults/positions`,
    // The layer's about page is a sibling of the ROSTER, not of this listing.
    info: `${BASE}/base/morpho/vaults/info`,
    provider: "0xe20fcbdbffc4dd138ce8b2e6fbb6cb49777ad64d",
    client: createPublicClient({
      chain: base,
      transport: http(env.BASE_RPC_URL, { batch: false, retryCount: 3, timeout: 90_000 }),
    }),
    // The two wallets the brief linked — sub-$3 in mwETH — and the top holder
    // of that vault, a contract: three magnitudes through one formula.
    fixtures: [
      {
        vault: "0xa0e430870c4604ccfc7b38ca7845b1ff653d0ff1",
        holder: "0xaed9e8f8e77022cc3e15720a92176007f3c54751",
        why: "a brief wallet, sub-$3",
      },
      {
        vault: "0xa0e430870c4604ccfc7b38ca7845b1ff653d0ff1",
        holder: "0x93d9e4535f2e62c0630e6f2e89c2d95190422461",
        why: "mwETH's top holder",
      },
    ],
  },
  1: {
    word: "Ethereum",
    listing: `${BASE}/ethereum/aave/vaults/positions`,
    info: `${BASE}/ethereum/aave/vaults/info`,
    provider: "0x2f39d218133afab8f2b819b1066c7e434ad94e9e",
    client: createPublicClient({
      chain: mainnet,
      transport: http(env.ALCHEMY_URL, { batch: false, retryCount: 3, timeout: 90_000 }),
    }),
    // The umbrella stake token holds a stata wrapper the oracle does not price
    // directly — the hop; sGHO's asset is GHO, priced directly.
    fixtures: [
      {
        vault: "0x6bf183243fdd1e306ad2c4450bc7dcf6f0bf8aa6",
        holder: "0xdd62115f601daebccfdd2aeed834513d8dc2f4e2",
        why: "umbrella stkwaEthUSDC — the stata hop",
      },
      {
        vault: "0xe1753f2e00940cc31213dd92013cf019dfe4ca1d",
        holder: "0x89d76f493aecaee10cabbc1a67dbdc92e947b85e",
        why: "sGHO — priced directly",
      },
    ],
  },
};

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

const n = (v) => Number(v).toLocaleString("en-US");
const pow10 = (d) => BigInt("1" + "0".repeat(d));
const E8 = 100_000_000n;

// ── the section's own print rules, restated so a change to them goes red ────
/** lib/aave-vaults/vault-position.ts `usdText`. */
const usdText = (usdE8) => {
  const e8 = BigInt(usdE8);
  const cents = e8 / 1_000_000n;
  if (e8 !== 0n && cents === 0n) return `$0.${(e8 % E8).toString().padStart(8, "0").replace(/0+$/, "")}`;
  return `$${(Number(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
/** lib/utils/format.ts `formatApproximate`, above a thousand. */
const approx = (v) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${(v / 1_000).toFixed(1)}k`);
/** components/vaults/vault-position-card.tsx: compact rows approximate ≥ $1,000. */
const compactUsd = (usdE8) => {
  const usd = Number(BigInt(usdE8)) / 1e8;
  return usd >= 1000 ? `$${approx(usd)}` : usdText(usdE8);
};

const api = async (qs) => {
  const res = await fetch(`${BASE}/api/vaults/positions?${qs}&overlay=0`);
  const json = res.ok ? await res.json() : null;
  return { status: res.status, json };
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

/** The listing's cards as the reader sees them: the value stat's printed text
 *  and its `title`, plus the row's data attributes. */
async function readCards(url) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  const cards = await page.locator("[data-position-card]").evaluateAll((els) =>
    els.map((e) => {
      const stat = [...e.querySelectorAll("div")].find(
        (d) => d.firstElementChild && (d.firstElementChild.textContent ?? "").trim() === "Value · USD",
      );
      const valueEl = stat?.querySelector("[title]");
      const statText = stat ? (stat.textContent ?? "").replace(/\s+/g, " ").trim() : "";
      return {
        vault: e.getAttribute("data-vault"),
        holder: e.getAttribute("data-holder"),
        status: e.getAttribute("data-status"),
        valueUsdE8: e.getAttribute("data-value-usd-e8"),
        pricedBlock: e.getAttribute("data-priced-block"),
        valueText: (valueEl?.textContent ?? "").trim(),
        valueTitle: valueEl?.getAttribute("title") ?? "",
        valueStatText: statText,
      };
    }),
  );
  const chips = await page.locator("[aria-label^='Remove '][aria-label$=' filter']").evaluateAll((els) =>
    els.map((b) => ({
      dim: (b.getAttribute("aria-label") ?? "").replace(/^Remove | filter$/g, ""),
      text: (b.parentElement?.textContent ?? "").replace(/\s+/g, " ").trim(),
    })),
  );
  await page.close();
  return { cards, chips };
}

/** The unpriced sentence — on the vault layer's about page (`chain.info`,
 *  the (i) in the rail) since 2026-09-09, when the listing's intro drawer became
 *  that page; before that it was a hidden panel on the listing itself. Read
 *  from the page it lives on, and null when the page carries no marker. */
async function readUnpriced(url) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  const unpriced = (await page.locator("[data-intro-unpriced]").count())
    ? await page
        .locator("[data-intro-unpriced]")
        .first()
        .evaluate((e) => ({
          vaults: e.getAttribute("data-unpriced-vaults"),
          assets: e.getAttribute("data-unpriced-assets"),
          text: (e.textContent ?? "").replace(/\s+/g, " ").trim(),
        }))
    : null;
  await page.close();
  return unpriced;
}

/** This script's OWN valuation of one (vault, holder) at one block — every
 *  input its own read, the oracle its own resolution, the hop its own call. */
async function ownValue(chain, vault, holder, block) {
  const { client, provider } = CHAINS[chain];
  const bn = BigInt(block);
  const at = (address, functionName, args = []) =>
    client.readContract({ address, abi: ABI, functionName, args, blockNumber: bn });
  const oracle = (await at(provider, "getPriceOracle")).toLowerCase();
  const [balance, shareDecimals, asset] = await Promise.all([
    at(vault, "balanceOf", [holder]),
    at(vault, "decimals"),
    at(vault, "asset"),
  ]);
  const assetLc = asset.toLowerCase();
  const [shareUnit, assetDecimals] = await Promise.all([
    at(vault, "convertToAssets", [pow10(Number(shareDecimals))]),
    at(assetLc, "decimals"),
  ]);
  const tryPrice = async (a) => {
    try {
      return await at(oracle, "getAssetPrice", [a]);
    } catch {
      return null;
    }
  };
  let price = await tryPrice(assetLc);
  let pricedAsset = assetLc;
  let hop = null;
  if (price == null || price === 0n) {
    // The hop, decided HERE: does the asset itself answer asset()?
    let inner = null;
    try {
      inner = (await at(assetLc, "asset")).toLowerCase();
    } catch {
      inner = null;
    }
    if (inner) {
      const innerPrice = await tryPrice(inner);
      if (innerPrice != null && innerPrice > 0n) {
        const [unit, dec] = await Promise.all([
          at(assetLc, "convertToAssets", [pow10(Number(assetDecimals))]),
          at(inner, "decimals"),
        ]);
        hop = { unit, decimals: Number(dec) };
        price = innerPrice;
        pricedAsset = inner;
      }
    }
  }
  const priced = price != null && price > 0n;
  const numerator = balance * shareUnit * (hop ? hop.unit : 1n) * (priced ? price : 0n);
  const denominator = pow10(Number(shareDecimals) + Number(assetDecimals) + (hop ? hop.decimals : 0));
  return {
    oracle,
    balance,
    shareDecimals: Number(shareDecimals),
    asset: assetLc,
    pricedAsset,
    price: priced ? price : null,
    hop,
    valueUsdE8: priced ? numerator / denominator : null,
  };
}

for (const chainId of [8453, 1]) {
  const chain = CHAINS[chainId];
  const tag = chainId === 8453 ? "B" : "E";
  console.log(`\n═══ ${chain.word} (chain ${chainId}) ═══`);

  // ═══ V0 — the route, and whether the census has priced anything ═══════════
  const first = await api(`chain=${chainId}&sortBy=value&sortOrder=desc&limit=20`);
  const census = first.json?.census ?? [];
  const pricedVaults = census.filter((c) => c.pricedBlock != null);
  check(
    `V0${tag}a /api/vaults/positions answers 200 with a census header`,
    first.status === 200 && census.length > 0,
    `${first.status}, ${census.length} census rows`,
  );
  if (pricedVaults.length === 0) {
    skip(
      `V0${tag}b the census has priced at least one vault`,
      `every pricedBlock is null on chain ${chainId} — the price pass has not run; V1–V6 cannot be exercised on this chain`,
    );
    continue;
  }
  check(
    `V0${tag}b the census has priced its vaults at one stated block`,
    pricedVaults.length > 0,
    `${pricedVaults.length}/${census.length} vaults carry a priced block; ${census.filter((c) => c.oraclePriceE8 != null).length} priced by the oracle, ${pricedVaults.filter((c) => c.oraclePriceE8 == null).length} declined`,
  );

  // ═══ V1 — arithmetic ═══════════════════════════════════════════════════════
  // (a) the oracle every census row names is the one the provider names at
  // that row's block — this script's own resolution, one call per distinct
  // block.
  const blocks = [...new Set(pricedVaults.map((c) => c.pricedBlock))];
  const ownOracleAt = new Map();
  for (const b of blocks)
    ownOracleAt.set(
      b,
      (
        await chain.client.readContract({
          address: chain.provider,
          abi: ABI,
          functionName: "getPriceOracle",
          blockNumber: BigInt(b),
        })
      ).toLowerCase(),
    );
  const oracleWrong = pricedVaults.filter((c) => (c.oracle ?? "").toLowerCase() !== ownOracleAt.get(c.pricedBlock));
  check(
    `V1${tag}a every census row's oracle is the one this script resolves from the PoolAddressesProvider at its priced block`,
    oracleWrong.length === 0,
    oracleWrong.length
      ? `${oracleWrong.length} rows disagree, e.g. ${oracleWrong[0].symbol}: ${oracleWrong[0].oracle}`
      : `${pricedVaults.length} rows name ${[...ownOracleAt.values()].join(", ")} across ${blocks.length} block(s)`,
  );

  // (b) the values. Page-one top row plus the pinned fixtures.
  const top = first.json.data[0];
  const targets = [
    { vault: top.vault, holder: top.holder, why: "page-one top row by value", row: top },
    ...chain.fixtures.map((f) => ({ ...f, row: null })),
  ];
  for (const t of targets) {
    if (!t.row) {
      // The proxy matches a holder through `q` (an address, or a fragment of
      // one); it has no `holder` param, and an unknown param is dropped silently.
      const r = await api(`chain=${chainId}&vault=${t.vault}&q=${t.holder}&limit=1`);
      t.row = r.json?.data?.[0] ?? null;
    }
    const label = `${t.vault.slice(0, 8)}…/${t.holder.slice(0, 8)}… (${t.why})`;
    if (!t.row) {
      check(`V1${tag}b value at the priced block — ${label}`, false, "the census has no row for this fixture");
      continue;
    }
    const v = t.row.value;
    if (v.pricedBlock == null) {
      check(`V1${tag}b value at the priced block — ${label}`, false, "the row carries no priced block");
      continue;
    }
    const own = await ownValue(chainId, t.vault, t.holder, v.pricedBlock);
    const same =
      own.oracle === (v.oracle ?? "").toLowerCase() &&
      own.pricedAsset === (v.pricedAsset ?? "").toLowerCase() &&
      (own.price == null ? v.oraclePriceE8 == null : own.price.toString() === v.oraclePriceE8) &&
      (own.valueUsdE8 == null ? v.usdE8 == null : own.valueUsdE8.toString() === v.usdE8) &&
      (own.hop == null) === (v.underlyingUnitAssets == null);
    check(
      `V1${tag}b value at the priced block — ${label}`,
      same,
      same
        ? `${own.valueUsdE8 == null ? "unpriced" : usdText(own.valueUsdE8.toString())} at block ${n(v.pricedBlock)}${own.hop ? " via the underlying hop" : ""}, wei-exact`
        : `own ${own.valueUsdE8} (asset ${own.pricedAsset}, price ${own.price}, hop ${own.hop ? "yes" : "no"}) vs route ${v.usdE8} (asset ${v.pricedAsset}, price ${v.oraclePriceE8}, hop ${v.underlyingUnitAssets != null ? "yes" : "no"})`,
    );
  }

  // ═══ V2 — the floor ════════════════════════════════════════════════════════
  const floor = 1000n * E8;
  const f1000 = await api(`chain=${chainId}&size=1000&sortBy=value&sortOrder=desc&limit=100`);
  const under = (f1000.json?.data ?? []).filter((r) => r.value.usdE8 == null || BigInt(r.value.usdE8) < floor);
  check(
    `V2${tag}a every row under size=1000 is ≥ $1,000`,
    f1000.status === 200 && f1000.json.data.length > 0 && under.length === 0,
    `${f1000.json?.data?.length ?? 0} rows on page one, ${under.length} below the floor`,
  );

  const T = f1000.json?.pagination?.total ?? 0;
  const atRank = async (offset) =>
    (await api(`chain=${chainId}&sortBy=value&sortOrder=desc&limit=1&offset=${offset}`)).json?.data?.[0] ?? null;
  const [last, next] = await Promise.all([atRank(T - 1), atRank(T)]);
  const lastOk = last?.value.usdE8 != null && BigInt(last.value.usdE8) >= floor;
  const nextOk = next == null || next.value.usdE8 == null || BigInt(next.value.usdE8) < floor;
  check(
    `V2${tag}b the boundary: rank ${n(T)} of the value order is ≥ $1,000 and rank ${n(T + 1)} is below it`,
    T > 0 && lastOk && nextOk,
    `rank ${n(T)} = ${last?.value.usdE8 != null ? usdText(last.value.usdE8) : "unpriced"}, rank ${n(T + 1)} = ${next?.value.usdE8 != null ? usdText(next.value.usdE8) : "unpriced or none"}`,
  );

  const totals = {};
  for (const size of ["10000", "100000", "1000000", "unpriced"])
    totals[size] = (await api(`chain=${chainId}&size=${size}&limit=1`)).json?.pagination?.total ?? -1;
  const all = first.json.pagination.total;
  check(
    `V2${tag}c the brackets nest and priced + unpriced never exceed the whole`,
    T >= totals["10000"] &&
      totals["10000"] >= totals["100000"] &&
      totals["100000"] >= totals["1000000"] &&
      totals["1000000"] >= 0 &&
      T + totals.unpriced <= all,
    `$1k ${n(T)} ≥ $10k ${n(totals["10000"])} ≥ $100k ${n(totals["100000"])} ≥ $1M ${n(totals["1000000"])}; unpriced ${n(totals.unpriced)}; all ${n(all)}`,
  );

  // (d) the total the header answers equals the total a counting query
  // answers. The router takes `total` from the census header wherever the
  // WHERE allows (chain, vault, family, status) instead of COUNT(*) OVER();
  // `q=0x` matches every holder and forces the counted path, so the two must
  // agree exactly — a header that drifted from its rows would show here.
  const [hdrLive, cntLive] = await Promise.all([
    api(`chain=${chainId}&status=live&limit=1`),
    api(`chain=${chainId}&status=live&q=0x&limit=1`),
  ]);
  const [hdrAll, cntAll] = await Promise.all([api(`chain=${chainId}&limit=1`), api(`chain=${chainId}&q=0x&limit=1`)]);
  check(
    `V2${tag}d the header-derived total equals the counted total`,
    hdrLive.json?.pagination?.total === cntLive.json?.pagination?.total &&
      hdrAll.json?.pagination?.total === cntAll.json?.pagination?.total &&
      hdrAll.json?.pagination?.total > 0,
    `open ${n(hdrLive.json?.pagination?.total ?? -1)} vs counted ${n(cntLive.json?.pagination?.total ?? -1)}; all ${n(hdrAll.json?.pagination?.total ?? -1)} vs counted ${n(cntAll.json?.pagination?.total ?? -1)}`,
  );

  // ═══ V3 — sorts ════════════════════════════════════════════════════════════
  const vals = first.json.data.map((r) => r.value.usdE8);
  const nonIncreasing = vals.every(
    (v, i) => i === 0 || (v != null && vals[i - 1] != null && BigInt(vals[i - 1]) >= BigInt(v)),
  );
  check(
    `V3${tag}a value desc page one is non-increasing with no unpriced row`,
    nonIncreasing && vals.every((v) => v != null),
    `${vals.length} rows, top ${vals[0] != null ? usdText(vals[0]) : "?"}`,
  );
  const unpricedPage = await api(`chain=${chainId}&size=unpriced&sortBy=value&limit=20`);
  const unpricedRows = unpricedPage.json?.data ?? [];
  if (totals.unpriced === 0)
    skip(
      `V3${tag}b the unpriced set is exactly the null rows`,
      `no unpriced row on chain ${chainId} — every held vault's asset is priced`,
    );
  else
    check(
      `V3${tag}b the unpriced set is exactly the null rows`,
      unpricedRows.length > 0 && unpricedRows.every((r) => r.value.usdE8 == null),
      `${unpricedRows.length} rows, all null: ${unpricedRows.every((r) => r.value.usdE8 == null)}`,
    );

  // (c) share of the vault on a SMALL held vault — derived from the census
  // header: the smallest vault with at least three participants, one of them
  // live and one closed where the chain has such a vault (so V4's three counts
  // are three different numbers), stated in the output.
  const smallCandidates = [...census]
    .filter((c) => c.participants >= 3 && c.liveCount > 0)
    .sort((a, b) => a.participants - b.participants);
  const small = smallCandidates.find((c) => c.participants > c.liveCount) ?? smallCandidates[0];
  const smallRows = [];
  for (let offset = 0; ; offset += 100) {
    const pg = await api(
      `chain=${chainId}&vault=${small.vault}&limit=100&offset=${offset}&sortBy=share&sortOrder=desc`,
    );
    smallRows.push(...(pg.json?.data ?? []));
    if ((pg.json?.data?.length ?? 0) < 100) break;
  }
  const cb = BigInt(small.censusBlock);
  const ownSupply = await chain.client.readContract({
    address: small.vault,
    abi: ABI,
    functionName: "totalSupply",
    blockNumber: cb,
  });
  const ownBalances = new Map();
  for (const r of smallRows)
    ownBalances.set(
      r.holder,
      await chain.client.readContract({
        address: small.vault,
        abi: ABI,
        functionName: "balanceOf",
        args: [r.holder],
        blockNumber: cb,
      }),
    );
  const ownSum = [...ownBalances.values()].reduce((s, b) => s + b, 0n);
  // ppm to six places, as the router's round(balance × 1e6 / supply, 6) —
  // computed here in integers: (balance × 1e12 + supply/2) ÷ supply, then / 1e6.
  const ownPpm = (bal) =>
    ownSupply === 0n ? null : Number((bal * 1_000_000_000_000n + ownSupply / 2n) / ownSupply) / 1e6;
  const ppmBad = smallRows.filter((r) => {
    const own = ownPpm(ownBalances.get(r.holder));
    return own == null ? r.census.sharePpm != null : Math.abs(Number(r.census.sharePpm) - own) > 1e-6;
  });
  check(
    `V3${tag}c sharePpm on ${small.symbol} is this script's own balanceOf × 1e6 ÷ its own totalSupply at block ${n(small.censusBlock)}`,
    smallRows.length === small.participants && ownSum === ownSupply && ppmBad.length === 0,
    `${smallRows.length}/${small.participants} rows, Σ own balances ${ownSum === ownSupply ? "==" : "!="} own totalSupply, ${ppmBad.length} ppm mismatches`,
  );
  const ppmOrder = smallRows.map((r) => Number(r.census.sharePpm ?? -1));
  check(
    `V3${tag}d share desc orders by sharePpm`,
    ppmOrder.every((v, i) => i === 0 || ppmOrder[i - 1] >= v),
    `${ppmOrder.length} rows, top ${ppmOrder[0]} ppm`,
  );

  // ═══ V4 — the Vault chip's count follows the Status filter (DOM) ═══════════
  const ownLive = [...ownBalances.values()].filter((b) => b > 0n).length;
  const ownClosed = smallRows.length - ownLive;
  const chipCount = (dom) => {
    const chip = dom.chips.find((c) => c.dim === "Vault");
    const m = chip?.text.match(/·\s*([\d,]+)\s*$/);
    return { chip: chip?.text ?? "(no Vault chip)", count: m ? Number(m[1].replace(/,/g, "")) : null };
  };
  const [domOpen, domClosed, domAll, domSize] = await Promise.all([
    readCards(`${chain.listing}?vault=${small.vault}&status=live`),
    readCards(`${chain.listing}?vault=${small.vault}&status=closed`),
    readCards(`${chain.listing}?vault=${small.vault}`),
    readCards(`${chain.listing}?size=1000`),
  ]);
  const co = chipCount(domOpen);
  const cc = chipCount(domClosed);
  const ca = chipCount(domAll);
  check(
    `V4${tag}a under Open the Vault chip counts this script's own live balances at the census block`,
    co.count === ownLive,
    `chip "${co.chip}", own live ${ownLive}`,
  );
  if (ownClosed === 0)
    skip(
      `V4${tag}b under Closed the Vault chip counts participants − live`,
      `${small.symbol} has no closed position to count`,
    );
  else
    check(
      `V4${tag}b under Closed the Vault chip counts participants − live`,
      cc.count === ownClosed,
      `chip "${cc.chip}", own closed ${ownClosed}`,
    );
  check(
    `V4${tag}c with no Status the Vault chip counts every participant`,
    ca.count === smallRows.length,
    `chip "${ca.chip}", own participants ${smallRows.length}`,
  );
  const sizeChip = domSize.chips.find((c) => c.dim === "Size");
  check(
    `V4${tag}d the Size chip prints its bracket`,
    sizeChip?.text === "Size: $1,000 or more",
    `chip "${sizeChip?.text ?? "(none)"}"`,
  );

  // ═══ V5 — an unpriced vault ════════════════════════════════════════════════
  const unpricedVault = [...census]
    .filter((c) => c.pricedBlock != null && c.oraclePriceE8 == null && c.liveCount > 0)
    .sort((a, b) => b.liveCount - a.liveCount)[0];
  if (!unpricedVault) {
    skip(
      `V5${tag} an unpriced vault`,
      `every held vault on chain ${chainId} is priced by the oracle — nothing to exercise`,
    );
  } else {
    const u = unpricedVault;
    let ownDeclined = null;
    try {
      const p = await chain.client.readContract({
        address: ownOracleAt.get(u.pricedBlock),
        abi: ABI,
        functionName: "getAssetPrice",
        args: [u.asset],
        blockNumber: BigInt(u.pricedBlock),
      });
      ownDeclined = p === 0n ? "answered 0" : null;
    } catch {
      ownDeclined = "reverted";
    }
    check(
      `V5${tag}a this script's own oracle call declines ${u.assetSymbol} at block ${n(u.pricedBlock)}`,
      ownDeclined != null,
      ownDeclined ?? "the oracle answered a price — the census's null is wrong",
    );
    const uRows = (await api(`chain=${chainId}&vault=${u.vault}&status=live&limit=5`)).json?.data ?? [];
    check(
      `V5${tag}b its rows carry a null value`,
      uRows.length > 0 && uRows.every((r) => r.value.usdE8 == null && r.value.pricedBlock != null),
      `${uRows.length} rows`,
    );
    const [inBracket, inUnpriced] = await Promise.all([
      api(`chain=${chainId}&vault=${u.vault}&size=1000&limit=1`),
      api(`chain=${chainId}&vault=${u.vault}&size=unpriced&limit=1`),
    ]);
    check(
      `V5${tag}c it is absent from every bracket and whole under Unpriced`,
      inBracket.json?.pagination?.total === 0 && inUnpriced.json?.pagination?.total === u.participants,
      `size=1000 → ${inBracket.json?.pagination?.total}, size=unpriced → ${inUnpriced.json?.pagination?.total} of ${u.participants} participants`,
    );
    const uDom = await readCards(`${chain.listing}?vault=${u.vault}&status=live`);
    const uCard = uDom.cards[0];
    check(
      `V5${tag}d its card prints "not priced" in words`,
      uCard &&
        uCard.valueUsdE8 === "" &&
        /not priced/.test(uCard.valueStatText) &&
        !/\$\s?\d/.test(uCard.valueStatText),
      `"${uCard?.valueStatText ?? "(no card)"}"`,
    );
    const unpriced = await readUnpriced(chain.info);
    const named = (unpriced?.assets ?? "").split(",").includes(u.assetSymbol);
    check(
      `V5${tag}e the section's about page names ${u.assetSymbol} among the assets the oracle declined`,
      named,
      unpriced ? `${unpriced.vaults} vaults: ${unpriced.assets}` : `no [data-intro-unpriced] on ${chain.info}`,
    );
  }

  // ═══ V6 — the DOM ══════════════════════════════════════════════════════════
  const rest = await readCards(chain.listing);
  const apiOrder = first.json.data.map((r) => `${r.vault}:${r.holder}`);
  const domOrder = rest.cards.map((c) => `${c.vault}:${c.holder}`);
  check(
    `V6${tag}a the resting listing is the value-desc order — the default sort`,
    domOrder.length === apiOrder.length && domOrder.every((k, i) => k === apiOrder[i]),
    `${domOrder.length} cards${domOrder.length && domOrder[0] !== apiOrder[0] ? `; DOM leads ${domOrder[0]}, API ${apiOrder[0]}` : ""}`,
  );
  const topCard = rest.cards[0];
  const expectText = topCard?.valueUsdE8 ? compactUsd(topCard.valueUsdE8) : null;
  const expectTitle = topCard?.valueUsdE8 ? usdText(topCard.valueUsdE8) : null;
  check(
    `V6${tag}b the top card prints its value through the section's print rule, exact dollars on title=`,
    !!topCard &&
      topCard.valueText === expectText &&
      topCard.valueTitle.startsWith(expectTitle ?? " ") &&
      /census block/.test(topCard.valueTitle),
    topCard ? `"${topCard.valueText}" (title "${topCard.valueTitle}")` : "no card",
  );
}

await browser.close();
console.log(`\n${passes}/${passes + failures} checks passed${skipped ? ` · ${skipped} SKIP` : ""}`);
process.exit(failures ? 1 : 0);
