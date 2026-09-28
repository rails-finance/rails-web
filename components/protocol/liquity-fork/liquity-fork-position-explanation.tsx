"use client";

// Plain-language, data-driven explanation of an Ebisu / Asymmetry Trove — a
// subject-first status lead over a short bulleted enumeration (the position form
// of the explanation-copy charter): composition and the live-vs-recorded caveat
// lead, then one bullet each for the interest split, redistribution gains, the
// collateral ratio against the branch minimum, the drop to the liquidation
// price, the redemption-queue position, and the branch as a whole. Every figure
// is the same chain-state values shown (and <Prov>-traced) on the cards around it —
// this panel only narrates it; a figure is bold only where it also sits on the
// position card's stat chrome.
//
// Register: the panel says what a figure MEANS, never how it was read (the
// receipt owns that). The one caveat it keeps is the misleading-figure kind, in
// plain words: a figure that includes pending interest, a price that didn't
// refresh this load.

import { formatUsd } from "@/lib/shared/format-event";
// The position card's own formatter for this figure, so a $1.18 line reads
// $1.18 in both places.
import { formatLiquidationPrice } from "@/lib/utils/liquidation-utils";
import { FORK_DEBT_SYMBOL } from "@/lib/shared/liquity-fork-live-provenance";
import { forkLiquidationReserve } from "@/lib/shared/liquity-fork-ops";
import type { LiquityForkTroveChainResponse } from "@/lib/api/fetch-liquity-fork-position";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { AmountText } from "@/components/shared/amount-text";

/** Past-tense narration for a closed or liquidated fork Trove — the card's own
 *  terminal figures (the recorded peaks), with the ending mechanism derived
 *  from the life's last event. On these forks the attribution is exact: every
 *  closed life ends with the owner's own closeTrove (redemption cannot close a
 *  V2-family Trove — it leaves a zombie), and every liquidated life ends with
 *  the liquidation that seized it. */
export function LiquityForkClosedExplanation({
  status,
  collateralSymbol,
  debtSymbol,
  peakCollateral,
  peakDebt,
  seizure,
  redemptionSource,
}: {
  status: "closed" | "liquidated";
  collateralSymbol: string;
  debtSymbol: string;
  /** Highest recorded balances over the life (display units) — the card's
   *  headline figures; each its own lifetime maximum. */
  peakCollateral: number;
  peakDebt: number;
  /** The final liquidation's last recorded balances (the seizure legs) —
   *  from the life's own liquidate event; null while the timeline streams. */
  seizure?: { coll: number; debt: number } | null;
  /** Named only where a branch's redemption balances are emitted by a
   *  DIFFERENT contract than the one that emits its opens/adjusts/closes/
   *  liquidations. Ebisu redeems through each branch's EbisuBranchManager,
   *  not its TroveManager (server sql/migrations 291/292); Asymmetry and
   *  Basedollar redeem through the TroveManager itself, so they omit this. */
  redemptionSource?: string;
}) {
  const liquidated = status === "liquidated";

  const lead = liquidated ? (
    <>
      This Trove life <H>ended in liquidation</H> — no balances remain on it:
    </>
  ) : (
    <>
      This Trove life <H>was closed by its owner</H> — no balances remain on it:
    </>
  );

  const bullets: React.ReactNode[] = [];
  if (liquidated) {
    bullets.push(
      <span key="seized">
        {seizure ? (
          <>
            The liquidation seized its last <AmountText value={seizure.coll} /> {collateralSymbol} of collateral and
            cleared the <AmountText value={seizure.debt} /> {debtSymbol} it still owed —{" "}
          </>
        ) : (
          <>The liquidation seized the Trove&rsquo;s remaining collateral and cleared its remaining debt — </>
        )}
        the branch liquidates a Trove whose collateral ratio falls below its minimum, in one whole-Trove seizure.
      </span>,
    );
  } else {
    bullets.push(
      <span key="owner">
        The owner repaid the {debtSymbol} debt and withdrew the {collateralSymbol} collateral, ending the life by their
        own transaction; the Trove&rsquo;s NFT was burned at close.
      </span>,
    );
  }
  if (peakCollateral > 0 || peakDebt > 0) {
    bullets.push(
      <span key="peaks">
        At its height it held{" "}
        <H>
          <AmountText value={peakCollateral} /> {collateralSymbol}
        </H>{" "}
        against{" "}
        <H>
          <AmountText value={peakDebt} /> {debtSymbol}
        </H>{" "}
        of debt — the highest balances in its record, each its own lifetime maximum.
      </span>,
    );
  }
  bullets.push(
    <span key="record">
      {redemptionSource ? (
        <>
          The timeline below is the life&rsquo;s complete record: every balance the branch emitted for this Trove
          &mdash; its TroveManager for opens, adjusts, closes and liquidations, its {redemptionSource} for redemptions
          &mdash; from its opening to this ending.
        </>
      ) : (
        <>
          The timeline below is the life&rsquo;s complete record: every balance the branch&rsquo;s TroveManager emitted
          for this Trove, from its opening to this ending.
        </>
      )}
    </span>,
  );

  return <ProseExplainer paragraph={lead} items={bullets} />;
}

