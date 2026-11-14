"use client";

// One wallet's position in one Pendle market: the card (P1), the lifetime
// flows by leg (P2), and the router events newest first with the note rows for
// moves outside the routers and the router record's reach (P3).

import { DetailTopRow } from "@/components/shared/detail-back-row";
import { PositionReadProvider } from "@/components/shared/position-read";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { PendlePositionCard } from "@/components/protocol/pendle/pendle-position-card";
import { PendleFlows } from "@/components/protocol/pendle/pendle-flows";
import { PendleTimeline } from "@/components/protocol/pendle/pendle-timeline";
import { pendleWalletHref } from "@/lib/pendle/routes";
import type { PendleWalletPositions } from "@/lib/pendle/types";

export function PendlePositionView({ data, market }: { data: PendleWalletPositions; market: string }) {
  const p = data.positions.find((x) => x.tokens.market.address === market)!;
  const rows = data.timeline.filter((r) => r.market === market);
  const tokensOf = (m: string | null) => (m === market ? p.tokens : null);
  const registry = useReceiptRegistry();
  return (
    <ProvReceiptsScope registry={registry}>
      {/* Focus (ui-jobs 557): the market is in focus when its PT, YT, SY, yield token or LP is. */}
      <PositionReadProvider
        focus={{ source: p.tokens }}
        read={{ kind: "chain", block: data.block, at: data.timestamp }}
      >
        <div className="space-y-6 py-8">
          <DetailTopRow
            session="pendle"
            wallet={data.wallet}
            owner={{ wallet: data.wallet }}
            assets={[]}
            tools={false}
            fallbackHref={pendleWalletHref(data.wallet)}
          />
          <PendlePositionCard p={p} block={data.block} timestamp={data.timestamp} rows={rows} />
          <PendleFlows p={p} meta={data.tokens} />
          <PendleTimeline
            rows={rows}
            boundaries={p.boundaries}
            coverage={data.coverage}
            through={data.provenance.routerThroughBlock}
            tokensOf={tokensOf}
            meta={data.tokens}
          />
          <ProvInspectorLayer />
        </div>
      </PositionReadProvider>
    </ProvReceiptsScope>
  );
}
