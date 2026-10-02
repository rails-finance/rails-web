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

import { formatTinyNonZero } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";
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
import { BlockRef } from "@/components/shared/block-ref";

const pctText = (f: number | null, dp = 1) => (f == null ? "—" : `${(f * 100).toFixed(dp)}%`);

const usd = (v: number | null): string =>
  v == null ? "—" : `$${v.toLocaleString("en-US", { maximumFractionDigits: v < 100 ? 2 : 0 })}`;

const tokenAmount = (v: number, symbol: string): string => {
  const n =
    v === 0
      ? "0"
      : Math.abs(v) < 0.001
        ? formatTinyNonZero(v)
        : v.toLocaleString("en-US", { maximumFractionDigits: v < 1 ? 6 : 2 });
  return `${n} ${symbol}`;
};

/** Collateral tokens that are vault shares of a dollar stablecoin: each
 *  share redeems for more of the stablecoin as yield accrues, which is why
 *  the oracle prices them above 1. Each checked on chain (ERC-4626 asset()
 *  and convertToAssets against the market's oracle, 2026-09-29); a token not
 *  listed here carries no such line. */
const YIELD_SHARES: Record<string, string> = {
  "0x9d39a5de30e57443bff2a8307a4256c8797a3497": "USDe", // sUSDe
  "0xa663b02cf0a4b149d2ad41910cb81e23e1c41c32": "FRAX", // sFRAX
  "0xb45ad160634c528cc3d2926d9807104fa3157305": "DOLA", // sDOLA
  "0xcf62f905562626cfcdd2261162a51fd02fc9c5b6": "frxUSD", // sfrxUSD
  "0xa3931d71877c0e7a3148cb7eb4463524fec27fbd": "USDS", // sUSDS
  "0xc8cf6d7991f15525488b2a83df53468d682ba4b0": "USDf", // sUSDf
  "0xbe53a109b494e5c9f97b9cd39fe969be68bf6204": "USDC", // yvUSDC-1
  "0x182863131f9a4630ff9e27830d945b1413e347e8": "USDS", // yvUSDS-1
  "0x80ac24aa929eaf5013f6436cda2a7ba190f5cc0b": "USDC", // syrupUSDC
};

/** A lend market whose policy bounds hold the rate near zero: a maximum under
 *  a million wei a second (1e-12 at 1e18 scale), about 0.003% a year. */
const nearZeroRate = (m: LlamalendMarketRow): boolean =>
  m.minRateRaw != null && m.maxRateRaw != null && BigInt(m.maxRateRaw) < BigInt(1_000_000);

/** A per-second 1e18 rate as a yearly percentage, as the borrow figure is. */
const aprText = (raw: string): string => `${((Number(raw) / 1e18) * 31_536_000 * 100).toFixed(0)}%`;

/** Rate policies whose rate is a function of time alone: "Flat Time-Linear
 *  Monetary Policy" (verified source), rate(t) = clamp(base_rate + slope ×
 *  (t − snapshot_time), min_rate, max_rate), the same answer to every
 *  Controller wired to it. base_rate, slope and snapshot_time have no setter;
 *  min_rate and max_rate are read per market. Read 2026-10-02: 32 V1 lend
 *  markets use 0x066a…3cee (TO-DO-ui-jobs 171). */
interface TimeLinearPolicy {
  /** The starting rate, a year at a time (%). */
  basePct: number;
  /** The rise, in percentage points a year. */
  slopePctPerYear: number;
  /** snapshot_time, unix seconds. */
  since: number;
}

const TIME_LINEAR_POLICIES: Record<string, TimeLinearPolicy> = {
  // base_rate 3170979198 (10%/yr), slope 904 wei/s² (89.9 points a year),
  // snapshot_time 1779714611 (25 May 2026).
  "0x066a89bdf4efb6ad58427d278f16b7a2c53c3cee": { basePct: 10, slopePctPerYear: 89.9, since: 1779714611 },
};

const timeLinearPolicy = (m: LlamalendMarketRow): TimeLinearPolicy | undefined =>
  TIME_LINEAR_POLICIES[m.monetaryPolicy?.toLowerCase() ?? ""];

/** The splitter the crvUSD ControllerFactory names as its fee receiver
 *  (`fee_receiver()`, read 2026-10-02): two receivers, the scrvUSD vault's
 *  RewardsHandler and the DAO's FeeCollector (TO-DO-ui-jobs 169). */
