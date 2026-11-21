import type { NextRequest } from "next/server";
import { forwardLiquityV1Staking } from "@/lib/liquity-v1/sp-proxy";

// api arm of Liquity V1's /staking (rails-server, mig 502). Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return forwardLiquityV1Staking(request, "staking");
}
