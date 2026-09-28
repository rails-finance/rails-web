// ============================================================================
// VERIFY: every Fluid timeline row's balance is the vault's at its block
// ============================================================================
//
// Read-only. /api/fluid/timeline serves col_chain_* / debt_chain_* on each row:
// the settled supply and borrow VaultPositionsResolver answered at the end of
// the row's block (server mig 344, filled by fluid-backfill's atblock pass),
// less the position's later rows in the same block. Checked here through paths
// the fill does not use:
//
//   1. Row vs VaultResolver.positionByNftId at the row's block — a different
//      contract (live from block 23,881,723) — on the last row of a block, both
//      legs, within 1 base unit.
//   2. Rows before that block: the collateral leg against the raw position slot
//      (vault.readFromStorage, mapping slot 3, supply bignum) × the vault's
//      supply exchange price at the block (vault.updateExchangePrices) ÷ 1e12,
//      on rows whose position is not liquidated.
//   3. The interest the rows state (before(n) − after(n−1), summed) is
//      reported beside the Σ lane's shortfall on the last row.
//   4. Header: the head read less the last row's after is the accrual since the
//      last event (reported), and never negative on the debt leg.
//   5. A window (?recent=N) opens on the same balance the whole history holds
//      at that row.
//
// Run:  node scripts/verify-fluid-row-balances.mjs [nftId …]
// Env:  .env.local — ALCHEMY_URL (chain), RAILS_API_URL + API_BEARER_TOKEN (index)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPublicClient, http, parseAbi, keccak256, encodeAbiParameters } from "viem";
import { mainnet } from "viem/chains";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
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
for (const k of ["ALCHEMY_URL", "RAILS_API_URL", "API_BEARER_TOKEN"]) if (!env[k]) throw new Error(`${k} missing`);

const client = createPublicClient({ chain: mainnet, transport: http(env.ALCHEMY_URL) });
const VAULT_RESOLVER = "0xA5C3E16523eeeDDcC34706b0E6bE88b4c6EA95cC";
const VAULT_RESOLVER_LIVE = 23_881_723n;
const abiTs = readFileSync(join(root, "lib/fluid/vault-resolver-abi.ts"), "utf8");
const RESOLVER_ABI = new Function(`return ${abiTs.slice(abiTs.indexOf("= [") + 2, abiTs.lastIndexOf(" as const;"))}`)();
const VAULT_ABI = parseAbi([
  "function readFromStorage(bytes32 slot) view returns (uint256)",
  "function updateExchangePrices(uint256 vaultVariables2) view returns (uint256, uint256, uint256, uint256)",
]);
const VV2_SLOT = `0x${"0".repeat(63)}1`;
const posSlot = (nft) => keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [BigInt(nft), 3n]));
const bigNum = (v) => (v >> 8n) << (v & 255n);

// Deepest (NFT 1566, 1,440 rows), a position with 217 rows after the
// VaultResolver went live (8895), a smart-collateral-and-debt position
// (17993), and one whose history ends before it (1508).
const NFTS = process.argv.slice(2).length ? process.argv.slice(2) : ["1566", "8895", "17993", "1508"];
const PER_NFT = 6;

let pass = 0;
let fail = 0;
let calls = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};
const within = (a, b, units = 1n) => (a > b ? a - b : b - a) <= units;

async function timeline(nft, recent) {
  const url = `${env.RAILS_API_URL}/api/fluid/timeline?nft=${nft}${recent ? `&recent=${recent}` : ""}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${env.API_BEARER_TOKEN}` } });
  if (!res.ok) throw new Error(`timeline ${nft}: HTTP ${res.status}`);
  return (await res.json()).rows;
}

const bears = (r) => r.action !== "mint" && r.action !== "transfer";
const spread = (xs, n) =>
  xs.length <= n ? xs : Array.from({ length: n }, (_, i) => xs[Math.floor((i * (xs.length - 1)) / (n - 1))]);

