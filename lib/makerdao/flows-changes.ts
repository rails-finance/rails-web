// MakerDAO's protocol changes on the Lifetime flows events row (rails-ops
// reference/lifetime-price-chart.md, ruling 10): the ilk's stability fee sets
// from its rate log (the drip each new fee was first evidenced by, confirmed
// against the Jug at that block) and the Spotter's minimum ratio from the
// file(ilk, "mat") logs the health view reads.

import type { FlowChange } from "@/lib/shared/flows-changes";
import { flowChange, pctWords } from "@/lib/shared/flows-changes";
import type { MakerRateLogResponse } from "@/lib/api/fetch-makerdao-rate-log";
import type { MakerMatChange } from "@/lib/makerdao/chain-history-types";
import { MAKER_ADDRESSES } from "@/lib/makerdao/asset-catalog";

/** "145 %", "145.83 %": the mat to two places, a whole percent without them. */
const ratio = (mat: number) => {
  const p = Math.round(mat * 1e4) / 100;
  return pctWords(p, Number.isInteger(p) ? 0 : 2);
};

/** The ilk's fee sets and minimum-ratio changes. `matFirst` is the mat read
 *  at the vault's first event, the value before the first change. */
export function makerFlowChanges(
  ilk: string,
  rateLog: MakerRateLogResponse | null,
  mat: { first: number | null; changes: readonly MakerMatChange[] } | null,
): FlowChange[] {
  const out: FlowChange[] = [];
  const sets = rateLog ? [...rateLog.sets].sort((a, b) => a.ordinal - b.ordinal) : [];
  sets.forEach((s, i) => {
    const prev = sets[i - 1];
    out.push(
      flowChange({
        ts: s.timestamp,
        block: s.block,
        txHash: s.txHash.toLowerCase(),
        name: "Stability fee",
        from: prev ? pctWords(prev.aprPct) : null,
        to: pctWords(s.aprPct),
        noted: "makerdao:stability-fee",
        prov: {
          kind: "chain-derived",
          pclass: "state",
          summary: `The ${ilk} stability fee, ${pctWords(s.aprPct)} a year, first in force at the drip at block ${s.block.toLocaleString("en-US")}: Jug.ilks("${ilk}").duty + Jug.base(), read at that block and compounded over a year.${prev ? ` The fee before it, ${pctWords(prev.aprPct)}, is the set at block ${prev.block.toLocaleString("en-US")}.` : ""} Governance files the duty in a spell, which needs a drip in the same block, so this drip is the earliest moment the new fee shows on the chain. The change applies to every vault of the ilk.`,
          contract: { name: "MakerDAO Jug", address: rateLog?.jug || MAKER_ADDRESSES.JUG },
          via: `rails-server rate log · /api/makerdao/ilks/${ilk}/rate-log`,
          source: { block: s.block, txHash: s.txHash.toLowerCase() },
          formula: "((duty + base) ÷ 10²⁷)^(seconds in a year) − 1",
        },
      }),
    );
  });
  let before = mat?.first ?? null;
  for (const c of [...(mat?.changes ?? [])].sort((a, b) => a.block - b.block)) {
    // A file that leaves the printed ratio where it was draws no marker.
    if (!(c.mat > 0) || (before != null && ratio(before) === ratio(c.mat))) {
      if (c.mat > 0) before = c.mat;
      continue;
    }
    out.push(
      flowChange({
        ts: c.timestamp,
        block: c.block,
        txHash: c.txHash.toLowerCase(),
        name: "Minimum ratio",
        from: before != null ? ratio(before) : null,
        to: ratio(c.mat),
        prov: {
          kind: "chain",
          pclass: "emitted",
          summary: `The ${ilk} minimum collateral ratio (mat), set to ${ratio(c.mat)} by the Spotter's file("${ilk}", "mat") log at block ${c.block.toLocaleString("en-US")}.${before != null ? ` Before it, ${ratio(before)}.` : ""} A vault of the ilk is liquidated below it.`,
          contract: { name: "MakerDAO Spotter", address: MAKER_ADDRESSES.SPOTTER },
          via: "the Spotter's file(ilk, what, data) logs, kept by rails-server · /api/at-block/makerdao/mat-changes",
          source: { block: c.block, txHash: c.txHash.toLowerCase() },
        },
      }),
    );
    before = c.mat;
  }
  return out;
}
