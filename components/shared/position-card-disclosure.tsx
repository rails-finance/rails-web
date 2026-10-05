"use client";

// Progressive disclosure on a position card (rails-ops ui-jobs 209). Opt-in:
// a card whose shell is given a `disclosureKey` draws closed by default at
// every width — the header row, the headline figures and the (i) Explanation
// row — and a chevron at the end of the header's activity meta opens the
// detail beneath each headline. A card without the key draws as before.
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

import { createContext, useCallback, useContext, useRef, useSyncExternalStore, type ReactNode } from "react";
import { ExpandChevron } from "@/components/shared/expand-chevron";
import { provInspector } from "@/components/shared/provenance";
import { isCardOpen, setCardOpen, subscribeCardOpen } from "@/lib/shared/card-open-store";

export interface PositionCardDisclosure {
  open: boolean;
  toggle: () => void;
  /** The Explanation row's remembered state, for the shell to restore. */
  explanationOpen: boolean;
  setExplanationOpen: (open: boolean) => void;
  /** The id of the card's figures, which the header button controls. */
  regionId: string;
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
  // From the key, not useId: the page above the card can render differently
  // on the server and in the browser, which would move a generated id.
  const regionId = `position-card-${(key ?? "").replace(/[^a-zA-Z0-9_-]/g, "-")}`;
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
  return { open: stored || armed, toggle, explanationOpen, setExplanationOpen, regionId };
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

/** Set by `PositionCardHeader` around its row: inside it the chevron is the
 *  row's visible cue, and the row's own button is the control. */
const HeaderToggleContext = createContext(false);

/** The header chevron. Inside a `PositionCardHeader` it is a cue drawn in the
 *  row the header button covers; outside one (a card whose header is its own)
 *  it stays the button. Renders nothing on a card that has not opted in. */
export function PositionCardDisclosureToggle() {
  const d = usePositionCardDisclosure();
  const inHeader = useContext(HeaderToggleContext);
  if (!d) return null;
  if (inHeader) {
    return (
      <span data-card-chevron="" data-anatomy="C9" aria-hidden="true" className="inline-flex items-center">
        <ExpandChevron isOpen={d.open} group="card" size={14} />
      </span>
    );
  }
  return (
    <button
      type="button"
      data-card-disclosure-toggle=""
      data-anatomy="C9"
      aria-expanded={d.open}
      aria-controls={d.regionId}
      aria-label={d.open ? "Hide position details" : "Show position details"}
      onClick={d.toggle}
      className="group/card -my-1 -mr-1 inline-flex cursor-pointer items-center rounded-sm focus-ring"
    >
      <ExpandChevron isOpen={d.open} group="card" size={14} />
    </button>
  );
}

/** Pointer travel, in px, past which a press is a drag (a text selection) and
 *  not a click on the header. */
const DRAG_PX = 5;

/** A position card's header row (ui-jobs 265). On a card that discloses, the
 *  whole row toggles the details: one button laid under the row's content
 *  covers it, out to the card's edges, and the content lets pointer events
 *  through to it except on its own controls (links, copy, bookmark, menus),
 *  which stay siblings of the button. The chevron in the row is its visible
 *  cue. A press that travels (a selection drag) does not toggle. On a card
 *  that does not disclose the row is a plain div. */
export function PositionCardHeader({
  className,
  spacing,
  anatomy,
  children,
}: {
  /** The row's layout (flex and gaps). */
  className: string;
  /** The row's outer margin. */
  spacing?: string;
  anatomy?: string;
  children: ReactNode;
}) {
  const d = usePositionCardDisclosure();
  const from = useRef<{ x: number; y: number } | null>(null);
  if (!d) {
    return (
      <div className={`${className} ${spacing ?? ""}`} data-anatomy={anatomy}>
        {children}
      </div>
    );
  }
  return (
    // `group/card` sits on the wrapper: the chevron is a sibling of the button,
    // and hovering the button (under the content) hovers the wrapper, so the
    // chevron lights (globals.css .expand-chev) and the button tints, the
    // Lifetime flows bar's hover.
    <div className={`group/card relative ${spacing ?? ""}`} data-anatomy={anatomy} data-card-header="">
      <button
        type="button"
        data-card-disclosure-toggle=""
        aria-expanded={d.open}
        aria-controls={d.regionId}
        aria-label={d.open ? "Hide position details" : "Show position details"}
        onPointerDown={(e) => {
          from.current = { x: e.clientX, y: e.clientY };
        }}
        onClick={(e) => {
          const start = from.current;
          from.current = null;
          // A keyboard press has no pointer travel and no selection to read.
          const moved = start != null && e.detail > 0 && Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_PX;
          const selected = typeof window !== "undefined" && (window.getSelection()?.toString() ?? "") !== "";
          if (moved || selected) return;
          d.toggle();
        }}
        className="absolute -inset-x-3 -top-3 -bottom-3 z-0 cursor-pointer rounded-lg transition-colors hover:bg-rb-100 dark:hover:bg-rb-800 focus-ring"
      />
      <HeaderToggleContext.Provider value={true}>
        <div
          className={`pointer-events-none relative z-[1] ${className} [&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_[role=button]]:pointer-events-auto [&_[role=link]]:pointer-events-auto [&_[tabindex]]:pointer-events-auto`}
        >
          {children}
        </div>
      </HeaderToggleContext.Provider>
    </div>
  );
}

/** The card's figures: the region the header button controls. */
export function PositionCardRegion({
  className,
  anatomy,
  children,
}: {
  className: string;
  anatomy?: string;
  children: ReactNode;
}) {
  const d = usePositionCardDisclosure();
  return (
    <div className={className} data-anatomy={anatomy} id={d?.regionId}>
      {children}
    </div>
  );
}

/** A card's risk headline drawn from the page's live read (Compound V2,
 *  Moonwell, Compound V3): the label, the figure, and the opened layer
 *  beneath it. */
export interface CardRiskColumn {
  label: string;
  labelTip?: string;
  value: ReactNode;
  detail?: ReactNode;
}

/** The risk headline as an `OpenPositionStats` column, its detail in the
 *  opened layer; none where the card does not disclose or has no risk. */
export function riskColumns(risk: CardRiskColumn | null | undefined, disclosing: boolean) {
  if (!disclosing || !risk) return [];
  return [
    {
      label: risk.label,
      labelTip: risk.labelTip,
      value: risk.value,
      footnote: risk.detail ? <PositionCardDetail>{risk.detail}</PositionCardDetail> : undefined,
    },
  ];
}

/** The opened layer beneath a headline: drawn while the card is open, and
 *  always on a card that has not opted in. */
export function PositionCardDetail({ children }: { children: ReactNode }) {
  const d = usePositionCardDisclosure();
  if (d && !d.open) return null;
  return <>{children}</>;
}
