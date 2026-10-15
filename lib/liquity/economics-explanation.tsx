// Liquity V2 economics Explanation — the bullets the bespoke
// components/protocol/liquity/trove-economics.tsx built as `economicsItems`,
// carried over verbatim (the redemption net outcome is a Totals bullet via
// `liquityRedemptionOutcome`; the batch/delegate wording is kept) now that the tower itself is the shared
// <ChainTruthTower>. The "?" FAQ stays `liquityLifetimeFlowsContent` from
// lib/shared/learn-more-content.ts — unchanged, so it isn't duplicated here.
//
// The Explanation takes only `economics` + `meta` (no raw events) so it
// re-derives the few figures the bespoke
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
import { ExplainBullet, ExplainGroup, ExplainMore, Fig } from "@/components/shared/explain-groups";

const DUST = 1e-9;

/** The figures the Explanations re-derive, by the same formulas as
 *  computeLiquityEconomics (see that file for the comments on each). */
function deriveFigures(economics: TroveEconomicsType, meta: TroveMeta, now: number) {
  const { position, costs, redemption, liquidation } = economics;
  const entireDebt =
    meta.status === "open" && meta.currentDebt > 0
      ? meta.currentDebt + calculateAccruedInterest(meta.currentDebt, meta.interestRate, meta.lastActivityAt, now)
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
  return {
    entireDebt,
    delegateFees,
    interestAccrued,
    totalCosts,
    claimableSurplus,
    liquidatedSeized,
    feesReceivedColl,
  };
}

/** The redemption net outcome, a bullet of the Lifetime flows Explanation's
 *  Totals: realised P/L at each redemption's price and, when a live price is
 *  known, the same debt cleared against the lost collateral repriced today.
 *  Both figures carry their receipts. */
export function liquityRedemptionOutcome(
  economics: TroveEconomicsType,
  currentPrice?: number,
  /** The bullet's lead, where a heading already names redemptions. */
  lead = "Redemptions:",
): ReactNode {
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
          "Redemption net outcome at the latest block's price — the BOLD debt that redemptions cleared, counted at $1 each, minus the collateral they took valued at Liquity's price at the latest block.",
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
  const signed = (n: number) => `${n >= 0 ? "+" : "−"}${formatUsdValue(Math.abs(n))}`;
  return (
    // A bullet of the Lifetime flows Explanation's Totals.
    <li className="flex items-start gap-2" data-anatomy="F13·liquity" data-flows-outcome="">
      <span aria-hidden className="select-none">
        •
      </span>
      <span className="min-w-0">
        {lead}{" "}
        <Prov info={realizedPLProv} value={formatExact(redemption.realizedPL)}>
          <span className="font-medium tabular-nums">{signed(redemption.realizedPL)}</span>
        </Prov>{" "}
        at the time
        {opportunityPL !== null && opportunityPLProv && (
          <>
            ,{" "}
            <Prov info={opportunityPLProv} value={formatExact(opportunityPL)}>
              <span className="font-medium tabular-nums">{signed(opportunityPL)}</span>
            </Prov>{" "}
            at the latest block&apos;s price
          </>
        )}
      </span>
    </li>
  );
}

export interface LiquityFlowsExplanationProps {
  economics: TroveEconomicsType;
  meta: TroveMeta;
  /** The clock the debt owed today accrues to. */
  now: number;
  currentPrice?: number;
  surplusClaimed?: boolean;
  /** Events whose row carries no price of their own. */
  unpriced: number;
  /** The Trove's lives (it closed and opened again). */
  lives: number;
  /** The collateral between events is at the branch's daily price. */
  daily: boolean;
}

/** Liquity V2's Lifetime flows Explanation, in brief bullets under short
 *  headings (rails-ops standards/explanation-copy-charter.md, "Brief bullets";
 *  TO-DO-ui-jobs §245): the Trove now, its costs, its redemptions, how the
 *  Trove counts. How to read the chart is the panel's "?". */
