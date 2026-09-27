// Alchemist position economics — the lifetime flows the tower draws.
// ----------------------------------------------------------------------------
// Pure. It takes the position's own events and totals what moved, in the two
// native units: vault shares on the collateral side, the line's synthetic on
// the debt side. No USD — the share price is a point reading of its own and
// valuing a lifetime of flows at one of them would state a figure no block
// supports.
//
// FIVE RULES THIS MODULE ENCODES, each of them a way an Alchemix position's
// arithmetic can be got wrong.
//
// 1. A REPAY'S AMOUNT IS NOT ITS DEBT DELTA. `Repay` states the yield-token
//    quantity the caller offered; the debt it cleared is
//    `min(that amount converted to debt at that block, the position's debt,
//    the line's total debt)` and the contract does not emit it. The API
//    resolves it when the log is captured and carries it apart from the log's
//    own fields. This module reads the resolved figure for the debt side and
//    no collateral leg at all: `repay` pulls those shares from the CALLER's
//    wallet (`safeTransferFrom(msg.sender, …)`), and only the protocol fee on
//    the set-aside part leaves the collateral. Where the resolution is absent
//    it counts the event as unresolved.
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
// 5. A SELF-LIQUIDATION'S AMOUNT OVERLAPS ITS FORCE REPAY, AND ITS LAST STEP
//    EMITS NOTHING. `SelfLiquidated` states the set-aside shares its own
//    `ForceRepay` already stated, plus the shares that paid the rest; the
//    collateral left over is swept to the holder's chosen address with no event.
//    lib/alchemix/self-liquidation.ts splits it, and the sweep is measured from
//    the reading before the close.
//
// 4. A CUT LIST HAS NO LIFETIME. The timeline is windowed on `limit`, so when
//    the served page stopped short of the position's whole history these totals
//    would be a window's arithmetic wearing a lifetime's label. The builder
//    returns null there and the page says why.

