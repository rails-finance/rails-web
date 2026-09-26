"use client";

// One Alchemist position. The client half — the page above it is a server
// component that has already read the position, its line's coverage, its event
// history and its current figures.
//
// FIVE RULES THIS VIEW KEEPS. Each is a way an Alchemix position's figures can
// be read as saying something they do not.
//
// 1. THE CURRENT FIGURES AND THE STORED ONES ARE TWO DIFFERENT STATEMENTS, and
//    they are drawn as two panels with two blocks. Earmarked debt accrues
//    inside the Alchemist on every block, so a stored figure is true at the
//    block it was taken at and at no other. The headline earmarked figure comes
//    from the current reading — one call, one block — and never from the stored
//    row. Nothing here carries either forward, interpolates between them, or
//    adds earmarked to a debt figure from another block.
//
// 2. EVERY AMOUNT IS DRAWN WITH ITS BLOCK, FROM ONE GUARD. An amount whose
//    block is missing renders as not settled rather than as a bare number: the
//    number would look stated and would not be.
//
// 3. THE GRADE IS A SENTENCE. Four are possible and they differ in what they
//    can say at all, which no colour can carry. The route's own plain-words
//    sentence is rendered as given, the way the listing already does it.
//
// 4. THE EVENT-DERIVED FIGURE IS STATED WITH NO DIRECTION. The wire calls it
//    `derivedLowerBound`. Measured against production while this was built, the
//    figure was at or above the contract's own on every position that carried
//    both and below it on none — a redemption burns debt that the position's
//    own events do not show. So the panel says what the figure is and the block
//    it stopped being exact at, and claims nothing about which side of the
//    truth it falls on.
//
// 5. THE POSITION IS A FREELY TRANSFERABLE ERC721. Ownership can change
//    without the position closing, so the holder shown is the holder now and
//    the page says so wherever it names one.
//
// 7. A V2 HISTORY IS SHOWN, NEVER ADDED. Where the holder closed a V2 account
//    on this synthetic, its rows join the timeline marked V2, so a wallet
//    that migrated reads as one story, and the version filter shows or hides
//    them. They ride their own context arm, and every figure on this page
//    (Lifetime flows, the tenure line, the stored and current figures) is
//    reduced over the V3 rows alone: a V2 debt and this position's debt are
//    one obligation at two points in time (rails-ops
//    reference/alchemix-v2-frozen-record.md).
//
// THE CHROME IS THE HOUSE'S. The page is the roster's detail anatomy — the top
// row, the position card, Lifetime flows, the timeline — drawn with the shared
// components (`PositionCardShell`, `OpenPositionStats`, `StatValue`,
// `WalletPill`, the status pill), not with a frame, a type scale or a palette
// of its own. The one departure is the second panel below the card, which
// states the stored figures: rule 1 above is why they cannot be merged into the
// card's, so they are a second statement in the same chrome rather than a
// second column in the first.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { OpenPositionStats } from "@/components/shared/open-position-stats";
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
import { useAlchemixTimelineRuns } from "@/lib/alchemix/timeline-runs";
import {
  collateralAppreciationProv,
  liveFigureProv,
  servedFigureProv,
  underlyingProv,
  usdProv,
  type AlchemixCoords,
} from "@/lib/alchemix/event-provenance";
import type { AlchemixDeployment } from "@/lib/alchemix/lines";
import { alchemixPositionName, alchemixV2PositionName } from "@/lib/alchemix/naming";
import type {
  AlchemixLineCoverage,
  AlchemixLineEventWindow,
  AlchemixLiveState,
  AlchemixPositionSummary,
} from "@/types/api/alchemix";

const block = (n: number) => n.toLocaleString("en-US");

