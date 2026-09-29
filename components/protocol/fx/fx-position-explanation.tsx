"use client";

// Plain-language, data-driven explanation of an f(x) position — narration of
// the same figures the card asserts, under the explanation-copy charter: what
// each number MEANS, never how it was read. f(x) sets the pane's three moods:
// the pool's own current figures are present (collateral, fxUSD debt, debt
// ratio), still pending — the card shows dashes, the mode pill decides from
// the event-implied debt (commit dbe0868), and this pane must describe the
// position from what IS present without asserting figures the pool hasn't
// stated — or the position is closed, where the settled zeros and the
// reconciliation footnote carry the ending's story (the socialized clears
// and, on a liquidated position, the bad-debt write-off). Debt stays fxUSD
// throughout — it is never equated to dollars.
//
// Bold figures are the card-chrome twins (the collateral/debt headlines, the
// debt ratio, the collateral's USD footnote, the implied/socialized figures on
// the debt footnote, the meta counts) — byte-identical format calls, so the
// reader can walk each one back to the card (charter §3 reverse-completeness).

import type { FxPositionView } from "@/components/protocol/fx/fx-position-card";
import { formatUsd } from "@/lib/shared/format-event";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { useEnsName } from "@/lib/ens/use-ens-names";
import { operatorLead, type ExternalActorSummary } from "@/lib/shared/external-actor";
import { AmountText } from "@/components/shared/amount-text";
import { useFxPoolTerms, useFxPricesAt } from "@/lib/fx/use-event-state";
import { formatNumber } from "@/lib/utils/format";

