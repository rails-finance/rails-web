// Serialize a wallet's Moonwell position + activity timeline into a
// plain-Markdown snapshot, suitable for pasting into an LLM ("here's my
// position — am I at risk?"). Sibling of lib/compound/position-to-markdown.ts:
// Rails has already done the drift-resistant computation (the Comptroller's
// own getAccountLiquidity verdict, oracle USD, the live borrowBalanceStored
// debt), so the markdown carries those computed numbers rather than leaving an
// LLM to guess.
//
// Moonwell cross-collateralises its four markets through one Comptroller, so
// the snapshot is ONE account section (supplies + borrows across markets, then
// the live risk lines) followed by the unified timeline. A PURE function of
// the data already in scope on the detail page — no fetching.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isMoonwellEvent } from "@/lib/shared/types/event-shape";
import type { MoonwellPositionView } from "@/components/protocol/moonwell/moonwell-position-card";
import type { MoonwellChainResponse } from "@/lib/api/fetch-moonwell-position";
import { num, amt, usd, fmtUtc, txCell } from "@/lib/shared/position-markdown";
import {
  anchorMarketNotes,
  marketNoteHeadline,
  marketNoteReceiptLine,
  marketNoteRowAnnotation,
  marketNoteSentence,
  type MarketNote,
} from "@/lib/shared/market-note";
import {
  markdownFirstTimestamp,
  markdownTimelineSlice,
  type MarkdownHistoryScope,
} from "@/lib/shared/markdown-history";

export interface MoonwellPositionMarkdownArgs {
  /** What `events` covers, when the page drew a window over a longer history.
   *  Absent means `events` IS the whole history and answers for itself. */
  history?: MarkdownHistoryScope;
  wallet: string;
  /** The deployment the title names — "Moonwell (Ethereum)" by default. */
  deploymentName?: string;
  /** Where the figures came from. `index` (default): rails-server's captured
   *  history, upgraded to live reads where taken. `sweep`: the page's own
   *  live reads at a named block, the history swept from the chain's logs for
   *  this request — Base. The preamble says which. */
  source?: "index" | "sweep";
  /** The card view, as the page renders it (borrow rows already upgraded to
   *  the live borrowBalanceStored where the chain read landed). */
  view: MoonwellPositionView;
  /** The live per-account chain read; null (or stale) simply omits the live
   *  risk lines. */
  chain: MoonwellChainResponse | null;
  /** Chronologically sorted (oldest → newest) event list, all markets. */
  events: BaseActivityEvent[];
  /** Market notes for this position — receipted facts about the markets it was
   *  in, observed between two of its own events (lib/shared/market-note.ts).
   *  They ride three placements below (a line in the account section, their own
   *  section, an annotation on the event they are anchored to) and are counted
   *  in NO total here: the event table's row count and every figure in it are
   *  what they are with this absent. The CSV carries events only. */
  notes?: MarketNote[];
  /** This account's live notes (lib/shared/market-note.ts's `liveShareRateNote`)
   *  — one per entered market it still holds, the market's own live exchange
   *  rate against this account's own newest Mint/Redeem in it. Never
   *  anchored (the later end is the chain head, past every event's block)
   *  and never in the timeline table; listed alongside the historical notes
   *  in the "Market notes" section only. */
  liveNotes?: MarketNote[];
  /** When the snapshot was taken (copy time) — passed in so the serializer
   *  stays pure. */
  generatedAt: Date;
}

/** Oracle USD for one leg; null when this market isn't priced. */
function legUsd(view: MoonwellPositionView, address: string, amount: number): number | null {
  const p = view.priceByAddress?.[address.toLowerCase()];
  return typeof p === "number" && p > 0 ? amount * p : null;
}

/** "1,234.56 USDC ($1,234.10)" — the token figure with its oracle USD when priced. */
function tokenWithUsd(view: MoonwellPositionView, address: string, amount: number, symbol: string): string {
  const u = legUsd(view, address, amount);
  return `${amt(amount)} ${symbol}${u != null ? ` (${usd(u)})` : ""}`;
}

