// MakerDAO economics Explanation — the plain-language narration under the
// chain-truth tower, mirroring the V2 benchmark (trove-economics.tsx): a
// status-lead sentence plus bullets built straight from the tower's own data
// (computeMakerEconomics), never boilerplate.

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { TowerSideData } from "@/lib/shared/chain-truth-economics";
import type { MakerTowerData } from "@/lib/makerdao/economics";
import { formatCompactUsd } from "@/components/shared/economics-chart-primitives";
import { formatNumber, formatPrice } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";
import type { MakerCollateralLeg } from "@/lib/makerdao/economics";

const usd0 = (n: number): string => `$${Math.round(n).toLocaleString("en-US")}`;
const px = (n: number): string =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const LEG_VERB: Record<MakerCollateralLeg["kind"], string> = {
  deposited: "deposit",
  returned: "return by auction",
  withdrawn: "withdrawal",
  liquidated: "liquidation",
};

/** Up to four legs by name; more as a count and a price range. */
function legSummary(legs: MakerCollateralLeg[], noun: string): ReactNode {
  if (legs.length <= 4) return legList(legs);
  const prices = legs.map((l) => l.price).filter((p): p is number => p != null);
  return (
    <>
      {legs.length} {noun} between {formatDate(legs[0].at)} and {formatDate(legs[legs.length - 1].at)}, at{" "}
      {px(Math.min(...prices))} to {px(Math.max(...prices))}
    </>
  );
}

/** "the 23 Jun 2021 deposit at $33,650.01" for each leg, joined. */
function legList(legs: MakerCollateralLeg[]): ReactNode {
  return legs.map((l, i) => (
    <span key={i}>
      {i > 0 ? (i === legs.length - 1 ? " and " : ", ") : ""}
      the {formatDate(l.at)} {LEG_VERB[l.kind]} at {l.price != null ? px(l.price) : "no price"}
    </span>
  ));
}

const DUST = 1e-9;

const sideSymbol = (side: TowerSideData, fallback: string): string =>
  side.current[0]?.symbol ?? side.exited[0]?.symbol ?? side.liquidated[0]?.symbol ?? fallback;

// Maker is always valued (the OSM price), so every line carries a USD figure.
const fig = (usd: number): string => formatCompactUsd(usd);

const exitedTotal = (side: TowerSideData): number => side.exited.reduce((sum, l) => sum + (l.usd ?? 0), 0);

/** Explanation body for the MakerDAO tower — a lead sentence plus bullets
 *  derived from `data`. Every USD figure names the price it is valued at.
 *  Returns null when there's nothing to narrate. */