const CRVUSD_FEE_SPLITTER = "0x2dfd89449faff8a532790667bab21cf733c064f2";

function MarketCard({ m, block, sharers }: { m: LlamalendMarketRow; block: number; sharers: number }) {
  const timeLinear = timeLinearPolicy(m);
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
          </Prov>{" "}
          <span className="text-[11px] text-rb-500">debt</span>
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
        <span title="The band width: each band spans about 1/A of its price. Fixed per market.">
          A ={" "}
          <Prov info={llamaAmplificationProv(coords)}>
            <span className="text-foreground">{m.A}</span>
          </Prov>
        </span>
        <span title="Sets how much can be borrowed against the collateral.">
          loan discount <Prov info={llamaDiscountProv("loan", coords)}>{pctText(m.loanDiscount)}</Prov>
        </span>
        <span title="Sets when a loan's health reaches 0.">
          liquidation discount{" "}
          <Prov info={llamaDiscountProv("liquidation", coords)}>{pctText(m.liquidationDiscount)}</Prov>
        </span>
        <span title="The market's borrow rate, charged per second and shown a year at a time.">
          borrow{" "}
          {m.borrowAprPct != null ? (
            <Prov info={llamaBorrowRateProv(coords)}>{`${m.borrowAprPct.toFixed(2)}%`}</Prov>
          ) : (
            "—"
          )}
        </span>
      </div>

      {nearZeroRate(m) && (
        <p className="mt-1 text-[11px] text-rb-500">
          The market&rsquo;s rate policy sets its minimum and maximum at{" "}
          {m.minRateRaw === m.maxRateRaw ? `${m.minRateRaw} wei` : `${m.minRateRaw} and ${m.maxRateRaw} wei`} a second,
          about 0% a year at any utilisation.
        </p>
      )}

      {timeLinear && (
        <p className="mt-1 text-[11px] text-rb-500" data-llamalend-time-linear-policy="">
          The rate follows time alone: the policy{" "}
          <a
            href={explorerUrl(MAINNET_CHAIN_ID, "address", m.monetaryPolicy)}
            target="_blank"
            rel="noopener noreferrer"
            className="link-external"
          >
            {shortAddress(m.monetaryPolicy)}
          </a>{" "}
          started it at {timeLinear.basePct}% a year on {formatDate(timeLinear.since)} and raises it about{" "}
          {Math.round(timeLinear.slopePctPerYear)} points a year
          {m.minRateRaw != null && m.maxRateRaw != null
            ? `, held between ${aprText(m.minRateRaw)} and ${aprText(m.maxRateRaw)}`
            : ""}
          , whatever the utilisation
          {sharers > 1 ? `; ${sharers - 1} other market${sharers - 1 === 1 ? "" : "s"} use the same policy` : ""}.
        </p>
      )}

      {YIELD_SHARES[m.collateralToken?.toLowerCase() ?? ""] && (
        <p className="mt-1 text-[11px] text-rb-500">
          {m.collateralSymbol} is a yield-bearing share of {YIELD_SHARES[m.collateralToken.toLowerCase()]}: each share
          redeems for more {YIELD_SHARES[m.collateralToken.toLowerCase()]} as yield accrues, so the oracle prices it
          above 1.
        </p>
      )}

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
                ? "Debt ÷ the market's crvUSD debt ceiling."
                : "Debt ÷ (debt + the lenders' deposits not yet lent)."
            }
          >
            <Prov info={llamaUtilisationProv(coords)}>
              <span className="text-foreground">{pctText(m.utilisation)}</span>
            </Prov>{" "}
            of {m.utilisationBasis}
          </span>
        )}
        <span title="The price the market's AMM uses for the collateral, in the borrowed token.">
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
      Chain snapshot · <BlockRef block={data.blockNumber} chainId={MAINNET_CHAIN_ID} /> · markets listed by
      Curve&rsquo;s three factories (
      <a
        href={explorerUrl(MAINNET_CHAIN_ID, "address", LLAMALEND_ADDRESSES.ONEWAY_FACTORY)}
        target="_blank"
        rel="noopener noreferrer"
        className="link-external"
      >
        V1 lend
      </a>
      ,{" "}
      <a
        href={explorerUrl(MAINNET_CHAIN_ID, "address", LLAMALEND_ADDRESSES.CRVUSD_FACTORY)}
        target="_blank"
        rel="noopener noreferrer"
        className="link-external"
      >
        V1 mint
      </a>{" "}
      and{" "}
      <a
        href={explorerUrl(MAINNET_CHAIN_ID, "address", LLAMALEND_ADDRESSES.V2_FACTORY)}
        target="_blank"
        rel="noopener noreferrer"
        className="link-external"
      >
        V2
      </a>
      ) · prices from each market&rsquo;s own oracle
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
  // How many markets each rate policy serves, and how many follow time alone.
  const policyUsers = new Map<string, number>();
  for (const m of data.markets) policyUsers.set(m.monetaryPolicy, (policyUsers.get(m.monetaryPolicy) ?? 0) + 1);
  const timeLinearMarkets = data.markets.filter((m) => timeLinearPolicy(m)).length;
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
            title: "A cardinality over the three factories' own rosters (unreadable markets dropped).",
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
              title="A cardinality over the three factories' own rosters (unreadable markets dropped)."
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
                title="A count of the markets carrying at least one open loan — a cardinality."
              >
                {s.live}
              </span>{" "}
              with open loans
            </span>
            {s.nonCrvusdBorrow > 0 && (
              <span
                data-prov-exempt=""
                title="A count of the markets whose borrowed token is not crvUSD — a cardinality."
              >
                <span className="text-foreground">{s.nonCrvusdBorrow}</span> markets borrow something other than crvUSD
              </span>
            )}
          </>
        }
      />

      <dl
        className="mb-6 grid max-w-3xl gap-x-3 gap-y-1 text-[11px] leading-relaxed text-rb-500 sm:grid-cols-[max-content_1fr]"
        data-llamalend-terms=""
      >
        <dt className="font-semibold text-foreground">Mint market</dt>
        <dd>
          The crvUSD is minted against the loan by Curve&rsquo;s crvUSD system, up to the market&rsquo;s debt ceiling.
          The rate moves with crvUSD&rsquo;s price and the size of the Peg Stabilization Reserve. The interest goes to
          Curve: the Controller sends it to the factory&rsquo;s fee receiver, a splitter (
          <a
            href={explorerUrl(MAINNET_CHAIN_ID, "address", CRVUSD_FEE_SPLITTER)}
            target="_blank"
            rel="noopener noreferrer"
            className="link-external"
          >
            {shortAddress(CRVUSD_FEE_SPLITTER)}
          </a>
          ) that pays the scrvUSD savings vault and the DAO&rsquo;s fee collector, which distributes to veCRV lockers.
        </dd>
        <dt className="font-semibold text-foreground">Lend market</dt>
        <dd>
          The borrowed token is lent from a vault of lenders&rsquo; deposits, and all the interest goes to those
          lenders. The rate rises with the share of the vault that is lent
          {timeLinearMarkets > 0
            ? `; in ${timeLinearMarkets} markets the rate follows time alone, and their cards give the rule`
            : ""}
          .
        </dd>
        <dt className="font-semibold text-foreground">A</dt>
        <dd>The band width: each band spans about 1/A of its price (1% at A = 100).</dd>
        <dt className="font-semibold text-foreground">Loan discount</dt>
        <dd>
          Sets how much can be borrowed: the most a loan may draw is what its bands would hold with the price through
          their bottom, less this discount.
        </dd>
        <dt className="font-semibold text-foreground">Liquidation discount</dt>
        <dd>
          Sets when health reaches 0: health takes this smaller discount off the same value before comparing it with the
          debt. Below 0 anyone may liquidate the loan.
        </dd>
        <dt className="font-semibold text-foreground">Oracle</dt>
        <dd>The price the market&rsquo;s AMM uses for the collateral, in the borrowed token.</dd>
      </dl>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">V1 markets</h2>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {v1.map((m) => (
            <MarketCard
              key={m.controller}
              m={m}
              block={data.blockNumber}
              sharers={policyUsers.get(m.monetaryPolicy) ?? 1}
            />
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
              <MarketCard
                key={m.controller}
                m={m}
                block={data.blockNumber}
                sharers={policyUsers.get(m.monetaryPolicy) ?? 1}
              />
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
            empty or dust today, but the roster is read from the factories at head.
          </p>
        </section>
      )}

      <ProvenanceInfoTabs className="mt-6" />
    </ProvReceiptsScope>
  );
}
