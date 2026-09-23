// Serialize a Fluid position + activity timeline into a plain-Markdown
// snapshot, suitable for pasting into an LLM ("here's my position — am I at
// risk?"). Sibling of lib/moonwell/position-to-markdown.ts: Rails has already
// done the drift-resistant computation (the VaultResolver's settled read —
// the vault's own fetchLatestPosition settlement math with liquidation sweeps
// and accrued interest applied — the vault's risk lines, its oracle's
// debt-per-col price), so the markdown carries those computed numbers rather
// than leaving an LLM to guess. Fluid has no USD feed: every valuation is
// stated in the vault's own debt-token unit, and the preamble says so. A PURE
// function of the data already in scope on the detail page — no fetching.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isFluidEvent } from "@/lib/shared/types/event-shape";
import { fluidLegName, fluidPairText, type FluidPositionView } from "@/components/protocol/fluid/fluid-position-card";
import type { FluidPositionChainResponse } from "@/lib/api/fetch-fluid-position";
import { num, amt, fmtUtc, txCell } from "@/lib/shared/position-markdown";
import {
  markdownFirstTimestamp,
  markdownTimelineSlice,
  markdownTotalEvents,
  type MarkdownHistoryScope,
} from "@/lib/shared/markdown-history";

export interface FluidPositionMarkdownArgs {
  /** What `events` covers, when the page drew a window over a longer history.
   *  Absent means `events` IS the whole history and answers for itself. */
  history?: MarkdownHistoryScope;
  view: FluidPositionView;
  /** The live resolver read; null (or stale/not-found) omits the live lines. */
  chain: FluidPositionChainResponse | null;
  /** Chronologically sorted (oldest → newest) fluid event list. */
  events: BaseActivityEvent[];
  /** When the snapshot was taken (copy time) — passed in so the serializer
   *  stays pure. */
  generatedAt: Date;
}

const pct = (f: number, d = 1) => `${num(f * 100, d)}%`;

