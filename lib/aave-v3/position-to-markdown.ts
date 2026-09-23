// Serialize an Aave V3 pooled account's current state + activity timeline into
// a plain-Markdown snapshot, suitable for pasting into an LLM ("here's my
// position — am I at risk?"). Mirrors lib/aave-v4/spoke-to-markdown.ts: Rails
// has already done the drift-resistant computation (health factor, liquidation
// read, oracle USD, the attribution-gated interest split), so the markdown
// carries those computed numbers rather than leaving an LLM to guess them.
//
// A PURE function of the data already in scope on the detail page — no
// fetching. The headline numbers reuse the same helpers the on-page card does
// (aaveV3LiquidationRead, computeAaveV3CardCaptions' output), so the export
// agrees with the card number-for-number. Numbers are emitted at full
// precision (no compact "60K" notation) because an LLM reasons better over
// exact values than over rounded display strings.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isAaveV3Event } from "@/lib/shared/types/event-shape";
import type { AaveV3PositionView, AaveV3ReserveAmount } from "@/components/protocol/aave-v3/aave-v3-position-card";
import type { AaveV3PositionChainResponse } from "@/lib/api/fetch-aave-v3-position";
import { num, amt, usd, fmtUtc, txCell } from "@/lib/shared/position-markdown";
import { aaveV3LiquidationRead, type AaveV3CardCaptions } from "./chain-truth-tower";
import { AAVE_V3_SWAP_LABELS } from "./swap-kinds";
import {
  markdownFirstTimestamp,
  markdownTimelineSlice,
  type MarkdownHistoryScope,
} from "@/lib/shared/markdown-history";
import {
  anchorMarketNotes,
  marketNoteHeadline,
  marketNoteReceiptLine,
  marketNoteRowAnnotation,
  marketNoteSentence,
  type MarketNote,
} from "@/lib/shared/market-note";

export interface AaveV3PositionMarkdownArgs {
  /** What `events` covers, when the page drew a window over a longer history.
   *  Absent means `events` IS the whole history and answers for itself. */
  history?: MarkdownHistoryScope;
  wallet: string;
  /** Display name of the market Pool (Core / Prime / EtherFi; "Base" for a
   *  single-Pool deployment). */
  marketName: string;
  /** The protocol the title names — "Aave V3" by default; a fork that answers
   *  the same interface names itself ("Seamless"). */
  protocolName?: string;
  /** Where the figures came from. `index` (default): rails-server's captured
   *  history and scaled-balance reduction. `sweep`: the page's own live reads
   *  of the Pool at a named block, with the history swept from the Pool's
   *  logs for this request — the Base lenders. The preamble says which. */
  source?: "index" | "sweep";
  /** The card view the page renders (oracle prices merged). */
  view: AaveV3PositionView;
  /** The live Pool read (HF / LTV / rates); null while it streams in. */
  chain: AaveV3PositionChainResponse | null;
  /** The card's stat captions (interest / borrow rate); null when ungated. */
  captions: AaveV3CardCaptions | null;
  /** Chronologically sorted (oldest → newest) event list. */
  events: BaseActivityEvent[];
  /** Market notes for this position — receipted facts about ONE reserve's own
   *  rate, on ONE side of it, observed between two of the position's own
   *  touches (lib/aave-v3/market-notes.ts), and the seized asset's price
   *  before each liquidation (lib/aave-v3/liquidation-price-notes.ts). A note
   *  is NEVER an event: it is
   *  counted in no total here, the timeline table's row count and numbering
   *  are identical with and without them, and the CSV never carries one. */
  notes?: MarketNote[];
  /** This position's live notes — each held reserve's own rate read at the
   *  chain head against the newest touch at which the account held that side.
   *  Never anchored (the later end is past every row's block) and never in the
   *  timeline table; listed alongside the historical notes in the "Market
   *  notes" section only. */
  liveNotes?: MarketNote[];
  /** When the snapshot was taken (copy time) — passed in so the serializer
   *  stays pure. */
  generatedAt: Date;
}

/** Oracle USD for one side, with the card's strict per-total guard: null the
 *  moment any contributing reserve is unpriced (a partial total is never
 *  asserted). */
function sideUsd(view: AaveV3PositionView, reserves: AaveV3ReserveAmount[]): number | null {
  let sum = 0;
  let any = false;
  for (const r of reserves) {
    if (r.amount <= 0) continue;
    const p = view.priceByAddress?.[r.address.toLowerCase()];
    if (typeof p !== "number" || p <= 0) return null;
    sum += r.amount * p;
    any = true;
  }
  return any ? sum : null;
}

