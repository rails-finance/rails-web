#!/usr/bin/env node
// Fluid dust debt: is the `borrow` we show gross or net of the position's
// dust debt? Answered from the vault's storage, not from the resolvers.
// ----------------------------------------------------------------------------
// A Fluid borrow position stores (tick, tickId, colRaw, dustDebtRaw). Its debt
// on the tick is ratioX96(tick) × colRaw >> 96 — rounded up to the tick — and
// the vault's operate() treats the user's debt as that tick debt MINUS
// dustDebtRaw (vaultT1/coreModule/main.sol: "user debt = debt - dustDebt";
// after a liquidation the same subtraction runs on fetchLatestPosition's debt,
// and a position whose debt falls to or below its dust is written off as 0).
// Both resolvers mirror it: VaultResolver.positionByNftId (the live lane) and
// VaultPositionsResolver (the worker's fluid_position_chain overlay) subtract
// dust before applying the borrow exchange price. This script proves the
// DEPLOYED contracts do that, then follows each fixture to the page.
//
// EVERY EXPECTED FIGURE IS THIS SCRIPT'S OWN READ OF VAULT STORAGE. Per
// fixture, at one pinned block B:
//   D1  positionData decoded from the vault's storage (via the resolver's
//       getPositionDataRaw slot read): tick, tickId, colRaw, dustRaw.
//   D2  debtRaw = ratioX96(tick) × colRaw >> 96 (exact TickMath port below);
//       when the tick's liquidation guard fires, the vault's own
//       fetchLatestPosition(tick, tickId, debtRaw, tickData) replaces it.
//   D3  net = debtRaw > dust ? debtRaw − dust : 0, scaled by the vault's
//       borrow exchange price (1e12). Gross = debtRaw scaled the same way.
//   D4  VaultResolver.positionByNftId: borrow == net and dustBorrow ==
//       scaled dust (0 when written off). Gross differs whenever dust ≠ 0, so
//       this is the gross-vs-net discriminator.
//   D5  VaultPositionsResolver.getPositionsForNftIds: borrow == the same net.
//   D6  The overlay the app serves (/api/fluid/positions settled.borrow at its
//       updatedBlock) == VaultPositionsResolver re-read AT that block.
//   D7  The live lane (/api/chain/fluid/position borrowRaw at its
//       blockNumber) == positionByNftId re-read at that block.
//   D8  The rendered page's "owes X" names the overlay's debt at the page's
//       printed precision (it prints about three significant figures).
//
// Fixtures are INPUTS (which positions), never expected figures:
//   2333  weETH/USDT, liquidated 55 times, left with ~$0.0009 of collateral —
//         the nearly-empty case where a gross figure would show the wrong debt.
//   1247  weETH/WBTC, liquidated 67 times, small remainder.
//   3763  eBTC/WBTC, one deposit_borrow and never touched again.
//
// Run:  node scripts/verify/verify-fluid-dust-borrow.mjs        (dev.rails.finance)
//       BASE=http://localhost:3000 node scripts/verify/verify-fluid-dust-borrow.mjs
// Needs ALCHEMY_URL in .env.local (read, never printed). About 8 eth_calls a fixture.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPublicClient, http, parseAbi, formatUnits } from "viem";
import { mainnet } from "viem/chains";
import { BASE, hostFetch } from "./lib/host.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.ALCHEMY_URL) throw new Error("ALCHEMY_URL missing from .env.local");
const FIXTURES = (process.env.NFTS ?? "2333,1247,3763").split(",").map((s) => BigInt(s.trim()));

const client = createPublicClient({ chain: mainnet, transport: http(env.ALCHEMY_URL) });
/** viem errors can carry the request URL (and with it the key): never print one raw. */
const scrub = (err) => String(err?.shortMessage ?? err?.message ?? err).replace(/https?:\/\/\S+/g, "<rpc>");

const VAULT_RESOLVER = "0xA5C3E16523eeeDDcC34706b0E6bE88b4c6EA95cC";
const POSITIONS_RESOLVER = "0xaA21a86030EAa16546A759d2d10fd3bF9D053Bc7"; // the worker's settle.mjs
const EX = 1_000_000_000_000n; // EXCHANGE_PRICES_PRECISION

// The ABI the app ships, evaluated out of the TS module (see verify-fluid-chain.mjs).
const abiTs = readFileSync(join(root, "lib/fluid/vault-resolver-abi.ts"), "utf8");
const RESOLVER_ABI = new Function(`return ${abiTs.slice(abiTs.indexOf("= [") + 2, abiTs.lastIndexOf(" as const;"))}`)();
const RAW_ABI = parseAbi([
  "function getPositionDataRaw(address vault, uint256 positionId) view returns (uint256)",
  "function getTickDataRaw(address vault, int256 tick) view returns (uint256)",
]);
const VAULT_ABI = parseAbi([
  "function fetchLatestPosition(int256 positionTick, uint256 positionTickId, uint256 positionRawDebt, uint256 tickData) view returns (int256, uint256, uint256, uint256, uint256)",
]);
const POSITIONS_ABI = parseAbi([
  "function getPositionsForNftIds(uint256[] nftIds) view returns ((uint256 nftId, address owner, uint256 supply, uint256 borrow)[])",
]);

