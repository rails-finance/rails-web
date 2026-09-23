// Liquity V2 redemption-mode prices: our replay against the PriceFeed contract.
//
// The server's `liquity-v2-prices.ts` (rails-server-onboarding, identical copies
// in api/src/utils and workers/liquity-processor/src/utils) prices rETH and
// wstETH two ways: normal operations, and a redemption leg —
//   rETH:   MAX(market, canonical) when market is within 2% of canonical, else MIN
//   wstETH: MAX(stEthUsd, ethUsd) × stEthPerToken when stETH/USD is within 1% of
//           ETH/USD, else stEthUsd × stEthPerToken
// For each redemption transaction below this reads, at the block before it,
// every input the branch's PriceFeed reads (its own oracle structs and rate
// provider), calls fetchRedemptionPrice()/fetchPrice() on the PriceFeed, and
// takes the Redemption event's `_price`/`_redemptionPrice` from the receipt.
// Our function is imported from the server repo and run on the same inputs.
// Where a Chainlink answer moved earlier in the redemption's own block, the
// inputs are replayed to the redemption's position from that block's
// AnswerUpdated logs.
//
// Run (from the web repo root; needs a checkout of rails-server-onboarding
// beside it with workers/liquity-processor/node_modules installed):
//   node --experimental-transform-types --no-warnings \
//     scripts/verify/verify-liquity-v2-redemption-prices.mjs
// Needs ALCHEMY_URL (mainnet archive eth_call) in .env.local — read, never
// printed. Three arms (ARM=A,B,C selects):
//   A  the five redemption cases above: about nine requests each;
//   B  every Liquity V2 redemption on the box: the stored collateral price
//      against the event's `_price` (no RPC);
//   C  up to 24 ordinary trove operations against fetchPrice() at the block
//      before: one request each.
// B and C read the box through RAILS_OPS_PSQL_READ (.env.example); unset,
// they are skipped.

import { createPublicClient, http, parseAbi, decodeEventLog, formatUnits } from "viem";
import { mainnet } from "viem/chains";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SERVER = process.env.SERVER_REPO ?? path.resolve(ROOT, "..", "rails-server-onboarding");
const PRICES_TS = path.join(SERVER, "workers/liquity-processor/src/utils/liquity-v2-prices.ts");
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
// A viem error message carries the transport URL; never let it reach output.
const scrub = (s) =>
  String(s)
    .split(env.ALCHEMY_URL)
    .join("<rpc>")
    .replace(/https?:\/\/\S+/g, "<url>");
process.on("uncaughtException", (e) => {
  console.error(`ERROR ${scrub(e?.shortMessage ?? e?.message ?? e)}`);
  process.exit(2);
});
process.on("unhandledRejection", (e) => {
  console.error(`ERROR ${scrub(e?.shortMessage ?? e?.message ?? e)}`);
  process.exit(2);
});

const { calculateLiquityV2Prices, OperationType } = await import(PRICES_TS);
const client = createPublicClient({ chain: mainnet, transport: http(env.ALCHEMY_URL, { batch: false }) });

const BRANCH = {
  rETH: {
    troveManager: "0xb2b2abeb5c357a234363ff5d180912d319e3e19e",
    priceFeed: "0x34f1e9c7dcc279ec70d3c4488eb2d80fba8b7b2b",
  },
  wstETH: {
    troveManager: "0xa2895d6a3bf110561dfe4b71ca539d84e1928b22",
    priceFeed: "0xe7aa2ba9e086a379d3beb224098bc634a46e314e",
  },
};
// Each case names the branch outcome the contract is expected to have taken.
const CASES = [
  {
    label: "rETH redemption leg fired (MAX)",
    branch: "rETH",
    tx: "0xb313f905859ce2c0e71a99864d1db0aab3fb26d3306440a74b5619c7b7aab66c",
    expect: "fired",
  },
  {
    label: "wstETH redemption leg fired (MAX)",
    branch: "wstETH",
    tx: "0x4b658eb32752bb1ed56bc20f3a5cc24a6b62a14325d998953ec2a6a5a9237846",
    expect: "fired",
  },
  {
    label: "rETH market >2% from canonical (MIN kept)",
    branch: "rETH",
    tx: "0x86aa220f3f3b15d8c9b7d09a5777720d8df99f84a02bc7c86d07df9939da7a60",
    expect: "crossed",
  },
  {
    label: "wstETH stETH/ETH >1% apart (stETH kept)",
    branch: "wstETH",
    tx: "0xc3b719c1b22642d717721e5ec186200c1a4eaad4f027f6788eae0a7988a36109",
    expect: "crossed",
  },
  {
    label: "wstETH crossed inside the block (ETH/USD moved before the redemption)",
    branch: "wstETH",
    tx: "0x3e02c25ca47db9e576a470406ac6aa86b12ab3f6ba6a9fd27817e39d92355ff1",
    expect: "crossed",
  },
];

