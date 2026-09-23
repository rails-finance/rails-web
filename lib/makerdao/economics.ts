// MakerDAO economics reduction — the chain-state tier's only USD-valued tower.
// ----------------------------------------------------------------------------
// Maker is the one chain-state protocol with a price (the OSM), so it stacks a
// real dual tower. The faithful core is the debt split: principal = the
// normalized art (≈ DAI drawn at rate = 1), accrued stability fee = current DAI
// debt (art × rate) − art. Both come straight off Vat slots read live at head,
// so neither is a projection — the fee carry IS read from the chain (unlike the
// collateral ratio, which stays a <Layer>).
//
// DAI is the debt unit; valued at $1 it doubles as the USD axis, so the debt
// tower lines up with the OSM-priced collateral tower.
//
// Lifetime gross flows: COLLATERAL is exact from dink (collateral doesn't accrue,
// so Σ dink == ink). DEBT is restated in DAI by valuing each historic `dart` at
// the Vat rate accumulator AS OF its block — `rateAtBlock`, the events-MV column
// reconstructed from the captured Vat `fold` deltas (the on-chain call name).
// The completeness gate runs in NORMALIZED art space (Σ dart == art, exact — fee
// accrual would otherwise make a DAI-space reconciliation drift by exactly the
// accrued fee, which is already the interest segment). A payload without
// `rateAtBlock` on every dart-bearing event keeps the debt flows empty —
// suppressed, never mislabeled.

import type { MakerVaultView } from "@/components/protocol/makerdao/makerdao-vault-card";
import {
  vaultInkProv,
  vaultArtProv,
  stabilityFeeProv,
  collateralFlowProv,
  debtFlowProv,
} from "@/lib/makerdao/event-provenance";
import { formatNumber } from "@/lib/utils/format";
import { ilkDebtSymbol, MAKER_STATUS_DUST } from "@/lib/makerdao/asset-catalog";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isMakerDAOEvent } from "@/lib/shared/types/event-shape";
import { type ChainTruthTowerData, type TowerLine, flowsReconcile } from "@/lib/shared/chain-truth-economics";
import { scaleBaseUnits, type TimelineOpeningBalance } from "@/lib/shared/timeline-opening-balance";

const DUST = 1e-9;

/** Lifetime gross flows for one vault, in the reducer's three spaces:
 *  collateral (exact dink sums), NORMALIZED art (the completeness gate's
 *  space), and DAI (each dart valued at its block's rate accumulator).
 *  `haveRate` stays true only while every dart-bearing event carried a rate. */
export interface MakerLifetimeFlows {
  deposited: number;
  withdrawn: number;
  liquidated: number;
  movedIn: number;
  movedOut: number;
  artIn: number;
  artRepay: number;
  artGrab: number;
  artMovedIn: number;
  artMovedOut: number;
  daiGenerated: number;
  daiRepaid: number;
  daiLiquidated: number;
  daiMovedIn: number;
  daiMovedOut: number;
  haveRate: boolean;
}

function replayMakerLifetime(events: BaseActivityEvent[]): MakerLifetimeFlows {
  //  • Collateral (exact): signed dink by kind — deposited / withdrawn / liquidated.
  //  • Debt: signed dart in NORMALIZED art (artIn/artRepay/artGrab) for the exact
  //    completeness gate, AND the same deltas valued in DAI at each event's rate
  //    accumulator (rateAtBlock) for display.
  //  • Vat fork sides (urn→urn position moves): NOT deposits/withdrawals — no
  //    tokens transferred, no debt repaid — so they get their own buckets and
  //    their own reconcile terms. Bucketed by SIGN (a fork-out row carries
  //    negated deltas from the MV, so sign already encodes direction).
  const f: MakerLifetimeFlows = {
    deposited: 0,
    withdrawn: 0,
    liquidated: 0,
    movedIn: 0,
    movedOut: 0,
    artIn: 0,
    artRepay: 0,
    artGrab: 0,
    artMovedIn: 0,
    artMovedOut: 0,
    daiGenerated: 0,
    daiRepaid: 0,
    daiLiquidated: 0,
    daiMovedIn: 0,
    daiMovedOut: 0,
    haveRate: events.length > 0,
  };
  for (const ev of events) {
    if (!isMakerDAOEvent(ev)) continue;
    const d = ev.context.data;
    const isFork = d.eventType === "fork-out" || d.eventType === "fork-in";
    const dink = Number(d.dink);
    if (Number.isFinite(dink) && dink !== 0) {
      if (isFork) {
        if (dink > 0) f.movedIn += dink;
        else f.movedOut += -dink;
      } else if (d.eventType === "grab") {
        if (dink < 0) f.liquidated += -dink;
      } else if (dink > 0) {
        f.deposited += dink;
      } else {
        f.withdrawn += -dink;
      }
    }
    const dart = Number(d.dart);
    if (Number.isFinite(dart) && dart !== 0) {
      // rate@block (ray → multiplier). Missing/degenerate → can't value the DAI.
      const rate = d.rateAtBlock != null ? Number(d.rateAtBlock) / 1e27 : null;
      if (rate == null || !Number.isFinite(rate) || rate <= 0) f.haveRate = false;
      const dai = rate != null && rate > 0 ? Math.abs(dart) * rate : 0;
      if (isFork) {
        if (dart > 0) {
          f.artMovedIn += dart;
          f.daiMovedIn += dai;
        } else {
          f.artMovedOut += -dart;
          f.daiMovedOut += dai;
        }
      } else if (d.eventType === "grab") {
        if (dart < 0) {
          f.artGrab += -dart;
          f.daiLiquidated += dai;
        }
      } else if (dart > 0) {
        f.artIn += dart;
        f.daiGenerated += dai;
      } else {
        f.artRepay += -dart;
        f.daiRepaid += dai;
      }
    }
  }
  return f;
}

