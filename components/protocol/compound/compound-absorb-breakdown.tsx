"use client";

// The absorb, as three figures that close — Compound V3's liquidation row.
//
// Comet's AbsorbDebt emits one base figure, basePaidOut: the debt cleared plus
// whatever credit was left past it. This breaks it back apart and ties it to
// the collateral:
//   debt cleared + credit past the debt = total credited (basePaidOut)
//   total credited ($) = Σ seized value × liquidation factor
//   seized value − credited value = what the protocol kept (the absorb's cost
//   to the account)
// and states the line the account crossed: Σ seized value × liquidate factor
// against the debt. The dollar figures are the absorb events' own usdValue
// (the prices of the absorb block); the factors are read from the Comet one
// block before (app/api/chain/compound/absorb-factors), since Comet emits
// neither and governance can move them. With the account's previous event in
// hand, the same read gives the prices then and the borrow rate at both ends,
// so the row says what moved the account over the line and what its debt's
// interest cost a year.

import { useEffect, useState } from "react";
import type { CompoundContext } from "@/lib/shared/types/event-shape";
import { Prov } from "@/components/shared/provenance";
import { StatCard } from "@/components/shared/state-transition";
import { AtBlockPriceFootnote, type AtBlockPricePill } from "@/components/shared/liquidation-forensics";
import {
  absorbCollateralProv,
  absorbCreditProv,
  absorbCreditedUsdProv,
  absorbDebtClearedProv,
  absorbDebtUsdAtLineProv,
  absorbFactorProv,
  absorbKeptProv,
  absorbLineProv,
  absorbPriceProv,
  absorbSeizedUsdProv,
  type CompoundCoords,
} from "@/lib/compound/event-provenance";
import { compoundAbsorbSplit, compoundAmount, impliedYearlyRate } from "@/lib/compound/row-facts";
import { formatExactDecimal, formatUsdValue } from "@/lib/utils/format";
import { BASE_CHAIN_ID } from "@/lib/shared/chains";
import { formatDate } from "@/lib/date";

interface Factors {
  readBlock: number;
  factors: Record<string, { borrow: number; liquidate: number; liquidation: number }>;
  prevBlock?: number;
  /** Oracle prices at the previous event, by asset address; the base as "base". */
  prevPrices?: Record<string, number>;
  /** Borrow rate (yearly fraction) at the previous event and the block before the absorb. */
  borrowRate?: { prev: number | null; read: number | null };
}

/** The account's previous row, where the page has it. */
export interface CompoundPreviousRow {
  blockNumber: number;
  timestamp: number;
  /** The signed base balance after it. */
  baseAfter?: string;
}

const pct = (f: number) => `${Math.round(f * 1000) / 10}%`;
const ratePct = (f: number) => `${(f * 100).toFixed(2)}%`;

/** A price to the digits the sums use: five decimals under $10, so a
 *  stablecoin at $0.99992 does not print as $1.00. */
export function absorbPrice(n: number): string {
  if (n >= 10) return formatUsdValue(n);
  const [whole, frac = ""] = n.toFixed(5).replace(/0+$/, "").split(".");
  return `$${whole}.${frac.padEnd(2, "0")}`;
}

