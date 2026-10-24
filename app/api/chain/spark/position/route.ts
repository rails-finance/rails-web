import { NextRequest, NextResponse } from "next/server";
import { loadSparkPositionFromChain } from "@/lib/sources/chain/spark-position";
import { SPARK_CATALOG } from "@/lib/spark/asset-catalog";
import { publicErrorMessage } from "@/lib/api/public-error";

// Chain arm of the SparkLend position read — the exact live-head detail.
// SparkLend is a single pooled account per wallet on one mainnet Pool, so this
// needs only `?wallet=`. The candidate reserve set is the Spark catalog and
// every reserve Pool.getReservesList names (a reserve the catalog does not
// list, RLUSD, is read too), read straight from the Pool at the live head (the
// multicall returns 0 for any reserve the wallet hasn't touched).
// Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const wallet = sp.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  try {
    const reserves = [...new Set(SPARK_CATALOG.map((a) => a.address))];
    const data = await loadSparkPositionFromChain(wallet, reserves);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error loading Spark position from chain:", error);
    const message = publicErrorMessage(error, "Failed to load chain position");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
