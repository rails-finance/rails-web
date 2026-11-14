"use client";

// The status page's Prices view (rails-ops ui-jobs 583, Y5): every dollar
// figure rests on stored prices, so this shows the oracle lane's Chainlink
// feeds and rate updates against their intervals, and the price fillers that
// turn them into stored prices. A filler's raw error can carry hosts and
// addresses, so only its kind is shown.

import type { ReactNode } from "react";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableHeader,
  DataTableRow,
} from "@/components/shared/data-table/data-table";
import { DOT, STATUS_WORDS } from "@/components/status/status-grammar";
import { SieveLink } from "@/components/status/lane-text";
import { formatDate } from "@/lib/date";
import {
  ageWords,
  errorKind,
  fillerState,
  intervalState,
  type Heartbeat,
  type PricesSection,
} from "@/lib/shared/index-progress";

/** The proxies Aave reads that Chainlink's directory does not list. */
const BORROWED = /^aave_v4_|_svr$/;

const RANK: Record<Heartbeat, number> = { stalled: 0, late: 1, paused: 2, none: 3, fresh: 4 };
const n = (x: number) => x.toLocaleString("en-US");

/** No <Prov> figures: the status page states each figure's source beside it
 *  and links the feed's Chainlink page or the protocol's docs. */
const PROV_EXEMPT = "a status page about Rails' pipelines; each row names its source and links it";

