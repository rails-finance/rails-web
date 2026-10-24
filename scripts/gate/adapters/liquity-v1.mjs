// Liquity V1 — /ethereum/liquity-v1/<wallet>[?epoch=N]
//
// The inputs liquityV1Exports() is given on the page
// (app/(app)/ethereum/liquity-v1/[wallet]/position-view.tsx): every life's
// positions row, the timeline window (the whole history where the wallet has
// more than one life and the window cut it), the opening balance below a cut,
// and the live Trove read, which describes the current Trove and is passed for
// an open life only. The life is `?epoch=`, else the latest.

import { liquityV1PositionToMarkdown } from "@/lib/liquity-v1/position-to-markdown";
import { fetchLiquityV1Positions } from "@/lib/api/fetch-liquity-v1-positions";
import { fetchLiquityV1Timeline } from "@/lib/api/fetch-liquity-v1-timeline";
import { fetchLiquityV1Position } from "@/lib/api/fetch-liquity-v1-position";
import { fetchTimelineOpeningBalance } from "@/lib/api/fetch-timeline-opening-balance";
import { TIMELINE_WINDOW_ROWS, WHOLE_HISTORY } from "@/lib/shared/timeline-opening-balance";
import { isLiquityV1Event } from "@/lib/shared/types/event-shape";
import { viewFromSummary } from "@/components/protocol/liquity-v1/liquity-v1-position-card";
import { markdownHistoryScope } from "@/lib/shared/markdown-history";

export default {
  id: "liquity-v1",
  approach: "export",
  match: /^\/ethereum\/liquity-v1\/(0x[0-9a-fA-F]{40})\/?$/,

  async load([, rawWallet], query) {
    const wallet = rawWallet.toLowerCase();
    const [pData, tData] = await Promise.all([
      fetchLiquityV1Positions({ wallet, limit: 100 }),
      fetchLiquityV1Timeline(wallet, { recent: TIMELINE_WINDOW_ROWS }),
    ]);
    const summaries = pData.data;
    const lifeScoped = (tData.cutoffBlock ?? null) != null && summaries.length !== 1;
    const rows = lifeScoped ? await fetchLiquityV1Timeline(wallet) : tData;
    const cutoffBlock = rows.cutoffBlock ?? null;
    const opening =
      cutoffBlock == null
        ? null
        : await fetchTimelineOpeningBalance({
            path: "/api/liquity-v1/timeline/summary",
            params: { wallet },
            cutoffBlock,
          }).catch(() => null);
    const historyWindow =
      cutoffBlock == null
        ? WHOLE_HISTORY
        : opening
          ? { state: "ready", cutoffBlock, opening }
          : { state: "failed", cutoffBlock, opening: null };
    const chainRead = await fetchLiquityV1Position({ wallet }).catch(() => null);
    const chain = chainRead && !chainRead.chainStale ? chainRead : null;

    const epochParam = query.get("epoch");
    const epochNum = epochParam != null && epochParam !== "" ? Number(epochParam) : null;
    const selected =
      (epochNum != null ? summaries.find((s) => s.epoch === epochNum) : undefined) ??
      [...summaries].sort((a, b) => b.epoch - a.epoch)[0];
    if (!selected) throw new Error("/api/liquity-v1/positions returned no life");
    const view = viewFromSummary(selected);
    const events = (rows.events ?? []).filter(isLiquityV1Event).filter((e) => e.context.data.epoch === selected.epoch);
    return { wallet, view, chain: view.status === "open" ? chain : null, events, historyWindow };
  },

  head(state) {
    return state.events.reduce((m, e) => Math.max(m, e.blockNumber ?? 0), 0) || null;
  },

  render(state, { generatedAt, maxBlock }) {
    const events = maxBlock == null ? state.events : state.events.filter((e) => e.blockNumber <= maxBlock);
    const markdown = liquityV1PositionToMarkdown({
      wallet: state.wallet,
      view: state.view,
      chain: state.chain,
      events,
      history: markdownHistoryScope(state.historyWindow, events),
      generatedAt,
    });
    return { markdown, dropLines: [] };
  },
};
