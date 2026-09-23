// Live Aave V4 spoke position for the chain data-source — the on-chain twin of
// rails-server's /api/aave-v4/spoke-position. A burst of `eth_call`s (Alchemy,
// via lib/sources/chain/rpc) reads the spoke contract's own account/reserve
// state at the latest block, producing the same AaveV4SpokePositionChainResponse
// the indexed route serves. SERVER-ONLY.
//
// This is the chain-state HEADLINE half of the Aave prototyping harness: every
// figure here (health factor, per-asset balances, liquidation thresholds) is a
// direct contract read, no Sieve. The verified spoke ABI (impl
// 0xabd0e2…) exposes getUserAccountData + getReserveCount + getReserve +
// getUserSuppliedAssets/getUserTotalDebt/getUserReserveStatus +
// getDynamicReserveConfig — all read here.

import { parseAbi, getAddress } from "viem";
import { alchemyClient } from "./rpc";
import { TOKEN_ADDR } from "@/lib/aave/prices";
import type { AaveV4SpokeChainReserve, AaveV4SpokePositionChainResponse } from "@/lib/api/fetch-aave-v4-spoke-position";

// Spoke key → { display name, contract address }. Mirrors rails-server-onboarding
// api/src/config/aave-v4-spokes.ts SPOKE_BY_KEY. Treasury has no deployed
// address yet, so it's omitted (an unknown key → chainStale stub below).
// Exported so the event-history loader (lib/sources/chain/aave-v4-events.ts)
// keys off the same spoke→address map as this live-state reader.
export const SPOKES: Record<string, { name: string; address: `0x${string}` }> = {
  main: { name: "Main", address: "0x94e7a5dcbe816e498b89ab752661904e2f56c485" },
  bluechip: { name: "Bluechip", address: "0x973a023a77420ba610f06b3858ad991df6d85a08" },
  ethena_corr: { name: "Ethena Correlated", address: "0x58131e79531cab1d52301228d1f7b842f26b9649" },
  ethena_eco: { name: "Ethena Ecosystem", address: "0xba1b3d55d249692b669a164024a838309b7508af" },
  etherfi: { name: "EtherFi", address: "0xbf10bdfe177de0336afd7fccf80a904e15386219" },
  forex: { name: "Forex", address: "0xd8b93635b8c6d0ff98cbe90b5988e3f2d1cd9da1" },
  gold: { name: "Gold", address: "0x65407b940966954b23dfa3caa5c0702bb42984dc" },
  kelp: { name: "Kelp", address: "0x3131fe68c4722e726fe6b2819ed68e514395b9a4" },
  lido: { name: "Lido", address: "0xe1900480ac69f0b296841cd01cc37546d92f35cd" },
  lombard: { name: "Lombard BTC", address: "0x7ec68b5695e803e98a21a9a05d744f28b0a7753d" },
};

const SPOKE_ABI = parseAbi([
  "function getUserAccountData(address user) view returns (uint256 riskPremium, uint256 avgCollateralFactor, uint256 healthFactor, uint256 totalCollateralValue, uint256 totalDebtValueRay, uint256 activeCollateralCount, uint256 borrowCount)",
  "function getReserveCount() view returns (uint256)",
  "function getReserve(uint256 id) view returns ((address underlying, address hub, uint256 assetId, uint256 decimals, uint256 collateralRisk, uint256 flags, uint32 dynamicConfigKey))",
  "function getDynamicReserveConfig(uint256 id, uint32 key) view returns ((uint256 collateralFactor, uint256 maxLiquidationBonus, uint256 liquidationFee))",
  "function getUserSuppliedAssets(uint256 id, address user) view returns (uint256)",
  "function getUserTotalDebt(uint256 id, address user) view returns (uint256)",
  "function getUserReserveStatus(uint256 id, address user) view returns (bool isCollateral, bool hasBorrow)",
]);

// address (lowercased) → display symbol, reversed from the app's TOKEN_ADDR map.
const SYMBOL_BY_ADDR: Record<string, string> = Object.fromEntries(
  Object.entries(TOKEN_ADDR).map(([sym, addr]) => [addr.toLowerCase(), sym]),
);

// Per-reserve collateralFactor is basis points (8300 = 83%); the response wants
// a 0..1 liquidation threshold.
const BPS = 10_000;

// getUserAccountData returns type(uint256).max for healthFactor when the user
// has no debt; the response expresses that as null.
const UINT_MAX = (BigInt(1) << BigInt(256)) - BigInt(1);

function stub(wallet: string, spokeKey: string, name: string): AaveV4SpokePositionChainResponse {
  return {
    wallet,
    spoke: spokeKey,
    spokeName: name,
    blockNumber: 0,
    healthFactor: null,
    avgCollateralFactor: 0,
    riskPremiumRaw: null,
    supplyAssetCount: 0,
    debtAssetCount: 0,
    chainStale: true,
    reserves: [],
  };
}

