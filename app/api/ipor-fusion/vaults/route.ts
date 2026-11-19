import { NextRequest, NextResponse } from "next/server";
import { iporFusionVaultHits } from "@/lib/ipor-fusion/vault-lookup";

/**
 * `GET /api/ipor-fusion/vaults?chain=1&addresses=0xabc…,0xdef…` → `{ vaults:
 * { <lower-addr>: { name, symbol, censusBlock, censusBlockIso } } }`, the
 * addresses that are IPOR Fusion vaults on that chain (hits only). Read from
 * the static census (lib/ipor-fusion/vault-catalog.ts), so an
 * answer is cached for a day. For the holder label (lib/shared/use-holder-label.ts).
 */

const ADDRESS = /^0x[0-9a-f]{40}$/;
const MAX_ADDRESSES = 100;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const chain = Number(q.get("chain"));
  const addresses = (q.get("addresses") ?? "")
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter((a) => ADDRESS.test(a))
    .slice(0, MAX_ADDRESSES);
  if (!Number.isInteger(chain) || addresses.length === 0)
    return NextResponse.json({ error: "a chain and one or more addresses are required" }, { status: 400 });
  return NextResponse.json(
    { vaults: iporFusionVaultHits(chain, addresses) },
    { headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } },
  );
}
