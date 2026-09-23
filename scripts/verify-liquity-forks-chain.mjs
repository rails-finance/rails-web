// ============================================================================
// VERIFY: Ebisu + Asymmetry + Basedollar (Liquity V2 forks) chain assumptions
// for the reference-depth pass
// ============================================================================
//
// Read-only. THE CHAIN IS PER FORK. Each entry in FORKS names its own viem
// chain and the .env.local key its RPC URL lives under, and the client is built
// from those — Ebisu and Asymmetry on Ethereum through ALCHEMY_URL, Basedollar
// on Base (8453) through BASE_RPC_URL. Nothing here assumes a chain.
//
// All three forks run the V2 architecture — per-branch TroveManager /
// BorrowerOperations / SortedTroves / PriceFeed — but on DIFFERENT revisions,
// and none publishes its constants the same way, so every address here is
// re-derived from the TroveManagers themselves and checked against the
// catalog (lib/{ebisu,asymmetry,basedollar}/asset-catalog.ts):
//
//   1. Contract graph — BO from TroveManager.borrowerOperations(); the
//      PriceFeed from BO STORAGE SLOT 2 (all three forks keep it there —
//      Ebisu's contracts are clones, so config lives in storage, not
//      immutables); Ebisu's per-branch constants from the AddressesRegistry at
//      TM storage slot 15 (registry cross-checked: its troveManager()/
//      collToken()/boldToken() must point back); Asymmetry's and Basedollar's
//      constants from BO getters (Basedollar's addressesRegistry() reverts).
//   1b. Collateral token — BO.activePool().collToken(), read against the
//      catalog SOURCE rather than the mirror below, since collateralAddr is
//      the only catalog field the app publishes as a token identity (every
//      event flow's `token`). It went unchecked until 2026-09-06 and five of
//      Asymmetry's seven branches had drifted: ysyBOLD named its Pendle SY
//      wrapper, scrvUSD named USDaf, sfrxUSD named an address that is not a
//      contract, and the two BTC branches named the 8-decimal asset instead of
//      the 18-decimal wrapper they actually take — which is why the decimals
//      are asserted against the same token in the same breath.
//   1c. TroveNFT — TroveManager.troveNFT() against the catalog SOURCE's
//      `troveNft`, with the NFT's own troveManager() backpointer closing the
//      loop. The card's OpenSea link is built from it, and a wrong address
//      lands on another collection's token of the same id rather than failing.
//   2. Constants — per-branch MCR/CCR/SCR match the catalog, plus BCR on the
//      forks whose contracts carry one (Basedollar; Ebisu's revision predates
//      it and Asymmetry's does not expose it).
//   3. Price — lastGoodPrice() answers; fetchPrice() SIMULATED via eth_call
//      (state-mutating on-chain, read-only under eth_call — the Liquity V1
//      pattern) returns a LIVE price with the oracle-down flag false.
//      lastGoodPrice is measurably STALE on quiet branches (it only updates
//      on user ops), so the live lane must ship the simulated fetch. Every
//      read from here down is PINNED to one block per branch: two prices read
//      a block apart differ because the oracle moved, and that read as a
//      disagreement between the PriceFeed and the TroveManager (seen on
//      asymmetry/ysyBOLD, 2026-09-22).
//   4. Price scale — 1e(36 − collateral decimals), where the decimals are the
//      ones check 1b READ OFF THE TOKEN, never the ticker: the ICR identity
//      entireColl_raw × price_raw ÷ entireDebt_raw lands at 1e18 for 18-dec
//      AND 8-dec branches (Ebisu WBTC/LBTC), asserted BigInt-exact against
//      the contract's own getCurrentICR. This is what Basedollar's wcbBTC
//      needs: it reads like an 8-decimal BTC branch and is an 18-decimal
//      wrapper, so a scale taken from the ticker would be off by 10^10.
//   5. Trove data — getLatestTroveData is the canonical V2 struct on both
//      forks; getTroveStatus 4 (zombie) exists and zombies sit OUTSIDE the
//      sorted list.
//   6. Redemption order — SortedTroves walks head→tail in DESCENDING
//      annualInterestRate; debt-in-front for a trove = Σ entireDebt of troves
//      after it (lower rate) — the branch's own redemption queue.
//   7. Index agreement (informational) — live entireColl/entireDebt vs the
//      index's replayed figures. Redemptions repay debt WITHOUT the index
//      necessarily seeing an event it attributes (observed live: an Ebisu
//      weETH zombie shows 2,004 ebUSD indexed vs 176 on chain), so drift here
//      is reported, not asserted — it is exactly what the live lane exists to
//      surface.
//
// NOT CHECKED, on any fork: the debt token's own supply, the Stability Pool,
// interest-batch management, and liquidation forensics. Check 7 is reported
// rather than asserted, for the reason it states.
//
// Run:  node scripts/verify-liquity-forks-chain.mjs
//       FORK=basedollar node scripts/verify-liquity-forks-chain.mjs   (one fork)
// Env:  .env.local — ALCHEMY_URL (Ebisu, Asymmetry), BASE_RPC_URL (Basedollar),
//       RAILS_API_URL + API_BEARER_TOKEN (index samples; skipped if missing)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createPublicClient, http, parseAbi } from "viem";
import { base, mainnet } from "viem/chains";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

