// Verify the Seamless (Base, chain 8453) facts the explorer renders as primary
// truth. Seamless is an Aave V3 fork — one cross-collateralised Pool, reserves
// keyed by underlying address, priced through one IAaveOracle, configured via a
// PoolAddressesProvider — so it runs the SAME shared core as Aave V3 and
// SparkLend (scripts/lib/aave-v3-fork-verify-core.mjs) with its own addresses.
// It exits on its OWN failure count.
//
// The addresses below mirror lib/seamless/asset-catalog.ts (node can't import
// that .ts through the "@/" alias). The provider IS pinned, as Spark's is: the
// catalog names it as the registry the other two were resolved from.
//
// THE MARKET IS CLOSED, and check 5b is where that stops being a claim. All
// eighteen reserves carry the frozen bit; they were frozen in ONE block, which
// the catalog found by binary search over the bit and this re-derives exactly —
// frozen at 28,952,883, not frozen at the block before it, read with archive
// eth_call. The provider's owner() is the zero address, so the Pool, oracle and
// configurator it points at can no longer be swapped. A frozen reserve still
// accrues, still liquidates and still lets a holder repay and withdraw, which is
// why checks 4-6 mean here what they mean on any open market.
//
// Interest-rate strategy shape: per-reserve legacy strategies (ten distinct
// across eighteen reserves) with no-arg getters — strategyMode "noarg", as
// SparkLend's.
//
// WHAT IT DOES NOT CHECK, and why:
//   • Catalog liquidation thresholds. There is no table — this explorer
//     publishes none, by design: every risk parameter it renders is decoded from
//     the reserve's own `configuration` word, the word the Pool liquidates with.
//     Check #2 asserts that word's internal consistency and its decimals against
//     each token's ERC20, and states the absence rather than inventing a second
//     source (`catalog: null`).
//   • Anything needing a log range. BASE_RPC_URL is a full archive for eth_call
//     and eth_getCode, and its eth_getLogs answers TEN BLOCKS at a time — an
//     absence, not a budget preference. So the freeze TRANSACTION the catalog
//     names is not re-read here; the freeze BLOCK is, from the bit itself, which
//     is the stronger of the two anyway. Check #7a's per-row log reads fit
//     because each asks for one block.
//   • The listing's own figures. A Base listing row is already a chain read at a
//     pinned block; check #7 checks what can disagree instead.
//   • Liquidation-bonus and accrued-interest exactness (as on every sibling).
//
// Run: node scripts/verify-seamless-chain.mjs
//      BASE=https://preview.rails.finance node scripts/verify-seamless-chain.mjs
// Env: .env.local — BASE_RPC_URL (chain); RAILS_API_URL + API_BEARER_TOKEN (the
//      position sample; checks #6 and #7 skip gracefully without them).
//      BASE (process env) — the web origin check #7 reads the timeline from.

import { base } from "viem/chains";
import { parseAbi } from "viem";
import { loadEnv, run } from "./lib/aave-v3-fork-verify-core.mjs";

// lib/seamless/asset-catalog.ts — the market's whole stated identity.
const SEAMLESS_POOL = "0x8f44fd754285aa6a2b8b9b97739b79746e0475a7";
const SEAMLESS_ORACLE = "0xfdd4e83890bccd1fbf9b10d71a5cc0a738753b01";
const SEAMLESS_PROVIDER = "0x0e02eb705be325407707662c6f6d3466e939f3a0";
const SEAMLESS_FREEZE_BLOCK = 28_952_883;
const SEAMLESS_RESERVE_COUNT = 18;

const PROVIDER_ABI = parseAbi([
  "function getMarketId() view returns (string)",
  "function owner() view returns (address)",
]);
const POOL_CONFIG_ABI = parseAbi(["function getConfiguration(address asset) view returns ((uint256 data))"]);

/** ReserveConfiguration bit 57 — the frozen flag. */
const FROZEN_BIT = 57n;
const frozen = (cfg) => ((cfg >> FROZEN_BIT) & 1n) === 1n;

const env = loadEnv(import.meta.url, "BASE_RPC_URL");

const failures = await run({
  label: "Seamless (Base)",
  chain: base,
  rpcKey: "BASE_RPC_URL",
  pool: SEAMLESS_POOL,
  provider: SEAMLESS_PROVIDER,
  oracle: SEAMLESS_ORACLE,
  catalog: null,
  catalogAuthoritative: false,
  strategyMode: "noarg",
  apiSlug: "seamless",
  positionsSort: "debt",
  timeline: { origin: process.env.BASE ?? "http://localhost:3000", slug: "seamless" },
  extraChecks: {
    title: "A market that is closed (Seamless's own facts)",
    run: async ({ client, pool, reserves, check, getAddress }) => {
      const [marketId, owner] = await Promise.all([
        client.readContract({ address: getAddress(SEAMLESS_PROVIDER), abi: PROVIDER_ABI, functionName: "getMarketId" }),
        client
          .readContract({ address: getAddress(SEAMLESS_PROVIDER), abi: PROVIDER_ABI, functionName: "owner" })
          .catch(() => null),
      ]);
      check(`provider.getMarketId() == "Base Seamless Market"`, marketId === "Base Seamless Market", `"${marketId}"`);
      check(
        `provider ownership renounced — the Pool and oracle cannot be swapped`,
        owner != null && /^0x0{40}$/i.test(owner),
        `${owner}`,
      );
      check(
        `reserve roster is ${SEAMLESS_RESERVE_COUNT} reserves`,
        reserves.length === SEAMLESS_RESERVE_COUNT,
        `${reserves.length}`,
      );

      const unfrozen = reserves.filter((r) => !frozen(r.configRaw));
      check(
        `every reserve carries the frozen bit — nobody can open a position here`,
        unfrozen.length === 0,
        `${reserves.length - unfrozen.length}/${reserves.length} frozen`,
      );
      unfrozen.slice(0, 5).forEach((r) => console.log(`      ! ${r.addr} is not frozen`));

      // The freeze block, re-derived from the bit rather than from the
      // announcement: frozen at it, not frozen at the block before it. One
      // reserve settles it — all eighteen were frozen in the same transaction —
      // but asking all eighteen costs two multicalls and proves the "one action"
      // claim rather than assuming it.
      const at = async (blockNumber) =>
        client.multicall({
          allowFailure: true,
          contracts: reserves.map((r) => ({
            address: pool,
            abi: POOL_CONFIG_ABI,
            functionName: "getConfiguration",
            args: [getAddress(r.addr)],
          })),
          blockNumber,
        });
      const [after, before] = await Promise.all([
        at(BigInt(SEAMLESS_FREEZE_BLOCK)),
        at(BigInt(SEAMLESS_FREEZE_BLOCK - 1)),
      ]);
      const count = (rows) =>
        rows.filter((x) => x && x.status === "success" && frozen(x.result.data ?? x.result)).length;
      const readable = (rows) => rows.filter((x) => x && x.status === "success").length;
      check(
        `every reserve frozen at block ${SEAMLESS_FREEZE_BLOCK}`,
        readable(after) > 0 && count(after) === readable(after),
        `${count(after)}/${readable(after)} readable`,
      );
      check(
        `none frozen at block ${SEAMLESS_FREEZE_BLOCK - 1} — one governance action, not a fade`,
        readable(before) > 0 && count(before) === 0,
        `${count(before)}/${readable(before)} readable`,
      );
    },
  },
  env,
});

process.exit(failures === 0 ? 0 : 1);
