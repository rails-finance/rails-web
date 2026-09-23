// Discovery for the cross-hub comparison tool (doc aave-v4-hub-comparison.md).
// 1. Enumerate each spoke's reserves via getReserveCount + getReserve(id) → the
//    (spoke, hubAddress, assetId, underlying, decimals) tuples. The spokes tell
//    us which (hub, assetId, spoke) combinations exist — no separate hub-asset
//    enumeration needed.
// 2. Identify the 3 distinct hub addresses (anchor main=Core, bluechip=Prime).
// 3. For a sample of (hub, assetId, spoke), call getSpokeConfig + the usage
//    getters to confirm return shapes and cap units (esp. non-18-dp assets).
// Read-only. Reads RPC from the sibling server .env; never prints secrets.

import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../../rails-server-onboarding/.env", import.meta.url), "utf8");
const rpc = env.match(/^PONDER_RPC_URL_2=(.+)$/m)[1].trim();
const c = createPublicClient({ chain: mainnet, transport: http(rpc) });

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

const SPOKE_ABI = [
  {
    type: "function",
    name: "getReserveCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getReserve",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [
      { name: "underlying", type: "address" },
      { name: "hub", type: "address" },
      { name: "assetId", type: "uint16" },
      { name: "decimals", type: "uint8" },
      { name: "collateralRisk", type: "uint24" },
      { name: "flags", type: "uint8" },
      { name: "dynamicConfigKey", type: "uint32" },
    ],
  },
];

const ERC20_ABI = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
];

const HUB_ABI = [
  {
    type: "function",
    name: "getSpokeConfig",
    stateMutability: "view",
    inputs: [{ type: "uint256" }, { type: "address" }],
    outputs: [
      { name: "addCap", type: "uint40" },
      { name: "drawCap", type: "uint40" },
      { name: "riskPremiumThreshold", type: "uint24" },
      { name: "active", type: "bool" },
      { name: "halted", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "getSpokeTotalOwed",
    stateMutability: "view",
    inputs: [{ type: "uint256" }, { type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getSpokeAddedAssets",
    stateMutability: "view",
    inputs: [{ type: "uint256" }, { type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getSpokeAddedShares",
    stateMutability: "view",
    inputs: [{ type: "uint256" }, { type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getSpokeDrawnShares",
    stateMutability: "view",
    inputs: [{ type: "uint256" }, { type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getSpokeOwed",
    stateMutability: "view",
    inputs: [{ type: "uint256" }, { type: "address" }],
    outputs: [{ type: "uint256" }, { type: "uint256" }],
  },
  {
    type: "function",
    name: "MAX_ALLOWED_SPOKE_CAP",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
];

// 1. Enumerate reserves per spoke.
const tuples = []; // { spoke, hub, assetId, underlying, decimals, symbol }
const symCache = new Map();
async function symOf(addr) {
  const k = addr.toLowerCase();
  if (symCache.has(k)) return symCache.get(k);
  let s = "?";
  try {
    s = await c.readContract({ address: addr, abi: ERC20_ABI, functionName: "symbol" });
  } catch {}
  symCache.set(k, s);
  return s;
}

for (const [spoke, addr] of Object.entries(SPOKES)) {
  let count = 0n;
  try {
    count = await c.readContract({ address: addr, abi: SPOKE_ABI, functionName: "getReserveCount" });
  } catch (e) {
    console.log(`  ${spoke}: getReserveCount failed`);
    continue;
  }
  for (let id = 0n; id < count; id++) {
    try {
      const r = await c.readContract({ address: addr, abi: SPOKE_ABI, functionName: "getReserve", args: [id] });
      const sym = await symOf(r[0]);
      tuples.push({
        spoke,
        hub: r[1].toLowerCase(),
        assetId: Number(r[2]),
        underlying: r[0].toLowerCase(),
        decimals: Number(r[3]),
        symbol: sym,
        reserveId: Number(id),
      });
    } catch {}
  }
}

const hubAddrs = [...new Set(tuples.map((t) => t.hub))];
const coreAddr = tuples.find((t) => t.spoke === "main")?.hub;
const primeAddr = tuples.find((t) => t.spoke === "bluechip")?.hub;
const plusAddr = hubAddrs.find((h) => h !== coreAddr && h !== primeAddr);
const TIER = { [coreAddr]: "Core", [primeAddr]: "Prime", [plusAddr]: "Plus" };

console.log("\n=== HUB ADDRESSES ===");
console.log("Core ", coreAddr);
console.log("Plus ", plusAddr);
console.log("Prime", primeAddr);
console.log(`(${hubAddrs.length} distinct hubs)`);

console.log("\n=== (hub, assetId, spoke, symbol, decimals) tuples ===");
for (const t of tuples) {
  console.log(
    `${(TIER[t.hub] ?? "?").padEnd(5)} asset#${String(t.assetId).padStart(2)} ${t.spoke.padEnd(12)} ${t.symbol.padEnd(8)} dp=${t.decimals}`,
  );
}

// 2. MAX cap from Core.
try {
  const maxCap = await c.readContract({ address: coreAddr, abi: HUB_ABI, functionName: "MAX_ALLOWED_SPOKE_CAP" });
  console.log("\nMAX_ALLOWED_SPOKE_CAP =", maxCap.toString());
} catch (e) {
  console.log("\nMAX_ALLOWED_SPOKE_CAP failed:", e.shortMessage ?? e.message);
}

// 3. Probe getSpokeConfig + usage getters for a spread of tuples, incl. a
//    non-18-dp asset (BTC=8, USDC=6) to confirm the cap unit assumption.
console.log("\n=== getSpokeConfig + usage probe ===");
const sample = tuples
  .filter((t) => t.spoke === "main" || t.symbol.includes("BTC") || t.symbol.includes("USD") || t.symbol === "PYUSD")
  .slice(0, 14);

for (const t of sample) {
  const hub = t.hub;
  const args = [BigInt(t.assetId), SPOKES[t.spoke]];
  try {
    const cfg = await c.readContract({ address: hub, abi: HUB_ABI, functionName: "getSpokeConfig", args });
    const added = await c
      .readContract({ address: hub, abi: HUB_ABI, functionName: "getSpokeAddedAssets", args })
      .catch(() => null);
    const owed = await c
      .readContract({ address: hub, abi: HUB_ABI, functionName: "getSpokeTotalOwed", args })
      .catch(() => null);
    const drawnShares = await c
      .readContract({ address: hub, abi: HUB_ABI, functionName: "getSpokeDrawnShares", args })
      .catch(() => null);
    console.log(
      `${TIER[hub]} ${t.spoke}/${t.symbol} (asset#${t.assetId}, dp=${t.decimals}): ` +
        `addCap=${cfg[0]} drawCap=${cfg[1]} rpThresh=${cfg[2]} active=${cfg[3]} halted=${cfg[4]} | ` +
        `addedAssets=${added} totalOwed=${owed} drawnShares=${drawnShares}`,
    );
  } catch (e) {
    console.log(`${TIER[hub] ?? "?"} ${t.spoke}/${t.symbol}: getSpokeConfig FAILED — ${e.shortMessage ?? e.message}`);
  }
}
console.log("\ndone.");
