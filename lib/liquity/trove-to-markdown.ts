// Serialize a Liquity V2 trove's current state + activity timeline into a
// plain-Markdown snapshot, suitable for pasting into an LLM ("here's my
// position — am I at risk?"). The whole point of the export is that Rails has
// already done the drift-resistant computation (liquidation price, collateral
// ratio, debt-in-front), so the markdown carries those computed numbers rather
// than leaving an LLM to guess them.
//
// This is a PURE function of the data already in scope on the trove detail
// page — it does no fetching. The headline math is a faithful mirror of
// `buildOpenItems` in components/trove/use-trove-explanation-items.tsx; keep
// the two in sync when the headline calculations change.
//
// Numbers are emitted at full precision (no compact "60K" notation) because an
// LLM reasons better over exact values than over rounded display strings.

import type { TroveSummary } from "@/types/api/trove";
import type { TroveStateData } from "@/types/api/troveState";
import type { OraclePricesData } from "@/types/api/oracle";
import { formatExact } from "@/lib/utils/format";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isCollSurplusClaimEvent, isLiquityEvent } from "@/lib/shared/types/event-shape";
import { claimMarkdownLabel } from "@/lib/shared/liquity-coll-surplus-claim";
import { getLiquidationThreshold } from "@/lib/utils/liquidation-utils";
import { getBatchManagerByAddress } from "@/lib/services/batch-manager-service";
import { actionLabel, getEventActionKey } from "@/lib/shared/event-filter-helpers";

export interface TroveMarkdownArgs {
  trove: TroveSummary;
  liveState?: TroveStateData;
  prices?: OraclePricesData;
  debtInFront: number | null;
  trovesAhead: number | null;
  /** Chronologically sorted (oldest → newest) event list. */
  events: BaseActivityEvent[];
  /** When the snapshot was taken (copy time). Passed in so the serializer
   *  stays pure — `new Date()` is unavailable in some runtimes and makes the
   *  output non-deterministic to test. */
  generatedAt: Date;
}

// ── Local formatters (full precision, no compact notation) ──

function num(n: number, maxDecimals = 2): string {
  if (!Number.isFinite(n)) return "—";
  const s = n.toLocaleString("en-US", { maximumFractionDigits: maxDecimals });
  // A non-zero amount below the rounding states every digit, never a false 0.
  return n !== 0 && parseFloat(s.replace(/,/g, "")) === 0 ? formatExact(n) : s;
}

/** Token amount — a few more decimals than money. */
function amt(n: number): string {
  return num(n, 4);
}

function usd(n: number): string {
  return "$" + num(n, 2);
}

function bold(n: number): string {
  return `${num(n, 2)} BOLD`;
}

/** "2026-06-21 06:53 UTC" — unambiguous for an LLM reader. */
function fmtUtc(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const pad = (x: number) => String(x).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
  );
}

function fmtUtcFromDate(d: Date): string {
  return fmtUtc(d.getTime() / 1000);
}

function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

function statusLabel(status: TroveSummary["status"]): string {
  if (status === "open") return "Open";
  if (status === "closed") return "Closed";
  return "Liquidated";
}

export function troveToMarkdown(args: TroveMarkdownArgs): string {
  const { trove, events } = args;
  const ct = trove.collateralType;
  const lines = troveSummaryMarkdown(args);

  // ── Activity timeline ──
  lines.push(...timelineTable(events, ct));

  return lines.join("\n");
}

/** The position's card as Markdown: the header, the headlines and the
 *  lifetime, without the timeline. The test exports
 *  (scripts/exports-liquity-v2.mjs) open each position with it. */
