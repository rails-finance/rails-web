// Serialize an f(x) V2 position + activity timeline into a plain-Markdown
// snapshot, suitable for pasting into an LLM ("here's my position — am I at
// risk?"). Sibling of lib/fluid/position-to-markdown.ts: Rails has already
// done the drift-resistant computation (the settled sweep — the pool's own
// getPosition / getPositionDebtRatio views at a named block), so the markdown
// carries those computed numbers rather than leaving an LLM to guess.
//
// f(x) is the protocol where a naive reader goes wrong in three specific ways,
// so the preamble and footnotes name each one outright:
//
//   1. EVENT REPLAY IS NOT CURRENT STATE. Funding, rebalances, redemptions,
//      pool-wide liquidations and other positions' bad debt move every
//      position with NO transaction of the owner's (chain-proven:
//      scripts/verify-fx-chain.mjs recovers a position's shares at two blocks
//      — identical shares, moved amounts). So the Σ of the timeline is what
//      the transactions add up to, history only; the gap against the pool's
//      own figure is what the pool moved, named part by part.
//   2. TWO COLLATERAL UNIT SYSTEMS. An operate's collateral delta is the
//      TOKEN as transferred (wstETH 18dp / WBTC 8dp); the settled amounts and
//      liquidation/rebalance figures are RATE-NORMALIZED 1e18 (stETH-
//      equivalent). They never mix or sum, and the table says which is which.
//   3. TICK-LEVEL ROWS ARE NOT THIS POSITION'S SLICE. A tickRebalance names
//      what the WHOLE TICK gave up. The position's own change is the pool's
//      getPosition read at the block before the row and at the row's block
//      (lib/fx/socialized-reads.tsx), stated on the row where the page has
//      the read; the per-stretch table carries the quiet stretches between
//      the position's own events, and the reconciliation the lifetime total.
//
// The words are the position page's (the card's debt line, lib/fx/no-tx-parts.ts).
// Debt is fxUSD token units — fxUSD is not $1-pinned (chain-truth charter §S3
// forbids convenience pins), so it is never restated as USD. A PURE function
// of the data already in scope on the detail page — no fetching.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isFxEvent } from "@/lib/shared/types/event-shape";
import type { FxPositionView } from "@/components/protocol/fx/fx-position-card";
import type { FxStateAt } from "@/lib/sources/chain/fx-event-state";
import { FX_POOLS } from "@/lib/fx/asset-catalog";
import { summariseFxDrift, type FxDriftResult } from "@/lib/sources/api/fx-drift";
import { fxBlockChange } from "@/lib/fx/socialized-reads";
import type { FxNoTxParts } from "@/lib/fx/no-tx-parts";
import { num, amt, usd, fmtUtc, txCell } from "@/lib/shared/position-markdown";
import { markdownTimelineSlice, type MarkdownHistoryScope } from "@/lib/shared/markdown-history";

export interface FxPositionMarkdownArgs {
  /** What `events` covers, when the page drew a window over a longer history.
   *  Absent means `events` IS the whole history and answers for itself. */
  history?: MarkdownHistoryScope;
  view: FxPositionView;
  /** Chronologically sorted (oldest → newest) f(x) event list. */
  events: BaseActivityEvent[];
  /** The per-stretch reads the page has in hand (the newest suffix of the
   *  position's stretches), or null before they answered. */
  drift?: FxDriftResult | null;
  /** The position read at each rebalance, redemption and pool-wide
   *  liquidation row's block and the block before (the page's reads), where
   *  the page holds the whole history. */
  reads?: Record<string, FxStateAt> | null;
  /** What moved the debt without a transaction, part by part — the card's
   *  debt line (lib/fx/no-tx-parts.ts). */
  parts?: FxNoTxParts | null;
  /** When the snapshot was taken (copy time) — passed in so the serializer
   *  stays pure. */
  generatedAt: Date;
}

const DUST = 1e-9;

/** A signed change in the pool's direction: negative = the pool took from the
 *  position. Dust renders as a dash. */
