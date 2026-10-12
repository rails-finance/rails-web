"use client";

// The Compound V2 position card's explanation (zone Z1): a colon-terminated
// lead, then bullets under Holdings, Risk, Rate and History when two of them
// hold two or more bullets (rails-ops standards/prose-limits-and-zones.md 3.3).
// The words are content/compound-v2/event-prose.yaml's `position_words`; this
// file chooses which to say and draws each figure as the card does. An open
// account's figures are the live account read (per-market balances, entered
// markets, the protocol's oracle prices and collateral factors, and the
// Comptroller's liquidity and shortfall); a closed one narrates from the
// index alone, since a terminal account has no live state. The mechanisms
// behind them are the card's "?" (position_* in the same file).

import type { ReactNode } from "react";
import { isCompoundV2Deprecated } from "@/lib/compound-v2/deprecated-markets";
import type { CompoundV2ChainResponse } from "@/lib/api/fetch-compound-v2-position";
import type { CompoundV2PositionView } from "@/components/protocol/compound-v2/compound-v2-position-card";
import type { CompoundV2CardCaptions } from "@/lib/compound-v2/economics";
import { formatUsd } from "@/lib/shared/format-event";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { useEnsName } from "@/lib/ens/use-ens-names";
import type { ExternalActorSummary } from "@/lib/shared/external-actor";
import { capacityShare } from "@/lib/shared/capacity-share";
import { AmountText } from "@/components/shared/amount-text";
import { COMPOUND_V2_WORDS, positionWords } from "@/lib/compound-v2/event-templates";
import { positionNodes } from "@/lib/compound-v2/position-nodes";
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

/** Join symbols with commas and the file's "and" ("ETH, USDC and WBTC"). */
function joinSymbols(syms: string[]): string {
  if (syms.length <= 1) return syms[0] ?? "";
  return `${syms.slice(0, -1).join(", ")} ${COMPOUND_V2_WORDS.and} ${syms[syms.length - 1]}`;
}

