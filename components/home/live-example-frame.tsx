"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { OraclePricesData } from "@/types/api/oracle";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isLiquityEvent } from "@/lib/shared/types/event-shape";
import { TroveSummaryStack } from "@/components/trove/TroveSummaryStack";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { computeLiquityEconomics } from "@/lib/liquity/economics";
import { liquityEconomicsExplanation } from "@/lib/liquity/economics-explanation";
import { RedeemerSummary } from "@/components/protocol/liquity/redeemer-summary";
import { liquityEconomicsContent } from "@/lib/shared/learn-more-content";
import { LiquityEventCard } from "@/components/protocol/liquity/liquity-event-card";
import { SpineTipContext } from "@/components/shared/spine-column";
import { LiquityTroveBarsProvider } from "@/lib/liquity/use-trove-bars";
import { TimelineDisplayProvider } from "@/components/shared/timeline-display-context";
import { EventDateContext } from "@/components/shared/event-time";
import { dayKey, shortDate, shortDateYear } from "@/lib/shared/format-event";
import { formatDate, formatDuration } from "@/lib/date";
import { Icon } from "@/components/icons/icon";
import { PILL_CTA, PILL_META } from "@/lib/shared/ui-grammar";
import { LIVE_EXAMPLE_TROVE_ID, LIVE_EXAMPLE_TROVE_PATH, type LiveExampleData } from "@/lib/home/live-example";

/**
 * Live example frame — the hero's proof-by-showing: the REAL trove page's own
 * components (position card, lifetime flows, the first timeline cards),
 * embedded in browser chrome at a slightly zoomed-out scale. Nothing is
 * reconstructed or approximated — the data is a server-side fetch of the live
 * position (ISR, refreshed hourly) rendered through the SAME components the
 * product uses, so the hero can never drift out of step with the actual view.
 * The whole frame is one link to the live position: hovering lifts it and
 * reveals the pill affordance; touch/small viewports get a caption link under
 * the frame instead. The render itself stays inert (pointer-events off,
 * `inert`, aria-hidden) — it's a picture of the app, not a second app.
 *
 * The composition paints after mount behind the skeleton crossfade: the trove
 * components format times in the visitor's locale/timezone and tick against
 * Date.now(), so server markup could never match hydration — the data ships
 * with the page, only the paint waits for the client.
 *
 * The timeline sets aside the same ops the old `?hide=` iframe param did —
 * redemption touches and the delegate's rate updates — so the visible cards
 * tell the owner's own story (the counter still counts everything).
 */

/** The "slightly zoomed out" factor: the composition renders at a ~1530px
 *  internal viewport — the full desktop layout, read at a glance. */
const SCALE = 0.65;
/** Visible height of the render zone (px) — deep enough that the position
 *  card, the lifetime-flows panel, and the first timeline events all show,
 *  with the fade swallowing the rest. */
const VISIBLE_H = 600;

/** The trove page's stack, re-composed from its real components — the same
 *  container column, card, flows panel, opened-row, and event cards, minus
 *  the interactive toolbar controls (the hero is inert, so a sort arrow or
 *  filter dropdown would be dead weight the fade mostly hides anyway). */
