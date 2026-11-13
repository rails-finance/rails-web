// A Trove on a shut-down Liquity V2 branch (rails-ops ui-jobs 626): its debt,
// interest and costs stop at the shutdown, and the card says so with the date.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { registerAppResolver } from "../lib/app-resolver.mjs";

registerAppResolver();

const { computeLiquityEconomics, liquityAccrualNow } = await import("../../lib/liquity/economics.ts");
const { troveWords } = await import("../../lib/liquity/event-templates.ts");
const { shutdownDay } = await import("../../lib/shared/liquity-family-shutdown.ts");

const OPENED = 1_760_000_000;
const SHUTDOWN = OPENED + 90 * 86_400;
const LATER = SHUTDOWN + 200 * 86_400;

// A Trove opened with 10 WETH and 10,000 BOLD at 5% a year, nothing after.
const events = [
  {
    timestamp: OPENED,
    context: {
      protocol: "liquity-v2-troves",
      data: {
        operation: "openTrove",
        troveId: "1",
        collateralType: "WETH",
        assetType: "BOLD",
        collateralPrice: 3000,
        isInBatch: false,
        isZombieTrove: false,
        troveOperation: {
          debtChangeFromOperation: 10_000,
          collChangeFromOperation: 10,
          debtIncreaseFromUpfrontFee: 9.5,
        },
        stateAfter: { debt: 10_009.5, coll: 10, annualInterestRate: 5 },
      },
    },
  },
];
const at = (now) => computeLiquityEconomics(events, { collateralType: "WETH", currentPrice: 3000, now });

test("the clock stops at the shutdown, and only after it", () => {
  assert.equal(liquityAccrualNow(LATER, SHUTDOWN), SHUTDOWN);
  assert.equal(liquityAccrualNow(OPENED + 10, SHUTDOWN), OPENED + 10);
  assert.equal(liquityAccrualNow(LATER, null), LATER);
});

test("the economics after a shutdown are the economics at the shutdown", () => {
  const stopped = at(liquityAccrualNow(LATER, SHUTDOWN));
  assert.deepEqual(stopped, at(SHUTDOWN));
  // Not vacuous: without the shutdown the interest goes on.
  assert.notDeepEqual(at(LATER), at(SHUTDOWN));
  assert.ok(stopped.economics.costs.totalInterestPaid >= 0);
});

test("the card's debt sentence names the shutdown and its date", () => {
  const s = troveWords("debt_breakdown_shutdown", { interest: "123.29 BOLD", date: shutdownDay(SHUTDOWN) });
  assert.equal(
    s,
    `The debt includes 123.29 BOLD of interest accrued until the branch shut down on ${shutdownDay(SHUTDOWN)}`,
  );
  assert.doesNotMatch(s, /since the last event/);
  assert.match(troveWords("debt_breakdown", { interest: "1 BOLD" }), /since the last event$/);
});
