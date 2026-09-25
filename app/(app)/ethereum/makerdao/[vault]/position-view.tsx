"use client";

// MakerDAO vault detail — uplifted to reference depth: the 3-section anatomy
// (position card with Explanation narration + CR strip + compact runway,
// Economics tower, Activity timeline). Every rendered figure is a chain read
// or Maker's own algebra over chain reads (chain-derived) — the liquidation
// price is the Vat safety line rearranged for price, machine-verified in
// scripts/verify-makerdao-chain.mjs. Provenance is provided in place: the
// position card and the economics tower each carry a receipts pane.
//
// The position card reads LIVE vault state via eth_call (Vat.urns slots +
// Spotter/Jug ilk params) — the most literal chain read — and falls back to
// the replay summary if the RPC read is unavailable; the risk surfaces then
// decline rather than guess (the replay can't supply mat/duty/dust).

import { useCallback, useEffect, useMemo, useState } from "react";
import { DetailBodySkeleton } from "@/components/shared/detail-body-skeleton";
import dynamic from "next/dynamic";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isMakerDAOEvent } from "@/lib/shared/types/event-shape";
import type { MakerVaultSummary } from "@/lib/sources/api/makerdao-vaults";
import type { MakerVaultState } from "@/lib/sources/chain/makerdao-position";
import { fetchMakerVaults } from "@/lib/api/fetch-makerdao-vaults";
import { fetchMakerTimeline } from "@/lib/api/fetch-makerdao-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import {
  lifetimeFiguresKnown,
  TIMELINE_WINDOW_EVENTS,
  WHOLE_HISTORY,
  type TimelineOpeningBalance,
  type TimelineWindow,
} from "@/lib/shared/timeline-opening-balance";
import { exportScopeNote, markdownHistoryScope } from "@/lib/shared/markdown-history";
import { TimelineActivityHeader } from "@/components/shared/timeline-toolbar";
import { useTimelineEvents } from "@/hooks/useTimelineEvents";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { MAKERDAO_LIQUIDATION_RUNS } from "@/lib/makerdao/timeline-runs";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { MakerDAOEventCard } from "@/components/protocol/makerdao/makerdao-event-card";
import {
  MakerVaultCard,
  viewFromSummary,
  type MakerVaultView,
} from "@/components/protocol/makerdao/makerdao-vault-card";
import { MakerdaoRiskSlot } from "@/components/protocol/makerdao/makerdao-risk-slot";
import {
  MakerdaoPositionExplanation,
  MakerdaoClosedPositionExplanation,
} from "@/components/protocol/makerdao/makerdao-position-explanation";
import { ChainTruthTower } from "@/components/shared/chain-truth-tower";
import { computeMakerEconomics, makerLifetimeWithOpening } from "@/lib/makerdao/economics";
import { makerdaoEconomicsExplanation, makerdaoEconomicsContent } from "@/lib/makerdao/economics-explanation";
import { summariseExternalActors, withOpeningActors } from "@/lib/shared/external-actor";
import { fetchMakerRateLog, type MakerRateLogResponse } from "@/lib/api/fetch-makerdao-rate-log";
import { liveMakerRateStepNote, makerRateStepNotesFor } from "@/lib/makerdao/market-notes";
import type { MarketNote } from "@/lib/shared/market-note";

// Lazy: the export path (dropdown UX + Markdown serializer + CSV builder) is
// one chunk off the initial bundle, mirroring the V4 spoke page.
const MakerdaoExportMenu = dynamic(
  () => import("@/components/protocol/makerdao/makerdao-export-menu").then((m) => m.MakerdaoExportMenu),
  { ssr: false },
);

/** Merge the live chain state (authoritative ink/art/debt) with the replay
 *  summary (status / liquidated flag, which the slot read can't infer). */
