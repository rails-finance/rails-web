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
// Values stay in the muted foreground tone (no opinionated color). Each pool
// card is its own section (decision 0059): the pool's name opens its page
// (/ethereum/maple/pools/<pool>), the read stamp states the time of the read
// and the ⋮ arms the inspector on that card alone.

import { RatioBar, type RatioBarTick, pct } from "@/components/shared/ratio-bar";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { serverReadAt, stampServerRead } from "@/lib/shared/server-head-read";
import { Prov, ProvReceiptsScope, useReceiptRegistry, type Provenance } from "@/components/shared/provenance";
import Link from "next/link";
import { MAPLE_POOL_BY_KEY, shortAddress, type MaplePool } from "@/lib/maple/asset-catalog";
import { ProvSection, SectionMenu } from "@/components/shared/section-menu";
import { readStampProv, SectionReadStamp, type ReadContract } from "@/components/shared/read-stamp";
import { maplePoolHref, maplePoolPositionsHref } from "@/lib/vaults/routes";
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
import {
  MapleLoansNote,
  MapleResidualNote,
  mapleNavTip,
  mapleExitTip,
  MAPLE_NO_IMPAIRMENT_TIP,
} from "./maple-pools-copy";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { formatCompactTitled } from "@/lib/shared/format-compact";

const amount = (v: number, symbol: string): React.ReactNode => {
  const f = formatCompactTitled(v);
  return <span title={`${f.title} ${symbol}`}>{`${f.display} ${symbol}`}</span>;
};

/** The pool's total at the precision its parts are shown at: past a billion
 *  the compact form reads "1B", beside parts in millions to one decimal. */
