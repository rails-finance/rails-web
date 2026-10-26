"use client";

// One chain's section of an asset page (rails-ops reference/asset-key-map.md):
// the price chart 328 built (`CombinedFlows`, the price chart alone) with a
// line per feed, the main one (the most read) in its hue and the others thin
// beneath it, the spread strip under it (each line against the main one at
// the cursor), then the lines listed: each oracle named, the protocols that
// read it with their series, the span stored and its "as of" stamp (decision
// 0054, ruling 2).
// A line is the daily store's series (`/api/prices/daily`), a point per
// completed UTC day, continued from its stored rounds' first day by the
// rounds' day closes where the chain serves them (`/api/prices/rounds`,
// `joinRounds`); the switch over the chart opens the rounds alone, every
// change of each line's value (A3.3). The join is stated under the chart and
// in each line's stamp.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AssetSpreadStrip } from "@/components/assets/asset-spread-strip";
import { AssetRoundsChart } from "@/components/assets/asset-rounds-chart";
import { roundTime } from "@/components/assets/round-time";
import { inForce, lineSpreads } from "@/lib/shared/asset-spread";
import { fetchPriceRounds, type RoundsAnswer } from "@/lib/api/fetch-price-rounds";
import { CombinedFlows } from "@/components/shared/lifetime-flows-combined";
import { FlowUnitContext } from "@/components/shared/lifetime-flows-tip";
import { fetchDailyAnswer, type DailyAnswer } from "@/lib/api/fetch-daily-prices";
import { dailyStorePriceSeries, joinRounds, roundsOf, type PriceRounds } from "@/lib/shared/price-series";
import type { FlowPriceSeries } from "@/lib/shared/flows-price";
import { buildFlowModel, type FlowModel } from "@/lib/shared/flows-timeline";
import type { FlowBinSeries } from "@/lib/shared/flows-series";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import { formatDate } from "@/lib/date";
import { assetPriceChartContent } from "@/lib/shared/learn-more-content";
import { lineName, shortAddress, type PageChain, type PageLine } from "@/lib/shared/asset-roster";

const DAY_MS = 86_400_000;
/** The store answers at most 3,000 days a read. */
const MAX_DAYS = 2999;
const dayDate = (day: number) => formatDate(new Date(day * DAY_MS));

/** The chart's time axis as the panel's model: one held day at the first
 *  price, the live stop today, and a stop on every day between. */
function axisModel(firstDay: number, today: number): { model: FlowModel; series: FlowBinSeries } | null {
  const model = buildFlowModel({
    buckets: [],
    days: [
      {
        day: firstDay,
        events: 1,
        tick: "collateral",
        cum: {},
        balances: [{ asset: "asset", symbol: "", side: "collateral", amount: 1 }],
        prices: [],
      },
    ],
    live: { collateralUsd: 0, debtUsd: 0 },
    today,
    totalEvents: 0,
  });
  if (!model) return null;
  const points: FlowBinSeries["points"] = [];
  for (let d = firstDay; d <= today; d++) points.push([d, d, null, null]);
  return {
    model,
    series: { bin: "day", first: firstDay, today, window: { from: firstDay, activeDays: 1 }, points, gaps: [] },
  };
}

/** The join under the chart: from which day the lines are their stored rounds. */
function joinText(lines: { rounds: PriceRounds }[], drawn: number, joinDay: number): string {
  const who = lines.length === drawn ? "the lines are" : `${lines.length} of the ${drawn} lines are`;
  const one = lines.every((l) => l.rounds.joinDay === joinDay);
  return one
    ? `From ${dayDate(joinDay)} ${who} their stored oracle rounds, each day at its close; before it, the daily store.`
    : `${who[0].toUpperCase()}${who.slice(1)} their stored oracle rounds from the time each line's stamp names, each day at its close; before it, the daily store.`;
}

