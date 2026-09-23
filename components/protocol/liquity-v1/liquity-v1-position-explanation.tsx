"use client";

// Plain-language, data-driven explanation of a Liquity V1 Trove — the Trove
// analog of the Spark / Aave position explanations, built straight from the
// chain-state response (getEntireDebtAndColl + PriceFeed + getCurrentICR @
// head): a few neutral bullets describing the holding, the ratio, the distance
// to liquidation, the redemption queue and — when present — pending
// redistribution rewards. Rendered inside the position card's Explanation
// heading-button (the V4/trove grammar) via the card's `explanation` prop.
//
// Every figure here is the same chain-state values shown (and <Prov>-traced) on the
// surfaces around it — this panel only narrates it. Third person throughout.

import type { LiquityV1PositionChainResponse } from "@/lib/api/fetch-liquity-v1-position";
import type { LiquityV1PositionView } from "@/components/protocol/liquity-v1/liquity-v1-position-card";
import { Prov } from "@/components/shared/provenance";
import { peakCollateralProv, peakDebtProv } from "@/lib/liquity-v1/event-provenance";
import { fmtUsd } from "@/lib/aave-v4/format";
import { formatNumber, formatCompact } from "@/lib/utils/format";
import { formatDate, formatDuration } from "@/lib/date";
import { pct } from "@/components/shared/ratio-bar";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";

const DUST = 1e-9;

export function LiquityV1PositionExplanation({
  chain,
}: {
  /** The live chain read. Null until it lands:
   *  nothing is narrated, and the pane still mounts so its foot controls draw. */
  chain: LiquityV1PositionChainResponse | null;
}) {
  if (!chain || chain.chainStale || chain.troveStatus !== "active") return null;

  const hasDebt = chain.debt > 0;
  const collUsd = chain.coll * chain.price;
  const liqPrice = hasDebt && chain.coll > 0 ? (chain.debt * chain.mcr) / chain.coll : null;
  const dropPct = liqPrice != null && chain.price > 0 ? Math.round((1 - liqPrice / chain.price) * 100) : null;

  // Status lead — subject-first, one sentence, two figures, colon-terminated
  // (charter §4). The ETH and LUSD figures are on the card's stat row, so they
  // carry the highlight.
  const lead = (
    <>
      The Trove holds <H>{formatNumber(chain.coll)} ETH</H> of collateral
      {hasDebt ? (
        <>
          {" "}
          against <H>{formatNumber(chain.debt)} LUSD</H> of debt:
        </>
      ) : (
        <> and owes nothing:</>
      )}
    </>
  );

  const bullets: React.ReactNode[] = [];

  if (collUsd > 0) {
    // The USD value has no stat-row twin on this card, so it stays muted.
    bullets.push(
      <span key="worth">
        At the protocol&rsquo;s own oracle price, that collateral is worth {fmtUsd(collUsd).display}.
      </span>,
    );
  }

  if (!hasDebt) {
    bullets.push(
      <span key="no-debt">
        Liquidation and redemption both act on debt, so with none outstanding the collateral answers to the owner alone.
      </span>,
    );
  } else {
    bullets.push(
      <span key="interest-free">
        Liquity V1 charges no ongoing interest, so the LUSD figure is the Trove&rsquo;s exact obligation: the drawn
        LUSD, the one-time borrowing fee, the 200 LUSD gas reserve, and any debt redistributed to it from liquidations
        the Stability Pool could not fully absorb.
      </span>,
    );
    if (chain.icr != null) {
      bullets.push(
        <span key="ratio">
          The collateral ratio is <H>{(chain.icr * 100).toFixed(1)}%</H> — the collateral is worth{" "}
          {chain.icr.toFixed(2)}× the debt.
        </span>,
      );
      bullets.push(
        <span key="liq-line">
          Below <H>{(chain.mcr * 100).toFixed(0)}%</H> the Trove can be liquidated
          {chain.recoveryMode ? (
            <> (and, while the system is in recovery mode, below {(chain.ccr * 100).toFixed(0)}%)</>
          ) : null}
          .
        </span>,
      );
    }
    if (liqPrice != null && dropPct != null && dropPct > 0) {
      bullets.push(
        <span key="drop">
          ETH can fall about <H>{dropPct}%</H> (to <H>{fmtUsd(liqPrice).display}</H>) before liquidation.
        </span>,
      );
    }
    {
      // Borrowing headroom to the active minimum — the risk row's own formula
      // (coll × price ÷ active ratio − debt), so the figures twin.
      const activeRatio = chain.recoveryMode ? chain.ccr : chain.mcr;
      const headroomLusd = Math.max(0, (chain.coll * chain.price) / activeRatio - chain.debt);
      if (chain.icr != null && headroomLusd > 0) {
        bullets.push(
          <span key="headroom">
            About <H>{formatCompact(headroomLusd)} LUSD</H> more could be borrowed before the Trove reaches the{" "}
            {(activeRatio * 100).toFixed(0)}% minimum.
          </span>,
        );
      }
    }
    if (chain.debtInFront != null && chain.trovesAhead != null) {
      bullets.push(
        <span key="queue">
          Redemptions repay the lowest-ratio Troves first: {formatCompact(chain.debtInFront)} LUSD across{" "}
          {chain.trovesAhead} Trove
          {chain.trovesAhead === 1 ? "" : "s"} would be redeemed before this one.
          {chain.queueDebtTotal != null && chain.queueDebtTotal > 0 && (
            <>
              {" "}
              That is <H>{pct(Math.min(1, chain.debtInFront / chain.queueDebtTotal))}</H> of the queue&rsquo;s total
              debt.
            </>
          )}
        </span>,
      );
    }
  }

  if (chain.pendingEthReward > DUST || chain.pendingLusdReward > DUST) {
    bullets.push(
      <span key="pending">
        Redistribution from past liquidations has not yet been applied to the recorded Trove:{" "}
        {formatNumber(chain.pendingEthReward)} ETH and {formatNumber(chain.pendingLusdReward)} LUSD are pending, applied
        on the Trove&rsquo;s next operation.
      </span>,
    );
  }

  if (chain.recoveryMode) {
    bullets.push(
      <span key="recovery">
        The system is in <H>recovery mode</H> — the total collateral ratio (<H>{(chain.tcr * 100).toFixed(1)}%</H>) is
        below the {(chain.ccr * 100).toFixed(0)}% critical threshold, tightening liquidation conditions system-wide.
      </span>,
    );
  } else if (chain.tcr > 0) {
    bullets.push(
      <span key="system-ratio">
        The system as a whole stands at a <H>{(chain.tcr * 100).toFixed(1)}%</H> total collateral ratio.
      </span>,
    );
  }

  return <ProseExplainer paragraph={lead} items={bullets} />;
}

