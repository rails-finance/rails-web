// Serialize a wallet's Compound V2 position + activity timeline into a
// plain-Markdown snapshot, suitable for pasting into an LLM ("here's my
// position — am I at risk?"). Sibling of lib/moonwell/position-to-markdown.ts:
// Rails has already done the drift-resistant computation (the Comptroller's
// own getAccountLiquidity verdict, oracle USD, the live borrowBalanceStored
// debt), so the markdown carries those computed numbers rather than leaving an
// LLM to guess.
//
// Compound V2 cross-collateralises its twenty markets through one Comptroller,
// so the snapshot is ONE account section (supplies + borrows across markets,
// then the live risk lines) followed by the unified timeline. A PURE function
// of the data already in scope on the detail page — no fetching.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isCompoundV2Event } from "@/lib/shared/types/event-shape";
import type { CompoundV2PositionView } from "@/components/protocol/compound-v2/compound-v2-position-card";
import type { CompoundV2ChainResponse } from "@/lib/api/fetch-compound-v2-position";
import { num, amt, usd, fmtUtc, txCell } from "@/lib/shared/position-markdown";
import {
  markdownFirstTimestamp,
  markdownTimelineSlice,
  type MarkdownHistoryScope,
} from "@/lib/shared/markdown-history";

export interface CompoundV2PositionMarkdownArgs {
  /** What `events` covers, when the page drew a window over a longer history.
   *  Absent means `events` IS the whole history and answers for itself. */
  history?: MarkdownHistoryScope;
  wallet: string;
  /** The card view, as the page renders it (borrow rows already upgraded to
   *  the live borrowBalanceStored where the chain read landed). */
  view: CompoundV2PositionView;
  /** The live per-account chain read; null (or stale) simply omits the live
   *  risk lines. */
  chain: CompoundV2ChainResponse | null;
  /** Chronologically sorted (oldest → newest) event list, all markets. */
  events: BaseActivityEvent[];
  /** When the snapshot was taken (copy time) — passed in so the serializer
   *  stays pure. */
  generatedAt: Date;
}

/** Oracle USD for one leg; null when this market isn't priced. */
function legUsd(view: CompoundV2PositionView, market: string, amount: number): number | null {
  const p = view.priceByMarket?.[market];
  return typeof p === "number" && p > 0 ? amount * p : null;
}

/** "1,234.56 USDC ($1,234.10)" — the token figure with its oracle USD when
 *  priced, flagged when the price is a stored constant with no feed. */
function tokenWithUsd(view: CompoundV2PositionView, market: string, amount: number, symbol: string): string {
  const u = legUsd(view, market, amount);
  const fixed = view.priceFixedByMarket?.[market] === true;
  return `${amt(amount)} ${symbol}${u != null ? ` (${usd(u)}${fixed ? " — oracle price is a stored constant, no feed" : ""})` : ""}`;
}