/**
 * The lifetime flows for a WINDOWED page: the opening balance's own legs
 * seeded first, the loaded rows' replay added on top. The two halves never
 * overlap — the opening balance covers `block_number < cutoffBlock` and every
 * event passed in is at or after it — so summing them is addition, not
 * reconciliation, and the compute's per-side reconcile gates then check the
 * MERGED totals against the live Vat slots exactly as they always have.
 *
 * The opening legs ride three buckets with their decimals stated —
 * `collateral` (wad, 18), `debt` (normalized art, wad, 18) and `debtDai`
 * (each |dart| valued at the rate accumulator in force at its event; rad, 45)
 * — under the MakerLifetimeFlows field names verbatim. The summarised rows
 * always carry a rate (the events MV seeds one from genesis), so the merged
 * `haveRate` is the loaded half's own verdict. A leg that cannot be scaled
 * returns undefined for the WHOLE layer: a lifetime figure short by whatever
 * the summarised part held is a wrong answer, not a partial one.
 */
export function makerLifetimeWithOpening(
  events: BaseActivityEvent[],
  opening: TimelineOpeningBalance | null | undefined,
): MakerLifetimeFlows | undefined {
  if (!opening) return undefined;
  const f = replayMakerLifetime(events);
  for (const bucket of opening.flows ?? []) {
    for (const [leg, raw] of Object.entries(bucket.legs)) {
      if (!(leg in f) || leg === "haveRate") continue;
      const value = scaleBaseUnits(raw, bucket.decimals);
      if (value == null) return undefined;
      f[leg as Exclude<keyof MakerLifetimeFlows, "haveRate">] += value;
    }
  }
  return f;
}

/** Build the USD dual-tower data for a Maker vault from its (chain-state) view.
 *  All three headline numbers — ink, art, art × rate — are already on the view
 *  (the detail page reads them via eth_call on the Vat). Passing the timeline
 *  adds the COLLATERAL-side lifetime flows (deposited / withdrawn / liquidated,
 *  all exact dink sums) and — once each event carries `rateAtBlock` — the
 *  DEBT-side flows (DAI generated / repaid / liquidated, each dart valued at its
 *  block's rate). Both sides are gated on `flowsReconcile`, so a partial capture
 *  suppresses rather than mislabels them; the debt side additionally needs every
 *  dart-bearing event to carry `rateAtBlock`, so it stays empty until the
 *  events-MV column lands. */
