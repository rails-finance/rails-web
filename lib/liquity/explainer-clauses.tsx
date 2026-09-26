// Liquity V2 plain-English authoring — the variant table for the prose explainer.
// ----------------------------------------------------------------------------
// Where the old explainer pushed ReactNode BULLETS into a <ul> (a 1,557-line
// per-branch item generator), this composes a single layman PARAGRAPH from a
// list of clauses, keyed on the trove's RESULTING STATE after the event, never
// on the operation alone: a withdraw that closes the trove, a redemption that
// leaves a zombie, a liquidation that the trove survived through redistribution
// all read differently though a switch on operation would merge them.
//
// Organised per-operation (open / close / adjust / rate / apply / liquidate /
// redeem / batch / transfer), one builder per generator in the old file, so the
// enrichment can be diffed branch-by-branch. Every enrichment the old file
// carried survives here: accrued interest between events, the upfront-fee
// mechanic-why and debt breakdowns, the 0.0375 ETH liquidation reserve, the
// no-change-adjust run narration and min-debt cap, the full redemption narration
// with the dual-priced P/L equation and zombie forward paths, both liquidation
// variants, batch delegation, applyPendingDebt, transfers, and the trailing gas.
//
// Figures render through <Prov echo> when an EXPORTED provenance builder gives
// them a primary receipt on the card chrome — the header's collateral/debt
// change (coll/debtChangeProv), the after-rate (rateAfterProv), and the upfront
// fee (upfrontFeeProv). Chrome figures with no exported builder (after-balances,
// collateral ratio, the claimable-surplus pill, the no-change count) are plain
// <strong> — the highlight rule's bold, with no invented provenance. Everything
// else (USD values, oracle price, operation-wide redemption totals, fees, the
// P/L result, accrued dust) stays muted.
//
// ── Fill-standard notes (charter §5) ─────────────────────────────────────────
// Items filled: risk consequence (§5.1) as the collateral ratio before → after
// on adjust/rate/apply and the CR-at-liquidation vs the branch threshold;
// mechanic-why (§5.2) on the upfront fee, the redemption fee, the min-debt cap,
// the liquidation reserve, and the 5% liquidation incentive; forward paths
// (§5.3) on zombie troves, claimable surplus, and collateral-only closes;
// net-outcome figures (§5.4) as the redemption's dual-priced P/L and the
// redistribution's net impact; aggregate context (§5.5) as the redemption-wide
// totals and the server-collapsed no-change run. Items a branch cannot fill are
// simply absent (the never-empty floor) — noted per branch in the report.

import type { ReactNode } from "react";
import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";
import type { BaseActivityEvent, GasCost } from "@/lib/shared/types/activity";
import type { Provenance } from "@/components/shared/provenance";
import { Prov } from "@/components/shared/provenance";
import { LinkedAddress } from "@/components/shared/linked-address";
import { getBatchManagerByAddress } from "@/lib/liquity/batch-managers";
import { formatGasCost } from "@/lib/shared/format-event";
import { formatMonthDay } from "@/lib/date";
import { calculateInterestBetweenTransactions } from "@/lib/liquity/utils/interest-calculator";
import { isNoChangeAdjust, LIQUITY_MIN_DEBT, TROVE_DELTA_EPSILON } from "@/lib/liquity/trove-ops";
import {
  collChangeProv,
  debtChangeProv,
  rateAfterProv,
  upfrontFeeProv,
  type EventCoords,
  type ChangeProv,
  type FigureProv,
} from "@/lib/liquity/event-provenance";
import { clause, eventClauses, splitLead, type ClauseInput, type EventProseSlots } from "@/lib/shared/explainer-prose";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// ── Formatters (carried from the old explainer) ──────────────────────────────

