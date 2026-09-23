// Serialize a Polaris CDP + activity timeline into a plain-Markdown snapshot,
// suitable for pasting into an LLM. Rails has already done the drift-resistant
// work (the CDP's own getters at head, the summed ledger), so the markdown
// carries those computed numbers rather than leaving an LLM to guess.
//
// UNITS ARE NATIVE and the header says so: pETH collateral, the market's
// stablecoin as debt; USD only where the protocol's own feed produced it, and
// every figure a SEPOLIA TESTNET figure. A PURE function of the data already
// in scope on the detail page — no fetching.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isPolarisEvent } from "@/lib/shared/types/event-shape";
import type { PolarisPositionView } from "@/components/protocol/polaris/polaris-position-card";
import type { PolarisChainResponse } from "@/lib/api/fetch-polaris-position";
import type { PolarisMarket } from "@/lib/polaris/asset-catalog";
import {
  POLARIS_LIQ_CONSTANTS,
  polarisLiquidationFigures,
  polarisValueFormat,
} from "@/components/protocol/polaris/polaris-liquidation-forensics";
import { crPct2, polarisCrAtEvent } from "@/lib/polaris/cr-at-event";
import { polarisLifetime } from "@/lib/polaris/economics";
import { polarisPsmOutcomeSentence } from "@/lib/polaris/economics-explanation";
import { polarisSinceLastTouch, polarisSinceLastTouchSentence } from "@/lib/polaris/since-last-touch";
import { num, amt, usd, fmtUtc, txCell } from "@/lib/shared/position-markdown";
import {
  anchorMarketNotes,
  marketNoteHeadline,
  marketNoteReceiptLine,
  marketNoteRowAnnotation,
  marketNoteSentence,
  type MarketNote,
} from "@/lib/shared/market-note";

export interface PolarisPositionMarkdownArgs {
  view: PolarisPositionView;
  /** The live per-CDP chain read; null (or stale) simply omits the live lines. */
  chain: PolarisChainResponse | null;
  /** Chronologically sorted (oldest → newest) event list. */
  events: BaseActivityEvent[];
  /** Market notes for this CDP — receipted facts about the market's own
   *  primary rate, observed between two of this CDP's own touches
   *  (lib/shared/market-note.ts). A note is NEVER an event: it is counted in
   *  no total here, the timeline table's row count and numbering are
   *  identical with and without them, and the CSV never carries one. */
  notes?: MarketNote[];
  /** This CDP's live notes (lib/shared/market-note.ts's `livePolarisPriceGapNote`
   *  / `liveRateStepNote`) — the market's own price and primary rate read at
   *  the chain head, against this CDP's own newest touch that carries each.
   *  Never anchored (the later end is the chain head, past every touch's
   *  block) and never in the timeline table; listed alongside the historical
   *  notes in the "Market notes" section only. */
  liveNotes?: MarketNote[];
  /** When the snapshot was taken (copy time) — passed in so the serializer
   *  stays pure. */
  generatedAt: Date;
}

const pct = (f: number): string => `${num(f * 100, 2)}%`;
/** Two places always — a derived premium reads as a measurement, and never
 *  collapses into the round constant it is being checked against. */
const pct2 = (f: number): string => `${(f * 100).toFixed(2)}%`;

