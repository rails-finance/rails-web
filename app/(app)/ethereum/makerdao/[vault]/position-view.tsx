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
import {
  fetchMakerTimeline,
  fetchMakerGroupedTimeline,
  type MakerGroupedTimelineResult,
} from "@/lib/api/fetch-makerdao-timeline";
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
import { useTimelineSegment } from "@/hooks/useTimelineSegment";
import { ChainTruthTimeline } from "@/components/shared/chain-truth-timeline";
import { MAKERDAO_FOLDER_REGISTER, MAKERDAO_LIQUIDATION_RUNS } from "@/lib/makerdao/timeline-runs";
import { interleaveRowPlan, servedFoldersEnabled } from "@/lib/shared/timeline-folder";
import { withFolderActors } from "@/lib/shared/timeline-folder-reductions";
import { closingPricesAt, DetailTopRow } from "@/components/shared/detail-back-row";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { MakerDAOEventCard } from "@/components/protocol/makerdao/makerdao-event-card";
import {
  MakerVaultCard,
  viewFromSummary,
  type MakerVaultView,
} from "@/components/protocol/makerdao/makerdao-vault-card";
import { MakerdaoRiskDetail } from "@/components/protocol/makerdao/makerdao-risk-slot";
import {
  MakerdaoPositionExplanation,
  MakerdaoClosedPositionExplanation,
} from "@/components/protocol/makerdao/makerdao-position-explanation";
import { LifetimeFlowsPanel } from "@/components/shared/lifetime-flows-panel";
import { LifetimeFlowsScrubber } from "@/components/shared/lifetime-flows-scrubber";
import { FlowFocusContext } from "@/components/shared/flow-focus-context";
import { MakerFlowsNote, makerdaoFlowsContent } from "@/components/protocol/makerdao/makerdao-flows-note";
import { useMakerFlows } from "@/hooks/useMakerFlows";
import type { MakerLive } from "@/lib/makerdao/flows";
import { summariseExternalActors, withOpeningActors } from "@/lib/shared/external-actor";
import { fetchMakerRateLog, type MakerRateLogResponse } from "@/lib/api/fetch-makerdao-rate-log";
import { liveMakerRateStepNote, makerRateStepNotesFor } from "@/lib/makerdao/market-notes";
import type { MarketNote } from "@/lib/shared/market-note";
import { makerTxHashOf } from "@/lib/makerdao/market-notes";
import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";
import {
  useMakerAuctions,
  useMakerIlkAt,
  useMakerMatChanges,
  useMakerTxContexts,
} from "@/lib/makerdao/use-chain-history";
import {
  MakerVaultHistoryProvider,
  makerDebtSplits,
  makerLeftoverLinks,
  makerMatSteps,
  makerOwnership,
  makerPreviousAt,
  makerTxRows,
  openedForSigner,
  sortedMakerEvents,
  type MakerMatStep,
  type MakerVaultHistory,
} from "@/lib/makerdao/vault-history";

/** How many of a vault's blocks the page reads the ilk at: the rows' price,
 *  minimum ratio and minimum debt, for the cards. Past it a row reads its own
 *  block when opened. */
const ILK_AT_PAGE_LIMIT = 60;
/** How many of the vault's newest non-ownership transactions the page reads
 *  for their sender (one route call each). */