// Exact BigInt port of Fluid's TickMath.getRatioAtTick (libraries/tickMath.sol),
// as in rails-server-onboarding workers/fluid-backfill/src/tick-math.mjs.
const FACTORS = [
  0x100000000000000000000000000000000n,
  0xff9dd7de423466c20352b1246ce4856fn,
  0xff3bd55f4488ad277531fa1c725a66d0n,
  0xfe78410fd6498b73cb96a6917f853259n,
  0xfcf2d9987c9be178ad5bfeffaa123273n,
  0xf9ef02c4529258b057769680fc6601b3n,
  0xf402d288133a85a17784a411f7aba082n,
  0xe895615b5beb6386553757b0352bda90n,
  0xd34f17a00ffa00a8309940a15930391an,
  0xae6b7961714e20548d88ea5123f9a0ffn,
  0x76d6461f27082d74e0feed3b388c0ca1n,
  0x372a3bfe0745d8b6b19d985d9a8b85bbn,
  0x0be32cbee48979763cf7247dd7bb539dn,
  0x8d4f70c9ff4924dac37612d1e2921en,
  0x4e009ae5519380809a02ca7aec77n,
  0x17c45e641b6e95dee056ff10n,
];
function getRatioAtTick(tick) {
  const abs = tick < 0n ? -tick : tick;
  let f = (abs & 1n) !== 0n ? FACTORS[1] : FACTORS[0];
  for (let i = 1; i < 15; i++) if ((abs & (1n << BigInt(i))) !== 0n) f = (f * FACTORS[i + 1]) >> 128n;
  let precision = 0n;
  if (tick >= 0n) {
    f = ((1n << 256n) - 1n) / f;
    if (f % 0x100000000n !== 0n) precision = 1n;
  }
  return (f >> 32n) + precision;
}

const X = (v, bits) => v & ((1n << BigInt(bits)) - 1n);
const bigNum = (v) => (v >> 8n) << (v & 255n);

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};
const info = (msg) => console.log(`      ${msg}`);

async function getJson(path) {
  const res = await hostFetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}
const pageText = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/g, " ")
    .replace(/\s+/g, " ");

