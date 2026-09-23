// Serialize a wallet's Compound V3 (Comet) positions + activity timeline into a
// plain-Markdown snapshot, suitable for pasting into an LLM ("here's my
// position — am I at risk?"). Sibling of lib/aave-v3/position-to-markdown.ts:
// Rails has already done the drift-resistant computation (the contract's own
// account verdicts, Comet-oracle USD, the live present-value base), so the
// markdown carries those computed numbers rather than leaving an LLM to guess.
//
// Comet is single-base / multi-collateral and a wallet can hold a position in
// EACH market, so the snapshot emits one section per (market, account) — the
// same shape as the page — then the unified cross-market timeline. A PURE
// function of the data already in scope on the detail page — no fetching.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isCompoundEvent } from "@/lib/shared/types/event-shape";
import type { CompoundPositionView } from "@/components/protocol/compound/compound-position-card";
import type { CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import { num, amt, usd, fmtUtc, txCell } from "@/lib/shared/position-markdown";
import {
  markdownFirstTimestamp,
  markdownTimelineSlice,
  type MarkdownHistoryScope,
} from "@/lib/shared/markdown-history";

export interface CompoundPositionsMarkdownArgs {
  /** What `events` covers, when the page drew a window over a longer history.
   *  Absent means `events` IS the whole history and answers for itself. */
  history?: MarkdownHistoryScope;
  wallet: string;
  /** One card view per (market, account), as the page renders them. */
  views: CompoundPositionView[];
  /** The live Comet reads keyed by market slug; a market absent here simply
   *  omits its live risk lines. */
  chainByMarket: Record<string, CompoundMarketChainResponse>;
  /** Chronologically sorted (oldest → newest) event list, all markets. */
  events: BaseActivityEvent[];
  /** When the snapshot was taken (copy time) — passed in so the serializer
   *  stays pure. */
  generatedAt: Date;
}

/** Comet-oracle USD for one leg; null when this market didn't price it. */
function legUsd(view: CompoundPositionView, address: string, amount: number): number | null {
  const p = view.priceByAddress?.[address.toLowerCase()];
  return typeof p === "number" && p > 0 ? amount * p : null;
}

/** "1,234.56 USDC ($1,234.10)" — the token figure with its oracle USD when priced. */
function tokenWithUsd(view: CompoundPositionView, address: string, amount: number, symbol: string): string {
  const u = legUsd(view, address, amount);
  return `${amt(amount)} ${symbol}${u != null ? ` (${usd(u)})` : ""}`;
}

function marketSection(view: CompoundPositionView, chain: CompoundMarketChainResponse | null): string[] {
  const lines: string[] = [];
  const eff = view.current
    ? { amount: view.current.amount, side: view.current.side, isChain: true }
    : { amount: view.base.amount, side: view.side, isChain: false };

  lines.push(`## ${view.marketLabel} market`);
  lines.push("");
  lines.push(`- **Status:** ${view.status[0].toUpperCase() + view.status.slice(1)}`);
  if (view.liquidationCount > 0) lines.push(`- **Liquidations (absorbs):** ${view.liquidationCount}`);

  if (view.status !== "open") {
    // Unwound: the headline is what the position held at its height (chain-state
    // token amounts only — the market's oracle prices the PRESENT, not history).
    if (view.peak.lentBase > 0) {
      lines.push(`- **Highest recorded lent base:** ${amt(view.peak.lentBase)} ${view.base.symbol}`);
    }
    for (const c of view.peak.collateral) {
      lines.push(`- **Highest recorded collateral:** ${amt(c.amount)} ${c.symbol}`);
    }
    if (view.peak.borrowedBase > 0) {
      lines.push(`- **Highest recorded borrowed principal:** ${amt(view.peak.borrowedBase)} ${view.base.symbol}`);
    }
    lines.push("");
    return lines;
  }

  // The base side: the live present value (incl. interest) when the chain
  // overlay landed, else the replayed principal.
  const baseNote = eff.isChain ? "incl. accrued interest" : "principal from the event replay, ex-interest";
  if (eff.side === "lend") {
    lines.push(`- **Lent base:** ${tokenWithUsd(view, view.base.address, eff.amount, view.base.symbol)} (${baseNote})`);
  } else if (eff.side === "borrow") {
    lines.push(
      `- **Borrowed base:** ${tokenWithUsd(view, view.base.address, Math.abs(eff.amount), view.base.symbol)} (${baseNote})`,
    );
  }
  if (view.collateral.length > 0) {
    lines.push(`- **Collateral (non-earning):**`);
    for (const c of view.collateral) {
      lines.push(`  - ${tokenWithUsd(view, c.address, c.amount, c.symbol)}`);
    }
  }

  // Live risk lines — the contract's own verdicts lead; the derived aggregates
  // are in the market's own quote unit (USD for cUSDCv3/cUSDTv3, ETH for
  // cWETHv3), exactly as the Comet price feeds quote them.
  if (chain && !chain.chainStale) {
    if (chain.healthFactor != null) {
      lines.push(
        `- **Health factor:** ${num(chain.healthFactor, 2)} (liquidation capacity ÷ debt; Comet absorbs at 1.0)`,
      );
      lines.push(
        `- **Contract's own verdicts:** isBorrowCollateralized ${chain.isBorrowCollateralized ? "true" : "false"}, isLiquidatable ${chain.isLiquidatable ? "true" : "false"}`,
      );
      lines.push(
        `- **Borrow capacity:** ${num(chain.borrowCapacity, 2)} ${chain.quoteUnit} · **liquidation line:** ${num(chain.liquidationCapacity, 2)} ${chain.quoteUnit} · **debt:** ${num(chain.debtValue, 2)} ${chain.quoteUnit}`,
      );
    }
    lines.push(
      `- **Market rates (at block ${chain.blockNumber}):** supply ${num(chain.supplyApr * 100, 2)}% APR, borrow ${num(chain.borrowApr * 100, 2)}% APR, utilization ${num(chain.utilization * 100, 1)}%`,
    );
  }
  lines.push("");
  return lines;
}

export function compoundPositionsToMarkdown(args: CompoundPositionsMarkdownArgs): string {
  const { wallet, views, chainByMarket, events, generatedAt } = args;
  const lines: string[] = [];

  lines.push(`# Compound V3 (Comet) positions`);
  lines.push("");
  lines.push(
    `> Point-in-time snapshot generated ${fmtUtc(generatedAt.getTime() / 1000)}. ` +
      `Balances are the replayed Comet events upgraded to the contract's live balanceOf where read, ` +
      `USD is Comet's own on-chain oracle (getPrice), and the account verdicts ` +
      `(isBorrowCollateralized / isLiquidatable) are the contract's own. ` +
      `Everything drifts as the market and position change. Not financial advice.`,
  );
  lines.push("");
  lines.push(`- **Wallet:** ${wallet}`);
  lines.push(
    `- **Markets held:** ${views.length} (a wallet holds one single-base / multi-collateral position per Comet market)`,
  );
  lines.push("");

  for (const view of views) {
    lines.push(...marketSection(view, chainByMarket[view.market] ?? null));
  }

  // ── Lifetime ──
  const opened = markdownFirstTimestamp(events, args.history);
  const last = events[events.length - 1]?.timestamp;
  lines.push("## Lifetime");
  if (opened) lines.push(`- **First captured activity:** ${fmtUtc(opened)}`);
  if (last) lines.push(`- **Last activity:** ${fmtUtc(last)}`);
  lines.push(`- **Transactions:** ${views.reduce((n, v) => n + v.txCount, 0)}`);
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
  out.push("| # | Date | Action | Market | Asset | Amount | Base after | Collateral after | Transaction |");
  out.push("|---|------|--------|--------|-------|--------|------------|------------------|-------------|");
  rows.forEach((e, i) => {
    if (!isCompoundEvent(e)) return;
    const d = e.context.data;
    // Comet's own verbs, prettified: absorb_debt → "Absorb debt" (a liquidation).
    const label = (d.eventType[0].toUpperCase() + d.eventType.slice(1)).replace(/_/g, " ");
    const amount = amt(Math.abs(parseFloat(d.assetsDelta)));
    const baseAfter = d.baseAfter != null ? amt(parseFloat(d.baseAfter)) : "—";
    const collAfter = d.collateralAfter != null ? amt(parseFloat(d.collateralAfter)) : "—";
    out.push(
      `| ${firstIndex + i} | ${fmtUtc(e.timestamp)} | ${label} | ${d.marketLabel} | ${d.assetSymbol} | ${amount} | ${baseAfter} | ${collAfter} | ${txCell(e)} |`,
    );
  });
  out.push("");
  out.push(
    "_Base after is the SIGNED base balance (> 0 lending, < 0 borrowing); collateral after is the touched asset's balance._",
  );
  out.push("");
  return out;
}
