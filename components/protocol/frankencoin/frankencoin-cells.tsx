"use client";

// Frankencoin's T2 (ui-jobs 309 step 8): the card's `cells` and `notes`
// slots. Cells for the position's Collateral and Debt, the price an event
// sold at and the owner-declared liquidation price, and the collateral and
// debt figures a challenge or a forced sale moved; the terms an event did not
// change, the parties and the rest of a sale's split stand as notes. The
// minting family renders the position's three ledger lanes — collateral /
// minted / the owner-declared liq. price — each an EMITTED ABSOLUTE equal to
// the position's stored state at that block, with before→after transitions
// built from the row's own two absolutes (MintingUpdate carries no delta
// field; the change receipts say the difference is derived). Figures are
// stated at one precision per unit (lib/frankencoin/figures.ts), so a small
// change never rounds away. Where ZCHF moved, the debt lane carries the
// receipt's split: what the wallet received or paid and the reserve share.
// Challenge and forced-sale rows render their slice figures; ownership rows
// the handover; the clone row its original. Native units only.

import type { ReactNode } from "react";
import type { FrankencoinContext } from "@/lib/shared/types/event-shape";
import type { ChainTruthStat, ChainTruthTransition } from "@/components/shared/chain-truth-event";
import { StatNotes, useChainTruthCells, type ChainTruthCellStat } from "@/components/shared/chain-truth-cells";
import type { EventCells } from "@/components/shared/event-cells";
import {
  mintedAfterProv,
  collateralAfterProv,
  liqPriceAfterProv,
  beforeProv,
  changeProv,
  challengeFigureProv,
  forcedSaleProv,
  ownershipProv,
  openedProv,
  receiptLegProv,
  challengeReceiptProv,
  type FrankencoinCoords,
} from "@/lib/frankencoin/event-provenance";
import { formatExact, formatUnitsExact } from "@/lib/utils/format";
import { Prov } from "@/components/shared/provenance";
import { hubAddress, shortAddress } from "@/lib/frankencoin/asset-catalog";
import {
  fmtFcColl,
  fmtFcPct,
  fmtFcPrice,
  fmtMultiple,
  fmtZchf,
  forcedCurvePoint,
  groupExact,
  termText,
} from "@/lib/frankencoin/figures";
import { frankencoinZchfSplit, useFrankencoinEventRead } from "@/lib/frankencoin/use-event-read";
import { useFlowFocus } from "@/components/shared/flow-focus-context";
import { useFrankencoinLedgerCells } from "./frankencoin-ledger";
import { dateTimeText, phaseText, spanText, useFrankencoinPageFacts } from "@/lib/frankencoin/page-facts";
import { formatDate } from "@/lib/date";
import type { FrankencoinOpeningRead } from "@/lib/sources/chain/frankencoin-event";

export interface FrankencoinCellsProps {
  ctx: FrankencoinContext;
  txHash?: string;
  blockNumber?: number;
  /** The event id, whose log index isolates this event's receipt logs. */
  eventId?: string;
  timestamp?: number;
}

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};

/** A raw integer string scaled by 10^decimals. */
const scaled = (raw: string, decimals: number): number => Number(raw) / 10 ** decimals;

/** Who a party is, from the position's side. */
function partyKind(addr: string, owner: string | null, isContract: boolean | null, challenger: string | null): string {
  if (owner && addr === owner) return "the owner";
  if (challenger && addr === challenger) return "the challenger, withdrawing its own challenge";
  return isContract === true
    ? "a contract, not the owner"
    : isContract === false
      ? "a wallet, not the owner"
      : "not the owner";
}

/** " · 19 min into phase 2" — how far into the falling-price phase a bid came. */
function phaseClause(at: number, start: number, phase: number): string {
  const into = at - (start + phase);
  return into >= 0 ? ` · ${spanText(into)} into phase 2` : "";
}

/** A placeholder tile while the receipt read is in flight. */
function readingStat(coords: FrankencoinCoords, sym: string): ChainTruthStat {
  return {
    label: "From the receipt",
    value: "",
    display: "reading…",
    symbol: "",
    prov: challengeReceiptProv("debtCleared", sym, coords, ""),
    changed: false,
  };
}

