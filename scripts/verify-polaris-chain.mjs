// Verify the Polaris explorer's claims against Sepolia — assertions that could
// actually fail, run against the live chain (SEPOLIA_RPC_URL) + the live rails
// index (RAILS_API_URL + API_BEARER_TOKEN). This is the `verification`
// coverage cell's script.
//
//   A. ADDRESS GRAPH — the catalog's contract map is what the contracts
//      themselves name: each cdpManager's stabilityPool() and priceFeed(), the
//      USDp feed's medianiser(), and the two MCR constants (1.15e18 / 1.5e18).
//      In live mode the index's deployment row is held to the same map.
//   B. REPLAY IDENTITY — for the fixture CDPs (usdp 1, 2, 3, 7, 10, 27, 166,
//      175) every CDPUpdated transition the index serves satisfies
//        newDebt = prevDebt + _debtChange + _accruedInterest + _mintRedeemDebtGain
//                  − _stableGain + _stablesMintedToEnsureZeroDebt
//        newColl = prevColl + _collChange + _mintRedeemCollGain + _bcTokenGain
//      BigInt-exact, and the last row's resulting figures equal getCDP(id)'s
//      stored .coll/.debt read at the index's own watermark (an archive read).
//   C. STATE IDENTITIES — at one head block, for every OPEN fixture CDP:
//        getCDPEntireDebt = getCDP.debt + accruedInterest + mintRedeemDebtChange − accruedStables
//        getCDPEntireColl = getCDP.coll + mintRedeemCollChange + bcTokenGain
//        getICR           = entireColl × priceFeed.previewPrice() ÷ entireDebt   (±1 wei)
//   D. CENSUS — the index's per-market counters (/api/polaris/markets:
//      cdp_updated_count, liquidation_count, psm_mint_count, psm_redeem_count,
//      sp_deposit_ops) equal an independent eth_getLogs count by topic0 at the
//      watermark, and the op-0 CDPUpdated count equals the cdpNft's mint count
//      (Transfer from 0x0) — every open mints exactly one NFT. Measured here:
//      the cdpNft's Transfer carries FOUR topics (tokenId is indexed), not the
//      two-indexed shape the scoping doc's §1.3 describes.
//
// --fixtures: no index. B runs over the scoping fixture (usdp-cdp-events.json
// under POLARIS_FIXTURES_DIR, every USDp CDPUpdated to block 11,638,691) and D
// re-counts the fixture's pinned baseline (baseline-counts.json, block
// 11,638,893) so the counting itself is proven reproducible. A and C run
// either way.
//
// Usage: node scripts/verify-polaris-chain.mjs [--fixtures]
//   (--fixtures needs POLARIS_FIXTURES_DIR, the directory holding the two files)

import { createPublicClient, http, parseAbi, toEventSelector, decodeEventLog } from "viem";
import { sepolia } from "viem/chains";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const FIXTURES_MODE = process.argv.includes("--fixtures");
const FIXTURES_DIR = process.env.POLARIS_FIXTURES_DIR;
if (FIXTURES_MODE && !FIXTURES_DIR) {
  console.error(
    "--fixtures needs POLARIS_FIXTURES_DIR (the directory holding usdp-cdp-events.json and baseline-counts.json)",
  );
  process.exit(1);
}

const envFile = existsSync(".env.local")
  ? Object.fromEntries(
      readFileSync(".env.local", "utf8")
        .split("\n")
        .filter((l) => l.includes("="))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
    )
  : {};
const pick = (k) => process.env[k] ?? envFile[k];
// The same derivation lib/sources/chain/rpc.ts makes: Sepolia is mainnet's key
// on another host. Never printed.
const SEPOLIA_RPC_URL =
  pick("SEPOLIA_RPC_URL") ??
  (pick("ALCHEMY_URL")?.includes("eth-mainnet.g.alchemy.com")
    ? pick("ALCHEMY_URL").replace("eth-mainnet.g.alchemy.com", "eth-sepolia.g.alchemy.com")
    : undefined);