/** Read a wallet's live position on one spoke straight from chain. Returns a
 *  `chainStale` stub for an unknown spoke so the page falls back to its
 *  event-derived numbers (same contract as a failed rails-server overlay).
 *
 *  `atBlock` pins every read to the dump's freeze block T so this overlay
 *  reconciles with the frozen DB / getLogs lanes (the verification toggle reads
 *  one instant). Omit it to read the live tip. */
export async function loadAaveV4SpokePositionFromChain(
  walletRaw: string,
  spokeKey: string,
  atBlock?: number,
): Promise<AaveV4SpokePositionChainResponse> {
  const spoke = SPOKES[spokeKey];
  if (!spoke) return stub(walletRaw, spokeKey, spokeKey);

  const client = alchemyClient();
  const wallet = getAddress(walletRaw);
  const address = spoke.address;

  // When pinned, every eth_call/multicall carries blockNumber: T; the response's
  // own blockNumber field reports T rather than the chain head.
  const blockOpt = atBlock != null ? { blockNumber: BigInt(atBlock) } : {};

  const [blockNumber, account, reserveCount] = await Promise.all([
    atBlock != null ? Promise.resolve(BigInt(atBlock)) : client.getBlockNumber(),
    client.readContract({ address, abi: SPOKE_ABI, functionName: "getUserAccountData", args: [wallet], ...blockOpt }),
    client.readContract({ address, abi: SPOKE_ABI, functionName: "getReserveCount", ...blockOpt }),
  ]);
  const [riskPremium, avgCollateralFactor, healthFactor, , , , borrowCount] = account as readonly bigint[];
  const count = Number(reserveCount);

  // Phase 1 — per-reserve metadata + this user's balances, batched via multicall.
  const ids = Array.from({ length: count }, (_, i) => BigInt(i));
  const meta = (await client.multicall({
    allowFailure: false,
    ...blockOpt,
    contracts: ids.flatMap((id) => [
      { address, abi: SPOKE_ABI, functionName: "getReserve", args: [id] } as const,
      { address, abi: SPOKE_ABI, functionName: "getUserSuppliedAssets", args: [id, wallet] } as const,
      { address, abi: SPOKE_ABI, functionName: "getUserTotalDebt", args: [id, wallet] } as const,
      { address, abi: SPOKE_ABI, functionName: "getUserReserveStatus", args: [id, wallet] } as const,
    ]),
  })) as unknown[];

  const reserves: AaveV4SpokeChainReserve[] = [];
  let supplyAssetCount = 0;
  let debtAssetCount = 0;
  // Collect (id, dynamicConfigKey) for reserves this user actually touches, to
  // batch their LT reads in phase 2.
  const ltTargets: { reserveId: number; key: number; idx: number }[] = [];

  for (let i = 0; i < count; i++) {
    const r = meta[i * 4] as { underlying: string; decimals: bigint; dynamicConfigKey: number };
    const supplied = meta[i * 4 + 1] as bigint;
    const debt = meta[i * 4 + 2] as bigint;
    const status = meta[i * 4 + 3] as readonly [boolean, boolean];
    if (supplied === BigInt(0) && debt === BigInt(0) && !status[0]) continue;

    const addr = r.underlying.toLowerCase();
    const symbol = SYMBOL_BY_ADDR[addr] ?? `${r.underlying.slice(0, 6)}…${r.underlying.slice(-4)}`;
    const hasBorrow = status[1] || debt > BigInt(0);
    if (supplied > BigInt(0)) supplyAssetCount++;
    if (hasBorrow) debtAssetCount++;

    reserves.push({
      reserveId: i,
      address: addr,
      symbol,
      decimals: Number(r.decimals),
      supplyBalanceRaw: supplied.toString(),
      debtBalanceRaw: debt.toString(),
      isCollateral: status[0],
      hasBorrow,
      lt: null, // filled in phase 2
    });
    ltTargets.push({ reserveId: i, key: Number(r.dynamicConfigKey), idx: reserves.length - 1 });
  }

  // Phase 2 — liquidation thresholds for the touched reserves only.
  if (ltTargets.length > 0) {
    const cfgs = (await client.multicall({
      allowFailure: false,
      ...blockOpt,
      contracts: ltTargets.map(
        (t) =>
          ({
            address,
            abi: SPOKE_ABI,
            functionName: "getDynamicReserveConfig",
            args: [BigInt(t.reserveId), t.key],
          }) as const,
      ),
    })) as { collateralFactor: bigint }[];
    cfgs.forEach((cfg, k) => {
      reserves[ltTargets[k].idx].lt = Number(cfg.collateralFactor) / BPS;
    });
  }

  return {
    wallet,
    spoke: spokeKey,
    spokeName: spoke.name,
    blockNumber: Number(blockNumber),
    healthFactor: borrowCount === BigInt(0) || healthFactor >= UINT_MAX ? null : Number(healthFactor) / 1e18,
    avgCollateralFactor: Number(avgCollateralFactor) / 1e18,
    riskPremiumRaw: riskPremium.toString(),
    supplyAssetCount,
    debtAssetCount,
    chainStale: false,
    reserves,
  };
}