export function CompoundV2PositionExplanation({
  chain,
  liquidationCount,
  captions,
  externalActivity,
}: {
  /** The live chain read. Null until it lands:
   *  nothing is narrated, and the pane still mounts so its foot controls draw. */
  chain: CompoundV2ChainResponse | null;
  /** Replayed liquidation count from the index: lets an open survivor's
   *  narration state the two-axis fact. Omit to skip the bullet. */
  liquidationCount?: number;
  /** The card's stat captions (the borrow rate). Omit to skip that bullet. */
  captions?: CompoundV2CardCaptions | null;
  /** Who executed the account's events, reduced over its whole timeline. The
   *  page derives it from the events already on the page; omit to skip the
   *  operator bullets. */
  externalActivity?: ExternalActorSummary;
}) {
  const leadName = useEnsName(externalActivity?.actors[0]?.address ?? null);
  if (!chain) return null;
  const supplied = chain.markets.filter((m) => m.supplyUnderlying > 0);
  const entered = supplied.filter((m) => m.entered);
  const unentered = supplied.filter((m) => !m.entered);
  const disabledColl = supplied.filter((m) => m.entered && m.collateralDisabled);
  const borrowed = chain.markets.filter((m) => m.borrowUnderlying > 0);
  const hasDebt = borrowed.length > 0;
  const shortfall = chain.shortfallUsd > 0;
  const hf = chain.healthReplica;
  const dropPct = hf != null && hf > 1 ? Math.round((1 - 1 / hf) * 100) : null;

  const leadId =
    hasDebt && shortfall
      ? "lead_liquidatable"
      : hasDebt
        ? "lead_borrowing"
        : entered.length > 0
          ? "lead_debt_free"
          : supplied.length > 0
            ? "lead_supply_only"
            : null;
  const lead: ReactNode | null =
    leadId === "lead_liquidatable"
      ? positionNodes("lead_liquidatable")
      : leadId === "lead_borrowing"
        ? positionNodes("lead_borrowing")
        : leadId === "lead_debt_free"
          ? positionNodes("lead_debt_free")
          : leadId === "lead_supply_only"
            ? positionNodes("lead_supply_only")
            : null;

  const bullets: Bullet[] = [];
  const add = (group: Group, key: string, node: ReactNode) =>
    bullets.push({ group, node: <span key={key}>{node}</span> });

  // The card's USD headlines (strict guard: stated only when every
  // contributing market is priced; the card degrades identically).
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
      "worth",
      positionNodes("worth_both", {
        supplied_usd: <H>{formatUsd(suppliedUsd)}</H>,
        borrowed_usd: <H>{formatUsd(borrowedUsd)}</H>,
      }),
    );
  else if (suppliedUsd != null)
    add("holdings", "worth", positionNodes("worth_supplied", { supplied_usd: <H>{formatUsd(suppliedUsd)}</H> }));
  else if (borrowedUsd != null)
    add("holdings", "worth", positionNodes("worth_borrowed", { borrowed_usd: <H>{formatUsd(borrowedUsd)}</H> }));

  if (entered.length > 0)
    add("holdings", "entered", positionNodes("entered", { entered_syms: joinSymbols(entered.map((m) => m.symbol)) }));
  if (unentered.length > 0)
    add(
      "holdings",
      "unentered",
      positionNodes("unentered", { unentered_syms: joinSymbols(unentered.map((m) => m.symbol)) }),
    );
  if (disabledColl.length > 0)
    add(
      "holdings",
      "disabled",
      positionNodes("disabled", { disabled_syms: joinSymbols(disabledColl.map((m) => m.symbol)) }),
    );

  if (hasDebt) {
    // Compound's risk check: the borrowing room left, or the shortfall.
    add(
      "risk",
      "verdict",
      shortfall
        ? positionNodes("shortfall", { shortfall: <H>{formatUsd(chain.shortfallUsd)}</H> })
        : positionNodes("liquidity", { liquidity: <H>{formatUsd(chain.liquidityUsd)}</H> }),
    );
    if (chain.debtValueUsd > 0 && chain.collateralCapacityUsd > 0) {
      const share = capacityShare(chain.debtValueUsd, chain.collateralCapacityUsd);
      add(
        "risk",
        "liq-line",
        share.beyond
          ? positionNodes("liq_line_beyond", {
              share: <H>{share.text}</H>,
              line: <H>{formatUsd(chain.collateralCapacityUsd)}</H>,
            })
          : positionNodes("liq_line", {
              share: <H>{share.text}</H>,
              line: <H>{formatUsd(chain.collateralCapacityUsd)}</H>,
            }),
      );
    }
    if (dropPct != null && dropPct > 0) add("risk", "drop", positionNodes("drop", { drop: <H>{dropPct}%</H> }));
    const deprecatedBorrows = borrowed.filter((m) => isCompoundV2Deprecated(m.market));
    if (deprecatedBorrows.length > 0) {
      const syms = joinSymbols(deprecatedBorrows.map((m) => m.symbol));
      add(
        "risk",
        "deprecated",
        deprecatedBorrows.length === 1
          ? positionNodes("deprecated_one", { deprecated_syms: syms })
          : positionNodes("deprecated_many", { deprecated_syms: syms }),
      );
    }
  } else if (entered.length > 0) {
    add("risk", "idle", positionNodes("idle_room", { liquidity: formatUsd(chain.liquidityUsd) }));
  }

  // The rate: what the supply earns, and what the debt accrues at.
  if (supplied.length > 0) {
    const top = Math.max(...supplied.map((m) => m.supplyApr ?? 0));
    if (top > 0) add("rate", "supply", positionNodes("earns_rate", { supply_apr: <H>{(top * 100).toFixed(2)}%</H> }));
    else if (supplied.every((m) => m.supplyApr === 0)) add("rate", "supply", positionNodes("earns_nothing"));
  }
  if (hasDebt && captions?.borrowRate) {
    const rate = <H>{captions.borrowRate.pct.toFixed(2)}%</H>;
    add(
      "rate",
      "borrow",
      captions.borrowRate.avg ? positionNodes("borrow_rate_avg", { rate }) : positionNodes("borrow_rate", { rate }),
    );
  }

  if (liquidationCount != null && liquidationCount > 0)
    add(
      "history",
      "liquidated",
      positionNodes("liquidated_open", {
        count: <H>{liquidationCount}</H>,
        time_word: liquidationCount === 1 ? COMPOUND_V2_WORDS.time_one : COMPOUND_V2_WORDS.time_many,
      }),
    );

  // Who has been operating the account, across its whole timeline: the same
  // externalActor() verdict each event card renders on its spine, reduced once
  // so the pane states the pattern. The count is plural-safe and an address is
  // never spoken in place of a name; the identity stays unbolded since the
  // card shows no twin of it.
  const ext = externalActivity;
  if (ext && ext.external > 0) {
    if (ext.external === 1) {
      add(
        "history",
        "operators",
        positionNodes("operators_one", {
          external: ext.external.toLocaleString("en-US"),
          total: ext.total.toLocaleString("en-US"),
        }),
      );
      if (leadName) add("history", "operators-who", positionNodes("operators_one_named", { lead_name: leadName }));
    } else {
      add(
        "history",
        "operators",
        positionNodes("operators", {
          external: ext.external.toLocaleString("en-US"),
          total: ext.total.toLocaleString("en-US"),
        }),
      );
      if (ext.actors.length === 1)
        add(
          "history",
          "operators-who",
          leadName ? positionNodes("operators_all_named", { lead_name: leadName }) : positionNodes("operators_single"),
        );
      else if (leadName)
        add("history", "operators-who", positionNodes("operators_most_named", { lead_name: leadName }));
      else
        add(
          "history",
          "operators-who",
          positionNodes("operators_spread", {
            actors: ext.actors.length.toLocaleString("en-US"),
            top_count: ext.actors[0].count.toLocaleString("en-US"),
          }),
        );
    }
  }

  if (lead == null && bullets.length === 0) return null;

  return <ProseExplainer paragraph={lead} items={arrange(bullets)} />;
}

