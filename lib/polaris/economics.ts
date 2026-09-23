// Polaris economics — the dual tower in NATIVE UNITS (pETH / the stablecoin).
// ----------------------------------------------------------------------------
// Token mode: the collateral side stacks in pETH and the debt side in USDp or
// GOLDp, so the two towers are not height-comparable and the component labels
// them so. USD is not stacked — the protocol prices pETH in its debt unit, not
// its debt in dollars, so a dollar debt tower would assert a par the chain
// never states. (The card carries the collateral's USD from the protocol's
// own feed; that is a figure, not a bar.)
//
// Current lines come from the card view — the live overlay's entire figures
// where they landed, the last CDPUpdated's resulting figures otherwise. The
// lifetime layer sums the ledger's own legs, one bucket per leg:
//
//   collateral: deposited (holder) · withdrawn (holder) · liquidated (op 3)
//               · PSM mint shares in, PSM redemption shares out · reward pETH
//   debt:       borrowed (holder) · repaid (holder) · liquidated (op 3)
//               · interest charged · stability gains · PSM mint shares in,
//               PSM redemption shares out · minted to settle a residual
//
// The reconcile gate is the replay identity itself: every side's signed legs
// must sum to the last row's resulting figure. They do on every transition
// the ledger has emitted; if a captured history ever fell short the gate
// keeps the lifetime layer off rather than posing a partial window as a life.

import type { PolarisPositionView } from "@/components/protocol/polaris/polaris-position-card";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isPolarisEvent } from "@/lib/shared/types/event-shape";
import { latestStateProv, lifetimeLegProv, type PolarisLifetimeLeg } from "@/lib/polaris/event-provenance";
import { liveEntireProv, livePendingProv } from "@/lib/polaris/live-provenance";
import { PETH } from "@/lib/polaris/asset-catalog";
import { flowsReconcile, type ChainTruthTowerData, type TowerLine } from "@/lib/shared/chain-truth-economics";

const DUST = 1e-9;

export interface PolarisLifetime {
  deposited: number;
  withdrawn: number;
  collLiquidated: number;
  collFromPsm: number;
  collToPsm: number;
  rewardPeth: number;
  borrowed: number;
  repaid: number;
  debtLiquidated: number;
  interestCharged: number;
  stableGains: number;
  debtFromPsm: number;
  debtToPsm: number;
  mintedToSettle: number;
  /** Σ over every priced PSM-share row of `mintRedeemCollGain × priceAtBlock
   *  − mintRedeemDebtGain` — the CDP's equity effect from the PSM's shares,
   *  valued at the feed at the END of the block each share settled onto this
   *  CDP at its own touch (never the price the PSM's own mint or redemption
   *  used — the share accrued between touches at a different price). A row
   *  with a zero coll leg and a non-zero debt leg contributes `−debt` and is
   *  classified by the debt leg's sign (plan §1a). */
  psmEffectAtSettle: number;
  /** The slice of `psmEffectAtSettle` from rows whose coll leg is negative
   *  (or, when the coll leg is zero, whose debt leg is negative) — a PSM
   *  redemption's pro-rata share settling onto this CDP. */
  psmRedemptionEffectAtSettle: number;
  /** The slice of `psmEffectAtSettle` from rows whose coll leg is positive
   *  (or, when zero, whose debt leg is positive) — a PSM mint's share. */
  psmMintEffectAtSettle: number;
  /** PSM-share rows (a non-zero mint/redeem leg) with no `priceAtBlock` yet —
   *  omitted from the three sums above, so a partial oracle-at-block backfill
   *  never silently drops part of the effect without saying so. */
  psmRowsUnpriced: number;
  /** The last row's resulting figures — what the sums must add up to. */
  lastColl: number;
  lastDebt: number;
  rows: number;
}

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};

/** Sum the ledger's legs over the CDP's rows. Exported for the markdown
 *  export, which states the same figures in words. */
