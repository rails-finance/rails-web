"use client";

// Moonwell protocol view — every listed market and the state of the money in it.
// ----------------------------------------------------------------------------
// The Compound V2 markets view ported onto Moonwell, and now shared by both of
// the protocol's Rails explorers: Ethereum (four markets, a few million
// dollars) and Base (twenty-one markets, tens of millions). One component,
// because it states nothing of its own — every figure is the protocol's, and
// the claim each deployment makes is whatever its own numbers say. What the
// component takes per deployment is only which chain to link into and which
// Comptroller answered.
//
// The bar is <RatioBar> on the UTILISATION axis: fill = borrowed ÷ supplied in
// the market's own token. The one tick is the market's own rate-model KINK —
// per-market, because the roster does not share one (90% on the three larger
// markets, 60% on cbBTC). A collateral factor lives on a different axis
// entirely (a borrower's debt against their collateral, not a market's
// borrowed share), and so does a supply cap (a ceiling on what may arrive, not
// a share of what did) — both are stated as text and neither is drawn on the
// bar. Blending them would assert relationships the protocol doesn't have.
//
// No animation: framer nodes per row are what froze the listing shells.
//
// Provenance: the whole view owns ONE <ProvReceiptsScope> (the pilot's posture —
// the figures are one block's reading of one protocol, so they belong in one
// receipts list). Every rendered figure is a live chain read, so each carries a
// <Prov> from lib/moonwell/markets-provenance: an mToken slot, a Comptroller
// parameter, the Comptroller's own oracle price, or an arithmetic over those.
// Nothing here is exempt — Moonwell enumerates its own markets on-chain
// (getAllMarkets), so even the roster count is a real read, not a stated roster.

import Link from "next/link";
import { RatioBar, type RatioBarTick } from "@/components/shared/ratio-bar";
import { shortAddress, MOONWELL_ADDRESSES } from "@/lib/moonwell/asset-catalog";
import { explorerUrl, MAINNET_CHAIN_ID, type ChainId } from "@/lib/shared/chains";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvenanceInfoTabs } from "@/components/shared/provenance-info-tabs";
import { VitalsBand } from "@/components/shared/vitals-band";
import {
  type MoonwellMarketCoords,
  mwSuppliedUnderlyingProv,
  mwValueUsdProv,
  mwKinkProv,
  mwRateProv,
  mwCollateralFactorProv,
  mwCapProv,
  mwCapUsedProv,
  mwRosterCountProv,
  mwSummaryValueProv,
  mwSummaryCapMaxProv,
  mwCloseFactorProv,
  mwLiquidationIncentiveProv,
} from "@/lib/moonwell/markets-provenance";
import type { MoonwellMarketRow, MoonwellMarketsResponse } from "@/lib/sources/chain/moonwell-market-state";

const LINK = "text-blue-500 hover:underline";

// A one-base-unit cap is the fork's closed door (see MoonwellMarketRow's
// supplyCapOneUnit): named, not quoted as an amount or a share.
const ONE_UNIT_TITLE =
  "A cap of exactly one base unit of the token. In this fork a cap of 0 means no cap, so governance closes a market to new activity by setting the smallest positive amount instead. The share used says nothing here and is not quoted.";

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

