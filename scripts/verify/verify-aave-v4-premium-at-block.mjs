// Aave V4: the drawn-debt receipt states the position's premium as read at the
// block (rails-ops TO-DO-ui-jobs §235).
// ----------------------------------------------------------------------------
// The receipt reads the premium from /api/chain/aave-v4/health-factor, the read
// the opened card already makes: each end carries getUserAccountData.riskPremium
// (bps) and, for the asked-for reserve, getUserDebt's premium debt. This checks
// the route answers both, and that they equal the spoke's own reads at the same
// blocks, taken here straight from the chain (ALCHEMY_URL).
//
//   node --env-file=.env.local scripts/verify/verify-aave-v4-premium-at-block.mjs
//   BASE=http://localhost:3000 node --env-file=.env.local scripts/verify/…

import { createPublicClient, formatUnits, http, parseAbi } from "viem";
import { mainnet } from "viem/chains";
import { BASE, hostFetch } from "./lib/host.mjs";

// A USDC borrow on the Main spoke (reserve 7, 6 decimals).
const FIXTURES = [
  {
    name: "main USDC borrow",
    spoke: "0x94e7a5dcbe816e498b89ab752661904e2f56c485",
    wallet: "0x9836a25f745d57430ae2f5d178616ad54f21f636",
    block: 26105490,
    asset: "USDC",
    reserveId: 7,
    decimals: 6,
  },
];

const ABI = parseAbi([
  "function getUserAccountData(address user) view returns (uint256 riskPremium, uint256 avgCollateralFactor, uint256 healthFactor, uint256 totalCollateralValue, uint256 totalDebtValueRay, uint256 activeCollateralCount, uint256 borrowCount)",
  "function getUserDebt(uint256 id, address user) view returns (uint256 drawnDebt, uint256 premiumDebt)",
]);

if (!process.env.ALCHEMY_URL) {
  console.error("ALCHEMY_URL is not set (run with node --env-file=.env.local)");
  process.exit(2);
}
const client = createPublicClient({ chain: mainnet, transport: http(process.env.ALCHEMY_URL) });

let passed = 0;
let failed = 0;
const check = (ok, label, detail = "") => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
};

for (const f of FIXTURES) {
  const url = `${BASE}/api/chain/aave-v4/health-factor?spoke=${f.spoke}&wallet=${f.wallet}&block=${f.block}&asset=${f.asset}`;
  const res = await hostFetch(url);
  check(res.ok, `${f.name}: route answers`, `HTTP ${res.status}`);
  if (!res.ok) continue;
  const d = await res.json();
  for (const [end, at] of [
    ["before", f.block - 1],
    ["after", f.block],
  ]) {
    const [account, debt] = await Promise.all([
      client.readContract({
        address: f.spoke,
        abi: ABI,
        functionName: "getUserAccountData",
        args: [f.wallet],
        blockNumber: BigInt(at),
      }),
      client.readContract({
        address: f.spoke,
        abi: ABI,
        functionName: "getUserDebt",
        args: [BigInt(f.reserveId), f.wallet],
        blockNumber: BigInt(at),
      }),
    ]);
    const bps = Number(account[0]);
    const premiumDebt = formatUnits(debt[1], f.decimals);
    check(
      d[end]?.riskPremiumBps === bps,
      `${f.name}: ${end} riskPremiumBps equals the spoke at block ${at}`,
      `route ${d[end]?.riskPremiumBps}, chain ${bps}`,
    );
    check(
      d.premiumDebt?.[end] === premiumDebt,
      `${f.name}: ${end} premium debt equals getUserDebt at block ${at}`,
      `route ${d.premiumDebt?.[end]}, chain ${premiumDebt}`,
    );
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 || passed === 0 ? 1 : 0);
