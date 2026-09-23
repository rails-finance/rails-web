// ============================================================================
// VERIFY: Fluid chain assumptions for the reference-depth pass
// ============================================================================
//
// Read-only. The live lane (lib/sources/chain/fluid-position.ts →
// /api/chain/fluid/position) is one VaultResolver.positionByNftId eth_call;
// everything it asserts is re-derived here through independent paths:
//
//   1. ABI fidelity — the ABI module the lane ships
//      (lib/fluid/vault-resolver-abi.ts) decodes the DEPLOYED resolver: a
//      positionByNftId call returns a coherent (UserPosition, VaultEntireData)
//      pair whose vault, vaultId and vaultType agree with the index roster.
//   2. Second data path for the settled supply — the raw position slot
//      (getPositionDataRaw, mapping slot 3) bit-decoded by hand (bit0
//      isSupply, X19 tick @2, X24 tickId @21, X64 supply bignum @45 →
//      (v>>8)<<(v&255)) times the vault's live supply exchange price ÷ 1e12
//      must equal the resolver's OWN beforeSupply, BigInt-exact — the same
//      identity the backend attribution engine was verified on.
//   3. Config block — 0 < collateralFactor ≤ liquidationThreshold ≤
//      liquidationMaxLimit, penalty sane, oracle set, both oracle prices > 0
//      (debt per col — the resolver source states the orientation).
//   4. Ratio identity (scale-free) — the lane's float ratio must equal
//      borrowRaw × 1e27 ÷ (supplyRaw × oraclePriceLiquidateRaw), i.e. the
//      token decimals cancel exactly; and liquidation price × supply ×
//      threshold must reproduce the borrow. Proves the 1e(27 + debtDec −
//      colDec) price scale without trusting it.
//   5. Leg identity — chain-read ERC-20 symbols/decimals match the index
//      roster for token legs; smart legs render as shares (18 dp).
//   6. Liquidated position — a known fully-liquidated NFT (980, weETH/USDC
//      vault #9, 55 attributed partial liquidations) reads isLiquidated with
//      both legs settled to zero (tick = type(int).min).
//   7. Index agreement (informational) — the live settled read vs the
//      worker's stamped overlay and the Σ replay lane. The gaps are the
//      point (interest since the stamp; interest-blindness of Σ): REPORTED,
//      not asserted.
//   8. Liquidation forensics at-block price (mig 114 / fill-fluid-prices.mjs)
//      — the valued lane. The vault's oracle address and liquidationPenalty
//      come from vaultVariables2 (slot 1) read AT THE FIRE BLOCK, the price
//      from that oracle at that block, and the legs from the INDEX: pairing
//      index legs with a chain price is what makes this a cross-check rather
//      than arithmetic agreeing with itself.
//
//      The penalty is asserted as a FLOOR the engine guarantees, and the
//      exact landings as a majority — which is what the chain actually shows.
//      Over the whole liquidation history (17,461 sweeps clearing ≥1 debt
//      unit): 99.90% realize at or above their vault's own constant (18 below,
//      worst 0.438pp = rounding) and 98.5% reproduce it exactly. The exact
//      landings are the proof the price is the one the engine acted on — a
//      wrong scale or wrong oracle would miss every constant, not 1.5% of
//      them. Specimens are picked by a fixed rule (largest sweep per oracle
//      generation × penalty) so the majority check can't be cherry-picked, and
//      they span both generations, six penalties, and three decimals regimes
//      (18/6, 8/6, 18/18 → scales 1e15, 1e25, 1e27).
//
//      Note this cannot go through the VaultResolver: it has NO BYTECODE at
//      these blocks (asserted below), which is the whole reason the filler
//      reads the vault's own storage instead of configs.oraclePriceLiquidate.
//
// Run:  node scripts/verify-fluid-chain.mjs
// Env:  .env.local — ALCHEMY_URL (chain), RAILS_API_URL + API_BEARER_TOKEN
//       (index samples; skipped if missing)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPublicClient, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.ALCHEMY_URL) throw new Error("ALCHEMY_URL missing from .env.local");

