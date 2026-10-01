"use client";

// Progressive disclosure on a position card (rails-ops ui-jobs 209). Opt-in:
// a card whose shell is given a `disclosureKey` draws closed by default at
// every width — the header row and the headline figures — and a chevron at
// the end of the header's activity meta opens the detail beneath each
// headline and the Explanation row. A card without the key draws as before.
//
// Two states are remembered per viewer and per position, in the store the
// timeline's event cards use (lib/shared/card-open-store.ts): whether the
// card is open, and whether its Explanation is open. They are read through
// useSyncExternalStore with a closed server snapshot, so the server render
// and the hydrating render agree (closed), a card that mounts on the client
// (after a loading skeleton, or on a client navigation) paints in its
// remembered state at once, and a hydrated card left open settles open
// straight after hydration. Arming the provenance inspector opens every
// disclosing card, so an armed click can reach a figure in the detail layer —
// the rule `useReserveDisclosure` follows.

import { createContext, useCallback, useContext, useSyncExternalStore, type ReactNode } from "react";
import { ExpandChevron } from "@/components/shared/expand-chevron";
import { provInspector } from "@/components/shared/provenance";
import { isCardOpen, setCardOpen, subscribeCardOpen } from "@/lib/shared/card-open-store";

export interface PositionCardDisclosure {
  open: boolean;
  toggle: () => void;
  /** The Explanation row's remembered state, for the shell to restore. */
  explanationOpen: boolean;
  setExplanationOpen: (open: boolean) => void;
}

const DisclosureContext = createContext<PositionCardDisclosure | null>(null);

/** The card's disclosure, or null on a card that has not opted in. */
export function usePositionCardDisclosure(): PositionCardDisclosure | null {
  return useContext(DisclosureContext);
}

/** The store key for one position: prefixed so it never meets an event id. */
const storeKey = (key: string) => `position:${key}`;
const explanationKey = (key: string) => `position:${key}:explanation`;

const closedOnServer = () => false;

/** One remembered flag, read from the store on every client render. */
function useStoredOpen(storeId: string | null): boolean {
  return useSyncExternalStore(subscribeCardOpen, () => (storeId ? isCardOpen(storeId) : false), closedOnServer);
}

/** Open/closed state for a card that opts in with `key`; null without one.
 *  Hooks run either way, so a card can switch the key on and off. */
export function usePositionCardDisclosureState(key: string | undefined): PositionCardDisclosure | null {
  const stored = useStoredOpen(key ? storeKey(key) : null);
  const explanationOpen = useStoredOpen(key ? explanationKey(key) : null);
  const armed = useSyncExternalStore(provInspector.subscribe, provInspector.getArmed, () => false);
  const toggle = useCallback(() => {
    if (key) setCardOpen(storeKey(key), !isCardOpen(storeKey(key)));
  }, [key]);
  const setExplanationOpen = useCallback(
    (open: boolean) => {
      if (key) setCardOpen(explanationKey(key), open);
    },
    [key],
  );
  if (!key) return null;
  return { open: stored || armed, toggle, explanationOpen, setExplanationOpen };
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
