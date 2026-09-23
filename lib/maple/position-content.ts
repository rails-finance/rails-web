// Position-panel "?" content for the Maple position card — a lender's ERC-4626
// pool shares plus whatever sits escrowed in the withdrawal queue. Maple's
// syrup pools carry no liquidation surface (a lender, not a borrower), so
// status here is open/closed only.

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

const MAPLE_DOC_URL = "https://docs.maple.finance";

const LINKS: LearnMoreContent["links"] = [{ label: "Maple docs", url: MAPLE_DOC_URL }];

export function maplePositionContent(opts: { status: "open" | "closed"; inQueue?: boolean }): LearnMoreContent {
  if (opts.status === "closed") {
    return {
      title: "About This Position",
      intro:
        "This lender has withdrawn its whole pool claim. The panel above shows its lifetime peak — the highest share balance it ever held, and the highest principal ever deposited where one was recorded.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Shares & the exit rate",
          text: "the share is a claim on the pool: shares × the exit rate = what a withdrawal pays. The rate rises as loans accrue interest, and falls when the pool delegate marks an impairment.",
        },
        {
          bold: "On-chain bookkeeping, off-chain assets",
          text: "the chain proves the pool's own accounting — principal deployed, a posted rate, impairment marks. It cannot prove the custodied collateral behind the loans; that rests on Maple's custodians and attestations.",
        },
        {
          bold: "Transferable shares",
          text: "pool shares are ordinary ERC-20s, so a peak share balance can include shares acquired by transfer rather than direct deposit — its deposited-principal peak then reads zero.",
        },
      ],
      links: LINKS,
    };
  }

  const details: LearnMoreContent["details"] = [
    {
      bold: "Shares & the exit rate",
      text: "the share is a claim on the pool: shares × convertToExitAssets = what a withdrawal pays. The rate rises as loans accrue interest at their posted rates, and falls only when the pool delegate marks an impairment.",
    },
    {
      bold: "Where the money actually is",
      text: "only a small liquid buffer sits in the pool contract itself. The rest is deployed to loans whose collateral is held by custodians under off-chain tri-party agreements — the chain records the bookkeeping, not the collateral.",
    },
    opts.inQueue
      ? {
          bold: "The withdrawal queue",
          text: "requesting a withdrawal escrows the shares with the WithdrawalManager and takes a place in a first-in-first-out line; a processed request redeems at the exit rate at the moment of processing, not the moment of request.",
        }
      : {
          bold: "Exiting via the queue",
          text: "withdrawing normally travels through a first-in-first-out queue; requests fill as pool liquidity allows, typically within minutes when the liquid buffer covers them.",
        },
    {
      bold: "What the chain proves",
      text: "every deposit and withdrawal is self-priced by its own log, and share balances replay exactly from transfers. What it cannot prove is the loan book's off-chain backing.",
    },
  ];

  return {
    title: "About This Position",
    intro:
      "This panel explains the position's live state in plain language — the pool shares this wallet holds, what they claim at the pool's own exit rate, and anything sitting in the withdrawal queue.",
    detailsHeading: "Key concepts:",
    details,
    links: LINKS,
  };
}
