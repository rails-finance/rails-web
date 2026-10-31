// The Aave V4 at-block readers' arithmetic, apart from where the contract
// reads came from: the web's own chain read (aave-v4-position.ts,
// aave-v4-health-factor.ts) or rails-server's read of the same calls through
// its at-block store (lib/sources/api/aave-v4-at-block.ts). Both paths settle
// through these, so an answer from either is the same for the same reads.
//
// SERVER-ONLY.

import { formatUnits, getAddress } from "viem";
import { TOKEN_ADDR } from "@/lib/aave/prices";
import type { AaveV4SpokeChainReserve, AaveV4SpokePositionChainResponse } from "@/lib/api/fetch-aave-v4-spoke-position";
import type { AaveV4HealthFactorAt } from "./aave-v4-health-factor";

// address (lowercased) → display symbol, reversed from the app's TOKEN_ADDR map.
const SYMBOL_BY_ADDR: Record<string, string> = Object.fromEntries(
  Object.entries(TOKEN_ADDR).map(([sym, addr]) => [addr.toLowerCase(), sym]),
);

// Hub contract (lowercased) → the hub key the server sends on each reserve.
// Addresses from rails-server-onboarding sieve/sieve.toml AaveV4Hub_*.
export const HUB_KEY_BY_ADDR: Record<string, string> = {
  "0xcca852bc40e560adc3b1cc58ca5b55638ce826c9": "core",
  "0x06002e9c4412cb7814a791ea3666d905871e536a": "plus",
  "0x943827dca022d0f354a8a8c332da1e5eb9f9f931": "prime",
  "0x62d63197660c080236193ca60b70e49a08e90368": "paxos",
};

// Per-reserve collateralFactor is basis points (8300 = 83%); the response wants
// a 0..1 liquidation threshold.
const BPS = 10_000;

// getUserAccountData returns type(uint256).max for healthFactor when the user
// has no debt; the response expresses that as null.
const UINT_MAX = (BigInt(1) << BigInt(256)) - BigInt(1);

/** One reserve the wallet touches, as read. */
export interface TouchedReserveRead {
  reserveId: number;
  underlying: string;
  hub: string;
  decimals: bigint;
  supplied: bigint;
  debt: bigint;
  isCollateral: boolean;
  hasBorrowFlag: boolean;
  /** The collateral factor (bps) at the position's dynamic config key. */
  collateralFactor: bigint;
}

/** A spoke position from its reads: getUserAccountData's seven figures and the touched reserves. */
export function settleSpokePosition(
  walletRaw: string,
  spokeKey: string,
  spokeName: string,
  blockNumber: number,
  account: readonly bigint[],
  touched: TouchedReserveRead[],
): AaveV4SpokePositionChainResponse {
  const [riskPremium, avgCollateralFactor, healthFactor, , , , borrowCount] = account;
  const reserves: AaveV4SpokeChainReserve[] = [];
  let supplyAssetCount = 0;
  let debtAssetCount = 0;
  for (const t of touched) {
    const addr = t.underlying.toLowerCase();
    const symbol = SYMBOL_BY_ADDR[addr] ?? `${t.underlying.slice(0, 6)}…${t.underlying.slice(-4)}`;
    const hasBorrow = t.hasBorrowFlag || t.debt > BigInt(0);
    if (t.supplied > BigInt(0)) supplyAssetCount++;
    if (hasBorrow) debtAssetCount++;
    reserves.push({
      reserveId: t.reserveId,
      address: addr,
      symbol,
      decimals: Number(t.decimals),
      supplyBalanceRaw: t.supplied.toString(),
      debtBalanceRaw: t.debt.toString(),
      isCollateral: t.isCollateral,
      hasBorrow,
      lt: Number(t.collateralFactor) / BPS,
      hub: HUB_KEY_BY_ADDR[t.hub.toLowerCase()] ?? null,
    });
  }
  return {
    wallet: getAddress(walletRaw),
    spoke: spokeKey,
    spokeName,
    blockNumber,
    healthFactor: borrowCount === BigInt(0) || healthFactor >= UINT_MAX ? null : Number(healthFactor) / 1e18,
    avgCollateralFactor: Number(avgCollateralFactor) / 1e18,
    riskPremiumRaw: riskPremium.toString(),
    supplyAssetCount,
    debtAssetCount,
    chainStale: false,
    reserves,
  };
}

/** One side of the health-factor read from getUserAccountData's seven figures. */
export function settleHealthFactorAt(block: number, data: readonly bigint[]): AaveV4HealthFactorAt {
  const [riskPremium, avgCollateralFactor, healthFactor, , , activeCollateralCount, borrowCount] = data;
  return {
    block,
    wad: borrowCount === BigInt(0) || healthFactor >= UINT_MAX ? null : healthFactor.toString(),
    collateralFactor: activeCollateralCount === BigInt(0) ? null : Number(avgCollateralFactor) / 1e18,
    collateralCount: Number(activeCollateralCount),
    riskPremiumBps: Number(riskPremium),
  };
}

/** The asked reserve's collateral flag and premium debt either side. */
export function settleHealthFactorReserve(
  decimals: number,
  before: { status: readonly [boolean, boolean]; debt: readonly [bigint, bigint] },
  after: { status: readonly [boolean, boolean]; debt: readonly [bigint, bigint] },
) {
  return {
    collateral: { before: before.status[0], after: after.status[0] },
    premiumDebt: { before: formatUnits(before.debt[1], decimals), after: formatUnits(after.debt[1], decimals) },
  };
}
