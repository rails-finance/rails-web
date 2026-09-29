"use client";

// Frankencoin event detail — adapter onto the shared ChainTruthDetail grid.
// The minting family renders the position's three ledger lanes — collateral /
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
import {
  ChainTruthDetail,
  type ChainTruthStat,
  type ChainTruthTransition,
} from "@/components/shared/chain-truth-event";
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
import { formatExact, formatNumber } from "@/lib/utils/format";
import { Prov } from "@/components/shared/provenance";
import { hubAddress, shortAddress } from "@/lib/frankencoin/asset-catalog";
import { fmtFcColl, fmtFcPct, fmtFcPrice, fmtZchf, termText } from "@/lib/frankencoin/figures";
import { frankencoinZchfSplit, useFrankencoinEventRead } from "@/lib/frankencoin/use-event-read";
import { dateTimeText, phaseText, spanText, useFrankencoinPageFacts } from "@/lib/frankencoin/page-facts";
import { formatDate } from "@/lib/date";

export interface FrankencoinEventDetailProps {
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
): ChainTruthTransition | undefined {
  const afterN = after != null ? Number(after) : null;
  const beforeN = before != null ? Number(before) : null;
  if (afterN == null || beforeN == null || !Number.isFinite(afterN) || !Number.isFinite(beforeN)) return undefined;
  const changeN = afterN - beforeN;
  if (changeN === 0) return undefined;
  const sign = changeN >= 0 ? "+" : "−";
  return {
    before: f(beforeN),
    beforeExact: formatExact(beforeN),
    beforeProv: beforeProv(what, sym, coords, rawBefore),
    change: `${sign}${f(changeN)}`,
    changeExact: `${sign}${f(changeN)}`,
    changeProv: changeProv(what, sym, coords),
    shownAsIs: true,
  };
}

export function FrankencoinEventDetail({ ctx, txHash, blockNumber, eventId, timestamp }: FrankencoinEventDetailProps) {
  const coords: FrankencoinCoords = { txHash, blockNumber, position: ctx.position, hub: ctx.hub };
  const sym = ctx.collateralSymbol;
  const dec = ctx.collateralDecimals;
  const { read, pending } = useFrankencoinEventRead(ctx, txHash, eventId);
  const facts = useFrankencoinPageFacts();

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
      if (ctx.forcedSaleAmount != null)
        stats.push({
          label: "Collateral sold",
          value: fmtFcColl(num(ctx.forcedSaleAmount)),
          display: fmtFcColl(num(ctx.forcedSaleAmount)),
          symbol: sym,
          prov: forcedSaleProv(sym, coords, ctx.raw?.size),
        });
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
          ),
          changed: ctx.collateral !== ctx.collateralBefore,
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
          sub:
            zchfSplitLine(read ? frankencoinZchfSplit(read, dMint) : null, coords, sym) ??
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
          ),
          changed: ctx.liqPrice !== ctx.liqPriceBefore,
        });
      break;
    }
  }

  if (stats.length === 0) return null;
  return <ChainTruthDetail stats={stats} />;
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
            {split.termDays != null && <> for {termText(split.termDays)}</>})
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