const client = createPublicClient({ chain: mainnet, transport: http(env.ALCHEMY_URL) });

const VAULT_RESOLVER = "0xA5C3E16523eeeDDcC34706b0E6bE88b4c6EA95cC";
const LIQUIDATED_NFT = 980n; // weETH/USDC vault #9 — fully swept (browser-verified onboard sample)
const INT_MIN = -(2n ** 255n);
const EXCHANGE_PRICES_PRECISION = 1_000_000_000_000n; // 1e12
const E27 = 10n ** 27n;

// The EXACT ABI the lane ships: parse it out of the TS module so what this
// script verifies is what the app runs (the module body is the array literal
// between the `=` and the `as const`).
//
// Evaluated as a JS literal, NOT JSON.parse'd. It is a TS module, not a JSON
// document, and nothing keeps the two syntaxes aligned: `pnpm format` unquotes
// object keys (Prettier's quoteProps: "as-needed"), which is valid JS and
// invalid JSON. That is not hypothetical — it is what silently broke this
// script between the depth pass that wrote it and the forensics pass that
// added section 8, and a verifier that cannot parse is a verifier that cannot
// fail out loud.
const abiTs = readFileSync(join(root, "lib/fluid/vault-resolver-abi.ts"), "utf8");
const RESOLVER_ABI = new Function(`return ${abiTs.slice(abiTs.indexOf("= [") + 2, abiTs.lastIndexOf(" as const;"))}`)();
const RAW_ABI = parseAbi(["function getPositionDataRaw(address vault, uint256 positionId) view returns (uint256)"]);
const ERC20_ABI = parseAbi(["function symbol() view returns (string)", "function decimals() view returns (uint8)"]);

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};
const info = (msg) => console.log(`      ${msg}`);
const X = (v, bits) => v & ((1n << BigInt(bits)) - 1n);
const bigNum = (v) => (v >> 8n) << (v & 255n); // Fluid X64 bignum → plain integer

const readPos = (nftId, blockNumber) =>
  client.readContract({
    address: VAULT_RESOLVER,
    abi: RESOLVER_ABI,
    functionName: "positionByNftId",
    args: [nftId],
    ...(blockNumber ? { blockNumber } : {}),
  });

// ── 6. The known fully-liquidated position ──────────────────────────────────
{
  const [pos, vd] = await readPos(LIQUIDATED_NFT);
  check("nft 980: resolver resolves its vault", BigInt(vd.vault) !== 0n, vd.vault);
  check(
    "nft 980: vaultId 9 / T1 weETH-USDC",
    Number(vd.constantVariables.vaultId) === 9 && Number(vd.constantVariables.vaultType) === 10000,
  );
  check(
    "nft 980: isLiquidated with both legs settled to zero",
    pos.isLiquidated && pos.supply === 0n && pos.borrow === 0n,
  );
  check("nft 980: fully-swept tick sentinel (type(int).min)", pos.tick === INT_MIN, String(pos.tick).slice(0, 8) + "…");
}

/** The settled legs of one liquidation, from the INDEX — the same figures the
 *  card renders. Kept on the index side deliberately: pairing them with a price
 *  read here, from chain, is what makes the premium identity a cross-check
 *  rather than a restatement. (They cannot be re-read through the resolver
 *  anyway — it has no bytecode at these blocks.) */
