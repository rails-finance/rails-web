"use client";

// The pETH account behind a Polaris position's amount (ui-jobs 872): on a CDP,
// a Stability Pool deposit or a reserve loan, an event that moved pETH or
// fpETH between the owner's wallet and the position links that transaction on
// the owner's pETH account, and wears the hairline border while Display's
// "Mark pETH account links" is on. The cards pass the owner only where the owner sent
// the transaction, so the wallet that moved the tokens is the account linked.

import { useEnsName } from "@/lib/ens/use-ens-names";
import { useTimelineDisplay } from "@/components/shared/timeline-display-context";
import { polarisPethEventHref } from "@/lib/polaris/routes";
import type { SpineAmountLink } from "@/components/shared/activity-timeline";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The amount's link, or undefined with no owner. `into` is the move's
 *  side: into the position (from the wallet) or out of it (to the wallet). */
export function usePethAccountPath(
  owner: string | null | undefined,
  txHash: string,
  into: boolean,
): SpineAmountLink | undefined {
  const ens = useEnsName(owner ?? null);
  const { showPethAccountLinks } = useTimelineDisplay();
  if (!owner) return undefined;
  const name = ens ?? short(owner);
  return {
    href: polarisPethEventHref(owner, txHash),
    tip: `${into ? "Came from" : "Went to"} ${name}'s pETH account →`,
    marked: showPethAccountLinks,
  };
}

/** The owner whose wallet moved the tokens: the position's owner at the
 *  event, where that owner sent the transaction; null otherwise. */
export const walletOwner = (owner: string | null | undefined, txFrom: string | null | undefined): string | null =>
  owner && txFrom && owner.toLowerCase() === txFrom.toLowerCase() ? owner.toLowerCase() : null;
