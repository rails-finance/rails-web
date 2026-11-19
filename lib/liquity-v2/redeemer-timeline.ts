// A Liquity V2 redeemer's rows as the shared timeline's events
// (components/shared/chain-truth-timeline.tsx): one event per Trove a
// redemption hit. The event carries what the timeline reads (coordinates,
// the branch as its kind, the two tokens); the card reads the row, which
// the page looks up by the event's id.

import type { BaseActivityEvent } from "@/lib/shared/types/event-shape";
import { explorerUrl, MAINNET_CHAIN_ID } from "@/lib/shared/chains";
import { TOKEN_ADDRESSES } from "@/lib/shared/token-addresses";
import { LIQUITY_V2_BRANCHES } from "@/lib/liquity/asset-catalog";
import { units } from "./sp-math";
import { troveEventHref, troveEventId } from "./redeemer-routes";
import type { LiquityV2RedemptionRow } from "@/lib/sources/api/liquity-v2-redeemer";

/** Rows the page reads, newest first: the route's ceiling. Past it the
 *  timeline closes on a boundary card. */
export const REDEEMER_FIRST_READ = 500;

export const REDEMPTION_LABEL = "Redemption";

/** A row's id: its event's id on the Trove's timeline. */
export const redemptionId = (r: LiquityV2RedemptionRow) => troveEventId(r.transaction_hash, r.log_index);

/** The row's event page on the Trove it hit. */
export const redemptionEventHref = (r: LiquityV2RedemptionRow) =>
  troveEventHref(r.collateral_type, r.trove_id, redemptionId(r));

export function redemptionTimelineEvent(r: LiquityV2RedemptionRow, redeemer: string): BaseActivityEvent {
  const branch = LIQUITY_V2_BRANCHES[r.collateral_type.toLowerCase()];
  const bold = BigInt(r.bold_raw);
  const coll = BigInt(r.coll_raw);
  return {
    id: redemptionId(r),
    txHash: r.transaction_hash,
    blockNumber: Number(r.block_number),
    timestamp: Number(r.block_timestamp),
    wallet: redeemer,
    // By branch: the timeline's type filter narrows the rows to one
    // ("liquity-v2-redeemer" in lib/shared/event-filter-helpers.ts).
    actionType: `redemption-${r.collateral_type}`,
    actionLabel: REDEMPTION_LABEL,
    flows: [
      {
        token: TOKEN_ADDRESSES.BOLD.toLowerCase(),
        tokenSymbol: "BOLD",
        tokenDecimals: 18,
        amount: r.bold_raw,
        amountFormatted: units(bold),
        direction: "out",
      },
      {
        token: branch.collateralAddr.toLowerCase(),
        tokenSymbol: branch.symbol,
        tokenDecimals: 18,
        amount: r.coll_raw,
        amountFormatted: units(coll),
        direction: "in",
      },
    ],
    etherscanUrl: explorerUrl(MAINNET_CHAIN_ID, "tx", r.transaction_hash),
  };
}
