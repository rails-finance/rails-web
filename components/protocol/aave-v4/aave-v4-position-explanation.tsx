"use client";

// The Aave V4 position card's explanation (zone Z1): a lead, then bullets
// under Holdings, Risk, Rate and History when two of them hold two or more
// bullets, the lead then standing as the first group's first bullet (rails-ops
// standards/prose-limits-and-zones.md 3.3). The words are
// content/aave-v4/event-prose.yaml's `position_words`; this file chooses which
// to say and draws each figure bold, with the receipt the card's cell gives
// the same figure (lib/aave-v4/position-provenance.ts). The mechanisms behind
// the figures (the collateral factor, the health factor, the risk premium,
// the spoke) are the card's "?" (`L5.position` in the same file).

import type { ReactNode } from "react";
import {
  type AaveSpokeCardInfo,
  type AaveV4InterestPnl,
  liquidationBuffer,
  yearlyDebtCost,
} from "@/lib/aave-v4/spoke-cards";
import { fmtUsd, hfProseV4, fmtLiqPrice } from "@/lib/aave-v4/format";
import { formatCompact } from "@/lib/shared/format-compact";
import { useSpokeCollateralFactors } from "@/lib/aave-v4/use-spoke-collateral-factors";
import type { ClosedCollateralFactors } from "@/lib/aave-v4/use-closed-collateral-factors";
import { aaveV4DisplaySymbol } from "@/lib/aave-v4/pt-tokens";
import { Prov } from "@/components/shared/provenance";
import { H, ProseExplainer } from "@/lib/shared/explainer-prose";
import { useEnsName } from "@/lib/ens/use-ens-names";
import type { ExternalActorSummary } from "@/lib/shared/external-actor";
import { positionWords, V4_WORDS } from "@/lib/aave-v4/event-templates";
import { positionNodes } from "@/lib/aave-v4/position-nodes";
import { arrangeByHeading } from "@/lib/shared/event-prose/nodes";
import {
  healthFactorProv,
  liqRatioProv,
  LIQ_PRICE_PROV,
  LIQ_DROP_PROV,
  COLL_USD_PROV,
  SUPPLY_USD_PROV,
  DEBT_USD_PROV,
  BORROW_RATE_PROV,
  YEARLY_COST_PROV,
  PEAK_COLL_PROV,
  PEAK_DEBT_PROV,
  SUPPLY_INTEREST_PROV,
  BORROW_INTEREST_PROV,
} from "@/lib/aave-v4/position-provenance";

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

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Asset symbols joined for a sentence ("wstETH, WBTC and USDC"). */
function joinSymbols(syms: string[]): string {
  const names = syms.map(aaveV4DisplaySymbol);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ${V4_WORDS.and} ${names[names.length - 1]}`;
}

/** The given assets' collateral factors on this spoke ("sUSDe at 92% and USDe
 *  at 93%"), and the one factor when there is one asset. Null when none is known. */
function cfList(symbols: string[], cfs: Map<string, number>): { text: string; single: number | null } | null {
  const known = symbols.filter((sym) => cfs.has(sym));
  if (known.length === 0) return null;
  const parts = known.map((sym) =>
    positionWords("cf_item", { symbol: aaveV4DisplaySymbol(sym), cf: `${Math.round(cfs.get(sym)! * 100)}%` }),
  );
  const text =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} ${V4_WORDS.and} ${parts[parts.length - 1]}`;
  return { text, single: known.length === 1 && symbols.length === 1 ? cfs.get(known[0])! : null };
}

const usd = (n: number) => fmtUsd(n).display;
const pct = (f: number) => `${Math.round(f * 100)}%`;

/** The interest bullet: the card's two interest aggregates (its stat
 *  footnotes, bold) where each is a cent or more, with the caveat when part
 *  of the position came through a swap aggregator. */
function interestBullet(pnl: AaveV4InterestPnl | null | undefined): ReactNode | null {
  if (!pnl) return null;
  if (!pnl.hasData) return pnl.unattributed ? positionNodes("interest_unknown") : null;
  const earned = pnl.assets.reduce((sum, a) => sum + a.supplyInterestUsd, 0);
  const paid = pnl.assets.reduce((sum, a) => sum + a.borrowInterestUsd, 0);
  const earned_usd = (
    <H>
      <Prov info={SUPPLY_INTEREST_PROV}>{usd(earned)}</Prov>
    </H>
  );
  const paid_usd = (
    <H>
      <Prov info={BORROW_INTEREST_PROV}>{usd(paid)}</Prov>
    </H>
  );
  const part = pnl.unattributed;
  if (earned >= 0.01 && paid >= 0.01)
    return positionNodes(part ? "interest_both_part" : "interest_both", { earned_usd, paid_usd });
  if (paid >= 0.01) return positionNodes(part ? "interest_paid_part" : "interest_paid", { paid_usd });
  if (earned >= 0.01) return positionNodes(part ? "interest_earned_part" : "interest_earned", { earned_usd });
  return null;
}

