// Polaris economics Explanation — the plain-language narration under the
// tower, built straight from the tower's own data (computePolarisEconomics):
// a lead sentence plus bullets, never boilerplate. Third person; native units.

import type { ReactNode } from "react";
import { POLARIS_APP_LINK, POLARIS_DOC_LINKS } from "@/lib/polaris/docs-links";
import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { ChainTruthTowerData, TowerLine, TowerSideData } from "@/lib/shared/chain-truth-economics";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { formatCompact, formatExact } from "@/lib/utils/format";
import type { PolarisLifetime } from "./economics";

const DUST = 1e-9;

const fig = (amount: number, symbol: string): string => `${formatCompact(amount)} ${symbol}`;
const total = (lines: TowerLine[]): number => lines.reduce((sum, l) => sum + l.amount, 0);
const byKey = (side: TowerSideData, key: string): number =>
  [...side.exited, ...side.liquidated, ...(side.received ?? []), ...(side.costs ?? [])].find((l) => l.key === key)
    ?.amount ?? 0;

const signedText = (n: number, unit: string): string => `${n >= 0 ? "+" : "−"}${formatCompact(Math.abs(n))} ${unit}`;

/** Whether this CDP has any PSM-share activity worth a sentence — either kind
 *  of share priced at settle, or a share row still waiting on a price. */
function hasPsmOutcome(lifetime: PolarisLifetime): boolean {
  return (
    Math.abs(lifetime.psmRedemptionEffectAtSettle) > DUST ||
    Math.abs(lifetime.psmMintEffectAtSettle) > DUST ||
    lifetime.psmRowsUnpriced > 0
  );
}

/** The one sentence describing the PSM's effect on this CDP's equity — the
 *  bullet below, the rowExtra strip's plain text and the markdown export all
 *  state it with these same words, so the figure never reads two ways. */
export function polarisPsmOutcomeSentence(
  lifetime: PolarisLifetime,
  stable: string,
  pethInDebt?: number,
): string | null {
  if (!hasPsmOutcome(lifetime)) return null;
  const hasRedemption = Math.abs(lifetime.psmRedemptionEffectAtSettle) > DUST;
  const hasMint = Math.abs(lifetime.psmMintEffectAtSettle) > DUST;
  const netCollLeg = lifetime.collFromPsm - lifetime.collToPsm;
  const netDebtLeg = lifetime.debtFromPsm - lifetime.debtToPsm;
  const todayEffect = pethInDebt != null ? netCollLeg * pethInDebt - netDebtLeg : null;

  let s =
    `The PSM's shares, valued at the feed at each settling block, changed the CDP's equity by ` +
    `${signedText(lifetime.psmEffectAtSettle, stable)}`;
  if (hasRedemption && hasMint) {
    s += ` (redemption shares ${signedText(lifetime.psmRedemptionEffectAtSettle, stable)}, mint shares ${signedText(lifetime.psmMintEffectAtSettle, stable)})`;
  }
  if (todayEffect != null) {
    s += `; at today's feed the same legs come to ${signedText(todayEffect, stable)}`;
  }
  if (lifetime.psmRowsUnpriced > 0) {
    s += ` (${lifetime.psmRowsUnpriced} rows carry no price yet)`;
  }
  return `${s}.`;
}

/** Explanation body for the Polaris tower. Returns null when there is nothing
 *  to narrate. `lifetime` and `pethInDebt` are optional — the PSM-outcome
 *  bullet is simply omitted without them (the position card's own live
 *  overlay is what supplies `pethInDebt`; a page with no chain lane yet
 *  still narrates every other bullet). */