/** Closed/liquidated mood: narration from the index alone (a terminal account
 *  has no live state to read): the peaks and the liquidation record. Figures
 *  bold where the card's chrome shows the same figure. */
export function CompoundV2ClosedPositionExplanation({ v }: { v: CompoundV2PositionView }) {
  const liquidated = v.status === "liquidated";
  const peakText = (rs: { amount: number; symbol: string }[]) =>
    rs.map((r, i) => (
      <span key={r.symbol + i}>
        {i > 0 ? (i === rs.length - 1 ? ` ${COMPOUND_V2_WORDS.and} ` : ", ") : ""}
        <H>
          <AmountText value={r.amount} /> {r.symbol}
        </H>
      </span>
    ));
  const lead = positionNodes(liquidated ? "closed_lead_liquidated" : "closed_lead");

  const bullets: Bullet[] = [];
  const add = (group: Group, key: string, node: ReactNode) =>
    bullets.push({ group, node: <span key={key}>{node}</span> });
  if (v.peakSupplies.length > 0)
    add("history", "supplied", positionNodes("peak_supplied", { peak_supplies: peakText(v.peakSupplies) }));
  if (v.peakBorrows.length > 0)
    add("history", "owed", positionNodes("peak_owed", { peak_borrows: peakText(v.peakBorrows) }));
  if (v.liquidationCount > 0)
    add(
      "history",
      "liquidated",
      positionNodes("liquidated_n", {
        count: <H>{v.liquidationCount}</H>,
        time_word: v.liquidationCount === 1 ? COMPOUND_V2_WORDS.time_one : COMPOUND_V2_WORDS.time_many,
      }),
    );

  return <ProseExplainer paragraph={lead} items={arrange(bullets)} />;
}
