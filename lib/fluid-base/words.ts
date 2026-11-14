// The words of Fluid's Base pages (rails-ops ui-jobs 574). The card's labels
// and tips are the Ethereum card's (components/protocol/fluid/fluid-position-card.tsx);
// the interest lines and the read-on-visit words are new.

import type { FluidBasePosition } from "@/lib/fluid-base/position";
import type { FluidBasePositionsRead } from "@/lib/fluid-base/types";

export const LABEL = "Fluid";

const num = (x: number) =>
  x.toLocaleString("en-US", {
    maximumFractionDigits: x >= 1000 ? 0 : x >= 1 ? 4 : 8,
    maximumSignificantDigits: x < 1 ? 4 : undefined,
  });

export const FRONT_DOOR = {
  line: "A wallet's Fluid vault positions on Base, each with its collateral, debt, ratio to the vault's limits and interest over the last 30 days.",
  heading: "Fluid positions",
  none: "This address holds no Fluid vault position with collateral or debt in it.",
  truncated: "This wallet holds more than 200 positions; Rails read the newest 200.",
  unanswered: "The read of this wallet's positions did not answer. Try again in a minute.",
  row: (p: FluidBasePositionsRead["positions"][number]) =>
    `#${p.id} · ${p.supplyLeg.kind === "shares" ? `${p.supplyLeg.token.symbol}·${p.supplyLeg.token1?.symbol} shares` : p.supplyLeg.token.symbol} / ${p.borrowLeg.kind === "shares" ? `${p.borrowLeg.token.symbol}·${p.borrowLeg.token1?.symbol} shares` : p.borrowLeg.token.symbol}`,
  rowSub: (p: FluidBasePositionsRead["positions"][number]) =>
    `Vault ${p.vaultId}${p.isLiquidated ? " · liquidated" : ""}`,
  empty: (n: number) => `${n.toLocaleString("en-US")} more ${n === 1 ? "position holds" : "positions hold"} nothing.`,
};

export const POSITION_PAGE = {
  title: (p: FluidBasePosition) => `${p.colUnit} / ${p.debtUnit} · Fluid · position #${p.id}`,
  sub: (p: FluidBasePosition, vaultId: number) => `Vault ${vaultId} · Base`,
  unanswered: "The read of this position did not answer. Try again in a minute.",
};

export const CARD_WORDS = {
  heading: "Position summary",
  ratio: "Debt to collateral ratio",
  ratioTip:
    "Debt divided by collateral at the vault oracle's liquidate price, the figure Fluid's liquidation engine compares with the vault's risk lines.",
  borrowRate: "Borrow rate",
  borrowRateTip: "The vault's current borrow rate, annual. It floats with how heavily the vault is used.",
  room: "Room to borrow",
  roomTip:
    "How much more debt the position can take before it reaches the vault's collateral factor, where Fluid stops lending.",
  threshold: "Liquidation threshold",
  thresholdTip: "The ratio above which Fluid can liquidate the position.",
  interestCol: "Interest earned, 30 days",
  interestDebt: "Interest owed, 30 days",
  interestTip:
    "What the vault's rates added to this side over the last 30 days, from the vault's exchange prices at the two dates.",
  interestOpened: "Opened inside the 30 days, so Rails does not state its interest yet.",
  interestChanged: "Its collateral or debt changed inside the 30 days, so Rails does not state its interest yet.",
  unpriced: "no dollar price",
  foot: "Dollar values use Aave V3's price on Base. Fluid prices collateral in the debt token.",
  /** The panel cell where no interest is stated; the (i) says why. */
  interestOpenedShort: "Opened inside the 30 days",
  interestChangedShort: "Changed inside the 30 days",
};

/** One amount in its unit. */
export const amount = (x: number, unit: string) => `${num(x)} ${unit}`;
export const usd = (x: number) =>
  `$${x.toLocaleString("en-US", { maximumFractionDigits: x >= 100 ? 0 : 2, minimumFractionDigits: x >= 100 ? 0 : 2 })}`;

/** The card's (i): what the position is, in plain words. */
export function cardExplainer(p: FluidBasePosition): { title: string; bullets: string[] }[] {
  const out: { title: string; bullets: string[] }[] = [
    {
      title: "The position",
      bullets: [
        `This position holds ${amount(p.supply, p.colUnit)} as collateral${p.hasDebt ? ` and owes ${amount(p.borrow, p.debtUnit)}` : " and owes nothing"}, in one Fluid vault.`,
        "A Fluid position is an NFT, so it can move between wallets; its owner can add or take out collateral and borrow or repay.",
      ],
    },
  ];
  if (p.hasDebt && p.ratio != null)
    out.push({
      title: "Its limits",
      bullets: [
        `Its debt is ${(p.ratio * 100).toFixed(1)}% of its collateral's value at the vault's oracle price. Fluid lends up to ${(p.collateralFactor * 100).toFixed(0)}% and can liquidate above ${(p.liquidationThreshold * 100).toFixed(0)}%.`,
        "The vault's oracle prices the collateral in the debt token, so the ratio moves with the price between the two tokens.",
      ],
    });
  out.push({
    title: "Interest",
    bullets: [
      p.interest.state === "ok"
        ? `Over the last 30 days the collateral earned ${amount(p.interest.supply, p.colUnit)} and the debt grew by ${amount(p.interest.borrow, p.debtUnit)}.`
        : p.interest.state === "opened"
          ? CARD_WORDS.interestOpened
          : CARD_WORDS.interestChanged,
    ],
  });
  return out;
}
