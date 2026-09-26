"use client";

// Plain-language explanation of a Frankencoin position — a subject-first status
// lead (what it holds and owes) followed by bullets, each an independent fact:
// the owner-declared price and what it backs, the reserve + up-front-interest
// frame, the lifecycle clocks (veto window, cooldown, expiry), and the live
// challenge state. Built straight from the position's own head state.
//
// Under the explanation-copy charter: the pane says only what the figures MEAN.
// It carries no data epistemics — no slot/method names, no "indexed" self-
// crediting, no how-we-derived-it notes; the receipt one inspector click away
// owns "how we know". Third person throughout; only the mode present is
// described. NO health factor exists and none is narrated; NO dollars exist and
// none are shown.

import type { FrankencoinChainResponse } from "@/lib/api/fetch-frankencoin-position";
import { formatNumber } from "@/lib/utils/format";
import { ppmToPct } from "@/lib/frankencoin/asset-catalog";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { formatDate } from "@/lib/date";

const dateOf = (unix: number): string => formatDate(unix);

export function FrankencoinPositionExplanation({
  chain,
  openedAt,
  challengeCount,
  denied,
  txCount,
}: {
  chain: FrankencoinChainResponse;
  /** The PositionOpened timestamp from the index — lets the narration state
   *  the veto window (start − opened). Omit to skip the bullet. */
  openedAt?: number | null;
  /** Replayed challenge count from the index — lets an open survivor's
   *  narration state the two-axis fact. Omit to skip the bullet. */
  challengeCount?: number;
  /** The indexed PositionDenied fact (not head-observable). */
  denied?: boolean;
  /** The card's transaction count (the count badge). Omit to skip. */
  txCount?: number;
}) {
  const sym = chain.collateralSymbol ?? "collateral";
  const now = Date.now() / 1000;

  // Subject-first status lead (charter §4): the composition verdict in one
  // sentence, ≤2 figures, colon-terminated — the lead-in to the bullets. The
  // collateral / minted figures also head the position card's stat row, so
  // they carry the bold highlight.
  const hasColl = chain.collateral != null && chain.collateral > 0;
  const hasMint = chain.minted != null && chain.minted > 0;
  const lead: React.ReactNode = chain.isClosed ? (
    // A closed position may narrate nothing else — the verdict keeps its
    // period rather than dangling a colon over no bullets.
    <>This position is closed.</>
  ) : hasColl && hasMint ? (
    <>
      This position holds{" "}
      <H>
        {formatNumber(chain.collateral!)} {sym}
      </H>{" "}
      of collateral and owes <H>{formatNumber(chain.minted!)} ZCHF</H>:
    </>
  ) : hasColl ? (
    <>
      This position holds{" "}
      <H>
        {formatNumber(chain.collateral!)} {sym}
      </H>{" "}
      of collateral and has no debt:
    </>
  ) : hasMint ? (
    <>
      This position owes <H>{formatNumber(chain.minted!)} ZCHF</H>:
    </>
  ) : null;

  const bullets: React.ReactNode[] = [];

  if (chain.liqPrice != null && chain.liqPrice > 0) {
    bullets.push(
      <span key="price">
        The liquidation price is <H>{formatNumber(chain.liqPrice)} ZCHF</H> per {sym} — <H>declared by the owner</H>,
        not an oracle: Frankencoin runs no price feed, and a declared price stands until someone challenges it.
        {chain.mintCeiling != null && chain.mintCeiling > 0 ? (
          <> At this price the posted collateral covers up to {formatNumber(chain.mintCeiling)} ZCHF of minting.</>
        ) : null}
      </span>,
    );
  }

  if (hasMint && chain.reserveHeld != null && chain.reserveContributionPPM != null) {
    bullets.push(
      <span key="reserve">
        The system reserve holds back {formatNumber(chain.reserveHeld)} ZCHF (
        {ppmToPct(chain.reserveContributionPPM).toFixed(0)}%) of that minted total, returned on repayment.
      </span>,
    );
  }

  if (chain.annualInterestPPM != null) {
    bullets.push(
      <span key="interest">
        The annual interest rate is <H>{ppmToPct(chain.annualInterestPPM).toFixed(2)}%</H>, charged{" "}
        <H>at minting time</H> for the remaining term, so the minted figure grows only when the position mints again.
        {chain.hub === "v2" && chain.riskPremiumPPM != null ? (
          <>
            {" "}
            On V2 that is the system base rate plus this position&rsquo;s fixed{" "}
            {ppmToPct(chain.riskPremiumPPM).toFixed(2)}% risk premium.
          </>
        ) : null}
      </span>,
    );
  }

  if (chain.challengedAmount != null && chain.challengedAmount > 0) {
    bullets.push(
      <span key="challenged">
        {formatNumber(chain.challengedAmount)} {sym} of the collateral is <H>under challenge right now</H> — an auction
        is testing the declared price. Phase 1 offers the challenger&rsquo;s own posted collateral at that price; only
        if nobody buys does the position&rsquo;s collateral go to the declining phase-2 auction.
      </span>,
    );
  }

  if (chain.cooldownActive && chain.cooldownUntil != null) {
    bullets.push(
      <span key="cooldown">
        Minting is <H>paused</H> until {dateOf(chain.cooldownUntil)} — the cooldown that follows a declared-price raise,
        the window in which the new price can be challenged before it backs fresh ZCHF.
      </span>,
    );
  }

  if (denied) {
    bullets.push(
      <span key="denied">
        The position was <H>denied</H> during its init window — holders of enough FPS vetoed it. Minting is closed to it
        permanently; the collateral stays withdrawable by the owner.
      </span>,
    );
  } else if (chain.mintingDisabledForGood && !chain.isClosed) {
    bullets.push(
      <span key="disabled">
        Minting is <H>disabled for good</H>.
      </span>,
    );
  }

  if (chain.expiration != null && chain.expiration > 0 && !chain.isClosed) {
    const days = Math.round((chain.expiration - now) / 86400);
    bullets.push(
      <span key="expiry">
        {chain.expired ? (
          <>
            The position <H>expired</H> on {dateOf(chain.expiration)}. Its minting window has closed
            {chain.hub === "v2" ? (
              <>
                , and anyone can clear it through the hub&rsquo;s <H>forced sale</H> — its collateral sold at a
                declining price, the proceeds repaying the debt
              </>
            ) : null}
            .
          </>
        ) : (
          <>
            It expires on {dateOf(chain.expiration)} (<H>{days}d</H>) — past that its minting window closes
            {chain.hub === "v2" ? <>, and its collateral becomes clearable by anyone through a forced sale</> : null}.
          </>
        )}
      </span>,
    );
  }

  if (chain.start != null && openedAt != null && openedAt > 0 && !chain.isClone && chain.start > openedAt) {
    const vetoDays = (chain.start - openedAt) / 86400;
    bullets.push(
      <span key="veto">
        As an original position it waited a {formatNumber(Math.round(vetoDays * 10) / 10)}-day veto window before it
        could mint — at least three days, chosen by the owner — the window in which FPS holders could have denied it.
      </span>,
    );
  }

  if (chain.isClone && chain.original) {
    bullets.push(
      <span key="clone">
        A <H>clone</H> of {chain.original.slice(0, 6)}…{chain.original.slice(-4)} — it reuses that original&rsquo;s
        already-vetted terms and mint limit, and skipped the veto window.
      </span>,
    );
  }

  if (challengeCount != null && challengeCount > 0 && !chain.isClosed) {
    bullets.push(
      <span key="survivor">
        The position has been challenged <H>{challengeCount}</H> time{challengeCount === 1 ? "" : "s"} and remains open
        — a challenge is an event in a position&rsquo;s life, not its end: averted outright, or survived past a partial
        sale.
      </span>,
    );
  }

  if (txCount != null && txCount > 0 && !chain.isClosed) {
    bullets.push(
      <span key="tx-count">
        The position has recorded <H>{txCount}</H> transaction{txCount === 1 ? "" : "s"} to date.
      </span>,
    );
  }

  if (lead == null && bullets.length === 0) return null;

  return <ProseExplainer paragraph={lead} items={bullets} />;
}
