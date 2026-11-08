"use client";

// A reserve page (anatomy M3, ui-jobs 541): one asset in one Aave-family
// market, at `<market page>/<asset>` (lib/shared/aave-market-configs.ts
// reserveHref). It reads the same market overview as the market page (M1) and
// draws one reserve from it:
//   M3.1 heading: the asset's mark, symbol and state tags, the market it sits
//        in (a link back to the market page) and the back control;
//   M3.2 vitals: Supplied · Borrowed · Available · Supply rate · Borrow rate ·
//        Utilisation. Available is the Pool's virtual balance on a v3.3+ Pool
//        (else supplied − borrowed). Under it, a deficit of at least
//        DEFICIT_SHOWN_SHARE of the supplied amount, and the remaining borrow
//        capacity (cap less borrowed) where the supply side is closed (GHO on
//        Core; lib/shared/aave-market-view.ts borrowRoomShows);
//   M3.3 rate curve (components/shared/aave-reserve-curve.tsx);
//   M3.4 history, day-close rates and utilisation over time, with the
//        configurator's changes marked (components/shared/aave-reserve-history.tsx);
//   M3.5 parameters, the list M1's Details panel draws (ReserveParameters);
//   M3.6 the change log, M3.7 and M3.8 the largest suppliers and borrowers
//        (components/shared/aave-reserve-tables.tsx).
// M3.4 and M3.6 to M3.8 read rails-server's indexed routes
// (lib/api/fetch-aave-reserve-reads.ts), started with the page and apart from
// the head read; a read that fails leaves its section one muted line. Every
// figure carries its receipt from lib/shared/aave-market-provenance or
// lib/shared/aave-reserve-reads-provenance.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { RailHeader } from "@/components/shared/rail-header";
import { DetailBackButton } from "@/components/shared/detail-back-row";
import { VitalsBand } from "@/components/shared/vitals-band";
import { SkeletonBlock } from "@/components/shared/skeleton-card";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { PriceStrip } from "@/components/shared/price-strip";
import { ProvInspectorLayer, ProvInspectorToggle } from "@/components/shared/prov-inspector";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { marketModal, MarketStamp, useAaveMarket } from "@/components/shared/aave-market-page";
import { ReserveParameters, reserveFigures, StateTags } from "@/components/shared/aave-market-views";
import { ReserveRateCurve } from "@/components/shared/aave-reserve-curve";
import { ReserveHistoryChart, type HistoryRange } from "@/components/shared/aave-reserve-history";
import { ReserveChangeLog, ReserveHoldersTable } from "@/components/shared/aave-reserve-tables";
import { historyFrom, useReserveReads, type Read, type ReserveHistory } from "@/lib/api/fetch-aave-reserve-reads";
import { heldLine, reserveChanges } from "@/lib/shared/aave-reserve-config-words";
import { formatDate } from "@/lib/date";
import { chainMeta } from "@/lib/shared/chains";
import { aaveMarketVocab } from "@/lib/shared/aave-market-provenance";
import { aaveMarketConfig, type AaveMarketKey } from "@/lib/shared/aave-market-configs";
import { protocolForHref } from "@/lib/shared/protocols";
import { fmtUsd } from "@/lib/aave-v4/format";
import { formatCompact } from "@/lib/shared/format-compact";
import { borrowRoomShows, deficitShows, type MarketReserveRow } from "@/lib/shared/aave-market-view";
import type { AaveMarketVocab } from "@/lib/shared/aave-market-provenance";
import type { ChainId } from "@/lib/shared/chains";

const SECTION = "mb-3 text-[11px] uppercase tracking-wider text-rb-500";

/** Available, with the lines that qualify it under it: an outstanding deficit
 *  of at least DEFICIT_SHOWN_SHARE of the supplied amount, and the remaining
 *  borrow capacity where the supply side is closed (borrowRoomShows). */