export function polarisLifetime(events: BaseActivityEvent[]): PolarisLifetime {
  const f: PolarisLifetime = {
    deposited: 0,
    withdrawn: 0,
    collLiquidated: 0,
    collFromPsm: 0,
    collToPsm: 0,
    rewardPeth: 0,
    borrowed: 0,
    repaid: 0,
    debtLiquidated: 0,
    interestCharged: 0,
    stableGains: 0,
    debtFromPsm: 0,
    debtToPsm: 0,
    mintedToSettle: 0,
    psmEffectAtSettle: 0,
    psmRedemptionEffectAtSettle: 0,
    psmMintEffectAtSettle: 0,
    psmRowsUnpriced: 0,
    lastColl: 0,
    lastDebt: 0,
    rows: 0,
  };
  const rows = [...events].sort((a, b) => a.blockNumber - b.blockNumber || a.id.localeCompare(b.id));
  for (const ev of rows) {
    if (!isPolarisEvent(ev)) continue;
    const c = ev.context.data;
    if (c.eventType === "transfer") continue;
    f.rows++;
    const dColl = num(c.collChange);
    const dDebt = num(c.debtChange);
    if (c.eventType === "liquidate") {
      // The whole position went: the log's own signed legs carry the seizure.
      if (dColl < 0) f.collLiquidated += -dColl;
      if (dDebt < 0) f.debtLiquidated += -dDebt;
    } else {
      if (dColl > 0) f.deposited += dColl;
      if (dColl < 0) f.withdrawn += -dColl;
      if (dDebt > 0) f.borrowed += dDebt;
      if (dDebt < 0) f.repaid += -dDebt;
    }
    const mrColl = num(c.mintRedeemCollGain);
    if (mrColl > 0) f.collFromPsm += mrColl;
    if (mrColl < 0) f.collToPsm += -mrColl;
    const mrDebt = num(c.mintRedeemDebtGain);
    if (mrDebt > 0) f.debtFromPsm += mrDebt;
    if (mrDebt < 0) f.debtToPsm += -mrDebt;
    // The PSM's effect on this CDP's equity, valued at the feed this row's
    // own priceAtBlock carries — the feed at the END of the block this touch
    // settled in, not the price the PSM's own mint or redemption used.
    if (mrColl !== 0 || mrDebt !== 0) {
      const price = c.priceAtBlock?.pethInDebt;
      if (price == null) {
        f.psmRowsUnpriced++;
      } else {
        const effect = mrColl * price - mrDebt;
        f.psmEffectAtSettle += effect;
        const isRedemption = mrColl !== 0 ? mrColl < 0 : mrDebt < 0;
        if (isRedemption) f.psmRedemptionEffectAtSettle += effect;
        else f.psmMintEffectAtSettle += effect;
      }
    }
    f.rewardPeth += num(c.bcTokenGain);
    f.interestCharged += num(c.accruedInterest);
    f.stableGains += num(c.stableGain);
    f.mintedToSettle += num(c.stablesMintedToEnsureZeroDebt);
    f.lastColl = num(c.newColl);
    f.lastDebt = num(c.newDebt);
  }
  return f;
}

