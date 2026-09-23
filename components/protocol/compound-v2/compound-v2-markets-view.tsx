"use client";

// Compound V2 protocol view — every listed market and the state of the money in it.
// ----------------------------------------------------------------------------
// The claim: Compound V2's PRESENT is parked money. $106M sits supplied against
// $12.4M borrowed — 11.7% utilisation — in a protocol governance is winding
// down, with 8 of its 20 markets already switched off as collateral. The view
// states that from the protocol's own numbers and nothing else.
//
// That is a claim about HEAD, not about the protocol: six years of history
// hold 3.83M events and the roster's deepest liquidation record, and the
// position explorer beside this view (/compound-v2) replays all of it. The two
// pages state the two axes — this one what the markets hold NOW, that one what
// accounts did across the whole life.
//
// The bar is <RatioBar> on the UTILISATION axis: fill = borrowed ÷ supplied in
// the market's own token. The one tick is the market's own rate-model KINK —
// the utilisation its curve is tuned to turn at. That tick is deliberately the
// only one: a collateral factor lives on a different axis entirely (a
// borrower's debt against their collateral, not a market's borrowed share), so
// drawing it here would put two unrelated measures on one line. Fluid's ladder
// works because its three rungs share an axis; Compound's don't, and copying
// the shape would assert a relationship the protocol doesn't have.
//
// No animation: framer nodes per row are what froze the listing shells.
//
// Provenance: the whole view owns ONE <ProvReceiptsScope> (the compound-markets
// pilot's posture — the figures are one block's reading of one protocol, so they
// belong in one receipts list). Every rendered figure is a live read, so each
// carries a <Prov> from lib/compound-v2/markets-provenance. Three summary COUNTS
// of a config CONDITION (markets disabled as collateral, markets priced without
// a feed) are a JSX Σ over per-market reads, not a single figure — they carry
// data-prov-exempt rather than a receipt that would overclaim. The roster count
// is different: it is the length of one getAllMarkets() enumerator read, so it
// carries a receipt.

import { RatioBar, type RatioBarTick } from "@/components/shared/ratio-bar";
import { shortAddress } from "@/lib/compound-v2/asset-catalog";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvenanceInfoTabs } from "@/components/shared/provenance-info-tabs";
import { VitalsBand } from "@/components/shared/vitals-band";
import {
  type CompoundV2MarketCoords,
  cvRosterProv,
  cvSummaryValueProv,
  cvWithFeedValueProv,
  cvNoFeedSuppliedProv,
  cvMarketBaseProv,
  cvMarketValueProv,
  cvPriceProv,
  cvKinkProv,
  cvRateProv,
  cvCollateralFactorProv,
} from "@/lib/compound-v2/markets-provenance";
import type { CompoundV2MarketRow, CompoundV2MarketsResponse } from "@/lib/sources/chain/compound-v2-markets";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

const pctText = (f: number | null, dp = 1) => (f == null ? "—" : `${(f * 100).toFixed(dp)}%`);

const usd = (v: number | null): string =>
  v == null ? "—" : `$${v.toLocaleString("en-US", { maximumFractionDigits: v < 100 ? 2 : 0 })}`;

const tokenAmount = (v: number, symbol: string): string => {
  const n =
    v === 0
      ? "0"
      : Math.abs(v) < 0.001
        ? v.toExponential(2)
        : v.toLocaleString("en-US", { maximumFractionDigits: v < 1 ? 6 : 2 });
  return `${n} ${symbol}`;
};

/** The market-surface coordinates a row's receipts read against — the block, the
 *  cToken, its symbols, and the oracle / rate model the loader read alongside. */
const coordsFor = (m: CompoundV2MarketRow, block: number, oracle: string | null): CompoundV2MarketCoords => ({
  blockNumber: block,
  cToken: m.cToken,
  cTokenSymbol: m.cTokenSymbol,
  underlyingSymbol: m.underlyingSymbol,
  oracle,
  priceFeed: m.priceFeed,
  interestRateModel: m.interestRateModel,
});

