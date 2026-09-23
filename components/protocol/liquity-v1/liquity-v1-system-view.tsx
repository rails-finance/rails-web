"use client";

// The Liquity V1 PROTOCOL view (/liquity-v1/system) — the family sibling of
// /ebisu/branches, /asymmetry/branches and Liquity V2's branch-rates surface,
// adapted to what V1 actually is rather than forced into the V2 shape.
//
// The forks' view compares BRANCHES and orders each queue by the rate its
// borrowers chose. V1 has neither axis: one ETH market, and no user-set rate
// anywhere in the protocol. So the two sections here are the ones V1 does have:
//
//   1. The system band — the one market's state: the protocol's own price, the
//      total collateral ratio against the 150% recovery line, the Stability
//      Pool's depth against system debt (the liquidation backstop), and the
//      shared base rate with the two fees that decay from it. That base rate is
//      V1's whole "rates axis": protocol-wide, moved by redemption volume, not
//      chosen by anyone.
//   2. Redemption — what a redemption does, the order it does it in, and how
//      deep that queue currently is. A borrower cannot buy a later place here
//      the way a V2 borrower can by raising their rate; their place is an
//      outcome of the ETH price and their own collateral. The view says so
//      rather than implying a choice that doesn't exist.
//
// THE QUEUE IS NOT LISTED HERE, and that is the point. Until 2026-08-30 this
// file drew up to 75 Trove rows in redemption order. The listing now produces
// exactly that view — open status, sorted by ratio ascending — and produces it
// better: every Trove rather than a preview, paged, filterable, searchable, and
// each row the card grammar the rest of the site speaks. So this section links
// INTO the listing with those selections set, and keeps only what is true of
// the QUEUE AS A WHOLE.
//
// The link is EXACT here in a way the forks' equivalent is not. Ebisu and
// Asymmetry have to exclude zombies from theirs and say so in prose, because a
// trove can leave the sorted list while the index still calls it open. V1 has
// no zombie state: a Trove is in the list or it is closed. Verified 2026-08-30
// against the chain — the index's open set and SortedTroves agree on all 75
// members, and coll ÷ debt reproduces the protocol's own order 75 of 75.
//
// What the link cannot say, kept here or moved rather than dropped: the queue's
// depth, its front ratio and how many Troves sit below the 110% minimum are
// aggregates, stated in the card below; a single Trove's own ratio and the debt
// redeemed before it need the price this listing tier does not read, and both
// already live on that Trove's page (its CR card and RedemptionRunway).
//
// Framing follows the V4 hub view and the fork branches view: present, don't
// rank. No score, no risk valence — the only chroma is the app's interaction
// blue (navigation) and the one factual red the shared RatioBar reserves for a
// liquidation line, which is a fact about the contract's own 110% comparison,
// not a judgement about a borrower.

import Link from "next/link";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { ProvenanceInfoTabs } from "@/components/shared/provenance-info-tabs";
import { RatioBar, type RatioBarTick } from "@/components/shared/ratio-bar";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { liquityV1RedemptionContent } from "@/lib/shared/learn-more-content";
import {
  systemLaneProv,
  systemPriceProv,
  systemTcrProv,
  baseRateProv,
  systemFeeRateProv,
  stabilityPoolProv,
  spCoverageProv,
  queueOrderProv,
  queueIcrProv,
  queueDebtTotalProv,
  queueBelowMinimumProv,
} from "@/lib/liquity-v1/position-provenance";
import { Stat } from "@/components/shared/stat";
import { DEBT_SYMBOL, COLLATERAL_SYMBOL } from "@/lib/liquity-v1/asset-catalog";
import { formatCompact, formatExact, formatUsdValue, formatTinyNonZero } from "@/lib/utils/format";
import type { LiquityV1SystemChainResponse } from "@/lib/api/fetch-liquity-v1-system";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

const LINK = "text-blue-500 hover:underline";

const ratio = (x: number) => `${(x * 100).toFixed(1)}%`;

// A rate, with the codebase's false-zero guard applied (a non-zero magnitude
// must never render as "0"). The base rate decays toward
// zero between redemptions and routinely sits in the 1e-6 range — two decimal
// places would state it as 0.00%, i.e. "no redemption pressure at all", which
// is a different claim than the chain's. Below display precision it falls back
// to the shared faithful rendering.
const feePct = (x: number) => {
  const p = x * 100;
  const s = p.toFixed(2);
  if (p !== 0 && parseFloat(s) === 0) return `${formatTinyNonZero(p)}%`;
  return `${s}%`;
};

