// MakerDAO economics Explanation — the plain-language narration under the
// chain-truth tower, mirroring the V2 benchmark (trove-economics.tsx): a
// status-lead sentence plus bullets built straight from the tower's own data
// (computeMakerEconomics), never boilerplate.

import type { ReactNode } from "react";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { ChainTruthTowerData, TowerSideData } from "@/lib/shared/chain-truth-economics";
import { formatCompactUsd } from "@/components/shared/economics-chart-primitives";

const DUST = 1e-9;

const sideSymbol = (side: TowerSideData, fallback: string): string =>
  side.current[0]?.symbol ?? side.exited[0]?.symbol ?? side.liquidated[0]?.symbol ?? fallback;

// Maker is always valued (the OSM price), so every line carries a USD figure.
const fig = (usd: number): string => formatCompactUsd(usd);

const exitedTotal = (side: TowerSideData): number => side.exited.reduce((sum, l) => sum + (l.usd ?? 0), 0);

/** Explanation body for the MakerDAO tower — a lead sentence plus bullets
 *  derived from `data`. Returns null when there's nothing to narrate. */
export function makerdaoEconomicsExplanation(data: ChainTruthTowerData): ReactNode {
  const { collateral, debt } = data;
  const collSym = sideSymbol(collateral, "collateral");
  const debtSym = sideSymbol(debt, "DAI");
  const bullets: ReactNode[] = [];

  const collWithdrawn = exitedTotal(collateral);
  if (collateral.lifetimeInflow > DUST || collWithdrawn > DUST) {
    bullets.push(
      <span key="coll-flow">
        {collateral.lifetimeInflow > DUST && (
          <>
            {fig(collateral.lifetimeInflow)} of {collSym} deposited
          </>
        )}
        {collWithdrawn > DUST && (
          <>
            {collateral.lifetimeInflow > DUST ? ", " : ""}
            {fig(collWithdrawn)} withdrawn or moved to another vault
          </>
        )}
        {" over the vault's life."}
      </span>,
    );
  }

  const debtRepaid = exitedTotal(debt);
  if (debt.lifetimeInflow > DUST || debtRepaid > DUST) {
    bullets.push(
      <span key="debt-flow">
        {debt.lifetimeInflow > DUST && (
          <>
            {fig(debt.lifetimeInflow)} of {debtSym} generated
          </>
        )}
        {debtRepaid > DUST && (
          <>
            {debt.lifetimeInflow > DUST ? ", " : ""}
            {fig(debtRepaid)} repaid or moved out
          </>
        )}
        {" over the vault's life."}
      </span>,
    );
  }

  const collLiq = collateral.liquidated[0];
  const debtLiq = debt.liquidated[0];
  if (debtLiq || collLiq) {
    bullets.push(
      <span key="liquidated">
        {debtLiq && <>{fig(debtLiq.usd ?? 0)} of debt was cleared in liquidation</>}
        {collLiq && (
          <>
            {debtLiq ? ", seizing " : "Liquidation seized "}
            {fig(collLiq.usd ?? 0)} of {collSym} collateral
          </>
        )}
        .
      </span>,
    );
  }

  const fee = debt.interest;
  if (fee && fee.amount > DUST) {
    bullets.push(
      <span key="fee">
        An accrued stability fee of {fig(fee.usd ?? 0)} sits on top of the {fig(debt.current[0]?.usd ?? 0)} DAI
        principal — Maker's stability fee compounds into the debt via the ilk's own rate accumulator.
      </span>,
    );
  } else {
    bullets.push(
      <span key="fee-mechanic">
        Maker's stability fee compounds into the debt via the ilk's own rate accumulator — each vault belongs to one
        ilk, with its own liquidation ratio and fee rate.
      </span>,
    );
  }

  const collNow = collateral.current[0];
  const debtNow = debt.current[0];
  if (collNow || debtNow) {
    bullets.push(
      <span key="current">
        The vault currently holds {collNow ? fig(collNow.usd ?? 0) : `no ${collSym}`} backing{" "}
        {debtNow ? fig(debtNow.usd ?? 0) : "no debt"}.
      </span>,
    );
  } else if (bullets.length > 0) {
    bullets.push(<span key="closed">The vault is closed — no collateral or debt remain.</span>);
  }

  if (bullets.length === 0) return null;

  return (
    <div className="space-y-2 text-sm text-rb-500">
      <p className="leading-relaxed">
        These figures total this vault&apos;s lifetime flows on MakerDAO across every event in its captured history.
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
      "This panel replays the vault's own Vat events (frob, grab, fork) into lifetime flows, and reads its current ink (collateral) and art (normalized debt) live from the chain at the head block.",
    stepsHeading: "How the tower is built:",
    steps: [
      "Collateral deposited, withdrawn, generated and repaid debt are summed from the vault's own signed dink/dart deltas, event by event.",
      "Each historic debt delta is valued in DAI at the ilk's rate accumulator AS OF its own block, so the sum reflects what was actually owed at the time.",
      "The accrued stability fee is the gap between the current DAI debt (art × rate) and the normalized principal (art) — both read live off the Vat.",
      "USD values use Maker's own OSM price (the same price its liquidations act on).",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "The ilk",
        text: "each vault belongs to one collateral type (its ilk), which sets its own liquidation ratio and stability fee.",
      },
      {
        bold: "Stability fee",
        text: "interest accrues into the debt via the ilk's rate accumulator — principal (art) times rate gives the current DAI owed.",
      },
    ],
    links: [
      { label: "Vat — the core accounting", url: MAKER_DOCS.VAT },
      { label: "Rates module (stability fees)", url: MAKER_DOCS.RATES },
      { label: "Maker protocol docs", url: MAKER_DOCS.OVERVIEW },
    ],
  };
}
