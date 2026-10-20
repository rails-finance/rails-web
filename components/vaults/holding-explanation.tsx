"use client";

// The holder card's (i) (rails-ops ui-jobs 407 step 4, 410): which block each
// figure was read at, what Earned counts, what the address is, and the family's
// own line where it has one. Under 150 words (standards/prose-limits-and-zones.md).

import type { ReactNode } from "react";
import { ExplainBullet, ExplainGroup } from "@/components/shared/explain-groups";

const n = (v: number) => v.toLocaleString("en-US");

export function HoldingExplanation({
  blockNumber,
  censusBlock,
  assetSymbol,
  rewards,
  shape,
  extra,
}: {
  blockNumber: number;
  /** Null where the family has no census (Yearn) or the census has no row. */
  censusBlock: number | null;
  assetSymbol: string;
  /** The rewards paid outside the share that Earned leaves out, in the family's words. */
  rewards: string;
  /** What the address is (`HolderShapeLine`), where the code read answered. */
  shape?: ReactNode;
  /** The family's own bullets. */
  extra?: ReactNode;
}) {
  return (
    <div data-holding-explanation="">
      <ExplainGroup title="Reads">
        <ExplainBullet>
          Balance, share of the vault, claim and Redeemable now are calls at block {n(blockNumber)}.
        </ExplainBullet>
        {censusBlock != null ? (
          <ExplainBullet>
            The transfer count, first seen and the dollar value are the daily census at block {n(censusBlock)}.
          </ExplainBullet>
        ) : (
          <ExplainBullet>
            First seen and Earned come from this page&rsquo;s sweep of the address&rsquo;s transfers.
          </ExplainBullet>
        )}
      </ExplainGroup>
      <ExplainGroup title="Earned" data-earned-explanation="">
        <ExplainBullet>
          Earned is in {assetSymbol}: shares received by transfer are valued at receipt, and {rewards} are not counted.
        </ExplainBullet>
      </ExplainGroup>
      {(shape || extra) && (
        <ExplainGroup title="This holding">
          {shape && <ExplainBullet>{shape}</ExplainBullet>}
          {extra}
        </ExplainGroup>
      )}
    </div>
  );
}
