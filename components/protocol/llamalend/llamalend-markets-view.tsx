"use client";

// LlamaLend protocol view — every market the three factories list, one head
// block, version-tagged.
// ----------------------------------------------------------------------------
// The claim: LlamaLend's risk geometry is PER MARKET — each row is an
// isolated market whose amplification A (band density: how gradually
// soft-liquidation converts, immutable, spanning 10…500 on the live roster),
// governance discounts, monetary-policy rate and utilisation are its own.
// Rows keep each factory's own enumeration order — sorting by any risk figure
// would be Rails ranking by risk. No risk color.
//
// ⚠️ USD is stated ONLY over the crvUSD-borrowed markets (~$1, the market's
// own denomination); the markets that borrow WETH / tBTC / ynETH / CRV
// render in their own borrowed token, named per row and counted in the
// summary — the "crvUSD ≈ $1 so the oracle is USD" reading never touches
// them.
//
// No animation: framer nodes per row are what froze the listing shells.
//
// Provenance: the whole view owns ONE <ProvReceiptsScope> (the merged markets
// pilots' posture — the figures are one block's reading of one protocol, so they
// belong in one receipts list). Every per-market figure is a live Controller /
// AMM / monetary-policy read, so each carries a <Prov> from
// lib/llamalend/markets-provenance; the roster COUNTS (total + the lineage
// breakdown, markets-with-loans, the non-crvUSD tally) are cardinalities over
// the factories' rosters — not a single chain read — so they carry
// data-prov-exempt rather than a receipt that would overclaim.

import {
  llamaDebtProv,
  llamaAmplificationProv,
  llamaDiscountProv,
  llamaBorrowRateProv,
  llamaOpenLoansProv,
  llamaUtilisationProv,
  llamaPriceOracleProv,
  llamaSummaryLoansProv,
  llamaSummaryDebtProv,
  type LlamalendMarketCoords,
} from "@/lib/llamalend/markets-provenance";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvenanceInfoTabs } from "@/components/shared/provenance-info-tabs";
import { VitalsBand } from "@/components/shared/vitals-band";
import { shortAddress, FACTORY_LABEL, LLAMALEND_ADDRESSES } from "@/lib/llamalend/asset-catalog";
import type { LlamalendMarketRow, LlamalendMarketsResponse } from "@/lib/sources/chain/llamalend-markets";
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

