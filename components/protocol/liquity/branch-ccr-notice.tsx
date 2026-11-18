"use client";

// A Liquity V2 branch below its critical collateral ratio (rails-ops
// TO-DO-ui-jobs 747), the sibling of the shutdown state (shutdown-bullet.tsx):
// the TCR and CCR at the read's block, what the contracts restrict while it
// lasts, and the price at which the branch would reach its shutdown ratio.
// Each figure carries its receipt (lib/liquity-v2/branch-ccr-provenance.ts).
// It rests on its headline; the app's one disclosure control
// (components/shared/disclosure.ts, the DiscChevron, the whole notice as the
// row target) opens the restrictions and the shutdown price.
//
// The restrictions are BorrowerOperations' (liquity/bold contracts/src):
// - _openTrove and closeTrove call _requireNewTCRisAboveCCR;
// - _requireValidAdjustmentInCurrentMode: borrowing only if the branch ends at
//   or above CCR, a collateral withdrawal needs a repayment of at least its
//   value, and every adjustment keeps ICR >= MCR (MCR + BCR in a batch);
// - _applyUpfrontFee calls _requireNewTCRisAboveCCR, and runs on a rate change
//   inside the 7-day cooldown (adjustTroveInterestRate, removeFromBatch,
//   setBatchManagerAnnualInterestRate's own check) and on every
//   setInterestBatchManager, so joining or switching a batch manager;
// - setInterestIndividualDelegate makes no TCR check.
// Liquidation stays at ICR < MCR (TroveManager._batchLiquidateTroves).

import { useId, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Prov } from "@/components/shared/provenance";
import { DiscChevron } from "@/components/shared/expand-chevron";
import { disclosureProps } from "@/components/shared/disclosure";
import { useRowTarget } from "@/components/shared/row-target";
import { formatUsdValue } from "@/lib/utils/format";
import { ccrNoticeShown, tcrPercentText, type LiquityV2BranchCcr } from "@/lib/liquity-v2/branch-ccr";
import { branchCcrProv, branchShutdownPriceProv, branchTcrProv } from "@/lib/liquity-v2/branch-ccr-provenance";

/** A governance ratio as the docs print it: "150%", "110%". */
const whole = (x: number) => `${Math.round(x * 1000) / 10}%`;

type Anatomy = "C23·liquity" | "M6.2" | "N8·liquity";

export function BranchCcrNotice({
  state,
  anatomy,
  compact = false,
}: {
  state: LiquityV2BranchCcr | null | undefined;
  /** The part's code where it stands (rails-ops reference/app-anatomy.md):
   *  C23·liquity on the Trove card, M6.2 on the branches page, N8·liquity on the listing. */
  anatomy: Anatomy;
  compact?: boolean;
}) {
  if (!ccrNoticeShown(state)) return null;
  return <Notice s={state} anatomy={anatomy} compact={compact} />;
}

function Notice({ s, anatomy, compact }: { s: LiquityV2BranchCcr; anatomy: Anatomy; compact: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggle = () => setOpen((o) => !o);
  const rowClick = useRowTarget(toggle);
  const text = compact ? "text-[11px] leading-relaxed" : "text-sm leading-relaxed";
  return (
    <div
      className={`notice-caution disc-row flex cursor-pointer items-start gap-2 ${compact ? "mt-2 p-2" : "mb-2 p-3"} text-caution-700 dark:text-caution-400`}
      data-branch-ccr={s.branch}
      {...(open ? { "data-branch-ccr-open": "" } : {})}
      data-anatomy={anatomy}
      {...rowClick}
    >
      <AlertTriangle className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"} mt-0.5 shrink-0`} />
      <div className={`min-w-0 flex-1 space-y-1 ${text}`}>
        <p>
          <span className="font-semibold">Safety Mode.</span> The {s.branch} branch&rsquo;s Total Collateral Ratio (TCR)
          is <Prov info={branchTcrProv(s)}>{tcrPercentText(s.tcrRaw)}</Prov>, below its Critical Collateral Ratio (CCR)
          of <Prov info={branchCcrProv(s)}>{whole(s.ccr)}</Prov>, at block {s.blockNumber.toLocaleString("en-US")}.{" "}
          <button
            {...disclosureProps<HTMLButtonElement>(open, panelId, toggle)}
            aria-label={open ? "Hide what Safety Mode restricts" : "Show what Safety Mode restricts"}
            className="inline-flex translate-y-0.5 items-center rounded-sm align-baseline focus-visible:outline-2 focus-visible:outline-teal-500"
          >
            <DiscChevron isOpen={open} />
          </button>
        </p>
        {open && (
          <div id={panelId} data-row-body="" className="cursor-auto space-y-1">
            <p>
              Opening a Trove, closing one and borrowing more each revert unless the branch ends at or above its CCR. So
              do a rate change inside the 7-day cooldown and joining or switching a batch manager. Withdrawing
              collateral needs a repayment of at least its value in the same adjustment. A Trove is liquidated only
              below the {whole(s.mcr)} Minimum Collateral Ratio (MCR). Adding collateral and repaying remain open, as
              long as the Trove ends at or above its MCR (MCR plus BCR for a batched Trove). Setting an individual
              delegate stays open.
            </p>
            <p>
              The branch reaches its Shutdown Collateral Ratio (SCR) of {whole(s.scr)} at a {s.branch} price of{" "}
              <Prov info={branchShutdownPriceProv(s)}>{formatUsdValue(s.shutdownPrice)}</Prov>, at this collateral and
              debt. Below the SCR, anyone can shut it down.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
