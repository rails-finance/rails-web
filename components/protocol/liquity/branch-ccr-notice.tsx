"use client";

// A Liquity V2 branch below its critical collateral ratio (rails-ops
// TO-DO-ui-jobs 747, 858), the sibling of the shutdown state (shutdown-bullet.tsx):
// the TCR and CCR at the read's block, what the contracts restrict while it
// lasts, and the price at which the branch would reach its shutdown ratio.
// Each figure carries its receipt (lib/liquity-v2/branch-ccr-provenance.ts).
//
// One part per surface, keyed off `anatomy`:
// - C23·liquity, the Trove card: the owner's answer at rest (whether this
//   Trove's close goes through, what stays open, the delegated-rate floor for
//   a Trove in a batch, a line for a dormant Trove), the rules behind the app's one disclosure control
//   (components/shared/disclosure.ts, the DiscChevron, the whole notice as
//   the row target);
// - N8·liquity, the listing: the headline and one sentence of rules;
// - M6.2, the branches page: compact, the full list behind the disclosure.
// C23 and N8 link to the branches page.
//
// The rules are BorrowerOperations' (liquity/bold contracts/src):
// - closeTrove takes the Trove's entire collateral and debt out of the branch
//   and calls _requireNewTCRisAboveCCR on what is left (troveCloseCheck in
//   lib/liquity-v2/branch-ccr.ts); _openTrove calls it too. The card gives no
//   close answer on a lastGoodPrice read: closeTrove calls fetchPrice, which
//   may shut the branch down where its simulation failed;
// - a dormant (zombie) Trove: closeTrove takes it (_requireTroveIsOpen), and
//   adjustTrove, addColl, repayBold and the rate and delegate calls revert
//   (_requireTroveIsActive); adjustZombieTrove must leave its debt at or above
//   MIN_DEBT (_requireAtLeastMinDebt in _adjustTrove), so under the minimum it
//   has to borrow, which below the CCR passes only where the branch ends at or
//   above CCR (zombieMustBorrow in lib/liquity-v2/branch-ccr.ts);
// - _requireValidAdjustmentInCurrentMode below the CCR: borrowing only if the
//   branch ends at or above CCR (_requireNoBorrowingUnlessNewTCRisAboveCCR), a
//   collateral withdrawal needs a repayment of at least its value
//   (_requireDebtRepaymentGeCollWithdrawal), and every adjustment keeps
//   ICR >= MCR, MCR + BCR for a Trove in a batch (_requireICRisAboveMCRPlusBCR);
//   repaying stops at MIN_DEBT, 2,000e18 (Constants.sol, _requireAtLeastMinDebt;
//   LIQUITY_MIN_DEBT here);
// - _applyUpfrontFee adds the upfront fee to the debt and calls
//   _requireNewTCRisAboveCCR, so below the CCR it always reverts. It runs on a
//   rate change inside the 7-day cooldown (adjustTroveInterestRate;
//   _removeFromBatch with a new rate; setBatchManagerAnnualInterestRate's
//   copy of the check) and on every setInterestBatchManager. switchBatchManager
//   is removeFromBatch at the old batch's rate (no fee) then
//   setInterestBatchManager, so joining or switching a batch manager is
//   blocked at any point of the cooldown;
// - setInterestIndividualDelegate makes no TCR check of its own (on a batched
//   Trove it calls removeFromBatch); user copy leaves it to the info page.
// Liquidation stays at ICR < MCR (TroveManager._batchLiquidateTroves).
// User copy says "delegated rate" and "delegate" for a batch and its manager
// (decision 0065, official-docs row 18).

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Prov } from "@/components/shared/provenance";
import { DiscChevron } from "@/components/shared/expand-chevron";
import { disclosureProps } from "@/components/shared/disclosure";
import { useRowTarget } from "@/components/shared/row-target";
import { formatUsdValue } from "@/lib/utils/format";
import { INLINE_LINK } from "@/lib/shared/ui-grammar";
import { LIQUITY_MIN_DEBT } from "@/lib/liquity/trove-ops";
import {
  ccrNoticeShown,
  tcrPercentText,
  troveCloseCheck,
  zombieMustBorrow,
  type LiquityV2BranchCcr,
  type TroveCloseInput,
} from "@/lib/liquity-v2/branch-ccr";
import {
  branchBatchFloorProv,
  branchCcrProv,
  branchShutdownPriceProv,
  branchTcrProv,
  troveCloseTcrProv,
} from "@/lib/liquity-v2/branch-ccr-provenance";

