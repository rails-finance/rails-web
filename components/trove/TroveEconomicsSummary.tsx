"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { ChartColumnBig, ChevronDown, ChevronUp } from "lucide-react";
import { TokenIcon } from "@/components/icons/tokenIcon";
import { TroveEconomics, TroveSummary } from "@/types/api/trove";
import {
  Transaction,
  isRedemptionTransaction,
  isTroveTransaction,
  isLiquidationTransaction,
} from "@/types/api/troveHistory";
import { formatPrice, formatUsdValue } from "@/lib/utils/format";

interface TroveEconomicsSummaryProps {
  trove: TroveSummary;
  transactions?: Transaction[];
  currentPrice?: number;
  persistedOpen?: boolean;
  onToggle?: (isOpen: boolean) => void;
}

// Calculate economics from transaction data (client-side fallback)
function calculateEconomicsFromTransactions(
  transactions: Transaction[],
  collateralType: string
): TroveEconomics {
  const redemptions = transactions.filter(isRedemptionTransaction);
  const troveOps = transactions.filter(isTroveTransaction);
  const liquidations = transactions.filter(isLiquidationTransaction);

  // Calculate redemption metrics
  let totalDebtCleared = 0;
  let totalCollateralLost = 0;
  let totalCollateralValueAtRedemption = 0;
  let totalFeesRetained = 0;

  for (const redemption of redemptions) {
    const debtCleared = Math.abs(redemption.troveOperation.debtChangeFromOperation);
    totalDebtCleared += debtCleared;

    const collLost = Math.abs(redemption.troveOperation.collChangeFromOperation);
    totalCollateralLost += collLost;

    totalCollateralValueAtRedemption += collLost * redemption.collateralPrice;

    const fee = parseFloat(redemption.redemptionFee) || 0;
    totalFeesRetained += fee;
  }

  // P/L excludes fees (shown separately in collateral breakdown)
  const realizedPL = totalDebtCleared - totalCollateralValueAtRedemption;

  // Calculate gas costs
  let totalGasCostEth = 0;
  let totalGasCostUsd = 0;

  for (const tx of transactions) {
    totalGasCostEth += tx.gasFee || 0;
    totalGasCostUsd += tx.gasFeeUsd || 0;
  }

  // Calculate interest and fees
  let totalUpfrontFees = 0;

  for (const tx of troveOps) {
    totalUpfrontFees += tx.troveOperation.debtIncreaseFromUpfrontFee || 0;
  }

  // Calculate position metrics
  let totalBorrowed = 0;
  let totalRepaid = 0;
  let totalCollateralDeposited = 0;
  let totalCollateralWithdrawn = 0;

  for (const tx of troveOps) {
    const debtChange = tx.troveOperation.debtChangeFromOperation;
    const collChange = tx.troveOperation.collChangeFromOperation;

    if (debtChange > 0) {
      totalBorrowed += debtChange;
    } else if (debtChange < 0) {
      totalRepaid += Math.abs(debtChange);
    }

    if (collChange > 0) {
      totalCollateralDeposited += collChange;
    } else if (collChange < 0) {
      totalCollateralWithdrawn += Math.abs(collChange);
    }
  }

  const liquidatedCollateral = liquidations.reduce(
    (sum, tx) => sum + Math.abs(tx.troveOperation.collChangeFromOperation),
    0
  );

  const netCollateralChange =
    totalCollateralDeposited - totalCollateralWithdrawn - liquidatedCollateral - totalCollateralLost;

  // Calculate interest + management fees as the difference between debt repaid and debt created
  // totalRepaid + redemptionDebtCleared = total debt that was cleared
  // totalBorrowed + totalUpfrontFees = total debt that was created
  // The difference is interest + management fees that accrued
  const totalDebtRepaidOrCleared = totalRepaid + totalDebtCleared;
  const totalDebtCreated = totalBorrowed + totalUpfrontFees;
  const interestAndManagementFees = Math.max(0, totalDebtRepaidOrCleared - totalDebtCreated);

  return {
    redemption:
      redemptions.length > 0
        ? {
            totalDebtCleared,
            totalCollateralLost,
            totalCollateralValueAtRedemption,
            totalFeesRetained,
            realizedPL,
          }
        : null,
    gas: {
      totalGasUsed: 0,
      totalGasCostEth,
      totalGasCostUsd,
    },
    costs: {
      totalInterestPaid: interestAndManagementFees, // Combined interest + management fees
      totalUpfrontFees,
      totalManagementFees: 0, // Can't separate from interest without more data
    },
    position: {
      totalBorrowed,
      totalRepaid,
      totalCollateralDeposited,
      totalCollateralWithdrawn,
      netCollateralChange,
    },
  };
}

function formatCompactUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 10_000) return `$${(value / 1_000).toFixed(0)}k`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

type TowerSegment = {
  key: string;
  label: string;
  value: number;
  colorClass: string;
  patternStyle?: CSSProperties;
};

type PositionedSegment = TowerSegment & {
  bottomPct: number;
  heightPct: number;
};

type BreakdownRow = {
  sign: string;
  label: string;
  amount: string;
  symbol: string;
  usdHint?: string;
  isResult?: boolean;
  hidden?: boolean;
  swatchClass?: string;
  swatchStyle?: CSSProperties;
  indent?: boolean;
};

const CHART_HEIGHT = 220;
const SEGMENT_GAP_PX = 2;
const MIN_SEGMENT_PX = 2;

const parseRgba = (color: string): [string, string, string, number] | null => {
  const match = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+)\s*)?\)/i.exec(color);
  if (!match) return null;
  const [, r, g, b, a = "1"] = match;
  return [r, g, b, parseFloat(a)];
};

const fadedColor = (color: string, multiplier = 0.5): string => {
  const parts = parseRgba(color);
  if (!parts) return color;
  const [r, g, b, a] = parts;
  const fadedAlpha = Math.max(0, Math.min(1, a * multiplier));
  return `rgba(${r}, ${g}, ${b}, ${fadedAlpha})`;
};

const solidColor = (color: string): string => {
  const parts = parseRgba(color);
  if (!parts) return color;
  const [r, g, b] = parts;
  return `rgba(${r}, ${g}, ${b}, 1)`;
};

