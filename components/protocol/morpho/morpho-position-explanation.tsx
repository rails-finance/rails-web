"use client";

// The Morpho position card's explanation (zone Z1): a colon-terminated lead,
// then bullets under Holdings, Risk, Rate and History when two of them hold
// two or more bullets (rails-ops standards/prose-limits-and-zones.md 3.3). The
// words are content/morpho/event-prose.yaml's `position_words`; this file
// chooses which to say and draws each figure as the card does (its receipt, or
// the card's amount format). The open position's figures are the chain read at
// head; an ended position's are its replayed record. The mechanisms behind
// them are the card's "?" (position_* in the same file).
//
// Every figure is a value shown on the cards around the pane, in the loan
// token (the market oracle's numeraire); Morpho has no USD.

import type { ReactNode } from "react";
import type { MorphoChainPositionResponse } from "@/lib/api/fetch-morpho-position";
import { operatorLead, type ExternalActorSummary } from "@/lib/shared/external-actor";
import { useEnsName } from "@/lib/ens/use-ens-names";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { AmountText } from "@/components/shared/amount-text";
import { arrangeByHeading } from "@/lib/shared/event-prose/nodes";
import { MORPHO_WORDS, positionWords } from "@/lib/morpho/event-templates";
import { positionNodes } from "@/lib/morpho/position-nodes";
import { isMorphoEvent, type BaseActivityEvent } from "@/lib/shared/types/event-shape";
import type { MorphoPositionView } from "./morpho-position-card";
import type { ServedFolder } from "@/lib/shared/timeline-folder";
import { newestActivityFolder } from "@/lib/shared/timeline-folder-reductions";

const GROUPS = ["holdings", "risk", "rate", "history"] as const;
type Group = (typeof GROUPS)[number];
type Bullet = { group: Group; node: ReactNode };

const arrange = (bullets: Bullet[]) => {
  const heading: Record<Group, string> = {
    holdings: positionWords("heading_holdings"),
    risk: positionWords("heading_risk"),
    rate: positionWords("heading_rate"),
    history: positionWords("heading_history"),
  };
  return arrangeByHeading(bullets, GROUPS, (g) => heading[g]);
};

const bulletOf = (group: Group, key: string, node: ReactNode): Bullet => ({
  group,
  node: <span key={key}>{node}</span>,
});

/** "3 times", "once", or "at least once" where the count is not known. */
const timesText = (n: number | null): string =>
  n == null || n <= 0
    ? MORPHO_WORDS.seizures_some
    : n === 1
      ? MORPHO_WORDS.seizures_once
      : `${n.toLocaleString("en-US")} ${MORPHO_WORDS.seizures_times}`;

const txWord = (n: number) => (n === 1 ? MORPHO_WORDS.tx_one : MORPHO_WORDS.tx_many);
const eventWord = (n: number) => (n === 1 ? MORPHO_WORDS.event_one : MORPHO_WORDS.event_many);

/** The owner's transactions and the events the timeline lists from them. */
function countsBullet(txCount: number, eventsFromThem: number | null): ReactNode {
  return eventsFromThem != null && eventsFromThem >= txCount
    ? positionNodes("counts", {
        tx_count: <H>{txCount.toLocaleString("en-US")}</H>,
        tx_word: txWord(txCount),
        event_count: eventsFromThem.toLocaleString("en-US"),
        event_word: eventWord(eventsFromThem),
      })
    : positionNodes("counts_tx", {
        tx_count: <H>{txCount.toLocaleString("en-US")}</H>,
        tx_word: txWord(txCount),
      });
}

