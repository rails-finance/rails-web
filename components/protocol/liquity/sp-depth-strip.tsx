"use client";

// The Stability Pool's depth per branch beside the debt it backs (ui-jobs
// 748), on the Stability Pool roster and the branches page: each branch
// pool's BOLD, the branch debt and their ratio at one stated block, every
// figure with its receipt (lib/liquity-v2/sp-depth.ts). A read that failed
// draws one line saying so.

import { AmountText } from "@/components/shared/amount-text";
import { BlockRef } from "@/components/shared/block-ref";
import { Prov } from "@/components/shared/provenance";
import { MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import {
  boldUnits,
  poolShare,
  spBranchDebtProv,
  spDepositsProv,
  spDepthTotal,
  spShareProv,
  spTotalProv,
  type SpDepth,
} from "@/lib/liquity-v2/sp-depth";

const pct = (v: number) => `${(v * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
const DASH = <span className="text-rb-500">&ndash;</span>;

export function SpDepthStrip({ depth, className = "" }: { depth: SpDepth | null; className?: string }) {
  if (!depth) {
    return (
      <p className={`text-xs text-rb-500 ${className}`} data-sp-depth="failed">
        The Stability Pools did not answer just now; reload the page to read their depth.
      </p>
    );
  }
  const block = depth.blockNumber;
  const totalDeposits = spDepthTotal(depth, (b) => b.depositsRaw);
  const totalDebt = spDepthTotal(depth, (b) => b.debtRaw);
  const cell = "px-2 py-1 text-right tabular-nums";
  return (
    <section
      className={`max-w-2xl rounded-lg border border-rb-200 dark:border-rb-800 ${className}`}
      data-sp-depth={block}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 pt-2 text-xs">
        <h2 className="text-[11px] uppercase tracking-wider text-rb-500">Stability Pool depth</h2>
        <span className="text-[11px] text-rb-500">
          <BlockRef block={block} chainId={MAINNET_CHAIN_ID} />
        </span>
      </header>
      <div className="overflow-x-auto px-1 pb-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[11px] text-rb-500">
              <th className="px-2 py-1 text-left font-normal">Branch</th>
              <th className="px-2 py-1 text-right font-normal">In the pool</th>
              <th className="px-2 py-1 text-right font-normal">Branch debt</th>
              <th className="px-2 py-1 text-right font-normal">Pool ÷ debt</th>
            </tr>
          </thead>
          <tbody>
            {depth.branches.map((b) => {
              const d = boldUnits(b.depositsRaw);
              const debt = boldUnits(b.debtRaw);
              const share = poolShare(b.depositsRaw, b.debtRaw);
              return (
                <tr key={b.symbol} data-sp-depth-branch={b.symbol}>
                  <td className="px-2 py-1 font-medium">{b.symbol}</td>
                  <td className={cell}>
                    {d == null ? (
                      DASH
                    ) : (
                      <Prov info={spDepositsProv(b, block)} value={String(d)} symbol="BOLD">
                        <AmountText value={d} format="compact" symbol="BOLD" /> BOLD
                      </Prov>
                    )}
                  </td>
                  <td className={cell}>
                    {debt == null ? (
                      DASH
                    ) : (
                      <Prov info={spBranchDebtProv(b, block)} value={String(debt)} symbol="BOLD">
                        <AmountText value={debt} format="compact" symbol="BOLD" /> BOLD
                      </Prov>
                    )}
                  </td>
                  <td className={cell}>
                    {share == null ? (
                      DASH
                    ) : (
                      <Prov info={spShareProv(b, block)} value={pct(share)}>
                        {pct(share)}
                      </Prov>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="border-t border-rb-200 dark:border-rb-800" data-sp-depth-branch="all">
              <td className="px-2 py-1 text-rb-500">All</td>
              <td className={cell}>
                {totalDeposits == null ? (
                  DASH
                ) : (
                  <Prov info={spTotalProv("deposits", block)} value={String(totalDeposits)} symbol="BOLD">
                    <AmountText value={totalDeposits} format="compact" symbol="BOLD" /> BOLD
                  </Prov>
                )}
              </td>
              <td className={cell}>
                {totalDebt == null ? (
                  DASH
                ) : (
                  <Prov info={spTotalProv("debt", block)} value={String(totalDebt)} symbol="BOLD">
                    <AmountText value={totalDebt} format="compact" symbol="BOLD" /> BOLD
                  </Prov>
                )}
              </td>
              <td className={cell}>
                {totalDeposits == null || totalDebt == null || totalDebt <= 0 ? (
                  DASH
                ) : (
                  <Prov
                    info={{
                      kind: "derived",
                      summary: `All three pools ÷ all three branches' debt — at block ${block.toLocaleString("en-US")}.`,
                      formula: "Σ getTotalBoldDeposits() ÷ Σ getEntireBranchDebt()",
                      source: { block },
                    }}
                    value={pct(totalDeposits / totalDebt)}
                  >
                    {pct(totalDeposits / totalDebt)}
                  </Prov>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