export function LiquityFlowsExplanation({
  economics,
  meta,
  now,
  currentPrice,
  surplusClaimed = false,
  unpriced,
  lives,
  daily,
}: LiquityFlowsExplanationProps): ReactNode {
  const { costs, redemption, liquidation, gas } = economics;
  const debt = meta.stablecoinSymbol;
  const coll = meta.collateralType;
  const f = deriveFigures(economics, meta, now);
  const tok = (n: number, sym: string, dp = 2) => (
    <Fig>
      {sym === debt ? formatPrice(n) : n.toFixed(dp)} {sym}
    </Fig>
  );
  const open = meta.status === "open";
  const n = (k: number) => k.toLocaleString("en-US");
  return (
    <div data-liquity-flows-note="" data-anatomy="F14">
      <ExplainGroup title={open ? "Current position" : "At close"}>
        {!open && !meta.isZombie && (
          <ExplainBullet>Closed: nothing held or owed; the bars keep the lifetime flows</ExplainBullet>
        )}
        {(open || meta.isZombie) && (
          <>
            <ExplainBullet>
              Collateral {tok(meta.collateralAmount, coll)}, the blue bar{meta.isZombie ? ", claimable" : ""}
            </ExplainBullet>
            <ExplainBullet>Debt {tok(f.entireDebt, debt)}, the green bar</ExplainBullet>
          </>
        )}
        {open && LIQUIDATION_RESERVE_ETH > 0 && (
          <ExplainBullet>
            Reserve <Fig>{LIQUIDATION_RESERVE_ETH} ETH</Fig>, refunded when the Trove closes
          </ExplainBullet>
        )}
        {f.claimableSurplus > 0 && (
          <ExplainBullet>
            Liquidation surplus {tok(f.claimableSurplus, coll, 4)}, {surplusClaimed ? "claimed" : "claimable"} by the
            owner
          </ExplainBullet>
        )}
      </ExplainGroup>
      {(f.interestAccrued > 0 || costs.totalUpfrontFees > 0) && (
        <ExplainGroup title="Costs">
          {f.interestAccrued > 0 && <ExplainBullet>Interest {tok(f.interestAccrued, debt)}</ExplainBullet>}
          {costs.totalUpfrontFees > 0 && (
            <ExplainBullet>Upfront fees {tok(costs.totalUpfrontFees, debt)}</ExplainBullet>
          )}
          {f.delegateFees > 0 && <ExplainBullet>Delegate fees {tok(f.delegateFees, debt)}</ExplainBullet>}
        </ExplainGroup>
      )}
      {redemption && redemption.totalDebtCleared > 0 && (
        <ExplainGroup title="Redemptions">
          <ExplainBullet>
            {tok(redemption.totalCollateralLost, coll)} taken to clear {tok(redemption.totalDebtCleared, debt)} of debt
          </ExplainBullet>
          {liquityRedemptionOutcome(economics, currentPrice, "Net to the borrower:")}
          <ExplainBullet>
            Net is the debt cleared less the {coll}&apos;s value; above zero favours the borrower
          </ExplainBullet>
        </ExplainGroup>
      )}
      {liquidation && f.liquidatedSeized > 0 && (
        <ExplainGroup title="Liquidation">
          <ExplainBullet>
            {tok(f.liquidatedSeized, coll)} seized, clearing {tok(liquidation.totalDebtCleared, debt)} of debt
          </ExplainBullet>
        </ExplainGroup>
      )}
      <ExplainGroup title="How it counts">
        <ExplainBullet>
          {daily
            ? `Between events, ${coll} takes the branch's price at each day's close`
            : `Between events, ${coll} keeps its latest event's price`}
        </ExplainBullet>
        <ExplainBullet>Debt is {debt} at $1, plus interest at the Trove's rate</ExplainBullet>
        {meta.isInBatch && <ExplainBullet>Its interest splits into interest and the batch fee by rate</ExplainBullet>}
        {lives > 1 && (
          <ExplainBullet>
            <Fig>{n(lives)}</Fig> lives; a closed life&apos;s flows stay in the bars
          </ExplainBullet>
        )}
        {meta.isZombie && (
          <ExplainBullet>A zombie: redeemed below the minimum debt, both bars stay solid</ExplainBullet>
        )}
        {unpriced > 0 && (
          <ExplainBullet>
            <Fig>{n(unpriced)}</Fig> event{unpriced === 1 ? "" : "s"} without a price take the nearest earlier one
          </ExplainBullet>
        )}
      </ExplainGroup>
      <ExplainMore title="More about the sums">
        <p>
          The collateral side adds up to what the Trove holds: {coll} deposited, plus redistribution gains, less what
          was withdrawn, redeemed and liquidated. Its last line, Market move, is the change in {coll}&apos;s price since
          each flow.
        </p>
        <p>
          The debt side adds up to what the Trove owes: borrowed, plus interest, fees and redistributed debt, less what
          was repaid, redeemed and liquidated. Its last line is the interest since the last event.
        </p>
        {f.feesReceivedColl > 0 && (
          <p>Redemptions left {tok(f.feesReceivedColl, coll, 4)} with the Trove as fees; neither net counts them.</p>
        )}
        {!daily && <p>A price more than 30 days old is marked as such.</p>}
        {gas.totalGasCostEth > DUST && (
          <p>
            The Trove&apos;s transactions paid <Fig>{gas.totalGasCostEth.toFixed(4)} ETH</Fig> (
            {formatUsdValue(gas.totalGasCostUsd)}) in gas.
          </p>
        )}
      </ExplainMore>
    </div>
  );
}