export function troveSummaryMarkdown(args: TroveMarkdownArgs): string[] {
  const { trove, events, generatedAt } = args;
  const ct = trove.collateralType;
  const lines: string[] = [];

  // ── Header ──
  lines.push(`# Liquity V2 trove — ${ct} #${shortId(trove.id)}`);
  lines.push("");
  lines.push(
    `> Point-in-time snapshot generated ${fmtUtcFromDate(generatedAt)}. ` +
      `Balances and prices are live reads at generation time and drift as the market and position change. ` +
      `Not financial advice.`,
  );
  lines.push("");

  const owner = trove.status === "open" ? trove.owner : trove.lastOwner;
  lines.push(`- **Status:** ${statusLabel(trove.status)}${trove.isZombie ? " (zombie — debt below the minimum)" : ""}`);
  if (owner) lines.push(`- **Owner:** ${trove.ownerEns ? `${trove.ownerEns} (${owner})` : owner}`);
  lines.push(`- **Collateral type:** ${ct}`);
  lines.push(`- **Trove ID:** ${trove.id}`);
  lines.push("");

  // ── Status-specific headline block ──
  lines.push(...(trove.status === "open" ? openHeadlines(args) : closedOrLiquidatedHeadlines(trove)));

  // ── Lifetime ──
  lines.push("## Lifetime");
  lines.push(`- **Peak debt:** ${bold(trove.debt.peak)}`);
  lines.push(`- **Peak collateral:** ${amt(trove.collateral.peakAmount)} ${ct}`);
  if (trove.activity?.createdAt) lines.push(`- **Opened:** ${fmtUtc(trove.activity.createdAt)}`);
  if (trove.activity?.lastActivityAt) lines.push(`- **Last activity:** ${fmtUtc(trove.activity.lastActivityAt)}`);
  lines.push(
    `- **Transactions:** ${trove.activity?.transactionCount ?? events.length}` +
      (trove.activity?.redemptionCount ? ` · **Redemptions:** ${trove.activity.redemptionCount}` : ""),
  );
  lines.push("");
  return lines;
}

// Mirror of buildOpenItems' computations. Kept faithful so the markdown and the
// on-page explanation agree number-for-number.
function openHeadlines(args: TroveMarkdownArgs): string[] {
  const { trove, liveState, prices, debtInFront, trovesAhead } = args;
  const ct = trove.collateralType;
  const out: string[] = [];

  const displayDebt = liveState?.debt.entire ?? trove.debt.current;
  const displayRecordedDebt = liveState?.debt.recorded ?? trove.debt.current;
  const displayAccruedInterest = liveState?.debt.accruedInterest;
  const displayInterestRate = liveState?.rates.annualInterestRate ?? trove.metrics.interestRate;
  const displayManagementFee = liveState?.rates.accruedBatchManagementFee;
  const displayCollateral = liveState?.collateral.entire ?? trove.collateral.amount;

  const priceKey = ct.toLowerCase() as keyof OraclePricesData;
  const currentPrice = prices ? prices[priceKey] : undefined;
  const collateralUsd = currentPrice ? displayCollateral * currentPrice : null;
  const collateralRatio =
    collateralUsd && displayDebt > 0 ? (collateralUsd / displayDebt) * 100 : (trove.metrics.collateralRatio ?? null);
  const mcr = getLiquidationThreshold(ct);
  const liqPrice = displayCollateral > 0 && displayDebt > 0 ? (displayDebt * (mcr / 100)) / displayCollateral : null;

  const annualInterestCost = (displayRecordedDebt * displayInterestRate) / 100;
  const dailyInterestCost = annualInterestCost / 365;

  out.push("## Headlines");

  // Debt + breakdown
  if (displayAccruedInterest !== undefined) {
    let debtLine = `- **Debt:** ${bold(displayDebt)} — ${bold(displayRecordedDebt)} carried + ${bold(displayAccruedInterest)} accrued interest`;
    if (trove.batch.isMember && displayManagementFee !== undefined && displayManagementFee > 0) {
      debtLine += ` + ${bold(displayManagementFee)} delegate fees`;
    }
    out.push(debtLine);
  } else {
    out.push(`- **Debt:** ${bold(displayDebt)}`);
  }

  // Collateral
  if (currentPrice && collateralUsd) {
    out.push(
      `- **Collateral:** ${amt(displayCollateral)} ${ct} (worth ${usd(collateralUsd)} at ${usd(currentPrice)} / ${ct})`,
    );
  } else {
    out.push(`- **Collateral:** ${amt(displayCollateral)} ${ct}`);
  }

  // Collateral ratio
  if (collateralRatio) {
    out.push(`- **Collateral ratio:** ${num(collateralRatio, 1)}% (minimum ${mcr}% to avoid liquidation)`);
  }

  // Liquidation price + buffer
  if (liqPrice) {
    let liqLine = `- **Liquidation price:** ${usd(liqPrice)} / ${ct}`;
    if (currentPrice && currentPrice > 0) {
      const dropPct = ((currentPrice - liqPrice) / currentPrice) * 100;
      liqLine += ` (current ${usd(currentPrice)} — a ${num(dropPct, 1)}% drop reaches liquidation)`;
    }
    out.push(liqLine);
  }

  // Interest rate + who manages it
  if (trove.batch.isMember) {
    const mgr = getBatchManagerByAddress(trove.batch.manager)?.name ?? "a delegate";
    out.push(
      `- **Interest rate:** ${num(displayInterestRate, 2)}% managed by ${mgr} (+${num(trove.batch.managementFee, 2)}% management fee)`,
    );
  } else {
    out.push(`- **Interest rate:** ${num(displayInterestRate, 2)}% (self-managed)`);
  }
  out.push("");

  // ── Economics ──
  out.push("## Economics");
  out.push(`- **Interest cost:** ~${bold(dailyInterestCost)}/day (~${bold(annualInterestCost)}/year)`);
  if (trove.batch.isMember && trove.batch.managementFee > 0) {
    const annualMgmt = (displayRecordedDebt * trove.batch.managementFee) / 100;
    out.push(`- **Management fee:** ~${bold(annualMgmt / 365)}/day (~${bold(annualMgmt)}/year)`);
  }
  if (debtInFront !== null && debtInFront !== undefined) {
    let difLine = `- **Debt in front:** ~${bold(debtInFront)} sits at the same or lower interest rate and is exposed to redemption alongside this trove`;
    if (trovesAhead !== null && trovesAhead !== undefined) {
      difLine += ` (${trovesAhead} other trove${trovesAhead !== 1 ? "s" : ""})`;
    }
    out.push(difLine);
  }
  out.push("");

  return out;
}

