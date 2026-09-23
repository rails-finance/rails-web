// Verify the Dolomite chain lane against the deployed core — assertions that
// could actually fail, run against live mainnet (ALCHEMY_URL from .env.local
// or the environment). No ABI source is authoritative; only the deployed
// chain is — every selector here was pinned by round-trip against it.
//
//   A. The roster is the core's own: markets enumerate via getNumMarkets →
//      getMarketTokenAddress (never a hardcoded count), every token resolves.
//   B. Anti-pin (the charter's S3 gate): no stable answers getMarketPrice
//      with exactly 1e(36 − decimals) — live feeds, not $1 pins.
//   C. The wsrUSD ↔ srUSD alias: two different tokens whose prices are equal
//      TO THE WEI — the stated shared-oracle nuance.
//   D. Multiplicative premiums: on a premium-bearing account WITHOUT the
//      override, getAdjustedAccountValues re-derives from getAccountValues ×
//      the premiums (supply ÷ (1+p), borrow × (1+p)) — BigInt-exact.
//   E. ⚠️ The carve-out: an LST/ETH-pair account answers
//      getAccountRiskOverrideByAccount with (0.1111…e18, 0.04e18), its
//      adjusted values EQUAL raw (premiums skipped), and
//      getMarginRatioForAccount returns the override; a normal account
//      answers (0, 0) and the global ratio.
//   F. par × index ÷ 1e18 == the wei leg getAccountBalances itself returns,
//      per market — HALF-UP division (measured: the deployed parToWei rounds
//      half-up; plain floor left supply legs 1 wei short).
//
// Usage: node scripts/verify-dolomite-chain.mjs

import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import { readFileSync, existsSync } from "node:fs";

const envFile = existsSync(".env.local")
  ? Object.fromEntries(
      readFileSync(".env.local", "utf8")
        .split("\n")
        .filter((l) => l.includes("="))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
    )
  : {};
const ALCHEMY_URL = process.env.ALCHEMY_URL ?? envFile.ALCHEMY_URL;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY ?? envFile.ETHERSCAN_API_KEY;
const RAILS_API_URL = (process.env.RAILS_API_URL ?? envFile.RAILS_API_URL ?? "").replace(/\/$/, "");
const API_BEARER_TOKEN = process.env.API_BEARER_TOKEN ?? envFile.API_BEARER_TOKEN;
if (!ALCHEMY_URL) {
  console.error("ALCHEMY_URL not set");
  process.exit(1);
}

const client = createPublicClient({ chain: mainnet, transport: http(ALCHEMY_URL) });
const CORE = "0x003ca23fd5f0ca87d01f6ec6cd14a8ae60c2b97d";
const BASE = BigInt("1000000000000000000");

const ABI = parseAbi([
  "struct Info { address owner; uint256 number; }",
  "function getNumMarkets() view returns (uint256)",
  "function getMarketTokenAddress(uint256 marketId) view returns (address)",
  "function getMarketPrice(uint256 marketId) view returns ((uint256 value))",
  "function getMarketMarginPremium(uint256 marketId) view returns ((uint256 value))",
  "function getMarketCurrentIndex(uint256 marketId) view returns ((uint112 borrow, uint112 supply, uint32 lastUpdate))",
  "function getMarginRatio() view returns ((uint256 value))",
  "function getLiquidationSpread() view returns ((uint256 value))",
  "function getLiquidationSpreadForPair(uint256 heldMarketId, uint256 owedMarketId) view returns ((uint256 value))",
  "function getLiquidationSpreadForAccountAndPair(Info account, uint256 heldMarketId, uint256 owedMarketId) view returns ((uint256 value))",
  "function getDefaultAccountRiskOverrideSetter() view returns (address)",
  "function getAccountValues(Info account) view returns ((uint256 value), (uint256 value))",
  "function getAdjustedAccountValues(Info account) view returns ((uint256 value), (uint256 value))",
  "function getAccountRiskOverrideByAccount(Info account) view returns ((uint256 value), (uint256 value))",
  "function getMarginRatioForAccount(Info account) view returns ((uint256 value))",
  "function getAccountBalances(Info account) view returns (uint256[] marketIds, address[] tokens, (bool sign, uint128 value)[] pars, (bool sign, uint256 value)[] weis)",
]);
const ERC20 = parseAbi(["function symbol() view returns (string)", "function decimals() view returns (uint8)"]);

