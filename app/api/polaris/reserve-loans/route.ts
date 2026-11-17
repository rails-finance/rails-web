import type { NextRequest } from "next/server";
import { forwardPolarisSpLoans } from "@/lib/polaris/sp-loan-proxy";

// api arm of Polaris's /reserve-loans (rails-server, migs 479 and 480): forwarded
// with the catalog's deployment. Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return forwardPolarisSpLoans(request, "reserve-loans");
}