/** The peaks, where a peak stands above today's figure. */
function peaksBullet(spoke: AaveSpokeCardInfo, open: boolean): ReactNode | null {
  const supplyAbove = spoke.peakSupplyUsd > 1 && (!open || spoke.peakSupplyUsd > spoke.totalSupplyUsd * 1.01);
  const debtAbove = spoke.peakDebtUsd > 1 && (!open || spoke.peakDebtUsd > spoke.totalDebtUsd * 1.01);
  const peak_supply = (
    <H>
      <Prov info={PEAK_COLL_PROV}>{usd(spoke.peakSupplyUsd)}</Prov>
    </H>
  );
  const peak_debt = (
    <H>
      <Prov info={PEAK_DEBT_PROV}>{usd(spoke.peakDebtUsd)}</Prov>
    </H>
  );
  if (supplyAbove && debtAbove) return positionNodes("peaks_both", { peak_supply, peak_debt });
  if (supplyAbove) return positionNodes("peaks_supply", { peak_supply });
  if (debtAbove) return positionNodes("peaks_debt", { peak_debt });
  return null;
}

/** A read of the open position: a lead on what it holds and owes, then one
 *  bullet per fact under its heading. Every figure is read from the
 *  AaveSpokeCardInfo the card already computed. */
function openBullets(spoke: AaveSpokeCardInfo): { lead: ReactNode; bullets: Bullet[] } {
  const bullets: Bullet[] = [];
  const add = (group: Group, key: string, node: ReactNode | null) => {
    if (node) bullets.push({ group, node: <span key={key}>{node}</span> });
  };
  // Any live debt counts, so "no debt" is said only at a debt of 0.
  const supplyOnly = spoke.totalDebtUsd <= 0;
  const supplyStr = joinSymbols(spoke.supplyingSymbols);
  const borrowStr = joinSymbols(spoke.borrowingSymbols);
  const supply_usd = (
    <H>
      <Prov info={SUPPLY_USD_PROV}>{usd(spoke.totalSupplyUsd)}</Prov>
    </H>
  );
  const debt_usd = (
    <H>
      <Prov info={DEBT_USD_PROV}>{usd(spoke.totalDebtUsd)}</Prov>
    </H>
  );
  const name = (s: string) => <span className="text-foreground/90 font-medium">{s}</span>;

  let lead: ReactNode;
  if (supplyOnly) {
    lead = supplyStr
      ? positionNodes("lead_supply", { supply_usd, supply_assets: name(supplyStr) })
      : positionNodes("lead_supply_bare", { supply_usd });
    add("holdings", "interest", interestBullet(spoke.interestPnl));
    add("risk", "no-risk", positionNodes("no_debt"));
    if (spoke.borrowingPowerUsd > 1)
      add("risk", "power", positionNodes("capacity_no_debt", { capacity: usd(spoke.borrowingPowerUsd) }));
    add("history", "peaks", peaksBullet(spoke, true));
    add("history", "record", recordBullet(spoke));
    return { lead, bullets };
  }

  // The card's Collateral cell: the supplies enabled as collateral.
  const collStr = joinSymbols(spoke.supplyBreakdown.collateralSymbols);
  const coll_usd = (
    <H>
      <Prov info={COLL_USD_PROV}>{usd(spoke.supplyBreakdown.collateralUsd)}</Prov>
    </H>
  );
  lead =
    collStr && borrowStr
      ? positionNodes("lead", {
          coll_usd,
          coll_assets: name(collStr),
          debt_usd,
          debt_assets: name(borrowStr),
        })
      : positionNodes("lead_bare", { coll_usd, debt_usd });

  // ── Holdings ──
  add("holdings", "interest", interestBullet(spoke.interestPnl));

  // ── Risk ──
  if (spoke.healthFactor != null) {
    const hf = (
      <H>
        <Prov info={healthFactorProv(spoke.healthFactorBasis)}>{hfProseV4(spoke.healthFactor)}</Prov>
      </H>
    );
    add("risk", "hf", positionNodes("hf_only", { hf }));
  }
  const buf = liquidationBuffer(spoke);
  const single = buf.single;
  if (buf.atLine) {
    if (single?.against)
      add(
        "risk",
        "liq",
        positionNodes("at_line_against", {
          liq_symbol: aaveV4DisplaySymbol(single.symbol),
          against_symbol: aaveV4DisplaySymbol(single.against.symbol),
        }),
      );
    else if (single) add("risk", "liq", positionNodes("at_line", { liq_symbol: aaveV4DisplaySymbol(single.symbol) }));
    else add("risk", "liq", positionNodes("at_line_basket"));
  } else if (buf.dropPct != null && !buf.liquidatable) {
    const drop = (
      <H>
        <Prov info={LIQ_DROP_PROV}>{buf.dropPct.toFixed(0)}%</Prov>
      </H>
    );
    if (single?.against) {
      // Collateral and debt move together in dollars: the runway is read
      // against the debt asset.
      const debtSym = aaveV4DisplaySymbol(single.against.symbol);
      add(
        "risk",
        "liq",
        positionNodes("liq_against", {
          liq_symbol: aaveV4DisplaySymbol(single.symbol),
          against_symbol: debtSym,
          drop,
          liq_ratio: (
            <H>
              <Prov info={liqRatioProv(aaveV4DisplaySymbol(single.symbol), debtSym)}>
                {single.against.liqRatio.toLocaleString("en-US", { maximumFractionDigits: 4 })} {debtSym}
              </Prov>
            </H>
          ),
        }),
      );
    } else if (single)
      add(
        "risk",
        "liq",
        positionNodes("liq_single", {
          liq_symbol: aaveV4DisplaySymbol(single.symbol),
          drop,
          liq_price: (
            <H>
              <Prov info={LIQ_PRICE_PROV}>{fmtLiqPrice(single.liqPrice)}</Prov>
            </H>
          ),
        }),
      );
    else add("risk", "liq", positionNodes("liq_basket", { drop }));
  }
  if (spoke.borrowingPowerUsd > 1)
    add("risk", "power", positionNodes("capacity", { capacity: usd(spoke.borrowingPowerUsd) }));

  // ── Rate ──
  if (spoke.latestBorrowRate != null) {
    const rate = (
      <H>
        <Prov info={BORROW_RATE_PROV}>{spoke.latestBorrowRate.toFixed(2)}%</Prov>
      </H>
    );
    const y = yearlyDebtCost(spoke);
    const yearly =
      y && y.amount > 0 ? (
        <H>
          <Prov info={YEARLY_COST_PROV}>{formatCompact(y.amount)}</Prov> {aaveV4DisplaySymbol(y.symbol)}
        </H>
      ) : null;
    // The rate names its asset where the position has borrowed more than one.
    const sym =
      spoke.debtReserveHistory.length > 1 && spoke.latestBorrowRateSymbol
        ? aaveV4DisplaySymbol(spoke.latestBorrowRateSymbol)
        : null;
    add(
      "rate",
      "rate",
      sym
        ? yearly
          ? positionNodes("rate_sym_yearly", { rate_symbol: sym, rate, yearly })
          : positionNodes("rate_sym", { rate_symbol: sym, rate })
        : yearly
          ? positionNodes("rate", { rate, yearly })
          : positionNodes("rate_plain", { rate }),
    );
  }

  // ── History ──
  add("history", "peaks", peaksBullet(spoke, true));
  add("history", "record", recordBullet(spoke));
  // A debt asset owed earlier and owed no more.
  const gone = spoke.debtReserveHistory.filter((r) => !spoke.borrowingSymbols.includes(r.symbol));
  if (gone.length > 0 && spoke.borrowingSymbols.length > 0 && !spoke.wasLiquidated)
    add(
      "history",
      "debt-mix",
      positionNodes("debt_mix", { gone_assets: joinSymbols(gone.map((r) => r.symbol)), debt_assets: borrowStr }),
    );
  return { lead, bullets };
}

