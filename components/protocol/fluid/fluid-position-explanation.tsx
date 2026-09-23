"use client";

// Plain-language explanation of a Fluid position NOW — a SHORT status lead
// (one-two sentences, state-keyed via the shared prose grammar) over a bullet
// list of the independent facts (price space, risk lines, rates, population).
// The position pane is a genuine enumeration, not a causal story — prose is
// reserved for the status verdict; the mechanics stay as bullets. Built from
// the live VaultResolver read when it landed (settled figures, the vault's risk
// lines, its oracle's debt-per-col price) and the position summary (the Σ
// replay lane) otherwise. Every figure is the same chain-state value the card around
// it shows — the pane narrates it, and echoes its receipt where the card face
// carries a twin. A closed position gets its pane too (the old pane rendered
// nothing there).

import { formatNumber } from "@/lib/utils/format";
import type { FluidPositionChainResponse } from "@/lib/api/fetch-fluid-position";
import { fluidLegName, fluidPairText, type FluidPositionView } from "@/components/protocol/fluid/fluid-position-card";
import { poolShareLabel } from "@/lib/fluid/asset-catalog";
import { Prov } from "@/components/shared/provenance";
import { liveSettledProv } from "@/lib/fluid/live-provenance";
import { settledNowProv, positionSigmaProv } from "@/lib/fluid/event-provenance";
import { useEnsName } from "@/lib/ens/use-ens-names";
import { operatorLead, type ExternalActorSummary } from "@/lib/shared/external-actor";
import {
  clause,
  composeParagraph,
  positionClauses,
  H,
  ProseExplainer,
  type ClauseInput,
} from "@/lib/shared/explainer-prose";

import { FLUID_EPS as EPS, fluidLegHolds } from "@/lib/fluid/explainer-clauses";

/** Terminal pane — a closed position narrates its RECORD from the index alone
 *  (its live read answers zeros): the card's peak figures, the liquidation
 *  record, the closure, and the door back. Present-tense vault facts (rates,
 *  population) belong to open positions and are deliberately absent here. */
