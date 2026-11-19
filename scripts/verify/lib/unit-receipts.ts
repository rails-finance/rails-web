// A unit model's past-day Held/Owed receipts stay in its token (ui-jobs 743):
// its daily prices are in the token's grains, so its rows carry no dollar
// price and no receipt of a held figure or an asset's part prints "$".
import assert from "node:assert/strict";
import { stateAt, unitOf, type FlowModel } from "@/lib/shared/flows-timeline";
import { flowAssetProv, flowSegmentProv } from "@/lib/shared/flows-timeline-provenance";

/** Walks every stop before the live one; returns the receipts read. */
export function assertUnitReceipts(m: FlowModel, name: string): number {
  assert.ok(m.unit || m.sideUnits, `${name}: a unit model`);
  let read = 0;
  for (let stop = 0; stop < m.liveStop; stop++) {
    for (const h of m.heldAt[stop] ?? []) assert.equal(h.priced?.price, undefined, `${name} ${h.symbol} ${stop}`);
    const st = stateAt(m, stop);
    for (const side of ["collateral", "debt"] as const) {
      const held = st[side].bar[0];
      // With the side's token and without it: the rows are not there to read.
      for (const unit of [unitOf(m, side), undefined]) {
        const provs = [
          flowSegmentProv(held, side, "the end of the day", false, m.daily, unit),
          ...(m.heldAt[stop] ?? [])
            .filter((h) => h.side === side)
            .map((h) => flowAssetProv(h.symbol, held, side, "the end of the day", false, m.daily, unit)),
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
