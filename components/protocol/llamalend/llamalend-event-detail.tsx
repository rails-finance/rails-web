"use client";

// LlamaLend event detail — adapter onto the shared ChainTruthDetail grid.
// Two lanes: the position's collateral and debt AFTER the event — the same-tx
// UserState after-image, the Controller's own emitted ABSOLUTES (the replay
// is a lag over them, never a running sum), each traced to `state` because a
// user_state read at the block reproduces it. The band tick pair rides the
// debt lane's receipt when the after-image carries it. ⚠️ What this grid can
// NEVER show: the converted/soft-liquidation amount — no event carries it;
// the position page's live chain card does.
//
// Liquidation rows additionally carry the forensics card: the valued two-leg
// seizure (unconverted collateral at AMM.price_oracle read back AT the
// event's block — the oracle-at-block overlay walk — plus the
// already-converted borrowed-token leg at face) against the debt the log
// says was cleared. The price fetch is lazy (this panel mounts on expand)
// and a block the archive read can't answer keeps the card token-only — the
// safe state. A partial liquidation emits no after-image, so the stat grid
// may be absent while the forensics still renders: the taking is stated.

import { useEffect, useState } from "react";
import type { LlamalendContext } from "@/lib/shared/types/event-shape";
import { ChainTruthDetail, type ChainTruthStat } from "@/components/shared/chain-truth-event";
import { LiquidationForensics, type LiquidationForensicsProps } from "@/components/shared/liquidation-forensics";
import {
  afterImageProv,
  tickPairProv,
  llamaAtBlockPriceProv,
  llamaLiqSeizedValueProv,
  llamaLiqClearedValueProv,
  llamaLiqPremiumProv,
  type LlamalendCoords,
} from "@/lib/llamalend/event-provenance";
import { formatNumber } from "@/lib/utils/format";

export interface LlamalendEventDetailProps {
  ctx: LlamalendContext;
  txHash?: string;
  blockNumber?: number;
  wallet?: string;
}

const fmt = (human?: string): string => (human == null ? "—" : formatNumber(Math.abs(Number(human))));

interface AtBlockPrice {
  price: number;
  priceRaw: string;
  amm: string;
}

/** The at-block oracle price for a liquidation row — fetched once on mount
 *  (the detail mounts on expand). `undefined` while loading or after a miss:
 *  the card renders without the priced leg, which is the safe state. */
