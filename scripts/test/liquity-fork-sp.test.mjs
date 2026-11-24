// The Liquity V2 forks: a deposit answer scaled to 1e18 where a branch is 8
// decimals (lib/liquity-v2/sp-decimals.ts; rails-ops
// TO-DO-stability-pool-deposits §3). Imports through `@/` resolve as in
// liquity-v1-holder-strip.test.mjs.
// Run: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = pathToFileURL(REPO + "/").href;
const hook = `
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const ROOT = ${JSON.stringify(ROOT)};
export async function resolve(spec, ctx, next) {
  let url = null;
  if (spec.startsWith("@/")) url = ROOT + spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) url = new URL(spec, ctx.parentURL).href;
  if (url) {
    if (!/\\.[a-z]+$/.test(url)) {
      for (const ext of [".ts", ".tsx", "/index.ts"]) {
        if (existsSync(fileURLToPath(url + ext))) { url += ext; break; }
      }
    }
    return next(url, ctx);
  }
  return next(spec, ctx);
}
`;
register("data:text/javascript," + encodeURIComponent(hook));

const { toE18, priceToE18, scaleSpAnswer } = await import(ROOT + "lib/liquity-v2/sp-decimals.ts");
const { depositNow, depositLifetime } = await import(ROOT + "lib/liquity-v2/sp-math.ts");

const E18 = "000000000000000000";

test("toE18 scales an 8-decimal amount and leaves 18 and zero alone", () => {
  assert.equal(toE18("123456789", 8), "1234567890000000000");
  assert.equal(toE18("-5", 8), "-50000000000");
  assert.equal(toE18("0", 8), "0");
  assert.equal(toE18("42", 18), "42");
  assert.equal(toE18(null, 8), null);
});

test("priceToE18 turns a 1e(36 − 8) price into 1e18", () => {
  // $100,000 per WBTC at the PriceFeed's 1e28 scale.
  assert.equal(priceToE18("100000" + "0".repeat(28), 8), "100000" + E18);
  assert.equal(priceToE18("3000" + E18, 18), "3000" + E18);
});

test("a listing scales each row by its branch; a timeline by its top-level decimals", () => {
  const list = scaleSpAnswer({
    branches: { WBTC: { open: 1, closed: 0, coll_decimals: 8 }, weETH: { open: 1, closed: 0, coll_decimals: 18 } },
    rows: [
      { collateral_type: "WBTC", stash_raw: "5", coll_gain_raw: "7", coll_claimed_raw: "2", deposit_raw: "9" },
      { collateral_type: "weETH", stash_raw: "5", coll_gain_raw: "7", coll_claimed_raw: "2", deposit_raw: "9" },
    ],
  });
  assert.equal(list.rows[0].stash_raw, "50000000000");
  assert.equal(list.rows[0].deposit_raw, "9");
  assert.equal(list.rows[1].stash_raw, "5");
  const tl = scaleSpAnswer({
    coll_decimals: 8,
    rows: [{ coll_gain_since: "3", stash_after: "0", deposit_after: "4" }],
    position: { stash_raw: "1", coll_gain_raw: "1", coll_claimed_raw: "0", deposit_raw: "4" },
  });
  assert.equal(tl.rows[0].coll_gain_since, "30000000000");
  assert.equal(tl.rows[0].deposit_after, "4");
  assert.equal(tl.position.stash_raw, "10000000000");
  const days = scaleSpAnswer({ coll_decimals: 8, days: [{ coll_in: "2", stash: "1", deposit: "3" }] });
  assert.deepEqual(days.days[0], { coll_in: "20000000000", stash: "10000000000", deposit: "3" });
  // Liquity V2's answers carry no decimals and pass untouched.
  const v2 = scaleSpAnswer({ rows: [{ collateral_type: "WETH", stash_raw: "5" }], branches: { WETH: {} } });
  assert.equal(v2.rows[0].stash_raw, "5");
});

test("a second pass leaves a scaled answer as it is", () => {
  const once = scaleSpAnswer({
    coll_decimals: 8,
    rows: [{ coll_gain_since: "3" }],
    position: { stash_raw: "1" },
    branches: { WBTC: { open: 1, closed: 0, coll_decimals: 8 } },
  });
  const twice = scaleSpAnswer(structuredClone(once));
  assert.deepEqual(twice, once);
  assert.equal(twice.rows[0].coll_gain_since, "30000000000");
  assert.equal(twice.position.stash_raw, "10000000000");
  assert.equal("coll_decimals" in twice, false);
  assert.equal("coll_decimals" in twice.branches.WBTC, false);
  const list = scaleSpAnswer({
    branches: { WBTC: { open: 1, closed: 0, coll_decimals: 8 } },
    rows: [{ collateral_type: "WBTC", stash_raw: "5" }],
  });
  assert.equal(scaleSpAnswer(list).rows[0].stash_raw, "50000000000");
});

