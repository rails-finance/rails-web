"use client";

// The Moonwell position card's explanation (zone Z1), on Ethereum and on Base:
// a colon-terminated lead, then bullets under Holdings, Risk, Rate and History
// when two of them hold two or more bullets (rails-ops
// standards/prose-limits-and-zones.md 3.3). The words are
// content/moonwell/event-prose.yaml's `position_words`; this file chooses which
// to say and draws each figure as the card does. The open account's figures are
// the chain read at head, with the Comptroller's account-liquidity verdict;
// a closed account's are its recorded history. The mechanisms behind them are
// the card's "?" (position_* in the same file).

import type { ReactNode } from "react";
import type { MoonwellChainResponse } from "@/lib/api/fetch-moonwell-position";
import type { MoonwellPositionView } from "@/components/protocol/moonwell/moonwell-position-card";
import type { MoonwellCardCaptions } from "@/lib/moonwell/economics";
import { formatUsd } from "@/lib/shared/format-event";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { operatorLead, type ExternalActorSummary } from "@/lib/shared/external-actor";
import { formatDate } from "@/lib/date";
import { AmountText } from "@/components/shared/amount-text";
import { MOONWELL_WORDS, positionWords } from "@/lib/moonwell/event-templates";
import { positionNodes } from "@/lib/moonwell/position-nodes";
import { arrangeByHeading } from "@/lib/shared/event-prose/nodes";

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

/** Market names stand in a bullet up to this many; more are counted. */
const NAMED_MAX = 4;

/** Oxford-join asset symbols ("WETH, USDC and cbBTC"). */
function joinSymbols(syms: string[]): string {
  if (syms.length <= 1) return syms.join("");
  return `${syms.slice(0, -1).join(", ")} ${MOONWELL_WORDS.and} ${syms[syms.length - 1]}`;
}

export function MoonwellPositionExplanation({
  chain,
  captions,
  liquidationCount,
  externalActivity,
}: {
  /** The live chain read. Null until it lands:
   *  nothing is narrated, and the pane still mounts so its foot controls draw. */
  chain: MoonwellChainResponse | null;
  /** The card's stat captions (the borrow rate) — the same computed values the
   *  stat footnotes show. Omit to skip those bullets. */
  captions?: MoonwellCardCaptions | null;
  /** Replayed liquidation count from the index (the card's marker). */
  liquidationCount?: number;
  /** Who executed the account's events, reduced over its whole timeline. The
   *  page derives it from the events already on the page; omit to skip the
   *  operator bullet. */
  externalActivity?: ExternalActorSummary;
}) {
  if (!chain) return null;
  const supplied = chain.markets.filter((m) => m.supplyUnderlying > 0);
  const entered = supplied.filter((m) => m.entered);
  const unentered = supplied.filter((m) => !m.entered);
  const borrowed = chain.markets.filter((m) => m.borrowUnderlying > 0);
  const hasDebt = borrowed.length > 0;
  const hf = chain.healthFactor;
  const dropPct = hf != null && hf > 1 ? Math.round((1 - 1 / hf) * 100) : null;

  const bullets: Bullet[] = [];
  const add = (group: Group, key: string, node: ReactNode) =>
    bullets.push({ group, node: <span key={key}>{node}</span> });

  // The card's USD headlines (strict guard: stated only when every
  // contributing market is priced — the card degrades identically).
  const sideUsd = (ms: typeof supplied, amount: (m: (typeof ms)[number]) => number): number | null => {
    let sum = 0;
    for (const m of ms) {
      if (m.priceUsd == null) return null;
      sum += amount(m) * m.priceUsd;
    }
    return ms.length > 0 ? sum : null;
  };
  const suppliedUsd = sideUsd(supplied, (m) => m.supplyUnderlying);
  const borrowedUsd = sideUsd(borrowed, (m) => m.borrowUnderlying);
  if (suppliedUsd != null && borrowedUsd != null)
    add(
      "holdings",
      "totals",
      positionNodes("totals_both", {
        supplied_usd: <H>{formatUsd(suppliedUsd)}</H>,
        borrowed_usd: <H>{formatUsd(borrowedUsd)}</H>,
      }),
    );
  else if (suppliedUsd != null)
    add("holdings", "totals", positionNodes("totals_supplied", { supplied_usd: <H>{formatUsd(suppliedUsd)}</H> }));
  else if (borrowedUsd != null)
    add("holdings", "totals", positionNodes("totals_borrowed", { borrowed_usd: <H>{formatUsd(borrowedUsd)}</H> }));

  if (unentered.length > 0)
    add(
      "holdings",
      "unentered",
      unentered.length <= NAMED_MAX
        ? positionNodes("unentered", { syms: joinSymbols(unentered.map((m) => m.symbol)) })
        : positionNodes("unentered_many", { count: unentered.length }),
    );

  if (hasDebt) {
    add(
      "risk",
      "verdict",
      chain.shortfallUsd > 0
        ? positionNodes("shortfall", { shortfall_usd: <H>{formatUsd(chain.shortfallUsd)}</H> })
        : positionNodes("capacity", { liquidity_usd: <H>{formatUsd(chain.liquidityUsd)}</H> }),
    );
    if (dropPct != null && dropPct > 0) add("risk", "drop", positionNodes("drop", { drop: <H>{dropPct}%</H> }));
    if (captions?.borrowRate)
      add(
        "rate",
        "rate",
        positionNodes(captions.borrowRate.avg ? "rate_avg" : "rate", {
          rate: <H>{captions.borrowRate.pct.toFixed(2)}%</H>,
        }),
      );
  }

  if (liquidationCount != null && liquidationCount > 0)
    add(
      "history",
      "survivor",
      positionNodes("liquidated", {
        liq_count: <H>{liquidationCount}</H>,
        time_word: liquidationCount === 1 ? MOONWELL_WORDS.time_one : MOONWELL_WORDS.time_many,
      }),
    );

  // Who has been operating the account, across its whole timeline — the same
  // externalActor() verdict each event card renders on its spine, reduced once
  // so the pane can state the pattern rather than one row at a time. The lead
  // carries its denominator (operatorLead), because the transaction count and
  // the event count differ. What a third party can do unasked is the card's
  // "?" (Other addresses).
  const ext = externalActivity;
  if (ext && ext.external > 0)
    add(
      "history",
      "operators",
      positionNodes("operators", {
        lead: operatorLead(ext, null, MOONWELL_WORDS.operator_where),
        external: ext.external.toLocaleString("en-US"),
        were: ext.external === 1 ? MOONWELL_WORDS.was : MOONWELL_WORDS.were,
      }),
    );

  if (bullets.length === 0) return null;

  // Subject-first status lead: a one-sentence verdict, colon-terminated, the
  // lead-in to the bullets. Keyed on the resulting state.
  const lead = hasDebt
    ? chain.shortfallUsd > 0
      ? positionNodes("lead_shortfall")
      : hf != null
        ? positionNodes("lead_debt", { hf: <H>{hf >= 100 ? "∞" : hf.toFixed(2)}</H> })
        : positionNodes("lead_debt_unread")
    : entered.length > 0
      ? positionNodes("lead_supply")
      : positionNodes("lead_earn");

  return <ProseExplainer paragraph={lead} items={arrange(bullets)} />;
}

