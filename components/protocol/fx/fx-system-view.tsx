"use client";

// The f(x) V2 PROTOCOL view (/fx/pools) — each pool's tick ladder, and the
// ladder reconciled against the pool's own totals.
//
// f(x) is the protocol where this view is the most natural fit on the roster:
// funding, rebalances, liquidations and redemptions all consume WHOLE TICKS,
// with no per-position event for any of it. A position page can only reconcile
// that silence one position at a time (implied vs settled — the socialized
// lane); the tick ladder is the level the protocol actually operates on, and
// per-position pages structurally cannot state it. So the ladder is the
// subject here, not a decoration.
//
// The axes are f(x)'s own — deliberately NOT Fluid's per-vault rung ladder and
// not Compound's utilisation. One axis: the debt ratio, judged at the oracle's
// MIN leg because that is the leg the protocol's own rebalance and liquidation
// sweeps judge a tick at (a POSITION's stated ratio uses the anchor leg — the
// two judgments coexist in the protocol and are kept apart here, named). On
// that axis sit the three rungs (borrow cap / rebalance / liquidation) and
// every occupied tick, so the distribution and the thresholds can be read
// against each other. The distribution is one series in the structural blue,
// heights on a stated square-root scale, the liquidation rung the one factual
// red — no opinionated color anywhere, and the tick table below carries every
// figure exactly (the drawing is the overview, the table is the record).
//
// The spine is the reconciliation, checked in integer share space on every
// read: Σ tick debt shares == the pool's total debt shares, exactly. The
// collateral side reconciles to a named gap — collateral held by debt-free
// positions, which belong to no tick.
//
// No animation: hundreds of rows, and a framer node per row is what froze the
// listing shells (see the listing entrance incident).

import { useState } from "react";
import Link from "next/link";
import { Prov, ProvReceiptsScope, useReceiptRegistry } from "@/components/shared/provenance";
import { VitalsBand } from "@/components/shared/vitals-band";
import { Stat } from "@/components/shared/stat";
import { formatCompact, formatExact, formatNumber, formatTinyNonZero } from "@/lib/utils/format";
import type { FxPoolSystem, FxSystemChainResponse, FxTickRow } from "@/lib/sources/chain/fx-system";
import {
  poolRosterProv,
  poolCollateralProv,
  poolDebtProv,
  totalDebtAllPoolsProv,
  positionsMintedProv,
  treeNodesProv,
  indexProv,
  indexIdentityProv,
  fundingRateProv,
  fundingCheckpointProv,
  oracleLegProv,
  rungProv,
  maxRedeemProv,
  pausedProv,
  capacityProv,
  occupiedTicksProv,
  topTickProv,
  tickIdProv,
  totalPositionsMintedProv,
  tickDebtProv,
  tickCollProv,
  tickRatioProv,
  tickShareProv,
  ladderReconcileProv,
  collOutsideLadderProv,
  dustTicksProv,
} from "@/lib/fx/system-provenance";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";

// A percentage with the false-zero guard: a tick holding 1e-12 fxUSD of the
// pool must never render as "0.0%" — holding something is why it is listed.
const pctOf = (x: number, dp: number) => {
  const p = x * 100;
  const s = p.toFixed(dp);
  if (p !== 0 && parseFloat(s) === 0) return `${formatTinyNonZero(p)}%`;
  return `${s}%`;
};

/** A token amount with the same guard — dust must read as dust, not as zero. */
const amt = (v: number): string => {
  if (v !== 0 && Math.abs(v) < 0.0001) return formatTinyNonZero(v);
  return formatNumber(v);
};

const poolLabel = (p: FxPoolSystem) => `${p.tokenSymbol} pool`;

/** Age of a unix timestamp against the snapshot block's own timestamp — the
 *  page never consults the wall clock, so SSR and client agree. */
const ageText = (ts: number, blockTs: number): string => {
  const s = Math.max(0, blockTs - ts);
  if (s < 90) return `${s}s`;
  if (s < 5400) return `${Math.round(s / 60)}m`;
  if (s < 129600) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
};

// ── Pool state ───────────────────────────────────────────────────────────────

