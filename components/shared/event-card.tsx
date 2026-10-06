"use client";

import { useState, useCallback, useEffect, useContext, useId } from "react";
import { useTimelineScale, useSingleWallet } from "@/components/shared/activity-timeline";
import { ExpandChevron } from "@/components/shared/expand-chevron";
import { EventCardFooter } from "@/components/shared/event-card-footer";
import { EventCardMenu, EventMenuSlot, type EventMenuWords } from "@/components/shared/event-card-menu";
import { TxHashBadge } from "@/components/shared/tx-hash-badge";
import { useEventShareHref } from "@/components/shared/event-share-context";
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
import { EventCaptionContext, SpineSegment, useSpineView } from "@/components/shared/mobile-spine";
import { EventDateContext } from "@/components/shared/event-time";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { formatDate } from "@/lib/date";

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

export interface EventCardProps {
  avatar: React.ReactNode;
  iconColumn: React.ReactNode;
  header: React.ReactNode;
  /** Optional row that sits below the header flex row but still inside the
   * header panel container. Rendered at full panel width so its two-column
   * grid aligns with the two-column grid in `detail` below. */
  headerBars?: React.ReactNode;
  detail?: React.ReactNode;
  detailLabel?: string;
  detailIcon?: React.ReactNode;
  explainer?: React.ReactNode;
  explainerLabel?: string;
  explainerIcon?: React.ReactNode;
  detailOpen?: boolean;
  onDetailToggle?: (isOpen: boolean) => void;
  detailLoading?: boolean;
  detailError?: boolean;
  onDetailRetry?: () => void;
  priceBadge?: React.ReactNode;
  /** Teaser line shown at the bottom of the detail panel — first explainer bullet */
  explainerTeaser?: React.ReactNode;
  /** How the teaser reads: "bullet" (default) keeps the leading • glyph; "prose"
   *  renders it as a plain lead paragraph with no glyph. */
  explainerTeaserVariant?: "bullet" | "prose";
  /** Transaction hash: the hash at the right end of T3's row, and the event
   *  menu (`menuInDetail`). */
  txHash?: string;
  /** A word before the hash ("Transaction"). Unset changes nothing. */
  txHashLabel?: string;
  /** Content before the footer's "?" (a family's gas where it has no price
   *  row in T2). */
  footerExtra?: React.ReactNode;
  /** The Learn-More "?" trigger (a `<LearnMore inline …/>`), alone at the
   *  right end of the footer (T6). */
  learnMore?: React.ReactNode;
  /** The event menu's words, where a family's strings file has them. */
  menuWords?: EventMenuWords;
  /** The family's rows at the end of the event menu (Liquity V2's Copy for
   *  LLM). */
  menuExtra?: React.ReactNode;
  /** The family's `detail` draws a price row that places the event menu at
   *  its right end (`useEventMenuSlot`). Unset, the menu stands in T6 before
   *  the "?". */
  menuInDetail?: boolean;
  /** Suppress the expand/collapse chevron and the header's click-to-toggle
   *  affordance. Used by the simulator shell where detail is always open and
   *  the only dismiss action is an explicit close button. */
  hideDetailChevron?: boolean;
  /** Stable, globally-unique id for this card. When set (and the detail panel
   *  is uncontrolled), the expanded/collapsed state is persisted to
   *  localStorage and restored on reload / back-navigation. */
  persistKey?: string;
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
  /** The phone spine view's caption kind, where the card's label differs from
   *  the event's `actionLabel` (which the timeline provides by default). */
  caption?: string;
  /** A control at the right of the open card's (i) row (the Aave and
   *  Liquity families' calculator). */
  infoAction?: React.ReactNode;
  /** The event page's card (rails-ops TO-DO-ui-jobs 236): what stands in the
   *  spine's column, beside the card from 640px and above it below. Set with
   *  `hideDetailChevron` and `detailOpen`; unset, the card is the timeline's. */
  pageAside?: React.ReactNode;
  /** The words after T3's (i): the button's on the timeline, the heading's
   *  on the event page. A family's strings file can replace the default. */
  explanationHeading?: string;
}

