"use client";

// Position-card chrome hoisted out of the per-protocol cards: the lifecycle
// pill every LISTING card's status axis renders, and the oracle-USD
// headline stat every chain-state-balance card leads a column with. Eighteen
// cards each carried their own copy of both — one definition here so they
// can't drift (rails-ops TO-DO-explorer-standardisation-sweep.md §3).

import { StatValue } from "@/components/shared/stat-value";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { formatUsd } from "@/lib/shared/format-event";

/** "unread": a listing row whose account has not been read from the chain yet
 *  — no state recorded, never "closed" (rails-ops decision 0018). */
export type LifecycleStatus = "open" | "closed" | "liquidated" | "unread";

// Unread shares CLOSED's muted register: no state is a quiet fact, not a
// new colour.
const MUTED = "bg-rb-300 dark:bg-rb-700 text-foreground/70";
const LIFECYCLE: Record<LifecycleStatus, { label: string; cls: string }> = {
  open: { label: "OPEN", cls: "bg-positive/20 text-positive" },
  closed: { label: "CLOSED", cls: MUTED },
  liquidated: { label: "LIQUIDATED", cls: "bg-red-500/20 text-red-500" },
  unread: { label: "UNREAD", cls: MUTED },
};

/** The listing-surface lifecycle pill (open/closed/liquidated/unread) — status is
 *  the listing's filter axis. The detail render swaps this for a neutral
 *  mode-word pill per protocol (what the position is doing NOW), which stays
 *  local to each card since the mode word itself is protocol-specific. */
export function LifecyclePill({ status }: { status: LifecycleStatus }) {
  const st = LIFECYCLE[status] ?? LIFECYCLE.open;
  return <span className={`font-bold tracking-wider px-2 py-0.5 rounded-xs text-xs ${st.cls}`}>{st.label}</span>;
}

/** Oracle-USD stat headline (the V4 spoke-card grammar): ONE USD figure leads
 *  the column regardless of leg count. Callers compute their own provenance
 *  (`info`) — the receipt each protocol's oracle/deployment names — since
 *  that lane differs per protocol; this component only renders the figure. */
export function UsdHeadline({ usd, info }: { usd: number; info: Provenance }) {
  return (
    <StatValue title={"$" + usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}>
      <Prov info={info}>{formatUsd(usd)}</Prov>
    </StatValue>
  );
}