function PoolStateCard({ p }: { p: FxPoolSystem }) {
  const label = poolLabel(p);
  return (
    <div className="rounded-xl bg-raised px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">The pool&rsquo;s own book</span>
        <span className="text-[11px] text-rb-500">
          {p.borrowPaused && (
            <Prov info={pausedProv("borrow", label, p.address)}>
              <span>borrow paused</span>
            </Prov>
          )}
          {p.borrowPaused && p.redeemPaused && " · "}
          {p.redeemPaused && (
            <Prov info={pausedProv("redeem", label, p.address)}>
              <span>redeem paused</span>
            </Prov>
          )}
          {!p.borrowPaused && !p.redeemPaused && (
            <Prov info={pausedProv("borrow", label, p.address)}>
              <span>borrow &amp; redeem open</span>
            </Prov>
          )}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        <Stat
          label={`Collateral (${p.normalizedSymbol}, normalized)`}
          note={
            <>
              manager book:{" "}
              <Prov
                info={capacityProv("collateral", label, p.tokenSymbol)}
                value={formatExact(p.collateralBalanceToken)}
              >
                {formatCompact(p.collateralBalanceToken)}
              </Prov>{" "}
              of{" "}
              <Prov
                info={capacityProv("collateral", label, p.tokenSymbol)}
                value={formatExact(p.collateralCapacityToken)}
                echo
              >
                {formatCompact(p.collateralCapacityToken)}
              </Prov>{" "}
              {p.tokenSymbol} cap (token units)
            </>
          }
        >
          <Prov info={poolCollateralProv(label, p.address, p.normalizedSymbol)} value={formatExact(p.totalRawColl)}>
            {formatCompact(p.totalRawColl)} {p.normalizedSymbol}
          </Prov>
        </Stat>
        <Stat
          label="Debt (fxUSD)"
          note={
            <>
              cap{" "}
              <Prov info={capacityProv("debt", label, p.tokenSymbol)} value={formatExact(p.debtCapacity)}>
                {formatCompact(p.debtCapacity)}
              </Prov>{" "}
              fxUSD
            </>
          }
        >
          <Prov info={poolDebtProv(label, p.address)} value={formatExact(p.totalRawDebt)}>
            {formatCompact(p.totalRawDebt)} fxUSD
          </Prov>
        </Stat>
        <Stat label="Positions minted">
          <Prov info={positionsMintedProv(label, p.address)} value={formatExact(p.positionsMinted)}>
            {p.positionsMinted.toLocaleString("en-US")}
          </Prov>
        </Stat>
        <Stat label="Tick-tree nodes allocated">
          <Prov info={treeNodesProv(label, p.address)} value={formatExact(p.treeNodes)}>
            {p.treeNodes.toLocaleString("en-US")}
          </Prov>
        </Stat>
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
        Collateral is the pool&rsquo;s rate-normalized accounting unit, not the token as deposited — the manager&rsquo;s
        token-unit line above is the other system, named. The node count against{" "}
        <Prov info={occupiedTicksProv(poolLabel(p), p.address)} value={formatExact(p.occupiedTicks)} echo>
          <span className="tabular-nums text-foreground">{p.occupiedTicks}</span>
        </Prov>{" "}
        live ticks is the fossil record of the ladder being rearranged: every rebalance, tick liquidation and redemption
        retires a node.
      </p>
    </div>
  );
}

// ── Funding ──────────────────────────────────────────────────────────────────