/** A governance ratio as the docs print it: "150%", "110%". */
const whole = (x: number) => `${Math.round(x * 1000) / 10}%`;

const BRANCHES_PATH = "/ethereum/liquity-v2/branches";

type Anatomy = "C23·liquity" | "M6.2" | "N8·liquity";

/** The Trove the card is about (C23·liquity). `figures` is its live
 *  getLatestTroveData, null until that read lands; `delegated` is its batch
 *  membership; `isZombie` is the index's dormant flag. */
export interface CcrNoticeTrove {
  id: string;
  delegated: boolean;
  isZombie: boolean;
  figures: TroveCloseInput | null;
}

export function BranchCcrNotice({
  state,
  anatomy,
  compact = false,
  trove,
}: {
  state: LiquityV2BranchCcr | null | undefined;
  /** The part's code where it stands (rails-ops reference/app-anatomy.md):
   *  C23·liquity on the Trove card, M6.2 on the branches page, N8·liquity on the listing. */
  anatomy: Anatomy;
  compact?: boolean;
  /** C23·liquity only. */
  trove?: CcrNoticeTrove;
}) {
  if (!ccrNoticeShown(state)) return null;
  if (anatomy === "N8·liquity") return <ListingNotice s={state} />;
  return <Notice s={state} anatomy={anatomy} compact={compact} trove={trove} />;
}

function Headline({ s }: { s: LiquityV2BranchCcr }) {
  return (
    <>
      <span className="font-semibold">Safety Mode.</span> The {s.branch} branch&rsquo;s Total Collateral Ratio (TCR) is{" "}
      <Prov info={branchTcrProv(s)}>{tcrPercentText(s.tcrRaw)}</Prov>, below its Critical Collateral Ratio (CCR) of{" "}
      <Prov info={branchCcrProv(s)}>{whole(s.ccr)}</Prov>.
    </>
  );
}

const BranchesLink = () => (
  <>
    <Link href={BRANCHES_PATH} className={INLINE_LINK}>
      See all branches
    </Link>
    .
  </>
);

/** N8·liquity: the headline, one sentence of rules and the branches link. */
function ListingNotice({ s }: { s: LiquityV2BranchCcr }) {
  return (
    <div
      className="notice-caution mb-2 flex items-start gap-2 p-3 text-caution-700 dark:text-caution-400"
      data-branch-ccr={s.branch}
      data-anatomy="N8·liquity"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1 text-sm leading-relaxed">
        <Headline s={s} /> Opening or closing a Trove and borrowing more are blocked unless they bring the branch back
        to {whole(s.ccr)}. A rate change inside the 7-day cooldown is blocked. <BranchesLink />
      </p>
    </div>
  );
}