export function polarisEconomicsExplanation(
  data: ChainTruthTowerData,
  lifetime?: PolarisLifetime | null,
  pethInDebt?: number,
): ReactNode {
  const { collateral, debt } = data;
  const collSym = data.collateralUnit ?? "pETH";
  const stable = data.debtUnit ?? "stablecoin";
  const bullets: ReactNode[] = [];

  const withdrawn = byKey(collateral, "coll-withdrawn");
  if (collateral.lifetimeInflow > DUST || withdrawn > DUST) {
    bullets.push(
      <span key="coll-flow">
        {collateral.lifetimeInflow > DUST && <>{fig(collateral.lifetimeInflow, collSym)} deposited</>}
        {withdrawn > DUST && (
          <>
            {collateral.lifetimeInflow > DUST ? ", " : ""}
            {fig(withdrawn, collSym)} withdrawn
          </>
        )}
        {" by the holder over the CDP's life."}
      </span>,
    );
  }

  const repaid = byKey(debt, "debt-repaid");
  if (debt.lifetimeInflow > DUST || repaid > DUST) {
    bullets.push(
      <span key="debt-flow">
        {debt.lifetimeInflow > DUST && <>{fig(debt.lifetimeInflow, stable)} borrowed</>}
        {repaid > DUST && (
          <>
            {debt.lifetimeInflow > DUST ? ", " : ""}
            {fig(repaid, stable)} repaid
          </>
        )}
        {" by the holder."}
      </span>,
    );
  }

  const interest = byKey(debt, "debt-interest-charged");
  const gains = byKey(debt, "debt-stable-gains");
  const reward = byKey(collateral, "coll-reward");
  if (interest > DUST || gains > DUST || reward > DUST) {
    bullets.push(
      <span key="protocol-legs">
        {interest > DUST && <>{fig(interest, stable)} of interest was charged into the debt at its touches</>}
        {gains > DUST && (
          <>
            {interest > DUST ? "; " : ""}
            {fig(gains, stable)} of stability gains was credited against it
          </>
        )}
        {reward > DUST && (
          <>
            {interest > DUST || gains > DUST ? "; " : ""}
            {fig(reward, collSym)} of reward pETH was added to the collateral
          </>
        )}
        .
      </span>,
    );
  }

  const psmCollIn = byKey(collateral, "coll-from-psm");
  const psmCollOut = byKey(collateral, "coll-to-psm");
  const psmDebtIn = byKey(debt, "debt-from-psm");
  const psmDebtOut = byKey(debt, "debt-to-psm");
  if (psmCollIn + psmCollOut + psmDebtIn + psmDebtOut > DUST) {
    bullets.push(
      <span key="psm">
        The market&rsquo;s PSM activity moved this CDP&rsquo;s share pro rata:{" "}
        {psmCollIn > DUST && <>{fig(psmCollIn, collSym)} in</>}
        {psmCollOut > DUST && (
          <>
            {psmCollIn > DUST ? " and " : ""}
            {fig(psmCollOut, collSym)} out
          </>
        )}
        {psmCollIn + psmCollOut > DUST && " on the collateral side"}
        {psmDebtIn + psmDebtOut > DUST && psmCollIn + psmCollOut > DUST && ", "}
        {psmDebtIn > DUST && <>{fig(psmDebtIn, stable)} added</>}
        {psmDebtOut > DUST && (
          <>
            {psmDebtIn > DUST ? " and " : ""}
            {fig(psmDebtOut, stable)} cleared
          </>
        )}
        {psmDebtIn + psmDebtOut > DUST && " on the debt side"}.
      </span>,
    );
  }

  const collLiq = total(collateral.liquidated);
  const debtLiq = total(debt.liquidated);
  if (collLiq > DUST || debtLiq > DUST) {
    bullets.push(
      <span key="liquidation">
        A liquidation took {collLiq > DUST && fig(collLiq, collSym)}
        {collLiq > DUST && debtLiq > DUST && " and cleared "}
        {debtLiq > DUST && fig(debtLiq, stable)} from this CDP.
      </span>,
    );
  }

  const psmOutcome = lifetime ? polarisPsmOutcomeSentence(lifetime, stable, pethInDebt) : null;
  if (psmOutcome) {
    bullets.push(<span key="psm-outcome">{psmOutcome}</span>);
  }

  const collNow = collateral.current[0];
  const debtNow = debt.current[0];
  const pending = debt.interest;
  if (collNow || debtNow) {
    bullets.push(
      <span key="current">
        The CDP currently holds {collNow ? fig(collNow.amount, collSym) : `no ${collSym}`} against{" "}
        {debtNow ? fig(debtNow.amount + (pending?.amount ?? 0), stable) : `no ${stable}`} of debt
        {pending && pending.amount > DUST ? (
          <>, of which {fig(pending.amount, stable)} is interest not yet written in</>
        ) : null}
        .
      </span>,
    );
  } else if (bullets.length > 0) {
    bullets.push(<span key="closed">The CDP holds nothing now — its collateral and debt are both at zero.</span>);
  }

  if (bullets.length === 0) return null;

  return (
    <div className="space-y-2 text-sm text-rb-500">
      <p className="leading-relaxed">
        These figures total this CDP&rsquo;s lifetime flows on Polaris across every touch in its captured history, in
        native units — {collSym} on one side, {stable} on the other — and the two towers are not directly comparable.
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

/** The tower's "?" FAQ for Polaris. */
export function polarisEconomicsContent(): LearnMoreContent {
  return {
    title: "About the Economics",
    intro:
      "This panel sums the CDP's own touches into lifetime flows. Every touch on a Polaris CDP states not only what the holder moved but every leg the protocol applied at the same moment — interest, stability gains, reward pETH, the PSM's pro-rata share — so each is its own bucket here.",
    stepsHeading: "How the tower is built:",
    steps: [
      "Deposited, withdrawn, borrowed and repaid are the holder's own legs, summed touch by touch.",
      "Interest charged, stability gains, reward pETH and the PSM shares are the protocol's legs, each summed on its own.",
      "Collateral and debt taken by a liquidation are bucketed separately, as involuntary.",
      "On the live figures, interest accrued since the last touch sits on top of the debt as a pending segment.",
    ],
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Interest at each touch",
        text: "interest accrues continuously at the market's algorithmic rate and is written into the debt whenever the CDP is touched.",
      },
      {
        bold: "PSM shares",
        text: "when the market's PSM mints or redeems, every CDP takes a pro-rata share of the collateral and debt that moved.",
      },
      {
        bold: "Native units",
        text: "collateral is pETH and debt is the market's stablecoin; the tower never converts either into dollars.",
      },
    ],
    links: [
      POLARIS_DOC_LINKS.interestRates,
      POLARIS_DOC_LINKS.conversions,
      POLARIS_DOC_LINKS.bondingCurve,
      POLARIS_APP_LINK,
    ],
  };
}