function useLiqPriceAtBlock(enabled: boolean, controller: string, blockNumber?: number): AtBlockPrice | undefined {
  const [price, setPrice] = useState<AtBlockPrice | undefined>(undefined);
  useEffect(() => {
    if (!enabled || blockNumber == null) return;
    let live = true;
    fetch(`/api/chain/llamalend/liq-price?controller=${controller}&block=${blockNumber}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live && d && typeof d.price === "number" && d.price > 0) {
          setPrice({ price: d.price, priceRaw: String(d.priceRaw), amm: String(d.amm) });
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [enabled, controller, blockNumber]);
  return price;
}

/** The valued two-leg breakdown. Undefined until the pieces are in hand:
 *  cleared must be positive, and the collateral leg needs the at-block price
 *  (a fully-converted seizure has no collateral leg and needs none). */
function buildLlamalendLiqForensics(
  ctx: LlamalendContext,
  coords: LlamalendCoords,
  atBlock: AtBlockPrice | undefined,
): LiquidationForensicsProps | undefined {
  const cleared = ctx.debtDelta != null ? Math.abs(Number(ctx.debtDelta)) : NaN;
  if (!Number.isFinite(cleared) || cleared <= 0) return undefined;

  const collSeized = ctx.collateralDelta != null ? Math.abs(Number(ctx.collateralDelta)) : 0;
  const converted = ctx.convertedTaken != null ? Math.abs(Number(ctx.convertedTaken)) : 0;
  if (collSeized <= 0 && converted <= 0) return undefined;
  // The collateral leg can only be valued with the block's own price.
  if (collSeized > 0 && atBlock == null) return undefined;

  const price = atBlock?.price ?? 0;
  const seizedValue = collSeized * price + converted;
  if (!Number.isFinite(seizedValue) || seizedValue <= 0) return undefined;

  const bSym = ctx.borrowedSymbol;
  const cSym = ctx.collateralSymbol;
  const role = ctx.role ?? "borrower";
  const isSelf = role === "self" || ctx.selfLiquidation === true;
  const inBorrowed = (n: number) => `${formatNumber(n)} ${bSym}`;

  const seizedParts = {
    collateral: formatNumber(collSeized),
    ...(collSeized > 0 ? { price: formatNumber(price) } : {}),
    converted: formatNumber(converted),
  };

  return {
    seized: {
      // A mixed seizure (collateral + converted) names no single asset.
      ...(collSeized > 0 && converted <= 0
        ? { symbol: cSym }
        : converted > 0 && collSeized <= 0
          ? { symbol: bSym }
          : {}),
      usd: seizedValue,
      usdProv: llamaLiqSeizedValueProv(cSym, bSym, coords, seizedParts),
    },
    cleared: {
      symbol: bSym,
      usd: cleared,
      usdProv: llamaLiqClearedValueProv(bSym, role, coords, ctx.raw?.debtDelta),
    },
    premium: seizedValue / cleared - 1,
    premiumProv: llamaLiqPremiumProv(bSym, role, coords, {
      seized: inBorrowed(seizedValue),
      cleared: inBorrowed(cleared),
    }),
    // A self-liquidation is the owner settling and taking the remainder —
    // a recovery, not a liquidator's bonus.
    ...(isSelf ? { premiumLabel: "Settlement margin" } : {}),
    pricePills:
      collSeized > 0 && atBlock != null
        ? [
            {
              symbol: cSym,
              priceUsd: price,
              priceProv: llamaAtBlockPriceProv(cSym, bSym, coords, atBlock.amm, atBlock.priceRaw),
              note: "AMM oracle at block",
            },
          ]
        : [],
    format: { value: inBorrowed, price: inBorrowed },
  };
}

export function LlamalendEventDetail({ ctx, txHash, blockNumber, wallet }: LlamalendEventDetailProps) {
  const coords: LlamalendCoords = { txHash, blockNumber, controller: ctx.controller, user: wallet };
  const isLiq = ctx.eventType === "liquidation";
  // Fetch only when a collateral leg exists — a fully-converted seizure is
  // valued at face and needs no archive read.
  const needsPrice = isLiq && ctx.collateralDelta != null && Math.abs(Number(ctx.collateralDelta)) > 0;
  const atBlock = useLiqPriceAtBlock(needsPrice, ctx.controller, blockNumber);

  const stats: ChainTruthStat[] = [];
  if (ctx.collateralAfter != null) {
    stats.push({
      label: "Collateral",
      value: fmt(ctx.collateralAfter),
      symbol: ctx.collateralSymbol,
      prov: afterImageProv(ctx.collateralSymbol, "collateral", coords, ctx.raw?.collateralAfter),
      dimmed: !ctx.collateralDelta || Number(ctx.collateralDelta) === 0,
    });
  }
  if (ctx.debtAfter != null) {
    stats.push({
      label: "Debt",
      value: fmt(ctx.debtAfter),
      symbol: ctx.borrowedSymbol,
      prov: afterImageProv(ctx.borrowedSymbol, "debt", coords, ctx.raw?.debtAfter),
      dimmed: !ctx.debtDelta || Number(ctx.debtDelta) === 0,
    });
  }
  if (ctx.n1 != null && ctx.n2 != null) {
    stats.push({
      label: "Band ticks",
      value: `${ctx.n1} … ${ctx.n2}`,
      symbol: "",
      prov: tickPairProv(coords, ctx.n1, ctx.n2),
    });
  }

  const forensics = isLiq ? buildLlamalendLiqForensics(ctx, coords, atBlock) : undefined;

  if (stats.length === 0 && !forensics) return null;
  return (
    <>
      {stats.length > 0 && <ChainTruthDetail stats={stats} />}
      {forensics && <LiquidationForensics {...forensics} />}
    </>
  );
}
