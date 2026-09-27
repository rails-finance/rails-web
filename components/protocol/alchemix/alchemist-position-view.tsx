"use client";

// One Alchemist position. The client half — the page above it is a server
// component that has already read the position, its event history and its
// current figures.
//
// FIVE RULES THIS VIEW KEEPS. Each is a way an Alchemix position's figures can
// be read as saying something they do not.
//
// 1. THE CARD'S FIGURES ARE ONE READING AT ONE BLOCK. Earmarked debt accrues
//    inside the Alchemist on every block, so a figure is true at the block it
//    was read at and at no other. The card's figures come from the current
//    reading, one call at one block, and never from a stored row. Nothing here
//    carries a figure forward, interpolates between readings, or adds
//    earmarked to a debt figure from another block.
//
// 2. EVERY AMOUNT IS DRAWN WITH ITS BLOCK, FROM ONE GUARD. An amount whose
//    block is missing renders as not settled rather than as a bare number: the
//    number would look stated and would not be.
//
// 3. THE EVENTS-ONLY DEBT IS STATED ONLY WHERE IT DIFFERS. The wire calls it
//    `derivedLowerBound`, and a redemption can clear debt with no event of the
//    position's to show it, so the sum of the position's own events can sit
//    above the debt read now. The card states the two side by side where they
//    differ, with what the timeline's redemptions cleared where that accounts
//    for the gap, and says nothing where they agree.
//
// 4. THE POSITION IS A FREELY TRANSFERABLE ERC721. Ownership can change
//    without the position closing, so the holder shown is the holder now and
//    the page says so wherever it names one.
//
// 5. A V2 HISTORY IS SHOWN, NEVER ADDED. Where the holder closed a V2 account
//    on this synthetic, its rows join the timeline marked V2, so a wallet
//    that migrated reads as one story, and the version filter shows or hides
//    them. They ride their own context arm, and every figure on this page
//    (Lifetime flows, the tenure line, the card) is reduced over the V3 rows
//    alone: a V2 debt and this position's debt are one obligation at two
//    points in time (rails-ops reference/alchemix-v2-frozen-record.md).
//
// THE CHROME IS THE HOUSE'S. The page is the roster's detail anatomy: the top
// row, the position card, Lifetime flows, the timeline, drawn with the shared
// components (`PositionCardShell`, `OpenPositionStats`, `StatValue`,
// `WalletPill`, the status pill), with no frame, type scale or palette of its
// own. The timeline carries share-price market notes between events
// (lib/alchemix/market-notes.ts).

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { OpenPositionStats, type OpenPositionStatsColumn } from "@/components/shared/open-position-stats";
import { StatFootnote, StatValue } from "@/components/shared/stat-value";
import { PositionCardShell } from "@/components/shared/position-card-shell";
import { WalletPill } from "@/components/shared/wallet-pill";
import { TimelineActivityHeader, CHAIN_TRUTH_DISPLAY_ITEMS } from "@/components/shared/timeline-toolbar";
import { ProvReceiptsScope, useReceiptRegistry, Prov } from "@/components/shared/provenance";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { groupEventsByTx } from "@/lib/shared/explainer-prose";
import { OVERLAY_HEADING } from "@/lib/shared/ui-grammar";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { boundaryFromLimit } from "@/lib/shared/timeline-boundary";
import { useWalletContext } from "@/components/nav/wallet-context";
import { formatCompact } from "@/lib/shared/format-event";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isAlchemistEvent, isAlchemixV2Event } from "@/lib/shared/types/event-shape";
import { AlchemixV2EventCard, type AlchemixV2Event } from "@/components/protocol/alchemix/v2-event-card";
import { v2PositionPath } from "@/lib/alchemix/lines";
import { AlchemixEventCard } from "@/components/protocol/alchemix/alchemix-event-card";
import {
  AlchemixStatusPill,
  amountColumn,
  collateralColumn,
} from "@/components/protocol/alchemix/alchemix-position-card";
import { computeAlchemixEconomics } from "@/lib/alchemix/economics";
import { splitRidingTransfers, withRiders } from "@/lib/alchemix/riding-transfers";
import { isZeroEffectRedemption, useAlchemixTimelineRuns } from "@/lib/alchemix/timeline-runs";
import {
  AlchemixReadingsBeforeContext,
  AlchemixUnderlyingContext,
  collateralTakenRaw,
  readingsBefore,
  type AlchemixUnderlyingUnit,
} from "@/lib/alchemix/readings-before";
import { redemptionNet, shareFallToLiquidation, sumRedemptionNets } from "@/lib/alchemix/redemption-net";
import {
  alchemixSharePriceNotes,
  liveAlchemixSharePriceNote,
  type AlchemixSharePriceLine,
} from "@/lib/alchemix/market-notes";
import {
  AlchemixPositionExplanation,
  type AlchemixRedemptionTotals,
} from "@/components/protocol/alchemix/alchemix-position-explanation";
import { ALCHEMIX_HOW_IT_WORKS } from "@/components/protocol/alchemix/alchemix-event-explainer";
import type { LatestPriceAsset } from "@/components/shared/latest-prices";
import {
  clearedRunProv,
  collateralisationProv,
  eventsAloneDebtProv,
  lineLiquidationsProv,
  lineRatioProv,
  liquidationDistanceProv,
  liveFigureProv,
  redemptionNetTotalProv,
  sharePriceProv,
  underlyingProv,
  usdProv,
  type AlchemixCoords,
} from "@/lib/alchemix/event-provenance";
import type { AlchemixDeployment } from "@/lib/alchemix/lines";
import { alchemixPositionName, alchemixV2PositionName } from "@/lib/alchemix/naming";
import type {
  AlchemixHealth,
  AlchemixLineEventWindow,
  AlchemixLiveState,
  AlchemixPositionSummary,
} from "@/types/api/alchemix";

