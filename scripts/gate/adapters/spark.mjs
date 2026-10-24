// SparkLend — /ethereum/spark/<wallet>[?folders=0]
//
// The inputs sparkExports() is given on the page
// (app/(app)/ethereum/spark/[wallet]/position-view.tsx), read the way its
// effects read them: the positions row, ONE timeline read (grouped by
// default, the flat `recent` window on `?folders=0`), the opening balance
// below a cut, the live Pool read, the lifetime flow series, the oracle prices
// of exited reserves, and the reserve rates and head behind the market notes.

import { sparkPositionToMarkdown } from "@/lib/spark/position-to-markdown";
import { fetchSparkPositions } from "@/lib/api/fetch-spark-positions";
import { fetchSparkTimeline, fetchSparkGroupedTimeline } from "@/lib/api/fetch-spark-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import { fetchSparkPosition, fetchSparkOraclePrices } from "@/lib/api/fetch-spark-position";
import { fetchFlowSeries } from "@/lib/api/fetch-aave-v3-flow-series";
import { loadAaveFamilyReserveRates } from "@/lib/api/fetch-aave-family-reserve-rates";
import { lifetimeFiguresKnown, TIMELINE_WINDOW_ROWS, WHOLE_HISTORY } from "@/lib/shared/timeline-opening-balance";
import { interleaveRowPlan, servedFoldersFromParam } from "@/lib/shared/timeline-folder";
import { isSparkEvent } from "@/lib/shared/types/event-shape";
import { viewFromSummary } from "@/components/protocol/spark/spark-position-card";
import { computeSparkCardCaptions, unpricedSparkFlowAddresses, sparkLifetimeWithOpening } from "@/lib/spark/economics";
import { lifetimeFromSeries } from "@/lib/aave-v3/flows-timeline";
import { markdownHistoryScope } from "@/lib/shared/markdown-history";
import {
  aaveFamilyHoldings,
  aaveFamilyRateRequests,
  aaveFamilyRateStepNotesFor,
  liveAaveFamilyRateStepNotes,
  stableRateReserves,
} from "@/lib/aave-v3/market-notes";
import { marketNoteReceiptLine, marketNoteSentence } from "@/lib/shared/market-note";
import { SPARK_ADDRESSES } from "@/lib/spark/asset-catalog";
import { getJson } from "../lib/host-fetch.mjs";

/** sparkViewWithLiveRead, copied from the page (a module-local function there). */
function sparkViewWithLiveRead(view, chain) {
  const live = { ...view, healthFactor: chain.healthFactor, chainHfStale: false };
  const holdsNothing = chain.reserves.every((r) => r.supplyBalanceRaw === "0" && r.debtBalanceRaw === "0");
  if (view.status !== "open" || !holdsNothing) return live;
  return {
    ...live,
    status: view.liquidationCount > 0 ? "liquidated" : "closed",
    supplies: [],
    borrows: [],
    atBlock: chain.blockNumber,
  };
}

