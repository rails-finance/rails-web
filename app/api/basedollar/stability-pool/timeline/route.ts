import type { NextRequest } from "next/server";
import { forwardLiquityV2Sp } from "@/lib/liquity-v2/sp-proxy";

// api arm of Basedollar's /stability-pool/timeline (rails-server migs 504-507). Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return forwardLiquityV2Sp(request, "stability-pool/timeline", "basedollar");
}
