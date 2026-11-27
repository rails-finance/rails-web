import type { NextRequest } from "next/server";
import { forwardPolarisPeth } from "@/lib/api/polaris-peth-proxy";

// api arm of Polaris's /peth/:address (rails-server, mig 537; ui-jobs 865):
// one address's pETH account. Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  return forwardPolarisPeth(request, address);
}
