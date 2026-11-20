import type { NextRequest } from "next/server";
import { forwardLiquityV1Sp } from "@/lib/liquity-v1/sp-proxy";

// api arm of Liquity V1's /stability-pool/timeline (rails-server, mig 499). Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return forwardLiquityV1Sp(request, "stability-pool/timeline");
}