// One client per RPC key, built on first use — so a run filtered to one fork
// never needs the other chain's key present.
const clients = new Map();
function clientFor(fork) {
  if (!clients.has(fork.rpcKey)) {
    if (!env[fork.rpcKey]) throw new Error(`${fork.rpcKey} missing from .env.local`);
    clients.set(
      fork.rpcKey,
      createPublicClient({
        chain: fork.chain,
        batch: { multicall: { wait: 50 } },
        transport: http(env[fork.rpcKey], { retryCount: 8, retryDelay: 1_000 }),
      }),
    );
  }
  return clients.get(fork.rpcKey);
}
let client;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Must mirror lib/{ebisu,asymmetry,basedollar}/asset-catalog.ts (chain lane
// fields). `chain` + `rpcKey` say where each fork lives; nothing below them
// assumes Ethereum.
const FORKS = {
  ebisu: {
    api: "ebisu",
    chain: mainnet,
    rpcKey: "ALCHEMY_URL",
    constantsFrom: "registry", // AddressesRegistry @ TM storage slot 15
    branches: {
      weeth: {
        symbol: "weETH",
        dec: 18,
        tm: "0x0eabd8c3f7b4058093c1e9b147c93b4d9f6f54d4",
        bm: "0xc0b550a3c6b81521da89562dac10f331d7d3de40", // EbisuBranchManager — emits Redemption
        pf: "0x36fb029e6feec43d96be2f8ccc0e572d1663f5fc",
        mcr: 1.2,
        ccr: 1.5,
        scr: 1.2,
      },
      susde: {
        symbol: "sUSDe",
        dec: 18,
        tm: "0xcc522ac32fa51cb234da97c4b3a0bba9f1c578ae",
        bm: "0x6e2c51cf113f45235f6e2bc2d9f7db195d98e895", // EbisuBranchManager — emits Redemption
        pf: "0x3e58fb6ffd3a568487c72a170411ebf7be6a2062",
        mcr: 1.15,
        ccr: 1.2,
        scr: 1.1,
      },
      wbtc: {
        symbol: "WBTC",
        dec: 8,
        tm: "0xee49febd1b4469cbe0d5114a95d7cf831f3c7a48",
        bm: "0x26507af4c68ea91d31e76f5eaaafdac73f2f5cbd", // EbisuBranchManager — emits Redemption
        pf: "0x83387ff1234c2525ec0eb37dfe30d005356a222b",
        mcr: 1.2,
        ccr: 1.5,
        scr: 1.2,
      },
      lbtc: {
        symbol: "LBTC",
        dec: 8,
        tm: "0x088582f656eb5b148d575c054680255e8b11b3c7",
        bm: "0x84572792d91ba1ea1d67fe3476354de317af387e", // EbisuBranchManager — emits Redemption
        pf: "0x71aa4e0ae5435aa3d4724d14df91c5a26720cc4f",
        mcr: 1.35,
        ccr: 1.5,
        scr: 1.2,
      },
      stcusd: {
        symbol: "stcUSD",
        dec: 18,
        tm: "0xa0911635345ea7ee6c4a50f23e06f2fb1fcf5190",
        bm: "0x0c906ba27a9b747653ed16b82d77a7a8eefeb19c", // EbisuBranchManager — emits Redemption
        pf: "0xdb0cd67899e071a8798a58c9d2dd43795833c71d",
        mcr: 1.15,
        ccr: 1.3,
        scr: 1.1,
      },
    },
  },
  asymmetry: {
    api: "asymmetry",
    chain: mainnet,
    rpcKey: "ALCHEMY_URL",
    constantsFrom: "bo",
    // The TM's redemption view runs fetchPrice internally, so it must answer
    // the same live price the simulated fetch did.
    redemptionPriceView: true,
    branches: {
      ysybold: {
        symbol: "ysyBOLD",
        dec: 18,
        tm: "0xf8a25a2e4c863bb7cea7e4b4eeb3866bb7f11718",
        pf: "0x7f575323ddedfbad449fef5459fad031fe49520b",
        mcr: 1.1,
        ccr: 1.2,
        scr: 1.05,
      },
      scrvusd: {
        symbol: "scrvUSD",
        dec: 18,
        tm: "0x7aff0173e3d7c5416d8caa3433871ef07568220d",
        pf: "0xf125c72ae447efdf3fa3601eda9ac0ebec06cbb8",
        mcr: 1.1,
        ccr: 1.2,
        scr: 1.05,
      },
      susds: {
        symbol: "sUSDS",
        dec: 18,
        tm: "0x53ce82ac43660aab1f80fecd1d74afe7a033d505",
        pf: "0x2113468843cf2d0fd976690f4ec6e4213df46911",
        mcr: 1.1,
        ccr: 1.2,
        scr: 1.05,
      },
      sfrxusd: {
        symbol: "sfrxUSD",
        dec: 18,
        tm: "0x478e7c27193aca052964c3306d193446027630b0",
        pf: "0x653df748bf7a692555dcdbf4c504a8c84807f7c7",
        mcr: 1.1,
        ccr: 1.2,
        scr: 1.05,
      },
      tbtc: {
        symbol: "tBTC",
        dec: 18,
        tm: "0xfb17d0402ae557e3efa549812b95e931b2b63bce",
        pf: "0xeaf3b36748d89d64ef1b6b3e1d7637c3e4745094",
        mcr: 1.2,
        ccr: 1.5,
        scr: 1.1,
      },
      wbtc18: {
        symbol: "WBTC18",
        dec: 18,
        tm: "0x7bd47eca45ee18609d3d64ba683ce488ca9320a3",
        pf: "0x4b74d043336678d2f62dae6595bc42dccabc3bb1",
        mcr: 1.2,
        ccr: 1.5,
        scr: 1.1,
      },
      cbbtc18: {
        symbol: "cbBTC18",
        dec: 18,
        tm: "0x0291c873838f7b62d743952d268bebe9ace1efa4",
        pf: "0xaf99e6cf5832222c0e22ef6bf0868c4ed7f2953f",
        mcr: 1.2,
        ccr: 1.5,
        scr: 1.1,
      },
    },
  },
  // Basedollar — the same V2 architecture on BASE (8453). Its revision carries
  // BCR (a batched Trove sits BCR above MCR), which Ebisu's predates, and every
  // branch's collateral is 18 decimals — wcbBTC is a wrapper that normalises
  // cbBTC's 8 up, which is why check 1b reads decimals() rather than the ticker
  // and check 4 scales the price by what it read.
  basedollar: {
    api: "basedollar",
    chain: base,
    rpcKey: "BASE_RPC_URL",
    constantsFrom: "bo",
    redemptionPriceView: true,
    branches: {
      weth: {
        symbol: "WETH",
        dec: 18,
        tm: "0xa957d42c4c43eb97d5f71b8435eb638e5dd9f639",
        pf: "0x40b4199347af7738643ef4a12a771f7421b84e7f",
        mcr: 1.1,
        ccr: 1.5,
        scr: 1.1,
        bcr: 0.1,
      },
      wsteth: {
        symbol: "wstETH",
        dec: 18,
        tm: "0x79a6a3361eae4d4b80939206426f2320c11a4bfb",
        pf: "0x176363a20ba1dc75b418d7954f5222499b276186",
        mcr: 1.1,
        ccr: 1.6,
        scr: 1.1,
        bcr: 0.1,
      },
      reth: {
        symbol: "rETH",
        dec: 18,
        tm: "0xd31987fcba98f471b6e4220c52f7741b11b2fc5e",
        pf: "0x6627b94533be5bba42d1aaaf982330e9746b6133",
        mcr: 1.1,
        ccr: 1.6,
        scr: 1.1,
        bcr: 0.1,
      },
      wcbbtc: {
        symbol: "wcbBTC",
        dec: 18,
        tm: "0x835b04eefbb0e32d8f75cfe96acb527a42f1a0d9",
        pf: "0x9e191d9f3f3c138c81753acf6f4ec32e84daa89e",
        mcr: 1.1,
        ccr: 1.5,
        scr: 1.1,
        bcr: 0.1,
      },
      cbeth: {
        symbol: "cbETH",
        dec: 18,
        tm: "0x482de97e667330afba99f8ced527118aec66f15d",
        pf: "0x23bb111e94ec68009da6b8fc50c19628a972b9e0",
        mcr: 1.1,
        ccr: 1.6,
        scr: 1.1,
        bcr: 0.1,
      },
    },
  },
};

const TM_ABI = parseAbi([
  "function borrowerOperations() view returns (address)",
  "function sortedTroves() view returns (address)",
  "function troveNFT() view returns (address)",
  "function getTroveIdsCount() view returns (uint256)",
  "function getLatestTroveData(uint256 troveId) view returns ((uint256 entireDebt, uint256 entireColl, uint256 redistBoldDebtGain, uint256 redistCollGain, uint256 accruedInterest, uint256 recordedDebt, uint256 annualInterestRate, uint256 weightedRecordedDebt, uint256 accruedBatchManagementFee, uint256 lastInterestRateAdjTime))",
  "function getCurrentICR(uint256 troveId, uint256 price) view returns (uint256)",
  "function getTroveStatus(uint256 troveId) view returns (uint8)",
  "function getUnbackedPortionPriceAndRedeemability() view returns (uint256, uint256, bool)",
]);
const AP_ABI = parseAbi([
  "function activePool() view returns (address)",
  "function collToken() view returns (address)",
]);
const NFT_ABI = parseAbi(["function troveManager() view returns (address)"]);
const ERC20_ABI = parseAbi(["function symbol() view returns (string)", "function decimals() view returns (uint8)"]);
const REG_ABI = parseAbi([
  "function MCR() view returns (uint256)",
  "function CCR() view returns (uint256)",
  "function SCR() view returns (uint256)",
  "function troveManager() view returns (address)",
  "function collToken() view returns (address)",
]);
const BO_ABI = parseAbi([
  "function MCR() view returns (uint256)",
  "function CCR() view returns (uint256)",
  "function SCR() view returns (uint256)",
  "function BCR() view returns (uint256)",
]);
// fetchPrice mutates state on-chain; declared view here so eth_call simulates
// it (the Liquity V1 pattern).
const PF_ABI = parseAbi([
  "function lastGoodPrice() view returns (uint256)",
  "function fetchPrice() view returns (uint256, bool)",
]);
const ST_ABI = parseAbi([
  "function getSize() view returns (uint256)",
  "function getFirst() view returns (uint256)",
  "function getNext(uint256 id) view returns (uint256)",
]);

const E18 = 10n ** 18n;
let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};
// `at` pins the read to one block. Every value a branch's checks compare
// against another — the two price reads and the ICR identity's three legs —
// is read at the SAME block, because a price that moved between two eth_calls
// is not a disagreement about anything and reads as one.
const tryRead = (address, abi, functionName, args = [], at = undefined) =>
  client.readContract({ address, abi, functionName, args, blockNumber: at }).then(
    (v) => v,
    () => null,
  );

