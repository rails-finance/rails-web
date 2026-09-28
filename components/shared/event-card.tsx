"use client";

import { useState, useCallback, useEffect, useContext, useId } from "react";
import { useTimelineScale, useSingleWallet } from "@/components/shared/activity-timeline";
import { ExpandChevron } from "@/components/shared/expand-chevron";
import { EventCardFooter } from "@/components/shared/event-card-footer";
import { useEventShareHref } from "@/components/shared/event-share-context";
import { InfoDisclosure, InfoTabsDisclosure, type InfoDisclosureTab } from "@/components/shared/info-disclosure";
import { isCardOpen, setCardOpen } from "@/lib/shared/card-open-store";
import { ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { useUnreadTokens } from "@/components/shared/unread-tokens-context";
import type { UnreadToken } from "@/lib/shared/types/event-shape";
import { EventCaptionContext, SpineRowContext, useSpineView } from "@/components/shared/mobile-spine";
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
  /** Transaction hash — enables shared footer with Etherscan + TxHashBadge */
  txHash?: string;
  /** Extra content in the footer row (e.g., Liquity collateral price) */
  footerExtra?: React.ReactNode;
  /** The Learn-More "?" trigger (a `<LearnMore inline …/>`), rendered at the
   *  right end of the footer row — the same row as the tx links. */
  learnMore?: React.ReactNode;
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
  footerExtra,
  learnMore,
  hideDetailChevron,
  persistKey,
  muted,
  caption,
}: EventCardProps) {
  const scale = useTimelineScale();
  const singleWallet = useSingleWallet();
  const showAvatar = !singleWallet && !!avatar;
  // Read here, at the card shell level, and passed down to `EventCardFooter`
  // — the footer is where the share control renders, but this shell is what
  // knows whether a share href exists at all (outside a timeline, it doesn't).
  const shareHref = useEventShareHref();

  const [detailOpenInternal, setDetailOpenInternal] = useState(false);

  const isControlled = detailOpenProp !== undefined;

  // ── The phone spine view (components/shared/mobile-spine.tsx) ─────────
  // A card with a detail panel draws as its spine segment and caption, one
  // button; the panel opens under it, one card open on the timeline at a
  // time. Rows without a panel (runs and folders) keep the list layout.
  const spineView = useSpineView();
  const captionCtx = useContext(EventCaptionContext);
  const reactId = useId();
  const cardId = persistKey ?? reactId;
  const hasPanel = detail != null || !!detailLoading || !!detailError;
  const spine = spineView && hasPanel && !hideDetailChevron && captionCtx ? spineView : null;
  const spineOpen = !!spine && spine.openId === cardId;
  const [spokenLegs, setSpokenLegs] = useState<string | null>(null);

  const showDetail = spine ? spineOpen : isControlled ? detailOpenProp : detailOpenInternal;

  // ── Receipts scope — the inspector's per-card roster ──────────────────
  // Every <Prov> value inside this card reports into a per-card registry; the
  // page-level inspector reads it to pin receipts at the values (the per-card
  // provenance tab retired in its favour).
  const registry = useReceiptRegistry();
  // Which info section is expanded — the section heading is the button,
  // bridging into the pane below.
  const [openInfoTab, setOpenInfoTab] = useState<string | null>(null);

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
  const footerNode = txHash ? (
    <EventCardFooter txHash={txHash} extra={footerExtra} learnMore={learnMore} shareHref={shareHref ?? undefined} />
  ) : undefined;

  /* ── Content tiers ──────────────────────────────────────────────── */
  const contentTiers = (
    <div className="min-w-0 grow">
      {/* ── Header panel ─────────────────────────────────────────── */}
      <div
        className={`overflow-visible rounded-xl transition-colors ${
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
          {/* The header's right-hand cluster: the expand chevron only — the
              share control moved into the footer (2026-09-11; see
              `CopyEventLink` in event-card-footer.tsx). Below sm the cluster
              leaves the flex row for the header's top-right corner and the
              header's `.evt-meta` row lines up beside it, reserving width
              for the chevron when present — see the `.evt-meta` rules in
              app/globals.css. */}
          <div className={`relative flex items-start gap-2${showChevron ? " evt-has-chev" : ""}`}>
            <div className="flex-1 min-w-0">{header}</div>
            {showChevron && (
              <div className="absolute right-0 top-0 mr-5 mt-[18px] flex items-center gap-1 sm:static">
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
        <div className="flow-root rounded-b-xl bg-raised">
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
          {detail}

          {/* ── Info sections: the (i) Explanation heading is its own button
                   at the bottom-left, bridging into the pane beneath with the
                   footer metadata pinned below. A card without an explainer
                   keeps the plain (i) for its footer. ── */}
          {(hasExplainer || txHash) && (
            <div className="px-4 pb-3 pt-1">
              {infoTabs.length > 0 ? (
                <InfoTabsDisclosure
                  tabs={infoTabs}
                  openTab={openInfoTab}
                  onOpenTabChange={setOpenInfoTab}
                  footer={footerNode}
                />
              ) : (
                <InfoDisclosure footer={footerNode}>{null}</InfoDisclosure>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (spine && captionCtx) {
    const kind = caption ?? captionCtx.kind;
    const labelId = `${reactId}-label`;
    const spokenCaption = `${kind}, ${formatDate(captionCtx.ts)}`;
    const regionId = `${reactId}-card`;
    const captionNode = (
      <span
        aria-hidden
        className={`block max-w-full truncate px-2 text-xs leading-5 ${spineOpen ? "text-foreground" : "text-rb-500"}`}
        style={{ backgroundColor: "var(--background)" }}
      >
        {kind} &middot; {shortDate(captionCtx.ts)} {shortDateYear(captionCtx.ts)}
      </span>
    );
    return (
      <ProvReceiptsScope registry={registry}>
        <div
          data-skel-section="detail-event"
          className={`flex w-full flex-col relative ${scale.cardRounded}`}
          style={{ "--card-pad": `${scale.cardPad}px`, padding: scale.cardPad } as React.CSSProperties}
        >
          {/* The segment, its flank values and its caption are one button. The
              glyphs are hidden from screen readers and inert to the pointer;
              the button's name is the caption and the legs the spine column
              reports ("Repay, 6 Feb 2026: 7,500 BOLD repaid"). */}
          <button
            type="button"
            data-spine-toggle=""
            aria-expanded={spineOpen}
            aria-controls={spineOpen ? regionId : undefined}
            aria-label={spokenLegs ? `${spokenCaption}: ${spokenLegs}` : spokenCaption}
            onClick={(e) => spine.toggle(cardId, e.currentTarget)}
            className="hidden w-full min-h-11 cursor-pointer items-stretch justify-center rounded-xl text-left mspine:max-sm:flex focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          >
            <span aria-hidden className="pointer-events-none flex w-full items-stretch justify-center">
              <SpineRowContext.Provider value={{ caption: captionNode, setLegs: setSpokenLegs }}>
                {iconColumn}
              </SpineRowContext.Provider>
            </span>
            <span id={labelId} hidden>
              {spokenCaption}
            </span>
          </button>
          {spineOpen && (
            <div
              role="region"
              id={regionId}
              aria-labelledby={labelId}
              data-spine-card={cardId}
              // Positioned, so it paints over the line running down from the
              // segment above it.
              className="relative mt-2 w-full"
            >
              {/* The opened card states its date in full: the caption above
                  it drops the time, and the list's once-a-day prefix does not
                  apply to a card read alone. */}
              <EventDateContext.Provider value={`${shortDate(captionCtx.ts)} ${shortDateYear(captionCtx.ts)}`}>
                {contentTiers}
              </EventDateContext.Provider>
            </div>
          )}
        </div>
      </ProvReceiptsScope>
    );
  }

  return (
    <ProvReceiptsScope registry={registry}>
      {/* data-skel-section feeds the skeleton memory layer (skeleton-size-recorder):
          the first event card stands for the spine's row height. */}
      <div
        data-skel-section="detail-event"
        className={`flex w-full items-start relative ${scale.cardRounded}${
          muted && !showDetail ? " opacity-60 transition-opacity hover:opacity-100 focus-within:opacity-100" : ""
        }`}
        style={{ "--card-pad": `${scale.cardPad}px`, padding: scale.cardPad } as React.CSSProperties}
      >
        {showAvatar && avatar}
        {/* Spine area — 2/5 width at ≥sm (640px), hidden below (values move into the
            header there). Matches the sm breakpoint the card's own detail grid uses,
            so the spine and the card body reflow together. */}
        <div className="hidden sm:flex w-2/5 shrink-0 self-stretch items-stretch justify-center">{iconColumn}</div>
        {contentTiers}
      </div>
    </ProvReceiptsScope>
  );
}
