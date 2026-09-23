// Position-panel "?" content for the Liquity V2 fork trio (Ebisu, Asymmetry,
// Basedollar) — one grammar parameterised by name + debt symbol, mirroring
// lib/shared/liquity-fork-economics-explanation.tsx's split (that file covers
// the economics/tower panel's "?"; this one covers the position panel's).
//
// Structure follows liquityPositionContent (the V2 benchmark, see
// lib/shared/learn-more-content.ts:141) almost exactly: the forks run the
// SAME V2 architecture (user-set/delegated interest, rate-ordered
// redemptions, per-branch MCR, batch delegation), differing only in name,
// stablecoin, and each branch's own minimum collateral ratio.

import type { LearnMoreContent, LearnMoreLink } from "@/components/shared/learn-more-modal";

export interface LiquityForkPositionContentParams {
  /** Display name ("Ebisu" | "Asymmetry" | "Base Dollar"). */
  name: string;
  /** The fork's stablecoin symbol ("ebUSD" | "USDaf" | "BD"). */
  debtSymbol: string;
  status: "open" | "closed" | "liquidated";
  isBatched?: boolean;
  /** This branch's minimum collateral ratio, e.g. "115%" — omit rather than guess. */
  minCR?: string;
  /** One live-verified docs/site link. */
  docsLink?: LearnMoreLink;
}

export function liquityForkPositionContent(opts: LiquityForkPositionContentParams): LearnMoreContent {
  const { name, debtSymbol, status, isBatched, minCR, docsLink } = opts;
  const links = docsLink ? [docsLink] : undefined;
  const minCRText = minCR ? `below ${minCR}` : "below its branch's minimum";

  if (status === "liquidated") {
    return {
      title: "About This Position",
      intro: `This Trove was liquidated when its collateral ratio fell ${minCRText}. The panel above reconstructs its final state — peak collateral, ${debtSymbol} debt, and how long it stayed open.`,
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Liquidation threshold",
          text: `each ${name} branch sets its own minimum collateral ratio, checked against the branch's own oracle price. Anyone can trigger the liquidation once a Trove falls below it.`,
        },
        {
          bold: "Trove NFT",
          text: "ownership of a Trove is an ERC-721 NFT. One address can hold many Troves, each a separate position, even within the same branch.",
        },
      ],
      links,
    };
  }

  if (status === "closed") {
    return {
      title: "About This Position",
      intro: `This Trove has been closed and its ${debtSymbol} debt fully repaid. The panel above shows its lifetime peaks — the most collateral and debt it ever held.`,
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Closing a Trove",
          text: "repaying all debt returns the collateral above the liquidation reserve to the owner and burns the Trove NFT.",
        },
        {
          bold: "Trove NFT",
          text: "ownership of a Trove is an ERC-721 NFT. One address can hold many Troves, each a separate position, even within the same branch.",
        },
      ],
      links,
    };
  }

  // Open Trove — the live, interactive case.
  const details: LearnMoreContent["details"] = [
    {
      bold: "Collateral ratio",
      text: `the collateral's value relative to the ${debtSymbol} debt. It must stay ${minCR ? `above ${minCR}` : "above the branch's minimum"} or the Trove can be liquidated.`,
    },
  ];
  if (isBatched) {
    details.push({
      bold: "Interest delegation",
      text: "a batch manager sets this Trove's rate and charges a management fee on top of the interest, both accruing to the debt.",
    });
  } else {
    details.push({
      bold: "Interest rate",
      text: "the borrower sets the rate, or delegates it to a batch manager. Lower rates cost less but sit earlier in the redemption queue.",
    });
  }
  details.push(
    {
      bold: "Redemption exposure",
      text: `any ${debtSymbol} holder can redeem it against the system at $1 face value, sweeping each branch's queue from the lowest user-set interest rate upward — not the lowest collateral ratio. A redeemed Trove gives up collateral worth the debt it sheds: it deleverages, but its net value is preserved.`,
    },
    {
      bold: "Branch scoping",
      text: `each collateral type is its own branch with its own oracle, minimum ratio and redemption queue — one branch's stress does not liquidate another's Troves.`,
    },
    {
      bold: "Trove NFT",
      text: "ownership of a Trove is an ERC-721 NFT. One address can hold many Troves, each a separate position.",
    },
  );

  return {
    title: "About This Position",
    intro: `This panel explains the Trove's live state in plain language — what backs the ${debtSymbol} debt, what it costs to hold, and how exposed it is to redemption — the same Liquity V2 architecture ${name} runs.`,
    detailsHeading: "Key concepts:",
    details,
    links,
  };
}
