"use client";

// Plain-language explanation of a Morpho position NOW — a SHORT status lead (one
// or two subject-first sentences) over a bullet list of the independent facts
// (the market it sits in, the LLTV line, the health factor, the drop to
// liquidation, the remaining borrowing power, the liquidation model). The
// position pane is a genuine enumeration, not a causal story — prose is reserved
// for the status verdict; the mechanics stay as bullets (charter §4).
//
// Every figure here is the same chain-state values shown on the cards around it — this
// panel narrates it. All values quote in loan-token units (the market oracle's
// own numeraire); Morpho has no USD.

import type { MorphoChainPositionResponse } from "@/lib/api/fetch-morpho-position";
import { operatorLead, type ExternalActorSummary } from "@/lib/shared/external-actor";
import { formatNumber } from "@/lib/utils/format";
import { oracleAge } from "@/lib/morpho/oracle-age";
import { useEnsName } from "@/lib/ens/use-ens-names";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";

export function MorphoPositionExplanation({
  chain,
  txCount,
  everLiquidated,
  externalActivity,
}: {
  chain: MorphoChainPositionResponse;
  /** The card's own-transaction count (the activity chip's figure — DISTINCT
   *  txs excluding liquidation rows). Omit to skip. */
  txCount?: number;
  /** Whether the record carries liquidation seizures (the chip's flag). */
  everLiquidated?: boolean;
  /** Who executed the position's events — the timeline's own externalActor()
   *  verdict, reduced over the whole history. Omit to skip the operator fact. */
  externalActivity?: ExternalActorSummary;
}) {
  // The two leading actors, reverse-resolved. A FIXED pair of calls (rules of
  // hooks), which is also all the prose can name without becoming a list —
  // where more addresses act, they are counted rather than named.
  const leadName = useEnsName(externalActivity?.actors[0]?.address ?? null);
  const secondName = useEnsName(externalActivity?.actors[1]?.address ?? null);
  if (chain.chainStale) return null;

  const hasDebt = chain.currentDebt > 0;
  const hasColl = chain.collateral > 0;
  const hf = chain.healthFactor;
  const dropPct = hf != null && hf > 1 ? Math.round((1 - 1 / hf) * 100) : null;
  const penaltyPct = ((chain.lif - 1) * 100).toFixed(1);

  // ── the status lead — subject-first, one sentence, ≤2 figures, colon-
  // terminated: the lead-in to the bullets (charter §4) ─────────────────────
  let lead: React.ReactNode = null;
  if (hasDebt) {
    lead = (
      <>
        This position owes{" "}
        <H>
          {formatNumber(chain.currentDebt)} {chain.loanSymbol}
        </H>{" "}
        against{" "}
        <H>
          {formatNumber(chain.collateral)} {chain.collateralSymbol}
        </H>{" "}
        of collateral:
      </>
    );
  } else if (hasColl) {
    lead = (
      <>
        This position holds{" "}
        <H>
          {formatNumber(chain.collateral)} {chain.collateralSymbol}
        </H>{" "}
        as collateral with nothing borrowed against it:
      </>
    );
  }

  // ── the facts, as bullets ─────────────────────────────────────────────────
  const bullets: React.ReactNode[] = [];

  if (hasDebt) {
    // The oracle value is a prose-only figure (no chrome twin), so it stays
    // muted; the health verdict is the market's own read.
    bullets.push(
      <span key="oracle-value">
        At the market&rsquo;s own oracle that collateral is worth about {formatNumber(chain.collateralValue)}{" "}
        {chain.loanSymbol}
        {chain.healthy != null && (
          <>
            ; by the market&rsquo;s own health test the position is currently{" "}
            <H>{chain.healthy ? "healthy" : "liquidatable"}</H>
          </>
        )}
        .
      </span>,
    );
  } else if (hasColl) {
    bullets.push(<span key="idle">None of that collateral can be seized, and it earns nothing.</span>);
  }

  // When the price every figure here rests on was published — the oldest of
  // the oracle's feeds. Said only where the feeds were read; an oracle of
  // another kind gets no sentence at all (lib/morpho/oracle-age.ts).
  const age = hasColl ? oracleAge(chain) : null;
  if (age) {
    bullets.push(
      <span key="oracle-age">
        The market&rsquo;s oracle price, {formatNumber(chain.oraclePrice)} {chain.loanSymbol} per{" "}
        {chain.collateralSymbol},{" "}
        {age.feedCount > 1 ? (
          <>
            is built from {age.feedCount} feeds; the {age.feedCount === 2 ? "older" : "oldest"} was published{" "}
          </>
        ) : (
          <>was published </>
        )}
        {age.published}, {age.age} before this read.
      </span>,
    );
  }

  bullets.push(
    <span key="isolated">
      It sits in one <H>isolated market</H>: {chain.loanSymbol} lent against {chain.collateralSymbol} at an LLTV of{" "}
      {(chain.lltv * 100).toFixed(1)}%, with its own oracle and rate model. Nothing outside this market backs or
      threatens the position.
    </span>,
  );

  if (hasColl && !hasDebt && chain.maxBorrow > 0) {
    bullets.push(
      <span key="idle-capacity">
        At the market&rsquo;s own oracle price this collateral could back up to {formatNumber(chain.maxBorrow)}{" "}
        {chain.loanSymbol} of borrowing.
      </span>,
    );
  }

  if (hasDebt) {
    if (hf != null) {
      // No health-factor stat on the card (the runway carries the risk read),
      // so the figure stays muted.
      bullets.push(
        <span key="hf">
          Its health factor is {hf.toFixed(2)} — the LLTV-weighted collateral value is {hf.toFixed(2)}× the debt, and at
          1.0 the position becomes liquidatable.
        </span>,
      );
    }
    if (dropPct != null && dropPct > 0) {
      bullets.push(
        <span key="drop">
          The {chain.collateralSymbol} price, in {chain.loanSymbol} terms, can fall about <H>{dropPct}%</H> before
          liquidation begins.
        </span>,
      );
    }
    if (chain.maxBorrow > chain.currentDebt) {
      bullets.push(
        <span key="power">
          About {formatNumber(chain.maxBorrow - chain.currentDebt)} {chain.loanSymbol} more could be borrowed at the
          current price; Morpho allows borrowing right up to the LLTV line.
        </span>,
      );
    }
    bullets.push(
      <span key="liq-model">
        Past the line, a liquidator repays debt and seizes collateral at a {penaltyPct}% discount. If the collateral
        runs out, the shortfall is written off against this market&rsquo;s lenders as bad debt.
      </span>,
    );
  }

  // The chip's own figure: DISTINCT transactions of the position's own — a
  // bundler tx lands several event rows, and seizures are done TO the position.
  const countedTxs = txCount != null && txCount > 0;
  if (countedTxs) {
    bullets.push(
      <span key="tx-count">
        The position has recorded <H>{txCount.toLocaleString("en-US")}</H> transaction{txCount === 1 ? "" : "s"} of its
        own to date{everLiquidated ? ", and its record also carries liquidation seizures" : ""}.
      </span>,
    );
  }

  // Who has been operating the position. It sits beside the count bullet —
  // a position run by an authorised operator reads as alarming until the
  // reader is told the owner granted it.
  //
  // The denominator is deliberately null (self-anchored lead): the count
  // bullet above speaks TRANSACTIONS while `ext.total` counts EVENTS — equal
  // numbers would be a coincidence of different quantities, so the operator
  // bullet states its own events base instead of chaining onto the bullet's.
  //
  // The identity is deliberately NOT bolded: an operator name has no chrome twin
  // on this card, and bolding it would break the pane's reverse-completeness
  // (charter §3) — the same reason the oracle value and health factor above stay
  // muted. Nor is an address ever interpolated as a stand-in for a name: the
  // fact (how many events, authorised by the owner) is stated whatever resolves,
  // and only a real name is ever spoken.
  const ext = externalActivity;
  if (ext && ext.external > 0) {
    const others = ext.external - (ext.actors[0]?.count ?? 0);
    bullets.push(
      <span key="operators">
        {operatorLead(ext, null, "recorded on this position")}
        {ext.external.toLocaleString("en-US")} {ext.external === 1 ? "was" : "were"} executed by an address other than
        the owner&rsquo;s. Morpho lets anyone add to a position, but requires the owner&rsquo;s own on-chain
        authorisation before another account can borrow or withdraw from it — so this is delegated operation, not
        interference.
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

// ── the terminal pane — a closed or liquidated position narrated from the
// replay + the timeline already on the page (no chain overlay needed) ─────────

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isMorphoEvent } from "@/lib/shared/types/event-shape";
import type { MorphoPositionView } from "./morpho-position-card";

function closureDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function MorphoClosedPositionExplanation({
  v,
  events,
}: {
  v: MorphoPositionView;
  /** The position's timeline (morpho events, ascending) — the pane reads how
   *  the record ended and the seizure tally from the rows already fetched. */
  events: BaseActivityEvent[];
}) {
  if (v.status === "open") return null;

  const morpho = events.filter(isMorphoEvent);
  const liqCount = morpho.filter((e) => e.context.data.eventType === "liquidation").length;
  const lastType = morpho.length > 0 ? morpho[morpho.length - 1].context.data.eventType : null;
  // How the record actually ended — the truthful closure attribution. The
  // liquidated STATUS only says seizures exist somewhere in the record; the
  // ending is a separate fact (709 of 1,535 liquidated-status positions ended
  // with the seizure; the rest closed by their own hand afterwards).
  const endedBySeizure = lastType === "liquidation";

  const hasPeakColl = v.peakCollateral > 0 && v.collateralSymbol != null;
  const hasPeakBorr = v.peakBorrowed > 0;

  const lead = endedBySeizure ? (
    <>This position was emptied by liquidation — the final seizure took the last of its collateral to cover its debt:</>
  ) : v.everLiquidated ? (
    <>
      This position ran its course and closed — the remaining collateral withdrawn and the debt repaid — with
      liquidation seizures in its record:
    </>
  ) : hasPeakBorr ? (
    <>This position ran its course and closed — the collateral withdrawn and the debt repaid:</>
  ) : (
    <>This position ran its course and closed — its collateral withdrawn, with nothing ever borrowed against it:</>
  );

  const bullets: React.ReactNode[] = [];

  if (hasPeakColl || hasPeakBorr) {
    bullets.push(
      <span key="peaks">
        At its height it held as much as{" "}
        {hasPeakColl ? (
          <H>
            {formatNumber(v.peakCollateral)} {v.collateralSymbol}
          </H>
        ) : null}
        {hasPeakColl && hasPeakBorr ? <> of collateral and had drawn as much as </> : null}
        {hasPeakBorr ? (
          <H>
            {formatNumber(v.peakBorrowed)} {v.loanSymbol}
          </H>
        ) : null}
        {hasPeakColl && hasPeakBorr ? (
          <>
            {" "}
            of principal — each figure is its own highest point over the position&rsquo;s recorded events, so the two
            need not have stood together; interest accrued on top of the principal between events.
          </>
        ) : hasPeakColl ? (
          <> of collateral — its highest point over the position&rsquo;s recorded events; it never drew debt.</>
        ) : (
          <> of principal — its highest recorded draw over the position&rsquo;s life.</>
        )}
      </span>,
    );
  }

  bullets.push(
    <span key="isolated">
      It sat in one isolated market — {v.loanSymbol} lent against {v.collateralSymbol ?? v.loanSymbol} at an LLTV of{" "}
      {(v.lltv * 100).toFixed(1)}% — so nothing outside that market backed or threatened it.
    </span>,
  );

  if (v.everLiquidated) {
    bullets.push(
      <span key="seizures">
        {liqCount > 0 ? (
          <>
            Liquidation seized it {liqCount} time{liqCount === 1 ? "" : "s"} —{" "}
          </>
        ) : (
          <>Liquidation seized it — </>
        )}
        a Morpho liquidation is by parts (a liquidator repays a slice of the debt and takes collateral at the
        market&rsquo;s fixed discount), so a single seizure need not empty a position.{" "}
        {endedBySeizure
          ? "Here the final seizure emptied it entirely."
          : "What remained after the seizures left by the position's own transactions."}{" "}
        Seizures in the record are what mark the outcome Liquidated rather than Closed.
      </span>,
    );
    // The split the timeline cannot show: the Liquidate log's cleared figure
    // merges repaid + badDebt, so the written-off share rides its own backend
    // sum (morpho_liquidation.bad_debt_assets). Stated only when it exists —
    // most liquidated records cleared fully against their collateral.
    if (v.badDebt > 0) {
      bullets.push(
        <span key="bad-debt">
          The seizures did not cover everything: {formatNumber(v.badDebt)} {v.loanSymbol} of the debt had no collateral
          left to claim and was written off — socialized to this market&rsquo;s lenders, not repaid.
        </span>,
      );
    }
  }

  bullets.push(
    <span key="closure">
      Its record closed
      {v.lastTs != null ? (
        <>
          {" "}
          on <H>{closureDate(v.lastTs)}</H>
        </>
      ) : null}
      , after <H>{v.txCount}</H> transaction{v.txCount === 1 ? "" : "s"} of its own.
    </span>,
  );

  bullets.push(
    <span key="door">
      The market-and-wallet pair is the position&rsquo;s permanent key — a new deposit or draw by the same wallet in
      this market reopens this very timeline.
    </span>,
  );

  return <ProseExplainer paragraph={lead} items={bullets} />;
}
