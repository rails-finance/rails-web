// Alchemist position economics — the lifetime flows the tower draws.
// ----------------------------------------------------------------------------
// Pure. It takes the position's own events and totals what moved, in the two
// native units: vault shares on the collateral side, the line's synthetic on
// the debt side. No USD — the share price is a point reading of its own and
// valuing a lifetime of flows at one of them would state a figure no block
// supports.
//
// FOUR RULES THIS MODULE ENCODES, each of them a way an Alchemix position's
// arithmetic can be got wrong.
//
// 1. A REPAY'S AMOUNT IS NOT ITS DEBT DELTA. `Repay` states the yield-token
//    quantity the caller offered; the debt it cleared is
//    `min(that amount converted to debt at that block, the position's debt,
//    the line's total debt)` and the contract does not emit it. The API
//    resolves it when the log is captured and carries it apart from the log's
//    own fields. This module reads the resolved figure for the debt side and
//    the log's amount for the collateral side, and where the resolution is
//    absent it counts the event as unresolved rather than substituting one for
//    the other.
//
// 2. A LINE-SCOPE ROW MOVED NOTHING OF THIS HOLDER'S. A redemption applies one
//    ratio to every open position at once; the two batch rows carry the hash of
//    an account list. None of them names this position, so none is totalled
//    here — they are on the timeline because they are what moved the figures,
//    not as this holder's own actions.
//
// 3. A LIQUIDATION'S DEBT LEG IS NOT STATED. `Liquidated` and `SelfLiquidated`
//    carry the shares taken and no debt figure, so the debt side counts none.
//    The collateral side counts the shares, because those the log does state.
//
// 4. A CUT LIST HAS NO LIFETIME. The timeline is windowed on `limit`, so when
//    the served page stopped short of the position's whole history these totals
//    would be a window's arithmetic wearing a lifetime's label. The builder
//    returns null there and the page says why.

import type { ChainTruthTowerData, TowerLine, TowerSideData } from "@/lib/shared/chain-truth-economics";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isAlchemistEvent } from "@/lib/shared/types/event-shape";
import { lifetimeProv, type AlchemixCoords } from "@/lib/alchemix/event-provenance";

const WAD = 1e18;

/** A raw integer string to its decimal reading. Display only: every total below
 *  is a sum of display figures, and the receipt points at the logs. */
function scaled(raw: string | null | undefined): number {
  if (raw == null) return 0;
  const n = Number(raw.split(".")[0]);
  return Number.isFinite(n) ? n / WAD : 0;
}

interface Bucket {
  amount: number;
  events: number;
}

const empty = (): Bucket => ({ amount: 0, events: 0 });

const add = (b: Bucket, amount: number) => {
  if (amount <= 0) return;
  b.amount += amount;
  b.events += 1;
};

export interface AlchemixEconomicsFigures {
  /** Shares deposited over the position's life. */
  deposited: Bucket;
  /** Shares withdrawn by the holder. */
  withdrawn: Bucket;
  /** Shares OFFERED against the debt — the repay and force-repay legs, each
   *  the quantity its own log states. A repay's separately resolved fee is not
   *  in here: it is a figure the contract did not emit, and adding it would put
   *  a resolved number inside a total of emitted ones. The event's own card
   *  shows it. */
  spentRepaying: Bucket;
  /** Shares taken by a liquidation, the holder's own or another party's. */
  liquidated: Bucket;
  /** Synthetic minted against the position. */
  minted: Bucket;
  /** Synthetic burned directly against the debt. */
  burned: Bucket;
  /** Debt cleared by a repay or force repay — the RESOLVED figure, never the
   *  offered amount. */
  debtCleared: Bucket;
  /** Repay and force-repay rows whose debt leg the capture could not resolve.
   *  While this is above zero the debt-cleared total is a floor, and the page
   *  says so rather than printing it as a total. */
  debtCreditUnresolved: number;
  /** Custody moves — the position changed hands this many times. It is a freely
   *  transferable ERC721, so the current holder need not have held it for any
   *  of the history above. */
  custodyMoves: number;
  /** Line-wide rows inside the position's life. They moved its figures and
   *  belong to nobody. */
  lineEvents: number;
}

export interface AlchemixEconomicsResult {
  data: ChainTruthTowerData;
  figures: AlchemixEconomicsFigures;
}

export interface AlchemixEconomicsInput {
  /** The line's synthetic ticker — the debt side's unit. */
  syntheticSymbol: string;
  /** The vault share ticker — the collateral side's unit. */
  mytSymbol: string;
  /** The served collateral, in shares, and the served debt. Null where the
   *  grade serves neither. */
  currentCollateral: number | null;
  currentDebt: number | null;
  /** True when the drawn rows are NOT the position's whole history. */
  windowed: boolean;
  coords: AlchemixCoords;
}

/**
 * Total this position's own events. Returns null when the list is a window —
 * a lifetime figure over part of a life is a wrong figure, not a rough one.
 */