for (const nft of NFTS) {
  const rows = await timeline(nft);
  const read = rows.filter((r) => r.col_chain_after != null);
  check(
    `nft ${nft}: every row carries the chain balance`,
    read.length === rows.length,
    `${read.length}/${rows.length}`,
  );
  if (read.length === 0) continue;

  // Last balance-bearing row of each block.
  const lastOfBlock = rows.filter(
    (r, i) =>
      bears(r) && r.col_chain_after != null && (i === rows.length - 1 || rows[i + 1].block_number !== r.block_number),
  );

  // 1. VaultResolver at the block.
  const post = spread(
    lastOfBlock.filter((r) => BigInt(r.block_number) >= VAULT_RESOLVER_LIVE),
    PER_NFT,
  );
  for (const r of post) {
    calls++;
    const [pos] = await client.readContract({
      address: VAULT_RESOLVER,
      abi: RESOLVER_ABI,
      functionName: "positionByNftId",
      args: [BigInt(nft)],
      blockNumber: BigInt(r.block_number),
    });
    const ok = within(pos.supply, BigInt(r.col_chain_after)) && within(pos.borrow, BigInt(r.debt_chain_after));
    check(
      `nft ${nft} ${r.action} @${r.block_number}: row = positionByNftId`,
      ok,
      `supply ${r.col_chain_after} vs ${pos.supply}, borrow ${r.debt_chain_after} vs ${pos.borrow}`,
    );
  }

  // 2. Before the VaultResolver: supply slot × exchange price, unliquidated rows.
  const liquidatedFrom = rows.find((r) => r.action === "liquidated" || r.action === "absorbed")?.block_number;
  const pre = spread(
    lastOfBlock.filter(
      (r) =>
        BigInt(r.block_number) < VAULT_RESOLVER_LIVE &&
        r.vault_type === 10000 &&
        (liquidatedFrom == null || BigInt(r.block_number) < BigInt(liquidatedFrom)),
    ),
    post.length >= PER_NFT ? 3 : PER_NFT,
  );
  for (const r of pre) {
    const blockNumber = BigInt(r.block_number);
    calls += 3;
    const raw = await client.readContract({
      address: r.vault,
      abi: VAULT_ABI,
      functionName: "readFromStorage",
      args: [posSlot(nft)],
      blockNumber,
    });
    const vv2 = await client.readContract({
      address: r.vault,
      abi: VAULT_ABI,
      functionName: "readFromStorage",
      args: [VV2_SLOT],
      blockNumber,
    });
    const [, , supplyExPrice] = await client.readContract({
      address: r.vault,
      abi: VAULT_ABI,
      functionName: "updateExchangePrices",
      args: [vv2],
      blockNumber,
    });
    const supplyRaw = bigNum((raw >> 45n) & 0xffffffffffffffffn);
    const supply = (supplyRaw * supplyExPrice) / 1_000_000_000_000n;
    check(
      `nft ${nft} ${r.action} @${r.block_number}: collateral = slot × exchange price`,
      within(supply, BigInt(r.col_chain_after)),
      `${r.col_chain_after} vs ${supply}`,
    );
  }

  // 3. The interest the rows state, against the Σ lane's shortfall.
  let gaps = [0n, 0n];
  let prev = null;
  for (const r of rows) {
    if (!bears(r) || r.col_chain_after == null) continue;
    if (prev) {
      gaps = [
        gaps[0] + (BigInt(r.col_chain_before) - BigInt(prev.col_chain_after)),
        gaps[1] + (BigInt(r.debt_chain_before) - BigInt(prev.debt_chain_after)),
      ];
    }
    prev = r;
  }
  if (prev) {
    console.log(
      `      nft ${nft}: interest stated across the rows — collateral ${gaps[0]}, debt ${gaps[1]} base units; ` +
        `last row chain − Σ lane: collateral ${BigInt(prev.col_chain_after) - BigInt(prev.col_after.split(".")[0])}, debt ${BigInt(prev.debt_chain_after) - BigInt(prev.debt_after.split(".")[0])}`,
    );

    // 4. Header: head read − last row.
    calls++;
    const [head] = await client.readContract({
      address: VAULT_RESOLVER,
      abi: RESOLVER_ABI,
      functionName: "positionByNftId",
      args: [BigInt(nft)],
    });
    const accrual = [head.supply - BigInt(prev.col_chain_after), head.borrow - BigInt(prev.debt_chain_after)];
    check(
      `nft ${nft}: head read − last row is accrual since block ${prev.block_number} (debt leg ≥ 0)`,
      accrual[1] >= 0n,
      `collateral +${accrual[0]}, debt +${accrual[1]} (base units)`,
    );
  }

  // 5. A window opens on the whole history's balance.
  if (rows.length > 60) {
    const win = await timeline(nft, 50);
    const first = win.find((r) => bears(r));
    const same = rows.find((r) => r.event_key === first?.event_key);
    check(
      `nft ${nft}: ?recent=50 opens at ${first?.block_number} on the whole history's balance`,
      !!first &&
        !!same &&
        first.col_chain_after === same.col_chain_after &&
        first.debt_chain_after === same.debt_chain_after,
      `${first?.col_chain_after} / ${first?.debt_chain_after}`,
    );
  }
}

console.log(`\n${pass} passed, ${fail} failed · ${calls} eth_calls (~${calls * 26} CU)`);
process.exit(fail ? 1 : 0);
