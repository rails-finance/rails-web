"use client";

// A Pendle market's router events, newest first, as a section of the market's
// page (R2) with its own receipts scope and ⋮ (Download CSV of the loaded
// rows, Inspect provenance), on the timeline's furniture:
// the toolbar strip (L1) with the count (L1.2) and the types-of-event filter
// (L1.3, the shared FilterDropdown), the rows on the spine as event cards (T1,
// L3), and "Show 50 more" (L9). Each row names its wallet (the receiver; on a
// limit fill, the maker) and links to that wallet's position on this market.
//
// THE FILTER is in the URL (`?kind=pt,yt,liquidity,mint,limit`, only off the
// default of every kind) and narrows the rows loaded. "Show 50 more" reads the
// page after the cursor the last page named (/api/pendle/market/<market>/events
// ?before=block-txIndex-logIndex).

import { useCallback, useMemo, useState } from "react";
import { FilterDropdown } from "@/components/shared/filter-dropdown";
import { SpineTipContext } from "@/components/shared/spine-column";
import { EventDateContext } from "@/components/shared/event-time";
import { Prov } from "@/components/shared/provenance";
import { ProvSection, SectionHeading } from "@/components/shared/section-menu";
import { ToolsFor } from "@/components/shared/product/product-head";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { CARD_INSET_START } from "@/lib/shared/ui-grammar";
import { notifyUrlChanged, useUrlSearchParams } from "@/lib/shared/use-url-search-params";
import { PendleEventCard } from "@/components/protocol/pendle/pendle-event-card";
import { marketEventsProv } from "@/lib/pendle/provenance";
import type { PendleEventKind, PendleMarketEvent, PendleMarketPage, PendleTokenMeta } from "@/lib/pendle/types";

const n = (v: number) => v.toLocaleString("en-US");
const utcDay = (ts: number) => Math.floor(ts / 86_400);
const datePrefix = (ts: number, aboveTs: number | null): string | null =>
  aboveTs != null && utcDay(aboveTs) === utcDay(ts) ? null : `${shortDate(ts)} ${shortDateYear(ts)}`;

type Group = "pt" | "yt" | "liquidity" | "mint" | "limit";
const GROUPS: { key: Group; label: string }[] = [
  { key: "pt", label: "PT trades" },
  { key: "yt", label: "YT trades" },
  { key: "liquidity", label: "Liquidity" },
  { key: "mint", label: "Mint and redeem" },
  { key: "limit", label: "Limit fills" },
];
const GROUP_OF: Record<PendleEventKind, Group> = {
  "buy-pt": "pt",
  "sell-pt": "pt",
  "buy-yt": "yt",
  "sell-yt": "yt",
  "swap-pt-yt": "yt",
  "add-liquidity": "liquidity",
  "remove-liquidity": "liquidity",
  exit: "liquidity",
  "mint-py": "mint",
  "redeem-py": "mint",
  "mint-sy": "mint",
  "redeem-sy": "mint",
  "limit-fill": "limit",
};

const keyOf = (r: PendleMarketEvent) => `${r.txHash}-${r.logIndex}`;

/** The loaded rows as CSV: one row per leg, raw amounts. */
function eventsCsv(rows: PendleMarketEvent[]): string {
  const head = "block,timestamp,tx_hash,log_index,router,event,kind,caller,receiver,leg,token,amount_raw";
  const lines = rows.flatMap((r) =>
    (r.legs.length ? r.legs : [null]).map((l) =>
      [
        r.block,
        new Date(r.timestamp * 1000).toISOString(),
        r.txHash,
        r.logIndex,
        r.router,
        r.event,
        r.kind,
        r.caller ?? "",
        r.receiver ?? "",
        l?.leg ?? "",
        l?.token ?? "",
        l?.amount ?? "",
      ].join(","),
    ),
  );
  return [head, ...lines].join("\n");
}

