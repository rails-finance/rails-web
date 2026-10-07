"use client";

// Progressive disclosure on a position card (rails-ops ui-jobs 209, 295).
// Opt-in: a card whose shell is given a `disclosureKey` draws a "Position
// summary" heading over its headline rows, and each row (Collateral, Debt,
// the ratio) opens on a chevron after its heading into the lines under
// it: per-asset lines, captions, the risk strip. The rows that state the
// position's assets (the first two) open by default; the others start
// closed. A card without the key draws every line, as before.
//
// Remembered per viewer and per position, in the store the timeline's event
// cards use (lib/shared/card-open-store.ts): each row that a viewer moved off
// its default (`position:<key>:row<i>` for a row opened, `:closed` added for
// a default-open row closed), and whether the card's Explanation is open.
// The card-wide key of 209 (`position:<key>`) is dropped on read. Rows are
// read through useSyncExternalStore with their default as the server
// snapshot, so the server render and the hydrating render agree. Arming the
// provenance inspector opens every row, so an armed click can reach a figure
// in the detail layer, the rule `useReserveDisclosure` follows.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { DiscChevron } from "@/components/shared/expand-chevron";
import { TipLabel } from "@/components/shared/tip-label";
import { provInspector } from "@/components/shared/provenance";
import { OVERLAY_HEADING } from "@/lib/shared/ui-grammar";
import { isCardOpen, setCardOpen, subscribeCardOpen } from "@/lib/shared/card-open-store";

export interface PositionCardDisclosure {
  /** The position's store key. */
  key: string;
  /** The provenance inspector is armed: every row stands open. */
  armed: boolean;
  /** The Explanation row's remembered state, for the shell to restore. */
  explanationOpen: boolean;
  setExplanationOpen: (open: boolean) => void;
}

const DisclosureContext = createContext<PositionCardDisclosure | null>(null);

/** The card's disclosure, or null on a card that has not opted in. */
export function usePositionCardDisclosure(): PositionCardDisclosure | null {
  return useContext(DisclosureContext);
}

/** The store keys for one position: prefixed so they never meet an event id. */
const cardKey = (key: string) => `position:${key}`;
const explanationKey = (key: string) => `position:${key}:explanation`;
const rowKey = (key: string, row: number) => `position:${key}:row${row}`;

const closedOnServer = () => false;

/** One remembered flag, read from the store on every client render. */
function useStoredOpen(storeId: string | null): boolean {
  return useSyncExternalStore(subscribeCardOpen, () => (storeId ? isCardOpen(storeId) : false), closedOnServer);
}

/** The state for a card that opts in with `key`; null without one. Hooks run
 *  either way, so a card can switch the key on and off. */
