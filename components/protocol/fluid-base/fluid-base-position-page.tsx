// One Fluid vault position on Base (rails-ops ui-jobs 574), at
// `/base/fluid/position/<id>`: the position card, read from rails-server's
// at-block route (lib/api/fetch-fluid-base.ts). The layout is Aerodrome's
// (components/protocol/aerodrome/aerodrome-position-page.tsx).
//
// SERVER-ONLY: the read uses the bearer token.

import { cache } from "react";
import { notFound } from "next/navigation";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { HistoryTitleRow } from "@/components/shared/history-tag";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { FluidBasePositionCard } from "@/components/protocol/fluid-base/fluid-base-position-card";
import { fetchFluidBasePosition } from "@/lib/api/fetch-fluid-base";
import { fluidBasePosition } from "@/lib/fluid-base/position";
import { isFluidBaseId } from "@/lib/fluid-base/types";
import { POSITION_PAGE } from "@/lib/fluid-base/words";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import { explorerHref } from "@/lib/shared/protocols";

/** One read per request: the metadata and the page share it. */
export const loadFluidBasePosition = cache((id: string) => fetchFluidBasePosition(id));

export async function FluidBasePositionPage({ id }: { id: string }) {
  if (!isFluidBaseId(id)) notFound();
  const answer = await loadFluidBasePosition(id);
  if (answer.kind === "not-found") notFound();
  const session = "fluid-base";
  const home = explorerHref(8453, session);
  if (answer.kind === "error")
    return (
      <div className="py-8">
        <DetailTopRow session={session} fallbackHref={home} showStamp={false} />
        <p className="mt-6 text-sm text-rb-500" data-position-unanswered="">
          {POSITION_PAGE.unanswered}
        </p>
      </div>
    );
  const r = answer.data;
  const p = fluidBasePosition(r);
  const title = POSITION_PAGE.title(p);
  const wallet = p.owner.toLowerCase();
  return (
    <div className="min-h-screen">
      <div className="py-8">
        <header className="mb-5" data-skel-section="page-header">
          <DetailTopRow
            session={session}
            fallbackHref={`${home}/${wallet}`}
            showStamp={false}
            priceReason={ORACLE_USD_REASON[session]}
            owner={{ wallet, filterProtocol: null, href: `${home}/${wallet}` }}
            tools={false}
          />
          <HistoryTitleRow id={session}>
            <h2 className="text-lg font-semibold text-foreground" data-fluid-base-position={id}>
              {title}
            </h2>
          </HistoryTitleRow>
          <p className="text-xs text-rb-500">{POSITION_PAGE.sub(p, r.vaultId)}</p>
        </header>
        <FluidBasePositionCard r={r} />
      </div>
      <ProvInspectorLayer />
    </div>
  );
}