function FundingCard({ p, blockTs }: { p: FxPoolSystem; blockTs: number }) {
  const label = poolLabel(p);
  return (
    <div className="rounded-xl bg-raised px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">Funding — the eventless mutation</span>
        <span className="text-[11px] tabular-nums text-rb-500">
          checkpointed{" "}
          <Prov info={fundingCheckpointProv(label, p.address)} value={String(p.fundingCheckpoint)}>
            {ageText(p.fundingCheckpoint, blockTs)} ago
          </Prov>
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        <Stat label="Funding rate (annual, on collateral)">
          <Prov info={fundingRateProv(label, p.address)} value={formatExact(p.fundingRatioAnnual * 100)}>
            {pctOf(p.fundingRatioAnnual, 2)}
          </Prov>
        </Stat>
        <Stat label="Redemption per-tick cap">
          <Prov info={maxRedeemProv(label, p.address)} value={formatExact(p.maxRedeemPerTick * 100)}>
            {pctOf(p.maxRedeemPerTick, 0)}
          </Prov>
        </Stat>
        <Stat label="Debt index (a share owes ×)">
          <Prov info={indexProv("debt", label, p.address)} value={formatExact(p.debtIndexMultiplier)}>
            ×{p.debtIndexMultiplier.toFixed(6)}
          </Prov>
        </Stat>
        <Stat label="Collateral index (a share holds ÷)">
          <Prov info={indexProv("coll", label, p.address)} value={formatExact(p.collIndexMultiplier)}>
            ÷{p.collIndexMultiplier.toFixed(6)}
          </Prov>
        </Stat>
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
        Two dials, no events. Funding is charged into the <em>collateral</em> index — every position in the pool holds
        less, pro-rata, each time it turns — and write-offs turn the same dials. Both started at exactly ×1.0.{" "}
        <Prov info={indexIdentityProv(label, p.address, p.indexIdentityExact)}>
          {p.indexIdentityExact ? (
            <span>
              Re-checked on this read: shares × index equals the pool&rsquo;s own raw totals,{" "}
              <span className="text-foreground">exact in integers</span> on both sides.
            </span>
          ) : (
            <span className="text-red-500">
              The shares × index identity did not close on this read — treat the derived figures below as suspect.
            </span>
          )}
        </Prov>
      </p>
    </div>
  );
}

// ── Oracle & rungs ───────────────────────────────────────────────────────────

function OracleCard({ p }: { p: FxPoolSystem }) {
  const label = poolLabel(p);
  return (
    <div className="rounded-xl bg-raised px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">Three prices, three jobs</span>
        <a
          href={explorerUrl(MAINNET_CHAIN_ID, "address", p.oracle)}
          target="_blank"
          rel="noopener noreferrer"
          className="link-external text-[11px] text-rb-500"
        >
          oracle
        </a>
      </div>

      <div className="mt-3 space-y-1.5 text-xs tabular-nums">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-rb-500">min — judges ticks (this page)</span>
          <Prov
            info={oracleLegProv("min", label, p.address, p.oracle, p.normalizedSymbol)}
            value={formatExact(p.priceMin)}
          >
            <span className="text-foreground">${formatNumber(p.priceMin)}</span>
          </Prov>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-rb-500">anchor — judges positions</span>
          <Prov
            info={oracleLegProv("anchor", label, p.address, p.oracle, p.normalizedSymbol)}
            value={formatExact(p.priceAnchor)}
          >
            <span className="text-foreground">${formatNumber(p.priceAnchor)}</span>
          </Prov>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-rb-500">max — prices redemption</span>
          <Prov
            info={oracleLegProv("max", label, p.address, p.oracle, p.normalizedSymbol)}
            value={formatExact(p.priceMax)}
          >
            <span className="text-foreground">${formatNumber(p.priceMax)}</span>
          </Prov>
        </div>
      </div>

      <p className="mt-2.5 text-[11px] leading-relaxed text-rb-500">
        USD per {p.normalizedSymbol} (the normalized unit). The protocol itself splits the jobs: a position&rsquo;s
        stated debt ratio is judged at the anchor, the rebalance and liquidation sweeps judge a whole tick at the min,
        and a redeemer&rsquo;s collateral is priced at the max. Every tick ratio below therefore uses the min leg — the
        engines&rsquo; own axis.
      </p>
    </div>
  );
}

// ── The reconciliation — the spine ───────────────────────────────────────────

