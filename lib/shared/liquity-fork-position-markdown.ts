// Serialize an Ebisu / Asymmetry Trove + activity timeline into a
// plain-Markdown snapshot, suitable for pasting into an LLM ("here's my
// position — am I at risk?"). Sibling of lib/compound/position-to-markdown.ts,
// shared by both forks (the contract family is the same V2 architecture):
// Rails has already done the drift-resistant computation (the TroveManager's
// own getCurrentICR, the branch PriceFeed's price, the live entire debt/coll
// that redemptions shrink between events), so the markdown carries those
// computed numbers rather than leaving an LLM to guess. A PURE function of
// the data already in scope on the detail page — no fetching.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { LiquityForkTroveChainResponse } from "@/lib/api/fetch-liquity-fork-position";
import { num, amt, usd, fmtUtc, txCell } from "@/lib/shared/position-markdown";
import {
  markdownFirstTimestamp,
  markdownTimelineSlice,
  markdownTotalEvents,
  type MarkdownHistoryScope,
} from "@/lib/shared/markdown-history";

/** The card view both forks share (EbisuTroveView / AsymmetryTroveView are
 *  structural twins — this is the subset the serializer reads). */
export interface LiquityForkTroveViewLike {
  id: string;
  status: "open" | "closed" | "liquidated";
  collateralType: string;
  collateral: number;
  debt: number;
  /** Highest recorded balances over the life (display units) — the terminal
   *  snapshot's headline (a closed Trove reads 0/0). */
  peakCollateral: number;
  peakDebt: number;
  interestRate: number;
  isBatched: boolean;
  lastActivityAt: number;
}

/** The fork event context subset the timeline table reads (EbisuContext /
 *  AsymmetryContext are structural twins). */
interface LiquityForkEventContextLike {
  eventType: string;
  collateralSymbol: string;
  collDelta: string;
  debtDelta: string;
  collAfter: string;
  debtAfter: string;
  collBefore: string;
  debtBefore: string;
  interestRate?: string;
}

export interface LiquityForkTroveMarkdownArgs {
  /** What `events` covers, when the page drew a window over a longer history.
   *  Absent means `events` IS the whole history and answers for itself. */
  history?: MarkdownHistoryScope;
  /** Display name ("Ebisu" | "Asymmetry"). */
  protocolLabel: string;
  /** The fork's stablecoin ("ebUSD" | "USDaf"). */
  debtSymbol: string;
  view: LiquityForkTroveViewLike;
  /** The live chain read; null (or stale) simply omits the live risk lines. */
  chain: LiquityForkTroveChainResponse | null;
  /** Chronologically sorted (oldest → newest) fork event list. */
  events: (BaseActivityEvent & { context: { data: LiquityForkEventContextLike } })[];
  /** When the snapshot was taken (copy time) — passed in so the serializer
   *  stays pure. */
  generatedAt: Date;
}

const pct = (f: number, d = 1) => `${num(f * 100, d)}%`;