export function MorphoPositionExplanation({
  chain,
  txCount,
  eventCount,
  liquidationCount,
  everLiquidated,
  externalActivity,
}: {
  chain: MorphoChainPositionResponse;
  /** The timeline's event count, and how many of those are liquidations.
   *  Omit where the page cannot count the whole history. */
  eventCount?: number;
  liquidationCount?: number;
  /** The card's owner-transaction count (the activity chip's figure: DISTINCT
   *  txs excluding liquidation rows). Omit to skip. */
  txCount?: number;
  /** Whether the record carries liquidation seizures (the chip's flag). */
  everLiquidated?: boolean;
  /** Who executed the position's events: the timeline's externalActor()
   *  verdict, reduced over the whole history. Omit to skip the operator fact. */
  externalActivity?: ExternalActorSummary;
}) {
  // The two leading actors, reverse-resolved. A fixed pair of calls (rules of
  // hooks), which is also all the prose can name without becoming a list.
  const leadName = useEnsName(externalActivity?.actors[0]?.address ?? null);
  if (chain.chainStale) return null;

  const hasDebt = chain.currentDebt > 0;
  const hasColl = chain.collateral > 0;
  const hf = chain.healthFactor;
  const dropPct = hf != null && hf > 1 ? Math.round((1 - 1 / hf) * 100) : null;
  const loan = chain.loanSymbol;
  const coll = chain.collateralSymbol;

  // The status lead: subject-first, one sentence, colon-terminated.
  let lead: ReactNode = null;
  if (hasDebt) {
    lead = positionNodes("lead_debt", {
      debt: (
        <H>
          <AmountText value={chain.currentDebt} />
        </H>
      ),
      loan_symbol: loan,
      coll: (
        <H>
          <AmountText value={chain.collateral} />
        </H>
      ),
      coll_symbol: coll,
    });
  } else if (hasColl) {
    lead = positionNodes("lead_collateral", {
      coll: (
        <H>
          <AmountText value={chain.collateral} />
        </H>
      ),
      coll_symbol: coll,
    });
  }

  const bullets: Bullet[] = [];

  if (hasDebt)
    bullets.push(
      bulletOf(
        "holdings",
        "worth",
        positionNodes("coll_worth", { coll_value: <AmountText value={chain.collateralValue} />, loan_symbol: loan }),
      ),
    );

  if (hasColl && !hasDebt) bullets.push(bulletOf("risk", "no-debt", positionNodes("no_debt")));

  if (hasDebt && hf != null) {
    const health =
      hf < 1
        ? positionNodes("health_below", { hf: hf.toFixed(2) })
        : dropPct != null && dropPct > 0
          ? positionNodes("health_drop", { hf: hf.toFixed(2), coll_symbol: coll, drop: <H>{dropPct}%</H> })
          : null;
    if (health) bullets.push(bulletOf("risk", "health", health));
  }

  if (hasDebt && chain.maxBorrow > chain.currentDebt)
    bullets.push(
      bulletOf(
        "risk",
        "capacity",
        positionNodes("capacity", {
          capacity: <AmountText value={chain.maxBorrow - chain.currentDebt} />,
          loan_symbol: loan,
        }),
      ),
    );
  else if (hasColl && !hasDebt && chain.maxBorrow > 0)
    bullets.push(
      bulletOf(
        "risk",
        "capacity",
        positionNodes("capacity_idle", { capacity: <AmountText value={chain.maxBorrow} />, loan_symbol: loan }),
      ),
    );

  if (hasDebt)
    bullets.push(
      bulletOf("risk", "penalty", positionNodes("penalty", { penalty: `${((chain.lif - 1) * 100).toFixed(2)}%` })),
    );

  if (hasDebt && chain.borrowApr > 0)
    bullets.push(
      bulletOf(
        "rate",
        "rate",
        positionNodes("rate", {
          apr: `${(chain.borrowApr * 100).toFixed(2)}%`,
          cost: <AmountText value={chain.currentDebt * chain.borrowApr} />,
          loan_symbol: loan,
        }),
      ),
    );

  // The counts, said plainly: the owner's transactions behind the timeline's
  // events (one transaction can carry several), and the liquidations, which
  // are done to the position.
  if (txCount != null && txCount > 0) {
    const ownEvents = eventCount != null ? eventCount - (liquidationCount ?? 0) : null;
    bullets.push(bulletOf("history", "tx-count", countsBullet(txCount, ownEvents)));
  }
  if ((liquidationCount ?? 0) > 0 || everLiquidated)
    bullets.push(
      bulletOf(
        "history",
        "liquidated",
        positionNodes("liquidated_count", { seizures: timesText(liquidationCount ?? null) }),
      ),
    );

  // Who has been operating the position. It sits beside the counts: a position
  // run by an authorised account reads as alarming until the reader is told
  // the owner granted it (the card's "?" says how). The denominator comes
  // from operatorLead, which compares events with the transactions beside it.
  const ext = externalActivity;
  if (ext && ext.external > 0) {
    const lead = operatorLead(ext, null, MORPHO_WORDS.operators_where);
    const external = ext.external.toLocaleString("en-US");
    const external_word = ext.external === 1 ? MORPHO_WORDS.external_one : MORPHO_WORDS.external_many;
    bullets.push(
      bulletOf(
        "history",
        "operators",
        leadName && ext.actors.length === 1
          ? positionNodes("operators_all", { lead, external, external_word, name: leadName })
          : leadName
            ? positionNodes("operators_most", { lead, external, external_word, name: leadName })
            : positionNodes("operators", { lead, external, external_word }),
      ),
    );
  }

  if (lead == null && bullets.length === 0) return null;

  return <ProseExplainer paragraph={lead} items={arrange(bullets)} />;
}

// ── the terminal pane: a closed or liquidated position narrated from the
// replay and the timeline already on the page (no chain overlay needed) ──────