export function fluidPositionToMarkdown(args: FluidPositionMarkdownArgs): string {
  const { view, chain, events, generatedAt } = args;
  const live = chain && chain.found && !chain.chainStale ? chain : null;
  // Leg names through the same resolution the on-page card uses (index symbol
  // → chain symbol → pool pair → bare shares) — a smart leg exports as what
  // its shares are shares OF, not the blank "DEX shares".
  const colSym = fluidLegName(view, "supply", chain);
  const debtSym = fluidLegName(view, "borrow", chain);
  const lines: string[] = [];

  lines.push(`# Fluid position #${view.nftId} (${fluidPairText(view, chain)})`);
  lines.push("");
  lines.push(
    `> Point-in-time snapshot generated ${fmtUtc(generatedAt.getTime() / 1000)}. ` +
      `Balances are the VaultResolver's live SETTLED read where taken (the vault's own fetchLatestPosition ` +
      `settlement math — every liquidation sweep and interest accrued to the block applied); the Σ replay of the ` +
      `captured operate events + per-position liquidation attributions is the fallback lane and is interest-blind ` +
      `between events. Fluid liquidates price-band ticks whose events name NO position — the attribution rows are ` +
      `settled boundary reads, exact including partial liquidations. Fluid runs NO USD feed: the vault's own oracle ` +
      `prices the collateral in the debt token, so every valuation and risk figure below is in the vault's own ` +
      `two-token space. Everything drifts as the market and position change. Not financial advice.`,
  );
  lines.push("");
  lines.push(`- **Position:** NFT #${view.nftId} — a factory-minted ERC721; transferring it moves the whole position`);
  lines.push(`- **Vault:** ${view.vault} (${fluidPairText(view, chain)}, ${view.vaultKindLabel})`);
  if (view.owner) lines.push(`- **Owner:** ${view.owner}`);
  lines.push(
    `- **Status:** ${view.status[0].toUpperCase() + view.status.slice(1)}${view.wasLiquidated ? " · has been liquidated" : ""}`,
  );
  lines.push("");

  if (view.status !== "open" && !live) {
    lines.push(`- **Peak collateral:** ${amt(Number(view.peakCol))} ${colSym} (highest recorded)`);
    lines.push(`- **Peak debt:** ${amt(Number(view.peakDebt))} ${debtSym}`);
    lines.push("");
  } else if (live) {
    lines.push(`## Position (settled live at block ${live.blockNumber})`);
    lines.push("");
    if (live.isEmpty) {
      lines.push(
        `- Both legs settle to **zero** — the position is ${live.isLiquidated ? "empty after liquidation (its tick fully swept)" : "closed on the vault's own books"}.`,
      );
    } else {
      const colVal =
        live.colValueInDebt != null ? ` (worth ${amt(live.colValueInDebt)} ${debtSym} at the vault's own oracle)` : "";
      lines.push(`- **Collateral:** ${amt(live.supply)} ${colSym}${colVal}`);
      if (live.borrow > 0) lines.push(`- **Debt:** ${amt(live.borrow)} ${debtSym}`);
      else lines.push(`- **Debt:** none — collateral-only; no ratio, no liquidation surface`);
      if (live.isLiquidated)
        lines.push(
          `- The resolver reports the position's tick **swept by a liquidation** — the settled figures already carry the sweep.`,
        );
    }
    lines.push("");
    if (live.borrow > 0 && live.ratio != null) {
      lines.push(`## Live risk (at block ${live.blockNumber})`);
      lines.push("");
      if (live.oraclePriceLiquidateDebtPerCol != null)
        lines.push(
          `- **Oracle price:** 1 ${colSym} = ${amt(live.oraclePriceLiquidateDebtPerCol)} ${debtSym} — the vault's own oracle (liquidate leg), the exact price space the engine judges in`,
        );
      lines.push(
        `- **Position ratio:** ${pct(live.ratio)} (debt ÷ collateral at that price) vs the vault's lines: borrowing gates at ${pct(live.collateralFactor, 0)} (collateral factor), liquidation above ${pct(live.liquidationThreshold, 0)}, full absorption above ${pct(live.liquidationMaxLimit, 0)}; liquidation penalty ${pct(live.liquidationPenalty)}`,
      );
      if (live.liqPriceDebtPerCol != null) {
        const drop =
          live.oraclePriceLiquidateDebtPerCol != null && live.oraclePriceLiquidateDebtPerCol > live.liqPriceDebtPerCol
            ? ` — ${num((1 - live.liqPriceDebtPerCol / live.oraclePriceLiquidateDebtPerCol) * 100, 0)}% below the current oracle price`
            : "";
        lines.push(
          `- **Liquidation price:** ${amt(live.liqPriceDebtPerCol)} ${debtSym} per ${colSym} (borrow ÷ (supply × threshold))${drop}. Fluid liquidations are partial by design — a sweep clears only enough to restore the swept tick's health`,
        );
      }
      const rates: string[] = [];
      if (live.borrowRatePct != null) rates.push(`borrow ${num(live.borrowRatePct, 2)}%`);
      if (live.supplyRatePct != null && live.supplyRatePct !== 0) rates.push(`supply ${num(live.supplyRatePct, 2)}%`);
      if (rates.length > 0) lines.push(`- **Vault rates (annual, floating):** ${rates.join(" · ")}`);
      if (live.vaultTotalPositions != null)
        lines.push(
          `- **Vault context:** one of ${live.vaultTotalPositions} positions (${amt(live.vaultTotalSupply ?? 0)} ${colSym} supplied / ${amt(live.vaultTotalBorrow ?? 0)} ${debtSym} borrowed vault-wide)`,
        );
      if (live.isSmartCol || live.isSmartDebt)
        lines.push(
          `- **Smart legs:** ${live.isSmartCol ? "collateral" : ""}${live.isSmartCol && live.isSmartDebt ? " and " : ""}${live.isSmartDebt ? "debt" : ""} in Fluid DEX pool shares — amounts are shares (share→token conversion is the DexResolver's job, not asserted here)`,
        );
      lines.push("");
    }
  } else {
    // Index-only fallback: the worker overlay / Σ figures, basis stated.
    const basis = view.settled
      ? "the worker's settled overlay at the stamped block"
      : "the Σ replay (interest-blind between events)";
    lines.push(`## Position (${basis} — the live read didn't land)`);
    lines.push("");
    lines.push(`- **Collateral:** ${amt(Number(view.settled?.supply ?? view.colNet))} ${colSym}`);
    lines.push(`- **Debt:** ${amt(Number(view.settled?.borrow ?? view.debtNet))} ${debtSym}`);
    lines.push("");
  }

  // ── Lifetime ──
  const opened = markdownFirstTimestamp(events, args.history);
  const last = events[events.length - 1]?.timestamp;
  lines.push("## Lifetime");
  if (opened) lines.push(`- **First captured activity:** ${fmtUtc(opened)}`);
  if (last) lines.push(`- **Last activity:** ${fmtUtc(last)}`);
  // Omitted, not zeroed, when the window could not read the position's length.
  const eventTotal = markdownTotalEvents(events, args.history);
  if (eventTotal != null) {
    lines.push(
      `- **Events:** ${eventTotal.toLocaleString("en-US")}${view.liquidationCount > 0 ? ` (${view.liquidationCount} liquidation${view.liquidationCount === 1 ? "" : "s"} attributed)` : ""}`,
    );
  }
  lines.push("");

  lines.push(...timelineTable(events, colSym, debtSym, args.history));
  lines.push(...forensicsSection(events, colSym, debtSym));
  return lines.join("\n");
}

/** The valued liquidations — each sweep's legs at the vault's OWN oracle read
 *  at the block it fired in, against the vault's own penalty at that same
 *  block. Debt-token denominated throughout: Fluid runs no USD feed, so a
 *  dollar figure here would be an assumption the protocol never makes.
 *  Omitted entirely when nothing is priced (smart vaults, or blocks the price
 *  walk hasn't reached) — the timeline above still states the amounts. */
