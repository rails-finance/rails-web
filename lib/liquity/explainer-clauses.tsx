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
// Emphasis follows the T3 echo-colour rule (rails-ops
// standards/detail-page-anatomy.md, "The disclosure ladder"): a figure that also
// appears above, in the T2 grid (its cells, value pills, sub-lines and the price
// chip) or in the T1 header and spine, renders in the foreground tone, written
// in the grid's own format (lib/liquity/figure-format.ts); a figure stated only
// here stays muted. A foreground figure renders through <Prov echo> when an
// EXPORTED provenance builder gives it a primary receipt on the chrome (the
// header's collateral/debt change, the after-rate, the upfront fee), and as a
// plain <strong> otherwise, with no invented provenance.
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

import { collFigure } from "@/lib/shared/coll-figure";
import type { ReactNode } from "react";
import { formatDate } from "@/lib/date";
import type { LiquityContext } from "@/lib/shared/types/protocols/liquity";
import type { BaseActivityEvent, GasCost } from "@/lib/shared/types/activity";
import type { Provenance } from "@/components/shared/provenance";
import { Prov } from "@/components/shared/provenance";
import { LinkedAddress } from "@/components/shared/linked-address";
import { getBatchManagerByAddress } from "@/lib/liquity/batch-managers";
import { formatGasCost } from "@/lib/shared/format-event";
import { formatMonthDay } from "@/lib/date";
import { liquityAccrual, type LiquityAccrual } from "@/lib/liquity/accrual";
import { branchMcr, liquityEventSafety, type LiquityEventSafety } from "@/lib/liquity/event-safety";
import { isNoChangeAdjust, LIQUITY_MIN_DEBT, TROVE_DELTA_EPSILON } from "@/lib/liquity/trove-ops";
import {
  collChangeProv,
  debtChangeProv,
  rateAfterProv,
  upfrontFeeProv,
  liquityRedistOnAdjust,
  redistArrivalProv,
  type EventCoords,
  type ChangeProv,
  type FigureProv,
} from "@/lib/liquity/event-provenance";
import { clause, eventClauses, splitLead, type ClauseInput, type EventProseSlots } from "@/lib/shared/explainer-prose";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import {
  fmtAccrued,
  fmtColl as fmtCollAt4,
  fmtCr,
  fmtDebt,
  fmtRate,
  fmtRateChange,
  fmtUsdWhole,
} from "@/lib/liquity/figure-format";
import { formatRatio } from "@/lib/shared/ratio-format";
import type { RatioMode } from "@/lib/shared/preferences";

// ── Formatters ───────────────────────────────────────────────────────────────
// fmtColl / fmtDebt / fmtUsdWhole / fmtAccrued / fmtRate / fmtCr are the T2
// grid's formats; `fmt` and `fmtUsd` are for figures stated only here.

/** Collateral at the card ledger's decimals where the build set them. */
const fmtColl = (n: number): string => collFigure(n, fmtCollAt4(n));