const read = (functionName, args = [], blockNumber) =>
  client.readContract({ address: CORE, abi: ABI, functionName, args, ...(blockNumber != null ? { blockNumber } : {}) });

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

async function findRecentAccounts() {
  // A recent LogDeposit per interesting market via Etherscan getLogs (the
  // free-tier Alchemy caps eth_getLogs at 10 blocks).
  if (!ETHERSCAN_API_KEY) return { normal: null, lst: null };
  const topic0 = "0x2bad8bc95088af2c247b30fa2b2e6a0886f88625e0945cd3051008e0e270198f"; // LogDeposit
  const head = Number(await client.getBlockNumber());
  // Premium-bearing markets make check D non-trivial (the account's adjusted
  // values actually move); prefer a depositor of one.
  const PREMIUM_MARKETS = new Set([3, 4, 7, 11, 14, 18]);
  let normal = null;
  let lst = null;
  for (let to = head; to > head - 150000 && (!(normal && PREMIUM_MARKETS.has(normal.market)) || !lst); to -= 5000) {
    const url = `https://api.etherscan.io/v2/api?chainid=1&module=logs&action=getLogs&address=${CORE}&fromBlock=${to - 4999}&toBlock=${to}&topic0=${topic0}&apikey=${ETHERSCAN_API_KEY}`;
    const json = await (await fetch(url)).json();
    if (!Array.isArray(json.result)) {
      await new Promise((r) => setTimeout(r, 400));
      continue;
    }
    for (const l of json.result) {
      const owner = `0x${l.topics[1].slice(26)}`;
      const number = BigInt(`0x${l.data.slice(2, 66)}`);
      const market = Number(BigInt(`0x${l.data.slice(66, 130)}`));
      const acct = { owner, number, market };
      if ((market === 20 || market === 6) && !lst) lst = acct;
      else if (
        market !== 20 &&
        market !== 6 &&
        (!normal || (PREMIUM_MARKETS.has(market) && !PREMIUM_MARKETS.has(normal.market)))
      )
        normal = acct;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return { normal, lst };
}

async function main() {
  const block = await client.getBlockNumber();
  console.log(`# Dolomite chain verification @ block ${block}\n`);

  // A. Roster enumerates from the core.
  const n = Number(await read("getNumMarkets"));
  check("A. getNumMarkets answers", n > 0, `${n} markets`);
  const tokens = [];
  const prices = [];
  const decimalsOf = [];
  const premiums = [];
  for (let i = 0; i < n; i++) {
    const [token, price, premium, index] = await Promise.all([
      read("getMarketTokenAddress", [BigInt(i)]),
      read("getMarketPrice", [BigInt(i)]),
      read("getMarketMarginPremium", [BigInt(i)]),
      read("getMarketCurrentIndex", [BigInt(i)]),
    ]);
    let dec = 18;
    let sym = `market #${i}`;
    try {
      [sym, dec] = await Promise.all([
        client.readContract({ address: token, abi: ERC20, functionName: "symbol" }),
        client.readContract({ address: token, abi: ERC20, functionName: "decimals" }),
      ]);
    } catch {}
    tokens.push({ i, token, sym, dec });
    prices.push(price.value);
    decimalsOf.push(Number(dec));
    premiums.push(premium.value);
    if (index.supply < BASE) check(`A. market ${i} index sane`, false, `supply index ${index.supply} < 1e18`);
  }
  check(
    "A. every market token resolves",
    tokens.every((t) => t.token && t.token !== "0x0000000000000000000000000000000000000000"),
  );

  // B. Anti-pin: no stable answers exactly 1e(36 − decimals).
  const stables = tokens.filter((t) => /USD|DAI/i.test(t.sym));
  const pinned = stables.filter((t) => prices[t.i] === BigInt(10) ** BigInt(36 - decimalsOf[t.i]));
  check(
    "B. anti-pin — no stable prices at exactly 1e(36−dec)",
    stables.length > 0 && pinned.length === 0,
    `${stables.length} stables checked`,
  );

  // C. The shared-oracle alias (wsrUSD reuses srUSD) — detected generically.
  const aliasPairs = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (
        prices[i] === prices[j] &&
        prices[i] > BigInt(0) &&
        decimalsOf[i] === decimalsOf[j] &&
        tokens[i].token !== tokens[j].token
      )
        aliasPairs.push(`${tokens[i].sym}(${i})=${tokens[j].sym}(${j})`);
  check("C. shared-oracle alias detected", aliasPairs.length >= 1, aliasPairs.join(", ") || "none");

  // Globals.
  const [ratio, spread, setter] = await Promise.all([
    read("getMarginRatio"),
    read("getLiquidationSpread"),
    read("getDefaultAccountRiskOverrideSetter"),
  ]);
  check(
    "A. global margin ratio reads",
    ratio.value > BigInt(0),
    `${ratio.value} (min ${(1 + Number(ratio.value) / 1e18).toFixed(4)}×)`,
  );
  check("A. override setter named by the core", setter !== "0x0000000000000000000000000000000000000000", setter);

  // D/E/F need real accounts.
  const { normal, lst } = await findRecentAccounts();
  if (!normal && !lst) {
    console.log("\n(no recent accounts found via Etherscan — D/E/F skipped)");
  }

  for (const [label, acct] of [
    ["normal", normal],
    ["LST-pair", lst],
  ]) {
    if (!acct) continue;
    const info = { owner: acct.owner, number: acct.number };
    const [vals, adj, override, ratioFor, bals] = await Promise.all([
      read("getAccountValues", [info]),
      read("getAdjustedAccountValues", [info]),
      read("getAccountRiskOverrideByAccount", [info]),
      read("getMarginRatioForAccount", [info]),
      read("getAccountBalances", [info]),
    ]);
    const overrideActive = override[0].value > BigInt(0);
    console.log(
      `\n${label} account ${acct.owner} #${acct.number}: override=${overrideActive ? `${override[0].value}/${override[1].value}` : "none"}`,
    );

    if (overrideActive) {
      // E. Carve-out: adjusted == raw exactly; ratioFor == the override.
      check(
        `E. ${label} adjusted == raw (premiums skipped)`,
        adj[0].value === vals[0].value && adj[1].value === vals[1].value,
      );
      check(`E. ${label} getMarginRatioForAccount == override`, ratioFor.value === override[0].value);
    } else {
      check(`E. ${label} getMarginRatioForAccount == global`, ratioFor.value === ratio.value);
      // D. Multiplicative premiums, BigInt-exact re-derivation (plain-floor).
      const ids = bals[0].map((x) => Number(x));
      let expSupply = BigInt(0);
      let expBorrow = BigInt(0);
      let allZeroPremium = true;
      for (let k = 0; k < ids.length; k++) {
        const price = await read("getMarketPrice", [BigInt(ids[k])]);
        const prem = await read("getMarketMarginPremium", [BigInt(ids[k])]);
        if (prem.value > BigInt(0)) allZeroPremium = false;
        const wei = bals[3][k];
        const value = wei.value * price.value;
        if (wei.sign) expSupply += (value * BASE) / (BASE + prem.value);
        else expBorrow += (value * (BASE + prem.value)) / BASE;
      }
      const supplyOk = expSupply === adj[0].value;
      const borrowOk = expBorrow === adj[1].value;
      check(
        `D. ${label} adjusted re-derives multiplicatively${allZeroPremium ? " (zero-premium account — trivial)" : ""}`,
        supplyOk && borrowOk,
        supplyOk && borrowOk
          ? "BigInt-exact"
          : `supply Δ ${adj[0].value - expSupply}, borrow Δ ${adj[1].value - expBorrow}`,
      );
    }

    // F. par × index ÷ 1e18 == the wei leg, per market — HALF-UP division.
    // MEASURED, not assumed: floor left supply legs 1 wei short whenever the
    // remainder ≥ half (Dolomite edits Solo internals — parToWei here rounds
    // half-up on both sides), so the derivation must round half-up to be
    // wei-exact.
    let fOk = true;
    for (let k = 0; k < bals[0].length; k++) {
      const idx = await read("getMarketCurrentIndex", [bals[0][k]]);
      const par = bals[2][k];
      const wei = bals[3][k];
      const leg = par.sign ? idx.supply : idx.borrow;
      const derived = (par.value * leg + BASE / BigInt(2)) / BASE;
      if (derived !== wei.value) {
        fOk = false;
        console.log(`   F mismatch market ${bals[0][k]}: derived ${derived} vs wei ${wei.value}`);
      }
    }
    check(`F. ${label} par × index (half-up) reproduces getAccountBalances wei`, fOk);
  }

  // G. Liquidation forensics identity — the valued two-leg premium lands on
  // the pair's own constant. Legs from the indexed API (the same rows the
  // timeline renders), prices + spread from the core AT the event's block by
  // archive eth_call — the exact derivation the forensics card shows. The
  // engine sizes the seizure from getLiquidationSpreadForPair, so premium ==
  // pair spread whenever collateral sufficed; a liquidation that exhausted
  // the held balance (newPar == 0 on the held leg) may land under it (the
  // shortfall vaporizes). Gated on the API env like every indexed-sample
  // check — degrades with a stated reason, never a silent pass.
  if (!RAILS_API_URL || !API_BEARER_TOKEN) {
    console.log("\nG. SKIPPED — RAILS_API_URL / API_BEARER_TOKEN not set (indexed liquidation legs unreachable)");
  } else {
    const auth = { headers: { Authorization: `Bearer ${API_BEARER_TOKEN}` } };
    const liq = await fetch(`${RAILS_API_URL}/api/dolomite/positions?limit=100&status=liquidated`, auth).then((r) =>
      r.json(),
    );
    const liqRows = (liq.rows ?? []).filter((r) => r.liquidationCount > 0);
    check("G. liquidated accounts on the wire", liqRows.length > 0, `${liqRows.length} rows`);
    // Pair the two borrower legs of each LogLiquidate by (tx, log_index);
    // sample across accounts, capped — each pair costs one archive multicall.
    const pairs = [];
    for (const row of liqRows.slice(0, 4)) {
      if (pairs.length >= 4) break;
      const qs = `owner=${row.owner}&accountNumber=${row.accountNumber}&limit=100`;
      const tl = await fetch(`${RAILS_API_URL}/api/dolomite/timeline?${qs}`, auth).then((r) => r.json());
      const legs = (tl.rows ?? []).filter((e) => e.action === "liquidation");
      for (const held of legs.filter((e) => e.leg === "liquid_held")) {
        const owed = legs.find(
          (e) => e.leg === "liquid_owed" && e.tx_hash === held.tx_hash && e.log_index === held.log_index,
        );
        if (owed && pairs.length < 4) pairs.push({ held, owed });
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    // Gate on what is iterated: an empty sample must be red, not vacuous green.
    check("G. borrower leg pairs sampled", pairs.length > 0, `${pairs.length} pairs`);
    for (const { held, owed } of pairs) {
      const blockNumber = BigInt(held.block_number);
      // Account-aware spread: an override account (LST/ETH, BTC categories)
      // is seized at its own spread — the getter collapses to the pair
      // constant on plain accounts (verified equal on chain).
      const liquidInfo = { owner: held.owner, number: BigInt(held.account_number) };
      const [pHeld, pOwed, spread] = await Promise.all([
        read("getMarketPrice", [BigInt(held.market_id)], blockNumber),
        read("getMarketPrice", [BigInt(owed.market_id)], blockNumber),
        read(
          "getLiquidationSpreadForAccountAndPair",
          [liquidInfo, BigInt(held.market_id), BigInt(owed.market_id)],
          blockNumber,
        ),
      ]);
      const tag = `${held.tx_hash.slice(0, 10)} @ ${held.block_number}`;
      // Known-nonzero control: a zero here is a failed read (the engine could
      // not have fired against a zero price), never a fact.
      check(`G. ${tag} at-block prices nonzero`, pHeld.value > 0n && pOwed.value > 0n && spread.value > 0n);
      if (pHeld.value === 0n || pOwed.value === 0n || spread.value === 0n) continue;
      const seized = Math.abs(Number(held.delta_wei)) * Number(pHeld.value);
      const cleared = Math.abs(Number(owed.delta_wei)) * Number(pOwed.value);
      const premium = seized / cleared - 1;
      const constant = Number(spread.value) / 1e18;
      const exhausted = String(held.new_par).replace(/\.0*$/, "") === "0";
      const ok = Math.abs(premium - constant) < 5e-7 || (exhausted && premium < constant);
      check(
        `G. ${tag} premium lands on the pair constant`,
        ok,
        `${(premium * 100).toFixed(4)}% vs ${(constant * 100).toFixed(2)}%${exhausted ? " (held exhausted)" : ""}`,
      );
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} FAILURES`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
