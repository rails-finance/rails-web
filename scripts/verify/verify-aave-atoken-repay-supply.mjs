// A repay made with aTokens leaves the supply lane (server mig 343).
// ----------------------------------------------------------------------------
// repayWithATokens burns the wallet's aTokens for the debt it clears. The
// replays once moved only the debt lane on such a repay, so a position's last
// row read its supply high by everything it had repaid that way: core
// 0xee7c…2954 USDC was served 119,541,185.36 while aUSDC balanceOf was 0.
//
// For each sampled position (Aave V3 Core and SparkLend, every one with aToken
// repays) this reads the api's timeline, takes the position's last row, and
// checks its supply_after against the aToken's balanceOf at head. The replay
// sums principal and leaves out interest, which only adds to a balance, so the
// row may sit below the chain but never above it; a tolerance of 1e-6 of the
// balance plus 10 raw units allows for index rounding. Before mig 343 the Core
// samples fail by the total they repaid with aTokens.
//
// Run:  node scripts/verify/verify-aave-atoken-repay-supply.mjs
// Env:  .env.local — ALCHEMY_URL (Ethereum); RAILS_API_URL + API_BEARER_TOKEN.

import { readFileSync } from "node:fs";
import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";

const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
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
for (const k of ["ALCHEMY_URL", "RAILS_API_URL", "API_BEARER_TOKEN"]) {
  if (!env[k]) throw new Error(`${k} missing from .env.local`);
}

const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const SAMPLES = [
  {
    slug: "aave-v3",
    market: "core",
    wallet: "0xee7ca610d896c53ffe716b801c05748efd902954",
    reserve: USDC,
    atoken: "0x98c23e9d8f34fefb1b7bd6a91b7ff122f4e16f5c",
  },
  {
    slug: "aave-v3",
    market: "core",
    wallet: "0x299188475f29ef2984e020cba55ec02c522a9087",
    reserve: WETH,
    atoken: "0x4d5f47fa6a74757f35c14fd3a6ef8e3c9bc514e8",
  },
  {
    slug: "aave-v3",
    market: "core",
    wallet: "0x843c0486030646cb1e95fff8a3d3208ed1d33917",
    reserve: WETH,
    atoken: "0x4d5f47fa6a74757f35c14fd3a6ef8e3c9bc514e8",
  },
  {
    slug: "aave-v3",
    market: "core",
    wallet: "0x47e0a8622f0d343afa2aa5e1a3100c1cdc56bd50",
    reserve: USDC,
    atoken: "0x98c23e9d8f34fefb1b7bd6a91b7ff122f4e16f5c",
  },
  {
    slug: "spark",
    market: null,
    wallet: "0x398d328e7a6a71763a7ff59822564154d42b64a9",
    reserve: WETH,
    atoken: "0x59cd1c87501baa753d0b5b5ab5d8416a45cd71db",
  },
];

const client = createPublicClient({ chain: mainnet, transport: http(env.ALCHEMY_URL) });
const ERC20 = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const cmp = (a, b) =>
  Number(a.block_number) - Number(b.block_number) || a.tx_index - b.tx_index || a.log_index - b.log_index;

let failed = 0;
const head = await client.getBlockNumber();
console.log(`head ${head}`);
for (const s of SAMPLES) {
  const res = await fetch(`${env.RAILS_API_URL}/api/${s.slug}/timeline?wallet=${s.wallet}`, {
    headers: { Authorization: `Bearer ${env.API_BEARER_TOKEN}` },
  });
  if (!res.ok) throw new Error(`${s.slug} ${s.wallet}: api ${res.status}`);
  const body = await res.json();
  const rows = (body.rows ?? [])
    .filter((r) => (s.market == null || r.market === s.market) && (r.reserve ?? r.collateral_asset) === s.reserve)
    .sort(cmp);
  const last = rows.at(-1);
  const aRepays = rows.filter((r) => r.action === "repay" && r.use_a_tokens).length;
  const balance = await client.readContract({
    address: s.atoken,
    abi: ERC20,
    functionName: "balanceOf",
    args: [s.wallet],
    blockNumber: head,
  });
  const row = last ? BigInt(last.supply_after) : null;
  const tol = balance / 1_000_000n + 10n;
  const ok = row != null && row >= 0n && row <= balance + tol && aRepays > 0;
  if (!ok) failed++;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${s.slug}${s.market ? `/${s.market}` : ""} ${s.wallet} ${s.reserve}: last row (block ${last?.block_number}) supply_after ${row} vs balanceOf ${balance} (chain − row ${row == null ? "?" : balance - row}; ${aRepays} aToken repays)`,
  );
}
console.log(`\n${SAMPLES.length} positions, ${failed} failed`);
process.exit(failed ? 1 : 0);