function Status({ hb, title }: { hb: Heartbeat; title?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm" title={title} data-anatomy="Y5.3">
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[hb]}`} aria-hidden />
      <span className={hb === "none" ? "text-rb-500" : "text-foreground"}>{STATUS_WORDS[hb]}</span>
    </span>
  );
}

const ago = (t: number | null | undefined, now: number) => (t != null ? `${ageWords(now - t)} ago` : "–");

/** "1 h", "24 h", "23 h": a feed's interval. */
const every = (s: number | null) => (s ? (s % 3600 === 0 ? `${s / 3600} h` : ageWords(s)) : "Not sourced");

function Source({ href, children }: { href: string | null; children: ReactNode }) {
  return href ? (
    <a href={href} target="_blank" rel="noopener" className="link-external text-xs">
      {children}
    </a>
  ) : (
    <span className="text-xs text-rb-500">–</span>
  );
}

interface FeedLine {
  key: string;
  name: string;
  hb: Heartbeat;
  last: number | null;
  everyWords: string;
  source: string | null;
  sourceLabel: string;
  title: string;
}

export function PricesView({ prices, now }: { prices: PricesSection; now: number }) {
  const down = prices.lane.unreachable;
  // Every feed and rate is captured from Ethereum by Rails' oracle Sieve lane;
  // the reference column links where the feed's interval is published.
  const cp = prices.lane.checkpoint;
  const laneTitle = cp
    ? `Rails' oracle Sieve lane reads these events from Ethereum peers; checkpoint ${n(cp.block)}.`
    : "Rails' oracle Sieve lane reads these events from Ethereum peers.";
  const feeds: FeedLine[] = [
    ...prices.feeds.map((f) => {
      const t = f.lastRound?.time ?? null;
      // Proxies Chainlink's directory does not list (the ones Aave reads) carry
      // the figures of the listed feed on the same aggregator.
      const borrowed = BORROWED.test(f.feed);
      const hb = down ? "none" : intervalState(t, f.heartbeatSec, now);
      return {
        key: f.feed,
        name: borrowed ? `${f.pair}, Aave's proxy` : f.pair,
        hb,
        last: t,
        everyWords: `${every(f.heartbeatSec)}${f.deviationPct != null ? `, or a ${f.deviationPct}% move` : ""}`,
        source: f.source,
        sourceLabel: "Chainlink",
        title:
          (f.lastRound
            ? `Newest round at block ${n(f.lastRound.block)}${t != null ? `, ${formatDate(t)}` : ""}.`
            : "No round stored.") +
          (borrowed
            ? " Chainlink's directory does not list this proxy; its interval is the listed feed's on the same aggregator."
            : ""),
      };
    }),
    ...prices.rates.map((r) => {
      const t = r.lastEvent?.time ?? null;
      return {
        key: r.name,
        name: r.label,
        hb: down ? ("none" as const) : intervalState(t, r.expectEverySec, now),
        last: t,
        everyWords: every(r.expectEverySec),
        source: r.source,
        sourceLabel: r.name.startsWith("lido") ? "Lido docs" : "Rocket Pool docs",
        title: r.lastEvent ? `Newest event at block ${n(r.lastEvent.block)}.` : "No event stored.",
      };
    }),
  ].sort((a, b) => RANK[a.hb] - RANK[b.hb] || a.name.localeCompare(b.name, "en-US"));

  const fillers = prices.fillers
    .map((f) => {
      const last = f.lastOkAt ? Date.parse(f.lastOkAt) / 1000 : null;
      return { f, hb: fillerState(f, now), last };
    })
    .sort((a, b) => RANK[a.hb] - RANK[b.hb] || a.f.lane.localeCompare(b.f.lane, "en-US"));

  return (
    <div data-anatomy="Y5">
      <p className="mb-4 max-w-2xl text-sm text-rb-500">
        Every dollar figure on Rails rests on stored prices. Rails reads each Chainlink round and rate update from
        Ethereum peers with <SieveLink />, and the fillers below write them as prices.
      </p>
      {down && (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400">
          The oracle lane did not answer, so no feed can be measured.
        </p>
      )}
      {prices.alarms.length > 0 && (
        <ul className="mb-6 flex flex-col gap-1 text-sm text-amber-700 dark:text-amber-400" data-anatomy="Y5.4">
          {prices.alarms.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      <h2 className="mb-3 text-lg font-semibold tracking-tight text-foreground">Price feeds and rate updates</h2>
      <DataTable label="Price feeds and rate updates" anatomy="Y5.1" stacked tableClassName="sm:table-fixed">
        <DataTableHead>
          <DataTableHeader label="Feed" className="sm:w-[24%]" />
          <DataTableHeader label="Status" className="sm:w-[13%]" />
          <DataTableHeader label="Last update" className="sm:w-[14%]" />
          <DataTableHeader label="Updates at least every" />
          <DataTableHeader label="Read from" className="sm:w-[18%]" />
          <DataTableHeader label="Reference" className="sm:w-[12%]" />
        </DataTableHead>
        <DataTableBody>
          {feeds.map((l) => (
            <DataTableRow key={l.key} data-price-feed={l.key}>
              <DataTableCell rowHeader valign="middle" className="text-[14px] font-semibold text-foreground">
                {l.name}
              </DataTableCell>
              <DataTableCell valign="middle" label="Status">
                <Status hb={l.hb} title={l.title} />
              </DataTableCell>
              <DataTableCell valign="middle" label="Last update" className="text-sm tabular-nums text-rb-500">
                {ago(l.last, now)}
              </DataTableCell>
              <DataTableCell valign="middle" label="Updates at least every" className="text-sm text-rb-500">
                {l.everyWords}
              </DataTableCell>
              <DataTableCell valign="middle" label="Read from" className="text-sm text-rb-500">
                <span title={laneTitle}>
                  <SieveLink />, from Ethereum peers
                </span>
              </DataTableCell>
              <DataTableCell valign="middle" label="Reference">
                <Source href={l.source}>{l.sourceLabel}</Source>
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>

      <h2 className="mb-3 mt-12 text-lg font-semibold tracking-tight text-foreground">Price fillers</h2>
      <DataTable label="Price fillers" anatomy="Y5.2" stacked tableClassName="sm:table-fixed">
        <DataTableHead>
          <DataTableHeader label="Filler" className="sm:w-[28%]" />
          <DataTableHeader label="Status" className="sm:w-[18%]" />
          <DataTableHeader label="Last good run" className="sm:w-[16%]" />
          <DataTableHeader label="Unpriced liquidations" />
          <DataTableHeader label="Last error" className="sm:w-[14%]" />
        </DataTableHead>
        <DataTableBody>
          {fillers.map(({ f, hb, last }) => (
            <DataTableRow key={f.lane} data-price-filler={f.lane}>
              <DataTableCell rowHeader valign="middle" className="text-[14px] font-semibold text-foreground">
                {f.lane}
              </DataTableCell>
              <DataTableCell valign="middle" label="Status">
                <Status
                  hb={hb}
                  title={f.staleAfterMinutes ? `Late past ${f.staleAfterMinutes} min without a good run.` : undefined}
                />
              </DataTableCell>
              <DataTableCell valign="middle" label="Last good run" className="text-sm tabular-nums text-rb-500">
                {ago(last, now)}
              </DataTableCell>
              <DataTableCell valign="middle" label="Unpriced liquidations" className="text-sm tabular-nums text-rb-500">
                {f.unpricedLiq != null ? n(f.unpricedLiq) : "–"}
              </DataTableCell>
              <DataTableCell valign="middle" label="Last error" className="text-sm text-rb-500">
                {errorKind(f.lastError) ?? "–"}
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </div>
  );
}