function AvailableVital({
  r,
  vocab,
  available,
}: {
  r: MarketReserveRow;
  vocab: AaveMarketVocab;
  available: React.ReactNode;
}) {
  const usd = (tokens: number) =>
    r.priceUsd != null ? fmtUsd(tokens * r.priceUsd).display : `${formatCompact(tokens)} ${r.symbol}`;
  const c = r.borrowCapState;
  return (
    <>
      {available}
      {deficitShows(r) && (
        <span className="block text-[11px] font-normal text-rb-500" data-reserve-deficit="">
          deficit <Prov info={vocab.reserveDeficitProv(r.symbol, r.priceUsd != null)}>{usd(r.deficit ?? 0)}</Prov>
        </span>
      )}
      {borrowRoomShows(r) && c.state === "used" && (
        <span className="block text-[11px] font-normal text-rb-500" data-reserve-capacity="">
          borrow capacity{" "}
          <Prov info={vocab.reserveBorrowRoomProv(r.symbol, c.cap)}>{usd(Math.max(0, c.cap - r.borrowed))}</Prov>
        </span>
      )}
    </>
  );
}

const NOTE = "text-[13px] text-rb-500";

/** Where the reserve factor history starts: "the 1 Nov 2026 restart", or its block. */
function restartWords(h: ReserveHistory): string {
  const at = h.points.find((p) => p.closeBlock >= h.reserveFactor.heldFrom);
  return at ? `the ${formatDate(at.date)} restart` : `block ${h.reserveFactor.heldFrom.toLocaleString("en-US")}`;
}

/** One line per reason the loaded days have no utilisation (the route's `why`). */
function gapLines(h: ReserveHistory, label: string, symbol: string): string[] {
  const pts = h.points;
  const out: string[] = [];
  const count = (why: string) => pts.filter((p) => p.why === why).length;
  const days = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "day has" : "days have"}`;
  const before = pts.map((p, i) => [p, i] as const).filter(([p]) => p.why === "rf-before-held");
  if (before.length) {
    const next = pts[before[before.length - 1][1] + 1];
    const restart = next && next.closeBlock >= h.reserveFactor.heldFrom;
    out.push(
      next
        ? `Utilisation before ${formatDate(next.date)} isn't held for ${label} yet: ${restart ? `the reserve factor history starts at ${restartWords(h)}` : "the reserve factor isn't held for those days"}.`
        : `Utilisation isn't held for ${label} yet: the reserve factor history starts at ${restartWords(h)}, and no ${symbol} change has come since.`,
    );
  }
  if (count("gho")) out.push("GHO has no supply side, so its utilisation isn't drawn.");
  const stable = pts.find((p) => p.why === "stable-debt");
  if (stable)
    out.push(
      `Utilisation from ${formatDate(stable.date)} isn't drawn: stable debt may be outstanding, and the rate identity holds only without it.`,
    );
  const zero = count("borrow-rate-zero");
  if (zero) out.push(`${days(zero)} no utilisation: the borrow rate was 0.`);
  const moved = count("rf-changed-between-snapshots");
  if (moved) out.push(`${days(moved)} no utilisation: the reserve factor changed between the stored snapshots.`);
  const full = count("reserve-factor-full");
  if (full) out.push(`${days(full)} no utilisation: the reserve factor was 100%.`);
  return out;
}

/** What the page's indexed reads hand the body. */
interface IndexedReads {
  reads: ReturnType<typeof useReserveReads>;
  /** The last history that arrived, kept while a longer span loads. */
  history: ReserveHistory | null;
  range: HistoryRange;
  onRange: (r: HistoryRange) => void;
}

function Section({ anatomy, title, children }: { anatomy: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8" data-anatomy={anatomy}>
      <h2 className={SECTION}>{title}</h2>
      {children}
    </section>
  );
}