function sideLines(view: AaveV3PositionView, reserves: AaveV3ReserveAmount[], label: string): string[] {
  const out: string[] = [];
  const total = sideUsd(view, reserves);
  const live = reserves.filter((r) => r.amount > 0);
  if (live.length === 0) {
    out.push(`- **${label}:** none`);
    return out;
  }
  out.push(`- **${label}:** ${total != null ? usd(total) + " (on-chain oracle)" : "see per-reserve amounts"}`);
  for (const r of live) {
    const p = view.priceByAddress?.[r.address.toLowerCase()];
    const priced = typeof p === "number" && p > 0 ? ` (${usd(r.amount * p)})` : "";
    out.push(`  - ${r.symbol}: ${amt(r.amount)}${priced}`);
  }
  return out;
}

export function aaveV3PositionToMarkdown(args: AaveV3PositionMarkdownArgs): string {
  const { wallet, marketName, view, chain, captions, events, generatedAt } = args;
  const swept = args.source === "sweep";
  const protocolName = args.protocolName ?? "Aave V3";
  const lines: string[] = [];

  // "unread" (no state recorded, 0018) is not terminal: nothing is known.
  const terminal = view.status === "closed" || view.status === "liquidated";
  lines.push(`# ${protocolName} position — ${marketName} market`);
  lines.push("");
  lines.push(
    terminal
      ? `> Snapshot generated ${fmtUtc(generatedAt.getTime() / 1000)}. ` +
          `The account is ${view.status} — no open balances remain. Balances below are each reserve's ` +
          (swept
            ? `HIGHEST recorded principal (the largest running balance replayed from the wallet's own Pool events, ` +
              `swept live from the Pool's logs from its first block; interest accrued between events is not included). `
            : `HIGHEST recorded balance (largest running scaled claim over every captured flow, aToken transfers ` +
              `included, valued at the index of the moment it stood — interest to then included). `) +
          `Not financial advice.`
      : `> Point-in-time snapshot generated ${fmtUtc(generatedAt.getTime() / 1000)}. ` +
          (swept
            ? `Balances are read live from each reserve's own aToken / variable-debt token (balanceOf${chain ? ` at block ${chain.blockNumber}` : ""}), `
            : `Balances are the indexed scaled-balance reduction (equal to the aToken / variable-debt balanceOf), `) +
          `USD is the Pool's own on-chain oracle, and the health factor is the Pool's own getUserAccountData. ` +
          `Everything drifts as the market and position change. Not financial advice.`,
  );
  lines.push("");
  lines.push(
    `- **Status:** ${view.status === "unread" ? "Unread (no state recorded yet)" : view.status[0].toUpperCase() + view.status.slice(1)}`,
  );
  lines.push(`- **Wallet:** ${wallet}`);
  lines.push(`- **Market:** ${marketName} (one cross-collateralised account per wallet × market)`);
  if (view.liquidationCount > 0) lines.push(`- **Liquidations:** ${view.liquidationCount}`);
  // The notes as the PAGE places them: anchored against this same event list,
  // so a note the timeline drops is absent here too, and the annotation below
  // lands on the row the note renders beside on screen.
  const anchoredNotes = anchorMarketNotes(args.notes ?? [], events, "asc");
  const allNotes = [...[...anchoredNotes.values()].flat(), ...(args.liveNotes ?? [])];
  const notesLine = marketNotesLine(allNotes);
  if (notesLine) lines.push(notesLine);
  lines.push("");

  // ── Terminal account: the export mirrors the on-page terminal card — the
  // per-reserve PEAKS and the closure attribution, never the replay lane's
  // residual `supplies`/`borrows` (which the page does not render either) and
  // none of the live-read sections (HF / liquidation read / rates / LTV say
  // nothing about an exited account). ──
  if (terminal) {
    const aaveEvts = events.filter(isAaveV3Event);
    const lastType = aaveEvts.length > 0 ? aaveEvts[aaveEvts.length - 1].context.data.eventType : null;
    lines.push("## Outcome");
    if (view.status === "liquidated") {
      lines.push(
        lastType === "liquidation"
          ? `- **Liquidated** — the record ends with the seizure; the final liquidation call emptied the account.`
          : `- **Liquidated** — liquidation seizures are in the record, but the account exited by its own transactions afterwards.`,
      );
    } else {
      lines.push(`- **Closed** — the account exited by its own transactions; no liquidation is in the record.`);
    }
    lines.push("");
    lines.push("## Highest recorded balances (per reserve)");
    const peakLines = (label: string, reserves: AaveV3ReserveAmount[]) => {
      if (reserves.length === 0) {
        lines.push(`- **${label}:** none recorded`);
        return;
      }
      lines.push(`- **${label}:**`);
      for (const r of reserves) lines.push(`  - ${r.symbol}: ${amt(r.amount)}`);
    };
    peakLines("Supplied (peak)", view.peakSupplies);
    peakLines("Borrowed (peak)", view.peakBorrows);
    lines.push("");
    const openedT = markdownFirstTimestamp(events, args.history);
    const lastT = events[events.length - 1]?.timestamp;
    lines.push("## Lifetime");
    if (openedT) lines.push(`- **First ${swept ? "swept" : "captured"} activity:** ${fmtUtc(openedT)}`);
    if (lastT) lines.push(`- **Record closed:** ${fmtUtc(lastT)}`);
    lines.push(`- **Transactions (own, excludes liquidations):** ${view.txCount}`);
    lines.push("");
    lines.push(...marketNotesSection(allNotes));
    lines.push(...timelineTable(events, args.history, anchoredNotes));
    return lines.join("\n");
  }

  // ── Headlines (agree with the on-page card number-for-number) ──
  lines.push("## Headlines");
  const hf = chain?.healthFactor ?? view.healthFactor;
  if (hf != null) {
    lines.push(`- **Health factor:** ${hf >= 100 ? "effectively ∞" : num(hf, 2)} (Aave liquidates at 1.0)`);
  }
  const read = aaveV3LiquidationRead(view);
  if (read.single) {
    lines.push(
      `- **Liquidation price:** ${usd(read.single.liqPrice)} / ${read.single.symbol} ` +
        `(current oracle price ${usd(read.single.price)}${read.dropPct != null ? ` — a ${num(read.dropPct, 1)}% drop reaches liquidation` : ""})`,
    );
  } else if (read.dropPct != null) {
    lines.push(
      `- **Liquidation buffer:** collateral can fall ${num(read.dropPct, 1)}% before the health factor reaches 1.0`,
    );
  }
  lines.push(...sideLines(view, view.supplies, "Collateral"));
  if (captions?.supplyInterestUsd != null && captions.supplyInterestUsd >= 0.01) {
    lines.push(`  - incl. ${usd(captions.supplyInterestUsd)} accrued supply interest`);
  }
  lines.push(...sideLines(view, view.borrows, "Debt"));
  if (captions?.debtInterestUsd != null && captions.debtInterestUsd >= 0.01) {
    lines.push(`  - incl. ${usd(captions.debtInterestUsd)} accrued borrow interest`);
  }
  if (captions?.borrowRate) {
    lines.push(
      `- **Borrow rate:** ${num(captions.borrowRate.pct, 2)}% APR${captions.borrowRate.avg ? " (debt-USD-weighted average across the borrowed reserves)" : ""}`,
    );
  }
  if (chain && !chain.chainStale) {
    lines.push(
      `- **Loan-to-value:** ${num(chain.ltv * 100, 1)}% of a ${num(chain.avgLiquidationThreshold * 100, 1)}% liquidation threshold`,
    );
    if (chain.availableBorrowsUsd > 0) {
      lines.push(`- **Available to borrow:** ${usd(chain.availableBorrowsUsd)} more before the LTV cap`);
    }
  }
  lines.push("");

  // ── Reserve rates (live Pool read) ──
  if (chain && !chain.chainStale && chain.reserves.some((r) => r.supplyApr != null || r.borrowApr != null)) {
    lines.push(`## Reserve rates (at block ${chain.blockNumber})`);
    lines.push("");
    lines.push("| Asset | Supply APR | Variable borrow APR | Utilization | Reserve factor |");
    lines.push("|-------|------------|---------------------|-------------|----------------|");
    for (const r of chain.reserves) {
      const pct = (v?: number) => (v != null ? num(v * 100, 2) + "%" : "—");
      lines.push(
        `| ${r.symbol} | ${pct(r.supplyApr)} | ${pct(r.borrowApr)} | ${pct(r.utilization)} | ${pct(r.reserveFactor)} |`,
      );
    }
    lines.push("");
  }

  // ── Lifetime ──
  const opened = markdownFirstTimestamp(events, args.history);
  const last = events[events.length - 1]?.timestamp;
  lines.push("## Lifetime");
  if (opened) lines.push(`- **First ${swept ? "swept" : "captured"} activity:** ${fmtUtc(opened)}`);
  if (last) lines.push(`- **Last activity:** ${fmtUtc(last)}`);
  lines.push(`- **Transactions (own, excludes liquidations):** ${view.txCount}`);
  lines.push("");

  lines.push(...marketNotesSection(allNotes));
  lines.push(...timelineTable(events, args.history, anchoredNotes));
  return lines.join("\n");
}