function transitionOf(
  after: string | undefined,
  before: string | undefined,
  what: "minted" | "collateral" | "price",
  sym: string,
  coords: FrankencoinCoords,
  f: (n: number) => string,
  rawBefore?: string,
  readBefore = false,
): ChainTruthTransition | undefined {
  const afterN = after != null ? Number(after) : null;
  const beforeN = before != null ? Number(before) : null;
  if (afterN == null || beforeN == null || !Number.isFinite(afterN) || !Number.isFinite(beforeN)) return undefined;
  const changeN = afterN - beforeN;
  if (changeN === 0) return undefined;
  const sign = changeN >= 0 ? "+" : "−";
  return {
    before: f(beforeN),
    // The API's decimal string where it is one: a float drops ZCHF's 18th
    // decimals and invents digits of its own.
    beforeExact: before != null && /^\d+(\.\d+)?$/.test(before) ? groupExact(before) : formatExact(beforeN),
    beforeProv: beforeProv(what, sym, coords, rawBefore, readBefore && what !== "minted"),
    change: `${sign}${f(changeN)}`,
    changeExact: `${sign}${f(changeN)}`,
    changeProv: changeProv(what, sym, coords),
    shownAsIs: true,
  };
}

/** The cell a stat stands as, by its label; null for a note. */
function cellKey(label: string): string | null {
  if (label === "Collateral" || label === "Collateral deposited") return "collateral";
  if (label === "Collateral challenged" || label === "Bought from the challenger" || label === "Collateral sold")
    return "collateral";
  if (label === "Debt" || label === "Debt cleared") return "debt";
  if (label.startsWith("Price ·")) return "price";
  if (label.startsWith("Liq. price")) return "liq";
  return null;
}

