"use client";

// Plain-language explanation of a Compound V3 position — the Comet analogue of
// the Aave-family position explanations, built straight from the live chain
// response (the base balance, the enumerated collateral with its factors and
// oracle prices, and the contract's own account verdicts). The charter form for
// a position pane is a short subject-first status lead plus bullets, one per
// independent derived fact: composition in the lead; the verdict, the
// liquidation line, the drop to absorption, and remaining borrowing power as
// bullets — the absorb mechanic riding whichever of those carries its figures.
//
// Every figure here is the same chain-state values shown on the cards around it — this
// panel only narrates it. Values quote in the market's own unit (USD, or ETH in
// the WETH market), so magnitudes are stated in base tokens, which is unit-safe
// everywhere.

import type { CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import { scaleCompoundChainBalance } from "@/lib/api/fetch-compound-position";
import { formatNumber } from "@/lib/utils/format";
import { formatUsd } from "@/lib/shared/format-event";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { useEnsName } from "@/lib/ens/use-ens-names";
import { operatorLead, type ExternalActorSummary } from "@/lib/shared/external-actor";
import type { CompoundPositionView } from "@/components/protocol/compound/compound-position-card";
import { capacityShare } from "@/lib/shared/capacity-share";

/** Oxford-join asset symbols ("wstETH, WBTC and cbBTC"). */
function joinSymbols(syms: string[]): string {
  if (syms.length === 0) return "";
  if (syms.length === 1) return syms[0];
  if (syms.length === 2) return `${syms[0]} and ${syms[1]}`;
  return `${syms.slice(0, -1).join(", ")} and ${syms[syms.length - 1]}`;
}

/** Terminal (closed / liquidated) pane — narrated from the index view alone,
 *  never waiting on the chain lane: a terminal account's live read answers
 *  zeros, so everything worth saying (the heights it reached, the absorption
 *  record, when it wound down, the way back in) is in the replayed history the
 *  card itself renders. The bullets restate the card's own peak figures
 *  (charter §3 reverse-completeness). */
export function CompoundClosedPositionExplanation({ v }: { v: CompoundPositionView }) {
  const liquidated = v.status === "liquidated";
  const peakText = (rs: { amount: number; symbol: string }[]) =>
    rs.map((r, i) => (
      <span key={r.symbol + i}>
        {i > 0 ? (i === rs.length - 1 ? " and " : ", ") : ""}
        <H>
          {formatNumber(r.amount)} {r.symbol}
        </H>
      </span>
    ));
  const closedDate =
    v.lastActivityAt != null
      ? new Date(v.lastActivityAt * 1000).toLocaleDateString("en-GB", {
          timeZone: "UTC",
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : null;

  const lead = liquidated ? (
    <>
      This {v.marketLabel} position closed with an absorption in its record — nothing remains lent, borrowed or posted:
    </>
  ) : (
    <>This {v.marketLabel} position ran its course and closed — nothing remains lent, borrowed or posted:</>
  );

  // The card's own peak lines, joined: supply side (lent base and/or collateral
  // assets), then the borrowed principal.
  const supplyPeaks = [
    ...(v.peak.lentBase > 0 ? [{ amount: v.peak.lentBase, symbol: v.base.symbol }] : []),
    ...v.peak.collateral.map((c) => ({ amount: c.amount, symbol: c.symbol })),
  ];
  const list: React.ReactNode[] = [];
  const peakFigures = supplyPeaks.length + (v.peak.borrowedBase > 0 ? 1 : 0);
  if (peakFigures > 0) {
    list.push(
      <>
        At its height the position
        {supplyPeaks.length > 0 && <> held as much as {peakText(supplyPeaks)}</>}
        {supplyPeaks.length > 0 && v.peak.borrowedBase > 0 && <> and</>}
        {v.peak.borrowedBase > 0 && (
          <>
            {" "}
            owed as much as{" "}
            <H>
              {formatNumber(v.peak.borrowedBase)} {v.base.symbol}
            </H>{" "}
            in principal
          </>
        )}
        {peakFigures > 1 ? (
          <>
            {" "}
            — each figure its own highest point across the position&rsquo;s life, so they need not have stood together.
          </>
        ) : (
          <> — its highest point across the position&rsquo;s life.</>
        )}
      </>,
    );
  }
  if (v.liquidationCount > 0) {
    list.push(
      <>
        The protocol absorbed the position <H>{v.liquidationCount}</H> time{v.liquidationCount === 1 ? "" : "s"} —
        taking its collateral and clearing the whole debt against it, crediting back the value minus each asset&rsquo;s
        liquidation penalty.
        {liquidated && <> Closing with that in its record is what marks the outcome Liquidated rather than Closed.</>}
      </>,
    );
  }
  if (closedDate != null) {
    list.push(
      <>
        Its last activity landed on <H>{closedDate}</H>, after <H>{v.txCount}</H> transaction
        {v.txCount === 1 ? "" : "s"} of its own.
      </>,
    );
  }
  list.push(
    <>
      The wallet can come back at any time — a new supply or borrow in this market reopens this same position&rsquo;s
      timeline.
    </>,
  );

  return <ProseExplainer paragraph={lead} items={list} />;
}

export function CompoundPositionExplanation({
  chain,
  collateralUsd,
  debtUsd,
  externalActivity,
}: {
  chain: CompoundMarketChainResponse;
  /** The card's oracle-USD side headlines (cardSideUsd on the card view) — the
   *  exact chrome figures, so the pane's bold twins byte-match (charter §3
   *  reverse-completeness). Omit (or null) when the card shows no USD headline. */
  collateralUsd?: number | null;
  debtUsd?: number | null;
  /** Who executed the position's events, reduced over its whole timeline. The
   *  page derives it from the events already on the page; omit to skip the
   *  operator bullet. */
  externalActivity?: ExternalActorSummary;
}) {
  const leadName = useEnsName(externalActivity?.actors[0]?.address ?? null);
  const secondName = useEnsName(externalActivity?.actors[1]?.address ?? null);
  const supplyBase = scaleCompoundChainBalance(chain.supplyBalanceRaw, chain.baseDecimals);
  const borrowBase = scaleCompoundChainBalance(chain.borrowBalanceRaw, chain.baseDecimals);
  const hasDebt = borrowBase > 0;
  const collateralSyms = chain.collateral.map((c) => c.symbol);
  const toBase = (v: number) => (chain.basePrice > 0 ? v / chain.basePrice : v);
  const hf = chain.healthFactor;
  const dropPct = hf != null && hf > 1 ? Math.round((1 - 1 / hf) * 100) : null;
  const deprecated = chain.collateral.filter((c) => c.borrowCollateralFactor === 0);

  let lead: React.ReactNode = null;
  const bullets: React.ReactNode[] = [];

  if (hasDebt) {
    const collateralValue = chain.collateral.reduce(
      (s, c) => s + scaleCompoundChainBalance(c.balanceRaw, c.decimals) * c.price,
      0,
    );
    // Subject-first, one sentence, two figures, colon-terminated (charter §4).
    lead = (
      <>
        This position borrows{" "}
        <H>
          {formatNumber(borrowBase)} {chain.baseSymbol}
        </H>{" "}
        against collateral in {joinSymbols(collateralSyms)}, worth about {formatNumber(toBase(collateralValue))}{" "}
        {chain.baseSymbol} at the market&rsquo;s oracle prices:
      </>
    );

    // The card's own USD headlines (Comet's own oracle) — stated bold so the
    // dollar figures on the stat row resolve to a pane mention.
    if (collateralUsd != null || debtUsd != null) {
      bullets.push(
        <span key="usd">
          In dollars at those same oracle prices,{" "}
          {collateralUsd != null && (
            <>
              the collateral comes to <H>{formatUsd(collateralUsd)}</H>
            </>
          )}
          {collateralUsd != null && debtUsd != null && <> and </>}
          {debtUsd != null && (
            <>
              the debt to <H>{formatUsd(debtUsd)}</H>
            </>
          )}
          .
        </span>,
      );
    }
    // The absorb mechanic rides figure-bearing bullets (never a figure-free
    // rule sentence of its own): on the drop bullet for a healthy account, or
    // on the verdict itself once the account is absorbable.
    const absorbTail = (
      <>
        the protocol takes the collateral and clears the whole debt, crediting back its value minus each asset&rsquo;s
        liquidation penalty
      </>
    );
    bullets.push(
      <span key="verdict">
        Comet&rsquo;s own account check reports it <H>{chain.isLiquidatable ? "liquidatable" : "not liquidatable"}</H>
        {!chain.isLiquidatable && !chain.isBorrowCollateralized
          ? ", though under-collateralised for new borrowing"
          : ""}
        {chain.isLiquidatable ? <> — anyone may now trigger an absorb, where {absorbTail}</> : null}.
      </span>,
    );
    if (chain.liquidationCapacity > 0) {
      const share = capacityShare(chain.debtValue, chain.liquidationCapacity);
      bullets.push(
        <span key="liq-line">
          Debt sits at <H>{share.text}</H> {share.ofThe} liquidation line — collateral weighted by each asset&rsquo;s
          liquidate factor covers up to{" "}
          <H>
            {formatNumber(toBase(chain.liquidationCapacity))} {chain.baseSymbol}
          </H>{" "}
          of debt, and Comet absorbs the account the moment debt reaches that line.
        </span>,
      );
    }
    if (dropPct != null && dropPct > 0) {
      bullets.push(
        <span key="drop">
          The collateral basket can fall about <H>{dropPct}%</H> before absorption
          {!chain.isLiquidatable ? <> — {absorbTail}</> : null}.
        </span>,
      );
    }
    if (chain.borrowCapacity > chain.debtValue) {
      bullets.push(
        <span key="power">
          The account could borrow about{" "}
          <H>
            {formatNumber(toBase(chain.borrowCapacity - chain.debtValue))} {chain.baseSymbol}
          </H>{" "}
          more at current prices.
        </span>,
      );
    }
  } else if (supplyBase > 0) {
    lead = (
      <>
        This position lends{" "}
        <H>
          {formatNumber(supplyBase)} {chain.baseSymbol}
        </H>{" "}
        to the {chain.baseSymbol} market, earning the supply rate ({(chain.supplyApr * 100).toFixed(2)}% APR):
      </>
    );
    bullets.push(<span key="accrue">Interest accrues into the lent balance itself.</span>);
  } else if (collateralSyms.length > 0) {
    lead = <>This position holds collateral in {joinSymbols(collateralSyms)} with nothing borrowed against it:</>;
  }

  // Idle collateral (a lending or bare-collateral position with no debt): the
  // collateral backs nothing, so none of it is at risk and it earns nothing.
  if (collateralSyms.length > 0 && !hasDebt) {
    if (supplyBase > 0) {
      bullets.push(
        <span key="also-coll">It also holds collateral in {joinSymbols(collateralSyms)}, backing no borrowing.</span>,
      );
    }
    bullets.push(
      <span key="idle-risk">
        None of that collateral can be absorbed while nothing is borrowed against it, and it earns nothing (Comet
        collateral is non-earning).
      </span>,
    );
    if (chain.borrowCapacity > 0) {
      // No debt → the risk row (the figure's bold twin) doesn't render, so
      // the capacity stays muted here.
      bullets.push(
        <span key="idle-capacity">
          At current oracle prices it could back up to {formatNumber(toBase(chain.borrowCapacity))} {chain.baseSymbol}{" "}
          of borrowing (each asset counts up to its borrow factor).
        </span>,
      );
    }
  }

  if (deprecated.length > 0) {
    bullets.push(
      <span key="deprecated">
        {joinSymbols(deprecated.map((c) => c.symbol))} {deprecated.length === 1 ? "is" : "are"} deprecated for new
        borrowing (borrow factor 0) — still protecting against liquidation, but adding no borrow capacity.
      </span>,
    );
  }

  // Who has been operating the position, across its whole timeline — the same
  // externalActor() verdict each event card renders on its spine, reduced once
  // so the pane can state the PATTERN. The event clause explains a single row;
  // only this can tell a reader the position is run by someone other than its
  // owner (charter §5 item 7).
  //
  // Count-first and plurality-safe: an "operated by <name>" template is false
  // wherever several actors share the work, and an address is never spoken in
  // place of a name — the fact holds whether or not anything resolves. The
  // identity stays unbolded: it has no chrome twin on the card, so bolding it
  // would break the pane's reverse-completeness (charter §3).
  //
  // The seam is supply-side by construction (Comet's withdraw rows name no
  // funder), so the mechanic sentence speaks to what a non-owner can add, and
  // to the authorisation the other direction needs.
  const ext = externalActivity;
  if (ext && ext.external > 0) {
    const others = ext.external - (ext.actors[0]?.count ?? 0);
    bullets.push(
      <span key="operators">
        {operatorLead(ext, null, "recorded here")}
        {ext.external.toLocaleString("en-US")} {ext.external === 1 ? "was" : "were"} executed by an address other than
        the owner&rsquo;s. Anyone may put value into a Comet account unasked — and on the base asset that is also the
        way a debt gets repaid — but taking value out, or borrowing against the collateral, needs the owner to have
        authorised that address as a manager first, in one switch that covers every asset and sets no amount cap.
        {ext.actors.length === 1
          ? leadName
            ? ` All of it ran through ${leadName}.`
            : " A single address accounts for all of it."
          : leadName
            ? ` Most of it — ${ext.actors[0].count.toLocaleString("en-US")} events — ran through ${leadName}, with the remaining ${others.toLocaleString("en-US")} spread across ${ext.actors.length - 1} other address${ext.actors.length === 2 ? "" : "es"}${secondName ? `, one of them ${secondName}` : ""}.`
            : ` The work is spread across ${ext.actors.length} addresses, the most active of them accounting for ${ext.actors[0].count.toLocaleString("en-US")}.`}
      </span>,
    );
  }

  if (lead == null && bullets.length === 0) return null;

  return <ProseExplainer paragraph={lead} items={bullets} />;
}
