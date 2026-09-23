"use client";

// f(x) listing header band — one quiet tile per pool with the pool-wide
// SETTLED aggregates: open/ever position counts, total collateral (normalized
// units + oracle USD) and total fxUSD debt, footnoted with the blocks the
// numbers were read at. These are the sweep's pool-level getTotalRawColls /
// getTotalRawDebts views — the same settled lane as every per-position value,
// never event arithmetic. Values stay in the muted foreground tone (no
// opinionated color); the band renders nothing when stats haven't arrived
// (pre-sweep or fetch failure) so the listing never blocks on it.

import { Stat } from "@/components/shared/stat";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { formatCompact, formatUsd } from "@/lib/shared/format-event";
import type { FxPoolStatsSummary } from "@/lib/sources/api/fx-stats";

export function FxPoolStatsBand({ pools }: { pools: FxPoolStatsSummary[] }) {
  if (pools.length === 0) return null;
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-2">
      {pools.map((p) => {
        const coll = p.totalColls != null ? formatCompact(p.totalColls) : null;
        const debt = p.totalDebts != null ? formatCompact(p.totalDebts) : null;
        return (
          <div key={p.pool} className="rounded-xl bg-raised px-4 py-3">
            <div className="flex items-center gap-2">
              <TokenChipIcon symbol={p.poolSymbol} size={20} filterable={false} />
              <span className="text-sm font-semibold">{p.poolSymbol} pool</span>
              {p.oraclePriceUsd != null && (
                <span
                  className="ml-auto text-xs tabular-nums text-rb-500"
                  title={
                    p.oraclePriceBlock != null
                      ? `Pool oracle price per ${p.normalizedSymbol}, read at block ${p.oraclePriceBlock}`
                      : undefined
                  }
                >
                  {p.normalizedSymbol} {formatUsd(p.oraclePriceUsd)}
                </span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Stat
                size="prominent"
                label="Open positions"
                note={p.positionsEver != null ? `of ${p.positionsEver} ever` : undefined}
              >
                {p.positionsOpen ?? "—"}
              </Stat>
              <Stat
                size="prominent"
                label="Collateral"
                note={p.totalCollUsd != null ? formatUsd(p.totalCollUsd) : undefined}
              >
                {coll ? <span title={coll.title}>{`${coll.display} ${p.normalizedSymbol}`}</span> : "—"}
              </Stat>
              <Stat
                size="prominent"
                label="Debt"
                note={
                  p.settledBlock != null ? (
                    <span title="Pool totals are the contract's own settled views, read at this block">
                      settled @ {p.settledBlock}
                    </span>
                  ) : undefined
                }
              >
                {debt ? <span title={debt.title}>{`${debt.display} fxUSD`}</span> : "—"}
              </Stat>
            </div>
          </div>
        );
      })}
    </div>
  );
}