const RAILS_API_URL = pick("RAILS_API_URL");
const API_BEARER_TOKEN = pick("API_BEARER_TOKEN");
if (!SEPOLIA_RPC_URL) {
  console.error("need SEPOLIA_RPC_URL (or an Alchemy ALCHEMY_URL to derive it from)");
  process.exit(1);
}
if (!FIXTURES_MODE && (!RAILS_API_URL || !API_BEARER_TOKEN)) {
  console.error("need RAILS_API_URL and API_BEARER_TOKEN (env or .env.local), or pass --fixtures");
  process.exit(1);
}

const client = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC_URL) });

// ── The catalog (mirrors lib/polaris/asset-catalog.ts — a .mjs cannot import it) ──
const FLOOR = 11_482_700n;
const E18 = 10n ** 18n;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const CORE = {
  bondingCurve: "0x07ea2ff889e6228cded329a09f66e370f12c705e",
  ethUsdMedianiser: "0x1cbc98793da57bb3ec659058434870fae89532de",
  xauUsdMedianiser: "0x331ed8031be714d2b43df97f31542d89dc5df50e",
  reserveLoansManager: "0xcaa0757808a96f9f4ee76c04256536d6c17e6e27",
  reserveLoansNft: "0xa1382064bbd50a3740b03cc9c512385e60e03b2f",
};
const MARKETS = {
  usdp: {
    cdpManager: "0xbdc1fe97e787ae7f653ffbccd74ec49814fe6aa1",
    stabilityPool: "0xb61eb4712b285d9621af4ccba74a93c8d88502e5",
    cdpNft: "0x1f3f4a0f65c4255d7b488816a629fbebf5269e1b",
    priceFeed: "0xdf7f2c41c3c0639a952b19639c532350c4cdc4a1",
    psm: "0xa03798ad2d5a51e23d3221e18ce89aacedd9fad1",
  },
  goldp: {
    cdpManager: "0x18f652c41a5d30b4b49a9962800b34a6f1abfe41",
    stabilityPool: "0x6a506c0738e238784d171c2062ce7dde246e542f",
    cdpNft: "0x6c6de65191929dc0f607f641642b6aadb1f91af8",
    priceFeed: "0x53450cabbac3ef0c1fe29abd7602790d32fcb442",
    psm: "0x90b0fcf35dd2ff2b43c6eb08e598f9f725f93b65",
  },
};
const FIXTURE_CDPS = ["1", "2", "3", "7", "10", "27", "166", "175"];

const MANAGER_ABI = parseAbi([
  "function getCDP(uint256 _id) view returns ((uint256 coll, uint256 debt, uint256 gasCompDeposit, uint256 snapshotTimeWeightedRateSum, uint256 snapshotStableRewardSum, uint256 snapshotBcTokenRewardSum, int256 snapshotMintRedeemDebtSum, uint128 snapshotMintRedeemCollProd, uint64 snapshotRate, uint48 lastTouchTime, uint48 snapshotLastRateUpdateTime, bool isOpen))",
  "function getCDPEntireDebt(uint256 _id) view returns (int256)",
  "function getCDPEntireColl(uint256 _id) view returns (uint256)",
  "function getCDPAccruedInterest(uint256 _id) view returns (uint256)",
  "function getCDPAccruedStables(uint256 _id) view returns (uint256)",
  "function getCDPBcTokenGain(uint256 _id) view returns (uint256)",
  "function getCDPMintRedeemCollChange(uint256 _id) view returns (int256)",
  "function getCDPMintRedeemDebtChange(uint256 _id) view returns (int256)",
  "function getICR(uint256 _id) view returns (uint256)",
  "function MCR() view returns (uint256)",
  "function DEFENSIVE_MODE_MCR() view returns (uint256)",
  "function stabilityPool() view returns (address)",
  "function priceFeed() view returns (address)",
]);
const FEED_ABI = parseAbi([
  "function medianiser() view returns (address)",
  "function previewPrice() view returns (uint256)",
]);
const EVENTS_ABI = parseAbi([
  "event CDPUpdated(uint256 indexed _id, uint8 _operation, uint256 _newColl, uint256 _newDebt, int256 _collChange, int256 _debtChange, int256 _mintRedeemCollGain, int256 _mintRedeemDebtGain, uint256 _accruedInterest, uint256 _stableGain, uint256 _stablesMintedToEnsureZeroDebt, uint256 _bcTokenGain)",
  "event Transfer(address indexed from, address indexed to, uint256 tokenId)",
]);
const SIG = {
  CDPUpdated: "CDPUpdated(uint256,uint8,uint256,uint256,int256,int256,int256,int256,uint256,uint256,uint256,uint256)",
  Liquidation: "Liquidation(uint256,address,address,uint256,uint256,uint256,uint256,uint256)",
  Minted: "Minted(address,uint256,uint256,uint256,uint256)",
  Redeemed: "Redeemed(address,uint256,uint256,uint256,uint256)",
  DepositOperation: "DepositOperation(uint256,uint8,uint256,int256,uint256,uint256,uint256,uint256)",
  Transfer: "Transfer(address,address,uint256)",
};
const TOPIC = Object.fromEntries(Object.entries(SIG).map(([k, s]) => [k, toEventSelector(s)]));

