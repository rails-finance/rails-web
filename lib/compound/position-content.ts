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
        text: "Compound V3 on Base runs its own Comet markets, independent of Compound V3 on Ethereum — a position on one says nothing about the other.",
      }
    : {
        bold: "One market per base asset",
        text: "each Comet deployment lends and borrows exactly one base asset — this card's market is one of several Ethereum Comets, each fully independent.",
      };

  if (opts.status === "liquidated") {
    return {
      title: "About This Position",
      intro:
        "This position was absorbed when its debt outgrew its collateral's liquidation value. The panel above reconstructs its final state — the highest recorded base and collateral it ever held.",
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
        "This position has unwound to zero — its debt repaid and its collateral withdrawn. The panel above shows its lifetime peaks: the highest base and collateral it ever held.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Highest recorded",
          text: "each peak is the maximum of its running balance, replayed from the position's own events — a principal figure, not the interest-bearing current value.",
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
      "This panel explains the position's live state in plain language — the signed base balance it holds, the collateral backing any borrowing, and what triggers an absorb, all read from this market's own Comet contract at the block this card names.",
    detailsHeading: "Key concepts:",
    details,
    links: LINKS,
  };
}
