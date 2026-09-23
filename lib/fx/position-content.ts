// Position-panel "?" content for the f(x) position card — the state explainer
// for the panel that reads the position's settled figures (or, on a
// closed/liquidated position, its final settled state). Distinct from the
// event-level modals in lib/shared/learn-more-content.ts (fxOperateContent,
// fxLiquidationContent), which explain individual actions.
//
// URL matches the one already verified in lib/shared/learn-more-content.ts's
// FX_DOC_URL (fxprotocol.gitbook.io).

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";

const FX_DOC_URL = "https://fxprotocol.gitbook.io/fx-docs";

export function fxPositionContent(opts: { status: "open" | "closed" | "liquidated"; pool: string }): LearnMoreContent {
  const { status, pool } = opts;

  if (status === "liquidated") {
    return {
      title: "About This Position",
      intro: `This position was liquidated when its debt ratio breached the ${pool} pool's threshold. The debt footnote above reconciles what events implied against the pool's own settled reading at the point it closed.`,
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Liquidations vs rebalances",
          text: "a liquidation closes one position outright; it's distinct from a rebalance, which trims a whole tick of positions back to a safer ratio and touches no single position's own event log.",
        },
        {
          bold: "Write-offs",
          text: "when collateral runs out before debt is cleared, the shortfall is written off against the protocol's reserve — a change with no event of its own, which is exactly what the reconciliation line above accounts for.",
        },
      ],
      links: [{ label: "f(x) docs", url: FX_DOC_URL }],
    };
  }

  if (status === "closed") {
    return {
      title: "About This Position",
      intro:
        "This position has been closed. Its settled collateral and debt have emptied, and the debt footnote above reconciles what its own events implied against the pool's final settled reading.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Settled vs implied",
          text: "socialized changes (tick rebalances, write-offs, bad debt socialized from other positions' liquidations) emit no per-position event, so the pool's own settled reading is the primary truth; the implied figure from this position's own events is shown alongside it as a check.",
        },
        {
          bold: "Two unit systems",
          text: `operation amounts were in the deposit token as transferred; the settled figures above are rate-normalized for the ${pool} pool — the receipts name which is which.`,
        },
      ],
      links: [{ label: "f(x) docs", url: FX_DOC_URL }],
    };
  }

  // Open position — the live, interactive case.
  return {
    title: "About This Position",
    intro: `This panel explains the position's live state in plain language — what the ${pool} pool's own settled reading shows right now, and how that compares to what this position's own events imply.`,
    detailsHeading: "Key concepts:",
    details: [
      {
        bold: "Tick-tree shares",
        text: "a position's stored value is a share count in the pool's tick tree, not a fixed amount — the collateral and debt above are resolved from that share through the pool's own getPosition view at a named block.",
      },
      {
        bold: "Funding costs",
        text: "leverage is financed through Aave: the pool passes Aave's borrow rate through as a continuous funding charge on collateral, with no per-position event.",
      },
      {
        bold: "Debt ratio",
        text: "the pool's own risk figure for this position — the closest analogue to a collateral ratio here — read in the same settled sweep as the collateral and debt above.",
      },
      {
        bold: "On fx.aladdin.club",
        text: "this is the xPOSITION the app shows on its Trade tab: the app's Current Size − xPOSITION Size equals the fxUSD debt above, and its Funding History is the collateral drift Rails reads between this position's own events — funding is charged on collateral, so it never appears in the debt-side socialized figure.",
      },
      {
        bold: "Socialized reconciliation",
        text: "the debt footnote compares what this position's own events imply against the pool's settled figure; the gap is exactly what rebalances, write-offs and socialized bad debt moved with no event of their own.",
      },
    ],
    links: [{ label: "f(x) docs", url: FX_DOC_URL }],
  };
}