function MarketCard({
  m,
  block,
  oracle,
  chainId,
  comptroller,
  listingBasePath,
  listingFilterKey,
}: {
  m: MoonwellMarketRow;
  block: number;
  oracle: string | null;
  chainId: ChainId;
  comptroller: string;
  listingBasePath?: string;
  listingFilterKey?: "underlyingSymbol" | "mToken";
}) {
  // A function prop can't cross the server→client boundary these pages sit on
  // (the page is a Server Component, this view is "use client"), so the
  // listing link is built from primitives instead: which field of `m`
  // identifies a market to the listing's own ?supply=/?borrow= chips differs
  // per deployment — Ethereum's take the underlying symbol, Base's the mToken
  // address, since two Base markets share a symbol.
  const filterValue = listingFilterKey === "mToken" ? m.mToken : m.underlyingSymbol;
  const listingHref = (side: "supply" | "borrow") => `${listingBasePath}?${side}=${encodeURIComponent(filterValue)}`;
  const supplyLink =
    listingBasePath && listingFilterKey && m.totalSupplyUsd != null && m.totalSupplyUsd > 0
      ? listingHref("supply")
      : null;
  const borrowLink =
    listingBasePath && listingFilterKey && m.totalBorrowsUsd != null && m.totalBorrowsUsd > 0
      ? listingHref("borrow")
      : null;
  const coords: MoonwellMarketCoords = {
    blockNumber: block,
    mToken: m.mToken,
    mTokenSymbol: m.mTokenSymbol,
    underlyingSymbol: m.underlyingSymbol,
    comptroller,
    oracle: oracle ?? undefined,
    irm: m.interestRateModel ?? undefined,
  };

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
            href={explorerUrl(chainId, "address", m.mToken)}
            target="_blank"
            rel="noopener noreferrer"
            className="link-external text-[11px] text-rb-500"
          >
            {m.mTokenSymbol} · {shortAddress(m.mToken)}
          </a>
        </div>
        <span className="shrink-0 text-[13px] tabular-nums text-foreground">
          {supplyLink ? (
            <Link href={supplyLink} className={LINK} title="Positions supplying this market">
              <Prov info={mwValueUsdProv("supplied", coords)}>{usd(m.totalSupplyUsd)}</Prov>
            </Link>
          ) : (
            <Prov info={mwValueUsdProv("supplied", coords)}>{usd(m.totalSupplyUsd)}</Prov>
          )}
        </span>
      </div>

      <div className="mt-0.5 text-[11px] tabular-nums text-rb-500">
        <Prov info={mwSuppliedUnderlyingProv(coords)}>{tokenAmount(m.totalSupplyUnderlying, m.underlyingSymbol)}</Prov>{" "}
        supplied
      </div>

      <RatioBar fill={m.utilisation ?? 0} ticks={ticks} />

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-rb-500">
        {/* Utilisation is borrowed ÷ supplied — both traced on this card (the
            USD supplied headline and USD borrowed), a ratio of receipted
            figures rather than a distinct chain read. */}
        <span
          data-prov-exempt=""
          title="Utilisation is borrowed ÷ supplied — both already traced on this card (USD supplied and USD borrowed). A ratio of two receipted figures, not a distinct chain read."
        >
          <span className="text-foreground">{pctText(m.utilisation)}</span> utilised
        </span>
        <span>
          {borrowLink ? (
            <Link href={borrowLink} className={LINK} title="Positions borrowing this market">
              <Prov info={mwValueUsdProv("borrowed", coords)}>{usd(m.totalBorrowsUsd)}</Prov>
            </Link>
          ) : (
            <Prov info={mwValueUsdProv("borrowed", coords)}>{usd(m.totalBorrowsUsd)}</Prov>
          )}{" "}
          borrowed
        </span>
        {m.kink != null && (
          <span>
            kink <Prov info={mwKinkProv(coords)}>{pctText(m.kink, 0)}</Prov>
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
            collateral factor <Prov info={mwCollateralFactorProv(coords)}>{pctText(m.collateralFactor, 0)}</Prov>
          </span>
        )}
        <span>
          supply{" "}
          {m.supplyApr != null ? <Prov info={mwRateProv("supply", coords)}>{`${m.supplyApr.toFixed(2)}%`}</Prov> : "—"}
        </span>
        <span>
          borrow{" "}
          {m.borrowApr != null ? <Prov info={mwRateProv("borrow", coords)}>{`${m.borrowApr.toFixed(2)}%`}</Prov> : "—"}
        </span>
      </div>

      {(m.supplyCap != null || m.borrowCap != null) && (
        <div
          className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-rb-500"
          title="Governance ceilings on this market, in its own token. A cap limits what may arrive — a different axis from the bar above, which measures the share of what did arrive that is borrowed."
        >
          {m.supplyCap != null && (
            <span>
              supply cap{" "}
              <Prov info={mwCapProv("supply", coords)}>
                {m.supplyCapOneUnit ? (
                  <span title={ONE_UNIT_TITLE}>one base unit</span>
                ) : (
                  tokenAmount(m.supplyCap, m.underlyingSymbol)
                )}
              </Prov>
              {m.supplyCapOneUnit ? (
                <span title={ONE_UNIT_TITLE}>
                  {" "}
                  · <span className="text-caution-500">closed to new supply</span>
                </span>
              ) : (
                m.supplyCapUsed != null && (
                  <>
                    {" "}
                    ·{" "}
                    <Prov info={mwCapUsedProv("supply", coords)}>
                      <span className={m.supplyCapUsed >= 1 ? "text-caution-500" : "text-foreground"}>
                        {pctText(m.supplyCapUsed)}
                      </span>
                    </Prov>{" "}
                    used
                    {m.supplyCapUsed >= 1 && (
                      <span title="This market already holds more than its supply cap allows, so no new supply is accepted. Governance sets a cap below what a market holds to close it to deposits — the cap was not breached, it was lowered.">
                        {" "}
                        · <span className="text-caution-500">closed to new supply</span>
                      </span>
                    )}
                  </>
                )
              )}
            </span>
          )}
          {m.borrowCap != null && (
            <span>
              borrow cap{" "}
              <Prov info={mwCapProv("borrow", coords)}>
                {m.borrowCapOneUnit ? (
                  <span title={ONE_UNIT_TITLE}>one base unit</span>
                ) : (
                  tokenAmount(m.borrowCap, m.underlyingSymbol)
                )}
              </Prov>
              {m.borrowCapOneUnit ? (
                <span title={ONE_UNIT_TITLE}>
                  {" "}
                  · <span className="text-caution-500">closed to new borrowing</span>
                </span>
              ) : (
                m.borrowCapUsed != null && (
                  <>
                    {" "}
                    ·{" "}
                    <Prov info={mwCapUsedProv("borrow", coords)}>
                      <span className={m.borrowCapUsed >= 1 ? "text-caution-500" : "text-foreground"}>
                        {pctText(m.borrowCapUsed)}
                      </span>
                    </Prov>{" "}
                    used
                    {m.borrowCapUsed >= 1 && (
                      <span title="Borrowing from this market already stands at or above its borrow cap, so no new borrowing is accepted. Governance sets a cap at or below what is borrowed to close a market to new debt.">
                        {" "}
                        · <span className="text-caution-500">closed to new borrowing</span>
                      </span>
                    )}
                  </>
                )
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function MoonwellMarketsStamp({
  data,
  chainId = MAINNET_CHAIN_ID,
  comptroller = MOONWELL_ADDRESSES.COMPTROLLER,
}: {
  data: MoonwellMarketsResponse;
  chainId?: ChainId;
  comptroller?: string;
}) {
  if (data.chainStale || data.blockNumber === 0) return null;
  return (
    <p className="mt-2 text-[11px] text-rb-500">
      Chain snapshot · block{" "}
      <a
        href={explorerUrl(chainId, "block", data.blockNumber)}
        target="_blank"
        rel="noopener noreferrer"
        className="link-external"
      >
        {data.blockNumber.toLocaleString("en-US")}
      </a>{" "}
      · roster from the{" "}
      <a
        href={explorerUrl(chainId, "address", comptroller)}
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
            href={explorerUrl(chainId, "address", data.oracle)}
            target="_blank"
            rel="noopener noreferrer"
            className="link-external"
          >
            Chainlink wrapper it reads
          </a>
        </>
      )}
    </p>
  );
}

export function MoonwellMarketsView({
  data,
  chainId = MAINNET_CHAIN_ID,
  comptroller = MOONWELL_ADDRESSES.COMPTROLLER,
  listingBasePath,
  listingFilterKey,
}: {
  data: MoonwellMarketsResponse;
  /** Which chain's explorer the addresses link into. Defaults to Ethereum, so
   *  the L1 call site renders exactly the hrefs it rendered before. */
  chainId?: ChainId;
  /** The Comptroller that answered — the roster's provenance, and a different
   *  contract per deployment. */
  comptroller?: string;
  /** The position-listing route each card's supplied/borrowed figure links
   *  into, e.g. "/base/moonwell". Omit to render the figures unlinked. */
  listingBasePath?: string;
  /** Which field of the market row is the listing's `?supply=`/`?borrow=`
   *  chip value on this deployment. Required together with `listingBasePath`
   *  to render the links — see the comment on MarketCard. */
  listingFilterKey?: "underlyingSymbol" | "mToken";
}) {
  // Hook first (before the early return), so the receipts registry is stable
  // across renders regardless of the stale branch — the pilot's order.
  const registry = useReceiptRegistry();
  if (data.chainStale) {
    return <p className="text-sm text-rb-500">The market roster could not be read from chain at this block.</p>;
  }

  const s = data.summary;
  const summaryCoords: MoonwellMarketCoords = {
    blockNumber: data.blockNumber,
    comptroller,
    oracle: data.oracle ?? undefined,
  };

  return (
    <ProvReceiptsScope registry={registry}>
      {/* The vitals band — the roster's head figures in the shared slots. The
          cap conditions and the Comptroller's two liquidation constants are not
          vitals: they qualify the roster rather than size it, so they sit in the
          band's 11px notes run beneath the rule. */}
      <VitalsBand
        className="mb-4"
        vitals={[
          {
            slot: "roster",
            label: "Markets listed",
            value: <Prov info={mwRosterCountProv(summaryCoords)}>{s.total}</Prov>,
          },
          {
            slot: "sizeIn",
            label: "Supplied",
            value: <Prov info={mwSummaryValueProv("supplied", summaryCoords)}>{usd(s.totalSuppliedUsd)}</Prov>,
          },
          {
            slot: "sizeOut",
            label: "Borrowed",
            value: <Prov info={mwSummaryValueProv("borrowed", summaryCoords)}>{usd(s.totalBorrowedUsd)}</Prov>,
          },
          {
            // Roster utilisation is Σ borrowed ÷ Σ supplied — both totals sit
            // receipted beside it in this band, so the ratio restates them.
            slot: "usage",
            label: "Utilisation",
            value: <span data-prov-exempt="">{pctText(s.utilisation)}</span>,
            title:
              "Σ borrowed ÷ Σ supplied, both in USD at the Chainlink wrapper the Comptroller reads — the two figures beside it in this band. How much of the money is working. A ratio of two receipted figures, not a distinct chain read.",
          },
        ]}
        notes={
          <>
            {/* A cap can sit BELOW what a market already holds — that is how
                governance closes a market to new deposits, not a ceiling being
                breached. Where that has happened, "no cap more than N% used" is
                the wrong sentence (and N runs into the thousands), so the line
                counts the closed markets instead of quoting a maximum. */}
            {s.closedToSupply > 0 ? (
              <span
                data-prov-exempt=""
                title="These markets accept no new supply: their supply cap is one base unit, or they already hold at or above it. Governance lowers a cap to close a market to deposits. This is a count of the per-market cap figures below, each of which carries its own receipt."
              >
                <span className="text-foreground">{s.closedToSupply}</span>{" "}
                {s.closedToSupply === 1
                  ? "market is closed to new supply by its own cap"
                  : "markets are closed to new supply by their own caps"}
              </span>
            ) : (
              s.supplyCapMaxUsed != null && (
                <span title="The fullest market's share of its own supply cap — every other market sits lower.">
                  no supply cap more than{" "}
                  <Prov info={mwSummaryCapMaxProv(summaryCoords)}>
                    <span className="text-foreground">{pctText(s.supplyCapMaxUsed)}</span>
                  </Prov>{" "}
                  used
                </span>
              )
            )}
            {s.closedToBorrow > 0 && (
              <span
                data-prov-exempt=""
                title="These markets accept no new borrowing: their borrow cap is one base unit, or borrowing already stands at or above it. This is a count of the per-market cap figures below, each of which carries its own receipt."
              >
                <span className="text-foreground">{s.closedToBorrow}</span>{" "}
                {s.closedToBorrow === 1
                  ? "market is closed to new borrowing by its own cap"
                  : "markets are closed to new borrowing by their own caps"}
              </span>
            )}
            {s.closeFactor != null && (
              <span>
                close factor <Prov info={mwCloseFactorProv(summaryCoords)}>{pctText(s.closeFactor, 0)}</Prov>
              </span>
            )}
            {s.liquidationIncentive != null && (
              <span title="A liquidator repays up to the close factor of a shortfallen borrow and seizes collateral worth this multiple of what was repaid.">
                liquidation incentive{" "}
                <Prov info={mwLiquidationIncentiveProv(summaryCoords)}>{s.liquidationIncentive.toFixed(2)}×</Prov>
              </span>
            )}
          </>
        }
      />

      <div className="grid gap-2.5 sm:grid-cols-2">
        {data.markets.map((m) => (
          <MarketCard
            key={m.mToken}
            m={m}
            block={data.blockNumber}
            oracle={data.oracle}
            chainId={chainId}
            comptroller={comptroller}
            listingBasePath={listingBasePath}
            listingFilterKey={listingFilterKey}
          />
        ))}
      </div>

      <ProvenanceInfoTabs className="mt-6" />
    </ProvReceiptsScope>
  );
}