const withAlpha = (color: string, alpha: number): string => {
  const parts = parseRgba(color);
  if (!parts) return color;
  const [r, g, b] = parts;
  const clamped = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${clamped})`;
};

const checkerPattern = (color: string): CSSProperties => {
  const faded = fadedColor(color, 0.5);
  const border = withAlpha(color, 0.75);
  return {
    backgroundImage: `linear-gradient(45deg, ${color} 25%, ${faded} 25%, ${faded} 75%, ${color} 75%, ${color}), linear-gradient(45deg, ${color} 25%, ${faded} 25%, ${faded} 75%, ${color} 75%, ${color})`,
    backgroundSize: "4px 4px",
    backgroundPosition: "0 0, 2px 2px",
    boxShadow: `inset 0 0 0 1px ${border}`,
  };
};

const REDEMPTION_PATTERN = checkerPattern("rgba(251, 146, 60, 0.6)");   // orange-400
const LIQUIDATION_PATTERN = checkerPattern("rgba(248, 113, 113, 0.6)");  // red-400
const REPAID_PATTERN = checkerPattern("rgba(52, 211, 153, 0.5)");        // emerald-400
const WITHDRAWN_PATTERN = checkerPattern("rgba(96, 165, 250, 0.5)");     // blue-400
const COSTS_PATTERN = checkerPattern("rgba(148, 163, 184, 0.3)");         // slate

function computeTowerLayout(
  segments: TowerSegment[],
  maxValue: number,
): PositionedSegment[] {
  if (maxValue === 0) return [];
  const visible = segments.filter(s => s.value > 0);
  const gapPct = (SEGMENT_GAP_PX / CHART_HEIGHT) * 100;
  const minHeightPct = (MIN_SEGMENT_PX / CHART_HEIGHT) * 100;
  let cursorPct = 0;
  return visible.map((seg, i) => {
    if (i > 0) cursorPct += gapPct;
    const heightPct = Math.max((seg.value / maxValue) * 100, minHeightPct);
    const pos: PositionedSegment = {
      ...seg,
      bottomPct: cursorPct,
      heightPct,
    };
    cursorPct += heightPct;
    return pos;
  });
}

function TowerBar({
  segments,
  sideBar,
}: {
  segments: PositionedSegment[];
  sideBar?: { heightPct: number; color: string };
}) {
  return (
    <div className="flex gap-0.75 shrink-0">
        {/* Side bar (e.g. Borrowed / Deposited reference level) */}
        {sideBar && sideBar.heightPct > 0 && (
          <div className="relative shrink-0" style={{ width: 5, height: CHART_HEIGHT }}>
            <div
              className="absolute bottom-0 w-full rounded-xs"
              style={{
                height: `${sideBar.heightPct}%`,
                backgroundColor: sideBar.color,
              }}
            />
          </div>
        )}
        {/* Tower */}
        <div className="relative w-16 sm:w-20" style={{ height: CHART_HEIGHT }}>
          {segments.map((seg) => (
            <div key={seg.key}>
              {seg.colorClass && (
                <div
                  className={`absolute inset-x-0 rounded-xs ${seg.colorClass}`}
                  style={{
                    bottom: `${seg.bottomPct}%`,
                    height: `${seg.heightPct}%`,
                  }}
                />
              )}
              {seg.patternStyle && (
                <div
                  className="absolute inset-x-0 rounded-xs pointer-events-none"
                  style={{
                    bottom: `${seg.bottomPct}%`,
                    height: `${seg.heightPct}%`,
                    ...seg.patternStyle,
                  }}
                />
              )}
            </div>
          ))}
        </div>
    </div>
  );
}

function BreakdownTable({ rows }: { rows: BreakdownRow[] }) {
  const visible = rows.filter(r => !r.hidden);
  return (
    <div className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
      {visible.map((row, i) => (
        <div
          key={i}
          className={`flex items-center gap-1 ${
            row.isResult
              ? "border-t border-slate-300 dark:border-slate-600 font-semibold pt-1 mt-0.5"
              : ""
          } ${row.indent ? "text-[10px] text-slate-400 dark:text-slate-500" : ""}`}
        >
          <span className="w-3 text-right text-slate-400 dark:text-slate-500 shrink-0 text-[10px]">{row.sign}</span>
          {(row.swatchClass || row.swatchStyle) ? (
            <span
              className={`w-2.5 h-2.5 rounded-xs shrink-0 overflow-hidden ${row.swatchClass ?? ""}`}
              style={row.swatchStyle}
            />
          ) : (
            <span className="w-2.5 shrink-0" />
          )}
          <span className={`shrink-0 ${row.indent ? "" : "font-bold text-slate-400 dark:text-slate-600"}`}>{row.label}</span>
          <span className="flex-1" />
          <span className="tabular-nums text-right shrink-0 font-bold">{row.amount}</span>
          {row.usdHint && (
            <span className="text-slate-400 dark:text-slate-500 text-[10px] shrink-0">{row.usdHint}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export function TroveEconomicsSummary({
  trove,
  transactions,
  currentPrice,
  persistedOpen,
  onToggle,
}: TroveEconomicsSummaryProps) {
  const [isOpen, setIsOpen] = useState(persistedOpen ?? false);

  useEffect(() => {
    if (persistedOpen === undefined) return;
    setIsOpen(persistedOpen);
  }, [persistedOpen]);

  const economics = useMemo(() => {
    if (trove.economics) {
      return trove.economics;
    }
    if (transactions && transactions.length > 0) {
      return calculateEconomicsFromTransactions(transactions, trove.collateralType);
    }
    return null;
  }, [trove.economics, transactions, trove.collateralType]);

  if (!economics) {
    return null;
  }

  // Calculate values for summaries
  const collateralSymbol = trove.collateralType;
  const redemption = economics.redemption;
  // P/L excludes fees (shown separately in collateral breakdown)
  const opportunityPL = redemption && currentPrice
    ? redemption.totalDebtCleared - redemption.totalCollateralLost * currentPrice
    : null;

  // Tower chart data
  // Total interest including what's still outstanding in current debt
  const totalInterestAndMgmtFees = Math.max(0,
    trove.debt.current
    + economics.position.totalRepaid
    + (redemption?.totalDebtCleared ?? 0)
    - economics.position.totalBorrowed
    - economics.costs.totalUpfrontFees
  );
  // Split interest vs delegate fees: prefer API value, fall back to proportional estimate from rates
  const apiMgmtFees = economics.costs.totalManagementFees ?? 0;
  const mgmtRate = trove.batch.isMember ? trove.batch.managementFee : 0;
  const intRate = trove.metrics.interestRate;
  const delegateFees = apiMgmtFees > 0
    ? Math.min(apiMgmtFees, totalInterestAndMgmtFees)
    : (mgmtRate > 0 && intRate + mgmtRate > 0)
      ? totalInterestAndMgmtFees * (mgmtRate / (intRate + mgmtRate))
      : 0;
  const interestAccrued = Math.max(0, totalInterestAndMgmtFees - delegateFees);
  const totalCosts = economics.costs.totalUpfrontFees + totalInterestAndMgmtFees;

  // Debt tower: bottom-to-top: Current Debt, Redeemed, Repaid (principal), Costs (settled)
  // Only the paid-off portion of costs appears as a hatched segment.
  // Unpaid costs remain in the solid Current Debt bar (solid = still there).
  const costsSettled = Math.min(totalCosts, economics.position.totalRepaid);
  const repaidPrincipal = economics.position.totalRepaid - costsSettled;

  const debtSegments: TowerSegment[] = [
    { key: "current-debt", label: "Current Debt", value: trove.debt.current, colorClass: "bg-emerald-500" },
    { key: "debt-redeemed", label: "Redeemed", value: redemption?.totalDebtCleared ?? 0, colorClass: "", patternStyle: REDEMPTION_PATTERN },
    { key: "repaid", label: "Repaid", value: repaidPrincipal, colorClass: "", patternStyle: REPAID_PATTERN },
    { key: "costs", label: "Costs", value: costsSettled, colorClass: "", patternStyle: COSTS_PATTERN },
  ];

  const debtPeak = economics.position.totalBorrowed + totalCosts;

  // Liquidated collateral is a residual — only trust it when actual liquidation events exist
  const hasLiquidations = transactions?.some(isLiquidationTransaction) ?? false;
  const rawLiquidatedColl = Math.max(0,
    economics.position.totalCollateralDeposited
    + (redemption?.totalFeesRetained ?? 0)
    - trove.collateral.amount
    - economics.position.totalCollateralWithdrawn
    - (redemption?.totalCollateralLost ?? 0)
  );
  const liquidatedColl = hasLiquidations && rawLiquidatedColl > 0.0001 ? rawLiquidatedColl : 0;

  // Zombie trove: debt fully cleared but collateral remains claimable
  const isZombie = trove.debt.current === 0 && trove.collateral.amount > 0;

  // Collateral tower: bottom-to-top: In Trove (or Claimable), Redeemed, Liquidated, Withdrawn
  const feesReceivedColl = redemption?.totalFeesRetained ?? 0;

  const collSegments: TowerSegment[] = currentPrice ? [
    isZombie
      ? { key: "claimable", label: "Claimable", value: trove.collateral.amount * currentPrice, colorClass: "bg-blue-700 ring-1 ring-inset ring-green-700 dark:ring-green-400" }
      : { key: "in-trove", label: "In Trove", value: trove.collateral.amount * currentPrice, colorClass: "bg-blue-500" },
    { key: "fees-received", label: "Fees Received", value: feesReceivedColl * currentPrice, colorClass: "bg-cyan-800" },
    { key: "coll-redeemed", label: "Redeemed", value: (redemption?.totalCollateralLost ?? 0) * currentPrice, colorClass: "", patternStyle: REDEMPTION_PATTERN },
    { key: "liquidated", label: "Liquidated", value: liquidatedColl * currentPrice, colorClass: "", patternStyle: LIQUIDATION_PATTERN },
    { key: "withdrawn", label: "Withdrawn", value: economics.position.totalCollateralWithdrawn * currentPrice, colorClass: "", patternStyle: WITHDRAWN_PATTERN },
  ] : [];

  const collPeak = currentPrice ? (economics.position.totalCollateralDeposited + feesReceivedColl) * currentPrice : 0;
  const towerMax = Math.max(debtPeak, collPeak) * 1.08;

  const debtPositioned = computeTowerLayout(debtSegments, towerMax);
  const collPositioned = computeTowerLayout(collSegments, towerMax);

  // Side bars: derive height from positioned segments so gaps are accounted for.
  // Debt: borrowed = everything below costs → use the bottom edge of the costs segment.
  // Collateral: deposited = entire tower → use the top edge of the topmost segment.
  const costsPos = debtPositioned.find(s => s.key === "costs");
  const debtSideBar = economics.position.totalBorrowed > 0 ? {
    heightPct: costsPos
      ? costsPos.bottomPct
      : (economics.position.totalBorrowed / towerMax) * 100,
    color: "rgba(52, 211, 153, 0.25)",
  } : undefined;

  const topCollSeg = collPositioned[collPositioned.length - 1];
  const collSideBar = currentPrice && economics.position.totalCollateralDeposited > 0 ? {
    heightPct: topCollSeg
      ? topCollSeg.bottomPct + topCollSeg.heightPct
      : (economics.position.totalCollateralDeposited * currentPrice / towerMax) * 100,
    color: "rgba(59, 130, 246, 0.25)",
  } : undefined;

  // Debt breakdown: math sum → Current Debt
  const debtBreakdownRows: BreakdownRow[] = [
    { sign: "", label: "Borrowed", amount: formatPrice(economics.position.totalBorrowed), symbol: "BOLD", swatchStyle: { backgroundColor: "rgba(52, 211, 153, 0.25)" } },
    { sign: "+", label: "Costs", amount: formatPrice(totalCosts), symbol: "BOLD", hidden: totalCosts === 0, swatchStyle: COSTS_PATTERN },
    { sign: "", label: "Interest Accrued", amount: formatPrice(interestAccrued), symbol: "BOLD", hidden: interestAccrued === 0, indent: true },
    { sign: "", label: "Upfront Fees", amount: formatPrice(economics.costs.totalUpfrontFees), symbol: "BOLD", hidden: economics.costs.totalUpfrontFees === 0, indent: true },
    { sign: "", label: "Delegate Fees", amount: formatPrice(delegateFees), symbol: "BOLD", hidden: delegateFees === 0, indent: true },
    { sign: "\u2212", label: "Repaid", amount: formatPrice(economics.position.totalRepaid), symbol: "BOLD", hidden: economics.position.totalRepaid === 0, swatchStyle: REPAID_PATTERN },
    { sign: "\u2212", label: "Redeemed", amount: formatPrice(redemption?.totalDebtCleared ?? 0), symbol: "BOLD", hidden: !redemption || redemption.totalDebtCleared === 0, swatchStyle: REDEMPTION_PATTERN },
    { sign: "", label: "Current Debt", amount: formatPrice(trove.debt.current), symbol: "BOLD", isResult: true, swatchClass: "bg-emerald-500" },
  ];

  // Collateral breakdown: math sum → In Trove
  const collBreakdownRows: BreakdownRow[] = currentPrice ? [
    {
      sign: "", label: "Deposited",
      amount: economics.position.totalCollateralDeposited.toFixed(2),
      symbol: collateralSymbol,
      usdHint: `[${formatCompactUsd(economics.position.totalCollateralDeposited * currentPrice)}]`,
      swatchStyle: { backgroundColor: "rgba(59, 130, 246, 0.25)" },
    },
    {
      sign: "\u2212", label: "Withdrawn",
      amount: economics.position.totalCollateralWithdrawn.toFixed(2),
      symbol: collateralSymbol,
      usdHint: `[${formatCompactUsd(economics.position.totalCollateralWithdrawn * currentPrice)}]`,
      hidden: economics.position.totalCollateralWithdrawn === 0,
      swatchStyle: WITHDRAWN_PATTERN,
    },
    {
      sign: "\u2212", label: "Liquidated",
      amount: liquidatedColl.toFixed(2),
      symbol: collateralSymbol,
      usdHint: `[${formatCompactUsd(liquidatedColl * currentPrice)}]`,
      hidden: liquidatedColl === 0,
      swatchStyle: LIQUIDATION_PATTERN,
    },
    {
      sign: "\u2212", label: "Redeemed",
      amount: (redemption?.totalCollateralLost ?? 0).toFixed(2),
      symbol: collateralSymbol,
      usdHint: `[${formatCompactUsd((redemption?.totalCollateralLost ?? 0) * currentPrice)}]`,
      hidden: !redemption || redemption.totalCollateralLost === 0,
      swatchStyle: REDEMPTION_PATTERN,
    },
    {
      sign: "+", label: "Fees Received",
      amount: feesReceivedColl.toFixed(4),
      symbol: collateralSymbol,
      usdHint: `[${formatCompactUsd(feesReceivedColl * currentPrice)}]`,
      hidden: feesReceivedColl === 0,
      swatchClass: "bg-cyan-800",
    },
    {
      sign: "", label: isZombie ? "Claimable" : "In Trove",
      amount: trove.collateral.amount.toFixed(2),
      symbol: collateralSymbol,
      usdHint: `[${formatCompactUsd(trove.collateral.amount * currentPrice)}]`,
      isResult: true,
      swatchClass: isZombie ? "bg-blue-700 ring-1 ring-inset ring-green-700 dark:ring-green-400" : "bg-blue-500",
    },
  ] : [];

  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-900 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => {
          const next = !isOpen;
          setIsOpen(next);
          onToggle?.(next);
        }}
        className="w-full px-4 py-3 flex items-center justify-between text-left cursor-pointer hover:bg-slate-100  dark:hover:bg-slate-950 transition-colors"
        aria-expanded={isOpen}
        aria-label={isOpen ? "Hide trove economics" : "Show trove economics"}
      >
        <div className="flex items-center gap-2">
          <ChartColumnBig size={18} className="text-slate-500" />
          <span className="font-semibold text-slate-700 dark:text-white">Trove Economics</span><span className=" text-[10px] relative -bottom-0.75 text-slate-700 dark:text-slate-500">(Experimental)</span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {/* Expanded content */}
      {isOpen && (
        <div className="px-4 pb-4 space-y-4">

          {/* Position Summary */}
          <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
            {debtPeak > 0 && (
              <>
                {/* Desktop: table – bar – gap – bar – table */}
                <div className="hidden sm:flex items-stretch justify-center gap-3 mb-6">
                  <div className="flex-1 max-w-60 flex flex-col">
                    <p className="font-bold flex justify-center items-center gap-1 mb-1">
                      Debt <TokenIcon assetSymbol="BOLD" className="w-3.5 h-3.5" />
                    </p>
                    <div className="mt-auto">
                      <BreakdownTable rows={debtBreakdownRows} />
                    </div>
                  </div>
                  <TowerBar segments={debtPositioned} sideBar={debtSideBar} />
                  <div className="w-4 shrink-0" />
                  <TowerBar segments={collPositioned} sideBar={collSideBar} />
                  {collBreakdownRows.length > 0 && (
                    <div className="flex-1 max-w-60 flex flex-col">
                      <p className="font-bold flex justify-center items-center gap-1 mb-1">
                        Collateral <TokenIcon assetSymbol={collateralSymbol} className="w-3.5 h-3.5" />
                      </p>
                      <div className="mt-auto">
                        <BreakdownTable rows={collBreakdownRows} />
                      </div>
                    </div>
                  )}
                </div>
                {/* Mobile: bars side-by-side, then tables stacked */}
                <div className="sm:hidden space-y-3 mb-2">
                  <div className="flex items-end justify-center gap-4">
                    <TowerBar segments={debtPositioned} sideBar={debtSideBar} />
                    <TowerBar segments={collPositioned} sideBar={collSideBar} />
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="font-bold flex items-center gap-1 mb-1">
                        Debt <TokenIcon assetSymbol="BOLD" className="w-3.5 h-3.5" />
                      </p>
                      <BreakdownTable rows={debtBreakdownRows} />
                    </div>
                    {collBreakdownRows.length > 0 && (
                      <div>
                        <p className="font-bold flex items-center gap-1 mb-1">
                          Collateral <TokenIcon assetSymbol={collateralSymbol} className="w-3.5 h-3.5" />
                        </p>
                        <BreakdownTable rows={collBreakdownRows} />
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
            {redemption && (
              <div className="flex flex-wrap items-center gap-1.5 mt-3 text-xs mb-1 font-semibold">
                <span className="text-slate-500">Borrower&apos;s net outcome from redemptions was</span>
                <span className={`${
                  redemption.realizedPL >= 0
                    ? "text-green-700 dark:text-green-400"
                    : "text-red-700 dark:text-red-400"
                }`}>
                  {redemption.realizedPL >= 0 ? "+" : "\u2212"}{formatUsdValue(Math.abs(redemption.realizedPL))}
                </span>
                {opportunityPL !== null && (
                  <>
                    <span className="text-slate-500"> or </span>
                    <span className={` ${
                      opportunityPL >= 0
                        ? "text-green-700 dark:text-green-400"
                        : "text-red-700 dark:text-red-400"
                    }`}>
                      {opportunityPL >= 0 ? "+" : "\u2212"}{formatUsdValue(Math.abs(opportunityPL))}
                    </span>
                    <span className="text-xs text-slate-500">at today&apos;s value</span>
                  </>
                )}
              </div>
            )}
            {economics.gas.totalGasCostEth > 0 && (
              <p className="text-xs text-slate-500 flex items-center gap-0.5">
                A total of {economics.gas.totalGasCostEth.toFixed(4)}{" "}
                <TokenIcon assetSymbol="ETH" className="w-3 h-3 inline-block" />{" "}
                ({formatUsdValue(economics.gas.totalGasCostUsd)}) has been spent on gas fees
              </p>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
