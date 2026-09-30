"use client";

// The lines beneath a Compound V2 or Moonwell liquidation's valued legs: why
// the account could be liquidated (the Comptroller's shortfall at the block
// before), how much the close factor let the liquidator repay, and how the
// seized collateral split between the liquidator and the market's reserves —
// so the gross incentive on the row and what the liquidator kept are both
// stated, and the protocol's-share row below is named.
//
// The chain reads come from /api/chain/ctoken-liquidity-at, fetched when the
// row is opened. Each line renders only when its inputs are known.

import { useEffect, useState } from "react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import {
  fetchCTokenLiquidityAt,
  type CTokenLiquidityAt,
  type CTokenProtocol,
} from "@/lib/api/fetch-ctoken-liquidity-at";
import { formatNumber, formatUsdValue } from "@/lib/utils/format";

export interface CTokenLiquidationBreakdownProps {
  protocol: CTokenProtocol;
  brand: string;
  wallet: string;
  block: number;
  comptroller: { name: string; address: string };
  /** Collateral market key as the liquidity route takes it. */
  collateralKey: string;
  /** Debt market key: the route then states the debt the liquidation met,
   *  where no row does. */
  debtKey?: string;
  /** The repaid amount in the debt token's base units, to scale that debt. */
  repaidRaw?: string;
  debtSymbol: string;
  repaid: number;
  /** The borrowed market's debt just before the liquidation, where a row
   *  states it. */
  debtBefore: number | null;
  /** Seized receipt tokens (the liquidator's and the protocol's together). */
  seizeTokens: number;
  seizeSymbol: string;
  /** The valued legs at the block, in `format`'s unit. */
  seizedValue: number | null;
  clearedValue: number | null;
  /** Liquidation incentive at the block, as a fraction (0.08). */
  incentive: number | null;
  /** The timeline row that carries the protocol's share. */
  protocolShareRow: string;
  format?: (n: number) => string;
}

const pct = (f: number, digits = 1) => `${(f * 100).toFixed(digits)}%`;
/** A collateral factor as set: 75%, or 82.5% where it has a half. */
const factorPct = (f: number) => {
  const p = Math.round(f * 1000) / 10;
  return `${Number.isInteger(p) ? p.toFixed(0) : p.toFixed(1)}%`;
};

/** Small amounts keep four significant figures: a 0.0058 ETH repayment is
 *  the figure the story turns on. */
const amt = (n: number) =>
  Math.abs(n) > 0 && Math.abs(n) < 1 ? n.toLocaleString("en-US", { maximumSignificantDigits: 4 }) : formatNumber(n);
const usdSmall = (n: number) =>
  n > 0 && n < 1 ? `$${n.toLocaleString("en-US", { maximumSignificantDigits: 3 })}` : formatUsdValue(n);

