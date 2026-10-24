// Aave V3 on a single-Pool chain — /base/aave-v3/<wallet>, /arbitrum/aave-v3/<wallet>
//
// The inputs aaveV3Exports() is given by the shared pool page
// (components/protocol/aave-v3/aave-v3-pool-position-page.tsx), read through
// the deployment's own routes: the live Pool read, the history route (grouped
// by default where the deployment serves folders, flat on `?folders=0`), and
// the oracle prices of every reserve held now or ever moved. The card view and
// the captions are built by the same functions the page memoises.

import { aaveV3PositionToMarkdown } from "@/lib/aave-v3/position-to-markdown";
import { fetchAaveV3Position } from "@/lib/api/fetch-aave-v3-position";
import { ChainTimelinePending, fetchChainTimeline } from "@/lib/api/fetch-chain-timeline";
import { interleaveRowPlan, servedFoldersFromParam } from "@/lib/shared/timeline-folder";
import { isAaveV3Event } from "@/lib/shared/types/event-shape";
import { computeAaveV3CardCaptions, unpricedAaveV3FlowAddresses } from "@/lib/aave-v3/chain-truth-tower";
import { v3ViewFromChain } from "@/lib/aave-v3/chain-position-view";
import { aaveV3ReplayCountNote } from "@/lib/aave-v3/event-neighbours";
import { markdownHistoryScope } from "@/lib/shared/markdown-history";
import { AAVE_V3_BASE_PAGE } from "@/lib/aave-v3-base/page-deployment";
import { AAVE_V3_ARBITRUM_PAGE } from "@/lib/aave-v3-arbitrum/page-deployment";

const DEPLOYMENTS = { base: AAVE_V3_BASE_PAGE, arbitrum: AAVE_V3_ARBITRUM_PAGE };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The history route answers 202 while it reads a wallet for the first time;
 *  the page shows the sweep in flight and asks again. */
async function readTimeline(args) {
  for (let i = 0; ; i++) {
    try {
      return await fetchChainTimeline(args);
    } catch (err) {
      if (!(err instanceof ChainTimelinePending) || i >= 5) throw err;
      await sleep(10_000);
    }
  }
}

async function fetchPrices(route, assets) {
  if (assets.length === 0) return {};
  const res = await fetch(`${route}?assets=${assets.join(",")}`, { cache: "no-store" });
  if (!res.ok) return {};
  return (await res.json()).prices ?? {};
}

export default {
  id: "aave-v3-pool",
  approach: "export",
  match: /^\/(base|arbitrum)\/aave-v3\/(0x[0-9a-fA-F]{40})\/?$/,

  async load([, chainName, rawWallet], query) {
    const d = DEPLOYMENTS[chainName];
    const wallet = rawWallet.toLowerCase();
    const group = d.routes.folder != null && servedFoldersFromParam(query.get("folders"));
    const [data, timeline] = await Promise.all([
      fetchAaveV3Position({ wallet, route: d.pool.positionRoute }),
      readTimeline({ wallet, route: d.routes.timeline, params: group ? { group: "1" } : undefined }),
    ]);
    if (!data || data.chainStale) throw new Error("the live Pool read came back stale");

    const events = timeline.events ?? [];
    const aaveEvents = events.filter(isAaveV3Event);
    const servedFolders =
      timeline.grouped && timeline.rowPlan
        ? interleaveRowPlan(timeline.rowPlan, aaveEvents).flatMap((r) => (r.kind === "folder" ? [r.folder] : []))
        : null;
    const captureSource = d.captureSourceOf(timeline.coverage);
    const sweptClean = d.wholeOf(timeline.coverage);
    const history = { timeline, whole: sweptClean };

    const bare = v3ViewFromChain(data, d.marketKey, undefined, events);
    const wanted = new Set(bare.supplies.concat(bare.borrows).map((r) => r.address.toLowerCase()));
    for (const a of unpricedAaveV3FlowAddresses(bare, events, timeline.lifetime)) wanted.add(a);
    const prices = await fetchPrices(d.routes.prices, [...wanted]).catch(() => ({}));

    const countWhole = sweptClean && (timeline.coverage.omitted?.count ?? 0) === 0;
    const noFolders = (servedFolders?.length ?? 0) === 0;
    const countNote = countWhole && noFolders ? aaveV3ReplayCountNote(aaveEvents, timeline.txCount ?? 0) : null;
    const v = v3ViewFromChain(data, d.marketKey, prices, events, history);
    const view =
      countWhole && noFolders
        ? { ...v, eventTotal: timeline.totalEvents, countNote: countNote?.parts.join(", ") || undefined }
        : v;
    const captions = computeAaveV3CardCaptions(
      view,
      undefined,
      data,
      sweptClean ? timeline.lifetime : undefined,
      aaveEvents,
      servedFolders,
    );
    return {
      wallet,
      marketName: d.marketName,
      source: captureSource,
      view,
      chain: data,
      captions,
      events: aaveEvents,
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
      source: state.source,
      view: state.view,
      chain: state.chain,
      captions: state.captions,
      events,
      history: markdownHistoryScope(undefined, events, state.servedFolders),
      generatedAt,
    });
    return { markdown, dropLines: [] };
  },
};
