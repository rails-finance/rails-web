"use client";

// The Polaris CDP card's explanation (zone Z1): a status lead (what the CDP
// holds and owes, or that nothing remains), then bullets under Holdings, Risk,
// Rate and History when two of them hold two or more bullets (rails-ops
// standards/prose-limits-and-zones.md 3.3). The words are
// content/polaris/event-prose.yaml's `position_words`; this file chooses which
// to say and draws each figure as the card does. An open CDP reads the live
// chain figures; a closed or liquidated one narrates its summed ledger from the
// index.
//
// NO P&L, NO COLOUR on the equity figure: Rails states a valuation at the
// block, in words, never a profit (the position card's "Equity at the feed"
// stat, which the equity bullet echoes).

import type { ReactNode } from "react";
import type { PolarisChainResponse } from "@/lib/api/fetch-polaris-position";
import type { PolarisLifetime } from "@/lib/polaris/economics";
import { LIFETIME_LEGS, lifetimeLegProv, type PolarisLifetimeLeg } from "@/lib/polaris/event-provenance";
import { liveEntireProv, liveEquityProv, livePethInDebtProv } from "@/lib/polaris/live-provenance";
import { PETH } from "@/lib/polaris/asset-catalog";
import { Prov } from "@/components/shared/provenance";
import { formatExact, formatNumber, formatUnitsExact, withRealMinus } from "@/lib/utils/format";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { AmountText } from "@/components/shared/amount-text";
import { positionWords } from "@/lib/polaris/event-templates";
import { positionNodes } from "@/lib/polaris/position-nodes";
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

const pctWhole = (fraction: number): string => `${Math.round(fraction * 100)}%`;
const pct2 = (fraction: number): string => `${(fraction * 100).toFixed(2)}%`;