async function api(path) {
  const res = await fetch(`${RAILS_API_URL}${path}`, { headers: { Authorization: `Bearer ${API_BEARER_TOKEN}` } });
  if (!res.ok) throw new Error(`API ${path} → ${res.status} ${res.statusText}`);
  return res.json();
}

let pass = 0;
let fail = 0;
const findings = [];
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};
const lower = (a) => String(a).toLowerCase();
const big = (v) => BigInt(String(v).split(".")[0]);

/** Windowed eth_getLogs over [from, to] for one address, by 10,000 blocks —
 *  the quota guard the plan asks for even though Sepolia answers whole ranges. */
async function getLogsWindowed(address, from, to) {
  const out = [];
  for (let lo = from; lo <= to; lo += 10_000n) {
    const hi = lo + 9_999n < to ? lo + 9_999n : to;
    out.push(...(await client.getLogs({ address, fromBlock: lo, toBlock: hi })));
  }
  return out;
}

/** Per-topic0 counts + the op-0 CDPUpdated count and the NFT mint count. */
async function census(to) {
  const out = {};
  for (const [market, m] of Object.entries(MARKETS)) {
    const [mgr, sp, nft, psm] = await Promise.all([
      getLogsWindowed(m.cdpManager, FLOOR, to),
      getLogsWindowed(m.stabilityPool, FLOOR, to),
      getLogsWindowed(m.cdpNft, FLOOR, to),
      getLogsWindowed(m.psm, FLOOR, to),
    ]);
    const count = (logs, topic) => logs.filter((l) => l.topics[0] === topic).length;
    let opens = 0;
    for (const l of mgr) {
      if (l.topics[0] !== TOPIC.CDPUpdated) continue;
      const { args } = decodeEventLog({ abi: EVENTS_ABI, data: l.data, topics: l.topics });
      if (Number(args._operation) === 0) opens++;
    }
    // The cdpNft's Transfer indexes all three params (from, to, tokenId — four
    // topics, empty data), unlike the scoping doc's "tokenId in data" note; a
    // mint is a Transfer whose `from` topic is the zero address either way.
    let mints = 0;
    for (const l of nft) {
      if (l.topics[0] !== TOPIC.Transfer || l.topics.length < 3) continue;
      if (lower(`0x${l.topics[1].slice(26)}`) === ZERO_ADDR) mints++;
    }
    out[market] = {
      cdpUpdated: count(mgr, TOPIC.CDPUpdated),
      liquidation: count(mgr, TOPIC.Liquidation),
      psmMinted: count(psm, TOPIC.Minted),
      psmRedeemed: count(psm, TOPIC.Redeemed),
      spDepositOps: count(sp, TOPIC.DepositOperation),
      opens,
      mints,
      managerTotal: mgr.length,
      spTotal: sp.length,
      nftTotal: nft.length,
      psmTotal: psm.length,
    };
  }
  return out;
}

