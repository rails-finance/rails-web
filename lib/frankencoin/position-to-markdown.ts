// Serialize a Frankencoin position + activity timeline into a plain-Markdown
// snapshot, suitable for pasting into an LLM ("here's my position — am I at
// risk?"). Rails has already done the drift-resistant work (the position's
// own slots at head, the replayed ledger), so the markdown carries those
// computed numbers rather than leaving an LLM to guess.
//
// UNITS ARE NATIVE and the header says so: ZCHF debt, the position's own
// collateral token, an OWNER-DECLARED liquidation price — no USD exists
// anywhere in the system or this file. A PURE function of the data already in
// scope on the detail page — no fetching.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isFrankencoinEvent } from "@/lib/shared/types/event-shape";
import type { FrankencoinPositionView } from "@/components/protocol/frankencoin/frankencoin-position-card";
import type { FrankencoinChainResponse } from "@/lib/api/fetch-frankencoin-position";
import { ppmToPct } from "@/lib/frankencoin/asset-catalog";
import { num, amt, fmtUtc, txCell } from "@/lib/shared/position-markdown";
import {
  markdownFirstTimestamp,
  markdownTimelineSlice,
  type MarkdownHistoryScope,
} from "@/lib/shared/markdown-history";

export interface FrankencoinPositionMarkdownArgs {
  /** What `events` covers, when the page drew a window over a longer history.
   *  Absent means `events` IS the whole history and answers for itself. */
  history?: MarkdownHistoryScope;
  position: string;
  /** The card view, as the page renders it. */
  view: FrankencoinPositionView;
  /** The live per-position chain read; null (or stale) simply omits the live
   *  lines. */
  chain: FrankencoinChainResponse | null;
  /** Chronologically sorted (oldest → newest) event list. */
  events: BaseActivityEvent[];
  /** When the snapshot was taken (copy time) — passed in so the serializer
   *  stays pure. */
  generatedAt: Date;
}

