// The words of Morpho Blue's Arc pages (rails-ops ui-jobs 577). The card's
// labels are the Morpho card's (components/protocol/morpho/morpho-position-card.tsx);
// the interest lines are Aave V4 on Arc's.

import type { ArcMorphoFigures, ArcMorphoPositionFigures } from "@/lib/morpho-arc/position";

export const LABEL = "Morpho Blue";

const num = (x: number) =>
  x.toLocaleString("en-US", {
    maximumFractionDigits: x >= 1000 ? 0 : x >= 1 ? 4 : 8,
    maximumSignificantDigits: x < 1 ? 4 : undefined,
  });

/** "cirBTC / USDC", or the loan token alone on a market with no collateral. */
export const pairName = (f: Pick<ArcMorphoFigures, "collateralToken" | "loan">) =>
  f.collateralToken ? `${f.collateralToken.symbol} / ${f.loan.symbol}` : `${f.loan.symbol}, no collateral`;

export const amount = (x: number, unit: string) => `${num(x)} ${unit}`;
export const usd = (x: number) =>
  `$${x.toLocaleString("en-US", { maximumFractionDigits: x >= 100 ? 0 : 2, minimumFractionDigits: x >= 100 ? 0 : 2 })}`;
export const pctText = (x: number, digits = 2) => `${(x * 100).toFixed(digits)}%`;
export const hfText = (x: number) => (x >= 100 ? "> 100" : x.toFixed(2));

export const FRONT_DOOR = {
  line: "A wallet's Morpho Blue positions on Arc, each with its collateral, debt and LTV against the market's line, in dollars where Arc has a price feed for the loan token, and its interest over the last 30 days.",
  links: { markets: "Markets" },
  heading: "Morpho Blue positions",
  none: "This address holds no Morpho Blue position on Arc.",
  unanswered: "The read of this wallet's positions did not answer. Try again in a minute.",
  rowSub: (f: ArcMorphoFigures) => `LLTV ${pctText(f.lltv, 1)}`,
  read: (n: number) => `Read across all ${n.toLocaleString("en-US")} markets on Arc.`,
};

export const POSITION_PAGE = {
  title: (f: ArcMorphoFigures) => `${pairName(f)} · Morpho Blue`,
  sub: (f: ArcMorphoFigures) => `LLTV ${pctText(f.lltv, 1)} · Arc`,
  unanswered: "The read of this position did not answer. Try again in a minute.",
  empty: "This wallet holds nothing in this market.",
};

export const CARD_WORDS = {
  heading: "Position summary",
  collateral: "Collateral",
  collateralTip: "What the wallet has posted as collateral in this market.",
  debt: "Debt",
  debtTip: "What the wallet owes the market, with interest to the block read.",
  supplied: "Supplied",
  suppliedTip: "What the wallet has lent to the market, with its interest to the block read.",
  ltv: "LTV",
  ltvTip: "Debt divided by the collateral's value at the market's oracle price. The market liquidates at its LLTV.",
  ltvLine: (lltv: number) => `of ${pctText(lltv, 1)} LLTV`,
  borrowRate: "Borrow rate",
  borrowRateTip: "The market's borrow rate from its rate model, a year, simple. It follows how much of the market is lent out.",
  supplyRate: "Supply rate",
  supplyRateTip: "The borrow rate times the share lent out, less the market's fee: what supply earns, a year, simple.",
  room: "Room to borrow",
  roomTip: "How much more the position can borrow before its LTV reaches the market's LLTV.",
  drop: "Liquidates on a drop of",
  dropTip: "How far the collateral's price, in the loan token, can fall before the LTV reaches the LLTV.",
  interest30: { earned: "Earned, 30 days", owed: "Interest, 30 days" },
  interestTip: "What the market's rate added over the last 30 days, from the market's totals at the two dates.",
  withheld: {
    opened: "opened inside the 30 days",
    changed: "changed inside the 30 days",
    unread: "not read",
  } as Record<"opened" | "changed" | "unread", string>,
  unpriced: "no dollar price",
  noDebt: "no debt",
  foot: (f: ArcMorphoFigures) =>
    f.usd
      ? `Dollar values use the Chainlink ${f.usd.feed.description ?? `${f.loan.symbol} / USD`} feed on Arc; collateral is valued through the market's oracle in ${f.loan.symbol}.`
      : `Arc has no Chainlink feed for ${f.loan.symbol} in Aave's address book, so the figures stay in ${f.loan.symbol}.`,
};

/** The card's (i): what the position is, in plain words. */
export function cardExplainer(f: ArcMorphoPositionFigures): { title: string; bullets: string[] }[] {
  const out: { title: string; bullets: string[] }[] = [];
  const holds: string[] = [];
  if (f.collateral > 0 && f.collateralToken) holds.push(`${amount(f.collateral, f.collateralToken.symbol)} as collateral`);
  if (f.supplied > 0) holds.push(`${amount(f.supplied, f.loan.symbol)} lent to the market`);
  out.push({
    title: "The position",
    bullets: [
      `This wallet holds ${holds.length ? holds.join(" and ") : "nothing"}${f.debt > 0 ? ` and owes ${amount(f.debt, f.loan.symbol)}` : ""} in one Morpho Blue market on Arc.`,
      "A Morpho Blue market lends one token against one collateral token, under one oracle, one rate model and one LLTV, all fixed when the market was created.",
    ],
  });
  if (f.debt > 0 && f.ltv != null)
    out.push({
      title: "Its limit",
      bullets: [
        `Its debt is ${pctText(f.ltv, 1)} of its collateral's value at the market's oracle. The market liquidates at ${pctText(f.lltv, 1)}.`,
      ],
    });
  return out;
}