function changeCell(value: number, symbol: string): string {
  if (Math.abs(value) <= DUST) return "—";
  return `${value > 0 ? "+" : "−"}${amt(Math.abs(value))} ${symbol}`;
}

const dateSpan = (a: number, b: number): string => {
  const da = fmtUtc(a).slice(0, 10);
  const db = fmtUtc(b).slice(0, 10);
  return da === db ? da : `${da} – ${db}`;
};

export function fxPositionToMarkdown(args: FxPositionMarkdownArgs): string {
  const { view, events, generatedAt } = args;
  const drift = args.drift ?? null;
  const reads = args.reads ?? null;
  const parts = args.parts ?? null;
  const pool = FX_POOLS[view.pool];
  const colSym = view.normalizedSymbol;
  const tokenSym = pool.tokenSymbol;
  const settled = view.settled;
  // On the wstETH pool the normalized unit is a DIFFERENT asset-quantity
  // (stETH-equivalent, via the pool's rate). On the WBTC pool it is the same
  // quantity re-scaled 8dp → 18dp. Both are "not the token integer", but they
  // are not the same statement, and saying "normalized units, not WBTC" on
  // the WBTC pool would contradict itself.
  const rateDiffers = colSym !== tokenSym;
  const unitsNote = rateDiffers
    ? `collateral is RATE-NORMALIZED 1e18 (${colSym}-equivalent at the pool's own token rate), which is NOT the ${tokenSym} that was deposited — the timeline's collateral deltas are in ${tokenSym} token units and the two systems never mix or sum`
    : `collateral is RATE-NORMALIZED to 1e18 while the ${tokenSym} deposited is ${pool.tokenDecimals}dp — the same asset at a different scale, so the settled figures below and the timeline's ${tokenSym}-unit deltas are never summed against each other`;
  const lines: string[] = [];

  lines.push(`# f(x) V2 position #${view.positionId} (${tokenSym} pool)`);
  lines.push("");
  lines.push(
    `> Point-in-time snapshot generated ${fmtUtc(generatedAt.getTime() / 1000)}. ` +
      `Current state is the pool's own figure — its \`getPosition\` / \`getPositionDebtRatio\` views read ` +
      `at a named block. That is the only valid current figure: f(x) charges funding on collateral, and rebalances, ` +
      `redemptions, pool-wide liquidations and other positions' bad debt move the debt, all with NO transaction of the ` +
      `owner's, so replaying the timeline below CANNOT state what this position holds now — its Σ is what the ` +
      `transactions add up to, history only, and the difference against the pool's figure is what the pool moved, ` +
      `named part by part. ` +
      `UNITS: ${unitsNote}. Debt is fxUSD token units; fxUSD is not $1-pinned and is never restated as USD. ` +
      `Everything drifts as the market and position change. Not financial advice.`,
  );
  lines.push("");
  lines.push(
    `- **Position:** NFT #${view.positionId} — the pool contract is itself the ERC721; transferring it moves the whole position`,
  );
  lines.push(`- **Pool:** ${pool.address} (${tokenSym} collateral → ${colSym} normalized, debt in fxUSD)`);
  if (view.owner)
    lines.push(`- **Owner:** ${view.owner}${view.ownerIsContract ? " (a contract — a Safe or manager)" : ""}`);
  const statusWord =
    view.status === "unknown"
      ? "Unsettled (the sweep has not landed)"
      : view.status[0].toUpperCase() + view.status.slice(1);
  lines.push(
    `- **Status:** ${statusWord}${view.everLiquidated ? ` · has been liquidated${view.liquidationCount > 1 ? ` (${view.liquidationCount}×)` : ""}` : ""}`,
  );
  // The tick only means something while the position still holds shares.
  if (view.lastTick != null && view.status === "open")
    lines.push(
      `- **Tick:** ${view.lastTick} — the tick its shares sat in at the last touch; rebalances act on whole ticks`,
    );
  lines.push("");

  // ── Settled position ──
  if (settled.colls == null && settled.debts == null) {
    lines.push(`## Position — the pool's figure pending`);
    lines.push("");
    lines.push(
      `- The settled sweep has not landed for this position, so its CURRENT collateral and debt are not stated here. ` +
        `Its transactions add up to ${amt(view.impliedDebt.amount)} fxUSD of debt — history only, and off by whatever ` +
        `the pool has moved since. It is deliberately not presented as the current figure.`,
    );
    lines.push("");
  } else {
    lines.push(`## Position (the pool's figure at block ${settled.block ?? "—"})`);
    lines.push("");
    const empty = (settled.colls ?? 0) <= 0 && (settled.debts ?? 0) <= 0;
    if (empty) {
      // Nothing left to value: pricing a zero balance would be noise, and the
      // reconciliation below is the whole story of how it emptied.
      lines.push(
        `- Both legs settle to **zero** — the position is ${view.everLiquidated ? "empty after liquidation" : "closed on the pool's own books"}. Its history is below, and the reconciliation that follows is how it got here.`,
      );
      const collDrift = collateralDriftLine(drift, colSym);
      if (collDrift) lines.push(collDrift);
    } else {
      if (settled.colls != null) {
        const valued =
          settled.collUsd != null && view.oracle.priceUsd != null && settled.colls > 0
            ? ` (worth ${usd(settled.collUsd)} at ${usd(view.oracle.priceUsd)} per ${colSym} — the pool oracle's MIN "liquidate" leg${view.oracle.priceBlock != null ? `, read at block ${view.oracle.priceBlock}` : ""})`
            : "";
        lines.push(
          `- **Collateral:** ${amt(settled.colls)} ${colSym}${valued} — ${rateDiffers ? `normalized units, not the ${tokenSym} deposited` : `normalized to 18dp (the ${tokenSym} deposited is ${pool.tokenDecimals}dp)`}`,
        );
        const collDrift = collateralDriftLine(drift, colSym);
        if (collDrift) lines.push(collDrift);
      }
      if (settled.debts != null) {
        lines.push(
          settled.debts > 0
            ? `- **Debt:** ${amt(settled.debts)} fxUSD`
            : `- **Debt:** none — collateral-only; no debt ratio, no liquidation surface`,
        );
      }
    }
    if (!empty && settled.debtRatio != null && (settled.debts ?? 0) > 0) {
      lines.push(
        `- **Debt ratio:** ${num(settled.debtRatio * 100, 1)}% — the pool's OWN \`getPositionDebtRatio\`, the same math its ` +
          `liquidation path runs. It is judged at the oracle's ANCHOR price, a different leg from the MIN price the USD ` +
          `figure above uses, so the two are not two views of one number.`,
      );
    }
    lines.push("");

    // ── Debt moved by the pool — f(x)'s unique lane ──
    if (settled.debts != null && view.activity.eventCount > 0) {
      lines.push(...debtMovedSection(view, settled.debts, parts));
      lines.push(...driftTable(drift, colSym));
    } else if (view.activity.eventCount === 0) {
      lines.push(
        `- **No indexed events:** this position was minted via a path that emits no \`Operate\`, so there is nothing to ` +
          `reconcile against — its state exists only in the pool's own figures above. An empty timeline is the truthful record here, not missing data.`,
      );
      lines.push("");
    }
  }

  // ── Lifetime ──
  if (view.activity.eventCount > 0) {
    // The summary's eventCount is the position's OWN emitted rows (operates +
    // liquidations). The table below carries more: derived tick-lineage rows
    // and ERC721 transfers. Two different counts, so name both rather than
    // print them side by side and let them look like a contradiction.
    const fx = events.filter(isFxEvent);
    const derived = fx.filter((e) => e.context.data.eventType === "tickRebalance").length;
    const transfers = fx.filter((e) => e.context.data.eventType === "transfer").length;
    const extras = [
      derived > 0 ? `${derived} derived tick-rebalance row${derived === 1 ? "" : "s"}` : null,
      transfers > 0 ? `${transfers} NFT transfer${transfers === 1 ? "" : "s"}` : null,
    ].filter(Boolean);
    lines.push("## Lifetime");
    if (view.activity.firstTs) lines.push(`- **First captured activity:** ${fmtUtc(view.activity.firstTs)}`);
    if (view.activity.lastTs) lines.push(`- **Last activity:** ${fmtUtc(view.activity.lastTs)}`);
    lines.push(
      `- **Own emitted events:** ${view.activity.eventCount}${view.liquidationCount > 0 ? ` (${view.liquidationCount} liquidation${view.liquidationCount === 1 ? "" : "s"})` : ""}` +
        (extras.length > 0
          ? ` — the ${fx.length}-row timeline below also carries ${extras.join(" and ")}, which are not events this position emitted`
          : ""),
    );
    lines.push("");
  }

  lines.push(...timelineTable(events.filter(isFxEvent), colSym, tokenSym, rateDiffers, args.history, reads));
  return lines.join("\n");
}