export function frankencoinPositionToMarkdown(args: FrankencoinPositionMarkdownArgs): string {
  const { position, view, chain, events, generatedAt } = args;
  const live = chain && !chain.chainStale ? chain : null;
  const sym = view.collateralSymbol;
  const lines: string[] = [];

  lines.push(`# Frankencoin (Ethereum) minting position`);
  lines.push("");
  lines.push(
    `> Point-in-time snapshot generated ${fmtUtc(generatedAt.getTime() / 1000)}. ` +
      `The position is its own contract (a minimal-proxy clone) — the address is the identity, the owner a ` +
      `transferable fact. ALL UNITS ARE NATIVE: debt in ZCHF (a Swiss-franc stablecoin), collateral in the ` +
      `position's own token. Frankencoin is ORACLE-FREE: the liquidation price is DECLARED BY THE OWNER and ` +
      `enforced by challenge auctions, not a price feed — there is no health factor and no USD anywhere. ` +
      `Interest is charged up front at minting time (nothing accrues). Everything drifts as the position ` +
      `changes. Not financial advice.`,
  );
  lines.push("");
  lines.push(`- **Position contract:** ${position}`);
  if (view.owner)
    lines.push(
      `- **Owner:** ${view.owner}${live?.owner && live.owner !== view.owner ? " (indexed; chain head differs)" : ""}`,
    );
  lines.push(
    `- **Hub:** MintingHub ${view.hub.toUpperCase()}${view.isClone ? " — a clone of an already-vetted original" : ""}`,
  );
  lines.push(`- **Status:** ${view.status[0].toUpperCase() + view.status.slice(1)}`);
  if (view.challengeCount > 0) {
    lines.push(
      `- **Challenges:** ${view.challengeCount}` +
        (view.status === "open" ? " — the position remains open: a challenged position can survive its auction" : ""),
    );
  }
  lines.push("");

  if (view.status === "closed") {
    if (view.peakCollateral != null && view.peakCollateral > 0)
      lines.push(`- **Highest recorded collateral:** ${amt(view.peakCollateral)} ${sym}`);
    if (view.peakMinted != null && view.peakMinted > 0)
      lines.push(`- **Highest recorded mint:** ${amt(view.peakMinted)} ZCHF`);
    if ((view.peakCollateral ?? 0) > 0 || (view.peakMinted ?? 0) > 0) lines.push("");
  } else {
    lines.push(`## Position now`);
    lines.push("");
    lines.push(
      `- **Collateral:** ${
        view.collateral != null
          ? `${amt(view.collateral)} ${sym}`
          : "— (the event ledger never spoke; the live chain read is the source)"
      }`,
    );
    lines.push(`- **Minted:** ${amt(view.minted)} ZCHF (the debt owed to the system)`);
    if (view.liqPrice != null)
      lines.push(
        `- **Liquidation price (OWNER-DECLARED):** ${amt(view.liqPrice)} ZCHF per ${sym} — not an oracle; a challenge auction is what tests it`,
      );
    lines.push("");
  }

  if (live && view.status !== "closed") {
    lines.push(`## Live chain state (at block ${live.blockNumber})`);
    lines.push("");
    if (live.annualInterestPPM != null)
      lines.push(
        `- **Annual interest:** ${num(ppmToPct(live.annualInterestPPM), 2)}% — charged AT MINTING for the remaining term${
          live.hub === "v2" && live.riskPremiumPPM != null
            ? ` (V2: system Leadrate + this position's fixed ${num(ppmToPct(live.riskPremiumPPM), 2)}% risk premium)`
            : ""
        }`,
      );
    if (live.reserveContributionPPM != null)
      lines.push(
        `- **Reserve contribution:** ${num(ppmToPct(live.reserveContributionPPM), 0)}% of every mint held back${
          live.reserveHeld != null ? ` — currently ${amt(live.reserveHeld)} ZCHF, returned on repayment` : ""
        }`,
      );
    if (live.mintCeiling != null && live.mintCeiling > 0)
      lines.push(
        `- **Declared-price ceiling:** collateral × declared price = ${amt(live.mintCeiling)} ZCHF of mintable backing`,
      );
    if (live.challengedAmount != null && live.challengedAmount > 0)
      lines.push(
        `- **UNDER CHALLENGE:** ${amt(live.challengedAmount)} ${sym} of the collateral is in a live challenge auction right now`,
      );
    if (live.cooldownActive && live.cooldownUntil != null)
      lines.push(`- **Minting cooldown:** paused until ${fmtUtc(live.cooldownUntil)} (follows a declared-price raise)`);
    if (live.expiration != null)
      lines.push(
        `- **Expiration:** ${fmtUtc(live.expiration)}${
          live.expired
            ? ` — EXPIRED${live.hub === "v2" ? "; anyone can clear it through the hub's forced sale" : ""}`
            : ""
        }`,
      );
    lines.push("");
  }

  // ── Lifetime ──
  const opened = markdownFirstTimestamp(events, args.history);
  const last = events[events.length - 1]?.timestamp;
  lines.push("## Lifetime");
  if (opened) lines.push(`- **First captured activity:** ${fmtUtc(opened)}`);
  if (last) lines.push(`- **Last activity:** ${fmtUtc(last)}`);
  if (view.txCount > 0) lines.push(`- **Transactions:** ${view.txCount}`);
  lines.push("");

  lines.push(...timelineTable(events, sym, args.history));
  return lines.join("\n");
}

function timelineTable(events: BaseActivityEvent[], sym: string, history: MarkdownHistoryScope | undefined): string[] {
  const out: string[] = [];
  const { rows, heading, firstIndex } = markdownTimelineSlice(events, history);
  out.push(heading);
  out.push("");
  if (rows.length === 0) {
    out.push("_No captured history yet — the indexed backend for this explorer is still being filled._");
    return out;
  }
  out.push(`| # | Date | Action | Collateral (${sym}) | Minted (ZCHF) | Liq. price | Transaction |`);
  out.push("|---|------|--------|--------------------|---------------|-----------|-------------|");
  rows.forEach((e, i) => {
    if (!isFrankencoinEvent(e)) return;
    const d = e.context.data;
    const coll = d.collateral != null ? amt(parseFloat(d.collateral)) : "—";
    const minted = d.minted != null ? amt(parseFloat(d.minted)) : "—";
    const price = d.liqPrice != null ? amt(parseFloat(d.liqPrice)) : "—";
    out.push(
      `| ${firstIndex + i} | ${fmtUtc(e.timestamp)} | ${e.actionLabel} | ${coll} | ${minted} | ${price} | ${txCell(e)} |`,
    );
  });
  out.push("");
  out.push(
    "_Collateral / Minted / Liq. price are the ledger's own absolutes AFTER each event (MintingUpdate emits stored state, not deltas). The liq. price is OWNER-DECLARED — Frankencoin has no oracle. Challenge and forced-sale rows are auctions run against the position — not acts the owner performed._",
  );
  out.push("");
  return out;
}
