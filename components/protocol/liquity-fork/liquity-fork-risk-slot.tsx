"use client";

// The Ebisu / Asymmetry trove card's risk slot — both risk reads, always on,
// riding the card's heading-button row. One shared component for both forks
// (same V2 architecture). (The Display menu is retired: one framing no longer
// hides behind the other.) Everything it draws is ON the card face and inside
// the card's receipts scope, so the Provenance list holds exactly these
// figures —
//
//   • the price runway (how far the collateral can fall before the branch
//     MCR) — the spatial story, and
//   • the branch-context lines riding the same strip: borrowing headroom to
//     the MCR and the branch ratio (with the CCR borrow-gate / SCR shutdown
//     notes). The trove's own ratio and liquidation price are NOT restated
//     here — the shared Liquity-family card states both on its face.
//
// Ahead of both, the Liquity V2 band (TroveDetailsBand): a year's interest at
// the live rate ("Costs: ~X ebUSD / year") and the debt ahead in the queue
// ("Debt in front: X ebUSD" with the Trove count), from the same live read.
//
// The redemption runway rides alongside always: it is an ORTHOGONAL axis
// (queue position by user-set rate, not a reframing of price-fall risk). It
// carries the queue-share receipt; the redemption card's other figures (branch
// debt, the absolute debt-in-front) were branch context, and the trove's own
// rate is already a card stat — so the position card keeps only its own
// redemption exposure. Zombie troves sit outside the queue, so the runway only
// plots for an active trove.

import { LiquityForkRunway } from "@/components/protocol/liquity-fork/liquity-fork-runway";
import { LiquityForkCrCard } from "@/components/protocol/liquity-fork/liquity-fork-cr-card";
import { RedemptionRunway } from "@/components/shared/redemption-runway";
import { RiskFooterStrip, RiskMeter } from "@/components/shared/risk-footer-strip";
import { forkLiveVocab, FORK_DEBT_SYMBOL } from "@/lib/shared/liquity-fork-live-provenance";
import { Prov, type Provenance } from "@/components/shared/provenance";
import { formatApproximate, formatExact, formatPrice } from "@/lib/utils/format";
import type { LiquityForkTroveChainResponse } from "@/lib/api/fetch-liquity-fork-position";

/** The Liquity V2 band's two items on a fork Trove, from the live read. */
function LiquityForkDetailsBand({ chain }: { chain: LiquityForkTroveChainResponse }) {
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
  return (
    <>
      {annualCost > 0 && (
        <div className="text-right text-xs text-rb-500 leading-relaxed tabular-nums">
          Costs:{" "}
          <Prov info={costsProv} value={formatExact(annualCost)}>
            <span className="text-foreground/80 font-semibold">~{formatPrice(annualCost)}</span>
          </Prov>{" "}
          {debtSym} / year
        </div>
      )}
      {chain.status === "active" && chain.debtInFront != null && (
        <div className="text-right text-xs text-rb-500 leading-relaxed tabular-nums">
          Debt in front:{" "}
          <Prov info={vocab.debtInFrontProv(chain.symbol)} value={formatExact(chain.debtInFront)} symbol={debtSym}>
            <span className="text-foreground/80 font-semibold">{formatApproximate(chain.debtInFront)}</span>
          </Prov>{" "}
          {debtSym}
          {chain.trovesAhead != null && (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-rb-200 dark:bg-rb-700 px-1.5 py-px text-[0.7rem] font-semibold text-rb-500 align-middle">
              {chain.trovesAhead}
            </span>
          )}
        </div>
      )}
    </>
  );
}

export function LiquityForkRiskSlot({ chain }: { chain: LiquityForkTroveChainResponse }) {
  // Band → figures → RedemptionRunway → price runway: the V2 reference order.
  return (
    <RiskFooterStrip>
      <LiquityForkDetailsBand chain={chain} />
      <LiquityForkCrCard chain={chain} />
      {/* Redemption runway — the orthogonal queue axis, shown for an active
          trove (debt in front ÷ entire branch debt). */}
      {chain.status === "active" && chain.debtInFront != null && chain.branchDebt != null && chain.branchDebt > 0 && (
        <RiskMeter>
          <RedemptionRunway
            debtInFront={chain.debtInFront}
            queueDebtTotal={chain.branchDebt}
            shareProv={forkLiveVocab(chain.protocol).queueShareProv(chain.symbol)}
            markerTitle="This trove's place in the branch's redemption queue — everything left of the marker is redeemed first"
          />
        </RiskMeter>
      )}
      <RiskMeter>
        <LiquityForkRunway chain={chain} />
      </RiskMeter>
    </RiskFooterStrip>
  );
}
