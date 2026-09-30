// Position-panel "?" content for the Compound V3 (Comet) position card — also
// serves Compound V3 on Base, a second Comet deployment reached through the
// same card component (lib/compound/deployment-context.tsx names the market).

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

const COMPOUND_DOC_URLS = {
  OVERVIEW: "https://docs.compound.finance/",
  COLLATERAL_BORROWING: "https://docs.compound.finance/collateral-and-borrowing/",
  LIQUIDATION: "https://docs.compound.finance/liquidation/",
} as const;

const LINKS: LearnMoreContent["links"] = [
  { label: "Compound V3 docs", url: COMPOUND_DOC_URLS.OVERVIEW },
  { label: "Collateral & borrowing", url: COMPOUND_DOC_URLS.COLLATERAL_BORROWING },
  { label: "Liquidation", url: COMPOUND_DOC_URLS.LIQUIDATION },
];

export type CompoundPositionDeployment = "compound" | "compound-base";

export function compoundPositionContent(opts: {
  /** "unread" (no state recorded yet, 0018) reads as open: the concepts hold
   *  and no lifecycle claim is made. */
  status: "open" | "closed" | "liquidated" | "unread";
  deployment?: CompoundPositionDeployment;
  side?: "lend" | "borrow" | "flat";
}): LearnMoreContent {
  const onBase = opts.deployment === "compound-base";
  const marketNote: { bold: string; text: string } = onBase
    ? {
        bold: "A separate deployment",
        text: "Compound V3 on Base runs separate markets (each market is a contract Compound calls a Comet), separate from Compound V3 on Ethereum: a position on one says nothing about the other.",
      }
    : {
        bold: "One market per base asset",
        text: "each market (a contract Compound calls a Comet) lends and borrows one base asset. This card's market is one of several on Ethereum, and they share nothing.",
      };

  if (opts.status === "liquidated") {
    return {
      title: "About This Position",
      intro:
        "This position was absorbed (Compound V3's word for liquidated) when its debt outgrew its liquidation line, and nothing is borrowed or posted now. The panel above shows the most it ever held and owed.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Absorb, not a partial nudge",
          text: "Compound V3 liquidates by absorbing the whole account: the protocol seizes the collateral and clears the entire base debt in one step, rather than a third party repaying part of it.",
        },
        {
          bold: "One signed base balance",
          text: "positive base is lending, negative is borrowing — the same account slot, so supply/repay and withdraw/borrow are the same two operations.",
        },
        marketNote,
      ],
      links: LINKS,
    };
  }

  if (opts.status === "closed") {
    return {
      title: "About This Position",
      intro:
        "This position has unwound: its debt is repaid and its collateral withdrawn, with at most dust worth under a cent left. The panel above shows the most it ever held and owed.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Highest recorded",
          text:
            opts.deployment === "compound-base"
              ? "each peak is the highest balance the position held just before or just after any of its events, read from the chain at that block where the block was read, interest included."
              : "each peak is the highest balance the position held just before or just after any of its events, each the chain's balance at that block, interest included.",
        },
        {
          bold: "One signed base balance",
          text: "positive base is lending, negative is borrowing — the same account slot, so supply/repay and withdraw/borrow are the same two operations.",
        },
        marketNote,
      ],
      links: LINKS,
    };
  }

  const details: LearnMoreContent["details"] = [
    {
      bold: "One signed base balance",
      text: "positive base is lending (earning the supply rate), negative base is borrowing (paying the borrow rate) — supply and repay are one operation, as are withdraw and borrow.",
    },
    {
      bold: "Collateral, not shared",
      text: "collateral is a separate, non-earning stack backing only this market's base borrowing — each asset counts up to its own borrow collateral factor.",
    },
    opts.side === "borrow"
      ? {
          bold: "Absorb liquidation",
          text: "past the liquidate collateral factor the protocol itself absorbs the account — seizing the collateral and clearing the whole base debt in one step, crediting back the difference minus a penalty.",
        }
      : {
          bold: "No borrowing, no liquidation risk",
          text: "with a positive base and no debt, the position simply earns the supply rate — there is no collateral factor or absorb risk to track.",
        },
    marketNote,
  ];

  return {
    title: "About This Position",
    intro:
      "This panel explains the position's live state in plain language: the base balance it holds, the collateral backing any borrowing, and what would trigger an absorb (Compound V3's word for a liquidation), all read from this market's contract at the block this card names.",
    detailsHeading: "Key concepts:",
    details,
    links: LINKS,
  };
}