export function usePositionCardDisclosureState(key: string | undefined): PositionCardDisclosure | null {
  const explanationOpen = useStoredOpen(key ? explanationKey(key) : null);
  const armed = useSyncExternalStore(provInspector.subscribe, provInspector.getArmed, () => false);
  // The card-wide open flag of ui-jobs 209 has no reader since the rows took
  // their own: drop it.
  useEffect(() => {
    if (key && isCardOpen(cardKey(key))) setCardOpen(cardKey(key), false);
  }, [key]);
  const setExplanationOpen = useCallback(
    (open: boolean) => {
      if (key) setCardOpen(explanationKey(key), open);
    },
    [key],
  );
  return useMemo(
    () => (key ? { key, armed, explanationOpen, setExplanationOpen } : null),
    [key, armed, explanationOpen, setExplanationOpen],
  );
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

/** One headline row's state, read by the `PositionCardDetail`s inside it:
 *  whether it stands open, and the count of detail blocks it holds (a row
 *  with none draws no chevron). */
interface RowState {
  open: boolean;
  register: () => () => void;
}
const RowContext = createContext<RowState | null>(null);

/** One headline row of a disclosing card: the column under its heading. The
 *  heading is the row's toggle, its chevron directly after the words; the
 *  figures and the lines under them follow. `index` keys the row's
 *  remembered state; `defaultOpen` is its state before a viewer moves it.
 *  On a card that does not disclose the heading is plain text. */
export function PositionCardRow({
  index,
  defaultOpen,
  label,
  labelTip,
  headerIcon,
  className,
  children,
}: {
  index: number;
  defaultOpen: boolean;
  label: string;
  labelTip?: string;
  headerIcon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const d = usePositionCardDisclosure();
  const id = d ? rowKey(d.key, index) : null;
  // A default-open row stores its closing, a default-closed row its opening.
  const flag = id ? (defaultOpen ? `${id}:closed` : id) : null;
  const flagged = useSyncExternalStore(subscribeCardOpen, () => (flag ? isCardOpen(flag) : false), closedOnServer);
  const open = !!d && (d.armed || (defaultOpen ? !flagged : flagged));
  const [details, setDetails] = useState(0);
  const register = useCallback(() => {
    setDetails((n) => n + 1);
    return () => setDetails((n) => n - 1);
  }, []);
  const row = useMemo(() => ({ open, register }), [open, register]);
  const toggles = !!d && details > 0;
  const toggle = () => {
    if (flag) setCardOpen(flag, !flagged);
  };
  const toggleData = { "data-card-row-toggle": String(index), "aria-expanded": open };
  const heading = !toggles ? (
    <>
      <TipLabel text={label} tip={labelTip} />
      {headerIcon}
    </>
  ) : labelTip ? (
    // The heading carries a tip on hover or tap, so the chevron is a second
    // press area after it.
    <>
      <TipLabel text={label} tip={labelTip} />
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        className="-m-1 inline-flex cursor-pointer items-center rounded-sm p-1 focus-ring"
        {...toggleData}
      >
        <DiscChevron isOpen={open} />
      </button>
      {headerIcon}
    </>
  ) : (
    <>
      <button
        type="button"
        onClick={toggle}
        className="-my-1 inline-flex cursor-pointer items-center gap-1 rounded-sm py-1 focus-ring"
        {...toggleData}
      >
        {label}
        <DiscChevron isOpen={open} />
      </button>
      {headerIcon}
    </>
  );
  return (
    <div
      className={`${toggles ? "disc-row" : ""} ${className ?? ""}`}
      data-card-row={index}
      {...(toggles && open ? { "data-card-row-open": "" } : {})}
    >
      <div className="flex items-center gap-1.5 text-xs font-semibold text-rb-500">{heading}</div>
      <RowContext.Provider value={row}>{children}</RowContext.Provider>
    </div>
  );
}

/** The card's top row. On a disclosing card (ui-jobs 295) it is the heading
 *  over the rows: "Position summary" (`PositionSummaryHeading`) on the left,
 *  the card's ⋮ or the activity meta at the right end. */
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
  return (
    <div className={`${className} ${spacing ?? ""}`} data-anatomy={anatomy} {...(d ? { "data-card-header": "" } : {})}>
      {children}
    </div>
  );
}

/** The words "Position summary", the heading of a disclosing card; nothing
 *  on a card that does not disclose. */
export function PositionSummaryHeading() {
  const d = usePositionCardDisclosure();
  if (!d) return null;
  return (
    <h2 className={`${OVERLAY_HEADING} text-rb-500`} data-position-summary="">
      Position summary
    </h2>
  );
}

/** The card's figures. */
export function PositionCardRegion({
  className,
  anatomy,
  children,
}: {
  className: string;
  anatomy?: string;
  children: ReactNode;
}) {
  return (
    <div className={className} data-anatomy={anatomy}>
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

/** The opened layer beneath a headline: drawn while its row is open, and
 *  always on a card that has not opted in or outside a row. */
export function PositionCardDetail({ children }: { children: ReactNode }) {
  const d = usePositionCardDisclosure();
  const row = useContext(RowContext);
  const register = row?.register;
  useEffect(() => (d && register ? register() : undefined), [d, register]);
  if (d && row && !row.open) return null;
  return <>{children}</>;
}