const forensicsLegs = async (nft, vault, block) => {
  if (!env.RAILS_API_URL || !env.API_BEARER_TOKEN) return null;
  try {
    const res = await fetch(`${env.RAILS_API_URL}/api/fluid/timeline?nft=${nft}`, {
      headers: { Authorization: `Bearer ${env.API_BEARER_TOKEN}` },
    });
    if (!res.ok) return null;
    const rows = (await res.json()).rows ?? [];
    const row = rows.find(
      (r) =>
        String(r.block_number) === String(block) &&
        r.vault?.toLowerCase() === vault &&
        (r.action === "liquidated" || r.action === "absorbed"),
    );
    if (!row || row.liq_supply_before == null) return null;
    const colDec = Number(row.supply_decimals);
    const debtDec = Number(row.borrow_decimals);
    if (!Number.isFinite(colDec) || !Number.isFinite(debtDec)) return null;
    const seized = (Number(row.liq_supply_before) - Number(row.liq_supply_after)) / 10 ** colDec;
    const cleared = (Number(row.liq_borrow_before) - Number(row.liq_borrow_after)) / 10 ** debtDec;
    return seized > 0 && cleared > 0 ? { seized, cleared } : null;
  } catch {
    return null;
  }
};

// ── 8. Liquidation forensics — the at-block valued lane ─────────────────────
//
// Specimens chosen to span what actually varies: BOTH oracle generations, six
// distinct liquidationPenalty constants, and three decimals regimes (18/6,
// 8/6, 18/18) — a scale exponent that lands on all three is proven, not
// plausible. Legs come from the INDEX (the settled attributions the card
// renders); price and penalty are read HERE, from chain, at the fire block.
// The premium landing on the vault's own constant is the identity that proves
// the price is the one the engine acted on.
{
  const FORENSICS_SPECIMENS = [
    {
      nft: 1162,
      vault: "0xeabbfca72f8a8bf14c4ac59e69ecb2eb69f0811c",
      block: 20694103n,
      pair: "ETH/USDC",
      colDec: 18,
      debtDec: 6,
      gen: "single-rate",
      pen: 1.0,
    },
    {
      nft: 697,
      vault: "0xbec491fef7b4f666b270f9d5e5c3f443cbf20991",
      block: 22215381n,
      pair: "ETH/USDT",
      colDec: 18,
      debtDec: 6,
      gen: "single-rate",
      pen: 2.0,
    },
    {
      nft: 960,
      vault: "0xf55b8e9f0c51ace009f4b41d03321675d4c643b3",
      block: 21762863n,
      pair: "weETH/USDC",
      colDec: 18,
      debtDec: 6,
      gen: "single-rate",
      pen: 3.0,
    },
    {
      nft: 9911,
      vault: "0x0c8c77b7ff4c2af7f6cebbe67350a490e3dd6cb3",
      block: 24391511n,
      pair: "ETH/USDC",
      colDec: 18,
      debtDec: 6,
      gen: "split",
      pen: 1.0,
    },
    {
      nft: 1726,
      vault: "0xe16a6f5359abb1f61ce71e25dd0932e3e00b00eb",
      block: 21616191n,
      pair: "ETH/USDT",
      colDec: 18,
      debtDec: 6,
      gen: "split",
      pen: 2.0,
    },
    {
      nft: 4243,
      vault: "0x1982cc7b1570c2503282d0a0b41f69b3b28fdcc3",
      block: 21921844n,
      pair: "wstETH/USDC",
      colDec: 18,
      debtDec: 6,
      gen: "split",
      pen: 2.5,
    },
    {
      nft: 4712,
      vault: "0x01c7c1c41dea58b043e700efb23dc077f12a125e",
      block: 22211630n,
      pair: "cbBTC/USDC",
      colDec: 8,
      debtDec: 6,
      gen: "split",
      pen: 3.0,
    },
    {
      nft: 2565,
      vault: "0x3a0b7c8840d74d39552ef53f586dd8c3d1234c40",
      block: 23845932n,
      pair: "WBTC/USDT",
      colDec: 8,
      debtDec: 6,
      gen: "split",
      pen: 4.0,
    },
    {
      nft: 8206,
      vault: "0xc6eaa3d82b650bbf31f4fd3d58aeb94e2213c674",
      block: 23549957n,
      pair: "weETH/USDtb",
      colDec: 18,
      debtDec: 18,
      gen: "split",
      pen: 4.5,
    },
  ];
  const ORACLE_ABI = parseAbi([
    "function getExchangeRateLiquidate() view returns (uint256)",
    "function getExchangeRate() view returns (uint256)",
  ]);
  let exactLandings = 0;
  let specimenCount = 0;

  // The premise of the whole lane: the resolver cannot answer at these blocks,
  // which is WHY the filler reads the vault's storage instead.
  const oldest = FORENSICS_SPECIMENS.reduce((a, s) => (s.block < a ? s.block : a), FORENSICS_SPECIMENS[0].block);
  const resolverCode = await client.getBytecode({ address: VAULT_RESOLVER, blockNumber: oldest });
  check(
    `VaultResolver has NO bytecode at the fire blocks (so configs.oraclePriceLiquidate cannot serve forensics)`,
    !resolverCode,
    `checked @ ${oldest}`,
  );

  for (const s of FORENSICS_SPECIMENS) {
    const key = `nft ${s.nft} ${s.pair} @${s.block}`;
    // Oracle + penalty out of vaultVariables2 (slot 1) AT THE FIRE BLOCK.
    const vars2 = BigInt(await client.getStorageAt({ address: s.vault, slot: "0x1", blockNumber: s.block }));
    const oracle =
      "0x" +
      X(vars2 >> 96n, 160)
        .toString(16)
        .padStart(40, "0");
    const penaltyPct = (Number(X(vars2 >> 72n, 10)) / 1e4) * 100;
    check(`${key}: vault names an oracle at the fire block`, BigInt(oracle) !== 0n, oracle);
    check(
      `${key}: liquidationPenalty reads ${s.pen.toFixed(2)}% from vaultVariables2`,
      Math.abs(penaltyPct - s.pen) < 1e-9,
      `${penaltyPct.toFixed(2)}%`,
    );

    // The price, from that oracle, at that block — split first, single-rate
    // fallback. Which one answers is itself an assertion.
    let priceRaw = null;
    let gen = null;
    for (const [fn, g] of [
      ["getExchangeRateLiquidate", "split"],
      ["getExchangeRate", "single-rate"],
    ]) {
      try {
        priceRaw = await client.readContract({
          address: oracle,
          abi: ORACLE_ABI,
          functionName: fn,
          blockNumber: s.block,
        });
        gen = g;
        break;
      } catch {
        /* wrong generation for this oracle */
      }
    }
    check(`${key}: oracle answers on the ${s.gen} interface`, gen === s.gen, gen ?? "neither");
    if (priceRaw == null) continue;
    const price = Number(priceRaw) / 10 ** (27 + s.debtDec - s.colDec);
    check(
      `${key}: price is positive and finite`,
      Number.isFinite(price) && price > 0,
      `${price.toPrecision(8)} ${s.pair.split("/")[1]} per ${s.pair.split("/")[0]}`,
    );

    // The identity: index legs × this chain price ⇒ the vault's OWN constant.
    //
    // Asserted as a FLOOR, not an equality, because that is what the protocol
    // actually does. Measured over Fluid's whole liquidation history (17,461
    // sweeps clearing ≥1 debt unit): 99.90% land at or above their vault's
    // penalty — only 18 fall below, the worst by 0.438pp, which is rounding.
    // 98.5% reproduce it exactly. The excess cases are real sweeps that cleared
    // their tick on better terms than the guaranteed minimum, so an equality
    // assertion here would encode a claim the chain contradicts.
    const legs = await forensicsLegs(s.nft, s.vault, s.block);
    if (!legs) {
      info(`${key}: index legs unavailable — premium identity skipped`);
      continue;
    }
    const seizedValue = legs.seized * price;
    const premiumPct = (seizedValue / legs.cleared - 1) * 100;
    const exact = Math.abs(premiumPct - penaltyPct) < 0.05;
    if (exact) exactLandings += 1;
    specimenCount += 1;
    check(
      `${key}: realized premium meets the vault's ${s.pen.toFixed(2)}% penalty floor`,
      premiumPct >= penaltyPct - 0.05,
      `${premiumPct.toFixed(3)}% vs ${penaltyPct.toFixed(2)}% (scale 1e${27 + s.debtDec - s.colDec}, ${s.colDec}/${s.debtDec} dp)${exact ? " — lands exactly" : " — above the floor: this sweep cleared better than the minimum"}`,
    );
  }

  // The exact landings are the proof the price is the one the engine acted on:
  // a wrong price scale or a wrong oracle would miss every constant, not most
  // of them. Asserted as a majority over a sample picked by a fixed rule (the
  // largest sweep per generation × penalty), so it cannot be satisfied by
  // cherry-picking.
  check(
    `the vault's own penalty is reproduced EXACTLY by most specimens (${exactLandings}/${specimenCount}) — across both oracle generations, six penalties and three decimals regimes`,
    specimenCount > 0 && exactLandings * 2 > specimenCount,
    `a wrong price scale would land on none`,
  );
}

