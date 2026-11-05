"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import type { OraclePricesData } from "@/types/api/oracle";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { TroveBody, useTroveFlows } from "@/components/trove/TroveBody";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { PILL_CTA_BLUE } from "@/lib/shared/ui-grammar";
import { LIVE_EXAMPLE_TROVE_ID, LIVE_EXAMPLE_TROVE_PATH, type LiveExampleData } from "@/lib/home/live-example";
import { unpackLiveExample, type WireLiveExample } from "@/lib/home/live-example-wire";
import { PositionCardEdgeContext, type PositionCardEdge } from "@/components/shared/position-card-edge";
import { PositionCardStripProvider, usePublishPositionCardStrip } from "@/components/shared/position-card-strip";
import { LatestPrices, type LatestPriceAsset } from "@/components/shared/latest-prices";
import { RecencyStamp } from "@/components/shared/recency-stamp";
import { collateralPriceInfo } from "@/lib/liquity/trove-page-words";
import { chainMeta } from "@/lib/shared/chains";
import { protocolForPathname } from "@/lib/shared/protocols";
import { ProtocolIcon } from "@/components/icons/protocol-glyphs";

/**
 * Live example frame — the hero's proof-by-showing: the Trove page's body
 * (components/trove/TroveBody.tsx — position card, Lifetime flows, the
 * timeline's newest rows) embedded in browser chrome at a zoomed-out scale.
 * The Trove page renders the same component, so the example draws what the
 * page draws; the data is a server-side fetch of the live position (ISR,
 * refreshed hourly). The whole frame is one link to the live position:
 * hovering draws an edge in the glow's colour round its top and sides that dissolves
 * toward the bottom fade, brightens the URL in step with it, and reveals the
 * pill affordance;
 * touch/small viewports get a caption link under the frame instead. The render stays inert
 * (pointer-events off, `inert`, aria-hidden) — it's a picture of the app, not a
 * second app — so the body draws without the page's top row, without export
 * shapes, and with a still timeline toolbar (its words and count, no
 * controls).
 *
 * The composition paints after mount behind the skeleton crossfade: the trove
 * components format times in the visitor's locale/timezone and tick against
 * Date.now(), so server markup could never match hydration — the data ships
 * with the page, only the paint waits for the client. Every read the page
 * makes in the browser (the head, the daily prices) arrives in that data, so
 * the Lifetime flows panel draws on the first paint and never shows its
 * waiting cue.
 */

/** The "zoomed out" factor: the composition renders at a ~1530px internal
 *  viewport — the full desktop layout, read at a glance. */
const SCALE = 0.65;
/** Visible height of the render zone — deep enough that the position card,
 *  the Lifetime flows panel, the toolbar and the first timeline rows show,
 *  with the fade swallowing the rest. A phone's stacked layout reaches the
 *  rows only past a screen's height, so it stops at the flows panel. */
const VISIBLE_H = "h-[600px] sm:h-[720px]";

/** The example's explorer, for the card's sidebar and the sections' bars: off
 *  the explorers the roster entry is not found from the page's path. */
const EXAMPLE_ENTRY = protocolForPathname(LIVE_EXAMPLE_TROVE_PATH);
const EXAMPLE_EDGE: PositionCardEdge | null = EXAMPLE_ENTRY
  ? {
      protocol: { id: EXAMPLE_ENTRY.id, name: EXAMPLE_ENTRY.label },
      chain: { id: EXAMPLE_ENTRY.chainId, name: chainMeta(EXAMPLE_ENTRY.chainId).name },
    }
  : null;

/** The address bar's path: the example's href with the Trove id shortened. */
const EXAMPLE_URL = `rails.finance${LIVE_EXAMPLE_TROVE_PATH.replace(
  LIVE_EXAMPLE_TROVE_ID,
  `${LIVE_EXAMPLE_TROVE_ID.slice(0, 4)}…${LIVE_EXAMPLE_TROVE_ID.slice(-4)}`,
)}`;

/** The strip the Trove page's top row hands the card's heading row: the
 *  recency stamp, then the collateral's price and BOLD's. */
function HeroStrip({ data }: { data: LiveExampleData }) {
  const collSymbol = data.trove.collateralType;
  const price = data.prices?.[collSymbol.toLowerCase() as keyof OraclePricesData];
  const assets: LatestPriceAsset[] = [
    ...(price ? [{ symbol: collSymbol, price, info: collateralPriceInfo(collSymbol) }] : []),
    { symbol: "BOLD", price: 1 },
  ];
  const open = data.trove.status === "open";
  usePublishPositionCardStrip(
    <>
      {open && <RecencyStamp />}
      <LatestPrices assets={assets} bare />
    </>,
  );
  return null;
}