export function computeMakerEconomics(
  view: MakerVaultView,
  events: BaseActivityEvent[] = [],
  /** The merged whole-history flows on a windowed page (see
   *  makerLifetimeWithOpening). Present, it IS the lifetime layer and `events`
   *  takes no part in it; absent, the events replay as they always did. A
   *  windowed page whose opening balance has not arrived passes NEITHER — the
   *  lifetime layer states nothing rather than a window's arithmetic. */
  precomputedLifetime?: MakerLifetimeFlows,
): ChainTruthTowerData {
  const ink = Math.max(0, view.ink);
  const art = Math.max(0, view.art);
  // A terminal vault below the status rule's dust line can still carry a
  // wei-scale trace in either Vat slot. The line renders at true magnitude
  // (never a false zero); its receipt says what the trace is.
  const terminal = view.status !== "open";
  const inkResidue = terminal && ink > 0 && ink <= MAKER_STATUS_DUST;
  const artResidue = terminal && art > 0 && art <= MAKER_STATUS_DUST;
  const artHuman = formatNumber(art);
  // Accrued fee = current DAI debt − principal art. Both are Vat reads, so this
  // is an exact chain read; null only when the rate read was unavailable.
  const accruedFee = view.debtDai != null ? Math.max(0, view.debtDai - art) : null;
  const collSym = view.collateralSymbol;
  // DAI on CdpManager vaults, USDS on LockStake urns — same Vat unit, $1 axis
  // either way (asset-catalog).
  const debtSym = ilkDebtSymbol(view.ilk);
  const price = view.priceUsd;

  // Lifetime flows — the merged whole-history figures on a windowed page, the
  // events' own replay otherwise.
  const {
    deposited,
    withdrawn,
    liquidated,
    movedIn,
    movedOut,
    artIn,
    artRepay,
    artGrab,
    artMovedIn,
    artMovedOut,
    daiGenerated,
    daiRepaid,
    daiLiquidated,
    daiMovedIn,
    daiMovedOut,
    haveRate,
  } = precomputedLifetime ?? replayMakerLifetime(events);
  const usd = (amt: number) => (price != null ? amt * price : null);
  // Only surface lifetime flows when the captured events reconcile to the live
  // ink slot — i.e. the history is complete from open. Otherwise (old vault, only
  // a recent window captured) the sums aren't truly all-time, so we suppress them
  // rather than mislabel a partial window as chain state.
  const collComplete = flowsReconcile(
    deposited + movedIn - withdrawn - liquidated - movedOut,
    ink,
    deposited + movedIn + withdrawn + liquidated + movedOut,
  );
  const flowLine = (
    key: string,
    amt: number,
    flow: "withdrawn" | "liquidated" | "moved out",
    label?: string,
  ): TowerLine[] =>
    collComplete && amt > DUST
      ? [
          {
            key,
            symbol: collSym,
            amount: amt,
            usd: usd(amt),
            prov: collateralFlowProv(flow, collSym),
            ...(label ? { flowLabel: label } : {}),
          },
        ]
      : [];

  // Debt-side gate is in NORMALIZED art (exact: Σ dart == art). The displayed
  // values are in DAI (each dart × rate@block) — they intentionally differ from
  // current DAI debt by the accrued fee, which is the interest segment. Needs
  // rate@block on every dart-bearing event, else stays empty (column not landed).
  const debtComplete =
    haveRate &&
    flowsReconcile(
      artIn + artMovedIn - artRepay - artGrab - artMovedOut,
      art,
      artIn + artMovedIn + artRepay + artGrab + artMovedOut,
    );
  const debtFlowLine = (
    key: string,
    dai: number,
    flow: "repaid" | "liquidated" | "moved out",
    label?: string,
  ): TowerLine[] =>
    debtComplete && dai > DUST
      ? [
          {
            key,
            symbol: debtSym,
            amount: dai,
            usd: dai,
            prov: debtFlowProv(flow),
            ...(label ? { flowLabel: label } : {}),
          },
        ]
      : [];

  return {
    valued: true,
    // The USD scale is the on-chain OSM price (Spotter spot × mat), so the valued
    // bars are chain-derived and survive On-chain-values mode.
    priceKind: "chain-derived",
    collateral: {
      current:
        ink > 0
          ? [
              {
                key: "ink",
                symbol: view.collateralSymbol,
                amount: ink,
                usd: view.collateralUsd,
                prov: vaultInkProv(view.collateralSymbol, view.atBlock, inkResidue, view.source),
              },
            ]
          : [],
      interest: null,
      exited: [
        ...flowLine("coll-withdrawn", withdrawn, "withdrawn"),
        ...flowLine("coll-moved-out", movedOut, "moved out", "Moved out"),
      ],
      liquidated: flowLine("coll-liquidated", liquidated, "liquidated"),
      lifetimeInflow: collComplete ? (price != null ? (deposited + movedIn) * price : deposited + movedIn) : 0,
    },
    debt: {
      current:
        art > 0
          ? [
              {
                key: "principal",
                symbol: debtSym,
                amount: art,
                // DAI valued at $1 — the same axis as the OSM-priced collateral.
                usd: art,
                prov: vaultArtProv(view.atBlock, artResidue, view.source),
              },
            ]
          : [],
      interest:
        accruedFee != null && accruedFee > 0 && view.rate != null
          ? {
              key: "fee",
              symbol: debtSym,
              amount: accruedFee,
              usd: accruedFee,
              prov: stabilityFeeProv(artHuman, view.rate),
            }
          : null,
      exited: [
        ...debtFlowLine("debt-repaid", daiRepaid, "repaid"),
        ...debtFlowLine("debt-moved-out", daiMovedOut, "moved out", "Moved out"),
      ],
      liquidated: debtFlowLine("debt-liquidated", daiLiquidated, "liquidated"),
      lifetimeInflow: debtComplete ? daiGenerated + daiMovedIn : 0,
    },
  };
}
