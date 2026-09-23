"use client";

// The two chain reads behind every Morpho Blue Base detail page, as one hook.
// ----------------------------------------------------------------------------
// Both the wallet page and the position page beneath it are fed by the same
// two wallet-scoped reads — there is no per-market endpoint, and a position's
// history is a slice of the wallet's sweep. The reads, and the verdicts drawn
// from them, live here so the two pages cannot drift in what they claim:
//
//   1. THE SLOTS. The singleton is asked about all censused markets at once
//      (lib/sources/chain/morpho-wallet) and answers with every market the
//      wallet holds something in NOW — live debt, oracle, health verdict.
//      Fast, and enough to paint the cards.
//   2. THE HISTORY. Every singleton event the wallet has ever been the owner
//      of, from the contract's first block, replayed per market — from the
//      index when it vouches for the whole life (lib/sources/api/
//      morpho-base-timeline, a few hundred ms), swept from the singleton's
//      logs otherwise (lib/sources/chain/morpho-blue-events, 1-15 s). It is
//      what knows the history: principal, peaks, liquidations, the markets
//      the wallet has since left.
//
// A position the slots hold is one the sweep built, so when the sweep read
// every block the two lists agree — and the replayed shares equal the slots
// to the wei, checked per position rather than assumed. When it did not
// (a horizon, a hole, an endpoint that would not answer), the pages fall back
// to the slot-only cards for the present, draw whatever history was read,
// and state under each list exactly what was not — never a principal or an
// "all time" over a history that was not finished.

import { useEffect, useMemo, useState } from "react";

import { ChainTimelineUnavailable } from "@/lib/api/fetch-chain-timeline";
import { fetchMorphoBaseTimeline, type MorphoChainTimelineResponse } from "@/lib/api/fetch-morpho-base-timeline";
import type { MorphoChainPositionResponse } from "@/lib/api/fetch-morpho-position";
import { fetchMorphoBaseWallet, type MorphoWalletChainResponse } from "@/lib/api/fetch-morpho-wallet";
import type { CaptureSource } from "@/lib/shared/capture-source";
import { rehydrateChainTimelineWire } from "@/lib/shared/timeline-wire";

export type MorphoBaseTimelineState = "loading" | "ready" | "unavailable" | "failed";

export interface MorphoBaseWalletReads {
  /** The slot read; null until it answers. */
  data: MorphoWalletChainResponse | null;
  /** True while the slot read is in flight — the page's skeleton state. */
  loading: boolean;
  /** The slot read's failure, stated and stepped past (the history stands alone). */
  error: string | null;
  timeline: MorphoChainTimelineResponse | null;
  timelineState: MorphoBaseTimelineState;
  /** The sweep read every block from the singleton's first — the only case
   *  the shared card and the tower's "all time" are entitled to. */
  sweptClean: boolean;
  /** Where the history came from — the index when it vouched for the whole
   *  life, the live sweep otherwise (the route says which in
   *  `coverage.source`). The pages hand it to CaptureSourceProvider so every
   *  receipt's custody line names the right one. "sweep" until the history
   *  has answered. */
  captureSource: CaptureSource;
  /** The live read per market (lowercased id), for a section to marry with its replay. */
  chainByMarket: Map<string, MorphoChainPositionResponse>;
  /** Markets the slots hold that the sweep saw no event for — should be empty
   *  after a whole sweep; rendered rather than assumed empty. */
  unswept: MorphoChainPositionResponse[];
  /** Never touched the singleton: both reads asked, both answered nothing. */
  untouched: boolean;
  /** Holds nothing now, with no whole history to say otherwise. */
  emptyNow: boolean;
}

/**
 * `seedSlots` and `seedTimeline` are the two reads done on the SERVER
 * (lib/morpho-base/position-page-data.ts). Given the slots, this hook makes
 * no slot request — the cards are painted in the first document. Given the
 * history — present only when the index vouched for the whole life, in the
 * route's own wire shape — it makes no history request either, and the
 * timeline, the tower and the whole-life cards are in the first document
 * too. Without it the history is fetched here as it always was, and the
 * route sweeps the singleton's logs if the index still cannot vouch.
 */