function fmt(n: number): string {
  if (!isFinite(n)) return "0";
  if (n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (abs >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  const decimals = Math.min(8, Math.ceil(-Math.log10(abs)) + 2);
  return n.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

function fmtUsd(value: number): string {
  if (value < 0.01) return "< $0.01";
  if (value < 1) return `$${value.toFixed(2)}`;
  return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** A debt figure as the grid writes it, with its symbol. */
function fmtCurrency(n: number, asset: string): string {
  return `${fmtDebt(n)} ${asset}`;
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

/** The branch's minimum collateral ratio in percent (lib/liquity/asset-catalog.ts). */
function getLiquidationThreshold(collType: string): number {
  return Math.round((branchMcr(collType) ?? 0) * 100);
}

/** A percentage of a price, whole ("66%"). */
function fmtPctWhole(fraction: number): string {
  return `${Math.round(Math.abs(fraction) * 100)}%`;
}

/** The interest (and, on a batched trove, the management fee) accrued since
 *  the trove's previous event, as the debt cell's sub-line states it. */
function accrualClause(accrual: LiquityAccrual, debtSym: string): ClauseInput {
  if (!(accrual.total > 0.01)) return null;
  const total = fig(undefined, `${fmtAccrued(accrual.total)} ${debtSym}`);
  return accrual.batched
    ? clause(
        <>
          Interest and fees of {total} accrued since the last operation
          {accrual.split && accrual.fee > 0.005 ? (
            <>
              , including a {fmtAccrued(accrual.fee)} {debtSym} management fee
            </>
          ) : null}
          .
        </>,
      )
    : clause(<>Interest of {total} accrued since the last operation.</>);
}

/** The ratio before → after, both at this event's price. */
function ratioClause(s: LiquityEventSafety, collSym: string, mode: RatioMode): ClauseInput {
  if (s.crBefore == null || s.crAfter == null || s.price <= 0) return null;
  const dir = s.crAfter > s.crBefore ? "rose" : s.crAfter < s.crBefore ? "fell" : null;
  if (!dir) return null;
  return clause(
    <>
      At the event&rsquo;s {fmtUsdWhole(s.price)} {collSym} price, the collateral ratio {dir} from{" "}
      {ratioPair(s.crBefore, mode)} to {ratioPair(s.crAfter, mode)}.
    </>,
  );
}

/** Where liquidation now lies, against where it lay before the event. */
function liqPriceClause(s: LiquityEventSafety, collSym: string): ClauseInput {
  if (s.liqPriceAfter == null || s.price <= 0) return null;
  const below = 1 - s.liqPriceAfter / s.price;
  const at = fmtUsdWhole(s.liqPriceAfter);
  if (below <= 0) return null;
  const before =
    s.liqPriceBefore != null && fmtUsdWhole(s.liqPriceBefore) !== at ? (
      <>, against {fmtUsdWhole(s.liqPriceBefore)} before</>
    ) : null;
  return clause(
    <>
      Liquidation would now come at {collSym} {at}, {fmtPctWhole(below)} below that price{before}.
    </>,
  );
}

/** The market's move since the previous event, where it consumed a material
 *  share of the trove's room above the minimum (lib/shared/market-note.ts). */
function marketMoveClause(s: LiquityEventSafety, collSym: string): ClauseInput {
  if (!s.priceMoveMaterial || s.priceChange == null || s.prevPrice == null) return null;
  return clause(
    <>
      {collSym} had {s.priceChange < 0 ? "fallen" : "risen"} {fmtPctWhole(s.priceChange)} since the previous event, from{" "}
      {fmtUsdWhole(s.prevPrice)} to {fmtUsdWhole(s.price)}.
    </>,
  );
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

/** A collateral ratio, stated alongside its LTV form (the T3 ratio-pair rule,
 *  rails-ops standards/detail-page-anatomy.md, "The disclosure ladder"): T3
 *  states both the collateral ratio and the LTV; whichever the viewer's
 *  CR/LTV preference makes T2 show is foreground (bold, with no invented
 *  provenance, since T2 exports no ratio receipt to echo, so this is
 *  `fig(undefined, …)` rather than a `<Prov echo>`), and the other stays
 *  plain (muted by the pane's ambient tone). The wording around the figure
 *  never changes, only the bold moves. Both forms are written at T2's own
 *  2-decimal format (`fmtCr` / `formatRatio(cr, "ltv", 2)`). `cr` must be > 0;
 *  every call site already gates on that before reaching for a ratio figure. */
function ratioPair(cr: number, mode: RatioMode): ReactNode {
  const crText = fmtCr(cr);
  const ltvText = formatRatio(cr, "ltv", 2);
  return mode === "ltv" ? (
    <>
      {crText} (LTV {fig(undefined, ltvText)})
    </>
  ) : (
    <>
      {fig(undefined, crText)} (LTV {ltvText})
    </>
  );
}

/** The upfront fee the debt cell's sub-line shows ("+30.79 fee"), stated with
 *  its reason so the before→after debt adds up. `reason` finishes the sentence
 *  after the fee. Null where the event charged none. */
function upfrontFeeClause(ctx: LiquityContext, coords: EventCoords, reason: ReactNode): ClauseInput {
  const fee = ctx.troveOperation?.debtIncreaseFromUpfrontFee ?? 0;
  if (!(fee > 0)) return null;
  const debtSym = ctx.assetType ?? "BOLD";
  return clause(
    <>
      An upfront fee of {fig(upfrontFeeProv(ctx, coords), fmtCurrency(fee, debtSym))} was added to the debt{reason}.
    </>,
  );
}

/** Same-block note: the header's "1 of 2" chip means this trove had more than
 *  one event in the block. Stated once, in plain words, with the block. */
function sameBlockClause(ctx: LiquityContext, coords: EventCoords): ClauseInput {
  const g = ctx.blockGrouping;
  if (!g?.isGrouped || !(g.sameBlockCount > 1)) return null;
  return clause(
    <>
      This trove had {g.sameBlockCount} events in block{" "}
      {coords.blockNumber != null ? coords.blockNumber.toLocaleString("en-US") : "this block"}; this is{" "}
      {fig(undefined, `${g.sameBlockIndex} of ${g.sameBlockCount}`)}, in the order the block recorded them.
    </>,
  );
}

// ── open ─────────────────────────────────────────────────────────────────────

function openTroveSlots(
  ctx: LiquityContext,
  coords: EventCoords,
  mode: RatioMode,
  safety: LiquityEventSafety,
): EventProseSlots {
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
        borrowing {fig(undefined, fmtCurrency(principalBorrowed, debtSym))} against it.
      </>,
    ),
  ];

  const changed: ClauseInput[] = [
    upfrontFee > 0
      ? clause(
          <>
            A one-time borrowing fee of {fig(feeAfter, fmtCurrency(upfrontFee, debtSym))} was added to the debt,
            equivalent to 7 days of average interest.
          </>,
        )
      : null,
    clause(
      <>
        Its total initial debt stands at {fig(debtDelta, fmtCurrency(stateAfter.debt, debtSym))}
        {upfrontFee > 0 ? ", including that fee" : ""}.
      </>,
    ),
    clause(<>A 0.0375 ETH liquidation reserve is set aside on open and returned when the trove closes.</>),
    collUsd > 0
      ? clause(
          <>
            At the price at the time, that collateral is worth {fig(undefined, fmtUsdWhole(collUsd))}
            {collateralPrice > 0 ? (
              <>
                {" "}
                ({collSym} at {fig(undefined, fmtUsdWhole(collateralPrice))})
              </>
            ) : null}
            .
          </>,
        )
      : null,
  ];

  const meansNow: ClauseInput[] = [
    clause(<>The trove opened at a {ratioPair(stateAfter.collateralRatio, mode)} collateral ratio.</>),
    liqPriceClause(safety, collSym),
    clause(
      <>
        It accrues interest at {fig(rateAfter, fmtRate(stateAfter.annualInterestRate))} a year, added to the debt as it
        accrues.
      </>,
    ),
  ];

  if (ctx.operation === "openTroveAndJoinBatch" && ctx.batchUpdate) {
    const bu = ctx.batchUpdate;
    meansNow.push(
      clause(
        <>
          The trove joined a batch manager on open
          {(bu.interestBatchManager ?? ctx.batchManager) ? (
            <>
              , delegating its rate to {delegateLink((bu.interestBatchManager ?? ctx.batchManager)!)} at{" "}
              {fig(undefined, fmtRate(bu.annualInterestRate))} APR
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

function closeTroveSlots(ctx: LiquityContext, coords: EventCoords, mode: RatioMode): EventProseSlots {
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
          Before closing, the trove was paying {fig(undefined, fmtRate(stateBefore.annualInterestRate))} annual
          interest.
        </>,
      ),
    );
  }
  if (debtRepaid > 0 && stateBefore.collateralRatio > 0) {
    meansNow.push(clause(<>It closed at a {ratioPair(stateBefore.collateralRatio, mode)} collateral ratio.</>));
  }
  meansNow.push(clause(<>The trove NFT was sent to the burn address, ending its ownership.</>));
  meansNow.push(clause(<>Nothing remains on either side.</>));

  return { happened, changed, meansNow };
}

// ── adjust (incl. no-change single + collapsed run) ──────────────────────────

function adjustTroveSlots(
  ctx: LiquityContext,
  coords: EventCoords,
  accrual: LiquityAccrual,
  safety: LiquityEventSafety,
  mode: RatioMode,
): EventProseSlots {
  const { troveOperation, stateBefore, stateAfter, collateralType, collateralPrice } = ctx;
  const debtSym = ctx.assetType ?? "BOLD";
  const totalAccruedFees = accrual.total;

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

  const changed: ClauseInput[] = [accrualClause(accrual, debtSym)];
  if (adjustFee > 0) {
    changed.push(
      clause(
        <>
          The adjustment charged a {fig(feeAfter, fmtCurrency(adjustFee, debtSym))} borrowing fee, equivalent to 7 days
          of average interest on the borrow market.
        </>,
      ),
    );
  }
  // A liquidated neighbour's redistribution this touch applied: what arrived,
  // then the debt's balance check with it as its own term.
  const redist = liquityRedistOnAdjust(ctx);
  if (redist) {
    const legs: ReactNode[] = [];
    if (redist.debt >= 0.01)
      legs.push(<>{fig(redistArrivalProv(ctx, "debt", coords), fmtCurrency(redist.debt, debtSym))} of debt</>);
    if (redist.coll > 1e-9)
      legs.push(
        <>{fig(redistArrivalProv(ctx, "coll", coords), `${fmtColl(redist.coll)} ${collateralType}`)} of collateral</>,
      );
    changed.push(
      clause(
        <>
          Liquidations on the {collateralType} branch passed this trove {legs[0]}
          {legs[1] ? <> and {legs[1]}</> : null} since its last change, applied at this touch.
        </>,
      ),
    );
    if (redist.debt >= 0.01)
      changed.push(
        clause(
          <>
            Debt: {fmtDebt(stateBefore.debt)} before
            {Math.abs(debtChange) >= TROVE_DELTA_EPSILON ? (
              <>
                {" "}
                {debtChange < 0 ? "−" : "+"} {fmtDebt(Math.abs(debtChange))} {debtChange < 0 ? "repaid" : "borrowed"}
              </>
            ) : null}
            {adjustFee > 0 ? <> + {fmtDebt(adjustFee)} fee</> : null} + {fmtDebt(redist.debt)} from the liquidation
            {totalAccruedFees > 0.01 ? (
              <>
                {" "}
                + {fmtAccrued(totalAccruedFees)} {accrual.batched ? "interest and fees" : "interest"}
              </>
            ) : null}{" "}
            = {fmtCurrency(stateAfter.debt, debtSym)}.
          </>,
        ),
      );
  }
  if (!redist && debtChange > 0 && (adjustFee > 0 || totalAccruedFees > 0.01)) {
    const totalIncrease = stateAfter.debt - stateBefore.debt;
    changed.push(
      clause(
        <>
          Its debt rose by {fig(undefined, fmtCurrency(totalIncrease, debtSym))} in total:{" "}
          {fig(undefined, fmtCurrency(debtChange, debtSym))} borrowed
          {totalAccruedFees > 0.01 ? <> + {fig(undefined, fmtAccrued(totalAccruedFees))} accrued</> : null}
          {adjustFee > 0 ? <> + {fig(undefined, fmtDebt(adjustFee))} fee</> : null}.
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
          At the price at the time, that collateral is worth {fig(undefined, fmtUsdWhole(afterCollUsd))} (
          {fig(undefined, fmtUsdWhole(collateralPrice))} / {collateralType}).
        </>,
      ),
    );
  }
  meansNow.push(ratioClause(safety, collateralType, mode));
  meansNow.push(liqPriceClause(safety, collateralType));
  meansNow.push(marketMoveClause(safety, collateralType));
  if (stateBefore.annualInterestRate !== stateAfter.annualInterestRate) {
    meansNow.push(
      clause(
        <>
          The annual interest rate moved from {fig(undefined, fmtRate(stateBefore.annualInterestRate))} to{" "}
          {fig(rateAfter, fmtRate(stateAfter.annualInterestRate))}.
        </>,
      ),
    );
  } else {
    meansNow.push(
      clause(<>The annual interest rate stays at {fig(rateAfter, fmtRate(stateAfter.annualInterestRate))}.</>),
    );
  }

  return {
    happened,
    changed: changed.filter(Boolean) as ClauseInput[],
    meansNow: meansNow.filter(Boolean) as ClauseInput[],
  };
}

// ── adjust interest rate ─────────────────────────────────────────────────────

function adjustRateSlots(
  ctx: LiquityContext,
  coords: EventCoords,
  accrual: LiquityAccrual,
  mode: RatioMode,
): EventProseSlots {
  const { stateBefore, stateAfter, collateralType, collateralPrice } = ctx;
  const debtSym = ctx.assetType ?? "BOLD";
  const increased = stateAfter.annualInterestRate > stateBefore.annualInterestRate;
  const rateAfter = rateAfterProv(ctx, coords);
  const afterCollUsd = stateAfter.coll * collateralPrice;

  const happened: ClauseInput[] = [
    clause(
      <>
        This adjustment {increased ? "raised" : "lowered"} the trove&rsquo;s interest rate from{" "}
        {fig(undefined, fmtRate(stateBefore.annualInterestRate))} to{" "}
        {fig(rateAfter, fmtRate(stateAfter.annualInterestRate))} APR.
      </>,
    ),
  ];

  const changed: ClauseInput[] = [accrualClause(accrual, debtSym)];
  changed.push(
    upfrontFeeClause(
      ctx,
      coords,
      <>
        , because the rate changed within 7 days of the trove&rsquo;s previous rate change; the fee equals 7 days of
        average interest
      </>,
    ),
  );

  const meansNow: ClauseInput[] = [];
  if (stateAfter.debt > 0) {
    meansNow.push(clause(<>Its debt now stands at {fig(undefined, `${fmtCurrency(stateAfter.debt, debtSym)}`)}.</>));
  }
  if (stateAfter.coll > 0 && afterCollUsd > 0) {
    meansNow.push(
      clause(
        <>
          The collateral remains {fig(undefined, `${fmtColl(stateAfter.coll)} ${collateralType}`)} (
          {fig(undefined, fmtUsdWhole(afterCollUsd))}).
        </>,
      ),
    );
  }
  if (stateAfter.collateralRatio > 0) {
    meansNow.push(clause(<>The collateral ratio is {ratioPair(stateAfter.collateralRatio, mode)}.</>));
  }

  return { happened, changed, meansNow };
}

// ── applyPendingDebt ─────────────────────────────────────────────────────────

function applyPendingDebtSlots(ctx: LiquityContext, coords: EventCoords, mode: RatioMode): EventProseSlots {
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
        This event applied {fig(debtDelta, fmtCurrency(redistDebt, debtSym))} of pending redistribution debt to the
        trove
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
          {afterCollUsd > 0 ? <> ({fig(undefined, fmtUsdWhole(afterCollUsd))})</> : null}.
        </>,
      ),
    );
  }
  meansNow.push(clause(<>Interest accrues at {fig(rateAfter, fmtRate(stateAfter.annualInterestRate))} a year.</>));
  if (stateAfter.collateralRatio > 0) {
    meansNow.push(clause(<>The collateral ratio is {ratioPair(stateAfter.collateralRatio, mode)}.</>));
  }

  return { happened, changed, meansNow };
}

// ── liquidate (beneficial redistribution + destructive) ──────────────────────

function liquidateSlots(
  ctx: LiquityContext,
  coords: EventCoords,
  mode: RatioMode,
  /** When the owner claimed the surplus (the page's head read); undefined
   *  while it is unclaimed or unknown, null when claimed but undated. */
  surplusClaimedAt?: number | null,
): EventProseSlots {
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
            Its collateral ratio moved from {ratioPair(stateBefore.collateralRatio, mode)} to{" "}
            {ratioPair(stateAfter.collateralRatio, mode)}.
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
        This trove was liquidated: its collateral ratio had dropped to {ratioPair(crAtLiquidation, mode)}, below the{" "}
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
        {fig(undefined, fmtUsdWhole(totalCollValueUsd))} at the price at the time.
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
          {fmtUsd(collSurplusValueUsd)}){" "}
          {surplusClaimedAt === undefined
            ? "remains claimable by the borrower."
            : `was left claimable by the borrower, who claimed it${surplusClaimedAt != null ? ` on ${formatDate(surplusClaimedAt)}` : ""}.`}
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

function redeemSlots(
  ctx: LiquityContext,
  coords: EventCoords,
  mode: RatioMode,
  safety: LiquityEventSafety,
  currentPrice?: number,
): EventProseSlots {
  const { redemption, stateAfter, troveOperation, collateralType, collateralPrice } = ctx;
  const debtSym = ctx.assetType ?? "BOLD";

  if (!redemption) {
    return { happened: [clause(<>The {collateralType} trove was redeemed.</>)] };
  }

  const collRedeemed = troveOperation ? Math.abs(troveOperation.collChangeFromOperation) : redemption.ETHSent;
  const debtRedeemed = troveOperation ? Math.abs(troveOperation.debtChangeFromOperation) : redemption.actualBoldAmount;
  // This trove's share of the fee: `redemptionFee` is the collateral the redemption left in this trove;
  // `ETHFee` is the whole redemption's, so it is pro-rated by debt cleared when the share is missing.
  const wholeFee = Number(redemption.ETHFee) || 0;
  const redemptionFee =
    Number(redemption.redemptionFee) ||
    (redemption.actualBoldAmount > 0 ? (wholeFee * debtRedeemed) / redemption.actualBoldAmount : 0);
  // The rate against the collateral drawn from this trove (sent to the redeemer plus the fee left behind).
  // Four decimals lose most of a small fee (0.001446 reads 0.0014), so under 0.01 it keeps four significant figures.
  const fmtFee = (n: number) =>
    n > 0 && n < 0.01 ? n.toLocaleString("en-US", { maximumSignificantDigits: 4 }) : fmtColl(n);
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
          {redemption.actualBoldAmount > debtRedeemed + 0.01 ? "This trove’s share of the" : "The"} redemption fee,{" "}
          {fmtFee(redemptionFee)} {collateralType} ({fmtUsd(feeValueMarket)}) or {feeRate.toFixed(3)}% of the collateral
          drawn from it, was paid by the redeemer and stays in the trove as extra collateral.
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
            With no debt, interest accrual has stopped and the {fig(undefined, fmtRate(stateAfter.annualInterestRate))}{" "}
            rate is inactive.
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
            {fig(rateAfter, fmtRate(stateAfter.annualInterestRate))}.
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
            {ratioPair(stateAfter.collateralRatio, mode)}.
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
            Interest keeps accruing at {fig(rateAfter, fmtRate(stateAfter.annualInterestRate))}; if the debt later rises
            back above 2,000 {debtSym}, the trove returns to normal behaviour.
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
            collateral ratio to {ratioPair(stateAfter.collateralRatio, mode)}.
          </>,
        ),
      );
      meansNow.push(
        clause(
          <>
            The trove keeps its interest rate through a redemption, still at{" "}
            {fig(rateAfter, fmtRate(stateAfter.annualInterestRate))}.
          </>,
        ),
      );
    }
  }

  const liq = liqPriceClause(safety, collateralType);
  if (liq && stateAfter.debt > 0) meansNow.push(liq);

  // The net outcome (charter §5.4) at the redemption's price, then the
  // comparison with today's price where the page has it (a REDEMPTION_TODAY
  // variant, by the direction WETH has moved since).
  if (collateralPrice > 0) {
    const netHistoric = debtRedeemed - collValueMarketPrice;
    const s = (n: number) => (n >= 0 ? "+" : "−");
    meansNow.push(
      clause(
        <>
          At the redemption&rsquo;s price, the debt cleared minus the collateral taken is{" "}
          {fig(undefined, fmtUsdWhole(debtRedeemed))} &minus;{" "}
          {fig(collDelta, `${fmtColl(collRedeemed)} ${collateralType}`)} &times;{" "}
          {fig(undefined, fmtUsdWhole(collateralPrice))} ={" "}
          {fig(undefined, `${s(netHistoric)}${fmtUsdWhole(Math.abs(netHistoric))}`)}.
        </>,
      ),
    );
    const variant = redemptionTodayVariant(collateralPrice, currentPrice, debtRedeemed, collRedeemed);
    if (variant && currentPrice) {
      meansNow.push(
        REDEMPTION_TODAY[variant].render({
          collSym: collateralType,
          priceAtEvent: collateralPrice,
          priceToday: currentPrice,
          vsToday: Math.abs(debtRedeemed - collRedeemed * currentPrice),
        }),
      );
    }
  }

  return { happened, changed, meansNow };
}