export function CTokenLiquidationBreakdown(p: CTokenLiquidationBreakdownProps) {
  const [at, setAt] = useState<CTokenLiquidityAt | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetchCTokenLiquidityAt({
      protocol: p.protocol,
      wallet: p.wallet,
      block: p.block,
      collateral: p.collateralKey,
      debtMarket: p.debtKey,
    }).then((r) => {
      if (live) setAt(r);
    });
    return () => {
      live = false;
    };
  }, [p.protocol, p.wallet, p.block, p.collateralKey, p.debtKey, p.debtBefore]);

  const fmt = p.format ?? formatUsdValue;
  const read = (what: string, fn: string, block: number, note?: string): Provenance => ({
    kind: "chain",
    summary: `${what} — ${p.brand}'s Comptroller answered \`${fn}\` for this account at block ${block.toLocaleString("en-US")}.${note ? ` ${note}` : ""}`,
    contract: p.comptroller,
    via: `${fn} @ block ${block}`,
    verify: { kind: "recompute", text: `Re-run ${fn} at block ${block} against an archive node` },
  });

  const lines: React.ReactNode[] = [];
  const money = (n: number) => (p.format ? p.format(n) : usdSmall(n));
  const collLabel = p.seizeSymbol.replace(/^[cm]/, "");
  const deprecated = at?.debtMarketDeprecated === true;
  const counted = at?.counted ?? null;
  const collCf = counted?.find((c) => c.market === at?.collateralMarket)?.collateralFactor ?? null;

  const before = at?.before;
  if (at && deprecated) {
    lines.push(
      <>
        The {p.debtSymbol} market was deprecated at this block (collateral factor 0, borrowing paused, reserve factor
        100%). For a deprecated market the Comptroller skips the shortfall check and the close factor, so anyone could
        repay the whole {p.debtSymbol} borrow.
        {before && (
          <>
            {" "}
            The account was healthy: at block {(at.block - 1).toLocaleString("en-US")} it had{" "}
            <Prov info={read("Liquidity", "getAccountLiquidity", at.block - 1)}>
              <strong>{money(before.liquidityUsd)}</strong>
            </Prov>{" "}
            of borrowing room.
          </>
        )}
      </>,
    );
  } else if (before && at) {
    if (before.shortfallUsd > 0) {
      lines.push(
        <>
          At block {(at.block - 1).toLocaleString("en-US")}, just before, the account had a{" "}
          <Prov
            info={read(
              "Shortfall",
              "getAccountLiquidity",
              at.block - 1,
              "A shortfall above zero means the debt was worth more than the borrow limit (collateral × each market's collateral factor), which is what lets anyone liquidate.",
            )}
          >
            <strong>{money(before.shortfallUsd)}</strong>
          </Prov>{" "}
          shortfall: its debt was worth more than its borrow limit, so anyone could liquidate it.
          {at.after && at.after.shortfallUsd === 0 && (
            <>
              {" "}
              After the liquidation it had{" "}
              <Prov info={read("Liquidity", "getAccountLiquidity", at.block)}>{money(at.after.liquidityUsd)}</Prov> of
              borrowing room left.
            </>
          )}
        </>,
      );
    } else {
      // No shortfall at the block before: a price or interest update inside
      // this block made the account liquidatable. The shortfall it met is the
      // Comptroller's figure after the liquidation, less the debt repaid, plus
      // the seized collateral at its factor — each at this block's prices.
      const metShortfall =
        at.after && at.after.shortfallUsd === 0 && p.clearedValue != null && p.seizedValue != null && collCf != null
          ? p.clearedValue - p.seizedValue * collCf - at.after.liquidityUsd
          : null;
      lines.push(
        <>
          At block {(at.block - 1).toLocaleString("en-US")} the account had{" "}
          <Prov info={read("Liquidity", "getAccountLiquidity", at.block - 1)}>{money(before.liquidityUsd)}</Prov> of
          borrowing room and no shortfall. A price or interest update inside block {at.block.toLocaleString("en-US")}{" "}
          pushed the debt past the limit
          {metShortfall != null && metShortfall > 0 ? (
            <>
              : at that block&rsquo;s prices the account was <strong>{money(metShortfall)}</strong> short when it was
              liquidated (its {money(at.after!.liquidityUsd)} of room after the liquidation, less the{" "}
              {money(p.clearedValue!)} repaid, plus the {money(p.seizedValue!)} seized × {factorPct(collCf!)})
            </>
          ) : null}
          .
        </>,
      );
    }
  }

  // What the borrow limit counted: each entered market holding a supply, at
  // its collateral factor. A seized market left out of that list was supplied
  // but never entered as collateral.
  if (counted && counted.length > 0) {
    const limit = counted.reduce(
      (a, c) => (c.value == null || a == null ? null : a + c.value * c.collateralFactor),
      0 as number | null,
    );
    lines.push(
      <>
        The borrow limit at block {(at!.block - 1).toLocaleString("en-US")} counted{" "}
        {counted.map((c, i) => (
          <span key={c.market}>
            {i > 0 ? (i === counted.length - 1 ? " and " : ", ") : ""}
            {c.label} {c.value != null ? money(c.value) : ""} × {factorPct(c.collateralFactor)}
          </span>
        ))}
        {limit != null && counted.length > 0 ? <> = {money(limit)}</> : null}.
        {at?.collateralEntered === false && (
          <>
            {" "}
            {collLabel} was supplied but not used as collateral (its market was not entered), so it did not count. A
            liquidation can still seize it: the Comptroller lets a liquidator take any market the account supplies.
          </>
        )}
      </>,
    );
  }

  const cf = at?.closeFactor;
  // The debt the liquidation met: the row's own figure, else the chain's,
  // scaled by the repaid amount's own ratio of base units to tokens.
  const debtBefore =
    p.debtBefore ??
    (at?.debtBeforeRaw && p.repaidRaw && BigInt(p.repaidRaw) > BigInt(0)
      ? (p.repaid * Number((BigInt(at.debtBeforeRaw) * BigInt(1_000_000)) / BigInt(p.repaidRaw))) / 1_000_000
      : null);
  if (deprecated && debtBefore != null && debtBefore > 0) {
    lines.push(
      <>
        No close factor applied: the liquidator repaid {amt(p.repaid)} of the {amt(debtBefore)} {p.debtSymbol} debt (
        {pct(p.repaid / debtBefore)}).
      </>,
    );
  } else if (cf != null && debtBefore != null && debtBefore > 0) {
    const max = debtBefore * cf;
    lines.push(
      <>
        Close factor {pct(cf, 0)}: at most {amt(max)} {p.debtSymbol} of the {amt(debtBefore)} {p.debtSymbol} debt could
        be repaid in this call. The liquidator repaid {amt(p.repaid)} {p.debtSymbol} ({pct(p.repaid / debtBefore)} of
        the debt).
      </>,
    );
  }

  const share = at?.protocolSeizeShare;
  if (p.seizedValue != null && p.clearedValue != null && p.incentive != null) {
    const gross = (
      <>
        Seized {fmt(p.seizedValue)} = repaid {fmt(p.clearedValue)} × {(1 + p.incentive).toFixed(2)} (the{" "}
        {pct(p.incentive, 0)} incentive).
      </>
    );
    if (share != null && share > 0) {
      const shareTokens = p.seizeTokens * share;
      const kept = p.seizedValue * (1 - share);
      lines.push(
        <>
          {gross} The market kept {pct(share, 2)} of the seized {p.seizeSymbol} ({amt(shareTokens)} {p.seizeSymbol},
          about {money(p.seizedValue * share)}) as reserves: that is the &ldquo;{p.protocolShareRow}&rdquo; row. The
          liquidator received {amt(p.seizeTokens - shareTokens)} {p.seizeSymbol}, about {money(kept)}:{" "}
          {pct(kept / p.clearedValue - 1)} over the debt it repaid, before gas.
        </>,
      );
    } else if (share === 0) {
      lines.push(
        <>
          {gross} The {p.seizeSymbol} market takes no protocol share of a seizure, so the liquidator received all{" "}
          {amt(p.seizeTokens)} {p.seizeSymbol}: {pct(p.seizedValue / p.clearedValue - 1)} over the debt it repaid,
          before gas.
        </>,
      );
    } else lines.push(gross);
  }

  if (lines.length === 0) return null;
  return (
    <ul className="px-5 pb-3 space-y-1.5 text-xs text-rb-500 list-disc pl-9" data-liquidation-breakdown="">
      {lines.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  );
}
