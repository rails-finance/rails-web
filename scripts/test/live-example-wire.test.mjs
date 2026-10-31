// The home hero's event history round-trips through its wire rows unchanged.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { packLiveExample, unpackLiveExample } from "../../lib/home/live-example-wire.ts";

const tower = (id, tx, extra = {}) => ({
  id,
  txHash: tx,
  blockNumber: 100,
  timestamp: 1000,
  gas: { gasCostEth: 0.002, gasCostUsd: 9.5 },
  context: {
    protocol: "liquity-v2-troves",
    data: {
      operation: "redeemCollateral",
      troveId: "7",
      collateralType: "WETH",
      collateralPrice: 4468.7,
      assetType: "BOLD",
      isInBatch: true,
      isZombieTrove: false,
      stateAfter: { coll: 1.5, debt: 2.25, annualInterestRate: 1.71, raw: { debt: "2250000000000000000" } },
      troveOperation: { collChangeFromOperation: -0.25, debtChangeFromOperation: -1.1, debtIncreaseFromUpfrontFee: 0 },
      redemption: { redemptionFee: "0.0019" },
      ...extra,
    },
  },
});
const flow = (id, extra = {}) => ({
  id,
  ts: 1000,
  block: 100,
  tx: "0xaa",
  kind: "redemption",
  collAfter: 1.5,
  debtAfter: 2.25,
  collOp: -0.25,
  debtOp: -1.1,
  upfrontFee: 0,
  collFromRedist: 0,
  debtFromRedist: 0,
  surplus: 0,
  price: 4468.7,
  rate: 1.71,
  fee: 0.1,
  ...extra,
});

test("packed rows unpack to the same events", () => {
  const towerEvents = [
    tower("0xaa_1", "0xaa"),
    tower("other-id", "0xbb", {
      operation: "setBatchManagerAnnualInterestRate",
      stateBefore: { debt: 2, annualInterestRate: 1, raw: { debt: "2000000000000000000" } },
      troveOperation: undefined,
      redemption: undefined,
      batchUpdate: { annualManagementFee: 0.5, interestBatchManager: "0xcc" },
    }),
  ];
  const flowEvents = [
    flow("0xaa_1", { collBefore: 2, debtBefore: 3, redemptionPrice: 4468.72 }),
    flow("other-id", { kind: "other", tx: "0xbb", collOp: null, debtOp: null, price: null, rateBy: "delegate" }),
  ];
  const data = { trove: {}, debtInFront: null, trovesAhead: null, rowEvents: [], dailyObs: null, totalEvents: 2 };
  const wire = JSON.parse(JSON.stringify(packLiveExample({ ...data, towerEvents, flowEvents })));
  const back = unpackLiveExample(wire);
  const plain = (x) => JSON.parse(JSON.stringify(x));
  assert.deepEqual(plain(back.towerEvents), plain(towerEvents));
  assert.deepEqual(plain(back.flowEvents), plain(flowEvents));
});
