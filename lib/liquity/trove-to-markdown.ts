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
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isLiquityEvent } from "@/lib/shared/types/event-shape";
import { getLiquidationThreshold } from "@/lib/utils/liquidation-utils";
import {
  anchorMarketNotes,
  marketNoteHeadline,
  marketNoteReceiptLine,
  marketNoteRowAnnotation,
  marketNoteSentence,
  type MarketNote,
} from "@/lib/shared/market-note";
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
  /** Market notes for this trove — receipted facts about the branch's own
   *  oracle price, observed between two of the trove's own events
   *  (lib/shared/market-note.ts). A note is NEVER an event: it is counted in
   *  no total here, the timeline table's row count and numbering are identical
   *  with and without them, and the CSV never carries one. */
  notes?: MarketNote[];
  /** This trove's live note (lib/shared/market-note.ts's `livePriceGapNote`)
   *  — the same branch oracle price read at the chain head, against this
   *  trove's own newest priced event. Never anchored (see `allNotes` below)
   *  and never in the timeline table; listed alongside the historical notes
   *  in the "Market notes" section only. */
  liveNotes?: MarketNote[];
  /** When the snapshot was taken (copy time). Passed in so the serializer
   *  stays pure — `new Date()` is unavailable in some runtimes and makes the
   *  output non-deterministic to test. */
  generatedAt: Date;
}

// ── Local formatters (full precision, no compact notation) ──

function num(n: number, maxDecimals = 2): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: maxDecimals });
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
  const { trove, liveState, prices, debtInFront, trovesAhead, events, generatedAt } = args;
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

  // The notes as the PAGE places them: anchored against this same event list,
  // so a note the timeline drops is absent here too, and the annotation below
  // lands on the row the note renders beside on screen. A LIVE note has no
  // anchor by definition (its later end is the chain head, past every event's
  // block) — `anchorMarketNotes` would silently drop it, so it is appended to
  // the listed set directly rather than routed through the same call, and it
  // never reaches `timelineTable`'s per-row annotations.
  const anchoredNotes = anchorMarketNotes(args.notes ?? [], events, "asc");
  const noteList = [...anchoredNotes.values()].flat();
  const allNotes = [...noteList, ...(args.liveNotes ?? [])];

  // ── Status-specific headline block ──
  const headlines = trove.status === "open" ? openHeadlines(args) : closedOrLiquidatedHeadlines(trove);
  // (a) The headline block ends with its own blank line; the notes line is its
  // last bullet, not a stray line after the section.
  const notesLine = marketNotesLine(allNotes);
  if (notesLine) headlines.splice(headlines.length - 1, 0, notesLine);
  lines.push(...headlines);

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

  // ── Market notes, then the activity timeline ──
  lines.push(...marketNotesSection(allNotes));
  lines.push(...timelineTable(events, ct, anchoredNotes));

  return lines.join("\n");
}

/** (a) One line in the headline block — that notes exist, and where to read
 *  them. Null when this trove has none. */
function marketNotesLine(notes: MarketNote[]): string | null {
  if (notes.length === 0) return null;
  if (notes.length === 1) return `- **Market notes:** 1 — ${marketNoteHeadline(notes[0])} (see below)`;
  return `- **Market notes:** ${notes.length} — stretches where the branch's oracle price moved between two of this trove's own events (see below)`;
}

/** (b) The notes' own section: one paragraph each, with the two events the
 *  fact was read from. Placed before the timeline table, like f(x)'s drift
 *  table and Moonwell's share-rate steps. */
function marketNotesSection(notes: MarketNote[]): string[] {
  if (notes.length === 0) return [];
  const out: string[] = ["## Market notes", ""];
  out.push(
    "Each note is a receipted fact about the branch this trove borrows on, observed between two of the trove's own " +
      "events and stated between them. A note is not an event: it is counted in no total in this snapshot, and the " +
      "timeline table below reads exactly as it would without any of them. The price is not fetched for the note — " +
      "every event on this trove already carries the price Liquity's own PriceFeed stated at that event's block. The " +
      "two ratios hold the debt and collateral the earlier event recorded and move only the price, so the later one " +
      "is what that state came to be worth, not a second reading of the trove.",
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

function timelineTable(
  events: BaseActivityEvent[],
  collateralType: string,
  /** (c) The notes anchored to a row here, keyed by that row's event id. They
   *  annotate the row's last cell and change nothing else: the numbering, the
   *  row count and every figure read as they would with no notes at all. */
  anchoredNotes: ReadonlyMap<string, MarketNote[]>,
): string[] {
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
    if (!isLiquityEvent(e)) return;
    const d = e.context.data;
    const debtAfter = d.stateAfter ? num(d.stateAfter.debt, 2) : "—";
    const collAfter = d.stateAfter ? amt(d.stateAfter.coll) : "—";
    const label = actionLabel(getEventActionKey(e), "liquity-v2-troves");
    const tx = e.etherscanUrl ? `[${e.txHash.slice(0, 10)}…](${e.etherscanUrl})` : e.txHash.slice(0, 10) + "…";
    const noted = (anchoredNotes.get(e.id) ?? []).map(marketNoteRowAnnotation).join("; ");
    out.push(
      `| ${i + 1} | ${fmtUtc(e.timestamp)} | ${label} | ${debtAfter} | ${collAfter} | ${tx}${noted ? ` — ${noted}` : ""} |`,
    );
  });
  out.push("");
  return out;
}
