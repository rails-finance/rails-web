"use client";

// The "Claim collateral" row on a Liquity-family Trove's timeline: the owner's
// claimCollateral() that paid this Trove's surplus out of the CollSurplusPool
// (lib/shared/liquity-coll-surplus-claim.ts builds the event). One card for
// Liquity V2, its forks and Liquity V1, on the shared chain-truth row grammar.
//
//   T1  "Claim collateral" and the amount, which rides the spine toward the
//       wallet at ≥sm.
//   T2  this Trove's claimable collateral going to zero, and what the claim
//       paid in all (the pool pays the owner's whole balance, so one claim can
//       cover several Troves).
//   T3  the credit it paid out, and whether other Troves shared the claim.
//   T4  how the pool holds and pays a surplus.

import { EventCard } from "@/components/shared/event-card";
import { SpineColumn } from "@/components/shared/spine-column";
import {
  ChainTruthDetail,
  ChainTruthRow,
  chainTruthDeltaValue,
  type ChainTruthStat,
} from "@/components/shared/chain-truth-event";
import { LearnMore } from "@/components/shared/learn-more-modal";
import { Prov } from "@/components/shared/provenance";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { formatDate } from "@/lib/date";
import { formatExact } from "@/lib/utils/format";
import { formatNum } from "@/lib/shared/format-event";
import type { BaseActivityEvent, CollSurplusClaimContext } from "@/lib/shared/types/event-shape";
import type { LiquityForkLearnMoreParams } from "@/lib/shared/learn-more-content";
import { liquityCollSurplusClaimContent } from "@/lib/shared/learn-more-content";
import { claimOthers } from "@/lib/shared/liquity-coll-surplus-claim";
import { claimAmountProv, claimOthersProv, claimPaidProv } from "@/lib/shared/liquity-coll-surplus-provenance";
import { StatCard, StatSubline, StateTransition } from "@/components/shared/state-transition";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { useLiquityV1EventReadState } from "@/lib/liquity-v1/use-event-read";
import { claimPaidUsdProv, eventPriceProv } from "@/lib/liquity-v1/event-provenance";
import { fmtUsd } from "@/lib/liquity-v1/event-figures";

export type CollSurplusClaimEvent = BaseActivityEvent & {
  context: { protocol: "liquity-coll-surplus-claim"; data: CollSurplusClaimContext };
};

/** Four decimals, as the liquidation header's "claimable" pill states it;
 *  below 0.01 (a BTC branch's surplus), five significant digits. */
const fig = (n: number) =>
  Math.abs(n) > 0 && Math.abs(n) < 0.01 ? n.toLocaleString("en-US", { maximumSignificantDigits: 5 }) : formatNum(n, 4);