function MarketCard({ m, block, oracle }: { m: CompoundV2MarketRow; block: number; oracle: string | null }) {
  const coords = coordsFor(m, block, oracle);
  const ticks: RatioBarTick[] = [];
  if (m.kink != null)
    ticks.push({
      f: m.kink,
      kind: "neutral",
      title: `Rate model kink · the utilisation this market's curve turns at (${pctText(m.kink, 0)})`,
    });

  return (
    <div className="rounded-lg border border-rb-200 bg-rb-50 p-3 dark:border-rb-500/30 dark:bg-rb-500/5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[13px] font-semibold text-foreground">{m.underlyingSymbol}</span>{" "}
          <a
            href={explorerUrl(MAINNET_CHAIN_ID, "address", m.cToken)}
            target="_blank"
            rel="noopener noreferrer"
            className="link-external text-[11px] text-rb-500"
            title={m.identityNote ?? undefined}
          >
            {m.cTokenSymbol} · {shortAddress(m.cToken)}
          </a>
        </div>
        <span className="shrink-0 text-[13px] tabular-nums text-foreground">
          <Prov info={cvMarketValueProv("supplied", coords)}>{usd(m.totalSupplyUsd)}</Prov>
        </span>
      </div>

      <div className="mt-0.5 text-[11px] tabular-nums text-rb-500">
        <Prov info={cvMarketBaseProv("supplied", coords)}>
          {tokenAmount(m.totalSupplyUnderlying, m.underlyingSymbol)}
        </Prov>{" "}
        supplied
        {!m.priceHasFeed && m.priceUsd != null && (
          <span title="The oracle prices this market from a constant it stores, with no price feed behind it — nothing updates this number.">
            {" · "}
            <span className="text-foreground">
              price fixed at <Prov info={cvPriceProv(false, coords)}>{usd(m.priceUsd)}</Prov>
            </span>
            , no feed
          </span>
        )}
      </div>

      <RatioBar fill={m.utilisation ?? 0} ticks={ticks} />

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-rb-500">
        {/* Utilisation is borrowed ÷ supplied — both traced on this card (the
            USD supplied headline and USD borrowed), so this ratio restates two
            receipted figures rather than naming a distinct chain read. */}
        <span
          data-prov-exempt=""
          title="Utilisation is borrowed ÷ supplied — both already traced on this card (USD supplied and USD borrowed). A ratio of two receipted figures, not a distinct chain read."
        >
          <span className="text-foreground">{pctText(m.utilisation)}</span> utilised
        </span>
        <span>
          <Prov info={cvMarketValueProv("borrowed", coords)}>{usd(m.totalBorrowsUsd)}</Prov> borrowed
        </span>
        {m.kink != null ? (
          <span>
            kink <Prov info={cvKinkProv(coords)}>{pctText(m.kink, 0)}</Prov>
          </span>
        ) : (
          <span title="This market runs the original WhitePaper rate model — a straight line with no turn, so there is no kink to mark.">
            no kink
          </span>
        )}
      </div>

      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-rb-500">
        {m.collateralDisabled ? (
          <span
            className="text-foreground"
            title="The Comptroller's collateral factor for this market is zero: nothing supplied here backs any borrowing. It is not a 0% limit — the market is switched off as collateral."
          >
            disabled as collateral
          </span>
        ) : (
          <span>
            collateral factor <Prov info={cvCollateralFactorProv(coords)}>{pctText(m.collateralFactor, 0)}</Prov>
          </span>
        )}
        <span>
          supply{" "}
          {m.supplyApr != null ? <Prov info={cvRateProv("supply", coords)}>{`${m.supplyApr.toFixed(2)}%`}</Prov> : "—"}
        </span>
        <span>
          borrow{" "}
          {m.borrowApr != null ? <Prov info={cvRateProv("borrow", coords)}>{`${m.borrowApr.toFixed(2)}%`}</Prov> : "—"}
        </span>
      </div>
    </div>
  );
}

export function CompoundV2MarketsStamp({ data }: { data: CompoundV2MarketsResponse }) {
  if (data.chainStale || data.blockNumber === 0) return null;
  return (
    <p className="mt-2 text-[11px] text-rb-500">
      Chain snapshot · block{" "}
      <a
        href={explorerUrl(MAINNET_CHAIN_ID, "block", data.blockNumber)}
        target="_blank"
        rel="noopener noreferrer"
        className="link-external"
      >
        {data.blockNumber.toLocaleString("en-US")}
      </a>{" "}
      · roster from the{" "}
      <a
        href={explorerUrl(MAINNET_CHAIN_ID, "address", "0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B")}
        target="_blank"
        rel="noopener noreferrer"
        className="link-external"
      >
        Comptroller
      </a>
      &rsquo;s own <span className="text-foreground">getAllMarkets()</span>
      {data.oracle && (
        <>
          {" "}
          · priced by the{" "}
          <a
            href={explorerUrl(MAINNET_CHAIN_ID, "address", data.oracle)}
            target="_blank"
            rel="noopener noreferrer"
            className="link-external"
          >
            oracle it reads
          </a>
        </>
      )}
    </p>
  );
}