/** The record's count: the transactions, and the liquidations beside them. */
function recordBullet(spoke: AaveSpokeCardInfo): ReactNode | null {
  const tx_count = <H>{spoke.txCount.toLocaleString("en-US")}</H>;
  if (spoke.wasLiquidated && spoke.liquidationCount > 0)
    return spoke.liquidationCount === 1
      ? positionNodes("record_liq_one", { tx_count })
      : positionNodes("record_liq", { tx_count, liq_count: <H>{spoke.liquidationCount}</H> });
  if (spoke.txCount > 1) return positionNodes("record", { tx_count });
  if (spoke.txCount === 1) return positionNodes("record_one");
  return null;
}

/**
 * The open position's explanation panel. The spoke's mechanics (hub and
 * spoke, collateral factor, health factor, risk premium) are the "?" modal's.
 */
export function AaveV4PositionExplanation({
  spoke,
  embedded = false,
  externalActivity,
}: {
  spoke: AaveSpokeCardInfo;
  /** When true, drop the panel chrome (bg / rounding / padding) so the
   *  explanation can sit inside a host container that already provides it. */
  embedded?: boolean;
  /** Who executed this spoke position's events, reduced over the spoke-scoped
   *  history the page already holds. Omit to skip the operator bullet: the
   *  multi-spoke selectors and the listing cards have no event stream in hand. */
  externalActivity?: ExternalActorSummary;
}) {
  const leadName = useEnsName(externalActivity?.actors[0]?.address ?? null);
  const { lead, bullets } = openBullets(spoke);

  // The position managers that sent events on this spoke: the spoke's `caller`
  // against the owner, reduced over the spoke's history by the page. The
  // bullet carries its denominator, the events recorded on this spoke.
  const ext = externalActivity;
  if (ext && ext.external > 0) {
    const external = ext.external.toLocaleString("en-US");
    const total = ext.total.toLocaleString("en-US");
    const one = ext.actors.length === 1 ? ext.actors[0] : null;
    bullets.push({
      group: "history",
      node: (
        <span key="operators">
          {one
            ? positionNodes("operators_one", { external, total, actor: leadName ?? short(one.address) })
            : positionNodes("operators", { external, total })}
        </span>
      ),
    });
  }

  return (
    <div
      className={
        // Muted body prose (text-rb-500) so the <H> highlights on key figures
        // stand out. No heading inside the pane (charter §4).
        embedded
          ? "text-sm text-rb-500 space-y-3"
          : "rounded-lg bg-rb-100 dark:bg-rb-950 px-4 py-3 text-sm text-rb-500 space-y-3"
      }
    >
      <ProseExplainer paragraph={lead} items={arrange(bullets)} />
    </div>
  );
}

