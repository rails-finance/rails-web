import { NextResponse, type NextRequest } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { AAVE_V3_OPTIMISM_CONTRACTS } from "@/lib/aave-v3-optimism/types";

// Aave V3 on Optimism: every reserve on the Pool, read by rails-server at the head
// (/api/at-block/aave-v3-optimism/markets, held 30 s there) in the market overview's
// shape, forwarded unchanged. A chainStale stub when the read fails, never a 500.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stub = () =>
  NextResponse.json({
    pool: AAVE_V3_OPTIMISM_CONTRACTS.pool.toLowerCase(),
    oracle: AAVE_V3_OPTIMISM_CONTRACTS.oracle.toLowerCase(),
    blockNumber: 0,
    chainStale: true,
    reserves: [],
  });

export async function GET(request: NextRequest) {
  const base = process.env.RAILS_API_URL;
  if (!base) return stub();
  try {
    const res = await fetch(
      `${base}/api/at-block/aave-v3-optimism/markets`,
      createAuthFetchOptions(undefined, readerIpFromRequest(request)),
    );
    if (!res.ok) {
      console.error(`aave-v3-optimism markets answered ${res.status}`);
      return stub();
    }
    return NextResponse.json(await res.json(), { headers: { "Cache-Control": "public, max-age=30" } });
  } catch (err) {
    console.error("aave-v3-optimism markets did not answer:", err);
    return stub();
  }
}
