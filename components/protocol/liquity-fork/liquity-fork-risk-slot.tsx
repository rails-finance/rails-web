"use client";

// The fork Trove card's live lines (Ebisu, Asymmetry, Basedollar), drawn in
// the card's opened layer (ui-jobs 209) and inside its receipts scope, so the
// Provenance list holds exactly these figures:
//
//   • under Debt, the Liquity V2 band's yearly cost at the live rate
//     ("Costs: ~X ebUSD / year");
//   • under Collateral ratio, the price bar (how far the collateral can fall
//     before the branch MCR; the card's "Liquidates at" line states the
//     price), the borrowing headroom to the MCR and the branch ratio (with the
//     CCR borrow-gate / SCR shutdown notes), then the redemption queue: its
//     bar and the debt ahead ("Debt in front: X ebUSD" with the Trove count).
//
// The trove's own ratio and liquidation price are NOT restated here — the
// shared Liquity-family card states both. The redemption runway is an
// ORTHOGONAL axis (queue position by user-set rate, not a reframing of
// price-fall risk) and carries the queue-share receipt. Zombie troves sit
// outside the queue, so it only plots for an active trove.

import { LiquityForkRunway } from "@/components/protocol/liquity-fork/liquity-fork-runway";
import { LiquityForkCrCard } from "@/components/protocol/liquity-fork/liquity-fork-cr-card";
import { RedemptionRunway } from "@/components/shared/redemption-runway";
import { forkLiveVocab, FORK_DEBT_SYMBOL } from "@/lib/shared/liquity-fork-live-provenance";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { formatApproximate, formatExact, formatPrice } from "@/lib/utils/format";
import type { LiquityForkTroveChainResponse } from "@/lib/api/fetch-liquity-fork-position";

/** The Liquity V2 band's two items on a fork Trove, from the live read. */
function LiquityForkDetailsBand({
  chain,
  part,
  alignStart = false,
}: {
  chain: LiquityForkTroveChainResponse;
  /** One item alone (the card's opened layer): the costs, or the debt in front. */
  part?: "costs" | "queue";
  alignStart?: boolean;
}) {
  if (chain.status !== "active" && chain.status !== "zombie") return null;
  const debtSym = FORK_DEBT_SYMBOL[chain.protocol] ?? "";
  const vocab = forkLiveVocab(chain.protocol);
  const annualCost = (chain.recordedDebt * chain.annualInterestRatePct) / 100;
  const costsProv: Provenance = {
    kind: "derived",
    summary:
      "Estimated interest cost per year — the recorded debt times the annual interest rate, both read live. It is a year's interest at today's rate; the rate can change.",
    formula: "recorded debt × rate ÷ 100",
    inputs: [
      {
        label: "recorded debt",
        value: `${formatExact(chain.recordedDebt)} ${debtSym}`,
        kind: "chain",
        note: "TroveManager.getLatestTroveData()",
      },
      {
        label: "rate",
        value: `${formatExact(chain.annualInterestRatePct)}%`,
        kind: "chain",
        note: "TroveManager.getLatestTroveData()",
      },
    ],
  };
  const align = alignStart ? "text-left" : "text-right";
  return (
    <>
      {part !== "queue" && annualCost > 0 && (
        <div className={`${align} text-xs text-rb-500 leading-relaxed tabular-nums`}>
          Costs:{" "}
          <Prov info={costsProv} value={formatExact(annualCost)}>
            <span className="text-foreground/80 font-semibold">~{formatPrice(annualCost)}</span>
          </Prov>{" "}
          {debtSym} / year
        </div>
      )}
      {part !== "costs" && chain.status === "active" && chain.debtInFront != null && (
        <div className={`${align} text-xs text-rb-500 leading-relaxed tabular-nums`}>
          Debt in front:{" "}
          <Prov info={vocab.debtInFrontProv(chain.symbol)} value={formatExact(chain.debtInFront)} symbol={debtSym}>
            <span className="text-foreground/80 font-semibold">{formatApproximate(chain.debtInFront)}</span>
          </Prov>{" "}
          {debtSym}
          {chain.trovesAhead != null && (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-rb-200 dark:bg-rb-700 px-1.5 py-px text-[0.7rem] font-semibold text-rb-500 align-middle">
              <Prov info={vocab.trovesAheadProv(chain.symbol)} value={String(chain.trovesAhead)}>
                {chain.trovesAhead}
              </Prov>
            </span>
          )}
          {/* Nothing sits at a lower or equal rate: this Trove is the head of
              the redemption queue, whatever rate it chose. */}
          {chain.debtInFront < 0.01 && (chain.trovesAhead == null || chain.trovesAhead === 0) && (
            <div>Lowest rate on the branch now: next in line</div>
          )}
        </div>
      )}
    </>
  );
}

/** The opened layer under Debt (ui-jobs 209): a year's interest at the live rate. */
export function LiquityForkDebtDetail({ chain }: { chain: LiquityForkTroveChainResponse }) {
  return <LiquityForkDetailsBand chain={chain} part="costs" alignStart />;
}

/** The opened layer under Collateral ratio (ui-jobs 209): the price bar, the
 *  room to the branch minimum and the branch ratio, then the redemption queue
 *  (its bar and the debt in front). The card's "Liquidates at" line above it
 *  states the price the bar measures to. */
export function LiquityForkRiskDetail({ chain }: { chain: LiquityForkTroveChainResponse }) {
  const queued =
    chain.status === "active" && chain.debtInFront != null && chain.branchDebt != null && chain.branchDebt > 0;
  return (
    <div className="mt-1.5 max-w-72 space-y-1">
      <LiquityForkRunway chain={chain} barOnly />
      <LiquityForkCrCard chain={chain} alignStart />
      {queued && (
        <RedemptionRunway
          debtInFront={chain.debtInFront as number}
          queueDebtTotal={chain.branchDebt as number}
          shareProv={forkLiveVocab(chain.protocol).queueShareProv(chain.symbol)}
          markerTitle="This trove's place in the branch's redemption queue — everything left of the marker is redeemed first"
        />
      )}
      <LiquityForkDetailsBand chain={chain} part="queue" alignStart />
    </div>
  );
}
