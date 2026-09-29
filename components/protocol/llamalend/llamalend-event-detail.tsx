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
import {
  ChainTruthDetail,
  type ChainTruthStat,
  type ChainTruthTransition,
} from "@/components/shared/chain-truth-event";
import { Prov } from "@/components/shared/provenance";
import { useLlamalendEventState } from "@/lib/llamalend/use-event-state";
import {
  fmtBandPrice,
  fmtColl,
  fmtHealth,
  fmtPrice,
  llamalendEventFigures,
  soldSincePrevious,
  type LlamalendPreviousStated,
} from "@/lib/llamalend/event-figures";
import { formatDayMonth } from "@/lib/date";
import { LiquidationForensics, type LiquidationForensicsProps } from "@/components/shared/liquidation-forensics";
import {
  afterImageProv,
  tickPairProv,
  llamaAtBlockPriceProv,
  llamaLiqSeizedValueProv,
  llamaLiqClearedValueProv,
  llamaLiqPremiumProv,
  stateAtBlockProv,
  stateChangeProv,
  type LlamalendCoords,
} from "@/lib/llamalend/event-provenance";
import { formatNumber, formatUnitsExact } from "@/lib/utils/format";

export interface LlamalendEventDetailProps {
  ctx: LlamalendContext;
  txHash?: string;
  blockNumber?: number;
  wallet?: string;
  /** The last collateral balance an earlier row stated (see
   *  lib/llamalend/event-figures.ts), for what the AMM sold since. */
  previousStated?: LlamalendPreviousStated | null;
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
    ...(collSeized > 0 ? { price: fmtPrice(price) } : {}),
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
    format: { value: inBorrowed, price: (n: number) => `${fmtPrice(n)} ${bSym}` },
  };
}

