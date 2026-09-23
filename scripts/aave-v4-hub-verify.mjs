// Verify SPOKE_HUB (per-spoke -> hub tier) against chain. getReserve(id)
// returns the reserve's hub address; a spoke's reserves all sit in its hub.
// Anchor hub addresses to tiers via Aave's own naming examples ("Main Core",
// "Bluechip Prime"); the third distinct hub is Plus by elimination.
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
// our current SPOKE_HUB (display-name keyed, mapped to spoke keys here)
const OUR = {
  main: "Core",
  forex: "Core",
  gold: "Core",
  ethena_corr: "Plus",
  ethena_eco: "Plus",
  etherfi: "Plus",
  kelp: "Plus",
  lido: "Plus",
  lombard: "Plus",
  bluechip: "Prime",
};
// reserve_ids per spoke (migration 012/026/030), to read each reserve's hub
const IDS = {
  main: [0, 1, 5, 7],
  bluechip: [0, 4],
  ethena_corr: [2, 3],
  ethena_eco: [2, 4],
  etherfi: [0],
  forex: [0, 1],
  gold: [0, 1],
  kelp: [0],
  lido: [0],
  lombard: [0],
};
const ABI = [
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

const spokeHubAddr = {};
for (const [spoke, addr] of Object.entries(SPOKES)) {
  const hubs = new Set();
  for (const id of IDS[spoke]) {
    try {
      const r = await c.readContract({ address: addr, abi: ABI, functionName: "getReserve", args: [BigInt(id)] });
      hubs.add(r[1].toLowerCase());
    } catch {
      /* skip */
    }
  }
  spokeHubAddr[spoke] = [...hubs];
}

// Anchor address -> tier: main=Core, bluechip=Prime, remaining distinct=Plus
const coreAddr = spokeHubAddr.main[0];
const primeAddr = spokeHubAddr.bluechip[0];
const allHubs = new Set(Object.values(spokeHubAddr).flat());
const plusAddr = [...allHubs].find((h) => h !== coreAddr && h !== primeAddr);
const tierOf = (h) => (h === coreAddr ? "Core" : h === primeAddr ? "Prime" : h === plusAddr ? "Plus" : "UNKNOWN");

console.log("block", (await c.getBlockNumber()).toString());
console.log("hub addresses:", { Core: coreAddr, Plus: plusAddr, Prime: primeAddr });
const rows = Object.entries(spokeHubAddr).map(([spoke, hubs]) => {
  const tiers = [...new Set(hubs.map(tierOf))];
  const chain = tiers.length === 1 ? tiers[0] : tiers.join("+");
  return { spoke, chainHub: chain, ourHub: OUR[spoke], match: chain === OUR[spoke] ? "ok" : "*** MISMATCH ***" };
});
console.table(rows);
