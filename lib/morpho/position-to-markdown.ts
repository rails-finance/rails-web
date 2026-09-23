// Serialize a Morpho Blue position + activity timeline into a plain-Markdown
// snapshot, suitable for pasting into an LLM ("here's my position — am I at
// risk?"). Sibling of lib/aave-v3/position-to-markdown.ts: Rails has already
// done the drift-resistant computation (the _isHealthy replica, the live
// toAssetsUp debt, the market's own oracle read), so the markdown carries
// those computed numbers rather than leaving an LLM to guess them.
//
// EVERYTHING IS IN LOAN-TOKEN UNITS — NO USD. A Morpho oracle quotes the
// collateral asset in loan-asset terms (1e36-scaled), never USD; asserting a
// dollar figure would need an off-market feed, which this explorer's charter
// deliberately excludes. A PURE function of the data already in scope on the
// detail page — no fetching.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isMorphoEvent } from "@/lib/shared/types/event-shape";
import type { MorphoPositionView } from "@/components/protocol/morpho/morpho-position-card";
import type { MorphoChainPositionResponse } from "@/lib/api/fetch-morpho-position";
import { num, amt, fmtUtc, txCell } from "@/lib/shared/position-markdown";
import { oracleAge } from "@/lib/morpho/oracle-age";
import {
  markdownFirstTimestamp,
  markdownTimelineSlice,
  type MarkdownHistoryScope,
} from "@/lib/shared/markdown-history";

export interface MorphoPositionMarkdownArgs {
  /** What `events` covers, when the page drew a window over a longer history.
   *  Absent means `events` IS the whole history and answers for itself. */
  history?: MarkdownHistoryScope;
  /** The card view the page renders — the live-upgraded one when the chain
   *  lane agreed with the index on borrow shares. */
  view: MorphoPositionView;
  /** The live chain lane (slots at head, oracle, IRM); null while it streams
   *  in or when the read failed. */
  chain: MorphoChainPositionResponse | null;
  /** Chronologically sorted (oldest → newest) event list. */
  events: BaseActivityEvent[];
  /** When the snapshot was taken (copy time) — passed in so the serializer
   *  stays pure. */
  generatedAt: Date;
}