export function computeAlchemixEconomics(
  events: BaseActivityEvent[],
  input: AlchemixEconomicsInput,
): AlchemixEconomicsResult | null {
  if (input.windowed) return null;

  const figures: AlchemixEconomicsFigures = {
    deposited: empty(),
    withdrawn: empty(),
    spentRepaying: empty(),
    liquidated: empty(),
    minted: empty(),
    burned: empty(),
    debtCleared: empty(),
    debtCreditUnresolved: 0,
    custodyMoves: 0,
    lineEvents: 0,
  };

  for (const event of events) {
    if (!isAlchemistEvent(event)) continue;
    const ctx = event.context.data;
    // Rule 2: a line-scope row names no position and totals into nothing.
    if (ctx.scope === "line") {
      figures.lineEvents += 1;
      continue;
    }
    const raw = ctx.raw;
    switch (ctx.eventType) {
      case "deposit":
        add(figures.deposited, scaled(raw.amount));
        break;
      case "withdraw":
        add(figures.withdrawn, scaled(raw.amount));
        break;
      case "mint":
        add(figures.minted, scaled(raw.amount));
        break;
      case "burn":
        add(figures.burned, scaled(raw.amount));
        break;
      case "repay": {
        // Rule 1: the log's amount is the shares offered; the debt it cleared
        // is the resolved figure and nothing else.
        add(figures.spentRepaying, scaled(raw.amount));
        const credit = ctx.resolvedAtCapture?.debtCredit ?? null;
        if (credit == null) figures.debtCreditUnresolved += 1;
        else add(figures.debtCleared, scaled(credit));
        break;
      }
      case "force_repay": {
        add(figures.spentRepaying, scaled(raw.credit_to_yield) + scaled(raw.protocol_fee_total));
        const credit = ctx.resolvedAtCapture?.debtCredit ?? null;
        if (credit == null) figures.debtCreditUnresolved += 1;
        else add(figures.debtCleared, scaled(credit));
        break;
      }
      case "self_liquidated":
        // Rule 3: the shares are stated, the debt leg is not.
        add(figures.liquidated, scaled(raw.amount_liquidated));
        break;
      case "liquidated":
        add(figures.liquidated, scaled(raw.amount));
        break;
      case "transfer":
        figures.custodyMoves += 1;
        break;
      default:
        // `repayment_fee` moves a fee the log states in two units, neither of
        // which is a leg of this position's own balance.
        break;
    }
  }

  const touched =
    figures.deposited.events +
    figures.withdrawn.events +
    figures.spentRepaying.events +
    figures.liquidated.events +
    figures.minted.events +
    figures.burned.events;
  if (touched === 0) return null;

  const { syntheticSymbol, mytSymbol, coords } = input;

  const line = (key: string, label: string, symbol: string, bucket: Bucket, flow?: TowerLine["flowLabel"]): TowerLine[] =>
    bucket.amount > 0
      ? [
          {
            key,
            symbol,
            amount: bucket.amount,
            usd: null,
            prov: lifetimeProv(label, symbol, bucket.events, coords),
            flowLabel: flow,
          },
        ]
      : [];

  const collateral: TowerSideData = {
    current:
      input.currentCollateral != null && input.currentCollateral > 0
        ? [
            {
              key: "coll-current",
              symbol: mytSymbol,
              amount: input.currentCollateral,
              usd: null,
              prov: lifetimeProv("Vault shares held", mytSymbol, touched, coords),
            },
          ]
        : [],
    exited: [
      ...line("coll-withdrawn", "Vault shares withdrawn", mytSymbol, figures.withdrawn, "Withdrawn"),
      ...line("coll-repaid", "Vault shares offered against the debt", mytSymbol, figures.spentRepaying, "Offered against the debt"),
    ],
    liquidated: line("coll-liquidated", "Vault shares taken by a liquidation", mytSymbol, figures.liquidated, "Liquidated"),
    lifetimeInflow: figures.deposited.amount,
  };

  const debt: TowerSideData = {
    current:
      input.currentDebt != null && input.currentDebt > 0
        ? [
            {
              key: "debt-current",
              symbol: syntheticSymbol,
              amount: input.currentDebt,
              usd: null,
              prov: lifetimeProv("Debt outstanding", syntheticSymbol, touched, coords),
            },
          ]
        : [],
    exited: [
      ...line("debt-burned", "Synthetic burned against the debt", syntheticSymbol, figures.burned, "Burned"),
      ...(figures.debtCreditUnresolved === 0
        ? line("debt-cleared", "Debt cleared by a repay", syntheticSymbol, figures.debtCleared, "Cleared by repaying")
        : []),
    ],
    liquidated: [],
    lifetimeInflow: figures.minted.amount,
  };

  const data: ChainTruthTowerData = {
    valued: false,
    collateral,
    debt,
    collateralUnit: mytSymbol,
    debtUnit: syntheticSymbol,
    collateralTitle: "Collateral · vault shares",
    debtTitle: "Debt outstanding",
    collateralInflowLabel: "Deposited",
    debtInflowLabel: "Minted",
    interestNote:
      "An Alchemix debt does not carry interest. It falls as the vault's yield is earmarked against it, and that figure is true only at the block it was taken at, so it is stated on its own above rather than split out here.",
    flowsNote:
      figures.debtCreditUnresolved > 0
        ? "One or more repayments on this position carry no settled debt figure, so the debt cleared by repaying is left out of the totals rather than understated."
        : undefined,
  };

  return { data, figures };
}
