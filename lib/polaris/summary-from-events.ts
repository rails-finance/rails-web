// A CDP's summary derived from its OWN timeline — the replay the listing row
// would state, computed from the rows the page already holds.
//
// Why this exists: the listing route filters by market and holder, not by
// CDP id (§3 of the build plan names no `id` param, and the live route ignores
// one — measured 2026-09-05: `?market=usdp&id=27&limit=1` answers the default
// page, CDP 740). A summary fetched that way is some OTHER CDP's, and merging
// it onto this page's chain figures would state the wrong holder, the wrong
// terminal word and the wrong counts with full confidence. So the page asks
// for the row by id, keeps it only when it names this CDP, and otherwise
// derives the same facts here from the timeline — which IS keyed by id.
//
// What the timeline cannot say: the holder of a CDP that was never
// transferred (the mint's recipient is not a row — see polaris-timeline.ts).
// On an open CDP the chain lane's ownerOf covers it; on a burned one the
// holder stays unknown rather than guessed.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { isPolarisEvent } from "@/lib/shared/types/event-shape";
import { POLARIS_MARKET_CONFIG, type PolarisMarket } from "@/lib/polaris/asset-catalog";
import type { PolarisPositionSummary } from "@/lib/sources/api/polaris-positions";

const num = (s?: string): number => {
  const n = Number(s ?? "0");
  return Number.isFinite(n) ? n : 0;
};

export function polarisSummaryFromEvents(
  market: PolarisMarket,
  cdpId: string,
  events: BaseActivityEvent[],
): PolarisPositionSummary | null {
  const rows = events
    .filter(isPolarisEvent)
    .filter((e) => e.context.data.market === market && e.context.data.cdpId === cdpId)
    .sort((a, b) => a.blockNumber - b.blockNumber || a.id.localeCompare(b.id));
  if (rows.length === 0) return null;

  let coll = 0;
  let debt = 0;
  let collRaw = "0";
  let debtRaw = "0";
  let peakColl = 0;
  let peakDebt = 0;
  let sumInterest = 0;
  let sumStableGain = 0;
  let sumBcGain = 0;
  let eventCount = 0;
  let transferCount = 0;
  let liqCount = 0;
  let lastOp: number | null = null;
  let lastPrimaryRate: number | null = null;
  let owner = "";
  let ownerAtOpen = "";
  for (const e of rows) {
    const c = e.context.data;
    if (c.eventType === "transfer") {
      transferCount++;
      if (c.toAddr) owner = c.toAddr;
      continue;
    }
    eventCount++;
    if (c.eventType === "liquidate") liqCount++;
    if (c.operation != null) lastOp = c.operation;
    coll = num(c.newColl);
    debt = num(c.newDebt);
    collRaw = c.raw?.newColl ?? collRaw;
    debtRaw = c.raw?.newDebt ?? debtRaw;
    peakColl = Math.max(peakColl, coll);
    peakDebt = Math.max(peakDebt, debt);
    sumInterest += num(c.accruedInterest);
    sumStableGain += num(c.stableGain);
    sumBcGain += num(c.bcTokenGain);
    if (c.primaryRate != null) lastPrimaryRate = c.primaryRate;
    if (c.eventType === "open" && c.txFrom) ownerAtOpen = c.txFrom;
  }
  const first = rows[0];
  const last = rows[rows.length - 1];
  return {
    market,
    stableSymbol: POLARIS_MARKET_CONFIG[market].stable.symbol,
    cdpId,
    owner,
    ownerAtOpen,
    status: lastOp === 3 ? "liquidated" : lastOp === 2 ? "closed" : "open",
    liquidated: liqCount > 0,
    coll,
    collRaw,
    debt,
    debtRaw,
    peakColl,
    peakDebt,
    sumAccruedInterest: sumInterest,
    sumStableGain,
    sumBcTokenGain: sumBcGain,
    firstBlock: first.blockNumber,
    firstTs: first.timestamp,
    firstTxHash: first.txHash,
    lastBlock: last.blockNumber,
    lastTs: last.timestamp,
    lastTxHash: last.txHash,
    eventCount,
    transferCount,
    liqCount,
    lastPrimaryRate,
  };
}
