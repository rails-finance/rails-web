// MakerDAO's source for the Lifetime flows chart's health view (rails-ops
// reference/lifetime-price-chart.md, ruling 15; ui-jobs 328 step 5; the view
// is lib/shared/flows-health.ts), in the card's terms: the collateral ratio
// against the ilk's minimum ratio.
//
// RULES.
// - A day's collateral ratio is ink × price ÷ debt: the flows replay's
//   balances at the day's close (the debt grown by the stability fee), the
//   OSM price of the day's close (the daily store's spot × mat, `maker:<ILK>`).
//   The line is the Spotter's minimum ratio (mat) in force at the day's close:
//   the mat read at the vault's first event (/api/chain/makerdao/ilk-at),
//   then each Spotter file(ilk, "mat") since (/api/chain/makerdao/mat-changes).
//   Every day's mat is an observation, so no day is drawn dotted.
// - The view works it as a health factor whose factor is 1 ÷ mat (collateral
//   ratio ÷ mat), so the collateral's level is debt × mat ÷ ink, the card's
//   "Liquidates at".
// - On an open vault today's ratio, line and level are the card's: its
//   collateral value ÷ debt, its minimum ratio and its "Liquidates at".
// - A change to the ilk's price feed (a new pip, OSM source, cap or par;
//   lib/makerdao/feed-log.ts) reaches the ratio through the store's close,
//   the price the Vat held, so the line steps there with no read added; where
//   the life holds one the how-to-read says so.
//
// Pure.

import type { FactorRead, HealthSource } from "@/lib/shared/flows-health";
import type { MakerIlkAt, MakerMatChange } from "@/lib/makerdao/chain-history-types";

const DAY_S = 86_400;

/** The timeline's key for the vault's collateral (lib/makerdao/flows.ts). */
export const makerCollKey = (collSymbol: string) => `coll:${collSymbol}`;

/** One minimum ratio as the view's read. */
function matRead(collSymbol: string, day: number, block: number, mat: number): FactorRead {
  return { day, block, lt: { [makerCollKey(collSymbol).toLowerCase()]: 1 / mat }, line: mat };
}

/** The ilk's minimum ratio across the life: the read at the first event,
 *  then each change after it. Null without the first read's mat. */
export function makerMatReads(
  collSymbol: string,
  first: { ts: number; ilkAt: MakerIlkAt | null },
  changes: readonly MakerMatChange[],
): FactorRead[] | null {
  const mat = first.ilkAt?.mat;
  if (mat == null || !(mat > 0)) return null;
  const out = [matRead(collSymbol, Math.floor(first.ts / DAY_S), first.ilkAt!.block, mat)];
  for (const c of [...changes].sort((a, b) => a.block - b.block))
    if (c.block > first.ilkAt!.block && c.mat > 0)
      out.push(matRead(collSymbol, Math.floor(c.timestamp / DAY_S), c.block, c.mat));
  return out;
}

/** MakerDAO's source: the OSM through the Spotter, the minimum ratio. */
export const MAKER_HEALTH_SOURCE: HealthSource = {
  oracle: "the OSM",
  pool: "the Spotter",
  chain: 1,
  factors: ["minimum ratio", "minimum ratio"],
  readAt: "in force at each day's close (read at the first event, then each change filed since)",
  held: "the minimum ratio the Spotter held as of block {block}",
  live: "the card's collateral value ÷ debt, now",
  levels: {
    formula: "debt × minimum ratio ÷ collateral",
    summary:
      "Liquidation level — the collateral price at which the vault reaches its minimum ratio: the debt, grown by the stability fee, times the minimum ratio in force that day, divided by the collateral.",
    here: {
      live: 'Here at the card\'s debt, collateral and minimum ratio now, its "Liquidates at".',
      read: "Here at the debt and collateral of {day}, against the minimum ratio the Spotter held as of block {block}.",
    },
  },
  ratio: {
    label: "Collateral ratio",
    liquidates: "below",
    formula: "collateral × OSM price ÷ debt",
    line: {
      formula: "below the minimum ratio the vault can be liquidated",
      summary:
        "Liquidation line — the Spotter's minimum ratio for the collateral type: below it the Dog can start an auction of the vault's collateral.",
    },
    help: "on the same days: the collateral at the OSM price of each day's close, over the debt with its stability fee. The red line is the Spotter's minimum ratio in force that day; below it the vault can be liquidated. The list in the tip picks it or the collateral's price.",
  },
};

/** The source with the how-to-read naming the price feed's changes, where
 *  the life holds one. */
export function makerHealthSource(feedChanged: boolean): HealthSource {
  if (!feedChanged || !MAKER_HEALTH_SOURCE.ratio) return MAKER_HEALTH_SOURCE;
  const r = MAKER_HEALTH_SOURCE.ratio;
  return {
    ...MAKER_HEALTH_SOURCE,
    ratio: {
      ...r,
      help: r.help.replace(
        " The list in the tip",
        " A change to the ilk's price feed, a grey diamond on the events row, reaches the ratio through the OSM price at the next close. The list in the tip",
      ),
    },
  };
}