export function LlamalendEventDetail({ ctx, txHash, blockNumber, wallet, previousStated }: LlamalendEventDetailProps) {
  const coords: LlamalendCoords = { txHash, blockNumber, controller: ctx.controller, user: wallet };
  const isLiq = ctx.eventType === "liquidation";
  // Fetch only when a collateral leg exists — a fully-converted seizure is
  // valued at face and needs no archive read.
  const needsPrice = isLiq && ctx.collateralDelta != null && Math.abs(Number(ctx.collateralDelta)) > 0;
  const atBlock = useLiqPriceAtBlock(needsPrice, ctx.controller, blockNumber);
  // The position at block − 1 and at this block: what stood before, what the
  // AMM had converted, and health on each side.
  const state = useLlamalendEventState(ctx, blockNumber, wallet);
  const f = state ? llamalendEventFigures(ctx, state) : null;
  const block = blockNumber ?? 0;
  const cSym = ctx.collateralSymbol;
  const bSym = ctx.borrowedSymbol;

  const moved = (a: number | null, b: number | null, scale: number) =>
    a != null && b != null && Math.abs(a - b) > Math.max(Math.abs(b), Math.abs(a), 1) * 1e-12 * scale;

  /** Before → after from the two reads, at the grid's precision. */
  const transition = (
    figure: string,
    getter: string,
    before: number | null,
    after: number | null,
    beforeRaw: string | null,
    fmt: (n: number) => string,
  ): ChainTruthTransition | undefined => {
    if (before == null || after == null || !moved(after, before, 1)) return undefined;
    const d = after - before;
    const sign = d >= 0 ? "+" : "−";
    return {
      before: fmt(before),
      beforeExact: String(before),
      beforeProv: stateAtBlockProv(figure, getter, block - 1, coords, beforeRaw),
      change: `${sign}${fmt(Math.abs(d))}`,
      changeExact: `${sign}${Math.abs(d)}`,
      changeProv: stateChangeProv(figure, coords),
      shownAsIs: true,
    };
  };

  const stats: ChainTruthStat[] = [];

  // Collateral: the event's after-image, or the read at this block where the
  // Controller logged its sentinel (a repay while converted).
  const collAfterStr =
    ctx.collateralAfter ??
    (f && state ? formatUnitsExact(state.after.collateralRaw ?? "0", ctx.collateralDecimals) : null);
  if (collAfterStr != null) {
    const t = f
      ? transition(
          `${cSym} collateral`,
          "Controller.user_state(user)[0]",
          f.collBefore,
          Number(collAfterStr),
          state?.before.collateralRaw ?? null,
          fmtColl,
        )
      : undefined;
    const sold = f ? soldSincePrevious(previousStated, f) : null;
    stats.push({
      label: "Collateral",
      value: fmt(collAfterStr),
      display: fmtColl(Number(collAfterStr)),
      symbol: cSym,
      prov:
        ctx.collateralAfter != null
          ? afterImageProv(cSym, "collateral", coords, ctx.raw?.collateralAfter)
          : stateAtBlockProv(
              `${cSym} collateral`,
              "Controller.user_state(user)[0]",
              block,
              coords,
              state?.after.collateralRaw,
            ),
      changed: t != null || (Boolean(ctx.collateralDelta) && Number(ctx.collateralDelta) !== 0),
      transition: t,
      sub:
        sold != null && previousStated ? (
          <>
            {(f?.convBefore ?? 0) > 0
              ? `${fmtColl(sold)} ${cSym} sold by the AMM since the ${formatDayMonth(previousStated.timestamp)} event.`
              : `${fmtColl(sold)} ${cSym} fewer than after the ${formatDayMonth(previousStated.timestamp)} event: the AMM sold it while the price sat in the bands, and the buy-back did not restore it.`}
          </>
        ) : undefined,
    });
  }

  // Converted: the borrowed token the AMM held from sold collateral, where
  // there was any on either side of the event.
  if (f && state && ((f.convBefore ?? 0) > 0 || (f.convAfter ?? 0) > 0)) {
    const t = transition(
      `${bSym} converted`,
      "Controller.user_state(user)[1]",
      f.convBefore,
      f.convAfter,
      state.before.convertedRaw,
      formatNumber,
    );
    stats.push({
      label: "Converted",
      value: formatUnitsExact(state.after.convertedRaw ?? "0", ctx.borrowedDecimals),
      display: formatNumber(f.convAfter ?? 0),
      symbol: bSym,
      prov: stateAtBlockProv(
        `${bSym} converted`,
        "Controller.user_state(user)[1]",
        block,
        coords,
        state.after.convertedRaw,
      ),
      changed: t != null,
      transition: t,
      sub: f.hadLoan && (f.convBefore ?? 0) > 0 ? <>In soft-liquidation at this block.</> : undefined,
    });
  }

  const debtAfterStr =
    ctx.debtAfter ?? (f && state ? formatUnitsExact(state.after.debtRaw ?? "0", ctx.borrowedDecimals) : null);
  if (debtAfterStr != null) {
    const t = f
      ? transition(
          `${bSym} debt`,
          "Controller.user_state(user)[2]",
          f.debtBefore,
          Number(debtAfterStr),
          state?.before.debtRaw ?? null,
          formatNumber,
        )
      : undefined;
    stats.push({
      label: "Debt",
      value: fmt(debtAfterStr),
      symbol: bSym,
      prov:
        ctx.debtAfter != null
          ? afterImageProv(bSym, "debt", coords, ctx.raw?.debtAfter)
          : stateAtBlockProv(`${bSym} debt`, "Controller.user_state(user)[2]", block, coords, state?.after.debtRaw),
      changed: t != null || (Boolean(ctx.debtDelta) && Number(ctx.debtDelta) !== 0),
      transition: t,
    });
  }

  // Health on each side: Controller.health(user, true). Below 0 anyone may
  // liquidate the position. Where health crossed 0 between the end of the
  // block before and the start of this one (a liquidation row's `start`
  // read), the grid says so under the figure.
  const startSub =
    f && f.healthStart != null && f.healthBefore != null && f.healthStart < 0 !== f.healthBefore < 0 ? (
      <>
        <Prov
          info={stateAtBlockProv("Health", "Controller.health(user, true)", block, coords)}
          value={`${f.healthStart * 100}%`}
        >
          {fmtHealth(f.healthStart)}
        </Prov>{" "}
        at the start of this block.
      </>
    ) : undefined;
  if (f && state && f.healthAfter == null && f.healthBefore != null) {
    // The event closed the loan: health before it, and no loan after.
    stats.push({
      label: "Health",
      value: `${f.healthBefore * 100}%`,
      display: "no loan",
      symbol: "",
      prov: stateAtBlockProv("Health", "Controller.health(user, true)", block - 1, coords, state.before.healthRaw),
      changed: true,
      sub: startSub,
      transition: {
        before: fmtHealth(f.healthBefore),
        beforeExact: `${f.healthBefore * 100}%`,
        beforeProv: stateAtBlockProv(
          "Health",
          "Controller.health(user, true)",
          block - 1,
          coords,
          state.before.healthRaw,
        ),
        change: "loan closed",
        changeExact: "loan closed",
        changeProv: stateChangeProv("health", coords),
        shownAsIs: true,
      },
    });
  } else if (f && state && f.healthAfter != null) {
    const after = f.healthAfter;
    const t =
      after != null
        ? transition("Health", "Controller.health(user, true)", f.healthBefore, after, state.before.healthRaw, (x) =>
            fmtHealth(x).replace(/^−/, ""),
          )
        : undefined;
    stats.push({
      label: "Health",
      value: after != null ? `${after * 100}%` : "0",
      display: after != null ? fmtHealth(after) : "no loan",
      symbol: "",
      prov: stateAtBlockProv("Health", "Controller.health(user, true)", block, coords, state.after.healthRaw),
      changed: t != null,
      sub: startSub,
      transition: t
        ? {
            ...t,
            beforeExact: f.healthBefore != null ? `${f.healthBefore * 100}%` : t.beforeExact,
            before: f.healthBefore != null ? fmtHealth(f.healthBefore) : t.before,
            change: `${t.change.startsWith("−") ? "−" : "+"}${fmtHealthPts(Math.abs((after ?? 0) - (f.healthBefore ?? 0)))}`,
          }
        : undefined,
    });
  }

  const n1 = ctx.n1 ?? (f?.n1After != null ? String(f.n1After) : null);
  const n2 = ctx.n2 ?? (f?.n2After != null ? String(f.n2After) : null);
  // A row that closed the loan leaves no bands (the stored ticks read 0 … 0).
  const closedHere = ctx.debtAfter != null && Number(ctx.debtAfter) === 0;
  if (n1 != null && n2 != null && !closedHere) {
    const bandsMoved = f != null && f.n1Before != null && f.n1Before !== Number(n1);
    stats.push({
      label: "Band ticks",
      value: `${n1} … ${n2}`,
      symbol: "",
      prov: tickPairProv(coords, n1, n2),
      changed: bandsMoved,
      transition:
        bandsMoved && f && state
          ? {
              before: `${f.n1Before} … ${f.n2Before}`,
              beforeExact: `${f.n1Before} … ${f.n2Before}`,
              beforeProv: stateAtBlockProv("Band ticks", "AMM.read_user_tick_numbers(user)", block - 1, coords),
              change: `${Number(n1) - (f.n1Before ?? 0) > 0 ? "+" : "−"}${Math.abs(Number(n1) - (f.n1Before ?? 0))}`,
              changeExact: String(Number(n1) - (f.n1Before ?? 0)),
              changeProv: stateChangeProv("the band ticks", coords),
              shownAsIs: true,
            }
          : undefined,
      sub:
        f && f.pUpAfter != null && f.pDownAfter != null ? (
          <>
            <Prov
              info={stateAtBlockProv("Band prices", "Controller.user_prices(user)", block, coords)}
              value={`${f.pUpAfter} → ${f.pDownAfter}`}
            >
              {fmtBandPrice(f.pUpAfter)} → {fmtBandPrice(f.pDownAfter)}
            </Prov>{" "}
            {bSym} per {cSym}
          </>
        ) : undefined,
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

/** A health change in percentage points ("2.73 pts"). */
function fmtHealthPts(fraction: number): string {
  return `${(fraction * 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pts`;
}