/** One Frankencoin event's cells and notes. */
export function useFrankencoinCells({ ctx, txHash, blockNumber, eventId, timestamp }: FrankencoinCellsProps): {
  cells: EventCells;
  notes: ReactNode;
} {
  const coords: FrankencoinCoords = { txHash, blockNumber, position: ctx.position, hub: ctx.hub };
  const sym = ctx.collateralSymbol;
  const dec = ctx.collateralDecimals;
  const { read, pending } = useFrankencoinEventRead(ctx, txHash, eventId);
  const facts = useFrankencoinPageFacts();
  // The cells that open into the Lifetime flows ledgers: a ledger row's
  // Collateral and Debt, where the page has them; while the model is on its
  // way, they stand as placeholder rows.
  const cells = useFrankencoinLedgerCells();
  const focus = useFlowFocus();
  const flowsPending = !!focus && !focus.model;
  const ledgerRow = ctx.raw?.collateral != null || ctx.raw?.minted != null;
  const collLedger = ledgerRow && (cells != null || flowsPending) ? { ledger: "collateral" as const } : {};
  const debtLedger = ledgerRow && (cells?.debt || flowsPending) ? { ledger: "debt" as const } : {};

  const stats: ChainTruthStat[] = [];

  switch (ctx.eventType) {
    case "challenge_started": {
      if (ctx.challengeSize != null)
        stats.push({
          label: "Collateral challenged",
          value: fmtFcColl(num(ctx.challengeSize)),
          display: fmtFcColl(num(ctx.challengeSize)),
          symbol: sym,
          prov: challengeFigureProv("size", "started", sym, coords, ctx.raw?.size),
          sub: facts?.challengePeriod ? (
            <>posted by the challenger · phase 1 runs {phaseText(facts.challengePeriod)}</>
          ) : undefined,
        });
      break;
    }
    case "challenge_averted": {
      const a = read?.challenge?.kind === "averted" ? read.challenge : null;
      if (ctx.challengeSize != null)
        stats.push({
          label: "Bought from the challenger",
          value: fmtFcColl(num(ctx.challengeSize)),
          display: fmtFcColl(num(ctx.challengeSize)),
          symbol: sym,
          prov: challengeFigureProv("size", "averted", sym, coords, ctx.raw?.size),
        });
      if (a) {
        const paid = Number(a.paid);
        const bought = scaled(a.boughtRaw, dec);
        stats.push({
          label: "Paid to the challenger",
          value: fmtZchf(paid),
          display: fmtZchf(paid),
          symbol: "ZCHF",
          prov: challengeReceiptProv("paidChallenger", sym, coords, a.paid),
          sub:
            paid > 0 && bought > 0 ? (
              <>
                {fmtFcPrice(paid / bought)} ZCHF/{sym}
                {a.liqPriceRaw != null && Math.abs(paid / bought - scaled(a.liqPriceRaw, 36 - dec)) < 0.01
                  ? ", the declared price"
                  : null}
              </>
            ) : undefined,
        });
        if (a.buyer)
          stats.push({
            label: "Buyer",
            value: a.buyer,
            display: shortAddress(a.buyer),
            symbol: "",
            prov: challengeReceiptProv("buyer", sym, coords, a.buyer),
            sub: <>{partyKind(a.buyer, a.owner, a.buyerIsContract, a.challenger)}</>,
          });
        if (a.cooldownUntil != null && a.cooldownUntil > (timestamp ?? 0))
          stats.push({
            label: "Minting paused until",
            value: dateTimeText(a.cooldownUntil),
            display: formatDate(a.cooldownUntil),
            symbol: "",
            prov: challengeReceiptProv("cooldown", sym, coords, String(a.cooldownUntil)),
            sub: timestamp != null ? <>{spanText(a.cooldownUntil - timestamp)} after the purchase</> : undefined,
          });
      } else if (pending) stats.push(readingStat(coords, sym));
      break;
    }
    case "challenge_succeeded": {
      const c = read?.challenge?.kind === "succeeded" ? read.challenge : null;
      const bid = num(ctx.bid);
      const acquired = num(ctx.acquiredCollateral);
      const liq = c?.liqPriceRaw != null ? scaled(c.liqPriceRaw, 36 - dec) : null;
      if (ctx.acquiredCollateral != null)
        stats.push({
          label: "Collateral sold",
          value: fmtFcColl(acquired),
          display: fmtFcColl(acquired),
          symbol: sym,
          prov: challengeFigureProv("acquiredCollateral", "succeeded", sym, coords, ctx.raw?.acquiredCollateral),
          sub: c?.bidder ? <>to {shortAddress(c.bidder)}</> : undefined,
        });
      if (ctx.bid != null)
        stats.push({
          label: "Bid paid",
          value: fmtZchf(bid),
          display: fmtZchf(bid),
          symbol: "ZCHF",
          prov: challengeFigureProv("bid", "succeeded", sym, coords, ctx.raw?.bid),
          sub:
            acquired > 0 ? (
              <Prov
                info={challengeReceiptProv("clearedPrice", sym, coords, String(bid / acquired))}
                value={fmtFcPrice(bid / acquired)}
              >
                <span className="tabular-nums">
                  {fmtFcPrice(bid / acquired)} ZCHF/{sym}
                  {liq != null && liq > 0 ? <> · {fmtFcPct(bid / acquired / liq)} of the declared price</> : null}
                  {c?.challengeStart != null && c.phase != null && timestamp != null
                    ? phaseClause(timestamp, c.challengeStart, c.phase)
                    : null}
                </span>
              </Prov>
            ) : undefined,
        });
      if (ctx.challengeSize != null && Math.abs(num(ctx.challengeSize) - acquired) > 1e-12)
        stats.push({
          label: "Slice of challenge",
          value: fmtFcColl(num(ctx.challengeSize)),
          display: fmtFcColl(num(ctx.challengeSize)),
          symbol: sym,
          prov: challengeFigureProv("challengeSize", "succeeded", sym, coords, ctx.raw?.challengeSize),
        });
      if (c) {
        const reward = Number(c.reward);
        stats.push({
          label: "Challenger's reward",
          value: fmtZchf(reward),
          display: fmtZchf(reward),
          symbol: "ZCHF",
          prov: challengeReceiptProv("reward", sym, coords, c.reward),
          sub: bid > 0 && reward > 0 ? <>{fmtFcPct(reward / bid)} of the bid</> : undefined,
        });
        const back = scaled(c.challengerReturnedRaw, dec);
        if (back > 0)
          stats.push({
            label: "Returned to the challenger",
            value: fmtFcColl(back),
            display: fmtFcColl(back),
            symbol: sym,
            prov: challengeReceiptProv("challengerReturned", sym, coords, c.challengerReturnedRaw),
            sub: <>{c.challengerReturnPostponed ? "booked for later collection" : "the collateral it posted"}</>,
          });
        stats.push({
          label: "Debt cleared",
          value: fmtZchf(Number(c.debtCleared)),
          display: fmtZchf(Number(c.debtCleared)),
          symbol: "ZCHF",
          prov: challengeReceiptProv("debtCleared", sym, coords, c.debtCleared),
        });
        const shortfall = Number(c.shortfall);
        if (shortfall > 0)
          stats.push({
            label: "Shortfall",
            value: fmtZchf(shortfall),
            display: fmtZchf(shortfall),
            symbol: "ZCHF",
            prov: challengeReceiptProv("shortfall", sym, coords, c.shortfall),
            sub:
              c.reserveReleased != null && Number(c.reserveReleased) > 0 ? (
                <>
                  from the reserve, out of this position&rsquo;s {fmtZchf(Number(c.reserveReleased))} ZCHF reserve share
                </>
              ) : (
                <>from the reserve</>
              ),
          });
        stats.push({
          label: "Owner received",
          value: fmtZchf(Number(c.ownerReceived)),
          display: fmtZchf(Number(c.ownerReceived)),
          symbol: "ZCHF",
          prov: challengeReceiptProv("ownerReceived", sym, coords, c.ownerReceived),
          changed: Number(c.ownerReceived) > 0,
        });
      } else if (pending) stats.push(readingStat(coords, sym));
      break;
    }
    case "forced_sale": {
      const f = read?.forced ?? null;
      const sold = num(ctx.forcedSaleAmount);
      if (ctx.forcedSaleAmount != null)
        stats.push({
          label: "Collateral sold",
          value: fmtFcColl(sold),
          display: fmtFcColl(sold),
          symbol: sym,
          prov: forcedSaleProv(sym, coords, ctx.raw?.size),
          sub: f?.buyer ? (
            <Prov info={challengeReceiptProv("forcedBuyer", sym, coords, f.buyer)} value={f.buyer}>
              <span>
                {sold > 0 ? "to" : "called by"} {shortAddress(f.buyer)} ·{" "}
                {partyKind(f.buyer, f.owner, f.buyerIsContract, null)}
              </span>
            </Prov>
          ) : undefined,
        });
      if (f && sold > 0) {
        const unit = scaled(f.priceRaw, 36 - dec);
        const liq = f.liqPriceRaw != null ? scaled(f.liqPriceRaw, 36 - dec) : null;
        const curve =
          f.expiration != null && f.challengePeriod != null && timestamp != null
            ? forcedCurvePoint(timestamp, f.expiration, f.challengePeriod, unit, liq)
            : null;
        stats.push({
          label: `Price · ZCHF per ${sym}`,
          value: groupExact(formatUnitsExact(f.priceRaw, 36 - dec)),
          display: fmtFcPrice(unit),
          symbol: "",
          prov: challengeReceiptProv("forcedPrice", sym, coords, f.priceRaw),
          sub: curve ? (
            <>
              {curve.multiple != null && liq != null && unit > 0 ? (
                <>
                  {fmtMultiple(curve.multiple)} the declared {fmtFcPrice(liq)} ·{" "}
                </>
              ) : null}
              {spanText(curve.since)} after expiry
            </>
          ) : undefined,
        });
        const cost = Number(f.cost);
        stats.push({
          label: "Buyer paid",
          value: groupExact(f.cost),
          display: fmtZchf(cost),
          symbol: "ZCHF",
          prov: challengeReceiptProv("forcedCost", sym, coords, f.cost),
        });
        const debt = Number(f.debtCleared);
        if (debt > 0 || (f.mintedBefore != null && Number(f.mintedBefore) > 0))
          stats.push({
            label: "Debt cleared",
            value: groupExact(f.debtCleared),
            display: fmtZchf(debt),
            symbol: "ZCHF",
            prov: challengeReceiptProv("forcedDebt", sym, coords, f.debtCleared),
            sub:
              Number(f.reserveToBuyer) > 0 ? (
                <Prov
                  info={challengeReceiptProv("forcedReserveToBuyer", sym, coords, f.reserveToBuyer)}
                  value={fmtZchf(Number(f.reserveToBuyer))}
                >
                  <span className="tabular-nums">
                    reserve share {fmtZchf(Number(f.reserveToBuyer))} released to the buyer
                  </span>
                </Prov>
              ) : undefined,
          });
        const loss = Number(f.loss);
        if (loss > 0)
          stats.push({
            label: "Shortfall",
            value: fmtZchf(loss),
            display: fmtZchf(loss),
            symbol: "ZCHF",
            prov: challengeReceiptProv("forcedShortfall", sym, coords, f.loss),
            sub:
              f.reserveReleased != null && Number(f.reserveReleased) > 0 ? (
                <>
                  from the reserve, against this position&rsquo;s {fmtZchf(Number(f.reserveReleased))} ZCHF reserve
                  share
                </>
              ) : (
                <>from the reserve</>
              ),
          });
        stats.push({
          label: "Owner received",
          value: groupExact(f.ownerReceived),
          display: fmtZchf(Number(f.ownerReceived)),
          symbol: "ZCHF",
          prov: challengeReceiptProv("forcedOwner", sym, coords, f.ownerReceived),
          changed: Number(f.ownerReceived) > 0,
        });
      } else if (!f && pending) stats.push(readingStat(coords, sym));
      break;
    }
    case "ownership_transferred": {
      const from = ctx.previousOwner;
      if (from)
        stats.push({
          label: ctx.initialization ? "Owner before" : "From",
          value: from,
          display: from === ZERO_ADDR ? "none (new contract)" : shortAddress(from),
          symbol: "",
          prov: ownershipProv(coords),
          changed: false,
        });
      if (ctx.newOwner)
        stats.push({
          label: ctx.initialization
            ? ctx.handoverStep != null && ctx.handoverSteps != null && ctx.handoverSteps > 1
              ? `Owner after · step ${ctx.handoverStep} of ${ctx.handoverSteps}`
              : "Owner after"
            : "To",
          value: ctx.newOwner,
          display: shortAddress(ctx.newOwner),
          symbol: "",
          prov: ownershipProv(coords),
          sub:
            read?.newOwnerIsContract != null ? (
              <Prov
                info={challengeReceiptProv("ownerKind", sym, coords, ctx.newOwner)}
                value={read.newOwnerIsContract ? "contract" : "wallet"}
              >
                <span>
                  {ctx.newOwner === hubAddress(ctx.hub).toLowerCase()
                    ? "the MintingHub, a contract"
                    : read.newOwnerIsContract
                      ? "a contract"
                      : "a wallet (no contract code)"}
                </span>
              </Prov>
            ) : undefined,
        });
      break;
    }
    case "open":
    case "clone": {
      // An original's opening: what the transaction moved and the terms it
      // set, from the page's opening read.
      const o = ctx.eventType === "open" ? (facts?.opening ?? null) : null;
      if (o) {
        stats.push(
          ...openingStats(o, ctx, coords, timestamp, facts?.deniedAt ?? null).map((st) =>
            st.label === "Collateral deposited" ? { ...st, ...collLedger } : st,
          ),
        );
        break;
      }
      if (ctx.eventType === "open" && facts?.openingPending) {
        stats.push(readingStat(coords, sym));
        break;
      }
      if (ctx.eventType === "clone" && ctx.original)
        stats.push({
          label: "Cloned from",
          value: ctx.original,
          display: shortAddress(ctx.original),
          symbol: "",
          prov: openedProv(coords),
          sub:
            facts?.familyOriginal && facts.familyOriginal !== ctx.original ? (
              <>a clone of the family&rsquo;s original {shortAddress(facts.familyOriginal)}</>
            ) : facts?.familyOriginal === ctx.original ? (
              <>the family&rsquo;s original</>
            ) : undefined,
        });
      if (ctx.collateral == null && ctx.minted == null) break;
    }
    // falls through — an open row that carries figures shows the ledger lanes
    default: {
      // The minting family (open / clone / mint / repay / adjust / close /
      // adjust_price) — the ledger's three lanes. The collateral lane is
      // SKIPPED on an understated row (the V1 clone-creation lie): its
      // emitted figure understates reality, so nothing renders rather than a
      // wrong absolute — the live overlay corrects at head.
      if (ctx.collateral != null && !ctx.collateralUnderstated)
        stats.push({
          label: "Collateral",
          value: fmtFcColl(Number(ctx.collateral)),
          symbol: sym,
          prov: collateralAfterProv(sym, coords, ctx.raw?.collateral),
          display: fmtFcColl(Number(ctx.collateral)),
          transition: transitionOf(
            ctx.collateral,
            ctx.collateralBefore,
            "collateral",
            sym,
            coords,
            fmtFcColl,
            ctx.raw?.collateralBefore,
            ctx.beforeReadAtBlock,
          ),
          changed: ctx.collateral !== ctx.collateralBefore,
          ...collLedger,
        });
      if (ctx.minted != null) {
        const dMint = ctx.mintedBefore != null ? Number(ctx.minted) - Number(ctx.mintedBefore) : 0;
        stats.push({
          label: "Debt",
          value: fmtZchf(Number(ctx.minted)),
          display: fmtZchf(Number(ctx.minted)),
          symbol: "ZCHF",
          prov: mintedAfterProv(coords, ctx.raw?.minted),
          transition: transitionOf(ctx.minted, ctx.mintedBefore, "minted", sym, coords, fmtZchf, ctx.raw?.mintedBefore),
          changed: ctx.minted !== ctx.mintedBefore,
          ...debtLedger,
          sub:
            zchfSplitLine(read ? frankencoinZchfSplit(read, dMint, ctx.hub) : null, coords, sym) ??
            (pending ? <span className="text-rb-400">reading the receipt…</span> : undefined),
        });
      }
      if (ctx.liqPrice != null)
        stats.push({
          label: `Liq. price · ZCHF per ${sym}, owner-declared`,
          value: fmtFcPrice(Number(ctx.liqPrice)),
          display: fmtFcPrice(Number(ctx.liqPrice)),
          symbol: "",
          prov: liqPriceAfterProv(sym, dec, coords, ctx.raw?.price),
          transition: transitionOf(
            ctx.liqPrice,
            ctx.liqPriceBefore,
            "price",
            sym,
            coords,
            fmtFcPrice,
            ctx.raw?.priceBefore,
            ctx.beforeReadAtBlock,
          ),
          changed: ctx.liqPrice !== ctx.liqPriceBefore,
        });
      break;
    }
  }

  const asCells: ChainTruthCellStat[] = [];
  const asNotes: ChainTruthStat[] = [];
  for (const st of stats) {
    const key = cellKey(st.label);
    if (key && !asCells.some((c) => c.key === key)) asCells.push({ ...st, key });
    else asNotes.push(st);
  }
  const cellList = useChainTruthCells(asCells);
  return {
    cells: cellList.length > 0 ? cellList : { none: "The event moved no balance of the position" },
    notes: asNotes.length > 0 ? <StatNotes stats={asNotes} /> : undefined,
  };
}

