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
import { formatPolarisRatio } from "@/lib/polaris/ratio-format";
import {
  polarisEquityAtFeed,
  polarisLifetime,
  polarisPendingAtFeed,
  polarisPsmShareValue,
} from "@/lib/polaris/economics";
import { polarisPsmOutcomeSentence } from "@/lib/polaris/economics-explanation";
import {
  polarisSinceLabel,
  polarisSinceLastTouch,
  polarisSinceLastTouchSentence,
} from "@/lib/polaris/since-last-touch";
import { polarisAgainstHolding, againstHoldingText, isAgainstHoldingNone } from "@/lib/polaris/against-holding";
import { formatPeth } from "@/lib/polaris/figure-format";
import { num, amt, usd, fmtUtc, txCell } from "@/lib/shared/position-markdown";
import {
  anchorMarketNotes,
  marketNoteHeadline,
  marketNoteReceiptLine,
  marketNoteRowAnnotation,
  marketNoteSentence,
  formatRatePercent,
  mergePsmGapRanges,
  RATE_STEP_MIN_PP,
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
  /** This CDP's live note (lib/shared/market-note.ts's `liveRateStepNote`) —
   *  the market's primary rate read at the chain head, against this CDP's own
   *  newest touch that carries one.
   *  Never anchored (the later end is the chain head, past every touch's
   *  block) and never in the timeline table; listed alongside the historical
   *  notes in the "Market notes" section only. */
  liveNotes?: MarketNote[];
  /** The head read is still in flight: the page offers the export as soon as
   *  the index answers, before the live read lands. */
  livePending?: boolean;
  /** When the snapshot was taken (copy time) — passed in so the serializer
   *  stays pure. */
  generatedAt: Date;
}

const pct = (f: number): string => `${num(f * 100, 2)}%`;
/** A signed native amount, the real minus and an explicit plus. */
const sAmt = (n: number): string => `${n < 0 ? "−" : "+"}${amt(Math.abs(n))}`;
/** Two places always — a derived premium reads as a measurement, and never
 *  collapses into the round constant it is being checked against. */
const pct2 = (f: number): string => `${(f * 100).toFixed(2)}%`;