const feedAbi = parseAbi([
  "function fetchPrice() returns (uint256, bool)",
  "function fetchRedemptionPrice() returns (uint256, bool)",
  "function priceSource() view returns (uint8)",
  "function ethUsdOracle() view returns (address aggregator, uint256 stalenessThreshold, uint8 decimals)",
  "function stEthUsdOracle() view returns (address aggregator, uint256 stalenessThreshold, uint8 decimals)",
  "function rEthEthOracle() view returns (address aggregator, uint256 stalenessThreshold, uint8 decimals)",
  "function rateProviderAddress() view returns (address)",
]);
const proxyAbi = parseAbi([
  "function latestRoundData() view returns (uint80, int256 answer, uint256, uint256 updatedAt, uint80)",
  "function aggregator() view returns (address)",
]);
const rateAbi = parseAbi([
  "function getExchangeRate() view returns (uint256)",
  "function stEthPerToken() view returns (uint256)",
]);
const redemptionAbi = parseAbi([
  "event Redemption(uint256 _attemptedBoldAmount, uint256 _actualBoldAmount, uint256 _ETHSent, uint256 _ETHFee, uint256 _price, uint256 _redemptionPrice)",
]);
const answerUpdatedAbi = parseAbi([
  "event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt)",
]);

let passes = 0;
let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  cond ? passes++ : failures++;
};
const usd = (x) => Number(x).toFixed(6);
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const E18 = 10n ** 18n;

const ARMS = (process.env.ARM ?? "A,B,C").split(",");