function ReserveIndexed({
  r,
  chainId,
  marketLabel,
  marketKey,
  x,
  parameters,
}: {
  r: MarketReserveRow;
  chainId: ChainId;
  marketLabel: string;
  marketKey: string;
  x: IndexedReads;
  /** M3.5, drawn between the history and the change log. */
  parameters: React.ReactNode;
}) {
  const { history: hr, changes: cr, holders: hd } = x.reads;
  const chain = chainMeta(chainId).name;
  const changes = useMemo(() => (cr.state === "ok" ? reserveChanges(cr.data, r.symbol) : null), [cr, r.symbol]);
  const h = x.history;
  const dateOf = (block: number) => {
    const p = h?.points.find((q) => q.closeBlock >= block);
    return p && p.date !== h?.points[0]?.date ? formatDate(p.date) : null;
  };
  const unindexed = (q: Read<unknown>) => q.state === "not-held" && q.status === "not-indexed";
  if (unindexed(hr) && unindexed(cr) && unindexed(hd))
    return (
      <Section anatomy="M3.4 M3.6 M3.7 M3.8" title="History, changes and holders">
        <p className={NOTE} data-reserve-not-indexed="">
          Not indexed yet on {chain}.
        </p>
      </Section>
    );
  const missing = (q: Read<unknown>, what: string, height: number) =>
    q.state === "loading" ? (
      <SkeletonBlock height={height} />
    ) : q.state === "not-held" ? (
      <p className={NOTE} data-reserve-not-held={q.status}>
        {q.status === "not-ranked" ? "Not ranked yet" : "Not indexed yet"} on {chain}.
      </p>
    ) : (
      <p className={NOTE} data-reserve-read-failed="">
        Couldn&apos;t read the {what}. Reload to retry.
      </p>
    );
  const gaps = h ? gapLines(h, marketLabel, r.symbol) : [];

  return (
    <>
      <Section anatomy="M3.4" title="History">
        {h && (hr.state === "ok" || hr.state === "loading") ? (
          <div className="rounded-lg bg-raised p-4">
            <ReserveHistoryChart
              h={h}
              symbol={r.symbol}
              changes={changes}
              range={x.range}
              onRange={x.onRange}
              loadingAll={hr.state === "loading"}
            />
            {gaps.map((g) => (
              <p key={g} className="mt-2 text-[12px] text-rb-500" data-history-gap-note="">
                {g}
              </p>
            ))}
          </div>
        ) : hr.state === "ok" ? (
          <p className={NOTE}>No rate history held for this reserve.</p>
        ) : (
          missing(hr, "reserve's history", 360)
        )}
      </Section>
      {parameters}
      <Section anatomy="M3.6" title="Configuration changes">
        {cr.state === "ok" && changes ? (
          <ReserveChangeLog
            changes={changes}
            chainId={chainId}
            held={heldLine(cr.data, dateOf)}
            automatorNote={marketKey === "spark"}
          />
        ) : (
          missing(cr, "configuration changes", 240)
        )}
      </Section>
      {hd.state === "ok" ? (
        <>
          <Section anatomy="M3.7" title="Largest suppliers">
            <ReserveHoldersTable
              side="suppliers"
              h={hd.data}
              symbol={r.symbol}
              address={r.address}
              decimals={r.decimals}
            />
          </Section>
          <Section anatomy="M3.8" title="Largest borrowers">
            <ReserveHoldersTable
              side="borrowers"
              h={hd.data}
              symbol={r.symbol}
              address={r.address}
              decimals={r.decimals}
            />
          </Section>
        </>
      ) : (
        <Section anatomy="M3.7 M3.8" title="Largest suppliers and borrowers">
          {missing(hd, "largest suppliers and borrowers", 240)}
        </Section>
      )}
    </>
  );
}

function ReserveBody({
  r,
  vocab,
  chainId,
  marketLabel,
  marketKey,
  x,
}: {
  r: MarketReserveRow;
  vocab: AaveMarketVocab;
  chainId: ChainId;
  marketLabel: string;
  marketKey: string;
  x: IndexedReads;
}) {
  const z = reserveFigures({ r, vocab });
  const u = r.utilization != null && r.supplied > 0 ? r.utilization : null;
  return (
    <>
      <div data-anatomy="M3.2" data-reserve-vitals="">
        <VitalsBand
          className="mb-8"
          vitals={[
            { slot: "sizeIn", label: "Supplied", value: <span data-vital="supplied">{z.supplied}</span> },
            {
              slot: "sizeOut",
              label: "Borrowed",
              value: <span data-vital="borrowed">{z.borrowed ?? <span className="text-rb-500">none</span>}</span>,
            },
            {
              slot: "sizeFree",
              label: "Available",
              value: (
                <span data-vital="available">
                  <AvailableVital r={r} vocab={vocab} available={z.available} />
                </span>
              ),
            },
            { slot: "rateIn", label: "Supply rate", value: <span data-vital="supply-rate">{z.supplyRate}</span> },
            { slot: "rateOut", label: "Borrow rate", value: <span data-vital="borrow-rate">{z.borrowRate}</span> },
            {
              slot: "usage",
              label: "Utilisation",
              title: "Borrowed ÷ supplied, both traced on this page.",
              value: (
                <span data-prov-exempt="" data-vital="utilisation">
                  {u != null ? `${Math.round(u * 100)}%` : "—"}
                </span>
              ),
            },
          ]}
        />
      </div>

      <section className="mb-8" data-anatomy="M3.3">
        <h2 className={SECTION}>Rate curve</h2>
        <div className="rounded-lg bg-raised p-4">
          <ReserveRateCurve r={r} vocab={vocab} />
        </div>
      </section>

      <ReserveIndexed
        r={r}
        chainId={chainId}
        marketLabel={marketLabel}
        marketKey={marketKey}
        x={x}
        parameters={
          <section className="mb-8" data-anatomy="M3.5">
            <h2 className={SECTION}>Parameters</h2>
            <div className="max-w-xl rounded-lg bg-raised p-4">
              <ReserveParameters r={r} vocab={vocab} price={z.price} chainId={chainId} />
            </div>
          </section>
        }
      />
    </>
  );
}

