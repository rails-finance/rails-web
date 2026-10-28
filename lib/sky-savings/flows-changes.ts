// Sky Savings' protocol changes on the Lifetime flows events row (rails-ops
// reference/lifetime-price-chart.md, ruling 10): each File('ssr') on sUSDS and
// each LitePSM fee log after its deployment (the /rates read the page holds).

import { flowChange, pctWords, type FlowChange } from "@/lib/shared/flows-changes";
import { psmPriceProv, rateChangeProv } from "@/lib/sky-savings/provenance";
import type { SkyRates } from "@/lib/sky-savings/types";

const exitFee = (s: { tout: string; usdcPerUsds: string }) =>
  s.usdcPerUsds === "halted" ? "halted" : pctWords(Number(s.tout) / 1e16);

export function skyFlowChanges(rates: Pick<SkyRates, "ssr" | "psm"> | null): FlowChange[] {
  if (!rates) return [];
  const out: FlowChange[] = rates.ssr.map((r) =>
    flowChange({
      ts: r.timestamp,
      block: r.blockNumber,
      txHash: r.txHash.toLowerCase(),
      name: "Savings Rate",
      from: pctWords(Number(r.previousAnnualRate) * 100),
      to: pctWords(Number(r.annualRate) * 100),
      prov: rateChangeProv(r.blockNumber, r.txHash, r.ssr, pctWords(Number(r.annualRate) * 100)),
    }),
  );
  const series = [...rates.psm.series].sort((a, b) => a.fromBlock - b.fromBlock);
  // The first entry is the PSM's deployment, the fee it began with.
  series.slice(1).forEach((s, i) => {
    if (s.fromTimestamp == null) return;
    const prev = series[i];
    out.push(
      flowChange({
        ts: s.fromTimestamp,
        block: s.fromBlock,
        ...(s.txHash ? { txHash: s.txHash.toLowerCase() } : {}),
        name: "PSM exit fee",
        from: exitFee(prev),
        to: exitFee(s),
        prov: {
          ...psmPriceProv(s.fromBlock, s.usdcPerUsds, s.tout),
          ...(s.txHash ? { source: { block: s.fromBlock, txHash: s.txHash } } : {}),
        },
      }),
    );
  });
  return out;
}
