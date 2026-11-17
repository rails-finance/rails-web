import { NextRequest, NextResponse } from "next/server";
import { loadPolarisLoanFromChain } from "@/lib/sources/chain/polaris-sp-loans";
import { normalizeCdpId } from "@/lib/polaris/asset-catalog";

// Chain arm of a Polaris reserve loan: the loans manager's getters for one
// loan id at head, with the curve's floor. Node runtime, no edge caching.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const id = normalizeCdpId(request.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id (a loan number) is required" }, { status: 400 });
  return NextResponse.json(await loadPolarisLoanFromChain(id));
}