/** The listing URL that IS the redemption queue: every open Trove, lowest
 *  collateral ratio first.
 *
 *  ⚠️ THIS LINK FAILS SILENT IF IT DRIFTS. The listing ignores a `sortBy` it
 *  does not recognise and serves its DEFAULT view (recency), so a renamed sort
 *  value leaves a page that looks entirely correct and shows the wrong Troves
 *  under a heading promising the queue. `sortBy=ratio` is the backend allow-list
 *  key in api/src/routes/liquityV1.ts and `status=open` is the wire value of the
 *  listing's Status facet; scripts/verify/verify-v1-queue-link.mjs is the only
 *  thing that can catch either of them moving. */
const QUEUE_HREF = "/ethereum/liquity-v1?status=open&sortBy=ratio&sortOrder=asc";

/** The one market's state — size, the recovery line, and the price it's all
 *  measured at. */
function SystemCard({ data }: { data: LiquityV1SystemChainResponse }) {
  // The TCR bar's axis is the critical ratio: how the system stands against
  // the line where recovery mode turns on. Fill is TCR ÷ CCR, capped — above
  // the line the bar is simply full. The CCR tick is neutral, not red:
  // recovery mode restricts borrowing and raises the liquidation line, but
  // crossing it is not itself a liquidation.
  const ccrFill = data.tcr != null ? Math.min(1, data.tcr / data.ccr) : null;
  const ticks: RatioBarTick[] =
    data.tcr != null ? [{ f: 1, kind: "neutral", title: `CCR ${ratio(data.ccr)} — recovery mode line` }] : [];

  return (
    <div className="rounded-xl bg-raised px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">The system</span>
        <span className="text-[11px] tabular-nums text-rb-500">
          {COLLATERAL_SYMBOL}{" "}
          <Prov info={systemPriceProv(data.priceStale)} value={formatExact(data.price)}>
            {formatUsdValue(data.price)}
          </Prov>
          {data.priceStale && <span className="ml-1 text-rb-400">· last good</span>}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        {/* The unit rides in the children throughout this view, so no `symbol`
            prop — the receipts row renders display + symbol and would double
            it. `value` still carries the exact figure behind the compact one. */}
        <Stat label="System debt">
          <Prov
            info={systemLaneProv("The entire system's LUSD debt", "getEntireSystemDebt()")}
            value={formatExact(data.systemDebt)}
          >
            {formatCompact(data.systemDebt)} {DEBT_SYMBOL}
          </Prov>
        </Stat>
        <Stat label="System collateral">
          <Prov
            info={systemLaneProv("The entire system's ETH collateral", "getEntireSystemColl()")}
            value={formatExact(data.systemColl)}
          >
            {formatCompact(data.systemColl)} {COLLATERAL_SYMBOL}
          </Prov>
          <span className="ml-1 text-rb-500">· {formatUsdValue(data.systemCollUsd)}</span>
        </Stat>
        <Stat label="Open troves">
          <Prov info={systemLaneProv("Open troves", "getTroveOwnersCount()")}>{data.trovesCount}</Prov>
        </Stat>
        <Stat label="Recovery mode">
          <Prov
            info={systemLaneProv(
              "Recovery mode",
              "checkRecoveryMode(price)",
              "The contract's own verdict at its own price — on below a 150% total collateral ratio, when the liquidation line rises from 110% to the TCR itself and borrowing is restricted",
            )}
          >
            {data.recoveryMode ? "On" : "Off"}
          </Prov>
        </Stat>
      </div>

      {data.tcr != null && ccrFill != null && (
        <>
          <RatioBar fill={ccrFill} ticks={ticks} />
          <div className="mt-2 flex items-baseline justify-between text-[11px] tabular-nums text-rb-500">
            <span>
              TCR{" "}
              <Prov info={systemTcrProv()} value={formatExact(data.tcr)}>
                {ratio(data.tcr)}
              </Prov>
            </span>
            <span>CCR {ratio(data.ccr)} — recovery mode</span>
          </div>
        </>
      )}

      <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
        One ETH market, one LUSD debt — there are no branches to compare and no per-market settings: every Trove here
        answers to the same {ratio(data.mcr)} minimum, the same price, and the same {ratio(data.ccr)} recovery line.
      </p>
    </div>
  );
}