export function PolarisPositionExplanation({
  chain,
  stableSymbol,
  terminal,
  lifetime,
  transferCount,
}: {
  chain: PolarisChainResponse;
  stableSymbol: string;
  /** The index's terminal word for a burned CDP — "closed" or "liquidated". */
  terminal?: "closed" | "liquidated" | null;
  /** The CDP's summed ledger over its whole life (lib/polaris/economics.ts,
   *  polarisLifetime) — null while the index hasn't answered, or on an open
   *  CDP the lifetime bullets have no use for. */
  lifetime?: PolarisLifetime | null;
  transferCount?: number;
}) {
  const hasColl = chain.entireColl > 0;
  const hasDebt = chain.entireDebt > 0;
  const mcr = chain.defensiveMode ? chain.defensiveMcr : chain.mcr;

  const echoColl = (node: ReactNode) => (
    <Prov
      echo
      info={liveEntireProv("coll", chain.market)}
      value={formatUnitsExact(chain.entireCollRaw, 18)}
      symbol={PETH.symbol}
    >
      {node}
    </Prov>
  );
  const echoDebt = (node: ReactNode) => (
    <Prov
      echo
      info={liveEntireProv("debt", chain.market)}
      value={formatUnitsExact(chain.entireDebtRaw, 18)}
      symbol={stableSymbol}
    >
      {node}
    </Prov>
  );
  const collNode = echoColl(
    <H>
      <AmountText value={chain.entireColl} />
    </H>,
  );

  const lead: ReactNode | null = !chain.isOpen
    ? positionNodes(terminal === "liquidated" ? "lead_liquidated" : "lead_closed")
    : hasColl && hasDebt
      ? positionNodes("lead_holds", {
          coll: collNode,
          debt: echoDebt(
            <H>
              <AmountText value={chain.entireDebt} />
            </H>,
          ),
          stable: stableSymbol,
        })
      : hasColl && chain.recordedDebt > 0
        ? positionNodes("lead_settles", { coll: collNode })
        : hasColl
          ? positionNodes("lead_no_debt", { coll: collNode })
          : null;

  const bullets: Bullet[] = [];
  const add = (group: Group, key: string, node: ReactNode) =>
    bullets.push({ group, node: <span key={key}>{node}</span> });

  if (chain.isOpen && chain.price && hasColl) {
    const pethInDebt = chain.price.pethInDebt;
    const collWorth = chain.entireColl * pethInDebt;
    // An entire debt at or below zero owes nothing: it never adds to equity.
    const equity = collWorth - Math.max(0, chain.entireDebt);
    add(
      "holdings",
      "worth",
      positionNodes("worth", {
        price: (
          <Prov info={livePethInDebtProv(chain.market)} value={formatExact(pethInDebt)} symbol={stableSymbol}>
            <H>
              <AmountText value={pethInDebt} />
            </H>
          </Prov>
        ),
        worth: (
          <H>
            <AmountText value={collWorth} />
          </H>
        ),
        stable: stableSymbol,
      }),
    );
    add(
      "holdings",
      "equity",
      positionNodes("equity", {
        equity: (
          <Prov
            echo
            info={liveEquityProv(chain.market)}
            value={withRealMinus(formatExact(equity))}
            symbol={stableSymbol}
          >
            <H>{equity < 0 ? `−${formatNumber(-equity)}` : formatNumber(equity)}</H>
          </Prov>
        ),
        stable: stableSymbol,
      }),
    );
  }

  if (chain.isOpen && hasDebt && chain.icr != null) {
    const minimum = <H>{pctWhole(mcr)}</H>;
    if (chain.icr < mcr) add("risk", "below", positionNodes("below", { mcr: minimum }));
    else {
      const drop = 1 - mcr / chain.icr;
      add(
        "risk",
        "drop",
        drop > 0.995
          ? positionNodes("drop_far", { mcr: minimum })
          : positionNodes("drop", { drop: <H>{pctWhole(drop)}</H>, mcr: minimum }),
      );
    }
  }

  if (chain.isOpen) {
    const defensive = <H>{pctWhole(chain.defensiveMcr)}</H>;
    add("risk", "mode", positionNodes(chain.defensiveMode ? "mode_defensive" : "mode_normal", { defensive }));
  }

  if (chain.isOpen && (hasDebt || chain.recordedDebt > 0))
    add(
      "rate",
      "rate",
      positionNodes("rate", {
        primary: <H>{pct2(chain.primaryRate)}</H>,
        secondary: <H>{pct2(chain.secondaryRate)}</H>,
      }),
    );

  if (chain.isOpen && chain.owner) {
    const moved = transferCount ?? 0;
    add(
      "history",
      "holder",
      moved === 0
        ? positionNodes("holder")
        : moved === 1
          ? positionNodes("holder_one")
          : positionNodes("holder_many", { transfers: <H>{moved.toLocaleString("en-US")}</H> }),
    );
  }

  if (!chain.isOpen && terminal && lifetime && lifetime.rows > 0) {
    const leg = (kind: PolarisLifetimeLeg, unit: string, value: number): ReactNode => (
      <Prov info={lifetimeLegProv(kind, unit, chain.market)} value={formatExact(value)} symbol={unit}>
        <H>
          <AmountText value={value} />
        </H>
      </Prov>
    );
    const deposited = lifetime.deposited > 0;
    const withdrawn = lifetime.withdrawn > 0;
    if (deposited || withdrawn)
      add(
        "history",
        "coll",
        positionNodes(deposited && withdrawn ? "life_coll" : deposited ? "life_coll_in" : "life_coll_out", {
          deposited: leg("deposited", "pETH", lifetime.deposited),
          withdrawn: leg("withdrawn", "pETH", lifetime.withdrawn),
        }),
      );
    const borrowed = lifetime.borrowed > 0;
    const repaid = lifetime.repaid > 0;
    if (borrowed || repaid)
      add(
        "history",
        "debt",
        positionNodes(borrowed && repaid ? "life_debt" : borrowed ? "life_debt_in" : "life_debt_out", {
          borrowed: leg("borrowed", stableSymbol, lifetime.borrowed),
          repaid: leg("repaid", stableSymbol, lifetime.repaid),
          stable: stableSymbol,
        }),
      );
    if (lifetime.interestCharged > 0)
      add(
        "history",
        "interest",
        positionNodes("life_interest", {
          interest: leg(LIFETIME_LEGS.interest, stableSymbol, lifetime.interestCharged),
          stable: stableSymbol,
        }),
      );
    if (lifetime.collFromPsm > 0 || lifetime.debtFromPsm > 0)
      add(
        "history",
        "psm_in",
        positionNodes("life_psm_in", {
          psm_coll_in: leg(LIFETIME_LEGS.psmCollIn, "pETH", lifetime.collFromPsm),
          psm_debt_in: leg(LIFETIME_LEGS.psmDebtIn, stableSymbol, lifetime.debtFromPsm),
          stable: stableSymbol,
        }),
      );
    if (lifetime.collToPsm > 0 || lifetime.debtToPsm > 0)
      add(
        "history",
        "psm_out",
        positionNodes("life_psm_out", {
          psm_coll_out: leg(LIFETIME_LEGS.psmCollOut, "pETH", lifetime.collToPsm),
          psm_debt_out: leg(LIFETIME_LEGS.psmDebtOut, stableSymbol, lifetime.debtToPsm),
          stable: stableSymbol,
        }),
      );
    if (terminal === "liquidated" && (lifetime.collLiquidated > 0 || lifetime.debtLiquidated > 0))
      add(
        "history",
        "liquidation",
        positionNodes("life_liq", {
          seized: leg(LIFETIME_LEGS.seized, "pETH", lifetime.collLiquidated),
          cleared: leg(LIFETIME_LEGS.cleared, stableSymbol, lifetime.debtLiquidated),
          stable: stableSymbol,
        }),
      );
  }

  if (lead == null && bullets.length === 0) return null;

  return <ProseExplainer paragraph={lead} items={arrange(bullets)} />;
}
