import { NextRequest, NextResponse } from "next/server";
import { accountSwitchesRoute } from "@/lib/sources/chain/aave-family-account-switches";
import { AAVE_V3_MARKETS, type AaveV3MarketKey } from "@/lib/aave-v3/asset-catalog";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// An Aave V3 Ethereum account's e-mode changes and the reserves it ever turned
// on as collateral, per market (?market=core|prime|etherfi), from that
// market's Pool logs (lib/sources/chain/aave-family-account-switches.ts); the
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

const answers = new Map(
  AAVE_V3_MARKETS.map((m) => [
    m.key,
    accountSwitchesRoute(
      { pool: m.pool as `0x${string}`, chainId: MAINNET_CHAIN_ID, fromBlock: FIRST_BLOCK[m.key] },
      `Aave V3 ${m.name}`,
    ),
  ]),
);

export async function GET(request: NextRequest) {
  const answer = answers.get((request.nextUrl.searchParams.get("market") ?? "core") as AaveV3MarketKey);
  if (!answer) return NextResponse.json({ error: "unknown market", code: "bad_request" }, { status: 400 });
  return answer(request.nextUrl.searchParams.get("wallet"));
}