function HeroTroveComposition({ data }: { data: LiveExampleData }) {
  const { trove, liveState, prices, debtInFront, trovesAhead, visibleEvents, towerEvents, visibleTotal, totalEvents } =
    data;
  const currentPrice = prices?.[trove.collateralType.toLowerCase() as keyof OraclePricesData];
  // The bars provider and previous-event seams take full events; the tower
  // projection carries every field they actually read (see HeroTowerEvent).
  const chronoEvents = towerEvents as unknown as BaseActivityEvent[];
  const chronoIndexById = new Map(towerEvents.map((e, i) => [e.id, i]));
  const lastEventTs = towerEvents.length > 0 ? towerEvents[towerEvents.length - 1].timestamp : undefined;

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6">
      <div className="space-y-6 py-8">
        <TroveSummaryStack
          trove={trove}
          liveState={liveState}
          prices={prices}
          debtInFront={debtInFront}
          trovesAhead={trovesAhead}
          debtInFrontLoading={false}
          summaryExplanationOpen={false}
          onToggleSummaryExplanation={() => {}}
          loadingStatus={{ message: null, snapshotDate: lastEventTs }}
        />

        {(() => {
          const result = computeLiquityEconomics(towerEvents, {
            currentPrice,
            collateralType: trove.collateralType,
          });
          if (!result) return null;
          return (
            <>
              <ChainTruthTower
                data={result.data}
                title="Lifetime flows"
                explanation={liquityEconomicsExplanation(result.economics, result.economics._meta)}
                learnMore={liquityEconomicsContent({ isBatched: result.economics._meta.isInBatch })}
                // Stated, not left to default (ui-jobs 61): the hero belongs to
                // no protocol, so it has no setting of its own to read and must
                // not borrow one — a reader who put the tower away on an Aave
                // V4 position would otherwise find the home page's picture of
                // the app missing its middle. The frame is inert anyway, so a
                // chevron here would be a control nobody could press.
                collapseKey={null}
              />
              {result.redeemer && <RedeemerSummary stats={result.redeemer} currentPrice={currentPrice} />}
            </>
          );
        })()}

        {/* The timeline toolbar's passive half: opened date + age on the left,
            the filtered event counter on the right. */}
        <div className="flex items-center justify-between flex-wrap gap-2 pl-5">
          <div className="flex items-center gap-2 text-sm">
            {trove.activity?.createdAt && (
              <>
                <span className="text-foreground">Opened {formatDate(trove.activity.createdAt)}</span>
                <span className={PILL_META}>
                  {formatDuration(
                    trove.activity.createdAt,
                    trove.status === "open" ? new Date() : (trove.activity.lastActivityAt ?? new Date()),
                  )}
                </span>
              </>
            )}
            {trove.activity?.lastActivityAt && (
              <span className={PILL_META}>
                <Icon name="clock-zap" size={14} />
                {formatDuration(trove.activity.lastActivityAt, new Date())} ago
              </span>
            )}
          </div>
          <span className="text-xs text-rb-500 tabular-nums">
            {visibleTotal} of {totalEvents} events
          </span>
        </div>

        <TimelineDisplayProvider>
          <LiquityTroveBarsProvider events={chronoEvents}>
            <div className="space-y-2">
              {visibleEvents.map((event, idx) => {
                if (!isLiquityEvent(event)) return null;
                const tempIdx = chronoIndexById.get(event.id) ?? 0;
                const previousEvent = tempIdx > 0 ? chronoEvents[tempIdx - 1] : undefined;
                // Day-grouping in display (newest-first) order — same rule as
                // the trove page's renderCard.
                const prevDisplayed = idx > 0 ? visibleEvents[idx - 1] : undefined;
                const showDate = !prevDisplayed || dayKey(event.timestamp) !== dayKey(prevDisplayed.timestamp);
                const datePrefix = showDate ? `${shortDate(event.timestamp)} ${shortDateYear(event.timestamp)}` : null;
                return (
                  <EventDateContext.Provider key={event.id} value={datePrefix}>
                    {/* Newest-first, so the first card is the tip of the
                        timeline and carries the pulsing dot (the frame draws
                        its rows itself, outside the shared timeline). */}
                    <SpineTipContext.Provider value={idx === 0 ? "above" : null}>
                      <LiquityEventCard
                        event={event}
                        addressDisplay="hidden"
                        isFirst={idx === 0}
                        isLast={idx === visibleEvents.length - 1}
                        previousEvent={previousEvent}
                        eventNumber={tempIdx + 1}
                        currentPrice={currentPrice}
                      />
                    </SpineTipContext.Provider>
                  </EventDateContext.Provider>
                );
              })}
            </div>
          </LiquityTroveBarsProvider>
        </TimelineDisplayProvider>
      </div>
    </div>
  );
}

