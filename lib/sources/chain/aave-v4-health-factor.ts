// An Aave V4 position's health factor either side of one block — the spoke's
// getUserAccountData read at the end of block N−1 and at the end of block N.
// The liquidation card's before → after health factor (rails-ops TO-DO-ui-jobs
// §100). SERVER-ONLY.

import { formatUnits, getAddress, parseAbi } from "viem";
import { chainClient } from "./rpc";
import { SPOKE_ADDRESS_BY_KEY, BASE_SPOKE_ADDRESSES, chainIdForSpokeAddress } from "@/lib/aave-v4/spoke-meta";
import { TOKEN_ADDR } from "@/lib/aave/prices";

const ABI = parseAbi([
  "function getUserAccountData(address user) view returns (uint256 riskPremium, uint256 avgCollateralFactor, uint256 healthFactor, uint256 totalCollateralValue, uint256 totalDebtValueRay, uint256 activeCollateralCount, uint256 borrowCount)",
  "function getReserveCount() view returns (uint256)",
  "function getReserve(uint256 id) view returns ((address underlying, address hub, uint256 assetId, uint256 decimals, uint256 collateralRisk, uint256 flags, uint32 dynamicConfigKey))",
  "function getUserReserveStatus(uint256 id, address user) view returns (bool isCollateral, bool hasBorrow)",
  "function getUserDebt(uint256 id, address user) view returns (uint256 drawnDebt, uint256 premiumDebt)",
]);

// (spoke, underlying) → reserve id and token decimals. A spoke's reserve list
// only grows, so an id once found never changes.
const reserveIds = new Map<string, { id: number; decimals: number }>();

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
  /** getUserAccountData.riskPremium, in basis points: the position's risk
   *  premium at that block. */
  riskPremiumBps?: number;
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
  /** The premium debt on the asked-for reserve at the end of block N−1 and of
   *  block N, in token units (getUserDebt's second figure). Absent where
   *  `collateral` is. */
  premiumDebt?: { before: string; after: string };
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
    const [riskPremium, avgCollateralFactor, healthFactor, , , activeCollateralCount, borrowCount] = data;
    return {
      block: at,
      wad: borrowCount === BigInt(0) || healthFactor >= UINT_MAX ? null : healthFactor.toString(),
      collateralFactor: activeCollateralCount === BigInt(0) ? null : Number(avgCollateralFactor) / 1e18,
      collateralCount: Number(activeCollateralCount),
      riskPremiumBps: Number(riskPremium),
    };
  };
  const findReserve = async (): Promise<{ id: number; decimals: number } | null> => {
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
    })) as { underlying: string; decimals: bigint }[];
    const id = reserves.findIndex((r) => r.underlying.toLowerCase() === underlying);
    if (id < 0) return null;
    const found = { id, decimals: Number(reserves[id].decimals) };
    reserveIds.set(key, found);
    return found;
  };
  // The reserve's collateral flag and premium debt either side of the block.
  const readReserve = async (): Promise<Pick<AaveV4HealthFactorResponse, "collateral" | "premiumDebt"> | undefined> => {
    const reserve = await findReserve();
    if (reserve == null) return undefined;
    const id = BigInt(reserve.id);
    const at = (n: number) =>
      Promise.all([
        client.readContract({
          address,
          abi: ABI,
          functionName: "getUserReserveStatus",
          args: [id, wallet],
          blockNumber: BigInt(n),
        }) as Promise<readonly [boolean, boolean]>,
        client.readContract({
          address,
          abi: ABI,
          functionName: "getUserDebt",
          args: [id, wallet],
          blockNumber: BigInt(n),
        }) as Promise<readonly [bigint, bigint]>,
      ]);
    const [[sb, db], [sa, da]] = await Promise.all([at(block - 1), at(block)]);
    return {
      collateral: { before: sb[0], after: sa[0] },
      premiumDebt: { before: formatUnits(db[1], reserve.decimals), after: formatUnits(da[1], reserve.decimals) },
    };
  };
  const [before, after, reserve] = await Promise.all([
    read(block - 1),
    read(block),
    readReserve().catch(() => undefined),
  ]);
  return { spoke: address, wallet, before, after, ...reserve };
}
