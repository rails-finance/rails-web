"use client";

// T2's price row (rails-ops reference/shared-event-card-spec.md §3; ui-jobs
// 309 step 3): the gas the owner paid, the event's outcome (claimable, P/L)
// and a then/today chip per symbol the cells value. The shell draws it from
// the card's `price` slot; a family supplies figures and words.

import { Fuel } from "lucide-react";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { ThenTodayChip } from "@/components/shared/price-basis";
import { PriceChipShell } from "@/components/shared/state-transition";
import { TokenChipIcon } from "@/components/shared/token-chip-icon";
import { usePreferences } from "@/lib/shared/preferences-context";
import { GAS_UNITS, type GasUnit } from "@/lib/shared/preferences";
import type { GasCost } from "@/lib/shared/types/event-shape";

/** The gas the owner paid for the event's transaction (or a run of them). */
export interface EventGas {
  eth: number;
  /** 0 where no USD figure was read: the figure reads in ETH alone. */
  usd: number;
  /** The run's transaction count, where the gas covers a no-change run. */
  run?: number | null;
  /** The figure's receipt; drawn as a <Prov> where given. */
  info?: Provenance;
}

/** A symbol's price at the event, as a then/today chip. */
export interface EventPriceChip {
  symbol: string;
  usd: number;
  /** The figure's receipt and its exact value. */
  info?: Provenance;
  value?: string;
  /** The chip's tip. */
  title?: string;
  /** The figure as the family prints it, where its precision is not whole
   *  dollars (a stablecoin's four places). */
  display?: string;
  /** The token's contract, for the icon. */
  address?: string;
}

/** A chain-derived outcome of the event, in the family's words. */
export interface EventOutcome {
  claimable?: { amount: number; symbol: string; word: string };
  /** Profit or loss in USD, in gain or loss colour. */
  pl?: { usd: number; word: string };
  /** A line under the row (the redeemed collateral at the latest price). */
  today?: string | null;
}

export interface EventCardPrice {
  gas?: EventGas | null;
  prices: EventPriceChip[];
  outcome?: EventOutcome | null;
}

/** An index's or a receipt's gas, as the row states it; none where nothing
 *  was paid. */
export function eventGas(gas: GasCost | null | undefined): EventGas | undefined {
  return gas && gas.gasCostEth > 0 ? { eth: gas.gasCostEth, usd: gas.gasCostUsd } : undefined;
}

/** The slot for a card whose row states gas alone; none without gas. */
export function gasPrice(gas: GasCost | null | undefined): EventCardPrice | undefined {
  const g = eventGas(gas);
  return g ? { gas: g, prices: [] } : undefined;
}

/** The event's gas where the owner sent its transaction; none where a third
 *  party paid or the index sends no gas. */
export function ownerPaidGas(
  event: { wallet: string; gas?: GasCost | null },
  txFrom: string | null | undefined,
): EventGas | undefined {
  return txFrom != null && txFrom.toLowerCase() === event.wallet.toLowerCase() ? eventGas(event.gas) : undefined;
}

/** Whether the row has anything to draw. */
export function hasPriceRow(p: EventCardPrice | null | undefined): p is EventCardPrice {
  return !!p && (!!p.gas || p.prices.length > 0 || !!p.outcome?.claimable || !!p.outcome?.pl);
}

const usdWhole = (n: number): string =>
  n < 0.01 ? "< $0.01" : n < 1 ? `$${n.toFixed(2)}` : `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const GAS_UNIT_WORD: Record<GasUnit, string> = { usd: "USD", eth: "ETH" };

/** The gas the owner paid: a fuel-pump icon and one figure, in USD or ETH. A
 *  press switches the unit, kept in the preferences so every card follows
 *  (ui-jobs 289). A cost with no USD figure reads in ETH. */
export function EventGasButton({ gas }: { gas: EventGas }) {
  const { prefs, update } = usePreferences();
  const units = GAS_UNITS.filter((u) => u !== "usd" || gas.usd > 0);
  const unit: GasUnit = units.includes(prefs.gasUnit) ? prefs.gasUnit : units[0];
  const next = units[(units.indexOf(unit) + 1) % units.length];
  const figure = (u: GasUnit) =>
    u === "usd"
      ? gas.usd < 0.01
        ? "< $0.01"
        : `$${gas.usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `${gas.eth < 0.001 ? gas.eth.toFixed(6) : gas.eth.toFixed(4)} ETH`;
  const line = gas.run != null ? `Gas across ${gas.run} transactions ${figure(unit)}` : `Gas ${figure(unit)}`;
  const label = units.length > 1 ? `${line}, in ${GAS_UNIT_WORD[unit]}. Press for ${GAS_UNIT_WORD[next]}` : line;
  return (
    <button
      type="button"
      className="inline-flex min-h-6 cursor-pointer items-center gap-1 rounded-md text-xs tabular-nums text-rb-500 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-blue-500"
      aria-label={label}
      title={label}
      data-gas=""
      data-gas-unit={unit}
      onClick={(e) => {
        e.stopPropagation();
        update({ gasUnit: next });
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Fuel size={14} aria-hidden className="shrink-0" />
      <span>{gas.info ? <Prov info={gas.info}>{figure(unit)}</Prov> : figure(unit)}</span>
    </button>
  );
}

/** The row, and the outcome's line under it. */
export function EventPriceRow({ price }: { price: EventCardPrice }) {
  if (!hasPriceRow(price)) return null;
  const { gas, prices, outcome } = price;
  const claimable = outcome?.claimable;
  const pl = outcome?.pl;
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2" data-price-row="">
        {gas && <EventGasButton gas={gas} />}
        {(claimable || pl) && (
          <div className="inline-flex items-center gap-4 flex-wrap text-xs">
            {claimable && (
              <span className="inline-flex items-center gap-1.5">
                <span className="font-bold text-foreground">{claimable.amount.toFixed(4)}</span>
                <TokenChipIcon symbol={claimable.symbol} size={14} />
                <span className="font-semibold text-green-600 dark:text-green-400">{claimable.word}</span>
              </span>
            )}
            {pl && (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-rb-500">{pl.word}</span>
                <span className={`font-bold ${pl.usd >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {`${pl.usd >= 0 ? "+" : "−"}${usdWhole(Math.abs(pl.usd))}`}
                </span>
              </span>
            )}
          </div>
        )}
        {prices.map((p) => {
          const icon = <TokenChipIcon symbol={p.symbol} address={p.address} size={14} />;
          const figure = p.display ?? usdWhole(p.usd);
          return (
            <PriceChipShell key={p.symbol} bare title={p.title}>
              <ThenTodayChip
                symbol={p.symbol}
                format={usdWhole}
                then={
                  p.info ? (
                    <Prov info={p.info} value={p.value} icon={icon}>
                      {figure}
                    </Prov>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      {figure}
                      {icon}
                    </span>
                  )
                }
              />
            </PriceChipShell>
          );
        })}
      </div>
      {outcome?.today && (
        <div className="px-4 pb-2 text-xs text-rb-500" data-redemption-today="">
          {outcome.today}
        </div>
      )}
    </>
  );
}