// ── pricing rule (BRIEF 7.3) ─────────────────────────────────────────────────
// Every clause reads the event's oracle price unless its entry here declares
// `price: "today"`. A today clause states both prices, says "today", is framed
// as hypothetical, and carries wording for each direction of the move.

type PriceBasis = "event" | "today";

interface TodayClauseInput {
  collSym: string;
  priceAtEvent: number;
  priceToday: number;
  /** |debt cleared − collateral taken × today's price|, USD. */
  vsToday: number;
}

type RedemptionTodayVariant = "price_lower_now" | "price_higher_now";

/** Which redemption-vs-today variant applies, by where the price has gone
 *  since; null with no today price, or where the redeemed collateral at
 *  today's price still sits on the same side of the debt it paid off as at
 *  the redemption (a move smaller than the fee). */
function redemptionTodayVariant(
  priceAtEvent: number,
  priceToday: number | undefined,
  debtCleared: number,
  collTaken: number,
): RedemptionTodayVariant | null {
  if (!priceToday || !(priceToday > 0) || fmtUsdWhole(priceToday) === fmtUsdWhole(priceAtEvent)) return null;
  const vsToday = collTaken * priceToday - debtCleared;
  if (priceToday < priceAtEvent) return vsToday < 0 ? "price_lower_now" : null;
  return vsToday > 0 ? "price_higher_now" : null;
}