export function CollSurplusClaimCard({
  event,
  isFirst,
  isLast,
  eventNumber,
  persistPrefix,
  fork,
}: {
  event: CollSurplusClaimEvent;
  isFirst?: boolean;
  isLast?: boolean;
  eventNumber?: number;
  /** The page's EventCard persist prefix ("liquity-v2", "asymmetry", …). */
  persistPrefix: string;
  /** A fork's learn-more links (Asymmetry, Ebisu, Basedollar). */
  fork?: LiquityForkLearnMoreParams;
}) {
  const d = event.context.data;
  const at = { txHash: event.txHash, blockNumber: event.blockNumber };
  const amountProv = claimAmountProv(d, at);
  const others = claimOthers(d);
  const v1 = d.family === "liquity-v1";
  const pool = v1 ? `${d.protocolName}'s surplus pool` : `the ${d.symbol} branch's CollSurplusPool`;
  const credit = d.creditKind === "redemption" ? "fully redeemed" : "liquidated";
  // Liquity V1 values every event at the PriceFeed price at its block, read
  // from the transaction's receipt; the claim follows. The other families'
  // claim rows carry no price yet.
  const { read } = useLiquityV1EventReadState(v1 ? event.txHash : undefined, v1 ? d.owner : undefined);
  const price = v1 && read?.priceUsd != null && read.priceUsd > 0 ? read.priceUsd : null;

  const stats: ChainTruthStat[] = [
    {
      label: "Claimable collateral",
      value: "0",
      symbol: d.symbol,
      prov: amountProv,
      transition: {
        before: fig(d.amount),
        beforeExact: formatExact(d.amount),
        beforeProv: amountProv,
        change: `−${fig(d.amount)}`,
        changeExact: `−${formatExact(d.amount)}`,
        changeProv: amountProv,
        shownAsIs: true,
      },
    },
    ...(d.paid != null
      ? [
          {
            label: "Paid to the owner",
            value: fig(d.paid),
            display: fig(d.paid),
            symbol: d.symbol,
            prov: claimPaidProv(d, at),
            usd:
              price != null
                ? { value: d.paid * price, prov: claimPaidUsdProv(at, { eth: d.paid, priceUsd: price }) }
                : undefined,
            usdAlways: true,
            sub: others ? (
              <>
                incl.{" "}
                <Prov info={claimOthersProv(d, others.value)} value={formatExact(others.value)}>
                  {fig(others.value)}
                </Prov>{" "}
                from other Troves
              </>
            ) : undefined,
          } satisfies ChainTruthStat,
        ]
      : []),
  ];

  const amountEcho = (
    <H>
      <Prov info={amountProv} value={chainTruthDeltaValue(d.amount, true)} echo>
        {fig(d.amount)}
      </Prov>{" "}
      {d.symbol}
    </H>
  );
  const lead = (
    <>
      The owner claimed {amountEcho} from {pool}: the collateral left over when this Trove was {credit}
      {d.creditAt != null ? ` on ${formatDate(d.creditAt)}` : ""}.
    </>
  );
  const rest = [
    others && d.paid != null ? (
      <>
        The pool pays out the owner&apos;s whole balance at once, so this claim paid{" "}
        <H>
          <Prov info={claimPaidProv(d, at)} value={fig(d.paid)} echo>
            {fig(d.paid)}
          </Prov>{" "}
          {d.symbol}
        </H>{" "}
        in all: {amountEcho} for this Trove and{" "}
        <H>
          <Prov info={claimOthersProv(d, others.value)} value={formatExact(others.value)} echo>
            {fig(others.value)}
          </Prov>{" "}
          {d.symbol}
        </H>{" "}
        the owner&apos;s other Troves had left there.
      </>
    ) : d.paid != null ? (
      <>The pool pays out the owner&apos;s whole balance at once; this Trove&apos;s surplus was all of it.</>
    ) : null,
  ].filter((n) => n != null);

  const learnMore = liquityCollSurplusClaimContent(
    fork ? { family: "fork", fork } : { family: v1 ? "liquity-v1" : "liquity-v2", protocolName: d.protocolName },
  );

  return (
    <EventCard
      avatar={null}
      iconColumn={
        <SpineColumn
          tokens={[
            {
              symbol: d.symbol,
              direction: "left",
              value: d.amount,
              prov: { info: amountProv, value: chainTruthDeltaValue(d.amount, true), symbol: d.symbol },
              verb: "claimed",
            },
          ]}
          isFirst={isFirst}
          isLast={!!isLast}
        />
      }
      header={
        <ChainTruthRow
          spec={{
            label: "",
            deltas: [{ value: d.amount, symbol: d.symbol, prov: amountProv, label: event.actionLabel, axisVerb: true }],
          }}
          timestamp={event.timestamp}
          eventNumber={eventNumber}
        />
      }
      detail={
        <ChainTruthDetail
          stats={stats}
          extra={
            v1 ? (
              <StatCard label={`${d.symbol} price`}>
                {price != null ? (
                  <StateTransition>
                    <Prov info={eventPriceProv(at, price)}>
                      <span className="text-sm font-semibold tabular-nums text-rb-500">{fmtUsd(price)}</span>
                    </Prov>
                    <TokenChipIcon symbol={d.symbol} size={16} />
                  </StateTransition>
                ) : (
                  <span className="text-sm font-semibold text-rb-500">…</span>
                )}
                <StatSubline>Liquity&apos;s price feed, at this block</StatSubline>
              </StatCard>
            ) : undefined
          }
        />
      }
      detailLabel="Surplus claimed"
      explainer={rest.length > 0 ? <ProseExplainer items={rest} /> : undefined}
      explainerLabel="Plain English"
      explainerTeaser={lead}
      txHash={event.txHash}
      learnMore={<LearnMore inline content={learnMore} />}
      persistKey={`${persistPrefix}:${event.id}`}
    />
  );
}
