"use client";

// Frankencoin event detail — adapter onto the shared ChainTruthDetail grid.
// The minting family renders the position's three ledger lanes — collateral /
// minted / the owner-declared liq. price — each an EMITTED ABSOLUTE equal to
// the position's stored state at that block, with before→after transitions
// built from the row's own two absolutes (MintingUpdate carries no delta
// field; the change receipts say the difference is derived). Challenge and
// forced-sale rows render their slice figures instead. Native units only.

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
  type FrankencoinCoords,
} from "@/lib/frankencoin/event-provenance";
import { formatNumber, formatCompact, formatExact } from "@/lib/utils/format";

export interface FrankencoinEventDetailProps {
  ctx: FrankencoinContext;
  txHash?: string;
  blockNumber?: number;
}

const fmt = (human?: string): string => (human == null ? "—" : formatNumber(Math.abs(Number(human))));

function transitionOf(
  after: string | undefined,
  before: string | undefined,
  what: "minted" | "collateral" | "price",
  sym: string,
  coords: FrankencoinCoords,
  rawBefore?: string,
): ChainTruthTransition | undefined {
  const afterN = after != null ? Number(after) : null;
  const beforeN = before != null ? Number(before) : null;
  if (afterN == null || beforeN == null || !Number.isFinite(afterN) || !Number.isFinite(beforeN)) return undefined;
  const changeN = afterN - beforeN;
  if (changeN === 0) return undefined;
  const sign = changeN >= 0 ? "+" : "−";
  return {
    before: formatCompact(beforeN),
    beforeExact: formatExact(beforeN),
    beforeProv: beforeProv(what, sym, coords, rawBefore),
    change: `${sign}${formatCompact(Math.abs(changeN))}`,
    changeExact: `${sign}${formatExact(Math.abs(changeN))}`,
    changeProv: changeProv(what, sym, coords),
  };
}

export function FrankencoinEventDetail({ ctx, txHash, blockNumber }: FrankencoinEventDetailProps) {
  const coords: FrankencoinCoords = { txHash, blockNumber, position: ctx.position, hub: ctx.hub };
  const sym = ctx.collateralSymbol;
  const dec = ctx.collateralDecimals;

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
    default: {
      // The minting family (open / clone / mint / repay / adjust / close /
      // adjust_price) — the ledger's three lanes. The collateral lane is
      // SKIPPED on an understated row (the V1 clone-creation lie): its
      // emitted figure understates reality, so nothing renders rather than a
      // wrong absolute — the live overlay corrects at head.
      if (ctx.collateral != null && !ctx.collateralUnderstated)
        stats.push({
          label: "Collateral",
          value: fmt(ctx.collateral),
          symbol: sym,
          prov: collateralAfterProv(sym, coords, ctx.raw?.collateral),
          transition: transitionOf(
            ctx.collateral,
            ctx.collateralBefore,
            "collateral",
            sym,
            coords,
            ctx.raw?.collateralBefore,
          ),
          dimmed: ctx.collateral === ctx.collateralBefore,
        });
      if (ctx.minted != null)
        stats.push({
          label: "Minted",
          value: fmt(ctx.minted),
          symbol: "ZCHF",
          prov: mintedAfterProv(coords, ctx.raw?.minted),
          transition: transitionOf(ctx.minted, ctx.mintedBefore, "minted", sym, coords, ctx.raw?.mintedBefore),
          dimmed: ctx.minted === ctx.mintedBefore,
        });
      if (ctx.liqPrice != null)
        stats.push({
          label: "Liq. price · owner-declared",
          value: fmt(ctx.liqPrice),
          symbol: `ZCHF/${sym}`,
          prov: liqPriceAfterProv(sym, dec, coords, ctx.raw?.price),
          transition: transitionOf(ctx.liqPrice, ctx.liqPriceBefore, "price", sym, coords, ctx.raw?.priceBefore),
          dimmed: ctx.liqPrice === ctx.liqPriceBefore,
        });
      break;
    }
  }

  if (stats.length === 0) return null;
  return <ChainTruthDetail stats={stats} />;
}