const REDEMPTION_TODAY: Record<
  RedemptionTodayVariant,
  { price: PriceBasis; render: (v: TodayClauseInput) => ClauseInput }
> = {
  price_lower_now: {
    price: "today",
    render: (v) =>
      clause(
        <>
          {v.collSym} has since fallen to {fmtUsdWhole(v.priceToday)} today, from {fmtUsdWhole(v.priceAtEvent)}, so the
          redeemed {v.collSym} would now be worth {fmtUsdWhole(v.vsToday)} less than the debt it paid off.
        </>,
      ),
  },
  price_higher_now: {
    price: "today",
    render: (v) =>
      clause(
        <>
          {v.collSym} has since risen to {fmtUsdWhole(v.priceToday)} today, from {fmtUsdWhole(v.priceAtEvent)}, so had
          the trove kept the redeemed {v.collSym}, it would now be worth {fmtUsdWhole(v.vsToday)} more than the debt it
          paid off.
        </>,
      ),
  },
};

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

function setBatchManagerSlots(
  ctx: LiquityContext,
  coords: EventCoords,
  accrual: LiquityAccrual,
  mode: RatioMode,
): EventProseSlots {
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
              Its debt updated from {fig(undefined, fmtCurrency(stateBefore.debt, debtSym))} to{" "}
              {fig(undefined, `${fmtCurrency(stateAfter.debt, debtSym)}`)}
              {accrual.total > 0.01 ? ", reflecting accrued interest" : ""}.
            </>,
          )
        : clause(<>Its debt is unchanged at {fig(undefined, `${fmtCurrency(stateAfter.debt, debtSym)}`)}.</>),
    );
  }

  changed.push(
    upfrontFeeClause(
      ctx,
      coords,
      <>: joining a batch charges the upfront fee, 7 days of interest at the branch&rsquo;s average rate</>,
    ),
  );

  const meansNow: ClauseInput[] = [];
  if (stateAfter.coll > 0) {
    meansNow.push(
      clause(<>The collateral remains {fig(undefined, `${fmtColl(stateAfter.coll)} ${collateralType}`)}.</>),
    );
  }
  if (stateAfter.annualInterestRate > 0) {
    meansNow.push(
      clause(
        <>The trove now accrues at a delegated rate of {fig(rateAfter, fmtRate(stateAfter.annualInterestRate))} APR.</>,
      ),
    );
  }
  if (stateAfter.collateralRatio > 0) {
    meansNow.push(clause(<>The collateral ratio is {ratioPair(stateAfter.collateralRatio, mode)}.</>));
  }

  return { happened, changed, meansNow };
}