/** The card's debt line: what the transactions add up to, the pool's own
 *  figure, and what moved the debt between them, part by part where the page
 *  has read each row's block, else the net. */
function debtMovedSection(view: FxPositionView, settledDebts: number, parts: FxNoTxParts | null): string[] {
  const out: string[] = [];
  const implied = view.impliedDebt.amount;
  const gap = view.socializedDebt ?? implied - settledDebts;
  out.push(`## Debt moved by the pool`);
  out.push("");
  if (implied < 0) {
    // The Σ has run BELOW zero: the timeline recorded more debt leaving than
    // it ever recorded arriving, because other positions' bad debt kept
    // raising this position's debt with no transaction and the repay and
    // liquidation rows cleared that too. A bare negative "debt" would read as
    // nonsense, so name what it is.
    out.push(
      `- **Its transactions add up to:** ${amt(implied)} fxUSD — Σ of this position's own event deltas, and it has run **negative**, ` +
        `which is not a debt: the timeline recorded more debt leaving than it ever recorded arriving. Other positions' bad debt ` +
        `kept adding to this position's debt with no transaction, and the repay and liquidation rows cleared that along with ` +
        `the borrowed principal. The overshoot is the measure of what the transactions never saw.`,
    );
  } else {
    out.push(`- **Its transactions add up to:** ${amt(implied)} fxUSD — Σ of this position's own event deltas`);
  }
  out.push(`- **The pool's own figure:** ${amt(settledDebts)} fxUSD`);
  if (Math.abs(gap) <= DUST) {
    out.push(
      `- **Moved by the pool:** nothing — the two agree, so no rebalance, redemption, liquidation or bad debt has touched ` +
        `this position's debt. Funding never shows here: it is charged on collateral (the line under Collateral above).`,
    );
    out.push("");
    return out;
  }
  if (parts && parts.badDebt > -0.0005) {
    const items: string[] = [];
    if (parts.rebalances && parts.rebalances.debt > 0.0005)
      items.push(
        `${amt(parts.rebalances.debt)} fxUSD cleared by ${parts.rebalances.rows === 1 ? "a rebalance" : `${parts.rebalances.rows} rebalances`} (${dateSpan(parts.rebalances.firstTs, parts.rebalances.lastTs)})`,
      );
    if (parts.redemptions && parts.redemptions.debt > 0.0005)
      items.push(
        `${amt(parts.redemptions.debt)} fxUSD by ${parts.redemptions.rows === 1 ? "a redemption" : `${parts.redemptions.rows} redemptions`} (${dateSpan(parts.redemptions.firstTs, parts.redemptions.lastTs)})`,
      );
    if (parts.poolLiquidations && parts.poolLiquidations.debt > 0.0005)
      items.push(
        `${amt(parts.poolLiquidations.debt)} fxUSD by a pool-wide liquidation that repaid ${amt(parts.poolLiquidations.poolRepaid ?? 0)} fxUSD across the pool and wrote off the rest (${dateSpan(parts.poolLiquidations.firstTs, parts.poolLiquidations.lastTs)})`,
      );
    if (parts.leftUnpaid > 0.0005)
      items.push(`${amt(parts.leftUnpaid)} fxUSD written off at this position's liquidation`);
    if (parts.badDebt > 0.0005) items.push(`+${amt(parts.badDebt)} fxUSD of other positions' bad debt`);
    out.push(`- **Moved by the pool:** ${amt(Math.abs(gap))} fxUSD ${gap >= 0 ? "cleared" : "added"}, in parts:`);
    for (const it of items) out.push(`  - ${it}`);
    out.push(
      `- Each part is the pool's own \`getPosition\` read at the block before the row and at the row's block, so it is this ` +
        `position's change and not the whole tick's; the bad debt is the remainder, added through the pool's debt index.`,
    );
  } else {
    out.push(
      `- **Moved by the pool:** ${amt(Math.abs(gap))} fxUSD ${gap >= 0 ? "cleared" : "added"} with no transaction of the owner's, net — ` +
        `${
          gap >= 0
            ? "rebalances, redemptions and liquidations cleared debt the transactions never recorded leaving"
            : "other positions' bad debt added to this position's debt beyond anything the transactions record"
        }. This is why the timeline cannot be replayed to a current figure.`,
    );
  }
  out.push("");
  return out;
}

