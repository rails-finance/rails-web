// Serialize a Dolomite account's position + activity timeline into a
// plain-Markdown snapshot, suitable for pasting into an LLM ("here's my
// position — am I at risk?"). Rails has already done the drift-resistant
// computation (the core's own raw and adjusted values, the account's own
// margin requirement including the risk override, live balances off the
// accruing index), so the markdown carries those computed numbers rather than
// leaving an LLM to guess.
//
// The grain is the contract's own: ONE Account.Info = (owner, accountNumber)
// — cross-margin within, isolated across, so this snapshot never aggregates
// an owner. A PURE function of the data already in scope on the detail page —
// no fetching.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isDolomiteEvent } from "@/lib/shared/types/event-shape";
import type { DolomitePositionView } from "@/components/protocol/dolomite/dolomite-position-card";
import type { DolomiteChainResponse } from "@/lib/api/fetch-dolomite-position";
import { num, amt, usd, fmtUtc, txCell } from "@/lib/shared/position-markdown";
import {
  markdownFirstTimestamp,
  markdownTimelineSlice,
  type MarkdownHistoryScope,
} from "@/lib/shared/markdown-history";

export interface DolomitePositionMarkdownArgs {
  /** What `events` covers, when the page drew a window over a longer history.
   *  Absent means `events` IS the whole history and answers for itself. */
  history?: MarkdownHistoryScope;
  owner: string;
  /** uint256 — decimal string. */
  accountNumber: string;
  /** The card view, as the page renders it. */
  view: DolomitePositionView;
  /** The live per-account chain read; null (or stale) simply omits the live
   *  risk lines. */
  chain: DolomiteChainResponse | null;
  /** Chronologically sorted (oldest → newest) event list, all markets. */
  events: BaseActivityEvent[];
  /** When the snapshot was taken (copy time) — passed in so the serializer
   *  stays pure. */
  generatedAt: Date;
}

/** Oracle USD for one leg; null when this market isn't priced. */
function legUsd(view: DolomitePositionView, marketId: number, amount: number): number | null {
  const p = view.priceByMarket?.[String(marketId)];
  return typeof p === "number" && p > 0 ? amount * p : null;
}

function tokenWithUsd(view: DolomitePositionView, marketId: number, amount: number, symbol: string): string {
  const u = legUsd(view, marketId, amount);
  return `${amt(amount)} ${symbol}${u != null ? ` (${usd(u)})` : ""}`;
}