export function morphoPositionToMarkdown(args: MorphoPositionMarkdownArgs): string {
  const { view, chain, events, generatedAt } = args;
  const lines: string[] = [];
  const loan = view.loanSymbol;
  const coll = view.collateralSymbol ?? chain?.collateralSymbol ?? "collateral";

  lines.push(`# Morpho Blue position — ${view.marketLabel}`);
  lines.push("");
  lines.push(
    `> Point-in-time snapshot generated ${fmtUtc(generatedAt.getTime() / 1000)}. ` +
      `All values are in the market's OWN units — the loan token (${loan}) — because a Morpho oracle ` +
      `quotes collateral in loan-asset terms, never USD; no dollar figure is asserted anywhere. ` +
      `Balances are the position's own contract slots; the health arithmetic replicates Morpho's ` +
      `internal _isHealthy (the contract exposes no public verdict getter). ` +
      `Everything drifts as the market and position change. Not financial advice.`,
  );
  lines.push("");
  lines.push(`- **Status:** ${view.status[0].toUpperCase() + view.status.slice(1)}`);
  lines.push(`- **Market:** ${view.marketLabel} (id ${view.marketId})`);
  lines.push(`- **Borrower:** ${view.owner}`);
  lines.push(`- **Liquidation LTV (LLTV):** ${num(view.lltv * 100, 1)}%`);
  if (view.everLiquidated) lines.push(`- **Liquidated at least once over its life.**`);
  if (view.badDebt > 0)
    lines.push(
      `- **Bad debt written off:** ${num(view.badDebt)} ${view.loanSymbol} — the share of the cleared debt the seized collateral could not cover, socialized to this market's lenders.`,
    );
  lines.push("");

  // ── Headlines (agree with the on-page card number-for-number) ──
  lines.push("## Headlines");
  if (view.status !== "open") {
    // Unwound: the headline is what the position held at its height.
    if (view.peakCollateral > 0) lines.push(`- **Highest recorded collateral:** ${amt(view.peakCollateral)} ${coll}`);
    if (view.peakBorrowed > 0)
      lines.push(`- **Highest recorded borrowed principal:** ${amt(view.peakBorrowed)} ${loan}`);
  } else {
    const collValue = chain && !chain.chainStale && chain.oraclePrice > 0 ? view.collateral * chain.oraclePrice : null;
    lines.push(
      `- **Collateral:** ${amt(view.collateral)} ${coll}` +
        (collValue != null ? ` (= ${amt(collValue)} ${loan} at the market's own oracle)` : ""),
    );
    if (view.currentDebt) {
      lines.push(
        `- **Debt:** ${amt(view.currentDebt.amount)} ${loan} incl. accrued interest ` +
          `(borrowed principal ${amt(view.borrowed)} ${loan}, accrued ${amt(view.currentDebt.accruedAmount)} ${loan})` +
          (view.currentDebt.index?.stale
            ? `; interest to ${fmtUtc(Date.parse(view.currentDebt.index.readAt) / 1000)}, block ${num(view.currentDebt.index.block)}`
            : ""),
      );
    } else if (view.borrowed > 0) {
      lines.push(`- **Borrowed principal:** ${amt(view.borrowed)} ${loan} (ex-interest — no live market index)`);
    } else {
      lines.push(`- **Debt:** none (collateral-only position)`);
    }
    if (chain && !chain.chainStale) {
      if (chain.ltv != null) {
        lines.push(`- **Loan-to-value:** ${num(chain.ltv * 100, 1)}% of the ${num(chain.lltv * 100, 1)}% LLTV`);
      }
      if (chain.healthFactor != null) {
        lines.push(
          `- **Health factor:** ${num(chain.healthFactor, 2)} (liquidation capacity ÷ debt; liquidatable below 1.0)` +
            (chain.healthy != null ? ` — _isHealthy replica says ${chain.healthy ? "healthy" : "NOT healthy"}` : ""),
        );
      }
      if (chain.oraclePrice > 0) {
        const age = oracleAge(chain);
        const feeds = chain.oracleFeeds?.map((f) => f.description ?? f.address).join(", ");
        lines.push(
          `- **Oracle price:** 1 ${coll} = ${amt(chain.oraclePrice)} ${loan} (the market's own oracle)` +
            (age
              ? ` — ${age.feedCount > 1 ? `oldest of ${age.feedCount} feeds (${feeds})` : `feed ${feeds}`} published ` +
                `${age.published}, ${age.age} before block ${chain.blockNumber}`
              : ""),
        );
      }
      lines.push(
        `- **Market rates (at block ${chain.blockNumber}):** borrow ${num(chain.borrowApr * 100, 2)}% APR, ` +
          `supply ${num(chain.supplyApr * 100, 2)}% APR, utilization ${num(chain.utilization * 100, 1)}%, ` +
          `fee ${num(chain.fee * 100, 0)}%`,
      );
      if (chain.lif > 1) {
        lines.push(
          `- **Liquidation incentive:** ${num((chain.lif - 1) * 100, 1)}% discount a liquidator seizes collateral at, past the LLTV line`,
        );
      }
    }
  }
  lines.push("");

  // ── Lifetime ──
  const opened = markdownFirstTimestamp(events, args.history);
  const last = events[events.length - 1]?.timestamp;
  lines.push("## Lifetime");
  if (opened) lines.push(`- **First captured activity:** ${fmtUtc(opened)}`);
  if (last) lines.push(`- **Last activity:** ${fmtUtc(last)}`);
  lines.push(`- **Events:** ${view.eventCount}`);
  lines.push(`- **Transactions (own, excludes liquidations):** ${view.txCount}`);
  lines.push("");

  lines.push(...timelineTable(events, args.history));
  return lines.join("\n");
}

function timelineTable(events: BaseActivityEvent[], history: MarkdownHistoryScope | undefined): string[] {
  const out: string[] = [];
  const { rows, heading, firstIndex } = markdownTimelineSlice(events, history);
  out.push(heading);
  out.push("");
  if (rows.length === 0) {
    out.push("_No transaction history available._");
    return out;
  }
  out.push("| # | Date | Action | Token | Amount | Collateral after | Borrowed after | Transaction |");
  out.push("|---|------|--------|-------|--------|------------------|----------------|-------------|");
  rows.forEach((e, i) => {
    if (!isMorphoEvent(e)) return;
    const d = e.context.data;
    const label = (d.eventType[0].toUpperCase() + d.eventType.slice(1)).replace(/_/g, " ");
    const token = d.side === "collateral" ? d.collateralSymbol : d.loanSymbol;
    const amount = amt(Math.abs(parseFloat(d.assetsDelta)));
    out.push(
      `| ${firstIndex + i} | ${fmtUtc(e.timestamp)} | ${label} | ${token} | ${amount} | ${amt(parseFloat(d.collateralAfter))} | ${amt(parseFloat(d.borrowedAfter))} | ${txCell(e)} |`,
    );
  });
  out.push("");
  out.push("_Borrowed after is net PRINCIPAL (Σ borrows − repays) — accrued interest is the live layer above._");
  out.push("");
  return out;
}