function removeFromBatchSlots(
  ctx: LiquityContext,
  coords: EventCoords,
  accrual: LiquityAccrual,
  mode: RatioMode,
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
  if (accrual.split && accrual.fee > 0.01) {
    changed.push(
      clause(
        <>
          About {fmtAccrued(accrual.fee)} {debtSym} of batch management fees had accrued.
        </>,
      ),
    );
  }
  changed.push(
    upfrontFeeClause(
      ctx,
      coords,
      <>
        , because leaving a delegate within 7 days of the trove&rsquo;s previous rate change counts as a rate change;
        the fee equals 7 days of average interest
      </>,
    ),
  );

  const meansNow: ClauseInput[] = [];
  if (stateAfter.debt > 0) {
    meansNow.push(clause(<>Its debt now stands at {fig(undefined, `${fmtCurrency(stateAfter.debt, debtSym)}`)}.</>));
  }
  if (stateAfter.coll > 0 && afterCollUsd > 0) {
    meansNow.push(
      clause(
        <>
          The collateral is {fig(undefined, `${fmtColl(stateAfter.coll)} ${collateralType}`)} (
          {fig(undefined, fmtUsdWhole(afterCollUsd))}).
        </>,
      ),
    );
  }
  if (stateAfter.annualInterestRate !== stateBefore.annualInterestRate) {
    meansNow.push(
      clause(
        <>
          The rate moved from {fig(undefined, fmtRate(stateBefore.annualInterestRate))} to a self-set{" "}
          {fig(rateAfter, fmtRate(stateAfter.annualInterestRate))}.
        </>,
      ),
    );
  }
  if (stateAfter.collateralRatio > 0) {
    meansNow.push(clause(<>The collateral ratio is {ratioPair(stateAfter.collateralRatio, mode)}.</>));
  }

  return { happened, changed, meansNow };
}