export function FxPositionExplanation({
  v,
  externalActivity,
  timelineRows,
}: {
  v: FxPositionView;
  /** Who executed the position's events, reduced over its whole history with
   *  the same predicate the event cards render (summariseFxExternalActors).
   *  Omit to skip the operator bullet. */
  externalActivity?: ExternalActorSummary;
  /** Rows on the rendered timeline. It carries MORE than the position's own
   *  emitted events (derived tick rebalances, ownership handovers), so the
   *  events bullet names both counts instead of letting them contradict. */
  timelineRows?: number;
}) {
  // Hooks first — the pane has several early returns below.
  const leadName = useEnsName(externalActivity?.actors[0]?.address ?? null);
  const secondName = useEnsName(externalActivity?.actors[1]?.address ?? null);
  const terms = useFxPoolTerms(v.status === "open" ? v.pool : null);
  const pxRead = useFxPricesAt(v.pool, v.positionId, v.status === "open" ? v.settled.block : null);
  const px =
    pxRead?.anchorPrice != null && pxRead.minPrice != null
      ? { anchor: Number(pxRead.anchorPrice) / 1e18, min: Number(pxRead.minPrice) / 1e18 }
      : null;

  const isClosed = v.status === "closed";
  const hasEvents = v.activity.eventCount > 0;
  const pending = v.settled.debts == null;
  const implied = v.impliedDebt.amount;

  const bullets: React.ReactNode[] = [];
  let lead: React.ReactNode;

  if (isClosed) {
    // ── the closed mood: the settled read carries zeros on both sides ───────
    // The outcome pill's claim (liquidated when the position was ever
    // liquidated, closed otherwise) is narrated here; the reconciliation
    // footnote's figures get their story — on a liquidated position the gap
    // IS the crash: socialized clears and the final bad-debt write-off.
    lead = v.everLiquidated ? (
      <>
        This position is closed after <H>{v.liquidationCount}</H> liquidation
        {v.liquidationCount === 1 ? "" : "s"} — the pool&rsquo;s own figures stand at zero collateral and zero fxUSD
        debt:
      </>
    ) : (
      <>This position is closed — the pool&rsquo;s own figures stand at zero collateral and zero fxUSD debt:</>
    );

    if (hasEvents) {
      const diff = v.socializedDebt ?? implied - (v.settled.debts ?? 0);
      if (implied < 0) {
        bullets.push(
          <span key="socialized">
            Its own events net to{" "}
            <H>
              <AmountText value={implied} /> fxUSD
            </H>{" "}
            — more debt left through its transactions than arrived, because other positions&rsquo; bad debt, which the
            pool adds to every position, raised its debt with no transaction of its own and its repayments and
            liquidation cleared that too. The <AmountText value={Math.abs(diff)} /> fxUSD difference is that debt.
          </span>,
        );
      } else if (Math.abs(diff) > 1e-9) {
        bullets.push(
          <span key="socialized">
            Its transactions add up to{" "}
            <H>
              <AmountText value={implied} /> fxUSD
            </H>{" "}
            of debt, and all of it left without the owner&rsquo;s transaction
            {v.everLiquidated
              ? ": rebalances cleared it, and at liquidation the debt the collateral could not cover was added to the other positions"
              : ", cleared by rebalances"}
            .
          </span>,
        );
      }
    } else {
      bullets.push(
        <span key="no-events">
          It has no recorded events — it was created by a path that logs nothing, so the pool&rsquo;s settled figures
          are its whole record.
        </span>,
      );
    }
  } else if (pending && !hasEvents) {
    // The empty floor: nothing recorded, nothing stated by the pool — a
    // verdict that narrates nothing else keeps its period (charter §4).
    return (
      <ProseExplainer
        paragraph={
          <>
            This position has no recorded events and the pool&rsquo;s own figures have not arrived yet, so there is
            nothing to describe until they do.
          </>
        }
      />
    );
  } else if (pending) {
    // ── the pending mood: the pool's own figure hasn't arrived ──────────────
    lead =
      implied > 0 ? (
        <>This position is borrowing fxUSD, with the pool&rsquo;s own current figures still to arrive:</>
      ) : (
        <>
          This position&rsquo;s events show no outstanding fxUSD debt, and the pool&rsquo;s own current figures are
          still to arrive:
        </>
      );

    if (implied > 0) {
      bullets.push(
        <span key="implied">
          Its own events add up to{" "}
          <H>
            <AmountText value={implied} /> fxUSD
          </H>{" "}
          of debt — a running total of what it borrowed and repaid, not the exact amount owed now.
        </span>,
      );
    }
    bullets.push(
      <span key="dashes">
        Collateral, debt and the debt ratio show dashes until the pool&rsquo;s own figure arrives. f(x) moves every
        position with pool-wide funding charged on its collateral, tick rebalances and write-offs that leave no event of
        the position&rsquo;s own, so only the pool&rsquo;s figure can say what it holds now.
      </span>,
    );
  } else {
    // ── the settled mood: the pool's own figures are on the card ────────────
    const colls = v.settled.colls;
    const debts = v.settled.debts as number;
    const hasDebt = debts > 0;

    lead =
      colls != null && hasDebt ? (
        <>
          This position holds{" "}
          <H>
            <AmountText value={colls} format="compact" /> {v.normalizedSymbol}
          </H>{" "}
          of collateral against{" "}
          <H>
            <AmountText value={debts} format="compact" /> fxUSD
          </H>{" "}
          of debt:
        </>
      ) : colls != null ? (
        <>
          This position holds{" "}
          <H>
            <AmountText value={colls} format="compact" /> {v.normalizedSymbol}
          </H>{" "}
          of collateral and owes nothing:
        </>
      ) : (
        <>
          This position owes{" "}
          <H>
            <AmountText value={debts} format="compact" /> fxUSD
          </H>
          :
        </>
      );

    const anchorAt =
      px?.anchor ?? (hasDebt && v.settled.debtRatio && colls ? debts / (colls * v.settled.debtRatio) : null);
    if (colls != null && px) {
      bullets.push(
        <span key="usd">
          At the oracle&rsquo;s anchor price, {formatUsd(px.anchor)} per {v.normalizedSymbol}, that collateral is worth{" "}
          <H>{formatUsd(colls * px.anchor)}</H>.
        </span>,
      );
    } else if (v.settled.collUsd != null) {
      bullets.push(
        <span key="usd">
          At the oracle&rsquo;s min price
          {v.oracle.priceUsd != null ? (
            <>
              , {formatUsd(v.oracle.priceUsd)} per {v.normalizedSymbol},
            </>
          ) : null}{" "}
          that collateral is worth <H>{formatUsd(v.settled.collUsd)}</H>.
        </span>,
      );
    }

    if (hasDebt && v.settled.debtRatio != null && colls != null && colls > 0 && anchorAt != null) {
      const ratio = v.settled.debtRatio;
      const line = (r: number) => `${(r * 100).toFixed(1).replace(/\.0$/, "")}%`;
      bullets.push(
        <span key="ratio">
          The pool puts the debt ratio at <H>{(ratio * 100).toFixed(1)}%</H>: the debt as a share of the
          collateral&rsquo;s value at the anchor price, {formatUsd(anchorAt)} per {v.normalizedSymbol}.
          {px ? (
            <>
              {" "}
              The pool judges its lines at the oracle&rsquo;s min price, {formatUsd(px.min)} at the same block, where
              the ratio is {((debts / (colls * px.min)) * 100).toFixed(1)}%. The ratios on the timeline rows are read at
              the anchor price, so a rebalanced row can show a little under the rebalance line.
            </>
          ) : null}
        </span>,
      );
      if (terms && px && debts / (colls * px.min) < terms.rebalanceRatio) {
        const p88 = debts / (colls * terms.rebalanceRatio);
        const p95 = debts / (colls * terms.liquidateRatio);
        bullets.push(
          <span key="lines">
            Rebalancing starts at <H>{line(terms.rebalanceRatio)}</H> and liquidation at{" "}
            <H>{line(terms.liquidateRatio)}</H>. With today&rsquo;s collateral and debt the position reaches{" "}
            {line(terms.rebalanceRatio)} if the min price falls to <H>{formatUsd(p88)}</H>,{" "}
            {((1 - p88 / px.min) * 100).toFixed(1)}% below now, and {line(terms.liquidateRatio)} at{" "}
            <H>{formatUsd(p95)}</H>, {((1 - p95 / px.min) * 100).toFixed(1)}% below; funding keeps taking collateral,
            which moves both prices up slowly. A rebalance takes part of the collateral and leaves the position open; a
            liquidation repays the debt and takes collateral worth it plus the bonus.
          </span>,
        );
      }
      if (terms) {
        bullets.push(
          <span key="exit">
            Collateral can be withdrawn while the debt ratio afterwards stays at or under {line(terms.maxBorrowRatio)}{" "}
            at the min price; past that, debt has to be repaid first. Closing repays the whole debt in fxUSD and returns
            all the collateral.
          </span>,
        );
      }
    }

    if (colls != null && colls > 0 && terms && terms.fundingRatio > 0) {
      bullets.push(
        <span key="funding">
          Funding, at {(terms.fundingRatio * 100).toFixed(2).replace(/\.?0+$/, "")}% a year today, takes about{" "}
          {formatNumber(colls * terms.fundingRatio)} {v.normalizedSymbol} a year from this collateral, with no
          transaction.
        </span>,
      );
    }

    if (!hasDebt && colls != null) {
      bullets.push(
        <span key="no-debt">
          With no fxUSD debt there is no debt ratio, and nothing here can be rebalanced or liquidated.
        </span>,
      );
    }

    if (hasEvents && implied < 0) {
      // The implied Σ has run below zero: presenting it as "debt" reads as
      // nonsense (the markdown export's negative branch tells the story; the
      // pane matches it). Bold twins stay byte-identical to the card footnote.
      const diff = v.socializedDebt ?? implied - debts;
      bullets.push(
        <span key="socialized">
          The position&rsquo;s own events net to{" "}
          <H>
            <AmountText value={implied} /> fxUSD
          </H>{" "}
          — more debt left through its transactions than arrived, because other positions&rsquo; bad debt, which the
          pool adds to every position, raised its debt with no transaction of its own and its repayments and liquidation
          cleared that too. The <AmountText value={Math.abs(diff)} /> fxUSD difference is that debt.
        </span>,
      );
    } else if (hasEvents) {
      const diff = v.socializedDebt ?? implied - debts;
      bullets.push(
        <span key="socialized">
          The position&rsquo;s transactions add up to{" "}
          <H>
            <AmountText value={implied} /> fxUSD
          </H>{" "}
          of debt.
          {diff > 0 ? (
            <>
              {" "}
              It owes <AmountText value={diff} /> fxUSD less, because debt left without the owner&rsquo;s transaction:
              rebalances cleared it, net of other positions&rsquo; bad debt, which the pool adds to every position.
            </>
          ) : diff < 0 ? (
            <>
              {" "}
              It owes <AmountText value={-diff} /> fxUSD more, because other positions&rsquo; bad debt, which the pool
              adds to every position, raised it without the owner&rsquo;s transaction.
            </>
          ) : null}
        </span>,
      );
    } else {
      bullets.push(
        <span key="no-events">
          It has no recorded events — it was created by a path that logs nothing, so the pool&rsquo;s own figures above
          are its whole description.
        </span>,
      );
    }
  }

  if (v.liquidationCount > 0 && !isClosed) {
    bullets.push(
      <span key="liq">
        The position has been liquidated <H>{v.liquidationCount}</H> time{v.liquidationCount === 1 ? "" : "s"} and
        remains open.
      </span>,
    );
  }

  if (hasEvents) {
    // The count the meta pill shows (its chrome twin): the position's own
    // transactions, liquidations counted by their own badge. The timeline
    // renders more rows than the position emitted — derived tick rebalances
    // and ownership handovers ride it — so where the two differ, both are
    // named (the markdown export's rule).
    const ownTx = v.activity.eventCount - v.liquidationCount;
    const extras = timelineRows != null ? timelineRows - v.activity.eventCount : 0;
    bullets.push(
      <span key="events">
        The position has recorded <H>{ownTx}</H> transaction{ownTx === 1 ? "" : "s"} of its own
        {v.liquidationCount > 0
          ? `, alongside the ${v.liquidationCount} liquidation${v.liquidationCount === 1 ? "" : "s"}`
          : ""}
        .
        {extras > 0 ? (
          <>
            {" "}
            The timeline below carries {timelineRows} rows; the other {extras} are rebalances run by keepers and
            ownership handovers, placed on its history.
          </>
        ) : null}
      </span>,
    );
  }

  // Who has been operating the position, across its whole history — the same
  // verdict each event card renders on its spine, reduced once so the pane can
  // state the PATTERN rather than one row of it. On a position run by a bot or
  // a keeper this is the single most important thing about it (charter §5
  // item 7), and the event clause alone can never say it.
  //
  // Count-first and plurality-safe (an "operated by <name>" template is false
  // wherever several addresses share the work), and an address is never spoken
  // in place of a name — the fact holds whether or not anything resolves. The
  // identity stays unbolded: it has no chrome twin on the card, so bolding it
  // would break reverse-completeness (charter §3).
  const ext = externalActivity;
  if (ext && ext.external > 0) {
    const others = ext.external - (ext.actors[0]?.count ?? 0);
    bullets.push(
      <span key="operators">
        {/* Self-anchored (null): the count bullet above states TRANSACTIONS
            (own emitted, liquidations apart) while this summary reduces over
            every timeline row — equal numbers would not be the same quantity,
            so the lead names its own denominator (the dolomite shape). */}
        {operatorLead(ext, null, "recorded on this position")}
        {ext.external.toLocaleString("en-US")} {ext.external === 1 ? "was" : "were"} executed by an address other than
        the owner&rsquo;s. Anyone may add collateral to a position or repay its debt without asking. Withdrawing or
        borrowing needs the manager&rsquo;s caller to hold the NFT at that moment: a contract the holder has approved,
        such as f(x)&rsquo;s router or its limit-order manager, can take the NFT for one transaction and return it, and
        each such row names who did.
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

  return <ProseExplainer paragraph={lead} items={bullets} />;
}