export function moonwellPositionToMarkdown(args: MoonwellPositionMarkdownArgs): string {
  const { wallet, view, chain, events, generatedAt } = args;
  const swept = args.source === "sweep";
  const live = chain && !chain.chainStale ? chain : null;
  const lines: string[] = [];

  lines.push(`# ${args.deploymentName ?? "Moonwell (Ethereum)"} position`);
  lines.push("");
  lines.push(
    `> Point-in-time snapshot generated ${fmtUtc(generatedAt.getTime() / 1000)}. ` +
      (swept
        ? `Balances are the contracts' own live reads${live ? ` at block ${live.blockNumber}` : ""} ` +
          `(supply = mTokens × exchangeRateStored, debt = borrowBalanceStored), the history swept from the ` +
          `markets' own logs for this snapshot, `
        : `Balances are the replayed mToken events upgraded to the contracts' live reads where taken ` +
          `(supply = exact mTokens × exchangeRateStored, debt = borrowBalanceStored), `) +
      `USD is the Comptroller's own oracle (getUnderlyingPrice), and the account verdict ` +
      `(getAccountLiquidity: liquidity / shortfall) is the Comptroller's own. ` +
      `Everything drifts as the market and position change. Not financial advice.`,
  );
  lines.push("");
  // The notes as the PAGE places them: anchored against this same event list,
  // so a note the timeline drops (its step postdates every event here) is
  // absent from the export too, and the anchor an annotation lands on below is
  // the row the note renders beside on screen.
  const anchoredNotes = anchorMarketNotes(args.notes ?? [], events, "asc");
  const noteList = [...anchoredNotes.values()].flat();
  const allNotes = [...noteList, ...(args.liveNotes ?? [])];

  lines.push(`- **Wallet:** ${wallet}`);
  lines.push(`- **Status:** ${view.status[0].toUpperCase() + view.status.slice(1)}`);
  if (view.liquidationCount > 0) lines.push(`- **Liquidations:** ${view.liquidationCount}`);
  const notesLine = marketNotesLine(allNotes);
  if (notesLine) lines.push(notesLine);
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
            ? "mTokens × exchangeRateStored, incl. accrued interest"
            : "replayed deposit principal, ex-interest";
        const entered = live?.markets.find((m) => m.market === r.market)?.entered;
        lines.push(
          `- **${r.symbol}:** ${tokenWithUsd(view, r.address, amount, r.symbol)} (${basis})` +
            (entered === false ? " — NOT entered as collateral: backs no borrowing, can't be seized" : ""),
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
          : "emitted accountBorrows at the last borrow/repay event; interest since then not included";
        lines.push(`- **${r.symbol}:** ${tokenWithUsd(view, r.address, r.amount, r.symbol)} (${basis})`);
      }
      lines.push("");
    }

    // Live risk lines — the Comptroller's own verdict leads.
    if (live) {
      lines.push(`## Live risk (at block ${live.blockNumber})`);
      lines.push("");
      lines.push(
        `- **Comptroller's own verdict (getAccountLiquidity):** ` +
          (live.shortfallUsd > 0
            ? `shortfall ${usd(live.shortfallUsd)} — the account is liquidatable now`
            : `${usd(live.liquidityUsd)} of liquidity still unborrowed`),
      );
      if (live.healthFactor != null) {
        lines.push(
          `- **Health factor:** ${num(live.healthFactor, 2)} (CF-weighted capacity ÷ debt; the shortfall begins at 1.0 — one collateral factor, so the borrow limit IS the liquidation line)`,
        );
        lines.push(
          `- **Collateral (entered):** ${usd(live.collateralValueUsd)} · **capacity line:** ${usd(live.collateralCapacityUsd)} · **debt:** ${usd(live.debtValueUsd)}`,
        );
      }
      lines.push(
        `- **Liquidation mechanics:** close factor ${num(live.closeFactor * 100, 0)}% (max share of one debt per liquidation), liquidation incentive ${num(Math.max(0, live.liquidationIncentive - 1) * 100, 0)}%`,
      );
      for (const m of live.markets) {
        const rates =
          m.supplyApr != null && m.borrowApr != null
            ? `supply ${num(m.supplyApr * 100, 2)}% APR, borrow ${num(m.borrowApr * 100, 2)}% APR`
            : "rates unavailable";
        lines.push(
          `- **${m.symbol} market:** ${rates}, collateral factor ${num(m.collateralFactor * 100, 0)}%` +
            (m.priceUsd != null ? `, oracle price ${usd(m.priceUsd)}` : ""),
        );
      }
      lines.push("");
    }
  }

  // ── Lifetime ──
  const opened = markdownFirstTimestamp(events, args.history);
  const last = events[events.length - 1]?.timestamp;
  lines.push("## Lifetime");
  if (opened) lines.push(`- **First ${swept ? "swept" : "captured"} activity:** ${fmtUtc(opened)}`);
  if (last) lines.push(`- **Last activity:** ${fmtUtc(last)}`);
  lines.push(`- **Transactions:** ${view.txCount}`);
  lines.push("");

  lines.push(...marketNotesSection(allNotes));
  lines.push(...timelineTable(events, args.history, anchoredNotes));
  return lines.join("\n");
}

