// An Aave V4 spoke account at a past block, asked of rails-server first.
// ----------------------------------------------------------------------------
// rails-server's `/api/at-block/aave-v4/{spoke-position,health-factor}` read
// the calls the web's two at-block spoke readers make
// (lib/sources/chain/aave-v4-position.ts, aave-v4-health-factor.ts) through
// its at-block store: each call kept once its block is final, keyless
// gateways first (rails-ops decisions/0056). The reads are settled here with
// the readers' own arithmetic (aave-v4-settle.ts) and the web's names.
//
// Null when the route cannot answer: no RAILS_API_URL, a non-2xx answer or 8 s
// without one. The caller then reads the chain as before.
//
// SERVER-ONLY.

import { getAddress } from "viem";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import type { AaveV4SpokePositionChainResponse } from "@/lib/api/fetch-aave-v4-spoke-position";
import type { AaveV4HealthFactorResponse } from "@/lib/sources/chain/aave-v4-health-factor";
import {
  settleHealthFactorAt,
  settleHealthFactorReserve,
  settleSpokePosition,
} from "@/lib/sources/chain/aave-v4-settle";

const TIMEOUT_MS = 8_000;

async function ask<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const api = process.env.RAILS_API_URL;
  if (!api) return null;
  try {
    const qs = new URLSearchParams(params);
    const res = await fetch(`${api}/api/at-block/aave-v4/${path}?${qs.toString()}`, {
      ...createAuthFetchOptions(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as T & { block?: unknown };
    return body && typeof body === "object" && typeof body.block === "number" ? body : null;
  } catch {
    return null;
  }
}

interface SpokePositionReads {
  block: number;
  account: string[];
  reserves: {
    id: number;
    underlying: string;
    hub: string;
    decimals: string;
    supplied: string;
    debt: string;
    isCollateral: boolean;
    hasBorrow: boolean;
    collateralFactor: string;
  }[];
}

/** A spoke position at the end of `block` from rails-server; null where the route cannot answer. */
export async function serverAaveV4SpokePositionAt(
  walletRaw: string,
  spokeKey: string,
  spokeName: string,
  spokeAddress: string,
  block: number,
): Promise<AaveV4SpokePositionChainResponse | null> {
  const raw = await ask<SpokePositionReads>("spoke-position", {
    spoke: spokeAddress.toLowerCase(),
    wallet: walletRaw.toLowerCase(),
    block: String(block),
  });
  if (!raw || raw.block !== block || !Array.isArray(raw.account) || !Array.isArray(raw.reserves)) return null;
  return settleSpokePosition(
    walletRaw,
    spokeKey,
    spokeName,
    block,
    raw.account.map((x) => BigInt(x)),
    raw.reserves.map((r) => ({
      reserveId: r.id,
      underlying: r.underlying,
      hub: r.hub,
      decimals: BigInt(r.decimals),
      supplied: BigInt(r.supplied),
      debt: BigInt(r.debt),
      isCollateral: r.isCollateral,
      hasBorrowFlag: r.hasBorrow,
      collateralFactor: BigInt(r.collateralFactor),
    })),
  );
}

interface HealthFactorReads {
  block: number;
  before: string[];
  after: string[];
  reserve: {
    decimals: string;
    before: { status: [boolean, boolean]; debt: [string, string] };
    after: { status: [boolean, boolean]; debt: [string, string] };
  } | null;
}

/** The health factor either side of `block` from rails-server; null where the route cannot answer. */
export async function serverAaveV4HealthFactorAround(
  spokeAddress: string,
  walletRaw: string,
  block: number,
  underlying?: string,
): Promise<AaveV4HealthFactorResponse | null> {
  const raw = await ask<HealthFactorReads>("health-factor", {
    spoke: spokeAddress.toLowerCase(),
    wallet: walletRaw.toLowerCase(),
    block: String(block),
    ...(underlying ? { underlying } : {}),
  });
  if (!raw || raw.block !== block || !Array.isArray(raw.before) || !Array.isArray(raw.after)) return null;
  const big = (xs: string[]) => xs.map((x) => BigInt(x));
  const r = raw.reserve;
  return {
    spoke: getAddress(spokeAddress),
    wallet: getAddress(walletRaw),
    before: settleHealthFactorAt(block - 1, big(raw.before)),
    after: settleHealthFactorAt(block, big(raw.after)),
    ...(r
      ? settleHealthFactorReserve(
          Number(r.decimals),
          { status: r.before.status, debt: [BigInt(r.before.debt[0]), BigInt(r.before.debt[1])] },
          { status: r.after.status, debt: [BigInt(r.after.debt[0]), BigInt(r.after.debt[1])] },
        )
      : {}),
  };
}