const poolTotal = (v: number, symbol: string): React.ReactNode => {
  if (Math.abs(v) < 1e9) return amount(v, symbol);
  const f = formatCompactTitled(v);
  const millions = (v / 1e6).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return <span title={`${f.title} ${symbol}`}>{`${millions}M ${symbol}`}</span>;
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
  const readBy = serverReadAt(s.head, s.blockNumber);
  const withRead = (p: Provenance) => stampServerRead(p, readBy);
  const share = (part: number): number | null => (s.totalAssets > 0 ? part / s.totalAssets : null);
  const queueValue = mapleExitAssets(s.raw.queueShares, s);
  const queueShare = share(queueValue);
  const liquidShare = share(s.cash);
  // Cash plus every strategy's assets is the pool's total; a residual of a
  // hundredth of a percent or more means a leg failed to read, and the card
  // says so rather than letting the split quietly understate the pool.
  const residual = s.totalAssets - s.cash - s.loansAum - s.strategiesAum;
  const scope = `maple-pool-${cat.key}`;
  const href = maplePoolHref(cat.key);

  const ticks: RatioBarTick[] = [];
  if (queueShare != null && s.queueShares > 0)
    ticks.push({
      f: queueShare,
      kind: "neutral",
      title: `Withdrawal queue's claim on pool value (${pct(queueShare)}): left of the liquid fill, the queue is coverable from cash this block`,
    });

  return (
    <ProvSection scope={scope} data-maple-pool-card={cat.key} data-overview-market={cat.key}>
      <div className="rounded-lg border border-rb-200 bg-rb-50 p-3 dark:border-rb-500/30 dark:bg-rb-500/5">
        <div className="flex items-center justify-between gap-2">
          <Link
            href={href}
            prefetch={false}
            className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-foreground hover:text-blue-600 dark:hover:text-[var(--text-link)]"
            data-link="maple-pool-page"
          >
            <TokenChipIcon symbol={cat.assetSymbol} size={20} filterable={false} />
            <span>{cat.symbol}</span>
            <span aria-hidden className="font-normal text-rb-500">
              →
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <SectionReadStamp
              chainId={MAINNET_CHAIN_ID}
              block={s.blockNumber}
              readBy={readBy}
              info={(at) =>
                readStampProv({
                  chainId: MAINNET_CHAIN_ID,
                  block: s.blockNumber,
                  at,
                  readBy,
                  what: `Every figure on the ${cat.symbol} card`,
                  contracts: poolReadContracts(cat),
                })
              }
            />
            <SectionMenu
              scope={scope}
              title={cat.symbol}
              links={[
                {
                  item: "pool-page",
                  title: `The ${cat.symbol} pool`,
                  subtitle: "Its page: the card and where the assets are",
                  href,
                  internal: true,
                },
                {
                  item: "positions",
                  title: "Positions in this pool",
                  subtitle: `Every lender holding ${cat.symbol}`,
                  href: maplePoolPositionsHref(cat.key),
                  internal: true,
                },
                {
                  item: "vault-contract",
                  title: "Pool contract",
                  subtitle: `${shortAddress(cat.pool)} on Etherscan`,
                  href: explorerUrl(MAINNET_CHAIN_ID, "address", cat.pool),
                },
              ]}
            />
          </div>
        </div>
        <div className="mt-1 text-[15px] tabular-nums text-foreground">
          <Prov info={withRead(poolTotalAssetsProv(cat.assetSymbol, s.blockNumber))}>
            {poolTotal(s.totalAssets, cat.assetSymbol)}
          </Prov>
        </div>

        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-rb-500">
          <Prov info={withRead(poolTotalSupplyProv(cat.symbol, s.blockNumber))}>
            <span title={`${formatCompactTitled(s.totalSupply).title} ${cat.symbol}`}>
              {formatCompactTitled(s.totalSupply).display} shares outstanding
            </span>
          </Prov>
          <Prov info={withRead(poolNavRateProv(cat.assetSymbol, cat.symbol, s.blockNumber))}>
            <span title={mapleNavTip()}>
              NAV, the pool&rsquo;s value per share: {s.navRate.toFixed(4)} {cat.assetSymbol}
            </span>
          </Prov>
          <Prov info={withRead(poolExitRateProv(cat.assetSymbol, cat.symbol, s.blockNumber))}>
            <span title={mapleExitTip()}>
              exit {s.exitRate.toFixed(4)} {cat.assetSymbol}
            </span>
          </Prov>
        </div>

        <RatioBar fill={liquidShare ?? 0} ticks={ticks} />

        <div className="mt-2 space-y-1">
          <SplitRow
            label="Liquid now"
            note="The asset in the pool: the only part a withdrawal can be paid from at once"
            value={amount(s.cash, cat.assetSymbol)}
            share={liquidShare}
            prov={withRead(poolCashProv(cat.assetSymbol, s.blockNumber))}
          />
          <SplitRow
            label="Fixed-term loans"
            note="Loans that run to a maturity date; custodians hold their collateral off the chain"
            value={amount(s.fixedTermAum, cat.assetSymbol)}
            share={share(s.fixedTermAum)}
            prov={withRead(poolLoanManagerAumProv(cat.assetSymbol, "fixed-term", s.blockNumber))}
          />
          <SplitRow
            label="Open-term loans"
            note="Loans with no maturity, which the pool delegate can call; custodians hold their collateral off the chain"
            value={amount(s.openTermAum, cat.assetSymbol)}
            share={share(s.openTermAum)}
            prov={withRead(poolLoanManagerAumProv(cat.assetSymbol, "open-term", s.blockNumber))}
          />
          {/* Dust (under 0.05% of the pool) rounds to 0.0% and says nothing;
            the residual check below still counts it. */}
          {s.strategiesAum > 0 && (share(s.strategiesAum) ?? 0) >= 0.0005 && (
            <SplitRow
              label="Other strategies"
              note="On-chain strategies the pool lends through, apart from its loans"
              value={amount(s.strategiesAum, cat.assetSymbol)}
              share={share(s.strategiesAum)}
              prov={withRead(poolStrategiesAumProv(cat.assetSymbol, s.blockNumber))}
            />
          )}
        </div>

        <MapleLoansNote />

        {Math.abs(residual) * 10_000 >= s.totalAssets && residual !== 0 && (
          <MapleResidualNote
            display={formatCompactTitled(Math.abs(residual)).display}
            symbol={cat.assetSymbol}
            over={residual < 0}
          />
        )}

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-rb-500">
          <span>
            queue{" "}
            <Prov info={withRead(poolQueueSharesProv(cat.symbol, s.blockNumber))}>
              <span
                className="text-foreground/80"
                title={`${formatCompactTitled(s.queueShares).title} ${cat.symbol} waiting`}
              >
                {formatCompactTitled(s.queueShares).display} {cat.symbol}
              </span>
            </Prov>
            {s.queueShares > 0 && (
              <>
                {" "}
                (≈ {formatCompactTitled(queueValue).display} {cat.assetSymbol} at exit) ·{" "}
                {s.cash >= queueValue ? "coverable from liquid cash" : "exceeds liquid cash"}
              </>
            )}
            {s.queueShares === 0 && <> · empty</>}
          </span>
          {s.unrealizedLosses > 0 ? (
            <Prov info={withRead(poolUnrealizedLossesProv(cat.assetSymbol, s.blockNumber))}>
              <span>
                impairment live:{" "}
                <span className="text-foreground/80">
                  {formatCompactTitled(s.unrealizedLosses).display} {cat.assetSymbol}
                </span>{" "}
                marked: exits realize it
              </span>
            </Prov>
          ) : (
            <span title={MAPLE_NO_IMPAIRMENT_TIP}>no impairment marked: NAV and exit rates are equal</span>
          )}
        </div>
      </div>
    </ProvSection>
  );
}

/** The contracts behind a pool card's figures, for its read stamp's receipt. */
function poolReadContracts(cat: MaplePool): ReadContract[] {
  return [
    {
      name: cat.symbol,
      address: cat.pool,
      reads: "totalAssets(), totalSupply(), unrealizedLosses(), convertToAssets(), convertToExitAssets()",
    },
    { name: cat.assetSymbol, address: cat.asset, reads: `balanceOf(${shortAddress(cat.pool)})` },
    { name: "PoolManager", address: cat.poolManager, reads: "strategyListLength(), strategyList(i)" },
    { name: "Fixed-term LoanManager", address: cat.fixedTermLoanManager, reads: "assetsUnderManagement()" },
    { name: "Open-term LoanManager", address: cat.openTermLoanManager, reads: "assetsUnderManagement()" },
    { name: "WithdrawalManager", address: cat.withdrawalManager, reads: "totalShares()" },
  ];
}

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
