// The Liquity V2 forks — /ethereum/ebisu/<branch>/<troveId>,
// /ethereum/asymmetry/<branch>/<troveId>, /base/basedollar/<branch>/<troveId>
//
// The inputs liquityForkExports() is given on the three trove pages
// (app/(app)/<chain>/<fork>/[collateralType]/[troveId]/trove-view.tsx, one
// shape): the troves row, ONE timeline read (grouped by default, the flat
// `recent` window on `?folders=0`), the opening balance below a cut, and the
// live branch read. The surplus claim row rides the CSV only, so the Markdown
// needs no coll-surplus read.

import { liquityForkTroveToMarkdown } from "@/lib/shared/liquity-fork-position-markdown";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import { fetchLiquityForkPosition } from "@/lib/api/fetch-liquity-fork-position";
import { TIMELINE_WINDOW_ROWS, WHOLE_HISTORY } from "@/lib/shared/timeline-opening-balance";
import { interleaveRowPlan, servedFoldersFromParam } from "@/lib/shared/timeline-folder";
import { markdownHistoryScope } from "@/lib/shared/markdown-history";
import { isAsymmetryEvent, isBasedollarEvent, isEbisuEvent } from "@/lib/shared/types/event-shape";
import { fetchEbisuTroves } from "@/lib/api/fetch-ebisu-troves";
import { fetchEbisuTimeline, fetchEbisuGroupedTimeline } from "@/lib/api/fetch-ebisu-timeline";
import { viewFromSummary as ebisuView } from "@/components/protocol/ebisu/ebisu-position-card";
import { DEBT_SYMBOL as EBISU_DEBT } from "@/lib/ebisu/asset-catalog";
import { fetchAsymmetryTroves } from "@/lib/api/fetch-asymmetry-troves";
import { fetchAsymmetryTimeline, fetchAsymmetryGroupedTimeline } from "@/lib/api/fetch-asymmetry-timeline";
import { viewFromSummary as asymmetryView } from "@/components/protocol/asymmetry/asymmetry-position-card";
import { DEBT_SYMBOL as ASYMMETRY_DEBT } from "@/lib/asymmetry/asset-catalog";
import { fetchBasedollarTroves } from "@/lib/api/fetch-basedollar-troves";
import { fetchBasedollarTimeline, fetchBasedollarGroupedTimeline } from "@/lib/api/fetch-basedollar-timeline";
import { viewFromSummary as basedollarView } from "@/components/protocol/basedollar/basedollar-position-card";
import { DEBT_SYMBOL as BASEDOLLAR_DEBT } from "@/lib/basedollar/asset-catalog";

function forkAdapter({ id, chain, label, debtSymbol, troves, timeline, grouped, viewFromSummary, isEvent }) {
  return {
    id,
    approach: "export",
    match: new RegExp(`^/${chain}/${id}/([^/?#]+)/(\\d+)/?$`),

    async load([, collateralType, troveId], query) {
      const asked = servedFoldersFromParam(query.get("folders"));
      const [pData, tData] = await Promise.all([
        troves({ troveId, collateralTypes: [collateralType], limit: 1 }),
        asked ? grouped(collateralType, troveId) : timeline(collateralType, troveId, { recent: TIMELINE_WINDOW_ROWS }),
      ]);
      const summary = pData.data[0] ?? null;
      if (!summary) throw new Error(`/api/${id}/troves returned no Trove`);
      const view = viewFromSummary(summary);
      const cutoffBlock = tData.cutoffBlock ?? null;
      const opening =
        cutoffBlock == null
          ? null
          : await fetchTimelineOpeningBalance({
              path: `/api/${id}/${encodeURIComponent(collateralType)}/${encodeURIComponent(troveId)}/timeline/summary`,
              params: {},
              cutoffBlock,
            }).catch(() => null);
      const historyWindow =
        cutoffBlock == null
          ? WHOLE_HISTORY
          : opening
            ? { state: "ready", cutoffBlock, opening }
            : { state: "failed", cutoffBlock, opening: null };
      const chainRead = await fetchLiquityForkPosition({ protocol: id, branch: collateralType, troveId }).catch(
        () => null,
      );
      const events = (tData.events ?? []).filter(isEvent);
      const servedFolders =
        asked && tData.rowPlan
          ? interleaveRowPlan(tData.rowPlan, events).flatMap((r) => (r.kind === "folder" ? [r.folder] : []))
          : null;
      return {
        view,
        chain: chainRead && !chainRead.chainStale ? chainRead : null,
        events,
        historyWindow,
        servedFolders,
      };
    },

    head(state) {
      return state.events.reduce((m, e) => Math.max(m, e.blockNumber ?? 0), 0) || null;
    },

    render(state, { generatedAt, maxBlock }) {
      const events = maxBlock == null ? state.events : state.events.filter((e) => e.blockNumber <= maxBlock);
      const markdown = liquityForkTroveToMarkdown({
        protocolLabel: label,
        debtSymbol,
        view: state.view,
        chain: state.chain,
        events,
        history: markdownHistoryScope(state.historyWindow, events, state.servedFolders),
        generatedAt,
      });
      return { markdown, dropLines: [] };
    },
  };
}

export const ebisu = forkAdapter({
  id: "ebisu",
  chain: "ethereum",
  label: "Ebisu",
  debtSymbol: EBISU_DEBT,
  troves: fetchEbisuTroves,
  timeline: fetchEbisuTimeline,
  grouped: fetchEbisuGroupedTimeline,
  viewFromSummary: ebisuView,
  isEvent: isEbisuEvent,
});

export const asymmetry = forkAdapter({
  id: "asymmetry",
  chain: "ethereum",
  label: "Asymmetry",
  debtSymbol: ASYMMETRY_DEBT,
  troves: fetchAsymmetryTroves,
  timeline: fetchAsymmetryTimeline,
  grouped: fetchAsymmetryGroupedTimeline,
  viewFromSummary: asymmetryView,
  isEvent: isAsymmetryEvent,
});

export const basedollar = forkAdapter({
  id: "basedollar",
  chain: "base",
  label: "Basedollar",
  debtSymbol: BASEDOLLAR_DEBT,
  troves: fetchBasedollarTroves,
  timeline: fetchBasedollarTimeline,
  grouped: fetchBasedollarGroupedTimeline,
  viewFromSummary: basedollarView,
  isEvent: isBasedollarEvent,
});
