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
  type FrankencoinCoords,
} from "@/lib/frankencoin/event-provenance";
import { formatExact, formatNumber } from "@/lib/utils/format";
import { Prov } from "@/components/shared/provenance";
import { shortAddress } from "@/lib/frankencoin/asset-catalog";
import { fmtFcColl, fmtFcPrice, fmtZchf } from "@/lib/frankencoin/figures";
import { frankencoinZchfSplit, useFrankencoinEventRead } from "@/lib/frankencoin/use-event-read";

export interface FrankencoinEventDetailProps {
  ctx: FrankencoinContext;
  txHash?: string;
  blockNumber?: number;
}

const fmt = (human?: string): string => (human == null ? "—" : formatNumber(Math.abs(Number(human))));

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

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

export function FrankencoinEventDetail({ ctx, txHash, blockNumber }: FrankencoinEventDetailProps) {
  const coords: FrankencoinCoords = { txHash, blockNumber, position: ctx.position, hub: ctx.hub };
  const sym = ctx.collateralSymbol;
  const dec = ctx.collateralDecimals;
  const read = useFrankencoinEventRead(ctx, txHash);

  const stats: ChainTruthStat[] = [];

  switch (ctx.eventType) {
    case "challenge_started":
    case "challenge_averted": {
      const phase = ctx.eventType === "challenge_started" ? "started" : "averted";
      if (ctx.challengeSize != null)
        stats.push({
          label: phase === "started" ? "Collateral challenged" : "Challenge averted",
          value: fmt(ctx.challengeSize),
          symbol: sym,
          prov: challengeFigureProv("size", phase, sym, coords, ctx.raw?.size),
        });
      break;
    }
    case "challenge_succeeded": {
      if (ctx.acquiredCollateral != null)
        stats.push({
          label: "Collateral sold",
          value: fmt(ctx.acquiredCollateral),
          symbol: sym,
          prov: challengeFigureProv("acquiredCollateral", "succeeded", sym, coords, ctx.raw?.acquiredCollateral),
        });
      if (ctx.bid != null)
        stats.push({
          label: "Bid paid",
          value: fmt(ctx.bid),
          symbol: "ZCHF",
          prov: challengeFigureProv("bid", "succeeded", sym, coords, ctx.raw?.bid),
        });
      if (ctx.challengeSize != null)
        stats.push({
          label: "Slice of challenge",
          value: fmt(ctx.challengeSize),
          symbol: sym,
          prov: challengeFigureProv("challengeSize", "succeeded", sym, coords, ctx.raw?.challengeSize),
        });
      break;
    }
    case "forced_sale": {
      if (ctx.forcedSaleAmount != null)
        stats.push({
          label: "Collateral sold",
          value: fmt(ctx.forcedSaleAmount),
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
          sub: zchfSplitLine(read ? frankencoinZchfSplit(read, dMint) : null, coords),
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
