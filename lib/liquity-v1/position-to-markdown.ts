// Serialize a Liquity V1 Trove + activity timeline into a plain-Markdown
// snapshot, suitable for pasting into an LLM ("here's my Trove — am I at
// risk?"). Sibling of lib/aave-v3/position-to-markdown.ts: Rails has already
// done the drift-resistant computation (the protocol's own getEntireDebtAndColl
// / getCurrentICR / PriceFeed reads, the sorted-list redemption queue), so the
// markdown carries those computed numbers rather than leaving an LLM to guess.
//
// A PURE function of the data already in scope on the detail page — no
// fetching. The liquidation price mirrors the on-page runway exactly:
// debt × MCR ÷ coll, every input a chain read at the same block.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isLiquityV1Event, type LiquityV1EventType } from "@/lib/shared/types/event-shape";
import type { LiquityV1PositionView } from "@/components/protocol/liquity-v1/liquity-v1-position-card";
import type { LiquityV1PositionChainResponse } from "@/lib/api/fetch-liquity-v1-position";
import { num, amt, usd, fmtUtc, txCell } from "@/lib/shared/position-markdown";
import {
  markdownFirstTimestamp,
  markdownTimelineSlice,
  type MarkdownHistoryScope,
} from "@/lib/shared/markdown-history";

export interface LiquityV1PositionMarkdownArgs {
  /** What `events` covers, when the page drew a window over a longer history.
   *  Absent means `events` IS the whole history and answers for itself. */
  history?: MarkdownHistoryScope;
  wallet: string;
  /** The card view for the shown Trove life (a reopened Trove has one per epoch). */
  view: LiquityV1PositionView;
  /** The live contract read; pass null for a closed prior life (it describes
   *  the CURRENT Trove only). */
  chain: LiquityV1PositionChainResponse | null;
  /** Chronologically sorted (oldest → newest) events of the shown life. */
  events: BaseActivityEvent[];
  /** When the snapshot was taken (copy time) — passed in so the serializer
   *  stays pure. */
  generatedAt: Date;
}

const ACTION_LABEL: Record<LiquityV1EventType, string> = {
  openTrove: "Open Trove",
  adjustTrove: "Adjust Trove",
  closeTrove: "Close Trove",
  liquidation: "Liquidation",
  redemption: "Redemption",
};

