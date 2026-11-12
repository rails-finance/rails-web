// A wallet's Slipstream positions on a site (U3; rails-ops ui-jobs 566, 578),
// at `<site route>/<wallet>`: Aerodrome on Base, Velodrome on Optimism. The
// positions that hold liquidity,
// staked in a gauge on the wallet's behalf or held by it, each row saying
// which and opening its page. Ids and pairs only: each position's page
// carries the figures and their receipts. The layout is Uniswap's
// (components/protocol/uniswap/uniswap-wallet-positions.tsx).
//
// SERVER-ONLY: the read uses the bearer token.

import { notFound } from "next/navigation";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { HistoryTitleRow } from "@/components/shared/history-tag";
import { isWallet } from "@/components/protocol/uniswap/uniswap-wallet-positions";
import { poolTokenKeys } from "@/components/protocol/uniswap/pool-focus-keys";
import { PoolWalletList } from "@/components/protocol/uniswap/pool-wallet-list";
import { fetchAerodromePositions } from "@/lib/api/fetch-aerodrome";
import { AERODROME, type SlipstreamSite } from "@/lib/aerodrome/sites";
import { frontDoorWords } from "@/lib/aerodrome/words";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import { explorerHref } from "@/lib/shared/protocols";

export async function AerodromeWalletPositions({
  wallet: raw,
  site = AERODROME,
}: {
  wallet: string;
  site?: SlipstreamSite;
}) {
  if (!isWallet(raw)) notFound();
  const wallet = raw.toLowerCase();
  const session = site.id;
  const chain = site.chainId;
  const FRONT_DOOR = frontDoorWords(site);
  const home = explorerHref(chain, session);
  const answer = await fetchAerodromePositions(wallet, site);
  const all = answer.kind === "ok" ? answer.data.positions : [];
  return (
    <div className="py-8" data-anatomy="U3" data-aerodrome-wallet={wallet}>
      <header className="mb-5">
        <DetailTopRow
          session={session}
          fallbackHref={home}
          showStamp={false}
          priceReason={ORACLE_USD_REASON[session]}
          owner={{ wallet, chain, filterProtocol: null }}
          tools={false}
        />
        <HistoryTitleRow id={session}>
          <h2 className="text-lg font-semibold text-foreground">{FRONT_DOOR.heading}</h2>
        </HistoryTitleRow>
      </header>
      {answer.kind !== "ok" ? (
        <p className="text-sm text-rb-500">{FRONT_DOOR.unanswered}</p>
      ) : all.length === 0 ? (
        <p className="text-sm text-rb-500" data-aerodrome-none="">
          {FRONT_DOOR.none}
        </p>
      ) : (
        // Focus (ui-jobs 557): a position is kept when either side of its pair is in focus.
        <PoolWalletList
          rows={all.map((p) => ({
            key: `${p.deployment}:${p.id}`,
            href: `${home}/position/${p.deployment}/${p.id}`,
            label: FRONT_DOOR.row(p),
            sub: p.staked ? FRONT_DOOR.staked : FRONT_DOOR.unstaked,
            keys: poolTokenKeys(chain, [p.token0, p.token1]),
            chain,
            attrs: {
              "data-aerodrome-position-row": `${p.deployment}:${p.id}`,
              "data-staked": p.staked ? "true" : "false",
            },
          }))}
        />
      )}
      {answer.kind === "ok" && answer.data.truncated && (
        <p className="mt-3 text-sm text-rb-500">{FRONT_DOOR.truncated}</p>
      )}
    </div>
  );
}
