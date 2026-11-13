// A redemption on a shut-down branch reads on the urgent path (rails-ops
// ui-jobs 619): Liquity V2's generator drops the rate-queue reason and the
// value-for-value sentence on any Trove, open or closed, and a dormant Trove's
// next step is closing only; the forks' modal states the exchange with the
// bonus where the deployment names it, and no ratio direction. The card's debt
// sentence takes its shut-down forms (626). The event below is an rETH Trove's
// redemption at block 25,018,615 as Rails's timeline route serves it.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { registerAppResolver } from "../lib/app-resolver.mjs";

registerAppResolver();

const { liquityEventProse } = await import("../../lib/liquity/event-prose.ts");
const { liquityForkRedemptionContent } = await import("../../lib/shared/learn-more-content.ts");
const { LIQUITY_FAMILY_TERMS } = await import("../../lib/liquity/ltv.ts");
const { liquityDebtBreakdownForm } = await import("../../lib/liquity/economics.ts");

const EVENT = {
  id: "0x8495df1620ec9e617468f39a7721d989240124d9ce66e59195b95a7a23d34fec_52",
  txHash: "0x8495df1620ec9e617468f39a7721d989240124d9ce66e59195b95a7a23d34fec",
  blockNumber: 25018615,
  timestamp: 1777861235,
  wallet: "0xaf87a69642e9c66cae994e2a85f26498a76aa30e",
  protocol: "liquity-v2-troves",
  actionType: "redeemCollateral",
  actionLabel: "Redeem Collateral",
  flows: [
    {
      token: "0xae78736cd615f374d3085123a210448e74fc6393",
      tokenSymbol: "rETH",
      tokenDecimals: 18,
      amount: "195600000000000000",
      amountFormatted: 0.1956,
      direction: "in",
      counterparty: "0xb2b2abeb5c357a234363ff5d180912d319e3e19e",
    },
  ],
  gas: { gasCostEth: 0.000609369246778368, gasCostUsd: 1.4446017980778187 },
  etherscanUrl: "https://etherscan.io/tx/0x8495df1620ec9e617468f39a7721d989240124d9ce66e59195b95a7a23d34fec",
  context: {
    protocol: "liquity-v2-troves",
    data: {
      eventType: "redemption",
      operation: "redeemCollateral",
      troveId: "19392756892012588507808147823032851071198051944268422940534038614966657095964",
      collateralType: "rETH",
      collateralPrice: 2756.272352197282,
      protocolName: "liquity-v2",
      assetType: "BOLD",
      stateBefore: {
        debt: 14279.65,
        coll: 10.4132,
        stake: 10.41,
        annualInterestRate: 1,
        collateralRatio: 200.99692447091732,
        collateralInUsd: 28701.665424120594,
        raw: { debt: "14279654029369737407393", coll: "10413218200748492001", annualInterestRate: "10000000010000000" },
        origin: {
          debt: { event: "TroveUpdated", param: "_debt", scale: 18, raw: "14279654029369737407393" },
          coll: { event: "TroveUpdated", param: "_coll", scale: 18, raw: "10413218200748492001" },
          annualInterestRate: {
            event: "TroveUpdated",
            param: "_annualInterestRate",
            scale: 16,
            raw: "10000000010000000",
          },
        },
      },
      stateAfter: {
        debt: 13734.75,
        coll: 10.2176,
        stake: 10.22,
        annualInterestRate: 1,
        collateralRatio: 205.04537444377584,
        collateralInUsd: 28162.47843645229,
        raw: { debt: "13734754325889237649882", coll: "10217596390284635062", annualInterestRate: "10000000010000000" },
        origin: {
          debt: { event: "TroveUpdated", param: "_debt", scale: 18, raw: "13734754325889237649882" },
          coll: { event: "TroveUpdated", param: "_coll", scale: 18, raw: "10217596390284635062" },
          annualInterestRate: {
            event: "TroveUpdated",
            param: "_annualInterestRate",
            scale: 16,
            raw: "10000000010000000",
          },
        },
      },
      isInBatch: false,
      isZombieTrove: false,
      blockGrouping: { isGrouped: true, sameBlockCount: 2, sameBlockIndex: 2 },
      troveOperation: {
        annualInterestRate: 1,
        debtIncreaseFromRedist: 0,
        debtIncreaseFromUpfrontFee: 0,
        debtChangeFromOperation: -544.9,
        collIncreaseFromRedist: 0,
        collChangeFromOperation: -0.1956,
        raw: {
          annualInterestRate: "10000000010000000",
          debtIncreaseFromRedist: "0",
          debtIncreaseFromUpfrontFee: "0",
          debtChangeFromOperation: "-544899703480499757511",
          collIncreaseFromRedist: "0",
          collChangeFromOperation: "-195621810463856939",
        },
        origin: {
          annualInterestRate: {
            event: "TroveOperation",
            param: "_annualInterestRate",
            scale: 16,
            raw: "10000000010000000",
          },
          debtIncreaseFromRedist: { event: "TroveOperation", param: "_debtIncreaseFromRedist", scale: 18, raw: "0" },
          debtIncreaseFromUpfrontFee: {
            event: "TroveOperation",
            param: "_debtIncreaseFromUpfrontFee",
            scale: 18,
            raw: "0",
          },
          debtChangeFromOperation: {
            event: "TroveOperation",
            param: "_debtChangeFromOperation",
            scale: 18,
            raw: "-544899703480499757511",
          },
          collIncreaseFromRedist: { event: "TroveOperation", param: "_collIncreaseFromRedist", scale: 18, raw: "0" },
          collChangeFromOperation: {
            event: "TroveOperation",
            param: "_collChangeFromOperation",
            scale: 18,
            raw: "-195621810463856939",
          },
        },
      },
      redemption: {
        attemptedBoldAmount: 544.9,
        actualBoldAmount: 544.9,
        ETHSent: 0.2,
        ETHFee: "0.002070573039547006",
        price: 2756.27,
        redemptionPrice: 2756.27,
        redemptionFee: "0.002854183817715831",
      },
      actorRole: "redeemer",
      troveOwner: "0xaf87a69642e9c66cae994e2a85f26498a76aa30e",
    },
  },
};

