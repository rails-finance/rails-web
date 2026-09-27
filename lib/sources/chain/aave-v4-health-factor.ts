// An Aave V4 position's health factor either side of one block — the spoke's
// getUserAccountData read at the end of block N−1 and at the end of block N.
// The liquidation card's before → after health factor (rails-ops TO-DO-ui-jobs
// §100). SERVER-ONLY.

import { getAddress, parseAbi } from "viem";
import { chainClient } from "./rpc";
import { SPOKE_ADDRESS_BY_KEY, BASE_SPOKE_ADDRESSES, chainIdForSpokeAddress } from "@/lib/aave-v4/spoke-meta";

const ABI = parseAbi([
  "function getUserAccountData(address user) view returns (uint256 riskPremium, uint256 avgCollateralFactor, uint256 healthFactor, uint256 totalCollateralValue, uint256 totalDebtValueRay, uint256 activeCollateralCount, uint256 borrowCount)",
]);

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
}

export interface AaveV4HealthFactorResponse {
  spoke: string;
  wallet: string;
  before: AaveV4HealthFactorAt;
  after: AaveV4HealthFactorAt;
}

export async function loadAaveV4HealthFactorAround(
  spokeAddress: string,
  walletRaw: string,
  block: number,
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
    const [, , healthFactor, , , , borrowCount] = data;
    return { block: at, wad: borrowCount === BigInt(0) || healthFactor >= UINT_MAX ? null : healthFactor.toString() };
  };
  const [before, after] = await Promise.all([read(block - 1), read(block)]);
  return { spoke: address, wallet, before, after };
}