export function AssetPriceChart({ section, symbol }: { section: PageChain; symbol: string }) {
  const drawn = section.lines.filter((l) => l.drawn != null);
  const keys = drawn.map((l) => l.drawn!.key);
  const [answer, setAnswer] = useState<DailyAnswer | null>(null);
  const [failed, setFailed] = useState(false);
  const [rounds, setRounds] = useState<RoundsAnswer | null>(null);
  const keyList = keys.join(",");
  const oracleList = drawn.map((l) => l.oracle.address).join(",");
  useEffect(() => {
    const ctl = new AbortController();
    setRounds(null);
    // A failed or switched-off read leaves the daily stores alone on the chart.
    fetchPriceRounds(section.chain, oracleList.split(",").filter(Boolean).slice(0, 12), { signal: ctl.signal })
      .then((a) => !ctl.signal.aborted && setRounds(a))
      .catch(() => {});
    return () => ctl.abort();
  }, [section.chain, oracleList]);
  useEffect(() => {
    const ctl = new AbortController();
    setFailed(false);
    fetchDailyAnswer(section.chain, keyList.split(",").filter(Boolean), {
      from: Math.floor(Date.now() / DAY_MS) - MAX_DAYS,
      signal: ctl.signal,
    })
      .then((a) => (a ? setAnswer(a) : setFailed(true)))
      .catch(() => !ctl.signal.aborted && setFailed(true));
    return () => ctl.abort();
  }, [section.chain, keyList]);

  const byKey = useMemo(() => new Map(drawn.map((l) => [l.drawn!.key, l])), [drawn]);
  const prices = useMemo<FlowPriceSeries[]>(() => {
    if (!answer) return [];
    const series = dailyStorePriceSeries(answer, (k) => (byKey.has(k) ? { symbol, chain: section.chain } : null));
    return drawn
      .map((l) => series[l.drawn!.key])
      .filter((s) => s != null)
      .map((s) => {
        const l = byKey.get(s.key)!;
        const wire = rounds?.lane === "on" ? rounds.lines[l.oracle.address.toLowerCase()] : undefined;
        const r = wire && "points" in wire ? roundsOf(wire, rounds!.asOf) : null;
        return {
          ...(r ? joinRounds(s, r) : s),
          source: l.oracle.name,
          side: "collateral" as const,
          unitLabel: "USD",
          name: lineName(l),
          tag: shortAddress(l.oracle.address),
        };
      });
  }, [answer, rounds, byKey, drawn, symbol, section.chain]);
  const today = Math.floor(Date.now() / DAY_MS);
  const firstDay = prices.length ? Math.min(...prices.map((p) => p.points[0][0])) : null;
  const axis = useMemo(() => (firstDay == null ? null : axisModel(firstDay, today)), [firstDay, today]);
  const help = useMemo(() => assetPriceChartContent(symbol), [symbol]);
  const lastOf = (key: string) => prices.find((p) => p.key === key)?.points.at(-1) ?? null;
  // The spread: every drawn line against the main one (the first drawn).
  const spreads = useMemo(() => {
    const main = prices[0];
    const mainLine = main ? byKey.get(main.key) : undefined;
    if (!main || !mainLine) return null;
    const withRounds = (r: PriceRounds | undefined) => (r ? { rounds: { points: r.points, joinDay: r.joinDay } } : {});
    const others = prices.slice(1).map((p) => ({
      key: p.key,
      points: p.points,
      fixed: byKey.get(p.key)!.oracle.kind === "fixed",
      ...withRounds(p.rounds),
    }));
    const out = lineSpreads(
      { key: main.key, points: main.points, fixed: mainLine.oracle.kind === "fixed", ...withRounds(main.rounds) },
      others,
      section.chain,
    );
    return { main: mainLine, others: out.map((sp) => ({ line: byKey.get(sp.key)!, spread: sp })) };
  }, [prices, byKey, section.chain]);
  // The cursor's day, or at the live stop the last completed day stored.
  const [cursorAt, setCursorDay] = useState<number | null>(null);
  const lastDay = prices[0]?.points.at(-1)?.[0] ?? null;
  const cursorDay = cursorAt == null || lastDay == null ? cursorAt : Math.min(cursorAt, lastDay);
  const onCursorDay = useCallback((d: number) => setCursorDay(d), []);
  const [jumpTo, setJumpTo] = useState<{ day: number; n: number } | null>(null);
  // The rounds view: the lines that read stored rounds, and the cursor's moment.
  const roundLines = useMemo(
    () =>
      prices
        .filter((p) => p.rounds)
        .map((p) => ({ id: byKey.get(p.key)!.id, name: p.name ?? p.key, rounds: p.rounds! })),
    [prices, byKey],
  );
  const joinDay = roundLines.length ? Math.min(...roundLines.map((l) => l.rounds.joinDay)) : null;
  const [view, setView] = useState<"days" | "rounds">("days");
  const [cursorTs, setCursorTs] = useState<number | null>(null);
  const onRounds = view === "rounds" && roundLines.length > 0 && spreads != null;
  const onJump = useCallback(
    (day: number, ts?: number) => {
      if (ts != null && view === "rounds") setCursorTs(ts);
      else setJumpTo((j) => ({ day, n: (j?.n ?? 0) + 1 }));
    },
    [view],
  );
  const asOfTs = roundLines.length ? Math.max(...roundLines.map((l) => l.rounds.asOf.ts)) : null;
  const valueAt = useCallback(
    (lineId: string) => {
      const m = spreads?.main.id ? roundLines.find((l) => l.id === spreads.main.id) : undefined;
      const o = roundLines.find((l) => l.id === lineId);
      const t = cursorTs ?? asOfTs;
      if (!m || !o || t == null) return null;
      const a = inForce(m.rounds.points, t);
      const b = inForce(o.rounds.points, t);
      return a != null && b != null && a > 0 ? b / a - 1 : null;
    },
    [spreads, roundLines, cursorTs, asOfTs],
  );

  return (
    <section className="mt-8" data-asset-chain={section.chain} data-anatomy="A2">
      <h2 className="mb-3 text-lg font-semibold text-foreground">{section.name}</h2>
      <div className="rounded-lg border border-rb-200 p-3 dark:border-rb-700" data-asset-chart="" data-anatomy="A3">
        {roundLines.length > 0 && spreads && (
          <div
            className="mb-2 flex gap-1 text-xs"
            role="group"
            aria-label="What the chart draws"
            data-asset-view={view}
            data-anatomy="A3.2"
          >
            {(
              [
                ["days", "Every day"],
                ["rounds", `Stored rounds, from ${dayDate(joinDay!)}`],
              ] as const
            ).map(([v, word]) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`rounded px-2 py-0.5 ${view === v ? "bg-[var(--surface-sunken)] font-semibold text-foreground" : "text-rb-500 hover:text-foreground"}`}
                data-asset-view-button={v}
              >
                {word}
              </button>
            ))}
          </div>
        )}
        {onRounds ? (
          <FlowUnitContext.Provider value={null}>
            <AssetRoundsChart
              lines={roundLines}
              mainId={spreads!.main.id}
              chain={section.chain}
              cursorTs={cursorTs}
              onCursorTs={setCursorTs}
            />
            <AssetSpreadStrip
              main={spreads!.main}
              others={spreads!.others}
              cursorDay={null}
              cursorTs={cursorTs ?? asOfTs}
              valueAt={valueAt}
              onJump={onJump}
            />
          </FlowUnitContext.Provider>
        ) : axis && prices.length > 0 ? (
          <FlowUnitContext.Provider value={null}>
            <CombinedFlows
              model={axis.model}
              bars={axis.model}
              from={0}
              busy={false}
              series={axis.series}
              prices={prices}
              failed={false}
              priceOnly
              allLines
              priceHelp={help}
              onCursorDay={onCursorDay}
              jumpTo={jumpTo}
              renderBars={() => null}
            />
            {spreads && (
              <AssetSpreadStrip main={spreads.main} others={spreads.others} cursorDay={cursorDay} onJump={onJump} />
            )}
            {joinDay != null && (
              <p className="mt-2 text-xs text-rb-500" data-asset-join={joinDay}>
                {joinText(roundLines, prices.length, joinDay)}
              </p>
            )}
          </FlowUnitContext.Provider>
        ) : (
          <p className="py-6 text-center text-sm text-rb-500" data-asset-chart-state={failed ? "failed" : "loading"}>
            {failed ? "The daily prices were not read." : "Reading the daily prices…"}
          </p>
        )}
      </div>
      <ul className="mt-4 space-y-3" data-asset-lines="" data-anatomy="A4">
        {section.lines.map((l) => (
          <LineRow
            key={l.id}
            line={l}
            chain={section.chain}
            symbol={symbol}
            last={l.drawn ? lastOf(l.drawn.key) : null}
            rounds={l.drawn ? prices.find((p) => p.key === l.drawn!.key)?.rounds : undefined}
            main={spreads?.main.id === l.id}
          />
        ))}
      </ul>
      {section.readAt && (
        <p className="mt-3 text-xs text-rb-500" data-asset-read-at="">
          Oracles as read at block {section.readAt.block.toLocaleString("en-US")} (
          {formatDate(new Date(`${section.readAt.date}T00:00:00Z`))}); an earlier day carries the oracle of its day.
        </p>
      )}
    </section>
  );
}

