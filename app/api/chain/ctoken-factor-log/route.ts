import { NextRequest, NextResponse } from "next/server";
import { ctokenFactorChainId, hourBlock, readCTokenFactorLog } from "@/lib/sources/chain/collateral-factor-log";
import type { CTokenProtocol } from "@/lib/api/fetch-ctoken-liquidity-at";

// Every NewCollateralFactor a Compound V2 or Moonwell Comptroller emitted
// (lib/sources/chain/collateral-factor-log.ts), for the protocol-change
// markers and the factor reads at each change on the Lifetime flows panel
// (lib/shared/collateral-factor-changes.ts; ui-jobs 328 step 8). One
// topic-filtered eth_getLogs over the Comptroller's life; cached for an hour.
//
// `?protocol=compound-v2|moonwell|moonwell-base`

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROTOCOLS: CTokenProtocol[] = ["compound-v2", "moonwell", "moonwell-base"];

export async function GET(request: NextRequest) {
  const protocol = request.nextUrl.searchParams.get("protocol") as CTokenProtocol | null;
  if (!protocol || !PROTOCOLS.includes(protocol))
    return NextResponse.json({ error: "protocol is required" }, { status: 400 });
  try {
    const data = await readCTokenFactorLog(protocol, await hourBlock(ctokenFactorChainId(protocol)));
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } });
  } catch (error) {
    console.error("Error reading the Comptroller's collateral factor logs:", error);
    return NextResponse.json({ error: "Failed to read the collateral factor logs" }, { status: 502 });
  }
}