// ── A. Address graph ─────────────────────────────────────────────────────────
console.log("A. address graph");
{
  const contracts = [];
  for (const m of Object.values(MARKETS)) {
    contracts.push(
      { address: m.cdpManager, abi: MANAGER_ABI, functionName: "stabilityPool" },
      { address: m.cdpManager, abi: MANAGER_ABI, functionName: "priceFeed" },
      { address: m.cdpManager, abi: MANAGER_ABI, functionName: "MCR" },
      { address: m.cdpManager, abi: MANAGER_ABI, functionName: "DEFENSIVE_MODE_MCR" },
    );
  }
  contracts.push({ address: MARKETS.usdp.priceFeed, abi: FEED_ABI, functionName: "medianiser" });
  const res = await client.multicall({ contracts, allowFailure: true });
  const at = (i) => (res[i].status === "success" ? res[i].result : null);
  Object.entries(MARKETS).forEach(([market, m], i) => {
    const b = i * 4;
    check(`A ${market} cdpManager.stabilityPool() == catalog`, lower(at(b)) === m.stabilityPool, String(at(b)));
    check(`A ${market} cdpManager.priceFeed() == catalog`, lower(at(b + 1)) === m.priceFeed, String(at(b + 1)));
    check(`A ${market} MCR() == 1.15e18`, at(b + 2) === 1_150_000_000_000_000_000n, String(at(b + 2)));
    check(`A ${market} DEFENSIVE_MODE_MCR() == 1.5e18`, at(b + 3) === 1_500_000_000_000_000_000n, String(at(b + 3)));
  });
  check("A usdp priceFeed.medianiser() == ETH/USD medianiser", lower(at(8)) === CORE.ethUsdMedianiser, String(at(8)));
}

// ── The watermark: the index's, or the fixture's pinned block ────────────────
let markets = null;
let watermark;
if (FIXTURES_MODE) {
  const baseline = JSON.parse(readFileSync(join(FIXTURES_DIR, "baseline-counts.json"), "utf8"));
  watermark = BigInt(baseline.pinnedBlock);
} else {
  markets = await api("/api/polaris/markets");
  const scanned = markets.markets.map((m) => BigInt(m.last_scanned_block));
  watermark = scanned.reduce((a, b) => (a < b ? a : b));
  check(
    "A index deployment row names the catalog's chain and floor",
    markets.deployment?.chain_id === 11155111 && BigInt(markets.deployment?.deploy_block ?? 0) === FLOOR,
    `chain ${markets.deployment?.chain_id}, floor ${markets.deployment?.deploy_block}`,
  );
  const addr = markets.deployment?.addresses ?? {};
  const drift = [];
  for (const [market, m] of Object.entries(MARKETS)) {
    for (const [k, v] of Object.entries(m)) {
      const key = `${market}${k[0].toUpperCase()}${k.slice(1)}`;
      const got = addr[key] ?? addr[`${market}_${k}`] ?? addr[`${market}.${k}`];
      if (got != null && lower(got) !== v) drift.push(`${key}: index ${got} vs catalog ${v}`);
    }
  }
  check("A index deployment addresses agree with the catalog where named", drift.length === 0, drift.join("; "));
}
console.log(
  `watermark: block ${watermark}${FIXTURES_MODE ? " (fixture pin)" : " (index last_scanned_block, min over markets)"}`,
);

// ── B. Replay identity ───────────────────────────────────────────────────────
console.log("\nB. replay identity on the fixture CDPs");
/** rows: [{ op, newColl, newDebt, collChange, debtChange, mrColl, mrDebt, interest, stableGain, zeroMint, bcGain }] as BigInt */
function replayRows(rows) {
  let prevColl = 0n;
  let prevDebt = 0n;
  let exact = 0;
  const bad = [];
  rows.forEach((r, i) => {
    const debt = prevDebt + r.debtChange + r.interest + r.mrDebt - r.stableGain + r.zeroMint;
    const coll = prevColl + r.collChange + r.mrColl + r.bcGain;
    if (debt === r.newDebt && coll === r.newColl) exact++;
    else bad.push(`row ${i} (op ${r.op}): debt ${debt} vs ${r.newDebt}, coll ${coll} vs ${r.newColl}`);
    prevColl = r.newColl;
    prevDebt = r.newDebt;
  });
  return { exact, bad, last: rows[rows.length - 1] };
}

