import type { NextRequest } from "next/server";
import { forwardLiquityV2Sp } from "@/lib/liquity-v2/sp-proxy";

// api arm of Asymmetry's /stability-pool/liquidations (rails-server 8536cc5c). Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return forwardLiquityV2Sp(request, "stability-pool/liquidations", "asymmetry");
}
