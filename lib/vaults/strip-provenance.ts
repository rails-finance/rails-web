// The receipts of the vault page's "last 30 days" strip (V5, rails-ops ui-jobs
// 413): each tile's change is two reads of one daily series, each with its
// day and block, the window lib/vaults/yield.ts reads for every series.

import type { Provenance } from "@/components/shared/provenance";
import type { VaultSummary } from "@/lib/vaults/summary";
import type { SeriesWindow, VaultYieldRead } from "@/lib/vaults/yield";
import { formatUnitsExact } from "@/lib/utils/format";
import { formatDate } from "@/lib/date";

const n = (v: number) => v.toLocaleString("en-US");
const dayText = (day: number) => formatDate(new Date(day * 86_400_000));

export type StripTile = "total-assets" | "share-price" | "holders";

const READ: Record<StripTile, { what: string; via: string }> = {
  "total-assets": { what: "the vault's `totalAssets()`", via: "totalAssets()" },
  "share-price": { what: "one share's `convertToAssets`", via: "convertToAssets(10 ** decimals)" },
  holders: { what: "the count of addresses holding a share", via: "the census's holder count" },
};

const LABEL: Record<StripTile, string> = {
  "total-assets": "Total assets",
  "share-price": "Share price",
  holders: "Holders",
};

/** A read as the tile's unit prints it: the asset for the first two, a count for holders. */
export const stripReadText = (tile: StripTile, v: VaultSummary, r: VaultYieldRead): string =>
  tile === "holders" ? n(Number(r.raw)) : `${formatUnitsExact(r.raw, v.asset.decimals)} ${v.asset.symbol}`;

type Measured = Extract<SeriesWindow, { from: VaultYieldRead }>;

/** The tile's change: `to / from − 1` over the window, or "from 0" where the
 *  window starts empty. */
export const stripChangeProv = (tile: StripTile, v: VaultSummary, key: string, w: Measured): Provenance => {
  const at = (r: VaultYieldRead) => `${stripReadText(tile, v, r)} at block ${n(r.block)} (${dayText(r.day)})`;
  return {
    kind: "derived",
    pclass: "state",
    source: { block: w.to.block },
    summary: `${LABEL[tile]} — over the ${w.days} days to block ${n(w.to.block)}, ${READ[tile].what} went from ${at(w.from)} to ${at(w.to)}, each stored once a day in Rails's daily store as \`${key}\`.${w.change == null ? " The window starts at zero, so no percentage is stated." : ""}`,
    contract: { name: v.name ?? v.catalogName ?? v.symbol ?? "vault", address: v.address },
    via: `daily store · ${READ[tile].via} once per UTC day @ the day's last block`,
    formula: w.change == null ? "from → to" : "to / from − 1",
    inputs: [
      {
        label: `from · block ${n(w.from.block)}`,
        value: stripReadText(tile, v, w.from),
        kind: "chain",
        pclass: "state",
      },
      { label: `to · block ${n(w.to.block)}`, value: stripReadText(tile, v, w.to), kind: "chain", pclass: "state" },
      { label: "days between", value: n(w.days), kind: "derived", note: "30, or more where a day is missing" },
    ],
  };
};

/** A young series: the day the store's series begins. */
export const stripYoungProv = (tile: StripTile, v: VaultSummary, key: string, firstDay: number): Provenance => ({
  kind: "derived",
  pclass: "state",
  summary: `${LABEL[tile]} — Rails's daily store holds \`${key}\` from ${dayText(firstDay)}, under the 30 days a change needs.`,
  contract: { name: v.name ?? v.catalogName ?? v.symbol ?? "vault", address: v.address },
  via: `daily store · ${READ[tile].via} once per UTC day`,
});
