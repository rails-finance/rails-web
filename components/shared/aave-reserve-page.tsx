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
//   M3.5 parameters, the list M1's Details panel draws (ReserveParameters).
// Every figure carries its receipt from lib/shared/aave-market-provenance.

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

function ReserveBody({ r, vocab, chainId }: { r: MarketReserveRow; vocab: AaveMarketVocab; chainId: ChainId }) {
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

      <section className="mb-8" data-anatomy="M3.5">
        <h2 className={SECTION}>Parameters</h2>
        <div className="max-w-xl rounded-lg bg-raised p-4">
          <ReserveParameters r={r} vocab={vocab} price={z.price} chainId={chainId} />
        </div>
      </section>
    </>
  );
}

export function AaveReservePage({ marketKey, asset }: { marketKey: AaveMarketKey; asset: string }) {
  const m = aaveMarketConfig(marketKey);
  const read = useAaveMarket(m);
  const { data, loading, error, view, readBy } = read;
  const registry = useReceiptRegistry();
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
      <ReserveBody r={r} vocab={vocab} chainId={m.chainId} />
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