export function polarisPositionToMarkdown(args: PolarisPositionMarkdownArgs): string {
  const { view, chain, events, generatedAt } = args;
  const live = chain && !chain.chainStale ? chain : null;
  const stable = view.stableSymbol;
  const lines: string[] = [];

  lines.push(`# Polaris (Sepolia testnet) ${stable} position #${view.cdpId}`);
  lines.push("");
  lines.push(
    `> Point-in-time snapshot generated ${fmtUtc(generatedAt.getTime() / 1000)}. ` +
      `SEPOLIA TESTNET: every figure here is a test figure — the tokens are test tokens and the prices come from ` +
      `the protocol's own testnet oracles. The position is an NFT in the ${stable} market; the holder is whoever ` +
      `holds the NFT. ALL UNITS ARE NATIVE: collateral in pETH (the protocol's own collateral token, bought with ETH from its bonding curve), debt in ` +
      `${stable}. Rates are algorithmic, set by the market. Interest accrues continuously ` +
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
  lines.push(`- **Position id:** ${stable} #${view.cdpId}`);
  if (view.owner) lines.push(`- **Holder:** ${view.owner}`);
  lines.push(`- **Status:** ${view.status[0].toUpperCase() + view.status.slice(1)}`);
  // The PSM's trades between touches (ui-jobs 402) are counted on their own
  // line; "Market notes" counts the rate's.
  const psmGaps = allNotes.filter((n) => n.kind === "psm-gap");
  const notesLine = marketNotesLine(allNotes.filter((n) => n.kind !== "psm-gap"));
  if (notesLine) lines.push(notesLine);
  if (psmGaps.length > 0)
    lines.push(
      `- **PSM trades between touches:** ${psmGaps.length} — gaps whose closing touch wrote this position's PSM share (see below)`,
    );
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
    lines.push(
      view.debt > 0
        ? `- **Debt:** ${amt(view.debt)} ${stable}`
        : `- **Debt:** none${view.recordedDebt != null && view.recordedDebt > 0 ? ` (the pending legs exceed the ${amt(view.recordedDebt)} ${stable} recorded at the last touch; the next touch settles it to zero)` : ""}`,
    );
    if (view.icr != null)
      lines.push(
        `- **Collateral ratio:** ${formatPolarisRatio(view.icr, 1, view.mcr ?? undefined)}${view.mcr != null ? ` (minimum ${pct(view.mcr)})` : ""}`,
      );
    lines.push("");
  }

  if (live && view.status === "open") {
    lines.push(`## Live chain state (Sepolia block ${live.blockNumber})`);
    lines.push("");
    lines.push(
      `- **Interest rate in force:** ${pct(live.interestRate)} per year (${pct(live.primaryRate)} primary + ${pct(live.secondaryRate)} safety)`,
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
        `- **PSM share pending:** ${sAmt(live.mintRedeemCollChange)} pETH / ${sAmt(live.mintRedeemDebtChange)} ${stable}`,
      );
    if (live.price) {
      // The card's "Pending to settle": the four legs above netted at the feed.
      const p = polarisPendingAtFeed(live, live.price.pethInDebt);
      if ([p.interest, p.stabilityGain, p.psm, p.reward].some((x) => x !== 0))
        lines.push(
          `- **Pending to settle:** ${sAmt(p.total)} ${stable} at the feed (interest ${sAmt(p.interest)}, stability gain ${sAmt(p.stabilityGain)}, PSM share ${sAmt(p.psm)}, reward pETH ${sAmt(p.reward)}, each in ${stable})`,
        );
    }
    if (live.price) {
      lines.push(
        `- **pETH price (protocol feed):** ${amt(live.price.pethInDebt)} ${stable} — bonding curve ${num(live.price.curve, 4)} ETH per pETH × ETH/USD ${usd(live.price.ethUsd)}${live.price.xauUsd != null ? ` ÷ XAU/USD ${usd(live.price.xauUsd)}` : ""}`,
      );
      if (live.entireColl > 0) {
        const equity = polarisEquityAtFeed(live.entireColl, live.entireDebt, live.price.pethInDebt);
        lines.push(
          `- **Equity at the feed:** ${amt(equity)} ${stable} (collateral × feed − debt; a debt below zero is owed to the holder and adds to it; a valuation at block ${live.blockNumber}, not a profit)`,
        );
      }
    }
    lines.push("");
  }

  // The live window's two causes — the same sentence the page's "Since its
  // last touch" row states ("Since its open" where the last touch is the
  // open), omitted wherever that row does not render.
  const sinceTouch = live && events.length > 0 ? polarisSinceLastTouch(live, events) : null;
  if (sinceTouch) {
    lines.push(`## ${polarisSinceLabel(sinceTouch)}`);
    lines.push("");
    lines.push(polarisSinceLastTouchSentence(sinceTouch, stable));
    lines.push("");
  }

  lines.push(...againstHoldingSection(events, chain, stable, args.livePending === true));

  const lifetime = events.length > 0 ? polarisLifetime(events) : null;
  if (lifetime && lifetime.rows > 0) {
    lines.push("## Lifetime (summed from the position's own touches)");
    lines.push("");
    lines.push(`- **Deposited / withdrawn:** ${amt(lifetime.deposited)} / ${amt(lifetime.withdrawn)} pETH`);
    lines.push(`- **Borrowed / repaid:** ${amt(lifetime.borrowed)} / ${amt(lifetime.repaid)} ${stable}`);
    lines.push(`- **Interest charged:** ${amt(lifetime.interestCharged)} ${stable}`);
    lines.push(`- **Stability gains since open:** ${amt(lifetime.stableGains)} ${stable}`);
    lines.push(`- **Reward pETH added:** ${amt(lifetime.rewardPeth)} pETH`);
    lines.push(
      `- **Net PSM shares:** +${amt(lifetime.collFromPsm)} / −${amt(lifetime.collToPsm)} pETH; +${amt(lifetime.debtFromPsm)} / −${amt(lifetime.debtToPsm)} ${stable}`,
    );
    if (lifetime.mintedToSettle > 0)
      lines.push(
        `- **Minted to the holder:** ${amt(lifetime.mintedToSettle)} ${stable}, where the debt had gone below zero (Σ \`_stablesMintedToEnsureZeroDebt\`)`,
      );
    if (lifetime.collLiquidated > 0 || lifetime.debtLiquidated > 0)
      lines.push(
        `- **Liquidated:** ${amt(lifetime.collLiquidated)} pETH taken, ${amt(lifetime.debtLiquidated)} ${stable} cleared`,
      );
    const psmOutcome = polarisPsmOutcomeSentence(lifetime, stable, live?.price?.pethInDebt);
    // Its "at the latest block's feed price" figure is the card's stat of
    // the same name.
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

  lines.push(
    ...marketNotesSection(
      allNotes,
      missingRateNotes(events, chain, view.status === "open", args.notes ?? [], args.liveNotes ?? []),
    ),
  );
  lines.push(...liquidationForensicsSection(events, view.market, stable));
  lines.push(...timelineTable(events, stable, anchoredNotes));
  return lines.join("\n");
}

/** "Against holding pETH" (ui-jobs 695): the page's figure, its terms, and
 *  the feed and block it was valued at; where it is not stated, why. */
function againstHoldingSection(
  events: BaseActivityEvent[],
  chain: PolarisChainResponse | null,
  stable: string,
  livePending: boolean,
): string[] {
  const r = polarisAgainstHolding(events, chain);
  if (r == null) return [];
  const out = ["## Against holding pETH", ""];
  if (isAgainstHoldingNone(r)) {
    out.push(
      r.none === "live-read"
        ? livePending
          ? "The live read was still loading, so this snapshot carries no figure against holding pETH."
          : "The live read was unavailable, so this snapshot carries no figure against holding pETH."
        : "The index has not reached the position's latest touch, so this snapshot carries no figure against holding pETH.",
      "",
    );
    return out;
  }
  const surplus = r.surplusClaimed + r.surplusOwed;
  out.push(
    `- **Against holding pETH:** ${againstHoldingText(r, formatPeth)}`,
    `- **Formula:** (collateral now + withdrawn + surplus − escrow lost − deposited) + (borrowed + settled − repaid − debt now) ÷ feed`,
    `- **Collateral now:** ${amt(r.collNow)} pETH${r.closed ? " (closed)" : ` (getCDPEntireColl at block ${r.feed.block})`}`,
    `- **Withdrawn / deposited:** ${amt(r.withdrawn)} / ${amt(r.deposited)} pETH`,
  );
  if (surplus > 0)
    out.push(
      `- **Liquidation surplus:** ${amt(surplus)} pETH${r.surplusOwed > 0 ? ` (${amt(r.surplusOwed)} still to claim, counted as held)` : " (claimed)"}`,
    );
  if (r.escrowLost > 0)
    out.push(
      `- **Gas compensation escrow lost:** ${amt(r.escrowLost)} pETH (paid to the liquidator, the LiquidationGasComp log's _flatComp)`,
    );
  out.push(
    `- **Borrowed / repaid:** ${amt(r.borrowed)} / ${amt(r.repaid)} ${stable}`,
    ...(r.settled > 0
      ? [`- **Settled to the holder:** ${amt(r.settled)} ${stable} minted to the holder where a debt went below zero`]
      : []),
    `- **Debt now:** ${amt(r.debtNow)} ${stable}${r.closed ? " (closed)" : ` (getCDPEntireDebt at block ${r.feed.block}${r.debtNow < 0 ? ", below zero: the next touch mints it to the holder" : ""})`}`,
    `- **Feed:** ${amt(r.feed.pethInDebt)} ${stable} per pETH (previewPrice() at block ${r.feed.block})`,
    `- **Terms:** ${sAmt(r.collTerm)} pETH on the collateral side, ${sAmt(r.debtTerm)} ${stable} on the debt side (${sAmt(r.debtTermPeth)} pETH at the feed)`,
    "",
    "Interest, stability gains, reward pETH and PSM shares are in the collateral and debt now. The gas compensation " +
      "escrow is held outside the collateral: a close returns it, and a liquidation pays it to the liquidator, so it " +
      "counts only on a liquidated position.",
    "",
  );
  return out;
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
    const holder = f.path === "sp" ? "stability pool" : "market's other positions";
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
  return `- **Market notes:** ${notes.length} — stretches where the market's primary rate moved between two of this position's touches, and the live reading since its last touch (see below)`;
}

/** The notes' own section: one paragraph each, with the two touches (and, when
 *  observed, the PrimaryRateSet log) the fact was read from. Placed before the
 *  timeline table. */
function marketNotesSection(notes: MarketNote[], missing: string[]): string[] {
  if (notes.length === 0 && missing.length === 0) return [];
  const out: string[] = ["## Market notes", ""];
  if (notes.length === 0) return [...out, ...missing.flatMap((l) => [l, ""])];
  out.push(
    "Each note is a receipted fact about the market this position borrows in, observed between two of the position's own " +
      "touches and stated between them, or between its last touch and the chain head for a live note. A note is " +
      "not an event: this snapshot's totals leave it out, and the timeline table below reads as it " +
      "would without any of them. The rate is not fetched for a historical note — every touch on this position " +
      "already carries the market's primary rate in force at its block; a live note's later end is read from the " +
      "market's own contracts at the head. The derived figures hold the earlier touch's debt fixed and move " +
      "only the rate, so the later one is what that debt came to cost. A note " +
      "leads with the rate at its later end — what the market charged by then — and consecutive stretches that " +
      "moved the rate the same way are stated as one note, from the first touch to the last, with each step it " +
      "took in named on its receipt. PSM gaps that meet end to end are stated as one note the same way, with each " +
      "touch's share on its receipt.",
  );
  out.push("");
  // PSM gaps that meet end to end are stated once over their whole range
  // (ui-jobs 692), so a busy position's trades read as a few paragraphs.
  for (const n of mergePsmGapRanges(notes)) {
    out.push(marketNoteSentence(n));
    out.push("");
    out.push(marketNoteReceiptLine(n));
    out.push("");
  }
  for (const l of missing) out.push(l, "");
  return out;
}

/** Why a rate note the section could hold is not in it (ui-jobs 693): no
 *  touch carries the market's primary rate, the rate never moved enough
 *  between touches, or the live read did not answer or saw no move. The
 *  section states each instead of dropping out. */
function missingRateNotes(
  events: BaseActivityEvent[],
  chain: PolarisChainResponse | null,
  open: boolean,
  notes: readonly MarketNote[],
  liveNotes: readonly MarketNote[],
): string[] {
  const touches = events.filter(isPolarisEvent).filter((e) => e.context.data.eventType !== "transfer");
  const rated = touches.filter((e) => e.context.data.primaryRate != null);
  const out: string[] = [];
  if (touches.length > 0 && rated.length === 0)
    out.push(
      touches.length === 1
        ? "This position opened before the market set its first primary rate, so there is no rate at open."
        : "Every touch on this position came before the market set its first primary rate, so no touch carries a rate to compare.",
    );
  else if (rated.length === 1)
    out.push(
      "Only one of this position's touches carries the market's primary rate, so no two touches can be compared.",
    );
  else if (rated.length > 1 && !notes.some((n) => n.kind === "rate-step"))
    out.push(
      `Between this position's touches the market's primary rate never moved by ${RATE_STEP_MIN_PP} percentage point or more.`,
    );
  if (!open) return out;
  // The page's live-note gate (position-view.tsx): a fresh head read of an
  // open position, with a price.
  const answered = chain != null && !chain.chainStale && chain.isOpen && chain.price != null;
  if (!answered) out.push("The live read was unavailable, so this snapshot carries no live rate note.");
  else if (rated.length > 0 && !liveNotes.some((n) => n.kind === "rate-step"))
    out.push(
      `At the latest block ${chain.blockNumber.toLocaleString("en-US")} the market's primary rate is ` +
        `${formatRatePercent(chain.primaryRate)} per year, unchanged to two places since this position's last touch.`,
    );
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
    out.push("_No captured history yet — the indexed backend for this explorer is still being built._");
    return out;
  }
  out.push(
    `| # | Date | Action | Collateral after (pETH) | Debt after (${stable}) | Interest charged | PSM share (pETH / ${stable}) | PSM share at block price (${stable}) | Minted to the holder (${stable}) | pETH price at block (${stable}) | Collateral ratio at block | Transaction |`,
  );
  out.push(
    "|---|------|--------|-------------------------|------------------------|------------------|-------------------------------|------------------------------------|----------------------|----------------------------------|---------------------------|-------------|",
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
    const psm = mrColl !== 0 || mrDebt !== 0 ? `${sAmt(mrColl)} / ${sAmt(mrDebt)}` : "—";
    // The row face's one figure: the two legs netted at the row's price at
    // block, "—" with no share or no price.
    const psmNet =
      (mrColl !== 0 || mrDebt !== 0) && d.priceAtBlock != null
        ? sAmt(polarisPsmShareValue(mrColl, mrDebt, d.priceAtBlock.pethInDebt))
        : "—";
    // The oracle-at-block lane's feed price at this touch's own block — the
    // feed at the END of the block (§1 of the build plan), "—" unfilled.
    const priceAtBlock = d.priceAtBlock != null ? amt(d.priceAtBlock.pethInDebt) : "—";
    // The stables this touch minted to the holder (a debt below zero), "—"
    // where it minted none.
    const mintedN = d.stablesMintedToEnsureZeroDebt != null ? parseFloat(d.stablesMintedToEnsureZeroDebt) : 0;
    const minted = mintedN > 0 ? amt(mintedN) : "—";
    // The CDP's collateral ratio at this row: the resulting figures at that
    // same price, or the ratio at fire on a liquidation (the same figure the
    // Liquidation section states), "—" where the lane has no price or the
    // row leaves no debt. The same function the card reads.
    const cr = polarisCrAtEvent(d);
    const ratioAtBlock = cr ? crPct2(cr.pct) : "—";
    const noted = (anchoredNotes.get(e.id) ?? []).map(marketNoteRowAnnotation).join("; ");
    out.push(
      `| ${i + 1} | ${fmtUtc(e.timestamp)} | ${e.actionLabel} | ${coll} | ${debt} | ${interest} | ${psm} | ${psmNet} | ${minted} | ${priceAtBlock} | ${ratioAtBlock} | ${txCell(e)}${noted ? ` — ${noted}` : ""} |`,
    );
  });
  out.push("");
  out.push(
    "_Collateral after / Debt after are the position's resulting figures on each touch, as the cdpManager emitted them. A transfer row moves custody only. A liquidation row's debt and collateral went to the stability pool or were redistributed. pETH price at block is the market's own price feed at the END of that block, from the oracle-at-block lane — not necessarily the price the row's own transaction saw. PSM share at block price is the pETH leg at that price less the debt leg, the one figure the row's face states. Minted to the holder is the CDPUpdated log's \`_stablesMintedToEnsureZeroDebt\`: where the debt had gone below zero, the touch minted the difference to the holder (a Transfer from 0x0 in the same transaction) and wrote the debt at zero. Collateral ratio at block is the resulting collateral at that price over the resulting debt; on a liquidation row it is the ratio at the moment the liquidation fired, the entire seized collateral over the debt cleared; a row without a price, or without debt after it, carries none._",
  );
  out.push("");
  return out;
}
