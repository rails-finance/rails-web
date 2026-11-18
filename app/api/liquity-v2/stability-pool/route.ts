import type { NextRequest } from "next/server";
import { forwardLiquityV2Sp } from "@/lib/liquity-v2/sp-proxy";

// api arm of Liquity V2's /stability-pool (rails-server, migs 490 and 491). Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return forwardLiquityV2Sp(request, "stability-pool");
}