function Notice({
  s,
  anatomy,
  compact,
  trove,
}: {
  s: LiquityV2BranchCcr;
  anatomy: Anatomy;
  compact: boolean;
  trove: CcrNoticeTrove | undefined;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggle = () => setOpen((o) => !o);
  const rowClick = useRowTarget(toggle);
  const text = compact ? "text-[11px] leading-relaxed" : "text-sm leading-relaxed";
  const onCard = anatomy === "C23·liquity";
  const ccr = whole(s.ccr);
  const floorProv = branchBatchFloorProv(s);
  // The floor sentence spells out the MCR: always on the branches page, on the
  // card where the Trove has a delegated rate. The liquidation sentence then
  // names it short.
  const mcrSpelled = !onCard || trove?.delegated === true;
  const floor =
    s.bcr != null && floorProv ? (
      <>
        <Prov info={floorProv}>{whole(s.mcr + s.bcr)}</Prov>, the {whole(s.mcr)} Minimum Collateral Ratio (MCR) plus a{" "}
        {whole(s.bcr)} buffer
      </>
    ) : (
      <>the {whole(s.mcr)} Minimum Collateral Ratio (MCR) plus a buffer</>
    );
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
          <Headline s={s} />{" "}
          <button
            {...disclosureProps<HTMLButtonElement>(open, panelId, toggle)}
            aria-label={open ? "Hide what Safety Mode restricts" : "Show what Safety Mode restricts"}
            className="inline-flex translate-y-0.5 items-center rounded-sm align-baseline focus-visible:outline-2 focus-visible:outline-teal-500"
          >
            <DiscChevron isOpen={open} />
          </button>
        </p>
        {onCard && <TroveAnswer s={s} trove={trove} floor={floor} />}
        {open && (
          <div id={panelId} data-row-body="" className="cursor-auto space-y-1">
            {onCard ? (
              <p>
                Borrowing more is blocked unless it brings the branch back to {ccr}. A rate change inside the 7-day
                cooldown is blocked, since it charges the upfront fee. Withdrawing collateral needs a repayment of at
                least its value in the same adjustment.
              </p>
            ) : (
              <p>
                Opening a Trove, closing one and borrowing more are blocked unless they bring the branch back to {ccr}.
                A rate change inside the 7-day cooldown, and joining or switching a delegate, are blocked, since each
                charges the upfront fee. Withdrawing collateral needs a repayment of at least its value in the same
                adjustment. For a Trove with a delegated rate, each change must leave it at or above {floor}.
              </p>
            )}
            <p>
              {mcrSpelled ? (
                <>Liquidation is unchanged: a Trove is liquidated only below the {whole(s.mcr)} MCR.</>
              ) : (
                <>
                  Liquidation is unchanged: a Trove is liquidated only below its {whole(s.mcr)} Minimum Collateral Ratio
                  (MCR).
                </>
              )}
            </p>
            <p>
              At today&rsquo;s collateral and debt, the branch falls to its Shutdown Collateral Ratio (SCR) of{" "}
              {whole(s.scr)} at a {s.branch} price of{" "}
              <Prov info={branchShutdownPriceProv(s)}>{formatUsdValue(s.shutdownPrice)}</Prov>. Below that, anyone can
              shut the branch down.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** C23·liquity at rest: whether this Trove's close goes through, what stays
 *  open, and the delegated-rate floor where the Trove is in a batch. */
function TroveAnswer({
  s,
  trove,
  floor,
}: {
  s: LiquityV2BranchCcr;
  trove: CcrNoticeTrove | undefined;
  floor: ReactNode;
}) {
  const check = troveCloseCheck(s, trove?.figures);
  const ccr = whole(s.ccr);
  const closeProv = check && trove ? troveCloseTcrProv(s, check, trove.id) : null;
  const minDebt = `${LIQUITY_MIN_DEBT.toLocaleString("en-US")} BOLD`;
  const zombie = trove?.isZombie === true;
  const subject = zombie ? "This dormant Trove" : "This Trove";
  return (
    <p
      data-branch-ccr-close={check ? (check.closes ? "yes" : "no") : undefined}
      data-branch-ccr-dormant={zombie ? "" : undefined}
    >
      {check && closeProv ? (
        check.closes ? (
          <>
            {subject} <Prov info={closeProv}>can be closed</Prov>: closing it leaves the branch at or above {ccr}.{" "}
          </>
        ) : (
          <>
            {subject} <Prov info={closeProv}>can&rsquo;t be closed</Prov> until the branch is back at {ccr}.{" "}
          </>
        )
      ) : null}
      {zombie && zombieMustBorrow(trove?.figures, LIQUITY_MIN_DEBT) ? (
        <>
          {check ? "Any other change" : "Apart from closing it, any change to this dormant Trove"} has to bring its debt
          back to the {minDebt} minimum, and that borrowing is blocked unless it brings the branch back to {ccr}.
        </>
      ) : (
        <>Repaying, down to the {minDebt} minimum debt, and adding collateral stay open.</>
      )}
      {trove?.delegated ? (
        <>
          {" "}
          This Trove has a delegated rate, so each change must leave it at or above {floor}.
          {zombie ? null : <> Switching delegates is blocked, since every switch charges the upfront fee.</>}
        </>
      ) : null}{" "}
      <BranchesLink />
    </p>
  );
}