/** The Trove page's body, fed from the home page's data. */
function HeroTroveComposition({ wire, only }: { wire: WireLiveExample; only?: "card" | "flows" }) {
  const data = useMemo(() => unpackLiveExample(wire), [wire]);
  const {
    trove,
    liveState,
    prices,
    debtInFront,
    trovesAhead,
    rowEvents,
    towerEvents,
    flowEvents,
    dailyObs,
    totalEvents,
  } = data;
  // The composition paints after mount (above), so the browser's clock is the
  // only one this render meets.
  const [now] = useState(() => Date.now() / 1000);
  const collSymbol = trove.collateralType;
  const daily = useMemo(() => ({ obs: dailyObs, settled: true }), [dailyObs]);
  const { flowTimeline, flowFocus } = useTroveFlows({
    flowEvents,
    collSymbol,
    debtSymbol: towerEvents[0]?.context.data.assetType || "BOLD",
    surplusClaimed: false,
    now,
    daily,
    open: trove.status === "open",
    price: prices?.[collSymbol.toLowerCase() as keyof OraclePricesData],
    liveState,
  });
  // The rows are the newest of the history: numbering and the count run over
  // the whole of it. No storage key — the home page keeps no timeline state.
  const tl = useTimelineEvents(rowEvents, {
    protocolKey: "liquity-v2-troves",
    olderCount: totalEvents - rowEvents.length,
    dates: false,
  });
  // A card's previous event comes from the whole history; the projection
  // carries every field those reads take (see HeroTowerEvent).
  const chronoEvents = towerEvents as unknown as BaseActivityEvent[];
  const troveMeta = useMemo(() => ({ owner: trove.owner ?? null, total: totalEvents }), [trove.owner, totalEvents]);

  return (
    <PositionCardStripProvider>
      <PositionCardEdgeContext.Provider value={EXAMPLE_EDGE}>
        <div className={only ? "" : "mx-auto max-w-7xl px-4 md:px-6"}>
          {only !== "flows" && <HeroStrip data={data} />}
          <TroveBody
            still
            trove={trove}
            liveState={liveState}
            prices={prices}
            debtInFront={debtInFront}
            trovesAhead={trovesAhead}
            debtInFrontLoading={false}
            exports={null}
            loadingMessage={null}
            liquityEvents={rowEvents}
            tl={tl}
            boundary={null}
            economicsEvents={towerEvents}
            chronoEvents={chronoEvents}
            flowEvents={flowEvents}
            flowTimeline={flowTimeline}
            flowFocus={flowFocus}
            flowsRead="done"
            now={now}
            daily={dailyObs != null}
            surplusState={null}
            troveMeta={troveMeta}
            only={only}
          />
        </div>
      </PositionCardEdgeContext.Provider>
    </PositionCardStripProvider>
  );
}

/** The glow's stops round the colour wheel, 60° apart from DeFi blue at one
 *  OKLCH lightness and chroma (the blue's: L 60.65%, C 0.2133), so the glow's
 *  strength holds as it turns. Slot 0 is the blue, which light mode and
 *  reduced motion hold. */
const GLOW_STOPS = [
  "var(--marketing)",
  "oklch(60.65% 0.2133 321.8)",
  "oklch(60.65% 0.2133 21.8)",
  "oklch(60.65% 0.2133 81.8)",
  "oklch(60.65% 0.2133 141.8)",
  "oklch(60.65% 0.2133 201.8)",
];

/** The three-shadow stack in one colour. */
function glowShadow(colour: string) {
  return [
    `0 0 30px color-mix(in srgb, ${colour} 40%, transparent)`,
    `0 0 70px 4px color-mix(in srgb, ${colour} 28%, transparent)`,
    `0 0 140px 16px color-mix(in srgb, ${colour} 16%, transparent)`,
  ].join(", ");
}

/** Pauses the glow's turn (and the edge's) while the frame is off screen. */
function useGlowPause() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      el.toggleAttribute("data-offscreen", !entry.isIntersecting);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

type SampleMode = "pending" | "framed" | "layered" | "single-card" | "single-flows" | "button";

/** Which sample a reader sees, decided after mount: below sm the layered
 *  slices, from sm the framed page. On a dev server `?sample=` picks another
 *  phone sample for side-by-side review (temporary, Miles 5 Nov 2026):
 *  `classic` the framed page, `single` or `single-flows` the Lifetime flows
 *  panel alone, `single-card` the position card alone, `button` no
 *  sample, a link to the position alone. */