export function liquityV1PositionToMarkdown(args: LiquityV1PositionMarkdownArgs): string {
  const { wallet, view, chain, events, generatedAt } = args;
  const lines: string[] = [];
  const live = chain && !chain.chainStale && chain.troveStatus === "active" ? chain : null;
  const terminal = view.status !== "open";

  lines.push(`# Liquity V1 Trove`);
  lines.push("");
  lines.push(
    terminal
      ? `> Snapshot generated ${fmtUtc(generatedAt.getTime() / 1000)}. ` +
          `This Trove life is ${view.status} — no balances remain. The figures below are the life's HIGHEST ` +
          `recorded balances (each the largest of the absolute values TroveUpdated emitted for it — its own ` +
          `lifetime maximum) and its replayed event record. Liquity V1 charges no ongoing interest, so every ` +
          `recorded debt figure was an exact obligation. Not financial advice.`
      : `> Point-in-time snapshot generated ${fmtUtc(generatedAt.getTime() / 1000)}. ` +
          `Trove state is emitted ABSOLUTE by the protocol (TroveUpdated debt/coll); the risk figures are the ` +
          `protocol's own contract reads — getEntireDebtAndColl (pending redistribution rewards included), ` +
          `getCurrentICR, the PriceFeed ETH:USD, and a sweep of the sorted redemption list. Liquity V1 charges ` +
          `no ongoing interest (a one-time borrowing fee only), so debt moves only when the owner or the ` +
          `protocol acts. Everything drifts as the price moves. Not financial advice.`,
  );
  lines.push("");
  lines.push(`- **Status:** ${view.status[0].toUpperCase() + view.status.slice(1)}`);
  lines.push(`- **Wallet:** ${wallet} (one ETH-collateralised Trove per address)`);
  // Epochs are 1-based (mig 075: a running count of openTrove events), so
  // epoch 1 is a wallet's FIRST life — only a later epoch witnesses a reopen.
  if (view.epoch != null && view.epoch > 1) {
    lines.push(
      `- **Trove life (epoch):** ${view.epoch} — this life began after an earlier Trove on this address closed`,
    );
  }
  if (view.liquidationCount > 0) lines.push(`- **Liquidations:** ${view.liquidationCount}`);
  if (view.redemptionCount > 0) lines.push(`- **Redemptions against it:** ${view.redemptionCount}`);
  lines.push("");

  // ── Terminal life: outcome + peaks, mirroring the on-page terminal card —
  // no live sections (ratio / runway / queue / fees describe an active Trove).
  // The life's final event witnesses which of V1's three closure mechanisms
  // ended it: owner close, full redemption, or liquidation. ──
  if (terminal) {
    const v1 = events.filter(isLiquityV1Event);
    const lastType = v1.length > 0 ? v1[v1.length - 1].context.data.eventType : null;
    lines.push("## Outcome");
    if (view.status === "liquidated") {
      lines.push(
        `- **Liquidated** — the collateral ratio fell below the protocol's liquidation threshold; the ETH ` +
          `collateral was seized and the LUSD debt cancelled, absorbed by the Stability Pool or redistributed ` +
          `to other Troves.`,
      );
    } else if (lastType === "redemption") {
      lines.push(
        `- **Fully redeemed** — a redemption cancelled the last of the LUSD debt at $1 face value, taking ETH ` +
          `collateral of equal value; the collateral that remained moved to the CollSurplusPool, claimable by ` +
          `the owner.`,
      );
    } else {
      lines.push(`- **Closed by its owner** — the LUSD debt repaid and the ETH collateral withdrawn.`);
    }
    lines.push("");
    lines.push("## Highest recorded balances");
    if (view.peakCollateral > 0) lines.push(`- **Collateral (peak):** ${amt(view.peakCollateral)} ETH`);
    if (view.peakDebt > 0) lines.push(`- **Debt (peak):** ${num(view.peakDebt, 2)} LUSD`);
    lines.push(`- Each peak is its own lifetime maximum — the two can come from different moments of the life.`);
    lines.push("");
    const openedT = markdownFirstTimestamp(events, args.history);
    const lastT = events[events.length - 1]?.timestamp;
    lines.push("## Lifetime");
    if (openedT) lines.push(`- **Opened:** ${fmtUtc(openedT)}`);
    if (lastT) lines.push(`- **Record closed:** ${fmtUtc(lastT)}`);
    lines.push(`- **Transactions (own, excludes liquidations and redemptions):** ${view.txCount}`);
    lines.push("");
    lines.push(...timelineTable(events, args.history));
    return lines.join("\n");
  }

  // ── Headlines (agree with the on-page card and runway number-for-number) ──
  lines.push("## Headlines");
  if (live) {
    lines.push(
      `- **Collateral:** ${amt(live.coll)} ETH (${usd(live.coll * live.price)} at the protocol's own PriceFeed)` +
        (live.pendingEthReward > 0 ? ` — incl. ${amt(live.pendingEthReward)} ETH pending redistribution` : ""),
    );
    lines.push(
      `- **Debt:** ${num(live.debt, 2)} LUSD` +
        (live.pendingLusdReward > 0 ? ` — incl. ${num(live.pendingLusdReward, 2)} LUSD pending redistribution` : ""),
    );
    if (live.icr != null) {
      lines.push(
        `- **Collateral ratio (ICR):** ${num(live.icr * 100, 1)}% — the protocol liquidates below ${num(live.mcr * 100, 0)}% ` +
          `(${num(live.ccr * 100, 0)}% in Recovery Mode)`,
      );
    }
    if (live.debt > 0 && live.coll > 0) {
      const liqPrice = (live.debt * live.mcr) / live.coll;
      lines.push(
        `- **Liquidation price:** ${usd(liqPrice)} / ETH (current PriceFeed ${usd(live.price)} — ` +
          `a ${num(((live.price - liqPrice) / live.price) * 100, 1)}% drop reaches the ${num(live.mcr * 100, 0)}% minimum)`,
      );
    }
    lines.push(
      `- **System (at block ${live.blockNumber}):** TCR ${num(live.tcr * 100, 1)}%, ` +
        `${live.recoveryMode ? "RECOVERY MODE" : "normal mode"}, ${live.trovesCount.toLocaleString("en-US")} open Troves`,
    );
    if (live.debtInFront != null && live.trovesAhead != null) {
      lines.push(
        `- **Redemption queue:** ${num(live.debtInFront, 0)} LUSD of debt across ${live.trovesAhead.toLocaleString("en-US")} ` +
          `riskier Troves would be redeemed before this one`,
      );
    }
    lines.push(
      `- **Current protocol fees:** borrowing ${num(live.borrowingRate * 100, 2)}% (one-time), ` +
        `redemption ${num(live.redemptionRate * 100, 2)}%`,
    );
  } else {
    // Open but the live read hasn't landed — the replayed absolutes still hold.
    lines.push(`- **Collateral:** ${amt(view.collateral)} ETH (latest emitted TroveUpdated absolute)`);
    lines.push(`- **Debt:** ${num(view.debt, 2)} LUSD (latest emitted TroveUpdated absolute)`);
  }
  lines.push("");

  // ── Lifetime ──
  const opened = markdownFirstTimestamp(events, args.history);
  const last = events[events.length - 1]?.timestamp;
  lines.push("## Lifetime");
  if (opened) lines.push(`- **Opened:** ${fmtUtc(opened)}`);
  if (last) lines.push(`- **Last activity:** ${fmtUtc(last)}`);
  lines.push(`- **Transactions (own, excludes liquidations and redemptions):** ${view.txCount}`);
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
  out.push("| # | Date | Action | ETH Δ | LUSD Δ | ETH after | LUSD after | Transaction |");
  out.push("|---|------|--------|-------|--------|-----------|------------|-------------|");
  rows.forEach((e, i) => {
    if (!isLiquityV1Event(e)) return;
    const d = e.context.data;
    const label = ACTION_LABEL[d.eventType] ?? d.eventType;
    out.push(
      `| ${firstIndex + i} | ${fmtUtc(e.timestamp)} | ${label} | ${amt(parseFloat(d.collDelta))} | ${num(parseFloat(d.debtDelta), 2)} | ${amt(parseFloat(d.collAfter))} | ${num(parseFloat(d.debtAfter), 2)} | ${txCell(e)} |`,
    );
  });
  out.push("");
  out.push("_After-values are the protocol's own emitted absolutes; deltas are signed (after − before)._");
  out.push("");
  return out;
}
