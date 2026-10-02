import { aaveBaseFlowsRoute } from "@/lib/api/aave-base-flows-route";

// The Lifetime flows summary for a history the page holds elided
// (lib/api/aave-base-flows-route.ts). Node runtime; a cold build of a heavy
// wallet takes seconds.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const GET = aaveBaseFlowsRoute("aave-v3-base");
