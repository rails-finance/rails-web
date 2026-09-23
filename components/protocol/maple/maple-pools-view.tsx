"use client";

// Maple protocol view — the two permissionless syrup pools' own state.
// ----------------------------------------------------------------------------
// One card per pool, every figure an eth_call at one head block, carrying THE
// Maple question at pool level: of everything the pool claims to be worth
// (totalAssets), what can lenders actually reach this block (the funds asset's
// balanceOf on the pool), and what is bookkeeping over off-chain-custodied
// loans (the two LoanManagers' assetsUnderManagement)?
//
// The bar is <RatioBar> on ONE axis — fractions of the pool's own totalAssets:
// fill = the liquid share, the one tick = the withdrawal queue's claim valued
// at the pool's own exit math. Tick left of the fill's edge → the queue is
// coverable from cash this block. Both measures are slices of the same pool
// value, which is what earns them one line.
//
// The two pools are never summed: one holds USDC, the other USDT, and a
// cross-pool token total would mix assets (the same refusal as the economics
// tower). No USD anywhere — Maple's own oracle pins USDC at $1 by a
// governance-set manualOverridePrice, and rendering a pin as a market reading
// is charter-forbidden; the pool's asset is the unit. Rates are the pool's
// one-share conversions displayed exactly as read (6dp-quantized) and never
// re-multiplied — the queue's value is computed the way the pool computes it,
// BigInt-exact over the raw aggregates (lib/maple/exit-value.ts).
//
// Values stay in the muted foreground tone (no opinionated color). The view
// owns ONE receipts scope across both pool cards — the same posture the other
// protocol views take (fx, MakerDAO, Liquity V1/forks, PWN): the figures are
// one block's reading of one protocol, so they belong in one receipts list,
// and every summary names its own asset or pool token, which keeps the two
// pools' rows distinct. The page-level provenance inspector is the reader's
// way in.

import { RatioBar, type RatioBarTick, pct } from "@/components/shared/ratio-bar";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { formatCompact } from "@/lib/shared/format-event";
import { MAPLE_POOL_BY_KEY, shortAddress, type MaplePool } from "@/lib/maple/asset-catalog";
import { mapleExitAssets } from "@/lib/maple/exit-value";
import {
  poolTotalAssetsProv,
  poolTotalSupplyProv,
  poolNavRateProv,
  poolExitRateProv,
  poolCashProv,
  poolLoanManagerAumProv,
  poolStrategiesAumProv,
  poolQueueSharesProv,
  poolUnrealizedLossesProv,
} from "@/lib/maple/event-provenance";
import type { MaplePoolState } from "@/lib/sources/chain/maple-pool-state";
import { MapleResidualNote } from "./maple-pools-copy";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

const amount = (v: number, symbol: string): React.ReactNode => {
  const f = formatCompact(v);
  return <span title={`${f.title} ${symbol}`}>{`${f.display} ${symbol}`}</span>;
};

/** A split row: label, amount, share of pool value. */
function SplitRow({
  label,
  value,
  share,
  prov,
  note,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  share: number | null;
  prov: Parameters<typeof Prov>[0]["info"];
  note?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[12px]">
      <span className="text-rb-500" title={note}>
        {label}
      </span>
      <span className="tabular-nums text-foreground/80">
        <Prov info={prov}>{value}</Prov>
        {share != null && <span className="text-rb-500"> · {pct(share)}</span>}
      </span>
    </div>
  );
}

