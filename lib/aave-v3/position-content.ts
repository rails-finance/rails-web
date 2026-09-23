// Position-panel "?" content for the Aave-V3-architecture position card — the
// same component and the same content function serve Aave V3 on Ethereum,
// Aave V3 on Base, and Seamless (a fork on Base): one machine, three deployed
// Pools, so only the name and the deployment-specific footnote change.

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import { AAVE_FAQ_URLS } from "@/components/transaction-timeline/explanation/shared/faqUrls";
import { SEAMLESS_DOCS_URL } from "@/lib/aave-v3/protocol-name";

export type AaveV3PositionDeployment = "aave-v3" | "aave-v3-base" | "seamless";

const DEPLOYMENT_NAME: Record<AaveV3PositionDeployment, string> = {
  "aave-v3": "Aave V3",
  "aave-v3-base": "Aave V3 on Base",
  seamless: "Seamless",
};

function deploymentLinks(deployment: AaveV3PositionDeployment): LearnMoreContent["links"] {
  if (deployment === "seamless") {
    return [
      { label: "Seamless docs", url: SEAMLESS_DOCS_URL },
      { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
    ];
  }
  return [
    { label: "Supplying assets", url: AAVE_FAQ_URLS.SUPPLYING },
    { label: "Health factor & liquidations", url: AAVE_FAQ_URLS.LIQUIDATIONS },
    { label: "Aave FAQ", url: AAVE_FAQ_URLS.FAQ },
  ];
}

function deploymentDetail(deployment: AaveV3PositionDeployment): { bold: string; text: string } {
  if (deployment === "seamless") {
    return {
      bold: "A frozen market",
      text: "every Seamless reserve has been frozen since April 2025 — no new supply or borrowing — but interest, repayment, withdrawal and liquidation all still work as before.",
    };
  }
  if (deployment === "aave-v3-base") {
    return {
      bold: "A separate deployment",
      text: "Aave V3 on Base has its own reserves, risk parameters and oracle, independent of Aave V3 on Ethereum — a position on one says nothing about the other.",
    };
  }
  return {
    bold: "Separate markets",
    text: "Core, Prime and EtherFi are separate Pools, each its own account with its own health factor — a position in one market says nothing about another.",
  };
}

export function aaveV3PositionContent(opts: {
  /** "unread" (no state recorded yet, 0018) reads as open: the concepts hold
   *  and no lifecycle claim is made. */
  status: "open" | "closed" | "liquidated" | "unread";
  deployment?: AaveV3PositionDeployment;
  hasDebt?: boolean;
}): LearnMoreContent {
  const deployment = opts.deployment ?? "aave-v3";
  const name = DEPLOYMENT_NAME[deployment];
  const links = deploymentLinks(deployment);

  if (opts.status === "liquidated") {
    return {
      title: "About This Position",
      intro:
        "This account was liquidated when its health factor fell below 1.0. The panel above reconstructs its final state — the highest recorded supply and debt for each reserve it held.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Health factor",
          text: "the account's single safety number across every reserve; once it drops below 1.0, a liquidator can step in.",
        },
        {
          bold: "Cross-collateralisation",
          text: `${name} pools every supplied reserve into one account — all of it backed all of the borrowing, under one shared health factor.`,
        },
        deploymentDetail(deployment),
      ],
      links,
    };
  }

  if (opts.status === "closed") {
    return {
      title: "About This Position",
      intro:
        "This account has repaid all its debt and withdrawn its collateral. The panel above shows its lifetime peaks — the highest supply and debt each reserve ever reached.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Highest recorded",
          text: "each reserve's peak is the maximum of its running balance, replayed from the account's own events — not a snapshot at one moment.",
        },
        {
          bold: "Cross-collateralisation",
          text: `${name} pools every supplied reserve into one account — all of it backs all of the borrowing, under one shared health factor.`,
        },
        deploymentDetail(deployment),
      ],
      links,
    };
  }

  const details: LearnMoreContent["details"] = [
    {
      bold: "Cross-collateralisation",
      text: `${name} pools every supplied reserve into one account per wallet — all of it backs all of the account's borrowing, under one shared health factor.`,
    },
    {
      bold: "Health factor",
      text: "measures how safely the debt is covered against the collateral's liquidation thresholds; below 1.0 the account can be liquidated.",
    },
    opts.hasDebt
      ? {
          bold: "Liquidation price",
          text: "for a single-reserve collateral, the oracle price at which the health factor would hit 1.0 — the figure the panel above restates beneath the health factor; with several collateral reserves it shows the combined-value drop instead.",
        }
      : {
          bold: "Supply only",
          text: "with no debt, the account carries no health factor or liquidation risk — supplied reserves simply earn interest.",
        },
    {
      bold: "Oracle pricing",
      text: `USD figures come from ${name}'s own on-chain oracle — the same prices the Pool liquidates with.`,
    },
    deploymentDetail(deployment),
  ];

  return {
    title: "About This Position",
    intro: `This panel explains the account's live state in plain language — what's supplied across each reserve, what's borrowed against it, and how safely the debt is covered, all read from ${name}'s own Pool at the block this card names.`,
    detailsHeading: "Key concepts:",
    details,
    links,
  };
}
