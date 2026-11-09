// The Parameters section's "?" (anatomy M3.5, Layer 2): one plain bullet per
// row, in the order the section draws them, under the side that sets them.
// The rows a reserve does not draw (Price published and Paused off Base, Optimal
// usage without a curve) have no bullet. True of any spoke reserve; the figures
// are in the section, their sources in each figure's receipt.
//
// The facts, from aave/aave-v4 at a3ef63e: ISpoke.sol 41, 57–60, 70–72 (the
// reserve's terms); IHub.sol 20, 71–75 (the fee, the caps, the line);
// Hub.sol 814–858 (the caps and the line at add, remove and draw; the draw cap
// counts what the spoke owes); Spoke.sol 795–803 (collateral risk to the
// premium), 862–893 (borrowable and paused); AssetInterestRateStrategy.sol
// 102–137 (the curve turns at optimal usage).

import type { LearnMoreContent, LearnMoreDetail } from "@/components/shared/learn-more-modal";

type Names = { symbol: string; spoke: string; hub: string };

const WORDS = {
  title: "What the parameters mean",
  intro: (n: Names) =>
    `The ${n.spoke} spoke and the ${n.hub} hub each set part of how ${n.symbol} works here. The spoke's terms apply to positions on ${n.spoke}; the hub's set how much ${n.symbol} ${n.spoke} can supply and borrow, and what borrowing costs.`,
  spokeHeading: (n: Names) => `On the ${n.spoke} spoke`,
  hubHeading: (n: Names) => `On the ${n.hub} hub`,
  spoke: {
    price: (n: Names): LearnMoreDetail => ({
      bold: "Oracle price",
      text: `The USD price ${n.spoke} values ${n.symbol} at, for every collateral and debt figure on the spoke.`,
    }),
    published: (): LearnMoreDetail => ({
      bold: "Price published",
      text: "When the feed behind the oracle last published a price.",
    }),
    collateralFactor: (n: Names): LearnMoreDetail => ({
      bold: "Collateral factor",
      text: `The share of supplied ${n.symbol}'s value that counts toward a borrow on ${n.spoke}.`,
    }),
    maxBonus: (n: Names): LearnMoreDetail => ({
      bold: "Max liquidation bonus",
      text: `The most extra ${n.symbol} a liquidator can take over the debt repaid when a position is liquidated.`,
    }),
    liquidationFee: (): LearnMoreDetail => ({
      bold: "Liquidation fee",
      text: "The part of a liquidator's bonus the protocol keeps.",
    }),
    collateralRisk: (n: Names): LearnMoreDetail => ({
      bold: "Collateral risk",
      text: `Sets the premium a borrower pays on top of the borrow rate when ${n.symbol} backs the loan; a higher risk means a higher premium.`,
    }),
    borrowable: (n: Names): LearnMoreDetail => ({
      bold: "Borrowable",
      text: `Whether ${n.spoke} lends ${n.symbol}.`,
    }),
    paused: (n: Names): LearnMoreDetail => ({
      bold: "Paused",
      text: `Whether ${n.spoke} has stopped every action on ${n.symbol}.`,
    }),
  },
  hub: {
    addCap: (n: Names): LearnMoreDetail => ({
      bold: "Add cap",
      text: `The most ${n.symbol} suppliers on ${n.spoke} can put into the ${n.hub} hub, in total.`,
    }),
    drawCap: (n: Names): LearnMoreDetail => ({
      bold: "Draw cap",
      text: `The most ${n.symbol} borrowers on ${n.spoke} can owe the ${n.hub} hub, in total.`,
    }),
    liquidityFee: (n: Names): LearnMoreDetail => ({
      bold: "Liquidity fee",
      text: `The share of borrowers' interest the ${n.hub} hub keeps as a fee; suppliers earn the rest.`,
    }),
    line: (n: Names): LearnMoreDetail => ({
      bold: "Line",
      text: `Whether the ${n.hub} hub takes ${n.spoke}'s ${n.symbol} supplies, withdrawals, borrows and repayments. A halted or inactive line takes none of them.`,
    }),
    optimal: (n: Names): LearnMoreDetail => ({
      bold: "Optimal usage",
      text: `The share of the hub's ${n.symbol} lent out at which the borrow rate starts to climb steeply.`,
    }),
  },
  links: [
    { label: "Aave V4 liquidity and credit lines", url: "https://aave.com/docs/aave-v4/liquidity" },
    { label: "Aave V4 positions", url: "https://aave.com/docs/aave-v4/positions" },
    { label: "Aave V4 liquidations", url: "https://aave.com/docs/aave-v4/positions/liquidations" },
  ],
};

/** Each row's term to its sentence, for the press-to-explain on the row's
 *  label: the same words as the "?" bullet. */
export function v4ParameterTips(n: Names): Record<string, string> {
  const all = [...Object.values(WORDS.spoke), ...Object.values(WORDS.hub)].map((w) => w(n));
  return Object.fromEntries(all.map((d) => [d.bold, d.text]));
}

/** The rows the section draws: `published` and `paused` on Base, `curve` where the hub's curve was read. */
export function v4ParametersLearnMore(
  n: Names,
  rows: { published: boolean; paused: boolean; curve: boolean },
): LearnMoreContent {
  const s = WORDS.spoke;
  const h = WORDS.hub;
  return {
    title: WORDS.title,
    intro: WORDS.intro(n),
    detailGroups: [
      {
        heading: WORDS.spokeHeading(n),
        details: [
          s.price(n),
          ...(rows.published ? [s.published()] : []),
          s.collateralFactor(n),
          s.maxBonus(n),
          s.liquidationFee(),
          s.collateralRisk(n),
          s.borrowable(n),
          ...(rows.paused ? [s.paused(n)] : []),
        ],
      },
      {
        heading: WORDS.hubHeading(n),
        details: [h.addCap(n), h.drawCap(n), h.liquidityFee(n), h.line(n), ...(rows.curve ? [h.optimal(n)] : [])],
      },
    ],
    links: WORDS.links,
  };
}