export function dolomitePositionToMarkdown(args: DolomitePositionMarkdownArgs): string {
  const { owner, accountNumber, view, chain, events, generatedAt } = args;
  const live = chain && !chain.chainStale ? chain : null;
  const lines: string[] = [];

  lines.push(`# Dolomite (Ethereum) position`);
  lines.push("");
  lines.push(
    `> Point-in-time snapshot generated ${fmtUtc(generatedAt.getTime() / 1000)}. ` +
      `The position is ONE Dolomite account — an (owner, account number) pair: cross-margined within itself, ` +
      `fully isolated from the owner's other accounts, which are margined and liquidated independently. ` +
      `Balances are par × the market's current interest index (interest accrues per second, settled on read); ` +
      `a negative balance IS debt — the core has no Borrow action. USD is the core's own getMarketPrice, ` +
      `and the margin figures are the core's own getters. Everything drifts as the market and position change. ` +
      `Not financial advice.`,
  );
  lines.push("");
  lines.push(`- **Owner:** ${owner}`);
  lines.push(`- **Account number:** ${accountNumber} (${view.accountLabel})`);
  lines.push(`- **Status:** ${view.status[0].toUpperCase() + view.status.slice(1)}`);
  if (view.liquidationCount > 0) {
    lines.push(
      `- **Liquidations:** ${view.liquidationCount}` +
        (view.status === "open" ? " — the account remains open: Dolomite liquidations are partial and repeatable" : ""),
    );
  }
  lines.push("");

  if (view.status !== "open") {
    // Unwound: the headline is what each market lane held at its height —
    // PAR amounts (the oracle prices the PRESENT, not history).
    for (const p of view.peakSupplies) {
      lines.push(
        `- **Highest recorded balance (${p.symbol}, market ${p.marketId}):** ${amt(p.amount)} ${p.symbol} (par)`,
      );
    }
    for (const p of view.peakBorrows) {
      lines.push(`- **Highest recorded debt (${p.symbol}, market ${p.marketId}):** ${amt(p.amount)} ${p.symbol} (par)`);
    }
    if (view.peakSupplies.length > 0 || view.peakBorrows.length > 0) lines.push("");
  }

  if (view.status === "open") {
    if (view.supplies.length > 0) {
      lines.push(`## Holding (positive balances)`);
      lines.push("");
      for (const r of view.supplies) {
        const amount = r.current ?? r.par;
        const basis =
          r.current != null
            ? "par × current index, interest included"
            : "par — the scaled balance; multiply by the market's index for tokens";
        lines.push(
          `- **${r.symbol} (market ${r.marketId}):** ${tokenWithUsd(view, r.marketId, amount, r.symbol)} (${basis})`,
        );
      }
      lines.push("");
    }
    if (view.borrows.length > 0) {
      lines.push(`## Owing (negative balances — debt)`);
      lines.push("");
      for (const r of view.borrows) {
        const amount = r.current ?? r.par;
        const basis =
          r.current != null
            ? "par × current index, interest included"
            : "par — the scaled balance; multiply by the market's index for tokens";
        lines.push(
          `- **${r.symbol} (market ${r.marketId}):** ${tokenWithUsd(view, r.marketId, amount, r.symbol)} (${basis})`,
        );
      }
      lines.push("");
    }

    if (live) {
      lines.push(`## Live risk (at block ${live.blockNumber})`);
      lines.push("");
      lines.push(
        `- **The core's own values (getAccountValues):** ${usd(live.supplyValueUsd)} supplied · ${usd(live.borrowValueUsd)} borrowed`,
      );
      lines.push(
        `- **Premium-adjusted (getAdjustedAccountValues):** ${usd(live.adjSupplyValueUsd)} against ${usd(live.adjBorrowValueUsd)} — premiums are applied MULTIPLICATIVELY by the core itself (supply ÷ (1+premium), borrow × (1+premium))${
          live.override.active ? ", except that THIS account's override skips them (adjusted equals raw exactly)" : ""
        }`,
      );
      if (live.override.active) {
        lines.push(
          `- **Account risk override (getAccountRiskOverrideByAccount):** ACTIVE — minimum collateralisation ${num(live.requiredCollateralization * 100, 2)}% (instead of the global ${num((1 + live.marginRatio) * 100, 2)}%), liquidation spread ${
            live.override.liquidationSpread != null ? num(live.override.liquidationSpread * 100, 0) : "—"
          }% (instead of ${num(live.liquidationSpread * 100, 0)}%), per-market premiums skipped`,
        );
      } else {
        lines.push(
          `- **Margin requirement (1 + getMarginRatioForAccount):** ${num(live.requiredCollateralization * 100, 2)}% minimum collateralisation — the global ratio; no account override applies`,
        );
      }
      if (live.collateralization != null) {
        lines.push(
          `- **Collateralisation:** ${num(live.collateralization * 100, 2)}% (adjusted supply ÷ adjusted borrow — both legs the core's own figures; liquidatable below the requirement)`,
        );
      }
      lines.push(`- **Stored account status (getAccountStatus):** ${live.accountStatusLabel}`);
      for (const b of live.balances) {
        const rates =
          b.supplyAprPct != null && b.borrowAprPct != null
            ? `supply ${num(b.supplyAprPct, 2)}% APR, borrow ${num(b.borrowAprPct, 2)}% APR (per-second accrual, annualized)`
            : "rates unavailable";
        lines.push(
          `- **${b.symbol} market (${b.marketId}):** ${rates}, margin premium ${num(b.marginPremium * 100, 1)}%${
            live.override.active ? " (skipped under the override)" : ""
          }${b.priceUsd != null ? `, oracle price ${usd(b.priceUsd)}` : ""}${b.isClosing ? ", closed to new borrowing" : ""}`,
        );
      }
      lines.push("");
    }
  }

  // ── Lifetime ──
  const opened = markdownFirstTimestamp(events, args.history);
  const last = events[events.length - 1]?.timestamp;
  lines.push("## Lifetime");
  if (opened) lines.push(`- **First captured activity:** ${fmtUtc(opened)}`);
  if (last) lines.push(`- **Last activity:** ${fmtUtc(last)}`);
  lines.push(`- **Transactions:** ${view.txCount}`);
  lines.push("");

  lines.push(...timelineTable(events, args.history));
  return lines.join("\n");
}

function timelineTable(events: BaseActivityEvent[], history: MarkdownHistoryScope | undefined): string[] {
  const out: string[] = [];
  const { rows, heading, firstIndex } = markdownTimelineSlice(events, history, { suffix: ", all markets" });
  out.push(heading);
  out.push("");
  if (rows.length === 0) {
    out.push("_No transaction history available._");
    return out;
  }
  out.push("| # | Date | Action | Market | Amount | Par after | Transaction |");
  out.push("|---|------|--------|--------|--------|-----------|-------------|");
  rows.forEach((e, i) => {
    if (!isDolomiteEvent(e)) return;
    const d = e.context.data;
    const amount = d.weiDelta != null ? `${amt(Math.abs(parseFloat(d.weiDelta)))} ${d.marketSymbol}` : "—";
    const parAfter = d.parAfter != null ? amt(parseFloat(d.parAfter)) : "—";
    out.push(
      `| ${firstIndex + i} | ${fmtUtc(e.timestamp)} | ${e.actionLabel} | ${d.marketSymbol} | ${amount} | ${parAfter} | ${txCell(e)} |`,
    );
  });
  out.push("");
  out.push(
    "_Amount is the leg's emitted deltaWei (token units). Par after is the core's own emitted absolute after-state — the SCALED balance (multiply by the market's interest index for tokens); a negative par IS debt. Liquidation and seizure rows are balances taken under the protocol's rules — not acts the account performed._",
  );
  out.push("");
  return out;
}
