import { aaveBaseFlowEventsRoute } from "@/lib/api/aave-base-flows-route";

// A page of the timeline cards' flows older than the summary's newest events
// (lib/api/aave-base-flows-route.ts). Node runtime; a cold build of a heavy
// wallet takes seconds.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const GET = aaveBaseFlowEventsRoute("seamless");
