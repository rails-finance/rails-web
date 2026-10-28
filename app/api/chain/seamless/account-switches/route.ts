import { NextRequest } from "next/server";
import { proxyAccountSwitches } from "@/lib/api/aave-base-account-switches";

// A Seamless account's e-mode changes and the reserves it ever turned on as
// collateral (lib/api/aave-base-account-switches.ts: rails-server reads the
// Base Sieve and the at-block store); the timeline route's rows carry neither.
//
// Node runtime.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return proxyAccountSwitches(request, "seamless");
}