export function computePolarisEconomics(view: PolarisPositionView, events?: BaseActivityEvent[]): ChainTruthTowerData {
  const stable = view.stableSymbol;
  const market = view.market;

  const collProv = view.basis === "chain" ? liveEntireProv("coll", market) : latestStateProv("coll", market);
  const debtProv = view.basis === "chain" ? liveEntireProv("debt", market) : latestStateProv("debt", market);

  const supplyLines: TowerLine[] =
    view.coll > DUST
      ? [
          {
            key: "collateral",
            symbol: PETH.symbol,
            amount: view.coll,
            usd: null,
            address: PETH.address,
            prov: collProv,
          },
        ]
      : [];

  // On the chain lane the debt figure is the entire debt, and the interest
  // pending since the last touch is its own getter — so the split is real:
  // principal-to-date beneath, pending interest on top, summing to the whole.
  const pendingInterest = view.basis === "chain" ? (view.pendingInterest ?? 0) : 0;
  const principal = Math.max(0, view.debt - Math.min(pendingInterest, view.debt));
  const debtLines: TowerLine[] =
    principal > DUST ? [{ key: "debt", symbol: stable, amount: principal, usd: null, prov: debtProv }] : [];
  const interestLine: TowerLine | null =
    view.basis === "chain" && pendingInterest > DUST
      ? {
          key: "interest-pending",
          symbol: stable,
          amount: pendingInterest,
          usd: null,
          prov: livePendingProv("accruedInterest", market),
        }
      : null;

  const lifetime = events && events.length > 0 ? polarisLifetime(events) : null;
  // The replay identity as the gate: each side's signed legs sum to the last
  // row's resulting figure. Gross is the sum of magnitudes, for the epsilon.
  const collNet = lifetime
    ? lifetime.deposited -
      lifetime.withdrawn -
      lifetime.collLiquidated +
      lifetime.collFromPsm -
      lifetime.collToPsm +
      lifetime.rewardPeth
    : 0;
  const collGross = lifetime
    ? lifetime.deposited +
      lifetime.withdrawn +
      lifetime.collLiquidated +
      lifetime.collFromPsm +
      lifetime.collToPsm +
      lifetime.rewardPeth
    : 0;
  const debtNet = lifetime
    ? lifetime.borrowed -
      lifetime.repaid -
      lifetime.debtLiquidated +
      lifetime.interestCharged -
      lifetime.stableGains +
      lifetime.debtFromPsm -
      lifetime.debtToPsm +
      lifetime.mintedToSettle
    : 0;
  const debtGross = lifetime
    ? lifetime.borrowed +
      lifetime.repaid +
      lifetime.debtLiquidated +
      lifetime.interestCharged +
      lifetime.stableGains +
      lifetime.debtFromPsm +
      lifetime.debtToPsm +
      lifetime.mintedToSettle
    : 0;
  const collOk = lifetime != null && lifetime.rows > 0 && flowsReconcile(collNet, lifetime.lastColl, collGross);
  const debtOk = lifetime != null && lifetime.rows > 0 && flowsReconcile(debtNet, lifetime.lastDebt, debtGross);

  const line = (
    ok: boolean,
    key: string,
    symbol: string,
    amount: number,
    leg: PolarisLifetimeLeg,
    extra: Partial<Pick<TowerLine, "flowLabel" | "flowKind" | "address">> = {},
  ): TowerLine[] =>
    ok && amount > DUST
      ? [{ key, symbol, amount, usd: null, prov: lifetimeLegProv(leg, symbol, market), ...extra }]
      : [];

  return {
    valued: false,
    collateralUnit: PETH.symbol,
    debtUnit: stable,
    debtListLabel: `Debt · ${stable} owed`,
    collateral: {
      current: supplyLines,
      interest: null,
      exited: [
        ...line(collOk, "coll-withdrawn", PETH.symbol, lifetime?.withdrawn ?? 0, "withdrawn", {
          address: PETH.address,
        }),
        ...line(collOk, "coll-to-psm", PETH.symbol, lifetime?.collToPsm ?? 0, "pETH to PSM redemptions", {
          flowLabel: "PSM redemption share",
          flowKind: "redeemed",
          address: PETH.address,
        }),
      ],
      liquidated: line(collOk, "coll-liquidated", PETH.symbol, lifetime?.collLiquidated ?? 0, "collateral liquidated", {
        address: PETH.address,
      }),
      received: [
        ...line(collOk, "coll-from-psm", PETH.symbol, lifetime?.collFromPsm ?? 0, "pETH from PSM mints", {
          flowLabel: "PSM mint share",
          flowKind: "external",
          address: PETH.address,
        }),
        ...line(collOk, "coll-reward", PETH.symbol, lifetime?.rewardPeth ?? 0, "reward pETH", {
          flowLabel: "Reward pETH",
          address: PETH.address,
        }),
      ],
      lifetimeInflow: collOk ? (lifetime?.deposited ?? 0) : 0,
    },
    debt: {
      current: debtLines,
      interest: interestLine,
      exited: [
        ...line(debtOk, "debt-repaid", stable, lifetime?.repaid ?? 0, "repaid"),
        ...line(debtOk, "debt-stable-gains", stable, lifetime?.stableGains ?? 0, "stability gains", {
          flowLabel: "Stability gains",
        }),
        ...line(debtOk, "debt-to-psm", stable, lifetime?.debtToPsm ?? 0, "debt cleared by PSM redemptions", {
          flowLabel: "PSM redemption share",
          flowKind: "redeemed",
        }),
      ],
      liquidated: line(debtOk, "debt-liquidated", stable, lifetime?.debtLiquidated ?? 0, "debt liquidated"),
      received: [
        ...line(debtOk, "debt-from-psm", stable, lifetime?.debtFromPsm ?? 0, "debt from PSM mints", {
          flowLabel: "PSM mint share",
          flowKind: "external",
        }),
        ...line(debtOk, "debt-minted-to-settle", stable, lifetime?.mintedToSettle ?? 0, "minted to settle", {
          flowLabel: "Minted to settle",
        }),
      ],
      costs: line(debtOk, "debt-interest-charged", stable, lifetime?.interestCharged ?? 0, "interest charged", {
        flowLabel: "Interest charged",
      }),
      lifetimeInflow: debtOk ? (lifetime?.borrowed ?? 0) : 0,
    },
    interestLabel: "Pending interest",
    interestNote:
      view.basis === "chain"
        ? "Interest accrues continuously at the market's rate and is written into the debt at each touch; the figure on top is what has accrued since the last touch and is not yet written in. The interest already charged over the CDP's life is listed beside the flows. Units are native — pETH on one side, the market's stablecoin on the other — so the two towers are not height-comparable."
        : "The debt figure is the CDP's debt as of its last touch; interest accrued since then appears once the live figures land. Units are native — pETH on one side, the market's stablecoin on the other — so the two towers are not height-comparable.",
    flowsNote:
      lifetime != null
        ? undefined
        : "Lifetime flows for this CDP aren't available yet — they appear once its history is in place.",
  };
}
