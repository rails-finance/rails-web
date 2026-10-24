// Seamless on Base — /base/seamless/<wallet>[?folders=0]
//
// The inputs aaveV3Exports() is given on the page
// (app/(app)/base/seamless/[wallet]/position-view.tsx): the live Pool read,
// the sweep route's history (grouped by default, flat on `?folders=0`), and
// the oracle prices of every reserve held now or ever moved. The view carries
// the page's event total, count rule and liquidation note; the captions are
// the shared V3 function the page memoises.

import { aaveV3PositionToMarkdown } from "@/lib/aave-v3/position-to-markdown";
import { fetchAaveV3Position } from "@/lib/api/fetch-aave-v3-position";
import { ChainTimelinePending, fetchChainTimeline } from "@/lib/api/fetch-chain-timeline";
import { interleaveRowPlan, servedFoldersFromParam } from "@/lib/shared/timeline-folder";
import { isAaveV3Event } from "@/lib/shared/types/event-shape";
import { computeAaveV3CardCaptions, unpricedAaveV3FlowAddresses } from "@/lib/aave-v3/chain-truth-tower";
import { v3ViewFromChain } from "@/lib/aave-v3/chain-position-view";
import { markdownHistoryScope } from "@/lib/shared/markdown-history";
import { getProtocolContract } from "@/lib/shared/known-infrastructure";
import { SEAMLESS_CHAIN_ID } from "@/lib/seamless/asset-catalog";

const POSITION_ROUTE = "/api/chain/seamless/position";
const TIMELINE_ROUTE = "/api/chain/seamless/timeline";
const PRICES_ROUTE = "/api/chain/seamless/oracle-prices";
const COUNT_RULE = "Withdrawals as ETH through the WETH gateway and other aToken transfers count";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const plural = (n, one, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** seamlessCountSplit, copied from the page (a module-local function there). */
function seamlessCountSplit(events, txCount) {
  const own = events.filter((e) => isAaveV3Event(e) && e.context.data.eventType !== "liquidation");
  if (own.length === 0 || own.length !== txCount) return null;
  let gateway = 0;
  let transfers = 0;
  for (const e of own) {
    const d = e.context.data;
    if (d.eventType !== "transfer_in" && d.eventType !== "transfer_out") continue;
    transfers += 1;
    if (d.eventType === "transfer_out" && getProtocolContract(d.counterparty, SEAMLESS_CHAIN_ID)?.kind === "gateway")
      gateway += 1;
  }
  if (transfers === 0) return "All of them are Pool calls, which is what the listing counts";
  const parts = [plural(own.length - transfers, "Pool call")];
  if (gateway > 0) parts.push(`${plural(gateway, "withdrawal")} as ETH through the WETH gateway`);
  if (transfers - gateway > 0) parts.push(plural(transfers - gateway, "other aToken transfer"));
  const joined = parts.length === 3 ? `${parts[0]}, ${parts[1]} and ${parts[2]}` : parts.join(" and ");
  return `The ${txCount.toLocaleString("en-US")} are ${joined}; the listing counts Pool calls only`;
}

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

async function fetchPrices(assets) {
  if (assets.length === 0) return {};
  const res = await fetch(`${PRICES_ROUTE}?assets=${assets.join(",")}`, { cache: "no-store" });
  if (!res.ok) return {};
  return (await res.json()).prices ?? {};
}

export default {
  id: "seamless",
  approach: "export",
  match: /^\/base\/seamless\/(0x[0-9a-fA-F]{40})\/?$/,

  async load([, rawWallet], query) {
    const wallet = rawWallet.toLowerCase();
    const group = servedFoldersFromParam(query.get("folders"));
    const [data, timeline] = await Promise.all([
      fetchAaveV3Position({ wallet, route: POSITION_ROUTE }),
      readTimeline({ wallet, route: TIMELINE_ROUTE, params: group ? { group: "1" } : undefined }),
    ]);
    if (!data || data.chainStale) throw new Error("the live Pool read came back stale");

    const events = timeline.events ?? [];
    const aaveEvents = events.filter(isAaveV3Event);
    const servedFolders =
      timeline.grouped && timeline.rowPlan
        ? interleaveRowPlan(timeline.rowPlan, aaveEvents).flatMap((r) => (r.kind === "folder" ? [r.folder] : []))
        : null;
    const captureSource = timeline.coverage.source === "index" ? "index" : "sweep";
    const sweptClean = timeline.coverage.gaps.length === 0 && timeline.coverage.fromDeployment === true;
    const history = { timeline, whole: sweptClean };

    const bare = v3ViewFromChain(data, "seamless", undefined, events);
    const wanted = new Set(bare.supplies.concat(bare.borrows).map((r) => r.address.toLowerCase()));
    for (const a of unpricedAaveV3FlowAddresses(bare, events, timeline.lifetime)) wanted.add(a);
    const prices = await fetchPrices([...wanted]).catch(() => ({}));

    const wholeRows = sweptClean && (servedFolders?.length ?? 0) === 0 && (timeline.coverage.omitted?.count ?? 0) === 0;
    const base = v3ViewFromChain(data, "seamless", prices, events, history);
    const liqs = base.liquidationCount;
    const view = {
      ...base,
      eventTotal: timeline.totalEvents ?? null,
      countRule: (wholeRows ? seamlessCountSplit(aaveEvents, base.txCount) : null) ?? COUNT_RULE,
      ...(liqs > 0
        ? {
            countNote:
              liqs === 1
                ? "the liquidation is a row of its own, sent by the liquidator"
                : "each liquidation is a row of its own, sent by the liquidator",
          }
        : {}),
    };
    const captions = computeAaveV3CardCaptions(
      view,
      undefined,
      data,
      sweptClean ? timeline.lifetime : undefined,
      aaveEvents,
      servedFolders,
    );
    return { wallet, source: captureSource, view, chain: data, captions, events: aaveEvents, servedFolders };
  },

  head(state) {
    return state.events.reduce((m, e) => Math.max(m, e.blockNumber ?? 0), 0) || null;
  },

  render(state, { generatedAt, maxBlock }) {
    const events = maxBlock == null ? state.events : state.events.filter((e) => e.blockNumber <= maxBlock);
    const markdown = aaveV3PositionToMarkdown({
      wallet: state.wallet,
      protocolName: "Seamless",
      marketName: "Base",
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