const ids = (p) => p.L4.map((s) => s.sentence_id ?? s.id);
const prose = (event, shutdownAt) =>
  liquityEventProse({ ctx: event.context.data, event, currentEvent: event, shutdownAt });

test("a closed Trove's redemption after its branch's shutdown reads on the urgent path", () => {
  // The generator takes no Trove status: a closed or liquidated Trove's
  // redemption reads by its time against the branch's shutdown alone.
  const before = prose(EVENT, EVENT.timestamp + 1);
  const after = prose(EVENT, EVENT.timestamp - 1);
  assert.ok(
    ids(before).some((i) => /^redeem\.why_/.test(i)),
    JSON.stringify(ids(before)),
  );
  assert.ok(!ids(after).some((i) => /^redeem\.(why_|result)/.test(i)), JSON.stringify(ids(after)));
  assert.equal(after.L5.content.extraParagraphs, undefined);
  assert.deepEqual(
    after.L5.content.details.map((d) => d.bold),
    ["Branch shutdown"],
  );
});

test("a dormant Trove on a shut-down branch is offered closing only", () => {
  const z = structuredClone(EVENT);
  z.context.data.isZombieTrove = true;
  const urgent = prose(z, z.timestamp);
  assert.ok(ids(urgent).includes("redeem.zombie_low_close"), JSON.stringify(ids(urgent)));
  assert.ok(!ids(urgent).includes("redeem.zombie_low_next"));
  assert.doesNotMatch(urgent.L4.map((s) => s.text).join(" "), /borrow/);
  const ordinary = prose(z, null);
  assert.ok(ids(ordinary).includes("redeem.zombie_low_next"));
});

test("the forks' urgent modal states the bonus where the deployment names it", () => {
  const base = { protocolName: "Ebisu", stablecoin: "ebUSD", minDebt: 2000 };
  const known = liquityForkRedemptionContent({ ...base, terms: LIQUITY_FAMILY_TERMS.ebisu }, true);
  assert.deepEqual(known.steps, [
    "It gives up collateral worth the debt cancelled plus the 2% bonus, at the branch oracle price.",
  ]);
  const terms = { ...LIQUITY_FAMILY_TERMS.asymmetry, shutdownBonus: undefined };
  const unknown = liquityForkRedemptionContent({ ...base, terms }, true);
  assert.deepEqual(unknown.steps, [
    "It gives up collateral worth the debt cancelled plus a bonus, at the branch oracle price.",
  ]);
  assert.doesNotMatch(JSON.stringify([known, unknown]), /rises|falls|RISES|FALLS/);
});

test("the card's debt sentence: open, up to the shutdown, or stopped", () => {
  assert.equal(liquityDebtBreakdownForm(null, 100), "open");
  assert.equal(liquityDebtBreakdownForm(200, 100), "shutdown");
  assert.equal(liquityDebtBreakdownForm(200, 200), "stopped");
  assert.equal(liquityDebtBreakdownForm(200, 300), "stopped");
});
