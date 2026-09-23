"use client";

// Plain-language, data-driven explanation of an Aave V4 spoke position — the
// Aave analogue of Liquity's useTroveExplanationItems. Lifted out of
// aave-v4-spoke-card.tsx so it can render either inside the card or, in the
// "About this position" layout, as a standalone panel above the stats card.
//
// Form and emphasis follow the explanation-copy charter
// (rails-ops/standards/explanation-copy-charter.md): §4 — no heading inside
// the pane, one subject-first colon-terminated lead over one bullet per fact;
// §3's highlight rule — bold only chrome-mirrored figures, and every figure on
// the card's chrome appears bold somewhere in this pane (reverse-completeness).

import { type AaveSpokeCardInfo, type AaveV4InterestPnl, liquidationBuffer } from "@/lib/aave-v4/spoke-cards";
import { fmtUsd, hfLabel, fmtLiqPrice, fmtSignedUsd, fmtTokenAmount } from "@/lib/aave-v4/format";
import { aaveV4DisplaySymbol } from "@/lib/aave-v4/pt-tokens";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { aaveV4SpokeContent, aaveV4PositionFallbackContent } from "@/lib/shared/learn-more-content";
import { Prov } from "@/components/shared/provenance";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { useEnsName } from "@/lib/ens/use-ens-names";
import { operatorLead, type ExternalActorSummary } from "@/lib/shared/external-actor";
import {
  usdProv,
  accumProv,
  healthFactorProv,
  interestProv,
  DEBT_CEILING_PROV,
  LIQ_PRICE_PROV,
  LIQ_DROP_PROV,
} from "@/lib/aave-v4/position-provenance";

// The simulated-risk receipts (DEBT_CEILING_PROV / LIQ_PRICE_PROV /
// LIQ_DROP_PROV) live in lib/aave-v4/position-provenance.ts: receipts keep
// their exact formulas and method names, and this file is a register-gated
// Explanation surface where that vocabulary can't be written inline.
const SUPPLY_USD_PROV = usdProv("Collateral supplied", { amountLabel: "supply balance", amountKind: "chain" });
const DEBT_USD_PROV = usdProv("Debt drawn", { amountLabel: "debt balance", amountKind: "chain" });
const HF_PROV = healthFactorProv();
const borrowRateProv = () =>
  accumProv("The latest borrow rate recorded on this spoke", { formula: "most recent on-chain borrow index → APR" });
const peakSupplyProv = () => accumProv("Peak supply", { formula: "max(supply USD) across the event stream" });
const peakDebtProv = () => accumProv("Peak debt", { formula: "max(debt USD) across the event stream" });
const CURRENT_PRICE_PROV = {
  kind: "offchain" as const,
  summary:
    "Collateral asset price — the price Aave's oracle answers for the asset now, which is what the spoke values the position at. An off-chain market price stands in where the oracle registry leaves an asset out.",
  via: "Aave's oracle price · an off-chain market price where it has none",
};