export function CompoundV2MarketsView({ data }: { data: CompoundV2MarketsResponse }) {
  // Hook first (before the early return), so the receipts registry is stable
  // across renders regardless of the stale branch — the maple-pools-view order.
  const registry = useReceiptRegistry();
  if (data.chainStale) {
    return <p className="text-sm text-rb-500">The market roster could not be read from chain at this block.</p>;
  }

  const s = data.summary;
  const summaryCoords: CompoundV2MarketCoords = { blockNumber: data.blockNumber, oracle: data.oracle };
  const fixedPriceMarkets = data.markets.filter((m) => !m.priceHasFeed);
  const sai = fixedPriceMarkets.find((m) => m.underlyingSymbol === "SAI");

  return (
    <ProvReceiptsScope registry={registry}>
      {/* The vitals band — the roster's head figures in the shared slots, under
          Compound V2's own words for them. The two condition COUNTS are not
          vitals: they qualify the roster rather than size it, so they sit in
          the band's 11px notes run beneath the rule. */}
      <VitalsBand
        className="mb-4"
        vitals={[
          {
            slot: "roster",
            label: "Markets listed",
            value: <Prov info={cvRosterProv(summaryCoords)}>{s.total}</Prov>,
          },
          {
            slot: "sizeIn",
            label: "Supplied",
            value: <Prov info={cvSummaryValueProv("supplied", summaryCoords)}>{usd(s.totalSuppliedUsd)}</Prov>,
          },
          {
            slot: "sizeOut",
            label: "Borrowed",
            value: <Prov info={cvSummaryValueProv("borrowed", summaryCoords)}>{usd(s.totalBorrowedUsd)}</Prov>,
          },
          {
            // Roster utilisation is Σ borrowed ÷ Σ supplied — both totals sit
            // receipted beside it in this band, so the ratio restates them.
            slot: "usage",
            label: "Utilisation",
            value: <span data-prov-exempt="">{pctText(s.utilisation)}</span>,
            title:
              "Σ borrowed ÷ Σ supplied, both in USD at the Comptroller's own oracle price — the two figures beside it in this band. How much of the money is working. A ratio of two receipted figures, not a distinct chain read.",
          },
        ]}
        notes={
          <>
            {s.collateralDisabled > 0 && (
              // A Σ over the roster's markets() reads of [collateralFactor == 0], not
              // a single figure — stated as a count, exempt from a per-read receipt.
              <span
                data-prov-exempt=""
                title="A count over each market's Comptroller markets() record — the number whose collateral factor is zero (disabled as collateral). A JSX sum over per-market reads, not a single chain figure."
              >
                <span className="text-foreground">{s.collateralDisabled}</span> disabled as collateral
              </span>
            )}
            {s.fixedPrice > 0 && (
              // A Σ over the roster's getConfig reads of [priceFeed == address(0)] —
              // again a count of a condition, exempt rather than over-claimed.
              <span
                data-prov-exempt=""
                title="A count over each market's oracle getConfig — the number priced by a stored constant with no feed. A JSX sum over per-market reads, not a single chain figure."
              >
                <span className="text-foreground">{s.fixedPrice}</span> priced without a feed
              </span>
            )}
          </>
        }
      />

      <div className="grid gap-2.5 sm:grid-cols-2">
        {data.markets.map((m) => (
          <MarketCard key={m.cToken} m={m} block={data.blockNumber} oracle={data.oracle} />
        ))}
      </div>

      {fixedPriceMarkets.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-foreground">Priced by a constant, with no feed</h2>
          <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-rb-500">
            The oracle&rsquo;s own config gives {fixedPriceMarkets.length} markets a stored{" "}
            <span className="text-foreground">fixedPrice</span> and no price feed at all — governance set a number and
            nothing has updated it since. These are the prices the Comptroller itself would use, so they are shown as
            found rather than corrected; what the view will not do is present them as prices that still update. The
            clearest case is the legacy SAI market, priced at{" "}
            <span className="text-foreground">
              {sai ? (
                <Prov info={cvPriceProv(false, coordsFor(sai, data.blockNumber, data.oracle))}>
                  {usd(sai.priceUsd)}
                </Prov>
              ) : (
                usd(null)
              )}
            </span>{" "}
            for a token that targets a dollar. Between them these markets carry{" "}
            <span className="text-foreground">
              <Prov info={cvNoFeedSuppliedProv(summaryCoords)}>
                {usd(
                  s.totalSuppliedUsd != null && s.totalSuppliedUsdWithFeed != null
                    ? s.totalSuppliedUsd - s.totalSuppliedUsdWithFeed
                    : null,
                )}
              </Prov>
            </span>{" "}
            of the supplied total above; excluding them, the protocol holds{" "}
            <span className="text-foreground">
              <Prov info={cvWithFeedValueProv("supplied", summaryCoords)}>{usd(s.totalSuppliedUsdWithFeed)}</Prov>
            </span>{" "}
            against{" "}
            <span className="text-foreground">
              <Prov info={cvWithFeedValueProv("borrowed", summaryCoords)}>{usd(s.totalBorrowedUsdWithFeed)}</Prov>
            </span>{" "}
            borrowed — the same story either way, which is why the headline is not quietly resting on them.
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums text-rb-500">
            {fixedPriceMarkets.map((m) => (
              <a
                key={m.cToken}
                href={explorerUrl(MAINNET_CHAIN_ID, "address", m.cToken)}
                target="_blank"
                rel="noopener noreferrer"
                className="link-external"
              >
                {m.cTokenSymbol} · {m.underlyingSymbol} at{" "}
                <Prov info={cvPriceProv(false, coordsFor(m, data.blockNumber, data.oracle))}>{usd(m.priceUsd)}</Prov>
              </a>
            ))}
          </div>
        </section>
      )}

      <ProvenanceInfoTabs className="mt-6" />
    </ProvReceiptsScope>
  );
}