/** The liquidation backstop — how deep the pool is against the book. */
function StabilityPoolCard({ data }: { data: LiquityV1SystemChainResponse }) {
  const coverage = data.spCoverage;
  return (
    <div className="rounded-xl bg-raised px-4 py-3.5">
      <div className="text-xs font-semibold text-foreground">Stability Pool</div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        <Stat label="LUSD in the pool">
          <Prov info={stabilityPoolProv()} value={formatExact(data.spDeposits)}>
            {formatCompact(data.spDeposits)} {DEBT_SYMBOL}
          </Prov>
        </Stat>
        <Stat label="Against system debt">
          {coverage != null ? (
            <Prov info={spCoverageProv()} value={formatExact(coverage)}>
              {ratio(coverage)}
            </Prov>
          ) : (
            "—"
          )}
        </Stat>
      </div>

      {coverage != null && (
        <>
          <RatioBar fill={Math.min(1, coverage)} ticks={[]} />
          <div className="mt-2 flex items-baseline justify-between text-[11px] tabular-nums text-rb-500">
            <span>absorbed by the pool</span>
            <span>{ratio(Math.min(1, coverage))} of system debt</span>
          </div>
        </>
      )}

      <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
        A liquidated Trove&rsquo;s debt is cancelled against these deposits and its ETH handed to the depositors, at a
        discount. What the pool can&rsquo;t absorb is redistributed to the remaining Troves instead — collateral and
        debt both — so the pool&rsquo;s depth is what stands between a liquidation and everyone else&rsquo;s balance
        sheet. The bar is the whole book against the pool, not a forecast: liquidations arrive one Trove at a time, and
        only the ones below {ratio(data.mcr)} arrive at all.
      </p>
    </div>
  );
}

/** V1's whole "rates axis": one shared base rate, two fees decaying from it. */
function RatesCard({ data }: { data: LiquityV1SystemChainResponse }) {
  return (
    <div className="rounded-xl bg-raised px-4 py-3.5">
      <div className="text-xs font-semibold text-foreground">Rates &amp; fees</div>

      <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-2">
        <Stat label="Base rate">
          <Prov info={baseRateProv()} value={formatExact(data.baseRate)}>
            {feePct(data.baseRate)}
          </Prov>
        </Stat>
        <Stat label="Redemption fee">
          <Prov
            info={systemFeeRateProv("Current redemption fee rate", "getRedemptionRateWithDecay()")}
            value={formatExact(data.redemptionRate)}
          >
            {feePct(data.redemptionRate)}
          </Prov>
        </Stat>
        <Stat label="Borrowing fee">
          <Prov
            info={systemFeeRateProv("Current one-time borrowing fee rate", "getBorrowingRateWithDecay()")}
            value={formatExact(data.borrowingRate)}
          >
            {feePct(data.borrowingRate)}
          </Prov>
        </Stat>
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
        Liquity V1 charges <span className="text-foreground">no interest</span> and has no per-Trove rate. These three
        figures are the protocol&rsquo;s entire rate surface, and they are shared by every borrower: one base rate that
        redemptions push up and time decays back down, and the two one-time fees that derive from it. Liquity V2 and its
        forks replaced this with a rate each borrower sets — which is also what orders their redemption queues. Here,
        nothing about the queue below is chosen.
      </p>
    </div>
  );
}

/** The queue as a whole — the four facts about it that a listing sorted by
 *  ratio cannot state, because they are aggregates or need the price. */
