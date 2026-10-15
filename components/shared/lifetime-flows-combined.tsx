"use client";

// The Lifetime flows panel on a position with a series (rails-ops
// reference/lifetime-flows-scrubber.md), in one stacked layout: each side's
// headline on its own line over its bar (no scale under the bars), the
// collateral and debt line, the held asset's price chart under its heading
// ("Daily [asset] USD price", a list where there are several, on the page's
// surface, its readout a tip at the cursor), and the events row; each
// of the three sections carries its own "?" how-to-read. One time axis
// (`stripGeometry`) and one cursor: a press, a press and drag (mouse, pen and
// touch alike; hovering moves nothing) or the arrow keys on either chart move
// it. It stands on the line's points and on every day with events (tapping an
// event dot jumps to it); what the headlines and the bars state there is
// `combinedAt` (lib/shared/flows-combined.ts). The charts after the cursor are
// dimmed. The dashed outline marks where each bar ends today. Before the bars'
// window opens the bars grey out at the window's first day and say so. Under
// the events, the cursor's date, which opens the timeline's two buttons (show
// the timeline to that day, the timeline following the chart); under that the
// steps: the start, the previous and next day with events, today.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Activity, ChevronDown, ChevronLeft, ChevronRight, Link2, ListEnd, SkipBack, SkipForward } from "lucide-react";
import { LearnMoreButton, LearnMoreModal, type LearnMoreContent } from "@/components/shared/learn-more-modal";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import {
  lifetimeFlowsBarsContent,
  lifetimeFlowsEventsContent,
  lifetimeFlowsHealthContent,
  lifetimeFlowsPriceContent,
} from "@/lib/shared/learn-more-content";
import { FlowBarsHeadsContext, Headline, Rescaled, useWidth } from "@/components/shared/lifetime-flows-busy";
import { FlowCursorContext, KEEP_PANEL, SegmentTipContext } from "@/components/shared/lifetime-flows-tip";
import { useFlowFocus, useFlowFocusState } from "@/components/shared/flow-focus-context";
import { FLOWS_SCOPE, Prov, useProvArmedFor, type Provenance } from "@/components/shared/provenance";
import {
  formatPrice,
  priceAxisLabels,
  labelWidth,
  priceAxis,
  pricePieces,
  levelAt,
  priceReadout,
  STRIP_PAD,
  stripGeometry,
  type FlowPriceSeries,
  type StripGeometry,
} from "@/lib/shared/flows-price";
import type { PriceAt } from "@/lib/shared/price-series";
import { CTRL_GHOST, CTRL_OFF, CTRL_ON_ACCENT, SECTION_HEADING } from "@/lib/shared/ui-grammar";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import {
  assetsAt,
  axisFor,
  DAY_MS,
  dayStart,
  formatFlowToken,
  formatFlowUsd,
  oldPriceAt,
  partialAt,
  unsureAt,
  type FlowModel,
  type FlowTick,
  tickRank,
} from "@/lib/shared/flows-timeline";
import { OldPriceLabel, OldPriceTip } from "@/components/shared/flow-old-price";
import { WARNING_TRIANGLE_PATH } from "@/lib/shared/warning-triangle";
import type { FlowBinSeries } from "@/lib/shared/flows-series";
import {
  axisEndDay,
  closeStop,
  combinedAt,
  combinedStops,
  eventStep,
  axisSpanDays,
  nearestStop,
  stopForDay,
  type CombinedStop,
} from "@/lib/shared/flows-combined";

/** Tick hues: the side an event moved; a liquidation in the critical red; a
 *  redemption or another change the owner did not make in caution orange; a
 *  delegate's rate change in the party pink, the owner's in the debt hue. */
export const FLOW_TICK: Record<FlowTick, string> = {
  collateral: "var(--color-blue-500)",
  debt: "var(--color-green-400)",
  both: "linear-gradient(to bottom, var(--color-blue-500) 50%, var(--color-green-400) 50%)",
  liquidation: "var(--color-red-500)",
  redemption: "var(--caution)",
  caution: "var(--caution)",
  "rate-delegate": "var(--color-pink-500)",
  "rate-owner": "var(--color-green-400)",
};

/** The triangle pip's size: large enough to read as a triangle. */
const PIP_TRIANGLE = 7;

/** The pips to draw, strongest last so a dot never covers a triangle. In a
 *  run of same-kind triangles closer than a triangle's width (a redemption a
 *  day, on a phone) each is drawn only once it clears the last one drawn, so
 *  the run reads as spaced triangles; every day keeps its hit area and tip. */
function visiblePips<T extends { day: number; tick: FlowTick }>(ticks: T[], x: (day: number) => number): T[] {
  const kept: T[] = [];
  const lastX: Partial<Record<FlowTick, number>> = {};
  for (const t of [...ticks].sort((a, b) => a.day - b.day)) {
    const tri = t.tick === "liquidation" || t.tick === "redemption" || t.tick === "caution";
    const at = x(t.day);
    const prev = lastX[t.tick];
    if (tri && prev != null && at - prev < PIP_TRIANGLE - 1) continue;
    lastX[t.tick] = at;
    kept.push(t);
  }
  return kept.sort((a, b) => tickRank(a.tick) - tickRank(b.tick));
}

/** One pip on the line strip, centred on `left`: a filled warning triangle
 *  (the spine's path) for a liquidation, a redemption or another caution
 *  event; a ring in the debt hue for the owner's rate change; a dot for
 *  everything else, in its tick's hue. */
export function FlowPip({ tick, left, opacity }: { tick: FlowTick; left: number; opacity: number }) {
  if (tick === "liquidation" || tick === "redemption" || tick === "caution")
    return (
      <svg
        className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
        width={PIP_TRIANGLE}
        height={PIP_TRIANGLE}
        viewBox="1.5 2.5 21 19"
        style={{ left, opacity }}
        data-flow-pip={tick}
      >
        <path d={WARNING_TRIANGLE_PATH} fill={FLOW_TICK[tick]} />
      </svg>
    );
  const ring = tick === "rate-owner";
  return (
    <i
      className={`pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${ring ? "size-[6px] border-[1.5px]" : "size-[5px]"}`}
      style={{
        left,
        opacity,
        ...(ring ? { borderColor: FLOW_TICK[tick] } : { background: FLOW_TICK[tick] }),
      }}
      data-flow-pip={tick}
    />
  );
}

/** The line's hues; the panel's Key draws the same. */
export const LINE_HUE = { collateral: "var(--color-blue-500)", debt: "var(--color-green-400)" };
/** The liquidation level's hue: the liquidation tick's red. */
const LIQ_HUE = FLOW_TICK.liquidation;

/** The bars' and the events' how-to-read; the price chart's names its
 *  series. */
const BARS_HELP = lifetimeFlowsBarsContent();

/** The events row's how-to-read, from the position's model: each side's
 *  events by the family's names for them (its buckets' events), and the
 *  marks the family draws (the warning tones its buckets carry, the marks it
 *  names, the ticks the position has). */
function eventsHelp(model: FlowModel, hasDebt: boolean): LearnMoreContent {
  const has = new Set(model.ticks.map((t) => t.tick));
  const wordsOf = (side: "collateral" | "debt") => [
    ...new Set(
      model.buckets
        .filter((b) => b.side === side && b.tone !== "liquidation" && b.tone !== "redemption")
        .map((b) => b.event ?? b.label)
        .filter((w): w is string => !!w && !triangles.has(w)),
    ),
  ];
  const toned = (tone: "liquidation" | "redemption") => model.buckets.find((b) => b.tone === tone)?.event ?? undefined;
  const named = model.words.marks ?? {};
  const liq = named.liquidation ?? toned("liquidation") ?? (has.has("liquidation") ? "a liquidation" : undefined);
  const red = named.redemption ?? toned("redemption") ?? (has.has("redemption") ? "a redemption" : undefined);
  // A kind the family draws as a triangle is not a dot.
  const triangles = new Set([toned("liquidation"), toned("redemption")].filter(Boolean));
  const caution = named.caution ?? (has.has("caution") ? "a change the owner did not make" : undefined);
  return lifetimeFlowsEventsContent({
    sides: [
      { hue: "Blue", label: model.labels.collateral, events: wordsOf("collateral") },
      ...(hasDebt ? [{ hue: "Green" as const, label: model.labels.debt, events: wordsOf("debt") }] : []),
    ],
    both: has.has("both"),
    liquidation: liq,
    redemption: red,
    caution,
    delegateRate: has.has("rate-delegate") || named["rate-delegate"] != null,
    ownerRate: has.has("rate-owner") || named["rate-owner"] != null,
  });
}

/** This position's Key, under the bars' how-to-read: provided by the panel,
 *  which the scrubber hands the Key's items. */
export const FlowsKeyNodeContext = createContext<ReactNode>(null);

/** Told while the combined panel is mounted: its sections carry the
 *  how-to-read, so the panel's header draws none. */
export const FlowsSectionsContext = createContext<((on: boolean) => void) | null>(null);
/** The panel's view (lib/shared/flows-view-store.ts): collapsed, the
 *  headlines and bars, the events and the steps, with the two charts
 *  hidden; the toggle that opens them stands centred under the bars in
 *  both states. */
export const FlowsCompactContext = createContext<{ compact: boolean; toggle: ReactNode }>({
  compact: false,
  toggle: null,
});

const STRIP_H = 80;
/** A dotted piece's tip: OldPriceTip's 16rem and the bubble's padding. */
const OLD_TIP_W = 282;
const dayStamp = (tsSec: number) => `${shortDate(tsSec)} ${shortDateYear(tsSec)}`;