function timelineTable(
  events: BaseActivityEvent[],
  history: MarkdownHistoryScope | undefined,
  /** The notes anchored to a row here, keyed by that row's event id — they
   *  annotate the row's last cell and change nothing else: the numbering, the
   *  row count and every figure read as they would with no notes at all. */
  anchoredNotes: ReadonlyMap<string, MarketNote[]>,
): string[] {
  const out: string[] = [];
  const { rows, heading, firstIndex } = markdownTimelineSlice(events, history);
  out.push(heading);
  out.push("");
  if (rows.length === 0) {
    out.push("_No transaction history available._");
    return out;
  }
  // No balance columns: the rows carry a replayed principal that leaves out
  // interest, and the exact balance at an event is read only when its card opens
  // (rails-ops TO-DO-ui-jobs §19).
  out.push("| # | Date | Action | Asset | Amount | Transaction |");
  out.push("|---|------|--------|-------|--------|-------------|");
  rows.forEach((e, i) => {
    if (!isAaveV3Event(e)) return;
    const d = e.context.data;
    const label =
      d.eventType === "transfer_in"
        ? "Transfer in"
        : d.eventType === "transfer_out"
          ? "Transfer out"
          : d.eventType === "bad_debt_written_off"
            ? "Debt written off"
            : d.swap
              ? AAVE_V3_SWAP_LABELS[d.swap.kind]
              : d.eventType[0].toUpperCase() + d.eventType.slice(1);
    const isLiq = d.eventType === "liquidation";
    // A swap row names both reserves, given → received.
    const asset = d.swap
      ? `${d.reserveSymbol ?? "—"} → ${d.swap.receivedSymbol ?? "—"}`
      : ((isLiq ? d.collateralSymbol : d.reserveSymbol) ?? d.reserveSymbol ?? "—");
    const rawAmount = isLiq ? d.debtToCover : d.amount;
    const amount = d.swap
      ? `${rawAmount != null ? amt(parseFloat(rawAmount)) : "—"} → ${d.swap.receivedAmount != null ? amt(parseFloat(d.swap.receivedAmount)) : "—"}`
      : rawAmount != null
        ? amt(parseFloat(rawAmount))
        : "—";
    const noted = (anchoredNotes.get(e.id) ?? []).map(marketNoteRowAnnotation).join("; ");
    out.push(
      `| ${firstIndex + i} | ${fmtUtc(e.timestamp)} | ${label} | ${asset} | ${amount} | ${txCell(e)}${noted ? ` — ${noted}` : ""} |`,
    );
  });
  out.push("");
  return out;
}

