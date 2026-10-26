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
// `joinRounds`), drawn on Lightweight Charts (`AssetLwChart`). The join is
// stated in the chart's source line and each line's stamp. With `via` (the
// page read from a protocol's side, lib/shared/asset-via.ts) the section's
// first line is the one that protocol reads, named so over the chart and in
// the list.

import { useEffect, useMemo, useState } from "react";
import { AssetLwChart } from "@/components/assets/asset-lw-chart";
import { roundTime } from "@/components/assets/round-time";
import { lineSpreads } from "@/lib/shared/asset-spread";
import { fetchPriceRounds, type RoundsAnswer } from "@/lib/api/fetch-price-rounds";
import { fetchDailyAnswer, type DailyAnswer } from "@/lib/api/fetch-daily-prices";
import { dailyStorePriceSeries, joinRounds, roundsOf, type PriceRounds } from "@/lib/shared/price-series";
import type { FlowPriceSeries } from "@/lib/shared/flows-price";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import { formatDate } from "@/lib/date";
import { assetLwChartContent } from "@/lib/shared/learn-more-content";
import { lineName, shortAddress, type PageChain, type PageLine } from "@/lib/shared/asset-roster";
import { usesWords, type ViaView } from "@/lib/shared/asset-via";

const DAY_MS = 86_400_000;
/** The store answers at most 3,000 days a read. */
const MAX_DAYS = 2999;
const dayDate = (day: number) => formatDate(new Date(day * DAY_MS));

/** The join under the chart: from which day the lines are their stored rounds. */
function joinText(lines: { rounds: PriceRounds }[], drawn: number, joinDay: number): string {
  const who = lines.length === drawn ? "the lines are" : `${lines.length} of the ${drawn} lines are`;
  const one = lines.every((l) => l.rounds.joinDay === joinDay);
  return one
    ? `From ${dayDate(joinDay)} ${who} their stored oracle rounds, each day at its close; before it, the daily store.`
    : `${who[0].toUpperCase()}${who.slice(1)} their stored oracle rounds from the time each line's stamp names, each day at its close; before it, the daily store.`;
}

export function AssetPriceChart({
  section,
  symbol,
  via = null,
}: {
  section: PageChain;
  symbol: string;
  via?: ViaView | null;
}) {
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
        };
      });
  }, [answer, rounds, byKey, drawn, symbol, section.chain]);
  const lwHelp = useMemo(() => assetLwChartContent(symbol), [symbol]);
  const lwLines = useMemo(() => prices.map((p) => ({ line: byKey.get(p.key)!, series: p })), [prices, byKey]);
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
  // The lines that read stored rounds, for the join in the source line.
  const roundLines = useMemo(
    () =>
      prices
        .filter((p) => p.rounds)
        .map((p) => ({ id: byKey.get(p.key)!.id, name: p.name ?? p.key, rounds: p.rounds! })),
    [prices, byKey],
  );
  const joinDay = roundLines.length ? Math.min(...roundLines.map((l) => l.rounds.joinDay)) : null;

  return (
    <section className="mt-8" data-asset-chain={section.chain} data-anatomy="A2">
      <h2 className="mb-3 text-lg font-semibold text-foreground">{section.name}</h2>
      {via && (
        <p className="-mt-2 mb-3 text-sm text-rb-500" data-asset-via={via.lineId ?? "none"} data-anatomy="A2.1">
          {via.lineId ? (
            <>
              The main line is <span className="text-foreground">{usesWords(via.name)}</span>
              {via.usualId
                ? "; the line most protocols read is thin beneath it."
                : ", and the one most protocols read."}
            </>
          ) : (
            `${via.explorer.label} has no stored price for ${symbol} here; the main line is the one most protocols read.`
          )}
        </p>
      )}
      <div
        className="rounded-lg border border-rb-200 p-3 dark:border-rb-700"
        data-asset-chart="lightweight"
        data-anatomy="A3"
      >
        {prices.length > 0 ? (
          <AssetLwChart
            lines={lwLines}
            chain={section.chain}
            spreads={spreads}
            help={lwHelp}
            joinNote={joinDay != null ? joinText(roundLines, prices.length, joinDay) : null}
          />
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
            uses={via?.lineId === l.id ? usesWords(via.name) : null}
            usual={via?.usualId === l.id}
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
  uses,
  usual,
  rounds,
}: {
  line: PageLine;
  chain: number;
  symbol: string;
  last: [number, number, number | null, number?] | null;
  main: boolean;
  /** Read from a protocol's side: on its line, "the price Aave V3 Core uses". */
  uses?: string | null;
  /** The line most protocols read, where the main line is a protocol's. */
  usual?: boolean;
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
              {uses ? `main line, ${uses}` : "main line"}
            </span>
          )}
          {usual && (
            <span className="ml-2 text-xs font-normal text-rb-500" data-asset-usual-line="">
              most read
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