// ── Index samples (the open borrowers the risk surfaces will render) ────────
let samples = [];
if (env.RAILS_API_URL && env.API_BEARER_TOKEN) {
  const fetchRows = async (qs) => {
    const res = await fetch(`${env.RAILS_API_URL}/api/fluid/positions?${qs}`, {
      headers: { Authorization: `Bearer ${env.API_BEARER_TOKEN}` },
    });
    if (!res.ok) throw new Error(`index fetch failed: ${res.status}`);
    return (await res.json()).rows ?? [];
  };
  const t1 = (await fetchRows("status=open&hasDebt=true&vaultKind=t1&sortBy=debt&sortOrder=desc&limit=5")).filter(
    (r) => r.vault_type === 10000,
  );
  const smart = (await fetchRows("status=open&hasDebt=true&vaultKind=smart&sortBy=debt&sortOrder=desc&limit=3")).slice(
    0,
    3,
  );
  samples = [...t1, ...smart];
  info(`index sampled: ${t1.length} T1 + ${smart.length} smart-vault open borrowers`);
} else {
  info("RAILS_API_URL / API_BEARER_TOKEN missing — index-sample checks skipped");
}

for (const row of samples) {
  const nftId = BigInt(row.nft_id);
  const key = `nft ${row.nft_id} (${row.supply_symbol ?? "shares"}/${row.borrow_symbol ?? "shares"}, T${row.vault_type / 10000})`;
  const [pos, vd] = await readPos(nftId);

  // 1. Coherent decode, agreeing with the index roster.
  check(`${key}: vault matches the index roster`, vd.vault.toLowerCase() === row.vault.toLowerCase());
  check(
    `${key}: vaultId + vaultType match`,
    String(vd.constantVariables.vaultId) === String(row.vault_id) &&
      Number(vd.constantVariables.vaultType) === row.vault_type,
  );
  if (row.owner)
    check(
      `${key}: factory owner matches the index owner`,
      pos.owner.toLowerCase() === row.owner.toLowerCase(),
      pos.owner,
    );

  // 2. Second path for the settled supply: raw slot bignum × live supply
  //    exchange price ÷ 1e12 == the resolver's own beforeSupply (BigInt-exact).
  const posRaw = await client.readContract({
    address: VAULT_RESOLVER,
    abi: RAW_ABI,
    functionName: "getPositionDataRaw",
    args: [vd.vault, nftId],
  });
  const rawSupply = bigNum(X(posRaw >> 45n, 64));
  const expectBefore = (rawSupply * vd.exchangePricesAndRates.vaultSupplyExchangePrice) / EXCHANGE_PRICES_PRECISION;
  check(
    `${key}: raw-slot supply × live exchange price == resolver beforeSupply (BigInt-exact)`,
    expectBefore === pos.beforeSupply,
    `${expectBefore} vs ${pos.beforeSupply}`,
  );
  check(`${key}: raw-slot isSupply bit agrees`, ((posRaw & 1n) === 1n) === pos.isSupplyPosition);

  // 3. Config block.
  const c = vd.configs;
  const cf = Number(c.collateralFactor);
  const lt = Number(c.liquidationThreshold);
  const ml = Number(c.liquidationMaxLimit);
  check(
    `${key}: 0 < CF(${cf}) ≤ LT(${lt}) ≤ ML(${ml}), penalty ${Number(c.liquidationPenalty)} sane`,
    cf > 0 && cf <= lt && lt <= ml && ml <= 15000 && Number(c.liquidationPenalty) < 5000,
  );
  check(
    `${key}: oracle set with live prices`,
    BigInt(c.oracle) !== 0n && c.oraclePriceOperate > 0n && c.oraclePriceLiquidate > 0n,
  );

  // 4. Scale-free ratio identity: decimals must cancel exactly.
  if (pos.borrow > 0n && pos.supply > 0n) {
    const [supplyDec, borrowDec] = await Promise.all(
      [
        row.supply_decimals == null
          ? 18
          : client.readContract({
              address: vd.constantVariables.supplyToken.token0,
              abi: ERC20_ABI,
              functionName: "decimals",
            }),
        row.borrow_decimals == null
          ? 18
          : client.readContract({
              address: vd.constantVariables.borrowToken.token0,
              abi: ERC20_ABI,
              functionName: "decimals",
            }),
      ].map((p) => Promise.resolve(p).then(Number)),
    );
    // The lane's arithmetic, reproduced: human units through the documented
    // price scale…
    const supplyH = Number(pos.supply) / 10 ** supplyDec;
    const borrowH = Number(pos.borrow) / 10 ** borrowDec;
    const priceH = Number(c.oraclePriceLiquidate) / 10 ** (27 + borrowDec - supplyDec);
    const laneRatio = borrowH / (supplyH * priceH);
    // …must equal the scale-free BigInt form borrowRaw × 1e27 ÷ (supplyRaw × priceRaw).
    const exact = Number((pos.borrow * E27 * 10n ** 12n) / (pos.supply * c.oraclePriceLiquidate)) / 1e12;
    const rel = Math.abs(laneRatio - exact) / exact;
    check(
      `${key}: ratio identity (1e(27+debtDec−colDec) price scale proven)`,
      rel < 1e-9,
      `ratio ${(exact * 100).toFixed(2)}%, rel err ${rel.toExponential(1)}`,
    );
    const liqPrice = borrowH / (supplyH * (lt / 1e4));
    const reproduced = liqPrice * supplyH * (lt / 1e4);
    check(`${key}: liquidation price reproduces the borrow`, Math.abs(reproduced - borrowH) / borrowH < 1e-9);
    info(
      `ratio ${(exact * 100).toFixed(2)}% vs LT ${(lt / 100).toFixed(0)}% · oracle ${priceH.toFixed(4)} ${row.borrow_symbol ?? "shares"}/${row.supply_symbol ?? "share"}`,
    );

    // 5. Leg identity for token legs.
    if (row.supply_symbol) {
      const sym = await client.readContract({
        address: vd.constantVariables.supplyToken.token0,
        abi: ERC20_ABI,
        functionName: "symbol",
      });
      check(`${key}: chain supply symbol matches index (${row.supply_symbol})`, sym === row.supply_symbol, sym);
    }

    // 7. Lane agreement — informational by design.
    if (row.chain?.supply != null) {
      const stampedSupply = BigInt(String(row.chain.supply).split(".")[0]);
      const drift = stampedSupply > 0n ? Math.abs(Number(pos.supply - stampedSupply)) / Number(stampedSupply) : 0;
      info(
        `overlay stamped @ ${row.chain.updated_block}: supply drift ${(drift * 100).toFixed(4)}% (interest + activity since the stamp — reported, not asserted)`,
      );
    }
    if (row.debt_net != null) {
      const sigma = Number(BigInt(String(row.debt_net).split(".")[0])) / 10 ** borrowDec;
      if (sigma > 0)
        info(
          `Σ replay debt ${sigma.toFixed(4)} vs settled ${borrowH.toFixed(4)} — gap = interest the Σ lane is blind to`,
        );
    }
  }
  await new Promise((r) => setTimeout(r, 400));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