let bRows = {};
let bBlock = watermark;
if (FIXTURES_MODE) {
  // JSON numbers past 2^53 lose digits in JSON.parse — quote every long
  // numeric literal first so BigInt sees the exact digits.
  const text = readFileSync(join(FIXTURES_DIR, "usdp-cdp-events.json"), "utf8").replace(
    /:\s*(-?\d{16,})(?=[,}\]])/g,
    ':"$1"',
  );
  const fx = JSON.parse(text);
  bBlock = 11_638_691n;
  for (const r of fx.cdp) {
    const id = String(r.id);
    if (!FIXTURE_CDPS.includes(id)) continue;
    (bRows[id] ??= []).push({
      op: Number(r.op),
      newColl: big(r.coll),
      newDebt: big(r.debt),
      collChange: big(r.dColl),
      debtChange: big(r.dDebt),
      mrColl: big(r.mrColl),
      mrDebt: big(r.mrDebt),
      interest: big(r.interest),
      stableGain: big(r.stableGain),
      zeroMint: big(r.zeroMint),
      bcGain: big(r.bcGain),
      blk: Number(r.blk),
      li: Number(r.li),
    });
  }
  for (const id of Object.keys(bRows)) bRows[id].sort((a, b) => a.blk - b.blk || a.li - b.li);
} else {
  for (const id of FIXTURE_CDPS) {
    const tl = await api(`/api/polaris/timeline?market=usdp&id=${id}`);
    bRows[id] = tl.rows
      .filter((r) => r.event_type === "cdp_updated")
      .map((r) => ({
        op: Number(r.operation),
        newColl: big(r.new_coll),
        newDebt: big(r.new_debt),
        collChange: big(r.coll_change),
        debtChange: big(r.debt_change),
        mrColl: big(r.mint_redeem_coll_gain),
        mrDebt: big(r.mint_redeem_debt_gain),
        interest: big(r.accrued_interest),
        stableGain: big(r.stable_gain),
        zeroMint: big(r.stables_minted_to_ensure_zero_debt),
        bcGain: big(r.bc_token_gain),
        collBefore: r.coll_before == null ? null : big(r.coll_before),
        debtBefore: r.debt_before == null ? null : big(r.debt_before),
        blk: Number(r.block_number),
        li: Number(r.log_index),
      }));
  }
}
{
  let transitions = 0;
  let exact = 0;
  let lagOk = 0;
  let lagChecked = 0;
  for (const id of FIXTURE_CDPS) {
    const rows = bRows[id] ?? [];
    if (rows.length === 0) {
      findings.push(`B usdp CDP ${id}: no rows served`);
      continue;
    }
    const r = replayRows(rows);
    transitions += rows.length;
    exact += r.exact;
    for (const b of r.bad) findings.push(`B usdp CDP ${id} ${b}`);
    check(`B usdp CDP ${id} first row is the open (op 0)`, rows[0].op === 0, `op ${rows[0].op}`);
    // Live rows carry the index's lag columns — hold them to the previous row.
    if (!FIXTURES_MODE) {
      let prevColl = 0n;
      let prevDebt = 0n;
      for (const row of rows) {
        lagChecked++;
        if (row.collBefore === prevColl && row.debtBefore === prevDebt) lagOk++;
        else
          findings.push(
            `B usdp CDP ${id} lag columns drift at block ${row.blk}: ${row.collBefore}/${row.debtBefore} vs ${prevColl}/${prevDebt}`,
          );
        prevColl = row.newColl;
        prevDebt = row.newDebt;
      }
    }
  }
  check(
    `B replay identity exact on every transition`,
    transitions > 0 && exact === transitions,
    `${exact}/${transitions}`,
  );
  if (!FIXTURES_MODE)
    check(
      "B index lag columns equal the previous row's resulting figures",
      lagChecked > 0 && lagOk === lagChecked,
      `${lagOk}/${lagChecked}`,
    );

  // The last row's resulting figures equal the stored slots at the block the
  // rows are complete to — an archive read.
  const ids = FIXTURE_CDPS.filter((id) => (bRows[id] ?? []).length > 0);
  const res = await client.multicall({
    allowFailure: true,
    blockNumber: bBlock,
    contracts: ids.map((id) => ({
      address: MARKETS.usdp.cdpManager,
      abi: MANAGER_ABI,
      functionName: "getCDP",
      args: [BigInt(id)],
    })),
  });
  let slotExact = 0;
  ids.forEach((id, i) => {
    const cdp = res[i].status === "success" ? res[i].result : null;
    const last = bRows[id][bRows[id].length - 1];
    if (cdp && cdp.coll === last.newColl && cdp.debt === last.newDebt) slotExact++;
    else
      findings.push(
        `B usdp CDP ${id}: getCDP@${bBlock} coll ${cdp?.coll} debt ${cdp?.debt} vs last row ${last.newColl}/${last.newDebt}`,
      );
  });
  check(
    `B last resulting figures == getCDP(id).coll/.debt at block ${bBlock}`,
    ids.length > 0 && slotExact === ids.length,
    `${slotExact}/${ids.length}`,
  );
}