function forensicsSection(events: BaseActivityEvent[], colSym: string, debtSym: string): string[] {
  const rows: string[] = [];
  let anyPenalty = false;
  events.forEach((e) => {
    if (!isFluidEvent(e)) return;
    const d = e.context.data;
    if (d.eventType !== "liquidated" && d.eventType !== "absorbed") return;
    const price = d.oraclePriceAtBlock;
    if (!price) return;
    const seized = Number(d.liqSupplyBefore ?? 0) - Number(d.liqSupplyAfter ?? 0);
    const cleared = Number(d.liqBorrowBefore ?? 0) - Number(d.liqBorrowAfter ?? 0);
    if (!(seized > 0) || !(cleared > 0)) return;
    const seizedValue = seized * price.debtPerCol;
    const premium = (seizedValue / cleared - 1) * 100;
    const penaltyPct = d.eventType === "absorbed" ? undefined : price.liquidationPenaltyPct;
    if (penaltyPct != null) anyPenalty = true;
    rows.push(
      `| ${e.blockNumber} | ${amt(seized)} ${colSym} | ${amt(seizedValue)} | ${amt(cleared)} | ` +
        `${premium >= 0 ? "+" : "−"}${num(Math.abs(premium), 3)}% | ${penaltyPct != null ? `${num(penaltyPct, 2)}%` : "— (absorb)"} | ` +
        `${amt(price.debtPerCol)} |`,
    );
  });
  if (rows.length === 0) return [];
  const out: string[] = [];
  out.push(`## Liquidation forensics (${rows.length} valued, in ${debtSym})`);
  out.push("");
  out.push(
    `| Block | Seized | Seized value (${debtSym}) | Cleared (${debtSym}) | Realized premium | Vault penalty | ${colSym} price (${debtSym}) |`,
  );
  out.push("|-------|--------|------------------|--------------|------------------|---------------|--------------|");
  out.push(...rows);
  out.push("");
  out.push(
    `_Every figure is a chain read pinned to the liquidation's own block. The legs are the vault's settlement math ` +
      `(fetchLatestPosition at B−1 minus the same read at B); the price is the vault's OWN oracle at B — not the ` +
      `VaultResolver's configs.oraclePriceLiquidate, which is the same number at head but has no bytecode to answer ` +
      `at these blocks. Values are stated in ${debtSym} because that is the only unit Fluid quotes: the protocol has ` +
      `no USD feed, and a dollar figure here would be an assumption its contracts never make._`,
  );
  if (anyPenalty) {
    out.push("");
    out.push(
      `_The realized premium is derived from the two legs alone and never from the vault penalty beside it, so the ` +
        `two are an independent check. The penalty is a FLOOR the engine guarantees, not a target: across Fluid's ` +
        `whole history a real-sized sweep meets or exceeds its vault's constant essentially always, and reproduces ` +
        `it exactly in the large majority — so a figure above the constant means that sweep cleared the tick on ` +
        `better terms than the minimum, and is stated rather than smoothed. On a seizure small enough that the ` +
        `tick-settled legs quantize, the ratio is dominated by that rounding and can land either side._`,
    );
  }
  out.push("");
  return out;
}

function timelineTable(
  events: BaseActivityEvent[],
  colSym: string,
  debtSym: string,
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
  out.push(`| # | Date | Action | ${colSym} Δ | ${debtSym} Δ | Transaction |`);
  out.push("|---|------|--------|-------------|--------------|-------------|");
  const sign = (v: string | undefined) => {
    const n = Number(v ?? 0) || 0;
    return n === 0 ? "—" : `${n > 0 ? "+" : "−"}${amt(Math.abs(n))}`;
  };
  rows.forEach((e, i) => {
    if (!isFluidEvent(e)) return;
    const d = e.context.data;
    let action: string;
    let colD: string;
    let debtD: string;
    if (d.eventType === "liquidated" || d.eventType === "absorbed") {
      const seized = Number(d.liqSupplyBefore ?? 0) - Number(d.liqSupplyAfter ?? 0);
      const cleared = Number(d.liqBorrowBefore ?? 0) - Number(d.liqBorrowAfter ?? 0);
      action = d.eventType === "absorbed" ? "Absorbed (bad-debt sweep)" : "Liquidated (settled attribution)";
      colD = seized > 0 ? `−${amt(seized)}` : "—";
      debtD = cleared > 0 ? `−${amt(cleared)}` : "—";
    } else {
      action = d.eventType === "mint" ? "Mint (position NFT)" : d.eventType === "transfer" ? "NFT transfer" : "Operate";
      colD = sign(d.colDelta);
      debtD = sign(d.debtDelta);
    }
    out.push(`| ${firstIndex + i} | ${fmtUtc(e.timestamp)} | ${action} | ${colD} | ${debtD} | ${txCell(e)} |`);
  });
  out.push("");
  out.push(
    "_Operate deltas are the LogOperate events' own signed amounts. Liquidation rows are per-position attributions: Fluid's LogLiquidate sweeps price-band ticks and names no position, so each row is the vault's own settlement math read at the boundary blocks (before − after; exact, partial liquidations included). Interest accrued between events is real and appears only in the settled figures above._",
  );
  out.push("");
  return out;
}
