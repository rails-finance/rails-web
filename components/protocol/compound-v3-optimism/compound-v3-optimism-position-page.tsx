// One Comet account of a wallet on Optimism (rails-ops ui-jobs 578), at
// `/optimism/compound-v3/<comet>/<wallet>`: the account card, read from
// rails-server's at-block route (lib/api/fetch-compound-v3-optimism.ts), and the
// line saying its history waits for the index. The layout is Aave V3 on
// Optimism's account page.
//
// SERVER-ONLY: the read uses the bearer token.

import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { ReadTierTitleRow } from "@/components/shared/read-tier-tag";
import { ProvInspectorLayer } from "@/components/shared/prov-inspector";
import { CompoundV3OptimismPositionCard } from "@/components/protocol/compound-v3-optimism/compound-v3-optimism-position-card";
import { fetchCompoundV3OptimismPosition } from "@/lib/api/fetch-compound-v3-optimism";
import { compoundOptimismMarketOf } from "@/lib/compound-v3-optimism/asset-catalog";
import { isOpcWallet, OPC_ROUTE, OPC_SESSION, opcWalletHref } from "@/lib/compound-v3-optimism/types";
import { NOT_INDEXED, POSITION_PAGE } from "@/lib/compound-v3-optimism/words";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

/** One read per request: the metadata and the page share it. */
export const loadCompoundV3OptimismPosition = cache((wallet: string, comet: string) =>
  fetchCompoundV3OptimismPosition(wallet, comet),
);

export async function CompoundV3OptimismPositionPage({ market, wallet: raw }: { market: string; wallet: string }) {
  const m = compoundOptimismMarketOf(market);
  if (!m || !isOpcWallet(raw)) notFound();
  const wallet = raw.toLowerCase();
  const answer = await loadCompoundV3OptimismPosition(wallet, m.key);
  if (answer.kind === "not-found") notFound();
  const session = OPC_SESSION;
  const head = (
    <DetailTopRow
      session={session}
      fallbackHref={OPC_ROUTE}
      showStamp={false}
      priceReason={ORACLE_USD_REASON[session]}
      owner={{ wallet, filterProtocol: null }}
      tools={false}
    />
  );
  if (answer.kind === "error")
    return (
      <div className="py-8">
        {head}
        <p className="mt-6 text-sm text-rb-500" data-position-unanswered="">
          {POSITION_PAGE.unanswered}
        </p>
      </div>
    );
  const r = answer.data;
  const a = r.account;
  const held = a.supply !== "0" || a.borrow !== "0" || a.collateral.length > 0;
  return (
    <div className="min-h-screen">
      <div className="py-8">
        <header className="mb-5" data-skel-section="page-header">
          {head}
          <ReadTierTitleRow id={session}>
            <h2
              className="text-lg font-semibold text-foreground"
              data-compound-v3-optimism-position={`${m.key}:${wallet}`}
            >
              {POSITION_PAGE.title(m.label)}
            </h2>
          </ReadTierTitleRow>
          <p className="text-xs text-rb-500">
            {POSITION_PAGE.sub} ·{" "}
            <Link href={opcWalletHref(wallet)} className={INLINE_LINK}>
              {POSITION_PAGE.wallet}
            </Link>
          </p>
        </header>
        {!held ? (
          <p className="text-sm text-rb-500" data-compound-v3-optimism-empty="">
            {POSITION_PAGE.empty(m.label)}
          </p>
        ) : (
          <CompoundV3OptimismPositionCard r={r} />
        )}
        <p className="mt-6 text-sm text-rb-500" data-not-indexed="optimism">
          {NOT_INDEXED}
        </p>
      </div>
      <ProvInspectorLayer />
    </div>
  );
}