/** The V2 account(s) this position's holder closed, and their rows. `joined`
 *  is false when the rows are not on the timeline: the V3 history is windowed,
 *  or a V2 read did not land whole. The links stand either way. */
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
  coverage: AlchemixLineCoverage | null;
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
  coverage,
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

  // Rule 5. The header pill names the holder NOW. Nothing on this page assumes
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
  const timelineRuns = useAlchemixTimelineRuns(coords, mytSymbol, underlyingDecimals, siblingsByTx);
  const olderCount = totalEvents != null ? Math.max(0, totalEvents - alchemistEvents.length) : 0;
  // Rule 7. The V2 rows join the list the timeline draws and nothing else.
  const v2Events = useMemo(
    () => (v2History?.joined ? (v2History.events.filter(isAlchemixV2Event) as AlchemixV2Event[]) : []),
    [v2History],
  );
  const timelineEvents = useMemo(
    () => (v2Events.length > 0 ? [...alchemistEvents, ...v2Events] : alchemistEvents),
    [alchemistEvents, v2Events],
  );
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
      // Rule 7: V3 rows only. The reducer guards on the arm as well.
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

  const collateral = position.figures.collateral;
  const underlying = collateral?.underlying ?? null;
  const usd = collateral?.usd ?? null;
  const dlb = position.figures.derivedLowerBound;

  // Rule 6. What the vault did for the collateral, and only where every part of
  // it is in hand. An `unavailable` figure draws nothing at all — a stated ZERO
  // is an answer and is the reason the guard is on the status and not on the
  // amount.
  const app = position.figures.collateralAppreciationFromReadings;
  const appStated =
    app?.status === "stated" &&
    app.formatted != null &&
    app.amountRaw != null &&
    app.decimals != null &&
    app.fromBlock != null &&
    app.toBlock != null &&
    app.intervals != null &&
    app.readings != null
      ? {
          formatted: app.formatted,
          amountRaw: app.amountRaw,
          decimals: app.decimals,
          symbol: app.symbol ?? "the asset underneath",
          fromBlock: app.fromBlock,
          toBlock: app.toBlock,
          intervals: app.intervals,
          readings: app.readings,
        }
      : null;

  return (
    <ProvReceiptsScope registry={registry}>
      <div className="space-y-6 py-8">
        <DetailTopRow session={deployment.session} wallet={position.owner} />

        {/* ── The position card: the current figures, one reading, one block ── */}
        <PositionCardShell receipts>
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
                        note: "It grows every block, so this is true at that block and at no other.",
                      },
                    ),
                  ]
                : []
            }
          />
          {live ? null : (
            <p className="text-sm text-rb-500">
              {livePending
                ? "Reading the position now…"
                : "The current figures did not come back. Nothing stored is put in their place: the amount set aside for repayment grows every block, so no figure taken earlier is the figure now."}
            </p>
          )}
          {/* Rule 5, said outright rather than left to be inferred. */}
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

        {/* ── What the index holds, and under which grade ────────────────── */}
        {/* The same shell the card above draws in, so the two sets of figures
            line up column for column: they are the same three figures on two
            bases, and a reader compares them across the gap. */}
        <PositionCardShell receipts>
          <OpenPositionStats
            // The card above states the status once. This panel leads with the
            // basis instead — what a pill would say here is already said.
            statusPill={null}
            leadingIdentity={<h2 className={`${OVERLAY_HEADING} text-rb-500`}>As this explorer last settled it</h2>}
            columns={[
              amountColumn("Debt", position.figures.debt, sym, {
                prov: servedFigureProv(
                  "Debt",
                  sym,
                  position.figures.debt?.raw ?? null,
                  position.figures.debt?.asOfBlock ?? null,
                  position.figures.grade,
                  coords,
                ),
              }),
              collateralColumn(collateral, mytSymbol, {
                shares: servedFigureProv(
                  "Collateral",
                  mytSymbol,
                  collateral?.raw ?? null,
                  collateral?.asOfBlock ?? null,
                  position.figures.grade,
                  coords,
                ),
                underlying: underlying
                  ? underlyingProv(
                      underlying.symbol ?? "the asset underneath",
                      underlying.raw,
                      underlying.decimals,
                      collateral?.asOfBlock ?? null,
                      underlying.sharePriceRaw,
                      underlying.sharePriceAsOfBlock,
                      coords,
                    )
                  : undefined,
                usd: usd
                  ? usdProv(
                      underlying?.symbol ?? "the asset underneath",
                      usd.pricePerUnit,
                      usd.priceSource,
                      usd.pricedAt,
                    )
                  : undefined,
              }),
              amountColumn("Set aside for repayment", position.figures.earmarked, sym, {
                prov: servedFigureProv(
                  "Set aside for repayment",
                  sym,
                  position.figures.earmarked?.raw ?? null,
                  position.figures.earmarked?.asOfBlock ?? null,
                  position.figures.grade,
                  coords,
                ),
                note: "The last reading taken. It is not this position's figure now.",
              }),
            ]}
          />

          <div className="mt-3 space-y-1.5">
            {/* What the column above is a conversion OF, and at which block —
              the share count and the share price need not have been read
              together, so the second block is named here. Neither figure is
              repeated; both are in the column, each with its own receipt. */}
            {underlying ? (
              <p className="text-[11px] leading-relaxed text-rb-500">
                Collateral is held as shares in the vault, not as the asset underneath it. The figure above is that
                share count
                {underlying.sharePriceAsOfBlock != null ? (
                  <> at the share price read at block {block(underlying.sharePriceAsOfBlock)}</>
                ) : (
                  <> at a share price with no block stated</>
                )}
                .
              </p>
            ) : (
              // Rule 6 of the protocol's own shape: the share price lives only on
              // a reading of the position. With no reading there is no price, so
              // there is no figure for the asset underneath — and none is shown,
              // rather than a zero.
              <p className="text-[11px] leading-relaxed text-rb-500">
                No share price has been read for this position, so what those shares are worth in the asset underneath
                is not stated here.
              </p>
            )}

            {/* What the vault did for the collateral. The verb carries the
                sign — a share price that fell has to read as a loss, which is
                why this is never labelled yield (rails-ops decisions/0032). */}
            {appStated ? (
              <p className="text-[11px] leading-relaxed text-rb-500">
                The vault&rsquo;s share price{" "}
                {appStated.formatted > 0
                  ? "took this position’s collateral up by "
                  : appStated.formatted < 0
                    ? "took this position’s collateral down by "
                    : "moved this position’s collateral by "}
                <Prov
                  info={collateralAppreciationProv(
                    appStated.symbol,
                    appStated.amountRaw,
                    appStated.decimals,
                    appStated.fromBlock,
                    appStated.toBlock,
                    appStated.intervals,
                    appStated.readings,
                    coords,
                  )}
                  value={String(appStated.formatted)}
                  symbol={appStated.symbol}
                >
                  <span className="tabular-nums">
                    {formatCompact(Math.abs(appStated.formatted)).display} {appStated.symbol}
                  </span>
                </Prov>{" "}
                over the readings from block {block(appStated.fromBlock)} to block {block(appStated.toBlock)}. That is
                the share count against each step the price took, summed over {appStated.intervals}{" "}
                {appStated.intervals === 1 ? "step" : "steps"}, with deposits and withdrawals left out — a vault share
                can lose value as well as gain it.
              </p>
            ) : null}

            {/* Rule 3. The route's own words for this line's grade. */}
            <p className="text-xs leading-relaxed text-rb-500">{position.figures.gradeReason}</p>

            {/* Rule 4. The figure, its block, and no direction. */}
            {dlb ? (
              <p className="text-xs leading-relaxed text-rb-500">
                Worked out from this position&rsquo;s own events alone, the debt is{" "}
                <span className="tabular-nums">
                  {formatCompact(Number(dlb.debtRaw) / 1e18).display} {sym}
                </span>
                , exact to block {block(dlb.validToBlock)}. Redemptions after that block moved the debt with nothing in
                these events to see, so that figure and the one above it differ, and by how much is not something either
                of them states.
              </p>
            ) : null}

            {position.refusedReason ? (
              <p className="text-xs leading-relaxed text-rb-500">{position.refusedReason}</p>
            ) : null}

            {coverage ? (
              <p className="text-[11px] leading-relaxed text-rb-500">
                This line has{" "}
                {coverage.redemptionCount === 0 ? "had no redemption" : `had ${coverage.redemptionCount} redemptions`}
                {coverage.firstRedemptionBlock != null
                  ? `, the first at block ${block(coverage.firstRedemptionBlock)}`
                  : ""}
                {coverage.indexedToBlock != null
                  ? `, and is covered here to block ${block(coverage.indexedToBlock)}`
                  : ""}
                .
                {coverage.unsweptRedemptions > 0
                  ? ` ${coverage.unsweptRedemptions} of them have no reading taken past them yet, so the figures above do not cover every point the debt could have stepped.`
                  : ""}
              </p>
            ) : null}

            <Link href={`${deployment.basePath}/lines`} className="link inline-block text-xs">
              How each line answers
            </Link>
          </div>
        </PositionCardShell>

        {/* ── Lifetime flows ─────────────────────────────────────────────── */}
        {economics ? (
          <ChainTruthTower data={economics.data} title="Lifetime flows" />
        ) : olderCount > 0 ? (
          // The tower's own "nothing to draw" placeholder, in the slot the
          // tower would have filled.
          <p className="rounded-md border border-dashed border-rb-300/50 px-4 py-6 text-center text-[11px] leading-relaxed text-rb-400 dark:border-rb-700/50">
            This position has more events than the page draws, so no lifetime totals are given: a total over part of a
            life would carry a label it has not earned.
          </p>
        ) : null}

        {/* ── The timeline ───────────────────────────────────────────────── */}
        <ChainTruthTimeline
          persistKeyPrefix="alchemix-v3"
          closed={position.status === "closed"}
          tl={tl}
          runs={timelineRuns}
          boundary={boundary}
          displayItems={CHAIN_TRUTH_DISPLAY_ITEMS}
          emptyLabel="No events recorded for this position"
          toolbarLeading={
            <TimelineActivityHeader
              events={alchemistEvents}
              closed={position.status === "closed"}
              tenurePending={olderCount > 0}
            />
          }
          notice={
            lineScopedNote || endedWindow ? (
              <div className="space-y-1">
                {lineScopedNote ? (
                  <p className="px-1 text-[11px] leading-relaxed text-rb-500">{lineScopedNote}</p>
                ) : null}
                {/* Why a closed position's timeline stops carrying the line's
                    events while the line goes on having them. Open positions
                    get nothing: their window ends at the frontier, so the
                    sentence would restate the timeline. */}
                {endedWindow ? (
                  <p className="px-1 text-[11px] leading-relaxed text-rb-500">
                    This position ended at block {block(endedWindow.endedAtBlock)}, and the line has been indexed to
                    block {block(endedWindow.lineFrontierBlock)} since. A position that has ended cannot be moved by a
                    later redemption, so none of the line&rsquo;s events past that block are on this timeline.
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
                legs={[event]}
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
      </div>
      <ProvInspectorLayer />
    </ProvReceiptsScope>
  );
}