/** A closed spoke position, from its recorded history. Outcome is a history
 *  fact: any liquidation on the record marks it liquidated (rails-ops
 *  TO-DO-ui-jobs.md item 97), so this never credits the owner with repaying a
 *  debt a seizure cleared. The lead says how it ended: by the seizure, by
 *  the owner after seizures, or by the owner alone. */
export function AaveV4ClosedExplanation({
  spoke,
  embedded = false,
  factorsThen,
}: {
  spoke: AaveSpokeCardInfo;
  embedded?: boolean;
  /** The collateral factors that applied while the position was open, read
   *  from the spoke (useClosedCollateralFactors). Without them the bullet
   *  names today's factors and says so. */
  factorsThen?: ClosedCollateralFactors;
}) {
  const supplyOnly = spoke.peakDebtUsd < 1;
  const cfsNow = useSpokeCollateralFactors(spoke.name);
  const then =
    factorsThen?.status === "ok" ? new Map([...factorsThen.factors].map(([sym, f]) => [sym, f.factor] as const)) : null;
  // While the read is in flight the bullet waits, so today's factors never
  // stand in for a moment as the factors of the past.
  const pending = factorsThen?.status === "loading";
  const perAsset = supplyOnly || pending ? null : cfList(spoke.suppliedSymbolsEver, then ?? cfsNow);
  const lead = spoke.endedByLiquidation
    ? positionNodes("closed_lead_seized", { spoke: spoke.name })
    : spoke.wasLiquidated
      ? positionNodes("closed_lead_after_liq", { spoke: spoke.name })
      : supplyOnly
        ? positionNodes("closed_lead_owner_supply", { spoke: spoke.name })
        : positionNodes("closed_lead_owner", { spoke: spoke.name });

  const bullets: Bullet[] = [];
  const add = (group: Group, key: string, node: ReactNode | null) => {
    if (node) bullets.push({ group, node: <span key={key}>{node}</span> });
  };
  if (spoke.wasLiquidated && spoke.liquidationCount > 0)
    add(
      "history",
      "seizures",
      spoke.liquidationCount === 1
        ? positionNodes("seizure_one")
        : positionNodes("seizures", { liq_count: <H>{spoke.liquidationCount}</H> }),
    );
  add("history", "peaks", peaksBullet(spoke, false));
  if (perAsset) {
    const coll_symbol = aaveV4DisplaySymbol(spoke.suppliedSymbolsEver[0]);
    const cf = perAsset.single != null ? pct(perAsset.single) : null;
    add(
      "history",
      "collateral-factor",
      then
        ? cf
          ? positionNodes("cf_then", { coll_symbol, cf })
          : positionNodes("cf_then_many", { cf_list: perAsset.text })
        : cf
          ? positionNodes("cf_now", { coll_symbol, cf })
          : positionNodes("cf_now_many", { cf_list: perAsset.text }),
    );
  }

  return (
    <div
      className={
        embedded
          ? "text-sm text-rb-500 space-y-3"
          : "rounded-lg bg-rb-100 dark:bg-rb-950 px-4 py-3 text-sm text-rb-500 space-y-3"
      }
    >
      <ProseExplainer paragraph={lead} items={arrange(bullets)} />
    </div>
  );
}