const TX_CONTEXT_LIMIT = 40;

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
      priceCap: chain.priceCap ?? null,
      auction: chain.auction ?? null,
      lockstake: chain.lockstake ?? null,
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
  /** The grouped answer WHOLE, when the load read its history as ROWS (the
   *  default; `?folders=0` reads the flat window). Its row plan puts the
   *  folders back between the ungrouped events, and its folders carry the
   *  arithmetic the whole-history reductions read. */
  initialGrouped: MakerGroupedTimelineResult | null;
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
  initialGrouped,
}: MakerVaultViewProps) {
  // Keyed on the timeline, not the row: a vault the index has never seen is a
  // real answer the server can seed, and its `initialSummary` is null.
  const seeded = initialEvents != null;
  const [view, setView] = useState<MakerVaultView | null>(() => mergeView(initialChain, initialSummary));
  const [events, setEvents] = useState<BaseActivityEvent[]>(initialEvents ?? []);
  // The same history as ROWS (decision 0019's evening amendment): the index
  // groups this family, because every row carries the urn's own running ink
  // and art, so a folder standing for a hundred frobs leaves nothing here to
  // reconstruct. The grouped answer REPLACES the flat window: `events` holds
  // its ungrouped events and this its row plan and folders.
  const [groupedTail, setGroupedTail] = useState<MakerGroupedTimelineResult | null>(initialGrouped);
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
        // The same choice the server half made (`position-page-data.ts`): ONE
        // timeline read, in the shape the URL asked for.
        const asked = servedFoldersEnabled();
        const [chainRes, vData, flat, grouped] = await Promise.all([
          fetch(`/api/chain/makerdao/vault/${encodeURIComponent(vault)}`).catch(() => null),
          fetchMakerVaults(isUrnAddr ? { urn: vault, limit: 1 } : { cdpId: vault, limit: 1 }),
          asked ? null : fetchMakerTimeline(vault, { recent: TIMELINE_WINDOW_EVENTS }),
          asked ? fetchMakerGroupedTimeline(vault) : null,
        ]);
        const tData = grouped ?? flat;
        let chain: MakerVaultState | null = chainRes && chainRes.ok ? (await chainRes.json()).state : null;
        const summary: MakerVaultSummary | null = vData.data[0] ?? null;
        // A direct-Vat urn: the Vat read needs the ilk the index row names.
        if (isUrnAddr && !chain && summary && summary.cdpId == null && !summary.lse) {
          const directRes = await fetch(
            `/api/chain/makerdao/vault/${encodeURIComponent(vault)}?ilk=${encodeURIComponent(summary.ilk)}`,
          ).catch(() => null);
          chain = directRes && directRes.ok ? (await directRes.json()).state : null;
        }
        setView(mergeView(chain, summary));
        setChainState(chain);
        setEvents(tData?.events ?? []);
        setCutoffBlock(tData?.cutoffBlock ?? null);
        setGroupedTail(grouped);
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

  // ── What the page knows beyond the rows (lib/makerdao/vault-history.tsx) ──
  const sortedMaker = useMemo(() => sortedMakerEvents(makerEvents), [makerEvents]);
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
  // The served list as ROWS, from the same answer as `makerEvents`.
  const servedRows = useMemo(
    () => (groupedTail ? interleaveRowPlan(groupedTail.rowPlan, makerEvents) : undefined),
    [groupedTail, makerEvents],
  );
  /** The folders the index served, whole and unfiltered: the third
   *  contributor to the page's partition, which every whole-history reduction
   *  below adds to `opening + events`. */
  const servedFolders = useMemo(
    () => (servedRows ? servedRows.flatMap((row) => (row.kind === "folder" ? [row.folder] : [])) : null),
    [servedRows],
  );
  /** The oldest member any folder stands for, so a page whose oldest row is a
   *  folder still dates the vault from inside it. */
  const oldestFolderAt = useMemo(
    () =>
      servedFolders?.reduce<number | undefined>(
        (min, f) => (min == null || f.firstAt < min ? f.firstAt : min),
        undefined,
      ),
    [servedFolders],
  );

  // The rows hold the vault's whole history from its first event: no window
  // cut and no folder standing for members the page does not hold.
  const wholeRows = historyWindow.state === "whole" && !(servedFolders?.length ?? 0);
  const debtSplit = useMemo(() => makerDebtSplits(sortedMaker, wholeRows), [sortedMaker, wholeRows]);
  const rowBlocks = useMemo(() => sortedMaker.map((e) => e.blockNumber), [sortedMaker]);
  const ilkAtRead = useMakerIlkAt(ilk, rowBlocks, ILK_AT_PAGE_LIMIT);
  const grabRows = useMemo(
    () =>
      sortedMaker
        .filter((e) => e.context.data.eventType === "grab")
        .map((e) => ({ txHash: makerTxHashOf(e), urn: e.context.data.urn })),
    [sortedMaker],
  );
  const auctions = useMakerAuctions(grabRows);
  // The vault's transactions, read for who sent each and through what, and on
  // an ownership transaction who the parties are and what else ran in it
  // (lib/sources/chain/makerdao-tx-context.ts). Every ownership transaction,
  // and the newest TX_CONTEXT_LIMIT of the rest.
  const txRows = useMemo(() => makerTxRows(sortedMaker), [sortedMaker]);
  const txRequests = useMemo(() => {
    const out: { txHash: string; addresses: string[] }[] = [];
    const plain: string[] = [];
    for (const [tx, rows] of txRows) {
      const gives = rows.filter((r) => r.context.data.eventType === "give");
      if (gives.length === 0) {
        if (rows.some((r) => r.context.data.eventType === "frob")) plain.push(tx);
        continue;
      }
      const addrs = gives.flatMap((g) => [g.context.data.giveDst, g.context.data.giveCaller]);
      out.push({ txHash: tx, addresses: [...new Set(addrs.filter((a): a is string => !!a))].slice(0, 8) });
    }
    for (const tx of plain.slice(-TX_CONTEXT_LIMIT)) out.push({ txHash: tx, addresses: [] });
    return out;
  }, [txRows]);
  const txContext = useMakerTxContexts(txRequests);
  const ownership = useMemo(() => makerOwnership(sortedMaker, txContext), [sortedMaker, txContext]);
  // The ilk's minimum ratio between rows, and the governance change behind a
  // step (the Spotter's file logs between the two rows' blocks).
  const matStepsBase = useMemo(
    () => makerMatSteps(sortedMaker, ilkAtRead?.reads ?? new Map()).steps,
    [sortedMaker, ilkAtRead],
  );
  const matSpans = useMemo(
    () => [...matStepsBase.values()].map((m) => ({ from: m.fromBlock, to: m.toBlock })),
    [matStepsBase],
  );
  const matChanges = useMakerMatChanges(ilk, matSpans);
  const matSteps = useMemo(() => {
    const out = new Map<string, MakerMatStep>();
    for (const [id, m] of matStepsBase) {
      const read = matChanges.get(`${m.fromBlock}-${m.toBlock}`);
      const change = read?.changes.length ? read.changes[read.changes.length - 1] : null;
      out.set(id, { from: m.from, to: m.to, previousAt: m.previousAt, change });
    }
    return out;
  }, [matStepsBase, matChanges]);
  const vaultHistory = useMemo<MakerVaultHistory>(
    () => ({
      ilkAt: ilkAtRead?.reads ?? new Map(),
      auctions,
      leftover: makerLeftoverLinks(sortedMaker, auctions),
      debtSplit,
      previousAt: makerPreviousAt(sortedMaker),
      ownership: ownership.steps,
      txRows,
      txContext,
      matSteps,
      owners: ownership.owners,
      owner: view?.owner?.toLowerCase() ?? null,
    }),
    [ilkAtRead, auctions, sortedMaker, debtSplit, ownership, txRows, txContext, matSteps, view?.owner],
  );
  // The card's debt split, from the newest row's.
  const lastSplit = sortedMaker.length ? debtSplit.get(sortedMaker[sortedMaker.length - 1].id) : undefined;
  // The most the vault owed at any event, the fee accrued to that event
  // included: the larger of each row's debt before and after it. A
  // liquidation's debt before is what it seized against.
  const peakDebtOwed = useMemo(() => {
    if (!wholeRows) return null;
    let peak = 0;
    for (const e of sortedMaker) {
      const d = e.context.data;
      if (d.debtAfter == null) return null;
      const after = Number(d.debtAfter);
      const before = after - (Number(d.debtChange) || 0);
      peak = Math.max(peak, after, before);
    }
    return peak;
  }, [sortedMaker, wholeRows]);
  const cardView = useMemo<MakerVaultView | null>(
    () =>
      view && !(servedFolders?.length ?? 0)
        ? {
            ...view,
            drawnDai: lastSplit?.drawnAfter ?? null,
            ...(peakDebtOwed != null && peakDebtOwed > 0 ? { peakDebtDai: peakDebtOwed } : {}),
          }
        : view,
    [view, lastSplit, servedFolders, peakDebtOwed],
  );
  // "12 events in 11 transactions": the count line and the card's counter
  // state one pair. A liquidation is the keeper's transaction, so it is named
  // beside the owner's own.
  const countDetail = useMemo(() => {
    if (!view || !wholeRows) return undefined;
    const grabs = sortedMaker.filter((e) => e.context.data.eventType === "grab").length;
    const tx = view.txCount;
    if (tx + grabs === sortedMaker.length && grabs === 0) return undefined;
    const txWord = `${tx.toLocaleString("en-US")} transaction${tx === 1 ? "" : "s"}`;
    return grabs > 0 ? `: ${txWord} and ${grabs} liquidation${grabs === 1 ? "" : "s"}` : ` in ${txWord}`;
  }, [view, wholeRows, sortedMaker]);

  // ── ONE SEGMENT OF TIME, navigated by month ─────────────────────────────
  // Decision 0019, amendments 2026-09-24 and 2026-09-25: a month the loaded
  // rows do not hold is read from the index as its segment
  // (hooks/useTimelineSegment.ts). The preload stays the page's whole-history
  // record; the timeline alone swaps.
  const { tl, segments, readFolderMembers } = useTimelineSegment({
    events: makerEvents,
    groupedTail,
    servedRows,
    servedFolders,
    opening,
    historyWindow,
    isEvent: isMakerDAOEvent,
    readGrouped: (span, signal) => fetchMakerGroupedTimeline(vault, { span, signal }),
    readFlat: (span) => fetchMakerTimeline(vault, { span }),
    folderPath: `/api/makerdao/vault/${encodeURIComponent(vault)}/timeline/folder`,
    folderParams: {},
    storageKey: `makerdao-${vault}`,
    protocolKey: "makerdao-vaults",
    // Navigated by the Lifetime flows chart's "Show timeline to": no Dates.
    dates: false,
  });

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

  // The Lifetime flows panel replays the vault's whole history
  // (lib/makerdao/flows.ts): the page's rows where they are all of it, else
  // the flat history read once (the CSV's read); a read short of the whole
  // history is a failed read.
  const flowLive = useMemo<MakerLive | null>(() => {
    if (!chainState) return null;
    const rate = Number(chainState.rate) / 1e27;
    return {
      price: chainState.priceUsd,
      ink: chainState.ink,
      debt: chainState.debtDai,
      rate: Number.isFinite(rate) && rate > 0 ? rate : null,
      feeApr: chainState.stabilityFeeApr,
    };
  }, [chainState]);
  const returnedIds = useMemo(
    () => new Set([...vaultHistory.leftover].filter(([, l]) => l.role === "in").map(([id]) => id)),
    [vaultHistory.leftover],
  );
  const flowColl = view?.collateralSymbol ?? null;
  const flowDebt = ilk ? ilkDebtSymbol(ilk) : null;
  const flows = useMakerFlows({
    ilk,
    pending: loading,
    wholeEvents: wholeRows ? makerEvents : null,
    fetchAll: fetchAllHistory,
    collSymbol: flowColl,
    debtSymbol: flowDebt,
    live: flowLive,
    liveSettled: chainSettled,
    returnedIds,
  });

  // Who executed this vault's events — the SAME two-fact verdict each event
  // card renders on its spine (txTo plays the party-param role), reduced over
  // the whole history so the Explanation can state it once. Judged against the
  // owner IN FORCE at each event's block, exactly as the cards do: the current
  // owner may postdate a give.
  const externalActivity = useMemo(
    () =>
      summariseExternalActors(
        makerEvents
          // A vault created by a contract and handed to the signer in the same
          // transaction was opened by that signer.
          .filter((e) => !(isMakerDAOEvent(e) && openedForSigner(e, txRows)))
          .map((e) => ({
            txFrom: e.context.data.txFrom,
            poolCaller: e.context.data.txTo,
            wallet: e.context.data.ownerAt ?? e.wallet,
          })),
      ),
    [makerEvents, txRows],
  );

  // On a windowed page the opening balance's own split is added: rails-server
  // restates the same era-aware two-fact verdict over the base tables — the
  // owner in force at each event, gated on a resolved EOA — so both halves
  // judge on the same fact and never count one event twice.
  //
  // The folders add theirs the same way: rails-server judges a member by the
  // route's own era-aware verdict.
  const externalActivityWithOpening = useMemo(() => {
    const withOpening = withOpeningActors(externalActivity, opening?.actors, opening?.totalEvents ?? 0);
    return servedFolders && servedFolders.length > 0 ? withFolderActors(withOpening, servedFolders) : withOpening;
  }, [externalActivity, opening, servedFolders]);

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
      debtNow: chainState.debtDai,
    });
    return note ? [note] : [];
  }, [market, vaultOpen, chainState, tl.sortedEvents, rateLog]);

  // While the vault is open and either the chain read or the rate log is still
  // in flight, the timeline holds the live slot rather than settling without
  // one — a live note that appears a beat late reads as a page still loading,
  // not as a fee that has only just started existing.
  const liveNotesPending = vaultOpen && (!chainSettled || (ilk != null && rateLog == null));

  // A closed vault's prices: the ilk's OSM price at the closing block, which
  // the index carries on grab rows only. A vault its owner closed has no read
  // there, and the dropdown is left out.
  const closing = useMemo(() => {
    if (!view || view.status === "open") return undefined;
    return closingPricesAt(makerEvents, (row) => {
      const usd = row.context.data.priceAtBlock?.usd;
      return usd != null && usd > 0 ? [{ symbol: view.collateralSymbol, price: usd }] : undefined;
    });
  }, [view, makerEvents]);

  return (
    <FlowFocusContext.Provider value={flows.focus}>
      <div className="py-8 space-y-6">
        <DetailTopRow
          session="makerdao"
          owner={{ wallet: cardView?.owner ?? view?.owner }}
          assets={
            view && view.priceUsd != null && view.priceUsd > 0
              ? [{ symbol: view.collateralSymbol, price: view.priceUsd }]
              : []
          }
          closed={view != null && view.status !== "open"}
          closing={closing}
        >
          {view && (
            <MakerdaoExportMenu
              view={view}
              events={makerEvents}
              notes={notes}
              liveNotes={liveNotes}
              csvFilename={`makerdao-${vault}-activity.csv`}
              // A folder's members are not in `makerEvents`, so a grouped page
              // reads the whole history for the CSV as a windowed one does.
              fetchAllEvents={historyWindow.state === "whole" && !servedFolders?.length ? undefined : fetchAllHistory}
              history={markdownHistoryScope(historyWindow, makerEvents, servedFolders)}
              scopeNote={exportScopeNote(historyWindow, makerEvents, "this vault's whole history", servedFolders)}
            />
          )}
        </DetailTopRow>

        {loading ? (
          <DetailBodySkeleton />
        ) : (
          <MakerVaultHistoryProvider value={vaultHistory}>
            {cardView && (
              <MakerVaultCard
                v={cardView}
                receipts
                viewHref={tl.viewHref}
                // Closed by default, remembered per viewer and vault (ui-jobs
                // 209). The price bar and the room to the ilk's minimum sit in
                // the opened layer under Collateral ratio, inside the card's
                // receipts scope, once the live overlay landed.
                disclosureKey={`makerdao:${cardView.urn.toLowerCase()}`}
                riskDetail={
                  cardView.source === "chain" && cardView.status === "open" ? (
                    <MakerdaoRiskDetail v={cardView} />
                  ) : undefined
                }
                // A terminal vault narrates from the replay + the timeline
                // already on the page (no chain overlay needed); the open pane
                // still needs the live overlay for the ilk parameters and
                // declines without it.
                explanation={
                  cardView.status !== "open" ? (
                    <MakerdaoClosedPositionExplanation v={cardView} events={makerEvents} folders={servedFolders} />
                  ) : cardView.source === "chain" ? (
                    <MakerdaoPositionExplanation v={cardView} externalActivity={externalActivityWithOpening} />
                  ) : undefined
                }
              />
            )}
            {/* Lifetime flows: the bars and the line over the vault's replay
            (lib/makerdao/flows.ts), in place of the tower (TO-DO-ui-jobs 206). */}
            {view && flowColl && flowDebt && (
              <LifetimeFlowsPanel
                scrubber={flows.timeline ? <LifetimeFlowsScrubber timeline={flows.timeline} /> : null}
                read={flows.read}
                explanation={
                  <div className="space-y-2 text-sm text-rb-500">
                    <MakerFlowsNote
                      facts={flows.facts}
                      collSymbol={flowColl}
                      debtSymbol={flowDebt}
                      ilk={view.ilk}
                      capped={(cardView ?? view).priceCap != null}
                    />
                  </div>
                }
                learnMore={makerdaoFlowsContent({ debtSym: flowDebt, ilk: view.ilk })}
              />
            )}
            <ChainTruthTimeline
              csvExportCeiling={null}
              // Matches `MakerdaoEventCard`'s own `persistKey={`makerdao:${event.id}`}` —
              // lets pinned mode (the per-event share route) force a landed
              // card's detail panel open on its first mount.
              persistKeyPrefix="makerdao"
              closed={view?.status !== "open"}
              countDetail={countDetail}
              tl={tl}
              notes={notes}
              liveNotes={liveNotes}
              liveNotesPending={liveNotesPending}
              runs={MAKERDAO_LIQUIDATION_RUNS}
              folderRegister={MAKERDAO_FOLDER_REGISTER}
              readFolderMembers={readFolderMembers}
              segments={segments}
              phoneNoteLine={MAKER_PHONE_NOTE_LINE}
              notice={<MakerSpineKey debtSym={ilkDebtSymbol(view?.ilk ?? "")} />}
              toolbarLeading={
                <TimelineActivityHeader
                  events={tl.sortedEvents}
                  folders={servedFolders}
                  closed={view?.status !== "open"}
                  // When the vault actually opened, not when the window does.
                  firstAt={opening?.firstTimestamp ?? oldestFolderAt}
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
          </MakerVaultHistoryProvider>
        )}
      </div>
    </FlowFocusContext.Provider>
  );
}

const MAKER_PHONE_NOTE_LINE = { rate: "stability fee" };

/** What the desktop spine's marks mean, once, above the first row. The phone
 *  list states each row in words. */
function MakerSpineKey({ debtSym }: { debtSym: string }) {
  return (
    <p className="hidden px-1 text-xs text-rb-500 sm:block" data-spine-key="">
      Key: <span aria-hidden>&rarr;</span> after a coin: into the vault (collateral deposited, {debtSym} repaid) ·{" "}
      <span aria-hidden>&larr;</span> before a coin: out to the owner ({debtSym} drawn, collateral withdrawn) ·{" "}
      <span aria-hidden>&#9671;</span> governance changed the stability fee (click for the note) ·{" "}
      <span className="inline-block size-2 rounded-full bg-green-500 align-middle" aria-hidden /> now
    </p>
  );
}