function MarketCard({ m, block }: { m: LlamalendMarketRow; block: number }) {
  // Every per-market figure traces to the same coordinates: the head block, the
  // three contracts this market's reads came from, and the two flags that decide
  // a figure's unit (crvUSD par) and denominator (utilisation basis).
  const coords: LlamalendMarketCoords = {
    blockNumber: block,
    controller: m.controller,
    amm: m.amm,
    monetaryPolicy: m.monetaryPolicy,
    collateralSymbol: m.collateralSymbol,
    borrowedSymbol: m.borrowedSymbol,
    borrowedIsCrvusd: m.borrowedIsCrvusd,
    utilisationBasis: m.utilisationBasis,
  };
  return (
    <div className="rounded-lg border border-rb-200 bg-rb-50 p-3 dark:border-rb-500/30 dark:bg-rb-500/5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[13px] font-semibold text-foreground">
            {m.collateralSymbol} / {m.borrowedSymbol}
          </span>{" "}
          <a
            href={explorerUrl(MAINNET_CHAIN_ID, "address", m.controller)}
            target="_blank"
            rel="noopener noreferrer"
            className="link-external text-[11px] text-rb-500"
          >
            {shortAddress(m.controller)}
          </a>
        </div>
        <span className="shrink-0 text-[13px] tabular-nums text-foreground">
          <Prov info={llamaDebtProv(coords)}>
            {m.borrowedIsCrvusd ? usd(m.totalDebtUsd) : tokenAmount(m.totalDebt, m.borrowedSymbol)}
          </Prov>
        </span>
      </div>

      <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] tabular-nums text-rb-500">
        <span>{FACTORY_LABEL[m.factory]}</span>
        <span>
          · borrowed{m.borrowedIsCrvusd ? "" : " (NOT crvUSD)"}: {m.borrowedSymbol}
        </span>
        {!m.borrowedIsCrvusd && (
          <span
            className="text-foreground"
            title={`This market borrows ${m.borrowedSymbol}, not crvUSD — its figures are in ${m.borrowedSymbol}, and no dollar is asserted from the oracle.`}
          >
            · own-token units
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-rb-500">
        <span title="AMM.A() — amplification, immutable per market: how many bands the price grid packs per doubling, i.e. how GRADUAL soft-liquidation is. The live roster spans 10 (coarse, fast conversion) to 500 (fine, slow).">
          A ={" "}
          <Prov info={llamaAmplificationProv(coords)}>
            <span className="text-foreground">{m.A}</span>
          </Prov>
        </span>
        <span title="Controller.loan_discount() — sizes borrowing power against the collateral.">
          loan discount <Prov info={llamaDiscountProv("loan", coords)}>{pctText(m.loanDiscount)}</Prov>
        </span>
        <span title="Controller.liquidation_discount() — arms hard liquidation.">
          liq. discount <Prov info={llamaDiscountProv("liquidation", coords)}>{pctText(m.liquidationDiscount)}</Prov>
        </span>
        <span title="monetary_policy().rate — per-second at 1e18, annualized by simple multiplication.">
          borrow{" "}
          {m.borrowAprPct != null ? (
            <Prov info={llamaBorrowRateProv(coords)}>{`${m.borrowAprPct.toFixed(2)}%`}</Prov>
          ) : (
            "—"
          )}
        </span>
      </div>

      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-rb-500">
        <span>
          <Prov info={llamaOpenLoansProv(coords)}>
            <span className="text-foreground">{m.nLoans}</span>
          </Prov>{" "}
          open loan{m.nLoans === 1 ? "" : "s"}
        </span>
        {m.utilisation != null && (
          <span
            title={
              m.utilisationBasis === "crvUSD debt ceiling"
                ? "Debt ÷ the factory's own debt_ceiling(controller) — a mint market borrows against a crvUSD ceiling, not lender deposits."
                : "Debt ÷ (debt + the borrowed token still sitting on the controller) — the lender-funded liquidity."
            }
          >
            <Prov info={llamaUtilisationProv(coords)}>
              <span className="text-foreground">{pctText(m.utilisation)}</span>
            </Prov>{" "}
            of {m.utilisationBasis}
          </span>
        )}
        <span title="AMM.price_oracle() — the collateral priced in the market's own borrowed token (1e18).">
          oracle <Prov info={llamaPriceOracleProv(coords)}>{tokenAmount(m.priceOracle, m.borrowedSymbol)}</Prov>
        </span>
      </div>
    </div>
  );
}

export function LlamalendMarketsStamp({ data }: { data: LlamalendMarketsResponse }) {
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
      · roster from the factories&rsquo; own counters —{" "}
      <a
        href={explorerUrl(MAINNET_CHAIN_ID, "address", LLAMALEND_ADDRESSES.ONEWAY_FACTORY)}
        target="_blank"
        rel="noopener noreferrer"
        className="link-external"
      >
        OneWayLendingFactory
      </a>
      ,{" "}
      <a
        href={explorerUrl(MAINNET_CHAIN_ID, "address", LLAMALEND_ADDRESSES.CRVUSD_FACTORY)}
        target="_blank"
        rel="noopener noreferrer"
        className="link-external"
      >
        crvUSD ControllerFactory
      </a>{" "}
      and the{" "}
      <a
        href={explorerUrl(MAINNET_CHAIN_ID, "address", LLAMALEND_ADDRESSES.V2_FACTORY)}
        target="_blank"
        rel="noopener noreferrer"
        className="link-external"
      >
        V2 Factory
      </a>{" "}
      · priced by each AMM&rsquo;s own <span className="text-foreground">price_oracle()</span>
    </p>
  );
}

