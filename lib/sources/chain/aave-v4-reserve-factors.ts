// Each Aave V4 reserve's collateral factor as its spoke sets it now — the
// figure the hub comparison's LT column shows. SERVER-ONLY.
//
// A reserve's live terms sit under its current dynamic config key
// (getReserve(id).dynamicConfigKey); getDynamicReserveConfig(id, key) gives
// the collateral factor in basis points. 0 means the spoke does not count the
// asset as collateral. A position keeps the key it last took, so an older
// position can carry an earlier factor (Kelp rsETH: 95% on key 0, 0% on the
// current key 1 since governance froze the spoke) — that figure is read per
// position in aave-v4-position.ts.
//
// The indexed /api/aave-v4/hubs payload carries a harvested LT instead, which
// never records a 0 and so keeps a hand-seeded figure for every borrow-only
// listing (Bluechip USDC 0.80 where the spoke reads 0; rails-ops
// TO-DO-ui-jobs item 103). The hubs route overlays this read on it.

import { getAddress, parseAbi } from "viem";
import { alchemyClient } from "./rpc";
import { SPOKE_ADDRESS_BY_KEY } from "@/lib/aave-v4/spoke-meta";
import { HUB_KEY_BY_ADDR } from "./aave-v4-position";

const ABI = parseAbi([
  "function getReserveCount() view returns (uint256)",
  "function getReserve(uint256 id) view returns ((address underlying, address hub, uint256 assetId, uint256 decimals, uint256 collateralRisk, uint256 flags, uint32 dynamicConfigKey))",
  "function getDynamicReserveConfig(uint256 id, uint32 key) view returns ((uint256 collateralFactor, uint256 maxLiquidationBonus, uint256 liquidationFee))",
]);

const BPS = 10_000;

export interface AaveV4ReserveFactors {
  blockNumber: number;
  /** `${spokeKey}|${hubKey}|${assetId}` → collateral factor as a fraction. */
  bySpokeHubAsset: Map<string, number>;
}

export const reserveFactorKey = (spoke: string, hub: string, assetId: number) => `${spoke}|${hub}|${assetId}`;

// Governance changes these rarely; one read serves every request for a while.
const TTL_MS = 5 * 60_000;
let cached: { at: number; value: Promise<AaveV4ReserveFactors> } | null = null;

export function loadAaveV4ReserveFactors(): Promise<AaveV4ReserveFactors> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const value = read();
  cached = { at: Date.now(), value };
  value.catch(() => {
    if (cached?.value === value) cached = null;
  });
  return value;
}

async function read(): Promise<AaveV4ReserveFactors> {
  const client = alchemyClient();
  const blockNumber = await client.getBlockNumber();
  const spokes = Object.entries(SPOKE_ADDRESS_BY_KEY).map(([key, a]) => ({ key, address: getAddress(a) }));

  const counts = (await client.multicall({
    allowFailure: false,
    blockNumber,
    contracts: spokes.map((s) => ({ address: s.address, abi: ABI, functionName: "getReserveCount" }) as const),
  })) as bigint[];

  const ids = spokes.flatMap((s, i) =>
    Array.from({ length: Number(counts[i]) }, (_, id) => ({ spoke: s.key, address: s.address, id: BigInt(id) })),
  );
  const reserves = (await client.multicall({
    allowFailure: false,
    blockNumber,
    contracts: ids.map((r) => ({ address: r.address, abi: ABI, functionName: "getReserve", args: [r.id] }) as const),
  })) as { hub: string; assetId: bigint; dynamicConfigKey: number }[];
  const configs = (await client.multicall({
    allowFailure: false,
    blockNumber,
    contracts: ids.map(
      (r, i) =>
        ({
          address: r.address,
          abi: ABI,
          functionName: "getDynamicReserveConfig",
          args: [r.id, reserves[i].dynamicConfigKey],
        }) as const,
    ),
  })) as { collateralFactor: bigint }[];

  const bySpokeHubAsset = new Map<string, number>();
  ids.forEach((r, i) => {
    const hub = HUB_KEY_BY_ADDR[reserves[i].hub.toLowerCase()];
    if (!hub) return;
    bySpokeHubAsset.set(
      reserveFactorKey(r.spoke, hub, Number(reserves[i].assetId)),
      Number(configs[i].collateralFactor) / BPS,
    );
  });
  return { blockNumber: Number(blockNumber), bySpokeHubAsset };
}
