// A Liquity V2 fork's minimum collateral ratio steps as protocol changes on
// the Lifetime flows events row (rails-ops reference/lifetime-price-chart.md,
// ruling 10): each step its catalog lists ends at the branch manager's log
// that set the next value (Ebisu's two, 4 Jan 2026).

import { flowChange, pctWords, type FlowChange } from "@/lib/shared/flows-changes";
import type { LiquityForkLevel } from "@/lib/shared/liquity-flows";

const ratio = (m: number) => pctWords(Math.round(m * 1e4) / 100, 0);

export function forkMcrChanges(fork: LiquityForkLevel): FlowChange[] {
  const steps = [...(fork.mcrBefore ?? [])].sort((a, b) => a.untilBlock - b.untilBlock);
  return steps.map((s, i) => {
    const to = steps[i + 1]?.mcr ?? fork.mcr;
    return flowChange({
      ts: s.untilTimestamp,
      block: s.untilBlock,
      ...(s.setBy ? { txHash: s.setBy.txHash } : {}),
      name: "Minimum ratio",
      from: ratio(s.mcr),
      to: ratio(to),
      prov: {
        kind: "chain",
        pclass: "emitted",
        summary: `The branch's minimum collateral ratio (MCR), set to ${ratio(to)} from ${ratio(s.mcr)} by ${fork.name}'s branch manager at block ${s.untilBlock.toLocaleString("en-US")}${s.setBy ? `, log ${s.setBy.logIndex}` : ""}: parameter 0 of its parameter log, ${to} × 10¹⁸. The earlier value is MCR() read at the block before. A Trove of the branch is liquidated below it.`,
        contract: {
          name: `${fork.name} branch manager`,
          ...(fork.branchManager ? { address: fork.branchManager } : {}),
        },
        via: "eth_getLogs over the branch managers, read once into the branch catalog",
        source: { block: s.untilBlock, ...(s.setBy ? { txHash: s.setBy.txHash } : {}) },
      },
    });
  });
}