function closedOrLiquidatedHeadlines(trove: TroveSummary): string[] {
  const out: string[] = [];
  out.push("## Headlines");
  if (trove.status === "liquidated") {
    const mcr = getLiquidationThreshold(trove.collateralType);
    out.push(
      `- This trove was **liquidated** when its collateral ratio fell below the ${mcr}% minimum for ${trove.collateralType}.`,
    );
  } else {
    out.push(`- This trove is **closed** — all debt was repaid and remaining collateral returned to the owner.`);
  }
  out.push("");
  return out;
}

function timelineTable(events: BaseActivityEvent[], collateralType: string): string[] {
  const out: string[] = [];
  out.push(`## Activity timeline (${events.length} event${events.length === 1 ? "" : "s"}, oldest first)`);
  out.push("");
  if (events.length === 0) {
    out.push("_No transaction history available._");
    return out;
  }
  out.push(`| # | Date | Action | Debt after (BOLD) | Collateral after (${collateralType}) | Transaction |`);
  out.push("|---|------|--------|-------------------|------------------------|-------------|");
  events.forEach((e, i) => {
    if (isCollSurplusClaimEvent(e)) {
      const tx = e.etherscanUrl ? `[${e.txHash.slice(0, 10)}…](${e.etherscanUrl})` : e.txHash.slice(0, 10) + "…";
      out.push(`| ${i + 1} | ${fmtUtc(e.timestamp)} | ${claimMarkdownLabel(e.context.data)} | — | — | ${tx} |`);
      return;
    }
    if (!isLiquityEvent(e)) return;
    const d = e.context.data;
    const debtAfter = d.stateAfter ? num(d.stateAfter.debt, 2) : "—";
    const collAfter = d.stateAfter ? amt(d.stateAfter.coll) : "—";
    const label = actionLabel(getEventActionKey(e), "liquity-v2-troves");
    const tx = e.etherscanUrl ? `[${e.txHash.slice(0, 10)}…](${e.etherscanUrl})` : e.txHash.slice(0, 10) + "…";
    out.push(`| ${i + 1} | ${fmtUtc(e.timestamp)} | ${label} | ${debtAfter} | ${collAfter} | ${tx} |`);
  });
  out.push("");
  return out;
}
