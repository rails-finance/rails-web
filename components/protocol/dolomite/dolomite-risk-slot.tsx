"use client";

// The Dolomite position card's margin ratio (ui-jobs 209): the third headline
// and the lines under it in the opened layer, from the page's live core read.
// The ratio is the core's own adjusted supply ÷ adjusted borrow; the line is
// the core's own requirement for exactly this account (the risk override where
// one is set). The adjusted debt, its share of the borrow capacity and the
// capacity itself are stated in the card's Explanation.

import { Prov } from "@/components/shared/provenance";
import { StatValue } from "@/components/shared/stat-value";
import { DolomiteRunway } from "@/components/protocol/dolomite/dolomite-runway";
import { dolomiteRequirementProv, dolomiteCollateralizationProv } from "@/lib/dolomite/live-provenance";
import type { DolomiteChainResponse } from "@/lib/api/fetch-dolomite-position";

const pct2 = (f: number) => `${(f * 100).toFixed(2)}%`;

/** Whether the read carries a ratio to state: live debt and a live line. */
export function dolomiteHasRisk(chain: DolomiteChainResponse): boolean {
  return (
    !chain.chainStale &&
    chain.collateralization != null &&
    chain.adjBorrowValueUsd > 0 &&
    chain.requiredCollateralization > 0
  );
}

/** The headline: the account's margin ratio. */
export function DolomiteRiskHeadline({ chain }: { chain: DolomiteChainResponse }) {
  if (chain.collateralization == null) return null;
  return (
    <StatValue>
      <Prov info={dolomiteCollateralizationProv()}>{pct2(chain.collateralization)}</Prov>
    </StatValue>
  );
}

/** Under the headline: the fall that reaches the account's line, the line,
 *  and the distance bar. */
export function DolomiteRiskDetail({ chain }: { chain: DolomiteChainResponse }) {
  const c = chain.collateralization;
  const req = chain.requiredCollateralization;
  if (c == null || req <= 0) return null;
  const dropPct = c > req ? Math.round((1 - req / c) * 100) : null;
  return (
    <>
      <div className="text-xs mt-0.5 text-rb-500">
        {dropPct != null && dropPct > 0 ? `Liquidates on a ${dropPct}% drop · ` : null}line at{" "}
        <Prov info={dolomiteRequirementProv()}>
          {pct2(req)}
          {chain.override.active ? " (account override)" : ""}
        </Prov>
      </div>
      <div className="mt-1.5 max-w-72">
        <DolomiteRunway
          compact
          barOnly
          collateralization={c}
          requiredCollateralization={req}
          overrideActive={chain.override.active}
        />
      </div>
    </>
  );
}
