// The spines scripts/test/spine-amount-link.test.mjs renders: three
// families' rows with no `amountLink` (a Liquity V2 adjust, an Aave
// withdraw with a unit, a touch glyph), whose markup was captured from the
// spine before ui-jobs 872 into scripts/fixtures/spine-amount-link/.
export const CASES = {
  liquityAdjust: {
    isLast: false,
    tokens: [
      { symbol: "WETH", address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", direction: "right", value: 2.5 },
      { symbol: "BOLD", direction: "left", value: 4200, popover: true },
    ],
  },
  aaveWithdraw: {
    isLast: true,
    tokens: [{ symbol: "USDC", direction: "left", value: 1234.5678, display: "1,234.57", unit: "USDC" }],
  },
  touch: { icon: "touch", isLast: true },
};
