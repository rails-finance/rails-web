// Frankencoin economics Explanation — the plain-language narration under the
// chain-truth tower, mirroring the V2 benchmark (trove-economics.tsx): a
// status-lead sentence plus bullets built straight from the tower's own data
// (computeFrankencoinEconomics), never boilerplate.

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { ChainTruthTowerData, TowerSideData } from "@/lib/shared/chain-truth-economics";
import { fmtFcColl, fmtZchf } from "@/lib/frankencoin/figures";
import { ProseExplainer } from "@/lib/shared/explainer-prose";
import { FC_SALE_LABEL } from "@/lib/frankencoin/economics";

const DUST = 1e-9;

const sideSymbol = (side: TowerSideData, fallback: string): string =>
  side.current[0]?.symbol ?? side.exited[0]?.symbol ?? side.liquidated[0]?.symbol ?? fallback;

// Frankencoin runs no oracle — always token mode, each figure at its unit's
// precision (lib/frankencoin/figures.ts), so the sentence states what the
// panel's compact rows round.
const fig = (amount: number, symbol: string): string =>
  `${symbol === "ZCHF" ? fmtZchf(amount) : fmtFcColl(amount)} ${symbol}`;

const sideTotal = (lines: TowerSideData["exited"]): number => lines.reduce((sum, l) => sum + l.amount, 0);

/** Explanation body for the Frankencoin tower — a lead sentence plus bullets
 *  derived from `data`. The mechanic behind the figures (gross debt, interest
 *  up front) is said here once; the panel above carries no second copy. */
export function frankencoinEconomicsExplanation(data: ChainTruthTowerData, hub?: "v1" | "v2"): ReactNode {
  const { collateral, debt } = data;
  const collSym = sideSymbol(collateral, "collateral");
  const bullets: ReactNode[] = [];

  const collWithdrawn = sideTotal(collateral.exited);
  const debtRepaid = sideTotal(debt.exited);
  const collNow = collateral.current[0];
  const debtNow = debt.current[0];
  const debtFlows = debt.lifetimeInflow > DUST || debtRepaid > DUST;
  const collFlows = collateral.lifetimeInflow > DUST || collWithdrawn > DUST;

  // Status lead: the debt's life in three figures (minted, repaid, owed now),
  // or the current figures alone where the flows are not drawn.
  const lead: ReactNode = debtFlows ? (
    <>
      Over its life this position minted {fig(debt.lifetimeInflow, "ZCHF")} of debt
      {debtRepaid > DUST && <> and repaid {fig(debtRepaid, "ZCHF")}</>}
      {debtNow ? <>; it owes {fig(debtNow.amount, "ZCHF")} now.</> : <>, and owes nothing now.</>}
    </>
  ) : debtNow || collNow ? (
    <>
      The position holds {collNow ? fig(collNow.amount, collSym) : `no ${collSym}`} and owes{" "}
      {debtNow ? fig(debtNow.amount, "ZCHF") : "nothing"}.
    </>
  ) : (
    <>The position is closed: no collateral or debt remain.</>
  );

  if (collFlows) {
    bullets.push(
      <span key="coll-flow">
        {collateral.lifetimeInflow > DUST && <>{fig(collateral.lifetimeInflow, collSym)} deposited</>}
        {collWithdrawn > DUST && (
          <>
            {collateral.lifetimeInflow > DUST ? ", " : ""}
            {fig(collWithdrawn, collSym)} withdrawn
          </>
        )}
        {collNow ? <>; {fig(collNow.amount, collSym)} held now.</> : <>.</>}
      </span>,
    );
  }

  const collAuctioned = collateral.liquidated[0];
  const debtAuctioned = debt.liquidated[0];
  if (collAuctioned || debtAuctioned) {
    const label = collAuctioned?.flowLabel ?? debtAuctioned?.flowLabel;
    const who =
      label === FC_SALE_LABEL.challenge.collateral || label === FC_SALE_LABEL.challenge.debt
        ? "A challenge sale"
        : label === FC_SALE_LABEL.forced.collateral || label === FC_SALE_LABEL.forced.debt
          ? "A forced sale after expiry"
          : "Auction sales";
    bullets.push(
      <span key="auction">
        {who} {who === "Auction sales" ? "have" : "has"} taken{" "}
        {collAuctioned && <>{fig(collAuctioned.amount, collSym)} of collateral</>}
        {collAuctioned && debtAuctioned && " and cleared "}
        {!collAuctioned && debtAuctioned && "cleared "}
        {debtAuctioned && <>{fig(debtAuctioned.amount, "ZCHF")} of debt</>}.
        {who === "A forced sale after expiry" ? (
          <> The opened Forced Sale row names the buyer, the price and where the ZCHF went.</>
        ) : who === "A challenge sale" && hub === "v2" ? (
          <> The opened Challenge Succeeded row names the bidder and where the ZCHF went.</>
        ) : null}
      </span>,
    );
  }

  bullets.push(
    <span key="gross">
      The debt is gross: each mint adds its whole amount, and the wallet receives it less the reserve share and the
      interest for the remaining term, both taken at minting. Nothing accrues afterwards, so the debt moves only when
      the owner mints or repays. An opened Mint or Repay event shows the split.
    </span>,
  );

  if (collFlows && debtFlows) {
    bullets.push(
      <span key="units">
        Frankencoin has no price oracle, so the two bars stay in their own units, {collSym} and ZCHF, and are not drawn
        to one scale.
      </span>,
    );
  }

  return <ProseExplainer paragraph={lead} items={bullets} />;
}

const FRANKENCOIN_DOC_URL = "https://docs.frankencoin.com";

/** The tower's "?" FAQ for Frankencoin. */
export function frankencoinEconomicsContent(): LearnMoreContent {
  return {
    title: "About Lifetime Flows",
    intro:
      "This panel adds up every change the position's own events record: collateral deposited and withdrawn on one side, ZCHF minted and repaid on the other, and what is held and owed now. Frankencoin has no price oracle, so each side stays in its own unit.",
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Gross debt",
        text: "a mint adds its whole amount to the debt. The wallet receives it less the position's reserve share and the interest for the remaining term.",
        sources: [{ label: "what a mint pays out", url: `${FRANKENCOIN_DOC_URL}/positions/adjust` }],
      },
      {
        bold: "Interest up front",
        text: "interest for the remaining term is paid at each mint, at the rate in force then, and is not returned; nothing accrues afterwards.",
        sources: [{ label: "interest on positions", url: `${FRANKENCOIN_DOC_URL}/positions` }],
      },
      {
        bold: "Reserve share",
        text: "the reserve share of each mint stays in the system reserve and is released on repayment: in full while the reserve covers every position's share, in proportion when losses have drawn it down.",
        sources: [{ label: "the reserve", url: `${FRANKENCOIN_DOC_URL}/reserve` }],
      },
      {
        bold: "Sales",
        text: "collateral sold and debt cleared by a challenge sale (phase 2 of a challenge) or a forced sale after expiry are counted apart from the owner's own withdrawals and repayments. Frankencoin has no liquidation.",
        sources: [{ label: "challenges and sales", url: `${FRANKENCOIN_DOC_URL}/positions/auctions` }],
      },
    ],
    links: [{ label: "Frankencoin docs", url: FRANKENCOIN_DOC_URL }],
  };
}