const block = (n: number) => n.toLocaleString("en-US");

/** A 1e18-scaled ratio as a percentage: one decimal below 1,000%, whole
 *  numbers above it, and "over 10,000%" past that, where a dust debt makes the
 *  figure a count of digits. The receipt holds the exact value. */
function ratioPct(raw: string): string {
  const pct = Number(raw) / 1e16;
  if (pct >= 10000) return "over 10,000%";
  return pct < 1000
    ? `${pct.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
    : `${Math.round(pct).toLocaleString("en-US")}%`;
}

/** A share-price fall as a percentage: one decimal, two under 1%. */
export function fallPct(fall: number): string {
  const pct = fall * 100;
  return `${pct.toLocaleString("en-US", { maximumFractionDigits: pct < 1 ? 2 : 1 })}%`;
}

/** The health column: collateralisation at the reading's block, with the
 *  line's two ratios under it. Liquity V2's ratio column is the model: the
 *  figure, and under it the line it is measured against. */
function healthColumn(health: AlchemixHealth, debtRaw: string | null, coords: AlchemixCoords): OpenPositionStatsColumn {
  const b = health.asOfBlock;
  const fall = shareFallToLiquidation(health.collateralizationRaw, health.collateralizationLowerBoundRaw);
  const ratio =
    health.collateralizationRaw != null && health.collateralValueRaw != null && debtRaw != null ? (
      <StatValue>
        <Prov
          info={collateralisationProv(health.collateralValueRaw, debtRaw, b, coords)}
          value={String(Number(health.collateralizationRaw) / 1e16)}
        >
          {ratioPct(health.collateralizationRaw)}
        </Prov>
      </StatValue>
    ) : (
      <StatValue color="text-rb-500">No debt</StatValue>
    );
  return {
    label: "Collateralisation",
    value: ratio,
    footnote: (
      <StatFootnote>
        <span className="tabular-nums">
          minimum{" "}
          <Prov info={lineRatioProv("minimumCollateralization", health.minimumCollateralizationRaw, b, coords)}>
            {ratioPct(health.minimumCollateralizationRaw)}
          </Prov>
          {" · "}liquidation at{" "}
          <Prov info={lineRatioProv("collateralizationLowerBound", health.collateralizationLowerBoundRaw, b, coords)}>
            {ratioPct(health.collateralizationLowerBoundRaw)}
          </Prov>
        </span>
        {fall != null && health.collateralizationRaw != null ? (
          <div className="mt-0.5 leading-snug">
            {fall > 0 ? (
              <>
                the vault&rsquo;s share price would need to fall{" "}
                <Prov
                  info={liquidationDistanceProv(
                    health.collateralizationRaw,
                    health.collateralizationLowerBoundRaw,
                    fall,
                    b,
                    coords,
                  )}
                  value={String(fall * 100)}
                >
                  <span className="tabular-nums">{fallPct(fall)}</span>
                </Prov>{" "}
                for liquidation
              </>
            ) : (
              <>at or below the liquidation line</>
            )}
          </div>
        ) : null}
      </StatFootnote>
    ),
  };
}

/** The V2 account(s) this position's holder closed, and their rows. `joined`
 *  is false when the rows are not on the timeline: the V3 history is windowed,
 *  or a V2 read did not land whole. The links stand either way. */
/** What the health column's two lines mean, and how many liquidations the
 *  line has had. One sentence of mechanics; the modal holds the rest. */
function HealthSentence({
  health,
  syntheticSymbol,
  underlyingSymbol,
  coords,
}: {
  health: AlchemixHealth;
  syntheticSymbol: string;
  underlyingSymbol: string | null;
  coords: AlchemixCoords;
}) {
  const under = underlyingSymbol ?? "the asset underneath";
  const liq = health.lineLiquidations;
  return (
    <p className="mt-3 text-[11px] leading-relaxed text-rb-500">
      Collateralisation is the collateral in {under} divided by the debt, with one {syntheticSymbol} counted as one{" "}
      {under}. Borrowing more or withdrawing must leave it above the minimum. At the liquidation line or below, anyone
      can liquidate the position and is paid a fee from its collateral.
      {liq ? (
        <>
          {" "}
          The {syntheticSymbol} line has had{" "}
          <Prov info={lineLiquidationsProv(liq.count, liq.throughBlock, coords)} value={String(liq.count)}>
            {liq.count === 0 ? "no liquidation" : `${liq.count} ${liq.count === 1 ? "liquidation" : "liquidations"}`}
          </Prov>
          {liq.throughBlock != null ? ` to block ${block(liq.throughBlock)}` : ""}.
        </>
      ) : null}
    </p>
  );
}

export interface AlchemixV2History {
  links: { lineKey: string; account: string; syntheticSymbol: string | null }[];
  events: BaseActivityEvent[];
  joined: boolean;
}

export interface AlchemistPositionViewProps {
  deployment: AlchemixDeployment;
  lineKey: string;
  tokenId: string;
  position: AlchemixPositionSummary;
  events: BaseActivityEvent[];
  /** The position's whole event count when the served page stopped short of
   *  it; null when the rows are the whole history. */
  totalEvents: number | null;
  /** The route's own statement about rows that name no position. */
  lineScopedNote: string | null;
  /** Where this timeline's line-scope rows stop, and how far the line runs
   *  past that. It earns a line only on a position that has ENDED: there the
   *  timeline stops carrying redemptions while the line keeps having them, and
   *  nothing else on the page says why. On an open position the window's end
   *  IS the line's frontier, so it would state what the timeline shows. */
  lineEventWindow: AlchemixLineEventWindow | null;
  /** The current figures, read at render. Null when that read did not land —
   *  and then the slot says so, because no stored figure is current. */
  initialLiveState: AlchemixLiveState | null;
  /** The holder's closed V2 account on this synthetic, where one is linked. */
  v2History?: AlchemixV2History | null;
}

export function AlchemistPositionView({
  deployment,
  lineKey,
  tokenId,
  position,
  events,
  totalEvents,
  lineScopedNote,
  lineEventWindow,
  initialLiveState,
  v2History = null,
}: AlchemistPositionViewProps) {
  const registry = useReceiptRegistry();
  const chainId = deployment.chainId;
  const sym = position.syntheticSymbol;
  const mytSymbol = position.figures.collateral?.mytSymbol ?? "shares";

  // Rule 1. The current figures are re-read on the client so a page left open
  // does not keep quoting the block it was opened at. A refresh that fails
  // leaves the last reading standing WITH ITS OWN BLOCK, which is still a true
  // statement about that block; it never falls back to a stored figure.
  const [live, setLive] = useState<AlchemixLiveState | null>(initialLiveState);
  const [livePending, setLivePending] = useState(initialLiveState == null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (initialLiveState != null) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/alchemix/position/${encodeURIComponent(lineKey)}/${encodeURIComponent(tokenId)}/state`,
        );
        if (!res.ok) return;
        const json = (await res.json()) as { success: boolean; data?: AlchemixLiveState };
        if (!cancelled && json.success && json.data) setLive(json.data);
      } catch (err) {
        console.error("The current figures did not come back; the slot will say so", err);
      } finally {
        if (!cancelled) setLivePending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialLiveState, lineKey, tokenId]);

  // Rule 4. The header pill names the holder NOW. Nothing on this page assumes
  // that address held the position for any of the history below it.
  const { setWallets } = useWalletContext();
  useEffect(() => {
    if (!position.owner) return;
    setWallets([position.owner.toLowerCase()], {});
  }, [position.owner, setWallets]);

  const coords: AlchemixCoords = useMemo(() => ({ chainId, lineKey, tokenId }), [chainId, lineKey, tokenId]);

  // The decimals of the asset under the MYT — 6 on the two USDC lines, 18 on
  // the WETH one. It reaches the event cards for the two fees an Alchemist pays
  // in that asset; everything else a log emits is in the synthetic or in
  // shares, and both are 18 on every line. Either reading answers it, because
  // it is a property of the line and not of the reading, and a Base position
  // with no head reading has neither, which leaves those two fees unstated
  // rather than scaled at a power the line does not use.
  const underlyingDecimals =
    position.figures.collateral?.underlying?.decimals ?? live?.collateral.underlying?.decimals ?? null;

  const alchemistEvents = useMemo(() => events.filter(isAlchemistEvent), [events]);
  // An opening emits three logs in one transaction — the NFT's mint, the
  // deposit, and often a transfer passing the NFT on to the address that asked
  // for it. They draw ONE card (lib/alchemix/timeline-runs), and a card drawing
  // one leg a filter left standing still reads this map: it is what tells a
  // forwarding hop from a change of owner.
  const siblingsByTx = useMemo(() => groupEventsByTx(alchemistEvents), [alchemistEvents]);
  // One transaction is one card; and a redemption belongs to the line, so most
  // of this timeline is them, and a streak of three or more collapses into one
  // dated row.
  // The reading before each block on the timeline, for before → after on
  // every card and for what each redemption took from the collateral.
  const beforeByBlock = useMemo(() => readingsBefore(alchemistEvents), [alchemistEvents]);
  // A transfer sharing its transaction with another leg is drawn inside that
  // card, so the timeline counts the card and not the transfer.
  const { drawn: drawnEvents, ridersByTx } = useMemo(
    () => splitRidingTransfers(alchemistEvents, (e) => e.context.data.scope === "position"),
    [alchemistEvents],
  );
  const timelineRuns = useAlchemixTimelineRuns(
    coords,
    mytSymbol,
    underlyingDecimals,
    siblingsByTx,
    beforeByBlock,
    ridersByTx,
  );
  const redemptionTotals = useMemo<AlchemixRedemptionTotals & { clearedRaw: string }>(() => {
    let count = 0;
    let stated = 0;
    let cleared = BigInt(0);
    let taken = BigInt(0);
    let takenStated = 0;
    for (const e of alchemistEvents) {
      if (e.context.data.eventType !== "redemption") continue;
      count++;
      const c = e.context.data.debtClearedFromReadings;
      if (c?.status !== "stated" || c.amountRaw == null) continue;
      stated++;
      cleared += BigInt(c.amountRaw);
      const t = collateralTakenRaw(e, beforeByBlock.get(e.blockNumber) ?? null);
      if (t != null) {
        takenStated++;
        taken += BigInt(t);
      }
    }
    return {
      count,
      stated,
      cleared: Number(cleared) / 1e18,
      clearedRaw: cleared.toString(),
      taken: takenStated === stated ? Number(taken) / 1e18 : null,
    };
  }, [alchemistEvents, beforeByBlock]);
  // Each redemption's net for the holder in the underlying, summed. The unit
  // is the underlying the readings name; with none named, nothing is valued.
  const underlyingUnit = useMemo<AlchemixUnderlyingUnit | null>(() => {
    const u = live?.collateral.underlying ?? position.figures.collateral?.underlying ?? null;
    return u?.symbol ? { symbol: u.symbol, decimals: u.decimals } : null;
  }, [live, position.figures.collateral]);
  const redemptionNetTotal = useMemo(
    () =>
      sumRedemptionNets(
        alchemistEvents
          .filter((e) => e.context.data.eventType === "redemption")
          .map((e) => redemptionNet(e, beforeByBlock.get(e.blockNumber) ?? null, underlyingUnit?.decimals ?? null)),
      ),
    [alchemistEvents, beforeByBlock, underlyingUnit],
  );
  // The route's note on redemption rows earns its place only where one is
  // drawn: redemptions that changed nothing are one sentence of their own.
  const redemptionRowDrawn = useMemo(
    () =>
      alchemistEvents.some(
        (e) => e.context.data.eventType === "redemption" && !isZeroEffectRedemption(e, beforeByBlock),
      ),
    [alchemistEvents, beforeByBlock],
  );
  const olderCount = totalEvents != null ? Math.max(0, totalEvents - alchemistEvents.length) : 0;
  // Rule 5. The V2 rows join the list the timeline draws and nothing else.
  const v2Events = useMemo(
    () => (v2History?.joined ? (v2History.events.filter(isAlchemixV2Event) as AlchemixV2Event[]) : []),
    [v2History],
  );
  const timelineEvents = useMemo(
    () => (v2Events.length > 0 ? [...drawnEvents, ...v2Events] : drawnEvents),
    [drawnEvents, v2Events],
  );
  // Share-price market notes: the stretches between two readings where the
  // vault's share price moved far enough to matter to this position, and the
  // newest reading against the price read now (lib/alchemix/market-notes.ts).
  // Read over the V3 rows the timeline draws, whatever the filter hides.
  const sharePriceLine = useMemo<AlchemixSharePriceLine | null>(() => {
    const h = live?.health;
    if (!h || !underlyingUnit) return null;
    return {
      lineKey,
      mytSymbol,
      mytAddress: live?.collateral.mytAddress ?? "",
      underlyingSymbol: underlyingUnit.symbol,
      syntheticSymbol: sym,
      underlyingDecimals: underlyingUnit.decimals,
      liquidationLine: Number(h.collateralizationLowerBoundRaw) / 1e18,
    };
  }, [live, underlyingUnit, lineKey, mytSymbol, sym]);
  const marketNotes = useMemo(
    () => (sharePriceLine ? alchemixSharePriceNotes(drawnEvents, sharePriceLine) : []),
    [drawnEvents, sharePriceLine],
  );
  const liveMarketNotes = useMemo(() => {
    const u = live?.collateral.underlying;
    if (!sharePriceLine || !u || position.status !== "open") return [];
    const note = liveAlchemixSharePriceNote(drawnEvents, sharePriceLine, {
      price: Number(u.sharePriceRaw) / 10 ** u.decimals,
      block: u.sharePriceAsOfBlock ?? live.asOfBlock,
    });
    return note ? [note] : [];
  }, [drawnEvents, sharePriceLine, live, position.status]);

  const tl = useTimelineEvents(timelineEvents, {
    storageKey: `alchemix-${lineKey}-${tokenId}`,
    protocolKey: "alchemix-v3",
    olderCount,
  });

  const boundary = useMemo(() => {
    const oldest = tl.sortedEvents[0];
    if (olderCount === 0 || totalEvents == null || !oldest) return null;
    return boundaryFromLimit({
      total: totalEvents,
      listed: alchemistEvents.length,
      cutBlock: oldest.blockNumber,
      cutAt: oldest.timestamp,
      // The position's balance at the cut is not reconstructible from an
      // Alchemix log — none of them states one — so the card names the cut and
      // claims no opening figures.
      state: null,
    });
  }, [olderCount, totalEvents, alchemistEvents.length, tl.sortedEvents]);

  const economics = useMemo(
    () =>
      // Rule 5: V3 rows only. The reducer guards on the arm as well.
      computeAlchemixEconomics(tl.sortedEvents.filter(isAlchemistEvent), {
        syntheticSymbol: sym,
        mytSymbol,
        currentCollateral: live?.collateral.formatted ?? position.figures.collateral?.formatted ?? null,
        currentDebt: live?.debt?.formatted ?? position.figures.debt?.formatted ?? null,
        windowed: olderCount > 0,
        coords,
      }),
    [tl.sortedEvents, sym, mytSymbol, live, position.figures, olderCount, coords],
  );

  // The window, narrowed to the one case it says something the timeline does
  // not: an ENDED position whose line has run on past it. Both blocks must be
  // in hand and the frontier must be the later of the two, or there is nothing
  // to state.
  const endedWindow = useMemo(() => {
    const w = lineEventWindow;
    if (!w?.positionEnded || w.endedAtBlock == null || w.lineFrontierBlock == null) return null;
    if (w.lineFrontierBlock <= w.endedAtBlock) return null;
    return { endedAtBlock: w.endedAtBlock, lineFrontierBlock: w.lineFrontierBlock };
  }, [lineEventWindow]);

  // The top row's price list: the asset underneath in dollars, a vault share
  // in that asset, and the synthetic at the value the protocol counts it at,
  // one unit of the asset underneath.
  const priceView = live?.collateral ?? position.figures.collateral ?? null;
  const priceAssets = useMemo<LatestPriceAsset[]>(() => {
    const u = priceView?.underlying;
    const out: LatestPriceAsset[] = [];
    if (u?.symbol && priceView?.usd)
      out.push({ symbol: u.symbol, address: u.address, price: priceView.usd.pricePerUnit });
    if (u?.symbol && priceView && priceView.formatted > 0)
      out.push({
        symbol: mytSymbol,
        price: u.formatted / priceView.formatted,
        unit: u.symbol,
        label: `One ${mytSymbol} in ${u.symbol}`,
      });
    out.push(
      u?.symbol
        ? { symbol: sym, price: 1, unit: u.symbol, label: `One ${sym} as the protocol counts it, in ${u.symbol}` }
        : { symbol: sym },
    );
    return out;
  }, [priceView, mytSymbol, sym]);
  const underSym = priceView?.underlying?.symbol ?? null;
  const priceReason = underSym
    ? `${underSym} is priced in dollars, and a ${mytSymbol} share in ${underSym} at the vault's share price; together they give the collateral's dollar value. ${sym} is shown at 1 ${underSym}, the protocol's accounting value: Alchemix counts each ${sym} of debt as one ${underSym}. Its market price can differ.`
    : `${sym} and ${mytSymbol} are shown in their own units with no dollar price: no share price has been read for this position.`;

  const dlb = position.figures.derivedLowerBound;
  // Rule 3. The events-only debt beside the debt read now, where the two
  // differ; and what the timeline's redemptions cleared, where every one of
  // them states its figure and the sum accounts for the gap to a thousandth
  // of a unit.
  const eventsAlone = (() => {
    const read = live?.debt;
    if (!dlb || !live || !read) return null;
    const gap = Number(dlb.debtRaw) / 1e18 - read.formatted;
    if (Math.abs(gap) < 1e-3) return null;
    const clearedAccounts =
      olderCount === 0 &&
      redemptionTotals.count > 0 &&
      redemptionTotals.stated === redemptionTotals.count &&
      Math.abs(gap - redemptionTotals.cleared) < 1e-3;
    return { read, asOfBlock: live.asOfBlock, clearedAccounts };
  })();

  return (
    <ProvReceiptsScope registry={registry}>
      <div className="space-y-6 py-8">
        <DetailTopRow
          session={deployment.session}
          wallet={position.owner}
          assets={priceAssets}
          priceReason={priceReason}
        />

        {/* ── The position card: the current figures, one reading, one block ── */}
        <PositionCardShell
          receipts
          explanation={
            live ? (
              <AlchemixPositionExplanation
                live={live}
                syntheticSymbol={sym}
                mytSymbol={mytSymbol}
                redemptions={redemptionTotals}
                net={
                  underlyingUnit && olderCount === 0
                    ? {
                        total: redemptionNetTotal,
                        underlyingSymbol: underlyingUnit.symbol,
                        prov:
                          redemptionNetTotal.netRaw != null
                            ? redemptionNetTotalProv(
                                redemptionNetTotal.netRaw,
                                redemptionNetTotal.counted,
                                underlyingUnit.symbol,
                                coords,
                              )
                            : null,
                      }
                    : null
                }
                vaultHref={
                  live.collateral.mytAddress
                    ? explorerUrl(chainId as ChainId, "address", live.collateral.mytAddress)
                    : null
                }
                fall={
                  live.health
                    ? shareFallToLiquidation(
                        live.health.collateralizationRaw,
                        live.health.collateralizationLowerBoundRaw,
                      )
                    : null
                }
              />
            ) : undefined
          }
          learnMore={live ? ALCHEMIX_HOW_IT_WORKS : undefined}
        >
          <OpenPositionStats
            statusPill={<AlchemixStatusPill status={position.status} />}
            leadingIdentity={
              <>
                <span className="text-xs font-bold tracking-wide text-foreground/80">
                  {alchemixPositionName(sym, tokenId)}
                </span>
                <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-rb-500">
                  <span>{position.chainName ?? `chain ${chainId}`}</span>
                  {position.owner ? (
                    <span className="inline-flex items-center gap-1.5">
                      held now by
                      <WalletPill
                        wallet={position.owner}
                        ensName={null}
                        filterProtocol={deployment.session}
                        bookmarkProtocol={deployment.session}
                      />
                    </span>
                  ) : null}
                </span>
              </>
            }
            identity={
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className={`${OVERLAY_HEADING} text-rb-500`}>Now</span>
                {live ? (
                  <span className="text-[11px] tabular-nums text-rb-500">
                    one reading at block{" "}
                    <a
                      href={explorerUrl(chainId as ChainId, "block", live.asOfBlock)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-muted"
                    >
                      {block(live.asOfBlock)}
                    </a>
                  </span>
                ) : null}
              </span>
            }
            columns={
              live
                ? [
                    amountColumn("Debt", live.debt ? { ...live.debt, asOfBlock: live.asOfBlock } : null, sym, {
                      prov: liveFigureProv("Debt", sym, live.debt?.raw ?? null, live.asOfBlock, coords),
                    }),
                    // The asset underneath leads; the share count is what the
                    // position holds and stays beside it.
                    collateralColumn({ ...live.collateral, asOfBlock: live.asOfBlock }, mytSymbol, {
                      shares: liveFigureProv("Collateral", mytSymbol, live.collateral.raw, live.asOfBlock, coords),
                      underlying: live.collateral.underlying
                        ? underlyingProv(
                            live.collateral.underlying.symbol ?? "the asset underneath",
                            live.collateral.underlying.raw,
                            live.collateral.underlying.decimals,
                            live.asOfBlock,
                            live.collateral.underlying.sharePriceRaw,
                            live.collateral.underlying.sharePriceAsOfBlock,
                            coords,
                          )
                        : undefined,
                      usd: live.collateral.usd
                        ? usdProv(
                            live.collateral.underlying?.symbol ?? "the asset underneath",
                            live.collateral.usd.pricePerUnit,
                            live.collateral.usd.priceSource,
                            live.collateral.usd.pricedAt,
                          )
                        : undefined,
                      sharePrice: live.collateral.underlying
                        ? sharePriceProv(
                            mytSymbol,
                            live.collateral.underlying.symbol ?? "the asset underneath",
                            live.collateral.underlying.sharePriceRaw,
                            live.collateral.underlying.decimals,
                            live.collateral.underlying.sharePriceAsOfBlock,
                            live.collateral.mytAddress ?? null,
                            coords,
                          )
                        : undefined,
                    }),
                    // Rule 1. Its own slot, its own block, added to nothing.
                    amountColumn(
                      "Set aside for repayment",
                      live.earmarked ? { ...live.earmarked, asOfBlock: live.asOfBlock } : null,
                      sym,
                      {
                        prov: liveFigureProv(
                          "Set aside for repayment",
                          sym,
                          live.earmarked?.raw ?? null,
                          live.asOfBlock,
                          coords,
                        ),
                        note: "It grows block by block, so this holds at that block.",
                      },
                    ),
                    live.health ? healthColumn(live.health, live.debt?.raw ?? null, coords) : null,
                  ]
                : []
            }
          />
          {live?.health ? (
            <HealthSentence
              health={live.health}
              syntheticSymbol={sym}
              underlyingSymbol={live.collateral.underlying?.symbol ?? null}
              coords={coords}
            />
          ) : null}
          {eventsAlone && dlb ? (
            <p className="mt-3 text-[11px] leading-relaxed text-rb-500 tabular-nums">
              Events alone:{" "}
              <Prov
                info={eventsAloneDebtProv(sym, dlb.debtRaw, dlb.reducedToBlock, dlb.validToBlock, coords)}
                value={String(Number(dlb.debtRaw) / 1e18)}
                symbol={sym}
              >
                {formatCompact(Number(dlb.debtRaw) / 1e18).display} {sym}
              </Prov>
              {" · "}read now:{" "}
              <Prov
                info={liveFigureProv("Debt", sym, eventsAlone.read.raw, eventsAlone.asOfBlock, coords)}
                value={String(eventsAlone.read.formatted)}
                symbol={sym}
              >
                {formatCompact(eventsAlone.read.formatted).display}
              </Prov>
              {eventsAlone.clearedAccounts ? (
                <>
                  {" · "}
                  <Prov
                    info={clearedRunProv(
                      sym,
                      redemptionTotals.clearedRaw,
                      redemptionTotals.count,
                      redemptionTotals.stated,
                      "every redemption on this timeline",
                      coords,
                    )}
                    value={String(redemptionTotals.cleared)}
                    symbol={sym}
                  >
                    {formatCompact(redemptionTotals.cleared).display}
                  </Prov>{" "}
                  cleared by {redemptionTotals.count} {redemptionTotals.count === 1 ? "redemption" : "redemptions"}
                </>
              ) : null}
            </p>
          ) : null}
          {position.refusedReason ? (
            <p className="mt-3 text-xs leading-relaxed text-rb-500">{position.refusedReason}</p>
          ) : null}
          {live ? null : (
            <p className="text-sm text-rb-500">
              {livePending
                ? "Reading the position now…"
                : "The current figures did not come back. Reload the page to read them again."}
            </p>
          )}
          {/* Rule 4, said outright rather than left to be inferred. */}
          {v2History && v2History.links.length > 0 ? (
            <p className="mt-3 text-[11px] leading-relaxed text-rb-500">
              {v2History.links.map((l, i) => (
                <span key={`${l.lineKey}:${l.account}`}>
                  {i > 0 ? ", " : ""}
                  <Link href={v2PositionPath(deployment, l.lineKey, l.account)} className="link">
                    {alchemixV2PositionName(l.syntheticSymbol ?? sym, l.account)}
                  </Link>
                </span>
              ))}{" "}
              is this holder&rsquo;s account from before Alchemix V3, closed on 2 April 2026.
              {v2History.joined
                ? " Its events are on the timeline below, marked V2, and the figures on this page are V3's alone."
                : " Its events are on its own page."}
            </p>
          ) : null}
          <p className="mt-3 text-[11px] leading-relaxed text-rb-500">
            This position is a token that can be sold. It can change hands without closing, so the address above is who
            holds it now and need not be who did any of what is below.
          </p>
        </PositionCardShell>

        {/* ── Lifetime flows ─────────────────────────────────────────────── */}
        {economics ? (
          <ChainTruthTower data={economics.data} title="Lifetime flows" />
        ) : olderCount > 0 ? (
          // The tower's own "nothing to draw" placeholder, in the slot the
          // tower would have filled.
          <p className="rounded-md border border-dashed border-rb-300/50 px-4 py-6 text-center text-[11px] leading-relaxed text-rb-400 dark:border-rb-700/50">
            This position has more events than the page draws, so no lifetime totals are given.
          </p>
        ) : null}

        {/* ── The timeline ───────────────────────────────────────────────── */}
        <AlchemixReadingsBeforeContext.Provider value={beforeByBlock}>
          <AlchemixUnderlyingContext.Provider value={underlyingUnit}>
            <ChainTruthTimeline
              persistKeyPrefix="alchemix-v3"
              closed={position.status === "closed"}
              tl={tl}
              runs={timelineRuns}
              boundary={boundary}
              notes={marketNotes}
              liveNotes={liveMarketNotes}
              liveNotesPending={livePending}
              displayItems={CHAIN_TRUTH_DISPLAY_ITEMS}
              emptyLabel="No events recorded for this position"
              toolbarLeading={
                <TimelineActivityHeader
                  events={drawnEvents}
                  closed={position.status === "closed"}
                  tenurePending={olderCount > 0}
                />
              }
              notice={
                (lineScopedNote && redemptionRowDrawn) || endedWindow ? (
                  <div className="space-y-1">
                    {lineScopedNote && redemptionRowDrawn ? (
                      // The route's own sentence about line rows, rendered as given.
                      <p className="px-1 text-[11px] leading-relaxed text-rb-500">{lineScopedNote}</p>
                    ) : null}
                    {/* Why a closed position's timeline stops carrying the line's
                    events while the line goes on having them. Open positions
                    get nothing: their window ends at the frontier, so the
                    sentence would restate the timeline. */}
                    {endedWindow ? (
                      <p className="px-1 text-[11px] leading-relaxed text-rb-500">
                        This position ended at block {block(endedWindow.endedAtBlock)}, and the line has been indexed to
                        block {block(endedWindow.lineFrontierBlock)} since. A position that has ended cannot be moved by
                        a later redemption, so none of the line&rsquo;s events past that block are on this timeline.
                      </p>
                    ) : null}
                  </div>
                ) : undefined
              }
              renderCard={(event, meta) => {
                if (isAlchemixV2Event(event)) {
                  return (
                    <AlchemixV2EventCard
                      event={event as AlchemixV2Event}
                      showVersion
                      isFirst={meta.isFirst}
                      isLast={meta.isLast}
                      eventNumber={meta.eventNumber}
                    />
                  );
                }
                if (!isAlchemistEvent(event)) return null;
                return (
                  <AlchemixEventCard
                    legs={withRiders([event], ridersByTx)}
                    mytSymbol={mytSymbol}
                    underlyingDecimals={underlyingDecimals}
                    siblings={siblingsByTx.get(event.txHash) ?? [event]}
                    isFirst={meta.isFirst}
                    isLast={meta.isLast}
                    eventNumber={meta.eventNumber}
                  />
                );
              }}
            />
          </AlchemixUnderlyingContext.Provider>
        </AlchemixReadingsBeforeContext.Provider>
      </div>
      <ProvInspectorLayer />
    </ProvReceiptsScope>
  );
}