test("the index and the chain, both scaled, agree: the index-lag line stays away", () => {
  const position = {
    deposited_raw: "100",
    withdrawn_raw: "0",
    burned_raw: "0",
    yield_gain_raw: "0",
    yield_claimed_raw: "0",
    coll_gain_raw: "3",
    coll_claimed_raw: "0",
    deposit_raw: "100",
    stash_raw: toE18("3", 8),
  };
  const chain = {
    compoundedRaw: "100",
    recordedRaw: "100",
    collGainRaw: "0",
    stashRaw: toE18("3", 8),
    yieldGainRaw: "0",
  };
  assert.notEqual(depositNow(depositLifetime(position), chain), null);
});

test("a liquidations answer: collateral to 1e18, the 1e(36 − d) price to 1e18, the value unchanged", () => {
  // Ebisu LBTC, block 23,823,314: the wire's figures (rails-server 8536cc5c).
  const liq = {
    coll_gained: "53374",
    pool_coll_sent: "5000000",
    price: "900964683868400000000000000000000",
    coll_gained_value: "480880000000000000000",
    bold_lost: "1",
    net: "0",
  };
  const a = scaleSpAnswer({
    coll_decimals: 8,
    coll_withdrawn_at_block: "26238016",
    units: { bold: "1e18 BOLD", coll: "1e8 LBTC", price: "1e28 BOLD per LBTC" },
    totals: { coll_gained: "53374", coll_gained_value: "1", bold_lost: "1", net: "0", liquidations: 1 },
    stretches: [
      {
        to: { coll_gain_since: "53374", deposit_loss: "9" },
        totals: { coll_gained: "53374" },
        residual: { bold_lost: "0", coll_gained: "-2" },
        liquidations: [{ ...liq }],
      },
    ],
    since_last_touch: { to: null, totals: { coll_gained: "7" }, residual: null, liquidations: [{ ...liq }] },
  });
  const l = a.stretches[0].liquidations[0];
  assert.equal(l.coll_gained, "533740000000000");
  assert.equal(l.pool_coll_sent, "50000000000000000");
  assert.equal(l.price, "90096468386840000000000");
  assert.equal(l.coll_gained_value, liq.coll_gained_value);
  // coll × price / 1e18 is the same stablecoin figure before and after.
  assert.equal(
    (BigInt(l.coll_gained) * BigInt(l.price)) / BigInt(10) ** BigInt(18),
    (BigInt(liq.coll_gained) * BigInt(liq.price)) / BigInt(10) ** BigInt(18),
  );
  assert.equal(a.stretches[0].to.coll_gain_since, "533740000000000");
  assert.equal(a.stretches[0].to.deposit_loss, "9");
  assert.equal(a.stretches[0].residual.coll_gained, "-20000000000");
  assert.equal(a.since_last_touch.totals.coll_gained, "70000000000");
  assert.equal(a.totals.coll_gained, "533740000000000");
  // Twice is once.
  assert.deepEqual(scaleSpAnswer(structuredClone(a)), a);
});

const { statedWithdrawalBlock, closedAfterWithdrawal, spLiquidationNotes } = await import(
  ROOT + "lib/liquity-v2/sp-liquidations.ts"
);

test("the page states the withdrawal only where the record names the answer's block", () => {
  assert.equal(statedWithdrawalBlock("26238016", 26238016), 26238016);
  // A record that differs, or none, states nothing and hides nothing.
  assert.equal(statedWithdrawalBlock("26238017", 26238016), undefined);
  assert.equal(statedWithdrawalBlock("26238016", undefined), undefined);
  assert.equal(statedWithdrawalBlock(undefined, 26238016), undefined);
});

test("only a stretch closed at or after the withdrawal block loses its unsettled mark", () => {
  const stretch = (toBlock) => ({
    from: { event_key: "a", block_number: "100", block_timestamp: "1", tx_hash: "0x1", deposit: "1" },
    to: {
      event_key: "b",
      block_number: String(toBlock),
      block_timestamp: "2",
      tx_hash: "0x2",
      deposit_loss: "1",
      coll_gain_since: "0",
    },
    liquidations: [],
    totals: { bold_lost: "0", coll_gained: "0", coll_gained_value: "0", net: "0" },
    residual: { bold_lost: "1", coll_gained: "0" },
    reconciles: false,
  });
  const read = {
    coll_withdrawn_at_block: "26238016",
    branch_check: { deposits: "1", closed_stretches: "3", unreconciled: "0" },
    stretches: [stretch(26238015), stretch(26238016), stretch(26238020)],
  };
  const dep = { id: "ebisu", stable: { symbol: "ebUSD", address: "0x" } };
  const stated = spLiquidationNotes(
    "LBTC",
    "0xpool",
    read,
    dep,
    statedWithdrawalBlock(read.coll_withdrawn_at_block, 26238016),
  );
  assert.deepEqual(stated.map(closedAfterWithdrawal), [false, true, true]);
  assert.equal(stated[0].unitLabel, "ebUSD");
  // No record to state the withdrawal: nothing is exempt.
  const unstated = spLiquidationNotes(
    "LBTC",
    "0xpool",
    read,
    dep,
    statedWithdrawalBlock(read.coll_withdrawn_at_block, undefined),
  );
  assert.deepEqual(unstated.map(closedAfterWithdrawal), [false, false, false]);
});
