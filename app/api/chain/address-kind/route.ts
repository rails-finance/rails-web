import { NextRequest, NextResponse } from "next/server";
import { readAddressKind } from "@/lib/sources/chain/address-kind";
import { BASE_CHAIN_ID, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";

// What an address is, from its code at head (lib/sources/chain/address-kind.ts),
// for the wallet row on a position page. Code changes rarely (a deployment at
// a precomputed address, an EIP-7702 delegation set or cleared), so an answer
// is cached for an hour. Node runtime.

export const runtime = "nodejs";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const CHAINS: ChainId[] = [MAINNET_CHAIN_ID, BASE_CHAIN_ID];

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const address = q.get("address") ?? "";
  const chain = Number(q.get("chain") ?? MAINNET_CHAIN_ID) as ChainId;
  if (!ADDRESS.test(address) || !CHAINS.includes(chain))
    return NextResponse.json({ error: "address and a chain of 1 or 8453 are required" }, { status: 400 });
  const kind = await readAddressKind(address, chain);
  return NextResponse.json(kind, {
    headers: kind ? { "cache-control": "public, max-age=3600, s-maxage=3600" } : {},
  });
}