export interface CombinedFlowsProps {
  /** The whole life's model: the headlines and the line. */
  model: FlowModel;
  /** The model cut to the bars' window. */
  bars: FlowModel;
  /** The stop the bars' window opens on (0 where it covers the whole life). */
  from: number;
  busy: boolean;
  /** The line's series, or null while it loads. */
  series: FlowBinSeries | null;
  /** The held assets' price series, for the price view (none: no toggle). */
  prices: FlowPriceSeries[];
  failed: boolean;
  /** A ledger's note while the cursor is off its last stop (Aave V4). */
  onLedgerNote?: (note: string | null) => void;
  /** The plain bars at a stop of `bars` (the scrubber's); `atLive` is the
   *  last stop, where no outline of today's length is drawn. */
  renderBars: (barStop: number, when: string, isLive: boolean, atLive: boolean) => ReactNode;
}

export function CombinedFlows({
  model,
  bars,
  from,
  busy,
  series,
  prices,
  failed,
  onLedgerNote,
  renderBars,
}: CombinedFlowsProps) {
  // A cut restored from the address bar puts the cursor on its day, which
  // is a stop of its own where the line has no point there. Days here are
  // absolute UTC days: a stop counts from `model.start`, which moves where a
  // page's model is rebuilt over more of the life (a Liquity fork's whole
  // history landing after its preload).
  const startDay = model.start / DAY_MS;
  // A closed position's chart ends at its close: the live stop stands there
  // (ruling 14, rails-ops reference/lifetime-price-chart.md).
  const closed = closeStop(model) != null;
  const closeAbs = startDay + model.lastDay;
  const [restoreDay, setRestoreDay] = useState<number | null>(null);
  const stops = useMemo(
    () => combinedStops(model, series, from, restoreDay == null ? null : restoreDay - model.start / DAY_MS),
    [model, series, from, restoreDay],
  );
  const last = stops.length - 1;
  const [at, setAt] = useState(last);
  // A new series (the first read landing) puts the cursor at today, or on
  // the day a frozen cursor stands on (`keepDay`, kept below).
  const lastRef = useRef(last);
  lastRef.current = last;
  const stopsRef = useRef(stops);
  stopsRef.current = stops;
  const keepDay = useRef<number | null>(null);
  useEffect(() => {
    const keep = keepDay.current == null ? null : keepDay.current - model.start / DAY_MS;
    const i = keep == null ? -1 : stopsRef.current.findIndex((x) => !x.live && x.stop === keep);
    setAt(i >= 0 ? i : lastRef.current);
  }, [model, series, from]);
  const go = (i: number) => setAt(Math.max(0, Math.min(last, i)));
  // Collapsed, the charts hide; the bars, the events and the steps keep
  // the cursor.
  const { compact, toggle: viewToggle } = useContext(FlowsCompactContext);

  // On a page that ties the panel to its timeline, the day is the unit the
  // two share. A click on the strip freezes the cursor on a day; the chart and
  // the bars show it and the list is untouched. "Show timeline to {date}" cuts the
  // list at the cursor's day close and brings that day's last card into
  // view; the cut stays where it is while the chart moves, until the button is
  // pressed again or the timeline chip's × clears it. A card's "View on
  // chart" freezes the cursor on its day from the other side. The back and
  // forward steps go by days with events. A second click on the frozen day,
  // Escape or the jump to today releases the freeze. A click on a segment
  // opens a short tip with its line, value and share.
  const focus = useFlowFocus();
  const byDays = focus != null;
  const flowsKey = useContext(FlowsKeyNodeContext);
  const setSections = useContext(FlowsSectionsContext);
  useEffect(() => {
    setSections?.(true);
    return () => setSections?.(false);
  }, [setSections]);
  const [assetKey, setAssetKey] = useState<string | null>(null);
  const priced = prices.find((p) => p.key === assetKey) ?? prices[0] ?? null;
  const [frozen, setFrozen] = useState(false);
  useEffect(() => {
    if (!frozen) return;
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) setFrozen(false);
    };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [frozen]);
  /** A click or a tap on the strip: freeze there, or release where the
   *  freeze already stands. */
  const tapStop = (i: number) => {
    if (frozen && i === at) {
      setFrozen(false);
      return;
    }
    go(i);
    setFrozen(true);
  };
  // The arrows step from event to event (a day's dot on the events row), on
  // every page; forward from the last event reaches today.
  const stepBack = () => go(eventStep(stops, at, -1));
  const stepOn = () => go(eventStep(stops, at, 1));
  const committed = stops[Math.min(at, last)];
  const committedEnd = committed
    ? committed.live
      ? Number.MAX_SAFE_INTEGER
      : dayStart(model, committed.stop) + 86_399
    : Number.MAX_SAFE_INTEGER;
  const committedWord =
    committed && !committed.live
      ? dayStamp(dayStart(model, committed.stop))
      : dayStamp(closed ? closeAbs * 86_400 : Date.now() / 1000);
  useEffect(() => {
    focus?.store.set({ cursor: { endTs: committedEnd, word: committedWord, live: !!committed?.live } });
  }, [focus?.store, committedEnd, committedWord, committed?.live]);
  // Read by the series effect above in the next commit, so it holds the
  // stop the cursor was last put on. Only a move or a freeze writes it: in a
  // commit whose stops changed, `at` is still the old list's index until that
  // effect moves it.
  const tracked = useRef({ at, frozen, stops });
  useEffect(() => {
    const prev = tracked.current;
    tracked.current = { at, frozen, stops };
    if (prev.stops !== stops || (prev.at === at && prev.frozen === frozen)) return;
    keepDay.current = frozen && committed && !committed.live ? startDay + committed.stop : null;
  });
  // The frozen day, which a card's chart button hides on.
  const frozenDay =
    frozen && committed
      ? committed.live && closed
        ? closeAbs
        : Math.floor((committed.live ? Date.now() / 1000 : committedEnd) / 86_400)
      : null;
  useEffect(() => {
    if (focus && focus.store.get().frozenDay !== frozenDay) focus.store.set({ frozenDay });
  }, [focus, frozenDay]);
  useEffect(() => () => focus?.store.set({ cursor: null, frozenDay: null }), [focus?.store]);
  // "Show timeline to {date}": the cut at the cursor's day close. At today it
  // clears a standing cut, as the chip's × does; with no cut there is nothing
  // to apply, nor where that cut already stands.
  const applied = useFlowFocusState((s) => s.rewind?.endTs ?? null);
  const canApply = byDays && !!committed && (committed.live ? applied != null : applied !== committedEnd);
  // The page stays where it is (Miles, 1 Oct 2026): the cut's top card
  // flashes once the visitor scrolls it into view.
  const apply = () => {
    if (!focus || !canApply) return;
    if (committed?.live) focus.store.set({ rewind: null });
    else focus.store.set({ rewind: { endTs: committedEnd, word: committedWord } });
  };
  // "Timeline follows the chart" (ui-jobs 305): the timeline reads the
  // cursor itself (`timelineCut`), and the stored cut, which the address bar
  // carries, is the day the cursor is frozen on, kept level here; a cut from
  // the address bar still putting the cursor on its day is left standing.
  const follow = useFlowFocusState((s) => s.follow);
  const restoring = useFlowFocusState((s) => s.restore != null);
  useEffect(() => {
    if (!focus || !follow || restoring || restoreTo.current != null) return;
    const want = frozen && committed && !committed.live ? committedEnd : null;
    if ((focus.store.get().rewind?.endTs ?? null) === want) return;
    focus.store.set({ rewind: want == null ? null : { endTs: want, word: committedWord } });
  });
  const move = useFlowFocusState((s) => s.move);
  const moved = useRef<number | null>(null);
  useEffect(() => {
    if (!move || moved.current === move.n) return;
    moved.current = move.n;
    const i = stopForDay(stops, Math.floor(move.ts / 86_400) - model.start / DAY_MS);
    if (i != null) {
      setAt(i);
      setFrozen(!move.free);
    }
  }, [move, stops, model.start]);
  // A cut restored from the address bar (`useRewindParam`): the cursor goes
  // to its day's close, frozen there.
  const restore = useFlowFocusState((s) => s.restore);
  const restored = useRef<number | null>(null);
  const restoreTo = useRef<number | null>(null);
  useEffect(() => {
    if (!restore || restored.current === restore.n) return;
    const day = Math.floor(restore.endTs / 86_400);
    const stop = day - model.start / DAY_MS;
    // A model that does not reach the day yet (a preload's) waits for the
    // one that does.
    if (stop < 0 || stop >= model.liveStop) return;
    restored.current = restore.n;
    // Taken once: a panel mounted later starts at today.
    focus?.store.set({ restore: null });
    restoreTo.current = day;
    keepDay.current = day;
    setRestoreDay(day);
    setFrozen(true);
  }, [restore, model.start, model.liveStop, focus?.store]);
  useEffect(() => {
    const to = restoreTo.current == null ? null : restoreTo.current - startDay;
    if (to == null) return;
    const i = stopForDay(stops, to);
    if (i == null) return;
    restoreTo.current = null;
    setAt(i);
  }, [stops, restore]);

  const cur: CombinedStop = stops[Math.min(at, last)];
  const { head, bars: barState } = combinedAt(model, bars, cur);
  const assets = useMemo(() => assetsAt(model, cur.stop), [model, cur.stop]);
  const hasDebt = model.buckets.some((b) => b.side === "debt");
  const closeDay = dayStamp(dayStart(model, model.lastDay));
  const atClose = head.isLive && closed;
  const dateText = atClose
    ? `At close, ${closeDay}`
    : head.isLive
      ? (model.words.live ?? "At the latest block's price")
      : dayStamp(dayStart(model, cur.stop));
  const when = atClose ? `the close on ${closeDay}` : head.isLive ? "now" : `the end of ${dateText}`;
  // The readout states the date alone (Miles, 1 Oct 2026).
  const dateLine = head.isLive && !atClose ? (model.words.live ?? "Today") : dateText;
  const liveReceipts = head.isLive && !closed;
  const ledgerText = head.isLive ? null : closed ? "Shows the position at close" : "Shows the position today";
  useEffect(() => {
    onLedgerNote?.(ledgerText);
  }, [onLedgerNote, ledgerText]);
  useEffect(() => () => onLedgerNote?.(null), [onLedgerNote]);
  const outside = barState == null;
  // What the headline's figure and the bar under it rest on that the page
  // could not read, for the headline's mark.
  const partialOf = (side: "collateral" | "debt") => partialAt(model, head.isLive ? model.liveStop : cur.stop, side);
  const windowDay = dayStamp(dayStart(model, from));
  // Outside the window the bars hold the window's first day, greyed.
  const barStop = cur.barStop ?? 0;
  const barAssets = useMemo(() => assetsAt(bars, barStop), [bars, barStop]);
  const btn = `${CTRL_GHOST} ${CTRL_OFF} size-11 shrink-0 rounded-md sm:size-8 pointer-coarse:size-11`;
  const tickHere = cur.event && !cur.live ? model.ticks.find((t) => t.day === cur.stop) : undefined;
  // What an open segment panel reads: the date in words and the cursor's
  // steps, so the panel restates its figures as the cursor moves.
  const cursor = useMemo(
    () => ({
      at: atClose ? `at close, ${closeDay}` : head.isLive ? `today (${dayStamp(Date.now() / 1000)})` : `at ${dateText}`,
      prev: stepBack,
      next: stepOn,
      canPrev: eventStep(stops, at, -1) !== at,
      canNext: at < last,
      live: !outside,
    }),
    // `go` closes over `last`, listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [atClose, closeDay, head.isLive, dateText, at, last, outside, byDays, stops],
  );

  // The time axis both strips share: its lead-in holds the widest value label
  // of either view, so a day sits on one x in both.
  const [stripRef, w] = useWidth();
  // The axis's last day: today, or a closed position's close day.
  const today = axisEndDay(model, series?.today ?? startDay + model.liveStop);
  const span = axisSpanDays(startDay, today);
  const lineScale = useMemo(() => lineStripScale(model, series, hasDebt), [model, series, hasDebt]);
  const priceScales = useMemo(
    () => new Map(prices.map((p) => [p.key, priceStripScale(p, startDay, today)])),
    [prices, startDay, today],
  );
  const labelW = labelWidth([...lineScale.labels, ...[...priceScales.values()].flatMap((s) => s.labels)]);
  const geo = useMemo(() => stripGeometry(w, startDay, today, span, labelW), [w, startDay, today, span, labelW]);
  const xStop = (s: CombinedStop) => geo.xClose(s.live ? today : startDay + s.stop);
  const atStop = stops[Math.min(at, last)];
  const showPrice = priced != null;
  const lineReady = lineScale.points.length > 0;
  const ready = lineReady || showPrice;
  const cx = ready && atStop ? xStop(atStop) : STRIP_PAD + geo.inner;
  const dim = ready && atStop != null && !atStop.live;
  const cursorDay = cur.live ? today : startDay + cur.stop;
  const cursorPrice = priced ? (priceReadout(priced, cursorDay, model.gapDays)?.point[1] ?? null) : null;
  const cursorLevel = priced ? (levelAt(priced, cursorDay)?.[1] ?? null) : null;
  const sliderLabel = `Date, by ${(series?.bin ?? "week") === "day" ? "day" : `${series?.bin ?? "week"} and by day with events`}: moves the headlines and the bars`;

  const valueText = tickHere?.kinds.length ? `${dateLine}: ${tickHere.kinds.join(", ")}` : dateLine;
  const cursorWord = atClose ? "Close" : head.isLive ? "Today" : dayStamp(dayStart(model, cur.stop));
  const sliderProps = {
    geo,
    w,
    stops,
    at: Math.min(at, last),
    xStop,
    cx,
    ready,
    valueText,
    cursorWord,
    onPick: go,
    freeze: byDays ? { frozen, onTap: tapStop } : null,
    startDay,
  };
  // Each side's headline, on its own line over its bar, the bars' "?" at the
  // first one's right end.
  const bareHeadline = (side: "collateral" | "debt") => (
    <Headline
      side={side}
      st={head[side]}
      model={model}
      when={when}
      isLive={liveReceipts}
      assets={assets}
      partial={partialOf(side)}
    />
  );
  const heads = {
    collateral: (
      <div className="mb-1.5 flex items-center justify-between gap-3" data-flow-headline-row="collateral">
        {bareHeadline("collateral")}
        <SectionHelp content={BARS_HELP} name="the bars and the line" anatomy="F16" extra={flowsKey} />
      </div>
    ),
    ...(hasDebt ? { debt: <div className="mb-1.5 mt-4">{bareHeadline("debt")}</div> } : {}),
  };
  const eventsContent = useMemo(() => eventsHelp(model, hasDebt), [model, hasDebt]);
  const priceHelp = priced?.health
    ? lifetimeFlowsHealthContent({ source: priced.source, assets: prices.length > 1 })
    : priced
      ? lifetimeFlowsPriceContent({
          symbol: priced.asset.symbol,
          unit: priced.unitLabel,
          source: `${priced.asset.symbol} in ${priced.unitLabel}: ${priced.source}`,
          perEvent: priced.grain === "event",
          level: priced.level?.formula ?? null,
          marks: (priced.events?.length ?? 0) > 0,
        })
      : null;

  const barsBlock = (
    <div className="relative" data-flow-combined-bars={outside ? "outside" : "inside"} data-anatomy="F3">
      <OldPriceLabel note={head.isLive ? null : oldPriceAt(model, cur.stop)} />
      {/* The cursor's date, for a screen reader; the eye reads it
          under the events. */}
      <p className="sr-only" aria-live="polite" data-flow-date="" data-anatomy="F2.1">
        {dateLine}
      </p>
      <div
        className={outside ? "pointer-events-none opacity-35 grayscale" : undefined}
        aria-hidden={outside || undefined}
        {...(outside ? { inert: true } : {})}
      >
        <FlowBarsHeadsContext.Provider value={heads}>
          {busy ? (
            <Rescaled
              model={bars}
              s={barState ?? combinedAt(model, bars, { stop: from, barStop: 0 }).bars!}
              hasDebt={hasDebt}
              when={when}
              isLive={liveReceipts}
              assets={barAssets}
              headlines={false}
              outline={!cur.live}
            />
          ) : (
            renderBars(barStop, when, liveReceipts, cur.live)
          )}
        </FlowBarsHeadsContext.Provider>
      </div>
      {outside && (
        <p
          className="absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-md border border-rb-200 bg-raised px-2 py-1 text-xs font-medium text-rb-500 shadow-sm dark:border-rb-700"
          data-flow-outside-window=""
        >
          Before the bars&rsquo; window, {windowDay}
        </p>
      )}
    </div>
  );

  return (
    <FlowCursorContext.Provider value={cursor}>
      <SegmentTipContext.Provider value={byDays || null}>
        <div className="text-sm" data-flows-combined="" data-flow-frozen={frozen ? "" : undefined}>
          <Steady>{barsBlock}</Steady>
          {/* The view's toggle, centred under the bars, in both states: the
              charts open beneath it, the events and steps keep their place. */}
          {viewToggle && (
            <div className="mt-3 flex justify-center" data-flows-view-row="">
              {viewToggle}
            </div>
          )}

          <div>
            <div {...KEEP_PANEL}>
              <div ref={stripRef} className={viewToggle ? "mt-2" : "mt-8"}>
                {/* The value line, then the price chart, then the events: one
                  time axis and one cursor, which either chart moves. The
                  charts stay mounted while collapsed, so they draw at once
                  on expanding. */}
                <div className={compact ? "hidden" : "relative"} data-flows-charts="value">
                  <StripSlider {...sliderProps} ariaLabel={sliderLabel} view="value">
                    <LineStrip
                      model={model}
                      scale={lineScale}
                      failed={failed}
                      geo={geo}
                      w={w}
                      today={today}
                      cx={cx}
                      dim={dim}
                      ready={lineReady}
                      head={{ collateral: head.collateral.now, debt: head.debt.now }}
                      hasDebt={hasDebt}
                      windowFrom={from > 0 ? startDay + from : null}
                    />
                  </StripSlider>
                </div>
                {priced && priceHelp && (
                  <div className={compact ? "hidden" : "mt-10"} data-flow-price-section="">
                    <div className="mb-2 flex items-center justify-between gap-3" data-anatomy="F19.1">
                      <PriceHeading
                        series={prices}
                        selected={priced}
                        onPick={setAssetKey}
                        day={cursorDay}
                        gapDays={model.gapDays}
                        isLive={cur.live && !closed}
                      />
                      <SectionHelp content={priceHelp} name="the price chart" anatomy="F19.7" />
                    </div>
                    <div className="relative">
                      <StripSlider
                        {...sliderProps}
                        ariaLabel={`${sliderLabel}, over the ${priced.asset.symbol} price`}
                        view="price"
                      >
                        <PriceStrip
                          s={priced}
                          scale={priceScales.get(priced.key)!}
                          geo={geo}
                          w={w}
                          today={today}
                          cx={cx}
                          dim={dim}
                          cursorPrice={cursorPrice}
                          cursorLevel={cursorLevel}
                          windowFrom={from > 0 ? startDay + from : null}
                          startDay={startDay}
                        />
                      </StripSlider>
                    </div>
                  </div>
                )}
                {/* The events: a labelled row of pips on the time axis. */}
                <div className={compact ? "mt-2" : "mt-6"} data-flow-events-section="">
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={`${SECTION_HEADING} text-rb-500`}
                      style={{ paddingLeft: Math.max(0, STRIP_PAD) }}
                      data-flow-events-label=""
                    >
                      Events
                    </span>
                    <SectionHelp content={eventsContent} name="the events" anatomy="F7.1" />
                  </div>
                  <PipRow
                    model={model}
                    geo={geo}
                    w={w}
                    today={today}
                    stops={stops}
                    at={Math.min(at, last)}
                    cx={cx}
                    dim={dim}
                    ready={ready}
                    onPick={go}
                  />
                </div>
                {/* The cursor's date under the cursor line; pressed, it shows the
                  timeline's two buttons beside it. */}
                <CursorDate
                  x={cx}
                  w={w}
                  word={cursorWord}
                  byDays={byDays}
                  follow={follow}
                  applied={!!committed && !committed.live && applied === committedEnd}
                  committedWord={committedWord}
                  live={!!committed?.live && !closed}
                  onApply={apply}
                />
              </div>
            </div>

            {/* The steps, grouped at the right end: the opening, the previous
              and next day with events, today. */}
            <div className="mt-1 flex items-center justify-end" data-flow-controls="" data-anatomy="F5" {...KEEP_PANEL}>
              <div className="-mr-1.5 flex items-center gap-x-1">
                <button
                  type="button"
                  className={btn}
                  aria-label={`Jump to opening, ${dayStamp(dayStart(model, 0))}`}
                  onClick={() => go(0)}
                  data-flow-jump="start"
                >
                  <SkipBack size={16} aria-hidden />
                </button>
                <button type="button" className={btn} aria-label="Previous event" onClick={stepBack}>
                  <ChevronLeft size={18} aria-hidden />
                </button>
                <button type="button" className={btn} aria-label="Next event" onClick={stepOn}>
                  <ChevronRight size={18} aria-hidden />
                </button>
                <button
                  type="button"
                  className={btn}
                  aria-label={closed ? `Jump to close, ${closeDay}` : "Jump to today"}
                  onClick={() => {
                    go(last);
                    setFrozen(false);
                  }}
                  data-flow-jump="end"
                >
                  <SkipForward size={16} aria-hidden />
                </button>
              </div>
            </div>
          </div>
        </div>
      </SegmentTipContext.Provider>
    </FlowCursorContext.Provider>
  );
}

