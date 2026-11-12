"use client";

// A wallet's Balancer V3 pools (U6; rails-ops ui-jobs 569): one row per
// pool the wallet holds a share of, its share with its receipt, each opening the
// pool-share page, and under it any shares staked in the pool's gauge. One
// receipts scope its ⋮ arms; the read stamp's receipt names the search that
// found the pools: Rails's index of the Vault's transfers, then the chain's logs. Under Focus (ui-jobs 557) a row stays when one
// of its pool's tokens is in focus.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Prov } from "@/components/shared/provenance";
import { HeadingTip } from "@/components/shared/tip-label";
import { ProvSection, SectionHeading, SectionMenu } from "@/components/shared/section-menu";
import { SectionReadStamp, readStampProv } from "@/components/shared/read-stamp";
import { ScopeNote, useScopedRows } from "@/components/shared/asset-scope-note";
import { assetKey } from "@/lib/shared/asset-family";
import { walletRow } from "@/lib/balancer/position";
import { finderProv, gaugeContracts, stakedProv, walletShareProv } from "@/lib/balancer/provenance";
import type { BalPositionsRead } from "@/lib/balancer/types";
import { chainMeta, type ChainId } from "@/lib/shared/chains";
import { balChain } from "@/lib/balancer/chains";
import { FRONT_DOOR, share } from "@/lib/balancer/words";
import { short } from "@/lib/uniswap/words";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";

const SCOPE = "balancer-wallet";
/** Uniswap's wallet row (components/protocol/uniswap/uniswap-wallet-positions.tsx, a server module). */
const ROW =
  "flex items-center gap-3 rounded-xl border border-rb-200 bg-raised px-4 py-3 transition-colors duration-150 hover:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-rb-600";

export function BalancerWalletList({ r, home }: { r: BalPositionsRead; home: string }) {
  const finder = finderProv(r);
  const scoped = useScopedRows(
    r.positions,
    (row) => row.tokens.map((t) => assetKey(r.chainId, t.address)),
    () => r.chainId,
  );
  const title = "Pools with a share";
  return (
    <ProvSection scope={SCOPE} data-anatomy="U6" data-balancer-wallet={r.wallet.toLowerCase()}>
      <SectionHeading
        title={title}
        stamp={
          <SectionReadStamp
            chainId={r.chainId as ChainId}
            block={r.head.block}
            blockTime={r.head.time}
            info={(at) => {
              const base = readStampProv({
                chainId: r.chainId as ChainId,
                block: r.head.block,
                at,
                what: "Every figure in this section",
                contracts: [
                  {
                    name: "Balancer V3 Vault",
                    address: r.vault,
                    reads:
                      "Transfer events from Rails's index and the chain's logs above it, balanceOf(pool, wallet), getPoolTokenInfo(pool), totalSupply(pool)",
                  },
                  ...gaugeContracts(r.positions.flatMap((p) => p.staked ?? [])),
                ],
              });
              return {
                ...base,
                summary: `Pools found — ${finder.summary.split(" — ")[1]} ${base.summary}`,
                inputs: [...(finder.inputs ?? []), ...(base.inputs ?? [])],
              };
            }}
          />
        }
        menu={<SectionMenu scope={SCOPE} title={title} />}
      >
        <p className="text-xs text-rb-500" data-anatomy="U6.1" data-balancer-found="">
          {FRONT_DOOR.found(balChain(r.chainId).name)}
        </p>
      </SectionHeading>
      {r.positions.length === 0 ? (
        <p className="mt-3 text-sm text-rb-500" data-balancer-none="">
          {FRONT_DOOR.none}
        </p>
      ) : (
        <>
          <ScopeNote scoped={scoped} noun={["pool", "pools"]} className="mt-3" />
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" {...scoped.listProps}>
            {scoped.rows.map((row) => {
              const w = walletRow(row);
              return (
                <li key={row.pool} className="flex flex-col gap-1">
                  <Link
                    href={`${home}/position/${row.pool.toLowerCase()}/${r.wallet.toLowerCase()}`}
                    className={ROW}
                    data-balancer-pool-row={row.pool.toLowerCase()}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{w.symbol}</span>
                      <span className="block text-xs text-rb-500">
                        <Prov info={walletShareProv(r, row)}>{FRONT_DOOR.rowShare(w.share)}</Prov>
                        {" · "}
                        {w.tokens.map((t) => t.symbol).join(", ")}
                      </span>
                    </span>
                    <ArrowRight
                      className="ml-auto h-4 w-4 shrink-0 text-blue-600 dark:text-[var(--text-link)]"
                      aria-hidden="true"
                    />
                  </Link>
                  {w.staked && (
                    <p
                      className="px-4 text-xs text-rb-500"
                      data-anatomy="U6.2"
                      data-balancer-staked={row.pool.toLowerCase()}
                    >
                      <HeadingTip text={FRONT_DOOR.rowStakedLabel} tip={FRONT_DOOR.stakedTip} />
                      {": "}
                      <span>
                        <Prov
                          info={stakedProv({
                            chainId: r.chainId,
                            vault: r.vault,
                            pool: row.pool,
                            wallet: r.wallet,
                            head: r.head,
                            totalSupply: row.totalSupply,
                            staked: row.staked ?? [],
                          })}
                        >
                          {share(w.staked.share)}
                        </Prov>
                      </span>
                      {w.staked.gauges.map((g) => (
                        <span key={g}>
                          {" · "}
                          <a
                            href={`${chainMeta(r.chainId as ChainId).explorerBase}/address/${g}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${INLINE_LINK} font-mono`}
                          >
                            {short(g)}
                          </a>
                        </span>
                      ))}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {r.truncated && <p className="mt-3 text-sm text-rb-500">{FRONT_DOOR.truncated(r.checked, 50)}</p>}
    </ProvSection>
  );
}