// ── An indexed-open life the chain has moved past ─────────────────────────────
//
// The index can lag the chain: a life still marked open in the index whose live
// read finds the Trove closed (by owner, redemption, or liquidation). The live
// risk surfaces gate on an ACTIVE Trove and stay off — but the Explanation
// floor is never empty, so this narrates the divergence: what the chain says
// happened, and that the indexed history ends before that closing event.

export function LiquityV1SupersededExplanation({ chain }: { chain: LiquityV1PositionChainResponse }) {
  if (chain.chainStale || chain.troveStatus === "active") return null;

  const outcome =
    chain.troveStatus === "closedByOwner" ? (
      <>
        was <H>closed by its owner</H> — the LUSD debt repaid and the ETH collateral withdrawn
      </>
    ) : chain.troveStatus === "closedByRedemption" ? (
      <>
        was <H>fully redeemed against</H> — its LUSD debt cancelled at $1 face value, with any collateral surplus left
        claimable by the owner
      </>
    ) : chain.troveStatus === "closedByLiquidation" ? (
      <>
        was <H>liquidated</H> — its collateral ratio fell below the protocol&rsquo;s liquidation threshold, the ETH
        collateral seized and the LUSD debt cancelled
      </>
    ) : (
      <>
        has <H>no record</H> at the current head
      </>
    );

  return (
    <ProseExplainer
      paragraph={<>This Trove {outcome}:</>}
      items={[
        <span key="lag">
          The history shown here ends before that closing event, so the figures above describe the Trove as it was last
          recorded. The closing entry joins the timeline once it lands.
        </span>,
        <span key="no-live">
          The risk surfaces (collateral ratio, liquidation runway, redemption queue) describe an active Trove only, so
          they are not shown here.
        </span>,
      ]}
    />
  );
}