export function makerdaoEconomicsExplanation(data: MakerTowerData): ReactNode {
  const { collateral, debt } = data;
  const collSym = data.collateralSymbol ?? sideSymbol(collateral, "collateral");
  const debtSym = sideSymbol(debt, "DAI");
  const atEvents = data.flowsPricedAtEvents === true;
  const now = data.priceNow;
  const nowText = now != null ? `today's OSM price of $${formatPrice(now)}` : "today's OSM price";
  const bullets: ReactNode[] = [];

  const collWithdrawn = exitedTotal(collateral);
  const returned = (collateral.received ?? []).reduce((t, l) => t + (l.usd ?? 0), 0);
  if (collateral.lifetimeInflow > DUST || collWithdrawn > DUST) {
    bullets.push(
      <span key="coll-flow">
        {collateral.lifetimeInflow > DUST && (
          <>
            {fig(collateral.lifetimeInflow)} of {collSym} deposited
          </>
        )}
        {returned > DUST && <>, {fig(returned)} returned by a liquidation auction</>}
        {collWithdrawn > DUST && (
          <>
            {collateral.lifetimeInflow > DUST ? ", " : ""}
            {fig(collWithdrawn)} withdrawn
          </>
        )}
        {atEvents ? ", each valued at the OSM price at its own block." : `, valued at ${nowText}.`}
      </span>,
    );
  }

  for (const n of data.netted ?? []) {
    bullets.push(
      <span key={`netted-${n.at}`}>
        {formatNumber(n.amount)} {collSym} deposited and withdrawn in the same transaction on {formatDate(n.at)} is left
        out of both rows.
      </span>,
    );
  }

  // The returned collateral and its withdrawal are the same coins.
  const legs = data.legs ?? [];
  const retLeg = legs.find((l) => l.kind === "returned");
  const outLeg = legs.find((l) => l.leftoverOut);
  if (retLeg && outLeg && retLeg.price != null && outLeg.price != null) {
    bullets.push(
      <span key="returned-pair">
        Returned by auction and the matching Withdrawn are the same {formatNumber(retLeg.amount)} {collSym}:{" "}
        {usd0(retLeg.amount * retLeg.price)} at the OSM price when it came back ({px(retLeg.price)}) and{" "}
        {usd0(outLeg.amount * outLeg.price)} when the owner took it out ({px(outLeg.price)}).
      </span>,
    );
  }

  const debtRepaid = exitedTotal(debt);
  if (debt.lifetimeInflow > DUST || debtRepaid > DUST) {
    bullets.push(
      <span key="debt-flow">
        {debt.lifetimeInflow > DUST && (
          <>
            {fig(debt.lifetimeInflow)} of {debtSym} drawn
          </>
        )}
        {debtRepaid > DUST && (
          <>
            {debt.lifetimeInflow > DUST ? ", " : ""}
            {fig(debtRepaid)} repaid
          </>
        )}{" "}
        over the vault&apos;s life, at $1 a {debtSym}.
      </span>,
    );
  }

  const collLiq = collateral.liquidated[0];
  const debtLiq = debt.liquidated[0];
  if (debtLiq || collLiq) {
    bullets.push(
      <span key="liquidated">
        Liquidation cleared {debtLiq ? fig(debtLiq.usd ?? 0) : "the"} of debt
        {collLiq && (
          <>
            {" "}
            and seized {formatNumber(collLiq.amount)} {collSym}, worth {fig(collLiq.usd ?? 0)}
            {atEvents ? " at the OSM price then" : ` at ${nowText}`}
            {atEvents && data.liquidatedNowUsd != null ? (
              <>
                {" "}
                and {fig(data.liquidatedNowUsd)} at {nowText}
              </>
            ) : null}
          </>
        )}
        .
      </span>,
    );
  }

  if (collateral.priceChange && collateral.priceChange.usd != null) {
    const c = collateral.priceChange.usd;
    const holdsNothing = collateral.current.every((l) => (l.usd ?? 0) < 0.5);
    const ins = legs.filter((l) => l.kind === "deposited" || l.kind === "returned");
    const outs = legs.filter((l) => l.kind === "withdrawn" || l.kind === "liquidated");
    bullets.push(
      holdsNothing && ins.length > 0 && outs.length > 0 ? (
        <span key="price-change">
          Price change {c < 0 ? "−" : "+"}
          {usd0(Math.abs(c))}: the vault holds nothing now, so this is the difference between the collateral valued at
          the prices it came in at ({legSummary(ins, "moves in")}) and at the prices it left at (
          {legSummary(outs, "moves out")}).
        </span>
      ) : (
        <span key="price-change">
          Price change {c < 0 ? "−" : "+"}
          {fig(Math.abs(c))}: {collSym}&apos;s price {c < 0 ? "fell" : "rose"} between the events and today, so the
          collateral held is worth {c < 0 ? "less" : "more"} than the flows above add up to.
        </span>
      ),
    );
  }

  if (data.lifetimeInterest != null && data.lifetimeInterest > DUST) {
    const owed = data.feeOwed ?? 0;
    const liq = data.feeLiquidated ?? 0;
    const repaid = Math.max(0, data.lifetimeInterest - owed - liq);
    const parts: ReactNode[] = [];
    if (owed > DUST) parts.push(<>{fig(owed)} is in today&apos;s debt</>);
    if (repaid > DUST) parts.push(<>{fig(repaid)} was paid inside repayments</>);
    if (liq > DUST) parts.push(<>{fig(liq)} was part of the debt the liquidation cleared</>);
    bullets.push(
      <span key="interest-accrued">
        {fig(data.lifetimeInterest)} of stability fee over the vault&apos;s life: the {debtSym} owed now less every{" "}
        {debtSym} drawn net of repayments and liquidations
        {parts.length > 0 ? (
          <>
            {"; "}
            {parts.map((p, i) => (
              <span key={i}>
                {i > 0 ? (i === parts.length - 1 ? " and " : ", ") : null}
                {p}
              </span>
            ))}
          </>
        ) : null}
        .
      </span>,
    );
  }

  const collNow = collateral.current[0];
  const debtNow = debt.current[0];
  if (collNow || debtNow) {
    bullets.push(
      <span key="current">
        The vault holds{" "}
        {collNow ? (
          <>
            {fig(collNow.usd ?? 0)} of {collSym} at {nowText}
          </>
        ) : (
          `no ${collSym}`
        )}{" "}
        against {debtNow ? <>{fig((debtNow.usd ?? 0) + (debt.interest?.usd ?? 0))} of debt</> : "no debt"}.
      </span>,
    );
  } else if (bullets.length > 0) {
    bullets.push(<span key="closed">The vault is closed — no collateral or debt remain.</span>);
  }

  if (bullets.length === 0) return null;

  return (
    <div className="space-y-2 text-sm text-rb-500">
      <p className="leading-relaxed">
        These figures total every event of this vault on MakerDAO. They are rounded; hover a figure for its exact value.
      </p>
      {bullets.map((item, i) => (
        <div key={i} className="flex items-start gap-2 leading-relaxed">
          <span className="select-none text-rb-500">•</span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

const MAKER_DOCS = {
  VAT: "https://docs.makerdao.com/smart-contract-modules/core-module/vat-detailed-documentation",
  RATES: "https://docs.makerdao.com/smart-contract-modules/rates-module",
  OVERVIEW: "https://docs.makerdao.com/",
} as const;

/** The tower's "?" FAQ for MakerDAO. */
export function makerdaoEconomicsContent(): LearnMoreContent {
  return {
    title: "About the Economics",
    intro:
      "This panel adds up everything the vault's events moved: collateral in and out on the left, DAI drawn and repaid on the right, with what the vault holds and owes today at the bottom of each side.",
    stepsHeading: "How the figures are valued:",
    steps: [
      "Collateral flows are valued at Maker's oracle (OSM) price at each event's block when the page has read every one of them; otherwise at today's OSM price, and the explanation says which.",
      "What the vault holds is valued at today's OSM price. The difference between the two is the Price change row.",
      "DAI is counted at $1. Each draw and repayment is the DAI minted or burned at the time.",
      "The stability fee owed is the debt less the DAI drawn since the vault last owed nothing; the all-time fee row adds the fee already paid inside repayments or cleared by a liquidation.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "The collateral type",
        text: "each vault belongs to one collateral type (ETH-A, ETH-C, …), which sets its own minimum ratio and stability fee.",
      },
      {
        bold: "Stability fee",
        text: "a yearly rate governance sets per collateral type, added to the debt continuously rather than billed.",
      },
    ],
    links: [
      { label: "Vat — the core accounting", url: MAKER_DOCS.VAT },
      { label: "Rates module (stability fees)", url: MAKER_DOCS.RATES },
      { label: "Maker protocol docs", url: MAKER_DOCS.OVERVIEW },
    ],
  };
}