function ReconcileCard({ p }: { p: FxPoolSystem }) {
  const label = poolLabel(p);
  return (
    <div className="rounded-xl bg-raised px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">Every debt share accounted for</span>
        <span className="text-[11px] tabular-nums text-rb-500">
          <Prov info={occupiedTicksProv(label, p.address)} value={formatExact(p.occupiedTicks)}>
            {p.occupiedTicks} ticks
          </Prov>
          {p.topTick != null && (
            <>
              {" · top "}
              <Prov info={topTickProv(label, p.address)} value={formatExact(p.topTick)}>
                {p.topTick}
              </Prov>
            </>
          )}
        </span>
      </div>

      <div className="mt-3 space-y-1.5 text-xs tabular-nums">
        <div className="flex items-baseline justify-between gap-2">
          <span className="shrink-0 text-rb-500">every tick&apos;s debt shares, added up</span>
          <Prov
            info={ladderReconcileProv(label, p.address, p.debtSharesReconcile, p.occupiedTicks)}
            value={p.tickDebtSharesSumRaw}
          >
            <span className="break-all text-right text-foreground">{p.tickDebtSharesSumRaw}</span>
          </Prov>
        </div>
        <div className="flex items-baseline justify-between gap-2 border-t border-rb-200 pt-1.5 dark:border-rb-700">
          <span className="shrink-0 text-foreground">= the pool&rsquo;s total debt shares</span>
          <Prov
            info={ladderReconcileProv(label, p.address, p.debtSharesReconcile, p.occupiedTicks)}
            value={p.totalDebtSharesRaw}
            echo
          >
            <span className="break-all text-right text-foreground">{p.totalDebtSharesRaw}</span>
          </Prov>
        </div>
      </div>

      <div className="mt-2.5 text-[11px] leading-relaxed">
        <Prov info={ladderReconcileProv(label, p.address, p.debtSharesReconcile, p.occupiedTicks)}>
          {p.debtSharesReconcile ? (
            <span className="text-rb-500">
              Reconciles exactly — residual <span className="tabular-nums text-foreground">0</span>, checked in raw
              integer share space before anything is scaled. Every fxUSD of this pool&rsquo;s debt sits in exactly one
              tick below.
            </span>
          ) : (
            <span className="text-red-500">
              Does not reconcile — the ladder read is missing debt the pool says exists. The tick figures below are this
              read&rsquo;s, but the residual is the headline.
            </span>
          )}
        </Prov>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-rb-500">
        Collateral reconciles to a named gap:{" "}
        <Prov
          info={collOutsideLadderProv(label, p.address, p.normalizedSymbol)}
          value={formatExact(p.collOutsideLadder)}
        >
          <span className="tabular-nums text-foreground">
            {amt(p.collOutsideLadder)} {p.normalizedSymbol}
          </span>
        </Prov>{" "}
        sits outside the ladder entirely, held by positions with no debt — no debt, no tick, no rung.
        {p.dustTicks > 0 && (
          <>
            {" "}
            And{" "}
            <Prov info={dustTicksProv(label, p.address, p.dustPastLiquidate)} value={formatExact(p.dustTicks)}>
              <span className="tabular-nums text-foreground">{p.dustTicks}</span>
            </Prov>{" "}
            of the {p.occupiedTicks} ticks hold only dust — under 10⁻⁹ fxUSD, the exact line the protocol&rsquo;s own
            sweeps skip a tick at
            {p.dustPastLiquidate > 0 && (
              <>
                ; {p.dustPastLiquidate} of them sit past the liquidation rung and will simply never be cleared, because
                clearing them pays less than it costs
              </>
            )}
            . Counted in the totals, left out of the drawing.
          </>
        )}
      </p>
    </div>
  );
}

// ── The ladder drawing ───────────────────────────────────────────────────────

/** One series (fxUSD debt), one axis (debt ratio at the min leg), rungs as
 *  hairlines — the RatioBar vocabulary stretched vertical: structural blue for
 *  the data, neutral hairlines for reference rungs, red only for the factual
 *  liquidation line. Heights are on a square-root scale (stated in the
 *  caption) so the small ticks stay visible next to a tick holding a quarter
 *  of the pool; the table below carries every figure exactly. */