function batchRateUpdateSlots(ctx: LiquityContext, coords: EventCoords): EventProseSlots {
  const { stateBefore, stateAfter, collateralType, collateralPrice } = ctx;
  const debtSym = ctx.assetType ?? "BOLD";
  const rateChange = fmtRateChange(stateBefore.annualInterestRate, stateAfter.annualInterestRate);
  const afterCollUsd = stateAfter.coll * collateralPrice;
  const rateAfter = rateAfterProv(ctx, coords);

  const happened: ClauseInput[] = [
    rateChange.changed
      ? clause(
          <>
            The batch manager {stateAfter.annualInterestRate > stateBefore.annualInterestRate ? "raised" : "lowered"}{" "}
            the delegated interest rate from {fig(undefined, rateChange.before)} to {fig(rateAfter, rateChange.after)}{" "}
            APR.
          </>,
        )
      : clause(<>The batch manager kept the delegated interest rate at {fig(rateAfter, rateChange.after)} APR.</>),
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
      // The grid shows only the rate cell on a delegate's rate change, so the
      // position figures below are stated here alone and stay muted.
      clause(<>The trove&rsquo;s debt now stands at {fmtCurrency(stateAfter.debt, debtSym)}.</>),
    );
  }
  if (stateAfter.coll > 0 && afterCollUsd > 0) {
    meansNow.push(
      clause(
        <>
          Its collateral is {fmtColl(stateAfter.coll)} {collateralType} ({fmtUsd(afterCollUsd)}).
        </>,
      ),
    );
  }
  if (stateAfter.collateralRatio > 0) {
    meansNow.push(clause(<>The collateral ratio is {fmtCr(stateAfter.collateralRatio)}.</>));
  }

  return { happened, meansNow };
}

