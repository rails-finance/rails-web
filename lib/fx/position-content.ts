// Position-panel "?" content for the f(x) position card — the state explainer
// for the panel that reads the position's settled figures (or, on a
// closed/liquidated position, its final settled state). Distinct from the
// event-level modals in lib/shared/learn-more-content.ts (fxOperateContent,
// fxLiquidationContent), which explain individual actions.
//
// The pool's terms (lines, bonuses, funding, default fees) come from the
// card's head read (/api/chain/fx/terms); while it is in flight the bullets
// state the mechanics without the numbers.

import type { LearnMoreContent } from "@/components/shared/learn-more-modal";
import type { FxPoolTerms } from "@/lib/sources/chain/fx-terms";
import { formatNumber } from "@/lib/utils/format";
import { fxScheduleFull } from "@/lib/fx/row-figures";

const FX_DOC_URL = "https://fxprotocol.gitbook.io/fx-docs";

const pct = (r: number): string => `${(r * 100).toFixed(2).replace(/\.?0+$/, "")}%`;

function mechanics(pool: string, t: FxPoolTerms | null): { bold: string; text: string }[] {
  return [
    {
      bold: "Debt ratio",
      text: t
        ? `fxUSD debt divided by the collateral's value at the oracle's anchor price. The pool judges its lines at the oracle's min price, which is at or below the anchor: borrowing and withdrawing stop at ${pct(t.maxBorrowRatio)}; from ${pct(t.rebalanceRatio)} a keeper can rebalance the position's tick, and from ${pct(t.liquidateRatio)} liquidate it. A rebalanced row can therefore show a ratio a little under ${pct(t.rebalanceRatio)}.`
        : `fxUSD debt divided by the collateral's value at the oracle's anchor price. The pool judges its lines at the oracle's min price: past the ${pool} pool's rebalance line a keeper can rebalance the position's tick, and past its liquidation line liquidate it.`,
    },
    {
      bold: "Who acts",
      text: t
        ? `rebalances and liquidations are run by keepers: any address may call them, and the bonus pays them (${pct(t.rebalanceBonus)} of the collateral taken on a rebalance, ${pct(t.liquidateBonus)} on a liquidation). The protocol keeps ${pct(t.expenseRatio)} of each bonus.`
        : "rebalances and liquidations are run by keepers: any address may call them, and a bonus in collateral pays them. The protocol keeps a share of each bonus.",
    },
    {
      bold: "Rebalance",
      text: "the keeper repays part of the tick's debt and takes collateral worth that debt plus the bonus. Every position in the tick keeps less of both and stays open, back at the rebalance line.",
    },
    {
      bold: "Liquidation",
      text: "the keeper repays the debt and takes collateral worth it plus the bonus; collateral beyond that stays in the position for the owner. When the collateral falls short, the keeper takes all of it and the unpaid debt is added to every other position. The owner keeps the fxUSD borrowed.",
    },
  ];
}

function costs(t: FxPoolTerms | null, colls?: number | null, sym?: string): { bold: string; text: string } | null {
  if (!t) return null;
  const perYear =
    colls != null && colls > 0 && sym
      ? ` About ${formatNumber(colls * t.fundingRatio)} ${sym} a year on this position's ${formatNumber(colls)} ${sym}, at today's rate.`
      : "";
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
  const routerNote =
    t.routers.length > 0
      ? ` The two f(x) routers are charged ${t.routers
          .map((r) => `${fxScheduleFull(r.fees)} (${short(r.address)})`)
          .join(" and ")}.`
      : "";
  return {
    bold: "Cost",
    text: `funding at ${pct(t.fundingRatio)} a year, taken from collateral with no event.${perYear} The manager charges fees to the account that calls it; the pool's default schedule charges ${fxScheduleFull(t.fees)}.${routerNote} Each timeline row names the caller and the schedule it paid.`,
  };
}

export function fxPositionContent(opts: {
  status: "open" | "closed" | "liquidated";
  pool: string;
  terms?: FxPoolTerms | null;
  colls?: number | null;
  normalizedSymbol?: string;
}): LearnMoreContent {
  const { status, pool } = opts;
  const t = opts.terms ?? null;
  const nft = {
    bold: "The NFT",
    text: "the position is an NFT the pool mints. Closing or liquidating leaves the NFT with its owner, who can fund it again.",
  };

  if (status === "liquidated") {
    return {
      title: "About This Position",
      intro: `This position was liquidated when its debt ratio reached the ${pool} pool's liquidation line. The debt line above compares what its transactions add up to with the pool's final reading.`,
      detailsHeading: "Key concepts:",
      details: [...mechanics(pool, t), nft],
      links: [{ label: "f(x) docs", url: FX_DOC_URL }],
    };
  }

  if (status === "closed") {
    return {
      title: "About This Position",
      intro:
        "This position has been closed. Its collateral and debt are zero in the pool's reading, and the debt line above compares what its transactions added up to with that reading.",
      detailsHeading: "Key concepts:",
      details: [
        {
          bold: "Debt moved by the pool",
          text: "rebalances and other positions' bad debt change a position's debt with no event of its own, so the pool's reading is the current figure and the sum of the transactions is shown beside it.",
        },
        {
          bold: "Two units",
          text: `the timeline's amounts are the ${pool} transferred; the figures above are in the pool's rate-adjusted unit.`,
        },
        nft,
      ],
      links: [{ label: "f(x) docs", url: FX_DOC_URL }],
    };
  }

  const cost = costs(t, opts.colls, opts.normalizedSymbol);
  return {
    title: "About This Position",
    intro: `This panel describes the position as the ${pool} pool reads it now, and how that compares with what its own transactions add up to.`,
    detailsHeading: "Key concepts:",
    details: [
      ...mechanics(pool, t),
      ...(cost ? [cost] : []),
      {
        bold: "Tick-tree shares",
        text: "the pool stores a position as shares of a tick; the collateral and debt above are the pool's reading of those shares at a named block.",
      },
      {
        bold: "On fx.aladdin.club",
        text: "f(x)'s app lists this position on its Trade tab, and its Funding History there is the collateral this page reads leaving between the position's transactions.",
      },
      nft,
    ],
    links: [{ label: "f(x) docs", url: FX_DOC_URL }],
  };
}
