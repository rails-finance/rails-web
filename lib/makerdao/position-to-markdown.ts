// Serialize a MakerDAO vault + activity timeline into a plain-Markdown
// snapshot, suitable for pasting into an LLM ("here's my vault — am I at
// risk?"). Sibling of lib/aave-v3/position-to-markdown.ts: Rails has already
// done the drift-resistant computation (live Vat slots, art × rate DAI debt,
// the OSM collateral price, the ilk parameters), so the markdown carries
// those computed numbers.
//
// Export ≡ card: the risk figures the uplifted card asserts — the
// collateralization ratio, the liquidation price (the Vat's own safety line
// rearranged for price; equivalence machine-verified in
// scripts/verify-makerdao-chain.mjs), the stability fee — ride along when the
// live overlay supplied them, with their derivations named. A PURE function
// of the data already in scope on the detail page — no fetching.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isMakerDAOEvent } from "@/lib/shared/types/event-shape";
import type { MakerVaultView } from "@/components/protocol/makerdao/makerdao-vault-card";
import { num, amt, usd, fmtUtc, txCell } from "@/lib/shared/position-markdown";
import { ilkDebtSymbol } from "@/lib/makerdao/asset-catalog";
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

export interface MakerVaultMarkdownArgs {
  /** What `events` covers, when the page drew a window over a longer history.
   *  Absent means `events` IS the whole history and answers for itself. */
  history?: MarkdownHistoryScope;
  /** The card view the page renders — live Vat slots when the eth_call landed,
   *  else the event replay. */
  view: MakerVaultView;
  /** Chronologically sorted (oldest → newest) event list. */
  events: BaseActivityEvent[];
  /** Market notes for this vault — receipted facts about the ilk's own
   *  stability fee, observed between two of this vault's own touches
   *  (lib/makerdao/market-notes.ts). A note is NEVER an event: it is counted
   *  in no total here, the timeline table's row count and numbering are
   *  identical with and without them, and the CSV never carries one. */
  notes?: MarketNote[];
  /** This vault's live notes (`liveMakerRateStepNote`) — the Jug's own fee
   *  read at the chain head, against this vault's own newest touch. Never
   *  anchored (the later end is past every touch's block) and never in the
   *  timeline table; listed alongside the historical notes in the "Market
   *  notes" section only. */
  liveNotes?: MarketNote[];
  /** When the snapshot was taken (copy time) — passed in so the serializer
   *  stays pure. */
  generatedAt: Date;
}