export function CompoundAbsorbBreakdown({
  ctx,
  coords,
  marketKey,
  timestamp,
  previous,
}: {
  ctx: CompoundContext;
  coords: CompoundCoords;
  marketKey: string;
  /** The absorb's time, unix seconds. */
  timestamp?: number;
  previous?: CompoundPreviousRow;
}) {
  const split = compoundAbsorbSplit(ctx);
  const legs = (ctx.absorbedCollateral ?? []).filter((l) => Number.isFinite(Number(l.usdValue)));
  const creditedUsd = Number(ctx.usdValue);
  const [factors, setFactors] = useState<Factors | null>(null);
  const addrs = legs.map((l) => l.address).filter((a): a is string => !!a);
  const addrKey = addrs.join(",");

  useEffect(() => {
    if (!coords.blockNumber || !addrKey) return;
    const ac = new AbortController();
    const deployment = coords.chainId === BASE_CHAIN_ID ? "base" : "ethereum";
    const prev = previous?.blockNumber ? `&prev=${previous.blockNumber}` : "";
    fetch(
      `/api/chain/compound/absorb-factors?deployment=${deployment}&market=${marketKey}&block=${coords.blockNumber}&assets=${addrKey}${prev}`,
      { signal: ac.signal },
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Factors | null) => {
        if (d && d.factors && Object.keys(d.factors).length > 0) setFactors(d);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [coords.blockNumber, coords.chainId, marketKey, addrKey, previous?.blockNumber]);

  if (!split || legs.length === 0 || !Number.isFinite(creditedUsd) || creditedUsd <= 0) return null;
  const sym = ctx.assetSymbol;
  const paidOut = Number(split.paidOut);
  const basePrice = paidOut > 0 ? creditedUsd / paidOut : 0;
  const seizedUsd = legs.reduce((s, l) => s + Number(l.usdValue), 0);
  const keptUsd = seizedUsd - creditedUsd;
  const debtUsd = Number(split.cleared) * basePrice;
  // Dust legs (worth under a cent) are seized with the rest but add nothing.
  const priced = legs.filter((l) => Number(l.usdValue) >= 0.005);
  const factorOf = (a?: string) => (a && factors ? factors.factors[a.toLowerCase()] : undefined);
  const allFactors = priced.every((l) => factorOf(l.address) != null);
  const line = allFactors ? priced.reduce((s, l) => s + Number(l.usdValue) * factorOf(l.address)!.liquidate, 0) : null;
  const creditCheck = allFactors
    ? priced.reduce((s, l) => s + Number(l.usdValue) * factorOf(l.address)!.liquidation, 0)
    : null;

  const baseAmt = (s: string) => (
    <span className="text-sm font-semibold tabular-nums">
      {compoundAmount(Number(s))} {sym}
    </span>
  );
  const usd = (n: number) => <span className="text-sm font-semibold tabular-nums">{formatUsdValue(n)}</span>;
  const term = (l: (typeof legs)[number], which: "liquidate" | "liquidation") => {
    const f = factorOf(l.address)!;
    const v = which === "liquidate" ? f.liquidate : f.liquidation;
    return (
      <span key={`${l.symbol}-${which}`} className="whitespace-nowrap">
        {l.symbol} {formatUsdValue(Number(l.usdValue))} ×{" "}
        <Prov
          info={absorbFactorProv(l.symbol, which === "liquidate" ? "liquidate factor" : "liquidation factor", coords, {
            value: pct(v),
            readBlock: factors!.readBlock,
          })}
          value={pct(v)}
        >
          <span className="tabular-nums">{pct(v)}</span>
        </Prov>
      </span>
    );
  };
  const joinTerms = (which: "liquidate" | "liquidation") =>
    priced.flatMap((l, i) => [...(i > 0 ? [<span key={`plus-${i}-${which}`}> + </span>] : []), term(l, which)]);

  const pills: AtBlockPricePill[] = [];
  for (const l of legs) {
    const amt = Number(l.amount);
    if (!Number.isFinite(amt) || amt <= 0 || Number(l.usdValue) < 0.005) continue;
    pills.push({
      symbol: l.symbol,
      address: l.address,
      priceUsd: Number(l.usdValue) / amt,
      priceProv: absorbPriceProv(l.symbol, coords, { amount: l.amount, usdValue: l.usdValue }),
      note: "price at the absorb",
    });
  }
  if (basePrice > 0)
    pills.push({
      symbol: sym,
      priceUsd: basePrice,
      priceProv: absorbPriceProv(sym, coords, { amount: split.paidOut, usdValue: ctx.usdValue as string }),
      note: "price at the absorb",
    });

  // One liquidation factor for every seized asset (the usual case): the credit
  // and the protocol's share read as N% and 100 − N%.
  const oneFactor =
    allFactors &&
    priced.length > 0 &&
    priced.every((l) => factorOf(l.address)!.liquidation === factorOf(priced[0].address)!.liquidation)
      ? factorOf(priced[0].address)!.liquidation
      : null;

  // What moved between the previous event and the absorb: each seized asset's
  // price, the base's where it is not a dollar token, and the debt's interest.
  const prevPrices = factors?.prevPrices;
  const moves: string[] = [];
  if (prevPrices && previous) {
    for (const l of priced) {
      const then = l.address ? prevPrices[l.address.toLowerCase()] : undefined;
      const now = Number(l.usdValue) / Number(l.amount);
      if (then != null && Number.isFinite(now)) moves.push(`${l.symbol} ${absorbPrice(then)} → ${absorbPrice(now)}`);
    }
    const baseThen = prevPrices.base;
    if (baseThen != null && basePrice > 0 && Math.abs(basePrice / baseThen - 1) > 0.01)
      moves.push(`${sym}, the debt's asset, ${absorbPrice(baseThen)} → ${absorbPrice(basePrice)}`);
  }
  const prevAfter = previous?.baseAfter != null ? Number(previous.baseAfter) : null;
  const debtBefore = Number(split.before);
  const interestSince =
    prevAfter != null && prevAfter < 0 && debtBefore < 0 ? Math.abs(debtBefore) - Math.abs(prevAfter) : null;
  const seconds = previous && timestamp ? timestamp - previous.timestamp : null;
  const days = seconds != null ? seconds / 86400 : null;
  const avgRate =
    interestSince != null && interestSince > 0 && prevAfter != null && seconds != null
      ? impliedYearlyRate(interestSince, prevAfter, seconds)
      : null;
  const rates = factors?.borrowRate;

  return (
    <div className="px-5 pb-2 space-y-2.5" data-absorb-breakdown="">
      <div className="grid grid-cols-1 gap-2.5 sm:auto-rows-fr sm:grid-cols-3">
        <StatCard label="Debt cleared">
          <Prov
            info={absorbDebtClearedProv(sym, coords, {
              paidOut: formatExactDecimal(split.paidOut),
              before: formatExactDecimal(split.before),
            })}
            value={split.cleared}
            symbol={sym}
          >
            {baseAmt(split.cleared)}
          </Prov>
        </StatCard>
        <StatCard label="Left over after the absorb (lent)">
          <Prov
            info={absorbCreditProv(sym, coords, { paidOut: formatExactDecimal(split.paidOut) })}
            value={split.credit}
            symbol={sym}
          >
            {baseAmt(split.credit)}
          </Prov>
          <div className="mt-1 text-xs text-rb-500">stays in the account as a lent balance</div>
        </StatCard>
        <StatCard label="Total credited">
          <Prov
            info={absorbCreditedUsdProv(sym, coords, { paidOut: formatExactDecimal(split.paidOut) })}
            value={formatUsdValue(creditedUsd)}
          >
            {baseAmt(split.paidOut)} <span className="text-sm text-rb-500">≈ {formatUsdValue(creditedUsd)}</span>
          </Prov>
          <div className="mt-1 text-xs text-rb-500">debt cleared + left over</div>
        </StatCard>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:auto-rows-fr sm:grid-cols-3">
        <StatCard label="Collateral seized">
          <Prov info={absorbSeizedUsdProv(coords, legs)} value={formatUsdValue(seizedUsd)}>
            {usd(seizedUsd)}
          </Prov>
          <div className="mt-1 text-xs text-rb-500">
            {legs.map((l, i) => (
              <span key={l.symbol + i}>
                {i > 0 ? ", " : ""}
                <Prov info={absorbCollateralProv(l.symbol, coords)} value={l.amount} symbol={l.symbol}>
                  <span className="tabular-nums">
                    {compoundAmount(Number(l.amount))} {l.symbol}
                  </span>
                </Prov>
              </span>
            ))}
          </div>
        </StatCard>
        <StatCard label="Credited for it">
          <Prov
            info={absorbCreditedUsdProv(sym, coords, { paidOut: formatExactDecimal(split.paidOut) })}
            value={formatUsdValue(creditedUsd)}
            echo
          >
            {usd(creditedUsd)}
          </Prov>
          {creditCheck != null && (
            <div className="mt-1 text-xs text-rb-500">
              {oneFactor != null ? (
                <>credited at {pct(oneFactor)} of value (liquidation factor): </>
              ) : (
                <>each asset credited at its share of value (liquidation factor): </>
              )}
              {joinTerms("liquidation")}
            </div>
          )}
        </StatCard>
        <StatCard label={keptUsd >= 0 ? "Kept by the protocol" : "Covered by the protocol's reserves"}>
          <Prov
            info={absorbKeptProv(coords, {
              seizedUsd: formatUsdValue(seizedUsd),
              creditedUsd: formatUsdValue(creditedUsd),
            })}
            value={formatUsdValue(Math.abs(keptUsd))}
          >
            {usd(Math.abs(keptUsd))}
          </Prov>
          <div className="mt-1 text-xs text-rb-500">
            {keptUsd >= 0
              ? oneFactor != null
                ? `the protocol keeps 100% − ${pct(oneFactor)} = ${pct(1 - oneFactor)} of the seized value; what the absorb cost the account`
                : `${seizedUsd > 0 ? `${((keptUsd / seizedUsd) * 100).toFixed(2)}% of the seized value; ` : ""}what the absorb cost the account`
              : "the debt was worth more than the credited collateral, and the reserves took the difference"}
          </div>
        </StatCard>
      </div>
      {line != null && factors && (
        <p className="text-xs leading-relaxed text-rb-500" data-absorb-line="">
          The line it crossed: collateral{" "}
          <Prov
            info={absorbLineProv(coords, {
              terms: priced.map((l) => `${l.symbol} ${l.usdValue} × ${factorOf(l.address)!.liquidate}`).join(" + "),
              readBlock: factors.readBlock,
            })}
            value={formatUsdValue(line)}
          >
            <strong className="font-semibold text-foreground tabular-nums">{formatUsdValue(line)}</strong>
          </Prov>{" "}
          ({joinTerms("liquidate")}) against debt of{" "}
          <Prov
            info={absorbDebtUsdAtLineProv(sym, coords, { debt: formatExactDecimal(split.cleared) })}
            value={formatUsdValue(debtUsd)}
          >
            <strong className="font-semibold text-foreground tabular-nums">{formatUsdValue(debtUsd)}</strong>
          </Prov>{" "}
          ({compoundAmount(Number(split.cleared))} {sym} at {absorbPrice(basePrice)}),{" "}
          {debtUsd > line ? `${formatUsdValue(debtUsd - line)} over it` : `${formatUsdValue(line - debtUsd)} under it`}.
          Values are at the absorb&rsquo;s prices. The factors were read at block{" "}
          {factors.readBlock.toLocaleString("en-US")}, the block before, so they are the ones in force when the absorb
          ran.
        </p>
      )}
      {moves.length > 0 && previous && (
        <p className="text-xs leading-relaxed text-rb-500" data-absorb-why="">
          What moved it over: from the previous event ({formatDate(previous.timestamp)}) to the absorb,{" "}
          {moves.join("; ")}
          {interestSince != null && interestSince > 0 ? (
            <>
              , and the debt grew by {compoundAmount(interestSince)} {sym} of interest
            </>
          ) : null}
          .
        </p>
      )}
      {avgRate != null && interestSince != null && days != null && (
        <p className="text-xs leading-relaxed text-rb-500" data-absorb-rate="">
          Interest since the previous event: {compoundAmount(interestSince)} {sym} on{" "}
          {compoundAmount(Math.abs(prevAfter!))} {sym} over {days.toFixed(1)} days, an average of about{" "}
          {(avgRate * 100).toFixed(1)}% a year.
          {rates && rates.prev != null && rates.read != null ? (
            <>
              {" "}
              The borrow rate moves with how much of the market is lent out: it was {ratePct(rates.prev)} a year at the
              previous event and {ratePct(rates.read)} at the absorb
              {avgRate > Math.max(rates.prev, rates.read) * 1.5 ? ", so it ran well above both in between" : ""}.
            </>
          ) : null}
        </p>
      )}
      <AtBlockPriceFootnote pills={pills} format={absorbPrice} />
    </div>
  );
}
