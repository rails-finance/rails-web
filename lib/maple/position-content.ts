// Position-panel "?" content for the Maple position card — a lender's ERC-4626
// pool shares plus whatever sits escrowed in the withdrawal queue. Maple's
// syrup pools carry no liquidation surface (a lender, not a borrower), so
// status here is open/closed only.

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

const MAPLE_DOC_URL = "https://docs.maple.finance";

const LINKS: LearnMoreContent["links"] = [
  { label: "Maple docs", url: MAPLE_DOC_URL },
  { label: "Maple docs: withdrawals", url: `${MAPLE_DOC_URL}/syrupusdc-usdt-usdg-for-lenders/risk` },
];

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
          text: "a share is a claim on the pool. The exit rate is what one share pays out on withdrawal, so shares × the exit rate = what a withdrawal pays. The rate rises as borrowers pay interest, and falls when the pool delegate, the manager that runs the pool's lending, marks a loan as impaired.",
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
      text: "a share is a claim on the pool. The exit rate is what one share pays out on withdrawal, so shares × the exit rate = what a withdrawal pays. The rate rises as the pool's borrowers pay interest on their loans, which is where a lender's yield comes from.",
    },
    {
      bold: "Impairment",
      text: "the pool delegate, the manager that runs the pool's lending, can mark a loan as impaired when it looks likely to lose money. The exit rate then drops by the marked amount, and a lender who exits while the mark stands takes that loss for good.",
    },
    {
      bold: "Where the money is",
      text: "only a small share of the pool sits in the pool contract as cash. The rest is lent out, against collateral that custodians hold off-chain.",
    },
    opts.inQueue
      ? {
          bold: "The withdrawal queue",
          text: "a withdrawal request moves the shares into the queue and takes a place in line. Requests are paid first in, first out (FIFO), at the exit rate when each is processed, not when it was made.",
        }
      : {
          bold: "Exiting via the queue",
          text: "a withdrawal joins a first-in, first-out (FIFO) queue and is paid from the pool's cash. Maple's docs say most withdrawals are processed in under 24 hours and some can take up to 30 days. The page has no record of the pool's cash at past requests, so it cannot say why a given fill waited.",
        },
    {
      bold: "What the chain proves",
      text: "every deposit, withdrawal, share transfer, share balance and queue fill, and the pool rate each used. It cannot prove the loan book's collateral, which custodians hold off-chain.",
    },
  ];

  return {
    title: "About This Position",
    intro:
      "The pool shares this wallet holds, what they pay out at the pool's exit rate, and anything waiting in the withdrawal queue.",
    detailsHeading: "Key concepts:",
    details,
    links: LINKS,
  };
}