export function LiquityForkPositionExplanation({
  chain,
  isBatched = false,
}: {
  chain: LiquityForkTroveChainResponse;
  /** The Trove is delegated to an interest-batch manager (the indexed flag —
   *  membership only changes via the Trove's own operations, so it is exact).
   *  getLatestTroveData serves the BATCH's rate for a member, so the rate
   *  bullet must attribute it to the manager, not the owner. */
  isBatched?: boolean;
}) {
  if (chain.chainStale || (chain.status !== "active" && chain.status !== "zombie")) return null;
  const debtSymbol = FORK_DEBT_SYMBOL[chain.protocol] ?? "debt";
  const reserve = forkLiquidationReserve(chain.protocol);
  const hasDebt = chain.entireDebt > 0;
  const dropPct =
    chain.priceUsd != null && chain.liqPriceUsd != null && chain.priceUsd > chain.liqPriceUsd
      ? Math.round((1 - chain.liqPriceUsd / chain.priceUsd) * 100)
      : null;

  // The status lead — composition, subject-first, one sentence, two figures,
  // colon-terminated (charter §4); the live-vs-recorded caveat (the entire
  // figures carry pending gains and interest, so a reader comparing them to a
  // last-emitted number needs the warning) rides as the first bullet.
  const lead = hasDebt ? (
    <>
      This Trove holds{" "}
      <H>
        <AmountText value={chain.entireColl} /> {chain.symbol}
      </H>{" "}
      against{" "}
      <H>
        <AmountText value={chain.entireDebt} /> {debtSymbol}
      </H>{" "}
      of debt:
    </>
  ) : (
    <>
      This Trove holds{" "}
      <H>
        <AmountText value={chain.entireColl} /> {chain.symbol}
      </H>{" "}
      and carries no debt:
    </>
  );

  const bullets: React.ReactNode[] = [];

  if (chain.priceUsd != null) {
    bullets.push(
      <span key="worth">
        At the branch&rsquo;s own price, that collateral is worth <H>{formatUsd(chain.entireColl * chain.priceUsd)}</H>.
      </span>,
    );
  }
  bullets.push(
    <span key="pending-caveat">
      {hasDebt
        ? "The figures above include pending redistribution gains and interest built up since the Trove's last change."
        : "That collateral figure includes any pending redistribution gains."}
    </span>,
  );

  if (hasDebt && chain.accruedInterest > 0.01) {
    // A zombie sits outside the redemption queue — its own bullet below narrates
    // that; asserting queue placement here would contradict it on the same pane.
    // A batched Trove accrues at the rate its manager sets for every member.
    bullets.push(
      isBatched ? (
        <span key="interest">
          Of that debt, <AmountText value={chain.accruedInterest} /> {debtSymbol} is interest built up at its
          batch&rsquo;s <H>{chain.annualInterestRatePct.toFixed(2)}%</H> annual rate — the rate its interest-batch
          manager sets for every member.
          {chain.accruedBatchManagementFee > 0 && (
            <>
              {" "}
              Another <AmountText value={chain.accruedBatchManagementFee} /> {debtSymbol} is the manager&rsquo;s
              management fee built up over the same time, also part of the debt.
            </>
          )}
          {chain.status !== "zombie" && (
            <> The manager&rsquo;s rate also sets the batch&rsquo;s place in the redemption queue.</>
          )}
        </span>
      ) : (
        <span key="interest">
          Of that debt, <AmountText value={chain.accruedInterest} /> {debtSymbol} is interest built up at the
          Trove&rsquo;s own <H>{chain.annualInterestRatePct.toFixed(2)}%</H> annual rate.
          {chain.status !== "zombie" && <> A higher rate also buys a later place in the redemption queue.</>}
        </span>
      ),
    );
  }
  if (chain.redistCollGain > 0 || chain.redistDebtGain > 0.01) {
    bullets.push(
      <span key="redist">
        It has picked up redistribution from liquidated neighbours: <AmountText value={chain.redistCollGain} />{" "}
        {chain.symbol} of collateral and <AmountText value={chain.redistDebtGain} /> {debtSymbol} of debt, pending until
        the next change.
      </span>,
    );
  }

  if (hasDebt && chain.icr != null) {
    bullets.push(
      <span key="icr">
        Collateral ratio <H>{(chain.icr * 100).toFixed(1)}%</H>, against the branch&rsquo;s{" "}
        <H>{(chain.mcr * 100).toFixed(0)}%</H> minimum. Below it, anyone can liquidate the Trove.
      </span>,
    );
    if (dropPct != null && chain.liqPriceUsd != null) {
      bullets.push(
        <span key="drop">
          {chain.symbol} can fall about <H>{dropPct}%</H> (to <H>{formatLiquidationPrice(chain.liqPriceUsd)}</H>) before
          liquidation begins.
        </span>,
      );
    }
    if (chain.priceUsd != null) {
      // Borrowing headroom to the branch minimum — the risk row's own formula
      // (coll × price ÷ MCR − debt), so the figures twin.
      const headroom = Math.max(0, (chain.entireColl * chain.priceUsd) / chain.mcr - chain.entireDebt);
      if (headroom > 0) {
        bullets.push(
          <span key="headroom">
            About{" "}
            <H>
              <AmountText value={headroom} format="compact" />
            </H>{" "}
            {debtSymbol} more could be borrowed before the Trove reaches the {(chain.mcr * 100).toFixed(0)}% minimum.
          </span>,
        );
      }
    }
  }

  if (chain.status === "zombie") {
    // The TroveManager points its next redemption at a zombie only while the
    // zombie still owes debt; one redeemed to zero has nothing left to give.
    bullets.push(
      hasDebt ? (
        <span key="zombie">
          A partial redemption left this Trove below the branch&rsquo;s minimum debt — a <H>zombie</H>: outside the
          rate-ordered redemption queue, and redeemed first when the next redemption routes through this branch.
        </span>
      ) : (
        <span key="zombie">
          Redemption cancelled all of its debt, which leaves it a <H>zombie</H>: outside the redemption queue, with
          nothing left to redeem. Closing the Trove returns the{" "}
          <H>
            <AmountText value={chain.entireColl} /> {chain.symbol}
          </H>
          {reserve ? <> and the {reserve} liquidation reserve</> : null} to the owner.
        </span>
      ),
    );
  } else if (hasDebt && chain.debtInFront != null) {
    bullets.push(
      <span key="queue">
        <AmountText value={chain.debtInFront} /> {debtSymbol} of this branch&rsquo;s debt sits at the same or lower
        interest rate, redeemed before this Trove when {debtSymbol} holders redeem at $1 face.
      </span>,
    );
  }

  if (chain.branchTcr != null) {
    bullets.push(
      <span key="branch">
        The {chain.symbol} branch as a whole is <H>{(chain.branchTcr * 100).toFixed(0)}%</H> collateralised
        {chain.branchTcr < chain.ccr ? (
          <> — below its {(chain.ccr * 100).toFixed(0)}% critical ratio, so new borrowing is paused until it recovers</>
        ) : null}
        .
      </span>,
    );
  } else if (chain.branchDebt != null && chain.branchDebt < 1) {
    // A wound-down branch keeps dust in its aggregate interest bookkeeping, so
    // a ratio over it would read in the quintillions — the lane declines to
    // state one; the fact worth stating is the emptiness itself.
    bullets.push(
      <span key="branch">
        The {chain.symbol} branch as a whole carries no {debtSymbol} debt at present, so it has no branch-level
        collateral ratio to state.
      </span>,
    );
  }

  if (chain.priceStale) {
    bullets.push(
      <span key="stale">
        The branch&rsquo;s price didn&rsquo;t refresh on this load, so the price shown is its last recorded value — it
        updates when someone acts on the branch and can lag on a quiet one.
      </span>,
    );
  }

  return <ProseExplainer paragraph={lead} items={bullets} />;
}
