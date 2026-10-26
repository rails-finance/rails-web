"use client";

// One chain's section of an asset page (rails-ops reference/asset-key-map.md):
// the price chart 328 built (`CombinedFlows`, the price chart alone) with a
// line per feed, the main one (the most read) in its hue and the others thin
// beneath it, the spread strip under it (each line against the main one at
// the cursor), then the lines listed: each oracle named, the protocols that
// read it with their series, the span stored and its "as of" stamp (decision
// 0054, ruling 2).
// Every line is the daily store's series (`/api/prices/daily`), a point per
// completed UTC day.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AssetSpreadStrip } from "@/components/assets/asset-spread-strip";
import { lineSpreads } from "@/lib/shared/asset-spread";
import { CombinedFlows } from "@/components/shared/lifetime-flows-combined";
import { FlowUnitContext } from "@/components/shared/lifetime-flows-tip";
import { fetchDailyAnswer, type DailyAnswer } from "@/lib/api/fetch-daily-prices";
import { dailyStorePriceSeries } from "@/lib/shared/price-series";
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

export function AssetPriceChart({ section, symbol }: { section: PageChain; symbol: string }) {
  const drawn = section.lines.filter((l) => l.drawn != null);
  const keys = drawn.map((l) => l.drawn!.key);
  const [answer, setAnswer] = useState<DailyAnswer | null>(null);
  const [failed, setFailed] = useState(false);
  const keyList = keys.join(",");
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
        return {
          ...s,
          source: l.oracle.name,
          side: "collateral" as const,
          unitLabel: "USD",
          name: lineName(l),
          tag: shortAddress(l.oracle.address),
        };
      });
  }, [answer, byKey, drawn, symbol, section.chain]);
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
    const others = prices
      .slice(1)
      .map((p) => ({ key: p.key, points: p.points, fixed: byKey.get(p.key)!.oracle.kind === "fixed" }));
    const out = lineSpreads(
      { key: main.key, points: main.points, fixed: mainLine.oracle.kind === "fixed" },
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
  const onJump = useCallback((day: number) => setJumpTo((j) => ({ day, n: (j?.n ?? 0) + 1 })), []);

  return (
    <section className="mt-8" data-asset-chain={section.chain} data-anatomy="A2">
      <h2 className="mb-3 text-lg font-semibold text-foreground">{section.name}</h2>
      <div className="rounded-lg border border-rb-200 p-3 dark:border-rb-700" data-asset-chart="" data-anatomy="A3">
        {axis && prices.length > 0 ? (
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
}: {
  line: PageLine;
  chain: number;
  symbol: string;
  last: [number, number, number | null, number?] | null;
  main: boolean;
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
        {last ? (
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