function useSampleMode(): SampleMode {
  const [mode, setMode] = useState<SampleMode>("pending");
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const asked =
      process.env.NODE_ENV !== "production" ? new URLSearchParams(window.location.search).get("sample") : null;
    const phone: SampleMode =
      asked === "classic"
        ? "framed"
        : asked === "single-card"
          ? "single-card"
          : asked === "single" || asked === "single-flows"
            ? "single-flows"
            : asked === "button"
              ? "button"
              : "layered";
    const set = () => setMode(mq.matches ? phone : "framed");
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);
  return mode;
}

/** The glow behind a phone sample's card, as the framed sample draws it round
 *  its frame: a warm shadow in light, the turning glow in dark. Fills its
 *  positioned parent, behind it. */
function CardGlow() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 rounded-2xl">
      <div
        className="absolute inset-0 rounded-2xl dark:hidden"
        style={{ boxShadow: "0 24px 80px -12px rgba(40, 33, 20, 0.24), 0 8px 30px rgba(40, 33, 20, 0.12)" }}
      />
      <div className="absolute inset-0 hidden dark:block">
        {GLOW_STOPS.map((colour, slot) => (
          <div
            key={colour}
            className="live-glow-layer absolute inset-0 rounded-2xl"
            style={{ boxShadow: glowShadow(colour), ["--glow-slot" as string]: slot }}
          />
        ))}
      </div>
    </div>
  );
}

/** The full-width link under a single phone sample: the CTA pill, a 48px
 *  tap target across the column. */
const SINGLE_BUTTON = PILL_CTA_BLUE.replace("inline-flex", "flex w-full justify-center")
  .replace("px-4 py-2", "px-4 py-3.5")
  .replace("text-sm", "text-base");

/** Below sm, on review: one component at its real size, as the position page
 *  draws it at phone width, live and interactive (its receipts and tooltips
 *  answer); a label line over it naming the position, and the link to it under
 *  it. */
function SingleSample({ data, which }: { data: WireLiveExample | null; which: "card" | "flows" }) {
  const glowRef = useGlowPause();
  const collSymbol = useMemo(() => (data ? unpackLiveExample(data).trove.collateralType : null), [data]);
  return (
    <div className="px-4 sm:hidden" data-live-single={which}>
      <p className="mb-3 flex items-center gap-2 text-xs text-rb-500">
        {EXAMPLE_ENTRY && <ProtocolIcon id={EXAMPLE_ENTRY.id} className="h-4 w-4 shrink-0" />}
        <span className="font-medium text-foreground">
          {EXAMPLE_ENTRY?.label ?? "Liquity V2"}
          {collSymbol && ` · ${collSymbol} trove`}
        </span>
        <span className="ml-auto">
          <RecencyStamp compact />
        </span>
      </p>
      <div ref={glowRef} className="live-glow relative isolate" data-live-slice={which}>
        <CardGlow />
        {data && <HeroTroveComposition wire={data} only={which} />}
      </div>
      <Link href={LIVE_EXAMPLE_TROVE_PATH} className={`${SINGLE_BUTTON} mt-5`}>
        View a live position <span>→</span>
      </Link>
    </div>
  );
}

/** Below sm, on review: no sample, the link to the position alone, centred
 *  and a little narrower than the search. It rises 112px into the hero's foot,
 *  68px under the ticks' text, and keeps 112px to the
 *  value line. */
function ButtonSample() {
  return (
    <div className="-mt-28 mb-16 flex justify-center px-4 sm:hidden" data-live-button="">
      <Link href={LIVE_EXAMPLE_TROVE_PATH} className={`${SINGLE_BUTTON} max-w-[19rem]`}>
        View a live position <span>→</span>
      </Link>
    </div>
  );
}

/** The layered sample's geometry at 390px (Miles's mock, 5 Nov 2026), to be
 *  nudged here: each slice lays its component out at an internal width and
 *  draws it at a zoom. The card sits on the left; the flows panel lies over it,
 *  offset right and down, running off the screen's right edge; the pill
 *  overlaps their foot. */
const LAYERED = {
  /** The card: internal width (px) and zoom. */
  cardW: 420,
  cardZoom: 0.85,
  /** The flows panel: internal width (px), zoom, and its offset (px) from the
   *  card's top left. */
  flowsW: 480,
  flowsZoom: 0.85,
  flowsLeft: 142,
  flowsTop: 86,
};