export function useMorphoBaseWalletReads(
  wallet: string | undefined,
  seedSlots?: MorphoWalletChainResponse | null,
  seedTimeline?: unknown | null,
): MorphoBaseWalletReads {
  const slotsSeeded = seedSlots != null;
  const [data, setData] = useState<MorphoWalletChainResponse | null>(seedSlots ?? null);
  const [loading, setLoading] = useState(!slotsSeeded);
  const [error, setError] = useState<string | null>(null);

  // Rehydrated through the same function the fetch client runs on a response
  // body, so a seeded history and a fetched one are the same object.
  const timelineSeeded = seedTimeline != null;
  const [timeline, setTimeline] = useState<MorphoChainTimelineResponse | null>(() =>
    seedTimeline != null ? (rehydrateChainTimelineWire(seedTimeline) as MorphoChainTimelineResponse) : null,
  );
  const [timelineState, setTimelineState] = useState<MorphoBaseTimelineState>(timelineSeeded ? "ready" : "loading");

  // ── 1. The slots ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (slotsSeeded || !wallet) return;
    let cancelled = false;
    setLoading(true);
    fetchMorphoBaseWallet({ wallet })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(d.chainStale ? "The sweep of the markets failed — reload to retry." : null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load the positions");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [wallet, slotsSeeded]);

  // ── 2. The history ────────────────────────────────────────────────────────
  // Only when the server could not seed it. Off the critical path: it is the
  // slow read when the route has to sweep, and the present is already on
  // screen. "Could not sweep" and "swept, found nothing" are kept apart — one
  // is our failure and the other is the wallet's history.
  useEffect(() => {
    if (timelineSeeded || !wallet) return;
    let cancelled = false;
    setTimelineState("loading");
    fetchMorphoBaseTimeline(wallet)
      .then((d) => {
        if (cancelled) return;
        setTimeline(d);
        setTimelineState("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setTimelineState(e instanceof ChainTimelineUnavailable ? "unavailable" : "failed");
      });
    return () => {
      cancelled = true;
    };
  }, [wallet, timelineSeeded]);

  // "The sweep read every block of the singleton's life." Both conditions are
  // needed: no holes inside the span, AND the span reaching the contract's own
  // first block. A horizon leaves the events contiguous but the history
  // starting later than the protocol, which disqualifies a replayed principal
  // from standing as the position's and a lifetime total from "all time".
  const sweptClean =
    timelineState === "ready" &&
    (timeline?.coverage.gaps.length ?? 0) === 0 &&
    timeline?.coverage.fromDeployment === true;

  const captureSource: CaptureSource = timeline?.coverage.source === "index" ? "index" : "sweep";

  const chainByMarket = useMemo(() => {
    const m = new Map<string, MorphoChainPositionResponse>();
    for (const p of data?.positions ?? []) m.set(p.marketId.toLowerCase(), p);
    return m;
  }, [data]);

  // Shares and collateral cannot arrive without an event naming this wallet,
  // so with a whole sweep this is empty.
  const unswept = useMemo(
    () =>
      sweptClean && data && !data.chainStale
        ? data.positions.filter((p) => !timeline?.positions.some((s) => s.marketId === p.marketId.toLowerCase()))
        : [],
    [sweptClean, data, timeline],
  );

  // Silence is evidence of absence only when someone listened: both reads
  // asked, the log sweep whole, both answered nothing.
  const untouched =
    data != null &&
    !data.chainStale &&
    data.positionsFound === 0 &&
    sweptClean &&
    (timeline?.positions.length ?? 0) === 0;

  const emptyNow = data != null && !data.chainStale && data.positionsFound === 0 && !untouched;

  return {
    data,
    loading,
    error,
    timeline,
    timelineState,
    sweptClean,
    captureSource,
    chainByMarket,
    unswept,
    untouched,
    emptyNow,
  };
}
