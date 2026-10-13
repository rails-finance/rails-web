"use client";

// Position-card chrome hoisted out of the per-protocol cards: the lifecycle
// pill every LISTING card's status axis renders. Eighteen cards each carried
// a copy — one definition here so they can't drift (rails-ops
// TO-DO-explorer-standardisation-sweep.md §3).

/** "unread": a listing row whose account has not been read from the chain yet
 *  — no state recorded, never "closed" (rails-ops decision 0018). */
export type LifecycleStatus = "open" | "closed" | "liquidated" | "unread";

// Unread shares CLOSED's muted register: no state is a quiet fact, not a
// new colour.
const MUTED = "bg-rb-300 dark:bg-rb-700 text-foreground/70";
const LIFECYCLE: Record<LifecycleStatus, { label: string; cls: string; title?: string }> = {
  open: { label: "OPEN", cls: "bg-positive/20 text-positive" },
  closed: { label: "CLOSED", cls: MUTED },
  liquidated: { label: "LIQUIDATED", cls: "bg-red-500/20 text-red-500" },
  unread: {
    label: "NOT LOADED",
    cls: MUTED,
    title: "This account's state hasn't been read from the chain yet. It shows once it is.",
  },
};

/** The listing-surface lifecycle pill (open/closed/liquidated/unread) — status is
 *  the listing's filter axis. The detail render swaps this for a neutral
 *  mode-word pill per protocol (what the position is doing NOW), which stays
 *  local to each card since the mode word itself is protocol-specific. */
export function LifecyclePill({ status }: { status: LifecycleStatus }) {
  const st = LIFECYCLE[status] ?? LIFECYCLE.open;
  return (
    <span
      className={`font-bold tracking-wider px-2 py-0.5 rounded-xs text-xs ${st.cls}`}
      title={st.title}
      data-anatomy="C6"
    >
      {st.label}
    </span>
  );
}