export default {
  id: "spark",
  approach: "export",
  match: /^\/ethereum\/spark\/(0x[0-9a-fA-F]{40})\/?$/,

  async load([, rawWallet], query) {
    const wallet = rawWallet.toLowerCase();
    const grouped = servedFoldersFromParam(query.get("folders"));

    const [positions, tData] = await Promise.all([
      fetchSparkPositions({ wallet, limit: 1 }),
      grouped ? fetchSparkGroupedTimeline(wallet) : fetchSparkTimeline(wallet, { recent: TIMELINE_WINDOW_ROWS }),
    ]);
    const summary = positions.data[0] ?? null;
    if (!summary) throw new Error("/api/spark/positions returned no row");
    const events = tData.events ?? [];
    const groupedTail = grouped ? tData : null;
    const cutoffBlock = tData.cutoffBlock ?? null;

    const opening =
      cutoffBlock == null
        ? null
        : await fetchTimelineOpeningBalance({
            path: "/api/spark/timeline/summary",
            params: { wallet },
            cutoffBlock,
          }).catch(() => null);
    const historyWindow =
      cutoffBlock == null
        ? WHOLE_HISTORY
        : opening
          ? { state: "ready", cutoffBlock, opening }
          : { state: "failed", cutoffBlock, opening: null };

    const chainRead = await fetchSparkPosition({ wallet }).catch(() => null);
    const chain = chainRead && !chainRead.chainStale ? chainRead : null;
    const flowSeries = await fetchFlowSeries("/api/spark/flows", { wallet }).catch(() => null);

    const sparkEvents = events.filter(isSparkEvent);
    const servedFolders =
      groupedTail && groupedTail.rowPlan
        ? interleaveRowPlan(groupedTail.rowPlan, sparkEvents).flatMap((r) => (r.kind === "folder" ? [r.folder] : []))
        : null;

    let view = viewFromSummary(summary);
    const pageLifetime = sparkLifetimeWithOpening(sparkEvents, opening, servedFolders);
    const precomputedLifetime = (flowSeries ? lifetimeFromSeries(flowSeries) : undefined) ?? pageLifetime;
    if (view.status === "open" && sparkEvents.length > 0) {
      const missing = unpricedSparkFlowAddresses(view, sparkEvents, precomputedLifetime);
      if (missing.length > 0) {
        const prices = await fetchSparkOraclePrices(missing).catch(() => ({}));
        if (Object.keys(prices).length > 0)
          view = { ...view, priceByAddress: { ...prices, ...(view.priceByAddress ?? {}) } };
      }
    }

    const rateRequests = aaveFamilyRateRequests(aaveFamilyHoldings(sparkEvents), stableRateReserves(sparkEvents));
    const reserveRates =
      rateRequests.length === 0
        ? null
        : await loadAaveFamilyReserveRates({ route: "/api/spark/reserve-rates", requests: rateRequests });
    const head = await getJson("/api/head").catch(() => null);
    const noteOptions = {
      protocol: "spark",
      market: "spark",
      marketName: "Spark",
      pool: SPARK_ADDRESSES.POOL,
      symbols: Object.fromEntries((chain?.reserves ?? []).map((r) => [r.address.toLowerCase(), r.symbol])),
    };
    const notes = reserveRates
      ? aaveFamilyRateStepNotesFor(sparkEvents, reserveRates, noteOptions).sort((a, b) => a.to.block - b.to.block)
      : [];
    const liveNotes =
      reserveRates && chain
        ? liveAaveFamilyRateStepNotes(
            sparkEvents,
            reserveRates,
            { blockNumber: chain.blockNumber, timestamp: head?.blockTimestamp, reserves: chain.reserves },
            noteOptions,
          )
        : [];

    // The page exports `view` and computes the captions off the live view.
    const liveView = chain ? sparkViewWithLiveRead(view, chain) : view;
    const lifetimeEvents = lifetimeFiguresKnown(historyWindow) ? sparkEvents : undefined;
    const captions = computeSparkCardCaptions(
      liveView,
      lifetimeEvents,
      chain,
      precomputedLifetime,
      sparkEvents,
      servedFolders,
    );
    return { wallet, view, chain, captions, events: sparkEvents, notes, liveNotes, historyWindow, servedFolders };
  },

  head(state) {
    return state.events.reduce((m, e) => Math.max(m, e.blockNumber ?? 0), 0) || null;
  },

  render(state, { generatedAt, maxBlock }) {
    const events = maxBlock == null ? state.events : state.events.filter((e) => e.blockNumber <= maxBlock);
    const markdown = sparkPositionToMarkdown({
      wallet: state.wallet,
      view: state.view,
      chain: state.chain,
      captions: state.captions,
      events,
      notes: state.notes,
      liveNotes: state.liveNotes,
      history: markdownHistoryScope(state.historyWindow, events, state.servedFolders),
      generatedAt,
    });
    // A live note is read at the head: its lines come and go with the market.
    const dropLines = state.liveNotes.flatMap((n) => [marketNoteSentence(n), marketNoteReceiptLine(n)]);
    return { markdown, dropLines };
  },
};
