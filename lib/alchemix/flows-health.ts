// The Alchemist's source for the Lifetime flows chart's health view (rails-ops
// reference/lifetime-price-chart.md, ruling 15; ui-jobs 328 steps 6 and 8; the view
// is lib/shared/flows-health.ts), in the card's terms: the LTV against the
// line's liquidation threshold, in the asset under the vault.
//
// RULES.
// - A day's LTV is debt ÷ (shares × share price): the getCDP reading in force
//   at the day's close (lib/alchemix/flows.ts), the share price of the latest
//   reading on or before the day, each unit of the synthetic owed counted as
//   one unit of the underlying. A day with no reading keeps the last one's
//   share price and is drawn dotted. Liquidation is above the line, so a
//   rising LTV is the riskier one.
// - The line is the liquidation threshold, 1 ÷ the Alchemist's
//   collateralizationLowerBound at the end of the block of each picked event
//   (/api/chain/alchemix/bound-at-block; the last event of each of the latest
//   60 days with events), held to the next pick; the days before the first
//   pick take its threshold, dotted. A pick whose threshold differs from the
//   one before is a protocol-change marker on its day, seen at that read (no
//   setter log is read).
// - The share price's level is debt × lower bound ÷ shares, the share price at
//   which the LTV meets the threshold.
// - On an open position today's LTV, line and level are the card's: its LTV,
//   liquidation threshold, and the share price its "Drop to liquidation"
//   names.
//
// Pure.

import type { FactorRead, HealthLine, HealthSource } from "@/lib/shared/flows-health";
import type { FlowChange } from "@/lib/shared/flows-changes";
import type { PricePoint, PriceSeries } from "@/lib/shared/price-series";
import { ALCHEMIX_DEBT_KEY, ALCHEMIX_MYT_KEY } from "@/lib/alchemix/flows";
import { ltvPrint } from "@/lib/alchemix/ltv";

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

/** One pick's lower bound as the view's read: the shares weighted by one
 *  over it, and the line at the liquidation threshold it states. The debt
 *  backs nothing. */
export function alchemixBoundRead(a: AlchemixBoundAt, timestamp: number): FactorRead {
  return {
    day: Math.floor(timestamp / DAY_S),
    block: a.block,
    lt: { [ALCHEMIX_MYT_KEY]: 1 / a.lowerBound, [ALCHEMIX_DEBT_KEY]: 0 },
    line: 1 / a.lowerBound,
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

/** Each step of the drawn line (`level.points`, [day, threshold, block]) as a
 *  marker on the day the new threshold was first seen: at a pick's read, or
 *  at the card's read today (`todayBlock`). */
export function alchemixBoundChanges(
  points: readonly PricePoint[],
  todayBlock: number | null,
  alchemist: string | null,
): FlowChange[] {
  const out: FlowChange[] = [];
  for (let i = 1; i < points.length; i++) {
    const [day, threshold, b = null] = points[i];
    const before = points[i - 1][1];
    const block = b ?? todayBlock;
    if (block == null || ltvPrint(before) === ltvPrint(threshold)) continue;
    const from = ltvPrint(before);
    const to = ltvPrint(threshold);
    const at = block.toLocaleString("en-US");
    out.push({
      day,
      ts: day * DAY_S,
      block,
      name: "Liquidation threshold",
      from,
      to,
      prov: {
        kind: "chain",
        pclass: "state",
        summary: `Liquidation threshold, ${to} — 1 ÷ the Alchemist's collateralizationLowerBound, seen at the read at block ${at}${b == null ? " (the card's)" : ", the block of the day's last event"}; at the read before it, ${from}. The change took effect between the two reads: no setter log is read. At or above the threshold anyone may liquidate a position of the market.`,
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

/** The Alchemist's source: the vault's share price, the lower bound at each
 *  picked block. */
export function alchemixHealthSource(chain: number, underlyingSymbol: string, mytSymbol: string): HealthSource {
  const u = underlyingSymbol;
  return {
    oracle: "the vault's share",
    pool: "the Alchemist",
    chain,
    factors: ["liquidation threshold", "liquidation threshold"],
    readAt: "read at the block of each day's last event",
    priceAt: ["at each reading, held between readings", "at the latest reading on or before the day"],
    held: "the liquidation threshold, 1 ÷ the Alchemist's collateralizationLowerBound, after the event at block {block}",
    live: "the card's LTV now: the debt over the collateral counted in the asset underneath, read from the Alchemist at the reading's block",
    factor: "1 ÷ lower bound",
    levels: {
      of: alchemixLevels,
      formula: "debt × lower bound ÷ shares",
      summary: `Liquidation level — the share price, in ${u}, at which the position's LTV reaches the liquidation threshold: the debt times the Alchemist's lower bound, divided by the ${mytSymbol} held. The lower bound is the one in force at the day's last event.`,
      here: {
        live: "Here at the card's reading now: its share price, less the fall its “Drop to liquidation” names.",
        read: "Here at the shares and the debt of the reading in force at the end of {day}, against the lower bound read at block {block}.",
      },
    },
    ratio: {
      label: "LTV",
      liquidates: "above",
      formula: `debt ÷ (${mytSymbol} × share price), each unit of debt counted as one ${u}`,
      line: {
        formula: "at or above the liquidation threshold anyone may liquidate the position",
        summary:
          "Liquidation threshold — 1 ÷ the Alchemist's collateralizationLowerBound in force at the day's last event, read at that block and held to the next. At or above it anyone may liquidate the position.",
      },
      help: `on the same days: the debt over the ${mytSymbol} held at the vault's share price, in ${u}, each unit of debt counted as one ${u}, the card's LTV. The share price is read with each reading, so a day with no reading keeps the last one's and is drawn dotted. The red line is the liquidation threshold in force at each event, read at the block of each day's last event and held to the next; a day before the earliest read (a life of more than 60 days with events) takes its threshold and is drawn dotted. At or above the line anyone may liquidate the position. The list in the tip picks it or the share price.`,
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
  return { ...health, print: ltvPrint, ...(heldDays.length ? { heldDays } : {}) };
}