export function PendleMarketEvents({
  m,
  initialMeta,
  initialSearch,
}: {
  m: PendleMarketPage;
  initialMeta: Record<string, PendleTokenMeta>;
  initialSearch: string;
}) {
  const [rows, setRows] = useState<PendleMarketEvent[]>(m.recent);
  const [meta, setMeta] = useState(initialMeta);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [next, setNext] = useState<string | null>(m.next);
  const total = m.router?.events ?? rows.length;

  const sp = useUrlSearchParams(initialSearch);
  const shown = useMemo(() => {
    const raw = sp.get("kind");
    if (raw == null) return new Set<Group>(GROUPS.map((g) => g.key));
    return new Set(raw.split(",").filter((k): k is Group => GROUPS.some((g) => g.key === k)));
  }, [sp]);
  const writeShown = useCallback((next: Set<Group>) => {
    const p = new URLSearchParams(window.location.search);
    if (next.size === GROUPS.length) p.delete("kind");
    else
      p.set(
        "kind",
        GROUPS.filter((g) => next.has(g.key))
          .map((g) => g.key)
          .join(","),
      );
    const qs = p.toString().replace(/%2C/gi, ",");
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    notifyUrlChanged();
  }, []);

  const counts = new Map<Group, number>();
  for (const r of rows) counts.set(GROUP_OF[r.kind], (counts.get(GROUP_OF[r.kind]) ?? 0) + 1);
  const visible = rows.filter((r) => shown.has(GROUP_OF[r.kind]));
  const filtered = shown.size < GROUPS.length;
  const more = next != null;

  const loadMore = async () => {
    if (!next) return;
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/pendle/market/${m.tokens.market.address}/events?before=${next}`);
      const body = (await res.json()) as {
        success: boolean;
        recent: PendleMarketEvent[];
        next: string | null;
        meta: Record<string, PendleTokenMeta>;
      };
      if (!res.ok || !body.success) throw new Error(String(res.status));
      setMeta((prev) => ({ ...prev, ...body.meta }));
      setRows((prev) => [...prev, ...body.recent]);
      setNext(body.next);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const countLine = filtered
    ? `${n(visible.length)} of ${n(rows.length)} listed · ${n(total)} events`
    : more
      ? `Showing ${n(rows.length)} of ${n(total)} events`
      : `${n(total)} ${total === 1 ? "event" : "events"}`;

  return (
    <ProvSection scope="market-events" className="mb-8 space-y-4" data-anatomy="P3" data-pendle-market-events="">
      <div className="space-y-3" data-anatomy="L1">
        <SectionHeading
          title={<span data-anatomy="L1.1">Router events</span>}
          menu={
            <ToolsFor
              scope="market-events"
              title="Router events"
              tools={{
                exports: {
                  csv: {
                    filename: `pendle-${m.tokens.market.address}-events.csv`,
                    build: () => eventsCsv(rows),
                    subtitle: "The events loaded so far, one row per leg",
                  },
                },
              }}
            />
          }
        />
        <div className="flex w-full flex-wrap items-center gap-2 sm:justify-end">
          <span
            className="basis-full whitespace-nowrap text-xs tabular-nums text-rb-500 sm:basis-auto"
            data-anatomy="L1.2"
            data-pendle-count=""
          >
            <Prov info={marketEventsProv(total)} value={String(total)}>
              {countLine}
            </Prov>
          </span>
          <span data-prov-exempt="the filter's count of selected types">
            <FilterDropdown
              label="Types of event"
              anatomy="L1.3"
              options={GROUPS.map((g) => ({ key: g.key, label: g.label, count: counts.get(g.key) ?? 0 }))}
              selected={new Set<string>(shown)}
              onSelect={() => writeShown(new Set(GROUPS.map((g) => g.key)))}
              onToggle={(k) => {
                const next = new Set(shown);
                if (next.has(k as Group)) next.delete(k as Group);
                else next.add(k as Group);
                writeShown(next);
              }}
              multi
              variant="button"
              align="right"
              verbatimLabels
              sheetStatus={countLine}
            />
          </span>
        </div>
      </div>
      <div data-pendle-market-rows="">
        {visible.map((r, i) => (
          <EventDateContext.Provider
            key={keyOf(r)}
            value={datePrefix(r.timestamp, i > 0 ? visible[i - 1].timestamp : null)}
          >
            <SpineTipContext.Provider value={i === 0 && !filtered ? "above" : null}>
              <div
                id={`event-${keyOf(r)}`}
                data-event-id={keyOf(r)}
                data-row-at={r.timestamp}
                data-pendle-kind={GROUP_OF[r.kind]}
              >
                <PendleEventCard
                  row={{ ...r, role: "both", syToAsset: null, asset: null, impliedApy: null, partial: false }}
                  tokens={m.tokens}
                  meta={meta}
                  side="market"
                  isLast={i === visible.length - 1 && !more}
                  parties={{ caller: r.caller, receiver: r.receiver }}
                />
              </div>
            </SpineTipContext.Provider>
          </EventDateContext.Provider>
        ))}
        {visible.length === 0 && (
          <p className={`py-6 text-sm text-rb-500 ${CARD_INSET_START}`}>
            {rows.length === 0 ? "No router event names this market." : "No loaded event is of the chosen types."}
          </p>
        )}
      </div>
      {failed && <p className="text-sm text-rb-500">The next events could not be read just now.</p>}
      {more && (
        <div className="flex flex-col items-center gap-1.5 pt-1" data-anatomy="L9">
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loading}
            className="rounded-md border border-teal-600/40 px-3 py-1.5 text-xs font-medium text-teal-600 hover:bg-teal-600/10 disabled:opacity-50 dark:border-teal-400/40 dark:text-teal-400 dark:hover:bg-teal-400/10"
            data-pendle-more=""
          >
            {loading ? "Reading…" : `Show ${n(Math.min(50, total - rows.length))} more`}
          </button>
        </div>
      )}
    </ProvSection>
  );
}
