"use client";

// Morpho Blue — one market's header (/<chain>/morpho/markets/<loan token>/<market id>).
// ----------------------------------------------------------------------------
// The third page of the markets view, under the overview and the loan-token page: what the
// loan-token page draws as one MarketRow, stated whole, with the one thing the roster never
// asks — the market's oracle. Below it the page draws the positions listing fixed to this
// market; this component is only the market itself.
//
// Everything is read at ONE head block by lib/sources/chain/morpho-markets
// loadMorphoMarketFromChain: market(id) as stored (never accrued forward — the roster's rule),
// the market's own IRM on it, and the oracle's price with its feeds' latest rounds, the last
// two read and stated exactly as the position page states them (MorphoOraclePrice). No USD,
// by charter: every size is a quantity of the loan token.
//
// A client component for the reason the markets views are (the weight rule in rails-ops
// architecture/morpho-markets-view.md): its props are the flight payload, so it takes
// marketViewData(resp) — the row and the oracle read — and nothing else.
//
// Provenance: one <ProvReceiptsScope>. The figures carry the markets vocabulary's receipts
// (lltv, sizes, utilisation, rates, fee) plus two added for this page (what is still
// borrowable, when the market last settled); the oracle price and its age carry the position
// vocabulary's, through the shared component. The parameters block — ids, addresses, the
// creation block — is identifiers, not figures, and is exempt.

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons/icon";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { VitalsBand } from "@/components/shared/vitals-band";
import { amount, pctText } from "@/lib/morpho/markets-format";
import { MorphoOraclePrice } from "@/components/protocol/morpho/morpho-oracle-price";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import { morphoLoanTokenHref } from "@/lib/morpho/market-routes";
import { PAGE_LINK } from "@/lib/shared/ui-grammar";
import { publishedText } from "@/lib/morpho/oracle-age";
import {
  type MorphoMarketCoords,
  MORPHO_MARKETS_LANE,
  morphoBorrowRateProv,
  morphoFeeProv,
  morphoLastUpdateProv,
  morphoLltvProv,
  morphoMarketLiquidityProv,
  morphoMarketSizeProv,
  morphoSupplyRateProv,
  morphoUtilizationProv,
} from "@/lib/morpho/markets-provenance";
import type { MorphoMarketViewData } from "@/lib/morpho/markets-shape";

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** The full market id with a copy button — the id is what a reader pastes into a
 *  listing search or a contract call, so it is shown whole. */
function MarketIdCopy({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="break-all font-mono text-foreground">{id}</span>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(id);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        aria-label={copied ? "Copied market id" : "Copy market id"}
        title={copied ? "Copied!" : "Copy"}
        className="shrink-0 cursor-pointer self-center text-rb-500 hover:text-foreground"
      >
        <Icon name={copied ? "check" : "copy"} size={12} />
      </button>
    </span>
  );
}

/** A contract address with its explorer link, and the token's symbol where it has one. */
function AddressLine({ chainId, address, symbol }: { chainId: ChainId; address: string; symbol?: string | null }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      {symbol && <span className="text-foreground">{symbol}</span>}
      <a
        href={explorerUrl(chainId, "address", address)}
        target="_blank"
        rel="noopener noreferrer"
        className="link-external break-all font-mono text-rb-500"
      >
        {address}
      </a>
    </span>
  );
}

