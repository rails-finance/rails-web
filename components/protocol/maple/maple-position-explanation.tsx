"use client";

// Plain-language, data-driven explanation of a Maple lender position — the
// lender-side analog of the borrower position explanations, built from the
// listing summary (shares, escrow, principal) and the per-pool chain state
// (exit rate + the liquid/deployed split) that the card and the pool band
// already render. A Maple lender holds ERC-4626 pool shares: the claim is the
// shares priced at the pool's exit rate, the queue column is escrowed shares
// awaiting a FIFO fill, and there is no liquidation surface — the pool's own
// accounting carries the risk story. Amounts stay in the pool's own asset
// throughout: Rails never pins a stablecoin to $1, so no dollar framing here.
//
// Every figure is the same values shown (and <Prov>-traced) on the card and
// the pool band — this panel only narrates them, under the explanation-copy
// charter: what each number MEANS, never how it was read. Bold figures are the
// card-chrome twins (claim, shares, exit rate, interest, escrow, counts); the
// pool band's figures stay muted.

import type { MaplePositionView } from "@/components/protocol/maple/maple-position-card";
import type { MapleCardCaptions } from "@/lib/maple/economics";
import type { MaplePoolAmount } from "@/lib/sources/api/maple-positions";
import type { MaplePoolState } from "@/lib/sources/chain/maple-pool-state";
import { mapleExitAssets } from "@/lib/maple/exit-value";
import { shortAddress } from "@/lib/maple/asset-catalog";
import { formatCompact as bandCompact } from "@/lib/shared/format-event";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { useEnsName } from "@/lib/ens/use-ens-names";
import { operatorLead, type ExternalActorSummary } from "@/lib/shared/external-actor";
import { AmountText } from "@/components/shared/amount-text";
import { formatDate, formatDateRange } from "@/lib/date";
import type { MaplePoolHolding } from "@/lib/maple/row-times";

/** The figure the card's claim line asserts — the current redeemable value
 *  when the chain read landed, the recorded net deposits otherwise (the same
 *  fallback the card renders). */
const claimAmount = (p: MaplePoolAmount): number => p.currentValue ?? p.depositedPrincipal;

/** The yield a pool's holding shows: the rate's rise over the stretches the
 *  wallet held shares, the open one up to the exit rate at head, compounded
 *  to a year over the days held. Null under a week held, or with no rise. */
function yieldWindow(h: MaplePoolHolding | undefined, st: MaplePoolState) {
  if (!h || h.stretches.length === 0 || !(st.exitRate > 0)) return null;
  const now = Date.now() / 1000;
  const legs: { from: number; to: number; today: boolean }[] = [];
  let heldSec = 0;
  let growth = 1;
  for (const s of h.stretches) {
    const today = s.toAt == null;
    const to = today ? st.exitRate : s.toRate;
    if (to == null || !(s.fromRate > 0)) return null;
    legs.push({ from: s.fromRate, to, today });
    heldSec += (s.toAt ?? now) - s.fromAt;
    growth *= to / s.fromRate;
  }
  // A pool the wallet holds now ends in an open stretch.
  if (!legs[legs.length - 1].today) return null;
  const days = heldSec / 86400;
  if (days < 7 || growth <= 1) return null;
  const gaps = h.stretches.slice(1).map((s, i) => ({ from: h.stretches[i].toAt!, to: s.fromAt }));
  return {
    firstAt: h.stretches[0].fromAt,
    heldDays: Math.round(days),
    totalDays: Math.round((now - h.stretches[0].fromAt) / 86400),
    gaps,
    legs,
    rise: growth - 1,
    yearly: Math.pow(growth, 365 / days) - 1,
  };
}

