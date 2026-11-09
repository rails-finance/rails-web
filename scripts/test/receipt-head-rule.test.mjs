// The head rule of check:receipts (ui-jobs 545), on the 16 summaries rails-web 82ed2d01 fixed by hand:
// each fixed form passes, each form before the fix fails. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { headColon, literalRuns } from "../summary-literals.mjs";

const FIXED_IN_82ED2D01 = [
  {
    file: "components/protocol/aave-v3/aave-v3-position-state.tsx",
    before:
      "Health factor at the moment of the liquidation: the account's balances before the call, valued at the ${brand} oracle's prices in the liquidation's block, each collateral counted up to its liquidation threshold, divided by the debt. The liquidation ran at these prices.${endOfPrevious != null ? ` At the end of the block before, at that block's prices, the factor was ${hfLabelV3(endOfPrevious)}.` : \"\"}",
    after:
      "Health factor at the moment of the liquidation. The account's balances before the call, valued at the ${brand} oracle's prices in the liquidation's block, each collateral counted up to its liquidation threshold, divided by the debt. The liquidation ran at these prices.${endOfPrevious != null ? ` At the end of the block before, at that block's prices, the factor was ${hfLabelV3(endOfPrevious)}.` : \"\"}",
  },
  {
    file: "components/protocol/aave-v3/aave-v3-position-state.tsx",
    before:
      "Loan-to-value at the moment of the liquidation: the account's debt before the call divided by its collateral before the call, both valued at the ${brand} oracle's prices in the liquidation's block.${endOfPrevious != null ? ` At the end of the block before, at that block's prices, it was ${(endOfPrevious * 100).toFixed(2)}%.` : \"\"}",
    after:
      "Loan-to-value at the moment of the liquidation. The account's debt before the call divided by its collateral before the call, both valued at the ${brand} oracle's prices in the liquidation's block.${endOfPrevious != null ? ` At the end of the block before, at that block's prices, it was ${(endOfPrevious * 100).toFixed(2)}%.` : \"\"}",
  },
  {
    file: "components/protocol/aave-v4/aave-v4-tower-chart.tsx",
    before:
      "${symbol} outflow value in USD: each event's amount at the price stored for its block, added up. The figure stays at what the tokens were worth as they left.",
    after:
      "${symbol} outflow value in USD. Each event's amount at the price stored for its block, added up. The figure stays at what the tokens were worth as they left.",
  },
  {
    file: "components/protocol/fluid/fluid-sheet.tsx",
    before:
      "Collateral can fall: how far the ${colSym} price in ${debtSym} can fall before the position ratio after this event reaches the vault's liquidation threshold; one less the ratio over the threshold. The threshold is the vault's configuration as the page reads it at the latest block.",
    after:
      "Collateral can fall. How far the ${colSym} price in ${debtSym} can fall before the position ratio after this event reaches the vault's liquidation threshold; one less the ratio over the threshold. The threshold is the vault's configuration as the page reads it at the latest block.",
  },
  {
    file: "components/protocol/fluid/fluid-sheet.tsx",
    before:
      "Still borrowable: the ${colSym} collateral after this event times the vault oracle's price at this block and the vault's collateral factor, less the ${debtSym} debt: what an operation could borrow before the vault refuses it. The collateral factor is the vault's configuration as the page reads it at the latest block.",
    after:
      "Still borrowable. The ${colSym} collateral after this event times the vault oracle's price at this block and the vault's collateral factor, less the ${debtSym} debt: what an operation could borrow before the vault refuses it. The collateral factor is the vault's configuration as the page reads it at the latest block.",
  },
  {
    file: "components/protocol/liquity-family/liquity-position-card.tsx",
    before:
      'Collateral ratio: the Trove\'s replayed collateral × the ${symbol} branch\'s PriceFeed price${stale ? " (lastGoodPrice: the live fetch failed, so it may lag)" : " (fetchPrice simulated at head)"} ÷ its ${cfg.debtSymbol} debt. The same formula the TroveManager\'s getCurrentICR computes (identity verified BigInt-exact); the branch liquidates below its MCR.',
    after:
      'Collateral ratio. The Trove\'s replayed collateral × the ${symbol} branch\'s PriceFeed price${stale ? " (lastGoodPrice: the live fetch failed, so it may lag)" : " (fetchPrice simulated at head)"} ÷ its ${cfg.debtSymbol} debt. The same formula the TroveManager\'s getCurrentICR computes (identity verified BigInt-exact); the branch liquidates below its MCR.',
  },
  {
    file: "components/protocol/liquity/liquity-cells.tsx",
    before:
      "Trove debt (${debtSym}) after this event: this trove is in a delegate's batch, so the contract logs the trove's share of the batch and the batch's total debt. The trove's debt is that share of the total, including interest and any upfront fee.",
    after:
      "Trove debt (${debtSym}) after this event. This trove is in a delegate's batch, so the contract logs the trove's share of the batch and the batch's total debt. The trove's debt is that share of the total, including interest and any upfront fee.",
  },
  {
    file: "components/protocol/liquity/liquity-cells.tsx",
    before:
      "Trove debt (${debtSym}) after this event: every time a trove changes, the TroveManager contract writes the trove's full debt into its log. This is that figure after this event, including the interest built up since the last change and any upfront fee.",
    after:
      "Trove debt (${debtSym}) after this event. Every time a trove changes, the TroveManager contract writes the trove's full debt into its log. This is that figure after this event, including the interest built up since the last change and any upfront fee.",
  },
  {
    file: "components/protocol/liquity/liquity-cells.tsx",
    before:
      "Debt (${debtSym}) before this event: the debt the trove's previous event recorded. This event logs only the debt after, so it is that less this event's move: the operation, any upfront fee and the ${accrualNoun(accrual)} accrued since the previous event.",
    after:
      "Debt (${debtSym}) before this event. The debt the trove's previous event recorded. This event logs only the debt after, so it is that less this event's move: the operation, any upfront fee and the ${accrualNoun(accrual)} accrued since the previous event.",
  },
  {
    file: "components/protocol/liquity/liquity-cells.tsx",
    before:
      "Market move: the change in the ${sym} price from the previous event to this one, on the ${sym} the Trove held between them. No ${sym} moved.",
    after:
      "Market move. The change in the ${sym} price from the previous event to this one, on the ${sym} the Trove held between them. No ${sym} moved.",
  },
  {
    file: "components/protocol/llamalend/llamalend-sheet.tsx",
    before:
      "${what}, in ${b}: the collateral at the market's AMM oracle price (price_oracle, ${b} per collateral) at this block, plus any ${b} the AMM holds. This market borrows ${b}, so its figures stay in ${b}.",
    after:
      "${what}, in ${b}. The collateral at the market's AMM oracle price (price_oracle, ${b} per collateral) at this block, plus any ${b} the AMM holds. This market borrows ${b}, so its figures stay in ${b}.",
  },
  {
    file: "components/protocol/morpho/morpho-arbitrum-usd-line.tsx",
    before:
      "${what} in dollars: each held market's figure in its loan token, read from the singleton at block ${block}, times the loan token's price on the Aave V3 Arbitrum oracle at that block, summed over the markets that oracle prices. Morpho Blue states no dollar price.",
    after:
      "${what} in dollars. Each held market's figure in its loan token, read from the singleton at block ${block}, times the loan token's price on the Aave V3 Arbitrum oracle at that block, summed over the markets that oracle prices. Morpho Blue states no dollar price.",
  },
  {
    file: "components/protocol/polaris/polaris-sheet.ts",
    before:
      "The market's minimum collateral ratio in normal mode: the cdpManager's \\`${mcr.fn}\\`, ${mcr.label}. A constant of the deployment; a defensive-mode minimum (150%) in force at a past block is not indexed, so every row compares against this one.",
    after:
      "The market's minimum collateral ratio in normal mode. The cdpManager's \\`${mcr.fn}\\`, ${mcr.label}. A constant of the deployment; a defensive-mode minimum (150%) in force at a past block is not indexed, so every row compares against this one.",
  },
  {
    file: "components/protocol/polaris/polaris-since-last-touch.tsx",
    before:
      "The pETH pending since the last touch: the position's net PSM collateral share and its pETH reward, two view calls on the cdpManager ${atHead}. The next touch writes them into the collateral.",
    after:
      "The pETH pending since the last touch. The position's net PSM collateral share and its pETH reward, two view calls on the cdpManager ${atHead}. The next touch writes them into the collateral.",
  },
  {
    file: "components/protocol/polaris/polaris-since-last-touch.tsx",
    before:
      "The debt pending since the last touch: interest charged, less the stability gain, with the net PSM debt share, view calls on the cdpManager ${atHead}. The next touch writes them into the debt.",
    after:
      "The debt pending since the last touch. Interest charged, less the stability gain, with the net PSM debt share, view calls on the cdpManager ${atHead}. The next touch writes them into the debt.",
  },
  {
    file: "lib/shared/liquity-fork-live-provenance.ts",
    before:
      "A zombie trove (status 4 on the ${sym} branch's TroveManager): a partial redemption left it below the branch minimum debt, so the protocol removed it from SortedTroves. While it still carries debt it is redeemed BEFORE everything in the list, so a debt-bearing zombie leads the queue here; one redeemed to zero debt keeps its collateral on the branch but stands outside every redemption path. Found through the TroveManager's trove-ids array (it enumerates every trove the branch has, listed or not), because a walk of the sorted list alone cannot see it.",
    after:
      "A zombie trove (status 4 on the ${sym} branch's TroveManager). A partial redemption left it below the branch minimum debt, so the protocol removed it from SortedTroves. While it still carries debt it is redeemed BEFORE everything in the list, so a debt-bearing zombie leads the queue here; one redeemed to zero debt keeps its collateral on the branch but stands outside every redemption path. Found through the TroveManager's trove-ids array (it enumerates every trove the branch has, listed or not), because a walk of the sorted list alone cannot see it.",
  },
];

for (const { file, before, after } of FIXED_IN_82ED2D01) {
  test(`head rule: ${file}, ${after.slice(0, 40)}`, () => {
    assert.equal(headColon(after), null);
    assert.notEqual(headColon(before), null);
  });
}

test("head rule: a colon before a figure, a one-word value or inside parentheses stays", () => {
  assert.equal(headColon("The branch's MCR: 110%. Below it a trove can be liquidated."), null);
  assert.equal(
    headColon("The loan's state before this event: running. A repayment is accepted only while it runs."),
    null,
  );
  assert.equal(headColon("Collateral (v1.1: the old field) after this event. The terms' collateral."), null);
});

test("literalRuns: both ternary arms lead, a joined tail does not", () => {
  const src = 'a ? "Head one. Body." : `Head two: x. ${y}` + (z ? " tail: it runs." : ""),';
  const runs = literalRuns(src, 0);
  assert.deepEqual(
    runs.filter((r) => r.lead).map((r) => r.text),
    ["Head one. Body.", "Head two: x. ${y}"],
  );
});
