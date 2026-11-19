// A unit model's Held/Owed receipts, past days and the live stop, stay in its
// token (ui-jobs 743):
// its daily prices are in the token's grains, so its rows carry no dollar
// price and no receipt of a held figure or an asset's part prints "$".
import assert from "node:assert/strict";
import { stateAt, unitOf, type FlowModel } from "@/lib/shared/flows-timeline";
import { flowAssetProv, flowSegmentProv } from "@/lib/shared/flows-timeline-provenance";

/** Walks every stop, the live one too; returns the receipts read. */
export function assertUnitReceipts(m: FlowModel, name: string): number {
  assert.ok(m.unit || m.sideUnits, `${name}: a unit model`);
  let read = 0;
  for (let stop = 0; stop <= m.liveStop; stop++) {
    const live = stop === m.liveStop;
    const when = live ? "now" : "the end of the day";
    for (const h of m.heldAt[stop] ?? []) assert.equal(h.priced?.price, undefined, `${name} ${h.symbol} ${stop}`);
    const st = stateAt(m, stop);
    for (const side of ["collateral", "debt"] as const) {
      // The segment as the panel builds it, and one carrying the stop's rows
      // as a dollar model's would: the dollar branch is then reachable, and
      // only the rows' missing price keeps it from printing "$".
      const forced = { ...st[side].bar[0] };
      const rows = (m.heldAt[stop] ?? []).filter((h) => h.side === side);
      Object.defineProperty(forced, "heldRows", { value: rows, enumerable: false });
      for (const [held, unit] of [
        [st[side].bar[0], unitOf(m, side)],
        [st[side].bar[0], undefined],
        [forced, undefined],
      ] as const) {
        const provs = [
          flowSegmentProv(held, side, when, live, m.daily, unit),
          ...(m.heldAt[stop] ?? [])
            .filter((h) => h.side === side)
            .map((h) => flowAssetProv(h.symbol, held, side, when, live, m.daily, unit)),
        ];
        for (const p of provs) {
          const text = JSON.stringify(p);
          assert.ok(!text.includes("$"), `${name} ${side} at stop ${stop}: ${text.slice(0, 200)}`);
          read++;
        }
      }
    }
  }
  return read;
}
