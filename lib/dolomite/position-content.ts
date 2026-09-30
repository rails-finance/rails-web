// Position-panel "?" content for the Dolomite position card — the card's
// grain is one Account.Info (owner, accountNumber): cross-margin within an
// account number, isolated across them.

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { liquidatedIntro, type LiquidationStory } from "@/lib/shared/ctoken-liquidation-story";

const DOLOMITE_DOC_URL = "https://docs.dolomite.io/";

const LINKS: LearnMoreContent["links"] = [{ label: "Dolomite docs", url: DOLOMITE_DOC_URL }];

export function dolomitePositionContent(opts: {
  status: "open" | "closed" | "liquidated";
  hasDebt?: boolean;
  /** The card's peaks are token balances read from the rows (every market's). */
  peaksInTokens?: boolean;
  liquidations?: LiquidationStory[];
  liquidationCount?: number;
}): LearnMoreContent {
  const peakConcept = opts.peaksInTokens
    ? {
        bold: "Highest recorded",
        text: "each market's largest balance just before or just after any event, in tokens with interest included. The panel above states the same figures in words.",
      }
    : {
        bold: "Highest recorded, in par",
        text: "each peak is the maximum of the running par balance, a scaled figure: multiply it by the market's interest index for tokens.",
      };

  if (opts.status === "liquidated") {
    const count = opts.liquidationCount ?? opts.liquidations?.length ?? 0;
    return {
      title: "About This Position",
      intro:
        opts.liquidations && opts.liquidations.length > 0 && count > 0
          ? liquidatedIntro(opts.liquidations, count)
          : "This account was liquidated when its adjusted collateral value fell below the margin requirement times its adjusted debt, and has since closed: nothing remains supplied or borrowed.",
      detailsHeading: "Key concepts:",
      details: [
        peakConcept,
        {
          bold: "Par × index",
          text: "balances are stored scaled (par); the per-market interest index, accruing per second, carries all interest. Par × index is the token amount.",
        },
        {
          bold: "Cross-margin within, isolated across",
          text: "all balances under this account number backed each other; a different account number of the same owner is margined and liquidated on its own.",
        },
      ],
      links: LINKS,
    };
  }

  if (opts.status === "closed") {
    return {
      title: "About This Position",
      intro:
        "This account's balances have returned to zero. The panel above describes its life in words: the highest balance on each side, the closing date and the transaction count.",
      detailsHeading: "Key concepts:",
      details: [
        peakConcept,
        {
          bold: "Par × index",
          text: "balances are stored scaled (par); the per-market interest index, accruing per second, carries all interest. Par × index is the token amount.",
        },
        {
          bold: "Cross-margin within, isolated across",
          text: "all balances under this account number back each other; a different account number of the same owner is margined and liquidated on its own.",
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
