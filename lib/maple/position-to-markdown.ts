// Serialize a Maple lender position + activity timeline into a plain-Markdown
// snapshot, suitable for pasting into an LLM ("here's my position — what am I
// actually exposed to?"). Sibling of lib/fx/position-to-markdown.ts: Rails has
// already done the drift-resistant computation (the pools' own convertToExit
// Assets / totalAssets / strategy AUM views read at a named block), so the
// markdown carries those computed numbers rather than leaving an LLM to guess.
//
// Maple is the protocol where a naive reader goes wrong in four specific ways,
// so the preamble and footnotes name each one outright:
//
//   1. SHARES ARE EVENT-EXACT; VALUE NEVER IS. Σ-ing the timeline gives the
//      deposited principal and the exact share balance (ERC-20 transfers are
//      fully legible — chain-proven wei-exact against balanceOf by
//      scripts/verify-maple-chain.mjs). It CANNOT give what the position is
//      worth: the loan book accrues a posted issuanceRate by the second with
//      NO event of any kind, lifting totalAssets → the exit rate → every
//      lender's claim. The same script proves it: over a window where the
//      LoanManager's anchor never moved (so nothing was emitted), AUM still
//      grew by exactly issuanceRate × Δt, and a real holder's identical share
//      balance was worth more at the end. Only the live rate states value.
//   2. THE CHAIN PROVES THE BOOKKEEPING, NOT THE LOANS. Maple's share price is
//      on-chain accounting of an OFF-CHAIN loan book: borrowers' collateral
//      sits with custodians (BitGo / Copper / Anchorage / Hex Trust, tri-party)
//      and impairments are a pool delegate's posted judgment. "Verified
//      on-chain" here means the contracts recorded it — never that the
//      collateral exists. This is the single most important caveat on the page.
//   3. THE CLAIM IS NOT LIQUID. Typically <1% of a syrup pool sits in the pool
//      contract; the rest is deployed. Exiting travels a delegate-operated FIFO
//      queue, and when the queue exceeds the liquid cash, fills wait on loan
//      repayments. The claim below is a REDEMPTION VALUE, not a balance.
//   4. THERE IS NO LIQUIDATION SURFACE, so there is no health factor to ask
//      about. A default socializes: it is posted as unrealizedLosses, which the
//      exit rate deducts pool-wide, so every holder's claim drops by exactly
//      its pro-rata slice (chain-proven). Nothing is seized from anyone.
//
// Amounts stay in the pool's own asset (USDC/USDT) and are never restated as
// USD: chain-truth charter §S3 forbids convenience $1 pins, and Maple's own
// price surface is no escape hatch — its USDC price is a governance-set $1.00
// constant (getLatestPrice == manualOverridePrice == 1e8) and it carries no
// USDT price at all. A PURE function of the data already in scope on the
// detail page — no fetching.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isMapleEvent } from "@/lib/shared/types/event-shape";
import type { MaplePositionView } from "@/components/protocol/maple/maple-position-card";
import type { MapleCardCaptions } from "@/lib/maple/economics";
import { mapleExitAssets } from "@/lib/maple/exit-value";
import { MAPLE_POOL_BY_KEY } from "@/lib/maple/asset-catalog";
import { num, amt, fmtUtc, txCell } from "@/lib/shared/position-markdown";
import {
  markdownFirstTimestamp,
  markdownTimelineSlice,
  markdownTotalEvents,
  type MarkdownHistoryScope,
} from "@/lib/shared/markdown-history";

export interface MaplePositionMarkdownArgs {
  /** What `events` covers, when the page drew a window over a longer history.
   *  Absent means `events` IS the whole history and answers for itself. */
  history?: MarkdownHistoryScope;
  view: MaplePositionView;
  /** Chronologically sorted (oldest → newest) Maple event list. */
  events: BaseActivityEvent[];
  /** The card's computed captions (earned interest) — passed rather than
   *  recomputed so the snapshot states exactly what the page states. */
  captions?: MapleCardCaptions | null;
  /** When the snapshot was taken (copy time) — passed in so the serializer
   *  stays pure. */
  generatedAt: Date;
}

