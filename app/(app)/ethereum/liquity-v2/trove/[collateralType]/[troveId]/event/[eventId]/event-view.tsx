"use client";

// The Liquity V2 event page's client half (rails-ops TO-DO-ui-jobs 236): the
// sub-nav the trove page has, then the event's card in its page mode with the
// side column in the spine's place (liquity-event-page-aside.tsx: the title,
// the paragraph, the facts table, the previous, next and timeline links). The card is
// the timeline's `LiquityEventCard`, fed the replay the trove page feeds it
// (lib/liquity/event-prose-position.ts is the same path for the exports), so
// its levels and Copy for LLM are the timeline's.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TroveSummary } from "@/types/api/trove";
import type { OraclePricesData } from "@/types/api/oracle";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { liquityFlowTimeline, liquityFocusEvents, liquityV2FlowEvents } from "@/lib/shared/liquity-flows";
import { FlowFocusContext, useFlowFocusRoot, useFlowFocusValue } from "@/components/shared/flow-focus-context";
import { liquityDailyBranch, useLiquityDailyPrices } from "@/hooks/useLiquityDailyPrices";
import { useLiquityCollSurplus } from "@/hooks/useLiquityCollSurplus";
import { useWalletContext } from "@/components/nav/wallet-context";
import { eventPagePlace, troveHolder } from "@/lib/liquity/event-page";
import { LiquityEventCard } from "@/components/protocol/liquity/liquity-event-card";
import { LiquityEventHeader } from "@/components/protocol/liquity/liquity-event-header";
import { LiquityEventPageAside } from "@/components/protocol/liquity/liquity-event-page-aside";
import { LiquityTroveMetaContext } from "@/components/protocol/liquity/event-prose-render";
import { CollSurplusCtx } from "@/components/protocol/liquity-family/coll-surplus-context";
import { closingPricesAt, DetailTopRow } from "@/components/shared/detail-back-row";
import type { LatestPriceAsset } from "@/components/shared/latest-prices";
import type { Provenance } from "@/components/shared/provenance";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { EventNotFoundNotice } from "@/components/shared/chain-truth-timeline";
import { EventDateContext } from "@/components/shared/event-time";
import { EventShareProvider } from "@/components/shared/event-share-context";
import { UnreadTokensProvider } from "@/components/shared/unread-tokens-context";
import { shortDate, shortDateYear } from "@/lib/shared/format-event";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";

export interface EventViewProps {
  collateralType: string;
  troveId: string;
  /** Decoded. */
  eventId: string;
  /** Null on a failed read. */
  trove: TroveSummary | null;
  events: BaseActivityEvent[] | null;
  /** The route's count where its first page stopped short; null when the
   *  first page was the whole history (the trove page's numbering). */
  totalEvents: number | null;
  prices: OraclePricesData | null;
}

