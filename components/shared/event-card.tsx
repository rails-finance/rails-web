"use client";

import { PriceBasisProvider } from "@/components/shared/price-basis";
import { useState, useCallback, useEffect, useContext, useId, useMemo, useRef, type ReactNode } from "react";
import { useTimelineScale, useSingleWallet } from "@/components/shared/activity-timeline";
import { DiscChevron } from "@/components/shared/expand-chevron";
import { EventCardFooter } from "@/components/shared/event-card-footer";
import { EventCardMenu, useEventMenuRows } from "@/components/shared/event-card-menu";
import { EventPageAside, EventPageContext } from "@/components/shared/event-page-aside";
import { disclosureProps } from "@/components/shared/disclosure";
import { EventHeadContext, EventTxHashContext, PlainNumber } from "@/components/shared/event-number-pill";
import { eventIdFromShareHref, useEventShareHref } from "@/components/shared/event-share-context";
import {
  INFO_PATH,
  InfoDisclosure,
  InfoTabsDisclosure,
  type InfoDisclosureTab,
} from "@/components/shared/info-disclosure";
import { isCardOpen, setCardOpen } from "@/lib/shared/card-open-store";
import { ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { useUnreadTokens } from "@/components/shared/unread-tokens-context";
import type { UnreadToken } from "@/lib/shared/types/event-shape";
import { EventCaptionContext, SpineRowContext, isPhoneViewport, useSpineView } from "@/components/shared/mobile-spine";
import { EventDateContext, EventDayMarkContext } from "@/components/shared/event-time";
import { formatTimestamp, shortDate, shortDateYear } from "@/lib/shared/format-event";
import { formatDate } from "@/lib/date";
import {
  SpineColumn,
  SpineLegsContext,
  useSpineLegsState,
  type SpineColumnProps,
} from "@/components/shared/spine-column";
import { useRowTarget } from "@/components/shared/row-target";
import { ChainTruthRow, type ChainTruthRowSpec } from "@/components/shared/chain-truth-event";
import { EventPriceRow, hasPriceRow, type EventCardPrice } from "@/components/shared/event-price-row";
import { EventCellGrid, type EventCells } from "@/components/shared/event-cells";

/** The Explanation of an event naming a token whose decimals did not load: its
 *  prose states amounts, so it waits for the chain in full. */
function ExplanationNotLoaded({ tokens }: { tokens: UnreadToken[] }) {
  const names = tokens.map((t) => t.label).join(", ");
  return (
    <p
      className="text-sm leading-relaxed text-rb-500"
      data-not-loaded=""
      title={tokens.map((t) => t.address).join(", ")}
    >
      Not loaded: the chain didn&rsquo;t answer for the decimals of {names}, so this event&rsquo;s amounts can&rsquo;t
      be stated yet. The explanation shows once it does.
    </p>
  );
}

/* ── The slots (rails-ops reference/shared-event-card-spec.md §3; ui-jobs 309) ──
 * A family on the shell supplies data and words in these; the shell decides
 * which parts exist and where they sit. */

/** The event the card stands for. The shell builds the card's open-state key
 *  from `family` and `id`, and the menu from `txHash`. */
export interface EventCardEvent {
  id: string;
  /** The key the open state is stored under ("liquity-v2"). */
  family: string;
  txHash?: string;
  blockNumber?: number;
  timestamp: number;
  number?: number;
}

/** Who acted, where the owner did not. */
export interface EventCardActor {
  /** The third party who acted (a redeemer, a liquidator, a batch manager, a
   *  caller on the owner's position): the phone caption and the segment's
   *  label say "Redemption by 0x1234…abcd". */
  by?: string;
  /** Whether the owner actioned the event. Unset: unless `by` names another
   *  actor. False draws the spine dotted below the node (a protocol's event,
   *  a queue fill). */
  byOwner?: boolean;
  /** Counterparty of a custody move: the caption reads "Sent to 0x…" or
   *  "Received from 0x…". */
  custody?: { dir: "to" | "from"; address: string };
}

/** The family's ledgers (T2.1): the provider the opened cells read, or the
 *  reason the family has none. */
export type EventCardLedgers = { provider: (children: ReactNode) => ReactNode } | { none: string };

/** T3: the explanation's body, and its first bullet, which the shell draws as
 *  the teaser at the top of the open pane; a grouped explanation has none. */
export interface EventCardExplainer {
  body: ReactNode;
  first?: ReactNode;
  grouped?: boolean;
}

export interface EventCardSlots {
  event: EventCardEvent;
  spine: SpineColumnProps;
  /** T1's head row, drawn by the shared `ChainTruthRow`. */
  head: ChainTruthRowSpec;
  /** The phone caption's kind ("Repay", "Rate 4.12% → 3.60%"). */
  caption: string;
  actor?: EventCardActor;
  /** T2's grid: the ordered cells, the cells to come while their figures are
   *  read, or the reason the event has none. */
  cells: EventCells;
  ledgers: EventCardLedgers;
  /** T2's price row: the owner-paid gas, the prices the cells value, the
   *  outcome. The row draws where one of them is present. */
  price?: EventCardPrice;
  /** Short lines under the grid (the redeemer, forensics, "not read" notices). */
  notes?: ReactNode;
  explainer: EventCardExplainer;
  /** T4: the Learn-More "?" (a `<LearnMore inline …/>`), at the right end of
   *  the footer (T6). */
  learnMore: ReactNode;
  /** A full-width strip under T1 (Morpho Base vaults' allocation). */
  band?: ReactNode;
  /** Run on pointer-over or focus of the row (a prefetch). */
  onIntent?: () => void;
  /** A hook the shell runs while the body is open, for a family whose cells,
   *  notes or price wait on a read a closed row must not make (Liquity V1's
   *  receipt read): what it returns stands in for those slots, which hold
   *  the closed card's values (the cells `pending`). */
  useOpened?: () => EventCardOpened;
}

/** The slots `useOpened` returns once the body opens. */
export type EventCardOpened = Partial<Pick<EventCardSlots, "cells" | "notes" | "price">>;

/** The body of a card whose slots wait on `useOpened`: mounted with the open
 *  panel, so its read starts when the card opens. */
function OpenedBody({ slots, useOpened }: { slots: EventCardSlots; useOpened: () => EventCardOpened }) {
  const opened = useOpened();
  const price = opened.price ?? slots.price;
  return (
    <>
      <EventCellGrid cells={opened.cells ?? slots.cells} />
      {opened.notes ?? slots.notes}
      {hasPriceRow(price) && <EventPriceRow price={price} />}
    </>
  );
}

/** What the shell takes beside a family's parts: the timeline's and the
 *  event page's. */
interface EventCardFrame {
  avatar?: ReactNode;
  /** A group's closed row. "summary": the head opens the summary card with no
   *  chevron drawn (ui-jobs 250). "words": the head is words and draws no
   *  control; they open as the phone's card (a delegate run). */
  group?: "summary" | "words";
  /** A group's closed row: its ⋮ carries one item, "Show 48 grouped events",
   *  the only way to open the group (ui-jobs 250, third revision). */
  groupMenu?: { title: string; subtitle: string; show: () => void };
  /** Muted register — a collapsed run or folder row reads quieter than the
   *  events it stands for: the whole row (spine flank included) renders at
   *  reduced opacity at rest, returning to full weight on hover, keyboard
   *  focus, and while the detail panel is open. Opacity only — no hue, so the
   *  color grammar is untouched and both themes inherit it. Run/folder rows
   *  ONLY: single event cards always draw at full weight — the custody-move
   *  cards (aToken/spToken/mToken transfers) used to take this register too,
   *  and inside a folder the dimmed rows read as disabled, not as quieter
   *  (Miles, 2026-09-02). */
  muted?: boolean;
  /** A group's whole phone caption ("Redemptions (48) · 1 Oct '25 – 12 Oct
   *  '25"), in place of the kind and the moment. */
  phoneCaption?: ReactNode;
  /** The caption as spoken ("Redemptions, 1 October 2025 to …"). */
  spokenCaption?: string;
  /** The phone control's full name; unset, the spoken caption and the legs
   *  the column reports. */
  label?: string;
  /** What the number column draws in place of the event's number: the
   *  boundary's count. */
  numberSlot?: ReactNode;
  /** The boundary card's controlled open. */
  detailOpen?: boolean;
  onDetailToggle?: (isOpen: boolean) => void;
}

/** The parts a family not yet on the slots passes; 309's later steps move
 *  each family onto `slots`. */
interface EventCardParts {
  slots?: undefined;
  iconColumn: ReactNode;
  header: ReactNode;
  /** A full-width strip under the header (the `band` slot). */
  band?: ReactNode;
  detail?: ReactNode;
  /** T2's price row, under the detail (the `price` slot). */
  price?: EventCardPrice;
  explainer?: ReactNode;
  /** Teaser line at the top of the open explanation: the first bullet. */
  explainerTeaser?: ReactNode;
  /** Transaction hash: the footer, and the header's number pill when
   *  Display's "Transaction hashes" is on (ui-jobs 294). */
  txHash?: string;
  learnMore?: ReactNode;
  /** Stable, globally-unique id for this card. When set (and the detail panel
   *  is uncontrolled), the expanded/collapsed state is persisted to
   *  localStorage and restored on reload / back-navigation. */
  persistKey?: string;
  /** The phone caption's kind, where the card's label differs from the
   *  event's `actionLabel` (which the timeline provides by default). */
  caption?: string;
  by?: string;
  byOwner?: boolean;
  custody?: EventCardActor["custody"];
}

export type EventCardProps = EventCardFrame & ({ slots: EventCardSlots } | EventCardParts);

/** A slotted card's parts, as the shell draws them. */
function partsOf(slots: EventCardSlots, pageMode: boolean): Omit<EventCardParts, "slots"> {
  const { event, actor, explainer } = slots;
  return {
    iconColumn: <SpineColumn {...slots.spine} />,
    header: (
      <ChainTruthRow
        spec={slots.head}
        timestamp={event.timestamp}
        eventNumber={event.number}
        variant={pageMode ? "page" : "row"}
      />
    ),
    band: slots.band,
    detail: slots.useOpened ? (
      <OpenedBody slots={slots} useOpened={slots.useOpened} />
    ) : (
      <>
        <EventCellGrid cells={slots.cells} />
        {slots.notes}
      </>
    ),
    // A card read on open draws its price row inside `OpenedBody`.
    price: slots.useOpened ? undefined : slots.price,
    explainer: explainer.body,
    explainerTeaser: explainer.grouped ? undefined : explainer.first,
    txHash: event.txHash,
    learnMore: slots.learnMore,
    persistKey: `${event.family}:${event.id}`,
    caption: slots.caption,
    by: actor?.by,
    byOwner: actor?.byOwner,
    custody: actor?.custody,
  };
}

/** The (i) row's words, on every card. */
const EXPLANATION_HEADING = "Event explanation";

/* ── EventCard ───────────────────────────────────────────────────────── */

export function EventCard(props: EventCardProps) {
  const {
    avatar,
    group,
    groupMenu,
    muted,
    phoneCaption,
    spokenCaption,
    label,
    numberSlot,
    detailOpen: detailOpenProp,
    onDetailToggle,
  } = props;
  // The event page's card (rails-ops TO-DO-ui-jobs 236), where the route's
  // shell provides `EventPageContext`: the shared side column stands in the
  // spine's column, beside the card from 640px and above it below; the
  // header draws no chevron and the body, the explanation and the footer
  // stand open with no toggle. The boundary card's open is controlled.
  const page = useContext(EventPageContext);
  const pageMode = page != null;
  const parts = props.slots ? partsOf(props.slots, pageMode) : props;
  const {
    iconColumn,
    header,
    band,
    detail,
    price,
    explainer: explainerProp,
    explainerTeaser: explainerTeaserProp,
    txHash,
    learnMore,
    persistKey,
    caption,
    by,
    byOwner,
    custody,
  } = parts;
  const ledgers = props.slots?.ledgers;
  const onIntent = props.slots?.onIntent;
  const scale = useTimelineScale();
  const singleWallet = useSingleWallet();
  const showAvatar = !singleWallet && !!avatar;
  // The event page's path, for the event menu: null outside a timeline.
  const shareHref = useEventShareHref();

  const [detailOpenInternal, setDetailOpenInternal] = useState(false);

  const isControlled = pageMode || detailOpenProp !== undefined;

  // A warning event's legs, handed from the header to the spine.
  const spineLegs = useSpineLegsState();
  // The phone's one open card (components/shared/mobile-spine.tsx): null
  // outside a timeline and on a pinned page.
  const phoneOpen = useSpineView();
  const captionCtx = useContext(EventCaptionContext);
  // The date once (ui-jobs 250): the timeline's prefix for this row, set when
  // the row above is on another UTC day; a row opening a day under day marks
  // carries the mark instead.
  const datePrefix = useContext(EventDateContext);
  const dayMark = useContext(EventDayMarkContext);
  const reactId = useId();
  // The card's ids name the event where the card has one (its share path's
  // id, one card per event on a page), so they hold whatever the tree above
  // the card looks like: a useId alone differed between server and client on
  // the timeline and event pages when the page hydrated in pieces.
  const shareEventId = eventIdFromShareHref(shareHref);
  const domId = shareEventId ? `evt-${shareEventId.replace(/[^A-Za-z0-9_-]/g, "_")}` : reactId;
  const cardId = persistKey ?? domId;
  const hasPanel = detail != null;
  // A timeline row: one DOM at both widths (ui-jobs 304). Under 640px it draws
  // as the spine segment, the T1 row as the caption under the node, and the
  // body opens beneath it.
  const inTimeline = !pageMode && phoneOpen != null && (captionCtx != null || phoneCaption != null);

  const localOpen = pageMode || (isControlled ? !!detailOpenProp : detailOpenInternal);
  const showDetail = localOpen || (inTimeline && phoneOpen?.openId === cardId);

  // ── Receipts scope — the inspector's per-card roster ──────────────────
  // Every <Prov> value inside this card reports into a per-card registry; the
  // page-level inspector reads it to pin receipts at the values (the per-card
  // provenance tab retired in its favour).
  const registry = useReceiptRegistry();
  // The scope's name for scoped arming (ui-jobs 284): the event's id, read from
  // its share path; a card outside a timeline falls back to the card's key.
  const scopeId = eventIdFromShareHref(shareHref) ?? cardId;
  // Which info section is expanded — the section heading is the button,
  // bridging into the pane below.
  const [openInfoTab, setOpenInfoTab] = useState<string | null>(null);

  // Restore persisted open state after mount (SSR-safe — no hydration mismatch:
  // first render is always closed, matching the server, then this opens it).
  // A phone holds one open card and keeps none across loads.
  useEffect(() => {
    if (persistKey && !isControlled && isCardOpen(persistKey) && !(inTimeline && isPhoneViewport())) {
      setDetailOpenInternal(true);
    }
  }, [persistKey, isControlled, inTimeline]);

  const setLocal = useCallback(
    (next: boolean) => {
      if (isControlled) {
        onDetailToggle?.(next);
      } else {
        setDetailOpenInternal(next);
        if (persistKey) setCardOpen(persistKey, next);
      }
    },
    [isControlled, onDetailToggle, persistKey],
  );
  const rowRef = useRef<HTMLDivElement>(null);
  // One toggle for every control. On a phone (read at click time) a timeline
  // row opens through the one open id, closing any other, and the tapped
  // segment holds its place on screen.
  const toggleDetail = useCallback(
    (anchor?: HTMLElement | null) => {
      const el = anchor ?? rowRef.current;
      if (inTimeline && phoneOpen && isPhoneViewport()) {
        if (!showDetail) {
          if (el) phoneOpen.toggle(cardId, el);
          return;
        }
        if (phoneOpen.openId === cardId && el) phoneOpen.toggle(cardId, el);
        if (localOpen) setLocal(false);
        return;
      }
      const next = !showDetail;
      if (!next && phoneOpen?.openId === cardId && el) phoneOpen.toggle(cardId, el);
      if (next || localOpen) setLocal(next);
    },
    [inTimeline, phoneOpen, showDetail, cardId, localOpen, setLocal],
  );

  // An event naming a token whose decimals did not load (the timeline provides
  // them): the explainer and its teaser give way to one line saying so.
  const unread = useUnreadTokens();
  const explainerTeaser = unread ? undefined : explainerTeaserProp;
  const explainer = unread && explainerProp != null ? <ExplanationNotLoaded tokens={unread} /> : explainerProp;

  const hasDetail = hasPanel;
  const hasExplainer = explainer != null;
  // The desktop header is the card's control; under 640px a timeline row's
  // control is the segment's button.
  const headerToggles = group !== "words" && !pageMode;
  const showChevron = hasDetail && headerToggles;
  // The phone segment's control: every timeline row with a body to open.
  const phoneToggles = inTimeline && hasDetail;

  /* ── Info sections — the headings are the buttons ────────────────── */
  // The story (Explanation, (i) disc): the heading-button expands the shared
  // pane beneath. Per-value evidence lives with the page-level inspector now
  // — a card with no explainer still gets the plain (i) for its footer
  // metadata.
  const infoTabs: InfoDisclosureTab[] = [
    ...(hasExplainer
      ? [
          {
            key: "explanation",
            label: "explanation",
            content: (
              <>
                {explainerTeaser && (
                  <div className="mb-2 flex items-baseline gap-2 text-rb-500">
                    <span className="shrink-0">•</span>
                    <div className="min-w-0 flex-1 leading-relaxed">{explainerTeaser}</div>
                  </div>
                )}
                {explainer}
              </>
            ),
          },
        ]
      : []),
  ];
  const footerNode = txHash ? <EventCardFooter learnMore={learnMore} /> : undefined;

  // The header's chevron slot (ui-jobs 295), after the action word.
  const headChevron =
    showChevron && group !== "summary" ? (
      <span className="inline-flex items-center self-center" data-anatomy="T5" data-evt-head-chev="">
        <DiscChevron isOpen={showDetail} />
      </span>
    ) : null;
  // The number column (ui-jobs 250): in a timeline card, at both widths, the
  // event's number stands in a column at the row's far left; the
  // header draws no number.
  const numberColumnOn = !pageMode;
  const [num, setNumState] = useState<{ number: number; last?: number } | null>(null);
  const setNum = useCallback(
    (n: { number: number; last?: number } | null) =>
      setNumState((cur) => (cur?.number === n?.number && cur?.last === n?.last ? cur : n)),
    [],
  );
  // The number the timeline gives the row, else the one the header hands up.
  const rowNum = captionCtx?.n != null ? { number: captionCtx.n, last: captionCtx.nLast } : num;
  const numberNode = rowNum ? <PlainNumber number={rowNum.number} last={rowNum.last} /> : null;
  // The event menu (⋮) at the right end of the T1 row, at both widths: after
  // the header on desktop, at the caption's right on a phone. A press on it
  // stays with the menu (Escape still reaches the menu's document listener).
  const menuRows = useEventMenuRows(groupMenu ? null : shareHref, !!groupMenu);
  const headMenu =
    !pageMode && menuRows ? (
      <span
        className="-my-1 inline-flex items-center"
        data-event-head-menu=""
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") e.stopPropagation();
        }}
      >
        <EventCardMenu shareHref={groupMenu ? null : shareHref} groupShow={groupMenu} />
      </span>
    ) : null;

  // ── The phone caption: the T1 row under 640px (mobile decision 16) ─────
  // "Repay · 6 Jun '26 13:31", the date once per day as the desktop row
  // states it; a group passes its caption ("Redemptions (48) · 1 Oct '25 – …").
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const kind = custody
    ? `${custody.dir === "to" ? "Sent to" : "Received from"} ${short(custody.address)}`
    : `${caption ?? captionCtx?.kind ?? ""}${by ? ` by ${short(by)}` : ""}`;
  const capDate = captionCtx
    ? (datePrefix ?? (dayMark ? `${shortDate(captionCtx.ts)} ${shortDateYear(captionCtx.ts)}` : null))
    : null;
  const captionText =
    phoneCaption ??
    (captionCtx ? (
      <>
        {kind} &middot; {capDate ? `${capDate} ` : ""}
        {formatTimestamp(captionCtx.ts)}
      </>
    ) : null);
  const spoken = spokenCaption ?? (captionCtx ? `${kind}, ${formatDate(captionCtx.ts)}` : "");
  // The row's name, the same at both widths: the spoken caption, then the
  // legs the column states under `legsId` ("Repay, 6 June 2026: 7,500 BOLD
  // repaid"); a group passes its whole `label`.
  const labelId = `${domId}-label`;
  const legsId = `${domId}-legs`;
  // The whole row is the card's click target (row-target.ts): from 640px
  // where the header is the control, below it where the segment's button
  // is. Hovering it lights the header (`.evt-row-target` in globals.css).
  const rowTarget = !pageMode && (showChevron || phoneToggles);
  const rowClick = useRowTarget(
    rowTarget
      ? () => ((isPhoneViewport() && inTimeline ? phoneToggles : showChevron) ? toggleDetail() : undefined)
      : null,
  );
  // Not actioned by the owner (another actor named, or the card says so):
  // the spine runs dotted below the node (mobile decision 18).
  const actedByOwner = byOwner ?? !by;
  const rowSlot = useMemo(
    () => ({ legsId: inTimeline ? legsId : undefined, target: rowTarget, byOwner: actedByOwner }),
    [inTimeline, legsId, rowTarget, actedByOwner],
  );
  const nameProps = label ? { "aria-label": label } : { "aria-labelledby": `${labelId} ${legsId}` };
  const panelId = `${domId}-card`;

  /* ── Content tiers ──────────────────────────────────────────────── */
  // A timeline row's T1 surface is the desktop header's; under 640px it is the
  // caption on the page's ground. The classes are written out whole: Tailwind
  // generates only the class names it finds in the source.
  const t1 = (
    // The ring: the header of a day's last event flashes after the Lifetime
    // flows chart's "Show timeline to {date}" or the timeline chip brings it
    // into view (flow-day-mark.tsx).
    <div
      data-anatomy="T1"
      className={`relative overflow-visible rounded-xl ring-0 ring-teal-500/0 [transition:color_150ms,background-color_150ms,box-shadow_2000ms] has-[[data-flow-day-flash]]:ring-2 has-[[data-flow-day-flash]]:ring-teal-500/70 ${
        showDetail
          ? inTimeline
            ? "sm:rounded-b-none sm:bg-raised"
            : "rounded-b-none bg-raised"
          : showChevron
            ? `${inTimeline ? "sm:hover:bg-raised" : "hover:bg-raised"} evt-t1-lit`
            : ""
      }${inTimeline ? " spine-t1" : ""}`}
    >
      <div className={`${headMenu ? "pr-[52px]" : ""}${inTimeline ? " max-sm:hidden" : ""}`}>
        <div
          className={`${headerToggles ? "group/evt disc-row disc-row-slow cursor-pointer" : ""}`}
          {...(showChevron
            ? {
                ...disclosureProps<HTMLDivElement>(showDetail, panelId, () => toggleDetail(), "role"),
                ...(inTimeline ? nameProps : {}),
              }
            : {})}
        >
          {/* The header places the chevron after its action word
              (`EventHeadChevron`). A header with no slot for the chevron gets
              it at the right end (`.evt-chev-end`, hidden by app/globals.css
              where the header has its own). */}
          <div
            className={`relative flex items-start gap-2${showChevron && group !== "summary" ? " evt-has-chev" : ""}`}
          >
            <div className={`flex-1 min-w-0 ${headMenu ? "" : "pr-5"}`}>
              <EventTxHashContext.Provider value={txHash ?? null}>
                <EventHeadContext.Provider
                  value={{
                    chevron: headChevron,
                    numberColumn: numberColumnOn ? setNum : undefined,
                  }}
                >
                  {header}
                </EventHeadContext.Provider>
              </EventTxHashContext.Provider>
            </div>
            {showChevron && group !== "summary" && (
              <div
                className="evt-chev-end absolute right-0 top-0 mr-5 mt-[18px] flex items-center gap-1 sm:static"
                data-anatomy="T5"
              >
                <DiscChevron isOpen={showDetail} className="m-1" />
              </div>
            )}
          </div>
          {band}
        </div>
      </div>
      {inTimeline && (
        // Under 640px: the caption centred on the spine, the ⋮ at the row's
        // right edge.
        <div className="relative flex justify-center px-7 pb-2.5 pt-1.5 sm:hidden" data-spine-caption="">
          <span
            aria-hidden
            className={`block max-w-full truncate px-2 text-xs leading-5 ${showDetail ? "text-foreground" : "text-rb-500"}`}
            style={{ backgroundColor: "var(--background)" }}
          >
            {captionText}
          </span>
        </div>
      )}
      {/* The ⋮, once: the T1 row's right end on desktop, the caption's right
          on a phone. */}
      {headMenu && (
        <div className="pointer-events-auto absolute right-4 top-3 max-sm:right-0 max-sm:top-auto max-sm:bottom-[5px]">
          {headMenu}
        </div>
      )}
    </div>
  );

  // The body — opens and closes instantly (no height animation); mounted
  // only while open. flow-root keeps a first child's top margin inside the
  // panel: let through, it opens a seam of page background under the header.
  // On a phone it is the opened card alone, under the caption.
  const panel = showDetail && (
    <div
      id={panelId}
      role={inTimeline ? "region" : undefined}
      aria-labelledby={inTimeline ? labelId : undefined}
      data-spine-card={inTimeline ? cardId : undefined}
      className={`flow-root rounded-b-xl bg-raised${inTimeline ? " max-sm:rounded-t-xl" : ""}`}
      data-anatomy="T2"
    >
      {inTimeline && band && <div className="sm:hidden">{band}</div>}

      {detail}
      {hasPriceRow(price) && <EventPriceRow price={price} />}

      {/* ── Info sections: under a hairline, the (i) Explanation button
               at the bottom-left opens the pane beneath, drawn with no
               panel, with the footer metadata pinned below. A card
               without an explainer keeps the plain (i) for its footer. ── */}
      {(hasExplainer || txHash) && (
        <div className="px-4 pb-3 pt-1">
          {/* The event page: the explanation stands open with no panel,
              under a hairline and the (i) with its heading words, in the
              foreground as the timeline's row is while open (ui-jobs 289). */}
          {pageMode && infoTabs.length > 0 ? (
            <div className="border-t border-rb-300 pt-3 dark:border-rb-700" data-anatomy="T3" data-prov-exempt="">
              <div className="flex items-center gap-2">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground" data-t3-heading="">
                  <svg className="h-5 w-5 text-foreground" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d={INFO_PATH} clipRule="evenodd" />
                  </svg>
                  {EXPLANATION_HEADING}
                </h3>
              </div>
              {infoTabs.map((t) => (
                <div key={t.key} className="pb-3 pt-5 text-sm">
                  {t.content}
                </div>
              ))}
              {footerNode}
            </div>
          ) : infoTabs.length > 0 ? (
            <InfoTabsDisclosure
              bare
              anatomy="T3"
              heading={EXPLANATION_HEADING}
              tabs={infoTabs}
              openTab={openInfoTab}
              onOpenTabChange={setOpenInfoTab}
              footer={footerNode}
            />
          ) : (
            <InfoDisclosure bare footer={footerNode} defaultOpen={pageMode}>
              {null}
            </InfoDisclosure>
          )}
        </div>
      )}
    </div>
  );

  const body = !inTimeline ? panel : showDetail && <div className="spine-body max-sm:mt-2">{panel}</div>;

  const card = (
    <SpineLegsContext.Provider value={spineLegs}>
      <PriceBasisProvider>
        <ProvReceiptsScope registry={registry} scopeId={scopeId}>
          {/* data-skel-section feeds the skeleton memory layer (skeleton-size-recorder):
          the first event card stands for the spine's row height. One DOM at
          both widths (`.spine-row` in app/globals.css): from 640px the spine
          column holds 2/5 of the row beside the card; below it, a timeline
          row's column takes the width with the T1 row drawn as the caption
          under its node, and the body opens beneath. */}
          <div
            ref={rowRef}
            data-skel-section="detail-event"
            data-prov-scope={scopeId}
            className={`${
              pageMode
                ? "flex w-full flex-col max-sm:!px-0 sm:flex-row sm:items-start"
                : `spine-row evt-row${showChevron ? " evt-row-target" : ""}${inTimeline ? " spine-seg" : ""}${showAvatar ? " spine-row-avatar" : ""}`
            } relative ${scale.cardRounded} ${
              muted && !showDetail ? " opacity-60 transition-opacity hover:opacity-100 focus-within:opacity-100" : ""
            }`}
            style={pageMode ? { padding: scale.cardPad } : undefined}
            {...(rowTarget ? rowClick : {})}
            onPointerEnter={onIntent}
            onFocus={onIntent}
          >
            {showAvatar && avatar}
            {page ? (
              // The event page: the column holds the shared side column,
              // stacked above the card below sm, where the row drops its side
              // padding so the paragraph and the card share one width.
              <div className="w-full shrink-0 sm:w-2/5" data-event-page-aside="">
                <EventPageAside page={page} />
              </div>
            ) : (
              <div className="spine-cell" data-anatomy="L3">
                {inTimeline && (
                  <span id={labelId} hidden>
                    {spoken}
                  </span>
                )}
                <SpineRowContext.Provider value={rowSlot}>{iconColumn}</SpineRowContext.Provider>
                {phoneToggles && (
                  // Under 640px the segment, its flank values and its caption
                  // are one button, laid over the column; the glyphs under it
                  // take no pointer.
                  <button
                    data-spine-toggle=""
                    {...disclosureProps<HTMLButtonElement>(showDetail, panelId, () => toggleDetail())}
                    {...nameProps}
                    className="absolute inset-0 z-20 min-h-11 cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] sm:hidden"
                  />
                )}
              </div>
            )}
            <div className={pageMode ? "min-w-0 grow" : "spine-content"}>
              <EventPageContext.Provider value={null}>
                {t1}
                {body}
              </EventPageContext.Provider>
            </div>
            {/* The number column, at the row's far left, level with the
                first node: the event's number, or the boundary's count. After
                the card in the DOM, so the keyboard reaches the header first. */}
            {!pageMode && (
              <div
                className={`spine-num absolute z-20 w-11 justify-center ${inTimeline ? "flex" : "hidden sm:flex"}`}
                data-number-column=""
              >
                {numberSlot ?? numberNode}
              </div>
            )}
          </div>
        </ProvReceiptsScope>
      </PriceBasisProvider>
    </SpineLegsContext.Provider>
  );
  return ledgers && "provider" in ledgers ? ledgers.provider(card) : card;
}