export function liquityForkTroveToMarkdown(args: LiquityForkTroveMarkdownArgs): string {
  const { protocolLabel, debtSymbol, view, chain, events, generatedAt } = args;
  const live = chain && !chain.chainStale ? chain : null;
  const coll = view.collateralType;
  const lines: string[] = [];

  lines.push(`# ${protocolLabel} Trove (${coll} branch)`);
  lines.push("");
  lines.push(
    `> Point-in-time snapshot generated ${fmtUtc(generatedAt.getTime() / 1000)}. ` +
      `Balances are the replayed TroveUpdated events upgraded to the branch contracts' live reads where taken ` +
      `(getLatestTroveData: entire debt/coll incl. accrued interest and pending redistribution — redemptions can ` +
      `shrink these between events), USD is the branch's own PriceFeed (the price it liquidates and redeems with), ` +
      `the collateral ratio is the TroveManager's own getCurrentICR, and ${debtSymbol} debt is stated at its $1 ` +
      `redemption face (the protocol's own mechanism). Everything drifts as the market and position change. ` +
      `Not financial advice.`,
  );
  lines.push("");
  lines.push(`- **Trove:** ${view.id} (${coll} branch)`);
  lines.push(`- **Status:** ${view.status[0].toUpperCase() + view.status.slice(1)}`);
  if (view.isBatched) lines.push(`- **Interest batch:** managed by a batch manager (debt derived from batch shares)`);
  lines.push("");

  if (view.status !== "open") {
    // Terminal: the life ended at 0/0, so the snapshot states the OUTCOME
    // (the ending mechanism is exact on these forks: closed = the owner's
    // closeTrove, liquidated = the seizure — redemption cannot close a
    // V2-family Trove) and the life's highest recorded balances.
    const lastLiq = events.find((e) => e.context.data.eventType === "liquidate");
    lines.push(`## Outcome`);
    lines.push("");
    if (view.status === "liquidated") {
      lines.push(
        lastLiq
          ? `- This Trove life ended in liquidation: the final liquidate event seized its last ${amt(Number(lastLiq.context.data.collBefore) || 0)} ${coll} of collateral and cleared the ${amt(Number(lastLiq.context.data.debtBefore) || 0)} ${debtSymbol} it still owed.`
          : `- This Trove life ended in liquidation — the branch seized its remaining collateral and cleared its remaining debt in one whole-Trove seizure.`,
      );
    } else {
      lines.push(
        `- This Trove life was closed by its owner: the ${debtSymbol} debt repaid, the ${coll} collateral withdrawn, and the Trove's NFT burned at close.`,
      );
    }
    lines.push(`- No balances remain on this Trove.`);
    lines.push("");
    lines.push(`## Highest recorded balances`);
    lines.push("");
    lines.push(`- **Peak collateral:** ${amt(view.peakCollateral)} ${coll}`);
    lines.push(`- **Peak debt:** ${amt(view.peakDebt)} ${debtSymbol}`);
    lines.push(`- Each peak is its own lifetime maximum — the two can come from different moments.`);
    lines.push("");
  } else {
    lines.push(`## Position`);
    lines.push("");
    if (live) {
      const collUsd = live.priceUsd != null ? ` (${usd(live.entireColl * live.priceUsd)})` : "";
      lines.push(
        `- **Collateral:** ${amt(live.entireColl)} ${coll}${collUsd} (live entire collateral, pending redistribution included)`,
      );
      lines.push(
        `- **Debt:** ${amt(live.entireDebt)} ${debtSymbol} (${usd(live.entireDebt)} at the $1 redemption face; live entire debt)`,
      );
      if (live.accruedInterest > 0.01)
        lines.push(
          `  - of which **${amt(live.accruedInterest)} ${debtSymbol}** is interest accrued at ${view.isBatched ? "its batch's" : "the trove's"} ${num(live.annualInterestRatePct, 2)}% annual rate`,
        );
      if (live.redistDebtGain > 0.01 || live.redistCollGain > 0)
        lines.push(
          `  - includes redistribution from liquidated neighbours: ${amt(live.redistCollGain)} ${coll} / ${amt(live.redistDebtGain)} ${debtSymbol}, pending until the next touch`,
        );
      // A batch member accrues at the manager's rate and cannot adjust it
      // per-trove (the entrypoint reverts on batch members) — "user-set,
      // adjustable any time" is only true of an unbatched trove.
      lines.push(
        `- **Interest rate:** ${num(live.annualInterestRatePct, 2)}% annual ${
          view.isBatched
            ? "(the batch's current rate — set by its interest-batch manager for every member)"
            : "(user-set, adjustable any time)"
        }`,
      );
      lines.push("");
      lines.push(`## Live risk (at block ${live.blockNumber})`);
      lines.push("");
      if (live.priceUsd != null)
        lines.push(
          `- **${coll} price:** ${usd(live.priceUsd)} — the branch's own PriceFeed${live.priceStale ? " (lastGoodPrice — the live fetch failed on this read; it lags between user operations)" : " (fetchPrice simulated at head)"}`,
        );
      if (live.icr != null)
        lines.push(
          `- **Collateral ratio:** ${pct(live.icr)} (the TroveManager's own getCurrentICR) vs the branch minimum ${pct(live.mcr, 0)} (MCR)`,
        );
      if (live.liqPriceUsd != null)
        lines.push(
          `- **Liquidation price:** ${usd(live.liqPriceUsd)} per ${coll} (entire debt × MCR ÷ entire collateral)` +
            (live.priceUsd != null && live.priceUsd > live.liqPriceUsd
              ? ` — ${num((1 - live.liqPriceUsd / live.priceUsd) * 100, 0)}% below the current price`
              : ""),
        );
      if (live.status === "zombie") {
        lines.push(
          `- **Redemption queue:** ZOMBIE — a partial redemption left the trove below the minimum debt; it sits outside the rate-ordered queue and is redeemed FIRST when redemptions next route through this branch`,
        );
      } else if (live.debtInFront != null) {
        lines.push(
          `- **Redemption queue (this branch):** ${amt(live.debtInFront)} ${debtSymbol} of debt sits at lower interest rates (${live.trovesAhead ?? 0} trove${(live.trovesAhead ?? 0) === 1 ? "" : "s"}) — redeemed before this one; redemptions sweep the lowest user-set rates first at $1 face`,
        );
      }
      if (live.branchTcr != null)
        lines.push(
          `- **Branch:** ${pct(live.branchTcr, 0)} collateralised overall (${amt(live.branchDebt ?? 0)} ${debtSymbol} total debt); new borrowing gates below ${pct(live.ccr, 0)} (CCR), shutdown possible below ${pct(live.scr, 0)} (SCR)`,
        );
      else if (live.branchDebt != null && live.branchDebt < 1)
        lines.push(
          `- **Branch:** carries no ${debtSymbol} debt at present, so it has no branch-level collateral ratio to state`,
        );
      lines.push("");
    } else {
      // Index-only fallback: the replayed figures, basis stated.
      lines.push(
        `- **Collateral:** ${amt(view.collateral)} ${coll} (replayed from the last TroveUpdated event; the live read didn't land)`,
      );
      lines.push(`- **Debt:** ${amt(view.debt)} ${debtSymbol} (as last emitted; interest since then not included)`);
      lines.push(
        `- **Interest rate:** ${num(view.interestRate, 2)}% annual ${
          view.isBatched
            ? "(its batch's rate as of the trove's own last event — the interest-batch manager can have moved the batch since)"
            : "(user-set)"
        }`,
      );
      lines.push("");
    }
  }

  // ── Lifetime ──
  const opened = markdownFirstTimestamp(events, args.history);
  const last = events[events.length - 1]?.timestamp;
  lines.push("## Lifetime");
  if (opened) lines.push(`- **First captured activity:** ${fmtUtc(opened)}`);
  if (last) lines.push(`- **Last activity:** ${fmtUtc(last)}`);
  const eventTotal = markdownTotalEvents(events, args.history);
  if (eventTotal != null) lines.push(`- **Events:** ${eventTotal.toLocaleString("en-US")}`);
  lines.push("");

  lines.push(...timelineTable(events, debtSymbol, args.history));
  return lines.join("\n");
}

