// One Euler V2 holding (J1, J2; rails-ops reference/read-on-visit-candidates-572.md,
// row 10), at `/<chain>/euler-v2/position/<account>/<vault>`: the card, then the
// vault under it. One read of rails-server's at-block route (lib/api/fetch-euler.ts)
// serves both.
//
// SERVER-ONLY: the read uses the bearer token.

import { cache } from "react";
import { notFound } from "next/navigation";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { HistoryTitleRow } from "@/components/shared/history-tag";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { AimGate } from "@/components/shared/aim-gate";
import { UnansweredLine } from "@/components/shared/unanswered-line";
import { EulerPositionCard } from "@/components/protocol/euler/euler-position-card";
import { EulerVaultSection } from "@/components/protocol/euler/euler-vault-section";
import { isWallet } from "@/components/protocol/uniswap/uniswap-wallet-positions";
import { fetchEulerPosition } from "@/lib/api/fetch-euler";
import { eulerPosition } from "@/lib/euler/position";
import { EULER_SESSION, type EulerChainId } from "@/lib/euler/types";
import { POSITION_PAGE } from "@/lib/euler/words";
import { explorerHref } from "@/lib/shared/protocols";

/** One read per request: the metadata and the page share it. */
export const loadEulerPosition = cache((chain: EulerChainId, account: string, vault: string) =>
  fetchEulerPosition(chain, account, vault),
);

export async function EulerPositionPage({
  chain,
  account,
  vault,
}: {
  chain: EulerChainId;
  account: string;
  vault: string;
}) {
  if (!isWallet(account) || !isWallet(vault)) notFound();
  const session = EULER_SESSION[chain];
  const home = explorerHref(chain, "euler-v2");
  const answer = await loadEulerPosition(chain, account, vault);
  if (answer.kind === "not-found") notFound();
  if (answer.kind === "error" || answer.kind === "ceiling")
    return (
      <div className="py-8">
        <DetailTopRow session={session} fallbackHref={home} showStamp={false} />
        <UnansweredLine
          ceiling={answer.kind === "ceiling"}
          className="mt-6 text-sm text-rb-500"
          data-position-unanswered=""
        >
          {POSITION_PAGE.unanswered}
        </UnansweredLine>
      </div>
    );
  const r = answer.data;
  const p = eulerPosition(r);
  const wallet = r.owner?.toLowerCase() ?? null;
  // Focus: the holding's asset and each collateral's.
  const keys = [r.vault.asset.address, ...(r.borrow?.collaterals ?? []).map((x) => x.asset.address)].map(
    (a) => `${chain}:${a.toLowerCase()}`,
  );
  return (
    <AimGate keys={keys} chain={chain} what="This Euler holding">
      <div className="min-h-screen">
        <div className="py-8">
          <header className="mb-5" data-skel-section="page-header">
            <DetailTopRow
              session={session}
              fallbackHref={wallet ? `${home}/${wallet}` : home}
              showStamp={false}
              owner={wallet ? { wallet, filterProtocol: null, href: `${home}/${wallet}` } : undefined}
              tools={false}
            />
            <HistoryTitleRow id={session}>
              <h2
                className="text-lg font-semibold text-foreground"
                data-euler-position={`${r.account}:${r.vault.address}`}
              >
                {POSITION_PAGE.title(p)}
              </h2>
            </HistoryTitleRow>
            <p className="text-xs text-rb-500">{POSITION_PAGE.sub(p)}</p>
          </header>
          <div className="flex flex-col gap-6">
            <EulerPositionCard r={r} />
            <EulerVaultSection r={r} />
          </div>
        </div>
        <ProvInspectorLayer />
      </div>
    </AimGate>
  );
}
