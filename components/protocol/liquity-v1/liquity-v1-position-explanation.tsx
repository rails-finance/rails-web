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
import { formatDate, formatDuration } from "@/lib/date";
import { pct } from "@/components/shared/ratio-bar";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { AmountText } from "@/components/shared/amount-text";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { liquityV1LiquidationContent } from "@/lib/shared/learn-more-content";
import { surplusClaimableProv } from "@/lib/liquity-v1/event-provenance";
import type { LiquityV1Surplus } from "@/lib/liquity-v1/use-event-read";

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
      The Trove holds{" "}
      <H>
        <AmountText value={chain.coll} /> ETH
      </H>{" "}
      of collateral
      {hasDebt ? (
        <>
          {" "}
          against{" "}
          <H>
            <AmountText value={chain.debt} /> LUSD
          </H>{" "}
          of debt:
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
        At the PriceFeed&rsquo;s ETH price now, that collateral is worth {fmtUsd(collUsd).display}.
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
        Liquity V1 charges no interest, so the LUSD figure is the Trove&rsquo;s whole debt: the LUSD received, the
        one-time borrowing fees, the 200 LUSD liquidation reserve, and any debt shared out to it from liquidations the
        Stability Pool could not cover.
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
          Below <H>{(chain.mcr * 100).toFixed(0)}%</H> anyone can liquidate the Trove: the Stability Pool takes its debt
          and its ETH, and the owner keeps the LUSD borrowed.
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
            About{" "}
            <H>
              <AmountText value={headroomLusd} format="compact" /> LUSD
            </H>{" "}
            more could be borrowed before the Trove&rsquo;s ratio falls to {(activeRatio * 100).toFixed(0)}%.
          </span>,
        );
      }
    }
    if (chain.debtInFront != null && chain.trovesAhead != null) {
      bullets.push(
        <span key="queue">
          Redemptions repay the lowest-ratio Troves first: <AmountText value={chain.debtInFront} format="compact" />{" "}
          LUSD across {chain.trovesAhead} Trove
          {chain.trovesAhead === 1 ? "" : "s"} would be redeemed before this one.
          {chain.queueDebtTotal != null && chain.queueDebtTotal > 0 && (
            <>
              {" "}
              That is <H>{pct(Math.min(1, chain.debtInFront / chain.queueDebtTotal))}</H> of all the debt in the queue,
              so a redemption reaches this Trove only after that share has been redeemed.
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
        <AmountText value={chain.pendingEthReward} /> ETH and <AmountText value={chain.pendingLusdReward} /> LUSD are
        pending, applied on the Trove&rsquo;s next operation.
      </span>,
    );
  }

  // Recovery Mode, named with the system's ratio now, and the modal that
  // explains it with liquidation and the Stability Pool.
  const howLiquidation = (
    <span className="ml-1 inline-flex align-middle">
      <LearnMore inline content={liquityV1LiquidationContent()} />
    </span>
  );
  if (chain.tcr > 0) {
    bullets.push(
      chain.recoveryMode ? (
        <span key="recovery">
          The system is in <H>Recovery Mode</H>: the total collateral ratio of all Troves is{" "}
          <H>{(chain.tcr * 100).toFixed(1)}%</H>, below {(chain.ccr * 100).toFixed(0)}%. Until it recovers, a Trove
          below that ratio can be liquidated, collateral cannot be withdrawn, and new debt needs a{" "}
          {(chain.ccr * 100).toFixed(0)}% ratio.{howLiquidation}
        </span>
      ) : (
        <span key="system-ratio">
          Recovery Mode is off: the total collateral ratio of all Troves is <H>{(chain.tcr * 100).toFixed(1)}%</H>,
          above the {(chain.ccr * 100).toFixed(0)}% below which Recovery Mode starts. In Recovery Mode a Trove below the
          system&rsquo;s ratio can be liquidated, even above 110%.{howLiquidation}
        </span>
      ),
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
  surplus,
}: {
  v: LiquityV1PositionView;
  /** Unix seconds of the life's first captured event — the "active from"
   *  anchor. Null when the timeline hasn't loaded; the tenure clause drops. */
  openedAt?: number | null;
  /** The life's final event type — the closure mechanism's witness. Null while
   *  the timeline loads; the lead falls back to the owner-exit reading (the
   *  majority mechanism for closed lives). */
  lastAction?: string | null;
  /** ETH the closing left in the CollSurplusPool, with its claim status. */
  surplus?: LiquityV1Surplus | null;
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
        Its collateral ratio fell below the level at which it could be liquidated: the ETH collateral was seized and the
        LUSD debt cancelled, by the Stability Pool or shared out to other Troves. The owner kept the LUSD borrowed.
      </span>
    ) : redeemed ? (
      <span key="outcome">
        A redemption cancelled the last of its LUSD debt at $1 per LUSD and took ETH of equal value; the 200 LUSD
        liquidation reserve was burned, and the ETH that remained moved to the CollSurplusPool for the owner.
      </span>
    ) : (
      <span key="outcome">
        The owner repaid the LUSD debt less the 200 LUSD liquidation reserve, which was burned, and took back the ETH
        collateral.
      </span>
    ),
  );

  if (surplus) {
    bullets.push(
      <span key="surplus">
        {surplus.claimed ? (
          <>
            The{" "}
            <Prov info={surplusClaimableProv(surplus)}>
              <H>
                <AmountText value={surplus.surplus} /> ETH
              </H>
            </Prov>{" "}
            left in the CollSurplusPool was claimed by the owner
            {surplus.claimed.timestamp != null && <> on {formatDate(surplus.claimed.timestamp)}</>}.
          </>
        ) : (
          <>
            <Prov info={surplusClaimableProv(surplus)}>
              <H>
                <AmountText value={surplus.claimable} /> ETH
              </H>
            </Prov>{" "}
            is still in the CollSurplusPool, waiting for the owner to claim it.
          </>
        )}
      </span>,
    );
  }

  if (v.peakCollateral > 0 || v.peakDebt > 0) {
    bullets.push(
      <span key="peaks">
        At its height it held{" "}
        <Prov info={peakCollateralProv()}>
          <H>
            <AmountText value={v.peakCollateral} /> ETH
          </H>
        </Prov>{" "}
        against{" "}
        <Prov info={peakDebtProv()}>
          <H>
            <AmountText value={v.peakDebt} /> LUSD
          </H>
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
