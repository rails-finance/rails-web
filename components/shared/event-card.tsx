"use client";

import { PriceBasisProvider } from "@/components/shared/price-basis";
import { usePathname } from "next/navigation";
import { useState, useCallback, useEffect, useContext, useId, useMemo, useRef, type ReactNode } from "react";
import { useTimelineScale, useSingleWallet } from "@/components/shared/activity-timeline";
import { DiscChevron } from "@/components/shared/expand-chevron";
import { EventCardFooter } from "@/components/shared/event-card-footer";
import { EventCardMenu, useEventMenuRows } from "@/components/shared/event-card-menu";
import { EventPageAside, EventPageContext } from "@/components/shared/event-page-aside";
import { EVENT_PAGE_WORDS } from "@/lib/shared/event-page-words";
import { SheetCollectContext, type CollectedCard, type GroupLane } from "@/components/shared/group-sheet";
import { disclosureProps } from "@/components/shared/disclosure";
import { EventHeadContext, EventTxHashContext, PlainNumber } from "@/components/shared/event-number-pill";
import { eventIdFromShareHref, useEventShareHref } from "@/components/shared/event-share-context";
import { CardTabStrip } from "@/components/shared/info-disclosure";
import { useTimelineDisplay } from "@/components/shared/timeline-display-context";
import { isCardOpen, setCardOpen } from "@/lib/shared/card-open-store";
import { ProvReceiptsScope, useProvScopeLit, useReceiptRegistry } from "@/components/shared/provenance";
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
import { EventSheetView, SheetSkeleton, type EventSheet } from "@/components/shared/event-sheet";
import { sentByOther, type SentFacts } from "@/lib/shared/external-actor";
import { fetchAddressKind } from "@/lib/api/fetch-address-kind";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";

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
  /** The last of the card's event numbers, where it draws several logs (one
   *  transaction's): the number reads "7–8". */
  numberLast?: number;
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
   *  "Received from 0x…". A receipt draws the spine dotted: the sender
   *  acted. */
  custody?: { dir: "to" | "from"; address: string };
  /** The transaction's sender, the event's caller where its log names one,
   *  and the owner it is judged against: the spine runs dotted where
   *  another account sent it (`sentByOther`, rails-ops ui-jobs 304). */
  sent?: SentFacts;
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

/** T1 as drawn by a card standing for several events or none (a run, the
 *  timeline's boundary, the Lifetime flows moment): its words, span and
 *  counts, laid out by the card. */
export interface EventCardHeadRow {
  row: ReactNode;
}

/** The slot every card fills, whatever it stands for. */
interface EventCardSlotsCommon {
  spine: SpineColumnProps;
  /** The phone caption's kind ("Repay", "Rate 3.60%"); empty, the
   *  timeline's word for the event. */
  caption: string;
  actor?: EventCardActor;
  /** T2's grid: the ordered cells, the cells to come while their figures are
   *  read, or the reason the event has none. */
  cells: EventCells;
  /** T2 as a balance sheet (ui-jobs 330): the side panels and the Risk and
   *  Limits pair, drawn in place of `cells` where a family supplies it. Null:
   *  the family draws a sheet whose figures are still on their way, and
   *  `cells` stands (its placeholders) until they land. */
  sheet?: EventSheet | null;
  /** The balances the event's row states, handed to a group's sheet
   *  (`group-sheet.tsx`, `mergeLaneSheet`) where `sheet` waits on a read the
   *  card makes at open. */
  groupLanes?: GroupLane[];
  /** Data attributes on the grid: the state of the read its figures come
   *  from ("data-position-state": "ready"). */
  cellsData?: Record<string, string>;
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
  /** Run while the body is open: a family whose cells need a read starts it
   *  here, so a closed card asks for nothing. */
  onOpen?: () => void;
  /** A hook the shell runs while the body is open, for a family whose cells,
   *  notes or price wait on a read a closed row must not make (Liquity V1's
   *  receipt read): what it returns stands in for those slots, which hold
   *  the closed card's values (the cells `pending`). A sheet may come from it too. */
  useOpened?: () => EventCardOpened;
}

/** An event's card: T1's head row drawn by the shared `ChainTruthRow`. */
interface EventCardSlotsOfEvent {
  event: EventCardEvent;
  head: ChainTruthRowSpec;
}

/** A card standing for several events or none: no event of its own, so no
 *  stored open state and no footer. With no cells, notes or price it has no
 *  body to open. */
interface EventCardSlotsStandIn {
  event?: undefined;
  head: EventCardHeadRow;
}