/** Below sm: the position card and the Lifetime flows panel as two live
 *  slices, the flows panel layered over the card, and the link to the
 *  position as a pill over their foot. Same data as the framed sample; each
 *  slice is laid out at its own width and zoomed (zoom, not a transform, so
 *  its box takes the drawn height). */
function LayeredSample({ data, glowRef }: { data: WireLiveExample | null; glowRef: RefObject<HTMLDivElement | null> }) {
  const L = LAYERED;
  return (
    <div className="px-4 pb-8 sm:hidden" data-live-layered="">
      <div ref={glowRef} className="live-glow relative flow-root min-h-[420px]">
        <div aria-hidden="true" inert className="pointer-events-none">
          <div
            className="absolute left-0 top-0 isolate"
            style={{ width: L.cardW, zoom: L.cardZoom }}
            data-live-slice="card"
          >
            <CardGlow />
            {data && <HeroTroveComposition wire={data} only="card" />}
          </div>
          <div
            className="relative rounded-2xl shadow-2xl shadow-black/40"
            style={{
              width: L.flowsW,
              zoom: L.flowsZoom,
              marginLeft: L.flowsLeft / L.flowsZoom,
              marginTop: L.flowsTop / L.flowsZoom,
            }}
            data-live-slice="flows"
          >
            {data && <HeroTroveComposition wire={data} only="flows" />}
          </div>
        </div>
        <Link
          href={LIVE_EXAMPLE_TROVE_PATH}
          aria-label="View this live Liquity V2 trove on Rails"
          className={`${PILL_CTA_BLUE} absolute bottom-0 left-1/2 z-10 -translate-x-1/2 translate-y-1/2`}
        >
          View a live position <span>→</span>
        </Link>
      </div>
    </div>
  );
}