// Oxford-join a list of asset symbols for prose ("wstETH, WBTC and USDC").
function joinSymbols(syms: string[]): string {
  const names = syms.map(aaveV4DisplaySymbol);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Chain-faithful interest-carry prose: a net summary plus a per-asset
 * earned/paid breakdown. Token figures are exact (current chain balance minus
 * indexed deposits — no rate); USD is that figure at the current price. Mirrors
 * what Aave calls "Total Earnings", but read straight off chain-state balances.
 */
function buildInterestItems(pnl: AaveV4InterestPnl): React.ReactNode[] {
  const items: React.ReactNode[] = [];
  // One bullet states the whole interest story: the net first (a rollup with no
  // card twin, so it stays muted), then the two CARD aggregates — the same
  // "incl. $X interest" figures the stat footnotes show, computed identically —
  // in bold, with the per-asset token legs trailing as muted detail. A separate
  // "$0.00 net" line beside an "earned 0.0000229 GHO" line reads as a
  // contradiction (the net just rounds the same sub-cent figure), so the facts
  // stay together as one bullet.
  const earned = pnl.assets.filter((a) => a.supplyInterest > 0);
  const paid = pnl.assets.filter((a) => a.borrowInterest > 0);
  // The card's own aggregates (SupplyInterestFootnote / DebtFootnote sums,
  // hidden there below a cent) — the bold twins.
  const earnedUsd = pnl.assets.reduce((sum, a) => sum + a.supplyInterestUsd, 0);
  const paidUsd = pnl.assets.reduce((sum, a) => sum + a.borrowInterestUsd, 0);
  const leg = (amount: number, symbol: string) => (
    <>
      {fmtTokenAmount(amount)} {aaveV4DisplaySymbol(symbol)}
    </>
  );
  const joinLegs = (nodes: React.ReactNode[]) =>
    nodes.map((n, i) => (
      <span key={i}>
        {i > 0 ? (i === nodes.length - 1 ? " and " : ", ") : null}
        {n}
      </span>
    ));
  // A side leads with its aggregate USD (bold — the card states the same
  // figure) when the card shows it (≥ $0.01); otherwise the token legs alone,
  // muted (no twin on the card).
  const earnedSide =
    earned.length > 0 ? (
      earnedUsd >= 0.01 ? (
        <>
          <H>
            <Prov info={interestProv("Accrued supply interest")}>{fmtUsd(earnedUsd).display}</Prov>
          </H>{" "}
          earned in supply interest ({joinLegs(earned.map((a) => leg(a.supplyInterest, a.symbol)))})
        </>
      ) : (
        <>{joinLegs(earned.map((a) => leg(a.supplyInterest, a.symbol)))} earned in supply interest</>
      )
    ) : null;
  const paidSide =
    paid.length > 0 ? (
      paidUsd >= 0.01 ? (
        <>
          <H>
            <Prov info={interestProv("Accrued borrow interest")}>{fmtUsd(paidUsd).display}</Prov>
          </H>{" "}
          paid in borrow interest ({joinLegs(paid.map((a) => leg(a.borrowInterest, a.symbol)))})
        </>
      ) : (
        <>{joinLegs(paid.map((a) => leg(a.borrowInterest, a.symbol)))} paid in borrow interest</>
      )
    ) : null;
  const breakdown =
    earnedSide || paidSide ? (
      <>
        {earnedSide}
        {earnedSide && paidSide && <> against </>}
        {paidSide}
      </>
    ) : null;

  if (pnl.hasData) {
    const net = fmtSignedUsd(pnl.netUsd);
    items.push(
      <span key="net-interest">
        Net interest to date is <Prov info={interestProv("Net interest to date")}>{net.display}</Prov>
        {breakdown ? <> — {breakdown}</> : null}.
      </span>,
    );
  } else if (breakdown) {
    items.push(<span key="interest-breakdown">{breakdown}.</span>);
  }
  if (pnl.unattributed) {
    items.push(
      <span key="unattributed">
        {pnl.hasData
          ? "Part of this position was opened through a swap aggregator, so that share's deposits sit outside the transaction record and the interest shown covers only the rest."
          : "This position was opened through a swap aggregator, so its deposits sit outside the transaction record and its interest is unavailable."}
      </span>,
    );
  }
  return items;
}

/**
 * Plain-language read of the *actual* position — one subject-first lead
 * (composition, colon-terminated, the lead-in to the bullets) plus one bullet
 * per independent fact. Every figure is read from the already-computed
 * AaveSpokeCardInfo (HF, liq price, borrowing power, interest carry, peaks),
 * so this adds depth with no extra fetch or compute.
 *
 * BOLD RULE: charter §3, the highlight rule (rails-ops/standards/
 * explanation-copy-charter.md) — wrap a figure in <H> ONLY when the exact
 * value is also on the card's structured chrome (headline stats, stat
 * footnotes, the count badge, the risk row, the exposure tower). Everything
 * else — the LT-weighted debt ceiling, borrowing headroom, net interest,
 * per-asset interest legs, today's spot price — stays muted. The obligation
 * runs BOTH ways (reverse-completeness): every figure on the card's chrome
 * must also appear, bold, somewhere in this pane.
 */
function buildSpokePositionItems(spoke: AaveSpokeCardInfo): {
  lead: React.ReactNode | null;
  items: React.ReactNode[];
} {
  const items: React.ReactNode[] = [];
  let lead: React.ReactNode = null;
  // Any live debt = borrowing (no dust floor) so the "no debt drawn" prose only
  // appears when debt is genuinely 0 — matches the card headline + runway.
  const supplyOnly = spoke.totalDebtUsd <= 0;
  const supplyStr = joinSymbols(spoke.supplyingSymbols);
  const borrowStr = joinSymbols(spoke.borrowingSymbols);

  if (supplyOnly) {
    lead = (
      <span key="composition">
        This position supplies{" "}
        <H>
          <Prov info={SUPPLY_USD_PROV}>{fmtUsd(spoke.totalSupplyUsd).display}</Prov>
        </H>
        {supplyStr && (
          <>
            {" "}
            across <span className="text-foreground/90 font-medium">{supplyStr}</span>
          </>
        )}{" "}
        with no debt drawn:
      </span>
    );
    items.push(
      <span key="no-risk">
        With nothing borrowed, the position carries no liquidation risk — its health factor is effectively infinite.
      </span>,
    );
    if (spoke.borrowingPowerUsd > 1) {
      items.push(
        <span key="power">
          This collateral could support up to {fmtUsd(spoke.borrowingPowerUsd).display} of debt before the position
          would sit at a 1.00 health factor, the liquidation point.
        </span>,
      );
    }
    if (spoke.interestPnl?.hasData || spoke.interestPnl?.unattributed) {
      items.push(...buildInterestItems(spoke.interestPnl));
    }
  } else {
    lead = (
      <span key="composition">
        This position holds{" "}
        <H>
          <Prov info={SUPPLY_USD_PROV}>{fmtUsd(spoke.totalSupplyUsd).display}</Prov>
        </H>{" "}
        of collateral
        {supplyStr && (
          <>
            {" "}
            in <span className="text-foreground/90 font-medium">{supplyStr}</span>
          </>
        )}{" "}
        against{" "}
        <H>
          <Prov info={DEBT_USD_PROV}>{fmtUsd(spoke.totalDebtUsd).display}</Prov>
        </H>{" "}
        of debt
        {borrowStr && (
          <>
            {" "}
            in <span className="text-foreground/90 font-medium">{borrowStr}</span>
          </>
        )}
        :
      </span>
    );
    if (spoke.blendedLt != null && spoke.weightedCollateralUsd > 0) {
      items.push(
        <span key="collateral-basis">
          Borrowing and the health factor don&rsquo;t credit the full deposit — each asset counts only up to its
          liquidation threshold (about <H>{Math.round(spoke.blendedLt * 100)}%</H> of its value here). So this
          collateral can carry up to <Prov info={DEBT_CEILING_PROV}>{fmtUsd(spoke.weightedCollateralUsd).display}</Prov>{" "}
          of debt before the position becomes liquidatable.
        </span>,
      );
    }
    if (spoke.healthFactor != null) {
      items.push(
        <span key="hf">
          Health factor of{" "}
          <H>
            <Prov info={HF_PROV}>{hfLabel(spoke.healthFactor)}</Prov>
          </H>
          : the risk-adjusted collateral is worth {hfLabel(spoke.healthFactor)}× the outstanding debt, and the position
          becomes liquidatable if it falls to 1.00.
        </span>,
      );
    }
    {
      const buf = liquidationBuffer(spoke);
      if (buf.dropPct != null && !buf.liquidatable) {
        if (buf.single) {
          // Single collateral asset — pin the buffer to a concrete price
          // (currentPrice / HF, chain-state, no LT table). Today's spot price
          // stays muted (charter §3 names it an explicit no-twin case); the
          // drop % and the liquidation price keep their card twins (the risk
          // row's "% from liquidation", the HF stat's "Liquidates at").
          items.push(
            <span key="liq">
              Liquidation tracks{" "}
              <span className="text-foreground/90 font-medium">{aaveV4DisplaySymbol(buf.single.symbol)}</span>: from
              today&rsquo;s <Prov info={CURRENT_PRICE_PROV}>{fmtLiqPrice(buf.single.currentPrice)}</Prov> it would have
              to fall about{" "}
              <H>
                <Prov info={LIQ_DROP_PROV}>{buf.dropPct.toFixed(0)}%</Prov>
              </H>{" "}
              (to{" "}
              <H>
                <Prov info={LIQ_PRICE_PROV}>{fmtLiqPrice(buf.single.liqPrice)}</Prov>
              </H>
              ) to trigger one.
            </span>,
          );
        } else {
          // Multiple collateral assets — no single asset drives liquidation, so
          // the figure to show is the correlated drop across all of them.
          items.push(
            <span key="liq">
              No single asset drives liquidation here — across the collateral as a whole, its value would have to fall
              about{" "}
              <H>
                <Prov info={LIQ_DROP_PROV}>{buf.dropPct.toFixed(0)}%</Prov>
              </H>{" "}
              (a correlated drop across every asset) before the health factor reaches 1.00.
            </span>,
          );
        }
      }
    }
    if (spoke.borrowingPowerUsd > 1) {
      items.push(
        <span key="power">
          About {fmtUsd(spoke.borrowingPowerUsd).display} more of debt could be drawn before the position reaches a 1.00
          health factor, the liquidation point.
        </span>,
      );
    }
    if (spoke.interestPnl?.hasData || spoke.interestPnl?.unattributed) {
      items.push(...buildInterestItems(spoke.interestPnl));
    }
    if (spoke.latestBorrowRate != null) {
      items.push(
        <span key="rate">
          The most recent borrow rate recorded on this spoke was{" "}
          <H>
            <Prov info={borrowRateProv()}>{spoke.latestBorrowRate.toFixed(2)}%</Prov>
          </H>
          .
        </span>,
      );
    }
  }

  // Lifetime history — event-derived peaks (same framing as the tower chart).
  // Only when a peak meaningfully exceeds the current position; a peak is always
  // ≥ current, so when they're level this bullet just restates the headline
  // collateral/debt (the first bullet) and is pure repetition. Each clause is
  // gated on its own peak so a level side never echoes its current value.
  const peakSupplyAbove = spoke.peakSupplyUsd > 1 && spoke.peakSupplyUsd > spoke.totalSupplyUsd * 1.01;
  const peakDebtAbove = spoke.peakDebtUsd > 1 && spoke.peakDebtUsd > spoke.totalDebtUsd * 1.01;
  if (peakSupplyAbove || peakDebtAbove) {
    let body: React.ReactNode;
    const supplyNode = (
      <H>
        <Prov info={peakSupplyProv()}>{fmtUsd(spoke.peakSupplyUsd).display}</Prov>
      </H>
    );
    const debtNode = (
      <H>
        <Prov info={peakDebtProv()}>{fmtUsd(spoke.peakDebtUsd).display}</Prov>
      </H>
    );
    if (peakSupplyAbove && peakDebtAbove) {
      body = (
        <>
          supply peaked at {supplyNode} and debt at {debtNode}
        </>
      );
    } else if (peakSupplyAbove) {
      body = <>supply peaked at {supplyNode}</>;
    } else {
      body = <>debt peaked at {debtNode}</>;
    }
    items.push(
      <span key="peaks">
        Across <H>{spoke.txCount}</H> transaction{spoke.txCount === 1 ? "" : "s"}, {body}.
      </span>,
    );
  } else if (spoke.txCount > 0) {
    // No peak above the current figures — but the card's count badge still
    // shows the transaction count, so the pane still states it
    // (reverse-completeness, charter §3).
    items.push(
      <span key="tx-count">
        The position has recorded <H>{spoke.txCount}</H> transaction{spoke.txCount === 1 ? "" : "s"} to date.
      </span>,
    );
  }

  if (spoke.wasLiquidated) {
    items.push(
      <span key="liquidated" className="text-rb-500">
        This position has been liquidated at least once — that history is permanent even if it is healthy again now.
      </span>,
    );
  }

  return { lead, items };
}

/**
 * Position explanation panel. Renders a live, data-driven read of *this*
 * position (the Aave analogue of Liquity's trove explanation). The generic
 * spoke-architecture narrative (how the spoke type works — archetype, hub
 * mapping, rate composition) lives behind the shared Learn-More modal opened
 * by the "?" affordance, mirroring Liquity's "How Redemptions Work" pattern,
 * so per-position copy stays separate from per-protocol education.
 */
export function AaveV4PositionExplanation({
  spoke,
  embedded = false,
  externalActivity,
}: {
  spoke: AaveSpokeCardInfo;
  /** When true, drop the panel chrome (bg / rounding / padding) so the
   *  explanation can sit inside a host container that already provides it —
   *  e.g. the "About this position" bar that expands into this content. */
  embedded?: boolean;
  /** Who executed this spoke position's events, reduced over the spoke-scoped
   *  history the page already holds. Omit to skip the operator bullet — the
   *  multi-spoke selectors and the listing cards have no event stream in hand. */
  externalActivity?: ExternalActorSummary;
}) {
  // A name is spoken only where one resolves; the two most active actors are
  // the only ones the bullet can name without turning into a list.
  const leadName = useEnsName(externalActivity?.actors[0]?.address ?? null);
  const secondName = useEnsName(externalActivity?.actors[1]?.address ?? null);
  const { lead, items } = buildSpokePositionItems(spoke);

  // Who has been operating the position, across the events on this spoke — the
  // same externalActor() verdict each event card renders on its spine, reduced
  // once so this pane can state the PATTERN rather than one row at a time. On a
  // managed position it is the single most important thing about it (charter §5
  // item 7), and no other surface here says it.
  //
  // Count-first and plurality-safe: an "operated by <name>" template is false
  // as soon as two accounts share the work, which is the normal shape of a
  // professionally run position. An address is never spoken in place of a name
  // — the count holds whether or not anything resolves. The identity stays
  // unbolded: it has no chrome twin on the card, so bolding it would break the
  // pane's reverse-completeness (charter §3).
  //
  // ⚠️ Passes null, so the bullet always carries its own denominator. It must
  // NOT offer spoke.txCount: that counts DISTINCT NON-LIQUIDATION TRANSACTIONS
  // while ext.total counts reduced events, and on this spoke's own fixture the
  // two both read 45 — equal by coincidence, not in bijection. Chaining on that
  // would have said "of those" about transactions while counting events.
  const ext = externalActivity;
  if (ext && ext.external > 0) {
    const trailing = ext.external - (ext.actors[0]?.count ?? 0);
    items.push(
      <span key="operators">
        {operatorLead(ext, null, "recorded on this spoke")}
        {ext.external.toLocaleString("en-US")} {ext.external === 1 ? "was" : "were"} executed not by the owner but by
        another account acting on the owner&rsquo;s behalf. Aave V4 has no permissionless path for that: every spoke
        action admits only a position manager — an account that governance has activated and the owner has separately
        approved for this position — with a further per-reserve allowance behind anything that moved value out. So each
        of these accounts was enabled by the owner before it acted.
        {ext.actors.length === 1
          ? leadName
            ? ` All of it ran through ${leadName}.`
            : " One address accounts for every one of them."
          : leadName
            ? ` The busiest of them, ${leadName}, accounts for ${ext.actors[0].count.toLocaleString("en-US")}, with ${trailing.toLocaleString("en-US")} across ${ext.actors.length - 1} further address${ext.actors.length === 2 ? "" : "es"}${secondName ? `, among them ${secondName}` : ""}.`
            : ` The work splits across ${ext.actors.length} addresses, the busiest accounting for ${ext.actors[0].count.toLocaleString("en-US")}.`}
      </span>,
    );
  }

  // Never-empty floor: spokes without editorial metadata fall back to the
  // generic position explainer so the "?" is always available.
  const spokeContent = aaveV4SpokeContent(spoke.name) ?? aaveV4PositionFallbackContent();

  return (
    <div
      className={
        // Muted body prose (text-rb-500) so the <H> highlights on key figures
        // actually pop — matches Liquity's muted+highlighted mix rather than a
        // flat single brightness. No heading inside the pane (charter §4): the
        // (i) Explanation heading-button already names it.
        embedded
          ? "text-sm text-rb-500 space-y-3"
          : "rounded-lg bg-rb-100 dark:bg-rb-950 px-4 py-3 text-sm text-rb-500 space-y-3"
      }
    >
      <ProseExplainer paragraph={lead} items={items} />
      {spokeContent && <LearnMore content={spokeContent} />}
    </div>
  );
}

/** Past-tense narration for a closed spoke position — the card's own terminal
 *  figures (the recorded peaks), with the ending derived from the life's LAST
 *  event: only a life whose final event is the seizure "ended in liquidation";
 *  a scarred life the owner later wound down was closed by the owner, and its
 *  liquidations are named as history (the same two axes the card's outcome
 *  pill and meta triangle carry). */
export function AaveV4ClosedExplanation({ spoke, embedded = false }: { spoke: AaveSpokeCardInfo; embedded?: boolean }) {
  const supplyOnly = spoke.peakDebtUsd < 1;
  const lead = spoke.endedByLiquidation ? (
    <>
      This position on the {spoke.name} spoke <H>ended in liquidation</H> — no balances remain on it:
    </>
  ) : (
    <>
      This position on the {spoke.name} spoke <H>was closed by its owner</H> — no balances remain on it:
    </>
  );

  const items: React.ReactNode[] = [];
  if (spoke.endedByLiquidation) {
    items.push(
      <span key="ended">
        The final event on its record is the seizure: a liquidator repaid outstanding debt and took collateral in
        exchange. Aave V4 seizes only supplies enabled as collateral, one collateral and one debt reserve per
        liquidation.
      </span>,
    );
  } else {
    items.push(
      <span key="owner">
        {supplyOnly
          ? "The owner withdrew the supplied assets, ending the position by their own transactions; its record is supply-side throughout."
          : "The owner repaid the debt and withdrew the supplied assets, ending the position by their own transactions."}
      </span>,
    );
    if (spoke.wasLiquidated) {
      items.push(
        <span key="scar">
          Along the way it was liquidated {spoke.liquidationCount === 1 ? "once" : `${spoke.liquidationCount} times`} —
          each seizure appears in the timeline below with the collateral seized and the debt cleared.
        </span>,
      );
    }
  }
  if (spoke.peakSupplyUsd > 0) {
    items.push(
      <span key="peaks">
        At its height it held <H>{fmtUsd(spoke.peakSupplyUsd).display}</H> of {supplyOnly ? "supply" : "collateral"}
        {supplyOnly ? (
          <> with nothing borrowed against it</>
        ) : (
          <>
            {" "}
            against <H>{fmtUsd(spoke.peakDebtUsd).display}</H> of debt
          </>
        )}{" "}
        — the highest recorded balances, each its own lifetime maximum.
      </span>,
    );
  }
  items.push(
    <span key="record">
      The timeline below is the life&rsquo;s complete record — every supply, borrow, repayment, withdrawal
      {spoke.wasLiquidated ? " and seizure" : ""} this spoke&rsquo;s indexed history holds for the wallet.
    </span>,
  );

  const spokeContent = aaveV4SpokeContent(spoke.name) ?? aaveV4PositionFallbackContent();
  return (
    <div
      className={
        embedded
          ? "text-sm text-rb-500 space-y-3"
          : "rounded-lg bg-rb-100 dark:bg-rb-950 px-4 py-3 text-sm text-rb-500 space-y-3"
      }
    >
      <ProseExplainer paragraph={lead} items={items} />
      {spokeContent && <LearnMore content={spokeContent} />}
    </div>
  );
}