export type EventCardSlots = EventCardSlotsCommon & (EventCardSlotsOfEvent | EventCardSlotsStandIn);

/** The slots `useOpened` returns once the body opens. */
export type EventCardOpened = Partial<Pick<EventCardSlots, "cells" | "sheet" | "notes" | "price">>;

/** The body of a card whose slots wait on `useOpened`: mounted with the open
 *  panel, so its read starts when the card opens. */
function OpenedBody({
  slots,
  useOpened,
  breakdown,
}: {
  slots: EventCardSlots;
  useOpened: () => EventCardOpened;
  breakdown: boolean;
}) {
  const opened = useOpened();
  const price = opened.price ?? slots.price;
  const sheet = opened.sheet !== undefined ? opened.sheet : slots.sheet;
  return (
    <>
      {sheet ? (
        <EventSheetView sheet={sheet} breakdown={breakdown} data={slots.cellsData} />
      ) : sheet === null ? (
        <PendingSheet cells={opened.cells ?? slots.cells} />
      ) : (
        <EventCellGrid cells={opened.cells ?? slots.cells} />
      )}
      {opened.notes ?? slots.notes}
      {hasPriceRow(price) && <EventPriceRow price={price} />}
    </>
  );
}

/** A sheet whose figures are on their way: its skeleton, with as many side
 *  panels as the cells name ledgers. Never the cells: the card goes from the
 *  skeleton to the sheet. */
function PendingSheet({ cells }: { cells: EventCells }) {
  const ledgers = "pending" in cells ? cells.pending.filter((c) => c.kind === "ledger").length : 0;
  return <SheetSkeleton sides={ledgers > 0 ? ledgers : 2} />;
}

/** What the shell takes beside the slots: the timeline's and the event
 *  page's. */
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
  /** A group's whole phone caption ("Redemptions", the count's chip, " · 1 Oct
   *  '25 – 12 Oct '25"), in place of the kind and the moment. */
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

/** A card's slots as the shell draws them. */
interface EventCardDrawn {
  iconColumn: ReactNode;
  header: ReactNode;
  band?: ReactNode;
  detail?: ReactNode;
  price?: EventCardPrice;
  explainer?: ReactNode;
  /** Teaser line at the top of the open explanation: the first bullet. */
  explainerTeaser?: ReactNode;
  /** The footer, and the header's number pill when Display's "Transaction
   *  hashes" is on (ui-jobs 294). */
  txHash?: string;
  learnMore?: ReactNode;
  /** The key the open state is kept under in localStorage (uncontrolled
   *  cards only), restored on reload and back-navigation. */
  persistKey?: string;
  caption?: string;
  by?: string;
  byOwner?: boolean;
  custody?: EventCardActor["custody"];
  sent?: SentFacts;
}

export type EventCardProps = EventCardFrame & { slots: EventCardSlots };

/** The slots, as the shell draws them. `breakdown`: the sheet stands with its
 *  carry-forward layer and parameters and no switch (an event's page); else
 *  each opened sheet carries a switch. */
function drawnOf(slots: EventCardSlots, pageMode: boolean, breakdown: boolean): EventCardDrawn {
  const { event, actor, explainer } = slots;
  // A stand-in card with nothing under its row (a run with no sums) opens
  // nothing.
  const bodyless = !event && !slots.sheet && "none" in slots.cells && slots.notes == null && !hasPriceRow(slots.price);
  return {
    iconColumn: <SpineColumn {...slots.spine} />,
    header: slots.event ? (
      <ChainTruthRow
        spec={slots.head}
        timestamp={slots.event.timestamp}
        eventNumber={slots.event.number}
        eventNumberLast={slots.event.numberLast}
        variant={pageMode ? "page" : "row"}
      />
    ) : (
      slots.head.row
    ),
    band: slots.band,
    detail: bodyless ? undefined : slots.useOpened ? (
      <OpenedBody slots={slots} useOpened={slots.useOpened} breakdown={breakdown} />
    ) : (
      <>
        {slots.sheet ? (
          <EventSheetView sheet={slots.sheet} breakdown={breakdown} data={slots.cellsData} />
        ) : slots.sheet === null ? (
          <PendingSheet cells={slots.cells} />
        ) : (
          <EventCellGrid cells={slots.cells} data={slots.cellsData} />
        )}
        {slots.notes}
      </>
    ),
    // A card read on open draws its price row inside `OpenedBody`.
    price: slots.useOpened ? undefined : slots.price,
    explainer: explainer.body,
    explainerTeaser: explainer.grouped ? undefined : explainer.first,
    txHash: event?.txHash,
    learnMore: slots.learnMore,
    persistKey: event ? `${event.family}:${event.id}` : undefined,
    // An empty kind leaves the timeline's word for the event.
    caption: slots.caption || undefined,
    by: actor?.by,
    byOwner: actor?.byOwner,
    custody: actor?.custody,
    sent: actor?.sent,
  };
}