/** The card's collateral-side line: what funding and the pool's rows moved on
 *  collateral with no transaction of the owner's, summed over the stretches in
 *  hand and qualified when that is not yet the whole life. Null before the
 *  reads answered or while they have no stretch. */
function collateralDriftLine(drift: FxDriftResult | null, colSym: string): string | null {
  if (!drift || drift.intervals.length === 0) return null;
  const s = summariseFxDrift(drift);
  const scope = s.complete
    ? `without a transaction (every stretch of the position's life read, ending at the settled sweep's block ${drift.headBlock})`
    : `over the latest ${s.intervals} stretch${s.intervals === 1 ? "" : "es"} read so far — not yet the whole life`;
  if (Math.abs(s.collsDrift) <= DUST) return `- **Moved by the pool on collateral:** 0 ${colSym} of movement ${scope}`;
  return (
    `- **Moved by the pool on collateral:** ${s.collsDrift < 0 ? "took" : "added"} ${amt(Math.abs(s.collsDrift))} ${colSym} ${scope}. ` +
    `Funding is charged on collateral through the pool's collateral index, never on debt — this line is where it shows, with what rebalances and redemptions took.`
  );
}

/** The per-stretch table: one row per quiet stretch between the position's
 *  own events, each the pool's own getPosition read at the stretch's start
 *  and end blocks and their difference. Empty before the reads answered. */
