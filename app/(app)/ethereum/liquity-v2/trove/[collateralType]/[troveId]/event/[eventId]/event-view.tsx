"use client";

// The Liquity V2 event page's client half (rails-ops TO-DO-ui-jobs 236): the
// sub-nav the trove page has, a header with the position's summary, the
// previous and next events and "See in timeline", then the event's card
// opened at full width. The card is the timeline's `LiquityEventCard`, fed
// the replay the trove page feeds it (lib/liquity/event-prose-position.ts is
// the same path for the exports), so its levels and Copy for LLM are the
// timeline's. No Lifetime flows panel, no timeline.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TroveSummary } from "@/types/api/trove";
import type { OraclePricesData } from "@/types/api/oracle";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { liquityFlowTimeline, liquityFocusEvents, liquityV2FlowEvents } from "@/lib/shared/liquity-flows";
import { FlowFocusContext, useFlowFocusRoot, useFlowFocusValue } from "@/components/shared/flow-focus-context";
import { liquityDailyBranch, useLiquityDailyPrices } from "@/hooks/useLiquityDailyPrices";
import { useLiquityCollSurplus } from "@/hooks/useLiquityCollSurplus";
import { useWalletContext } from "@/components/nav/wallet-context";
import { liquityTroveHistory } from "@/lib/liquity/event-prose-position";
import { LiquityEventCard } from "@/components/protocol/liquity/liquity-event-card";
import { LiquityTroveMetaContext } from "@/components/protocol/liquity/event-prose-render";
import { CollSurplusCtx } from "@/components/protocol/liquity-family/coll-surplus-context";
import { LiquityPositionCard } from "@/components/protocol/liquity-family/liquity-position-card";
import { liveFromTroveState, viewFromTroveSummary } from "@/lib/liquity/trove-card-view";
import type { TroveStateData, TroveStateResponse } from "@/types/api/troveState";
import { closingPricesAt, DetailTopRow } from "@/components/shared/detail-back-row";
import type { LatestPriceAsset } from "@/components/shared/latest-prices";
import type { Provenance } from "@/components/shared/provenance";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { EventNotFoundNotice } from "@/components/shared/chain-truth-timeline";
import { EventDateContext } from "@/components/shared/event-time";
import { EventShareProvider } from "@/components/shared/event-share-context";
import { UnreadTokensProvider } from "@/components/shared/unread-tokens-context";
import { setCardOpen } from "@/lib/shared/card-open-store";
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

const BURN = "0x0000000000000000000000000000000000000000";

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

  // A closed Trove's owner is the burn address; the wallet is `lastOwner`.
  const owner = trove?.owner && trove.owner.toLowerCase() !== BURN ? trove.owner : trove?.lastOwner;
  const { setWallets } = useWalletContext();
  useEffect(() => {
    if (!owner) return;
    const lower = owner.toLowerCase();
    setWallets([lower], { [lower]: trove?.ownerEns ?? null });
  }, [owner, trove?.ownerEns, setWallets]);

  // The trove page's order: block, time, log index, then a stable sort by
  // time (useTimelineEvents), which numbers the events.
  const liquityEvents = useMemo(
    () => liquityTroveHistory(events ?? []).sort((a, b) => a.timestamp - b.timestamp),
    [events],
  );
  const at = liquityEvents.findIndex((e) => e.id === eventId);
  const event = at >= 0 ? liquityEvents[at] : undefined;
  const previous = at > 0 ? liquityEvents[at - 1] : undefined;
  const next = at >= 0 && at + 1 < liquityEvents.length ? liquityEvents[at + 1] : undefined;
  const total = totalEvents ?? liquityEvents.length;
  const offset = totalEvents != null ? Math.max(0, totalEvents - liquityEvents.length) : 0;

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

  // The header's figures are the trove card's: an open Trove's debt and
  // collateral at the head (the trove page's one chain read), the index's
  // otherwise.
  const [liveState, setLiveState] = useState<TroveStateData | undefined>(undefined);
  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    fetch(`/api/trove/state/${collateralType}/${troveId}`, { signal: ac.signal })
      .then((r) => (r.ok ? (r.json() as Promise<TroveStateResponse>) : null))
      .then((res) => {
        if (res?.success && res.data) setLiveState(res.data);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [open, collateralType, troveId]);

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

  // Opened on its first mount: written during render, before the card's
  // mount effect reads it (the timeline's pinned mode does the same).
  if (event) setCardOpen(`liquity-v2:${event.id}`, true);

  const navLink = "text-blue-600 hover:underline dark:text-blue-400";
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

        <header className="space-y-3" data-event-page-header="">
          <LiquityPositionCard
            protocol="liquity-v2"
            v={viewFromTroveSummary(trove, prices)}
            live={liveFromTroveState(trove, liveState, prices)}
            receipts
            showActivityMeta="counts"
          />
          <nav className="flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Events">
            <span className="flex items-center gap-4">
              {previous ? (
                <Link href={eventPath(previous.id)} className={navLink} data-event-prev="">
                  &larr; Previous event
                </Link>
              ) : (
                <span className="text-rb-500">First event</span>
              )}
              {next ? (
                <Link href={eventPath(next.id)} className={navLink} data-event-next="">
                  Next event &rarr;
                </Link>
              ) : (
                <span className="text-rb-500">Latest event</span>
              )}
            </span>
            <a href={`${trovePath}?at=${encodeURIComponent(eventId)}`} className={navLink} data-event-in-timeline="">
              See in timeline &rarr;
            </a>
          </nav>
        </header>

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
                        eventNumber={offset + at + 1}
                        currentPrice={currentPrice}
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