/* ── EventCard ───────────────────────────────────────────────────────── */

type CardTab = "explanation" | "figures";
const CARD_TABS: { key: CardTab; label: string }[] = [
  { key: "explanation", label: "Explanation" },
  { key: "figures", label: "Figures" },
];

/** Whether the owner the sender test judges against is a key-controlled
 *  account, read from its code (one cached request per address) only where
 *  the sender alone decides: no caller, and another address sent the
 *  transaction. Undefined until known, which judges nothing. */
function useOwnerIsAccount(sent: SentFacts | undefined): boolean | undefined {
  const owner = sent?.owner?.toLowerCase();
  const asks =
    sent?.ownerIsAccount === undefined &&
    !sent?.caller &&
    !!owner &&
    !!sent?.txFrom &&
    sent.txFrom.toLowerCase() !== owner;
  const chainId = sent?.chainId ?? MAINNET_CHAIN_ID;
  const [kind, setKind] = useState<{ owner: string; account: boolean } | null>(null);
  useEffect(() => {
    if (!asks || !owner) return;
    let live = true;
    fetchAddressKind(owner, chainId).then((k) => {
      if (live && k) setKind({ owner, account: k.kind === "account" || k.kind === "delegated" });
    });
    return () => {
      live = false;
    };
  }, [asks, owner, chainId]);
  if (sent?.ownerIsAccount !== undefined) return sent.ownerIsAccount;
  return kind && kind.owner === owner ? kind.account : undefined;
}

/** A member of a group whose summary card reads its members' sheets
 *  (`group-sheet.tsx`): it hands up its slots and draws nothing. */
function CollectedEventCard({
  slots,
  collect,
}: {
  slots: EventCardSlots;
  collect: (card: CollectedCard) => () => void;
}) {
  const { event, sheet, price, groupLanes } = slots;
  useEffect(() => {
    if (!event) return;
    return collect({
      id: event.id,
      timestamp: event.timestamp,
      blockNumber: event.blockNumber,
      number: event.number,
      sheet,
      price,
      lanes: groupLanes,
    });
  }, [collect, event, sheet, price, groupLanes]);
  return null;
}

export function EventCard(props: EventCardProps) {
  const collect = useContext(SheetCollectContext);
  return collect ? <CollectedEventCard slots={props.slots} collect={collect} /> : <EventCardView {...props} />;
}

