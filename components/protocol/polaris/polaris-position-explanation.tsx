"use client";

// Plain-language explanation of a Polaris CDP — a subject-first status lead
// (what it holds and owes) followed by bullets, each an independent fact: the
// ratio against the minimum in force, the equity at the feed, the rate, the
// pending legs, the market's mode, the holder, and the one thing every reader
// must know — that this is the Sepolia testnet. On a closed or liquidated CDP
// the lead states nothing remains and the lifetime bullet states the summed
// ledger instead. Built straight from the CDP's own head state (open) or the
// index's summed ledger (terminal).
//
// Under the explanation-copy charter: the pane says only what the figures
// MEAN. No slot or method names, no how-we-know — the receipt one inspector
// click away owns that. Third person throughout; only the mode present is
// described.
//
// NO P&L, NO PERCENTAGE, NO COLOUR on the equity figure: Rails states a
// valuation at the block, in words, never a profit — see the position card's
// "Equity at the feed" stat, which this bullet echoes.

import { Fragment, type ReactNode } from "react";
import type { PolarisChainResponse } from "@/lib/api/fetch-polaris-position";
import type { PolarisLifetime } from "@/lib/polaris/economics";
import { lifetimeLegProv, type PolarisLifetimeLeg } from "@/lib/polaris/event-provenance";
import { liveEntireProv, liveEquityProv, livePethInDebtProv } from "@/lib/polaris/live-provenance";
import { PETH } from "@/lib/polaris/asset-catalog";
import { Prov } from "@/components/shared/provenance";
import { formatExact, formatNumber, formatUnitsExact, withRealMinus } from "@/lib/utils/format";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { AmountText } from "@/components/shared/amount-text";

const pct = (f: number): string => `${(f * 100).toFixed(1)}%`;
const signedNum = (n: number): string => (n < 0 ? `−${formatNumber(-n)}` : formatNumber(n));

/** Two clauses joined by "and" — the only arity this pane's omissible pairs
 *  ever need (deposited/withdrawn, borrowed/repaid). */
function joinAnd(nodes: ReactNode[]): ReactNode | null {
  if (nodes.length === 0) return null;
  if (nodes.length === 1) return nodes[0];
  return (
    <>
      {nodes[0]} and {nodes[1]}
    </>
  );
}

