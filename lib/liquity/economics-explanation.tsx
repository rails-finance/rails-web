// Liquity V2 economics Explanation — the bullets the bespoke
// components/protocol/liquity/trove-economics.tsx built as `economicsItems`,
// carried over verbatim (the redemption net-outcome strip keeps its own
// slot on the heading-button row via `liquityRedemptionOutcome`; the
// batch/delegate wording is kept) now that the tower itself is the shared
// <ChainTruthTower>. The "?" FAQ stays `liquityEconomicsContent` from
// lib/shared/learn-more-content.ts — unchanged, so it isn't duplicated here.
//
// `liquityEconomicsExplanation` takes only `economics` + `meta` (no raw
// events, no live price) so it re-derives the few figures the bespoke
// component computed inline — entireDebt, the interest/delegate-fee split,
// and net-of-surplus liquidated collateral — using the exact same formulas
// as lib/liquity/economics.ts's computeLiquityEconomics. `hasLiquidationEvents`
// substitutes for the bespoke tower's raw-event scan: `economics.liquidation`
// is non-null under precisely the same condition (the replay sets it exactly
// when a `liquidate` operation was seen).

import type { ReactNode } from "react";
import type { TroveEconomics as TroveEconomicsType } from "@/types/api/trove";
import type { TroveMeta } from "@/lib/liquity/economics";
import { calculateAccruedInterest } from "@/lib/liquity/utils/interest-calculator";
import { formatPrice, formatUsdValue } from "@/components/shared/economics-chart-primitives";
import { LIQUIDATION_RESERVE_ETH } from "@/components/transaction-timeline/explanation/shared/eventHelpers";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { formatExact } from "@/lib/utils/format";

const DUST = 1e-9;

/** `currentPrice` — the branch's live oracle price, where the page has one.
 *  It is only used to restate the redemption outcome at today's value, the
 *  same figure the heading-row strip shows; without it that clause is simply
 *  omitted (the home page's live example passes none). */