function QueueCard({ data }: { data: LiquityV1SystemChainResponse }) {
  // The front of the queue is the lowest ratio in the system: the Trove a
  // redemption arriving now would reach first.
  const front = data.queue[0] ?? null;
  // Counted over EVERY listed Trove, not read off the front of the list. The
  // order makes the below-minimum set a prefix, so a prefix scan would give the
  // same answer today — but it would be an answer that depends on the ordering
  // being right, which is the thing this page is claiming rather than assuming.
  const belowMinimum = data.queue.filter((e) => e.liquidatable).length;

  return (
    <div className="rounded-xl bg-raised px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">The queue right now</span>
        <span className="text-[11px] tabular-nums text-rb-500">
          <Prov info={queueOrderProv()}>
            {data.queue.length} {data.queue.length === 1 ? "trove" : "troves"}
          </Prov>
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        <Stat label={`${DEBT_SYMBOL} in the queue`}>
          <Prov info={queueDebtTotalProv()} value={formatExact(data.queueDebtTotal)}>
            {formatCompact(data.queueDebtTotal)} {DEBT_SYMBOL}
          </Prov>
        </Stat>
        <Stat label="Front of the queue">
          {front?.icr != null ? (
            <Prov info={queueIcrProv()} value={formatExact(front.icr)}>
              {ratio(front.icr)}
            </Prov>
          ) : (
            "—"
          )}
        </Stat>
        <Stat label="Below the minimum">
          <Prov info={queueBelowMinimumProv()}>
            {/* The contract's own comparison, stated as the fact it is — and
                stated even at zero, because "none" is the answer a reader came
                for. A dash here would mean the read didn't happen. */}
            <span className={belowMinimum > 0 ? "text-red-500" : undefined}>{belowMinimum}</span>
          </Prov>
        </Stat>
      </div>

      {/* What the bare count means, in words. "0" alone asks the reader to know
          both what the minimum is and what falling under it does. */}
      {data.queue.length > 0 && (
        <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
          {belowMinimum === 0
            ? `No Trove in the queue is below the ${ratio(data.mcr)} minimum, so none is liquidatable at this price.`
            : `${belowMinimum} ${belowMinimum === 1 ? "Trove sits" : "Troves sit"} below the ${ratio(data.mcr)} minimum and ${belowMinimum === 1 ? "is" : "are"} liquidatable now, by anyone.`}
        </p>
      )}

      {data.queue.length === 0 ? (
        <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
          The sorted list didn&rsquo;t answer on this read, so the queue is withheld rather than estimated.
        </p>
      ) : (
        <Link href={QUEUE_HREF} className={`mt-3 inline-block text-[13px] ${LINK}`}>
          Open the queue in the listing <span aria-hidden>&rarr;</span>
        </Link>
      )}
    </div>
  );
}

export function LiquityV1SystemView({ data }: { data: LiquityV1SystemChainResponse }) {
  const registry = useReceiptRegistry();

  if (data.chainStale) {
    return (
      <div className="py-12 text-center text-rb-500">
        <p className="mb-1">Couldn&apos;t read Liquity V1&apos;s system state from chain.</p>
        <p className="text-sm">
          This view is a live contract read with no cached fallback — rather than show stale figures, it shows nothing.
          Try again shortly.
        </p>
      </div>
    );
  }

  return (
    <ProvReceiptsScope registry={registry}>
      <section>
        <h2 className="text-sm font-semibold text-foreground">The market</h2>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <SystemCard data={data} />
          <StabilityPoolCard data={data} />
          <RatesCard data={data} />
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Redemption</h2>
          <LearnMore content={liquityV1RedemptionContent()} inline />
        </div>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500">
          Anyone holding {DEBT_SYMBOL} can redeem it against Liquity V1 for {COLLATERAL_SYMBOL} at $1 face value — the
          peg mechanism. Redemptions take the LOWEST collateral ratio first, so the queue is ordered by ratio, not by
          any rate: a Trove&rsquo;s place is an outcome of the {COLLATERAL_SYMBOL} price and its own collateral, and the
          only way to move back is to add collateral or repay. Being redeemed isn&rsquo;t a penalty — the Trove gives up{" "}
          {COLLATERAL_SYMBOL} and sheds the same value of debt, and its ratio rises as a result.
        </p>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-rb-500">
          That queue is the Trove listing sorted by ratio, so it is shown there rather than twice: the link below opens
          every open Trove, lowest ratio first, front of the queue at the top. Two things it leaves out, both because
          they need the {COLLATERAL_SYMBOL} price the listing doesn&rsquo;t read — a Trove&rsquo;s own collateral ratio,
          and how much {DEBT_SYMBOL} is redeemed before it. Both are on that Trove&rsquo;s own page.
        </p>

        <div className="mt-3 lg:max-w-md">
          <QueueCard data={data} />
        </div>
      </section>

      <ProvenanceInfoTabs className="mt-6" />
    </ProvReceiptsScope>
  );
}

/** The page header's live-read stamp — the block every figure was read at. */
export function LiquityV1SystemStamp({ data }: { data: LiquityV1SystemChainResponse }) {
  if (data.chainStale || data.blockNumber === 0) return null;
  return (
    <p className="mt-2 text-[11px] text-rb-500">
      Chain snapshot · block{" "}
      <a
        href={explorerUrl(MAINNET_CHAIN_ID, "block", data.blockNumber)}
        target="_blank"
        rel="noopener noreferrer"
        className="link-external"
      >
        {data.blockNumber.toLocaleString("en-US")}
      </a>
      {" · "}
      {formatCompact(data.systemDebt)} {DEBT_SYMBOL} outstanding against {formatUsdValue(data.systemCollUsd)} of{" "}
      {COLLATERAL_SYMBOL}
    </p>
  );
}
