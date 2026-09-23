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
//   1. EVENT REPLAY IS NOT CURRENT STATE. Funding, socialized tick/pool
//      rebalances and bad-debt write-offs mutate every position with NO
//      per-position event (chain-proven: scripts/verify-fx-chain.mjs recovers
//      a position's shares at two blocks — identical shares, moved amounts).
//      So the Σ of the timeline is the IMPLIED lane, history only; the gap
//      against the settled truth is the socialized lane, carried explicitly.
//   2. TWO COLLATERAL UNIT SYSTEMS. An operate's collateral delta is the
//      TOKEN as transferred (wstETH 18dp / WBTC 8dp); the settled amounts and
//      liquidation/rebalance figures are RATE-NORMALIZED 1e18 (stETH-
//      equivalent). They never mix or sum, and the table says which is which.
//   3. TICK-LEVEL ROWS ARE NOT THIS POSITION'S SLICE. A tickRebalance names
//      what the WHOLE TICK gave up; the per-position share isn't provable
//      from those logs. The per-stretch drift (the pool's own getPosition
//      read at the position's event boundaries) carries it, and the settled
//      reconciliation carries the lifetime total.
//
// Debt is fxUSD token units — fxUSD is not $1-pinned (chain-truth charter §S3
// forbids convenience pins), so it is never restated as USD. A PURE function
// of the data already in scope on the detail page — no fetching.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isFxEvent } from "@/lib/shared/types/event-shape";
import type { FxPositionView } from "@/components/protocol/fx/fx-position-card";
import { FX_POOLS } from "@/lib/fx/asset-catalog";
import {
  driftIntervalAt,
  summariseFxDrift,
  type FxDriftInterval,
  type FxDriftResult,
} from "@/lib/sources/api/fx-drift";
import { num, amt, usd, fmtUtc, txCell } from "@/lib/shared/position-markdown";
import { markdownTimelineSlice, type MarkdownHistoryScope } from "@/lib/shared/markdown-history";

export interface FxPositionMarkdownArgs {
  /** What `events` covers, when the page drew a window over a longer history.
   *  Absent means `events` IS the whole history and answers for itself. */
  history?: MarkdownHistoryScope;
  view: FxPositionView;
  /** Chronologically sorted (oldest → newest) f(x) event list. */
  events: BaseActivityEvent[];
  /** The per-stretch drift the page has in hand (the newest suffix of the
   *  position's stretches), or null before it answered. */
  drift?: FxDriftResult | null;
  /** When the snapshot was taken (copy time) — passed in so the serializer
   *  stays pure. */
  generatedAt: Date;
}

const DUST = 1e-9;

/** Signed drift with the socialized lane's sign convention: negative = the
 *  lane took from the position. Dust renders as a dash. */
function driftCell(value: number, symbol: string): string {
  if (Math.abs(value) <= DUST) return "—";
  return `${value > 0 ? "+" : "−"}${amt(Math.abs(value))} ${symbol}`;
}

/** How many of the timeline's tick rebalances fall inside one stretch — one
 *  means the stretch's debt drift is this position's exact slice of that
 *  tick's clear. */
function rebalancesIn(iv: FxDriftInterval, events: BaseActivityEvent[]): number {
  let n = 0;
  for (const e of events) {
    if (!isFxEvent(e) || e.context.data.eventType !== "tickRebalance") continue;
    if (e.blockNumber != null && iv.fromBlock <= e.blockNumber && e.blockNumber <= iv.toBlock) n++;
  }
  return n;
}