// ── transfer ─────────────────────────────────────────────────────────────────

function transferSlots(ctx: LiquityContext, mode: RatioMode): EventProseSlots {
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
            {ratioPair(stateAfter.collateralRatio, mode)} ratio and a{" "}
            {fig(undefined, fmtRate(stateAfter.annualInterestRate))} interest rate
            {collateralPrice > 0 ? (
              <>
                {" "}
                ({collateralType} at {fig(undefined, fmtUsdWhole(collateralPrice))})
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
  mode: RatioMode,
  previousEvent?: BaseActivityEvent,
  currentEvent?: BaseActivityEvent,
  currentPrice?: number,
  /** See liquidateSlots. */
  surplusClaimedAt?: number | null,
  /** The accrual as the page's ledger states it (useLiquityAccrual); worked
   *  from the logs where absent. */
  accrual?: LiquityAccrual,
): EventProseSlots {
  const slots = liquityEventSlotsFor(
    ctx,
    coords,
    mode,
    accrual ?? liquityAccrual(ctx, previousEvent, currentEvent),
    liquityEventSafety(ctx, previousEvent),
    currentPrice,
    surplusClaimedAt,
  );
  const same = sameBlockClause(ctx, coords);
  return same ? { ...slots, meansNow: [...(slots.meansNow ?? []), same] } : slots;
}

function liquityEventSlotsFor(
  ctx: LiquityContext,
  coords: EventCoords,
  mode: RatioMode,
  accrual: LiquityAccrual,
  safety: LiquityEventSafety,
  currentPrice?: number,
  surplusClaimedAt?: number | null,
): EventProseSlots {
  switch (ctx.operation) {
    case "openTrove":
    case "openTroveAndJoinBatch":
      return openTroveSlots(ctx, coords, mode, safety);
    case "closeTrove":
      return closeTroveSlots(ctx, coords, mode);
    case "adjustTrove":
      return adjustTroveSlots(ctx, coords, accrual, safety, mode);
    case "adjustTroveInterestRate":
      return adjustRateSlots(ctx, coords, accrual, mode);
    case "liquidate":
      return liquidateSlots(ctx, coords, mode, surplusClaimedAt);
    case "redeemCollateral":
    case "adjustZombieTrove":
    case "adjustUnredeemableZombieTrove":
      return redeemSlots(ctx, coords, mode, safety, currentPrice);
    case "applyPendingDebt":
      return applyPendingDebtSlots(ctx, coords, mode);
    case "setInterestBatchManager":
      return setBatchManagerSlots(ctx, coords, accrual, mode);
    case "removeFromBatch":
      return removeFromBatchSlots(ctx, coords, accrual, mode);
    case "setBatchManagerAnnualInterestRate":
      return batchRateUpdateSlots(ctx, coords);
    case "transferTrove":
      return transferSlots(ctx, mode);
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
  mode: RatioMode,
  previousEvent?: BaseActivityEvent,
  currentEvent?: BaseActivityEvent,
  currentPrice?: number,
  accrual?: LiquityAccrual,
): ReactNode | null {
  return splitLead(
    eventClauses(liquityEventSlots(ctx, coords, mode, previousEvent, currentEvent, currentPrice, undefined, accrual)),
  ).lead;
}
