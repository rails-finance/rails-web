import { NextRequest, NextResponse } from "next/server";
import { createAuthFetchOptions } from "@/lib/api/fetch-with-auth";
import { readerIpFromRequest } from "@/lib/api/reader-ip";
import { proxyCacheControl } from "@/lib/api/proxy-cache";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// An Alchemist V3's collateralizationLowerBound at the end of one block, for
// the Lifetime flows chart's collateralisation line (lib/alchemix/flows-health.ts).
// Proxy to rails-server's `/api/at-block/alchemix/bound`, which answers from
// its at-block store and reads the chain once for a block it does not hold
// (server mig 412; rails-ops decisions/0056). The backend's Cache-Control is
// forwarded: a year at a finalized block, seconds above it.
//
// `?chain=1|8453&alchemist=<address>&block=<n>` answers
// `{ block, lowerBound, lowerBoundRaw }`, the bound as a fraction (1.0526 is 105.26 %).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RAILS_API_URL = process.env.RAILS_API_URL;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const CHAINS: number[] = [MAINNET_CHAIN_ID, BASE_CHAIN_ID];

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const chain = Number(q.get("chain"));
  const alchemist = (q.get("alchemist") ?? "").toLowerCase();
  const block = Number(q.get("block"));
  if (!CHAINS.includes(chain) || !ADDRESS.test(alchemist) || !Number.isInteger(block) || block < 1)
    return NextResponse.json({ error: "chain, alchemist and block are required" }, { status: 400 });
  if (!RAILS_API_URL) {
    console.error("RAILS_API_URL environment variable is not set");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  try {
    const response = await fetch(
      `${RAILS_API_URL}/api/at-block/alchemix/bound?chain=${chain}&alchemist=${alchemist}&block=${block}`,
      createAuthFetchOptions(undefined, readerIpFromRequest(request)),
    );
    if (!response.ok) {
      console.error(`Backend API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ error: "Failed to read the lower bound at that block" }, { status: 502 });
    }
    return NextResponse.json(await response.json(), { headers: proxyCacheControl(response) });
  } catch (error) {
    console.error("Error fetching the Alchemist's lower bound at block from backend:", error);
    return NextResponse.json({ error: "Failed to read the lower bound at that block" }, { status: 502 });
  }
}