export function fxPositionToMarkdown(args: FxPositionMarkdownArgs): string {
  const { view, events, generatedAt } = args;
  const drift = args.drift ?? null;
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
      `Current state is the SETTLED lane — the pool's own \`getPosition\` / \`getPositionDebtRatio\` views read ` +
      `at a named block. That is the only valid current figure: f(x) charges funding on collateral and socializes ` +
      `tick/pool rebalances and bad-debt write-offs on debt with NO per-position event, so replaying the timeline below CANNOT ` +
      `state what this position holds now — its Σ is the "implied" lane, history only, and the gap against the ` +
      `settled truth is the socialized lane, given explicitly. ` +
      `UNITS: ${unitsNote}. Debt is fxUSD token units; fxUSD is not $1-pinned and is never restated as USD. ` +
      `Everything drifts as the market and position change. Not financial advice.`,
  );
  lines.push("");
  lines.push(
    `- **Position:** NFT #${view.positionId} — the pool contract is itself the ERC721; transferring it moves the whole position`,
  );
  lines.push(`- **Pool:** ${pool.address} (${tokenSym} collateral → ${colSym} normalized, debt in fxUSD)`);
  if (view.owner)
    lines.push(
      `- **Owner:** ${view.owner}${view.ownerIsContract ? " (a contract — a Safe or manager, not an EOA)" : ""}`,
    );
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
    lines.push(`## Position — settled read pending`);
    lines.push("");
    lines.push(
      `- The settled sweep has not landed for this position, so its CURRENT collateral and debt are not stated here. ` +
        `The event-implied running debt is ${amt(view.impliedDebt.amount)} fxUSD — history only, and known to be wrong ` +
        `by whatever rebalances, write-offs and socialized bad debt have applied since. It is deliberately not presented as the current figure.`,
    );
    lines.push("");
  } else {
    lines.push(`## Position (settled at block ${settled.block ?? "—"})`);
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

    // ── The socialized reconciliation — f(x)'s unique lane ──
    if (settled.debts != null && view.activity.eventCount > 0) {
      const implied = view.impliedDebt.amount;
      const gap = view.socializedDebt ?? implied - settled.debts;
      lines.push(`## Socialized reconciliation`);
      lines.push("");
      if (implied < 0) {
        // The Σ has run BELOW zero: the timeline recorded more debt leaving
        // than it ever recorded arriving, because bad debt socialized from
        // other positions' liquidations kept raising this position's debt
        // silently and the repay/liquidation rows cleared that too. Printing
        // a bare negative "debt" would read as nonsense, so name what it is.
        lines.push(
          `- **Event-implied debt:** ${amt(implied)} fxUSD — Σ of this position's own event deltas, and it has run **negative**, ` +
            `which is not a debt: the timeline recorded more debt leaving than it ever recorded arriving. Bad debt socialized ` +
            `from other positions' liquidations kept adding debt with no event, and the repay and liquidation rows cleared ` +
            `that silent debt along with the borrowed principal. The overshoot is the measure of what the events never saw.`,
        );
      } else {
        lines.push(`- **Event-implied debt:** ${amt(implied)} fxUSD — Σ of this position's own event deltas`);
      }
      lines.push(`- **Settled debt:** ${amt(settled.debts)} fxUSD — the contract's own reckoning`);
      if (Math.abs(gap) <= DUST)
        lines.push(
          `- **Gap:** none — the event-implied and settled debt agree, so no rebalance, write-off or socialized bad debt has ` +
            `touched this position's debt. Funding never shows here: it is charged on collateral (the line under Collateral above).`,
        );
      else
        lines.push(
          `- **Gap:** ${amt(Math.abs(gap))} fxUSD ${gap >= 0 ? "**cleared**" : "**accrued**"} with no per-position event — ` +
            `${
              gap >= 0
                ? "socialized rebalances and/or write-offs removed debt the timeline never recorded leaving"
                : "the settled truth sits above the event record: bad debt socialized from other positions' liquidations accrued debt beyond anything the timeline captures"
            }. This gap is why the timeline cannot be replayed to a current figure.`,
        );
      lines.push("");
      lines.push(...driftTable(drift, events, colSym));
    } else if (view.activity.eventCount === 0) {
      lines.push(
        `- **No indexed events:** this position was minted via a path that emits no \`Operate\`, so there is nothing to ` +
          `reconcile against — its state exists only in the settled lane above. An empty timeline is the truthful record here, not missing data.`,
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

  lines.push(...timelineTable(events.filter(isFxEvent), colSym, tokenSym, rateDiffers, args.history, drift));
  return lines.join("\n");
}

/** The card's collateral-side reconciliation line: what funding and
 *  rebalances moved on collateral with no event of the position's own,
 *  summed over the stretches in hand and qualified when that is not yet the
 *  whole life. Null before the drift answered or while it has no stretch. */
function collateralDriftLine(drift: FxDriftResult | null, colSym: string): string | null {
  if (!drift || drift.intervals.length === 0) return null;
  const s = summariseFxDrift(drift);
  const scope = s.complete
    ? `with no event of its own (every stretch of the position's life read, ending at the settled sweep's block ${drift.headBlock})`
    : `over the latest ${s.intervals} stretch${s.intervals === 1 ? "" : "es"} read so far — not yet the whole life`;
  if (Math.abs(s.collsDrift) <= DUST)
    return `- **Funding & rebalances on collateral:** 0 ${colSym} of movement ${scope}`;
  return (
    `- **Funding & rebalances on collateral:** ${s.collsDrift < 0 ? "took" : "added"} ${amt(Math.abs(s.collsDrift))} ${colSym} ${scope}. ` +
    `Funding is charged on collateral through the pool's collateral index, never on debt — this line is where it shows.`
  );
}

/** The per-stretch decomposition of the reconciliation lines: one row per
 *  quiet stretch between the position's own events, each the pool's own
 *  getPosition read at the stretch's start and end blocks and their
 *  difference. Empty before the drift answered. */
function driftTable(drift: FxDriftResult | null, events: BaseActivityEvent[], colSym: string): string[] {
  if (!drift) return [];
  const out: string[] = [];
  out.push(`## Socialized drift by stretch`);
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
      `for the last row), and their difference. Negative = the socialized lane took from the position. Collateral drift ` +
      `is funding plus this position's share of any tick rebalance in the stretch; debt drift is its share of rebalances ` +
      `(down) and of bad debt socialized from other positions' liquidations (up). A stretch holding exactly one rebalance ` +
      `states this position's exact slice of that tick's clear.`,
  );
  out.push("");
  out.push(`| From block | To block | Collateral drift | Debt drift | Rebalances in stretch |`);
  out.push("|------------|----------|------------------|------------|-----------------------|");
  for (const iv of drift.intervals) {
    out.push(
      `| ${iv.fromBlock} | ${iv.toHead ? `${iv.toBlock} (settled sweep)` : iv.toBlock} | ${driftCell(iv.collsDrift, colSym)} | ${driftCell(iv.debtsDrift, "fxUSD")} | ${rebalancesIn(iv, events) || "—"} |`,
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
  drift: FxDriftResult | null,
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
  out.push(`| # | Date | Action | Collateral Δ | fxUSD Δ | Implied debt after | Transaction |`);
  out.push("|---|------|--------|--------------|---------|--------------------|-------------|");
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
        // Liquidation figures are NORMALIZED units (unlike an operate's).
        action = "Liquidated";
        colD = d.liqColls && Number(d.liqColls) > 0 ? `−${amt(Number(d.liqColls))} ${colSym}` : "—";
        break;
      }
      case "tickRebalance": {
        // TICK-level, not this position's slice — flagged in the cell itself
        // so a reader skimming the table cannot mistake it for a own-position
        // amount. When the stretch holding the rebalance has been read, the
        // position's OWN drift over that stretch follows in the same cell,
        // labeled as such (one rebalance in the stretch = its exact slice).
        action = `Tick ${d.rebalancedTick} rebalanced (whole tick)`;
        colD = d.tickRebColls && Number(d.tickRebColls) > 0 ? `−${amt(Number(d.tickRebColls))} ${colSym} (tick)` : "—";
        debtD =
          d.tickRebFxusdDebts && Number(d.tickRebFxusdDebts) > 0 ? `−${amt(Number(d.tickRebFxusdDebts))} (tick)` : "—";
        const iv = e.blockNumber != null ? driftIntervalAt(drift, e.blockNumber) : undefined;
        if (iv) {
          const shared = rebalancesIn(iv, events);
          const scope = shared > 1 ? `over a stretch shared by ${shared} rebalances` : "over its stretch";
          colD += `; this position ${driftCell(iv.collsDrift, colSym)} ${scope}`;
          debtD += `; this position ${driftCell(iv.debtsDrift, "fxUSD")} ${scope}`;
        }
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
      `| ${firstIndex + i} | ${fmtUtc(e.timestamp)} | ${action} | ${colD} | ${debtD} | ${impliedCell} | ${txCell(e)} |`,
    );
  });
  out.push("");
  out.push(
    `_Collateral deltas on an **Operate** row are ${tokenSym} TOKEN units (as transferred); liquidation and tick rows ` +
      `are RATE-NORMALIZED ${colSym} units${rateDiffers ? ` — a different quantity, via the pool's own token rate` : ` at 18dp rather than the token's own`}. ` +
      `The two systems never mix or sum — and neither reconciles against the settled ` +
      `collateral above, because funding mutates collateral with no event at all. **Tick rebalance** rows state what the ` +
      `WHOLE TICK gave up while this position's shares sat in it; the per-position slice is not provable from those logs — ` +
      `where a row also says "this position … over its stretch", that is the pool's own getPosition drift across the ` +
      `quiet stretch holding the rebalance (see the drift table above), and the settled reconciliation carries the ` +
      `lifetime total. "Implied debt after" is the running Σ of this position's own deltas: deliberately NOT its true debt._`,
  );
  out.push("");
  return out;
}
