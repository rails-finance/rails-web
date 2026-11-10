// A wallet's Uniswap positions on Ethereum (U3; rails-ops ui-jobs 556), at
// `/ethereum/uniswap-v3/<wallet>` and `/ethereum/uniswap-v4/<wallet>`: the
// version's positions that hold liquidity, newest first, each opening its
// page; the other version's count links its list. Ids and pairs only: each
// position's page carries the figures and their receipts.
//
// SERVER-ONLY: the read uses the bearer token.

import { notFound } from "next/navigation";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { ReadTierTitleRow } from "@/components/shared/read-tier-tag";
import { fetchUniswapPositions } from "@/lib/api/fetch-uniswap";
import { explorerHref } from "@/lib/shared/protocols";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import { poolTokenKeys } from "@/components/protocol/uniswap/pool-focus-keys";
import { PoolWalletList, UniswapOtherCount } from "@/components/protocol/uniswap/pool-wallet-list";
import type { UniswapVersion } from "@/lib/uniswap/types";
import { FRONT_DOOR } from "@/lib/uniswap/words";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
export const isWallet = (w: string): boolean => ADDRESS.test(w);

export async function UniswapWalletPositions({ version, wallet: raw }: { version: UniswapVersion; wallet: string }) {
  if (!isWallet(raw)) notFound();
  const wallet = raw.toLowerCase();
  const session = version === "v3" ? "uniswap-v3" : "uniswap-v4";
  const other: UniswapVersion = version === "v3" ? "v4" : "v3";
  const home = explorerHref(1, session);
  const answer = await fetchUniswapPositions(wallet);
  const all = answer.kind === "ok" ? answer.data.positions : [];
  const mine = all.filter((p) => p.version === version);
  // Focus (ui-jobs 557): a position is kept when either side of its pair is in focus.
  const others = all.filter((p) => p.version === other).map((p) => poolTokenKeys(1, [p.token0, p.token1]));
  return (
    <div className="py-8" data-anatomy="U3" data-uniswap-wallet={wallet}>
      <header className="mb-5">
        <DetailTopRow
          session={session}
          fallbackHref={home}
          showStamp={false}
          priceReason={ORACLE_USD_REASON[session]}
          owner={{ wallet, filterProtocol: null }}
          tools={false}
        />
        <ReadTierTitleRow id={session}>
          <h2 className="text-lg font-semibold text-foreground">{FRONT_DOOR.heading(version)}</h2>
        </ReadTierTitleRow>
      </header>
      {answer.kind !== "ok" ? (
        <p className="text-sm text-rb-500">{FRONT_DOOR.unanswered}</p>
      ) : mine.length === 0 ? (
        <p className="text-sm text-rb-500" data-uniswap-none="">
          {FRONT_DOOR.none(version)}
        </p>
      ) : (
        <PoolWalletList
          rows={mine.map((p) => ({
            key: p.id,
            href: `${home}/position/${p.id}`,
            label: FRONT_DOOR.row(p, version),
            keys: poolTokenKeys(1, [p.token0, p.token1]),
            chain: 1,
            attrs: { "data-uniswap-position-row": p.id },
          }))}
        />
      )}
      {answer.kind === "ok" && answer.data.truncated && (
        <p className="mt-3 text-sm text-rb-500">{FRONT_DOOR.truncated}</p>
      )}
      {others.length > 0 && (
        <UniswapOtherCount others={others} version={other} href={`${explorerHref(1, `uniswap-${other}`)}/${wallet}`} />
      )}
    </div>
  );
}
