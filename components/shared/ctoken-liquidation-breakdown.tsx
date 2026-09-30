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
      debtMarket: p.debtBefore == null ? p.debtKey : undefined,
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

  const before = at?.before;
  if (before && at) {
    lines.push(
      before.shortfallUsd > 0 ? (
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
            <strong>{usdSmall(before.shortfallUsd)}</strong>
          </Prov>{" "}
          shortfall: its debt was worth more than its borrow limit, so anyone could liquidate it.
          {at.after && at.after.shortfallUsd === 0 && (
            <>
              {" "}
              After the liquidation it had{" "}
              <Prov info={read("Liquidity", "getAccountLiquidity", at.block)}>
                {usdSmall(at.after.liquidityUsd)}
              </Prov>{" "}
              of borrowing room left.
            </>
          )}
        </>
      ) : (
        <>
          At block {(at.block - 1).toLocaleString("en-US")} the Comptroller reported no shortfall; the price or interest
          update that made this account liquidatable happened inside block {at.block.toLocaleString("en-US")}.
        </>
      ),
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
  if (cf != null && debtBefore != null && debtBefore > 0) {
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
          about {fmt(p.seizedValue * share)}) as reserves: that is the &ldquo;{p.protocolShareRow}
          &rdquo; row. The liquidator received {amt(p.seizeTokens - shareTokens)} {p.seizeSymbol}, about {fmt(kept)}:{" "}
          {pct(kept / p.clearedValue - 1)} over the debt it repaid, before gas.
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