// ── Past lives ────────────────────────────────────────────────────────────────
//
// A closed or liquidated epoch narrates its OWN recorded figures, past tense —
// the Explanation floor is never empty, and it describes only the mode present.
// Everything here is the epoch's replayed index record (peaks, counts, last
// activity); nothing reads the live chain, because the live risk surfaces (CR,
// runway, redemption queue) describe the CURRENT Trove and would be false
// about a past life.
//
// A V1 Trove life ends by one of THREE mechanisms, and the record says which:
// the owner closed it (last event closeTrove), a redemption cleared the last
// of its debt (last event redemption, debt to zero), or a liquidation took it
// (status liquidated). 3,210 of the 8,366 closed lives in the frozen capture —
// 38% — ended by redemption, so the closed lead derives the mechanism from the
// life's final event rather than assuming an owner exit.

export function LiquityV1ClosedEpochExplanation({
  v,
  openedAt,
  lastAction,
}: {
  v: LiquityV1PositionView;
  /** Unix seconds of the life's first captured event — the "active from"
   *  anchor. Null when the timeline hasn't loaded; the tenure clause drops. */
  openedAt?: number | null;
  /** The life's final event type — the closure mechanism's witness. Null while
   *  the timeline loads; the lead falls back to the owner-exit reading (the
   *  majority mechanism for closed lives). */
  lastAction?: string | null;
}) {
  if (v.status !== "closed" && v.status !== "liquidated") return null;
  const liquidated = v.status === "liquidated";
  const redeemed = !liquidated && lastAction === "redemption";
  const endedOn = v.lastActivityAt > 0 ? formatDate(v.lastActivityAt) : null;

  // Status lead (charter §4) — the life's outcome is the one-sentence verdict,
  // colon-terminated; the what-that-meant detail and the enumerable facts
  // (peaks, tenure, the live-surface note) are bullets.
  const lead = liquidated ? (
    <>
      This Trove life ended in <H>liquidation</H>
      {endedOn ? <> on {endedOn}</> : null}:
    </>
  ) : redeemed ? (
    <>
      This Trove life ended <H>fully redeemed</H>
      {endedOn ? <> on {endedOn}</> : null}:
    </>
  ) : (
    <>
      This Trove life was <H>closed by its owner</H>
      {endedOn ? <> on {endedOn}</> : null}:
    </>
  );

  const bullets: React.ReactNode[] = [];

  bullets.push(
    liquidated ? (
      <span key="outcome">
        Its collateral ratio fell below the protocol&rsquo;s liquidation threshold — the ETH collateral was seized and
        the LUSD debt cancelled, absorbed by the Stability Pool or redistributed to other Troves.
      </span>
    ) : redeemed ? (
      <span key="outcome">
        A redemption cancelled the last of its LUSD debt at $1 face value, taking ETH collateral of equal value — the
        collateral that remained moved to the CollSurplusPool, where it stays claimable by the owner.
      </span>
    ) : (
      <span key="outcome">
        The owner repaid the LUSD debt and withdrew the ETH collateral, ending the life by their own transaction.
      </span>
    ),
  );

  if (v.peakCollateral > 0 || v.peakDebt > 0) {
    bullets.push(
      <span key="peaks">
        At its height it held{" "}
        <Prov info={peakCollateralProv()}>
          <H>{formatNumber(v.peakCollateral)} ETH</H>
        </Prov>{" "}
        against{" "}
        <Prov info={peakDebtProv()}>
          <H>{formatNumber(v.peakDebt)} LUSD</H>
        </Prov>{" "}
        of debt — the highest figures this life recorded, each its own lifetime maximum.
      </span>,
    );
  }

  const tenure = openedAt != null && openedAt > 0 && v.lastActivityAt > openedAt;
  if (v.txCount > 0 || tenure) {
    bullets.push(
      <span key="activity">
        {tenure ? (
          <>
            It was active for <H>{formatDuration(openedAt as number, v.lastActivityAt)}</H>, from{" "}
            {formatDate(openedAt as number)} to {formatDate(v.lastActivityAt)}, and
          </>
        ) : (
          <>Over this life it</>
        )}{" "}
        {v.txCount > 0 ? (
          <>
            recorded <H>{v.txCount}</H> transaction{v.txCount === 1 ? "" : "s"}
          </>
        ) : (
          <>recorded no owner transactions beyond its closing event</>
        )}
        {v.redemptionCount > 0 ? (
          <>
            {" "}
            and was redeemed against <H>{v.redemptionCount}</H> time{v.redemptionCount === 1 ? "" : "s"}
          </>
        ) : null}
        .
      </span>,
    );
  }

  bullets.push(
    <span key="no-live">
      The live risk surfaces (collateral ratio, liquidation runway, redemption queue) describe the current on-chain
      Trove, so a past life shows its recorded history alone.
    </span>,
  );

  return <ProseExplainer paragraph={lead} items={bullets} />;
}