if (ARMS.includes("A"))
  for (const c of CASES) {
    const { troveManager, priceFeed } = BRANCH[c.branch];
    console.log(`\n${c.label}\n  tx ${c.tx}`);
    const receipt = await client.getTransactionReceipt({ hash: c.tx });
    const log = receipt.logs.find(
      (l) =>
        l.address.toLowerCase() === troveManager &&
        (() => {
          try {
            return decodeEventLog({ abi: redemptionAbi, ...l }).eventName === "Redemption";
          } catch {
            return false;
          }
        })(),
    );
    const ev = decodeEventLog({ abi: redemptionAbi, ...log }).args;
    const block = receipt.blockNumber;
    const before = block - 1n;
    console.log(`  block ${block} (tx index ${receipt.transactionIndex}); inputs read at ${before}`);

    const read = (address, abi, functionName, blockNumber = before) =>
      client.readContract({ address, abi, functionName, blockNumber });
    const sim = async (functionName) =>
      (await client.simulateContract({ address: priceFeed, abi: feedAbi, functionName, blockNumber: before }))
        .result[0];

    const source = await read(priceFeed, feedAbi, "priceSource");
    const ethOracle = await read(priceFeed, feedAbi, "ethUsdOracle");
    const second = await read(priceFeed, feedAbi, c.branch === "rETH" ? "rEthEthOracle" : "stEthUsdOracle");
    const rateProvider = await read(priceFeed, feedAbi, "rateProviderAddress");
    const ethRound = await read(ethOracle[0], proxyAbi, "latestRoundData");
    const secondRound = await read(second[0], proxyAbi, "latestRoundData");
    const rate = await read(rateProvider, rateAbi, c.branch === "rETH" ? "getExchangeRate" : "stEthPerToken");
    const callRed = await sim("fetchRedemptionPrice");
    const callNorm = await sim("fetchPrice");
    check("PriceFeed on its primary source", source === 0, `priceSource ${source}`);

    // Replay any Chainlink answer that moved in this block before the redemption.
    let ethAnswer = ethRound[1];
    let secondAnswer = secondRound[1];
    const inBlock = callRed !== ev._redemptionPrice;
    if (inBlock) {
      const aggs = {
        eth: (await read(ethOracle[0], proxyAbi, "aggregator", block)).toLowerCase(),
        second: (await read(second[0], proxyAbi, "aggregator", block)).toLowerCase(),
      };
      const logs = await client.getLogs({
        address: [aggs.eth, aggs.second],
        event: answerUpdatedAbi[0],
        fromBlock: block,
        toBlock: block,
      });
      for (const l of logs.filter((l) => l.transactionIndex < receipt.transactionIndex)) {
        if (l.address.toLowerCase() === aggs.eth) ethAnswer = l.args.current;
        else secondAnswer = l.args.current;
        console.log(
          `  in-block update before the redemption: ${l.address.toLowerCase() === aggs.eth ? "ETH/USD" : c.branch === "rETH" ? "rETH/ETH" : "stETH/USD"} → ${formatUnits(l.args.current, l.address.toLowerCase() === aggs.eth ? ethOracle[2] : second[2])} (tx index ${l.transactionIndex})`,
        );
      }
    }

    // Inputs in the units oracle_prices stores: USD feeds at 8 decimals, ratios at 18.
    const to = (answer, fromDec, toDec) =>
      toDec >= fromDec ? answer * 10n ** BigInt(toDec - fromDec) : answer / 10n ** BigInt(fromDec - toDec);
    const data = {
      ethUsd: to(ethAnswer, ethOracle[2], 8),
      stethUsd: c.branch === "wstETH" ? to(secondAnswer, second[2], 8) : 0n,
      rethEth: c.branch === "rETH" ? to(secondAnswer, second[2], 18) : 0n,
      rethExchangeRate: c.branch === "rETH" ? rate : 0n,
      wstethExchangeRate: c.branch === "wstETH" ? rate : 0n,
    };
    const key = c.branch === "rETH" ? "reth" : "wsteth";
    const oursRed = calculateLiquityV2Prices(data, OperationType.REDEEM_COLLATERAL)[key];
    const oursNorm = calculateLiquityV2Prices(data)[key];

    // The two legs, and the deviation the contract tests, in the contract's integer math.
    const eth18 = to(ethAnswer, ethOracle[2], 18);
    const sec18 = to(secondAnswer, second[2], 18);
    let legs, within, deviation;
    if (c.branch === "rETH") {
      const market = (eth18 * sec18) / E18;
      const canonical = (eth18 * rate) / E18;
      legs = `market ${usd(formatUnits(market, 18))}, canonical ${usd(formatUnits(canonical, 18))}`;
      deviation = Number(market - canonical) / Number(canonical);
      within =
        market >= (canonical * (E18 - 2n * 10n ** 16n)) / E18 && market <= (canonical * (E18 + 2n * 10n ** 16n)) / E18;
    } else {
      legs = `stETH/USD ${usd(formatUnits(sec18, 18))}, ETH/USD ${usd(formatUnits(eth18, 18))}, stEthPerToken ${formatUnits(rate, 18)}`;
      deviation = Number(sec18 - eth18) / Number(eth18);
      within = sec18 >= (eth18 * (E18 - 10n ** 16n)) / E18 && sec18 <= (eth18 * (E18 + 10n ** 16n)) / E18;
    }
    console.log(
      `  ${legs}; deviation ${(deviation * 100).toFixed(3)}% → ${within ? "within" : "outside"} the threshold`,
    );
    const evRed = Number(formatUnits(ev._redemptionPrice, 18));
    const evNorm = Number(formatUnits(ev._price, 18));
    console.log(
      `  contract: event _redemptionPrice ${usd(evRed)}, _price ${usd(evNorm)}; eth_call@${before} fetchRedemptionPrice ${usd(formatUnits(callRed, 18))}, fetchPrice ${usd(formatUnits(callNorm, 18))}`,
    );
    console.log(`  ours:     redemption leg ${usd(oursRed)}, normal leg ${usd(oursNorm)}`);

    if (!inBlock)
      check("eth_call at the block before reproduces the event's redemption price", callRed === ev._redemptionPrice);
    check(
      `branch outcome is "${c.expect}"`,
      c.expect === "fired" ? within && ev._redemptionPrice > ev._price : !within && ev._redemptionPrice === ev._price,
    );
    check(
      "ours redemption leg = event _redemptionPrice",
      rel(oursRed, evRed) < 1e-9,
      `rel diff ${rel(oursRed, evRed).toExponential(2)}`,
    );
    if (!inBlock)
      check(
        "ours normal leg = fetchPrice at the block before",
        rel(oursNorm, Number(formatUnits(callNorm, 18))) < 1e-9,
      );
  }

// ── B and C: the stored prices, read from the box ──────────────────────────
// Since 2026-09-21 an event is priced from the oracle state at its position
// in its block (server mig 286, getOraclePricesAtPosition). The box's rows are
// read through RAILS_OPS_PSQL_READ, a read-only shell command that takes psql
// input on stdin and prints rows. Unset, the arms that need it are skipped.
const PSQL_READ = process.env.RAILS_OPS_PSQL_READ ?? env.RAILS_OPS_PSQL_READ;
const canReadBox = (arm) => {
  if (PSQL_READ) return true;
  console.log(`\n${arm}. SKIPPED — RAILS_OPS_PSQL_READ is not set (see .env.example)`);
  return false;
};
const boxRows = (query) => {
  const out = execFileSync("sh", ["-c", PSQL_READ], {
    input: `\\copy (${query.replace(/\s+/g, " ").trim()}) to stdout with csv header\n`,
    encoding: "utf8",
    maxBuffer: 64 << 20,
  });
  const [head, ...lines] = out.trim().split("\n");
  const cols = head.split(",");
  return lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));
};

