// An Aave V4 position's health factor either side of one block — the spoke's
// getUserAccountData read at the end of block N−1 and at the end of block N.
// The liquidation card's before → after health factor (rails-ops TO-DO-ui-jobs
// §100). SERVER-ONLY.

import { getAddress, parseAbi } from "viem";
import { chainClient } from "./rpc";
import { SPOKE_ADDRESS_BY_KEY, BASE_SPOKE_ADDRESSES, chainIdForSpokeAddress } from "@/lib/aave-v4/spoke-meta";
import { TOKEN_ADDR } from "@/lib/aave/prices";

const ABI = parseAbi([
  "function getUserAccountData(address user) view returns (uint256 riskPremium, uint256 avgCollateralFactor, uint256 healthFactor, uint256 totalCollateralValue, uint256 totalDebtValueRay, uint256 activeCollateralCount, uint256 borrowCount)",
  "function getReserveCount() view returns (uint256)",
  "function getReserve(uint256 id) view returns ((address underlying, address hub, uint256 assetId, uint256 decimals, uint256 collateralRisk, uint256 flags, uint32 dynamicConfigKey))",
  "function getUserReserveStatus(uint256 id, address user) view returns (bool isCollateral, bool hasBorrow)",
]);

// (spoke, underlying) → reserve id. A spoke's reserve list only grows, so an id
// once found never changes.
const reserveIds = new Map<string, number>();

// getUserAccountData answers type(uint256).max when the account has no debt.
const UINT_MAX = (BigInt(1) << BigInt(256)) - BigInt(1);

const KNOWN_SPOKES = new Set<string>([
  ...Object.values(SPOKE_ADDRESS_BY_KEY).map((a) => a.toLowerCase()),
  ...BASE_SPOKE_ADDRESSES,
]);

export function isKnownAaveV4Spoke(address: string): boolean {
  return KNOWN_SPOKES.has(address.toLowerCase());
}

export interface AaveV4HealthFactorAt {
  block: number;
  /** The raw 18-decimal figure, as a decimal string; null when the account had no debt. */
  wad: string | null;
  /** getUserAccountData.avgCollateralFactor as a fraction (0.92): the
   *  collateral factor of the position's collateral, value-weighted when it
   *  holds more than one. Null where it held no collateral. */
  collateralFactor?: number | null;
  /** How many reserves counted as collateral (activeCollateralCount). */
  collateralCount?: number;
}

export interface AaveV4HealthFactorResponse {
  spoke: string;
  wallet: string;
  before: AaveV4HealthFactorAt;
  after: AaveV4HealthFactorAt;
  /** Whether the asked-for reserve counted as this wallet's collateral at the
   *  end of block N−1 and of block N (getUserReserveStatus). Absent when no
   *  `asset` was asked for or its reserve could not be found on the spoke. */
  collateral?: { before: boolean; after: boolean };
}

export async function loadAaveV4HealthFactorAround(
  spokeAddress: string,
  walletRaw: string,
  block: number,
  assetSymbol?: string,
): Promise<AaveV4HealthFactorResponse> {
  const address = getAddress(spokeAddress);
  const wallet = getAddress(walletRaw);
  const client = chainClient(chainIdForSpokeAddress(address));
  const read = async (at: number): Promise<AaveV4HealthFactorAt> => {
    const data = (await client.readContract({
      address,
      abi: ABI,
      functionName: "getUserAccountData",
      args: [wallet],
      blockNumber: BigInt(at),
    })) as readonly bigint[];
    const [, avgCollateralFactor, healthFactor, , , activeCollateralCount, borrowCount] = data;
    return {
      block: at,
      wad: borrowCount === BigInt(0) || healthFactor >= UINT_MAX ? null : healthFactor.toString(),
      collateralFactor: activeCollateralCount === BigInt(0) ? null : Number(avgCollateralFactor) / 1e18,
      collateralCount: Number(activeCollateralCount),
    };
  };
  const findReserve = async (): Promise<number | null> => {
    const underlying = assetSymbol ? TOKEN_ADDR[assetSymbol]?.toLowerCase() : undefined;
    if (!underlying) return null;
    const key = `${address}:${underlying}`;
    const known = reserveIds.get(key);
    if (known != null) return known;
    const count = Number(
      await client.readContract({ address, abi: ABI, functionName: "getReserveCount", blockNumber: BigInt(block) }),
    );
    const reserves = (await client.multicall({
      allowFailure: false,
      blockNumber: BigInt(block),
      contracts: Array.from(
        { length: count },
        (_, i) => ({ address, abi: ABI, functionName: "getReserve", args: [BigInt(i)] }) as const,
      ),
    })) as { underlying: string }[];
    const id = reserves.findIndex((r) => r.underlying.toLowerCase() === underlying);
    if (id < 0) return null;
    reserveIds.set(key, id);
    return id;
  };
  const readCollateral = async (): Promise<AaveV4HealthFactorResponse["collateral"]> => {
    const id = await findReserve();
    if (id == null) return undefined;
    const status = (at: number) =>
      client.readContract({
        address,
        abi: ABI,
        functionName: "getUserReserveStatus",
        args: [BigInt(id), wallet],
        blockNumber: BigInt(at),
      }) as Promise<readonly [boolean, boolean]>;
    const [b, a] = await Promise.all([status(block - 1), status(block)]);
    return { before: b[0], after: a[0] };
  };
  const [before, after, collateral] = await Promise.all([
    read(block - 1),
    read(block),
    readCollateral().catch(() => undefined),
  ]);
  return collateral ? { spoke: address, wallet, before, after, collateral } : { spoke: address, wallet, before, after };
}
