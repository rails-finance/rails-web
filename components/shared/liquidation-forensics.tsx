"use client";

// Liquidation forensics — the valued two-leg breakdown of a liquidation,
// rendered beneath the chain-state snapshot grid. Three boxed stats: what the
// seized collateral was worth, what the cleared debt was worth, and the
// premium realized between them (the liquidator's bonus on the Aave model;
// the protocol's absorption margin on Comet) — all at the protocol's own
// valuations AT THE EVENT'S BLOCK (a captured oracle read, or the figure the
// event itself emitted), never today's prices. Cross-protocol by design: the
// protocol adapters compute the figures and their provenance in their own
// vocabularies; this file owns the look.
//
// An adapter may also pass `premiumReference` — the protocol's own governing
// constant, read at the same block and rendered under the premium. The premium
// is always derived from the two legs, so the pair reads as a check rather than
// a restatement.
//
// Renders ONLY when both legs are priced. A block the price walk hasn't
// reached yet keeps the card token-only — partial fill is a safe state, and
// a half-valued breakdown would invite a cross-leg comparison the data can't
// support yet.

import type { Provenance } from "@/components/shared/provenance";
import { Prov } from "@/components/shared/provenance";
import { StatCard, StateTransition } from "@/components/shared/state-transition";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { formatUsdValue, formatPrice } from "@/lib/utils/format";

/** One leg of the liquidation, valued at the block's own figures. A leg is
 *  usually one asset (`symbol` names it); a multi-asset leg (Comet seizes
 *  every collateral in one absorption) carries the summed USD only. */
export interface LiquidationForensicsLeg {
  /** The leg's value at the event's block in the protocol's own denomination
   *  (USD everywhere it exists; the market's loan token on Morpho), computed
   *  by the adapter (the compute site owns the numbers). */
  usd: number;
  usdProv: Provenance;
  /** The leg's asset, when it is a single asset. */
  symbol?: string;
}

/** One at-block price the figures above derive from — the footnote pills. */
export interface AtBlockPricePill {
  symbol: string;
  /** The priced token's own address, where the adapter can name it. The chip
   *  asks the icon CDNs by (chain, address); with only a symbol it falls back
   *  to the hand-kept house table, and an asset that table has never heard of
   *  — which on a permissionless market is most of them — draws its initial
   *  letter instead of a mark. */
  address?: string;
  priceUsd: number;
  priceProv: Provenance;
  /** Source note after the price (default "oracle at block"). */
  note?: string;
}

export interface LiquidationForensicsProps {
  seized: LiquidationForensicsLeg;
  cleared: LiquidationForensicsLeg;
  /** seized ÷ cleared − 1, as a fraction (0.045 = +4.5%). */
  premium: number;
  premiumProv: Provenance;
  /** Who pockets the gap — default "Realized premium" (the Aave-model
   *  liquidator bonus); Comet labels it "Absorption margin". */
  premiumLabel?: string;
  /** The protocol's OWN constant that the premium above should reproduce, read
   *  at the same block and rendered beneath it. The premium is derived from the
   *  two legs and never from this figure, so showing both makes the card
   *  self-auditing: a well-sized seizure lands on the constant exactly, and one
   *  small enough for the settled legs to quantize visibly does not. Fluid
   *  passes the vault's `liquidationPenalty`; a protocol whose premium has no
   *  single governing constant (Maker's penalty settles at a later auction)
   *  passes nothing. */
  premiumReference?: { label: string; value: string; prov: Provenance };
  /** The at-block prices the legs derive from, one pill per asset. */
  pricePills: AtBlockPricePill[];
  /** Denomination formatters — default USD. A protocol whose own unit is not
   *  a dollar (Morpho values everything in the market's loan token) passes
   *  its own; `value` formats the leg totals, `price` the footnote pills. */
  format?: { value: (n: number) => string; price: (n: number) => string };
}

/** Coordinates the prov builders need — the structural subset every
 *  protocol's coords type satisfies. */
export interface ForensicsCoords {
  txHash?: string;
  blockNumber?: number;
}

/** The three provenance builders, in the consuming protocol's own vocabulary
 *  (lib/<proto>/event-provenance.ts) — the block is cross-protocol, the
 *  receipts never are. */
export interface ForensicsProvs {
  atBlockPriceProv: (sym: string, coords: ForensicsCoords, priceUsd: number) => Provenance;
  liqLegUsdProv: (
    leg: "seized collateral" | "cleared debt",
    sym: string,
    coords: ForensicsCoords,
    vals: { amount: string; priceUsd: number },
  ) => Provenance;
  liqPremiumProv: (coords: ForensicsCoords, vals: { seizedUsd: string; clearedUsd: string }) => Provenance;
}

/** The valued two-leg breakdown for a liquidation — computed HERE (the compute
 *  site owns the numbers stamped into the receipts). Undefined until the
 *  oracle-price walk has priced BOTH legs at this block; the card stays
 *  token-only meanwhile. */
