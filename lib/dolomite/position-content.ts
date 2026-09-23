// Position-panel "?" content for the Dolomite position card — the card's
// grain is one Account.Info (owner, accountNumber): cross-margin within an
// account number, isolated across them.

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

const DOLOMITE_DOC_URL = "https://docs.dolomite.io/";

const LINKS: LearnMoreContent["links"] = [{ label: "Dolomite docs", url: DOLOMITE_DOC_URL }];

export function dolomitePositionContent(opts: {
  status: "open" | "closed" | "liquidated";
  hasDebt?: boolean;
}): LearnMoreContent {
  if (opts.status === "liquidated") {
    return {
      title: "About This Position",
      intro:
        "This account was liquidated when its adjusted collateral value fell below the margin requirement times its adjusted debt. The panel above reconstructs its final state — the highest recorded par balance on each side.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Par × index",
          text: "balances are stored scaled (par); the per-market interest index — accruing per second — carries all interest. Par × index is the token amount.",
        },
        {
          bold: "Cross-margin within, isolated across",
          text: "all balances under this account number backed each other; a different account number of the same owner is independently margined and independently liquidated.",
        },
        {
          bold: "Vaporization",
          text: "if collateral ran out before the debt was cleared, the shortfall is written off, covered by the core's own excess token balances rather than by the account.",
        },
      ],
      links: LINKS,
    };
  }

  if (opts.status === "closed") {
    return {
      title: "About This Position",
      intro:
        "This account's balances have returned to zero. The panel above shows its lifetime peaks — the highest recorded par balance on each side.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Highest recorded, in par",
          text: "each peak is the maximum of the running par balance — a scaled figure, not the token amount, since interest lives entirely in the market's index.",
        },
        {
          bold: "Par × index",
          text: "balances are stored scaled (par); the per-market interest index — accruing per second — carries all interest. Par × index is the token amount.",
        },
        {
          bold: "Cross-margin within, isolated across",
          text: "all balances under this account number back each other; a different account number of the same owner is independently margined and independently liquidated.",
        },
      ],
      links: LINKS,
    };
  }

  const details: LearnMoreContent["details"] = [
    {
      bold: "Par × index",
      text: "the core stores each balance as par — a scaled figure. Par × the market's interest index = the token amount, and the index grows per second, so interest lives entirely in it.",
    },
    {
      bold: "No separate Borrow action",
      text: "a negative balance IS the debt — withdrawing (or trading) past zero opens debt at the market's borrow rate; there is no dedicated borrow call.",
    },
    {
      bold: "Cross-margin within, isolated across",
      text: "every balance under this account number cross-margins: positive balances back negative ones, judged together against the margin requirement. A different account number of the same owner is fully isolated.",
    },
    opts.hasDebt
      ? {
          bold: "The risk ladder",
          text: "the global 117.65% minimum collateralisation scales up multiplicatively with each market's margin premium — some accounts instead carry the protocol's own risk override (111.11%, premiums skipped).",
        }
      : {
          bold: "Lending only",
          text: "with no negative balance, the account carries no margin requirement to track — it simply earns interest into its markets' indexes.",
        },
  ];

  return {
    title: "About This Position",
    intro:
      "This panel explains the account's live state in plain language — the balances it holds across Dolomite's markets, which ones are debt, and how the margin requirement covers it, all read from the core contract at the block this card names.",
    detailsHeading: "Key concepts:",
    details,
    links: LINKS,
  };
}
