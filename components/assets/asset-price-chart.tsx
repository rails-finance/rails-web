"use client";

// The chart panel of an asset page (rails-ops reference/asset-key-map.md;
// anatomy A3; ui-jobs 818): the page line's price now in the panel's header
// (`ChartHead`) and its history under it, the line alone (with `via`, the
// line the protocol reads). A line is the daily store's series
// (`/api/prices/daily`), a point per completed UTC day, continued from its
// stored rounds' first day by the rounds' day closes where the chain serves
// them (`/api/prices/rounds`, `joinRounds`), drawn on Lightweight Charts
// (`AssetLwChart`). The join is stated under the chart.

import { useEffect, useMemo, useState } from "react";
import { AssetLwChart, ChartHead, type HeadPrice } from "@/components/assets/asset-lw-chart";
import { fetchPriceRounds, type RoundsAnswer } from "@/lib/api/fetch-price-rounds";
import { fetchDailyAnswer, type DailyAnswer } from "@/lib/api/fetch-daily-prices";
import { dailyStorePriceSeries, joinRounds, roundsOf } from "@/lib/shared/price-series";
import type { FlowPriceSeries } from "@/lib/shared/flows-price";
import { assetLwChartContent } from "@/lib/shared/learn-more-content";
import { endAtLastPoke, lineName, type PageLine } from "@/lib/shared/asset-roster";
import { joinText } from "@/lib/shared/asset-captions";

const DAY_MS = 86_400_000;
/** The store answers at most 3,000 days a read. */
const MAX_DAYS = 2999;

export function AssetPriceChart({
  chain,
  line: mainLine,
  symbol,
  head,
}: {
  chain: number;
  /** The page's line: the one its protocol reads, else the most read. */
  line: PageLine;
  symbol: string;
  /** The header's price now: the page's one price-now read, streamed (ui-jobs 829). */
  head: Promise<HeadPrice>;
}) {
  const section = useMemo(() => ({ chain, lines: [mainLine] }), [chain, mainLine]);
  const drawn = useMemo(() => section.lines.filter((l) => l.drawn != null), [section]);
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
        const joined = r ? joinRounds(s, r) : s;
        // A retired Maker ilk ends at its last poke: the store goes on reading the frozen OSM.
        const retired = l.series.length > 0 && l.series.every((x) => x.retired);
        return {
          ...(retired && !r ? { ...joined, points: endAtLastPoke(joined.points) } : joined),
          source: l.oracle.name,
          side: "collateral" as const,
          unitLabel: "USD",
          name: lineName(l),
        };
      });
  }, [answer, rounds, byKey, drawn, symbol, section.chain]);
  const lwHelp = useMemo(() => assetLwChartContent(symbol), [symbol]);
  const main = prices[0] ?? null;
  const lwLine = useMemo(() => (main ? { line: mainLine, series: main } : null), [main, mainLine]);

  return (
    <div data-asset-chart="lightweight" data-anatomy="A3">
      {lwLine ? (
        <AssetLwChart
          line={lwLine}
          chain={chain}
          head={head}
          help={lwHelp}
          joinNote={main?.rounds ? joinText(main.rounds.joinDay) : null}
        />
      ) : (
        <div className="rounded-xl bg-raised p-3 sm:p-4 dark:bg-[var(--surface-sunken)]">
          <ChartHead head={head} />
          <p className="py-6 text-center text-sm text-rb-500" data-asset-chart-state={failed ? "failed" : "loading"}>
            {!mainLine.drawn
              ? "Rails stores no prices for this oracle."
              : failed
                ? "The daily prices were not read."
                : "Reading the daily prices…"}
          </p>
        </div>
      )}
    </div>
  );
}
