// The Alchemist's source for the Lifetime flows chart's health view (rails-ops
// reference/lifetime-price-chart.md, ruling 15; ui-jobs 328 steps 6 and 8; the view
// is lib/shared/flows-health.ts), in the card's terms: the collateralisation
// against the Alchemist's lower bound, in the asset under the vault.
//
// RULES.
// - A day's collateralisation is shares × share price ÷ debt: the getCDP
//   reading in force at the day's close (lib/alchemix/flows.ts), the share
//   price of the latest reading on or before the day, each unit of the
//   synthetic owed counted as one unit of the underlying. A day with no reading
//   keeps the last one's share price and is drawn dotted.
// - The line is the Alchemist's collateralizationLowerBound at the end of
//   the block of each picked event (/api/chain/alchemix/bound-at-block; the
//   last event of each of the latest 60 days with events), held to the next
//   pick; the days before the first pick take its bound, dotted. A pick whose
//   bound differs from the one before is a protocol-change marker on its day,
//   seen at that read (no setter log is read).
// - The share price's level is debt × lower bound ÷ shares, the share price at
//   which the collateralisation meets the line.
// - On an open position today's collateralisation, line and level are the
//   card's: its Collateralisation, "Liquidates at", and the share price its
//   "Liquidates on a share-price drop of" names.
//
// Pure.

import type { FactorRead, HealthLine, HealthSource } from "@/lib/shared/flows-health";
import type { FlowChange } from "@/lib/shared/flows-changes";
import type { PricePoint, PriceSeries } from "@/lib/shared/price-series";
import { ALCHEMIX_DEBT_KEY, ALCHEMIX_MYT_KEY } from "@/lib/alchemix/flows";

const DAY_S = 86_400;

/** The share price at which `shares` against `debt` meets the lower bound. */
export function alchemixLiqSharePrice(shares: number, debt: number, bound: number): number {
  return (debt * bound) / shares;
}

/** /api/chain/alchemix/bound-at-block */
export interface AlchemixBoundAt {
  block: number;
  lowerBound: number;
}

export const isAlchemixBoundAt = (b: unknown): b is AlchemixBoundAt => {
  const a = b as AlchemixBoundAt | null;
  return a != null && typeof a.block === "number" && typeof a.lowerBound === "number" && a.lowerBound > 0;
};

/** One pick's lower bound as the view's read. The debt backs nothing. */
export function alchemixBoundRead(a: AlchemixBoundAt, timestamp: number): FactorRead {
  return {
    day: Math.floor(timestamp / DAY_S),
    block: a.block,
    lt: { [ALCHEMIX_MYT_KEY]: 1 / a.lowerBound, [ALCHEMIX_DEBT_KEY]: 0 },
    line: a.lowerBound,
  };
}

/** The line's Alchemist: the emitter of the page's first Alchemist row that
 *  names the position (a transfer is the position NFT's log). */
export function alchemistOf(events: readonly { context?: { data?: unknown } }[]): string | null {
  for (const e of events) {
    const d = e.context?.data as
      | { emitter?: string; scope?: string; eventType?: string; positionKind?: string }
      | undefined;
    if (d?.emitter && d.positionKind === "alchemist" && d.scope === "position" && d.eventType !== "transfer")
      return d.emitter.toLowerCase();
  }
  return null;
}

/** Each step of the drawn line (`level.points`, [day, bound, block]) as a
 *  marker on the day the new bound was first seen: at a pick's read, or at
 *  the card's read today (`todayBlock`). */
export function alchemixBoundChanges(
  points: readonly PricePoint[],
  todayBlock: number | null,
  alchemist: string | null,
): FlowChange[] {
  const out: FlowChange[] = [];
  for (let i = 1; i < points.length; i++) {
    const [day, bound, b = null] = points[i];
    const before = points[i - 1][1];
    const block = b ?? todayBlock;
    if (block == null || alchemixRatioPrint(before) === alchemixRatioPrint(bound)) continue;
    const from = alchemixRatioPrint(before);
    const to = alchemixRatioPrint(bound);
    const at = block.toLocaleString("en-US");
    out.push({
      day,
      ts: day * DAY_S,
      block,
      name: "Lower bound",
      from,
      to,
      prov: {
        kind: "chain",
        pclass: "state",
        summary: `The Alchemist's collateralizationLowerBound, ${to}, seen at the read at block ${at}${b == null ? " (the card's)" : ", the block of the day's last event"}; at the read before it, ${from}. The change took effect between the two reads: no setter log is read. At or below the bound anyone may liquidate a position of the line.`,
        contract: { name: "Alchemist V3", address: alchemist ?? undefined },
        via: `collateralizationLowerBound() at block ${at} · /api/chain/alchemix/bound-at-block`,
        source: { block },
      },
    });
  }
  return out;
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

/** The Alchemist's source: the vault's share price, the lower bound at each
 *  picked block. */
export function alchemixHealthSource(chain: number, underlyingSymbol: string, mytSymbol: string): HealthSource {
  const u = underlyingSymbol;
  return {
    oracle: "the vault's share",
    pool: "the Alchemist",
    chain,
    factors: ["lower bound", "collateralisation lower bound"],
    readAt: "read at the block of each day's last event",
    priceAt: ["at each reading, held between readings", "at the latest reading on or before the day"],
    held: "the Alchemist's collateralizationLowerBound after the event at block {block}",
    live: "the card's Collateralisation now: the collateral counted in the asset underneath over the debt, read from the Alchemist at the reading's block",
    factor: "1 ÷ lower bound",
    levels: {
      of: alchemixLevels,
      formula: "debt × lower bound ÷ shares",
      summary: `Liquidation level — the share price, in ${u}, at which the position's collateralisation reaches the Alchemist's lower bound: the debt times the lower bound, divided by the ${mytSymbol} held. The lower bound is the one in force at the day's last event.`,
      here: {
        live: "Here at the card's reading now: its share price, less the share-price drop its “Liquidates on a share-price drop of” names.",
        read: "Here at the shares and the debt of the reading in force at the end of {day}, against the lower bound read at block {block}.",
      },
    },
    ratio: {
      label: "Collateralisation",
      liquidates: "below",
      formula: `${mytSymbol} × share price ÷ debt, each unit of debt counted as one ${u}`,
      line: {
        formula: "at or below the lower bound anyone may liquidate the position",
        summary:
          "Liquidation line — the Alchemist's collateralizationLowerBound in force at the day's last event, read at that block and held to the next. At or below it anyone may liquidate the position.",
      },
      help: `on the same days: the ${mytSymbol} held at the vault's share price, in ${u}, over the debt, each unit of it counted as one ${u}, the card's Collateralisation. The share price is read with each reading, so a day with no reading keeps the last one's and is drawn dotted. The red line is the Alchemist's lower bound in force at each event, read at the block of each day's last event and held to the next; a day before the earliest read (a life of more than 60 days with events) takes its bound and is drawn dotted. At or below the line anyone may liquidate the position. The list in the tip picks it or the share price.`,
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
