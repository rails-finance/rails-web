// Moonwell's "Supplied" headline sums every supplied market, entered or not;
// the collateral figure sums the entered ones (lib/moonwell/supply-totals.ts).
// rails-ops ui-jobs 644. Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { isEnteredIn, suppliedUsd } from "../../lib/moonwell/supply-totals.ts";

const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const WETH = "0x4200000000000000000000000000000000000006";
const prices = { [USDC]: 1, [WETH]: 2500 };
// $1,000 of entered USDC and $500 of WETH the account never entered.
const supplies = [
  { address: USDC, current: 1000, principal: 990 },
  { address: WETH, current: 0.2, principal: 0.2 },
];
const entered = [{ underlying: USDC }];

test("Supplied counts the un-entered supply; the collateral figure does not", () => {
  assert.equal(suppliedUsd(supplies, prices), 1500);
  assert.equal(
    suppliedUsd(
      supplies.filter((r) => isEnteredIn(entered, r.address)),
      prices,
    ),
    1000,
  );
});

test("an unpriced supply leaves no partial total", () => {
  assert.equal(suppliedUsd(supplies, { [USDC]: 1 }), null);
});

test("no entered list read counts every market as entered", () => {
  assert.equal(isEnteredIn(undefined, WETH), true);
  assert.equal(isEnteredIn(undefined, USDC), true);
});

test("the principal stands in where no current value was read; nothing supplied is null", () => {
  assert.equal(suppliedUsd([{ address: USDC, current: null, principal: 990 }], prices), 990);
  assert.equal(suppliedUsd([], prices), null);
});