export function maplePositionToMarkdown(args: MaplePositionMarkdownArgs): string {
  const { view, events, captions, generatedAt } = args;
  const live = view.pools.filter((p) => p.shares + p.escrowedShares > 0);
  const lines: string[] = [];

  lines.push(`# Maple lender position — ${view.wallet}`);
  lines.push("");
  lines.push(
    `> Point-in-time snapshot generated ${fmtUtc(generatedAt.getTime() / 1000)}. ` +
      `This wallet LENDS into Maple's syrup pools; it has borrowed nothing, so there is no debt, no health factor and ` +
      `no liquidation surface anywhere below — a default socializes through the pool's exit rate instead (see Pool access). ` +
      `Current value is the pool's own \`convertToExitAssets\` read live at a named block. That is the only valid current ` +
      `figure: the loan book accrues interest by the SECOND with no event of any kind, so replaying the timeline below ` +
      `gives this wallet's SHARES exactly and what they are WORTH not at all. ` +
      `CUSTODY: Maple's share price is on-chain bookkeeping of an OFF-CHAIN loan book — the chain proves what the ` +
      `contracts recorded (principal deployed, a posted rate, the delegate's impairment marks), never that the borrowers' ` +
      `custodied collateral exists. ` +
      `UNITS: amounts are in each pool's own asset (USDC/USDT) and are never restated as USD — Rails does not pin ` +
      `stablecoins to $1, and Maple's own USDC price is itself a governance-set $1.00 constant. ` +
      `Everything drifts as the book accrues. Not financial advice.`,
  );
  lines.push("");
  lines.push(`- **Wallet:** ${view.wallet}`);
  lines.push(
    `- **Status:** ${view.status === "open" ? "Open — lending" : "Closed — no shares and nothing queued"}` +
      `${view.inQueue ? " · has shares waiting in the withdrawal queue" : ""}`,
  );
  if (view.requestCount > 0)
    lines.push(
      `- **Withdrawal requests:** ${view.requestCount} lifetime — each travels a delegate-operated FIFO queue`,
    );
  lines.push("");

  // ── The claim ──
  if (live.length === 0) {
    lines.push(`## Pool claim — none`);
    lines.push("");
    lines.push(
      `- This wallet holds no shares and has nothing escrowed in a queue. Its history is below; the peak figures are ` +
        `what it held at its height, replayed from its own events.`,
    );
    lines.push("");
    if (view.peakPools.length > 0) {
      for (const p of view.peakPools)
        lines.push(
          `- **${p.symbol} peak:** ${amt(p.peakDeposited)} ${p.assetSymbol} deposited principal · ${amt(p.peakShares)} ${p.symbol} shares`,
        );
      lines.push("");
    }
  } else {
    lines.push(`## Pool claim`);
    lines.push("");
    for (const p of live) {
      const st = view.poolState?.[p.pool];
      const cat = MAPLE_POOL_BY_KEY[p.pool];
      lines.push(`### ${p.symbol} (${p.assetSymbol})`);
      lines.push("");
      if (p.currentValue != null && st != null) {
        lines.push(
          `- **Redeemable now:** ${amt(p.currentValue)} ${p.assetSymbol} — the pool's own \`convertToExitAssets\` on ` +
            `${amt(p.shares)} held + ${amt(p.escrowedShares)} queued ${p.symbol}, read at block ${st.blockNumber}: ` +
            `shares × (totalAssets − unrealizedLosses) ÷ totalSupply. (The pool's exit rate is ${num(st.exitRate, 6)} ` +
            `per share; this figure comes from the aggregates directly, not from re-multiplying that rounded rate.) ` +
            `A redemption VALUE, not a liquid balance.`,
        );
      } else {
        lines.push(
          `- **Redeemable now:** not stated — the live pool read did not land, so no exit rate is available. ` +
            `The deposited principal below is amounts-only and is deliberately NOT presented as the current value.`,
        );
      }
      lines.push(`- **Shares held:** ${amt(p.shares)} ${p.symbol}${p.escrowedShares > 0 ? "" : " (none queued)"}`);
      if (p.escrowedShares > 0)
        lines.push(
          `- **Shares queued:** ${amt(p.escrowedShares)} ${p.symbol} escrowed in the withdrawal queue — still this ` +
            `wallet's position (the queue contract custodies them; chain-proven), exiting at the exit rate when a fill lands`,
        );
      // The spread is only interest if the wallet actually PAID for its shares.
      // Shares can arrive by ERC-20 transfer, which carries no cost basis — for
      // those the principal lane is 0 and calling the whole claim "interest"
      // would be a fabrication. The card gates its caption the same way
      // (economics.ts legInterest: grossIn <= 0 → no figure).
      if (p.lifetimeDeposited > 0) {
        lines.push(
          `- **Deposited principal:** ${amt(p.depositedPrincipal)} ${p.assetSymbol} — Σ(deposit − withdraw − fill) from ` +
            `this wallet's own events. The spread against the redeemable value above is earned interest.`,
        );
      } else {
        lines.push(
          `- **Deposited principal:** none — this wallet has never deposited into this pool: its shares arrived by ` +
            `ERC-20 TRANSFER (see the timeline). A transfer carries no cost basis on-chain, so the spread between the ` +
            `redeemable value above and this lane is **NOT** earned interest and no interest figure is stated for it. ` +
            `Whatever was paid for these shares, if anything, happened somewhere Maple's events cannot see.`,
        );
      }
      if (st != null)
        lines.push(
          `- **NAV vs exit rate:** ${num(st.navRate, 6)} / ${num(st.exitRate, 6)} ${
            st.unrealizedLosses > 0
              ? `— they DIFFER: an impairment of ${amt(st.unrealizedLosses)} ${p.assetSymbol} is live, and the exit rate is what an exiter actually gets`
              : `— equal, so no impairment is currently posted on this pool`
          }`,
        );
      if (cat) lines.push(`- **Pool contract:** ${cat.pool} (ERC-4626 share token; the funds asset is ${cat.asset})`);
      lines.push("");
    }
    const it = captions?.interestEarned;
    if (it && it.amount > 0) {
      lines.push(
        `**Interest earned: ${amt(it.amount)} ${it.symbol}** — already included in the redeemable value above, not ` +
          `additional to it. It accrued with no event of its own: nothing on the timeline below records it.`,
      );
      lines.push("");
    }
  }

  // ── Pool access — Maple's distinctive question ──
  const states = Object.values(view.poolState ?? {}).filter((s) => live.some((p) => p.pool === s.pool));
  if (states.length > 0) {
    lines.push(`## Pool access — what is actually reachable`);
    lines.push("");
    lines.push(
      `Of everything each pool claims to be worth, this is what lenders can reach right now. All plain chain reads; ` +
        `\`liquid + deployed == totalAssets\` is verified BigInt-exact.`,
    );
    lines.push("");
    lines.push(`| Pool | Liquid now | Deployed (loan book) | Total assets | Queue | Exit rate |`);
    lines.push("|------|-----------|----------------------|--------------|-------|-----------|");
    for (const s of states) {
      const cat = MAPLE_POOL_BY_KEY[s.pool];
      if (!cat) continue;
      const pct = s.totalAssets > 0 ? (s.cash / s.totalAssets) * 100 : 0;
      const queueValue = mapleExitAssets(s.raw.queueShares, s);
      lines.push(
        `| ${cat.symbol} | ${amt(s.cash)} ${cat.assetSymbol} (${num(pct, 2)}%) | ${amt(s.loansAum)} | ` +
          `${amt(s.totalAssets)} | ${amt(queueValue)} | ${num(s.exitRate, 6)} |`,
      );
    }
    lines.push("");
    for (const s of states) {
      const cat = MAPLE_POOL_BY_KEY[s.pool];
      if (!cat) continue;
      const queueValue = mapleExitAssets(s.raw.queueShares, s);
      lines.push(
        `- **${cat.symbol}:** the queue wants ${amt(queueValue)} ${cat.assetSymbol} against ${amt(s.cash)} liquid — ` +
          `${queueValue <= s.cash ? "coverable from cash today" : "**more than the pool holds in cash**, so fills wait on loan repayments"}. ` +
          `The deployed ${amt(s.loansAum)} is principal + accrued interest of loans whose collateral is custodied OFF-CHAIN; ` +
          `the chain shows the delegate's bookkeeping of it, not the collateral itself.`,
      );
    }
    lines.push("");
  }

  // ── Lifetime ──
  if (events.length > 0) {
    lines.push("## Lifetime");
    const first = markdownFirstTimestamp(events, args.history);
    const last = events[events.length - 1];
    if (first) lines.push(`- **First activity:** ${fmtUtc(first)}`);
    if (last) lines.push(`- **Last activity:** ${fmtUtc(last.timestamp)}`);
    // Omitted, not zeroed, when the window could not read the position's length.
    const eventTotal = markdownTotalEvents(events, args.history);
    if (eventTotal != null) lines.push(`- **Events:** ${eventTotal.toLocaleString("en-US")}`);
    for (const p of view.pools) {
      if (p.lifetimeDeposited <= 0 && p.lifetimeWithdrawn <= 0) continue;
      lines.push(
        `- **${p.symbol} gross flows:** ${amt(p.lifetimeDeposited)} ${p.assetSymbol} in · ` +
          `${amt(p.lifetimeWithdrawn)} out${p.requestCount > 0 ? ` · ${p.requestCount} withdrawal request${p.requestCount === 1 ? "" : "s"}` : ""}`,
      );
    }
    lines.push("");
  }

  lines.push(...timelineTable(events.filter(isMapleEvent), args.history));
  return lines.join("\n");
}