/** (a) One line in the account section — the fact that notes exist and where
 *  to read them. Null when this position has none. */
function marketNotesLine(notes: MarketNote[]): string | null {
  if (notes.length === 0) return null;
  if (notes.length === 1) return `- **Market notes:** 1 — ${marketNoteHeadline(notes[0])} (see below)`;
  const markets = [...new Set(notes.map((n) => n.marketSymbol))].join(", ");
  return `- **Market notes:** ${notes.length}, in ${markets} — see below`;
}

/** (b) The notes' own section: one paragraph each, with the two logs the fact
 *  was read from. Placed before the timeline table, like f(x)'s drift table. */
function marketNotesSection(notes: MarketNote[]): string[] {
  if (notes.length === 0) return [];
  const out: string[] = ["## Market notes", ""];
  out.push(
    "Each note is a receipted fact about a market this account was in, observed between two of the account's own " +
      "events and stated between them. A note is not an event: it is counted in no total in this snapshot, and the " +
      "timeline table below reads exactly as it would without any of them. The share rate is not read from a price " +
      "feed — every Mint and Redeem emits the underlying amount and the mTokens it was exchanged for, and the rate " +
      "is their quotient at that block.",
  );
  out.push("");
  for (const n of notes) {
    out.push(marketNoteSentence(n));
    out.push("");
    out.push(marketNoteReceiptLine(n));
    out.push("");
  }
  return out;
}

function timelineTable(
  events: BaseActivityEvent[],
  history: MarkdownHistoryScope | undefined,
  /** (c) The notes anchored to a row here, keyed by that row's event id. They
   *  annotate the last cell and change nothing else: not the row count, not a
   *  figure, not the numbering. */
  anchoredNotes: ReadonlyMap<string, MarketNote[]>,
): string[] {
  const out: string[] = [];
  const { rows, heading, firstIndex } = markdownTimelineSlice(events, history, { suffix: ", all markets" });
  out.push(heading);
  out.push("");
  if (rows.length === 0) {
    out.push("_No transaction history available._");
    return out;
  }
  out.push("| # | Date | Action | Market | Amount | mTokens after | Debt after | Transaction |");
  out.push("|---|------|--------|--------|--------|---------------|------------|-------------|");
  rows.forEach((e, i) => {
    if (!isMoonwellEvent(e)) return;
    const d = e.context.data;
    const label = (d.eventType[0].toUpperCase() + d.eventType.slice(1)).replace(/_/g, " ");
    // Mint/redeem/borrow/repay carry an underlying amount; transfers move only
    // mTokens (no underlying log), so the mToken delta stands in, labeled.
    const amount =
      d.assetsDelta != null
        ? `${amt(Math.abs(parseFloat(d.assetsDelta)))} ${d.marketSymbol}`
        : d.mTokensDelta != null
          ? `${amt(Math.abs(parseFloat(d.mTokensDelta)))} m${d.marketSymbol}`
          : "—";
    const mAfter = d.mTokensAfter != null ? amt(parseFloat(d.mTokensAfter)) : "—";
    const debtAfter = d.debtAfter != null ? amt(parseFloat(d.debtAfter)) : "—";
    const noted = (anchoredNotes.get(e.id) ?? []).map(marketNoteRowAnnotation).join("; ");
    out.push(
      `| ${firstIndex + i} | ${fmtUtc(e.timestamp)} | ${label} | ${d.marketSymbol} | ${amount} | ${mAfter} | ${debtAfter} | ${txCell(e)}${noted ? ` — ${noted}` : ""} |`,
    );
  });
  out.push("");
  out.push(
    "_mTokens after is the exact receipt-token balance (= balanceOf, slot-verified); debt after is the event's own emitted accountBorrows (interest to that moment included)._",
  );
  out.push("");
  return out;
}