async function apiTroves(proto) {
  if (!env.RAILS_API_URL || !env.API_BEARER_TOKEN) return [];
  const res = await fetch(`${env.RAILS_API_URL}/api/${proto}/troves?limit=200&sortBy=debt&sortOrder=desc`, {
    headers: { Authorization: `Bearer ${env.API_BEARER_TOKEN}` },
  });
  if (!res.ok) return [];
  return (await res.json()).data ?? [];
}

// The FORKS table above mirrors the catalog by hand, so asserting against it
// would only prove the mirror agrees with the chain. The collateral token is
// read out of the shipped catalog source itself — it is the one field the app
// puts on the wire as a token IDENTITY (every event flow's `token`), and a
// wrong one draws another asset's brand mark and links to another contract.
// The TroveNFT address is read the same way, for the same reason: the card's
// OpenSea link is built from it, and a wrong one lands on another
// collection's token of the same id rather than failing visibly.
function catalogBranches(rel) {
  const src = readFileSync(join(root, rel), "utf8");
  const field = (body, name) => body.match(new RegExp(`${name}:\\s*"([^"]+)"`))?.[1] ?? null;
  return Object.fromEntries(
    [...src.matchAll(/\n {2}([a-z0-9]+): \{([\s\S]*?)\n {2}\},/g)]
      .map(([, key, body]) => [
        key,
        {
          coll: field(body, "collateralAddr"),
          dec: Number(body.match(/decimals:\s*(\d+)/)?.[1]),
          nft: field(body, "troveNft"),
        },
      ])
      .filter(([, v]) => v.coll),
  );
}