function timelineTable(
  events: (BaseActivityEvent & { context: { data: LiquityForkEventContextLike } })[],
  debtSymbol: string,
  history: MarkdownHistoryScope | undefined,
): string[] {
  const out: string[] = [];
  const { rows, heading, firstIndex } = markdownTimelineSlice(events, history);
  out.push(heading);
  out.push("");
  if (rows.length === 0) {
    out.push("_No transaction history available._");
    return out;
  }
  out.push(`| # | Date | Action | Collateral Δ | ${debtSymbol} Δ | Debt after | Transaction |`);
  out.push("|---|------|--------|--------------|-----------------|------------|-------------|");
  rows.forEach((e, i) => {
    const d = e.context.data;
    // The fork verbs, prettified: adjustTroveInterestRate → "Adjust trove interest rate".
    const label = (d.eventType[0].toUpperCase() + d.eventType.slice(1)).replace(/([A-Z])/g, " $1").trim();
    const sign = (v: string) => {
      const n = Number(v) || 0;
      return n === 0 ? "—" : `${n > 0 ? "+" : "−"}${amt(Math.abs(n))}`;
    };
    out.push(
      `| ${firstIndex + i} | ${fmtUtc(e.timestamp)} | ${label} | ${sign(d.collDelta)} ${d.collateralSymbol} | ${sign(d.debtDelta)} | ${amt(Number(d.debtAfter) || 0)} | ${txCell(e)} |`,
    );
  });
  out.push("");
  out.push(
    "_Deltas are chain-derived (after − before from the emitted absolutes); debt after is the TroveUpdated figure (batched troves: derived from batch shares). Interest accrued between events is real and lands in the next event's figures._",
  );
  out.push("");
  return out;
}
