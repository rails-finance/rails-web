// The words of Morpho Blue's pages read on visit, Arc's and Optimism's (rails-ops
// ui-jobs 577 and 578): the same sentences with the chain's name. The card's
// labels are the Morpho card's (components/protocol/morpho/morpho-position-card.tsx);
// the interest lines are Aave V4 on Arc's.

import type { MorphoAtBlockFigures, MorphoAtBlockPositionFigures } from "@/lib/morpho-at-block/position";
import type { MorphoAtBlockDeployment } from "@/lib/morpho-at-block/types";
import { lifBonusText, lifText, morphoLif } from "@/lib/morpho/terms";

type Dep = Pick<MorphoAtBlockDeployment, "chain" | "aaveOracle">;

export const LABEL = "Morpho Blue";

const num = (x: number) =>
  x.toLocaleString("en-US", {
    maximumFractionDigits: x >= 1000 ? 0 : x >= 1 ? 4 : 8,
    maximumSignificantDigits: x < 1 ? 4 : undefined,
  });

/** "USDC / cirBTC", the loan asset first as the docs write a market, or the
 *  loan asset alone on a market with no collateral. */
export const pairName = (f: Pick<MorphoAtBlockFigures, "collateralToken" | "loan">) =>
  f.collateralToken ? `${f.loan.symbol} / ${f.collateralToken.symbol}` : `${f.loan.symbol}, no collateral`;

export const amount = (x: number, unit: string) => `${num(x)} ${unit}`;
export const usd = (x: number) =>
  `$${x.toLocaleString("en-US", { maximumFractionDigits: x >= 100 ? 0 : 2, minimumFractionDigits: x >= 100 ? 0 : 2 })}`;
export const pctText = (x: number, digits = 2) => `${(x * 100).toFixed(digits)}%`;

export const frontDoorWords = ({ chain }: Dep) => ({
  /** Arc's door line; Optimism's door has none (ui-jobs 578). */
  line: `A wallet's Morpho Blue positions on ${chain}, each with its collateral, debt and health factor, in dollars where ${chain} has a price feed for the loan asset, and its interest over the last 30 days.`,
  links: { markets: "Markets" },
  heading: "Morpho Blue positions",
  none: `This address holds no Morpho Blue position on ${chain}.`,
  unanswered: "The read of this wallet's positions did not answer. Try again in a minute.",
  rowSub: (f: MorphoAtBlockFigures) => `LLTV ${pctText(f.lltv, 1)}`,
  read: (n: number) => `Read across all ${n.toLocaleString("en-US")} markets on ${chain}.`,
});

export const positionPageWords = ({ chain }: Dep) => ({
  title: (f: MorphoAtBlockFigures) => `${pairName(f)} · Morpho Blue`,
  sub: (f: MorphoAtBlockFigures) => `LLTV ${pctText(f.lltv, 1)} · ${chain}`,
  unanswered: "The read of this position did not answer. Try again in a minute.",
  empty: "This wallet holds nothing in this market.",
  notIndexed: `Not indexed yet on ${chain}: this position's history and liquidations arrive when Rails indexes Morpho Blue there.`,
});

/** The card's foot: which read prices the loan token in dollars. */
export function dollarFoot(f: Pick<MorphoAtBlockFigures, "usd" | "loan">, { chain, aaveOracle }: Dep): string {
  const L = f.loan.symbol;
  if (f.usd?.feed.source === "aave-oracle")
    return `Dollar values use Aave V3's oracle on ${chain} for ${L}; collateral is valued through the market's oracle in ${L}.`;
  if (f.usd)
    return `Dollar values use the Chainlink ${f.usd.feed.description ?? `${L} / USD`} feed on ${chain}; collateral is valued through the market's oracle in ${L}.`;
  return aaveOracle
    ? `${chain} has no Chainlink feed for ${L} in Aave's address book and Aave V3's oracle there does not price it, so the figures stay in ${L}.`
    : `${chain} has no Chainlink feed for ${L} in Aave's address book, so the figures stay in ${L}.`;
}

