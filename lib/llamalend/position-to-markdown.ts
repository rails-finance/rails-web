// Serialize a LlamaLend position + activity timeline into a plain-Markdown
// snapshot, suitable for pasting into an LLM ("here's my position — am I at
// risk?"). Rails has already done the drift-resistant computation (the live
// user_state legs, the converted/soft-liq amount with its two-contract
// cross-check, the band edges from the deployed integer math), so the
// markdown carries those computed numbers rather than leaving an LLM to
// guess.
//
// The grain is the protocol's own: ONE (controller, user) pair — an isolated
// market — so this snapshot never aggregates a user across markets. A PURE
// function of the data already in scope on the detail page — no fetching.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isLlamalendEvent } from "@/lib/shared/types/event-shape";
import type { LlamalendPositionView } from "@/components/protocol/llamalend/llamalend-position-card";
import type { LlamalendChainResponse } from "@/lib/api/fetch-llamalend-position";
import { num, amt, usd, fmtUtc, txCell } from "@/lib/shared/position-markdown";
import {
  markdownFirstTimestamp,
  markdownTimelineSlice,
  type MarkdownHistoryScope,
} from "@/lib/shared/markdown-history";

export interface LlamalendPositionMarkdownArgs {
  /** What `events` covers, when the page drew a window over a longer history.
   *  Absent means `events` IS the whole history and answers for itself. */
  history?: MarkdownHistoryScope;
  controller: string;
  user: string;
  /** The card view, as the page renders it. */
  view: LlamalendPositionView;
  /** The live chain read; null (or stale) simply omits the live risk lines. */
  chain: LlamalendChainResponse | null;
  /** Chronologically sorted (oldest → newest) event list. */
  events: BaseActivityEvent[];
  /** When the snapshot was taken (copy time) — passed in so the serializer
   *  stays pure. */
  generatedAt: Date;
}