export function LlamalendMarketsView({ data }: { data: LlamalendMarketsResponse }) {
  // Hook first (before the early return), so the receipts registry is stable
  // across renders regardless of the stale branch — the merged pilots' order.
  const registry = useReceiptRegistry();
  if (data.chainStale) {
    return <p className="text-sm text-rb-500">The market roster could not be read from chain at this block.</p>;
  }

  const s = data.summary;
  const v1 = data.markets.filter((m) => m.version === "v1");
  const v2 = data.markets.filter((m) => m.version === "v2");
  // "Live" is judged on open loans, not debt: a market with borrowers is open
  // for business whatever its debt rounds to, and the two agree on today's
  // data. Debt alone would call a market dormant the instant its last loan is
  // repaid, which is not what the sentence below is claiming.
  const v2Live = v2.filter((m) => m.nLoans > 0).length;
  const nonCrvusd = data.markets.filter((m) => !m.borrowedIsCrvusd);
  // Roster-summary receipts need only the block; the per-market coordinates
  // live on each card.
  const summaryCoords: LlamalendMarketCoords = { blockNumber: data.blockNumber };

  return (
    <ProvReceiptsScope registry={registry}>
      {/* The vitals band. LlamaLend fills roster · size out · population and
          leaves the SUPPLIED and USAGE slots empty on purpose:
            — there is no roster-level supplied total. The markets supply
              crvUSD, WETH, tBTC, ynETH and CRV, so a "supplied" sum would have
              no unit to be stated in; the borrowed figure is stated only over
              the crvUSD markets, which is why it carries its own scope
              qualifier rather than reading as a protocol-wide dollar total.
            — there is no single roster utilisation. Mint markets divide debt
              by the factory's own debt_ceiling(controller); lend markets
              divide by debt plus the borrowed token still sitting on the
              controller. Two different denominators, so no one ratio — the
              per-market figure lives on each card. Do not compute one here. */}
      <VitalsBand
        className="mb-4"
        vitals={[
          {
            slot: "roster",
            label: "Markets listed",
            // Roster cardinality — a count over the three factories' own
            // rosters (with unreadable markets dropped), not a single chain read.
            value: <span data-prov-exempt="">{s.total}</span>,
            title:
              "A cardinality over the three factories' own rosters (unreadable markets dropped), not a single chain read.",
          },
          {
            slot: "sizeOut",
            label: "Borrowed",
            value: (
              <>
                <Prov info={llamaSummaryDebtProv(summaryCoords)}>{usd(s.totalDebtCrvusd)}</Prov>{" "}
                <span className="text-[11px] text-rb-500">crvUSD markets</span>
              </>
            ),
            title:
              "Σ total_debt over the crvUSD-borrowed markets only — crvUSD is a $-pegged stable, so the sum reads as dollars (unit: crvUSD ~$1). The non-crvUSD markets are excluded, not converted.",
          },
          {
            slot: "population",
            label: "Loans",
            value: <Prov info={llamaSummaryLoansProv(summaryCoords)}>{s.totalLoans.toLocaleString("en-US")}</Prov>,
          },
        ]}
        notes={
          <>
            <span
              data-prov-exempt=""
              title="A cardinality over the three factories' own rosters (unreadable markets dropped), not a single chain read."
            >
              <span className="text-foreground">{s.v1Lend}</span> V1 lend ·{" "}
              <span className="text-foreground">{s.v1Mint}</span> V1 mint ·{" "}
              <span className="text-foreground">{s.v2}</span> V2
            </span>
            <span>
              {/* Markets-with-open-loans is a cardinality, not a chain read. */}
              <span
                className="text-foreground"
                data-prov-exempt=""
                title="A count of the markets carrying at least one open loan — a cardinality, not a single chain read."
              >
                {s.live}
              </span>{" "}
              with open loans
            </span>
            {s.nonCrvusdBorrow > 0 && (
              <span
                data-prov-exempt=""
                title="A count of the markets whose borrowed token is not crvUSD — a cardinality, not a single chain read."
              >
                <span className="text-foreground">{s.nonCrvusdBorrow}</span> markets borrow something other than crvUSD
              </span>
            )}
          </>
        }
      />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">V1 markets</h2>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {v1.map((m) => (
            <MarketCard key={m.controller} m={m} block={data.blockNumber} />
          ))}
        </div>
      </section>

      {v2.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-1 text-sm font-semibold text-foreground">V2 markets</h2>
          {/* ⚠️ The second sentence is DERIVED, never asserted. It used to read
              "Both listed markets are pre-launch: zero debt, zero loans,
              borrowing not yet open" — true when written, and by the time V2
              launched it was sitting directly above three cards showing
              $591,724 against 4 open loans, $135,159 against 7, and a roster
              line one screen up reading "3 V2". A launch state is the most
              perishable thing a page can hardcode, so it now counts the same
              rows the cards below render and can no longer contradict them. */}
          <p className="mb-2 max-w-3xl text-[11px] leading-relaxed text-rb-500">
            The next generation, from its own factory — the LLAMMA core (bands, soft-liquidation, the state reads) is
            identical to V1&rsquo;s.{" "}
            {v2Live === 0
              ? `${v2.length === 1 ? "The one listed market is" : `All ${v2.length} listed markets are`} pre-launch: zero debt, zero loans, borrowing not yet open.`
              : v2Live === v2.length
                ? `${v2.length === 1 ? "The one listed market is" : `All ${v2.length} listed markets are`} live and carrying debt.`
                : `${v2Live} of ${v2.length} listed markets ${v2Live === 1 ? "is" : "are"} live and carrying debt; the rest are yet to open for borrowing.`}
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {v2.map((m) => (
              <MarketCard key={m.controller} m={m} block={data.blockNumber} />
            ))}
          </div>
        </section>
      )}

      {nonCrvusd.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-foreground">Markets that do not borrow crvUSD</h2>
          <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-rb-500">
            {nonCrvusd.map((m, i) => (
              <span key={m.controller}>
                {i > 0 ? " " : ""}
                <span className="text-foreground">
                  {m.collateralSymbol} / {m.borrowedSymbol}
                </span>{" "}
                borrows <span className="text-foreground">{m.borrowedSymbol}</span>.
              </span>
            ))}{" "}
            On every other market the borrowed token is crvUSD — a $-pegged stable — so the AMM&rsquo;s own oracle reads
            as dollars there (unit: crvUSD, ~$1). On these it does not: their prices, debts and band edges are in the
            borrowed token itself, and this explorer presents them that way rather than inventing a conversion. All are
            empty or dust today, but the roster is read from the factories at head, not assumed.
          </p>
        </section>
      )}

      <ProvenanceInfoTabs className="mt-6" />
    </ProvReceiptsScope>
  );
}