export function polarisPositionToMarkdown(args: PolarisPositionMarkdownArgs): string {
  const { view, chain, events, generatedAt } = args;
  const live = chain && !chain.chainStale ? chain : null;
  const stable = view.stableSymbol;
  const lines: string[] = [];

  lines.push(`# Polaris (Sepolia testnet) ${stable} CDP #${view.cdpId}`);
  lines.push("");
  lines.push(
    `> Point-in-time snapshot generated ${fmtUtc(generatedAt.getTime() / 1000)}. ` +
      `SEPOLIA TESTNET: every figure here is a test figure — the tokens are test tokens and the prices come from ` +
      `the protocol's own testnet oracles. The position is a CDP NFT in the ${stable} market; the holder is whoever ` +
      `holds the NFT. ALL UNITS ARE NATIVE: collateral in pETH (the protocol's bonding-curve wrapper of ETH), debt in ` +
      `${stable}. Rates are algorithmic — set by the market, not chosen by the holder. Interest accrues continuously ` +
      `and is written into the debt at each touch; stability gains, reward pETH and the PSM's pro-rata shares are ` +
      `applied the same way. Not financial advice.`,
  );
  lines.push("");

  // The notes as the PAGE places them: anchored against this same event
  // list, so a note the timeline drops is absent here too, and the
  // annotation below lands on the row the note renders beside on screen.
  const anchoredNotes = anchorMarketNotes(args.notes ?? [], events, "asc");
  const noteList = [...anchoredNotes.values()].flat();
  const allNotes = [...noteList, ...(args.liveNotes ?? [])];

  lines.push(`- **Market:** ${stable}`);
  lines.push(`- **CDP id:** ${view.cdpId}`);
  if (view.owner) lines.push(`- **Holder:** ${view.owner}`);
  lines.push(`- **Status:** ${view.status[0].toUpperCase() + view.status.slice(1)}`);
  const notesLine = marketNotesLine(allNotes);
  if (notesLine) lines.push(notesLine);
  lines.push("");

  if (view.status !== "open") {
    if (view.peakColl > 0) lines.push(`- **Highest recorded collateral:** ${amt(view.peakColl)} pETH`);
    if (view.peakDebt > 0) lines.push(`- **Highest recorded debt:** ${amt(view.peakDebt)} ${stable}`);
    if (view.peakColl > 0 || view.peakDebt > 0) lines.push("");
  } else {
    lines.push(`## Position now`);
    lines.push("");
    lines.push(
      `- **Collateral:** ${amt(view.coll)} pETH${view.collUsd != null ? ` (≈ ${usd(view.collUsd)} by the protocol's own feed)` : ""}`,
    );
    lines.push(`- **Debt:** ${amt(view.debt)} ${stable}`);
    if (view.icr != null)
      lines.push(`- **Collateral ratio:** ${pct(view.icr)}${view.mcr != null ? ` (minimum ${pct(view.mcr)})` : ""}`);
    lines.push("");
  }

  if (live && view.status === "open") {
    lines.push(`## Live chain state (Sepolia block ${live.blockNumber})`);
    lines.push("");
    lines.push(
      `- **Interest rate in force:** ${pct(live.interestRate)} per year (primary ${pct(live.primaryRate)} + secondary ${pct(live.secondaryRate)})`,
    );
    // The same projection the card's Costs figure states, on the same base —
    // the RECORDED debt, which is what the contract accrues on. Naming the
    // base in the line itself is what stops a reader recomputing it against
    // the entire debt printed a few lines above and calling this wrong.
    if (live.recordedDebt > 0)
      lines.push(
        `- **Interest cost at this rate:** ~${amt(live.recordedDebt * live.interestRate)} ${stable} per year, on the debt as recorded (recorded debt × rate)`,
      );
    lines.push(
      `- **Market mode:** ${live.defensiveMode ? "defensive — minimum ratio 150%" : "normal — minimum ratio 115%"}; reserve-to-debt ratio ${num(live.reserveToDebtRatio, 3)}`,
    );
    if (live.accruedInterest > 0)
      lines.push(`- **Interest pending since last touch:** ${amt(live.accruedInterest)} ${stable}`);
    if (live.accruedStables > 0)
      lines.push(
        `- **Stability gain pending:** ${amt(live.accruedStables)} ${stable} (credited against the debt at the next touch)`,
      );
    if (live.bcTokenGain > 0) lines.push(`- **Reward pETH pending:** ${amt(live.bcTokenGain)} pETH`);
    if (live.mintRedeemCollChange !== 0 || live.mintRedeemDebtChange !== 0)
      lines.push(
        `- **PSM share pending:** ${amt(live.mintRedeemCollChange)} pETH / ${amt(live.mintRedeemDebtChange)} ${stable}`,
      );
    if (live.price) {
      lines.push(
        `- **pETH price (protocol feed):** ${amt(live.price.pethInDebt)} ${stable} — bonding curve ${num(live.price.curve, 4)} ETH per pETH × ETH/USD ${usd(live.price.ethUsd)}${live.price.xauUsd != null ? ` ÷ XAU/USD ${usd(live.price.xauUsd)}` : ""}`,
      );
      if (live.entireColl > 0) {
        const equity = live.entireColl * live.price.pethInDebt - live.entireDebt;
        lines.push(
          `- **Equity at the feed:** ${amt(equity)} ${stable} (collateral × feed − debt; a valuation at block ${live.blockNumber}, not a profit)`,
        );
      }
    }
    lines.push("");
  }

  // The live window's two causes — the same sentence the page's "Since its
  // last touch" block states, omitted wherever that block does not render.
  const sinceTouch = live && events.length > 0 ? polarisSinceLastTouch(live, events) : null;
  if (sinceTouch) {
    lines.push("## Since its last touch");
    lines.push("");
    lines.push(polarisSinceLastTouchSentence(sinceTouch, stable));
    lines.push("");
  }

  const lifetime = events.length > 0 ? polarisLifetime(events) : null;
  if (lifetime && lifetime.rows > 0) {
    lines.push("## Lifetime (summed from the CDP's own touches)");
    lines.push("");
    lines.push(`- **Deposited / withdrawn:** ${amt(lifetime.deposited)} / ${amt(lifetime.withdrawn)} pETH`);
    lines.push(`- **Borrowed / repaid:** ${amt(lifetime.borrowed)} / ${amt(lifetime.repaid)} ${stable}`);
    lines.push(`- **Interest charged:** ${amt(lifetime.interestCharged)} ${stable}`);
    lines.push(`- **Stability gains credited:** ${amt(lifetime.stableGains)} ${stable}`);
    lines.push(`- **Reward pETH added:** ${amt(lifetime.rewardPeth)} pETH`);
    lines.push(
      `- **PSM shares:** +${amt(lifetime.collFromPsm)} / −${amt(lifetime.collToPsm)} pETH; +${amt(lifetime.debtFromPsm)} / −${amt(lifetime.debtToPsm)} ${stable}`,
    );
    if (lifetime.collLiquidated > 0 || lifetime.debtLiquidated > 0)
      lines.push(
        `- **Liquidated:** ${amt(lifetime.collLiquidated)} pETH taken, ${amt(lifetime.debtLiquidated)} ${stable} cleared`,
      );
    const psmOutcome = polarisPsmOutcomeSentence(lifetime, stable, live?.price?.pethInDebt);
    if (psmOutcome) lines.push(`- **PSM outcome at the feed:** ${psmOutcome}`);
    lines.push("");
    lines.push(
      "The difference in each unit above is the realised outcome. Converting the two units into one figure " +
        "requires a price for each flow at its own block, which the feed series can supply once a basis is chosen.",
    );
    lines.push("");
  }

  const opened = events[0]?.timestamp;
  const last = events[events.length - 1]?.timestamp;
  lines.push("## Activity");
  if (opened) lines.push(`- **Opened:** ${fmtUtc(opened)}`);
  if (last) lines.push(`- **Last activity:** ${fmtUtc(last)}`);
  lines.push(`- **Events:** ${events.length}`);
  lines.push("");

  lines.push(...marketNotesSection(allNotes));
  lines.push(...liquidationForensicsSection(events, view.market, stable));
  lines.push(...timelineTable(events, stable, anchoredNotes));
  return lines.join("\n");
}

/** The valued breakdown of every liquidation on this CDP — the same legs,
 *  premium and collateral ratio at fire the event card renders, so the export
 *  cannot lag the page. Empty on a CDP that was never liquidated, and on a
 *  liquidation whose block the oracle-at-block lane has not priced. */
function liquidationForensicsSection(events: BaseActivityEvent[], market: PolarisMarket, stable: string): string[] {
  const rows: string[] = [];
  const value = polarisValueFormat(market);
  for (const e of events) {
    if (!isPolarisEvent(e)) continue;
    const d = e.context.data;
    if (d.eventType !== "liquidate") continue;
    const f = polarisLiquidationFigures(d);
    if (!f) continue;
    const constant = POLARIS_LIQ_CONSTANTS[f.path];
    const holder = f.path === "sp" ? "stability pool" : "market's other CDPs";
    rows.push(`### Block ${e.blockNumber} — ${fmtUtc(e.timestamp)}`);
    rows.push("");
    rows.push(`- **Collateral seized (entire):** ${amt(parseFloat(d.collLiquidated ?? "0"))} pETH`);
    rows.push(
      `- **Collateral to the ${holder}:** ${amt(f.leg)} pETH — the seized total less the owner's surplus (${amt(parseFloat(d.collSurplus ?? "0"))} pETH) and the liquidator's collateral compensation (${amt(parseFloat(d.collateralComp ?? "0"))} pETH)`,
    );
    rows.push(`- **pETH price at that block:** ${value(f.priceInDebt)} ${stable} (the market's own feed)`);
    rows.push(`- **That leg valued at the block:** ${value(f.legValue)} ${stable}`);
    rows.push(`- **Debt cleared:** ${value(f.cleared)} ${stable} at face`);
    rows.push(
      `- **Premium:** ${pct2(f.premium)} — the leg's value over the debt it cleared, minus one; the cdpManager's own \`${constant.fn}\` is ${constant.label}`,
    );
    rows.push(
      `- **Collateral ratio at liquidation:** ${pct2(f.icrAtFire)} — the ENTIRE seized collateral at the same price over the same debt, against the market's normal-mode minimum of ${POLARIS_LIQ_CONSTANTS.mcr.label}`,
    );
    rows.push("");
  }
  if (rows.length === 0) return [];
  return [
    "## Liquidation",
    "",
    `Every figure below is in the market's own unit (${stable}), never dollars: the market prices pETH in its own ` +
      "stablecoin and nothing here converts it further. The collateral leg is valued at the market's own price feed " +
      "read at the liquidation's own block, and the debt is taken at the face the protocol's own collateral-ratio " +
      "math uses. The premium is measured on the leg the penalty applies to, not on the whole seized amount — the " +
      "whole amount over the same debt is the collateral ratio at the moment the liquidation fired, stated " +
      "separately.",
    "",
    ...rows,
  ];
}

/** One line stating that notes exist, and where to read them. Null when this
 *  CDP has none. */
function marketNotesLine(notes: MarketNote[]): string | null {
  if (notes.length === 0) return null;
  if (notes.length === 1) return `- **Market notes:** 1 — ${marketNoteHeadline(notes[0])} (see below)`;
  return `- **Market notes:** ${notes.length} — stretches where the market's primary rate or its price feed moved between two of this CDP's own touches, and the live readings since its last touch (see below)`;
}

/** The notes' own section: one paragraph each, with the two touches (and, when
 *  observed, the PrimaryRateSet log) the fact was read from. Placed before the
 *  timeline table, like Liquity V2's price-gap notes. */
function marketNotesSection(notes: MarketNote[]): string[] {
  if (notes.length === 0) return [];
  const out: string[] = ["## Market notes", ""];
  out.push(
    "Each note is a receipted fact about the market this CDP borrows in, observed between two of the CDP's own " +
      "touches and stated between them, or between its last touch and the chain head for a live note. A note is " +
      "not an event: it is counted in no total in this snapshot, and the timeline table below reads exactly as it " +
      "would without any of them. Neither quantity is fetched for a historical note — every touch on this CDP " +
      "already carries the market's primary rate in force at its block, and every priced touch carries the feed's " +
      "price at its block; a live note's later end is read from the market's own contracts at the head. The " +
      "derived figures hold the earlier touch's own debt and collateral fixed and move only the rate or the " +
      "price, so the later one is what that state came to be worth, not a second reading of the CDP. A rate note " +
      "leads with the rate at its later end — what the market charged by then — and consecutive stretches that " +
      "moved the rate the same way are stated as one note, from the first touch to the last, with each step it " +
      "took in named on its receipt.",
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
  stable: string,
  /** The notes anchored to a row here, keyed by that row's event id — they
   *  annotate the row's last cell and change nothing else: the numbering,
   *  the row count and every figure read as they would with no notes at
   *  all. */
  anchoredNotes: ReadonlyMap<string, MarketNote[]>,
): string[] {
  const out: string[] = [];
  out.push("## Timeline");
  out.push("");
  if (events.length === 0) {
    out.push("_No captured history yet — the indexed backend for this explorer is still being filled._");
    return out;
  }
  out.push(
    `| # | Date | Action | Collateral after (pETH) | Debt after (${stable}) | Interest charged | PSM share (pETH / ${stable}) | pETH price at block (${stable}) | Collateral ratio at block | Transaction |`,
  );
  out.push(
    "|---|------|--------|-------------------------|------------------------|------------------|-------------------------------|----------------------------------|---------------------------|-------------|",
  );
  events.forEach((e, i) => {
    if (!isPolarisEvent(e)) return;
    const d = e.context.data;
    const coll = d.newColl != null ? amt(parseFloat(d.newColl)) : "—";
    const debt = d.newDebt != null ? amt(parseFloat(d.newDebt)) : "—";
    const interest = d.accruedInterest != null ? amt(parseFloat(d.accruedInterest)) : "—";
    // The CDP's settled pro-rata share of the market's PSM mints (+) and
    // redemptions (−) at this touch — signed, "—" when this touch carried
    // none.
    const mrColl = d.mintRedeemCollGain != null ? parseFloat(d.mintRedeemCollGain) : 0;
    const mrDebt = d.mintRedeemDebtGain != null ? parseFloat(d.mintRedeemDebtGain) : 0;
    const psm =
      mrColl !== 0 || mrDebt !== 0
        ? `${mrColl >= 0 ? "+" : "−"}${amt(Math.abs(mrColl))} / ${mrDebt >= 0 ? "+" : "−"}${amt(Math.abs(mrDebt))}`
        : "—";
    // The oracle-at-block lane's feed price at this touch's own block — the
    // feed at the END of the block (§1 of the build plan), "—" unfilled.
    const priceAtBlock = d.priceAtBlock != null ? amt(d.priceAtBlock.pethInDebt) : "—";
    // The CDP's collateral ratio at this row: the resulting figures at that
    // same price, or the ratio at fire on a liquidation (the same figure the
    // Liquidation section states), "—" where the lane has no price or the
    // row leaves no debt. The same function the card reads.
    const cr = polarisCrAtEvent(d);
    const ratioAtBlock = cr ? crPct2(cr.pct) : "—";
    const noted = (anchoredNotes.get(e.id) ?? []).map(marketNoteRowAnnotation).join("; ");
    out.push(
      `| ${i + 1} | ${fmtUtc(e.timestamp)} | ${e.actionLabel} | ${coll} | ${debt} | ${interest} | ${psm} | ${priceAtBlock} | ${ratioAtBlock} | ${txCell(e)}${noted ? ` — ${noted}` : ""} |`,
    );
  });
  out.push("");
  out.push(
    "_Collateral after / Debt after are the CDP's resulting figures on each touch, as the cdpManager emitted them. A transfer row moves custody only. A liquidation row's debt and collateral went to the stability pool or were redistributed. pETH price at block is the market's own price feed at the END of that block, from the oracle-at-block lane — not necessarily the price the row's own transaction saw. Collateral ratio at block is the resulting collateral at that price over the resulting debt; on a liquidation row it is the ratio at the moment the liquidation fired, the entire seized collateral over the debt cleared; a row without a price, or without debt after it, carries none._",
  );
  out.push("");
  return out;
}