export function PolarisPositionExplanation({
  chain,
  stableSymbol,
  terminal,
  lifetime,
  eventCount,
  transferCount,
}: {
  chain: PolarisChainResponse;
  stableSymbol: string;
  /** The index's terminal word for a burned CDP — "closed" or "liquidated". */
  terminal?: "closed" | "liquidated" | null;
  /** The CDP's summed ledger over its whole life (lib/polaris/economics.ts,
   *  polarisLifetime) — null while the index hasn't answered, or on an open
   *  CDP the lifetime bullet has no use for. */
  lifetime?: PolarisLifetime | null;
  eventCount?: number;
  transferCount?: number;
}) {
  const hasColl = chain.entireColl > 0;
  const hasDebt = chain.entireDebt > 0;
  const mcr = chain.defensiveMode ? chain.defensiveMcr : chain.mcr;

  const lead: React.ReactNode = !chain.isOpen ? (
    terminal === "liquidated" ? (
      <>This CDP was liquidated and holds nothing now.</>
    ) : (
      <>This CDP is closed and holds nothing now.</>
    )
  ) : hasColl && hasDebt ? (
    <>
      This CDP holds{" "}
      <H>
        <AmountText value={chain.entireColl} /> pETH
      </H>{" "}
      of collateral and owes{" "}
      <H>
        <AmountText value={chain.entireDebt} /> {stableSymbol}
      </H>
      :
    </>
  ) : hasColl ? (
    <>
      This CDP holds{" "}
      <H>
        <AmountText value={chain.entireColl} /> pETH
      </H>{" "}
      of collateral and has no debt:
    </>
  ) : null;

  const bullets: React.ReactNode[] = [];

  if (chain.isOpen && chain.icr != null) {
    const below = chain.icr < mcr;
    bullets.push(
      <span key="ratio">
        Its collateral ratio is <H>{pct(chain.icr)}</H> against a minimum of <H>{pct(mcr)}</H>
        {chain.defensiveMode ? " — the higher floor the market applies in defensive mode" : ""}.{" "}
        {below
          ? "It sits below that line, so anyone may liquidate it."
          : "It sits above that line; a fall in pETH's price toward it is what would expose it to liquidation."}
      </span>,
    );
  }

  if (chain.isOpen && chain.price && hasColl) {
    const pethInDebt = chain.price.pethInDebt;
    const collWorth = chain.entireColl * pethInDebt;
    const equity = collWorth - chain.entireDebt;
    const equityExact = withRealMinus(formatExact(equity));
    bullets.push(
      <span key="value">
        At the feed&rsquo;s price of{" "}
        <Prov info={livePethInDebtProv(chain.market)} value={formatExact(pethInDebt)} symbol={stableSymbol}>
          <H>
            <AmountText value={pethInDebt} /> {stableSymbol}
          </H>
        </Prov>{" "}
        per pETH, the CDP&rsquo;s{" "}
        <Prov
          echo
          info={liveEntireProv("coll", chain.market)}
          value={formatUnitsExact(chain.entireCollRaw, 18)}
          symbol={PETH.symbol}
        >
          <H>
            <AmountText value={chain.entireColl} /> pETH
          </H>
        </Prov>{" "}
        is worth{" "}
        <H>
          <AmountText value={collWorth} /> {stableSymbol}
        </H>{" "}
        against{" "}
        <Prov
          echo
          info={liveEntireProv("debt", chain.market)}
          value={formatUnitsExact(chain.entireDebtRaw, 18)}
          symbol={stableSymbol}
        >
          <H>
            <AmountText value={chain.entireDebt} /> {stableSymbol}
          </H>
        </Prov>{" "}
        owed, an equity of{" "}
        <Prov echo info={liveEquityProv(chain.market)} value={equityExact} symbol={stableSymbol}>
          <H>
            {signedNum(equity)} {stableSymbol}
          </H>
        </Prov>
        . The feed is the protocol&rsquo;s own price for pETH: the bonding curve&rsquo;s price in ETH times an ETH/USD
        price
        {chain.market === "goldp" ? ", divided by a gold price," : ""} that the protocol&rsquo;s medianiser takes as the
        median of its oracles. The equity is a valuation at this block, not a profit, and moves with the feed and the
        pending legs. A profit or loss would need a price for each of the holder&rsquo;s deposits (a basis), which the
        chain does not state.
      </span>,
    );
  }

  if (!chain.isOpen && terminal && lifetime && lifetime.rows > 0) {
    const legMoney = (leg: PolarisLifetimeLeg, unit: string, value: number): ReactNode => (
      <Prov info={lifetimeLegProv(leg, unit, chain.market)} value={formatExact(value)} symbol={unit}>
        <H>
          <AmountText value={value} /> {unit}
        </H>
      </Prov>
    );

    const collParts: ReactNode[] = [];
    if (lifetime.deposited > 0) collParts.push(<>deposited {legMoney("deposited", "pETH", lifetime.deposited)}</>);
    if (lifetime.withdrawn > 0) collParts.push(<>withdrew {legMoney("withdrawn", "pETH", lifetime.withdrawn)}</>);
    const collClause = joinAnd(collParts);

    const debtParts: ReactNode[] = [];
    if (lifetime.borrowed > 0) debtParts.push(<>borrowed {legMoney("borrowed", stableSymbol, lifetime.borrowed)}</>);
    if (lifetime.repaid > 0) debtParts.push(<>repaid {legMoney("repaid", stableSymbol, lifetime.repaid)}</>);
    const debtClause = joinAnd(debtParts);

    const openClauses = [collClause, debtClause].filter((c) => c != null) as ReactNode[];

    const interestClause: ReactNode | null =
      lifetime.interestCharged > 0 ? (
        <>{legMoney("interest charged", stableSymbol, lifetime.interestCharged)} of interest was charged</>
      ) : null;

    const psmAddedParts: ReactNode[] = [];
    if (lifetime.collFromPsm > 0) psmAddedParts.push(legMoney("pETH from PSM mints", "pETH", lifetime.collFromPsm));
    if (lifetime.debtFromPsm > 0)
      psmAddedParts.push(legMoney("debt from PSM mints", stableSymbol, lifetime.debtFromPsm));
    const psmAdded: ReactNode | null =
      psmAddedParts.length > 0 ? (
        <>
          added{" "}
          {psmAddedParts.map((n, i) => (
            <Fragment key={i}>
              {i > 0 ? " / " : ""}
              {n}
            </Fragment>
          ))}
        </>
      ) : null;

    const psmRemovedParts: ReactNode[] = [];
    if (lifetime.collToPsm > 0) psmRemovedParts.push(legMoney("pETH to PSM redemptions", "pETH", lifetime.collToPsm));
    if (lifetime.debtToPsm > 0)
      psmRemovedParts.push(legMoney("debt cleared by PSM redemptions", stableSymbol, lifetime.debtToPsm));
    const psmRemoved: ReactNode | null =
      psmRemovedParts.length > 0 ? (
        <>
          removed{" "}
          {psmRemovedParts.map((n, i) => (
            <Fragment key={i}>
              {i > 0 ? " / " : ""}
              {n}
            </Fragment>
          ))}
        </>
      ) : null;

    const psmClause: ReactNode | null =
      psmAdded || psmRemoved ? (
        <>
          its pro-rata shares of the PSM&rsquo;s mints and redemptions {psmAdded}
          {psmAdded && psmRemoved ? " and " : ""}
          {psmRemoved}
        </>
      ) : null;

    const secondClauses = [interestClause, psmClause].filter((c) => c != null) as ReactNode[];

    const lead1: ReactNode | null =
      openClauses.length > 0 || secondClauses.length > 0 ? (
        <>
          Over its life the holder{" "}
          {openClauses.map((c, i) => (
            <Fragment key={`o${i}`}>
              {i > 0 ? ", " : ""}
              {c}
            </Fragment>
          ))}
          {openClauses.length > 0 && secondClauses.length > 0 ? "; " : ""}
          {secondClauses.map((c, i) => (
            <Fragment key={`s${i}`}>
              {i > 0 ? " and " : ""}
              {c}
            </Fragment>
          ))}
          .
        </>
      ) : null;

    const liqSentence: ReactNode | null =
      terminal === "liquidated" && (lifetime.collLiquidated > 0 || lifetime.debtLiquidated > 0) ? (
        <>
          {" "}
          The liquidation seized {legMoney("collateral liquidated", "pETH", lifetime.collLiquidated)} and cleared{" "}
          {legMoney("debt liquidated", stableSymbol, lifetime.debtLiquidated)} of debt.
        </>
      ) : null;

    bullets.push(
      <span key="lifetime">
        {lead1}
        {liqSentence} The difference in each unit is the realised outcome. One figure across the two units would need a
        price for each flow at its own block (a basis), which the feed series can supply once one is chosen.
      </span>,
    );
  }

  if (chain.isOpen && hasDebt) {
    bullets.push(
      <span key="rate">
        Interest on its debt runs at <H>{(chain.interestRate * 100).toFixed(2)}%</H> a year, set by the market: a
        primary rate of {(chain.primaryRate * 100).toFixed(2)}%, which rises when traders redeem through the PSM and
        falls when they mint, plus a secondary rate of {(chain.secondaryRate * 100).toFixed(2)}%, which rises with the
        market&rsquo;s debt-to-reserve ratio. It is written into the debt at each touch
        {/* The card's Costs figure, said in words and on the same base: the
            debt as recorded, which is what the contract accrues on. */}
        {chain.recordedDebt > 0 ? (
          <>
            {": about "}
            <H>
              <AmountText value={chain.recordedDebt * chain.interestRate} />
            </H>{" "}
            {stableSymbol} a year on the <AmountText value={chain.recordedDebt} /> {stableSymbol} recorded at the last
            touch
          </>
        ) : null}
        .
      </span>,
    );
  }

  if (chain.isOpen) {
    const pending: ReactNode[] = [];
    if (chain.accruedInterest > 0)
      pending.push(
        <>
          <AmountText value={chain.accruedInterest} /> {stableSymbol} of interest to be charged
        </>,
      );
    if (chain.accruedStables > 0)
      pending.push(
        <>
          <AmountText value={chain.accruedStables} /> {stableSymbol} of stability gains to be credited against the debt
          (its share of the secondary-rate interest the market&rsquo;s CDPs pay, in proportion to its collateral)
        </>,
      );
    if (chain.bcTokenGain > 0)
      pending.push(
        <>
          <AmountText value={chain.bcTokenGain} /> pETH of reward to be added to the collateral (its share of the pETH
          yield Polaris pays minters, in proportion to its debt)
        </>,
      );
    const psmDebt = chain.mintRedeemDebtChange;
    if (chain.mintRedeemCollChange !== 0 || psmDebt !== 0)
      pending.push(
        <>
          {psmDebt < 0 ? "a PSM redemption share of " : psmDebt > 0 ? "a PSM mint share of " : "a PSM share of "}
          {signedNum(chain.mintRedeemCollChange)} pETH and {signedNum(psmDebt)} {stableSymbol}
        </>,
      );
    if (pending.length > 0) {
      bullets.push(
        <span key="pending">
          A touch is any transaction on the CDP, and each one writes in what is pending. Since its last touch it has{" "}
          {pending.map((n, i) => (
            <Fragment key={i}>
              {i > 0 ? (i === pending.length - 1 ? " and " : ", ") : ""}
              {n}
            </Fragment>
          ))}
          .
        </span>,
      );
    }
  }

  // What the PSM is, said once, wherever the card has named a PSM share: a
  // pending one on an open CDP, or a settled one in a closed CDP's lifetime.
  const psmNamed = chain.isOpen
    ? chain.mintRedeemCollChange !== 0 || chain.mintRedeemDebtChange !== 0
    : !!(
        terminal &&
        lifetime &&
        (lifetime.collFromPsm > 0 || lifetime.debtFromPsm > 0 || lifetime.collToPsm > 0 || lifetime.debtToPsm > 0)
      );
  if (psmNamed) {
    bullets.push(
      <span key="psm">
        The PSM is the protocol&rsquo;s peg module: a trader mints {stableSymbol} there directly against pETH, or
        redeems {stableSymbol} for pETH. Unlike a Liquity redemption, nobody picks a CDP: every open CDP in the market
        takes a pro-rata share. A mint share raises its debt and collateral, a redemption share lowers both, and the
        trade&rsquo;s fees go to the CDPs.
      </span>,
    );
  }

  bullets.push(
    <span key="mode">
      The market is in {chain.defensiveMode ? "defensive" : "normal"} mode: its reserve-to-debt ratio, the
      protocol&rsquo;s measure of the market&rsquo;s backing against its debt, is {chain.reserveToDebtRatio.toFixed(2)}.
      {chain.defensiveMode
        ? " That is below 1.10, so the minimum ratio is 150% until it recovers, and a CDP may borrow more or withdraw only if it stays at 150% or above."
        : " Below 1.10 the market would enter defensive mode, where the minimum ratio rises to 150%."}
    </span>,
  );

  if (chain.isOpen && chain.owner) {
    bullets.push(
      <span key="holder">
        The CDP is an NFT; its current holder is the address on the card
        {transferCount != null && transferCount > 0
          ? `, reached through ${transferCount} transfer${transferCount === 1 ? "" : "s"} since the open`
          : ""}
        .
      </span>,
    );
  }

  if (eventCount != null && eventCount > 0) {
    bullets.push(
      <span key="touches">
        It has been touched {eventCount} time{eventCount === 1 ? "" : "s"} since it opened.
      </span>,
    );
  }

  bullets.push(
    <span key="testnet">
      Every figure here is a Sepolia testnet figure: the tokens are test tokens and the prices come from the
      protocol&rsquo;s own testnet medianisers.
    </span>,
  );

  return <ProseExplainer paragraph={lead} items={bullets} />;
}