/** Holds its height at the tallest it has been at this width, so the strip
 *  under it stays put while the cursor moves (the lines under the bars wrap
 *  to more or fewer rows on a phone); otherwise the strip would slide out
 *  from under the pointer that is moving the cursor. */
function Steady({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [min, setMin] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let width = el.getBoundingClientRect().width;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      if (Math.abs(r.width - width) > 0.5) {
        width = r.width;
        setMin(0);
        return;
      }
      setMin((m) => Math.max(m, r.height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div style={{ minHeight: min || undefined }}>
      <div ref={ref}>{children}</div>
    </div>
  );
}

type Point = { to: number; collateral: number | null; debt: number | null };

/** How near, in px, a pointer must be to an event tick to open it. */
const TICK_REACH = { mouse: 6, touch: 14 };

/** The flows line's points and value axes, fixed per position: the line's
 *  points and every day's figures, so the cursor's dots stay inside the strip
 *  on an event day too. Its value labels set the lead-in both strips share. */
export function lineStripScale(model: FlowModel, series: FlowBinSeries | null, hasDebt: boolean) {
  // The last point is today's, at the live figures.
  const points: Point[] = (series?.points ?? []).map(([, to, collateral, debt]) => ({ to, collateral, debt }));
  const tail = points[points.length - 1];
  if (tail) {
    tail.collateral = model.live.collateralUsd;
    tail.debt = model.live.debtUsd;
  }
  let peak = 0;
  for (const p of points) peak = Math.max(peak, p.collateral ?? 0, hasDebt ? (p.debt ?? 0) : 0);
  for (const v of model.valued) peak = Math.max(peak, v.collateral, hasDebt ? v.debt : 0);
  const axis = axisFor(peak);
  // Where the sides have no common unit (Frankencoin), each line on its own
  // axis, its top labelled in its token and hue.
  const sideUnits = model.sideUnits;
  let axes: { collateral: { max: number; ticks: number[] }; debt: { max: number; ticks: number[] } } | null = null;
  if (sideUnits) {
    const pk = { collateral: 0, debt: 0 };
    for (const p of points) {
      pk.collateral = Math.max(pk.collateral, p.collateral ?? 0);
      pk.debt = Math.max(pk.debt, p.debt ?? 0);
    }
    for (const v of model.valued) {
      pk.collateral = Math.max(pk.collateral, v.collateral);
      pk.debt = Math.max(pk.debt, v.debt);
    }
    axes = { collateral: axisFor(pk.collateral), debt: axisFor(pk.debt) };
  }
  // A token axis (Morpho) labels its values without the symbol.
  // Compact on the axis: "$4M", "$250k".
  const axisLabel = (t: number) =>
    model.unit ? formatFlowToken(t, model.unit, false) : formatFlowUsd(t).replace(/\.0(?=[kMB])/, "");
  // Labels at least 24px apart: every k-th of the axis's ticks. A label that
  // reads as the one under it ("$0" thrice on a position worth cents) is left
  // out.
  const every = axis.ticks.length > 1 ? Math.ceil(24 / (((STRIP_H - 8) * axis.ticks[1]) / axis.max)) : 1;
  const yTicks = axes
    ? []
    : axis.ticks.filter((_, i) => i % every === 0).filter((t, i, a) => i === 0 || axisLabel(t) !== axisLabel(a[i - 1]));
  // Each side's top, its axis's end, in its token (a side that never held
  // anything has none).
  const sideTops =
    axes && sideUnits
      ? (hasDebt ? (["collateral", "debt"] as const) : (["collateral"] as const))
          .map((k) => ({ k, t: axes[k].ticks.length > 1 ? axes[k].max : 0 }))
          .filter((x) => x.t > 0)
          .map((x) => ({ k: x.k, t: x.t, text: formatFlowToken(x.t, sideUnits[x.k]) }))
      : [];
  return {
    points,
    axis,
    axes,
    axisLabel,
    yTicks,
    sideTops,
    labels: [...yTicks.map(axisLabel), ...sideTops.map((x) => x.text)],
  };
}
type LineScale = ReturnType<typeof lineStripScale>;

/** The strip's frame, in either view: the slider over the plot. Its
 *  horizontal axis is the shared time axis; the cursor snaps to the nearest
 *  stop. Mouse, pen and touch scrub alike: only a press moves the cursor, a
 *  drag carries it (held by pointer capture off the strip until release), and
 *  hovering moves nothing. Where a press started tells a click or a tap
 *  (which freezes, where the page has `freeze`) from a drag (which scrubs). */
function StripSlider({
  geo,
  w,
  stops,
  at,
  xStop,
  cx,
  ready,
  ariaLabel,
  valueText,
  cursorWord,
  onPick,
  freeze,
  view,
  startDay,
  tip,
  children,
}: {
  geo: StripGeometry;
  w: number;
  stops: CombinedStop[];
  at: number;
  xStop: (s: CombinedStop) => number;
  /** The cursor's x. */
  cx: number;
  /** The plot has something to scrub over. */
  ready: boolean;
  ariaLabel: string;
  valueText: string;
  /** The cursor's day, over it while a press drags. */
  cursorWord: string;
  onPick: (i: number) => void;
  /** On a page that ties the panel to its timeline: a click or a tap (a press
   *  that does not drag) freezes the cursor. */
  freeze: { frozen: boolean; onTap: (i: number) => void } | null;
  view: "value" | "price";
  startDay: number;
  /** A tip at the cursor (the price strip's readout), given whether it
   *  shows: while a pointer is over the strip or drags it, while the strip
   *  has focus, after a tap until a press lands elsewhere, and while the
   *  inspector is armed on the panel. */
  tip?: (shown: boolean) => ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [over, setOver] = useState(false);
  const [focused, setFocused] = useState(false);
  const [tapped, setTapped] = useState(false);
  const armed = useProvArmedFor(FLOWS_SCOPE);
  useEffect(() => {
    if (!tapped) return;
    const away = (e: globalThis.PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setTapped(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [tapped]);
  /** The stop nearest the pointer, on the strip's time axis. */
  const nearest = (clientX: number): number | null => {
    const el = ref.current;
    if (!el || !ready || geo.run <= 0) return null;
    const px = clientX - el.getBoundingClientRect().left;
    const i = nearestStop(stops, geo.dayAt(px) - startDay);
    // The live stop sits at today, which may lie past the last event's stop count.
    const last = stops.length - 1;
    if (i === last - 1 && Math.abs(xStop(stops[last]) - px) < Math.abs(xStop(stops[i]) - px)) return last;
    return i;
  };
  const pressX = useRef<number | null>(null);
  const dragged = useRef(false);
  const [grabbing, setGrabbing] = useState(false);
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // A press on the tip is the tip's (its receipts), not the strip's.
    if ((e.target as Element).closest?.("[data-flow-price-tip]")) return;
    if (e.pointerType !== "mouse") setTapped(true);
    const i = nearest(e.clientX);
    if (i == null) return;
    dragging.current = true;
    pressX.current = e.clientX;
    dragged.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (!freeze) onPick(i);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const i = nearest(e.clientX);
    if (i == null) return;
    if (freeze && !dragged.current && Math.abs(e.clientX - (pressX.current ?? e.clientX)) < 5) return;
    // The hand closes only once the press drags: at rest the strip shows a
    // crosshair (Miles, 1 Oct 2026).
    if (!dragged.current) setGrabbing(true);
    dragged.current = true;
    onPick(i);
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const wasPress = dragging.current && !dragged.current;
    dragging.current = false;
    setGrabbing(false);
    if (freeze && wasPress) {
      const i = nearest(e.clientX);
      if (i != null) freeze.onTap(i);
    }
  };
  const onCancel = () => {
    dragging.current = false;
    setGrabbing(false);
  };
  const onKey = (e: KeyboardEvent) => {
    const step: Record<string, number> = {
      ArrowLeft: -1,
      ArrowDown: -1,
      ArrowRight: 1,
      ArrowUp: 1,
      PageDown: -4,
      PageUp: 4,
    };
    if (freeze && e.key === "Enter") {
      e.preventDefault();
      freeze.onTap(at);
      return;
    }
    if (e.key === "Home") onPick(0);
    else if (e.key === "End") onPick(stops.length - 1);
    else if (e.key in step) onPick(at + step[e.key]);
    else return;
    e.preventDefault();
  };
  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={Math.max(0, stops.length - 1)}
      aria-valuenow={at}
      aria-valuetext={valueText}
      className={`relative mt-0.5 ${grabbing ? "cursor-grabbing" : "cursor-crosshair"} touch-none select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-rb-400`}
      style={{ height: STRIP_H }}
      data-flow-strip=""
      data-flow-strip-view={view}
      data-anatomy={view === "price" ? "F19" : "F4"}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onCancel}
      onLostPointerCapture={onCancel}
      onPointerEnter={(e) => e.pointerType === "mouse" && setOver(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setOver(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={onKey}
    >
      {children}
      {tip && w > 0 && ready && tip(over || focused || tapped || grabbing || armed)}
      {grabbing && w > 0 && ready && (
        <span
          aria-hidden
          data-prov-hidden=""
          data-flow-drag-date=""
          className="pointer-events-none absolute bottom-full z-[var(--z-dropdown)] mb-1 -translate-x-1/2 whitespace-nowrap rounded-lg border px-2 py-1 text-xs font-medium tabular-nums text-foreground shadow-lg"
          style={{
            left: Math.max(36, Math.min(w - 36, cx)),
            background: "var(--rb-tooltip-bg)",
            borderColor: "var(--rb-tooltip-border)",
          }}
        >
          {cursorWord}
        </span>
      )}
    </div>
  );
}

/** The value labels in the lead-in at the plot's left, each centred on its
 *  gridline. */
function AxisLabels({ ticks, y, label }: { ticks: number[]; y: (v: number) => number; label: (v: number) => string }) {
  return (
    <>
      {ticks.map((t) => {
        const ty = y(t);
        return (
          // Centred on its gridline, on the card's ground so it stands clear
          // of the line under it.
          <span
            key={t}
            className="pointer-events-none absolute -translate-y-1/2 rounded-sm bg-raised px-0.5 text-[10px] leading-none tabular-nums text-rb-500"
            style={{ left: STRIP_PAD, top: Math.max(5, Math.min(STRIP_H - 5, ty)) }}
          >
            {label(t)}
          </span>
        );
      })}
    </>
  );
}

/** The collateral and debt line, short and unlabelled (the headlines carry the
 *  figures), with the bars' window shaded. */
function LineStrip({
  model,
  scale,
  failed,
  geo,
  w,
  today,
  cx,
  dim,
  ready,
  head,
  hasDebt,
  windowFrom,
}: {
  model: FlowModel;
  scale: LineScale;
  failed: boolean;
  geo: StripGeometry;
  w: number;
  today: number;
  cx: number;
  dim: boolean;
  ready: boolean;
  /** The headlines' figures, where the cursor's dots sit. */
  head: { collateral: number; debt: number };
  hasDebt: boolean;
  windowFrom: number | null;
}) {
  const startDay = model.start / DAY_MS;
  const { points, axis, axes, axisLabel, yTicks, sideTops } = scale;
  const n = points.length;
  const { x0, xDay } = geo;
  const xClose = (day: number) => geo.xClose(Math.min(day, today));
  const x = (i: number) => xClose(points[i].to);
  const y = (v: number, k?: "collateral" | "debt") =>
    STRIP_H - 2 - (v / (k && axes ? axes[k].max : axis.max)) * (STRIP_H - 8);
  // Before a side first holds anything it draws no line: its runs start at
  // its first point above zero, the step up from zero drawn there.
  const firstHeld = (k: "collateral" | "debt") => points.findIndex((p) => (p[k] ?? 0) > 0);
  const runs = (k: "collateral" | "debt") => {
    const out: number[][] = [];
    let cur: number[] = [];
    const from = firstHeld(k);
    if (from < 0) return out;
    points.forEach((p, i) => {
      if (i < from) return;
      if (p[k] == null) {
        if (cur.length) out.push(cur);
        cur = [];
      } else cur.push(i);
    });
    if (cur.length) out.push(cur);
    return out;
  };
  // A side's first run steps up from zero: at the first event's day to that
  // day's close where it held something from the first point, else at its
  // first point above zero.
  const firstClose = model.valued[0] ?? { collateral: model.live.collateralUsd, debt: model.live.debtUsd };
  const leadOf = (k: "collateral" | "debt", seq: number[]): string[] => {
    if (seq[0] !== firstHeld(k)) return [];
    if (seq[0] === 0 && firstClose[k] > 0) return [`${x0},${y(0)}`, `${x0},${y(firstClose[k], k)}`];
    return [`${x(seq[0])},${y(0)}`];
  };
  const lineOf = (k: "collateral" | "debt", seq: number[]) => {
    const pts = seq.map((i) => `${x(i)},${y(points[i][k] as number, k)}`);
    return [...leadOf(k, seq), ...pts].map((p, j) => `${j ? "L" : "M"}${p}`).join("");
  };
  // Where the side's value at a point rests on an old price (the model's
  // `stale`, as the readout's label), or on a price or a read the page does
  // not have (`unsure`): the segment into that point is drawn dotted. Today's
  // point is at live prices.
  const oldAt = (k: "collateral" | "debt", i: number) =>
    i < n - 1 &&
    ((model.stale.get(points[i].to - startDay) ?? []).some((x) => x.side === k) ||
      (model.unsure.get(points[i].to - startDay) ?? []).some((x) => x.side === k));
  /** A run's line as its solid and dotted pieces, each a path of whole
   *  segments; a dotted piece keeps the indexes of its points for its tip. */
  const piecesOf = (k: "collateral" | "debt", seq: number[]) => {
    const solid: string[] = [];
    const dotted: { d: string; idx: number[] }[] = [];
    const lead = leadOf(k, seq);
    if (lead.length > 0) {
      const p0 = `${x(seq[0])},${y(points[seq[0]][k] as number, k)}`;
      solid.push([...lead, p0].map((p, j) => `${j ? "L" : "M"}${p}`).join(""));
    }
    for (let j = 1; j < seq.length; j++) {
      const a = seq[j - 1];
      const b = seq[j];
      const seg = `M${x(a)},${y(points[a][k] as number, k)}L${x(b)},${y(points[b][k] as number, k)}`;
      if (!oldAt(k, b)) {
        solid.push(seg);
        continue;
      }
      const prev = dotted[dotted.length - 1];
      if (prev && prev.idx[prev.idx.length - 1] === a) {
        prev.d += `L${x(b)},${y(points[b][k] as number, k)}`;
        prev.idx.push(b);
      } else dotted.push({ d: seg, idx: [a, b] });
    }
    return { solid: solid.join(""), dotted };
  };
  // A dotted piece under the mouse opens the label's tip for its nearest point.
  const [oldTip, setOldTip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const plotRef = useRef<SVGSVGElement>(null);
  const hoverOld = (e: PointerEvent<SVGPathElement>, k: "collateral" | "debt", idx: number[]) => {
    if (e.pointerType !== "mouse") return;
    const px = e.clientX - (plotRef.current?.getBoundingClientRect().left ?? 0);
    let best = idx[idx.length - 1];
    for (const i of idx) if (oldAt(k, i) && Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    const stop = points[best].to - startDay;
    const held = unsureAt(model, stop, k).held;
    // The old-price line once, where a reason already names each asset it names.
    const old = oldPriceAt(model, stop)?.lines ?? [];
    const stale = (model.stale.get(stop) ?? []).filter((x) => x.side === k);
    const named = stale.length > 0 && stale.every((x) => held.some((h) => h.startsWith(`${x.symbol} `)));
    const lines = [...(named ? old.slice(0, old.length - 1) : old), ...held];
    setOldTip(lines.length ? { x: px, y: y(points[best][k] as number, k), lines } : null);
  };
  const area = (k: "collateral" | "debt", seq: number[]) =>
    `${lineOf(k, seq)}L${x(seq[seq.length - 1])},${STRIP_H}L${leadOf(k, seq).length === 2 ? x0 : x(seq[0])},${STRIP_H}Z`;
  const shade = windowFrom != null && windowFrom > startDay ? xDay(windowFrom) : null;
  const sides = hasDebt ? (["collateral", "debt"] as const) : (["collateral"] as const);

  if (!(w > 0 && ready))
    return (
      <p className="flex h-full items-center justify-center text-xs text-rb-500">
        {failed ? "The line could not be read. Reload to try again." : "Reading the line…"}
      </p>
    );
  return (
    <>
      <svg ref={plotRef} width={w} height={STRIP_H} aria-hidden className="block">
        {shade != null && (
          <rect
            x={shade}
            y={0}
            width={Math.max(0, w - STRIP_PAD - shade)}
            height={STRIP_H}
            className="fill-rb-400/15 dark:fill-rb-500/15"
            data-flow-window=""
          />
        )}
        {/* Faint gridlines at the value labels' ticks, the zero line the
            plot's floor. */}
        {yTicks.map((t) => (
          <line
            key={t}
            x1={STRIP_PAD}
            x2={w - STRIP_PAD}
            y1={y(t)}
            y2={y(t)}
            className="stroke-rb-400/12 dark:stroke-rb-500/15"
            strokeWidth={1}
            data-flow-gridline=""
          />
        ))}
        {sides.map((k) =>
          runs(k).map((seq) => {
            const pieces = piecesOf(k, seq);
            return (
              <g key={`${k}${seq[0]}`}>
                <path d={area(k, seq)} fill={LINE_HUE[k]} fillOpacity={k === "collateral" ? 0.14 : 0.12} />
                {pieces.solid && (
                  <path d={pieces.solid} fill="none" stroke={LINE_HUE[k]} strokeWidth={1.5} strokeLinejoin="round" />
                )}
                {pieces.dotted.map((p) => (
                  <path
                    key={p.idx[0]}
                    d={p.d}
                    fill="none"
                    stroke={LINE_HUE[k]}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeDasharray="0 4"
                    data-flow-old-line={k}
                  />
                ))}
              </g>
            );
          }),
        )}
        {dim && <AfterCursor x={cx} w={w} />}
        {/* Each dotted piece's hit area, wider than its stroke. */}
        {sides.map((k) =>
          runs(k).flatMap((seq) =>
            piecesOf(k, seq).dotted.map((p) => (
              <path
                key={`${k}${p.idx[0]}`}
                d={p.d}
                fill="none"
                stroke="transparent"
                strokeWidth={12}
                pointerEvents="stroke"
                onPointerMove={(e) => hoverOld(e, k, p.idx)}
                onPointerLeave={() => setOldTip(null)}
                data-flow-old-hit={k}
              />
            )),
          ),
        )}
        <CursorLine x={cx} />
        <CursorDot x={cx} y={y(head.collateral, "collateral")} hue={LINE_HUE.collateral} />
        {hasDebt && <CursorDot x={cx} y={y(head.debt, "debt")} hue={LINE_HUE.debt} />}
      </svg>
      <div aria-hidden data-prov-exempt="" data-flow-line-axis="">
        {sideTops.map((x, i) => (
          <span
            key={x.k}
            className={`pointer-events-none absolute text-[10px] leading-none tabular-nums ${x.k === "collateral" ? "text-blue-600 dark:text-blue-400" : "text-green-700 dark:text-green-400"}`}
            style={{ left: STRIP_PAD + 1, top: 2 + i * 12 }}
            data-flow-line-side-top={x.k}
          >
            {x.text}
          </span>
        ))}
        <AxisLabels ticks={yTicks} y={(t) => y(t)} label={axisLabel} />
      </div>
      {oldTip && (
        <span
          role="tooltip"
          data-prov-hidden=""
          data-flow-old-tip=""
          className="pointer-events-none absolute z-[var(--z-dropdown)] rounded-2xl border p-3 text-xs font-medium text-foreground shadow-lg"
          style={{
            left: Math.max(4, Math.min(w - OLD_TIP_W - 4, oldTip.x - OLD_TIP_W / 2)),
            bottom: STRIP_H - oldTip.y + 10,
            background: "var(--rb-tooltip-bg)",
            borderColor: "var(--rb-tooltip-border)",
          }}
        >
          <OldPriceTip lines={oldTip.lines} />
        </span>
      )}
    </>
  );
}

/** The strip after the cursor lies under a translucent layer, except at
 *  today, where nothing is after it. */
function AfterCursor({ x, w }: { x: number; w: number }) {
  return (
    <rect
      x={x}
      y={0}
      width={Math.max(0, w - x)}
      height={STRIP_H}
      style={{ fill: "var(--surface-raised)" }}
      fillOpacity={0.7}
      pointerEvents="none"
      data-flow-after-cursor=""
    />
  );
}

function CursorLine({ x }: { x: number }) {
  return <line x1={x} x2={x} y1={0} y2={STRIP_H} className="stroke-foreground" strokeWidth={1} pointerEvents="none" />;
}

function CursorDot({ x, y, hue }: { x: number; y: number; hue: string }) {
  return <circle cx={x} cy={y} r={3.5} fill={hue} className="stroke-background" strokeWidth={1.5} />;
}

/** One asset's price scale over the visible days, and the pieces its line
 *  draws (lib/shared/flows-price.ts). */
export function priceStripScale(s: FlowPriceSeries, startDay: number, today: number) {
  const pieces = pricePieces(s, startDay, today);
  const inView = (day: number) => day >= startDay && day <= today;
  const level = (s.level?.points ?? []).filter((p) => inView(p[0]));
  const events = (s.events ?? []).filter((e) => inView(e.day));
  const values = [
    ...[...pieces.solid, ...pieces.dotted, ...pieces.flat, ...pieces.riser].flat().map((v) => v[1]),
    ...level.map((p) => p[1]),
    ...events.flatMap((e) => (e.redemptionPrice != null ? [e.price, e.redemptionPrice] : [e.price])),
  ];
  const axis = priceAxis(values);
  return { pieces, level, events, axis, labels: priceAxisLabels(axis.ticks) };
}
type PriceScale = ReturnType<typeof priceStripScale>;

/** The price line of one held asset in its unit, on the time axis the flows
 *  line uses: solid day to day, dotted where a day's price is carried, the
 *  step mark for an event series. */
function PriceStrip({
  s,
  scale,
  geo,
  w,
  today,
  cx,
  dim,
  cursorPrice,
  cursorLevel,
  windowFrom,
  startDay,
}: {
  s: FlowPriceSeries;
  scale: PriceScale;
  geo: StripGeometry;
  w: number;
  today: number;
  cx: number;
  dim: boolean;
  cursorPrice: number | null;
  /** The liquidation level on the cursor's day, where the series has one. */
  cursorLevel: number | null;
  windowFrom: number | null;
  startDay: number;
}) {
  const { pieces, axis, level, events } = scale;
  const xClose = (day: number) => geo.xClose(Math.min(day, today));
  const y = (v: number) => STRIP_H - 4 - ((v - axis.min) / (axis.max - axis.min || 1)) * (STRIP_H - 8);
  const path = (vs: [number, number][]) => vs.map(([d, v], j) => `${j ? "L" : "M"}${xClose(d)},${y(v)}`).join("");
  // A lone day draws as a point.
  const dots = pieces.solid.filter((p) => p.length === 1);
  // The liquidation level: held from one day's close to the next, stepped
  // on the day it moves; a day it has none breaks it.
  const levelRuns: [number, number][][] = [];
  for (const [d, v] of level) {
    const run = levelRuns[levelRuns.length - 1];
    if (run && run[run.length - 1][0] === d - 1) run.push([d, v]);
    else levelRuns.push([[d, v]]);
  }
  const stepPath = (run: [number, number][]) =>
    run
      .map(([d, v], j) =>
        j === 0 ? `M${xClose(d)},${y(v)}` : `L${xClose(d)},${y(run[j - 1][1])}L${xClose(d)},${y(v)}`,
      )
      .join("");
  const redeemed = events.filter((e) => e.redemptionPrice != null);
  const hue = LINE_HUE[s.side];
  const shade = windowFrom != null && windowFrom > startDay ? geo.xDay(windowFrom) : null;
  if (!(w > 0)) return null;
  return (
    <>
      <svg width={w} height={STRIP_H} aria-hidden className="block">
        {shade != null && (
          <rect
            x={shade}
            y={0}
            width={Math.max(0, w - STRIP_PAD - shade)}
            height={STRIP_H}
            className="fill-rb-400/15 dark:fill-rb-500/15"
            data-flow-window=""
          />
        )}
        {axis.ticks.map((t) => (
          <line
            key={t}
            x1={STRIP_PAD}
            x2={w - STRIP_PAD}
            y1={y(t)}
            y2={y(t)}
            className="stroke-rb-400/12 dark:stroke-rb-500/15"
            strokeWidth={1}
            data-flow-gridline=""
          />
        ))}
        <g
          data-price-line={s.key}
          data-price-grain={s.grain}
          data-price-observed={pieces.observed.join(",")}
          data-price-carried={pieces.carried.join(",")}
        >
          {pieces.solid
            .filter((p) => p.length > 1)
            .map((p) => (
              <path
                key={`s${p[0][0]}`}
                d={path(p)}
                fill="none"
                stroke={hue}
                strokeWidth={1.5}
                strokeLinejoin="round"
                data-price-solid=""
              />
            ))}
          {dots.map((p) => (
            <circle key={`p${p[0][0]}`} cx={xClose(p[0][0])} cy={y(p[0][1])} r={1.5} fill={hue} />
          ))}
          {pieces.dotted.map((p) => (
            <path
              key={`d${p[0][0]}`}
              d={path(p)}
              fill="none"
              stroke={hue}
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray="0 4"
              data-price-carried-line=""
            />
          ))}
          {pieces.flat.map((p) => (
            <path key={`f${p[0][0]}`} d={path(p)} fill="none" stroke={hue} strokeWidth={1.5} data-price-step="" />
          ))}
          {pieces.riser.map((p) => (
            <path
              key={`r${p[0][0]}`}
              d={path(p)}
              fill="none"
              stroke={hue}
              strokeWidth={1}
              strokeDasharray="2 2"
              data-price-riser=""
            />
          ))}
        </g>
        <g data-anatomy="F19.4">
          {levelRuns.map((run) => (
            <path
              key={`l${run[0][0]}`}
              d={stepPath(run)}
              fill="none"
              stroke={LIQ_HUE}
              strokeWidth={1.25}
              strokeLinejoin="round"
              data-liq-level=""
              data-liq-days={run.map((p) => p[0]).join(",")}
            />
          ))}
        </g>
        {/* Each row's price on its day; a redemption's redemption price over it. */}
        <g data-price-events={events.length} data-anatomy="F19.5">
          {events.map((e, i) => (
            <circle
              key={`e${i}`}
              cx={xClose(e.day)}
              cy={y(e.price)}
              r={2.25}
              className={e.tone === "liquidation" ? undefined : "fill-background"}
              fill={e.tone === "liquidation" ? LIQ_HUE : undefined}
              stroke={e.tone === "liquidation" ? LIQ_HUE : hue}
              strokeWidth={1.25}
              data-price-event={e.tone}
              data-price-event-day={e.day}
              data-price-event-block={e.block ?? ""}
              data-price-event-price={e.price}
            />
          ))}
        </g>
        <g data-redemption-marks={redeemed.length} data-anatomy="F19.6">
          {redeemed.map((e, i) => {
            const ex = xClose(e.day);
            const ey = y(e.redemptionPrice!);
            return (
              <path
                key={`r${i}`}
                d={`M${ex},${ey - 3}L${ex + 3},${ey}L${ex},${ey + 3}L${ex - 3},${ey}Z`}
                fill={FLOW_TICK.redemption}
                className="stroke-background"
                strokeWidth={0.75}
                data-redemption-mark=""
                data-redemption-day={e.day}
                data-redemption-block={e.block ?? ""}
                data-redemption-price={e.redemptionPrice}
              />
            );
          })}
        </g>
        {dim && <AfterCursor x={cx} w={w} />}
        <CursorLine x={cx} />
        {cursorLevel != null && <CursorDot x={cx} y={y(cursorLevel)} hue={LIQ_HUE} />}
        {cursorPrice != null && <CursorDot x={cx} y={y(cursorPrice)} hue={hue} />}
      </svg>
      <div aria-hidden data-prov-exempt="" data-price-axis="">
        <AxisLabels ticks={axis.ticks} y={y} label={(t) => scale.labels[axis.ticks.indexOf(t)] ?? ""} />
      </div>
    </>
  );
}

/** The price chart's heading, "Daily [WBTC ▾] USD price", at the plot's
 *  left: the asset a list where the position holds several with a series. */
function PriceHeading({
  series,
  selected,
  onPick,
  day,
  gapDays,
  isLive,
}: {
  series: FlowPriceSeries[];
  selected: FlowPriceSeries;
  onPick: (key: string) => void;
  /** The cursor's day: the heading's figures follow it. */
  day: number;
  gapDays: number;
  isLive: boolean;
}) {
  const asset =
    series.length > 1 ? (
      <AssetPicker series={series} selected={selected} onPick={onPick} />
    ) : (
      <span className="inline-flex items-center gap-1 text-foreground" data-price-asset={selected.asset.symbol}>
        <AssetIcon s={selected} />
        {selected.asset.symbol}
      </span>
    );
  return (
    <div
      className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 ${SECTION_HEADING} text-rb-500`}
      style={{ paddingLeft: Math.max(0, STRIP_PAD) }}
      data-price-heading=""
    >
      {asset}
      <PriceFigures s={selected} day={day} gapDays={gapDays} isLive={isLive} />
    </div>
  );
}

/** The heading's figures at the cursor's day: the price, and the
 *  liquidation level where the series has one, each with its receipt. At
 *  today the price takes the live green (color-grammar §5a; green-600 on the
 *  light surface, where green-400 reads pale) and the level red; in history
 *  the price is plain and the level muted. */
function PriceFigures({
  s,
  day,
  gapDays,
  isLive,
}: {
  s: FlowPriceSeries;
  day: number;
  gapDays: number;
  isLive: boolean;
}) {
  const r = priceReadout(s, day, gapDays);
  const dayWord = isLive ? "today" : dayStamp(day * 86_400);
  const lv = s.level ? levelAt(s, day) : null;
  const here = s.level?.here;
  const levelProv: Provenance | null = lv
    ? {
        kind: "derived",
        summary: `${s.level!.summary} ${
          lv[2] == null
            ? (here?.live ??
              "Here at the trove's debt and collateral as the TroveManager reports them now, the card's figure.")
            : here
              ? here.read.replace("{block}", lv[2].toLocaleString("en-US")).replace("{day}", dayWord)
              : `Here at the debt and collateral the trove's event at block ${lv[2].toLocaleString("en-US")} recorded, the debt grown by its interest to the end of ${dayWord}.`
        }`,
        formula: s.level!.formula,
        ...(lv[2] != null ? { source: { block: lv[2] } } : {}),
      }
    : null;
  return (
    <span
      className="inline-flex flex-wrap items-baseline gap-x-1.5 tabular-nums"
      aria-live="polite"
      data-anatomy="F19.2"
    >
      {r ? (
        <span
          className={`font-semibold ${isLive ? "text-green-600 dark:text-green-400" : "text-foreground"}`}
          data-price-readout=""
          data-price-day={r.point[0]}
          data-price-block={r.point[2] ?? ""}
          data-price-carried={r.carried ? r.ageDays : undefined}
        >
          <Prov
            info={s.health ? healthProv(s, r, dayWord) : readoutProv(s, r, dayWord, dayStamp(r.point[0] * 86_400))}
            value={String(r.point[1])}
          >
            {formatPrice(r.point[1], s.unitLabel)}
          </Prov>
        </span>
      ) : (
        <span data-price-readout="" data-price-none="">
          {s.health ? "No health factor" : "No price recorded"}
        </span>
      )}
      {lv && levelProv && (
        <span
          className="whitespace-nowrap"
          data-liq-readout=""
          data-liq-day={lv[0]}
          data-liq-block={lv[2] ?? ""}
          data-liq-value={lv[1]}
          data-anatomy="F19.3"
        >
          · {s.health ? "Liquidates below" : "Liquidates at"}{" "}
          <span className={`font-semibold ${isLive ? "text-red-600 dark:text-red-400" : "text-rb-500"}`}>
            <Prov info={levelProv} value={String(lv[1])}>
              {s.health ? "1" : formatPrice(lv[1], s.unitLabel)}
            </Prov>
          </span>
        </span>
      )}
    </span>
  );
}

/** An asset's mark at the heading's text size, as the headlines draw it;
 *  the health factor's a pulse. */
function AssetIcon({ s }: { s: FlowPriceSeries }) {
  if (s.health)
    return (
      <span className="inline-flex size-4 shrink-0 items-center justify-center text-rb-500" aria-hidden>
        <Activity size={13} />
      </span>
    );
  return (
    <span className="inline-flex size-4 shrink-0 items-center justify-center" aria-hidden>
      <TokenChipIcon symbol={s.asset.symbol} address={s.asset.address} size={14} filterable={false} untitled />
    </span>
  );
}

/** The heading's asset list: a button naming the asset with its mark, a
 *  listbox of the held assets with theirs. Arrows, Home and End move,
 *  Enter or Space picks, Escape and a press elsewhere close. */
function AssetPicker({
  series,
  selected,
  onPick,
}: {
  series: FlowPriceSeries[];
  selected: FlowPriceSeries;
  onPick: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: globalThis.PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    // The chosen option takes focus as the list opens.
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  const pick = (key: string) => {
    onPick(key);
    close();
  };
  const onListKey = (e: React.KeyboardEvent<HTMLUListElement>) => {
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const to =
      e.key === "ArrowDown"
        ? Math.min(items.length - 1, at + 1)
        : e.key === "ArrowUp"
          ? Math.max(0, at - 1)
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? items.length - 1
              : null;
    if (to != null) {
      e.preventDefault();
      items[to]?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const key = (document.activeElement as HTMLElement | null)?.dataset.priceKey;
      if (key) pick(key);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") setOpen(false);
  };
  return (
    <span ref={wrapRef} className="relative inline-flex" {...KEEP_PANEL}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Asset: ${selected.asset.symbol}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`inline-flex min-h-11 cursor-pointer items-center gap-1 rounded bg-[var(--surface-sunken)] py-0.5 pl-1.5 pr-1 ${SECTION_HEADING} text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rb-400 sm:min-h-0`}
        data-price-picker=""
      >
        <AssetIcon s={selected} />
        {selected.asset.symbol}
        <ChevronDown size={12} aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Asset"
          onKeyDown={onListKey}
          className="overlay-panel absolute left-0 top-full z-[var(--z-dropdown)] mt-1 min-w-full overflow-hidden py-1"
        >
          {series.map((s) => {
            const on = s.key === selected.key;
            return (
              <li
                key={s.key}
                role="option"
                aria-selected={on}
                aria-label={s.asset.symbol}
                tabIndex={-1}
                onClick={() => pick(s.key)}
                className={`mx-1 flex min-h-11 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-2 ${SECTION_HEADING} outline-none hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)] sm:min-h-8 ${on ? "bg-[var(--surface-hover)] text-foreground" : "text-foreground"}`}
                data-price-asset={s.asset.symbol}
                data-price-key={s.key}
              >
                <AssetIcon s={s} />
                {s.asset.symbol}
              </li>
            );
          })}
        </ul>
      )}
    </span>
  );
}

/** A section's "?" at its right end, opening its how-to-read in the
 *  learn-more modal. */
function SectionHelp({
  content,
  name,
  anatomy,
  extra,
}: {
  content: LearnMoreContent;
  name: string;
  anatomy: string;
  extra?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="shrink-0 text-rb-500" data-flow-help={anatomy} {...KEEP_PANEL}>
      <LearnMoreButton onClick={() => setOpen(true)} ariaLabel={`How to read ${name}`} />
      {open && <LearnMoreModal content={content} onClose={() => setOpen(false)} anatomy={anatomy} extra={extra} />}
    </span>
  );
}

/** The cursor's date under the events, at the cursor's x, in one of three
 *  states. While the timeline follows the chart: the date in the text colour
 *  after the teal chain, nothing to press. On a page tied to its timeline
 *  otherwise: the date is the button that cuts the timeline at that day's
 *  close (the list icon before it), pressed while the cut stands at the
 *  cursor's day. With no timeline: the date alone. */
function CursorDate({
  x,
  w,
  word,
  byDays,
  follow,
  applied,
  committedWord,
  live,
  onApply,
}: {
  x: number;
  w: number;
  word: string;
  byDays: boolean;
  follow: boolean;
  /** The timeline is cut at the cursor's day. */
  applied: boolean;
  committedWord: string;
  live: boolean;
  onApply: () => void;
}) {
  const ref = useRef<HTMLSpanElement & HTMLButtonElement>(null);
  const [left, setLeft] = useState<number | null>(null);
  // The date centred on the cursor, kept inside the row.
  useLayoutEffect(() => {
    const dw = ref.current?.offsetWidth ?? 0;
    setLeft(Math.max(0, Math.min(w - dw, x - dw / 2)));
  });
  const place = { left: left ?? 0, visibility: left == null ? ("hidden" as const) : undefined };
  const text =
    "absolute top-0 inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap px-1.5 text-xs font-semibold tabular-nums sm:min-h-8";
  return (
    <div className="relative mt-1 h-11 sm:h-8" data-flow-cursor-date={follow ? "following" : byDays ? "cut" : "plain"}>
      {byDays && !follow ? (
        <button
          ref={ref}
          type="button"
          className={`${CTRL_GHOST} ${applied ? CTRL_ON_ACCENT : CTRL_OFF} ${text} rounded-md`}
          style={place}
          aria-pressed={applied}
          aria-label={live ? "Show the timeline to today" : `Show the timeline to ${committedWord}`}
          title={
            applied
              ? `The timeline is cut at ${committedWord}`
              : live
                ? "Show the timeline up to today"
                : `Show the timeline up to the end of ${committedWord}`
          }
          onClick={() => !applied && onApply()}
          data-flow-apply=""
          data-flow-cursor-word=""
          data-anatomy="F6"
        >
          <ListEnd size={14} aria-hidden />
          {word}
        </button>
      ) : (
        <span ref={ref} className={`${text} text-foreground`} style={place} data-flow-cursor-word="">
          {follow && <Link2 size={14} aria-hidden className="text-teal-600 dark:text-teal-400" />}
          {word}
        </span>
      )}
    </div>
  );
}

/** The receipt of the readout's health factor, in the series' words
 *  (`PriceSeries.here`): the read its point rests on, or the live figure. */
function healthProv(s: FlowPriceSeries, r: PriceAt, dayWord: string): Provenance {
  const block = r.point[2];
  return {
    kind: "derived",
    summary:
      block == null
        ? (s.here?.live ?? "Health factor — the live figure.")
        : (s.here?.read ?? "Health factor — on {day}, from the read at block {block}.")
            .replace("{block}", block.toLocaleString("en-US"))
            .replace("{day}", dayWord),
    formula: "Σ collateral × price × liquidation threshold ÷ Σ debt × price",
    ...(block != null ? { source: { block } } : {}),
  };
}

/** The receipt of the readout's price: the series' point at or before the
 *  cursor's day, read at its block. */
function readoutProv(s: FlowPriceSeries, r: PriceAt, dayWord: string, pointWord: string): Provenance {
  const block = r.point[2];
  return {
    kind: "chain",
    pclass: "oracle",
    summary: r.carried
      ? `${s.asset.symbol} price — in ${s.unitLabel}, carried to ${dayWord} from ${pointWord}, the last day with a price recorded; from ${s.source}.`
      : `${s.asset.symbol} price — in ${s.unitLabel} on ${dayWord}, from ${s.source}.`,
    ...(block != null ? { source: { block } } : {}),
  };
}

/** The event pips under the strip, on the shared time axis, the cursor
 *  running through them: one row for both views. The nearest pip within
 *  reach of the pointer names its day's events; a tap or a click also moves
 *  the cursor to that day. */
function PipRow({
  model,
  geo,
  w,
  today,
  stops,
  at,
  cx,
  dim,
  ready,
  onPick,
}: {
  model: FlowModel;
  geo: StripGeometry;
  w: number;
  today: number;
  stops: CombinedStop[];
  at: number;
  cx: number;
  dim: boolean;
  ready: boolean;
  onPick: (i: number) => void;
}) {
  const startDay = model.start / DAY_MS;
  const xClose = (day: number) => geo.xClose(Math.min(day, today));
  const pipRef = useRef<HTMLDivElement>(null);
  const [pip, setPip] = useState<{ x: number; text: string; day: number } | null>(null);
  const tickText = (t: FlowModel["ticks"][number]) =>
    `${dayStamp(dayStart(model, t.day))}${t.kinds.length ? `: ${t.kinds.join(", ")}` : ""}`;
  const tickAt = (clientX: number, reach: number) => {
    const el = pipRef.current;
    if (!el) return null;
    const px = clientX - el.getBoundingClientRect().left;
    let best: FlowModel["ticks"][number] | null = null;
    let bestD = Infinity;
    for (const t of model.ticks) {
      const d = Math.abs(xClose(startDay + t.day) - px);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best && bestD <= reach ? best : null;
  };
  const openTick = (t: FlowModel["ticks"][number]) => ({
    x: Math.max(80, Math.min(w - 80, xClose(startDay + t.day))),
    text: tickText(t),
    day: t.day,
  });
  // A tapped tick's tip closes once the cursor moves off its day.
  // It sets state only where a tip is open: a no-op update queued on every
  // step rendered at default priority and committed nothing, so React never
  // cleared its nested-update count, and about 160 quick arrow presses hit
  // its limit (rails-ops TO-DO-ui-jobs 227).
  const atDay = stops[at]?.stop;
  const pipNow = useRef(pip);
  pipNow.current = pip;
  useEffect(() => {
    if (pipNow.current && pipNow.current.day !== atDay) setPip(null);
  }, [atDay]);
  useEffect(() => {
    if (!pip) return;
    const away = (e: globalThis.PointerEvent) => {
      if (!pipRef.current?.contains(e.target as Node)) setPip(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [pip]);
  return (
    <div
      ref={pipRef}
      // A pill on the sunken ground, padded only vertically so each pip keeps
      // its x on the charts' axis; the whole pill takes the press.
      className="relative h-11 cursor-pointer rounded-full bg-sunken py-3 sm:h-[38px]"
      data-flow-pips=""
      data-anatomy="F4.1"
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        const t = tickAt(e.clientX, TICK_REACH.mouse);
        setPip(t ? openTick(t) : null);
      }}
      onPointerLeave={(e) => e.pointerType === "mouse" && setPip(null)}
      onClick={(e) => {
        const t = tickAt(e.clientX, TICK_REACH.touch);
        if (!t) return setPip(null);
        setPip(openTick(t));
        const i = stopForDay(stops, t.day);
        if (i != null) onPick(i);
      }}
    >
      {/* No cursor line here: the dots are pressed, and the line stands on
          the charts above. */}
      <div aria-hidden>
        {w > 0 &&
          visiblePips(model.ticks, (d) => xClose(startDay + d)).map((t) => (
            <FlowPip
              key={t.day}
              tick={t.tick}
              left={xClose(startDay + t.day)}
              opacity={dim && xClose(startDay + t.day) > cx + 0.5 ? 0.35 : 1}
            />
          ))}
      </div>
      {pip && (
        <span
          role="tooltip"
          data-prov-hidden=""
          data-flow-pip-tip=""
          className="pointer-events-none absolute bottom-full z-[var(--z-dropdown)] mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg border px-2 py-1 text-xs font-medium tabular-nums text-foreground shadow-lg"
          style={{ left: pip.x, background: "var(--rb-tooltip-bg)", borderColor: "var(--rb-tooltip-border)" }}
        >
          {pip.text}
        </span>
      )}
    </div>
  );
}
