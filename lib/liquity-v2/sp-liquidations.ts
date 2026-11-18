// A Liquity V2 stability-pool deposit's liquidations between its touches, as
// the timeline places them (rails-ops decision 0022 §3–§4; the read is
// rails-server's /stability-pool/liquidations). Each closed stretch with a
// liquidation is one market note anchored on the touch that closed it, so it
// draws between its two touches, as Polaris's PSM gap does
// (lib/polaris/psm-gap.ts). The open stretch since the last touch belongs to
// the "Since its last touch" row. Pure, type imports only, so
// scripts/test/liquity-v2-sp-liquidations.test.mjs loads it directly.

import type { MarketNotePoint, SpLiquidationsNote } from "@/lib/shared/market-note";
import type { LiquityV2DepositLiquidationsResponse, LiquityV2DepositStretch } from "@/lib/sources/api/liquity-v2-sp";
import type { SpBranch } from "./sp-routes";

const end = (e: {
  event_key: string;
  block_number: string;
  block_timestamp: string;
  tx_hash: string;
}): MarketNotePoint => ({
  block: Number(e.block_number),
  timestamp: Number(e.block_timestamp),
  value: 0,
  eventId: e.event_key,
  txHash: e.tx_hash,
  logIndex: 0,
  wallet: "",
  kind: "sp_op",
});

/** The branch's replay check, as counts; null where the route states none. */
export function spBranchCheck(read: LiquityV2DepositLiquidationsResponse): SpLiquidationsNote["branchCheck"] {
  const c = read.branch_check;
  if (!c) return null;
  return { unreconciled: Number(c.unreconciled), closedStretches: Number(c.closed_stretches) };
}

/** One note per closed stretch that holds a liquidation; `pool` the
 *  branch's StabilityPool (LIQUITY_V2_SP_POOLS). */
export function spLiquidationNotes(
  branch: SpBranch,
  pool: string,
  read: LiquityV2DepositLiquidationsResponse,
): SpLiquidationsNote[] {
  const branchCheck = spBranchCheck(read);
  return read.stretches
    .filter(
      (s): s is LiquityV2DepositStretch & { to: NonNullable<LiquityV2DepositStretch["to"]> } =>
        s.to != null && s.liquidations.length > 0,
    )
    .map((s) => ({
      kind: "sp-liquidations",
      id: `sp-liquidations:${branch}:${s.from.block_number}-${s.to.block_number}`,
      marketSymbol: branch,
      marketAddress: pool,
      unitLabel: "BOLD",
      protocol: "liquity-v2",
      from: end(s.from),
      to: end(s.to),
      branch,
      stretch: s,
      branchCheck,
    }));
}

export const isSpLiquidationsNote = (x: unknown): x is SpLiquidationsNote =>
  (x as SpLiquidationsNote | null)?.kind === "sp-liquidations";