import type { ChainTruthTowerData, TowerLine, TowerSideData } from "@/lib/shared/chain-truth-economics";
import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isAlchemistEvent } from "@/lib/shared/types/event-shape";
import { closeFromReadingProv, lifetimeProv, type AlchemixCoords } from "@/lib/alchemix/event-provenance";
import type { AlchemistEvent } from "@/lib/alchemix/explainer-clauses";
import { readingsBefore } from "@/lib/alchemix/readings-before";
import { selfLiquidationSplit } from "@/lib/alchemix/self-liquidation";

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
  /** Collateral put against the debt set aside for repayment by a force
   *  repay: its `creditToYield` plus its protocol fee, both stated by its log. */
  spentRepaying: Bucket;
  /** Shares a caller paid in from outside the position with `repay`. Not a
   *  collateral leg: the contract takes them from the caller's wallet. */
  repaidFromOutside: Bucket;
  /** Shares that paid the rest of the debt when the holder closed the
   *  position with its collateral (a self-liquidation): the close's amount
   *  less the same transaction's force-repay shares. */
  closedWith: Bucket;
  /** Collateral a self-liquidation swept back to the holder's chosen address.
   *  No event states it: the reading before the close less the shares that
   *  paid debt and the fee. */
  returnedOnClose: Bucket;
  /** A self-liquidation whose sweep has no reading before it on the timeline,
   *  so the collateral side cannot be closed. */
  returnedUnstated: number;
  /** Each close's reading-measured figures, for their receipts. */
  closes: { fromBlock: number; txHash: string; blockNumber: number; returnedRaw: string; debtRaw: string }[];
  /** Shares taken by another party's liquidation. */
  liquidated: Bucket;
  /** Synthetic minted against the position. */
  minted: Bucket;
  /** Synthetic burned directly against the debt. */
  burned: Bucket;
  /** Debt cleared by a repay, or by a force repay outside a close — the
   *  RESOLVED figure, never the offered amount. */
  debtCleared: Bucket;
  /** Debt a self-liquidation paid off, set-aside part included: the reading
   *  before the close, which leaves none. */
  debtClosed: Bucket;
  /** Repay and force-repay rows whose debt leg the capture could not resolve.
   *  While this is above zero the debt-cleared total is a floor, and the page
   *  says so rather than printing it as a total. */
  debtCreditUnresolved: number;
  /** The protocol fee repays took in shares, resolved at capture. Kept out of
   *  every tower line for the reason `spentRepaying` gives; the Explanation
   *  pane names it so the collateral side reconciles. */
  repayFeeShares: number;
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
    repaidFromOutside: empty(),
    closedWith: empty(),
    returnedOnClose: empty(),
    returnedUnstated: 0,
    closes: [],
    liquidated: empty(),
    minted: empty(),
    burned: empty(),
    debtCleared: empty(),
    debtClosed: empty(),
    debtCreditUnresolved: 0,
    repayFeeShares: 0,
    custodyMoves: 0,
    lineEvents: 0,
  };

  const alchemist = events.filter(isAlchemistEvent) as AlchemistEvent[];
  const before = readingsBefore(alchemist);

  for (const event of alchemist) {
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
        // Rule 1: the log's amount is the shares the caller paid in; the debt
        // it cleared is the resolved figure and nothing else.
        add(figures.repaidFromOutside, scaled(raw.amount));
        const credit = ctx.resolvedAtCapture?.debtCredit ?? null;
        if (credit == null) figures.debtCreditUnresolved += 1;
        else add(figures.debtCleared, scaled(credit));
        figures.repayFeeShares += scaled(ctx.resolvedAtCapture?.collateralFee ?? null);
        break;
      }
      case "force_repay": {
        add(figures.spentRepaying, scaled(raw.credit_to_yield) + scaled(raw.protocol_fee_total));
        // Inside a close, the close's debt figure covers this part.
        const inClose = alchemist.some(
          (e) => e.txHash === event.txHash && e.context.data.eventType === "self_liquidated",
        );
        if (inClose) break;
        const credit = ctx.resolvedAtCapture?.debtCredit ?? null;
        if (credit == null) figures.debtCreditUnresolved += 1;
        else add(figures.debtCleared, scaled(credit));
        break;
      }
      case "self_liquidated": {
        // Rules 3 and 5: the shares are stated, the debt leg is not, and the
        // set-aside part is the force repay's.
        const block = ctx.stateAtBlockFromReading?.blockNumber ?? event.blockNumber;
        const split = selfLiquidationSplit(event, alchemist, before.get(block) ?? null);
        if (!split) break;
        add(figures.closedWith, Number(split.restRaw) / WAD);
        if (split.debtBeforeRaw != null) add(figures.debtClosed, Number(split.debtBeforeRaw) / WAD);
        if (split.returnedRaw == null) figures.returnedUnstated += 1;
        else if (split.returnedRaw > BigInt(0)) add(figures.returnedOnClose, Number(split.returnedRaw) / WAD);
        if (split.beforeBlock != null && split.returnedRaw != null && split.debtBeforeRaw != null)
          figures.closes.push({
            fromBlock: split.beforeBlock,
            txHash: event.txHash,
            blockNumber: block,
            returnedRaw: split.returnedRaw.toString(),
            debtRaw: split.debtBeforeRaw.toString(),
          });
        break;
      }
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
    figures.repaidFromOutside.events +
    figures.closedWith.events +
    figures.liquidated.events +
    figures.minted.events +
    figures.burned.events;
  if (touched === 0) return null;

  const { syntheticSymbol, mytSymbol, coords } = input;

  const line = (
    key: string,
    label: string,
    symbol: string,
    bucket: Bucket,
    flow?: TowerLine["flowLabel"],
    prov?: TowerLine["prov"],
  ): TowerLine[] =>
    bucket.amount > 0
      ? [
          {
            key,
            symbol,
            amount: bucket.amount,
            usd: null,
            prov: prov ?? lifetimeProv(label, symbol, bucket.events, coords),
            flowLabel: flow,
          },
        ]
      : [];

  // A single close's reading-measured figure carries that reading's receipt;
  // several closes (a refunded position closed again) fall back to the rollup.
  const onlyClose = figures.closes.length === 1 ? figures.closes[0] : null;
  const closeCoords = onlyClose ? { ...coords, txHash: onlyClose.txHash, blockNumber: onlyClose.blockNumber } : coords;

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
      ...line(
        "coll-repaid",
        "Vault shares put against the debt set aside for repayment",
        mytSymbol,
        figures.spentRepaying,
        "Put against set-aside debt",
      ),
      ...line(
        "coll-closed",
        "Vault shares that paid the rest of the debt when the holder closed the position",
        mytSymbol,
        figures.closedWith,
        "Closed with collateral",
      ),
      ...line(
        "coll-returned",
        "Vault shares returned to the holder when the position closed",
        mytSymbol,
        figures.returnedOnClose,
        "Returned on close",
        onlyClose
          ? closeFromReadingProv("returned", mytSymbol, onlyClose.returnedRaw, onlyClose.fromBlock, closeCoords)
          : undefined,
      ),
    ],
    liquidated: line(
      "coll-liquidated",
      "Vault shares taken by a liquidation",
      mytSymbol,
      figures.liquidated,
      "Liquidated",
    ),
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
      ...line(
        "debt-closed",
        "Debt paid off when the holder closed the position with its collateral",
        syntheticSymbol,
        figures.debtClosed,
        "Closed with collateral",
        onlyClose
          ? closeFromReadingProv("debt", syntheticSymbol, onlyClose.debtRaw, onlyClose.fromBlock, closeCoords)
          : undefined,
      ),
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
      "An Alchemix debt carries no interest. It falls when the holder repays and when the line's Transmuter redeems the part set aside for repayment, and that set-aside figure is stated on the position card at its own block.",
    flowsNote:
      figures.debtCreditUnresolved > 0
        ? "One or more repayments on this position carry no settled debt figure, so the debt cleared by repaying is left out of the totals."
        : undefined,
  };

  return { data, figures };
}
