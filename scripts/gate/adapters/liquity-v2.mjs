// Liquity V2 Trove — /ethereum/liquity-v2/trove/<branch>/<troveId>
//
// The inputs troveExports() is given on the page
// (app/(app)/ethereum/liquity-v2/trove/[collateralType]/[troveId]/trove-view.tsx):
// the /api/troves summary, the timeline tail (TIMELINE_WINDOW_ROWS), the
// oracle prices, the live /api/trove/state overlay, debt in front (open Troves
// only), and on a liquidated Trove the surplus claim row the page adds from
// /api/chain/liquity-family/coll-surplus. Events are ordered as useTimelineEvents
// orders them (timestamp, then within the block).

import { troveToMarkdown } from "@/lib/liquity/trove-to-markdown";
import { troveWords } from "@/lib/liquity/event-templates";
import { fetchTroveTimeline } from "@/lib/api/fetch-timeline";
import { TIMELINE_WINDOW_ROWS } from "@/lib/shared/timeline-opening-balance";
import { isLiquityEvent } from "@/lib/shared/types/event-shape";
import { compareEventsInOrder, compareWithinBlock } from "@/lib/shared/event-order";
import { collSurplusClaimEvent } from "@/lib/shared/liquity-coll-surplus-claim";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { shiftDecimal } from "@/components/shared/provenance";
import { getJson } from "../lib/host-fetch.mjs";

const BURN = "0x0000000000000000000000000000000000000000";

export default {
  id: "liquity-v2",
  approach: "export",
  match: /^\/ethereum\/liquity-v2\/trove\/([^/?#]+)\/(\d+)\/?$/,

  async load([, collateralType, troveId]) {
    const [troves, timeline, oracle] = await Promise.all([
      getJson(`/api/troves?troveId=${troveId}&collateralType=${collateralType}`),
      fetchTroveTimeline({ collateralType, troveId, limit: TIMELINE_WINDOW_ROWS }),
      getJson(`/api/oracle/liquity-v2`),
    ]);
    const trove = troves?.data?.[0];
    if (!trove) throw new Error("/api/troves returned no Trove");
    const prices = oracle?.success ? oracle.data : undefined;

    const stateRes = await getJson(`/api/trove/state/${collateralType}/${troveId}`);
    const liveState = stateRes?.success ? stateRes.data : undefined;

    let debtInFront = null;
    let trovesAhead = null;
    if (trove.status === "open") {
      const qs = new URLSearchParams({ collateralType, troveId });
      const d = (await getJson(`/api/liquity-v2/debt-in-front?${qs}`))?.data;
      if (d && typeof d.debtInFront === "number") {
        debtInFront = d.debtInFront;
        trovesAhead = typeof d.trovesAhead === "number" ? d.trovesAhead : null;
      }
    }

    const liquityEvents = (timeline.events ?? []).filter(isLiquityEvent).sort(compareEventsInOrder);
    const owner = trove.owner && trove.owner.toLowerCase() !== BURN ? trove.owner : trove.lastOwner;
    const lastLiquidation = [...liquityEvents].reverse().find((e) => e.context.data.operation === "liquidate");
    let claim = null;
    if (trove.status === "liquidated" && owner && lastLiquidation) {
      const qs = new URLSearchParams({
        protocol: "liquity-v2",
        branch: collateralType,
        owner,
        tx: lastLiquidation.txHash,
      });
      const d = await getJson(`/api/chain/liquity-family/coll-surplus?${qs}`);
      const surplus =
        d && d.pool && d.surplusRaw !== "0"
          ? {
              surplus: Number(shiftDecimal(d.surplusRaw, d.decimals)),
              surplusRaw: d.surplusRaw,
              claimable: Number(shiftDecimal(d.claimableRaw, d.decimals)),
              claimableRaw: d.claimableRaw,
              decimals: d.decimals,
              pool: d.pool,
              blockNumber: d.blockNumber,
              claimed: d.claimed,
            }
          : null;
      claim = collSurplusClaimEvent({
        source: surplus,
        family: "liquity-v2",
        protocolName: troveWords("protocol_name"),
        chainId: MAINNET_CHAIN_ID,
        symbol: trove.collateralType ?? collateralType,
        owner,
        creditTx: lastLiquidation.txHash,
        creditKind: "liquidation",
        creditAt: lastLiquidation.timestamp ?? null,
      });
    }
    return { trove, liveState, prices, debtInFront, trovesAhead, events: liquityEvents, claim };
  },

  head(state) {
    return state.events.reduce((m, e) => Math.max(m, e.blockNumber ?? 0), 0) || null;
  },

  render(state, { generatedAt, maxBlock }) {
    const within = (e) => maxBlock == null || (e.blockNumber ?? 0) <= maxBlock;
    const events = [...state.events, ...(state.claim ? [state.claim] : [])]
      .filter(within)
      .sort((a, b) => a.timestamp - b.timestamp || compareWithinBlock(a, b));
    const markdown = troveToMarkdown({
      trove: state.trove,
      liveState: state.liveState,
      prices: state.prices,
      debtInFront: state.debtInFront,
      trovesAhead: state.trovesAhead,
      events,
      generatedAt,
    });
    return { markdown, dropLines: [] };
  },
};
