// A protocol's lifecycle on one chain (rails-ops TO-DO-ui-jobs 612): Live,
// Closing or Closed, each with its date and its receipt. Live is the default
// and is not written down; a roster entry that carries `lifecycle` is closing
// or closed. The state is never inferred from low activity: its receipt is a
// shutdown flag, a governance action or the team's own announcement.
//
// First use: Polaris's first Sepolia testnet, closed on 16 Nov 2026 (ui-jobs
// 621). A Liquity V2 fork's branch shutdown is per branch and settles in
// lib/liquity-fork/shutdown.ts.

import type { Provenance } from "@/components/shared/provenance";
import { formatDate } from "@/lib/date";

export type LifecycleState = "closing" | "closed";

export interface ProtocolLifecycle {
  state: LifecycleState;
  /** Unix seconds: the day the state took effect, 00:00 UTC where the source
   *  names only the day. */
  at: number;
  /** The header line around the date: `lead` + the date + `rest`. */
  lead: string;
  rest: string;
  /** The receipt: the team's announcement, word for word, and where it is read. */
  source: {
    by: string;
    quote: string;
    /** Where a reader checks it. */
    href: string;
    /** What that page says now, word for word, and the day Rails read it. */
    reads?: string;
    readOn?: string;
  };
}

export const LIFECYCLE_WORD: Record<LifecycleState, string> = { closing: "Closing", closed: "Closed" };

/** "16 Nov 2026". */
export const lifecycleDay = (lc: ProtocolLifecycle) => formatDate(lc.at);

/** The date's receipt: the announcement, off chain, with the page to check it on. */
export function lifecycleProv(name: string, lc: ProtocolLifecycle): Provenance {
  const s = lc.source;
  const host = s.href.replace(/^https?:\/\//, "");
  const reads = s.reads ? ` On ${s.readOn ?? lifecycleDay(lc)} ${host} reads: "${s.reads}"` : "";
  return {
    kind: "offchain",
    pclass: "offchain",
    summary: `${LIFECYCLE_WORD[lc.state]} date — ${lifecycleDay(lc)}, from ${s.by}'s notice: "${s.quote}"${reads}`,
    via: `${name}'s announcement`,
    verify: { kind: "link", href: s.href, text: `To check: open ${host}.` },
  };
}