export function buildLiquidationForensics(
  ctx: {
    liquidatedCollateralAmount?: string;
    debtToCover?: string;
    collateralSymbol?: string;
    reserveSymbol?: string;
    collateralPrice?: { usd: number };
    debtPrice?: { usd: number };
  },
  coords: ForensicsCoords,
  provs: ForensicsProvs,
): LiquidationForensicsProps | undefined {
  const seizedAmt = Number(ctx.liquidatedCollateralAmount);
  const clearedAmt = Number(ctx.debtToCover);
  const cp = ctx.collateralPrice;
  const dp = ctx.debtPrice;
  if (!cp || !dp || !Number.isFinite(seizedAmt) || !Number.isFinite(clearedAmt) || clearedAmt <= 0) return undefined;
  const collSym = ctx.collateralSymbol ?? "—";
  const debtSym = ctx.reserveSymbol ?? "—";
  const seizedUsd = seizedAmt * cp.usd;
  const clearedUsd = clearedAmt * dp.usd;
  return {
    seized: {
      symbol: collSym,
      usd: seizedUsd,
      usdProv: provs.liqLegUsdProv("seized collateral", collSym, coords, {
        amount: `${ctx.liquidatedCollateralAmount} ${collSym}`,
        priceUsd: cp.usd,
      }),
    },
    cleared: {
      symbol: debtSym,
      usd: clearedUsd,
      usdProv: provs.liqLegUsdProv("cleared debt", debtSym, coords, {
        amount: `${ctx.debtToCover} ${debtSym}`,
        priceUsd: dp.usd,
      }),
    },
    premium: seizedUsd / clearedUsd - 1,
    premiumProv: provs.liqPremiumProv(coords, {
      seizedUsd: formatUsdValue(seizedUsd),
      clearedUsd: formatUsdValue(clearedUsd),
    }),
    pricePills: [
      { symbol: collSym, priceUsd: cp.usd, priceProv: provs.atBlockPriceProv(collSym, coords, cp.usd) },
      { symbol: debtSym, priceUsd: dp.usd, priceProv: provs.atBlockPriceProv(debtSym, coords, dp.usd) },
    ],
  };
}

function LegStat({
  label,
  leg,
  formatValue,
}: {
  label: string;
  leg: LiquidationForensicsLeg;
  formatValue: (n: number) => string;
}) {
  return (
    <StatCard label={label}>
      <StateTransition>
        <Prov info={leg.usdProv} value={formatValue(leg.usd)} symbol={leg.symbol}>
          <span className="text-sm font-semibold tabular-nums">{formatValue(leg.usd)}</span>
        </Prov>
      </StateTransition>
    </StatCard>
  );
}

export function LiquidationForensics({
  seized,
  cleared,
  premium,
  premiumProv,
  premiumLabel,
  premiumReference,
  pricePills,
  format,
}: LiquidationForensicsProps) {
  const fmtValue = format?.value ?? formatUsdValue;
  const fmtPrice = format?.price ?? formatPrice;
  const sign = premium >= 0 ? "+" : "−";
  const premiumPct = `${sign}${(Math.abs(premium) * 100).toFixed(2)}%`;
  return (
    <div className="px-5 pb-2">
      <div className="grid grid-cols-1 gap-2.5 sm:auto-rows-fr sm:grid-cols-3">
        <LegStat label="Seized, at fire" leg={seized} formatValue={fmtValue} />
        <LegStat label="Cleared, at fire" leg={cleared} formatValue={fmtValue} />
        <StatCard label={premiumLabel ?? "Realized premium"}>
          <StateTransition>
            <Prov info={premiumProv} value={premiumPct}>
              <span className="text-sm font-semibold tabular-nums">{premiumPct}</span>
            </Prov>
          </StateTransition>
          {premiumReference && (
            <div className="mt-1 text-xs text-rb-500">
              <Prov info={premiumReference.prov} value={premiumReference.value}>
                <span className="tabular-nums">
                  {premiumReference.label} {premiumReference.value}
                </span>
              </Prov>
            </div>
          )}
        </StatCard>
      </div>
      <AtBlockPriceFootnote pills={pricePills} format={fmtPrice} />
    </div>
  );
}

/** The at-block price footnote row — one pill per asset, source-aware, each
 *  tracing to the oracle read captured at the event's block. Rendered under
 *  the forensics grid above, and standalone under an ordinary event's snapshot
 *  grid when the index carries the event-block price (the USD figures beside
 *  it derive from exactly these reads). Callers outside a forensics block wrap
 *  it in the detail's `px-5 pb-2` inset. */
export function AtBlockPriceFootnote({
  pills,
  format = formatPrice,
}: {
  pills: AtBlockPricePill[];
  format?: (n: number) => string;
}) {
  if (pills.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-rb-500">
      {pills.map((pill, i) => (
        <Prov key={i} info={pill.priceProv} value={format(pill.priceUsd)} symbol={pill.symbol}>
          <span className="inline-flex items-center gap-1 tabular-nums">
            <TokenChipIcon symbol={pill.symbol} address={pill.address} size={14} />
            {pill.symbol} {format(pill.priceUsd)}
            <span className="text-rb-400">· {pill.note ?? "oracle at block"}</span>
          </span>
        </Prov>
      ))}
    </div>
  );
}