// B. Every Liquity V2 redemption: the stored collateral price (the normal leg,
// what the trove card states) against the PriceFeed's own `_price` in the
// Redemption event, which is fetchPrice() at the redemption's position.
if (ARMS.includes("B") && canReadBox("B")) {
  console.log("\nB. every redemption's stored collateral_price against the event's _price");
  const rows = boxRows(
    "SELECT collateral_type, block_number, transaction_hash, price, collateral_price FROM redemption_events WHERE protocol_id = 'liquity-v2' ORDER BY block_number",
  );
  for (const type of ["WETH", "rETH", "wstETH"]) {
    const of = rows.filter((r) => r.collateral_type === type);
    const off = of.filter((r) => rel(Number(r.collateral_price), Number(r.price) / 1e18) > 1e-9);
    const worst = off.reduce((m, r) => Math.max(m, rel(Number(r.collateral_price), Number(r.price) / 1e18)), 0);
    check(
      `${type}: ${of.length} redemptions, stored price = _price (1e-9)`,
      of.length > 0 && off.length === 0,
      off.length ? `${off.length} off, worst ${(worst * 100).toFixed(4)}%, e.g. block ${off[0].block_number}` : "0 off",
    );
  }
}

// C. A sample of ordinary trove operations (not redemptions) in blocks where a
// feed update came after the operation and none before it, so the PriceFeed's
// fetchPrice() at the block before is the price at the operation's position.
// Up to four per branch whose collateral price the 2026-09-21 re-price moved,
// and four it left; one per transaction.
if (ARMS.includes("C") && canReadBox("C")) {
  console.log("\nC. ordinary trove operations against fetchPrice() at the block before");
  const FEED = {
    WETH: "0xcc5f8102eb670c89a4a3c567c13851260303c24f",
    wstETH: BRANCH.wstETH.priceFeed,
    rETH: BRANCH.rETH.priceFeed,
  };
  const sample = boxRows(`
    WITH ops AS (
      SELECT DISTINCT ON (o.transaction_hash, o.collateral_type)
             o.id, o.collateral_type, o.block_number, o.transaction_index, o.transaction_hash, o.collateral_price,
             coalesce((b.old_values->>'collateral_price')::numeric IS DISTINCT FROM (b.new_values->>'collateral_price')::numeric, false) AS rewritten,
             (b.old_values->>'collateral_price') AS old_price
        FROM trove_operations o
        LEFT JOIN liquity_v2_reprice_backup b ON b.table_name = 'trove_operations' AND b.row_id = o.id
       WHERE o.protocol_id = 'liquity-v2' AND o.operation_name <> 'redeemCollateral'
         AND EXISTS (SELECT 1 FROM liquity_v2_oracle_updates u WHERE u.block_number = o.block_number AND u.tx_index > o.transaction_index)
         AND NOT EXISTS (SELECT 1 FROM liquity_v2_oracle_updates u WHERE u.block_number = o.block_number AND u.tx_index < o.transaction_index)
    ), ranked AS (
      SELECT *, row_number() OVER (PARTITION BY collateral_type, rewritten ORDER BY md5(transaction_hash)) AS k FROM ops
    )
    SELECT id, collateral_type, block_number, transaction_hash, collateral_price, rewritten, old_price FROM ranked WHERE k <= 4 ORDER BY collateral_type, rewritten, block_number`);
  const feedAbiNorm = parseAbi(["function fetchPrice() returns (uint256, bool)"]);
  for (const r of sample) {
    const before = BigInt(r.block_number) - 1n;
    const [price] = (
      await client.simulateContract({
        address: FEED[r.collateral_type],
        abi: feedAbiNorm,
        functionName: "fetchPrice",
        blockNumber: before,
      })
    ).result;
    const contract = Number(formatUnits(price, 18));
    const stored = Number(r.collateral_price);
    const was =
      r.rewritten === "t"
        ? `, before the re-price ${Number(r.old_price).toFixed(6)} (${(rel(Number(r.old_price), contract) * 100).toFixed(3)}% off)`
        : "";
    check(
      `${r.collateral_type} op ${r.transaction_hash.slice(0, 10)}… block ${r.block_number}: stored ${stored.toFixed(6)} = fetchPrice ${contract.toFixed(6)}`,
      rel(stored, contract) < 1e-9,
      `rel ${rel(stored, contract).toExponential(2)}${was}`,
    );
  }
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
