// Aave V3 on Ethereum — /ethereum/aave-v3/<wallet>[?market=…][&folders=0]
//
// The inputs aaveV3Exports() is given on the page
// (app/(app)/ethereum/aave-v3/[wallet]/position-view.tsx), read the way its
// effects read them: the positions row, ONE timeline read (grouped by default,
// the flat `recent` window on `?folders=0`), the opening balance below a cut,
// the live Pool read, the lifetime flow series, the oracle prices of exited
// reserves, and the reserve rates and head behind the market notes.

import { aaveV3PositionToMarkdown } from "@/lib/aave-v3/position-to-markdown";
import { fetchAaveV3Positions } from "@/lib/api/fetch-aave-v3-positions";
import { fetchAaveV3Timeline, fetchAaveV3GroupedTimeline } from "@/lib/api/fetch-aave-v3-timeline";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import { fetchAaveV3Position, fetchAaveV3OraclePrices } from "@/lib/api/fetch-aave-v3-position";
import { fetchAaveV3FlowSeries } from "@/lib/api/fetch-aave-v3-flow-series";
import { loadAaveFamilyReserveRates } from "@/lib/api/fetch-aave-family-reserve-rates";
import { lifetimeFiguresKnown, TIMELINE_WINDOW_ROWS, WHOLE_HISTORY } from "@/lib/shared/timeline-opening-balance";
import { asV3Market, MARKET_NAME, POOL_BY_MARKET } from "@/lib/aave-v3/asset-catalog";
import { interleaveRowPlan, servedFoldersFromParam } from "@/lib/shared/timeline-folder";
import { isAaveV3Event } from "@/lib/shared/types/event-shape";
import { viewFromSummary } from "@/components/protocol/aave-v3/aave-v3-position-card";
import {
  computeAaveV3CardCaptions,
  unpricedAaveV3FlowAddresses,
  aaveV3LifetimeWithOpening,
} from "@/lib/aave-v3/chain-truth-tower";
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
import { v3ViewWithLiveRead } from "@/lib/aave-v3/chain-position-view";
import { getJson } from "../lib/host-fetch.mjs";

export default {
  id: "aave-v3",
  approach: "export",
  match: /^\/ethereum\/aave-v3\/(0x[0-9a-fA-F]{40})\/?$/,

  async load([, rawWallet], query) {
    const wallet = rawWallet.toLowerCase();
    const market = asV3Market(query.get("market"));
    const grouped = servedFoldersFromParam(query.get("folders"));

    const [positions, tData] = await Promise.all([
      fetchAaveV3Positions({ wallet, market, limit: 1 }),
      grouped
        ? fetchAaveV3GroupedTimeline({ wallet, market })
        : fetchAaveV3Timeline({ wallet, market, recent: TIMELINE_WINDOW_ROWS }),
    ]);
    const summary = positions.rows[0] ?? null;
    if (!summary) throw new Error("/api/aave-v3/positions returned no row");
    const events = tData.events ?? [];
    const groupedTail = grouped ? tData : null;
    const cutoffBlock = tData.cutoffBlock ?? null;

    const opening =
      cutoffBlock == null
        ? null
        : await fetchTimelineOpeningBalance({
            path: "/api/aave-v3/timeline/summary",
            params: { wallet, market },
            cutoffBlock,
          }).catch(() => null);
    const historyWindow =
      cutoffBlock == null
        ? WHOLE_HISTORY
        : opening
          ? { state: "ready", cutoffBlock, opening }
          : { state: "failed", cutoffBlock, opening: null };

    const chainRead = await fetchAaveV3Position({ wallet, market }).catch(() => null);
    const chain = chainRead && !chainRead.chainStale ? chainRead : null;
    const flowSeries = await fetchAaveV3FlowSeries({ wallet, market }).catch(() => null);

    const aaveEvents = events.filter(isAaveV3Event);
    const servedFolders = groupedTail
      ? interleaveRowPlan(groupedTail.rowPlan, aaveEvents).flatMap((r) => (r.kind === "folder" ? [r.folder] : []))
      : null;

    let view = viewFromSummary(summary);
    const pageLifetime = aaveV3LifetimeWithOpening(aaveEvents, opening, servedFolders);
    const precomputedLifetime = (flowSeries ? lifetimeFromSeries(flowSeries) : undefined) ?? pageLifetime;
    if (view.status === "open" && aaveEvents.length > 0) {
      const missing = unpricedAaveV3FlowAddresses(view, aaveEvents, precomputedLifetime);
      if (missing.length > 0) {
        const prices = await fetchAaveV3OraclePrices(missing).catch(() => ({}));
        if (Object.keys(prices).length > 0)
          view = { ...view, priceByAddress: { ...prices, ...(view.priceByAddress ?? {}) } };
      }
    }

    const rateRequests = aaveFamilyRateRequests(aaveFamilyHoldings(aaveEvents), stableRateReserves(aaveEvents));
    const reserveRates =
      rateRequests.length === 0
        ? null
        : await loadAaveFamilyReserveRates({ route: "/api/aave-v3/reserve-rates", market, requests: rateRequests });
    const head = await getJson("/api/head").catch(() => null);
    const noteOptions = {
      protocol: "aave-v3",
      market,
      marketName: `Aave V3 ${MARKET_NAME[market] ?? "Core"}`,
      pool: POOL_BY_MARKET[market] ?? POOL_BY_MARKET.core,
      symbols: Object.fromEntries((chain?.reserves ?? []).map((r) => [r.address.toLowerCase(), r.symbol])),
    };
    const notes = reserveRates
      ? aaveFamilyRateStepNotesFor(aaveEvents, reserveRates, noteOptions).sort((a, b) => a.to.block - b.to.block)
      : [];
    const liveNotes =
      reserveRates && chain
        ? liveAaveFamilyRateStepNotes(
            aaveEvents,
            reserveRates,
            { blockNumber: chain.blockNumber, timestamp: head?.blockTimestamp, reserves: chain.reserves },
            noteOptions,
          )
        : [];

    const liveView = chain ? v3ViewWithLiveRead(view, chain) : view;
    const lifetimeEvents = lifetimeFiguresKnown(historyWindow) ? aaveEvents : undefined;
    const captions = computeAaveV3CardCaptions(
      liveView,
      lifetimeEvents,
      chain,
      precomputedLifetime,
      aaveEvents,
      servedFolders,
    );
    return {
      wallet,
      marketName: MARKET_NAME[market] ?? "Core",
      view: liveView,
      chain,
      captions,
      events: aaveEvents,
      notes,
      liveNotes,
      historyWindow,
      servedFolders,
    };
  },

  head(state) {
    return state.events.reduce((m, e) => Math.max(m, e.blockNumber ?? 0), 0) || null;
  },

  render(state, { generatedAt, maxBlock }) {
    const events = maxBlock == null ? state.events : state.events.filter((e) => e.blockNumber <= maxBlock);
    const markdown = aaveV3PositionToMarkdown({
      wallet: state.wallet,
      marketName: state.marketName,
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
