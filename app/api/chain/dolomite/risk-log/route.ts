import { NextResponse } from "next/server";
import { dolomiteRiskLogBlock, readDolomiteRiskLog } from "@/lib/sources/chain/dolomite-risk-at";

// The Dolomite core's risk setter logs over its life: every LogSetMarginRatio
// and LogSetMarginPremium from its deployment to about the head
// (lib/sources/chain/dolomite-risk-at.ts), for the protocol-change markers on
// the Lifetime flows events row (ui-jobs 328 step 8). One topic-filtered
// eth_getLogs; cached for an hour.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await readDolomiteRiskLog(await dolomiteRiskLogBlock());
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } });
  } catch (error) {
    console.error("Error reading the Dolomite risk setter logs:", error);
    return NextResponse.json({ error: "Failed to read the risk setter logs" }, { status: 502 });
  }
}
