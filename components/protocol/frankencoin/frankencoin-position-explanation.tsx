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
import type { BaseActivityEvent, FrankencoinContext } from "@/lib/shared/types/event-shape";
import { ppmToPct, shortAddress } from "@/lib/frankencoin/asset-catalog";
import { frankencoinZchfSplit, useFrankencoinEventRead } from "@/lib/frankencoin/use-event-read";
import { termText } from "@/lib/frankencoin/figures";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { dateTimeText, phaseText, spanText } from "@/lib/frankencoin/figures";
import Link from "next/link";
import type { FrankencoinEnding } from "./frankencoin-position-card";
import { formatDate } from "@/lib/date";
import { AmountText } from "@/components/shared/amount-text";

const dateOf = (unix: number): string => formatDate(unix);
/** "23 h 39 min", "152 days". */
const spanOf = (seconds: number): string =>
  seconds >= 2 * 86400 ? `${Math.floor(seconds / 86400)} days` : spanText(seconds);

/** How the timeline's events divide over the transactions: the total, and
 *  the transaction that recorded the most, described by what it recorded. */
export interface FrankencoinEventTally {
  total: number;
  biggest: { count: number; opening: boolean; parts: string[] } | null;
}

const listOf = (parts: string[]): string =>
  parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

export function FrankencoinPositionExplanation({
  chain,
  openedAt,
  challengeCount,
  denied,
  txCount,
  eventTally,
  cloneParent,
  lastMint,
  ending,
  closedAt,
}: {
  chain: FrankencoinChainResponse;
  /** How a terminal position ended (the forced sale, the denial). */
  ending?: FrankencoinEnding | null;
  /** The position's last activity: when a closed position closed. */
  closedAt?: number | null;
  /** The position a clone was cloned from (the timeline's PositionOpened
   *  parent); `chain.original` is the family's original. */
  cloneParent?: string | null;
  /** The position's latest mint, whose receipt read gives the rate it paid. */
  lastMint?: (BaseActivityEvent & { context: { protocol: "frankencoin"; data: FrankencoinContext } }) | null;
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
  /** How the timeline's events divide over the transactions, to say what the
   *  counter counts. Null on a windowed page. */
  eventTally?: FrankencoinEventTally | null;
}) {
  const sym = chain.collateralSymbol ?? "collateral";
  const now = Date.now() / 1000;
  const lastMintCtx = lastMint?.context.data;
  const { read: lastMintRead } = useFrankencoinEventRead(
    lastMintCtx ?? ({ eventType: "open", position: chain.position, hub: chain.hub } as FrankencoinContext),
    lastMint?.txHash,
    lastMint?.id,
  );
  const lastSplit =
    lastMintCtx && lastMintRead
      ? frankencoinZchfSplit(lastMintRead, Number(lastMintCtx.minted ?? 0) - Number(lastMintCtx.mintedBefore ?? 0))
      : null;
  const lastGross = lastMintCtx ? Number(lastMintCtx.minted ?? 0) - Number(lastMintCtx.mintedBefore ?? 0) : 0;
  // What a mint made now gives up as interest: the annual rate for the years
  // left to expiry (PositionV2.calculateFee).
  const feeFrom = chain.start != null ? Math.max(now, chain.start) : now;
  const todayFeePct =
    chain.annualInterestPPM != null && chain.expiration != null && chain.expiration > feeFrom && !chain.isClosed
      ? Math.min(100, (chain.annualInterestPPM / 10_000) * ((chain.expiration - feeFrom) / (365 * 86400)))
      : null;
  const lastMintRate =
    lastMint && lastSplit?.ratePct != null ? (
      <>
        {" "}
        Its last mint, on {dateOf(lastMint.timestamp)}, paid <H>{lastSplit.ratePct.toFixed(2)}%</H> a year
        {lastSplit.termDays != null ? <> for the {termText(lastSplit.termDays)} left to expiry</> : null}
        {lastSplit.interest != null && lastGross > 0 ? (
          <>, {((lastSplit.interest / lastGross) * 100).toFixed(2)}% of the amount</>
        ) : null}
        .
      </>
    ) : null;

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
        <AmountText value={chain.collateral!} /> {sym}
      </H>{" "}
      of collateral and owes{" "}
      <H>
        <AmountText value={chain.minted!} /> ZCHF
      </H>
      :
    </>
  ) : hasColl ? (
    <>
      This position holds{" "}
      <H>
        <AmountText value={chain.collateral!} /> {sym}
      </H>{" "}
      of collateral and has no debt:
    </>
  ) : hasMint ? (
    <>
      This position owes{" "}
      <H>
        <AmountText value={chain.minted!} /> ZCHF
      </H>
      :
    </>
  ) : null;

  const bullets: React.ReactNode[] = [];

  if (chain.collateralName && chain.collateralSymbol) {
    bullets.push(
      <span key="token">
        {sym} is the token whose contract names it &ldquo;{chain.collateralName}&rdquo;.
      </span>,
    );
  }

  if (chain.liqPrice != null && chain.liqPrice > 0) {
    bullets.push(
      <span key="price">
        The liquidation price is{" "}
        <H>
          <AmountText value={chain.liqPrice} /> ZCHF
        </H>{" "}
        per {sym}, <H>declared by the owner</H>. Frankencoin has no price feed; a declared price stands until someone
        challenges it.
        {chain.mintCeiling != null && chain.mintCeiling > 0 ? (
          <>
            {" "}
            At this price the collateral backs up to <AmountText value={chain.mintCeiling} /> ZCHF of debt
            {hasMint && Math.abs(chain.mintCeiling - (chain.minted as number)) < 0.005 ? (
              <>
                , the debt it carries, so the headroom is zero: a further mint needs more collateral or a higher price
              </>
            ) : hasMint && chain.mintCeiling > (chain.minted as number) && !chain.isClosed ? (
              <>
                , a headroom of <AmountText value={chain.mintCeiling - (chain.minted as number)} /> ZCHF over its debt
              </>
            ) : null}
            .
          </>
        ) : null}
      </span>,
    );
  }

  if (hasMint && chain.reserveHeld != null && chain.reserveContributionPPM != null) {
    bullets.push(
      <span key="reserve">
        The debt is gross: <AmountText value={chain.reserveHeld} /> ZCHF of it (
        {ppmToPct(chain.reserveContributionPPM).toFixed(0)}%) is this position&rsquo;s reserve share, held in the system
        reserve. Repaying releases it: in full while the reserve covers every position&rsquo;s share, in proportion when
        losses have drawn it down. While it covers them, clearing the whole debt takes{" "}
        <H>
          <AmountText value={(chain.minted as number) - chain.reserveHeld} /> ZCHF
        </H>
        . The reserve shares of all positions make up the borrowers&rsquo; reserve, which with the FPS holders&rsquo;
        equity forms the system reserve (both on the{" "}
        <Link href="/ethereum/frankencoin/system" className="text-blue-500 hover:underline">
          system page
        </Link>
        ).
      </span>,
    );
  }

  if (chain.annualInterestPPM != null && !chain.isClosed) {
    // Today's terms: what a mint made now would pay. Each earlier mint paid
    // the rate in force at its block (the base rate moves with governance).
    bullets.push(
      <span key="interest">
        On today&rsquo;s terms a mint pays <H>{ppmToPct(chain.annualInterestPPM).toFixed(2)}%</H> a year
        {chain.hub === "v2" && chain.riskPremiumPPM != null ? (
          <>
            {" "}
            (the system base rate, set by governance, plus this position&rsquo;s{" "}
            {ppmToPct(chain.riskPremiumPPM).toFixed(2)}% risk premium)
          </>
        ) : null}
        , charged <H>at the mint</H> for the time left to expiry and taken from the minted amount: the rate times the
        years left
        {todayFeePct != null ? (
          <>
            , so a mint today gives up <H>{todayFeePct.toFixed(2)}%</H> of the amount
          </>
        ) : null}
        . Nothing accrues after that, so the debt changes only when the owner mints or repays.
        {lastMintRate}
      </span>,
    );
  } else if (chain.isClosed && lastMintRate) {
    bullets.push(
      <span key="interest">
        Interest was charged at each mint for the time left to expiry, at the rate in force then.
        {lastMintRate}
      </span>,
    );
  }

  if (chain.challengedAmount != null && chain.challengedAmount > 0) {
    bullets.push(
      <span key="challenged">
        <AmountText value={chain.challengedAmount} /> {sym} of the collateral is <H>under challenge right now</H> — an
        auction is testing the declared price. Phase 1 offers the challenger&rsquo;s own posted collateral at that
        price; only if nobody buys does the position&rsquo;s collateral go to the declining phase-2 auction.
      </span>,
    );
  }

  if (chain.cooldownActive && chain.cooldownUntil != null) {
    bullets.push(
      <span key="cooldown">
        Minting and collateral withdrawals are <H>paused</H> until {dateOf(chain.cooldownUntil)} — the cooldown that
        follows a declared-price raise, the window in which the new price can be challenged before it backs fresh ZCHF.
      </span>,
    );
  }

  const forcedAt = ending?.forcedAt ?? null;
  if (denied) {
    bullets.push(
      <span key="denied">
        The position was <H>denied</H> during its veto window
        {ending?.deniedAt != null ? <>, on {dateOf(ending.deniedAt)}</> : null}: a holder of more than 1% of the
        governance votes vetoed it. Minting is closed to it permanently.
        {forcedAt == null && !chain.isClosed ? <> The collateral stays withdrawable by the owner.</> : null}
      </span>,
    );
  } else if (chain.mintingDisabledForGood && !chain.isClosed) {
    bullets.push(
      <span key="disabled">
        Minting is <H>disabled for good</H>.
      </span>,
    );
  }

  if (chain.expiration != null && chain.expiration > 0) {
    const days = Math.round((chain.expiration - now) / 86400);
    bullets.push(
      <span key="expiry">
        {chain.isClosed && forcedAt != null && forcedAt > chain.expiration ? (
          <>
            It expired on {dateTimeText(chain.expiration)}. From then anyone could buy its collateral through the hub,
            and a <H>forced sale</H> did, {spanOf(forcedAt - chain.expiration)} later, closing it.
          </>
        ) : chain.isClosed && closedAt != null && closedAt > chain.expiration ? (
          <>
            Its terms ran to {dateOf(chain.expiration)}; it closed on {dateOf(closedAt)}, after that date.
          </>
        ) : chain.isClosed ? (
          <>
            Its terms ran to {dateOf(chain.expiration)}
            {chain.expiration < now ? <>, a date now past</> : null}
            {closedAt != null ? <>; it closed before then, on {dateOf(closedAt)}</> : null}.
          </>
        ) : chain.expired ? (
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

  if (!denied && chain.start != null && openedAt != null && openedAt > 0 && !chain.isClone && chain.start > openedAt) {
    const vetoDays = (chain.start - openedAt) / 86400;
    bullets.push(
      <span key="veto">
        As an original position it waited a <AmountText value={Math.round(vetoDays * 10) / 10} />
        -day veto window before it could mint (at least three days, chosen by the owner), in which holders of more than
        1% of the governance votes could have denied it.
      </span>,
    );
  }

  if (chain.isClone && chain.original) {
    const parent = cloneParent && cloneParent !== chain.original ? cloneParent : null;
    bullets.push(
      <span key="clone">
        {parent ? (
          <>
            A <H>clone</H>: cloned from {shortAddress(parent)}, a clone of the family&rsquo;s original{" "}
            {shortAddress(chain.original)}. It is a position of its own that started at {shortAddress(parent)}&rsquo;s
            declared price, runs on the original&rsquo;s other terms and shares the family&rsquo;s minting limit.
          </>
        ) : (
          <>
            A <H>clone</H> of {shortAddress(chain.original)}: a position of its own on that original&rsquo;s terms,
            sharing its minting limit.
          </>
        )}{" "}
        It skipped the veto window an original waits out.
      </span>,
    );
  }

  // The cooldown that is not running: when the last one ended, if it ended
  // in this position's life (a clone inherits no earlier clock worth naming).
  const cooldownEnded = chain.cooldownRaw != null && /^\d+$/.test(chain.cooldownRaw) ? Number(chain.cooldownRaw) : null;
  if (
    !chain.isClosed &&
    !chain.cooldownActive &&
    !chain.mintingDisabledForGood &&
    cooldownEnded != null &&
    cooldownEnded < now &&
    openedAt != null &&
    cooldownEnded > openedAt
  ) {
    bullets.push(
      <span key="cooldown-ended">No minting cooldown is running; the last ended on {dateOf(cooldownEnded)}.</span>,
    );
  }

  if (challengeCount === 0 && !denied) {
    bullets.push(
      <span key="never-challenged">
        {chain.isClosed ? (
          <>
            It was <H>never challenged</H>.
          </>
        ) : (
          <>
            It has <H>never been challenged</H>.
            {chain.challengePeriod != null && chain.challengePeriod > 0 ? (
              <>
                {" "}
                A challenge here would run in two phases of {phaseText(chain.challengePeriod)} each, its challenge
                period.
              </>
            ) : null}
          </>
        )}
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

  if (chain.isClosed && ending?.closedByChallenge) {
    const minimum =
      chain.minimumCollateralRaw != null && chain.collateralDecimals != null
        ? Number(chain.minimumCollateralRaw) / 10 ** chain.collateralDecimals
        : null;
    bullets.push(
      <span key="closed-by-sale">
        A challenge sale
        {closedAt != null ? <> on {dateOf(closedAt)}</> : null} took
        {ending.soldMost != null ? (
          <>
            {" "}
            <AmountText value={ending.soldMost} /> {sym}
          </>
        ) : (
          " its collateral"
        )}{" "}
        and left less than the position&rsquo;s minimum
        {minimum != null ? (
          <>
            {" "}
            of <AmountText value={minimum} /> {sym}
          </>
        ) : null}
        , which <H>closed it</H>.
      </span>,
    );
  }

  if (txCount != null && txCount > 0) {
    bullets.push(
      <span key="tx-count">
        The position {chain.isClosed ? "recorded" : "has recorded"} <H>{txCount}</H> transaction
        {txCount === 1 ? "" : "s"}
        {chain.isClosed ? "" : " to date"}
        {eventTally && eventTally.total !== txCount ? (
          <>
            ; the timeline lists {eventTally.total} events because one transaction can record several
            {eventTally.biggest && eventTally.biggest.count > 1 ? (
              <>
                {" "}
                ({eventTally.biggest.opening ? "its creation" : "one"} recorded {eventTally.biggest.count}
                {eventTally.biggest.parts.length > 0 ? <>: {listOf(eventTally.biggest.parts)}</> : null})
              </>
            ) : null}
          </>
        ) : null}
        .
      </span>,
    );
  }

  if (lead == null && bullets.length === 0) return null;

  return <ProseExplainer paragraph={lead} items={bullets} />;
}