/** The debt lane's sub-line: the receipt's split of the ZCHF that moved. */
function zchfSplitLine(
  split: ReturnType<typeof frankencoinZchfSplit>,
  coords: FrankencoinCoords,
  sym: string,
): ReactNode | undefined {
  if (!split) return undefined;
  const P = ({ leg, n }: { leg: Parameters<typeof receiptLegProv>[0]; n: number }) => (
    <Prov info={receiptLegProv(leg, coords, String(n))} value={fmtZchf(n)} symbol="ZCHF">
      <span className="tabular-nums">{fmtZchf(n)}</span>
    </Prov>
  );
  if (split.received != null) {
    return (
      <>
        wallet received <P leg="received" n={split.received} />
        {split.reserveShare != null && (
          <>
            {" "}
            · reserve share <P leg="reserveShare" n={split.reserveShare} />
          </>
        )}
        {split.interest != null && (
          <>
            {" "}
            · interest <P leg="interest" n={split.interest} />
          </>
        )}
        {split.ratePct != null && (
          <>
            {" "}
            (
            <Prov
              info={challengeReceiptProv("rate", sym, coords, String(split.ratePct))}
              value={`${split.ratePct.toFixed(2)}%`}
            >
              <span className="tabular-nums">{split.ratePct.toFixed(2)}% a year</span>
            </Prov>
            {split.termDays != null && (
              <>
                {" "}
                for {termText(split.termDays)}
                {split.minimumTerm ? ", the V1 minimum" : ""}
              </>
            )}
            )
          </>
        )}
      </>
    );
  }
  if (split.paid != null) {
    return (
      <>
        wallet paid <P leg="paid" n={split.paid} />
        {split.reserveReturned != null && split.reserveReturned > 0 && (
          <>
            {" "}
            · reserve share returned <P leg="reserveReturned" n={split.reserveReturned} />
          </>
        )}
      </>
    );
  }
  return undefined;
}

