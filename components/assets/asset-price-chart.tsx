"use client";

// One chain's section of an asset page (rails-ops reference/asset-key-map.md):
// the price chart, drawing the main line alone (the most read; with `via`,
// the line the protocol reads) under its caption (`priceCaption`), the other
// protocols reading the token under it (`readerEntries`; Miles, 24 Nov 2026),
// then the lines listed: each oracle named, the protocols that read it with
// their series, the span stored and its "as of" stamp (decision 0054, ruling 2).
// A line is the daily store's series (`/api/prices/daily`), a point per
// completed UTC day, continued from its stored rounds' first day by the
// rounds' day closes where the chain serves them (`/api/prices/rounds`,
// `joinRounds`), drawn on Lightweight Charts (`AssetLwChart`). The join is
// stated in the chart's source line and each line's stamp. With `via` (the
// page read from a protocol's side, lib/shared/asset-via.ts) the section's
// first line is the one that protocol reads, named so over the chart and in
// the list.

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AssetLwChart } from "@/components/assets/asset-lw-chart";
import { roundTime } from "@/components/assets/round-time";
import { fetchPriceRounds, type RoundsAnswer } from "@/lib/api/fetch-price-rounds";
import { fetchDailyAnswer, type DailyAnswer } from "@/lib/api/fetch-daily-prices";
import { dailyStorePriceSeries, joinRounds, roundsOf, type PriceRounds } from "@/lib/shared/price-series";
import type { FlowPriceSeries } from "@/lib/shared/flows-price";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import { formatDate } from "@/lib/date";
import { assetLwChartContent } from "@/lib/shared/learn-more-content";
import { endAtLastPoke, lineName, shortAddress, type PageChain, type PageLine } from "@/lib/shared/asset-roster";
import { usesWords, type ViaView } from "@/lib/shared/asset-via";
import { joinText, priceCaption } from "@/lib/shared/asset-captions";
import { readerEntries, readerTail, readerText, type ReaderEntry } from "@/lib/shared/asset-readers";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

const DAY_MS = 86_400_000;
/** The store answers at most 3,000 days a read. */
const MAX_DAYS = 2999;
const dayDate = (day: number) => formatDate(new Date(day * DAY_MS));

export function AssetPriceChart({
  section,
  symbol,
  via = null,
  readerHrefs = {},
}: {
  section: PageChain;
  symbol: string;
  via?: ViaView | null;
  /** Each other explorer's page for the token, by explorer id. */
  readerHrefs?: Record<string, string>;
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
  // The chart draws the main line (the first drawn) alone.
  const main = prices[0] ?? null;
  const mainLine = main ? byKey.get(main.key)! : null;
  const lwLine = useMemo(() => (main && mainLine ? { line: mainLine, series: main } : null), [main, mainLine]);
  const lastOf = (key: string) => prices.find((p) => p.key === key)?.points.at(-1) ?? null;
  const caption = mainLine ? priceCaption(via, mainLine, symbol) : null;
  const readers = useMemo(
    () => readerEntries(section, via, (id) => readerHrefs[id] ?? null),
    [section, via, readerHrefs],
  );

  return (
    <section className="mt-8" data-asset-chain={section.chain} data-anatomy="A2">
      <h2 className="mb-3 text-lg font-semibold text-foreground">{section.name}</h2>
      {caption && (
        <p
          className="-mt-2 mb-3 text-sm text-rb-500"
          data-asset-via={via ? (via.lineId ?? "none") : undefined}
          data-asset-price-caption=""
          data-anatomy="A2.1"
        >
          {caption}
        </p>
      )}
      <div data-asset-chart="lightweight" data-anatomy="A3">
        {lwLine ? (
          <AssetLwChart
            line={lwLine}
            chain={section.chain}
            help={lwHelp}
            joinNote={main?.rounds ? joinText(main.rounds.joinDay) : null}
          />
        ) : (
          <p
            className="rounded-lg border border-rb-200 py-6 text-center text-sm text-rb-500 dark:border-rb-700"
            data-asset-chart-state={failed ? "failed" : "loading"}
          >
            {failed ? "The daily prices were not read." : "Reading the daily prices…"}
          </p>
        )}
      </div>
      {readers.length > 0 && <Readers entries={readers} symbol={symbol} />}
      <ul className="mt-4 space-y-3" data-asset-lines="" data-anatomy="A4">
        {section.lines.map((l) => (
          <LineRow
            key={l.id}
            line={l}
            chain={section.chain}
            symbol={symbol}
            last={l.drawn ? lastOf(l.drawn.key) : null}
            rounds={l.drawn ? prices.find((p) => p.key === l.drawn!.key)?.rounds : undefined}
            main={mainLine?.id === l.id}
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

/** The other protocols reading the token here (anatomy A2.2), one entry per line. */
function Readers({ entries, symbol }: { entries: ReaderEntry[]; symbol: string }) {
  return (
    <section className="mt-5" data-asset-readers="" data-anatomy="A2.2">
      <h3 className="mb-2 text-sm font-semibold text-foreground">Other protocols reading {symbol}</h3>
      <ul className="space-y-1 text-sm text-foreground">
        {entries.map((e) => (
          <li key={e.id} data-asset-reader={e.id} data-asset-same-feed={e.sameAs ?? undefined} title={readerText(e)}>
            {e.protocols.map((p, i) => (
              <Fragment key={p.name}>
                {i === 0 ? "" : i === e.protocols.length - 1 ? " and " : ", "}
                {p.href ? (
                  <Link href={p.href} className={INLINE_LINK} data-asset-reader-link={p.explorer ?? ""}>
                    {p.name}
                  </Link>
                ) : (
                  p.name
                )}
              </Fragment>
            ))}{" "}
            {readerTail(e)}
          </li>
        ))}
      </ul>
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
            rel="noopener"
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