export const CARD_WORDS = {
  heading: "Position summary",
  collateral: "Collateral",
  collateralTip: "What the wallet has posted as collateral in this market.",
  debt: "Debt",
  debtTip: "What the wallet owes the market, with interest to the block read.",
  supplied: "Supplied",
  suppliedTip: "What the wallet has lent to the market, with its interest to the block read.",
  ltv: "LTV",
  ltvTip: "The debt as a share of the collateral's value at the market's oracle.",
  /** The health factor's tip with who liquidates (the other Morpho cards keep
   *  lib/morpho/terms HEALTH_FACTOR_TIP). */
  healthTip:
    "The collateral's value at the market's oracle times the LLTV, over the debt. Above 1 the position is healthy; below 1 anyone can liquidate it.",
  borrowRate: "Borrow APY",
  borrowRateTip:
    "The market's borrow rate from its rate model, compounded over a year. It follows how much of the market is lent out.",
  supplyRate: "Supply APY",
  supplyRateTip:
    "The borrow rate times the share lent out, less the market's fee, compounded over a year: what supply earns.",
  room: "Room to borrow",
  roomTip: "How much more the position can borrow before its LTV reaches the market's LLTV.",
  drop: "Liquidates on a drop of",
  dropTip: "How far the collateral's price, in the loan asset, can fall before the LTV reaches the LLTV.",
  interest30: { earned: "Earned, 30 days", owed: "Interest, 30 days" },
  interestTip: {
    earned:
      "The interest the position earned over the last 30 days, shown where nothing was supplied or withdrawn in that time.",
    owed: "The interest the position paid over the last 30 days, shown where nothing was borrowed or repaid in that time.",
  },
  withheld: {
    opened: "opened inside the window",
    changed: "changed inside the window",
    unread: "not read",
  } as Record<"opened" | "changed" | "unread", string>,
  unpriced: "no dollar price",
  noDebt: "no debt",
};

/** The card's (i): what the position is, in plain words. */
export function cardExplainer(f: MorphoAtBlockPositionFigures, { chain }: Dep): { title: string; bullets: string[] }[] {
  const out: { title: string; bullets: string[] }[] = [];
  const holds: string[] = [];
  if (f.collateral > 0 && f.collateralToken)
    holds.push(`${amount(f.collateral, f.collateralToken.symbol)} as collateral`);
  if (f.supplied > 0) holds.push(`${amount(f.supplied, f.loan.symbol)} lent to the market`);
  out.push({
    title: "The position",
    bullets: [
      `This wallet holds ${holds.length ? holds.join(" and ") : "nothing"}${f.debt > 0 ? ` and owes ${amount(f.debt, f.loan.symbol)}` : ""} in one Morpho Blue market on ${chain}.`,
      "A Morpho Blue market lends one token against one collateral token, under one oracle, one rate model and one LLTV, all fixed when the market was created.",
    ],
  });
  if (f.debt > 0 && f.ltv != null)
    out.push({
      title: "Its limit",
      bullets: [
        `Its debt is ${pctText(f.ltv, 1)} of its collateral's value at the market's oracle. The market liquidates at ${pctText(f.lltv, 1)}.`,
        `If the health factor falls below 1, anyone can liquidate it: the liquidator repays some or all of the debt and takes collateral worth the repaid debt times the market's Liquidation Incentive Factor, ${lifText(morphoLif(f.lltv))}, a ${lifBonusText(morphoLif(f.lltv))}.`,
        f.usd
          ? `The health factor and liquidation use the market's oracle, which prices the collateral in ${f.loan.symbol}; the dollar figures are for reading only.`
          : `The health factor and liquidation use the market's oracle, which prices the collateral in ${f.loan.symbol}.`,
      ],
    });
  return out;
}

/** The markets pages' lines on the markets they leave out and on the idle market (the manager's
 *  ruling, 11 Nov 2026). */
export const MARKET_LIST_WORDS = {
  unlisted: (test: number, never: number) => {
    const parts = [
      ...(test ? [`${test} that ${test === 1 ? "lends a test token" : "lend test tokens"}`] : []),
      ...(never ? [`${never} that ${never === 1 ? "has" : "have"} never been supplied`] : []),
    ];
    return parts.length ? `Not listed here: ${parts.join(" and ")}. Each keeps its own page.` : null;
  },
  idle: "The idle market names no loan asset, collateral, oracle or rate model, so nothing can be borrowed from it.",
  /** An idle market that lends a token (Optimism's USDC one). */
  idleLends: (loan: string) =>
    `The idle ${loan} market names no collateral, oracle or rate model, so nothing can be borrowed from it.`,
  idleLink: "Its page",
  /** The roster head's word for the listed markets holding no supply. */
  emptyNow: "empty now",
  /** The roster explainer's words after that count. */
  emptyNowWords: { one: "is empty now", many: "are empty now" },
  page: {
    "test-token": "This market isn't listed on the markets page: it lends a test token (ERC20Mock, E20M).",
    "never-funded": "This market isn't listed on the markets page: nothing has ever been supplied to it.",
  } as Record<"test-token" | "never-funded", string>,
  idlePage:
    "This is the idle market: it names no loan asset, collateral, oracle or rate model, so nothing can be supplied or borrowed in it.",
  idleLendsPage: (loan: string) =>
    `This is an idle ${loan} market: it names no collateral, oracle or rate model, so ${loan} supplied here earns nothing and nothing can be borrowed.`,
};