function FluidClosedPositionExplanation({
  v,
  chain,
}: {
  v: FluidPositionView;
  chain: FluidPositionChainResponse | null;
}) {
  const colSym = fluidLegName(v, "supply", chain);
  const debtSym = fluidLegName(v, "borrow", chain);
  const pairText = fluidPairText(v, chain);
  const peakCol = Number(v.peakCol);
  const peakDebt = Number(v.peakDebt);
  const hasPeakCol = Number.isFinite(peakCol) && peakCol > 0;
  const hasPeakDebt = Number.isFinite(peakDebt) && peakDebt > 0;
  const closedDate =
    v.lastActivityAt != null
      ? new Date(v.lastActivityAt * 1000).toLocaleDateString("en-GB", {
          timeZone: "UTC",
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : null;

  // The lead is keyed on HOW it ended: `fullyLiquidated` means the engine
  // itself emptied the position; a position with sweeps in its record that
  // the owner later closed ran its course — saying "emptied by liquidation"
  // there would hand the engine a closure the owner performed.
  const lead = v.fullyLiquidated ? (
    <>
      This {pairText} position was emptied by liquidation — the vault&rsquo;s engine swept it to nothing, and nothing
      remains on either side:
    </>
  ) : v.wasLiquidated ? (
    <>
      This {pairText} position ran its course and closed — the remaining collateral withdrawn and the debt repaid — with
      liquidations in its record:
    </>
  ) : (
    <>This {pairText} position ran its course and closed — the collateral withdrawn and the debt repaid:</>
  );

  const list: React.ReactNode[] = [];
  if (hasPeakCol || hasPeakDebt) {
    const peakFigures = (hasPeakCol ? 1 : 0) + (hasPeakDebt ? 1 : 0);
    list.push(
      <>
        At its height it
        {hasPeakCol && (
          <>
            {" "}
            held as much as{" "}
            <H>
              {formatNumber(peakCol)} {colSym}
            </H>{" "}
            of collateral
          </>
        )}
        {hasPeakCol && hasPeakDebt && <> and</>}
        {hasPeakDebt && (
          <>
            {" "}
            owed as much as{" "}
            <H>
              {formatNumber(peakDebt)} {debtSym}
            </H>
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
        Liquidation sweeps hit it <H>{v.liquidationCount}</H> time{v.liquidationCount === 1 ? "" : "s"} — a Fluid
        liquidation is partial by design, clearing just enough each pass to restore the position&rsquo;s health
        {v.fullyLiquidated ? (
          <>, until the final sweep emptied it entirely.</>
        ) : (
          <>; only the owner can withdraw, so what remained left by the owner&rsquo;s own hand.</>
        )}{" "}
        Closing with sweeps in its record is what marks the outcome Liquidated rather than Closed.
      </>,
    );
  }
  if (closedDate != null) {
    list.push(
      <>
        Its record closed on <H>{closedDate}</H>, after <H>{v.txCount}</H> transaction{v.txCount === 1 ? "" : "s"} of
        its own.
      </>,
    );
  }
  list.push(
    <>
      The position NFT stays with its owner after closing — a new deposit or borrow under #{v.nftId} reopens this same
      timeline.
    </>,
  );

  return <ProseExplainer paragraph={lead} items={list} />;
}

export function FluidPositionExplanation({
  chain,
  view,
  externalActivity,
}: {
  chain: FluidPositionChainResponse | null;
  view: FluidPositionView | null;
  /** Who executed the position's events, reduced over its whole history. The
   *  page derives it from the events already on the page; omit to skip the
   *  third-party bullet. */
  externalActivity?: ExternalActorSummary;
}) {
  const leadName = useEnsName(externalActivity?.actors[0]?.address ?? null);
  const secondName = useEnsName(externalActivity?.actors[1]?.address ?? null);
  // Terminal positions narrate their record, not the vault's present — after
  // the hooks above so the hook order never changes with status.
  if (view != null && view.status === "closed") return <FluidClosedPositionExplanation v={view} chain={chain} />;
  const live = chain && chain.found && !chain.chainStale ? chain : null;
  const colSym = live?.supplySymbol ?? view?.supplySymbol ?? poolShareLabel(live?.supplyPoolPair) ?? "DEX shares";
  const debtSym = live?.borrowSymbol ?? view?.borrowSymbol ?? poolShareLabel(live?.borrowPoolPair) ?? "DEX shares";

  // ── which lane answers "is this empty?" ─────────────────────────────────
  // The same ladder the card's LegValue uses and the same one the server sets
  // (api/src/routes/fluid.ts:323-333, where status, the facets, the sort and
  // the total all read COALESCE(c.supply, p.col_net)): the resolver's live read
  // when it has landed, the worker's stamped settled overlay next, the Σ replay
  // only where neither exists.
  //
  // The Σ lane cannot answer this question. It is a PRINCIPAL-FLOW number —
  // deposits less withdrawals — so a position that has paid out the interest
  // its collateral earned nets BELOW zero while still holding a balance: nft
  // 9295 deposited 693.55 ETH over 148 events, withdrew 695.09, and holds 1.01
  // ETH on chain today. The route says as much ("debts below zero, which no
  // position can hold — so it must not decide open/closed on its own"). This
  // pane asked it anyway whenever `live` was absent, which is every server
  // render and every first paint (position-view.tsx:130,198), and on 2026-09-20
  // that put the closed sentence under 212 of the 8,575 positions served open.
  const sigmaCol = Number(view?.colNet ?? NaN);
  const sigmaDebt = Number(view?.debtNet ?? NaN);
  const settledColExact = view?.settled?.supply ?? null;
  const settledDebtExact = view?.settled?.borrow ?? null;
  const hasSettled = settledColExact != null || settledDebtExact != null;
  const restCol = hasSettled ? Number(settledColExact ?? NaN) : sigmaCol;
  const restDebt = hasSettled ? Number(settledDebtExact ?? NaN) : sigmaDebt;
  // `fluidLegHolds` carries the per-lane threshold and the reason for it, and
  // the card's Borrowing pill reads the same function.
  const restHolds = (n: number) => fluidLegHolds(n, hasSettled ? "chain" : "flows");
  const empty = live ? live.isEmpty : view != null && !restHolds(restCol) && !restHolds(restDebt);
  const liquidatedEmpty = (live?.isLiquidated ?? false) || (view?.wasLiquidated ?? false);
  const hasDebt = live != null ? fluidLegHolds(live.borrow, "chain") : restHolds(restDebt);

  // Position-level dust: the tiny non-zero residual the Σ replay leaves after a
  // full close (exchange-rate arithmetic, not a real balance). Keyed to the Σ
  // lane alone — it is the only lane whose last digits are arithmetic rather
  // than a balance — so that wherever a Σ figure is on the page beside a closed
  // sentence, the sentence says what it is.
  const dustLeg =
    Number.isFinite(sigmaCol) && sigmaCol !== 0 && Math.abs(sigmaCol) <= EPS
      ? { n: sigmaCol, sym: colSym }
      : Number.isFinite(sigmaDebt) && sigmaDebt !== 0 && Math.abs(sigmaDebt) <= EPS
        ? { n: sigmaDebt, sym: debtSym }
        : null;

  // Rest-lane figures — the settled overlay, else the Σ replay — echoing the
  // card's LegValue receipt for the same leg, so the pane and the face beside
  // it never cite different bases for one number.
  const restFig = (side: "supply" | "borrow") => {
    const sym = side === "supply" ? colSym : debtSym;
    const exact = (side === "supply" ? (settledColExact ?? view?.colNet) : (settledDebtExact ?? view?.debtNet)) ?? "";
    const n = side === "supply" ? restCol : restDebt;
    return (
      <Prov
        echo
        info={hasSettled ? settledNowProv(side, sym, view?.settled?.updatedBlock) : positionSigmaProv(side, sym)}
        value={exact}
        symbol={sym}
      >
        <H>
          {formatNumber(n)} {sym}
        </H>
      </Prov>
    );
  };

  // Live-lane figures echo the card's face LegValue receipt (same prov + the
  // resolver's exact string, so the entry key matches).
  const liveFig = (side: "supply" | "borrow") => {
    if (!live) return null;
    const sym = side === "supply" ? colSym : debtSym;
    const exact = side === "supply" ? live.supplyExact : live.borrowExact;
    const n = side === "supply" ? live.supply : live.borrow;
    return (
      <Prov echo info={liveSettledProv(side, sym, live.blockNumber)} value={exact} symbol={sym}>
        <H>
          {formatNumber(n)} {sym}
        </H>
      </Prov>
    );
  };

  // ── status ──────────────────────────────────────────────────────────────
  const status: ClauseInput[] = [];
  if (empty) {
    status.push(
      clause(
        <>
          {liquidatedEmpty ? (
            <>This position was emptied by liquidation — nothing remains on either side</>
          ) : (
            <>This position is closed — the collateral is withdrawn and the debt repaid</>
          )}
          {dustLeg ? (
            <>
              . The{" "}
              <H>
                {formatNumber(dustLeg.n)} {dustLeg.sym}
              </H>{" "}
              still showing is rounding dust — a leftover from the vault&rsquo;s internal arithmetic, not a real
              balance.
            </>
          ) : (
            <>.</>
          )}
        </>,
      ),
    );
  } else if (hasDebt && live) {
    status.push(
      clause(
        <>
          This position holds {liveFig("supply")} of collateral and owes {liveFig("borrow")}:
        </>,
      ),
    );
  } else if (live) {
    status.push(clause(<>This position holds {liveFig("supply")} of collateral and owes nothing:</>));
  } else if (view) {
    // No live read yet — narrate the lane the verdict came from, never a lane
    // the verdict did not come from.
    status.push(
      clause(
        <>
          This position holds {restFig("supply")} of collateral
          {restHolds(restDebt) ? <> and owes {restFig("borrow")}</> : null}:
        </>,
      ),
    );
  }

  // The lead paragraph is the status verdict alone — one subject-first
  // sentence, colon-terminated (charter §4); everything else is an independent
  // fact and renders as a bullet under it.
  const paragraph = composeParagraph(positionClauses({ status }));

  // ── the facts, as bullets ────────────────────────────────────────────────
  const list: React.ReactNode[] = [];
  if (hasDebt && live && live.colValueInDebt != null) {
    list.push(
      <>
        At the vault&rsquo;s own oracle, that collateral is worth {formatNumber(live.colValueInDebt)} {debtSym}.
      </>,
    );
  } else if (live && !hasDebt && !empty) {
    list.push(<>With no debt it cannot be liquidated — the collateral simply earns the vault&rsquo;s supply rate.</>);
  } else if (!live && view && !empty) {
    list.push(
      hasSettled ? (
        // Where this figure comes from is the receipt's business, not the
        // pane's (the explanation-copy charter) — the <Prov> on the figure
        // above already names the block it was taken at.
        <>
          These figures already include the interest the position has earned and any liquidation. The vault&rsquo;s own
          figures for this moment haven&rsquo;t arrived yet.
        </>
      ) : (
        <>
          The vault&rsquo;s figures aren&rsquo;t available right now, so interest since the position&rsquo;s last event
          isn&rsquo;t included yet.
        </>
      ),
    );
  }
  if (hasDebt && live && live.ratio != null) {
    if (live.oraclePriceLiquidateDebtPerCol != null) {
      list.push(
        <>
          Fluid uses no dollar prices — the vault&rsquo;s oracle prices {colSym} directly in {debtSym}:{" "}
          <H>
            1 {colSym} = {formatNumber(live.oraclePriceLiquidateDebtPerCol)} {debtSym}
          </H>{" "}
          at the price used for liquidations.
        </>,
      );
    }
    list.push(
      <>
        Debt is <H>{(live.ratio * 100).toFixed(1)}%</H> of the collateral&rsquo;s value at that price. Borrowing stops
        at <H>{(live.collateralFactor * 100).toFixed(0)}%</H>; above{" "}
        <H>{(live.liquidationThreshold * 100).toFixed(0)}%</H> anyone can liquidate the position (with a{" "}
        {(live.liquidationPenalty * 100).toFixed(1)}% penalty), and above {(live.liquidationMaxLimit * 100).toFixed(0)}%
        it can be absorbed entirely.
      </>,
    );
    const dropPct =
      live.oraclePriceLiquidateDebtPerCol != null &&
      live.liqPriceDebtPerCol != null &&
      live.oraclePriceLiquidateDebtPerCol > live.liqPriceDebtPerCol
        ? Math.round((1 - live.liqPriceDebtPerCol / live.oraclePriceLiquidateDebtPerCol) * 100)
        : null;
    if (dropPct != null && dropPct > 0 && live.liqPriceDebtPerCol != null) {
      list.push(
        <>
          {colSym} can fall about <H>{dropPct}%</H> against {debtSym} (to {formatNumber(live.liqPriceDebtPerCol)}{" "}
          {debtSym}) before liquidation begins. A Fluid liquidation is partial by design — it clears just enough to make
          the position healthy again.
        </>,
      );
    }
  }
  if (live && live.isLiquidated && !live.isEmpty) {
    list.push(
      <>
        A liquidation has <H>swept part of this position</H> — the figures above already include what it took.
      </>,
    );
  }
  if (live && (live.isSmartCol || live.isSmartDebt)) {
    list.push(
      <>
        {live.isSmartCol && live.isSmartDebt
          ? "Both legs are Fluid DEX pool shares, not single tokens"
          : live.isSmartCol
            ? "The collateral leg is Fluid DEX pool shares, not a single token"
            : "The debt leg is Fluid DEX pool shares, not a single token"}{" "}
        — amounts here are pool shares, and the vault&rsquo;s oracle prices the pair in those share units.
      </>,
    );
  }
  const rateBits: string[] = [];
  if (live && hasDebt && live.borrowRatePct != null) rateBits.push(`borrow rate ${live.borrowRatePct.toFixed(2)}%`);
  if (live && live.supply > 0 && live.supplyRatePct != null && live.supplyRatePct !== 0)
    rateBits.push(`supply rate ${live.supplyRatePct.toFixed(2)}%`);
  if (rateBits.length > 0) {
    list.push(
      <>
        Current vault rates: <H>{rateBits.join(", ")}</H> annual — they float with how heavily the vault is used.
      </>,
    );
  }
  if (live && live.vaultTotalPositions != null && live.vaultTotalPositions > 0) {
    list.push(
      <>
        One of <H>{live.vaultTotalPositions}</H> positions in this vault
        {live.vaultTotalSupply != null && live.vaultTotalBorrow != null ? (
          <>
            {" "}
            ({formatNumber(live.vaultTotalSupply)} {colSym} supplied, {formatNumber(live.vaultTotalBorrow)} {debtSym}{" "}
            borrowed across the vault)
          </>
        ) : null}
        .
      </>,
    );
  }
  if (view != null && view.txCount > 0) {
    list.push(
      <>
        The position has recorded <H>{view.txCount}</H> transaction{view.txCount === 1 ? "" : "s"} of its own to date
        {view.liquidationCount > 0 ? (
          <>
            , beside the {view.liquidationCount.toLocaleString("en-US")} liquidation sweep
            {view.liquidationCount === 1 ? "" : "s"} done to it
          </>
        ) : null}
        .
      </>,
    );
  }

  // Who has been acting on the position, across its whole history — the same
  // externalActor() verdict each event card renders on its spine, reduced once
  // so the pane can state the PATTERN rather than one row at a time.
  //
  // The mechanic is stated as a RULE, not as a verdict about these particular
  // senders: `operate` checks ownership only when value leaves, so paying in is
  // open to anyone, while taking value out is a strict ownerOf == msg.sender
  // equality that no ERC-721 approval satisfies. That phrasing survives whether
  // or not a value-removing row ever marks.
  //
  // Count-first and plurality-safe: an "operated by <name>" template is false
  // wherever several addresses share the work, and an address is never spoken
  // in place of a name. Unbolded — no chrome twin on the card (charter §3).
  const ext = externalActivity;
  if (ext && ext.external > 0) {
    const others = ext.external - (ext.actors[0]?.count ?? 0);
    list.push(
      <span key="third-parties">
        {/* No preceding bullet states this total any more (the count bullet
            speaks in transactions, a different quantity) — always the full
            self-contained form, never "Of those". */}
        {operatorLead(ext, null, "recorded on this position")}
        {ext.external.toLocaleString("en-US")} {ext.external === 1 ? "was" : "were"} executed by a third-party address
        rather than the owner&rsquo;s. Fluid has no delegation to grant: only the address holding the position&rsquo;s
        NFT may withdraw collateral or draw debt, and an ERC-721 approval does not stand in for it. Adding collateral or
        repaying debt, by contrast, is open to anyone — so another address can pay into this position without asking,
        while the right to take anything out moves only with the NFT itself.
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

  return <ProseExplainer paragraph={paragraph} items={list.length > 0 ? list : undefined} />;
}