function LadderStrip({ p }: { p: FxPoolSystem }) {
  const label = poolLabel(p);
  const drawn = p.ticks.filter((t) => !t.dust && t.debtRatio != null);
  const maxDebt = drawn.reduce((m, t) => Math.max(m, t.rawDebt), 0);
  if (maxDebt === 0) {
    return <p className="text-[11px] text-rb-500">No tick above the dust line to draw.</p>;
  }

  const x = (ratio: number) => Math.min(1, Math.max(0, ratio)) * 100;

  return (
    <div>
      <div className="relative h-28 overflow-hidden rounded-md bg-rb-100 dark:bg-rb-500/10">
        {/* rungs */}
        <div
          className="absolute inset-y-0 w-px bg-foreground/40"
          style={{ left: `${x(p.maxBorrowRatio)}%` }}
          title={`Borrow cap · ${pctOf(p.maxBorrowRatio, 2)} — positions can be opened or adjusted only at or under this ratio (anchor leg)`}
        />
        <div
          className="absolute inset-y-0 w-px bg-foreground/40"
          style={{ left: `${x(p.rebalanceRatio)}%` }}
          title={`Rebalance rung · ${pctOf(p.rebalanceRatio, 0)} (min leg) — from here the whole tick can be rebalanced, +${pctOf(p.rebalanceBonus, 1)} bonus`}
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-red-500"
          style={{ left: `${x(p.liquidateRatio)}%` }}
          title={`Liquidation rung · ${pctOf(p.liquidateRatio, 0)} (min leg) — from here the whole tick is liquidatable, +${pctOf(p.liquidateBonus, 1)} bonus`}
        />
        {/* ticks */}
        {drawn.map((t) => (
          <div
            key={t.tick}
            className="absolute bottom-0 w-[3px] -translate-x-1/2 rounded-t-sm bg-blue-500"
            style={{
              left: `${x(t.debtRatio as number)}%`,
              height: `${Math.max(4, Math.sqrt(t.rawDebt / maxDebt) * 100)}%`,
            }}
            title={`tick ${t.tick} · ratio ${pctOf(t.debtRatio as number, 2)} (min leg) · ${formatCompact(t.rawDebt)} fxUSD · ${amt(t.rawColl)} ${p.normalizedSymbol}`}
          />
        ))}
      </div>
      {/* Axis scale labels — visualization chrome, not stats (tripwire-exempt). */}
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-rb-400" data-prov-exempt="">
        <span>0%</span>
        <span>25%</span>
        <span>50%</span>
        <span>75%</span>
        <span>100% debt ratio (min leg)</span>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] tabular-nums text-rb-500">
        <span>
          borrow to{" "}
          <Prov info={rungProv("open", label, p.address)} value={formatExact(p.maxBorrowRatio * 100)}>
            <span className="text-foreground">{pctOf(p.maxBorrowRatio, 2)}</span>
          </Prov>
        </span>
        <span>
          rebalance a tick from{" "}
          <Prov info={rungProv("rebalance", label, p.address)} value={formatExact(p.rebalanceRatio * 100)}>
            <span className="text-foreground">{pctOf(p.rebalanceRatio, 0)}</span>
          </Prov>{" "}
          (+{pctOf(p.rebalanceBonus, 1)} bonus)
        </span>
        <span>
          liquidate it from{" "}
          <Prov info={rungProv("liquidate", label, p.address)} value={formatExact(p.liquidateRatio * 100)}>
            <span className="text-foreground">{pctOf(p.liquidateRatio, 0)}</span>
          </Prov>{" "}
          (+{pctOf(p.liquidateBonus, 1)} bonus)
        </span>
        <span>
          redeem ≤{" "}
          <Prov info={maxRedeemProv(label, p.address)} value={formatExact(p.maxRedeemPerTick * 100)} echo>
            <span className="text-foreground">{pctOf(p.maxRedeemPerTick, 0)}</span>
          </Prov>{" "}
          of a tick per pass, top tick first
        </span>
      </div>

      <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-rb-500">
        Each column is one occupied tick at its current debt ratio; column heights follow a square-root scale of the
        tick&rsquo;s fxUSD debt so the small ticks stay visible beside the largest (hover any column for the exact
        figures; the table below is the full record). Funding moves every column right at once — the ladder drifts
        toward the rungs while every position inside stands still. Adjacent ticks are 0.15% apart and may overlap in the
        drawing, never in the table.
      </p>
    </div>
  );
}

