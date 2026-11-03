import { NextRequest, NextResponse } from "next/server";
import { accountSwitchesRoute } from "@/lib/sources/chain/aave-family-account-switches";
import { proxyAccountSwitches, type AccountSwitchesLane } from "@/lib/api/aave-family-account-switches";
import { AAVE_V3_MARKETS, type AaveV3MarketKey } from "@/lib/aave-v3/asset-catalog";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// An Aave V3 Ethereum account's e-mode changes and the reserves it ever turned
// on as collateral, per market (?market=core|prime|etherfi), from rails-server
// (lib/api/aave-family-account-switches.ts: the mainnet Sieve's rows to its
// checkpoint, the chain past it); where rails-server cannot answer, from that
// market's Pool logs (lib/sources/chain/aave-family-account-switches.ts). The
// index's timeline rows carry neither.
//
// Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** At or below each Pool's first block (rails-server sieve/sieve.toml names
 *  Prime's and EtherFi's; Core's Pool was created at 16,291,127). */
const FIRST_BLOCK: Record<AaveV3MarketKey, bigint> = {
  core: BigInt(16_291_000),
  prime: BigInt(20_262_000),
  etherfi: BigInt(20_625_000),
};

const LANE: Record<AaveV3MarketKey, AccountSwitchesLane> = {
  core: "aave-v3-core",
  prime: "aave-v3-prime",
  etherfi: "aave-v3-etherfi",
};

const chainReads = new Map(
  AAVE_V3_MARKETS.map((m) => [
    m.key,
    accountSwitchesRoute(
      { pool: m.pool as `0x${string}`, chainId: MAINNET_CHAIN_ID, fromBlock: FIRST_BLOCK[m.key] },
      `Aave V3 ${m.name}`,
    ),
  ]),
);

export async function GET(request: NextRequest) {
  const market = (request.nextUrl.searchParams.get("market") ?? "core") as AaveV3MarketKey;
  const chainRead = chainReads.get(market);
  if (!chainRead) return NextResponse.json({ error: "unknown market", code: "bad_request" }, { status: 400 });
  return proxyAccountSwitches(request, LANE[market], chainRead);
}
