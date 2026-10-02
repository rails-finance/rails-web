// Polaris lifetime sums — the CDP's ledger legs summed over its rows, in
// NATIVE UNITS (pETH / the stablecoin), one bucket per leg:
//
//   collateral: deposited (holder) · withdrawn (holder) · liquidated (op 3)
//               · PSM mint shares in, PSM redemption shares out · reward pETH
//   debt:       borrowed (holder) · repaid (holder) · liquidated (op 3)
//               · interest charged · stability gains · PSM mint shares in,
//               PSM redemption shares out · minted to settle a residual
//
// The card's Explanation, the PSM outcome strip on the Lifetime flows panel
// and the markdown export read them. The panel's own replay is
// lib/polaris/flows.ts.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isPolarisEvent } from "@/lib/shared/types/event-shape";

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