function mergeView(chain: MakerVaultState | null, summary: MakerVaultSummary | null): MakerVaultView | null {
  if (chain) {
    return {
      cdpId: chain.cdpId,
      urn: chain.urn,
      ilk: chain.ilk,
      collateralSymbol: chain.collateralSymbol,
      owner: chain.owner,
      status: summary?.status ?? (chain.ink > 0 || chain.art > 0 ? "open" : "closed"),
      ink: chain.ink,
      art: chain.art,
      rate: chain.rate,
      debtDai: chain.debtDai,
      priceUsd: chain.priceUsd,
      collateralUsd: chain.collateralUsd,
      // Peak is a whole-life aggregate the slot read can't infer — carry it from
      // the replay summary; fall back to the current live values.
      peakInk: summary?.peak.collateral ?? chain.ink,
      peakDebtDai: summary?.peak.debtDai ?? chain.debtDai,
      eventCount: summary?.activity.eventCount ?? 0,
      txCount: summary?.activity.txCount ?? 0,
      lastActivityAt: summary?.activity.lastEventAt ?? null,
      everLiquidated: summary?.everLiquidated ?? false,
      source: "chain",
      atBlock: chain.atBlock || undefined,
      lse: chain.lse || (summary?.lse ?? false),
      // Live-overlay-only risk facts (runway / CR strip / fee captions).
      matRatio: chain.matRatio,
      liquidationPriceUsd: chain.liquidationPriceUsd,
      stabilityFeeApr: chain.stabilityFeeApr,
      dustDai: chain.dustDai,
      lineDai: chain.lineDai,
      ilkDebtDai: chain.ilkDebtDai,
    };
  }
  return summary ? viewFromSummary(summary) : null;
}

interface MakerVaultViewProps {
  /** A cdp id, or a urn ADDRESS for a LockStake engine urn (cdp-less). */
  vault: string;
  /** The index row. */
  initialSummary: MakerVaultSummary | null;
  /** The Vat's own urn slots, read on the server BESIDE the row — the face
   *  figures come from the merge of the two, so seeding one without the other
   *  would render a provisional vault and then change its numbers. `null` is a
   *  failed Vat read: the chain-derived lines are absent rather than wrong. */
  initialChain: MakerVaultState | null;
  /** `null` means the server could not read the tail; the effect below then
   *  reads it exactly as this page always did. An EMPTY array is a real answer
   *  — a vault with no captured events — and seeds. */
  initialEvents: BaseActivityEvent[] | null;
  initialCutoffBlock: number | null;
  initialOpening: TimelineOpeningBalance | null;
}