export function MorphoMarketView({ data, chainId }: { data: MorphoMarketViewData; chainId: ChainId }) {
  const registry = useReceiptRegistry();
  const m = data.market;
  const block = data.blockNumber;
  const coords: MorphoMarketCoords = {
    blockNumber: block,
    marketId: m.id,
    loanSymbol: m.loanSymbol,
    collateralSymbol: m.collateralSymbol,
    irm: m.irm,
    loanToken: m.loanToken,
  };
  const coll = m.isIdle ? "no collateral" : (m.collateralSymbol ?? shortAddr(m.collateralToken));
  const liquidity = m.totalSupply - m.totalBorrow;

  return (
    <ProvReceiptsScope registry={registry}>
      <div className="mb-1 text-[11px] uppercase tracking-wider text-rb-500">Morpho Blue market</div>
      <h1 className="text-2xl font-semibold text-foreground">
        <span className={data.loanNamed ? "" : "font-mono"}>{m.loanSymbol}</span> /{" "}
        <span className={m.isIdle || m.collateralNamed ? "" : "font-mono"}>{coll}</span>
        <span className="ml-3 text-base font-normal text-rb-500">
          LLTV <Prov info={morphoLltvProv(coords)}>{pctText(m.lltv)}</Prov>
        </span>
      </h1>
      <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500">
        {m.isIdle ? (
          <>
            An idle market: it names no collateral, oracle or interest-rate model, so nothing can be borrowed from it.
            It exists so a vault can hold {m.loanSymbol} inside Blue rather than outside it.
          </>
        ) : (
          <>
            Lends {m.loanSymbol} against {coll}. Every figure here is a quantity of {m.loanSymbol}, never dollars. The
            loan-to-value is the market&rsquo;s whole risk surface: the borrow limit and the liquidation line at once,
            fixed when the market was created.
          </>
        )}{" "}
        Supplied and borrowed are the balances the market last settled, as the contract stores them; the rates and the
        oracle price are read live at this block.
      </p>
      <p className="mt-2">
        <Link href={morphoLoanTokenHref(chainId, m.loanToken)} className={PAGE_LINK} prefetch={false}>
          All {m.loanSymbol} markets <span aria-hidden>→</span>
        </Link>
      </p>
      {/* The read's block — where every receipt below anchors, not a figure of its own. */}
      <p className="mt-2 text-[11px] text-rb-500" data-prov-exempt="">
        Chain snapshot · block{" "}
        <a
          href={explorerUrl(chainId, "block", block)}
          target="_blank"
          rel="noopener noreferrer"
          className="link-external"
        >
          {block.toLocaleString("en-US")}
        </a>{" "}
        · this market&rsquo;s state read from the Morpho Blue singleton, its rate from its own interest-rate model, its
        price from its own oracle
      </p>

      <VitalsBand
        className="mt-5"
        vitals={[
          m.amountsTrusted && {
            slot: "sizeIn" as const,
            label: "Supplied",
            value: (
              <Prov info={morphoMarketSizeProv("supplied", coords)}>
                {amount(m.totalSupply)} {m.loanSymbol}
              </Prov>
            ),
          },
          m.amountsTrusted && {
            slot: "sizeOut" as const,
            label: "Borrowed",
            value: (
              <Prov info={morphoMarketSizeProv("borrowed", coords)}>
                {amount(m.totalBorrow)} {m.loanSymbol}
              </Prov>
            ),
          },
          m.utilization != null && {
            slot: "usage" as const,
            label: "Utilisation",
            value: <Prov info={morphoUtilizationProv(coords)}>{pctText(m.utilization)}</Prov>,
            title: `Borrowed ÷ supplied, both in ${m.loanSymbol} — the one aggregate ratio Blue keeps. Blue records collateral per position and never totals it, so there is no market-wide loan-to-value to state.`,
          },
        ]}
        notes={
          <>
            {m.amountsTrusted ? (
              <span>
                <span className="text-foreground">
                  <Prov info={morphoMarketLiquidityProv(coords)}>
                    {amount(liquidity)} {m.loanSymbol}
                  </Prov>
                </span>{" "}
                still borrowable
              </span>
            ) : (
              <span
                title={`${m.loanSymbol} misreports its own decimals, so its balances cannot be scaled to a quantity.`}
              >
                sizes not stated — {m.loanSymbol} misreports its decimals
              </span>
            )}
            {m.utilization == null && <span>no supply</span>}
            {m.borrowApr != null ? (
              <span>
                <span className="text-foreground">
                  <Prov info={morphoBorrowRateProv(coords)}>{pctText(m.borrowApr, 2)}</Prov>
                </span>{" "}
                borrow APR
              </span>
            ) : (
              <span title="This market names no interest-rate model, so there is no rate to ask for.">no IRM</span>
            )}
            {m.supplyApr != null && (
              <span>
                <span className="text-foreground">
                  <Prov info={morphoSupplyRateProv(coords)}>{pctText(m.supplyApr, 2)}</Prov>
                </span>{" "}
                supply APR
              </span>
            )}
            {m.fee > 0 && (
              <span>
                fee <Prov info={morphoFeeProv(coords)}>{pctText(m.fee, 0)}</Prov>
              </span>
            )}
            {m.lastUpdate > 0 && (
              <span>
                last settled{" "}
                <Prov info={morphoLastUpdateProv(coords)}>{publishedText(m.lastUpdate, data.timestamp)}</Prov>
              </span>
            )}
          </>
        }
      />

      <section className="mt-2.5 rounded-xl bg-raised px-4 py-3.5">
        <h2 className="text-sm font-semibold text-foreground">Oracle price</h2>
        <p className="mt-1.5 text-[13px] tabular-nums text-rb-500">
          {!m.oracle ? (
            <>This market names no oracle.</>
          ) : data.oraclePrice == null ? (
            <>The market&rsquo;s oracle gave no price at this block.</>
          ) : (
            <>
              1 {coll} ={" "}
              <MorphoOraclePrice
                surface="market"
                lane={MORPHO_MARKETS_LANE}
                chain={{
                  chainStale: false,
                  marketId: m.id,
                  blockNumber: block,
                  timestamp: data.timestamp,
                  oracle: m.oracle,
                  oraclePrice: data.oraclePrice,
                  oracleFeeds: data.oracleFeeds,
                  oraclePublishedAt: data.oraclePublishedAt,
                  loanSymbol: m.loanSymbol,
                  collateralSymbol: coll,
                }}
              />
            </>
          )}
        </p>
        {m.oracle && data.oraclePrice != null && (
          <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-rb-500">
            The price Morpho&rsquo;s health test applies to every position here, read from the oracle the market was
            created with.{" "}
            {data.oracleFeeds
              ? "The oracle does not check how old its feeds are, so the time it was published is stated beside it."
              : "The oracle names no price feed this page can read a time from, so no age is stated."}
          </p>
        )}
      </section>

      <section className="mt-2.5 rounded-xl bg-raised px-4 py-3.5">
        <h2 className="text-sm font-semibold text-foreground">Parameters</h2>
        <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-rb-500">
          Fixed when the market was created: the market id is the hash of these five, so changing any one would make a
          different market.
        </p>
        {/* Identifiers — ids, addresses, a block number — not figures, so exempt rather than
            dressed as receipts. The lltv among the five is receipted in the heading above. */}
        <dl
          className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-[12px] sm:grid-cols-[10rem_1fr]"
          data-prov-exempt=""
          title="Market parameters and identifiers, not figures read from a slot."
        >
          <dt className="text-rb-500">Market id</dt>
          <dd>
            <MarketIdCopy id={m.id} />
          </dd>
          <dt className="text-rb-500">Loan token</dt>
          <dd>
            <AddressLine chainId={chainId} address={m.loanToken} symbol={data.loanNamed ? m.loanSymbol : null} />
          </dd>
          <dt className="text-rb-500">Collateral token</dt>
          <dd>
            {m.isIdle ? (
              <span className="text-rb-500">none</span>
            ) : (
              <AddressLine
                chainId={chainId}
                address={m.collateralToken}
                symbol={m.collateralNamed ? m.collateralSymbol : null}
              />
            )}
          </dd>
          <dt className="text-rb-500">Oracle</dt>
          <dd>
            {m.oracle ? (
              <AddressLine chainId={chainId} address={m.oracle} />
            ) : (
              <span className="text-rb-500">none</span>
            )}
          </dd>
          <dt className="text-rb-500">Interest-rate model</dt>
          <dd>
            {m.irm ? <AddressLine chainId={chainId} address={m.irm} /> : <span className="text-rb-500">none</span>}
          </dd>
          <dt className="text-rb-500">Created</dt>
          <dd>
            block{" "}
            <a
              href={explorerUrl(chainId, "block", m.createdBlock)}
              target="_blank"
              rel="noopener noreferrer"
              className="link-external tabular-nums"
            >
              {m.createdBlock.toLocaleString("en-US")}
            </a>
          </dd>
        </dl>
      </section>
    </ProvReceiptsScope>
  );
}
