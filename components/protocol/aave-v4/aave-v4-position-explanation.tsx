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

import {
  type AaveSpokeCardInfo,
  type AaveV4InterestPnl,
  liquidationBuffer,
  rateSymbolLabel,
  yearlyDebtCost,
} from "@/lib/aave-v4/spoke-cards";
import {
  fmtUsd,
  hfLabelV4,
  hfProseV4,
  fmtLiqPrice,
  fmtSignedUsd,
  fmtTokenAmount,
  fmtYearly,
} from "@/lib/aave-v4/format";
import { useSpokeCollateralFactors } from "@/lib/aave-v4/use-spoke-collateral-factors";
import type { ClosedCollateralFactors } from "@/lib/aave-v4/use-closed-collateral-factors";
import { aaveV4DisplaySymbol } from "@/lib/aave-v4/pt-tokens";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { fmtPrice } from "@/components/shared/price-pill";
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

// The calculated-risk receipts (DEBT_CEILING_PROV / LIQ_PRICE_PROV /
// LIQ_DROP_PROV) live in lib/aave-v4/position-provenance.ts: receipts keep
// their exact formulas and method names, and this file is a register-gated
// Explanation surface where that vocabulary can't be written inline.
const SUPPLY_USD_PROV = usdProv("Collateral supplied", { amountLabel: "supply balance", amountKind: "chain" });
const DEBT_USD_PROV = usdProv("Debt drawn", { amountLabel: "debt balance", amountKind: "chain" });
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

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// Oxford-join a list of asset symbols for prose ("wstETH, WBTC and USDC").
function joinSymbols(syms: string[]): string {
  const names = syms.map(aaveV4DisplaySymbol);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The collateral factors of the given assets on this spoke, as prose:
 *  "sUSDe at 92%", "sUSDe at 92% and USDe at 93%". Null when none is known. */
function cfList(symbols: string[], cfs: Map<string, number>): { text: string; single: number | null } | null {
  const known = symbols.filter((sym) => cfs.has(sym));
  if (known.length === 0) return null;
  const parts = known.map((sym) => `${aaveV4DisplaySymbol(sym)} at ${Math.round(cfs.get(sym)! * 100)}%`);
  const text = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return { text, single: known.length === 1 && symbols.length === 1 ? cfs.get(known[0])! : null };
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

  if (pnl.hasData && earnedSide && paidSide) {
    const net = fmtSignedUsd(pnl.netUsd);
    items.push(
      <span key="net-interest">
        Net interest to date is <Prov info={interestProv("Net interest to date")}>{net.display}</Prov>
        {breakdown ? <> — {breakdown}</> : null}.
      </span>,
    );
  } else if (paidSide) {
    items.push(<span key="interest-breakdown">Interest so far: {paidSide}, already part of the debt.</span>);
  } else if (earnedSide) {
    items.push(<span key="interest-breakdown">Interest so far: {earnedSide}, already part of the supply.</span>);
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
function buildSpokePositionItems(
  spoke: AaveSpokeCardInfo,
  cfs: Map<string, number>,
): {
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
      const perAsset = cfList(spoke.supplyBreakdown.collateralSymbols, cfs);
      items.push(
        <span key="collateral-basis">
          Aave V4 counts each collateral at its collateral factor, the share of its value that backs debt
          {perAsset && perAsset.single == null ? (
            <>
              : on this spoke {perAsset.text}, about <H>{Math.round(spoke.blendedLt * 100)}%</H> blended (the
              liquidation threshold on this card)
            </>
          ) : perAsset ? (
            <>
              : on this spoke {joinSymbols(spoke.supplyBreakdown.collateralSymbols)} at{" "}
              <H>{Math.round(spoke.blendedLt * 100)}%</H> (the liquidation threshold on this card)
            </>
          ) : (
            <>
              , about <H>{Math.round(spoke.blendedLt * 100)}%</H> of its value here (the liquidation threshold on this
              card)
            </>
          )}
          . That factor is both the borrowing limit and the liquidation line: a borrow or withdrawal goes through while
          the health factor stays at or above 1, and below 1 the position can be liquidated. So this collateral can
          carry up to <Prov info={DEBT_CEILING_PROV}>{fmtUsd(spoke.weightedCollateralUsd).display}</Prov> of debt.
        </span>,
      );
    }
    if (spoke.healthFactor != null) {
      const lt = spoke.blendedLt;
      items.push(
        <span key="hf">
          Health factor of{" "}
          <H>
            <Prov info={healthFactorProv(spoke.healthFactorBasis)}>{hfProseV4(spoke.healthFactor)}</Prov>
          </H>
          {lt != null && lt > 0 ? (
            <>
              : the {fmtUsd(spoke.weightedCollateralUsd).display} of debt the collateral can carry, divided by the debt
              owed. The event cards show the collateral ratio (collateral ÷ debt) instead: times {Math.round(lt * 100)}%
              it gives the health factor, so a {Math.round(100 / lt)}% ratio is a health factor of 1.
            </>
          ) : (
            <>
              : the collateral counted at its liquidation threshold, divided by the debt; at 1.00 the position becomes
              liquidatable.
            </>
          )}
        </span>,
      );
    }
    {
      const buf = liquidationBuffer(spoke);
      if (buf.atLine) {
        items.push(
          <span key="at-line">
            <H>At the liquidation line</H>: the health factor is {hfLabelV4(spoke.healthFactor)}, so a small fall in{" "}
            {buf.single ? (
              <>{aaveV4DisplaySymbol(buf.single.symbol)}&rsquo;s price</>
            ) : (
              <>the collateral&rsquo;s value</>
            )}
            {buf.single?.against ? <> against {aaveV4DisplaySymbol(buf.single.against.symbol)}</> : null}, or interest
            growing the debt faster than the collateral, takes it below 1, where the position can be liquidated.
          </span>,
        );
      }
      if (buf.dropPct != null && !buf.liquidatable && !buf.atLine && buf.single?.against) {
        // Collateral and debt move together: read the runway against the debt
        // asset, since a dollar move in both leaves the health factor where it is.
        const a = buf.single.against;
        const col = aaveV4DisplaySymbol(buf.single.symbol);
        const debt = aaveV4DisplaySymbol(a.symbol);
        items.push(
          <span key="liq">
            Liquidation tracks <span className="text-foreground/90 font-medium">{col}</span> against{" "}
            <span className="text-foreground/90 font-medium">{debt}</span>, the asset the debt is in: the two move
            together in dollars, so a fall in both leaves the health factor where it is. From today&rsquo;s{" "}
            {a.ratio.toLocaleString("en-US", { maximumFractionDigits: 4 })} {debt} per {col}, it would have to fall
            about <H>{Math.round(buf.dropPct)}%</H> (to{" "}
            <H>
              {a.liqRatio.toLocaleString("en-US", { maximumFractionDigits: 4 })} {debt}
            </H>
            ) to trigger one.
          </span>,
        );
      } else if (buf.dropPct != null && !buf.liquidatable && !buf.atLine) {
        if (buf.single) {
          // Single collateral asset — pin the buffer to a concrete price
          // (currentPrice / HF, chain-state, no LT table). Today's spot price
          // stays muted (charter §3 names it an explicit no-twin case); the
          // drop % and the liquidation price keep their card twins (the risk
          // row's "% from liquidation", the HF stat's "Liquidates at").
          items.push(
            <span key="liq">
              Liquidation tracks{" "}
              <span className="text-foreground/90 font-medium">{aaveV4DisplaySymbol(buf.single.symbol)}</span>: from the
              latest block&rsquo;s <Prov info={CURRENT_PRICE_PROV}>{fmtPrice(buf.single.currentPrice)}</Prov> it would
              have to fall about{" "}
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
      const yearly = yearlyDebtCost(spoke);
      items.push(
        <span key="rate">
          The most recent {rateSymbolLabel(spoke)}borrow rate recorded on this spoke was{" "}
          <H>
            <Prov info={borrowRateProv()}>{spoke.latestBorrowRate.toFixed(2)}%</Prov>
          </H>
          {yearly && yearly.amount > 0 ? (
            <>
              : about{" "}
              <H>
                {fmtYearly(yearly.amount)} {aaveV4DisplaySymbol(yearly.symbol)}
              </H>{" "}
              a year on the debt as it stands, while the rate holds
            </>
          ) : null}
          .
        </span>,
      );
    }
  }

  // The debt mix over the position's life: a reserve borrowed before and not
  // owed now, said once, with what cleared it.
  if (!supplyOnly) {
    const gone = spoke.debtReserveHistory.filter((r) => !spoke.borrowingSymbols.includes(r.symbol));
    if (gone.length > 0 && spoke.borrowingSymbols.length > 0) {
      const how = (r: (typeof gone)[number]) =>
        r.liquidated > 0 && r.repaid > 0
          ? "partly repaid and the rest cleared by liquidation"
          : r.liquidated > 0
            ? "cleared by liquidation"
            : "repaid";
      items.push(
        <span key="debt-mix">
          The debt changed asset over the position&rsquo;s life:{" "}
          {gone.map((r, i) => (
            <span key={r.symbol}>
              {i > 0 ? "; " : null}
              its {aaveV4DisplaySymbol(r.symbol)} debt was {how(r)}
            </span>
          ))}
          , and the {borrowStr} debt is what remains.
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
        Liquidated{" "}
        {spoke.liquidationCount > 0 ? (
          <>
            <H>{spoke.liquidationCount}</H> time{spoke.liquidationCount === 1 ? "" : "s"}
          </>
        ) : (
          <>at least once</>
        )}
        . Liquidators sent those transactions, so the card counts them beside the owner&rsquo;s {spoke.txCount}, and the
        timeline lists both.
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
  const cfs = useSpokeCollateralFactors(spoke.name);
  const { lead, items } = buildSpokePositionItems(spoke, cfs);

  // The position managers that sent events on this spoke: the spoke's
  // `caller` against the owner, reduced over the spoke's history by the page
  // (aave-v4-spoke-view.tsx), so the card names each manager once and every
  // event's own line stays one sentence. What a position manager is lives in
  // the events' "?" modals (T4).
  //
  // Count-first and plurality-safe: two or more managers are counted, with the
  // busiest named where a name resolves. A lone manager is named by address
  // when no name resolves. The identity stays unbolded: it has no chrome twin
  // on the card (charter §3).
  //
  // ⚠️ Passes null, so the bullet always carries its own denominator. It must
  // NOT offer spoke.txCount: that counts DISTINCT NON-LIQUIDATION TRANSACTIONS
  // while ext.total counts reduced events, and on this spoke's own fixture the
  // two both read 45 — equal by coincidence, not in bijection. Chaining on that
  // would have said "of those" about transactions while counting events.
  const ext = externalActivity;
  if (ext && ext.external > 0) {
    const n = ext.actors.length;
    items.push(
      <span key="operators">
        {operatorLead(ext, null, "recorded on this spoke")}
        {ext.external.toLocaleString("en-US")} {ext.external === 1 ? "was" : "were"} sent through{" "}
        {n === 1 ? "a position manager" : `${n} position managers`}, contracts acting for the owner with its approval
        {n === 1 ? (
          <>: {leadName ?? short(ext.actors[0].address)}</>
        ) : n <= 3 ? (
          <>
            :{" "}
            {ext.actors
              .map((a, i) => (i === 0 && leadName) || (i === 1 && secondName) || short(a.address))
              .join(n === 2 ? " and " : ", ")}
          </>
        ) : (
          <>, the busiest of them {leadName ?? short(ext.actors[0].address)}</>
        )}
        .
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
 *  figures (the recorded peaks). Outcome is a HISTORY fact: any liquidation
 *  on the record marks it "liquidated" (rails-ops TO-DO-ui-jobs.md item 97,
 *  Miles 2026-09-28 — matches the Aave V3 control's `everLiquidated` rule),
 *  so this never credits the owner with repaying a debt a seizure cleared.
 *  The wording still distinguishes HOW it ended: a life whose final event is
 *  the seizure "ended in liquidation"; a scarred life the owner's own
 *  transactions later wound down "ran its course" with the seizures named as
 *  what mark the outcome; a life never liquidated "was closed by its owner". */
export function AaveV4ClosedExplanation({
  spoke,
  embedded = false,
  factorsThen,
}: {
  spoke: AaveSpokeCardInfo;
  embedded?: boolean;
  /** The collateral factors that applied while the position was open, read
   *  from the spoke (useClosedCollateralFactors). Without them the bullet
   *  names today's factors and says so. */
  factorsThen?: ClosedCollateralFactors;
}) {
  const supplyOnly = spoke.peakDebtUsd < 1;
  const cfsNow = useSpokeCollateralFactors(spoke.name);
  const then =
    factorsThen?.status === "ok" ? new Map([...factorsThen.factors].map(([sym, f]) => [sym, f.factor] as const)) : null;
  // While the read is in flight the bullet waits, so today's factors never
  // stand in for a moment as the factors of the past.
  const pending = factorsThen?.status === "loading";
  const perAsset = supplyOnly || pending ? null : cfList(spoke.suppliedSymbolsEver, then ?? cfsNow);
  const lead = spoke.endedByLiquidation ? (
    <>
      This position on the {spoke.name} spoke <H>ended in liquidation</H> — no balances remain on it:
    </>
  ) : spoke.wasLiquidated ? (
    <>
      This position on the {spoke.name} spoke <H>ran its course and closed</H> — its remaining balances withdrawn — with
      liquidation seizures in its record:
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
  } else if (spoke.wasLiquidated) {
    items.push(
      <span key="seizures">
        Liquidation seized it <H>{spoke.liquidationCount}</H> time{spoke.liquidationCount === 1 ? "" : "s"} — each
        seizure repaid outstanding debt and took collateral in exchange, one collateral and one debt reserve per
        liquidation. What remained after the seizures left by the position&rsquo;s own transactions. Seizures in the
        record are what mark the outcome Liquidated.
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
  if (perAsset && then) {
    items.push(
      <span key="collateral-factor">
        {perAsset.single != null ? (
          <>
            While it was open, {aaveV4DisplaySymbol(spoke.suppliedSymbolsEver[0])} counted at{" "}
            {Math.round(perAsset.single * 100)}% of its value on this spoke, its collateral factor: the health factor
            was the collateral ratio times {Math.round(perAsset.single * 100)}%, so it reached 1, the liquidation line,
            when the collateral was worth about {Math.round(100 / perAsset.single)}% of the debt.
          </>
        ) : (
          <>
            While it was open, each collateral counted at its collateral factor on this spoke, {perAsset.text} of its
            value: the health factor was the collateral counted that way divided by the debt, and at 1 the position
            could be liquidated.
          </>
        )}
      </span>,
    );
  } else if (perAsset) {
    items.push(
      <span key="collateral-factor">
        {perAsset.single != null ? (
          <>
            Today {aaveV4DisplaySymbol(spoke.suppliedSymbolsEver[0])} counts at {Math.round(perAsset.single * 100)}% of
            its value on this spoke, its collateral factor now. The factor that applied while this position was open
            could not be read, and governance may have changed it since.
          </>
        ) : (
          <>
            Today each collateral counts at its collateral factor on this spoke, {perAsset.text} of its value. The
            factors that applied while this position was open could not be read, and governance may have changed them
            since.
          </>
        )}
      </span>,
    );
  }
  items.push(
    <span key="record">
      The timeline below lists every supply, borrow, repayment, withdrawal
      {spoke.wasLiquidated ? " and seizure" : ""} for this wallet on the {spoke.name} spoke. Its positions on other
      spokes have their own pages.
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
