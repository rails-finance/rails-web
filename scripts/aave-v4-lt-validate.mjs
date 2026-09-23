// Trustworthy LT validation: recover each asset's TRUE live liquidation threshold
// from chain via getUserAccountData.avgCollateralFactor on single-collateral
// positions, and diff against our seeded LT_BY_SPOKE table. One-off, not built.
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { readFileSync } from "node:fs";

// Inlined copy of LT_BY_SPOKE from lib/aave-v4/liquidation-thresholds.ts
// (keyed by FE display name). 0 = borrow-only in our table.
const LT_BY_SPOKE = {
  Main: {
    WETH: 0.825,
    wstETH: 0.79,
    weETH: 0.75,
    WBTC: 0.78,
    cbBTC: 0.78,
    AAVE: 0.73,
    LINK: 0.7,
    USDC: 0.78,
    USDT: 0.76,
    EURC: 0.75,
    USDG: 0.75,
    frxUSD: 0.75,
    GHO: 0.75,
    RLUSD: 0,
  },
  Bluechip: {
    WETH: 0.86,
    WBTC: 0.82,
    cbBTC: 0.82,
    wstETH: 0.83,
    USDC: 0.8,
    USDT: 0.78,
    EURC: 0,
    GHO: 0.77,
    frxUSD: 0.77,
  },
  "Ethena Correlated": { "PT-USDe-7MAY2026": 0, "PT-sUSDE": 0.91, sUSDe: 0.92, USDe: 0.92 },
  "Ethena Ecosystem": { "PT-sUSDE": 0.78, sUSDe: 0, USDe: 0.8, USDC: 0.78, USDT: 0.77, GHO: 0.77, frxUSD: 0.77 },
  EtherFi: { weETH: 0.93, WETH: 0.9 },
  Forex: { EURC: 0.87, USDC: 0.85, USDT: 0.82, USDG: 0, frxUSD: 0, GHO: 0.82 },
  Gold: { XAUt: 0.75, USDC: 0.78, USDG: 0.78, frxUSD: 0.77, USDT: 0.76, EURC: 0, GHO: 0 },
  Kelp: { rsETH: 0.93, WETH: 0.9 },
  Lido: { wstETH: 0.93, WETH: 0.92 },
  Lombard: { LBTC: 0.8, WBTC: 0 },
};
const getLiquidationThreshold = (name, symbol) => {
  const t = LT_BY_SPOKE[name];
  if (!t) return 0.7;
  return t[symbol] ?? (name === "Lombard" ? 0.7 : 0);
};

const serverEnv = readFileSync(new URL("../../rails-server-onboarding/.env", import.meta.url), "utf8");
const webEnv = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const rpc = (serverEnv.match(/^PONDER_RPC_URL_2=(.+)$/m) || serverEnv.match(/^PONDER_RPC_URL_1=(.+)$/m))[1].trim();
const apiUrl = webEnv.match(/^RAILS_API_URL=(.+)$/m)[1].trim();
const token = webEnv.match(/^API_BEARER_TOKEN=(.+)$/m)[1].trim();
const client = createPublicClient({ chain: mainnet, transport: http(rpc) });

const SPOKES = {
  main: "0x94e7a5dcbe816e498b89ab752661904e2f56c485",
  bluechip: "0x973a023a77420ba610f06b3858ad991df6d85a08",
  ethena_corr: "0x58131e79531cab1d52301228d1f7b842f26b9649",
  ethena_eco: "0xba1b3d55d249692b669a164024a838309b7508af",
  etherfi: "0xbf10bdfe177de0336afd7fccf80a904e15386219",
  forex: "0xd8b93635b8c6d0ff98cbe90b5988e3f2d1cd9da1",
  gold: "0x65407b940966954b23dfa3caa5c0702bb42984dc",
  kelp: "0x3131fe68c4722e726fe6b2819ed68e514395b9a4",
  lido: "0xe1900480ac69f0b296841cd01cc37546d92f35cd",
  lombard: "0x7ec68b5695e803e98a21a9a05d744f28b0a7753d",
};
// server spoke key -> our FE display name (for getLiquidationThreshold lookup)
const KEY_TO_NAME = {
  main: "Main",
  bluechip: "Bluechip",
  ethena_corr: "Ethena Correlated",
  ethena_eco: "Ethena Ecosystem",
  etherfi: "EtherFi",
  forex: "Forex",
  gold: "Gold",
  kelp: "Kelp",
  lido: "Lido",
  lombard: "Lombard",
};
const ACCT_ABI = [
  {
    type: "function",
    name: "getUserAccountData",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "uint256" },
    ],
  },
];

// 1. Pull live positions
const res = await fetch(`${apiUrl}/api/aave-v4/spoke-positions?limit=500`, {
  headers: { Authorization: `Bearer ${token}` },
});
const body = await res.json();
const rows = body.rows ?? [];
console.log(`fetched ${rows.length} positions`);

// 2. single-collateral positions → (spoke, symbol) → sample wallet
const sample = new Map(); // `${spoke}|${symbol}` -> wallet
for (const r of rows) {
  const colls = (r.reserves ?? []).filter((x) => x.isCollateral && BigInt(x.supplyBalanceRaw ?? "0") > 0n);
  if (colls.length !== 1) continue;
  const key = `${r.spoke}|${colls[0].symbol}`;
  if (!sample.has(key)) sample.set(key, r.wallet);
}
console.log(`single-collateral (spoke,asset) pairs found: ${sample.size}`);

// 3. RPC getUserAccountData → avgCollateralFactor = that asset's live LT
const out = [];
for (const [key, wallet] of sample) {
  const [spoke, symbol] = key.split("|");
  try {
    const d = await client.readContract({
      address: SPOKES[spoke],
      abi: ACCT_ABI,
      functionName: "getUserAccountData",
      args: [wallet],
    });
    const chainLt = Number(d[1]) / 1e18; // avgCollateralFactor, 1e18-scaled
    const seeded = getLiquidationThreshold(KEY_TO_NAME[spoke], symbol);
    const drift = chainLt - seeded;
    out.push({
      spoke,
      symbol,
      chainLt: +chainLt.toFixed(4),
      seeded: +seeded.toFixed(4),
      driftBps: Math.round(drift * 10000),
      wallet: wallet.slice(0, 10),
    });
  } catch (e) {
    out.push({ spoke, symbol, error: String(e.shortMessage || e.message).slice(0, 50) });
  }
}
out.sort((a, b) => Math.abs(b.driftBps || 0) - Math.abs(a.driftBps || 0));
console.log(`block ${await client.getBlockNumber()}`);
console.table(out);