function EventCardView(props: EventCardProps) {
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
  // The full breakdown (ui-jobs 330): always on at an event's page, the event
  // page's card or the card a family's event URL pins on its position page;
  // elsewhere the switch above each opened sheet.
  const pathname = usePathname();
  const ownPage = useEventShareHref()?.split("?")[0];
  const breakdown = pageMode || (ownPage != null && pathname === ownPage);
  const drawn = drawnOf(props.slots, pageMode, breakdown);
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
    sent,
  } = drawn;
  const { ledgers, onIntent, onOpen } = props.slots;
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
  useEffect(() => {
    if (showDetail) onOpen?.();
  }, [showDetail, onOpen]);

  // ── Receipts scope — the inspector's per-card roster ──────────────────
  // Every <Prov> value inside this card reports into a per-card registry; the
  // page-level inspector reads it to pin receipts at the values (the per-card
  // provenance tab retired in its favour).
  const registry = useReceiptRegistry();
  // The scope's name for scoped arming (ui-jobs 284): the event's id, read from
  // its share path; a card outside a timeline falls back to the card's key.
  const scopeId = eventIdFromShareHref(shareHref) ?? cardId;
  const lit = useProvScopeLit(scopeId);
  // The opened timeline card's tab (ui-jobs 370): each card keeps its own,
  // opening on the Display preference's default and reset to it when the
  // preference changes.
  const { figuresFirst } = useTimelineDisplay();
  const [openTab, setOpenTab] = useState<CardTab>(figuresFirst ? "figures" : "explanation");
  useEffect(() => {
    setOpenTab(figuresFirst ? "figures" : "explanation");
  }, [figuresFirst]);

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

  /* ── Explanation and Figures (rails-ops TO-DO-ui-jobs 370) ─────────── */
  // The explanation reads before the figures. A timeline card with both shows
  // one at a time under the Explanation | Figures tabs; the event page stands
  // the explanation open above the figures. A card with one of the two shows
  // it alone.
  const explanationNode = hasExplainer ? (
    <>
      {explainerTeaser && (
        <div className="mb-2 flex items-baseline gap-2 text-rb-500">
          <span className="shrink-0">•</span>
          <div className="min-w-0 flex-1 leading-relaxed">{explainerTeaser}</div>
        </div>
      )}
      {explainer}
    </>
  ) : null;
  const footerNode = txHash ? <EventCardFooter learnMore={learnMore} /> : undefined;
  const hasFigures = hasPanel || hasPriceRow(price);
  const tabbed = !pageMode && hasExplainer && hasFigures;
  // The explanation, with the Learn more "?" at its end. The strip and the
  // explanation start on the head's text (its `pl-5`).
  const explanationRegion = hasExplainer ? (
    <div className="pb-1 pl-5 pr-4" data-anatomy="T3" data-prov-exempt="">
      <div className="pb-3 pt-4 text-sm">{explanationNode}</div>
      {footerNode}
    </div>
  ) : null;
  const figuresNode = hasFigures ? (
    <>
      {detail}
      {hasPriceRow(price) && <EventPriceRow price={price} />}
    </>
  ) : null;

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
  // the header on desktop, at the caption's right on a phone. On the event
  // page it carries the event's "Inspect provenance". A press on it stays
  // with the menu (Escape still reaches the menu's document listener).
  const menuRows = useEventMenuRows(groupMenu ? null : shareHref, !!groupMenu);
  const headMenu =
    pageMode || menuRows ? (
      <span
        className="inline-flex items-center"
        data-event-head-menu=""
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") e.stopPropagation();
        }}
      >
        <EventCardMenu
          shareHref={groupMenu ? null : shareHref}
          groupShow={groupMenu}
          provScope={pageMode ? { id: scopeId, hint: EVENT_PAGE_WORDS.provenance_hint } : undefined}
        />
      </span>
    ) : null;

  // ── The phone caption: the T1 row under 640px (mobile decision 16) ─────
  // "Repay · 6 Jun '26 13:31", the date once per day as the desktop row
  // states it; a group passes its caption ("Redemptions", the count's chip,
  // " · 1 Oct '25 – …").
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
        {kind} &middot; {capDate && <span className="text-foreground">{capDate}</span>}
        {capDate ? " " : ""}
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
  // Not actioned by the owner (another actor named, a receipt from another
  // account, a transaction another account sent, or the card says so): the
  // spine runs dotted below the node (mobile decision 18; ui-jobs 304).
  const ownerIsAccount = useOwnerIsAccount(sent);
  const actedByOwner = byOwner ?? !(by || custody?.dir === "from" || sentByOther(sent && { ...sent, ownerIsAccount }));
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
    // flows cursor through "Sync to chart" or the timeline chip brings it
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
          on a timeline row under 640px. Its slot is the line box it sits on,
          centred in it: the header row's first line (\`pt-4\`, 24px, the
          \`evt-meta\` height), or the caption's (\`pb-2.5\`, 20px). */}
      {headMenu && (
        <div
          className={`pointer-events-auto absolute right-4 top-4 flex h-6 items-center${
            inTimeline ? " max-sm:right-0 max-sm:top-auto max-sm:bottom-2.5 max-sm:h-5" : ""
          }`}
        >
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
      data-card-tab-open={tabbed ? openTab : undefined}
    >
      {inTimeline && band && <div className="sm:hidden">{band}</div>}

      {tabbed && (
        <CardTabStrip
          className="pl-5 pr-4 pt-3"
          idBase={domId}
          tabs={CARD_TABS}
          openTab={openTab}
          onOpenTabChange={(key) => setOpenTab(key as CardTab)}
        />
      )}
      {tabbed ? (
        <div id={`${domId}-panel`} role="tabpanel" aria-labelledby={`${domId}-tab-${openTab}`}>
          {openTab === "figures" ? figuresNode : explanationRegion}
        </div>
      ) : (
        <>
          {explanationRegion}
          {figuresNode}
        </>
      )}
      {/* A card with figures and no explanation keeps the footer under them. */}
      {!hasExplainer && footerNode}
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
            data-prov-lit={lit ? "" : undefined}
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