// ── The tick table ───────────────────────────────────────────────────────────

function TickRow({ p, t }: { p: FxPoolSystem; t: FxTickRow }) {
  const label = poolLabel(p);
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-4 py-2 sm:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)] sm:items-baseline">
      <div className="text-xs tabular-nums text-foreground">
        <Prov info={tickIdProv(label, p.address, t.tick)} value={String(t.tick)}>
          {t.tick}
        </Prov>
      </div>
      <div className="text-xs tabular-nums">
        {t.debtRatio != null ? (
          <Prov info={tickRatioProv(label, p.address, t.tick)} value={formatExact(t.debtRatio * 100)}>
            <span className="text-foreground">{pctOf(t.debtRatio, 2)}</span>
          </Prov>
        ) : (
          <span className="text-rb-400" title="Debt against zero collateral — a pure bad-debt bucket; no ratio exists.">
            —
          </span>
        )}
        {t.pastLiquidate && <span className="ml-1.5 text-[10px] text-rb-500">past the liquidation rung</span>}
      </div>
      <div className="text-xs tabular-nums text-foreground">
        <Prov info={tickDebtProv(label, p.address, t.tick, t.debtSharesRaw)} value={formatExact(t.rawDebt)}>
          {t.rawDebt !== 0 && t.rawDebt < 0.01 ? formatTinyNonZero(t.rawDebt) : formatCompact(t.rawDebt)}
        </Prov>{" "}
        <span className="text-rb-500">fxUSD</span>
      </div>
      <div className="text-xs tabular-nums text-rb-500">
        <Prov info={tickShareProv(label, p.address, t.tick)} value={formatExact(t.shareOfDebt * 100)}>
          {pctOf(t.shareOfDebt, 2)}
        </Prov>
      </div>
      <div className="text-xs tabular-nums text-rb-500">
        <Prov
          info={tickCollProv(label, p.address, t.tick, t.collSharesRaw, p.normalizedSymbol)}
          value={formatExact(t.rawColl)}
        >
          {amt(t.rawColl)}
        </Prov>{" "}
        {p.normalizedSymbol}
      </div>
    </div>
  );
}

/** Default cut: the ticks that carry at least 0.1% of the pool's debt. The
 *  toggle reveals the whole bitmap roster, dust included — the threshold is a
 *  display cut only and is stated beside the toggle; every tick is always in
 *  the reconciliation above. */
const SHARE_CUT = 0.001;

function TickTable({ p }: { p: FxPoolSystem }) {
  const [showAll, setShowAll] = useState(false);
  // Descending tick order — the top of the ladder first, the end redemption
  // and a pool-wide rebalance sweep bite first.
  const ordered = [...p.ticks].sort((a, b) => b.tick - a.tick);
  const major = ordered.filter((t) => t.shareOfDebt >= SHARE_CUT);
  const rows = showAll ? ordered : major;

  return (
    <div className="rounded-xl bg-raised">
      <div className="flex items-baseline justify-between gap-3 border-b border-rb-200 px-4 py-3 dark:border-rb-700">
        <div>
          <span className="text-xs font-semibold text-foreground">The ticks, top down</span>
          <span className="ml-2 text-[11px] text-rb-500">
            {showAll
              ? `all ${ordered.length} occupied ticks`
              : `the ${major.length} ticks holding ≥ 0.1% of the pool's debt`}
          </span>
        </div>
        {ordered.length > major.length && (
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            className="shrink-0 text-[11px] text-blue-500 hover:underline"
          >
            {showAll ? "Show major ticks only" : `Show all ${ordered.length} ticks`}
          </button>
        )}
      </div>

      <div className="hidden border-b border-rb-200 px-4 py-1.5 text-[10px] uppercase tracking-wider text-rb-400 sm:grid sm:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)] dark:border-rb-700">
        <span>Tick</span>
        <span>Debt ratio (min leg)</span>
        <span>Debt</span>
        <span>Share of pool</span>
        <span>Collateral</span>
      </div>

      <div className="divide-y divide-rb-200 dark:divide-rb-700">
        {rows.map((t) => (
          <TickRow key={t.tick} p={p} t={t} />
        ))}
      </div>
    </div>
  );
}

