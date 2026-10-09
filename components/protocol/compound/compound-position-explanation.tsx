"use client";

// The Compound V3 position card's explanation (zone Z1): a colon-terminated
// lead, then bullets under Holdings, Risk and History when two of them hold
// two or more bullets (rails-ops standards/prose-limits-and-zones.md 3.3;
// Compound V3 has no rate group, the supply rate sits in the lead). The words
// are content/compound/event-prose.yaml's `position_words`; this file chooses
// which to say and draws each figure as the card does (its receipt, or the
// card's amount format). An open position's figures are the live chain read;
// a closed one narrates from the index alone, since its live read answers
// zeros. Values quote in the market's unit (USD, or ETH in the WETH
// market), so magnitudes are stated in base tokens. The mechanisms behind them
// are the card's "?" (position_* in the same file).

import type { ReactNode } from "react";
import type { CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import { scaleCompoundChainBalance } from "@/lib/api/fetch-compound-position";
import { formatUsd } from "@/lib/shared/format-event";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { useEnsName } from "@/lib/ens/use-ens-names";
import type { ExternalActorSummary } from "@/lib/shared/external-actor";
import type { CompoundPositionView } from "@/components/protocol/compound/compound-position-card";
import { capacityShare } from "@/lib/shared/capacity-share";
import { AmountText } from "@/components/shared/amount-text";
import { COMPOUND_WORDS, positionWords } from "@/lib/compound/event-templates";
import { positionNodes } from "@/lib/compound/position-nodes";
import { arrangeByHeading } from "@/lib/shared/event-prose/nodes";

const GROUPS = ["holdings", "risk", "history"] as const;
type Group = (typeof GROUPS)[number];
type Bullet = { group: Group; node: ReactNode };

const arrange = (bullets: Bullet[]) => {
  const heading: Record<Group, string> = {
    holdings: positionWords("heading_holdings"),
    risk: positionWords("heading_risk"),
    history: positionWords("heading_history"),
  };
  return arrangeByHeading(bullets, GROUPS, (g) => heading[g]);
};

/** Join items with commas and the file's "and" ("wstETH, WBTC and cbBTC"). */
function joinItems<T>(items: T[], draw: (item: T, i: number) => ReactNode): ReactNode[] {
  return items.map((item, i) => (
    <span key={i}>
      {i > 0 ? (i === items.length - 1 ? ` ${COMPOUND_WORDS.and} ` : ", ") : ""}
      {draw(item, i)}
    </span>
  ));
}

const joinSymbols = (syms: string[]): string =>
  syms.length <= 1 ? (syms[0] ?? "") : `${syms.slice(0, -1).join(", ")} ${COMPOUND_WORDS.and} ${syms[syms.length - 1]}`;

/** Terminal (closed / liquidated) pane: narrated from the index view alone,
 *  never waiting on the chain lane. */
export function CompoundClosedPositionExplanation({
  v,
  principalOnly = false,
}: {
  v: CompoundPositionView;
  /** The Base sweep's peaks are replayed principal; Ethereum's rows are the
   *  chain's balance, interest included. */
  principalOnly?: boolean;
}) {
  const liquidated = v.status === "liquidated";
  const dust = v.dustLeft ?? [];
  const market = v.marketLabel;
  const lead =
    dust.length > 0
      ? positionNodes(liquidated ? "closed_lead_absorbed_dust" : "closed_lead_dust", { market })
      : positionNodes(liquidated ? "closed_lead_absorbed" : "closed_lead", { market });

  const bullets: Bullet[] = [];
  const add = (group: Group, key: string, node: ReactNode) =>
    bullets.push({ group, node: <span key={key}>{node}</span> });

  if (dust.length > 0)
    add(
      "holdings",
      "dust",
      positionNodes("dust_left", {
        dust: joinItems(dust, (d) => (
          <>
            <AmountText value={d.amount} /> {d.symbol}
          </>
        )),
      }),
    );

  // The card's peak lines: collateral assets, the lent base, the borrowed base.
  const held = v.peak.collateral.map((c) => ({ amount: c.amount, symbol: c.symbol }));
  if (held.length > 0)
    add(
      "history",
      "held",
      positionNodes("peak_held", {
        peak_coll: joinItems(held, (r) => (
          <H>
            <AmountText value={r.amount} /> {r.symbol}
          </H>
        )),
      }),
    );
  if (v.peak.lentBase > 0)
    add(
      "history",
      "lent",
      positionNodes("peak_lent", {
        peak_lent: (
          <H>
            <AmountText value={v.peak.lentBase} /> {v.base.symbol}
          </H>
        ),
      }),
    );
  if (v.peak.borrowedBase > 0) {
    const owed = (
      <H>
        <AmountText value={v.peak.borrowedBase} /> {v.base.symbol}
      </H>
    );
    add(
      "history",
      "owed",
      principalOnly
        ? positionNodes("peak_owed_principal", { peak_debt: owed })
        : positionNodes("peak_owed", { peak_debt: owed }),
    );
  }
  if (v.liquidationCount > 0)
    add(
      "history",
      "absorbed",
      positionNodes("absorbed", {
        count: <H>{v.liquidationCount}</H>,
        time_word: v.liquidationCount === 1 ? COMPOUND_WORDS.time_one : COMPOUND_WORDS.time_many,
      }),
    );

  return <ProseExplainer paragraph={lead} items={arrange(bullets)} />;
}

export function CompoundPositionExplanation({
  chain,
  collateralUsd,
  debtUsd,
  externalActivity,
}: {
  chain: CompoundMarketChainResponse;
  /** The card's oracle-USD side headlines (cardSideUsd on the card view): the
   *  exact chrome figures, so the pane's bold twins byte-match. Omit (or null)
   *  when the card shows no USD headline. */
  collateralUsd?: number | null;
  debtUsd?: number | null;
  /** Who executed the position's events, reduced over its whole timeline. The
   *  page derives it from the events already on the page; omit to skip the
   *  operator bullets. */
  externalActivity?: ExternalActorSummary;
}) {
  const leadName = useEnsName(externalActivity?.actors[0]?.address ?? null);
  const supplyBase = scaleCompoundChainBalance(chain.supplyBalanceRaw, chain.baseDecimals);
  const borrowBase = scaleCompoundChainBalance(chain.borrowBalanceRaw, chain.baseDecimals);
  const hasDebt = borrowBase > 0;
  const collateralSyms = chain.collateral.map((c) => c.symbol);
  const toBase = (n: number) => (chain.basePrice > 0 ? n / chain.basePrice : n);
  const hf = chain.healthFactor;
  const dropPct = hf != null && hf > 1 ? Math.round((1 - 1 / hf) * 100) : null;
  const deprecated = chain.collateral.filter((c) => c.borrowCollateralFactor === 0);
  const base = (n: number) => (
    <H>
      <AmountText value={n} /> {chain.baseSymbol}
    </H>
  );

  let lead: ReactNode = null;
  const bullets: Bullet[] = [];
  const add = (group: Group, key: string, node: ReactNode) =>
    bullets.push({ group, node: <span key={key}>{node}</span> });

  if (hasDebt) {
    lead = positionNodes("lead_borrow", { borrowed: base(borrowBase), collateral_syms: joinSymbols(collateralSyms) });

    // The card's USD headlines (Comet's oracle), else the collateral in base.
    if (collateralUsd != null && debtUsd != null)
      add(
        "holdings",
        "worth",
        positionNodes("worth_both", {
          collateral_usd: <H>{formatUsd(collateralUsd)}</H>,
          debt_usd: <H>{formatUsd(debtUsd)}</H>,
        }),
      );
    else if (collateralUsd != null)
      add(
        "holdings",
        "worth",
        positionNodes("worth_collateral", { collateral_usd: <H>{formatUsd(collateralUsd)}</H> }),
      );
    else if (debtUsd != null)
      add("holdings", "worth", positionNodes("worth_debt", { debt_usd: <H>{formatUsd(debtUsd)}</H> }));
    else {
      const collateralValue = chain.collateral.reduce(
        (s, c) => s + scaleCompoundChainBalance(c.balanceRaw, c.decimals) * c.price,
        0,
      );
      add(
        "holdings",
        "worth",
        positionNodes("worth_base", {
          collateral_base: (
            <>
              <AmountText value={toBase(collateralValue)} /> {chain.baseSymbol}
            </>
          ),
        }),
      );
    }

    if (chain.isLiquidatable) add("risk", "verdict", positionNodes("absorbable"));
    else if (!chain.isBorrowCollateralized) add("risk", "verdict", positionNodes("over_limit"));
    if (chain.liquidationCapacity > 0) {
      const share = capacityShare(chain.debtValue, chain.liquidationCapacity);
      add(
        "risk",
        "liq-line",
        share.beyond
          ? positionNodes("liq_line_beyond", {
              share: <H>{share.text}</H>,
              line: base(toBase(chain.liquidationCapacity)),
            })
          : positionNodes("liq_line", { share: <H>{share.text}</H>, line: base(toBase(chain.liquidationCapacity)) }),
      );
    }
    if (dropPct != null && dropPct > 0) add("risk", "drop", positionNodes("drop", { drop: <H>{dropPct}%</H> }));
    if (chain.borrowCapacity > chain.debtValue)
      add("risk", "power", positionNodes("capacity", { room: base(toBase(chain.borrowCapacity - chain.debtValue)) }));
  } else if (supplyBase > 0) {
    lead = positionNodes("lead_lend", {
      lent: base(supplyBase),
      base_symbol: chain.baseSymbol,
      supply_apr: `${(chain.supplyApr * 100).toFixed(2)}%`,
    });
  } else if (collateralSyms.length > 0) {
    lead = positionNodes("lead_collateral", { collateral_syms: joinSymbols(collateralSyms) });
  }

  // Idle collateral (a lending or bare-collateral position with no debt): it
  // backs nothing, so none of it is at risk.
  if (collateralSyms.length > 0 && !hasDebt) {
    if (supplyBase > 0)
      add("holdings", "also-coll", positionNodes("also_collateral", { collateral_syms: joinSymbols(collateralSyms) }));
    add("risk", "idle-risk", positionNodes("idle_safe"));
    // No debt, so the risk row (the figure's bold twin) does not render and
    // the capacity stays plain.
    if (chain.borrowCapacity > 0)
      add(
        "risk",
        "idle-capacity",
        positionNodes("idle_capacity", {
          room: (
            <>
              <AmountText value={toBase(chain.borrowCapacity)} /> {chain.baseSymbol}
            </>
          ),
        }),
      );
  }

  if (deprecated.length > 0) {
    const syms = joinSymbols(deprecated.map((c) => c.symbol));
    add(
      "holdings",
      "deprecated",
      deprecated.length === 1
        ? positionNodes("deprecated_one", { deprecated_syms: syms })
        : positionNodes("deprecated_many", { deprecated_syms: syms }),
    );
  }

  // Who has been operating the position across its whole timeline: the same
  // externalActor() verdict each event card renders on its spine, reduced once
  // so the pane states the pattern. The count is plural-safe and an address is
  // never spoken in place of a name; the identity stays unbolded since the
  // card shows no twin of it.
  const ext = externalActivity;
  if (ext && ext.external > 0) {
    if (ext.external === 1) {
      add("history", "operators", positionNodes("operators_one", { total: ext.total.toLocaleString("en-US") }));
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
