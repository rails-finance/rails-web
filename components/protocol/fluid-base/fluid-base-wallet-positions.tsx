// A wallet's Fluid vault positions on Base (U3; rails-ops ui-jobs 574), at
// `/base/fluid/<wallet>`: the positions that hold collateral or debt, newest
// first, each opening its page. Ids and pairs only: each position's page
// carries the figures and their receipts. The layout is Aerodrome's
// (components/protocol/aerodrome/aerodrome-wallet-positions.tsx).
//
// SERVER-ONLY: the read uses the bearer token.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { DetailTopRow } from "@/components/shared/detail-back-row";
import { ReadTierTitleRow } from "@/components/shared/read-tier-tag";
import { ROW, isWallet } from "@/components/protocol/uniswap/uniswap-wallet-positions";
import { fetchFluidBasePositions } from "@/lib/api/fetch-fluid-base";
import { FRONT_DOOR } from "@/lib/fluid-base/words";
import { ORACLE_USD_REASON } from "@/lib/shared/oracle-usd-reasons";
import { explorerHref } from "@/lib/shared/protocols";

export async function FluidBaseWalletPositions({ wallet: raw }: { wallet: string }) {
  if (!isWallet(raw)) notFound();
  const wallet = raw.toLowerCase();
  const session = "fluid-base";
  const home = explorerHref(8453, session);
  const answer = await fetchFluidBasePositions(wallet);
  const all = answer.kind === "ok" ? answer.data.positions : [];
  return (
    <div className="py-8" data-anatomy="U3" data-fluid-base-wallet={wallet}>
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
          <h2 className="text-lg font-semibold text-foreground">{FRONT_DOOR.heading}</h2>
        </ReadTierTitleRow>
      </header>
      {answer.kind !== "ok" ? (
        <p className="text-sm text-rb-500">{FRONT_DOOR.unanswered}</p>
      ) : all.length === 0 ? (
        <p className="text-sm text-rb-500" data-fluid-base-none="">
          {FRONT_DOOR.none}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {all.map((p) => (
            <li key={p.id}>
              <Link href={`${home}/position/${p.id}`} className={ROW} data-fluid-base-position-row={p.id}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{FRONT_DOOR.row(p)}</span>
                  <span className="block text-xs text-rb-500">{FRONT_DOOR.rowSub(p)}</span>
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
      {answer.kind === "ok" && answer.data.empty > 0 && all.length > 0 && (
        <p className="mt-3 text-sm text-rb-500">{FRONT_DOOR.empty(answer.data.empty)}</p>
      )}
      {answer.kind === "ok" && answer.data.truncated && (
        <p className="mt-3 text-sm text-rb-500">{FRONT_DOOR.truncated}</p>
      )}
    </div>
  );
}
