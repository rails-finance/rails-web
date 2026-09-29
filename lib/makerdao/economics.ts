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
  collateralFlowProv,
  debtFlowProv,
  feeInDebtProv,
  daiDebtProv,
  drawnDaiProv,
  lifetimeFeeProv,
  collateralFlowAtEventsProv,
  returnedCollateralProv,
  collateralPriceChangeProv,
} from "@/lib/makerdao/event-provenance";
import type { MakerLeftoverLink } from "@/lib/makerdao/vault-history";
import { formatDate } from "@/lib/date";
import { formatNumber } from "@/lib/utils/format";
import { ilkDebtSymbol, MAKER_STATUS_DUST } from "@/lib/makerdao/asset-catalog";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isMakerDAOEvent } from "@/lib/shared/types/event-shape";
import { type ChainTruthTowerData, type TowerLine, flowsReconcile } from "@/lib/shared/chain-truth-economics";
import type { ServedFolder } from "@/lib/shared/timeline-folder";
import { folderFlows, mergeFlowBuckets } from "@/lib/shared/timeline-folder-reductions";
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
  /** Collateral an auction handed back that the owner moved into the vault
   *  (counted here, not in `deposited`). */
  returned: number;
  /** The collateral flows valued at the OSM price at each event's block, when
   *  every collateral-moving event has one; null otherwise. */
  atEvents: { deposited: number; withdrawn: number; liquidated: number; returned: number } | null;
  /** Collateral deposited and withdrawn inside one transaction, left out of
   *  both rows: amount and the transaction's time. */
  netted: { amount: number; at: number }[];
  /** Each collateral move valued at its event's price, in chain order. */
  legs: MakerCollateralLeg[];
}

export interface MakerCollateralLeg {
  kind: "deposited" | "returned" | "withdrawn" | "liquidated";
  amount: number;
  price: number | null;
  at: number;
  /** A withdrawal that took out collateral an auction handed back. */
  leftoverOut?: boolean;
}

/** What the page knows beyond the rows: each block's OSM price and the rows
 *  that moved an auction's leftover. */
export interface MakerHistoryInputs {
  priceAt?: (block: number) => number | null;
  leftover?: Map<string, MakerLeftoverLink>;
}

