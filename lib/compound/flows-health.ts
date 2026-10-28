// Compound V3's source for the Lifetime flows chart's health view (rails-ops
// reference/lifetime-price-chart.md, ruling 15; ui-jobs 328 step 5; the view
// is lib/shared/flows-health.ts).
//
// RULES.
// - A day's health factor is the card's: Σ collateral × price ×
//   liquidateCollateralFactor ÷ debt × base price (liquidation capacity ÷
//   debt, the same ratio in base tokens), each collateral's factor the
//   Comet's at the end of the block of the day's last event
//   (/api/chain/compound/factors-at-block, getAssetInfoByAddress), and at the
//   block of each upgrade in the life that changed a held collateral's factor
//   (lib/shared/collateral-factor-changes.ts). A supplied base backs no debt:
//   it counts 0.
// - Today's factors are the card's read (`liquidateCollateralFactor` per held
//   collateral at head).
// - An asset's level is ruling 7's (`basketLevels`): the card states none per
//   collateral. Today's levels are worked from the card's read (`cardLevels`),
//   so they rest on the balances the card states.
//
// Pure.

import { BASKET_LEVEL_FORMULA, type FactorRead, type HealthLine, type HealthSource } from "@/lib/shared/flows-health";
import { scaleCompoundChainBalance, type CompoundMarketChainResponse } from "@/lib/api/fetch-compound-position";
import { collAsset, DEBT_ASSET, SUPPLY_ASSET } from "@/lib/compound/flows";

const DAY_S = 86_400;

/** One factors-at-block answer as the view's read, keyed as the Comet
 *  timeline keys its assets. */
export function cometFactorRead(
  answer: { block: number; factors: Record<string, { liquidate: number }> },
  timestamp: number,
): FactorRead {
  const lt: Record<string, number> = { [SUPPLY_ASSET]: 0 };
  for (const [token, f] of Object.entries(answer.factors)) lt[collAsset(token.toLowerCase())] = f.liquidate;
  return { day: Math.floor(timestamp / DAY_S), block: answer.block, lt };
}

/** The card's read as today's factors. */
export function cometTodayRead(chain: CompoundMarketChainResponse, now: number): FactorRead {
  const lt: Record<string, number> = { [SUPPLY_ASSET]: 0 };
  for (const c of chain.collateral) lt[collAsset(c.address.toLowerCase())] = c.liquidateCollateralFactor;
  return { day: Math.floor(now / DAY_S), block: chain.blockNumber, lt };
}

/** The card's read as the view's lines, in the Comet's quote unit. */
export function cometCardLines(chain: CompoundMarketChainResponse): HealthLine[] {
  const supply = scaleCompoundChainBalance(chain.supplyBalanceRaw || "0", chain.baseDecimals);
  const borrow = scaleCompoundChainBalance(chain.borrowBalanceRaw || "0", chain.baseDecimals);
  return [
    ...chain.collateral.map((c) => ({
      asset: collAsset(c.address.toLowerCase()),
      coll: scaleCompoundChainBalance(c.balanceRaw, c.decimals),
      debt: 0,
      price: c.price,
      lt: c.liquidateCollateralFactor,
    })),
    { asset: SUPPLY_ASSET, coll: supply, debt: 0, price: chain.basePrice, lt: 0 },
    { asset: DEBT_ASSET, coll: 0, debt: borrow, price: chain.basePrice, lt: 0 },
  ];
}

/** A Comet's source: its oracle and its liquidate factors; `changed` where
 *  an upgrade in the life changed one, read at its block. */
export function cometHealthSource(chain: number, changed = false): HealthSource {
  return {
    oracle: "the Comet's",
    pool: "the Comet",
    chain,
    factor: "liquidate collateral factor",
    factors: ["liquidate factors", "liquidate collateral factors"],
    readAt: changed
      ? "read at the block of each day's last event and of each upgrade that changed one"
      : "read at the block of each day's last event",
    held: "the liquidate collateral factors the Comet held at the end of block {block}",
    live: "the card's read of the Comet now: liquidation capacity ÷ debt, in base tokens",
    levels: {
      formula: BASKET_LEVEL_FORMULA,
      summary:
        "Liquidation level — the asset's price at which the health factor reaches 1, with every other balance and price as they stood on the day and the liquidate collateral factors the Comet held at the day's last read.",
      here: {
        live: "Here at today's balances and prices and the card's health factor.",
        read: "Here at the balances and prices of {day}, against the liquidate collateral factors the Comet held at the end of block {block}.",
      },
    },
    below: "the Comet lets anyone absorb the account",
  };
}