function LineRow({
  line,
  chain,
  symbol,
  last,
  main,
  rounds,
}: {
  line: PageLine;
  chain: number;
  symbol: string;
  last: [number, number, number | null, number?] | null;
  main: boolean;
  rounds?: PriceRounds;
}) {
  const href = (a: string) => explorerUrl(chain as ChainId, "address", a);
  return (
    <li className="rounded-md bg-[var(--surface-sunken)] px-3 py-2 text-sm" data-asset-line={line.id}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-semibold text-foreground">
          {line.oracle.name}{" "}
          <a
            href={href(line.oracle.address)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs font-normal text-rb-500 hover:underline"
          >
            {shortAddress(line.oracle.address)}
          </a>
          {main && (
            <span className="ml-2 text-xs font-normal text-rb-500" data-asset-main-line="">
              main line
            </span>
          )}
        </span>
        {rounds ? (
          <span
            className="text-xs text-rb-500 tabular-nums"
            data-asset-as-of={last?.[0] ?? ""}
            data-asset-rounds-from={rounds.from.block}
          >
            As of {roundTime(rounds.asOf.ts)}, block {rounds.asOf.block.toLocaleString("en-US")}: stored rounds from{" "}
            {roundTime(rounds.from.ts)} (block {rounds.from.block.toLocaleString("en-US")}), the daily store before
          </span>
        ) : last ? (
          <span className="text-xs text-rb-500 tabular-nums" data-asset-as-of={last[0]}>
            As of {dayDate(last[0])}
            {last[2] != null ? `, block ${last[2].toLocaleString("en-US")}` : ""}
          </span>
        ) : (
          <span className="text-xs text-rb-500" data-asset-as-of="">
            No stored series
          </span>
        )}
      </div>
      <ul className="mt-1 space-y-0.5 text-xs text-rb-500">
        {line.series.map((s) => (
          <li key={s.key} data-asset-series={s.key}>
            <span className="text-foreground">{s.protocol}</span>
            {s.token.symbol !== symbol || line.series.some((x) => x.token.symbol !== s.token.symbol)
              ? ` prices ${s.token.symbol}`
              : ""}
            {s.via ? `, through ${s.via.name} ${shortAddress(s.via.address)}` : ""}
            {s.retired ? ", an ilk Maker has retired" : ""}
            {s.firstDay != null ? `, from ${dayDate(s.firstDay)}` : ", nothing stored"}
            {line.drawn?.key === s.key && line.series.length > 1 ? " (drawn)" : ""}
          </li>
        ))}
      </ul>
    </li>
  );
}
