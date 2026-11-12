// A wallet's Euler V2 accounts on one chain (J3), at `/<chain>/euler-v2/<wallet>`:
// each account that borrows, has collateral enabled or (account 0) holds a
// deposit, its holdings on rows that open their pages (J3.2). The line under the
// heading states the narrowing (J3.1) where deposits were read on account 0 alone; on a chain the
// position index serves, the index's deposits on accounts 1–255 lift it and the line goes. The layout is Uniswap's
// (components/protocol/uniswap/uniswap-wallet-positions.tsx).
//
// SERVER-ONLY: the read uses the bearer token.

import { notFound } from "next/navigation";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { HistoryTitleRow } from "@/components/shared/history-tag";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { AimGate } from "@/components/shared/aim-gate";
import { UnansweredLine } from "@/components/shared/unanswered-line";
import { EulerWalletList } from "@/components/protocol/euler/euler-wallet-list";
import { isWallet } from "@/components/protocol/uniswap/uniswap-wallet-positions";
import { fetchEulerWallet } from "@/lib/api/fetch-euler";
import { EULER_SESSION, type EulerChainId } from "@/lib/euler/types";
import { FRONT_DOOR } from "@/lib/euler/words";
import { explorerHref } from "@/lib/shared/protocols";

export async function EulerWalletAccounts({ chain, wallet: raw }: { chain: EulerChainId; wallet: string }) {
  if (!isWallet(raw)) notFound();
  const wallet = raw.toLowerCase();
  const session = EULER_SESSION[chain];
  const home = explorerHref(chain, "euler-v2");
  const answer = await fetchEulerWallet(chain, wallet);
  // Focus: the page stands while any holding's asset is in focus.
  const keys =
    answer.kind === "ok"
      ? answer.data.accounts.flatMap((a) => a.holdings.map((h) => `${chain}:${h.asset.address.toLowerCase()}`))
      : [];
  return (
    <AimGate keys={keys} chain={chain} what="These Euler accounts">
      <div className="min-h-screen">
        <div className="py-8" data-anatomy="J3" data-euler-wallet={wallet}>
          <header className="mb-5">
            <DetailTopRow
              session={session}
              fallbackHref={home}
              showStamp={false}
              owner={{ wallet, filterProtocol: null }}
              tools={false}
            />
            <HistoryTitleRow id={session}>
              <h2 className="text-lg font-semibold text-foreground">{FRONT_DOOR.heading}</h2>
            </HistoryTitleRow>
            {!(answer.kind === "ok" && answer.data.deposits?.source === "index") && (
              <p className="text-xs text-rb-500" data-anatomy="J3.1" data-euler-narrowing="">
                {FRONT_DOOR.narrowing}
              </p>
            )}
          </header>
          {answer.kind !== "ok" ? (
            <UnansweredLine ceiling={answer.kind === "ceiling"} className="text-sm text-rb-500">
              {FRONT_DOOR.unanswered}
            </UnansweredLine>
          ) : answer.data.accounts.length === 0 ? (
            <p className="text-sm text-rb-500" data-euler-none="">
              {FRONT_DOOR.none}
            </p>
          ) : (
            <EulerWalletList w={answer.data} home={home} />
          )}
          {answer.kind === "ok" && answer.data.truncated && (
            <p className="mt-3 text-sm text-rb-500">{FRONT_DOOR.truncated}</p>
          )}
        </div>
        <ProvInspectorLayer />
      </div>
    </AimGate>
  );
}