/* ── EventCard ───────────────────────────────────────────────────────── */

export function EventCard({
  avatar,
  iconColumn,
  header,
  headerBars,
  detail,
  detailLabel,
  explainer: explainerProp,
  detailOpen: detailOpenProp,
  onDetailToggle,
  detailLoading,
  detailError,
  onDetailRetry,
  priceBadge,
  explainerTeaser: explainerTeaserProp,
  explainerTeaserVariant = "bullet",
  txHash,
  txHashLabel,
  footerExtra,
  learnMore,
  hideDetailChevron,
  persistKey,
  muted,
  caption,
  infoAction,
  pageAside,
  explanationHeading = "Event explanation",
  menuWords,
  menuExtra,
  menuInDetail,
}: EventCardProps) {
  const scale = useTimelineScale();
  const singleWallet = useSingleWallet();
  const showAvatar = !singleWallet && !!avatar;
  // The event page's path, for the event menu: null outside a timeline.
  const shareHref = useEventShareHref();

  const [detailOpenInternal, setDetailOpenInternal] = useState(false);

  const isControlled = detailOpenProp !== undefined;

  // ── The phone spine view (components/shared/mobile-spine.tsx) ─────────
  // A card draws as its spine segment and caption, one button; the card
  // opens under it, one card open on the timeline at a time (a card with no
  // panel opens to its header). Run and folder rows draw their own segment
  // (`TimelineRunCard`), so a card that hides its chevron is not one here.
  const spineView = useSpineView();
  const captionCtx = useContext(EventCaptionContext);
  const reactId = useId();
  const cardId = persistKey ?? reactId;
  const hasPanel = detail != null || !!detailLoading || !!detailError;
  const spine = spineView && !hideDetailChevron && captionCtx ? spineView : null;
  const spineOpen = !!spine && spine.openId === cardId;

  const showDetail = spine ? spineOpen : isControlled ? detailOpenProp : detailOpenInternal;

  // ── Receipts scope — the inspector's per-card roster ──────────────────
  // Every <Prov> value inside this card reports into a per-card registry; the
  // page-level inspector reads it to pin receipts at the values (the per-card
  // provenance tab retired in its favour).
  const registry = useReceiptRegistry();
  // Which info section is expanded — the section heading is the button,
  // bridging into the pane below.
  const [openInfoTab, setOpenInfoTab] = useState<string | null>(null);
  // The event page's card (`pageAside`): the explanation and the footer stand
  // open, with no toggle.
  const pageMode = pageAside != null;

  // Restore persisted open state after mount (SSR-safe — no hydration mismatch:
  // first render is always closed, matching the server, then this opens it).
  useEffect(() => {
    if (persistKey && !isControlled && isCardOpen(persistKey)) {
      setDetailOpenInternal(true);
    }
  }, [persistKey, isControlled]);

  const toggleDetail = useCallback(() => {
    const next = !showDetail;
    if (isControlled) {
      onDetailToggle?.(next);
    } else {
      setDetailOpenInternal(next);
      if (persistKey) setCardOpen(persistKey, next);
    }
  }, [showDetail, isControlled, onDetailToggle, persistKey]);

  // An event naming a token whose decimals did not load (the timeline provides
  // them): the explainer and its teaser give way to one line saying so.
  const unread = useUnreadTokens();
  const explainerTeaser = unread ? undefined : explainerTeaserProp;
  const explainer = unread && explainerProp != null ? <ExplanationNotLoaded tokens={unread} /> : explainerProp;

  const hasDetail = hasPanel;
  const hasExplainer = explainer != null;
  // In the spine view the segment is the control, so the header is not one.
  const headerToggles = !hideDetailChevron && !spine;
  const showChevron = hasDetail && headerToggles;

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
            label: "Explanation",
            content: (
              <>
                {explainerTeaser &&
                  (explainerTeaserVariant === "prose" ? (
                    // Prose teaser: the lead sentence as its own paragraph, no
                    // glyph. A <p> so the pane always carries a paragraph even
                    // when the explainer body (the rest) is empty.
                    <p className="mb-2 text-sm leading-relaxed text-rb-500">{explainerTeaser}</p>
                  ) : (
                    <div className="mb-2 flex items-baseline gap-2 text-rb-500">
                      <span className="shrink-0">•</span>
                      <div className="min-w-0 flex-1 leading-relaxed">{explainerTeaser}</div>
                    </div>
                  ))}
                {explainer}
              </>
            ),
          },
        ]
      : []),
  ];
  const menuNode = txHash ? (
    <EventCardMenu txHash={txHash} shareHref={shareHref} words={menuWords} extra={menuExtra} />
  ) : null;
  const footerNode = txHash ? (
    <EventCardFooter extra={footerExtra} menu={menuInDetail ? undefined : menuNode} learnMore={learnMore} />
  ) : undefined;

  // The (i) row's right end, before its chevron and reachable with the
  // explanation closed: the card's action, then the transaction hash.
  const infoActionNode =
    infoAction || txHash ? (
      <div className="flex shrink-0 items-center gap-2 self-center" onClick={(e) => e.stopPropagation()}>
        {infoAction && <div className="-my-2 flex items-center sm:my-0">{infoAction}</div>}
        {txHash && <TxHashBadge txHash={txHash} label={txHashLabel} />}
      </div>
    ) : undefined;

  /* ── Content tiers ──────────────────────────────────────────────── */
  const contentTiers = (
    <div className="min-w-0 grow">
      {/* ── Header panel ─────────────────────────────────────────── */}
      {/* The ring: the header of a day's last event flashes after the Lifetime
          flows chart's "Show timeline to {date}" or the timeline chip brings it into
          view (flow-day-mark.tsx). */}
      <div
        data-anatomy="T1"
        className={`overflow-visible rounded-xl ring-0 ring-teal-500/0 [transition:color_150ms,background-color_150ms,box-shadow_2000ms] has-[[data-flow-day-flash]]:ring-2 has-[[data-flow-day-flash]]:ring-teal-500/70 ${
          showDetail ? "rounded-b-none bg-raised" : hasDetail ? "hover:bg-raised" : ""
        }`}
      >
        <div
          className={headerToggles ? "group/evt cursor-pointer" : ""}
          onClick={() => {
            if (hasDetail && headerToggles) toggleDetail();
          }}
          role={headerToggles ? "button" : undefined}
          tabIndex={headerToggles ? 0 : undefined}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && hasDetail && headerToggles) {
              e.preventDefault();
              toggleDetail();
            }
          }}
        >
          {/* The header's right-hand cluster: the expand chevron only (the
              share control is in the event menu, event-card-menu.tsx). Below sm the cluster
              leaves the flex row for the header's top-right corner and the
              header's `.evt-meta` row lines up beside it, reserving width
              for the chevron when present — see the `.evt-meta` rules in
              app/globals.css. */}
          <div className={`relative flex items-start gap-2${showChevron ? " evt-has-chev" : ""}`}>
            <div className={`flex-1 min-w-0${showChevron ? "" : " pr-5"}`}>{header}</div>
            {showChevron && (
              <div
                className="absolute right-0 top-0 mr-5 mt-[18px] flex items-center gap-1 sm:static"
                data-anatomy="T5"
              >
                <ExpandChevron isOpen={showDetail} group="evt" />
              </div>
            )}
          </div>
          {headerBars}
          {priceBadge && <div className="flex justify-end px-5 pb-2 -mt-1">{priceBadge}</div>}
        </div>
      </div>

      {/* ── Detail panel — opens and closes instantly (no height
            animation); mounted only while open. flow-root keeps a first
            child's top margin inside the panel: let through, it opens a seam
            of page background under the header. ─────────────────────── */}
      {showDetail && (
        <div className="flow-root rounded-b-xl bg-raised" data-anatomy="T2">
          {detailLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm ">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-2 animate-ping rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-blue-500" />
              </span>
              Loading&hellip;
            </div>
          )}

          {detailError && !detailLoading && (
            <div className="flex items-center justify-center gap-2 py-8">
              <span className="text-sm text-red-500">Failed to load data.</span>
              {onDetailRetry && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDetailRetry();
                  }}
                  className="text-sm text-blue-500 hover:underline"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {/* `detailLabel` names the pane for a reader moving by heading —
              sr-only because the pane's own content already carries the
              visible structure (rails-ops TO-DO-ui-jobs item 76: the prop
              was declared and passed by every protocol but never rendered,
              so the pane opened with no heading at all). A visible
              treatment is a separate design call; this fixes the
              accessibility gap without it. */}
          {detailLabel && <h3 className="sr-only">{detailLabel}</h3>}
          {menuInDetail ? <EventMenuSlot.Provider value={menuNode}>{detail}</EventMenuSlot.Provider> : detail}

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
                      <svg
                        className="h-5 w-5 text-foreground"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path fillRule="evenodd" d={INFO_PATH} clipRule="evenodd" />
                      </svg>
                      {explanationHeading}
                    </h3>
                    <div className="ml-auto">{infoActionNode}</div>
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
                  heading={explanationHeading}
                  tabs={infoTabs}
                  openTab={openInfoTab}
                  onOpenTabChange={setOpenInfoTab}
                  footer={footerNode}
                  rowExtra={infoActionNode}
                />
              ) : (
                <InfoDisclosure
                  bare
                  footer={footerNode}
                  rowExtra={infoActionNode && <div className="ml-auto">{infoActionNode}</div>}
                  defaultOpen={pageMode}
                >
                  {null}
                </InfoDisclosure>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (spine && captionCtx) {
    const kind = caption ?? captionCtx.kind;
    const date = `${shortDate(captionCtx.ts)} ${shortDateYear(captionCtx.ts)}`;
    return (
      <ProvReceiptsScope registry={registry}>
        <SpineSegment
          wrapperProps={{ "data-skel-section": "detail-event" }}
          caption={
            <>
              {kind} &middot; {date}
            </>
          }
          spokenCaption={`${kind}, ${formatDate(captionCtx.ts)}`}
          open={spineOpen}
          onToggle={(anchor) => spine.toggle(cardId, anchor)}
          iconColumn={iconColumn}
          cardKey={cardId}
          card={
            // The opened card states its date in full: the caption above it
            // drops the time, and the list's once-a-day prefix does not apply
            // to a card read alone.
            <EventDateContext.Provider value={date}>{contentTiers}</EventDateContext.Provider>
          }
        />
      </ProvReceiptsScope>
    );
  }

  return (
    <ProvReceiptsScope registry={registry}>
      {/* data-skel-section feeds the skeleton memory layer (skeleton-size-recorder):
          the first event card stands for the spine's row height. */}
      <div
        data-skel-section="detail-event"
        className={`flex w-full ${pageMode ? "flex-col max-sm:!px-0 sm:flex-row sm:items-start" : "items-start"} relative ${scale.cardRounded}${
          muted && !showDetail ? " opacity-60 transition-opacity hover:opacity-100 focus-within:opacity-100" : ""
        }`}
        style={{ "--card-pad": `${scale.cardPad}px`, padding: scale.cardPad } as React.CSSProperties}
      >
        {showAvatar && avatar}
        {/* Spine area — 2/5 width at ≥sm (640px), hidden below (values move into the
            header there). Matches the sm breakpoint the card's own detail grid uses,
            so the spine and the card body reflow together. On the event page the
            column holds `pageAside`, stacked above the card below sm, where the row
            drops its side padding so the paragraph and the card share one width. */}
        {pageMode ? (
          <div className="w-full shrink-0 sm:w-2/5" data-event-page-aside="">
            {pageAside}
          </div>
        ) : (
          <div className="hidden sm:flex w-2/5 shrink-0 self-stretch items-stretch justify-center" data-anatomy="L3">
            {iconColumn}
          </div>
        )}
        {contentTiers}
      </div>
    </ProvReceiptsScope>
  );
}