// ── C. State identities at head ──────────────────────────────────────────────
console.log("\nC. state identities at head");
{
  const head = await client.getBlockNumber();
  const ids = FIXTURE_CDPS.map(BigInt);
  const per = 9;
  const contracts = ids.flatMap((id) => [
    { address: MARKETS.usdp.cdpManager, abi: MANAGER_ABI, functionName: "getCDP", args: [id] },
    { address: MARKETS.usdp.cdpManager, abi: MANAGER_ABI, functionName: "getCDPEntireDebt", args: [id] },
    { address: MARKETS.usdp.cdpManager, abi: MANAGER_ABI, functionName: "getCDPEntireColl", args: [id] },
    { address: MARKETS.usdp.cdpManager, abi: MANAGER_ABI, functionName: "getCDPAccruedInterest", args: [id] },
    { address: MARKETS.usdp.cdpManager, abi: MANAGER_ABI, functionName: "getCDPAccruedStables", args: [id] },
    { address: MARKETS.usdp.cdpManager, abi: MANAGER_ABI, functionName: "getCDPBcTokenGain", args: [id] },
    { address: MARKETS.usdp.cdpManager, abi: MANAGER_ABI, functionName: "getCDPMintRedeemCollChange", args: [id] },
    { address: MARKETS.usdp.cdpManager, abi: MANAGER_ABI, functionName: "getCDPMintRedeemDebtChange", args: [id] },
    { address: MARKETS.usdp.cdpManager, abi: MANAGER_ABI, functionName: "getICR", args: [id] },
  ]);
  contracts.push({ address: MARKETS.usdp.priceFeed, abi: FEED_ABI, functionName: "previewPrice" });
  const res = await client.multicall({ allowFailure: true, blockNumber: head, contracts });
  const price = res[res.length - 1].status === "success" ? res[res.length - 1].result : null;
  check("C priceFeed.previewPrice() answers at head", price != null && price > 0n, String(price));
  let open = 0;
  let debtOk = 0;
  let collOk = 0;
  let icrOk = 0;
  ids.forEach((id, i) => {
    const r = (j) => (res[i * per + j].status === "success" ? res[i * per + j].result : null);
    const cdp = r(0);
    if (!cdp || !cdp.isOpen) return;
    open++;
    const entireDebt = r(1);
    const entireColl = r(2);
    const interest = r(3);
    const stables = r(4);
    const bcGain = r(5);
    const mrColl = r(6);
    const mrDebt = r(7);
    const icr = r(8);
    const debtId = cdp.debt + interest + mrDebt - stables;
    const collId = cdp.coll + mrColl + bcGain;
    if (debtId === entireDebt) debtOk++;
    else findings.push(`C CDP ${id}: entireDebt ${entireDebt} vs identity ${debtId}`);
    if (collId === entireColl) collOk++;
    else findings.push(`C CDP ${id}: entireColl ${entireColl} vs identity ${collId}`);
    if (price != null && entireDebt > 0n) {
      const icrId = (entireColl * price) / entireDebt;
      const diff = icrId > icr ? icrId - icr : icr - icrId;
      if (diff <= 1n) icrOk++;
      else findings.push(`C CDP ${id}: getICR ${icr} vs entireColl × price ÷ entireDebt ${icrId}`);
    } else icrOk++;
  });
  check(
    `C entireDebt identity on every open fixture CDP @ ${head}`,
    open > 0 && debtOk === open,
    `${debtOk}/${open} open`,
  );
  check(
    `C entireColl identity on every open fixture CDP @ ${head}`,
    open > 0 && collOk === open,
    `${collOk}/${open} open`,
  );
  check(
    `C getICR == entireColl × price ÷ entireDebt (±1 wei) on every open fixture CDP`,
    open > 0 && icrOk === open,
    `${icrOk}/${open} open`,
  );
}

