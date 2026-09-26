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

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { TimelineActivityHeader, CHAIN_TRUTH_DISPLAY_ITEMS } from "@/components/shared/timeline-toolbar";
import { ProvReceiptsScope, useReceiptRegistry, Prov } from "@/components/shared/provenance";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { boundaryFromLimit } from "@/lib/shared/timeline-boundary";
import { useWalletContext } from "@/components/nav/wallet-context";
import { formatCompact, shortAddr } from "@/lib/shared/format-event";
import { explorerUrl, type ChainId } from "@/lib/shared/chains";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isAlchemistEvent } from "@/lib/shared/types/event-shape";
import { AlchemixEventCard } from "@/components/protocol/alchemix/alchemix-event-card";
import { computeAlchemixEconomics } from "@/lib/alchemix/economics";
import {
  liveFigureProv,
  servedFigureProv,
  underlyingProv,
  usdProv,
  type AlchemixCoords,
} from "@/lib/alchemix/event-provenance";
import type { AlchemixDeployment } from "@/lib/alchemix/lines";
import type {
  AlchemixAmountAtBlock,
  AlchemixLineCoverage,
  AlchemixLiveState,
  AlchemixPositionSummary,
} from "@/types/api/alchemix";

const block = (n: number) => n.toLocaleString("en-US");

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
  /** The current figures, read at render. Null when that read did not land —
   *  and then the slot says so, because no stored figure is current. */
  initialLiveState: AlchemixLiveState | null;
}

/** An amount is stated only with the block it was settled at. Without one the
 *  page says the figure did not settle rather than printing a bare number. */