function PoolCard({ s, cat }: { s: MaplePoolState; cat: MaplePool }) {
  const share = (part: number): number | null => (s.totalAssets > 0 ? part / s.totalAssets : null);
  const queueValue = mapleExitAssets(s.raw.queueShares, s);
  const queueShare = share(queueValue);
  const liquidShare = share(s.cash);
  // The identity cash + Σ AUM == totalAssets holds exact on-chain; a residual
  // here means a leg failed to read, and the card says so rather than letting
  // the split quietly understate the pool.
  const residual = s.totalAssets - s.cash - s.loansAum - s.strategiesAum;

  const ticks: RatioBarTick[] = [];
  if (queueShare != null && s.queueShares > 0)
    ticks.push({
      f: queueShare,
      kind: "neutral",
      title: `Withdrawal queue's claim on pool value (${pct(queueShare)}) — left of the liquid fill, the queue is coverable from cash this block`,
    });

  return (
    <div className="rounded-lg border border-rb-200 bg-rb-50 p-3 dark:border-rb-500/30 dark:bg-rb-500/5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <TokenChipIcon symbol={cat.assetSymbol} size={20} filterable={false} />
          <span className="text-[13px] font-semibold text-foreground">{cat.symbol}</span>
          <a
            href={explorerUrl(MAINNET_CHAIN_ID, "address", cat.pool)}
            target="_blank"
            rel="noopener noreferrer"
            className="link-external text-[11px] text-rb-500"
            title="The ERC-4626 pool contract — the share token itself"
          >
            {shortAddress(cat.pool)}
          </a>
        </div>
        <span className="shrink-0 text-[13px] tabular-nums text-foreground">
          <Prov info={poolTotalAssetsProv(cat.assetSymbol, s.blockNumber)}>
            {amount(s.totalAssets, cat.assetSymbol)}
          </Prov>
        </span>
      </div>

      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-rb-500">
        <Prov info={poolTotalSupplyProv(cat.symbol, s.blockNumber)}>
          <span title={`${formatCompact(s.totalSupply).title} ${cat.symbol}`}>
            {formatCompact(s.totalSupply).display} shares outstanding
          </span>
        </Prov>
        <Prov info={poolNavRateProv(cat.assetSymbol, cat.symbol, s.blockNumber)}>
          <span title={`convertToAssets on one share, read at block ${s.blockNumber} — shown as read`}>
            NAV {s.navRate.toFixed(4)} {cat.assetSymbol}
          </span>
        </Prov>
        <Prov info={poolExitRateProv(cat.assetSymbol, cat.symbol, s.blockNumber)}>
          <span title={`convertToExitAssets on one share, read at block ${s.blockNumber} — shown as read`}>
            exit {s.exitRate.toFixed(4)} {cat.assetSymbol}
          </span>
        </Prov>
      </div>

      <RatioBar fill={liquidShare ?? 0} ticks={ticks} />

      <div className="mt-2 space-y-1">
        <SplitRow
          label="Liquid now"
          note="The funds asset actually in the pool contract — the only part redeemable this block"
          value={amount(s.cash, cat.assetSymbol)}
          share={liquidShare}
          prov={poolCashProv(cat.assetSymbol, s.blockNumber)}
        />
        <SplitRow
          label="Fixed-term loans"
          note="The fixed-term LoanManager's assetsUnderManagement — loans that run to a maturity date, collateral custodied off-chain"
          value={amount(s.fixedTermAum, cat.assetSymbol)}
          share={share(s.fixedTermAum)}
          prov={poolLoanManagerAumProv(cat.assetSymbol, "fixed-term", s.blockNumber)}
        />
        <SplitRow
          label="Open-term loans"
          note="The open-term LoanManager's assetsUnderManagement — no maturity, callable by the delegate, collateral custodied off-chain"
          value={amount(s.openTermAum, cat.assetSymbol)}
          share={share(s.openTermAum)}
          prov={poolLoanManagerAumProv(cat.assetSymbol, "open-term", s.blockNumber)}
        />
        {s.strategiesAum > 0 && (
          <SplitRow
            label="Other strategies"
            note="Non-LoanManager strategies' assetsUnderManagement — on-chain yield strategies"
            value={amount(s.strategiesAum, cat.assetSymbol)}
            share={share(s.strategiesAum)}
            prov={poolStrategiesAumProv(cat.assetSymbol, s.blockNumber)}
          />
        )}
      </div>

      {Math.abs(residual) > 1 && (
        <MapleResidualNote
          display={formatCompact(Math.abs(residual)).display}
          symbol={cat.assetSymbol}
          over={residual < 0}
        />
      )}

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-rb-500">
        <span>
          queue{" "}
          <Prov info={poolQueueSharesProv(cat.symbol, s.blockNumber)}>
            <span className="text-foreground/80" title={`${formatCompact(s.queueShares).title} ${cat.symbol} waiting`}>
              {formatCompact(s.queueShares).display} {cat.symbol}
            </span>
          </Prov>
          {s.queueShares > 0 && (
            <>
              {" "}
              (≈ {formatCompact(queueValue).display} {cat.assetSymbol} at exit) ·{" "}
              {s.cash >= queueValue ? "coverable from liquid cash" : "exceeds liquid cash"}
            </>
          )}
          {s.queueShares === 0 && <> · empty</>}
        </span>
        {s.unrealizedLosses > 0 ? (
          <Prov info={poolUnrealizedLossesProv(cat.assetSymbol, s.blockNumber)}>
            <span>
              impairment live:{" "}
              <span className="text-foreground/80">
                {formatCompact(s.unrealizedLosses).display} {cat.assetSymbol}
              </span>{" "}
              marked — exits realize it
            </span>
          </Prov>
        ) : (
          <span title="unrealizedLosses is zero, so convertToAssets and convertToExitAssets return the same figure">
            no impairment marked — NAV and exit rates are equal
          </span>
        )}
      </div>
    </div>
  );
}

// The stamp's prose lives in maple-pools-copy.tsx (the register gate scans
// that module in this file's place — see INTRO_SCAN_SWAPS); re-exported here
// so consumers keep one import site.
export { MaplePoolsStamp } from "./maple-pools-copy";

export function MaplePoolsView({ pools }: { pools: MaplePoolState[] }) {
  const registry = useReceiptRegistry();
  if (pools.length === 0) {
    return <p className="text-sm text-rb-500">The pools could not be read from chain at this block.</p>;
  }
  return (
    <ProvReceiptsScope registry={registry}>
      <div className="grid gap-2.5 lg:grid-cols-2">
        {pools.map((s) => {
          const cat = MAPLE_POOL_BY_KEY[s.pool];
          if (!cat) return null;
          return <PoolCard key={s.pool} s={s} cat={cat} />;
        })}
      </div>
    </ProvReceiptsScope>
  );
}
