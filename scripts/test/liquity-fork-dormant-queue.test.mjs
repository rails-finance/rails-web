// The fork redemption queue takes the branch's lastZombieTroveId first, while it has debt, and no
// other dormant (Zombie) Trove (liquity/bold TroveManager.redeemCollateral). Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { settleBranch, settleTrove } from "../../lib/sources/chain/liquity-fork-settle.ts";

const E18 = 10n ** 18n;
const b = {
  key: "weth",
  symbol: "WETH",
  decimals: 18,
  mcr: 1.1,
  ccr: 1.5,
  scr: 1.1,
  troveManager: "0x1",
  priceFeed: "0x2",
  sortedTroves: "0x3",
};
const cfg = { protocol: "ebisu", debtSymbol: "ebUSD", branches: { weth: b } };

// Two listed Troves (A at 1%, B at 2%), and two dormant ones with debt: Z1 holds the pointer, Z2
// took its debt from a redistribution.
const A = 101n,
  B = 102n,
  Z1 = 201n,
  Z2 = 202n;
const TROVES = {
  [A]: { debt: 5000n, rate: 1n, status: 1 },
  [B]: { debt: 3000n, rate: 2n, status: 1 },
  [Z1]: { debt: 800n, rate: 0n, status: 4 },
  [Z2]: { debt: 1200n, rate: 0n, status: 4 },
};
const data = (id) =>
  TROVES[id] && {
    entireDebt: TROVES[id].debt * E18,
    entireColl: 2n * E18,
    annualInterestRate: TROVES[id].rate * 10n ** 16n,
  };

function branch(lastZombieId) {
  return settleBranch(
    b,
    {
      fetched: [3000n * E18, false],
      lastGood: 3000n * E18,
      branchDebtRaw: 10000n * E18,
      branchCollRaw: 10n * E18,
      idsCount: 4n,
      listSize: 2n,
      listed: [A, B],
      allIds: [A, B, Z1, Z2],
      dataOf: (id) => data(id) ?? null,
      statusOf: (id) => TROVES[id]?.status ?? null,
      lastZombieId,
    },
    120,
  );
}

test("the pointer leads the queue, the other dormant Trove is outside it", () => {
  const s = branch(Z1);
  assert.deepEqual(
    s.queue.map((e) => [e.troveId, e.debtInFront]),
    [
      ["201", 0],
      ["101", 800],
      ["102", 5800],
    ],
  );
  assert.equal(s.zombieCount, 2);
});

test("with no pointer no dormant Trove is in the queue", () => {
  const s = branch(0n);
  assert.deepEqual(
    s.queue.map((e) => [e.troveId, e.debtInFront]),
    [
      ["101", 0],
      ["102", 5000],
    ],
  );
});

function trove(id, lastZombieId) {
  return settleTrove(cfg, b, String(id), {
    blockNumber: 1,
    fetched: [3000n * E18, false],
    lastGood: 3000n * E18,
    data: {
      entireDebt: TROVES[id].debt * E18,
      entireColl: 2n * E18,
      redistBoldDebtGain: 0n,
      redistCollGain: 0n,
      accruedInterest: 0n,
      recordedDebt: TROVES[id].debt * E18,
      annualInterestRate: TROVES[id].rate * 10n ** 16n,
      accruedBatchManagementFee: 0n,
    },
    statusNum: TROVES[id].status,
    branchDebtRaw: 10000n * E18,
    branchCollRaw: 10n * E18,
    icrRaw: 2n * E18,
    walk: [B, A],
    entireDebtOf: (x) => (TROVES[x] ? TROVES[x].debt * E18 : null),
    lastZombieId,
  });
}

test("a listed Trove counts the pointer's debt in front", () => {
  const t = trove(B, Z1);
  assert.equal(t.debtInFront, 5800);
  assert.equal(t.trovesAhead, 2);
});

test("the pointer is redeemed first; another dormant Trove is out of every redemption", () => {
  const z1 = trove(Z1, Z1);
  assert.equal(z1.redeemedFirst, true);
  assert.equal(z1.debtInFront, 0);
  const z2 = trove(Z2, Z1);
  assert.equal(z2.redeemedFirst, false);
  assert.equal(z2.debtInFront, null);
});