/** An original's Open row: the collateral and fee its transaction moved and
 *  the terms it was opened with, read at the opening block. */
function openingStats(
  o: FrankencoinOpeningRead,
  ctx: FrankencoinContext,
  coords: FrankencoinCoords,
  openedAt: number | undefined,
  deniedAt: number | null,
): ChainTruthStat[] {
  const sym = ctx.collateralSymbol;
  const dec = ctx.collateralDecimals;
  const out: ChainTruthStat[] = [];
  const term = (value: string) => challengeReceiptProv("openTerms", sym, coords, value);
  const deposited = scaled(o.depositedRaw, dec);
  const minimum = o.minimumCollateralRaw != null ? scaled(o.minimumCollateralRaw, dec) : null;
  if (deposited > 0)
    out.push({
      label: "Collateral deposited",
      value: groupExact(formatUnitsExact(o.depositedRaw, dec)),
      display: fmtFcColl(deposited),
      symbol: sym,
      prov: challengeReceiptProv("openDeposit", sym, coords, o.depositedRaw),
      sub:
        minimum != null ? (
          minimum === deposited ? (
            <>the minimum the position must hold</>
          ) : (
            <>
              minimum {fmtFcColl(minimum)} {sym}
            </>
          )
        ) : undefined,
    });
  if (o.priceRaw != null)
    out.push({
      label: `Liq. price · ZCHF per ${sym}, owner-declared`,
      value: fmtFcPrice(scaled(o.priceRaw, 36 - dec)),
      display: fmtFcPrice(scaled(o.priceRaw, 36 - dec)),
      symbol: "",
      prov: term(o.priceRaw),
    });
  const fee = Number(o.fee);
  if (fee > 0)
    out.push({
      label: "Opening fee",
      value: groupExact(o.fee),
      display: fmtZchf(fee),
      symbol: "ZCHF",
      prov: challengeReceiptProv("openFee", sym, coords, o.fee),
      sub: <>paid to the system reserve</>,
    });
  if (o.limit != null)
    out.push({
      label: "Minting limit",
      value: groupExact(o.limit),
      display: fmtZchf(Number(o.limit)),
      symbol: "ZCHF",
      prov: term(o.limit),
      sub: <>for this original and its clones together</>,
    });
  if (o.start != null && openedAt != null && o.start > openedAt)
    out.push({
      label: "Veto window",
      value: `${dateTimeText(openedAt)} → ${dateTimeText(o.start)}`,
      display: `${formatDate(openedAt)} → ${formatDate(o.start)}`,
      symbol: "",
      prov: term(String(o.start)),
      sub: <>{deniedAt != null && deniedAt < o.start ? `denied ${formatDate(deniedAt)}` : "not vetoed"}</>,
    });
  if (o.expiration != null)
    out.push({
      label: "Expires",
      value: dateTimeText(o.expiration),
      display: formatDate(o.expiration),
      symbol: "",
      prov: term(String(o.expiration)),
      sub:
        o.start != null && o.expiration > o.start ? (
          <>{Math.round((o.expiration - o.start) / 86400).toLocaleString("en-US")} days after the veto window</>
        ) : undefined,
    });
  if (o.challengePeriod != null)
    out.push({
      label: "Challenge period",
      value: phaseText(o.challengePeriod),
      display: phaseText(o.challengePeriod),
      symbol: "",
      prov: term(String(o.challengePeriod)),
      sub: <>the length of each of a challenge&rsquo;s two phases</>,
    });
  if (o.reservePPM != null)
    out.push({
      label: "Reserve share",
      value: fmtFcPct(o.reservePPM / 1_000_000),
      display: fmtFcPct(o.reservePPM / 1_000_000),
      symbol: "",
      prov: term(String(o.reservePPM)),
      sub: <>of each mint, held in the system reserve</>,
    });
  if (o.annualInterestPPM != null)
    out.push({
      label: "Interest",
      value: `${(o.annualInterestPPM / 10_000).toFixed(2)}% a year`,
      display: `${(o.annualInterestPPM / 10_000).toFixed(2)}% a year`,
      symbol: "",
      prov: term(String(o.annualInterestPPM)),
      sub:
        o.riskPremiumPPM != null ? (
          <>
            base rate {((o.annualInterestPPM - o.riskPremiumPPM) / 10_000).toFixed(2)}% + risk premium{" "}
            {(o.riskPremiumPPM / 10_000).toFixed(2)}%
          </>
        ) : undefined,
    });
  return out;
}