// ── D. Census ────────────────────────────────────────────────────────────────
console.log(`\nD. census at block ${watermark} (independent eth_getLogs, windowed)`);
{
  const counts = await census(watermark);
  for (const [market, c] of Object.entries(counts)) {
    check(
      `D ${market} op-0 CDPUpdated count == cdpNft mint count`,
      c.opens > 0 && c.opens === c.mints,
      `${c.opens} opens, ${c.mints} mints`,
    );
  }
  if (FIXTURES_MODE) {
    const baseline = JSON.parse(readFileSync(join(FIXTURES_DIR, "baseline-counts.json"), "utf8"));
    for (const [market, c] of Object.entries(counts)) {
      const b = baseline.contracts;
      const want = {
        cdpUpdated: b[`${market}_cdpManager`].byEvent[SIG.CDPUpdated] ?? 0,
        liquidation: b[`${market}_cdpManager`].byEvent[SIG.Liquidation] ?? 0,
        psmMinted: b[`${market}_psm`].byEvent[SIG.Minted] ?? 0,
        psmRedeemed: b[`${market}_psm`].byEvent[SIG.Redeemed] ?? 0,
        spDepositOps: b[`${market}_stabilityPool`].byEvent[SIG.DepositOperation] ?? 0,
        managerTotal: b[`${market}_cdpManager`].total,
      };
      const diffs = Object.entries(want)
        .filter(([k, v]) => c[k] !== v)
        .map(([k, v]) => `${k}: got ${c[k]} vs baseline ${v}`);
      check(
        `D ${market} re-count reproduces the pinned baseline`,
        diffs.length === 0,
        diffs.join("; ") || `${c.managerTotal} manager logs`,
      );
    }
  } else {
    for (const m of markets.markets) {
      const c = counts[m.market];
      if (!c) continue;
      const want = {
        cdpUpdated: Number(m.cdp_updated_count),
        liquidation: Number(m.liquidation_count),
        psmMinted: Number(m.psm_mint_count),
        psmRedeemed: Number(m.psm_redeem_count),
        spDepositOps: Number(m.sp_deposit_ops),
      };
      const diffs = Object.entries(want)
        .filter(([k, v]) => c[k] !== v)
        .map(([k, v]) => `${k}: chain ${c[k]} vs index ${v}`);
      check(
        `D ${m.market} index counters == eth_getLogs counts at the watermark`,
        diffs.length === 0,
        diffs.join("; ") || `${c.cdpUpdated} CDPUpdated, ${c.psmMinted}/${c.psmRedeemed} PSM, ${c.spDepositOps} SP ops`,
      );
      const total = Number(m.open_count) + Number(m.closed_count) + Number(m.liquidated_count);
      check(`D ${m.market} index CDP count == cdpNft mint count`, total === c.mints, `${total} vs ${c.mints}`);
    }
  }
}

// ── verdict ──────────────────────────────────────────────────────────────────
if (findings.length) {
  console.log("\nFINDINGS:");
  for (const f of findings) console.log(`  · ${f}`);
}
console.log(`\n${pass} passed / ${fail} failed${FIXTURES_MODE ? " (fixtures mode — no index consulted)" : ""}`);
process.exit(fail === 0 ? 0 : 1);