export function LiveExampleFrame({ data }: { data: LiveExampleData | null }) {
  // The composition stays behind the skeleton until the client has mounted —
  // see the header comment for why it never server-renders. When the data
  // fetch failed at revalidate time (data null) the skeleton simply holds.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const showTrove = ready && data !== null;

  return (
    <div className="w-full max-w-5xl mx-auto px-4">
      <div className="group relative">
        {/* Cast shadow behind the frame — a warm dark shadow on the paper
            canvas, a marketing-blue glow in dark: both hug the frame's
            silhouette (box-shadow on a frame-sized box), so the light falls
            off from the edges rather than haloing behind it. The wrapper
            (oversized so the blur has room, bottom edge flush with the frame)
            masks the shadow out toward the bottom: the frame's lower edge
            dissolves into the section gradient, so no shadow may pool under
            it and redraw the rectangle the fade erased. */}
        <div
          aria-hidden="true"
          className="absolute -inset-x-40 -top-40 bottom-0 pointer-events-none transition-transform duration-300 group-hover:-translate-y-1"
          style={{
            maskImage: "linear-gradient(to bottom, black 60%, transparent 96%)",
            WebkitMaskImage: "linear-gradient(to bottom, black 60%, transparent 96%)",
          }}
        >
          {/* Light: warm dark, offset downward — same tone as --panel-shadow. */}
          <div
            className="absolute inset-x-40 top-40 bottom-0 rounded-t-2xl dark:hidden"
            style={{
              boxShadow: "0 24px 80px -12px rgba(40, 33, 20, 0.24), 0 8px 30px rgba(40, 33, 20, 0.12)",
            }}
          />
          {/* Dark: the blue glow — centred (emitted light, not a key light),
              layered tight→wide because box-shadow decays from the edge:
              a single blur reads dim where the halo gradient read bright. */}
          <div
            className="absolute inset-x-40 top-40 bottom-0 rounded-t-2xl hidden dark:block"
            style={{
              boxShadow: [
                "0 0 30px color-mix(in srgb, var(--marketing) 40%, transparent)",
                "0 0 70px 4px color-mix(in srgb, var(--marketing) 28%, transparent)",
                "0 0 140px 16px color-mix(in srgb, var(--marketing) 16%, transparent)",
              ].join(", "),
            }}
          />
        </div>

        {/* No card shell (border/shadow/surface) — the section gradient runs
            behind, and the bottom fade dissolves the page into it. Only the
            chrome bar keeps a surface; the content below is the app's own. */}
        <div className="relative rounded-t-2xl overflow-hidden transition-transform duration-300 group-hover:-translate-y-1">
          {/* Browser chrome — the real URL is part of the pitch. The bar keeps
              only the border-b separator; the URL pill is the single tinted
              shape (no competing band behind it), and its background + text
              shift together on hover as one unit. */}
          <div className="relative flex items-center gap-2 px-4 py-3 border-b border-rb-200 dark:border-rb-800">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ec6a5e]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#f4bf4f]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#61c554]" />
            <span className="absolute left-1/2 -translate-x-1/2 max-w-[65%] truncate font-sans text-xs text-rb-500/40 bg-rb-100 dark:bg-rb-900 group-hover:text-foreground group-hover:bg-background transition-colors duration-300 rounded-md px-3 py-1">
              rails.finance/liquity-v2/trove/WETH/{LIVE_EXAMPLE_TROVE_ID.slice(0, 4)}…{LIVE_EXAMPLE_TROVE_ID.slice(-4)}
            </span>
            {/* Liveness marker — a solid green pill owned by the chrome bar
                rather than pasted over the render. */}
            <span className="ml-auto inline-flex items-center rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-semibold tracking-widest text-white">
              LIVE
            </span>
          </div>

          {/* The real components, zoomed out. aria-hidden + inert: it's a
              picture of the app, not a second app — the Link is the a11y
              surface, and `inert` keeps the composition's links and buttons
              out of the tab order. */}
          <div
            className="relative overflow-hidden bg-background"
            style={{ height: VISIBLE_H }}
            aria-hidden="true"
            inert
          >
            {/* Skeleton stand-in until the client paints — the trove layout's
                silhouette (position card, then the lifetime flows panel) in
                the shared skeleton tone, fading out once the real components
                are ready. */}
            <div
              className={`absolute inset-0 flex flex-col gap-4 px-10 pt-8 transition-opacity duration-500 ${
                showTrove ? "opacity-0" : "opacity-100"
              }`}
            >
              <div className="animate-pulse h-36 bg-skeleton rounded-2xl" />
              <div className="animate-pulse h-64 bg-rb-100/60 dark:bg-rb-800/40 rounded-2xl" />
              <div className="animate-pulse h-24 bg-rb-100/30 dark:bg-rb-800/20 rounded-2xl" />
            </div>

            {showTrove && (
              <div
                className="pointer-events-none origin-top-left"
                style={{
                  width: `${100 / SCALE}%`,
                  transform: `scale(${SCALE})`,
                  // Shared entrance keyframe (globals.css) — mounts only once
                  // `ready` flips, so a transition would never fire; the
                  // skeleton above fades out over the same half second.
                  animation: "fade-in 0.5s",
                }}
              >
                <HeroTroveComposition data={data} />
              </div>
            )}
            {/* Bottom fade into the top section's gradient floor — the stops
                MUST match the section gradient's `to-*` colors in
                app/(site)/page.tsx or the feather shows a seam. */}
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background dark:to-rb-800 pointer-events-none" />
          </div>

          {/* The whole frame is the click target: one overlay link, with the
              pill inside it as the hover affordance (revealed by hovering
              anywhere on the frame — no separate hover state of its own,
              since the pill isn't a separate target). Hover-less pointers get
              the caption link below the frame instead of a floating pill. */}
          <Link
            href={LIVE_EXAMPLE_TROVE_PATH}
            aria-label="View this live Liquity V2 trove on Rails"
            className="absolute inset-0 z-10"
          >
            {/* PILL_CTA's neutral border is swapped (not appended to) at this
                call site: two unconditional border-color utilities tie on
                specificity and Tailwind's stylesheet order — not class order —
                decides, so only one may be present for the blue to hold. */}
            <span
              className={`${PILL_CTA.replace("border border-rb-200 dark:border-rb-800", "border border-blue-500")} absolute bottom-5 left-1/2 -translate-x-1/2 translate-y-1 opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0`}
            >
              View live position <span>→</span>
            </span>
          </Link>
        </div>

        {/* Attribution — the position is a real user's; the caption keeps the
            claim of realness credible without a receipt-sized footnote. On
            hover-less pointers it also carries the frame's link, since the
            hover-revealed pill never shows there. Set as a right-aligned pill
            in the chrome bar's own surface pairing. */}
        <div className="relative mt-4 flex justify-end">
          <p className="inline-flex items-center gap-1 rounded-sm bg-rb-100 dark:bg-rb-900 px-3 py-1 text-xs text-rb-500">
            Live position, shared with permission.{" "}
            <Link href={LIVE_EXAMPLE_TROVE_PATH} className="text-foreground [@media(hover:hover)]:hidden">
              View this position live <span className="text-blue-500">→</span>
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