function driftTable(drift: FxDriftResult | null, colSym: string): string[] {
  if (!drift) return [];
  const out: string[] = [];
  out.push(`## Moved without a transaction, by stretch`);
  out.push("");
  if (drift.intervals.length === 0) {
    out.push(
      drift.headPending
        ? `- The position was touched after the last settled sweep; its stretches are stated once the next sweep lands.`
        : drift.headBlock == null
          ? `- No settled sweep for this position yet; the stretches are stated once it lands.`
          : `- No quiet stretches: every block gap between the position's events is empty.`,
    );
    out.push("");
    return out;
  }
  out.push(
    `Each row is one quiet stretch between this position's own events: the pool's own \`getPosition\` read at the ` +
      `stretch's start block (post-event) and end block (the block before the next event, or the settled sweep's block ` +
      `for the last row), and their difference. Negative = the pool took from the position. Collateral moved is funding ` +
      `plus what any rebalance or redemption in the stretch took; debt moved is what rebalances, redemptions and ` +
      `pool-wide liquidations cleared (down) and other positions' bad debt added (up). The timeline below states each ` +
      `such row's own change at its block.`,
  );
  out.push("");
  out.push(`| From block | To block | Collateral moved | Debt moved |`);
  out.push("|------------|----------|------------------|------------|");
  for (const iv of drift.intervals) {
    out.push(
      `| ${iv.fromBlock} | ${iv.toHead ? `${iv.toBlock} (settled sweep)` : iv.toBlock} | ${changeCell(iv.collsDrift, colSym)} | ${changeCell(iv.debtsDrift, "fxUSD")} |`,
    );
  }
  out.push("");
  const notes: string[] = [];
  if (drift.headPending)
    notes.push(
      `the latest stretch is not shown: the position was touched after the last settled sweep, and it is stated once the next sweep lands`,
    );
  if (drift.unread > 0)
    notes.push(
      `${drift.unread} older stretch${drift.unread === 1 ? "" : "es"} ${drift.unread === 1 ? "was" : "were"} not read at snapshot time${drift.stalled ? ` (${drift.stalled})` : ""}, so the rows above are the newest suffix of the position's life, not all of it`,
    );
  if (notes.length > 0) {
    out.push(`_${notes.map((n) => n[0].toUpperCase() + n.slice(1)).join(". ")}._`);
    out.push("");
  }
  return out;
}

