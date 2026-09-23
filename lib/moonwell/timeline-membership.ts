// Which Moonwell events join a run — the one predicate both grouping paths use.
// ----------------------------------------------------------------------------
// The client-grouped spec (`lib/moonwell/timeline-runs.tsx`) and the folders the
// Moonwell Base route serves (`lib/moonwell-base/timeline-folders.ts`) must put
// the same events in a run, so the rule lives here, in a module with no React
// in it that a route handler can import. The argument for the rule — the
// signature fact, never the event kind — is at the top of timeline-runs.tsx.

import { isMoonwellEvent } from "@/lib/shared/types/event-shape";
import type { BaseActivityEvent, MoonwellEventType } from "@/lib/shared/types/event-shape";

/** Runs shorter than this stay as individual cards — the same density-win
 *  floor every run/cluster in the app uses. */
export const MIN_ACTIVITY_RUN = 4;

/** The membership guard for rows whose filler carried no `txFrom`: the kinds
 *  that in practice arrive third-party (a keeper's repay/liquidate legs, the
 *  seize and drain transfers). Where `txFrom` IS present, the signature fact
 *  decides and this list is not consulted. */
const NOISE_KINDS = new Set<MoonwellEventType>(["liquidation", "repay", "transfer_out", "transfer_in"]);

/** Membership: the wallet's own signature breaks a run; anything signed by
 *  someone else joins one. `BaseActivityEvent.wallet` is the page's own wallet
 *  on every row, so the test needs no wallet parameter. */
export function isThirdParty(e: BaseActivityEvent): boolean {
  if (!isMoonwellEvent(e)) return false;
  const { txFrom, eventType } = e.context.data;
  if (txFrom) return txFrom !== e.wallet;
  return NOISE_KINDS.has(eventType);
}
