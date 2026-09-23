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
import { formatCompact, formatNumber } from "@/lib/utils/format";
import { formatUsd } from "@/lib/shared/format-event";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { useEnsName } from "@/lib/ens/use-ens-names";
import { operatorLead, type ExternalActorSummary } from "@/lib/shared/external-actor";

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
            Its own events net to <H>{formatNumber(implied)} fxUSD</H> — the timeline recorded more debt leaving than
            arriving, because bad debt socialized from other positions&rsquo; liquidations raised its debt with no event
            of the position&rsquo;s own and the recorded repayments and liquidation clears removed that too. The{" "}
            <H>{formatNumber(diff)} fxUSD</H> marked socialized is all of that silent movement at once.
          </span>,
        );
      } else if (Math.abs(diff) > 1e-9) {
        bullets.push(
          <span key="socialized">
            Its own events still add up to <H>{formatNumber(implied)} fxUSD</H> of debt. The{" "}
            <H>{formatNumber(diff)} fxUSD</H> marked socialized cleared with no event of the position&rsquo;s own —
            {v.everLiquidated ? " tick rebalances and the bad-debt write-off at liquidation" : " tick rebalances"} that
            f(x) applies pool-wide — which is how the event record and the empty settled figures reconcile.
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
          Its own events add up to <H>{formatNumber(implied)} fxUSD</H> of debt — a running total of what it borrowed
          and repaid, not the exact amount owed now.
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
            {formatCompact(colls)} {v.normalizedSymbol}
          </H>{" "}
          of collateral against <H>{formatCompact(debts)} fxUSD</H> of debt:
        </>
      ) : colls != null ? (
        <>
          This position holds{" "}
          <H>
            {formatCompact(colls)} {v.normalizedSymbol}
          </H>{" "}
          of collateral and owes nothing:
        </>
      ) : (
        <>
          This position owes <H>{formatCompact(debts)} fxUSD</H>:
        </>
      );

    if (v.settled.collUsd != null) {
      bullets.push(
        <span key="usd">
          At the pool&rsquo;s own oracle price, that collateral is worth <H>{formatUsd(v.settled.collUsd)}</H>.
        </span>,
      );
    }

    if (hasDebt && v.settled.debtRatio != null) {
      bullets.push(
        <span key="ratio">
          The pool puts the debt ratio at <H>{(v.settled.debtRatio * 100).toFixed(1)}%</H> — the debt is that share of
          the collateral&rsquo;s value at the price the pool itself judges positions by.
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
          The position&rsquo;s own events net to <H>{formatNumber(implied)} fxUSD</H> — the timeline recorded more debt
          leaving than arriving, because bad debt socialized from other positions&rsquo; liquidations raised its debt
          with no event of the position&rsquo;s own and the recorded repayments and liquidation clears removed that too.
          The <H>{formatNumber(diff)} fxUSD</H> marked socialized is all of that silent movement at once: the gap
          between the event record and the settled debt above.
        </span>,
      );
    } else if (hasEvents) {
      const diff = v.socializedDebt ?? implied - debts;
      bullets.push(
        <span key="socialized">
          The position&rsquo;s own events add up to <H>{formatNumber(implied)} fxUSD</H> of debt. The{" "}
          <H>{formatNumber(diff)} fxUSD</H> marked socialized is the difference — tick rebalances, bad-debt write-offs
          and bad debt socialized from other positions&rsquo; liquidations that f(x) applies pool-wide, with no event of
          the position&rsquo;s own.
          {diff < 0 ? (
            <>
              {" "}
              It reads negative because bad debt socialized from other positions&rsquo; liquidations added debt beyond
              what the events show.
            </>
          ) : diff > 0 ? (
            <> It reads positive because rebalances and write-offs cleared debt below what the events show.</>
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
            The timeline below carries {timelineRows} rows — the additional {extras} are pool-level tick rebalances and
            ownership handovers placed on its history.
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
        the owner&rsquo;s. That is as far as another address can go here: anyone may add collateral to a position or
        repay its debt without asking, while withdrawing collateral or drawing debt is checked against the holder
        itself, and f(x) has no way to delegate it.
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
