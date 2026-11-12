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
import { forkLiquidationReserve } from "@/lib/shared/liquity-fork-ops";
import { fmtLtv, liquityFamilyTerms } from "@/lib/liquity/ltv";
import { liquityShutdownSentence } from "@/lib/shared/learn-more-content";

export interface LiquityForkPositionContentParams {
  /** Display name ("Ebisu" | "Asymmetry" | "Base Dollar"). */
  name: string;
  /** The fork's stablecoin symbol ("ebUSD" | "USDaf" | "BD"). */
  debtSymbol: string;
  status: "open" | "closed" | "liquidated";
  isBatched?: boolean;
  /** A redemption left the Trove below the branch's minimum debt. */
  isZombie?: boolean;
  /** This branch's minimum collateral ratio, e.g. "115%" — omit rather than guess. */
  minCR?: string;
  /** Live-verified docs/site link(s) — one or more question-level links where
   *  the fork's docs were read (Ebisu, Asymmetry, 2026-09-28), else the single
   *  general link. */
  docsLinks?: LearnMoreLink[];
}

export function liquityForkPositionContent(opts: LiquityForkPositionContentParams): LearnMoreContent {
  const { name, debtSymbol, status, isBatched, isZombie, minCR, docsLinks } = opts;
  const reserve = forkLiquidationReserve(name);
  const links = docsLinks && docsLinks.length > 0 ? docsLinks : undefined;
  // The deployment's documented terms (decision 0065). In LTV terms the
  // branch's limit is its Max LTV, 1 ÷ the minimum ratio.
  const t = liquityFamilyTerms(name);
  const minCRText = minCR ? `below ${minCR}` : "below its branch's minimum";
  const maxLtv = minCR ? fmtLtv(10000 / parseFloat(minCR), 2) : null;

  if (status === "liquidated") {
    return {
      title: "About this position",
      intro: t.ltv
        ? `This Trove was liquidated when its LTV rose ${maxLtv ? `above ${maxLtv}` : "above its branch's Max LTV"}. The panel above reconstructs its final state: peak collateral, ${debtSymbol} debt, and how long it stayed open.`
        : `This Trove was liquidated when its ${t.ratioText} fell ${minCR ? minCRText : `below its branch's ${t.limitText}`}. The panel above reconstructs its final state: peak collateral, ${debtSymbol} debt, and how long it stayed open.`,
      detailsHeading: "Key concepts:",
      details: [
        t.ltv
          ? {
              bold: "Max LTV",
              text: `each ${name} branch sets its own Max LTV, checked against the branch's own oracle price. Anyone can trigger the liquidation once a Trove rises above it. The Max LTV named above is the one in force when this Trove was liquidated.`,
            }
          : {
              bold: "Liquidation threshold",
              text: `each ${name} branch sets its own ${t.limitText}, checked against the branch's own oracle price. Anyone can trigger the liquidation once a Trove falls below it. The ${t.limitShort} named above is the one in force when this Trove was liquidated.`,
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
      title: "About this position",
      intro: `This Trove has been closed and its ${debtSymbol} debt fully repaid. The panel above shows its lifetime peaks: the most collateral and debt it ever held.`,
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Closing a Trove",
          text: reserve
            ? `repaying all debt returns all the collateral to the owner, refunds the ${reserve} liquidation reserve paid apart from it at open, and burns the Trove NFT.`
            : "repaying all debt returns all the collateral to the owner and burns the Trove NFT.",
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
    t.ltv
      ? {
          bold: "LTV",
          text: `the ${debtSymbol} debt relative to the collateral's value. It must stay ${maxLtv ? `below ${maxLtv}` : "below the branch's Max LTV"} or the Trove can be liquidated.`,
        }
      : {
          bold: t.ratio,
          text: `the collateral's value relative to the ${debtSymbol} debt. It must stay ${minCR ? `above ${minCR}` : `above the branch's ${t.limitText}`} or the Trove can be liquidated.`,
        },
  ];
  if (isBatched) {
    details.push({
      bold: "Interest delegation",
      text: `a ${t.delegate} sets this Trove's rate and charges a management fee on top of the interest, both accruing to the debt.`,
    });
  } else {
    details.push({
      bold: "Interest rate",
      text: `the borrower sets the rate, or delegates it to a ${t.delegate}. Lower rates cost less but sit earlier in the redemption queue.`,
    });
  }
  details.push(
    {
      bold: "Redemption exposure",
      text: `any ${debtSymbol} holder can redeem it against the system at $1 face value, sweeping each branch's queue from the lowest user-set interest rate upward, ${t.ltv ? "not the highest LTV" : `not the lowest ${t.ratioText}`}. A redeemed Trove gives up collateral worth the debt it sheds: it deleverages, but its net value is preserved.${
        // The Trove modal holds five Key concepts (modal grammar §4): a
        // dormant Trove's rule rides here rather than as a sixth.
        isZombie
          ? ` A redemption that leaves a Trove below the minimum debt makes it ${t.dormantText}${t.dormant === "Zombie" ? "" : " (Zombie in the contracts)"}, out of the rate-ordered queue. While it is the branch's most recent one owing ${debtSymbol}, the next redemption takes from it first.`
          : ""
      }`,
    },
    {
      bold: "Branch scoping",
      text: `each collateral type is its own ${t.branch === "branch" ? "branch" : `${t.branch} (a branch)`} with its own oracle, ${t.limitText} and redemption queue, so one branch's stress does not liquidate another's Troves. ${liquityShutdownSentence(t)}`,
    },
    {
      bold: "Trove NFT",
      text: "ownership of a Trove is an ERC-721 NFT. One address can hold many Troves, each a separate position.",
    },
  );

  return {
    title: "About this position",
    intro: `This panel explains the Trove's live state in plain language: what backs the ${debtSymbol} debt, what it costs to hold, and how exposed it is to redemption. ${name} runs the same Liquity V2 architecture.`,
    detailsHeading: "Key concepts:",
    details,
    links,
  };
}