// Named ...DetailView, not MakerVaultView: that name is already the imported
// view TYPE this component holds in state.
export default function MakerVaultDetailView({
  vault,
  initialSummary,
  initialChain,
  initialEvents,
  initialCutoffBlock,
  initialOpening,
}: MakerVaultViewProps) {
  // Keyed on the timeline, not the row: a vault the index has never seen is a
  // real answer the server can seed, and its `initialSummary` is null.
  const seeded = initialEvents != null;
  const [view, setView] = useState<MakerVaultView | null>(() => mergeView(initialChain, initialSummary));
  const [events, setEvents] = useState<BaseActivityEvent[]>(initialEvents ?? []);
  // The checkpoint model. The timeline fetch asks for a WINDOW of the most
  // recent events; on a vault that needs one, the response names the block
  // the window opened at and everything below it arrives as a declared opening
  // balance from the /summary twin. On a vault that does not — the
  // overwhelming majority — `cutoffBlock` comes back null, no second request
  // is made and the page is byte-for-byte what it was.
  const [cutoffBlock, setCutoffBlock] = useState<number | null>(initialCutoffBlock);
  const [opening, setOpening] = useState<TimelineOpeningBalance | null>(initialOpening);
  const [openingFailed, setOpeningFailed] = useState(false);
  const [loading, setLoading] = useState(!seeded);
  // The ilk's own stability-fee history, fetched once the timeline has named
  // the ilk. Nothing on this page depends on it: a null rate log simply means
  // no rate-step notes (fetchMakerRateLog fails open), never a page that
  // states a fee it could not confirm.
  const [rateLog, setRateLog] = useState<MakerRateLogResponse | null>(null);
  // The live chain read, kept beside `view` because the merged view drops the
  // fields the live note's later end needs (the head block's own timestamp)
  // and because a vault the index has never seen still has one.
  const [chainState, setChainState] = useState<MakerVaultState | null>(initialChain);
  const [chainSettled, setChainSettled] = useState(seeded);
  // Standing display framing (risk view) — a global preference, so the reader's
  // choice on one vault carries to the next.

  // Mount. A seeded view already holds the tail and leaves this alone; an
  // unseeded one reads it exactly as this page always did.
  useEffect(() => {
    if (seeded) return;
    (async () => {
      setLoading(true);
      try {
        // The [vault] param is a cdp id, or a urn ADDRESS for LockStake engine
        // urns (cdp-less, decision 0013) — the summary lookup must use the
        // matching filter (a non-numeric cdpId is ignored server-side and
        // would silently return the wrong vault's page-1 row).
        const isUrnAddr = /^0x[0-9a-fA-F]{40}$/.test(vault);
        const [chainRes, vData, tData] = await Promise.all([
          fetch(`/api/chain/makerdao/vault/${encodeURIComponent(vault)}`).catch(() => null),
          fetchMakerVaults(isUrnAddr ? { urn: vault, limit: 1 } : { cdpId: vault, limit: 1 }),
          fetchMakerTimeline(vault, { recent: TIMELINE_WINDOW_EVENTS }),
        ]);
        const chain: MakerVaultState | null = chainRes && chainRes.ok ? (await chainRes.json()).state : null;
        const summary: MakerVaultSummary | null = vData.data[0] ?? null;
        setView(mergeView(chain, summary));
        setChainState(chain);
        setEvents(tData.events ?? []);
        setCutoffBlock(tData.cutoffBlock ?? null);
      } finally {
        setChainSettled(true);
        setLoading(false);
      }
    })();
  }, [vault, seeded]);

  // The opening balance — the second of the windowed page's two requests, and
  // deliberately not merged into the first: the rows land and the list is
  // readable while this is in flight, and every whole-history figure declares
  // itself unknown until it arrives rather than stating the window's
  // arithmetic as a lifetime. A failure is a stated failure for the same
  // reason.
  useEffect(() => {
    // A seeded opening balance is already the answer — only a server-side
    // failure leaves it null with a cutoff block set, which is exactly the
    // case this still covers.
    if (opening != null) return;
    setOpeningFailed(false);
    if (cutoffBlock == null) return;
    const ac = new AbortController();
    fetchTimelineOpeningBalance({
      path: `/api/makerdao/vault/${encodeURIComponent(vault)}/timeline/summary`,
      params: {},
      cutoffBlock,
      signal: ac.signal,
    })
      .then((data) => setOpening(data))
      .catch((err) => {
        if ((err as { name?: string })?.name !== "AbortError") setOpeningFailed(true);
      });
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault, cutoffBlock]);

  const historyWindow = useMemo<TimelineWindow>(() => {
    if (cutoffBlock == null) return WHOLE_HISTORY;
    if (opening) return { state: "ready", cutoffBlock, opening };
    return { state: openingFailed ? "failed" : "pending", cutoffBlock, opening: null };
  }, [cutoffBlock, opening, openingFailed]);

  // Memoized: the actor summary below (and the timeline hook) key off this
  // array's identity, so re-filtering on every render would recompute both.
  const makerEvents = useMemo(() => events.filter(isMakerDAOEvent), [events]);

  // The ilk names itself on the vault's own rows, so the rate log can only be
  // asked for once the timeline has landed — and it is reset on a vault change
  // so a second vault of a DIFFERENT ilk can never render notes off the first
  // ilk's fees while its own fetch is in flight.
  const ilk = view?.ilk ?? makerEvents[0]?.context.data.ilk ?? null;
  useEffect(() => {
    setRateLog(null);
    if (!ilk) return;
    const ac = new AbortController();
    fetchMakerRateLog(ilk, ac.signal).then((log) => {
      if (!ac.signal.aborted) setRateLog(log);
    });
    return () => ac.abort();
  }, [vault, ilk]);

  const market = useMemo(
    () => (ilk && rateLog ? { ilk, collateralSymbol: view?.collateralSymbol ?? ilk, jug: rateLog.jug } : null),
    [ilk, rateLog, view?.collateralSymbol],
  );
  const tl = useTimelineEvents(makerEvents, {
    storageKey: `makerdao-${vault}`,
    protocolKey: "makerdao-vaults",
    window: historyWindow,
  });

  // ⚠️ On a windowed page every lifetime surface must read the MERGED history,
  // not the window's. `lifetimeEvents` is undefined until the opening balance
  // is known, and the tower treats an absent event list as "no lifetime layer"
  // rather than as an empty one — so it states nothing while it cannot state
  // the whole, which is the only correct answer between the two requests.
  const lifetimeKnown = lifetimeFiguresKnown(historyWindow);
  const lifetimeEvents = lifetimeKnown ? makerEvents : undefined;
  const precomputedLifetime = useMemo(() => makerLifetimeWithOpening(makerEvents, opening), [makerEvents, opening]);

  // The CSV is the export whose purpose IS the rows, so on a windowed page it
  // fetches the whole history at click time rather than handing over the
  // window under a whole-history filename.
  const fetchAllHistory = useCallback(async () => {
    const res = await fetchMakerTimeline(vault);
    const served = (res.events ?? []).filter(isMakerDAOEvent);
    return {
      events: served,
      missing: Math.max((res.totalEvents ?? served.length) - served.length, 0),
    };
  }, [vault]);

  // Who executed this vault's events — the SAME two-fact verdict each event
  // card renders on its spine (txTo plays the party-param role), reduced over
  // the whole history so the Explanation can state it once. Judged against the
  // owner IN FORCE at each event's block, exactly as the cards do: the current
  // owner may postdate a give.
  const externalActivity = useMemo(
    () =>
      summariseExternalActors(
        makerEvents.map((e) => ({
          txFrom: e.context.data.txFrom,
          poolCaller: e.context.data.txTo,
          wallet: e.context.data.ownerAt ?? e.wallet,
        })),
      ),
    [makerEvents],
  );

  // On a windowed page the opening balance's own split is added: rails-server
  // restates the same era-aware two-fact verdict over the base tables — the
  // owner in force at each event, gated on a resolved EOA — so both halves
  // judge on the same fact and never count one event twice.
  const externalActivityWithOpening = useMemo(
    () => withOpeningActors(externalActivity, opening?.actors, opening?.totalEvents ?? 0),
    [externalActivity, opening],
  );

  // Market notes: the stretches between two of this vault's own touches where
  // the ilk's stability fee moved at least a percentage point. Both ends are
  // this vault's own rows, but the fee is NOT on them — it is the ilk's last
  // confirmed rate set at or before each, out of the rate log above.
  const notes = useMemo<MarketNote[]>(
    () =>
      market
        ? [...makerRateStepNotesFor(tl.sortedEvents, rateLog, market)].sort((a, b) => a.to.block - b.to.block)
        : [],
    [tl.sortedEvents, rateLog, market],
  );

  // The live note: this vault's own newest rated row against the Jug's own fee
  // read at the head. Open vaults only, and only once the chain overlay has
  // answered — it is the sole source of both the live fee and the block it was
  // read at. Unthresholded, so a vault whose fee has not moved since its last
  // touch still says so (vault 28699's own live note is exactly 0.00 pp).
  const vaultOpen = view?.status === "open";
  const liveNotes = useMemo<MarketNote[]>(() => {
    if (!market || !vaultOpen) return [];
    if (!chainState || chainState.stabilityFeeApr == null || !(chainState.atBlock > 0)) return [];
    const note = liveMakerRateStepNote(tl.sortedEvents, rateLog, market, {
      aprPct: chainState.stabilityFeeApr,
      block: chainState.atBlock,
      timestamp: chainState.blockTimestamp,
    });
    return note ? [note] : [];
  }, [market, vaultOpen, chainState, tl.sortedEvents, rateLog]);

  // While the vault is open and either the chain read or the rate log is still
  // in flight, the timeline holds the live slot rather than settling without
  // one — a live note that appears a beat late reads as a page still loading,
  // not as a fee that has only just started existing.
  const liveNotesPending = vaultOpen && (!chainSettled || (ilk != null && rateLog == null));

  return (
    <div className="py-8 space-y-6">
      <DetailTopRow
        session="makerdao"
        assets={
          view && view.status === "open" && view.priceUsd != null && view.priceUsd > 0
            ? [{ symbol: view.collateralSymbol, price: view.priceUsd }]
            : []
        }
      >
        {view && (
          <MakerdaoExportMenu
            view={view}
            events={makerEvents}
            notes={notes}
            liveNotes={liveNotes}
            csvFilename={`makerdao-${vault}-activity.csv`}
            fetchAllEvents={historyWindow.state === "whole" ? undefined : fetchAllHistory}
            history={markdownHistoryScope(historyWindow, makerEvents)}
            scopeNote={exportScopeNote(historyWindow, makerEvents, "this vault's whole history")}
          />
        )}
      </DetailTopRow>

      {loading ? (
        <DetailBodySkeleton />
      ) : (
        <>
          {view && (
            <MakerVaultCard
              v={view}
              receipts
              viewHref={tl.viewHref}
              // The risk slot rides the card's heading-button row (the Aave V3
              // treatment): the Display menu plus the chosen risk picture —
              // liquidation runway (default) or the collateral-ratio card.
              // Whatever it draws is on the card face and in the card's receipts
              // scope, so the Provenance list stays 1:1 with the face figures.
              // Mounts only when the live overlay landed and the vault is open.
              rowExtra={view.source === "chain" && view.status === "open" ? <MakerdaoRiskSlot v={view} /> : undefined}
              // The Explanation is now pure prose about those same face figures
              // (the 3-section page anatomy: card → economics → timeline). The
              // CR strip is absorbed into the risk slot above.
              // A terminal vault narrates from the replay + the timeline
              // already on the page (no chain overlay needed); the open pane
              // still needs the live overlay for the ilk parameters and
              // declines without it.
              explanation={
                view.status !== "open" ? (
                  <MakerdaoClosedPositionExplanation v={view} events={makerEvents} />
                ) : view.source === "chain" ? (
                  <MakerdaoPositionExplanation v={view} externalActivity={externalActivityWithOpening} />
                ) : undefined
              }
            />
          )}
          {view &&
            (() => {
              const towerData = computeMakerEconomics(view, lifetimeEvents ?? [], precomputedLifetime);
              return (
                <ChainTruthTower
                  data={towerData}
                  explanation={makerdaoEconomicsExplanation(towerData)}
                  learnMore={makerdaoEconomicsContent()}
                />
              );
            })()}
          <ChainTruthTimeline
            csvExportCeiling={null}
            // Matches `MakerdaoEventCard`'s own `persistKey={`makerdao:${event.id}`}` —
            // lets pinned mode (the per-event share route) force a landed
            // card's detail panel open on its first mount.
            persistKeyPrefix="makerdao"
            closed={view?.status !== "open"}
            tl={tl}
            notes={notes}
            liveNotes={liveNotes}
            liveNotesPending={liveNotesPending}
            runs={MAKERDAO_LIQUIDATION_RUNS}
            toolbarLeading={
              <TimelineActivityHeader
                events={tl.sortedEvents}
                closed={view?.status !== "open"}
                // When the vault actually opened, not when the window does.
                firstAt={opening?.firstTimestamp}
                tenurePending={!lifetimeFiguresKnown(historyWindow)}
              />
            }
            renderCard={(event, meta) =>
              isMakerDAOEvent(event) ? (
                <MakerDAOEventCard
                  event={event}
                  eventNumber={meta.eventNumber}
                  isFirst={meta.isFirst}
                  isLast={meta.isLast}
                />
              ) : null
            }
          />
          <ProvInspectorLayer />
        </>
      )}
    </div>
  );
}