const only = process.env.FORK ? process.env.FORK.split(",").map((s) => s.trim()) : null;

for (const [fork, cfg] of Object.entries(FORKS)) {
  if (only && !only.includes(fork)) continue;
  console.log(`\n########## ${fork} — ${cfg.chain.name} (${cfg.chain.id}) via ${cfg.rpcKey} ##########`);
  client = clientFor(cfg);
  const catalog = catalogBranches(`lib/${fork}/asset-catalog.ts`);
  const troves = await apiTroves(cfg.api);

  for (const [key, b] of Object.entries(cfg.branches)) {
    console.log(`\n== ${fork}/${key} (${b.tm}) ==`);
    const [bo, sorted] = await Promise.all([
      tryRead(b.tm, TM_ABI, "borrowerOperations"),
      tryRead(b.tm, TM_ABI, "sortedTroves"),
    ]);
    check(`${key}: TM resolves BO + SortedTroves`, bo != null && sorted != null);

    // 1. PriceFeed from BO storage slot 2 — matches the catalog.
    const slot2 = await client.getStorageAt({ address: bo, slot: "0x2" });
    const pf = "0x" + slot2.slice(-40);
    check(`${key}: PriceFeed @ BO slot 2 matches catalog`, pf === b.pf, pf);

    // 1b. Collateral token — the branch's own ActivePool.collToken(), against
    //     the catalog's collateralAddr AND its declared decimals. Asymmetry's
    //     BTC branches take an 18-decimal WRAPPER of the asset they are named
    //     for, so the catalog naming the 8-decimal underlying reads plausible
    //     and is wrong in both fields at once.
    const ap = await tryRead(bo, AP_ABI, "activePool");
    const collToken = await tryRead(ap, AP_ABI, "collToken");
    const [collSym, collDec] = await Promise.all([
      tryRead(collToken, ERC20_ABI, "symbol"),
      tryRead(collToken, ERC20_ABI, "decimals"),
    ]);
    const cat = catalog[key] ?? {};
    check(
      `${key}: catalog collateralAddr is ActivePool.collToken()`,
      collToken != null && collToken.toLowerCase() === cat.coll,
      `chain ${collToken} (${collSym}) vs catalog ${cat.coll}`,
    );
    check(
      `${key}: catalog decimals match the collateral token`,
      collDec != null && collDec === cat.dec,
      `chain ${collDec} vs catalog ${cat.dec}`,
    );

    // 1c. TroveNFT — TroveManager.troveNFT() against the catalog's own
    //     `troveNft`, with the NFT's troveManager() backpointer closing the
    //     loop so a copy-paste from a sibling branch cannot pass.
    const nft = await tryRead(b.tm, TM_ABI, "troveNFT");
    const nftTm = await tryRead(nft, NFT_ABI, "troveManager");
    check(
      `${key}: catalog troveNft is TroveManager.troveNFT()`,
      nft != null && nft.toLowerCase() === cat.nft && nftTm?.toLowerCase() === b.tm,
      `chain ${nft} (backpointer ${nftTm}) vs catalog ${cat.nft}`,
    );

    // 2. Constants — registry (Ebisu, TM slot 15) or BO getters (Asymmetry).
    let mcr, ccr, scr;
    if (cfg.constantsFrom === "registry") {
      const slot15 = await client.getStorageAt({ address: b.tm, slot: "0xf" });
      const reg = "0x" + slot15.slice(-40);
      const [m, c, s, regTm] = await Promise.all([
        tryRead(reg, REG_ABI, "MCR"),
        tryRead(reg, REG_ABI, "CCR"),
        tryRead(reg, REG_ABI, "SCR"),
        tryRead(reg, REG_ABI, "troveManager"),
      ]);
      check(`${key}: registry @ TM slot 15 points back to this TM`, regTm?.toLowerCase() === b.tm, reg);
      check(
        `${key}: TM slot 15 = catalog branchManager`,
        reg.toLowerCase() === b.bm,
        `chain ${reg} vs catalog ${b.bm}`,
      );
      [mcr, ccr, scr] = [m, c, s];
    } else {
      [mcr, ccr, scr] = await Promise.all([
        tryRead(bo, BO_ABI, "MCR"),
        tryRead(bo, BO_ABI, "CCR"),
        tryRead(bo, BO_ABI, "SCR"),
      ]);
    }
    check(
      `${key}: MCR/CCR/SCR match catalog`,
      mcr != null && Number(mcr) / 1e18 === b.mcr && Number(ccr) / 1e18 === b.ccr && Number(scr) / 1e18 === b.scr,
      `${Number(mcr) / 1e18}/${Number(ccr) / 1e18}/${Number(scr) / 1e18}`,
    );
    // BCR only on the forks whose revision has it — a batched Trove's margin
    // over MCR, and a wrong one misstates when a batch becomes liquidatable.
    if (b.bcr != null) {
      const bcr = await tryRead(bo, BO_ABI, "BCR");
      check(
        `${key}: BCR matches catalog`,
        bcr != null && Number(bcr) / 1e18 === b.bcr,
        `chain ${bcr != null ? Number(bcr) / 1e18 : "unreadable"} vs catalog ${b.bcr}`,
      );
    }

    // 3. Price: lastGoodPrice answers; simulated fetchPrice is live + not down.
    // Everything from here down reads at ONE block, so the price the identity
    // checks use is the price the trove data was read against.
    const at = await client.getBlockNumber();
    const [last, fetched] = await Promise.all([
      tryRead(pf, PF_ABI, "lastGoodPrice", [], at),
      tryRead(pf, PF_ABI, "fetchPrice", [], at),
    ]);
    // Price scale 1e(36 − coll decimals), from the decimals check 1b READ off
    // the token (the mirror below is only a fallback if that read failed).
    const dec = collDec != null ? Number(collDec) : b.dec;
    const scaleDiv = 10 ** (36 - dec);
    check(
      `${key}: lastGoodPrice answers`,
      last != null && last > 0n,
      last != null ? `$${(Number(last) / scaleDiv).toFixed(2)}` : "",
    );
    check(
      `${key}: simulated fetchPrice live, oracle not down`,
      fetched != null && fetched[0] > 0n && fetched[1] === false,
      fetched != null
        ? `$${(Number(fetched[0]) / scaleDiv).toFixed(2)} (lastGood drift ${last != null ? (((Number(fetched[0]) - Number(last)) / Number(last)) * 100).toFixed(2) : "?"}%)`
        : "",
    );
    const priceRaw = fetched?.[0] ?? last;

    // The TM's own redemption view returns the same live price, where the
    // fork's revision exposes it (Asymmetry, Basedollar).
    if (cfg.redemptionPriceView) {
      const un = await tryRead(b.tm, TM_ABI, "getUnbackedPortionPriceAndRedeemability", [], at);
      check(
        `${key}: TM redemption view price == simulated fetchPrice (@${at})`,
        un != null && priceRaw != null && un[1] === priceRaw,
        un != null ? `$${(Number(un[1]) / scaleDiv).toFixed(2)}` : "",
      );
    }

    // 4-5. Sample trove: ICR identity BigInt-exact at the branch's price scale.
    const sample = troves.find((t) => t.collateralType === b.symbol && t.status === "open");
    if (sample && priceRaw != null) {
      const [data, status, icr] = await Promise.all([
        tryRead(b.tm, TM_ABI, "getLatestTroveData", [BigInt(sample.id)], at),
        tryRead(b.tm, TM_ABI, "getTroveStatus", [BigInt(sample.id)], at),
        tryRead(b.tm, TM_ABI, "getCurrentICR", [BigInt(sample.id), priceRaw], at),
      ]);
      if (data != null && data.entireDebt > 0n) {
        const manual = (data.entireColl * priceRaw) / data.entireDebt;
        check(
          `${key}: getCurrentICR == entireColl × price ÷ entireDebt (BigInt-exact)`,
          icr === manual,
          `ICR ${(Number(icr) / 1e18).toFixed(4)} (status ${status})`,
        );
        // 7. Index agreement — informational: redemption lag is expected.
        const chainDebt = Number(data.entireDebt) / 1e18;
        const chainColl = Number(data.entireColl) / 10 ** dec;
        const dDrift = sample.debt.current > 0 ? ((chainDebt - sample.debt.current) / sample.debt.current) * 100 : 0;
        const cDrift =
          sample.collateral.amount > 0 ? ((chainColl - sample.collateral.amount) / sample.collateral.amount) * 100 : 0;
        console.log(
          `      index vs chain: debt ${sample.debt.current} → ${chainDebt.toFixed(2)} (${dDrift.toFixed(2)}%), coll ${sample.collateral.amount} → ${chainColl.toFixed(4)} (${cDrift.toFixed(2)}%)${Math.abs(dDrift) > 1 ? " [redemption-lagged — the live lane's reason to exist]" : ""}`,
        );
      } else if (data != null) {
        console.log(
          `      sample trove has no live debt (closed/redeemed on chain; index lags) — identity check skipped`,
        );
      }
    }

    // 6. Redemption order: sorted list walks in descending interest rate.
    const size = await tryRead(sorted, ST_ABI, "getSize", [], at);
    if (size != null && size > 1n) {
      let id = await tryRead(sorted, ST_ABI, "getFirst", [], at);
      let prevRate = null;
      let ordered = true;
      let walked = 0;
      while (id != null && id !== 0n && walked < 25) {
        const d = await tryRead(b.tm, TM_ABI, "getLatestTroveData", [id], at);
        if (d == null) break;
        if (prevRate != null && d.annualInterestRate > prevRate) ordered = false;
        prevRate = d.annualInterestRate;
        id = await tryRead(sorted, ST_ABI, "getNext", [id], at);
        walked++;
      }
      check(`${key}: SortedTroves descends by annual interest rate (${walked} walked)`, ordered);
    }
    await pause(800);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
