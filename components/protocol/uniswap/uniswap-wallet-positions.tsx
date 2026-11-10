// A wallet's Uniswap positions on Ethereum (U3; rails-ops ui-jobs 556), at
// `/ethereum/uniswap-v3/<wallet>` and `/ethereum/uniswap-v4/<wallet>`: the
// version's positions that hold liquidity, newest first, each opening its
// page; the other version's count links its list. Ids and pairs only: each
// position's page carries the figures and their receipts.
//
// SERVER-ONLY: the read uses the bearer token.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { fetchUniswapPositions } from "@/lib/api/fetch-uniswap";
import { explorerHref } from "@/lib/shared/protocols";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import type { UniswapVersion } from "@/lib/uniswap/types";
import { FRONT_DOOR } from "@/lib/uniswap/words";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
export const isWallet = (w: string): boolean => ADDRESS.test(w);

export const ROW =
  "flex items-center gap-3 rounded-xl border border-rb-200 bg-raised px-4 py-3 transition-colors duration-150 hover:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-rb-600";

export async function UniswapWalletPositions({ version, wallet: raw }: { version: UniswapVersion; wallet: string }) {
  if (!isWallet(raw)) notFound();
  const wallet = raw.toLowerCase();
  const session = version === "v3" ? "uniswap-v3" : "uniswap-v4";
  const other: UniswapVersion = version === "v3" ? "v4" : "v3";
  const home = explorerHref(1, session);
  const answer = await fetchUniswapPositions(wallet);
  const all = answer.kind === "ok" ? answer.data.positions : [];
  const mine = all.filter((p) => p.version === version);
  const others = all.filter((p) => p.version === other).length;
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
        <h2 className="text-lg font-semibold text-foreground">{FRONT_DOOR.heading(version)}</h2>
      </header>
      {answer.kind !== "ok" ? (
        <p className="text-sm text-rb-500">{FRONT_DOOR.unanswered}</p>
      ) : mine.length === 0 ? (
        <p className="text-sm text-rb-500" data-uniswap-none="">
          {FRONT_DOOR.none(version)}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {mine.map((p) => (
            <li key={p.id}>
              <Link href={`${home}/position/${p.id}`} className={ROW} data-uniswap-position-row={p.id}>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {FRONT_DOOR.row(p, version)}
                </span>
                <ArrowRight
                  className="ml-auto h-4 w-4 shrink-0 text-blue-600 dark:text-[var(--text-link)]"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {answer.kind === "ok" && answer.data.truncated && (
        <p className="mt-3 text-sm text-rb-500">{FRONT_DOOR.truncated}</p>
      )}
      {others > 0 && (
        <p className="mt-4 text-sm">
          <Link href={`${explorerHref(1, `uniswap-${other}`)}/${wallet}`} className={INLINE_LINK}>
            {FRONT_DOOR.other(other, others)}
          </Link>
        </p>
      )}
    </div>
  );
}