export function MorphoClosedPositionExplanation({
  v,
  events,
  folders,
  eventCount,
  liquidationCount,
}: {
  v: MorphoPositionView;
  /** The timeline's whole event count; omit where the page cannot count it. */
  eventCount?: number;
  /** The liquidations in the whole history: the loaded rows plus the members
   *  of every served liquidation folder. Omit where the page cannot count the
   *  whole history; the pane then states no number. */
  liquidationCount?: number;
  /** The position's timeline (morpho events, ascending): the pane reads how
   *  the record ended from the rows already fetched. */
  events: BaseActivityEvent[];
  /** Every folder the index served, whole and unfiltered: the position's
   *  newest activity can sit inside one, so the closure attribution below
   *  reads it before falling back to the last loaded row. */
  folders?: readonly ServedFolder[] | null;
}) {
  if (v.status === "open") return null;

  const morpho = events.filter(isMorphoEvent);
  const liqCount = liquidationCount;
  // The newest activity overall: a served folder's last member when it is
  // newer than every loaded row, the loaded row otherwise. Morpho's two
  // folder kinds are `liquidation` (pure seizures) and `owner_run` (the
  // position's supply, withdraw, borrow and repay), so `kind` alone says which
  // one ended it.
  const newestFolder = newestActivityFolder(morpho, folders);
  const lastType = newestFolder ? null : morpho.length > 0 ? morpho[morpho.length - 1].context.data.eventType : null;
  // How the record ended: the liquidated status only says seizures exist
  // somewhere in the record (709 of 1,535 liquidated-status positions ended
  // with the seizure; the rest were closed by the owner afterwards).
  const endedBySeizure = newestFolder ? newestFolder.kind === "liquidation" : lastType === "liquidation";
  // What the owner did after the last seizure, where that seizure is a loaded
  // row (a seizure inside a folder leaves the rows after it unread here).
  const lastLiqIdx = morpho.map((e) => e.context.data.eventType).lastIndexOf("liquidation");
  const lastLiqNewest =
    lastLiqIdx >= 0 &&
    !(folders ?? []).some((f) => f.kind === "liquidation" && f.lastBlock > morpho[lastLiqIdx].blockNumber);
  const after = lastLiqNewest ? morpho.slice(lastLiqIdx + 1).map((e) => e.context.data.eventType) : [];
  const repaidAfter = after.includes("repay");
  const withdrawnAfter = after.includes("withdraw_collateral");

  // A peak in a token whose decimals did not load is not stated.
  const hasPeakColl = v.peakCollateral > 0 && v.collateralSymbol != null && !v.collateralDecimalsUnread;
  const hasPeakBorr = v.peakBorrowed > 0 && !v.loanDecimalsUnread;
  // The highest debt owed at an event (interest included), where the page
  // loaded the whole history; the principal peak otherwise.
  const owedPeak = v.peakDebtOwed != null && v.peakDebtOwed > 0;
  const peakDebt = owedPeak ? v.peakDebtOwed! : v.peakBorrowed;
  const coll = v.collateralSymbol ?? v.loanSymbol;

  const lead = positionNodes(
    endedBySeizure
      ? "closed_lead_emptied"
      : v.everLiquidated
        ? "closed_lead_liquidated"
        : v.peakBorrowed > 0
          ? "closed_lead_repaid"
          : "closed_lead_no_debt",
  );

  const bullets: Bullet[] = [];

  const peakColl = (
    <H>
      <AmountText value={v.peakCollateral} />
    </H>
  );
  const peakDebtNode = (
    <H>
      <AmountText value={peakDebt} />
    </H>
  );
  if (hasPeakColl && hasPeakBorr)
    bullets.push(
      bulletOf(
        "history",
        "peaks",
        positionNodes(owedPeak ? "peaks_both" : "peaks_both_principal", {
          peak_coll: peakColl,
          coll_symbol: coll,
          peak_debt: peakDebtNode,
          loan_symbol: v.loanSymbol,
        }),
      ),
    );
  else if (hasPeakColl)
    bullets.push(bulletOf("history", "peaks", positionNodes("peaks_coll", { peak_coll: peakColl, coll_symbol: coll })));
  else if (hasPeakBorr)
    bullets.push(
      bulletOf(
        "history",
        "peaks",
        positionNodes(owedPeak ? "peaks_debt" : "peaks_debt_principal", {
          peak_debt: peakDebtNode,
          loan_symbol: v.loanSymbol,
        }),
      ),
    );

  if (v.everLiquidated) {
    const seizures = timesText(liqCount ?? null);
    bullets.push(
      bulletOf(
        "history",
        "seizures",
        endedBySeizure
          ? positionNodes("seizures_emptied", { seizures })
          : withdrawnAfter
            ? repaidAfter
              ? positionNodes("seizures_repaid", { seizures })
              : positionNodes("seizures_withdrew", { seizures })
            : positionNodes("seizures_closed", { seizures }),
      ),
    );
    // The split the timeline cannot show: the Liquidate log's cleared figure
    // merges repaid + badDebt, so the written-off share rides a separate
    // backend sum (morpho_liquidation.bad_debt_assets). Stated only when it exists:
    // most liquidated records cleared fully against their collateral.
    if (v.badDebt > 0 && !v.loanDecimalsUnread)
      bullets.push(
        bulletOf(
          "history",
          "bad-debt",
          positionNodes("bad_debt", { bad_debt: <AmountText value={v.badDebt} />, loan_symbol: v.loanSymbol }),
        ),
      );
  }

  // The counts: the owner's transactions behind the timeline's events (one
  // transaction can carry several), and the liquidations.
  const ownerEvents = eventCount != null && liqCount != null ? eventCount - liqCount : null;
  bullets.push(bulletOf("history", "closure", countsBullet(v.txCount, ownerEvents)));

  return <ProseExplainer paragraph={lead} items={arrange(bullets)} />;
}