export function compoundV2PositionToMarkdown(args: CompoundV2PositionMarkdownArgs): string {
  const { wallet, view, chain, events, generatedAt } = args;
  const live = chain && !chain.chainStale ? chain : null;
  const lines: string[] = [];

  lines.push(`# Compound V2 (Ethereum) position`);
  lines.push("");
  lines.push(
    `> Point-in-time snapshot generated ${fmtUtc(generatedAt.getTime() / 1000)}. ` +
      `Balances are the replayed cToken events upgraded to the contracts' live reads where taken ` +
      `(supply = exact cTokens × exchangeRateStored, debt = borrowBalanceStored), ` +
      `USD is Compound's own oracle (getUnderlyingPrice — three markets carry a stored constant with no feed), ` +
      `and the account verdict (getAccountLiquidity: liquidity / shortfall) is the Comptroller's own. ` +
      `Everything drifts as the market and position change. Not financial advice.`,
  );
  lines.push("");
  lines.push(`- **Wallet:** ${wallet}`);
  lines.push(`- **Status:** ${view.status[0].toUpperCase() + view.status.slice(1)}`);
  if (view.liquidationCount > 0) {
    lines.push(
      `- **Liquidations:** ${view.liquidationCount}` +
        (view.status === "open"
          ? " — the account remains open: Compound V2 liquidations are partial (close factor 50%), and borrowers commonly survive them"
          : ""),
    );
  }
  lines.push("");

  if (view.status !== "open") {
    // Unwound: the headline is what each market held at its height (chain-state
    // token amounts only — the oracle prices the PRESENT, not history).
    for (const p of view.peakSupplies) {
      lines.push(`- **Highest recorded supply (${p.symbol}):** ${amt(p.amount)} ${p.symbol}`);
    }
    for (const p of view.peakBorrows) {
      lines.push(`- **Highest recorded debt (${p.symbol}):** ${amt(p.amount)} ${p.symbol}`);
    }
    lines.push("");
  } else {
    if (view.supplies.length > 0) {
      lines.push(`## Supplied`);
      lines.push("");
      for (const r of view.supplies) {
        const amount = r.current ?? r.principal;
        const basis =
          r.current != null
            ? "cTokens × exchangeRateStored, incl. accrued interest"
            : "replayed deposit principal, ex-interest";
        const m = live?.markets.find((x) => x.market === r.market);
        const entered = m?.entered;
        const disabled = m?.collateralDisabled;
        lines.push(
          `- **${r.symbol} (${r.cSymbol}):** ${tokenWithUsd(view, r.market, amount, r.symbol)} (${basis})` +
            (entered === false
              ? " — NOT entered as collateral: backs no borrowing, can't be seized"
              : disabled === true
                ? " — this market is DISABLED as collateral (zero collateral factor): it earns but backs nothing"
                : ""),
        );
      }
      lines.push("");
    }
    if (view.borrows.length > 0) {
      lines.push(`## Borrowed`);
      lines.push("");
      for (const r of view.borrows) {
        const basis = r.live
          ? "live borrowBalanceStored, interest included"
          : "emitted accountBorrows at the last borrow/repay/liquidation event; interest since then not included";
        lines.push(`- **${r.symbol} (${r.cSymbol}):** ${tokenWithUsd(view, r.market, r.amount, r.symbol)} (${basis})`);
      }
      lines.push("");
    }

    // Live risk lines — the Comptroller's own verdict leads; the HF-style
    // figure is an explicitly-labeled replica.
    if (live) {
      lines.push(`## Live risk (at block ${live.blockNumber})`);
      lines.push("");
      lines.push(
        `- **Comptroller's own verdict (getAccountLiquidity):** ` +
          (live.shortfallUsd > 0
            ? `shortfall ${usd(live.shortfallUsd)} — the account is liquidatable now`
            : `${usd(live.liquidityUsd)} of liquidity still unborrowed`),
      );
      if (live.healthReplica != null) {
        lines.push(
          `- **Health-factor replica:** ${num(live.healthReplica, 2)} (CF-weighted capacity ÷ debt — client arithmetic mirroring the Comptroller's walk, NOT a contract figure; the verdict above is the authoritative judgement. 1.0 corresponds to the shortfall line — one collateral factor, so the borrow limit IS the liquidation line)`,
        );
        lines.push(
          `- **Collateral (entered):** ${usd(live.collateralValueUsd)} · **capacity line:** ${usd(live.collateralCapacityUsd)} · **debt:** ${usd(live.debtValueUsd)}`,
        );
      }
      lines.push(
        `- **Liquidation mechanics:** close factor ${num(live.closeFactor * 100, 0)}% (max share of one debt per liquidation — partial by design), liquidation incentive ${num(Math.max(0, live.liquidationIncentive - 1) * 100, 0)}%; the protocol keeps its own burned share of every seizure`,
      );
      for (const m of live.markets) {
        const rates =
          m.supplyApr != null && m.borrowApr != null
            ? `supply ${num(m.supplyApr * 100, 2)}% APR, borrow ${num(m.borrowApr * 100, 2)}% APR`
            : "rates unavailable";
        lines.push(
          `- **${m.symbol} market:** ${rates}` +
            (m.collateralFactor != null
              ? `, collateral factor ${num(m.collateralFactor * 100, 0)}%`
              : m.collateralDisabled
                ? `, collateral disabled`
                : "") +
            (m.priceUsd != null
              ? `, oracle price ${usd(m.priceUsd)}${m.priceHasFeed ? "" : " (stored constant, no feed)"}`
              : ""),
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
  out.push("| # | Date | Action | Market | Amount | cTokens after | Debt after | Transaction |");
  out.push("|---|------|--------|--------|--------|---------------|------------|-------------|");
  rows.forEach((e, i) => {
    if (!isCompoundV2Event(e)) return;
    const d = e.context.data;
    const label = e.actionLabel;
    // Mint/redeem/borrow/repay/liquidation carry an underlying amount;
    // transfers and seize legs move only cTokens (no underlying log), so the
    // cToken delta stands in, labeled.
    const amount =
      d.assetsDelta != null
        ? `${amt(Math.abs(parseFloat(d.assetsDelta)))} ${d.marketSymbol}`
        : d.cTokensDelta != null
          ? `${amt(Math.abs(parseFloat(d.cTokensDelta)))} c${d.marketSymbol}`
          : "—";
    const cAfter = d.cTokensAfter != null ? amt(parseFloat(d.cTokensAfter)) : "—";
    const debtAfter = d.debtAfter != null ? amt(parseFloat(d.debtAfter)) : "—";
    out.push(
      `| ${firstIndex + i} | ${fmtUtc(e.timestamp)} | ${label} | ${d.marketSymbol} | ${amount} | ${cAfter} | ${debtAfter} | ${txCell(e)} |`,
    );
  });
  out.push("");
  out.push(
    "_cTokens after is the exact receipt-token balance (= balanceOf, slot-verified); debt after is the event's own emitted accountBorrows (interest to that moment included; a liquidation's comes from the repay leg it itself emitted). Seizure rows are collateral being taken under the protocol's liquidation rules — not transfers the borrower made._",
  );
  out.push("");
  return out;
}