export function liquityEconomicsExplanation(
  economics: TroveEconomicsType,
  meta: TroveMeta,
  currentPrice?: number,
): ReactNode {
  const { position, costs, redemption, liquidation, gas } = economics;
  const stableSymbol = meta.stablecoinSymbol;
  const collateralSymbol = meta.collateralType;

  // Same derivations as computeLiquityEconomics — see that file for the
  // fuller comments on each formula.
  const entireDebt =
    meta.status === "open" && meta.currentDebt > 0
      ? meta.currentDebt +
        calculateAccruedInterest(meta.currentDebt, meta.interestRate, meta.lastActivityAt, Date.now() / 1000)
      : meta.currentDebt;
  const totalInterestAndMgmtFees = Math.max(
    0,
    entireDebt +
      position.totalRepaid +
      (redemption?.totalDebtCleared ?? 0) +
      (liquidation?.totalDebtCleared ?? 0) -
      position.totalBorrowed -
      costs.totalUpfrontFees,
  );
  const apiMgmtFees = costs.totalManagementFees ?? 0;
  const mgmtRate = meta.isInBatch ? meta.batchManagementFee : 0;
  const totalRate = meta.interestRate;
  const delegateFees =
    apiMgmtFees > 0
      ? Math.min(apiMgmtFees, totalInterestAndMgmtFees)
      : mgmtRate > 0 && totalRate > 0
        ? totalInterestAndMgmtFees * (mgmtRate / totalRate)
        : 0;
  const interestAccrued = Math.max(0, totalInterestAndMgmtFees - delegateFees);
  const totalCosts = costs.totalUpfrontFees + totalInterestAndMgmtFees;

  const hasLiquidationEvents = liquidation != null;
  const rawLiquidatedColl = Math.max(
    0,
    position.totalCollateralDeposited +
      (redemption?.totalFeesRetained ?? 0) -
      meta.collateralAmount -
      position.totalCollateralWithdrawn -
      (redemption?.totalCollateralLost ?? 0),
  );
  const liquidatedColl = hasLiquidationEvents && rawLiquidatedColl > 0.0001 ? rawLiquidatedColl : 0;
  const claimableSurplus = liquidation?.totalCollateralSurplus ?? 0;
  const liquidatedSeized = claimableSurplus > 0 ? Math.max(0, liquidatedColl - claimableSurplus) : liquidatedColl;
  const feesReceivedColl = redemption?.totalFeesRetained ?? 0;

  const fig = (n: number) => (
    <span className="font-semibold text-foreground tabular-nums">
      {formatPrice(n)} {stableSymbol}
    </span>
  );
  const collFig = (n: number, dp: number = 2) => (
    <span className="font-semibold text-foreground tabular-nums">
      {n.toFixed(dp)} {collateralSymbol}
    </span>
  );

  const items: ReactNode[] = [];

  if (position.totalBorrowed > 0) {
    items.push(
      <span key="debt-tower">
        Debt started from {fig(position.totalBorrowed)} borrowed
        {totalCosts > 0 && <> plus {fig(totalCosts)} in costs</>}
        {position.totalRepaid > 0 && <>, then {fig(position.totalRepaid)} was repaid</>}
        {redemption && redemption.totalDebtCleared > 0 && (
          <>
            {position.totalRepaid > 0 ? " and " : ", then "}
            {fig(redemption.totalDebtCleared)} redeemed
          </>
        )}
        {liquidation && liquidation.totalDebtCleared > 0 && <> and {fig(liquidation.totalDebtCleared)} liquidated</>},
        leaving {fig(entireDebt)} owed today.
      </span>,
    );
  }

  if (interestAccrued > 0 || costs.totalUpfrontFees > 0) {
    items.push(
      <span key="costs">
        Costs are {fig(interestAccrued)} interest accrued over the trove&apos;s life
        {costs.totalUpfrontFees > 0 && <> plus {fig(costs.totalUpfrontFees)} in upfront fees</>}
        {delegateFees > 0 && <> and {fig(delegateFees)} in delegate fees</>}.
      </span>,
    );
  }

  if (position.totalCollateralDeposited > 0) {
    const withdrawn = position.totalCollateralWithdrawn;
    const redeemedColl = redemption?.totalCollateralLost ?? 0;
    items.push(
      <span key="coll-tower">
        Collateral started from {collFig(position.totalCollateralDeposited)} deposited
        {withdrawn > 0 && <>, then {collFig(withdrawn)} was withdrawn</>}
        {redeemedColl > 0 && (
          <>
            {withdrawn > 0 ? " and " : ", then "}
            {collFig(redeemedColl)} redeemed against
          </>
        )}
        {liquidatedSeized > 0 && (
          <>
            {withdrawn > 0 || redeemedColl > 0 ? " and " : ", then "}
            {collFig(liquidatedSeized)} seized in liquidation
          </>
        )}
        {feesReceivedColl > 0 && <>, with {collFig(feesReceivedColl, 4)} received in fees</>}
        {claimableSurplus > 0 && <> and {collFig(claimableSurplus, 4)} claimable as liquidation surplus</>}, leaving{" "}
        {collFig(meta.collateralAmount)} {meta.isZombie ? "claimable" : "held"} today.
      </span>,
    );
  }

  // How the "Borrower's net outcome from redemptions" strip is arrived at —
  // the strip's receipts carry the formula, but a reader who opens this pane
  // should not have to open a receipt to learn what was compared with what.
  if (redemption && redemption.totalDebtCleared > 0) {
    const signed = (n: number) => (
      <span className="font-semibold text-foreground tabular-nums">
        {n >= 0 ? "+" : "−"}
        {formatUsdValue(Math.abs(n))}
      </span>
    );
    const usd = (n: number) => <span className="font-semibold text-foreground tabular-nums">{formatUsdValue(n)}</span>;
    const atToday = currentPrice ? redemption.totalCollateralLost * currentPrice : null;
    items.push(
      <span key="redemption-outcome">
        Redemptions cleared {fig(redemption.totalDebtCleared)} of debt at face value and took{" "}
        {collFig(redemption.totalCollateralLost)}, worth {usd(redemption.totalCollateralValueAtRedemption)} at
        Liquity&apos;s price when each redemption happened — a net {signed(redemption.realizedPL)} to the borrower.
        {atToday !== null && currentPrice && (
          <>
            {" "}
            The same {collateralSymbol} repriced at today&apos;s {usd(currentPrice)} is worth {usd(atToday)}, which
            makes it {signed(redemption.totalDebtCleared - atToday)} at today&apos;s value.
          </>
        )}
        {feesReceivedColl > 0 && (
          <> Neither figure counts the {collFig(feesReceivedColl, 4)} retained in redemption fees.</>
        )}
      </span>,
    );
  }

  if (meta.status === "open" && LIQUIDATION_RESERVE_ETH > 0) {
    items.push(
      <span key="liq-reserve">
        {LIQUIDATION_RESERVE_ETH} ETH is held in reserve and refunded when the trove is closed.
      </span>,
    );
  }

  if (gas.totalGasCostEth > DUST) {
    items.push(
      <span key="gas">
        A total of {gas.totalGasCostEth.toFixed(4)} ETH ({formatUsdValue(gas.totalGasCostUsd)}) has been spent on gas
        fees across these transactions.
      </span>,
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="space-y-2 text-sm text-rb-500">
      <p className="leading-relaxed">
        These figures total the Trove&apos;s lifetime flows across every event in its history.
      </p>
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2 leading-relaxed">
          <span className="select-none text-rb-500">•</span>
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

/** The redemption net-outcome strip that rides the tower's heading-button row
 *  (the bespoke V2 tower's `rowExtra`): realised P/L at each redemption's own
 *  price, and — when a live price is known — the same debt cleared against
 *  the lost collateral repriced today. Both figures carry their receipts. */
export function liquityRedemptionOutcome(economics: TroveEconomicsType, currentPrice?: number): ReactNode {
  const { redemption } = economics;
  if (!redemption) return undefined;
  const realizedPLProv: Provenance = {
    kind: "derived",
    summary:
      "Redemption net outcome — the BOLD debt that redemptions cleared, counted at $1 each, minus the dollar value of the collateral they took at Liquity's price for the block of each redemption.",
    via: "added up across the trove's redemptions",
    formula: "debt cleared − collateral value at redemption",
    inputs: [
      {
        label: "debt cleared",
        value: formatExact(redemption.totalDebtCleared),
        kind: "derived",
        note: "Σ redemption debt changes",
      },
      {
        label: "collateral value at redemption",
        value: formatExact(redemption.totalCollateralValueAtRedemption),
        kind: "derived",
        note: "Σ collateral lost × price at each redemption",
        pclass: "oracle",
      },
    ],
  };
  const opportunityPL = currentPrice
    ? redemption.totalDebtCleared - redemption.totalCollateralLost * currentPrice
    : null;
  const opportunityPLProv: Provenance | null = currentPrice
    ? {
        kind: "derived",
        summary:
          "Redemption net outcome at today's value — the BOLD debt that redemptions cleared, counted at $1 each, minus the collateral they took valued at Liquity's current price.",
        via: "added up across the trove's redemptions",
        formula: "debt cleared − collateral lost × current price",
        inputs: [
          {
            label: "debt cleared",
            value: formatExact(redemption.totalDebtCleared),
            kind: "derived",
            note: "Σ redemption debt changes",
          },
          {
            label: "collateral lost",
            value: formatExact(redemption.totalCollateralLost),
            kind: "derived",
            note: "Σ collateral sent to redeemers",
          },
          {
            label: "current price",
            value: formatExact(currentPrice),
            kind: "chain-derived",
            pclass: "oracle",
            note: "Chainlink's on-chain price feeds (and, for staked ETH, the token's exchange rate) at the latest block, combined by the rules in Liquity's PriceFeed contract",
          },
        ],
      }
    : null;
  return (
    // Right-aligned to mirror the position card's context line: the
    // heading-buttons hold the left edge, the summary the right.
    <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5 pl-2 text-xs text-rb-500">
      <span>Borrower&apos;s net outcome from redemptions was</span>
      <Prov info={realizedPLProv} value={formatExact(redemption.realizedPL)}>
        <span className={redemption.realizedPL >= 0 ? "text-green-400" : "text-red-400"}>
          {redemption.realizedPL >= 0 ? "+" : "−"}
          {formatUsdValue(Math.abs(redemption.realizedPL))}
        </span>
      </Prov>
      {opportunityPL !== null && opportunityPLProv && (
        <>
          <span> or </span>
          <Prov info={opportunityPLProv} value={formatExact(opportunityPL)}>
            <span className={opportunityPL >= 0 ? "text-green-400" : "text-red-400"}>
              {opportunityPL >= 0 ? "+" : "−"}
              {formatUsdValue(Math.abs(opportunityPL))}
            </span>
          </Prov>
          <span>at today&apos;s value</span>
        </>
      )}
    </div>
  );
}