export function makerVaultToMarkdown(args: MakerVaultMarkdownArgs): string {
  const { view, events, generatedAt } = args;
  const lines: string[] = [];
  const sym = view.collateralSymbol;
  // DAI on CdpManager vaults, USDS on LockStake urns (asset-catalog).
  const dsym = ilkDebtSymbol(view.ilk);

  lines.push(`# MakerDAO vault — ${view.ilk}${view.cdpId ? ` #${view.cdpId}` : ` urn ${view.urn}`}`);
  lines.push("");
  lines.push(
    `> Point-in-time snapshot generated ${fmtUtc(generatedAt.getTime() / 1000)}. ` +
      `Collateral (ink) and normalized debt (art) are ${view.source === "chain" ? "the live Vat slots read on-chain" : "the replayed Vat frob/grab/fork events"}; ` +
      `${dsym} debt is art × the ilk's rate accumulator and the collateral USD is Maker's own OSM price — ` +
      `both one-step chain-derived. The liquidation price is the Vat's own safety line ` +
      `(ink·spot ≥ art·rate) rearranged for price = debt × mat ÷ ink. ` +
      `Everything drifts as the vault and rates change. Not financial advice.`,
  );
  lines.push("");
  // The notes as the PAGE places them: anchored against this same event list,
  // so a note the timeline drops is absent here too, and the annotation below
  // lands on the row the note renders beside on screen.
  const anchoredNotes = anchorMarketNotes(args.notes ?? [], events, "asc");
  const allNotes = [...[...anchoredNotes.values()].flat(), ...(args.liveNotes ?? [])];

  lines.push(`- **Status:** ${view.status[0].toUpperCase() + view.status.slice(1)}`);
  lines.push(`- **Ilk:** ${view.ilk} (collateral ${sym}, debt ${dsym})`);
  const notesLine = marketNotesLine(allNotes);
  if (notesLine) lines.push(notesLine);
  if (view.cdpId) lines.push(`- **Vault (CDP id):** ${view.cdpId}`);
  lines.push(`- **Urn:** ${view.urn}`);
  if (view.owner) lines.push(`- **Owner:** ${view.owner}`);
  if (view.everLiquidated) lines.push(`- **Liquidated (grabbed) at least once over its life.**`);
  lines.push("");

  // ── Headlines (agree with the on-page card number-for-number) ──
  lines.push("## Headlines");
  if (view.status !== "open") {
    // Settled to ~0: the headline is what the vault held at its height.
    if (view.peakInk > 0) lines.push(`- **Highest recorded collateral:** ${amt(view.peakInk)} ${sym}`);
    if (view.peakDebtDai != null && view.peakDebtDai > 0) {
      lines.push(`- **Highest recorded debt:** ${num(view.peakDebtDai, 2)} ${dsym}`);
    }
  } else {
    lines.push(
      `- **Collateral (ink):** ${amt(view.ink)} ${sym}` +
        (view.collateralUsd != null && view.collateralUsd > 0 ? ` (${usd(view.collateralUsd)} at the OSM)` : ""),
    );
    if (view.debtDai != null && view.debtDai > 0) {
      lines.push(`- **Debt:** ${num(view.debtDai, 2)} ${dsym} (normalized art ${amt(view.art)} × the ilk's rate)`);
      const accruedFee = Math.max(0, view.debtDai - view.art);
      if (accruedFee > 0.005) {
        lines.push(
          `- **Accrued stability fee (in the debt figure):** ${num(accruedFee, 2)} ${dsym} (art × rate − art)`,
        );
      }
    } else {
      lines.push(`- **Debt:** none`);
    }
    if (view.stabilityFeeApr != null) {
      lines.push(
        `- **Stability fee:** ${(view.stabilityFeeApr * 100).toFixed(2)}% a year (the ilk's live Jug rate; governance can change it)`,
      );
    }
    if (view.priceUsd != null && view.priceUsd > 0) {
      lines.push(`- **OSM price:** ${usd(view.priceUsd)} / ${sym} (Maker's own oracle security module, 1-hour delay)`);
    }
    if (view.debtDai != null && view.debtDai > 0 && view.collateralUsd != null && view.collateralUsd > 0) {
      const ratio = view.collateralUsd / view.debtDai;
      lines.push(
        `- **Collateralization ratio:** ${(ratio * 100).toFixed(1)}%` +
          (view.matRatio != null
            ? ` (liquidatable below the ilk's ${(view.matRatio * 100).toFixed(0)}% minimum, mat)`
            : ""),
      );
    }
    if (
      view.liquidationPriceUsd != null &&
      view.liquidationPriceUsd > 0 &&
      view.priceUsd != null &&
      view.priceUsd > 0
    ) {
      const dropPct = Math.round((1 - view.liquidationPriceUsd / view.priceUsd) * 100);
      lines.push(
        `- **Liquidation price:** ${usd(view.liquidationPriceUsd)} / ${sym}` +
          (dropPct > 0 ? ` (about a ${dropPct}% fall from the OSM price)` : " (at or above the current OSM price)"),
      );
    }
    if (view.dustDai != null && view.dustDai > 0) {
      lines.push(`- **Minimum vault debt (dust):** ${num(view.dustDai, 0)} ${dsym}`);
    }
    if (view.atBlock) lines.push(`- **Read at block:** ${view.atBlock}`);
  }
  lines.push("");

  // ── Lifetime ──
  const opened = markdownFirstTimestamp(events, args.history);
  const last = events[events.length - 1]?.timestamp;
  lines.push("## Lifetime");
  if (opened) lines.push(`- **First captured activity:** ${fmtUtc(opened)}`);
  if (last) lines.push(`- **Last activity:** ${fmtUtc(last)}`);
  lines.push(`- **Events:** ${view.eventCount}`);
  lines.push(`- **Transactions (own, excludes liquidation seizures):** ${view.txCount}`);
  lines.push("");

  lines.push(...marketNotesSection(allNotes));
  lines.push(...timelineTable(events, sym, args.history, anchoredNotes));
  return lines.join("\n");
}

/** One line stating that notes exist, and where to read them. Null when this
 *  vault has none. */
function marketNotesLine(notes: MarketNote[]): string | null {
  if (notes.length === 0) return null;
  if (notes.length === 1) return `- **Market notes:** 1 — ${marketNoteHeadline(notes[0])} (see below)`;
  return `- **Market notes:** ${notes.length} — stretches where the ilk's stability fee moved between two of this vault's own touches, and the live reading since its last touch (see below)`;
}

/** The notes' own section: one paragraph each, with the drip (and the Jug read
 *  confirming it) the fee was evidenced by. Placed before the timeline table,
 *  as on the Polaris and Liquity V2 exports. */
function marketNotesSection(notes: MarketNote[]): string[] {
  if (notes.length === 0) return [];
  const out: string[] = ["## Market notes", ""];
  out.push(
    "Each note is a receipted fact about the collateral type this vault borrows against, observed between two of " +
      "the vault's own touches and stated between them, or between its last touch and the chain head for a live " +
      "note. A note is not an event: it is counted in no total in this snapshot, and the timeline table below reads " +
      "exactly as it would without any of them. MakerDAO states no stability fee anywhere a row can carry it — " +
      "governance files a duty on the Jug and the spell's own block is not indexed — so the fee in force at a touch " +
      "is the ilk's last rate SET at or before it: the first Jug.drip that compounded at a new duty, derived from " +
      "that drip's own delta on the Vat's rate accumulator and then CONFIRMED by reading the Jug's duty at the " +
      "drip's block. The confirmed figure is the one stated. The interest figures hold the earlier touch's own debt " +
      "fixed and move only the fee, so the later one is what that debt came to cost, not a second reading of the " +
      "vault.",
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
  sym: string,
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
  out.push(`| # | Date | Action | ${sym} Δ | Norm. debt Δ | ${sym} after | Norm. debt after | Transaction |`);
  out.push("|---|------|--------|---------|--------------|--------------|------------------|-------------|");
  rows.forEach((e, i) => {
    if (!isMakerDAOEvent(e)) return;
    const d = e.context.data;
    // The protocol's own verbs: frob = an owner adjustment, grab = a
    // liquidation seizure, fork = an urn→urn position move (no tokens
    // transferred), give = a CDP Manager ownership transfer (zero-delta).
    const label =
      d.eventType === "grab"
        ? "Liquidation (grab)"
        : d.eventType === "fork-out"
          ? "Moved out (fork)"
          : d.eventType === "fork-in"
            ? "Moved in (fork)"
            : d.eventType === "give"
              ? `Ownership transfer (give)${(d.giveDstOwner ?? d.giveDst) ? ` to ${(d.giveDstOwner ?? d.giveDst)!.slice(0, 10)}…` : ""}`
              : d.isOpen
                ? "Open (frob)"
                : "Adjust (frob)";
    const noted = (anchoredNotes.get(e.id) ?? []).map(marketNoteRowAnnotation).join("; ");
    out.push(
      `| ${firstIndex + i} | ${fmtUtc(e.timestamp)} | ${label} | ${amt(parseFloat(d.dink))} | ${amt(parseFloat(d.dart))} | ${amt(parseFloat(d.inkAfter))} | ${amt(parseFloat(d.artAfter))} | ${txCell(e)}${noted ? ` — ${noted}` : ""} |`,
    );
  });
  out.push("");
  out.push(
    "_Debt columns are NORMALIZED art (multiply by the ilk's rate accumulator at that block for the DAI/USDS figure); deltas are signed._",
  );
  out.push("");
  return out;
}
