"use client";

// The per-side reserve/market amount list on a position card (Collateral,
// Debt, Pool claim, …): collapsed by default once a side would list two or
// more reserves, opened from a chevron that follows the headline's icon
// stack (rails-ops ui-jobs 57). A side with fewer than two reserves never
// collapses — the single line, or nothing, just renders in place; the icon
// alone doesn't give the amount, so there is nothing to hide it behind.
//
// Shared by the Aave V3, Spark, Moonwell, Maple and Compound V2 position
// cards, the five with a `ReserveStack`-shaped side.

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { ExpandChevron } from "@/components/shared/expand-chevron";
import { provInspector } from "@/components/shared/provenance";

export interface ReserveDisclosure {
  /** Whether this side has enough reserves to collapse at all. */
  collapsible: boolean;
  open: boolean;
  toggle: () => void;
}

/** One open/closed flag per card side, local to the card. Arming the
 *  provenance inspector force-opens every collapsible side on the page, so
 *  an armed click can still reach an amount inside a collapsed list — the
 *  simplest route to point 2 of ui-jobs 57: the inspector's own armed flag
 *  (provInspector, provenance.tsx) drives the same `open` a manual toggle
 *  would. */
export function useReserveDisclosure(count: number): ReserveDisclosure {
  const [openState, setOpenState] = useState(false);
  const armed = useSyncExternalStore(provInspector.subscribe, provInspector.getArmed, () => false);
  const collapsible = count >= 2;
  return {
    collapsible,
    open: !collapsible || openState || armed,
    toggle: () => setOpenState((o) => !o),
  };
}

/** The chevron after a side's headline icon stack — after the "+N" overflow
 *  chip when it draws, after the last icon otherwise (it is appended to the
 *  same `assetIcons` node, so it inherits that position for free). Renders
 *  nothing when the side isn't collapsible: there's no disclosure to toggle. */
export function ReserveDisclosureToggle({
  disclosure,
  count,
  group = "proto",
}: {
  disclosure: ReserveDisclosure;
  count: number;
  group?: string;
}) {
  if (!disclosure.collapsible) return null;
  return (
    <button
      type="button"
      data-reserve-toggle=""
      aria-expanded={disclosure.open}
      aria-label={disclosure.open ? "Hide reserves" : `Show ${count} reserves`}
      onClick={disclosure.toggle}
      className="inline-flex items-center cursor-pointer"
    >
      <ExpandChevron isOpen={disclosure.open} group={group} />
    </button>
  );
}

/** Wraps a side's per-reserve amount list so it opens in flow beneath the
 *  headline and pushes the card's content down (mounted only while open —
 *  no height animation, the same instant-disclosure grammar `event-card.tsx`
 *  uses). A non-collapsible side renders its child unwrapped: there is no
 *  collapsed state to mark up for a single line. */
export function ReserveDisclosureList({
  disclosure,
  children,
}: {
  disclosure: ReserveDisclosure;
  children: ReactNode;
}) {
  if (!disclosure.collapsible) return <>{children}</>;
  return <div data-reserve-list={disclosure.open ? "open" : "collapsed"}>{disclosure.open ? children : null}</div>;
}
