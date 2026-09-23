// Compound V3 (Ethereum) position → share-card model. The bridge between
// `loadCompoundPositionTail`'s `position` row (the same server tail the
// position page itself awaits) and the shared card renderer — no second
// read, no fetched prices of our own.
//
// A Comet position decomposes onto two sides by the sign of its base: a net
// LENDER's base sits on the supply side (with any posted collateral), a
// BORROWER's sits on the debt side as a positive magnitude — the read
// `CompoundPositionCard`'s `effectiveBase`/`cardSideUsd` do for the live
// card. `compoundEffectiveSide` and `largestCompoundAsset` mirror that same
// arithmetic in plain, server-safe functions (rather than importing the
// "use client" card) and are shared with the Base wallet mapper
// (lib/compound-base/share-card.ts), which asks the same question of a live
// chain read instead of an indexed row.

import type { CompoundPositionSummary } from "@/lib/sources/api/compound-positions";
import { CARD_VOCAB } from "@/lib/shared/card-vocab";
import { formatUsd } from "@/lib/shared/format-event";
import { formatCompact } from "@/lib/utils/format";
import { shortSubject } from "@/lib/shared/page-metadata";
import { marketOf } from "@/lib/compound/asset-catalog";
import type { PositionCardModel } from "@/lib/share/position-card";

const STATUS_WORD: Record<CompoundPositionSummary["status"], string> = {
  open: "Open",
  closed: "Closed",
  liquidated: "Liquidated",
  // No state recorded for the account yet (0018); never read as closed.
  unread: "Unread",
};

/** One named token amount — the shape both Compound mappers pick a "largest"
 *  asset out of. */
export interface CompoundAssetLike {
  symbol: string;
  amount: number;
}

/** The single largest positive amount in a set of legs — the fallback
 *  headline for when no USD total is available for a side. Mirrors
 *  `largestReserve` in lib/aave-v3/share-card.ts over the Comet asset shape. */
export function largestCompoundAsset(assets: CompoundAssetLike[]): CompoundAssetLike | null {
  let best: CompoundAssetLike | null = null;
  for (const a of assets) {
    if (a.amount <= 0) continue;
    if (!best || a.amount > best.amount) best = a;
  }
  return best;
}

/** The base figure to state: the signed present value plus its side. Mirrors
 *  `effectiveBase` in compound-position-card.tsx. */
export function compoundEffectiveSide(position: CompoundPositionSummary): {
  amount: number;
  side: "lend" | "borrow" | "flat";
} {
  if (position.current) return { amount: position.current.amount, side: position.current.side };
  return { amount: position.base.amount, side: position.side };
}

/** On-chain oracle USD for one asset; null when this market didn't price it —
 *  mirrors `assetUsd` in compound-position-card.tsx. */
function assetUsd(priceByAddress: Record<string, number> | undefined, address: string, amount: number): number | null {
  const p = priceByAddress?.[address.toLowerCase()];
  return typeof p === "number" && p > 0 ? amount * p : null;
}

/** Total USD across a set of legs, null the moment any contributing leg is
 *  unpriced — the same strict guard `totalUsd` applies on the live card, so a
 *  partial total is never asserted here either. */
function totalUsd(
  priceByAddress: Record<string, number> | undefined,
  legs: { address: string; amount: number }[],
): number | null {
  let sum = 0;
  let any = false;
  for (const { address, amount } of legs) {
    if (amount <= 0) continue;
    const u = assetUsd(priceByAddress, address, amount);
    if (u == null) return null;
    sum += u;
    any = true;
  }
  return any ? sum : null;
}

export function compoundShareCardModel(
  position: CompoundPositionSummary | null,
  params: { wallet: string; market: string },
): PositionCardModel | null {
  // No row for this (wallet, market) — `positionImage` degrades to the
  // static roster card rather than rendering an empty one.
  if (!position) return null;

  const stats: PositionCardModel["stats"] = [];

  if (position.status === "open") {
    const eff = compoundEffectiveSide(position);
    const supplyLegs = [
      ...(eff.side === "lend" ? [{ address: position.base.address, amount: eff.amount }] : []),
      ...position.collateral.map((c) => ({ address: c.address, amount: c.amount })),
    ];
    const supplyUsd = totalUsd(position.priceByAddress, supplyLegs);
    if (supplyUsd != null) {
      stats.push({ label: CARD_VOCAB.collateral, value: formatUsd(supplyUsd) });
    } else {
      const assets: CompoundAssetLike[] = [
        ...(eff.side === "lend" ? [{ symbol: position.base.symbol, amount: eff.amount }] : []),
        ...position.collateral.map((c) => ({ symbol: c.symbol, amount: c.amount })),
      ];
      const top = largestCompoundAsset(assets);
      if (top) stats.push({ label: CARD_VOCAB.collateral, value: `${formatCompact(top.amount)} ${top.symbol}` });
    }
    // No debt column when this position isn't a borrower — Comet's base is
    // signed and single-sided, so there is no separate zero-debt figure to
    // state the way Aave's `totalDebtUsd` carries an explicit $0.
    if (eff.side === "borrow") {
      const debtUsd = assetUsd(position.priceByAddress, position.base.address, Math.abs(eff.amount));
      if (debtUsd != null) {
        stats.push({ label: CARD_VOCAB.debt, value: formatUsd(debtUsd) });
      } else {
        stats.push({ label: CARD_VOCAB.debt, value: `${formatCompact(Math.abs(eff.amount))} ${position.base.symbol}` });
      }
    }
  } else {
    // Closed/liquidated: current balances are ~0 by construction — the
    // highest-recorded per-asset amounts are what `peak` carries. Token
    // amounts only, no USD, matching the detail card's own closed layout.
    const supplyPeaks: CompoundAssetLike[] = [
      ...(position.peak.lentBase > 0 ? [{ symbol: position.base.symbol, amount: position.peak.lentBase }] : []),
      ...position.peak.collateral.map((c) => ({ symbol: c.symbol, amount: c.amount })),
    ];
    const supplyOnly = position.peak.collateral.length === 0 && position.peak.lentBase > 0;
    const topSupply = largestCompoundAsset(supplyPeaks);
    if (topSupply) {
      stats.push({
        label: supplyOnly ? CARD_VOCAB.peakSupply : CARD_VOCAB.peakCollateral,
        value: `${formatCompact(topSupply.amount)} ${topSupply.symbol}`,
      });
    }
    if (position.peak.borrowedBase > 0) {
      stats.push({
        label: CARD_VOCAB.peakDebt,
        value: `${formatCompact(position.peak.borrowedBase)} ${position.base.symbol}`,
      });
    }
  }

  return {
    session: "compound",
    subject: shortSubject(params.wallet),
    market: marketOf(params.market).baseSymbol,
    status: STATUS_WORD[position.status],
    stats,
    asOf: new Date(),
  };
}