export function MaplePositionExplanation({
  v,
  captions,
  externalActivity,
  holdings,
  cancelledRequests,
  receivedPools,
}: {
  v: MaplePositionView;
  /** The card's stat captions (earned interest) — the same computed value the
   *  claim footnote shows. Omit to skip that bullet. */
  captions?: MapleCardCaptions | null;
  /** Who executed the account's events, reduced over its whole history with the
   *  same verdict the event cards render. The page derives it from the events
   *  already on the page; omit to skip the operator bullet. */
  externalActivity?: ExternalActorSummary;
  /** Per pool, the stretches the wallet held shares and the rate at each
   *  end: the window a yield figure covers. Omit to state none. */
  holdings?: Map<string, MaplePoolHolding>;
  /** Requests the wallet cancelled, where the page holds its whole history. */
  cancelledRequests?: number;
  /** The assets of the pools the wallet received shares in by transfer. */
  receivedPools?: string[];
}) {
  // Hooks first — the pane declines below.
  const leadName = useEnsName(externalActivity?.actors[0]?.address ?? null);
  const secondName = useEnsName(externalActivity?.actors[1]?.address ?? null);

  // ── bullets both moods share ──────────────────────────────────────────────
  // The two counts the page shows are different quantities: the meta pill
  // counts distinct TRANSACTIONS, the timeline header counts EVENT rows, and
  // several events can settle in one transaction (a deposit and its share
  // transfer; a request and its fill). Where they differ, say so — two
  // unexplained numbers side by side read as a contradiction.
  const eventTotal = externalActivity?.total ?? 0;
  const countsBullet = (): React.ReactNode =>
    v.txCount > 0 ? (
      <span key="tx-count">
        {eventTotal > v.txCount ? (
          <>
            The account has recorded <H>{eventTotal}</H> events across <H>{v.txCount}</H> transactions to date — several
            events can settle in one transaction.
          </>
        ) : (
          <>
            The account has recorded <H>{v.txCount}</H> transaction{v.txCount === 1 ? "" : "s"} to date.
          </>
        )}
      </span>
    ) : null;

  // Who has been operating the account, across its whole history — the same
  // verdict each event card renders on its spine, reduced once so the pane can
  // state the PATTERN. The event clause explains one row; only this can tell a
  // reader the account is worked by an address other than its own (charter §5
  // item 7). Queue fills are excluded upstream: a fill is run by a registered
  // redeemer or the pool delegate, which is the queue working as designed.
  //
  // Count-first and plurality-safe (an "operated by <name>" template is false
  // wherever several addresses share the work), and an address is never spoken
  // in place of a name. The identity stays unbolded: it has no chrome twin on
  // the card, so bolding it would break reverse-completeness (charter §3).
  const ext = externalActivity;
  const operatorBullet = (): React.ReactNode => {
    if (!ext || ext.external === 0) return null;
    const others = ext.external - (ext.actors[0]?.count ?? 0);
    return (
      <span key="operators">
        {operatorLead(ext, null, "recorded on this account")}
        {ext.external.toLocaleString("en-US")} {ext.external === 1 ? "was" : "were"} executed by an address other than
        this one: shares another wallet transferred in, or a deposit made on the account&rsquo;s behalf. Neither needs
        the account to act. Nothing can leave the position that way unless the account first granted a share allowance:
        a permission, signed by the account, that lets another address move up to a set number of its shares.
        {ext.actors.length === 1
          ? leadName
            ? ` All of it ran through ${leadName}.`
            : ` All of it ran through one address, ${shortAddress(ext.actors[0].address)}.`
          : leadName
            ? ` Most of it — ${ext.actors[0].count.toLocaleString("en-US")} events — ran through ${leadName}, with the remaining ${others.toLocaleString("en-US")} spread across ${ext.actors.length - 1} other address${ext.actors.length === 2 ? "" : "es"}${secondName ? `, one of them ${secondName}` : ""}.`
            : ` The work is spread across ${ext.actors.length} addresses, the most active of them accounting for ${ext.actors[0].count.toLocaleString("en-US")}.`}
      </span>
    );
  };

  // ── the closed mood: the position's height, how it wound down, who ran it ──
  // The reference narrates ended positions; a closed page with no pane is a
  // dead end for the newcomer (rubric A4). Peak figures echo the card's own
  // face (share peak bold, deposited-principal peak bold when recorded); the
  // request count stays unbolded — the closed card carries no requests
  // footnote, so a bold here would have no chrome twin (charter §3).
  if (v.status !== "open") {
    const peaks = v.peakPools.filter((p) => p.peakShares > 0);
    const closedBullets: React.ReactNode[] = [];
    for (const p of peaks) {
      closedBullets.push(
        <span key={`peak-${p.pool}`}>
          {peaks.length > 1 ? <>In the {p.assetSymbol} pool its holdings</> : <>Its holdings</>} peaked at{" "}
          <H>
            <AmountText value={p.peakShares} format="number" /> {p.symbol}
          </H>
          , the highest balance its own history records
          {p.peakDeposited > 0 ? (
            <>
              , with{" "}
              <H>
                <AmountText value={p.peakDeposited} format="number" /> {p.assetSymbol}
              </H>{" "}
              of deposited principal recorded at its height.
            </>
          ) : (
            <>. Every share arrived by transfer — the wallet has no pool deposit of its own on record.</>
          )}
        </span>,
      );
    }
    if (v.requestCount > 0) {
      closedBullets.push(
        <span key="requests">
          The wallet made {v.requestCount} withdrawal request{v.requestCount === 1 ? "" : "s"} through the pool&rsquo;s
          first-in-first-out queue over its lifetime.
        </span>,
      );
    }
    closedBullets.push(countsBullet(), operatorBullet());
    const closedLead = (
      <>
        This position is closed — the wallet holds no pool shares and nothing waits in the withdrawal queue
        {peaks.length > 0 ? <>. Its history below is the full record of how it grew and wound down:</> : <>:</>}
      </>
    );
    return <ProseExplainer paragraph={closedLead} items={closedBullets.filter(Boolean)} />;
  }

  const live = v.pools.filter((p) => p.shares + p.escrowedShares > 0);
  if (live.length === 0) return null;

  const multi = live.length > 1;
  const one = live[0];
  const fullyQueued = live.every((p) => p.shares <= 0 && p.escrowedShares > 0);
  const bullets: React.ReactNode[] = [];

  // ── the status lead (charter §4): subject-first, ≤2 figures, colon ────────
  const lead: React.ReactNode = multi ? (
    <>This position lends across {live.length} Maple pools, each claim priced at its own pool&rsquo;s exit rate:</>
  ) : fullyQueued ? (
    <>
      This position is winding down its {one.assetSymbol} lending — every share sits in the pool&rsquo;s withdrawal
      queue:
    </>
  ) : one.currentValue != null ? (
    <>
      This position holds{" "}
      <H>
        <AmountText value={one.shares} format="number" /> {one.symbol}
      </H>
      , shares in Maple&rsquo;s {one.assetSymbol} lending pool, with a claim on{" "}
      <H>
        <AmountText value={one.currentValue} format="number" /> {one.assetSymbol}
      </H>
      :
    </>
  ) : (
    <>
      This position holds{" "}
      <H>
        <AmountText value={one.shares} format="number" /> {one.symbol}
      </H>
      , shares in Maple&rsquo;s {one.assetSymbol} lending pool, with{" "}
      <H>
        <AmountText value={one.depositedPrincipal} format="number" /> {one.assetSymbol}
      </H>{" "}
      of net deposits recorded:
    </>
  );

  // ── per-pool facts: the claim (multi-pool), the exit rate, the escrow ─────
  for (const p of live) {
    const st: MaplePoolState | undefined = v.poolState?.[p.pool];

    if (multi) {
      bullets.push(
        <span key={`claim-${p.pool}`}>
          In the {p.assetSymbol} pool it holds{" "}
          <H>
            <AmountText value={p.shares} format="number" /> {p.symbol}
          </H>{" "}
          with a claim on{" "}
          <H>
            <AmountText value={claimAmount(p)} format="number" /> {p.assetSymbol}
          </H>
          .
        </span>,
      );
    }

    if (st != null && p.currentValue != null) {
      bullets.push(
        <span key={`rate-${p.pool}`}>
          The claim is the shares priced at the pool&rsquo;s exit rate, <H>{st.exitRate.toFixed(4)}</H> {p.assetSymbol}{" "}
          per share. That rate rises as the pool&rsquo;s borrowers pay interest, so the claim grows without new
          deposits.
        </span>,
      );
    }

    // A yield figure only over a window the page can name: the stretches
    // this wallet held shares in the pool, up to today's exit rate.
    const y = st != null ? yieldWindow(holdings?.get(p.pool), st) : null;
    if (y) {
      const pairs = y.legs.map((l) => `${l.from.toFixed(4)} to ${l.to.toFixed(4)}${l.today ? " today" : ""}`);
      bullets.push(
        <span key={`yield-${p.pool}`}>
          {y.gaps.length === 0 ? (
            <>
              The wallet has held shares in {multi ? `the ${p.assetSymbol} pool` : "the pool"} since{" "}
              {formatDate(y.firstAt)} ({y.heldDays} days), and over that time the pool&rsquo;s rate rose from {pairs[0]}{" "}
              {p.assetSymbol} per share
            </>
          ) : (
            <>
              The wallet held shares in {multi ? `the ${p.assetSymbol} pool` : "the pool"} for {y.heldDays} of the{" "}
              {y.totalDays} days since {formatDate(y.firstAt)}; it was out of the pool{" "}
              {y.gaps.map((g) => formatDateRange(g.from, g.to)).join(" and ")}. While it held them the pool&rsquo;s rate
              rose from {pairs.join(", then from ")} {p.assetSymbol} per share
            </>
          )}
          : {(y.rise * 100).toFixed(2)}%, or about {(y.yearly * 100).toFixed(1)}% a year if that pace compounded for a
          full year. Past rates do not set future ones.
        </span>,
      );
    }

    if (p.escrowedShares > 0) {
      const escrowValue = st != null ? mapleExitAssets(p.escrowedSharesRaw, st) : null;
      bullets.push(
        <span key={`escrow-${p.pool}`}>
          {escrowValue != null ? (
            <>
              <H>
                <AmountText value={escrowValue} format="number" /> {p.assetSymbol}
              </H>{" "}
              of the claim sits escrowed in the withdrawal queue.
            </>
          ) : (
            <>
              <H>
                <AmountText value={p.escrowedShares} format="number" /> {p.symbol}
              </H>{" "}
              of the shares sit escrowed in the withdrawal queue.
            </>
          )}{" "}
          The escrowed amount pays out at whatever the exit rate is when its turn is filled.
        </span>,
      );
    }
  }

  // ── captioned interest (the "incl. X interest earned" figure) ─────────────
  {
    const it = captions?.interestEarned;
    if (it && it.amount >= 0.01) {
      bullets.push(
        <span key="interest">
          <H>
            <AmountText value={it.amount} format="number" /> {it.symbol}
          </H>{" "}
          of that claim is interest earned to date, already included in the figure above.
          {receivedPools && receivedPools.includes(it.symbol) && (
            <>
              {" "}
              For shares the wallet received from another wallet, the interest counts from what each batch was worth
              when it arrived.
            </>
          )}
        </span>,
      );
    }
    for (const e of captions?.earnedElsewhere ?? []) {
      bullets.push(
        <span key={`earned-${e.symbol}`}>
          It also earned{" "}
          <H>
            <AmountText value={e.amount} format="number" /> {e.symbol}
          </H>{" "}
          in the {e.symbol} pool, which it has left: withdrawals took all of that out.
        </span>,
      );
    }
    if (captions?.interestWithdrawn) {
      bullets.push(
        <span key="interest-withdrawn">
          The claim holds none of the interest the position earned: withdrawals have taken all of it out. Lifetime flows
          states the total.
        </span>,
      );
    }
  }

  // ── pool-wide context: the queue, the liquid/deployed split, impairment ───
  for (const p of live) {
    const st: MaplePoolState | undefined = v.poolState?.[p.pool];
    if (st == null) continue;
    const poolLabel = multi ? `the ${p.assetSymbol} pool` : "the pool";

    const queueValue = mapleExitAssets(st.raw.queueShares, st);
    if (st.queueShares > 0) {
      bullets.push(
        <span key={`queue-${p.pool}`}>
          Withdrawals leave {poolLabel} through a first-in-first-out queue: {bandCompact(queueValue).display}{" "}
          {p.assetSymbol} is waiting pool-wide,{" "}
          {st.cash >= queueValue
            ? "coverable from the liquid cash on hand"
            : "more than the liquid cash on hand can fill at once"}
          .
        </span>,
      );
    } else {
      bullets.push(
        <span key={`queue-${p.pool}`}>
          Nothing is waiting in {poolLabel}&rsquo;s withdrawal queue — a new request would stand first in line, filled
          from the pool&rsquo;s liquid cash.
        </span>,
      );
    }

    // cash + Σ strategy AUM equals the pool's whole value (proven exact by the
    // chain-state verifier), so the split's denominator is their sum.
    const poolValue = st.cash + st.loansAum + st.strategiesAum;
    if (poolValue > 0) {
      const pctLiquid = ((st.cash / poolValue) * 100).toFixed(1);
      const pctLoans = ((st.loansAum / poolValue) * 100).toFixed(1);
      bullets.push(
        <span key={`split-${p.pool}`}>
          Of {poolLabel}&rsquo;s value, {bandCompact(st.cash).display} {p.assetSymbol} ({pctLiquid}%) is liquid in the
          contract right now — the only part withdrawals can draw on. The other {pctLoans}% is deployed to loans whose
          collateral is held with custodians off-chain.
        </span>,
      );
    }

    if (st.unrealizedLosses > 0) {
      bullets.push(
        <span key={`impair-${p.pool}`}>
          An impairment is live on {poolLabel}: {bandCompact(st.unrealizedLosses).display} {p.assetSymbol} is marked as
          a loss, and exits while it stands bear their share of it.
        </span>,
      );
    }
  }

  // ── lifetime counts (the card's own footnote + meta badge) ────────────────
  if (v.requestCount > 0) {
    bullets.push(
      <span key="requests">
        The wallet has made <H>{v.requestCount}</H> withdrawal request{v.requestCount === 1 ? "" : "s"} over its
        lifetime
        {cancelledRequests != null && cancelledRequests > 0 && cancelledRequests <= v.requestCount
          ? cancelledRequests === v.requestCount
            ? v.requestCount === 1
              ? " and cancelled it, so the shares came back to the wallet"
              : " and cancelled all of them, so the shares came back to the wallet"
            : `; it cancelled ${cancelledRequests}, and those shares came back to the wallet`
          : ""}
        .
      </span>,
    );
  }
  bullets.push(countsBullet(), operatorBullet());

  return <ProseExplainer paragraph={lead} items={bullets.filter(Boolean)} />;
}