function replayMakerLifetime(events: BaseActivityEvent[], inputs: MakerHistoryInputs = {}): MakerLifetimeFlows {
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
    returned: 0,
    atEvents: null,
    netted: [],
    legs: [],
  };
  // A deposit and a withdrawal inside one transaction (a flash loan through
  // the vault) add nothing: the smaller side comes out of both rows.
  const inOut = new Map<string, { dep: number; wd: number; at: number }>();
  for (const ev of events) {
    if (!isMakerDAOEvent(ev)) continue;
    const d = ev.context.data;
    if (d.eventType !== "frob" || inputs.leftover?.has(ev.id)) continue;
    const dink = Number(d.dink) || 0;
    const tx = ev.id.split(":")[1] ?? "";
    const t = inOut.get(tx) ?? { dep: 0, wd: 0, at: ev.timestamp };
    if (dink > 0) t.dep += dink;
    else t.wd += -dink;
    inOut.set(tx, t);
  }
  const nettable = new Map<string, number>();
  for (const [tx, t] of inOut) {
    const n = Math.min(t.dep, t.wd);
    if (n > DUST) {
      nettable.set(tx, n);
      f.netted.push({ amount: n, at: t.at });
    }
  }
  // Valued at each event's price only while every collateral-moving row has
  // one; a single unpriced row sends the whole layer back to today's price.
  let priced = inputs.priceAt != null;
  const at = { deposited: 0, withdrawn: 0, liquidated: 0, returned: 0 };
  const nettedLeft = new Map<string, number>();
  for (const ev of events) {
    if (!isMakerDAOEvent(ev)) continue;
    const d = ev.context.data;
    const isFork = d.eventType === "fork-out" || d.eventType === "fork-in";
    const dink = Number(d.dink);
    if (Number.isFinite(dink) && dink !== 0) {
      const price =
        d.eventType === "grab" && d.priceAtBlock?.usd != null
          ? d.priceAtBlock.usd
          : (inputs.priceAt?.(ev.blockNumber) ?? null);
      if (isFork) {
        if (dink > 0) f.movedIn += dink;
        else f.movedOut += -dink;
        priced = false;
      } else {
        if (price == null) priced = false;
        const usd = Math.abs(dink) * (price ?? 0);
        if (d.eventType === "grab") {
          if (dink < 0) {
            f.liquidated += -dink;
            at.liquidated += usd;
          }
        } else if (dink > 0 && inputs.leftover?.get(ev.id)?.role === "in") {
          f.returned += dink;
          at.returned += usd;
        } else {
          // Net the in-and-out of one transaction: each side gives up the
          // netted amount once.
          const tx = ev.id.split(":")[1] ?? "";
          const key = `${tx}:${dink > 0 ? "in" : "out"}`;
          const left = nettedLeft.has(key) ? nettedLeft.get(key)! : (nettable.get(tx) ?? 0);
          const take = Math.min(Math.abs(dink), left);
          nettedLeft.set(key, left - take);
          const kept = Math.abs(dink) - take;
          const keptUsd = kept * (price ?? 0);
          if (dink > 0) {
            f.deposited += kept;
            at.deposited += keptUsd;
          } else {
            f.withdrawn += kept;
            at.withdrawn += keptUsd;
          }
        }
        const kind =
          d.eventType === "grab"
            ? "liquidated"
            : dink > 0 && inputs.leftover?.get(ev.id)?.role === "in"
              ? "returned"
              : dink > 0
                ? "deposited"
                : "withdrawn";
        f.legs.push({
          kind,
          amount: Math.abs(dink),
          price,
          at: ev.timestamp,
          ...(inputs.leftover?.get(ev.id)?.role === "out" ? { leftoverOut: true } : {}),
        });
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
  if (priced) f.atEvents = at;
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
  folders?: readonly ServedFolder[] | null,
): MakerLifetimeFlows | undefined {
  // Undefined = nothing outside `events`, so the reducer reads them as the
  // whole history. On a grouped answer the folders hold members `events` does
  // not, and their flows are the third half of the partition (the summary
  // below the cut, the events and the folders above it).
  if (!opening && (folders?.length ?? 0) === 0) return undefined;
  const f = replayMakerLifetime(events);
  // Summarised history carries no per-event price.
  f.atEvents = null;
  f.legs = [];
  for (const bucket of mergeFlowBuckets(opening?.flows, folderFlows(folders))) {
    for (const [leg, raw] of Object.entries(bucket.legs)) {
      if (!(leg in f) || leg === "haveRate" || leg === "atEvents" || leg === "netted" || leg === "legs") continue;
      const value = scaleBaseUnits(raw, bucket.decimals);
      if (value == null) return undefined;
      f[leg as Exclude<keyof MakerLifetimeFlows, "haveRate" | "atEvents" | "netted" | "legs">] += value;
    }
  }
  return f;
}

/** The tower data plus what its explanation states beside the rows: the
 *  stability fee over the vault's life (the debt owed now less every DAI drawn
 *  net of every repayment and liquidation, each at its block's rate) and its
 *  parts, and today's value of the collateral the flows valued at event
 *  prices. */
export type MakerTowerData = ChainTruthTowerData & {
  lifetimeInterest?: number;
  /** The fee in today's debt (the "Stability fee owed" row). */
  feeOwed?: number;
  /** The fee inside the debt liquidations cleared. */
  feeLiquidated?: number;
  /** The liquidated collateral at today's OSM price. */
  liquidatedNowUsd?: number;
  /** Today's OSM price. */
  priceNow?: number | null;
  collateralSymbol?: string;
  /** Deposited-and-withdrawn-in-one-transaction amounts left out of both rows. */
  netted?: { amount: number; at: number }[];
  /** Each collateral move at its event's price, when the flows are valued so. */
  legs?: MakerCollateralLeg[];
};

/** Build the USD dual-tower data for a Maker vault from its (chain-state) view.
 *  The held figures (ink, art × rate) are on the view (the detail page reads
 *  them by eth_call on the Vat). Passing the timeline adds the collateral-side
 *  lifetime flows (exact dink sums; each valued at its event's OSM price when
 *  the page holds every one of them, at today's otherwise) and, once each event
 *  carries `rateAtBlock`, the debt-side flows (each dart valued at its block's
 *  rate). Both sides are gated on `flowsReconcile`, so a partial capture
 *  suppresses rather than mislabels them. */
export function computeMakerEconomics(
  view: MakerVaultView,
  events: BaseActivityEvent[] = [],
  /** The merged whole-history flows on a windowed page (see
   *  makerLifetimeWithOpening). Present, it IS the lifetime layer and `events`
   *  takes no part in it; absent, the events replay as they always did. A
   *  windowed page whose opening balance has not arrived passes NEITHER — the
   *  lifetime layer states nothing rather than a window's arithmetic. */
  precomputedLifetime?: MakerLifetimeFlows,
  inputs: MakerHistoryInputs & { feeLiquidated?: number } = {},
): MakerTowerData {
  const ink = Math.max(0, view.ink);
  const art = Math.max(0, view.art);
  // A terminal vault below the status rule's dust line can still carry a
  // wei-scale trace in either Vat slot. The line renders at true magnitude
  // (never a false zero); its receipt says what the trace is.
  const terminal = view.status !== "open";
  const inkResidue = terminal && ink > 0 && ink <= MAKER_STATUS_DUST;
  const debtDai = view.debtDai != null ? Math.max(0, view.debtDai) : null;
  // The debt split (lib/makerdao/vault-history.tsx): DAI drawn since the vault
  // last owed nothing, and the fee on it. Unknown where that start is not
  // loaded; the debt then stands whole.
  const drawn = debtDai != null && view.drawnDai != null ? Math.min(Math.max(0, view.drawnDai), debtDai) : null;
  const feeOwed = debtDai != null && drawn != null ? debtDai - drawn : null;
  const since = view.drawnSince != null ? `since ${formatDate(view.drawnSince)}` : undefined;
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
    returned,
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
    atEvents,
    netted,
    legs,
  } = precomputedLifetime ?? replayMakerLifetime(events, inputs);
  const usd = (amt: number) => (price != null ? amt * price : null);
  // Only surface lifetime flows when the captured events reconcile to the live
  // ink slot — i.e. the history is complete from open. Otherwise (old vault, only
  // a recent window captured) the sums aren't truly all-time, so we suppress them
  // rather than mislabel a partial window as chain state.
  const collComplete = flowsReconcile(
    deposited + returned + movedIn - withdrawn - liquidated - movedOut,
    ink,
    deposited + returned + movedIn + withdrawn + liquidated + movedOut,
  );
  const atEventPrices = collComplete && atEvents != null && price != null;
  const flowLine = (
    key: string,
    amt: number,
    flow: "withdrawn" | "liquidated" | "moved out",
    usdAtEvents: number | null,
    label?: string,
  ): TowerLine[] =>
    collComplete && amt > DUST
      ? [
          {
            key,
            symbol: collSym,
            amount: amt,
            usd: atEventPrices && usdAtEvents != null ? usdAtEvents : usd(amt),
            prov:
              atEventPrices && usdAtEvents != null && flow !== "moved out"
                ? collateralFlowAtEventsProv(flow, collSym)
                : collateralFlowProv(flow, collSym),
            ...(label ? { flowLabel: label } : {}),
          },
        ]
      : [];
  const returnedLines: TowerLine[] =
    collComplete && returned > DUST
      ? [
          {
            key: "coll-returned",
            symbol: collSym,
            amount: returned,
            usd: atEventPrices ? atEvents!.returned : usd(returned),
            prov: atEventPrices ? collateralFlowAtEventsProv("returned", collSym) : returnedCollateralProv(collSym),
            flowLabel: "Returned by auction",
          },
        ]
      : [];
  const collInflowUsd = atEventPrices
    ? atEvents!.deposited
    : price != null
      ? (deposited + movedIn) * price
      : deposited + movedIn;
  const collPriceChange: TowerLine | null = (() => {
    if (!atEventPrices || view.collateralUsd == null) return null;
    const change =
      view.collateralUsd - (atEvents!.deposited + atEvents!.returned - atEvents!.withdrawn - atEvents!.liquidated);
    if (Math.abs(change) < 0.5) return null;
    return {
      key: "coll-price-change",
      symbol: "",
      amount: change,
      usd: change,
      prov: collateralPriceChangeProv(collSym),
      flowLabel: "Price change",
    };
  })();

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

  const netDrawn = daiGenerated + daiMovedIn - daiRepaid - daiLiquidated - daiMovedOut;
  const lifetimeInterest = debtComplete && debtDai != null ? debtDai - netDrawn : undefined;
  // The fee over the vault's life, as a "+" row beside the all-time borrowing:
  // its value sits inside the fee owed now and inside the repaid and
  // liquidated rows, so borrowed + fee reaches owed + repaid + liquidated.
  const feeEarned: TowerLine[] =
    lifetimeInterest != null && lifetimeInterest > DUST && debtDai != null
      ? [
          {
            key: "debt-fee-life",
            symbol: debtSym,
            amount: lifetimeInterest,
            usd: lifetimeInterest,
            prov: lifetimeFeeProv({
              debt: `${formatNumber(debtDai)} ${debtSym}`,
              net: `${formatNumber(netDrawn)} ${debtSym}`,
            }),
            flowLabel: "Stability fee (all time)",
          },
        ]
      : [];

  return {
    ...(lifetimeInterest != null ? { lifetimeInterest } : {}),
    ...(feeOwed != null ? { feeOwed } : {}),
    ...(inputs.feeLiquidated != null ? { feeLiquidated: inputs.feeLiquidated } : {}),
    ...(price != null && liquidated > DUST ? { liquidatedNowUsd: liquidated * price } : {}),
    priceNow: price,
    collateralSymbol: collSym,
    ...(collComplete && netted.length > 0 ? { netted } : {}),
    ...(atEventPrices ? { legs } : {}),
    // Labels print whole: "Deposited (all time)", "Returned by auction".
    wrapFlowLabels: true,
    valued: true,
    // The USD scale is the on-chain OSM price (Spotter spot × mat), so the valued
    // bars are chain-derived and survive On-chain-values mode.
    priceKind: "chain-derived",
    flowsPricedAtEvents: atEventPrices,
    interestLabel: "Stability fee owed",
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
      ...(returnedLines.length > 0 ? { received: returnedLines } : {}),
      exited: [
        ...flowLine("coll-withdrawn", withdrawn, "withdrawn", atEvents?.withdrawn ?? null),
        ...flowLine("coll-moved-out", movedOut, "moved out", null, "Moved out"),
      ],
      liquidated: flowLine("coll-liquidated", liquidated, "liquidated", atEvents?.liquidated ?? null),
      lifetimeInflow: collComplete ? collInflowUsd : 0,
      priceChange: collPriceChange,
    },
    debt: {
      current:
        debtDai != null && debtDai > DUST
          ? [
              drawn != null
                ? {
                    key: "principal",
                    symbol: debtSym,
                    amount: drawn,
                    // DAI valued at $1 — the same axis as the OSM-priced collateral.
                    usd: drawn,
                    heldLabel: "Drawn",
                    prov: drawnDaiProv({ drawn: `${formatNumber(drawn)} ${debtSym}`, since }),
                  }
                : {
                    key: "debt",
                    symbol: debtSym,
                    amount: debtDai,
                    usd: debtDai,
                    prov: daiDebtProv(formatNumber(art), view.rate ?? "", debtSym),
                  },
            ]
          : [],
      interest:
        feeOwed != null && feeOwed > DUST
          ? {
              key: "fee",
              symbol: debtSym,
              amount: feeOwed,
              usd: feeOwed,
              prov: feeInDebtProv({
                debt: `${formatNumber(debtDai ?? 0)} ${debtSym}`,
                drawn: `${formatNumber(drawn ?? 0)} ${debtSym}`,
                since,
              }),
            }
          : null,
      ...(feeEarned.length > 0 ? { earned: feeEarned } : {}),
      exited: [
        ...debtFlowLine("debt-repaid", daiRepaid, "repaid"),
        ...debtFlowLine("debt-moved-out", daiMovedOut, "moved out", "Moved out"),
      ],
      liquidated: debtFlowLine("debt-liquidated", daiLiquidated, "liquidated"),
      lifetimeInflow: debtComplete ? daiGenerated + daiMovedIn : 0,
    },
  };
}