export function LiveExampleFrame({ data }: { data: WireLiveExample | null }) {
  const mode = useSampleMode();
  const glowRef = useGlowPause();
  const layeredGlowRef = useGlowPause();
  // The composition stays behind the skeleton until the client has mounted —
  // see the header comment for why it never server-renders. When the data
  // fetch failed at revalidate time (data null) the skeleton simply holds.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const showTrove = ready && data !== null && mode === "framed";
  // The skeleton unmounts once its fade-out (500ms) has run, so its pulses
  // stop with it.
  const [skeletonGone, setSkeletonGone] = useState(false);
  useEffect(() => {
    if (!showTrove) return;
    const t = setTimeout(() => setSkeletonGone(true), 600);
    return () => clearTimeout(t);
  }, [showTrove]);

  return (
    <>
      {(mode === "pending" || mode === "layered") && (
        <LayeredSample data={mode === "layered" ? data : null} glowRef={layeredGlowRef} />
      )}
      {mode === "button" && <ButtonSample />}
      {(mode === "single-card" || mode === "single-flows") && (
        <SingleSample data={data} which={mode === "single-card" ? "card" : "flows"} />
      )}
      <div className={`w-full max-w-5xl mx-auto px-4 ${mode === "framed" ? "" : "max-sm:hidden"}`}>
        <div ref={glowRef} className="live-glow group relative">
          {/* Cast shadow behind the frame — a warm dark shadow on the paper
            canvas, a glow turning round the colour wheel in dark: both hug
            the frame's silhouette (box-shadow on a frame-sized box), so the light falls
            off from the edges rather than haloing behind it. The wrapper
            (oversized so the blur has room, bottom edge flush with the frame)
            masks the shadow out toward the bottom: the frame's lower edge
            dissolves into the section gradient, so no shadow may pool under
            it and redraw the rectangle the fade erased. */}
          <div
            aria-hidden="true"
            className="absolute -inset-x-40 -top-40 bottom-0 pointer-events-none"
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
            {/* Dark: the glow — centred (emitted light, not a key light),
              layered tight→wide because box-shadow decays from the edge:
              a single blur reads dim where the halo gradient read bright.
              It turns round the colour wheel (GLOW_STOPS, the cross-fade in
              globals.css `.live-glow`). */}
            <div className="absolute inset-x-40 top-40 bottom-0 hidden dark:block">
              {GLOW_STOPS.map((colour, slot) => (
                <div
                  key={colour}
                  className="live-glow-layer absolute inset-0 rounded-t-2xl"
                  style={{ boxShadow: glowShadow(colour), ["--glow-slot" as string]: slot }}
                />
              ))}
            </div>
          </div>

          {/* Hover edge — a border hugging the OUTSIDE of the frame on its top
            and sides, in the glow's colour of the moment (one layer per
            GLOW_STOPS colour on the glow's timeline; light mode keeps the
            blue alone): a box 2px larger than the frame on those three
            edges, with a radius 2px wider so the ring stays concentric with
            the frame's corners. Masked out toward the bottom so it dissolves
            with the content fade instead of closing a rectangle the fade
            erased. It fades over the same 300ms as the URL pill's colour
            shift, so the two arrive together. Tailwind's hover variants are
            gated on `@media (hover: hover)`, so touch pointers never see it.
            Pointer-inert, so the click target is unchanged. */}
          <div
            aria-hidden="true"
            className="absolute -inset-x-0.5 -top-0.5 bottom-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none"
            style={{
              maskImage: "linear-gradient(to bottom, black 35%, transparent 90%)",
              WebkitMaskImage: "linear-gradient(to bottom, black 35%, transparent 90%)",
            }}
          >
            {GLOW_STOPS.map((colour, slot) => (
              <div
                key={colour}
                className="live-glow-layer absolute inset-0 rounded-t-[18px] border-2 border-b-0"
                style={{ borderColor: colour, ["--glow-slot" as string]: slot }}
              />
            ))}
          </div>

          {/* No card shell (border/shadow/surface) — the section gradient runs
            behind, and the bottom fade dissolves the page into it. Only the
            chrome bar keeps a surface; the content below is the app's own. */}
          <div className="relative rounded-t-2xl overflow-hidden">
            {/* Browser chrome — the real URL is part of the pitch. The bar keeps
              only the border-b separator; the URL pill is the single tinted
              shape (no competing band behind it), and its background + text
              shift together on hover as one unit. */}
            <div className="relative flex items-center gap-2 px-4 py-3 border-b border-rb-200 dark:border-rb-800">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#ec6a5e]" />
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#f4bf4f]" />
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#61c554]" />
              <span className="min-w-0 flex-1 truncate text-center sm:absolute sm:left-1/2 sm:max-w-[65%] sm:flex-none sm:-translate-x-1/2 sm:text-left font-sans text-xs text-rb-500/40 bg-rb-100 dark:bg-rb-900 group-hover:text-foreground group-hover:bg-background transition-colors duration-300 rounded-md px-3 py-1">
                {EXAMPLE_URL}
              </span>
              {/* Liveness marker — an outlined green pill (border, 20% tint,
                green bold text) owned by the chrome bar rather than pasted
                over the render. */}
              <span className="ml-auto inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-green-500 bg-green-500/20 px-2 py-0.5 text-[9px] font-bold tracking-widest text-green-500">
                LIVE POSITION
              </span>
            </div>

            {/* The real components, zoomed out. aria-hidden + inert: it's a
              picture of the app, not a second app — the Link is the a11y
              surface, and `inert` keeps the composition's links and buttons
              out of the tab order. */}
            <div className={`relative overflow-hidden bg-background ${VISIBLE_H}`} aria-hidden="true" inert>
              {/* Skeleton stand-in until the client paints — the trove layout's
                silhouette (position card, the Lifetime flows panel, the rows) in
                the shared skeleton tone, fading out once the real components
                are ready, then unmounting. */}
              {!skeletonGone && (
                <div
                  className={`absolute inset-0 flex flex-col gap-4 px-10 pt-8 transition-opacity duration-500 ${
                    showTrove ? "opacity-0" : "opacity-100"
                  }`}
                >
                  <div className="animate-pulse h-44 bg-skeleton rounded-2xl" />
                  <div className="animate-pulse h-72 bg-rb-100/60 dark:bg-rb-800/40 rounded-2xl" />
                  <div className="animate-pulse h-24 bg-rb-100/30 dark:bg-rb-800/20 rounded-2xl" />
                </div>
              )}

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
                  <HeroTroveComposition wire={data} />
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
              <span
                className={`${PILL_CTA_BLUE} absolute bottom-5 left-1/2 -translate-x-1/2 translate-y-1 opacity-0 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0`}
              >
                View a live position <span>→</span>
              </span>
            </Link>
          </div>

          {/* On hover-less pointers the frame's link, since the hover-revealed
            pill never shows there: a right-aligned pill in the chrome bar's
            surface pairing. */}
          <div className="relative mt-4 flex justify-end [@media(hover:hover)]:hidden">
            <Link
              href={LIVE_EXAMPLE_TROVE_PATH}
              className="inline-flex items-center gap-1 rounded-sm bg-rb-100 px-3 py-1 text-xs text-foreground dark:bg-rb-900"
            >
              View a live position <span className="text-blue-600 dark:text-blue-400">→</span>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
