"use client";

// Progressive disclosure on a position card (rails-ops ui-jobs 209). Opt-in:
// a card whose shell is given a `disclosureKey` draws closed by default at
// every width — the header row and the headline figures — and a chevron at
// the end of the header's activity meta opens the detail beneath each
// headline and the Explanation row. A card without the key draws as before.
//
// The opened state is remembered per viewer and per position with the store
// the timeline's event cards use (lib/shared/card-open-store.ts), restored in
// a post-mount effect as EventCard does, so the server render and the first
// client render agree (closed). Arming the provenance inspector opens every
// disclosing card, so an armed click can reach a figure in the detail layer —
// the rule `useReserveDisclosure` follows.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ExpandChevron } from "@/components/shared/expand-chevron";
import { provInspector } from "@/components/shared/provenance";
import { isCardOpen, setCardOpen } from "@/lib/shared/card-open-store";

export interface PositionCardDisclosure {
  open: boolean;
  toggle: () => void;
}

const DisclosureContext = createContext<PositionCardDisclosure | null>(null);

/** The card's disclosure, or null on a card that has not opted in. */
export function usePositionCardDisclosure(): PositionCardDisclosure | null {
  return useContext(DisclosureContext);
}

/** The store key for one position: prefixed so it never meets an event id. */
const storeKey = (key: string) => `position:${key}`;

/** Open/closed state for a card that opts in with `key`; null without one.
 *  Hooks run either way, so a card can switch the key on and off. */
export function usePositionCardDisclosureState(key: string | undefined): PositionCardDisclosure | null {
  const [stored, setStored] = useState(false);
  const armed = useSyncExternalStore(provInspector.subscribe, provInspector.getArmed, () => false);
  useEffect(() => {
    setStored(key ? isCardOpen(storeKey(key)) : false);
  }, [key]);
  const toggle = useCallback(() => {
    setStored((was) => {
      const next = !was;
      if (key) setCardOpen(storeKey(key), next);
      return next;
    });
  }, [key]);
  if (!key) return null;
  return { open: stored || armed, toggle };
}

export function PositionCardDisclosureProvider({
  value,
  children,
}: {
  value: PositionCardDisclosure | null;
  children: ReactNode;
}) {
  return <DisclosureContext.Provider value={value}>{children}</DisclosureContext.Provider>;
}

/** The header chevron. Renders nothing on a card that has not opted in. */
export function PositionCardDisclosureToggle() {
  const d = usePositionCardDisclosure();
  if (!d) return null;
  return (
    <button
      type="button"
      data-card-disclosure-toggle=""
      aria-expanded={d.open}
      aria-label={d.open ? "Hide position details" : "Show position details"}
      onClick={d.toggle}
      className="group/card -my-1 -mr-1 inline-flex cursor-pointer items-center rounded-sm focus-ring"
    >
      <ExpandChevron isOpen={d.open} group="card" size={14} />
    </button>
  );
}

/** The opened layer beneath a headline: drawn while the card is open, and
 *  always on a card that has not opted in. */
export function PositionCardDetail({ children }: { children: ReactNode }) {
  const d = usePositionCardDisclosure();
  if (d && !d.open) return null;
  return <>{children}</>;
}