async function fixture(nft, B) {
  console.log(`\n── nft ${nft} @ block ${B}`);
  const [pos, vd] = await client.readContract({
    address: VAULT_RESOLVER,
    abi: RESOLVER_ABI,
    functionName: "positionByNftId",
    args: [nft],
    blockNumber: B,
  });
  const vault = vd.vault;
  const ex = vd.exchangePricesAndRates.vaultBorrowExchangePrice;

  // D1 — storage decode
  const raw = await client.readContract({
    address: VAULT_RESOLVER,
    abi: RAW_ABI,
    functionName: "getPositionDataRaw",
    args: [vault, nft],
    blockNumber: B,
  });
  const isSupply = (raw & 1n) === 1n;
  const tick = (raw & 2n) === 2n ? X(raw >> 2n, 19) : -X(raw >> 2n, 19);
  const tickId = X(raw >> 21n, 24);
  const colRaw = bigNum(X(raw >> 45n, 64));
  const dustRaw = bigNum(X(raw >> 109n, 64));
  info(`storage: supplyOnly=${isSupply} tick=${tick} tickId=${tickId} colRaw=${colRaw} dustRaw=${dustRaw}`);
  if (isSupply) return check(`${nft} D1 is a borrow position`, false, "supply-only — no debt leg to test");

  // D2 — tick debt, settled through a liquidation when the guard fires
  let debtRaw = (getRatioAtTick(tick) * colRaw) >> 96n;
  const tickData = await client.readContract({
    address: VAULT_RESOLVER,
    abi: RAW_ABI,
    functionName: "getTickDataRaw",
    args: [vault, tick],
    blockNumber: B,
  });
  const liquidated = (tickData & 1n) === 1n || X(tickData >> 1n, 24) > tickId;
  if (liquidated) {
    const r = await client.readContract({
      address: vault,
      abi: VAULT_ABI,
      functionName: "fetchLatestPosition",
      args: [tick, tickId, debtRaw, tickData],
      blockNumber: B,
    });
    info(`liquidation guard fires: tick debtRaw ${debtRaw} → fetchLatestPosition debtRaw ${r[1]}`);
    debtRaw = r[1];
  }
  check(`${nft} D2 isLiquidated agrees with the tick guard`, pos.isLiquidated === liquidated, `${pos.isLiquidated}`);

  // D3 — gross and net, scaled
  const writtenOff = debtRaw <= dustRaw;
  const net = ((writtenOff ? 0n : debtRaw - dustRaw) * ex) / EX;
  const gross = (debtRaw * ex) / EX;
  const dustScaled = writtenOff ? 0n : (dustRaw * ex) / EX;
  info(
    `borrow exchange price ${ex}; gross ${gross} raw units, net ${net}, dust ${dustScaled}${writtenOff ? " (debt ≤ dust: written off)" : ""}`,
  );

  // D4 — the live lane's resolver
  check(
    `${nft} D4 positionByNftId.borrow is NET of dust`,
    pos.borrow === net,
    `borrow ${pos.borrow} vs net ${net} / gross ${gross}`,
  );
  check(
    `${nft} D4 positionByNftId.dustBorrow is the stored dust, scaled`,
    pos.dustBorrow === dustScaled,
    `${pos.dustBorrow}`,
  );
  if (!liquidated) {
    check(
      `${nft} D4 untouched position: borrow == beforeBorrow`,
      pos.borrow === pos.beforeBorrow,
      `${pos.beforeBorrow}`,
    );
  }
  info(
    `resolver: supply ${pos.supply} borrow ${pos.borrow} dustBorrow ${pos.dustBorrow} beforeBorrow ${pos.beforeBorrow} beforeDustBorrow ${pos.beforeDustBorrow}`,
  );

  // D5 — the overlay's resolver at the same block
  const [p2] = await client.readContract({
    address: POSITIONS_RESOLVER,
    abi: POSITIONS_ABI,
    functionName: "getPositionsForNftIds",
    args: [[nft]],
    blockNumber: B,
  });
  check(`${nft} D5 VaultPositionsResolver.borrow == the same net`, p2.borrow === net, `${p2.borrow}`);

  // D6 — what the overlay stores and the app serves
  const listing = await getJson(`/api/fluid/positions?nft=${nft}`);
  const row = listing.data?.[0];
  const settled = row?.settled;
  check(
    `${nft} D6 the app serves a settled overlay`,
    !!settled,
    settled ? `borrow ${settled.borrow} @ ${settled.updatedBlock}` : "none",
  );
  if (settled) {
    const decimals = row.borrowDecimals;
    const [atU] = await client.readContract({
      address: POSITIONS_RESOLVER,
      abi: POSITIONS_ABI,
      functionName: "getPositionsForNftIds",
      args: [[nft]],
      blockNumber: BigInt(settled.updatedBlock),
    });
    const expect = formatUnits(atU.borrow, decimals);
    check(
      `${nft} D6 overlay borrow == VaultPositionsResolver at the overlay block`,
      Number(settled.borrow) === Number(expect),
      `served ${settled.borrow}, chain ${expect} ${row.borrowSymbol}`,
    );
  }

  // D7 — the live lane
  const live = await getJson(`/api/chain/fluid/position?nft=${nft}`);
  if (live.chainStale || !live.blockNumber) {
    check(`${nft} D7 live lane answered`, false, "chainStale");
  } else {
    const [atL] = await client.readContract({
      address: VAULT_RESOLVER,
      abi: RESOLVER_ABI,
      functionName: "positionByNftId",
      args: [nft],
      blockNumber: BigInt(live.blockNumber),
    });
    check(
      `${nft} D7 live borrowRaw == positionByNftId at its block`,
      BigInt(live.borrowRaw) === atL.borrow,
      `${live.borrowRaw} @ ${live.blockNumber}`,
    );
  }

  // D8 — the rendered page
  if (settled) {
    const html = await (await hostFetch(`${BASE}/ethereum/fluid/${nft}`)).text();
    const text = pageText(html);
    const m = text.match(/owes ([0-9.e+-]+) ([A-Za-z0-9]+)/);
    // The page prints to a few significant figures: compare at its precision.
    const sig = m
      ? m[1]
          .split("e")[0]
          .replace(/^[0.]+/, "")
          .replace(".", "").length
      : 0;
    const atSig = (v) => Number(Number(v).toPrecision(Math.max(sig, 1)));
    const grossHuman = formatUnits(gross, row.borrowDecimals);
    check(
      `${nft} D8 page prose names the overlay's debt`,
      !!m && Number(m[1]) === atSig(settled.borrow),
      m
        ? `"owes ${m[1]} ${m[2]}" (overlay ${settled.borrow}; gross would print ${atSig(grossHuman)})`
        : "no 'owes' clause",
    );
  }
}

try {
  const B = await client.getBlockNumber();
  for (const nft of FIXTURES) await fixture(nft, B);
} catch (err) {
  console.error(`ERROR ${scrub(err)}`);
  process.exit(2);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