export default function EventView({
  collateralType,
  troveId,
  eventId,
  trove,
  events,
  totalEvents,
  prices,
}: EventViewProps) {
  const router = useRouter();
  const trovePath = `/ethereum/liquity-v2/trove/${collateralType}/${troveId}`;
  const eventPath = (id: string) => `${trovePath}/event/${encodeURIComponent(id)}`;

  const holder = troveHolder(trove);
  const owner = holder.address ?? undefined;
  const { setWallets } = useWalletContext();
  useEffect(() => {
    if (!owner) return;
    const lower = owner.toLowerCase();
    setWallets([lower], { [lower]: trove?.ownerEns ?? null });
  }, [owner, trove?.ownerEns, setWallets]);

  const place = useMemo(() => eventPagePlace(events ?? [], eventId, totalEvents), [events, eventId, totalEvents]);
  const { events: liquityEvents, event, previous, next, n, total } = place;

  // A liquidated Trove's surplus, read at the head as the trove page reads it:
  // the liquidation's prose and the replay's surplus line take it.
  const lastLiquidation = useMemo(
    () => [...liquityEvents].reverse().find((e) => e.context.data.operation === "liquidate"),
    [liquityEvents],
  );
  const surplus = useLiquityCollSurplus({
    protocol: "liquity-v2",
    branch: collateralType,
    owner: trove?.status === "liquidated" ? owner : null,
    liquidationTx: lastLiquidation?.txHash,
  });
  const surplusState = useMemo(
    () => (lastLiquidation && surplus ? { creditTx: lastLiquidation.txHash, claimed: surplus.claimed } : null),
    [lastLiquidation, surplus],
  );

  // The replay the card's ledgers read, with the trove page's inputs: the
  // history, the branch's daily price, the clock set on mount, and today's
  // oracle price for an open Trove.
  const collSymbol = trove?.collateralType ?? collateralType;
  const debtSymbol = liquityEvents[0]?.context.data.assetType || "BOLD";
  const currentPrice = prices?.[collSymbol.toLowerCase() as keyof OraclePricesData];
  const flowEvents = useMemo(() => liquityV2FlowEvents(liquityEvents), [liquityEvents]);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now() / 1000), []);
  const daily = useLiquityDailyPrices(liquityDailyBranch(collSymbol));
  const surplusClaimed = surplus?.claimed != null;
  const open = trove?.status === "open";
  const flowTimeline = useMemo(
    () =>
      now == null || !daily.settled
        ? null
        : liquityFlowTimeline(flowEvents, {
            collSymbol,
            debtSymbol,
            surplusClaimed,
            now,
            dailyColl: daily.obs,
            live: open ? { price: currentPrice ?? null } : null,
          }),
    [flowEvents, collSymbol, debtSymbol, surplusClaimed, now, daily.settled, daily.obs, open, currentPrice],
  );
  const focusEvents = useMemo(
    () => liquityFocusEvents(flowEvents, collSymbol, debtSymbol),
    [flowEvents, collSymbol, debtSymbol],
  );
  const flowFocus = useFlowFocusValue(useFlowFocusRoot(focusEvents), flowTimeline);
  const troveMeta = useMemo(() => ({ owner: owner ?? null, total }), [owner, total]);

  if (!trove || !events) {
    return (
      <div className="py-8">
        <div className="bg-red-500/10 border border-red-500/40 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-400">This Trove&rsquo;s history could not be read.</p>
          <button
            onClick={() => router.refresh()}
            className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-500 rounded text-white text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // The sub-nav's prices, as the trove page states them.
  const priceInfo: Provenance | undefined = currentPrice
    ? {
        kind: "chain-derived",
        pclass: "oracle",
        summary: `${trove.collateralType}'s price — Liquity's on-chain oracle, read now.`,
        via: "Liquity's on-chain oracle (Chainlink feed + LST canonical rate, the MIN/MAX rule)",
      }
    : undefined;
  const stripAssets: LatestPriceAsset[] = [
    ...(currentPrice ? [{ symbol: trove.collateralType, price: currentPrice, info: priceInfo }] : []),
    { symbol: "BOLD", price: 1 },
  ];
  const closing = !open
    ? closingPricesAt(liquityEvents, (row) => {
        const price = row.context.data.collateralPrice;
        return price > 0
          ? [
              {
                symbol: trove.collateralType,
                price,
                info: {
                  kind: "chain-derived",
                  pclass: "oracle",
                  summary: `${trove.collateralType}'s price at the Trove's closing row — the collateral price Liquity's oracle gave that transaction.`,
                  via: "the closing event's collateral price",
                } satisfies Provenance,
              },
              { symbol: "BOLD", price: 1 },
            ]
          : undefined;
      })
    : undefined;

  const timelineHref = `${trovePath}?at=${encodeURIComponent(eventId)}`;
  return (
    <FlowFocusContext.Provider value={flowFocus}>
      <div className="py-8 space-y-6">
        <DetailTopRow
          session="liquity-v2"
          wallet={owner}
          owner={{
            wallet: owner,
            ensName: trove.ownerEns ?? null,
            prefix:
              owner && owner !== trove.owner ? (
                <span className="shrink-0 whitespace-nowrap text-rb-400" title="Last owner (trove closed)">
                  last owner
                </span>
              ) : undefined,
          }}
          assets={stripAssets}
          closed={!open}
          closing={closing}
          tools={false}
        />

        {event ? (
          <CollSurplusCtx.Provider value={surplusState}>
            <LiquityTroveMetaContext.Provider value={troveMeta}>
              <EventDateContext.Provider value={`${shortDate(event.timestamp)} ${shortDateYear(event.timestamp)}`}>
                <EventShareProvider href={eventPath(event.id)}>
                  <div id={`event-${event.id}`} data-event-id={event.id} className="rounded-xl">
                    <UnreadTokensProvider tokens={event.decimalsUnread}>
                      <LiquityEventCard
                        event={event}
                        addressDisplay="hidden"
                        isFirst
                        isLast
                        previousEvent={previous}
                        eventNumber={n}
                        currentPrice={currentPrice}
                        page={{
                          aside: (
                            <LiquityEventPageAside
                              title={
                                <LiquityEventHeader
                                  ctx={event.context.data}
                                  timestamp={event.timestamp}
                                  txHash={event.txHash}
                                  blockNumber={event.blockNumber}
                                  title
                                />
                              }
                              collSymbol={trove.collateralType}
                              troveId={troveId}
                              owner={holder.address}
                              ownerEns={trove.ownerEns ?? null}
                              lastOwner={holder.last}
                              n={n}
                              total={total}
                              blockNumber={event.blockNumber}
                              previousHref={previous ? eventPath(previous.id) : null}
                              nextHref={next ? eventPath(next.id) : null}
                              timelineHref={timelineHref}
                            />
                          ),
                        }}
                      />
                    </UnreadTokensProvider>
                  </div>
                </EventShareProvider>
              </EventDateContext.Provider>
            </LiquityTroveMetaContext.Provider>
          </CollSurplusCtx.Provider>
        ) : (
          <EventNotFoundNotice id={eventId} chainId={MAINNET_CHAIN_ID} />
        )}
      </div>
      <ProvInspectorLayer />
    </FlowFocusContext.Provider>
  );
}