/** The PSM-outcome strip that rides the tower's heading-button row — the
 *  Polaris mirror of `liquityRedemptionOutcome`. States the same sentence
 *  `polarisPsmOutcomeSentence` builds, with each figure carrying its own
 *  receipt. Never a verdict: "changed the CDP's equity at the feed" is the
 *  phrase, not "profit" or "P&L" — a PSM share is not this CDP's own trade,
 *  and an open CDP's own position is not scored here. */
export function polarisPsmOutcome(lifetime: PolarisLifetime, stable: string, pethInDebt?: number): ReactNode {
  if (!hasPsmOutcome(lifetime)) return undefined;
  const hasRedemption = Math.abs(lifetime.psmRedemptionEffectAtSettle) > DUST;
  const hasMint = Math.abs(lifetime.psmMintEffectAtSettle) > DUST;
  const netCollLeg = lifetime.collFromPsm - lifetime.collToPsm;
  const netDebtLeg = lifetime.debtFromPsm - lifetime.debtToPsm;
  const todayEffect = pethInDebt != null ? netCollLeg * pethInDebt - netDebtLeg : null;

  const signed = (n: number) => (
    <span className="font-semibold text-foreground tabular-nums">
      {n >= 0 ? "+" : "−"}
      {formatCompact(Math.abs(n))} {stable}
    </span>
  );

  const effectProv: Provenance = {
    kind: "derived",
    summary:
      "The PSM's shares' effect on this CDP's equity — valued at the feed at the end of the block each share settled onto this CDP at its own touch, never the price the PSM's own mint or redemption used (the share accrued between touches at a different price, and the settling block's own feed is what this CDP's equity is judged against). A redemption share's effect is debt cleared minus the pETH taken × that feed; a mint share's is the pETH added × that feed minus the debt added.",
    formula: "Σ (mintRedeemCollGain × priceAtBlock − mintRedeemDebtGain)",
    inputs: [
      {
        label: "redemption shares",
        value: formatExact(lifetime.psmRedemptionEffectAtSettle),
        kind: "derived",
        note: "Σ over rows whose PSM share is a redemption",
      },
      {
        label: "mint shares",
        value: formatExact(lifetime.psmMintEffectAtSettle),
        kind: "derived",
        note: "Σ over rows whose PSM share is a mint",
      },
      ...(lifetime.psmRowsUnpriced > 0
        ? [
            {
              label: "rows with no price yet",
              value: String(lifetime.psmRowsUnpriced),
              kind: "derived" as const,
              note: "PSM-share rows omitted from the sum until the oracle-at-block lane prices their block",
            },
          ]
        : []),
    ],
  };

  const todayProv: Provenance | null =
    todayEffect != null && pethInDebt != null
      ? {
          kind: "chain-derived",
          summary: `The same PSM legs at today's feed — the net pETH the PSM's shares moved over the CDP's life, priced at the live pETH/${stable} feed, minus the net debt they moved.`,
          formula: "(collFromPsm − collToPsm) × pethInDebt − (debtFromPsm − debtToPsm)",
          inputs: [
            {
              label: "net pETH from PSM",
              value: formatExact(netCollLeg),
              kind: "derived",
              note: "collFromPsm − collToPsm",
            },
            {
              label: "net debt from PSM",
              value: formatExact(netDebtLeg),
              kind: "derived",
              note: "debtFromPsm − debtToPsm",
            },
            {
              label: "today's feed",
              value: formatExact(pethInDebt),
              kind: "chain-derived",
              pclass: "oracle",
              note: "the market's own price feed at head",
            },
          ],
        }
      : null;

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5 pl-2 text-xs text-rb-500">
      <span>The PSM&rsquo;s shares, valued at the feed at each settling block, changed the CDP&rsquo;s equity by</span>
      <Prov info={effectProv} value={formatExact(lifetime.psmEffectAtSettle)}>
        {signed(lifetime.psmEffectAtSettle)}
      </Prov>
      {hasRedemption && hasMint && (
        <span>
          (redemption shares {signedText(lifetime.psmRedemptionEffectAtSettle, stable)}, mint shares{" "}
          {signedText(lifetime.psmMintEffectAtSettle, stable)})
        </span>
      )}
      {todayEffect != null && todayProv && (
        <>
          {/* Pulled back over the flex gap so the semicolon sits on the figure before it. */}
          <span className="-ml-1.5">; at today&rsquo;s feed the same legs come to</span>
          <Prov info={todayProv} value={formatExact(todayEffect)}>
            {signed(todayEffect)}
          </Prov>
        </>
      )}
      {lifetime.psmRowsUnpriced > 0 && <span>({lifetime.psmRowsUnpriced} rows carry no price yet)</span>}
    </div>
  );
}