/** Up to three peak figures, bolded, then a count for the rest — the
 *  asset-cluster cap grammar. */
function peakPhrase(rs: { amount: number; symbol: string }[]): ReactNode {
  const named = rs.slice(0, 3);
  const more = rs.length - named.length;
  return (
    <>
      {named.map((r, i) => (
        <span key={r.symbol + i}>
          {i > 0 && (i === named.length - 1 && more === 0 ? ` ${MOONWELL_WORDS.and} ` : ", ")}
          <H>
            <AmountText value={r.amount} /> {r.symbol}
          </H>
        </span>
      ))}
      {more > 0 ? (
        <>
          {" "}
          {MOONWELL_WORDS.and} {more} {more === 1 ? MOONWELL_WORDS.more_one : MOONWELL_WORDS.more_many}
        </>
      ) : null}
    </>
  );
}

/** Closed mood — narration from the index alone (a terminal account has no
 *  live state to read): the peaks, the liquidations, the closure. Figures
 *  bold only where the card's chrome shows the same figure. */
export function MoonwellClosedPositionExplanation({ v }: { v: MoonwellPositionView }) {
  const hasSupply = v.peakSupplies.length > 0;
  const hasDebt = v.peakBorrows.length > 0;
  const bullets: Bullet[] = [];
  const add = (key: string, node: ReactNode) => bullets.push({ group: "history", node: <span key={key}>{node}</span> });

  if (hasSupply && hasDebt)
    add(
      "peaks",
      positionNodes("peaks_both", {
        peak_supply: peakPhrase(v.peakSupplies),
        peak_debt: peakPhrase(v.peakBorrows),
      }),
    );
  else if (hasSupply) add("peaks", positionNodes("peaks_supply", { peak_supply: peakPhrase(v.peakSupplies) }));
  else if (hasDebt) add("peaks", positionNodes("peaks_debt", { peak_debt: peakPhrase(v.peakBorrows) }));

  if (v.liquidationCount > 0)
    add(
      "liquidated",
      positionNodes("liquidated_closed", {
        liq_count: <H>{v.liquidationCount}</H>,
        time_word: v.liquidationCount === 1 ? MOONWELL_WORDS.time_one : MOONWELL_WORDS.time_many,
      }),
    );

  add(
    "closure",
    positionNodes("closure", {
      closed_on: <H>{formatDate(v.lastActivityAt)}</H>,
      tx_count: <H>{v.txCount}</H>,
      tx_word: v.txCount === 1 ? MOONWELL_WORDS.tx_one : MOONWELL_WORDS.tx_many,
    }),
  );

  return <ProseExplainer paragraph={positionNodes("closed_lead")} items={arrange(bullets)} />;
}