export function AaveReservePage({ marketKey, asset }: { marketKey: AaveMarketKey; asset: string }) {
  const m = aaveMarketConfig(marketKey);
  const read = useAaveMarket(m);
  const { data, loading, error, view, readBy } = read;
  const registry = useReceiptRegistry();
  const [range, setRange] = useState<HistoryRange>("1Y");
  const from = useMemo(() => historyFrom(range === "All"), [range]);
  const reads = useReserveReads(m.key, asset, from);
  const [history, setHistory] = useState<ReserveHistory | null>(null);
  const hr = reads.history;
  useEffect(() => {
    if (hr.state === "ok") setHistory(hr.data);
  }, [hr]);
  const protocol = protocolForHref(m.listingHref);
  if (!protocol) throw new Error(`aave-reserve-page: no roster entry for ${m.listingHref}`);
  const marketHref = m.reservesHref;
  const r = view?.rows.find((x) => x.address === asset.toLowerCase()) ?? null;
  const vocab = data
    ? aaveMarketVocab(m.key, {
        readBy,
        blockNumber: data.blockNumber,
        pool: data.pool,
        oracle: data.oracle,
        capAutomator: data.capAutomator,
      })
    : null;

  const body =
    loading && !data ? (
      <SkeletonBlock height={480} />
    ) : error || !view || !vocab ? (
      <div className="py-12 text-center text-rb-500">
        <p className="mb-1">Couldn&apos;t read the market from chain.</p>
        <p className="text-sm">{error ?? "The RPC read failed: reload to retry."}</p>
      </div>
    ) : !r ? (
      <div className="py-12 text-center text-rb-500" data-reserve-missing="">
        <p className="mb-1">
          {m.marketLabel} has no reserve for {asset}.
        </p>
        <Link href={marketHref} className="text-[13px] text-blue-600 hover:underline dark:text-[var(--text-link)]">
          All {m.marketLabel} reserves
        </Link>
      </div>
    ) : (
      <ReserveBody
        r={r}
        vocab={vocab}
        chainId={m.chainId}
        marketLabel={m.marketLabel}
        marketKey={m.key}
        x={{ reads, history, range, onRange: setRange }}
      />
    );

  return (
    <ProvReceiptsScope registry={registry}>
      <div className="min-h-screen" data-anatomy="M3" data-reserve-page={asset.toLowerCase()} data-market={m.key}>
        <div className="py-8">
          <header className="mb-6" data-anatomy="M3.1">
            <div className="mb-2.5">
              <RailHeader session={protocol.session} venue="subPage" />
            </div>
            <div className="mb-3">
              <DetailBackButton fallbackHref={marketHref} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {r && <TokenChipIcon symbol={r.symbol} address={r.address} size={28} filterable={false} />}
              <h1 className="text-2xl font-semibold text-foreground" data-reserve-symbol="">
                {r?.symbol ?? "Reserve"}
              </h1>
              {r && vocab && (
                <span className="flex flex-wrap items-center gap-1.5">
                  <StateTags r={r} vocab={vocab} />
                </span>
              )}
              <LearnMore content={marketModal(m)} inline />
            </div>
            <p className="mt-1 text-[13px] text-rb-500">
              A reserve of{" "}
              <Link
                href={marketHref}
                className="text-blue-600 hover:underline dark:text-[var(--text-link)]"
                data-reserve-market-link=""
              >
                {m.marketLabel}
              </Link>
            </p>
            <MarketStamp read={read} m={m} />
          </header>
          {body}
        </div>
      </div>
      <PriceStrip assets={[]} leading={<ProvInspectorToggle />} />
      <ProvInspectorLayer />
    </ProvReceiptsScope>
  );
}
