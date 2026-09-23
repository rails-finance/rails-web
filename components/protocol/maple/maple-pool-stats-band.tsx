"use client";

// Maple listing header band — one quiet tile per pool carrying THE Maple
// question: of everything the pool claims to be worth, what can lenders
// actually reach right now, and what is bookkeeping over off-chain-custodied
// loans? Three figures per pool, all plain chain reads at head:
//   Liquid now      — the funds asset actually in the pool contract, the only
//                     part redeemable this block.
//   Deployed        — Σ LoanManager AUM: principal + accrued interest of the
//                     institutional loan book, whose collateral sits with
//                     custodians off-chain. The receipt carries the caveat.
//   Queue           — shares waiting for withdrawal, against the liquid cash
//                     (coverable or not, stated plainly).
// Plus the EXIT rate (what a filled withdrawal pays) and the impairment mark
// when one is live. Values stay in the muted foreground tone (no opinionated
// color); the band renders nothing when the chain read hasn't arrived so the
// listing never blocks on it.
//
// The band owns its OWN receipts scope rather than the listing driver hoisting
// one around its `headerExtra` slot: that slot is shared by every explorer, and
// a scope there would change <Prov> rendering (and switch on the dev coverage
// tripwire) for listing headers that were never written against it. Scoping
// here keeps the driver's behaviour identical for every other protocol.

import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { formatCompact } from "@/lib/shared/format-event";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import {
  poolCashProv,
  poolLoansAumProv,
  poolQueueSharesProv,
  poolExitRateProv,
  poolUnrealizedLossesProv,
} from "@/lib/maple/event-provenance";
import { Stat } from "@/components/shared/stat";
import { MAPLE_POOL_BY_KEY } from "@/lib/maple/asset-catalog";
import { mapleExitAssets } from "@/lib/maple/exit-value";
import type { MaplePoolState } from "@/lib/sources/chain/maple-pool-state";

export function MaplePoolStatsBand({ poolState }: { poolState: Record<string, MaplePoolState> }) {
  const registry = useReceiptRegistry();
  const pools = Object.values(poolState);
  if (pools.length === 0) return null;
  return (
    <ProvReceiptsScope registry={registry}>
      <div className="mb-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {pools.map((s) => {
            const cat = MAPLE_POOL_BY_KEY[s.pool];
            if (!cat) return null;
            const pctLiquid = s.totalAssets > 0 ? (s.cash / s.totalAssets) * 100 : null;
            const pctLoans = s.totalAssets > 0 ? (s.loansAum / s.totalAssets) * 100 : null;
            const queueValue = mapleExitAssets(s.raw.queueShares, s);
            const cash = formatCompact(s.cash);
            const loans = formatCompact(s.loansAum);
            const queue = formatCompact(queueValue);
            return (
              <div key={s.pool} className="rounded-xl bg-raised px-4 py-3">
                <div className="flex items-center gap-2">
                  <TokenChipIcon symbol={cat.assetSymbol} size={20} filterable={false} />
                  <span className="text-sm font-semibold">{cat.symbol}</span>
                  <span className="ml-auto text-xs tabular-nums text-rb-500">
                    <Prov info={poolExitRateProv(cat.assetSymbol, cat.symbol, s.blockNumber)}>
                      <span title={`convertToExitAssets on one share, read at block ${s.blockNumber}`}>
                        exit {s.exitRate.toFixed(4)} {cat.assetSymbol}
                      </span>
                    </Prov>
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <Stat
                    size="prominent"
                    label="Liquid now"
                    note={pctLiquid != null ? `${pctLiquid.toFixed(1)}% of pool value` : undefined}
                  >
                    <Prov info={poolCashProv(cat.assetSymbol, s.blockNumber)}>
                      <span title={cash.title}>{`${cash.display} ${cat.assetSymbol}`}</span>
                    </Prov>
                  </Stat>
                  <Stat
                    size="prominent"
                    label="Deployed to loans"
                    note={
                      pctLoans != null ? (
                        <span title="Principal + accrued interest of the institutional loan book — collateral custodied off-chain; open the receipt">
                          {pctLoans.toFixed(1)}% · off-chain custody
                        </span>
                      ) : undefined
                    }
                  >
                    <Prov info={poolLoansAumProv(cat.assetSymbol, s.blockNumber)}>
                      <span title={loans.title}>{`${loans.display} ${cat.assetSymbol}`}</span>
                    </Prov>
                  </Stat>
                  <Stat
                    size="prominent"
                    label="Withdrawal queue"
                    note={
                      s.queueShares > 0
                        ? s.cash >= queueValue
                          ? "coverable from liquid cash"
                          : "exceeds liquid cash"
                        : "empty"
                    }
                  >
                    <Prov info={poolQueueSharesProv(cat.symbol, s.blockNumber)}>
                      <span title={queue.title}>{`${queue.display} ${cat.assetSymbol}`}</span>
                    </Prov>
                  </Stat>
                </div>
                {s.unrealizedLosses > 0 && (
                  <div className="mt-2 text-xs text-rb-500">
                    <Prov info={poolUnrealizedLossesProv(cat.assetSymbol, s.blockNumber)}>
                      <span>
                        impairment live: {formatCompact(s.unrealizedLosses).display} {cat.assetSymbol} marked — exits
                        realize it
                      </span>
                    </Prov>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </ProvReceiptsScope>
  );
}
