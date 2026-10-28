// The Alchemist's source for the Lifetime flows chart's health view (rails-ops
// reference/lifetime-price-chart.md, ruling 15; ui-jobs 328 step 6; the view
// is lib/shared/flows-health.ts), in the card's terms: the collateralisation
// against the Alchemist's lower bound, in the asset under the vault.
//
// RULES.
// - A day's collateralisation is shares × share price ÷ debt: the getCDP
//   reading in force at the day's close (lib/alchemix/flows.ts), the share
//   price of the latest reading on or before the day, each unit of the
//   synthetic owed counted as one unit of the underlying. A day with no reading
//   keeps the last one's share price and is drawn dotted.
// - The line is the Alchemist's collateralizationLowerBound read now, held
//   across the life: it is not indexed at past blocks, and the receipt and the
//   how-to-read say so.
// - The share price's level is debt × lower bound ÷ shares, the share price at
//   which the collateralisation meets the line.
// - On an open position today's collateralisation, line and level are the
//   card's: its Collateralisation, "Liquidates at", and the share price its
//   "Liquidates on a share-price drop of" names.
//
// Pure.

import type { FactorRead, HealthLine, HealthSource } from "@/lib/shared/flows-health";
import type { PriceSeries } from "@/lib/shared/price-series";
import { ALCHEMIX_DEBT_KEY, ALCHEMIX_MYT_KEY } from "@/lib/alchemix/flows";

const DAY_S = 86_400;

/** The share price at which `shares` against `debt` meets the lower bound. */
export function alchemixLiqSharePrice(shares: number, debt: number, bound: number): number {
  return (debt * bound) / shares;
}

/** Today's lower bound as the view's reads: one per day with events, at that
 *  day's last event, every one the same. The debt backs nothing. */
export function alchemixBoundReads(
  events: readonly { ts: number; block: number }[],
  bound: number,
): FactorRead[] | null {
  if (!(bound > 0) || events.length === 0) return null;
  const byDay = new Map<number, number>();
  for (const e of events) {
    const d = Math.floor(e.ts / DAY_S);
    byDay.set(d, Math.max(byDay.get(d) ?? 0, e.block));
  }
  return [...byDay]
    .sort((a, b) => a[0] - b[0])
    .map(([day, block]) => ({
      day,
      block,
      lt: { [ALCHEMIX_MYT_KEY]: 1 / bound, [ALCHEMIX_DEBT_KEY]: 0 },
      line: bound,
    }));
}

/** The shares' level from a day's lines: the debt over the shares, at the
 *  lower bound. */
function alchemixLevels(lines: readonly HealthLine[]): Map<string, number> {
  const out = new Map<string, number>();
  const coll = lines.find((l) => l.asset === ALCHEMIX_MYT_KEY && l.coll > 0);
  const debt = lines.reduce((s, l) => s + l.debt * l.price, 0);
  if (coll && coll.lt > 0 && debt > 0) out.set(ALCHEMIX_MYT_KEY, alchemixLiqSharePrice(coll.coll, debt, 1 / coll.lt));
  return out;
}

/** A collateralisation as the card prints it (`ratioPct`): one place under
 *  1,000 %, whole above, ">10k%" from 10,000 %. */
export function alchemixRatioPrint(v: number): string {
  const pct = v * 100;
  if (pct >= 10000) return ">10k%";
  return pct < 1000
    ? `${pct.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
    : `${Math.round(pct).toLocaleString("en-US")}%`;
}

/** The Alchemist's source: the vault's share price, the lower bound now. */
export function alchemixHealthSource(chain: number, underlyingSymbol: string, mytSymbol: string): HealthSource {
  const u = underlyingSymbol;
  return {
    oracle: "the vault's share",
    pool: "the Alchemist",
    chain,
    factors: ["lower bound", "collateralisation lower bound"],
    readAt: "read now and held across the life (it is not indexed at past blocks)",
    priceAt: ["at each reading, held between readings", "at the latest reading on or before the day"],
    held: "the Alchemist's collateralizationLowerBound read now, held across the life: it is not indexed at past blocks",
    live: "the card's Collateralisation now: the collateral counted in the asset underneath over the debt, read from the Alchemist at the reading's block",
    factor: "1 ÷ lower bound",
    levels: {
      of: alchemixLevels,
      formula: "debt × lower bound ÷ shares",
      summary: `Liquidation level — the share price, in ${u}, at which the position's collateralisation reaches the Alchemist's lower bound: the debt times the lower bound, divided by the ${mytSymbol} held. The lower bound is today's, held across the life.`,
      here: {
        live: "Here at the card's reading now: its share price, less the share-price drop its “Liquidates on a share-price drop of” names.",
        read: "Here at the shares and the debt of the reading in force at the end of {day}, against today's lower bound.",
      },
    },
    ratio: {
      label: "Collateralisation",
      liquidates: "below",
      formula: `${mytSymbol} × share price ÷ debt, each unit of debt counted as one ${u}`,
      line: {
        formula: "at or below the lower bound anyone may liquidate the position",
        summary:
          "Liquidation line — the Alchemist's collateralizationLowerBound, read now and held across the life: it is not indexed at past blocks. At or below it anyone may liquidate the position.",
      },
      help: `on the same days: the ${mytSymbol} held at the vault's share price, in ${u}, over the debt, each unit of it counted as one ${u}, the card's Collateralisation. The share price is read with each reading, so a day with no reading keeps the last one's and is drawn dotted. The red line is the Alchemist's lower bound today, held across the life because it is not indexed at past blocks; at or below it anyone may liquidate the position. The list in the tip picks it or the share price.`,
    },
  };
}

/** The view as the card prints it, its days with no reading
 *  dotted: `readDays` holds the UTC days with a share price read. */
export function alchemixHealthFinish(
  health: PriceSeries,
  readDays: ReadonlySet<number>,
  today: number | null,
): PriceSeries {
  const heldDays = health.points.map((p) => p[0]).filter((d) => !readDays.has(d) && d !== today);
  return { ...health, print: alchemixRatioPrint, ...(heldDays.length ? { heldDays } : {}) };
}