function timelineTable(
  events: BaseActivityEvent[],
  colSym: string,
  tokenSym: string,
  rateDiffers: boolean,
  history: MarkdownHistoryScope | undefined,
  reads: Record<string, FxStateAt> | null,
): string[] {
  const out: string[] = [];
  const { rows, heading, firstIndex } = markdownTimelineSlice(events, history, { unit: "row" });
  out.push(heading);
  out.push("");
  if (rows.length === 0) {
    out.push("_No transaction history available._");
    out.push("");
    return out;
  }
  const sign = (v: string | undefined) => {
    const n = Number(v ?? 0) || 0;
    return n === 0 ? "—" : `${n > 0 ? "+" : "−"}${amt(Math.abs(n))}`;
  };
  // A block holding several pool rows (rebalances, a pool-wide liquidation)
  // is read once; its change belongs to the block, so only the block's first
  // row here states it and the rest say so.
  const poolRowsPerBlock = new Map<number, number>();
  for (const e of rows) {
    if (!isFxEvent(e)) continue;
    const d = e.context.data;
    if (d.eventType === "tickRebalance" || (d.eventType === "liquidation" && d.poolWide))
      poolRowsPerBlock.set(e.blockNumber, (poolRowsPerBlock.get(e.blockNumber) ?? 0) + 1);
  }
  const statedBlocks = new Set<number>();
  const ownChange = (e: BaseActivityEvent): { coll: string; debt: string } | null => {
    if (e.blockNumber == null) return null;
    const peers = poolRowsPerBlock.get(e.blockNumber) ?? 1;
    if (statedBlocks.has(e.blockNumber)) return { coll: "included above", debt: "included above" };
    const change = fxBlockChange(reads, e.blockNumber);
    if (!change) return null;
    statedBlocks.add(e.blockNumber);
    const who = peers > 1 ? `this position, the block's ${peers} rows together` : "this position";
    return { coll: `${who} ${changeCell(change.coll, colSym)}`, debt: `${who} ${changeCell(change.debt, "fxUSD")}` };
  };
  out.push(
    `| # | Date | Action | Collateral Δ | fxUSD Δ | Collateral after (${colSym}) | Debt after (fxUSD) | Moved since previous | Implied debt after | Transaction |`,
  );
  out.push(
    "|---|------|--------|--------------|---------|-----------------------|--------------------|----------------------|--------------------|-------------|",
  );
  rows.forEach((e, i) => {
    if (!isFxEvent(e)) return;
    const d = e.context.data;
    let action: string;
    let colD: string;
    let debtD = sign(d.debtDelta);
    // The running Σ only advances on the position's OWN emitted rows. Derived
    // tick rows and NFT transfers carry no meaningful figure — printing their
    // zero would read as the debt having gone to zero.
    let impliedCell = d.impliedDebtAfter != null ? amt(Number(d.impliedDebtAfter)) : "—";
    switch (d.eventType) {
      case "liquidation": {
        if (d.poolWide) {
          // A pool-wide Liquidate run: its amounts are the whole run's; the
          // position's own change first, where the page read the block.
          action = `Pool-wide liquidation (tick ${d.rebalancedTick}${d.emptiesPosition ? ", liquidated whole" : ""})`;
          const own = ownChange(e);
          const poolColl =
            d.tickRebColls && Number(d.tickRebColls) > 0 ? `pool −${amt(Number(d.tickRebColls))} ${tokenSym}` : null;
          const poolDebt =
            d.tickRebFxusdDebts && Number(d.tickRebFxusdDebts) > 0
              ? `pool repaid ${amt(Number(d.tickRebFxusdDebts))}`
              : null;
          colD = [own?.coll, poolColl].filter(Boolean).join("; ") || "—";
          debtD = [own?.debt, poolDebt].filter(Boolean).join("; ") || "—";
          impliedCell = "—";
          break;
        }
        // The collateral the liquidator received, in the token as transferred.
        action = "Liquidated";
        colD = d.liqColls && Number(d.liqColls) > 0 ? `−${amt(Number(d.liqColls))} ${tokenSym} to the liquidator` : "—";
        break;
      }
      case "tickRebalance": {
        // This position's own change first (the pool's getPosition at the
        // block before and at the block), then the TICK-level amounts — the
        // whole tick's clear, NOT this position's slice — with their scope
        // word, so a reader skimming the table cannot mistake them for an
        // own-position amount.
        const scope = d.poolWide ? "pool" : "tick";
        action = d.redemption
          ? `Redemption (took from tick ${d.rebalancedTick})`
          : d.poolWide
            ? `Pool-wide rebalance (moved tick ${d.rebalancedTick})`
            : `Tick ${d.rebalancedTick} rebalanced (whole tick)`;
        const own = ownChange(e);
        const tickColl =
          d.tickRebColls && Number(d.tickRebColls) > 0 ? `${scope} −${amt(Number(d.tickRebColls))} ${tokenSym}` : null;
        const tickDebt =
          d.tickRebFxusdDebts && Number(d.tickRebFxusdDebts) > 0
            ? `${scope} repaid ${amt(Number(d.tickRebFxusdDebts))}`
            : null;
        colD = [own?.coll, tickColl].filter(Boolean).join("; ") || "—";
        debtD = [own?.debt, tickDebt].filter(Boolean).join("; ") || "—";
        impliedCell = "—";
        break;
      }
      case "transfer": {
        action = d.transferFrom && /^0x0+$/.test(d.transferFrom) ? "Mint (position NFT)" : "NFT transfer";
        colD = "—";
        debtD = "—";
        impliedCell = "—";
        break;
      }
      default: {
        action = d.isOpen ? "Open (operate)" : d.emptiesPosition ? "Operate (emptied the position)" : "Operate";
        colD = d.collDelta ? `${sign(d.collDelta)} ${tokenSym}` : "—";
      }
    }
    out.push(
      `| ${firstIndex + i} | ${fmtUtc(e.timestamp)} | ${action} | ${colD} | ${debtD} | ${d.collAfter != null ? amt(Number(d.collAfter)) : "—"} | ${d.debtAfter != null ? amt(Number(d.debtAfter)) : "—"} | ${d.debtSincePrevious != null ? sign(d.debtSincePrevious) : ""} | ${impliedCell} | ${txCell(e)} |`,
    );
  });
  out.push("");
  out.push(
    `_Collateral deltas on an **Operate** row are ${tokenSym} TOKEN units (as transferred); liquidation and tick rows ` +
      `are RATE-NORMALIZED ${colSym} units${rateDiffers ? ` — a different quantity, via the pool's own token rate` : ` at 18dp rather than the token's own`}. ` +
      `The two systems never mix or sum — and neither reconciles against the settled ` +
      `collateral above, because funding moves collateral with no transaction at all. On a **rebalance**, **redemption** or ` +
      `**pool-wide liquidation** row, "this position …" is the pool's own getPosition at the block before the row and at ` +
      `the row's block — the position's own change; a block holding several such rows is read once and its first row ` +
      `states it. The "tick" and "pool" amounts beside it are what the WHOLE TICK or pool gave up, not this position's ` +
      `slice. "Collateral after" and "Debt after" are the pool's getPosition at the row's block; "Moved since ` +
      `previous" is what the debt moved between the previous event and this one with no transaction of the owner's ` +
      `(funding, rebalances, bad debt). "Implied debt after" is the running Σ of this position's own deltas._`,
  );
  out.push("");
  return out;
}