/** One line stating that notes exist, and where to read them. Null when this
 *  position has none. */
function marketNotesLine(notes: MarketNote[]): string | null {
  if (notes.length === 0) return null;
  if (notes.length === 1) return `- **Market notes:** 1 — ${marketNoteHeadline(notes[0])} (see below)`;
  return (
    `- **Market notes:** ${notes.length} — stretches where one reserve's own supply or borrow rate moved between ` +
    `two of this position's own touches, and the live readings since its newest one (see below)`
  );
}

/** The notes' own section: one paragraph each, with the two observations the
 *  fact was read from. Placed before the timeline table, like Liquity V2's and
 *  Polaris's. */
function marketNotesSection(notes: MarketNote[]): string[] {
  if (notes.length === 0) return [];
  const out: string[] = ["## Market notes", ""];
  out.push(
    "Each note is a receipted fact about ONE reserve this position holds, on ONE side of it, observed between two " +
      "of the position's own touches and stated between them — or between its newest touch and the chain head for " +
      "a live note. A V3-family account is one cross-collateralised account holding several reserves at once, and " +
      "each reserve carries a supply rate the account earns and a variable borrow rate it pays, so a note is per " +
      "reserve and per side rather than per position. A note is not an event: it is counted in no total in this " +
      "snapshot, and the timeline table below reads exactly as it would without any of them. The rate is on " +
      "neither of the position's rows — it is the reserve's own ReserveDataUpdated, and the two ends are found by " +
      "two different rules: the earlier is the last one at or before the position's own action, which the Pool " +
      "emits inside that transaction, so it is the rate that action left in force; the later is the last one " +
      "before the position's next touch and NOT inside that touch's own transaction, so a move the position " +
      "itself caused there is never stated as the market's. A live note's later end is the Pool's getReserveData " +
      "read at the head. The interest figures hold the earlier touch's own balance fixed and move only the rate, " +
      "so they are what that balance came to be worth at each rate, not a second reading of the position.",
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