function AmountAtBlock({
  label,
  value,
  unit,
  prov,
  note,
}: {
  label: string;
  value: AlchemixAmountAtBlock | null;
  unit: string;
  prov?: Parameters<typeof Prov>[0]["info"];
  note?: string;
}) {
  if (!value || value.asOfBlock == null) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-rb-500">{label}</span>
        <span className="text-sm text-rb-500">Not settled</span>
        {note ? <span className="text-[11px] leading-snug text-rb-400">{note}</span> : null}
      </div>
    );
  }
  const { display, title } = formatCompact(value.formatted);
  const figure = (
    <span className="text-lg tabular-nums" title={title}>
      {display} {unit}
    </span>
  );
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-rb-500">{label}</span>
      {prov ? (
        <Prov info={prov} value={String(value.formatted)} symbol={unit}>
          {figure}
        </Prov>
      ) : (
        figure
      )}
      <span className="text-[11px] tabular-nums text-rb-500">at block {block(value.asOfBlock)}</span>
      {note ? <span className="text-[11px] leading-snug text-rb-400">{note}</span> : null}
    </div>
  );
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
  initialLiveState,
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

  const coords: AlchemixCoords = useMemo(
    () => ({ chainId, lineKey, tokenId }),
    [chainId, lineKey, tokenId],
  );

  const alchemistEvents = useMemo(() => events.filter(isAlchemistEvent), [events]);
  const olderCount = totalEvents != null ? Math.max(0, totalEvents - alchemistEvents.length) : 0;
  const tl = useTimelineEvents(alchemistEvents, {
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
      computeAlchemixEconomics(tl.sortedEvents, {
        syntheticSymbol: sym,
        mytSymbol,
        currentCollateral: live?.collateral.formatted ?? position.figures.collateral?.formatted ?? null,
        currentDebt: live?.debt?.formatted ?? position.figures.debt?.formatted ?? null,
        windowed: olderCount > 0,
        coords,
      }),
    [tl.sortedEvents, sym, mytSymbol, live, position.figures, olderCount, coords],
  );

  const collateral = position.figures.collateral;
  const underlying = collateral?.underlying ?? null;
  const usd = collateral?.usd ?? null;
  const dlb = position.figures.derivedLowerBound;

  return (
    <ProvReceiptsScope registry={registry}>
      <div className="space-y-6 py-8">
        <DetailTopRow session={deployment.session} wallet={position.owner} />

        {/* ── Who and what ──────────────────────────────────────────────── */}
        <header className="space-y-2">
          <h1 className="text-xl font-medium">
            {position.lineDisplayName} position {tokenId}
          </h1>
          <p className="text-sm text-rb-500">
            {position.chainName ?? `chain ${chainId}`} · {position.status === "unknown" ? "no current reading" : position.status}
            {position.owner ? (
              <>
                {" · held now by "}
                <Link href={`/address/${position.owner}`} className="underline underline-offset-4">
                  {shortAddr(position.owner)}
                </Link>
              </>
            ) : null}
          </p>
          {/* Rule 5, said outright rather than left to be inferred. */}
          <p className="text-[11px] leading-relaxed text-rb-500">
            This position is a token that can be sold. It can change hands without closing, so the address above is who
            holds it now and need not be who did any of what is below.
          </p>
        </header>

        {/* ── The current figures: one reading, one block ───────────────── */}
        <section className="space-y-3 rounded-lg border border-rb-200 p-4 dark:border-rb-800">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium">Now</h2>
            {live ? (
              <span className="text-[11px] tabular-nums text-rb-500">
                one reading at block{" "}
                <a
                  href={explorerUrl(chainId as ChainId, "block", live.asOfBlock)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4"
                >
                  {block(live.asOfBlock)}
                </a>
              </span>
            ) : null}
          </div>
          {live ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <AmountAtBlock
                label="Debt"
                value={live.debt ? { ...live.debt, asOfBlock: live.asOfBlock } : null}
                unit={sym}
                prov={liveFigureProv("Debt", sym, live.debt?.raw ?? null, live.asOfBlock, coords)}
              />
              <AmountAtBlock
                label="Collateral"
                value={{ ...live.collateral, asOfBlock: live.asOfBlock }}
                unit={live.collateral.mytSymbol ?? mytSymbol}
                prov={liveFigureProv("Collateral", mytSymbol, live.collateral.raw, live.asOfBlock, coords)}
                note={
                  live.collateral.underlying
                    ? `${formatCompact(live.collateral.underlying.formatted).display} ${live.collateral.underlying.symbol ?? "underlying"}${
                        live.collateral.usd ? ` · $${formatCompact(live.collateral.usd.usd).display}` : ""
                      }`
                    : "No share price in hand, so no figure for the asset underneath."
                }
              />
              {/* Rule 1. Its own slot, its own block, added to nothing. */}
              <AmountAtBlock
                label="Set aside for repayment"
                value={live.earmarked ? { ...live.earmarked, asOfBlock: live.asOfBlock } : null}
                unit={sym}
                prov={liveFigureProv("Set aside for repayment", sym, live.earmarked?.raw ?? null, live.asOfBlock, coords)}
                note="It grows every block, so this is true at that block and at no other."
              />
            </div>
          ) : (
            <p className="text-sm text-rb-500">
              {livePending
                ? "Reading the position now…"
                : "The current figures did not come back. Nothing stored is put in their place: the amount set aside for repayment grows every block, so no figure taken earlier is the figure now."}
            </p>
          )}
        </section>

        {/* ── What the index holds, and under which grade ────────────────── */}
        <section className="space-y-3 rounded-lg border border-rb-200 p-4 dark:border-rb-800">
          <h2 className="text-sm font-medium">As this explorer last settled it</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <AmountAtBlock
              label="Debt"
              value={position.figures.debt}
              unit={sym}
              prov={servedFigureProv(
                "Debt",
                sym,
                position.figures.debt?.raw ?? null,
                position.figures.debt?.asOfBlock ?? null,
                position.figures.grade,
                coords,
              )}
            />
            <AmountAtBlock
              label="Collateral"
              value={collateral}
              unit={mytSymbol}
              prov={servedFigureProv(
                "Collateral",
                mytSymbol,
                collateral?.raw ?? null,
                collateral?.asOfBlock ?? null,
                position.figures.grade,
                coords,
              )}
            />
            <AmountAtBlock
              label="Set aside for repayment"
              value={position.figures.earmarked}
              unit={sym}
              prov={servedFigureProv(
                "Set aside for repayment",
                sym,
                position.figures.earmarked?.raw ?? null,
                position.figures.earmarked?.asOfBlock ?? null,
                position.figures.grade,
                coords,
              )}
              note="The last reading taken. It is not this position's figure now."
            />
          </div>

          {/* The asset underneath the shares, with BOTH blocks — the share
              count and the share price need not have been read together. */}
          {underlying ? (
            <p className="text-[11px] leading-relaxed text-rb-500">
              Those shares are{" "}
              <Prov
                info={underlyingProv(
                  underlying.symbol ?? "the asset underneath",
                  underlying.raw,
                  underlying.decimals,
                  collateral?.asOfBlock ?? null,
                  underlying.sharePriceRaw,
                  underlying.sharePriceAsOfBlock,
                  coords,
                )}
                value={String(underlying.formatted)}
                symbol={underlying.symbol ?? undefined}
              >
                <span className="tabular-nums">
                  {formatCompact(underlying.formatted).display} {underlying.symbol ?? ""}
                </span>
              </Prov>
              {underlying.sharePriceAsOfBlock != null ? (
                <> at the share price read at block {block(underlying.sharePriceAsOfBlock)}</>
              ) : (
                <> at a share price with no block stated</>
              )}
              {usd ? (
                <>
                  {", worth "}
                  <Prov
                    info={usdProv(underlying.symbol ?? "the asset underneath", usd.pricePerUnit, usd.priceSource, usd.pricedAt)}
                    value={String(usd.usd)}
                  >
                    <span className="tabular-nums">${formatCompact(usd.usd).display}</span>
                  </Prov>
                </>
              ) : null}
              .
            </p>
          ) : (
            // Rule 6 of the protocol's own shape: the share price lives only on
            // a reading of the position. With no reading there is no price, so
            // there is no figure for the asset underneath — and none is shown,
            // rather than a zero.
            <p className="text-[11px] leading-relaxed text-rb-500">
              No share price has been read for this position, so what those shares are worth in the asset underneath is
              not stated here.
            </p>
          )}

          {/* Rule 3. The route's own words for this line's grade. */}
          <p className="text-xs leading-relaxed text-rb-600 dark:text-rb-400">{position.figures.gradeReason}</p>

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
            <p className="text-[11px] leading-relaxed text-rb-400">
              This line has {coverage.redemptionCount === 0 ? "had no redemption" : `had ${coverage.redemptionCount} redemptions`}
              {coverage.firstRedemptionBlock != null ? `, the first at block ${block(coverage.firstRedemptionBlock)}` : ""}
              {coverage.indexedToBlock != null ? `, and is covered here to block ${block(coverage.indexedToBlock)}` : ""}.
              {coverage.unsweptRedemptions > 0
                ? ` ${coverage.unsweptRedemptions} of them have no reading taken past them yet, so the figures above do not cover every point the debt could have stepped.`
                : ""}
            </p>
          ) : null}

          <Link href={`${deployment.basePath}/lines`} className="inline-block text-xs underline underline-offset-4">
            How each line answers
          </Link>
        </section>

        {/* ── Lifetime flows ─────────────────────────────────────────────── */}
        {economics ? (
          <ChainTruthTower data={economics.data} title="Lifetime flows" />
        ) : olderCount > 0 ? (
          <p className="rounded-lg border border-dashed border-rb-300/50 p-4 text-[11px] leading-relaxed text-rb-500 dark:border-rb-700/50">
            This position has more events than the page draws, so no lifetime totals are given: a total over part of a
            life would carry a label it has not earned.
          </p>
        ) : null}

        {/* ── The timeline ───────────────────────────────────────────────── */}
        <ChainTruthTimeline
          persistKeyPrefix="alchemix-v3"
          closed={position.status === "closed"}
          tl={tl}
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
            lineScopedNote ? (
              <p className="px-1 text-[11px] leading-relaxed text-rb-500">{lineScopedNote}</p>
            ) : undefined
          }
          renderCard={(event, meta) => {
            if (!isAlchemistEvent(event)) return null;
            return (
              <AlchemixEventCard
                event={event}
                mytSymbol={mytSymbol}
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