export function llamalendPositionToMarkdown(args: LlamalendPositionMarkdownArgs): string {
  const { controller, user, view, chain, events, generatedAt } = args;
  const live = chain && !chain.chainStale ? chain : null;
  const unit = view.borrowedIsCrvusd ? `${view.borrowedSymbol} (~$1)` : view.borrowedSymbol;
  const lines: string[] = [];

  lines.push(`# LlamaLend (Curve, Ethereum) position`);
  lines.push("");
  lines.push(
    `> Point-in-time snapshot generated ${fmtUtc(generatedAt.getTime() / 1000)}. ` +
      `The position is ONE (market, user) pair — each LlamaLend Controller is an isolated market ` +
      `(one collateral, one borrowed token) margined and liquidated independently of the user's other markets. ` +
      `Liquidation is two-stage: SOFT (the AMM converts collateral to the borrowed token continuously while the ` +
      `price is inside the position's band — reversible, no event) then HARD (a one-shot Liquidate once health ` +
      `goes negative). Debt accrues per second. ` +
      (view.borrowedIsCrvusd
        ? `Prices and debt are in crvUSD, a $-pegged stable — figures read as dollars (unit: crvUSD ~$1). `
        : `⚠️ This market borrows ${view.borrowedSymbol}, NOT crvUSD — figures are in ${view.borrowedSymbol}, and no USD is asserted. `) +
      `Everything drifts as the market and position change. Not financial advice.`,
  );
  lines.push("");
  lines.push(`- **User:** ${user}`);
  lines.push(`- **Market:** ${view.marketLabel} (${view.version.toUpperCase()}) — controller ${controller}`);
  lines.push(`- **Status:** ${view.status[0].toUpperCase() + view.status.slice(1)}`);
  if (view.liquidationCount > 0) {
    lines.push(
      `- **Hard liquidations:** ${view.liquidationCount}` +
        (view.status === "open" ? " — the pair holds an open loan again" : ""),
    );
  }
  lines.push("");

  if (view.status === "open") {
    lines.push(`## Current state`);
    lines.push("");
    const basis =
      view.stateBasis === "chain"
        ? "live user_state read at the latest block"
        : "the last emitted UserState absolute — interest accrued since is not included";
    lines.push(
      view.collateral != null
        ? `- **Collateral:** ${amt(view.collateral)} ${view.collateralSymbol}${
            view.collateralUsd != null ? ` (${usd(view.collateralUsd)})` : ""
          } (${basis})`
        : `- **Collateral:** unstated — the last emitted UserState carried the contract's sentinel here (the chain did not state the figure); the live read carries the current one when available`,
    );
    lines.push(
      `- **Debt:** ${amt(view.debt)} ${view.borrowedSymbol}${view.debtUsd != null ? ` (${usd(view.debtUsd)})` : ""} (${basis})`,
    );
    if (view.converted != null) {
      lines.push(
        `- **Converted by the AMM (soft-liquidation):** ${amt(view.converted)} ${view.borrowedSymbol} — ` +
          (view.converted > 0
            ? `the position IS in soft-liquidation: this much collateral has already been converted (read live from user_state.stablecoin; it appears in no event)`
            : `nothing converted; the price sits above the band`),
      );
    }
    lines.push("");

    if (live && live.hasLoan) {
      lines.push(`## Live risk (at block ${live.blockNumber})`);
      lines.push("");
      if (live.priceOracle != null)
        lines.push(
          `- **Oracle price (AMM.price_oracle):** ${num(live.priceOracle, 4)} ${unit} per ${view.collateralSymbol}`,
        );
      if (live.pUp != null && live.pDown != null) {
        lines.push(
          `- **Soft-liquidation band:** begins at ${num(live.pUp, 4)} and completes at ${num(live.pDown, 4)} ${unit} ` +
            `(${live.bands} bands, ticks ${live.n1}…${live.n2}, A = ${live.A}) — derived by the deployed integer formula, exact against the AMM's own p_oracle_up/p_oracle_down`,
        );
      }
      if (live.health != null) {
        lines.push(
          `- **Health (price ÷ soft-liq onset):** ${num(live.health, 4)} — ${
            live.health >= 1
              ? `a fall of about ${Math.round((1 - 1 / live.health) * 100)}% starts conversion`
              : "inside (or beneath) the band"
          }`,
        );
      }
      if (live.convertedCrossCheckExact != null) {
        lines.push(
          `- **Converted-amount cross-check:** AMM.get_sum_xy(user).x ${
            live.convertedCrossCheckExact ? "EQUALS" : "did NOT equal"
          } user_state.stablecoin at this block${live.convertedCrossCheckExact ? " (wei-exact — two contracts, one figure)" : ""}`,
        );
      }
      if (live.fullyConverted)
        lines.push(
          `- **Fully converted:** nothing remains as ${view.collateralSymbol}; hard liquidation can be triggered`,
        );
      lines.push("");
    }
  }

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
  const { rows, heading, firstIndex } = markdownTimelineSlice(events, history);
  out.push(heading);
  out.push("");
  if (rows.length === 0) {
    out.push("_No transaction history available._");
    return out;
  }
  out.push("| # | Date | Action | Collateral Δ | Debt Δ | Collateral after | Debt after | Transaction |");
  out.push("|---|------|--------|--------------|--------|------------------|------------|-------------|");
  rows.forEach((e, i) => {
    if (!isLlamalendEvent(e)) return;
    const d = e.context.data;
    const cell = (v?: string, sym?: string) => (v != null ? `${amt(parseFloat(v))} ${sym}` : "—");
    out.push(
      `| ${firstIndex + i} | ${fmtUtc(e.timestamp)} | ${e.actionLabel} | ${cell(d.collateralDelta, d.collateralSymbol)} | ${cell(
        d.debtDelta,
        d.borrowedSymbol,
      )} | ${cell(d.collateralAfter, d.collateralSymbol)} | ${cell(d.debtAfter, d.borrowedSymbol)} | ${txCell(e)} |`,
    );
  });
  out.push("");
  out.push(
    "_Deltas are the Controller's own emitted event fields; the after-columns are the same-tx UserState absolutes (the state read at that block reproduces them). Soft-liquidation conversion appears in NO event — the live figures above carry it. Liquidation rows are balances taken under the protocol's rules — not acts the borrower performed (self-liquidations are the borrower's own close and say so)._",
  );
  out.push("");
  return out;
}