// ── One pool's section ───────────────────────────────────────────────────────

function PoolSection({ p, blockTs }: { p: FxPoolSystem; blockTs: number }) {
  return (
    <section className="mt-8">
      <div className="flex items-baseline gap-2">
        <h2 className="text-sm font-semibold text-foreground">{poolLabel(p)}</h2>
        <a
          href={explorerUrl(MAINNET_CHAIN_ID, "address", p.address)}
          target="_blank"
          rel="noopener noreferrer"
          className="link-external text-[11px] text-rb-500"
        >
          AaveFundingPool
        </a>
        <span className="text-[11px] text-rb-500">
          · collateral {p.tokenSymbol}, accounted in {p.normalizedSymbol} · debt fxUSD
        </span>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <PoolStateCard p={p} />
        <FundingCard p={p} blockTs={blockTs} />
        <OracleCard p={p} />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="rounded-xl bg-raised px-4 py-3.5">
          <span className="text-xs font-semibold text-foreground">The tick ladder</span>
          <div className="mt-3">
            <LadderStrip p={p} />
          </div>
        </div>
        <ReconcileCard p={p} />
      </div>

      <div className="mt-3">
        <TickTable p={p} />
      </div>
    </section>
  );
}

// ── The view ─────────────────────────────────────────────────────────────────

export function FxSystemView({ data }: { data: FxSystemChainResponse }) {
  const registry = useReceiptRegistry();

  if (data.chainStale) {
    return (
      <div className="py-12 text-center text-rb-500">
        <p className="mb-1">Couldn&apos;t read f(x)&apos;s pool state from chain.</p>
        <p className="text-sm">
          This view is a live contract read with no cached fallback — rather than show stale figures, it shows nothing.
          Try again shortly.
        </p>
      </div>
    );
  }

  return (
    <ProvReceiptsScope registry={registry}>
      {/* The page-level vitals band. Debt is the one figure the two pools share
          a unit for — every pool mints the same fxUSD — so it is the only size
          slot filled. SUPPLIED is empty because the pools hold different
          collateral tokens (wstETH and WBTC), and there is no combined
          collateral figure to state; USAGE is empty because f(x) runs no
          borrowed-over-supplied ratio at all — its axis is a per-tick debt
          ratio taken at the oracle's MIN leg, which lives on each pool's own
          card. Do not manufacture either here. */}
      <VitalsBand
        vitals={[
          {
            slot: "roster",
            label: "Pools registered",
            value: (
              <Prov info={poolRosterProv()} value={String(data.pools.length)}>
                {data.pools.length}
              </Prov>
            ),
          },
          {
            slot: "sizeOut",
            label: "Debt",
            value: (
              <Prov info={totalDebtAllPoolsProv()} value={formatExact(data.totalDebtAllPools)}>
                {formatCompact(data.totalDebtAllPools)} fxUSD
              </Prov>
            ),
          },
          {
            slot: "population",
            label: "Positions ever minted",
            value: (
              <Prov info={totalPositionsMintedProv()} value={formatExact(data.totalPositionsMinted)}>
                {data.totalPositionsMinted.toLocaleString("en-US")}
              </Prov>
            ),
          },
        ]}
      />

      {data.pools.map((p) => (
        <PoolSection key={p.key} p={p} blockTs={data.blockTimestamp} />
      ))}
    </ProvReceiptsScope>
  );
}

/** The header's block stamp — rendered by the page, beside the title. */
export function FxSystemStamp({ data }: { data: FxSystemChainResponse }) {
  if (data.chainStale || data.blockNumber === 0) return null;
  return (
    <p className="mt-2 text-[11px] text-rb-500">
      Chain snapshot · block{" "}
      <a
        href={explorerUrl(MAINNET_CHAIN_ID, "block", data.blockNumber)}
        target="_blank"
        rel="noopener noreferrer"
        className="link-external"
      >
        {data.blockNumber.toLocaleString("en-US")}
      </a>{" "}
      · the pools&rsquo; own figures at that block
    </p>
  );
}
