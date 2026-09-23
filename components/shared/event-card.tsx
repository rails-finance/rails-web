"use client";

import { useState, useCallback, useEffect } from "react";
import { useTimelineScale, useSingleWallet } from "@/components/shared/activity-timeline";
import { ExpandChevron } from "@/components/shared/expand-chevron";
import { EventCardFooter } from "@/components/shared/event-card-footer";
import { useEventShareHref } from "@/components/shared/event-share-context";
import { InfoDisclosure, InfoTabsDisclosure, type InfoDisclosureTab } from "@/components/shared/info-disclosure";
import { isCardOpen, setCardOpen } from "@/lib/shared/card-open-store";
import { ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";

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
}

/* ── EventCard ───────────────────────────────────────────────────────── */

export function EventCard({
  avatar,
  iconColumn,
  header,
  headerBars,
  detail,
  explainer,
  detailOpen: detailOpenProp,
  onDetailToggle,
  detailLoading,
  detailError,
  onDetailRetry,
  priceBadge,
  explainerTeaser,
  explainerTeaserVariant = "bullet",
  txHash,
  footerExtra,
  learnMore,
  hideDetailChevron,
  persistKey,
  muted,
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
  const showDetail = isControlled ? detailOpenProp : detailOpenInternal;

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

  const hasDetail = detail != null || detailLoading || detailError;
  const hasExplainer = explainer != null;
  const showChevron = hasDetail && !hideDetailChevron;

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
          className={hideDetailChevron ? "" : "group/evt cursor-pointer"}
          onClick={() => {
            if (hasDetail && !hideDetailChevron) toggleDetail();
          }}
          role={hideDetailChevron ? undefined : "button"}
          tabIndex={hideDetailChevron ? undefined : 0}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && hasDetail && !hideDetailChevron) {
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
            animation); mounted only while open. ──────────────────────── */}
      {showDetail && (
        <div className="rounded-b-xl bg-raised">
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