/** Queue rows move SHARES, not assets; asset rows move both. Keeping the two
 *  in separate columns is the whole point — summing them is the mistake. */
function timelineTable(events: BaseActivityEvent[], history: MarkdownHistoryScope | undefined): string[] {
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
  out.push(`| # | Date | Action | Pool | Asset Δ | Share Δ | Shares after | Transaction |`);
  out.push("|---|------|--------|------|---------|---------|--------------|-------------|");
  rows.forEach((e, i) => {
    if (!isMapleEvent(e)) return;
    const d = e.context.data;
    // A queue fill burns the shares out of the WithdrawalManager's escrow, so
    // the wallet's own balance delta is 0 — printing a bare "—" there would
    // read as nothing having happened, when in fact the exit completed.
    const shareCell =
      d.eventType === "request_fill"
        ? `0 (burned from escrow)`
        : d.eventType === "request" || d.eventType === "request_decrease" || d.eventType === "request_cancel"
          ? `${sign(d.requestShares)} ${d.poolSymbol} (escrow)`
          : d.sharesDelta
            ? `${sign(d.sharesDelta)} ${d.poolSymbol}`
            : "—";
    const assetCell = d.assetsDelta ? `${sign(d.assetsDelta)} ${d.assetSymbol}` : "—";
    const after = d.sharesAfter != null ? `${amt(Number(d.sharesAfter))} ${d.poolSymbol}` : "—";
    out.push(
      `| ${firstIndex + i} | ${fmtUtc(e.timestamp)} | ${e.actionLabel} | ${d.poolSymbol} | ${assetCell} | ${shareCell} | ${after} | ${txCell(e)} |`,
    );
  });
  out.push("");
  out.push(
    `_"Shares after" is this wallet's ERC-20 balance replayed from its own events, and it is EXACT — verified wei-exact ` +
      `against a live \`balanceOf\` (scripts/verify-maple-chain.mjs). What this table can never give is what those shares ` +
      `are WORTH: the loan book accrues by the second with no event, so no row records the interest and no Σ of these rows ` +
      `reaches the redeemable value above. Asset Δ and Share Δ are different units and never sum against each other — ` +
      `deposits and withdrawals move both, queue rows move only shares, and a **fill** shows a 0 share delta because the ` +
      `shares burn from the queue's escrow rather than from the wallet. Requests are queued FIFO and filled at the exit ` +
      `rate WHEN THE FILL LANDS — not the rate when the request was made._`,
  );
  out.push("");
  return out;
}