function fmt(n: number): string {
  if (!isFinite(n)) return "0";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (abs >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  const decimals = Math.min(8, Math.ceil(-Math.log10(abs)) + 2);
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

function fmtColl(n: number): string {
  if (n === 0) return "0";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function fmtUsd(value: number): string {
  if (value < 0.01) return "< $0.01";
  if (value < 1) return `$${value.toFixed(2)}`;
  return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtCurrency(n: number, asset: string): string {
  return `${fmt(n)} ${asset}`;
}

/** Short day label for run spans ("Jun 6" / "Jul 8 '26"). */
function fmtDay(tsSeconds: number): string {
  const d = new Date(tsSeconds * 1000);
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  const base = formatMonthDay(d);
  return sameYear ? base : `${base}, ${String(d.getUTCFullYear()).slice(-2)}`;
}

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function getLiquidationThreshold(collType: string): number {
  return collType === "WETH" || collType === "ETH" ? 110 : 120;
}

// ── Figure rendering ─────────────────────────────────────────────────────────

type AnyProv = ChangeProv | FigureProv | { info: Provenance; value: string; symbol?: string };

/** A highlighted figure. When an exported provenance builder gives it a primary
 *  receipt on the header/detail chrome (`prov`), it renders as a <Prov echo> —
 *  the same info|value|symbol key, so the inspector's locator pulse reaches it.
 *  With no builder it is a plain bold span: the highlight rule's emphasis without
 *  inventing provenance the card doesn't have. */
function fig(prov: AnyProv | undefined, display: ReactNode): ReactNode {
  const bold = <strong className="font-semibold text-foreground">{display}</strong>;
  if (!prov) return bold;
  const symbol = "symbol" in prov ? prov.symbol : undefined;
  return (
    <Prov echo info={prov.info} value={prov.value} symbol={symbol}>
      {bold}
    </Prov>
  );
}

// ── open ─────────────────────────────────────────────────────────────────────

function openTroveSlots(ctx: LiquityContext, coords: EventCoords): EventProseSlots {
  const { stateAfter, troveOperation, collateralType, collateralPrice } = ctx;
  const collSym = collateralType;
  const debtSym = ctx.assetType ?? "BOLD";
  const upfrontFee = troveOperation?.debtIncreaseFromUpfrontFee ?? 0;
  const principalBorrowed = stateAfter.debt - upfrontFee;
  const collUsd = stateAfter.coll * collateralPrice;

  const collDelta = collChangeProv(ctx, coords);
  const debtDelta = debtChangeProv(ctx, coords);
  const rateAfter = rateAfterProv(ctx, coords);
  const feeAfter = upfrontFeeProv(ctx, coords);

  const happened: ClauseInput[] = [
    clause(
      <>
        This trove opened, depositing {fig(collDelta, `${fmtColl(stateAfter.coll)} ${collSym}`)} as collateral and
        borrowing {fmt(principalBorrowed)} {debtSym} against it.
      </>,
    ),
  ];

  const changed: ClauseInput[] = [
    upfrontFee > 0
      ? clause(
          <>
            A one-time borrowing fee of {fig(feeAfter, `${upfrontFee.toFixed(2)} ${debtSym}`)} was added to the debt,
            equivalent to 7 days of average interest.
          </>,
        )
      : null,
    clause(
      <>
        Its total initial debt stands at {fig(debtDelta, `${fmt(stateAfter.debt)} ${debtSym}`)}
        {upfrontFee > 0 ? ", including that fee" : ""}.
      </>,
    ),
    clause(<>A 0.0375 ETH liquidation reserve is set aside on open and returned when the trove closes.</>),
    collUsd > 0
      ? clause(
          <>
            At the price at the time, that collateral is worth {fmtUsd(collUsd)}
            {collateralPrice > 0 ? (
              <>
                {" "}
                ({collSym} at {fmtUsd(collateralPrice)})
              </>
            ) : null}
            .
          </>,
        )
      : null,
  ];

  const meansNow: ClauseInput[] = [
    clause(<>The trove opened at a {fig(undefined, `${stateAfter.collateralRatio.toFixed(1)}%`)} collateral ratio.</>),
    clause(
      <>
        It accrues interest at {fig(rateAfter, `${stateAfter.annualInterestRate.toFixed(1)}%`)} a year, compounding
        continuously.
      </>,
    ),
  ];

  if (ctx.operation === "openTroveAndJoinBatch" && ctx.batchUpdate) {
    const bu = ctx.batchUpdate;
    meansNow.push(
      clause(
        <>
          The trove joined a batch manager on open
          {bu.interestBatchManager ? (
            <>
              , delegating its rate to {shortenAddress(bu.interestBatchManager)} at {bu.annualInterestRate.toFixed(1)}%
              APR
              {bu.annualManagementFee > 0 ? <>, with a {bu.annualManagementFee.toFixed(2)}% management fee</> : null}
            </>
          ) : null}
          .
        </>,
      ),
    );
  }

  return { happened, changed, meansNow };
}

// ── close ──────────────────────────────────────────────────────────────────

function closeTroveSlots(ctx: LiquityContext, coords: EventCoords): EventProseSlots {
  const { troveOperation, stateBefore, collateralType } = ctx;
  const debtSym = ctx.assetType ?? "BOLD";
  const debtRepaid = troveOperation ? Math.abs(troveOperation.debtChangeFromOperation) : stateBefore.debt;
  const collRetrieved = troveOperation ? Math.abs(troveOperation.collChangeFromOperation) : stateBefore.coll;

  const collDelta = collChangeProv(ctx, coords);
  const debtDelta = debtChangeProv(ctx, coords);

  const happened: ClauseInput[] = [
    debtRepaid > 0
      ? clause(
          <>
            This transaction closed the trove, repaying its {fig(debtDelta, `${fmtCurrency(debtRepaid, debtSym)}`)} of
            debt in full.
          </>,
        )
      : clause(<>This transaction closed the trove; its debt was already zero, so nothing was repaid.</>),
  ];

  const changed: ClauseInput[] = [
    clause(
      <>The borrower retrieved all {fig(collDelta, `${fmtColl(collRetrieved)} ${collateralType}`)} of collateral.</>,
    ),
    clause(<>The 0.0375 ETH liquidation reserve was returned.</>),
  ];

  const meansNow: ClauseInput[] = [];
  if (debtRepaid > 0 && stateBefore.annualInterestRate > 0) {
    meansNow.push(
      clause(
        <>
          Before closing, the trove was paying {fig(undefined, `${stateBefore.annualInterestRate.toFixed(1)}%`)} annual
          interest.
        </>,
      ),
    );
  }
  if (debtRepaid > 0 && stateBefore.collateralRatio > 0) {
    meansNow.push(
      clause(<>It closed at a {fig(undefined, `${stateBefore.collateralRatio.toFixed(1)}%`)} collateral ratio.</>),
    );
  }
  meansNow.push(clause(<>The trove NFT was sent to the burn address, ending its ownership.</>));
  meansNow.push(clause(<>Nothing remains on either side.</>));

  return { happened, changed, meansNow };
}

// ── adjust (incl. no-change single + collapsed run) ──────────────────────────

function adjustTroveSlots(
  ctx: LiquityContext,
  coords: EventCoords,
  accruedInterest: number,
  accruedManagementFees: number,
): EventProseSlots {
  const { troveOperation, stateBefore, stateAfter, collateralType, collateralPrice } = ctx;
  const debtSym = ctx.assetType ?? "BOLD";
  const totalAccruedFees = accruedInterest + accruedManagementFees;

  // No-change adjust: nothing the reader would notice moved. Narrate what
  // actually happened — usually an automated repay clamped to accrued-interest
  // dust by the minimum-debt floor.
  if (isNoChangeAdjust(ctx) && troveOperation) {
    const run = ctx.noChangeRun;
    const dust = troveOperation.debtChangeFromOperation;
    const atMinDebt = Math.abs(stateAfter.debt - LIQUITY_MIN_DEBT) < TROVE_DELTA_EPSILON;

    const happened: ClauseInput[] = [];
    const changed: ClauseInput[] = [];
    const meansNow: ClauseInput[] = [];

    if (run) {
      happened.push(
        clause(
          <>
            This row stands in for {fig(undefined, run.count.toLocaleString("en-US"))} adjustments between{" "}
            {fmtDay(run.firstTimestamp)} and {fmtDay(run.lastTimestamp)}, every one of which left the trove unchanged.
          </>,
        ),
      );
      if (dust < 0) {
        changed.push(
          clause(
            <>
              Together they repaid {fmt(Math.abs(dust))} {debtSym}, the interest that accrued between touches.
            </>,
          ),
        );
      }
    } else if (dust < 0) {
      happened.push(
        clause(
          <>
            This adjustment moved no collateral and repaid only {fmt(Math.abs(dust))} {debtSym}, the interest that had
            accrued since the trove was last touched.
          </>,
        ),
      );
    } else {
      happened.push(clause(<>This adjustment moved no collateral and no debt.</>));
    }

    if (atMinDebt) {
      meansNow.push(clause(<>The debt sits at Liquity V2&rsquo;s 2,000 {debtSym} minimum.</>));
      meansNow.push(
        clause(
          <>
            A repayment stops at that floor unless it closes the trove, so{" "}
            {run ? "every larger attempt in this stretch was capped" : "any larger attempt was capped"} at the interest
            accrued since the last touch.
          </>,
        ),
      );
    }

    meansNow.push(
      clause(
        <>
          Repeated no-change adjustments like this are typically sent by an automated manager retrying an operation the
          protocol clamps to nothing.
        </>,
      ),
    );
    meansNow.push(clause(<>Each attempt costs the sender only gas.</>));

    return { happened, changed, meansNow };
  }

  // Normal adjust.
  const collDelta = collChangeProv(ctx, coords);
  const debtDelta = debtChangeProv(ctx, coords);
  const rateAfter = rateAfterProv(ctx, coords);
  const feeAfter = upfrontFeeProv(ctx, coords);

  const collChange = troveOperation?.collChangeFromOperation ?? 0;
  const debtChange = troveOperation?.debtChangeFromOperation ?? 0;
  const adjustFee = troveOperation?.debtIncreaseFromUpfrontFee ?? 0;
  const afterCollUsd = stateAfter.coll * collateralPrice;
  const beforeCR = stateBefore.collateralRatio;
  const afterCR = stateAfter.collateralRatio;

  const parts: ReactNode[] = [];
  if (collChange !== 0) {
    parts.push(
      <>
        {collChange > 0 ? "added " : "withdrew "}
        {fig(collDelta, `${fmtColl(Math.abs(collChange))} ${collateralType}`)} of collateral
      </>,
    );
  }
  if (debtChange !== 0) {
    parts.push(
      <>
        {debtChange > 0 ? "borrowed a further " : "repaid "}
        {fig(debtDelta, `${fmtCurrency(Math.abs(debtChange), debtSym)}`)}
      </>,
    );
  }
  const happened: ClauseInput[] = [
    parts.length > 0
      ? clause(
          <>
            This adjustment {parts[0]}
            {parts[1] ? <> and {parts[1]}</> : null}.
          </>,
        )
      : clause(<>This adjustment updated the trove.</>),
  ];

  const changed: ClauseInput[] = [];
  if (totalAccruedFees > 0.01) {
    changed.push(
      clause(
        <>
          Interest of {totalAccruedFees.toFixed(2)} {debtSym} accrued since the last operation
          {accruedManagementFees > 0 ? (
            <>
              , including a {accruedManagementFees.toFixed(2)} {debtSym} management fee
            </>
          ) : null}
          .
        </>,
      ),
    );
  }
  if (adjustFee > 0) {
    changed.push(
      clause(
        <>
          The adjustment charged a {fig(feeAfter, `${adjustFee.toFixed(2)} ${debtSym}`)} borrowing fee, equivalent to 7
          days of average interest on the borrow market.
        </>,
      ),
    );
  }
  if (debtChange > 0 && (adjustFee > 0 || totalAccruedFees > 0.01)) {
    const totalIncrease = stateAfter.debt - stateBefore.debt;
    changed.push(
      clause(
        <>
          Its debt rose by {fmtCurrency(totalIncrease, debtSym)} in total: {fmtCurrency(debtChange, debtSym)} borrowed
          {totalAccruedFees > 0.01 ? ` + ${totalAccruedFees.toFixed(2)} accrued` : ""}
          {adjustFee > 0 ? ` + ${adjustFee.toFixed(2)} fee` : ""}.
        </>,
      ),
    );
  }

  const meansNow: ClauseInput[] = [
    clause(
      <>
        The trove now holds {fig(undefined, `${fmtColl(stateAfter.coll)} ${collateralType}`)} of collateral against{" "}
        {fig(undefined, `${fmtCurrency(stateAfter.debt, debtSym)}`)} of debt.
      </>,
    ),
  ];
  if (afterCollUsd > 0 && collateralPrice > 0) {
    meansNow.push(
      clause(
        <>
          At the price at the time, that collateral is worth {fmtUsd(afterCollUsd)} ({fmtUsd(collateralPrice)} /{" "}
          {collateralType}).
        </>,
      ),
    );
  }
  if (beforeCR > 0 && afterCR > 0 && afterCR > beforeCR) {
    meansNow.push(clause(<>The collateral ratio rose to {fig(undefined, `${afterCR.toFixed(1)}%`)}.</>));
  } else if (beforeCR > 0 && afterCR > 0 && afterCR < beforeCR) {
    meansNow.push(clause(<>The collateral ratio fell to {fig(undefined, `${afterCR.toFixed(1)}%`)}.</>));
  }
  if (stateBefore.annualInterestRate !== stateAfter.annualInterestRate) {
    meansNow.push(
      clause(
        <>
          The annual interest rate moved from {stateBefore.annualInterestRate.toFixed(1)}% to{" "}
          {fig(rateAfter, `${stateAfter.annualInterestRate.toFixed(1)}%`)}.
        </>,
      ),
    );
  } else {
    meansNow.push(
      clause(<>The annual interest rate stays at {fig(rateAfter, `${stateAfter.annualInterestRate.toFixed(1)}%`)}.</>),
    );
  }

  return { happened, changed: changed.filter(Boolean) as ClauseInput[], meansNow };
}

// ── adjust interest rate ─────────────────────────────────────────────────────

function adjustRateSlots(
  ctx: LiquityContext,
  coords: EventCoords,
  accruedInterest: number,
  accruedManagementFees: number,
): EventProseSlots {
  const { stateBefore, stateAfter, collateralType, collateralPrice } = ctx;
  const debtSym = ctx.assetType ?? "BOLD";
  const totalAccruedFees = accruedInterest + accruedManagementFees;
  const increased = stateAfter.annualInterestRate > stateBefore.annualInterestRate;
  const rateAfter = rateAfterProv(ctx, coords);
  const afterCollUsd = stateAfter.coll * collateralPrice;

  const happened: ClauseInput[] = [
    clause(
      <>
        This adjustment {increased ? "raised" : "lowered"} the trove&rsquo;s interest rate from{" "}
        {stateBefore.annualInterestRate.toFixed(1)}% to {fig(rateAfter, `${stateAfter.annualInterestRate.toFixed(1)}%`)}{" "}
        APR.
      </>,
    ),
  ];

  const changed: ClauseInput[] = [];
  if (totalAccruedFees > 0.01) {
    changed.push(
      clause(
        <>
          Interest of {totalAccruedFees.toFixed(2)} {debtSym} accrued since the last operation
          {accruedManagementFees > 0 ? (
            <>
              , including a {accruedManagementFees.toFixed(2)} {debtSym} management fee
            </>
          ) : null}
          .
        </>,
      ),
    );
  }

  const meansNow: ClauseInput[] = [];
  if (stateAfter.debt > 0) {
    meansNow.push(clause(<>Its debt now stands at {fig(undefined, `${fmtCurrency(stateAfter.debt, debtSym)}`)}.</>));
  }
  if (stateAfter.coll > 0 && afterCollUsd > 0) {
    meansNow.push(
      clause(
        <>
          The collateral remains {fig(undefined, `${fmtColl(stateAfter.coll)} ${collateralType}`)} (
          {fmtUsd(afterCollUsd)}
          ).
        </>,
      ),
    );
  }
  if (stateAfter.collateralRatio > 0) {
    meansNow.push(clause(<>The collateral ratio is {fig(undefined, `${stateAfter.collateralRatio.toFixed(1)}%`)}.</>));
  }

  return { happened, changed, meansNow };
}

// ── applyPendingDebt ─────────────────────────────────────────────────────────

function applyPendingDebtSlots(ctx: LiquityContext, coords: EventCoords): EventProseSlots {
  const { troveOperation, stateAfter, collateralType, collateralPrice } = ctx;
  const debtSym = ctx.assetType ?? "BOLD";
  const redistDebt = troveOperation?.debtIncreaseFromRedist ?? 0;
  const collGain = troveOperation?.collIncreaseFromRedist ?? 0;
  const collDelta = collChangeProv(ctx, coords);
  const debtDelta = debtChangeProv(ctx, coords);
  const rateAfter = rateAfterProv(ctx, coords);
  const afterCollUsd = stateAfter.coll * collateralPrice;

  const happened: ClauseInput[] = [
    clause(
      <>
        This event applied {fig(debtDelta, `${fmt(redistDebt)} ${debtSym}`)} of pending redistribution debt to the trove
        {collGain > 0 ? (
          <>, along with {fig(collDelta, `${fmtColl(collGain)} ${collateralType}`)} of redistributed collateral</>
        ) : null}
        .
      </>,
    ),
  ];

  const changed: ClauseInput[] = [];
  if (ctx.batchUpdate) {
    changed.push(clause(<>A batch manager applied the trove&rsquo;s accrued interest at the same time.</>));
  }

  const meansNow: ClauseInput[] = [
    clause(<>Its debt now stands at {fig(undefined, `${fmtCurrency(stateAfter.debt, debtSym)}`)}.</>),
  ];
  if (stateAfter.coll > 0) {
    meansNow.push(
      clause(
        <>
          The collateral is unchanged at {fig(undefined, `${fmtColl(stateAfter.coll)} ${collateralType}`)}
          {afterCollUsd > 0 ? <> ({fmtUsd(afterCollUsd)})</> : null}.
        </>,
      ),
    );
  }
  meansNow.push(
    clause(<>Interest accrues at {fig(rateAfter, `${stateAfter.annualInterestRate.toFixed(1)}%`)} a year.</>),
  );
  if (stateAfter.collateralRatio > 0) {
    meansNow.push(clause(<>The collateral ratio is {fig(undefined, `${stateAfter.collateralRatio.toFixed(1)}%`)}.</>));
  }

  return { happened, changed, meansNow };
}

// ── liquidate (beneficial redistribution + destructive) ──────────────────────

function liquidateSlots(ctx: LiquityContext, coords: EventCoords): EventProseSlots {
  const { liquidation, troveOperation, stateBefore, stateAfter, collateralType, collateralPrice } = ctx;
  const debtSym = ctx.assetType ?? "BOLD";

  if (!liquidation) {
    return { happened: [clause(<>The {collateralType} trove was liquidated.</>)] };
  }

  const isBeneficial = stateAfter.debt > 0 && troveOperation && troveOperation.collIncreaseFromRedist > 0;
  const collDelta = collChangeProv(ctx, coords);
  const debtDelta = debtChangeProv(ctx, coords);

  if (isBeneficial) {
    const collGained = troveOperation!.collIncreaseFromRedist;
    const debtInherited = troveOperation!.debtIncreaseFromRedist;
    const collGainedUsd = collGained * collateralPrice;
    const netBenefit = collGainedUsd - debtInherited;
    const sign = netBenefit >= 0 ? "+" : "−";

    const happened: ClauseInput[] = [
      clause(<>Another trove&rsquo;s liquidation redistributed part of its collateral and debt onto this one.</>),
    ];
    const changed: ClauseInput[] = [
      clause(
        <>
          This trove received {fig(collDelta, `${fmtColl(collGained)} ${collateralType}`)} from the liquidated trove
          {collGainedUsd > 0 ? <> (about {fmtUsd(collGainedUsd)} at the price at the time)</> : null}.
        </>,
      ),
      clause(
        <>
          It inherited {fig(debtDelta, `${fmtCurrency(debtInherited, debtSym)}`)} of debt in proportion to its
          collateral.
        </>,
      ),
      clause(
        <>
          The net effect was {sign}
          {fmtUsd(Math.abs(netBenefit))}
          {netBenefit >= 0 ? ", the redistribution penalty working in this trove’s favour" : ", a small cost"}.
        </>,
      ),
      clause(<>The redistribution happened because the Stability Pool could not fully cover the liquidation.</>),
    ];
    const meansNow: ClauseInput[] = [];
    if (stateBefore.collateralRatio > 0 && stateAfter.collateralRatio > 0) {
      meansNow.push(
        clause(
          <>
            Its collateral ratio moved from {stateBefore.collateralRatio.toFixed(1)}% to{" "}
            {fig(undefined, `${stateAfter.collateralRatio.toFixed(1)}%`)}.
          </>,
        ),
      );
    }
    meansNow.push(clause(<>The trove remains open, now carrying the inherited debt.</>));
    return { happened, changed, meansNow };
  }

  // Destructive liquidation. The many payout legs move to the pane's `list` slot
  // (liquidationLegs); the arc keeps the trigger, the cleared/liquidated totals,
  // the claimable surplus forward path, and the estimated loss.
  const threshold = getLiquidationThreshold(collateralType);
  const debtCleared = liquidation.debtOffsetBySP + liquidation.debtRedistributed;
  const collLiquidated =
    liquidation.collSentToSP +
    liquidation.collRedistributed +
    liquidation.collSurplus +
    liquidation.collGasCompensation;
  const totalCollValueUsd = collLiquidated * liquidation.price;
  const crAtLiquidation =
    totalCollValueUsd > 0 && debtCleared > 0 ? (totalCollValueUsd / debtCleared) * 100 : stateBefore.collateralRatio;
  const hasClaimableSurplus = liquidation.collSurplus > 0 && liquidation.debtRedistributed === 0;
  const collSurplusValueUsd = liquidation.collSurplus * liquidation.price;
  const borrowerEquity = totalCollValueUsd - debtCleared;
  const estimatedBorrowerLoss = borrowerEquity > 0 ? borrowerEquity - collSurplusValueUsd : 0;
  const wasPartiallyRedistributed = liquidation.debtOffsetBySP > 0 && liquidation.debtRedistributed > 0;

  const happened: ClauseInput[] = [
    clause(
      <>
        This trove was liquidated: its collateral ratio had dropped to {crAtLiquidation.toFixed(2)}%, below the{" "}
        {threshold}% liquidation line for {collateralType}.
      </>,
    ),
  ];

  // debtCleared / collLiquidated are summed from the liquidation's own legs
  // (offset + redistributed; SP + redist + surplus + gasComp) — different log
  // fields than the header's operation change — so they are plain bold (the
  // header mirrors the same quantities but an echo could pair on a mismatched
  // value). No invented provenance.
  const changed: ClauseInput[] = [
    clause(<>Its {fig(undefined, `${fmtCurrency(debtCleared, debtSym)}`)} of debt was cleared.</>),
    clause(
      <>
        {fig(undefined, `${fmtColl(collLiquidated)} ${collateralType}`)} of collateral was liquidated, worth{" "}
        {fmtUsd(totalCollValueUsd)} at the price at the time.
      </>,
    ),
  ];

  const meansNow: ClauseInput[] = [];
  if (hasClaimableSurplus) {
    meansNow.push(
      clause(
        <>
          The collateral&rsquo;s value exceeded the debt, so{" "}
          {fig(undefined, `${fmtColl(liquidation.collSurplus)} ${collateralType}`)} of surplus (
          {fmtUsd(collSurplusValueUsd)}) remains claimable by the borrower.
        </>,
      ),
    );
  }
  if (estimatedBorrowerLoss > 0) {
    meansNow.push(
      clause(<>After that surplus, the borrower&rsquo;s estimated loss was about {fmtUsd(estimatedBorrowerLoss)}.</>),
    );
  }
  if (wasPartiallyRedistributed) {
    meansNow.push(
      clause(
        <>
          The Stability Pool could not fully cover the liquidation, so part of the debt was redistributed to other
          troves.
        </>,
      ),
    );
  }

  return { happened, changed, meansNow };
}

/** The destructive liquidation's payout legs — genuinely list-shaped, so they
 *  render as the pane's short bullet list under the prose arc (charter §4 escape
 *  hatch). Undefined for beneficial / detail-less liquidations. */
export function liquityLiquidationLegs(ctx: LiquityContext): ReactNode[] | undefined {
  if (ctx.operation !== "liquidate") return undefined;
  const { liquidation, troveOperation, stateAfter, collateralType } = ctx;
  if (!liquidation) return undefined;
  const isBeneficial = stateAfter.debt > 0 && troveOperation && troveOperation.collIncreaseFromRedist > 0;
  if (isBeneficial) return undefined;

  const debtCleared = liquidation.debtOffsetBySP + liquidation.debtRedistributed;
  const penaltyInColl = debtCleared > 0 && liquidation.price > 0 ? (debtCleared * 0.05) / liquidation.price : 0;
  const penaltyValueUsd = debtCleared * 0.05;

  const legs: ReactNode[] = [];
  if (liquidation.collSentToSP > 0) {
    legs.push(
      <>
        The Stability Pool received {fmtColl(liquidation.collSentToSP)} {collateralType} (
        {fmtUsd(liquidation.collSentToSP * liquidation.price)}).
      </>,
    );
  }
  if (liquidation.collGasCompensation > 0) {
    legs.push(
      <>
        The liquidator received {fmtColl(liquidation.collGasCompensation)} {collateralType} in gas compensation.
      </>,
    );
  }
  legs.push(<>The liquidator received 0.0375 WETH in gas compensation.</>);
  if (penaltyInColl > 0) {
    legs.push(
      <>
        The liquidator received {fmtColl(penaltyInColl)} {collateralType} ({fmtUsd(penaltyValueUsd)}) as the 5%
        liquidation incentive.
      </>,
    );
  }
  legs.push(<>The trove NFT was burned in the liquidation.</>);
  return legs;
}

// ── redeem / zombie adjust ───────────────────────────────────────────────────

function redeemSlots(ctx: LiquityContext, coords: EventCoords, currentPrice?: number): EventProseSlots {
  const { redemption, stateAfter, troveOperation, collateralType, collateralPrice } = ctx;
  const debtSym = ctx.assetType ?? "BOLD";

  if (!redemption) {
    return { happened: [clause(<>The {collateralType} trove was redeemed.</>)] };
  }

  const collRedeemed = troveOperation ? Math.abs(troveOperation.collChangeFromOperation) : redemption.ETHSent;
  const debtRedeemed = troveOperation ? Math.abs(troveOperation.debtChangeFromOperation) : redemption.actualBoldAmount;
  const redemptionFee = Number(redemption.ETHFee) || 0;
  const feeRate = redemptionFee > 0 ? (redemptionFee / (collRedeemed + redemptionFee)) * 100 : 0;
  const collValueMarketPrice = collRedeemed * collateralPrice;
  const feeValueMarket = redemptionFee * collateralPrice;
  const afterCollUsd = stateAfter.coll * collateralPrice;
  const isZombie = ctx.isZombieTrove;

  const collDelta = collChangeProv(ctx, coords);
  const debtDelta = debtChangeProv(ctx, coords);
  const rateAfter = rateAfterProv(ctx, coords);

  const happened: ClauseInput[] = [
    clause(
      <>
        A redemption cleared {fig(debtDelta, `${fmtCurrency(debtRedeemed, debtSym)}`)} of this trove&rsquo;s debt and
        reduced its collateral by {fig(collDelta, `${fmtColl(collRedeemed)} ${collateralType}`)} (
        {fmtUsd(collValueMarketPrice)}).
      </>,
    ),
  ];

  const changed: ClauseInput[] = [];
  if (redemption.actualBoldAmount > debtRedeemed + 0.01) {
    changed.push(
      clause(
        <>
          This was part of a larger redemption totalling {fmtCurrency(redemption.actualBoldAmount, debtSym)} against{" "}
          {fmtColl(redemption.ETHSent)} {collateralType} ({fmtUsd(redemption.ETHSent * redemption.price)})
          {redemption.attemptedBoldAmount > redemption.actualBoldAmount + 0.01 ? (
            <> of {fmtCurrency(redemption.attemptedBoldAmount, debtSym)} attempted</>
          ) : null}
          .
        </>,
      ),
    );
  }
  if (redemptionFee > 0) {
    changed.push(
      clause(
        <>
          A {feeRate.toFixed(3)}% redemption fee of {fmtColl(redemptionFee)} {collateralType} ({fmtUsd(feeValueMarket)}
          ), paid by the redeemer, stays in the trove as extra collateral.
        </>,
      ),
    );
  }

  const meansNow: ClauseInput[] = [];
  // After-state, keyed on the resulting zombie / debt state.
  if (stateAfter.debt === 0) {
    if (isZombie) {
      meansNow.push(
        clause(
          <>
            The trove now holds {fig(undefined, `0 ${debtSym}`)} of debt and remains open with collateral only, a
            zero-debt zombie trove.
          </>,
        ),
      );
      meansNow.push(
        clause(
          <>
            With no debt, interest accrual has stopped and the {stateAfter.annualInterestRate.toFixed(1)}% rate is
            inactive.
          </>,
        ),
      );
      meansNow.push(
        clause(
          <>
            It can be closed by withdrawing the remaining collateral, or re-activated by borrowing 2,000 {debtSym} or
            more.
          </>,
        ),
      );
    } else {
      meansNow.push(clause(<>The trove now holds {fig(undefined, `0 ${debtSym}`)} of debt.</>));
      meansNow.push(
        clause(
          <>
            The trove keeps its interest rate through a redemption, still at{" "}
            {fig(rateAfter, `${stateAfter.annualInterestRate.toFixed(1)}%`)}.
          </>,
        ),
      );
    }
  } else {
    if (isZombie) {
      meansNow.push(
        clause(
          <>
            The trove now holds {fig(undefined, `${fmtCurrency(stateAfter.debt, debtSym)}`)} of debt, a low-debt zombie
            trove below the 2,000 {debtSym} minimum, and its collateral ratio adjusts to{" "}
            {fig(undefined, `${stateAfter.collateralRatio.toFixed(1)}%`)}.
          </>,
        ),
      );
      meansNow.push(
        clause(
          <>
            It is removed from the normal redemption order and may be prioritised in later redemptions to clear the
            below-minimum debt.
          </>,
        ),
      );
      meansNow.push(
        clause(
          <>
            Interest keeps accruing at {fig(rateAfter, `${stateAfter.annualInterestRate.toFixed(1)}%`)}; if the debt
            later rises back above 2,000 {debtSym}, the trove returns to normal behaviour.
          </>,
        ),
      );
      meansNow.push(
        clause(
          <>
            It can be resolved by repaying the remaining debt and withdrawing collateral to close it, or by borrowing
            more to bring the debt above 2,000 {debtSym}.
          </>,
        ),
      );
    } else {
      meansNow.push(
        clause(
          <>
            The trove now holds {fig(undefined, `${fmtCurrency(stateAfter.debt, debtSym)}`)} of debt, adjusting its
            collateral ratio to {fig(undefined, `${stateAfter.collateralRatio.toFixed(1)}%`)}.
          </>,
        ),
      );
      meansNow.push(
        clause(
          <>
            The trove keeps its interest rate through a redemption, still at{" "}
            {fig(rateAfter, `${stateAfter.annualInterestRate.toFixed(1)}%`)}.
          </>,
        ),
      );
    }
  }

  // Dual-priced P/L equation (charter §5.4) — the net outcome from the
  // borrower's side: debt cleared minus the value of the collateral given up.
  if (collateralPrice > 0) {
    const netHistoric = debtRedeemed - collValueMarketPrice;
    const netToday = currentPrice ? debtRedeemed - collRedeemed * currentPrice : null;
    const s = (n: number) => (n >= 0 ? "+" : "−");
    meansNow.push(
      clause(
        <>
          The borrower&rsquo;s net outcome is the debt cleared minus the value of the collateral given up:{" "}
          {fmtUsd(debtRedeemed)} &minus; {fmtColl(collRedeemed)} {collateralType} &times; {fmtUsd(collateralPrice)} ={" "}
          {s(netHistoric)}
          {fmtUsd(Math.abs(netHistoric))} at the redemption-time price
          {netToday != null ? (
            <>
              , or {s(netToday)}
              {fmtUsd(Math.abs(netToday))} at today&rsquo;s {collateralType} price of {fmtUsd(currentPrice!)}
            </>
          ) : null}
          .
        </>,
      ),
    );
  }

  return { happened, changed, meansNow };
}

// ── batch: set / remove / batch-rate ─────────────────────────────────────────

function delegateLink(managerAddr: string): ReactNode {
  const knownName = getBatchManagerByAddress(managerAddr)?.name ?? null;
  const shortAddr = shortenAddress(managerAddr);
  return (
    <a
      href={explorerUrl(MAINNET_CHAIN_ID, "address", managerAddr)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="text-pink-500 hover:text-pink-600 transition-colors"
    >
      {knownName ? `${knownName} (${shortAddr})` : shortAddr}
    </a>
  );
}

function setBatchManagerSlots(ctx: LiquityContext, coords: EventCoords, accruedInterest: number): EventProseSlots {
  const { stateAfter, stateBefore, collateralType } = ctx;
  const debtSym = ctx.assetType ?? "BOLD";
  const managerAddr = ctx.batchUpdate?.interestBatchManager ?? ctx.batchManager;
  const debtChanged = Math.abs(stateAfter.debt - stateBefore.debt) >= 0.01;
  const rateAfter = rateAfterProv(ctx, coords);

  const happened: ClauseInput[] = [
    clause(
      <>
        This trove delegated its interest-rate management
        {managerAddr ? <> to {delegateLink(managerAddr)}</> : null}.
      </>,
    ),
  ];

  const changed: ClauseInput[] = [];
  if (stateAfter.debt > 0) {
    changed.push(
      debtChanged
        ? clause(
            <>
              Its debt updated from {fmtCurrency(stateBefore.debt, debtSym)} to{" "}
              {fig(undefined, `${fmtCurrency(stateAfter.debt, debtSym)}`)}
              {accruedInterest > 0.01 ? ", reflecting accrued interest" : ""}.
            </>,
          )
        : clause(<>Its debt is unchanged at {fig(undefined, `${fmtCurrency(stateAfter.debt, debtSym)}`)}.</>),
    );
  }

  const meansNow: ClauseInput[] = [];
  if (stateAfter.coll > 0) {
    meansNow.push(
      clause(<>The collateral remains {fig(undefined, `${fmtColl(stateAfter.coll)} ${collateralType}`)}.</>),
    );
  }
  if (stateAfter.annualInterestRate > 0) {
    meansNow.push(
      clause(
        <>
          The trove now accrues at a delegated rate of {fig(rateAfter, `${stateAfter.annualInterestRate.toFixed(2)}%`)}{" "}
          APR.
        </>,
      ),
    );
  }
  if (stateAfter.collateralRatio > 0) {
    meansNow.push(clause(<>The collateral ratio is {fig(undefined, `${stateAfter.collateralRatio.toFixed(1)}%`)}.</>));
  }

  return { happened, changed, meansNow };
}

function removeFromBatchSlots(
  ctx: LiquityContext,
  coords: EventCoords,
  accruedManagementFees: number,
): EventProseSlots {
  const { stateAfter, stateBefore, collateralType, collateralPrice } = ctx;
  const debtSym = ctx.assetType ?? "BOLD";
  const afterCollUsd = stateAfter.coll * collateralPrice;
  const rateAfter = rateAfterProv(ctx, coords);

  const happened: ClauseInput[] = [
    clause(
      <>
        This trove left its batch manager and returned to managing its own interest rate
        {ctx.batchUpdate?.interestBatchManager ? (
          <>
            , formerly delegated to <LinkedAddress address={ctx.batchUpdate.interestBatchManager} />
          </>
        ) : null}
        .
      </>,
    ),
  ];

  const changed: ClauseInput[] = [];
  if (accruedManagementFees > 0.01) {
    changed.push(
      clause(
        <>
          About {accruedManagementFees.toFixed(2)} {debtSym} of delegate management fees had accrued.
        </>,
      ),
    );
  }

  const meansNow: ClauseInput[] = [];
  if (stateAfter.debt > 0) {
    meansNow.push(clause(<>Its debt now stands at {fig(undefined, `${fmtCurrency(stateAfter.debt, debtSym)}`)}.</>));
  }
  if (stateAfter.coll > 0 && afterCollUsd > 0) {
    meansNow.push(
      clause(
        <>
          The collateral is {fig(undefined, `${fmtColl(stateAfter.coll)} ${collateralType}`)} ({fmtUsd(afterCollUsd)}).
        </>,
      ),
    );
  }
  if (stateAfter.annualInterestRate !== stateBefore.annualInterestRate) {
    meansNow.push(
      clause(
        <>
          The rate moved from {stateBefore.annualInterestRate.toFixed(1)}% to a self-set{" "}
          {fig(rateAfter, `${stateAfter.annualInterestRate.toFixed(1)}%`)}.
        </>,
      ),
    );
  }
  if (stateAfter.collateralRatio > 0) {
    meansNow.push(clause(<>The collateral ratio is {fig(undefined, `${stateAfter.collateralRatio.toFixed(1)}%`)}.</>));
  }

  return { happened, changed, meansNow };
}

function batchRateUpdateSlots(ctx: LiquityContext, coords: EventCoords): EventProseSlots {
  const { stateBefore, stateAfter, collateralType, collateralPrice } = ctx;
  const debtSym = ctx.assetType ?? "BOLD";
  const increased = stateAfter.annualInterestRate > stateBefore.annualInterestRate;
  const afterCollUsd = stateAfter.coll * collateralPrice;
  const rateAfter = rateAfterProv(ctx, coords);

  const happened: ClauseInput[] = [
    clause(
      <>
        The batch manager {increased ? "raised" : "lowered"} the delegated interest rate from{" "}
        {stateBefore.annualInterestRate.toFixed(1)}% to {fig(rateAfter, `${stateAfter.annualInterestRate.toFixed(1)}%`)}{" "}
        APR.
      </>,
    ),
  ];

  const meansNow: ClauseInput[] = [];
  if (ctx.batchUpdate?.interestBatchManager) {
    meansNow.push(
      clause(
        <>
          The rate is set by the delegate <LinkedAddress address={ctx.batchUpdate.interestBatchManager} />.
        </>,
      ),
    );
  }
  if (stateAfter.debt > 0) {
    meansNow.push(
      clause(<>The trove&rsquo;s debt now stands at {fig(undefined, `${fmtCurrency(stateAfter.debt, debtSym)}`)}.</>),
    );
  }
  if (stateAfter.coll > 0 && afterCollUsd > 0) {
    meansNow.push(
      clause(
        <>
          Its collateral is {fig(undefined, `${fmtColl(stateAfter.coll)} ${collateralType}`)} ({fmtUsd(afterCollUsd)}).
        </>,
      ),
    );
  }
  if (stateAfter.collateralRatio > 0) {
    meansNow.push(clause(<>The collateral ratio is {fig(undefined, `${stateAfter.collateralRatio.toFixed(1)}%`)}.</>));
  }

  return { happened, meansNow };
}

// ── transfer ─────────────────────────────────────────────────────────────────

function transferSlots(ctx: LiquityContext): EventProseSlots {
  const { transfer, stateAfter, collateralType, collateralPrice } = ctx;
  const debtSym = ctx.assetType ?? "BOLD";

  if (!transfer) {
    return { happened: [clause(<>The {collateralType} trove&rsquo;s ownership was transferred.</>)] };
  }

  const { transferType, fromAddress, toAddress } = transfer;
  const happened: ClauseInput[] = [
    transferType === "mint"
      ? clause(
          <>
            The trove NFT was minted to <LinkedAddress address={toAddress} />.
          </>,
        )
      : transferType === "burn"
        ? clause(
            <>
              The trove NFT was burned from <LinkedAddress address={fromAddress} />.
            </>,
          )
        : clause(
            <>
              The trove NFT moved from <LinkedAddress address={fromAddress} /> to <LinkedAddress address={toAddress} />.
            </>,
          ),
  ];

  // The general ERC-721 rule (troves are NFTs, ownership transfers) and the
  // new-owner-controls-everything rule are Layer-2 material — the "?" modal
  // (liquityTransferContent intro + "Transfer effects") carries both. The
  // mint/burn variants keep only their happened clause (never-empty floor).
  const meansNow: ClauseInput[] = [];
  if (transferType === "transfer") {
    if (stateAfter.debt > 0 || stateAfter.coll > 0) {
      const afterCollUsd = stateAfter.coll * collateralPrice;
      meansNow.push(
        clause(
          <>
            The transferred trove holds {fig(undefined, `${fmtCurrency(stateAfter.debt, debtSym)}`)} of debt against{" "}
            {fig(undefined, `${fmtColl(stateAfter.coll)} ${collateralType}`)} of collateral, at a{" "}
            {fig(undefined, `${stateAfter.collateralRatio.toFixed(1)}%`)} ratio and a{" "}
            {fig(undefined, `${stateAfter.annualInterestRate.toFixed(1)}%`)} interest rate
            {collateralPrice > 0 ? (
              <>
                {" "}
                ({collateralType} at {fmtUsd(collateralPrice)})
              </>
            ) : null}
            .
          </>,
        ),
      );
    }
    meansNow.push(clause(<>The trove&rsquo;s debt and collateral balances are unchanged by the transfer.</>));
  }

  return { happened, meansNow };
}

// ── the dispatcher ───────────────────────────────────────────────────────────

export function liquityEventSlots(
  ctx: LiquityContext,
  coords: EventCoords,
  previousEvent?: BaseActivityEvent,
  currentEvent?: BaseActivityEvent,
  currentPrice?: number,
): EventProseSlots {
  let accruedInterest = 0;
  let accruedManagementFees = 0;
  if (previousEvent && currentEvent) {
    const calc = calculateInterestBetweenTransactions(currentEvent, previousEvent);
    accruedInterest = calc.accruedInterest;
    accruedManagementFees = calc.accruedManagementFees;
  }

  switch (ctx.operation) {
    case "openTrove":
    case "openTroveAndJoinBatch":
      return openTroveSlots(ctx, coords);
    case "closeTrove":
      return closeTroveSlots(ctx, coords);
    case "adjustTrove":
      return adjustTroveSlots(ctx, coords, accruedInterest, accruedManagementFees);
    case "adjustTroveInterestRate":
      return adjustRateSlots(ctx, coords, accruedInterest, accruedManagementFees);
    case "liquidate":
      return liquidateSlots(ctx, coords);
    case "redeemCollateral":
    case "adjustZombieTrove":
    case "adjustUnredeemableZombieTrove":
      return redeemSlots(ctx, coords, currentPrice);
    case "applyPendingDebt":
      return applyPendingDebtSlots(ctx, coords);
    case "setInterestBatchManager":
      return setBatchManagerSlots(ctx, coords, accruedInterest);
    case "removeFromBatch":
      return removeFromBatchSlots(ctx, coords, accruedManagementFees);
    case "setBatchManagerAnnualInterestRate":
      return batchRateUpdateSlots(ctx, coords);
    case "transferTrove":
      return transferSlots(ctx);
    default:
      return {
        happened: [
          clause(
            <>
              This was a {ctx.operation} on the {ctx.collateralType} trove.
            </>,
          ),
        ],
      };
  }
}

/** The trailing gas clause — owner-paid events only (passive events pass no
 *  gas). Always last in the arc, never the lead, so the teaser never carries it.
 *  For a collapsed run the figure is the SUM across the run's transactions. */
export function liquityGasClause(ctx: LiquityContext, gas: GasCost): ClauseInput {
  if (!gas || gas.gasCostEth <= 0) return null;
  return ctx.noChangeRun
    ? clause(
        <>
          Gas across these {ctx.noChangeRun.count.toLocaleString("en-US")} transactions: {formatGasCost(gas)}.
        </>,
      )
    : clause(<>Gas for this transaction: {formatGasCost(gas)}.</>);
}

/** The teaser = the lead of the composed arc (the first sentence plus its
 *  trailing continuations). Gas is never in the lead, so it is omitted here. */
export function liquityExplainerTeaser(
  ctx: LiquityContext,
  coords: EventCoords,
  previousEvent?: BaseActivityEvent,
  currentEvent?: BaseActivityEvent,
  currentPrice?: number,
): ReactNode | null {
  return splitLead(eventClauses(liquityEventSlots(ctx, coords, previousEvent, currentEvent, currentPrice))).lead;
}
