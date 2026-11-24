// The words of Aave V3's Optimism pages (rails-ops ui-jobs 578): the front door
// and the account card. The card's labels follow Aave V3's position card
// (components/protocol/aave-v3/aave-v3-position-card.tsx) and Aave V4 on Arc's.

import type { OpInterest, OpPositionFigures } from "./position";

export const LABEL = "Aave V3";

const num = (x: number) =>
  x.toLocaleString("en-US", {
    maximumFractionDigits: x >= 1000 ? 0 : x >= 1 ? 4 : 8,
    maximumSignificantDigits: x < 1 ? 4 : undefined,
  });

/** One amount in its unit. */
export const amount = (x: number, unit: string) => `${num(x)} ${unit}`;
export const usd = (x: number) =>
  x !== 0 && Math.abs(x) < 0.01
    ? `${x < 0 ? "−" : ""}<$0.01`
    : x.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: Math.abs(x) >= 1000 ? 0 : 2,
      });
export const pctText = (x: number, digits = 2) => `${(x * 100).toFixed(digits)}%`;
export const hfText = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export const FRONT_DOOR = {
  line: "A wallet's Aave V3 position on Optimism: what it supplies and borrows in dollars at Aave's oracle, its health factor and its interest over the last 30 days.",
  links: { markets: "Market overview" },
};

export const POSITION_PAGE = {
  title: "Aave V3 position",
  sub: "Pool · Optimism",
  unanswered: "The read of this position did not answer. Try again in a minute.",
  empty: "This address supplies and borrows nothing on Aave V3 on Optimism.",
};

export const CARD_WORDS = {
  heading: "Position summary",
  supplied: "Supplied",
  suppliedTip: "What the position has supplied to the Pool, in dollars at Aave's oracle.",
  debt: "Debt",
  debtTip: "What the position owes the Pool, with interest, in dollars at Aave's oracle.",
  health: "Health factor",
  healthTip:
    "Collateral counted at each asset's liquidation threshold, divided by debt, both at Aave's oracle. Below 1 the position can be liquidated.",
  noDebt: "no debt",
  room: "Room to borrow",
  roomTip:
    "How much more the position can borrow in dollars before its collateral's loan-to-value is used up; in E-Mode, the category's loan-to-value.",
  /** A row's label is the symbol, linked to its reserve page, then its side. */
  supplySide: "supplied",
  debtSide: "borrowed",
  reserveHref: (asset: string) => `/optimism/aave-v3/markets/${asset.toLowerCase()}`,
  collateralFlag: "collateral",
  notCollateral: "not collateral",
  reserves: "Reserves",
  columns: { asset: "Asset", amount: "Amount", threshold: "Threshold", rate: "Rate", interest: "Interest, 30 days" },
  thresholdTip:
    "The asset's liquidation threshold, the share of its value the health factor counts; in E-Mode, the category's threshold.",
  rateTip: "The reserve's current supply or borrow rate for a year, as an APR.",
  interestTip:
    "The interest the row earned or paid over the last 30 days, shown where nothing was supplied, withdrawn, borrowed or repaid on it in that time.",
  withheld: {
    opened: "opened inside the window",
    changed: "changed inside the window",
    unread: "not read",
  } as Record<Exclude<OpInterest["state"], "ok">, string>,
  unpriced: "no dollar price",
  emode: (label: string) => `E-Mode: ${label}`,
  foot: "Dollar values use Aave's oracle at the same block.",
};

/** Where the collateral and the debt are one asset, a price move shifts both
 *  sides together and interest is what moves the health factor: one sentence,
 *  else none. */
function priceTogether(p: OpPositionFigures): string[] {
  const collateral = p.supplied.filter((x) => x.isCollateral);
  if (!collateral.length || !p.borrowed.length) return [];
  const both = [...collateral, ...p.borrowed];
  if (new Set(both.map((x) => x.asset.toLowerCase())).size !== 1) return [];
  const earned = collateral.reduce((a, x) => a + (x.suppliedUsd ?? 0) * x.supplyApr, 0);
  const owed = p.borrowed.reduce((a, x) => a + (x.debtUsd ?? 0) * x.borrowApr, 0);
  const which = `Its collateral and debt are both ${collateral[0].symbol}`;
  return [
    owed > earned
      ? `${which}, so a price move changes both sides together, and the interest owed growing faster than the interest earned is what lowers the health factor.`
      : `${which}, so a price move changes both sides together, and interest is what moves the health factor.`,
  ];
}

/** The (i) explanation's groups for one account. */
export function cardExplainer(p: OpPositionFigures): { title: string; bullets: string[] }[] {
  const groups: { title: string; bullets: string[] }[] = [
    {
      title: "What this position holds",
      bullets: [
        p.supplied.length
          ? `It supplies ${p.supplied.map((x) => `${amount(x.supplied, x.symbol)}${x.isCollateral ? " as collateral" : ""}`).join(", ")}.`
          : "It supplies nothing.",
        p.borrowed.length
          ? `It borrows ${p.borrowed.map((x) => amount(x.debt, x.symbol)).join(", ")}.`
          : "It borrows nothing.",
        ...(p.emode
          ? [
              `It is in the ${p.emode.label} E-Mode category, which gives the assets it counts higher thresholds and limits borrowing to the assets it allows.`,
            ]
          : []),
      ],
    },
  ];
  if (p.healthFactor != null)
    groups.push({
      title: "How close it is to liquidation",
      bullets: [
        `Its health factor is ${hfText(p.healthFactor)}: collateral at its liquidation thresholds is ${hfText(p.healthFactor)} times its debt.`,
        "If the health factor falls below 1, anyone can repay part of the debt and take collateral at a bonus.",
        ...priceTogether(p),
      ],
    });
  groups.push({
    title: "Interest over 30 days",
    bullets: [
      "The figure is the interest each row earned or paid over the last 30 days: its amount now less its amount 30 days back.",
      "It is shown only where nothing was added to or taken from the row in that time; a supply, withdrawal, borrow or repay inside the 30 days hides it.",
    ],
  });
  return groups;
}
