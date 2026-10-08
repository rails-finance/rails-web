"use client";

// Fluid position detail — reference depth, chain-state-first, the 3-section
// anatomy (card → economics → timeline), keyed by the position NFT id (Fluid
// positions are ERC721s — the MakerDAO-cdp URL pattern). Position state +
// timeline replay from the captured vault events plus the liquidation-
// attribution rows; the card's figures and the risk surfaces (position-ratio
// strip, liquidation runway, narration) read live from the protocol's own
// VaultResolver via /api/chain/fluid/position — positionByNftId runs the
// vault's OWN fetchLatestPosition settlement math (every liquidation sweep
// applied, interest accrued to the block included) and returns the vault's
// risk lines + its oracle's debt-per-col price (Fluid has no USD feed — the
// whole risk read lives in the vault's own token pair; proven by
// scripts/verify-fluid-chain.mjs). The chain read rides its own effect +
// state so first paint never waits on RPC; a chainStale response simply
// leaves the risk surfaces unrendered.

import { useCallback, useEffect, useMemo, useState } from "react";
import { INDEX_ROW_CEILING } from "@/lib/shared/timeline-row-ceiling";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import dynamic from "next/dynamic";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isFluidEvent, type FluidContext } from "@/lib/shared/types/event-shape";
import { fetchFluidPositions } from "@/lib/api/fetch-fluid-positions";
import type { FluidPositionSummary } from "@/lib/sources/api/fluid-positions";
import { fetchFluidTimeline } from "@/lib/api/fetch-fluid-timeline";
import { fetchFluidChainPosition, type FluidPositionChainResponse } from "@/lib/api/fetch-fluid-position";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import {
  lifetimeFiguresKnown,
  TIMELINE_WINDOW_EVENTS,
  WHOLE_HISTORY,
  type TimelineOpeningBalance,
  type TimelineWindow,
} from "@/lib/shared/timeline-opening-balance";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { useFluidTimelineRuns } from "@/lib/fluid/timeline-runs";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { FluidEventCard } from "@/components/protocol/fluid/fluid-event-card";
import {
  FluidPositionCard,
  fluidLegName,
  fluidPairText,
  viewFromSummary,
  type FluidPositionView,
} from "@/components/protocol/fluid/fluid-position-card";
import { FluidDebtDetail } from "@/components/protocol/fluid/fluid-risk-card";
import { FluidPositionExplanation } from "@/components/protocol/fluid/fluid-position-explanation";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { LifetimeFlowsPanel } from "@/components/shared/lifetime-flows-panel";
import { LifetimeFlowsScrubber } from "@/components/shared/lifetime-flows-scrubber";
import { FlowFocusContext } from "@/components/shared/flow-focus-context";
import { FluidFlowsNote, fluidFlowsContent } from "@/components/protocol/fluid/fluid-flows-note";
import { useFluidFlows } from "@/hooks/useFluidFlows";
import { computeFluidEconomics, fluidLifetimeWithOpening } from "@/lib/fluid/economics";
import { fluidEconomicsExplanation, fluidEconomicsContent } from "@/lib/fluid/economics-explanation";
import { closingPricesAt, DetailTopRow } from "@/components/shared/detail-back-row";
import type { LatestPriceAsset } from "@/components/shared/latest-prices";
import type { Provenance } from "@/components/shared/provenance";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import { TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { groupEventsByTx } from "@/lib/shared/explainer-prose";
import { summariseExternalActors, withOpeningActors } from "@/lib/shared/external-actor";
import { exportScopeNote, markdownHistoryScope } from "@/lib/shared/markdown-history";

// Lazy: the export path (dropdown UX + Markdown serializer + CSV builder) is
// one chunk off the initial bundle.
const FluidExportMenu = dynamic(
  () => import("@/components/protocol/fluid/fluid-export-menu").then((m) => m.FluidExportMenu),
  { ssr: false },
);

/** Thread the chain lane's pool names into the event contexts. Names only —
 *  the quantities stay shares, and an API-served symbol is never overridden.
 *  Shared by the page's own events and the CSV's whole-history fetch. */
type FluidTimelineEvent = BaseActivityEvent & { context: { protocol: "fluid"; data: FluidContext } };

function nameFluidLegs(
  raw: FluidTimelineEvent[],
  view: FluidPositionView | null,
  chain: FluidPositionChainResponse | null,
): FluidTimelineEvent[] {
  if (!view) return raw;
  const supplyName = fluidLegName(view, "supply", chain);
  const borrowName = fluidLegName(view, "borrow", chain);
  if (supplyName === "DEX shares" && borrowName === "DEX shares") return raw;
  let patched = false;
  const out = raw.map((e) => {
    const d = e.context.data;
    const supplySymbol = d.supplySymbol ?? (supplyName !== "DEX shares" ? supplyName : null);
    const borrowSymbol = d.borrowSymbol ?? (borrowName !== "DEX shares" ? borrowName : null);
    if (supplySymbol === d.supplySymbol && borrowSymbol === d.borrowSymbol) return e;
    patched = true;
    return { ...e, context: { ...e.context, data: { ...d, supplySymbol, borrowSymbol } } };
  });
  return patched ? out : raw;
}

interface FluidPositionViewProps {
  /** The vault position's NFT id, already checked to be a decimal integer by
   *  the server route — anything else answered 404. */
  nftId: string;
  initialPosition: FluidPositionSummary | null;
  /** `null` means the server could not read the tail; the effect below then
   *  reads it exactly as this page always did. An EMPTY array is a real answer
   *  — a position with no captured events — and seeds. */
  initialEvents: BaseActivityEvent[] | null;
  initialCutoffBlock: number | null;
  initialOpening: TimelineOpeningBalance | null;
}

export default function FluidPositionView({
  nftId,
  initialPosition,
  initialEvents,
  initialCutoffBlock,
  initialOpening,
}: FluidPositionViewProps) {
  // Keyed on the timeline, not the row: an NFT id Fluid never minted is a real
  // answer the server can seed, and its `initialPosition` is null.
  const seeded = initialEvents != null;
  const [view, setView] = useState<FluidPositionView | null>(() =>
    initialPosition ? viewFromSummary(initialPosition) : null,
  );
  const [events, setEvents] = useState<BaseActivityEvent[]>(initialEvents ?? []);
  // The checkpoint model. The timeline fetch asks for a WINDOW of the most
  // recent events; on a position that needs one, the response names the block
  // the window opened at and everything below it arrives as a declared opening
  // balance from the /summary twin. On a position that does not — 837,290 of
  // the index's 838k — `cutoffBlock` comes back null, no second request is made
  // and the page is byte-for-byte what it was.
  const [cutoffBlock, setCutoffBlock] = useState<number | null>(initialCutoffBlock);
  const [opening, setOpening] = useState<TimelineOpeningBalance | null>(initialOpening);
  const [openingFailed, setOpeningFailed] = useState(false);
  const [loading, setLoading] = useState(!seeded);
  const [chain, setChain] = useState<FluidPositionChainResponse | null>(null);
  // Whether the live read has answered (or failed): the Lifetime flows panel
  // waits for it, since today's figures and price are its.
  const [chainSettled, setChainSettled] = useState(false);
  // Standing display framing (risk view) — a global preference, so the
  // reader's choice on one position carries to the next.

  // Mount. A seeded view already holds the tail and leaves this alone; an
  // unseeded one reads it exactly as this page always did.
  useEffect(() => {
    if (seeded || !nftId) return;
    (async () => {
      setLoading(true);
      try {
        const [pData, tData] = await Promise.all([
          fetchFluidPositions({ nft: nftId, limit: 1 }),
          fetchFluidTimeline(nftId, { recent: TIMELINE_WINDOW_EVENTS }),
        ]);
        const summary = pData.data[0] ?? null;
        setView(summary ? viewFromSummary(summary) : null);
        setEvents(tData.events ?? []);
        setCutoffBlock(tData.cutoffBlock ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, [nftId, seeded]);

  // The opening balance — the second of the windowed page's two requests, and
  // deliberately not merged into the first: the rows land and the list is
  // readable while this is in flight, and every whole-history figure declares
  // itself unknown until it arrives rather than stating the window's arithmetic
  // as a lifetime. A failure is a stated failure for the same reason.
  useEffect(() => {
    // A seeded opening balance is already the answer — re-requesting it would
    // blank the whole-history figures for a round trip and put them back
    // unchanged. Only a server-side failure leaves it null with a cutoff block
    // set, which is exactly the case this still covers.
    if (opening != null) return;
    setOpeningFailed(false);
    if (cutoffBlock == null) return;
    const ac = new AbortController();
    fetchTimelineOpeningBalance({
      path: "/api/fluid/timeline/summary",
      params: { nft: nftId },
      cutoffBlock,
      signal: ac.signal,
    })
      .then((data) => setOpening(data))
      .catch((err) => {
        if ((err as { name?: string })?.name !== "AbortError") setOpeningFailed(true);
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nftId, cutoffBlock]);

  const historyWindow = useMemo<TimelineWindow>(() => {
    if (cutoffBlock == null) return WHOLE_HISTORY;
    if (opening) return { state: "ready", cutoffBlock, opening };
    return { state: openingFailed ? "failed" : "pending", cutoffBlock, opening: null };
  }, [cutoffBlock, opening, openingFailed]);

  // The live resolver read (settled figures / risk lines / oracle price) —
  // off the critical path; a failure returns chainStale and the risk surfaces
  // stay off while the indexed lanes keep rendering.
  useEffect(() => {
    if (!nftId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchFluidChainPosition(nftId);
        if (!cancelled && !data.chainStale && data.found) setChain(data);
      } catch {
        // Index-derived surfaces already render; the risk layer just stays off.
      }
      if (!cancelled) setChainSettled(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [nftId]);

  const rawFluidEvents = useMemo(() => events.filter(isFluidEvent), [events]);
  // Smart-vault legs carry no symbols in the indexed timeline rows, so every
  // event surface fell back to "DEX shares". The chain lane names the pools
  // (the position-card fix); thread those names into the event contexts here,
  // ONCE, so header / detail / explainer / spine receipts all say what the
  // shares are shares of. Names only — the quantities stay shares, and an
  // API-served symbol is never overridden.
  const fluidEvents = useMemo(() => nameFluidLegs(rawFluidEvents, view, chain), [rawFluidEvents, view, chain]);
  // The CSV is the export whose purpose IS the rows, so on a windowed page it
  // fetches the whole history at click time rather than handing over the window
  // under a whole-history filename. It runs through the SAME naming as the
  // page's events — the spreadsheet must not name a leg differently from the
  // timeline it was downloaded from.
  const fetchAllHistory = useCallback(
    async () =>
      await (async () => {
        const res = await fetchFluidTimeline(nftId);
        const served = res.events ?? [];
        return {
          events: nameFluidLegs(served.filter(isFluidEvent), view, chain),
          missing: Math.max((res.rowCeiling?.total ?? served.length) - served.length, 0),
        };
      })(),
    [nftId, view, chain],
  );
  // The tx-sibling seam: each card reaches its same-tx peers so the split-open
  // narrator (the mint card) can state the sibling deposit's figure.
  const siblingsByTx = useMemo(() => groupEventsByTx(fluidEvents), [fluidEvents]);
  // One row per Open (mint + first operate) and per NFT round trip; the
  // liquidation streak after them (lib/fluid/timeline-runs.tsx).
  const timelineRuns = useFluidTimelineRuns(siblingsByTx);

  // Who executed this position's events — the SAME externalActor() verdict each
  // event card renders on its spine (txFrom vs the operate's initiator, judged
  // against the owner AT that event), reduced over the whole history so the
  // Explanation can state it once. Derived from the events already on the page;
  // no new field on the position response.
  //
  // On a windowed page the opening balance's own split is added: rails-server
  // judges the same fact from the base tables — tx_from against the vault's
  // initiator and the NFT's owner AT that event — so both halves apply one
  // verdict. The two never count an event twice; they are the two sides of an
  // exclusive cut.
  const externalActivity = useMemo(
    () =>
      withOpeningActors(
        summariseExternalActors(
          fluidEvents.map((e) => ({
            txFrom: e.context.data.txFrom,
            poolCaller: e.context.data.initiator,
            wallet: e.context.data.ownerAt ?? e.wallet,
          })),
        ),
        opening?.actors,
        opening?.totalEvents ?? 0,
      ),
    [fluidEvents, opening],
  );

  // ⚠️ The lifetime layer must cover the WHOLE position or state nothing. Until
  // the opening balance is in hand `lifetimeEvents` is undefined, and
  // `computeFluidEconomics` reads an absent stream as "no lifetime layer"
  // rather than as an empty one — so the tower's hatched exit segments and its
  // faded inflow bar stay off while they cannot say the whole, which is the only
  // correct answer between the two requests.
  const lifetimeKnown = lifetimeFiguresKnown(historyWindow);
  const lifetimeEvents = lifetimeKnown ? fluidEvents : undefined;
  const precomputedLifetime = useMemo(() => fluidLifetimeWithOpening(fluidEvents, opening), [fluidEvents, opening]);

  // A smart vault's legs are DEX shares with no token price the page states,
  // so its positions keep the tower (lib/fluid/flows.ts); every other
  // position draws the Lifetime flows panel in its place.
  const vaultType = fluidEvents[0]?.context.data.vaultType ?? chain?.vaultType ?? null;
  const flowsOn = vaultType === 10000;

  const tl = useTimelineEvents(fluidEvents, {
    storageKey: `fluid-${nftId}`,
    protocolKey: "fluid",
    window: historyWindow,
    // Navigated by the Lifetime flows chart's "Show timeline to": no Dates.
    dates: !flowsOn,
  });

  // The Lifetime flows panel replays the position's whole history
  // (lib/fluid/flows.ts): the page's rows where they are all of it, else the
  // flat history read once (the CSV's read); a read the row ceiling cut short
  // is a failed read.
  const flowLive = useMemo(
    () =>
      chain && !chain.chainStale
        ? {
            price: chain.oraclePriceDebtPerCol,
            coll: Number(chain.supplyExact),
            debt: Number(chain.borrowExact),
            supplyApr: chain.supplyRatePct != null ? chain.supplyRatePct / 100 : null,
            borrowApr: chain.borrowRatePct != null ? chain.borrowRatePct / 100 : null,
          }
        : null,
    [chain],
  );
  const flowColl = view ? fluidLegName(view, "supply", chain) : null;
  const flowDebt = view ? fluidLegName(view, "borrow", chain) : null;
  const flows = useFluidFlows({
    vault: fluidEvents[0]?.context.data.vault ?? null,
    wholeEvents: historyWindow.state === "whole" ? fluidEvents : null,
    fetchAll: fetchAllHistory,
    collSymbol: flowColl,
    debtSymbol: flowDebt,
    open: view?.status === "open",
    live: flowLive,
    liveSettled: chainSettled,
    enabled: flowsOn,
  });
  // The timeline ties to the panel only where the panel draws.
  const flowFocus = flowsOn && flows.read !== "failed" ? flows.focus : null;

  const liveRisk = chain != null && view?.status === "open";

  // The top row's price dropdown. Fluid runs no USD feed: a vault's own oracle
  // quotes the collateral in the vault's DEBT token, which is the two-token
  // space its liquidation engine judges the ratio in, so that is the figure the
  // collateral row carries. The debt leg is that unit and has no price of its
  // own. A smart leg is DEX shares rather than an ERC-20, and valuing those
  // needs the DexResolver this depth deliberately does not assert, so a smart
  // vault's rows name the legs and state no figure.
  const stripAssets = useMemo<LatestPriceAsset[]>(() => {
    if (!view) return [];
    const supply = fluidLegName(view, "supply", chain);
    const borrow = fluidLegName(view, "borrow", chain);
    const debtPerCol =
      chain &&
      chain.found &&
      !chain.chainStale &&
      !chain.isSmartCol &&
      !chain.isSmartDebt &&
      chain.oraclePriceDebtPerCol != null &&
      chain.oraclePriceDebtPerCol > 0
        ? chain.oraclePriceDebtPerCol
        : undefined;
    const priceInfo: Provenance | undefined =
      debtPerCol != null && chain
        ? {
            kind: "chain",
            pclass: "oracle",
            summary: `${supply} priced in ${borrow} — what the vault's oracle reports at this block.`,
            contract: { name: "Fluid oracle", address: chain.oracle },
            via: `VaultResolver.positionByNftId(${chain.nftId}) at block ${chain.blockNumber}`,
            source: { block: chain.blockNumber },
            verify: { kind: "recompute", text: `Call VaultResolver.positionByNftId(${chain.nftId}) yourself` },
            scaling: {
              raw: chain.oraclePriceOperateRaw,
              from: "call",
              places: 27 + chain.borrowDecimals - chain.supplyDecimals,
              why: `The oracle states a fixed-point price scaled by 10^27, adjusted for ${supply}'s ${chain.supplyDecimals} decimals and ${borrow}'s ${chain.borrowDecimals} decimals`,
            },
          }
        : undefined;
    return [
      {
        symbol: supply,
        price: debtPerCol,
        unit: debtPerCol ? borrow : undefined,
        label: `${supply} in ${borrow} (the vault's own oracle)`,
        info: priceInfo,
      },
      { symbol: borrow, label: `${borrow}, the vault's debt token` },
    ];
  }, [view, chain]);

  // A closed position's prices: the vault oracle at the closing block, which
  // the index carries on every row its price filler has reached (server mig
  // 114). Where the closing row has no read yet, the dropdown is left out.
  const closing = useMemo(() => {
    if (!view || view.status === "open") return undefined;
    const supply = fluidLegName(view, "supply", chain);
    const borrow = fluidLegName(view, "borrow", chain);
    return closingPricesAt(
      fluidEvents,
      (row) => {
        const debtPerCol = row.context.data.oraclePriceAtBlock?.debtPerCol;
        if (debtPerCol == null || !(debtPerCol > 0)) return undefined;
        return [
          { symbol: supply, price: debtPerCol, unit: borrow, label: `${supply} in ${borrow} (the vault's own oracle)` },
          { symbol: borrow, label: `${borrow}, the vault's debt token` },
        ];
      },
      (row) => row.context.data.eventType !== "transfer" && row.context.data.eventType !== "mint",
    );
  }, [view, chain, fluidEvents]);

  return (
    <FlowFocusContext.Provider value={flowFocus}>
      <div className="py-8 space-y-6">
        <DetailTopRow
          session="fluid"
          owner={{ wallet: view?.owner }}
          assets={stripAssets}
          priceReason={ORACLE_USD_REASON.fluid}
          closed={view != null && view.status !== "open"}
          closing={closing}
        >
          {view && (
            <FluidExportMenu
              view={view}
              chain={chain}
              events={fluidEvents}
              csvFilename={`fluid-${nftId}-activity.csv`}
              fetchAllEvents={historyWindow.state === "whole" ? undefined : fetchAllHistory}
              history={markdownHistoryScope(historyWindow, fluidEvents)}
              scopeNote={exportScopeNote(historyWindow, fluidEvents, "this position's whole history")}
            />
          )}
        </DetailTopRow>

        {loading ? (
          <DetailBodySkeleton />
        ) : (
          <>
            {view && (
              <FluidPositionCard
                v={view}
                receipts
                viewHref={tl.viewHref}
                chain={chain}
                // Closed by default, remembered per viewer and position (ui-jobs
                // 209). The borrow rate and the room to the borrow limit from
                // the live read sit in the opened layer under Debt, inside the
                // card's receipts scope.
                disclosureKey={`fluid:${nftId}`}
                debtDetail={liveRisk ? <FluidDebtDetail chain={chain} pair={fluidPairText(view, chain)} /> : undefined}
                // The Explanation is layman prose about the face figures.
                // Rendered whenever there's a view or a chain read — a closed
                // position gets its prose too (the risk slot keeps its own gate).
                explanation={
                  view || chain ? (
                    <FluidPositionExplanation chain={chain} view={view} externalActivity={externalActivity} />
                  ) : undefined
                }
              />
            )}
            {/* Lifetime flows: the bars and the line over the position's replay
            (lib/fluid/flows.ts), in the vault's debt token, in place of the
            tower (TO-DO-ui-jobs 206). A smart vault keeps the tower. */}
            {view && flowsOn && flowColl && flowDebt && (
              <LifetimeFlowsPanel
                scrubber={flows.timeline ? <LifetimeFlowsScrubber timeline={flows.timeline} /> : null}
                read={flows.read}
                explanation={
                  <div className="space-y-2 text-sm text-rb-500">
                    <FluidFlowsNote facts={flows.facts} collSymbol={flowColl} debtSymbol={flowDebt} />
                  </div>
                }
                learnMore={fluidFlowsContent()}
              />
            )}
            {view &&
              !flowsOn &&
              (() => {
                const towerData = computeFluidEconomics(view, lifetimeEvents, chain, precomputedLifetime);
                return (
                  <ChainTruthTower
                    data={towerData}
                    explanation={fluidEconomicsExplanation(towerData)}
                    learnMore={fluidEconomicsContent()}
                  />
                );
              })()}
            <ChainTruthTimeline
              csvExportCeiling={INDEX_ROW_CEILING}
              // Matches `FluidEventCard`'s own `persistKey={`fluid:${event.id}`}` —
              // lets pinned mode (the per-event share route) force a landed
              // card's detail panel open on its first mount.
              persistKeyPrefix="fluid"
              closed={view ? view.status !== "open" : undefined}
              tl={tl}
              runs={timelineRuns}
              countTooltip="Counts events, not rows: an Open row combines the mint and the first operation, and a round-trip row combines one transfer per hop."
              toolbarLeading={
                view ? (
                  <TimelineActivityHeader
                    events={fluidEvents}
                    closed={view.status !== "open"}
                    // When the position was minted, not when the window opens —
                    // otherwise a position with 1,400 events reads as days old
                    // because its oldest loaded card is.
                    firstAt={opening?.firstTimestamp}
                    tenurePending={!lifetimeFiguresKnown(historyWindow)}
                  />
                ) : undefined
              }
              renderCard={(event, meta) =>
                isFluidEvent(event) ? (
                  <FluidEventCard
                    event={event}
                    eventNumber={meta.eventNumber}
                    isLast={meta.isLast}
                    siblings={siblingsByTx.get(event.txHash) ?? [event]}
                  />
                ) : null
              }
            />
            <ProvInspectorLayer />
          </>
        )}
      </div>
    </FlowFocusContext.Provider>
  );
}
